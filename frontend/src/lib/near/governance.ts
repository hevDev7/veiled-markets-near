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

export interface ResolutionCounts {
  /** Open for trading. */
  trading: number;
  /** Trading has closed and nobody has voted yet. */
  awaitingVote: number;
  /** The vote window is open. */
  voting: number;
  /** An outcome was voted and can still be disputed. */
  disputeWindow: number;
  /** Disputed: the committee decides. */
  disputed: number;
  resolved: number;
  cancelled: number;
}

// Market statuses as the contract numbers them (markets.rs).
const ACTIVE = 1;
const CLOSED = 2;
const RESOLVED = 3;
const CANCELLED = 4;
const PENDING_RESOLUTION = 5;
const PENDING_FINALIZATION = 6;
const DISPUTED = 7;

export function resolutionCounts(markets: ReadonlyArray<{ status: number; timeRemaining?: string }>): ResolutionCounts {
  const counts: ResolutionCounts = { trading: 0, awaitingVote: 0, voting: 0, disputeWindow: 0, disputed: 0, resolved: 0, cancelled: 0 };
  for (const m of markets) {
    if (m.status === RESOLVED) counts.resolved++;
    else if (m.status === CANCELLED) counts.cancelled++;
    else if (m.status === DISPUTED) counts.disputed++;
    else if (m.status === PENDING_FINALIZATION) counts.disputeWindow++;
    else if (m.status === PENDING_RESOLUTION) counts.voting++;
    else if (m.status === CLOSED || (m.status === ACTIVE && m.timeRemaining === 'Ended')) counts.awaitingVote++;
    else if (m.status === ACTIVE) counts.trading++;
  }
  return counts;
}
