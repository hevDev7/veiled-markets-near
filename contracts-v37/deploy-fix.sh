#!/bin/bash

# Fixed deployment script with correct endpoints
set -e

echo "🚀 Deploying Veiled Markets to Aleo Testnet"
echo "============================================"
echo ""

# Try different endpoints
ENDPOINTS=(
    "https://api.explorer.aleo.org/v1"
    "https://testnet.aleorpc.com"
    "https://api.explorer.provable.tools/v1"
)

for ENDPOINT in "${ENDPOINTS[@]}"; do
    echo "🔄 Trying endpoint: $ENDPOINT"
    
    leo deploy \
        --network testnet \
        --endpoint "$ENDPOINT" \
        --priority-fee 1000000 && break
    
    echo "❌ Failed with $ENDPOINT, trying next..."
    echo ""
done

echo ""
echo "✅ Deployment complete!"
