# 🪙 Guide: Create Crypto Market - Bitcoin $100k

## 📋 Market Details

- **Question:** "Will Bitcoin reach $100,000 by end of Q2 2026?"
- **Category:** 3 (Crypto)
- **Question Hash:** `286436157692503798507031276544051911294111113992262510563720965993924436183field`

## 🚀 Step-by-Step Instructions

### Step 1: Get Current Block Height

```bash
curl "https://api.explorer.provable.com/v1/testnet/latest/height"
```

Or check manually: https://testnet.explorer.provable.com/

### Step 2: Calculate Deadlines

```bash
# Current block (example: 14000000)
CURRENT_BLOCK=14000000

# 1 block ≈ 15 seconds
# 1 day = 5,760 blocks
BLOCKS_PER_DAY=5760

# 7 days betting + 3 days resolution
BETTING_DAYS=7
RESOLUTION_DAYS=10

BETTING_DEADLINE=$((CURRENT_BLOCK + (BETTING_DAYS * BLOCKS_PER_DAY)))
RESOLUTION_DEADLINE=$((CURRENT_BLOCK + (RESOLUTION_DAYS * BLOCKS_PER_DAY)))

echo "Betting Deadline: $BETTING_DEADLINE"
echo "Resolution Deadline: $RESOLUTION_DEADLINE"
```

### Step 3: Create Market

```bash
cd contracts

leo execute create_market \
  "286436157692503798507031276544051911294111113992262510563720965993924436183field" \
  "3u8" \
  "${BETTING_DEADLINE}u64" \
  "${RESOLUTION_DEADLINE}u64" \
  --network testnet \
  --broadcast
```

### Step 4: Save Transaction Details

From the output, save:
- **Transaction ID** (starts with `at1...`)
- **Market ID** (ends with `field`)

### Step 5: Update Backend Indexer

Edit `backend/src/indexer.ts` and add to `KNOWN_MARKETS` array:

```typescript
{
    marketId: 'YOUR_MARKET_ID_HERE',
    transactionId: 'YOUR_TX_ID_HERE',
    creator: 'aleo10tm5ektsr5v7kdc5phs8pha42vrkhe2rlxfl2v979wunhzx07vpqnqplv8',
    questionHash: '286436157692503798507031276544051911294111113992262510563720965993924436183field',
    category: 3,
    deadline: '${BETTING_DEADLINE}u64',
    resolutionDeadline: '${RESOLUTION_DEADLINE}u64',
    createdAt: Date.now(),
    blockHeight: CURRENT_BLOCK,
},
```

### Step 6: Update Question Mapping

Edit `frontend/src/lib/question-mapping.ts` and add:

```typescript
'286436157692503798507031276544051911294111113992262510563720965993924436183field': 
  'Will Bitcoin reach $100,000 by end of Q2 2026?',
```

### Step 7: Regenerate Index

```bash
cd backend
npm run index
```

### Step 8: Copy to Frontend

```bash
cp backend/public/markets-index.json frontend/public/
```

### Step 9: Restart Frontend

```bash
cd frontend
npm run dev
```

## ✅ Verification

1. Open dashboard: http://localhost:5173
2. Connect wallet
3. Check market appears: "Will Bitcoin reach $100,000 by end of Q2 2026?"
4. Click market - verify details
5. Check "Verify On-Chain" link works

## 📝 Quick Reference

- **Question Hash:** `286436157692503798507031276544051911294111113992262510563720965993924436183field`
- **Category:** `3u8` (Crypto)
- **Block Time:** ~15 seconds per block
- **Blocks per Day:** 5,760

## 🎯 Alternative: Use Script

```bash
cd contracts
./create-crypto-market.sh
```

Script will:
- Generate hash automatically
- Fetch current block height
- Calculate deadlines
- Execute transaction
- Provide next steps
