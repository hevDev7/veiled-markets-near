// ============================================================================
// Veiled Turbo — Pyth oracle operator for NEAR (port of pyth-oracle.ts)
// ============================================================================
// Same service, same HTTP endpoints (/health /quote /stream /chain /chain/symbol
// /snapshot/*), same rolling-chain loop; the chain side now talks to the Veiled
// contract on NEAR testnet: create_turbo_market / resolve_turbo_market signed by
// the oracle operator account (the contract checks the caller), heights from the
// contract's virtual height (one tick per 4 s of block time, as on Aleo).
// The audit trail is kept by this service (/audit, backend/turbo-audit.jsonl);
// set NEAR_AUDIT_TO_SUPABASE=1 to also append it to Supabase.
//
//   npx tsx src/near-turbo-oracle.ts --serve --auto-create
//
// Env: VEILED_CONTRACT (v1.veiled-markets.testnet), ORACLE_ACCOUNT
//      (veiled-oracle.testnet), ORACLE_PRIVATE_KEY (default: the legacy
//      keychain file), NEAR_RPC_URL (comma-separated, tried in order), TURBO_SYMBOLS (BTC,ETH,SOL),
//      TURBO_DURATION_BLOCKS (75 = 5 min), TURBO_OPERATOR_PORT (4090).
//
// TURBO_PRICES=contract: rounds open with open_turbo_round and settle with settle_turbo_round, so the contract
// takes both prices from the oracle contract it names (set_turbo_oracle / set_turbo_feed by the owner); this
// service's own quotes then only drive the charts. The symbols must have a feed on the contract. With Pyth as that
// oracle, set TURBO_PYTH_PUSH_HERMES (testnet: https://hermes-beta.pyth.network, with PYTH_API_KEY) so the
// latest update is stored on the Pyth contract before each open and settle; OutLayer's oracle needs no push.
// ============================================================================

import { EventSource } from 'eventsource'
import {
  CloseWindowMissed,
  openRound,
  pythPush,
  settleRound,
  turboPriceMode,
  type ContractPriceDeps,
  type ContractPriceOptions,
} from './turbo-contract-prices'
// node-fetch is already a dep; native fetch is fine on Node 18+ but we
// import to keep parity with the rest of backend/.
// import fetch from 'node-fetch'

// Settings such as PYTH_API_KEY can live in backend/.env (gitignored); variables already in the environment win.
try {
  process.loadEnvFile(new URL('../.env', import.meta.url))
} catch (err) {
  if ((err as NodeJS.ErrnoException).code !== 'ENOENT') console.warn('[env] backend/.env not loaded:', (err as Error).message)
}

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

// Symbol IDs MUST match the constants compiled into veiled_turbo_v9.aleo
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
const PORT = Number(process.env.TURBO_OPERATOR_PORT || 4090)

const FRESHNESS_TOLERANCE_MS = 3000 // reject Pyth quotes older than 3s

// Pyth Hermes answers price updates only with an API key (Authorization: Bearer) since its 2026 Core upgrade.
// Without PYTH_API_KEY the operator falls back to CoinGecko's public spot price (polled, coarser, and recorded
// as such in the audit trail). PRICE_SOURCE=pyth|coingecko forces one.
const PYTH_API_KEY = process.env.PYTH_API_KEY || ''
export const PRICE_SOURCE: 'pyth' | 'coingecko' =
  process.env.PRICE_SOURCE === 'coingecko' || process.env.PRICE_SOURCE === 'pyth'
    ? process.env.PRICE_SOURCE
    : PYTH_API_KEY ? 'pyth' : 'coingecko'
