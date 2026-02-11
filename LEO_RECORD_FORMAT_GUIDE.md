# 📝 Guide: Format Record di Leo dengan `.private` Visibility

## 🔍 Penjelasan Format `.private`

Di Leo, setiap field dalam record memiliki **visibility modifier** yang menentukan apakah field tersebut private atau public.

### Format Dasar

```
field_name: value.visibility
```

**Visibility Types:**
- `.private` - Field private (encrypted, hanya owner bisa decrypt)
- `.public` - Field public (terlihat semua orang)

---

## 📋 Contoh Format Bet Record

### Struktur Record di Kontrak

```leo
record Bet {
    owner: address,           // Private by default
    market_id: field,         // Private by default
    amount: u64,              // Private by default
    outcome: u8,              // Private by default
    placed_at: u64,           // Private by default
}
```

### Format untuk `leo run`

```bash
leo run claim_winnings '{
    owner: aleo1mvgrcpjn9zer2vlc5l6zy2ngmnyvn7txz93xttyvh9vzk5rsvyzsqp62e9.private,
    market_id: 6799979859013350088666057543392479876047176358286654383237647068200827543742field.private,
    amount: 10000000u64.private,
    outcome: 1u8.private,
    placed_at: 14109624u64.private
}'
```

---

## 🔑 Field-by-Field Format

### 1. `owner: address`
```bash
owner: aleo1mvgrcpjn9zer2vlc5l6zy2ngmnyvn7txz93xttyvh9vzk5rsvyzsqp62e9.private
```
- **Type:** `address`
- **Visibility:** `.private`
- **Format:** `address_string.private`

### 2. `market_id: field`
```bash
market_id: 6799979859013350088666057543392479876047176358286654383237647068200827543742field.private
```
- **Type:** `field` (bukan `u64`!)
- **Visibility:** `.private`
- **Format:** `numberfield.private`
- ⚠️ **PENTING:** Harus `field`, bukan `u64`!

### 3. `amount: u64`
```bash
amount: 10000000u64.private
```
- **Type:** `u64`
- **Visibility:** `.private`
- **Format:** `numberu64.private`
- **Contoh:** `10000000u64.private` = 10 credits

### 4. `outcome: u8`
```bash
outcome: 1u8.private
```
- **Type:** `u8`
- **Visibility:** `.private`
- **Format:** `numberu8.private`
- **Values:** `1u8` = YES, `2u8` = NO

### 5. `placed_at: u64`
```bash
placed_at: 14109624u64.private
```
- **Type:** `u64`
- **Visibility:** `.private`
- **Format:** `numberu64.private`
- Block height saat bet ditempatkan

---

## ⚠️ Kesalahan Umum

### ❌ SALAH: `market_id: 1u64.private`
```bash
market_id: 1u64.private  # ❌ SALAH!
```
**Masalah:** `market_id` harus `field`, bukan `u64`

**✅ BENAR:**
```bash
market_id: 6799979859013350088666057543392479876047176358286654383237647068200827543742field.private
```

### ❌ SALAH: `_nonce: 123456789group.public`
```bash
_nonce: 123456789group.public  # ❌ SALAH!
```
**Masalah:** `_nonce` dan `_version` **TIDAK PERLU** diisi manual. Leo generate otomatis!

**✅ BENAR:**
```bash
# Jangan isi _nonce dan _version
# Leo akan generate otomatis
```

### ❌ SALAH: Missing `placed_at`
```bash
{
    owner: ...,
    market_id: ...,
    amount: ...,
    outcome: ...
    # ❌ Missing placed_at!
}
```
**Masalah:** Semua field harus diisi!

**✅ BENAR:**
```bash
{
    owner: ...,
    market_id: ...,
    amount: ...,
    outcome: ...,
    placed_at: 14109624u64.private  # ✅ Harus ada!
}
```

---

## 📝 Template Lengkap

### Bet Record Template

```bash
leo run claim_winnings '{
    owner: YOUR_ADDRESS.private,
    market_id: MARKET_ID_FIELD.private,
    amount: AMOUNT_IN_MICROCREDITS.private,
    outcome: OUTCOME_U8.private,
    placed_at: BLOCK_HEIGHT.private
}'
```

**Replace:**
- `YOUR_ADDRESS` → Alamat Aleo Anda
- `MARKET_ID_FIELD` → Market ID (format: `numberfield`)
- `AMOUNT_IN_MICROCREDITS` → Jumlah dalam microcredits (format: `numberu64`)
- `OUTCOME_U8` → `1u8` untuk YES, `2u8` untuk NO
- `BLOCK_HEIGHT` → Block height saat bet (format: `numberu64`)

---

## 🔍 Contoh Lengkap

### Contoh 1: Bet 10 credits pada YES

```bash
leo run claim_winnings '{
    owner: aleo1mvgrcpjn9zer2vlc5l6zy2ngmnyvn7txz93xttyvh9vzk5rsvyzsqp62e9.private,
    market_id: 6799979859013350088666057543392479876047176358286654383237647068200827543742field.private,
    amount: 10000000u64.private,
    outcome: 1u8.private,
    placed_at: 14109624u64.private
}'
```

### Contoh 2: Bet 5 credits pada NO

```bash
leo run claim_winnings '{
    owner: aleo1mvgrcpjn9zer2vlc5l6zy2ngmnyvn7txz93xttyvh9vzk5rsvyzsqp62e9.private,
    market_id: 6799979859013350088666057543392479876047176358286654383237647068200827543742field.private,
    amount: 5000000u64.private,
    outcome: 2u8.private,
    placed_at: 14109624u64.private
}'
```

---

## 💡 Tips

### 1. **Gunakan Format yang Konsisten**
- Semua field private: gunakan `.private`
- Jangan campur dengan `.public` kecuali memang diperlukan

### 2. **Jangan Isi `_nonce` dan `_version`**
- Leo generate otomatis
- Tidak perlu diisi manual

### 3. **Pastikan Type Benar**
- `market_id` → `field` (bukan `u64`!)
- `amount` → `u64`
- `outcome` → `u8`
- `placed_at` → `u64`

### 4. **Gunakan Actual Values**
- Jangan gunakan placeholder seperti `1u64`
- Gunakan nilai sebenarnya dari bet Anda

---

## 📚 Referensi

- **Kontrak:** `contracts/src/main.leo` line 73-79
- **Leo Documentation:** [Leo Language Reference](https://developer.aleo.org/leo/language)

---

**Format `.private` adalah visibility modifier untuk menentukan apakah field private atau public!** ✅
