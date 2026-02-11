#!/bin/bash

# ============================================================================
# Create Market untuk veiled_market_v3.aleo
# ============================================================================

set -e

echo "🎯 Creating Market for veiled_market_v3.aleo"
echo "=============================================="
echo ""

# Load environment variables
if [ -f ".env" ]; then
    source .env
fi

# Market Details
QUESTION="Will Ethereum reach \$10,000 by end of Q2 2026?"
CATEGORY=3  # Crypto

echo "📝 Market Details:"
echo "   Question: $QUESTION"
echo "   Category: $CATEGORY (Crypto)"
echo "   Program: veiled_market_v3.aleo"
echo ""

# Generate question hash
echo "🔐 Generating question hash..."
cd "$(dirname "$0")/.."
QUESTION_HASH=$(node scripts/generate-question-hash.js "$QUESTION" 2>&1 | grep -A 1 "Hash (Decimal Field Format):" | tail -1 | sed 's/^  //' | tr -d '\n')

if [ -z "$QUESTION_HASH" ]; then
    echo "❌ Failed to generate question hash"
    exit 1
fi

echo "   Hash: $QUESTION_HASH"
echo ""

# Get current block height from network
echo "📡 Fetching current block height..."
CURRENT_BLOCK=$(curl -s "https://api.explorer.provable.com/v1/testnet/latest/height" 2>/dev/null || echo "")

if [ -z "$CURRENT_BLOCK" ] || [ "$CURRENT_BLOCK" = "null" ]; then
    echo "⚠️  Could not fetch block height, using estimate: 14000000"
    CURRENT_BLOCK=14000000
else
    echo "   Current Block: $CURRENT_BLOCK"
fi
echo ""

# Calculate deadlines
# 1 block ≈ 15 seconds
# 1 day = 5,760 blocks
# 7 days betting + 3 days resolution = 10 days total
BETTING_DAYS=7
RESOLUTION_DAYS=10
BLOCKS_PER_DAY=5760

BETTING_DEADLINE=$((CURRENT_BLOCK + (BETTING_DAYS * BLOCKS_PER_DAY)))
RESOLUTION_DEADLINE=$((CURRENT_BLOCK + (RESOLUTION_DAYS * BLOCKS_PER_DAY)))

echo "📅 Deadlines:"
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

# Navigate to contracts directory
cd "$(dirname "$0")"

# Create the market
echo ""
echo "🚀 Executing create_market transaction..."
echo "   Program: veiled_market_v3.aleo"
echo "   Command: leo execute veiled_market_v3.aleo/create_market \"$QUESTION_HASH\" \"${CATEGORY}u8\" \"${BETTING_DEADLINE}u64\" \"${RESOLUTION_DEADLINE}u64\" --network testnet --broadcast"
echo ""

leo execute veiled_market_v3.aleo/create_market \
  "$QUESTION_HASH" \
  "${CATEGORY}u8" \
  "${BETTING_DEADLINE}u64" \
  "${RESOLUTION_DEADLINE}u64" \
  --network testnet \
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
    echo "📝 IMPORTANT - Save the Transaction ID and Market ID from output above!"
    echo ""
    echo "📋 Next Steps:"
    echo ""
    echo "1. Note TRANSACTION ID and MARKET ID from output above"
    echo ""
    echo "2. Update backend/src/indexer.ts - Add to KNOWN_MARKETS array:"
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
    echo "3. Update frontend/src/lib/question-mapping.ts - Add mapping:"
    echo "   '$QUESTION_HASH': '$QUESTION',"
    echo ""
    echo "4. Run indexer:"
    echo "   cd backend && npm run index"
    echo ""
    echo "5. Copy to frontend:"
    echo "   cp backend/public/markets-index.json frontend/public/"
    echo ""
    echo "6. Restart frontend dev server"
    echo ""
else
    echo ""
    echo "❌ Market creation failed!"
    echo "   Check your Leo wallet and network connection"
    echo "   Make sure you have enough credits for transaction fees"
    echo ""
fi
