import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ArrowUpRight, ArrowDownRight, RefreshCw } from 'lucide-react'
import { cn, formatCredits, getCategoryName } from '@/lib/utils'
import { getMarketOutcomeSummaries } from '@/lib/market-outcomes'
import { useGlobalTicker, useLiveCountdown } from '@/hooks/useGlobalTicker'
import { useTurboPriceSource } from '@/hooks/useTurboPriceSource'
import type { Market } from '@/lib/store'
import { Container, Reveal, SectionHeading } from './shared'
import { formatClock, formatPct, formatUsd, useTurboBoard, type LaunchApp, type TurboRow } from './data'

const MAX_TILES = 4

const TURBO_STEPS = [
  'A round opens at the live price.',
  'Pick up or down before the five-minute clock runs out.',
  'The oracle settles the round at the closing price and logs it.',
]

export function LiveMarkets({
  app,
  markets,
  loading,
  failed,
  retry,
}: {
  app: LaunchApp
  markets: Market[]
  loading: boolean
  failed: boolean
  retry: () => Promise<void>
}) {
  const shown = markets.slice(0, MAX_TILES)

  return (
    <section id="markets" aria-labelledby="markets-title" className="relative py-24 sm:py-32">
      <Container>
        <SectionHeading
          id="markets-title"
          index="01"
          eyebrow="Live markets"
          title="Real markets, trading on NEAR now."
          lead="Prices come from the on-chain market maker and move as people trade. Open any market to see its chart and rules. You can look around without a wallet."
        />

        <div className="mt-14 grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div>
            {loading ? (
              <div className="grid gap-4 sm:grid-cols-2" aria-busy="true" aria-label="Loading markets">
                {Array.from({ length: 4 }, (_, i) => (
                  <div key={i} className="h-[232px] animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.02]" />
                ))}
              </div>
            ) : failed ? (
              <div className="flex h-full min-h-[232px] flex-col items-start justify-center rounded-2xl border border-white/[0.08] bg-white/[0.02] p-8">
                <p className="text-[16px] text-[#f3efe6]">We could not reach NEAR testnet just now.</p>
                <button
                  type="button"
                  onClick={() => void retry()}
                  className="mt-4 inline-flex items-center gap-2 text-[14px] text-brand-300 hover:text-brand-200"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden /> Try again
                </button>
              </div>
            ) : shown.length === 0 ? (
              <div className="flex h-full min-h-[232px] flex-col items-start justify-center rounded-2xl border border-white/[0.08] bg-white/[0.02] p-8">
                <p className="text-[16px] text-[#f3efe6]">No market is open right now.</p>
                <p className="mt-2 text-[14px] text-[#8b919e]">Turbo rounds open every five minutes. Try one on the right.</p>
              </div>
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2">
                {shown.map((m, i) => (
                  <li key={m.id}>
                    <Reveal delay={i * 0.06} className="h-full">
                      <MarketTile market={m} />
                    </Reveal>
                  </li>
                ))}
              </ul>
            )}

            {markets.length > MAX_TILES && (
              <button
                type="button"
                onClick={app.launch}
                className="mt-5 inline-flex items-center gap-1.5 text-[14px] text-brand-300 hover:text-brand-200"
              >
                See all {markets.length} markets in the app <ArrowRight className="h-4 w-4" aria-hidden />
              </button>
            )}
          </div>

          <Reveal delay={0.1}>
            <TurboBoard />
          </Reveal>
        </div>
      </Container>
    </section>
  )
}

