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
- **Inline Sell** — Sell shares directly from market detail with tokens-desired approach
- **Position Tracking** — Auto-fetch share records from wallet, track shares received per bet
- **Dispute Resolution** — On-chain dispute mechanism with bond staking

## Contract Details

| Field | Value |
|---|---|
| **Program** | `veiled_markets_v14.aleo` |
| **Network** | Aleo Testnet |
| **Deploy TX** | `at186k9d264w2s9qfd994aam2xpyda828hnsyh0aan5g25p32v5cuqqgqstv5` |
| **Transitions** | 30 |
| **Statements** | 1,974 |
| **Deploy Cost** | ~60.70 ALEO |
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
│   │   ├── components/    # Trading UI, wallet bridge, modals, panels
│   │   │   ├── BuySharesModal.tsx
│   │   │   ├── SellSharesModal.tsx
│   │   │   ├── CreateMarketModal.tsx
│   │   │   ├── ClaimWinningsModal.tsx
│   │   │   ├── OutcomeSelector.tsx
│   │   │   ├── LiquidityPanel.tsx
│   │   │   ├── DisputePanel.tsx
│   │   │   ├── CreatorFeesPanel.tsx
│   │   │   ├── AdminPanel.tsx
│   │   │   ├── WalletBridge.tsx
│   │   │   └── WalletCompatibilityLab.tsx
│   │   ├── hooks/         # useAleoTransaction (wallet-agnostic TX + polling)
│   │   ├── lib/           # AMM math, aleo-client, store, config, credits-record
│   │   ├── pages/         # Landing, Dashboard, MarketDetail, MyBets, Settings, History
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

**Sell (complete-set burning):** User specifies tokens to withdraw (`tokens_desired` approach). Contract computes shares needed from the user's outcome to burn a complete set and release collateral. No `sqrt` needed on-chain.

```
Binary: shares_needed = tokens_desired * (r_i + r_other - td) / (r_other - td)
```

**Redeem:** Winning shares redeem 1:1 (1 share = 1 token). Losing shares = 0.

### `expected_shares` Pattern (v14)

Frontend pre-computes shares from the FPMM formula, the `OutcomeShare` record stores this value, and finalize validates `shares_out >= expected_shares`. This fixes the quantity=0 bug from v13 where records had no share quantity.

### Fees (per trade)

| Fee | Rate | Recipient |
|-----|------|-----------|
| Protocol | 0.5% | Protocol treasury |
| Creator | 0.5% | Market creator |
| LP | 1.0% | Liquidity providers (stays in pool) |
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

## Frontend Features

### Market Detail — Inline Trading

The market detail page has an integrated **Buy/Sell** tab toggle in the right sidebar:

- **Buy Tab:** Select outcome, enter amount, preview shares received with price impact and fees, execute via wallet
- **Sell Tab:** Load share positions from wallet (auto-fetch `OutcomeShare` records), enter withdrawal amount, preview shares burned and net tokens received, execute sell
- Manual record paste fallback for wallets that don't support record fetching

### My Bets — Position Tracking

- Displays **shares received** (fixed at time of purchase) instead of fluctuating market odds
- Auto-promotes stale pending bets (>2 minutes) to active status
  - `at1...` IDs: verified on-chain via explorer API
  - `shield_xxx` IDs: auto-promoted (Shield Wallet confirms on-chain)
- Tabs: All, Accepted, Unredeemed, Settled
- Import existing bets by transaction ID
- Claim winnings / refunds directly from bet cards

### Wallet Integration

- **Shield Wallet** as primary wallet (returns `shield_xxx` event IDs, handled by background blockchain scanner)
- **Puzzle Wallet** support via server-side delegated proving (WalletConnect V2)
- Transaction polling with on-chain verification fallback
- Credits record fetching for private buy transactions (multiple wallet strategies)

## Key Transitions (30 total)

### Market Lifecycle
| Transition | Description |
|---|---|
| `create_market` | Create ALEO market with initial liquidity |
| `create_market_usdcx` | Create USDCX market with initial liquidity |
| `close_market` | Close betting (after deadline) |
| `resolve_market` | Resolve with winning outcome |
| `finalize_resolution` | Finalize after dispute window |
| `cancel_market` | Creator cancels market |
| `emergency_cancel` | Cancel unresolved market (past resolution deadline) |

