# Veiled Markets

<div align="center">

<img src="./logo-veiled-markets.png" alt="Veiled Markets Logo" width="200"/>

### **Predict Freely. Trade Privately.**

Privacy-preserving prediction market with FPMM AMM on Aleo blockchain

[![Live Demo](https://img.shields.io/badge/Live-Demo-00D4AA?style=for-the-badge)](https://veiled-markets.vercel.app)
[![Aleo](https://img.shields.io/badge/Aleo-Testnet-00D4AA?style=for-the-badge)](https://testnet.explorer.provable.com/program/veiled_markets_v16.aleo)
[![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](./LICENSE)

</div>

---

## What is Veiled Markets?

A prediction market protocol where users trade outcome shares with complete privacy. Built on Aleo's zero-knowledge blockchain with a Gnosis-style Fixed Product Market Maker (FPMM).

- **Private Trading** — Buy shares via `transfer_private_to_public` (address and amount encrypted on-chain)
- **FPMM AMM** — Complete-set minting/burning with constant product invariant
- **Multi-Outcome** — Support for 2, 3, or 4 outcome markets with custom labels
- **Dual Token** — Markets in ALEO or USDCX stablecoin
- **LP Provision** — Add/remove liquidity, earn 1% LP fees per trade
- **Inline Trading** — Buy and sell shares directly from market detail page
- **Live Countdown** — Real-time countdown timer with seconds precision on all market cards and detail pages
- **Position Tracking** — Auto-fetch share records from wallet, track shares and sell history per bet
- **Market Resolution** — 3-step on-chain resolution (close → resolve → finalize) with full UI
- **Emergency Cancel** — Auto-detected in Resolve Panel for expired unresolved markets past resolution deadline
- **Dispute Mechanism** — On-chain dispute with bond staking, automatic re-resolution flow
- **Wallet-Based Claims** — Claim winnings and refunds directly via wallet (Shield/Puzzle) with CLI fallback
- **Market Sentiment Chart** — Donut chart visualization with integrated pool data for 2-4 outcome markets
- **Needs Resolution Filter** — Dashboard filter to find expired markets awaiting resolution

## Contract Details

| Field | Value |
|---|---|
| **Program** | `veiled_markets_v16.aleo` |
| **Network** | Aleo Testnet |
| **Deploy TX** | `at1kdqmt63rhhx3t27af3psrq97flnjy4jjr67dsryt4uk62cd6lqqqcrtr37` |
| **Transitions** | 31 |
| **Deploy Cost** | ~60.72 ALEO |
| **Dependencies** | `credits.aleo`, `test_usdcx_stablecoin.aleo` |
| **Block Time** | ~4s/block (testnet), ~15s/block (mainnet) |

## Architecture

```
Frontend (React + Vite + TypeScript)
    |
Shield Wallet (ProvableHQ Adapter)
    |
Smart Contract (veiled_markets_v16.aleo)
    |
Aleo Blockchain (Testnet)
```

### Monorepo Structure

```
veiled-markets/
├── contracts/             # Leo smart contract
│   └── src/main.leo       # FPMM AMM, LP, dispute, multi-token (~2576 lines)
├── frontend/              # React dashboard
│   ├── src/
│   │   ├── components/    # Trading UI, wallet bridge, modals, panels
│   │   │   ├── CreateMarketModal.tsx    # Market creation wizard (3-step)
│   │   │   ├── BuySharesModal.tsx       # Buy shares modal
│   │   │   ├── SellSharesModal.tsx      # Sell shares modal
│   │   │   ├── ClaimWinningsModal.tsx   # Wallet-based claim winnings / refunds
│   │   │   ├── OutcomeSelector.tsx      # Multi-outcome selector (2-4 outcomes)
│   │   │   ├── ProbabilityDonut.tsx     # Market sentiment donut chart + pool data
│   │   │   ├── LiquidityPanel.tsx       # Add/remove liquidity
│   │   │   ├── ResolvePanel.tsx         # 3-step resolution + emergency cancel
│   │   │   ├── DisputePanel.tsx         # Dispute resolution
│   │   │   ├── CreatorFeesPanel.tsx     # Creator fee withdrawal
│   │   │   ├── TradingPanel.tsx         # Inline buy/sell trading panel
│   │   │   ├── AdminPanel.tsx           # Admin: resolve, close, cancel
│   │   │   ├── WalletBridge.tsx         # Multi-wallet connector
│   │   │   └── WalletCompatibilityLab.tsx # Wallet testing tools
│   │   ├── hooks/
│   │   │   ├── useAleoTransaction.ts    # Wallet-agnostic TX execution + polling
│   │   │   ├── useSDKTransaction.ts     # SDK-based transaction execution
│   │   │   └── useAleoProver.ts         # WASM prover integration
│   │   ├── lib/
│   │   │   ├── amm.ts                   # FPMM math (prices, buy/sell formulas, fees)
│   │   │   ├── aleo-client.ts           # Blockchain API, market registry, outcome labels
│   │   │   ├── market-store.ts          # Zustand store for real blockchain markets
│   │   │   ├── store.ts                 # Zustand store for bets, wallet, settings
│   │   │   ├── credits-record.ts        # Wallet record fetching (3 strategies)
│   │   │   ├── config.ts                # Program ID, network, RPC, block time config
│   │   │   ├── supabase.ts              # Cross-device bet persistence
│   │   │   ├── question-mapping.ts      # Question hash to text mapping
│   │   │   ├── wallet.ts                # Wallet utilities
│   │   │   └── utils.ts                 # Formatting, classnames, helpers
│   │   ├── pages/
│   │   │   ├── Landing.tsx              # Landing page with hero
│   │   │   ├── Dashboard.tsx            # Market listing + create market + resolution filter
│   │   │   ├── MarketDetail.tsx         # Market detail + inline Buy/Sell + Resolve tab
│   │   │   ├── MyBets.tsx               # Position tracking (buy + sell history)
│   │   │   ├── History.tsx              # Transaction history
│   │   │   └── Settings.tsx             # App settings
│   │   └── styles/                      # Tailwind + custom CSS
│   └── public/
│       └── markets-index.json           # Known market IDs for bootstrapping
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

### `expected_shares` Pattern

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
Binary:
  price_yes = reserve_no / (reserve_yes + reserve_no)
  price_no  = reserve_yes / (reserve_yes + reserve_no)

N-outcome:
  price_i = product(r_j for j != i) / sum_of_products
```

## Market Resolution

Markets follow a 3-step on-chain resolution process with a built-in dispute window:

### Resolution Flow

```
1. close_market        →  Status: ACTIVE → CLOSED        (anyone, after deadline)
2. resolve_market      →  Status: CLOSED → PENDING        (resolver only, before resolution_deadline)
3. finalize_resolution →  Status: PENDING → RESOLVED       (anyone, after challenge window — no end deadline)
```

### Resolve Panel UI

The **Resolve** tab on the market detail page guides the resolver through all 3 steps:

- **Step 1 — Close Market:** Closes betting after the market deadline has passed
- **Step 2 — Resolve Market:** Resolver selects the winning outcome (only the designated resolver address can execute this step, must be before `resolution_deadline`)
- **Step 3 — Finalize:** After the challenge window (~2880 blocks, ~3.2 hours on testnet) passes with no disputes, anyone can finalize. There is **no end deadline** — finalization can happen at any time after the challenge window closes.

Each step shows transaction status, block countdown for the challenge window, and auto-advances to the next step after confirmation.

### Emergency Cancel

If a market passes its `resolution_deadline` without being resolved, the Resolve Panel automatically detects this and displays an **Emergency Cancel** banner. Anyone can call `cancel_market` (Path B: emergency cancel) to set the market to CANCELLED status, enabling bettors to reclaim their funds via `claim_refund`.

### Dispute Mechanism

During the challenge window (between resolve and finalize), anyone can dispute the resolution:

1. **Disputer** calls `dispute_resolution` with a proposed different outcome + 1 ALEO bond
2. Market status resets to **CLOSED**, resolution is removed
3. **Resolver** must re-resolve the market with a corrected outcome
4. A new challenge window begins
5. After finalization, if the final outcome matches the disputer's proposed outcome, the disputer can reclaim their bond via `claim_dispute_bond` (uses unforgeable `DisputeBondReceipt` record)

v15+ fixes: `resolve_market` clears stale dispute data on re-resolve, `cancel_market` cleans up resolution/dispute state, `claim_dispute_bond` uses `DisputeBondReceipt` record instead of mapping (prevents stuck markets after dispute).

### Needs Resolution Filter

The Dashboard includes a **"Needs Resolution"** sort option (Gavel icon) that filters to show only expired/ended markets that still need to be resolved. This helps resolvers easily find markets awaiting action.

### Claim Winnings & Refunds

The **My Bets** page (Unredeemed tab) provides wallet-based claim functionality:

- **Redeem Shares:** For resolved markets — claim winning shares 1:1 via wallet
- **Claim Refund:** For cancelled markets — reclaim bet amount via wallet
- Both use `executeTransaction` with `recordIndices: [0]` for Shield Wallet compatibility
- CLI fallback available in collapsible "Advanced" section for troubleshooting

## Block Time Configuration

Block time differs between testnet and mainnet. The frontend uses network-aware configuration:

| Network | Block Time | Challenge Window (2880 blocks) |
|---------|-----------|-------------------------------|
| **Testnet** | ~4 seconds/block | ~3.2 hours |
| **Mainnet** | ~15 seconds/block | ~12 hours |

All deadline calculations (market duration, resolution countdown, challenge window) use the centralized `config.secondsPerBlock` / `config.msPerBlock` values. The dashboard and market detail pages show **live countdown timers** with seconds precision, updating every second.

## Privacy Model

| Data | Visibility |
|------|-----------|
| Market question, total pool, reserves, prices | Public |
| Your trade amount and outcome position | Private (ZK-encrypted) |
| Your wallet address in buy transactions | Private (`transfer_private_to_public`) |
| Sell payouts, winning redemptions, refunds | Private (`transfer_public_to_private`) |
| Market creation, resolution | Public |

### How Privacy Works

ALEO buy shares use `buy_shares_private`, which calls `credits.aleo/transfer_private_to_public` internally. This means:

1. User provides a **private credits record** (not public balance)
2. The transfer is from private to public — observer sees tokens arrive at the program address but **cannot link** them to the sender
3. The `OutcomeShare` record is returned to the user as an encrypted record

USDCX markets use `buy_shares_usdcx` with `transfer_public_as_signer` (less private, but necessary for stablecoin mechanics).

In v16, sell payouts, winning redemptions, and refunds all use `transfer_public_to_private`, so the recipient receives a **private credits record** — observers cannot see who received the payout.

## Frontend Features

### Live Countdown Timer

All market cards on the Dashboard and the Market Detail page display a **live countdown** with seconds precision. The timer:
- Computes a `deadlineTimestamp` from block height at fetch time
- Updates every 1 second via `useLiveCountdown` hook
- Format: `2D 5H 30M` (> 1 day), `3H 15M 42S` (> 1 hour), `15M 30S` (> 1 min), `45S` (< 1 min)
- Shows `ENDED` when the deadline has passed

### Market Detail — Inline Trading

The market detail page has an integrated **Buy/Sell** tab toggle in the right sidebar:

- **Buy Tab:** Select outcome (2-4 options with custom labels and colors), enter amount, preview shares received with price impact and fees, execute via wallet
- **Sell Tab:** Auto-fetch `OutcomeShare` records from wallet, select position, enter withdrawal amount, preview shares burned and net tokens received, execute sell
- **Resolve Tab:** 3-step resolution wizard (close → resolve → finalize) with challenge window countdown + emergency cancel detection
- Manual record paste fallback for wallets that don't support record fetching

### Multi-Outcome Support

- **2 outcomes:** Binary markets (Yes/No) — green/red color scheme
- **3 outcomes:** Triple markets — green/red/purple
- **4 outcomes:** Quad markets — green/red/purple/yellow
- **Custom labels:** Creator enters custom outcome names during market creation (e.g., "Apple", "Google", "Meta", "Amazon")
- **Market Sentiment:** Donut chart with integrated pool data, reserves, percentages, and payout multipliers for all outcomes

### My Bets — Position & Trade Tracking

- Tracks both **buy** and **sell** transactions
- Buy entries show **shares received** (fixed at time of purchase)
- Sell entries show **shares sold** and **tokens received** (with purple SELL badge)
- Auto-promotes stale pending bets (>2 minutes) to active status
  - `at1...` IDs: verified on-chain via explorer API
  - `shield_xxx` IDs: auto-promoted (Shield Wallet confirms on-chain)
- Tabs: All, Accepted, Unredeemed, Settled
- Import existing bets by transaction ID
- **Claim winnings / refunds directly via wallet** from Unredeemed tab (with CLI fallback)

### Wallet Integration

- **Shield Wallet** as primary wallet (returns `shield_xxx` event IDs, handled by background blockchain scanner)
- **Puzzle Wallet** support via server-side delegated proving (WalletConnect V2)
- Transaction polling with on-chain verification fallback
- Credits record fetching for private buy transactions (3 wallet strategies with fallback)

## Key Transitions (31 total)

### Market Lifecycle
| Transition | Description |
|---|---|
| `create_market` | Create ALEO market with initial liquidity |
| `create_market_usdcx` | Create USDCX market with initial liquidity |
| `close_market` | Close betting (after deadline) |
| `resolve_market` | Resolve with winning outcome (resolver only, before resolution_deadline) |
| `finalize_resolution` | Finalize after challenge window — no end deadline (anyone) |
| `cancel_market` | Creator cancel (no volume) OR emergency cancel (past resolution_deadline, anyone) |

### Trading
| Transition | Description |
|---|---|
| `buy_shares_private` | Buy shares with private credits record (ALEO) |
| `buy_shares_usdcx` | Buy shares with USDCX (public signer) |
| `sell_shares` | Sell ALEO shares (tokens_desired approach, calls `credits.aleo/transfer_public_to_private`) |
| `sell_shares_usdcx` | Sell USDCX shares |
| `redeem_shares` / `redeem_shares_usdcx` | Redeem winning shares 1:1 (private payout) |
| `claim_refund` / `claim_refund_usdcx` | Claim refund on cancelled markets (private payout) |

### Liquidity
| Transition | Description |
|---|---|
| `add_liquidity` / `add_liquidity_usdcx` | Provide liquidity with private credits, receive LP tokens |
| `remove_liquidity` / `remove_liq_usdcx` | Withdraw liquidity proportionally (active markets) |
| `withdraw_lp_resolved` / `withdraw_lp_resolved_usdcx` | Withdraw LP share from resolved/finalized markets |
| `claim_lp_refund` / `claim_lp_refund_usdcx` | Claim LP refund on cancelled markets |

### Dispute & Governance
| Transition | Description |
|---|---|
| `dispute_resolution` | Stake 1 ALEO bond (private) to dispute resolution |
| `claim_dispute_bond` | Reclaim bond via `DisputeBondReceipt` record if final outcome matches |
| `withdraw_creator_fees` / `withdraw_fees_usdcx` | Creator withdraws accumulated fees |
| `init_multisig` | Initialize multisig for treasury |
| `propose_treasury_withdrawal` | Propose treasury withdrawal |
| `approve_proposal` | Approve multisig proposal |
| `execute_proposal` / `exec_proposal_usdcx` | Execute approved proposal |

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
# Edit .env if needed (defaults point to testnet with v16)

# Start development server
npm run dev
# Open http://localhost:5173
```

### Environment Variables

Key variables in `frontend/.env`:

```env
VITE_NETWORK=testnet
VITE_PROGRAM_ID=veiled_markets_v16.aleo
VITE_ALEO_RPC_URL=https://api.explorer.provable.com/v1/testnet
VITE_EXPLORER_URL=https://testnet.explorer.provable.com
VITE_USDCX_PROGRAM_ID=test_usdcx_stablecoin.aleo
```

### Build Contract

```bash
cd contracts
leo build
# Output: 31 transitions
```

### Deploy Contract

```bash
cd contracts
leo deploy --network testnet --yes --broadcast
# Cost: ~60.72 ALEO for v16
```

## Create a Market (CLI)

```bash
# Get current block height
CURRENT_BLOCK=$(curl -s "https://api.explorer.provable.com/v1/testnet/block/height/latest")

# Calculate deadlines (testnet: ~4s/block)
DEADLINE=$((CURRENT_BLOCK + 21600))      # ~1 day (21600 blocks × 4s)
RESOLUTION=$((CURRENT_BLOCK + 43200))    # ~2 days (43200 blocks × 4s)

# Create market (7 inputs)
snarkos developer execute veiled_markets_v16.aleo create_market \
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

### Block Time Reference

| Duration | Testnet (~4s/block) | Mainnet (~15s/block) |
|----------|-------------------|---------------------|
| 1 hour | ~900 blocks | ~240 blocks |
| 12 hours | ~10,800 blocks | ~2,880 blocks |
| 1 day | ~21,600 blocks | ~5,760 blocks |
| 7 days | ~151,200 blocks | ~40,320 blocks |

## Wallet Setup

**Recommended:** [Shield Wallet](https://shieldwallet.io/)

1. Install Shield Wallet browser extension
2. Switch to **Testnet** network
3. Get test credits from [Aleo Faucet](https://faucet.aleo.org)
4. Connect wallet in the app — this registers `veiled_markets_v16.aleo`

> **Note:** If you see "program not in allowed programs" error, disconnect and reconnect Shield Wallet to re-register the program.

### Wallet Compatibility

| Wallet | Create Market | Buy Shares | Sell Shares | Claim/Refund | Status |
|--------|:---:|:---:|:---:|:---:|---|
| Shield Wallet | Yes | Yes | Yes | Yes | Primary wallet |
| Puzzle Wallet | Untested | Untested | Untested | Untested | Server-side proving |
| Leo Wallet | No | No | No | No | Can't resolve 4-level import chain |

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
| **Persistence** | Supabase (cross-device bet tracking) + localStorage |
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

## Data Persistence

### Outcome Labels

Custom outcome labels (for 3-4 outcome markets) are saved to `localStorage` during market creation, keyed by both question hash and market ID. When a market is loaded, `market-store.ts` looks up saved labels before falling back to defaults ("Outcome 1", "Outcome 2", etc.).

### Bet & Sell Tracking

All buy and sell transactions are recorded in Zustand store and persisted to `localStorage` (per-address) and optionally Supabase. Each entry tracks:
- **Buy:** stake amount, outcome, shares received, locked multiplier
- **Sell:** tokens desired, shares sold, net tokens received

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
| **v16** | Privacy-first: `sell_shares`/`redeem_shares`/`claim_refund` use `transfer_public_to_private` (payouts as private records), `add_liquidity`/`dispute_resolution` use `transfer_private_to_public` (LP/disputer privacy). NEW: `withdraw_lp_resolved`/`withdraw_lp_resolved_usdcx` for LP withdrawal from finalized markets. `cancel_market` now handles both creator cancel and emergency cancel (merged). `transfer_future.await()` moved to top of all finalize functions. Market Sentiment donut chart replaces Pool Breakdown |
| v15 | Fixed dispute lifecycle bugs: `resolve_market` clears stale dispute data on re-resolve, `cancel_market` cleans up resolution/dispute state, `claim_dispute_bond` uses unforgeable `DisputeBondReceipt` record. Added Resolve Panel UI (3-step wizard + emergency cancel), "Needs Resolution" dashboard filter, wallet-based claim/refund (replaces CLI-only), live countdown with seconds precision, network-aware block time config (4s testnet / 15s mainnet) |
| v14 | FPMM AMM with correct formulas, `buy_shares_private` only (ALEO), `expected_shares` pattern, `sell_shares` tokens_desired approach + `credits.aleo/transfer_public`, multisig treasury governance, custom outcome labels, multi-outcome pool breakdown, sell tracking in My Bets |
| v13 | Fixed ternary underflow bug in buy_shares (Leo evaluates both branches) |
| v12 | Initial FPMM implementation, multi-outcome markets, LP provision |
| v11 | USDCX stablecoin integration, dual-token markets |
| v10 | Audit fixes (C-01, C-02, C-03, H-01, H-02), dispute resolution |

## Testnet Markets

Markets are registered in `frontend/public/markets-index.json` and `frontend/src/lib/question-mapping.ts`.

Creating markets via the frontend dashboard or CLI populates these registries. Outcome labels are persisted in `localStorage` and looked up by question hash or market ID. The blockchain indexer (`backend/`) can scan for new markets automatically.

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

[Live Demo](https://veiled-markets.vercel.app) · [Contract](https://testnet.explorer.provable.com/program/veiled_markets_v16.aleo) · [GitHub](https://github.com/hevDev7/veiled-markets-near)

</div>
