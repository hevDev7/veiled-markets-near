// Cross-chain USDC through 1Click, via the relayer's /oneclick routes: the client calls, the check that a quote is
// 1Click's own (its signature) and for what the user asked, the take-out (a quote, then a private withdraw to 1Click's
// deposit address), the bring-in, waiting on a swap until it ends or its deadline passes, and the helpers.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KeyPair, utils } from 'near-api-js';
import { RELAYER_URL, TOKEN, tokenAccount } from './config';
import type { OneClickQuote } from './oneclick';

const p = vi.hoisted(() => ({
  withdraw: vi.fn(async (_token: number, _micro: bigint, _to: string, _onStep?: unknown) => ({ txHash: 'tx-withdraw' })),
}));
vi.mock('./private', () => ({ withdraw: p.withdraw }));

// The tests sign quotes the way 1Click does, with a key of their own in place of 1Click's.
const TEST_SIGNER = KeyPair.fromRandom('ed25519');
vi.stubEnv('VITE_ONECLICK_SIGNER', TEST_SIGNER.getPublicKey().toString());

const {
  ONECLICK_UI, OneClickFailure, TransferExpired, bringIn, chainLabel, deadlineText, fromUnits, quoteHash, quoteIn,
  quoteOut, refundNotice, refundProblem, saveTransfer, savedTransfer, signedBy1Click, takeOut, toUnits, usdcChains,
  waitForSwap, watchUntil,
} = await import('./oneclick');

const BASE_USDC = 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near';
const ARB_USDC = 'nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near';
const NEAR_USDC = `nep141:${tokenAccount(TOKEN.USDCX)}`;
const NEAR_DEPOSIT = '0d'.repeat(32);
const EVM_DEPOSIT = '0x76b4c56085ED136a8744D52bE956396624a730E8';
const USER_EVM = '0x2527D02599Ba641c19FEa793cD0F167589a0f10D';
const DEAD = '0x000000000000000000000000000000000000dEaD';
const NOW = '2026-11-20T10:00:00.000Z';
const DEADLINE = '2026-11-20T10:30:00.000Z';

const OUT_DRY = { amountIn: '10000000', amountInFormatted: '10', amountOut: '9992687', amountOutFormatted: '9.992687', minAmountOut: '9942723', timeEstimate: 19 };
const OUT_QUOTE = { ...OUT_DRY, depositAddress: NEAR_DEPOSIT, deadline: DEADLINE };
const IN_DRY = { amountIn: '25000000', amountInFormatted: '25', amountOut: '24981717', amountOutFormatted: '24.981717', minAmountOut: '24856808', timeEstimate: 19 };
const IN_QUOTE = { ...IN_DRY, depositAddress: EVM_DEPOSIT, deadline: DEADLINE };

/** What the relayer asks 1Click for, with what 1Click adds when it echoes the request back (as a live quote shows). */
const request = (r: Record<string, unknown>) => ({
  dry: false, depositMode: 'SIMPLE', swapType: 'EXACT_INPUT', slippageTolerance: 50, depositType: 'ORIGIN_CHAIN',
  refundType: 'ORIGIN_CHAIN', recipientType: 'DESTINATION_CHAIN', deadline: DEADLINE, confidentiality: 'public',
  quoteWaitingTimeMs: 0, insured: false, appFees: [{ recipient: '5880ad2b362620fadf759cbceb1cd5737ce8c6ed7fb8e9942881e6731f9247dd', fee: 1 }],
  ...r,
});
const OUT_REQUEST = request({ originAsset: NEAR_USDC, destinationAsset: ARB_USDC, amount: '10000000', refundTo: 'alice.near', recipient: USER_EVM });
const IN_REQUEST = request({ originAsset: BASE_USDC, destinationAsset: NEAR_USDC, amount: '25000000', refundTo: USER_EVM, recipient: 'alice.near' });
const TAKE_OUT = { to: ARB_USDC, micro: 10_000_000n, recipient: USER_EVM, refundTo: 'alice.near' };
const BRING_IN = { from: BASE_USDC, amount: 25_000_000n, refundTo: USER_EVM, recipient: 'alice.near' };

