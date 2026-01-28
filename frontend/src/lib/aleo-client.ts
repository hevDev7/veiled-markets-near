// ============================================================================
// VEILED MARKETS - Aleo Client Integration
// ============================================================================
// Client for interacting with the deployed veiled_markets.aleo program
// ============================================================================

import { config } from './config';

// Contract constants (matching main.leo)
export const MARKET_STATUS = {
  ACTIVE: 1,
  CLOSED: 2,
  RESOLVED: 3,
  CANCELLED: 4,
} as const;

export const OUTCOME = {
  YES: 1,
  NO: 2,
} as const;

export const FEES = {
  PROTOCOL_FEE_BPS: 100n, // 1%
  CREATOR_FEE_BPS: 100n,  // 1%
  FEE_DENOMINATOR: 10000n,
};

// Types matching the contract structures
export interface MarketData {
  id: string;
  creator: string;
  question_hash: string;
  category: number;
  deadline: bigint;
  resolution_deadline: bigint;
  status: number;
  created_at: bigint;
}

export interface MarketPoolData {
  market_id: string;
  total_yes_pool: bigint;
  total_no_pool: bigint;
  total_bets: bigint;
  total_unique_bettors: bigint;
}

export interface MarketResolutionData {
  market_id: string;
  winning_outcome: number;
  resolver: string;
  resolved_at: bigint;
  total_payout_pool: bigint;
}

// API configuration
const API_BASE_URL = config.rpcUrl || 'https://api.explorer.provable.com/v1/testnet';
const PROGRAM_ID = config.programId || 'veiled_markets.aleo';

/**
 * Parse Aleo struct value from API response
 */
function parseAleoStruct(value: string): Record<string, string> {
  if (!value) return {};

  // Remove outer braces and split by comma
  const inner = value.replace(/^\{|\}$/g, '').trim();
  const result: Record<string, string> = {};

  // Parse key: value pairs
  const parts = inner.split(',');
  for (const part of parts) {
    const [key, val] = part.split(':').map(s => s.trim());
    if (key && val) {
      result[key] = val;
    }
  }

  return result;
}

/**
 * Parse Aleo value (remove type suffix)
 */
function parseAleoValue(value: string): string | number | bigint | boolean {
  if (!value) return value;

  const trimmed = value.trim().replace(/"/g, '');

  if (trimmed.endsWith('field')) {
    return trimmed;
  }
  if (trimmed.endsWith('u8')) {
    return parseInt(trimmed.replace('u8', ''));
  }
  if (trimmed.endsWith('u64')) {
    return BigInt(trimmed.replace('u64', ''));
  }
  if (trimmed.startsWith('aleo1')) {
    return trimmed;
  }
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;

  return trimmed;
}

/**
 * Fetch current block height
 */
export async function getCurrentBlockHeight(): Promise<bigint> {
  try {
    const response = await fetch(`${API_BASE_URL}/latest/height`);
    if (!response.ok) throw new Error('Failed to fetch block height');
    const height = await response.json();
    return BigInt(height);
  } catch (error) {
    console.error('Failed to fetch block height:', error);
    // Estimate based on time
    return BigInt(Math.floor(Date.now() / 15000));
  }
}

/**
 * Fetch a mapping value from the contract
 */
export async function getMappingValue<T>(
  mappingName: string,
  key: string
): Promise<T | null> {
  try {
    const url = `${API_BASE_URL}/program/${PROGRAM_ID}/mapping/${mappingName}/${key}`;
    console.log('Fetching mapping:', url);

    const response = await fetch(url);
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`Failed to fetch mapping: ${response.status}`);
    }

    const data = await response.text();
    console.log('Mapping response:', data);

    // Parse the response
    const cleanData = data.replace(/"/g, '').trim();

    // If it's a struct, parse it
    if (cleanData.startsWith('{')) {
      return parseAleoStruct(cleanData) as T;
    }

    return parseAleoValue(cleanData) as T;
  } catch (error) {
    console.error(`Failed to fetch mapping ${mappingName}[${key}]:`, error);
    return null;
  }
}

/**
 * Fetch market data by ID
 */
export async function getMarket(marketId: string): Promise<MarketData | null> {
  const data = await getMappingValue<Record<string, string>>('markets', marketId);
  if (!data) return null;

  return {
    id: String(data.id || marketId),
    creator: String(data.creator || ''),
    question_hash: String(data.question_hash || ''),
    category: Number(parseAleoValue(data.category || '0u8')),
    deadline: BigInt(parseAleoValue(data.deadline || '0u64') as bigint),
    resolution_deadline: BigInt(parseAleoValue(data.resolution_deadline || '0u64') as bigint),
    status: Number(parseAleoValue(data.status || '1u8')),
    created_at: BigInt(parseAleoValue(data.created_at || '0u64') as bigint),
  };
}

/**
 * Fetch market pool data
 */
export async function getMarketPool(marketId: string): Promise<MarketPoolData | null> {
  const data = await getMappingValue<Record<string, string>>('market_pools', marketId);
  if (!data) return null;

  return {
    market_id: String(data.market_id || marketId),
    total_yes_pool: BigInt(parseAleoValue(data.total_yes_pool || '0u64') as bigint),
    total_no_pool: BigInt(parseAleoValue(data.total_no_pool || '0u64') as bigint),
    total_bets: BigInt(parseAleoValue(data.total_bets || '0u64') as bigint),
    total_unique_bettors: BigInt(parseAleoValue(data.total_unique_bettors || '0u64') as bigint),
  };
}

