// ============================================================================
// VEILED MARKETS SDK - Client Tests
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VeiledMarketsClient, createClient } from '../client';
import { MarketStatus, Outcome } from '../types';

// Mock fetch for API calls
global.fetch = vi.fn();

describe('VeiledMarketsClient', () => {
  let client: VeiledMarketsClient;

  beforeEach(() => {
    client = createClient({
      network: 'testnet',
      programId: 'veiled_markets_v9.aleo',
    });
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create client with default config', () => {
      const defaultClient = createClient();
      expect(defaultClient.programId).toBe('veiled_markets_v9.aleo');
      expect(defaultClient.network).toBe('testnet');
    });

    it('should create client with custom config', () => {
      const customClient = createClient({
        network: 'mainnet',
        programId: 'custom_program.aleo',
      });
      expect(customClient.programId).toBe('custom_program.aleo');
      expect(customClient.network).toBe('mainnet');
    });
  });

  describe('getCurrentBlockHeight', () => {
    it('should fetch current block height from network', async () => {
      const mockHeight = 123456;
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockHeight,
      });

      const height = await client.getCurrentBlockHeight();
      expect(height).toBe(BigInt(mockHeight));
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('should return cached height on network error', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Network error'));

      const height = await client.getCurrentBlockHeight();
      expect(height).toBeGreaterThanOrEqual(0n);
    });
  });

  describe('getMappingValue', () => {
    it('should fetch mapping value from program', async () => {
      const mockValue = '1234567u64';
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockValue,
      });

      const value = await client.getMappingValue('markets', 'test_market_id');
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('should return null on 404', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
      });

      const value = await client.getMappingValue('markets', 'nonexistent');
      expect(value).toBeNull();
    });
  });

  describe('getMarket', () => {
    it('should return null for non-existent market', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
      });

      const market = await client.getMarket('nonexistent_id');
      expect(market).toBeNull();
    });
  });

  describe('getMockMarkets', () => {
    it('should return array of mock markets', () => {
      const markets = client.getMockMarkets();
      expect(Array.isArray(markets)).toBe(true);
      expect(markets.length).toBeGreaterThan(0);
    });

    it('should have valid market structure', () => {
      const markets = client.getMockMarkets();
      const market = markets[0];

      expect(market).toHaveProperty('id');
      expect(market).toHaveProperty('creator');
      expect(market).toHaveProperty('question');
      expect(market).toHaveProperty('category');
      expect(market).toHaveProperty('deadline');
      expect(market).toHaveProperty('status');
      expect(market).toHaveProperty('yesPercentage');
      expect(market).toHaveProperty('noPercentage');
      expect(market).toHaveProperty('totalVolume');
    });

    it('should have percentages that sum to 100', () => {
      const markets = client.getMockMarkets();
      for (const market of markets) {
        const sum = market.yesPercentage + market.noPercentage;
        expect(sum).toBeCloseTo(100, 1);
      }
    });
  });

  describe('getActiveMarkets', () => {
    it('should return only active markets', async () => {
      const markets = await client.getActiveMarkets();
      for (const market of markets) {
        expect(market.status).toBe(MarketStatus.Active);
      }
    });
  });

  describe('getTrendingMarkets', () => {
    it('should return markets sorted by volume', async () => {
      const markets = await client.getTrendingMarkets(5);
      expect(markets.length).toBeLessThanOrEqual(5);
      
      for (let i = 1; i < markets.length; i++) {
        expect(markets[i - 1].totalVolume).toBeGreaterThanOrEqual(markets[i].totalVolume);
      }
    });

    it('should respect limit parameter', async () => {
      const markets = await client.getTrendingMarkets(3);
      expect(markets.length).toBeLessThanOrEqual(3);
    });
  });

  describe('searchMarkets', () => {
    it('should find markets by question text', async () => {
      const markets = await client.searchMarkets('Bitcoin');
      expect(markets.length).toBeGreaterThan(0);
      for (const market of markets) {
        expect(market.question?.toLowerCase()).toContain('bitcoin');
      }
    });

    it('should return empty array for no matches', async () => {
      const markets = await client.searchMarkets('xyznonexistent123');
      expect(markets.length).toBe(0);
    });
  });

  describe('buildCreateMarketInputs', () => {
    it('should build valid create market inputs', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => 100000,
      });

      const inputs = await client.buildCreateMarketInputs({
        question: 'Test question?',
        category: 3,
        deadline: new Date(Date.now() + 86400000),
        resolutionDeadline: new Date(Date.now() + 172800000),
      });

      expect(inputs.length).toBe(4);
      expect(inputs[1]).toBe('3u8'); // category
      expect(inputs[2]).toMatch(/\d+u64/); // deadline
      expect(inputs[3]).toMatch(/\d+u64/); // resolution deadline
    });
  });

  describe('buildPlaceBetInputs', () => {
    it('should build valid place bet inputs', () => {
      const inputs = client.buildPlaceBetInputs(
        {
          marketId: 'test_market_id',
          amount: 1000000n,
          outcome: Outcome.Yes,
        },
        'mock_credits_record'
      );

      expect(inputs.length).toBe(4);
      expect(inputs[0]).toBe('test_market_id');
      expect(inputs[1]).toBe('1000000u64');
      expect(inputs[2]).toBe('1u8');
      expect(inputs[3]).toBe('mock_credits_record');
    });

    it('should use correct outcome values', () => {
      const yesInputs = client.buildPlaceBetInputs(
        { marketId: 'id', amount: 1000n, outcome: Outcome.Yes },
        'record'
      );
      expect(yesInputs[2]).toBe('1u8');

      const noInputs = client.buildPlaceBetInputs(
        { marketId: 'id', amount: 1000n, outcome: Outcome.No },
        'record'
      );
      expect(noInputs[2]).toBe('2u8');
    });
  });

  describe('buildResolveMarketInputs', () => {
    it('should build valid resolve market inputs', () => {
      const inputs = client.buildResolveMarketInputs('market_id', Outcome.Yes);
      expect(inputs).toEqual(['market_id', '1u8']);
    });
  });

  describe('parseBetRecord', () => {
    it('should parse bet record data correctly', () => {
      const recordData = {
        owner: 'aleo1test...',
        market_id: 'market_123',
        amount: '1000000u64',
        outcome: '1u8',
        placed_at: '100000u64',
      };

      const bet = client.parseBetRecord(recordData);
      expect(bet.owner).toBe('aleo1test...');
      expect(bet.marketId).toBe('market_123');
      expect(bet.amount).toBe(1000000n);
      expect(bet.outcome).toBe(Outcome.Yes);
    });
  });

  describe('calculateWinnings', () => {
    it('should calculate correct winnings for winning bet', () => {
      const bet = {
        owner: 'aleo1...',
        marketId: 'market_1',
        amount: 1000000n,
        outcome: Outcome.Yes,
        placedAt: 0n,
      };

      const resolution = {
        marketId: 'market_1',
        winningOutcome: Outcome.Yes,
        resolver: 'aleo1...',
        resolvedAt: 1000n,
        totalPayoutPool: 10000000n,
      };

      const pool = {
        marketId: 'market_1',
        totalYesPool: 5000000n,
        totalNoPool: 5000000n,
        totalBets: 10n,
        totalUniqueBettors: 8n,
      };

      const winnings = client.calculateWinnings(bet, resolution, pool);
      // Bet amount / winning pool * payout pool
      // 1000000 / 5000000 * 10000000 = 2000000
      expect(winnings).toBe(2000000n);
    });

    it('should return 0 for losing bet', () => {
      const bet = {
        owner: 'aleo1...',
        marketId: 'market_1',
        amount: 1000000n,
        outcome: Outcome.No,
        placedAt: 0n,
      };

      const resolution = {
        marketId: 'market_1',
        winningOutcome: Outcome.Yes,
        resolver: 'aleo1...',
        resolvedAt: 1000n,
        totalPayoutPool: 10000000n,
      };

      const pool = {
        marketId: 'market_1',
        totalYesPool: 5000000n,
        totalNoPool: 5000000n,
        totalBets: 10n,
        totalUniqueBettors: 8n,
      };

      const winnings = client.calculateWinnings(bet, resolution, pool);
      expect(winnings).toBe(0n);
    });
  });

  describe('getTransactionUrl', () => {
    it('should return correct testnet explorer URL', () => {
      const url = client.getTransactionUrl('tx_123');
      expect(url).toContain('tx_123');
      expect(url).toContain('transaction');
    });
  });

  describe('clearCache', () => {
    it('should clear cached data', () => {
      client.clearCache();
      // No error means success
    });
  });
});
