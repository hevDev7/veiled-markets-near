# Veiled Turbo Markets

Pyth-backed, oracle-resolved short-duration UP/DOWN prediction markets on Aleo.

**Active deployment:** `veiled_turbo_v8.aleo` (shared-vault architecture — see
[Status](#status) for testnet validation history v1 → v8).

## What this is

A separate Aleo program (`veiled_turbo_v8.aleo`) that runs **alongside** — not
replacing — `veiled_markets_v37.aleo`. Designed for 5-minute crypto price
markets in the style of Polymarket Turbo / Kalshi short events.

## Why a separate contract?

| Aspect | `veiled_markets_v37` | `veiled_turbo_v8` |
|---|---|---|
| Duration | hours → months | 1–60 minutes |
| Resolution | community vote + dispute (24h) | oracle attestation (~15s) |
| Trust model | trust-minimized voting | trusted operator + verifiable Pyth |
| Outcomes | 2–4 | binary (UP/DOWN) only |
| Fee structure | protocol + creator + LP | protocol + LP only |
| Audit surface | large (voting, dispute, governance hooks) | small |

Mixing both into v37 would have inflated the audit surface and forced two
incompatible trust models into one snarkVM transition budget. A clean separation
keeps each program small, reviewable, and independently upgradable.

## High-level flow

```
T+0:00  create_turbo_market(BTC, 5min, baseline_attestation, sig)
        └─ contract verifies sig, locks liquidity, opens market

T+0:00 → T+5:00
        users call buy_up_down(market_id, UP|DOWN, amount)
        FPMM updates reserves and mints private TurboShare records

T+5:00  market.deadline reached (no on-chain action required)

T+5:15  backend cron snapshots Pyth at block ≥ deadline,
        signs closing PriceAttestation,
        calls resolve_turbo_market(market_id, closing, sig)
        └─ contract verifies sig, runs sanity checks,
           sets winning_outcome = closing > baseline ? UP : DOWN

T+5:20  winning users call claim_winnings(share)
        └─ contract burns share, transfers ALEO payout
```

If the operator misses the resolution window:

```
T+15:00 anyone calls emergency_cancel(market_id)
        └─ contract sets status = CANCELLED
T+15:05 users call claim_refund(share)
        └─ contract refunds full original stake
```

## Trust model

**Single trust assumption: the oracle wallet (`ORACLE_PUBKEY`) is honest or
its signing key is compromised.** Everything else is enforced by code.

### What is on-chain enforced (no trust required)

1. **Baseline freshness** — `baseline.block == current block height` at
   creation. Operator cannot use a stale price.
2. **Closing window** — `deadline ≤ closing.block ≤ deadline + 10`. Operator
   cannot wait, observe market move, then pick a profitable closing time.
3. **Price range** — `1 ≤ price ≤ 100,000,000,000,000` (anti-overflow).
4. **Confidence interval** — `conf ≤ price / 200` (≤ 0.5%). Pyth's own
   uncertainty metric must be tight, otherwise the snapshot is rejected.
5. **Max-move sanity** — `|closing − baseline| ≤ baseline / 2` (≤ 50%).
   Flash crashes or oracle errors trigger rejection → emergency cancel.
6. **Signature verification** — `signature::verify(sig, ORACLE_PUBKEY, hash)`
   on every attestation. Any tampering breaks the proof.
7. **Anti-replay on market_id** — `assert(!turbo_markets.contains(market_id))`.
8. **Anti double-claim** — share id stored in `share_redeemed` mapping.
9. **Permissionless escape hatch** — `emergency_cancel` callable by anyone
   after `resolution_deadline` if the operator is offline.

### What requires trust (mitigated, not eliminated)

| Risk | Mitigation |
|---|---|
| Operator key theft | Hold key in HSM; plan v2 multi-sig (2-of-3) |
| Operator submits stale Pyth data | Backend open-source + on-chain log audit |
| Pyth aggregation compromised | Pyth secures $100B+ TVL on other chains |
| Operator goes offline permanently | Permissionless `emergency_cancel` → refunds |

## Verifiability

Every attestation is permanently on-chain. Anyone can independently verify:

```bash
# 1. Read on-chain attestation from Aleo explorer
TX=<resolve_turbo_market tx hash>
curl -s "https://api.explorer.provable.com/v1/testnet/transaction/$TX" | jq

# 2. Cross-check against Pyth Hermes historical data
BLOCK=<closing.block from tx>
TIMESTAMP=<aleo block timestamp at $BLOCK>
curl -s "https://hermes.pyth.network/v2/updates/price/$TIMESTAMP?ids[]=0xe62df6c8..."

# 3. Compare price reported on-chain vs Pyth historical
# If they don't match → operator misbehavior, file bug bounty / report
```

A public verification page (`/verify/turbo/<market_id>`) on the frontend will
automate this comparison.

## Key constants (testnet — re-tune for mainnet)

```leo
MIN_DURATION_BLOCKS      = 15   // ~1 min  @ 4s/block
MAX_DURATION_BLOCKS      = 900  // ~60 min @ 4s/block
RESOLUTION_WINDOW_BLOCKS = 10   // ~40s after deadline
RESOLUTION_GRACE_BLOCKS  = 150  // ~10 min until refund eligibility
PROTOCOL_FEE_BPS         = 50   // 0.5%
LP_FEE_BPS               = 100  // 1.0%
```

Mainnet (15s/block) recommended values are noted as TODO comments at the
bottom of `src/main.leo`.

## What's deliberately not in this skeleton

These are tracked as TODO comments in `src/main.leo` and need design before audit:

1. **Tight payout calculation in `claim_winnings_fin`** — currently trusts
   `expected_payout`; needs total_winning_shares tracking.
2. **LP positions** — current draft is protocol-liquidity-only for simplicity.
3. **Multi-sig oracle (v2)** — single oracle pubkey for MVP.
4. **Pyth feed_id committed on-chain** — currently only `symbol_id` is stored.
5. **Mainnet block constants** — testnet values only.

## Files

- `program.json` — Leo manifest (currently declares `veiled_turbo_v8.aleo`)
- `src/main.leo` — contract source (~23 KB, 10 transitions, shared vault)
- `tests/turbo_logic_tests.leo` — 16 logic tests, all passing
- `THREAT_MODEL.md` — 23 threats catalogued + testnet validation log
- `MAINNET_MIGRATION.md` — block-time constant retuning + checklist
- `deploy.sh` — interactive testnet deploy script (auto-reads program ID from `program.json`)
- `README.md` — this document

## Status

**✅ Validated on Aleo testnet** (2026-04-10).

The canonical source in `src/main.leo` has been validated end-to-end on
testnet through 8 progressive deploy iterations. The currently deployed
program id is **`veiled_turbo_v8.aleo`** (frontend `VITE_TURBO_PROGRAM_ID`
and backend `TURBO_PROGRAM_ID` env vars default to this). The folder name
is kept as `contracts-turbo-v1` for git history continuity; the source
matches v8.

### Testnet validation history

| Version | Key Fix |
|---------|---------|
| v1 | Initial deploy — `baseline_block == current` impossible |
| v2 | Baseline lag tolerance (30 blocks) |
| v3 | Resolution window widened (10 → 60 blocks) |
| v4 | Branch-free abs diff (ternary underflow fix) |
| v5 | Private transfers (credits record in/out) |
| v6 | `withdraw_liquidity` for LP recovery |
| v7 | Shared vault + 10 symbols + claim refund validation |
| **v8** | **`deposit_vault_public` + all bug fixes consolidated (production)** |

### Confirmed end-to-end transitions (cumulative across v4 → v8)

| Transition | Status |
|------------|--------|
| `create_turbo_market` | ✅ Market opened against shared vault |
| `buy_up_down` | ✅ Private credits in, FPMM/parimutuel math exact match |
| `resolve_turbo_market` | ✅ Pyth closing price, winner selection, refund-on-rejection |
| `claim_winnings` | ✅ Private payout from shared vault |
| `claim_refund` | ✅ Refund after cancel |
| `emergency_cancel` | ✅ CANCELLED past grace |
| `deposit_vault` / `deposit_vault_public` | ✅ Operator funds shared vault |
| `withdraw_vault` | ✅ Operator reclaims from vault |
| `withdraw_fees` | ✅ Protocol fee withdrawal |

See [THREAT_MODEL.md](THREAT_MODEL.md) for the full per-version validation log,
including historical discovery transactions for v1–v4 (retained as audit trail).

See [THREAT_MODEL.md §11](THREAT_MODEL.md) for full validation log and
[T-21/T-22/T-23](THREAT_MODEL.md) for the 3 bugs caught + fixed by testnet
shadow run.

## Next steps

1. **24-hour shadow run**: `cd ../backend && tsx src/pyth-oracle.ts --serve --auto-create --auto-resolve`
2. **Frontend smoke test**: `cd ../frontend && npm run dev` → http://localhost:5173/turbo
3. **Apply Supabase schema**: `supabase/create_turbo_audit_table.sql`
4. **External audit** before mainnet
5. **Mainnet retune** per [MAINNET_MIGRATION.md](MAINNET_MIGRATION.md)
