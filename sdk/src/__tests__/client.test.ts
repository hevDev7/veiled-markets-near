// ============================================================================
// VEILED MARKETS SDK - Client Tests (v12)
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VeiledMarketsClient, createClient } from '../client';
import { MarketStatus, Outcome, TokenType } from '../types';

// Mock fetch for API calls
global.fetch = vi.fn();

describe('VeiledMarketsClient', () => {
  let client: VeiledMarketsClient;

  beforeEach(() => {
    client = createClient({
      network: 'testnet',
      programId: 'veiled_markets_v13.aleo',
    });
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create client with default config', () => {
      const defaultClient = createClient();
      expect(defaultClient.programId).toBe('veiled_markets_v13.aleo');
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

  describe('getActiveMarkets', () => {
    it('should return array (empty without indexer)', async () => {
      const markets = await client.getActiveMarkets();
      expect(Array.isArray(markets)).toBe(true);
    });
  });

  describe('getTrendingMarkets', () => {
    it('should respect limit parameter', async () => {
      const markets = await client.getTrendingMarkets(3);
      expect(markets.length).toBeLessThanOrEqual(3);
    });
  });

  describe('searchMarkets', () => {
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

      const result = await client.buildCreateMarketInputs({
        question: 'Will BTC reach $200k?',
        category: 3,
        numOutcomes: 2,
        deadline: new Date(Date.now() + 86400000),
        resolutionDeadline: new Date(Date.now() + 172800000),
        initialLiquidity: 10000000n,
      });

      expect(result.functionName).toBe('create_market');
      expect(result.inputs.length).toBe(8);
      expect(result.inputs[1]).toBe('3u8'); // category
      expect(result.inputs[2]).toBe('2u8'); // numOutcomes
      expect(result.inputs[7]).toBe('10000000u128'); // initialLiquidity
    });

    it('should use USDCX function name for USDCX markets', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => 100000,
      });

      const result = await client.buildCreateMarketInputs({
        question: 'Test USDCX market?',
        category: 1,
        numOutcomes: 2,
        deadline: new Date(Date.now() + 86400000),
        resolutionDeadline: new Date(Date.now() + 172800000),
        tokenType: TokenType.USDCX,
        initialLiquidity: 5000000n,
      });

      expect(result.functionName).toBe('create_market_usdcx');
    });
  });

  describe('buildBuySharesInputs', () => {
    it('should build valid buy shares inputs', () => {
      const result = client.buildBuySharesInputs({
        marketId: 'test_market_id',
        amountIn: 1000000n,
        outcome: Outcome.Yes,
      });

      expect(result.functionName).toBe('buy_shares_public');
      expect(result.inputs.length).toBe(5);
      expect(result.inputs[0]).toBe('test_market_id');
      expect(result.inputs[1]).toBe('1u8'); // outcome
      expect(result.inputs[2]).toBe('1000000u128'); // amountIn
    });

    it('should use USDCX function name for USDCX token', () => {
      const result = client.buildBuySharesInputs(
        { marketId: 'id', amountIn: 1000n, outcome: Outcome.Yes },
        TokenType.USDCX,
      );
      expect(result.functionName).toBe('buy_shares_public_usdcx');
    });

    it('should use correct multi-outcome values', () => {
      const result = client.buildBuySharesInputs({
        marketId: 'id',
        amountIn: 1000n,
        outcome: Outcome.Three,
      });
      expect(result.inputs[1]).toBe('3u8');
    });
  });

  describe('buildSellSharesInputs', () => {
    it('should build valid sell shares inputs', () => {
      const result = client.buildSellSharesInputs({
        shareRecord: 'encrypted_record_data',
        sharesToSell: 500000n,
      });

      expect(result.functionName).toBe('sell_shares');
      expect(result.inputs.length).toBe(3);
      expect(result.inputs[0]).toBe('encrypted_record_data');
      expect(result.inputs[1]).toBe('500000u128');
    });
  });

  describe('buildAddLiquidityInputs', () => {
    it('should build valid add liquidity inputs', () => {
      const result = client.buildAddLiquidityInputs({
        marketId: 'market_123',
        amount: 5000000n,
      });

      expect(result.functionName).toBe('add_liquidity');
      expect(result.inputs).toEqual(['market_123', '5000000u128']);
    });
  });

  describe('buildRemoveLiquidityInputs', () => {
    it('should build valid remove liquidity inputs', () => {
      const result = client.buildRemoveLiquidityInputs({
        lpTokenRecord: 'lp_record_data',
        sharesToRemove: 2000000n,
      });

      expect(result.functionName).toBe('remove_liquidity');
      expect(result.inputs).toEqual(['lp_record_data', '2000000u128']);
    });
  });

  describe('buildResolveMarketInputs', () => {
    it('should build valid resolve market inputs', () => {
      const inputs = client.buildResolveMarketInputs('market_id', Outcome.Yes);
      expect(inputs).toEqual(['market_id', '1u8']);
    });
  });

  describe('buildDisputeResolutionInputs', () => {
    it('should build valid dispute inputs', () => {
      const result = client.buildDisputeResolutionInputs('market_id', 2);
      expect(result.functionName).toBe('dispute_resolution');
      expect(result.inputs).toEqual(['market_id', '2u8']);
    });
  });

  describe('buildRedeemSharesInputs', () => {
    it('should build valid redeem inputs', () => {
      const result = client.buildRedeemSharesInputs('share_record');
      expect(result.functionName).toBe('redeem_shares');
      expect(result.inputs).toEqual(['share_record']);
    });
  });

  describe('parseOutcomeShareRecord', () => {
    it('should parse outcome share record correctly', () => {
      const recordData = {
        owner: 'aleo1test123456789',
        market_id: 'market_123field',
        outcome: '1u8',
        quantity: '1000000u128',
        share_nonce: 'nonce123field',
        token_type: '1u8',
      };

      const share = client.parseOutcomeShareRecord(recordData);
      expect(share.owner).toBe('aleo1test123456789');
      expect(share.marketId).toBe('market_123field');
      expect(share.outcome).toBe(1);
      expect(share.quantity).toBe(1000000n);
      expect(share.tokenType).toBe(TokenType.ALEO);
    });
  });

  describe('parseLPTokenRecord', () => {
    it('should parse LP token record correctly', () => {
      const recordData = {
        owner: 'aleo1test123456789',
        market_id: 'market_123field',
        lp_shares: '5000000u128',
        lp_nonce: 'nonce456field',
        token_type: '2u8',
      };

      const lp = client.parseLPTokenRecord(recordData);
      expect(lp.owner).toBe('aleo1test123456789');
      expect(lp.lpShares).toBe(5000000n);
      expect(lp.tokenType).toBe(TokenType.USDCX);
    });
  });

  describe('calculateWinnings', () => {
    it('should return quantity for winning shares (1:1 redemption)', () => {
      const share = {
        owner: 'aleo1...',
        marketId: 'market_1',
        outcome: 1,
        quantity: 1000000n,
        shareNonce: 'nonce',
        tokenType: TokenType.ALEO,
      };

      const resolution = {
        marketId: 'market_1',
        winningOutcome: 1,
        resolver: 'aleo1...',
        resolvedAt: 1000n,
        challengeDeadline: 3880n,
        finalized: true,
      };

      const winnings = client.calculateWinnings(share, resolution);
      expect(winnings).toBe(1000000n); // 1:1 redemption
    });

    it('should return 0 for losing shares', () => {
      const share = {
        owner: 'aleo1...',
        marketId: 'market_1',
        outcome: 2,
        quantity: 1000000n,
        shareNonce: 'nonce',
        tokenType: TokenType.ALEO,
      };

      const resolution = {
        marketId: 'market_1',
        winningOutcome: 1,
        resolver: 'aleo1...',
        resolvedAt: 1000n,
        challengeDeadline: 3880n,
        finalized: true,
      };

      const winnings = client.calculateWinnings(share, resolution);
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

  describe('legacy aliases', () => {
    it('buildPlaceBetInputs should still work', () => {
      const inputs = client.buildPlaceBetInputs(
        { marketId: 'test_id', amountIn: 1000000n, outcome: 1 },
        'mock_credits_record',
      );
      expect(inputs.length).toBe(4);
      expect(inputs[0]).toBe('test_id');
    });

    it('buildClaimWinningsInputs should still work', () => {
      const inputs = client.buildClaimWinningsInputs('share_record');
      expect(inputs).toEqual(['share_record']);
    });
  });
});
