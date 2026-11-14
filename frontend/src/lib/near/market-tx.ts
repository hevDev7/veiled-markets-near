// Market pages are addressed by the hash of the transaction that created the market (/market/<tx hash>).
// The contract cannot know its own transaction hash, so the two directions are found differently:
//   - hash → market: the transaction's `market_created` event (read over RPC, archival for old transactions);
//   - market → hash: the AI resolver service indexes every `market_created` event from FastNEAR's transactions API
//     (backend/src/market-index.ts) and serves the index at GET /market-tx; the page reads it at most every 15 s.
// The index only suggests links: a /market/<hash> page shows the market the chain says that transaction created, and a
// /market/<id> page moves to /market/<hash> only after the chain confirms it, so a wrong index entry never makes one
// URL show different markets in different browsers. Links this browser checked on chain (a market it created, a hash
// it resolved or confirmed) are immutable, so they are kept in localStorage and win over the index; the index's links
// are held in memory, re-read on each page load, and one the chain disproves stays out until the page is reloaded.
// Pages fall back to /market/<id> until a market's hash is known, and /market/<id> links keep working.
import { create } from 'zustand';
import { AI_RESOLVER_URL, RPC_URLS, VEILED_CONTRACT, isNearTxHash } from './config';
import { aleoId, nearId } from './ids';

const ARCHIVAL_RPC = 'https://archival-rpc.testnet.fastnear.com';
const CACHE_KEY = `veiled_market_tx_v1:${VEILED_CONTRACT}`;
/** The resolver's index catches up every 15 s: asking more often finds nothing new. */
const REFRESH_EVERY_MS = 15_000;
const INDEX_TIMEOUT_MS = 10_000;

/** On-chain market id ("30") → creating transaction hash. */
type Links = Record<string, string>;

/** Only market id → transaction hash pairs: a damaged cache or a bad index entry is left out. */
function links(raw: unknown): Links {
  const out: Links = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [id, hash] of Object.entries(raw)) {
    if (typeof hash !== 'string' || !isNearTxHash(hash)) continue;
    try {
      out[nearId(id)] = hash;
    } catch {
      /* not a market id */
    }
  }
  return out;
}

/**
 * The links this browser checked on chain ({byId}; an older page kept {byId, checked}, whose byId entries were each
 * checked over RPC too, and only byId is read).
 */
function readCache(): Links {
  try {
    return links(JSON.parse(localStorage.getItem(CACHE_KEY) ?? '')?.byId);
  } catch {
    return {}; // empty or unavailable storage
  }
}

function writeCache(byId: Links) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ byId }));
  } catch {
    /* storage full or blocked: the links are read from the index again next time */
  }
}

/** The resolver service's index, for this contract only. */
async function indexedLinks(): Promise<Links> {
  const res = await fetch(`${AI_RESOLVER_URL}/market-tx`, { signal: AbortSignal.timeout(INDEX_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`The market index answered ${res.status}`);
  const body = await res.json();
  if (body?.contract !== VEILED_CONTRACT || !body.byId || typeof body.byId !== 'object') {
    throw new Error('The market index is not for this contract');
  }
  return links(body.byId);
}

const sameLinks = (a: Links, b: Links) => {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k]);
};

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

interface MarketTxState {
  /** Every known link, for building page URLs: the index's, with this browser's checked links over them. */
  byId: Links;
  loading: boolean;
  /** Fills in the hashes of markets created since the last refresh, from the index; at most every 15 s. */
  refresh: (wantedIds?: string[]) => Promise<void>;
  /** Records a link checked on chain: a market this browser just created, or a hash the chain confirmed. */
  remember: (marketId: string, txHash: string) => void;
  /** The market a /market/<hash> URL points at, as the UI id ("30field"), or null (unknown, or the chain cannot say). */
  resolve: (txHash: string) => Promise<string | null>;
  /** The creating transaction of a market once the chain confirms it, or null (no link, disproved, or unchecked). */
  confirm: (marketId: string) => Promise<string | null>;
}

