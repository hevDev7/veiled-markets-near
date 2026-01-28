# Veiled Markets - Indexer Service Guide

## Mengapa Perlu Indexer?

Hardcoding market IDs di frontend **bukan solusi jangka panjang** karena:

1. ❌ Setiap market baru harus manual update code
2. ❌ Tidak scalable untuk ratusan/ribuan markets
3. ❌ Memerlukan redeploy setiap ada market baru
4. ❌ Tidak real-time

## Solusi: Blockchain Indexer

Indexer service yang:
- ✅ Scan blockchain untuk semua transaksi `create_market`
- ✅ Extract market IDs otomatis
- ✅ Save ke JSON file yang bisa di-load frontend
- ✅ Bisa di-run secara periodic (cron job)

## Arsitektur

```
┌─────────────────┐
│ Aleo Blockchain │
└────────┬────────┘
         │
         │ Scan transactions
         ▼
┌─────────────────┐
│ Indexer Service │ (backend/src/indexer.ts)
└────────┬────────┘
         │
         │ Generate JSON
         ▼
┌─────────────────┐
│ markets-index   │ (frontend/public/markets-index.json)
│     .json       │
└────────┬────────┘
         │
         │ Load on startup
         ▼
┌─────────────────┐
│ Frontend App    │
└─────────────────┘
```

## Cara Menggunakan

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Run Indexer

```bash
# Manual run
npm run index

# Or use script
cd ..
chmod +x scripts/index-markets.sh
./scripts/index-markets.sh
```

### 3. Hasil

File `frontend/public/markets-index.json` akan berisi:

```json
{
  "lastUpdated": "2026-01-28T10:30:00.000Z",
  "totalMarkets": 8,
  "marketIds": [
    "2226266059345959235903805886443078929600424190236962232761580543397941034862field",
    "1343955940696835063665090431790223713510436410586241525974362313497380512445field",
    ...
  ],
  "markets": [
    {
      "marketId": "...",
      "transactionId": "at1...",
      "questionHash": "10001field",
      "category": 1,
      "deadline": "14107191u64",
      ...
    }
  ]
}
```

### 4. Frontend Auto-Load

Frontend akan otomatis load market IDs saat startup:

```typescript
// App.tsx
useEffect(() => {
  initializeMarketIds(); // Load from markets-index.json
}, []);
```

## Deployment Workflow

### Development
```bash
# 1. Create new market via CLI
cd contracts
leo execute create_market ...

# 2. Run indexer
cd ../backend
npm run index

# 3. Frontend auto-reload dengan market baru
```

### Production (Vercel)

#### Option A: Pre-build Indexing
```bash
# package.json
{
  "scripts": {
    "prebuild": "cd backend && npm install && npm run index",
    "build": "vite build"
  }
}
```

#### Option B: Scheduled Indexing (Vercel Cron)
```javascript
// api/cron/index-markets.js
export default async function handler(req, res) {
  // Run indexer
  const markets = await indexAllMarkets();
  
  // Save to Vercel KV or file
  await saveToStorage(markets);
  
  res.json({ success: true, count: markets.length });
}
```

```json
// vercel.json
{
  "crons": [{
    "path": "/api/cron/index-markets",
    "schedule": "0 */6 * * *"  // Every 6 hours
  }]
}
```

## Solusi Alternatif

### 1. On-chain Registry (Paling Ideal)

Modifikasi contract untuk track market IDs:

```leo
// main.leo
mapping market_registry: u64 => field; // index => market_id
mapping market_count: u8 => u64;       // total count

transition create_market(...) {
  // ... existing code ...
  
  // Add to registry
  let count = market_count.get_or_use(0u8, 0u64);
  market_registry.set(count, market_id);
  market_count.set(0u8, count + 1u64);
}
```

**Pros:**
- ✅ Fully on-chain
- ✅ No external indexer needed
- ✅ Query via RPC

**Cons:**
- ❌ Requires contract redeployment
- ❌ Gas cost untuk maintain registry
- ❌ Limited by mapping size

### 2. IPFS + On-chain Hash

Store market metadata di IPFS, hash di contract:

```leo
transition create_market(ipfs_hash: field, ...) {
  // Store IPFS hash instead of full data
}
```

**Pros:**
- ✅ Unlimited metadata storage
- ✅ Decentralized

**Cons:**
- ❌ Requires IPFS infrastructure
- ❌ Additional complexity

### 3. Centralized API (Fastest)

Backend API dengan database:

```
POST /api/markets -> Save to DB
GET  /api/markets -> Return all markets
```

**Pros:**
- ✅ Fast queries
- ✅ Rich filtering/sorting
- ✅ Real-time updates

**Cons:**
- ❌ Centralized
- ❌ Requires backend infrastructure

## Rekomendasi

### Short-term (Sekarang)
✅ **Gunakan Indexer Service** (sudah diimplementasikan)
- Run manual sebelum deploy
- Simple, no infrastructure needed
- Good enough untuk MVP

### Medium-term (1-3 bulan)
✅ **Add Vercel Cron Job**
- Auto-index setiap 6 jam
- No manual intervention
- Still serverless

### Long-term (Production)
✅ **On-chain Registry + Indexer**
- Modify contract untuk track IDs
- Indexer sebagai backup/cache
- Best of both worlds

## Monitoring

Track indexer health:

```bash
# Check last update time
cat frontend/public/markets-index.json | jq '.lastUpdated'

# Check market count
cat frontend/public/markets-index.json | jq '.totalMarkets'

# List all market IDs
cat frontend/public/markets-index.json | jq '.marketIds[]'
```

## Troubleshooting

### Indexer tidak menemukan markets
- Check API endpoint: `https://api.explorer.provable.com/v1/testnet`
- Verify program ID: `veiled_markets.aleo`
- Check transaction format

### Frontend tidak load indexed data
- Verify file exists: `frontend/public/markets-index.json`
- Check browser console untuk errors
- Fallback ke hardcoded IDs akan digunakan

### Markets tidak update
- Run indexer lagi: `npm run index`
- Check timestamp di JSON file
- Verify new transactions di explorer

## Kesimpulan

Indexer service adalah **solusi praktis jangka panjang** yang:
- ✅ Eliminates hardcoding
- ✅ Scalable untuk ribuan markets
- ✅ No contract changes needed
- ✅ Easy to deploy dan maintain

Untuk production, combine dengan Vercel Cron untuk auto-update.
