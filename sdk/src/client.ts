// ============================================================================
// VEILED MARKETS SDK - Aleo Client
// ============================================================================
// Main client for interacting with the veiled_markets_v37.aleo program (and
// USDCX v7 / USAD v14 variants via TokenType)
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
  type BuySharesPrivateUsdcxParams,
  type SellSharesParams,
  type AddLiquidityParams,
  type TransactionResult,
  type VeiledMarketsConfig,
  type OutcomeShare,
  type LPToken,
  type RefundClaim,
  type NetworkType,
  MarketStatus,
  TokenType,
  NETWORK_CONFIG,
  PROGRAM_IDS,
  MARKET_PROGRAM_BY_TOKEN,
  PROTOCOL_FEE_BPS,
  CREATOR_FEE_BPS,
  LP_FEE_BPS,
  FEE_DENOMINATOR,
} from './types';

import {
  hashToField,
  formatTimeRemaining,
} from './utils';
import { calculateContractAllPrices } from './contract-math';
import type { IndexerClient, MarketRegistryRow } from './indexer';

/**
 * Default configuration for testnet
 */
const DEFAULT_CONFIG: VeiledMarketsConfig = {
  network: 'testnet',
  programId: PROGRAM_IDS.ALEO_MARKET,
};

/**
 * Resolve the deployed market program ID for a given token type.
 * Useful when the same client instance needs to query different token markets.
 */
export function getMarketProgramId(tokenType: TokenType): string {
  const programId = MARKET_PROGRAM_BY_TOKEN[tokenType];
  if (!programId) throw new Error(`Unknown TokenType: ${tokenType}`);
  return programId;
}

/**
 * Self-describing transaction call: caller has everything needed to execute.
 */
export interface MarketCall {
  programId: string;
  functionName: string;
  inputs: string[];
}

// ----------------------------------------------------------------------------
// Per-token function name tables (verified against deployed contracts)
//   v37 (ALEO):  create_market, buy_shares_private, sell_shares, add_liquidity,
//                redeem_shares, claim_refund, withdraw_creator_fees, dispute_resolution
//   v7 (USDCX):  create_market_usdcx, buy_shares_usdcx, sell_shares_usdcx,
//                add_liquidity_usdcx, redeem_shares_usdcx, claim_refund_usdcx,
//                withdraw_fees_usdcx, dispute_resolution
//   v14 (USAD):  create_market_usad, buy_shares_usad, sell_shares_usad,
//                add_liquidity_usad, redeem_shares_usad, claim_refund_usad,
//                withdraw_fees_usad, dispute_resolution
// Note: dispute_resolution, vote_outcome, finalize_votes, confirm_resolution,
//       close_market, cancel_market are SHARED names (no token suffix).
// ----------------------------------------------------------------------------

const FN_NAMES: Record<TokenType, {
  createMarket: string;
  buyShares: string;
  sellShares: string;
  addLiquidity: string;
  redeemShares: string;
  claimRefund: string;
  withdrawFees: string;
}> = {
  [TokenType.ALEO]: {
    createMarket: 'create_market',
    buyShares: 'buy_shares_private',
    sellShares: 'sell_shares',
    addLiquidity: 'add_liquidity',
    redeemShares: 'redeem_shares',
    claimRefund: 'claim_refund',
    withdrawFees: 'withdraw_creator_fees',
  },
  [TokenType.USDCX]: {
    createMarket: 'create_market_usdcx',
    buyShares: 'buy_shares_usdcx',
    sellShares: 'sell_shares_usdcx',
    addLiquidity: 'add_liquidity_usdcx',
    redeemShares: 'redeem_shares_usdcx',
    claimRefund: 'claim_refund_usdcx',
    withdrawFees: 'withdraw_fees_usdcx',
  },
  [TokenType.USAD]: {
    createMarket: 'create_market_usad',
    buyShares: 'buy_shares_usad',
    sellShares: 'sell_shares_usad',
    addLiquidity: 'add_liquidity_usad',
    redeemShares: 'redeem_shares_usad',
    claimRefund: 'claim_refund_usad',
    withdrawFees: 'withdraw_fees_usad',
  },
};

/**
 * VeiledMarketsClient - Main SDK class for interacting with the protocol
 */
export class VeiledMarketsClient {
  private config: VeiledMarketsConfig;
  private cachedMarkets: Map<string, MarketWithStats> = new Map();
  private currentBlockHeight: bigint = 0n;
  private indexer: IndexerClient | null = null;

