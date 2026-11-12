// Market pages are addressed by the hash of the transaction that created the market (/market/<tx hash>).
// The contract cannot know its own transaction hash, so the two directions are found differently:
//   - hash → market: the transaction's `market_created` event (read over RPC, archival for old transactions);
//   - market → hash: NearBlocks lists the contract's create_market and ft_on_transfer receipts (USDC markets
//     arrive through ft_transfer_call), and each new transaction is checked for its `market_created` event.
// Both directions are immutable, so the result is kept in localStorage. Pages fall back to /market/<id> until a
// market's hash is known, and /market/<id> links keep working.
import { create } from 'zustand';
import { RPC_URLS, VEILED_CONTRACT, isNearTxHash } from './config';
import { aleoId, nearId } from './ids';

const NEARBLOCKS_API = 'https://api-testnet.nearblocks.io/v3';
const ARCHIVAL_RPC = 'https://archival-rpc.testnet.fastnear.com';
const CACHE_KEY = `veiled_market_tx_v1:${VEILED_CONTRACT}`;
const PAGE = 25;

interface Cache {
  /** on-chain market id ("30") → creating transaction hash */
  byId: Record<string, string>;
  /** transaction hashes already inspected (market-creating or not) */
  checked: string[];
}

function readCache(): Cache {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '');
    if (c && typeof c.byId === 'object' && Array.isArray(c.checked)) return c;
  } catch {
    /* empty or unavailable storage */
  }
  return { byId: {}, checked: [] };
}

function writeCache(c: Cache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch {
    /* storage full or blocked: the index is rebuilt next time */
  }
}

async function rpcAt<T>(url: string, method: string, params: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'veiled', method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error?.cause?.name ?? json.error?.message ?? 'RPC error');
  return json.result as T;
}

/** Market ids ("30") created by a transaction, from its market_created events. Tries the regular RPCs, then archival. */
export async function marketsCreatedBy(txHash: string): Promise<string[]> {
  // Any sender works for the lookup: RPC nodes track every shard.
  const params = { tx_hash: txHash, sender_account_id: VEILED_CONTRACT, wait_until: 'EXECUTED_OPTIMISTIC' };
  let tx: { receipts_outcome?: { outcome?: { executor_id?: string; logs?: string[] } }[] } | null = null;
  for (const url of [...RPC_URLS, ARCHIVAL_RPC]) {
    try {
      tx = await rpcAt(url, 'tx', params);
      break;
    } catch {
      /* garbage-collected on this node, or the node is down: try the next one */
    }
  }
  if (!tx) throw new Error('Transaction not found');
  const ids: string[] = [];
  for (const r of tx.receipts_outcome ?? []) {
    if (r.outcome?.executor_id !== VEILED_CONTRACT) continue;
    for (const log of r.outcome.logs ?? []) {
      if (!log.startsWith('EVENT_JSON:')) continue;
      try {
        const e = JSON.parse(log.slice('EVENT_JSON:'.length));
        if (e?.standard !== 'veiled' || e?.event !== 'market_created') continue;
        for (const d of e.data ?? []) if (d?.market_id !== undefined) ids.push(nearId(d.market_id));
      } catch {
        /* not our event */
      }
    }
  }
  return ids;
}

/** Successful receipts on the contract for one method, newest first, as transaction hashes. */
async function receiptTxs(method: string): Promise<string[]> {
  const out: string[] = [];
  for (let page = 1; page <= 20; page++) {
    const res = await fetch(`${NEARBLOCKS_API}/accounts/${VEILED_CONTRACT}/receipts?method=${method}&per_page=${PAGE}&page=${page}`);
    if (!res.ok) throw new Error(`NearBlocks ${res.status}`);
    const rows: { transaction_hash?: string; outcome?: { status?: boolean } }[] = (await res.json())?.data ?? [];
    for (const r of rows) if (r.outcome?.status !== false && r.transaction_hash) out.push(r.transaction_hash);
    if (rows.length < PAGE) break;
  }
  return out;
}

interface MarketTxState {
  byId: Record<string, string>;
  loading: boolean;
  /** Fills in the hashes of markets created since the last refresh. Cheap when nothing is missing. */
  refresh: (wantedIds?: string[]) => Promise<void>;
  /** Records a market this browser just created. */
  remember: (marketId: string, txHash: string) => void;
  /** The market a /market/<hash> URL points at, as the UI id ("30field"), or null. */
  resolve: (txHash: string) => Promise<string | null>;
}

let inflight: Promise<void> | null = null;

export const useMarketTx = create<MarketTxState>((set, get) => ({
  byId: readCache().byId,
  loading: false,

  refresh: async (wantedIds) => {
    const known = get().byId;
    if (wantedIds && wantedIds.every((id) => known[nearId(id)])) return;
    if (inflight) return inflight;
    inflight = (async () => {
      set({ loading: true });
      try {
        const cache = readCache();
        const checked = new Set(cache.checked);
        const [created, received] = await Promise.all([
          receiptTxs('create_market'),
          receiptTxs('ft_on_transfer').catch(() => [] as string[]),
        ]);
        for (const hash of [...new Set([...created, ...received])]) {
          if (checked.has(hash)) continue;
          try {
            for (const id of await marketsCreatedBy(hash)) cache.byId[id] = hash;
            checked.add(hash);
          } catch {
            /* try this one again on the next refresh */
          }
        }
        cache.checked = [...checked];
        writeCache(cache);
        set({ byId: { ...cache.byId } });
      } catch {
        /* NearBlocks unreachable: pages keep their /market/<id> links */
      } finally {
        set({ loading: false });
        inflight = null;
      }
    })();
    return inflight;
  },

  remember: (marketId, txHash) => {
    if (!isNearTxHash(txHash)) return;
    const cache = readCache();
    cache.byId[nearId(marketId)] = txHash;
    if (!cache.checked.includes(txHash)) cache.checked.push(txHash);
    writeCache(cache);
    set({ byId: { ...cache.byId } });
  },

  resolve: async (txHash) => {
    const hit = Object.entries(get().byId).find(([, h]) => h === txHash);
    if (hit) return aleoId(hit[0]);
    const ids = await marketsCreatedBy(txHash).catch(() => [] as string[]);
    if (!ids.length) return null;
    get().remember(ids[0], txHash);
    return aleoId(ids[0]);
  },
}));

/** The page URL for a market: /market/<creating tx hash> when known, else /market/<id>. */
export function marketPath(marketId: string, byId: Record<string, string> = useMarketTx.getState().byId): string {
  let key: string;
  try {
    key = nearId(marketId);
  } catch {
    return `/market/${marketId}`;
  }
  const hash = byId[key];
  return `/market/${hash ?? aleoId(key)}`;
}

/** React helper: a marketPath that re-renders once the hash index loads. */
export function useMarketPath(): (marketId: string) => string {
  const byId = useMarketTx((s) => s.byId);
  return (marketId: string) => marketPath(marketId, byId);
}
