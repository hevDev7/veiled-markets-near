// Stands in for @provablehq/aleo-wallet-adaptor-react (aliased in vite.config.ts and tsconfig.json): the same
// provider and hook the pages already use, backed by NEAR Connect. `address` is the NEAR account id.
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { currentWalletName, openWalletModal, signOut, watchAccount } from '../near-wallet';
import { noteKeys } from '../private';
import { executeAleoCall, type AleoCall } from '../executor';
import { walletRecordObjects } from '../wallet-records';

export interface CompatWallet {
  adapter: { name: string; readyState: string };
}

export interface WalletContextValue {
  address: string | null;
  publicKey: string | null;
  connected: boolean;
  connecting: boolean;
  disconnecting: boolean;
  wallet: CompatWallet | null;
  wallets: CompatWallet[];
  network: string;
  select: (name?: string) => void;
  selectWallet: (name?: string) => void;
  connect: (...args: unknown[]) => Promise<void>;
  disconnect: () => Promise<void>;
  /** Deterministic per account, derived from the private-balance key (one wallet signature unlocks both). */
  signMessage: (message: string | Uint8Array) => Promise<string>;
  executeTransaction: (call: AleoCall) => Promise<{ transactionId: string }>;
  transactionStatus: (id: string) => Promise<{ status: string; transactionId: string }>;
  /** The account's private notes for an Aleo program id, as the record objects the Aleo adapters returned. */
  requestRecords: (program: string, plaintext?: boolean) => Promise<unknown[]>;
  requestRecordPlaintexts: (program: string) => Promise<unknown[]>;
  decrypt: (text: string) => Promise<string>;
}

const Ctx = createContext<WalletContextValue | null>(null);

const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, '0')).join('');

async function derivedSignature(message: string | Uint8Array): Promise<string> {
  const keys = await noteKeys();
  const text = typeof message === 'string' ? message : new TextDecoder().decode(message);
  const data = new TextEncoder().encode(`veiled-near-sign:${keys.sk}:${text}`);
  return hex(await crypto.subtle.digest('SHA-256', data));
}

/** Props of the Aleo provider (wallets, network, programs…) are accepted and ignored. */
export function AleoWalletProvider({ children }: { children?: ReactNode } & Record<string, unknown>) {
  const [address, setAddress] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [walletName, setWalletName] = useState('');

  useEffect(() => {
    let alive = true;
    let unsub: (() => void) | undefined;
    watchAccount((acct) => {
      if (!alive) return;
      setAddress(acct);
      setReady(true);
      currentWalletName()
        .then((n) => alive && setWalletName(n ?? ''))
        .catch(() => undefined);
    })
      .then((u) => {
        if (alive) unsub = u;
        else u();
      })
      .catch((err) => {
        console.error('[wallet] NEAR Connect failed to start', err);
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
      unsub?.();
    };
  }, []);

  const value = useMemo<WalletContextValue>(
    () => ({
      address,
      publicKey: address,
      connected: !!address,
      connecting: !ready,
      disconnecting: false,
      wallet: address ? { adapter: { name: walletName || 'NEAR Wallet', readyState: 'Installed' } } : null,
      wallets: [],
      network: 'testnet',
      select: () => undefined,
      selectWallet: () => undefined,
      connect: async () => openWalletModal(),
      disconnect: async () => signOut(),
      signMessage: derivedSignature,
      executeTransaction: async (call) => ({ transactionId: (await executeAleoCall(call)).transactionId }),
      transactionStatus: async (id) => ({ status: 'Finalized', transactionId: id }),
      requestRecords: async (program) => (address ? walletRecordObjects(program) : []),
      requestRecordPlaintexts: async (program) => (address ? walletRecordObjects(program) : []),
      decrypt: async (text) => text,
    }),
    [address, ready, walletName],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet(): WalletContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useWallet must be used inside <AleoWalletProvider>');
  return v;
}