let inflight: Promise<void> | null = null;
let lastAsked = -Infinity;

export const useMarketTx = create<MarketTxState>((set, get) => {
  /** Links this browser checked on chain (kept in localStorage). */
  let own = readCache();
  /** The index's links as last read, less the ones the chain disproved (memory only). */
  let indexed: Links = {};
  /** Index links the chain disproved this page load (id → the hash the index gave). */
  const disproved: Links = {};

  // A new object only when a link changed: pages that follow the links would otherwise ask again at once.
  const publish = () => {
    const byId = { ...indexed, ...own };
    if (!sameLinks(byId, get().byId)) set({ byId });
  };

  /** Drops the index links to this hash for markets the chain shows it did not create. */
  const dropDisproved = (txHash: string, createdIds: string[]) => {
    const wrong = Object.keys(indexed).filter((id) => indexed[id] === txHash && !createdIds.includes(id));
    if (!wrong.length) return;
    indexed = { ...indexed };
    for (const id of wrong) {
      disproved[id] = txHash;
      delete indexed[id];
    }
    publish();
  };

  return {
    byId: { ...own },
    loading: false,

    refresh: async (wantedIds) => {
      const known = get().byId;
      const isKnown = (id: string) => {
        try {
          return !!known[nearId(id)];
        } catch {
          return true; // not a market id: nothing to look up
        }
      };
      if (wantedIds?.every(isKnown)) return;
      if (inflight) return inflight;
      if (Date.now() - lastAsked < REFRESH_EVERY_MS) return;
      lastAsked = Date.now();
      inflight = (async () => {
        set({ loading: true });
        try {
          const fresh = await indexedLinks();
          indexed = {};
          for (const [id, hash] of Object.entries(fresh)) if (disproved[id] !== hash) indexed[id] = hash;
          own = { ...readCache(), ...own }; // and what another tab of this browser checked meanwhile
          publish();
        } catch {
          /* the index is unreachable: pages keep their /market/<id> links */
        } finally {
          set({ loading: false });
          inflight = null;
        }
      })();
      return inflight;
    },

    remember: (marketId, txHash) => {
      if (!isNearTxHash(txHash)) return;
      own = { ...readCache(), ...own, [nearId(marketId)]: txHash };
      writeCache(own);
      publish();
    },

    resolve: async (txHash) => {
      const hit = Object.entries(own).find(([, h]) => h === txHash);
      if (hit) return aleoId(hit[0]);
      const ids = await marketsCreatedBy(txHash).catch(() => null);
      if (!ids) return null; // the chain cannot say now: the index's word is not taken instead
      dropDisproved(txHash, ids);
      if (!ids.length) return null;
      get().remember(ids[0], txHash);
      return aleoId(ids[0]);
    },

    confirm: async (marketId) => {
      let id: string;
      try {
        id = nearId(marketId);
      } catch {
        return null; // not a market id
      }
      if (own[id]) return own[id];
      const txHash = indexed[id];
      if (!txHash) return null;
      const ids = await marketsCreatedBy(txHash).catch(() => null);
      if (!ids) return null;
      dropDisproved(txHash, ids);
      if (!ids.includes(id)) return null;
      get().remember(id, txHash);
      return txHash;
    },
  };
});

/**
 * The market a create transaction just made, as the UI id ("30field"), or null when none shows after the last attempt.
 * The wallet returns once the transaction has run, but an RPC node can lag a moment, so a miss is asked again.
 */
export async function waitForCreatedMarket(
  txHash: string,
  {
    attempts = 5,
    delayMs = 3_000,
    resolve = (hash: string) => useMarketTx.getState().resolve(hash),
  }: { attempts?: number; delayMs?: number; resolve?: (hash: string) => Promise<string | null> } = {},
): Promise<string | null> {
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, delayMs));
    const id = await resolve(txHash).catch(() => null);
    if (id) return id;
  }
  return null;
}

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
