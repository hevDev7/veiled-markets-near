// NEAR Connect glue (testnet). Public actions (deposits, market creation, bonded votes, claims) are signed here by
// the user's own account; private actions never come through this file: they are proven in the browser and
// submitted by the relayer (./private.ts).
//
// NEAR Connect runs every wallet in a sandboxed iframe and starts a fresh one for each request, so the connected
// account is kept here and only asked of the wallet once per page load.
//
// The wallet list is built into the app (wallet-manifest.json) rather than fetched from NEAR Connect's GitHub list
// on every load: it holds only Meteor Wallet, the wallet tested with private balances, whose key comes from the
// wallet's signature. The entry is copied unchanged from NEAR Connect's repository/manifest.json (list 1.1.0,
// Meteor 1.1.1, 2026-11-14); its executor is still Meteor's own published code.
import { NearConnector, type DataStorage, type NearConnectorOptions, type NearWalletBase } from '@hot-labs/near-connect';
import { GAS_DEFAULT, NEAR_NETWORK, VEILED_CONTRACT } from './config';
import { decodeReturn, failureText, invalidateViews, outcomeFailure, txStatus, type TxOutcome } from './rpc';
import walletManifest from './wallet-manifest.json';

/** How long a page load waits for the wallet to confirm the saved session before carrying on signed out. */
const RESTORE_WAIT_MS = 10_000;
/** How long sign-out waits for the wallet's own sign-out; the session here ends at once either way. */
const SIGN_OUT_WAIT_MS = 5_000;

/**
 * NEAR Connect's key-value store, in this page's localStorage, without its "debug-wallets" key: a manifest pasted
 * into the wallet list's settings would otherwise be listed, and trusted, on every visit.
 */
const connectorStorage: DataStorage = {
  async get(key) {
    if (key === 'debug-wallets' || typeof localStorage === 'undefined') return null;
    return localStorage.getItem(key);
  },
  async set(key, value) {
    if (key === 'debug-wallets' || typeof localStorage === 'undefined') return;
    localStorage.setItem(key, value);
  },
  async remove(key) {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(key);
  },
};

interface Session {
  wallet: NearWalletBase | null;
  accountId: string | null;
}

let session: Session = { wallet: null, accountId: null };
/** Counts sign-ins and sign-outs, so a session restore that answers after one of them cannot undo it. */
let changes = 0;
const watchers = new Set<(accountId: string | null) => void>();
let started: { connector: NearConnector; restored: Promise<void> } | null = null;

function setSession(next: Session) {
  const before = session.accountId;
  session = next;
  if (next.accountId !== before) for (const cb of [...watchers]) cb(next.accountId);
}

/**
 * The nonce Caddy writes into index.html for this response. Each wallet's iframe is a srcdoc document with inline
 * scripts, and it inherits this page's CSP, so those scripts must carry the nonce. The dev server sends no CSP and
 * leaves the template unrendered.
 */
function pageNonce(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const nonce = document.querySelector<HTMLMetaElement>('meta[property="csp-nonce"]')?.nonce;
  return nonce && /^[A-Za-z0-9+/=]{16,}$/.test(nonce) ? nonce : undefined;
}

function start() {
  if (started) return started;
  const connector = new NearConnector({
    network: NEAR_NETWORK,
    // NEAR Connect's types list `platform` as an array; the published manifest has an object, kept as published.
    manifest: walletManifest as unknown as NearConnectorOptions['manifest'],
    // Only wallets that can sign the private-balance key message (NEP-413) and send the public actions.
    features: { signMessage: true, signAndSendTransaction: true },
    storage: connectorStorage,
    // A wallet another window announces by postMessage is never connected on its own (this app is never framed).
    autoConnect: false,
    cspNonce: pageNonce(),
  });
  // The list's settings can add a wallet from a pasted manifest; that wallet would get this page's storage keys.
  connector.registerDebugWallet = async () => {
    throw new Error('Adding wallets is turned off in this app.');
  };
  connector.on('wallet:signIn', ({ wallet, accounts }) => {
    changes++;
    setSession({ wallet, accountId: accounts[0]?.accountId ?? null });
  });
  connector.on('wallet:signOut', () => {
    changes++;
    setSession({ wallet: null, accountId: null });
  });
  const at = changes;
  const answer = connector.getConnectedWallet().then(
    ({ wallet, accounts }) => {
      if (changes === at) setSession({ wallet, accountId: accounts[0]?.accountId ?? null });
    },
    () => undefined, // nobody signed in, or the wallet could not be reached
  );
  // A wallet whose code never loads must not hold up the page: carry on signed out and take a late answer.
  const restored = new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, RESTORE_WAIT_MS);
    void answer.then(() => {
      clearTimeout(timer);
      resolve();
    });
  });
  started = { connector, restored };
  return started;
}

