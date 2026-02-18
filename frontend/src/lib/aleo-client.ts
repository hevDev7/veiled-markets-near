// ============================================================================
// VEILED MARKETS - Aleo Client Integration
// ============================================================================
// Client for interacting with the deployed veiled_markets_v15.aleo program
// ============================================================================

import { config } from './config';
import { fetchMarketRegistry, isSupabaseAvailable, clearAllSupabaseData } from './supabase';

// Contract constants (matching main.leo v15)
export const MARKET_STATUS = {
  ACTIVE: 1,
  CLOSED: 2,
  RESOLVED: 3,
  CANCELLED: 4,
  PENDING_RESOLUTION: 5,
} as const;

export const OUTCOME = {
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  // Legacy aliases
  YES: 1,
  NO: 2,
} as const;

export const TOKEN_TYPE = {
  ALEO: 1,
  USDCX: 2,
} as const;

export const TOKEN_SYMBOLS: Record<number, string> = {
  1: 'ALEO',
  2: 'USDCX',
};

export const FEES = {
  PROTOCOL_FEE_BPS: 50n,  // 0.5% per trade
  CREATOR_FEE_BPS: 50n,   // 0.5% per trade
  LP_FEE_BPS: 100n,       // 1.0% per trade
  TOTAL_FEE_BPS: 200n,    // 2.0% total
  FEE_DENOMINATOR: 10000n,
};

export const CHALLENGE_WINDOW_BLOCKS = 2880n; // ~12 hours

const CREATE_MARKET_FUNCTIONS = new Set(['create_market', 'create_market_usdcx']);

function isCreateMarketFunction(functionName: unknown): boolean {
  return typeof functionName === 'string' && CREATE_MARKET_FUNCTIONS.has(functionName);
}

export const MIN_TRADE_AMOUNT = 1000n;       // 0.001 tokens
export const MIN_DISPUTE_BOND = 1000000n;    // 1 token
export const MIN_LIQUIDITY = 10000n;         // 0.01 tokens

// Types matching the contract structures (v15)
export interface MarketData {
  id: string;
  creator: string;
  resolver: string;
  question_hash: string;
  category: number;
  num_outcomes: number;     // v12: 2, 3, or 4
  deadline: bigint;
  resolution_deadline: bigint;
  status: number;
  created_at: bigint;
  token_type: number;       // 1=ALEO, 2=USDCX
}

export interface AMMPoolData {
  market_id: string;
  reserve_1: bigint;
  reserve_2: bigint;
  reserve_3: bigint;
  reserve_4: bigint;
  total_liquidity: bigint;
  total_lp_shares: bigint;
  total_volume: bigint;
}

export interface MarketResolutionData {
  market_id: string;
  winning_outcome: number;
  resolver: string;
  resolved_at: bigint;
  challenge_deadline: bigint;  // v12: challenge window
  finalized: boolean;          // v12: finalization flag
}

export interface MarketFeesData {
  market_id: string;
  protocol_fees: bigint;
  creator_fees: bigint;
}

export interface DisputeDataResult {
  market_id: string;
  disputer: string;
  proposed_outcome: number;
  bond_amount: bigint;
  disputed_at: bigint;
}

// Legacy alias
export type MarketPoolData = AMMPoolData;

// API configuration
const API_BASE_URL = config.rpcUrl || 'https://api.explorer.provable.com/v1/testnet';
const PROGRAM_ID = config.programId;

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

// Retry wrapper for flaky API (testnet often returns 522 errors)
async function fetchWithRetry(url: string, maxRetries: number = 3): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(url);
      if (response.ok || response.status === 404) {
        return response;
      }
      // Retry on server errors (5xx)
      if (response.status >= 500) {
        lastError = new Error(`Server error: ${response.status}`);
        if (attempt < maxRetries - 1) {
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
      }
      return response;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries - 1) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }
  throw lastError || new Error('Fetch failed after retries');
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
 * Poll for transaction confirmation and extract market ID.
 * Strategy:
 *   1. If transactionId starts with 'at1', poll the RPC directly.
 *   2. Otherwise (wallet event ID), skip RPC polling and go to blockchain scan.
 *   3. Blockchain scan: scan recent blocks for create_market transitions
 *      matching our questionHash.
 */
export async function waitForMarketCreation(
  transactionId: string,
  questionHash: string,
  questionText: string,
  maxAttempts: number = 20,
  intervalMs: number = 15000,
  programId: string = PROGRAM_ID
): Promise<string | null> {
  console.log('[waitForMarket] Waiting for market creation:', transactionId, '| program:', programId);

  // Strategy 1: If we have an on-chain tx ID, poll the RPC directly
  if (transactionId.startsWith('at1')) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      console.log(`[waitForMarket] RPC poll ${attempt + 1}/${maxAttempts}...`);
      const txDetails = await getTransactionDetails(transactionId);

      if (txDetails?.status === 'confirmed') {
        const marketId = extractMarketIdFromTransaction(txDetails);
        if (marketId) {
          console.log('[waitForMarket] Market created! ID:', marketId);
          addKnownMarketId(marketId);
          registerQuestionText(marketId, questionText);
          registerMarketTransaction(marketId, transactionId);
          registerQuestionText(questionHash, questionText);
          return marketId;
        }
        console.warn('[waitForMarket] TX confirmed but no market ID in outputs');
        return null;
      }

      if (txDetails?.status === 'failed') {
        console.error('[waitForMarket] Transaction failed:', txDetails.error);
        return null;
      }

      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
  }

  // Strategy 2: Blockchain scan — scan recent blocks for our create_market transition.
  // This works for ALL wallets (Shield, Puzzle, Leo, etc.) regardless of event ID format.
  console.log('[waitForMarket] Falling back to blockchain scan for questionHash:', questionHash);

  // Wait for the transaction to be included in a block, then do progressively deeper scans
  // Quick first scan (30 blocks ~7.5 min), then deeper scans with longer delays
  const scanSchedule = [
    { delayMs: 10_000, blocks: 30 },    // After 10s: quick scan of very recent blocks
    { delayMs: 15_000, blocks: 100 },   // After 15s: scan last 100 blocks (~25 min)
    { delayMs: 30_000, blocks: 300 },   // After 30s: scan last 300 blocks (~75 min)
    { delayMs: 45_000, blocks: 500 },   // After 45s: scan last 500 blocks (~2 hours)
    { delayMs: 60_000, blocks: 800 },   // After 60s: scan last 800 blocks (~3 hours)
  ];

  for (let i = 0; i < scanSchedule.length; i++) {
    const { delayMs, blocks } = scanSchedule[i];
    await new Promise(resolve => setTimeout(resolve, delayMs));

    try {
      console.log(`[waitForMarket] Scan attempt ${i + 1}/${scanSchedule.length} (${blocks} blocks)...`);
      const marketId = await scanBlockchainForMarket(questionHash, blocks, programId);
      if (marketId) {
        console.log('[waitForMarket] Found market via blockchain scan! ID:', marketId);
        addKnownMarketId(marketId);
        registerQuestionText(marketId, questionText);
        registerQuestionText(questionHash, questionText);
        return marketId;
      }
    } catch (err) {
      console.warn(`[waitForMarket] Scan attempt ${i + 1} error:`, err);
    }
  }

  console.warn('[waitForMarket] All strategies exhausted');
  return null;
}

