# 🔐 Commit-Reveal Scheme Guide - Phase 2 Privacy Enhancement

## 📋 Overview

Phase 2 implementasi privacy menggunakan **Commit-Reveal Scheme** untuk memberikan privacy sejati pada betting. Dengan skema ini, bet amount dan outcome **TIDAK TERLIHAT** selama betting period dan hanya di-reveal setelah deadline untuk pool updates.

---

## 🔄 Two-Phase Flow

### Phase 1: Commit (Private) ✅

**Timing:** Selama betting period (sebelum deadline)

**Privacy Level:** ✅ **FULLY PRIVATE** (10/10)
- Amount: **PRIVATE** - tidak terlihat
- Outcome: **PRIVATE** - tidak terlihat
- Credits: **PRIVATE** - dalam encrypted record

**Function:**
```leo
async transition commit_bet(
    public market_id: field,
    private amount: u64,              // ✅ PRIVATE
    private outcome: u8,               // ✅ PRIVATE
    private credits_in: credits.aleo/credits,  // ✅ PRIVATE record
) -> (Bet, Commitment, credits.aleo/credits, Future)
```

**What Happens:**
1. User commit bet dengan private parameters
2. Generate commitment hash dari (amount, outcome, nonce)
3. Store commitment (public, tapi tidak reveal amount/outcome)
4. Store private credits record (encrypted)
5. Create private Bet record

**Output:**
- `Bet` record (private, encrypted)
- `Commitment` struct (public hash, tidak reveal data)
- `credits.aleo/credits` change record (private)
- `Future` untuk on-chain processing

---

### Phase 2: Reveal (After Deadline) ✅

**Timing:** Setelah deadline (market closed atau past deadline)

**Privacy Level:** ⚠️ **REVEALED** (amount/outcome menjadi public)
- Amount: **PUBLIC** (setelah deadline, OK)
- Outcome: **PUBLIC** (setelah deadline, OK)
- Credits: **TRANSFERRED** ke program public balance

**Function:**
```leo
async transition reveal_bet(
    private bet: Bet,
    private commitment: Commitment,
    private credits_record: credits.aleo/credits,  // Stored private record
    public amount: u64,  // Revealed amount
) -> Future
```

**What Happens:**
1. Verify commitment matches bet
2. Transfer private credits to program's public balance
3. Update pool dengan revealed amount dan outcome
4. Mark bet as revealed (prevent double reveal)

**Output:**
- `Future` untuk on-chain processing

---

## 📊 Privacy Comparison

| Phase | Amount Privacy | Outcome Privacy | Credits Privacy |
|-------|----------------|-----------------|-----------------|
| **Commit** | ✅ 10/10 (Private) | ✅ 10/10 (Private) | ✅ 10/10 (Private Record) |
| **Reveal** | ⚠️ 0/10 (Public) | ⚠️ 0/10 (Public) | ⚠️ 0/10 (Public Balance) |
| **During Betting** | ✅ **FULLY PRIVATE** | ✅ **FULLY PRIVATE** | ✅ **FULLY PRIVATE** |

**Key Benefit:** Amount dan outcome **TIDAK TERLIHAT** selama betting period!

---

## 🚀 Usage Example

### Step 1: Commit Bet

```typescript
// User wants to bet 10 credits on YES
const amount = 10_000_000; // 10 credits in microcredits
const outcome = 1; // OUTCOME_YES

// Get private credits record
const creditsRecord = await getPrivateCreditsRecord(amount);

// Commit bet
const result = await aleoClient.commit_bet({
    market_id: marketId,
    amount: amount,  // Private
    outcome: outcome,  // Private
    credits_in: creditsRecord,  // Private record
});

// Store locally:
// - result.bet (Bet record)
// - result.commitment (Commitment struct)
// - result.change (change record)
```

**Privacy:** Amount dan outcome **TIDAK TERLIHAT** di transaction!

---

### Step 2: Reveal Bet (After Deadline)

```typescript
// After market deadline, reveal bet
const revealResult = await aleoClient.reveal_bet({
    bet: storedBet,  // Private Bet record
    commitment: storedCommitment,  // Private Commitment
    credits_record: storedCreditsRecord,  // Stored private record
    amount: amount,  // Public now (revealed)
});

// Pool will be updated with revealed amount and outcome
```

**Privacy:** Amount dan outcome sekarang **PUBLIC**, tapi sudah setelah deadline (OK).

---

## 🔍 How It Works

### Commitment Hash Generation

```leo
commitment_hash = BHP256::hash_to_field(
    CommitmentData {
        amount: amount,        // Private
        outcome: outcome,      // Private
        nonce: nonce,          // Random nonce
        bettor: bettor,        // Bettor address
        market_id: market_id,  // Market ID
    }
);
```

**Security:**
- Hash tidak bisa di-reverse untuk dapat amount/outcome
- Nonce mencegah brute force
- Commitment hash adalah public, tapi tidak reveal data

---

### Verification on Reveal

