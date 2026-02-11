# 🔒 Privacy Audit Report - Veiled Markets Contract

**Tanggal:** 2026-01-28  
**Kontrak:** `veiled_markets_v2.aleo`  
**Status:** ⚠️ **MASALAH PRIVASI DITEMUKAN**

---

## 📊 Executive Summary

Kontrak memiliki **masalah privasi kritis** pada fungsi `place_bet` dimana parameter `amount` dan `outcome` dideklarasikan sebagai **PUBLIC** padahal seharusnya **PRIVATE**.

**Privacy Score: 4/10** ⚠️

---

## 🔴 MASALAH KRITIS DITEMUKAN

### 1. **Public Parameters di `place_bet` Transition** ❌

**Lokasi:** `contracts/src/main.leo` line 262-265

```leo
async transition place_bet(
    public market_id: field,
    public amount: u64,        // ❌ PUBLIC - TERLIHAT DI BLOCKCHAIN!
    public outcome: u8,        // ❌ PUBLIC - TERLIHAT DI BLOCKCHAIN!
) -> (Bet, Future)
```

**Masalah:**
- ✅ Bet record (`Bet`) adalah **PRIVATE** (encrypted)
- ❌ Tapi parameter input `amount` dan `outcome` adalah **PUBLIC**
- ❌ Ini berarti **SEMUA ORANG** bisa lihat:
  - Berapa banyak yang Anda bet
  - Pilihan YES atau NO Anda
  - Kapan Anda bet (dari transaction timestamp)

**Dampak:**
1. **Privacy Leak:** Bet amount dan outcome terlihat di blockchain
2. **MEV Risk:** Bot bisa lihat pending bets dan front-run
3. **Tracking:** Bisa track betting pattern per address
4. **Whale Detection:** Bisa identifikasi whale bets

**Bukti:**
```leo
// Line 290 - amount dan outcome dikirim ke on-chain function
return (bet, finalize_place_bet(transfer_future, market_id, amount, outcome));
```

Karena `amount` dan `outcome` adalah public, mereka akan terlihat di transaction calldata.

---

## ✅ Aspek Privacy yang BENAR

### 1. **Private Records** ✅
```leo
record Bet {
    owner: address,           // Private
    market_id: field,        // Private
    amount: u64,             // Private (di dalam record)
    outcome: u8,             // Private (di dalam record)
    placed_at: u64,          // Private
}
```
- ✅ Record Bet adalah **PRIVATE** dan encrypted
- ✅ Hanya owner yang bisa decrypt

### 2. **Private Winnings Claim** ✅
```leo
record WinningsClaim {
    owner: address,          // Private
    market_id: field,       // Private
    bet_amount: u64,        // Private
    winning_outcome: u8,     // Private
}
```
- ✅ Claim record adalah **PRIVATE**

### 3. **Zero-Knowledge Proofs** ✅
- ✅ Menggunakan Aleo's native ZK system
- ✅ Proof verification tanpa reveal data

---

## ⚠️ Masalah Privasi Lainnya

### 2. **Public Market ID** ⚠️
```leo
public market_id: field  // Market yang di-bet terlihat
```
- ⚠️ Bisa track "address ini suka bet di market X"
- ⚠️ Metadata leakage tentang interest

### 3. **Public Pool Updates** ⚠️
```leo
// Line 318-324
let updated_pool: MarketPool = MarketPool {
    total_yes_pool: pool.total_yes_pool + yes_add,  // Public
    total_no_pool: pool.total_no_pool + no_add,     // Public
    ...
};
```
- ⚠️ Pool totals terlihat publik
- ⚠️ Bisa estimate bet size dari perubahan pool
- ⚠️ Ada konstanta `POOL_UPDATE_DELAY_BLOCKS` tapi tidak digunakan!

### 4. **Constants Tidak Digunakan** ⚠️
```leo
// Line 52 - Didefinisikan tapi TIDAK DIGUNAKAN
const POOL_UPDATE_DELAY_BLOCKS: u64 = 10u64;

// Line 56 - Didefinisikan tapi TIDAK DIGUNAKAN  
const MIN_POOL_NOISE: u64 = 100u64;
```
- ⚠️ Privacy enhancement constants ada tapi tidak diimplementasikan
- ⚠️ Pool updates langsung tanpa delay/noise

---

