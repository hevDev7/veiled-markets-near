# 🎯 Guide: Claim Winnings dengan Bet Record

## 📋 Overview

`claim_winnings` adalah fungsi untuk mengklaim kemenangan setelah market di-resolve. Fungsi ini memerlukan **Bet record** sebagai input private.

---

## 🔍 Struktur Bet Record

Dari kontrak (`contracts/src/main.leo`):

```leo
record Bet {
    owner: address,           // The bettor's address
    market_id: field,         // Which market this bet is for
    amount: u64,              // Amount wagered (in microcredits)
    outcome: u8,              // OUTCOME_YES (1u8) or OUTCOME_NO (2u8)
    placed_at: u64,           // Block height when bet was placed
}
```

**Catatan:** Leo secara otomatis menambahkan `_nonce` dan `_version` ke record untuk keamanan.

---

## 📝 Format Command

### Format `.private` di Leo

Di Leo, setiap field dalam record memiliki **visibility modifier**:
- `.private` - Field private (encrypted)
- `.public` - Field public (terlihat)

**Format:** `field_name: value.visibility`

### Menggunakan `leo run` (untuk testing/local)

```bash
leo run claim_winnings '{
    owner: aleo1mvgrcpjn9zer2vlc5l6zy2ngmnyvn7txz93xttyvh9vzk5rsvyzsqp62e9.private,
    market_id: 6799979859013350088666057543392479876047176358286654383237647068200827543742field.private,
    amount: 10000000u64.private,
    outcome: 1u8.private,
    placed_at: 14109624u64.private
}'
```

**Catatan Penting:**
- ✅ Semua field dalam Bet record adalah `.private`
- ✅ Format: `value.private` (bukan `value.private` di akhir)
- ❌ Jangan isi `_nonce` manual (Leo generate otomatis)
- ❌ Jangan isi `_version` manual (Leo generate otomatis)

### Menggunakan `leo execute` (untuk on-chain)

```bash
leo execute veiled_market_v3.aleo/claim_winnings \
  '<Bet_record>' \
  --network testnet \
  --broadcast
```

**Catatan:** Untuk `leo execute`, Anda perlu menggunakan Bet record yang sebenarnya (dari output `place_bet` atau `commit_bet`), bukan JSON string.

---

## 🔑 Field-by-Field Explanation

### 1. `owner: address`
- **Type:** `address.private`
- **Value:** Alamat Aleo Anda (yang membuat bet)
- **Example:** `aleo1mvgrcpjn9zer2vlc5l6zy2ngmnyvn7txz93xttyvh9vzk5rsvyzsqp62e9.private`

### 2. `market_id: field`
- **Type:** `field.private`
- **Value:** Market ID dari market yang Anda bet
- **Example:** `6799979859013350088666057543392479876047176358286654383237647068200827543742field.private`

### 3. `amount: u64`
- **Type:** `u64.private`
- **Value:** Jumlah bet dalam microcredits (1 credit = 1,000,000 microcredits)
- **Example:** `10000000u64.private` = 10 credits

### 4. `outcome: u8`
- **Type:** `u8.private`
- **Value:** 
  - `1u8` = YES (OUTCOME_YES)
  - `2u8` = NO (OUTCOME_NO)
- **Example:** `1u8.private` (jika Anda bet YES)

### 5. `placed_at: u64`
- **Type:** `u64.private`
- **Value:** Block height saat bet ditempatkan
- **Example:** `14109624u64.private`

### 6. `_nonce: group` (Auto-generated)
- **Type:** `group.public` (Leo otomatis menambahkan)
- **Value:** Random nonce untuk keamanan
- **Note:** Tidak perlu diisi manual, Leo akan generate otomatis

---

## ⚠️ Perbedaan dengan Contoh User

**Contoh yang diberikan user:**
```bash
leo run claim_winnings '{
    owner: aleo1mvgrcpjn9zer2vlc5l6zy2ngmnyvn7txz93xttyvh9vzk5rsvyzsqp62e9.private,
    market_id: 1u64.private,  # ❌ SALAH - harus field, bukan u64
    outcome: 1u8.private,
    amount: 10000000u64.private,
    _nonce: 123456789group.public  # ❌ SALAH - tidak perlu diisi manual
}' 1u64  # ❓ Parameter ini tidak jelas
```

