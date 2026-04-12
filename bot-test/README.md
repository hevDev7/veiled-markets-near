# Veiled Markets — Telegram Bot (SDK Integration Test)

Test project untuk verifikasi `@veiled-markets/sdk@0.5.0` dari npm registry. Bot Telegram yang expose semua fungsi Turbo Markets via chat commands.

## Tujuan

1. **Smoke test** SDK install dari npm — pastikan `npm install @veiled-markets/sdk` works
2. **Integration test** semua client SDK (Turbo, Pyth, Indexer, NodeExecutor)
3. **End-to-end demo** untuk judges atau new users — interact dengan protocol via Telegram tanpa harus setup browser wallet

## Architecture

```
┌─────────────┐    poll      ┌──────────────────┐
│  Telegram   │◄────────────►│  bot.ts          │
│  user chat  │  commands    │  (this folder)   │
└─────────────┘              └────────┬─────────┘
                                       │
                                       │ uses @veiled-markets/sdk
                                       │
                  ┌────────────────────┼────────────────────┐
                  │                    │                    │
                  ▼                    ▼                    ▼
          ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
          │ TurboClient  │    │ PythHermes   │    │ NodeExecutor │
          │ /chain/symbol│    │  Hermes API  │    │ snarkos exec │
          └──────┬───────┘    └──────────────┘    └──────┬───────┘
                 │                                         │
                 ▼                                         ▼
        ┌────────────────┐                       ┌─────────────────┐
        │  pyth-oracle   │                       │  Aleo testnet   │
        │  backend :4090 │                       │ veiled_turbo_v8 │
        └────────────────┘                       └─────────────────┘
```

## Setup

### 1. Install dependencies

```bash
cd bot-test
pnpm install
# atau: npm install
```

Ini akan install:
- `@veiled-markets/sdk@0.5.0` dari npm registry (yang baru di-publish)
- `node-telegram-bot-api` untuk Telegram integration
- `dotenv` untuk env loading
- `tsx` untuk run TypeScript langsung

### 2. Smoke test (verifikasi SDK works tanpa Telegram)

Sebelum bikin bot Telegram, verifikasi SDK install bener dulu:

```bash
pnpm smoke
```

Expected output:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
@veiled-markets/sdk — smoke test
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ PROGRAM_IDS exported
✅ PROGRAM_IDS.ALEO_MARKET correct
✅ PROGRAM_IDS.TURBO correct
✅ PROGRAM_IDS.GOVERNANCE correct
✅ PROTOCOL_FEE_BPS = 50 (0.5%)
... [more checks]
✅ quoteContractBuy(binary FPMM) matches contract math exactly — 3633 shares
✅ calculateParlayQuote(2 legs @ 50%) → combined 2500 bps

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Results: 20 passed, 0 failed (20 total)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎉 ALL CHECKS PASSED — SDK is working correctly!
```

Kalau gagal, check:
- `pnpm install` jalan tanpa error
- `node_modules/@veiled-markets/sdk/dist/index.js` exists
- Error message di smoke output untuk detail

### 3. Create Telegram bot

1. Buka Telegram, search **@BotFather**
2. Send `/newbot`
3. Pilih nama (e.g., "My Veiled Markets Test")
4. Pilih username (e.g., `my_vm_test_bot`)
5. BotFather akan reply dengan bot token format `1234567890:AAExample...`
6. **Copy token ini** — akan dipakai di langkah 4

### 4. Get your Telegram user ID (untuk authorize /bet)

1. Buka Telegram, search **@userinfobot**
2. Send `/start`
3. Bot akan reply dengan ID Anda (numeric, e.g., `123456789`)
4. **Copy ID ini** — akan dipakai di langkah 5

### 5. Configure .env

```bash
cp .env.example .env
nano .env       # atau editor favorit Anda
```

Minimal yang harus diisi:
```env
TELEGRAM_BOT_TOKEN=1234567890:AAExampleBotTokenFromBotFather
TELEGRAM_AUTHORIZED_IDS=123456789
DRY_RUN=1
```

`DRY_RUN=1` SANGAT direkomendasikan untuk test pertama — bot akan simulasi bet tanpa benar-benar broadcast ke Aleo network.

Kalau Anda mau test real bet (live mode):
```env
DRY_RUN=0
ALEO_PRIVATE_KEY=APrivateKey1zk...   # private key dari testnet wallet
ALEO_ADDRESS=aleo1...                 # address yang punya saldo testnet ALEO
```

### 6. Verify Turbo backend (LIVE atau local)

**Default: LIVE backend** di `https://evonft.xyz` — sudah jalan 24/7, Anda tidak perlu run apa-apa lokal. Verifikasi:

```bash
curl https://evonft.xyz/health
# Should return: {"ok":true}
```

`bot-test/.env.example` sudah default ke live URL:
```env
TURBO_ORACLE_URL=https://evonft.xyz
```

**Optional: Run local backend** kalau mau test backend changes Anda sendiri sebelum deploy:
```bash
cd ../backend
set -a && source ../.env && set +a
TURBO_SYMBOLS=BTC pnpm tsx src/pyth-oracle.ts --serve --auto-create
```

Lalu di `bot-test/.env`:
```env
TURBO_ORACLE_URL=http://localhost:4090
```

### 7. Start the bot

```bash
pnpm start
```

Output yang diharapkan:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VEILED MARKETS — Telegram Bot (SDK integration test)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Network:        testnet
Oracle URL:     https://evonft.xyz
Dry run:        YES (no on-chain broadcast)
Aleo address:   (not set)
Executor:       NOT configured (read-only)
Indexer:        NOT connected
Authorized IDs: 123456789
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Bot polling Telegram for messages...

