# Veiled Turbo — 24-Hour Shadow Run Runbook

End-to-end production-style test of the operator backend running against
the live `veiled_turbo_v8.aleo` testnet deployment. Goal: validate cron
loops, audit log, error rates, and operator wallet drain over a 24-hour
window before promoting to a wider rollout.

> **Note:** This runbook was originally written for the `v4` shadow run.
> It has been retargeted to `v8` (the current active deployment). Commands
> using `veiled_turbo_v4.aleo` in historical log excerpts are kept in
> [THREAT_MODEL.md](THREAT_MODEL.md) as audit trail — this document only
> describes how to run a fresh shadow run today.

## Pre-flight checklist

- [ ] Operator wallet has ≥ 200 ALEO testnet balance
  ```bash
  curl -s "https://api.explorer.provable.com/v1/testnet/program/credits.aleo/mapping/account/$ALEO_ADDRESS"
  ```
- [ ] `veiled_turbo_v8.aleo` exists on testnet
  ```bash
  curl -s "https://api.explorer.provable.com/v1/testnet/program/veiled_turbo_v8.aleo/latest_edition"
  # → 0
  ```
- [ ] `ORACLE_OPERATOR` constant in `src/main.leo` matches the wallet you'll
      run the backend from. **For v8 it's hardcoded to `aleo10tm5e...nqplv8`.**
      If you need a different operator, you must redeploy as v9+.
- [ ] Apply Supabase audit schema (see §1 below)
- [ ] Set env vars (see §2)
- [ ] DRY_RUN smoke test passes (see §3)

## §1 Apply Supabase audit schema

The schema is at `veiled-markets/supabase/create_turbo_audit_table.sql`.
Apply via the Supabase dashboard SQL editor (no programmatic apply path
because the anon key in `frontend/.env` does not have DDL permissions and
no service key is committed to the repo).

1. Open https://supabase.com/dashboard/project/xgwidnzzuukmljwygfdd/sql/new
2. Paste the contents of `create_turbo_audit_table.sql`
3. Click **Run**
4. Verify table exists:
   ```bash
   curl -s 'https://xgwidnzzuukmljwygfdd.supabase.co/rest/v1/turbo_oracle_audit?limit=1' \
     -H "apikey: $VITE_SUPABASE_ANON_KEY"
   # → []   (empty array, NOT a PGRST205 error)
   ```

If you do not have a `SUPABASE_SERVICE_KEY` for the backend, the audit log
writes will be skipped silently (`[audit] supabase not configured`). The
contract still works; you just lose the off-chain audit trail.

## §2 Environment variables

Backend reads these from process env (no `.env` file is auto-loaded by
pyth-oracle.ts — set them in your shell or via systemd unit):

```bash
# Operator wallet (required for non-DRY_RUN)
export OPERATOR_PRIVATE_KEY=APrivateKey1zk...
export OPERATOR_ADDRESS=aleo1...

# Aleo network endpoints (defaults shown)
export ALEO_NETWORK=testnet
export ALEO_RPC_URL=https://api.explorer.provable.com/v1
# Note: backend normalizes /testnet suffix automatically (v4+)

# Contract id
export TURBO_PROGRAM_ID=veiled_turbo_v8.aleo

# Liquidity per market (defaults to 10 ALEO)
export TURBO_INITIAL_LIQUIDITY=10000000

# Tx priority fee (microcredits)
export ALEO_PRIORITY_FEE=1000000

# Optional Supabase audit log
export SUPABASE_URL=https://xgwidnzzuukmljwygfdd.supabase.co
export SUPABASE_SERVICE_KEY=eyJ...    # service role key, NOT anon

# DRY_RUN bypass for testing
export DRY_RUN=1   # set to 0 or unset for real broadcast
```

## §3 DRY_RUN smoke test (~30 sec)

```bash
cd veiled-markets/backend
DRY_RUN=1 npx tsx src/pyth-oracle.ts --auto-create --auto-resolve
```

