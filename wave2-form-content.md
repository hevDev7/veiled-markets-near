# Veiled Markets — Wave 2 Form Content

> Copy-paste each section into the Akindo form fields.
> Character limits: Updates = 3000, Milestone 3rd/4th Wave = 1700 each.

---

## Updates in this Wave (max 3000 chars)

<!-- CHAR COUNT: 2996 / 3000 -->

Live Demo: https://veiledmarkets.xyz
Contract: veiled_markets_v16.aleo (Aleo Testnet) — https://testnet.explorer.provable.com/program/veiled_markets_v16.aleo
GitHub: https://github.com/hevDev7/veiled-markets-near

Since Wave 1, we shipped 14 contract iterations (v2→v16) and deployed a complete privacy-preserving prediction market with FPMM trading on Aleo Testnet.

FPMM AMM Engine: Replaced the parimutuel model with a Gnosis-style Fixed Product Market Maker. Complete-set minting for buys, tokens_desired approach for sells (avoids on-chain sqrt). Supports 2, 3, and 4 outcome markets. Per-trade fees: 0.5% protocol + 0.5% creator + 1% LP = 2% total.

Full Privacy Overhaul: Six transitions upgraded to use private credits.aleo records:
• buy_shares_private → transfer_private_to_public (buyer address hidden)
• sell_shares → transfer_public_to_private (seller address hidden)
• redeem_shares → transfer_public_to_private (winner identity hidden)
• claim_refund → transfer_public_to_private (refund recipient hidden)
• add_liquidity → transfer_private_to_public (LP identity hidden)
• dispute_resolution → transfer_private_to_public (disputer identity hidden)

Shield Wallet Integration: Shield is our primary wallet. All transaction flows — create market, buy/sell shares, resolve, dispute, claim — work through Shield's ProvableHQ adapter with executeTransaction(). Shield handles nested signer authorization for credits.aleo child transitions like transfer_public_as_signer. Auto-detects via window.shield injection on testnetbeta network. Leo Wallet and Puzzle Wallet also supported.

Market Resolution UI: Full 3-step resolve flow (Close → Resolve → Finalize) with live transaction status tracking, block countdown timers, Emergency Cancel detection for expired markets, and complete Dispute flow requiring 1 ALEO bond via private credits record.

Dual-Token Markets: ALEO (fully private buy) and USDCX (test_usdcx_stablecoin.aleo). Token type set at market creation. Note: USDCX buys use transfer_public_as_signer (buyer visible) because USDCX private transfers require freeze-list Merkle proofs not yet integrated — upgrade planned for Wave 5.

Sell Shares Flow: Complete sell UI with FPMM pricing. User specifies tokens to withdraw, contract computes shares needed via the tokens_desired formula — no sqrt required on-chain.

My Bets Revamp: Unredeemed shares tab, wallet-based share redemption, "Needs Resolution" filter, and live countdown timers showing time remaining before resolution deadline.

Encrypted Bet Storage: Supabase with AES-256-GCM client-side encryption. Sensitive fields (outcome, amount, shares) are encrypted with a wallet-derived key before storage. Same wallet on any device derives the same key.

Wave 1 Feedback Addressed: (1) Privacy leak in betting function — replaced with private records, buyer fully hidden. (2) Payout model didn't reflect bet-time odds — replaced with FPMM. (3) Create market stuck loading — fixed with isSubmitting guard and disabled button.

---

## 3rd Wave Milestone (max 1700 chars)

<!-- CHAR COUNT: 651 / 900 -->

Multi-Outcome Market UI: The contract supports 3 and 4 outcome markets on-chain. Wave 3 adds frontend support: outcome selector grid, per-outcome buy/sell modals with FPMM pricing, and probability donut chart for 3–4 slices.

Basic Market Statistics: Add stats section on each market page showing pool reserves, total volume, participant count, and price movement. Data from on-chain mappings via Aleo API.

UI Polish: Better loading states, clearer wallet error messages, retry for failed queries. Fix community-reported bugs from Wave 2 testing.

Performance Caching: Client-side cache for blockchain data to reduce API calls and improve load times.

---

## 4th Wave Milestone (max 1700 chars)

<!-- CHAR COUNT: 715 / 900 -->

LP Provision UI: Frontend for add_liquidity and remove_liquidity transitions already on-chain. LP overview panel showing position, fee earnings, and pool share percentage.

User Betting History: Profile page with betting history across all markets — bets, outcomes, wins/losses, and unredeemed positions. Data from encrypted Supabase storage.

Private Record Inputs: Enable private credits.aleo record selection for add_liquidity and dispute_resolution, keeping wallet address hidden on-chain.

Mobile Responsive Start: Responsive layout for Dashboard and MarketDetail pages. Touch-friendly trading panel and wallet connection for mobile.

Community Feedback: Address bugs and UX issues from Wave 2–3 testnet users.

---

## 5th Wave Milestone (max 1700 chars)

<!-- CHAR COUNT: 1186 / 1700 -->

Backend Indexer Service: Deploy a lightweight indexer that scans Aleo blocks for veiled_markets_v16 transitions. Indexes market creation, share trades, resolutions, and disputes into PostgreSQL. This is the foundation for analytics and historical data that can't be efficiently queried from on-chain mappings alone.

Market Analytics Page: New /analytics route powered by the indexer. Shows protocol-wide metrics: total value locked, cumulative volume, active markets count, and recent activity feed. Per-market charts showing price history and volume over time.

