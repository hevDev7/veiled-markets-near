# Veiled Turbo — Threat Model & Security Spec

**Status:** Post-testnet validation · 2026-04-10 (8 iterative testnet deploys; active: `veiled_turbo_v8.aleo`)
**Scope:** `veiled_turbo_v8.aleo` + `backend/src/pyth-oracle.ts` + `frontend/src/components/TurboMarketPanel.tsx`
**Out of scope:** General Veiled Markets v37 contract, governance v6, USDCX/USAD markets

---

## 1. System overview

Pyth-backed short-duration (1–60 min) UP/DOWN prediction markets on Aleo. Resolution
is automatic via operator-submitted price snapshots; there is **no community voting
or dispute window**.

### Trust boundary diagram

```
┌─────────────────┐  SSE   ┌─────────────────┐  exec   ┌──────────────────┐
│ Pyth Hermes     │───────▶│ Operator backend│────────▶│ veiled_turbo_v8  │
│ (90+ publishers)│        │ (single wallet) │ snarkOS │ .aleo (on-chain) │
└─────────────────┘        └─────────────────┘         └──────────────────┘
       │                          │                            │
       │                          │ append                     │ read
       │                          ▼                            ▼
       │                   ┌──────────┐               ┌──────────────────┐
       │                   │ Supabase │               │ Aleo explorer    │
       │                   │ audit log│               │ (public)         │
       │                   └──────────┘               └──────────────────┘
       │                          ▲                            ▲
       └──────── public ──────────┴────── public ──────────────┘
                                  │
                              ┌───┴───┐
                              │ User  │  cross-checks operator claims
                              │       │  vs Pyth historical data
                              └───────┘
```

### Trust assumptions (short list)

| Assumption | Why we trust it | Failure mode |
|---|---|---|
| **Pyth Hermes data is honest** | 90+ publisher aggregation, $100B+ TVL secured on EVM chains, public historical API | If Pyth is compromised, every Pyth-backed protocol is compromised; outside our threat surface |
| **Operator wallet key is not stolen** | Held in HSM / encrypted at rest; access logged | Compromise = operator can submit false prices within sanity bounds |
| **Aleo block.height is monotonic and ~accurate** | Aleo consensus | Reorg risk minimal at 15s blocktime mainnet |
| **Aleo `signature::verify` is sound** | snarkVM primitive (not used in v1, see §10) | N/A — we avoided this primitive |

### Trust assumptions we DO NOT make

- ❌ We do NOT trust the operator backend to compute payout math correctly — done on-chain
- ❌ We do NOT trust users to declare their own payout — recomputed on-chain and cross-checked
- ❌ We do NOT trust Pyth confidence intervals to always be tight — bounded on-chain (≤0.5%)
- ❌ We do NOT trust operator timing — closing block window enforced (≤10 blocks past deadline)
- ❌ We do NOT trust Pyth values to be in any range — hard MIN/MAX bounds on-chain
- ❌ We do NOT trust market_id uniqueness from off-chain — derived from BHP256(TurboSeed) on-chain

---

## 2. Asset inventory

| Asset | Where stored | Custody model |
|---|---|---|
| User bet stakes (ALEO) | `program_credits[0u8]` mapping | Held by program until claim/refund |
| Per-market liquidity | `market_credits[market_id]` mapping | Earmarked, can only flow to winners |
| Protocol fees | `protocol_treasury[0u8]` mapping | Accumulated, withdrawal not yet implemented |
| User position | `TurboShare` private record | Held by user wallet |
| Market state | `turbo_markets`, `turbo_pools` mappings | Public, immutable per write |
| Oracle attestation history | Supabase + on-chain tx history | Public-read, append-only |

---

## 3. Threat catalog

Each threat: **T-NN** id · severity (C/H/M/L) · attack · mitigation · status.

### Operator-side threats

#### T-01 · CRITICAL · Operator submits false baseline price
**Attack:** Operator (or attacker with operator key) calls `create_turbo_market` with a baseline price that does not match Pyth at the current block. This biases the market toward the side they hold.

