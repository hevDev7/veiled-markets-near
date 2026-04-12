#!/usr/bin/env tsx
// ============================================================================
// Veiled Markets — Telegram Bot (SDK integration test)
// ============================================================================
// Tests @veiled-markets/sdk by exposing Turbo market interactions via a
// Telegram chat interface.
//
// COMMANDS:
//   /start              — show welcome + command list
//   /help               — same as /start
//   /price <SYMBOL>     — current Pyth price for symbol (BTC/ETH/SOL/...)
//   /market <SYMBOL>    — current active Turbo round status (baseline, deadline)
//   /quote <SYMBOL> <UP|DOWN> <AMOUNT>  — calculate expected payout
//   /bet <SYMBOL> <UP|DOWN> <AMOUNT>    — place actual bet (DRY_RUN=1 simulates)
//   /history <SYMBOL>   — last 5 resolved rounds + UP/DOWN ratio
//   /verify <MARKET_ID> — cross-check operator claim vs Pyth Hermes
//   /watch <SYMBOL>     — auto-notify when new round opens (per-chat subscription)
//   /unwatch            — stop notifications
//   /status             — bot health + SDK version + connected services
//   /whoami             — show your Telegram ID (for authorization setup)
//
// AUTHORIZATION:
//   Only TELEGRAM_AUTHORIZED_IDS users can issue /bet (mutating command).
//   Read commands (/price /market /quote /history /verify /watch /status) are
//   open to all chats — bot acts as a public read-only dashboard.
// ============================================================================

import 'dotenv/config'
import TelegramBot from 'node-telegram-bot-api'
import {
  createTurboClient,
  createNodeExecutor,
  createIndexerClient,
  createPythHermesClient,
  PYTH_FEED_IDS,
  TURBO_MIN_TRADE_AMOUNT,
  type TurboSide,
} from '@veiled-markets/sdk'
import { findCreditsRecord, getAddress } from './records.js'

// ── Env validation ───────────────────────────────────────────────────────────
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN
if (!TG_TOKEN) {
  console.error('FATAL: TELEGRAM_BOT_TOKEN not set in .env')
  process.exit(1)
}

const ALEO_KEY = process.env.ALEO_PRIVATE_KEY
const ALEO_ADDR = ALEO_KEY ? getAddress(ALEO_KEY) : (process.env.ALEO_ADDRESS ?? '(not set)')
const ORACLE_URL = process.env.TURBO_ORACLE_URL ?? 'https://evonft.xyz'
const NETWORK = (process.env.ALEO_NETWORK ?? 'testnet') as 'testnet' | 'mainnet'
const DRY_RUN = process.env.DRY_RUN === '1'
const DEFAULT_SYMBOL = (process.env.DEFAULT_SYMBOL ?? 'BTC').toUpperCase()
const DEFAULT_AMOUNT = parseFloat(process.env.DEFAULT_AMOUNT ?? '0.5')
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS ?? '15000', 10)

const AUTHORIZED_IDS = new Set(
  (process.env.TELEGRAM_AUTHORIZED_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => parseInt(s, 10))
    .filter((n) => Number.isFinite(n)),
)

// ── SDK clients ──────────────────────────────────────────────────────────────
const turbo = createTurboClient({ network: NETWORK })
const pyth = createPythHermesClient()

const executor = ALEO_KEY
  ? createNodeExecutor({ privateKey: ALEO_KEY, dryRun: DRY_RUN })
  : null

const indexer =
  process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY
    ? createIndexerClient({
        supabaseUrl: process.env.SUPABASE_URL,
        supabaseKey: process.env.SUPABASE_ANON_KEY,
      })
    : null

// ── Telegram bot init ────────────────────────────────────────────────────────
const bot = new TelegramBot(TG_TOKEN, { polling: true })

console.log('━'.repeat(70))
console.log('VEILED MARKETS — Telegram Bot (SDK integration test)')
console.log('━'.repeat(70))
console.log(`Network:        ${NETWORK}`)
console.log(`Oracle URL:     ${ORACLE_URL}`)
console.log(`Dry run:        ${DRY_RUN ? 'YES (no on-chain broadcast)' : 'NO (real bets!)'}`)
console.log(`Aleo address:   ${ALEO_ADDR}`)
console.log(`Executor:       ${executor ? 'configured' : 'NOT configured (read-only)'}`)
console.log(`Indexer:        ${indexer ? 'connected' : 'NOT connected'}`)
console.log(`Authorized IDs: ${AUTHORIZED_IDS.size > 0 ? Array.from(AUTHORIZED_IDS).join(', ') : '(open — anyone can /bet)'}`)
console.log('━'.repeat(70))
console.log('Bot polling Telegram for messages...\n')

