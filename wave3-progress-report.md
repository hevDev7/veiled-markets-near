# Veiled Markets — Wave 3 Progress Report

**Period:** Feb 20, 2026 — Mar 6, 2026
**Branch:** `main`
**Live Demo:** https://veiledmarkets.xyz
**Deployed Contract:** `veiled_markets_v17.aleo` (v18 built, deployment pending)
**Repository:** https://github.com/hevDev7/veiled-markets-near

---

## 1. Smart Contract: v17 → v18 Security Upgrade

### v18 Security Fixes (from v17 Audit)

| ID | Severity | Fix |
|----|----------|-----|
| S-01 | High | `init_multisig`: Added deployer-only restriction + unique signer validation (prevents unauthorized multisig creation) |
| S-02 | High | `ProposalSeed`: Now includes `recipient` + `token_type` fields (prevents proposal replay/redirect attacks) |
| S-03 | High | `propose_treasury_withdrawal`: Renamed from `propose_withdrawal`, added `token_type` + `nonce` parameters for unambiguous withdrawal proposals |
| S-04 | High | `execute_proposal` / `exec_proposal_usdcx`: Added `token_type` validation + post-execution approval cleanup (prevents double-execution) |
| S-05 | Medium | `cancel_market`: Excluded `STATUS_PENDING_RESOLUTION` from emergency cancel targets (prevents premature cancellation during dispute window) |

### v18 Build Details
- **Statements:** 1,965
- **Transitions:** 30 (29 Leo + 1 injected Aleo instructions)
- **Injected transition:** `buy_shares_private_usdcx` — Written in raw Aleo instructions and injected post-build via `contracts/scripts/inject_private_usdcx.sh` due to Leo 3.4.0 compiler bug ETYC0372117
- **Build workflow:** `leo build` → `./scripts/inject_private_usdcx.sh` → `snarkos developer deploy` (NOT `leo deploy` to preserve injection)
- **Status:** Built and tested locally. Deployment to testnet pending (estimated ~63 ALEO fee).

### FPMM Architecture (Carried from v14+)
- Fixed Product Market Maker with complete-set minting for 2-4 outcome markets
- Per-trade fees: 0.5% protocol + 0.5% creator + 1% LP = 2% total
- Dual-token support: ALEO native + USDCX stablecoin markets
- Privacy-first: all buy/sell/redeem/refund use private credits records

---

## 2. Frontend: Major UI/UX Overhaul

### 2.1 New Components & Systems

| Component | Description |
|-----------|-------------|
| `ProbabilityChart.tsx` | Real-time probability chart using Recharts with per-outcome color coding, time range filters (1h/6h/24h/all), pulsing dots on latest data points |
| `price-history.ts` | Price snapshot recording system — stores market prices over time for chart visualization. Dual storage: localStorage (instant) + Supabase (persistent) |
| `useGlobalTicker.ts` | Single shared `setInterval(1000)` hook using `useSyncExternalStore` — replaces per-component countdown timers, auto-starts/stops based on subscriber count |
| `ErrorBoundary.tsx` | React error boundary with graceful fallback UI showing error message in dev mode |
| `EmptyState.tsx` | Reusable empty state component with customizable icon, title, and description |
| `MobileNav.tsx` | Bottom navigation bar for mobile with route-based hiding (hidden on Landing and MarketDetail pages) |

### 2.2 Dashboard Redesign
- Complete dashboard rewrite with bento-grid layout
- Market discovery with category filters, search, token filter (ALEO/USDCX), and sort options
- Dual view modes: grid (MarketCard) and list (MarketRow) with toggle
- **YOUR_POSITIONS** panel showing active buy positions (sell bets now correctly excluded)
- Notification system: per-wallet dismissed state, CLEAR_ALL button, individual dismiss (X), bell icon with unread count badge
- Bookmark system with localStorage persistence
- Activity feed showing recent market events
- Pending market resolution tracking with retry status
- Real bet count from Supabase (`fetchBetCountByMarket`)

