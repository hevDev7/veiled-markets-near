// ============================================================================
// VEILED MARKETS SDK - Aleo Client (v12)
// ============================================================================
// Main client for interacting with the veiled_markets_v13.aleo program
// AMM-based multi-outcome prediction markets
// ============================================================================

import {
  type Market,
  type AMMPool,
  type MarketResolution,
  type MarketFees,
  type DisputeData,
  type MarketWithStats,
  type CreateMarketParams,
  type BuySharesParams,
  type SellSharesParams,
  type AddLiquidityParams,
  type RemoveLiquidityParams,
  type TransactionResult,
  type VeiledMarketsConfig,
  type OutcomeShare,
  type LPToken,
  type RefundClaim,
  type NetworkType,
  MarketStatus,
  TokenType,
  NETWORK_CONFIG,
  PROTOCOL_FEE_BPS,
  CREATOR_FEE_BPS,
  LP_FEE_BPS,
  FEE_DENOMINATOR,
} from './types';

import {
  calculateOutcomePrice,
  calculateAllPrices,
  hashToField,
  formatTimeRemaining,
} from './utils';

/**
 * Default configuration for testnet
 */
const DEFAULT_CONFIG: VeiledMarketsConfig = {
  network: 'testnet',
  programId: 'veiled_markets_v13.aleo',
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

  get programId(): string {
    return this.config.programId;
  }

  get network(): NetworkType {
    return this.config.network;
  }

  get rpcUrl(): string {
    return this.config.rpcUrl || NETWORK_CONFIG[this.config.network].rpcUrl;
  }

  get explorerUrl(): string {
    return this.config.explorerUrl || NETWORK_CONFIG[this.config.network].explorerUrl;
  }

  // ========================================================================
  // NETWORK QUERIES
  // ========================================================================

  async getCurrentBlockHeight(): Promise<bigint> {
    try {
      const response = await fetch(`${this.rpcUrl}/latest/height`);
      if (!response.ok) throw new Error('Failed to fetch block height');
      const height = await response.json();
      this.currentBlockHeight = BigInt(height);
      return this.currentBlockHeight;
    } catch (error) {
      console.error('Failed to fetch block height:', error);
      return this.currentBlockHeight || BigInt(Math.floor(Date.now() / 15000));
    }
  }

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

  async getMarket(marketId: string): Promise<MarketWithStats | null> {
    try {
      const cached = this.cachedMarkets.get(marketId);
      if (cached) return cached;

      const [marketData, poolData, resolutionData, feesData] = await Promise.all([
        this.getMappingValue<Market>('markets', marketId),
        this.getMappingValue<AMMPool>('amm_pools', marketId),
        this.getMappingValue<MarketResolution>('market_resolutions', marketId),
        this.getMappingValue<MarketFees>('market_fees', marketId),
      ]);

      if (!marketData || !poolData) return null;

      const market = this.enrichMarketData(
        marketData,
        poolData,
        resolutionData || undefined,
        feesData || undefined,
      );
      this.cachedMarkets.set(marketId, market);
      return market;
    } catch (error) {
      console.error('Failed to fetch market:', error);
      return null;
    }
  }

  async getAMMPool(marketId: string): Promise<AMMPool | null> {
    return this.getMappingValue<AMMPool>('amm_pools', marketId);
  }

  async getMarketFees(marketId: string): Promise<MarketFees | null> {
    return this.getMappingValue<MarketFees>('market_fees', marketId);
  }

  async getMarketDispute(marketId: string): Promise<DisputeData | null> {
    return this.getMappingValue<DisputeData>('market_disputes', marketId);
  }

  private enrichMarketData(
    market: Market,
    pool: AMMPool,
    resolution?: MarketResolution,
    fees?: MarketFees,
  ): MarketWithStats {
    const numOutcomes = market.numOutcomes || 2;
    const prices = calculateAllPrices(
      pool.reserve1,
      pool.reserve2,
      pool.reserve3,
      pool.reserve4,
      numOutcomes,
    );

    // In v12 AMM, winning shares redeem 1:1, so payout = 1/price
    const potentialPayouts = prices.map(p => p > 0 ? 1 / p : 0);

    const deadline = new Date(Number(market.deadline) * 15000 + Date.now());
    const timeRemaining = formatTimeRemaining(deadline);

    return {
      ...market,
      pool,
      resolution,
      fees,
      prices,
      totalVolume: pool.totalVolume,
      totalLiquidity: pool.totalLiquidity,
      potentialPayouts,
      yesPercentage: prices[0] * 100,
      noPercentage: (prices[1] ?? 0) * 100,
      potentialYesPayout: potentialPayouts[0],
      potentialNoPayout: potentialPayouts[1] ?? 0,
      timeRemaining,
    };
  }

  async getActiveMarkets(): Promise<MarketWithStats[]> {
    // In production, this would use an indexer
    return [];
  }

  async getMarketsByCategory(category: number): Promise<MarketWithStats[]> {
    const markets = await this.getActiveMarkets();
    return markets.filter(m => m.category === category);
  }

  async getTrendingMarkets(limit: number = 10): Promise<MarketWithStats[]> {
    const markets = await this.getActiveMarkets();
    return markets
      .sort((a, b) => Number(b.totalVolume - a.totalVolume))
      .slice(0, limit);
  }

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

  async buildCreateMarketInputs(params: CreateMarketParams): Promise<{
    functionName: string;
    inputs: string[];
  }> {
    const questionHash = await hashToField(params.question);
    const currentBlock = await this.getCurrentBlockHeight();

    const deadlineBlocks = BigInt(Math.floor((params.deadline.getTime() - Date.now()) / 15000));
    const resolutionBlocks = BigInt(Math.floor((params.resolutionDeadline.getTime() - Date.now()) / 15000));
    const tokenType = params.tokenType ?? TokenType.ALEO;

    const functionName = tokenType === TokenType.USDCX ? 'create_market_usdcx' : 'create_market';

    return {
      functionName,
      inputs: [
        questionHash,
        `${params.category}u8`,
        `${params.numOutcomes}u8`,
        `${currentBlock + deadlineBlocks}u64`,
        `${currentBlock + resolutionBlocks}u64`,
        params.resolver || 'self.caller',
        `${tokenType}u8`,
        `${params.initialLiquidity}u128`,
      ],
    };
  }

  buildBuySharesInputs(params: BuySharesParams, tokenType: TokenType = TokenType.ALEO): {
    functionName: string;
    inputs: string[];
  } {
    const functionName = tokenType === TokenType.USDCX
      ? 'buy_shares_public_usdcx'
      : 'buy_shares_public';

    const nonce = `${BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER))}field`;

    return {
      functionName,
      inputs: [
        params.marketId,
        `${params.outcome}u8`,
        `${params.amountIn}u128`,
        `${params.minSharesOut ?? 0n}u128`,
        nonce,
      ],
    };
  }

  buildSellSharesInputs(params: SellSharesParams, tokenType: TokenType = TokenType.ALEO): {
    functionName: string;
    inputs: string[];
  } {
    const functionName = tokenType === TokenType.USDCX
      ? 'sell_shares_usdcx'
      : 'sell_shares';

    return {
      functionName,
      inputs: [
        params.shareRecord,
        `${params.sharesToSell}u128`,
        `${params.minTokensOut ?? 0n}u128`,
      ],
    };
  }

  buildAddLiquidityInputs(params: AddLiquidityParams, tokenType: TokenType = TokenType.ALEO): {
    functionName: string;
    inputs: string[];
  } {
    const functionName = tokenType === TokenType.USDCX
      ? 'add_liquidity_usdcx'
      : 'add_liquidity';

    return {
      functionName,
      inputs: [
        params.marketId,
        `${params.amount}u128`,
      ],
    };
  }

  buildRemoveLiquidityInputs(params: RemoveLiquidityParams, tokenType: TokenType = TokenType.ALEO): {
    functionName: string;
    inputs: string[];
  } {
    const functionName = tokenType === TokenType.USDCX
      ? 'remove_liquidity_usdcx'
      : 'remove_liquidity';

    return {
      functionName,
      inputs: [
        params.lpTokenRecord,
        `${params.sharesToRemove}u128`,
      ],
    };
  }

  buildCloseMarketInputs(marketId: string): string[] {
    return [marketId];
  }

  buildResolveMarketInputs(marketId: string, outcome: number): string[] {
    return [marketId, `${outcome}u8`];
  }

  buildFinalizeResolutionInputs(marketId: string): string[] {
    return [marketId];
  }

  buildDisputeResolutionInputs(
    marketId: string,
    proposedOutcome: number,
    tokenType: TokenType = TokenType.ALEO,
  ): { functionName: string; inputs: string[] } {
    const functionName = tokenType === TokenType.USDCX
      ? 'dispute_resolution_usdcx'
      : 'dispute_resolution';
    return {
      functionName,
      inputs: [marketId, `${proposedOutcome}u8`],
    };
  }

  buildRedeemSharesInputs(shareRecord: string, tokenType: TokenType = TokenType.ALEO): {
    functionName: string;
    inputs: string[];
  } {
    const functionName = tokenType === TokenType.USDCX
      ? 'redeem_shares_usdcx'
      : 'redeem_shares';
    return { functionName, inputs: [shareRecord] };
  }

  buildClaimRefundInputs(shareRecord: string, tokenType: TokenType = TokenType.ALEO): {
    functionName: string;
    inputs: string[];
  } {
    const functionName = tokenType === TokenType.USDCX
      ? 'claim_refund_usdcx'
      : 'claim_refund';
    return { functionName, inputs: [shareRecord] };
  }

  buildWithdrawCreatorFeesInputs(marketId: string, tokenType: TokenType = TokenType.ALEO): {
    functionName: string;
    inputs: string[];
  } {
    const functionName = tokenType === TokenType.USDCX
      ? 'withdraw_creator_fees_usdcx'
      : 'withdraw_creator_fees';
    return { functionName, inputs: [marketId] };
  }

  // Legacy aliases
  buildPlaceBetInputs(params: BuySharesParams, creditsRecord: string): string[] {
    return [
      params.marketId,
      `${params.amountIn}u128`,
      `${params.outcome}u8`,
      creditsRecord,
    ];
  }

  buildClaimWinningsInputs(shareRecord: string): string[] {
    return [shareRecord];
  }

  // ========================================================================
  // RECORD PARSERS
  // ========================================================================

  parseOutcomeShareRecord(recordData: Record<string, unknown>): OutcomeShare {
    return {
      owner: recordData.owner as string,
      marketId: recordData.market_id as string,
      outcome: parseInt(recordData.outcome as string),
      quantity: BigInt((recordData.quantity as string).replace(/u\d+$/, '')),
      shareNonce: recordData.share_nonce as string,
      tokenType: parseInt(recordData.token_type as string) as TokenType,
    };
  }

  parseLPTokenRecord(recordData: Record<string, unknown>): LPToken {
    return {
      owner: recordData.owner as string,
      marketId: recordData.market_id as string,
      lpShares: BigInt((recordData.lp_shares as string).replace(/u\d+$/, '')),
      lpNonce: recordData.lp_nonce as string,
      tokenType: parseInt(recordData.token_type as string) as TokenType,
    };
  }

  /**
   * Calculate payout for winning shares (v12: 1:1 redemption)
   */
  calculateWinnings(share: OutcomeShare, resolution: MarketResolution): bigint {
    if (share.outcome !== resolution.winningOutcome) return 0n;
    return share.quantity; // 1:1 redemption in v12
  }

  // ========================================================================
  // HELPERS
  // ========================================================================

  private parseAleoValue(value: string): unknown {
    if (!value) return null;

    if (value.endsWith('field')) return value;
    if (value.endsWith('u8') || value.endsWith('u16') || value.endsWith('u32')) {
      return parseInt(value);
    }
    if (value.endsWith('u64') || value.endsWith('u128')) {
      return BigInt(value.replace(/u\d+$/, ''));
    }
    if (value.startsWith('aleo1')) return value;
    if (value === 'true') return true;
    if (value === 'false') return false;

    return value;
  }

  getTransactionUrl(transactionId: string): string {
    return `${this.explorerUrl}/transaction/${transactionId}`;
  }

  getAddressUrl(address: string): string {
    return `${this.explorerUrl}/address/${address}`;
  }

  clearCache(): void {
    this.cachedMarkets.clear();
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
