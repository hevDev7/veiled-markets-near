// The market → creating-transaction index the AI resolver serves at /market-tx, built from FastNEAR's Transactions
// API. Run: npx tsx --test src/market-index.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import {
  FastNearError,
  RESCAN_BLOCKS,
  catchUp,
  emptyIndex,
  loadIndex,
  marketIndexApi,
  marketTxReplies,
  marketsCreatedIn,
  pollDelayMs,
  saveIndex,
  type MarketIndex,
} from './market-index';

const CONTRACT = 'v1.veiled-markets.testnet';
const API = 'https://tx.test.fastnear.com';

/** A base58-looking transaction hash, distinct per n. */
const h = (n: number) => `Tx${String(n).replace(/0/g, 'z')}`.padEnd(44, 'A');

const createdLog = (ids: string[]) =>
  `EVENT_JSON:${JSON.stringify({
    standard: 'veiled',
    version: '1.0.0',
    event: 'market_created',
    data: ids.map((market_id) => ({ market_id, token_type: 1 })),
  })}`;

/** A /v0/transactions entry: the contract's receipt logs `ids` (none when empty), then the signer's refund receipt. */
function txOf(hash: string, ids: string[] = [], status: unknown = { SuccessValue: '' }) {
  return {
    transaction: { hash, signer_id: 'alice.testnet', receiver_id: CONTRACT, actions: [] },
    execution_outcome: { block_height: 1, id: hash, outcome: { executor_id: 'alice.testnet', logs: [], status: { SuccessReceiptId: 'r1' } } },
    receipts: [
      { execution_outcome: { block_height: 2, id: 'r1', outcome: { executor_id: CONTRACT, logs: ids.length ? [createdLog(ids)] : [], status } }, receipt: {} },
      { execution_outcome: { block_height: 3, id: 'r2', outcome: { executor_id: 'alice.testnet', logs: [], status: { SuccessValue: '' } } }, receipt: {} },
    ],
    data_receipts: [],
  };
}

interface Row { hash: string; height: number }

/**
 * A stand-in for FastNEAR's two endpoints. `rows` are the contract's successful transactions; `txs` what
 * /v0/transactions knows. Pages are 200 rows, oldest first; the last page has no resume_token, as the live API.
 */