  constructor(config: Partial<VeiledMarketsConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Attach a Supabase indexer for `getActiveMarkets()` / `searchMarkets()` /
   * `getMarketsByCategory()` / `getTrendingMarkets()`. Without an indexer
   * those methods return empty arrays since the Aleo RPC doesn't support
   * mapping enumeration — `market_registry` in Supabase is the only
   * authoritative source of "all markets" data.
   *
   * Import `createIndexerClient` from the SDK and pass the resulting
   * instance here:
   *
   *   import { createClient, createIndexerClient } from '@veiled-markets/sdk'
   *   const client = createClient()
   *   client.setIndexer(createIndexerClient({
   *     supabaseUrl: process.env.SUPABASE_URL!,
   *     supabaseKey: process.env.SUPABASE_ANON_KEY!,
   *   }))
   */
  setIndexer(indexer: IndexerClient): void {
    this.indexer = indexer;
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
    const prices = calculateContractAllPrices({
      reserve1: pool.reserve1,
      reserve2: pool.reserve2,
      reserve3: pool.reserve3,
      reserve4: pool.reserve4,
      numOutcomes,
    });

    // In FPMM AMM, winning shares redeem 1:1, so payout = 1/price
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

  /**
   * Fetch all markets from the indexer and enrich each with live on-chain
   * pool state. Requires `setIndexer(...)` to have been called — otherwise
   * returns an empty array.
   *
   * This makes one indexer query (cheap) followed by one RPC query per
   * market (for the pool). For large catalogs you may want to use the
   * indexer directly and only fetch pools on demand.
   */
  async getActiveMarkets(limit: number = 50): Promise<MarketWithStats[]> {
    if (!this.indexer) return [];
    const rows = await this.indexer.listMarkets({ limit });
    return this.enrichRegistryRows(rows);
  }

  async getMarketsByCategory(category: number, limit: number = 50): Promise<MarketWithStats[]> {
    if (!this.indexer) return [];
    const rows = await this.indexer.listMarkets({ category: category as never, limit });
    return this.enrichRegistryRows(rows);
  }

  /**
   * Get top markets by on-chain volume. Pulls a wider indexer window
   * (3× limit) then sorts by pool.totalVolume after enrichment.
   */
  async getTrendingMarkets(limit: number = 10): Promise<MarketWithStats[]> {
    if (!this.indexer) return [];
    const rows = await this.indexer.listMarkets({ limit: limit * 3 });
    const enriched = await this.enrichRegistryRows(rows);
    return enriched
      .sort((a, b) => Number(b.totalVolume - a.totalVolume))
      .slice(0, limit);
  }

  /**
   * Full-text search over market question text (case-insensitive). Uses
   * PostgREST `ilike` on the indexer, NOT client-side filtering, so it
   * scales to large catalogs.
   */
  async searchMarkets(query: string, limit: number = 50): Promise<MarketWithStats[]> {
    if (!this.indexer) return [];
    const rows = await this.indexer.listMarkets({ query, limit });
    return this.enrichRegistryRows(rows);
  }

  /**
   * Convert indexer rows to MarketWithStats by fetching live pool state
   * for each. Rows without a matching on-chain pool are dropped (market
   * was deleted or never finalized on-chain).
   */
  private async enrichRegistryRows(rows: MarketRegistryRow[]): Promise<MarketWithStats[]> {
    const results = await Promise.all(
      rows.map(async (row) => {
        const market = await this.getMarket(row.marketId);
        if (!market) return null;
        // Merge question text and off-chain metadata from indexer
        const enriched: MarketWithStats = {
          ...market,
          question: row.questionText ?? market.question,
        };
        return enriched;
      }),
    );
    return results.filter((m): m is MarketWithStats => m !== null);
  }

  // ========================================================================
  // TRANSACTION BUILDERS
  // ========================================================================

  async buildCreateMarketInputs(params: CreateMarketParams): Promise<MarketCall> {
    const questionHash = await hashToField(params.question);
    const currentBlock = await this.getCurrentBlockHeight();

    const deadlineBlocks = BigInt(Math.floor((params.deadline.getTime() - Date.now()) / 15000));
    const resolutionBlocks = BigInt(Math.floor((params.resolutionDeadline.getTime() - Date.now()) / 15000));
    const tokenType = params.tokenType ?? TokenType.ALEO;

    // Contract signature (all 3 token variants):
    //   create_market[_token](question_hash, category, num_outcomes,
    //                          deadline, resolution_deadline, resolver,
    //                          creator_owner, initial_liquidity)
    return {
      programId: getMarketProgramId(tokenType),
      functionName: FN_NAMES[tokenType].createMarket,
      inputs: [
        questionHash,
        `${params.category}u8`,
        `${params.numOutcomes}u8`,
        `${currentBlock + deadlineBlocks}u64`,
        `${currentBlock + resolutionBlocks}u64`,
        params.resolver || 'self.caller',
        params.creatorOwner || 'self.caller',
        `${params.initialLiquidity}u128`,
      ],
    };
  }

  /**
   * Build inputs for buy_shares_* (private path).
   *
   * Contract signature (all 3 variants take expected_shares + share_nonce):
   *   buy_shares_*(market_id, outcome, amount_in, expected_shares,
   *                min_shares_out, share_nonce, <token_record>, [<merkle_proofs>])
   *
   * The token record (and MerkleProofs for USDCX/USAD) are appended by the
   * wallet layer at signing time, since they require live record scanning.
   * This builder returns only the public/computed inputs.
   */
  buildBuySharesInputs(
    params: BuySharesParams,
    tokenType: TokenType = TokenType.ALEO,
  ): MarketCall {
    const shareNonce = params.shareNonce
      ?? `${BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER))}field`;

    return {
      programId: getMarketProgramId(tokenType),
      functionName: FN_NAMES[tokenType].buyShares,
      inputs: [
        params.marketId,
        `${params.outcome}u8`,
        `${params.amountIn}u128`,
        `${params.expectedShares ?? 0n}u128`,
        `${params.minSharesOut ?? 0n}u128`,
        shareNonce,
      ],
    };
  }

  /**
   * Build inputs for sell_shares_*.
   * Contract takes the OutcomeShare record + fee snapshot (3 bps params).
   * The share record is appended by the wallet at signing time.
   */
  buildSellSharesInputs(
    params: SellSharesParams,
    tokenType: TokenType = TokenType.ALEO,
  ): MarketCall {
    return {
      programId: getMarketProgramId(tokenType),
      functionName: FN_NAMES[tokenType].sellShares,
      inputs: [
        `${params.tokensDesired ?? params.sharesToSell}u128`,
        `${params.maxSharesUsed ?? params.sharesToSell}u128`,
        `${params.protocolFeeBps ?? PROTOCOL_FEE_BPS}u128`,
        `${params.creatorFeeBps ?? CREATOR_FEE_BPS}u128`,
        `${params.lpFeeBps ?? LP_FEE_BPS}u128`,
      ],
    };
  }

  /**
   * Build inputs for add_liquidity_*.
   * Contract signature (all variants):
   *   add_liquidity[_token](market_id, amount, expected_lp_shares, lp_nonce, <token_in>)
   */
  buildAddLiquidityInputs(
    params: AddLiquidityParams,
    tokenType: TokenType = TokenType.ALEO,
  ): MarketCall {
    const lpNonce = params.lpNonce
      ?? `${BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER))}field`;
    return {
      programId: getMarketProgramId(tokenType),
      functionName: FN_NAMES[tokenType].addLiquidity,
      inputs: [
        params.marketId,
        `${params.amount}u128`,
        `${params.expectedLpShares ?? 0n}u128`,
        lpNonce,
      ],
    };
  }

  // buildRemoveLiquidityInputs removed in v17 — LP locked until finalize/cancel

  buildCloseMarketInputs(marketId: string, tokenType: TokenType = TokenType.ALEO): MarketCall {
    return {
      programId: getMarketProgramId(tokenType),
      functionName: 'close_market',
      inputs: [marketId],
    };
  }

  /** vote_outcome on the market contract. */
  buildResolveMarketInputs(
    marketId: string,
    outcome: number,
    tokenType: TokenType = TokenType.ALEO,
  ): MarketCall {
    return {
      programId: getMarketProgramId(tokenType),
      functionName: 'vote_outcome',
      inputs: [marketId, `${outcome}u8`],
    };
  }

  buildFinalizeResolutionInputs(
    marketId: string,
    tokenType: TokenType = TokenType.ALEO,
  ): MarketCall {
    return {
      programId: getMarketProgramId(tokenType),
      functionName: 'finalize_votes',
      inputs: [marketId],
    };
  }

  /** dispute_resolution — same name across all 3 token contracts. */
  buildDisputeResolutionInputs(
    marketId: string,
    proposedOutcome: number,
    tokenType: TokenType = TokenType.ALEO,
  ): MarketCall {
    return {
      programId: getMarketProgramId(tokenType),
      functionName: 'dispute_resolution',
      inputs: [marketId, `${proposedOutcome}u8`],
    };
  }

  buildRedeemSharesInputs(
    shareRecord: string,
    tokenType: TokenType = TokenType.ALEO,
  ): MarketCall {
    return {
      programId: getMarketProgramId(tokenType),
      functionName: FN_NAMES[tokenType].redeemShares,
      inputs: [shareRecord],
    };
  }

  buildClaimRefundInputs(
    shareRecord: string,
    tokenType: TokenType = TokenType.ALEO,
  ): MarketCall {
    return {
      programId: getMarketProgramId(tokenType),
      functionName: FN_NAMES[tokenType].claimRefund,
      inputs: [shareRecord],
    };
  }

  buildWithdrawCreatorFeesInputs(
    marketId: string,
    tokenType: TokenType = TokenType.ALEO,
  ): MarketCall {
    return {
      programId: getMarketProgramId(tokenType),
      functionName: FN_NAMES[tokenType].withdrawFees,
      inputs: [marketId],
    };
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
   * Calculate payout for winning shares (1:1 redemption)
   */
  calculateWinnings(share: OutcomeShare, resolution: MarketResolution): bigint {
    if (share.outcome !== resolution.winningOutcome) return 0n;
    return share.quantity; // 1:1 redemption
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
