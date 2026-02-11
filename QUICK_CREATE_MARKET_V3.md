# ⚡ Quick Create Market - veiled_market_v3.aleo

## 🚀 One Command

```bash
cd contracts
./create-market-v3.sh
```

**Atau manual:**

```bash
cd contracts
source .env

# Get current block
CURRENT_BLOCK=$(curl -s "https://api.explorer.provable.com/v1/testnet/latest/height")
BETTING_DEADLINE=$((CURRENT_BLOCK + 40320))  # 7 days
RESOLUTION_DEADLINE=$((CURRENT_BLOCK + 57600))  # 10 days

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

## 📝 Market Info

**Question:** "Will Ethereum reach $10,000 by end of Q2 2026?"  
**Hash:** `350929565016816493992297964402345071115472527106339097957348390879136520853field`  
**Category:** 3 (Crypto)

---

## ✅ After Creation

1. **Save TX ID & Market ID** dari output
2. **Update backend/src/indexer.ts** - tambah ke KNOWN_MARKETS
3. **Update frontend/src/lib/question-mapping.ts** - tambah mapping
4. **Run:** `cd backend && npm run index`
5. **Copy:** `cp backend/public/markets-index.json frontend/public/`
6. **Restart frontend**

---

**Jalankan script di atas untuk create market!** 🎯