function fakeFastNear(rows: Row[], txs: Map<string, unknown>) {
  const calls: { path: string; body: any }[] = [];
  const failures: { path: string; status: number }[] = [];
  const fetch = (async (url: string, init: { body: string }) => {
    const path = url.slice(API.length);
    const body = JSON.parse(init.body);
    calls.push({ path, body });
    const fail = failures.findIndex((f) => f.path === path);
    if (fail >= 0) {
      const [{ status }] = failures.splice(fail, 1);
      return new Response('slow down', { status });
    }
    if (path === '/v0/account') {
      const all = rows
        .filter((r) => r.height >= (body.from_tx_block_height ?? 0))
        .sort((a, b) => a.height - b.height);
      const start = body.resume_token ? Number(body.resume_token) : 0;
      const page = all.slice(start, start + body.limit);
      const out: Record<string, unknown> = {
        account_txs: page.map((r) => ({ account_id: CONTRACT, transaction_hash: r.hash, tx_block_height: r.height, is_success: true })),
      };
      if (start + body.limit < all.length) out.resume_token = String(start + body.limit);
      if (!body.resume_token) out.txs_count = all.length;
      return Response.json(out);
    }
    if (path === '/v0/transactions') {
      return Response.json({ transactions: body.tx_hashes.filter((x: string) => txs.has(x)).map((x: string) => txs.get(x)) });
    }
    return new Response('not found', { status: 404 });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls, failures };
}

function deps(fetch: typeof globalThis.fetch, pauses: number[] = []) {
  return { fetch, api: API, contract: CONTRACT, pause: async (ms: number) => void pauses.push(ms) };
}

test('marketsCreatedIn reads market ids from the contract’s successful receipts only', () => {
  assert.deepEqual(marketsCreatedIn(txOf(h(1), ['1977']), CONTRACT), ['1977']);
  assert.deepEqual(marketsCreatedIn(txOf(h(1), ['5', '6']), CONTRACT), ['5', '6']);
  assert.deepEqual(marketsCreatedIn(txOf(h(1)), CONTRACT), []);
  // The same event logged by another account is not the contract's.
  assert.deepEqual(marketsCreatedIn(txOf(h(1), ['7']), 'v2.veiled-markets.testnet'), []);
  // A receipt that failed created nothing, whatever it logged before failing.
  assert.deepEqual(marketsCreatedIn(txOf(h(1), ['8'], { Failure: { ActionError: {} } }), CONTRACT), []);
  assert.deepEqual(marketsCreatedIn(txOf(h(1), ['8'], 'Unknown'), CONTRACT), []);
});

test('marketsCreatedIn ignores other events, other standards, broken JSON and malformed ids', () => {
  const tx: any = txOf(h(1));
  tx.receipts[0].execution_outcome.outcome.logs = [
    'plain text log',
    'EVENT_JSON:{not json',
    `EVENT_JSON:${JSON.stringify({ standard: 'nep141', event: 'market_created', data: [{ market_id: '9' }] })}`,
    `EVENT_JSON:${JSON.stringify({ standard: 'veiled', event: 'bet_placed', data: [{ market_id: '9' }] })}`,
    `EVENT_JSON:${JSON.stringify({ standard: 'veiled', event: 'market_created', data: [{ market_id: '12field' }, { market_id: -1 }, {}, { market_id: '13' }] })}`,
    `EVENT_JSON:${JSON.stringify({ standard: 'veiled', event: 'market_created', data: 'oops' })}`,
  ];
  assert.deepEqual(marketsCreatedIn(tx, CONTRACT), ['13']);
  assert.deepEqual(marketsCreatedIn(null, CONTRACT), []);
  assert.deepEqual(marketsCreatedIn({ receipts: 'nope' }, CONTRACT), []);
});

test('catchUp builds the index from nothing: every page, batches of 20, paced, saved per page', async () => {
  const rows: Row[] = [];
  const txs = new Map<string, unknown>();
  for (let i = 1; i <= 245; i++) {
    rows.push({ hash: h(i), height: 1000 + i });
    txs.set(h(i), txOf(h(i), i % 50 === 0 ? [String(i / 50)] : []));
  }
  const api = fakeFastNear(rows, txs);
  const pauses: number[] = [];
  const pages: MarketIndex[] = [];
  const index = await catchUp(emptyIndex(), deps(api.fetch, pauses), (i) => void pages.push(structuredClone(i)));

  assert.deepEqual(index.byId, { 1: h(50), 2: h(100), 3: h(150), 4: h(200) });
  assert.equal(index.height, 1245);

  const lists = api.calls.filter((c) => c.path === '/v0/account');
  assert.equal(lists.length, 2);
  assert.deepEqual(lists[0].body, { account_id: CONTRACT, desc: false, is_success: true, from_tx_block_height: 0, limit: 200 });
  assert.deepEqual(lists[1].body, { ...lists[0].body, resume_token: '200' });

  const batches = api.calls.filter((c) => c.path === '/v0/transactions').map((c) => c.body.tx_hashes.length);
  // 200 on the first page, 45 on the second: never more than 20 a request.
  assert.deepEqual(batches, [...Array(12).fill(20), 5]);
  assert.equal(new Set(api.calls.flatMap((c) => c.body.tx_hashes ?? [])).size, 245);

  // One pause before every request but the first: 5 requests a second at most.
  assert.equal(pauses.length, api.calls.length - 1);
  assert.ok(pauses.every((ms) => ms === 200));

  // Saved after each page, with that page's progress.
  assert.equal(pages.length, 2);
  assert.equal(pages[0].height, 1200);
  assert.deepEqual(pages[0].byId, { 1: h(50), 2: h(100), 3: h(150), 4: h(200) });
  assert.equal(pages[1].height, 1245);

  // Only the transactions inside the rescan window are remembered as done.
  assert.ok(Object.values(index.recent).every((height) => height >= index.height - RESCAN_BLOCKS));
  assert.equal(Object.keys(index.recent).length, 245);
});

test('a later poll lists again from RESCAN_BLOCKS below the last height and skips what it already did', async () => {
  const rows: Row[] = [{ hash: h(1), height: 4500 }, { hash: h(2), height: 5000 }];
  const txs = new Map<string, unknown>([[h(1), txOf(h(1), ['1'])], [h(2), txOf(h(2))]]);
  const api = fakeFastNear(rows, txs);
  const index = await catchUp(emptyIndex(), deps(api.fetch));
  assert.equal(index.height, 5000);
  api.calls.length = 0;

  rows.push({ hash: h(3), height: 6200 });
  txs.set(h(3), txOf(h(3), ['2']));
  const saves: number[] = [];
  await catchUp(index, deps(api.fetch), (i) => void saves.push(i.height));

  assert.equal(api.calls[0].body.from_tx_block_height, 5000 - RESCAN_BLOCKS);
  assert.deepEqual(api.calls.filter((c) => c.path === '/v0/transactions').map((c) => c.body.tx_hashes), [[h(3)]]);
  assert.deepEqual(index.byId, { 1: h(1), 2: h(3) });
  assert.equal(index.height, 6200);
  assert.deepEqual(saves, [6200]);
  // h(1) and h(2) fell out of the window and are forgotten; the index keeps their markets.
  assert.deepEqual(Object.keys(index.recent), [h(3)]);
});

test('a transaction that succeeds after newer ones were indexed is still found', async () => {
  const rows: Row[] = [{ hash: h(1), height: 5000 }];
  const txs = new Map<string, unknown>([[h(1), txOf(h(1))]]);
  const api = fakeFastNear(rows, txs);
  const index = await catchUp(emptyIndex(), deps(api.fetch));

  // h(2) was still running at block 4900 during the first poll, so it was not listed as successful yet.
  rows.push({ hash: h(2), height: 4900 });
  txs.set(h(2), txOf(h(2), ['44']));
  await catchUp(index, deps(api.fetch));

  assert.deepEqual(index.byId, { 44: h(2) });
  assert.equal(index.height, 5000);
});

test('a poll with nothing new asks one page, fetches nothing and does not save', async () => {
  const rows: Row[] = [{ hash: h(1), height: 5000 }];
  const api = fakeFastNear(rows, new Map([[h(1), txOf(h(1))]]));
  const index = await catchUp(emptyIndex(), deps(api.fetch));
  api.calls.length = 0;
  const before = structuredClone(index);
  let saved = 0;
  await catchUp(index, deps(api.fetch), () => void saved++);
  assert.deepEqual(api.calls.map((c) => c.path), ['/v0/account']);
  assert.equal(saved, 0);
  assert.deepEqual(index, before);
});

test('a listed transaction FastNEAR cannot return yet stops the poll without moving past it', async () => {
  const rows: Row[] = [{ hash: h(1), height: 100 }, { hash: h(2), height: 101 }];
  const txs = new Map<string, unknown>([[h(1), txOf(h(1), ['1'])]]);
  const api = fakeFastNear(rows, txs);
  const index = emptyIndex();
  await assert.rejects(catchUp(index, deps(api.fetch)), new RegExp(h(2)));
  assert.equal(index.height, 0);
  assert.equal(index.recent[h(2)], undefined);

  txs.set(h(2), txOf(h(2), ['2']));
  await catchUp(index, deps(api.fetch));
  assert.deepEqual(index.byId, { 1: h(1), 2: h(2) });
  assert.equal(index.height, 101);
});

test('an HTTP error from either endpoint rejects with its status and leaves the height alone', async () => {
  const rows: Row[] = [{ hash: h(1), height: 100 }];
  const api = fakeFastNear(rows, new Map([[h(1), txOf(h(1), ['1'])]]));
  const index = emptyIndex();

  api.failures.push({ path: '/v0/account', status: 429 });
  await assert.rejects(catchUp(index, deps(api.fetch)), /FastNEAR answered 429/);
  api.failures.push({ path: '/v0/transactions', status: 502 });
  await assert.rejects(catchUp(index, deps(api.fetch)), /FastNEAR answered 502/);
  assert.equal(index.height, 0);
  assert.deepEqual(index.byId, {});

  await catchUp(index, deps(api.fetch));
  assert.deepEqual(index.byId, { 1: h(1) });
});

test('a FastNEAR API key goes in a Bearer header, and no header goes without one', async () => {
  const seen: (string | null)[] = [];
  const api = fakeFastNear([{ hash: h(1), height: 100 }], new Map([[h(1), txOf(h(1))]]));
  const spy = (async (url: string, init: RequestInit) => {
    seen.push(new Headers(init.headers).get('authorization'));
    return api.fetch(url, init);
  }) as unknown as typeof globalThis.fetch;
  await catchUp(emptyIndex(), { ...deps(spy), apiKey: 'fn-test-key' });
  await catchUp(emptyIndex(), deps(spy));
  assert.deepEqual(seen, ['Bearer fn-test-key', 'Bearer fn-test-key', null, null]);
});

test('after a 429 the next poll waits a minute; other failures keep the usual pace', async () => {
  const api = fakeFastNear([{ hash: h(1), height: 100 }], new Map([[h(1), txOf(h(1))]]));
  api.failures.push({ path: '/v0/transactions', status: 429 });
  const limited = await catchUp(emptyIndex(), deps(api.fetch)).catch((e: unknown) => e);
  assert.ok(limited instanceof FastNearError);
  assert.equal(limited.status, 429);
  assert.equal(pollDelayMs(limited, 15_000), 60_000);
  assert.equal(pollDelayMs(limited, 120_000), 120_000);
  assert.equal(pollDelayMs(new FastNearError('FastNEAR answered 502 on /v0/account', 502), 15_000), 15_000);
  assert.equal(pollDelayMs(new Error('FastNEAR has no transaction yet'), 15_000), 15_000);
  assert.equal(pollDelayMs(null, 15_000), 15_000);
});

test('an unreachable FastNEAR rejects', async () => {
  const down = (async () => {
    throw new TypeError('fetch failed');
  }) as unknown as typeof globalThis.fetch;
  await assert.rejects(catchUp(emptyIndex(), deps(down)), /FastNEAR is not reachable/);
});

test('malformed list rows and a repeated page token reject instead of skipping or looping', async () => {
  const answer = (body: unknown) => (async () => Response.json(body)) as unknown as typeof globalThis.fetch;
  await assert.rejects(catchUp(emptyIndex(), deps(answer({ account_txs: [{ tx_block_height: 5 }] }))), /malformed/);
  await assert.rejects(catchUp(emptyIndex(), deps(answer({ account_txs: [{ transaction_hash: h(1), tx_block_height: -5 }] }))), /malformed/);
  await assert.rejects(catchUp(emptyIndex(), deps(answer({ nope: true }))), /malformed/);

  let lists = 0;
  const stuck = (async (url: string) => {
    if (url.endsWith('/v0/account')) {
      lists++;
      return Response.json({ account_txs: [], resume_token: '7' });
    }
    return Response.json({ transactions: [] });
  }) as unknown as typeof globalThis.fetch;
  await assert.rejects(catchUp(emptyIndex(), deps(stuck)), /repeated/);
  assert.equal(lists, 2);
});

test('the index file: missing means empty, a save loads back, a broken file is refused', () => {
  const dir = mkdtempSync(join(tmpdir(), 'market-index-'));
  const file = join(dir, 'nested', 'market-index.json');
  assert.deepEqual(loadIndex(file), emptyIndex());

  const index: MarketIndex = { byId: { 30: h(30) }, height: 277630111, recent: { [h(30)]: 277630111 } };
  saveIndex(file, index);
  assert.deepEqual(loadIndex(file), index);
  assert.deepEqual(readdirSync(join(dir, 'nested')), ['market-index.json']);

  writeFileSync(file, '{"byId":');
  assert.throws(() => loadIndex(file), /market index/);
  writeFileSync(file, JSON.stringify({ byId: { abc: h(1) }, height: 5, recent: {} }));
  assert.throws(() => loadIndex(file), /market index/);
  writeFileSync(file, JSON.stringify({ byId: {}, height: -1, recent: {} }));
  assert.throws(() => loadIndex(file), /market index/);
  assert.ok(existsSync(file));
});

test('/market-tx answers the index as JSON with an ETag, and 304 when the browser already has it', () => {
  const reply = marketTxReplies(CONTRACT);
  const index: MarketIndex = { byId: { 30: h(30) }, height: 500, recent: { [h(30)]: 500 } };

  const first = reply(index, {});
  assert.equal(first.status, 200);
  assert.equal(first.headers['content-type'], 'application/json');
  assert.equal(first.headers['content-encoding'], undefined);
  assert.deepEqual(JSON.parse(first.body.toString()), { contract: CONTRACT, byId: { 30: h(30) } });
  const etag = first.headers.etag;
  assert.match(etag, /^W\/"[A-Za-z0-9_-]{16,}"$/);

  // Every transaction on the contract raises the height; only a new market changes what browsers need.
  index.height = 900;
  index.recent[h(99)] = 900;
  assert.equal(reply(index, { ifNoneMatch: etag }).status, 304);

  for (const ifNoneMatch of [etag, `W/"other", ${etag}`, etag.slice(2), '*']) {
    const again = reply(index, { ifNoneMatch });
    assert.equal(again.status, 304, ifNoneMatch);
    assert.equal(again.body.length, 0);
    assert.equal(again.headers.etag, etag);
  }
  assert.equal(reply(index, { ifNoneMatch: 'W/"other"' }).status, 200);

  // A new market is a new ETag.
  index.byId[31] = h(31);
  const changed = reply(index, { ifNoneMatch: etag });
  assert.equal(changed.status, 200);
  assert.notEqual(changed.headers.etag, etag);
  assert.deepEqual(JSON.parse(changed.body.toString()).byId, { 30: h(30), 31: h(31) });
});

test('/market-tx is gzipped only for a browser that accepts gzip', () => {
  const reply = marketTxReplies(CONTRACT);
  const index: MarketIndex = { byId: { 30: h(30), 31: h(31) }, height: 500, recent: {} };
  const plain = reply(index, {});

  for (const acceptEncoding of ['gzip', 'gzip, deflate, br, zstd', 'br;q=1.0, gzip;q=0.8', '*']) {
    const zipped = reply(index, { acceptEncoding });
    assert.equal(zipped.headers['content-encoding'], 'gzip', acceptEncoding);
    assert.equal(zipped.headers.vary, 'accept-encoding');
    assert.equal(gunzipSync(zipped.body).toString(), plain.body.toString());
  }
  for (const acceptEncoding of ['br', 'identity', 'gzip;q=0', 'gzip;q=0.000, br']) {
    const r = reply(index, { acceptEncoding });
    assert.equal(r.headers['content-encoding'], undefined, acceptEncoding);
    assert.equal(r.body.toString(), plain.body.toString());
  }
});

test('marketIndexApi picks FastNEAR’s network from the contract unless told otherwise', () => {
  assert.equal(marketIndexApi('v1.veiled-markets.testnet'), 'https://tx.test.fastnear.com');
  assert.equal(marketIndexApi('veiled.near'), 'https://tx.main.fastnear.com');
  assert.equal(marketIndexApi('veiled.near', 'https://tx.example.org/'), 'https://tx.example.org');
});
