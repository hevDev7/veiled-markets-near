// ============================================================================
// VEILED MARKETS SDK - Parlay Math
// ============================================================================
// Matches the Leo contract: veiled_parlay_v1.aleo
// Multi-leg parlay betting with combined odds multiplier
// ============================================================================

import { TokenType } from './types';

// Constants matching contract
export const PARLAY_FEE_BPS = 200n;         // 2% fee on winnings
export const PARLAY_FEE_DENOMINATOR = 10000n;
export const PARLAY_ODDS_PRECISION = 10000n; // Odds stored as bps: 25000 = 2.5x
export const PARLAY_MIN_LEGS = 2;
export const PARLAY_MAX_LEGS = 4;
export const PARLAY_MIN_STAKE = 100000n;     // 0.1 token
export const PARLAY_MAX_ODDS_BPS = 1000000n; // 100x per leg
export const PARLAY_MAX_COMBINED_MULTIPLIER = 10000n; // 1000x total
export const PARLAY_DISPUTE_WINDOW_BLOCKS = 2880n;

// Program identifiers (which market contract a leg belongs to)
export const PROGRAM_ALEO = 1;
export const PROGRAM_USDCX = 2;
export const PROGRAM_USAD = 3;

// Parlay status (matches contract)
export enum ParlayStatus {
  Active = 1,
  ResolvedWin = 2,
  ResolvedLoss = 3,
  Cancelled = 4,
  PendingDispute = 5,
}

export interface ParlayLeg {
  marketId: string;
  marketProgram: number;       // 1=ALEO, 2=USDCX, 3=USAD
  outcome: number;             // 1-4
  oddsBps: bigint;             // Odds in basis points (25000 = 2.5x)
  // Frontend-only display fields
  marketQuestion?: string;
  outcomeLabel?: string;
  displayOdds?: number;        // Human-readable (2.5)
}

export interface ParlayQuote {
  legs: ParlayLeg[];
  numLegs: number;
  stake: bigint;
  combinedOddsBps: bigint;    // Combined odds in bps
  combinedOdds: number;        // Human-readable combined odds
  grossPayout: bigint;         // Before fees
  fee: bigint;                 // Protocol fee
  netPayout: bigint;           // After fees
  tokenType: TokenType;
}

export interface ParlayData {
  parlayId: string;
  owner: string;
  numLegs: number;
  stake: bigint;
  potentialPayout: bigint;
  tokenType: TokenType;
  status: ParlayStatus;
  createdAt: bigint;
  resolutionSubmittedAt: bigint;
}

/**
 * Convert AMM outcome price (0-1) to parlay odds in basis points.
 * Price 0.4 → odds 2.5x → 25000 bps
 */
export function priceToOddsBps(price: number): bigint {
  if (price <= 0 || price >= 1) return PARLAY_ODDS_PRECISION;
  const odds = 1 / price;
  return BigInt(Math.round(odds * Number(PARLAY_ODDS_PRECISION)));
}

/**
 * Convert odds bps back to display odds.
 * 25000 bps → 2.5x
 */
export function oddsBpsToDisplay(oddsBps: bigint): number {
  return Number(oddsBps) / Number(PARLAY_ODDS_PRECISION);
}

/**
 * Calculate combined odds for multiple legs.
 * Uses the same precision math as the contract.
 */
export function calculateCombinedOddsBps(legs: ParlayLeg[]): bigint {
  if (legs.length < PARLAY_MIN_LEGS || legs.length > PARLAY_MAX_LEGS) {
    return 0n;
  }

  let combined = legs[0].oddsBps;
  for (let i = 1; i < legs.length; i++) {
    combined = (combined * legs[i].oddsBps) / PARLAY_ODDS_PRECISION;
  }
  return combined;
}

/**
 * Calculate full parlay quote with fees.
 */
