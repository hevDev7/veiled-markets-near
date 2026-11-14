// Cross-chain USDC through 1Click (NEAR Intents), via the relayer's /oneclick routes (backend/src/oneclick.ts).
// Bring-in: 1Click delivers USDC from another chain to the user's own NEAR account; a deposit (gasless when the wallet
// and the relayer offer it) then moves it into the private balance. Take-out: a private withdraw pays 1Click's deposit
// address on NEAR, and 1Click sends USDC on to the other chain; a refund comes back as public USDC to the NEAR account
// the user names. 1Click serves mainnet only.
//
// The relayer only passes 1Click's quotes on. A quote is used only when it carries 1Click's own signature and is for
// exactly what the user asked (assets, amount, recipient, refund address, deposit and refund kinds, at most 0.5 %
// slippage), so a relayer that is not honest cannot point a deposit at an address of its choosing. App fees are not
// signed; they show in the signed amounts, so a real quote must promise no less than the quote the user was shown,
// less that slippage.
import { utils } from 'near-api-js';
import { NEAR_NETWORK, RELAYER_URL, TOKEN, tokenAccount } from './config';
import { withdraw, type PrivateStep } from './private';

const env = import.meta.env as Record<string, string | undefined>;
/** The cross-chain section shows only on a mainnet build that sets VITE_ONECLICK=1. */
export const ONECLICK_UI = env.VITE_ONECLICK === '1' && (NEAR_NETWORK as string) === 'mainnet';
/** The key 1Click signs quotes with (from its TypeScript SDK, 0.1.26); VITE_ONECLICK_SIGNER replaces it if 1Click changes it. */
const ONECLICK_SIGNER = env.VITE_ONECLICK_SIGNER || 'ed25519:reYaWhvwu8Jzo3WUM3zhn6VrhuMEF4eADL17qtRVifc';
/** The slippage the relayer asks for (backend SLIPPAGE_BPS), in basis points. */
const MAX_SLIPPAGE_BPS = 50;
/** The page watches a transfer this long past its deadline, for a deposit sent at the last moment. */
const WATCH_AFTER_DEADLINE_MS = 10 * 60_000;

export interface UsdcChain { assetId: string; blockchain: string; symbol: string; decimals: number; contractAddress?: string }
export interface OneClickQuote {
  depositAddress?: string;
  depositMemo?: string;
  amountIn: string;
  amountInFormatted?: string;
  amountOut: string;
  amountOutFormatted?: string;
  minAmountOut: string;
  deadline?: string;
  /** Seconds from a confirmed deposit to delivery. */
  timeEstimate?: number;
  [field: string]: unknown;
}
/** 1Click's answer to a quote request, as the relayer passes it on: what was asked, the quote, and 1Click's signature. */
export interface SignedQuote {
  quoteRequest: Record<string, unknown>;
  quote: OneClickQuote;
  signature?: string;
  timestamp?: string;
  correlationId?: string;
}
/** 1Click's swap states. INCOMPLETE_DEPOSIT (less than quoted arrived) ends as REFUNDED after the deadline. */
export type SwapStatus =
  | 'PENDING_DEPOSIT' | 'KNOWN_DEPOSIT_TX' | 'PROCESSING' | 'SUCCESS' | 'INCOMPLETE_DEPOSIT' | 'REFUNDED' | 'FAILED';
export interface SwapState {
  status: SwapStatus;
  updatedAt: string;
  swapDetails?: {
    amountOut?: string;
    amountOutFormatted?: string;
    refundedAmountFormatted?: string;
    destinationChainTxHashes?: { hash: string; explorerUrl: string }[];
  };
}

export class OneClickFailure extends Error {}
/** The deadline passed and 1Click saw no deposit: the page stops watching, and stops offering the address. */
export class TransferExpired extends OneClickFailure {}

