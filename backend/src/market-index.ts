// Market id → hash of the transaction that created it, for /market/<tx hash> page links.
//
// The contract cannot know its own transaction hashes, so the index is built from FastNEAR's Transactions API (no key):
//   - POST /v0/account lists the contract's successful transactions, oldest first;
//   - POST /v0/transactions (up to 20 hashes) returns their receipts, and a `market_created` event (standard
//     `veiled`) logged by a successful receipt the contract executed names the market.
// Only successful transactions are listed, so one still running is not marked done too early. Each poll lists again
// from RESCAN_BLOCKS below the last height, so a transaction that succeeds after newer ones were indexed is still
// found; the hashes already done inside that window are remembered and skipped.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { gzipSync } from 'node:zlib';

/** How far below the last indexed height each poll lists again (about 17 minutes of testnet blocks). */
export const RESCAN_BLOCKS = 1000;
const PAGE = 200;
const BATCH = 20;
/** Between two requests: at most 5 a second. */
const PAUSE_MS = 200;
const TIMEOUT_MS = 20_000;
const HASH = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const MARKET_ID = /^[0-9]{1,20}$/;

export interface MarketIndex {
  /** on-chain market id ("30") → creating transaction hash */
  byId: Record<string, string>;
  /** the highest block height of a transaction done so far (0: nothing yet) */
  height: number;
  /** transaction hash → its block height, for the transactions done inside the rescan window */
  recent: Record<string, number>;
}

export interface IndexDeps {
  fetch: typeof fetch;
  /** FastNEAR Transactions API base URL, e.g. https://tx.test.fastnear.com */
  api: string;
  contract: string;
  /** waits between requests; tests pass a stand-in */
  pause?: (ms: number) => Promise<void>;
  /** A FastNEAR API key (FASTNEAR_API_KEY), sent as a Bearer header; without one FastNEAR rate-limits harder. */
  apiKey?: string;
}

/** FastNEAR answered with an HTTP error. */
export class FastNearError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/** How long the follow loop waits before the next poll: a minute after FastNEAR rate-limited it, else the usual. */
export function pollDelayMs(error: unknown, usualMs: number): number {
  return error instanceof FastNearError && error.status === 429 ? Math.max(60_000, usualMs) : usualMs;
}

export function emptyIndex(): MarketIndex {
  return { byId: {}, height: 0, recent: {} };
}

const isHeight = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;

function succeeded(status: unknown): boolean {
  return !!status && typeof status === 'object' && ('SuccessValue' in status || 'SuccessReceiptId' in status);
}

/** Market ids ("30") created by a /v0/transactions entry: market_created events of the contract's successful receipts. */
export function marketsCreatedIn(tx: unknown, contract: string): string[] {
  const receipts = (tx as { receipts?: unknown } | null)?.receipts;
  if (!Array.isArray(receipts)) return [];
  const ids: string[] = [];
  for (const r of receipts) {
    const outcome = r?.execution_outcome?.outcome;
    if (outcome?.executor_id !== contract || !succeeded(outcome.status) || !Array.isArray(outcome.logs)) continue;
    for (const log of outcome.logs) {
      if (typeof log !== 'string' || !log.startsWith('EVENT_JSON:')) continue;
      let event: { standard?: unknown; event?: unknown; data?: unknown };
      try {
        event = JSON.parse(log.slice('EVENT_JSON:'.length));
      } catch {
        continue;
      }
      if (event?.standard !== 'veiled' || event.event !== 'market_created' || !Array.isArray(event.data)) continue;
      for (const d of event.data) {
        const id = d?.market_id;
        if (typeof id === 'string' && MARKET_ID.test(id)) ids.push(id);
      }
    }
  }
  return ids;
}

/**
 * Lists the contract's transactions since the index's height (less RESCAN_BLOCKS) and adds the markets they created.
 * Updates `index` in place and returns it; `onPage` runs after every page that did something (to save progress). A
 * transaction FastNEAR lists but cannot return yet, an HTTP error or a malformed answer rejects: the height never
 * moves past a transaction that was not read, so the next poll picks up from there.
 */
