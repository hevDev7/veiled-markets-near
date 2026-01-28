#!/usr/bin/env node
// ============================================================================
// VEILED MARKETS - Market Indexer CLI
// ============================================================================
// Run this script to index all markets from blockchain
// Usage: node backend/src/index-markets.ts
// ============================================================================

import { indexAllMarkets, saveIndexedMarkets } from './indexer';

async function main() {
    console.log('🚀 Veiled Markets - Blockchain Indexer');
    console.log('=====================================\n');

    try {
        // Index all markets from blockchain
        const markets = await indexAllMarkets();

        // Save to JSON file
        await saveIndexedMarkets(markets);

        console.log('\n✅ Indexing completed successfully!');
        console.log(`📊 Total markets indexed: ${markets.length}`);

        // Display market summary
        if (markets.length > 0) {
            console.log('\n📋 Market Summary:');
            markets.forEach((market, index) => {
                console.log(`${index + 1}. ${market.marketId.slice(0, 30)}... (Category: ${market.category})`);
            });
        }

    } catch (error) {
        console.error('❌ Indexing failed:', error);
        process.exit(1);
    }
}

main();
