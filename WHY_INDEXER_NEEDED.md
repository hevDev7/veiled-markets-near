# Kenapa Market Harus Ada di Index JSON?

## TL;DR
**Aleo blockchain API tidak menyediakan endpoint untuk "list all markets"** - kita harus tahu Market ID terlebih dahulu untuk fetch datanya. Ini adalah limitasi dari Aleo Explorer API, bukan design choice kita.

## Masalah: Aleo API Limitation

### Yang TIDAK Ada di Aleo API:
```
❌ GET /program/{program_id}/markets  (tidak ada)
❌ GET /program/{program_id}/mappings/markets  (tidak ada)
❌ List all keys in a mapping  (tidak ada)
```

### Yang Ada di Aleo API:
```
✅ GET /program/{program_id}/mapping/{mapping_name}/{key}
   → Harus tahu KEY (market ID) terlebih dahulu!
```

## Contoh Masalah

```typescript
// ❌ TIDAK BISA: List semua market
const markets = await fetch(`/program/veiled_markets_v2.aleo/markets`)

// ✅ BISA: Fetch market jika tahu ID-nya
const market = await fetch(`/program/veiled_markets_v2.aleo/mapping/markets/1827467977...field`)
```

## Solusi Saat Ini (3 Sumber)

### 1. **localStorage** (Prioritas Tertinggi)
```javascript
// Market yang dibuat oleh user ini
localStorage.getItem('veiled_markets_known_ids')
// → ["1827467977240901494339036217017462683817421549474947615723082367626884127079field"]
```

**Keuntungan:**
- ✅ Otomatis muncul setelah user buat market
- ✅ Tidak perlu indexer
- ✅ Real-time

**Limitasi:**
- ⚠️ Hanya market yang dibuat di browser ini
- ⚠️ Hilang jika clear browser data

### 2. **Indexer JSON** (Backend Service)
```json
// /markets-index.json
{
  "marketIds": [
    "1827467977240901494339036217017462683817421549474947615723082367626884127079field"
  ]
}
```

**Keuntungan:**
- ✅ Semua user bisa lihat semua market
- ✅ Persistent (tidak hilang)
- ✅ Bisa di-update secara berkala

**Limitasi:**
- ⚠️ Perlu backend service
- ⚠️ Perlu manual update atau cron job

### 3. **Fallback Hardcode**
```typescript
let KNOWN_MARKET_IDS = [
  '1827467977240901494339036217017462683817421549474947615723082367626884127079field',
];
```

**Keuntungan:**
- ✅ Selalu ada (tidak bergantung pada service lain)

**Limitasi:**
- ⚠️ Harus manual update code
- ⚠️ Tidak scalable

## Alur Saat Ini (Sudah Diperbaiki)

```
1. User buat market baru
   ↓
2. Market ID disimpan ke localStorage
   ↓
3. fetchAllMarkets() membaca dari:
   - localStorage (market user ini) ✅
   - indexer JSON (market semua user) ✅
   - fallback hardcode ✅
   ↓
4. Market langsung muncul di dashboard!
```

## Kode yang Sudah Diperbaiki

### Before (Hanya dari indexer):
```typescript
async function loadMarketIdsFromIndexer(): Promise<string[]> {
  const response = await fetch('/markets-index.json');
  return response.json().marketIds;  // ❌ Hanya dari indexer
}
```

### After (3 sumber):
```typescript
async function loadMarketIdsFromIndexer(): Promise<string[]> {
  const allMarketIds = new Set<string>();

  // 1. localStorage (user-created markets)
  const localIds = localStorage.getItem('veiled_markets_known_ids');
  if (localIds) {
    JSON.parse(localIds).forEach(id => allMarketIds.add(id));
  }

  // 2. Indexer JSON (all markets)
  const response = await fetch('/markets-index.json');
  if (response.ok) {
    const data = await response.json();
    data.marketIds.forEach(id => allMarketIds.add(id));
  }

  // 3. Fallback hardcode
  KNOWN_MARKET_IDS.forEach(id => allMarketIds.add(id));

  return Array.from(allMarketIds);
}
```

## Solusi Jangka Panjang

### Option 1: Custom Indexer Service
```
Backend service yang:
- Monitor blockchain untuk event create_market
- Parse transaction outputs untuk extract market ID
- Update database/JSON secara real-time
```

### Option 2: Aleo Event Logs
```
Jika Aleo menambahkan event logs:
- Listen to CreateMarket events
- Extract market ID dari event
- Auto-update market list
```

### Option 3: Subgraph (The Graph Protocol)
```
Jika Aleo support The Graph:
- Define schema untuk Market entity
- Query semua markets dengan GraphQL
- Real-time updates
```

### Option 4: Aleo API Enhancement
```
Request ke Aleo team untuk menambahkan:
GET /program/{id}/mapping/{name}/keys
→ Return semua keys dalam mapping
```

## Testing

### Test 1: Market Baru Muncul Otomatis
```bash
1. Buat market baru via UI
2. Tunggu transaction confirm
3. Refresh dashboard
4. ✅ Market langsung muncul (dari localStorage)
```

### Test 2: Market Persisten
```bash
1. Buat market baru
2. Close browser
3. Open browser lagi
4. ✅ Market masih ada (dari localStorage)
```

### Test 3: Market Visible ke User Lain
```bash
1. User A buat market
2. Run indexer: npm run index (backend)
3. Copy JSON ke frontend
4. User B buka app
5. ✅ User B bisa lihat market User A (dari indexer)
```

## Kesimpulan

**Indexer diperlukan karena:**
1. ❌ Aleo API tidak support "list all markets"
2. ✅ Kita harus track market IDs sendiri
3. ✅ localStorage untuk market user sendiri (otomatis)
4. ✅ Indexer JSON untuk market semua user (manual/cron)

**Dengan update terbaru:**
- Market yang baru dibuat **langsung muncul** (localStorage)
- Market dari user lain muncul setelah **indexer di-run**
- Tidak perlu hardcode lagi untuk market baru!

## File yang Diupdate

1. ✅ `frontend/src/lib/aleo-client.ts`
   - `loadMarketIdsFromIndexer()` - Baca dari 3 sumber
   - `refreshMarketIds()` - Refresh setelah create market
   - `waitForMarketCreation()` - Auto-refresh setelah confirm

2. ✅ `WHY_INDEXER_NEEDED.md` - Dokumentasi ini

## Next Steps

Untuk production, pertimbangkan:
1. **Backend Indexer Service** - Auto-scan blockchain
2. **WebSocket Updates** - Real-time market updates
3. **IPFS/Arweave** - Decentralized market registry
4. **The Graph** - Jika Aleo support subgraph
