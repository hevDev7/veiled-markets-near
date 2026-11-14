// A slip is kept between visits, so it can hold a leg on a market that has closed or lost its parlay approval since.
// The slip used to show only the contract's "One of these markets is not open for parlays" at placement, without
// saying which leg; it now marks the leg and asks for it to be removed.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Market } from '@/lib/store';

vi.hoisted(() => {
  const data = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: () => null,
    length: 0,
  } as Storage;
});
// The contract views and the market reader are not under test: the slip renders from the stores.
vi.mock('@/lib/near/parlay', () => ({ quoteParlay: vi.fn(), getParlayPool: vi.fn() }));
vi.mock('@/lib/aleo-client', () => ({
  fetchAllMarkets: vi.fn(),
  getCurrentBlockHeight: async () => 100n,
  fetchMarketById: vi.fn(),
  getProgramIdForMarket: () => 'veiled_markets_v37.aleo',
  initializeMarketIds: async () => {},
  getQuestionText: () => null,
  getOutcomeLabels: () => null,
  getMarketTransactionId: () => null,
  getMarketDescription: () => null,
  getMarketResolutionSource: () => null,
  getMarketThumbnailUrl: () => null,
  TOKEN_SYMBOLS: { 1: 'NEAR', 2: 'USAD', 3: 'USDCX' },
  isTransientNetworkError: () => false,
}));
vi.mock('@/lib/price-history', () => ({ recordPriceSnapshot: vi.fn() }));
vi.mock('./ParlayConfirmModal', () => ({ ParlayConfirmModal: () => null }));

import { ParlaySlip } from './ParlaySlip';
import { PARLAY_LEG_NOT_APPROVED, useParlayStore, type ParlaySlipLeg } from '@/lib/parlay-store';
import { useRealMarketsStore } from '@/lib/market-store';

// A server render reads a zustand store's initial state object (its server snapshot), not the current state, so each
// test's state goes into both.
function seed<T extends object>(store: { setState: (s: Partial<T>) => void; getInitialState: () => T }, s: Partial<T>) {
  store.setState(s);
  Object.assign(store.getInitialState(), s);
}

const leg =(marketId: string): ParlaySlipLeg => ({
  marketId,
  marketQuestion: `Market ${marketId}?`,
  marketProgram: 1,
  outcome: 1,
  outcomeLabel: 'Yes',
  oddsBps: 20_000n,
  displayOdds: 2,
  marketTokenType: 'NEAR',
});

const market = (id: string, o: Partial<Market> = {}): Market => ({
  id,
  question: `Market ${id}?`,
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
  outcomePercentages: [50, 50],
  outcomePayouts: [2, 2],
  totalVolume: 0n,
  totalBets: 0,
  totalYesIssued: 0n,
  totalNoIssued: 0n,
  timeRemaining: '2d 3h 0m',
  deadlineTimestamp: Date.now() + 86_400_000,
  tokenType: 'NEAR',
  parlayLeg: true,
  ...o,
});

beforeEach(() => {
  seed(useParlayStore, { slipLegs: [leg('933field'), leg('31field')], slipStake: 0n, slipTokenType: 'NEAR', slipOpen: true });
  seed(useRealMarketsStore, { markets: [] });
});

describe('ParlaySlip', () => {
  it('marks a leg whose market lost its parlay approval and asks for it to be removed', () => {
    seed(useRealMarketsStore, { markets: [market('933field'), market('31field', { parlayLeg: false })] });
    const html = renderToStaticMarkup(<ParlaySlip />);
    expect(html.split(PARLAY_LEG_NOT_APPROVED)).toHaveLength(2);
    expect(html).toContain('Remove the leg marked above: its market cannot be in a parlay now.');
  });

  it('counts every marked leg in the message', () => {
    seed(useRealMarketsStore, { markets: [market('933field', { status: 2 }), market('31field', { parlayLeg: false })] });
    const html = renderToStaticMarkup(<ParlaySlip />);
    expect(html).toContain('Remove the 2 legs marked above: their markets cannot be in a parlay now.');
  });

  it('marks nothing while the markets are not loaded (placement still checks with the contract)', () => {
    const html = renderToStaticMarkup(<ParlaySlip />);
    expect(html).not.toContain(PARLAY_LEG_NOT_APPROVED);
    expect(html).not.toContain('marked above');
  });
});
