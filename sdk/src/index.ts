// ============================================================================
// VEILED MARKETS SDK - Main Entry Point
// ============================================================================
// TypeScript SDK for the Veiled Markets protocol on Aleo
// Programs: veiled_markets_v37.aleo, veiled_markets_usdcx_v7.aleo,
// veiled_markets_usad_v14.aleo, veiled_governance_v6.aleo
// AMM-based multi-outcome prediction markets
// ============================================================================

// Client
export { VeiledMarketsClient, createClient, getMarketProgramId } from './client';

// Program IDs (deployed contracts)
export { PROGRAM_IDS, MARKET_PROGRAM_BY_TOKEN } from './types';

// Governance client (veiled_governance_v6.aleo)
export {
  VeiledGovernanceClient,
  createGovernanceClient,
  ESCALATION_TIER_NONE,
  ESCALATION_TIER_COMMITTEE,
  ESCALATION_TIER_COMMUNITY,
} from './governance-client';
export type {
  CommitteeDecision,
  MarketDisputeState,
  ResolverProfile,
} from './governance-client';

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

// Turbo (veiled_turbo_v8.aleo) — rolling 5-min UP/DOWN markets
export {
  TurboClient,
  createTurboClient,
  quoteBuyUpDown,
  quoteTurboPayout,
  parseTurboShareRecord,
} from './turbo-client';
export type {
  TurboClientConfig,
  TurboCall,
} from './turbo-client';
export {
  TURBO_OUTCOME,
  TurboMarketStatus,
  TURBO_SYMBOL_IDS,
  TURBO_PROTOCOL_FEE_BPS,
  TURBO_FEE_DENOMINATOR,
  TURBO_MIN_TRADE_AMOUNT,
  TURBO_DURATION_BLOCKS,
  TURBO_RESOLUTION_WINDOW_BLOCKS,
  TURBO_RESOLUTION_GRACE_BLOCKS,
} from './types';
export type {
  TurboSide,
  TurboSymbol,
  TurboMarket,
  TurboPool,
  TurboShare,
  TurboBuyParams,
  TurboBuyQuote,
  TurboClaimWinningsParams,
  TurboClaimRefundParams,
} from './types';

// Parlay
export { ParlayClient, createParlayClient, PARLAY_PROGRAM_ID } from './parlay-client';
export type { ParlayClientConfig, ParlayTransactionInputs } from './parlay-client';

// Indexer (Supabase off-chain query layer)
export { IndexerClient, createIndexerClient } from './indexer';
export type {
  IndexerConfig,
  ListOptions,
  MarketRegistryRow,
  TurboAuditRow,
} from './indexer';

// Pyth Hermes client (price verification for Turbo markets)
export {
  PythHermesClient,
  createPythHermesClient,
  PYTH_FEED_IDS,
} from './pyth-client';
export type {
  PythHermesConfig,
  PythQuote,
  TurboVerificationResult,
} from './pyth-client';

// Wallet adapters (browser only — safe to re-export; classes throw on construct
// if the wallet isn't installed, so importing doesn't itself break Node.js)
export {
  ShieldWalletAdapter,
  PuzzleWalletAdapter,
  LeoWalletAdapter,
  detectShield,
  detectPuzzle,
  detectLeo,
  detectWallet,
  listInstalledWallets,
  AVAILABLE_WALLETS,
} from './wallets';
export type { WalletName } from './wallets/detect';

// Node.js transaction executor (backend bots / schedulers)
// IMPORTANT: this imports node:child_process at module scope, so importing
// the SDK from a browser bundle will trigger a bundler warning. If you're
// building for the browser only, import from '@veiled-markets/sdk/wallets'
// instead (NOT available yet, but can be added as a sub-entrypoint).
export { NodeExecutor, createNodeExecutor } from './executor';
export type { NodeExecutorConfig, NodeExecResult } from './executor';

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
