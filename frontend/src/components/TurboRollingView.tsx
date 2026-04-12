// ============================================================================
// TurboRollingView — Continuous rolling 5-minute market stream
// ============================================================================
// State machine:
//   LIVE       → countdown running, Pyth streaming, buy buttons active
//   RESOLVING  → countdown at 00:00, price frozen, "RESOLVING…" + final direction
//   RESULT     → shows UP/DOWN result for 5 seconds, then auto-transitions to next
//   LOADING    → fetching next market from backend /chain/symbol endpoint
//
// The backend `rollingChainLoop` creates a new market immediately after
// resolving the previous one, using closing_price as the next baseline.
// This component polls `/chain/symbol?symbol=BTC` every 5s to detect
// when the market transitions.
// ============================================================================

import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { TurboMarketPanel, type TurboSymbol } from './TurboMarketPanel'
import { cn } from '@/lib/utils'
import { TrendingUp, TrendingDown, Loader2, Radio } from 'lucide-react'

const ORACLE_URL = (import.meta as any).env?.VITE_TURBO_ORACLE_URL || 'http://localhost:4090'
const SECS_PER_BLOCK = Number((import.meta as any).env?.VITE_ALEO_SECONDS_PER_BLOCK || 4)
const RESULT_DISPLAY_MS = 2000 // show result screen briefly before rotating to next round

interface ChainedMarket {
  market_id: string
  symbol: TurboSymbol
  baseline_price: number
  deadline: string // bigint as string
  /** Absolute wallclock timestamp (ms). Backend computes this once at
   *  creation time and both sides use it — no block-time drift between
   *  backend's precise-freeze setTimeout and the frontend countdown. */
  deadline_ms?: number
  status: 'active' | 'resolving' | 'resolved'
  closing_price?: number
  frozen_price?: number  // price at deadline (what users saw when chart froze)
  frozen_conf?: number
}

type Phase = 'live' | 'resolving' | 'result' | 'loading'

export interface TurboRollingViewProps {
  symbol: TurboSymbol
  className?: string
  /** If true, hides buy buttons (for hero embed) */
  compact?: boolean
  /**
   * If true, the view does NOT auto-rotate to the next market when the
   * current one ends. Instead, it stays locked displaying the resolved
   * market and shows a "Live Market" button that navigates to the detail
   * page. Used for the dashboard hero embed.
   */
  lockedMode?: boolean
  /** Pass-through to TurboMarketPanel — skip chart canvas (sidebar embed). */
  hideChart?: boolean
  /** Pass-through to TurboMarketPanel — skip bet/claim UI (main chart embed). */
  hideBetUI?: boolean
}

