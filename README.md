# Veiled Markets

<div align="center">

<img src="./logo-veiled-markets.png" alt="Veiled Markets Logo" width="200"/>

### **Predict Freely. Bet Privately.**

Privacy-preserving prediction market with FPMM AMM on Aleo blockchain

[![Live Demo](https://img.shields.io/badge/Live-Demo-00D4AA?style=for-the-badge)](https://veiledmarkets.xyz)
[![Aleo](https://img.shields.io/badge/Aleo-Testnet-00D4AA?style=for-the-badge)](https://testnet.explorer.provable.com/program/veiled_markets_v37.aleo)
[![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](./LICENSE)

</div>

---

## Overview

Veiled Markets is a prediction market protocol on Aleo where users trade outcome shares with **full privacy**. Uses a Gnosis-style **Fixed Product Market Maker (FPMM)** with complete-set minting/burning. All buy transactions are fully private — no one can see who bet on what, which outcome, or how much.

The current generation (v37/v7/v14/v6) is a **post-audit hardening release** that fixes four critical findings in the dispute → governance escalation flow and adds an end-to-end cross-program guard so disputed markets cannot be exploited via state pollution. See [Audit Hardening](#audit-hardening-v6) below.

**Key Features:**
- **Fully Private Trading** — All buy/sell/redeem use private records. Buy inputs (market, outcome, amount, shares) are ZK-encrypted on-chain
- **Tri-Token Support** — Markets in **ALEO** (native), **USDCX**, or **USAD** stablecoins — all with private transfers
- **Multi-Outcome Markets** — Support 2-, 3-, and 4-outcome markets with custom labels and full frontend trading flows
- **FPMM AMM** — Constant product invariant with per-trade fees (0.5% protocol + 0.5% creator + 1% LP = 2% total)
- **Multi-Voter Quorum Resolution** — Minimum 3 independent voters with ALEO bond, dispute window, slashing for wrong voters
- **Tiered Dispute Escalation** — Dispute → committee panel (tier 2) → community proposal (tier 3) → cross-program apply via `veiled_governance_v6.aleo`
- **Governance-Driven Settlement** — `governance_resolve_aleo/usdcx/usad` cross-program calls flip disputed markets to `RESOLVED` with the governance-chosen outcome and the actual escalation tier (committee=2 vs community=3) preserved as audit trail
- **Per-Token Namespaced Markets** — `MarketSeed` includes `token_type` so a `market_id` field is unique across the three token contracts (no namespace collision)
- **Multi-Sig Treasury** — 3-of-N multisig for protocol fund withdrawals
- **Encrypted Storage** — Supabase with AES-256-GCM client-side encryption for cross-device bet sync
- **IPFS Metadata** — Market metadata stored on IPFS via Pinata

## Deployed Contracts

| Contract | Program ID | Transitions | Purpose |
|----------|-----------|-------------|---------|
| **Main** | [`veiled_markets_v37.aleo`](https://testnet.explorer.provable.com/program/veiled_markets_v37.aleo) | 25/31 | ALEO markets, Multi-Voter resolution, multisig treasury, `assert_disputed` cross-program guard |
| **USDCX** | [`veiled_markets_usdcx_v7.aleo`](https://testnet.explorer.provable.com/program/veiled_markets_usdcx_v7.aleo) | 25/31 | USDCX stablecoin markets (private Token + MerkleProof) |
| **USAD** | [`veiled_markets_usad_v14.aleo`](https://testnet.explorer.provable.com/program/veiled_markets_usad_v14.aleo) | 25/31 | USAD stablecoin markets (private Token + MerkleProof) |
| **Governance** | [`veiled_governance_v6.aleo`](https://testnet.explorer.provable.com/program/veiled_governance_v6.aleo) | 31/31 | Proposals, tiered escalation, committee panel, treasury, cross-program resolve |
| **Parlay** | [`veiled_parlay_v3.aleo`](https://testnet.explorer.provable.com/program/veiled_parlay_v3.aleo) | — | Multi-leg parlay betting across all 3 token markets (out of v6 audit scope) |

**Dependencies:** `credits.aleo`, `test_usdcx_stablecoin.aleo`, `test_usad_stablecoin.aleo`, `merkle_tree.aleo`

**Deployment date:** 2026-04-08 (post-audit hardening, see [Audit Hardening](#audit-hardening-v6))

> **Architecture:** Each token type has its own market contract due to snarkVM's 31-transition limit. All three market contracts share identical structs, mappings, constants, and resolution logic. The frontend routes transactions automatically based on `tokenType` — users see a unified experience.

> **MarketSeed namespace:** Starting in v37/v7/v14, `MarketSeed` includes `token_type: u8` so two markets created on different token contracts with the same creator/question/deadline produce **distinct** `market_id` fields. Governance state keyed by raw `market_id` cannot collide across tokens.

## Market Resolution: Multi-Voter Quorum → Tiered Governance Escalation

Veiled Markets uses a **decentralized multi-voter quorum** with a **tiered governance escalation** for disputes. There is no single trusted resolver — outcomes are settled by independent voters bonded with ALEO, and contested results are escalated through committee or community vote channels.

```
Market Deadline → close_market → CLOSED
        ↓
Anyone: vote_outcome(outcome, 1 ALEO bond)  →  PENDING_RESOLUTION
        ↓  (min 3 voters required, voting window ~3.2h on testnet)
Anyone: finalize_votes()  →  PENDING_FINALIZATION
        ↓
Dispute window opens (~3.2h on testnet, hardcoded 2880 blocks)
        │
        ├─── No dispute ──────────────────────────────────┐
        │    confirm_resolution()  →  RESOLVED            │
        │    Winners: bond back + share of loser bonds    │
        │    Losers: bond SLASHED                          │
        │    Voter reward: 20% of protocol fees            │
        │                                                  │
        └─── Dispute filed (3× bond, propose alt outcome) ┘
                          ↓
                  STATUS_DISPUTED  ← claims/redemptions LOCKED
                          ↓
                  initiate_escalation_aleo / usdcx / usad
                  (cross-program call to assert_disputed in market)
                          ↓
                     TIER 2 (Committee Review)
                          │
              ┌───────────┴───────────┐
              │                       │
              ▼                       ▼
       Committee finalize     Committee deadlock
       (3-of-5 panel vote)    (escalate_to_community)
              │                       │
              │                       ▼
              │                 TIER 3 (Community Vote)
              │                 governance proposal lifecycle
              │                 (vote_for/against → finalize → execute)
              │                       │
              └───────────┬───────────┘
                          ▼
            governance_resolve_aleo(market_id, outcome, tier)
                          ↓
            cross-program  veiled_markets_v37.aleo::apply_governance_resolution
                          ↓
                  STATUS_RESOLVED  ← claims/redemptions UNLOCKED
```

### Resolution-related transitions

**Market contracts** (`v37` / `usdcx_v7` / `usad_v14` — identical across all three):

| Transition | Purpose |
|-----------|---------|
| `vote_outcome` | Cast outcome vote with 1 ALEO bond (1 vote per address per market) |
| `finalize_votes` | Tally votes after voting window (requires ≥3 voters) |
| `confirm_resolution` | Finalize after dispute window with no dispute |
| `dispute_resolution` | Challenge winner — flips status to `STATUS_DISPUTED`, locks claims, requires 3× total voter bonds as guarantee |
| `apply_governance_resolution` | **Cross-program call from governance v6 only.** Validates `caller == veiled_governance_v6.aleo`, market is `STATUS_DISPUTED`, then flips to `RESOLVED` with the committee/community-chosen outcome and the escalation tier as audit trail |
| `assert_disputed` | **Cross-program call from governance v6 only.** Reverts unless the market exists and is in `STATUS_DISPUTED`. Used by `initiate_escalation_*` to prevent governance state pollution |
| `claim_voter_bond` | Winners claim bond back; losers' bonds are slashed |
| `claim_dispute_bond` | Disputer claims bond back if their proposed outcome wins via governance |
| `claim_voter_reward` | Claim accumulated protocol fee rewards |

**Governance v6** (escalation orchestration):

| Transition | Purpose |
|-----------|---------|
| `initiate_escalation_aleo` | Tier 0 → Tier 2 for ALEO market. Cross-program calls `assert_disputed` on `veiled_markets_v37.aleo` |
| `initiate_escalation_usdcx` | Same for `veiled_markets_usdcx_v7.aleo` |
| `initiate_escalation_usad` | Same for `veiled_markets_usad_v14.aleo` |
| `committee_vote_resolve` | Committee member casts vote on disputed outcome (caller must be in `committee_members` mapping, max 5 slots) |
| `finalize_committee_vote` | Anyone — aggregates committee votes, sets `committee_decisions` with majority winner |
| `escalate_to_community` | Anyone — Tier 2 → Tier 3 if committee deadlocks. Creates a `PROPOSAL_RESOLVE_DISPUTE` governance proposal |
| `governance_resolve_aleo/usdcx/usad` | Anyone — final settlement transition. Cross-program calls `apply_governance_resolution` on the matching market with `(market_id, winning_outcome, tier)` where `tier ∈ {2, 3}` |

## Architecture

```
┌──────────────────┐     ┌───────────────────────┐     ┌──────────────────────────────┐
│   Frontend       │────▶│   Aleo Wallets        │────▶│   Aleo Testnet                │
│   React 18/Vite  │     │  Shield · Puzzle ·    │     │                              │
│   TypeScript     │     │  Leo · Fox · Soter    │     │  veiled_markets_v37.aleo      │
│   Tailwind CSS   │     │  (ProvableHQ adapter) │     │  └─ ALEO markets (25 trans)   │
│   Recharts       │     │                       │     │     + assert_disputed guard   │
│                  │     │  recordIndices hint   │     │                              │
│  Pages:          │     │  for Token records    │     │  veiled_markets_usdcx_v7.aleo │
│  - Landing       │     └───────────────────────┘     │  └─ USDCX markets (25 trans)  │
│  - Dashboard     │                                   │     + assert_disputed guard   │
│  - MarketDetail  │     ┌───────────────────────┐     │                              │
│  - Portfolio     │────▶│  Supabase (encrypted) │     │  veiled_markets_usad_v14.aleo │
│  - Governance    │     │  Bet sync + registry  │     │  └─ USAD markets (25 trans)   │
│  - Create Market │     │  market_disputes      │     │     + assert_disputed guard   │
│                  │     └───────────────────────┘     │                              │
│                  │                                   │  veiled_governance_v6.aleo    │
│                  │     ┌───────────────────────┐     │  └─ Governance (31 trans)     │
│                  │────▶│  IPFS (Pinata)        │     │     - initiate_escalation_*   │
│                  │     │  Market metadata      │     │       (3 token-specific)      │
│                  │     └───────────────────────┘     │     - governance_resolve_*    │
│                  │                                   │       with tier passthrough   │
│                  │                                   │                              │
│                  │     ┌───────────────────────┐     │  veiled_parlay_v3.aleo        │
│                  │     │  Backend Indexers     │     │  └─ Multi-leg parlay          │
│                  │     │  (Node.js)            │     │                              │
│                  │     │                       │     │  Dependencies:               │
│                  │     │  - market indexer     │     │  ├─ credits.aleo             │
│                  │     │  - dispute indexer    │     │  ├─ test_usdcx_stablecoin    │
│                  │     │  - governance indexer │     │  ├─ test_usad_stablecoin     │
│                  │     └───────────────────────┘     │  └─ merkle_tree.aleo         │
└──────────────────┘                                   └──────────────────────────────┘
```

The frontend reads on-chain state directly via the Provable explorer REST API for hot paths (markets list, AMM pools, dispute state, governance escalation tier). The Supabase mirror is used for cross-device bet persistence and indexed historical scans. Backend indexers batch-scan blocks every 60 seconds and upsert into Supabase for fast list queries.

## Project Structure

```
veiled-markets/
├── contracts-v37/             # ALEO market contract (25 transitions)
│                              # + assert_disputed cross-program guard
├── contracts-usdcx-v7/        # USDCX market contract (25 transitions, private Token + MerkleProof)
├── contracts-usad-v14/        # USAD market contract (25 transitions, private Token + MerkleProof)
├── contracts-governance-v6/   # Governance contract (31 transitions)
│                              # + tiered escalation, committee panel, cross-program resolve
├── contracts-governance-logic/# Helper module for governance test logic
├── contracts-parlay/          # Parlay multi-leg betting contract (out of v6 audit scope)
├── frontend/                  # React dashboard + landing page
│   ├── src/
│   │   ├── components/        # UI components (ResolvePanel, EscalationPanel, etc.)
│   │   ├── hooks/             # React hooks (useGovernance, useAleoTransaction, ...)
│   │   ├── lib/               # Business logic (aleo-client, governance-client, AMM math, stores)
│   │   ├── pages/             # Route pages (Dashboard, MarketDetail, Portfolio, Governance, ...)
│   │   ├── styles/            # Global CSS
│   │   └── workers/           # Web workers (ZK prover, SDK)
│   └── public/
├── backend/                   # Blockchain indexer services
│   └── src/
│       ├── indexer.ts            # Market discovery indexer
│       ├── dispute-indexer.ts    # Dispute + apply_governance_resolution scanner
│       └── governance-indexer.ts # Governance proposal/vote scanner
├── sdk/                       # TypeScript SDK (@veiled-markets/sdk)
├── supabase/                  # Database schemas (market_disputes, user_bets, registry, ...)
└── docs/                      # Architecture documentation
```

## Privacy Model

All three token types achieve **full privacy** for trading operations:

| Token | Buy Method | Privacy Level |
|-------|-----------|---------------|
| **ALEO** | `credits.aleo/transfer_private_to_public` | All inputs encrypted (ciphertext) |
| **USDCX** | `test_usdcx_stablecoin.aleo/transfer_private_to_public` | Token record + MerkleProof (encrypted) |
| **USAD** | `test_usad_stablecoin.aleo/transfer_private_to_public` | Token record + MerkleProof (encrypted) |

### What's Hidden vs Visible

| Data | Visibility |
|------|-----------|
| Market question, pool reserves, prices | Public (by design) |
| **Buy: market, outcome, amount, shares** | **Private** (ZK-encrypted ciphertext) |
| **Buy: wallet address** | **Private** (Token record, not linked to sender) |
| **Sell payouts, redemptions, refunds** | **Private** (`transfer_public_to_private`) |
| Market creation, resolution votes | Public |
| Transaction fee payer | Public (Aleo protocol requirement) |

## Key Transitions

### Market Contracts (`v37` / `usdcx_v7` / `usad_v14` — 25 transitions each)

**Trading (Private):**
`create_market` · `buy_shares_private` · `sell_shares` · `add_liquidity`

**Resolution (Multi-Voter Quorum + Dispute):**
`vote_outcome` · `finalize_votes` · `confirm_resolution` · `dispute_resolution` · `claim_voter_bond` · `claim_dispute_bond` · `claim_voter_reward`

**Cross-program (governance only):**
`apply_governance_resolution` · `assert_disputed`

**Lifecycle:**
`close_market` · `cancel_market`

**Redemption:**
`redeem_shares` · `claim_refund` · `claim_lp_refund` · `withdraw_lp_resolved` · `withdraw_creator_fees`

**Treasury (Multisig):**
`init_multisig` · `propose_treasury_withdrawal` · `approve_proposal` · `execute_proposal`

**Governance config sync:**
`set_governance_value`

### Governance Contract (`veiled_governance_v6.aleo` — 31 transitions)

**Proposals:** `create_proposal` · `vote_for` · `vote_against` · `finalize_vote` · `execute_governance` · `veto_proposal` · `unlock_after_vote`

**Delegation:** `delegate_votes` · `undelegate_votes`

**Resolver Registry:** `register_resolver` · `unstake_resolver` · `upgrade_resolver_tier` · `slash_resolver`

**Tiered Dispute Escalation (v6 hardening):**
`initiate_escalation_aleo` · `initiate_escalation_usdcx` · `initiate_escalation_usad` · `set_committee_members` · `assign_resolver_panel` · `panel_vote` · `committee_vote_resolve` · `finalize_committee_vote` · `escalate_to_community` · `governance_resolve_aleo` · `governance_resolve_usdcx` · `governance_resolve_usad`

**Rewards & Treasury:** `fund_reward_epoch` · `record_contribution` · `claim_reward` · `init_governance` · `deposit_protocol_fees` · `execute_treasury_proposal`

> v6 removed the standalone `blacklist_resolver` (auto-blacklist now triggers inside `slash_resolver` after `MAX_STRIKES`) and `update_resolver_stats` (off-chain reconstruction from `committee_decisions` / `governance_resolved_outcomes`) to make room for the new 3 token-specific `initiate_escalation_*` transitions while staying within the snarkVM 31-transition limit.

## Audit Hardening (v6)

The current generation (v37/v7/v14/v6) is the result of a post-audit hardening cycle that fixed four critical findings in the initial v6 dispute architecture (v36/v6/v13/v5) plus an end-to-end hardening of the escalation entry point. All fixes have been deployed to testnet on 2026-04-08.

### Findings fixed

| Bug | Severity | Description | Fix |
|---|---|---|---|
| **A** | Critical | `finalize_committee_vote_fin` and `panel_vote_fin` wrote to `governance_resolved_outcomes` while `governance_resolve_*_fin` asserted the mapping was empty — committee/panel paths could not actually drive market settlement | Removed the duplicate writes; `committee_decisions` is now the single source of truth for tier 2, and `governance_resolved_outcomes` is only set after the cross-program `apply_governance_resolution` call succeeds |
| **B** | Critical | Market contracts hardcoded `GOVERNANCE_PROGRAM` to the deployer's wallet address instead of the program-derived address. `self.caller` in cross-program calls resolves to the calling program's address (Poseidon4 hash), so the assertion could never pass for governance-initiated calls | Replaced the constant with the Leo 4.0 program literal `veiled_governance_v6.aleo` — compiles to the runtime-resolved program address, exactly matching what `self.caller` produces in cross-program execution |
| **C** | High | `governance_resolve_aleo/usdcx/usad` hardcoded `2u8` (committee tier) when calling `apply_governance_resolution`, so community-resolved disputes were recorded with the wrong tier in `market_dispute_state.escalated_tier` | Added `tier: u8` as a public input. Final fn cross-checks against `market_escalation_tier[market_id]`. The tier is propagated through the cross-program call so the audit trail matches reality |
| **D** | High | `MarketSeed` (the struct hashed to derive `market_id`) was identical across all 3 token contracts. Two markets with the same creator/question/deadline on different tokens collided to the same `market_id`, polluting governance state keyed by raw `market_id` | Added `token_type: u8` to `MarketSeed`. New markets on different token contracts now produce distinct field IDs |
| **Hardening** | Medium | `initiate_escalation` set the escalation tier without verifying the market existed or was actually disputed — governance state could be polluted by arbitrary `market_id` values | Split into 3 token-specific transitions (`initiate_escalation_aleo/usdcx/usad`). Each cross-program calls a new `assert_disputed` transition in the matching market contract that reverts unless the market exists and is in `STATUS_DISPUTED` |

### Test coverage

The hardening release ships **43 unit + e2e tests** in Leo 4.0 (`leo test`):

| Suite | Tests | What's covered |
|---|---|---|
| `contracts-v37/tests/resolution_flow_tests.leo` | 15 | FPMM math (binary + 4-outcome), vote tally edge cases, dispute bond multiplier, plus 3 hardening-specific tests (governance caller check, MarketSeed namespace, tier bounds) |
| `contracts-governance-v6/tests/governance_tests.leo` | 28 | Proposal lifecycle (parameter, fee, treasury, resolver, emergency pause), 5 audit-fix unit tests (no-collision, tier 2/3, tier mismatch, tier invalid), and **8 cross-program e2e tests** that execute against the in-memory test ledger to prove the dispute → governance flow rejects bad inputs |

```bash
$ cd contracts-v37 && leo test
15 / 15 tests passed.

$ cd contracts-governance-v6 && leo test --no-local
28 / 28 tests passed.
```

The cross-program e2e tests in the governance suite use `@test fn ... -> Final` blocks that actually execute `initiate_escalation_*` and `governance_resolve_*` against the in-memory ledger and verify they revert for non-existent markets, invalid tiers, or tier mismatches.

## FPMM Model

| | Formula |
|---|---|
| **Buy** | `shares_out = (r_i + a) - r_i * prod(r_k / (r_k + a))` for active k ≠ i |
| **Sell** | `shares_needed = r_i_new - r_i + pool_out` where `r_i_new = r_i * prod(r_k / (r_k - p))` |
| **Redeem** | Winning shares 1:1 against collateral, losing shares = 0 |
| **Fees** | 0.5% protocol + 0.5% creator + 1% LP = **2% total** |

## Shield Wallet Integration

- **`recordIndices`** — Shield Wallet requires a `recordIndices` hint to identify which input indices are record types
- **MerkleProof Compatibility** — USDCX/USAD contracts use locally-defined `MerkleProof` struct (NullPay pattern) + deploy via `snarkos developer deploy` to avoid Shield parser limitations
- **Token Record Format** — Frontend validates records are in Leo plaintext format before passing to wallet

## Quick Start

```bash
git clone https://github.com/AkindoHQ/aleo-akindo.git
cd aleo-akindo/veiled-markets/frontend
npm install --legacy-peer-deps
cp .env.example .env
# Edit .env with your Supabase and Pinata keys
npm run dev
```

**Wallet:** Install [Shield Wallet](https://shieldwallet.io/), switch to Testnet, get credits from [Aleo Faucet](https://faucet.aleo.org).

## Testing

### Leo on-chain test suite

The hardening release ships **43 unit + cross-program e2e tests** in Leo 4.0 (`leo test`):

```bash
# Market contract tests (FPMM math + audit hardening unit tests)
cd contracts-v37 && leo test
# → 15 / 15 tests passed

# Governance contract tests (proposal lifecycle + e2e cross-program flow)
cd ../contracts-governance-v6 && leo test --no-local
# → 28 / 28 tests passed
```

The `--no-local` flag tells Leo to use the on-chain registry cache for transitive imports instead of recompiling Leo source — this sidesteps a Leo 4.0 type-checker issue when test programs transitively import `credits.aleo` finalize blocks.

Test files:
- [contracts-v37/tests/resolution_flow_tests.leo](contracts-v37/tests/resolution_flow_tests.leo) — FPMM math + voter quorum + audit fix unit tests
- [contracts-governance-v6/tests/governance_tests.leo](contracts-governance-v6/tests/governance_tests.leo) — governance lifecycle + cross-program e2e tests

The cross-program e2e tests in the governance suite use `@test fn ... -> Final` to actually execute `initiate_escalation_*` and `governance_resolve_*` against the in-memory test ledger. Negative tests (`@should_fail`) prove that:

- `initiate_escalation_aleo/usdcx/usad` revert for non-existent markets (cross-program guard fires)
- `governance_resolve_*` revert for invalid tier values (`tier ∉ {2, 3}`)
- `governance_resolve_*` revert when called for non-disputed markets (cross-program `apply_governance_resolution` rejects the call)

### Frontend type check

```bash
cd frontend && npx tsc --noEmit --skipLibCheck
# → exit 0
```

### Backend indexer

```bash
cd backend
pnpm install
pnpm disputes:watch     # poll the chain for dispute_resolution / apply_governance_resolution
```

### Environment Variables

```env
# Network
VITE_NETWORK=testnet
VITE_ALEO_RPC_URL=https://api.explorer.provable.com/v1/testnet

# Active contracts (v6 post-audit hardening, deployed 2026-04-08)
VITE_PROGRAM_ID=veiled_markets_v37.aleo
VITE_USDCX_MARKET_PROGRAM_ID=veiled_markets_usdcx_v7.aleo
VITE_USAD_PROGRAM_ID=veiled_markets_usad_v14.aleo
VITE_USDCX_PROGRAM_ID=test_usdcx_stablecoin.aleo
VITE_GOVERNANCE_PROGRAM_ID=veiled_governance_v6.aleo
VITE_PARLAY_PROGRAM_ID=veiled_parlay_v3.aleo

# Supabase + IPFS
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_PINATA_JWT=your-pinata-jwt
```

A complete Vercel template lives in [.env.vercel.template](./.env.vercel.template).

### Build & Deploy Contracts

The current generation uses Leo 4.0 (`fn` / `final fn` / `Final` / `::` syntax) and the standard `leo deploy` workflow. Cross-program imports are resolved from the on-chain registry at deploy time, so the import order matters: deploy markets first, then governance.

```bash
# 1. Build + deploy ALEO market (v37)
cd contracts-v37
leo build
leo deploy --network testnet --priority-fees 0 --broadcast --yes

# 2. Deploy USDCX market (v7)
cd ../contracts-usdcx-v7
leo build
leo deploy --network testnet --priority-fees 0 --broadcast --yes

# 3. Deploy USAD market (v14)
cd ../contracts-usad-v14
leo build
leo deploy --network testnet --priority-fees 0 --broadcast --yes

# 4. Deploy governance (v6) — depends on the 3 markets above already being on chain
cd ../contracts-governance-v6
leo build
leo deploy --network testnet --priority-fees 0 --broadcast --yes

# 5. Initialize governance (one-time, sets guardian multisig)
PRIV_KEY=$(grep '^PRIVATE_KEY=' ../.env | cut -d= -f2)
snarkos developer execute veiled_governance_v6.aleo init_governance \
  <guardian_1_address> \
  <guardian_2_address> \
  <guardian_3_address> \
  2u8 \
  --private-key "$PRIV_KEY" \
  --network 1 \
  --query https://api.explorer.provable.com/v1 \
  --broadcast https://api.explorer.provable.com/v1/testnet/transaction/broadcast
```

Total deploy cost on testnet: ~225 ALEO (~55 ALEO per market × 3 + ~55 ALEO governance + ~0.01 ALEO init).

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Contracts** | Leo (Aleo), snarkVM, snarkOS |
| **Frontend** | React 18, TypeScript, Vite 5, Tailwind CSS 3, Framer Motion |
| **State** | Zustand (blockchain store + app state) |
| **Charts** | Recharts |
| **Wallet** | ProvableHQ Aleo Wallet Adapter (Shield, Puzzle, Leo, Fox, Soter) |
| **Persistence** | Supabase (AES-256-GCM encrypted) + localStorage |
| **Metadata** | IPFS via Pinata |
| **Hosting** | Vercel |

## Release History

| Version | Status | Highlights |
|---|---|---|
| **v37 / v7 / v14 / v6** (active) | Deployed 2026-04-08 | Post-audit hardening: Bug A/B/C/D fixes + `assert_disputed` cross-program guard. Markets at 25 transitions (added `assert_disputed`). Governance at 31 transitions (replaced `blacklist_resolver`/`update_resolver_stats` with 3 `initiate_escalation_*` variants). 43 unit + e2e tests passing. |
| **v36 / v6 / v13 / v5** (legacy, removed from frontend) | Deployed 2026-04-08 | First-pass v6 dispute architecture: STATUS_DISPUTED gating + `apply_governance_resolution` cross-program override. Audited and replaced same day by hardening release. |
| **v35 / v5 / v12 / v4** (deprecated) | Deployed 2026-03-26 | Pre-dispute architecture. Markets resolved directly to RESOLVED on dispute (no escalation lane). Replaced by v6 dispute architecture. |

### What changed v35 → v37

| Aspect | v35 (pre-dispute) | v37 (post-audit) |
|--------|--------|--------|
| **Resolution** | Single designated resolver | Multi-Voter Quorum (3+ voters with bonds) |
| **Dispute** | 1× bond, single challenger, immediate override | 3× bond dispute → `STATUS_DISPUTED` → tiered governance escalation |
| **Governance authority** | Not connected to markets | Cross-program `apply_governance_resolution` + `assert_disputed` from `veiled_governance_v6.aleo` |
| **Escalation tiers** | None | Tier 0 (local) → Tier 2 (committee 5-of-3) → Tier 3 (community proposal) |
| **Audit trail** | Not tracked | `market_dispute_state` mapping with `escalated_tier`, `final_outcome`, `resolved_by` |
| **Market ID namespace** | Same ID could collide across token contracts | `MarketSeed` includes `token_type` for unique ID per contract |
| **Cross-program auth** | n/a | Program literal `veiled_governance_v6.aleo` (not deployer wallet) |
| **Test coverage** | n/a | 43 tests in Leo 4.0 (`leo test`), including 8 cross-program e2e |
| **Portfolio UX** | Card list | Table layout with Performance chart |

## Contributing

1. Fork the repo
2. Create feature branch (`git checkout -b feature/name`)
3. Commit changes and open Pull Request

## License

MIT License — see [LICENSE](./LICENSE)

---

<div align="center">

**Built on Aleo**

[Live Demo](https://veiledmarkets.xyz) · [ALEO Market](https://testnet.explorer.provable.com/program/veiled_markets_v37.aleo) · [USDCX Market](https://testnet.explorer.provable.com/program/veiled_markets_usdcx_v7.aleo) · [USAD Market](https://testnet.explorer.provable.com/program/veiled_markets_usad_v14.aleo) · [Governance](https://testnet.explorer.provable.com/program/veiled_governance_v6.aleo) · [Parlay](https://testnet.explorer.provable.com/program/veiled_parlay_v3.aleo)

</div>
