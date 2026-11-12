// NEAR Wallet Selector glue (Meteor Wallet on testnet), loaded lazily. Public actions (deposits, market
// creation, bonded votes, claims) are signed here by the user's own account; private actions never come through
// this file: they are proven in the browser and submitted by the relayer (./private.ts).
import type { Wallet, WalletSelector, WalletSelectorState } from '@near-wallet-selector/core';
import type { WalletSelectorModal } from '@near-wallet-selector/modal-ui';
import { GAS_DEFAULT, VEILED_CONTRACT } from './config';
import { decodeReturn, failureText, invalidateViews, outcomeFailure, txStatus, type TxOutcome } from './rpc';

let selectorPromise: Promise<WalletSelector> | null = null;
let modalPromise: Promise<WalletSelectorModal> | null = null;

export function getSelector(): Promise<WalletSelector> {
  if (!selectorPromise) {
    const attempt = (async () => {
      const [{ setupWalletSelector }, { setupMeteorWallet }] = await Promise.all([
        import('@near-wallet-selector/core'),
        import('@near-wallet-selector/meteor-wallet'),
      ]);
      // Meteor is the only wallet offered for now: it is the one the private balance flow has been run with.
      return setupWalletSelector({ network: 'testnet', modules: [setupMeteorWallet()] });
    })();
    attempt.catch(() => {
      if (selectorPromise === attempt) selectorPromise = null;
    });
    selectorPromise = attempt;
  }
  return selectorPromise;
}

async function getModal(): Promise<WalletSelectorModal> {
  if (!modalPromise) {
    const attempt = (async () => {
      const selector = await getSelector();
      const { setupModal } = await import('@near-wallet-selector/modal-ui');
      await import('@near-wallet-selector/modal-ui/styles.css');
      return setupModal(selector, { contractId: VEILED_CONTRACT, theme: 'dark' });
    })();
    attempt.catch(() => {
      if (modalPromise === attempt) modalPromise = null;
    });
    modalPromise = attempt;
  }
  return modalPromise;
}

const activeFrom = (s: WalletSelectorState): string | null =>
  s.accounts.find((a) => a.active)?.accountId ?? s.accounts[0]?.accountId ?? null;

export async function currentAccountId(): Promise<string | null> {
  return activeFrom((await getSelector()).store.getState());
}

export async function currentWalletName(): Promise<string | null> {
  const s = await getSelector();
  const id = s.store.getState().selectedWalletId;
  return s.store.getState().modules.find((m) => m.id === id)?.metadata.name ?? id ?? null;
}

export async function openWalletModal(): Promise<void> {
  (await getModal()).show();
}

export async function signOut(): Promise<void> {
  const s = await getSelector();
  if (!s.isSignedIn()) return;
  await (await s.wallet()).signOut();
}

/** Calls `cb` with the active account whenever it changes. Resolves with an unsubscribe function. */
export async function watchAccount(cb: (accountId: string | null) => void): Promise<() => void> {
  const s = await getSelector();
  let last = activeFrom(s.store.getState());
  cb(last);
  const sub = s.store.observable.subscribe((state) => {
    const next = activeFrom(state);
    if (next !== last) {
      last = next;
      cb(next);
    }
  });
  return () => sub.unsubscribe();
}

export class WalletError extends Error {
  constructor(message: string, readonly code?: string, readonly txHash?: string) {
    super(message);
    this.name = 'WalletError';
  }
}

export interface CallResult {
  txHash: string;
  value: unknown;
  signerId: string;
}

/** Signs and sends one function call with the connected wallet; resolves when it has executed. */
export async function callContract(opts: {
  method: string;
  args: object;
  deposit?: bigint;
  gas?: bigint;
  contractId?: string;
}): Promise<CallResult> {
  const selector = await getSelector();
  const signerId = activeFrom(selector.store.getState());
  if (!signerId) throw new WalletError('Connect a NEAR wallet first.');
  const [{ actionCreators }, wallet] = await Promise.all([import('@near-js/transactions'), selector.wallet()]);
  const receiverId = opts.contractId ?? VEILED_CONTRACT;
  let heardHash: string | null = null;
  const onMessage = (e: MessageEvent) => {
    const h = (e.data as { transactionHashes?: string } | null)?.transactionHashes;
    if (typeof h === 'string' && /^[A-Za-z0-9,]+$/.test(h)) heardHash = h.split(',').pop() ?? heardHash;
  };
  window.addEventListener('message', onMessage);
  let outcome: unknown;
  try {
    outcome = await wallet.signAndSendTransaction({
      signerId,
      receiverId,
      actions: [actionCreators.functionCall(opts.method, opts.args, opts.gas ?? GAS_DEFAULT, opts.deposit ?? 0n)],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new WalletError(/reject|cancel|closed/i.test(msg) ? 'The wallet request was cancelled.' : failureText(msg), failureText(msg));
  } finally {
    window.removeEventListener('message', onMessage);
  }
  const o = outcome as Partial<TxOutcome> | undefined | null;
  const txHash = o?.transaction_outcome?.id ?? o?.transaction?.hash ?? heardHash;
  if (!txHash) throw new WalletError('The wallet returned without a transaction hash. Check your wallet activity.');
  // The wallet's answer may predate execution: confirm through the RPC.
  let final: TxOutcome = o as TxOutcome;
  if (!o?.receipts_outcome?.length || typeof o.status !== 'object') {
    for (let i = 0; i < 10; i++) {
      try {
        final = await txStatus(txHash, signerId);
        if (typeof final.status === 'object') break;
      } catch {
        /* not indexed yet */
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  invalidateViews();
  const failed = outcomeFailure(final);
  if (failed) throw new WalletError(failed, failed, txHash);
  return { txHash, value: decodeReturn(final), signerId };
}

/** NEP-413 signature over a fixed message (deterministic for the same key), base64. */
export async function signMessage(message: string, nonce: Uint8Array): Promise<{ signature: string; publicKey: string }> {
  const selector = await getSelector();
  return signMessageWith(await selector.wallet(), message, nonce);
}

/** `signMessage` on a given wallet of the selector. */
export async function signMessageWith(
  wallet: Wallet,
  message: string,
  nonce: Uint8Array,
): Promise<{ signature: string; publicKey: string }> {
  if (!('signMessage' in wallet) || typeof wallet.signMessage !== 'function') {
    throw new WalletError('This wallet cannot sign messages.', 'SIGN_UNSUPPORTED');
  }
  const signed = await wallet.signMessage({
    message,
    recipient: VEILED_CONTRACT,
    // The selector refuses anything but a Buffer of 32 bytes before the wallet is asked, and it tests against the
    // global Buffer (the one boot.ts installs), so a plain Uint8Array with the same bytes never got through.
    nonce: Buffer.from(nonce),
  });
  if (!signed || !signed.signature) throw new WalletError('The wallet returned no signature.');
  return { signature: signed.signature, publicKey: String(signed.publicKey) };
}
