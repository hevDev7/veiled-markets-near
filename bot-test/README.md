# Veiled Markets — Telegram Bot

Multi-user Telegram bot for [Veiled Markets](https://veiledmarkets.xyz) — interact with both **Turbo** (5-min UP/DOWN) and **FPMM** (prediction) markets via chat. Built with `@veiled-markets/sdk`.

**Live bot:** [@veiledmarkets_bot](https://t.me/veiledmarkets_bot)

## Features

- **Multi-user wallets** — each Telegram user gets their own Aleo wallet, auto-generated on `/start`
- **Encrypted storage** — private keys encrypted with AES-256-GCM in `wallets.json`
- **Turbo markets** — bet UP/DOWN on BTC/ETH/SOL price in 5-minute rounds
- **FPMM markets** — browse and trade prediction market outcome shares (2/3/4-way)
- **Auto-capture** — share records and change records saved automatically after each bet
- **No setup for users** — users just open the bot and start, no `.env` or wallet config needed

## Architecture

```
┌─────────────┐    poll      ┌──────────────────┐
│  Telegram   │◄────────────►│  bot.ts          │
│  user chat  │  commands    │  (this folder)   │
└─────────────┘              └────────┬─────────┘
                                       │
                              ┌────────┼────────┐
                              │        │        │
                              ▼        ▼        ▼
                     ┌──────────┐ ┌─────────┐ ┌──────────┐
                     │ Turbo    │ │ FPMM    │ │ Pyth     │
                     │ Client   │ │ Client  │ │ Hermes   │
                     └────┬─────┘ └────┬────┘ └──────────┘
                          │            │
                     ┌────┴────────────┴────┐
                     │  Aleo testnet        │
                     │  veiled_turbo_v8     │
                     │  veiled_markets_v37  │
                     └──────────────────────┘
```

## Setup

### 1. Install dependencies

```bash
cd bot-test
npm install
```

### 2. Configure .env

```bash
cp .env.example .env
```

Fill in **two required values**:

```env
WALLET_ENCRYPTION_KEY=<generate with: openssl rand -hex 32>
TELEGRAM_BOT_TOKEN=<from @BotFather>
```

Optional (for FPMM `/markets` command):
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
```

### 3. Smoke test (verify SDK works)

```bash
npx tsx smoke.ts
```

Expected: `24 passed, 0 failed — ALL CHECKS PASSED`

### 4. Start the bot

```bash
npx tsx bot.ts
```

Output:
```
[wallets] Loaded 0 user wallet(s) (encrypted)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VEILED MARKETS — Telegram Bot (multi-user)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Network:        testnet
Oracle URL:     https://evonft.xyz
Mode:           Multi-user (auto wallet per user)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Bot polling Telegram for messages...

[bot] ready — send /start to your bot in Telegram
```

## User flow

1. User sends `/start` → bot auto-generates encrypted Aleo wallet
2. `/wallet` → shows deposit address and balance
3. User sends testnet ALEO to the address (from faucet or another wallet)
4. `/fund 5` → converts 5 ALEO public balance to private record (~30-60s)
5. `/bet BTC UP 1` → places a 1 ALEO Turbo bet (or `/buy <ID> YES 1` for FPMM)
6. Bot auto-captures share record + change record after confirmation
7. `/mybets` → shows all tracked bets
8. `/result` → checks win/loss on all bets
9. `/claim` → auto-claims all winnings

## Available commands

### Turbo Markets (5-min UP/DOWN)

| Command | Description |
|---|---|
| `/price <SYMBOL>` | Current Pyth price (BTC/ETH/SOL/...) |
| `/market <SYMBOL>` | Current active Turbo round status |
| `/quote <SYM> <UP\|DOWN> <AMT>` | Calculate expected payout |
| `/bet <SYM> <UP\|DOWN> <AMT>` | Place bet (e.g. `/bet BTC UP 1`) |
| `/watch <SYMBOL>` | Subscribe to new round notifications |
| `/unwatch` | Stop notifications |

### FPMM Prediction Markets

| Command | Description |
|---|---|
| `/markets` | List active prediction markets (requires Supabase) |
| `/marketinfo <ID>` | Market details, odds, outcome labels |
| `/buy <ID> <1-4\|YES\|NO> <AMT>` | Buy outcome shares |
| `/redeem <ID>` | Redeem shares after market resolution |

### Wallet & General

| Command | Description |
|---|---|
| `/start` `/help` | Welcome + command list + auto-create wallet |
| `/wallet` | Show your address, public balance, private record |
| `/fund <AMOUNT>` | Convert public ALEO to private record |
| `/mybets` | Show all tracked bets (Turbo + FPMM) |
| `/result` | Check all bets for win/loss |
| `/claim` | Auto-claim all winnings |
| `/status` | Bot health, SDK version, connected services |

## Files

```
bot-test/
├── bot.ts              # Main bot — Turbo + FPMM commands, multi-user
├── wallets.ts          # Per-user wallet manager (AES-256-GCM encrypted)
├── records.ts          # Credits record scanner + auto-capture
├── smoke.ts            # 24-check SDK install verification
├── wallets.json        # Encrypted user wallets (auto-created, gitignored)
├── .env                # Config (gitignored)
├── .env.example        # Template — copy to .env
├── package.json        # @veiled-markets/sdk + node-telegram-bot-api
├── tsconfig.json       # TypeScript config (ESM, ES2022)
└── README.md           # This file
```

## Security

- Private keys are **never stored in plaintext** — encrypted with AES-256-GCM using `WALLET_ENCRYPTION_KEY`
- `wallets.json` and `.env` are in `.gitignore`
- Each user has an isolated wallet — no shared funds
- Bot operator never sees user private keys (only encrypted ciphertext on disk)

## SDK integration

The bot exercises these SDK clients:

| Client | Used for |
|---|---|
| `createTurboClient` | Turbo market queries, `buildBuyUpDownInputs`, `buildClaimWinningsInputs` |
| `createClient` (FPMM) | FPMM market queries, `buildBuySharesInputs`, `buildRedeemSharesInputs` |
| `createNodeExecutor` | Submit transactions via `snarkos developer execute` |
| `createPythHermesClient` | Live price queries for `/price` command |
| `createIndexerClient` | Supabase queries for `/markets` (FPMM listing) |

SDK math functions used:
- `quoteContractBuy` — FPMM buy quote
- `quoteTurboPayout` — Turbo payout calculation
- `TurboMarketStatus` — Market status enum

## Troubleshooting

### Bot doesn't respond

- Check only one instance is running (409 conflict = duplicate polling)
- Kill other instances: `pkill -f "tsx bot.ts"`

### `/fund` fails with Cloudflare 522

- Aleo RPC endpoint temporarily down — retry in a few minutes
- Check: `curl -s https://api.explorer.provable.com/v1/testnet/latest/height`

### `/bet` fails with "No private record"

- Run `/fund <amount>` first to create a private record
- Each bet consumes the record; bot auto-captures change record after confirmation

### `/markets` returns empty

- Needs `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `.env`
- Without indexer, use `/buy <MARKET_ID> YES 1` directly with a known market ID

### `WALLET_ENCRYPTION_KEY not set`

- Generate: `openssl rand -hex 32`
- Add to `.env`: `WALLET_ENCRYPTION_KEY=<hex>`

## Running in production

```bash
# With pm2
npm install -g pm2
pm2 start "npx tsx bot.ts" --name veiled-bot
pm2 save

# With systemd (see docs/turbo-backend-runbook.md for template)
```

## License

MIT — same as parent project.
