// ============================================================================
// VEILED MARKETS SDK - Aleo Client
// ============================================================================
// Main client for interacting with the veiled_markets_v4.aleo program
// ============================================================================

import {
  type Market,
  type MarketPool,
  type MarketResolution,
  type MarketWithStats,
  type CreateMarketParams,
  type PlaceBetParams,
  type TransactionResult,
  type VeiledMarketsConfig,
  type Bet,
  type WinningsClaim,
  type RefundClaim,
  type NetworkType,
  MarketStatus,
  Outcome,
  NETWORK_CONFIG,
  PROTOCOL_FEE_BPS,
  CREATOR_FEE_BPS,
  FEE_DENOMINATOR,
} from './types';

import {
  calculateYesProbability,
  calculateNoProbability,
  calculatePotentialPayout,
  hashToField,
  formatTimeRemaining,
} from './utils';

/**
 * Default configuration for testnet
 */
const DEFAULT_CONFIG: VeiledMarketsConfig = {
  network: 'testnet',
  programId: 'veiled_markets_v4.aleo',
};

/**
 * VeiledMarketsClient - Main SDK class for interacting with the protocol
 */
export class VeiledMarketsClient {
  private config: VeiledMarketsConfig;
  private cachedMarkets: Map<string, MarketWithStats> = new Map();
  private currentBlockHeight: bigint = 0n;

