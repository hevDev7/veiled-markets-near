# 🔐 Solusi Privacy Sejati untuk Veiled Markets

## 🎯 Masalah Saat Ini

**Bet amount dan outcome terlihat di public inputs!**

```leo
async transition place_bet(
    public market_id: field,
    public amount: u64,        // ❌ TERLIHAT!
    public outcome: u8,        // ❌ TERLIHAT!
) -> (Bet, Future)
```

**Root Cause:** `credits.aleo/transfer_public_as_signer` memerlukan `public amount`

---

## ✅ Solusi: Commit-Reveal dengan Private Credits Storage

### Arsitektur Baru

#### Phase 1: Commit (Fully Private)
```leo
async transition commit_bet(
    public market_id: field,
    private amount: u64,              // ✅ PRIVATE
    private outcome: u8,               // ✅ PRIVATE
    private credits_in: credits.aleo/credits,  // ✅ PRIVATE
) -> (Bet, Commitment, credits.aleo/credits, Future) {
    // Extract amount from private record
    let amount: u64 = credits_in.microcredits;
    
    // Validate privately
    assert(amount >= MIN_BET_AMOUNT);
    assert(outcome == OUTCOME_YES || outcome == OUTCOME_NO);
    
    // Create commitment hash (public, tapi tidak reveal amount/outcome)
    let commitment: field = BHP256::hash_to_field(
        CommitmentData {
            amount: amount,
            outcome: outcome,
            nonce: random(),
            bettor: self.caller,
        }
    );
    
    // Split credits record
    let (bet_amount_record, change_record) = credits.aleo/split(
        credits_in,
        amount
    );
    
    // Store private credits record in program (encrypted)
    // Key: commitment hash
    let storage_key: field = commitment;
    
    // Store commitment data (public mapping, tapi encrypted)
    return (
        Bet { ... },
        Commitment { hash: commitment, ... },
        change_record,
        store_commitment(storage_key, bet_amount_record, ...)
    );
}
```

#### Phase 2: Reveal (Setelah Deadline)
```leo
async transition reveal_bet(
    private bet: Bet,
    private commitment: Commitment,
    private credits_record: credits.aleo/credits,
) -> Future {
    // Verify commitment matches bet
    let expected_commitment: field = BHP256::hash_to_field(
        CommitmentData {
            amount: bet.amount,
            outcome: bet.outcome,
            nonce: commitment.nonce,
            bettor: bet.owner,
        }
    );
    assert(expected_commitment == commitment.hash);
    
    // Transfer credits (amount baru terlihat di sini, tapi setelah deadline)
    let transfer_future: Future = credits.aleo/transfer_private_to_public(
        veiled_markets_privacy.aleo,
        bet.amount  // Terlihat, tapi setelah deadline
    );
    
    // Update pool
    return finalize_reveal_bet(transfer_future, bet.market_id, bet.amount, bet.outcome);
}
```

---

## 🔄 Alternatif: Private-to-Private Transfer

### Program Menerima Private Records

```leo
// Program's internal private credits storage
mapping program_private_credits: field => credits.aleo/credits;

async transition place_bet_private(
    public market_id: field,
    private amount: u64,
    private outcome: u8,
    private credits_in: credits.aleo/credits,
) -> (Bet, credits.aleo/credits, Future) {
    // Split credits
    let (bet_amount_record, change_record) = credits.aleo/split(
        credits_in,
        amount
    );
    
    // Store private record in program (encrypted)
    let storage_key: field = BHP256::hash_to_field(
        StorageKey {
            market_id: market_id,
            bettor: self.caller,
            nonce: random(),
        }
    );
    
    // Store encrypted (tidak reveal amount)
    program_private_credits.set(storage_key, bet_amount_record);
    
    // Create bet record
    let bet: Bet = Bet { ... };
    
    // Update pool dengan encrypted increments atau batch reveal
    return (bet, change_record, finalize_place_bet_private(...));
}
```

**Keuntungan:**
- ✅ Amount tidak terlihat (private record)
- ✅ Outcome tidak terlihat (private parameter)
- ✅ Credits disimpan encrypted di program

---

## 📊 Perbandingan Solusi

| Solusi | Privacy Score | Complexity | UX Impact |
|--------|---------------|------------|-----------|
| **Current** | 0/10 | Low | ✅ Simple |
| **Commit-Reveal** | 8/10 | Medium | ⚠️ 2-step |
| **Private Storage** | 9/10 | High | ⚠️ Complex |

---

## 💡 Rekomendasi: Hybrid Approach

### Kombinasi Commit-Reveal + Private Storage

1. **Commit Phase:** User commit bet dengan private inputs
2. **Private Storage:** Program store private credits records
3. **Batch Reveal:** Reveal setelah deadline untuk pool updates
4. **Privacy:** Amount/outcome tidak terlihat selama betting period

**Privacy Score:** 9/10 ✅

---

## 🚀 Next Steps

1. ✅ Redesign kontrak dengan commit-reveal scheme
2. ✅ Implement private credits storage
3. ✅ Update frontend untuk 2-phase flow
4. ✅ Test privacy guarantees

**Ingin saya implementasikan solusi ini?**