const COINGECKO_URL = process.env.COINGECKO_URL || 'https://api.coingecko.com/api/v3'
// CoinGecko's keyless API allows roughly 5-15 calls a minute per IP and refreshes its prices about once a minute,
// so a 20 s poll loses no freshness; after a 429 the poller pauses for two intervals instead of adding to the block.
const COINGECKO_POLL_MS = Number(process.env.COINGECKO_POLL_MS || 20_000)
const COINGECKO_IDS: Record<string, string> = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', DOGE: 'dogecoin', XRP: 'ripple',
  BNB: 'binancecoin', ADA: 'cardano', AVAX: 'avalanche-2', LINK: 'chainlink', DOT: 'polkadot',
}
/** How old a quote may be: Pyth streams sub-second, the CoinGecko fallback is polled. */
const QUOTE_MAX_AGE_MS = PRICE_SOURCE === 'pyth' ? FRESHNESS_TOLERANCE_MS : COINGECKO_POLL_MS * 3

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
    if (Date.now() - q.publishTime > QUOTE_MAX_AGE_MS) return null
    return q
  }

  onUpdate(fn: (q: PythQuote) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private poll: ReturnType<typeof setInterval> | null = null

  private emit(quote: PythQuote) {
    this.cache.set(quote.symbol, quote)
    for (const fn of this.listeners) fn(quote)
  }

  /** Keyless fallback: CoinGecko spot prices, stamped with the time this operator observed them. */
  private startCoinGecko(symbols: Symbol[]): void {
    const ids = symbols.map(s => COINGECKO_IDS[s]).filter(Boolean)
    const url = `${COINGECKO_URL}/simple/price?ids=${ids.join(',')}&vs_currencies=usd&precision=full`
    console.log(`[price] PYTH_API_KEY not set — using CoinGecko spot prices every ${COINGECKO_POLL_MS / 1000}s`)
    let pausedUntil = 0
    const tick = async () => {
      if (Date.now() < pausedUntil) return
      try {
        const res = await fetch(url, { headers: { accept: 'application/json' } })
        if (res.status === 429) pausedUntil = Date.now() + 2 * COINGECKO_POLL_MS
        if (!res.ok) throw new Error(`coingecko ${res.status}`)
        const body = (await res.json()) as Record<string, { usd?: number }>
        const now = Date.now()
        for (const symbol of symbols) {
          const usd = body[COINGECKO_IDS[symbol]]?.usd
          if (!usd || !Number.isFinite(usd)) continue
          this.emit({ symbol, feedId: `coingecko:${COINGECKO_IDS[symbol]}`, price: usd, conf: 0, publishTime: now })
        }
      } catch (err) {
        console.warn('[price] coingecko poll failed:', (err as Error).message)
      }
    }
    void tick()
    this.poll = setInterval(tick, COINGECKO_POLL_MS)
  }

  start(symbols: Symbol[] = ['BTC', 'ETH', 'SOL']): void {
    if (PRICE_SOURCE === 'coingecko') return this.startCoinGecko(symbols)
    void this.entitledSymbols(symbols).then(allowed => this.startPyth(allowed))
  }

  /**
   * Pyth plans grant a subset of feeds, and Hermes rejects a whole request that names a feed outside the grant
   * (403 "Not entitled"). Keep the feeds this key may read; on any other answer keep the feed and let the stream
   * report the problem.
   */
  private async entitledSymbols(symbols: Symbol[]): Promise<Symbol[]> {
    const checked = await Promise.all(symbols.map(async s => {
      try {
        const res = await fetch(`${PYTH_HERMES_URL}/v2/updates/price/latest?ids[]=${PYTH_FEED_IDS[s]}`, {
          headers: { authorization: `Bearer ${PYTH_API_KEY}` },
        })
        return res.status === 403 ? null : s
      } catch {
        return s
      }
    }))
    const kept = checked.filter((s): s is Symbol => s !== null)
    const skipped = symbols.filter(s => !kept.includes(s))
    if (skipped.length) console.warn(`[pyth] API key is not entitled to ${skipped.join(', ')}; streaming ${kept.join(', ') || 'nothing'}`)
    return kept
  }

  private startPyth(symbols: Symbol[]): void {
    if (!symbols.length) return
    const ids = symbols.map(s => PYTH_FEED_IDS[s])
    const params = ids.map(id => `ids[]=${id}`).join('&') + '&parsed=true'
    const url = `${PYTH_HERMES_URL}/v2/updates/price/stream?${params}`
    console.log(`[pyth] subscribing: ${url}`)

    this.eventSource = new EventSource(url, {
      fetch: (input, init) =>
        fetch(input, { ...init, headers: { ...(init?.headers ?? {}), authorization: `Bearer ${PYTH_API_KEY}` } }),
    })
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
          this.emit(quote)
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
    if (this.poll) clearInterval(this.poll)
    this.poll = null
  }
}

// ----------------------------------------------------------------------------
// Aleo block height client (lightweight, polling)
// ----------------------------------------------------------------------------

