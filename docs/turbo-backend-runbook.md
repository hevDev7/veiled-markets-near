# Turbo Backend Runbook

Panduan menjalankan operator backend untuk rolling turbo markets (`veiled_turbo_v8.aleo`), dari environment setup sampai monitoring market yang sudah berjalan.

## 1. Gambaran arsitektur

Turbo market adalah **rolling 5-minute prediction market** berbasis Pyth Network oracle. Backend Node.js di `veiled-markets/backend/` berperan sebagai **operator tunggal**:

1. Subscribe ke Pyth Hermes price stream (BTC/ETH/SOL/…)
2. Setiap 5 menit, broadcast `create_turbo_market` tx dengan baseline price dari Pyth
3. Di deadline wallclock, capture `frozen_price` dari stream
4. Broadcast `resolve_turbo_market` tx dengan closing price ke on-chain
5. Tulis audit trail lengkap ke Supabase (`turbo_oracle_audit` table) untuk verifikasi publik

Frontend subscribe ke backend's SSE stream di `http://localhost:4090/stream?symbol=BTC` untuk live price updates, dan query `/chain/symbol?symbol=BTC` untuk state market saat ini.

## 2. Prasyarat

### Tools yang harus terinstall

- **Node.js** v18+ dan **pnpm**
- **`snarkos` CLI** di `$PATH` (untuk broadcast on-chain tx)
  ```bash
  which snarkos && snarkos --version
  ```
  Kalau belum terinstall, ikuti petunjuk di [Aleo docs](https://docs.aleo.org/)

### Credentials yang dibutuhkan

1. **Operator wallet Aleo** — wallet yang harus match dengan `ORACLE_OPERATOR` hardcoded di contract `veiled_turbo_v8.aleo`. Default backend fallback address:
   ```
   aleo10tm5ektsr5v7kdc5phs8pha42vrkhe2rlxfl2v979wunhzx07vpqnqplv8
   ```
   Kalau kamu deploy contract sendiri, operator = wallet yang deploy.

2. **Public ALEO balance** — operator wallet harus punya minimal **~10 ALEO** untuk priority fee (default `1_000_000 microcredits` per tx, ~1 ALEO per create + 1 ALEO per resolve).

3. **Supabase project** dengan tabel `turbo_oracle_audit` sudah di-apply (lihat `supabase/create_turbo_audit_table.sql`)

## 3. Environment variables

Semua env vars disimpan di `veiled-markets/.env` (root repo, bukan di folder `backend/`). Backend source `.env` dari shell, bukan auto-load — lihat bagian "Running" di bawah.

### Required

```bash
# Operator wallet — backend broadcast tx atas nama wallet ini
OPERATOR_PRIVATE_KEY=APrivateKey1zkp...

# Atau salah satu dari ini sebagai fallback (backend cek ketiganya berurutan):
ALEO_PRIVATE_KEY=APrivateKey1zkp...
PRIVATE_KEY=APrivateKey1zkp...

# Network config
ALEO_NETWORK=testnet                          # testnet / mainnet
ALEO_RPC_URL=https://api.explorer.provable.com/v1
ALEO_BROADCAST_URL=https://api.explorer.provable.com/v1/testnet/transaction/broadcast
ALEO_QUERY_ENDPOINT=https://api.explorer.provable.com/v1

# Supabase (untuk audit log writes)
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIs...   # service_role, NOT anon key
```

> **PENTING**: `SUPABASE_SERVICE_KEY` harus **service_role** key (bypass RLS), bukan `anon public` key. Ambil dari Supabase dashboard → Settings → API → Project API keys → row `service_role` `secret`.

### Optional

```bash
# Filter symbols yang di-create (default: semua 10 symbols)
TURBO_SYMBOLS=BTC                              # comma-separated: BTC,ETH,SOL

# Duration market (default 75 blocks ≈ 5 menit testnet)
TURBO_DURATION_BLOCKS=75

# Priority fee per tx (default 1,000,000 microcredits = 1 ALEO)
ALEO_PRIORITY_FEE=1000000

# HTTP server port (default 4090)
TURBO_OPERATOR_PORT=4090

# Block time asumption (default 4 detik/blok)
ALEO_SECONDS_PER_BLOCK=4
```

### Dry-run mode

Untuk test tanpa broadcast tx on-chain (tidak bakar fee):

```bash
DRY_RUN=1
```

Backend akan log semua inputs yang akan dikirim, tapi tidak benar-benar panggil `snarkos`. Berguna untuk validasi input formatting sebelum spending testnet fees.

## 4. Running the backend

Backend **tidak** auto-load `.env` file — env vars harus di-source via shell sebelum run:

### Untuk BTC saja (test mode)

```bash
cd veiled-markets/backend
set -a && source ../.env && set +a && TURBO_SYMBOLS=BTC pnpm tsx src/pyth-oracle.ts --serve --auto-create
```

### Untuk semua 10 symbols (production-like)

```bash
cd veiled-markets/backend
set -a && source ../.env && set +a && pnpm tsx src/pyth-oracle.ts --serve --auto-create
```

### CLI flags

- `--serve` — start HTTP server di port 4090 (SSE stream, chain state endpoints)
- `--auto-create` — aktifkan rolling chain loop (create + resolve markets otomatis)
- `--auto-resolve` — (legacy, sekarang handled by rolling chain loop — aman diabaikan)

Kedua flag biasanya dipakai bersamaan. Frontend butuh `--serve` untuk SSE stream, dan `--auto-create` untuk market creation otomatis.

### Dry-run test

Sebelum broadcast beneran, validasi env dan input formatting:

```bash
cd veiled-markets/backend
set -a && source ../.env && set +a && TURBO_SYMBOLS=BTC DRY_RUN=1 pnpm tsx src/pyth-oracle.ts --serve --auto-create
```

Output akan show `[snarkos] DRY_RUN veiled_turbo_v8.aleo/create_turbo_market [...]` tanpa benar-benar kirim tx.

### Verifikasi env loaded

Sebelum start, cek apakah env vars berhasil di-source:

```bash
set -a && source ../.env && set +a
echo "OPERATOR: ${OPERATOR_PRIVATE_KEY:0:20}..."
echo "SUPABASE: $SUPABASE_URL"
echo "SUPABASE_KEY length: ${#SUPABASE_SERVICE_KEY}"
```

Output harus show:
- `OPERATOR: APrivateKey1zkp...` (non-empty)
- `SUPABASE: https://xxx.supabase.co`
- `SUPABASE_KEY length: 213` (atau similar, > 100)

Kalau `length: 0` atau error — cek format `.env` (jangan ada newline di tengah value, jangan ada space sekitar `=`).

## 5. Apa yang terjadi saat backend start

### Phase 1 — Init (0–3 detik)

```
[pyth] subscribing: https://hermes.pyth.network/v2/updates/price/stream?ids[]=...
[chain] rolling chain loop started (5s tick)
[pyth] BTC $72950.00  ±$25.08  @2026-04-12T...
[pyth] ETH $2250.58  ±$1.37  ...
...
[oracle] http server on :4090
```

Backend subscribe ke Pyth Hermes SSE dan start logging price updates. HTTP server ready di `:4090`.

### Phase 2 — Create first market (5–30 detik)

```
[chain] BTC created 7967815297976394...field baseline=$72950.00 chained=false deadline=15716203
```

Pertama kali loop jalan, backend broadcast `create_turbo_market` untuk tiap symbol di `TURBO_SYMBOLS`. Tx membutuhkan proof generation (~10–25s) + broadcast ke chain + confirmation.

Kalau sukses, Supabase `turbo_oracle_audit` dapat `event='create'` row, dan market ter-track di in-memory `chainState`.

### Phase 3 — Rolling chain (ongoing)

Setiap 5 menit (75 blok):

1. **Precise freeze setTimeout** fires tepat di deadline wallclock:
   ```
   [chain] BTC precise freeze at wallclock deadline: $72950.72 publishTime=... (market=...)
   ```

2. **Fast-path resolve** langsung broadcast tx tanpa menunggu tick loop:
   ```
   [chain] BTC fast-path waited 1500ms for chain to reach deadline block 15716203
   [chain] BTC fast-path resolved in 18240ms → closing=$72952.00 — chaining immediately
   ```

3. **Chain next market** otomatis dengan closing price sebagai baseline baru:
   ```
   [chain] BTC created 8269961473439473692634...field baseline=$72952.00 chained=true
   ```

### Retry behavior

Kalau `snarkos` broadcast gagal (Cloudflare 5xx, endpoint timeout, dll), backend retry dengan exponential backoff **5 attempts** dengan delay **4s → 8s → 16s → 32s → 60s**. Total ~2 menit window untuk recovery.

```
[snarkos] attempt 1/5 failed, retrying in 4.3s:
Cloudflare 522 (Ray 89a2f...): connection timeout
[snarkos] attempt 2/5 failed, retrying in 8.1s:
Cloudflare 522 (Ray 89a3c...): connection timeout
```

Attempt 3+ biasanya sukses setelah Cloudflare edge pulih.

## 6. Monitoring

### Backend log filtering

Untuk lihat cuma event penting (skip price updates yang verbose):

```bash
set -a && source ../.env && set +a && TURBO_SYMBOLS=BTC pnpm tsx src/pyth-oracle.ts --serve --auto-create 2>&1 | grep -E '\[chain\]|\[audit\]|error|\[snarkos\]'
```

### Endpoint test

```bash
# Health check
curl -s http://localhost:4090/health

# Latest Pyth quote
curl -s http://localhost:4090/quote?symbol=BTC

# Current active market state (sumber truth untuk frontend)
curl -s http://localhost:4090/chain/symbol?symbol=BTC

# All active markets (semua symbols)
curl -s http://localhost:4090/chain
```

### Verify audit log ke Supabase

```bash
curl -s 'https://xxxxx.supabase.co/rest/v1/turbo_oracle_audit?symbol=eq.BTC&order=created_at.desc&limit=5' \
  -H 'apikey: <your-anon-or-service-key>' \
  -H 'authorization: Bearer <your-anon-or-service-key>'
```

Harus return array berisi event `create` dan `resolve` bergantian. Kalau return `[]` → backend belum berhasil write (cek `SUPABASE_URL` dan `SUPABASE_SERVICE_KEY`).

### Verify state on-chain

```bash
# Check turbo program vault balance
curl -s 'https://api.explorer.provable.com/v1/testnet/program/veiled_turbo_v8.aleo/mapping/vault_balance/0u8'
# Output: "62015000u128" (62 ALEO total in vault)

# Check specific market state
MID="<market_id>field"
curl -s "https://api.explorer.provable.com/v1/testnet/program/veiled_turbo_v8.aleo/mapping/turbo_markets/$MID"
```

## 7. Common issues

### `OPERATOR_PRIVATE_KEY (or ALEO_PRIVATE_KEY) not set`

Env var tidak ter-load. Cek:
1. `.env` file ada di `veiled-markets/.env` (bukan di `backend/`)
2. `source ../.env` di-run sebelum `pnpm tsx`
3. Format `.env`: `KEY=value` tanpa spasi, tanpa quote, tanpa newline di tengah value

### `[audit] supabase not configured — skipping log`

`SUPABASE_URL` atau `SUPABASE_SERVICE_KEY` tidak di-set. Audit events tidak akan tersimpan → History tab di frontend akan kosong.

Fix: tambahkan di `.env` dan restart backend.

### `snarkos exit 1: ⚠️ Failed to fetch program`

Endpoint Aleo (`api.explorer.provable.com`) sedang lag/rate-limited. Backend akan retry otomatis sampai 5 attempts. Kalau persistent → tunggu beberapa menit atau switch ke alternative RPC endpoint.

### `Failed to broadcast execution ... <!DOCTYPE html>`

Cloudflare edge return HTML error page (biasanya 502/503/522/524) dari endpoint Aleo. Backend retry dengan exponential backoff. Status endpoint bisa dicek dengan:

```bash
curl -s -o /dev/null -w "HTTP %{http_code}\n" 'https://api.explorer.provable.com/v1/testnet/block/height/latest'
```

### Market tidak muncul di frontend dashboard

- Pastikan backend running dengan flag `--serve` (bukan cuma `--auto-create`)
- Frontend mengarah ke `http://localhost:4090` by default (env `VITE_TURBO_ORACLE_URL` di `frontend/.env`)
- Check backend log untuk `[chain] BTC created ...` — kalau tidak ada, market belum berhasil dibuat

### Market status stuck di `active` setelah deadline

Oracle resolve tx gagal broadcast berulang. Cek:
- Log `[snarkos] attempt X/5 failed` — apakah semua attempts gagal?
- Endpoint availability
- Operator wallet masih punya ALEO untuk gas

Kalau > 60 blocks past deadline (~4 menit), backend akan skip market itu (`past resolve window`) dan market jadi `cancelled` setelah `emergency_cancel` window.

## 8. Creating a turbo market manually (debug)

Normally market creation handled otomatis oleh rolling chain loop. Untuk debug/test, bisa create market langsung lewat `snarkos`:

```bash
cd veiled-markets/contracts-turbo-v1
snarkos developer execute veiled_turbo_v8.aleo create_turbo_market \
  1u8 \                                    # symbol_id (1=BTC, 2=ETH, 3=SOL, ...)
  15720000u64 \                            # deadline (block height)
  $(date +%s)u64 \                         # nonce (unique per market)
  72950000000u128 \                        # baseline_price (Pyth micro, 6 decimals)
  25000000u128 \                           # baseline_conf (confidence interval)
  15719925u64 \                            # baseline_block (current block)
  aleo10tm5ektsr5v7kdc5phs8pha42vrkhe2rlxfl2v979wunhzx07vpqnqplv8 \  # creator_owner
  --private-key $OPERATOR_PRIVATE_KEY \
  --endpoint https://api.explorer.provable.com/v1 \
  --broadcast https://api.explorer.provable.com/v1/testnet/transaction/broadcast \
  --priority-fee 1000000 \
  --network 1
```

> **PENTING**: Contract mem-validasi bahwa `caller == ORACLE_OPERATOR`, jadi tx HARUS ditandatangani dengan operator wallet. Manual create bypass rolling chain loop, jadi lakukan hanya saat debugging.

Pasca create, cek on-chain:

```bash
MARKET_ID=$(curl -s "https://api.explorer.provable.com/v1/testnet/transaction/confirmed/<tx_id>" | jq -r '.transaction.execution.transitions[0].outputs[0].value')
curl -s "https://api.explorer.provable.com/v1/testnet/program/veiled_turbo_v8.aleo/mapping/turbo_markets/$MARKET_ID"
```

Output JSON harus show status `1u8` (ACTIVE) dengan baseline_price yang di-commit.

## 9. Stopping the backend

Tekan `Ctrl+C` di terminal. Backend akan:

1. SIGINT handler dipanggil
2. Stop Pyth Hermes SSE subscription
3. Close HTTP server
4. `process.exit(0)`

**Important**: Precise-freeze setTimeout yang sudah di-schedule akan terhenti juga. Kalau ada market `active` dengan deadline di masa depan, saat backend restart nanti, state `chainState` in-memory akan hilang dan loop akan mendeteksi "no active market" lalu create market baru. Market lama yang stuck `active` akan di-handle oleh:

- Tick loop fallback (dalam 5 detik backend check block height, kalau past deadline → resolve)
- Atau `emergency_cancel` setelah 300 blocks past deadline (kalau resolve tx gagal berulang)

## 10. Production checklist

Sebelum deploy ke production (mainnet atau testnet public-facing):

- [ ] `.env` tidak ter-commit ke git (cek `git check-ignore .env`)
- [ ] `SUPABASE_SERVICE_KEY` pakai dedicated service_role key, rotate secara berkala
- [ ] Operator wallet punya cukup ALEO untuk minimal 24 jam runtime (~288 create + 288 resolve = 576 × 1 ALEO fee = 576 ALEO)
- [ ] Vault funding: operator deposit minimal **X ALEO** ke `veiled_turbo_v8.aleo` via `deposit_vault_public()` untuk liquidity buffer
- [ ] Monitoring / alerting untuk backend crash (systemd restart, pm2, supervisord, dll)
- [ ] Backup audit log dari Supabase secara berkala (untuk verifiability kalau Supabase down)
- [ ] Run process under non-root user (systemd service, tmux, atau docker)

### Example systemd service

```ini
[Unit]
Description=Veiled Turbo Oracle Backend
After=network.target

[Service]
Type=simple
User=aleo-operator
WorkingDirectory=/opt/veiled-markets/backend
EnvironmentFile=/opt/veiled-markets/.env
ExecStart=/usr/bin/pnpm tsx src/pyth-oracle.ts --serve --auto-create
Restart=always
RestartSec=10
StandardOutput=append:/var/log/turbo-oracle.log
StandardError=append:/var/log/turbo-oracle.log

[Install]
WantedBy=multi-user.target
```

## Referensi

- Contract source: [`contracts-turbo-v1/src/main.leo`](../contracts-turbo-v1/src/main.leo)
- Backend source: [`backend/src/pyth-oracle.ts`](../backend/src/pyth-oracle.ts)
- Supabase schema: [`supabase/create_turbo_audit_table.sql`](../supabase/create_turbo_audit_table.sql)
- Frontend turbo client: [`frontend/src/lib/turbo-client.ts`](../frontend/src/lib/turbo-client.ts)
- Frontend turbo UI: [`frontend/src/pages/TurboDetail.tsx`](../frontend/src/pages/TurboDetail.tsx), [`frontend/src/components/TurboMarketPanel.tsx`](../frontend/src/components/TurboMarketPanel.tsx)
- Public verification: `/verify/turbo/<market_id>` di frontend (cross-check audit log vs Pyth Hermes)
