#!/bin/bash

# ============================================================================
# Deploy veiled_markets_commit_reveal.aleo (Phase 2) to Aleo Testnet
# ============================================================================

set -e

echo "🚀 Deploying veiled_market_v3.aleo (Phase 2) to Testnet"
echo "======================================================"
echo ""

# Load environment variables
if [ -f ".env" ]; then
    source .env
fi

# Check if program is built
if [ ! -f "build/main.aleo" ]; then
    echo "❌ Error: Contract not built. Run 'leo build' first."
    exit 1
fi

echo "✅ Contract built successfully"
echo "📦 Program: veiled_market_v3.aleo"
echo "🌐 Network: testnet"
echo "🆕 Features: Commit-Reveal Scheme (Phase 2)"
echo ""

# Check private key
if [ -z "$PRIVATE_KEY" ]; then
    echo "❌ Error: PRIVATE_KEY not set in .env file"
    exit 1
fi

echo "📋 Deployment Summary:"
echo "  Program: veiled_market_v3.aleo"
echo "  Network: testnet"
echo "  Endpoint: ${ENDPOINT:-https://api.explorer.provable.com/v1}"
echo "  New Features:"
echo "    - commit_bet (private amount/outcome)"
echo "    - reveal_bet (batch reveal after deadline)"
echo "    - Enhanced privacy (8/10 score)"
echo ""

echo "📡 Deploying as NEW program..."
echo ""
echo "⚠️  Note: This is a NEW program (not upgrade)"
echo "⚠️  You may need to confirm the deployment in your terminal"
echo ""

leo deploy \
    --network testnet \
    --broadcast \
    --private-key "$PRIVATE_KEY"

echo ""
echo "✅ Deployment transaction submitted!"
echo ""
echo "🔍 Verify deployment at:"
echo "  https://testnet.explorer.provable.com/program/veiled_market_v3.aleo"
echo ""
echo "⏳ Wait 1-2 minutes for transaction confirmation"
echo ""
echo "📚 Documentation:"
echo "  - COMMIT_REVEAL_GUIDE.md - User guide"
echo "  - PHASE2_IMPLEMENTATION_COMPLETE.md - Implementation details"
