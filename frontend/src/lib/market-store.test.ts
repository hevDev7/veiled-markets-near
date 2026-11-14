// The markets the pages show must say whether they take parlays (the owner's set_parlay_leg), and say it again when
// the owner changes it: a refresh used to keep the old market object whenever prices and status had not moved.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const reader = vi.hoisted(() => ({ fetchAllMarkets: vi.fn() }));

vi.mock('./aleo-client', () => ({
  fetchAllMarkets: reader.fetchAllMarkets,
  getCurrentBlockHeight: async () => 100n,
  fetchMarketById: vi.fn(),
  getProgramIdForMarket: () => 'veiled_markets_v37.aleo',
  initializeMarketIds: async () => {},
  getQuestionText: () => 'Will it rain in Jakarta tomorrow?',
  getOutcomeLabels: () => null,
  getMarketTransactionId: () => null,
  getMarketDescription: () => null,
  getMarketResolutionSource: () => null,
  getMarketThumbnailUrl: () => null,
  TOKEN_SYMBOLS: { 1: 'NEAR', 2: 'USAD', 3: 'USDCX' },
  isTransientNetworkError: () => false,
}));
vi.mock('./price-history', () => ({ recordPriceSnapshot: vi.fn() }));

import { useRealMarketsStore } from './market-store';

const row = (parlayLeg: boolean) => ({
  market: {
    id: '933field', creator: 'alice.testnet', resolver: 'alice.testnet', question_hash: '77field', category: 7,
    num_outcomes: 2, deadline: 1_000n, resolution_deadline: 2_000n, status: 1, created_at: 1n, token_type: 1,
    parlay_leg: parlayLeg,
  },
  pool: {
    market_id: '933field', reserve_1: 3_000_000n, reserve_2: 3_000_000n, reserve_3: 0n, reserve_4: 0n,
    total_liquidity: 6_000_000n, total_lp_shares: 6_000_000n, total_volume: 0n, total_trades: 0,
  },
});

beforeEach(() => {
  useRealMarketsStore.setState({ markets: [] });
  reader.fetchAllMarkets.mockReset();
});

describe('fetchMarkets', () => {
  it('marks the markets the owner approved as parlay legs', async () => {
    reader.fetchAllMarkets.mockResolvedValueOnce([row(true)]);
    await useRealMarketsStore.getState().fetchMarkets();
    expect(useRealMarketsStore.getState().markets[0].parlayLeg).toBe(true);
  });

  it('shows a change of approval although nothing else about the market moved', async () => {
    reader.fetchAllMarkets.mockResolvedValueOnce([row(false)]).mockResolvedValueOnce([row(true)]);
    await useRealMarketsStore.getState().fetchMarkets();
    expect(useRealMarketsStore.getState().markets[0].parlayLeg).toBe(false);
    await useRealMarketsStore.getState().fetchMarkets();
    expect(useRealMarketsStore.getState().markets[0].parlayLeg).toBe(true);
  });
});