/**
 * Scan recent blocks for a create_market transaction matching the given question hash.
 * Looks at the finalize arguments to find the market_id.
 *
 * Uses small parallel batches (3) to avoid API rate limiting, with retries for failed blocks.
 */
async function scanBlockchainForMarket(
  questionHash: string,
  blocksToScan: number = 500,
  programId: string = PROGRAM_ID
): Promise<string | null> {
  try {
    const latestHeight = await getCurrentBlockHeight();
    const startHeight = Number(latestHeight);

    console.log(`[scanBlockchain] Scanning blocks ${startHeight - blocksToScan} to ${startHeight} for hash ${questionHash.slice(0, 20)}...`);

    let scannedCount = 0;
    let failedCount = 0;

    // Scan in parallel batches of 3 blocks (newest first) to avoid API rate limiting
    const BATCH_SIZE = 3;
    for (let offset = 0; offset < blocksToScan; offset += BATCH_SIZE) {
      const heights: number[] = [];
      for (let i = 0; i < BATCH_SIZE && offset + i < blocksToScan; i++) {
        const height = startHeight - offset - i;
        if (height >= 0) heights.push(height);
      }

      const results = await Promise.all(
        heights.map(h => scanBlockForCreateMarketWithRetry(h, questionHash, programId))
      );

      scannedCount += heights.length;
      failedCount += results.filter(r => r === undefined).length; // undefined = failed after retries

      const found = results.find(r => r !== null && r !== undefined);
      if (found) {
        console.log(`[scanBlockchain] Found market after scanning ${scannedCount} blocks (${failedCount} failed)`);
        return found;
      }

      // Delay between batches to avoid API rate limiting
      if (offset + BATCH_SIZE < blocksToScan) {
        await new Promise(r => setTimeout(r, 200));
      }
    }

    console.log(`[scanBlockchain] Not found after ${scannedCount} blocks (${failedCount} blocks failed to fetch)`);
  } catch (err) {
    console.warn('[scanBlockchain] Error:', err);
  }

  return null;
}

/**
 * Scan a single block with 1 retry on failure.
 * Returns: string (market_id) if found, null if scanned but not found, undefined if fetch failed.
 */
async function scanBlockForCreateMarketWithRetry(
  blockHeight: number,
  questionHash: string,
  programId: string = PROGRAM_ID
): Promise<string | null | undefined> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await scanBlockForCreateMarket(blockHeight, questionHash, programId);
      return result; // null (not found) or string (found)
    } catch {
      if (attempt === 0) {
        await new Promise(r => setTimeout(r, 500)); // Brief pause before retry
      }
    }
  }
  return undefined; // Both attempts failed
}

/**
 * Check a single block for a create_market transition matching the question hash.
 * Throws on fetch failure (caller handles retry). Returns null if block was fetched but no match.
 */
async function scanBlockForCreateMarket(
  blockHeight: number,
  questionHash: string,
  programId: string = PROGRAM_ID
): Promise<string | null> {
  const url = `${API_BASE_URL}/block/${blockHeight}`;
  const response = await fetchWithTimeout(url, 10000);
  if (!response.ok) {
    if (response.status === 404) return null; // Block doesn't exist
    throw new Error(`Block ${blockHeight}: HTTP ${response.status}`);
  }

  const block = await response.json();
  const transactions = block.transactions || [];

  for (const txWrapper of transactions) {
    const tx = txWrapper.transaction || txWrapper;
    const transitions = tx.execution?.transitions || [];

    for (const transition of transitions) {
      if (transition.program !== programId || !isCreateMarketFunction(transition.function)) continue;

      // Check the future output for finalize arguments
      for (const output of (transition.outputs || [])) {
        if (output.type !== 'future') continue;

        const value = output.value || '';
        // The finalize arguments are: market_id, creator, question_hash, category, deadline, resolution_deadline, resolver, token_type
        // question_hash is the 3rd argument (index 2)
        const args = extractFinalizeArguments(value);
        if (args.length >= 3) {
          const foundQuestionHash = args[2]; // question_hash
          const foundMarketId = args[0];     // market_id

          if (foundQuestionHash === questionHash && foundMarketId) {
            console.log(`[scanBlock] MATCH at block ${blockHeight}! market_id=${foundMarketId.slice(0, 30)}...`);
            return foundMarketId;
          }
        }
      }
    }
  }
  return null;
}

/**
 * Extract the arguments array from a finalize/future output value.
 * The value looks like: { program_id: ..., function_name: ..., arguments: [arg0, arg1, ...] }
 */
