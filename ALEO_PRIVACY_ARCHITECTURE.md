# 🔐 Arsitektur Privacy di Aleo Blockchain

## 📚 Konsep Dasar Aleo Privacy

### 1. **Records (Private State)** 🔒

**Cara Kerja:**
- Records adalah encrypted data structures
- Hanya owner yang bisa decrypt dengan private key
- Disimpan on-chain tapi encrypted
- Tidak terlihat oleh siapa pun kecuali owner

**Contoh:**
```leo
record Bet {
    owner: address,      // Private (encrypted)
    amount: u64,         // Private (encrypted)
    outcome: u8,         // Private (encrypted)
}
```

**Privacy Level:** ✅ **FULLY PRIVATE** (10/10)

### 2. **Mappings (Public State)** 🌍

**Cara Kerja:**
- Mappings adalah public storage
- Semua orang bisa baca
- Digunakan untuk aggregate data
- Tidak bisa di-encrypt

**Contoh:**
```leo
mapping market_pools: field => MarketPool {
    total_yes_pool: u64,  // Public
    total_no_pool: u64,   // Public
}
```

**Privacy Level:** ❌ **PUBLIC** (0/10)

### 3. **Transitions (Functions)** ⚙️

**Public Parameters:**
- Terlihat di transaction calldata
- Semua orang bisa lihat
- Digunakan untuk public state updates

**Private Parameters:**
- TIDAK terlihat di transaction calldata
- Hanya digunakan dalam ZK proof
- Tetap private meskipun digunakan dalam computation

---

## 🔄 Transfer Types di Aleo

### 1. **transfer_private** 🔒🔒

**Signature:**
```leo
transition transfer_private(
    sender: credits.aleo/credits,  // Private record
    receiver: address,              // Private address
    amount: u64                     // Private amount
) -> (credits.aleo/credits, credits.aleo/credits)
```

**Privacy:**
- ✅ Sender record: PRIVATE
- ✅ Receiver: PRIVATE
- ✅ Amount: PRIVATE
- ✅ **FULLY PRIVATE** - tidak ada yang terlihat!

**Output:**
- Receiver record (encrypted)
- Change record (encrypted)

**Use Case:** Transfer antara private records

---

### 2. **transfer_private_to_public** 🔒🌍

**Signature:**
```leo
async transition transfer_private_to_public(
    sender: credits.aleo/credits,  // Private record
    public receiver: address,      // PUBLIC address
    public amount: u64              // PUBLIC amount ❌
) -> (credits.aleo/credits, Future)
```

**Privacy:**
- ✅ Sender record: PRIVATE
- ❌ Receiver: PUBLIC
- ❌ Amount: PUBLIC (terlihat!)
- ⚠️ **PARTIALLY PRIVATE** - amount terlihat

**Output:**
- Change record (encrypted)
- Future untuk update public balance

**Use Case:** Convert private credits ke public balance

**Masalah:** Amount masih terlihat di public parameter!

---

### 3. **transfer_public** 🌍🌍

**Signature:**
```leo
async transition transfer_public(
    public sender: address,   // PUBLIC
    public receiver: address, // PUBLIC
    public amount: u64        // PUBLIC ❌
) -> Future
```

**Privacy:**
- ❌ Semua parameter PUBLIC
- ❌ **TIDAK PRIVATE** sama sekali

**Use Case:** Transfer public balance ke public balance

---

### 4. **transfer_public_as_signer** 🌍🌍

**Signature:**
```leo
async transition transfer_public_as_signer(
    public receiver: address, // PUBLIC
    public amount: u64        // PUBLIC ❌
) -> Future
```

**Privacy:**
- ❌ Amount: PUBLIC (terlihat!)
- ❌ Receiver: PUBLIC
- ❌ **TIDAK PRIVATE**

**Use Case:** Transfer dari caller's public balance

**Ini yang digunakan saat ini di `place_bet` - makanya amount terlihat!**

---

## 🎯 Solusi untuk Privacy Sejati

### Option 1: Commit-Reveal Scheme ✅✅✅

**Cara Kerja:**

#### Phase 1: Commit (Private)
```leo
async transition commit_bet(
    public market_id: field,
    private amount: u64,              // ✅ PRIVATE
    private outcome: u8,             // ✅ PRIVATE
    private credits_in: credits.aleo/credits,  // ✅ PRIVATE
) -> (Bet, Commitment, credits.aleo/credits, Future) {
    // Create commitment hash
    let commitment: field = BHP256::hash_to_field(
        CommitmentData {
            amount: amount,
            outcome: outcome,
            nonce: random(),
        }
    );
    
    // Store commitment (public, tapi tidak reveal amount/outcome)
    // Transfer credits privately
    let transfer_future: Future = credits.aleo/transfer_private_to_public(
        veiled_markets_privacy.aleo,
        amount  // Masih terlihat di sini ❌
    );
    
    // Create bet record
    let bet: Bet = Bet { ... };
    
    return (bet, commitment, change, store_commitment(...));
}
```

**Masalah:** `transfer_private_to_public` masih memerlukan public amount!

#### Phase 2: Batch Reveal (Setelah Deadline)
```leo
async transition reveal_bet(
    private bet: Bet,
    private commitment: Commitment,
) -> Future {
    // Verify commitment matches bet
    // Update pool in batch
    // Amount/outcome baru terlihat setelah deadline
}
```

**Keuntungan:**
- ✅ Amount/outcome tidak terlihat selama betting period
- ✅ Privacy terjaga sampai deadline
- ✅ Batch reveal setelah deadline

**Masalah:** Masih perlu reveal amount untuk transfer credits!

---

### Option 2: Private Transfer dengan Encrypted Pool Updates ✅✅

**Cara Kerja:**