[bot] ready — send /start to your bot in Telegram
```

### 8. Test the bot

Buka bot Anda di Telegram (cari username yang Anda set di step 3) dan send:

```
/start
```

Bot akan reply dengan command list. Coba:

```
/whoami            → cek Telegram ID Anda
/status            → bot health check + SDK version
/price BTC         → current BTC price dari Pyth Hermes
/market BTC        → current Turbo BTC round status
/quote BTC UP 1    → kalkulasi expected payout untuk 1 ALEO UP
/watch BTC         → subscribe notifications untuk new BTC rounds
/bet BTC UP 0.5    → place 0.5 ALEO bet UP (DRY_RUN simulasi)
```

## Available commands

### Public (anyone can use)

| Command | Description |
|---|---|
| `/start` `/help` | Welcome message + command list |
| `/whoami` | Show your Telegram user ID |
| `/status` | Bot health, SDK version, connected services |
| `/price <SYMBOL>` | Current Pyth Hermes price |
| `/market <SYMBOL>` | Current active Turbo round info |
| `/quote <SYM> <UP\|DOWN> <AMT>` | Calculate expected payout |
| `/history <SYMBOL>` | Last 5 resolved rounds (needs indexer) |
| `/verify <MARKET_ID>` | Link to /verify/turbo/:id browser page |
| `/watch <SYMBOL>` | Subscribe notifications for new rounds |
| `/unwatch` | Stop notifications |

### Authorized only (TELEGRAM_AUTHORIZED_IDS)

| Command | Description |
|---|---|
| `/bet <SYM> <UP\|DOWN> <AMT>` | Place actual bet (requires `ALEO_PRIVATE_KEY`) |

## Troubleshooting

### `pnpm smoke` fails dengan "Cannot find module @veiled-markets/sdk"

```bash
pnpm install
# atau force reinstall:
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

### Bot start tapi tidak respond di Telegram

- Check `TELEGRAM_BOT_TOKEN` benar (no extra whitespace)
- Pastikan tidak ada bot lain yang pakai token sama (conflict polling)
- Check internet connection
- Check console untuk `polling_error` messages

### `/market BTC` return "oracle unreachable"

Live backend down sementara, atau URL salah, atau Anda set local URL tapi local backend belum jalan.

```bash
# Verifikasi LIVE backend (default)
curl https://evonft.xyz/health

# Atau verifikasi LOCAL kalau pakai local mode
curl http://localhost:4090/health

# Switch URL via .env:
TURBO_ORACLE_URL=https://evonft.xyz       # live (default)
# atau:
TURBO_ORACLE_URL=http://localhost:4090    # local dev
```

### `/bet` return "❌ Executor not configured"

`ALEO_PRIVATE_KEY` belum di-set di `.env`. Set ke private key testnet wallet yang punya saldo.

⚠️ **JANGAN commit `.env` ke git** — file ini berisi private key.

### `/bet` return "❌ Bet failed: invalid record" (LIVE mode)

Untuk real bet, bot perlu credits.aleo record plaintext untuk transfer_private_to_public. Set `CREDITS_RECORD_PLAINTEXT` di .env dengan plaintext valid yang covered amount bet. Ini advanced — untuk SDK test sederhana, **stay in DRY_RUN=1 mode**.

### Test pakai backend production (default)

`.env.example` sudah default ke live backend di `https://evonft.xyz`. Tidak perlu setup apa-apa lokal:

```env
TURBO_ORACLE_URL=https://evonft.xyz
DRY_RUN=1
```

Bot akan query production data live tapi semua bet tetap simulasi karena `DRY_RUN=1`.

## Files

```
bot-test/
├── README.md           # this file
├── package.json        # @veiled-markets/sdk + node-telegram-bot-api
├── tsconfig.json       # TypeScript config (ESM, ES2022)
├── .env.example        # template — copy to .env
├── smoke.ts            # 20+ smoke checks for SDK install
└── bot.ts              # main Telegram bot
```

## What this tests

**SDK clients exercised:**
- ✅ `createTurboClient` — fetch active markets, build buy_up_down inputs
- ✅ `createPythHermesClient` — fetch live prices for /price command
- ✅ `createNodeExecutor` — submit transactions in DRY_RUN mode
- ✅ `createIndexerClient` — query historical rounds for /history (optional)
- ✅ `createGovernanceClient` — instantiation only (smoke test)
- ✅ `createParlayClient` — instantiation only (smoke test)

**SDK math functions exercised:**
- ✅ `calculateContractTradeFees` — fee splits for FPMM trades
- ✅ `quoteContractBuy` — exact FPMM buy quote
- ✅ `calculateParlayQuote` — combined odds math

**SDK constants verified:**
- ✅ `PROGRAM_IDS` — all 6 contract addresses
- ✅ `PROTOCOL_FEE_BPS`, `CREATOR_FEE_BPS`, `LP_FEE_BPS`, `FEE_DENOMINATOR`
- ✅ `TURBO_MIN_TRADE_AMOUNT`, `PYTH_FEED_IDS`

**Real-world flow:**
- Public commands (price, market, quote) → SDK reads from on-chain mappings + Pyth Hermes
- Bet command → SDK builds tx inputs → NodeExecutor → snarkos developer execute (DRY_RUN simulates)
- Watch command → SDK polls + Telegram notification on new round

Kalau semua command works, SDK 100% functional dan ready untuk public use.

## License

MIT — same as parent project.
