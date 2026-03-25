# Veiled Markets

<div align="center">

<img src="./logo-veiled-markets.png" alt="Veiled Markets Logo" width="200"/>

### **Predict Freely. Bet Privately.**

Privacy-preserving prediction market with FPMM AMM on Aleo blockchain

[![Live Demo](https://img.shields.io/badge/Live-Demo-00D4AA?style=for-the-badge)](https://veiledmarkets.xyz)
[![Aleo](https://img.shields.io/badge/Aleo-Testnet-00D4AA?style=for-the-badge)](https://testnet.explorer.provable.com/program/veiled_markets_v32.aleo)
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
- **On-Chain Governance** — Proposal creation, voting, delegation via `veiled_governance_v4.aleo`
- **Encrypted Storage** — Supabase with AES-256-GCM client-side encryption for cross-device bet sync
- **IPFS Metadata** — Market metadata (question, description, resolution source) stored on IPFS via Pinata

## Deployed Contracts

| Contract | Program ID | Transitions | Purpose |
|----------|-----------|-------------|---------|
| **Main** | `veiled_markets_v32.aleo` | 31 | ALEO + USDCX markets, lifecycle, dispute, multisig, resolver |
| **USAD** | `veiled_markets_usad_v8.aleo` | 19 | Fully functional USAD stablecoin markets (separate program — same features as main, split due to snarkVM 31-transition limit) |
| **Governance** | `veiled_governance_v4.aleo` | — | On-chain governance target in this repo (public deployment may still be on an older version until rollout) |

**Dependencies:** `credits.aleo`, `test_usdcx_stablecoin.aleo`, `test_usad_stablecoin.aleo`, `merkle_tree.aleo`

> **Note:** All three token types (ALEO, USDCX, USAD) are fully functional with identical features. USAD lives in a separate program because the main contract hit snarkVM's 31-transition limit. The frontend routes transactions automatically based on token type — users see a unified experience.

## Architecture

```
┌──────────────────┐     ┌───────────────────────┐     ┌──────────────────────────┐
│   Frontend       │────▶│   Shield Wallet       │────▶│   Aleo Testnet           │
│   React 18/Vite  │     │  (ProvableHQ adapter) │     │                          │
│   TypeScript     │     │                       │     │  veiled_markets_v32.aleo  │
│   Tailwind CSS   │     │  recordIndices hint   │     │  ├─ ALEO markets         │
│   Framer Motion  │     │  for Token records    │     │  └─ USDCX markets        │
│                  │     └───────────────────────┘     │                          │
│  Pages:          │                                   │  veiled_markets_usad_    │
│  - Landing       │     ┌───────────────────────┐     │  v8.aleo                 │
│  - Dashboard     │────▶│  Supabase (encrypted) │     │  └─ USAD markets         │
│  - MarketDetail  │     │  Bet sync + registry  │     │                          │
│  - Portfolio     │     └───────────────────────┘     │  veiled_governance_      │
│  - Governance    │                                   │  v4.aleo                 │
│  - Create Market │     ┌───────────────────────┐     │  └─ Proposals & voting   │
│  - History       │────▶│  IPFS (Pinata)        │     │                          │
│  - Settings      │     │  Market metadata      │     │  Dependencies:           │
│                  │     └───────────────────────┘     │  ├─ credits.aleo         │
│  Landing:        │                                   │  ├─ test_usdcx_stable..  │
│  - Hero + Cards  │                                   │  ├─ test_usad_stable..   │
│  - Trending      │                                   │  └─ merkle_tree.aleo     │
│  - How It Works  │                                   └──────────────────────────┘
│  - CTA           │
└──────────────────┘
```

## Project Structure

```
veiled-markets/
├── contracts/              # Main Leo contract (ALEO + USDCX, 31 transitions)
├── contracts-usad/         # USAD Leo contract (19 transitions, separate program)
├── contracts-governance/   # Governance contract (proposals, voting, delegation)
├── frontend/               # React dashboard + landing page (Vite, TypeScript, Tailwind)
│   ├── src/
│   │   ├── components/     # UI components
│   │   │   ├── MarketCard.tsx          # Transparent market card (binary + multi-outcome)
│   │   │   ├── MarketRow.tsx           # List-view market row
│   │   │   ├── TrendingMarkets.tsx     # Landing page trending section (real blockchain data)
│   │   │   ├── BettingModal.tsx        # Place bets modal with AMM preview
│   │   │   ├── BuySharesModal.tsx      # Buy shares with slippage protection
│   │   │   ├── SellSharesModal.tsx     # Sell shares back to AMM
│   │   │   ├── ClaimWinningsModal.tsx  # Redeem winning shares
│   │   │   ├── CreateMarketModal.tsx   # Create new markets (2-4 outcomes)
│   │   │   ├── TradingPanel.tsx        # Market detail trading interface
│   │   │   ├── LiquidityPanel.tsx      # Add/view LP positions
│   │   │   ├── ResolvePanel.tsx        # Market resolution interface
│   │   │   ├── DisputePanel.tsx        # Dispute resolution with bond
│   │   │   ├── AdminPanel.tsx          # Admin controls (multisig, treasury)
│   │   │   ├── DashboardHero.tsx       # Dashboard hero with portfolio summary
│   │   │   ├── DashboardHeader.tsx     # Nav bar with wallet connect
│   │   │   ├── CryptoPriceChart.tsx    # Live crypto price charts
│   │   │   ├── CryptoTickerStrip.tsx   # Scrolling price ticker
│   │   │   ├── OddsChart.tsx           # Market odds history chart
│   │   │   ├── ProbabilityChart.tsx    # Probability visualization
│   │   │   ├── WalletBridge.tsx        # Wallet adapter bridge
│   │   │   ├── governance/             # Governance UI (proposals, voting, delegation)
│   │   │   └── ui/                     # Shared UI primitives (StatusBadge, Tooltip)
│   │   ├── hooks/
│   │   │   ├── useAleoTransaction.ts   # Transaction execution (recordIndices support)
│   │   │   ├── useGlobalTicker.ts      # Global 1s interval for live countdowns
│   │   │   ├── useGovernance.ts        # Governance actions hook
│   │   │   ├── useAleoProver.ts        # ZK proof generation
│   │   │   └── useSDKTransaction.ts    # ProvableHQ SDK transactions
│   │   ├── lib/
│   │   │   ├── aleo-client.ts          # Blockchain RPC client (market fetch, scan, cache)
│   │   │   ├── amm.ts                  # FPMM math (buy/sell/price calculations)
│   │   │   ├── market-store.ts         # Real blockchain market store (Zustand)
│   │   │   ├── store.ts                # App state (wallet, bets, positions)
│   │   │   ├── wallet.ts               # Wallet management (balances, records)
│   │   │   ├── supabase.ts             # Encrypted bet sync + market registry
│   │   │   ├── ipfs.ts                 # IPFS metadata storage (Pinata)
│   │   │   ├── crypto.ts               # AES-256-GCM encryption
│   │   │   ├── price-history.ts        # Price snapshot recording for charts
│   │   │   ├── market-thumbnails.ts    # Smart thumbnail resolver (keyword → image)
│   │   │   ├── governance-client.ts    # Governance contract client
│   │   │   ├── governance-store.ts     # Governance state store
│   │   │   ├── credits-record.ts       # Credits record finder
│   │   │   ├── private-stablecoin.ts   # USDCX/USAD token record handling
│   │   │   ├── record-scanner.ts       # Record scanning utilities
│   │   │   └── config.ts               # Environment config
│   │   ├── pages/
│   │   │   ├── Landing.tsx             # Public landing page (hero, trending, features)
│   │   │   ├── Dashboard.tsx           # Main market explorer (grid/list, filters, search)
│   │   │   ├── MarketDetail.tsx        # Single market (trade, chart, liquidity, resolve)
│   │   │   ├── MyBets.tsx              # Portfolio positions & P/L
│   │   │   ├── History.tsx             # Transaction history
│   │   │   ├── Governance.tsx          # Governance proposals & voting
│   │   │   ├── CreateMarket.tsx        # Create market page
│   │   │   ├── Settings.tsx            # User settings
│   │   │   ├── HowItWorks.tsx          # How it works explainer
│   │   │   ├── FAQ.tsx                 # Frequently asked questions
│   │   │   ├── APIDocs.tsx             # API documentation
│   │   │   ├── BrandKit.tsx            # Brand assets
│   │   │   ├── BugBounty.tsx           # Bug bounty program
│   │   │   ├── TermsOfService.tsx      # Legal: Terms
│   │   │   ├── PrivacyPolicy.tsx       # Legal: Privacy
│   │   │   ├── RiskDisclosure.tsx      # Legal: Risk
│   │   │   └── CookiesPolicy.tsx       # Legal: Cookies
│   │   ├── styles/
│   │   │   └── globals.css             # Global styles (transparent cards, animations)
│   │   └── workers/
│   │       ├── aleo-prover.ts          # ZK prover web worker
│   │       └── aleo-sdk.worker.ts      # Aleo SDK web worker
│   └── public/
│       ├── markets-index.json          # Market registry index
│       └── wallets/                    # Wallet icons
├── backend/                # Blockchain indexer service
├── sdk/                    # TypeScript SDK (@veiled-markets/sdk)
├── scripts/                # Deployment & utility scripts
├── docs/                   # Architecture documentation
├── supabase-schema.sql     # Database schema (bets, registry)
└── supabase-governance-schema.sql  # Governance database schema
```

## Frontend Design

The frontend features a premium dark theme with a unified visual language across all pages:

- **Transparent Market Cards** — Cards use no background fill; only a subtle `1px` border (`rgba(255,255,255,0.04)`) separates them from the page. On hover, the border brightens and a category-colored radial glow appears
- **Unified Background** — Both Landing and Dashboard share the same premium background: mesh gradient (gold/green radials), 64px grid pattern, accent glow, diagonal gold lines, and noise texture
- **Real Blockchain Data** — Landing page hero and trending sections display live market data fetched from the deployed contract via `useRealMarketsStore`, not mock data
- **Live Countdowns** — All market deadlines use a single global 1-second ticker (`useGlobalTicker`) for efficient updates across hundreds of cards
- **Smart Thumbnails** — Markets auto-resolve relevant thumbnails based on question keywords (crypto logos from CoinGecko, sports/politics/tech images from Unsplash)
- **Multi-Outcome Support** — Cards render 2-outcome (Yes/No bars) and 3-4 outcome layouts (chips + segmented bar) with distinct colors
- **Multi-Token Display** — Volume shows in the correct token (ALEO, USDCX, or USAD)

### Landing Page Sections

| Section | Description |
|---------|------------|
| **Hero** | Headline + featured market card (largest volume) + 2 compact cards below |
| **Features** | Privacy-first architecture bento grid (Hidden Positions, MEV Protected, Anonymous Trading) |
| **Trending Markets** | 6 live market cards from blockchain, sorted by volume |
| **How It Works** | 4-step flow (Connect → Browse → Bet → Claim) |
| **CTA** | Final call-to-action with wallet connect |

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

### Main Contract (v31 — 31 transitions)

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

Veiled Markets uses **Shield Wallet** as the primary wallet (with support for Puzzle, Leo, Fox, and Soter via ProvableHQ adapter). Key integration details:

- **`recordIndices`** — Shield Wallet requires a `recordIndices` hint in `executeTransaction()` to identify which input indices are record types (e.g., `recordIndices: [6]` for Token record at index 6)
- **MerkleProof Compatibility** — Contracts use locally-defined `MerkleProof` struct (NullPay pattern) to avoid qualified type names `[program.aleo/MerkleProof; N]` that Shield Wallet's parser cannot handle
- **Token Record Format** — Frontend validates Token records are in Leo plaintext format (not JSON) before passing to Shield Wallet

## Quick Start

```bash
git clone https://github.com/AkindoHQ/aleo-akindo.git
cd aleo-akindo/veiled-markets/frontend
npm install --legacy-peer-deps
cp .env.example .env
# Edit .env with your Supabase and Pinata keys
npm run dev
# Open http://localhost:5173
```

**Wallet:** Install [Shield Wallet](https://shieldwallet.io/), switch to Testnet, get credits from [Aleo Faucet](https://faucet.aleo.org).

### Environment Variables

```env
# Network
VITE_NETWORK=testnet
VITE_ALEO_RPC_URL=https://api.explorer.provable.com/v1/testnet
VITE_EXPLORER_URL=https://testnet.explorer.provable.com

# Contracts
VITE_PROGRAM_ID=veiled_markets_v32.aleo
VITE_USAD_PROGRAM_ID=veiled_markets_usad_v8.aleo
VITE_USDCX_PROGRAM_ID=test_usdcx_stablecoin.aleo
VITE_GOVERNANCE_PROGRAM_ID=veiled_governance_v4.aleo

# Supabase (cross-device bet sync + market registry)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# IPFS (market metadata storage)
VITE_PINATA_JWT=your-pinata-jwt
```

See [`.env.example`](./frontend/.env.example) for all available configuration options including feature flags and debug settings.

### Build & Deploy Contracts

```bash
# Main contract (ALEO + USDCX)
cd contracts && leo build
# Patch MerkleProof for Shield Wallet compatibility
sed -i 's/test_usdcx_stablecoin\.aleo\/MerkleProof/MerkleProof/g' build/main.aleo
snarkos developer deploy veiled_markets_v32.aleo --path build --network 1 --broadcast

# USAD contract (separate program)
cd ../contracts-usad && leo build
sed -i 's/test_usad_stablecoin\.aleo\/MerkleProof/MerkleProof/g' build/main.aleo
snarkos developer deploy veiled_markets_usad_v8.aleo --path build --network 1 --broadcast
```

### Deploy Frontend

```bash
# Build for production
cd frontend && npm run build

# Deploy to Vercel (configured via vercel.json)
vercel --prod
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Contract** | Leo (Aleo), snarkVM, snarkOS |
| **Frontend** | React 18, TypeScript, Vite 5, Tailwind CSS 3, Framer Motion |
| **State** | Zustand (real blockchain store + app state) |
| **Charts** | Recharts |
| **Wallet** | ProvableHQ Aleo Wallet Adapter (Shield, Puzzle, Leo, Fox, Soter) |
| **Persistence** | Supabase (AES-256-GCM encrypted) + localStorage |
| **Metadata** | IPFS via Pinata |
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

[Live Demo](https://veiledmarkets.xyz) · [Main Contract](https://testnet.explorer.provable.com/program/veiled_markets_v32.aleo) · [USAD Contract](https://testnet.explorer.provable.com/program/veiled_markets_usad_v8.aleo) · [Governance Target](https://testnet.explorer.provable.com/program/veiled_governance_v4.aleo)

</div>
