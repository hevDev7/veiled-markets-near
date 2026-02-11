# 🚀 Deployment Instructions - Phase 2 Commit-Reveal Scheme

## 📋 Pre-Deployment Checklist

- [x] ✅ Contract built successfully
- [x] ✅ Program checksum: `[243u8, 49u8, 198u8, 85u8, 231u8, 211u8, 147u8, 238u8, 124u8, 213u8, 48u8, 99u8, 114u8, 157u8, 211u8, 104u8, 39u8, 62u8, 75u8, 167u8, 164u8, 179u8, 167u8, 248u8, 150u8, 201u8, 83u8, 88u8, 47u8, 123u8, 33u8, 27u8]`
- [x] ✅ Network: testnet
- [x] ✅ Program: veiled_markets_privacy.aleo

---

## 🔧 Manual Deployment Steps

### Option 1: Using leo upgrade (Recommended)

Karena program `veiled_markets_privacy.aleo` sudah pernah di-deploy, gunakan `leo upgrade`:

```bash
cd contracts

# Load environment
source .env

# Upgrade program
leo upgrade \
    --network testnet \
    --broadcast \
    --private-key "$PRIVATE_KEY"
```

**Note:** Anda akan diminta konfirmasi di terminal. Ketik `y` untuk melanjutkan.

---

### Option 2: Using deploy script

```bash
cd contracts
./deploy-phase2.sh
```

Script akan otomatis detect apakah program sudah ada dan menggunakan `upgrade` atau `deploy`.

---

## 📊 Deployment Summary

### What's Being Deployed

**Program:** `veiled_markets_privacy.aleo`

**New Features (Phase 2):**
- ✅ `commit_bet` - Commit bet dengan private amount/outcome
- ✅ `reveal_bet` - Reveal bet setelah deadline
- ✅ Enhanced privacy (8/10 score)
- ✅ Commit-reveal scheme

**Existing Features (Still Available):**
- ✅ `place_bet` - Legacy betting (backward compatible)
- ✅ `create_market` - Create markets
- ✅ `resolve_market` - Resolve markets
- ✅ `claim_winnings` - Claim winnings
- ✅ All other existing functions

---

## 💰 Estimated Costs

Berdasarkan deployment sebelumnya:
- **Transaction Storage:** ~14 credits
- **Program Synthesis:** ~0.6 credits
- **Namespace:** 1 credit (jika upgrade, mungkin tidak perlu)
- **Priority Fee:** 0 credits (optional)
- **Total Estimated:** ~15-16 credits

**Note:** Upgrade biasanya lebih murah daripada deploy baru karena namespace sudah ada.

---

## 🔍 Verification Steps

### 1. Check Deployment Status

Setelah deployment, verifikasi di explorer:
```
https://testnet.explorer.provable.com/program/veiled_markets_privacy.aleo
```

### 2. Verify New Functions

Check bahwa fungsi baru tersedia:
- `commit_bet` transition
- `reveal_bet` transition
- `bet_commitments` mapping
- `revealed_bets` mapping

### 3. Test Commit-Reveal Flow

```bash
# Step 1: Commit bet (private)
leo run commit_bet \
  "MARKET_ID_field" \
  "1000000u64" \
  "1u8" \
  "CREDITS_RECORD" \
  --network testnet

# Step 2: After deadline, reveal bet
leo run reveal_bet \
  "BET_RECORD" \
  "COMMITMENT_RECORD" \
  "CREDITS_RECORD" \
  "1000000u64" \
  --network testnet
```

---

## ⚠️ Important Notes

### 1. Backward Compatibility

✅ **Existing functions tetap bekerja:**
- `place_bet` masih tersedia
- Semua existing bets tetap valid
- Tidak ada breaking changes

### 2. Program Upgrade

⚠️ **Upgrade akan:**
- Update program code dengan fitur baru
- Menambahkan mappings baru (`bet_commitments`, `revealed_bets`)
- Menambahkan transitions baru (`commit_bet`, `reveal_bet`)
- **TIDAK** menghapus existing data

### 3. Credits Record Storage

⚠️ **Penting untuk commit-reveal:**
- User **HARUS** menyimpan `bet_amount_record` dari `commit_bet`
- Record diperlukan untuk `reveal_bet`
- Tanpa record, tidak bisa reveal

---

## 🐛 Troubleshooting

### Error: "Program not found"
**Solution:** Gunakan `leo deploy` instead of `leo upgrade`

### Error: "Insufficient balance"
**Solution:** Pastikan ada cukup credits (~20 credits untuk safety)

### Error: "Failed to prompt user"
**Solution:** Jalankan command secara manual di terminal (bukan script)

### Error: "Transaction rejected"
**Solution:** 
- Check network connectivity
- Verify private key correct
- Check balance sufficient
- Wait a few minutes and retry

---

## 📚 Post-Deployment Steps

### 1. Update Frontend (Optional)

Jika ingin menggunakan commit-reveal di frontend:

```typescript
// frontend/src/lib/aleo-client.ts
export const COMMIT_REVEAL_ENABLED = true;
```

### 2. Update Documentation

- [ ] Update README dengan fitur baru
- [ ] Update API documentation
- [ ] Create user guide untuk commit-reveal

### 3. Testing

- [ ] Test commit_bet dengan berbagai amounts
- [ ] Test reveal_bet setelah deadline
- [ ] Test backward compatibility dengan place_bet
- [ ] Test double reveal prevention

---

## ✅ Deployment Checklist

- [ ] Contract built successfully
- [ ] Environment variables set (.env file)
- [ ] Sufficient balance (~20 credits)
- [ ] Run `leo upgrade` command
- [ ] Confirm deployment in terminal
- [ ] Verify deployment di explorer
- [ ] Test new functions
- [ ] Update documentation

---

## 🎯 Quick Command Reference

```bash
# Build
cd contracts && leo build

# Upgrade (if program exists)
leo upgrade --network testnet --broadcast --private-key "$PRIVATE_KEY"

# Deploy (if program doesn't exist)
leo deploy --network testnet --broadcast --private-key "$PRIVATE_KEY"

# Verify
curl https://api.explorer.provable.com/v1/testnet/program/veiled_markets_privacy.aleo
```

---

**Siap untuk deploy! Jalankan command di atas secara manual di terminal.** 🚀
