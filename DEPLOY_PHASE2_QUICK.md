# ⚡ Quick Deploy - Phase 2

## 🚀 One-Line Command

```bash
cd contracts && leo upgrade --network testnet --broadcast --private-key "$(grep PRIVATE_KEY .env | cut -d '=' -f2)"
```

**Atau:**

```bash
cd contracts
source .env
leo upgrade --network testnet --broadcast --private-key "$PRIVATE_KEY"
```

## ✅ What Happens

1. Leo akan compile kontrak
2. Leo akan show deployment plan
3. **Anda perlu ketik `y` untuk konfirmasi**
4. Transaction akan di-broadcast
5. Tunggu 1-2 menit untuk konfirmasi

## 🔍 Verify

Setelah deployment, cek di:
```
https://testnet.explorer.provable.com/program/veiled_markets_privacy.aleo
```

## 📊 Expected Output

```
📦 Deployment Tasks:
  • veiled_markets_privacy.aleo  │ priority fee: 0  │ fee record: no (public fee)

⚙️ Actions:
  • Transaction(s) will be broadcast to https://api.explorer.provable.com/v1

? Continue with deployment? (y/N): y

✅ Transaction broadcasted!
```

---

**Jalankan command di atas di terminal Anda!** 🎯