export async function catchUp(
  index: MarketIndex,
  deps: IndexDeps,
  onPage?: (index: MarketIndex) => void,
): Promise<MarketIndex> {
  const pause = deps.pause ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let requests = 0;
  const post = async (path: string, body: unknown): Promise<any> => {
    if (requests++ > 0) await pause(PAUSE_MS);
    let res: Response;
    try {
      res = await deps.fetch(`${deps.api}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(deps.apiKey ? { authorization: `Bearer ${deps.apiKey}` } : {}) },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) {
      throw new Error(`FastNEAR is not reachable (${(e as Error).message})`);
    }
    if (!res.ok) throw new FastNearError(`FastNEAR answered ${res.status} on ${path}`, res.status);
    return res.json();
  };

  const from = Math.max(0, index.height - RESCAN_BLOCKS);
  let token: string | undefined;
  for (;;) {
    const page = await post('/v0/account', {
      account_id: deps.contract,
      desc: false,
      is_success: true,
      from_tx_block_height: from,
      limit: PAGE,
      ...(token ? { resume_token: token } : {}),
    });
    if (!Array.isArray(page?.account_txs)) throw new Error('FastNEAR sent a malformed page');
    const fresh: { hash: string; height: number }[] = [];
    for (const row of page.account_txs) {
      const hash = row?.transaction_hash;
      const height = row?.tx_block_height;
      if (typeof hash !== 'string' || !HASH.test(hash) || !isHeight(height)) throw new Error('FastNEAR sent a malformed row');
      if (index.recent[hash] === undefined && !fresh.some((f) => f.hash === hash)) fresh.push({ hash, height });
    }

    for (let i = 0; i < fresh.length; i += BATCH) {
      const batch = fresh.slice(i, i + BATCH);
      const answer = await post('/v0/transactions', { tx_hashes: batch.map((f) => f.hash) });
      const byHash = new Map<string, unknown>();
      for (const tx of Array.isArray(answer?.transactions) ? answer.transactions : []) {
        const hash = tx?.transaction?.hash;
        if (typeof hash === 'string') byHash.set(hash, tx);
      }
      const missing = batch.find((f) => !byHash.has(f.hash));
      if (missing) throw new Error(`FastNEAR has no transaction ${missing.hash} yet`);
      for (const f of batch) {
        for (const id of marketsCreatedIn(byHash.get(f.hash), deps.contract)) index.byId[id] = f.hash;
        index.recent[f.hash] = f.height;
      }
    }

    if (fresh.length) {
      index.height = Math.max(index.height, ...fresh.map((f) => f.height));
      for (const [hash, height] of Object.entries(index.recent)) {
        if (height < index.height - RESCAN_BLOCKS) delete index.recent[hash];
      }
      onPage?.(index);
    }

    const next = page.resume_token;
    if (typeof next !== 'string' || !next) return index;
    if (next === token) throw new Error('FastNEAR repeated a page token');
    token = next;
  }
}

function validIndex(v: any): v is MarketIndex {
  if (!v || typeof v !== 'object' || !isHeight(v.height)) return false;
  if (!v.byId || typeof v.byId !== 'object' || !v.recent || typeof v.recent !== 'object') return false;
  for (const [id, hash] of Object.entries(v.byId)) if (!MARKET_ID.test(id) || typeof hash !== 'string' || !HASH.test(hash)) return false;
  for (const [hash, height] of Object.entries(v.recent)) if (!HASH.test(hash) || !isHeight(height)) return false;
  return true;
}

/** The saved index; a missing file is an empty index, an unreadable one throws. */
export function loadIndex(file: string): MarketIndex {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return emptyIndex();
    throw new Error(`market index ${file} cannot be read: ${(e as Error).message}`);
  }
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    throw new Error(`market index ${file} is not JSON`);
  }
  if (!validIndex(v)) throw new Error(`market index ${file} is malformed`);
  return { byId: { ...v.byId }, height: v.height, recent: { ...v.recent } };
}

/** Writes the index next to its final name first, so a crash mid-write never leaves half a file. */
export function saveIndex(file: string, index: MarketIndex): void {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(index));
  renameSync(tmp, file);
}

export interface MarketTxReply { status: 200 | 304; headers: Record<string, string>; body: Buffer }

/** Whether an Accept-Encoding header takes gzip (named or `*`, with a q above 0). */
function acceptsGzip(header: string | undefined): boolean {
  for (const part of (header ?? '').split(',')) {
    const [name, ...params] = part.split(';').map((s) => s.trim().toLowerCase());
    if (name !== 'gzip' && name !== '*') continue;
    const q = params.find((p) => p.startsWith('q='));
    if (!q || Number(q.slice(2)) > 0) return true;
  }
  return false;
}

/**
 * Builds the /market-tx answer — {contract, byId} — every browser asks for on load. It carries a weak ETag, so an
 * unchanged market list costs a 304, and is gzipped for a browser that accepts it; the bytes are rebuilt only when
 * byId changed. The height is left out on purpose: every transaction on the contract raises it.
 */
export function marketTxReplies(
  contract: string,
): (index: MarketIndex, request: { acceptEncoding?: string; ifNoneMatch?: string }) => MarketTxReply {
  let cached: { json: string; plain: Buffer; gzip: Buffer; etag: string } | null = null;
  return (index, request) => {
    const json = JSON.stringify({ contract, byId: index.byId });
    if (cached?.json !== json) {
      const plain = Buffer.from(json);
      cached = { json, plain, gzip: gzipSync(plain), etag: `W/"${createHash('sha256').update(plain).digest('base64url').slice(0, 27)}"` };
    }
    const headers: Record<string, string> = { etag: cached.etag, vary: 'accept-encoding' };
    const strip = (tag: string) => tag.trim().replace(/^W\//, '');
    const known = (request.ifNoneMatch ?? '').split(',').map(strip);
    if (known.includes('*') || known.includes(strip(cached.etag))) return { status: 304, headers, body: Buffer.alloc(0) };
    headers['content-type'] = 'application/json';
    if (!acceptsGzip(request.acceptEncoding)) return { status: 200, headers, body: cached.plain };
    headers['content-encoding'] = 'gzip';
    return { status: 200, headers, body: cached.gzip };
  };
}

/** FastNEAR's Transactions API for the contract's network, or `override` (MARKET_INDEX_API). */
export function marketIndexApi(contract: string, override?: string): string {
  if (override) return override.replace(/\/+$/, '');
  return contract.endsWith('.testnet') ? 'https://tx.test.fastnear.com' : 'https://tx.main.fastnear.com';
}
