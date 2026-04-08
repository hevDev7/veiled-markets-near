// ============================================================================
// VEILED MARKETS - Blockchain Indexer Service
// ============================================================================
// Scans the Aleo testnet for markets created across all three market programs
// (ALEO, USDCX, USAD) by walking recent blocks and extracting market IDs
// from `create_market*` transition outputs. Discovered markets are merged
// with the Supabase `market_registry` cache (write-through), and the union
// is exposed as a static JSON file for the frontend bootstrap path.
//
// Discovery flow:
//   1. Read last_indexed_block from local checkpoint file
//   2. Walk forward block-by-block (capped per run) and inspect each tx
//   3. For every transition matching `create_market*`, parse outputs and
//      pull the field-typed market_id + creator/category/deadlines
//   4. Upsert new entries into Supabase `market_registry` (best-effort)
//   5. Persist a fresh markets-index.json snapshot
//
// All steps are best-effort: explorer rate-limits, malformed outputs, and
// missing optional fields fall back to safe defaults so the indexer never
// blocks on a single bad transition.
// ============================================================================

import * as fs from 'fs';
import * as path from 'path';
import { config } from './config.js';

export interface IndexedMarket {
    marketId: string;
    transactionId: string;
    creator: string;
    questionHash: string;
    category: number;
    deadline: string;
    resolutionDeadline: string;
    createdAt: number;
    blockHeight: number;
    programId: string;
}

const CHECKPOINT_PATH = path.join(process.cwd(), 'public', 'indexer-checkpoint.json');
const SNAPSHOT_PATH = path.join(process.cwd(), 'public', 'markets-index.json');
const MAX_BLOCKS_PER_RUN = Number(process.env.INDEXER_BLOCKS_PER_RUN || 500);
const REQUEST_RETRY_DELAY_MS = 750;
const REQUEST_RETRIES = 3;

const MARKET_PROGRAMS = [
    process.env.VITE_PROGRAM_ID || 'veiled_markets_v37.aleo',
    process.env.VITE_USDCX_MARKET_PROGRAM_ID || 'veiled_markets_usdcx_v7.aleo',
    process.env.VITE_USAD_PROGRAM_ID || 'veiled_markets_usad_v14.aleo',
];

const CREATE_MARKET_FUNCTIONS = new Set([
    'create_market',
    'create_market_usdcx',
    'create_market_usad',
]);

interface BlockTransition {
    program?: string;
    function?: string;
    inputs?: Array<{ type?: string; value?: string }>;
    outputs?: Array<{ type?: string; value?: string }>;
}

interface BlockTransaction {
    transaction?: {
        id?: string;
        type?: string;
        execution?: { transitions?: BlockTransition[] };
    };
}

interface ExplorerBlock {
    block_hash?: string;
    header?: { metadata?: { height?: number; timestamp?: number } };
    transactions?: BlockTransaction[];
}

// ---- HTTP helpers ----------------------------------------------------------

async function fetchJson<T = unknown>(url: string): Promise<T | null> {
    for (let attempt = 0; attempt < REQUEST_RETRIES; attempt++) {
        try {
            const response = await fetch(url, {
                headers: { Accept: 'application/json' },
            });
            if (response.status === 404) return null;
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            return (await response.json()) as T;
        } catch (error) {
            if (attempt === REQUEST_RETRIES - 1) {
                console.warn(`[Indexer] fetch failed for ${url}:`, error);
                return null;
            }
            await new Promise(r => setTimeout(r, REQUEST_RETRY_DELAY_MS * (attempt + 1)));
        }
    }
    return null;
}

async function getLatestBlockHeight(): Promise<number> {
    const value = await fetchJson<number | string>(`${config.rpcUrl}/block/height/latest`);
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return parseInt(value, 10) || 0;
    return 0;
}

async function getBlockByHeight(height: number): Promise<ExplorerBlock | null> {
    return fetchJson<ExplorerBlock>(`${config.rpcUrl}/block/${height}`);
}

// ---- Checkpoint helpers ----------------------------------------------------

interface Checkpoint {
    lastIndexedBlock: number;
    updatedAt: string;
}

function loadCheckpoint(): Checkpoint {
    try {
        if (fs.existsSync(CHECKPOINT_PATH)) {
            const data = JSON.parse(fs.readFileSync(CHECKPOINT_PATH, 'utf-8'));
            if (typeof data.lastIndexedBlock === 'number') return data;
        }
    } catch (error) {
        console.warn('[Indexer] Failed to load checkpoint:', error);
    }
    // Default starting point: configurable via env, otherwise scan recent window
    const fallback = Number(process.env.INDEXER_START_BLOCK || 0);
    return { lastIndexedBlock: fallback, updatedAt: new Date().toISOString() };
}

