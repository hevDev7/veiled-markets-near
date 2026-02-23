# Veiled Markets v16 — Contract Review & Analysis

> Review of `veiled_markets_v16.aleo` (2576 lines, 32 transitions)

---

## RINGKASAN

Secara keseluruhan kontrak ini **well-designed** untuk prediction market on-chain pertama di Aleo. Arsitekturnya solid dengan FPMM AMM, dual-token support, dispute mechanism, dan multi-sig treasury. Namun ada beberapa isu yang perlu dipahami — sebagian adalah **limitasi fundamental Leo/Aleo**, sebagian bisa diperbaiki di versi mendatang.

**Rating: 7.5/10**
- Arsitektur: 9/10
- Keamanan: 7/10
- AMM Math: 8/10
- Governance: 7/10
- Privacy: 9/10 (v16 improvement)
- Code Quality: 8/10

---

## KELEBIHAN (Strengths)

### 1. Privacy-First Design (Excellent)
v16 memindahkan hampir semua transfer ke mode private:
- `sell_shares` → `transfer_public_to_private` (seller mendapat private record)
- `redeem_shares` → `transfer_public_to_private` (winner privacy)
- `add_liquidity` → `transfer_private_to_public` (LP deposit private)
- `claim_refund` → `transfer_public_to_private` (refund privacy)

Ini berarti observer on-chain TIDAK bisa melihat siapa yang sell, siapa yang menang, atau berapa banyak LP deposit. Sangat baik untuk prediction market di mana informasi posisi trader bisa di-exploit.

### 2. Credit Isolation per Market (Critical Security)
```
mapping market_credits: field => u128;  // per-market
mapping program_credits: u8 => u128;   // global
```
Dua level tracking mencegah serangan cross-market drainage. Jika satu market corrupt, market lain tidak terpengaruh karena setiap withdrawal di-assert terhadap `market_credits[market_id]`.

### 3. Claim Key System (Robust)
Setiap payout menggunakan unique key turunan dari nonce di record:
```
claim_key = BHP256(ShareClaimKey { market_id, claimer, share_nonce })
```
Karena nonce ada di record (private), tidak bisa di-forge. Dan mapping `share_redeemed[claim_key] = true` mencegah double-claim secara absolut.

### 4. Creator ≠ Resolver Separation
Market creator dan resolver bisa berbeda address. Ini memungkinkan:
- Creator membuat market tapi oracle terpisah yang resolve
- Mencegah creator bias (creator punya insentif dari fees, resolver harus netral)

### 5. Emergency Cancel as Safety Net
```
// Anyone can cancel if past resolution_deadline and not resolved
let is_emergency: bool = current_height > market.resolution_deadline
    && market.status != MARKET_STATUS_RESOLVED
    && market.status != MARKET_STATUS_CANCELLED;
```
Jika resolver hilang/offline, siapapun bisa cancel market setelah resolution deadline. User tidak akan kehilangan dana selamanya.

### 6. Dispute Mechanism dengan Bond
- Challenge window 12 jam setelah resolve
- Bond 1 ALEO untuk mencegah spam dispute
- Bond dikembalikan jika dispute upheld (final resolution sesuai proposed outcome)
- Market kembali ke CLOSED untuk re-resolution

### 7. Multi-Sig Treasury
Protocol fees tidak bisa ditarik oleh satu orang. Membutuhkan 2-of-3 atau 3-of-3 approval. Good governance practice.

---

## ISU KRITIS (Critical Issues)

### CRITICAL-1: Transfer Amount Mismatch (Transition vs Finalize)

**Lokasi:** `remove_liquidity`, `claim_lp_refund`, `withdraw_lp_resolved`

**Masalah:** Di Leo/Aleo, token transfer terjadi di **transition** (sebelum finalize), tapi jumlah yang seharusnya diterima baru bisa dihitung di **finalize** (karena perlu baca mapping). Ini menyebabkan mismatch:

```leo
// remove_liquidity — TRANSITION (line 750-751):
let min_u64: u64 = min_tokens_out as u64;
let transfer_future: Future = credits.aleo/transfer_public(self.caller, min_u64);
// Transfer: min_tokens_out ← ini yang user terima

// remove_liquidity — FINALIZE (line 775-803):
let tokens_out: u128 = (shares_to_remove * pool.total_liquidity) / pool.total_lp_shares;
assert(tokens_out >= min_tokens_out);
// Pool accounting: -= tokens_out  (lebih besar)
// market_credits: -= tokens_out   (lebih besar)
// program_credits: -= min_tokens_out  (lebih kecil)
```

**Dampak jika `tokens_out > min_tokens_out`:**