async function restoredSession(): Promise<Session> {
  await start().restored;
  return session;
}

export async function currentAccountId(): Promise<string | null> {
  return (await restoredSession()).accountId;
}

export async function currentWalletName(): Promise<string | null> {
  return (await restoredSession()).wallet?.manifest.name ?? null;
}

const isCancel = (text: string) => /reject|cancel|closed/i.test(text);

/** Message of whatever a wallet rejected with: the iframe passes plain objects and strings as well as errors. */
function errorText(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  const message = (err as { message?: unknown } | null)?.message;
  if (typeof message === 'string') return message;
  try {
    return JSON.stringify(err) ?? String(err);
  } catch {
    return String(err);
  }
}

/** Shows the wallet list. Resolves once the chosen wallet has signed in, or quietly when the list is closed. */
export async function openWalletModal(): Promise<void> {
  try {
    await start().connector.connect();
  } catch (err) {
    if (isCancel(errorText(err))) return;
    throw err;
  }
}

/**
 * Ends the session here at once, then tells the wallet. A wallet whose code fails or never loads cannot keep anyone
 * signed in: the saved choice is removed first, so a reload stays signed out too.
 */
export async function signOut(): Promise<void> {
  start();
  const wallet = session.wallet;
  changes++;
  setSession({ wallet: null, accountId: null });
  await connectorStorage.remove('selected-wallet');
  if (!wallet) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    wallet.signOut({ network: NEAR_NETWORK }).catch(() => undefined),
    new Promise<void>((resolve) => (timer = setTimeout(resolve, SIGN_OUT_WAIT_MS))),
  ]);
  clearTimeout(timer);
}

/** Calls `cb` with the active account now and whenever it changes. Resolves with an unsubscribe function. */
export async function watchAccount(cb: (accountId: string | null) => void): Promise<() => void> {
  cb((await restoredSession()).accountId);
  watchers.add(cb);
  return () => {
    watchers.delete(cb);
  };
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
  const { wallet, accountId: signerId } = await restoredSession();
  if (!wallet || !signerId) throw new WalletError('Connect a NEAR wallet first.');
  let outcome: unknown;
  try {
    outcome = await wallet.signAndSendTransaction({
      signerId,
      receiverId: opts.contractId ?? VEILED_CONTRACT,
      actions: [
        {
          type: 'FunctionCall',
          params: {
            methodName: opts.method,
            args: opts.args,
            gas: String(opts.gas ?? GAS_DEFAULT),
            deposit: String(opts.deposit ?? 0n),
          },
        },
      ],
    });
  } catch (err) {
    const text = errorText(err);
    throw new WalletError(isCancel(text) ? 'The wallet request was cancelled.' : failureText(text), failureText(text));
  }
  const o = outcome as Partial<TxOutcome> | undefined | null;
  const txHash = o?.transaction_outcome?.id ?? o?.transaction?.hash;
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

/** Whether the connected wallet signs NEP-366 delegate actions (gasless deposits through the relayer). */
export async function canSignDelegate(): Promise<boolean> {
  const { wallet, accountId } = await restoredSession();
  return !!accountId && wallet?.manifest?.features?.signDelegateActions === true;
}

/** The sender id at the start of a base64 SignedDelegate (borsh: u32 length, then the id); null if unreadable. */
function delegateSender(b64: string): string | null {
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
  if (bytes.length < 5) return null;
  const n = bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24);
  if (n < 2 || n > 64 || 4 + n > bytes.length) return null;
  return new TextDecoder().decode(bytes.subarray(4, 4 + n));
}

