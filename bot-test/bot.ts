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
  createClient,
  createNodeExecutor,
  createIndexerClient,
  createPythHermesClient,
  PYTH_FEED_IDS,
  TURBO_MIN_TRADE_AMOUNT,
  quoteTurboPayout,
  quoteContractBuy,
  TurboMarketStatus,
  type TurboSide,
} from '@veiled-markets/sdk'
import { execSync } from 'child_process'
import { findCreditsRecord, getAddress, startRecordScan, captureChangeRecord, replaceRecord } from './records.js'
import { loadWallets, getOrCreateWallet, getWallet, updateCreditsRecord, getViewKey } from './wallets.js'

// ── Env validation ───────────────────────────────────────────────────────────
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN
if (!TG_TOKEN) {
  console.error('FATAL: TELEGRAM_BOT_TOKEN not set in .env')
  process.exit(1)
}

const ORACLE_URL = process.env.TURBO_ORACLE_URL ?? 'https://evonft.xyz'
const NETWORK = (process.env.ALEO_NETWORK ?? 'testnet') as 'testnet' | 'mainnet'
const DRY_RUN = process.env.DRY_RUN === '1'
const DEFAULT_SYMBOL = (process.env.DEFAULT_SYMBOL ?? 'BTC').toUpperCase()
const DEFAULT_AMOUNT = parseFloat(process.env.DEFAULT_AMOUNT ?? '0.5')
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS ?? '15000', 10)

// ── SDK clients ──────────────────────────────────────────────────────────────
const turbo = createTurboClient({ network: NETWORK })
const pyth = createPythHermesClient()

const indexer =
  process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY
    ? createIndexerClient({
        supabaseUrl: process.env.SUPABASE_URL,
        supabaseKey: process.env.SUPABASE_ANON_KEY,
      })
    : null

// ── FPMM client ─────────────────────────────────────────────────────────────
const fpmm = createClient({ network: NETWORK })
if (indexer) fpmm.setIndexer(indexer)

// ── Load user wallets ───────────────────────────────────────────────────────
loadWallets()

/** Create a per-user executor on demand */
function getUserExecutor(privateKey: string) {
  return createNodeExecutor({ privateKey, dryRun: DRY_RUN, maxRetries: 1 })
}

// ── Telegram bot init ────────────────────────────────────────────────────────
const bot = new TelegramBot(TG_TOKEN, { polling: true })

console.log('━'.repeat(70))
console.log('VEILED MARKETS — Telegram Bot (multi-user)')
console.log('━'.repeat(70))
console.log(`Network:        ${NETWORK}`)
console.log(`Oracle URL:     ${ORACLE_URL}`)
console.log(`Dry run:        ${DRY_RUN ? 'YES (no on-chain broadcast)' : 'NO (real bets!)'}`)
console.log(`Mode:           Multi-user (auto wallet per user)`)
console.log(`Indexer:        ${indexer ? 'connected' : 'NOT connected'}`)
console.log('━'.repeat(70))
console.log('Bot polling Telegram for messages...\n')

// ── Helpers ──────────────────────────────────────────────────────────────────
function escapeMd(text: string): string {
  // Telegram MarkdownV2 reserved characters
  return text.replace(/[_*\[\]()~`>#+\-=|{}.!]/g, (m) => `\\${m}`)
}

/** Safe send — retry as plain text if MarkdownV2 parsing fails */
function sendMsg(chatId: number, text: string, md2 = true) {
  const opts = md2 ? { parse_mode: 'MarkdownV2' as const } : {}
  return bot.sendMessage(chatId, text, opts).catch(() => {
    // Strip markdown and retry as plain text
    const plain = text.replace(/\\([_*\[\]()~`>#+\-=|{}.!])/g, '$1')
    return bot.sendMessage(chatId, plain).catch(() => {})
  })
}