### 2.3 Market Detail Page Enhancements
- Integrated `ProbabilityChart` with time range selector
- Buy/Sell tabs with full FPMM trade preview (shares, fees, price impact, slippage)
- Sell flow: paste OutcomeShare record → parse → preview → execute
- Share/bookmark buttons with accessibility attributes
- OddsChart shows "—" when no bets placed (instead of hiding)

### 2.4 MarketCard & MarketRow Updates
- Multi-outcome support (2-4 outcomes) with per-outcome color bars and labels
- FPMM price display from AMM reserves
- Leading outcome highlighting with percentage and payout multiplier
- Live countdown timers using shared global ticker (no per-card intervals)
- Token type badge (ALEO/USDCX)

### 2.5 BuySharesModal Improvements
- Multi-outcome selector with market-specific labels
- Trade preview: shares received, fees breakdown, price impact, potential payout
- Slippage tolerance setting
- `expected_shares` pattern: frontend pre-computes, contract validates `shares_out >= expected_shares`

---

## 3. UI/UX Audit — 17 Findings Fixed

### Round 1 (8 findings)
| # | Finding | Fix |
|---|---------|-----|
| 1 | MobileNav overlaps content on MarketDetail | Route-based hiding + `pb-20 md:pb-0` padding on all pages |
| 2 | Landing KPI stats hardcoded misleading numbers | Changed to non-misleading: "ZK" / "Live" / "100%" |
| 3 | Settings preferences not persisted | Added `getSetting()`/`setSetting()` helpers with localStorage persistence |
| 4 | DisputePanel bond showed market token instead of ALEO | Bond display hardcoded to ALEO (on-chain constraint: dispute bond always in ALEO) |
| 5 | Notification UX incomplete (no dismiss/clear) | Added per-notification X dismiss + CLEAR_ALL button |
| 6 | Accessibility missing on interactive elements | Added `aria-label` and `focus-visible:ring-2` to bell, copy, share, bookmark, view-toggle buttons |
| 7 | Timer per-card creates N intervals for N cards | Replaced with `useGlobalTicker` — single shared interval for all countdown consumers |
| 8 | CreateMarketModal form data lost on accidental close | Added draft auto-save to localStorage + confirm dialog on close with unsaved data |

### Round 2 (3 findings)
| # | Finding | Fix |
|---|---------|-----|
| 9 | DisputePanel hardcoded to 2 outcomes | Now uses `market.numOutcomes` and `market.outcomeLabels` |
| 10 | Dismissed notifications global (not per-wallet) | Scoped localStorage key with wallet address suffix |
| 11 | localStorage unguarded in render path | Wrapped all localStorage access in try/catch for SSR/sandboxed environments |

### Round 3 (6 findings)
| # | Finding | Fix |
|---|---------|-----|
| 12 | `wallet.address` nullable but used as string | Added `if (!wallet.address) return` null guards in handlers |
| 13 | `'claimed'` not in Bet status union type | Removed invalid status check from filter |
| 14 | Unused imports causing TypeScript warnings | Removed `type Bet`, `getPriceHistory`, `PriceSnapshot` unused imports |
| 15 | Sell bets showing "Won"/"Lost" in Settled tab | "Completed" badge for sell bets, excluded from `syncBetStatuses` |
| 16 | History page outcome shows "OPTION D" not real label | Added `outcomeLabels` resolution matching Dashboard/MyBets pattern |
| 17 | History page text oversized vs MyBets | Reduced all text/padding/icon sizes to match MyBets card styling |

---

## 4. Critical Bug Fixes