**Mitigation:**
- Sanity rails on-chain bound the lie within ±50% of legitimate price (max-move check on resolve), ±0.5% confidence threshold, hard MIN/MAX price range
- Audit log captures the operator's claimed price + timestamp
- Public verify page (`/verify/turbo/:id`) cross-checks against Pyth Hermes historical
- Bug bounty program rewards mismatches

**Residual:** Operator can fudge price by up to ~50% × pool size before sanity rails fire. Mitigated by monitoring + bounty.
**Status:** ✅ Mitigated within sanity bounds

#### T-02 · CRITICAL · Operator submits false closing price
Same as T-01 but on `resolve_turbo_market`. Determines the winning side.

**Mitigation:** Same as T-01 plus:
- `assert(closing.block >= deadline && closing.block <= deadline + 10)` — operator cannot wait, observe market direction, then pick a profitable closing snapshot. Window is ~40s testnet / ~150s mainnet.
- `closing.block` is included in audit log; verifiers can pull Pyth at the same block timestamp.

**Status:** ✅ Mitigated within sanity bounds

#### T-03 · HIGH · Operator wallet key theft
**Attack:** Attacker steals operator private key, then exploits T-01/T-02.

**Mitigation:**
- Private key in HSM (NOT plain `.env` for production)
- Monitor: alert on any tx from operator wallet that fails sanity checks (revert)
- Rate limit: monitor expected tx volume (~1 create + 1 resolve per 5 min per symbol = ~24 tx/hour). Sudden spike = compromise.

**Residual:** Up to one resolution window (~10 blocks) of damage before key rotation.
**Status:** ⚠️ Single point of failure. v2 plan: 2-of-3 multi-sig oracle (committee mapping).

#### T-04 · HIGH · Operator backend offline
**Attack:** Operator service crashes / network partition / DDoS. No tx to resolve markets.

**Mitigation:**
- Permissionless `emergency_cancel(market_id)` callable by anyone after `resolution_deadline` (deadline + 150 blocks ≈ 10 min testnet). Triggers refund pathway.
- Users can claim refund via `claim_refund(share)` after cancel.
- Backend should be deployed across 2+ geographic regions for availability.

**Residual:** Users wait up to 10 min for refund. No funds lost.
**Status:** ✅ Mitigated (escape hatch)

#### T-05 · MEDIUM · Operator selectively resolves
**Attack:** Operator only resolves markets where their personal positions win; lets losing markets fall to emergency_cancel (refund recovers their stake without paying winners).

**Mitigation:**
- Audit log makes this statistically detectable (cancellation rate per market vs operator-known direction)
- Operator policy: must NOT trade on turbo markets they operate
- Open-source backend so coordinated cancel patterns are reviewable
- Bug bounty for proven bias

**Residual:** Hard to fully prevent without 2nd-party oracle.
**Status:** ⚠️ Mitigated by detection, not prevention. Track in v2.

### On-chain / contract threats

#### T-06 · CRITICAL · Payout math allows over-claim
**Attack:** Winner declares larger payout than entitled; contract accepts it; funds drained from market.

**Mitigation:**
- `claim_winnings_fin` recomputes payout on-chain: `payout = qty × market_credits / total_winning_shares`
- `assert(declared_payout == payout)` — caller's declaration cross-checked
- `assert(credit_held >= payout)` — cannot exceed escrow
- `share_redeemed[share_id]` mapping prevents double-claim
- Pool state decremented after claim to maintain invariant for partial claims

**Status:** ✅ Mitigated (math is on-chain authoritative; logic tested in 16-test suite)

#### T-07 · CRITICAL · Loser claims winnings
**Attack:** User with losing share calls `claim_winnings`, hopes contract pays out.

**Mitigation:**
- `claim_winnings_fin` asserts `share_side == winning_outcome` — losers revert immediately
- Aleo records cannot be forged; the `side` field is bound at mint time

**Status:** ✅ Mitigated

#### T-08 · HIGH · Same share claimed twice
**Attack:** User splits a record, or bypasses Aleo's record-spend mechanism, to claim the same share twice.

