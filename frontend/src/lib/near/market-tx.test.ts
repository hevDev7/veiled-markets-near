// The create page's success step said "Waiting for on-chain confirmation..." forever (2026-11-14, market #1977): the
// panel was static, left over from the Aleo flow. On NEAR the wallet returns once the transaction has run, so the page
// asks for the market the transaction created, a few times while the RPC catches up, and shows it.
// Market → creating transaction hash comes from the AI resolver service's index (GET /market-tx), not NearBlocks.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AI_RESOLVER_URL, VEILED_CONTRACT } from './config';
import { waitForCreatedMarket } from './market-tx';

const HASH = 'EZuSbZFMJViAwV7eUDBeYbwoDozY1cBb6teu3nMFC8dh';
const H2 = '2'.repeat(44);
const H3 = '3'.repeat(44);
const H4 = '4'.repeat(43);
const CACHE_KEY = `veiled_market_tx_v1:${VEILED_CONTRACT}`;

function memoryStorage(entries: Record<string, string> = {}) {
  const m = new Map(Object.entries(entries));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    kept: (k: string) => JSON.parse(m.get(k) ?? 'null'),
  };
}

const cached = (byId: Record<string, string>, extra: Record<string, unknown> = {}) =>
  memoryStorage({ [CACHE_KEY]: JSON.stringify({ byId, ...extra }) });

const INDEX_URL = `${AI_RESOLVER_URL}/market-tx`;

/** An RPC `tx` result whose contract receipt logs a market_created event for these market ids. */
const createdBy = (ids: string[]) => ({
  receipts_outcome: [
    {
      outcome: {
        executor_id: VEILED_CONTRACT,
        logs: [
          `EVENT_JSON:${JSON.stringify({ standard: 'veiled', version: '1.0.0', event: 'market_created', data: ids.map((market_id) => ({ market_id })) })}`,
        ],
      },
    },
  ],
});

/**
 * Stands in for the network. The resolver's index answers in order (the last one repeats); a number is an HTTP status.
 * The RPC nodes answer `tx` with the markets each hash in `chain` created, and an error for any other hash; with
 * chain 'down' no node answers.
 */
