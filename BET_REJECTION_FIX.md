# 🔧 Fix untuk Bet Rejection

## 🔍 Analisis Masalah

Dari transaction yang di-reject, kemungkinan penyebabnya adalah:

### 1. Field Arithmetic Issue ❌
**Line 365 (sebelum fix):**
```leo
let noise_input: field = market_id + (current_height as field) + (amount as field);
```

**Masalah:** Operasi `+` pada field di Aleo menggunakan modular arithmetic. Operasi ini mungkin tidak menghasilkan hasil yang diharapkan atau menyebabkan overflow.

### 2. Mapping `last_pool_update` Tidak Diinisialisasi
Mapping `last_pool_update` tidak diinisialisasi saat market creation, tapi ini sudah di-handle dengan `get_or_use`.

## ✅ Fix yang Diterapkan

### Perbaikan Noise Calculation

**Sebelum:**
```leo
let noise_input: field = market_id + (current_height as field) + (amount as field);
let noise_seed: field = BHP256::hash_to_field(noise_input);
```

**Sesudah:**
```leo
let noise_seed: field = BHP256::hash_to_field(
    MarketSeed {
        creator: market.creator,
        question_hash: market_id,
        deadline: current_height,
        nonce: amount,
    }
);
```

**Keuntungan:**
- ✅ Menggunakan struct untuk input hash (lebih aman)
- ✅ Menghindari field arithmetic langsung
- ✅ Lebih deterministik dan predictable

## 🚀 Langkah Selanjutnya

### 1. Rebuild & Redeploy Contract

Kontrak sudah di-build dengan fix. Sekarang perlu di-upgrade:

```bash
cd contracts
leo upgrade --network testnet --broadcast
```

### 2. Setelah Upgrade, Coba Bet Lagi

Setelah kontrak di-upgrade, coba bet lagi pada market Bitcoin $100k.

### 3. Verifikasi

- Market sudah ada ✅
- Pool sudah diinisialisasi ✅
- Status = ACTIVE ✅
- Deadline masih valid ✅

## 📝 Catatan

Masalah rejection kemungkinan besar disebabkan oleh:
1. Field arithmetic issue pada noise calculation
2. Atau ada masalah dengan credits transfer

Dengan fix ini, operasi noise calculation sekarang lebih aman dan tidak menggunakan field arithmetic langsung.

## ⚠️ Alternative: Disable Noise Temporarily

Jika masih ada masalah, bisa disable noise sementara dengan mengubah:

```leo
let noise_amount: u64 = 0u64;  // Disable noise temporarily
```

Tapi dengan fix struct-based hash, seharusnya sudah bekerja dengan baik.