/** 1Click's quote response, signed with `key`. */
async function oneClickQuote(quoteRequest: Record<string, unknown>, quote: Record<string, unknown>, key = TEST_SIGNER) {
  const response = { correlationId: 'c', timestamp: NOW, quoteRequest, quote: quote as OneClickQuote, signature: '' };
  const { signature } = key.sign(new TextEncoder().encode(await quoteHash(response)));
  return { ...response, signature: `ed25519:${utils.serialize.base_encode(signature)}` };
}

/** The relayer's answer carrying 1Click's signed quote. */
const signed = async (quoteRequest: Record<string, unknown>, quote: Record<string, unknown>, key?: KeyPair) => ({
  ok: true, quote: await oneClickQuote(quoteRequest, quote, key), registrations: [],
});
const state = (status: string) => ({ ok: true, status, updatedAt: '2026-11-20T10:01:00.000Z', swapDetails: { amountOut: '9992687' } });

/** Stands in for the relayer: answers in order (the last one repeats); an Error is a network failure. */
function relayer(...answers: unknown[]) {
  const fn = vi.fn(async (_url: string, _init?: RequestInit) => {
    const a = answers.length > 1 ? answers.shift() : answers[0];
    if (a instanceof Error) throw a;
    const status = (a as { ok?: boolean })?.ok === false ? 400 : 200;
    return new Response(JSON.stringify(a), { status, headers: { 'content-type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

const bodyOf = (fn: ReturnType<typeof relayer>, call = 0) => JSON.parse(String(fn.mock.calls[call][1]?.body));
const noSleep = vi.fn(async (_ms: number) => {});
/** A sleep that gives up after `naps`, so a wait that never ends fails its test instead of hanging the run. */
const atMost = (naps: number, onNap = (_ms: number) => {}) =>
  vi.fn(async (ms: number) => {
    if (--naps < 0) throw new Error('still polling');
    onNap(ms);
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('the relayer client', () => {
  it('lists USDC on the other chains', async () => {
    const tokens = [{ assetId: BASE_USDC, blockchain: 'base', symbol: 'USDC', decimals: 6 }];
    const fetch = relayer({ ok: true, tokens });

    expect(await usdcChains()).toEqual(tokens);
    expect(fetch.mock.calls[0][0]).toBe(`${RELAYER_URL}/oneclick/tokens`);
  });

  it("asks for a bring-in quote and returns 1Click's quote once its signature checks out", async () => {
    const fetch = relayer(await signed({ ...IN_REQUEST, dry: true }, IN_DRY));

    const q = await quoteIn({ ...BRING_IN, dry: true });

    expect(fetch.mock.calls[0][0]).toBe(`${RELAYER_URL}/oneclick/quote-in`);
    expect(fetch.mock.calls[0][1]?.method).toBe('POST');
    expect(bodyOf(fetch)).toEqual({ from: BASE_USDC, amount: '25000000', refundTo: USER_EVM, recipient: 'alice.near', dry: true });
    expect(q.amountOut).toBe('24981717');
  });

  it('asks for a take-out quote', async () => {
    const fetch = relayer(await signed({ ...OUT_REQUEST, dry: true }, OUT_DRY));

    const q = await quoteOut({ to: ARB_USDC, amount: 10_000_000n, recipient: USER_EVM, refundTo: 'alice.near', dry: true });

    expect(fetch.mock.calls[0][0]).toBe(`${RELAYER_URL}/oneclick/quote-out`);
    expect(bodyOf(fetch)).toEqual({ to: ARB_USDC, amount: '10000000', recipient: USER_EVM, refundTo: 'alice.near', dry: true });
    expect(q.minAmountOut).toBe('9942723');
  });

  it("passes on the relayer's refusal", async () => {
    relayer({ ok: false, error: 'only USDC on a chain other than NEAR can be moved' });

    await expect(usdcChains()).rejects.toThrow(OneClickFailure);
    await expect(usdcChains()).rejects.toThrow('only USDC on a chain other than NEAR can be moved');
  });

  it('says so when the relayer cannot be reached', async () => {
    relayer(new TypeError('Failed to fetch'));

    await expect(usdcChains()).rejects.toThrow(/not reachable/);
  });
});

describe("1Click's signature on a quote", () => {
  // A dry quote 1Click signed (asked for on 2026-11-14 with example addresses), and 1Click's key from its own SDK.
  const ONECLICK_KEY = 'ed25519:reYaWhvwu8Jzo3WUM3zhn6VrhuMEF4eADL17qtRVifc';
  const LIVE = {
    quote: {
      amountIn: '10000000', amountInFormatted: '10.0', amountInUsd: '9.996190000000', minAmountIn: '10000000', amountOut: '9992680',
      amountOutFormatted: '9.99268', amountOutUsd: '9.988872788920', minAmountOut: '9942716', timeEstimate: 19, refundFee: '0',
      withdrawFee: '5300',
    },
    quoteRequest: {
      dry: true, depositMode: 'SIMPLE', swapType: 'EXACT_INPUT', slippageTolerance: 50,
      originAsset: 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1', depositType: 'ORIGIN_CHAIN',
      destinationAsset: ARB_USDC, amount: '10000000', refundTo: 'alice.near', refundType: 'ORIGIN_CHAIN', recipient: USER_EVM,
      recipientType: 'DESTINATION_CHAIN', deadline: '2026-11-14T09:17:59.000Z', confidentiality: 'public', quoteWaitingTimeMs: 0,
      insured: false, appFees: [{ recipient: '5880ad2b362620fadf759cbceb1cd5737ce8c6ed7fb8e9942881e6731f9247dd', fee: 1 }],
    },
    signature: 'ed25519:3cg9o4U44Fbz9WBt9FJF4heMTBtzSq1or9MBKBEiitefCcHWMAqK9UAkUbLsRFThZCyokDNf29obL4FnyTt7ggpM',
    timestamp: '2026-11-14T08:47:59.837Z',
    correlationId: 'a57b98f9-3bb6-4cb2-9ff0-c7cf58b2a3ed',
  };

  it('checks out on a quote 1Click signed, and not once a signed field changes', async () => {
    expect(await signedBy1Click(LIVE, ONECLICK_KEY)).toBe(true);

    expect(await signedBy1Click({ ...LIVE, quoteRequest: { ...LIVE.quoteRequest, recipient: DEAD } }, ONECLICK_KEY)).toBe(false);
    expect(await signedBy1Click({ ...LIVE, quote: { ...LIVE.quote, minAmountOut: '1' } }, ONECLICK_KEY)).toBe(false);
    expect(await signedBy1Click({ ...LIVE, timestamp: '2026-11-14T08:48:00.000Z' }, ONECLICK_KEY)).toBe(false);
    expect(await signedBy1Click({ ...LIVE, signature: 'ed25519:1' }, ONECLICK_KEY)).toBe(false);
    expect(await signedBy1Click(LIVE, TEST_SIGNER.getPublicKey().toString())).toBe(false);
  });

  it('is checked on every quote the relayer passes on', async () => {
    const ask = { to: ARB_USDC, amount: 10_000_000n, recipient: USER_EVM, refundTo: 'alice.near', dry: true };

    relayer(await signed({ ...OUT_REQUEST, dry: true }, OUT_DRY, KeyPair.fromRandom('ed25519')));
    await expect(quoteOut(ask)).rejects.toThrow(/not signed by 1Click/);

    const genuine = await oneClickQuote({ ...OUT_REQUEST, dry: true }, OUT_DRY);
    relayer({ ok: true, quote: { ...genuine, quote: { ...genuine.quote, amountOut: '99999999' } } });
    await expect(quoteOut(ask)).rejects.toThrow(/not signed by 1Click/);

    relayer({ ok: true, quote: { ...genuine, signature: undefined } });
    await expect(quoteOut(ask)).rejects.toThrow(OneClickFailure);
  });
});

describe('taking USDC out to another chain', () => {
  it("gets a real quote, checks 1Click signed it for this take-out, then pays its deposit address from the private balance", async () => {
    const fetch = relayer(await signed(OUT_REQUEST, OUT_QUOTE));
    const onStep = vi.fn();

    const r = await takeOut(TAKE_OUT, onStep);

    expect(bodyOf(fetch)).toEqual({ to: ARB_USDC, amount: '10000000', recipient: USER_EVM, refundTo: 'alice.near', dry: false });
    expect(p.withdraw).toHaveBeenCalledWith(TOKEN.USDCX, 10_000_000n, NEAR_DEPOSIT, onStep);
    expect(r).toEqual({ depositAddress: NEAR_DEPOSIT, txHash: 'tx-withdraw', quote: OUT_QUOTE });
  });

  it('refunds to the NEAR account the user chose', async () => {
    const fetch = relayer(await signed({ ...OUT_REQUEST, refundTo: 'fresh-refund.near' }, OUT_QUOTE));

    await takeOut({ ...TAKE_OUT, refundTo: 'fresh-refund.near' });

    expect(bodyOf(fetch).refundTo).toBe('fresh-refund.near');
    expect(p.withdraw).toHaveBeenCalledTimes(1);
  });

  // The relayer passes the quote on: a relayer that is not honest must not be able to send the USDC elsewhere.
  it.each([
    ['recipient', { recipient: DEAD }],
    ['refund account', { refundTo: 'mallory.near' }],
    ['amount', { amount: '10000001' }],
    ['destination asset', { destinationAsset: BASE_USDC }],
    ['origin asset', { originAsset: 'nep141:usdt.tether-token.near' }],
    ['slippage', { slippageTolerance: 5000 }],
    ['swap type', { swapType: 'FLEX_INPUT' }],
    ['deposit type', { depositType: 'INTENTS' }],
    ['refund type', { refundType: 'INTENTS' }],
    ['recipient type', { recipientType: 'INTENTS' }],
    ['message to the recipient', { customRecipientMsg: '{"deposit":{}}' }],
    ['virtual-chain recipient', { virtualChainRecipient: DEAD }],
    // A dry quote's signature does not cover a deposit address.
    ['kind of quote (a dry run)', { dry: true }],
  ])('withdraws nothing for a quote 1Click signed for another %s', async (_what, change) => {
    relayer(await signed({ ...OUT_REQUEST, ...change }, OUT_QUOTE));

    await expect(takeOut(TAKE_OUT)).rejects.toThrow(OneClickFailure);
    expect(p.withdraw).not.toHaveBeenCalled();
  });

  it('withdraws nothing once the deposit address was changed after 1Click signed the quote', async () => {
    const genuine = await oneClickQuote(OUT_REQUEST, OUT_QUOTE);
    relayer({ ok: true, quote: { ...genuine, quote: { ...genuine.quote, depositAddress: 'ff'.repeat(32) } } });

    await expect(takeOut(TAKE_OUT)).rejects.toThrow(/not signed by 1Click/);
    expect(p.withdraw).not.toHaveBeenCalled();
  });

  it('withdraws nothing for a quote whose deadline has passed', async () => {
    relayer(await signed(OUT_REQUEST, { ...OUT_QUOTE, deadline: '2026-11-20T09:59:00.000Z' }));

    await expect(takeOut(TAKE_OUT)).rejects.toThrow(/expired/);
    expect(p.withdraw).not.toHaveBeenCalled();
  });

  it('withdraws nothing for a quote that needs a deposit memo, which a withdraw cannot send', async () => {
    relayer(await signed(OUT_REQUEST, { ...OUT_QUOTE, depositMemo: '1111111' }));

    await expect(takeOut(TAKE_OUT)).rejects.toThrow(OneClickFailure);
    expect(p.withdraw).not.toHaveBeenCalled();
  });

  it('withdraws nothing when 1Click now promises less than the quote the user saw, beyond the 0.5 % slippage', async () => {
    // 9 942 723 less 0.5 % is 9 893 009.4.
    relayer(await signed(OUT_REQUEST, { ...OUT_QUOTE, minAmountOut: '9893009' }));
    await expect(takeOut({ ...TAKE_OUT, atLeast: 9_942_723n })).rejects.toThrow(/new quote/);
    expect(p.withdraw).not.toHaveBeenCalled();

    relayer(await signed(OUT_REQUEST, { ...OUT_QUOTE, minAmountOut: '9893010' }));
    await takeOut({ ...TAKE_OUT, atLeast: 9_942_723n });
    expect(p.withdraw).toHaveBeenCalledTimes(1);
  });

  it('withdraws nothing when the quote fails or names no deposit address', async () => {
    relayer({ ok: false, error: 'cross-chain transfers are busy right now; try again later' });
    await expect(takeOut(TAKE_OUT)).rejects.toThrow(/busy/);

    relayer(await signed(OUT_REQUEST, { ...OUT_QUOTE, depositAddress: undefined }));
    await expect(takeOut(TAKE_OUT)).rejects.toThrow(OneClickFailure);

    expect(p.withdraw).not.toHaveBeenCalled();
  });
});

describe('bringing USDC in from another chain', () => {
  it("gives the deposit address of a real quote once 1Click's signature shows it is for the user's own account", async () => {
    const fetch = relayer(await signed(IN_REQUEST, IN_QUOTE));

    const q = await bringIn(BRING_IN);

    expect(q.depositAddress).toBe(EVM_DEPOSIT);
    expect(bodyOf(fetch)).toEqual({ from: BASE_USDC, amount: '25000000', refundTo: USER_EVM, recipient: 'alice.near', dry: false });
  });

  it('refuses a quote 1Click signed for another recipient or refund address', async () => {
    relayer(await signed({ ...IN_REQUEST, recipient: 'mallory.near' }, IN_QUOTE));
    await expect(bringIn(BRING_IN)).rejects.toThrow(OneClickFailure);

    relayer(await signed({ ...IN_REQUEST, refundTo: DEAD }, IN_QUOTE));
    await expect(bringIn(BRING_IN)).rejects.toThrow(OneClickFailure);
  });

  it('reads an EVM address in either letter case, as one address', async () => {
    relayer(await signed({ ...IN_REQUEST, refundTo: USER_EVM.toLowerCase() }, IN_QUOTE));

    expect((await bringIn(BRING_IN)).depositAddress).toBe(EVM_DEPOSIT);
  });

  it('keeps the deposit memo the quote names, and refuses one changed after signing', async () => {
    const withMemo = { ...IN_QUOTE, depositAddress: 'GDEPOSIT', depositMemo: '1111111' };
    relayer(await signed(IN_REQUEST, withMemo));
    expect((await bringIn(BRING_IN)).depositMemo).toBe('1111111');

    const genuine = await oneClickQuote(IN_REQUEST, withMemo);
    relayer({ ok: true, quote: { ...genuine, quote: { ...genuine.quote, depositMemo: '2222222' } } });
    await expect(bringIn(BRING_IN)).rejects.toThrow(/not signed by 1Click/);
  });

  it('gives no deposit address when 1Click now promises less than the quote the user saw', async () => {
    relayer(await signed(IN_REQUEST, { ...IN_QUOTE, minAmountOut: '20000000' }));

    await expect(bringIn({ ...BRING_IN, atLeast: 24_856_808n })).rejects.toThrow(/new quote/);
  });
});

describe('waiting on a swap', () => {
  it('reports each status until the swap ends', async () => {
    const fetch = relayer(state('PENDING_DEPOSIT'), state('PROCESSING'), state('SUCCESS'));
    const seen: string[] = [];

    const end = await waitForSwap(NEAR_DEPOSIT, (s) => seen.push(s.status), { sleep: noSleep, everyMs: 10_000 });

    expect(end.status).toBe('SUCCESS');
    expect(seen).toEqual(['PENDING_DEPOSIT', 'PROCESSING', 'SUCCESS']);
    expect(fetch.mock.calls[0][0]).toBe(`${RELAYER_URL}/oneclick/status?depositAddress=${NEAR_DEPOSIT}`);
    expect(noSleep).toHaveBeenCalledTimes(2);
    expect(noSleep).toHaveBeenCalledWith(10_000);
  });

  it('keeps waiting through a failed lookup and an incomplete deposit, which 1Click refunds later', async () => {
    relayer(new TypeError('Failed to fetch'), { ok: false, error: 'Deposit address not found' }, state('INCOMPLETE_DEPOSIT'), state('REFUNDED'));
    const seen: string[] = [];

    const end = await waitForSwap(NEAR_DEPOSIT, (s) => seen.push(s.status), { sleep: noSleep });

    expect(end.status).toBe('REFUNDED');
    expect(seen).toEqual(['INCOMPLETE_DEPOSIT', 'REFUNDED']);
  });

  it('asks with the deposit memo when the quote had one', async () => {
    const fetch = relayer(state('SUCCESS'));

    await waitForSwap('GDEPOSIT', () => {}, { memo: '1111111', sleep: noSleep });

    expect(fetch.mock.calls[0][0]).toBe(`${RELAYER_URL}/oneclick/status?depositAddress=GDEPOSIT&depositMemo=1111111`);
  });

  it('stops when the page stops watching', async () => {
    relayer(state('PENDING_DEPOSIT'));
    const stop = new AbortController();

    const watching = waitForSwap(NEAR_DEPOSIT, () => stop.abort(), { sleep: noSleep, signal: stop.signal });

    await expect(watching).rejects.toThrow(/stopped/);
  });

  it('gives up once the deadline has passed with nothing deposited', async () => {
    relayer(state('PENDING_DEPOSIT'));
    const seen: string[] = [];

    const watching = waitForSwap(NEAR_DEPOSIT, (s) => seen.push(s.status), { sleep: atMost(20), until: 1_000, now: () => 2_000 });

    await expect(watching).rejects.toBeInstanceOf(TransferExpired);
    expect(seen).toEqual(['PENDING_DEPOSIT']);
  });

  it('polls until the deadline while nothing is deposited, then stops', async () => {
    relayer(state('PENDING_DEPOSIT'));
    let t = 0;
    const sleep = atMost(20, (ms) => {
      t += ms;
    });

    const watching = waitForSwap(NEAR_DEPOSIT, () => {}, { sleep, everyMs: 10_000, until: 25_000, now: () => t });

    await expect(watching).rejects.toBeInstanceOf(TransferExpired);
    // Asked at 0, 10 s, 20 s and 30 s: the last answer came after the deadline.
    expect(sleep).toHaveBeenCalledTimes(3);
  });

  it('keeps following a deposit 1Click saw, past the deadline', async () => {
    relayer(state('KNOWN_DEPOSIT_TX'), new TypeError('Failed to fetch'), state('PROCESSING'), state('SUCCESS'));

    const end = await waitForSwap(NEAR_DEPOSIT, () => {}, { sleep: atMost(20), until: 1_000, now: () => 2_000 });

    expect(end.status).toBe('SUCCESS');
  });

  it('stops after the deadline when no answer comes at all', async () => {
    relayer(new TypeError('Failed to fetch'));

    const watching = waitForSwap(NEAR_DEPOSIT, () => {}, { sleep: atMost(20), until: 1_000, now: () => 2_000 });

    await expect(watching).rejects.toBeInstanceOf(TransferExpired);
  });
});

describe('the transfer in progress', () => {
  const memory = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
      keys: () => [...m.keys()],
    };
  };
  const transfer = {
    mode: 'in' as const, amount: '25',
    chain: { assetId: BASE_USDC, blockchain: 'base', symbol: 'USDC', decimals: 6 },
    depositAddress: EVM_DEPOSIT, quote: IN_QUOTE,
  };

  it('is kept per account, so its deposit address and deadline survive a reload', () => {
    const storage = memory();

    saveTransfer('alice.near', transfer, storage);

    expect(savedTransfer('alice.near', storage)).toEqual(transfer);
    expect(savedTransfer('bob.near', storage)).toBeNull();
    expect(storage.keys()).toEqual(['veiled:oneclick:alice.near']);
  });

  it('is forgotten once dismissed', () => {
    const storage = memory();
    saveTransfer('alice.near', transfer, storage);

    saveTransfer('alice.near', null, storage);

    expect(savedTransfer('alice.near', storage)).toBeNull();
  });

  it('reads as none when the browser keeps nothing or the record is damaged', () => {
    const blocked = {
      getItem: () => { throw new Error('SecurityError'); },
      setItem: () => { throw new Error('SecurityError'); },
      removeItem: () => { throw new Error('SecurityError'); },
    };
    expect(() => saveTransfer('alice.near', transfer, blocked)).not.toThrow();
    expect(savedTransfer('alice.near', blocked)).toBeNull();
    expect(savedTransfer('alice.near', { getItem: () => '{not json' })).toBeNull();
    expect(savedTransfer('alice.near', undefined)).toBeNull();
  });
});

describe('deadlines and refunds', () => {
  const saved = { mode: 'in' as const, chain: { assetId: BASE_USDC, blockchain: 'base', symbol: 'USDC', decimals: 6 }, amount: '25', depositAddress: EVM_DEPOSIT };

  it('watches a transfer until 10 minutes after its deadline, for a deposit sent at the last moment', () => {
    expect(watchUntil({ ...saved, quote: IN_QUOTE })).toBe(Date.parse('2026-11-20T10:40:00.000Z'));
    expect(watchUntil({ ...saved, quote: { ...IN_QUOTE, deadline: undefined } })).toBeUndefined();
    expect(watchUntil({ ...saved, quote: { ...IN_QUOTE, deadline: 'soon' } })).toBeUndefined();
  });

  it('writes a deadline with its date, not the time alone', () => {
    expect(deadlineText(DEADLINE)).toMatch(/2026/);
    expect(deadlineText(undefined)).toBe('the deadline');
    expect(deadlineText('soon')).toBe('the deadline');
  });

  it('warns that refunding to the connected account links the take-out to it', () => {
    expect(refundNotice('alice.near', 'alice.near')).toMatch(/links this take-out to alice\.near/);
    expect(refundNotice('fresh-refund.near', 'alice.near')).toBeNull();
  });

  it('takes a refund account only when it is a NEAR account', () => {
    expect(refundProblem('alice.near')).toBeNull();
    expect(refundProblem('0d'.repeat(32))).toBeNull();
    for (const bad of ['', 'a', 'Alice.near', 'alice..near', 'alice.near.', USER_EVM]) expect(refundProblem(bad)).toMatch(/NEAR account/);
  });
});

describe('amounts and chains', () => {
  it('reads an amount typed in a token with any number of decimals', () => {
    expect(toUnits('1.5', 6)).toBe(1_500_000n);
    expect(toUnits('0.000001', 6)).toBe(1n);
    expect(toUnits(' 25 ', 6)).toBe(25_000_000n);
    expect(toUnits('2', 18)).toBe(2n * 10n ** 18n);
    for (const bad of ['1.0000001', '0', '0.0', '', 'abc', '-1', '1e6', '1,5']) expect(toUnits(bad, 6)).toBeNull();
  });

  it('writes base units back as a plain decimal', () => {
    expect(fromUnits(24_998_308n, 6)).toBe('24.998308');
    expect(fromUnits('5000000', 6)).toBe('5');
    expect(fromUnits((3n * 10n ** 18n) / 2n, 18)).toBe('1.5');
    expect(fromUnits(1n, 6)).toBe('0.000001');
  });

  it('names chains, and tells two USDC assets on one chain apart', () => {
    const all = [
      { assetId: BASE_USDC, blockchain: 'base', symbol: 'USDC', decimals: 6 },
      { assetId: ARB_USDC, blockchain: 'arb', symbol: 'USDC', decimals: 6 },
      { assetId: 'nep141:hc-a.omft.near', blockchain: 'hypercore', symbol: 'USDC', decimals: 8, contractAddress: '0xaaaaaa111111' },
      { assetId: 'nep141:hc-b.omft.near', blockchain: 'hypercore', symbol: 'USDC', decimals: 6, contractAddress: '0xbbbbbb222222' },
      { assetId: 'nep141:q.omft.near', blockchain: 'qtc', symbol: 'USDC', decimals: 6 },
    ];

    expect(all.map((c) => chainLabel(c, all))).toEqual([
      'Base', 'Arbitrum', 'Hyperliquid (…111111)', 'Hyperliquid (…222222)', 'QTC',
    ]);
  });

  it('is off on a testnet build: 1Click serves mainnet only', () => {
    expect(ONECLICK_UI).toBe(false);
  });
});
