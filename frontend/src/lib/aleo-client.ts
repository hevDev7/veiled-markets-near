// ============================================================================
// VEILED MARKETS - Aleo Client Integration
// ============================================================================
// Client for interacting with the deployed veiled_markets_v9.aleo program
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
const PROGRAM_ID = 'veiled_markets_v9.aleo';  // Version 5 (privacy-preserving with transfer_private_to_public)

// Timeout for network requests (prevents UI from hanging indefinitely)
const FETCH_TIMEOUT_MS = 10_000; // 10 seconds per request

async function fetchWithTimeout(url: string, timeoutMs: number = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Transaction status and details
 */
export interface TransactionDetails {
  id: string;
  status: 'pending' | 'confirmed' | 'failed';
  outputs?: TransactionOutput[];
  error?: string;
}

export interface TransactionOutput {
  type: string;
  id: string;
  value: string;
}

/**
 * Fetch transaction details from the blockchain
 */
export async function getTransactionDetails(transactionId: string): Promise<TransactionDetails | null> {
  try {
    const url = `${API_BASE_URL}/transaction/${transactionId}`;
    console.log('Fetching transaction details:', url);

    const response = await fetchWithTimeout(url);
    if (!response.ok) {
      if (response.status === 404) {
        // Transaction not yet confirmed
        return { id: transactionId, status: 'pending' };
      }
      throw new Error(`Failed to fetch transaction: ${response.status}`);
    }

    const data = await response.json();
    console.log('Transaction data:', data);

    // Extract outputs from the transaction
    const outputs: TransactionOutput[] = [];

    // Parse execution outputs if available
    if (data.execution?.transitions) {
      for (const transition of data.execution.transitions) {
        if (transition.outputs) {
          for (const output of transition.outputs) {
            outputs.push({
              type: output.type || 'unknown',
              id: output.id || '',
              value: output.value || '',
            });
          }
        }
      }
    }

    return {
      id: transactionId,
      status: 'confirmed',
      outputs,
    };
  } catch (error) {
    console.error('Failed to fetch transaction details:', error);
    return null;
  }
}

/**
 * Extract market ID from create_market transaction outputs
 * The contract returns the market_id as the first output
 */
export function extractMarketIdFromTransaction(txDetails: TransactionDetails): string | null {
  if (!txDetails.outputs || txDetails.outputs.length === 0) {
    return null;
  }

  // Look for a field value in the outputs
  for (const output of txDetails.outputs) {
    const value = output.value;
    // The market_id should be a field type
    if (value && value.includes('field')) {
      // Extract the field value
      const match = value.match(/(\d+field)/);
      if (match) {
        console.log('Extracted market ID from transaction:', match[1]);
        return match[1];
      }
    }
  }

  // Also try parsing the raw output value
  for (const output of txDetails.outputs) {
    try {
      // Some outputs might be JSON or have nested structure
      const parsed = typeof output.value === 'string' ? output.value : JSON.stringify(output.value);
      const fieldMatch = parsed.match(/(\d+)field/);
      if (fieldMatch) {
        const marketId = `${fieldMatch[1]}field`;
        console.log('Extracted market ID from parsed output:', marketId);
        return marketId;
      }
    } catch {
      // Continue to next output
    }
  }

  return null;
}

/**
 * Poll for transaction confirmation and extract market ID
 * Returns the actual market ID once the transaction is confirmed
 */
export async function waitForMarketCreation(
  transactionId: string,
  questionHash: string,
  questionText: string,
  maxAttempts: number = 20, // ~5 minutes at 15 second intervals
  intervalMs: number = 15000
): Promise<string | null> {
  console.log('Waiting for market creation transaction:', transactionId);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    console.log(`Polling attempt ${attempt + 1}/${maxAttempts}...`);

    const txDetails = await getTransactionDetails(transactionId);

    if (txDetails?.status === 'confirmed') {
      const marketId = extractMarketIdFromTransaction(txDetails);

      if (marketId) {
        console.log('Market created successfully! Market ID:', marketId);

        // Register the market ID and question text
        addKnownMarketId(marketId);
        registerQuestionText(marketId, questionText);
        registerMarketTransaction(marketId, transactionId);

        // Also keep the question hash mapping for backwards compatibility
        registerQuestionText(questionHash, questionText);

        return marketId;
      } else {
        console.warn('Transaction confirmed but could not extract market ID from outputs');
        // Still return null to indicate we couldn't get the market ID
        return null;
      }
    }

    if (txDetails?.status === 'failed') {
      console.error('Transaction failed:', txDetails.error);
      return null;
    }

    // Wait before next attempt
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  console.warn('Timed out waiting for transaction confirmation');
  return null;
}

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
    const response = await fetchWithTimeout(`${API_BASE_URL}/latest/height`);
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

    const response = await fetchWithTimeout(url);
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
 * Build inputs for place_bet transaction (v5)
 * place_bet(market_id: field, amount: u64, outcome: u8)
 * Uses transfer_public_as_signer for wallet SDK compatibility
 */
/**
 * Build inputs for place_bet transaction (Privacy-Preserving)
 * Contract signature: place_bet(market_id: field, amount: u64, outcome: u8, credits_in: credits.aleo/credits)
 * We pass only the 3 public inputs - the wallet auto-selects the private credits record
 * This keeps the bettor's identity hidden via transfer_private_to_public
 */
export function buildPlaceBetInputs(
  marketId: string,
  amount: bigint,
  outcome: 'yes' | 'no',
): string[] {
  return [
    marketId,
    `${amount}u64`,
    outcome === 'yes' ? '1u8' : '2u8',
  ];
}

/**
 * Build inputs for commit_bet transaction (Phase 2: Commit-Reveal Scheme)
 * commit_bet(market_id: field, amount: u64, outcome: u8, credits_in: credits.aleo/credits)
 * Note: amount and outcome are PRIVATE parameters for maximum privacy
 */
export function buildCommitBetInputs(
  marketId: string,
  amount: bigint,
  outcome: 'yes' | 'no',
  creditsRecord: string  // Private credits record ciphertext
): string[] {
  return [
    marketId,
    `${amount}u64`,  // Private parameter
    outcome === 'yes' ? '1u8' : '2u8',  // Private parameter
    creditsRecord,  // Private credits record
  ];
}

/**
 * Build inputs for reveal_bet transaction (Phase 2: Commit-Reveal Scheme)
 * reveal_bet(bet: Bet, commitment: Commitment, credits_record: credits.aleo/credits, amount: u64)
 * Note: bet, commitment, and credits_record are PRIVATE, amount is PUBLIC (revealed after deadline)
 */
export function buildRevealBetInputs(
  betRecord: string,  // Private Bet record ciphertext
  commitmentRecord: string,  // Private Commitment record ciphertext
  creditsRecord: string,  // Private credits record ciphertext
  amount: bigint  // Public amount (revealed after deadline)
): string[] {
  return [
    betRecord,  // Private
    commitmentRecord,  // Private
    creditsRecord,  // Private
    `${amount}u64`,  // Public (revealed)
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
 * Hash a string to field
 * IMPORTANT: Aleo field values must be decimal numbers, NOT hex strings
 * The field modulus is approximately 2^253, so we use a portion of the hash
 * to create a valid decimal field value
 */
export async function hashToField(input: string): Promise<string> {
  // Use Web Crypto API for hashing
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));

  // Convert hash bytes to a BigInt (take first 31 bytes = 248 bits to stay under field modulus ~2^253)
  let hashBigInt = BigInt(0);
  for (let i = 0; i < 31; i++) {
    hashBigInt = (hashBigInt << BigInt(8)) | BigInt(hashArray[i]);
  }

  // Ensure it's positive and within field range
  // Aleo field modulus is approximately 8444461749428370424248824938781546531375899335154063827935233455917409239041
  // We use a smaller range to be safe
  const fieldModulus = BigInt('8444461749428370424248824938781546531375899335154063827935233455917409239040');
  hashBigInt = hashBigInt % fieldModulus;

  // Ensure non-zero (0field might cause issues)
  if (hashBigInt === BigInt(0)) {
    hashBigInt = BigInt(1);
  }

  console.log('hashToField input:', input);
  console.log('hashToField result:', `${hashBigInt.toString()}field`);

  return `${hashBigInt.toString()}field`;
}

/**
 * Known market IDs - Loaded dynamically from indexer or localStorage
 * Start with empty array - markets will be added when created via the UI
 * These are persisted in localStorage to survive page reloads
 */
let KNOWN_MARKET_IDS: string[] = [];

// Load saved market IDs from localStorage on module load
if (typeof window !== 'undefined') {
  try {
    const saved = localStorage.getItem('veiled_markets_ids');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        KNOWN_MARKET_IDS = parsed;
        console.log('Loaded', KNOWN_MARKET_IDS.length, 'market IDs from localStorage');
      }
    }
  } catch (e) {
    console.warn('Failed to load market IDs from localStorage:', e);
  }
}

