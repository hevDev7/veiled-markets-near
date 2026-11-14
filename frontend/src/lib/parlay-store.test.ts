// "Add to Parlay" was offered on every market, but the contract only takes legs on markets the owner approved
// (set_parlay_leg) that are still open, so a slip built from any other market failed at placement with
// "One of these markets is not open for parlays." The UI now reads the market's approval and refuses such legs.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Market } from './store';

vi.hoisted(() => {
  const data = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() {
      return data.size;
    },
  } as Storage;
});

import {
  PARLAY_LEG_CLOSED,
  PARLAY_LEG_NOT_APPROVED,
  parlayLegBlocker,
  slipLegBlockers,
  useParlayStore,
  type ParlaySlipLeg,
} from './parlay-store';

const NOW = 1_800_000_000_000;

const market = (o: Partial<Market> = {}): Market => ({
  id: '933field',
  question: 'Will it rain in Jakarta tomorrow?',
  category: 7,
  numOutcomes: 2,
  outcomeLabels: ['Yes', 'No'],
  deadline: 1_000n,
  resolutionDeadline: 2_000n,
  status: 1,
  yesReserve: 3_000_000n,
  noReserve: 3_000_000n,
  reserve3: 0n,
  reserve4: 0n,
  totalLiquidity: 6_000_000n,
  totalLPShares: 6_000_000n,
  outcomePrices: [0.5, 0.5],
  totalVolume: 0n,
  totalBets: 0,
  totalYesIssued: 0n,
  totalNoIssued: 0n,
  timeRemaining: '2d 3h 0m',
  deadlineTimestamp: NOW + 60_000,
  tokenType: 'NEAR',
  parlayLeg: true,
  ...o,
});

describe('parlayLegBlocker', () => {
  it('lets an approved market that is still open be a leg', () => {
    expect(parlayLegBlocker(market(), NOW)).toBeNull();
  });

  it('refuses a market the owner has not approved', () => {
    expect(parlayLegBlocker(market({ parlayLeg: undefined }), NOW)).toBe(PARLAY_LEG_NOT_APPROVED);
    expect(parlayLegBlocker(market({ parlayLeg: false }), NOW)).toBe(PARLAY_LEG_NOT_APPROVED);
  });

  it('refuses a market that is no longer active', () => {
    expect(parlayLegBlocker(market({ status: 3 }), NOW)).toBe(PARLAY_LEG_CLOSED);
  });

  it('refuses a market past its deadline, before the next refresh marks it ended', () => {
    expect(parlayLegBlocker(market({ timeRemaining: 'Ended' }), NOW)).toBe(PARLAY_LEG_CLOSED);
    expect(parlayLegBlocker(market({ deadlineTimestamp: NOW - 1 }), NOW)).toBe(PARLAY_LEG_CLOSED);
  });
});

describe('addLeg', () => {
  // addLeg reads the real clock; pin it so the fixture's deadline stays in the future.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    useParlayStore.setState({ slipLegs: [], slipOpen: false });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not put a market the owner has not approved on the slip', () => {
    useParlayStore.getState().addLeg(market({ parlayLeg: false }), 1);
    expect(useParlayStore.getState().slipLegs).toEqual([]);
    expect(useParlayStore.getState().slipOpen).toBe(false);
  });

  it('does not put a closed market on the slip', () => {
    useParlayStore.getState().addLeg(market({ status: 2 }), 1);
    expect(useParlayStore.getState().slipLegs).toEqual([]);
  });

  it('puts an approved, open market on the slip', () => {
    useParlayStore.getState().addLeg(market(), 2);
    expect(useParlayStore.getState().slipLegs).toMatchObject([{ marketId: '933field', outcome: 2, outcomeLabel: 'No' }]);
    expect(useParlayStore.getState().slipOpen).toBe(true);
  });
});

// A slip is kept in the browser, so legs added before a market lost its approval or closed (or before this check
// existed) are still on it; the slip names those legs instead of failing the whole slip with one general sentence.
describe('slipLegBlockers', () => {
  const leg = (marketId: string): ParlaySlipLeg => ({
    marketId, marketQuestion: 'Q', marketProgram: 1, outcome: 1, outcomeLabel: 'Yes', oddsBps: 20_000n, displayOdds: 2,
    marketTokenType: 'NEAR',
  });

  it('names, by market id, each leg whose market cannot be a leg now', () => {
    const markets = [market(), market({ id: '31field', parlayLeg: false }), market({ id: '30field', status: 3 })];
    expect(slipLegBlockers([leg('933field'), leg('31field'), leg('30field')], markets, NOW))
      .toEqual({ '31field': PARLAY_LEG_NOT_APPROVED, '30field': PARLAY_LEG_CLOSED });
  });

  it('leaves a leg unmarked when its market is not loaded (the contract quote still speaks for it)', () => {
    expect(slipLegBlockers([leg('31field')], [], NOW)).toEqual({});
  });
});
