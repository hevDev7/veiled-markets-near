// ============================================================================
// VEILED MARKETS SDK - Utility Functions (v12)
// ============================================================================
// AMM-based multi-outcome prediction market calculations
// ============================================================================

import {
  MarketStatus,
  Outcome,
  PROTOCOL_FEE_BPS,
  CREATOR_FEE_BPS,
  LP_FEE_BPS,
  TOTAL_FEE_BPS,
  FEE_DENOMINATOR,
} from './types';

// ============================================================================
// AMM PRICE CALCULATIONS
// ============================================================================

/**
 * Calculate price of a specific outcome (0-1 range)
 * price_i = reserve_i / total_reserves
 */
export function calculateOutcomePrice(
  reserve1: bigint,
  reserve2: bigint,
  reserve3: bigint,
  reserve4: bigint,
  numOutcomes: number,
  outcome: number,
): number {
  const reserves = [reserve1, reserve2, reserve3, reserve4];
  let total = 0n;
  for (let i = 0; i < numOutcomes; i++) {
    total += reserves[i];
  }
  if (total === 0n) return 1 / numOutcomes;
  return Number(reserves[outcome - 1]) / Number(total);
}

/**
 * Calculate all outcome prices at once
 */
export function calculateAllPrices(
  reserve1: bigint,
  reserve2: bigint,
  reserve3: bigint,
  reserve4: bigint,
  numOutcomes: number,
): number[] {
  const reserves = [reserve1, reserve2, reserve3, reserve4];
  let total = 0n;
  for (let i = 0; i < numOutcomes; i++) {
    total += reserves[i];
  }
  if (total === 0n) {
    return Array(numOutcomes).fill(1 / numOutcomes);
  }
  const prices: number[] = [];
  for (let i = 0; i < numOutcomes; i++) {
    prices.push(Number(reserves[i]) / Number(total));
  }
  return prices;
}

/**
 * Calculate fees for a given trade amount
 */
export function calculateTradeFees(amountIn: bigint): {
  protocolFee: bigint;
  creatorFee: bigint;
  lpFee: bigint;
  totalFees: bigint;
  amountAfterFees: bigint;
  amountToPool: bigint;
} {
  const protocolFee = (amountIn * PROTOCOL_FEE_BPS) / FEE_DENOMINATOR;
  const creatorFee = (amountIn * CREATOR_FEE_BPS) / FEE_DENOMINATOR;
  const lpFee = (amountIn * LP_FEE_BPS) / FEE_DENOMINATOR;
  const totalFees = protocolFee + creatorFee + lpFee;
  const amountAfterFees = amountIn - totalFees;
  const amountToPool = amountAfterFees + lpFee; // LP fee stays in pool
  return { protocolFee, creatorFee, lpFee, totalFees, amountAfterFees, amountToPool };
}

/**
 * Calculate shares out for buying outcome i
 * Matches contract: shares_out = (amount_to_pool * reserve_i) / (total + amount_to_pool)
 */
export function calculateBuySharesOut(
  reserve1: bigint,
  reserve2: bigint,
  reserve3: bigint,
  reserve4: bigint,
  numOutcomes: number,
  outcome: number,
  amountIn: bigint,
): bigint {
  const { amountToPool } = calculateTradeFees(amountIn);
  const reserves = [reserve1, reserve2, reserve3, reserve4];
  let total = 0n;
  for (let i = 0; i < numOutcomes; i++) {
    total += reserves[i];
  }
  const reserveI = reserves[outcome - 1];
  if (total === 0n || reserveI === 0n) return 0n;
  return (amountToPool * reserveI) / (total + amountToPool);
}

/**
 * Calculate tokens out for selling shares
 * Matches contract: tokens_out = (total * shares_to_sell) / (reserve_i + shares_to_sell)
 */
