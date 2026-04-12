// ============================================================================
// TurboMarketPanel — 5-Minute Pyth-Backed UP/DOWN Market UI
// ============================================================================
// Reuses Pyth Hermes streaming directly in the browser (no backend trust for
// chart display). Backend operator only needed for tx broadcast.
//
// Layout matches the screenshot:
//   - Symbol logo + question
//   - Baseline ("Price To Beat") + current price
//   - Countdown timer (MM:SS until deadline)
//   - Live tick chart with baseline dashed line
//   - Two big buttons: BUY UP / BUY DOWN
//   - Recent trades feed (right side, optional)
//
// This is a self-contained component — wire it into a page like
// `/turbo/:marketId` or render directly inside MarketDetail when
// market.category === TURBO.
// ============================================================================

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TrendingUp, TrendingDown, Loader2, CheckCircle2, ShoppingCart } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  buildBuyUpDownInputs,
  buildClaimRefundInputs,
  buildClaimWinningsInputs,
  fetchMarketCredits,
  fetchTurboPool,
  fetchTurboShareRecords,
  parseTurboShare,
  quotePayout,
  type ParsedTurboShare,
  type TurboPoolView,
  type TurboSide,
} from '@/lib/turbo-client'
import { useAleoTransaction } from '@/hooks/useAleoTransaction'
import { useBetsStore } from '@/lib/store'

// Note: price data now streams from the BACKEND operator (/stream endpoint),
// not directly from Pyth Hermes. This ensures all users see identical prices
// (backend is single source of truth) and can freeze in sync during resolve.

const SYMBOL_LOGOS: Record<string, string> = {
  BTC: 'https://assets.coingecko.com/coins/images/1/small/bitcoin.png',
  ETH: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
  SOL: 'https://assets.coingecko.com/coins/images/4128/small/solana.png',
  DOGE: 'https://assets.coingecko.com/coins/images/5/small/dogecoin.png',
  XRP: 'https://assets.coingecko.com/coins/images/44/small/xrp-symbol-white-128.png',
  BNB: 'https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png',
  ADA: 'https://assets.coingecko.com/coins/images/975/small/cardano.png',
  AVAX: 'https://assets.coingecko.com/coins/images/12559/small/Avalanche_Circle_RedWhite_Trans.png',
  LINK: 'https://assets.coingecko.com/coins/images/877/small/chainlink-new-logo.png',
  DOT: 'https://assets.coingecko.com/coins/images/12171/small/polkadot.png',
}

const SYMBOL_NAMES: Record<string, string> = {
  BTC: 'Bitcoin', ETH: 'Ethereum', SOL: 'Solana', DOGE: 'Dogecoin',
  XRP: 'XRP', BNB: 'BNB', ADA: 'Cardano', AVAX: 'Avalanche',
  LINK: 'Chainlink', DOT: 'Polkadot',
}

export type TurboSymbol = 'BTC' | 'ETH' | 'SOL' | 'DOGE' | 'XRP' | 'BNB' | 'ADA' | 'AVAX' | 'LINK' | 'DOT'

export interface TurboMarketPanelProps {
  marketId: string
  symbol: TurboSymbol
  baselinePrice: number  // human-readable USD
  deadlineMs: number     // unix ms
  status: 'active' | 'resolved' | 'cancelled'
  closingPrice?: number
  winningOutcome?: 'UP' | 'DOWN'
  /**
   * Optional override. If not provided, the panel uses useAleoTransaction
   * + the standard buy_up_down builder. Override only for tests/demos.
   */
  onBuy?: (side: TurboSide, amountMicro: bigint) => Promise<void>
  className?: string
  /**
   * When true, skip rendering the chart canvas and the "resolved summary"
   * block below it. Used by the sidebar embed in `TurboDetail` where the
   * trading panel sits in the right column alongside the main chart.
   */
  hideChart?: boolean
  /**
   * When true, skip rendering the Bet UI (buy UP/DOWN + amount input) and
   * the post-resolve Claim section. Used by the main chart embed in
   * `TurboDetail` — trading lives in the sidebar instead, so the chart
   * view stays read-only.
   */
  hideBetUI?: boolean
}

interface PriceTick {
  t: number      // unix ms
  price: number  // USD
}

// ── localStorage tick cache ────────────────────────────────────────────────
// Why: the SSE stream that populates `ticks` only delivers live ticks. A
// refresh after the deadline lands during the LOCKED window where:
//   - SSE is already closed (backend stopped broadcasting at freeze)
//   - on-chain closing_price hasn't been confirmed yet
//   - our own in-memory ticks are gone
// Without persistence the chart can only be re-built as a 2-point synthetic
// line (baseline → frozen_price), which looks nothing like the real intraround
// path the user saw before refreshing. Persisting every tick (scoped by
// marketId) lets the full shape survive a refresh until the market rotates.
//
// Scope: 1 slot per symbol. Storing by marketId would cause unbounded growth
// as rolling markets chain; instead we overwrite when the marketId changes.
// On read we verify the stored marketId matches the one we're mounting with —
// mismatch = stale cache from a previous round, so we ignore it.
const TICK_CACHE_MAX = 200 // same cap as the in-memory buffer
const tickCacheKey = (symbol: string) => `turbo:ticks:${symbol}`

function readCachedTicks(symbol: string, marketId: string): PriceTick[] | null {
  try {
    const raw = localStorage.getItem(tickCacheKey(symbol))
    if (!raw) return null
    const parsed = JSON.parse(raw) as { marketId?: string; ticks?: PriceTick[] }
    if (parsed?.marketId !== marketId) return null
    if (!Array.isArray(parsed.ticks) || parsed.ticks.length === 0) return null
    // Sanity-filter malformed entries
    return parsed.ticks.filter(
      (t): t is PriceTick =>
        t != null && typeof t.t === 'number' && typeof t.price === 'number',
    )
  } catch {
    return null
  }
}

function writeCachedTicks(symbol: string, marketId: string, ticks: PriceTick[]) {
  try {
    const trimmed = ticks.length > TICK_CACHE_MAX ? ticks.slice(-TICK_CACHE_MAX) : ticks
    localStorage.setItem(
      tickCacheKey(symbol),
      JSON.stringify({ marketId, ticks: trimmed }),
    )
  } catch {
    /* quota / privacy mode — silently skip, cache is best-effort */
  }
}

// Canvas rounded-rect helper (used for the "Target" pill)
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

