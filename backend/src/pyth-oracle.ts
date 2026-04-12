// ============================================================================
// Veiled Turbo — Pyth Oracle Backend Service
// ============================================================================
// Subscribes to Pyth Hermes price stream, signs PriceAttestation messages
// with the Aleo oracle wallet, and (eventually) drives create_turbo_market /
// resolve_turbo_market transactions on `veiled_turbo_v8.aleo`.
//
// Run modes:
//   pnpm tsx src/pyth-oracle.ts                 # standalone (subscribe + cache)
//   pnpm tsx src/pyth-oracle.ts --serve         # HTTP server for frontend
//   pnpm tsx src/pyth-oracle.ts --auto-create   # cron rolling 5-min markets
//   pnpm tsx src/pyth-oracle.ts --auto-resolve  # cron resolve past-deadline markets
//
// Environment variables required:
//   PYTH_HERMES_URL                  default: https://hermes.pyth.network
//   ORACLE_PRIVATE_KEY               Aleo APrivateKey1zk... for signing
//   ALEO_RPC_URL                     Aleo node endpoint
//   TURBO_PROGRAM_ID                 default: veiled_turbo_v8.aleo
//   TURBO_OPERATOR_PORT              default: 4090
//
// Trust note:
//   This service is the SOLE bridge between Pyth and the on-chain contract.
//   The contract uses CALLER-BASED authorization: only transactions broadcast
//   from ORACLE_OPERATOR (hardcoded in the contract) may call create/resolve.
//   We avoided Aleo signature primitive to dodge the byte-vs-field encoding
//   mismatch between wasm SDK Account.sign and Leo signature::verify.
//
//   Trust model is identical to a signature scheme: single private key
//   authorizes all market creation and resolution. If compromised, operator
//   can fabricate prices, but on-chain sanity checks (window, range,
//   confidence, max-move) bound the damage. Mitigation: open-source this
//   service, log every call to Supabase, shadow-run a verifier.
// ============================================================================

import { EventSource } from 'eventsource'
// node-fetch is already a dep; native fetch is fine on Node 18+ but we
// import to keep parity with the rest of backend/.
// import fetch from 'node-fetch'

// ----------------------------------------------------------------------------
// Pyth feed catalog
// ----------------------------------------------------------------------------

export const PYTH_FEED_IDS = {
  BTC: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  ETH: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  SOL: '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
  DOGE: '0xdcef50dd0a4cd2dcc17e45df1676dcb336a11a61c69df7a0299b0150c672d25c',
  XRP: '0xec5d399846a9209f3fe5881d70aae9268c94339ff9817e8d18ff19fa05eea1c8',
  BNB: '0x2f95862b045670cd22bee3114c39763a4a08beeb663b145d283c31d7d1101c4f',
  ADA: '0x2a01deaec9e51a579277b34b122399984d0bbf57e2458a7e42fecd2829867a0d',
  AVAX: '0x93da3352f9f1d105fdfe4971cfa80e9dd777bfc5d0f683ebb6e1294b92137bb7',
  LINK: '0x8ac0c70fff57e9aefdf5edf44b51d62c2d433653cbb2cf5cc06bb115af04d221',
  DOT: '0xca3eed9b267293f6595901c734c7525ce8ef49adafe8284606ceb307afa2ca5b',
} as const

export type Symbol = keyof typeof PYTH_FEED_IDS

// Symbol IDs MUST match the constants compiled into veiled_turbo_v8.aleo
export const SYMBOL_IDS: Record<Symbol, number> = {
  BTC: 1,
  ETH: 2,
  SOL: 3,
  DOGE: 4,
  XRP: 5,
  BNB: 6,
  ADA: 7,
  AVAX: 8,
  LINK: 9,
  DOT: 10,
}

export const ATTESTATION_KIND = {
  BASELINE: 1,
  CLOSING: 2,
} as const

// ----------------------------------------------------------------------------
// Configuration
// ----------------------------------------------------------------------------

const PYTH_HERMES_URL =
  process.env.PYTH_HERMES_URL || 'https://hermes.pyth.network'
const ALEO_NETWORK_NAME = process.env.ALEO_NETWORK === 'mainnet' ? 'mainnet' : 'testnet'
// Some operator setups put the base in ALEO_RPC_URL (`.../v1`) and others
// include the network suffix (`.../v1/testnet`). Normalize: strip any trailing
// network segment, then append the canonical one.
const ALEO_RPC_BASE = (process.env.ALEO_RPC_URL || 'https://api.explorer.provable.com/v1')
  .replace(/\/(testnet|mainnet|canary)\/?$/, '')
const ALEO_RPC_URL = `${ALEO_RPC_BASE}/${ALEO_NETWORK_NAME}`
const PORT = Number(process.env.TURBO_OPERATOR_PORT || 4090)

const FRESHNESS_TOLERANCE_MS = 3000 // reject Pyth quotes older than 3s

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

export interface PythQuote {
  symbol: Symbol
  feedId: string
  price: number // human-readable USD ($71094.51)
  conf: number  // human-readable USD ($28.00)
  publishTime: number // unix ms
}

/**
 * Snapshot the operator backend will use to call create_turbo_market or
 * resolve_turbo_market. No signature — caller-based authorization.
 */
export interface PythSnapshot {
  market_id?: string  // only set for closing snapshots
  symbol_id: number   // u8
  kind: number        // u8 — 1=baseline, 2=closing
  price: bigint       // u128 — micro-USD (6 decimals)
  conf: bigint        // u128 — same unit as price
  at_block: bigint    // u64 — Aleo block height
}

// ----------------------------------------------------------------------------
// Pyth Hermes streaming subscriber
// ----------------------------------------------------------------------------

export class PythStream {
  private cache: Map<Symbol, PythQuote> = new Map()
  private eventSource: EventSource | null = null
  private listeners: Set<(q: PythQuote) => void> = new Set()

  /** Latest cached quote, or null if not yet received */
  latest(symbol: Symbol): PythQuote | null {
    const q = this.cache.get(symbol)
    if (!q) return null
    if (Date.now() - q.publishTime > FRESHNESS_TOLERANCE_MS) return null
    return q
  }

