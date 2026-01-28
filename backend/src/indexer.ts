// ============================================================================
// VEILED MARKETS - Blockchain Indexer Service
// ============================================================================
// Scans blockchain for market creation events and maintains market registry
// ============================================================================

import { config } from './config';

interface IndexedMarket {
    marketId: string;
    transactionId: string;
    creator: string;
    questionHash: string;
    category: number;
    deadline: string;
    resolutionDeadline: string;
    createdAt: number;
    blockHeight: number;
}

interface Transaction {
    id: string;
    execution?: {
        transitions?: Array<{
            program: string;
            function: string;
            inputs?: Array<{ type: string; value: string }>;
            outputs?: Array<{ type: string; value: string }>;
        }>;
    };
    block_height?: number;
    timestamp?: number;
}

const API_BASE_URL = config.rpcUrl || 'https://api.explorer.provable.com/v1/testnet';
const PROGRAM_ID = config.programId || 'veiled_markets.aleo';

/**
 * Fetch transactions for a specific program
 */
async function fetchProgramTransactions(
    programId: string,
    page: number = 1,
    limit: number = 50
): Promise<Transaction[]> {
    try {
        const url = `${API_BASE_URL}/program/${programId}/transactions?page=${page}&limit=${limit}`;
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Failed to fetch transactions: ${response.status}`);
        }

        const data = await response.json();
        return Array.isArray(data) ? data : [];
    } catch (error) {
        console.error('Failed to fetch program transactions:', error);
        return [];
    }
}

/**
 * Parse create_market transaction to extract market data
 */
function parseCreateMarketTransaction(tx: Transaction): IndexedMarket | null {
    try {
        const transitions = tx.execution?.transitions || [];

        for (const transition of transitions) {
            if (transition.program === PROGRAM_ID && transition.function === 'create_market') {
                const outputs = transition.outputs || [];
                const inputs = transition.inputs || [];

                // First output is the market_id
                const marketId = outputs[0]?.value;
                if (!marketId) continue;

                // Parse inputs: question_hash, category, deadline, resolution_deadline
                const questionHash = inputs[0]?.value || '';
                const category = parseInt(inputs[1]?.value?.replace('u8', '') || '0');
                const deadline = inputs[2]?.value || '0u64';
                const resolutionDeadline = inputs[3]?.value || '0u64';

                return {
                    marketId,
                    transactionId: tx.id,
                    creator: '', // Would need to parse from transaction
                    questionHash,
                    category,
                    deadline,
                    resolutionDeadline,
                    createdAt: tx.timestamp || Date.now(),
                    blockHeight: tx.block_height || 0,
                };
            }
        }

        return null;
    } catch (error) {
        console.error('Failed to parse transaction:', error);
        return null;
    }
}

/**
 * Index all markets from blockchain
 */
export async function indexAllMarkets(): Promise<IndexedMarket[]> {
    console.log('🔍 Starting market indexing...');

    const allMarkets: IndexedMarket[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
        console.log(`📄 Fetching page ${page}...`);
        const transactions = await fetchProgramTransactions(PROGRAM_ID, page, 50);

        if (transactions.length === 0) {
            hasMore = false;
            break;
        }

        for (const tx of transactions) {
            const market = parseCreateMarketTransaction(tx);
            if (market) {
                allMarkets.push(market);
                console.log(`✅ Found market: ${market.marketId.slice(0, 20)}...`);
            }
        }

        page++;

        // Safety limit to prevent infinite loops
        if (page > 100) {
            console.warn('⚠️ Reached page limit, stopping indexing');
            break;
        }
    }

    console.log(`✅ Indexing complete. Found ${allMarkets.length} markets.`);
    return allMarkets;
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
        // In production, fetch actual question text from IPFS/storage using questionHash
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

    // In Node.js environment
    if (typeof window === 'undefined') {
        const fs = await import('fs');
        const path = await import('path');

        const outputPath = path.join(process.cwd(), 'public', 'markets-index.json');
        fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
        console.log(`💾 Saved indexed markets to ${outputPath}`);
    }
}

/**
 * Load indexed markets from JSON file
 */
export async function loadIndexedMarkets(): Promise<string[]> {
    try {
        const response = await fetch('/markets-index.json');
        if (!response.ok) return [];

        const data = await response.json();
        return data.marketIds || [];
    } catch (error) {
        console.error('Failed to load indexed markets:', error);
        return [];
    }
}
