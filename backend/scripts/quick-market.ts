// A market that resolves within minutes, for demos and end-to-end tests of the whole lifecycle.
//   create   opens "Will NEAR trade above $<current price> at <HH:MM> UTC?", closing in a few minutes.
//   resolve  after the deadline: bonded vote, vote window, finalize, dispute window, confirm, then reclaims
//            the vote bond. Takes about ten minutes on the testnet config (75-tick windows, 4 s per tick).
// Both sign with the account's key in ~/.near-credentials. Creating attaches 0.05 NEAR of liquidity unless --near
// or --usdc says otherwise (its LP note goes to backend/.seed-lp-notes.json); the 0.1 NEAR vote bond comes back
// at the end of `resolve`.
//
// Usage (from backend/):
//   npx tsx scripts/quick-market.ts create [minutes=6] [--account=veiled-markets.testnet]
//       [--coin=<CoinGecko id, default near>] [--category=<n, default 3 Crypto>] [--usdc=<USDC of liquidity>]
//   npx tsx scripts/quick-market.ts open <spec.json> [--near=<NEAR of liquidity> | --usdc=<USDC of liquidity>]
//       a market of any length, e.g. scripts/markets/nvda-close-2026-11-16.json
//       ({ question, description, resolutionSource, outcomes?, category, closes, resolveDays? })
//   npx tsx scripts/quick-market.ts resolve <marketId> <outcome: 1=Yes, 2=No> [--account=veiled-markets.testnet]
// --usdc funds the market with Circle testnet USDC (ft_transfer_call) instead of NEAR; the account must hold it.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Account, FailoverRpcProvider, JsonRpcProvider, KeyPairSigner, actions } from 'near-api-js';
import { metadataOf, questionHash } from './market-meta';
import { confirmLpNote, recordPendingLpNote } from './lp-notes';
// @ts-ignore -- plain ESM helper shared with the circuit tests
import { initPoseidon, ownerBlind } from '../../near/circuits/lib/notes.mjs';

const CONTRACT = process.env.VEILED_CONTRACT ?? 'v1.veiled-markets.testnet';
// Comma-separated; the free endpoints rate-limit (429), so a second one keeps a long `resolve` alive.
const RPCS = (process.env.NEAR_RPC_URL ?? 'https://test.rpc.fastnear.com,https://near-testnet.drpc.org').split(',');
const DEFAULT_LIQUIDITY_MICRO = 50_000n; // 0.05 NEAR
const MS_PER_TICK = 4000;
const RESOLUTION_TICKS = 1800n; // two hours after the deadline to finish resolving
const GAS = 100_000_000_000_000n;
const NOTES_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.seed-lp-notes.json');
const YOCTO_PER_MICRO = 10n ** 18n;

const argv = process.argv.slice(2);
const positional = argv.filter((a) => !a.startsWith('--'));
const option = (name: string) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const accountId = option('account') ?? 'veiled-markets.testnet';
const COIN = option('coin') ?? 'near';
const CATEGORY = Number(option('category') ?? 3);
const USDC_LIQUIDITY = option('usdc') ? BigInt(Math.round(Number(option('usdc')) * 1e6)) : null; // micro USDC
const LIQUIDITY_MICRO = option('near') ? BigInt(Math.round(Number(option('near')) * 1e6)) : DEFAULT_LIQUIDITY_MICRO;
const USDC_TOKEN = process.env.USDC_TOKEN ?? '3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af';
const USDC_SLOT = 3;
const [command, ...rest] = positional;

const provider = new FailoverRpcProvider(RPCS.map((url) => new JsonRpcProvider({ url: url.trim() })));
const view = <T>(method: string, args: Record<string, unknown> = {}) =>
  provider.callFunction({ contractId: CONTRACT, method, args }) as Promise<T>;
const height = async () => BigInt(String(await view<string>('get_height')));

function signer(): Account {
  const file = path.join(homedir(), '.near-credentials', 'testnet', `${accountId}.json`);
  const key = JSON.parse(readFileSync(file, 'utf8')).private_key;
  return new Account(accountId, provider, KeyPairSigner.fromSecretKey(key));
}

/** Calls a contract method and returns its decoded result; throws with the contract's error on failure. */
async function call<T = unknown>(account: Account, method: string, args: Record<string, unknown>, depositMicro = 0n): Promise<T> {
  const tx: any = await account.signAndSendTransaction({
    receiverId: CONTRACT,
    actions: [actions.functionCall(method, args, GAS, depositMicro * YOCTO_PER_MICRO)],
    waitUntil: 'EXECUTED_OPTIMISTIC',
  });
  const value = tx.status?.SuccessValue;
  if (value === undefined) throw new Error(`${method} failed: ${JSON.stringify(tx.status)}`);
  console.log(`  ${method} ok  tx ${tx.transaction_outcome.id}`);
  return (value ? JSON.parse(Buffer.from(value, 'base64').toString()) : undefined) as T;
}

