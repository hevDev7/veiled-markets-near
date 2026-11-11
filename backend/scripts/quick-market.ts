// A market that resolves within minutes, for demos and end-to-end tests of the whole lifecycle.
//   create   opens "Will NEAR trade above $<current price> at <HH:MM> UTC?", closing in a few minutes.
//   resolve  after the deadline: bonded vote, vote window, finalize, dispute window, confirm, then reclaims
//            the vote bond. Takes about ten minutes on the testnet config (75-tick windows, 4 s per tick).
// Both sign with the account's key in ~/.near-credentials. Creating attaches 0.05 NEAR of liquidity (its LP note
// goes to backend/.seed-lp-notes.json); the 0.1 NEAR vote bond comes back at the end of `resolve`.
//
// Usage (from backend/):
//   npx tsx scripts/quick-market.ts create [minutes=6] [--account=veiled-markets.testnet]
//   npx tsx scripts/quick-market.ts resolve <marketId> <outcome: 1=Yes, 2=No> [--account=veiled-markets.testnet]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Account, FailoverRpcProvider, JsonRpcProvider, KeyPairSigner, actions } from 'near-api-js';
import { metadataOf, questionHash } from './market-meta';
// @ts-ignore -- plain ESM helper shared with the circuit tests
import { initPoseidon, ownerBlind } from '../../near/circuits/lib/notes.mjs';

const CONTRACT = process.env.VEILED_CONTRACT ?? 'v1.veiled-markets.testnet';
// Comma-separated; the free endpoints rate-limit (429), so a second one keeps a long `resolve` alive.
const RPCS = (process.env.NEAR_RPC_URL ?? 'https://test.rpc.fastnear.com,https://near-testnet.drpc.org').split(',');
const LIQUIDITY_MICRO = 50_000n; // 0.05 NEAR
const MS_PER_TICK = 4000;
const RESOLUTION_TICKS = 1800n; // two hours after the deadline to finish resolving
const GAS = 100_000_000_000_000n;
const NOTES_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.seed-lp-notes.json');
const YOCTO_PER_MICRO = 10n ** 18n;

const argv = process.argv.slice(2);
const positional = argv.filter((a) => !a.startsWith('--'));
const accountId = argv.find((a) => a.startsWith('--account='))?.slice('--account='.length) ?? 'veiled-markets.testnet';
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

async function nearPrice(): Promise<number> {
  const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=near&vs_currencies=usd');
  if (!res.ok) throw new Error(`CoinGecko answered ${res.status}`);
  const price = (await res.json())?.near?.usd;
  if (typeof price !== 'number') throw new Error('CoinGecko returned no NEAR price');
  return price;
}

async function create(minutes: number) {
  const price = await nearPrice();
  const threshold = price.toFixed(2);
  const closes = new Date(Date.now() + minutes * 60_000);
  const hhmm = closes.toISOString().slice(11, 16);
  const day = closes.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const text = {
    question: `Will NEAR trade above $${threshold} at ${hhmm} UTC on ${day}?`,
    description: `Resolves YES if CoinGecko's NEAR/USD price is above $${threshold} at ${hhmm} UTC on ${day}. A short demo market on NEAR testnet.`,
    resolutionSource: `CoinGecko NEAR/USD spot price at ${hhmm} UTC`,
    outcomes: ['Yes', 'No'],
  };
  await initPoseidon();
  const h = await height();
  const deadline = h + BigInt(Math.ceil((minutes * 60_000) / MS_PER_TICK));
  const rand = () => BigInt('0x' + randomBytes(31).toString('hex'));
  const sk = rand();
  const blinding = rand();
  const marketId = await call<string>(signer(), 'create_market', {
    args: {
      question_hash: questionHash(text.question),
      category: 3,
      num_outcomes: 2,
      deadline: deadline.toString(),
      resolution_deadline: (deadline + RESOLUTION_TICKS).toString(),
      metadata: metadataOf(text),
      lp_owner_blind: ownerBlind(sk, blinding).toString(),
      lp_memo: '',
    },
  }, LIQUIDITY_MICRO);
  const saved: unknown[] = existsSync(NOTES_FILE) ? JSON.parse(readFileSync(NOTES_FILE, 'utf8')) : [];
  saved.push({ marketId, question: text.question, sk: sk.toString(), blinding: blinding.toString(), liquidity: LIQUIDITY_MICRO.toString() });
  writeFileSync(NOTES_FILE, JSON.stringify(saved, null, 2) + '\n', { mode: 0o600 });
  console.log(`market ${marketId}: ${text.question}`);
  console.log(`trading closes at tick ${deadline} (about ${minutes} min); then run: npx tsx scripts/quick-market.ts resolve ${marketId} <1|2>`);
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
} else if (command === 'resolve' && rest.length === 2) {
  await resolve(rest[0], Number(rest[1]));
} else {
  console.error('usage: quick-market.ts create [minutes] | resolve <marketId> <outcome> [--account=<id>]');
  process.exit(1);
}
