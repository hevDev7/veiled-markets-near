// ============================================================================
// VEILED MARKETS SDK - Utility Functions
// ============================================================================

import { 
  MarketStatus, 
  Outcome, 
  PROTOCOL_FEE_BPS,
  CREATOR_FEE_BPS,
  FEE_DENOMINATOR,
} from './types';

/**
 * Calculate YES probability from pool amounts
 */
export function calculateYesProbability(yesPool: bigint, noPool: bigint): number {
  const total = yesPool + noPool;
  if (total === 0n) return 50;
  return Number((yesPool * 10000n) / total) / 100;
}

/**
 * Calculate NO probability from pool amounts
 */
export function calculateNoProbability(yesPool: bigint, noPool: bigint): number {
  return 100 - calculateYesProbability(yesPool, noPool);
}

/**
 * Calculate potential payout for a bet
 * @param betAmount - Amount to bet in microcredits
 * @param betOnYes - True if betting on YES outcome
 * @param yesPool - Current YES pool amount
 * @param noPool - Current NO pool amount
 */
export function calculatePotentialPayout(
  betAmount: bigint,
  betOnYes: boolean,
  yesPool: bigint,
  noPool: bigint
): bigint {
  const totalPool = yesPool + noPool + betAmount;
  const winningPool = betOnYes ? yesPool + betAmount : noPool + betAmount;

  if (winningPool === 0n) return 0n;

  const grossPayout = (betAmount * totalPool) / winningPool;
  const fees = (grossPayout * (PROTOCOL_FEE_BPS + CREATOR_FEE_BPS)) / FEE_DENOMINATOR;

  return grossPayout - fees;
}

/**
 * Calculate potential ROI percentage
 */
export function calculatePotentialROI(
  betAmount: bigint,
  outcome: Outcome,
  yesPool: bigint,
  noPool: bigint
): number {
  const payout = calculatePotentialPayout(betAmount, outcome, yesPool, noPool);
  if (betAmount === 0n) return 0;
  return Number(((payout - betAmount) * 10000n) / betAmount) / 100;
}

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
 * Minimum bet amount in microcredits (1000 = 0.001 credits)
 */
export const MIN_BET_AMOUNT = 1000n;

/**
 * Validate bet amount
 * @param amount - Bet amount in microcredits
 * @param balance - User's available balance in microcredits
 */
export function validateBetAmount(amount: bigint, balance: bigint): ValidationResult {
  if (amount <= 0n) {
    return { valid: false, error: 'Bet amount must be greater than 0' };
  }
  
  if (amount < MIN_BET_AMOUNT) {
    return { valid: false, error: `Bet amount must be at least ${MIN_BET_AMOUNT} microcredits (minimum: 0.001 credits)` };
  }
  
  if (amount > balance) {
    return { valid: false, error: 'Bet amount exceeds available balance' };
  }
  
  return { valid: true };
}

/**
 * Validate market deadline
 * @param deadline - Proposed deadline
 * @param minTimeFromNow - Minimum time from now in milliseconds (default: 1 hour)
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
 * @param resolutionDeadline - Resolution deadline
 * @param bettingDeadline - Betting deadline (must be before resolution)
 */
export function validateResolutionDeadline(
  resolutionDeadline: Date,
  bettingDeadline: Date
): ValidationResult {
  if (resolutionDeadline.getTime() <= bettingDeadline.getTime()) {
    return { valid: false, error: 'Resolution deadline must be after betting deadline' };
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

