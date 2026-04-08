#!/bin/bash

# ============================================================================
# Deploy veiled_markets_privacy.aleo to Aleo Testnet
# ============================================================================

set -e

echo "🚀 Deploying veiled_markets_privacy.aleo to Testnet"
echo "=================================================="
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
echo ""

# Check private key
if [ -z "$PRIVATE_KEY" ]; then
    echo "❌ Error: PRIVATE_KEY not set in .env file"
    exit 1
fi

echo "📋 Deployment Summary:"
echo "  Program: veiled_markets_privacy.aleo"
echo "  Network: testnet"
echo "  Endpoint: https://api.explorer.provable.com/v1/testnet"
echo "  Address: $(leo account address --private-key "$PRIVATE_KEY" 2>/dev/null || echo 'N/A')"
echo ""

# Deploy using Leo CLI
echo "📡 Deploying..."
echo ""
echo "⚠️  Note: You may need to confirm the deployment in your terminal"
echo ""

leo deploy \
    --network testnet \
    --broadcast \
    --private-key "$PRIVATE_KEY"

echo ""
echo "✅ Deployment transaction submitted!"
echo ""
echo "🔍 Verify deployment at:"
echo "  https://testnet.explorer.provable.com/program/veiled_markets_privacy.aleo"
echo ""
echo "⏳ Wait 1-2 minutes for transaction confirmation"
