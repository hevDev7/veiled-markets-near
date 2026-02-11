// ============================================================================
// VEILED MARKETS - Blockchain Indexer Service
// ============================================================================
// Scans blockchain for market creation events and maintains market registry
// ============================================================================

import * as fs from 'fs';
import * as path from 'path';

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
}

/**
 * Known markets from contract deployment
 * In production, this would be fetched from an indexer service or custom node
 * Question hashes are generated from actual market questions using SHA-256
 * 
 * NOTE: veiled_markets_v9.aleo is the version 4 deployment with privacy fix
 * Includes delayed pool updates, noise addition, and commit-reveal betting for better privacy
 */
const KNOWN_MARKETS: IndexedMarket[] = [
    // v9 Market - BTC $150k (1-day market on veiled_markets_v9.aleo)
    {
        marketId: '4955759583890935181829299956112762375922522931362007427296273692424871920919field',
        transactionId: 'at15fpk5w50lpr8z22resqp6g8eqsjm83tn955y77wf7thqfhpnmy9qras8x4',
        creator: 'aleo10tm5ektsr5v7kdc5phs8pha42vrkhe2rlxfl2v979wunhzx07vpqnqplv8',
        questionHash: '1234567890field',
        category: 1,
        deadline: '14396209u64',
        resolutionDeadline: '14425009u64',
        createdAt: Date.now(),
        blockHeight: 14367415,
    },
];

/**
 * Index all markets from blockchain
 * Currently uses known markets. In production, would scan blockchain.
 */
export async function indexAllMarkets(): Promise<IndexedMarket[]> {
    console.log('🔍 Starting market indexing...');
    console.log('📋 Using known market IDs (Aleo explorer API limitations)');
    console.log(`✅ Found ${KNOWN_MARKETS.length} markets.`);
    return KNOWN_MARKETS;
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

    // Create public directory if it doesn't exist
    const publicDir = path.join(process.cwd(), 'public');
    if (!fs.existsSync(publicDir)) {
        fs.mkdirSync(publicDir, { recursive: true });
        console.log(`📁 Created directory: ${publicDir}`);
    }

    const outputPath = path.join(publicDir, 'markets-index.json');
    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
    console.log(`💾 Saved indexed markets to ${outputPath}`);
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
