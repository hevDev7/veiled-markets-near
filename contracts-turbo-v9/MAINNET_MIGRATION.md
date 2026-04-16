# Veiled Turbo v1 — Mainnet Migration Notes

Constants in `src/main.leo` are tuned for **testnet (~4 seconds per block)**.
Before mainnet deployment they must be re-tuned for **~15 seconds per block**.

## Block-time-dependent constants

| Constant | Testnet (4s) | Mainnet (15s) | Wall-clock |
|---|---|---|---|
| `MIN_DURATION_BLOCKS` | `15u64` | `4u64` | ~1 minute |
| `MAX_DURATION_BLOCKS` | `900u64` | `240u64` | ~60 minutes |
| `RESOLUTION_WINDOW_BLOCKS` | `10u64` | `3u64` | ~45 seconds |
| `RESOLUTION_GRACE_BLOCKS` | `150u64` | `40u64` | ~10 minutes |

The `WINNER_CLAIM_PRIORITY_BLOCKS` analog from v37 is **not used** here — turbo
markets resolve too fast for a winner-priority window to make sense.

## Verifying actual block time before deploy

Don't trust the table above blindly. Aleo block time can drift; measure it
the day of deploy:

```bash
# Sample latest 60 blocks, compute average wall time
START=$(curl -s https://api.explorer.provable.com/v1/mainnet/latest/height)
sleep 60
END=$(curl -s https://api.explorer.provable.com/v1/mainnet/latest/height)
echo "blocks/min: $((END - START))"
echo "approx block time: $(bc -l <<< "60 / ($END - $START)") sec"
```

If observed block time differs from 15s by more than ±20%, retune above
constants accordingly. Formula:

```
MIN_DURATION_BLOCKS    = ceil(60 / observed_block_time)         # 1 min
MAX_DURATION_BLOCKS    = floor(60 * 60 / observed_block_time)   # 60 min
RESOLUTION_WINDOW      = ceil(45 / observed_block_time)         # 45 sec
RESOLUTION_GRACE       = ceil(600 / observed_block_time)        # 10 min
```

## Other mainnet checklist items

| # | Item | Action |
|---|---|---|
| 1 | `ORACLE_OPERATOR` constant | Set to mainnet operator wallet (HSM-backed). Different from testnet! |
| 2 | `MIN_LIQUIDITY` | Currently `10_000_000u128` (10 ALEO). Confirm this is enough for fair pricing. |
| 3 | `MIN_TRADE_AMOUNT` | Currently `1000u128` (0.001 ALEO). May need raise to discourage dust attacks. |
| 4 | Backend `NETWORK_ID` | Set `ALEO_NETWORK=mainnet` to flip snarkos `--network 0`. |
| 5 | Backend `BROADCAST_ENDPOINT` | Update to mainnet endpoint. |
| 6 | Backend `ALEO_PRIORITY_FEE` | Tune for mainnet congestion. |
| 7 | Frontend `VITE_ALEO_RPC_URL` | Mainnet explorer endpoint. |
| 8 | Frontend `VITE_ALEO_SECONDS_PER_BLOCK` | Set to `15` (was `4` testnet). |
| 9 | Supabase row count | Audit log grows ~24 rows/hour per symbol → ~52K rows/month for 3 symbols. Add archival policy. |
| 10 | Operator wallet balance | Calculate gas budget: ~2 tx per market per 5 min × 3 symbols × 24h = 1728 tx/day. At ~0.3 ALEO/tx = ~520 ALEO/day. |
| 11 | Sanity rail re-review | Confirm `MAX_PRICE = 1e14` ($100M) still appropriate. Highest crypto cap < $200K, so OK. |
| 12 | Independent audit | Required before mainnet deploy. Reference [THREAT_MODEL.md](THREAT_MODEL.md). |

## Storage growth estimate

| Mapping | Per market | Markets/day (3 symbols × 5 min) | Bytes/day | Bytes/year |
|---|---|---|---|---|
| `turbo_markets` | ~120 B | 864 | ~100 KB | ~37 MB |
| `turbo_pools` | ~80 B | 864 | ~70 KB | ~25 MB |
| `market_credits` | ~32 B | 864 | ~28 KB | ~10 MB |
| `share_redeemed` | ~32 B | varies (per claim) | ~50 KB est | ~18 MB est |

Total ~30 MB/yr on-chain storage growth — well within Aleo limits.

## Decision: redeploy or upgrade?

The contract has `@noupgrade` constructor, so every change requires a **fresh
deploy** with a new program id. For mainnet:

- **Source of truth**: the current testnet-validated source is `veiled_turbo_v8.aleo`
  (shared vault + all bug fixes consolidated — see [README.md](README.md#status)
  for the full testnet iteration history).
- **Mainnet program id**: TBD. Options:
  - Mirror testnet versioning → deploy as `veiled_turbo_v8.aleo` on mainnet
  - Clean slate → deploy as `veiled_turbo_mainnet_v1.aleo` (or similar)
  The choice should be finalized before the external audit so the audited
  program id matches what goes live.
- **Retuning**: whichever id is chosen, block-time constants must be retuned
  for 15s blocks (see §1).
- Frontend `VITE_TURBO_PROGRAM_ID` env var lets us switch without rebuild.
- Audit log table can stay shared across versions (filter by `metadata.program_version`).

## Pre-flight test script

Before mainnet broadcast, run this on testnet for at least 24h:

```bash
cd veiled-markets/backend
ALEO_NETWORK=testnet \
DRY_RUN=0 \
tsx src/pyth-oracle.ts --serve --auto-create --auto-resolve \
  > oracle.log 2>&1 &

# Watch for:
# - Zero tx reverts in 24h
# - Cancellation rate < 1%
# - Audit log writes succeed
# - Operator wallet balance stable (no leak)

sleep 86400
grep -c "snarkos exit" oracle.log   # should be 0
grep -c "cron-resolve" oracle.log   # should be ~864
```

If 24h shadow run is clean, proceed with mainnet retune + deploy.
