# 📊 Metode Betting yang Digunakan di Aplikasi Saat Ini

## 🔍 Status Saat Ini

**Kontrak:** ✅ **SUDAH UPGRADE** - `veiled_market_v3.aleo` dengan Commit-Reveal Scheme (Phase 2)
- ✅ `commit_bet` - Available
- ✅ `reveal_bet` - Available
- ✅ `place_bet` - Legacy (masih ada untuk backward compatibility)

**Frontend:** ⚠️ **BELUM UPGRADE** - Masih menggunakan `place_bet` (Legacy)

**Privacy Level:** ⚠️ **TERBATAS** (2/10) - Karena frontend belum menggunakan commit-reveal

---

## 📝 Implementasi di Frontend

### File: `frontend/src/lib/store.ts`

```typescript
placeBet: async (marketId, amount, outcome) => {
  // Build inputs for place_bet transaction
  const inputs = buildPlaceBetInputs(
    marketId,
    amount,
    outcome,
    walletState.address
  )

  // Request transaction through wallet
  const transactionId = await walletManager.requestTransaction({
    programId: CONTRACT_INFO.programId,
    functionName: 'place_bet',  // ← Menggunakan place_bet
    inputs,
    fee: 500000,
  })
}
```

### File: `frontend/src/lib/aleo-client.ts`

```typescript
/**
 * Build inputs for place_bet transaction
 * place_bet(market_id: field, amount: u64, outcome: u8)
 */
export function buildPlaceBetInputs(
  marketId: string,
  amount: bigint,
  outcome: 'yes' | 'no',
  _bettorAddress?: string
): string[] {
  return [
    marketId,
    `${amount}u64`,           // ← PUBLIC amount
    outcome === 'yes' ? '1u8' : '2u8',  // ← PUBLIC outcome
  ];
}
```

---

## ⚠️ Masalah Privacy

### Yang Terlihat di Blockchain:

1. ✅ **Market ID** - Public (normal)
2. ❌ **Amount** - **PUBLIC** (terlihat semua orang!)
3. ❌ **Outcome** - **PUBLIC** (terlihat semua orang!)
4. ✅ **Bet Record** - Encrypted (tapi tidak relevan karena inputs sudah public)

### Privacy Score: **2/10** ⚠️

**Masalah:**
- Amount dan outcome terlihat di transaction calldata
- Semua orang bisa lihat berapa Anda bet dan posisi Anda
- Tidak ada privacy untuk betting activity

---

## 🔄 Perbandingan dengan Commit-Reveal Scheme

| Aspek | `place_bet` (Saat Ini) | `commit_bet` + `reveal_bet` (Phase 2) |
|-------|------------------------|----------------------------------------|
| **Amount Privacy** | ❌ Public | ✅ Private (sampai reveal) |
| **Outcome Privacy** | ❌ Public | ✅ Private (sampai reveal) |
| **Bet Record** | ✅ Encrypted | ✅ Encrypted |
| **Credits Transfer** | Public balance | Private records |
| **Privacy Score** | 2/10 | 9/10 |
| **Status** | ⚠️ Legacy | ✅ Recommended |

---

## 🚀 Status: Kontrak Sudah Upgrade, Frontend Perlu Update

### ✅ Yang Sudah Selesai:

1. ✅ **Kontrak sudah di-deploy** - `veiled_market_v3.aleo` dengan Phase 2
2. ✅ **Fungsi commit-reveal tersedia** - `commit_bet` dan `reveal_bet` sudah ada
3. ✅ **Privacy maksimal di kontrak** - Amount & outcome private selama betting period

### ⚠️ Yang Perlu Diupdate:

1. ⚠️ **Frontend masih pakai `place_bet`** - Perlu update ke `commit_bet` + `reveal_bet`
2. ⚠️ **UI belum support 2-step process** - Perlu tambahkan commit + reveal flow
3. ⚠️ **Storage untuk bet records** - Perlu simpan records untuk reveal

### Alasan Update Frontend:

1. ✅ **Privacy Maksimal** - Amount & outcome private selama betting period
2. ✅ **MEV Protection** - Tidak ada front-running
3. ✅ **User Experience** - Lebih aman untuk user
4. ✅ **Competitive Advantage** - Privacy adalah selling point utama

### Yang Perlu Diubah:

#### 1. **Update `buildPlaceBetInputs` → `buildCommitBetInputs`**

```typescript
// OLD (place_bet)
export function buildPlaceBetInputs(
  marketId: string,
  amount: bigint,
  outcome: 'yes' | 'no',
): string[] {
  return [
    marketId,
    `${amount}u64`,           // PUBLIC
    outcome === 'yes' ? '1u8' : '2u8',  // PUBLIC
  ];
}

// NEW (commit_bet)
export function buildCommitBetInputs(
  marketId: string,
  amount: bigint,
  outcome: 'yes' | 'no',
  creditsRecord: string,  // Private credits record
): string[] {
  return [
    marketId,
    `${amount}u64`,           // PRIVATE
    outcome === 'yes' ? '1u8' : '2u8',  // PRIVATE
    creditsRecord,            // PRIVATE record
  ];
}
```