/**
 * Add a new market ID to the known list and persist to localStorage
 */
export function addKnownMarketId(marketId: string): void {
  if (!KNOWN_MARKET_IDS.includes(marketId)) {
    KNOWN_MARKET_IDS.push(marketId);
    // Persist to localStorage
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('veiled_markets_ids', JSON.stringify(KNOWN_MARKET_IDS));
        console.log('Saved market ID to localStorage:', marketId);
      } catch (e) {
        console.warn('Failed to save market IDs to localStorage:', e);
      }
    }
  }
}

/**
 * Question text mapping (temporary - in production would use IPFS/storage)
 * Maps question_hash OR market_id to actual question text
 * Loaded from localStorage
 */
let QUESTION_TEXT_MAP: Record<string, string> = {};

// Load saved question texts from localStorage
if (typeof window !== 'undefined') {
  try {
    const saved = localStorage.getItem('veiled_markets_questions');
    if (saved) {
      QUESTION_TEXT_MAP = JSON.parse(saved);
      console.log('Loaded question texts from localStorage');
    }
  } catch (e) {
    console.warn('Failed to load question texts from localStorage:', e);
  }
}

/**
 * Register question text for a market ID or question hash
 */
export function registerQuestionText(key: string, questionText: string): void {
  QUESTION_TEXT_MAP[key] = questionText;
  // Persist to localStorage
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('veiled_markets_questions', JSON.stringify(QUESTION_TEXT_MAP));
    } catch (e) {
      console.warn('Failed to save question texts to localStorage:', e);
    }
  }
}

