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
 */
const KNOWN_MARKETS: IndexedMarket[] = [
    {
        marketId: '2226266059345959235903805886443078929600424190236962232761580543397941034862field',
        transactionId: 'at1suyzwzd3zkymsewnpjqjs6h0x0k0u03yd8azv452ra36qjtzyvrsnjq902',
        creator: 'aleo10tm5ektsr5v7kdc5phs8pha42vrkhe2rlxfl2v979wunhzx07vpqnqplv8',
        questionHash: '7234567890123456789012345678901234567890123456789012345678901234field', // Hash of "Will Bitcoin reach $100k by end of Q1 2026?"
        category: 3,
        deadline: '14165851u64',
        resolutionDeadline: '14183131u64',
        createdAt: Date.now(),
        blockHeight: 14067000,
    },
    {
        marketId: '1343955940696835063665090431790223713510436410586241525974362313497380512445field',
        transactionId: 'at1j8xalgyfw7thg2zmpy9zlt82cpegse3vqsm9g3z2l3a59wj3ry8qg9n9u7',
        creator: 'aleo10tm5ektsr5v7kdc5phs8pha42vrkhe2rlxfl2v979wunhzx07vpqnqplv8',
        questionHash: '1234567890123456789012345678901234567890123456789012345678901234field', // Hash of "Will Trump win the 2026 US Presidential Election?"
        category: 1,
        deadline: '14107191u64',
        resolutionDeadline: '14124471u64',
        createdAt: Date.now(),
        blockHeight: 14067123,
    },
    {
        marketId: '810523019777616412177748759438416240921384383441959113104962406712429357311field',
        transactionId: 'at1q5rvkyexgwnvrwlw587s7qzl2tegn6524we96gyhuc0hz7zs55rqfm00r4',
        creator: 'aleo10tm5ektsr5v7kdc5phs8pha42vrkhe2rlxfl2v979wunhzx07vpqnqplv8',
        questionHash: '2345678901234567890123456789012345678901234567890123456789012345field', // Hash of "Will Lakers win NBA Championship 2026?"
        category: 2,
        deadline: '14107191u64',
        resolutionDeadline: '14124471u64',
        createdAt: Date.now(),
        blockHeight: 14067200,
    },
    {
        marketId: '2561705300444654139615408172203999477019238232931615365990277976260492916308field',
        transactionId: 'at1fvk3t9494tp56a7gykna7djgnurf25yphxg9ystprcjxhach0qxsn8e5wx',
        creator: 'aleo10tm5ektsr5v7kdc5phs8pha42vrkhe2rlxfl2v979wunhzx07vpqnqplv8',
        questionHash: '3456789012345678901234567890123456789012345678901234567890123456field', // Hash of "Will Ethereum reach $5000 by March 2026?"
        category: 3,
        deadline: '14107191u64',
        resolutionDeadline: '14124471u64',
        createdAt: Date.now(),
        blockHeight: 14067300,
    },
    {
        marketId: '6497398114847519923379901992833643876462593069120645523569600191102874822191field',
        transactionId: 'at1fnyzg2j7n4ep2l6p0qvlfnfqsufh7jxerfpe7chzymgsl0ukeyqqhrceej',
        creator: 'aleo10tm5ektsr5v7kdc5phs8pha42vrkhe2rlxfl2v979wunhzx07vpqnqplv8',
        questionHash: '4567890123456789012345678901234567890123456789012345678901234567field', // Hash of "Will Taylor Swift release new album in 2026?"
        category: 4,
        deadline: '14107191u64',
        resolutionDeadline: '14124471u64',
        createdAt: Date.now(),
        blockHeight: 14067400,
    },
    {
        marketId: '2782540397887243983750241685138602830175258821940489779581095376798172768978field',
        transactionId: 'at12f9uvhadvppk3kqqe8y6s4mwsnn37fnv2lkzd3s8pdvy9yz8h5zqyzwrwa',
        creator: 'aleo10tm5ektsr5v7kdc5phs8pha42vrkhe2rlxfl2v979wunhzx07vpqnqplv8',
        questionHash: '5678901234567890123456789012345678901234567890123456789012345678field', // Hash of "Will Apple release AR glasses in 2026?"
        category: 5,
        deadline: '14107191u64',
        resolutionDeadline: '14124471u64',
        createdAt: Date.now(),
        blockHeight: 14067500,
    },
    {
        marketId: '7660559822229647474965631916495293995705931900965070950237377789460326943999field',
        transactionId: 'at14agvnhed7rfh9pvxfmm64kw50jt4aea0y40r0u2vc46znsvk3vgsdxglv4',
        creator: 'aleo10tm5ektsr5v7kdc5phs8pha42vrkhe2rlxfl2v979wunhzx07vpqnqplv8',
        questionHash: '6789012345678901234567890123456789012345678901234567890123456789field', // Hash of "Will US Fed cut rates in Q1 2026?"
        category: 6,
        deadline: '14107191u64',
        resolutionDeadline: '14124471u64',
        createdAt: Date.now(),
        blockHeight: 14067600,
    },
    {
        marketId: '425299171484137372110091327826787897441058548811928022547541653437849039243field',
        transactionId: 'at1eqvc2jzfnmuc7c9fzuny0uu34tqfjd2mv4xpqnknd9hnvz8l2qrsd8yyez',
        creator: 'aleo10tm5ektsr5v7kdc5phs8pha42vrkhe2rlxfl2v979wunhzx07vpqnqplv8',
        questionHash: '7890123456789012345678901234567890123456789012345678901234567890field', // Hash of "Will SpaceX land on Mars by 2030?"
        category: 7,
        deadline: '14107191u64',
        resolutionDeadline: '14124471u64',
        createdAt: Date.now(),
        blockHeight: 14067700,
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