Open Market Creation: Remove the allowlist restriction so any connected wallet can create a market. Add input validation, category selection, resolution source field, and a preview step before on-chain submission. Market creators set initial liquidity, resolution deadline, and token type (ALEO or USDCX).

USDCX Privacy Upgrade: Integrate transfer_private_to_public for USDCX markets. The stablecoin contract supports it but requires freeze-list Merkle proofs (2x MerkleProof with 16-depth tree). Wave 5 adds: accepting USDCX Token records as input, fetching the freeze list Merkle tree, and computing proofs client-side.

---

## 6th Wave Milestone (max 1700 chars)

<!-- CHAR COUNT: 1102 / 1700 -->

REST API v1: Public API built on top of the indexer. Endpoints: list markets, get market details/odds, trade history, user statistics (authenticated), and protocol metrics. JSON responses with pagination. Serves as the data layer for third-party integrations and our own frontend performance improvements.

TypeScript SDK (Alpha): Publish @veiled-markets/sdk on npm. Initial scope: FPMM calculation utilities (quote buy/sell amounts, compute slippage), market data fetchers using the REST API, and helper functions for formatting Aleo field types. Enables developers to build on top of Veiled Markets without understanding Leo internals.

Full Mobile Responsive: Complete responsive redesign across all pages and modals. Tablet and phone layouts for Dashboard, MarketDetail, MyBets, and all trading modals. Test across Shield Wallet mobile browser and common mobile wallets.

Supabase RLS Policies: Implement Row Level Security on all Supabase tables. Users can only read/write their own bet data. Market registry remains publicly readable. Add rate limiting and abuse prevention at the database level.

---

## 7th Wave Milestone (max 1700 chars)

<!-- CHAR COUNT: 1031 / 1700 -->

SDK v1 Release: Expand the SDK with transaction builders for core transitions (create market, buy/sell shares, redeem). Wallet adapter integration so SDK users can connect Shield, Leo, or Puzzle wallets programmatically. Add comprehensive documentation with code examples for common use cases.

Notification System: Email or browser push notifications for key events — market approaching resolution deadline, bet outcome resolved, shares ready to redeem, dispute window opening. Users opt-in via profile settings. Powered by indexer event detection.

Creator Dashboard: Dedicated interface for market creators to manage their markets — view trading activity, fee earnings, initiate resolution flow, and track dispute status. Aggregate view of all markets created by the connected wallet.

API Documentation Site: Interactive API docs with OpenAPI spec, request/response examples, authentication guide, and rate limit information. Self-hosting guide: Docker Compose setup for deploying frontend, indexer, and database independently.

---

## 8th Wave Milestone (max 1700 chars)

<!-- CHAR COUNT: 1009 / 1700 -->

Security Audit Preparation: Comprehensive internal review of the Leo contract — test all edge cases for FPMM calculations, overflow scenarios, dispute timing attacks, and multi-outcome resolution correctness. Document all findings and fix any issues before external audit.

Contract Optimization: Analyze constraint count and identify optimization opportunities to reduce deployment cost and transaction fees on mainnet. Profile gas usage across all 30 transitions. Optimize critical paths (buy/sell shares) for lower proving time.

Mainnet Deployment Plan: Research Aleo mainnet requirements — token bridging, fee economics, program migration strategy from testnet. Prepare deployment scripts and verify all dependencies (credits.aleo, stablecoin) exist on mainnet or have equivalents.

Stress Testing: Load test the full stack — frontend, API, indexer, and Supabase — under simulated high-traffic conditions. Identify bottlenecks and optimize. Test concurrent market creation, trading, and resolution flows.

---

## 9th Wave Milestone (max 1700 chars)

<!-- CHAR COUNT: 976 / 1700 -->

Mainnet Deployment: Deploy the audited and optimized contract to Aleo mainnet. Migrate frontend to point at mainnet endpoints. Update wallet configurations for mainnet network. Verify all transaction flows end-to-end on mainnet with real ALEO tokens.

Mainnet Launch UI: Landing page refresh for mainnet launch — updated branding, onboarding flow for new users, wallet setup guide, and FAQ section. Add testnet/mainnet network switcher so existing testnet users can transition smoothly.

Initial Mainnet Markets: Launch curated set of inaugural markets across multiple categories — crypto prices, world events, technology milestones. Seed initial liquidity to ensure functional trading from day one. Monitor and resolve any mainnet-specific issues.

Documentation Finalization: Complete all user-facing documentation — getting started guide, FAQ, market creation tutorial, LP provision guide, dispute process explanation, and privacy model overview. Publish on docs subdomain.

---

## 10th Wave Milestone (max 1700 chars)

<!-- CHAR COUNT: 1050 / 1700 -->

DAO Governance Markets: Partner with Aleo ecosystem DAOs to create governance prediction markets — members predict proposal outcomes, funding decisions, and protocol metrics. Demonstrates real-world utility beyond speculation. Custom market templates for governance use cases.

Ecosystem Integrations: Integrate with additional Aleo DeFi protocols — stablecoins (USAD), lending platforms, and DEXes. Explore cross-protocol composability where prediction market outcomes can trigger other DeFi actions.

Community Market Curation: Launch a community curation system where users can propose, vote on, and surface interesting markets. Reputation system based on market creation quality and resolution accuracy. Leaderboard for top creators and traders (privacy-preserving — opt-in only).

Growth & Sustainability: Implement protocol fee distribution to treasury. Publish a transparency report covering protocol metrics, fee revenue, and usage statistics. Plan governance token design for future decentralization of market curation and protocol upgrades.