async function call<T>(path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(
      `${RELAYER_URL}${path}`,
      body === undefined
        ? undefined
        : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
    );
  } catch {
    throw new OneClickFailure(`The relayer at ${RELAYER_URL} is not reachable.`);
  }
  const out = await res.json().catch(() => ({ ok: false, error: `The relayer answered ${res.status}.` }));
  if (!out?.ok) throw new OneClickFailure(String(out?.error ?? 'The cross-chain request failed.'));
  return out as T;
}

/** JSON with object keys sorted and undefined members left out, as json-stable-stringify writes it. */
function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? 'null' : stableJson(x))).join(',')}]`;
  if (v !== null && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const members = Object.keys(o).sort().filter((k) => o[k] !== undefined);
    return `{${members.map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

const set = <T>(v: T) => (v ? v : undefined);

/** The text 1Click signs, as its SDK's quoteHash: the signed fields as stable JSON, hashed with SHA-256, in base58. */
export async function quoteHash(r: SignedQuote): Promise<string> {
  const q = r.quoteRequest;
  const o = r.quote;
  const request = {
    dry: q.dry, swapType: q.swapType, slippageTolerance: q.slippageTolerance, originAsset: q.originAsset,
    depositType: q.depositType, destinationAsset: q.destinationAsset, amount: q.amount, refundTo: q.refundTo,
    refundType: q.refundType, recipient: q.recipient, recipientType: q.recipientType, deadline: q.deadline,
    quoteWaitingTimeMs: set(q.quoteWaitingTimeMs), referral: set(q.referral), virtualChainRecipient: set(q.virtualChainRecipient),
    virtualChainRefundRecipient: set(q.virtualChainRefundRecipient), customRecipientMsg: set(q.customRecipientMsg),
  };
  const amounts = {
    amountIn: o.amountIn, amountInFormatted: o.amountInFormatted, amountInUsd: o.amountInUsd, minAmountIn: o.minAmountIn,
    amountOut: o.amountOut, amountOutFormatted: o.amountOutFormatted, amountOutUsd: o.amountOutUsd, minAmountOut: o.minAmountOut,
  };
  // A dry quote's signature covers its amounts only: no deposit address, deadline or fees.
  const quote = q.dry
    ? amounts
    : {
        ...amounts, depositAddress: set(o.depositAddress), depositMemo: set(o.depositMemo), deadline: set(o.deadline),
        timeWhenInactive: set(o.timeWhenInactive), timeEstimate: set(o.timeEstimate), refundFee: set(o.refundFee),
        withdrawFee: set(o.withdrawFee),
      };
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stableJson({ ...request, ...quote, timestamp: r.timestamp })));
  return utils.serialize.base_encode(new Uint8Array(digest));
}

/** Whether `key` (1Click's, unless said otherwise) signed this quote: its SDK's verifyQuoteSignature. */
export async function signedBy1Click(r: SignedQuote, key: string = ONECLICK_SIGNER): Promise<boolean> {
  try {
    if (typeof r.signature !== 'string') return false;
    const message = new TextEncoder().encode(await quoteHash(r));
    const signature = utils.serialize.base_decode(r.signature.replace(/^ed25519:/, ''));
    return utils.PublicKey.fromString(key).verify(message, signature);
  } catch {
    return false;
  }
}

/** What the user asked 1Click for. */
interface Asked {
  dry: boolean;
  originAsset: string;
  destinationAsset: string;
  amount: bigint;
  recipient: string;
  refundTo: string;
}

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
/** An EVM address reads the same in any letter case; every other address must match exactly. */
const sameAddress = (a: unknown, b: string) =>
  typeof a === 'string' && (a === b || (EVM_ADDRESS.test(a) && EVM_ADDRESS.test(b) && a.toLowerCase() === b.toLowerCase()));