/** Waits until the contract's height passes `tick`, printing the time left once a minute. RPC errors only delay it. */
async function waitPast(tick: bigint, what: string) {
  let lastNote = 0;
  for (;;) {
    let h: bigint;
    try {
      h = await height();
    } catch (err) {
      console.warn(`  height check failed (${(err as Error).message.slice(0, 80)}); retrying`);
      await new Promise((r) => setTimeout(r, 15_000));
      continue;
    }
    if (h > tick) return;
    const secondsLeft = Number(tick - h + 1n) * (MS_PER_TICK / 1000);
    if (Date.now() - lastNote > 60_000) {
      console.log(`  waiting for ${what}: about ${Math.ceil(secondsLeft / 60)} min`);
      lastNote = Date.now();
    }
    await new Promise((r) => setTimeout(r, Math.min(secondsLeft * 1000, 15_000)));
  }
}

/** A coin's name, ticker and current USD price on CoinGecko. */
async function coinQuote(id: string): Promise<{ name: string; symbol: string; price: number }> {
  const res = await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`CoinGecko answered ${res.status}`);
  const coin = (await res.json())?.[0];
  if (typeof coin?.current_price !== 'number') throw new Error(`CoinGecko returned no price for ${id}`);
  return { name: coin.name, symbol: String(coin.symbol).toUpperCase(), price: coin.current_price };
}

/** The ids of the markets a transaction created, from the contract's market_created events. */
function createdMarketIds(tx: any): string[] {
  const ids: string[] = [];
  for (const r of tx.receipts_outcome ?? []) {
    if (r.outcome?.executor_id !== CONTRACT) continue;
    for (const log of r.outcome.logs ?? []) {
      if (!log.startsWith('EVENT_JSON:')) continue;
      const e = JSON.parse(log.slice('EVENT_JSON:'.length));
      if (e?.event === 'market_created') ids.push(...(e.data ?? []).map((d: any) => String(d.market_id)));
    }
  }
  return ids;
}

async function create(minutes: number) {
  const coin = await coinQuote(COIN);
  // Two significant decimals at least, so a sub-dollar coin still gets a meaningful threshold.
  const threshold = coin.price >= 1 ? coin.price.toFixed(2) : coin.price.toPrecision(3);
  const closes = new Date(Date.now() + minutes * 60_000);
  const hhmm = closes.toISOString().slice(11, 16);
  const day = closes.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  // "NEAR" for NEAR Protocol, "Bittensor (TAO)" when the name does not carry the ticker.
  const label = coin.name.toUpperCase().startsWith(coin.symbol) ? coin.symbol : `${coin.name} (${coin.symbol})`;
  const text = {
    question: `Will ${label} trade above $${threshold} at ${hhmm} UTC on ${day}?`,
    description: `Resolves YES if CoinGecko's ${coin.symbol}/USD price is above $${threshold} at ${hhmm} UTC on ${day}. A short demo market on NEAR testnet.`,
    resolutionSource: `CoinGecko ${coin.symbol}/USD spot price at ${hhmm} UTC`,
    outcomes: ['Yes', 'No'],
  };
  const deadline = (await height()) + BigInt(Math.ceil((minutes * 60_000) / MS_PER_TICK));
  const marketId = await openMarket(text, CATEGORY, deadline, deadline + RESOLUTION_TICKS);
  console.log(`trading closes at tick ${deadline} (about ${minutes} min); then run: npx tsx scripts/quick-market.ts resolve ${marketId} <1|2>`);
}

/** A market described by a JSON file: { question, description, resolutionSource, outcomes?, category, closes, resolveDays? }. */
async function openFromSpec(file: string) {
  const spec = JSON.parse(readFileSync(file, 'utf8'));
  const closesMs = Date.parse(spec.closes);
  if (!spec.question || !Number.isFinite(closesMs)) throw new Error('spec needs question and closes (ISO time)');
  if (closesMs <= Date.now()) throw new Error(`closes ${spec.closes} is in the past`);
  // The contract's clock: one tick per 4 s of block time (lib.rs get_height).
  const deadline = BigInt(Math.floor(closesMs / MS_PER_TICK));
  const resolveTicks = BigInt(Math.round(((spec.resolveDays ?? 7) * 86_400_000) / MS_PER_TICK));
  const text = {
    question: spec.question,
    description: spec.description ?? '',
    resolutionSource: spec.resolutionSource ?? '',
    outcomes: spec.outcomes ?? ['Yes', 'No'],
  };
  const marketId = await openMarket(text, Number(spec.category ?? CATEGORY), deadline, deadline + resolveTicks);
  console.log(`trading closes ${new Date(closesMs).toISOString()} (tick ${deadline}); resolve with: npx tsx scripts/quick-market.ts resolve ${marketId} <outcome>`);
}