export function TurboRollingView({ symbol, className, compact: _compact, lockedMode, hideChart, hideBetUI }: TurboRollingViewProps) {
  const navigate = useNavigate()
  const [phase, setPhase] = useState<Phase>('loading')
  const [market, setMarket] = useState<ChainedMarket | null>(null)
  const [prevResult, setPrevResult] = useState<{
    baseline: number
    closing: number
    direction: 'UP' | 'DOWN'
  } | null>(null)
  const [deadlineMs, setDeadlineMs] = useState(0)
  const prevMarketId = useRef<string | null>(null)
  /**
   * In lockedMode, when the current market resolves and the backend chains
   * a new round, the hero stays frozen on the resolved market — but the
   * "Live Market" button should navigate to the NEW market, not the stale
   * resolved one. We capture the new market_id here so the button can use
   * it.
   */
  const [nextMarketId, setNextMarketId] = useState<string | null>(null)

  // Poll backend for current chain state
  const fetchChain = useCallback(async () => {
    try {
      const res = await fetch(`${ORACLE_URL}/chain/symbol?symbol=${symbol}`)
      if (!res.ok) return null
      return (await res.json()) as ChainedMarket
    } catch {
      return null
    }
  }, [symbol])

  // Main polling loop — detects market transitions
  useEffect(() => {
    let cancelled = false

    const poll = async () => {
      const m = await fetchChain()
      if (cancelled) return

      if (!m) {
        setPhase('loading')
        return
      }

      // Detect new market (id changed)
      if (m.market_id !== prevMarketId.current) {
        // LOCKED MODE: don't auto-rotate. Keep showing the current (resolved)
        // market so user can see the final result. Save the new market's id
        // so the "Live Market" button can navigate to it instead of the stale
        // resolved one.
        if (lockedMode && market && (market.status === 'resolved' || market.status === 'resolving')) {
          setNextMarketId(m.market_id)
          return // ignore new market, stay locked on current
        }

        // If previous market was resolved, show result first
        if (prevMarketId.current && market?.status === 'resolved' && market.closing_price != null) {
          setPrevResult({
            baseline: market.baseline_price,
            closing: market.closing_price,
            direction: market.closing_price > market.baseline_price ? 'UP' : 'DOWN',
          })
          setPhase('result')
          // After RESULT_DISPLAY_MS, transition to the new market
          setTimeout(() => {
            if (cancelled) return
            prevMarketId.current = m.market_id
            setMarket(m)
            computeDeadlineMs(m).then(setDeadlineMs)
            setPhase('live')
            setPrevResult(null)
          }, RESULT_DISPLAY_MS)
          return
        }

        // First load or no previous result to show
        prevMarketId.current = m.market_id
        setMarket(m)
        computeDeadlineMs(m).then(setDeadlineMs)
        setPhase(m.status === 'active' ? 'live' : m.status === 'resolving' ? 'resolving' : 'loading')
        return
      }

      // Same market — only update if status changed (don't touch baseline/deadline)
      if (m.status !== market?.status) {
        setMarket(m)
        if (m.status === 'resolved' && phase !== 'result') {
          setPhase('resolving')
        } else if (m.status === 'active' && phase !== 'live') {
          computeDeadlineMs(m).then(setDeadlineMs)
          setPhase('live')
        }
      }
    }

    poll()
    const id = setInterval(poll, 5000)
    return () => { cancelled = true; clearInterval(id) }
  }, [fetchChain, symbol]) // eslint-disable-line react-hooks/exhaustive-deps

  async function computeDeadlineMs(m: ChainedMarket): Promise<number> {
    // Prefer the absolute timestamp baked in by the backend at creation
    // time — that's the single source of truth that both the backend's
    // precise-freeze setTimeout and this countdown share. Falling back
    // to the local block-height × SECS_PER_BLOCK estimate only when
    // talking to an older backend that doesn't emit deadline_ms.
    if (typeof m.deadline_ms === 'number' && m.deadline_ms > 0) {
      return m.deadline_ms
    }
    const deadlineBlock = Number(m.deadline)
    // Fetch current block height so we only multiply the DIFFERENCE
    try {
      const ALEO_RPC = (import.meta as any).env?.VITE_ALEO_RPC_URL || 'https://api.explorer.provable.com/v1/testnet'
      const rpc = ALEO_RPC.replace(/\/(testnet|mainnet|canary)\/?$/, '') + '/testnet'
      const hRes = await fetch(`${rpc}/latest/height`)
      if (hRes.ok) {
        const currentBlock = Number(await hRes.text())
        const blocksAhead = Math.max(0, deadlineBlock - currentBlock)
        return Date.now() + blocksAhead * SECS_PER_BLOCK * 1000
      }
    } catch {}
    // Fallback: assume ~5 min from now
    return Date.now() + 5 * 60 * 1000
  }

  // ── LOADING phase ──
  if (phase === 'loading') {
    return (
      <div className={cn('flex items-center justify-center h-full min-h-[300px]', className)}>
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 text-amber-400 animate-spin mx-auto" />
          <div className="text-sm text-surface-400">Waiting for next turbo market…</div>
        </div>
      </div>
    )
  }

  // ── RESULT phase (brief flash showing UP/DOWN result) ──
  if (phase === 'result' && prevResult) {
    const pctChange = ((prevResult.closing - prevResult.baseline) / prevResult.baseline) * 100
    const isUp = prevResult.direction === 'UP'
    return (
      <div className={cn(
        'flex flex-col items-center justify-center h-full min-h-[300px] gap-4',
        isUp ? 'bg-emerald-500/5' : 'bg-rose-500/5',
        className,
      )}>
        <div className={cn(
          'w-20 h-20 rounded-full flex items-center justify-center',
          isUp ? 'bg-emerald-500/15' : 'bg-rose-500/15',
        )}>
          {isUp
            ? <TrendingUp className="w-10 h-10 text-emerald-400" />
            : <TrendingDown className="w-10 h-10 text-rose-400" />
          }
        </div>
        <div className={cn(
          'text-3xl font-black',
          isUp ? 'text-emerald-400' : 'text-rose-400',
        )}>
          {isUp ? '↑ UP' : '↓ DOWN'}
        </div>
        <div className="text-sm text-surface-400 tabular-nums">
          ${prevResult.baseline.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          {' → '}
          ${prevResult.closing.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          <span className={cn('ml-2 font-bold', isUp ? 'text-emerald-400' : 'text-rose-400')}>
            ({isUp ? '+' : ''}{pctChange.toFixed(3)}%)
          </span>
        </div>
        <div className="text-xs text-surface-500 animate-pulse">
          Next market starting…
        </div>
      </div>
    )
  }

  // ── LIVE / RESOLVING phase — render TurboMarketPanel ──
  if (!market) return null

  // For the deadline, we need actual ms. The backend gives us block height.
  // We'll fetch current block once and compute. TurboMarketPanel's own
  // countdown will handle the rest.
  // key={market.market_id} forces React to fully unmount+remount the panel
  // when market changes. This resets all internal state: frozen, ticks,
  // currentPrice, pool — so the new market starts fresh with live Pyth data.
  //
  // Prefer the ON-CHAIN closing_price. For ACTIVE markets we deliberately
  // refuse to fall back to frozen_price: the backend sets frozen_price the
  // instant its precise-freeze setTimeout fires (wallclock-estimated), which
  // can land a few seconds BEFORE the frontend's own countdown hits 0 due to
  // block-time drift. Passing frozen_price while still active would flip the
  // panel's `frozen` flag early and show "LOCKED $X" while the countdown is
  // still ticking.
  //
  // BUT once the backend status is `resolving`/`resolved`, the deadline is
  // definitively past — no race window left — and frozen_price becomes the
  // only price the panel can display during the 20–60s gap between deadline
  // and on-chain resolve confirmation. Without this fallback, a refresh
  // during LOCKED wipes the chart + "Final Price" because the safety-net
  // effect in TurboMarketPanel (seeds currentPrice/ticks from closingPrice)
  // never fires when closingPrice is undefined.
  const displayClosing =
    market.closing_price ??
    (market.status !== 'active' ? market.frozen_price : undefined)

  // Show "Live Market" button when locked mode + market ended (resolving or resolved)
  const showLiveMarketButton = lockedMode && market.status !== 'active'

  return (
    <div className={cn('relative', className)}>
      <TurboMarketPanel
        key={market.market_id}
        marketId={market.market_id}
        symbol={market.symbol}
        baselinePrice={market.baseline_price}
        deadlineMs={deadlineMs}
        status={market.status === 'resolved' ? 'resolved' : 'active'}
        closingPrice={displayClosing}
        winningOutcome={
          displayClosing != null
            ? displayClosing > market.baseline_price ? 'UP' : 'DOWN'
            : undefined
        }
        hideChart={hideChart}
        hideBetUI={hideBetUI}
        className={cn('h-full', className)}
      />
      {showLiveMarketButton && (
        // Vertically aligned with the "Price To Beat" / "Current Price" row
        // inside the panel. The header title row is ~56px tall and the price
        // row sits right under it — we center the button on the price row
        // using top-[4.25rem] + -translate-y-1/2.
        <button
          onClick={() => navigate(`/market/${nextMarketId ?? market.market_id}`)}
          className={cn(
            'absolute top-[5.5rem] right-3 z-20 -translate-y-1/2 flex items-center gap-1.5 px-3 py-1.5 rounded-full',
            'bg-gradient-to-r from-amber-500 to-orange-500',
            'text-white font-bold text-xs shadow-lg shadow-amber-500/40',
            'hover:from-amber-400 hover:to-orange-400 hover:scale-105',
            'transition-all duration-200',
            'ring-1 ring-amber-300/50',
          )}
        >
          <Radio className="w-3 h-3 animate-pulse" />
          <span>Live Market</span>
          <span className="text-[9px] opacity-80">→</span>
        </button>
      )}
    </div>
  )
}