/** The first way a quote differs from what was asked, if any. */
function differs(q: Record<string, unknown>, o: OneClickQuote, a: Asked): string | undefined {
  const amount = a.amount.toString();
  const slippage = q.slippageTolerance;
  const checks: [string, boolean][] = [
    // A dry quote's signature does not cover a deposit address.
    ['kind of quote', q.dry === a.dry],
    ['swap type', q.swapType === 'EXACT_INPUT'],
    ['slippage', typeof slippage === 'number' && slippage >= 0 && slippage <= MAX_SLIPPAGE_BPS],
    ['origin asset', q.originAsset === a.originAsset],
    ['destination asset', q.destinationAsset === a.destinationAsset],
    ['amount', q.amount === amount && o.amountIn === amount],
    ['recipient', sameAddress(q.recipient, a.recipient)],
    ['refund address', sameAddress(q.refundTo, a.refundTo)],
    ['deposit type', q.depositType === 'ORIGIN_CHAIN'],
    ['refund type', q.refundType === 'ORIGIN_CHAIN'],
    ['recipient type', q.recipientType === 'DESTINATION_CHAIN'],
    ['delivery', !q.customRecipientMsg && !q.virtualChainRecipient && !q.virtualChainRefundRecipient],
  ];
  return checks.find(([, ok]) => !ok)?.[0];
}

/** A quote the relayer passed on, once it shows 1Click signed it for exactly what was asked. */
async function checkedQuote(path: string, body: Record<string, unknown>, asked: Asked): Promise<OneClickQuote> {
  const r = (await call<{ quote?: SignedQuote }>(path, body)).quote;
  if (!r?.quote || !r.quoteRequest || typeof r.quoteRequest !== 'object') throw new OneClickFailure('The relayer sent no 1Click quote.');
  if (!(await signedBy1Click(r))) throw new OneClickFailure('This quote is not signed by 1Click, so it was not used. Nothing was sent.');
  const off = differs(r.quoteRequest, r.quote, asked);
  if (off) throw new OneClickFailure(`1Click's quote is for another ${off} than you asked for, so it was not used. Nothing was sent.`);
  return r.quote;
}

/** USDC on NEAR, as 1Click names it. */
function nearUsdc(): string {
  const account = tokenAccount(TOKEN.USDCX);
  if (!account) throw new OneClickFailure('USDC is not set up on this build.');
  return `nep141:${account}`;
}

/** USDC on the chains other than NEAR that 1Click serves. */
export async function usdcChains(): Promise<UsdcChain[]> {
  return (await call<{ tokens: UsdcChain[] }>('/oneclick/tokens')).tokens;
}

/** `amount` in base units of `from`; a real (not dry) quote names the deposit address on that chain. */
export async function quoteIn(r: { from: string; amount: bigint; refundTo: string; recipient: string; dry: boolean }) {
  const asked = { dry: r.dry, originAsset: r.from, destinationAsset: nearUsdc(), amount: r.amount, recipient: r.recipient, refundTo: r.refundTo };
  return checkedQuote('/oneclick/quote-in', {
    from: r.from, amount: r.amount.toString(), refundTo: r.refundTo, recipient: r.recipient, dry: r.dry,
  }, asked);
}

/** `amount` in micro USDC; a real quote names a deposit address on NEAR, already registered on USDC. */
export async function quoteOut(r: { to: string; amount: bigint; recipient: string; refundTo: string; dry: boolean }) {
  const asked = { dry: r.dry, originAsset: nearUsdc(), destinationAsset: r.to, amount: r.amount, recipient: r.recipient, refundTo: r.refundTo };
  return checkedQuote('/oneclick/quote-out', {
    to: r.to, amount: r.amount.toString(), recipient: r.recipient, refundTo: r.refundTo, dry: r.dry,
  }, asked);
}

type Payable = OneClickQuote & { depositAddress: string };

/**
 * A real quote can be paid: it names a deposit address, its deadline is still ahead, and it promises at least
 * `atLeast` (the least the quote shown to the user promised), less the slippage.
 */
