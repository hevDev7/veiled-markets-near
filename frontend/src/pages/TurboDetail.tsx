// ============================================================================
// /turbo/:symbol — Turbo market detail page (FAMM-style layout)
// ============================================================================
// Shows one symbol's rolling 5-minute markets with the same layout as the
// standard FAMM MarketDetail page:
//   - Back button
//   - Grid 2/3 main + 1/3 sidebar
//   - Main: market header card → rolling view → content tabs (Chart/Activity).
//     Rules text lives directly below the live chart in the Chart tab (no
//     longer a standalone tab) — users see resolution rules without needing
//     to switch tabs.
//   - Sidebar: recent results
// ============================================================================

import { useParams, useNavigate, Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { TurboRollingView } from '@/components/TurboRollingView'
import type { TurboSymbol } from '@/components/TurboMarketPanel'
import { DashboardHeader } from '@/components/DashboardHeader'
import { Footer } from '@/components/Footer'
import {
  ArrowLeft, TrendingUp, TrendingDown, Clock, Info, Zap, FileText, Activity,
  Share2, Check, Bookmark, BookmarkCheck, Radio, Shield, Droplets, ExternalLink,
  ChevronLeft, ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { getTransactionUrl } from '@/lib/config'

interface ResolvedEntry {
  market_id: string
  baseline_price: number
  closing_price: number
  direction: 'UP' | 'DOWN'
  timestamp: string              // resolve timestamp (ISO)
  create_tx?: string             // aleo_tx_id from create event
  resolve_tx?: string            // aleo_tx_id from resolve event
  create_timestamp?: string      // create timestamp (ISO)
  create_block?: number          // aleo block height at create
  resolve_block?: number         // aleo block height at resolve
}

type TabId = 'chart' | 'activity'

const SYMBOL_NAMES: Record<string, string> = {
  BTC: 'Bitcoin', ETH: 'Ethereum', SOL: 'Solana', DOGE: 'Dogecoin',
  XRP: 'XRP', BNB: 'BNB', ADA: 'Cardano', AVAX: 'Avalanche',
  LINK: 'Chainlink', DOT: 'Polkadot',
}

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

export interface TurboDetailProps {
  /**
   * Override the symbol from URL params. Used when rendering TurboDetail
   * from within MarketDetail's /market/:marketId dispatch — there's no
   * `symbol` URL param in that case, so the parent resolves the symbol
   * from the market_id (via getTurboSymbolFromMarketId) and passes it in.
   */
  symbolOverride?: TurboSymbol
}

interface TurboCurrentMarket {
  market_id: string
  symbol: string
  baseline_price: number
  deadline: string
  deadline_ms?: number
  status: 'active' | 'resolving' | 'resolved'
  closing_price?: number
}

export function TurboDetail({ symbolOverride }: TurboDetailProps = {}) {
  const { symbol: rawSymbol } = useParams<{ symbol: string }>()
  const navigate = useNavigate()
  const symbol = symbolOverride ?? ((rawSymbol?.toUpperCase() || 'BTC') as TurboSymbol)
  const [history, setHistory] = useState<ResolvedEntry[]>([])
  /** Total number of resolved rounds for this symbol across ALL time,
   *  read from Supabase's Content-Range header. `history` itself is
   *  capped at 20 rows for UI display, so `history.length` can't be used
   *  as the real total once the backend has resolved more than that. */
  const [totalRoundsCount, setTotalRoundsCount] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<TabId>('chart')
  const [isBookmarked, setIsBookmarked] = useState<boolean>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('veiled_turbo_bookmarks') || '[]') as string[]
      return saved.includes(symbol)
    } catch { return false }
  })
  const [linkCopied, setLinkCopied] = useState(false)
  const [currentMarket, setCurrentMarket] = useState<TurboCurrentMarket | null>(null)
  const [marketIdCopied, setMarketIdCopied] = useState(false)
  /** aleo_tx_id of the create_market_turbo tx for the *currently active*
   *  market. Resolved history rows already carry their own create_tx (joined
   *  against Supabase in the fetchHistory effect below), but the live market
   *  isn't in that list — it hasn't resolved yet — so we query Supabase
   *  separately by its market_id. Used for the "Verify On-Chain" CTA. */
  const [currentCreateTx, setCurrentCreateTx] = useState<string | null>(null)
  /** 1-indexed page for the History tab pagination (10 rows per page). */
  const [historyPage, setHistoryPage] = useState(1)

  // Poll current rolling market state for the sidebar "Market Info" card.
  // Reads from backend /chain/symbol (same source TurboRollingView uses), so
  // the info card stays in sync with the trading panel without duplicate
  // logic. Polls every 10s — enough to catch market chain transitions.
  useEffect(() => {
    let cancelled = false
    const ORACLE_URL = (import.meta as any).env?.VITE_TURBO_ORACLE_URL || 'http://localhost:4090'
    const fetchMarket = async () => {
      try {
        const res = await fetch(`${ORACLE_URL}/chain/symbol?symbol=${symbol}`)
        if (!res.ok) return
        const m = (await res.json()) as TurboCurrentMarket
        if (!cancelled) setCurrentMarket(m)
      } catch {}
    }
    fetchMarket()
    const id = setInterval(fetchMarket, 10_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [symbol])

  // Poll resolved history from backend.
  //
  // We fetch BOTH create and resolve events so every history entry can link
  // to its on-chain create tx AND resolve tx — users verify the full round
  // (baseline was committed, then closing was settled) in the Aleo explorer.
  // Rows are joined by market_id.
  useEffect(() => {
    let cancelled = false
    const fetchHistory = async () => {
      try {
        const SBURL = (import.meta as any).env?.VITE_SUPABASE_URL || ''
        const SBKEY = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || ''
        if (!SBURL || !SBKEY) {
          console.warn('[turbo-history] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY not set')
          return
        }
        const headers = { apikey: SBKEY, authorization: `Bearer ${SBKEY}` }

        // Pull a large page of resolves so the History tab's client-side
        // pagination can walk back through the full testnet run. 500 rows
        // ≈ 1.7 days of rolling 5-minute rounds, which covers typical dev
        // sessions. `Prefer: count=exact` still gives us the true DB total
        // in the Content-Range header so the summary card ("X total rounds")
        // stays accurate even if the user has more than 500 historical
        // rounds. Create events are pulled 2× so the market_id join below
        // doesn't miss any resolve.
        const RESOLVE_FETCH_LIMIT = 500
        const CREATE_FETCH_LIMIT = 1000
        const [resolveRes, createRes] = await Promise.all([
          fetch(
            `${SBURL}/rest/v1/turbo_oracle_audit?event=eq.resolve&symbol=eq.${symbol}&order=created_at.desc&limit=${RESOLVE_FETCH_LIMIT}`,
            { headers: { ...headers, Prefer: 'count=exact' } },
          ),
          fetch(
            `${SBURL}/rest/v1/turbo_oracle_audit?event=eq.create&symbol=eq.${symbol}&order=created_at.desc&limit=${CREATE_FETCH_LIMIT}`,
            { headers },
          ),
        ])
        if (!resolveRes.ok || !createRes.ok) {
          // console.error(
            `[turbo-history] supabase fetch failed — resolve=${resolveRes.status} create=${createRes.status}`,
            !resolveRes.ok ? await resolveRes.text() : '',
            !createRes.ok ? await createRes.text() : '',
          )
          return
        }
        // Parse Content-Range header set by Supabase (present because of
        // our `Prefer: count=exact` request). Format: "0-19/543" where 543
        // is the total count of matching rows. Falls back to the fetched
        // row count if the header is missing or malformed.
        const contentRange = resolveRes.headers.get('content-range') || ''
        const totalFromHeader = (() => {
          const parts = contentRange.split('/')
          const n = parts.length === 2 ? parseInt(parts[1], 10) : NaN
          return Number.isFinite(n) ? n : null
        })()

        const resolveRows = (await resolveRes.json()) as any[]
        const createRows = (await createRes.json()) as any[]
        // devLog('[turbo-history]' + ${symbol}: ${resolveRows.length} resolve rows (of ${totalFromHeader ?? '?'} total), ${createRows.length} create rows`)
        if (cancelled) return

        setTotalRoundsCount(totalFromHeader ?? resolveRows.length)

        // Build a lookup: market_id → create event row. Create events are
        // pulled with a bigger limit so we don't miss the matching create
        // for each resolve (resolves come later so the create for a given
        // resolve is always older — fetching 2× resolves' limit is safe).
        const createByMarketId = new Map<string, any>()
        for (const c of createRows) {
          if (c.market_id && !createByMarketId.has(c.market_id)) {
            createByMarketId.set(c.market_id, c)
          }
        }

        setHistory(resolveRows.map(r => {
          const createRow = createByMarketId.get(r.market_id)
          // Prefer the baseline from the resolve row's metadata (always
          // written by the backend), fall back to the create row's
          // pyth_price which is the baseline_price captured at creation.
          const baseline = Number(
            r.metadata?.baseline_price ?? createRow?.pyth_price ?? 0,
          )
          const closing = Number(r.pyth_price)
          return {
            market_id: r.market_id,
            baseline_price: baseline,
            closing_price: closing,
            direction: closing > baseline ? 'UP' : 'DOWN',
            timestamp: r.created_at,
            create_tx: createRow?.aleo_tx_id,
            resolve_tx: r.aleo_tx_id,
            create_timestamp: createRow?.created_at,
            create_block: createRow?.aleo_block != null ? Number(createRow.aleo_block) : undefined,
            resolve_block: r.aleo_block != null ? Number(r.aleo_block) : undefined,
          } satisfies ResolvedEntry
        }))
      } catch {}
    }
    fetchHistory()
    const id = setInterval(fetchHistory, 30_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [symbol])

  // Fetch the create_tx for the current active market from Supabase.
  // The oracle's /chain/symbol endpoint doesn't surface the Aleo tx_id of
  // the create_market_turbo call, but the backend audit log does. Query a
  // single row scoped by market_id — the create event is written within a
  // few seconds of the on-chain create tx finalising, so in the normal case
  // this returns immediately. Re-runs whenever the rolling chain rotates
  // to a new market.
  useEffect(() => {
    const marketId = currentMarket?.market_id
    if (!marketId || marketId.startsWith('pending_')) {
      setCurrentCreateTx(null)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const SBURL = (import.meta as any).env?.VITE_SUPABASE_URL || ''
        const SBKEY = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || ''
        if (!SBURL || !SBKEY) return
        const headers = { apikey: SBKEY, authorization: `Bearer ${SBKEY}` }
        const res = await fetch(
          `${SBURL}/rest/v1/turbo_oracle_audit?event=eq.create&market_id=eq.${encodeURIComponent(marketId)}&select=aleo_tx_id&limit=1`,
          { headers },
        )
        if (!res.ok) return
        const rows = (await res.json()) as Array<{ aleo_tx_id?: string }>
        const tx = rows?.[0]?.aleo_tx_id
        if (!cancelled) setCurrentCreateTx(tx && tx !== 'unknown' ? tx : null)
      } catch {
        /* best-effort — button falls back to hidden */
      }
    })()
    return () => { cancelled = true }
  }, [currentMarket?.market_id])

  // Compute simple stats from history
  const totalMarkets = history.length
  const upCount = history.filter(h => h.direction === 'UP').length
  const upPct = totalMarkets > 0 ? ((upCount / totalMarkets) * 100).toFixed(0) : '—'

  // ── History tab pagination (15 rows per page) ──────────────────────────
  // Written generically so raising the Supabase limit later (or switching to
  // cursor pagination) doesn't require re-working the UI. Clamp on refetch
  // guards the case where a fresh poll returns fewer rows than before — the
  // current page would otherwise point past the end and render nothing.
  const HISTORY_PAGE_SIZE = 15
  const historyTotalPages = Math.max(
    1,
    Math.ceil(history.length / HISTORY_PAGE_SIZE),
  )
  useEffect(() => {
    if (historyPage > historyTotalPages) setHistoryPage(historyTotalPages)
  }, [historyPage, historyTotalPages])
  // Reset paging when the user switches to a different symbol — different
  // asset, different history, so starting at page 1 is the least surprising.
  useEffect(() => {
    setHistoryPage(1)
  }, [symbol])
  const historyStart = (historyPage - 1) * HISTORY_PAGE_SIZE
  const historyEnd = historyStart + HISTORY_PAGE_SIZE
  const paginatedHistory = history.slice(historyStart, historyEnd)

  const shareUrl = typeof window !== 'undefined' ? window.location.href : ''
  const marketTitle = `${SYMBOL_NAMES[symbol]} Up or Down — 5 Minutes`

  return (
    <div className="min-h-screen bg-surface-950 text-white flex flex-col">
      <DashboardHeader />

      <main className="flex-1 pt-20">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-8">

          {/* Back Button */}
          <motion.button
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 text-surface-400 hover:text-white transition-colors mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Markets</span>
          </motion.button>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

            {/* ═══ MAIN CONTENT (2/3 width) ═══ */}
            <div className="lg:col-span-2 space-y-6">

              {/* Market Header Card */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-card p-6"
              >
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="px-3 py-1 text-sm font-medium rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-400">
                      Turbo
                    </span>
                    <span className="px-3 py-1 text-sm font-medium rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-400">
                      Crypto
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <Radio className="w-3 h-3 animate-pulse" />
                      Live
                    </span>
                  </div>
                </div>

                <div className="flex gap-3 mb-4">
                  <div className="w-11 h-11 rounded-xl overflow-hidden shrink-0 border border-white/[0.06] bg-surface-800">
                    <img
                      src={SYMBOL_LOGOS[symbol]}
                      alt={symbol}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                  <div className="flex-1">
                    <h1 className="text-base md:text-lg font-semibold text-white leading-snug">
                      {marketTitle}
                    </h1>
                    <p className="text-xs text-surface-400 mt-1">
                      Rolling 5-minute {SYMBOL_NAMES[symbol]}/USD prediction markets · Pyth-resolved · Auto-chaining
                    </p>
                  </div>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 rounded-xl bg-white/[0.02]">
                    <div className="flex items-center gap-2 text-surface-400 text-sm mb-1">
                      <TrendingUp className="w-4 h-4" />
                      <span>Total Rounds</span>
                    </div>
                    <p className="text-lg font-bold text-white tabular-nums">
                      {/* Prefer the exact count from Supabase's
                          Content-Range header; fall back to the local
                          fetched-rows length if the header wasn't
                          available (shouldn't normally happen). */}
                      {totalRoundsCount ?? totalMarkets}
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-white/[0.02]">
                    <div className="flex items-center gap-2 text-surface-400 text-sm mb-1">
                      <Droplets className="w-4 h-4" />
                      <span>UP Ratio</span>
                    </div>
                    <p className="text-lg font-bold text-emerald-400 tabular-nums">
                      {upPct}{upPct !== '—' ? '%' : ''}
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-white/[0.02]">
                    <div className="flex items-center gap-2 text-surface-400 text-sm mb-1">
                      <Clock className="w-4 h-4" />
                      <span>Duration</span>
                    </div>
                    <p className="text-lg font-bold text-white">5 min</p>
                  </div>
                  <div className="p-4 rounded-xl bg-white/[0.02]">
                    <div className="flex items-center gap-2 text-surface-400 text-sm mb-1">
                      <Shield className="w-4 h-4" />
                      <span>Oracle</span>
                    </div>
                    <p className="text-lg font-bold text-amber-400">Pyth</p>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-3 mt-6 pt-6 border-t border-white/[0.04]">
                  <button
                    onClick={async () => {
                      if (navigator.share) {
                        try { await navigator.share({ title: marketTitle, url: shareUrl }) } catch {}
                      } else {
                        await navigator.clipboard.writeText(shareUrl)
                        setLinkCopied(true)
                        setTimeout(() => setLinkCopied(false), 2000)
                      }
                    }}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs text-surface-400 hover:text-white hover:bg-white/[0.04] transition-all duration-200"
                  >
                    {linkCopied ? <Check className="w-3.5 h-3.5 text-yes-400" /> : <Share2 className="w-3.5 h-3.5" />}
                    {linkCopied ? 'Copied!' : 'Share'}
                  </button>
                  <button
                    onClick={() => {
                      try {
                        const saved = JSON.parse(localStorage.getItem('veiled_turbo_bookmarks') || '[]') as string[]
                        const updated = isBookmarked
                          ? saved.filter(id => id !== symbol)
                          : [...saved, symbol]
                        localStorage.setItem('veiled_turbo_bookmarks', JSON.stringify(updated))
                        setIsBookmarked(!isBookmarked)
                      } catch {}
                    }}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs text-surface-400 hover:text-white hover:bg-white/[0.04] transition-all duration-200"
                  >
                    {isBookmarked ? <BookmarkCheck className="w-3.5 h-3.5 text-yellow-400" /> : <Bookmark className="w-3.5 h-3.5" />}
                    {isBookmarked ? 'Saved' : 'Watchlist'}
                  </button>
                </div>
              </motion.div>

              {/* Content Tabs: Chart | Activity */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="glass-card overflow-hidden"
              >
                {/* Tab bar */}
                <div className="flex items-center gap-1 p-1.5 mx-4 mt-4 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                  {[
                    { id: 'chart' as const, label: 'Live Market', icon: Activity },
                    { id: 'activity' as const, label: 'History', icon: Zap },
                  ].map(tab => {
                    const Icon = tab.icon
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={cn(
                          'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all',
                          activeTab === tab.id
                            ? 'bg-white/[0.06] text-white'
                            : 'text-surface-400 hover:text-white hover:bg-white/[0.03]',
                        )}
                      >
                        <Icon className="w-4 h-4" />
                        <span>{tab.label}</span>
                      </button>
                    )
                  })}
                </div>

                {/* Tab content */}
                <div className="p-4">
                  {activeTab === 'chart' && (
                    <>
                      <div className="min-h-[500px] rounded-xl overflow-hidden border border-white/[0.04]">
                        <TurboRollingView symbol={symbol} hideBetUI className="h-full" />
                      </div>

                      {/* Resolution rules — previously a standalone "Rules"
                          tab; moved here so users see settlement rules
                          without having to switch tabs away from the live
                          chart. Visually separated with a top border. */}
                      <div className="space-y-4 text-[15px] text-surface-300 leading-relaxed pt-5 mt-5 border-t border-white/[0.04]">
                        <div className="flex items-start gap-3">
                          <Info className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                          <p>
                            This market will resolve to <span className="font-bold text-emerald-400">"Up"</span> if
                            the {SYMBOL_NAMES[symbol]} price at the end of the time range specified in the title
                            is greater than or equal to the price at the beginning of that range. Otherwise, it
                            will resolve to <span className="font-bold text-rose-400">"Down"</span>.
                          </p>
                        </div>
                        <div className="flex items-start gap-3">
                          <Shield className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                          <p>
                            The resolution source for this market is information from{' '}
                            <span className="font-semibold text-amber-400">Pyth Network</span>, specifically the{' '}
                            <code className="px-1.5 py-0.5 rounded bg-surface-800/60 text-[13px] text-amber-300">
                              {symbol}/USD
                            </code>{' '}
                            price feed available at{' '}
                            <a
                              href={`https://www.pyth.network/price-feeds/crypto-${symbol.toLowerCase()}-usd`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-amber-400 hover:text-amber-300 underline"
                            >
                              pyth.network/price-feeds/crypto-{symbol.toLowerCase()}-usd
                            </a>
                            .
                          </p>
                        </div>
                        <div className="flex items-start gap-3">
                          <FileText className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                          <p className="text-surface-400 text-[13px]">
                            Please note that this market is about the price according to the Pyth Network{' '}
                            {symbol}/USD price feed, not according to other sources or spot markets. Pyth Network
                            aggregates prices from 90+ institutional publishers including major exchanges,
                            market makers, and trading firms, ensuring a robust and manipulation-resistant price feed.
                          </p>
                        </div>
                      </div>
                    </>
                  )}

                  {activeTab === 'activity' && (
                    // overflow-x-auto: at narrow viewports each row would
                    // overflow the fixed-width columns; horizontal scroll
                    // keeps alignment intact instead of wrapping/squishing.
                    <div className="space-y-2 overflow-x-auto">
                      {history.length === 0 ? (
                        <div className="text-center py-12 text-sm text-surface-500">
                          No resolved markets yet. History will appear here.
                        </div>
                      ) : (
                        <>
                          {/* Column headers — widths mirror the data row
                              columns exactly so labels line up directly
                              above their values. Rendered once, outside the
                              paginatedHistory.map so it doesn't repeat per
                              row. Styled as a clearly-distinct bar (solid
                              background + bottom border + prominent text)
                              so users can identify columns at a glance
                              without confusing it for a data row. Sticky so
                              the labels stay pinned while scrolling through
                              a long history list. */}
                          <div className="sticky top-0 z-10 flex items-center gap-4 px-4 py-2.5 min-w-max text-[11px] font-bold uppercase tracking-wider text-surface-300 bg-surface-900/95 backdrop-blur-sm rounded-lg border border-white/[0.06] mb-2">
                            {/* 1. Direction icon slot (no label) */}
                            <div className="shrink-0 w-8" />
                            {/* 2. Outcome / timestamp column */}
                            <div className="shrink-0 w-28">Outcome</div>
                            {/* 3. Baseline price */}
                            <div className="shrink-0 w-32">Baseline Price</div>
                            {/* 4. Arrow slot (no label) */}
                            <div className="shrink-0 w-3" />
                            {/* 5. Final price */}
                            <div className="shrink-0 w-32">Final Price</div>
                            {/* 6. Pct change */}
                            <div className="shrink-0 w-24 ml-auto text-right">Change</div>
                            {/* 7. Verify — internal /verify/turbo route */}
                            <div className="shrink-0 w-14 text-center">Verify</div>
                          </div>

                          {paginatedHistory.map((h, i) => {
                          const pct = h.baseline_price > 0
                            ? ((h.closing_price - h.baseline_price) / h.baseline_price) * 100
                            : 0
                          const isUp = h.direction === 'UP'
                          // Each price gets its own dedicated explorer link:
                          //   baseline → create_market_turbo tx
                          //   final    → resolve_market tx
                          // Filter out placeholder 'unknown' values written by
                          // the backend when a tx id wasn't captured.
                          const createTx =
                            h.create_tx && h.create_tx !== 'unknown' ? h.create_tx : null
                          const resolveTx =
                            h.resolve_tx && h.resolve_tx !== 'unknown' ? h.resolve_tx : null
                          return (
                            // Fixed-width columns per cell so every row's
                            // cells land at the same x-position → visual
                            // alignment across the whole list. min-w-max
                            // pairs with the parent overflow-x-auto: on
                            // narrow viewports we scroll horizontally instead
                            // of squeezing columns out of alignment.
                            <div
                              key={h.market_id || i}
                              className={cn(
                                'flex items-center gap-4 rounded-lg px-4 py-3 border min-w-max',
                                isUp
                                  ? 'border-emerald-700/25 bg-emerald-500/[0.03]'
                                  : 'border-rose-700/25 bg-rose-500/[0.03]',
                              )}
                            >
                              {/* 1. Direction icon */}
                              <div className={cn(
                                'flex items-center justify-center w-8 h-8 rounded-full shrink-0',
                                isUp ? 'bg-emerald-500/15' : 'bg-rose-500/15',
                              )}>
                                {isUp
                                  ? <TrendingUp className="w-4 h-4 text-emerald-400" />
                                  : <TrendingDown className="w-4 h-4 text-rose-400" />}
                              </div>

                              {/* 2. UP/DOWN label with timestamp stacked
                                  underneath — one column instead of two,
                                  so the label and its timestamp travel
                                  together as a single unit. */}
                              <div className="shrink-0 w-28 flex flex-col items-start leading-tight">
                                <span className={cn(
                                  'font-semibold text-sm',
                                  isUp ? 'text-emerald-400' : 'text-rose-400',
                                )}>
                                  {isUp ? 'UP' : 'DOWN'}
                                </span>
                                <span className="text-[11px] text-surface-500 tabular-nums mt-0.5">
                                  {new Date(h.timestamp).toLocaleString([], {
                                    month: 'short', day: 'numeric',
                                    hour: '2-digit', minute: '2-digit',
                                  })}
                                </span>
                              </div>

                              {/* 3. Baseline price + create_market_turbo tx link */}
                              <div className="shrink-0 w-32 flex items-center justify-between gap-2">
                                <span
                                  className="text-xs text-surface-300 tabular-nums"
                                  title="Baseline price (at market creation)"
                                >
                                  ${h.baseline_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                                {createTx ? (
                                  <a
                                    href={getTransactionUrl(createTx)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title="View create_market_turbo tx on Aleo explorer"
                                    className="shrink-0 text-surface-500 hover:text-amber-400 transition-colors"
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                ) : (
                                  // Placeholder keeps column width stable
                                  // when create_tx is unavailable for a row.
                                  <span className="shrink-0 w-3 h-3" />
                                )}
                              </div>

                              {/* 4. Arrow separator */}
                              <span className="shrink-0 w-3 text-center text-surface-600 text-xs">→</span>

                              {/* 5. Final price + resolve_market tx link */}
                              <div className="shrink-0 w-32 flex items-center justify-between gap-2">
                                <span
                                  className={cn(
                                    'text-xs font-medium tabular-nums',
                                    isUp ? 'text-emerald-300' : 'text-rose-300',
                                  )}
                                  title="Final price (at market resolve)"
                                >
                                  ${h.closing_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                                {resolveTx ? (
                                  <a
                                    href={getTransactionUrl(resolveTx)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title="View resolve_market tx on Aleo explorer"
                                    className="shrink-0 text-surface-500 hover:text-amber-400 transition-colors"
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                ) : (
                                  <span className="shrink-0 w-3 h-3" />
                                )}
                              </div>

                              {/* 6. Pct change — pushed to the far right via
                                  ml-auto. Fixed w-24 + text-right keeps the
                                  % sign anchored to a consistent column. */}
                              <div className={cn(
                                'shrink-0 w-24 ml-auto text-right font-bold text-sm tabular-nums',
                                isUp ? 'text-emerald-400' : 'text-rose-400',
                              )}>
                                {isUp ? '+' : ''}{pct.toFixed(3)}%
                              </div>

                              {/* 7. Verify — links to the internal
                                  /verify/turbo/:marketId route in a NEW tab
                                  so the user doesn't lose their place in
                                  the history list (scroll position, active
                                  pagination page, tab state). target="_blank"
                                  on <Link> still works — react-router honors
                                  it and lets the browser open a fresh tab
                                  instead of doing SPA navigation. */}
                              <div className="shrink-0 w-14 flex items-center justify-center">
                                <Link
                                  to={`/verify/turbo/${h.market_id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="Verify market on-chain (opens in new tab)"
                                  className="p-1.5 rounded-md text-surface-500 hover:text-amber-400 hover:bg-white/5 transition-colors"
                                >
                                  <Shield className="w-3.5 h-3.5" />
                                </Link>
                              </div>
                            </div>
                          )
                          })}
                        </>
                      )}

                      {/* Pagination — only shown when there's more than one
                          page of results. Range label shows the inclusive row
                          count on the current page. */}
                      {history.length > HISTORY_PAGE_SIZE && (
                        <div className="flex items-center justify-between pt-3 mt-2 border-t border-white/[0.04]">
                          <div className="text-[11px] text-surface-500 tabular-nums">
                            Showing{' '}
                            <span className="text-surface-300 font-medium">
                              {historyStart + 1}–{Math.min(historyEnd, history.length)}
                            </span>{' '}
                            of{' '}
                            <span className="text-surface-300 font-medium">
                              {history.length}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                              disabled={historyPage <= 1}
                              aria-label="Previous page"
                              className={cn(
                                'flex items-center justify-center w-7 h-7 rounded-md border transition-colors',
                                historyPage <= 1
                                  ? 'border-white/[0.04] text-surface-600 cursor-not-allowed'
                                  : 'border-white/[0.06] text-surface-300 hover:bg-white/5 hover:text-white hover:border-white/[0.1]',
                              )}
                            >
                              <ChevronLeft className="w-3.5 h-3.5" />
                            </button>
                            <div className="px-2.5 text-[11px] text-surface-400 tabular-nums">
                              Page{' '}
                              <span className="text-white font-semibold">{historyPage}</span>
                              {' / '}
                              <span className="text-surface-300">{historyTotalPages}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setHistoryPage((p) => Math.min(historyTotalPages, p + 1))}
                              disabled={historyPage >= historyTotalPages}
                              aria-label="Next page"
                              className={cn(
                                'flex items-center justify-center w-7 h-7 rounded-md border transition-colors',
                                historyPage >= historyTotalPages
                                  ? 'border-white/[0.04] text-surface-600 cursor-not-allowed'
                                  : 'border-white/[0.06] text-surface-300 hover:bg-white/5 hover:text-white hover:border-white/[0.1]',
                              )}
                            >
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                </div>
              </motion.div>
            </div>

            {/* ═══ SIDEBAR (1/3 width) ═══ */}
            <div className="lg:col-span-1">
              <div className="sticky top-28 space-y-4">
                {/* Trading Panel — bet-only embed of TurboRollingView.
                    Replaces the old "Recent Results" card (which duplicated
                    the History tab). Mirrors the FAMM MarketDetail layout
                    where trading lives in the right sidebar alongside the
                    main chart. Same polling cadence as the chart embed, so
                    both sides stay in sync without explicit state sharing. */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="rounded-2xl overflow-hidden border border-white/[0.04]"
                >
                  <TurboRollingView symbol={symbol} hideChart />
                </motion.div>

                {/* Market Info card — mirrors the FAMM MarketDetail sidebar
                    Market Info block. Pulls live data from /chain/symbol so
                    it tracks the currently rolling turbo market for this
                    symbol. Includes a "Verify On-Chain" CTA that opens the
                    turbo verification page. */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="glass-card p-5"
                >
                  <h4 className="text-xs font-heading font-semibold text-surface-400 uppercase tracking-wider mb-4">
                    Market Info
                  </h4>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-surface-500">Market ID</span>
                      {currentMarket?.market_id ? (
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(currentMarket.market_id).catch(() => {})
                            setMarketIdCopied(true)
                            setTimeout(() => setMarketIdCopied(false), 1500)
                          }}
                          className="group flex items-center gap-1 text-xs font-medium text-white font-mono tabular-nums hover:text-amber-400 transition-colors"
                          title="Copy market ID"
                        >
                          {marketIdCopied ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" />
                              <span className="text-emerald-400">Copied</span>
                            </>
                          ) : (
                            <>
                              {currentMarket.market_id.slice(0, 8)}…{currentMarket.market_id.slice(-6)}
                            </>
                          )}
                        </button>
                      ) : (
                        <span className="text-xs text-surface-500">Loading…</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-surface-500">Symbol</span>
                      <span className="text-xs font-medium text-white">{symbol} / USD</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-surface-500">Baseline Price</span>
                      <span className="text-xs font-medium text-white tabular-nums">
                        {currentMarket?.baseline_price != null
                          ? `$${currentMarket.baseline_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-surface-500">Deadline</span>
                      <span className="text-xs font-medium text-white tabular-nums">
                        {currentMarket?.deadline_ms
                          ? new Date(currentMarket.deadline_ms).toLocaleString('en-US', {
                              year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                            })
                          : currentMarket?.deadline
                            ? `Block ${currentMarket.deadline}`
                            : '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-surface-500">Token</span>
                      <span className="text-xs font-medium text-white">ALEO</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-surface-500">Oracle</span>
                      <a
                        href={`https://www.pyth.network/price-feeds/crypto-${symbol.toLowerCase()}-usd`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1"
                      >
                        Pyth Network <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-surface-500">Fees</span>
                      <span className="text-xs font-medium text-white">0.50%</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-surface-500">Contract</span>
                      <a
                        href="https://testnet.explorer.provable.com/program/veiled_turbo_v8.aleo"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1 font-mono"
                      >
                        veiled_turbo_v8.aleo <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>

                  {/* Verify On-Chain CTA — links directly to the
                      create_market_turbo transaction for the currently active
                      market on the Provable explorer. Hidden while the create
                      tx is still loading from Supabase (typically <1s after
                      the rolling market rotates). */}
                  {currentCreateTx && (
                    <a
                      href={getTransactionUrl(currentCreateTx)}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="View create_market_turbo transaction on Provable Explorer"
                      className="mt-4 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-brand-500/8 border border-brand-500/15 text-brand-400 hover:bg-brand-500/15 hover:border-brand-500/30 transition-all text-xs font-semibold"
                    >
                      <Shield className="w-3.5 h-3.5" />
                      <span>Verify On-Chain</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </motion.div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