/**
 * Fetch market resolution data
 */
export async function getMarketResolution(marketId: string): Promise<MarketResolutionData | null> {
  const data = await getMappingValue<Record<string, string>>('market_resolutions', marketId);
  if (!data) return null;

  return {
    market_id: String(data.market_id || marketId),
    winning_outcome: Number(parseAleoValue(data.winning_outcome || '0u8')),
    resolver: String(data.resolver || ''),
    resolved_at: BigInt(parseAleoValue(data.resolved_at || '0u64') as bigint),
    total_payout_pool: BigInt(parseAleoValue(data.total_payout_pool || '0u64') as bigint),
  };
}

/**
 * Check if a user has claimed for a market
 */
export async function hasUserClaimed(_marketId: string, _userAddress: string): Promise<boolean> {
  // The claim key is a hash of market_id and claimer address
  // For now, we'll return false as we can't compute the hash client-side easily
  // In production, this would need to be tracked differently
  return false;
}

/**
 * Calculate YES probability from pool data
 */
export function calculateYesProbability(yesPool: bigint, noPool: bigint): number {
  const total = yesPool + noPool;
  if (total === 0n) return 50; // Default 50% when no bets
  return Number((yesPool * 10000n) / total) / 100;
}

/**
 * Calculate potential payout multiplier
 */
export function calculatePotentialPayout(
  betOnYes: boolean,
  yesPool: bigint,
  noPool: bigint
): number {
  const totalPool = yesPool + noPool;
  const winningPool = betOnYes ? yesPool : noPool;

  if (winningPool === 0n) return 0;

  // Payout = (total_pool / winning_pool) * (1 - fees)
  const grossMultiplier = Number(totalPool * 10000n / winningPool) / 10000;
  const feeMultiplier = Number(FEES.FEE_DENOMINATOR - FEES.PROTOCOL_FEE_BPS - FEES.CREATOR_FEE_BPS) / Number(FEES.FEE_DENOMINATOR);

  return grossMultiplier * feeMultiplier;
}

/**
 * Build inputs for create_market transaction
 */
export function buildCreateMarketInputs(
  questionHash: string,
  category: number,
  deadline: bigint,
  resolutionDeadline: bigint
): string[] {
  return [
    questionHash,
    `${category}u8`,
    `${deadline}u64`,
    `${resolutionDeadline}u64`,
  ];
}

/**
 * Build inputs for place_bet transaction
 */
export function buildPlaceBetInputs(
  marketId: string,
  amount: bigint,
  outcome: 'yes' | 'no',
  bettorAddress: string
): string[] {
  return [
    marketId,
    `${amount}u64`,
    outcome === 'yes' ? '1u8' : '2u8',
    bettorAddress,
  ];
}

/**
 * Build inputs for close_market transaction
 */
export function buildCloseMarketInputs(marketId: string): string[] {
  return [marketId];
}

/**
 * Build inputs for resolve_market transaction
 */
export function buildResolveMarketInputs(
  marketId: string,
  winningOutcome: 'yes' | 'no'
): string[] {
  return [
    marketId,
    winningOutcome === 'yes' ? '1u8' : '2u8',
  ];
}

/**
 * Build inputs for cancel_market transaction
 */
export function buildCancelMarketInputs(marketId: string): string[] {
  return [marketId];
}

/**
 * Format block height to approximate date
 */
export function blockHeightToDate(blockHeight: bigint, currentHeight: bigint): Date {
  const blocksRemaining = Number(blockHeight - currentHeight);
  const msRemaining = blocksRemaining * 15000; // ~15 seconds per block
  return new Date(Date.now() + msRemaining);
}

/**
 * Format time remaining from block height
 */
export function formatTimeRemaining(deadlineBlock: bigint, currentBlock: bigint): string {
  const blocksRemaining = Number(deadlineBlock - currentBlock);
  if (blocksRemaining <= 0) return 'Ended';

  const secondsRemaining = blocksRemaining * 15;
  const days = Math.floor(secondsRemaining / 86400);
  const hours = Math.floor((secondsRemaining % 86400) / 3600);
  const minutes = Math.floor((secondsRemaining % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/**
 * Get transaction URL on explorer
 */
export function getTransactionUrl(transactionId: string): string {
  return `${config.explorerUrl}/transaction/${transactionId}`;
}

/**
 * Get program URL on explorer
 */
export function getProgramUrl(): string {
  return `${config.explorerUrl}/program/${PROGRAM_ID}`;
}

/**
 * Hash a string to field (simplified - in production use proper hashing)
 */
export async function hashToField(input: string): Promise<string> {
  // Use Web Crypto API for hashing
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  // Convert to field format (take first 62 chars + 'field')
  return `${hashHex.substring(0, 62)}field`;
}

// Export a singleton instance info
export const CONTRACT_INFO = {
  programId: PROGRAM_ID,
  deploymentTxId: 'at1j2f9r4mdls0n6k55nnscdckhuz7uyqfkuhj9kmer2v2hs6z0u5zsm8xf90',
  network: 'testnet',
  explorerUrl: config.explorerUrl,
};
