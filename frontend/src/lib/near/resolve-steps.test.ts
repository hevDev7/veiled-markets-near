// The Resolve panel's stage chips: Close → Vote → Dispute → Settle, with Cancel as the other way a market can end.
import { describe, expect, it } from 'vitest';
import { stepChip, type ResolveStep } from './resolve-steps';

const chips = (current: ResolveStep) =>
  (['close', 'submit', 'challenge', 'finalize', 'cancel'] as const).map((key) => stepChip(key, current));

describe('stepChip', () => {
  it('shows every stage but Cancel as passed on a resolved market', () => {
    expect(chips('done')).toEqual(['complete', 'complete', 'complete', 'complete', 'pending']);
  });

  it('shows only Cancel on a cancelled market, since it may have ended before any vote', () => {
    expect(chips('cancel')).toEqual(['pending', 'pending', 'pending', 'pending', 'current']);
  });

  it('marks the stages before the current one as passed', () => {
    expect(chips('close')).toEqual(['current', 'pending', 'pending', 'pending', 'pending']);
    expect(chips('submit')).toEqual(['complete', 'current', 'pending', 'pending', 'pending']);
    expect(chips('finalize')).toEqual(['complete', 'complete', 'complete', 'current', 'pending']);
  });

  it('keeps Dispute current while the committee decides', () => {
    expect(chips('disputed')).toEqual(['complete', 'complete', 'current', 'pending', 'pending']);
  });
});