// ── Helpers ──────────────────────────────────────────────────────────────────
function escapeMd(text: string): string {
  // Telegram MarkdownV2 reserved characters
  return text.replace(/[_*\[\]()~`>#+\-=|{}.!]/g, (m) => `\\${m}`)
}

function isAuthorized(userId: number | undefined): boolean {
  if (AUTHORIZED_IDS.size === 0) return true // open mode
  return userId !== undefined && AUTHORIZED_IDS.has(userId)
}

function fmtAleo(micro: bigint): string {
  return (Number(micro) / 1_000_000).toFixed(4)
}

function fmtUsd(price: number): string {
  return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

async function fetchActiveMarket(symbol: string): Promise<{
  market_id: string
  symbol: string
  baseline_price: number
  deadline_ms?: number
  status: 'active' | 'resolving' | 'resolved'
} | null> {
  try {
    const res = await fetch(`${ORACLE_URL}/chain/symbol?symbol=${symbol}`)
    if (!res.ok) return null
    return (await res.json()) as any
  } catch {
    return null
  }
}

function knownSymbol(s: string): boolean {
  return s in PYTH_FEED_IDS
}

// ── Watch subscriptions (per-chat) ───────────────────────────────────────────
interface WatchSub {
  chatId: number
  symbol: string
  lastMarketId: string | null
}
const watchers: WatchSub[] = []

setInterval(async () => {
  for (const sub of watchers) {
    const m = await fetchActiveMarket(sub.symbol)
    if (!m) continue
    if (m.market_id === sub.lastMarketId) continue
    if (m.status !== 'active') continue
    sub.lastMarketId = m.market_id
    const secsLeft = m.deadline_ms ? Math.max(0, Math.floor((m.deadline_ms - Date.now()) / 1000)) : null
    bot.sendMessage(
      sub.chatId,
      `🔔 *New ${escapeMd(sub.symbol)} round opened*\n` +
        `Baseline: $${escapeMd(fmtUsd(m.baseline_price))}\n` +
        `Deadline: ${secsLeft !== null ? `in ${secsLeft}s` : '\\-'}\n` +
        `Market ID: \`${escapeMd(m.market_id.slice(0, 24))}…\`\n\n` +
        `Use /quote ${escapeMd(sub.symbol)} UP 1 to see expected payout\\.`,
      { parse_mode: 'MarkdownV2' },
    )
  }
}, POLL_INTERVAL_MS)

// ── Command handlers ─────────────────────────────────────────────────────────

// /start, /help — welcome message
bot.onText(/^\/(start|help)$/, (msg) => {
  const text =
    `*Veiled Markets Bot* \\— SDK integration test\n\n` +
    `*Read commands \\(open to all\\):*\n` +
    `/price \\<SYMBOL\\> \\— current Pyth price\n` +
    `/market \\<SYMBOL\\> \\— current Turbo round status\n` +
    `/quote \\<SYMBOL\\> \\<UP\\|DOWN\\> \\<AMOUNT\\> \\— payout calculator\n` +
    `/history \\<SYMBOL\\> \\— last 5 resolved rounds\n` +
    `/verify \\<MARKET\\_ID\\> \\— cross\\-check operator vs Pyth\n` +
    `/watch \\<SYMBOL\\> \\— notify on new rounds\n` +
    `/unwatch \\— stop notifications\n` +
    `/status \\— bot health\n` +
    `/whoami \\— show your Telegram ID\n\n` +
    `*Bet commands \\(authorized only\\):*\n` +
    `/bet \\<SYMBOL\\> \\<UP\\|DOWN\\> \\<AMOUNT\\>\n\n` +
    `Network: \`${escapeMd(NETWORK)}\` \\| Mode: ${DRY_RUN ? '🟡 DRY\\_RUN' : '🔴 LIVE'}`
  bot.sendMessage(msg.chat.id, text, { parse_mode: 'MarkdownV2' })
})

