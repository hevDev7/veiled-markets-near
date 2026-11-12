// Executes the Aleo-shaped calls the pages build ({ program, function, inputs }) on NEAR:
//   - private trading (buy, sell, liquidity, redeem/refund, LP exit, turbo bets and claims) is proven in the
//     browser and relayed: the user's account never signs it and is not linked to the position on chain;
//   - public steps (market creation, bonded votes, disputes, closing/finalizing, creator fees, committee actions)
//     are signed by the connected NEAR wallet, as they were public transitions on Aleo.
// Record inputs are the plaintexts from ./records.ts; they name the note to spend through its commitment.
import { KIND, TOKEN, VEILED_CONTRACT, YOCTO_PER_MICRO, tokenAccount } from './config';
import { callContract, WalletError } from './near-wallet';
import { encodeMetadata, findMarketByQuestionHash, getNearConfig, getNearMarket, type MarketMetadata } from './chain';
import { aleoId, leoBig, leoNum, leoValue, nearId } from './ids';
import { commitmentOf, marketIdOf } from './records';
import { deposit, noteKeys, privateAction, type PrivateStep } from './private';
import { ownerBlindOf, randomField } from './notes/crypto';
import { sealMemo } from './notes/memo';
import { balanceOf, notesOf, syncNotes, type Note } from './notes/store';
import { RelayError } from './relayer';
import { useMarketTx } from './market-tx';

export interface AleoCall {
  program: string;
  function: string;
  inputs: string[];
  fee?: number;
  privateFee?: boolean;
  recordIndices?: number[];
}

export interface ExecResult {
  transactionId: string;
  value?: unknown;
}

// ------------------------------------------------------------------ bookkeeping the polling helpers read

const txOutcome = new Map<string, 'accepted' | 'rejected'>();
const createdMarkets = new Map<string, string>(); // question hash → "12field"
const pendingMetadata = new Map<string, MarketMetadata>();
let lastStep: PrivateStep | null = null;
const stepListeners = new Set<(s: PrivateStep) => void>();

/** What a NEAR transaction this tab sent ended as ('accepted' once executed). */
export const knownTxOutcome = (txId: string) => txOutcome.get(txId) ?? null;
/** Market created by this tab for a question hash, as "12field". */
export const createdMarketFor = (questionHash: string) => createdMarkets.get(questionHash) ?? null;
/** CreateMarket stashes the text fields before submitting; they go on chain as the market metadata. */
export function stashMarketMetadata(questionHash: string, meta: MarketMetadata) {
  pendingMetadata.set(questionHash, meta);
}
/** Progress of the private action in flight (unlocking → syncing → proving → relaying → done). */
export function onPrivateStep(cb: (s: PrivateStep) => void): () => void {
  stepListeners.add(cb);
  if (lastStep) cb(lastStep);
  return () => stepListeners.delete(cb);
}
const step = (s: PrivateStep) => {
  lastStep = s;
  for (const cb of stepListeners) cb(s);
};

// ------------------------------------------------------------------ helpers

const tokenOfFunction = (fn: string) => (/_usad\b|_usad$/.test(fn) ? TOKEN.USAD : /_usdcx\b|_usdcx$/.test(fn) ? TOKEN.USDCX : TOKEN.NEAR);

async function marketToken(marketId: string): Promise<number> {
  const m = await getNearMarket(marketId);
  if (!m) throw new Error('This market does not exist on NEAR.');
  return m.token_type;
}

/** Tops the private balance up from the wallet when short, rounding up to whole tokens so the deposit does not
 * reveal the exact size of the trade that follows. */
export async function topUp(token: number, micro: bigint): Promise<void> {
  const keys = await noteKeys();
  await syncNotes(keys);
  const have = balanceOf(keys.accountId, KIND.BALANCE, token, 0);
  if (have >= micro) return;
  const unit = 1_000_000n;
  const shortfall = micro - have;
  await deposit(token, ((shortfall + unit - 1n) / unit) * unit);
}

/** The unspent note a record plaintext stands for. */
async function noteFor(record: string | undefined, kind: number): Promise<Note> {
  const commitment = commitmentOf(record);
  if (commitment === null) throw new Error('This position is not a NEAR private note. Refresh your positions and try again.');
  const keys = await noteKeys();
  let note = notesOf(keys.accountId).find((n) => n.commitment === commitment);
  if (!note) {
    await syncNotes(keys);
    note = notesOf(keys.accountId).find((n) => n.commitment === commitment);
  }
  if (!note || note.kind !== kind) throw new Error('This private position was not found in your notes. Refresh and try again.');
  if (note.status !== 'unspent') throw new Error('This private position was already used. Refresh your positions.');
  return note;
}

