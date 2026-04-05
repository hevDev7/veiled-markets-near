// ============================================================================
// VEILED MARKETS SDK - Main Entry Point
// ============================================================================
// TypeScript SDK for interacting with the veiled_markets_v35.aleo program
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
  BuySharesPrivateUsdcxParams,
  PlaceBetParams,
  SellSharesParams,
  AddLiquidityParams,
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

export {
  calculateContractOutcomePrice,
  calculateContractAllPrices,
  calculateContractTradeFees,
  quoteContractBuy,
  quoteContractSell,
  quoteContractAddLiquidity,
  calculateContractMaxTokensDesired,
  calculateContractSellTokensOut,
  calculateContractLPSharesOut,
  calculateContractLPTokensOut,
  calculateContractResolutionReward,
  calculateContractMinDisputeBond,
  calculateContractWinnerClaimUnlock,
} from './contract-math';

export type {
  ContractMathReserves,
  ContractFeeConfig,
  ContractTradeFees,
  ContractBuyQuote,
  ContractSellQuote,
  ContractLiquidityQuote,
} from './contract-math';

// Utilities - Legacy
export {
  calculateYesProbability,
  calculateNoProbability,
  calculatePotentialPayout,
} from './utils';

// Parlay
export { ParlayClient, createParlayClient, PARLAY_PROGRAM_ID } from './parlay-client';
export type { ParlayClientConfig, ParlayTransactionInputs } from './parlay-client';

export {
  ParlayStatus,
  PARLAY_FEE_BPS,
  PARLAY_ODDS_PRECISION,
  PARLAY_MIN_LEGS,
  PARLAY_MAX_LEGS,
  PARLAY_MIN_STAKE,
  PARLAY_DISPUTE_WINDOW_BLOCKS,
  PROGRAM_ALEO,
  PROGRAM_USDCX,
  PROGRAM_USAD,
  priceToOddsBps,
  oddsBpsToDisplay,
  calculateCombinedOddsBps,
  calculateParlayQuote,
  validateParlayLegs,
  validateParlayStake,
  getMarketProgram,
  formatParlayOdds,
  formatParlayPayout,
} from './parlay';
export type { ParlayLeg, ParlayQuote, ParlayData } from './parlay';

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
