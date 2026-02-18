# Veiled Markets

<div align="center">

<img src="./logo-veiled-markets.png" alt="Veiled Markets Logo" width="200"/>

### **Predict Freely. Trade Privately.**

Privacy-preserving prediction market with FPMM AMM on Aleo blockchain

[![Live Demo](https://img.shields.io/badge/Live-Demo-00D4AA?style=for-the-badge)](https://veiled-markets.vercel.app)
[![Aleo](https://img.shields.io/badge/Aleo-Testnet-00D4AA?style=for-the-badge)](https://testnet.explorer.provable.com/program/veiled_markets_v14.aleo)
[![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](./LICENSE)

</div>

---

## What is Veiled Markets?

A prediction market protocol where users trade outcome shares with complete privacy. Built on Aleo's zero-knowledge blockchain with a Gnosis-style Fixed Product Market Maker (FPMM).

- **Private Trading** — Buy shares via `transfer_private_to_public` (address and amount encrypted on-chain)
- **FPMM AMM** — Complete-set minting/burning with constant product invariant
- **Multi-Outcome** — Support for 2, 3, or 4 outcome markets
- **Dual Token** — Markets in ALEO or USDCX stablecoin
- **LP Provision** — Add/remove liquidity, earn 1% LP fees per trade
- **Dispute Resolution** — On-chain dispute mechanism with bond staking

## Contract Details

| Field | Value |
|---|---|
| **Program** | `veiled_markets_v14.aleo` |
| **Network** | Aleo Testnet |
| **Deploy TX** | `at186k9d264w2s9qfd994aam2xpyda828hnsyh0aan5g25p32v5cuqqgqstv5` |
| **Transitions** | 30 |
| **Statements** | 1,974 |
| **Dependencies** | `credits.aleo`, `test_usdcx_stablecoin.aleo` |

## Architecture

```
Frontend (React + Vite + TypeScript)
    |
Shield Wallet (ProvableHQ Adapter)
    |
Smart Contract (veiled_markets_v14.aleo)
    |
Aleo Blockchain (Testnet)
```

### Monorepo Structure

```
veiled-markets/
├── contracts/             # Leo smart contract
│   └── src/main.leo       # FPMM AMM, LP, dispute, multi-token (2500+ lines)
├── frontend/              # React dashboard
│   ├── src/
│   │   ├── components/    # Trading modals, market cards, wallet bridge
│   │   ├── hooks/         # useAleoTransaction (wallet-agnostic)
│   │   ├── lib/           # AMM math, aleo-client, store, config
│   │   ├── pages/         # Dashboard, MarketDetail, Landing
│   │   └── styles/        # Tailwind + custom CSS
│   └── public/            # markets-index.json, static assets
├── backend/               # Blockchain indexer
├── sdk/                   # TypeScript SDK
└── docs/                  # Architecture documentation
```

## FPMM Trading Model

Veiled Markets uses a **Fixed Product Market Maker** (FPMM), the same model used by Gnosis and Polymarket.

### How it works

**Buy (complete-set minting):** User deposits collateral, receives shares in chosen outcome. The AMM mints a complete set of shares and sells the unwanted ones back to the pool.

```
Binary: shares_out = amount * (reserve_yes + reserve_no + amount) / (reserve_other + amount)
```

**Sell (complete-set burning):** User specifies tokens to withdraw. Contract computes shares needed from the user's outcome to burn a complete set and release collateral.

```
Binary: shares_needed = tokens_desired * (r_i + r_other - td) / (r_other - td)
```

**Redeem:** Winning shares redeem 1:1 (1 share = 1 token). Losing shares = 0.

### Fees (per trade)

| Fee | Rate | Recipient |
|-----|------|-----------|
| Protocol | 0.5% | Protocol treasury |
| Creator | 0.5% | Market creator |
| LP | 1.0% | Liquidity providers |
| **Total** | **2.0%** | |

### Implied Price

Outcome prices are derived from pool reserves:

```
price_yes = reserve_no / (reserve_yes + reserve_no)
price_no  = reserve_yes / (reserve_yes + reserve_no)
```

## Privacy Model

| Data | Visibility |
|------|-----------|
| Market question, total pool, reserves, prices | Public |
| Your trade amount and outcome position | Private (ZK-encrypted) |
| Your wallet address in buy transactions | Private (`transfer_private_to_public`) |
| Market creation, resolution | Public |

### How Privacy Works

ALEO buy shares use `buy_shares_private`, which calls `credits.aleo/transfer_private_to_public` internally. This means:

1. User provides a **private credits record** (not public balance)
2. The transfer is from private to public — observer sees tokens arrive at the program address but **cannot link** them to the sender
3. The `OutcomeShare` record is returned to the user as an encrypted record

USDCX markets use `buy_shares_usdcx` with `transfer_public_as_signer` (less private, but necessary for stablecoin mechanics).

## Key Transitions (30 total)

### Market Lifecycle
| Transition | Description |
|---|---|
| `create_market` | Create ALEO market with initial liquidity |
| `create_market_usdcx` | Create USDCX market with initial liquidity |
| `close_market` | Close betting (after deadline) |
| `resolve_market` | Resolve with winning outcome |
| `emergency_cancel` | Cancel unresolved market (past resolution deadline) |

### Trading
| Transition | Description |
|---|---|
| `buy_shares_private` | Buy shares with private credits record (ALEO) |
| `buy_shares_usdcx` | Buy shares with USDCX (public signer) |
| `sell_shares` | Sell ALEO shares (tokens_desired approach) |
| `sell_shares_usdcx` | Sell USDCX shares |
| `redeem_shares` / `redeem_shares_usdcx` | Redeem winning shares 1:1 |

### Liquidity
| Transition | Description |
|---|---|
| `add_liquidity` / `add_liquidity_usdcx` | Provide liquidity, receive LP tokens |
| `remove_liquidity` / `remove_liq_usdcx` | Withdraw liquidity proportionally |
| `claim_lp_refund` / `claim_lp_refund_usdcx` | Claim LP refund on cancelled markets |

### Dispute & Fees
| Transition | Description |
|---|---|
| `dispute_resolution` | Stake bond to dispute market resolution |
| `resolve_dispute` | Admin resolves dispute |
| `claim_dispute_bond` / `claim_disp_bond_usdcx` | Reclaim dispute bond |
| `withdraw_creator_fees` / `withdraw_fees_usdcx` | Creator withdraws accumulated fees |

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [Leo](https://developer.aleo.org/getting_started/) (for contract development)
- [Shield Wallet](https://shieldwallet.io/) browser extension

### Setup

```bash
# Clone
git clone https://github.com/hevDev7/veiled-markets-near.git
cd veiled-markets-near

# Install frontend dependencies
cd frontend
npm install

# Setup environment
cp .env.example .env
# Edit .env if needed (defaults point to testnet with v14)

# Start development server
npm run dev
# Open http://localhost:5173
```

### Environment Variables

Key variables in `frontend/.env`:

```env
VITE_NETWORK=testnet
VITE_PROGRAM_ID=veiled_markets_v14.aleo
VITE_ALEO_RPC_URL=https://api.explorer.provable.com/v1/testnet
VITE_EXPLORER_URL=https://testnet.explorer.provable.com
VITE_USDCX_PROGRAM_ID=test_usdcx_stablecoin.aleo
```

### Build Contract

```bash
cd contracts
leo build
# Output: 1974 statements, 30 transitions
```

### Deploy Contract

```bash
cd contracts
leo deploy --network testnet --yes --broadcast
# Cost: ~60.70 ALEO for v14
```

## Create a Market (CLI)

```bash
# Get current block height
CURRENT_BLOCK=$(curl -s "https://api.explorer.provable.com/v1/testnet/block/height/latest")

# Calculate deadlines
DEADLINE=$((CURRENT_BLOCK + 100000))    # ~5 days
RESOLUTION=$((CURRENT_BLOCK + 200000))  # ~10 days

# Create market (7 inputs for v14)
snarkos developer execute veiled_markets_v14.aleo create_market \
  "<question_hash>field" \
  "3u8" \
  "2u8" \
  "${DEADLINE}u64" \
  "${RESOLUTION}u64" \
  "<resolver_address>" \
  "10000000u128" \
  --private-key <PRIVATE_KEY> \
  --network 1 \
  --endpoint "https://api.explorer.provable.com" \
  --broadcast \
  --priority-fee 3000000
```

Parameters:
1. `question_hash` — BHP256 hash of the question string
2. `category` — 1-7 (Politics, Sports, Crypto, etc.)
3. `num_outcomes` — 2, 3, or 4
4. `deadline` — Block height for betting cutoff
5. `resolution_deadline` — Block height for resolution cutoff
6. `resolver` — Address authorized to resolve the market
7. `initial_liquidity` — In microcredits (10000000 = 10 ALEO)

## Wallet Setup

**Recommended:** [Shield Wallet](https://shieldwallet.io/)

1. Install Shield Wallet browser extension
2. Switch to **Testnet** network
3. Get test credits from [Aleo Faucet](https://faucet.aleo.org)
4. Connect wallet in the app — this registers `veiled_markets_v14.aleo`

> **Note:** If you see "program not in allowed programs" error, disconnect and reconnect Shield Wallet to re-register the program.

### Wallet Compatibility

| Wallet | Create Market | Buy Shares | Status |
|--------|:---:|:---:|---|
| Shield Wallet | Yes | Yes | Primary wallet |
| Puzzle Wallet | Untested | Untested | Server-side proving |
| Leo Wallet | No | No | Can't resolve 4-level import chain |

## Blockchain Indexer

The indexer scans the Aleo blockchain for market creation transactions.

```bash
cd backend
npm install
npm run index
```

Outputs `markets-index.json` with all discovered market IDs, creators, and metadata.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Contract** | Leo (Aleo), snarkVM |
| **Frontend** | React 18, TypeScript, Vite |
| **Styling** | Tailwind CSS, Framer Motion |
| **State** | Zustand |
| **Wallet** | ProvableHQ Aleo Wallet Adapter |
| **Persistence** | Supabase (cross-device bet tracking) |
| **Hosting** | Vercel |
| **Build** | vite-plugin-wasm, vite-plugin-top-level-await |

## Development

```bash
# Frontend dev server
cd frontend && npm run dev

# Build for production
cd frontend && npm run build

# Type check
cd frontend && npx tsc --noEmit

# Build contract
cd contracts && leo build

# SDK tests
cd sdk && npm test
```

## Audit Fixes (v10+)

| ID | Fix |
|----|-----|
| C-01 | `market_bettors` mapping for unique bettor tracking |
| C-02 | `market_credits` mapping for per-market credit isolation |
| C-03 | `resolver` field added to Market struct (separate from creator) |
| H-01 | Removed predictable noise/delay mechanism |
| H-02 | User nonce in commit_bet, reveal deadline enforcement |

## Version History

| Version | Key Changes |
|---------|-------------|
| **v14** | FPMM AMM, removed `buy_shares_public`, `expected_shares` pattern, `sell_shares` tokens_desired approach, `sell_shares` calls `credits.aleo/transfer_public` directly |
| v13 | Fixed ternary underflow bug in buy_shares (Leo evaluates both branches) |
| v12 | Initial FPMM implementation, multi-outcome markets, LP provision |
| v11 | USDCX stablecoin integration, dual-token markets |
| v10 | Audit fixes (C-01, C-02, C-03, H-01, H-02), dispute resolution |

## Documentation

- [Architecture Overview](./docs/ARCHITECTURE.md)
- [Privacy Analysis](./docs/PRIVACY_ANALYSIS.md)
- [Create Market Guide](./CREATE_MARKET_GUIDE.md)
- [Indexer Guide](./INDEXER_GUIDE.md)
- [Wallet Troubleshooting](./WALLET_TROUBLESHOOTING.md)

## Contributing

1. Fork the repo
2. Create feature branch (`git checkout -b feature/name`)
3. Commit changes (`git commit -m 'Add feature'`)
4. Push to branch (`git push origin feature/name`)
5. Open Pull Request

## License

MIT License - see [LICENSE](./LICENSE)

---

<div align="center">

**Built on Aleo**

[Live Demo](https://veiled-markets.vercel.app) · [Contract](https://testnet.explorer.provable.com/program/veiled_markets_v14.aleo) · [GitHub](https://github.com/hevDev7/veiled-markets-near)

</div>
