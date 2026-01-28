// ============================================================================
// VEILED MARKETS SDK - Main Entry Point
// ============================================================================
// TypeScript SDK for interacting with the veiled_markets.aleo program
// ============================================================================

// Client
export { VeiledMarketsClient, createClient } from './client';

// Types - Enums
export {
  MarketStatus,
  Outcome,
  MarketCategory,
} from './types';

// Types - Interfaces
export type {
  Market,
  MarketPool,
  MarketResolution,
  MarketWithStats,
  Bet,
  WinningsClaim,
  RefundClaim,
  CreateMarketParams,
  PlaceBetParams,
  TransactionResult,
  WalletState,
  WalletAdapter,
  WalletConnectionResult,
  TransactionRequestParams,
  VeiledMarketsConfig,
  NetworkType,
} from './types';

// Types - Constants
export {
  PROTOCOL_FEE_BPS,
  CREATOR_FEE_BPS,
  FEE_DENOMINATOR,
  MIN_BET_AMOUNT,
  NETWORK_CONFIG,
} from './types';

// Utilities
export {
  calculateYesProbability,
  calculateNoProbability,
  calculatePotentialPayout,
  calculatePotentialROI,
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
} from './utils';