export async function getAleoBlockHeight(): Promise<bigint> {
  // Name kept for the shared rolling-chain code: this is the NEAR contract's virtual height.
  const h = await nearView<string>('get_height', {})
  return BigInt(h)
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
    res.setHeader('access-control-allow-headers', '*')
    res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS')
    res.setHeader('access-control-expose-headers', 'content-range')
    res.setHeader('content-type', 'application/json')
    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }

    try {
      const url = new URL(req.url || '/', `http://localhost:${PORT}`)
      const path = url.pathname

      // Health
      if (path === '/health') {
        res.end(JSON.stringify({ ok: true, ts: Date.now(), chain: 'near-testnet', contract: VEILED_CONTRACT, price_source: PRICE_SOURCE }))
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

      // Audit trail: the rows Supabase's turbo_oracle_audit held on Aleo, queried the same PostgREST way
      // (col=eq.x, col=in.(a,b), col=gte.x, order=col.desc, limit=n, select=a,b), so pages swap only the base URL.
      // `/rest/v1/turbo_oracle_audit` is the same read at the path the pages used on Supabase.
      if ((path === '/audit' || path === '/rest/v1/turbo_oracle_audit') && req.method === 'GET') {
        const { rows, total } = queryAuditPage(url.searchParams)
        const offset = Math.max(0, Number(url.searchParams.get('offset') || 0))
        res.setHeader('content-range', rows.length ? `${offset}-${offset + rows.length - 1}/${total}` : `*/${total}`)
        res.end(JSON.stringify(rows))
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

const AUDIT_FILE = process.env.TURBO_AUDIT_FILE || nodePath.join(process.cwd(), 'turbo-audit.jsonl')
const auditRows: Array<Record<string, unknown>> = []
let auditSeq = 0
function loadAudit() {
  if (!existsSync(AUDIT_FILE)) return
  for (const line of readFileSync(AUDIT_FILE, 'utf8').split('\n')) {
    if (!line.trim()) continue
    try { const r = JSON.parse(line); auditRows.push(r); auditSeq = Math.max(auditSeq, Number(r.id) || 0) } catch {}
  }
}
export function auditTrail(): Array<Record<string, unknown>> { return auditRows }

/** PostgREST-style read of the local audit rows (the subset of the syntax the pages use). */
export function queryAudit(params: URLSearchParams): Array<Record<string, unknown>> {
  return queryAuditPage(params).rows
}

/** The matching rows (after offset/limit) and how many matched in all (PostgREST's count=exact). */
export function queryAuditPage(params: URLSearchParams): { rows: Array<Record<string, unknown>>; total: number } {
  const cmp = (a: unknown, b: string) => {
    const x = String(a ?? '')
    const nx = Number(x)
    const nb = Number(b)
    if (x !== '' && b !== '' && Number.isFinite(nx) && Number.isFinite(nb)) return nx - nb
    return x < b ? -1 : x > b ? 1 : 0
  }
  let rows = auditTrail().slice()
  for (const [col, raw] of params) {
    if (col === 'order' || col === 'limit' || col === 'select' || col === 'offset') continue
    const dot = raw.indexOf('.')
    if (dot < 0) continue
    const op = raw.slice(0, dot)
    const val = raw.slice(dot + 1)
    const set = op === 'in' ? val.replace(/^\(|\)$/g, '').split(',').map(v => v.trim().replace(/^"|"$/g, '')) : []
    rows = rows.filter(r => {
      const v = r[col]
      switch (op) {
        case 'eq': return String(v ?? '') === val
        case 'neq': return String(v ?? '') !== val
        case 'in': return set.includes(String(v ?? ''))
        case 'gt': return cmp(v, val) > 0
        case 'gte': return cmp(v, val) >= 0
        case 'lt': return cmp(v, val) < 0
        case 'lte': return cmp(v, val) <= 0
        default: return true
      }
    })
  }
  const order = params.get('order')
  if (order) {
    const [col, dir] = order.split('.')
    const sign = dir === 'desc' ? -1 : 1
    rows.sort((a, b) => sign * cmp(a[col], String(b[col] ?? '')))
  }
  const total = rows.length
  const offset = Math.max(0, Number(params.get('offset') || 0))
  const limit = Math.min(Math.max(0, Number(params.get('limit') || 1000)), 1000)
  rows = rows.slice(offset, offset + limit)
  const select = params.get('select')
  if (select && select !== '*') {
    const cols = select.split(',').map(c => c.trim())
    rows = rows.map(r => Object.fromEntries(cols.map(c => [c, r[c]])))
  }
  return { rows, total }
}

export async function logTurboAudit(entry: TurboAuditEntry): Promise<void> {
  const row = {
    id: ++auditSeq,
    created_at: new Date().toISOString(),
    ...entry,
    aleo_block: entry.aleo_block.toString(),
    chain: 'near-testnet',
    contract: VEILED_CONTRACT,
    price_source: PRICE_SOURCE,
  }
  auditRows.push(row)
  try { appendFileSync(AUDIT_FILE, JSON.stringify(row) + '\n') } catch (err) { console.error('[audit] file append failed:', err) }
  if (process.env.NEAR_AUDIT_TO_SUPABASE !== '1') return
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
  const operatorAddress = process.env.ORACLE_ACCOUNT || 'veiled-oracle.testnet'
  // v7: no per-market liquidity — vault-backed

  // Lock to prevent re-entrant creates while a broadcast is in-flight
  const creating = new Set<Symbol>()

  // Freeze the price at a round's wallclock deadline (when the frontend countdown reaches zero), then resolve as
  // soon as the chain reaches the deadline block. Used for rounds this run creates and for rounds it adopted.
  function scheduleDeadlineFreeze(symbol: Symbol, capturedMarketId: string, deadlineMs: number): void {
    const msUntilFreeze = Math.max(0, deadlineMs - Date.now())
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
  }

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
      let baselinePrice = baselineOverride ?? quote.price
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
      // Contract prices: the round's baseline is the oracle price the contract stored, not this service's quote.
      if (result.baselineMicro != null) baselinePrice = Number(result.baselineMicro) / 1_000_000

      // Verify create tx was actually accepted on-chain (not rejected).
      // If we got a txId but the tx was rejected, don't set chainState —
      // let the next tick retry with the correct closing price baseline.
      // nearCall throws when the create failed on chain, so reaching here means it landed.

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
      const SECS_PER_BLOCK = Number(process.env.SECONDS_PER_TICK || 4)
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
      // NEAR: the contract's height is block_timestamp_ms / 4000, so the deadline block
      // starts at exactly deadline * 4 s of chain time. Trading closes on chain then,
      // so the countdown and the freeze use that instant instead of an estimate.
      const absoluteDeadlineMs = Number(deadline) * SECS_PER_BLOCK * 1000

      // Update with real market_id from tx output
      chainState.set(symbol, {
        market_id: marketId,
        symbol,
        baseline_price: baselinePrice,
        deadline,
        deadline_ms: absoluteDeadlineMs,
        status: 'active',
      })

      scheduleDeadlineFreeze(symbol, capturedMarketId, absoluteDeadlineMs)

    // For chained markets, the audit row's `pyth_publish_time` should
    // point to the moment the BASELINE was captured from Pyth — i.e.
    // the previous market's resolve instant — not the fresh Pyth quote
    // at create time. Otherwise VerifyTurbo re-queries Pyth Hermes at
    // the wrong timestamp and the UI shows phantom operator-vs-Pyth
    // drift (which is really just Pyth movement between resolve and
    // create). Falls back to the fresh quote's publishTime when we
    // don't have the previous source (e.g. non-chained first-ever
    // create, or lastClosingPrice fallback without a saved timestamp).
    // Contract prices: the contract keeps only the tick the oracle price was published in; its start is the time.
    const baselinePublishTime =
      result.baselineBlock != null
        ? Number(result.baselineBlock) * SECS_PER_BLOCK * 1000
        : baselineOverride != null && baselineSourcePublishTime != null
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
        chained_from: result.baselineMicro != null ? 'oracle_contract' : baselineOverride ? 'previous_closing' : 'pyth_live',
      },
    })
    console.log(`[chain] ${symbol} created ${marketId.slice(0, 20)}... baseline=$${baselinePrice.toFixed(6)} (micro=${result.baselineMicro ?? baselineMicro}) chained=${!!baselineOverride} deadline=${deadline}`)
    } finally {
      creating.delete(symbol)
    }
  }

  // Lock to prevent duplicate resolve calls
  const resolving = new Set<Symbol>()

  // The fast path (timer at the deadline) and the tick loop can both reach a round's resolve. The slot is claimed
  // synchronously, before any await, so only one of them broadcasts; the other gets null and leaves chaining to it.
  const resolveSlots = new Set<Symbol>()
  async function resolveMarket(m: ChainedMarket): Promise<number | null> {
    if (m.status === 'resolved' && m.closing_price != null && m.closing_price > 0) return m.closing_price
    if (resolveSlots.has(m.symbol)) return null
    resolveSlots.add(m.symbol)
    try {
      return await resolveMarketOnce(m)
    } finally {
      resolveSlots.delete(m.symbol)
    }
  }

  async function resolveMarketOnce(m: ChainedMarket): Promise<number | null> {
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
      const onChainText = await onChainTurboText(m.market_id)
      const onChainRes = { ok: onChainText != null, text: async () => onChainText ?? '' }
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
      let result: SnarkosExecResult
      try {
        result = await broadcastResolveTurboMarket(inputs)
      } catch (err) {
        if (!(err instanceof CloseWindowMissed)) throw err
        // Contract prices: no oracle price landed inside the round's close window, so it can no longer be
        // settled by price. The stale sweep cancels it after its resolution deadline (bets are refunded); the
        // next round opens on the next tick instead of retrying this one.
        console.warn(`[chain] ${m.symbol} ${m.market_id.slice(0, 16)}... missed its close window: ${err.message}`)
        const fallbackQuote = stream.latest(m.symbol)
        if (fallbackQuote) lastClosingPrice.set(m.symbol, fallbackQuote.price)
        chainState.delete(m.symbol)
        return null
      }
      ;(globalThis as any)._lastResolveTxId = result.txId

      // Wait briefly then read on-chain closing_price as authoritative.
      // This ensures m.closing_price matches exactly what's stored on-chain,
      // even if the broadcast was retried with a different quote.
      let onChainClosing: number | null = null
      for (let attempt = 0; attempt < 12; attempt++) {
        // NEAR returns after execution: check at once, then every 1.5 s.
        if (attempt > 0) await new Promise(r => setTimeout(r, 1500))
        try {
          const onChainText = await onChainTurboText(m.market_id)
      const onChainRes = { ok: onChainText != null, text: async () => onChainText ?? '' }
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

  // ── Stagger tracking ──
  // When multiple symbols are enabled, stagger initial market creation so
  // markets don't all resolve at the same time. Each symbol gets an offset
  // of DURATION/N, so with 3 symbols and 5-min rounds:
  //   BTC creates immediately, ETH after ~100s, SOL after ~200s.
  // After initial stagger, each symbol chains independently via rolling loop.
  const staggerStarted = new Set<Symbol>()
  const staggerTimers = new Map<Symbol, ReturnType<typeof setTimeout>>()

  const tick = async () => {
    const symbols: Symbol[] = ['BTC', 'ETH', 'SOL', 'DOGE', 'XRP', 'BNB', 'ADA', 'AVAX', 'LINK', 'DOT']
    // Filter symbols — set TURBO_SYMBOLS=BTC to test one at a time
    const enabledStr = process.env.TURBO_SYMBOLS || 'BTC,ETH,SOL'
    const enabled = enabledStr.split(',').map(s => s.trim()) as Symbol[]
    const activeSymbols = enabled.filter(s => symbols.includes(s))

    // Stagger initial creation — only applies when a symbol has no chainState yet
    const secsPerBlock = Number(process.env.SECONDS_PER_TICK || 4)
    const durationMs = Number(DURATION_BLOCKS) * secsPerBlock * 1000
    const staggerOffsetMs = activeSymbols.length > 1
      ? Math.floor(durationMs / activeSymbols.length)
      : 0

    for (let idx = 0; idx < activeSymbols.length; idx++) {
      const symbol = activeSymbols[idx]
      try {
        const current = chainState.get(symbol)

        if (!current || current.status === 'resolved') {
          // Stagger: on first create, delay based on symbol index
          if (!staggerStarted.has(symbol) && !current && idx > 0 && staggerOffsetMs > 0) {
            if (!staggerTimers.has(symbol)) {
              const delayMs = staggerOffsetMs * idx
              console.log(`[chain] ${symbol} staggered — will create in ${(delayMs / 1000).toFixed(0)}s`)
              staggerTimers.set(symbol, setTimeout(async () => {
                staggerStarted.add(symbol)
                staggerTimers.delete(symbol)
                const q = stream.latest(symbol)
                if (!q) return
                try {
                  await createMarket(symbol, undefined, undefined)
                } catch (err) {
                  // Without this catch a failed RPC call here is an unhandled rejection and stops the oracle.
                  console.warn(`[chain] ${symbol} staggered create failed, the tick loop will retry:`, (err as Error).message)
                }
              }, delayMs))
            }
            continue
          }
          staggerStarted.add(symbol)

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

  // Rounds adopted at startup (adoptOpenRounds) freeze at their deadline like the ones created here.
  for (const m of chainState.values()) {
    if (m.status === 'active') scheduleDeadlineFreeze(m.symbol, m.market_id, m.deadline_ms)
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
// Tx broadcast — NEAR function calls signed by the oracle operator account
// ----------------------------------------------------------------------------

import { readFileSync, appendFileSync, existsSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import nodePath from 'node:path'
import { Account, FailoverRpcProvider, JsonRpcProvider, KeyPairSigner, actions } from 'near-api-js'

const VEILED_CONTRACT = process.env.VEILED_CONTRACT || 'v1.veiled-markets.testnet'
const ORACLE_ACCOUNT = process.env.ORACLE_ACCOUNT || 'veiled-oracle.testnet'
// Comma-separated: when one endpoint times out or rate-limits, calls move to the next.
const NEAR_RPC_URLS = (process.env.NEAR_RPC_URL || 'https://test.rpc.fastnear.com,https://near-testnet.drpc.org')
  .split(',').map(u => u.trim()).filter(Boolean)
const nearProvider = new FailoverRpcProvider(NEAR_RPC_URLS.map(url => new JsonRpcProvider({ url })))
let oracleAccount: Account | null = null

function getOracleAccount(): Account {
  if (oracleAccount) return oracleAccount
  const key = process.env.ORACLE_PRIVATE_KEY ||
    JSON.parse(readFileSync(nodePath.join(homedir(), '.near-credentials', 'testnet', `${ORACLE_ACCOUNT}.json`), 'utf8')).private_key
  oracleAccount = new Account(ORACLE_ACCOUNT, nearProvider, KeyPairSigner.fromSecretKey(key))
  return oracleAccount
}

export async function nearView<T>(method: string, args: Record<string, unknown>): Promise<T> {
  return (await nearProvider.callFunction({ contractId: VEILED_CONTRACT, method, args })) as T
}

/** Same shape the Aleo version returned: the tx id and the id of the market it created. */
export interface SnarkosExecResult {
  txId: string
  firstFieldOutput?: string
  raw: string
}

// One key, one nonce sequence: oracle transactions go out one at a time.
let txQueue: Promise<unknown> = Promise.resolve()
function serial<T>(job: () => Promise<T>): Promise<T> {
  const run = txQueue.then(job, job)
  txQueue = run.catch(() => undefined)
  return run
}

function nearCall(method: string, args: Record<string, unknown>): Promise<SnarkosExecResult> {
  return nearCallTo(VEILED_CONTRACT, method, args, 50_000_000_000_000n, 0n)
}

async function nearCallTo(
  receiverId: string,
  method: string,
  args: Record<string, unknown>,
  gas: bigint,
  deposit: bigint,
): Promise<SnarkosExecResult> {
  if (process.env.DRY_RUN === '1') {
    console.log(`[near] DRY_RUN ${receiverId} ${method}`, JSON.stringify(args))
    return { txId: `dryrun_${Date.now()}`, raw: '' }
  }
  const outcome: any = await serial(() =>
    getOracleAccount().signAndSendTransaction({
      receiverId,
      actions: [actions.functionCall(method, args, gas, deposit)],
      waitUntil: 'EXECUTED_OPTIMISTIC',
      throwOnFailure: false,
    }),
  )
  const txId: string = outcome?.transaction_outcome?.id ?? outcome?.transaction?.hash ?? 'unknown'
  const failure = outcome?.status?.Failure
  if (failure) {
    const code = JSON.stringify(failure).match(/ERR_[A-Z_0-9]+/)?.[0] ?? JSON.stringify(failure).slice(0, 200)
    throw new Error(`${method} failed on chain: ${code} (tx ${txId})`)
  }
  const v = outcome?.status?.SuccessValue
  const value = v ? JSON.parse(Buffer.from(v, 'base64').toString('utf8')) : null
  console.log(`[near] ${method} ok tx=${txId} -> ${JSON.stringify(value)}`)
  return { txId, firstFieldOutput: value != null ? String(value) : undefined, raw: JSON.stringify(value) }
}

/** Strips Leo literal suffixes ("12u64" -> "12"). */
const lit = (x: string) => x.replace(/(u8|u16|u32|u64|u128|field)$/, '')

const TURBO_PROGRAM_ID_LIVE = VEILED_CONTRACT

const TURBO_PRICES = turboPriceMode(process.env)
const contractPriceDeps: ContractPriceDeps = {
  view: (contractId, method, args) => nearProvider.callFunction({ contractId, method, args }),
  call: async (receiverId, method, args, gas, deposit) => {
    const r = await nearCallTo(receiverId, method, args, gas, deposit)
    return { txId: r.txId, value: r.raw ? JSON.parse(r.raw) : null }
  },
  get: (url, headers) => fetch(url, { headers, signal: AbortSignal.timeout(10_000) }),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now(),
}
const contractPriceOptions: ContractPriceOptions = {
  veiled: VEILED_CONTRACT,
  operator: ORACLE_ACCOUNT,
  push: process.env.TURBO_PYTH_PUSH_HERMES
    ? pythPush(process.env.TURBO_PYTH_PUSH_HERMES, PYTH_API_KEY || undefined)
    : undefined,
}

interface CreateResult extends SnarkosExecResult {
  /** Contract prices only: the baseline the contract took from the oracle (micro-USD) and its tick. */
  baselineMicro?: bigint
  baselineBlock?: bigint
}

async function broadcastCreateTurboMarket(inputs: string[]): Promise<CreateResult> {
  // inputs: [symbol_id, deadline, nonce, price, conf, at_block, creator] (snapshotToCreateInputs)
  const [symbolId, deadline, , price, conf, atBlock] = inputs.map(lit)
  if (TURBO_PRICES === 'contract') {
    if (process.env.DRY_RUN === '1') return nearCall('open_turbo_round', { symbol_id: Number(symbolId), deadline })
    const o = await openRound(contractPriceDeps, contractPriceOptions, Number(symbolId), BigInt(deadline))
    return { txId: o.txId, firstFieldOutput: `${o.marketId}field`, raw: o.marketId, baselineMicro: o.baselineMicro, baselineBlock: o.baselineBlock }
  }
  const r = await nearCall('create_turbo_market', {
    symbol_id: Number(symbolId),
    deadline,
    baseline_price: price,
    baseline_conf: conf,
    baseline_block: atBlock,
  })
  // The UI keeps Aleo's id spelling ("12field") for every market; NEAR calls strip it again with lit().
  return { ...r, firstFieldOutput: r.firstFieldOutput != null ? `${r.firstFieldOutput}field` : undefined }
}

async function broadcastResolveTurboMarket(inputs: string[]): Promise<SnarkosExecResult> {
  // inputs: [market_id, price, conf, at_block] (snapshotToResolveInputs)
  const [marketId, price, conf, atBlock] = inputs.map(lit)
  if (TURBO_PRICES === 'contract') {
    // The closing price is the oracle's; the caller reads it back from the round.
    if (process.env.DRY_RUN === '1') return nearCall('settle_turbo_round', { market_id: marketId })
    const s = await settleRound(contractPriceDeps, contractPriceOptions, marketId)
    if (s.alreadySettled) console.log(`[near] turbo round ${marketId} was already settled`)
    return { txId: s.txId || 'already_settled', raw: '' }
  }
  return nearCall('resolve_turbo_market', {
    market_id: marketId,
    closing_price: price,
    closing_conf: conf,
    closing_block: atBlock,
  })
}

/** The contract's view of a turbo market, as the Aleo mapping text the shared code parses. */
async function onChainTurboText(marketId: string): Promise<string | null> {
  try {
    const t: any = await nearView('get_turbo_market', { market_id: lit(marketId) })
    if (!t) return null
    // The shared code waits for status 2. On NEAR a round nobody won is CANCELLED (3) at resolve time with its
    // closing price set; for chaining that is still a resolved round.
    const resolved = t.status === 2 || (t.status === 3 && BigInt(t.closing_price) > 0n)
    return `status: ${resolved ? 2 : t.status}u8, closing_price: ${t.closing_price}u128`
  } catch {
    return null
  }
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

// Empty finished rounds are pruned from contract storage after a while (the contract keeps any round with a
// bet, and each symbol's latest round). A cursor over the audit ids survives restarts.
const PRUNE_AFTER_MS = Number(process.env.TURBO_PRUNE_AFTER_MIN || 30) * 60_000
const PRUNE_STATE = process.env.TURBO_PRUNE_STATE || nodePath.join(process.cwd(), 'turbo-prune.json')
function startPruneLoop() {
  let cursor = 0
  try { cursor = JSON.parse(readFileSync(PRUNE_STATE, 'utf8')).cursor || 0 } catch {}
  const run = async () => {
    const due = auditTrail()
      .filter(r => Number(r.id) > cursor && (r.event === 'resolve' || r.event === 'cancel') &&
        Date.now() - Date.parse(String(r.created_at)) > PRUNE_AFTER_MS)
      .slice(0, 50)
    if (!due.length) return
    const ids: string[] = []
    for (const r of due) {
      const id = lit(String(r.market_id))
      if (!/^\d+$/.test(id)) continue
      const t: any = await nearView('get_turbo_market', { market_id: id }).catch(() => null)
      if (t && t.status !== 1 && t.up_bets === 0 && t.down_bets === 0) ids.push(id)
    }
    if (ids.length) {
      const res = await nearCall('prune_turbo', { market_ids: ids })
      console.log(`[prune] ${res.firstFieldOutput ?? '?'} of ${ids.length} empty rounds pruned`)
    }
    cursor = Number(due[due.length - 1].id)
    writeFileSync(PRUNE_STATE, JSON.stringify({ cursor }))
  }
  setInterval(() => { run().catch(err => console.warn('[prune] failed:', err?.message ?? err)) }, 5 * 60_000)
}

// After a restart chainState is empty, so the loop would open a second round per symbol next to the ones the last
// run left open. Adopt each symbol's latest round while it can still be resolved: the chain loop then freezes it at
// its deadline, resolves it and chains the next round from its closing price. Older or expired rounds are left to
// the stale sweep below.
async function adoptOpenRounds(): Promise<void> {
  const enabled = (process.env.TURBO_SYMBOLS || 'BTC,ETH,SOL').split(',').map(s => s.trim()) as Symbol[]
  let height: bigint
  try {
    height = BigInt(await nearView<string>('get_height', {}))
  } catch (err) {
    console.warn('[adopt] skipped, height unavailable:', (err as Error).message)
    return
  }
  const secsPerTick = Number(process.env.SECONDS_PER_TICK || 4)
  for (const symbol of enabled) {
    const symbolId = SYMBOL_IDS[symbol]
    if (!symbolId) continue
    const t: any = await nearView('get_latest_turbo', { symbol_id: symbolId }).catch(() => null)
    if (!t || t.status !== 1) continue
    const deadline = BigInt(t.deadline)
    if (height > deadline + 60n) continue // past the resolve window: the stale sweep cancels it
    chainState.set(symbol, {
      market_id: `${t.id}field`,
      symbol,
      baseline_price: Number(t.baseline_price) / 1_000_000,
      deadline,
      deadline_ms: Number(deadline) * secsPerTick * 1000,
      status: 'active',
    })
    console.log(`[adopt] ${symbol} round ${t.id} is still open (deadline ${deadline}); resolving it on schedule`)
  }
}

// Rounds an earlier oracle run left open (it stopped between create and resolve). Once a round's resolution
// window has closed the oracle cancels it, so anyone who bet can take a refund; rounds already settled on chain
// just get their audit row. Either way the audit trail closes and the Turbo page stops listing them.
function startStaleSweep() {
  const run = async () => {
    const rows = auditTrail()
    const settled = new Set(rows.filter(r => r.event === 'resolve' || r.event === 'cancel').map(r => String(r.market_id)))
    const current = new Set(getAllChainedMarkets().map(m => m.market_id))
    const open = rows.filter(r => r.event === 'create' && !settled.has(String(r.market_id)) && !current.has(String(r.market_id)))
    if (!open.length) return
    const height = BigInt(await nearView<string>('get_height', {}))
    for (const r of open.slice(0, 20)) {
      const id = lit(String(r.market_id))
      if (!/^\d+$/.test(id)) continue
      const t: any = await nearView('get_turbo_market', { market_id: id }).catch(() => null)
      const base = {
        market_id: String(r.market_id),
        symbol: r.symbol as Symbol,
        pyth_conf: 0,
        pyth_publish_time: new Date().toISOString(),
        aleo_block: height,
        operator_address: ORACLE_ACCOUNT,
      }
      if (!t) {
        await logTurboAudit({ ...base, event: 'cancel', pyth_price: 0, metadata: { reason: 'not_on_chain' } })
      } else if (t.status !== 1) {
        const closing = Number(t.closing_price) / 1_000_000
        await logTurboAudit({ ...base, event: closing > 0 ? 'resolve' : 'cancel', pyth_price: closing, metadata: { reason: 'recovered', status: t.status } })
      } else if (height > BigInt(t.resolution_deadline)) {
        const res = await nearCall('emergency_cancel_turbo', { market_id: id })
        await logTurboAudit({ ...base, event: 'cancel', pyth_price: 0, aleo_tx_id: res.txId, metadata: { reason: 'stale_round' } })
        console.log(`[sweep] cancelled stale round ${r.market_id} (${r.symbol}) — bets can be refunded`)
      }
    }
  }
  const tick = () => run().catch(err => console.warn('[sweep] failed:', err?.message ?? err))
  setTimeout(tick, 20_000)
  setInterval(tick, 2 * 60_000)
}

async function main() {
  // The oracle has to run unattended for days; one failed RPC call in a timer callback must not end the process.
  process.on('unhandledRejection', (err) => {
    console.error('[oracle] unhandled rejection (kept running):', (err as Error)?.message ?? err)
  })
  loadAudit()
  const stream = new PythStream()
  stream.start(Object.keys(PYTH_FEED_IDS) as Symbol[])

  // Print every quote update for visibility (rate-limited to once/sec/symbol)
  const lastLogged: Partial<Record<Symbol, number>> = {}
  stream.onUpdate((q) => {
    const last = lastLogged[q.symbol] || 0
    if (Date.now() - last < 60_000) return
    lastLogged[q.symbol] = Date.now()
    console.log(
      `[pyth] ${q.symbol.padEnd(3)} $${q.price.toFixed(2)}  ±$${q.conf.toFixed(2)}  @${new Date(q.publishTime).toISOString()}`,
    )
  })

  if (args.serve) startServer(stream)
  if (args.autoCreate) {
    await adoptOpenRounds()
    autoCreateLoop(stream)
    startPruneLoop()
    startStaleSweep()
  }
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