  constructor(config: Partial<VeiledMarketsConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get the program ID
   */
  get programId(): string {
    return this.config.programId;
  }

  /**
   * Get the network
   */
  get network(): NetworkType {
    return this.config.network;
  }

  /**
   * Get the RPC URL
   */
  get rpcUrl(): string {
    return this.config.rpcUrl || NETWORK_CONFIG[this.config.network].rpcUrl;
  }

  /**
   * Get the explorer URL
   */
  get explorerUrl(): string {
    return this.config.explorerUrl || NETWORK_CONFIG[this.config.network].explorerUrl;
  }

  // ========================================================================
  // NETWORK QUERIES
  // ========================================================================

  /**
   * Fetch current block height from network
   */
  async getCurrentBlockHeight(): Promise<bigint> {
    try {
      const response = await fetch(`${this.rpcUrl}/latest/height`);
      if (!response.ok) throw new Error('Failed to fetch block height');
      const height = await response.json();
      this.currentBlockHeight = BigInt(height);
      return this.currentBlockHeight;
    } catch (error) {
      console.error('Failed to fetch block height:', error);
      // Return cached or estimate
      return this.currentBlockHeight || BigInt(Math.floor(Date.now() / 15000));
    }
  }

  /**
   * Fetch a mapping value from the program
   */
  async getMappingValue<T>(mappingName: string, key: string): Promise<T | null> {
    try {
      const url = `${this.rpcUrl}/program/${this.programId}/mapping/${mappingName}/${key}`;
      const response = await fetch(url);
      if (!response.ok) return null;
      const value = await response.json();
      return this.parseAleoValue(value) as T;
    } catch (error) {
      console.error(`Failed to fetch mapping ${mappingName}[${key}]:`, error);
      return null;
    }
  }

  // ========================================================================
  // MARKET QUERIES
  // ========================================================================

  /**
   * Fetch a market by ID
   */
  async getMarket(marketId: string): Promise<MarketWithStats | null> {
    try {
      // Check cache first
      const cached = this.cachedMarkets.get(marketId);
      if (cached) return cached;

      // Fetch market data from mappings
      const [marketData, poolData, resolutionData] = await Promise.all([
        this.getMappingValue<Market>('markets', marketId),
        this.getMappingValue<MarketPool>('market_pools', marketId),
        this.getMappingValue<MarketResolution>('market_resolutions', marketId),
      ]);

      if (!marketData || !poolData) return null;

      // Calculate statistics
      const market = this.enrichMarketData(marketData, poolData, resolutionData || undefined);
      this.cachedMarkets.set(marketId, market);
      return market;
    } catch (error) {
      console.error('Failed to fetch market:', error);
      return null;
    }
  }

  /**
   * Enrich market with calculated statistics
   */
  private enrichMarketData(
    market: Market,
    pool: MarketPool,
    resolution?: MarketResolution
  ): MarketWithStats {
    const yesPercentage = calculateYesProbability(pool.totalYesPool, pool.totalNoPool);
    const noPercentage = calculateNoProbability(pool.totalYesPool, pool.totalNoPool);
    const totalVolume = pool.totalYesPool + pool.totalNoPool;

    // Calculate potential payouts (multipliers)
    const yesPayout = totalVolume > 0n && pool.totalYesPool > 0n
      ? Number((totalVolume * (FEE_DENOMINATOR - PROTOCOL_FEE_BPS - CREATOR_FEE_BPS)) / pool.totalYesPool / FEE_DENOMINATOR)
      : 0;
    const noPayout = totalVolume > 0n && pool.totalNoPool > 0n
      ? Number((totalVolume * (FEE_DENOMINATOR - PROTOCOL_FEE_BPS - CREATOR_FEE_BPS)) / pool.totalNoPool / FEE_DENOMINATOR)
      : 0;

    // Calculate time remaining
    const deadline = new Date(Number(market.deadline) * 15000 + Date.now());
    const timeRemaining = formatTimeRemaining(deadline);

    return {
      ...market,
      pool,
      resolution,
      yesPercentage,
      noPercentage,
      totalVolume,
      potentialYesPayout: yesPayout,
      potentialNoPayout: noPayout,
      timeRemaining,
    };
  }

  /**
   * Fetch all active markets (uses mock data for demo)
   */
  async getActiveMarkets(): Promise<MarketWithStats[]> {
    try {
      // In production, this would scan the network or use an indexer
      // For now, return mock data
      return this.getMockMarkets().filter(m => m.status === MarketStatus.Active);
    } catch (error) {
      console.error('Failed to fetch active markets:', error);
      return [];
    }
  }

  /**
   * Fetch markets by category
   */
  async getMarketsByCategory(category: number): Promise<MarketWithStats[]> {
    const markets = await this.getActiveMarkets();
    return markets.filter(m => m.category === category);
  }

  /**
   * Fetch trending markets (by volume)
   */
  async getTrendingMarkets(limit: number = 10): Promise<MarketWithStats[]> {
    const markets = await this.getActiveMarkets();
    return markets
      .sort((a, b) => Number(b.totalVolume - a.totalVolume))
      .slice(0, limit);
  }

  /**
   * Search markets by question text
   */
  async searchMarkets(query: string): Promise<MarketWithStats[]> {
    const markets = await this.getActiveMarkets();
    const lowerQuery = query.toLowerCase();
    return markets.filter(m => 
      m.question?.toLowerCase().includes(lowerQuery)
    );
  }

  // ========================================================================
  // TRANSACTION BUILDERS
  // ========================================================================

  /**
   * Build create_market transaction inputs
   */
  async buildCreateMarketInputs(params: CreateMarketParams): Promise<string[]> {
    const questionHash = await hashToField(params.question);
    const currentBlock = await this.getCurrentBlockHeight();
    
    // Convert dates to block heights (assuming ~15s blocks)
    const deadlineBlocks = BigInt(Math.floor((params.deadline.getTime() - Date.now()) / 15000));
    const resolutionBlocks = BigInt(Math.floor((params.resolutionDeadline.getTime() - Date.now()) / 15000));

    return [
      questionHash,
      `${params.category}u8`,
      `${currentBlock + deadlineBlocks}u64`,
      `${currentBlock + resolutionBlocks}u64`,
    ];
  }

  /**
   * Build place_bet transaction inputs
   */
  buildPlaceBetInputs(params: PlaceBetParams, creditsRecord: string): string[] {
    return [
      params.marketId,
      `${params.amount}u64`,
      `${params.outcome}u8`,
      creditsRecord,
    ];
  }

  /**
   * Build close_market transaction inputs
   */
  buildCloseMarketInputs(marketId: string): string[] {
    return [marketId];
  }

  /**
   * Build resolve_market transaction inputs
   */
  buildResolveMarketInputs(marketId: string, outcome: Outcome): string[] {
    return [marketId, `${outcome}u8`];
  }

  /**
   * Build claim_winnings transaction inputs
   */
  buildClaimWinningsInputs(betRecord: string): string[] {
    return [betRecord];
  }

  /**
   * Build claim_refund transaction inputs
   */
  buildClaimRefundInputs(betRecord: string): string[] {
    return [betRecord];
  }

  // ========================================================================
  // USER DATA (requires wallet integration)
  // ========================================================================

  /**
   * Get user's bet records (requires view key)
   * This would be called with decrypted records from the wallet
   */
  parseBetRecord(recordData: Record<string, unknown>): Bet {
    return {
      owner: recordData.owner as string,
      marketId: recordData.market_id as string,
      amount: BigInt(recordData.amount as string),
      outcome: parseInt(recordData.outcome as string) as Outcome,
      placedAt: BigInt(recordData.placed_at as string),
    };
  }

  /**
   * Parse winnings claim record
   */
  parseWinningsClaimRecord(recordData: Record<string, unknown>): WinningsClaim {
    return {
      owner: recordData.owner as string,
      marketId: recordData.market_id as string,
      betAmount: BigInt(recordData.bet_amount as string),
      winningOutcome: parseInt(recordData.winning_outcome as string) as Outcome,
    };
  }

  /**
   * Calculate user's potential winnings
   */
  calculateWinnings(bet: Bet, resolution: MarketResolution, pool: MarketPool): bigint {
    if (bet.outcome !== resolution.winningOutcome) return 0n;

    const winningPool = bet.outcome === Outcome.Yes 
      ? pool.totalYesPool 
      : pool.totalNoPool;

    if (winningPool === 0n) return 0n;

    // Payout = (bet_amount / winning_pool) * total_payout_pool
    return (bet.amount * resolution.totalPayoutPool) / winningPool;
  }

  // ========================================================================
  // HELPERS
  // ========================================================================

  /**
   * Parse Aleo value format to JavaScript type
   */
  private parseAleoValue(value: string): unknown {
    if (!value) return null;

    // Remove type suffix and parse
    if (value.endsWith('field')) {
      return value;
    }
    if (value.endsWith('u8') || value.endsWith('u16') || value.endsWith('u32')) {
      return parseInt(value);
    }
    if (value.endsWith('u64') || value.endsWith('u128')) {
      return BigInt(value.replace(/u\d+$/, ''));
    }
    if (value.startsWith('aleo1')) {
      return value;
    }
    if (value === 'true') return true;
    if (value === 'false') return false;

    return value;
  }

  /**
   * Get transaction URL on explorer
   */
  getTransactionUrl(transactionId: string): string {
    return `${this.explorerUrl}/transaction/${transactionId}`;
  }

  /**
   * Get address URL on explorer
   */
  getAddressUrl(address: string): string {
    return `${this.explorerUrl}/address/${address}`;
  }

  /**
   * Clear cached data
   */
  clearCache(): void {
    this.cachedMarkets.clear();
  }

  // ========================================================================
  // MOCK DATA (for demo/development)
  // ========================================================================

  /**
   * Get mock markets for demo
   */
  getMockMarkets(): MarketWithStats[] {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;

    const mockData = [
      {
        id: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdefield',
        creator: 'aleo1rhgdu77hgyqd3xjj8ucu3jj9r2krwz6mnzyd80gncr5fxcwlh5rsvzp9px',
        questionHash: 'hash1field',
        question: 'Will Bitcoin reach $150,000 by end of Q1 2026?',
        category: 3,
        deadline: BigInt(Math.floor((now + 30 * day) / 1000)),
        resolutionDeadline: BigInt(Math.floor((now + 35 * day) / 1000)),
        status: MarketStatus.Active,
        createdAt: BigInt(Math.floor((now - 5 * day) / 1000)),
        pool: {
          marketId: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdefield',
          totalYesPool: 125000000000n,
          totalNoPool: 75000000000n,
          totalBets: 342n,
          totalUniqueBettors: 189n,
        },
      },
      {
        id: '2345678901bcdef12345678901bcdef12345678901bcdef12345678901bcdefield',
        creator: 'aleo1rhgdu77hgyqd3xjj8ucu3jj9r2krwz6mnzyd80gncr5fxcwlh5rsvzp9px',
        questionHash: 'hash2field',
        question: 'Will the next US Fed rate decision be a rate cut?',
        category: 6,
        deadline: BigInt(Math.floor((now + 14 * day) / 1000)),
        resolutionDeadline: BigInt(Math.floor((now + 16 * day) / 1000)),
        status: MarketStatus.Active,
        createdAt: BigInt(Math.floor((now - 3 * day) / 1000)),
        pool: {
          marketId: '2345678901bcdef12345678901bcdef12345678901bcdef12345678901bcdefield',
          totalYesPool: 89000000000n,
          totalNoPool: 156000000000n,
          totalBets: 567n,
          totalUniqueBettors: 312n,
        },
      },
      {
        id: '3456789012cdef123456789012cdef123456789012cdef123456789012cdefield',
        creator: 'aleo1rhgdu77hgyqd3xjj8ucu3jj9r2krwz6mnzyd80gncr5fxcwlh5rsvzp9px',
        questionHash: 'hash3field',
        question: 'Will Ethereum ETF see net inflows in February 2026?',
        category: 3,
        deadline: BigInt(Math.floor((now + 7 * day) / 1000)),
        resolutionDeadline: BigInt(Math.floor((now + 10 * day) / 1000)),
        status: MarketStatus.Active,
        createdAt: BigInt(Math.floor((now - 2 * day) / 1000)),
        pool: {
          marketId: '3456789012cdef123456789012cdef123456789012cdef123456789012cdefield',
          totalYesPool: 67000000000n,
          totalNoPool: 45000000000n,
          totalBets: 234n,
          totalUniqueBettors: 156n,
        },
      },
      {
        id: '4567890123def1234567890123def1234567890123def1234567890123defield',
        creator: 'aleo1rhgdu77hgyqd3xjj8ucu3jj9r2krwz6mnzyd80gncr5fxcwlh5rsvzp9px',
        questionHash: 'hash4field',
        question: 'Will Apple announce a new AI product at WWDC 2026?',
        category: 5,
        deadline: BigInt(Math.floor((now + 120 * day) / 1000)),
        resolutionDeadline: BigInt(Math.floor((now + 125 * day) / 1000)),
        status: MarketStatus.Active,
        createdAt: BigInt(Math.floor((now - 1 * day) / 1000)),
        pool: {
          marketId: '4567890123def1234567890123def1234567890123def1234567890123defield',
          totalYesPool: 234000000000n,
          totalNoPool: 89000000000n,
          totalBets: 456n,
          totalUniqueBettors: 278n,
        },
      },
      {
        id: '5678901234ef12345678901234ef12345678901234ef12345678901234efield',
        creator: 'aleo1rhgdu77hgyqd3xjj8ucu3jj9r2krwz6mnzyd80gncr5fxcwlh5rsvzp9px',
        questionHash: 'hash5field',
        question: 'Will Champions League 2026 Final have more than 3 goals?',
        category: 2,
        deadline: BigInt(Math.floor((now + 45 * day) / 1000)),
        resolutionDeadline: BigInt(Math.floor((now + 46 * day) / 1000)),
        status: MarketStatus.Active,
        createdAt: BigInt(Math.floor((now - 10 * day) / 1000)),
        pool: {
          marketId: '5678901234ef12345678901234ef12345678901234ef12345678901234efield',
          totalYesPool: 56000000000n,
          totalNoPool: 78000000000n,
          totalBets: 189n,
          totalUniqueBettors: 134n,
        },
      },
      {
        id: '6789012345f123456789012345f123456789012345f123456789012345field',
        creator: 'aleo1rhgdu77hgyqd3xjj8ucu3jj9r2krwz6mnzyd80gncr5fxcwlh5rsvzp9px',
        questionHash: 'hash6field',
        question: 'Will SpaceX successfully land Starship on Mars by 2030?',
        category: 5,
        deadline: BigInt(Math.floor((now + 180 * day) / 1000)),
        resolutionDeadline: BigInt(Math.floor((now + 185 * day) / 1000)),
        status: MarketStatus.Active,
        createdAt: BigInt(Math.floor((now - 20 * day) / 1000)),
        pool: {
          marketId: '6789012345f123456789012345f123456789012345f123456789012345field',
          totalYesPool: 45000000000n,
          totalNoPool: 155000000000n,
          totalBets: 892n,
          totalUniqueBettors: 567n,
        },
      },
    ];

    // Enrich with stats
    return mockData.map(m => this.enrichMarketData(m as Market, m.pool));
  }
}

/**
 * Create a new client instance
 */
export function createClient(
  config?: Partial<VeiledMarketsConfig>
): VeiledMarketsClient {
  return new VeiledMarketsClient(config);
}
