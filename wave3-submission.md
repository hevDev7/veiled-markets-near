# Wave 3 Buildathon Submission — Veiled Markets

---

## Updates in this Wave (Wave 3)

Live Demo: https://veiledmarkets.xyz
Contract: veiled_markets_v23.aleo (deployed on testnet)
Deploy TX: at1ptm4dz9kz5775lchnfy5xk4c6ykprsalzfkg05xql42jxjf3vyqscceayl
Repository: https://github.com/hevDev7/veiled-markets-near

**Smart Contract v23 — Full Privacy Restored**
Deployed v23 (30 transitions, ~2,100 statements, 29 Leo + 1 injected Aleo instructions) to Aleo Testnet. Restored `buy_shares_private_usdcx` for fully private USDCX trading — workaround for snarkVM parser bug: flattened MerkleProof inputs (`[field; 16] + u32`) reconstructed internally via `cast` instructions, bypassing the parser's inability to handle `input ... as imported/Struct.private` declarations. Both ALEO and USDCX now support full privacy via `buy_shares_private` and `buy_shares_private_usdcx` respectively. Privacy fix from Wave 2 judge feedback: removed unused `claimer: address` parameter from 4 finalize functions — address was leaked on-chain without serving any purpose since claim_key is already hashed in the private transition layer. Five security fixes from v17 audit carried from v18: deployer-only multisig init with unique signer validation, ProposalSeed includes recipient + token_type preventing replay/redirect attacks, propose_treasury_withdrawal adds token_type + nonce params, execute_proposal validates token_type and cleans approvals post-execution preventing double-execution, cancel_market excludes STATUS_PENDING_RESOLUTION from emergency cancel. Additional fixes: claim_dispute_bond allows claim on CANCELLED markets (bond recovery), sell FPMM underflow guard.

**Frontend — Complete UI/UX Overhaul**
Redesigned dashboard with bento-grid layout: category filters, search, token filter (ALEO/USDCX), dual view modes (grid/list), YOUR_POSITIONS panel, notification system with per-wallet state, bookmarks, and activity feed. New ProbabilityChart with time range filters and per-outcome color coding. Market cards support 2-4 outcomes with FPMM price display, leading outcome highlighting, and live countdown via shared global ticker. Buy/Sell flow includes trade preview with shares, fee breakdown (2% total), price impact, slippage tolerance, and expected_shares validation. USDCX buy flow now tries private Token record first, falls back to public transfer.

**17 UI/UX Audit Findings Fixed**
Three audit rounds: mobile nav overlap, settings persistence, dispute panel multi-outcome support, accessibility (aria-labels, focus-visible), CreateMarketModal draft auto-save, cross-domain bet sync fix for Shield Wallet, sell bets correctly categorized as "Completed" instead of Won/Lost, outcome label resolution across Dashboard/MyBets/History, and consistent text sizing.

**Critical Bug Fixes & Infrastructure**
Fixed Brave browser CSP blocking, cross-domain bet sync when Shield Wallet can't derive encryption key, and background resolution for pending Supabase market entries via on-chain TX ID lookup. New price_snapshots table in Supabase for persistent probability chart data with dual-write (localStorage + Supabase).

**On-Chain Activity**
Multiple markets created and traded with ALEO and USDCX tokens, 2-4 outcomes. Active buy_shares, sell_shares, buy_shares_usdcx, and buy_shares_private_usdcx transactions confirmed on testnet.

---

## 5th Wave Milestone

Backend Indexer Upgrade: Extend the existing block scanner into a full event indexer. Real-time scanning of all veiled_markets_v23 transitions into PostgreSQL — market creation, share trades, resolutions, disputes, and LP events. Foundation for analytics, historical queries, and the REST API planned for Wave 6.

Market Analytics Dashboard: New /analytics route showing protocol-wide metrics: total value locked, cumulative trading volume, active markets count, and recent activity feed. Per-market charts showing price movement and volume over time, powered by the upgraded indexer.

Community Feedback Integration: Address bugs and UX issues reported by testnet users during Waves 3-4. Prioritize trading flow reliability, wallet compatibility improvements, and edge cases discovered through real usage.
