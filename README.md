# Veiled Markets

<div align="center">

<img src="./logo-veiled-markets.png" alt="Veiled Markets Logo" width="200"/>

### **Predict Freely. Bet Privately.**

Privacy-preserving prediction market with FPMM AMM on Aleo blockchain

[![Live Demo](https://img.shields.io/badge/Live-Demo-00D4AA?style=for-the-badge)](https://veiledmarkets.xyz)
[![Aleo](https://img.shields.io/badge/Aleo-Testnet-00D4AA?style=for-the-badge)](https://testnet.explorer.provable.com/program/veiled_markets_v35.aleo)
[![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](./LICENSE)

</div>

---

## Overview

Veiled Markets is a prediction market protocol on Aleo where users trade outcome shares with **full privacy**. Uses a Gnosis-style **Fixed Product Market Maker (FPMM)** with complete-set minting/burning. All buy transactions are fully private — no one can see who bet on what, which outcome, or how much.

**Key Features:**
- **Fully Private Trading** — All buy/sell/redeem use private records. Buy inputs (market, outcome, amount, shares) are ZK-encrypted on-chain
- **Tri-Token Support** — Markets in **ALEO** (native), **USDCX**, or **USAD** stablecoins — all with private transfers
- **Multi-Outcome Markets** — Support 2, 3, or 4 outcome markets (Yes/No, Multi-choice)
- **FPMM AMM** — Constant product invariant with per-trade fees (0.5% protocol + 0.5% creator + 1% LP = 2% total)
- **Multi-Voter Quorum Resolution** — Minimum 3 independent voters with ALEO bond, dispute window, slashing for wrong voters
- **Dispute Mechanism** — Challenge voter majority with 3× bond. Disputer's outcome overrides if successful
- **ALEO Staking Governance** — Proposals, voting, delegation, resolver registry via `veiled_governance_v4.aleo`
- **Multi-Sig Treasury** — 3-of-N multisig for protocol fund withdrawals
- **Encrypted Storage** — Supabase with AES-256-GCM client-side encryption for cross-device bet sync
- **IPFS Metadata** — Market metadata stored on IPFS via Pinata

## Deployed Contracts

| Contract | Program ID | Transitions | Purpose |
|----------|-----------|-------------|---------|
| **Main** | [`veiled_markets_v35.aleo`](https://testnet.explorer.provable.com/program/veiled_markets_v35.aleo) | 22/31 | ALEO markets, Multi-Voter resolution, multisig treasury |
| **USDCX** | [`veiled_markets_usdcx_v5.aleo`](https://testnet.explorer.provable.com/program/veiled_markets_usdcx_v5.aleo) | 22/31 | USDCX stablecoin markets (private Token + MerkleProof) |
| **USAD** | [`veiled_markets_usad_v12.aleo`](https://testnet.explorer.provable.com/program/veiled_markets_usad_v12.aleo) | 22/31 | USAD stablecoin markets (private Token + MerkleProof) |
| **Governance** | [`veiled_governance_v4.aleo`](https://testnet.explorer.provable.com/program/veiled_governance_v4.aleo) | 29/31 | Proposals, voting, delegation, resolver registry, treasury |

**Dependencies:** `credits.aleo`, `test_usdcx_stablecoin.aleo`, `test_usad_stablecoin.aleo`, `merkle_tree.aleo`

> **Architecture:** Each token type has its own market contract due to snarkVM's 31-transition limit. All three market contracts share identical structs, mappings, constants, and resolution logic. The frontend routes transactions automatically — users see a unified experience.

## Market Resolution: Multi-Voter Quorum + Dispute

Unlike traditional prediction markets with single resolvers, Veiled Markets uses a **decentralized multi-voter quorum system**:

```
Market Deadline Passes → close_market → CLOSED
        ↓
Anyone: vote_outcome(outcome, 1 ALEO bond) → PENDING_RESOLUTION
        ↓ (min 3 voters required)
Anyone: finalize_votes() → tally winner → PENDING_FINALIZATION
        ↓
Dispute Window (12 hours / 2880 blocks)
        ↓
┌─── No dispute ───────────────────────────────────┐
│ confirm_resolution() → RESOLVED                  │
│ Winners: bond back + share of loser bonds         │
│ Losers: bond SLASHED (forfeited)                  │
│ Resolver reward: 20% of protocol fees             │
└──────────────────────────────────────────────────┘
        ↓ OR
┌─── Dispute filed ────────────────────────────────┐
│ dispute_resolution(different_outcome, 3× bond)   │
│ → Override winning outcome → RESOLVED            │
│ Disputer pays 3× total voter bonds as guarantee  │
└──────────────────────────────────────────────────┘
```

**7 Resolution Transitions** (identical across all 3 market contracts):

| Transition | Function |
|-----------|----------|
| `vote_outcome` | Anyone votes with 1 ALEO bond (1 vote per address per market) |
| `finalize_votes` | Tally votes (requires ≥3 voters + voting window passed) |
| `confirm_resolution` | Finalize after dispute window (no dispute) |
| `dispute_resolution` | Challenge with 3× total bonds — override outcome |
| `claim_voter_bond` | Winners claim bond back; losers get nothing (slashed) |
| `claim_dispute_bond` | Disputer claims bond back if their outcome won |
| `claim_voter_reward` | Claim accumulated protocol fee rewards |

## Architecture

```
┌──────────────────┐     ┌───────────────────────┐     ┌──────────────────────────────┐
│   Frontend       │────▶│   Shield Wallet       │────▶│   Aleo Testnet                │
│   React 18/Vite  │     │  (ProvableHQ adapter) │     │                              │
│   TypeScript     │     │                       │     │  veiled_markets_v35.aleo      │
│   Tailwind CSS   │     │  recordIndices hint   │     │  └─ ALEO markets (22 trans)   │
│   Recharts       │     │  for Token records    │     │                              │
│                  │     └───────────────────────┘     │  veiled_markets_usdcx_v5.aleo │
│  Pages:          │                                   │  └─ USDCX markets (22 trans)  │
│  - Landing       │     ┌───────────────────────┐     │                              │
│  - Dashboard     │────▶│  Supabase (encrypted) │     │  veiled_markets_usad_v12.aleo │
│  - MarketDetail  │     │  Bet sync + registry  │     │  └─ USAD markets (22 trans)   │
│  - Portfolio     │     └───────────────────────┘     │                              │
│  - Governance    │                                   │  veiled_governance_v4.aleo    │
│  - Create Market │     ┌───────────────────────┐     │  └─ Governance (29 trans)     │
│                  │────▶│  IPFS (Pinata)        │     │                              │
│                  │     │  Market metadata      │     │  Dependencies:               │
│                  │     └───────────────────────┘     │  ├─ credits.aleo             │
│                  │                                   │  ├─ test_usdcx_stablecoin    │
│                  │                                   │  ├─ test_usad_stablecoin     │
│                  │                                   │  └─ merkle_tree.aleo         │
└──────────────────┘                                   └──────────────────────────────┘
```

## Project Structure

```
veiled-markets/
├── contracts/              # Main Leo contract (ALEO only, 22 transitions)
├── contracts-usdcx/        # USDCX Leo contract (22 transitions, private Token + MerkleProof)
├── contracts-usad/         # USAD Leo contract (22 transitions, private Token + MerkleProof)
├── contracts-governance/   # Governance contract (29 transitions)
├── frontend/               # React dashboard + landing page
│   ├── src/
│   │   ├── components/     # UI components
│   │   ├── hooks/          # React hooks (transactions, governance, ticker)
│   │   ├── lib/            # Business logic (aleo-client, AMM math, stores, crypto)
│   │   ├── pages/          # Route pages (Dashboard, MarketDetail, Portfolio, etc.)
│   │   ├── styles/         # Global CSS
│   │   └── workers/        # Web workers (ZK prover, SDK)
│   └── public/
├── backend/                # Blockchain indexer service
├── sdk/                    # TypeScript SDK (@veiled-markets/sdk)
├── supabase/               # Database schemas
└── docs/                   # Architecture documentation
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

### Market Contracts (v35 / usdcx_v5 / usad_v12 — 22 transitions each)

**Trading (Private):**
`create_market` · `buy_shares_private` · `sell_shares` · `add_liquidity`

**Resolution (Multi-Voter Quorum + Dispute):**
`vote_outcome` · `finalize_votes` · `confirm_resolution` · `dispute_resolution` · `claim_voter_bond` · `claim_dispute_bond` · `claim_voter_reward`

**Lifecycle:**
`close_market` · `cancel_market`

**Redemption:**
`redeem_shares` · `claim_refund` · `claim_lp_refund` · `withdraw_lp_resolved` · `withdraw_creator_fees`

**Treasury (Multisig):**
`init_multisig` · `propose_treasury_withdrawal` · `approve_proposal` · `execute_proposal`

### Governance Contract (v4 — 29 transitions)

**Proposals:** `create_proposal` · `vote_for` · `vote_against` · `finalize_vote` · `execute_governance` · `veto_proposal` · `unlock_after_vote`

**Delegation:** `delegate_votes` · `undelegate_votes`

**Resolver Registry:** `register_resolver` · `unstake_resolver` · `upgrade_resolver_tier` · `slash_resolver` · `blacklist_resolver` · `update_resolver_stats`

**Committee:** `set_committee_members` · `assign_resolver_panel` · `panel_vote` · `committee_vote_resolve` · `finalize_committee_vote` · `escalate_to_community` · `governance_resolve` · `initiate_escalation`

**Rewards & Treasury:** `fund_reward_epoch` · `record_contribution` · `claim_reward` · `init_governance` · `deposit_protocol_fees` · `execute_treasury_proposal`

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

### Environment Variables

```env
# Network
VITE_NETWORK=testnet
VITE_ALEO_RPC_URL=https://api.explorer.provable.com/v1/testnet

# Contracts
VITE_PROGRAM_ID=veiled_markets_v35.aleo
VITE_USDCX_MARKET_PROGRAM_ID=veiled_markets_usdcx_v5.aleo
VITE_USAD_PROGRAM_ID=veiled_markets_usad_v12.aleo
VITE_USDCX_PROGRAM_ID=test_usdcx_stablecoin.aleo
VITE_GOVERNANCE_PROGRAM_ID=veiled_governance_v4.aleo

# Supabase + IPFS
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_PINATA_JWT=your-pinata-jwt
```

### Build & Deploy Contracts

```bash
# Main contract (ALEO only — no MerkleProof patch needed)
cd contracts && leo deploy --network testnet --yes --broadcast

# USDCX contract (requires MerkleProof patch for Shield Wallet)
cd ../contracts-usdcx && leo build
# Add local MerkleProof struct + unqualify reference in build/main.aleo
snarkos developer deploy veiled_markets_usdcx_v5.aleo --path build --network 1 --broadcast

# USAD contract (same patch process)
cd ../contracts-usad && leo build
# Patch build/main.aleo, then:
snarkos developer deploy veiled_markets_usad_v12.aleo --path build --network 1 --broadcast
```

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

## Wave 3 → Wave 4 Improvements

| Aspect | Wave 3 | Wave 4 |
|--------|--------|--------|
| **Resolution** | Single designated resolver | Multi-Voter Quorum (3+ voters with bonds) |
| **Dispute** | 1× bond, single challenger | 3× bond dispute + slashing |
| **Governance** | Not implemented | 29-transition contract deployed |
| **Token** | Dual (ALEO + USDCX in 1 contract) | Tri-token, each in separate contract |
| **Deployer control** | Resolver whitelist, admin gates | Only `init_multisig` (one-time setup) |
| **Contract budget** | 31/31 (at limit) | 22/31 per contract (9 slots free) |
| **Portfolio** | Card list | Table layout with Performance chart |

## Contributing

1. Fork the repo
2. Create feature branch (`git checkout -b feature/name`)
3. Commit changes and open Pull Request

## License

MIT License — see [LICENSE](./LICENSE)

---

<div align="center">

**Built on Aleo**

[Live Demo](https://veiledmarkets.xyz) · [Main Contract](https://testnet.explorer.provable.com/program/veiled_markets_v35.aleo) · [USDCX Contract](https://testnet.explorer.provable.com/program/veiled_markets_usdcx_v5.aleo) · [USAD Contract](https://testnet.explorer.provable.com/program/veiled_markets_usad_v12.aleo) · [Governance](https://testnet.explorer.provable.com/program/veiled_governance_v4.aleo)

</div>