export function TurboMarketPanel({
  marketId,
  symbol,
  baselinePrice,
  deadlineMs,
  status,
  closingPrice,
  winningOutcome,
  onBuy,
  className,
  hideChart = false,
  hideBetUI = false,
}: TurboMarketPanelProps) {
  const { executeTransaction } = useAleoTransaction()
  const [pool, setPool] = useState<TurboPoolView | null>(null)
  const [marketCredits, setMarketCredits] = useState<bigint | null>(null)
  const [shares, setShares] = useState<ParsedTurboShare[] | null>(null)
  const [pasteMode, setPasteMode] = useState(false)
  const [pastedRecord, setPastedRecord] = useState('')
  const [claimBusy, setClaimBusy] = useState(false)
  const [lastTxId, setLastTxId] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  // Hydrate from localStorage on mount so a refresh during LOCKED doesn't
  // reset the chart to a flat synthetic line. readCachedTicks verifies the
  // stored marketId matches ours — stale cache from a previous round is
  // discarded automatically.
  const [ticks, setTicks] = useState<PriceTick[]>(() => {
    const cached = readCachedTicks(symbol, marketId)
    return cached ?? []
  })
  const [currentPrice, setCurrentPrice] = useState<number | null>(() => {
    const cached = readCachedTicks(symbol, marketId)
    return cached && cached.length > 0 ? cached[cached.length - 1].price : null
  })
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.floor((deadlineMs - Date.now()) / 1000)),
  )
  const [chartType, setChartType] = useState<'line' | 'candle'>('line')
  const [betAmount, setBetAmount] = useState('1')
  const [busy, setBusy] = useState<null | 'UP' | 'DOWN'>(null)
  /**
   * Sidebar FAMM-style layout uses a 2-step flow: user picks UP/DOWN first
   * (stored here), enters amount, then clicks a main "Buy X Shares" button.
   * The compact row layout (used in the dashboard hero) bypasses this and
   * fires `handleBet` directly from the UP/DOWN buttons.
   */
  const [selectedSide, setSelectedSide] = useState<TurboSide | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const navigate = useNavigate()

  // ── Subscribe to Pyth Hermes SSE for live ticks ──
  // STOP streaming once deadline passes — freeze chart at final price.
  const [frozen, setFrozen] = useState(false)
  const setFinalPrice = useState<number | null>(null)[1] // setter only, value comes from closingPrice prop

  // Track browser-frozen price (shown at countdown 00:00) separately from
  // the authoritative on-chain closing price. Display both so user can see
  // any gap transparently — this is the oracle snapshot, not manipulation.
  const [frozenAtDeadline, setFrozenAtDeadline] = useState<number | null>(null)

  // Capture browser's frozen price at the moment countdown reaches 0
  useEffect(() => {
    if (frozen && currentPrice != null && frozenAtDeadline == null) {
      setFrozenAtDeadline(currentPrice)
    }
  }, [frozen, currentPrice, frozenAtDeadline])

  // Freeze the chart the instant the local countdown reaches 0 — do NOT
  // wait for the on-chain closing price to arrive. Without this, the chart
  // keeps streaming for the ~20–60s it takes for the backend resolve tx to
  // confirm, which feels like the timer "ran past" the deadline.
  //
  // Guard against deadlineMs === 0 — that's the sentinel value the parent
  // uses while computeDeadlineMs() is still in-flight. Freezing during that
  // window would lock the panel to "PENDING" before the real deadline ever
  // ticks. Any positive value (including one in the past, e.g. user joined
  // mid-resolve) is valid and should trigger freeze.
  useEffect(() => {
    if (status !== 'active' || frozen || deadlineMs <= 0) return
    const msLeft = deadlineMs - Date.now()
    if (msLeft <= 0) {
      setFrozen(true)
      return
    }
    const id = setTimeout(() => setFrozen(true), msLeft)
    return () => clearTimeout(id)
  }, [deadlineMs, status, frozen])

  // When closingPrice prop arrives (authoritative on-chain value):
  //
  // - Always flip `frozen=true` and store it as the final price — this is
  //   the safety net for late-join scenarios (user opens the page after
  //   deadline, countdown never ran locally).
  //
  // - If `currentPrice` and `ticks` are empty, we're in a refresh/late-join
  //   state: the browser-side SSE never captured any live ticks, so there's
  //   nothing for the chart to render and "Final Price" shows "—". In that
  //   case, seed `currentPrice` from the closing price and synthesize a
  //   minimal 2-point line (baseline → closing) so the chart shows the
  //   actual move instead of an empty canvas.
  //
  // - In the normal flow (user watched the whole round), `currentPrice`
  //   is already populated from the SSE stream and `frozenAtDeadline` is
  //   captured at countdown=0. We leave both alone to preserve the dot
  //   chart value the user saw.
  useEffect(() => {
    if (closingPrice == null || closingPrice <= 0) return
    setFinalPrice(closingPrice)
    setFrozen(true)
    // Late-join recovery: seed display state from the on-chain closing price
    setCurrentPrice((prev) => prev ?? closingPrice)
    setTicks((prev) => {
      if (prev.length > 0) return prev // already have live ticks, keep them
      if (!baselinePrice || baselinePrice <= 0) {
        return [{ t: Date.now(), price: closingPrice }]
      }
      // Synthesize a baseline → closing move so the chart has something to
      // render. Timestamps are arbitrary (only relative spacing matters for
      // the canvas renderer), we use deadlineMs as the end anchor when
      // available so the line aligns with the countdown axis.
      const endT = deadlineMs > 0 ? deadlineMs : Date.now()
      const startT = endT - 5 * 60 * 1000 // 5-minute turbo window
      return [
        { t: startT, price: baselinePrice },
        { t: endT, price: closingPrice },
      ]
    })
  }, [closingPrice, baselinePrice, deadlineMs])

  useEffect(() => {
    // Subscribe to BACKEND price stream, not Pyth directly. Backend is the
    // single source of truth for what price every user sees — ensures all
    // clients display identical prices regardless of their network latency.
    // Backend also controls when to stop broadcasting (at resolving phase),
    // so all charts freeze simultaneously.
    if (frozen || status === 'resolved' || status === 'cancelled') return

    const oracleUrl = (import.meta as any).env?.VITE_TURBO_ORACLE_URL || 'http://localhost:4090'
    const url = `${oracleUrl}/stream?symbol=${symbol}`
    const es = new EventSource(url)

    es.onmessage = (ev) => {
      try {
        const q = JSON.parse(ev.data) as { symbol: string; price: number; conf: number; publishTime: number }
        if (!q || typeof q.price !== 'number') return
        setCurrentPrice(q.price)
        setTicks((prev) => {
          const next = [...prev, { t: Date.now(), price: q.price }]
          const capped = next.length > 200 ? next.slice(-200) : next
          // Persist to localStorage so a refresh during LOCKED recovers the
          // real tick path instead of a flat baseline→frozen synthetic line.
          // Scoped by marketId; the next market_id will overwrite this slot.
          writeCachedTicks(symbol, marketId, capped)
          return capped
        })
      } catch {
        /* ignore parse errors */
      }
    }
    return () => es.close()
  }, [symbol, marketId, frozen, status])

  // ── Pool + market_payouts polling (for payout calc) ──
  useEffect(() => {
    let cancelled = false
    const refresh = async () => {
      // Skip fetch for pending market IDs (not yet on-chain)
      if (marketId.startsWith('pending_')) return
      try {
        const [p, mc] = await Promise.all([
          fetchTurboPool(marketId),
          fetchMarketCredits(marketId),
        ])
        if (!cancelled) {
          if (p) setPool(p)
          if (mc != null) setMarketCredits(mc)
        }
      } catch (err) {
        console.error('[turbo-pool] fetch error:', err)
      }
    }
    refresh()
    // Faster refresh while active so AMM quote stays fresh
    const id = setInterval(refresh, status === 'active' ? 8000 : 20000)
    return () => { cancelled = true; clearInterval(id) }
  }, [marketId, status])

  // ── Auto-fetch user shares when status flips terminal ──
  useEffect(() => {
    if (status === 'active') return
    let cancelled = false
    ;(async () => {
      try {
        const list = await fetchTurboShareRecords(marketId)
        if (!cancelled) setShares(list)
      } catch {
        if (!cancelled) setShares([])
      }
    })()
    return () => { cancelled = true }
  }, [marketId, status])

  // ── Countdown timer ──
  useEffect(() => {
    if (status !== 'active') return
    const id = setInterval(() => {
      const left = Math.max(0, Math.floor((deadlineMs - Date.now()) / 1000))
      setSecondsLeft(left)
    }, 250)
    return () => clearInterval(id)
  }, [deadlineMs, status])

  // ── Draw chart (Polymarket Turbo style: light theme, right-axis price
  //    labels, bottom-axis time labels, dashed baseline with Target badge,
  //    orange line + soft fill, current-price dot + circle outline) ──
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || ticks.length < 2) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)
    ctx.textBaseline = 'alphabetic'

    const w = rect.width
    const h = rect.height
    const PAD_RIGHT = 76   // room for right-axis price labels (wider for decimals)
    const PAD_BOTTOM = 22  // room for bottom-axis time labels
    const PAD_TOP = 12
    const PAD_LEFT = 6
    const plotW = w - PAD_LEFT - PAD_RIGHT
    const plotH = h - PAD_TOP - PAD_BOTTOM

    const prices = ticks.map((t) => t.price)
    const times = ticks.map((t) => t.t)
    const allPrices = [...prices, baselinePrice]
    const minP = Math.min(...allPrices)
    const maxP = Math.max(...allPrices)
    const rawRange = maxP - minP || 1
    // Pad range slightly so the line doesn't sit flush against the borders
    const padRange = rawRange * 0.15
    const yMin = minP - padRange
    const yMax = maxP + padRange
    const yRange = yMax - yMin

    const xToCanvas = (i: number) =>
      PAD_LEFT + (i / Math.max(1, prices.length - 1)) * plotW
    const yToCanvas = (price: number) =>
      PAD_TOP + (1 - (price - yMin) / yRange) * plotH

    // Background — transparent (inherits dark container bg)
    ctx.clearRect(0, 0, w, h)

    // ── Y-axis grid + right-aligned price labels ──
    const niceStep = (range: number) => {
      const targetTicks = 5
      const raw = range / targetTicks
      const exp = Math.floor(Math.log10(raw))
      const base = Math.pow(10, exp)
      const m = raw / base
      let nice = 1
      if (m >= 5) nice = 5
      else if (m >= 2) nice = 2
      return nice * base
    }
    const step = niceStep(yRange)
    const firstTick = Math.ceil(yMin / step) * step
    ctx.font = '11px ui-monospace, SFMono-Regular, monospace'
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)'
    ctx.textAlign = 'left'
    for (let p = firstTick; p <= yMax; p += step) {
      const y = yToCanvas(p)
      // grid line — subtle on dark bg
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(PAD_LEFT, y + 0.5)
      ctx.lineTo(PAD_LEFT + plotW, y + 0.5)
      ctx.stroke()
      // label
      // Show decimals when price range is small (e.g. SOL $82-$83)
      const fracDigits = yRange < 10 ? 2 : yRange < 100 ? 1 : 0
      ctx.fillText(
        `$${p.toLocaleString(undefined, { minimumFractionDigits: fracDigits, maximumFractionDigits: fracDigits })}`,
        PAD_LEFT + plotW + 6,
        y + 4,
      )
    }

    // ── Baseline (Target) — orange dashed line + label pill at top-right ──
    const baselineY = yToCanvas(baselinePrice)
    ctx.setLineDash([4, 4])
    ctx.strokeStyle = '#f59e0b'   // amber-500
    ctx.lineWidth = 1.25
    ctx.beginPath()
    ctx.moveTo(PAD_LEFT, baselineY + 0.5)
    ctx.lineTo(PAD_LEFT + plotW, baselineY + 0.5)
    ctx.stroke()
    ctx.setLineDash([])

    // "Target ↑" pill at the top edge of the baseline, anchored right
    const targetText = 'Target'
    ctx.font = 'bold 10px ui-sans-serif, system-ui, sans-serif'
    const tW = ctx.measureText(targetText).width + 18
    const tH = 16
    const tX = PAD_LEFT + plotW - tW - 4
    const tY = Math.max(2, baselineY - tH - 2)
    roundRect(ctx, tX, tY, tW, tH, 8)
    ctx.fillStyle = 'rgba(245, 158, 11, 0.25)'  // amber translucent on dark
    ctx.fill()
    ctx.fillStyle = '#fbbf24'      // amber-400
    ctx.fillText(targetText, tX + 6, tY + 11)
    // Tiny up-arrow
    ctx.beginPath()
    ctx.moveTo(tX + tW - 9, tY + 11)
    ctx.lineTo(tX + tW - 5, tY + 5)
    ctx.lineTo(tX + tW - 1, tY + 11)
    ctx.closePath()
    ctx.fillStyle = '#fbbf24'
    ctx.fill()

    // ── Price line / candles ──
    const last = prices[prices.length - 1]
    const lineColor = '#f59e0b'           // orange

    if (chartType === 'candle') {
      // ── Candlestick chart ──
      // Use absolute 15-second buckets aligned to Unix epoch so bucket
      // boundaries never shift as new ticks arrive. Only the last open
      // candle changes; all closed candles are frozen.
      const CANDLE_INTERVAL_MS = 15_000

      // Align bucket start to epoch multiples of CANDLE_INTERVAL_MS
      const firstBucket = Math.floor(times[0] / CANDLE_INTERVAL_MS) * CANDLE_INTERVAL_MS
      const lastBucket = Math.floor(times[times.length - 1] / CANDLE_INTERVAL_MS) * CANDLE_INTERVAL_MS
      const totalSlots = Math.max(1, (lastBucket - firstBucket) / CANDLE_INTERVAL_MS + 1)

      // Build candles by fixed time bucket
      const candleMap = new Map<number, { o: number; h: number; l: number; c: number }>()
      for (let ti = 0; ti < times.length; ti++) {
        const bucket = Math.floor(times[ti] / CANDLE_INTERVAL_MS) * CANDLE_INTERVAL_MS
        const existing = candleMap.get(bucket)
        if (existing) {
          existing.h = Math.max(existing.h, prices[ti])
          existing.l = Math.min(existing.l, prices[ti])
          existing.c = prices[ti]
        } else {
          candleMap.set(bucket, { o: prices[ti], h: prices[ti], l: prices[ti], c: prices[ti] })
        }
      }

      // Convert to sorted array
      const candles = Array.from(candleMap.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([bucket, c]) => ({ ...c, bucket }))

      // Use total 5-min slots (20 candles) for consistent width
      const expectedSlots = Math.max(totalSlots, 20)
      const candleW = Math.max(4, Math.min(14, (plotW / expectedSlots) * 0.7))

      for (let ci = 0; ci < candles.length; ci++) {
        const c = candles[ci]
        // Position by slot index from firstBucket
        const slotIdx = (c.bucket - firstBucket) / CANDLE_INTERVAL_MS
        const x = PAD_LEFT + ((slotIdx + 0.5) / expectedSlots) * plotW
        const isUp = c.c >= c.o
        const color = isUp ? '#10b981' : '#f43f5e' // green / red

        // Wick (high-low line)
        ctx.strokeStyle = color
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x, yToCanvas(c.h))
        ctx.lineTo(x, yToCanvas(c.l))
        ctx.stroke()

        // Body (open-close rect)
        const bodyTop = yToCanvas(Math.max(c.o, c.c))
        const bodyBot = yToCanvas(Math.min(c.o, c.c))
        const bodyH = Math.max(1, bodyBot - bodyTop)
        ctx.fillStyle = color
        ctx.fillRect(x - candleW / 2, bodyTop, candleW, bodyH)

        // Highlight last candle with a border
        if (ci === candles.length - 1) {
          ctx.strokeStyle = 'rgba(255,255,255,0.3)'
          ctx.lineWidth = 1
          ctx.strokeRect(x - candleW / 2, bodyTop, candleW, bodyH)
        }
      }
    } else {
      // ── Line chart with fill ──
      const fillTop = 'rgba(249, 115, 22, 0.18)'
      const fillBot = 'rgba(249, 115, 22, 0.0)'
      const grad = ctx.createLinearGradient(0, PAD_TOP, 0, PAD_TOP + plotH)
      grad.addColorStop(0, fillTop)
      grad.addColorStop(1, fillBot)

      ctx.beginPath()
      ctx.moveTo(xToCanvas(0), PAD_TOP + plotH)
      for (let i = 0; i < prices.length; i++) {
        ctx.lineTo(xToCanvas(i), yToCanvas(prices[i]))
      }
      ctx.lineTo(xToCanvas(prices.length - 1), PAD_TOP + plotH)
      ctx.closePath()
      ctx.fillStyle = grad
      ctx.fill()

      // Line
      ctx.beginPath()
      for (let i = 0; i < prices.length; i++) {
        const x = xToCanvas(i)
        const y = yToCanvas(prices[i])
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.strokeStyle = lineColor
      ctx.lineWidth = 2
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      ctx.stroke()
    }

    // ── X-axis time labels (5 evenly spaced ticks) ──
    if (times.length >= 2) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)'
      ctx.font = '10px ui-monospace, SFMono-Regular, monospace'
      ctx.textAlign = 'center'
      const ticks = 5
      for (let i = 0; i < ticks; i++) {
        const idx = Math.round((i / (ticks - 1)) * (times.length - 1))
        const x = xToCanvas(idx)
        const t = new Date(times[idx])
        const label = t.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        })
        ctx.fillText(label, x, h - 6)
      }
      ctx.textAlign = 'left'
    }

    // ── Current price dot + outer circle outline at the rightmost point ──
    const lastX = xToCanvas(prices.length - 1)
    const lastY = yToCanvas(last)

    // Horizontal dashed line at current price level (color-coded vs baseline)
    const currentLineColor = last >= baselinePrice ? '#10b981' : '#f43f5e' // emerald-500 / rose-500
    ctx.setLineDash([4, 4])
    ctx.strokeStyle = currentLineColor
    ctx.lineWidth = 1.25
    ctx.beginPath()
    ctx.moveTo(PAD_LEFT, lastY + 0.5)
    ctx.lineTo(PAD_LEFT + plotW, lastY + 0.5)
    ctx.stroke()
    ctx.setLineDash([])

    // Outer circle outline (the "ring" in the screenshot)
    ctx.beginPath()
    ctx.arc(lastX, lastY, 7, 0, Math.PI * 2)
    ctx.strokeStyle = lineColor
    ctx.lineWidth = 1.5
    ctx.stroke()
    // Filled inner dot
    ctx.beginPath()
    ctx.arc(lastX, lastY, 3.5, 0, Math.PI * 2)
    ctx.fillStyle = lineColor
    ctx.fill()
  }, [ticks, baselinePrice, chartType])

  // ── Helpers ──
  const mins = Math.floor(secondsLeft / 60)
  const secs = secondsLeft % 60
  const isActive = status === 'active' && secondsLeft > 0
  const direction =
    currentPrice == null
      ? null
      : currentPrice > baselinePrice
        ? 'UP'
        : currentPrice < baselinePrice
          ? 'DOWN'
          : 'EVEN'

  async function handleClaim(share: ParsedTurboShare) {
    setClaimBusy(true)
    setErrorMsg(null)
    try {
      let tx: { programId: string; functionName: string; inputs: string[] }
      if (status === 'cancelled') {
        // Refund: 1:1 of original stake (which equals share.quantity * weighted price).
        // For turbo we refund the share quantity directly (matches market_credits split).
        tx = buildClaimRefundInputs(marketId, share.plaintext, share.quantity)
      } else if (status === 'resolved' && winningOutcome === share.side) {
        if (marketCredits == null || pool == null) {
          throw new Error('Pool state not loaded yet — try again in a moment')
        }
        const totalWinning =
          winningOutcome === 'UP' ? pool.totalUpShares : pool.totalDownShares
        const payout = quotePayout(marketCredits, totalWinning, share.quantity)
        if (payout === 0n) throw new Error('Computed payout is zero')
        tx = buildClaimWinningsInputs(marketId, share.plaintext, payout)
      } else {
        throw new Error('Share is not eligible for claim')
      }

      const result = await executeTransaction({
        program: tx.programId,
        function: tx.functionName,
        inputs: tx.inputs,
        fee: 0.3,
        recordIndices: [1],
      } as any)
      setLastTxId((result as any)?.transactionId || null)
    } catch (err: any) {
      console.error('[turbo] claim failed:', err)
      setErrorMsg(err?.message || String(err))
    } finally {
      setClaimBusy(false)
    }
  }

  async function refreshShares() {
    try {
      const list = await fetchTurboShareRecords(marketId)
      setShares(list)
    } catch {
      setShares([])
    }
  }

  function addPastedShare() {
    setErrorMsg(null)
    const parsed = parseTurboShare(pastedRecord.trim())
    if (!parsed) {
      setErrorMsg('Could not parse record. Expected a TurboShare Leo literal.')
      return
    }
    if (parsed.marketId !== marketId) {
      setErrorMsg(`Record is for a different market (${parsed.marketId.slice(0, 16)}…)`)
      return
    }
    setShares((prev) => {
      const next = [...(prev || [])]
      if (!next.find((s) => s.plaintext === parsed.plaintext)) next.push(parsed)
      return next
    })
    setPastedRecord('')
    setPasteMode(false)
  }

  async function handleBet(side: TurboSide) {
    if (!isActive) return
    const amountAleo = parseFloat(betAmount)
    if (!Number.isFinite(amountAleo) || amountAleo <= 0) return
    const amountMicro = BigInt(Math.round(amountAleo * 1_000_000))
    setBusy(side)
    setErrorMsg(null)
    try {
      // Test override path
      if (onBuy) {
        await onBuy(side, amountMicro)
        return
      }
      // v8 parimutuel: shares = amount_to_pool = amount_in - fee
      // No FPMM pool needed — just compute expected shares directly
      const protocolFee = (amountMicro * 50n) / 10000n
      const expectedShares = amountMicro - protocolFee

      // Fetch a private credits record for the bet amount
      const { fetchCreditsRecord, reserveCreditsRecord, releaseCreditsRecord } =
        await import('@/lib/credits-record')
      const creditsRecord = await fetchCreditsRecord(Number(amountMicro), undefined)
      if (!creditsRecord) {
        throw new Error(
          `No Credits record with at least ${amountAleo.toFixed(2)} ALEO found. ` +
          `Private betting requires an unspent Credits record (not just public balance).`
        )
      }
      reserveCreditsRecord(creditsRecord)

      // v8 parimutuel: expectedShares already computed above
      const tx = buildBuyUpDownInputs(marketId, side, amountMicro, expectedShares, creditsRecord)
      try {
        const result = await executeTransaction({
          program: tx.programId,
          function: tx.functionName,
          inputs: tx.inputs,
          fee: 1.5,
          recordIndices: [5], // credits_in is at index 5
        } as any)
        const txId = (result as any)?.transactionId || `turbo_${Date.now()}`
        setLastTxId(txId)

        // Save to portfolio store so it appears in MyBets/Portfolio page
        useBetsStore.getState().addPendingBet({
          id: txId,
          marketId,
          amount: amountMicro,
          outcome: side === 'UP' ? 'up' : 'down',
          placedAt: Date.now(),
          status: 'active',
          type: 'buy',
          marketQuestion: `${symbol} Up or Down — 5 Minutes`,
          sharesReceived: expectedShares,
          tokenType: 'ALEO',
          claimed: false,
        })
      } finally {
        releaseCreditsRecord(creditsRecord)
      }
    } catch (err: any) {
      console.error('[turbo] bet failed:', err)
      setErrorMsg(err?.message || String(err))
    } finally {
      setBusy(null)
    }
  }

  const showResolved = status === 'resolved' && closingPrice != null && winningOutcome
  const showCancelled = status === 'cancelled'

  return (
    <div
      className={cn(
        'rounded-2xl border border-surface-700/40 bg-surface-900/40 overflow-hidden flex flex-col',
        className,
      )}
    >
      {/* Header — in sidebar mode (hideChart) we stack the title above the
          countdown so the narrow column doesn't cramp them on one row;
          in chart mode they sit side-by-side as before. */}
      <div
        className={cn(
          'px-4 py-3 border-b border-surface-700/30',
          hideChart
            ? 'flex flex-col gap-2'
            : 'flex items-center justify-between',
        )}
      >
        <div className="flex items-center gap-2">
          <img
            src={SYMBOL_LOGOS[symbol]}
            alt={symbol}
            className="w-8 h-8 rounded-full"
            loading="lazy"
          />
          <button
            onClick={() => navigate(`/market/${marketId}`)}
            className="text-base font-bold text-white hover:text-amber-400 transition-colors text-left"
          >
            {SYMBOL_NAMES[symbol] || symbol} Up or Down — 5 Minutes
          </button>
        </div>

        {/* Countdown — in sidebar mode this drops onto its own row below
            the title via the flex-col on the parent. */}
        {isActive && (
          <div className={cn(
            'flex items-baseline gap-1 tabular-nums',
            hideChart && 'self-start',
          )}>
            <span className="text-2xl font-black text-rose-400">
              {String(mins).padStart(2, '0')}
            </span>
            <span className="text-[10px] text-surface-500">MIN</span>
            <span className="text-2xl font-black text-rose-400 ml-1">
              {String(secs).padStart(2, '0')}
            </span>
            <span className="text-[10px] text-surface-500">SECS</span>
          </div>
        )}
        {/* LOCKED + Final price label removed from header — the price
            headline row below already shows "FINAL PRICE LOCKED $X" which
            communicates the same info without duplication. */}
        {showResolved && (
          <div
            className={cn(
              'text-sm font-bold px-3 py-1 rounded-md',
              winningOutcome === 'UP'
                ? 'bg-emerald-500/15 text-emerald-400'
                : 'bg-rose-500/15 text-rose-400',
            )}
          >
            {winningOutcome === 'UP' ? '↑ UP' : '↓ DOWN'} WON
          </div>
        )}
        {showCancelled && (
          <div className="text-xs text-amber-400 font-semibold px-3 py-1 rounded bg-amber-500/10">
            CANCELLED · REFUND
          </div>
        )}
      </div>

      {/* Price headline row — sidebar mode stacks Current Price below
          Price To Beat (narrow column doesn't fit them side-by-side); the
          chart embed keeps the inline horizontal layout. */}
      <div
        className={cn(
          'px-4 py-2 border-b border-surface-700/20 bg-surface-900/30',
          hideChart
            ? 'flex flex-col gap-2'
            : 'flex items-center gap-4',
        )}
      >
        <div>
          <div className="text-[11px] uppercase tracking-wider text-surface-400">
            Price To Beat
          </div>
          <div className="text-base font-bold text-white tabular-nums">
            ${baselinePrice.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
        </div>
        {/* Separator between "Price To Beat" and "Current Price".
            A live delta pill sits here — showing the $ gap between baseline
            and current price — in BOTH layout modes:
              - hero/chart mode (hideChart=false): pill acts as the vertical
                divider between the two side-by-side columns.
              - sidebar mode (hideChart=true): pill sits as a row between the
                stacked "Price To Beat" and "Current Price" sections, with a
                thin horizontal rule on each side to preserve the divider
                feel when the row is empty/frozen.
            Falls back to a plain divider when the market is frozen or the
            delta is too small to show, so the row doesn't jump. */}
        {(() => {
          const showPill =
            !frozen &&
            currentPrice != null &&
            Math.abs(currentPrice - baselinePrice) >= 0.005
          const delta = currentPrice != null ? currentPrice - baselinePrice : 0
          const abs = Math.abs(delta)
          const isUp = delta > 0

          const pill = (
            <div
              className={cn(
                'flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold tabular-nums',
                isUp
                  ? 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20'
                  : 'bg-rose-500/10 text-rose-400 ring-1 ring-rose-500/20',
              )}
              aria-label={`Delta from baseline: ${isUp ? '+' : '-'}$${abs.toFixed(2)}`}
            >
              <span>{isUp ? '↑' : '↓'}</span>
              <span>{isUp ? '+' : '-'}${abs.toFixed(2)}</span>
            </div>
          )

          if (hideChart) {
            // Sidebar stacked mode — row with optional flanking rules.
            return (
              <div className="flex items-center gap-2 w-full">
                <div className="h-px flex-1 bg-surface-700/40" />
                {showPill ? pill : null}
                <div className="h-px flex-1 bg-surface-700/40" />
              </div>
            )
          }
          // Hero/chart mode — pill replaces the vertical divider, falls back
          // to a plain vertical line if delta isn't meaningful yet.
          return showPill ? pill : <div className="h-7 w-px bg-surface-700/40" />
        })()}
        <div>
          <div className="text-[11px] uppercase tracking-wider text-surface-400 flex items-center gap-1">
            {frozen ? 'Final Price' : 'Current Price'}
            {frozen && (
              <span className="text-amber-400 ml-1">LOCKED</span>
            )}
          </div>
          <div
            className={cn(
              'text-base font-bold tabular-nums',
              direction === 'UP' && 'text-emerald-400',
              direction === 'DOWN' && 'text-rose-400',
              direction === 'EVEN' && 'text-white',
              direction == null && 'text-surface-500',
            )}
          >
            {/* Price stays at the dot-chart value once frozen — same value
                backend uses in the resolve tx, so no "waiting for oracle" UI. */}
            {(() => {
              // Use latest tick price for display to stay in sync with chart dot
              const displayPrice = ticks.length > 0 ? ticks[ticks.length - 1].price : currentPrice
              return displayPrice != null
                ? `$${displayPrice.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}`
                : '—'
            })()}
          </div>
        </div>
      </div>

      {/* Chart */}
      {!hideChart && (
        <div className="px-3 py-2 flex-1 min-h-0 relative">
          <canvas
            ref={canvasRef}
            className="w-full h-full block"
            style={{ width: '100%', minHeight: '180px' }}
          />
        </div>
      )}

      {/* Bet UI — two render modes:
          - hideChart=true  → FAMM-style vertical layout (sidebar embed)
          - hideChart=false → compact row layout (dashboard hero overlay)
          Both share handleBet, busy, betAmount, and selectedSide state. */}
      {!hideBetUI && isActive && (() => {
        const amountAleo = parseFloat(betAmount) || 0
        const amountMicro = Math.round(amountAleo * 1_000_000)
        const fee = Math.floor(amountMicro * 50 / 10000)
        const toPool = amountMicro - fee

        // Pool state for odds calculation
        const upTotal = Number(pool?.reserveUp ?? 0n) // total_up_amount in v8
        const dnTotal = Number(pool?.reserveDown ?? 0n) // total_down_amount in v8
        const totalPool = upTotal + dnTotal

        // Implied odds (what you'd get per share if you're sole winner)
        // Potential payout if you bet on selected side
        const calcPayout = (side: 'UP' | 'DOWN') => {
          if (amountAleo <= 0) return 0
          const myAmount = toPool
          const sideTotal = side === 'UP' ? upTotal + myAmount : dnTotal + myAmount
          const newPool = totalPool + toPool
          if (sideTotal === 0) return 0
          return (myAmount / sideTotal) * newPool / 1_000_000
        }

        const upPayout = calcPayout('UP')
        const dnPayout = calcPayout('DOWN')
        const upPct = totalPool > 0 ? (upTotal / totalPool) * 100 : 50
        const dnPct = totalPool > 0 ? (dnTotal / totalPool) * 100 : 50

        // ═══ FAMM-STYLE VERTICAL LAYOUT (sidebar) ═══
        if (hideChart) {
          const activeSide = selectedSide
          const selectedPayout = activeSide === 'UP' ? upPayout : activeSide === 'DOWN' ? dnPayout : 0
          return (
            <div className="px-4 pb-5 pt-3 space-y-4">
              {/* Select Outcome */}
              <div>
                <label className="text-sm text-surface-400 mb-2 block">Select Outcome</label>
                <div className="grid grid-cols-2 gap-2">
                  {/* UP card */}
                  <button
                    onClick={() => setSelectedSide('UP')}
                    className={cn(
                      'relative flex flex-col items-center justify-center py-3 rounded-xl font-bold transition-all overflow-hidden border',
                      selectedSide === 'UP'
                        ? 'bg-emerald-500/20 border-emerald-500/60 ring-2 ring-emerald-500/30'
                        : 'bg-emerald-500/[0.06] border-emerald-500/25 hover:bg-emerald-500/10',
                    )}
                  >
                    {totalPool > 0 && (
                      <div
                        className="absolute inset-y-0 left-0 bg-emerald-500/10"
                        style={{ width: `${upPct}%` }}
                      />
                    )}
                    {selectedSide === 'UP' && (
                      <CheckCircle2 className="absolute top-1.5 right-1.5 w-4 h-4 text-emerald-400" />
                    )}
                    <div className="relative flex items-center gap-1 text-[10px] text-surface-400 uppercase tracking-wider mb-0.5">
                      <TrendingUp className="w-3 h-3" /> Yes Up
                    </div>
                    <div className="relative text-xl font-bold text-emerald-400 tabular-nums">
                      {upPct.toFixed(0)}%
                    </div>
                  </button>

                  {/* DOWN card */}
                  <button
                    onClick={() => setSelectedSide('DOWN')}
                    className={cn(
                      'relative flex flex-col items-center justify-center py-3 rounded-xl font-bold transition-all overflow-hidden border',
                      selectedSide === 'DOWN'
                        ? 'bg-rose-500/20 border-rose-500/60 ring-2 ring-rose-500/30'
                        : 'bg-rose-500/[0.06] border-rose-500/25 hover:bg-rose-500/10',
                    )}
                  >
                    {totalPool > 0 && (
                      <div
                        className="absolute inset-y-0 left-0 bg-rose-500/10"
                        style={{ width: `${dnPct}%` }}
                      />
                    )}
                    {selectedSide === 'DOWN' && (
                      <CheckCircle2 className="absolute top-1.5 right-1.5 w-4 h-4 text-rose-400" />
                    )}
                    <div className="relative flex items-center gap-1 text-[10px] text-surface-400 uppercase tracking-wider mb-0.5">
                      <TrendingDown className="w-3 h-3" /> Yes Down
                    </div>
                    <div className="relative text-xl font-bold text-rose-400 tabular-nums">
                      {dnPct.toFixed(0)}%
                    </div>
                  </button>
                </div>
              </div>

              {/* Amount input */}
              {selectedSide && (
                <div>
                  <label className="text-sm text-surface-400 mb-2 block">Amount (ALEO)</label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0.01"
                      step="0.1"
                      value={betAmount}
                      onChange={(e) => setBetAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-4 py-3 pr-14 rounded-lg bg-surface-800/40 border border-surface-700/30 text-white text-base font-semibold tabular-nums focus:outline-none focus:border-brand-400/50"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-surface-400 font-medium">
                      ALEO
                    </span>
                  </div>

                  {/* Quick amount buttons */}
                  <div className="flex flex-wrap gap-2 mt-3">
                    {[1, 5, 10, 25, 50, 100].map(v => (
                      <button
                        key={v}
                        onClick={() => setBetAmount(String(v))}
                        className={cn(
                          'px-3 py-1.5 rounded-lg text-xs font-medium transition-all active:scale-95',
                          parseFloat(betAmount) === v
                            ? 'bg-brand-400 text-white'
                            : 'bg-white/[0.03] text-surface-400 hover:text-white hover:bg-white/[0.06]',
                        )}
                      >
                        {v}
                      </button>
                    ))}
                  </div>

                  {/* Info stack */}
                  <div className="mt-3 space-y-1 text-[11px] text-surface-500">
                    <div className="flex items-center justify-between">
                      <span>Protocol Fee (0.5%)</span>
                      <span className="tabular-nums text-surface-400">{(fee / 1_000_000).toFixed(4)} ALEO</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Minimum trade</span>
                      <span className="tabular-nums text-surface-400">0.001 ALEO</span>
                    </div>
                    {amountAleo > 0 && selectedPayout > 0 && (
                      <div className="flex items-center justify-between pt-1 border-t border-surface-700/30">
                        <span>Potential payout (if wins)</span>
                        <span
                          className={cn(
                            'tabular-nums font-bold',
                            activeSide === 'UP' ? 'text-emerald-400' : 'text-rose-400',
                          )}
                        >
                          {selectedPayout.toFixed(3)} ALEO
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Main submit button */}
              <button
                onClick={() => selectedSide && handleBet(selectedSide)}
                disabled={!selectedSide || busy != null || amountAleo <= 0}
                className={cn(
                  'w-full py-3.5 rounded-xl font-bold text-base transition-all flex items-center justify-center gap-2',
                  selectedSide && amountAleo > 0 && busy == null
                    ? selectedSide === 'UP'
                      ? 'bg-emerald-500 hover:bg-emerald-400 text-white active:scale-[0.98]'
                      : 'bg-rose-500 hover:bg-rose-400 text-white active:scale-[0.98]'
                    : 'bg-white/[0.04] text-surface-500 cursor-not-allowed',
                )}
              >
                {busy != null ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Processing…
                  </>
                ) : !selectedSide ? (
                  'Select Outcome & Amount'
                ) : amountAleo <= 0 ? (
                  'Enter Amount'
                ) : (
                  <>
                    <ShoppingCart className="w-4 h-4" />
                    Buy {selectedSide} Shares
                  </>
                )}
              </button>

              {/* Privacy notice */}
              <p className="text-[11px] text-surface-500 text-center leading-relaxed">
                Your trade is encrypted with zero-knowledge proofs. Only you can see your position.
              </p>

              {/* Error / tx display */}
              {errorMsg && (
                <div className="text-[11px] text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
                  {errorMsg}
                </div>
              )}
              {lastTxId && (
                <div className="text-[11px] text-emerald-400 text-center">
                  Submitted:{' '}
                  <a
                    href={`https://testnet.explorer.provable.com/transaction/${lastTxId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    {lastTxId.slice(0, 16)}…
                  </a>
                </div>
              )}
            </div>
          )
        }

        // ═══ COMPACT ROW LAYOUT (dashboard hero) ═══
        return (
        <div className="px-4 pb-4 space-y-3">
          {/* Total pool tiny indicator */}
          {totalPool > 0 && (
            <div className="text-[10px] text-surface-500 text-center tabular-nums">
              Pool: {(totalPool / 1_000_000).toFixed(2)} ALEO
            </div>
          )}

          {/* Amount input */}
          {/* Single row: buy UP + buy DOWN + amount input + chart toggle */}
          <div className="flex items-stretch gap-2 mt-8">
            {/* Buy UP */}
            <button
              disabled={busy != null || amountAleo <= 0}
              onClick={() => handleBet('UP')}
              className={cn(
                'group relative flex-1 flex flex-col items-center justify-center gap-0 py-1 rounded-lg font-bold transition-all overflow-hidden',
                'bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              {totalPool > 0 && (
                <div
                  className="absolute inset-y-0 left-0 bg-emerald-500/10 transition-all duration-500"
                  style={{ width: `${upPct}%` }}
                />
              )}
              {totalPool > 0 && (
                <div className="absolute top-0.5 right-1.5 text-[8px] font-bold text-emerald-300/70 tabular-nums">
                  {upPct.toFixed(0)}%
                </div>
              )}
              <div className="relative flex items-center gap-1 text-emerald-400 leading-tight">
                {busy === 'UP' ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <TrendingUp className="w-3 h-3" />
                )}
                <span className="text-[13px]">Buy UP</span>
              </div>
              {amountAleo > 0 && upPayout > 0 && (
                <div className="relative text-[10px] text-emerald-300/80 tabular-nums leading-tight">
                  Win {upPayout.toFixed(3)} · ×{(upPayout / amountAleo).toFixed(2)}
                </div>
              )}
            </button>

            {/* Buy DOWN */}
            <button
              disabled={busy != null || amountAleo <= 0}
              onClick={() => handleBet('DOWN')}
              className={cn(
                'group relative flex-1 flex flex-col items-center justify-center gap-0 py-1 rounded-lg font-bold transition-all overflow-hidden',
                'bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              {totalPool > 0 && (
                <div
                  className="absolute inset-y-0 left-0 bg-rose-500/10 transition-all duration-500"
                  style={{ width: `${dnPct}%` }}
                />
              )}
              {totalPool > 0 && (
                <div className="absolute top-0.5 right-1.5 text-[8px] font-bold text-rose-300/70 tabular-nums">
                  {dnPct.toFixed(0)}%
                </div>
              )}
              <div className="relative flex items-center gap-1 text-rose-400 leading-tight">
                {busy === 'DOWN' ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <TrendingDown className="w-3 h-3" />
                )}
                <span className="text-[13px]">Buy DOWN</span>
              </div>
              {amountAleo > 0 && dnPayout > 0 && (
                <div className="relative text-[10px] text-rose-300/80 tabular-nums leading-tight">
                  Win {dnPayout.toFixed(3)} · ×{(dnPayout / amountAleo).toFixed(2)}
                </div>
              )}
            </button>

            {/* Amount input + quick buttons — right side */}
            <div className="bg-surface-800/40 border border-surface-700/30 rounded-lg px-1.5 py-1 flex flex-col items-center justify-center gap-0.5 min-w-[78px]">
              <input
                type="number"
                min="0.01"
                step="0.1"
                value={betAmount}
                onChange={(e) => setBetAmount(e.target.value)}
                className="w-12 bg-transparent text-xs text-white font-bold tabular-nums text-center focus:outline-none leading-tight"
                placeholder="1"
              />
              <span className="text-[8px] text-surface-400 leading-none">ALEO</span>
              <div className="flex gap-0.5">
                {[1, 5, 10].map(v => (
                  <button
                    key={v}
                    onClick={() => setBetAmount(String(v))}
                    className="px-1 py-[1px] rounded bg-surface-700/40 text-[8px] text-surface-300 hover:bg-surface-700/60 transition-colors tabular-nums"
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            {/* Chart type toggle */}
            <div className="flex flex-col bg-surface-800/40 border border-surface-700/30 rounded-lg p-0.5 justify-center ml-auto">
              <button
                onClick={() => setChartType('line')}
                className={cn(
                  'px-2 py-0.5 rounded text-[10px] font-medium transition-all',
                  chartType === 'line'
                    ? 'bg-brand-400/20 text-brand-300'
                    : 'text-surface-500 hover:text-surface-300',
                )}
              >
                Line
              </button>
              <button
                onClick={() => setChartType('candle')}
                className={cn(
                  'px-2 py-0.5 rounded text-[10px] font-medium transition-all',
                  chartType === 'candle'
                    ? 'bg-brand-400/20 text-brand-300'
                    : 'text-surface-500 hover:text-surface-300',
                )}
              >
                Candle
              </button>
            </div>
          </div>

          {/* Fee row */}
          <div className="text-[10px] text-surface-500 text-right tabular-nums">
            Fee: {(fee / 1_000_000).toFixed(3)} ALEO
          </div>
          {errorMsg && (
            <div className="text-[11px] text-rose-400 bg-rose-500/10 rounded px-2 py-1">
              {errorMsg}
            </div>
          )}
          {lastTxId && (
            <div className="text-[11px] text-emerald-400">
              Submitted:{' '}
              <a
                href={`https://testnet.explorer.provable.com/transaction/${lastTxId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                {lastTxId.slice(0, 16)}…
              </a>
            </div>
          )}
        </div>
        )
      })()}

      {/* Resolved closing summary — lives with the chart (main area) */}
      {!hideChart && showResolved && (
        <div className="px-4 pb-4">
          <div className="bg-surface-900/60 rounded-lg p-3 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-surface-400">Baseline:</span>
              <span className="text-white tabular-nums">${baselinePrice.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-surface-400">Closing:</span>
              <span className="text-white tabular-nums">${closingPrice!.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-surface-400">Move:</span>
              <span
                className={cn(
                  'tabular-nums font-semibold',
                  winningOutcome === 'UP' ? 'text-emerald-400' : 'text-rose-400',
                )}
              >
                {winningOutcome === 'UP' ? '+' : ''}
                {(((closingPrice! - baselinePrice) / baselinePrice) * 100).toFixed(3)}%
              </span>
            </div>
            <div className="pt-1 border-t border-surface-700/30 mt-1">
              <a
                href={`/verify/turbo/${marketId}`}
                className="text-blue-400/70 hover:text-blue-400 text-[11px]"
              >
                Verify on-chain attestation →
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Claim section (resolved or cancelled) — lives with the bet UI
          (sidebar) so the whole trading flow stays in one column. */}
      {!hideBetUI && (showResolved || showCancelled) && (
        <div className="px-4 pb-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-surface-400">
            <span>Your shares</span>
            <button
              onClick={refreshShares}
              className="text-blue-400/70 hover:text-blue-400 text-[11px]"
            >
              Refresh
            </button>
          </div>
          {shares == null && (
            <div className="text-[11px] text-surface-500 flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> Loading records…
            </div>
          )}
          {shares != null && shares.length === 0 && !pasteMode && (
            <div className="text-[11px] text-surface-500">
              No share records found in your wallet.{' '}
              <button
                onClick={() => setPasteMode(true)}
                className="text-blue-400 hover:underline"
              >
                Paste record manually
              </button>
            </div>
          )}
          {pasteMode && (
            <div className="space-y-2">
              <textarea
                value={pastedRecord}
                onChange={(e) => setPastedRecord(e.target.value)}
                placeholder="{ owner: aleo1..., market_id: ...field, side: 1u8, quantity: ...u128, share_nonce: ...field }"
                className="w-full bg-surface-800/60 border border-surface-700/40 rounded-lg px-2 py-1 text-[10px] text-white font-mono h-20 focus:outline-none focus:border-surface-600"
              />
              <div className="flex gap-2">
                <button
                  onClick={addPastedShare}
                  className="px-3 py-1 rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 text-[11px] font-semibold"
                >
                  Add
                </button>
                <button
                  onClick={() => { setPasteMode(false); setPastedRecord(''); setErrorMsg(null) }}
                  className="px-3 py-1 rounded bg-surface-800 text-surface-400 hover:bg-surface-700 text-[11px]"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          {shares?.map((s, i) => {
            const isWinner = showResolved && winningOutcome === s.side
            const isRefundable = showCancelled
            const eligible = isWinner || isRefundable
            const payout =
              isWinner && marketCredits != null && pool
                ? quotePayout(
                    marketCredits,
                    winningOutcome === 'UP' ? pool.totalUpShares : pool.totalDownShares,
                    s.quantity,
                  )
                : isRefundable
                  ? s.quantity
                  : 0n
            return (
              <div
                key={i}
                className="flex items-center justify-between gap-2 bg-surface-800/40 rounded-lg px-3 py-2 text-xs"
              >
                <div className="tabular-nums">
                  <span
                    className={cn(
                      'font-bold',
                      s.side === 'UP' ? 'text-emerald-400' : 'text-rose-400',
                    )}
                  >
                    {s.side}
                  </span>{' '}
                  <span className="text-surface-300">
                    {(Number(s.quantity) / 1_000_000).toFixed(3)} shares
                  </span>
                  {eligible && (
                    <span className="text-emerald-300 ml-2">
                      → {(Number(payout) / 1_000_000).toFixed(3)} ALEO
                    </span>
                  )}
                </div>
                <button
                  disabled={!eligible || claimBusy}
                  onClick={() => handleClaim(s)}
                  className={cn(
                    'px-3 py-1 rounded font-semibold text-[11px] transition-colors',
                    eligible
                      ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
                      : 'bg-surface-800 text-surface-600 cursor-not-allowed',
                  )}
                >
                  {claimBusy ? '…' : isRefundable ? 'Refund' : isWinner ? 'Claim' : 'Lost'}
                </button>
              </div>
            )
          })}
          {errorMsg && (
            <div className="text-[11px] text-rose-400 bg-rose-500/10 rounded px-2 py-1">
              {errorMsg}
            </div>
          )}
          {lastTxId && (
            <div className="text-[11px] text-emerald-400">
              Submitted:{' '}
              <a
                href={`https://explorer.provable.com/testnet/transaction/${lastTxId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                {lastTxId.slice(0, 16)}…
              </a>
            </div>
          )}
        </div>
      )}

    </div>
  )
}
