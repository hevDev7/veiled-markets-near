// The one transport for NEAR JSON-RPC reads: failover across RPC_URLS, view calls decoded from JSON, and a short
// in-flight/TTL cache so the many components that read the same market share one request.
import { RPC_URLS, VEILED_CONTRACT } from './config';

export class RpcError extends Error {
  constructor(message: string, readonly terminal = false) {
    super(message);
    this.name = 'RpcError';
  }
}

/** A view the node executed but the contract rejected (a panic, a missing method). */
export class ViewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ViewError';
  }
}

const TERMINAL = new Set(['UNKNOWN_ACCOUNT', 'UNKNOWN_ACCESS_KEY', 'INVALID_ACCOUNT', 'UNKNOWN_TRANSACTION']);
let id = 0;
let preferred = 0;

export async function rpc<T>(method: string, params: unknown): Promise<T> {
  let last: unknown = null;
  for (let attempt = 0; attempt < RPC_URLS.length * 2; attempt++) {
    const idx = (preferred + attempt) % RPC_URLS.length;
    const url = RPC_URLS[idx];
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
      });
      if (!res.ok) throw new RpcError(`${url} answered ${res.status}`);
      const body = await res.json();
      if (body.error) {
        const cause = body.error?.cause?.name ?? body.error?.name;
        const err = new RpcError(`${cause ?? 'RPC error'}: ${JSON.stringify(body.error).slice(0, 300)}`, TERMINAL.has(cause));
        if (err.terminal) throw err;
        last = err;
        continue;
      }
      preferred = idx;
      return body.result as T;
    } catch (e) {
      if (e instanceof RpcError && e.terminal) throw e;
      last = e;
    }
  }
  throw last instanceof Error ? last : new RpcError('all NEAR RPC endpoints failed');
}

const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));

/** Calls a view method and returns its JSON result. */
export async function view<T>(method: string, args: object = {}, contract: string = VEILED_CONTRACT): Promise<T> {
  const r = await rpc<{ result?: number[]; error?: string }>('query', {
    request_type: 'call_function',
    finality: 'optimistic',
    account_id: contract,
    method_name: method,
    args_base64: b64(JSON.stringify(args)),
  });
  if (r.error) throw new ViewError(r.error);
  const text = new TextDecoder().decode(Uint8Array.from(r.result ?? []));
  return (text ? JSON.parse(text) : null) as T;
}

type Entry = { at: number; value: Promise<unknown> };
const cache = new Map<string, Entry>();

/** `view` with a TTL (default 3 s): concurrent and recent identical calls share one request. */
export function cachedView<T>(method: string, args: object = {}, ttlMs = 3000, contract: string = VEILED_CONTRACT): Promise<T> {
  const key = `${contract}|${method}|${JSON.stringify(args)}`;
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && now - hit.at < ttlMs) return hit.value as Promise<T>;
  const value = view<T>(method, args, contract);
  cache.set(key, { at: now, value });
  value.catch(() => cache.delete(key));
  if (cache.size > 500) cache.delete(cache.keys().next().value as string);
  return value;
}

/** Seeds the cache with a value another view already returned (a list view that included this item). */
export function primeView<T>(method: string, args: object, value: T, contract: string = VEILED_CONTRACT): void {
  cache.set(`${contract}|${method}|${JSON.stringify(args)}`, { at: Date.now(), value: Promise.resolve(value) });
}

/** Forget cached views (after a write, so the next read is fresh). */
export function invalidateViews(prefix?: string) {
  if (!prefix) return cache.clear();
  for (const k of [...cache.keys()]) if (k.includes(`|${prefix}`)) cache.delete(k);
}

export async function viewAccount(accountId: string): Promise<{ amount: string; locked: string; storage_usage: number }> {
  return rpc('query', { request_type: 'view_account', finality: 'optimistic', account_id: accountId });
}

/** Public NEAR balance in yoctoNEAR (0 for an account that does not exist yet). */
export async function nearBalanceYocto(accountId: string): Promise<bigint> {
  try {
    const a = await viewAccount(accountId);
    return BigInt(a.amount);
  } catch (e) {
    if (e instanceof RpcError && e.terminal) return 0n;
    throw e;
  }
}

/** NEP-141 balance in the token's units (6 decimals = micro units). */
export async function ftBalance(token: string, accountId: string): Promise<bigint> {
  try {
    const b = await view<string>('ft_balance_of', { account_id: accountId }, token);
    return BigInt(b ?? '0');
  } catch {
    return 0n;
  }
}

export interface TxOutcome {
  status: { SuccessValue?: string; Failure?: unknown } | string;
  transaction: { hash: string; signer_id: string; receiver_id: string };
  transaction_outcome: { id: string };
  receipts_outcome: Array<{ id: string; outcome: { status: unknown; logs: string[]; executor_id: string } }>;
}

export async function txStatus(txHash: string, senderId: string): Promise<TxOutcome> {
  return rpc('tx', { tx_hash: txHash, sender_account_id: senderId, wait_until: 'EXECUTED_OPTIMISTIC' });
}

/** The JSON a successful function call returned, or null. */
export function decodeReturn(outcome: { status?: unknown } | null | undefined): unknown {
  const s = outcome?.status as { SuccessValue?: string } | undefined;
  if (!s || typeof s.SuccessValue !== 'string' || s.SuccessValue === '') return null;
  try {
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(s.SuccessValue), (c) => c.charCodeAt(0))));
  } catch {
    return null;
  }
}

/** The contract's panic code (ERR_...) or the raw failure text. */
export function failureText(failure: unknown): string {
  const text = typeof failure === 'string' ? failure : JSON.stringify(failure);
  return text.match(/ERR_[A-Z_0-9]+/)?.[0] ?? text.slice(0, 300);
}

/** Every receipt failure of an outcome (a failed cross-contract call counts). */
export function outcomeFailure(o: TxOutcome): string | null {
  if (typeof o.status === 'object' && o.status && 'Failure' in o.status) return failureText(o.status.Failure);
  for (const r of o.receipts_outcome ?? []) {
    const st = r.outcome.status as { Failure?: unknown };
    if (st && typeof st === 'object' && 'Failure' in st) return failureText(st.Failure);
  }
  return null;
}
