# Veiled Markets

<div align="center">

<img src="./logo-veiled-markets.png" alt="Veiled Markets Logo" width="200"/>

### **Predict Freely. Trade Privately.**

Privacy-preserving prediction market with FPMM AMM on Aleo blockchain

[![Live Demo](https://img.shields.io/badge/Live-Demo-00D4AA?style=for-the-badge)](https://veiledmarkets.xyz)
[![Aleo](https://img.shields.io/badge/Aleo-Testnet-00D4AA?style=for-the-badge)](https://testnet.explorer.provable.com/program/veiled_markets_v18.aleo)
[![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](./LICENSE)

</div>

---

## Overview

Veiled Markets is a prediction market protocol on Aleo where users trade outcome shares with full privacy. Uses a Gnosis-style **Fixed Product Market Maker (FPMM)** with complete-set minting/burning.

**Key features:**
- **Private Trading** — Buys use `transfer_private_to_public`, sells/payouts use `transfer_public_to_private`
- **FPMM AMM** — Constant product invariant, 2/3/4 outcome markets, per-trade fees (2% total)
- **Dual Token** — Markets in ALEO (fully private) or USDCX stablecoin
- **LP Provision** — Add/remove liquidity, earn 1% LP fees per trade
- **Market Resolution** — 3-step on-chain flow (close → resolve → finalize) with dispute mechanism
- **Encrypted Storage** — Supabase with AES-256-GCM client-side encryption for cross-device bet sync

## Contract

| Field | Value |
|---|---|
| **Program** | `veiled_markets_v18.aleo` |
| **Network** | Aleo Testnet |
| **Transitions** | 30 (29 Leo + 1 injected) |
| **Deploy TX** | [`at1xkr8v408ct8dql2d7ngqxghzx6j4lfwf8x5dturth53mc6cycuzsqd7klu`](https://testnet.explorer.provable.com/transaction/at1xkr8v408ct8dql2d7ngqxghzx6j4lfwf8x5dturth53mc6cycuzsqd7klu) |
| **Dependencies** | `credits.aleo`, `test_usdcx_stablecoin.aleo` |

## Architecture

```
┌──────────────┐     ┌───────────────────────┐     ┌──────────────────┐
│   Frontend   │────▶│   Shield / Leo /      │────▶│   Aleo Testnet   │
│  React/Vite  │     │   Puzzle Wallet       │     │                  │
│  TypeScript  │     │  (ProvableHQ adapter) │     │  veiled_markets  │
│              │     └───────────────────────┘     │  _v18.aleo       │
│  Components: │                                   │                  │
│  - Dashboard │     ┌───────────────────────┐     │  Dependencies:   │
│  - Market    │────▶│  Supabase (encrypted) │     │  - credits.aleo  │
│  - My Bets   │     │  Bet sync + registry  │     │  - test_usdcx_   │
│  - Resolve   │     └───────────────────────┘     │    stablecoin    │
└──────────────┘                                   └──────────────────┘
```

```
veiled-markets/
├── contracts/          # Leo smart contract (FPMM, LP, dispute, multi-token)
├── frontend/           # React dashboard (Vite, TypeScript, Tailwind)
│   ├── src/components/ # Trading UI, wallet bridge, modals, panels
│   ├── src/hooks/      # useAleoTransaction, useSDKTransaction
│   ├── src/lib/        # AMM math, blockchain client, Zustand stores
│   └── src/pages/      # Dashboard, MarketDetail, MyBets, History, Settings
├── backend/            # Blockchain indexer
├── sdk/                # TypeScript SDK
└── docs/               # Architecture documentation
```

## Key Transitions (30 total)

**Market Lifecycle:**
`create_market` / `create_market_usdcx` · `close_market` · `resolve_market` · `finalize_resolution` · `cancel_market`

**Trading:**
`buy_shares_private` (ALEO, private) · `buy_shares_private_usdcx`\* · `buy_shares_usdcx` · `sell_shares` / `sell_shares_usdcx` · `redeem_shares` / `redeem_shares_usdcx` · `claim_refund` / `claim_refund_usdcx`

> \*`buy_shares_private_usdcx` is written in Aleo instructions and injected post-build via `scripts/inject_private_usdcx.sh` due to Leo 3.4.0 bug ETYC0372117.

**Liquidity:**
`add_liquidity` / `add_liquidity_usdcx` · `remove_liquidity` / `remove_liq_usdcx` · `withdraw_lp_resolved` / `withdraw_lp_resolved_usdcx` · `claim_lp_refund` / `claim_lp_refund_usdcx`

**Dispute & Governance:**
`dispute_resolution` · `claim_dispute_bond` · `withdraw_creator_fees` / `withdraw_fees_usdcx` · `init_multisig` · `propose_treasury_withdrawal` · `approve_proposal` · `execute_proposal` / `exec_proposal_usdcx`

## FPMM Model

| | Formula |
|---|---|
| **Buy** | `shares_out = amount × (r_yes + r_no + amount) / (r_other + amount)` |
| **Sell** | `shares_needed = tokens_desired × (r_i + r_other - td) / (r_other - td)` |
| **Redeem** | Winning shares 1:1, losing = 0 |
| **Fees** | 0.5% protocol + 0.5% creator + 1% LP = **2% total** |

Frontend pre-computes `expected_shares`; record stores this value; finalize validates `shares_out >= expected_shares`.

## Privacy Model

| Data | Visibility |
|------|-----------|
| Market question, pool reserves, prices | Public |
| Buy amount, outcome, wallet address | **Private** (ZK-encrypted) |
| Sell payouts, redemptions, refunds | **Private** (`transfer_public_to_private`) |
| Market creation, resolution | Public |

ALEO buys use `credits.aleo/transfer_private_to_public` — observer sees tokens arrive at the program but **cannot link** them to the sender. Payouts return as private credits records.

## Quick Start

```bash
git clone https://github.com/hevDev7/veiled-markets-near.git
cd veiled-markets-near/frontend
npm install --legacy-peer-deps
cp .env.example .env
npm run dev
# Open http://localhost:3000
```

**Wallet:** Install [Shield Wallet](https://shieldwallet.io/), switch to Testnet, get credits from [Aleo Faucet](https://faucet.aleo.org).

### Environment Variables

```env
VITE_NETWORK=testnet
VITE_PROGRAM_ID=veiled_markets_v18.aleo
VITE_ALEO_RPC_URL=https://api.explorer.provable.com/v1/testnet
VITE_EXPLORER_URL=https://testnet.explorer.provable.com
VITE_USDCX_PROGRAM_ID=test_usdcx_stablecoin.aleo
```

### Build & Deploy Contract

```bash
cd contracts && leo build              # Build (29 transitions from Leo)
./scripts/inject_private_usdcx.sh      # Inject post-build transition (30 total)
snarkos developer deploy veiled_markets_v18.aleo --path build/ --network 1 --broadcast  # Deploy (~63 ALEO)
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Contract** | Leo (Aleo), snarkVM |
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS |
| **State** | Zustand |
| **Wallet** | ProvableHQ Aleo Wallet Adapter (Shield, Puzzle, Leo) |
| **Persistence** | Supabase + localStorage |
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

[Live Demo](https://veiledmarkets.xyz) · [Contract](https://testnet.explorer.provable.com/program/veiled_markets_v18.aleo) · [GitHub](https://github.com/hevDev7/veiled-markets-near)

</div>