### Trading
| Transition | Description |
|---|---|
| `buy_shares_private` | Buy shares with private credits record (ALEO) |
| `buy_shares_usdcx` | Buy shares with USDCX (public signer) |
| `sell_shares` | Sell ALEO shares (tokens_desired approach, calls `credits.aleo/transfer_public`) |
| `sell_shares_usdcx` | Sell USDCX shares |
| `redeem_shares` / `redeem_shares_usdcx` | Redeem winning shares 1:1 |
| `claim_refund` / `claim_refund_usdcx` | Claim refund on cancelled markets |

### Liquidity
| Transition | Description |
|---|---|
| `add_liquidity` / `add_liquidity_usdcx` | Provide liquidity, receive LP tokens |
| `remove_liquidity` / `remove_liq_usdcx` | Withdraw liquidity proportionally |
| `claim_lp_refund` / `claim_lp_refund_usdcx` | Claim LP refund on cancelled markets |

### Dispute & Governance
| Transition | Description |
|---|---|
| `dispute_resolution` / `dispute_resolution_usdcx` | Stake bond to dispute market resolution |
| `claim_dispute_bond` / `claim_disp_bond_usdcx` | Reclaim dispute bond |
| `withdraw_creator_fees` / `withdraw_fees_usdcx` | Creator withdraws accumulated fees |
| `init_multisig` | Initialize multisig for treasury |
| `propose_treasury_withdrawal` | Propose treasury withdrawal |
| `approve_proposal` | Approve multisig proposal |
| `execute_proposal` | Execute approved proposal |

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
npm install --legacy-peer-deps

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
2. `category` — 1-7 (Politics, Sports, Crypto, Entertainment, Tech, Economics, Science)
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

| Wallet | Create Market | Buy Shares | Sell Shares | Status |
|--------|:---:|:---:|:---:|---|
| Shield Wallet | Yes | Yes | Yes | Primary wallet |
| Puzzle Wallet | Untested | Untested | Untested | Server-side proving |
| Leo Wallet | No | No | No | Can't resolve 4-level import chain |

### Known Shield Wallet Behavior

- Returns `shield_xxx` event IDs instead of `at1...` transaction IDs
- Child transitions (`transfer_public_as_signer`) may show as ACCEPTED while parent shows REJECTED in Shield UI — but the on-chain transaction is actually ACCEPTED
- App handles this with auto-promotion of stale pending bets and background blockchain scanning

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Contract** | Leo (Aleo), snarkVM |
| **Frontend** | React 18, TypeScript, Vite |
| **Styling** | Tailwind CSS, Framer Motion |
| **State** | Zustand |
| **Wallet** | ProvableHQ Aleo Wallet Adapter |
| **UI Components** | Radix UI (Dialog, Tabs, Slider, Tooltip, Progress) |
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

### Vite Build Configuration

The `@provablehq/sdk` requires specific Vite config:

- `vite-plugin-wasm` + `vite-plugin-top-level-await` for WASM support
- `optimizeDeps.exclude: ['@provablehq/wasm', '@provablehq/sdk']`
- `build.target: 'esnext'` and `worker.format: 'es'`
- COOP/COEP headers needed for SharedArrayBuffer in dev mode
- Do NOT use `commonjsOptions.exclude` for `@provablehq` (breaks `core-js` require)

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
| **v14** | FPMM AMM with correct formulas, removed `buy_shares_public` (ALEO uses `buy_shares_private` only), `expected_shares` pattern fixes quantity=0 bug, `sell_shares` uses tokens_desired approach + calls `credits.aleo/transfer_public` directly, multisig treasury governance |
| v13 | Fixed ternary underflow bug in buy_shares (Leo evaluates both branches) |
| v12 | Initial FPMM implementation, multi-outcome markets, LP provision |
| v11 | USDCX stablecoin integration, dual-token markets |
| v10 | Audit fixes (C-01, C-02, C-03, H-01, H-02), dispute resolution |

## Testnet Markets (v14)

Markets are registered in `frontend/public/markets-index.json` and `frontend/src/lib/question-mapping.ts`.

Creating markets via the frontend dashboard or CLI populates these registries. The blockchain indexer (`backend/`) can scan for new markets automatically.

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