/**
 * Transaction ID mapping (for verification links)
 * Maps market_id to creation transaction ID
 * Loaded from localStorage
 */
let MARKET_TX_MAP: Record<string, string> = {};

// Load saved transaction IDs from localStorage
if (typeof window !== 'undefined') {
  try {
    const saved = localStorage.getItem('veiled_markets_txs');
    if (saved) {
      MARKET_TX_MAP = JSON.parse(saved);
      console.log('Loaded transaction IDs from localStorage');
    }
  } catch (e) {
    console.warn('Failed to load transaction IDs from localStorage:', e);
  }
}

/**
 * Register transaction ID for a market
 */
export function registerMarketTransaction(marketId: string, transactionId: string): void {
  MARKET_TX_MAP[marketId] = transactionId;
  // Persist to localStorage
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('veiled_markets_txs', JSON.stringify(MARKET_TX_MAP));
    } catch (e) {
      console.warn('Failed to save transaction IDs to localStorage:', e);
    }
  }
}

/**
 * Load market IDs from indexer service
 * Returns empty array if indexer not available (user will create markets via UI)
 * Also loads question texts from the index
 */
async function loadMarketIdsFromIndexer(): Promise<string[]> {
  try {
    const response = await fetch('/markets-index.json');
    if (!response.ok) {
      console.log('Indexer data not found - markets will be added when created via UI');
      return KNOWN_MARKET_IDS; // Return current list (from localStorage)
    }

    const data = await response.json();
    const marketIds = data.marketIds || [];
    const markets = data.markets || [];

    // Load question texts from indexed markets
    for (const market of markets) {
      if (market.questionText) {
        // Register question text with both marketId and questionHash
        QUESTION_TEXT_MAP[market.marketId] = market.questionText;
        QUESTION_TEXT_MAP[market.questionHash] = market.questionText;
        console.log(`📝 Loaded question text for ${market.marketId.slice(0, 16)}...`);
      }
    }

    // Persist merged question texts to localStorage
    if (typeof window !== 'undefined' && markets.length > 0) {
      try {
        localStorage.setItem('veiled_markets_questions', JSON.stringify(QUESTION_TEXT_MAP));
      } catch (e) {
        console.warn('Failed to save question texts to localStorage:', e);
      }
    }

    if (marketIds.length > 0) {
      console.log(`✅ Loaded ${marketIds.length} markets from indexer`);
      // Merge with existing IDs (in case some were created locally)
      const allIds = new Set([...KNOWN_MARKET_IDS, ...marketIds]);
      return Array.from(allIds);
    }

    return KNOWN_MARKET_IDS;
  } catch (error) {
    console.log('Indexer not available - using locally stored market IDs');
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
  programId: 'veiled_markets_v9.aleo',  // Version 4 (privacy fix)
  deploymentTxId: 'at186jeh868hyrww5hltajpxvt6a2740ge7y6nfs078jfrcueqr8uqqugjtnq',
  network: 'testnet',
  explorerUrl: config.explorerUrl,
  // Real on-chain data - markets are stored in localStorage and fetched from blockchain
  useMockData: false,
};
