// ============================================================================
// Leo Wallet Adapter
// ============================================================================
// Wraps the `window.leoWallet` / `window.leo` API. Leo Wallet is one of
// the original Aleo wallets and uses a slightly older API shape than
// Shield/Puzzle. This adapter normalizes it to the common WalletAdapter
// interface.
//
// Note: Leo Wallet historically has trouble with deeply-nested program
// imports (4+ level chains). Simple tx like buy_up_down work fine, but
// complex governance flows may need Shield or Puzzle instead.
// ============================================================================

import type {
  WalletAdapter,
  WalletConnectionResult,
  TransactionRequestParams,
  TransactionResult,
  NetworkType,
} from '../types';

interface LeoWindowGlobal {
  connect?: (permission: string) => Promise<{ address: string }>;
  disconnect?: () => Promise<void>;
  signMessage?: (message: Uint8Array | string) => Promise<{ signature: string }>;
  requestTransaction?: (tx: {
    programId: string;
    functionName: string;
    inputs: string[];
    fee: number;
    privateFee?: boolean;
  }) => Promise<string>;
  requestRecords?: (programId: string) => Promise<unknown>;
  account?: { address: string };
}

export function detectLeo(): LeoWindowGlobal | null {
  if (typeof globalThis === 'undefined') return null;
  const g = globalThis as { leoWallet?: LeoWindowGlobal; leo?: LeoWindowGlobal };
  return g.leoWallet ?? g.leo ?? null;
}

export class LeoWalletAdapter implements WalletAdapter {
  readonly name = 'Leo';
  readonly icon = 'https://leo.app/icon.png';
  readonly url = 'https://leo.app';

  private readonly w: LeoWindowGlobal;

  constructor(override?: LeoWindowGlobal) {
    const detected = override ?? detectLeo();
    if (!detected) {
      throw new Error('Leo Wallet not detected. Install from https://leo.app');
    }
    this.w = detected;
  }

  async connect(): Promise<WalletConnectionResult> {
    if (!this.w.connect) throw new Error('Leo Wallet does not expose connect()');
    const r = await this.w.connect('VIEW_ACCOUNT');
    return {
      address: r.address,
      publicKey: r.address,
      network: 'testnet', // Leo doesn't explicitly report network in its API
    };
  }

  async disconnect(): Promise<void> {
    if (this.w.disconnect) await this.w.disconnect();
  }

  async signMessage(message: string): Promise<string> {
    if (!this.w.signMessage) throw new Error('Leo Wallet does not support signMessage');
    const r = await this.w.signMessage(message);
    return r.signature;
  }

  async requestTransaction(params: TransactionRequestParams): Promise<TransactionResult> {
    if (!this.w.requestTransaction) {
      throw new Error('Leo Wallet has no requestTransaction API');
    }
    const feeNum = typeof params.fee === 'bigint' ? Number(params.fee) : params.fee;
    const txId = await this.w.requestTransaction({
      programId: params.programId,
      functionName: params.functionName,
      inputs: params.inputs,
      fee: feeNum,
      privateFee: params.privateFee ?? false,
    });
    return { transactionId: txId, status: 'pending' };
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

  onAccountChange(_callback: (address: string | null) => void): void {
    // Leo Wallet has no account-change event
  }

  onNetworkChange(_callback: (network: NetworkType) => void): void {
    // Leo Wallet has no network-change event
  }
}