```leo
expected_hash = BHP256::hash_to_field(
    CommitmentData {
        amount: bet.amount,      // From bet record
        outcome: bet.outcome,    // From bet record
        nonce: commitment.nonce, // From commitment
        bettor: bet.owner,
        market_id: bet.market_id,
    }
);

assert(expected_hash == commitment.hash);
```

**Security:**
- Commitment hash harus match dengan bet data
- Prevents tampering dengan bet amount/outcome
- Ensures bet integrity

---

## ⚠️ Important Notes

### 1. **Credits Record Storage**

User harus **menyimpan credits record** yang dikembalikan dari `commit_bet` untuk digunakan di `reveal_bet`:

```typescript
// After commit_bet
const storedCreditsRecord = result.change; // Or bet_amount_record

// Use in reveal_bet
reveal_bet({
    credits_record: storedCreditsRecord,
    // ...
});
```

### 2. **Reveal Timing**

- ✅ Bisa reveal setelah **deadline passed**
- ✅ Bisa reveal setelah **market closed**
- ✅ Bisa reveal setelah **market resolved**
- ❌ **TIDAK BISA** reveal sebelum deadline (akan fail)

### 3. **Double Reveal Prevention**

Setiap commitment hash hanya bisa di-reveal **sekali**. Mapping `revealed_bets` mencegah double reveal.

### 4. **Pool Updates**

Pool hanya di-update saat **reveal**, bukan saat commit. Ini berarti:
- Pool totals tidak berubah selama betting period
- Odds tidak berubah sampai reveal
- Privacy terjaga sampai deadline

---

## 📈 Privacy Improvement

### Before (place_bet):
- ❌ Amount: **PUBLIC** (terlihat di transaction)
- ❌ Outcome: **PUBLIC** (terlihat di transaction)
- Privacy Score: **0/10**

### After (commit-reveal):
- ✅ Amount: **PRIVATE** selama betting period
- ✅ Outcome: **PRIVATE** selama betting period
- Privacy Score: **10/10** (selama betting), **0/10** (setelah reveal)

**Overall Privacy Score:** **8/10** ✅

---

## 🔄 Migration from place_bet

### For New Bets:
✅ **Use `commit_bet`** untuk privacy maksimal

### For Existing Bets:
⚠️ **Keep using `place_bet`** untuk backward compatibility
- Existing bets tetap valid
- No breaking changes
- Gradual migration

---

## 🎯 Best Practices

1. ✅ **Always commit before deadline**
   - Commit bet selama betting period
   - Reveal setelah deadline

2. ✅ **Store all records locally**
   - Bet record
   - Commitment struct
   - Credits record
   - Semua diperlukan untuk reveal

3. ✅ **Reveal promptly after deadline**
   - Reveal segera setelah deadline
   - Pool update akan terjadi setelah reveal
   - Odds akan update setelah reveal

4. ⚠️ **Don't lose credits record**
   - Credits record diperlukan untuk reveal
   - Tanpa credits record, tidak bisa reveal
   - Store securely

---

## 🐛 Troubleshooting

### Error: "Commitment hash mismatch"
**Cause:** Bet data tidak match dengan commitment
**Solution:** Pastikan menggunakan bet dan commitment yang sama

### Error: "Already revealed"
**Cause:** Bet sudah di-reveal sebelumnya
**Solution:** Setiap bet hanya bisa di-reveal sekali

### Error: "Market not closed"
**Cause:** Mencoba reveal sebelum deadline
**Solution:** Tunggu sampai deadline passed atau market closed

### Error: "Credits record not found"
**Cause:** Credits record tidak tersimpan dengan benar
**Solution:** Pastikan menyimpan credits record dari commit_bet

---

## 📚 API Reference

### commit_bet

```leo
async transition commit_bet(
    public market_id: field,
    private amount: u64,
    private outcome: u8,
    private credits_in: credits.aleo/credits,
) -> (Bet, Commitment, credits.aleo/credits, Future)
```

**Parameters:**
- `market_id`: Market ID (public)
- `amount`: Bet amount in microcredits (private)
- `outcome`: OUTCOME_YES (1) or OUTCOME_NO (2) (private)
- `credits_in`: Private credits record (private)

**Returns:**
- `Bet`: Private bet record
- `Commitment`: Commitment struct
- `credits.aleo/credits`: Change record (if any)
- `Future`: On-chain processing future

---

### reveal_bet

```leo
async transition reveal_bet(
    private bet: Bet,
    private commitment: Commitment,
    private credits_record: credits.aleo/credits,
    public amount: u64,
) -> Future
```

**Parameters:**
- `bet`: Private bet record from commit_bet
- `commitment`: Commitment struct from commit_bet
- `credits_record`: Stored private credits record
- `amount`: Revealed amount (public)

**Returns:**
- `Future`: On-chain processing future

---

## ✅ Summary

**Commit-Reveal Scheme memberikan privacy sejati:**
- ✅ Amount **PRIVATE** selama betting period
- ✅ Outcome **PRIVATE** selama betting period
- ✅ Credits **PRIVATE** (encrypted records)
- ✅ Pool updates hanya setelah reveal
- ✅ Privacy score: **8/10** (vs 0/10 untuk place_bet)

**Use `commit_bet` untuk privacy maksimal!** 🔐
