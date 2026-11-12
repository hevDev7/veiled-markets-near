// Seeds the demo markets on NEAR testnet: a public create_market per market from the creator account, with the
// question, outcome labels and resolution source as on-chain metadata (the same format the frontend writes).
// The creator's LP notes are written to backend/.seed-lp-notes.json (git-ignored) so the liquidity can be
// withdrawn later. Markets whose question is already on chain are skipped, so the script can be re-run.
//
// Usage (from backend/): npx tsx scripts/seed-markets.ts [creator=veiled-markets.testnet] [--dry-run]
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Account, JsonRpcProvider, KeyPairSigner, actions } from 'near-api-js';
import { metadataOf, questionHash, type MarketText } from './market-meta';
import { confirmLpNote, recordPendingLpNote } from './lp-notes';
// @ts-ignore -- plain ESM helper shared with the circuit tests
import { initPoseidon, ownerBlind } from '../../near/circuits/lib/notes.mjs';

const CONTRACT = process.env.VEILED_CONTRACT ?? 'v1.veiled-markets.testnet';
const RPC = process.env.NEAR_RPC_URL ?? 'https://test.rpc.fastnear.com';
const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const creator = argv.find((a) => !a.startsWith('--')) ?? 'veiled-markets.testnet';
const LIQUIDITY_MICRO = 100_000n; // 0.1 NEAR per market
const MS_PER_TICK = 4000;
const NOTES_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.seed-lp-notes.json');

interface Seed extends MarketText {
  category: number; // 1 Politics, 2 Sports, 3 Crypto, 4 Culture, 5 AI & Tech, 6 Macro, 7 Science, 8 Climate, 99 Other
  deadline: string; // trading closes (ISO, UTC)
  resolutionDeadline: string; // last moment to resolve (ISO, UTC)
}

const SEEDS: Seed[] = [
  {
    question: 'Will Bitcoin trade above $80,000 on December 31, 2026?',
    description: 'Resolves YES if the BTC/USD price is above $80,000 at 00:00 UTC on December 31, 2026.',
    resolutionSource: 'CoinGecko BTC/USD price at 00:00 UTC on December 31, 2026',
    outcomes: ['Yes', 'No'],
    category: 3,
    deadline: '2026-12-31T00:00:00Z',
    resolutionDeadline: '2027-01-07T00:00:00Z',
  },
  {
    question: 'Will NEAR trade above $4 on December 31, 2026?',
    description: 'Resolves YES if the NEAR/USD price is above $4.00 at 00:00 UTC on December 31, 2026.',
    resolutionSource: 'CoinGecko NEAR/USD price at 00:00 UTC on December 31, 2026',
    outcomes: ['Yes', 'No'],
    category: 3,
    deadline: '2026-12-31T00:00:00Z',
    resolutionDeadline: '2027-01-07T00:00:00Z',
  },
  {
    question: 'Where will ETH close on November 30, 2026?',
    description: 'The ETH/USD price at 23:59 UTC on November 30, 2026 decides which range wins.',
    resolutionSource: 'CoinGecko ETH/USD price at 23:59 UTC on November 30, 2026',
    outcomes: ['Below $1,900', '$1,900 to $2,100', '$2,100 to $2,300', 'Above $2,300'],
    category: 3,
    deadline: '2026-11-30T23:59:00Z',
    resolutionDeadline: '2026-12-07T23:59:00Z',
  },
  {
    question: 'Will the Federal Reserve cut interest rates at its last 2026 meeting?',
    description: 'Resolves YES if the FOMC lowers the federal funds target range at its final scheduled meeting of 2026.',
    resolutionSource: 'Federal Reserve FOMC statement for the final 2026 meeting',
    outcomes: ['Yes', 'No'],
    category: 6,
    deadline: '2026-12-20T00:00:00Z',
    resolutionDeadline: '2026-12-31T00:00:00Z',
  },
];

const rand = () => BigInt('0x' + randomBytes(31).toString('hex'));

const provider = new JsonRpcProvider({ url: RPC });
const view = <T>(method: string, args: Record<string, unknown> = {}) =>
  provider.callFunction({ contractId: CONTRACT, method, args }) as Promise<T>;

await initPoseidon();
const height = BigInt(String(await view<string>('get_height')));
const count = Number(await view<string>('get_market_count'));
const existing = new Set<string>();
for (let from = 0; from < count; from += 100) {
  const page = await view<{ question_hash: string }[]>('get_markets', { from: String(from), limit: 100 });
  for (const m of page) existing.add(m.question_hash);
}
const ticksUntil = (iso: string) => height + BigInt(Math.floor((Date.parse(iso) - Date.now()) / MS_PER_TICK));

const key = JSON.parse(readFileSync(path.join(homedir(), '.near-credentials', 'testnet', `${creator}.json`), 'utf8')).private_key;
const account = new Account(creator, provider, KeyPairSigner.fromSecretKey(key));

console.log(`contract ${CONTRACT}, creator ${creator}, height ${height}, ${count} markets on chain`);
for (const s of SEEDS) {
  const qh = questionHash(s.question);
  if (existing.has(qh)) {
    console.log(`skip (already on chain): ${s.question}`);
    continue;
  }
  const sk = rand();
  const blinding = rand();
  const args = {
    question_hash: qh,
    category: s.category,
    num_outcomes: s.outcomes.length,
    deadline: ticksUntil(s.deadline).toString(),
    resolution_deadline: ticksUntil(s.resolutionDeadline).toString(),
    metadata: metadataOf(s),
    lp_owner_blind: ownerBlind(sk, blinding).toString(),
    lp_memo: '',
  };
  if (dryRun) {
    console.log('dry run:', JSON.stringify(args));
    continue;
  }
  // The LP note has no memo: its secrets live only in the notes file, so they go there before anything is sent.
  recordPendingLpNote(NOTES_FILE, {
    questionHash: qh, question: s.question, sk: sk.toString(), blinding: blinding.toString(),
    liquidity: LIQUIDITY_MICRO.toString(),
  });
  const tx: any = await account.signAndSendTransaction({
    receiverId: CONTRACT,
    actions: [actions.functionCall('create_market', { args }, 100_000_000_000_000n, LIQUIDITY_MICRO * 10n ** 18n)],
    waitUntil: 'EXECUTED_OPTIMISTIC',
  });
  const value = tx.status?.SuccessValue;
  if (value === undefined) throw new Error(`create_market failed: ${JSON.stringify(tx.status)}`);
  const marketId = JSON.parse(Buffer.from(value, 'base64').toString());
  console.log(`market ${marketId}: ${s.question}  tx ${tx.transaction_outcome.id}`);
  confirmLpNote(NOTES_FILE, qh, String(marketId));
}
