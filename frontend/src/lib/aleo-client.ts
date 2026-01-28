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

  // Value is already a clean string with actual newlines (not \n)
  // Remove outer braces
  const inner = value.replace(/^\{|\}$/g, '').trim();
  const result: Record<string, string> = {};

  // Split by actual newlines
  const lines = inner.split('\n').map(l => l.trim()).filter(l => l);

  for (const line of lines) {
    // Remove trailing comma if present
    const cleanLine = line.replace(/,$/, '').trim();
    const colonIndex = cleanLine.indexOf(':');
    if (colonIndex === -1) continue;

    const key = cleanLine.substring(0, colonIndex).trim();
    const val = cleanLine.substring(colonIndex + 1).trim().replace(/,$/, '');

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

  // Handle field type
  if (trimmed.endsWith('field')) {
    return trimmed;
  }

  // Handle u8
  if (trimmed.endsWith('u8')) {
    const num = trimmed.replace('u8', '');
    return parseInt(num);
  }

  // Handle u64
  if (trimmed.endsWith('u64')) {
    const num = trimmed.replace('u64', '');
    return BigInt(num);
  }

  // Handle addresses
  if (trimmed.startsWith('aleo1')) {
    return trimmed;
  }

  // Handle booleans
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

    // Parse the JSON string first (API returns JSON-encoded string)
    const cleanData = JSON.parse(data);

    // If it's a struct (starts with {), parse it
    if (typeof cleanData === 'string' && cleanData.trim().startsWith('{')) {
      return parseAleoStruct(cleanData) as T;
    }

    // Otherwise parse as simple value
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

  console.log('getMarket parsed data:', data);

  // Parse each field explicitly
  const parsedCategory = parseAleoValue(data.category || '0u8');
  const parsedDeadline = parseAleoValue(data.deadline || '0u64');
  const parsedResolutionDeadline = parseAleoValue(data.resolution_deadline || '0u64');
  const parsedStatus = parseAleoValue(data.status || '1u8');
  const parsedCreatedAt = parseAleoValue(data.created_at || '0u64');

  console.log('Parsed values:', {
    category: parsedCategory,
    deadline: parsedDeadline,
    resolution_deadline: parsedResolutionDeadline,
    status: parsedStatus,
    created_at: parsedCreatedAt,
  });

  const result = {
    id: data.id || marketId,
    creator: data.creator || '',
    question_hash: data.question_hash || '',
    category: typeof parsedCategory === 'number' ? parsedCategory : 0,
    deadline: typeof parsedDeadline === 'bigint' ? parsedDeadline : 0n,
    resolution_deadline: typeof parsedResolutionDeadline === 'bigint' ? parsedResolutionDeadline : 0n,
    status: typeof parsedStatus === 'number' ? parsedStatus : 1,
    created_at: typeof parsedCreatedAt === 'bigint' ? parsedCreatedAt : 0n,
  };

  console.log('getMarket result:', result);
  return result;
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

/**
 * Known market IDs - Loaded dynamically from indexer
 * Fallback to hardcoded IDs if indexer data not available
 */
let KNOWN_MARKET_IDS = [
  '2226266059345959235903805886443078929600424190236962232761580543397941034862field', // First test market
  '1343955940696835063665090431790223713510436410586241525974362313497380512445field', // Politics
  '810523019777616412177748759438416240921384383441959113104962406712429357311field',  // Sports
  '2561705300444654139615408172203999477019238232931615365990277976260492916308field', // Crypto
  '6497398114847519923379901992833643876462593069120645523569600191102874822191field', // Entertainment
  '2782540397887243983750241685138602830175258821940489779581095376798172768978field', // Tech
  '7660559822229647474965631916495293995705931900965070950237377789460326943999field', // Economics
  '425299171484137372110091327826787897441058548811928022547541653437849039243field',  // Science
];

/**
 * Question text mapping (temporary - in production would use IPFS/storage)
 * Maps question_hash to actual question text
 */
const QUESTION_TEXT_MAP: Record<string, string> = {
  '12345field': 'Will Bitcoin reach $150,000 by end of Q1 2026?',
  '10001field': 'Will Trump complete his full presidential term through 2028?',
  '20002field': 'Will Lionel Messi win the 2026 FIFA World Cup with Argentina?',
  '30003field': 'Will Bitcoin reach $150,000 by end of Q1 2026?',
  '40004field': 'Will Avatar 3 gross over $2 billion worldwide in 2026?',
  '50005field': 'Will Apple release AR glasses (Apple Vision Pro 2) in 2026?',
  '60006field': 'Will global inflation drop below 3% average by end of 2026?',
  '70007field': 'Will NASA Artemis III successfully land humans on Moon in 2026?',
};

/**
 * Transaction ID mapping (for verification links)
 * Maps market_id to creation transaction ID
 */
const MARKET_TX_MAP: Record<string, string> = {
  '2226266059345959235903805886443078929600424190236962232761580543397941034862field': 'at1suyzwzd3zkymsewnpjqjs6h0x0k0u03yd8azv452ra36qjtzyvrsnjq902',
  '1343955940696835063665090431790223713510436410586241525974362313497380512445field': 'at1j8xalgyfw7thg2zmpy9zlt82cpegse3vqsm9g3z2l3a59wj3ry8qg9n9u7',
  '810523019777616412177748759438416240921384383441959113104962406712429357311field': 'at1q5rvkyexgwnvrwlw587s7qzl2tegn6524we96gyhuc0hz7zs55rqfm00r4',
  '2561705300444654139615408172203999477019238232931615365990277976260492916308field': 'at1fvk3t9494tp56a7gykna7djgnurf25yphxg9ystprcjxhach0qxsn8e5wx',
  '6497398114847519923379901992833643876462593069120645523569600191102874822191field': 'at1fnyzg2j7n4ep2l6p0qvlfnfqsufh7jxerfpe7chzymgsl0ukeyqqhrceej',
  '2782540397887243983750241685138602830175258821940489779581095376798172768978field': 'at12f9uvhadvppk3kqqe8y6s4mwsnn37fnv2lkzd3s8pdvy9yz8h5zqyzwrwa',
  '7660559822229647474965631916495293995705931900965070950237377789460326943999field': 'at14agvnhed7rfh9pvxfmm64kw50jt4aea0y40r0u2vc46znsvk3vgsdxglv4',
  '425299171484137372110091327826787897441058548811928022547541653437849039243field': 'at1eqvc2jzfnmuc7c9fzuny0uu34tqfjd2mv4xpqnknd9hnvz8l2qrsd8yyez',
};

/**
 * Load market IDs from indexer service
 */
async function loadMarketIdsFromIndexer(): Promise<string[]> {
  try {
    const response = await fetch('/markets-index.json');
    if (!response.ok) {
      console.warn('Indexer data not found, using fallback market IDs');
      return KNOWN_MARKET_IDS;
    }

    const data = await response.json();
    const marketIds = data.marketIds || [];

    if (marketIds.length > 0) {
      console.log(`✅ Loaded ${marketIds.length} markets from indexer`);
      return marketIds;
    }

    return KNOWN_MARKET_IDS;
  } catch (error) {
    console.error('Failed to load indexer data:', error);
    return KNOWN_MARKET_IDS;
  }
}

/**
 * Initialize market IDs (call this on app startup)
 */
export async function initializeMarketIds(): Promise<void> {
  const indexedIds = await loadMarketIdsFromIndexer();
  if (indexedIds.length > 0) {
    KNOWN_MARKET_IDS = indexedIds;
  }
}

/**
 * Get question text from hash
 */
export function getQuestionText(questionHash: string): string {
  return QUESTION_TEXT_MAP[questionHash] || `Market with hash ${questionHash.slice(0, 12)}...`;
}

/**
 * Get transaction ID for market (for verification)
 */
export function getMarketTransactionId(marketId: string): string | null {
  return MARKET_TX_MAP[marketId] || null;
}

/**
 * Fetch all markets from blockchain (requires indexer in production)
 * For now, fetches known market IDs manually
 */
export async function fetchAllMarkets(): Promise<Array<{
  market: MarketData;
  pool: MarketPoolData;
  resolution?: MarketResolutionData;
}>> {
  console.log('fetchAllMarkets: Fetching known markets...');

  const results = await Promise.all(
    KNOWN_MARKET_IDS.map(id => fetchMarketById(id))
  );

  // Filter out nulls and return valid markets
  return results.filter((r): r is NonNullable<typeof r> => r !== null);
}

/**
 * Fetch complete market data by ID
 */
export async function fetchMarketById(marketId: string) {
  try {
    const [market, pool, resolution] = await Promise.all([
      getMarket(marketId),
      getMarketPool(marketId),
      getMarketResolution(marketId),
    ]);

    if (!market || !pool) {
      return null;
    }

    return {
      market,
      pool,
      resolution: resolution || undefined,
    };
  } catch (error) {
    console.error(`Failed to fetch market ${marketId}:`, error);
    return null;
  }
}

// Export a singleton instance info
export const CONTRACT_INFO = {
  programId: PROGRAM_ID,
  deploymentTxId: 'at1j2f9r4mdls0n6k55nnscdckhuz7uyqfkuhj9kmer2v2hs6z0u5zsm8xf90',
  network: 'testnet',
  explorerUrl: config.explorerUrl,
  // Note: Mock data is used until indexer is available
  useMockData: true,
};
