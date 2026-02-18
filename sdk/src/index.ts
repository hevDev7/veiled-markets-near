// ============================================================================
// VEILED MARKETS SDK - Main Entry Point (v12)
// ============================================================================
// TypeScript SDK for interacting with the veiled_markets_v13.aleo program
// AMM-based multi-outcome prediction markets
// ============================================================================

// Client
export { VeiledMarketsClient, createClient } from './client';

// Types - Enums
export {
  MarketStatus,
  Outcome,
  TokenType,
  MarketCategory,
} from './types';

// Types - Interfaces
export type {
  Market,
  AMMPool,
  MarketPool,
  MarketResolution,
  MarketFees,
  DisputeData,
  OutcomeShare,
  LPToken,
  DisputeBondReceipt,
  RefundClaim,
  MarketWithStats,
  CreateMarketParams,
  BuySharesParams,
  PlaceBetParams,
  SellSharesParams,
  AddLiquidityParams,
  RemoveLiquidityParams,
  TransactionResult,
  WalletState,
  WalletAdapter,
  WalletConnectionResult,
  TransactionRequestParams,
  VeiledMarketsConfig,
  NetworkType,
  // Legacy
  Bet,
  WinningsClaim,
} from './types';

// Types - Constants
export {
  PROTOCOL_FEE_BPS,
  CREATOR_FEE_BPS,
  LP_FEE_BPS,
  TOTAL_FEE_BPS,
  FEE_DENOMINATOR,
  MIN_TRADE_AMOUNT,
  MIN_BET_AMOUNT,
  MIN_DISPUTE_BOND,
  CHALLENGE_WINDOW_BLOCKS,
  NETWORK_CONFIG,
} from './types';

// Utilities - AMM Calculations
export {
  calculateOutcomePrice,
  calculateAllPrices,
  calculateTradeFees,
  calculateBuySharesOut,
  calculateSellTokensOut,
  calculateLPSharesOut,
  calculateLPTokensOut,
  calculateMinSharesOut,
} from './utils';

// Utilities - Legacy
export {
  calculateYesProbability,
  calculateNoProbability,
  calculatePotentialPayout,
} from './utils';

// Utilities - Formatting & Validation
export {
  formatCredits,
  parseCredits,
  formatPercentage,
  formatTimeRemaining,
  getStatusDisplay,
  getStatusColor,
  shortenAddress,
  isValidAleoAddress,
  hashToField,
  blockHeightToTime,
  generateMarketIdPreview,
  validateTradeAmount,
  validateBetAmount,
  validateMarketDeadline,
  validateResolutionDeadline,
  validateMarketQuestion,
  validateNumOutcomes,
} from './utils';
