// Withdraws the LP positions of markets opened by seed-markets.ts and quick-market.ts. Those scripts mint the
// creator's LP note with an empty memo, so no wallet can find it; its secret key and blinding are kept in
// backend/.seed-lp-notes.json instead. For every saved note whose market is past the winner-claim window
// (or cancelled) this:
//   1. spends the LP note with `withdraw_lp` into a private balance note,
//   2. spends that balance note with `withdraw` to the account's public balance,
//   3. claims the market's creator fees when the account is the creator and they are unclaimed.
// Each step is checked against the chain first (spent nullifiers, claimed fees), so it is safe to rerun after a
// failure. Progress (the balance note, tx hashes) is written back into the notes file; nothing is removed.
//
// Usage (from backend/):
//   npx tsx scripts/withdraw-lp.ts [marketId ...] [--account=veiled-markets.testnet] [--to=<recipient>] [--dry-run]
// With no market ids every saved note is checked. --dry-run only reports what each note would pay.
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Account, FailoverRpcProvider, JsonRpcProvider, KeyPairSigner, actions } from 'near-api-js';
// @ts-ignore -- plain ESM helper shared with the circuit tests
import { initPoseidon, MerkleTree, ownerBlind, noteCommitment, nullifierOf, spendInput, proveSpend, contractArgs } from '../../near/circuits/lib/notes.mjs';

const CONTRACT = process.env.VEILED_CONTRACT ?? 'v1.veiled-markets.testnet';
const RPCS = (process.env.NEAR_RPC_URL ?? 'https://test.rpc.fastnear.com,https://near-testnet.drpc.org').split(',');
const NOTES_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.seed-lp-notes.json');
const TRANSACT_GAS = 300_000_000_000_000n;
const CALL_GAS = 100_000_000_000_000n;
const KIND = { BALANCE: 1, LP: 3 };
const STATUS = { RESOLVED: 3, CANCELLED: 4 };
const TOKEN_NAME: Record<number, string> = { 1: 'NEAR', 2: 'mock USDC', 3: 'USDC' };

const argv = process.argv.slice(2);
const option = (name: string) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const accountId = option('account') ?? 'veiled-markets.testnet';
const recipient = option('to') ?? accountId;
const dryRun = argv.includes('--dry-run');
const only = new Set(argv.filter((a) => !a.startsWith('--')));

interface SavedNote {
  marketId: string;
  question: string;
  token?: number;
  sk: string;
  blinding: string;
  liquidity: string;
  /** The private balance note `withdraw_lp` minted, kept until it is withdrawn. */
  balanceNote?: { blinding: string; index: number; amount: string; token: number; tx: string };
  lpWithdrawn?: { tx: string; amount: string; at: string };
  withdrawn?: { tx: string; amount: string; to: string; at: string };
  creatorFees?: { tx: string; amount: string; at: string };
}

interface MarketView {
  id: string;
  creator: string;
  status: number;
  token_type: number;
  market_credits: string;
  trader_collateral: string;
  total_lp_shares: string;
  outcome_shares: string[];
  creator_fees: string;
  creator_fees_claimed: boolean;
  tally: { finalized: boolean; winning_outcome: number; dispute_deadline: string } | null;
}

const provider = new FailoverRpcProvider(RPCS.map((url) => new JsonRpcProvider({ url: url.trim() })));
const view = <T>(method: string, args: Record<string, unknown> = {}) =>
  provider.callFunction({ contractId: CONTRACT, method, args }) as Promise<T>;
const rand = () => BigInt('0x' + randomBytes(31).toString('hex'));
const fmt = (micro: bigint, token: number) => `${(Number(micro) / 1e6).toFixed(6)} ${TOKEN_NAME[token] ?? `token ${token}`}`;

function signer(): Account {
  const file = path.join(homedir(), '.near-credentials', 'testnet', `${accountId}.json`);
  const key = JSON.parse(readFileSync(file, 'utf8')).private_key;
  return new Account(accountId, provider, KeyPairSigner.fromSecretKey(key));
}

function loadNotes(): SavedNote[] {
  if (!existsSync(NOTES_FILE)) throw new Error(`${NOTES_FILE} not found`);
  return JSON.parse(readFileSync(NOTES_FILE, 'utf8'));
}