// /whoami — show user's telegram ID (for adding to AUTHORIZED_IDS)
bot.onText(/^\/whoami$/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    `Your Telegram ID: \`${msg.from?.id ?? 'unknown'}\`\n` +
      `Authorized for /bet: ${isAuthorized(msg.from?.id) ? '✅ yes' : '❌ no'}\n\n` +
      `To enable /bet, ask the bot operator to add this ID to TELEGRAM_AUTHORIZED_IDS in .env`,
    { parse_mode: 'MarkdownV2' },
  )
})

// /status — bot health
bot.onText(/^\/status$/, async (msg) => {
  const oracleOk = (await fetch(`${ORACLE_URL}/health`).catch(() => null))?.ok ?? false
  const text =
    `*Bot Status*\n\n` +
    `SDK: \`@veiled\\-markets/sdk@0\\.5\\.0\`\n` +
    `Network: \`${escapeMd(NETWORK)}\`\n` +
    `Oracle: \`${escapeMd(ORACLE_URL)}\` ${oracleOk ? '✅' : '❌'}\n` +
    `Executor: ${executor ? '✅ ready' : '❌ no private key'}\n` +
    `Indexer: ${indexer ? '✅ connected' : '⚠️ not configured'}\n` +
    `Mode: ${DRY_RUN ? '🟡 DRY\\_RUN' : '🔴 LIVE'}\n` +
    `Watchers: ${watchers.length}\n` +
    `Aleo addr: \`${escapeMd(ALEO_ADDR.slice(0, 20))}…\``
  bot.sendMessage(msg.chat.id, text, { parse_mode: 'MarkdownV2' })
})

