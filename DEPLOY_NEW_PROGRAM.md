# 🚀 Deploy Program Baru - veiled_market_v3.aleo

## 📋 Status

✅ **Build Berhasil!**
- Program: `veiled_market_v3.aleo`
- Checksum: `[78u8, 139u8, 253u8, 177u8, ...]`
- Status: Siap untuk deploy

## 🔄 Perubahan

Karena upgrade di-reject oleh network, kita deploy sebagai **program baru** dengan nama berbeda:

**Old:** `veiled_markets_privacy.aleo` (sudah ada di blockchain)  
**New:** `veiled_market_v3.aleo` (program baru - versi 3)

## 🚀 Deployment

### Quick Deploy

```bash
cd contracts
source .env
leo deploy --network testnet --broadcast --private-key "$PRIVATE_KEY"
```

**Atau gunakan script:**
```bash
cd contracts
./deploy-commit-reveal.sh
```

## 📊 Expected Cost

Berdasarkan deployment sebelumnya:
- **Transaction Storage:** ~17 credits
- **Program Synthesis:** ~1 credit
- **Namespace:** 1 credit
- **Constructor:** ~0.002 credits
- **Total Estimated:** ~19-20 credits

## ✅ After Deployment

### 1. Verify Deployment

Cek di explorer:
```
https://testnet.explorer.provable.com/program/veiled_market_v3.aleo
```

### 2. Update Frontend/Backend

Update semua referensi dari:
- `veiled_markets_privacy.aleo` → `veiled_market_v3.aleo`

Files yang perlu di-update:
- `frontend/src/lib/config.ts`
- `frontend/src/lib/aleo-client.ts`
- `backend/src/config.ts`
- `sdk/src/client.ts`

### 3. Test New Functions

```bash
# Test commit_bet
leo run commit_bet \
  "MARKET_ID_field" \
  "1000000u64" \
  "1u8" \
  "CREDITS_RECORD" \
  --network testnet

# Test reveal_bet (after deadline)
leo run reveal_bet \
  "BET_RECORD" \
  "COMMITMENT_RECORD" \
  "CREDITS_RECORD" \
  "1000000u64" \
  --network testnet
```

## 📝 Notes

1. ✅ **Program baru** - tidak conflict dengan program lama
2. ✅ **Semua fitur baru** - commit-reveal scheme tersedia
3. ✅ **Backward compatible** - `place_bet` masih tersedia
4. ⚠️ **Update references** - perlu update frontend/backend

---

**Siap untuk deploy! Jalankan command di atas.** 🎯