```leo
async transition place_bet_private(
    public market_id: field,
    private amount: u64,              // ✅ PRIVATE
    private outcome: u8,              // ✅ PRIVATE
    private credits_in: credits.aleo/credits,  // ✅ PRIVATE
) -> (Bet, credits.aleo/credits, Future) {
    // Extract amount from private record
    let amount: u64 = credits_in.microcredits;
    
    // Validate privately
    assert(amount >= MIN_BET_AMOUNT);
    assert(outcome == OUTCOME_YES || outcome == OUTCOME_NO);
    
    // Transfer privately - tapi masih perlu reveal untuk public balance
    // Masalah: transfer_private_to_public memerlukan public amount!
    
    // Solusi: Store encrypted increments, reveal batch setelah deadline
    let encrypted_increment: field = BHP256::hash_to_field(
        EncryptedIncrement {
            amount: amount,
            outcome: outcome,
            nonce: random(),
        }
    );
    
    // Store encrypted increment (public, tapi tidak reveal amount/outcome)
    // Update pool setelah deadline dengan batch reveal
}
```

**Masalah:** Masih perlu reveal amount untuk transfer credits ke program!

---

### Option 3: Program Menerima Private Records ✅✅✅

**Solusi Terbaik:**

Program bisa menerima private credits record dan store di internal mapping:

```leo
// Program's internal private credits storage
mapping program_private_credits: field => credits.aleo/credits;

async transition place_bet_with_private_record(
    public market_id: field,
    private amount: u64,              // ✅ PRIVATE
    private outcome: u8,               // ✅ PRIVATE
    private credits_in: credits.aleo/credits,  // ✅ PRIVATE
) -> (Bet, credits.aleo/credits, Future) {
    // Extract amount from private record (private computation)
    let amount: u64 = credits_in.microcredits;
    
    // Validate privately
    assert(amount >= MIN_BET_AMOUNT);
    
    // Split credits record
    let (bet_amount_record, change_record) = credits.aleo/split(
        credits_in,
        amount
    );
    
    // Store bet amount record in program's private storage
    // Key: hash(market_id, bettor_address, nonce)
    let storage_key: field = BHP256::hash_to_field(
        StorageKey {
            market_id: market_id,
            bettor: self.caller,
            nonce: random(),
        }
    );
    
    // Store private record (encrypted, tidak terlihat)
    program_private_credits.set(storage_key, bet_amount_record);
    
    // Create bet record
    let bet: Bet = Bet { ... };
    
    // Update pool dengan encrypted increments atau batch reveal
    return (bet, change_record, finalize_place_bet_private(...));
}
```

**Keuntungan:**
- ✅ Amount tidak terlihat (dari private record)
- ✅ Outcome tidak terlihat (private parameter)
- ✅ Credits disimpan sebagai private record di program
- ✅ Pool update bisa dilakukan batch setelah deadline

**Masalah:** Program perlu manage private records (lebih kompleks)

---

## 🔍 Analisis: Kenapa Masih Terlihat?

### Masalah Fundamental:

**`transfer_private_to_public` memerlukan public amount:**

```leo
async transition transfer_private_to_public(
    sender: credits.aleo/credits,  // Private ✅
    public receiver: address,      // Public ❌
    public amount: u64             // Public ❌ ← MASALAH!
) -> (credits.aleo/credits, Future)
```

**Ini adalah limitation dari Aleo credits program!**

### Solusi Workaround:

1. **Commit-Reveal:** Reveal setelah deadline
2. **Private Storage:** Program store private records
3. **Batch Processing:** Batch reveal setelah deadline

---

## 💡 Rekomendasi Implementasi

### Best Approach: Commit-Reveal dengan Private Storage

```leo
// Step 1: Commit bet (fully private)
async transition commit_bet(
    public market_id: field,
    private amount: u64,
    private outcome: u8,
    private credits_in: credits.aleo/credits,
) -> (Bet, Commitment, credits.aleo/credits, Future) {
    // Create commitment
    let commitment: field = BHP256::hash_to_field(...);
    
    // Store private credits record in program
    // (tidak reveal amount)
    
    // Store commitment (public, tapi tidak reveal amount/outcome)
    
    return (bet, commitment, change, store_commitment(...));
}

// Step 2: Reveal setelah deadline (batch)
async transition reveal_bet(
    private bet: Bet,
    private commitment: Commitment,
    private credits_record: credits.aleo/credits,  // Reveal untuk transfer
) -> Future {
    // Verify commitment
    // Transfer credits (amount baru terlihat di sini)
    // Update pool
}
```

**Privacy:**
- ✅ Amount tidak terlihat selama betting period
- ✅ Outcome tidak terlihat selama betting period
- ✅ Hanya terlihat saat reveal (setelah deadline)

---

## 📊 Perbandingan Approaches

| Approach | Privacy Score | Complexity | Feasibility |
|----------|---------------|------------|-------------|
| Current (Public Inputs) | 0/10 | Low | ✅ Working |
| Commit-Reveal | 8/10 | Medium | ✅ Feasible |
| Private Storage | 9/10 | High | ⚠️ Complex |
| Batch Reveal | 7/10 | Medium | ✅ Feasible |

---

## 🎯 Kesimpulan

**Untuk privacy sejati di Aleo:**

1. ✅ Gunakan **private parameters** untuk amount dan outcome
2. ✅ Gunakan **private records** untuk credits transfer
3. ✅ Implement **commit-reveal** atau **batch reveal** scheme
4. ✅ **Store private records** di program internal storage
5. ✅ **Reveal setelah deadline** untuk pool updates

**Trade-off:**
- Privacy lebih baik ✅
- Complexity lebih tinggi ⚠️
- User experience sedikit lebih kompleks ⚠️

---

**Status:** Perlu redesign kontrak untuk privacy sejati!
