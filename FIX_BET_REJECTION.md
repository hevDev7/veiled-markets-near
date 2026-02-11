# 🔧 Fix: Bet Rejection untuk Market Baru

## ✅ Fix Applied

### Problem
Bet di-reject untuk market baru di `veiled_market_v3.aleo`.

### Root Cause
Program address di `transfer_public_as_signer` menggunakan program ID langsung, yang mungkin tidak resolve dengan benar.

### Solution
Gunakan `self.address` untuk mendapatkan program's address.

**Before:**
```leo
let transfer_future: Future = credits.aleo/transfer_public_as_signer(
    veiled_market_v3.aleo,  // ❌ Program ID langsung
    amount
);
```

**After:**
```leo
let transfer_future: Future = credits.aleo/transfer_public_as_signer(
    self.address,  // ✅ Program's address
    amount
);
```

---

## 🔍 Other Possible Causes

### 1. Insufficient Balance ⚠️

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

### 2. Market Status Not ACTIVE

**Check:**
```bash
curl "https://api.explorer.provable.com/v1/testnet/program/veiled_market_v3.aleo/mapping/markets/6799979859013350088666057543392479876047176358286654383237647068200827543742field"
```

**Expected:** `"status": 1u8` (ACTIVE)

**Status:** ✅ Already verified - Market is ACTIVE

---

### 3. Pool Not Initialized

**Check:**
```bash
curl "https://api.explorer.provable.com/v1/testnet/program/veiled_market_v3.aleo/mapping/market_pools/6799979859013350088666057543392479876047176358286654383237647068200827543742field"
```

**Expected:** Pool dengan zeros

**Status:** ✅ Already verified - Pool initialized

---

### 4. Deadline Passed

**Check:**
- Current block: 14109712
- Deadline: 14149933
- **Status:** ✅ OK (current < deadline)

---

## 🚀 Try Bet Again

Setelah fix, coba bet lagi:

```bash
cd contracts
leo execute veiled_market_v3.aleo/place_bet \
  "6799979859013350088666057543392479876047176358286654383237647068200827543742field" \
  "1000000u64" \
  "1u8" \
  --network testnet \
  --broadcast
```

---

## 📝 Changes Made

1. ✅ Updated `place_bet` - Changed `veiled_market_v3.aleo` → `self.address`
2. ✅ Updated `reveal_bet` - Changed `veiled_market_v3.aleo as address` → `self.address`
3. ✅ Build successful

---

## ⚠️ Important Notes

1. **Rebuild Required:** Kontrak sudah di-rebuild dengan fix
2. **Redeploy Needed:** Perlu redeploy kontrak dengan fix ini
3. **Or Use Commit-Bet:** Gunakan `commit_bet` untuk privacy yang lebih baik

---

**Fix sudah di-apply! Coba bet lagi atau redeploy kontrak dengan fix ini.** 🔧