export function calculateSellTokensOut(
  reserve1: bigint,
  reserve2: bigint,
  reserve3: bigint,
  reserve4: bigint,
  numOutcomes: number,
  outcome: number,
  sharesToSell: bigint,
): bigint {
  const reserves = [reserve1, reserve2, reserve3, reserve4];
  let total = 0n;
  for (let i = 0; i < numOutcomes; i++) {
    total += reserves[i];
  }
  const reserveI = reserves[outcome - 1];
  if (total === 0n || reserveI === 0n) return 0n;
  const grossOut = (total * sharesToSell) / (reserveI + sharesToSell);
  const fees = (grossOut * TOTAL_FEE_BPS) / FEE_DENOMINATOR;
  return grossOut - fees;
}

/**
 * Calculate LP shares for adding liquidity
 */
export function calculateLPSharesOut(
  amount: bigint,
  totalLPShares: bigint,
  totalLiquidity: bigint,
): bigint {
  if (totalLiquidity === 0n) return amount;
  return (amount * totalLPShares) / totalLiquidity;
}

/**
 * Calculate tokens returned when removing LP shares
 */
export function calculateLPTokensOut(
  sharesToRemove: bigint,
  totalLPShares: bigint,
  totalLiquidity: bigint,
): bigint {
  if (totalLPShares === 0n) return 0n;
  return (sharesToRemove * totalLiquidity) / totalLPShares;
}

// ============================================================================
// LEGACY PROBABILITY FUNCTIONS (backward compat)
// ============================================================================

/**
 * Calculate YES probability from pool amounts (legacy - binary markets)
 */
export function calculateYesProbability(yesPool: bigint, noPool: bigint): number {
  const total = yesPool + noPool;
  if (total === 0n) return 50;
  return Number((yesPool * 10000n) / total) / 100;
}

/**
 * Calculate NO probability from pool amounts (legacy)
 */
export function calculateNoProbability(yesPool: bigint, noPool: bigint): number {
  return 100 - calculateYesProbability(yesPool, noPool);
}

/**
 * Calculate potential payout (v12: winning shares redeem 1:1, so payout = shares)
 */
export function calculatePotentialPayout(
  amountIn: bigint,
  outcome: number,
  reserve1: bigint,
  reserve2: bigint,
  reserve3: bigint = 0n,
  reserve4: bigint = 0n,
  numOutcomes: number = 2,
): bigint {
  return calculateBuySharesOut(reserve1, reserve2, reserve3, reserve4, numOutcomes, outcome, amountIn);
}

// ============================================================================
// FORMATTING
// ============================================================================

/**
 * Format microcredits to credits with decimal places
 */