| Item | Amount Removed | Actual |
|------|---------------|--------|
| User receives | `min_tokens_out` | User rugi |
| Pool reserves | `tokens_out` | Over-decremented |
| market_credits | `tokens_out` | Over-decremented |
| program_credits | `min_tokens_out` | Under-decremented |
| Physical balance | `min_tokens_out` leaves program | |

Selisih `tokens_out - min_tokens_out` menjadi **orphaned credits** — sudah dihapus dari market_credits tapi masih ada di program secara fisik. Tidak bisa diakses siapapun.

**Mitigasi:** Frontend harus menghitung `tokens_out` secara presisi dan memasukkan sebagai `min_tokens_out`. Jika ada concurrent transaction yang mengubah pool, gap kecil bisa terjadi.

**Catatan:** Ini adalah **limitasi fundamental arsitektur Leo** (transition/finalize split), bukan coding error. Hampir semua DeFi di Aleo memiliki pattern yang sama.

---

### CRITICAL-2: Share Quantity Phantom Gap

**Lokasi:** `buy_shares_private` (line 383-390, 468-470)

```leo
// TRANSITION — record dibuat dengan expected_shares:
let share: OutcomeShare = OutcomeShare {
    quantity: expected_shares,  // dari frontend
    ...
};

// FINALIZE — actual shares dihitung:
let shares_out: u128 = (r_i + a) - r_i_new;
assert(shares_out >= expected_shares);  // bisa shares_out > expected_shares
```

Jika `shares_out = 105` tapi `expected_shares = 100`:
- Record user mengatakan 100 shares
- Pool sebenarnya minted 105 shares
- 5 phantom shares ada di pool tapi TIDAK dimiliki siapapun
- Inflasi kecil yang menguntungkan LP, merugikan buyer

**Dampak:** Kecil per transaksi (tergantung akurasi frontend), tapi terakumulasi seiring waktu. LP mendapat sedikit keuntungan dari phantom shares.

---

### CRITICAL-3: Dispute Mechanism Lemah

**Masalah 1: Resolver sama yang re-resolve**
Setelah dispute, market kembali ke CLOSED. Tapi yang me-resolve **tetap resolver yang sama**. Jika resolver jahat, dia bisa terus submit outcome yang salah. Disputer harus terus bayar bond 1 ALEO setiap kali.

**Masalah 2: Hanya 1 dispute per round**
```leo
let has_dispute: bool = market_disputes.contains(market_id);
assert(!has_dispute);  // hanya satu dispute diizinkan
```
Jika ada 2 orang yang ingin dispute, yang kedua gagal. First-come-first-served.

**Masalah 3: Bond recovery tidak dijamin**
Disputer hanya mendapat bond kembali jika final resolution **persis sama** dengan `proposed_outcome` mereka:
```leo
assert(resolution.winning_outcome == proposed_outcome);
```
Jika disputer propose outcome 2, tapi final resolution outcome 3, bond hilang — meski disputer benar bahwa outcome 1 salah.

**Rekomendasi:** Di versi mendatang, pertimbangkan:
- Resolver rotation setelah dispute
- Dispute bond dikembalikan jika original resolution berubah (tidak harus match proposed outcome)
- Allow multiple disputes dengan escalating bond

---

## ISU MEDIUM (Medium Issues)

### MEDIUM-1: LP Terkunci Antara Deadline dan Finalization

```
Timeline LP:
[ACTIVE: bisa remove_lp] → deadline → [LOCKED ❌] → resolve → [LOCKED ❌] → +12h challenge → finalize → [withdraw_lp_resolved ✓]
```

LP tidak bisa tarik dana selama period antara deadline dan finalization. Ini bisa beberapa jam sampai **berhari-hari** jika resolver lambat. LP essentially "frozen".

**Dampak:** LP yang butuh likuiditas mendesak tidak bisa keluar. Juga, LP terpapar risiko resolusi yang salah tanpa bisa hedge.

**Mitigasi:** Bisa tambahkan `remove_liquidity_closed` yang mengizinkan LP withdraw saat market CLOSED (sebelum resolve). Risikonya: LP bisa front-run resolusi, tapi ini bisa diatasi dengan partial withdrawal limit.

---

### MEDIUM-2: Fee Asymmetry (Buy vs Sell)

| | Buy | Sell |
|---|-----|------|
| Protocol | 0.5% | 0.5% |
| Creator | 0.5% | 0.5% |
| LP | 0% | 1.0% |
| **Total** | **1%** | **2%** |

