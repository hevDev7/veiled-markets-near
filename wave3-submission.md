# Wave 3 Buildathon Submission — Veiled Markets

---

## Updates in this Wave (Wave 3)

Live Demo: https://veiledmarkets.xyz
Contract: veiled_markets_v22.aleo (deployed on testnet)
Deploy TX: at1mke82n86z838m9dwsktvkzr63wkq2t4ham2heynhrutz5r90nvgs3mktmf
Repository: https://github.com/hevDev7/veiled-markets-near

**Smart Contract v22 — Security & Privacy Fixes**
Deployed v22 (29 transitions, all native Leo) to Aleo Testnet. ALEO trading uses full privacy via `buy_shares_private` (`transfer_private_to_public`); USDCX currently uses public path via `buy_shares_usdcx` (`transfer_public_as_signer`) — private USDCX trading (`buy_shares_private_usdcx`) is planned for Wave 5 pending resolution of a Leo compiler bug (ETYC0372117) that prevents passing imported struct arrays to cross-program calls. Privacy fix from Wave 2 judge feedback: removed unused `claimer: address` parameter from 3 finalize functions (claim_dispute_bond, claim_lp_refund, claim_lp_refund_usdcx) — address was leaked on-chain without serving any purpose since claim_key is already hashed in the private transition layer. Five security fixes from v17 audit: deployer-only multisig init with unique signer validation, ProposalSeed includes recipient + token_type preventing replay/redirect attacks, propose_treasury_withdrawal adds token_type + nonce params, execute_proposal validates token_type and cleans approvals post-execution preventing double-execution, cancel_market excludes STATUS_PENDING_RESOLUTION from emergency cancel. Additional fixes: claim_dispute_bond allows claim on CANCELLED markets (bond recovery), sell FPMM underflow guard.

**Frontend — Complete UI/UX Overhaul**
Redesigned dashboard with bento-grid layout: category filters, search, token filter (ALEO/USDCX), dual view modes (grid/list), YOUR_POSITIONS panel, notification system with per-wallet state, bookmarks, and activity feed. New ProbabilityChart with time range filters and per-outcome color coding. Market cards support 2-4 outcomes with FPMM price display, leading outcome highlighting, and live countdown via shared global ticker. Buy/Sell flow includes trade preview with shares, fee breakdown (2% total), price impact, slippage tolerance, and expected_shares validation.

**17 UI/UX Audit Findings Fixed**
Three audit rounds: mobile nav overlap, settings persistence, dispute panel multi-outcome support, accessibility (aria-labels, focus-visible), CreateMarketModal draft auto-save, cross-domain bet sync fix for Shield Wallet, sell bets correctly categorized as "Completed" instead of Won/Lost, outcome label resolution across Dashboard/MyBets/History, and consistent text sizing.

**Critical Bug Fixes & Infrastructure**
Fixed Brave browser CSP blocking, cross-domain bet sync when Shield Wallet can't derive encryption key, and background resolution for pending Supabase market entries via on-chain TX ID lookup. New price_snapshots table in Supabase for persistent probability chart data with dual-write (localStorage + Supabase).

**On-Chain Activity**
Multiple markets created and traded with ALEO and USDCX tokens, 2-4 outcomes. Active buy_shares, sell_shares, and buy_shares_usdcx transactions confirmed on testnet.

---

## 5th Wave Milestone

Private USDCX Trading: Implement `buy_shares_private_usdcx` transition using `transfer_private_to_public` for USDCX tokens, giving stablecoin traders the same privacy guarantees as ALEO traders. Currently blocked by Leo compiler bug ETYC0372117 (`[ImportedProgram/Struct; N]` arrays can't be passed to imported function calls). Workaround: write the transition in Aleo instructions and inject post-build, or wait for Leo compiler fix.

Backend Indexer Upgrade: Extend the existing block scanner into a full event indexer. Real-time scanning of all veiled_markets_v22 transitions into PostgreSQL — market creation, share trades, resolutions, disputes, and LP events. Foundation for analytics, historical queries, and the REST API planned for Wave 6.

Market Analytics Dashboard: New /analytics route showing protocol-wide metrics: total value locked, cumulative trading volume, active markets count, and recent activity feed. Per-market charts showing price movement and volume over time, powered by the upgraded indexer.

Community Feedback Integration: Address bugs and UX issues reported by testnet users during Waves 3-4. Prioritize trading flow reliability, wallet compatibility improvements, and edge cases discovered through real usage.