function extractFinalizeArguments(value: string): string[] {
  const args: string[] = [];

  // Find the OUTER arguments array using bracket counting.
  // The old non-greedy regex /([\s\S]*?)\]/ stopped at the FIRST ']' which
  // is the inner child future's bracket (e.g., credits.aleo/transfer_public_as_signer).
  // This caused market_id and question_hash to never be extracted.
  const outerIdx = value.indexOf('arguments:');
  if (outerIdx === -1) return args;

  const bracketStart = value.indexOf('[', outerIdx);
  if (bracketStart === -1) return args;

  // Find matching closing bracket using depth counting
  let depth = 0;
  let bracketEnd = -1;
  for (let i = bracketStart; i < value.length; i++) {
    if (value[i] === '[') depth++;
    else if (value[i] === ']') {
      depth--;
      if (depth === 0) {
        bracketEnd = i;
        break;
      }
    }
  }
  if (bracketEnd === -1) return args;

  const argsContent = value.substring(bracketStart + 1, bracketEnd);

  // Strip nested { } content (child futures) to only extract top-level argument values
  let topLevel = '';
  let braceDepth = 0;
  for (let i = 0; i < argsContent.length; i++) {
    if (argsContent[i] === '{') braceDepth++;
    else if (argsContent[i] === '}') braceDepth--;
    else if (braceDepth === 0) topLevel += argsContent[i];
  }

  // Match field, address, u8, u64, u128 values from top-level arguments only
  const valuePattern = /(\d+field|\d+u\d+|aleo[a-z0-9]+)/g;
  let match;
  while ((match = valuePattern.exec(topLevel)) !== null) {
    args.push(match[1]);
  }

  return args;
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

  // Handle u128
  if (trimmed.endsWith('u128')) {
    const num = trimmed.replace('u128', '');
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
  const response = await fetchWithRetry(`${API_BASE_URL}/latest/height`);
  if (!response.ok) throw new Error(`Failed to fetch block height: ${response.status}`);
  const height = await response.json();
  return BigInt(height);
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

    const response = await fetchWithRetry(url);
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
  const parsedNumOutcomes = parseAleoValue(data.num_outcomes || '2u8');
  const parsedDeadline = parseAleoValue(data.deadline || '0u64');
  const parsedResolutionDeadline = parseAleoValue(data.resolution_deadline || '0u64');
  const parsedStatus = parseAleoValue(data.status || '1u8');
  const parsedCreatedAt = parseAleoValue(data.created_at || '0u64');
  const parsedTokenType = parseAleoValue(data.token_type || '1u8');

  const result = {
    id: data.id || marketId,
    creator: data.creator || '',
    resolver: data.resolver || data.creator || '',
    question_hash: data.question_hash || '',
    category: typeof parsedCategory === 'number' ? parsedCategory : 0,
    num_outcomes: typeof parsedNumOutcomes === 'number' ? parsedNumOutcomes : 2,
    deadline: typeof parsedDeadline === 'bigint' ? parsedDeadline : 0n,
    resolution_deadline: typeof parsedResolutionDeadline === 'bigint' ? parsedResolutionDeadline : 0n,
    status: typeof parsedStatus === 'number' ? parsedStatus : 1,
    created_at: typeof parsedCreatedAt === 'bigint' ? parsedCreatedAt : 0n,
    token_type: typeof parsedTokenType === 'number' ? parsedTokenType : 1,
  };

  console.log('getMarket result:', result);
  return result;
}

/**
 * Fetch AMM pool data (v12 - replaces market_pools)
 */
export async function getAMMPool(marketId: string): Promise<AMMPoolData | null> {
  const data = await getMappingValue<Record<string, string>>('amm_pools', marketId);
  if (!data) return null;

  return {
    market_id: String(data.market_id || marketId),
    reserve_1: BigInt(parseAleoValue(data.reserve_1 || '0u128') as bigint),
    reserve_2: BigInt(parseAleoValue(data.reserve_2 || '0u128') as bigint),
    reserve_3: BigInt(parseAleoValue(data.reserve_3 || '0u128') as bigint),
    reserve_4: BigInt(parseAleoValue(data.reserve_4 || '0u128') as bigint),
    total_liquidity: BigInt(parseAleoValue(data.total_liquidity || '0u128') as bigint),
    total_lp_shares: BigInt(parseAleoValue(data.total_lp_shares || '0u128') as bigint),
    total_volume: BigInt(parseAleoValue(data.total_volume || '0u128') as bigint),
  };
}

// Legacy alias
export const getMarketPool = getAMMPool;

/**
 * Fetch market resolution data (v12 - with challenge window fields)
 */
export async function getMarketResolution(marketId: string): Promise<MarketResolutionData | null> {
  const data = await getMappingValue<Record<string, string>>('market_resolutions', marketId);
  if (!data) return null;

  return {
    market_id: String(data.market_id || marketId),
    winning_outcome: Number(parseAleoValue(data.winning_outcome || '0u8')),
    resolver: String(data.resolver || ''),
    resolved_at: BigInt(parseAleoValue(data.resolved_at || '0u64') as bigint),
    challenge_deadline: BigInt(parseAleoValue(data.challenge_deadline || '0u64') as bigint),
    finalized: String(parseAleoValue(data.finalized || 'false')) === 'true',
  };
}

/**
 * Fetch market fees data (v12 - per-market fee tracking)
 */
export async function getMarketFees(marketId: string): Promise<MarketFeesData | null> {
  const data = await getMappingValue<Record<string, string>>('market_fees', marketId);
  if (!data) return null;

  return {
    market_id: String(data.market_id || marketId),
    protocol_fees: BigInt(parseAleoValue(data.protocol_fees || '0u128') as bigint),
    creator_fees: BigInt(parseAleoValue(data.creator_fees || '0u128') as bigint),
  };
}

/**
 * Fetch dispute data for a market
 */
export async function getMarketDispute(marketId: string): Promise<DisputeDataResult | null> {
  const data = await getMappingValue<Record<string, string>>('market_disputes', marketId);
  if (!data) return null;

  return {
    market_id: String(data.market_id || marketId),
    disputer: String(data.disputer || ''),
    proposed_outcome: Number(parseAleoValue(data.proposed_outcome || '0u8')),
    bond_amount: BigInt(parseAleoValue(data.bond_amount || '0u128') as bigint),
    disputed_at: BigInt(parseAleoValue(data.disputed_at || '0u64') as bigint),
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
 * Generate a random nonce field value (248 bits, safely < field max ~253 bits)
 */
function generateRandomNonce(): string {
  const randomBytes = new Uint8Array(31);
  crypto.getRandomValues(randomBytes);
  let nonce = BigInt(0);
  for (let i = 0; i < randomBytes.length; i++) {
    nonce = (nonce << BigInt(8)) | BigInt(randomBytes[i]);
  }
  return `${nonce}field`;
}

/**
 * Build inputs for create_market transaction (v15)
 * create_market(question_hash, category, num_outcomes, deadline, res_deadline, resolver, initial_liquidity)
 * Token type is determined by function name (create_market vs create_market_usdcx)
 */
export function buildCreateMarketInputs(
  questionHash: string,
  category: number,
  numOutcomes: number,
  deadline: bigint,
  resolutionDeadline: bigint,
  resolverAddress: string,
  tokenType: 'ALEO' | 'USDCX' = 'ALEO',
  initialLiquidity: bigint,
): { functionName: string; inputs: string[] } {
  const inputs = [
    questionHash,
    `${category}u8`,
    `${numOutcomes}u8`,
    `${deadline}u64`,
    `${resolutionDeadline}u64`,
    resolverAddress,
    `${initialLiquidity}u128`,
  ];

  return {
    functionName: tokenType === 'USDCX' ? 'create_market_usdcx' : 'create_market',
    inputs,
  };
}

/**
 * Build inputs for buy_shares (v15 AMM trading)
 * ALEO: buy_shares_private(market_id, outcome, amount_in, expected_shares, min_shares_out, share_nonce, credits_in)
 *   Uses transfer_private_to_public with credits record for privacy.
 * USDCX: buy_shares_usdcx(market_id, outcome, amount_in, expected_shares, min_shares_out, share_nonce)
 *   Uses transfer_public_as_signer (no record needed).
 * Frontend pre-computes expected_shares from AMM formula. Record gets this value.
 * Finalize validates shares_out >= expected_shares.
 */
export function buildBuySharesInputs(
  marketId: string,
  outcome: number,
  amountIn: bigint,
  expectedShares: bigint,
  minSharesOut: bigint,
  tokenType: 'ALEO' | 'USDCX' = 'ALEO',
  creditsRecord?: string,
): { functionName: string; inputs: string[] } {
  const shareNonce = generateRandomNonce();

  const inputs = [
    marketId,
    `${outcome}u8`,
    `${amountIn}u128`,
    `${expectedShares}u128`,
    `${minSharesOut}u128`,
    shareNonce,
  ];

  if (tokenType === 'USDCX') {
    return {
      functionName: 'buy_shares_usdcx',
      inputs,
    };
  }

  // ALEO: buy_shares_private requires credits record
  if (!creditsRecord) {
    throw new Error('Credits record is required for ALEO buy_shares_private. Fetch a record via fetchCreditsRecord() first.');
  }
  inputs.push(creditsRecord);
  return {
    functionName: 'buy_shares_private',
    inputs,
  };
}

/**
 * Build inputs for buy_shares_private (v15 privacy-preserving, ALEO only)
 * Alias for buildBuySharesInputs with tokenType='ALEO'.
 */
export function buildBuySharesPrivateInputs(
  marketId: string,
  outcome: number,
  amountIn: bigint,
  expectedShares: bigint,
  minSharesOut: bigint,
  creditsRecord: string,
): { functionName: string; inputs: string[] } {
  return buildBuySharesInputs(marketId, outcome, amountIn, expectedShares, minSharesOut, 'ALEO', creditsRecord);
}

/**
 * Build inputs for sell_shares (v15 tokens_desired approach)
 * sell_shares(shares: OutcomeShare, tokens_desired, max_shares_used)
 * User specifies how many tokens to withdraw. Contract computes shares needed.
 * Transition calls credits.aleo/transfer_public for the net payout.
 */
export function buildSellSharesInputs(
  sharesRecord: string,
  tokensDesired: bigint,
  maxSharesUsed: bigint,
  tokenType: 'ALEO' | 'USDCX' = 'ALEO',
): { functionName: string; inputs: string[] } {
  const inputs = [
    sharesRecord,
    `${tokensDesired}u128`,
    `${maxSharesUsed}u128`,
  ];

  return {
    functionName: tokenType === 'USDCX' ? 'sell_shares_usdcx' : 'sell_shares',
    inputs,
  };
}

/**
 * Build inputs for add_liquidity (v15 LP provision)
 * add_liquidity(market_id, amount, expected_lp_shares, lp_nonce)
 * Frontend pre-computes expected_lp_shares. LPToken record gets this value.
 */
export function buildAddLiquidityInputs(
  marketId: string,
  amount: bigint,
  expectedLpShares: bigint,
  tokenType: 'ALEO' | 'USDCX' = 'ALEO',
): { functionName: string; inputs: string[] } {
  const lpNonce = generateRandomNonce();

  const inputs = [
    marketId,
    `${amount}u128`,
    `${expectedLpShares}u128`,
    lpNonce,
  ];

  return {
    functionName: tokenType === 'USDCX' ? 'add_liquidity_usdcx' : 'add_liquidity',
    inputs,
  };
}

/**
 * Build inputs for remove_liquidity (v15 LP withdrawal)
 * remove_liquidity(lp_token: LPToken, shares_to_remove, min_tokens_out)
 */
export function buildRemoveLiquidityInputs(
  lpTokenRecord: string,
  sharesToRemove: bigint,
  minTokensOut: bigint,
  tokenType: 'ALEO' | 'USDCX' = 'ALEO',
): { functionName: string; inputs: string[] } {
  const inputs = [
    lpTokenRecord,
    `${sharesToRemove}u128`,
    `${minTokensOut}u128`,
  ];

  return {
    functionName: tokenType === 'USDCX' ? 'remove_liquidity_usdcx' : 'remove_liquidity',
    inputs,
  };
}

/**
 * Build inputs for dispute_resolution (v15 - bond always in ALEO)
 * dispute_resolution(market_id, proposed_outcome, dispute_nonce)
 * Dispute bond uses credits.aleo/transfer_public_as_signer regardless of market token type.
 */
export function buildDisputeResolutionInputs(
  marketId: string,
  proposedOutcome: number,
): { functionName: string; inputs: string[] } {
  const disputeNonce = generateRandomNonce();

  const inputs = [
    marketId,
    `${proposedOutcome}u8`,
    disputeNonce,
  ];

  return {
    functionName: 'dispute_resolution',
    inputs,
  };
}

// Legacy aliases for backward compatibility
export function buildPlaceBetInputs(
  marketId: string,
  amount: bigint,
  outcome: 'yes' | 'no',
  expectedShares: bigint = 0n,
  tokenType: 'ALEO' | 'USDCX' = 'ALEO',
  creditsRecord?: string,
): { functionName: string; inputs: string[] } {
  return buildBuySharesInputs(marketId, outcome === 'yes' ? 1 : 2, amount, expectedShares, 0n, tokenType, creditsRecord);
}

export function buildPlaceBetPrivateInputs(
  marketId: string,
  amount: bigint,
  outcome: 'yes' | 'no',
  expectedShares: bigint,
  creditsRecord: string,
): { functionName: string; inputs: string[] } {
  return buildBuySharesInputs(marketId, outcome === 'yes' ? 1 : 2, amount, expectedShares, 0n, 'ALEO', creditsRecord);
}

/**
 * Calculate outcome price from AMM pool (v15 FPMM)
 * For FPMM: price_i = product(r_j for j!=i) / sum_of_products
 * Binary simplification: price_i = r_other / (r1 + r2)
 */
export function calculateOutcomePrice(pool: AMMPoolData, outcome: number): number {
  const reserves = [pool.reserve_1, pool.reserve_2, pool.reserve_3, pool.reserve_4];
  // Determine active reserves (non-zero or first 2 for binary)
  const numOutcomes = pool.reserve_3 > 0n ? (pool.reserve_4 > 0n ? 4 : 3) : 2;
  const active = reserves.slice(0, numOutcomes);
  const total = active.reduce((a, b) => a + b, 0n);
  if (total === 0n) return 50;

  if (numOutcomes === 2) {
    // Binary: price_i = r_other / total
    const idx = outcome - 1;
    const otherIdx = idx === 0 ? 1 : 0;
    return Number((active[otherIdx] * 10000n) / total) / 100;
  }

  // N-outcome: price_i = product(r_j, j!=i) / sum(product(r_j, j!=k) for each k)
  const products: bigint[] = [];
  for (let k = 0; k < numOutcomes; k++) {
    let prod = 1n;
    for (let j = 0; j < numOutcomes; j++) {
      if (j !== k) prod = prod * active[j];
    }
    products.push(prod);
  }
  const sumProducts = products.reduce((a, b) => a + b, 0n);
  if (sumProducts === 0n) return 100 / numOutcomes;
  const idx = outcome - 1;
  return Number((products[idx] * 10000n) / sumProducts) / 100;
}

// Legacy aliases
export function calculateYesProbability(yesPool: bigint, noPool: bigint): number {
  const total = yesPool + noPool;
  if (total === 0n) return 50;
  return Number((yesPool * 10000n) / total) / 100;
}

export function calculatePotentialPayout(
  betOnYes: boolean,
  yesPool: bigint,
  noPool: bigint
): number {
  // In v12 AMM model, winning shares redeem 1:1.
  // This legacy function returns a rough multiplier.
  const totalPool = yesPool + noPool;
  const winningPool = betOnYes ? yesPool : noPool;
  if (winningPool === 0n) return 0;
  const grossMultiplier = Number(totalPool * 10000n / winningPool) / 10000;
  const feeMultiplier = Number(FEES.FEE_DENOMINATOR - FEES.TOTAL_FEE_BPS) / Number(FEES.FEE_DENOMINATOR);
  return grossMultiplier * feeMultiplier;
}

/**
 * Build Commitment struct input string for reveal_bet
 * Format: "{ hash: Xfield, nonce: Xfield, market_id: Xfield, bettor: aleoX, committed_at: 0u64 }"
 * committed_at is 0u64 because the transition value is always 0 (finalize updates it)
 * reveal_bet doesn't check committed_at
 */
export function buildCommitmentStructInput(
  hash: string,
  nonce: string,
  marketId: string,
  bettor: string,
): string {
  return `{ hash: ${hash}, nonce: ${nonce}, market_id: ${marketId}, bettor: ${bettor}, committed_at: 0u64 }`;
}

/**
 * Verify a commitment exists on-chain by checking the bet_commitments mapping
 */
export async function verifyCommitmentOnChain(commitmentHash: string): Promise<boolean> {
  try {
    const data = await getMappingValue<any>('bet_commitments', commitmentHash);
    return data !== null;
  } catch {
    return false;
  }
}

/**
 * Build inputs for close_market transaction
 */
export function buildCloseMarketInputs(marketId: string): string[] {
  return [marketId];
}

/**
 * Build inputs for resolve_market transaction (v12 - multi-outcome)
 */
export function buildResolveMarketInputs(
  marketId: string,
  winningOutcome: number | 'yes' | 'no',
): string[] {
  // Support legacy 'yes'/'no' strings and numeric outcomes
  const outcomeNum = typeof winningOutcome === 'string'
    ? (winningOutcome === 'yes' ? 1 : 2)
    : winningOutcome;
  return [
    marketId,
    `${outcomeNum}u8`,
  ];
}

/**
 * Build inputs for finalize_resolution (v12 - after challenge window)
 */
export function buildFinalizeResolutionInputs(marketId: string): string[] {
  return [marketId];
}

/**
 * Build inputs for withdraw_creator_fees (v15)
 * withdraw_creator_fees(market_id, expected_amount) — ALEO
 * withdraw_fees_usdcx(market_id, expected_amount) — USDCX
 * Transition calls transfer_public with expected_amount, finalize validates.
 */
export function buildWithdrawCreatorFeesInputs(
  marketId: string,
  expectedAmount: bigint,
  tokenType: 'ALEO' | 'USDCX' = 'ALEO',
): { functionName: string; inputs: string[] } {
  return {
    functionName: tokenType === 'USDCX' ? 'withdraw_fees_usdcx' : 'withdraw_creator_fees',
    inputs: [marketId, `${expectedAmount}u128`],
  };
}

/**
 * Build inputs for cancel_market transaction
 */
export function buildCancelMarketInputs(marketId: string): string[] {
  return [marketId];
}

/**
 * Build inputs for emergency_cancel transaction (v15)
 * Anyone can call this for markets past resolution_deadline that aren't resolved/cancelled.
 */
export function buildEmergencyCancelInputs(marketId: string): string[] {
  return [marketId];
}

/**
 * Format block height to approximate date
 */
export function blockHeightToDate(blockHeight: bigint, currentHeight: bigint): Date {
  const blocksRemaining = Number(blockHeight - currentHeight);
  const msRemaining = blocksRemaining * config.msPerBlock;
  return new Date(Date.now() + msRemaining);
}

/**
 * Format time remaining from block height
 */
export function formatTimeRemaining(deadlineBlock: bigint, currentBlock: bigint): string {
  const blocksRemaining = Number(deadlineBlock - currentBlock);
  if (blocksRemaining <= 0) return 'Ended';

  const secondsRemaining = blocksRemaining * config.secondsPerBlock;
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
 * Look up a transaction on-chain and check if it was rejected (finalize failed).
 * Returns diagnostic info for failed transactions.
 */
export async function diagnoseTransaction(txId: string): Promise<{
  found: boolean;
  status: 'accepted' | 'rejected' | 'unknown';
  type?: string;
  functions?: string[];
  message?: string;
}> {
  if (!txId.startsWith('at1')) {
    return { found: false, status: 'unknown', message: 'Not an on-chain transaction ID (UUID from wallet)' };
  }
  try {
    const resp = await fetch(`${config.rpcUrl}/transaction/${txId}`);
    if (!resp.ok) {
      return { found: false, status: 'unknown', message: `API returned ${resp.status}` };
    }
    const data = await resp.json();
    const txType = data?.type;

    // Check for rejected status — Aleo marks failed finalize as "rejected" type
    if (txType === 'rejected') {
      const functions: string[] = [];
      const transitions = data?.execution?.transitions || [];
      for (const t of transitions) {
        if (t.program && t.function) functions.push(`${t.program}/${t.function}`);
      }
      return {
        found: true,
        status: 'rejected',
        type: txType,
        functions,
        message: 'Transaction was included on-chain but finalize ABORTED. ' +
          'Most likely cause: transfer_public_as_signer failed (insufficient public balance after fee deduction).',
      };
    }

    if (txType === 'execute') {
      return { found: true, status: 'accepted', type: txType };
    }

    return { found: true, status: 'unknown', type: txType };
  } catch (err) {
    return { found: false, status: 'unknown', message: String(err) };
  }
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
 * Resolve a market from a known on-chain transaction ID.
 * Fetches the TX, extracts market_id from the future output, registers everything.
 * Returns the market_id or null.
 */
export async function resolveMarketFromTransaction(
  transactionId: string,
  questionText?: string,
): Promise<string | null> {
  if (!transactionId.startsWith('at1')) return null;

  try {
    const url = `${API_BASE_URL}/transaction/${transactionId}`;
    const response = await fetchWithRetry(url);
    if (!response.ok) return null;

    const data = await response.json();
    const transitions = data.execution?.transitions || [];

    for (const transition of transitions) {
      if (transition.program !== PROGRAM_ID || !isCreateMarketFunction(transition.function)) continue;

      for (const output of (transition.outputs || [])) {
        if (output.type !== 'future') continue;

        const args = extractFinalizeArguments(output.value || '');
        if (args.length >= 3) {
          const marketId = args[0];
          const questionHash = args[2];

          if (marketId) {
            console.log('[resolveFromTx] Found market_id:', marketId.slice(0, 30) + '...');
            addKnownMarketId(marketId);
            if (questionText) {
              registerQuestionText(marketId, questionText);
              registerQuestionText(questionHash, questionText);
            }
            registerMarketTransaction(marketId, transactionId);
            return marketId;
          }
        }
      }
    }
  } catch (err) {
    console.warn('[resolveFromTx] Error:', err);
  }

  return null;
}

// ============================================================================
// PENDING MARKETS — Auto-resolve on Dashboard load
// ============================================================================
// When a market is created via wallet, the market ID isn't known immediately.
// We save the question hash + tx ID as "pending". On next page load,
// the Dashboard resolves pending markets via blockchain scan.
// ============================================================================

interface PendingMarket {
  questionHash: string
  questionText: string
  transactionId: string   // wallet event ID (shield_, UUID, or at1...)
  createdAt: number
}

export function savePendingMarket(pending: PendingMarket): void {
  if (typeof window === 'undefined') return
  try {
    const saved = localStorage.getItem('veiled_markets_pending')
    const list: PendingMarket[] = saved ? JSON.parse(saved) : []
    // Avoid duplicates by question hash
    if (!list.some(p => p.questionHash === pending.questionHash)) {
      list.push(pending)
      localStorage.setItem('veiled_markets_pending', JSON.stringify(list))
      console.log('[Pending] Saved pending market:', pending.questionHash.slice(0, 20) + '...')
    }
  } catch (e) {
    console.warn('[Pending] Failed to save:', e)
  }
}

function removePendingMarket(questionHash: string): void {
  if (typeof window === 'undefined') return
  try {
    const saved = localStorage.getItem('veiled_markets_pending')
    if (!saved) return
    const list: PendingMarket[] = JSON.parse(saved)
    const filtered = list.filter(p => p.questionHash !== questionHash)
    localStorage.setItem('veiled_markets_pending', JSON.stringify(filtered))
  } catch { /* ignore */ }
}

/**
 * Update a pending market's transaction ID (e.g., when wallet polling resolves the at1... ID).
 * This allows resolvePendingMarkets to use resolveMarketFromTransaction directly.
 */
export function updatePendingMarketTxId(questionHash: string, resolvedTxId: string): void {
  if (typeof window === 'undefined') return
  try {
    const saved = localStorage.getItem('veiled_markets_pending')
    if (!saved) return
    const list: PendingMarket[] = JSON.parse(saved)
    const entry = list.find(p => p.questionHash === questionHash)
    if (entry && !entry.transactionId.startsWith('at1') && resolvedTxId.startsWith('at1')) {
      entry.transactionId = resolvedTxId
      localStorage.setItem('veiled_markets_pending', JSON.stringify(list))
      console.log('[Pending] Updated TX ID:', questionHash.slice(0, 20), '→', resolvedTxId.slice(0, 20))
    }
  } catch { /* ignore */ }
}

/**
 * Clear all pending markets (used when switching program versions)
 */
export function clearPendingMarkets(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem('veiled_markets_pending')
}

/**
 * Clear ALL stale data from localStorage and Supabase.
 * Used when upgrading to a new program version (e.g., v12 → v13).
 * Clears: pending markets, cached market IDs, question texts, TX mappings,
 * and all Supabase tables (market_registry, user_bets, pending_bets, commitment_records).
 */
export async function clearAllStaleData(): Promise<string> {
  const cleared: string[] = []

  // Clear localStorage
  if (typeof window !== 'undefined') {
    const keys = [
      'veiled_markets_pending',
      'veiled_markets_ids',
      'veiled_markets_questions',
      'veiled_markets_txs',
    ]
    for (const key of keys) {
      if (localStorage.getItem(key)) {
        localStorage.removeItem(key)
        cleared.push(`localStorage:${key}`)
      }
    }
  }

  // Clear in-memory caches
  KNOWN_MARKET_IDS = []
  Object.keys(QUESTION_TEXT_MAP).forEach(k => delete QUESTION_TEXT_MAP[k])
  Object.keys(MARKET_TX_MAP).forEach(k => delete MARKET_TX_MAP[k])
  Object.keys(MARKET_METADATA_MAP).forEach(k => delete MARKET_METADATA_MAP[k])
  cleared.push('in-memory caches')

  // Clear Supabase
  const { deleted, errors } = await clearAllSupabaseData()
  cleared.push(...deleted.map(t => `supabase:${t}`))

  const summary = `Cleared: ${cleared.join(', ')}${errors.length > 0 ? `. Errors: ${errors.join(', ')}` : ''}`
  console.log('[ClearStaleData]', summary)
  return summary
}

/**
 * Check if there are any pending markets waiting for resolution
 */
export function hasPendingMarkets(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const saved = localStorage.getItem('veiled_markets_pending')
    if (!saved) return false
    const list: PendingMarket[] = JSON.parse(saved)
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000 // 7 days
    return list.some(p => p.createdAt > cutoff)
  } catch {
    return false
  }
}

/**
 * Get count and details of pending markets
 */
export function getPendingMarketsInfo(): { count: number; questions: string[] } {
  if (typeof window === 'undefined') return { count: 0, questions: [] }
  try {
    const saved = localStorage.getItem('veiled_markets_pending')
    if (!saved) return { count: 0, questions: [] }
    const list: PendingMarket[] = JSON.parse(saved)
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000 // 7 days
    const active = list.filter(p => p.createdAt > cutoff)
    return {
      count: active.length,
      questions: active.map(p => p.questionText),
    }
  } catch {
    return { count: 0, questions: [] }
  }
}

/**
 * Resolve all pending markets via blockchain scan.
 * Called on Dashboard load and periodically. Returns resolved market IDs.
 */
export async function resolvePendingMarkets(): Promise<string[]> {
  if (typeof window === 'undefined') return []
  try {
    const saved = localStorage.getItem('veiled_markets_pending')
    if (!saved) return []
    const list: PendingMarket[] = JSON.parse(saved)
    if (list.length === 0) return []

    // Remove entries older than 7 days (likely failed)
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
    const active = list.filter(p => p.createdAt > cutoff)
    if (active.length !== list.length) {
      localStorage.setItem('veiled_markets_pending', JSON.stringify(active))
    }
    if (active.length === 0) return []

    console.log(`[Pending] Resolving ${active.length} pending market(s)...`)
    const resolved: string[] = []

    for (const pending of active) {
      try {
        // First: if pending already has an on-chain tx ID, resolve directly from tx.
        // This is faster and more reliable than block scanning.
        let marketId: string | null = null
        if (pending.transactionId.startsWith('at1')) {
          marketId = await resolveMarketFromTransaction(pending.transactionId, pending.questionText)
        }

        // Fallback: blockchain scan by question hash.
        if (!marketId) {
          // Use deeper scan for older pending markets
          const ageMs = Date.now() - pending.createdAt
          const blocksToScan = Math.min(2000, Math.max(500, Math.floor(ageMs / config.msPerBlock) + 200))
          marketId = await scanBlockchainForMarket(pending.questionHash, blocksToScan)
        }

        if (marketId) {
          console.log('[Pending] Resolved:', pending.questionHash.slice(0, 20), '→', marketId.slice(0, 20))
          addKnownMarketId(marketId)
          registerQuestionText(marketId, pending.questionText)
          registerQuestionText(pending.questionHash, pending.questionText)
          removePendingMarket(pending.questionHash)
          resolved.push(marketId)

          // Update Supabase: register with real market ID and clean up pending entry
          try {
            const supabaseMod = await import('./supabase')
            if (supabaseMod.isSupabaseAvailable()) {
              // Register with real market ID
              await supabaseMod.registerMarketInRegistry({
                market_id: marketId,
                question_hash: pending.questionHash,
                question_text: pending.questionText,
                category: 0, // Unknown from pending context
                creator_address: '',
                transaction_id: pending.transactionId,
                created_at: pending.createdAt,
              })
              // Delete stale pending_ entry if it exists
              if (supabaseMod.supabase) {
                await supabaseMod.supabase.from('market_registry')
                  .delete()
                  .like('market_id', 'pending_%')
                  .eq('question_hash', pending.questionHash)
              }
            }
          } catch { /* ignore Supabase errors */ }
        }
      } catch (err) {
        console.warn('[Pending] Failed to resolve:', pending.questionHash.slice(0, 20), err)
      }
    }

    return resolved
  } catch (e) {
    console.warn('[Pending] Failed to load pending markets:', e)
    return []
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
      const questionText = market.questionText || market.question;
      const marketId = market.marketId || market.id;
      if (questionText && marketId) {
        // Register question text with both marketId and questionHash
        QUESTION_TEXT_MAP[marketId] = questionText;
        if (market.questionHash) {
          QUESTION_TEXT_MAP[market.questionHash] = questionText;
        }
        console.log(`Loaded question text for ${marketId.slice(0, 16)}...`);
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
 * Market metadata (description + resolution source) from Supabase registry.
 * Maps market_id to { description, resolutionSource }
 */
let MARKET_METADATA_MAP: Record<string, { description?: string; resolutionSource?: string }> = {};

/**
 * Get market description from registry
 */
export function getMarketDescription(marketId: string): string | null {
  return MARKET_METADATA_MAP[marketId]?.description || null;
}

/**
 * Get market resolution source from registry
 */
export function getMarketResolutionSource(marketId: string): string | null {
  return MARKET_METADATA_MAP[marketId]?.resolutionSource || null;
}

/**
 * Load market registry from Supabase (shared across all users/devices).
 * Also populates question text and transaction ID maps.
 */
async function loadMarketIdsFromSupabase(): Promise<string[]> {
  if (!isSupabaseAvailable()) return [];
  try {
    const entries = await fetchMarketRegistry();
    if (entries.length === 0) return [];

    const ids: string[] = [];
    for (const entry of entries) {
      // Skip pending entries — they have placeholder IDs like "pending_shield_xxx"
      // that will fail when fetched from blockchain
      if (entry.market_id.startsWith('pending_')) continue;
      ids.push(entry.market_id);
      // Populate question text mappings
      if (entry.question_text) {
        QUESTION_TEXT_MAP[entry.market_id] = entry.question_text;
        if (entry.question_hash) {
          QUESTION_TEXT_MAP[entry.question_hash] = entry.question_text;
        }
      }
      // Populate transaction ID mappings
      if (entry.transaction_id) {
        MARKET_TX_MAP[entry.market_id] = entry.transaction_id;
      }
      // Populate metadata (description + resolution source)
      if (entry.description || entry.resolution_source) {
        MARKET_METADATA_MAP[entry.market_id] = {
          description: entry.description || undefined,
          resolutionSource: entry.resolution_source || undefined,
        };
      }
    }

    console.log(`[Supabase] Loaded ${ids.length} markets from registry`);
    return ids;
  } catch (error) {
    console.warn('[Supabase] Failed to load market registry:', error);
    return [];
  }
}

/**
 * Initialize market IDs (call this on app startup).
 * Merges from 3 sources: localStorage, markets-index.json, and Supabase.
 */
export async function initializeMarketIds(): Promise<void> {
  // Fetch from both sources in parallel
  const [indexedIds, supabaseIds] = await Promise.all([
    loadMarketIdsFromIndexer(),
    loadMarketIdsFromSupabase(),
  ]);

  // Merge all sources: localStorage (already in KNOWN_MARKET_IDS), index file, Supabase
  const allIds = new Set([...KNOWN_MARKET_IDS, ...indexedIds, ...supabaseIds]);
  KNOWN_MARKET_IDS = Array.from(allIds);

  // Persist merged question texts to localStorage
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('veiled_markets_questions', JSON.stringify(QUESTION_TEXT_MAP));
      localStorage.setItem('veiled_markets_txs', JSON.stringify(MARKET_TX_MAP));
      localStorage.setItem('veiled_markets_ids', JSON.stringify(KNOWN_MARKET_IDS));
    } catch (e) {
      console.warn('Failed to persist merged data to localStorage:', e);
    }
  }

  console.log(`[Markets] Initialized ${KNOWN_MARKET_IDS.length} total markets`);
}

/**
 * Outcome labels mapping
 * Maps question_hash (or market_id) to array of custom outcome labels
 * Loaded from localStorage
 */
let OUTCOME_LABELS_MAP: Record<string, string[]> = {};

// Load saved outcome labels from localStorage
if (typeof window !== 'undefined') {
  try {
    const saved = localStorage.getItem('veiled_markets_outcome_labels');
    if (saved) {
      OUTCOME_LABELS_MAP = JSON.parse(saved);
      console.log('Loaded outcome labels from localStorage');
    }
  } catch (e) {
    console.warn('Failed to load outcome labels from localStorage:', e);
  }
}

/**
 * Register outcome labels for a market (keyed by question hash or market ID)
 */
export function registerOutcomeLabels(key: string, labels: string[]): void {
  const filtered = labels.filter(l => l.trim().length > 0);
  if (filtered.length === 0) return;
  OUTCOME_LABELS_MAP[key] = filtered;
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('veiled_markets_outcome_labels', JSON.stringify(OUTCOME_LABELS_MAP));
    } catch (e) {
      console.warn('Failed to save outcome labels to localStorage:', e);
    }
  }
}

/**
 * Get outcome labels for a market (by question hash or market ID)
 */
export function getOutcomeLabels(key: string): string[] | null {
  return OUTCOME_LABELS_MAP[key] || null;
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

/**
 * Get the correct redeem/refund function name based on token type (v15)
 */
export function getRedeemFunction(tokenType?: 'ALEO' | 'USDCX'): string {
  return tokenType === 'USDCX' ? 'redeem_shares_usdcx' : 'redeem_shares';
}

export function getRefundFunction(tokenType?: 'ALEO' | 'USDCX'): string {
  return tokenType === 'USDCX' ? 'claim_refund_usdcx' : 'claim_refund';
}

export function getLpRefundFunction(tokenType?: 'ALEO' | 'USDCX'): string {
  return tokenType === 'USDCX' ? 'claim_lp_refund_usdcx' : 'claim_lp_refund';
}

/**
 * Build inputs for claim_lp_refund (v15 - LP refund on cancelled market)
 * claim_lp_refund(lp_token: LPToken, min_tokens_out)
 */
export function buildClaimLpRefundInputs(
  lpTokenRecord: string,
  minTokensOut: bigint,
  tokenType: 'ALEO' | 'USDCX' = 'ALEO',
): { functionName: string; inputs: string[] } {
  return {
    functionName: getLpRefundFunction(tokenType),
    inputs: [lpTokenRecord, `${minTokensOut}u128`],
  };
}

// Legacy alias
export const getWithdrawFunction = getRedeemFunction;

// Export a singleton instance info
export const CONTRACT_INFO = {
  programId: config.programId,
  usdcxProgramId: config.usdcxProgramId,
  network: 'testnet',
  explorerUrl: config.explorerUrl,
  useMockData: false,
};