**Masalah:**
1. ❌ `market_id: 1u64.private` → Harus `field`, bukan `u64`
   - ✅ Benar: `market_id: 6799979859013350088666057543392479876047176358286654383237647068200827543742field.private`
2. ❌ `_nonce: 123456789group.public` → Tidak perlu diisi manual, Leo generate otomatis
3. ❌ Missing `placed_at` field
4. ❓ Parameter `1u64` di akhir tidak jelas (mungkin tidak diperlukan)

**Format yang benar:**
```bash
leo run claim_winnings '{
    owner: aleo1mvgrcpjn9zer2vlc5l6zy2ngmnyvn7txz93xttyvh9vzk5rsvyzsqp62e9.private,
    market_id: 6799979859013350088666057543392479876047176358286654383237647068200827543742field.private,
    amount: 10000000u64.private,
    outcome: 1u8.private,
    placed_at: 14109624u64.private
}'
```

**Tidak perlu parameter tambahan di akhir!**

---

## 🔄 Workflow Lengkap

### Step 1: Place Bet
```bash
leo execute veiled_market_v3.aleo/place_bet \
  "6799979859013350088666057543392479876047176358286654383237647068200827543742field" \
  "10000000u64" \
  "1u8" \
  --network testnet \
  --broadcast
```

**Output:** Bet record (simpan ini!)

### Step 2: Market Resolved
Market creator resolve market dengan outcome yang menang.

### Step 3: Claim Winnings
```bash
leo execute veiled_market_v3.aleo/claim_winnings \
  '<Bet_record_dari_step_1>' \
  --network testnet \
  --broadcast
```

**Output:** WinningsClaim record

### Step 4: Withdraw Winnings
```bash
leo execute veiled_market_v3.aleo/withdraw_winnings \
  '<WinningsClaim_record_dari_step_3>' \
  "<payout_amount>u64" \
  --network testnet \
  --broadcast
```

---

## 🔍 Validasi di Kontrak

`claim_winnings` melakukan validasi berikut:

1. ✅ **Market resolved:** Market harus sudah di-resolve
2. ✅ **Winning outcome:** Bet outcome harus sama dengan winning outcome
3. ✅ **Not claimed:** Belum pernah claim sebelumnya (double claim prevention)
4. ✅ **Ownership:** Bet owner harus sama dengan caller

---

## 💡 Tips

### 1. Simpan Bet Record
Setelah `place_bet`, **simpan Bet record** yang dikembalikan. Anda akan membutuhkannya untuk claim.

### 2. Check Market Status
Pastikan market sudah di-resolve sebelum claim:
```bash
curl "https://api.explorer.provable.com/v1/testnet/program/veiled_market_v3.aleo/mapping/markets/<market_id>"
```

### 3. Check Resolution
Pastikan resolution sudah ada:
```bash
curl "https://api.explorer.provable.com/v1/testnet/program/veiled_market_v3.aleo/mapping/market_resolutions/<market_id>"
```

### 4. Calculate Payout
Sebelum `withdraw_winnings`, hitung payout amount:
```
payout = (bet_amount / winning_pool) * total_payout_pool
```

---

## 📚 Referensi

- **Kontrak:** `contracts/src/main.leo` line 816-855
- **Bet Record:** `contracts/src/main.leo` line 73-79
- **WinningsClaim Record:** `contracts/src/main.leo` line 82-87

---

## ❓ FAQ

### Q: Apakah `_nonce` perlu diisi manual?
**A:** Tidak. Leo secara otomatis menambahkan `_nonce` dan `_version` ke record. Jangan isi manual.

### Q: Bagaimana mendapatkan Bet record?
**A:** Bet record dikembalikan dari `place_bet` atau `commit_bet`. Simpan output tersebut.

### Q: Bisa claim sebelum market resolved?
**A:** Tidak. Market harus di-resolve dulu oleh creator.

### Q: Bisa claim berkali-kali?
**A:** Tidak. Setiap user hanya bisa claim sekali per market (double claim prevention).

---

**Format yang benar sudah dijelaskan di atas!** ✅