  onUpdate(fn: (q: PythQuote) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  start(symbols: Symbol[] = ['BTC', 'ETH', 'SOL']): void {
    const ids = symbols.map(s => PYTH_FEED_IDS[s])
    const params = ids.map(id => `ids[]=${id}`).join('&') + '&parsed=true'
    const url = `${PYTH_HERMES_URL}/v2/updates/price/stream?${params}`
    console.log(`[pyth] subscribing: ${url}`)

    this.eventSource = new EventSource(url)
    this.eventSource.onmessage = (event: any) => {
      try {
        const data = JSON.parse(event.data)
        const parsed = data?.parsed || []
        for (const entry of parsed) {
          const feedId = '0x' + entry.id
          const symbol = symbols.find(s => PYTH_FEED_IDS[s] === feedId)
          if (!symbol) continue

          const p = entry.price
          const expo = Number(p.expo)         // negative
          const scale = Math.pow(10, expo)    // e.g. 10^-8
          const quote: PythQuote = {
            symbol,
            feedId,
            price: Number(p.price) * scale,
            conf: Number(p.conf) * scale,
            publishTime: Number(p.publish_time) * 1000,
          }
          this.cache.set(symbol, quote)
          for (const fn of this.listeners) fn(quote)
        }
      } catch (err) {
        console.error('[pyth] parse error:', err)
      }
    }
    this.eventSource.onerror = (err) => {
      console.error('[pyth] stream error, will reconnect:', err)
      // EventSource auto-reconnects; no manual restart needed
    }
  }

  stop(): void {
    this.eventSource?.close()
    this.eventSource = null
  }
}

// ----------------------------------------------------------------------------
// Aleo block height client (lightweight, polling)
// ----------------------------------------------------------------------------

export async function getAleoBlockHeight(): Promise<bigint> {
  const res = await fetch(`${ALEO_RPC_URL}/latest/height`)
  if (!res.ok) throw new Error(`aleo rpc ${res.status}`)
  const text = await res.text()
  return BigInt(text.trim())
}

// ----------------------------------------------------------------------------
// Attestation builder + signer
// ----------------------------------------------------------------------------

/**
 * Convert a Pyth quote to the canonical snapshot form.
 *
 * Price and conf are stored as u128 micro-USD (6 decimals).
 * Example: $71094.51 with conf $28.00 →
 *   price = 71094510000n
 *   conf  = 28000000n
 *
 * The contract expects this exact scaling. Changing the multiplier here
 * MUST be matched in the Leo constants (CONF_DENOMINATOR_FRAC, MIN_PRICE,
 * MAX_PRICE).
 */
export function buildSnapshot(
  symbol: Symbol,
  kind: typeof ATTESTATION_KIND[keyof typeof ATTESTATION_KIND],
  quote: PythQuote,
  atBlock: bigint,
  marketId?: string,
): PythSnapshot {
  const priceMicro = BigInt(Math.round(quote.price * 1_000_000))
  const confMicro = BigInt(Math.round(quote.conf * 1_000_000))

  // Pre-flight: enforce the same sanity rails the contract enforces.
  // Reject early so we don't waste tx fees on a guaranteed revert.
  if (priceMicro <= 0n) {
    throw new Error(`bad price: ${quote.price}`)
  }
  const maxConf = priceMicro / 200n
  if (confMicro > maxConf) {
    throw new Error(
      `confidence too wide: conf=${confMicro} > max=${maxConf} (price=${priceMicro})`,
    )
  }

  return {
    market_id: marketId,
    symbol_id: SYMBOL_IDS[symbol],
    kind,
    price: priceMicro,
    conf: confMicro,
    at_block: atBlock,
  }
}

/**
 * Format a PythSnapshot into the public-input list expected by the
 * `create_turbo_market` or `resolve_turbo_market` Leo transition. The
 * operator wallet will broadcast this with `snarkos developer execute` (or
 * an equivalent) using its own private key — caller-based auth.
 *
 * Returns inputs as Leo literals: `1u8`, `12345u128`, `42u64`, etc.
 */
export function snapshotToCreateInputs(
  snap: PythSnapshot,
  deadline: bigint,
  nonce: bigint,
  creatorAddress: string,
): string[] {
  // v7: no initial_liquidity — vault-backed, 7 inputs
  return [
    `${snap.symbol_id}u8`,
    `${deadline}u64`,
    `${nonce}u64`,
    `${snap.price}u128`,
    `${snap.conf}u128`,
    `${snap.at_block}u64`,
    creatorAddress,
  ]
}

export function snapshotToResolveInputs(
  marketId: string,
  snap: PythSnapshot,
): string[] {
  return [
    marketId, // already includes "field" suffix
    `${snap.price}u128`,
    `${snap.conf}u128`,
    `${snap.at_block}u64`,
  ]
}

// ----------------------------------------------------------------------------
// HTTP server (called by frontend / cron jobs)
// ----------------------------------------------------------------------------

import http from 'node:http'

export function startServer(stream: PythStream): void {
  const server = http.createServer(async (req, res) => {
    res.setHeader('access-control-allow-origin', '*')
    res.setHeader('content-type', 'application/json')

    try {
      const url = new URL(req.url || '/', `http://localhost:${PORT}`)
      const path = url.pathname

      // Health
      if (path === '/health') {
        res.end(JSON.stringify({ ok: true, ts: Date.now() }))
        return
      }

      // Latest quote
      if (path === '/quote' && req.method === 'GET') {
        const symbol = (url.searchParams.get('symbol') || 'BTC') as Symbol
        const q = stream.latest(symbol)
        if (!q) {
          res.statusCode = 503
          res.end(JSON.stringify({ error: 'no fresh quote' }))
          return
        }
        res.end(JSON.stringify(q))
        return
      }

      // SSE price stream — relays backend's Pyth stream to all browser clients.
      // This ensures every user sees the SAME price (backend is single source
      // of truth), not their own Pyth latency-variable browser stream.
      //
      // During "resolving" phase (between deadline and on-chain resolve), the
      // backend stops broadcasting price updates for that symbol so all chart
      // displays freeze simultaneously.
      if (path === '/stream' && req.method === 'GET') {
        const symbol = (url.searchParams.get('symbol') || 'BTC') as Symbol
        res.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          'connection': 'keep-alive',
          'access-control-allow-origin': '*',
        })

        // Send current quote immediately (if available)
        const initial = stream.latest(symbol)
        if (initial) {
          res.write(`data: ${JSON.stringify(initial)}\n\n`)
        }

        // Subscribe to price updates
        const unsub = stream.onUpdate((q) => {
          if (q.symbol !== symbol) return
          // If market for this symbol is in 'resolving' or 'resolved' state,
          // do NOT broadcast new prices — chart should stay frozen until
          // on-chain closing price is available.
          const chainMarket = chainState.get(symbol)
          if (chainMarket && chainMarket.status !== 'active') {
            return
          }
          res.write(`data: ${JSON.stringify(q)}\n\n`)
        })

        // Heartbeat every 15s to keep connection alive
        const hb = setInterval(() => {
          res.write(':heartbeat\n\n')
        }, 15000)

        req.on('close', () => {
          unsub()
          clearInterval(hb)
        })
        return
      }

      // Build a baseline snapshot (frontend uses this to display the
      // baseline that the operator is about to commit on-chain).
      if (path === '/snapshot/baseline' && req.method === 'POST') {
        const body = await readJsonBody(req)
        const { symbol } = body as { symbol: Symbol }
        const quote = stream.latest(symbol)
        if (!quote) throw new Error('no fresh quote for symbol')
        const atBlock = await getAleoBlockHeight()
        const snap = buildSnapshot(symbol, ATTESTATION_KIND.BASELINE, quote, atBlock)
        res.end(JSON.stringify(snap, bigintReplacer))
        return
      }

      // Build a closing snapshot for resolution
      if (path === '/snapshot/closing' && req.method === 'POST') {
        const body = await readJsonBody(req)
        const { market_id, symbol } = body as { market_id: string; symbol: Symbol }
        const quote = stream.latest(symbol)
        if (!quote) throw new Error('no fresh quote for symbol')
        const atBlock = await getAleoBlockHeight()
        const snap = buildSnapshot(symbol, ATTESTATION_KIND.CLOSING, quote, atBlock, market_id)
        res.end(JSON.stringify(snap, bigintReplacer))
        return
      }

      // Current rolling chain state for all symbols
      if (path === '/chain' && req.method === 'GET') {
        const all = getAllChainedMarkets().map(m => ({
          ...m,
          deadline: m.deadline.toString(),
        }))
        res.end(JSON.stringify(all))
        return
      }

      // Current chain state for a single symbol
      if (path === '/chain/symbol' && req.method === 'GET') {
        const sym = (url.searchParams.get('symbol') || 'BTC') as Symbol
        const m = getChainedMarket(sym)
        if (!m) {
          res.statusCode = 404
          res.end(JSON.stringify({ error: 'no active market for symbol' }))
          return
        }
        res.end(JSON.stringify({ ...m, deadline: m.deadline.toString() }))
        return
      }

      res.statusCode = 404
      res.end(JSON.stringify({ error: 'not found' }))
    } catch (err: any) {
      res.statusCode = 500
      res.end(JSON.stringify({ error: err?.message || String(err) }))
    }
  })

  server.listen(PORT, () => {
    console.log(`[oracle] http server on :${PORT}`)
  })
}