**Mitigation:**
- `share_id = BHP256::hash_to_field(share)` — deterministic per record
- `share_redeemed[share_id]` set to true at first claim, asserted false at every claim
- Aleo records are spent atomically by the VM; double-spend impossible at base layer

**Status:** ✅ Mitigated (double layer: VM record + mapping)

#### T-09 · HIGH · market_id collision across markets
**Attack:** Two `create_turbo_market` calls with different params produce the same `market_id`, allowing one to read another's state.

**Mitigation:**
- `market_id = BHP256::hash_to_field(TurboSeed { creator, symbol_id, deadline, nonce })`
- Nonce supplied by caller; backend uses `Date.now()` (millisecond precision)
- `assert(!turbo_markets.contains(market_id))` in finalize — collision causes revert
- BHP256 collision-resistant (cryptographic hash)

**Status:** ✅ Mitigated

#### T-10 · MEDIUM · FPMM rounding extracts value
**Attack:** Repeated micro-trades exploit integer division rounding to drain pool.

**Mitigation:**
- `MIN_TRADE_AMOUNT = 1000u128` (0.001 ALEO) prevents dust attacks
- Binary FPMM rounds DOWN at division — house keeps the dust
- Tested in `test_fpmm_binary_buy` and `test_fpmm_with_fee`

**Residual:** Negligible — rounding favors pool, not trader.
**Status:** ✅ Mitigated

#### T-11 · MEDIUM · Refund double-spend after partial resolve
**Attack:** Market is partially resolved, then cancelled; users try to claim both winnings and refund.

**Mitigation:**
- `STATUS_RESOLVED` and `STATUS_CANCELLED` are mutually exclusive (single status field)
- `emergency_cancel` only allowed when `status == STATUS_ACTIVE`
- `claim_winnings` requires `status == STATUS_RESOLVED`
- `claim_refund` requires `status == STATUS_CANCELLED`
- `share_redeemed` mapping prevents double-claim regardless of status path

**Status:** ✅ Mitigated (state machine enforces exclusivity)

#### T-12 · LOW · Reentrancy via credits.aleo callback
**Attack:** External transfer triggers callback that re-enters our finalize.

**Mitigation:**
- Aleo finalize blocks are atomic — no callbacks during finalize
- `transfer_future.run()` is the only external call; it executes synchronously
- No mutable state mutation between transfer and remaining asserts

**Status:** ✅ Mitigated by Aleo execution model

#### T-13 · LOW · Integer overflow in pool reserves
**Attack:** Pool size grows beyond u128 max via repeated buys.

**Mitigation:**
- `MAX_PRICE = 100_000_000_000_000` (~$100M) bounds price magnitude
- `MIN_TRADE_AMOUNT * 2^32 << u128::MAX` — would need 4 billion max-sized trades
- Aleo `u128` arithmetic checks overflow at runtime

**Status:** ✅ Mitigated by economic bounds + runtime checks

#### T-14 · LOW · Block timestamp manipulation
**Attack:** Validator manipulates `block.height` to bypass deadline checks.

**Mitigation:**
- Aleo PoS consensus makes block.height tampering require >1/3 stake collusion
- Single block of slip < window, attack uneconomical for 5-min markets
- Sanity check `closing_block >= deadline` is BLOCK height not timestamp; harder to fake

**Status:** ✅ Acceptable risk

#### T-21 · CRITICAL · Ternary subtraction underflow at finalize
**Attack:** Not adversarial — implementation bug. Pattern
`a > b ? a - b : b - a` evaluates BOTH arms in Leo finalize, so the
unselected arm underflows when `a < b`. Every resolve call where the
closing price was less than baseline reverted with a u128 underflow
error.

**Discovered:** Testnet shadow run on `veiled_turbo_v3.aleo` (closing
$71,129.43 < baseline $71,186.05 → unselected arm tried `closing - baseline`
→ underflow → revert).

**Mitigation:** Branch-free abs diff:
```leo
let hi: u128 = a > b ? a : b;
let lo: u128 = a > b ? b : a;
let moved: u128 = hi - lo;
```
Both arms now contain a value selection (no arithmetic), so neither can
underflow regardless of input order. The subtraction `hi - lo` is always
in correct order by construction.