function assertPayable(q: OneClickQuote, atLeast?: bigint): asserts q is Payable {
  if (!q.depositAddress) throw new OneClickFailure('1Click sent no deposit address.');
  if (!(Date.parse(q.deadline ?? '') > Date.now())) {
    throw new OneClickFailure("1Click's quote has expired; check this device's clock and get a new quote. Nothing was sent.");
  }
  const promised = /^\d+$/.test(q.minAmountOut) ? BigInt(q.minAmountOut) : -1n;
  if (atLeast !== undefined && promised * 10_000n < atLeast * BigInt(10_000 - MAX_SLIPPAGE_BPS)) {
    throw new OneClickFailure('1Click now promises less than the quote you saw: get a new quote. Nothing was sent.');
  }
}

/** A real bring-in quote, whose deposit address the user can send to before its deadline. */
export async function bringIn(r: { from: string; amount: bigint; refundTo: string; recipient: string; atLeast?: bigint }): Promise<Payable> {
  const quote = await quoteIn({ from: r.from, amount: r.amount, refundTo: r.refundTo, recipient: r.recipient, dry: false });
  assertPayable(quote, r.atLeast);
  return quote;
}

/** Takes USDC from the private balance to another chain: a real quote, then a private withdraw to its address. */
export async function takeOut(
  r: { to: string; micro: bigint; recipient: string; refundTo: string; atLeast?: bigint },
  onStep?: (s: PrivateStep) => void,
): Promise<{ depositAddress: string; txHash: string; quote: OneClickQuote }> {
  const quote = await quoteOut({ to: r.to, amount: r.micro, recipient: r.recipient, refundTo: r.refundTo, dry: false });
  assertPayable(quote, r.atLeast);
  // The private withdraw pays with a plain ft_transfer, which carries no memo.
  if (quote.depositMemo) throw new OneClickFailure('1Click asked for a deposit memo, which a withdraw cannot send. Nothing was sent.');
  const w = await withdraw(TOKEN.USDCX, r.micro, quote.depositAddress, onStep);
  return { depositAddress: quote.depositAddress, txHash: w.txHash, quote };
}

const ENDED = new Set<SwapStatus>(['SUCCESS', 'REFUNDED', 'FAILED']);
const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Polls a swap until it succeeds, is refunded or fails, reporting every state. A failed lookup is retried: 1Click
 * may not know a deposit address for a moment, and the relayer may restart. Past `until` (ms) with no deposit seen,
 * it stops with TransferExpired; a deposit 1Click saw is followed to its end.
 */
export async function waitForSwap(
  depositAddress: string,
  onUpdate: (s: SwapState) => void,
  opts: {
    memo?: string; everyMs?: number; signal?: AbortSignal; sleep?: (ms: number) => Promise<void>; until?: number; now?: () => number;
  } = {},
): Promise<SwapState> {
  const sleep = opts.sleep ?? pause;
  const now = opts.now ?? Date.now;
  const q = new URLSearchParams({ depositAddress });
  if (opts.memo !== undefined) q.set('depositMemo', opts.memo);
  let last: SwapStatus | undefined;
  for (;;) {
    if (opts.signal?.aborted) throw new OneClickFailure('The page stopped watching this transfer.');
    const s = await call<SwapState>(`/oneclick/status?${q}`).catch(() => null);
    if (s) {
      last = s.status;
      onUpdate(s);
      if (ENDED.has(s.status)) return s;
    }
    if (opts.until !== undefined && now() > opts.until && (last === undefined || last === 'PENDING_DEPOSIT')) {
      throw new TransferExpired('The deadline passed and 1Click saw no deposit.');
    }
    await sleep(opts.everyMs ?? 10_000);
  }
}

/** A transfer under way: enough to show its deposit address, deadline and progress again after a reload. */
export interface SavedTransfer {
  mode: 'in' | 'out';
  chain: UsdcChain;
  /** As the user typed it, in USDC. */
  amount: string;
  depositAddress: string;
  memo?: string;
  quote: OneClickQuote;
  /** The private withdraw that paid a take-out. */
  txHash?: string;
  /** The NEAR account a take-out is refunded to. */
  refundTo?: string;
}

/** When the page stops watching a transfer 1Click saw no deposit for: 10 minutes past its deadline. */
export function watchUntil(t: SavedTransfer): number | undefined {
  const deadline = Date.parse(t.quote.deadline ?? '');
  return Number.isFinite(deadline) ? deadline + WATCH_AFTER_DEADLINE_MS : undefined;
}