function bigintReplacer(_key: string, value: any) {
  return typeof value === 'bigint' ? value.toString() : value
}

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

// ----------------------------------------------------------------------------
// Supabase audit log (thin REST wrapper — no @supabase/supabase-js dep)
// ----------------------------------------------------------------------------
//
// Schema (apply via supabase/create_turbo_audit_table.sql):
//   create table turbo_oracle_audit (
//     id bigserial primary key,
//     created_at timestamptz default now(),
//     event text not null,           -- 'create' | 'resolve' | 'cancel'
//     market_id text not null,
//     symbol text not null,
//     pyth_price numeric,
//     pyth_conf numeric,
//     pyth_publish_time timestamptz,
//     aleo_block bigint,
//     aleo_tx_id text,
//     operator_address text,
//     metadata jsonb
//   );
//
// Every operator action is appended here, providing the public verification
// trail required by the trust model. Anyone can read the table and
// cross-check entries against Pyth Hermes historical data.

const SUPABASE_URL = process.env.SUPABASE_URL || ''
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || ''

export interface TurboAuditEntry {
  event: 'create' | 'resolve' | 'cancel'
  market_id: string
  symbol: Symbol
  pyth_price: number
  pyth_conf: number
  pyth_publish_time: string // iso
  aleo_block: bigint
  aleo_tx_id?: string
  operator_address?: string
  metadata?: Record<string, unknown>
}

