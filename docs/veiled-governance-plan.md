# Veiled Governance — Rencana Implementasi Lengkap

> **Dokumen ini** merupakan rencana teknis menyeluruh untuk implementasi governance token dan
> peningkatan sistem multisig pada Veiled Markets, sebagai respons terhadap feedback juri Wave 3:
>
> *"Explore governance token for multisig"*

---

## Daftar Isi

1. [Latar Belakang & Motivasi](#1-latar-belakang--motivasi)
2. [Analisis Kondisi Saat Ini](#2-analisis-kondisi-saat-ini)
3. [Arsitektur Governance](#3-arsitektur-governance)
4. [VEIL Token — Spesifikasi](#4-veil-token--spesifikasi)
5. [Smart Contract: `veiled_governance_v1.aleo`](#5-smart-contract-veiled_governance_v1aleo)
6. [Governance Voting Flow](#6-governance-voting-flow)
7. [**Market Resolution via Governance**](#7-market-resolution-via-governance)
8. [Distribusi & Tokenomics](#8-distribusi--tokenomics)
9. [Integrasi dengan Veiled Markets](#9-integrasi-dengan-veiled-markets)
10. [Frontend — Governance Dashboard](#10-frontend--governance-dashboard)
11. [Database & Indexing](#11-database--indexing)
12. [Security Considerations](#12-security-considerations)
13. [Roadmap & Timeline](#13-roadmap--timeline)
14. [Perbandingan: Sebelum vs Sesudah](#14-perbandingan-sebelum-vs-sesudah)
15. [Appendix: Contract Pseudocode](#appendix-a-contract-pseudocode-leo)

---

## 1. Latar Belakang & Motivasi

### Feedback Juri Wave 3

> "Consider adding more market types beyond binary. **Explore governance token for multisig.**
> The FPMM implementation with dual-token support is the most production-ready prediction market
> in the wave. UI is a little bland and generic."

### Mengapa Governance Token Diperlukan?

| Masalah Saat Ini | Dampak | Solusi Governance |
|---|---|---|
| Multisig hanya untuk treasury withdrawal | Governance scope sangat terbatas | Token-weighted voting untuk semua keputusan protokol |
| 3 signer tetap, tidak bisa diubah | Sentralisasi pada 3 address | Seluruh VEIL holder bisa berpartisipasi |
| Tidak ada timelock | Proposal langsung dieksekusi | Timelock + veto period |
| Resolver = single address | Single point of failure | Committee resolver via governance vote |
| Tidak ada incentive untuk partisipasi | Komunitas pasif | VEIL reward untuk LP dan trader |
| AdminPanel tidak diexpose di UI | Governance tidak transparan | Public governance dashboard |

---

## 2. Analisis Kondisi Saat Ini

### 2.1 Multisig yang Ada (`veiled_markets_v22.aleo`)

**Structs:**

```leo
struct SignerConfig {
    signer_1: address,
    signer_2: address,
    signer_3: address,
    threshold: u8,         // 2 atau 3
}

struct MultiSigProposal {
    proposal_id: field,
    action: u8,            // Hanya ACTION_WITHDRAW (1)
    amount: u128,
    recipient: address,
    token_type: u8,
    proposed_at: u64,
}
```

**Transitions (5 dari 30 total):**

| # | Transition | Fungsi |
|---|---|---|
| 1 | `init_multisig` | Inisialisasi 3 signer + threshold (sekali pakai, deployer only) |
| 2 | `propose_treasury_withdrawal` | Buat proposal penarikan treasury |
| 3 | `approve_proposal` | Approve proposal (1 signer = 1 vote) |
| 4 | `execute_proposal` | Eksekusi proposal ALEO setelah threshold terpenuhi |
| 5 | `exec_proposal_usdcx` | Eksekusi proposal USDCX setelah threshold terpenuhi |

**Security (v18 fixes):**
- ProposalSeed includes `recipient + token_type` (anti-replay/redirect)
- Nonce parameter untuk unique proposal
- Double-vote prevention via ApprovalKey
- Deployer-only init, unique signer validation

### 2.2 Limitasi Kritis

```
┌─────────────────────────────────────────────────────────────────┐
│  CONSTRAINT: snarkVM 31-transition limit                        │
│                                                                 │
│  veiled_markets_v22.aleo: 30/31 transitions USED                │
│  Sisa slot: 1 (tidak cukup untuk governance)                    │
│                                                                 │
│  SOLUSI: Deploy governance sebagai PROGRAM TERPISAH              │
└─────────────────────────────────────────────────────────────────┘
```

### 2.3 Fee Revenue yang Bisa Mendanai Governance

| Fee | Rate | Destination | Per $1000 volume |
|---|---|---|---|
| Protocol Fee | 0.5% (50 BPS) | `protocol_treasury` mapping | $5.00 |
| Creator Fee | 0.5% (50 BPS) | `market_fees.creator_fees` | $5.00 |
| LP Fee | 1.0% (100 BPS) | Pool reserves (accrued) | $10.00 |

**Total protocol revenue** yang bisa dialokasikan ke governance reward: **0.5% dari seluruh volume.**

---

## 3. Arsitektur Governance

### 3.1 Dual-Program Architecture

```
┌──────────────────────────────────┐     ┌──────────────────────────────────┐
│    veiled_markets_v22.aleo       │     │   veiled_governance_v1.aleo      │
│    (30/31 transitions - FULL)    │     │   (NEW - ~18 transitions)        │
│                                  │     │                                  │
│  EXISTING:                       │     │  NEW:                            │
│  - Market CRUD & lifecycle       │     │  - VEIL token mint/burn/transfer │
│  - FPMM AMM (buy/sell/LP)       │     │  - Proposal creation & voting    │
│  - Share & LP token records      │     │  - Token-weighted vote tallying  │
│  - Basic multisig treasury       │     │  - Timelock enforcement          │
│  - Fee collection (0.5%+0.5%)   │     │  - Reward distribution (LP/trade)│
│  - Dispute bond mechanism        │     │  - Vote delegation               │
│                                  │     │  - Guardian veto (emergency)     │
│  MAPPINGS:                       │     │  - Parameter governance          │
│  - protocol_treasury[0u8/1u8]   │◄────│  - Cross-program execution       │
│  - multisig_config              │     │                                  │
│  - multisig_proposals           │     │  MAPPINGS:                       │
│  - multisig_approvals           │     │  - veil_balances                 │
│                                  │     │  - governance_proposals          │
│                                  │     │  - proposal_votes                │
│                                  │     │  - delegation_map                │
│                                  │     │  - reward_pools                  │
└──────────────────────────────────┘     └──────────────────────────────────┘
         │                                           │
         └───────────── Shared State ────────────────┘
                  (cross-program calls via
                   Aleo program imports)
```

### 3.2 Prinsip Desain

1. **Privacy-preserving** — VEIL token sebagai private record (konsisten dengan arsitektur Veiled Markets)
2. **Progressive decentralization** — Dimulai dari guardian multisig, bertahap ke full token governance
3. **Minimal contract dependency** — Governance program independen, berkomunikasi via cross-program calls
4. **Backward compatible** — Multisig lama tetap berfungsi sebagai fallback / guardian

---

## 4. VEIL Token — Spesifikasi

### 4.1 Token Properties

| Property | Value |
|---|---|
| **Nama** | VEIL Governance Token |
| **Symbol** | VEIL |
| **Total Supply** | 100,000,000 VEIL (fixed cap, no inflation) |
| **Precision** | 6 decimals (1 VEIL = 1,000,000 microVEIL) |
| **Type** | Private record (Aleo native privacy) |
| **Transferable** | Ya |
| **Burnable** | Ya (voluntary exit governance) |

### 4.2 Token Record (Leo)

```leo
record VeilToken {
    owner: address,
    amount: u128,          // microVEIL (6 decimals)
}
```

### 4.3 Token Operations

| Operation | Deskripsi | Privacy |
|---|---|---|
| `mint_veil` | Mint token baru (restricted to governance program) | Receiver private |
| `transfer_veil_private` | Transfer antar wallet (private-to-private) | Fully private |
| `burn_veil` | Burn token (exit governance) | Burner private |
| `lock_veil` | Lock token untuk voting (mencegah transfer selama vote) | Private |
| `unlock_veil` | Unlock setelah vote period berakhir | Private |

---

## 5. Smart Contract: `veiled_governance_v1.aleo`

### 5.1 Constants

```leo
// Governance parameters
const MIN_PROPOSAL_STAKE: u128 = 1000_000000u128;     // 1,000 VEIL to create proposal
const VOTING_PERIOD_BLOCKS: u64 = 40320u64;           // ~7 days (15s blocks)
const TIMELOCK_BLOCKS: u64 = 11520u64;                // ~48 hours
const EMERGENCY_TIMELOCK: u64 = 0u64;                 // Immediate for emergencies

// Proposal types
const PROPOSAL_RESOLVE_DISPUTE: u8 = 1u8;
const PROPOSAL_FEE_CHANGE: u8 = 2u8;
const PROPOSAL_TREASURY: u8 = 3u8;
const PROPOSAL_PARAMETER: u8 = 4u8;
const PROPOSAL_EMERGENCY_PAUSE: u8 = 5u8;
const PROPOSAL_RESOLVER_ELECTION: u8 = 6u8;

// Quorum thresholds (basis points of total supply)
const QUORUM_RESOLVE: u128 = 1000u128;     // 10% for dispute resolution
const QUORUM_FEE: u128 = 2000u128;         // 20% for fee changes
const QUORUM_TREASURY: u128 = 3000u128;    // 30% for treasury withdrawals
const QUORUM_PARAMETER: u128 = 1500u128;   // 15% for parameter updates
const QUORUM_EMERGENCY: u128 = 500u128;    // 5% for emergency pause
const QUORUM_RESOLVER: u128 = 2000u128;    // 20% for resolver election

// Token economics
const TOTAL_SUPPLY: u128 = 100_000_000_000000u128;    // 100M VEIL
const EPOCH_BLOCKS: u64 = 5760u64;                     // ~1 day
const LP_REWARD_RATE: u128 = 27397u128;                 // ~10M VEIL/year for LPs
const TRADER_REWARD_RATE: u128 = 6849u128;              // ~2.5M VEIL/year for traders
```

### 5.2 Structs

```leo
// ---- Token ----
record VeilToken {
    owner: address,
    amount: u128,
}

record VoteLock {
    owner: address,
    proposal_id: field,
    amount: u128,
    unlock_at: u64,          // block height when unlockable
}

// ---- Governance ----
struct GovernanceProposal {
    proposal_id: field,
    proposer: address,
    proposal_type: u8,       // 1-6 (see constants)
    target: field,           // market_id, parameter_key, or zero
    payload_1: u128,         // primary data (outcome, new_fee, amount, etc.)
    payload_2: field,        // secondary data (recipient address hash, etc.)
    votes_for: u128,         // total VEIL weight FOR
    votes_against: u128,     // total VEIL weight AGAINST
    quorum_required: u128,   // minimum total votes (abs value)
    created_at: u64,         // block height
    voting_deadline: u64,    // block height
    timelock_until: u64,     // block height (0 = not yet passed)
    status: u8,              // 0=active, 1=passed, 2=rejected, 3=executed, 4=vetoed, 5=expired
}

struct ProposalSeedGov {
    proposer: address,
    proposal_type: u8,
    target: field,
    payload_1: u128,
    nonce: u64,
}

struct VoteKey {
    proposal_id: field,
    voter: address,
}

struct DelegationRecord {
    delegator: address,
    delegate: address,
    amount: u128,
}

// ---- Rewards ----
struct RewardEpoch {
    epoch_id: u64,
    total_lp_reward: u128,
    total_trader_reward: u128,
    distributed: bool,
}

struct UserReward {
    user: address,
    epoch_id: u64,
    lp_reward: u128,
    trader_reward: u128,
    claimed: bool,
}
```

### 5.3 Mappings

```leo
// Token state
mapping veil_total_supply: u8 => u128;             // key 0u8 = current circulating supply
mapping veil_public_balances: address => u128;      // for public balance tracking (optional)

// Governance state
mapping governance_proposals: field => GovernanceProposal;
mapping proposal_votes: field => bool;              // VoteKey hash => voted?
mapping vote_weights: field => u128;                // VoteKey hash => weight used

// Delegation
mapping delegations: field => DelegationRecord;     // delegation hash => record
mapping delegated_power: address => u128;           // delegate => total delegated power

// Rewards
mapping reward_epochs: u64 => RewardEpoch;
mapping user_rewards: field => UserReward;           // hash(user, epoch) => reward
mapping reward_claimed: field => bool;               // hash(user, epoch) => claimed?

// Guardian (transitional)
mapping guardian_config: u8 => SignerConfig;          // Same struct as multisig, key 0u8
```

### 5.4 Transitions (18 total)

#### Token Management (5 transitions)

```
 #  Transition                  Inputs                              Output          Visibility
─── ─────────────────────────── ─────────────────────────────────── ─────────────── ──────────
 1  mint_veil                   recipient: address,                 VeilToken       restricted
                                amount: u128                                        (governance only)

 2  transfer_veil_private       token: VeilToken,                   (VeilToken,     private
                                to: address,                         VeilToken)
                                amount: u128

 3  burn_veil                   token: VeilToken                    —               private

 4  lock_for_vote               token: VeilToken,                   (VoteLock,      private
                                proposal_id: field                   VeilToken)      (change returned)

 5  unlock_after_vote           lock: VoteLock                      VeilToken       private
                                                                                    (after deadline)
```

#### Governance Lifecycle (7 transitions)

```
 #  Transition                  Inputs                              Output          Visibility
─── ─────────────────────────── ─────────────────────────────────── ─────────────── ──────────
 6  create_proposal             stake: VeilToken,                   (VoteLock,      public proposal,
                                proposal_type: u8,                   VeilToken,      private stake
                                target: field,                       field)          returns proposal_id
                                payload_1: u128,
                                payload_2: field,
                                nonce: u64

 7  vote_for                    token: VeilToken,                   (VoteLock,      private vote,
                                proposal_id: field,                  VeilToken)      public tally update
                                amount: u128

 8  vote_against                token: VeilToken,                   (VoteLock,      private vote,
                                proposal_id: field,                  VeilToken)      public tally update
                                amount: u128

 9  finalize_vote               proposal_id: field                  —               public
                                                                                    (anyone can call
                                                                                     after deadline)

10  execute_governance          proposal_id: field                  —               public
                                                                                    (after timelock,
                                                                                     cross-program call)

11  veto_proposal               proposal_id: field                  —               restricted
                                                                                    (guardian only,
                                                                                     during timelock)

12  delegate_votes              token: VeilToken,                   VeilToken       private
                                delegate: address,                   (change)
                                amount: u128
```

#### Reward Distribution (4 transitions)

```
 #  Transition                  Inputs                              Output          Visibility
─── ─────────────────────────── ─────────────────────────────────── ─────────────── ──────────
13  start_reward_epoch          epoch_id: u64                       —               restricted
                                                                                    (governance/auto)

14  record_lp_contribution      user: address,                      —               public
                                market_id: field,                                    (indexer calls)
                                lp_shares: u128

15  claim_lp_reward             epoch_id: u64                       VeilToken       private

16  claim_trader_reward         epoch_id: u64                       VeilToken       private
```

#### Administration (2 transitions)

```
 #  Transition                  Inputs                              Output          Visibility
─── ─────────────────────────── ─────────────────────────────────── ─────────────── ──────────
17  init_governance             guardian_1: address,                —               restricted
                                guardian_2: address,                                 (deployer only)
                                guardian_3: address,
                                guardian_threshold: u8

18  update_governance_params    param_key: u8,                      —               restricted
                                param_value: u128                                    (via governance
                                                                                      vote only)
```

---

## 6. Governance Voting Flow

### 6.1 Lifecycle Diagram

```
                    ┌─────────────┐
                    │   CREATED   │
                    │  (active)   │
                    └──────┬──────┘
                           │
              ┌────────────┴────────────┐
              │     VOTING PERIOD       │
              │     (7 days / 40320     │
              │      blocks)            │
              │                         │
              │  vote_for(VEIL weight)  │
              │  vote_against(VEIL wt)  │
              └────────────┬────────────┘
                           │
                    finalize_vote()
                           │
              ┌────────────┴────────────┐
              │                         │
       ┌──────┴──────┐          ┌──────┴──────┐
       │   PASSED    │          │  REJECTED   │
       │ (quorum met │          │ (quorum not │
       │  & majority │          │  met or     │
       │  FOR)       │          │  majority   │
       └──────┬──────┘          │  AGAINST)   │
              │                 └─────────────┘
              │
    ┌─────────┴─────────┐
    │   TIMELOCK PERIOD  │
    │   (48h / 11520     │
    │    blocks)         │
    │                    │
    │  Guardian can      │
    │  veto_proposal()   │
    └─────────┬──────────┘
              │
       ┌──────┴──────┐          ┌─────────────┐
       │  EXECUTABLE │          │   VETOED    │
       │             │──────────│ (guardian   │
       └──────┬──────┘          │  override)  │
              │                 └─────────────┘
       execute_governance()
              │
       ┌──────┴──────┐
       │  EXECUTED   │
       │ (on-chain   │
       │  effect)    │
       └─────────────┘
```

### 6.2 Quorum & Threshold per Proposal Type

| Proposal Type | Quorum | Timelock | Deskripsi |
|---|---|---|---|
| `RESOLVE_DISPUTE` (1) | 10% supply | 48 jam | Override resolusi market yang di-dispute |
| `FEE_CHANGE` (2) | 20% supply | 72 jam | Ubah protocol/creator/LP fee BPS |
| `TREASURY` (3) | 30% supply | 72 jam | Withdraw dari protocol treasury |
| `PARAMETER` (4) | 15% supply | 48 jam | Ubah MIN_TRADE, MIN_LIQUIDITY, dll |
| `EMERGENCY_PAUSE` (5) | 5% supply | 0 (immediate) | Pause market dalam keadaan darurat |
| `RESOLVER_ELECTION` (6) | 20% supply | 48 jam | Pilih/ganti resolver committee |

### 6.3 Vote Delegation

VEIL holder yang tidak ingin aktif voting bisa mendelegasikan voting power:

```
User A (10,000 VEIL) ──delegate_votes──▶ User B
User C (5,000 VEIL)  ──delegate_votes──▶ User B

User B voting power = own VEIL + 10,000 + 5,000 = effective weight
```

**Aturan delegation:**
- Delegasi bisa ditarik kapan saja (unlock + re-delegate)
- Delegate tidak bisa men-delegate ulang (no transitive delegation)
- Delegasi berlaku untuk semua proposal aktif
- Token yang di-delegate tetap milik delegator (tidak di-transfer)

---

## 7. Market Resolution via Governance

> **Ini adalah salah satu use case paling kritis dari governance token** — mengatasi kelemahan
> fundamental pada sistem resolusi market yang bergantung pada single resolver address.

### 7.1 Masalah Resolve Market Saat Ini

Pada contract `veiled_markets_v22.aleo`, resolusi market berjalan sebagai berikut:

```
    Market CLOSED / past deadline
           │
    resolve_market(market_id, winning_outcome)
           │
    assert(market.resolver == self.caller)    ◄── SINGLE RESOLVER (1 address)
           │
    STATUS_PENDING_RESOLUTION
           │
    Challenge Window (~12 jam / 2880 blocks)
           │
    ┌──────┴──────────────────────────────────┐
    │                                         │
    │  Tidak ada dispute                      │  dispute_resolution()
    │         │                               │  (bond: 1 ALEO / 1,000,000 microcredits)
    │  finalize_resolution()                  │  Propose outcome berbeda
    │         │                               │         │
    │  MARKET_STATUS_RESOLVED                 │  Market kembali ke CLOSED
    │  (winning_outcome final)                │  dispute data disimpan
    │                                         │         │
    │                                         │  RESOLVER YANG SAMA
    │                                         │  harus resolve_market() ULANG
    │                                         │  (bisa pilih outcome yang sama!)
    │                                         │         │
    └──────┬──────────────────────────────────┘         │
           │                                            │
           ▼                                            ▼
    User redeem shares                       Loop tanpa akhir jika
    berdasarkan outcome                      resolver tetap memilih
                                             jawaban yang sama
```

**5 Kelemahan Kritis:**

| # | Kelemahan | Lokasi di Contract | Dampak |
|---|---|---|---|
| 1 | **Single resolver** | `main.leo:1595` — `assert(market.resolver == resolver)` | 1 address menentukan nasib semua pemegang share |
| 2 | **Resolver = hakim tunggal** setelah dispute | Setelah dispute, `resolve_market()` kembali hanya bisa dipanggil oleh `market.resolver` | Jika resolver korup, dispute tidak berguna |
| 3 | **Tidak ada escalation path** | Tidak ada mekanisme override di luar resolver | Community tidak punya cara untuk override resolusi yang salah |
| 4 | **Dispute bond berisiko** | `main.leo:1755` — bond 1 ALEO, bisa hilang jika resolver tetap memilih jawaban yang sama | Menghambat disputer yang benar |
| 5 | **Tidak ada community input** | Tidak ada voting atau komite | User dengan posisi besar tidak punya suara dalam resolusi |

### 7.2 Syarat Menjadi Resolver — Resolver Registry

#### A. Masalah: Tidak Ada Syarat (Saat Ini)

Pada contract v22, resolver hanyalah parameter `address` saat `create_market()`:

```leo
// main.leo:251 — Tidak ada validasi apapun terhadap resolver address
async transition create_market(
    ...
    public resolver: address,       // ← Bisa SIAPAPUN, termasuk creator sendiri
    ...
)
```

Dan di frontend, resolver default = creator:
```typescript
// CreateMarketModal.tsx:285
const input5 = wallet.address!; // resolver = creator by default
```

**Artinya: creator membuat market → creator sendiri yang resolve → conflict of interest.**

#### B. Sistem Baru: Resolver Registry + Staking

Dengan governance, resolver harus **terdaftar dan staking VEIL** sebelum bisa ditunjuk:

```
┌─────────────────────────────────────────────────────────────────────┐
│                     RESOLVER REGISTRY                               │
│                                                                     │
│  Untuk menjadi resolver, address harus memenuhi:                    │
│                                                                     │
│  1. STAKE MINIMUM: 5,000 VEIL (di-lock selama aktif)               │
│  2. REGISTRASI: Panggil register_resolver() di governance program   │
│  3. TIDAK BLACKLISTED: Tidak punya 3+ strikes                      │
│  4. AKTIF: Pernah resolve dalam 30 hari terakhir (atau baru daftar)│
│                                                                     │
│  Setelah terdaftar, resolver masuk ke "Resolver Pool" dan bisa     │
│  ditunjuk oleh market creator saat create_market().                 │
│                                                                     │
│  Creator TIDAK BOLEH menunjuk diri sendiri sebagai resolver         │
│  (anti conflict of interest)                                        │
└─────────────────────────────────────────────────────────────────────┘
```

#### C. Tier Resolver

| Tier | Syarat VEIL Stake | Syarat Track Record | Market Value Limit | Reward per Resolve |
|---|---|---|---|---|
| **Bronze** | 5,000 VEIL | Baru daftar, 0 resolve | Market < 1,000 ALEO | 50 VEIL |
| **Silver** | 15,000 VEIL | 10+ resolve, 0 strikes | Market < 10,000 ALEO | 150 VEIL |
| **Gold** | 50,000 VEIL | 50+ resolve, reputation > 90 | Unlimited | 500 VEIL |
| **Committee** | 10,000 VEIL + elected | Dipilih via governance vote | Tier 2 escalation | 500 VEIL per dispute |

#### D. Registration Flow

```
┌──────────────┐     ┌────────────────────────┐     ┌──────────────┐
│  Calon       │     │ veiled_governance_v1   │     │  Resolver    │
│  Resolver    │     │ .aleo                   │     │  Registry    │
│              │     │                         │     │              │
│ 1. Lock      │────▶│ 2. register_resolver() │────▶│ 3. Stored:   │
│    5,000     │     │    - Verify stake       │     │    address,  │
│    VEIL      │     │    - Check not blacklist│     │    stake,    │
│              │     │    - Assign BRONZE tier  │     │    tier,     │
│              │     │    - Store in mapping    │     │    reg_date  │
│              │     │                         │     │              │
└──────────────┘     └────────────────────────┘     └──────────────┘
```

#### E. Contract Structs & Mappings (di governance program)

```leo
struct ResolverProfile {
    resolver: address,
    stake_amount: u128,          // VEIL staked
    tier: u8,                    // 1=Bronze, 2=Silver, 3=Gold, 4=Committee
    markets_resolved: u64,       // total markets resolved correctly
    disputes_received: u64,      // total disputes filed against this resolver
    disputes_lost: u64,          // disputes where resolver was WRONG
    strikes: u8,                 // 3 strikes = blacklisted
    reputation_score: u128,      // 0-10000 basis points (100.00% = 10000)
    registered_at: u64,          // block height
    last_active_at: u64,         // block height of last resolve
    is_active: bool,
}

// Mappings
mapping resolver_registry: address => ResolverProfile;
mapping resolver_stakes: address => u128;              // VEIL locked
mapping blacklisted_resolvers: address => bool;         // 3+ strikes
```

#### F. Transitions Baru di Governance Program

```leo
// ---- Resolver Registry (4 transitions) ----

transition register_resolver(
    stake: VeilToken,                // minimum 5,000 VEIL
) -> (VeilToken, Future) {
    assert(stake.amount >= 5000_000000u128);  // 5,000 VEIL
    // Lock stake, register in resolver_registry mapping
    // Set tier = BRONZE, reputation = 10000 (100%)
    ...
}

transition upgrade_resolver_tier(
    additional_stake: VeilToken,     // stake more to upgrade tier
) -> (VeilToken, Future) {
    // Verify current stats qualify for next tier
    // Lock additional stake
    ...
}

transition deregister_resolver() -> (VeilToken, Future) {
    // Unlock stake (after 7-day cooldown)
    // Remove from resolver_registry
    // Cannot deregister while assigned to active markets
    ...
}

transition slash_resolver(
    public resolver_addr: address,
    public market_id: field,
) -> Future {
    // Called by governance after dispute proves resolver wrong
    // Deduct stake, increment strikes
    // If strikes >= 3 → blacklist
    ...
}
```

#### G. Validasi di Market Creation (Contract Change)

Di v23, `create_market` harus memvalidasi resolver terdaftar:

```leo
// Di veiled_markets_v23.aleo (atau via cross-program call):
// Option A: Market contract reads governance resolver_registry
// Option B: Frontend validates before submit, governance program
//           issues "resolver_certificate" record that market consumes

// Preferred: Option B (no extra transition needed in market contract)
record ResolverCertificate {
    owner: address,           // resolver address
    tier: u8,
    valid_until: u64,         // block height expiry
    certificate_nonce: field,
}

// Frontend flow:
// 1. Creator selects resolver from Resolver Registry UI
// 2. Resolver's ResolverCertificate verified client-side
// 3. create_market() called with resolver address
// 4. (Off-chain indexer verifies resolver is registered)
```

#### H. Anti Conflict-of-Interest Rules

```
┌─────────────────────────────────────────────────────────────────────┐
│                    CONFLICT OF INTEREST PREVENTION                   │
│                                                                     │
│  RULE 1: Creator ≠ Resolver                                        │
│  Market creator TIDAK BOLEH menjadi resolver market sendiri         │
│  → Frontend enforce + backend indexer flag                          │
│                                                                     │
│  RULE 2: LP Provider ≠ Resolver (untuk market yang sama)            │
│  Resolver TIDAK BOLEH punya LP position di market yang di-resolve   │
│  → Sulit di-enforce on-chain (privacy), enforced via slashing       │
│    jika terbukti setelah resolusi                                   │
│                                                                     │
│  RULE 3: Large Position Holder ≠ Resolver                          │
│  Resolver TIDAK BOLEH punya > 10% total shares di market tsb       │
│  → Same as Rule 2: enforcement via post-resolution audit            │
│                                                                     │
│  RULE 4: Resolver tidak boleh resolve market yang sama 2x           │
│  setelah dispute (harus escalate ke committee)                      │
│  → Enforced on-chain via governance_resolve()                       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

### 7.3 Mekanisme Quorum Resolution — Bagaimana Jawaban Dianggap Final

#### A. Definisi Quorum per Tier

Quorum = **syarat minimum** agar sebuah resolusi dianggap sah dan final.
Setiap tier punya mekanisme quorum yang berbeda:

```
┌──────────────────────────────────────────────────────────────────────┐
│                    QUORUM PER RESOLUTION TIER                        │
│                                                                      │
│  TIER 1 — Single Resolver                                           │
│  ─────────────────────────                                          │
│  Quorum: 1/1 (resolver address)                                     │
│  Finalitas: Otomatis setelah challenge window (12 jam)               │
│             JIKA tidak ada dispute                                    │
│  Artinya: Resolver jawab → tunggu 12 jam → tidak ada dispute → FINAL│
│                                                                      │
│  TIER 2 — Resolver Committee (5 members)                             │
│  ────────────────────────────────────────                            │
│  Quorum: 3 dari 5 member HARUS vote (participation quorum)          │
│  Majority: Outcome dengan votes terbanyak dari yang hadir            │
│  Finalitas: 3+ member vote outcome yang SAMA                         │
│  Timeout: Jika < 3 member vote dalam 3 hari → escalate ke Tier 3   │
│                                                                      │
│  Detail:                                                             │
│  ┌──────────────────────────────────────────────────────────┐       │
│  │ 5 committee members vote:                                │       │
│  │                                                          │       │
│  │ Case A: 4 vote YES, 1 vote NO     → YES wins (clear)   │       │
│  │ Case B: 3 vote YES, 2 vote NO     → YES wins (minimum) │       │
│  │ Case C: 3 vote YES, 0 NO, 2 absen → YES wins (quorum=3)│       │
│  │ Case D: 2 vote YES, 2 vote NO, 1 absen → NO consensus  │       │
│  │         → ESCALATE to Tier 3                             │       │
│  │ Case E: 2 vote YES, 1 vote NO, 2 absen → quorum fail   │       │
│  │         → ESCALATE to Tier 3 (< 3 voters)               │       │
│  │ Case F: 0 vote dalam 3 hari → ESCALATE (committee MIA)  │       │
│  │                                                          │       │
│  │ Multi-outcome (3-4 outcomes):                            │       │
│  │ Case G: 2 vote A, 2 vote B, 1 vote C → NO majority     │       │
│  │         → ESCALATE to Tier 3                             │       │
│  │ Case H: 3 vote A, 1 vote B, 1 vote C → A wins (3/5)    │       │
│  └──────────────────────────────────────────────────────────┘       │
│                                                                      │
│  TIER 3 — Community Vote (all VEIL holders)                          │
│  ──────────────────────────────────────────                          │
│  Participation Quorum: 10% total VEIL supply harus berpartisipasi   │
│  Majority: Outcome dengan VEIL weight terbanyak                      │
│  Finalitas: Quorum terpenuhi + majority outcome > 50% of votes cast │
│  Timeout: Jika quorum tidak terpenuhi dalam 7 hari → market CANCEL  │
│                                                                      │
│  Detail:                                                             │
│  ┌──────────────────────────────────────────────────────────┐       │
│  │ Total VEIL supply: 100,000,000                           │       │
│  │ Quorum needed: 10,000,000 VEIL (10%)                     │       │
│  │                                                          │       │
│  │ Binary market (YES/NO):                                  │       │
│  │ Case A: 7M vote YES + 4M vote NO = 11M total            │       │
│  │         Quorum met (11M > 10M), YES wins (63.6%)        │       │
│  │         → RESOLVED: YES                                  │       │
│  │                                                          │       │
│  │ Case B: 5M vote YES + 3M vote NO = 8M total             │       │
│  │         Quorum NOT met (8M < 10M)                        │       │
│  │         → MARKET CANCELLED (semua user refund)           │       │
│  │                                                          │       │
│  │ Multi-outcome market (A/B/C/D):                          │       │
│  │ Case C: 4M vote A, 3M vote B, 2M vote C, 1.5M vote D   │       │
│  │         Total = 10.5M → Quorum met                       │       │
│  │         A = 38.1%, B = 28.6%, C = 19.0%, D = 14.3%      │       │
│  │         A wins (plurality, highest vote share)           │       │
│  │         → RESOLVED: A                                    │       │
│  │                                                          │       │
│  │ Case D: 3M vote A, 3M vote B, 2M vote C, 2M vote D     │       │
│  │         Total = 10M → Quorum met                         │       │
│  │         A dan B TIE (30% vs 30%)                         │       │
│  │         → RUNOFF VOTE: A vs B only (3 hari tambahan)     │       │
│  │                                                          │       │
│  │ Case E: 3M vote A, 3M vote B (tie) + runoff:            │       │
│  │         Runoff: 6M vote A, 5M vote B → A wins           │       │
│  │         → RESOLVED: A                                    │       │
│  │                                                          │       │
│  │ Case F: Runoff masih tie → MARKET CANCELLED              │       │
│  └──────────────────────────────────────────────────────────┘       │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

#### B. Quorum Formula

```
// ─── TIER 2: Committee ───
committee_quorum_met     = (total_votes_cast >= 3)
committee_has_majority   = (max_outcome_votes >= 3)
committee_resolved       = committee_quorum_met && committee_has_majority

// ─── TIER 3: Community ───
participation_quorum     = total_veil_voted >= (TOTAL_SUPPLY * QUORUM_BPS / 10000)
                        // = 100,000,000 * 1000 / 10000 = 10,000,000 VEIL

// Binary market:
majority_met             = (winning_veil > total_veil_voted / 2)

// Multi-outcome market:
plurality_winner         = outcome with max(veil_voted)
has_tie                  = (count of outcomes with max votes) > 1
needs_runoff             = has_tie

// Final resolution check:
community_resolved       = participation_quorum && majority_met && !needs_runoff
```

#### C. Quorum Tabel Ringkas

| Tier | Siapa yang Vote | Participation Quorum | Decision Rule | Jika Gagal |
|---|---|---|---|---|
| **Tier 1** | 1 resolver | 1/1 (pasti terpenuhi) | Resolver pilih outcome | Dispute → Tier 2 |
| **Tier 2** | 5 committee | 3/5 harus vote | Majority dari yang vote (min 3 sama) | No majority / < 3 vote → Tier 3 |
| **Tier 3** | Semua VEIL holder | 10% total supply | Plurality (binary: >50%, multi: highest) | Quorum gagal / tie → Market CANCEL |

#### D. Mengapa 10% Quorum untuk Community Vote?

```
┌──────────────────────────────────────────────────────────────────┐
│  ANALISIS QUORUM 10%                                             │
│                                                                  │
│  Terlalu rendah (< 5%):                                         │
│  - Whale dengan 5M VEIL bisa memutuskan sendiri                 │
│  - Mudah dimanipulasi oleh pihak berkepentingan                 │
│  - Resolusi bukan representasi komunitas                        │
│                                                                  │
│  Terlalu tinggi (> 30%):                                        │
│  - Sulit mencapai quorum (voter apathy)                         │
│  - Banyak market akan ter-cancel karena quorum gagal            │
│  - Market yang ter-cancel = LP dan trader kehilangan peluang    │
│                                                                  │
│  Sweet spot (10%):                                               │
│  - Cukup tinggi untuk mencegah manipulasi individual            │
│  - Cukup rendah untuk achievable dengan voter apathy normal     │
│  - Comparable dengan governance protocols lain:                  │
│    - Compound: 4% quorum                                        │
│    - Uniswap: 4% quorum                                         │
│    - Aave: 6.5% quorum                                          │
│    - MakerDAO: ~10% typical participation                       │
│                                                                  │
│  NOTE: Quorum BPS (1000 = 10%) bisa diubah via governance       │
│  vote (proposal type: PARAMETER). Komunitas bisa menurunkan     │
│  ke 5% atau menaikkan ke 20% berdasarkan pengalaman.            │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

#### E. Weighted vs Unweighted — Kenapa Berbeda per Tier

| Tier | Voting Model | Alasan |
|---|---|---|
| **Tier 1** | Unweighted (1 resolver = 1 vote) | Resolver dipilih berdasarkan reputasi, bukan kekayaan |
| **Tier 2** | Unweighted (1 member = 1 vote) | Committee elected untuk expertise, bukan wealth. Mencegah 1 whale membeli kursi committee lalu mendominasi |
| **Tier 3** | **Token-weighted** (1 VEIL = 1 vote) | Community vote = stake in the protocol. Yang punya lebih banyak VEIL punya lebih banyak "skin in the game" |

#### F. Resolver Reward & Punishment Matrix

```
┌────────────────────────────┬───────────────────────┬─────────────────────┐
│  Skenario                  │  Resolver Impact       │  Disputer Impact    │
├────────────────────────────┼───────────────────────┼─────────────────────┤
│ Resolve benar,             │ +1 markets_resolved   │ N/A                 │
│ tidak ada dispute          │ + reward (50-500 VEIL)│                     │
│                            │ + reputation ↑        │                     │
├────────────────────────────┼───────────────────────┼─────────────────────┤
│ Resolve benar,             │ +1 markets_resolved   │ Bond (1 ALEO) hilang│
│ dispute ditolak            │ + reward              │ (50% treasury,      │
│ (Tier 2 confirms resolver) │ + reputation ↑        │  50% committee)     │
├────────────────────────────┼───────────────────────┼─────────────────────┤
│ Resolve SALAH,             │ +1 strikes            │ Bond dikembalikan   │
│ dispute diterima           │ - 1,000 VEIL slashed  │ + 500 VEIL reward   │
│ (Tier 2/3 overrides)       │ + reputation ↓↓       │ + vindicated        │
│                            │ (if 3 strikes →       │                     │
│                            │  BLACKLISTED)         │                     │
├────────────────────────────┼───────────────────────┼─────────────────────┤
│ Resolver tidak resolve     │ + reputation ↓        │ Market eligible     │
│ sebelum resolution_deadline│ (inactive penalty)    │ for emergency_cancel│
│                            │ No reward             │ All users refund    │
├────────────────────────────┼───────────────────────┼─────────────────────┤
│ 3 strikes accumulated      │ BLACKLISTED           │ N/A                 │
│                            │ - Cannot resolve      │                     │
│                            │ - Stake returned      │                     │
│                            │   (minus slashed)     │                     │
│                            │ - Must re-register    │                     │
│                            │   after 90 days       │                     │
└────────────────────────────┴───────────────────────┴─────────────────────┘
```

#### G. Reputation Score Calculation

```
// Initial score: 10000 (100.00%)
// Updated after each resolution event

reputation = base_score
           + (correct_resolves × 50)        // +0.50% per correct resolve
           - (disputes_received × 100)      // -1.00% per dispute received
           - (disputes_lost × 500)          // -5.00% per dispute LOST
           - (inactivity_days × 10)         // -0.10% per day inactive
           + (committee_service × 200)      // +2.00% per committee term served

// Clamped to [0, 10000]
// Tier thresholds:
//   Bronze: reputation >= 0     (default)
//   Silver: reputation >= 7000  (70%) + 10 resolves + 15K VEIL
//   Gold:   reputation >= 9000  (90%) + 50 resolves + 50K VEIL
```

---

### 7.4 Sistem Resolve Market Baru — 3-Tier Escalation

Dengan governance, resolve market menggunakan **3-tier escalation system**:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    3-TIER RESOLUTION ESCALATION                         │
│                                                                         │
│  TIER 1: Resolver (seperti sekarang)                                   │
│  ─────────────────────────────────                                     │
│  • Single resolver address resolve market                               │
│  • Challenge window 12 jam                                              │
│  • Jika tidak ada dispute → finalize                                    │
│  • Jika ada dispute → ESCALATE ke Tier 2                               │
│                                                                         │
│  TIER 2: Resolver Committee (BARU — governance elected)                │
│  ──────────────────────────────────────────────────────                 │
│  • 5 resolver yang dipilih via VEIL governance vote                     │
│  • 3-of-5 majority vote menentukan outcome                             │
│  • Voting period: 3 hari                                                │
│  • Jika committee split (2-2-1) → ESCALATE ke Tier 3                  │
│  • Jika committee tidak vote (quorum gagal) → ESCALATE ke Tier 3       │
│                                                                         │
│  TIER 3: Community Vote (BARU — full VEIL governance)                  │
│  ────────────────────────────────────────────────────                   │
│  • SEMUA VEIL holder bisa vote outcome                                  │
│  • Token-weighted voting                                                │
│  • Quorum: 10% VEIL supply                                             │
│  • Voting period: 7 hari                                                │
│  • Timelock: 48 jam (guardian veto window)                              │
│  • Majority outcome = final resolution                                  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 7.5 Flow Diagram Detail

```
                    Market deadline tercapai
                           │
                    ┌──────┴──────┐
                    │   TIER 1    │
                    │  Resolver   │
                    │  resolves   │
                    └──────┬──────┘
                           │
              Challenge Window (12 jam)
                           │
           ┌───────────────┴───────────────┐
           │                               │
    Tidak ada dispute               dispute_resolution()
           │                         (bond: 1 ALEO)
    finalize_resolution()                  │
           │                    ┌──────────┴──────────┐
    RESOLVED (final)            │      TIER 2         │
                                │  Resolver Committee  │
                                │  (5 elected members) │
                                │                      │
                                │  resolve_committee()  │
                                │  Each member votes    │
                                │  outcome (3 hari)     │
                                └──────────┬───────────┘
                                           │
                         ┌─────────────────┴─────────────────┐
                         │                                   │
                  3+ votes agree                    No consensus
                  (clear majority)                  (split / no quorum)
                         │                                   │
                  finalize_committee()              ┌────────┴────────┐
                         │                         │     TIER 3      │
                  Challenge Window                 │  Community Vote  │
                  (24 jam, bond 5 ALEO)            │  (all VEIL      │
                         │                         │   holders)       │
                  ┌──────┴──────┐                  │                  │
                  │             │                   │ create_proposal  │
             No dispute   Dispute                  │ (RESOLVE_DISPUTE)│
                  │        → Tier 3                │ vote_for/against │
             RESOLVED                              │ (7 hari)         │
             (final)                               └────────┬─────────┘
                                                            │
                                                   finalize_vote()
                                                            │
                                                   ┌───────┴───────┐
                                                   │               │
                                              Quorum met      Quorum NOT met
                                              Majority wins   (edge case)
                                                   │               │
                                              Timelock 48h    Market CANCELLED
                                                   │          (semua user refund)
                                              execute_governance()
                                                   │
                                              RESOLVED (final,
                                              tidak bisa di-dispute lagi)
```

### 7.6 Resolver Committee — Detail Mekanisme

#### A. Pemilihan Committee

Resolver committee dipilih via `PROPOSAL_RESOLVER_ELECTION` (proposal type 6):

```
Proposal: "Pilih resolver committee periode Q2 2026"

Kandidat:
  1. alice.aleo     — 8,500,000 VEIL votes
  2. bob.aleo       — 7,200,000 VEIL votes
  3. charlie.aleo   — 6,800,000 VEIL votes
  4. diana.aleo     — 6,100,000 VEIL votes
  5. eve.aleo       — 5,900,000 VEIL votes
  ─────────────────────────────────────────
  6. frank.aleo     — 4,200,000 (tidak terpilih)
  7. grace.aleo     — 3,100,000 (tidak terpilih)

→ Top 5 terpilih sebagai resolver committee
→ Masa jabatan: 3 bulan (governance dapat memperpendek/memperpanjang)
```

#### B. Committee Voting pada Dispute

```leo
// Di veiled_governance_v1.aleo:
struct CommitteeVote {
    market_id: field,
    voter: address,          // committee member
    proposed_outcome: u8,    // outcome yang dipilih
    voted_at: u64,
}

// Mapping
mapping committee_members: u8 => address;           // slot 1-5
mapping committee_votes: field => CommitteeVote;     // hash(market_id, voter)
mapping committee_vote_count: field => u8;           // market_id => total votes cast
```

**Aturan voting committee:**
- Setiap member punya **1 vote** (bukan token-weighted — semua setara)
- Deadline: 3 hari (17,280 blocks) setelah dispute escalation
- Outcome dengan **3+ votes** = winner
- Jika tidak ada majority (misal 2-2-1 pada 3 outcome) → escalate ke Tier 3
- Member yang tidak vote dalam 3 hari = abstain (dihitung saat tally)

#### C. Committee Incentive & Accountability

| Aspek | Detail |
|---|---|
| **Reward** | 500 VEIL per resolved dispute (dari protocol treasury) |
| **Slash** | Jika community vote (Tier 3) override committee → member yang salah kehilangan 2,000 VEIL stake |
| **Minimum stake** | Committee member harus stake 10,000 VEIL selama masa jabatan |
| **Removal** | Governance vote dapat menghapus member kapan saja (20% quorum) |
| **Inactivity** | 3x tidak vote → otomatis dihapus dari committee, stake dikembalikan |

### 7.7 Dispute Bond Refund — Fair Resolution

Dengan governance, dispute bond jadi lebih adil:

```
SKENARIO: User dispute, dan ternyata BENAR

SEKARANG (v22):
  1. User bayar bond 1 ALEO
  2. Resolver resolve ulang → pilih jawaban yang sama (resolver bisa korup)
  3. Bond HILANG
  4. User tidak punya recourse ← MASALAH

DENGAN GOVERNANCE:
  1. User bayar bond 1 ALEO
  2. Dispute → escalate ke Tier 2 (committee)
  3. Committee vote → dispute BENAR
  4. Bond DIKEMBALIKAN + bonus 500 VEIL reward
  5. Resolver asli diberi strike (3 strikes = blacklist)

SKENARIO: User dispute, tapi SALAH

  1. User bayar bond 1 ALEO
  2. Committee vote → dispute SALAH (resolver was right)
  3. Bond disita → 50% ke protocol treasury, 50% ke committee reward
```

### 7.8 Contract Changes untuk Resolution Governance

#### Di `veiled_governance_v1.aleo` — Transitions baru:

```leo
// Committee resolution voting (3 transitions tambahan)

transition committee_vote_resolve(
    public market_id: field,
    public proposed_outcome: u8
) -> Future {
    // assert caller is committee member
    // assert dispute exists for this market
    // record vote
    return committee_vote_resolve_fin(market_id, proposed_outcome, self.caller);
}

transition finalize_committee_vote(
    public market_id: field
) -> Future {
    // Tally votes
    // If 3+ agree → set resolution
    // If no majority → flag for Tier 3 escalation
    return finalize_committee_vote_fin(market_id);
}

transition escalate_to_community(
    public market_id: field
) -> Future {
    // Create RESOLVE_DISPUTE proposal automatically
    // Set market_id as target, no payload yet (community votes outcome)
    return escalate_to_community_fin(market_id);
}
```

#### Di `veiled_markets_v23.aleo` — Slot terakhir (#31):

```leo
// Transition #31: governance_resolve
// Allows governance program to override market resolution
async transition governance_resolve(
    public market_id: field,
    public winning_outcome: u8,
    public governance_proof: field     // proposal_id atau committee_decision_id
) -> Future {
    // SECURITY: Only callable by veiled_governance_v1.aleo
    // This is the ONLY cross-program entry point for resolution override
    return governance_resolve_fin(market_id, winning_outcome, governance_proof);
}

async function governance_resolve_fin(
    market_id: field,
    winning_outcome: u8,
    governance_proof: field
) {
    let market: Market = markets.get(market_id);

    // Must be in CLOSED status (after dispute cleared the resolution)
    assert(market.status == MARKET_STATUS_CLOSED);

    // Validate outcome
    assert(winning_outcome >= 1u8 && winning_outcome <= market.num_outcomes);

    // Set resolution directly (no challenge window — already went through
    // committee vote or community governance vote with timelock)
    market_resolutions.set(market_id, MarketResolution {
        market_id: market_id,
        winning_outcome: winning_outcome,
        resolver: market.resolver,           // original resolver recorded
        resolved_at: block.height as u64,
        challenge_deadline: 0u64,            // no further challenge
        finalized: true,                     // immediately final
    });

    markets.set(market_id, Market {
        id: market.id,
        creator: market.creator,
        resolver: market.resolver,
        question_hash: market.question_hash,
        category: market.category,
        num_outcomes: market.num_outcomes,
        deadline: market.deadline,
        resolution_deadline: market.resolution_deadline,
        status: MARKET_STATUS_RESOLVED,
        created_at: market.created_at,
        token_type: market.token_type,
    });
}
```

### 7.9 Complete Resolution Timeline

```
Day 0     Market deadline reached
          │
Day 0     Resolver calls resolve_market()
          ├── winning_outcome set
          ├── STATUS_PENDING_RESOLUTION
          ├── challenge_deadline = now + 12 hours
          │
Day 0.5   Challenge window ends (12 hours)
          │
          ├── NO dispute → finalize_resolution() → RESOLVED ✓ (Day 0.5)
          │
          └── DISPUTE filed (bond: 1 ALEO)
              ├── market status → CLOSED
              ├── resolution cleared
              ├── ┌─────────────────────────────────────┐
              │   │ TIER 2: Committee Voting (3 days)    │
              │   │                                      │
              │   │ Day 0.5 — Committee notified         │
              │   │ Day 1-3 — Committee members vote     │
              │   │ Day 3.5 — finalize_committee_vote()  │
              │   │                                      │
              │   │ IF 3+ agree on outcome:              │
              │   │   → governance_resolve() called      │
              │   │   → Challenge window 24h (Tier 2)    │
              │   │   → Day 4.5: RESOLVED ✓              │
              │   │                                      │
              │   │ IF no consensus:                     │
              │   │   → escalate_to_community()          │
              │   └──────────────┬──────────────────────┘
              │                  │
              │   ┌──────────────┴──────────────────────┐
              │   │ TIER 3: Community Vote (7 days)      │
              │   │                                      │
              │   │ Day 3.5  — Proposal created          │
              │   │ Day 4-10 — VEIL holders vote outcome │
              │   │ Day 10.5 — finalize_vote()           │
              │   │                                      │
              │   │ IF quorum met & majority:            │
              │   │   → Timelock 48 hours                │
              │   │   → Day 12.5: execute_governance()   │
              │   │   → governance_resolve() called      │
              │   │   → RESOLVED ✓                       │
              │   │                                      │
              │   │ IF quorum NOT met:                   │
              │   │   → Market CANCELLED                 │
              │   │   → All users get refund             │
              │   └────────────────────────────────────┘
              │
              └── WORST CASE TIMELINE:
                  Day 0    → resolve
                  Day 0.5  → dispute
                  Day 3.5  → committee deadlock
                  Day 10.5 → community vote ends
                  Day 12.5 → timelock ends → RESOLVED

                  Maximum: ~12.5 days (dispute → community vote → timelock)
                  Typical: ~4.5 days  (dispute → committee resolves)
                  No dispute: ~0.5 day (12 hours challenge window)
```

### 7.10 Perbandingan: Resolution Sebelum vs Sesudah

| Aspek | Sekarang (v22) | Dengan Governance |
|---|---|---|
| **Resolver** | 1 address tetap per market | 3-tier: resolver → committee (5) → community (semua VEIL holder) |
| **Dispute mechanism** | Bond 1 ALEO, resolver resolve ulang | Bond 1 ALEO, escalate ke committee/community vote |
| **Dispute fairness** | Resolver bisa mengabaikan dispute | Committee/community override resolver |
| **Bond outcome** | Hilang jika resolver tetap memilih jawaban sama | Dikembalikan + reward jika dispute benar |
| **Accountability** | Tidak ada | Strike system, stake slashing, removal via vote |
| **Community voice** | Tidak ada | Token-weighted vote sebagai final arbiter |
| **Time to resolve** | ~12 jam (tanpa dispute) | ~12 jam (tanpa dispute), ~4.5 hari (committee), ~12.5 hari max (community) |
| **Edge case handling** | Loop tanpa akhir jika resolver korup | Market di-cancel jika community quorum gagal |
| **Incentive to resolve correctly** | Tidak ada | 500 VEIL reward per dispute resolution, slashing untuk kesalahan |
| **Transparency** | On-chain tapi opaque | Public voting record, dashboard tracking |

### 7.11 Frontend — Dispute Resolution UI

```
┌─────────────────────────────────────────────────────────────────────┐
│  Market: "Will BTC exceed $100K by June 2026?"                     │
│  Status: DISPUTED — Tier 2 Committee Review                        │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Resolution History                                          │   │
│  │                                                              │   │
│  │  Mar 15  Resolver (alice.aleo) resolved: NO                 │   │
│  │  Mar 15  Dispute by bob.aleo — proposed: YES (bond: 1 ALEO) │   │
│  │  Mar 15  Escalated to Resolver Committee                     │   │
│  │                                                              │   │
│  │  Committee Votes (3 of 5 needed):                           │   │
│  │  ┌────────────────────────────────────────────────────┐     │   │
│  │  │  charlie.aleo  → YES  ✓                            │     │   │
│  │  │  diana.aleo    → YES  ✓                            │     │   │
│  │  │  eve.aleo      → (pending)                         │     │   │
│  │  │  frank.aleo    → NO   ✗                            │     │   │
│  │  │  grace.aleo    → (pending)                         │     │   │
│  │  └────────────────────────────────────────────────────┘     │   │
│  │                                                              │   │
│  │  Current tally: YES: 2  |  NO: 1  |  Pending: 2            │   │
│  │  Deadline: Mar 18 14:00 UTC (2d 6h remaining)               │   │
│  │                                                              │   │
│  │  [View on Explorer]                                          │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Your Position                                               │   │
│  │  Holding: 500 YES shares (bought at avg 0.65)               │   │
│  │  Current value: Pending resolution                          │   │
│  │                                                              │   │
│  │  If resolved YES: +500 ALEO                                 │   │
│  │  If resolved NO:  0 ALEO                                    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 7.12 Database Tables untuk Resolution Tracking

```sql
-- Committee resolution votes
CREATE TABLE committee_votes (
    id                SERIAL PRIMARY KEY,
    market_id         TEXT NOT NULL,
    committee_member  TEXT NOT NULL,
    proposed_outcome  SMALLINT NOT NULL,
    voted_at          TIMESTAMPTZ DEFAULT now(),
    transaction_id    TEXT,
    UNIQUE(market_id, committee_member)
);

CREATE INDEX idx_committee_votes_market ON committee_votes(market_id);

-- Resolution escalation tracking
CREATE TABLE resolution_escalations (
    market_id         TEXT PRIMARY KEY,
    current_tier      SMALLINT NOT NULL DEFAULT 1,    -- 1, 2, or 3
    original_resolver TEXT NOT NULL,
    original_outcome  SMALLINT,
    disputer          TEXT,
    dispute_bond      NUMERIC,
    dispute_outcome   SMALLINT,                       -- outcome proposed by disputer
    committee_outcome SMALLINT,                       -- outcome decided by committee (NULL if escalated)
    community_proposal_id TEXT,                       -- governance proposal ID for Tier 3
    final_outcome     SMALLINT,
    escalated_at      TIMESTAMPTZ DEFAULT now(),
    resolved_at       TIMESTAMPTZ,
    status            TEXT DEFAULT 'pending'           -- pending/committee/community/resolved/cancelled
);

-- Resolver reputation tracking
CREATE TABLE resolver_reputation (
    resolver_address  TEXT PRIMARY KEY,
    markets_resolved  INTEGER DEFAULT 0,
    disputes_received INTEGER DEFAULT 0,
    disputes_upheld   INTEGER DEFAULT 0,              -- resolver was wrong
    disputes_rejected INTEGER DEFAULT 0,              -- resolver was right
    strikes           INTEGER DEFAULT 0,              -- 3 strikes = blacklist
    total_veil_reward NUMERIC DEFAULT 0,
    total_veil_slashed NUMERIC DEFAULT 0,
    reputation_score  NUMERIC DEFAULT 100.0,          -- starts at 100, goes up/down
    updated_at        TIMESTAMPTZ DEFAULT now()
);
```

---

## 8. Distribusi & Tokenomics

### 8.1 Alokasi Supply

```
┌─────────────────────────────────────────────────────────────────┐
│                    VEIL TOKEN SUPPLY: 100M                       │
│                                                                  │
│  ┌─────────────────────────────────────────────────┐  40%       │
│  │  LP REWARDS POOL                    40,000,000  │            │
│  │  Distribusi: ~10M/tahun selama 4 tahun          │            │
│  │  Vesting: Per-epoch (daily), proporsional LP    │            │
│  └─────────────────────────────────────────────────┘            │
│                                                                  │
│  ┌─────────────────────────────────┐  25%                       │
│  │  TRADING REWARDS     25,000,000 │                            │
│  │  ~6.25M/tahun selama 4 tahun    │                            │
│  │  Proporsional ke volume traded   │                            │
│  └─────────────────────────────────┘                            │
│                                                                  │
│  ┌──────────────────────────┐  15%                              │
│  │  TREASURY RESERVE        │                                   │
│  │  15,000,000 VEIL         │                                   │
│  │  Governance-controlled   │                                   │
│  └──────────────────────────┘                                   │
│                                                                  │
│  ┌────────────────────┐  10%                                    │
│  │  TEAM / DEV         │                                        │
│  │  10,000,000 VEIL    │                                        │
│  │  12-month cliff +   │                                        │
│  │  24-month vesting   │                                        │
│  └────────────────────┘                                         │
│                                                                  │
│  ┌────────────────────┐  10%                                    │
│  │  EARLY ADOPTERS     │                                        │
│  │  10,000,000 VEIL    │                                        │
│  │  Airdrop Wave 1-3   │                                        │
│  │  users + testnet     │                                        │
│  └────────────────────┘                                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 8.2 Emission Schedule

```
Year     LP Rewards    Trader Rewards   Total Emission   Cumulative
─────    ──────────    ──────────────   ──────────────   ──────────
  1      10,000,000     6,250,000       16,250,000       16.25%
  2      10,000,000     6,250,000       16,250,000       32.50%
  3      10,000,000     6,250,000       16,250,000       48.75%
  4      10,000,000     6,250,000       16,250,000       65.00%
  ────   ──────────    ──────────────   ──────────────
 Total   40,000,000    25,000,000       65,000,000

 + Team (10%) = 10M (vested over 36 months)
 + Airdrop (10%) = 10M (immediate at launch)
 + Treasury (15%) = 15M (governance-controlled)
 = 100,000,000 VEIL total
```

### 8.3 Reward Formula

**LP Reward per Epoch (daily):**

```
user_lp_reward = (user_lp_shares[market] / total_lp_shares[market])
                 × market_weight
                 × epoch_lp_emission

epoch_lp_emission = 10,000,000 / 365 ≈ 27,397 VEIL/day
market_weight     = market_volume / total_platform_volume
```

**Trader Reward per Epoch (daily):**

```
user_trader_reward = (user_volume_epoch / total_volume_epoch)
                     × epoch_trader_emission

epoch_trader_emission = 6,250,000 / 365 ≈ 17,123 VEIL/day
```

### 8.4 Voting Power Calculation

```
effective_voting_power = own_veil_balance
                       + sum(delegated_to_me)
                       - sum(delegated_to_others)
```

**1 VEIL = 1 Vote** (linear, no quadratic). Future governance proposal dapat mengubah ke quadratic voting jika diinginkan.

---

## 9. Integrasi dengan Veiled Markets

### 9.1 Cross-Program Communication

Governance program perlu berinteraksi dengan market program untuk:

| Action | Direction | Mechanism |
|---|---|---|
| Read treasury balance | Governance → Markets | `veiled_markets_v22.aleo/protocol_treasury` mapping read |
| Execute treasury withdrawal | Governance → Markets | Call existing `execute_proposal` transition |
| Read LP positions | Governance → Markets | `veiled_markets_v22.aleo/amm_pools` mapping read |
| Read trade volume | Governance → Markets | `veiled_markets_v22.aleo/amm_pools.total_volume` |
| Override market resolution | Governance → Markets | Requires new transition in markets (v23) |

### 9.2 Perubahan Minimal di `veiled_markets_v23.aleo`

Karena hanya tersisa **1 slot transition**, perubahan di market contract harus minimal:

**Opsi A — Gunakan slot terakhir:**
```leo
// Transition #31 (slot terakhir):
transition governance_override(
    public market_id: field,
    public winning_outcome: u8,
    public governance_proof: field    // proposal_id yang sudah executed
) -> Future {
    // Hanya callable oleh veiled_governance_v1.aleo program
    // Override market resolution berdasarkan governance vote
    ...
}
```

**Opsi B — Tidak ubah market contract:**
- Governance vote menghasilkan "social consensus" off-chain
- Guardian multisig (yang sudah ada) mengeksekusi hasil vote
- Lebih pragmatis tapi kurang trustless

**Rekomendasi: Opsi B untuk Phase 1, migrasi ke Opsi A di v24.**

### 9.3 Integrasi Flow

```
┌──────────────┐     ┌──────────────────┐     ┌────────────────────┐
│  VEIL Holder │     │  veiled_governance│     │ veiled_markets_v22 │
│              │     │  _v1.aleo         │     │ .aleo              │
│              │     │                   │     │                    │
│ 1. create_   │────▶│ 2. Store proposal │     │                    │
│    proposal  │     │    in mapping     │     │                    │
│              │     │                   │     │                    │
│ 3. vote_for  │────▶│ 4. Tally votes    │     │                    │
│    /against  │     │                   │     │                    │
│              │     │                   │     │                    │
│ 5. finalize  │────▶│ 6. Check quorum   │     │                    │
│    _vote     │     │    → PASSED       │     │                    │
│              │     │                   │     │                    │
│              │     │ 7. Timelock wait  │     │                    │
│              │     │    (48-72 hours)  │     │                    │
│              │     │                   │     │                    │
│ 8. execute_  │────▶│ 9. Cross-program  │────▶│ 10. State change   │
│    governance│     │    call           │     │     (treasury /    │
│              │     │                   │     │      resolution)   │
└──────────────┘     └──────────────────┘     └────────────────────┘
```

---

## 10. Frontend — Governance Dashboard

### 10.1 File Structure

```
frontend/src/
├── pages/
│   └── GovernancePage.tsx                 // Main governance route (/governance)
│
├── components/governance/
│   ├── GovernanceHeader.tsx               // VEIL balance, voting power, claim button
│   ├── ProposalList.tsx                   // Filter: active / passed / executed / all
│   ├── ProposalCard.tsx                   // Single proposal with vote progress bar
│   ├── ProposalDetail.tsx                 // Full proposal view + vote action
│   ├── CreateProposalModal.tsx            // Form: type, target, payload, stake
│   ├── VotePanel.tsx                      // Vote for/against with amount slider
│   ├── DelegateModal.tsx                  // Delegate voting power to address
│   ├── RewardClaimPanel.tsx              // Claim LP + trader VEIL rewards
│   ├── GovernanceStats.tsx               // Supply, circulating, staked, proposals count
│   ├── VeilTokenChart.tsx                // Emission schedule visualization
│   └── TimelockCountdown.tsx             // Countdown timer for timelock period
│
├── lib/
│   ├── governance-client.ts              // Blockchain calls to veiled_governance_v1.aleo
│   ├── veil-token.ts                     // VEIL balance, transfer, delegation utils
│   └── governance-types.ts               // TypeScript interfaces for governance
│
└── hooks/
    ├── useGovernance.ts                   // Governance state + proposal fetching
    ├── useVeilBalance.ts                  // VEIL token balance tracking
    └── useRewards.ts                     // Reward calculation + claim status
```

### 10.2 UI Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  Veiled Markets          Markets   Portfolio   Governance   Admin   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ Your VEIL    │  │ Voting Power │  │ Claimable    │              │
│  │              │  │              │  │ Rewards      │              │
│  │  12,450.00   │  │   0.0124%    │  │  340.25 VEIL │              │
│  │  VEIL        │  │  (12,450 +   │  │              │              │
│  │              │  │   3,200      │  │ [Claim All]  │              │
│  │ [Transfer]   │  │   delegated) │  │              │              │
│  │ [Delegate]   │  │              │  │  LP: 280.00  │              │
│  └──────────────┘  └──────────────┘  │  Trade: 60.25│              │
│                                      └──────────────┘              │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Active Proposals                      [+ Create Proposal]  │   │
│  │                                                              │   │
│  │  Filters: [All] [Active] [Passed] [Executed] [Rejected]    │   │
│  ├──────────────────────────────────────────────────────────────┤   │
│  │                                                              │   │
│  │  #14  Fee Change: Reduce LP fee from 1.0% to 0.8%          │   │
│  │  ┌────────────────────────────────────────────────────┐     │   │
│  │  │ FOR  ████████████████████░░░░░░  72.3%  (7.23M)   │     │   │
│  │  │ AGT  ████████░░░░░░░░░░░░░░░░░░  27.7%  (2.77M)  │     │   │
│  │  └────────────────────────────────────────────────────┘     │   │
│  │  Quorum: 89% met (10M / 11.2M needed)                      │   │
│  │  Voting ends in: 3d 14h 22m          [Vote For] [Against]  │   │
│  │                                                              │   │
│  ├──────────────────────────────────────────────────────────────┤   │
│  │                                                              │   │
│  │  #13  Resolve Dispute: Market "BTC > $100K" → YES           │   │
│  │  ┌────────────────────────────────────────────────────┐     │   │
│  │  │ FOR  █████████████████████████░░  85.1%  (8.51M)  │     │   │
│  │  │ AGT  ████░░░░░░░░░░░░░░░░░░░░░░  14.9%  (1.49M)  │     │   │
│  │  └────────────────────────────────────────────────────┘     │   │
│  │  Status: PASSED — Timelock: 47h 15m remaining               │   │
│  │  Guardian veto window active           [Execute after lock] │   │
│  │                                                              │   │
│  ├──────────────────────────────────────────────────────────────┤   │
│  │                                                              │   │
│  │  #12  Treasury: Allocate 5,000 ALEO to marketing fund       │   │
│  │  Status: EXECUTED on 2026-03-15                              │   │
│  │  Result: 91.2% FOR, Quorum 100% met                        │   │
│  │                                                              │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Governance Statistics                                       │   │
│  │                                                              │   │
│  │  Total Supply      Circulating      Staked in Votes         │   │
│  │  100,000,000       32,450,000       8,750,000               │   │
│  │                                                              │   │
│  │  Total Proposals   Passed   Rejected   Executed   Vetoed    │   │
│  │       14              9        3           8         1       │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 10.3 Create Proposal Modal

```
┌──────────────────────────────────────────────────────────┐
│  Create Governance Proposal                          [X] │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Proposal Type                                           │
│  ┌────────────────────────────────────────────────────┐  │
│  │ [v] Dispute Resolution                             │  │
│  │     Fee Structure Change                           │  │
│  │     Treasury Withdrawal                            │  │
│  │     Parameter Update                               │  │
│  │     Emergency Pause                                │  │
│  │     Resolver Election                              │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  Title                                                   │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Override BTC market resolution to YES              │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  Description                                             │
│  ┌────────────────────────────────────────────────────┐  │
│  │ The current resolution of NO is incorrect.         │  │
│  │ BTC was above $100K at the deadline timestamp...   │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  Target Market ID                                        │
│  ┌────────────────────────────────────────────────────┐  │
│  │ 12345...field                                      │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  Proposed Outcome: [1 - YES]                             │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Stake Required: 1,000 VEIL                        │  │
│  │  Your Balance:   12,450 VEIL                       │  │
│  │  Voting Period:  7 days                            │  │
│  │  Quorum Needed:  10% (10,000,000 VEIL)             │  │
│  │  Timelock:       48 hours after vote passes        │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│              [Cancel]        [Create Proposal]           │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

## 11. Database & Indexing

### 11.1 New Supabase Tables

```sql
-- ============================================================
-- GOVERNANCE TABLES
-- ============================================================

-- Governance proposals (indexed from on-chain)
CREATE TABLE governance_proposals (
    proposal_id       TEXT PRIMARY KEY,
    proposer          TEXT NOT NULL,
    proposal_type     SMALLINT NOT NULL,        -- 1-6
    proposal_type_name TEXT NOT NULL,            -- human-readable
    title             TEXT NOT NULL,
    description       TEXT,
    target            TEXT,                      -- market_id or parameter key
    payload_1         NUMERIC,                   -- primary data
    payload_2         TEXT,                      -- secondary data
    votes_for         NUMERIC DEFAULT 0,
    votes_against     NUMERIC DEFAULT 0,
    quorum_required   NUMERIC NOT NULL,
    quorum_met        BOOLEAN DEFAULT false,
    status            TEXT DEFAULT 'active',     -- active/passed/rejected/executed/vetoed/expired
    created_at        TIMESTAMPTZ DEFAULT now(),
    voting_deadline   TIMESTAMPTZ NOT NULL,
    timelock_until    TIMESTAMPTZ,
    executed_at       TIMESTAMPTZ,
    execution_tx      TEXT,                      -- transaction ID of execution
    updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_gov_proposals_status ON governance_proposals(status);
CREATE INDEX idx_gov_proposals_type ON governance_proposals(proposal_type);
CREATE INDEX idx_gov_proposals_created ON governance_proposals(created_at DESC);

-- Individual votes (indexed from on-chain)
CREATE TABLE governance_votes (
    id                SERIAL PRIMARY KEY,
    proposal_id       TEXT NOT NULL REFERENCES governance_proposals(proposal_id),
    voter             TEXT NOT NULL,
    vote_direction    TEXT NOT NULL,             -- 'for' or 'against'
    veil_weight       NUMERIC NOT NULL,          -- VEIL amount used
    voted_at          TIMESTAMPTZ DEFAULT now(),
    transaction_id    TEXT,                       -- on-chain TX ID
    UNIQUE(proposal_id, voter)
);

CREATE INDEX idx_gov_votes_proposal ON governance_votes(proposal_id);
CREATE INDEX idx_gov_votes_voter ON governance_votes(voter);

-- VEIL token reward tracking
CREATE TABLE veil_rewards (
    id                SERIAL PRIMARY KEY,
    user_address      TEXT NOT NULL,
    epoch_id          INTEGER NOT NULL,
    reward_type       TEXT NOT NULL,             -- 'lp' or 'trading'
    market_id         TEXT,                      -- which market generated the reward
    amount            NUMERIC NOT NULL,
    claimed           BOOLEAN DEFAULT false,
    claimed_at        TIMESTAMPTZ,
    claim_tx          TEXT,
    UNIQUE(user_address, epoch_id, reward_type, market_id)
);

CREATE INDEX idx_veil_rewards_user ON veil_rewards(user_address);
CREATE INDEX idx_veil_rewards_epoch ON veil_rewards(epoch_id);
CREATE INDEX idx_veil_rewards_unclaimed ON veil_rewards(claimed) WHERE claimed = false;

-- Delegation tracking
CREATE TABLE veil_delegations (
    delegator         TEXT NOT NULL,
    delegate          TEXT NOT NULL,
    amount            NUMERIC NOT NULL,
    delegated_at      TIMESTAMPTZ DEFAULT now(),
    revoked_at        TIMESTAMPTZ,
    active            BOOLEAN DEFAULT true,
    PRIMARY KEY(delegator, delegate)
);

CREATE INDEX idx_delegations_delegate ON veil_delegations(delegate) WHERE active = true;

-- Governance statistics (materialized)
CREATE TABLE governance_stats (
    stat_key          TEXT PRIMARY KEY,
    stat_value        NUMERIC NOT NULL,
    updated_at        TIMESTAMPTZ DEFAULT now()
);

-- Pre-populate stats
INSERT INTO governance_stats (stat_key, stat_value) VALUES
    ('total_supply', 100000000),
    ('circulating_supply', 0),
    ('total_staked_votes', 0),
    ('total_proposals', 0),
    ('total_proposals_passed', 0),
    ('total_proposals_executed', 0),
    ('total_proposals_vetoed', 0),
    ('total_veil_distributed_lp', 0),
    ('total_veil_distributed_trading', 0);
```

### 11.2 Backend Indexer Updates

Backend indexer perlu ditambahkan untuk:

1. **Poll `governance_proposals` mapping** — Index semua proposal aktif
2. **Poll `proposal_votes` mapping** — Track votes per proposal
3. **Calculate rewards per epoch** — Compute LP shares × market weight
4. **Track VEIL circulating supply** — Monitor mint/burn events

---

## 12. Security Considerations

### 12.1 Attack Vectors & Mitigations

| Attack | Deskripsi | Mitigasi |
|---|---|---|
| **Vote buying** | Beli VEIL, vote, jual setelah proposal | Token locking: VEIL locked selama voting + timelock period |
| **Flash loan voting** | Pinjam VEIL, vote, kembalikan dalam 1 block | Aleo tidak punya flash loans (private records). Lock mechanism mencegah ini |
| **Whale dominance** | 1 wallet punya mayoritas VEIL | Quorum requirements + future quadratic voting option |
| **Governance attack** | Beli 51% supply, pass malicious proposal | Guardian veto mechanism (Phase 1), timelock delay |
| **Proposal spam** | Flood dengan proposal sampah | 1,000 VEIL minimum stake (lost if rejected) |
| **Double voting** | Vote multiple kali | `proposal_votes` mapping tracks VoteKey hash, prevents duplicate |
| **Replay attack** | Reuse proposal dari sebelumnya | ProposalSeedGov includes unique nonce |
| **Delegation abuse** | Delegate→vote→undelegate→redelegate loop | Lock period matches voting period; can't undelegate during active vote |

### 12.2 Progressive Decentralization

```
Phase 1 (Launch)                Phase 2 (6 months)           Phase 3 (12 months)
────────────────                ──────────────────           ───────────────────
Guardian multisig               Guardian can only            Guardian removed
can veto ANY proposal           veto TREASURY &              completely
                                EMERGENCY proposals
                                                             Full token governance
Simple 1-token-1-vote           Quadratic voting             with no override
                                option via governance
                                vote

Treasury controlled             Partial treasury             Full treasury
by guardian + vote              control by vote              control by vote
```

### 12.3 Emergency Procedures

```
SCENARIO: Critical vulnerability discovered
─────────────────────────────────────────────
1. Any VEIL holder creates EMERGENCY_PAUSE proposal (5% quorum)
2. IF quorum met → immediate execution (no timelock)
3. Guardian multisig can also execute pause independently
4. Recovery requires standard governance vote (higher quorum)

SCENARIO: Governance attack (hostile takeover)
──────────────────────────────────────────────
1. Guardian detects malicious proposal during timelock
2. Guardian executes veto_proposal() during timelock window
3. Community creates new proposal to address the attack
4. Post-mortem: consider increasing quorum thresholds via governance
```

---

## 13. Roadmap & Timeline

### Phase 1: Foundation (Minggu 1-3)

| Minggu | Task | Deliverable |
|---|---|---|
| 1 | Desain VEIL token record + mappings | Token spec finalized |
| 1 | Implement `mint_veil`, `transfer_veil_private`, `burn_veil` | Token transitions |
| 2 | Implement `lock_for_vote`, `unlock_after_vote` | Vote locking mechanism |
| 2 | Implement `create_proposal`, `vote_for`, `vote_against` | Core voting |
| 3 | Implement `finalize_vote`, `execute_governance` | Execution pipeline |
| 3 | Implement `veto_proposal`, `init_governance` | Guardian safety net |
| 3 | Unit tests untuk semua transitions | Test coverage |

### Phase 2: Rewards & Distribution (Minggu 4-5)

| Minggu | Task | Deliverable |
|---|---|---|
| 4 | Implement reward epoch system | `start_reward_epoch`, `record_lp_contribution` |
| 4 | Implement `claim_lp_reward`, `claim_trader_reward` | Reward claiming |
| 4 | Early adopter airdrop snapshot | Airdrop list from Wave 1-3 |
| 5 | Reward formula tuning + simulation | Balanced emission rates |
| 5 | Integration test: full governance cycle | End-to-end test |

### Phase 3: Frontend (Minggu 5-7)

| Minggu | Task | Deliverable |
|---|---|---|
| 5 | `governance-client.ts` + `veil-token.ts` | Frontend blockchain integration |
| 6 | `GovernancePage.tsx` + proposal components | Main governance UI |
| 6 | `VotePanel.tsx` + `DelegateModal.tsx` | Voting + delegation UI |
| 7 | `RewardClaimPanel.tsx` + `GovernanceStats.tsx` | Rewards + analytics UI |
| 7 | Polish, responsive design, loading states | UI completion |

### Phase 4: Database & Indexing (Minggu 7-8)

| Minggu | Task | Deliverable |
|---|---|---|
| 7 | Supabase schema migration | New governance tables |
| 8 | Backend indexer: proposal + vote polling | Real-time governance data |
| 8 | Reward calculation service | Automated epoch rewards |

### Phase 5: Testing & Launch (Minggu 8-10)

| Minggu | Task | Deliverable |
|---|---|---|
| 8 | Testnet deployment + integration testing | `veiled_governance_v1.aleo` on testnet |
| 9 | Security review + edge case testing | Audit findings fixed |
| 9 | Airdrop execution (early adopters) | 10M VEIL distributed |
| 10 | Mainnet deployment + public launch | Governance live |

---

## 14. Perbandingan: Sebelum vs Sesudah

| Aspek | Sebelum (v22 Multisig) | Sesudah (VEIL Governance) |
|---|---|---|
| **Siapa yang vote** | 3 address tetap | Semua VEIL holder (~ribuan user) |
| **Voting power** | 1 signer = 1 vote (equal) | Proporsional ke VEIL balance |
| **Governance scope** | Treasury withdrawal saja | Resolusi, fee, treasury, parameter, pause, resolver |
| **Desentralisasi** | Rendah (3 orang kontrol) | Tinggi (komunitas) |
| **Incentive** | Tidak ada | LP reward + trading reward = VEIL |
| **Safety** | Tidak ada timelock | 48-72 jam timelock + guardian veto |
| **Delegation** | Tidak ada | Vote delegation ke trusted parties |
| **Transparency** | On-chain tapi sulit dilacak | Public dashboard + indexed history |
| **Evolusi** | Tidak bisa diubah | Self-governing (vote to change governance) |
| **Emergency** | Tidak ada circuit breaker | 5% quorum emergency pause |
| **Token** | Tidak ada | VEIL: 100M fixed supply, 4-year emission |
| **Transition count** | 30/31 di market contract | Governance = program terpisah (18 transitions) |

---

## Appendix A: Contract Pseudocode (Leo)

### A.1 Core Voting Logic

```leo
program veiled_governance_v1.aleo {

    // ================================================================
    // CONSTANTS
    // ================================================================
    const TOTAL_SUPPLY: u128 = 100_000_000_000000u128;
    const MIN_PROPOSAL_STAKE: u128 = 1000_000000u128;
    const VOTING_PERIOD: u64 = 40320u64;
    const TIMELOCK_STANDARD: u64 = 11520u64;
    const TIMELOCK_LONG: u64 = 17280u64;

    const STATUS_ACTIVE: u8 = 0u8;
    const STATUS_PASSED: u8 = 1u8;
    const STATUS_REJECTED: u8 = 2u8;
    const STATUS_EXECUTED: u8 = 3u8;
    const STATUS_VETOED: u8 = 4u8;
    const STATUS_EXPIRED: u8 = 5u8;

    // ================================================================
    // RECORDS
    // ================================================================

    record VeilToken {
        owner: address,
        amount: u128,
    }

    record VoteLock {
        owner: address,
        proposal_id: field,
        amount: u128,
        unlock_at: u64,
    }

    // ================================================================
    // TRANSITIONS
    // ================================================================

    // --- Token ---

    transition mint_veil(
        public recipient: address,
        public amount: u128
    ) -> VeilToken {
        // Only callable by this program (reward distribution)
        return VeilToken {
            owner: recipient,
            amount: amount,
        } then finalize(amount);
    }
    finalize mint_veil(amount: u128) {
        let current: u128 = Mapping::get_or_use(
            veil_total_supply, 0u8, 0u128
        );
        assert(current + amount <= TOTAL_SUPPLY);
        Mapping::set(veil_total_supply, 0u8, current + amount);
    }

    transition transfer_veil_private(
        token: VeilToken,
        to: address,
        amount: u128
    ) -> (VeilToken, VeilToken) {
        assert(amount <= token.amount);
        let remaining: u128 = token.amount - amount;

        let sent: VeilToken = VeilToken {
            owner: to,
            amount: amount,
        };
        let change: VeilToken = VeilToken {
            owner: token.owner,
            amount: remaining,
        };
        return (sent, change);
    }

    // --- Voting ---

    transition create_proposal(
        stake: VeilToken,
        public proposal_type: u8,
        public target: field,
        public payload_1: u128,
        public payload_2: field,
        public nonce: u64
    ) -> (VoteLock, VeilToken, field) {
        assert(stake.amount >= MIN_PROPOSAL_STAKE);

        let seed: ProposalSeedGov = ProposalSeedGov {
            proposer: self.caller,
            proposal_type: proposal_type,
            target: target,
            payload_1: payload_1,
            nonce: nonce,
        };
        let proposal_id: field = BHP256::hash_to_field(seed);

        let lock: VoteLock = VoteLock {
            owner: stake.owner,
            proposal_id: proposal_id,
            amount: MIN_PROPOSAL_STAKE,
            unlock_at: 0u64,  // Set in finalize based on block height
        };

        let change: VeilToken = VeilToken {
            owner: stake.owner,
            amount: stake.amount - MIN_PROPOSAL_STAKE,
        };

        return (lock, change, proposal_id)
            then finalize(proposal_id, self.caller, proposal_type,
                         target, payload_1, payload_2);
    }
    finalize create_proposal(
        proposal_id: field,
        proposer: address,
        proposal_type: u8,
        target: field,
        payload_1: u128,
        payload_2: field
    ) {
        // Ensure proposal doesn't exist
        assert(!Mapping::contains(governance_proposals, proposal_id));

        // Determine quorum based on type
        let quorum: u128 = get_quorum_for_type(proposal_type);
        let deadline: u64 = block.height + VOTING_PERIOD;

        let proposal: GovernanceProposal = GovernanceProposal {
            proposal_id: proposal_id,
            proposer: proposer,
            proposal_type: proposal_type,
            target: target,
            payload_1: payload_1,
            payload_2: payload_2,
            votes_for: 0u128,
            votes_against: 0u128,
            quorum_required: quorum,
            created_at: block.height,
            voting_deadline: deadline,
            timelock_until: 0u64,
            status: STATUS_ACTIVE,
        };

        Mapping::set(governance_proposals, proposal_id, proposal);
    }

    transition vote_for(
        token: VeilToken,
        public proposal_id: field,
        amount: u128
    ) -> (VoteLock, VeilToken) {
        assert(amount > 0u128);
        assert(amount <= token.amount);

        let lock: VoteLock = VoteLock {
            owner: token.owner,
            proposal_id: proposal_id,
            amount: amount,
            unlock_at: 0u64,  // Set in finalize
        };

        let change: VeilToken = VeilToken {
            owner: token.owner,
            amount: token.amount - amount,
        };

        return (lock, change)
            then finalize(proposal_id, self.caller, amount, true);
    }
    finalize vote_for(
        proposal_id: field,
        voter: address,
        amount: u128,
        is_for: bool
    ) {
        let proposal: GovernanceProposal = Mapping::get(
            governance_proposals, proposal_id
        );

        // Check voting is still open
        assert(proposal.status == STATUS_ACTIVE);
        assert(block.height <= proposal.voting_deadline);

        // Prevent double voting
        let vote_key: VoteKey = VoteKey {
            proposal_id: proposal_id,
            voter: voter,
        };
        let vote_hash: field = BHP256::hash_to_field(vote_key);
        assert(!Mapping::contains(proposal_votes, vote_hash));
        Mapping::set(proposal_votes, vote_hash, true);
        Mapping::set(vote_weights, vote_hash, amount);

        // Update tallies
        let updated: GovernanceProposal = GovernanceProposal {
            proposal_id: proposal.proposal_id,
            proposer: proposal.proposer,
            proposal_type: proposal.proposal_type,
            target: proposal.target,
            payload_1: proposal.payload_1,
            payload_2: proposal.payload_2,
            votes_for: proposal.votes_for + amount,
            votes_against: proposal.votes_against,
            quorum_required: proposal.quorum_required,
            created_at: proposal.created_at,
            voting_deadline: proposal.voting_deadline,
            timelock_until: proposal.timelock_until,
            status: proposal.status,
        };
        Mapping::set(governance_proposals, proposal_id, updated);
    }

    transition finalize_vote(
        public proposal_id: field
    ) -> Future {
        return then finalize(proposal_id);
    }
    finalize finalize_vote(proposal_id: field) {
        let proposal: GovernanceProposal = Mapping::get(
            governance_proposals, proposal_id
        );

        // Voting period must be over
        assert(block.height > proposal.voting_deadline);
        assert(proposal.status == STATUS_ACTIVE);

        let total_votes: u128 = proposal.votes_for + proposal.votes_against;
        let passed: bool = total_votes >= proposal.quorum_required
                        && proposal.votes_for > proposal.votes_against;

        let timelock: u64 = proposal.proposal_type == 2u8
                         || proposal.proposal_type == 3u8
                         ? TIMELOCK_LONG
                         : TIMELOCK_STANDARD;

        // Emergency proposals have no timelock
        let effective_timelock: u64 = proposal.proposal_type == 5u8
                                   ? 0u64
                                   : timelock;

        let new_status: u8 = passed ? STATUS_PASSED : STATUS_REJECTED;
        let lock_until: u64 = passed
                           ? block.height + effective_timelock
                           : 0u64;

        let updated: GovernanceProposal = GovernanceProposal {
            proposal_id: proposal.proposal_id,
            proposer: proposal.proposer,
            proposal_type: proposal.proposal_type,
            target: proposal.target,
            payload_1: proposal.payload_1,
            payload_2: proposal.payload_2,
            votes_for: proposal.votes_for,
            votes_against: proposal.votes_against,
            quorum_required: proposal.quorum_required,
            created_at: proposal.created_at,
            voting_deadline: proposal.voting_deadline,
            timelock_until: lock_until,
            status: new_status,
        };
        Mapping::set(governance_proposals, proposal_id, updated);
    }
}
```

---

## Appendix B: Governance Parameter Registry

Parameter yang bisa diubah via governance vote:

| Key | Nama | Current Value | Range | Proposal Type |
|---|---|---|---|---|
| `0u8` | `PROTOCOL_FEE_BPS` | 50 (0.5%) | 0-500 | FEE_CHANGE |
| `1u8` | `CREATOR_FEE_BPS` | 50 (0.5%) | 0-500 | FEE_CHANGE |
| `2u8` | `LP_FEE_BPS` | 100 (1.0%) | 0-500 | FEE_CHANGE |
| `3u8` | `MIN_TRADE_AMOUNT` | 1,000 | 100-1M | PARAMETER |
| `4u8` | `MIN_LIQUIDITY` | 10,000 | 1,000-1M | PARAMETER |
| `5u8` | `MIN_DISPUTE_BOND` | 1,000,000 | 100K-10M | PARAMETER |
| `6u8` | `CHALLENGE_WINDOW` | 2,880 blocks | 1,440-8,640 | PARAMETER |
| `7u8` | `MIN_PROPOSAL_STAKE` | 1,000 VEIL | 100-10,000 | PARAMETER |
| `8u8` | `VOTING_PERIOD` | 40,320 blocks | 5,760-80,640 | PARAMETER |
| `9u8` | `TIMELOCK_STANDARD` | 11,520 blocks | 2,880-23,040 | PARAMETER |

---

## Appendix C: Glossary

| Term | Definisi |
|---|---|
| **VEIL** | Governance token Veiled Markets, memberikan voting power kepada holder |
| **Quorum** | Minimum total VEIL yang harus berpartisipasi agar vote valid |
| **Timelock** | Delay wajib antara vote lolos dan eksekusi, memberikan waktu untuk review |
| **Guardian** | Multisig yang bisa veto proposal selama timelock (safety net Phase 1) |
| **Delegation** | Menyerahkan voting power ke address lain tanpa transfer kepemilikan token |
| **Epoch** | Periode waktu (~1 hari) untuk perhitungan dan distribusi reward |
| **BPS** | Basis points, 1 BPS = 0.01%, 100 BPS = 1% |
| **FPMM** | Fixed Product Market Maker, model AMM yang digunakan Veiled Markets |
| **Progressive decentralization** | Strategi bertahap dari guardian-controlled ke full community governance |
