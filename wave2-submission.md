# Veiled Markets — Wave 2 Submission

## 1. Project Overview

**Name:** Veiled Markets
**Live Demo:** https://veiledmarkets.xyz
**Contract:** [`veiled_markets_v16.aleo`](https://testnet.explorer.provable.com/program/veiled_markets_v16.aleo)
**GitHub:** https://github.com/hevDev7/veiled-markets-near

### Problem

Prediction markets are powerful tools for information discovery, but existing platforms (Polymarket, Kalshi) expose every participant's identity, position, and trade size on-chain or in a public order book. This creates real problems:

- **Front-running & MEV:** Visible pending bets let bots extract value from ordinary users.
- **Social coercion:** Participants in politically sensitive markets face retaliation when their positions are public.
- **Self-censorship:** Users avoid markets on controversial topics because their wallets are linked to their bets.

Aleo's zero-knowledge architecture solves this by letting the contract verify correctness without revealing who bet what.

### Why Privacy Matters

In a prediction market, privacy is not a luxury — it is a prerequisite for honest participation. When outcomes are sensitive (elections, corporate events, geopolitical forecasts), public bets become signals that distort the very thing the market is trying to measure. Veiled Markets ensures that trade amounts, outcome choices, and winner identities are hidden via Aleo's private records and zero-knowledge proofs, producing cleaner price signals.

### Product Market Fit & Go-To-Market

**Target users:** Crypto-native traders who already use prediction markets but want position privacy; DAO governance participants who need non-coercive signaling; analysts and researchers who need honest crowd-sourced probability estimates.

**PMF thesis:** Privacy-preserving prediction markets are an unserved niche — no live product offers fully private betting with AMM-based pricing on a ZK-native chain. Veiled Markets is the first FPMM prediction market on Aleo.

**GTM plan:**
- **Wave 2–4:** Build traction via Aleo testnet with open markets, gather feedback from Aleo community and buildathon judges.
- **Wave 5–7:** Launch creator tools so anyone can deploy a market. Integrate with Aleo ecosystem DeFi (USDCX, USAD stablecoins). Publish TypeScript SDK for third-party embedding.
- **Wave 8–10:** Mainnet deployment. Partner with DAOs for governance prediction markets. Target crypto media coverage for launch.

---

## 2. Working Demo

| Component | Status | Link |
|-----------|--------|------|
| Frontend | Live | https://veiledmarkets.xyz |
| Contract (Testnet) | Deployed | [`veiled_markets_v16.aleo`](https://testnet.explorer.provable.com/program/veiled_markets_v16.aleo) |
| Wallet Integration | Shield Wallet (primary), Leo Wallet, Puzzle Wallet | Connects via ProvableHQ adapter |

**Core features testable from the UI:**
- Create Market with initial ALEO liquidity (calls `credits.aleo/transfer_public_as_signer`)
- Buy Shares privately via `buy_shares_private` (calls `credits.aleo/transfer_private_to_public`)
- Sell Shares via `sell_shares` (calls `credits.aleo/transfer_public_to_private`)
- Resolve Market (Close → Resolve → Finalize 3-step flow)
- Dispute Resolution (bond 1 ALEO via private credits record)
- Claim Winnings / Claim Refund (private payout via `transfer_public_to_private`)
- Dual-token support: ALEO and USDCX (`test_usdcx_stablecoin.aleo`)

**Shield Wallet Integration:** Shield Wallet is integrated as the primary wallet. All transaction flows (create market, buy shares, sell shares, resolve, dispute, claim) work through Shield's ProvableHQ adapter with `executeTransaction()`. Shield handles nested signer authorization for child transitions like `credits.aleo/transfer_public_as_signer`. The wallet connection flow auto-detects Shield via `window.shield` / `window.shieldWallet` injection and connects with `DecryptPermission.AutoDecrypt` on `testnetbeta` network.

---

## 3. Technical Documentation

**GitHub Repository:** https://github.com/hevDev7/veiled-markets-near

### Architecture

```
┌──────────────┐     ┌───────────────────────┐     ┌──────────────────┐
│   Frontend   │────▶│   Shield / Leo /      │────▶│   Aleo Testnet   │
│  React/Vite  │     │   Puzzle Wallet       │     │                  │
│  TypeScript  │     │  (ProvableHQ adapter) │     │  veiled_markets  │
│              │     └───────────────────────┘     │  _v16.aleo       │
│  Components: │                                   │                  │
│  - Dashboard │     ┌───────────────────────┐     │  Dependencies:   │
│  - Market    │────▶│  Supabase (encrypted) │     │  - credits.aleo  │
│  - My Bets   │     │  Bet sync + registry  │     │  - test_usdcx_   │
│  - Resolve   │     └───────────────────────┘     │    stablecoin    │
└──────────────┘                                   └──────────────────┘
```

- **Contract (Leo):** 30 transitions, FPMM AMM (complete-set minting/burning), 2–4 outcome markets, LP provision, dispute mechanism, multi-sig treasury.
- **Frontend (React/Vite/TS):** Wallet-agnostic via adapter pattern. WASM support with COOP/COEP headers for `@provablehq/sdk`.
- **Storage:** Supabase with AES-256-GCM client-side encryption for bet data sync across devices. Sensitive fields (outcome, amount, shares) are encrypted with a wallet-derived key before storage.

### Privacy Model

All value transfers use Aleo's private record system:

| Operation | Privacy Method | What's Hidden |
|-----------|---------------|---------------|
| Buy shares | `transfer_private_to_public` (user → program) | Buyer address, amount |
| Sell shares | `transfer_public_to_private` (program → user) | Seller address, amount received |
| Redeem winnings | `transfer_public_to_private` (program → user) | Winner identity, payout amount |
| Claim refund | `transfer_public_to_private` (program → user) | Refund recipient |
| Add liquidity | `transfer_private_to_public` (user → program) | LP identity, deposit amount |
| Dispute bond | `transfer_private_to_public` (user → program) | Disputer identity |

The `OutcomeShare` record is a private Aleo record — only the owner's wallet can decrypt the outcome choice and share quantity. On-chain, observers see only the program address as the counterparty.

---

## 4. Progress Changelog (Wave 2)

### What We Built Since Wave 1

Since Wave 1 (v2), we shipped **14 contract iterations** and deployed `veiled_markets_v16.aleo` on Aleo Testnet, delivering the complete trading lifecycle:

**FPMM AMM Engine:** Replaced the parimutuel model with a Gnosis-style Fixed Product Market Maker. Complete-set minting for buys, `tokens_desired` approach for sells (avoids on-chain `sqrt`). Supports 2, 3, and 4 outcome markets. Per-trade fees: 0.5% protocol + 0.5% creator + 1% LP = 2% total.

**Full Privacy Overhaul:** Six transitions upgraded to use private `credits.aleo` records:
- `buy_shares_private` → `transfer_private_to_public` (buyer hidden)
- `sell_shares` → `transfer_public_to_private` (seller hidden)
- `redeem_shares` → `transfer_public_to_private` (winner hidden)
- `claim_refund` → `transfer_public_to_private` (recipient hidden)
- `add_liquidity` → `transfer_private_to_public` (LP hidden)
- `dispute_resolution` → `transfer_private_to_public` (disputer hidden)

**Dual-Token Markets:** ALEO (fully private buy) and USDCX (`test_usdcx_stablecoin.aleo`) support. Token type set at market creation.

**Market Resolution UI:** 3-step Resolve tab (Close → Resolve → Finalize) with live TX status, block countdown, Emergency Cancel detection, and full Dispute flow.

**Shield Wallet Integration:** Shield Wallet is the primary wallet, handling all transaction flows including nested `credits.aleo` child transitions. Leo Wallet and Puzzle Wallet also supported via adapter pattern.

**Claim & Tracking:** Revamped My Bets with Unredeemed tab, wallet-based share redemption, "Needs Resolution" filter, and live countdown timers.

### Wave 1 Feedback Incorporated

Reviewer (alex_aleo) raised three issues — all resolved:

1. **Privacy leakage in betting function** — `place_bet` exposed user address via `transfer_public_as_signer`. Fixed: `buy_shares_private` now uses `transfer_private_to_public` with a private credits record. User address is completely hidden.

2. **Payout model did not incorporate odds at bet time** — Parimutuel model replaced with FPMM. Prices are derived from pool reserves at trade time, and the `OutcomeShare` record stores the share quantity computed by the FPMM formula.

3. **Create market stuck loading** — Added `isSubmitting` guard + disabled button to prevent double-submission. Production deployment is stable.

### Known Limitations / Unfinished Features

- **USDCX buy privacy:** USDCX markets use `transfer_public_as_signer` (buyer address visible). The stablecoin contract does support `transfer_private_to_public`, but it requires freeze-list Merkle proofs (2x 16-depth tree) that our contract has not yet integrated. Planned for Wave 5.
- **Multi-outcome UI:** Contract supports 3 and 4 outcome markets, but the frontend buy/sell flow currently only renders binary (Yes/No) markets. Multi-outcome UI is planned for Wave 3.
- **LP Provision UI:** `add_liquidity` and `remove_liquidity` transitions exist on-chain but have no frontend UI yet. Planned for Wave 5.
- **Mobile responsiveness:** Frontend is desktop-optimized. Mobile layout improvements planned for Wave 5.
- **Indexer/analytics:** No backend indexer for historical market data or volume analytics. Planned for Wave 3–4.

### Next Wave Goals (Wave 3)

- Full UI for 3 and 4 outcome markets (buy/sell/pool breakdown)
- Market analytics page (volume trends, participation stats)
- User profile pages (betting history, PnL tracking)
- Frontend support for private credits record inputs on `add_liquidity` and `dispute_resolution`
- API documentation and self-hosting guide
