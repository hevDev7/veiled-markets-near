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
 * NOTE: veiled_markets_v4.aleo is the version 4 deployment with privacy fix
 * Includes delayed pool updates, noise addition, and commit-reveal betting for better privacy
 */
const KNOWN_MARKETS: IndexedMarket[] = [
    // Market 1 - Ethereum $10k (First market on veiled_markets_privacy.aleo)
    {
        marketId: '1827467977240901494339036217017462683817421549474947615723082367626884127079field',
        transactionId: 'at12zhzvenstjeyrk0p2tdcj4j2wwn87wgc7230sr6h3pyguj2hpvpsahyxd7',
        creator: 'aleo10tm5ektsr5v7kdc5phs8pha42vrkhe2rlxfl2v979wunhzx07vpqnqplv8',
        questionHash: '3582024152336217571382682973364798990155453514672503623063651091171230848724field', // Hash of "Will Ethereum reach $10,000 by end of Q2 2026?"
        category: 3,
        deadline: '14107320u64',
        resolutionDeadline: '14124600u64',
        createdAt: Date.now(),
        blockHeight: 14067000,
    },
    // Market 2 - Bitcoin $100k (Crypto market)
    {
        marketId: '2324599315804307583621629508171904754376140563814202582516489027393343318776field',
        transactionId: 'at1kzeh5j7gkm4qsyzpsacyl3sjg7tz550vvggg5tv5kpqkfs9lvgxqf5gtvc',
        creator: 'aleo10tm5ektsr5v7kdc5phs8pha42vrkhe2rlxfl2v979wunhzx07vpqnqplv8',
        questionHash: '286436157692503798507031276544051911294111113992262510563720965993924436183field', // Hash of "Will Bitcoin reach $100,000 by end of Q2 2026?"
        category: 3,
        deadline: '14149402u64',
        resolutionDeadline: '14166682u64',
        createdAt: Date.now(),
        blockHeight: 14109082,
    },
    // Market 3 - Ethereum $10k (legacy veiled_market_v3.aleo)
    {
        marketId: '6799979859013350088666057543392479876047176358286654383237647068200827543742field',
        transactionId: 'at1cwm8msj2y4z23suhtsghyahl34xexflz3x5kwhfh34pt2yplqqrstutuwz',
        creator: 'aleo10tm5ektsr5v7kdc5phs8pha42vrkhe2rlxfl2v979wunhzx07vpqnqplv8',
        questionHash: '350929565016816493992297964402345071115472527106339097957348390879136520853field', // Hash of "Will Ethereum reach $10,000 by end of Q2 2026?"
        category: 3,
        deadline: '14149933u64',
        resolutionDeadline: '14167213u64',
        createdAt: Date.now(),
        blockHeight: 14109613,
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