### 4.1 CSP Blocking Page Render (Brave Browser)
- **Problem:** Content Security Policy header set by Vite dev server included `'unsafe-inline'`, but Brave Shields strips it — causing React Refresh preamble to be blocked, resulting in blank page
- **Root cause 1:** `vite.config.js` (stale) was overriding `vite.config.ts` — Vite prefers `.js` over `.ts` when both exist
- **Root cause 2:** Even after fixing, Brave Shields strips `'unsafe-inline'` from CSP headers
- **Fix:** Removed CSP header entirely from Vite dev server config. CSP is a production concern — should be set by the production web server (nginx, Vercel headers). Only COOP/COEP headers kept (required for SharedArrayBuffer/WASM).

### 4.2 Bets Not Syncing Across Domains (localhost vs veiledmarkets.xyz)
- **Problem:** Bets placed on localhost don't appear on deployed Vercel site (same wallet)
- **Root cause:** `saveBetsToStorage()`, `savePendingBetsToStorage()`, `saveCommitmentRecordsToStorage()`, and `flushToSupabase()` all had `if (encryptionKey)` guard — Shield Wallet doesn't support `signMessage` (or times out), so encryption key is never derived, and bets are NEVER synced to Supabase. Since localStorage is per-domain, data is stranded.
- **Fix:** Removed `encryptionKey` guard from all 4 sync points. The `enc()`/`dec()` helpers in `supabase.ts` already handle null keys gracefully (plaintext pass-through). Bets now always sync to Supabase regardless of encryption key availability.

### 4.3 Sold Bets Showing in "Your Positions" (Dashboard)
- **Problem:** Dashboard YOUR_POSITIONS panel included sell-type bets alongside buy positions
- **Fix:** Added `b.type !== 'sell'` filter to both `pendingBets` and `userBets` in the positions list

### 4.4 "OUTCOME_4" Displayed Instead of Real Label (Dashboard, MyBets, History)
- **Problem:** Multiple pages displayed raw `bet.outcome.toUpperCase()` which for outcomes 3-4 produces `"OUTCOME_3"` / `"OUTCOME_4"` instead of the actual market label
- **Fix:** Consistent label resolution across all 3 pages: `market.outcomeLabels[idx-1]` → fallback to default labels (`YES/NO/OPTION C/OPTION D`) → final fallback to raw outcome string

### 4.5 Sell Bets Incorrectly Showing "Won"/"Lost" in My Bets
- **Problem:** Sell bets (completed share sales) appeared with "Won"/"Lost" badges in the Settled tab, and `syncBetStatuses` applied win/loss logic to sell bets
- **Fix:** Added `b.type !== 'sell'` filter to `syncBetStatuses`. Sell bets in Settled tab now show "Completed" badge instead of Won/Lost. Sell bets excluded from Accepted tab (they belong in Settled only).

### 4.6 History Page Text Sizing Mismatch
- **Problem:** History page cards had significantly larger text than My Bets page cards
- **Fix:** Reduced all sizing to match MyBets: `p-6→p-5`, `w-12→w-10`, icons `w-6→w-5`, title `text-lg→text-sm`, amounts `text-sm→text-xs`, labels `text-xs→text-[10px]`. Added profit line for winning bets for consistency.

---

## 5. Database Schema Updates

### New Table: `price_snapshots`
```sql
CREATE TABLE IF NOT EXISTS price_snapshots (
  market_id TEXT NOT NULL,
  timestamp BIGINT NOT NULL,
  prices JSONB NOT NULL,
  PRIMARY KEY (market_id, timestamp)
);
CREATE INDEX idx_price_snapshots_time ON price_snapshots (market_id, timestamp DESC);
```
- Stores periodic market probability snapshots for the ProbabilityChart
- Supabase CRUD functions: `upsertPriceSnapshot()`, `fetchPriceSnapshots()`
- Dual-write: localStorage (instant render) + Supabase (cross-device persistence)

### New Function: `fetchBetCountByMarket()`
- Counts bets per market from `user_bets` table for display in OddsChart

---

## 6. Infrastructure & Build

