# 🔒 Panduan: Bet dengan Privacy di Veiled Markets

## 📊 Overview

Veiled Markets menyediakan **2 metode betting** dengan tingkat privacy yang berbeda:

1. **`place_bet`** - Legacy method (Privacy Terbatas)
2. **`commit_bet` + `reveal_bet`** - Phase 2 method (Privacy Maksimal) ✅ **RECOMMENDED**

---

## 🎯 Metode 1: `place_bet` (Legacy)

### ⚠️ Privacy Level: **TERBATAS** (2/10)

**Masalah:**
- ❌ Amount terlihat di public inputs
- ❌ Outcome terlihat di public inputs
- ✅ Bet record tetap encrypted

### Cara Menggunakan

```bash
leo execute veiled_market_v3.aleo/place_bet \
  "6799979859013350088666057543392479876047176358286654383237647068200827543742field" \
  "10000000u64" \
  "1u8" \
  --network testnet \
  --broadcast
```

**Parameters:**
- `market_id`: Market ID (public)
- `amount`: Bet amount dalam microcredits (public) ❌
- `outcome`: 1u8 = YES, 2u8 = NO (public) ❌

**Yang Terlihat di Blockchain:**
- ✅ Market ID
- ❌ **Amount** (terlihat!)
- ❌ **Outcome** (terlihat!)
- ✅ Bet record (encrypted)

---

## 🔐 Metode 2: Commit-Reveal Scheme (Phase 2) ✅ **RECOMMENDED**

### ✅ Privacy Level: **MAKSIMAL** (9/10)

**Kelebihan:**
- ✅ Amount **PRIVATE** selama betting period
- ✅ Outcome **PRIVATE** selama betting period
- ✅ Hanya ter-reveal setelah deadline
- ✅ Menggunakan private credits records

### Step-by-Step Guide

#### **Step 1: Commit Bet (Fully Private)**

```bash
leo execute veiled_market_v3.aleo/commit_bet \
  "6799979859013350088666057543392479876047176358286654383237647068200827543742field" \
  "<amount>u64" \
  "<outcome>u8" \
  "<credits_record>" \
  --network testnet \
  --broadcast
```

**Parameters:**
- `market_id`: Market ID (public)
- `amount`: Bet amount (private) ✅
- `outcome`: 1u8 = YES, 2u8 = NO (private) ✅
- `credits_in`: Private credits record (private) ✅

**Output:**
- `Bet` record (simpan!)
- `Commitment` record (simpan!)
- `bet_amount_record` (simpan untuk reveal!)

**Yang Terlihat di Blockchain:**
- ✅ Market ID
- ✅ Commitment hash (tidak reveal amount/outcome)
- ❌ **Amount** (PRIVATE!)
- ❌ **Outcome** (PRIVATE!)

#### **Step 2: Reveal Bet (Setelah Deadline)**

```bash
leo execute veiled_market_v3.aleo/reveal_bet \
  "<bet_record>" \
  "<commitment_record>" \
  "<bet_amount_record>" \
  "<amount>u64" \
  --network testnet \
  --broadcast
```

**Parameters:**
- `bet`: Bet record dari step 1 (private)
- `commitment`: Commitment record dari step 1 (private)
- `credits_record`: Bet amount record dari step 1 (private)
- `amount`: Revealed amount (public, tapi hanya setelah deadline)

**Yang Terlihat di Blockchain:**
- ✅ Amount (hanya setelah deadline)
- ✅ Outcome (hanya setelah deadline)
- ✅ Pool update terjadi

---

## 📊 Perbandingan Privacy

| Aspek | `place_bet` | `commit_bet` + `reveal_bet` |
|-------|-------------|----------------------------|
| **Amount Privacy** | ❌ Public | ✅ Private (sampai reveal) |
| **Outcome Privacy** | ❌ Public | ✅ Private (sampai reveal) |
| **Bet Record** | ✅ Encrypted | ✅ Encrypted |
| **Credits Transfer** | Public balance | Private records |
| **Privacy Score** | 2/10 | 9/10 |

---

## 🔍 Detail Privacy Mechanism

### 1. **Private Records** 🔒

```leo
record Bet {
    owner: address,      // ✅ PRIVATE (encrypted)
    market_id: field,    // ✅ PRIVATE (encrypted)
    amount: u64,        // ✅ PRIVATE (encrypted)
    outcome: u8,         // ✅ PRIVATE (encrypted)
    placed_at: u64,      // ✅ PRIVATE (encrypted)
}
```

**Cara Kerja:**
- Records di-encrypt dengan owner's private key
- Hanya owner yang bisa decrypt
- Disimpan on-chain tapi encrypted