export function formatCredits(microcredits: bigint, decimals: number = 2): string {
  const credits = Number(microcredits) / 1_000_000;
  return credits.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Parse credits string to microcredits
 */
export function parseCredits(credits: string): bigint {
  const value = parseFloat(credits.replace(/,/g, ''));
  return BigInt(Math.floor(value * 1_000_000));
}

/**
 * Format percentage
 */
export function formatPercentage(value: number, decimals: number = 1): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Get status display string
 */
export function getStatusDisplay(status: MarketStatus): string {
  switch (status) {
    case MarketStatus.Active:
      return 'Active';
    case MarketStatus.Closed:
      return 'Closed';
    case MarketStatus.Resolved:
      return 'Resolved';
    case MarketStatus.Cancelled:
      return 'Cancelled';
    case MarketStatus.PendingResolution:
      return 'Pending Resolution';
    default:
      return 'Unknown';
  }
}

/**
 * Get status color class
 */
export function getStatusColor(status: MarketStatus): string {
  switch (status) {
    case MarketStatus.Active:
      return 'text-emerald-400';
    case MarketStatus.Closed:
      return 'text-amber-400';
    case MarketStatus.Resolved:
      return 'text-blue-400';
    case MarketStatus.Cancelled:
      return 'text-red-400';
    case MarketStatus.PendingResolution:
      return 'text-purple-400';
    default:
      return 'text-gray-400';
  }
}

/**
 * Hash a string to field element (for question hash)
 */
export async function hashToField(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hashHex}field`;
}

/**
 * Generate a unique market ID preview
 */
export function generateMarketIdPreview(
  creator: string,
  questionHash: string,
  deadline: bigint
): string {
  const combined = `${creator}${questionHash}${deadline}`;
  return combined.slice(0, 16) + '...';
}

/**
 * Format block height to estimated time
 */
export function blockHeightToTime(
  targetBlock: bigint,
  currentBlock: bigint,
  avgBlockTime: number = 15
): Date {
  const blocksRemaining = Number(targetBlock - currentBlock);
  const secondsRemaining = blocksRemaining * avgBlockTime;
  return new Date(Date.now() + secondsRemaining * 1000);
}

/**
 * Format time remaining
 */
export function formatTimeRemaining(targetDate: Date): string {
  const now = new Date();
  const diff = targetDate.getTime() - now.getTime();

  if (diff <= 0) return 'Ended';

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/**
 * Shorten address for display
 */
export function shortenAddress(address: string, chars: number = 6): string {
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

/**
 * Validate Aleo address format
 */
export function isValidAleoAddress(address: string): boolean {
  return /^aleo1[a-z0-9]{58}$/.test(address);
}

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Minimum trade amount in microcredits
 */
export const MIN_TRADE_AMOUNT = 1000n;
/** Legacy alias */
export const MIN_BET_AMOUNT = MIN_TRADE_AMOUNT;

/**
 * Validate trade amount
 */
export function validateTradeAmount(amount: bigint, balance: bigint): ValidationResult {
  if (amount <= 0n) {
    return { valid: false, error: 'Trade amount must be greater than 0' };
  }

  if (amount < MIN_TRADE_AMOUNT) {
    return { valid: false, error: `Trade amount must be at least ${MIN_TRADE_AMOUNT} microcredits (minimum: 0.001 tokens)` };
  }

  if (amount > balance) {
    return { valid: false, error: 'Trade amount exceeds available balance' };
  }

  return { valid: true };
}

/** Legacy alias */
export const validateBetAmount = validateTradeAmount;

/**
 * Validate market deadline
 */
export function validateMarketDeadline(
  deadline: Date,
  minTimeFromNow: number = 3600000
): ValidationResult {
  const now = new Date();
  const diff = deadline.getTime() - now.getTime();

  if (diff <= 0) {
    return { valid: false, error: 'Deadline must be in the future' };
  }

  if (diff < minTimeFromNow) {
    const minHours = minTimeFromNow / 3600000;
    return { valid: false, error: `Deadline must be at least ${minHours} hour(s) from now` };
  }

  return { valid: true };
}

/**
 * Validate resolution deadline
 */
export function validateResolutionDeadline(
  resolutionDeadline: Date,
  bettingDeadline: Date
): ValidationResult {
  if (resolutionDeadline.getTime() <= bettingDeadline.getTime()) {
    return { valid: false, error: 'Resolution deadline must be after trading deadline' };
  }

  return { valid: true };
}

/**
 * Validate market question
 */
export function validateMarketQuestion(question: string): ValidationResult {
  const trimmed = question.trim();

  if (trimmed.length < 10) {
    return { valid: false, error: 'Question must be at least 10 characters' };
  }

  if (trimmed.length > 500) {
    return { valid: false, error: 'Question must be less than 500 characters' };
  }

  if (!trimmed.includes('?')) {
    return { valid: false, error: 'Question should end with a question mark' };
  }

  return { valid: true };
}

/**
 * Validate number of outcomes
 */
export function validateNumOutcomes(numOutcomes: number): ValidationResult {
  if (numOutcomes < 2 || numOutcomes > 4) {
    return { valid: false, error: 'Number of outcomes must be between 2 and 4' };
  }
  return { valid: true };
}

/**
 * Calculate minimum shares out with slippage tolerance
 */
export function calculateMinSharesOut(
  expectedShares: bigint,
  slippageTolerance: number // percentage (e.g., 1 = 1%)
): bigint {
  const slippageFactor = BigInt(Math.floor((100 - slippageTolerance) * 100));
  return (expectedShares * slippageFactor) / 10000n;
}
