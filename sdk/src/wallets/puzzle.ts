// ============================================================================
// Puzzle Wallet Adapter
// ============================================================================
// Wraps the `window.puzzle` API exposed by the Puzzle Wallet extension.
// Puzzle is a browser wallet for Aleo that supports tx broadcasting and
// record scanning. API shape is similar to Shield but with slightly
// different method names (createRequestEvent vs requestTransaction).
// ============================================================================

import type {
  WalletAdapter,
  WalletConnectionResult,
  TransactionRequestParams,
  TransactionResult,
  NetworkType,
} from '../types';

interface PuzzleWindowGlobal {
  connect?: (opts?: { dAppInfo?: unknown; permissions?: unknown }) => Promise<{ address: string }>;
  disconnect?: () => Promise<void>;
  signMessage?: (message: string) => Promise<{ signature: string }>;
  createRequestEvent?: (event: {
    type: 'Execute';
    programId: string;
    functionId: string;
    inputs: string[];
    fee: number;
    feePrivate?: boolean;
  }) => Promise<{ eventId: string }>;
  requestTransaction?: (params: unknown) => Promise<string | { transactionId: string }>;
  requestRecords?: (programId: string) => Promise<unknown>;
  network?: string;
}

export function detectPuzzle(): PuzzleWindowGlobal | null {
  if (typeof globalThis === 'undefined') return null;
  const g = globalThis as { puzzle?: PuzzleWindowGlobal };
  return g.puzzle ?? null;
}

/**
 * PuzzleWalletAdapter — implements the `WalletAdapter` interface.
 *
 * Puzzle uses an event-based API (`createRequestEvent`) internally but
 * this adapter normalizes it to the same `requestTransaction` shape used
 * across all wallet adapters in the SDK.
 */
export class PuzzleWalletAdapter implements WalletAdapter {
  readonly name = 'Puzzle';
  readonly icon = 'https://puzzle.online/icon.png';
  readonly url = 'https://puzzle.online';

  private readonly w: PuzzleWindowGlobal;

  constructor(override?: PuzzleWindowGlobal) {
    const detected = override ?? detectPuzzle();
    if (!detected) {
      throw new Error(
        'Puzzle Wallet not detected. Install the extension from https://puzzle.online',
      );
    }
    this.w = detected;
  }

  async connect(): Promise<WalletConnectionResult> {
    if (!this.w.connect) throw new Error('Puzzle Wallet does not expose connect()');
    const r = await this.w.connect();
    return {
      address: r.address,
      publicKey: r.address,
      network: (this.w.network as NetworkType) ?? 'testnet',
    };
  }

  async disconnect(): Promise<void> {
    if (this.w.disconnect) await this.w.disconnect();
  }

  async signMessage(message: string): Promise<string> {
    if (!this.w.signMessage) {
      throw new Error('Puzzle Wallet does not support signMessage');
    }
    const r = await this.w.signMessage(message);
    return r.signature;
  }

  async requestTransaction(params: TransactionRequestParams): Promise<TransactionResult> {
    // Puzzle's `createRequestEvent` uses `Execute` type for contract calls.
    // Fee is expected as a number (microcredits).
    const feeNum = typeof params.fee === 'bigint' ? Number(params.fee) : params.fee;

    // Try createRequestEvent first (Puzzle's native API)
    if (this.w.createRequestEvent) {
      const r = await this.w.createRequestEvent({
        type: 'Execute',
        programId: params.programId,
        functionId: params.functionName,
        inputs: params.inputs,
        fee: feeNum,
        feePrivate: params.privateFee ?? false,
      });
      return {
        transactionId: r.eventId,
        status: 'pending',
      };
    }

    // Fallback: requestTransaction shim
    if (this.w.requestTransaction) {
      const r = await this.w.requestTransaction({
        programId: params.programId,
        functionName: params.functionName,
        inputs: params.inputs,
        fee: feeNum,
        privateFee: params.privateFee ?? false,
      });
      const txId = typeof r === 'string' ? r : r.transactionId;
      return { transactionId: txId, status: 'pending' };
    }

    throw new Error('Puzzle Wallet has no compatible tx submission API');
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
    // Puzzle does not expose a public account-change event at this time
  }

  onNetworkChange(_callback: (network: NetworkType) => void): void {
    // Puzzle does not expose a public network-change event at this time
  }
}