function saveCheckpoint(height: number): void {
    const publicDir = path.dirname(CHECKPOINT_PATH);
    if (!fs.existsSync(publicDir)) {
        fs.mkdirSync(publicDir, { recursive: true });
    }
    fs.writeFileSync(
        CHECKPOINT_PATH,
        JSON.stringify({ lastIndexedBlock: height, updatedAt: new Date().toISOString() }, null, 2),
    );
}

// ---- Snapshot helpers ------------------------------------------------------

function loadExistingSnapshot(): IndexedMarket[] {
    try {
        if (fs.existsSync(SNAPSHOT_PATH)) {
            const data = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf-8'));
            if (Array.isArray(data.markets)) return data.markets;
        }
    } catch (error) {
        console.warn('[Indexer] Failed to load existing snapshot:', error);
    }
    return [];
}

function dedupeMarkets(markets: IndexedMarket[]): IndexedMarket[] {
    const seen = new Map<string, IndexedMarket>();
    for (const market of markets) {
        if (!seen.has(market.marketId)) seen.set(market.marketId, market);
    }
    return Array.from(seen.values());
}

// ---- Transition parsing ----------------------------------------------------

function stripTypeSuffix(value: string): string {
    return value.replace(/[._]?(field|u8|u64|u128|address|public|private)$/g, '').trim();
}

function extractFieldValue(raw?: string): string | null {
    if (!raw) return null;
    const trimmed = raw.trim();
    const match = trimmed.match(/(\d+)(?:field)?/);
    return match ? `${match[1]}field` : null;
}

function extractCreateMarketEntry(
    transition: BlockTransition,
    txId: string,
    blockHeight: number,
    blockTimestamp: number,
): IndexedMarket | null {
    if (!transition.program || !MARKET_PROGRAMS.includes(transition.program)) return null;
    if (!transition.function || !CREATE_MARKET_FUNCTIONS.has(transition.function)) return null;

    // create_market output[0] is the market_id field
    const outputs = transition.outputs || [];
    const inputs = transition.inputs || [];

    const idOutput = outputs.find(o => o?.type?.includes('field') || o?.value?.includes('field'));
    const marketId = extractFieldValue(idOutput?.value);
    if (!marketId) return null;

    // Inputs (matching create_market signature):
    //   0 question_hash, 1 category, 2 num_outcomes, 3 deadline,
    //   4 resolution_deadline, 5 resolver, 6 creator_owner, 7 initial_liquidity
    const questionHash = extractFieldValue(inputs[0]?.value) || '0field';
    const category = parseInt(stripTypeSuffix(inputs[1]?.value || '0'), 10) || 0;
    const deadline = stripTypeSuffix(inputs[3]?.value || '0');
    const resolutionDeadline = stripTypeSuffix(inputs[4]?.value || '0');
    const creator = (inputs[6]?.value || '').trim() || 'unknown';

    return {
        marketId,
        transactionId: txId,
        creator,
        questionHash,
        category,
        deadline: `${deadline}u64`,
        resolutionDeadline: `${resolutionDeadline}u64`,
        createdAt: blockTimestamp ? blockTimestamp * 1000 : Date.now(),
        blockHeight,
        programId: transition.program,
    };
}

// ---- Supabase write-through (best effort) ----------------------------------

async function upsertMarketRegistry(markets: IndexedMarket[]): Promise<void> {
    const url = process.env.VITE_SUPABASE_URL;
    const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !anonKey || markets.length === 0) return;

    const rows = markets.map(market => ({
        market_id: market.marketId,
        question_hash: market.questionHash,
        question_text: '',
        category: market.category,
        creator_address: market.creator,
        transaction_id: market.transactionId,
        created_at: market.createdAt,
    }));

    try {
        const response = await fetch(`${url}/rest/v1/market_registry?on_conflict=market_id`, {
            method: 'POST',
            headers: {
                apikey: anonKey,
                Authorization: `Bearer ${anonKey}`,
                'Content-Type': 'application/json',
                Prefer: 'resolution=merge-duplicates',
            },
            body: JSON.stringify(rows),
        });
        if (!response.ok) {
            console.warn(
                `[Indexer] Supabase upsert failed (${response.status}):`,
                await response.text().catch(() => '<no body>'),
            );
        }
    } catch (error) {
        console.warn('[Indexer] Supabase upsert exception:', error);
    }
}

