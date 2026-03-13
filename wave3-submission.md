# Wave 3 Buildathon Submission — Veiled Markets

---

## Updates in this Wave (Wave 3)

Live Demo: https://veiledmarkets.xyz
Contract: veiled_markets_v22.aleo (deployed on testnet)
Deploy TX: at1mke82n86z838m9dwsktvkzr63wkq2t4ham2heynhrutz5r90nvgs3mktmf
Repository: https://github.com/hevDev7/veiled-markets-near

**Smart Contract v22 — Security & Privacy Fixes**
Deployed v22 (29 transitions, all native Leo). ALEO trading uses full privacy via `buy_shares_private` (`transfer_private_to_public`); USDCX uses public path via `buy_shares_usdcx` — private USDCX planned for Wave 5 pending Leo compiler bug ETYC0372117. Privacy fix from Wave 2 judge feedback: removed unused `claimer: address` from 3 finalize functions (claim_dispute_bond, claim_lp_refund, claim_lp_refund_usdcx) — address was leaked on-chain without purpose since claim_key is already hashed in the private transition layer. Five security fixes: deployer-only multisig init with unique signer validation, ProposalSeed includes recipient + token_type preventing replay/redirect, propose_treasury_withdrawal adds token_type + nonce, execute_proposal validates token_type and cleans approvals preventing double-execution, cancel_market excludes STATUS_PENDING_RESOLUTION. Additional: dispute bond claimable on CANCELLED markets, sell FPMM underflow guard.

**Frontend — Complete UI/UX Overhaul**
Bento-grid dashboard: category filters, search, token filter (ALEO/USDCX), grid/list views, YOUR_POSITIONS panel, notifications with per-wallet state, bookmarks, activity feed. ProbabilityChart with time range filters and per-outcome color coding. Market cards support 2-4 outcomes with FPMM prices, leading outcome highlight, live countdown. Buy/Sell flow with trade preview, fee breakdown (2%), price impact, slippage tolerance, and expected_shares validation.

**17 UI/UX Audit Findings Fixed**
Three audit rounds covering: mobile nav overlap, settings persistence, dispute panel multi-outcome support, accessibility (aria-labels, focus-visible), CreateMarketModal draft auto-save, cross-domain bet sync for Shield Wallet, sell bets categorized as "Completed", outcome label resolution across all pages, and consistent text sizing.

**Critical Bug Fixes & Infrastructure**
Fixed Brave CSP blocking, cross-domain bet sync for Shield Wallet encryption, and background resolution for pending Supabase entries via on-chain TX ID lookup. New price_snapshots table with dual-write (localStorage + Supabase).

**On-Chain Activity**
Multiple markets created and traded with ALEO and USDCX tokens, 2-4 outcomes. Active buy_shares, sell_shares, and buy_shares_usdcx transactions on testnet.

---

## 5th Wave Milestone

Private USDCX Trading: Implement `buy_shares_private_usdcx` using `transfer_private_to_public` for USDCX, giving stablecoin traders the same privacy as ALEO traders. Blocked by Leo bug ETYC0372117. Workaround: write transition in Aleo instructions and inject post-build.

Backend Indexer: Extend block scanner into a full event indexer — real-time scanning of all v22 transitions into PostgreSQL for analytics and the REST API planned in Wave 6.

Analytics Dashboard: New /analytics route with protocol metrics (TVL, volume, active markets) and per-market price/volume charts powered by the indexer.

Community Feedback: Fix bugs and UX issues from testnet users in Waves 3-4 — trading flow reliability, wallet compatibility, and edge cases.
