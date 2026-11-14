// An ended market showed its deadline as "Block 448665808": the store estimates a deadline date only while a market
// is open, and the page fell back to the raw tick. A tick is block_timestamp_ms / 4000, so the date is exact.
// The vote prompt told voters to judge "as of the trading deadline", which after an early close is before the event
// (market #33 closed Nov 14, the FOMC decides Dec 9) and invited a wrong vote that becomes final unless disputed.
import { describe, expect, it } from 'vitest';
import { deadlineMs, formatDeadline, VOTE_MOMENT_RULE } from './market-time';

describe('market deadline', () => {
  it('turns a deadline tick into its exact time', () => {
    expect(deadlineMs(448665808n)).toBe(Date.UTC(2026, 10, 14, 13, 33, 52));
    expect(deadlineMs(448665808)).toBe(Date.UTC(2026, 10, 14, 13, 33, 52));
  });

  it('shows an ended market deadline as a date with its time zone, not a block', () => {
    // ICU puts a narrow no-break space before AM/PM; compare with plain spaces.
    expect(formatDeadline(448665808n, 'UTC').replace(/\s/g, ' ')).toBe('Nov 14, 2026, 01:33 PM UTC');
  });
});

describe('vote timing rule', () => {
  it('judges the original moment, which an early close does not move', () => {
    expect(VOTE_MOMENT_RULE).toMatch(/original trading deadline/);
    expect(VOTE_MOMENT_RULE).toMatch(/Ending trading early does not move that moment/);
    expect(VOTE_MOMENT_RULE).not.toMatch(/as of the trading deadline/);
  });
});