async function relayed(req: Parameters<typeof privateAction>[0]): Promise<ExecResult> {
  const r = await privateAction({ ...req, onStep: step });
  return { transactionId: r.txHash, value: r.result };
}

async function publicCall(method: string, args: object, depositMicro = 0n): Promise<ExecResult> {
  const r = await callContract({ method, args, deposit: depositMicro * YOCTO_PER_MICRO });
  return { transactionId: r.txHash, value: r.value };
}

// ------------------------------------------------------------------ calls

async function createMarket(call: AleoCall): Promise<ExecResult> {
  const [questionHash, category, numOutcomes, deadline, resolutionDeadline, , , liquidity] = call.inputs;
  const token = tokenOfFunction(call.function);
  const keys = await noteKeys(); // the LP note is minted privately to the creator
  const blinding = randomField();
  const args = {
    question_hash: questionHash,
    category: leoNum(category),
    num_outcomes: leoNum(numOutcomes),
    deadline: leoValue(deadline),
    resolution_deadline: leoValue(resolutionDeadline),
    metadata: encodeMetadata(pendingMetadata.get(questionHash) ?? {}),
    lp_owner_blind: ownerBlindOf(keys.sk, blinding).toString(),
    lp_memo: await sealMemo(keys.memoKey, { b: blinding.toString() }),
  };
  const amount = leoBig(liquidity);
  let txHash: string;
  let marketId: string | null = null;
  if (token === TOKEN.NEAR) {
    const r = await callContract({ method: 'create_market', args: { args }, deposit: amount * YOCTO_PER_MICRO });
    txHash = r.txHash;
    if (r.value != null) marketId = aleoId(String(r.value));
  } else {
    const r = await callContract({
      contractId: tokenAccount(token)!,
      method: 'ft_transfer_call',
      args: { receiver_id: VEILED_CONTRACT, amount: amount.toString(), msg: JSON.stringify({ create_market: args }) },
      deposit: 1n,
      gas: 250_000_000_000_000n,
    });
    txHash = r.txHash;
    const m = await findMarketByQuestionHash(questionHash, r.signerId);
    if (m) marketId = aleoId(m.id);
  }
  if (marketId) {
    createdMarkets.set(questionHash, marketId);
    useMarketTx.getState().remember(marketId, txHash); // its page lives at /market/<txHash>
  }
  pendingMetadata.delete(questionHash);
  syncNotes(keys).catch(() => undefined);
  return { transactionId: txHash, value: marketId };
}

