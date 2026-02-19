# Veiled Markets — Wave 2 Submission

## Updates in This Wave

**Live Demo:** https://veiledmarkets.xyz
**Contract:** [`veiled_markets_v16.aleo`](https://testnet.explorer.provable.com/program/veiled_markets_v16.aleo)

Since Wave 1 (v2), we shipped 14 contract iterations and deployed `veiled_markets_v16.aleo` on Aleo Testnet, delivering the complete trading lifecycle — buy, sell, resolve, dispute, and claim — all on-chain with wallet integration.

**Private Buy:** `buy_shares_private` calls `credits.aleo/transfer_private_to_public` internally. The user's address and trade amount are never exposed on-chain; the purchased position is returned as an encrypted `OutcomeShare` record in the wallet, keeping the outcome and quantity fully private.

**Sell Shares:** `sell_shares` uses a `tokens_desired` approach — users specify collateral to receive, and the contract computes shares needed via the FPMM formula, avoiding on-chain `sqrt`. Returns collateral as a private `credits.aleo` record via `transfer_public_to_private`, hiding the seller's identity and amount received.

**Privacy Hardening:** Five additional transitions were upgraded to full privacy. `redeem_shares` and `claim_refund` now use `transfer_public_to_private` — winner identity and refund recipients are fully hidden. `add_liquidity` and `dispute_resolution` now accept a private `credits.aleo` record as input via `transfer_private_to_public` — LP deposits and dispute bonds no longer expose addresses on-chain. A `withdraw_lp_resolved` transition was added to close a missing path where LP tokens had no withdrawal route after market resolution.

**Dual-Token Markets:** Creators choose ALEO (`1u8`) or USDCX (`2u8`) at creation. ALEO markets are fully private on the buy side; USDCX markets use `transfer_public_as_signer`, so the buyer's address is visible. Gas fees are always in ALEO regardless of token type.

**Market Resolution:** A 3-step Resolve tab guides resolvers through Close → Resolve → Finalize with live TX status and block countdown. The panel auto-detects expired unresolved markets and shows an Emergency Cancel banner. A full Dispute flow lets anyone bond 1 ALEO to challenge a resolution outcome.

**Claim & Tracking:** Overhauled `ClaimWinningsModal` and My Bets with an Unredeemed tab for wallet-based share redemption and refund claims. Dashboard gained a "Needs Resolution" filter and live countdown timers updating every second from block height.

**Deployment:** Live at https://veiledmarkets.xyz with stable build and COOP/COEP headers for WASM support.

---

## Addressing Wave 1 Feedback

Wave 1 reviewer (alex_aleo) raised three specific issues, all of which have been resolved in this wave:

**1. Privacy leakage in betting function** — The reviewer noted that `place_bet` called `transfer_public_as_signer`, which exposed the user's address and amount on-chain, and recommended switching to a private Credits record with `transfer_private_to_public`. This has been fully implemented: the new `buy_shares_private` transition accepts a private `credits.aleo` record from the user and calls `transfer_private_to_public` internally. The user's wallet address and trade amount are now completely hidden — only the program address appears as the recipient on-chain.

**2. Payout model did not incorporate odds at the time of the bet** — The parimutuel payout model used in v2 did not reflect the price at trade time. This has been replaced with a **Gnosis-style FPMM (Fixed Product Market Maker)** in v14/v16. Implied prices are now derived from pool reserves at the moment of the trade, and the `OutcomeShare` record stores the share quantity computed by the FPMM formula at execution time — giving users a fair, price-accurate position.

**3. Create market stuck loading** — The submission guard (`isSubmitting` state + disabled button after first click) was added to prevent double-submission. The production deployment is now stable with live markets open for trading at https://veiledmarkets.xyz.

---

*This is a 10-wave program. Milestones are distributed progressively across all remaining waves.*

## Privacy Improvements Implemented

All five high-priority privacy upgrades were implemented in this wave. The contract now uses `transfer_public_to_private` (program returns private credits record to user) and `transfer_private_to_public` (user provides private credits record to program) throughout:

**Priority 1 — `redeem_shares` → `transfer_public_to_private`** *(Highest impact — implemented)*
Winner identity is the most sensitive data. The payout is now returned as a private credits record — no one can tell who claimed winnings from a resolved market.

**Priority 2 — `sell_shares` → `transfer_public_to_private`** *(High impact — implemented)*
Collateral is now returned as a private credits record, hiding the seller's address and amount received.

**Priority 3 — `add_liquidity` → private credits input** *(Medium impact — implemented)*
Now accepts a private `credits.aleo` record and calls `transfer_private_to_public` internally — LP identity and deposit amount are fully hidden.

**Priority 4 — `claim_refund` → `transfer_public_to_private`** *(Medium impact — implemented)*
Refund claims now return a private credits record, decoupling refund receipt from the original participation.

**Priority 5 — `dispute_resolution` → private credits bond** *(Lower impact — implemented)*
Now accepts a private `credits.aleo` record for the bond via `transfer_private_to_public` — the disputer's address is no longer exposed.

**Priority 6 — USDCX full privacy** *(Requires stablecoin update — Wave 6)*
USDCX markets cannot be fully private until `test_usdcx_stablecoin.aleo` supports `transfer_private_to_public`. This requires a coordinated upgrade to the stablecoin contract.

---

## Wave 3 Milestones

Wave 3 will ship full UI support for **multi-outcome markets** with 3 and 4 outcomes beyond binary Yes/No, including updated buy/sell flows and pool breakdown displays. A **market analytics page** will surface volume trends, participation statistics, and per-market charts. **User profile pages** will display betting history, PnL tracking, and per-address statistics. The frontend will be updated to support the new private `credits.aleo` record inputs for `add_liquidity` and `dispute_resolution`. We will also publish **API documentation** and self-hosting guides.

## Wave 4 Milestones

Wave 4 will focus on product depth and developer reach. A **leaderboard** will rank participants by volume and prediction accuracy. **Market comments and discussions** will be added as on-page threads. A **notification system** will alert users to resolution, deadlines, and disputes. **USDCX stablecoin markets** will go fully live with a complete buy, sell, and redeem flow. Finally, we will publish the **`@veiled-markets/sdk` TypeScript SDK** for third-party integrations.

## Wave 5–10 Milestones (Outlook)

- **Wave 5** — Mobile-responsive UI, LP provision UI with private credits input, creator fee dashboard, indexer automation via cron
- **Wave 6** — Full USDCX privacy (requires stablecoin upgrade), on-chain governance (fee rates, resolver whitelist)
- **Wave 7** — DAO-style voting mechanism, protocol treasury management UI
- **Wave 8** — Security audit, deployment cost optimization, fee parameter tuning for mainnet
- **Wave 9** — Mainnet deployment, production hardening, bug bounty program
- **Wave 10** — Public launch, ecosystem integrations, third-party market creation open to all
