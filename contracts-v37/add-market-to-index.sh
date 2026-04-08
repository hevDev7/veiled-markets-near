#!/bin/bash

# Add CLI-created market to frontend index
# Usage: ./add-market-to-index.sh <market_id> <tx_id> <question_hash> <question_text> <category> <deadline> <resolution_deadline>

if [ $# -lt 7 ]; then
    echo "Usage: ./add-market-to-index.sh <market_id> <tx_id> <question_hash> <question_text> <category> <deadline> <resolution_deadline>"
    echo ""
    echo "Example:"
    echo "  ./add-market-to-index.sh \\"
    echo '    "12345field" \'
    echo '    "at1xyz..." \'
    echo '    "67890field" \'
    echo '    "Will ETH reach 10k?" \'
    echo "    3 \\"
    echo "    14107320 \\"
    echo "    14124600"
    exit 1
fi

MARKET_ID="$1"
TX_ID="$2"
QUESTION_HASH="$3"
QUESTION_TEXT="$4"
CATEGORY="$5"
DEADLINE="$6"
RESOLUTION_DEADLINE="$7"
CREATOR="aleo10tm5ektsr5v7kdc5phs8pha42vrkhe2rlxfl2v979wunhzx07vpqnqplv8"
CREATED_AT=$(date +%s)000
BLOCK_HEIGHT=$((DEADLINE - 40320))  # Approximate

# Path to index files
FRONTEND_INDEX="../frontend/public/markets-index.json"
BACKEND_INDEX="../backend/public/markets-index.json"

echo "📝 Adding market to index..."
echo "   Market ID: $MARKET_ID"
echo "   TX ID: $TX_ID"
echo "   Question: $QUESTION_TEXT"
echo ""

# Create Python script to update JSON (more reliable than jq for complex operations)
python3 << EOF
import json
import os

market_data = {
    "marketId": "$MARKET_ID",
    "transactionId": "$TX_ID",
    "creator": "$CREATOR",
    "questionHash": "$QUESTION_HASH",
    "category": $CATEGORY,
    "deadline": "${DEADLINE}u64",
    "resolutionDeadline": "${RESOLUTION_DEADLINE}u64",
    "createdAt": $CREATED_AT,
    "blockHeight": $BLOCK_HEIGHT
}

question_data = {
    "$MARKET_ID": "$QUESTION_TEXT",
    "$QUESTION_HASH": "$QUESTION_TEXT"
}

for index_path in ["$FRONTEND_INDEX", "$BACKEND_INDEX"]:
    try:
        if os.path.exists(index_path):
            with open(index_path, 'r') as f:
                data = json.load(f)
        else:
            data = {"lastUpdated": "", "totalMarkets": 0, "markets": [], "marketIds": []}

        # Check if market already exists
        if "$MARKET_ID" not in data.get("marketIds", []):
            data["markets"].append(market_data)
            data["marketIds"].append("$MARKET_ID")
            data["totalMarkets"] = len(data["markets"])
            data["lastUpdated"] = "$(date -Iseconds)"

            with open(index_path, 'w') as f:
                json.dump(data, f, indent=2)
            print(f"✅ Updated {index_path}")
        else:
            print(f"⚠️ Market already exists in {index_path}")
    except Exception as e:
        print(f"❌ Failed to update {index_path}: {e}")

# Update question mapping if it exists
question_map_path = "../frontend/src/lib/question-mapping.ts"
if os.path.exists(question_map_path):
    print(f"📝 Don't forget to add to {question_map_path}:")
    print(f'   "{market_data["marketId"]}": "{question_data["$MARKET_ID"]}",')
    print(f'   "{market_data["questionHash"]}": "{question_data["$QUESTION_HASH"]}",')

EOF

echo ""
echo "✅ Done! Restart your frontend dev server to see the market."
echo ""
echo "🌐 Or add via browser console:"
echo "   localStorage.setItem('veiled_markets_ids', JSON.stringify([...(JSON.parse(localStorage.getItem('veiled_markets_ids')||'[]')), '$MARKET_ID']))"
echo ""
