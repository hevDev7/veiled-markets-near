# Veiled Markets

<div align="center">

<img src="./logo-veiled-markets.png" alt="Veiled Markets Logo" width="200"/>

### **Predict Freely. Bet Privately.**

Privacy-preserving prediction market with FPMM AMM on Aleo blockchain

[![Live Demo](https://img.shields.io/badge/Live-Demo-00D4AA?style=for-the-badge)](https://veiledmarkets.xyz)
[![Aleo](https://img.shields.io/badge/Aleo-Testnet-00D4AA?style=for-the-badge)](https://testnet.explorer.provable.com/program/veiled_markets_v30.aleo)
[![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](./LICENSE)

</div>

---

## Overview

Veiled Markets is a prediction market protocol on Aleo where users trade outcome shares with **full privacy**. Uses a Gnosis-style **Fixed Product Market Maker (FPMM)** with complete-set minting/burning. All buy transactions are fully private — no one can see who bet on what, which outcome, or how much.

**Key features:**
- **Fully Private Trading** — All buy/sell/redeem use private records. Buy inputs (market, outcome, amount, shares) are ZK-encrypted on-chain
- **Tri-Token Support** — Markets in **ALEO** (native token), **USDCX**, or **USAD** stablecoins — all with private transfers
- **FPMM AMM** — Constant product invariant, 2/3/4 outcome markets, per-trade fees (2% total)
- **LP Provision** — Add liquidity, earn 1% LP fees per trade. LP locked until market resolves/cancels
- **Market Resolution** — 3-step on-chain flow (close → resolve → finalize) with dispute mechanism and challenge window
- **Resolver System** — On-chain resolver whitelist with 20% fee allocation from protocol fees
- **Multi-Sig Treasury** — 2-of-3 multisig for protocol fund withdrawals (ALEO + USDCX)
- **Encrypted Storage** — Supabase with AES-256-GCM client-side encryption for cross-device bet sync

## Deployed Contracts

| Contract | Program ID | Transitions | Purpose |
|----------|-----------|-------------|---------|
| **Main** | `veiled_markets_v30.aleo` | 31 | ALEO + USDCX markets, lifecycle, dispute, multisig, resolver |
| **USAD** | `veiled_markets_usad_v8.aleo` | 19 | USAD stablecoin markets (separate due to 31-transition limit) |
| **Governance** | `veiled_governance_v3.aleo` | — | On-chain governance |

**Dependencies:** `credits.aleo`, `test_usdcx_stablecoin.aleo`, `test_usad_stablecoin.aleo`, `merkle_tree.aleo`

## Architecture

```
┌──────────────┐     ┌───────────────────────┐     ┌──────────────────────────┐
│   Frontend   │────▶│   Shield Wallet       │────▶│   Aleo Testnet           │
│  React/Vite  │     │  (ProvableHQ adapter) │     │                          │
│  TypeScript  │     │                       │     │  veiled_markets_v30.aleo  │
│              │     │  recordIndices hint   │     │  ├─ ALEO markets         │
│  Components: │     │  for Token records    │     │  └─ USDCX markets        │
│  - Dashboard │     └───────────────────────┘     │                          │
│  - Market    │                                   │  veiled_markets_usad_     │
│  - My Bets   │     ┌───────────────────────┐     │  v8.aleo                 │
│  - Resolve   │────▶│  Supabase (encrypted) │     │  └─ USAD markets         │
│  - Admin     │     │  Bet sync + registry  │     │                          │
└──────────────┘     └───────────────────────┘     │  Dependencies:           │
                                                   │  ├─ credits.aleo         │
                                                   │  ├─ test_usdcx_stable..  │
                                                   │  ├─ test_usad_stable..   │
                                                   │  └─ merkle_tree.aleo     │
                                                   └──────────────────────────┘
```

```
veiled-markets/
├── contracts/          # Main Leo contract (ALEO + USDCX, 31 transitions)
├── contracts-usad/     # USAD Leo contract (19 transitions, separate program)
├── contracts-governance/ # Governance contract
├── frontend/           # React dashboard (Vite, TypeScript, Tailwind)
│   ├── src/components/ # Trading UI, wallet bridge, modals, panels
│   ├── src/hooks/      # useAleoTransaction (recordIndices support)
│   ├── src/lib/        # AMM math, blockchain client, private-stablecoin, stores
│   └── src/pages/      # Dashboard, MarketDetail, MyBets, History, Settings
├── backend/            # Blockchain indexer
├── sdk/                # TypeScript SDK (@veiled-markets/sdk)
└── docs/               # Architecture documentation
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
| Market creation, resolution | Public |
| Transaction fee payer | Public (Aleo protocol requirement) |

### On-Chain Transaction Example (USAD Buy)

```
Transition 0: test_usad_stablecoin.aleo/transfer_private_to_public
  Input 0: public   → program address (recipient)
  Input 1: public   → amount
  Input 2: record   → Token record (encrypted)
  Input 3: private  → MerkleProof (encrypted)

Transition 1: veiled_markets_usad_v8.aleo/buy_shares_usad
  Input 0: private  → market_id (ciphertext)
  Input 1: private  → outcome (ciphertext)
  Input 2: private  → amount_in (ciphertext)
  Input 3: private  → expected_shares (ciphertext)
  Input 4: private  → min_shares_out (ciphertext)
  Input 5: private  → share_nonce (ciphertext)
  Input 6: record   → Token record (encrypted)
  Input 7: private  → MerkleProof (encrypted)
```

No observer can determine: who bet, on which market, which outcome, or how much.

## Key Transitions

### Main Contract (v30 — 31 transitions)

**Market Lifecycle:**
`create_market` / `create_market_usdcx` · `close_market` · `resolve_market` · `finalize_resolution` · `cancel_market`

**Trading (Private):**
`buy_shares_private` (ALEO, credits record) · `buy_shares_usdcx` (USDCX, Token record + MerkleProof) · `sell_shares` / `sell_shares_usdcx`

**Redemption:**
`redeem_shares` / `redeem_shares_usdcx` · `claim_refund` / `claim_refund_usdcx` · `withdraw_lp_resolved` / `withdraw_lp_resolved_usdcx` · `claim_lp_refund` / `claim_lp_refund_usdcx` · `withdraw_creator_fees` / `withdraw_fees_usdcx`

**Liquidity:**
`add_liquidity` / `add_liquidity_usdcx`

**Dispute:**
`dispute_resolution` · `claim_dispute_bond`

**Governance:**
`init_multisig` · `propose_treasury_withdrawal` · `approve_proposal` · `execute_proposal` / `exec_proposal_usdcx`

**Resolver:**
`set_resolver_status` · `claim_resolver_fee`

### USAD Contract (v8 — 19 transitions)

`create_market_usad` · `buy_shares_usad` (Token record + MerkleProof, fully private) · `sell_shares_usad` · `add_liquidity_usad` · `close_market` · `resolve_market` · `finalize_resolution` · `cancel_market` · `dispute_resolution` · `claim_dispute_bond` · `redeem_shares_usad` · `claim_refund_usad` · `claim_lp_refund_usad` · `withdraw_lp_resolved_usad` · `withdraw_fees_usad` · `init_multisig` · `propose_treasury_withdrawal` · `approve_proposal` · `exec_proposal_usad`

## FPMM Model

| | Formula |
|---|---|
| **Buy** | `shares_out = (r_i + a) - r_i * prod(r_k / (r_k + a))` for active k != i |
| **Sell** | `shares_needed = r_i_new - r_i + pool_out` where `r_i_new = r_i * prod(r_k / (r_k - p))` |
| **Redeem** | Winning shares 1:1 against collateral, losing shares = 0 |
| **Fees** | 0.5% protocol + 0.5% creator + 1% LP = **2% total** |

Frontend pre-computes `expected_shares` using the same FPMM formula; the on-chain record stores this value; finalize validates `shares_out >= expected_shares`.

## Shield Wallet Integration

Veiled Markets uses **Shield Wallet** as the primary wallet. Key integration details:

- **`recordIndices`** — Shield Wallet requires a `recordIndices` hint in `executeTransaction()` to identify which input indices are record types (e.g., `recordIndices: [6]` for Token record at index 6)
- **MerkleProof Compatibility** — Contracts use locally-defined `MerkleProof` struct (NullPay pattern) to avoid qualified type names `[program.aleo/MerkleProof; N]` that Shield Wallet's parser cannot handle
- **Token Record Format** — Frontend validates Token records are in Leo plaintext format (not JSON) before passing to Shield Wallet

## Quick Start

```bash
git clone https://github.com/AkindoHQ/aleo-akindo.git
cd aleo-akindo/veiled-markets/frontend
pnpm install
cp .env.example .env
pnpm dev
# Open http://localhost:3001
```

**Wallet:** Install [Shield Wallet](https://shieldwallet.io/), switch to Testnet, get credits from [Aleo Faucet](https://faucet.aleo.org).

### Environment Variables

```env
VITE_NETWORK=testnet
VITE_ALEO_RPC_URL=https://api.explorer.provable.com/v1/testnet
VITE_EXPLORER_URL=https://testnet.explorer.provable.com
VITE_PROGRAM_ID=veiled_markets_v30.aleo
VITE_USAD_PROGRAM_ID=veiled_markets_usad_v8.aleo
VITE_USDCX_PROGRAM_ID=test_usdcx_stablecoin.aleo
VITE_GOVERNANCE_PROGRAM_ID=veiled_governance_v3.aleo
```

### Build & Deploy Contracts

```bash
# Main contract (ALEO + USDCX)
cd contracts && leo build
# Patch MerkleProof for Shield Wallet compatibility
sed -i 's/test_usdcx_stablecoin\.aleo\/MerkleProof/MerkleProof/g' build/main.aleo
# Add local MerkleProof struct to build/main.aleo (after last struct definition)
snarkos developer deploy veiled_markets_v30.aleo --path build --network 1 --broadcast

# USAD contract (separate program)
cd ../contracts-usad && leo build
# Same MerkleProof patching for USAD
sed -i 's/test_usad_stablecoin\.aleo\/MerkleProof/MerkleProof/g' build/main.aleo
snarkos developer deploy veiled_markets_usad_v8.aleo --path build --network 1 --broadcast
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Contract** | Leo (Aleo), snarkVM, snarkOS |
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, Framer Motion |
| **State** | Zustand |
| **Charts** | Recharts |
| **Wallet** | ProvableHQ Aleo Wallet Adapter (Shield, Puzzle, Leo, Fox, Soter) |
| **Persistence** | Supabase (AES-256-GCM encrypted) + localStorage |
| **Hosting** | Vercel |

## Contributing

1. Fork the repo
2. Create feature branch (`git checkout -b feature/name`)
3. Commit changes and open Pull Request

## License

MIT License - see [LICENSE](./LICENSE)

---

<div align="center">

**Built on Aleo**

[Live Demo](https://veiledmarkets.xyz) · [Main Contract](https://testnet.explorer.provable.com/program/veiled_markets_v30.aleo) · [USAD Contract](https://testnet.explorer.provable.com/program/veiled_markets_usad_v8.aleo)

</div>
