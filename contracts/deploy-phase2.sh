#!/bin/bash

# ============================================================================
# Deploy veiled_markets_privacy.aleo (Phase 2) to Aleo Testnet
# ============================================================================

set -e

echo "🚀 Deploying veiled_markets_privacy.aleo (Phase 2) to Testnet"
echo "=============================================================="
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
echo "📦 Program: veiled_markets_privacy.aleo"
echo "🌐 Network: testnet"
echo "🆕 Features: Commit-Reveal Scheme (Phase 2)"
echo ""

# Check private key
if [ -z "$PRIVATE_KEY" ]; then
    echo "❌ Error: PRIVATE_KEY not set in .env file"
    exit 1
fi

# Get deployer address
DEPLOYER_ADDRESS=$(leo account address --private-key "$PRIVATE_KEY" 2>/dev/null || echo "N/A")

echo "📋 Deployment Summary:"
echo "  Program: veiled_markets_privacy.aleo"
echo "  Network: testnet"
echo "  Endpoint: ${ENDPOINT:-https://api.explorer.provable.com/v1}"
echo "  Deployer: $DEPLOYER_ADDRESS"
echo "  New Features:"
echo "    - commit_bet (private amount/outcome)"
echo "    - reveal_bet (batch reveal after deadline)"
echo "    - Enhanced privacy (8/10 score)"
echo ""

# Check if program already exists (for upgrade)
echo "🔍 Checking if program already exists..."
PROGRAM_EXISTS=$(leo program get veiled_markets_privacy.aleo --network testnet 2>&1 | grep -q "not found" && echo "no" || echo "yes")

if [ "$PROGRAM_EXISTS" = "yes" ]; then
    echo "⚠️  Program already exists. Using 'leo upgrade' instead of 'leo deploy'"
    echo ""
    echo "📡 Upgrading program..."
    echo ""
    echo "⚠️  Note: You may need to confirm the upgrade in your terminal"
    echo ""
    
    leo upgrade \
        --network testnet \
        --broadcast \
        --private-key "$PRIVATE_KEY"
else
    echo "✅ Program not found. Using 'leo deploy' for new deployment"
    echo ""
    echo "📡 Deploying..."
    echo ""
    echo "⚠️  Note: You may need to confirm the deployment in your terminal"
    echo ""
    
    leo deploy \
        --network testnet \
        --broadcast \
        --private-key "$PRIVATE_KEY"
fi

echo ""
echo "✅ Deployment/Upgrade transaction submitted!"
echo ""
echo "🔍 Verify deployment at:"
echo "  https://testnet.explorer.provable.com/program/veiled_markets_privacy.aleo"
echo ""
echo "⏳ Wait 1-2 minutes for transaction confirmation"
echo ""
echo "📚 Documentation:"
echo "  - COMMIT_REVEAL_GUIDE.md - User guide"
echo "  - PHASE2_IMPLEMENTATION_COMPLETE.md - Implementation details"
