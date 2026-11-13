// The governance page states the contract's resolution settings in words a person can act on, and counts the
// markets at each stage of resolution.
import { describe, expect, it } from 'vitest';
import { formatWindow, percentOfBps, resolutionCounts } from './governance';

describe('formatWindow', () => {
  it('turns contract ticks of four seconds into a duration', () => {
    expect(formatWindow(7)).toBe('28 s');
    expect(formatWindow(15)).toBe('1 min');
    expect(formatWindow(75)).toBe('5 min');
    expect(formatWindow(900)).toBe('1 hour');
    expect(formatWindow(1350)).toBe('1 h 30 min');
    expect(formatWindow(1800)).toBe('2 hours');
    expect(formatWindow(21600)).toBe('1 day');
    expect(formatWindow(23400)).toBe('1 day 2 h');
    expect(formatWindow(43200)).toBe('2 days');
  });
});

describe('percentOfBps', () => {
  it('shows basis points as a percentage without padding zeros', () => {
    expect(percentOfBps('50')).toBe('0.5%');
    expect(percentOfBps('100')).toBe('1%');
    expect(percentOfBps(125)).toBe('1.25%');
    expect(percentOfBps('0')).toBe('0%');
  });
});

describe('resolutionCounts', () => {
  const market = (status: number, timeRemaining = '3d 2h 1m') => ({ status, timeRemaining });

  it('counts markets by where they are in resolution', () => {
    const counts = resolutionCounts([
      market(1), // trading
      market(1), // trading
      market(1, 'Ended'), // closed, nobody has voted yet
      market(2, 'Ended'),
      market(5), // vote window open
      market(6), // voted, can still be disputed
      market(7), // disputed
      market(7),
      market(3), // resolved
      market(4), // cancelled
    ]);
    expect(counts).toEqual({ trading: 2, awaitingVote: 2, voting: 1, disputeWindow: 1, disputed: 2, resolved: 1, cancelled: 1 });
  });

  it('is all zeros for no markets', () => {
    expect(resolutionCounts([])).toEqual({ trading: 0, awaitingVote: 0, voting: 0, disputeWindow: 0, disputed: 0, resolved: 0, cancelled: 0 });
  });
});
