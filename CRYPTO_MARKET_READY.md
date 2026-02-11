# 🪙 Crypto Market Ready to Create

## Market Information

**Question:** "Will Bitcoin reach $100,000 by end of Q2 2026?"  
**Category:** Crypto (3)  
**Question Hash:** `286436157692503798507031276544051911294111113992262510563720965993924436183field`

## Current Network Status

- **Current Block Height:** 14109082
- **Betting Deadline:** 14109182 + (7 days × 5760 blocks) = **14149262**
- **Resolution Deadline:** 14109182 + (10 days × 5760 blocks) = **14164862**

## 🚀 Create Market Command

```bash
cd contracts

leo execute create_market \
  "286436157692503798507031276544051911294111113992262510563720965993924436183field" \
  "3u8" \
  "14149262u64" \
  "14164862u64" \
  --network testnet \
  --broadcast
```

## 📝 After Creation - Update Files

### 1. Backend Indexer (`backend/src/indexer.ts`)

Add to `KNOWN_MARKETS` array:

```typescript
{
    marketId: 'PASTE_MARKET_ID_FROM_OUTPUT',
    transactionId: 'PASTE_TX_ID_FROM_OUTPUT',
    creator: 'aleo10tm5ektsr5v7kdc5phs8pha42vrkhe2rlxfl2v979wunhzx07vpqnqplv8',
    questionHash: '286436157692503798507031276544051911294111113992262510563720965993924436183field',
    category: 3,
    deadline: '14149262u64',
    resolutionDeadline: '14164862u64',
    createdAt: Date.now(),
    blockHeight: 14109082,
},
```

### 2. Question Mapping (`frontend/src/lib/question-mapping.ts`)

Add to mapping:

```typescript
'286436157692503798507031276544051911294111113992262510563720965993924436183field': 
  'Will Bitcoin reach $100,000 by end of Q2 2026?',
```

### 3. Regenerate Index

```bash
cd backend
npm run index
cp public/markets-index.json ../frontend/public/
```

## ✅ Ready to Execute!

Run the command above to create the market on-chain!