// ---- Public API ------------------------------------------------------------

/**
 * Index all markets by walking recent blocks. Persists discoveries into the
 * Supabase market_registry table and returns the union of cached + freshly
 * discovered markets.
 */
export async function indexAllMarkets(): Promise<IndexedMarket[]> {
    console.log('🔍 Veiled Markets — Dynamic indexer starting');
    console.log(`   Network: ${config.network}`);
    console.log(`   RPC: ${config.rpcUrl}`);
    console.log(`   Programs: ${MARKET_PROGRAMS.join(', ')}`);

    const checkpoint = loadCheckpoint();
    const latestHeight = await getLatestBlockHeight();

    if (latestHeight === 0) {
        console.warn('[Indexer] Could not fetch latest block height — using cached snapshot only');
        return loadExistingSnapshot();
    }

    const startHeight = checkpoint.lastIndexedBlock > 0
        ? checkpoint.lastIndexedBlock + 1
        : Math.max(1, latestHeight - MAX_BLOCKS_PER_RUN);

    const endHeight = Math.min(latestHeight, startHeight + MAX_BLOCKS_PER_RUN - 1);

    if (startHeight > endHeight) {
        console.log(`✅ No new blocks to scan (latest: ${latestHeight})`);
        return loadExistingSnapshot();
    }

    console.log(`📡 Scanning blocks ${startHeight} → ${endHeight} (latest: ${latestHeight})`);

    const discovered: IndexedMarket[] = [];
    let lastSuccessfulHeight = checkpoint.lastIndexedBlock;

    for (let height = startHeight; height <= endHeight; height++) {
        const block = await getBlockByHeight(height);
        if (!block) continue;

        const blockTimestamp = block.header?.metadata?.timestamp || 0;
        const txs = block.transactions || [];

        for (const tx of txs) {
            const txId = tx.transaction?.id || '';
            const transitions = tx.transaction?.execution?.transitions || [];
            for (const transition of transitions) {
                const market = extractCreateMarketEntry(transition, txId, height, blockTimestamp);
                if (market) {
                    discovered.push(market);
                    console.log(`   + ${market.marketId.slice(0, 20)}... (block ${height}, ${transition.program})`);
                }
            }
        }
        lastSuccessfulHeight = height;
    }

    // Merge with existing snapshot
    const merged = dedupeMarkets([...loadExistingSnapshot(), ...discovered]);

    // Write-through to Supabase
    if (discovered.length > 0) {
        await upsertMarketRegistry(discovered);
    }

    saveCheckpoint(lastSuccessfulHeight);
    console.log(`✅ Discovered ${discovered.length} new markets · ${merged.length} total tracked`);
    return merged;
}

/**
 * Get market IDs from indexed data
 */
export function getMarketIds(markets: IndexedMarket[]): string[] {
    return markets.map(m => m.marketId);
}

/**
 * Build question text map from indexed data
 */
export function buildQuestionMap(markets: IndexedMarket[]): Record<string, string> {
    const map: Record<string, string> = {};
    for (const market of markets) {
        // Real text is fetched on the frontend from Supabase market_registry / IPFS
        map[market.questionHash] = `Market ${market.questionHash}`;
    }
    return map;
}

/**
 * Save indexed markets to JSON file (for static deployment)
 */
export async function saveIndexedMarkets(markets: IndexedMarket[]): Promise<void> {
    const data = {
        lastUpdated: new Date().toISOString(),
        totalMarkets: markets.length,
        markets,
        marketIds: getMarketIds(markets),
    };

    const publicDir = path.dirname(SNAPSHOT_PATH);
    if (!fs.existsSync(publicDir)) {
        fs.mkdirSync(publicDir, { recursive: true });
        console.log(`📁 Created directory: ${publicDir}`);
    }

    fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(data, null, 2));
    console.log(`💾 Saved indexed markets to ${SNAPSHOT_PATH}`);
}

/**
 * Load indexed markets from JSON file
 */
export async function loadIndexedMarkets(): Promise<string[]> {
    try {
        const response = await fetch('/markets-index.json');
        if (!response.ok) return [];
        const data = (await response.json()) as { marketIds?: string[] };
        return data.marketIds || [];
    } catch (error) {
        console.error('Failed to load indexed markets:', error);
        return [];
    }
}