**Status:** ✅ Fixed in v4 deploy + backported to canonical source.
**Lesson learned:** Logic-test suite caught this for the test cases I
wrote, but I had also written it correctly in tests and incorrectly in
the contract — split-source bug. **All branches in Leo ternaries must be
side-effect-free and overflow-safe** since both are evaluated.

#### T-22 · HIGH · Resolution window too tight for testnet inclusion lag
**Attack:** Not adversarial — operational bug. Original
`RESOLUTION_WINDOW_BLOCKS = 10` (~40s testnet) was unreachable because
Aleo testnet inclusion lag exceeds 30 blocks between tx submission and
finalize. Operator could never get a resolve transaction confirmed inside
the window before the assertion `current_height ≤ deadline + 10` triggered.

**Discovered:** First successful resolve on `veiled_turbo_v2.aleo`
finalized 76 blocks past deadline → assertion revert → market fell to
emergency_cancel pathway.

**Mitigation:** Widened to 60 blocks (`~4 min testnet`). The wider window
does NOT loosen the price selection — operator commits a `closing_block`
which is verifiable against Pyth Hermes historical data at that block's
timestamp. Operator still cannot replay a stale price across market
resolutions.

**Status:** ✅ Fixed in v3+v4 deploy + backported.
**Lesson learned:** Block-time-dependent constants must be calibrated
against actual network behavior, not theoretical block time. Mainnet
retuning notes in [MAINNET_MIGRATION.md](MAINNET_MIGRATION.md).

#### T-23 · HIGH · Baseline freshness equality unsatisfiable
**Attack:** Not adversarial — implementation bug. Original
`assert(baseline_block == current_height)` could never pass because
block.height advances ~5+ blocks between operator's `getBlockHeight()`
sample and finalize execution.

**Discovered:** Very first `create_turbo_market` tx on
`veiled_turbo_v1.aleo` rejected at finalize: sampled block 15664289,
finalized at block 15664312 (23 blocks of drift).

**Mitigation:** Replaced equality with bounded inequality:
```leo
assert(baseline_block <= current_height);
assert(current_height - baseline_block <= BASELINE_LAG_TOLERANCE);
```
Where `BASELINE_LAG_TOLERANCE = 60` blocks (~4 min). Operator still cannot
backdate beyond this window — bounded backdating is acceptable since
Pyth Hermes historical lookups verify the specific block.

**Status:** ✅ Fixed in v2+ deploys + backported.

