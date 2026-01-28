#!/bin/bash

# Simple deployment script for Veiled Markets
# Usage: ./deploy-simple.sh

set -e

echo "🚀 Veiled Markets - Simple Deployment"
echo "======================================"
echo ""

# Check if in contracts directory
if [ ! -f "program.json" ]; then
    echo "❌ Error: Must run from contracts directory"
    echo "   Run: cd contracts && ./deploy-simple.sh"
    exit 1
fi

# Check if build exists
if [ ! -f "build/main.aleo" ]; then
    echo "❌ Error: Build not found. Run 'leo build' first"
    exit 1
fi

echo "✅ Build found: build/main.aleo"
echo ""

# Load environment
if [ -f "../.env" ]; then
    source ../.env
    echo "✅ Environment loaded"
else
    echo "❌ Error: .env file not found"
    exit 1
fi

# Check private key
if [ -z "$ALEO_PRIVATE_KEY" ]; then
    echo "❌ Error: ALEO_PRIVATE_KEY not set in .env"
    exit 1
fi

echo "✅ Private key configured"
echo "📍 Network: ${ALEO_NETWORK:-testnet}"
echo ""

# Show address
echo "📋 Deployment Info:"
echo "   Program: veiled_markets.aleo"
echo "   Address: ${ALEO_ADDRESS}"
echo "   Network: ${ALEO_NETWORK:-testnet}"
echo ""

# Confirm
read -p "🤔 Deploy to testnet? (y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Deployment cancelled"
    exit 0
fi

echo ""
echo "🚀 Deploying..."
echo ""

# Deploy using leo
leo deploy --network ${ALEO_NETWORK:-testnet}

echo ""
echo "✅ Deployment complete!"
echo ""
echo "🔍 Verify at:"
echo "   https://testnet.explorer.provable.com/program/veiled_markets.aleo"
echo ""