export async function logTurboAudit(entry: TurboAuditEntry): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn('[audit] supabase not configured — skipping log')
    return
  }
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/turbo_oracle_audit`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: SUPABASE_KEY,
        authorization: `Bearer ${SUPABASE_KEY}`,
        prefer: 'return=minimal',
      },
      body: JSON.stringify({
        ...entry,
        aleo_block: entry.aleo_block.toString(),
      }),
    })
    if (!res.ok) {
      console.error(`[audit] supabase ${res.status}: ${await res.text()}`)
    }
  } catch (err) {
    console.error('[audit] failed:', err)
  }
}

// ----------------------------------------------------------------------------
// Cron stubs — auto-create rolling markets, auto-resolve past-deadline
// ----------------------------------------------------------------------------

/**
 * Every 5 minutes, create a fresh BTC/ETH/SOL turbo market with a 5-min
 * deadline. The actual `snarkos developer execute` invocation is left as a
 * shell-out point — see broadcastCreateTurboMarket() below.
 */
// ────────────────────────────────────────────────────────────
// Rolling chain state — tracks the current active market per symbol.
// When a market is resolved, its closing price becomes the next baseline.
// ────────────────────────────────────────────────────────────

export interface ChainedMarket {
  market_id: string
  symbol: Symbol
  baseline_price: number   // USD
  deadline: bigint         // block height
  // Absolute wallclock timestamp (ms since epoch) at which this market is
  // considered "closed" for UI purposes. Computed ONCE at creation time
  // from (deadline_block - fresh_block_height) × SECS_PER_BLOCK, and
  // shared with the frontend so both sides agree on the freeze moment
  // down to the millisecond. Without this, the backend's precise-freeze
  // setTimeout and the frontend's countdown diverge by several seconds
  // due to block-time drift, causing the UI to lock prematurely.
  deadline_ms: number
  status: 'active' | 'resolving' | 'resolved'
  closing_price?: number
  // Snapshot of the last Pyth price that was broadcast to users at the
  // moment the deadline was reached. This is the EXACT price every user
  // saw on their chart when it froze. Backend uses this as the resolve
  // input instead of re-fetching a fresh Pyth quote.
  frozen_price?: number
  frozen_conf?: number
  /**
   * Pyth's own publish_time for the frozen quote (unix ms). This is the
   * timestamp anyone can plug into Pyth Hermes historical API to verify
   * the operator's on-chain claim matches what Pyth was actually
   * publishing at that instant. Without this, audit entries would record
   * `Date.now()` at resolve time, and VerifyTurbo would query Pyth for
   * a moment that doesn't correspond to the captured price → false
   * "mismatch" warnings on the verification page.
   */
  frozen_publish_time?: number
}

// In-memory state per symbol — persisted to localStorage-style file for
// crash recovery in production (TODO). For now, in-memory only.
const chainState: Map<Symbol, ChainedMarket> = new Map()
// Fallback: last known closing price per symbol. Used when resolve tx fails
// but we still want to chain the next market from the correct price.
const lastClosingPrice: Map<Symbol, number> = new Map()

/** Get the current chained market for a symbol (for frontend polling) */
export function getChainedMarket(symbol: Symbol): ChainedMarket | undefined {
  return chainState.get(symbol)
}

/** Get all chained markets */
export function getAllChainedMarkets(): ChainedMarket[] {
  return Array.from(chainState.values())
}

const DURATION_BLOCKS = BigInt(process.env.TURBO_DURATION_BLOCKS || '75') // ~5 min testnet

/**
 * Unified rolling chain loop. Per symbol:
 *   1. If no active market → create one (baseline = Pyth current price)
 *   2. If active market past deadline → resolve it (closing = Pyth price)
 *   3. After resolve → immediately create next market (baseline = closing price)
 *
 * This produces a continuous chain where each market's final price becomes
 * the next market's "Price To Beat".
 */
export async function rollingChainLoop(stream: PythStream): Promise<void> {
  console.log('[chain] rolling chain loop started (15s tick)')
  const operatorAddress = process.env.OPERATOR_ADDRESS ||
    'aleo10tm5ektsr5v7kdc5phs8pha42vrkhe2rlxfl2v979wunhzx07vpqnqplv8'
  // v7: no per-market liquidity — vault-backed

  // Lock to prevent re-entrant creates while a broadcast is in-flight
  const creating = new Set<Symbol>()

  async function createMarket(
    symbol: Symbol,
    baselineOverride?: number,
    // Pyth publishTime (ms) at which `baselineOverride` was originally
    // captured from Pyth. For chained markets this is the PREVIOUS
    // market's frozen_publish_time (= the instant the previous closing
    // price was observed at resolve). Used so the audit row's
    // `pyth_publish_time` matches the moment when `baselinePrice` was
    // actually valid on Pyth — otherwise VerifyTurbo would fetch Pyth
    // at a later moment and see the drift between previous resolve and
    // current create as a false mismatch.
    baselineSourcePublishTime?: number,
  ): Promise<void> {
    if (creating.has(symbol)) return // broadcast already in-flight
    const quote = stream.latest(symbol)
    if (!quote) {
      console.warn(`[chain] no fresh quote for ${symbol}, skipping create`)
      return
    }
    creating.add(symbol)
    try {
      const currentBlock = await getAleoBlockHeight()
      const deadline = currentBlock + DURATION_BLOCKS
      const baselinePrice = baselineOverride ?? quote.price
      const baselineMicro = BigInt(Math.round(baselinePrice * 1_000_000))
      const confMicro = BigInt(Math.round(quote.conf * 1_000_000))
      if (baselineOverride != null) {
        console.log(`[chain] ${symbol} chaining: closing=$${baselineOverride.toFixed(2)} → baseline=$${baselinePrice.toFixed(2)} pyth_live=$${quote.price.toFixed(2)} diff=$${Math.abs(quote.price - baselinePrice).toFixed(2)}`)
      }
      const nonce = BigInt(Date.now())

      // Do NOT pre-set chainState here. If broadcast fails, we want to
      // preserve the previous 'resolved' state (with closing_price) so
      // the next tick retries with the correct baseline. The `creating`
      // lock prevents duplicate broadcasts during the same tick.

      const snap: PythSnapshot = {
        symbol_id: SYMBOL_IDS[symbol],
        kind: ATTESTATION_KIND.BASELINE,
        price: baselineMicro,
        conf: confMicro,
        at_block: currentBlock,
      }
      const inputs = snapshotToCreateInputs(snap, deadline, nonce, operatorAddress)
      const result = await broadcastCreateTurboMarket(inputs)
      const marketId = result.firstFieldOutput || `pending_${symbol}_${nonce}`

      // Verify create tx was actually accepted on-chain (not rejected).
      // If we got a txId but the tx was rejected, don't set chainState —
      // let the next tick retry with the correct closing price baseline.
      if (result.txId && !result.txId.startsWith('dryrun_')) {
        try {
          const checkRes = await fetch(`${ALEO_RPC_URL}/transaction/confirmed/${result.txId}`)
          if (checkRes.ok) {
            const checkData = await checkRes.json() as { status?: string }
            if (checkData.status === 'rejected') {
              console.warn(`[chain] ${symbol} create tx REJECTED on-chain: ${result.txId.slice(0, 20)}...`)
              return // don't set chainState — next tick retries
            }
          }
        } catch {} // ignore check errors, proceed optimistically
      }

      // ────────────────────────────────────────────────────────────
      // PRECISE WALLCLOCK FREEZE — match the frontend countdown.
      //
      // Without this, the 15s tick loop below would only detect
      // `currentBlock >= deadline` on its next iteration, meaning the
      // `frozen_price` captured for the resolve tx could be taken up to
      // 15 seconds AFTER the frontend's countdown hit 0. During that
      // window Pyth can move, so the dot-chart value the user saw at
      // freeze would not match the price the operator broadcasts.
      //
      // We re-fetch the CURRENT block height here (not reuse the one
      // from before tx broadcast — that's stale by however long the tx
      // confirmation took, causing setTimeout to fire ~10-20s late),
      // compute an ABSOLUTE wallclock deadlineMs, store it in chainState
      // so the frontend reads the exact same timestamp via /chain/symbol,
      // and schedule setTimeout to fire at that moment. Both sides then
      // converge on a single wallclock instant — no block-time drift.
      //
      // On fire: capture `stream.latest()` and flip status to
      // 'resolving' — that stops the SSE broadcast loop from sending
      // new ticks to every subscribed browser, so all charts freeze
      // simultaneously at the exact same Pyth quote we just captured.
      // The 15s tick then sees `status === 'resolving'` and drives the
      // actual resolve tx, reusing the price we locked in here instead
      // of fetching a fresh `stream.latest()`.
      // ────────────────────────────────────────────────────────────
      const SECS_PER_BLOCK = Number(process.env.ALEO_SECONDS_PER_BLOCK || 4)
      const capturedMarketId = marketId
      // Compute deadline_ms AFTER broadcast completes — Date.now() is the
      // moment the market actually becomes available to users (chainState
      // is about to be set). Adding the full duration gives a countdown
      // that starts at exactly 05:00 from when the frontend first sees it.
      //
      // Previous approaches failed because:
      //   - Pre-broadcast capture: Date.now() at T0, frontend sees it at
      //     T0+30s after broadcast → countdown starts at 4:30, not 5:00.
      //   - Post-broadcast fresh-block: same issue — blocks consumed during
      //     broadcast reduce the remaining count.
      //
      // The on-chain deadline_block was set to (currentBlock + 75) BEFORE
      // broadcast, so ~7-8 blocks are consumed during the 30s broadcast
      // window. That's fine — resolve_turbo_market checks block height
      // (`currentBlock >= deadline`), not wallclock time. If the chain is
      // slightly ahead or behind, the resolve just waits/fires accordingly.
      // The setTimeout below and the frontend countdown both use this same
      // deadline_ms, so they freeze in sync.
      const absoluteDeadlineMs = Date.now() + Number(DURATION_BLOCKS) * SECS_PER_BLOCK * 1000

      // Update with real market_id from tx output
      chainState.set(symbol, {
        market_id: marketId,
        symbol,
        baseline_price: baselinePrice,
        deadline,
        deadline_ms: absoluteDeadlineMs,
        status: 'active',
      })

      const msUntilFreeze = Math.max(0, absoluteDeadlineMs - Date.now())
      setTimeout(async () => {
        const cur = chainState.get(symbol)
        if (!cur || cur.market_id !== capturedMarketId) return // superseded
        if (cur.status !== 'active') return // already resolving/resolved
        const q = stream.latest(symbol)
        if (!q) {
          console.warn(`[chain] ${symbol} precise freeze fired but no fresh Pyth quote — falling back to tick-loop capture`)
          return
        }
        cur.frozen_price = q.price
        cur.frozen_conf = q.conf
        cur.frozen_publish_time = q.publishTime
        cur.status = 'resolving' // stops SSE broadcasts for this symbol
        console.log(`[chain] ${symbol} precise freeze at wallclock deadline: $${q.price.toFixed(6)} publishTime=${new Date(q.publishTime).toISOString()} (market=${capturedMarketId.slice(0, 16)}...)`)

        // ────────────────────────────────────────────────────────────
        // FAST-PATH RESOLVE — everything needed for resolve_turbo_market
        // is already known at this exact moment (frozen_price, frozen_conf,
        // market_id, deadline_block). Instead of waiting for the 15s tick
        // loop + the legacy 5-block safety buffer (~35s delay), poll the
        // chain tightly (every 1.5s) until `currentBlock >= deadline`,
        // then broadcast the resolve tx immediately. The contract only
        // requires `current_height >= closing_block` at finalize time,
        // so `closing_block = m.deadline` is the tightest legal choice.
        // ────────────────────────────────────────────────────────────
        try {
          const closingBlock = cur.deadline // no safety buffer — earliest legal value
          const maxWaitMs = 90_000 // at most 90s waiting for chain to catch up
          const startedAt = Date.now()
          let waitedForBlock = false
          while (Date.now() - startedAt < maxWaitMs) {
            const stillCurrent = chainState.get(symbol)
            if (!stillCurrent || stillCurrent.market_id !== capturedMarketId) return
            if (stillCurrent.status !== 'resolving') return // tick loop already took over
            const h = await getAleoBlockHeight()
            if (h >= closingBlock) break
            waitedForBlock = true
            await new Promise(r => setTimeout(r, 1500))
          }
          const waitedMs = Date.now() - startedAt
          if (waitedForBlock) {
            console.log(`[chain] ${symbol} fast-path waited ${waitedMs}ms for chain to reach deadline block ${closingBlock}`)
          }

          // Re-validate state right before broadcasting (tick loop might
          // have raced us).
          const ready = chainState.get(symbol)
          if (!ready || ready.market_id !== capturedMarketId) return
          if (ready.status !== 'resolving') return
          if (resolving.has(symbol)) return // broadcast already in-flight
          const broadcastStart = Date.now()
          const closingPrice = await resolveMarket(ready)
          const broadcastMs = Date.now() - broadcastStart
          if (closingPrice != null) {
            lastClosingPrice.set(symbol, closingPrice)
            console.log(`[chain] ${symbol} fast-path resolved in ${broadcastMs}ms → closing=$${closingPrice.toFixed(6)} — chaining immediately`)
            // Pass the just-resolved market's frozen_publish_time so the
            // next create's audit row points back to the exact Pyth moment
            // this closing price was captured.
            await createMarket(symbol, closingPrice, ready.frozen_publish_time)
          }
        } catch (err) {
          console.warn(`[chain] ${symbol} fast-path resolve failed, tick loop will retry:`, err)
        }
      }, msUntilFreeze)

    // For chained markets, the audit row's `pyth_publish_time` should
    // point to the moment the BASELINE was captured from Pyth — i.e.
    // the previous market's resolve instant — not the fresh Pyth quote
    // at create time. Otherwise VerifyTurbo re-queries Pyth Hermes at
    // the wrong timestamp and the UI shows phantom operator-vs-Pyth
    // drift (which is really just Pyth movement between resolve and
    // create). Falls back to the fresh quote's publishTime when we
    // don't have the previous source (e.g. non-chained first-ever
    // create, or lastClosingPrice fallback without a saved timestamp).
    const baselinePublishTime =
      baselineOverride != null && baselineSourcePublishTime != null
        ? baselineSourcePublishTime
        : quote.publishTime
    await logTurboAudit({
      event: 'create',
      market_id: marketId,
      symbol,
      pyth_price: baselinePrice,
      pyth_conf: quote.conf,
      pyth_publish_time: new Date(baselinePublishTime).toISOString(),
      aleo_block: currentBlock,
      aleo_tx_id: result.txId,
      operator_address: operatorAddress,
      metadata: {
        deadline: deadline.toString(),
        nonce: nonce.toString(),
        chained_from: baselineOverride ? 'previous_closing' : 'pyth_live',
      },
    })
    console.log(`[chain] ${symbol} created ${marketId.slice(0, 20)}... baseline=$${baselinePrice.toFixed(6)} (micro=${baselineMicro}) chained=${!!baselineOverride} deadline=${deadline}`)
    } finally {
      creating.delete(symbol)
    }
  }

  // Lock to prevent duplicate resolve calls
  const resolving = new Set<Symbol>()

  async function resolveMarket(m: ChainedMarket): Promise<number | null> {
    // If already resolved (closing_price set), return cached value — DO NOT re-fetch
    if (m.status === 'resolved' && m.closing_price != null && m.closing_price > 0) {
      return m.closing_price
    }
    if (resolving.has(m.symbol)) return null // broadcast in-flight

    // Build the quote to use for resolve. Prefer the FROZEN PRICE captured
    // at deadline (what every user saw when their chart froze). Fall back
    // to fresh Pyth quote only if freeze was missed (e.g. backend restart).
    //
    // IMPORTANT: use `m.frozen_publish_time` (Pyth's own publish_time for
    // that quote), NOT `Date.now()`. Audit logs use this publishTime to
    // let verifiers re-query Pyth Hermes historical at the exact moment
    // the price was published. Using wallclock `Date.now()` would point
    // the verifier at a different moment — Pyth would return a DIFFERENT
    // price (since the feed kept moving after freeze), and VerifyTurbo
    // would report a false "operator vs Pyth mismatch".
    const freshQuote = stream.latest(m.symbol)
    const quote: PythQuote | null = (m.frozen_price != null && m.frozen_conf != null)
      ? {
          symbol: m.symbol,
          feedId: PYTH_FEED_IDS[m.symbol],
          price: m.frozen_price,
          conf: m.frozen_conf,
          publishTime: m.frozen_publish_time ?? Date.now(),
        }
      : freshQuote
    if (!quote) return null

    const currentBlock = await getAleoBlockHeight()
    if (currentBlock < m.deadline) return null // chain hasn't reached deadline block yet
    // Use `m.deadline` as the closing_block — the tightest legal value the
    // contract accepts (`assert(closing_block >= m.deadline)`). Any larger
    // buffer just makes us wait unnecessarily. The contract also asserts
    // `current_height >= closing_block` at finalize time, and by the time
    // our tx lands in a block the chain will be at deadline+1 or later,
    // so this is safe.
    const closingBlock = m.deadline
    if (currentBlock > m.deadline + 60n) {
      console.warn(`[chain] ${m.symbol} ${m.market_id.slice(0, 16)}... past resolve window`)
      // Save current Pyth price as fallback closing so next market can still chain
      const fallbackQuote = stream.latest(m.symbol)
      if (fallbackQuote) lastClosingPrice.set(m.symbol, fallbackQuote.price)
      chainState.delete(m.symbol) // let emergency_cancel handle it
      return null
    }

    // Check if market already resolved on-chain (idempotent retry)
    try {
      const onChainRes = await fetch(`${ALEO_RPC_URL}/program/${TURBO_PROGRAM_ID_LIVE}/mapping/turbo_markets/${m.market_id}`)
      if (onChainRes.ok) {
        const text = (await onChainRes.text()).replace(/^"|"$/g, '')
        const statusMatch = text.match(/status:\s*(\d+)u8/)
        const closingMatch = text.match(/closing_price:\s*(\d+)u128/)
        if (statusMatch?.[1] === '2' && closingMatch) {
          // Already resolved on-chain — use the on-chain closing price (authoritative)
          const onChainClosing = Number(closingMatch[1]) / 1_000_000
          m.status = 'resolved'
          m.closing_price = onChainClosing
          lastClosingPrice.set(m.symbol, onChainClosing)
          console.log(`[chain] ${m.symbol} already resolved on-chain → closing=$${onChainClosing.toFixed(6)}`)
          return onChainClosing
        }
      }
    } catch {}

    resolving.add(m.symbol)
    let closingPrice: number
    try {
      const snap = buildSnapshot(m.symbol, ATTESTATION_KIND.CLOSING, quote, closingBlock, m.market_id)
      const inputs = snapshotToResolveInputs(m.market_id, snap)
      const result = await broadcastResolveTurboMarket(inputs)
      ;(globalThis as any)._lastResolveTxId = result.txId

      // Wait briefly then read on-chain closing_price as authoritative.
      // This ensures m.closing_price matches exactly what's stored on-chain,
      // even if the broadcast was retried with a different quote.
      let onChainClosing: number | null = null
      for (let attempt = 0; attempt < 12; attempt++) {
        await new Promise(r => setTimeout(r, 5000))
        try {
          const onChainRes = await fetch(`${ALEO_RPC_URL}/program/${TURBO_PROGRAM_ID_LIVE}/mapping/turbo_markets/${m.market_id}`)
          if (!onChainRes.ok) continue
          const text = (await onChainRes.text()).replace(/^"|"$/g, '')
          const statusMatch = text.match(/status:\s*(\d+)u8/)
          const closingMatch = text.match(/closing_price:\s*(\d+)u128/)
          if (statusMatch?.[1] === '2' && closingMatch) {
            onChainClosing = Number(closingMatch[1]) / 1_000_000
            break
          }
        } catch {}
      }

      // Use on-chain value if available; fallback to quote.price
      closingPrice = onChainClosing ?? quote.price
      m.status = 'resolved'
      m.closing_price = closingPrice
      lastClosingPrice.set(m.symbol, closingPrice)
      if (onChainClosing != null) {
        console.log(`[chain] ${m.symbol} closing price synced from on-chain: $${closingPrice.toFixed(6)}`)
      } else {
        console.warn(`[chain] ${m.symbol} could not sync on-chain closing — using quote price: $${closingPrice.toFixed(6)}`)
      }
    } finally {
      resolving.delete(m.symbol)
    }

    await logTurboAudit({
      event: 'resolve',
      market_id: m.market_id,
      symbol: m.symbol,
      pyth_price: closingPrice,
      pyth_conf: quote.conf,
      pyth_publish_time: new Date(quote.publishTime).toISOString(),
      aleo_block: currentBlock,
      aleo_tx_id: (globalThis as any)._lastResolveTxId || 'unknown',
      // Same operator that signed the create_market_turbo tx for this
      // market. Without this the Supabase row's operator_address column
      // stays null and the VerifyTurbo page can't display who resolved
      // the round — even though the create row always shows it. Both
      // events are broadcast by the same `operatorAddress` closure, so
      // they should carry identical values.
      operator_address: operatorAddress,
      metadata: { baseline_price: m.baseline_price },
    })
    console.log(`[chain] ${m.symbol} resolved ${m.market_id.slice(0, 16)}... closing=$${closingPrice.toFixed(2)} (baseline was $${m.baseline_price.toFixed(2)})`)
    return closingPrice
  }

  const tick = async () => {
    const symbols: Symbol[] = ['BTC', 'ETH', 'SOL', 'DOGE', 'XRP', 'BNB', 'ADA', 'AVAX', 'LINK', 'DOT']
    // Filter symbols — set TURBO_SYMBOLS=BTC to test one at a time
    const enabledStr = process.env.TURBO_SYMBOLS || symbols.join(',')
    const enabled = enabledStr.split(',').map(s => s.trim()) as Symbol[]
    for (const symbol of enabled.filter(s => symbols.includes(s))) {
      try {
        const current = chainState.get(symbol)

        if (!current || current.status === 'resolved') {
          // Create new market. Chain baseline from:
          // 1. Previous market closing_price (if resolved successfully)
          // 2. lastClosingPrice fallback (if resolve tx failed but we saved Pyth price)
          // 3. undefined → falls through to live Pyth price
          const nextBaseline = current?.closing_price ?? lastClosingPrice.get(symbol)
          // `frozen_publish_time` is only available on the structured
          // `current` state. The plain-number `lastClosingPrice` fallback
          // doesn't carry it, so in that branch the audit row uses the
          // fresh Pyth quote's publishTime (small residual drift, but
          // better than no chain at all).
          await createMarket(symbol, nextBaseline, current?.frozen_publish_time)
          continue
        }

        if (current.status === 'active') {
          // The precise wallclock setTimeout scheduled in createMarket() is
          // the authoritative freeze trigger — it fires at exactly the same
          // absolute timestamp the frontend countdown uses (deadline_ms),
          // so both sides lock in sync. This tick-loop branch is a FALLBACK
          // only for the rare case where the setTimeout never fires (e.g.
          // backend crash/restart with stale chainState). We gate it on
          // `now > deadline_ms + 5s` so it does NOT preempt the setTimeout
          // when on-chain blocks arrive faster than the 4s/block estimate
          // — which was causing the backend to freeze the chart several
          // seconds before the frontend countdown actually reached zero.
          const overdueMs = Date.now() - current.deadline_ms
          if (overdueMs <= 5000) {
            // setTimeout path owns the freeze — nothing to do this tick
            continue
          }
          const currentBlock = await getAleoBlockHeight()
          if (currentBlock < current.deadline) {
            // deadline_ms has passed in wallclock but chain blocks are
            // lagging — just wait, no freeze yet
            continue
          }
          const freezeQuote = stream.latest(symbol)
          if (freezeQuote) {
            current.frozen_price = freezeQuote.price
            current.frozen_conf = freezeQuote.conf
            current.frozen_publish_time = freezeQuote.publishTime
            console.warn(`[chain] ${symbol} tick-loop fallback freeze (setTimeout missed): $${freezeQuote.price.toFixed(6)} overdue=${overdueMs}ms`)
          }
          current.status = 'resolving'
          // Fall through to the `resolving` branch below, which will call
          // resolveMarket() and chain the next market. No need to duplicate
          // that logic here.
        }

        if (current.status === 'resolving') {
          // Retry resolve if it hasn't completed
          const closingPrice = await resolveMarket(current)
          if (closingPrice != null) {
            lastClosingPrice.set(symbol, closingPrice)
            await createMarket(symbol, closingPrice, current.frozen_publish_time)
          }
        }
      } catch (err) {
        console.error(`[chain] ${symbol} error:`, err)
      }
    }
  }

  // Wait for Pyth data, then start
  setTimeout(tick, 3000)
  // Tick every 5s. Most resolve work is driven by the per-market precise
  // setTimeout scheduled in createMarket() (fast-path), so this interval
  // is only a safety net for: (a) market creation, (b) crash recovery,
  // (c) fallback-freeze when the setTimeout never fires. 5s balances
  // responsiveness vs RPC pressure on the Aleo endpoint.
  setInterval(tick, 5 * 1000)
}

// Legacy exports kept for backward compat
export async function autoCreateLoop(stream: PythStream): Promise<void> {
  return rollingChainLoop(stream)
}
export async function autoResolveLoop(
  stream: PythStream,
  _getActiveMarkets: () => Promise<ActiveMarket[]>,
): Promise<void> {
  // No-op — rollingChainLoop handles both create + resolve
  console.log('[cron] autoResolveLoop is now handled by rollingChainLoop')
}

export interface ActiveMarket {
  market_id: string
  symbol: string
  baseline_price: number
  deadline: bigint
}

/**
 * List active turbo markets that need resolution.
 *
 * Strategy: query Supabase audit log for `event='create'` rows that have NO
 * corresponding `event='resolve'` or `event='cancel'` row. Each create row
 * has the deadline tucked into `metadata.deadline` (set by autoCreateLoop).
 *
 * This avoids block-walking the chain — the audit log IS the indexer for
 * turbo markets, since every create/resolve goes through this service.
 */
export async function fetchActiveTurboMarketsFromAudit(): Promise<ActiveMarket[]> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return []
  const headers = { apikey: SUPABASE_KEY, authorization: `Bearer ${SUPABASE_KEY}` }

  // Pull recent creates (last 30 min — anything older is past resolution_deadline)
  const sinceIso = new Date(Date.now() - 30 * 60 * 1000).toISOString()
  const createsRes = await fetch(
    `${SUPABASE_URL}/rest/v1/turbo_oracle_audit?event=eq.create&created_at=gte.${sinceIso}&order=created_at.desc`,
    { headers },
  )
  if (!createsRes.ok) return []
  const creates = (await createsRes.json()) as TurboAuditRow[]

  // Pull resolves/cancels in same window so we can exclude them
  const resolvedRes = await fetch(
    `${SUPABASE_URL}/rest/v1/turbo_oracle_audit?event=in.(resolve,cancel)&created_at=gte.${sinceIso}`,
    { headers },
  )
  const resolved = resolvedRes.ok ? ((await resolvedRes.json()) as TurboAuditRow[]) : []
  const resolvedIds = new Set(resolved.map((r) => r.market_id))

  const active: ActiveMarket[] = []
  for (const row of creates) {
    if (resolvedIds.has(row.market_id)) continue
    const deadlineStr = (row.metadata as any)?.deadline
    if (!deadlineStr) continue
    active.push({
      market_id: row.market_id,
      symbol: row.symbol,
      baseline_price: Number(row.pyth_price),
      deadline: BigInt(deadlineStr),
    })
  }
  return active
}

interface TurboAuditRow {
  market_id: string
  symbol: string
  pyth_price: number | string
  metadata: Record<string, unknown>
  created_at: string
}

// ----------------------------------------------------------------------------
// Tx broadcast — shells out to `snarkos developer execute`
// ----------------------------------------------------------------------------

import { spawn } from 'node:child_process'

const NETWORK_ID = process.env.ALEO_NETWORK === 'mainnet' ? '0' : '1' // 0=mainnet, 1=testnet
// snarkos developer execute requires:
//   --endpoint   base URL for state queries
//   --broadcast  full URL of the broadcast endpoint (NOT just base)
const QUERY_ENDPOINT =
  process.env.ALEO_QUERY_ENDPOINT || 'https://api.explorer.provable.com/v1'
const BROADCAST_URL =
  process.env.ALEO_BROADCAST_URL ||
  'https://api.explorer.provable.com/v1/testnet/transaction/broadcast'
const PRIORITY_FEE = process.env.ALEO_PRIORITY_FEE || '1000000'

/**
 * Shell out to `snarkos developer execute --broadcast`. Returns the tx id
 * parsed from stdout, or throws on non-zero exit.
 *
 * NOTE: requires `snarkos` in PATH and OPERATOR_PRIVATE_KEY env var set.
 * Test with DRY_RUN=1 first to validate input formatting before spending fees.
 */
export interface SnarkosExecResult {
  txId: string
  /** First `...field` value from transition outputs (e.g. market_id from create_turbo_market) */
  firstFieldOutput?: string
  raw: string
}

const MAX_RETRIES = 5 // bumped from 3 — Cloudflare edge can take 30s+ to recover
const RETRY_BASE_MS = 4000 // exponential backoff: 4, 8, 16, 32, 64 seconds
const RETRY_MAX_MS = 60_000

/** Extract a short summary of the Cloudflare HTML error page so logs stay
 *  readable. Cloudflare 5xx pages include the status code in an h1/h2 and
 *  a "Ray ID" for support tracking — pull both if present. */
function summarizeCloudflareError(raw: string): string | null {
  if (!raw.includes('<!DOCTYPE html>') && !raw.includes('<html')) return null
  const codeMatch = raw.match(/Error\s+(\d{3})/i) || raw.match(/>(\d{3})\s*[<\s]/)
  const rayIdMatch = raw.match(/Ray\s*ID:\s*<strong>([^<]+)<\/strong>/i) ||
    raw.match(/ray[-_ ]id[:\s]*([a-f0-9]+)/i)
  const msgMatch = raw.match(/<h2[^>]*>([^<]+)<\/h2>/) ||
    raw.match(/<title>([^<]+)<\/title>/i)
  const code = codeMatch?.[1] ?? '???'
  const summary = msgMatch?.[1]?.trim() ?? 'Cloudflare/origin error'
  const ray = rayIdMatch?.[1]
  return `Cloudflare ${code}${ray ? ` (Ray ${ray})` : ''}: ${summary}`
}

async function snarkosExecute(
  programId: string,
  functionName: string,
  inputs: string[],
): Promise<SnarkosExecResult> {
  if (process.env.DRY_RUN === '1') {
    console.log(`[snarkos] DRY_RUN ${programId}/${functionName}`, inputs)
    return { txId: `dryrun_${Date.now()}`, raw: 'dry-run' }
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await snarkosExecuteOnce(programId, functionName, inputs)
    } catch (err: any) {
      const msg = err?.message || ''
      // Retryable: transient network/infra errors from cloudflare, aleo RPC
      // edge, or the local VM failing to fetch the program/mapping snapshot
      // it needs to run the transition locally (this happens intermittently
      // when testnet endpoints are rate-limited or behind a proxy hiccup).
      const isRetryable =
        msg.includes('522') ||
        msg.includes('502') ||
        msg.includes('503') ||
        msg.includes('504') ||
        msg.includes('524') ||
        msg.includes('429') ||
        msg.includes('HTTP POST request') ||
        msg.includes('cloudflare') ||
        msg.includes('<!DOCTYPE html>') ||               // any HTML error page
        msg.includes('timeout') ||
        msg.includes('ECONNRESET') ||
        msg.includes('ETIMEDOUT') ||
        msg.includes('Failed to fetch') ||               // program/mapping fetch
        msg.includes('VM failed to execute') ||          // local VM run failed
        msg.includes('Failed to broadcast')              // broadcast leg failed
      if (!isRetryable || attempt === MAX_RETRIES) {
        console.error(`[snarkos] attempt ${attempt}/${MAX_RETRIES} FATAL — full error:\n${msg}`)
        throw err
      }
      // Exponential backoff with jitter — 4s, 8s, 16s, 32s, 60s.
      // Cloudflare edge often takes 20-30s to recover from 5xx cascades,
      // so flat 5s retries wasted all 3 attempts inside the window.
      const delayMs = Math.min(RETRY_BASE_MS * 2 ** (attempt - 1), RETRY_MAX_MS)
      const jitterMs = Math.floor(Math.random() * 1000)
      const totalDelay = delayMs + jitterMs
      const cfSummary = summarizeCloudflareError(msg)
      const preview = cfSummary ?? msg.slice(0, 400)
      console.warn(`[snarkos] attempt ${attempt}/${MAX_RETRIES} failed, retrying in ${(totalDelay / 1000).toFixed(1)}s:\n${preview}`)
      await new Promise(r => setTimeout(r, totalDelay))
    }
  }
  throw new Error('unreachable')
}

async function snarkosExecuteOnce(
  programId: string,
  functionName: string,
  inputs: string[],
): Promise<SnarkosExecResult> {
  const privateKey = process.env.OPERATOR_PRIVATE_KEY || process.env.ALEO_PRIVATE_KEY || process.env.PRIVATE_KEY
  if (!privateKey) throw new Error('OPERATOR_PRIVATE_KEY (or ALEO_PRIVATE_KEY) not set')

  const args = [
    'developer', 'execute',
    '--endpoint', QUERY_ENDPOINT,
    '--broadcast', BROADCAST_URL,
    '--private-key', privateKey,
    '--priority-fee', PRIORITY_FEE,
    '--network', NETWORK_ID,
    programId,
    functionName,
    ...inputs,
  ]

  return new Promise((resolve, reject) => {
    const child = spawn('snarkos', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (b: Buffer) => { stdout += b.toString() })
    child.stderr.on('data', (b: Buffer) => { stderr += b.toString() })
    child.on('close', (code) => {
      if (code !== 0) {
        // Keep the full stderr — the snarkos error chain can be long
        // (VM failure → program fetch failure → RPC endpoint rejection),
        // and truncating to 500 chars hid the actual root cause in our
        // retry logs. Retries still print a 400-char preview for speed.
        reject(new Error(`snarkos exit ${code}: ${stderr.trim()}`))
        return
      }
      const txMatch = stdout.match(/at1[a-z0-9]{50,}/)
      if (!txMatch) {
        reject(new Error(`no tx id in stdout: ${stdout.trim()}`))
        return
      }
      const txId = txMatch[0]

      // snarkos doesn't print field outputs in stdout — we need to query
      // the tx from RPC after confirmation to extract market_id from the
      // future arguments. Poll every 10s for up to 60s.
      ;(async () => {
        let firstField: string | undefined
        for (let attempt = 0; attempt < 6; attempt++) {
          await new Promise(r => setTimeout(r, 10000))
          try {
            const txRes = await fetch(`${ALEO_RPC_URL}/transaction/${txId}`)
            if (!txRes.ok) continue
            const txData = await txRes.json() as { type?: string; execution?: { transitions?: any[] } }
            if (txData.type !== 'execute') continue
            const transitions = txData.execution?.transitions || []
            for (const t of transitions) {
              if (t.function !== 'create_turbo_market') continue
              for (const o of (t.outputs || [])) {
                const v = String(o.value || '')
                // Check public field output (v8: returns (field, Final))
                if (o.type === 'public' && v.match(/^\d{10,80}field$/)) {
                  firstField = v
                  break
                }
                // Check inside future arguments (v4-v6 format)
                if (o.type === 'future') {
                  const m = v.match(/\}\s*,\s*(\d{20,80})field/)
                  if (m) { firstField = `${m[1]}field`; break }
                  // Also try: standalone field in arguments list
                  const m2 = v.match(/(\d{20,80})field/)
                  if (m2) { firstField = `${m2[1]}field`; break }
                }
              }
              if (firstField) break
            }
            if (firstField) {
              console.log(`[snarkos] extracted market_id: ${firstField.slice(0, 20)}... from tx ${txId.slice(0, 20)}...`)
              break
            }
          } catch (err) {
            console.warn(`[snarkos] poll attempt ${attempt + 1}: ${(err as Error)?.message?.slice(0, 60)}`)
          }
        }
        resolve({ txId, firstFieldOutput: firstField, raw: stdout })
      })()
    })
  })
}

const TURBO_PROGRAM_ID_LIVE =
  process.env.TURBO_PROGRAM_ID || 'veiled_turbo_v8.aleo'

async function broadcastCreateTurboMarket(inputs: string[]): Promise<SnarkosExecResult> {
  return snarkosExecute(TURBO_PROGRAM_ID_LIVE, 'create_turbo_market', inputs)
}

async function broadcastResolveTurboMarket(inputs: string[]): Promise<SnarkosExecResult> {
  return snarkosExecute(TURBO_PROGRAM_ID_LIVE, 'resolve_turbo_market', inputs)
}

// ----------------------------------------------------------------------------
// CLI entrypoint
// ----------------------------------------------------------------------------

const argv = process.argv.slice(2)
const args = {
  serve: argv.includes('--serve'),
  autoCreate: argv.includes('--auto-create'),
  autoResolve: argv.includes('--auto-resolve'),
}

async function main() {
  const stream = new PythStream()
  stream.start(Object.keys(PYTH_FEED_IDS) as Symbol[])

  // Print every quote update for visibility (rate-limited to once/sec/symbol)
  const lastLogged: Partial<Record<Symbol, number>> = {}
  stream.onUpdate((q) => {
    const last = lastLogged[q.symbol] || 0
    if (Date.now() - last < 1000) return
    lastLogged[q.symbol] = Date.now()
    console.log(
      `[pyth] ${q.symbol.padEnd(3)} $${q.price.toFixed(2)}  ±$${q.conf.toFixed(2)}  @${new Date(q.publishTime).toISOString()}`,
    )
  })

  if (args.serve) startServer(stream)
  if (args.autoCreate) autoCreateLoop(stream)
  if (args.autoResolve) {
    autoResolveLoop(stream, fetchActiveTurboMarketsFromAudit)
  }

  // graceful shutdown
  process.on('SIGINT', () => { stream.stop(); process.exit(0) })
  process.on('SIGTERM', () => { stream.stop(); process.exit(0) })
}

// Only run main when executed directly (not on import)
const isEntry = import.meta.url === `file://${process.argv[1]}`
if (isEntry) {
  main().catch((err) => {
    console.error('fatal:', err)
    process.exit(1)
  })
}