## 🔧 REKOMENDASI PERBAIKAN

### 🔴 CRITICAL (Harus Segera)

#### 1. **Ubah Parameter ke Private (Dengan Catatan)**
```leo
async transition place_bet(
    public market_id: field,
    private amount: u64,      // ✅ PRIVATE
    private outcome: u8,      // ✅ PRIVATE
) -> (Bet, Future)
```

**Verifikasi:** ✅ Aleo **MENDUKUNG** private parameters di async transitions (lihat `leo/tests/tests/compiler/async_blocks/private_inputs_in_async.leo`)

**MASALAH:** Jika `amount` dan `outcome` private, bagaimana update public pool?

**SOLUSI YANG DISARANKAN:**

**Opsi A: Commit-Reveal Scheme** (Recommended)
```leo
// Step 1: Commit bet (private)
async transition commit_bet(
    public market_id: field,
    private amount: u64,
    private outcome: u8,
) -> (Bet, Commitment, Future) {
    // Create commitment hash
    let commitment = BHP256::hash_to_field(CommitmentData {
        amount: amount,
        outcome: outcome,
        nonce: random(),
    });
    
    // Store commitment, reveal later
    return (bet, commitment, store_commitment(market_id, commitment));
}

// Step 2: Reveal setelah deadline (batch reveal)
async transition reveal_bet(
    private bet: Bet,
    private commitment: Commitment,
) -> Future {
    // Verify commitment matches bet
    // Update pool in batch
}
```

**Opsi B: ZK Proof untuk Pool Update** (Advanced)
```leo
async transition place_bet(
    public market_id: field,
    private amount: u64,
    private outcome: u8,
) -> (Bet, Future) {
    // Generate ZK proof that:
    // - amount >= MIN_BET_AMOUNT
    // - outcome is valid (YES or NO)
    // - Without revealing actual values
    
    // Update pool using encrypted increments
    return (bet, update_pool_with_proof(market_id, proof));
}
```

**Opsi C: Delayed Pool Updates** (Simpler)
```leo
// Keep public parameters BUT:
// 1. Batch updates setiap N blocks
// 2. Add noise to hide individual bets
// 3. Use time delays
```

#### 2. **Implementasi Delayed Pool Updates**
```leo
// Gunakan POOL_UPDATE_DELAY_BLOCKS yang sudah didefinisikan
// Batch updates setiap N blocks
```

#### 3. **Implementasi Pool Noise**
```leo
// Gunakan MIN_POOL_NOISE untuk differential privacy
// Add random noise ke pool totals
```

### 🟡 HIGH Priority

#### 4. **Private Market Selection**
- Encrypt market_id atau gunakan stealth addresses
- Implement private market browsing

#### 5. **Transaction Mixing**
- Batch multiple bets together
- Random delays sebelum submit

---

## 📈 Perbandingan: Sebelum vs Sesudah

| Aspek | Saat Ini | Setelah Perbaikan |
|-------|----------|-------------------|
| Bet Amount Privacy | 🔴 Public | 🟢 Private |
| Bet Outcome Privacy | 🔴 Public | 🟢 Private |
| MEV Protection | 🔴 Vulnerable | 🟢 Protected |
| Pool Updates | 🔴 Real-time | 🟡 Delayed |
| Pool Noise | 🔴 None | 🟡 Added |

---

## 🎯 Kesimpulan

### Status Saat Ini: ❌ **TIDAK PRIVACY**

Meskipun kontrak menggunakan:
- ✅ Private Records (Bet, WinningsClaim)
- ✅ Zero-Knowledge Proofs
- ✅ Aleo's privacy features

**Tapi ada masalah fundamental:**
- ❌ Parameter `amount` dan `outcome` di `place_bet` adalah **PUBLIC**
- ❌ Ini membuat bet amount dan outcome **TERLIHAT DI BLOCKCHAIN**
- ❌ Privacy enhancement constants tidak digunakan

### Rekomendasi:

1. **SEGERA:** Ubah `place_bet` parameters ke private atau implement commit-reveal
2. **HIGH:** Implement delayed pool updates dan noise
3. **MEDIUM:** Private market selection

**Privacy Score Saat Ini: 4/10** ⚠️  
**Privacy Score Target: 9/10** ✅

---

**Auditor:** AI Code Review  
**Date:** 2026-01-28
