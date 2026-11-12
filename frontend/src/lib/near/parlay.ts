// Parlays on NEAR (near/contract/contracts/veiled/src/parlay.rs). The contract prices every leg from the live FPMM
// pools and settles from the leg markets, so the app only quotes, places and claims:
//   - placing is a relayed private action: a balance note pays the stake and the contract mints a parlay ticket note
//     (kind 5, asset = parlay id, amount = gross potential payout);
//   - claiming spends that ticket note and mints a balance note (payout − fee, or the stake if refunded).
// The user's tickets are their own kind-5 notes, so their parlays are found from the notes on any device.
import { KIND, TOKEN } from './config';
import { getNearMarket, decodeMetadata } from './chain';
import { nearId } from './ids';
import { privateAction, refreshNotes, type PrivateStep } from './private';
import { explain } from './relayer';
import { cachedView, invalidateViews, view } from './rpc';
import { topUp } from './executor';
import type { Note } from './notes/store';

export const PARLAY_STATUS = { ACTIVE: 1, WON: 2, LOST: 3, CANCELLED: 4 } as const;
export const LEG_STATE = { PENDING: 0, WON: 1, LOST: 2, CANCELLED: 3 } as const;

export interface LegArg {
  market_id: string;
  outcome: number;
}

export interface NearParlayLeg {
  market_id: string;
  outcome: number;
  odds_bps: string;
  state: number;
}

export interface NearParlay {
  id: string;
  token_type: number;
  num_legs: number;
  legs: NearParlayLeg[];
  stake: string;
  combined_odds_bps: string;
  potential_payout: string;
  status: number;
  settle_status: number;
  created_at: string;
  settled_at: string;
  claimed: boolean;
}

export interface NearParlayPool {
  pool: string[];
  exposure: string[];
  min_stake: string;
  max_payout: string;
  fee_bps: string;
  max_combined_odds_bps: string;
  max_leg_odds_bps: string;
  safety_bps: string;
  paused: boolean;
  count: string;
}

export interface ParlayQuote {
  leg_odds_bps: string[];
  combined_odds_bps: string;
  potential_payout: string;
  fee_if_won: string;
  net_if_won: string;
  max_stake: string;
}

/** A contract error code (ERR_…) turned into a sentence, for view and relay failures alike. */
export function parlayErrorText(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  const code = text.match(/ERR_[A-Z_]+/)?.[0];
  return code ? explain(code) : text;
}

const legArgs = (legs: { marketId: string; outcome: number }[]): LegArg[] =>
  legs.map((l) => ({ market_id: nearId(l.marketId), outcome: l.outcome }));

export const getParlayPool = () => cachedView<NearParlayPool>('get_parlay_pool', {}, 5000);
export const getNearParlay = (id: string | number | bigint) =>
  cachedView<NearParlay | null>('get_parlay', { parlay_id: nearId(id) }, 3000);

/** Exact odds and payout the contract gives these legs right now; throws with the contract's reason. */
export async function quoteParlay(token: number, stake: bigint, legs: { marketId: string; outcome: number }[]): Promise<ParlayQuote> {
  try {
    return await view<ParlayQuote>('quote_parlay', { token, stake: stake.toString(), legs: legArgs(legs) });
  } catch (err) {
    throw new Error(parlayErrorText(err));
  }
}

export interface PlacedParlay {
  txHash: string;
  parlayId: string;
  grossPayout: bigint;
}

/**
 * Places a parlay privately. The wallet only signs a deposit when the private balance is short; the bet itself is
 * proven here and submitted by the relayer. `minPayout` guards against the pools moving between quote and bet.
 */
export async function placeParlay(params: {
  token: number;
  stake: bigint;
  legs: { marketId: string; outcome: number }[];
  minPayout: bigint;
  onStep?: (s: PrivateStep) => void;
}): Promise<PlacedParlay> {
  await topUp(params.token, params.stake);
  try {
    const r = await privateAction({
      kind: KIND.BALANCE,
      asset: params.token,
      sub: 0,
      amount: params.stake,
      action: { type: 'parlay_buy', legs: legArgs(params.legs), min_payout: params.minPayout.toString() },
      onStep: params.onStep,
    });
    invalidateViews('get_parlay');
    return { txHash: r.txHash, parlayId: String(r.result.new_asset), grossPayout: BigInt(r.result.new_amount) };
  } catch (err) {
    throw new Error(parlayErrorText(err));
  }
}

/** The unspent ticket note for a parlay, if this account holds it. */
export async function ticketNote(parlayId: string): Promise<Note | null> {
  const notes = await refreshNotes(true);
  const id = BigInt(nearId(parlayId));
  return notes.find((n) => n.kind === KIND.PARLAY && n.asset === id && n.status === 'unspent') ?? null;
}

/** Claims a won parlay (payout − fee) or a cancelled one (the stake) into the private balance. */
export async function claimParlay(parlayId: string, onStep?: (s: PrivateStep) => void): Promise<{ txHash: string; amount: bigint }> {
  const note = await ticketNote(parlayId);
  if (!note) throw new Error('The private ticket for this parlay is not in this wallet, or it was already claimed.');
  try {
    const r = await privateAction({
      kind: KIND.PARLAY,
      asset: note.asset,
      sub: 0,
      amount: note.amount,
      notes: [note],
      action: { type: 'parlay_claim' },
      onStep,
    });
    invalidateViews('get_parlay');
    return { txHash: r.txHash, amount: BigInt(r.result.new_amount) };
  } catch (err) {
    throw new Error(parlayErrorText(err));
  }
}

/** Status name the parlay pages use, from what settlement gives now (the contract settles on claim). */
export function parlayStatusName(p: NearParlay): 'active' | 'won' | 'lost' | 'cancelled' {
  const s = p.status === PARLAY_STATUS.ACTIVE ? p.settle_status : p.status;
  return s === PARLAY_STATUS.WON ? 'won' : s === PARLAY_STATUS.LOST ? 'lost' : s === PARLAY_STATUS.CANCELLED ? 'cancelled' : 'active';
}

export interface OwnedParlay {
  parlay: NearParlay;
  /** The ticket note is unspent (not yet claimed by this wallet). */
  unclaimed: boolean;
  questions: string[];
  outcomeLabels: string[];
  marketTokens: number[];
}

/** Every parlay whose ticket note this account owns (spent tickets included, so claimed parlays still show). */
export async function ownedParlays(): Promise<OwnedParlay[]> {
  const notes = await refreshNotes(false);
  const tickets = new Map<string, Note>();
  for (const n of notes) {
    if (n.kind !== KIND.PARLAY) continue;
    const key = n.asset.toString();
    const seen = tickets.get(key);
    if (!seen || (seen.status !== 'unspent' && n.status === 'unspent')) tickets.set(key, n);
  }
  const out: OwnedParlay[] = [];
  for (const [id, note] of tickets) {
    const parlay = await getNearParlay(id).catch(() => null);
    if (!parlay) continue;
    const questions: string[] = [];
    const outcomeLabels: string[] = [];
    const marketTokens: number[] = [];
    for (const leg of parlay.legs) {
      const m = await getNearMarket(leg.market_id).catch(() => null);
      const meta = decodeMetadata(m?.metadata);
      questions.push(meta.question || `Market ${leg.market_id}`);
      outcomeLabels.push(meta.outcomeLabels?.[leg.outcome - 1] || `Outcome ${leg.outcome}`);
      marketTokens.push(m?.token_type ?? TOKEN.NEAR);
    }
    out.push({ parlay, unclaimed: note.status === 'unspent', questions, outcomeLabels, marketTokens });
  }
  return out;
}