/** A deadline with its date ("Nov 20, 2026, 10:30 AM"): a transfer may be read again days later. */
export function deadlineText(iso?: string): string {
  const t = Date.parse(iso ?? '');
  return Number.isFinite(t) ? new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'the deadline';
}

const NEAR_ACCOUNT = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;

/** Why `text` cannot take a take-out's refund, or null. */
export function refundProblem(text: string): string | null {
  return text.length >= 2 && text.length <= 64 && NEAR_ACCOUNT.test(text) ? null : 'Enter a NEAR account for refunds, like name.near.';
}

/** 1Click keeps a take-out's refund account with its deposit address, which the private withdraw pays in public. */
export function refundNotice(refundTo: string, account: string): string | null {
  if (refundTo !== account) return null;
  return (
    `1Click keeps the refund account with this transfer, and anyone can look it up by the deposit address the withdraw ` +
    `pays: refunding to ${account} links this take-out to ${account}. To keep them apart, name another NEAR account you control.`
  );
}

type Store = Partial<Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>>;
const transferKey = (account: string) => `veiled:oneclick:${account}`;
const browserStore = (): Store | undefined => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
};

/** The transfer `account` has under way in this browser, if any. */
export function savedTransfer(account: string, storage: Store | undefined = browserStore()): SavedTransfer | null {
  try {
    const raw = storage?.getItem?.(transferKey(account));
    return raw ? (JSON.parse(raw) as SavedTransfer) : null;
  } catch {
    return null;
  }
}

/** Keeps (or, with null, forgets) the transfer under way; a browser that keeps nothing just loses it on reload. */
export function saveTransfer(account: string, t: SavedTransfer | null, storage: Store | undefined = browserStore()): void {
  try {
    if (t) storage?.setItem?.(transferKey(account), JSON.stringify(t));
    else storage?.removeItem?.(transferKey(account));
  } catch {
    // Private windows and blocked site data: the transfer still runs, it is only not remembered.
  }
}

/** "1.5" in a token with `decimals` → base units; null unless a positive amount with at most `decimals` places. */
export function toUnits(text: string, decimals: number): bigint | null {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(text.trim());
  if (!m) return null;
  const frac = m[2] ?? '';
  if (frac.length > decimals) return null;
  const v = BigInt(m[1]) * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, '0') || '0');
  return v > 0n ? v : null;
}

/** Base units → a plain decimal ("24.998308", "5"). */
export function fromUnits(v: bigint | string, decimals: number): string {
  const n = typeof v === 'bigint' ? v : BigInt(v);
  const base = 10n ** BigInt(decimals);
  const frac = (n % base).toString().padStart(decimals, '0').replace(/0+$/, '');
  return frac ? `${n / base}.${frac}` : (n / base).toString();
}

const CHAIN_NAMES: Record<string, string> = {
  eth: 'Ethereum', base: 'Base', arb: 'Arbitrum', op: 'Optimism', pol: 'Polygon', bsc: 'BNB Chain', avax: 'Avalanche',
  gnosis: 'Gnosis', sol: 'Solana', sui: 'Sui', aptos: 'Aptos', stellar: 'Stellar', monad: 'Monad', xlayer: 'X Layer',
  hypercore: 'Hyperliquid', tron: 'Tron', ton: 'TON', bera: 'Berachain', scroll: 'Scroll', starknet: 'Starknet',
  plasma: 'Plasma',
};

/** The chain's name; two USDC assets on one chain are told apart by the end of their contract address. */
export function chainLabel(c: UsdcChain, all: UsdcChain[]): string {
  const name = CHAIN_NAMES[c.blockchain] ?? c.blockchain.toUpperCase();
  if (all.filter((o) => o.blockchain === c.blockchain).length < 2) return name;
  return `${name} (…${(c.contractAddress ?? c.assetId).slice(-6)})`;
}
