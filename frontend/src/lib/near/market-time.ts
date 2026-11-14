// When a market's moments are. The contract's height is a tick, block_timestamp_ms / 4000, so a deadline tick is an
// exact time, open market or ended (the store's deadlineTimestamp is only a countdown estimate for open markets).
import { SECONDS_PER_TICK } from './config';

/** Unix ms at which a deadline tick starts. */
export function deadlineMs(tick: bigint | number): number {
  return Number(tick) * SECONDS_PER_TICK * 1000;
}

/** "Nov 14, 2026, 08:33 PM GMT+7": in the viewer's time zone unless one is given. */
export function formatDeadline(tick: bigint | number, timeZone?: string): string {
  return new Date(deadlineMs(tick)).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
    timeZone,
  });
}

/** The moment a vote judges: docs/near/RESOLUTION.md, "The moment that counts" and "Trading ended early". */
export const VOTE_MOMENT_RULE =
  "Vote by the market's own rules and resolution source, at the moment its question names, or else its original " +
  'trading deadline. Ending trading early does not move that moment: wait until it has passed and the result can no ' +
  'longer change.';