LP hanya mendapat fee dari sell, bukan buy. Ini berarti:
- Buyer mendapat deal lebih baik dari seller
- LP revenue hanya dari satu sisi volume
- Banyak FPMM (Gnosis, Polymarket) mengenakan LP fee di kedua sisi

**Dampak:** LP return lebih rendah, bisa mengurangi insentif menyediakan likuiditas.

---

### MEDIUM-3: No Resolver Update Mechanism

Jika resolver kehilangan private key:
- Market TIDAK bisa di-resolve secara normal
- Satu-satunya jalan: tunggu sampai `resolution_deadline` lewat, lalu `emergency_cancel`
- Semua bettor mendapat refund, tapi pemenang yang seharusnya "menang" tidak mendapat profit

**Rekomendasi:** Tambahkan `update_resolver` transition yang hanya bisa dipanggil oleh creator atau multisig.

---

### MEDIUM-4: Creator Cancel Terlalu Restrictif

```leo
let is_creator_cancel: bool = market.creator == caller
    && market.status == MARKET_STATUS_ACTIVE;
assert(!is_creator_cancel || pool.total_volume == 0u128);
```

Creator hanya bisa cancel jika **zero volume**. Begitu ada 1 bet, creator tidak bisa cancel, bahkan jika:
- Market question mengandung error
- Resolution source sudah tidak valid
- Market spam/duplicate

**Hanya emergency cancel** (past resolution_deadline, anyone can call) yang tersedia.

---

### MEDIUM-5: Integer Division Rounding Loss

FPMM menggunakan step division (untuk menghindari u128 overflow):
```leo
let step1: u128 = (step0 * r1) / (r1 + a);  // rounds DOWN
let step2: u128 = (step1 * r2) / (r2 + a);  // rounds DOWN again
let step3: u128 = (step2 * r3) / (r3 + a);  // rounds DOWN again
```

Setiap pembagian membulatkan ke bawah. Untuk 4-outcome market, ada 3 pembagian berturut-turut:
- Error kumulatif: bisa 0.01-0.1% per transaksi pada amount kecil
- Selalu merugikan buyer (fewer shares) dan menguntungkan pool/LP
- Pada amount besar (>100 ALEO), error negligible (<0.001%)

---

## ISU MINOR (Low Issues)

### LOW-1: Zero-Quantity Records

`sell_shares` selalu membuat remainder record:
```leo
let remainder: OutcomeShare = OutcomeShare {
    quantity: shares.quantity - max_shares_used,  // bisa 0
    ...
};
```
Jika `max_shares_used == shares.quantity`, record dengan quantity=0 dibuat. Wasteful (blockchain storage) tapi tidak berbahaya.

---

### LOW-2: Close Market Redundansi

`close_market` (status ACTIVE → CLOSED) bisa di-skip karena `resolve_market` sudah handle auto-close:
```leo
let is_past_deadline: bool = market.status == MARKET_STATUS_ACTIVE
    && current_height > market.deadline;
assert(is_closed || is_past_deadline);
```
Resolver bisa langsung resolve tanpa close dulu. `close_market` masih berguna sebagai explicit signal, tapi tidak strictly necessary.

---

### LOW-3: Multisig Init Permissionless

```leo
async transition init_multisig(
    public signer_1: address, ...
) -> Future {
    // No access control — anyone can call
```
Siapapun bisa init multisig (hanya sekali). Jika adversary init duluan sebelum deployer, treasury terkunci. Dalam praktik, deployer harus call ini SEGERA setelah deploy.

**Rekomendasi:** Tambahkan access control (hardcode deployer address, atau cek di constructor).

---

### LOW-4: Proposal ID Collision (Theoretical)

```leo
let proposal_id: field = BHP256::hash_to_field(ProposalSeed {
    proposer, action, amount, nonce: 0u64  // nonce always 0
});
```
Nonce selalu 0. Jika signer yang sama propose amount yang sama dua kali, `proposal_id` akan sama → assert fails. Perlu nonce incrementing atau timestamp-based.

---

### LOW-5: No Event Emission

Kontrak tidak emit events. Ini menyulitkan:
- Off-chain indexer untuk track market creation, bets, resolutions
- Frontend untuk mendapat real-time updates
- Analytics dan reporting

Leo/Aleo belum memiliki event system bawaan, jadi ini adalah limitasi platform, bukan kontrak.

---

## ANALISIS ARSITEKTUR

### Transition/Finalize Split Pattern

Ini adalah pattern paling fundamental di Leo dan sumber dari beberapa isu di atas:

```
TRANSITION (private, runs locally):     FINALIZE (public, runs on-chain):
├── Create records                      ├── Read mappings
├── Execute token transfers             ├── Validate business logic
├── Return outputs                      ├── Update mappings
└── Pass values to finalize             └── Assert correctness
```