/** Writes the notes file through a temporary file, so a crash cannot leave it half written. */
function saveNotes(notes: SavedNote[]) {
  const tmp = `${NOTES_FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(notes, null, 2) + '\n', { mode: 0o600 });
  renameSync(tmp, NOTES_FILE);
}

async function loadTree(): Promise<MerkleTree> {
  const leaves: string[] = [];
  for (;;) {
    const page = await view<{ commitment: string }[]>('get_leaves', { from: String(leaves.length), limit: 500 });
    if (!page.length) break;
    leaves.push(...page.map((l) => l.commitment));
  }
  const tree = new MerkleTree();
  tree.leaves = leaves.map((x) => BigInt(x));
  return tree;
}

/** What `withdraw_lp` pays for `lp` shares, or why it cannot pay yet (markets.rs act_withdraw_lp). */
function lpPayout(m: MarketView, lp: bigint, height: bigint, priority: bigint): { amount: bigint } | { wait: string } {
  const sub = (a: bigint, b: bigint) => (a > b ? a - b : 0n);
  let pool: bigint;
  if (m.status === STATUS.RESOLVED) {
    if (!m.tally?.finalized) return { wait: 'resolution not final' };
    const unlock = BigInt(m.tally.dispute_deadline) + priority;
    if (height <= unlock) return { wait: `winner-claim window until tick ${unlock} (now ${height}, ~${((unlock - height) * 4n) / 60n} min)` };
    const fees = m.creator_fees_claimed ? 0n : BigInt(m.creator_fees);
    pool = sub(BigInt(m.market_credits), BigInt(m.outcome_shares[m.tally.winning_outcome - 1]) + fees);
  } else if (m.status === STATUS.CANCELLED) {
    pool = sub(BigInt(m.market_credits), BigInt(m.trader_collateral));
  } else {
    return { wait: `market status ${m.status} (needs resolved or cancelled)` };
  }
  return { amount: (lp * pool) / BigInt(m.total_lp_shares) };
}

interface TransactResult {
  new_index: string;
  new_amount: string;
}

/** Proves a spend of one note (plus a dummy) and submits `transact` signed by the account. */
async function spend(account: Account, sk: bigint, note: { kind: number; asset: number; amount: bigint; blinding: bigint; index: number },
  action: Record<string, unknown>, newOwnerBlind: bigint): Promise<{ tx: string; result: TransactResult }> {
  const tree = await loadTree();
  const extData = JSON.stringify({ action, new_owner_blind: newOwnerBlind.toString(), new_memo: '', change_memo: '', fee: '0' });
  const { input } = spendInput({
    sk, tree, kind: note.kind, asset: note.asset, sub: 0,
    notes: [{ amount: note.amount, blinding: note.blinding, index: note.index }, { amount: 0n, blinding: rand() }],
    outAmount: note.amount, changeBlinding: rand(), extData,
  });
  const { proof, publicSignals } = await proveSpend(input);
  const tx: any = await account.signAndSendTransaction({
    receiverId: CONTRACT,
    actions: [actions.functionCall('transact', { ...contractArgs(proof, publicSignals), ext_data: extData }, TRANSACT_GAS, 0n)],
    waitUntil: 'EXECUTED_OPTIMISTIC',
  });
  const value = tx.status?.SuccessValue;
  if (value === undefined) throw new Error(`transact failed: ${JSON.stringify(tx.status).slice(0, 400)}`);
  return { tx: tx.transaction_outcome.id, result: JSON.parse(Buffer.from(value, 'base64').toString()) };
}

async function main() {
  await initPoseidon();
  const notes = loadNotes();
  const config = await view<{ winner_claim_priority: number | string }>('get_config');
  const priority = BigInt(config.winner_claim_priority);
  const height = BigInt(await view<string>('get_height'));
  const account = dryRun ? null : signer();
  let tree: MerkleTree | null = null;

  for (const note of notes) {
    if (only.size && !only.has(note.marketId)) continue;
    const label = `#${note.marketId} ${note.question.slice(0, 60)}`;
    const m = await view<MarketView | null>('get_market', { market_id: note.marketId });
    if (!m) {
      console.log(`${label}\n  market not found`);
      continue;
    }
    const token = m.token_type;
    const sk = BigInt(note.sk);
    const lp = BigInt(note.liquidity);
    const lpCommitment = noteCommitment({ kind: KIND.LP, asset: Number(note.marketId), sub: 0, amount: lp, ownerBlind: ownerBlind(sk, BigInt(note.blinding)) });
    const lpSpent = await view<boolean>('is_spent', { nullifier: nullifierOf(sk, lpCommitment).toString() });
    console.log(`${label}\n  LP ${fmt(lp, token)}${lpSpent ? ' (already withdrawn)' : ''}`);

    // Step 1: LP note → private balance note.
    if (!lpSpent) {
      const payout = lpPayout(m, lp, height, priority);
      if ('wait' in payout) {
        console.log(`  not yet: ${payout.wait}`);
        continue;
      }
      console.log(`  withdraw_lp pays ${fmt(payout.amount, token)}`);
      if (dryRun) continue;
      tree ??= await loadTree();
      const index = tree.leaves.findIndex((c) => c === lpCommitment);
      if (index < 0) throw new Error(`LP note of market ${note.marketId} is not in the tree`);
      const balanceBlinding = rand();
      const minOut = payout.amount - payout.amount / 100n;
      const { tx, result } = await spend(account!, sk, { kind: KIND.LP, asset: Number(note.marketId), amount: lp, blinding: BigInt(note.blinding), index },
        { type: 'withdraw_lp', min_tokens_out: (minOut > 0n ? minOut : 1n).toString() }, ownerBlind(sk, balanceBlinding));
      tree = null;
      const amount = BigInt(result.new_amount);
      note.lpWithdrawn = { tx, amount: amount.toString(), at: new Date().toISOString() };
      note.balanceNote = { blinding: balanceBlinding.toString(), index: Number(result.new_index), amount: amount.toString(), token, tx };
      saveNotes(notes);
      console.log(`  withdraw_lp ok: ${fmt(amount, token)} into a private balance note  tx ${tx}`);
    }
    if (dryRun) continue;

    // Step 2: balance note → the recipient's public balance.
    const b = note.balanceNote;
    if (b) {
      const bc = noteCommitment({ kind: KIND.BALANCE, asset: b.token, sub: 0, amount: BigInt(b.amount), ownerBlind: ownerBlind(sk, BigInt(b.blinding)) });
      if (await view<boolean>('is_spent', { nullifier: nullifierOf(sk, bc).toString() })) {
        console.log('  balance note already withdrawn');
      } else {
        const refundBlinding = rand(); // a bounced transfer is re-minted to this blinding
        const { tx } = await spend(account!, sk, { kind: KIND.BALANCE, asset: b.token, amount: BigInt(b.amount), blinding: BigInt(b.blinding), index: b.index },
          { type: 'withdraw', recipient }, ownerBlind(sk, refundBlinding));
        note.withdrawn = { tx, amount: b.amount, to: recipient, at: new Date().toISOString() };
        saveNotes(notes);
        console.log(`  withdraw ok: ${fmt(BigInt(b.amount), b.token)} to ${recipient}  tx ${tx}`);
      }
    }

    // Step 3: the creator fees, which withdraw_lp leaves set aside.
    const fresh = await view<MarketView>('get_market', { market_id: note.marketId });
    if (fresh.status === STATUS.RESOLVED && fresh.creator === accountId && !fresh.creator_fees_claimed && BigInt(fresh.creator_fees) > 0n) {
      const tx: any = await account!.signAndSendTransaction({
        receiverId: CONTRACT,
        actions: [actions.functionCall('withdraw_creator_fees', { market_id: note.marketId }, CALL_GAS, 0n)],
        waitUntil: 'EXECUTED_OPTIMISTIC',
      });
      if (tx.status?.SuccessValue === undefined) throw new Error(`withdraw_creator_fees failed: ${JSON.stringify(tx.status).slice(0, 300)}`);
      note.creatorFees = { tx: tx.transaction_outcome.id, amount: fresh.creator_fees, at: new Date().toISOString() };
      saveNotes(notes);
      console.log(`  creator fees ${fmt(BigInt(fresh.creator_fees), token)} to ${accountId}  tx ${tx.transaction_outcome.id}`);
    }
  }
}

// snarkjs leaves worker threads running, so exit explicitly.
main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