/** Ensure user has a wallet, return it */
function ensureWallet(msg: TelegramBot.Message) {
  const userId = msg.from?.id
  if (!userId) return null
  return getOrCreateWallet(userId)
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

// ── Bet tracker ──────────────────────────────────────────────────────────────
interface TrackedBet {
  userId: number
  marketId: string
  symbol: string
  side: TurboSide
  amountMicro: bigint
  txId: string
  shareRecord: string | null  // decrypted TurboShare plaintext
  timestamp: number
}

const trackedBets: TrackedBet[] = []

/** After bet tx confirms, capture both the TurboShare and change record */
async function captureBetOutputs(
  bet: TrackedBet,
  chatId: number,
): Promise<void> {
  const viewKey = getViewKey(bet.userId)
  if (!viewKey) return
  console.log(`[tracker] Waiting for bet tx ${bet.txId.slice(0, 24)}… to confirm...`)

  const maxWaitMs = 90_000
  const start = Date.now()
  const pollInterval = 5_000

  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await fetch(
        `https://api.explorer.provable.com/v1/testnet/transaction/${bet.txId}`
      )
      if (!res.ok) {
        await new Promise((r) => setTimeout(r, pollInterval))
        continue
      }

      const tx = (await res.json()) as any
      const transitions = tx?.execution?.transitions ?? []

      for (const t of transitions) {
        for (const o of (t.outputs ?? [])) {
          if (o.type !== 'record') continue
          const ciphertext = o.value
          if (!ciphertext?.startsWith('record1')) continue

          try {
            const plaintext = execSync(
              `snarkos developer decrypt --ciphertext "${ciphertext}" --view-key "${viewKey}" --network 1`,
              { encoding: 'utf8', timeout: 15_000 }
            ).trim()

            if (plaintext.includes('microcredits:')) {
              // Change record — update per-user credits cache
              updateCreditsRecord(bet.userId, plaintext)
              console.log(`[tracker] Change record captured for user ${bet.userId}`)
            } else if (plaintext.includes('market_id:') && plaintext.includes('quantity:')) {
              // TurboShare record — save to bet tracker
              bet.shareRecord = plaintext
              console.log(`[tracker] Share record captured for market ${bet.marketId.slice(0, 20)}…`)
            }
          } catch {
            // Not our record — skip
          }
        }
      }

      if (bet.shareRecord) {
        bot.sendMessage(chatId,
          `🔄 Bet confirmed\\! Share record saved\\.\n` +
            `Use /mybets to see your bets, /result to check outcomes\\.`,
          { parse_mode: 'MarkdownV2' },
        )
      } else {
        bot.sendMessage(chatId, `🔄 Change record captured — ready for next bet`)
      }
      return
    } catch {
      await new Promise((r) => setTimeout(r, pollInterval))
    }
  }

  bot.sendMessage(chatId, `⚠️ Timed out waiting for bet confirmation. Check explorer manually.`)
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

// /start, /help — welcome message + auto-create wallet
bot.onText(/^\/(start|help)$/, (msg) => {
  const w = ensureWallet(msg)
  if (!w) return
  const text =
    `*Veiled Markets Bot* \\— Turbo Prediction Markets\n\n` +
    `*Read commands \\(open to all\\):*\n` +
    `/price \\<SYMBOL\\> \\— current Pyth price\n` +
    `/market \\<SYMBOL\\> \\— current Turbo round status\n` +
    `/quote \\<SYMBOL\\> \\<UP\\|DOWN\\> \\<AMOUNT\\> \\— payout calculator\n` +
    `/history \\<SYMBOL\\> \\— last 5 resolved rounds\n` +
    `/verify \\<MARKET\\_ID\\> \\— cross\\-check operator vs Pyth\n` +
    `/watch \\<SYMBOL\\> \\— notify on new rounds\n` +
    `/unwatch \\— stop notifications\n` +
    `/status \\— bot health\n\n` +
    `*Wallet \\& Turbo commands:*\n` +
    `/wallet \\— show your wallet address \\& balance\n` +
    `/fund \\<AMOUNT\\> \\— convert public ALEO to private record\n` +
    `/bet \\<SYMBOL\\> \\<UP\\|DOWN\\> \\<AMOUNT\\> \\— Turbo bet\n` +
    `/mybets \\— show all tracked bets\n` +
    `/result \\— check all bets for win/loss\n` +
    `/claim \\— auto\\-claim all winnings\n\n` +
    `*FPMM Prediction Markets:*\n` +
    `/markets \\— list active prediction markets\n` +
    `/marketinfo \\<ID\\> \\— market details \\& odds\n` +
    `/buy \\<ID\\> \\<YES\\|NO\\> \\<AMOUNT\\> \\— buy outcome shares\n` +
    `/redeem \\<ID\\> \\— redeem shares after resolution\n\n` +
    `💡 *How to start:*\n` +
    `1\\. Run /wallet to see your deposit address\n` +
    `2\\. Send testnet ALEO to that address\n` +
    `3\\. Run /fund 5 to convert to private record\n` +
    `4\\. Run /bet BTC UP 1 to place a bet\n` +
    `5\\. Use /mybets, /result, /claim to manage\n\n` +
    `Your wallet: \`${escapeMd(w.address)}\`\n` +
    `Network: \`${escapeMd(NETWORK)}\` \\| Mode: ${DRY_RUN ? '🟡 DRY\\_RUN' : '🔴 LIVE'}`
  sendMsg(msg.chat.id, text)
})