**Constraint:** Transfer amount harus ditentukan di transition, tapi jumlah yang benar baru diketahui di finalize.

**Solusi yang dipakai kontrak ini:**
- User pre-compute amount di frontend
- Pass sebagai `expected_shares` / `min_tokens_out`
- Finalize validates `actual >= expected`

**Trade-off:** Jika frontend computation accurate, tidak ada masalah. Jika ada concurrent transactions yang mengubah pool state, user bisa mendapat sedikit kurang dari yang seharusnya.

### Dual Token Architecture

Pola duplikasi ALEO/USDCX cukup verbose (setiap fungsi didup), tapi ini satu-satunya cara di Leo karena:
- Tidak bisa generic/parameterize atas program imports
- `credits.aleo/transfer_*` dan `test_usdcx_stablecoin.aleo/transfer_*` adalah panggilan yang berbeda
- Leo tidak support dynamic dispatch

Alternatif: bisa gunakan satu fungsi dengan branching, tapi Leo tidak mengizinkan conditional future creation (harus selalu call salah satu).

### FPMM vs CPMM

Kontrak menggunakan FPMM (Fixed Product Market Maker) dengan complete-set minting, bukan CPMM (Constant Product Market Maker like Uniswap). Ini tepat untuk prediction market karena:
- Harga outcome bersifat bounded [0, 1]
- Complete-set minting menjamin shares redeemable 1:1
- Reserves merepresentasikan probability space

---

## SECURITY CHECKLIST

| Check | Status | Notes |
|-------|--------|-------|
| Double-claim prevention | ✅ Pass | Claim key system + mapping check |
| Cross-market drainage | ✅ Pass | market_credits isolation |
| Integer overflow | ✅ Pass | u128 dengan step division |
| Underflow on subtraction | ✅ Pass | assert(held >= amount) sebelum subtract |
| Unauthorized resolution | ✅ Pass | resolver == caller check |
| Unauthorized fee withdrawal | ✅ Pass | creator == caller + finalized check |
| Reentrancy | ✅ N/A | Leo/Aleo tidak punya reentrancy vector |
| Front-running resolution | ⚠️ Partial | Challenge window mitigates but 12h may be short |
| Oracle manipulation | ⚠️ Partial | Single resolver, dispute mechanism exists but limited |
| LP sandwiching | ⚠️ Partial | min_shares_out / max_shares_used provides slippage protection |
| Stale data exploitation | ⚠️ Partial | Transition/finalize gap allows minor slippage |

---

## REKOMENDASI PRIORITAS

### Untuk v17 (High Priority)
1. **Fix transfer amount matching** — Di fungsi yang menggunakan `min_tokens_out`, pastikan `program_credits` dan `market_credits` di-decrement konsisten (keduanya gunakan nilai yang sama)
2. **Improve dispute mechanism** — Allow resolver rotation, return bond if original resolution changed
3. **LP withdrawal saat CLOSED** — Tambahkan `remove_liquidity_closed` agar LP tidak terkunci lama

### Untuk v18+ (Medium Priority)
4. **LP fee on buy** — Tingkatkan LP revenue dengan menambah LP fee di sisi buy
5. **Update resolver** — Tambahkan fungsi ganti resolver oleh creator/multisig
6. **Init multisig access control** — Restrict ke deployer address
7. **Proposal nonce** — Gunakan incrementing nonce untuk proposal ID

### Long Term
8. **On-chain event system** — Begitu Aleo support events, tambahkan untuk indexing
9. **Partial cancel** — Allow creator cancel dengan refund meski ada volume (perlu careful design)
10. **Multiple disputes** — Escalating bond system untuk dispute rounds berulang

---

## KESIMPULAN

Kontrak `veiled_markets_v16.aleo` adalah implementasi prediction market yang **mature dan well-thought-out** di platform Aleo. Arsitektur FPMM, dual-token, privacy-first, dan credit isolation menunjukkan pemahaman mendalam tentang both DeFi mechanics dan Aleo's programming model.

Isu-isu yang ditemukan sebagian besar berakar dari **limitasi platform Leo/Aleo** (transition/finalize split), bukan dari logic error. Isu-isu non-platform (dispute mechanism, LP locking, fee asymmetry) adalah design trade-offs yang reasonable untuk versi testnet.

Untuk production mainnet, prioritas utama adalah:
1. Audit profesional pihak ketiga (khususnya credit accounting)
2. Fix transfer amount consistency
3. Strengthen dispute mechanism
4. Extensive testnet testing dengan concurrent transactions
