// The governance page states the contract's resolution settings in words a person can act on, and counts the
// markets at each stage of resolution.
import { describe, expect, it } from 'vitest';
import { formatWindow, percentOfBps, resolutionCounts, resolutionStage, stageSummary } from './governance';

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

const HEIGHT = 1000n;
const base = {
  status: 1,
  deadline: '2000',
  escalation_tier: 0,
  tally: null,
  dispute: null,
  committee_votes: 0,
  committee_outcome: 0,
  committee_finalized: false,
};
const tally = (over = {}) => ({
  outcome_bonds: ['100000', '0', '0', '0'],
  total_voters: 1,
  total_bonded: '100000',
  voting_deadline: '1075',
  dispute_deadline: '0',
  finalized: false,
  winning_outcome: 0,
  ...over,
});
const dispute = { proposed_outcome: 2, dispute_bond: '300000', disputed_at: '950' };

describe('resolutionStage', () => {
  it('follows a market from the end of trading to its result', () => {
    expect(resolutionStage(base, HEIGHT)).toBeNull(); // still trading
    expect(resolutionStage({ ...base, deadline: '900' }, HEIGHT)).toBe('awaiting_vote');
    expect(resolutionStage({ ...base, status: 2, deadline: '900' }, HEIGHT)).toBe('awaiting_vote');
    expect(resolutionStage({ ...base, status: 5 }, HEIGHT)).toBe('voting');
    expect(resolutionStage({ ...base, status: 6 }, HEIGHT)).toBe('dispute_window');
    expect(resolutionStage({ ...base, status: 7 }, HEIGHT)).toBe('disputed');
    expect(resolutionStage({ ...base, status: 7, escalation_tier: 2 }, HEIGHT)).toBe('committee');
    expect(resolutionStage({ ...base, status: 3 }, HEIGHT)).toBe('resolved');
    expect(resolutionStage({ ...base, status: 4 }, HEIGHT)).toBe('cancelled');
  });
});

describe('resolutionCounts', () => {
  it('counts markets by where they are in resolution', () => {
    const counts = resolutionCounts(
      [
        base,
        base,
        { ...base, deadline: '900' },
        { ...base, status: 2, deadline: '900' },
        { ...base, status: 5 },
        { ...base, status: 6 },
        { ...base, status: 7 },
        { ...base, status: 7, escalation_tier: 2 }, // with the committee: still a dispute
        { ...base, status: 3 },
        { ...base, status: 4 },
      ],
      HEIGHT,
    );
    expect(counts).toEqual({ trading: 2, awaitingVote: 2, voting: 1, disputeWindow: 1, disputed: 2, resolved: 1, cancelled: 1 });
  });

  it('is all zeros for no markets', () => {
    expect(resolutionCounts([], HEIGHT)).toEqual({ trading: 0, awaitingVote: 0, voting: 0, disputeWindow: 0, disputed: 0, resolved: 0, cancelled: 0 });
  });
});

describe('stageSummary', () => {
  const options = { quorum: 3, label: (outcome: number) => ['Yes', 'No'][outcome - 1] ?? `Outcome ${outcome}` };

  it('says how long a closed market has waited for its first vote', () => {
    expect(stageSummary({ ...base, deadline: '925' }, HEIGHT, options)).toBe('Trading closed 5 min ago. Nobody has voted yet.');
  });

  it('names the leading outcome, the bonds and the time left to vote', () => {
    expect(stageSummary({ ...base, status: 5, tally: tally() }, HEIGHT, options)).toBe(
      'Yes leads with 0.1 NEAR bonded by 1 voter. Voting closes in 5 min.',
    );
    expect(stageSummary({ ...base, status: 5, tally: tally({ voting_deadline: '990' }) }, HEIGHT, options)).toBe(
      'Yes leads with 0.1 NEAR bonded by 1 voter. Voting closed short of its quorum: the next vote reopens it.',
    );
  });

  it('says how long a voted result can still be disputed', () => {
    const voted = tally({ winning_outcome: 2, dispute_deadline: '1030' });
    expect(stageSummary({ ...base, status: 6, tally: voted }, HEIGHT, options)).toBe('Voted No. It can be disputed for another 2 min.');
    expect(stageSummary({ ...base, status: 6, tally: { ...voted, dispute_deadline: '999' } }, HEIGHT, options)).toBe(
      'Voted No. The dispute window has passed, so the result stands.',
    );
  });

  it('describes a dispute and the committee\'s progress', () => {
    const voted = tally({ winning_outcome: 1 });
    expect(stageSummary({ ...base, status: 7, tally: voted, dispute }, HEIGHT, options)).toBe(
      'Voted Yes, disputed in favour of No with a bond of 0.3 NEAR. Not yet sent to the committee.',
    );
    expect(stageSummary({ ...base, status: 7, escalation_tier: 2, committee_votes: 2, tally: voted, dispute }, HEIGHT, options)).toBe(
      'Voted Yes, disputed in favour of No. The committee has cast 2 of the 3 votes needed.',
    );
    expect(
      stageSummary(
        { ...base, status: 7, escalation_tier: 2, committee_votes: 3, committee_outcome: 2, committee_finalized: true, tally: voted, dispute },
        HEIGHT,
        options,
      ),
    ).toBe('The committee chose No, which settles the market.');
  });

  it('says when a dispute has outlived its time limit and the market is cancelled', () => {
    const voted = tally({ winning_outcome: 1 });
    const withCommittee = { ...base, status: 7, escalation_tier: 2, committee_votes: 0, tally: voted, dispute };
    // Disputed at tick 950 with a limit of 900 ticks: over once the height passes 1850.
    expect(stageSummary(withCommittee, 1850n, { ...options, timeout: 900 })).toBe(
      'Voted Yes, disputed in favour of No. The committee has cast 0 of the 3 votes needed.',
    );
    expect(stageSummary(withCommittee, 1851n, { ...options, timeout: 900 })).toBe(
      'Voted Yes, disputed in favour of No. The committee has cast 0 of the 3 votes needed. ' +
        'The time limit for a decision has passed: the market is cancelled, and every position and bond can be refunded.',
    );
    expect(stageSummary({ ...withCommittee, escalation_tier: 0 }, 1851n, { ...options, timeout: 900 })).toBe(
      'Voted Yes, disputed in favour of No with a bond of 0.3 NEAR. Not yet sent to the committee. ' +
        'The time limit for a decision has passed: the market is cancelled, and every position and bond can be refunded.',
    );
  });

  it('gives the result and how it was reached', () => {
    expect(stageSummary({ ...base, status: 3, tally: tally({ winning_outcome: 1 }) }, HEIGHT, options)).toBe('Result: Yes, by vote.');
    expect(stageSummary({ ...base, status: 3, tally: tally({ winning_outcome: 2 }), dispute }, HEIGHT, options)).toBe(
      'Result: No, decided by the committee after a dispute.',
    );
    expect(stageSummary({ ...base, status: 4 }, HEIGHT, options)).toBe('Cancelled. Every position can be refunded.');
  });
});