async function dispatch(call: AleoCall): Promise<ExecResult> {
  const fn = call.function;
  const inputs = call.inputs ?? [];
  const isTurbo = /turbo/i.test(call.program);

  if (/^create_market(_usdcx|_usad)?$/.test(fn)) return createMarket(call);

  // ---- private trading (relayed)
  if (/^buy_shares(_private|_usdcx|_usad)?$/.test(fn)) {
    const [marketId, outcome, amountIn, , minSharesOut] = inputs;
    const token = await marketToken(marketId);
    const amount = leoBig(amountIn);
    await topUp(token, amount);
    return relayed({
      kind: KIND.BALANCE, asset: token, sub: 0, amount,
      action: { type: 'buy', market_id: nearId(marketId), outcome: leoNum(outcome), min_shares_out: leoValue(minSharesOut) },
    });
  }
  if (/^sell_shares(_usdcx|_usad)?$/.test(fn)) {
    const [record, tokensDesired, maxSharesUsed] = inputs;
    const note = await noteFor(record, KIND.SHARE);
    const shares = leoBig(maxSharesUsed);
    return relayed({
      kind: KIND.SHARE, asset: note.asset, sub: note.sub, amount: shares > note.amount ? note.amount : shares, notes: [note],
      action: { type: 'sell', tokens_desired: leoValue(tokensDesired) },
    });
  }
  if (!isTurbo && /^(redeem_shares|claim_refund)(_usdcx|_usad)?$/.test(fn)) {
    const note = await noteFor(inputs[0], KIND.SHARE);
    return relayed({
      kind: KIND.SHARE, asset: note.asset, sub: note.sub, amount: note.amount, notes: [note],
      action: { type: fn.startsWith('redeem') ? 'redeem' : 'refund' },
    });
  }
  if (/^add_liquidity(_usdcx|_usad)?$/.test(fn)) {
    const [marketId, amountIn, expectedLp] = inputs;
    const token = await marketToken(marketId);
    const amount = leoBig(amountIn);
    await topUp(token, amount);
    const minLp = (leoBig(expectedLp ?? '0') * 99n) / 100n;
    return relayed({
      kind: KIND.BALANCE, asset: token, sub: 0, amount,
      action: { type: 'add_liquidity', market_id: nearId(marketId), min_lp_shares: minLp.toString() },
    });
  }
  if (/^(withdraw_lp_resolved|claim_lp_refund)(_usdcx|_usad)?$/.test(fn)) {
    const [record, minTokensOut] = inputs;
    const note = await noteFor(record, KIND.LP);
    return relayed({
      kind: KIND.LP, asset: note.asset, sub: 0, amount: note.amount, notes: [note],
      action: { type: 'withdraw_lp', min_tokens_out: leoValue(minTokensOut ?? '0') },
    });
  }
  if (fn === 'buy_up_down') {
    const [marketId, side, amountIn] = inputs;
    const amount = leoBig(amountIn);
    await topUp(TOKEN.NEAR, amount);
    return relayed({
      kind: KIND.BALANCE, asset: TOKEN.NEAR, sub: 0, amount,
      action: { type: 'turbo_buy', market_id: nearId(marketId), side: leoNum(side) },
    });
  }
  if (isTurbo && (fn === 'claim_winnings' || fn === 'claim_refund')) {
    const note = await noteFor(inputs[1], KIND.TURBO);
    return relayed({ kind: KIND.TURBO, asset: note.asset, sub: note.sub, amount: note.amount, notes: [note], action: { type: 'turbo_claim' } });
  }

  // ---- public resolution and fees (wallet-signed)
  if (fn === 'close_market') return publicCall('close_market', { market_id: nearId(inputs[0]) });
  if (fn === 'cancel_market') return publicCall('cancel_market', { market_id: nearId(inputs[0]) });
  if (fn === 'finalize_votes') return publicCall('finalize_votes', { market_id: nearId(inputs[0]) });
  if (fn === 'confirm_resolution') return publicCall('confirm_resolution', { market_id: nearId(inputs[0]) });
  if (fn === 'vote_outcome') {
    const bond = BigInt((await getNearConfig()).vote_bond);
    return publicCall('vote_outcome', { market_id: nearId(inputs[0]), outcome: leoNum(inputs[1]) }, bond);
  }
  if (fn === 'dispute_resolution') {
    // The pages pass (market_id, outcome, nonce, record, bond); the bond attached is exactly what the contract
    // requires, dispute_bond_multiplier × the bonds already posted, never an amount read from the inputs.
    const [marketId, outcome] = inputs;
    const m = await getNearMarket(marketId);
    const cfg = await getNearConfig();
    const required = BigInt(m?.tally?.total_bonded ?? '0') * BigInt(cfg.dispute_bond_multiplier);
    return publicCall('dispute_resolution', { market_id: nearId(marketId), proposed_outcome: leoNum(outcome) }, required);
  }
  if (fn === 'claim_voter_bond') {
    const id = marketIdOf(inputs[0]) ?? inputs[0];
    return publicCall('claim_voter_bond', { market_id: nearId(id) });
  }
  if (fn === 'claim_dispute_bond') return publicCall('claim_dispute_bond', { market_id: nearId(inputs[0]) });
  if (/^withdraw_(creator_)?fees(_usdcx|_usad)?$/.test(fn)) return publicCall('withdraw_creator_fees', { market_id: nearId(inputs[0]) });

  // ---- committee escalation (the Aleo governance program's dispute tier)
  if (/^initiate_escalation(_aleo|_usdcx|_usad)?$/.test(fn)) return publicCall('initiate_escalation', { market_id: nearId(inputs[0]) });
  if (fn === 'committee_vote_resolve') {
    return publicCall('committee_vote_resolve', { market_id: nearId(inputs[0]), outcome: leoNum(inputs[1]) });
  }
  if (fn === 'finalize_committee_vote') return publicCall('finalize_committee_vote', { market_id: nearId(inputs[0]) });
  if (/^governance_resolve(_aleo|_usdcx|_usad)?$/.test(fn)) return publicCall('governance_resolve', { market_id: nearId(inputs[0]) });

  throw new Error(`${fn} (${call.program}) is not part of the NEAR deployment yet.`);
}

/** Runs one call; resolves once it has executed on NEAR. Errors carry wallet-cancel and contract reasons. */
export async function executeAleoCall(call: AleoCall): Promise<ExecResult> {
  try {
    const r = await dispatch(call);
    txOutcome.set(r.transactionId, 'accepted');
    return r;
  } catch (err) {
    if (err instanceof WalletError && err.txHash) txOutcome.set(err.txHash, 'rejected');
    if (err instanceof RelayError && err.txHash) txOutcome.set(err.txHash, 'rejected');
    if (err instanceof WalletError && /cancel/i.test(err.message)) throw new Error('Transaction rejected by user');
    throw err;
  } finally {
    lastStep = null;
  }
}
