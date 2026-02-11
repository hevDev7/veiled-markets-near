# 🔧 Fix: Create Market Command

## ❌ Error

```
Error [ECLI0377042]: Running `leo execute create_market ...`, without an explicit program name requires that your current working directory is a valid Leo project.
```

## ✅ Solution

Perlu specify program name dengan format: `program/function`

### Fixed Command

```bash
leo execute veiled_market_v3.aleo/create_market \
  "350929565016816493992297964402345071115472527106339097957348390879136520853field" \
  "3u8" \
  "14149922u64" \
  "14167202u64" \
  --network testnet \
  --broadcast
```

**Format:** `veiled_market_v3.aleo/create_market` (bukan `veiled_market_v3.aleo create_market`)

---

## 🚀 Try Again

```bash
cd contracts
./create-market-v3.sh
```

Script sudah di-update dengan format yang benar! ✅