#### 2. **Update `placeBet` Function**

```typescript
// OLD
placeBet: async (marketId, amount, outcome) => {
  const inputs = buildPlaceBetInputs(marketId, amount, outcome)
  const txId = await walletManager.requestTransaction({
    functionName: 'place_bet',  // ← OLD
    inputs,
  })
}

// NEW
commitBet: async (marketId, amount, outcome, creditsRecord) => {
  const inputs = buildCommitBetInputs(marketId, amount, outcome, creditsRecord)
  const txId = await walletManager.requestTransaction({
    functionName: 'commit_bet',  // ← NEW
    inputs,
  })
  
  // Simpan records untuk reveal nanti
  // - Bet record
  // - Commitment record
  // - Bet amount record
}
```

#### 3. **Tambahkan `revealBet` Function**

```typescript
revealBet: async (betRecord, commitmentRecord, betAmountRecord, amount) => {
  const inputs = [
    betRecord,           // Private
    commitmentRecord,    // Private
    betAmountRecord,     // Private
    `${amount}u64`,      // Public (setelah deadline)
  ]
  
  const txId = await walletManager.requestTransaction({
    functionName: 'reveal_bet',
    inputs,
  })
}
```

#### 4. **Update UI untuk 2-Step Process**

```typescript
// Step 1: Commit (saat user klik bet)
const handleCommitBet = async () => {
  // Get private credits record
  const creditsRecord = await getPrivateCreditsRecord(amount)
  
  // Commit bet
  const { betRecord, commitmentRecord, betAmountRecord } = 
    await commitBet(marketId, amount, outcome, creditsRecord)
  
  // Simpan records untuk reveal nanti
  saveBetRecords(betRecord, commitmentRecord, betAmountRecord)
}

// Step 2: Reveal (setelah deadline atau otomatis)
const handleRevealBet = async () => {
  const { betRecord, commitmentRecord, betAmountRecord } = 
    getSavedBetRecords()
  
  await revealBet(betRecord, commitmentRecord, betAmountRecord, amount)
}
```

---

## 📋 Checklist untuk Upgrade

### Frontend Changes:

- [ ] Update `buildPlaceBetInputs` → `buildCommitBetInputs`
- [ ] Tambahkan `buildRevealBetInputs` function
- [ ] Update `placeBet` → `commitBet` function
- [ ] Tambahkan `revealBet` function
- [ ] Update UI untuk 2-step process (commit + reveal)
- [ ] Tambahkan storage untuk bet records (localStorage)
- [ ] Tambahkan auto-reveal setelah deadline
- [ ] Update error handling

### Backend Changes:

- [ ] Update indexer untuk handle commit/reveal transactions
- [ ] Track commitment hashes
- [ ] Handle reveal transactions

### Testing:

- [ ] Test commit bet flow
- [ ] Test reveal bet flow
- [ ] Test error cases
- [ ] Test privacy (verify amount/outcome tidak terlihat)

---

## 💡 Quick Fix (Temporary)

Jika ingin tetap menggunakan `place_bet` tapi meningkatkan privacy awareness:

1. **Tambah Warning di UI:**
   ```typescript
   <Alert>
     ⚠️ Note: Bet amount and outcome are visible on-chain.
     For maximum privacy, use Commit-Reveal scheme (coming soon).
   </Alert>
   ```

2. **Update Documentation:**
   - Jelaskan privacy limitations
   - Mention future upgrade ke commit-reveal

---

## 📚 Referensi

- **Current Implementation:** `frontend/src/lib/store.ts` line 706-852
- **Input Builder:** `frontend/src/lib/aleo-client.ts` line 472-484
- **Contract:** `contracts/src/main.leo` line 335-449 (`place_bet`)
- **Phase 2 Contract:** `contracts/src/main.leo` line 456-679 (`commit_bet` + `reveal_bet`)

---

## 🎯 Kesimpulan

**Saat Ini:**
- ✅ Menggunakan `place_bet` (Legacy)
- ⚠️ Privacy terbatas (amount & outcome public)
- ✅ Fungsi sudah bekerja

**Rekomendasi:**
- ✅ Upgrade ke `commit_bet` + `reveal_bet` (Phase 2)
- ✅ Privacy maksimal (amount & outcome private)
- ✅ Better user experience

**Next Steps:**
1. Implement commit-reveal scheme di frontend
2. Update UI untuk 2-step process
3. Test thoroughly
4. Deploy update

---

**Aplikasi saat ini menggunakan `place_bet` dengan privacy terbatas. Upgrade ke commit-reveal scheme direkomendasikan untuk privacy maksimal!** 🔒
