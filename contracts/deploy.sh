#!/bin/bash

# ============================================================================
# Veiled Markets - Deployment Script
# ============================================================================

set -e  # Exit on error

echo "🚀 Veiled Markets Deployment Script"
echo "===================================="
echo ""

# Check if we're in the contracts directory
if [ ! -f "program.json" ]; then
    echo "❌ Error: Must run from contracts directory"
    exit 1
fi

# Display configuration
echo "📋 Configuration:"
echo "  Network: testnet"
echo "  Endpoint: https://api.provable.com/v2/testnet"
echo "  Program: veiled_markets.aleo"
echo ""

# Check balance
echo "💰 Checking balance..."
BALANCE_RESPONSE=$(curl -s "https://api.provable.com/v2/testnet/latest/height")
if [ -z "$BALANCE_RESPONSE" ]; then
    echo "⚠️  Warning: Could not check balance (API might be slow)"
else
    echo "✅ Network is reachable (block height: $BALANCE_RESPONSE)"
fi
echo ""

# Build first
echo "🔨 Building contract..."
leo build
if [ $? -ne 0 ]; then
    echo "❌ Build failed!"
    exit 1
fi
echo "✅ Build successful"
echo ""

# Deploy with broadcast
echo "📡 Deploying to testnet..."
echo "⚠️  This will cost approximately 13.18 Aleo credits"
echo ""
echo "Running: leo deploy --network testnet --broadcast"
echo ""

leo deploy --network testnet --broadcast

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Deployment successful!"
    echo ""
    echo "🔍 Verify deployment:"
    echo "  curl \"https://api.provable.com/v2/testnet/program/veiled_markets.aleo\""
    echo ""
    echo "  Or visit:"
    echo "  https://testnet.aleoscan.io/program/veiled_markets.aleo"
else
    echo ""
    echo "❌ Deployment failed!"
    echo ""
    echo "💡 Troubleshooting:"
    echo "  1. Check you have enough credits (need 14+)"
    echo "  2. Verify network is accessible"
    echo "  3. Try again in a few minutes"
fi
