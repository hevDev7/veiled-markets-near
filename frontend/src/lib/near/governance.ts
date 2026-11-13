// What the governance page says about resolution on NEAR: the contract's settings in plain words, and how many
// markets are at each stage. The settings themselves come from the contract (chain.ts getNearConfig).
import { SECONDS_PER_TICK } from './config';

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;

/** A window the contract measures in ticks, as a duration: "5 min", "1 hour", "1 h 30 min", "2 days". */
export function formatWindow(ticks: number): string {
  const seconds = Math.round(ticks * SECONDS_PER_TICK);
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  if (hours < 24) return restMinutes ? `${hours} h ${restMinutes} min` : plural(hours, 'hour');
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours ? `${plural(days, 'day')} ${restHours} h` : plural(days, 'day');
}

/** Basis points as a percentage: "0.5%", "1%". */
export function percentOfBps(bps: string | number): string {
  return `${Number(bps) / 100}%`;
}

/** Micro units (6 decimals) as a plain number: "0.1", "0.001". */
export const microToUnits = (micro: string | bigint) => String(Number(micro) / 1_000_000);

/** Where a market is between the end of trading and its result. */
export type ResolutionStage = 'awaiting_vote' | 'voting' | 'dispute_window' | 'disputed' | 'committee' | 'resolved' | 'cancelled';

/** The fields of a market (chain.ts NearMarket) that resolution depends on. */
export interface ResolvingMarket {
  status: number;
  deadline: string;
  escalation_tier: number;
  tally: {
    outcome_bonds: string[];
    total_voters: number;
    total_bonded: string;
    voting_deadline: string;
    dispute_deadline: string;
    winning_outcome: number;
  } | null;
  dispute: { proposed_outcome: number; dispute_bond: string; disputed_at: string } | null;
  committee_votes: number;
  committee_outcome: number;
  committee_finalized: boolean;
}

// Market statuses as the contract numbers them (markets.rs).
const ACTIVE = 1;
const CLOSED = 2;
const RESOLVED = 3;
const CANCELLED = 4;
const PENDING_RESOLUTION = 5;
const PENDING_FINALIZATION = 6;
const DISPUTED = 7;

/** The market's stage at contract height `height`, or null while it is still trading. */
export function resolutionStage(m: Pick<ResolvingMarket, 'status' | 'deadline' | 'escalation_tier'>, height: bigint): ResolutionStage | null {
  switch (m.status) {
    case RESOLVED:
      return 'resolved';
    case CANCELLED:
      return 'cancelled';
    case DISPUTED:
      return m.escalation_tier >= 2 ? 'committee' : 'disputed';
    case PENDING_FINALIZATION:
      return 'dispute_window';
    case PENDING_RESOLUTION:
      return 'voting';
    case CLOSED:
      return 'awaiting_vote';
    case ACTIVE:
      return height > BigInt(m.deadline) ? 'awaiting_vote' : null;
    default:
      return null;
  }
}

export interface ResolutionCounts {
  /** Open for trading. */
  trading: number;
  /** Trading has closed and nobody has voted yet. */
  awaitingVote: number;
  /** The vote window is open. */
  voting: number;
  /** An outcome was voted and can still be disputed. */
  disputeWindow: number;
  /** Disputed, whether or not it has reached the committee yet. */
  disputed: number;
  resolved: number;
  cancelled: number;
}

export function resolutionCounts(
  markets: ReadonlyArray<Pick<ResolvingMarket, 'status' | 'deadline' | 'escalation_tier'>>,
  height: bigint,
): ResolutionCounts {
  const counts: ResolutionCounts = { trading: 0, awaitingVote: 0, voting: 0, disputeWindow: 0, disputed: 0, resolved: 0, cancelled: 0 };
  for (const m of markets) {
    const stage = resolutionStage(m, height);
    if (stage === null) counts.trading++;
    else if (stage === 'awaiting_vote') counts.awaitingVote++;
    else if (stage === 'voting') counts.voting++;
    else if (stage === 'dispute_window') counts.disputeWindow++;
    else if (stage === 'disputed' || stage === 'committee') counts.disputed++;
    else if (stage === 'resolved') counts.resolved++;
    else counts.cancelled++;
  }
  return counts;
}

/** The outcome with the most bonded NEAR; a tie goes to the lower outcome, as in the contract. */
function leadingOutcome(bonds: string[]): number {
  let best = 0;
  for (let k = 1; k < bonds.length; k++) if (BigInt(bonds[k]) > BigInt(bonds[best])) best = k;
  return best + 1;
}

/**
 * One or two sentences on where a market stands and what can happen next. `label` names an outcome, `quorum` is
 * the number of committee votes the contract asks for, and `timeout` is its time limit for a dispute, in ticks.
 */
export function stageSummary(
  m: ResolvingMarket,
  height: bigint,
  { quorum, label, timeout }: { quorum: number; label: (outcome: number) => string; timeout?: number },
): string {
  const stage = resolutionStage(m, height);
  const tally = m.tally;
  const ticksUntil = (tick: string) => Number(BigInt(tick) - height);
  // A dispute nobody has settled within the limit can be cancelled by anyone (contract: cancel_market).
  const overdue =
    timeout !== undefined && m.dispute && height > BigInt(m.dispute.disputed_at) + BigInt(timeout)
      ? ' The time limit for a decision has passed: anyone can cancel the market, which refunds every position and bond.'
      : '';
  switch (stage) {
    case 'awaiting_vote':
      return `Trading closed ${formatWindow(Number(height - BigInt(m.deadline)))} ago. Nobody has voted yet.`;
    case 'voting': {
      if (!tally) return 'A vote has opened.';
      const lead = `${label(leadingOutcome(tally.outcome_bonds))} leads with ${microToUnits(tally.total_bonded)} NEAR bonded by ${plural(tally.total_voters, 'voter')}.`;
      const left = ticksUntil(tally.voting_deadline);
      return left >= 0 ? `${lead} Voting closes in ${formatWindow(left)}.` : `${lead} Voting has closed: the vote can be finalized.`;
    }
    case 'dispute_window': {
      if (!tally) return 'A result has been voted.';
      const left = ticksUntil(tally.dispute_deadline);
      return left >= 0
        ? `Voted ${label(tally.winning_outcome)}. It can be disputed for another ${formatWindow(left)}.`
        : `Voted ${label(tally.winning_outcome)}. The dispute window has passed: the result can be confirmed.`;
    }
    case 'disputed':
      return tally && m.dispute
        ? `Voted ${label(tally.winning_outcome)}, disputed in favour of ${label(m.dispute.proposed_outcome)} with a bond of ${microToUnits(m.dispute.dispute_bond)} NEAR. Not yet sent to the committee.${overdue}`
        : `The voted result has been disputed.${overdue}`;
    case 'committee':
      if (m.committee_finalized) return `The committee chose ${label(m.committee_outcome)}. Its decision can now be applied.`;
      return tally && m.dispute
        ? `Voted ${label(tally.winning_outcome)}, disputed in favour of ${label(m.dispute.proposed_outcome)}. The committee has cast ${m.committee_votes} of the ${quorum} votes needed.${overdue}`
        : `The committee has cast ${m.committee_votes} of the ${quorum} votes needed.${overdue}`;
    case 'resolved':
      if (!tally) return 'Resolved.';
      return m.dispute
        ? `Result: ${label(tally.winning_outcome)}, decided by the committee after a dispute.`
        : `Result: ${label(tally.winning_outcome)}, by vote.`;
    case 'cancelled':
      return 'Cancelled. Every position can be refunded.';
    default:
      return 'Open for trading.';
  }
}
