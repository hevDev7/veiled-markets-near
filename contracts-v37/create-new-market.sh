#!/bin/bash

# Create 1 new prediction market with CORRECT question hash
# This demonstrates the proper way to create a market

echo "🎯 Creating New Prediction Market with Proper Hash"
echo ""

# Market Details
QUESTION="Will Ethereum reach \$10,000 by end of Q2 2026?"
CATEGORY=3  # Crypto
# This hash was generated using: node scripts/generate-question-hash.js "Will Ethereum reach $10,000 by end of Q2 2026?"
# Hash is in DECIMAL format (not hex) as required by Aleo
QUESTION_HASH="350929565016816493992297964402345071115472527106339097957348390879136520853field"

# Get current block height (you should check actual current block)
# Visit: https://testnet.explorer.provable.com/
CURRENT_BLOCK=14067000

# Calculate deadlines
BETTING_DAYS=7
RESOLUTION_DAYS=10
BLOCKS_PER_DAY=5760

BETTING_DEADLINE=$((CURRENT_BLOCK + (BETTING_DAYS * BLOCKS_PER_DAY)))
RESOLUTION_DEADLINE=$((CURRENT_BLOCK + (RESOLUTION_DAYS * BLOCKS_PER_DAY)))

echo "� Market Details:"
echo "   Question: $QUESTION"
echo "   Category: $CATEGORY (Crypto)"
echo "   Question Hash: $QUESTION_HASH"
echo ""
echo "📅 Deadlines:"
echo "   Current Block: ~$CURRENT_BLOCK"
echo "   Betting Deadline: $BETTING_DEADLINE (${BETTING_DAYS} days)"
echo "   Resolution Deadline: $RESOLUTION_DEADLINE (${RESOLUTION_DAYS} days)"
echo ""

# Confirm before proceeding
read -p "🤔 Create this market? (y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Cancelled"
    exit 1
fi

# Create the market
echo ""
echo "🚀 Executing create_market transaction..."
echo "   Command: leo execute create_market \"$QUESTION_HASH\" \"${CATEGORY}u8\" \"${BETTING_DEADLINE}u64\" \"${RESOLUTION_DEADLINE}u64\" --broadcast"
echo ""

cd contracts

leo execute create_market \
  "$QUESTION_HASH" \
  "${CATEGORY}u8" \
  "${BETTING_DEADLINE}u64" \
  "${RESOLUTION_DEADLINE}u64" \
  --broadcast

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Market created successfully!"
    echo ""
    echo "📊 Market Summary:"
    echo "   Question: $QUESTION"
    echo "   Hash: $QUESTION_HASH"
    echo "   Category: Crypto (3)"
    echo "   Betting until block: $BETTING_DEADLINE"
    echo "   Resolution by block: $RESOLUTION_DEADLINE"
    echo ""
    echo "📝 IMPORTANT - Next Steps:"
    echo ""
    echo "1. Note the TRANSACTION ID from output above"
    echo "2. Note the MARKET ID from output above"
    echo ""
    echo "3. Add to backend/src/indexer.ts KNOWN_MARKETS array:"
    echo "   {"
    echo "       marketId: 'YOUR_MARKET_ID_HERE',"
    echo "       transactionId: 'YOUR_TX_ID_HERE',"
    echo "       creator: 'aleo10tm5ektsr5v7kdc5phs8pha42vrkhe2rlxfl2v979wunhzx07vpqnqplv8',"
    echo "       questionHash: '$QUESTION_HASH',"
    echo "       category: $CATEGORY,"
    echo "       deadline: '${BETTING_DEADLINE}u64',"
    echo "       resolutionDeadline: '${RESOLUTION_DEADLINE}u64',"
    echo "       createdAt: Date.now(),"
    echo "       blockHeight: $CURRENT_BLOCK,"
    echo "   },"
    echo ""
    echo "4. Add to frontend/src/lib/question-mapping.ts:"
    echo "   '$QUESTION_HASH': '$QUESTION',"
    echo ""
    echo "5. Run indexer:"
    echo "   cd backend && npm run index"
    echo ""
    echo "6. Copy to frontend:"
    echo "   cp backend/public/markets-index.json frontend/public/"
    echo ""
    echo "7. Restart frontend dev server"
    echo ""
else
    echo ""
    echo "❌ Market creation failed!"
    echo "   Check your Leo wallet and network connection"
    echo "   Make sure you have enough credits for transaction fees"
    echo ""
fi

