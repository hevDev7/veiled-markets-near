# 🎯 Create Market untuk veiled_market_v3.aleo

## 🚀 Quick Start

### Option 1: Menggunakan Script (Recommended)

```bash
cd contracts
./create-market-v3.sh
```

Script akan:
- ✅ Generate question hash otomatis
- ✅ Fetch current block height dari network
- ✅ Calculate deadlines (7 days betting + 3 days resolution)
- ✅ Execute create_market transaction
- ✅ Memberikan instruksi next steps

---

### Option 2: Manual Command

```bash
cd contracts
source .env

# Generate question hash
node ../scripts/generate-question-hash.js "Will Ethereum reach \$10,000 by end of Q2 2026?"

# Get current block height
CURRENT_BLOCK=$(curl -s "https://api.explorer.provable.com/v1/testnet/latest/height")

# Calculate deadlines (7 days = 40320 blocks, 10 days = 57600 blocks)
BETTING_DEADLINE=$((CURRENT_BLOCK + 40320))
RESOLUTION_DEADLINE=$((CURRENT_BLOCK + 57600))

# Create market
leo execute veiled_market_v3.aleo/create_market \
  "350929565016816493992297964402345071115472527106339097957348390879136520853field" \
  "3u8" \
  "${BETTING_DEADLINE}u64" \
  "${RESOLUTION_DEADLINE}u64" \
  --network testnet \
  --broadcast
```

---

## 📊 Market Details

**Question:** "Will Ethereum reach $10,000 by end of Q2 2026?"  
**Category:** 3 (Crypto)  
**Question Hash:** `350929565016816493992297964402345071115472527106339097957348390879136520853field`  
**Program:** `veiled_market_v3.aleo`

---

## 📝 After Market Creation

### 1. Save Transaction ID & Market ID

Dari output `leo execute`, catat:
- **Transaction ID:** `at1...` (untuk verify di explorer)
- **Market ID:** `...field` (untuk indexer)

### 2. Update Backend Indexer

Edit `backend/src/indexer.ts` dan tambahkan ke `KNOWN_MARKETS`:

```typescript
{
    marketId: 'YOUR_MARKET_ID_HERE',  // Dari output Leo
    transactionId: 'YOUR_TX_ID_HERE',  // Dari output Leo
    creator: 'aleo10tm5ektsr5v7kdc5phs8pha42vrkhe2rlxfl2v979wunhzx07vpqnqplv8',
    questionHash: '350929565016816493992297964402345071115472527106339097957348390879136520853field',
    category: 3,
    deadline: '14124471u64',  // Update dengan BETTING_DEADLINE
    resolutionDeadline: '14141751u64',  // Update dengan RESOLUTION_DEADLINE
    createdAt: Date.now(),
    blockHeight: 14067000,  // Update dengan CURRENT_BLOCK
},
```

### 3. Update Frontend Question Mapping

Edit `frontend/src/lib/question-mapping.ts` dan tambahkan:

```typescript
'350929565016816493992297964402345071115472527106339097957348390879136520853field': 
  'Will Ethereum reach $10,000 by end of Q2 2026?',
```

### 4. Regenerate Index

```bash
cd backend
npm run index
```

### 5. Copy to Frontend

```bash
cp backend/public/markets-index.json frontend/public/
```

### 6. Restart Frontend

```bash
cd frontend
npm run dev
```

---

## ✅ Verify

1. Buka dashboard: http://localhost:3000
2. Market baru harus muncul di list
3. Klik market - pertanyaan harus readable
4. Cek "Verify On-Chain" link

---

## 🔍 Troubleshooting

### Transaction Failed
- ✅ Check wallet balance (need credits for fees)
- ✅ Verify network connection
- ✅ Check block height masih valid

### Market Tidak Muncul di Dashboard
- ✅ Clear browser cache (Ctrl+Shift+R)
- ✅ Check console untuk errors
- ✅ Verify markets-index.json sudah ter-copy
- ✅ Restart frontend dev server

---

**Siap untuk create market! Jalankan script di atas.** 🚀