| Item | Detail |
|------|--------|
| Vite config migration | Deleted stale `vite.config.js`, consolidated to `vite.config.ts` only |
| Dev server | Removed CSP from dev headers; kept COOP/COEP for SharedArrayBuffer |
| Package updates | `recharts` added for probability charts |
| TypeScript | Zero type errors (`npx tsc --noEmit` passes clean) |
| Supabase sync | Removed encryption-key gate — data syncs immediately (plaintext if no key) |

---

## 7. Files Modified (34 files, +2615 / -724 lines)

### New Files
- `frontend/src/components/ProbabilityChart.tsx`
- `frontend/src/components/ErrorBoundary.tsx`
- `frontend/src/components/EmptyState.tsx`
- `frontend/src/components/MobileNav.tsx`
- `frontend/src/hooks/useGlobalTicker.ts`
- `frontend/src/lib/price-history.ts`
- `contracts/aleo/buy_shares_private_usdcx.aleo`
- `contracts/scripts/inject_private_usdcx.sh`
- `supabase-schema.sql` (price_snapshots table)

### Major Modifications
- `frontend/src/pages/Dashboard.tsx` — Complete redesign (+723 lines)
- `frontend/src/pages/MarketDetail.tsx` — Buy/sell flow, charts (+206 lines)
- `frontend/src/pages/MyBets.tsx` — Multi-outcome labels, sell bet "Completed" badge, profit line
- `frontend/src/pages/History.tsx` — Outcome label resolution, text sizing to match MyBets, profit line
- `frontend/src/components/MarketCard.tsx` — Multi-outcome, FPMM prices
- `frontend/src/components/MarketRow.tsx` — Multi-outcome, global ticker
- `frontend/src/lib/store.ts` — Supabase sync fix, sell bet filtering
- `frontend/src/lib/supabase.ts` — Price snapshots, bet count functions
- `frontend/src/pages/Settings.tsx` — Persistent preferences
- `frontend/src/components/CreateMarketModal.tsx` — Draft auto-save
- `frontend/src/components/DisputePanel.tsx` — Multi-outcome + ALEO bond
- `frontend/vite.config.ts` — CSP removal, config cleanup
- `contracts/src/main.leo` — v18 security fixes

---

## 8. On-Chain Activity

### Deployed Programs
- `veiled_markets_v22.aleo` — Currently active on testnet (Deploy TX: at1mke82n86z838m9dwsktvkzr63wkq2t4ham2heynhrutz5r90nvgs3mktmf)
- `veiled_markets_v17.aleo` — Previous version (deprecated)

### v13 Markets on Testnet (4 active)
1. Test #1 (2 ALEO) — `175421318...530field`
2. Test #2 (2 ALEO) — `787400183...223field`
3. Test #3 (10 ALEO) — `815822091...302field`
4. Test #4 (4 ALEO) — `577833389...996field`

### v11 Markets on Testnet (6 active)
1. BTC $200k 2026
2. Test Market
3. Elon Musk tweets
4. Trump Truth Social
5. Netflix NFLX
6. TSA Passengers Feb 19

### Program Balance
- Program address: `aleo1nty5vnftfsqurjhj9xj0phyv806nl9mse3aj7n2se9xw9k7nssxqcnq9qx`
- Holds 19 ALEO total across 4 markets
- 1 `buy_shares_public` transaction confirmed on market #1

---

## 9. Known Limitations & Next Steps

### Current Limitations
- Shield Wallet `signMessage` may not work → bet data syncs as plaintext (not encrypted) to Supabase
- v18 not yet deployed to testnet (requires ~63 ALEO deployment fee)
- Leo Wallet cannot handle v18's 4-level import chain (Shield Wallet is primary)

### Planned Next
- Deploy v18 to testnet
- Add Supabase Row Level Security policies for bet data
- Implement encrypted Supabase sync with fallback UI prompt for signature
- Price history migration from localStorage to Supabase (partially done)
- Production CSP headers via Vercel configuration