Expected output within ~5 seconds:
```
[pyth] subscribing: https://hermes.pyth.network/...
[cron] auto-create loop started (5-min interval)
[cron] auto-resolve loop started (30s interval)
[pyth] BTC $XXXXX.XX  ±$XX.XX  @...
[pyth] ETH $XXXX.XX   ±$X.XX   @...
[pyth] SOL $XX.XX     ±$X.XX   @...
[snarkos] DRY_RUN veiled_turbo_v8.aleo/create_turbo_market [...]
[cron-create] BTC @ $XXXXX.XX → pending_BTC_<nonce> tx dryrun_<ts>
[cron-create] ETH @ $XXXX.XX  → pending_ETH_<nonce> tx dryrun_<ts>
[cron-create] SOL @ $XX.XX    → pending_SOL_<nonce> tx dryrun_<ts>
```

If you see any `error:` line, fix before going live.

## §4 Live shadow run

```bash
cd veiled-markets/backend
nohup npx tsx src/pyth-oracle.ts \
  --serve --auto-create --auto-resolve \
  > shadow.log 2>&1 &
echo $! > shadow.pid
```

The cron writes:
- 1 `create_turbo_market` tx per symbol per 5 min × 3 symbols = ~864 tx/day
- 1 `resolve_turbo_market` tx per market upon deadline = ~864 tx/day
- Total: ~1728 tx/day at ~0.3 ALEO each = **~520 ALEO/day**

## §5 Monitoring during the run

### Live tail

```bash
tail -f shadow.log
```

### Watch operator wallet drain

```bash
while true; do
  BAL=$(curl -s "https://api.explorer.provable.com/v1/testnet/program/credits.aleo/mapping/account/$ALEO_ADDRESS")
  echo "$(date -Is) balance: $BAL"
  sleep 300
done
```

### Audit log query (if Supabase applied)

```bash
SBURL=https://xgwidnzzuukmljwygfdd.supabase.co
KEY=$VITE_SUPABASE_ANON_KEY

# Counts per event in last hour
curl -s "$SBURL/rest/v1/turbo_oracle_audit?created_at=gte.$(date -u -d '1 hour ago' -Iseconds)&select=event" \
  -H "apikey: $KEY" | jq 'group_by(.event) | map({event: .[0].event, count: length})'

# Recent creates
curl -s "$SBURL/rest/v1/turbo_oracle_audit?event=eq.create&order=created_at.desc&limit=10" \
  -H "apikey: $KEY" | jq '.[] | {symbol, pyth_price, market_id, aleo_tx_id}'
```

### Tx success rate (live ground truth)

```bash
# Pull last 100 operator transitions, count rejected vs accepted
ADDR=aleo10tm5ektsr5v7kdc5phs8pha42vrkhe2rlxfl2v979wunhzx07vpqnqplv8
curl -s "https://api.explorer.provable.com/v1/testnet/find/transactionID?address=$ADDR&limit=100" 2>&1 \
  # ... (explorer endpoint may differ; verify against your indexer)
```

### Frontend smoke check

Navigate to https://veiledmarkets.xyz/turbo (or local dev: http://localhost:5173/turbo).
You should see active markets refreshing every 15s with live BTC/ETH/SOL countdowns.

## §6 Success criteria (24-hour window)

| Metric | Target | Action if exceeded |
|---|---|---|
| Tx revert rate | < 1% | Investigate cause; pause cron |
| Cancellation rate | < 5% | Likely operator latency; widen window |
| Operator balance drop | ≤ 600 ALEO | Refill wallet from faucet |
| Audit log write failures | < 1% | Check Supabase RLS / service key |
| Pyth SSE disconnects | < 1/hour | Acceptable; auto-reconnects |
| Markets created | ~864 (3/5min × 288 windows) | If lower, check cron timer |
| Markets resolved | ≥ 95% of created | Tighten resolve window |

## §7 Stop the shadow run

```bash
kill $(cat veiled-markets/backend/shadow.pid)
rm veiled-markets/backend/shadow.pid
```

## §8 Post-run review checklist

- [ ] Compare audit log market_ids against on-chain `turbo_markets` mapping
- [ ] Spot-check 5 random markets via `/verify/turbo/<id>` page
- [ ] Cross-check operator's claimed Pyth price against Pyth Hermes historical
- [ ] Total ALEO spent vs estimated
- [ ] Document any new failure modes in [THREAT_MODEL.md](THREAT_MODEL.md)
- [ ] If clean, schedule external audit + plan mainnet retune per
      [MAINNET_MIGRATION.md](MAINNET_MIGRATION.md)