/**
 * Signs one function call as a NEP-366 delegate action of the connected account, for the relayer to submit and
 * pay for. Resolves with the base64 SignedDelegate as the wallet gave it.
 */
export async function signDelegate(opts: {
  contractId: string;
  method: string;
  args: object;
  gas: bigint;
  deposit: bigint;
}): Promise<string> {
  const { wallet, accountId: signerId } = await restoredSession();
  if (!wallet || !signerId) throw new WalletError('Connect a NEAR wallet first.');
  if (wallet.manifest?.features?.signDelegateActions !== true) {
    throw new WalletError('This wallet cannot sign delegate actions.', 'DELEGATE_UNSUPPORTED');
  }
  let answer: unknown;
  try {
    answer = await wallet.signDelegateActions({
      signerId,
      network: NEAR_NETWORK,
      delegateActions: [
        {
          receiverId: opts.contractId,
          actions: [
            {
              type: 'FunctionCall',
              params: { methodName: opts.method, args: opts.args, gas: String(opts.gas), deposit: String(opts.deposit) },
            },
          ],
        },
      ],
    });
  } catch (err) {
    const text = errorText(err);
    throw new WalletError(isCancel(text) ? 'The wallet request was cancelled.' : failureText(text), failureText(text));
  }
  const signed = (answer as { signedDelegateActions?: unknown } | null)?.signedDelegateActions;
  if (!Array.isArray(signed) || signed.length !== 1 || typeof signed[0] !== 'string') {
    throw new WalletError('The wallet returned no signed delegate action.');
  }
  const sender = delegateSender(signed[0]);
  if (sender === null) throw new WalletError('The wallet returned a signed delegate action in a form this app cannot use.');
  // The relayer would submit it for whichever account signed: the tokens must come from the connected one.
  if (sender !== signerId) {
    throw new WalletError(
      `The wallet signed as ${sender}, but ${signerId} is connected here. Sign out, then connect the account you want to use.`,
    );
  }
  return signed[0];
}

/** NEP-413 signature over a fixed message (deterministic for the same key), base64. */
export async function signMessage(message: string, nonce: Uint8Array): Promise<{ signature: string; publicKey: string }> {
  const { wallet, accountId } = await restoredSession();
  if (!wallet || !accountId) throw new WalletError('Connect a NEAR wallet first.');
  return signMessageWith(wallet, message, nonce, accountId);
}

/** Bytes in a base64 string; -1 if it is not base64. */
function base64Length(text: string): number {
  try {
    return atob(text).length;
  } catch {
    return -1;
  }
}

/** `signMessage` on a given NEAR Connect wallet, which must sign as `accountId` when one is given. */
export async function signMessageWith(
  wallet: NearWalletBase,
  message: string,
  nonce: Uint8Array,
  accountId?: string,
): Promise<{ signature: string; publicKey: string }> {
  // Only a wallet that says it cannot sign falls back to a key kept in the browser (notes/keys.ts); any other
  // failure is reported, so a key never silently stops coming from the wallet.
  if (wallet.manifest?.features?.signMessage === false) {
    throw new WalletError('This wallet cannot sign messages.', 'SIGN_UNSUPPORTED');
  }
  const signed = await wallet.signMessage({ message, recipient: VEILED_CONTRACT, nonce: new Uint8Array(nonce) });
  if (!signed || !signed.signature) throw new WalletError('The wallet returned no signature.');
  // The private-balance key is derived from these bytes, so they must be the connected account's 64-byte ed25519
  // signature in base64; anything else would make a key that no other browser derives for this account.
  if (accountId && signed.accountId && signed.accountId !== accountId) {
    throw new WalletError(
      `The wallet signed as ${signed.accountId}, but ${accountId} is connected here. ` +
        `Sign out, then connect the account you want to use.`,
    );
  }
  if (base64Length(signed.signature) !== 64) {
    throw new WalletError('The wallet returned a signature in a form this app cannot use.');
  }
  return { signature: signed.signature, publicKey: String(signed.publicKey) };
}
