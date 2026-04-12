// ============================================================================
// Shield Wallet Adapter
// ============================================================================
// Wraps the `window.shield` extension API. Shield is the primary wallet
// supported by Veiled Markets and handles the private credits record
// selection flow for buy_shares_private / buy_up_down transitions.
//
// The Shield extension installs `window.shield` when the user visits a
// page that requests wallet access. Call `detectShield()` to check
// whether it's present before constructing the adapter.
// ============================================================================

import type {
  WalletAdapter,
  WalletConnectionResult,
  TransactionRequestParams,
  TransactionResult,
  NetworkType,
} from '../types';

/**
 * Shape of the `window.shield` global exposed by the Shield extension.
 * Kept minimal — only the methods this adapter actually calls.
 */
interface ShieldWindowGlobal {
  connect: (opts?: { forceReconnect?: boolean }) => Promise<{ address: string; publicKey?: string }>;
  disconnect?: () => Promise<void>;
  signMessage?: (message: string) => Promise<{ signature: string }>;
  requestTransaction: (params: {
    programId: string;
    functionName: string;
    inputs: string[];
    fee: number | bigint;
    privateFee?: boolean;
    recordIndices?: number[];
  }) => Promise<string | { transactionId: string }>;
  requestRecords?: (programId: string) => Promise<unknown>;
  onAccountChange?: (cb: (address: string | null) => void) => void;
  onNetworkChange?: (cb: (network: string) => void) => void;
  network?: NetworkType;
}

/**
 * Returns the `window.shield` global if the extension is installed,
 * null otherwise. Call this before constructing `ShieldWalletAdapter`.
 */
export function detectShield(): ShieldWindowGlobal | null {
  if (typeof globalThis === 'undefined') return null;
  const g = globalThis as { shield?: ShieldWindowGlobal; shieldWallet?: ShieldWindowGlobal };
  return g.shield ?? g.shieldWallet ?? null;
}

/**
 * ShieldWalletAdapter — implements the common `WalletAdapter` interface.
 *
 * Usage:
 *   const wallet = new ShieldWalletAdapter();
 *   const { address, network } = await wallet.connect();
 *   const result = await wallet.requestTransaction({
 *     programId: 'veiled_turbo_v8.aleo',
 *     functionName: 'buy_up_down',
 *     inputs: [marketId, '1u8', '1000000u128', '995000u128', nonce, creditsRecord],
 *     fee: 1_500_000n,   // 1.5 ALEO priority fee
 *   });
 */
export class ShieldWalletAdapter implements WalletAdapter {
  readonly name = 'Shield';
  readonly icon = 'https://shieldwallet.xyz/icon.png';
  readonly url = 'https://shieldwallet.xyz';

  private readonly w: ShieldWindowGlobal;

  constructor(override?: ShieldWindowGlobal) {
    const detected = override ?? detectShield();
    if (!detected) {
      throw new Error(
        'Shield Wallet not detected. Install the extension from https://shieldwallet.xyz',
      );
    }
    this.w = detected;
  }

  async connect(): Promise<WalletConnectionResult> {
    const r = await this.w.connect();
    return {
      address: r.address,
      publicKey: r.publicKey ?? r.address,
      network: (this.w.network as NetworkType) ?? 'testnet',
    };
  }

  async disconnect(): Promise<void> {
    if (this.w.disconnect) await this.w.disconnect();
  }

  async signMessage(message: string): Promise<string> {
    if (!this.w.signMessage) {
      throw new Error('Shield Wallet does not support signMessage in this version');
    }
    const r = await this.w.signMessage(message);
    return r.signature;
  }

  async requestTransaction(params: TransactionRequestParams): Promise<TransactionResult> {
    // Shield expects fee in microcredits (number or bigint). SDK callers
    // pass bigint, Shield itself may want number — keep it as bigint and
    // let the wallet coerce internally.
    const result = await this.w.requestTransaction({
      programId: params.programId,
      functionName: params.functionName,
      inputs: params.inputs,
      fee: params.fee,
      privateFee: params.privateFee ?? false,
    });
    const txId = typeof result === 'string' ? result : result.transactionId;
    return {
      transactionId: txId,
      status: 'pending',
    };
  }

  async getRecords(programId: string): Promise<unknown[]> {
    if (!this.w.requestRecords) return [];
    const r = await this.w.requestRecords(programId);
    if (Array.isArray(r)) return r;
    if (r && typeof r === 'object' && 'records' in r) {
      return (r as { records: unknown[] }).records;
    }
    return [];
  }

  onAccountChange(callback: (address: string | null) => void): void {
    if (this.w.onAccountChange) this.w.onAccountChange(callback);
  }

  onNetworkChange(callback: (network: NetworkType) => void): void {
    if (this.w.onNetworkChange) {
      this.w.onNetworkChange((n) => callback(n as NetworkType));
    }
  }
}