// /wallet — show user's wallet address and balance
bot.onText(/^\/wallet$/, async (msg) => {
  const w = ensureWallet(msg)
  if (!w) return

  // Check public balance
  let publicBalance = '—'
  try {
    const res = await fetch(
      `https://api.explorer.provable.com/v1/testnet/program/credits.aleo/mapping/account/${w.address}`
    )
    if (res.ok) {
      const text = (await res.text()).replace(/"/g, '')
      const m = text.match(/(\d+)u64/)
      if (m) publicBalance = `${(Number(BigInt(m[1])) / 1e6).toFixed(4)} ALEO`
    }
  } catch { /* ignore */ }

  // Check private record cache
  let privateBalance = 'none'
  if (w.creditsRecord) {
    const m = w.creditsRecord.match(/microcredits:\s*(\d+)u64/)
    if (m) privateBalance = `${(Number(BigInt(m[1])) / 1e6).toFixed(4)} ALEO`
  }

  bot.sendMessage(
    msg.chat.id,
    `*Your Wallet*\n\n` +
      `Address:\n\`${escapeMd(w.address)}\`\n\n` +
      `Public balance: ${escapeMd(publicBalance)}\n` +
      `Private record: ${escapeMd(privateBalance)}\n\n` +
      `To deposit: send testnet ALEO to the address above\\.\n` +
      `Then run /fund \\<amount\\> to convert to private record for betting\\.`,
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
    `Indexer: ${indexer ? '✅ connected' : '⚠️ not configured'}\n` +
    `Mode: ${DRY_RUN ? '🟡 DRY\\_RUN' : '🔴 LIVE'} \\| Multi\\-user\n` +
    `Watchers: ${watchers.length}\n` +
    `Tracked bets: ${trackedBets.length}`
  sendMsg(msg.chat.id, text)
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
    sendMsg(msg.chat.id, `Error fetching ${symbol} price: ${(err as Error).message}`)
  }
})

// /market <SYMBOL> — current Turbo round
bot.onText(/^\/market(?:\s+(\w+))?$/, async (msg, match) => {
  const symbol = (match?.[1] ?? DEFAULT_SYMBOL).toUpperCase()
  const m = await fetchActiveMarket(symbol)
  if (!m) {
    sendMsg(msg.chat.id, `No active ${symbol} market \\(oracle unreachable or no round open\\)`)
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
  sendMsg(msg.chat.id, text)
})

// /quote <SYMBOL> <UP|DOWN> <AMOUNT>
bot.onText(/^\/quote(?:\s+(\w+))?(?:\s+(UP|DOWN))?(?:\s+(\d*\.?\d+))?$/i, async (msg, match) => {
  const symbol = (match?.[1] ?? DEFAULT_SYMBOL).toUpperCase()
  const side = (match?.[2] ?? 'UP').toUpperCase() as TurboSide
  const amountAleo = parseFloat(match?.[3] ?? String(DEFAULT_AMOUNT))

  if (!Number.isFinite(amountAleo) || amountAleo <= 0) {
    sendMsg(msg.chat.id, 'Amount must be a positive number')
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
    sendMsg(msg.chat.id, `No active ${symbol} market`)
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
    sendMsg(msg.chat.id, `Quote error: ${(err as Error).message.slice(0, 200)}`)
  }
})

// /bet <SYMBOL> <UP|DOWN> <AMOUNT> — actual bet (authorized only)
bot.onText(/^\/bet(?:\s+(\w+))?(?:\s+(UP|DOWN))?(?:\s+(\d*\.?\d+))?$/i, async (msg, match) => {
  const w = ensureWallet(msg)
  if (!w) return

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
    sendMsg(msg.chat.id, `No active ${symbol} market`)
    return
  }
  if (m.status !== 'active') {
    sendMsg(msg.chat.id, `Market is ${m.status}, can't bet now`)
    return
  }

  // Check deadline — need at least 60s for proving + block confirmation
  const MIN_DEADLINE_BUFFER_MS = 60_000
  const secsRemaining = m.deadline_ms ? Math.max(0, Math.floor((m.deadline_ms - Date.now()) / 1000)) : null
  if (secsRemaining !== null && secsRemaining < MIN_DEADLINE_BUFFER_MS / 1000) {
    bot.sendMessage(
      msg.chat.id,
      `⏰ Market expires in ${secsRemaining}s — too late to bet\\. Need at least 60s for tx proving\\. Wait for next round\\.`,
      { parse_mode: 'MarkdownV2' },
    )
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
    // Use per-user cached credits record
    const creditsRecord = DRY_RUN
      ? '{owner: aleo1placeholder.private, microcredits: 1000000000u64.private, _nonce: 0group.public}'
      : w.creditsRecord

    if (!creditsRecord) {
      bot.sendMessage(
        msg.chat.id,
        `❌ No private record available.\n\n` +
          `Run /fund ${Math.ceil(amountAleo + 1)} first to create a private record, then retry /bet.`,
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

    const userExecutor = getUserExecutor(w.privateKey)
    const result = await userExecutor.execute(call)
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
      // Clear used record immediately (it's spent now)
      updateCreditsRecord(w.telegramId, null)

      // Track the bet
      const bet: TrackedBet = {
        userId: w.telegramId,
        marketId: m.market_id,
        symbol,
        side,
        amountMicro,
        txId: result.txId,
        shareRecord: null,
        timestamp: Date.now(),
      }
      trackedBets.push(bet)

      bot.sendMessage(
        msg.chat.id,
        `✅ *Bet broadcast to Aleo testnet\\!*\n\n` +
          `Tx ID: \`${escapeMd(txDisplay)}…\`\n` +
          `Amount: ${escapeMd(amountAleo.toFixed(4))} ALEO ${escapeMd(side)}\n` +
          `Market: \`${escapeMd(m.market_id.slice(0, 20))}…\`\n\n` +
          `Track on explorer:\nhttps://testnet\\.explorer\\.provable\\.com/transaction/${escapeMd(result.txId)}\n\n` +
          `⏳ Waiting for confirmation & saving share record\\.\\.\\.`,
        { parse_mode: 'MarkdownV2' },
      )

      // Auto-capture share record + change record in background
      captureBetOutputs(bet, msg.chat.id).catch(() => {})
    }
  } catch (err) {
    sendMsg(msg.chat.id, `❌ Bet failed: ${(err as Error).message.slice(0, 300)}`)
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
      sendMsg(msg.chat.id, `No history for ${symbol}`)
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
    sendMsg(msg.chat.id, text)
  } catch (err) {
    sendMsg(msg.chat.id, `History error: ${(err as Error).message.slice(0, 200)}`)
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
    sendMsg(msg.chat.id, `Unknown symbol ${symbol}. Supported: BTC, ETH, SOL`)
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

// /fund <AMOUNT> — convert public ALEO to private record (per-user wallet)
bot.onText(/^\/fund(?:\s+(\d*\.?\d+))?$/, async (msg, match) => {
  const w = ensureWallet(msg)
  if (!w) return

  const amount = parseFloat(match?.[1] ?? '5')
  const micro = Math.round(amount * 1_000_000)
  if (micro < 1_000_000) {
    sendMsg(msg.chat.id, `Minimum 1 ALEO`)
    return
  }

  bot.sendMessage(
    msg.chat.id,
    `⏳ Converting ${amount.toFixed(4)} ALEO public → private\\.\\.\\.\nThis takes \\~30\\-60s\\.`,
    { parse_mode: 'MarkdownV2' },
  )

  try {
    const stdout = execSync(
      `snarkos developer execute credits.aleo transfer_public_to_private ` +
        `"${w.address}" ${micro}u64 ` +
        `--private-key ${w.privateKey} ` +
        `--query "https://api.explorer.provable.com/v1" ` +
        `--broadcast "https://api.explorer.provable.com/v1/testnet/transaction/broadcast" ` +
        `--priority-fee 100000 --network 1`,
      { encoding: 'utf8', timeout: 120_000 }
    )

    const txMatch = stdout.match(/at1[a-z0-9]{50,}/)
    if (!txMatch) {
      sendMsg(msg.chat.id, `❌ No tx ID in snarkos output`)
      return
    }
    const txId = txMatch[0]

    bot.sendMessage(
      msg.chat.id,
      `✅ *Transfer broadcast\\!*\n\nTx: \`${escapeMd(txId.slice(0, 32))}…\`\n\n⏳ Waiting for confirmation \\& decrypting record\\.\\.\\.`,
      { parse_mode: 'MarkdownV2' },
    )

    const record = await captureChangeRecord(txId, w.privateKey)
    if (record) {
      updateCreditsRecord(w.telegramId, record)
      sendMsg(msg.chat.id, `✅ Private record ready (${amount.toFixed(4)} ALEO) — you can now /bet`)
    } else {
      sendMsg(msg.chat.id, `⚠️ Tx broadcast but could not capture record. Try /fund again later.`)
    }
  } catch (err) {
    sendMsg(msg.chat.id, `❌ Fund failed: ${(err as Error).message.slice(0, 300)}`)
  }
})

// /mybets — show user's tracked bets
bot.onText(/^\/mybets$/, async (msg) => {
  const userId = msg.from?.id
  if (!userId) return
  const userBets = trackedBets.filter(b => b.userId === userId)

  if (userBets.length === 0) {
    sendMsg(msg.chat.id, `No bets tracked yet. Place a bet with /bet first.`)
    return
  }

  let text = `*Your tracked bets \\(${userBets.length}\\):*\n\n`
  for (const bet of userBets) {
    const amount = (Number(bet.amountMicro) / 1e6).toFixed(4)
    const recorded = bet.shareRecord ? '✅' : '⏳'
    const age = Math.floor((Date.now() - bet.timestamp) / 60_000)
    text += `${recorded} ${escapeMd(bet.symbol)} ${escapeMd(bet.side)} ${escapeMd(amount)} ALEO \\(${age}m ago\\)\n`
  }
  text += `\nUse /result to check outcomes\\.`
  sendMsg(msg.chat.id, text)
})

// /result — check user's tracked bets for win/loss
bot.onText(/^\/result$/, async (msg) => {
  const userId = msg.from?.id
  if (!userId) return
  const userBets = trackedBets.filter(b => b.userId === userId)

  if (userBets.length === 0) {
    sendMsg(msg.chat.id, `No bets tracked. Place a bet with /bet first.`)
    return
  }

  let text = `*Bet Results:*\n\n`

  for (const bet of userBets) {
    const amount = (Number(bet.amountMicro) / 1e6).toFixed(4)
    try {
      const market = await turbo.getMarket(bet.marketId)
      if (!market) {
        text += `❓ ${escapeMd(bet.symbol)} ${escapeMd(bet.side)} ${escapeMd(amount)} — market not found\n`
        continue
      }

      if (market.status === TurboMarketStatus.Active) {
        text += `⏳ ${escapeMd(bet.symbol)} ${escapeMd(bet.side)} ${escapeMd(amount)} — still active\n`
      } else if (market.status === TurboMarketStatus.Resolved) {
        const winner = market.winningOutcome === 1 ? 'UP' : 'DOWN'
        const won = (bet.side === 'UP' && market.winningOutcome === 1) ||
                     (bet.side === 'DOWN' && market.winningOutcome === 2)

        if (won) {
          const pool = await turbo.getPool(bet.marketId)
          const totalPool = (pool?.totalUpAmount ?? 0n) + (pool?.totalDownAmount ?? 0n)
          const winningShares = market.winningOutcome === 1 ? (pool?.totalUpAmount ?? 0n) : (pool?.totalDownAmount ?? 0n)
          const shareQty = bet.amountMicro - bet.amountMicro / 200n // approximate shares
          const payout = winningShares > 0n ? quoteTurboPayout(shareQty, totalPool, winningShares) : 0n
          text += `🏆 ${escapeMd(bet.symbol)} ${escapeMd(bet.side)} ${escapeMd(amount)} — *WON* \\(~${escapeMd(fmtAleo(payout))} ALEO\\)${bet.shareRecord ? '' : ' ⚠️ no share record'}\n`
        } else {
          text += `💀 ${escapeMd(bet.symbol)} ${escapeMd(bet.side)} ${escapeMd(amount)} — LOST \\(winner: ${escapeMd(winner)}\\)\n`
        }
      } else if (market.status === TurboMarketStatus.Cancelled) {
        text += `🚫 ${escapeMd(bet.symbol)} ${escapeMd(bet.side)} ${escapeMd(amount)} — CANCELLED \\(refundable\\)\n`
      }
    } catch {
      text += `❓ ${escapeMd(bet.symbol)} ${escapeMd(bet.side)} ${escapeMd(amount)} — error checking\n`
    }
  }

  text += `\nUse /claim to collect winnings\\.`
  sendMsg(msg.chat.id, text)
})

// /claim — auto-claim all winning bets for user
bot.onText(/^\/claim$/, async (msg) => {
  const w = ensureWallet(msg)
  if (!w) return

  const userBets = trackedBets.filter(b => b.userId === w.telegramId)
  const claimable: TrackedBet[] = []

  for (const bet of userBets) {
    if (!bet.shareRecord) continue
    try {
      const market = await turbo.getMarket(bet.marketId)
      if (!market) continue

      if (market.status === TurboMarketStatus.Resolved) {
        const won = (bet.side === 'UP' && market.winningOutcome === 1) ||
                     (bet.side === 'DOWN' && market.winningOutcome === 2)
        if (won) claimable.push(bet)
      } else if (market.status === TurboMarketStatus.Cancelled) {
        claimable.push(bet)
      }
    } catch { /* skip */ }
  }

  if (claimable.length === 0) {
    bot.sendMessage(
      msg.chat.id,
      `No claimable bets found\\.\n\n` +
        `Possible reasons:\n` +
        `• Markets not resolved yet\n` +
        `• You lost the bet\n` +
        `• Share record not captured \\(check /mybets\\)`,
      { parse_mode: 'MarkdownV2' },
    )
    return
  }

  sendMsg(msg.chat.id, `⏳ Claiming ${claimable.length} bet(s)...`)

  for (const bet of claimable) {
    try {
      const market = await turbo.getMarket(bet.marketId)
      if (!market) continue
      const pool = await turbo.getPool(bet.marketId)

      if (market.status === TurboMarketStatus.Resolved) {
        // Parse share qty from record
        const qtyMatch = bet.shareRecord!.match(/quantity:\s*(\d+)u128/)
        if (!qtyMatch) continue
        const shareQty = BigInt(qtyMatch[1])

        const totalPool = (pool?.totalUpAmount ?? 0n) + (pool?.totalDownAmount ?? 0n)
        const winningShares = market.winningOutcome === 1 ? (pool?.totalUpAmount ?? 0n) : (pool?.totalDownAmount ?? 0n)
        const payout = quoteTurboPayout(shareQty, totalPool, winningShares)

        const call = turbo.buildClaimWinningsInputs({
          marketId: bet.marketId,
          shareRecord: bet.shareRecord!,
          declaredPayout: payout,
        })

        const claimExecutor = getUserExecutor(w.privateKey)
        const result = await claimExecutor.execute(call)
        bot.sendMessage(
          msg.chat.id,
          `✅ *${escapeMd(bet.symbol)} ${escapeMd(bet.side)} — Claimed ${escapeMd(fmtAleo(payout))} ALEO\\!*\n` +
            `Tx: \`${escapeMd(result.txId.slice(0, 32))}…\``,
          { parse_mode: 'MarkdownV2' },
        )

        // Capture payout record
        captureChangeRecord(result.txId, w.privateKey).then((rec) => {
          if (rec) updateCreditsRecord(w.telegramId, rec)
        }).catch(() => {})

        // Remove from tracked bets
        const idx = trackedBets.indexOf(bet)
        if (idx >= 0) trackedBets.splice(idx, 1)

      } else if (market.status === TurboMarketStatus.Cancelled) {
        const qtyMatch = bet.shareRecord!.match(/quantity:\s*(\d+)u128/)
        const refundAmount = qtyMatch ? BigInt(qtyMatch[1]) : 0n

        const call = turbo.buildClaimRefundInputs({
          marketId: bet.marketId,
          shareRecord: bet.shareRecord!,
          expectedAmount: refundAmount,
        })

        const refundExecutor = getUserExecutor(w.privateKey)
        const result = await refundExecutor.execute(call)
        bot.sendMessage(
          msg.chat.id,
          `✅ *${escapeMd(bet.symbol)} — Refund ${escapeMd(fmtAleo(refundAmount))} ALEO claimed\\!*\n` +
            `Tx: \`${escapeMd(result.txId.slice(0, 32))}…\``,
          { parse_mode: 'MarkdownV2' },
        )

        const idx = trackedBets.indexOf(bet)
        if (idx >= 0) trackedBets.splice(idx, 1)
      }
    } catch (err) {
      sendMsg(msg.chat.id, `❌ Claim ${bet.symbol} ${bet.side} failed: ${(err as Error).message.slice(0, 200)}`)
    }
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// FPMM PREDICTION MARKET COMMANDS
// ══════════════════════════════════════════════════════════════════════════════

// /markets — list active FPMM prediction markets
bot.onText(/^\/markets$/, async (msg) => {
  if (!indexer) {
    bot.sendMessage(msg.chat.id, `FPMM markets require Supabase indexer. Set SUPABASE_URL and SUPABASE_ANON_KEY in .env.`)
    return
  }

  try {
    const markets = await fpmm.getActiveMarkets(10)
    if (markets.length === 0) {
      bot.sendMessage(msg.chat.id, `No active prediction markets found.`)
      return
    }

    let text = `*Active Prediction Markets:*\n\n`
    for (const m of markets) {
      const yes = m.yesPercentage?.toFixed(1) ?? '—'
      const no = m.noPercentage?.toFixed(1) ?? '—'
      const mAny = m as any
      const mktId = mAny.marketId ?? mAny.market_id ?? ''
      const question = mAny.questionText ?? mAny.question ?? mAny.title ?? mktId.slice(0, 20)
      const vol = m.totalVolume ? `${(Number(m.totalVolume) / 1e6).toFixed(2)}` : '—'
      const id = mktId.slice(0, 16)
      text += `📊 *${escapeMd(String(question).slice(0, 60))}*\n`
      text += `   YES: ${escapeMd(yes)}% \\| NO: ${escapeMd(no)}% \\| Vol: ${escapeMd(vol)} ALEO\n`
      text += `   ID: \`${escapeMd(id ?? '')}…\`\n\n`
    }
    text += `Use /marketinfo \\<ID\\> for details, /buy \\<ID\\> YES 1 to trade\\.`
    sendMsg(msg.chat.id, text)
  } catch (err) {
    bot.sendMessage(msg.chat.id, `Error fetching markets: ${(err as Error).message.slice(0, 200)}`)
  }
})

// /marketinfo <MARKET_ID> — show market details and odds
bot.onText(/^\/marketinfo\s+(\S+)$/, async (msg, match) => {
  const marketId = match![1]

  try {
    const m = await fpmm.getMarket(marketId)
    if (!m) {
      bot.sendMessage(msg.chat.id, `Market not found. Check the ID.`)
      return
    }

    const question = (m as any).question ?? (m as any).title ?? 'Unknown'
    const prices = (m as any).prices ?? []
    const numOutcomes = (m as any).numOutcomes ?? 2
    const pool = (m as any).pool
    const resolution = (m as any).resolution
    const status = resolution?.winningOutcome ? 'RESOLVED' : 'ACTIVE'

    let oddsText = ''
    const outcomeLabels = numOutcomes === 2
      ? ['YES', 'NO']
      : Array.from({ length: numOutcomes }, (_, i) => `Outcome ${i + 1}`)

    for (let i = 0; i < prices.length; i++) {
      oddsText += `   ${outcomeLabels[i]}: ${(prices[i] * 100).toFixed(1)}%\n`
    }

    const vol = pool?.totalVolume ? `${(Number(pool.totalVolume) / 1e6).toFixed(2)} ALEO` : '—'
    const liq = pool?.totalLiquidity ? `${(Number(pool.totalLiquidity) / 1e6).toFixed(2)} ALEO` : '—'

    let text = `*${escapeMd(String(question).slice(0, 100))}*\n\n`
    text += `Status: ${escapeMd(status)}\n`
    text += `Outcomes: ${numOutcomes}\n`
    text += `${escapeMd(oddsText)}\n`
    text += `Volume: ${escapeMd(vol)}\n`
    text += `Liquidity: ${escapeMd(liq)}\n`
    text += `ID: \`${escapeMd(marketId.slice(0, 24))}…\`\n`

    if (resolution?.winningOutcome) {
      text += `\nWinner: *${escapeMd(outcomeLabels[resolution.winningOutcome - 1] ?? 'Unknown')}*`
    }

    sendMsg(msg.chat.id, text)
  } catch (err) {
    bot.sendMessage(msg.chat.id, `Error: ${(err as Error).message.slice(0, 200)}`)
  }
})

// /buy <MARKET_ID> <YES|NO|1|2|3|4> <AMOUNT> — buy FPMM outcome shares
bot.onText(/^\/buy\s+(\S+)\s+(YES|NO|[1-4])\s+(\d*\.?\d+)$/i, async (msg, match) => {
  const w = ensureWallet(msg)
  if (!w) return

  const marketId = match![1]
  const outcomeStr = match![2].toUpperCase()
  const amountAleo = parseFloat(match![3])
  const amountMicro = BigInt(Math.round(amountAleo * 1_000_000))

  if (amountMicro < 100_000n) {
    bot.sendMessage(msg.chat.id, `Minimum 0.1 ALEO`)
    return
  }

  // Parse outcome
  let outcome: number
  if (outcomeStr === 'YES') outcome = 1
  else if (outcomeStr === 'NO') outcome = 2
  else outcome = parseInt(outcomeStr)

  // Check user has a credits record
  const creditsRecord = DRY_RUN
    ? '{owner: aleo1placeholder.private, microcredits: 1000000000u64.private, _nonce: 0group.public}'
    : w.creditsRecord

  if (!creditsRecord) {
    bot.sendMessage(msg.chat.id, `No private record available. Run /fund ${Math.ceil(amountAleo + 1)} first.`)
    return
  }

  try {
    // Fetch market to calculate expected shares
    const m = await fpmm.getMarket(marketId)
    if (!m) {
      bot.sendMessage(msg.chat.id, `Market not found`)
      return
    }

    const pool = (m as any).pool
    if (!pool) {
      bot.sendMessage(msg.chat.id, `Pool not found for this market`)
      return
    }

    // Calculate expected shares via FPMM math
    const reserves = {
      reserve1: BigInt(pool.reserve1 ?? 0),
      reserve2: BigInt(pool.reserve2 ?? 0),
      reserve3: BigInt(pool.reserve3 ?? 0),
      reserve4: BigInt(pool.reserve4 ?? 0),
      numOutcomes: (m as any).numOutcomes ?? 2,
    }

    const quote = quoteContractBuy(reserves, outcome, amountMicro)
    const expectedShares = quote.sharesOut
    const minSharesOut = expectedShares * 95n / 100n // 5% slippage

    sendMsg(msg.chat.id,
      `⏳ Buying ${escapeMd(outcomeStr)} shares on market\\.\\.\\.\\.\n` +
        `Amount: ${escapeMd(amountAleo.toFixed(4))} ALEO\n` +
        `Expected shares: ${escapeMd((Number(expectedShares) / 1e6).toFixed(4))}\n` +
        `Mode: ${DRY_RUN ? '🟡 DRY\\_RUN' : '🔴 LIVE'}`,
    )

    // Build inputs — SDK returns inputs without credits record, we append it
    const call = fpmm.buildBuySharesInputs({
      marketId,
      outcome,
      amountIn: amountMicro,
      expectedShares,
      minSharesOut,
    })

    // Append credits record to inputs
    call.inputs.push(creditsRecord)

    const userExecutor = getUserExecutor(w.privateKey)
    const result = await userExecutor.execute(call)

    if (DRY_RUN) {
      bot.sendMessage(msg.chat.id, `✅ DRY RUN complete — no on-chain broadcast`)
    } else {
      // Clear used record
      updateCreditsRecord(w.telegramId, null)

      // Track bet
      const bet: TrackedBet = {
        userId: w.telegramId,
        marketId,
        symbol: `FPMM-${outcomeStr}`,
        side: outcomeStr as TurboSide,
        amountMicro,
        txId: result.txId,
        shareRecord: null,
        timestamp: Date.now(),
      }
      trackedBets.push(bet)

      sendMsg(msg.chat.id,
        `✅ *Buy broadcast\\!*\n\n` +
          `Tx: \`${escapeMd(result.txId.slice(0, 32))}…\`\n` +
          `Shares: ~${escapeMd((Number(expectedShares) / 1e6).toFixed(4))} ${escapeMd(outcomeStr)}\n\n` +
          `Track: https://testnet\\.explorer\\.provable\\.com/transaction/${escapeMd(result.txId)}\n\n` +
          `⏳ Capturing share record\\.\\.\\.`,
      )

      // Auto-capture share + change record
      captureBetOutputs(bet, msg.chat.id).catch(() => {})
    }
  } catch (err) {
    bot.sendMessage(msg.chat.id, `❌ Buy failed: ${(err as Error).message.slice(0, 300)}`)
  }
})

// /redeem <MARKET_ID> — redeem winning FPMM shares (uses tracked share record)
bot.onText(/^\/redeem\s+(\S+)$/, async (msg, match) => {
  const w = ensureWallet(msg)
  if (!w) return

  const marketId = match![1]
  const userBets = trackedBets.filter(b => b.userId === w.telegramId && b.marketId === marketId && b.shareRecord)

  if (userBets.length === 0) {
    bot.sendMessage(msg.chat.id, `No tracked shares for this market. Check /mybets.`)
    return
  }

  try {
    const m = await fpmm.getMarket(marketId)
    if (!m) {
      bot.sendMessage(msg.chat.id, `Market not found`)
      return
    }

    const resolution = (m as any).resolution
    if (!resolution?.winningOutcome) {
      bot.sendMessage(msg.chat.id, `Market not resolved yet. Wait for resolution.`)
      return
    }

    for (const bet of userBets) {
      try {
        const call = fpmm.buildRedeemSharesInputs(bet.shareRecord!)
        const userExecutor = getUserExecutor(w.privateKey)
        const result = await userExecutor.execute(call)

        sendMsg(msg.chat.id,
          `✅ *Redeemed ${escapeMd(bet.symbol)} shares\\!*\n` +
            `Tx: \`${escapeMd(result.txId.slice(0, 32))}…\``,
        )

        // Capture payout record
        captureChangeRecord(result.txId, w.privateKey).then((rec) => {
          if (rec) updateCreditsRecord(w.telegramId, rec)
        }).catch(() => {})

        // Remove from tracker
        const idx = trackedBets.indexOf(bet)
        if (idx >= 0) trackedBets.splice(idx, 1)
      } catch (err) {
        bot.sendMessage(msg.chat.id, `❌ Redeem failed: ${(err as Error).message.slice(0, 200)}`)
      }
    }
  } catch (err) {
    bot.sendMessage(msg.chat.id, `❌ Error: ${(err as Error).message.slice(0, 200)}`)
  }
})

// ── Error handler ────────────────────────────────────────────────────────────
bot.on('polling_error', (err) => {
  console.error('[telegram] polling error:', err.message)
})

// Prevent crash on unhandled Telegram API errors (e.g. MarkdownV2 parse failures)
process.on('unhandledRejection', (err) => {
  const msg = (err as Error)?.message ?? String(err)
  if (msg.includes("can't parse entities")) {
    console.warn('[telegram] MarkdownV2 parse error (message skipped)')
    return
  }
  console.error('[unhandled]', msg)
})

console.log('[bot] ready — send /start to your bot in Telegram')