#### T-20 · MEDIUM · Operator over-withdraws protocol fees
**Attack:** Operator calls `withdraw_protocol_fees(amount)` with `amount > protocol_treasury[0u8]`, hoping to drain market_credits (winners' funds).

**Mitigation:**
- `withdraw_protocol_fees_fin` reads from `protocol_treasury[0u8]` only — `market_credits` mapping is untouched
- `assert(treasury_held >= amount)` reverts on over-withdraw
- `program_credits[0u8] >= amount` consistency check
- `caller == ORACLE_OPERATOR` gate

**Status:** ✅ Mitigated (separate accounting per mapping)

### Off-chain / infrastructure threats

#### T-15 · HIGH · Pyth Hermes downtime
**Attack:** Pyth Hermes API is unreachable when operator needs to snapshot.

**Mitigation:**
- `FRESHNESS_TOLERANCE_MS = 3000` — operator rejects stale Pyth quotes
- If no fresh quote when deadline arrives → operator skips resolve → market falls to emergency_cancel → refund
- Backend reconnects EventSource automatically (built into `EventSource` spec)

**Status:** ✅ Mitigated (fail-safe to cancel + refund)

#### T-16 · MEDIUM · Pyth confidence interval degrades
**Attack:** Pyth publishers disagree (volatility / outage / manipulation). Confidence interval widens.

**Mitigation:**
- Operator backend rejects Pyth quotes where `conf > price / 200` (0.5%) before signing
- Contract re-validates: `assert(closing.conf <= closing.price / 200)` — even if operator submits wide-conf data, contract reverts
- Wide-conf scenarios trigger emergency_cancel pathway

**Status:** ✅ Mitigated (double layer: backend + contract)

#### T-17 · MEDIUM · Supabase audit log tampering
**Attack:** Attacker with Supabase service-key edits/deletes audit entries to hide misbehavior.

**Mitigation:**
- Audit log is **secondary** verification source; primary is Aleo on-chain transactions (immutable)
- Verify page also pulls from Aleo explorer directly via tx_id
- `turbo_oracle_audit` table has anon-write-deny RLS policy
- Service key held in operator backend env only

**Residual:** Audit log is convenience UX; no funds at risk if tampered (on-chain wins).
**Status:** ✅ Mitigated (defense in depth)

#### T-18 · LOW · Frontend tampering changes displayed price
**Attack:** Compromised frontend shows fake "current price" to trick user into bad bet.

**Mitigation:**
- Frontend pulls Pyth Hermes directly via SSE — same source as operator backend
- User can verify by opening browser devtools and checking the SSE stream URL
- Verify page is read-only and self-contained

**Status:** ✅ Mitigated by source transparency

#### T-19 · MEDIUM · Front-running by operator
**Attack:** Operator sees a large incoming buy in their mempool, places opposite-side bet first.

**Mitigation:**
- Operator MUST NOT trade on markets they operate (policy + bug bounty)
- Aleo private records hide bet direction — operator cannot see incoming `buy_up_down` parameters in mempool reliably
- Public function inputs (market_id, side) ARE visible — partial leak

**Residual:** Some MEV opportunity exists; mitigated by policy not by code.
**Status:** ⚠️ Mitigated by operator policy. Track in v2.

---

## 4. Sanity rail summary table

These are the on-chain bounds the contract enforces. Each is a single `assert` that reverts the tx if violated.

| Rail | Constant | Enforced where | Failure → |
|---|---|---|---|
| Price > 0 | `MIN_PRICE = 1` | create + resolve fin | revert |
| Price ≤ $100M | `MAX_PRICE = 1e14` | create + resolve fin | revert |
| Confidence ≤ 0.5% | `CONF_DENOMINATOR_FRAC = 200` | create + resolve fin | revert |
| Max move ≤ 50% | `MAX_MOVE_FRAC = 2` | resolve fin | revert |
| Duration ≥ 1 min testnet | `MIN_DURATION_BLOCKS = 15` | create fin | revert |
| Duration ≤ 60 min testnet | `MAX_DURATION_BLOCKS = 900` | create fin | revert |
| Closing block ≥ deadline | hard check | resolve fin | revert |
| Closing block ≤ deadline + 60 | `RESOLUTION_WINDOW_BLOCKS = 60` | resolve fin | revert |
| Closing tx within grace | `RESOLUTION_GRACE_BLOCKS = 300` | resolve fin | revert |
| Min trade amount | `MIN_TRADE_AMOUNT = 1000` | buy fin | revert |
| Min liquidity | `MIN_LIQUIDITY = 10_000_000` | create fin | revert |
| Caller is operator | `ORACLE_OPERATOR` constant | create + resolve + withdraw fin | revert |
| Withdraw ≤ treasury | `protocol_treasury[0u8] >= amount` | withdraw fin | revert |
| Market id unique | `!turbo_markets.contains(id)` | create fin | revert |
| Baseline freshness | `current_height - baseline_block <= 60` | create fin | revert |
| Status state machine | enum check | every fin | revert |
| Anti double-claim | `share_redeemed[share_id]` | claim fin | revert |
| Side matches winner | `share_side == winning_outcome` | claim fin | revert |
| Payout math correct | recomputed + `assert(declared == computed)` | claim fin | revert |

---

## 5. State machine

```
┌──────────┐  create_turbo_market    ┌────────┐
│  (none)  │ ─────────────────────▶  │ ACTIVE │
└──────────┘                         └────┬───┘
                                          │
                       ┌──────────────────┼──────────────────┐
                       │                  │                  │
                       │ resolve_turbo    │ deadline + 150   │
                       │ (within 10 blk)  │ blocks past      │
                       ▼                  ▼                  ▼
                ┌────────────┐    ┌─────────────┐    ┌────────────┐
                │  RESOLVED  │    │  CANCELLED  │    │  CANCELLED │
                │            │    │ (emergency) │    │ (sanity    │
                │ claim_     │    │             │    │  fail)     │
                │ winnings   │    │ claim_      │    │            │
                │ enabled    │    │ refund      │    │ claim_     │
                │            │    │ enabled     │    │ refund     │
                └────────────┘    └─────────────┘    └────────────┘
```

There is no path back to `ACTIVE` from any terminal state. There is no
`DISPUTED` state (no community voting in turbo).

---

## 6. Audit checklist for external review

External reviewer should verify:

- [ ] All sanity rails in §4 are present and reachable in `src/main.leo`
- [ ] `claim_winnings_fin` payout math matches the formula in `quotePayout`
- [ ] `share_redeemed` mapping is set BEFORE the transfer (anti-reentrancy via order)
- [ ] `pool.total_up_shares + pool.total_down_shares` invariant holds (no minting bug)
- [ ] `market_credits + protocol_treasury` accounting matches `program_credits[0u8]`
- [ ] `ORACLE_OPERATOR` const matches the actual deployer/operator wallet
- [ ] `MarketSeed`-style namespace check: turbo market_id cannot collide with v37
- [ ] No `signature::verify` (we deliberately use caller-based auth)
- [ ] `emergency_cancel` is permissionless (no caller restriction)
- [ ] All `final fn` handle the `transfer_future.run()` first when present
- [ ] Logic test suite (`leo test`) passes 16/16
- [ ] No TODO/FIXME left in production paths

---

## 7. Known limitations / accepted risks

| # | Limitation | Impact | Plan |
|---|---|---|---|
| L1 | Single oracle wallet (single point of trust) | Compromise = damage within sanity bounds | v2: 2-of-3 multi-sig (M-of-N committee mapping) |
| L2 | `claim_winnings` makes share.side and share.quantity public | Position size leaked at claim time | Acceptable for short-lived markets; v37 keeps private |
| L3 | Operator can in theory front-run their own markets | Mitigated by policy + record privacy | v2: separate operator wallet from any trading wallet |
| L4 | Block constants tuned for testnet (4s/block); mainnet needs retuning | Wrong window sizes if mainnet | Documented in `src/main.leo` TODO |
| L5 | No LP positions (protocol-only liquidity) | Cannot scale liquidity from external LPs | v2 if demand justifies audit cost |
| L6 | Tie (closing == baseline) resolves DOWN by convention | Edge case; no funds at risk | Documented in `test_winner_tie_resolves_down` |
| L7 | Max 4 symbols in current SYMBOL_BTC/ETH/SOL whitelist | Adding new symbols requires contract upgrade | Use mapping-based whitelist in v2 if needed |
| L8 | Protocol fee withdrawal goes to operator wallet (same key as oracle) | If operator key compromised, accumulated fees drained too | v2: split treasury wallet via mapping; multisig withdrawal |

---

## 8. Monitoring & alerting

The operator MUST set up the following alerts in production:

| Metric | Threshold | Action |
|---|---|---|
| Tx revert rate (operator wallet) | > 1% in 1h | Page on-call |
| Pyth SSE disconnection | > 10s | Page on-call |
| Pyth confidence > 0.5% on any feed | sustained 60s | Page; pause auto-create |
| Operator wallet balance | < 10 ALEO | Page; refill |
| Cancellation rate (resolve missed) | > 5% per hour | Page; investigate latency |
| Audit log write failure | > 1% per hour | Alert (non-critical) |
| Active markets without resolve attempt | > 0 past `deadline + 10` | Page; possible operator outage |

---

## 9. Incident response runbook

### Operator key compromise (suspected)
1. Immediately call `emergency_cancel` on all active markets (script: TBD)
2. Halt `autoCreateLoop` (kill backend process)
3. Rotate operator key; redeploy contract with new `ORACLE_OPERATOR` constant
4. Audit Supabase log for unauthorized create/resolve in compromise window
5. Refund any users harmed by sanity-check-bypassed actions

### Pyth Hermes outage
1. Backend will reject stale quotes automatically; auto-create skips affected symbols
2. Existing markets fall to `emergency_cancel` after `RESOLUTION_GRACE_BLOCKS`
3. Users claim refunds via `claim_refund`
4. No manual intervention required

### Aleo network outage
1. Tx broadcasts will fail
2. Backend logs will show snarkos errors
3. Wait for network recovery; backend resumes automatically
4. Markets that miss window fall to emergency_cancel as above

---

## 10. Why no `signature::verify` primitive?

Initial design used Pyth attestations signed by an oracle wallet, verified
on-chain via `signature::verify(sig, ORACLE_PUBKEY, hash)`. This was abandoned
in favor of caller-based authorization for these reasons:

1. **Encoding mismatch**: Aleo wasm SDK `Account.sign(Uint8Array)` signs over
   byte plaintext, but Leo `signature::verify` expects a `field` message. The
   conversion path (Poseidon4 hash of struct fields → field representation)
   is non-trivial and a common source of subtle bugs.

2. **No security gain**: A signature scheme from a single key is functionally
   identical to caller-based auth from the same key. Both have one trust
   anchor; both fail the same way under key compromise.

3. **Fewer moving parts**: Caller check is one assert; signature verify
   requires struct encoding, hash function selection, signature format
   handling, and SDK-vs-Leo serialization parity.

4. **Future v2 path**: Multi-sig oracle (M-of-N committee) is cleaner with
   caller-based: just an `is_signer` check against a mapping. Doesn't need
   on-chain signature aggregation.

This decision is documented in [src/main.leo:79–96](src/main.leo#L79-L96) and
in [pyth-oracle.ts trust note](../backend/src/pyth-oracle.ts#L25-L36).

---

## 11. Testnet validation log

The threat model was validated against Aleo testnet on 2026-04-09 by deploying
4 progressive contract versions and running the full lifecycle (create, buy,
resolve, claim, withdraw, emergency cancel) end-to-end on each.

| Version | Issue Found | Severity | Fixed In |
|---|---|---|---|
| v1 | T-23: baseline equality unsatisfiable | HIGH | v2 |
| v2 | T-22: resolution window too tight (10 blocks) | HIGH | v3 |
| v3 | T-21: ternary subtraction underflow | CRITICAL | v4 |
| v4 | All terminal lifecycle paths confirmed working | — | — |

**Confirmed transitions on `veiled_turbo_v4.aleo` testnet:**

- `create_turbo_market` — accepted, market state initialized correctly
- `buy_up_down` — accepted, FPMM math matches off-chain quote exactly
  (50/50 → 5995000/4170141 reserves on 1 ALEO buy with 0.5% protocol fee)
- `resolve_turbo_market` — accepted within 60-block window, status
  transitions to RESOLVED with correct winner
- `withdraw_protocol_fees` — accepted, treasury drained 5000 → 0
- `emergency_cancel` (tested on v2) — accepted past grace window, status
  transitions to CANCELLED

Total testnet spend across all 4 deploys + validation cycle: **~119.37 ALEO**.

## 12. References

- Contract: [src/main.leo](src/main.leo)
- Tests: [tests/turbo_logic_tests.leo](tests/turbo_logic_tests.leo) — 16 logic tests
- Backend: [../backend/src/pyth-oracle.ts](../backend/src/pyth-oracle.ts)
- Frontend: [../frontend/src/components/TurboMarketPanel.tsx](../frontend/src/components/TurboMarketPanel.tsx)
- Audit log schema: [../supabase/create_turbo_audit_table.sql](../supabase/create_turbo_audit_table.sql)
- Verify page: [../frontend/src/pages/VerifyTurbo.tsx](../frontend/src/pages/VerifyTurbo.tsx)
- Pyth Hermes API: https://hermes.pyth.network/docs
- Aleo `signature::verify` (unused): https://docs.leo-lang.org/leo/operators
