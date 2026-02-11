# 🔍 Debug: Bet Rejection untuk Market Baru

## 📊 Market Info

- **Market ID:** `6799979859013350088666057543392479876047176358286654383237647068200827543742field`
- **Transaction ID:** `at1cwm8msj2y4z23suhtsghyahl34xexflz3x5kwhfh34pt2yplqqrstutuwz`
- **Created At Block:** 14109613
- **Betting Deadline:** 14149933
- **Current Block:** ~14109613+ (check current)

---

## 🔍 Possible Causes of Rejection

### 1. Market Pool Not Initialized ❌

**Problem:** Pool mungkin belum ter-initialize saat market dibuat.

**Check:**
```bash
curl "https://api.explorer.provable.com/v1/testnet/program/veiled_market_v3.aleo/mapping/market_pools/6799979859013350088666057543392479876047176358286654383237647068200827543742field"
```

**Expected:** Should return pool data with zeros.

**Fix:** Pool harus ter-initialize saat `create_market`. Cek apakah `create_market_onchain` benar-benar initialize pool.

---

### 2. Market Status Not ACTIVE ❌

**Problem:** Market status mungkin bukan `MARKET_STATUS_ACTIVE` (1).

**Check:**
```bash
curl "https://api.explorer.provable.com/v1/testnet/program/veiled_market_v3.aleo/mapping/markets/6799979859013350088666057543392479876047176358286654383237647068200827543742field"
```

**Expected:** `"status": 1` (ACTIVE)

**Fix:** Market harus dibuat dengan status ACTIVE.

---

### 3. Deadline Already Passed ❌

**Problem:** Current block height sudah melewati deadline (tidak mungkin karena baru dibuat).

**Check:**
```bash
curl "https://api.explorer.provable.com/v1/testnet/latest/height"
```

**Expected:** Current block < 14149933

---

### 4. Insufficient Balance ❌

**Problem:** User tidak punya cukup credits untuk bet + fees.

**Check:**
- User balance harus >= bet amount + transaction fees
- Minimum bet: 1000 microcredits (0.001 credits)
- Transaction fee: ~0.004 credits

---

### 5. Market Not Found ❌

**Problem:** Market ID salah atau market belum ter-deploy dengan benar.

**Check:**
```bash
curl "https://api.explorer.provable.com/v1/testnet/program/veiled_market_v3.aleo/mapping/markets/6799979859013350088666057543392479876047176358286654383237647068200827543742field"
```

**Expected:** Should return market data.

---

## 🔧 Debugging Steps

### Step 1: Check Market Exists

```bash
curl "https://api.explorer.provable.com/v1/testnet/program/veiled_market_v3.aleo/mapping/markets/6799979859013350088666057543392479876047176358286654383237647068200827543742field"
```

**Expected Output:**
```json
{
  "id": "6799979859013350088666057543392479876047176358286654383237647068200827543742field",
  "status": 1,
  "deadline": "14149933u64",
  ...
}
```

---

### Step 2: Check Pool Exists

```bash
curl "https://api.explorer.provable.com/v1/testnet/program/veiled_market_v3.aleo/mapping/market_pools/6799979859013350088666057543392479876047176358286654383237647068200827543742field"
```

**Expected Output:**
```json
{
  "market_id": "6799979859013350088666057543392479876047176358286654383237647068200827543742field",
  "total_yes_pool": "0u64",
  "total_no_pool": "0u64",
  ...
}
```

---

### Step 3: Check Current Block Height

```bash
curl "https://api.explorer.provable.com/v1/testnet/latest/height"
```

**Expected:** Should be < 14149933 (betting deadline)

---

### Step 4: Try Place Bet Again

```bash
cd contracts
leo execute veiled_market_v3.aleo/place_bet \
  "6799979859013350088666057543392479876047176358286654383237647068200827543742field" \
  "1000000u64" \
  "1u8" \
  --network testnet \
  --broadcast
```

**Check error message** dari output untuk detail rejection reason.

---

## 🐛 Common Issues & Fixes

### Issue 1: Pool Not Found

**Error:** `Mapping not found` atau `market_pools[market_id]` doesn't exist

**Cause:** Pool tidak ter-initialize saat market creation.

**Fix:** Pastikan `create_market_onchain` benar-benar initialize pool:
```leo
market_pools.set(market_id, initial_pool);
```

---

### Issue 2: Market Status Not ACTIVE

**Error:** Assertion failed pada `market.status == MARKET_STATUS_ACTIVE`

**Cause:** Market dibuat dengan status yang salah.

**Fix:** Pastikan market dibuat dengan `status: MARKET_STATUS_ACTIVE` (1).

---

### Issue 3: Transfer Failed

**Error:** Credits transfer failed

**Cause:** 
- Insufficient balance
- Wrong program address

**Fix:**
- Check user balance
- Verify program address: `veiled_market_v3.aleo`

---

## 📝 Next Steps

1. ✅ Check market exists di explorer
2. ✅ Check pool exists di explorer  
3. ✅ Check current block height
4. ✅ Try place bet dengan verbose output
5. ✅ Check error message untuk detail

---

**Jalankan debugging steps di atas untuk identify masalah!** 🔍
