// 1Click (NEAR Intents) for USDC in and out of Veiled: what the backend asks 1Click, what it refuses, and which
// registrations the relayer pays for. Run: npx tsx --test src/oneclick.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OneClickBusy, OneClickError, OneClickRefused, oneClick, type QuoteLogEntry, type UsdcChain } from './oneclick';

const NEAR_USDC = '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1';
const NEAR_USDC_ASSET = `nep141:${NEAR_USDC}`;
const BASE_USDC = 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near';
const ARB_USDC = 'nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near';
const ETH = 'nep141:eth.omft.near';
const AT = '2026-11-20T10:00:00.000Z';
const TOKENS = [
  { assetId: NEAR_USDC_ASSET, decimals: 6, blockchain: 'near', symbol: 'USDC', price: 1, priceUpdatedAt: AT, contractAddress: NEAR_USDC },
  { assetId: BASE_USDC, decimals: 6, blockchain: 'base', symbol: 'USDC', price: 1, priceUpdatedAt: AT, contractAddress: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' },
  { assetId: ARB_USDC, decimals: 6, blockchain: 'arb', symbol: 'USDC', price: 1, priceUpdatedAt: AT, contractAddress: '0xaf88d065e77c8cc2239327c5edb3a432268e5831' },
  { assetId: ETH, decimals: 18, blockchain: 'eth', symbol: 'ETH', price: 3100, priceUpdatedAt: AT },
  { assetId: 'nep141:wrap.near', decimals: 24, blockchain: 'near', symbol: 'wNEAR', price: 2.8, priceUpdatedAt: AT, contractAddress: 'wrap.near' },
];
const EVM_DEPOSIT = '0x76b4c56085ED136a8744D52bE956396624a730E8';
const NEAR_DEPOSIT = '0d'.repeat(32);
const USER_EVM = '0x2527D02599Ba641c19FEa793cD0F167589a0f10D';

/** A 1Click quote response for `req`, shaped as the API shapes it. */
function quoteFor(req: any, change: Record<string, unknown> = {}) {
  const out = ((BigInt(req.amount) * 9999n) / 10000n).toString();
  return {
    correlationId: '550e8400-e29b-41d4-a716-446655440000',
    timestamp: AT,
    signature: 'ed25519:4QbSigned',
    quoteRequest: req,
    quote: {
      ...(req.dry
        ? {}
        : { depositAddress: req.originAsset === NEAR_USDC_ASSET ? NEAR_DEPOSIT : EVM_DEPOSIT, deadline: req.deadline, timeWhenInactive: req.deadline }),
      amountIn: req.amount, amountInFormatted: '25', amountInUsd: '25', minAmountIn: req.amount,
      amountOut: out, amountOutFormatted: '24.99', amountOutUsd: '24.99', minAmountOut: out, timeEstimate: 30,
      ...change,
    },
  };
}

interface Options {
  registered?: string[];
  budget?: number;
  apiKey?: string | null;
  veiledTokens?: string[];
  quote?: (req: any) => { status: number; body: unknown };
  status?: { status: number; body: unknown };
  logFails?: boolean;
  down?: boolean;
}

function harness(o: Options = {}) {
  let now = Date.parse(AT);
  const events: string[] = [];
  const requests: { method: string; url: string; headers: Record<string, string>; body?: any }[] = [];
  const logged: QuoteLogEntry[] = [];
  const registered = new Set(o.registered ?? []);
  const answer = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const standIn = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    requests.push({ method: init?.method ?? 'GET', url: u, headers: (init?.headers ?? {}) as Record<string, string>, body });
    const path = new URL(u).pathname;
    events.push(`1click ${path}`);
    if (o.down) throw new TypeError('fetch failed');
    if (path === '/v0/tokens') return answer(200, TOKENS);
    if (path === '/v0/quote') {
      const a = o.quote?.(body) ?? { status: 200, body: quoteFor(body) };
      return answer(a.status, a.body);
    }
    if (path === '/v0/status' && o.status) return answer(o.status.status, o.status.body);
    return answer(404, { message: 'Not Found' });
  }) as typeof fetch;
  const chain: UsdcChain = {
    storageBalanceOf: async (token, accountId) => {
      assert.equal(token, NEAR_USDC);
      return registered.has(accountId) ? { total: '1250000000000000000000', available: '0' } : null;
    },
    register: async (token, accountId) => {
      assert.equal(token, NEAR_USDC);
      events.push(`register ${accountId}`);
      registered.add(accountId);
      return { txHash: `tx-${accountId.slice(0, 8)}` };
    },
  };
  const oc = oneClick(
    {
      baseUrl: 'https://1click.test',
      apiKey: o.apiKey === null ? undefined : (o.apiKey ?? 'partner-jwt'),
      nearUsdc: NEAR_USDC,
      registerPerHour: o.budget ?? 30,
    },
    {
      fetch: standIn,
      chain,
      now: () => now,
      veiledTokens: async () => o.veiledTokens ?? [NEAR_USDC, 'usdt.tether-token.near'],
      logQuote: (entry) => {
        if (o.logFails) throw new Error('disk full');
        events.push('log');
        logged.push(entry);
      },
    },
  );
  return {
    oc, events, requests, logged, registered,
    quoteCalls: () => requests.filter((r) => r.url.endsWith('/v0/quote')),
    advance: (ms: number) => { now += ms; },
  };
}