export function calculateParlayQuote(
  legs: ParlayLeg[],
  stake: bigint,
  tokenType: TokenType,
  feeBps: bigint = PARLAY_FEE_BPS,
): ParlayQuote {
  const combinedOddsBps = calculateCombinedOddsBps(legs);
  const grossPayout = (stake * combinedOddsBps) / PARLAY_ODDS_PRECISION;
  const fee = (grossPayout * feeBps) / PARLAY_FEE_DENOMINATOR;
  const netPayout = grossPayout - fee;

  return {
    legs,
    numLegs: legs.length,
    stake,
    combinedOddsBps,
    combinedOdds: oddsBpsToDisplay(combinedOddsBps),
    grossPayout,
    fee,
    netPayout,
    tokenType,
  };
}

/**
 * Validate parlay legs before submission.
 */
export function validateParlayLegs(legs: ParlayLeg[]): { valid: boolean; error?: string } {
  if (legs.length < PARLAY_MIN_LEGS) {
    return { valid: false, error: `Minimum ${PARLAY_MIN_LEGS} legs required` };
  }
  if (legs.length > PARLAY_MAX_LEGS) {
    return { valid: false, error: `Maximum ${PARLAY_MAX_LEGS} legs allowed` };
  }

  // Check for duplicate markets
  const marketIds = new Set<string>();
  for (const leg of legs) {
    if (marketIds.has(leg.marketId)) {
      return { valid: false, error: `Duplicate market: ${leg.marketId}` };
    }
    marketIds.add(leg.marketId);

    if (leg.outcome < 1 || leg.outcome > 4) {
      return { valid: false, error: `Invalid outcome ${leg.outcome} for market ${leg.marketId}` };
    }
    if (leg.oddsBps <= PARLAY_ODDS_PRECISION) {
      return { valid: false, error: `Odds must be > 1.0x for market ${leg.marketId}` };
    }
    if (leg.oddsBps > PARLAY_MAX_ODDS_BPS) {
      return { valid: false, error: `Odds exceed 100x limit for market ${leg.marketId}` };
    }
  }

  // Check combined multiplier
  const combined = calculateCombinedOddsBps(legs);
  if (combined > PARLAY_MAX_COMBINED_MULTIPLIER * PARLAY_ODDS_PRECISION) {
    return { valid: false, error: `Combined payout exceeds 1000x limit` };
  }

  return { valid: true };
}

/**
 * Validate stake amount.
 */
export function validateParlayStake(
  stake: bigint,
  balance: bigint,
  minStake: bigint = PARLAY_MIN_STAKE,
): { valid: boolean; error?: string } {
  if (stake <= 0n) {
    return { valid: false, error: 'Stake must be greater than 0' };
  }
  if (stake < minStake) {
    return { valid: false, error: `Minimum stake is ${Number(minStake) / 1_000_000} tokens` };
  }
  if (stake > balance) {
    return { valid: false, error: 'Insufficient balance' };
  }
  return { valid: true };
}

/**
 * Determine which market program a market belongs to based on token type.
 */
export function getMarketProgram(tokenType: TokenType | number): number {
  switch (tokenType) {
    case TokenType.ALEO:
    case 1:
      return PROGRAM_ALEO;
    case TokenType.USDCX:
    case 2:
      return PROGRAM_USDCX;
    case TokenType.USAD:
    case 3:
      return PROGRAM_USAD;
    default:
      return PROGRAM_ALEO;
  }
}

/**
 * Format parlay odds for display.
 * Example: 25000n → "2.50x"
 */
export function formatParlayOdds(oddsBps: bigint): string {
  const display = oddsBpsToDisplay(oddsBps);
  return `${display.toFixed(2)}x`;
}

/**
 * Format combined payout for display.
 * Example: (stake: 1000000n, combinedOddsBps: 75000n) → "7.50 ALEO"
 */
export function formatParlayPayout(
  stake: bigint,
  combinedOddsBps: bigint,
  tokenSymbol: string = 'ALEO',
  feeBps: bigint = PARLAY_FEE_BPS,
): string {
  const grossPayout = (stake * combinedOddsBps) / PARLAY_ODDS_PRECISION;
  const fee = (grossPayout * feeBps) / PARLAY_FEE_DENOMINATOR;
  const netPayout = grossPayout - fee;
  const display = Number(netPayout) / 1_000_000;
  return `${display.toFixed(2)} ${tokenSymbol}`;
}