/** Opens a market funded with NEAR, or with Circle USDC when --usdc is given, and saves its LP note. */
async function openMarket(text: { question: string; description: string; resolutionSource: string; outcomes: string[] },
  category: number, deadline: bigint, resolutionDeadline: bigint): Promise<string> {
  await initPoseidon();
  const rand = () => BigInt('0x' + randomBytes(31).toString('hex'));
  const sk = rand();
  const blinding = rand();
  const args = {
    question_hash: questionHash(text.question),
    category,
    num_outcomes: text.outcomes.length,
    deadline: deadline.toString(),
    resolution_deadline: resolutionDeadline.toString(),
    metadata: metadataOf(text),
    lp_owner_blind: ownerBlind(sk, blinding).toString(),
    lp_memo: '',
  };
  // The LP note has no memo: its secrets live only in the notes file, so they go there before anything is sent.
  recordPendingLpNote(NOTES_FILE, {
    questionHash: args.question_hash, question: text.question, token: USDC_LIQUIDITY ? USDC_SLOT : 1,
    sk: sk.toString(), blinding: blinding.toString(), liquidity: (USDC_LIQUIDITY ?? LIQUIDITY_MICRO).toString(),
  });
  let marketId: string;
  if (USDC_LIQUIDITY) {
    const account = signer();
    const balance = BigInt(await provider.callFunction({ contractId: USDC_TOKEN, method: 'ft_balance_of', args: { account_id: accountId } }) as string);
    if (balance < USDC_LIQUIDITY) throw new Error(`${accountId} holds ${Number(balance) / 1e6} USDC, needs ${Number(USDC_LIQUIDITY) / 1e6}`);
    const tx: any = await account.signAndSendTransaction({
      receiverId: USDC_TOKEN,
      actions: [actions.functionCall('ft_transfer_call', {
        receiver_id: CONTRACT,
        amount: USDC_LIQUIDITY.toString(),
        msg: JSON.stringify({ create_market: args }),
      }, 250_000_000_000_000n, 1n)],
      waitUntil: 'EXECUTED_OPTIMISTIC',
    });
    const ids = createdMarketIds(tx);
    if (!ids.length) throw new Error(`no market created: ${JSON.stringify(tx.receipts_outcome.map((r: any) => r.outcome.status)).slice(0, 400)}`);
    console.log(`  ft_transfer_call create_market ok  tx ${tx.transaction_outcome.id}`);
    marketId = ids[0];
  } else {
    marketId = await call<string>(signer(), 'create_market', { args }, LIQUIDITY_MICRO);
  }
  confirmLpNote(NOTES_FILE, args.question_hash, marketId);
  console.log(`market ${marketId}: ${text.question}`);
  return marketId;
}

interface MarketView {
  status: number;
  deadline: string;
  num_outcomes: number;
  tally: { voting_deadline: string; dispute_deadline: string; total_voters: number } | null;
  dispute: unknown;
}

const STATUS = { ACTIVE: 1, CLOSED: 2, RESOLVED: 3, CANCELLED: 4, PENDING_RESOLUTION: 5, PENDING_FINALIZATION: 6, DISPUTED: 7 };

async function resolve(marketId: string, outcome: number) {
  const account = signer();
  const market = async () => {
    const m = await view<MarketView | null>('get_market', { market_id: marketId });
    if (!m) throw new Error(`market ${marketId} not found`);
    return m;
  };
  let m = await market();
  if (outcome < 1 || outcome > m.num_outcomes) throw new Error(`outcome must be 1..${m.num_outcomes}`);

  if (m.status === STATUS.ACTIVE || m.status === STATUS.CLOSED || m.status === STATUS.PENDING_RESOLUTION) {
    await waitPast(BigInt(m.deadline), 'the trading deadline');
    const { vote_bond } = await view<{ vote_bond: string }>('get_config');
    const voted = await view<unknown>('get_vote', { market_id: marketId, account_id: accountId });
    if (!voted) await call(account, 'vote_outcome', { market_id: marketId, outcome }, BigInt(vote_bond));
    m = await market();
    await waitPast(BigInt(m.tally!.voting_deadline), 'the vote window');
    await call(account, 'finalize_votes', { market_id: marketId });
    m = await market();
  }
  if (m.status === STATUS.PENDING_FINALIZATION) {
    await waitPast(BigInt(m.tally!.dispute_deadline), 'the dispute window');
    await call(account, 'confirm_resolution', { market_id: marketId });
    m = await market();
  }
  if (m.status !== STATUS.RESOLVED) throw new Error(`market ${marketId} ended in status ${m.status}, not RESOLVED`);
  const vote = await view<{ outcome: number; claimed: boolean } | null>('get_vote', { market_id: marketId, account_id: accountId });
  if (vote && !vote.claimed) await call(account, 'claim_voter_bond', { market_id: marketId });
  console.log(`market ${marketId} resolved; winners can redeem from the Portfolio.`);
}

if (command === 'create') {
  await create(Number(rest[0] ?? 6));
} else if (command === 'open' && rest.length === 1) {
  await openFromSpec(rest[0]);
} else if (command === 'resolve' && rest.length === 2) {
  await resolve(rest[0], Number(rest[1]));
} else {
  console.error('usage: quick-market.ts create [minutes] | open <spec.json> | resolve <marketId> <outcome> [--account=<id>]');
  process.exit(1);
}