const bringIn = { from: BASE_USDC, amount: '25000000', refundTo: USER_EVM, recipient: 'alice.near', dry: false };
const takeOut = { to: ARB_USDC, amount: '10000000', recipient: USER_EVM, refundTo: 'alice.near', dry: false };

test('lists USDC on the other chains 1Click serves, asking with the partner key', async () => {
  const h = harness();

  const list = await h.oc.tokens();

  assert.deepEqual(list.map((t) => t.assetId), [BASE_USDC, ARB_USDC]);
  assert.deepEqual(list[0], { assetId: BASE_USDC, blockchain: 'base', symbol: 'USDC', decimals: 6, contractAddress: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' });
  assert.equal(h.requests[0].url, 'https://1click.test/v0/tokens');
  assert.equal(h.requests[0].headers['X-API-Key'], 'partner-jwt');
});

test('reads the token list again only after ten minutes', async () => {
  const h = harness();

  await h.oc.tokens();
  await h.oc.tokens();
  assert.equal(h.requests.length, 1);

  h.advance(10 * 60_000 + 1);
  await h.oc.tokens();
  assert.equal(h.requests.length, 2);
});

test('sends no key header when no partner key is set', async () => {
  const h = harness({ apiKey: null });

  await h.oc.tokens();

  assert.equal('X-API-Key' in h.requests[0].headers, false);
});

test("quotes a bring-in: USDC from another chain to the user's own NEAR account", async () => {
  const h = harness({ registered: ['alice.near'] });

  const out = await h.oc.quoteIn(bringIn);

  const [sent] = h.quoteCalls();
  assert.equal(sent.method, 'POST');
  assert.equal(sent.headers['X-API-Key'], 'partner-jwt');
  assert.deepEqual(sent.body, {
    dry: false, swapType: 'EXACT_INPUT', slippageTolerance: 50,
    originAsset: BASE_USDC, depositType: 'ORIGIN_CHAIN',
    destinationAsset: NEAR_USDC_ASSET, amount: '25000000',
    refundTo: USER_EVM, refundType: 'ORIGIN_CHAIN',
    recipient: 'alice.near', recipientType: 'DESTINATION_CHAIN',
    deadline: '2026-11-20T11:00:00.000Z',
  });
  assert.deepEqual(out.quote, quoteFor(sent.body));
  assert.deepEqual(out.registrations, []);
});

test('keeps every quote 1Click signs, with its signature, before handing it out', async () => {
  const h = harness({ registered: ['alice.near'] });

  const real = await h.oc.quoteIn(bringIn);
  await h.oc.quoteIn({ ...bringIn, dry: true });

  assert.deepEqual(h.logged[0], { at: AT, direction: 'in', response: real.quote });
  assert.equal(h.logged.length, 2);
  assert.equal(h.logged[1].response.signature, 'ed25519:4QbSigned');
});

test('hands out no deposit address it could not keep, and pays for nothing after that', async () => {
  const i = harness({ registered: ['alice.near'], logFails: true });
  await assert.rejects(i.oc.quoteIn(bringIn), /disk full/);

  const o = harness({ registered: ['alice.near'], logFails: true });
  await assert.rejects(o.oc.quoteOut(takeOut), /disk full/);
  assert.ok(!o.events.includes(`register ${NEAR_DEPOSIT}`));
});

test("registers the user's NEAR account on USDC before a bring-in quote, so 1Click can deliver to it", async () => {
  const h = harness();

  const out = await h.oc.quoteIn(bringIn);

  assert.deepEqual(h.events, ['1click /v0/tokens', 'register alice.near', '1click /v0/quote', 'log']);
  assert.deepEqual(out.registrations, [{ accountId: 'alice.near', txHash: 'tx-alice.ne' }]);
});

test('registers nothing for an account already on USDC, or for a dry quote', async () => {
  const known = harness({ registered: ['alice.near'] });
  await known.oc.quoteIn(bringIn);

  const dry = harness();
  await dry.oc.quoteIn({ ...bringIn, dry: true });

  assert.ok(!known.events.some((e) => e.startsWith('register')));
  assert.ok(!dry.events.some((e) => e.startsWith('register')));
});

test('brings in nothing but USDC from another chain', async () => {
  for (const from of [ETH, NEAR_USDC_ASSET, 'nep141:wrap.near', 'nep141:not-listed.near']) {
    const h = harness({ registered: ['alice.near'] });
    await assert.rejects(h.oc.quoteIn({ ...bringIn, from }), OneClickRefused, from);
    assert.equal(h.quoteCalls().length, 0, from);
  }
});

test("quotes a take-out: USDC on NEAR to another chain, refunds going to the user's NEAR account", async () => {
  const h = harness({ registered: ['alice.near', NEAR_DEPOSIT] });

  const out = await h.oc.quoteOut(takeOut);

  const [sent] = h.quoteCalls();
  assert.deepEqual(sent.body, {
    dry: false, swapType: 'EXACT_INPUT', slippageTolerance: 50,
    originAsset: NEAR_USDC_ASSET, depositType: 'ORIGIN_CHAIN',
    destinationAsset: ARB_USDC, amount: '10000000',
    refundTo: 'alice.near', refundType: 'ORIGIN_CHAIN',
    recipient: USER_EVM, recipientType: 'DESTINATION_CHAIN',
    deadline: '2026-11-20T10:30:00.000Z',
  });
  assert.equal(out.quote.quote.depositAddress, NEAR_DEPOSIT);
  assert.deepEqual(h.logged.map((e) => e.direction), ['out']);
});

test('registers the 1Click deposit address on USDC, so the private withdraw can pay it', async () => {
  const h = harness();

  const out = await h.oc.quoteOut(takeOut);

  // The refund account first (a refund must be deliverable), the deposit address once 1Click has named it.
  assert.deepEqual(h.events, ['1click /v0/tokens', 'register alice.near', '1click /v0/quote', 'log', `register ${NEAR_DEPOSIT}`]);
  assert.deepEqual(out.registrations.map((r) => r.accountId), ['alice.near', NEAR_DEPOSIT]);

  const dry = harness();
  await dry.oc.quoteOut({ ...takeOut, dry: true });
  assert.ok(!dry.events.some((e) => e.startsWith('register')));
});

test('refuses a take-out quote the private withdraw could not pay, and registers nothing for it', async () => {
  const unusable = [
    { depositMemo: '1111111' }, // a withdraw cannot attach a memo
    { depositAddress: EVM_DEPOSIT }, // not a NEAR account
    { depositAddress: undefined }, // no address at all
    { amountIn: '9999999' }, // not the amount the withdraw will send
  ];
  for (const change of unusable) {
    const h = harness({ registered: ['alice.near'], quote: (req) => ({ status: 200, body: quoteFor(req, change) }) });
    await assert.rejects(h.oc.quoteOut(takeOut), OneClickError, JSON.stringify(change));
    assert.ok(!h.events.some((e) => e.startsWith('register')), JSON.stringify(change));
    // Kept all the same: it is 1Click's signed answer.
    assert.equal(h.logged.length, 1);
  }
});

test('takes nothing but USDC out, and only to another chain', async () => {
  for (const to of [ETH, NEAR_USDC_ASSET]) {
    const h = harness({ registered: ['alice.near'] });
    await assert.rejects(h.oc.quoteOut({ ...takeOut, to }), OneClickRefused, to);
    assert.equal(h.quoteCalls().length, 0, to);
  }
});

test('refuses both ways when the Veiled contract does not take this USDC', async () => {
  const h = harness({ registered: ['alice.near'], veiledTokens: ['usdt.tether-token.near'] });

  await assert.rejects(h.oc.quoteIn(bringIn), OneClickRefused);
  await assert.rejects(h.oc.quoteOut(takeOut), OneClickRefused);
  assert.equal(h.quoteCalls().length, 0);
});

test('checks amounts, accounts and addresses before asking anyone', async () => {
  const badIn: unknown[] = [
    { ...bringIn, amount: '0' }, { ...bringIn, amount: '1.5' }, { ...bringIn, amount: '-5' }, { ...bringIn, amount: '' },
    { ...bringIn, amount: '0010' }, { ...bringIn, amount: '1'.repeat(40) }, { ...bringIn, amount: 25 },
    { ...bringIn, recipient: 'Alice.near' }, { ...bringIn, recipient: 'a' }, { ...bringIn, recipient: 'alice..near' },
    { ...bringIn, refundTo: '' }, { ...bringIn, refundTo: '0x12 34' }, { ...bringIn, refundTo: 'x'.repeat(129) },
    { ...bringIn, dry: 'false' },
  ];
  for (const req of badIn) {
    const h = harness({ registered: ['alice.near'] });
    await assert.rejects(h.oc.quoteIn(req as typeof bringIn), OneClickRefused, JSON.stringify(req));
    assert.equal(h.requests.length, 0, JSON.stringify(req));
  }
  const badOut: unknown[] = [
    { ...takeOut, refundTo: 'Alice.near' }, { ...takeOut, recipient: '' }, { ...takeOut, amount: '1e6' }, { ...takeOut, dry: 1 },
  ];
  for (const req of badOut) {
    const h = harness({ registered: ['alice.near'] });
    await assert.rejects(h.oc.quoteOut(req as typeof takeOut), OneClickRefused, JSON.stringify(req));
    assert.equal(h.requests.length, 0, JSON.stringify(req));
  }
});

test('passes on why 1Click refused a quote, and says when 1Click itself failed', async () => {
  const low = harness({
    registered: ['alice.near'],
    quote: () => ({ status: 400, body: { message: 'Amount is too low for bridge, try at least 1000000' } }),
  });
  await assert.rejects(low.oc.quoteIn(bringIn), (e: unknown) =>
    e instanceof OneClickError && e.status === 400 && e.message === 'Amount is too low for bridge, try at least 1000000');

  const key = harness({ registered: ['alice.near'], quote: () => ({ status: 401, body: {} }) });
  await assert.rejects(key.oc.quoteIn(bringIn), (e: unknown) =>
    e instanceof OneClickError && e.status === 502 && /partner key/.test(e.message));

  const sick = harness({ registered: ['alice.near'], quote: () => ({ status: 503, body: 'upstream down' }) });
  await assert.rejects(sick.oc.quoteIn(bringIn), (e: unknown) =>
    e instanceof OneClickError && e.status === 502 && /1Click answered 503/.test(e.message));

  const down = harness({ registered: ['alice.near'], down: true });
  await assert.rejects(down.oc.quoteIn(bringIn), (e: unknown) =>
    e instanceof OneClickError && e.status === 502 && /not reachable/.test(e.message));
});

test('spends at most the hourly budget on registrations', async () => {
  const h = harness({ budget: 2 });

  await h.oc.quoteIn({ ...bringIn, recipient: 'alice.near' });
  await h.oc.quoteIn({ ...bringIn, recipient: 'bob.near' });
  await assert.rejects(h.oc.quoteIn({ ...bringIn, recipient: 'carol.near' }), OneClickBusy);
  assert.equal(h.quoteCalls().length, 2);

  // An account already on USDC costs nothing, so it still goes through.
  await h.oc.quoteIn({ ...bringIn, recipient: 'alice.near' });
  assert.equal(h.quoteCalls().length, 3);

  h.advance(60 * 60_000);
  await h.oc.quoteIn({ ...bringIn, recipient: 'carol.near' });
  assert.ok(h.registered.has('carol.near'));
});

test("reads a swap's status by its deposit address", async () => {
  const swapDetails = {
    intentHashes: ['5Hq'], nearTxHashes: ['8Tx'], originChainTxHashes: [], destinationChainTxHashes: [], amountOut: '24997500',
  };
  const h = harness({
    status: { status: 200, body: { correlationId: 'c', quoteResponse: {}, status: 'SUCCESS', updatedAt: AT, swapDetails } },
  });

  const s = await h.oc.status(EVM_DEPOSIT);
  await h.oc.status(EVM_DEPOSIT, '1111111');

  assert.deepEqual(s, { status: 'SUCCESS', updatedAt: AT, swapDetails });
  assert.equal(h.requests[0].url, `https://1click.test/v0/status?depositAddress=${EVM_DEPOSIT}`);
  assert.equal(h.requests[0].headers['X-API-Key'], 'partner-jwt');
  assert.equal(h.requests[1].url, `https://1click.test/v0/status?depositAddress=${EVM_DEPOSIT}&depositMemo=1111111`);

  for (const bad of ['', 'a b', 'x'.repeat(129)]) await assert.rejects(h.oc.status(bad), OneClickRefused, bad);
  assert.equal(h.requests.length, 2);

  const unknown = harness({ status: { status: 404, body: { message: 'Deposit address not found' } } });
  await assert.rejects(unknown.oc.status(EVM_DEPOSIT), (e: unknown) => e instanceof OneClickError && e.status === 404);
});