function network(answers: unknown[], chain: Record<string, string[]> | 'down' = {}) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    if (url !== INDEX_URL) {
      if (chain === 'down') throw new TypeError('Failed to fetch');
      const hash = JSON.parse(String(init?.body)).params.tx_hash;
      const body = chain[hash]
        ? { jsonrpc: '2.0', id: 'veiled', result: createdBy(chain[hash]) }
        : { jsonrpc: '2.0', id: 'veiled', error: { cause: { name: 'UNKNOWN_TRANSACTION' } } };
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    const a = answers.length > 1 ? answers.shift() : answers[0];
    if (a instanceof Error) throw a;
    if (typeof a === 'number') return new Response('', { status: a });
    if (typeof a === 'string') return new Response(a, { status: 200 });
    return new Response(JSON.stringify(a), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

/** Stands in for the resolver's index alone (no transaction is known on chain). */
const index = (...answers: unknown[]) => network(answers);

/** The transaction hashes the RPC nodes were asked about, in order. */
const rpcAsked = (fetch: ReturnType<typeof network>) =>
  fetch.mock.calls.filter(([url]) => url !== INDEX_URL).map(([, init]) => JSON.parse(String(init?.body)).params.tx_hash);

/** A page load: the store reads this browser's links as the module loads. */
async function load(storage = memoryStorage()) {
  vi.stubGlobal('localStorage', storage);
  vi.resetModules();
  return (await import('./market-tx')).useMarketTx;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('market links from the resolver index', () => {
  it("fills in links from the resolver's index, asking it alone", async () => {
    const fetch = index({ contract: VEILED_CONTRACT, byId: { '1977': HASH, '30': H2 } });
    const storage = memoryStorage();
    const store = await load(storage);

    await store.getState().refresh();

    expect(store.getState().byId).toEqual({ '1977': HASH, '30': H2 });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe(`${AI_RESOLVER_URL}/market-tx`);
    expect(fetch.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
    // The index's word is not kept: a page load asks it again, so a corrected index is taken.
    expect(storage.kept(CACHE_KEY)).toBeNull();
  });

  it('takes a corrected index over the wrong link it gave before', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-20T10:00:00.000Z'));
    index({ contract: VEILED_CONTRACT, byId: { '30': H2 } }, { contract: VEILED_CONTRACT, byId: { '30': H3 } });
    const storage = memoryStorage();
    const store = await load(storage);
    await store.getState().refresh();
    expect(store.getState().byId).toEqual({ '30': H2 });

    vi.setSystemTime(new Date('2026-11-20T10:00:16.000Z'));
    await store.getState().refresh();

    expect(store.getState().byId).toEqual({ '30': H3 });
    expect(storage.kept(CACHE_KEY)).toBeNull();
  });

  it('keeps what this browser found itself over the index', async () => {
    index({ contract: VEILED_CONTRACT, byId: { '1977': HASH, '30': H2 } });
    const store = await load(cached({ '30': H3, '7': H4 }));

    await store.getState().refresh();

    expect(store.getState().byId).toEqual({ '1977': HASH, '30': H3, '7': H4 });
  });

  it('reads the links an older page kept (each was checked on chain), and keeps them in the new shape', async () => {
    index({ contract: VEILED_CONTRACT, byId: { '1977': HASH } });
    const storage = cached({ '5': H2 }, { checked: [H2, H3] });
    const store = await load(storage);
    expect(store.getState().byId).toEqual({ '5': H2 });

    await store.getState().refresh();
    expect(store.getState().byId).toEqual({ '1977': HASH, '5': H2 });

    store.getState().remember('6', H4);
    expect(storage.kept(CACHE_KEY)).toEqual({ byId: { '5': H2, '6': H4 } });
  });

  it('leaves out entries that are not a market id and a transaction hash', async () => {
    index({ contract: VEILED_CONTRACT, byId: { '1977': HASH, x: H2, '31': 'not-a-hash', '32': 42, '33': HASH.slice(0, 20) } });
    const store = await load(cached({ '8': 'damaged', nine: H3 }));
    expect(store.getState().byId).toEqual({});

    await store.getState().refresh();

    expect(store.getState().byId).toEqual({ '1977': HASH });
  });

  it.each([
    ['an index of another contract', { contract: 'other.testnet', byId: { '1': H2 } }],
    ['an index without links', { contract: VEILED_CONTRACT }],
    ['a page that is not JSON', '<html>Bad gateway</html>'],
    ['an error status', 503],
    ['no answer', new TypeError('Failed to fetch')],
  ])('keeps the links it has on %s', async (_what, answer) => {
    index(answer);
    const storage = cached({ '30': H2 });
    const store = await load(storage);

    await expect(store.getState().refresh()).resolves.toBeUndefined();

    expect(store.getState().byId).toEqual({ '30': H2 });
    expect(storage.kept(CACHE_KEY)).toEqual({ byId: { '30': H2 } });
  });

  it('asks nothing when every market wanted is known', async () => {
    const fetch = index({ contract: VEILED_CONTRACT, byId: {} });
    const store = await load(cached({ '30': H2 }));

    await store.getState().refresh(['30field']);

    expect(fetch).not.toHaveBeenCalled();
  });

  it('leaves the links untouched when the index brings nothing new, so pages that follow them do not ask again', async () => {
    index({ contract: VEILED_CONTRACT, byId: { '1977': HASH } });
    const store = await load(cached({ '1977': HASH }));
    const before = store.getState().byId;

    await store.getState().refresh(['30']);

    expect(store.getState().byId).toBe(before);
  });

  it('asks once for refreshes at the same time, and then at most every 15 seconds', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-20T10:00:00.000Z'));
    const fetch = index({ contract: VEILED_CONTRACT, byId: { '1977': HASH } });
    const store = await load();

    await Promise.all([store.getState().refresh(), store.getState().refresh(['30'])]);
    expect(fetch).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date('2026-11-20T10:00:14.000Z'));
    await store.getState().refresh(['30']);
    expect(fetch).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date('2026-11-20T10:00:16.000Z'));
    await store.getState().refresh(['30']);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('remembers a market this browser just created', async () => {
    const storage = memoryStorage();
    const store = await load(storage);

    store.getState().remember('31field', H3);

    expect(store.getState().byId).toEqual({ '31': H3 });
    expect(storage.kept(CACHE_KEY)).toEqual({ byId: { '31': H3 } });
  });
});

// A /market/<hash> page must show the market that transaction created, in every browser: the index only suggests
// links, and the chain settles them.
describe('resolve: the market a /market/<hash> page shows', () => {
  it('asks the chain about a hash only the index knows, and keeps the answer', async () => {
    const fetch = network([{ contract: VEILED_CONTRACT, byId: { '30': H2 } }], { [H2]: ['30'] });
    const storage = memoryStorage();
    const store = await load(storage);
    await store.getState().refresh();

    await expect(store.getState().resolve(H2)).resolves.toBe('30field');

    expect(rpcAsked(fetch)).toEqual([H2]);
    expect(storage.kept(CACHE_KEY)).toEqual({ byId: { '30': H2 } });
  });

  it('shows the market the transaction created when the index named another, and drops that link for good', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-20T10:00:00.000Z'));
    network([{ contract: VEILED_CONTRACT, byId: { '30': H2, '1977': HASH } }], { [H2]: ['31'] });
    const store = await load();
    await store.getState().refresh();

    await expect(store.getState().resolve(H2)).resolves.toBe('31field');
    expect(store.getState().byId).toEqual({ '31': H2, '1977': HASH });

    vi.setSystemTime(new Date('2026-11-20T10:00:16.000Z'));
    await store.getState().refresh();
    expect(store.getState().byId).toEqual({ '31': H2, '1977': HASH });
  });

  it('drops an index link to a transaction that created no market', async () => {
    network([{ contract: VEILED_CONTRACT, byId: { '30': H2 } }], { [H2]: [] });
    const store = await load();
    await store.getState().refresh();

    await expect(store.getState().resolve(H2)).resolves.toBeNull();
    expect(store.getState().byId).toEqual({});
  });

  it('shows nothing for a hash it cannot check, and keeps the index link for later', async () => {
    network([{ contract: VEILED_CONTRACT, byId: { '30': H2 } }], 'down');
    const store = await load();
    await store.getState().refresh();

    await expect(store.getState().resolve(H2)).resolves.toBeNull();
    expect(store.getState().byId).toEqual({ '30': H2 });
  });

  it('asks nothing about a hash this browser already checked', async () => {
    const fetch = network([{ contract: VEILED_CONTRACT, byId: {} }]);
    const store = await load(cached({ '30': H2 }));

    await expect(store.getState().resolve(H2)).resolves.toBe('30field');
    expect(fetch).not.toHaveBeenCalled();
  });
});

// A /market/<id> page moves to /market/<hash> only once the chain shows that transaction created this market.
describe('confirm: the hash a /market/<id> page may move to', () => {
  it('checks an index link on chain, and keeps it', async () => {
    const fetch = network([{ contract: VEILED_CONTRACT, byId: { '30': H2 } }], { [H2]: ['30'] });
    const storage = memoryStorage();
    const store = await load(storage);
    await store.getState().refresh();

    await expect(store.getState().confirm('30field')).resolves.toBe(H2);

    expect(rpcAsked(fetch)).toEqual([H2]);
    expect(storage.kept(CACHE_KEY)).toEqual({ byId: { '30': H2 } });
  });

  it('refuses an index link the chain disproves, and drops it', async () => {
    network([{ contract: VEILED_CONTRACT, byId: { '30': H2 } }], { [H2]: ['31'] });
    const store = await load();
    await store.getState().refresh();

    await expect(store.getState().confirm('30field')).resolves.toBeNull();
    expect(store.getState().byId['30']).toBeUndefined();
  });

  it('refuses an index link it cannot check, and keeps it for later', async () => {
    network([{ contract: VEILED_CONTRACT, byId: { '30': H2 } }], 'down');
    const store = await load();
    await store.getState().refresh();

    await expect(store.getState().confirm('30field')).resolves.toBeNull();
    expect(store.getState().byId).toEqual({ '30': H2 });
  });

  it('answers from a link this browser checked without asking', async () => {
    const fetch = network([{ contract: VEILED_CONTRACT, byId: {} }]);
    const store = await load(cached({ '30': H2 }));

    await expect(store.getState().confirm('30field')).resolves.toBe(H2);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('answers null, asking nothing, for a market with no link or a route that is not a market id', async () => {
    const fetch = network([{ contract: VEILED_CONTRACT, byId: {} }]);
    const store = await load();

    await expect(store.getState().confirm('30field')).resolves.toBeNull();
    await expect(store.getState().confirm('BTC-15m')).resolves.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('waitForCreatedMarket', () => {
  it('asks again until the transaction shows the market it created', async () => {
    const asked: string[] = [];
    const answers = [null, null, '1977field'];
    const id = await waitForCreatedMarket(HASH, {
      delayMs: 0,
      resolve: async (hash) => {
        asked.push(hash);
        return answers[asked.length - 1] ?? null;
      },
    });
    expect(id).toBe('1977field');
    expect(asked).toEqual([HASH, HASH, HASH]);
  });

  it('gives up with null after the last attempt', async () => {
    let calls = 0;
    const id = await waitForCreatedMarket(HASH, {
      attempts: 4,
      delayMs: 0,
      resolve: async () => {
        calls++;
        return null;
      },
    });
    expect(id).toBeNull();
    expect(calls).toBe(4);
  });

  it('counts a lookup that throws as not found yet', async () => {
    let calls = 0;
    const id = await waitForCreatedMarket(HASH, {
      delayMs: 0,
      resolve: async () => {
        calls++;
        if (calls === 1) throw new Error('RPC down');
        return '1977field';
      },
    });
    expect(id).toBe('1977field');
    expect(calls).toBe(2);
  });
});