// /price <SYMBOL> — current Pyth price
bot.onText(/^\/price(?:\s+(\w+))?$/, async (msg, match) => {
  const symbol = (match?.[1] ?? DEFAULT_SYMBOL).toUpperCase()
  if (!knownSymbol(symbol)) {
    bot.sendMessage(
      msg.chat.id,
      `Unknown symbol \`${escapeMd(symbol)}\`\\. Supported: BTC, ETH, SOL`,
      { parse_mode: 'MarkdownV2' },
    )
    return
  }
  try {
    // Fetch LATEST price from Pyth Hermes (not historical — that uses /price/{timestamp})
    const feedId = PYTH_FEED_IDS[symbol]
    const url = `https://hermes.pyth.network/v2/updates/price/latest?ids[]=${feedId}&parsed=true`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Pyth ${res.status}`)
    const data = (await res.json()) as any
    const p = data?.parsed?.[0]?.price
    if (!p) throw new Error('no price in response')
    const expo = Number(p.expo)
    const price = Number(p.price) * Math.pow(10, expo)
    const conf = Number(p.conf) * Math.pow(10, expo)
    bot.sendMessage(
      msg.chat.id,
      `*${escapeMd(symbol)}/USD* \\(Pyth Hermes\\)\n\n` +
        `Price: $${escapeMd(fmtUsd(price))}\n` +
        `Confidence: ±$${escapeMd(fmtUsd(conf))}\n` +
        `Published: ${escapeMd(new Date(p.publish_time * 1000).toISOString())}`,
      { parse_mode: 'MarkdownV2' },
    )
  } catch (err) {
    bot.sendMessage(msg.chat.id, `Error fetching ${symbol} price: ${(err as Error).message}`)
  }
})

// /market <SYMBOL> — current Turbo round
bot.onText(/^\/market(?:\s+(\w+))?$/, async (msg, match) => {
  const symbol = (match?.[1] ?? DEFAULT_SYMBOL).toUpperCase()
  const m = await fetchActiveMarket(symbol)
  if (!m) {
    bot.sendMessage(msg.chat.id, `No active ${symbol} market \\(oracle unreachable or no round open\\)`, {
      parse_mode: 'MarkdownV2',
    })
    return
  }
  const secsLeft = m.deadline_ms ? Math.max(0, Math.floor((m.deadline_ms - Date.now()) / 1000)) : null
  const text =
    `*${escapeMd(symbol)} Turbo Round*\n\n` +
    `Status: \`${escapeMd(m.status)}\`\n` +
    `Baseline: $${escapeMd(fmtUsd(m.baseline_price))}\n` +
    `Deadline: ${secsLeft !== null ? `in ${secsLeft}s` : '\\-'}\n` +
    `Market ID: \`${escapeMd(m.market_id.slice(0, 24))}…\`\n\n` +
    `Use /quote ${escapeMd(symbol)} UP 1 for payout estimate`
  bot.sendMessage(msg.chat.id, text, { parse_mode: 'MarkdownV2' })
})

// /quote <SYMBOL> <UP|DOWN> <AMOUNT>
bot.onText(/^\/quote(?:\s+(\w+))?(?:\s+(UP|DOWN))?(?:\s+(\d*\.?\d+))?$/i, async (msg, match) => {
  const symbol = (match?.[1] ?? DEFAULT_SYMBOL).toUpperCase()
  const side = (match?.[2] ?? 'UP').toUpperCase() as TurboSide
  const amountAleo = parseFloat(match?.[3] ?? String(DEFAULT_AMOUNT))

  if (!Number.isFinite(amountAleo) || amountAleo <= 0) {
    bot.sendMessage(msg.chat.id, 'Amount must be a positive number')
    return
  }

  const amountMicro = BigInt(Math.round(amountAleo * 1_000_000))
  if (amountMicro < TURBO_MIN_TRADE_AMOUNT) {
    bot.sendMessage(
      msg.chat.id,
      `Amount too small\\. Minimum: ${escapeMd(fmtAleo(TURBO_MIN_TRADE_AMOUNT))} ALEO`,
      { parse_mode: 'MarkdownV2' },
    )
    return
  }

  const m = await fetchActiveMarket(symbol)
  if (!m) {
    bot.sendMessage(msg.chat.id, `No active ${symbol} market`)
    return
  }

  // Fetch pool from on-chain mapping via SDK
  try {
    const pool = await turbo.getPool(m.market_id)
    if (!pool) {
      bot.sendMessage(
        msg.chat.id,
        `Pool not yet visible on\\-chain \\(new round, wait a few seconds\\)`,
        { parse_mode: 'MarkdownV2' },
      )
      return
    }

    // Quote — note: quoteBuyUpDown signature varies; this is a defensive call
    const quote: any = (turbo as any).quoteBuyUpDown
      ? (turbo as any).quoteBuyUpDown({ pool, side, amountIn: amountMicro })
      : { protocolFee: amountMicro / 200n, expectedShares: amountMicro - amountMicro / 200n }

    const protocolFee = BigInt(quote.protocolFee ?? 0)
    const expectedShares = BigInt(quote.expectedShares ?? quote.shares ?? 0)

    bot.sendMessage(
      msg.chat.id,
      `*Quote: ${escapeMd(amountAleo.toFixed(4))} ALEO ${escapeMd(side)} on ${escapeMd(symbol)}*\n\n` +
        `Bet amount: ${escapeMd(fmtAleo(amountMicro))} ALEO\n` +
        `Protocol fee \\(0\\.5%\\): ${escapeMd(fmtAleo(protocolFee))} ALEO\n` +
        `Expected shares: ${escapeMd(fmtAleo(expectedShares))}\n\n` +
        `Final payout depends on the closing price vs baseline at round end\\.`,
      { parse_mode: 'MarkdownV2' },
    )
  } catch (err) {
    bot.sendMessage(msg.chat.id, `Quote error: ${(err as Error).message.slice(0, 200)}`)
  }
})

// /bet <SYMBOL> <UP|DOWN> <AMOUNT> — actual bet (authorized only)
bot.onText(/^\/bet(?:\s+(\w+))?(?:\s+(UP|DOWN))?(?:\s+(\d*\.?\d+))?$/i, async (msg, match) => {
  if (!isAuthorized(msg.from?.id)) {
    bot.sendMessage(
      msg.chat.id,
      `❌ You are not authorized to /bet\\. Use /whoami to get your ID, then ask the operator to add you\\.`,
      { parse_mode: 'MarkdownV2' },
    )
    return
  }

  if (!executor) {
    bot.sendMessage(
      msg.chat.id,
      `❌ Executor not configured \\— ALEO\\_PRIVATE\\_KEY not set in bot \\.env`,
      { parse_mode: 'MarkdownV2' },
    )
    return
  }

  const symbol = (match?.[1] ?? DEFAULT_SYMBOL).toUpperCase()
  const side = (match?.[2] ?? 'UP').toUpperCase() as TurboSide
  const amountAleo = parseFloat(match?.[3] ?? String(DEFAULT_AMOUNT))

  const amountMicro = BigInt(Math.round(amountAleo * 1_000_000))
  if (amountMicro < TURBO_MIN_TRADE_AMOUNT) {
    bot.sendMessage(
      msg.chat.id,
      `Amount too small\\. Min: ${escapeMd(fmtAleo(TURBO_MIN_TRADE_AMOUNT))} ALEO`,
      { parse_mode: 'MarkdownV2' },
    )
    return
  }

  const m = await fetchActiveMarket(symbol)
  if (!m) {
    bot.sendMessage(msg.chat.id, `No active ${symbol} market`)
    return
  }
  if (m.status !== 'active') {
    bot.sendMessage(msg.chat.id, `Market is ${m.status}, can't bet now`)
    return
  }

  bot.sendMessage(
    msg.chat.id,
    `⏳ Building bet: ${escapeMd(amountAleo.toFixed(4))} ALEO ${escapeMd(side)} on ${escapeMd(symbol)}\\.\\.\\.\n` +
      `Mode: ${DRY_RUN ? '🟡 DRY\\_RUN' : '🔴 LIVE'}`,
    { parse_mode: 'MarkdownV2' },
  )

  try {
    // ── Step 1: Find a usable credits record ──────────────────────────
    // In LIVE mode, we need a real unspent credits.aleo record. The
    // records.ts module scans the chain via @provablehq/sdk's
    // NetworkRecordProvider using the bot's view key.
    // In DRY_RUN mode, a placeholder record suffices since snarkos
    // won't actually broadcast.
    let creditsRecord: string | null = null

    if (DRY_RUN) {
      // Placeholder — executor won't broadcast anyway
      creditsRecord =
        '{owner: aleo1placeholder.private, microcredits: 1000000000u64.private, _nonce: 0group.public}'
    } else {
      // Real scan — find unspent record with enough balance
      // Include 1 ALEO priority fee buffer on top of bet amount
      const totalNeeded = amountMicro + 1_000_000n // bet + priority fee
      bot.sendMessage(
        msg.chat.id,
        `🔍 Scanning chain for credits record \\(${escapeMd(fmtAleo(totalNeeded))} ALEO needed\\)\\.\\.\\.\nThis may take 10\\-30s on first scan\\.`,
        { parse_mode: 'MarkdownV2' },
      )
      creditsRecord = await findCreditsRecord(ALEO_KEY!, totalNeeded)
    }

    if (!creditsRecord) {
      bot.sendMessage(
        msg.chat.id,
        `❌ No usable credits record found\\.\n\n` +
          `Make sure your wallet has testnet ALEO:\n` +
          `1\\. Get credits from [faucet\\.aleo\\.org](https://faucet.aleo.org)\n` +
          `2\\. Wait for tx to confirm \\(\\~30s\\)\n` +
          `3\\. Retry /bet\n\n` +
          `Or set CREDITS\\_RECORD\\_PLAINTEXT in \\.env as manual fallback\\.`,
        { parse_mode: 'MarkdownV2' },
      )
      return
    }

    // ── Step 2: Build and submit ──────────────────────────────────────
    const expectedShares = amountMicro - amountMicro / 200n // after 0.5% fee
    const call = turbo.buildBuyUpDownInputs({
      marketId: m.market_id,
      side,
      amountIn: amountMicro,
      expectedShares,
      creditsRecord,
    })

    const result = await executor.execute(call)
    const txDisplay = result.txId.slice(0, 32)

    if (DRY_RUN) {
      bot.sendMessage(
        msg.chat.id,
        `✅ *DRY RUN complete*\n\n` +
          `Tx ID: \`${escapeMd(txDisplay)}…\`\n` +
          `No on\\-chain broadcast \\(DRY\\_RUN\\=1\\)\\.\n` +
          `Set DRY\\_RUN\\=0 in \\.env for real bets\\.`,
        { parse_mode: 'MarkdownV2' },
      )
    } else {
      bot.sendMessage(
        msg.chat.id,
        `✅ *Bet broadcast to Aleo testnet\\!*\n\n` +
          `Tx ID: \`${escapeMd(txDisplay)}…\`\n` +
          `Amount: ${escapeMd(amountAleo.toFixed(4))} ALEO ${escapeMd(side)}\n` +
          `Market: \`${escapeMd(m.market_id.slice(0, 20))}…\`\n\n` +
          `Track on explorer:\nhttps://testnet\\.explorer\\.provable\\.com/transaction/${escapeMd(result.txId)}`,
        { parse_mode: 'MarkdownV2' },
      )
    }
  } catch (err) {
    bot.sendMessage(msg.chat.id, `❌ Bet failed: ${(err as Error).message.slice(0, 300)}`)
  }
})

// /history <SYMBOL> — last 5 resolved rounds
bot.onText(/^\/history(?:\s+(\w+))?$/, async (msg, match) => {
  const symbol = (match?.[1] ?? DEFAULT_SYMBOL).toUpperCase()

  if (!indexer) {
    bot.sendMessage(
      msg.chat.id,
      `❌ Indexer not configured \\(SUPABASE\\_URL/KEY missing in \\.env\\)`,
      { parse_mode: 'MarkdownV2' },
    )
    return
  }

  try {
    // SDK indexer API may differ — defensive call
    const rows: any[] = await (indexer as any).listTurboAudit?.({
      symbol,
      event: 'resolve',
      limit: 5,
    }) ?? []

    if (rows.length === 0) {
      bot.sendMessage(msg.chat.id, `No history for ${symbol}`)
      return
    }

    let text = `*Last ${rows.length} resolved ${escapeMd(symbol)} rounds*\n\n`
    let upCount = 0
    for (const r of rows) {
      const baseline = Number(r.metadata?.baseline_price ?? 0)
      const closing = Number(r.pyth_price ?? 0)
      const isUp = closing > baseline
      if (isUp) upCount++
      const arrow = isUp ? '⬆️' : '⬇️'
      const pct = baseline > 0 ? ((closing - baseline) / baseline) * 100 : 0
      text += `${arrow} $${escapeMd(fmtUsd(baseline))} → $${escapeMd(fmtUsd(closing))} \\(${escapeMd(pct.toFixed(3))}%\\)\n`
    }
    text += `\nUP rate: ${upCount}/${rows.length}`
    bot.sendMessage(msg.chat.id, text, { parse_mode: 'MarkdownV2' })
  } catch (err) {
    bot.sendMessage(msg.chat.id, `History error: ${(err as Error).message.slice(0, 200)}`)
  }
})

// /verify <MARKET_ID>
bot.onText(/^\/verify\s+(\S+)$/, async (msg, match) => {
  const marketId = match![1]
  bot.sendMessage(
    msg.chat.id,
    `Open verify page in browser:\nhttps://veiledmarkets.xyz/verify/turbo/${marketId}`,
  )
})

// /watch <SYMBOL>
bot.onText(/^\/watch(?:\s+(\w+))?$/, (msg, match) => {
  const symbol = (match?.[1] ?? DEFAULT_SYMBOL).toUpperCase()
  if (!knownSymbol(symbol)) {
    bot.sendMessage(msg.chat.id, `Unknown symbol ${symbol}. Supported: BTC, ETH, SOL`)
    return
  }
  // Replace existing watch for this chat
  const existing = watchers.findIndex((w) => w.chatId === msg.chat.id)
  if (existing >= 0) watchers.splice(existing, 1)
  watchers.push({ chatId: msg.chat.id, symbol, lastMarketId: null })
  bot.sendMessage(
    msg.chat.id,
    `🔔 Watching ${escapeMd(symbol)} \\— you'll get a message when each new round opens \\(every \\~5 min\\)\\. Use /unwatch to stop\\.`,
    { parse_mode: 'MarkdownV2' },
  )
})

// /unwatch
bot.onText(/^\/unwatch$/, (msg) => {
  const before = watchers.length
  for (let i = watchers.length - 1; i >= 0; i--) {
    if (watchers[i].chatId === msg.chat.id) watchers.splice(i, 1)
  }
  bot.sendMessage(
    msg.chat.id,
    before > watchers.length ? '🔕 Watch removed.' : 'You were not watching anything.',
  )
})

// ── Error handler ────────────────────────────────────────────────────────────
bot.on('polling_error', (err) => {
  console.error('[telegram] polling error:', err.message)
})

console.log('[bot] ready — send /start to your bot in Telegram')
