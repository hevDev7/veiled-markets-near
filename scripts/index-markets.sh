#!/bin/bash

# ============================================================================
# VEILED MARKETS - Market Indexer Script
# ============================================================================
# This script indexes all markets from blockchain and saves to JSON
# Run before deployment to update market registry
# ============================================================================

echo "🔍 Veiled Markets - Market Indexer"
echo "===================================="
echo ""

# Check if backend dependencies are installed
if [ ! -d "backend/node_modules" ]; then
  echo "📦 Installing backend dependencies..."
  cd backend
  npm install
  cd ..
  echo ""
fi

# Run the indexer
echo "🚀 Starting market indexing..."
cd backend
npm run index

# Copy indexed data to frontend public folder
if [ -f "public/markets-index.json" ]; then
  echo ""
  echo "📋 Copying indexed data to frontend..."
  mkdir -p ../frontend/public
  cp public/markets-index.json ../frontend/public/
  echo "✅ Indexed data copied to frontend/public/markets-index.json"
else
  echo "⚠️ Warning: markets-index.json not found"
fi

cd ..

echo ""
echo "✅ Market indexing complete!"
echo ""
echo "💡 Next steps:"
echo "   1. Review frontend/public/markets-index.json"
echo "   2. Deploy frontend with updated market data"
echo "   3. Run this script periodically to update market registry"
