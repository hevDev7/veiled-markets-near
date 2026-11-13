// Read side of the Veiled contract on NEAR, in the shapes the Aleo-era UI code expects.
import { cachedView, primeView, view } from './rpc';
import { aleoId, nearId } from './ids';

export interface NearTally {
  outcome_bonds: string[];
  total_voters: number;
  total_bonded: string;
  voting_deadline: string;
  dispute_deadline: string;
  finalized: boolean;
  winning_outcome: number;
}

export interface NearDispute {
  disputer: string;
  original_outcome: number;
  proposed_outcome: number;
  dispute_bond: string;
  disputed_at: string;
  escalated_tier: number;
  final_outcome: number;
  resolved_by: string;
  /** The disputer's bond was paid back (absent on contract builds before settlement on use). */
  bond_claimed?: boolean;
}

export interface NearMarket {
  id: string;
  creator: string;
  resolver: string;
  question_hash: string;
  category: number;
  num_outcomes: number;
  deadline: string;
  resolution_deadline: string;
  status: number;
  created_at: string;
  token_type: number;
  metadata: string;
  reserves: string[];
  total_liquidity: string;
  total_lp_shares: string;
  total_volume: string;
  protocol_fees: string;
  creator_fees: string;
  tally: NearTally | null;
  dispute: NearDispute | null;
  market_credits: string;
  outstanding_shares: string;
  trader_collateral: string;
  outcome_shares: string[];
  /** Net collateral behind each outcome's shares; null for markets older than that ledger. */
  outcome_collateral?: string[] | null;
  /** The owner approved this market as a parlay leg. */
  parlay_leg?: boolean;
  creator_fees_claimed: boolean;
  trades: string;
  escalation_tier: number;
  committee_votes: number;
  committee_outcome: number;
  committee_finalized: boolean;
  /** First voter of the leading outcome: the resolver, who is paid bond and reward when the market settles. */
  proposer?: string | null;
  /** What that resolver is paid on top of the bond: a share of the market's protocol fees (micro units). */
  resolver_reward?: string;
}

export interface NearTurbo {
  id: string;
  creator: string;
  symbol_id: number;
  baseline_price: string;
  baseline_conf: string;
  baseline_block: string;
  deadline: string;
  /** Bets are taken while the height is below this (absent on contract builds without the cutoff). */
  betting_deadline?: string;
  resolution_deadline: string;
  closing_price: string;
  closing_conf: string;
  closing_block: string;
  winning_outcome: number;
  status: number;
  created_at: string;
  total_up_amount: string;
  total_down_amount: string;
  total_up_claim_units: string;
  total_down_claim_units: string;
  total_volume: string;
  payout_pool: string;
  fees: string;
  up_bets: number;
  down_bets: number;
  paid_out: string;
}

export interface NearConfig {
  vote_window: number;
  dispute_window: number;
  winner_claim_priority: number;
  disputed_timeout: number;
  vote_bond: string;
  min_voters: number;
  dispute_bond_multiplier: number;
  min_trade: string;
  min_liquidity: string;
  protocol_fee_bps: string;
  creator_fee_bps: string;
  lp_fee_bps: string;
  committee_quorum: number;
}

/** Market metadata kept on chain (create_market `metadata`, at most 2048 bytes). Short keys save room. */
export interface MarketMetadata {
  question?: string;
  description?: string;
  resolutionSource?: string;
  outcomeLabels?: string[];
  thumbnailUrl?: string;
}

const MAX_METADATA = 2048;

export function encodeMetadata(m: MarketMetadata): string {
  const enc = (d: string) =>
    JSON.stringify({
      v: 1,
      q: m.question ?? '',
      d,
      s: m.resolutionSource || undefined,
      o: m.outcomeLabels?.length ? m.outcomeLabels : undefined,
      i: m.thumbnailUrl && m.thumbnailUrl.length < 400 ? m.thumbnailUrl : undefined,
    });
  let description = m.description ?? '';
  let out = enc(description);
  while (new TextEncoder().encode(out).length > MAX_METADATA && description.length > 0) {
    description = description.slice(0, Math.max(0, description.length - 64));
    out = enc(description ? `${description}…` : '');
  }
  return out;
}

export function decodeMetadata(raw: string | null | undefined): MarketMetadata {
  if (!raw) return {};
  try {
    const j = JSON.parse(raw);
    if (!j || typeof j !== 'object') return {};
    return {
      question: typeof j.q === 'string' ? j.q : undefined,
      description: typeof j.d === 'string' && j.d ? j.d : undefined,
      resolutionSource: typeof j.s === 'string' ? j.s : undefined,
      outcomeLabels: Array.isArray(j.o) ? j.o.map(String) : undefined,
      thumbnailUrl: typeof j.i === 'string' ? j.i : undefined,
    };
  } catch {
    return { question: raw.slice(0, 500) };
  }
}

export const getNearMarket = (id: string | number | bigint) =>
  cachedView<NearMarket | null>('get_market', { market_id: nearId(id) }, 3000);

export async function listNearMarkets(): Promise<NearMarket[]> {
  const count = Number(await cachedView<string>('get_market_count', {}, 3000));
  const pages: Promise<NearMarket[]>[] = [];
  for (let from = 0; from < count; from += 100) {
    pages.push(cachedView<NearMarket[]>('get_markets', { from: String(from), limit: 100 }, 3000));
  }
  const all = (await Promise.all(pages)).flat();
  // The per-market readers (one get_market per id) then share this answer instead of one request each.
  for (const m of all) primeView('get_market', { market_id: m.id }, m);
  return all;
}

export const getNearHeight = async (): Promise<bigint> => BigInt(await cachedView<string>('get_height', {}, 2000));
export const getNearConfig = () => cachedView<NearConfig>('get_config', {}, 30_000);
export const getGovernanceValues = () =>
  cachedView<{ protocol_fee_bps: string; creator_fee_bps: string; lp_fee_bps: string; min_trade_amount: string; min_liquidity: string; paused: boolean }>(
    'get_governance_values',
    {},
    30_000,
  );
export const getNearVote = (marketId: string, accountId: string) =>
  view<{ outcome: number; bond: string; claimed: boolean } | null>('get_vote', { market_id: nearId(marketId), account_id: accountId });
/** The evidence link a voter attached to their vote (vote_outcome `evidence`), or null. */
export const getVoteEvidence = (marketId: string, accountId: string) =>
  cachedView<string | null>('get_vote_evidence', { market_id: nearId(marketId), account_id: accountId }, 30_000).catch(() => null);
/** The resolver's share of a market's protocol fees, in basis points. */
export const getResolverRewardBps = () => cachedView<number>('get_resolver_reward_bps', {}, 60_000);
export const getNearTurbo = (id: string | number | bigint) =>
  cachedView<NearTurbo | null>('get_turbo_market', { market_id: nearId(id) }, 2000);

/** The market whose create_market carried this question hash (newest first). */
export async function findMarketByQuestionHash(questionHash: string, creator?: string): Promise<NearMarket | null> {
  const all = await listNearMarkets();
  for (let i = all.length - 1; i >= 0; i--) {
    const m = all[i];
    if (m.question_hash === questionHash && (!creator || m.creator === creator)) return m;
  }
  return null;
}

export { aleoId, nearId };