### 2. **Commitment Hash** 🔐

```leo
commitment_hash = hash(amount, outcome, nonce, bettor, market_id)
```

**Cara Kerja:**
- Hash disimpan publicly
- Tidak reveal amount/outcome
- Hanya bisa di-verify saat reveal

### 3. **Delayed Pool Updates** ⏱️

```leo
const POOL_UPDATE_DELAY_BLOCKS: u64 = 10u64;
```

**Cara Kerja:**
- Pool di-update batch setiap 10 blocks
- Menyembunyikan timing individual bets
- Mencegah inference dari pool changes

### 4. **Pool Noise** 🎲

```leo
const MIN_POOL_NOISE: u64 = 100u64;
```

**Cara Kerja:**
- Noise ditambahkan ke pool totals
- Mencegah exact bet amount inference
- Deterministic tapi unpredictable

---

## 💡 Tips untuk Privacy Maksimal

### 1. **Gunakan Commit-Reveal Scheme** ✅

```bash
# Step 1: Commit (private)
leo execute veiled_market_v3.aleo/commit_bet ...

# Step 2: Reveal setelah deadline
leo execute veiled_market_v3.aleo/reveal_bet ...
```

### 2. **Simpan Semua Records**

Setelah `commit_bet`, simpan:
- ✅ Bet record
- ✅ Commitment record
- ✅ Bet amount record (untuk reveal)

### 3. **Gunakan Private Credits**

Convert public balance ke private records dulu:
```bash
leo execute credits.aleo/transfer_public_to_private \
  <your_address> \
  <amount>u64 \
  --network testnet \
  --broadcast
```

### 4. **Reveal Setelah Deadline**

Jangan reveal sebelum deadline untuk privacy maksimal.

---

## 📝 Contoh Lengkap

### Scenario: Bet 10 credits pada YES

#### **Metode 1: place_bet (Legacy)**

```bash
# Convert ke public balance dulu
leo execute credits.aleo/transfer_public_to_private \
  aleo1mvgrcpjn9zer2vlc5l6zy2ngmnyvn7txz93xttyvh9vzk5rsvyzsqp62e9 \
  10000000u64 \
  --network testnet \
  --broadcast

# Place bet (amount & outcome terlihat!)
leo execute veiled_market_v3.aleo/place_bet \
  "6799979859013350088666057543392479876047176358286654383237647068200827543742field" \
  "10000000u64" \
  "1u8" \
  --network testnet \
  --broadcast
```

**Privacy:** ❌ Amount & outcome terlihat di blockchain

#### **Metode 2: commit_bet + reveal_bet (Recommended)**

```bash
# Step 1: Commit (Fully Private)
leo execute veiled_market_v3.aleo/commit_bet \
  "6799979859013350088666057543392479876047176358286654383237647068200827543742field" \
  "10000000u64" \
  "1u8" \
  "<your_private_credits_record>" \
  --network testnet \
  --broadcast

# Output: Bet, Commitment, bet_amount_record
# SIMPAN SEMUA RECORDS!

# Step 2: Reveal setelah deadline (setelah market closed)
leo execute veiled_market_v3.aleo/reveal_bet \
  "<bet_record>" \
  "<commitment_record>" \
  "<bet_amount_record>" \
  "10000000u64" \
  --network testnet \
  --broadcast
```

**Privacy:** ✅ Amount & outcome private sampai reveal

---

## ⚠️ Catatan Penting

### 1. **Commit-Reveal Requirements**

- ✅ Market harus ACTIVE saat commit
- ✅ Deadline belum lewat saat commit
- ✅ Harus reveal setelah deadline
- ✅ Simpan semua records dengan aman

### 2. **Private Credits Storage**

- User harus simpan `bet_amount_record` dari `commit_bet`
- Record ini diperlukan untuk `reveal_bet`
- Jangan hilangkan record ini!

### 3. **Reveal Timing**

- Reveal bisa dilakukan setelah deadline
- Tidak perlu reveal segera setelah deadline
- Tapi harus reveal sebelum claim winnings

---

## 🔐 Privacy Score Summary

| Metode | Privacy Score | Recommendation |
|--------|---------------|----------------|
| `place_bet` | 2/10 | ❌ Tidak recommended |
| `commit_bet` + `reveal_bet` | 9/10 | ✅ **RECOMMENDED** |

---

## 📚 Referensi

- **Kontrak:** `contracts/src/main.leo`
- **Commit-Reveal:** Line 456-679
- **Place Bet:** Line 335-449
- **Privacy Analysis:** `PRIVACY_AUDIT_REPORT.md`

---

**Gunakan `commit_bet` + `reveal_bet` untuk privacy maksimal!** 🔒✅
