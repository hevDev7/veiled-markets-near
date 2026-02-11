# 🔍 Analisis Bet Rejection - Bitcoin $100k Market

## 📊 Transaction Details

- **Transaction ID:** `at1yxlz73ufg0m5ajhs8tqv090khytdh42rkdcuceg58jd4lx394srqjfz6ms`
- **Status:** ❌ REJECTED
- **Function:** `PLACE_BET`
- **Market ID:** `2324599315804307583621629508171904754376140563814202582516489027393343318776field`
- **Amount:** `10000000U64` (10 credits)
- **Outcome:** `1U8` (YES)

## 🔍 Kemungkinan Penyebab Rejection

Berdasarkan validasi di kontrak `finalize_place_bet_private`, ada beberapa assertion yang bisa menyebabkan rejection:

### 1. Market Tidak Ditemukan ❌
```leo
let market: Market = markets.get(market_id);
assert(market.status == MARKET_STATUS_ACTIVE);
```
**Kemungkinan:** Market belum terdaftar di mapping `markets` karena:
- Market baru dibuat dan belum ter-confirm di blockchain
- Ada delay antara market creation dan availability
- Market ID tidak sesuai

### 2. Market Status Tidak Aktif ❌
```leo
assert(market.status == MARKET_STATUS_ACTIVE);
```
**Kemungkinan:** Market status bukan `MARKET_STATUS_ACTIVE` (1u8)

### 3. Deadline Sudah Lewat ❌
```leo
let current_height: u64 = block.height as u64;
assert(current_height <= market.deadline);
```
**Kemungkinan:** Current block height sudah melewati betting deadline

### 4. Credits Transfer Gagal ❌
```leo
transfer_future.await();
```
**Kemungkinan:** 
- Insufficient balance
- Transfer failed
- Record tidak valid

### 5. Market Pool Belum Diinisialisasi ❌
```leo
let pool: MarketPool = market_pools.get(market_id);
```
**Kemungkinan:** Pool belum dibuat saat market creation

## 🛠️ Troubleshooting Steps

### Step 1: Verifikasi Market Ada di Blockchain

```bash
curl "https://api.explorer.provable.com/v1/testnet/program/veiled_markets_privacy.aleo/mapping/markets/2324599315804307583621629508171904754376140563814202582516489027393343318776field"
```

Jika return `null` atau error, berarti market belum terdaftar.

### Step 2: Cek Market Status

Jika market ada, cek field `status`:
- Harus `1u8` (MARKET_STATUS_ACTIVE)
- Jika bukan, market sudah closed/resolved/cancelled

### Step 3: Cek Current Block vs Deadline

```bash
# Get current block
CURRENT=$(curl -s "https://api.explorer.provable.com/v1/testnet/latest/height")

# Market deadline: 14149402
# Jika CURRENT > 14149402, deadline sudah lewat
```

### Step 4: Cek Balance

Pastikan wallet memiliki cukup credits:
- Bet amount: 10 credits (10000000 microcredits)
- Transaction fee: ~0.004 credits
- Total needed: ~10.004 credits

## 💡 Solusi yang Disarankan

### 1. Tunggu Market Confirmation
Market baru dibuat, mungkin perlu beberapa block untuk ter-confirm. Tunggu 1-2 menit lalu coba lagi.

### 2. Verifikasi Market di Explorer
Cek di: https://testnet.explorer.provable.com/program/veiled_markets_privacy.aleo
- Cari market ID di mapping `markets`
- Verifikasi status = ACTIVE
- Verifikasi deadline masih valid

### 3. Coba Bet Lagi
Setelah memastikan market sudah confirmed dan aktif, coba bet lagi dengan:
- Amount yang sama atau lebih besar dari MIN_BET_AMOUNT (1000 microcredits)
- Outcome yang valid (1u8 untuk YES, 2u8 untuk NO)
- Pastikan balance cukup

### 4. Cek Transaction Details
Lihat detail rejection di explorer untuk error message spesifik:
https://testnet.explorer.provable.com/transaction/at1yxlz73ufg0m5ajhs8tqv090khytdh42rkdcuceg58jd4lx394srqjfz6ms

## 🔧 Debugging Commands

```bash
# 1. Cek market ada
curl "https://api.explorer.provable.com/v1/testnet/program/veiled_markets_privacy.aleo/mapping/markets/2324599315804307583621629508171904754376140563814202582516489027393343318776field"

# 2. Cek pool ada
curl "https://api.explorer.provable.com/v1/testnet/program/veiled_markets_privacy.aleo/mapping/market_pools/2324599315804307583621629508171904754376140563814202582516489027393343318776field"

# 3. Cek current block
curl "https://api.explorer.provable.com/v1/testnet/latest/height"

# 4. Cek transaction details
curl "https://api.explorer.provable.com/v1/testnet/transaction/at1yxlz73ufg0m5ajhs8tqv090khytdh42rkdcuceg58jd4lx394srqjfz6ms"
```

## ⚠️ Common Issues

1. **Market baru dibuat** - Perlu waktu untuk confirmation
2. **Deadline calculation salah** - Pastikan deadline > current block
3. **Insufficient balance** - Perlu cukup credits untuk bet + fee
4. **Market belum terdaftar** - Market creation transaction mungkin belum confirmed

## ✅ Next Steps

1. Verifikasi market sudah confirmed di blockchain
2. Cek status market = ACTIVE
3. Cek deadline masih valid
4. Pastikan balance cukup
5. Coba bet lagi
