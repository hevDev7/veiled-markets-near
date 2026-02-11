# 🔍 Troubleshoot: Bet Rejection untuk Market Baru

## ✅ Market Status Check

**Market exists:** ✅  
**Pool initialized:** ✅  
**Status:** ACTIVE (1u8) ✅  
**Current Block:** 14109712  
**Deadline:** 14149933 ✅ (current < deadline)

---

## 🔍 Possible Causes

### 1. Insufficient Balance ❌

**Most Common Issue**

**Check:**
- User balance harus >= bet amount + transaction fees
- Minimum bet: 1000 microcredits (0.001 credits)
- Transaction fee: ~0.004 credits
- **Total needed:** bet amount + ~0.004 credits

**Solution:**
```bash
# Check balance
curl "https://api.explorer.provable.com/v1/testnet/address/aleo10tm5ektsr5v7kdc5phs8pha42vrkhe2rlxfl2v979wunhzx07vpqnqplv8"
```

---

### 2. Program Address Issue ❌

**Problem:** Program address mungkin salah di transfer.

**Check:**
Di kontrak line 361:
```leo
let transfer_future: Future = credits.aleo/transfer_public_as_signer(
    veiled_market_v3.aleo,  // ← Check ini benar
    amount
);
```

**Fix:** Pastikan program address benar. Untuk deployed program, harus menggunakan program ID.

---

### 3. Market Pool Access Issue ❌

**Problem:** Pool mungkin tidak bisa di-access saat finalize.

**Check:**
Line 404 di kontrak:
```leo
let pool: MarketPool = market_pools.get(market_id);
```

Jika pool tidak ada, ini akan fail. Tapi kita sudah verify pool exists.

---

### 4. Block Height Issue ❌

**Problem:** Block height saat execute berbeda dengan saat finalize.

**Check:**
- Current block: 14109712
- Deadline: 14149933
- Should be OK, tapi mungkin ada race condition.

---

## 🔧 Debugging Commands

### Check Market Status

```bash
curl "https://api.explorer.provable.com/v1/testnet/program/veiled_market_v3.aleo/mapping/markets/6799979859013350088666057543392479876047176358286654383237647068200827543742field"
```

**Expected:** Status = 1u8 (ACTIVE)

---

### Check Pool Status

```bash
curl "https://api.explorer.provable.com/v1/testnet/program/veiled_market_v3.aleo/mapping/market_pools/6799979859013350088666057543392479876047176358286654383237647068200827543742field"
```

**Expected:** Pool dengan zeros

---

### Check Current Block

```bash
curl "https://api.explorer.provable.com/v1/testnet/latest/height"
```

**Expected:** < 14149933

---

### Try Place Bet with Verbose

```bash
cd contracts
leo execute veiled_market_v3.aleo/place_bet \
  "6799979859013350088666057543392479876047176358286654383237647068200827543742field" \
  "1000000u64" \
  "1u8" \
  --network testnet \
  --broadcast \
  --print
```

**Check error message** untuk detail rejection reason.

---

## 💡 Most Likely Issue

Berdasarkan check di atas, kemungkinan besar masalahnya adalah:

### **Insufficient Balance** ⚠️

User mungkin tidak punya cukup credits untuk:
- Bet amount (min 1000 microcredits = 0.001 credits)
- Transaction fees (~0.004 credits)
- **Total:** ~0.005 credits minimum

**Check balance:**
```bash
# From terminal output, balance was: 2.236061 credits
# This should be enough, tapi mungkin sudah berkurang
```

---

## 🔧 Quick Fix

### Option 1: Check Balance First

```bash
# Check current balance
curl "https://api.explorer.provable.com/v1/testnet/address/aleo10tm5ektsr5v7kdc5phs8pha42vrkhe2rlxfl2v979wunhzx07vpqnqplv8"
```

### Option 2: Try Smaller Bet Amount

```bash
cd contracts
leo execute veiled_market_v3.aleo/place_bet \
  "6799979859013350088666057543392479876047176358286654383237647068200827543742field" \
  "1000u64" \
  "1u8" \
  --network testnet \
  --broadcast
```

Minimum bet adalah 1000 microcredits (0.001 credits).

---

## 📝 Next Steps

1. ✅ Check user balance
2. ✅ Try bet dengan amount lebih kecil
3. ✅ Check error message dari rejected transaction
4. ✅ Verify program address di transfer

---

**Coba check balance dan bet dengan amount lebih kecil!** 🔍