function MarketTile({ market }: { market: Market }) {
  const outcomes = useMemo(() => getMarketOutcomeSummaries(market), [market])
  const timeLeft = useLiveCountdown(market.deadlineTimestamp, market.timeRemaining)
  const token = market.tokenType ?? 'NEAR'

  return (
    <Link
      to={`/market/${market.id}`}
      className="group flex h-full flex-col rounded-2xl border border-white/[0.08] bg-[#0c0e13] p-5 transition-[border-color,transform] duration-300 hover:-translate-y-0.5 hover:border-brand-400/35 sm:p-6"
    >
      <div className="flex items-center justify-between font-mono text-[10.5px] uppercase tracking-[0.18em]">
        <span className="text-brand-300">{getCategoryName(market.category)}</span>
        <span className="text-[#8b919e]">{token}</span>
      </div>

      <h3 className="mt-3 line-clamp-3 text-[17px] font-semibold leading-snug text-[#f3efe6]">{market.question}</h3>

      <div className="mt-5 space-y-2.5">
        {outcomes.map((o) => (
          <div key={o.outcome} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3">
            <span className="truncate text-[13.5px] text-[#c4c8d0]">{o.label}</span>
            <span className={cn('font-mono text-[13px] tabular-nums', o.styles.text)}>
              {formatPct(Math.round(o.percentage * 10) / 10)}
            </span>
            <div className="col-span-2 mt-1 h-1 overflow-hidden rounded-full bg-white/[0.06]">
              <div className={cn('h-full rounded-full', o.styles.bar)} style={{ width: `${Math.max(2, o.percentage)}%` }} />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-auto flex items-center justify-between pt-6 font-mono text-[12px] text-[#8b919e]">
        <span className="tabular-nums">
          Vol {formatCredits(market.totalVolume, 2)} {token}
        </span>
        <span className="inline-flex items-center gap-1.5 tabular-nums">
          {timeLeft === 'Ended' ? 'Closed' : timeLeft}
          <ArrowRight
            className="h-3.5 w-3.5 text-[#c4c8d0] transition-transform duration-300 group-hover:translate-x-0.5"
            aria-hidden
          />
        </span>
      </div>
    </Link>
  )
}

function TurboBoard() {
  const { rows, offline } = useTurboBoard()
  const source = useTurboPriceSource()

  return (
    <div className="flex h-full flex-col rounded-2xl border border-brand-400/20 bg-[linear-gradient(180deg,rgba(201,168,76,0.06),rgba(12,14,19,0.9)_45%)] p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-brand-300">Turbo</p>
          <h3 className="mt-2 text-[19px] font-semibold text-[#f3efe6]">Up or down in five minutes</h3>
        </div>
        <span className="mt-0.5 shrink-0 rounded-full border border-white/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[#8b919e]">
          {source.short} prices
        </span>
      </div>
      <ul className="mt-5 divide-y divide-white/[0.06] border-y border-white/[0.06]">
        {rows.map((row) => (
          <li key={row.symbol}>
            <TurboRowView row={row} />
          </li>
        ))}
      </ul>

      {offline && (
        <p className="mt-3 text-[13px] text-[#8b919e]">Live prices are unavailable right now. Rounds keep running on chain.</p>
      )}

      <ol className="mt-6 space-y-3 text-[14px] leading-snug text-[#c4c8d0]">
        {TURBO_STEPS.map((step, i) => (
          <li key={step} className="flex gap-3">
            <span className="pt-px font-mono text-[11px] text-brand-300">0{i + 1}</span>
            {step}
          </li>
        ))}
      </ol>

      <Link
        to="/turbo"
        className="mt-auto inline-flex items-center gap-1.5 pt-5 text-[14px] font-medium text-brand-300 hover:text-brand-200"
      >
        Open Turbo <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  )
}

function TurboRowView({ row }: { row: TurboRow }) {
  const now = useGlobalTicker()
  const flash = usePriceFlash(row.price)
  const clock = row.deadlineMs ? formatClock(row.deadlineMs - now) : null
  const delta = row.price !== null && row.baseline ? (row.price - row.baseline) / row.baseline : null
  const up = delta !== null && delta >= 0

  return (
    <Link
      to={`/turbo/${row.symbol}`}
      className="group grid grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-3 py-3.5 transition-colors hover:bg-white/[0.02]"
      aria-label={`${row.symbol} Turbo round`}
    >
      <span className="font-mono text-[13px] font-semibold text-[#f3efe6]">{row.symbol}</span>
      <span className="min-w-0">
        <span className={cn('block rounded font-mono text-[14px] tabular-nums text-[#f3efe6]', flash)}>
          {row.price === null ? '—' : formatUsd(row.price)}
        </span>
        <span className="mt-0.5 flex items-center gap-1 font-mono text-[11px] tabular-nums text-[#8b919e]">
          {delta === null ? (
            'Waiting for the round price'
          ) : (
            <>
              <span className={cn('inline-flex items-center', up ? 'text-yes-400' : 'text-no-400')}>
                {up ? <ArrowUpRight className="h-3 w-3" aria-hidden /> : <ArrowDownRight className="h-3 w-3" aria-hidden />}
                {(Math.abs(delta) * 100).toFixed(3)}%
              </span>
              vs {formatUsd(row.baseline as number)}
            </>
          )}
        </span>
      </span>
      <span className="text-right font-mono text-[12px] tabular-nums text-[#c4c8d0]">
        {clock ?? <span className="text-[#8b919e]">Settling</span>}
        <span className="block text-[10px] uppercase tracking-[0.14em] text-[#8b919e]">{clock ? 'left' : 'next soon'}</span>
      </span>
    </Link>
  )
}

/** Returns a class that briefly highlights a price when it changes. */
function usePriceFlash(price: number | null): string {
  const prev = useRef<number | null>(null)
  const [state, setState] = useState<{ cls: string; key: number }>({ cls: '', key: 0 })

  useEffect(() => {
    if (price !== null && prev.current !== null && price !== prev.current) {
      setState((s) => ({ cls: price > (prev.current as number) ? 'vl-tick-up' : 'vl-tick-down', key: s.key + 1 }))
    }
    prev.current = price
  }, [price])

  useEffect(() => {
    if (!state.cls) return
    const t = window.setTimeout(() => setState((s) => ({ ...s, cls: '' })), 900)
    return () => window.clearTimeout(t)
  }, [state])

  return state.cls
}
