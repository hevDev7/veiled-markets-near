# 🚀 Quick Deploy Guide - Veiled Markets

## Status Saat Ini

✅ **Kontrak sudah di-build!**
- Program: `veiled_markets.aleo`
- Size: 8.62 KB
- Ready to deploy!

## Langkah Deploy (3 Langkah Mudah)

### 1️⃣ Dapatkan Testnet Credits

Sebelum deploy, Anda perlu credits testnet:

**Cara 1: Via Faucet Website**
```
1. Buka: https://faucet.aleo.org
2. Masukkan address Anda: aleo10tm5ektsr5v7kdc5phs8pha42vrkhe2rlxfl2v979wunhzx07vpqnqplv8
3. Klik "Request Credits"
4. Tunggu 1-2 menit
```

**Cara 2: Via Discord**
```
1. Join Aleo Discord: https://discord.gg/aleo
2. Ke channel #faucet
3. Ketik: !faucet aleo10tm5ektsr5v7kdc5phs8pha42vrkhe2rlxfl2v979wunhzx07vpqnqplv8
```

**Cek Balance:**
```bash
snarkos account balance \
  --address aleo10tm5ektsr5v7kdc5phs8pha42vrkhe2rlxfl2v979wunhzx07vpqnqplv8 \
  --endpoint https://api.explorer.provable.com/v1/testnet
```

### 2️⃣ Deploy Kontrak

**Opsi A: Deploy dengan Leo (Paling Mudah)**
```bash
cd contracts
leo deploy --network testnet
```

**Opsi B: Deploy dengan Script**
```bash
cd contracts
./deploy-simple.sh
```

**Opsi C: Deploy dengan snarkOS**
```bash
cd contracts
snarkos developer deploy veiled_markets.aleo \
  --private-key $ALEO_PRIVATE_KEY \
  --query https://api.explorer.provable.com/v1/testnet \
  --path ./build \
  --broadcast https://api.explorer.provable.com/v1/testnet/transaction/broadcast \
  --priority-fee 1000000
```

### 3️⃣ Verifikasi Deployment

Setelah deploy (tunggu 1-2 menit), cek di explorer:

```
https://testnet.explorer.provable.com/program/veiled_markets.aleo
```

## Biaya Deploy

- **Estimasi**: 5-10 testnet credits
- **Priority fee**: 0.001 credits
- **Total waktu**: 1-2 menit

## Setelah Deploy

1. **Update Frontend Config**
   
   Edit `frontend/src/lib/config.ts`:
   ```typescript
   export const PROGRAM_ID = 'veiled_markets.aleo'
   export const NETWORK = 'testnet'
   ```

2. **Test Contract**
   ```bash
   cd contracts
   
   # Test create market
   leo run create_market \
     "12345field" \
     "3u8" \
     "1000000u64" \
     "2000000u64"
   ```

3. **Deploy Frontend ke Vercel**
   ```bash
   git add -A
   git commit -m "Update contract address"
   git push origin main
   ```

## Troubleshooting

### ❌ Error: Insufficient balance
**Solusi**: Dapatkan lebih banyak credits dari faucet

### ❌ Error: Program already exists
**Solusi**: Program name sudah dipakai, ganti nama di `program.json`

### ❌ Error: Network timeout
**Solusi**: Coba lagi atau gunakan endpoint berbeda

### ❌ Error: Invalid private key
**Solusi**: Cek private key di `.env` file

## Program Functions yang Tersedia

Setelah deploy, fungsi-fungsi ini bisa dipanggil:

### Market Management
- ✅ `create_market` - Buat market baru
- ✅ `close_market` - Tutup betting
- ✅ `resolve_market` - Resolve outcome
- ✅ `cancel_market` - Cancel market
- ✅ `emergency_cancel` - Emergency cancel

### Betting
- ✅ `place_bet` - Taruh bet (private)
- ✅ `claim_winnings` - Claim kemenangan
- ✅ `withdraw_winnings` - Withdraw credits
- ✅ `claim_refund` - Claim refund

## Dokumentasi Lengkap

Lihat `contracts/DEPLOYMENT_GUIDE.md` untuk panduan detail.

## Need Help?

- 📖 Docs: `./docs/`
- 💬 Discord: Aleo Discord Server
- 🐛 Issues: GitHub Issues
- 📧 Email: support@veiledmarkets.com

---

**Ready to deploy? Mulai dari langkah 1! 🚀**
