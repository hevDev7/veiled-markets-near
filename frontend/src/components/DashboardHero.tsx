import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronLeft,
  ChevronRight,
  Wallet,
  Activity,
  PieChart,
  Trophy,
  Zap,
  Plus,
  Bell,
  Clock,
  TrendingUp,
  Shield,
} from 'lucide-react'
import { type Market } from '@/lib/store'
import { cn, formatCredits, formatPercentage, getCategoryEmoji, getCategoryName } from '@/lib/utils'
import { useLiveCountdown } from '@/hooks/useGlobalTicker'
import { calculateAllPrices, type AMMReserves } from '@/lib/amm'
import { ProbabilityChart } from '@/components/ProbabilityChart'

const OUTCOME_COLORS = [
  { text: 'text-yes-400', bg: 'bg-yes-500', border: 'border-yes-500/30' },
  { text: 'text-no-400', bg: 'bg-no-500', border: 'border-no-500/30' },
  { text: 'text-purple-400', bg: 'bg-purple-500', border: 'border-purple-500/30' },
  { text: 'text-yellow-400', bg: 'bg-yellow-500', border: 'border-yellow-500/30' },
]

// ── Slide Card ──
function MarketSlide({ market, onClick }: { market: Market; onClick: () => void }) {
  const timeRemaining = useLiveCountdown(market.deadlineTimestamp, market.timeRemaining)
  const numOutcomes = market.numOutcomes ?? 2
  const outcomeLabels = market.outcomeLabels ?? (numOutcomes === 2 ? ['Yes', 'No'] : Array.from({ length: numOutcomes }, (_, i) => `Outcome ${i + 1}`))
  const isBinary = numOutcomes === 2

  const prices = useMemo(() => {
    const reserves: AMMReserves = {
      reserve_1: market.yesReserve ?? 0n,
      reserve_2: market.noReserve ?? 0n,
      reserve_3: market.reserve3 ?? 0n,
      reserve_4: market.reserve4 ?? 0n,
      num_outcomes: numOutcomes,
    }
    return calculateAllPrices(reserves)
  }, [market.yesReserve, market.noReserve, market.reserve3, market.reserve4, numOutcomes])

  // Compute percentages for outcomes
  const outcomeData = useMemo(() => {
    if (isBinary) {
      return [
        { label: outcomeLabels[0], pct: market.yesPercentage },
        { label: outcomeLabels[1], pct: market.noPercentage },
      ]
    }
    return outcomeLabels.map((label, i) => ({
      label,
      pct: (prices[i] ?? 0) * 100,
    }))
  }, [isBinary, outcomeLabels, market.yesPercentage, market.noPercentage, prices])

  return (
    <div className="h-full flex flex-col p-5">
      {/* Row 1: Category & Timer */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{getCategoryEmoji(market.category)}</span>
          <span className="text-xs text-surface-400 font-medium uppercase tracking-wide">
            {getCategoryName(market.category)}
          </span>
          <div className="flex items-center gap-1">
            <Shield className="w-3 h-3 text-brand-400" />
            <span className="text-[10px] text-brand-400">Private</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-surface-400">
          <Clock className="w-3.5 h-3.5" />
          <span className="tabular-nums">{timeRemaining}</span>
        </div>
      </div>

      {/* Row 2: Question */}
      <h3
        onClick={onClick}
        className="text-lg font-bold text-white hover:text-brand-300 transition-colors leading-snug mb-1 line-clamp-2 cursor-pointer"
      >
        {market.question}
      </h3>

      {/* Row 3: Description */}
      {market.description && (
        <p className="text-[11px] text-surface-500 line-clamp-1 mb-3">{market.description}</p>
      )}
      {!market.description && <div className="mb-3" />}

      {/* Row 4: Outcomes (left) + Chart (right) — Polymarket style */}
      <div className="flex-1 min-h-0 flex gap-4">
        {/* Outcomes list */}
        <div className="w-[140px] shrink-0 flex flex-col gap-1.5 py-1">
          {outcomeData.map((item, i) => {
            const colors = OUTCOME_COLORS[i] || OUTCOME_COLORS[0]
            return (
              <div
                key={i}
                className={cn(
                  'flex items-center justify-between px-3 py-2 rounded-lg border transition-colors',
                  'bg-surface-800/30 hover:bg-surface-800/50',
                  colors.border
                )}
              >
                <div className="flex items-center gap-2">
                  <div className={cn('w-2 h-2 rounded-full shrink-0', colors.bg)} />
                  <span className="text-xs text-surface-300 truncate">{item.label}</span>
                </div>
                <span className={cn('text-sm font-bold tabular-nums', colors.text)}>
                  {formatPercentage(item.pct)}
                </span>
              </div>
            )
          })}
        </div>

        {/* Line chart */}
        <div className="flex-1 min-w-0">
          <ProbabilityChart
            marketId={market.id}
            numOutcomes={numOutcomes}
            outcomeLabels={outcomeLabels}
            currentPrices={prices}
            compact
          />
        </div>
      </div>

      {/* Row 5: Bottom stats */}
      <div
        onClick={onClick}
        className="flex items-center gap-4 text-xs text-surface-400 pt-2 border-t border-surface-800/30 cursor-pointer"
      >
        <div className="flex items-center gap-1.5">
          <TrendingUp className="w-3.5 h-3.5" />
          <span className="tabular-nums">{formatCredits(market.totalVolume, 0)} vol</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="tabular-nums">{market.totalBets} bets</span>
        </div>
        <div className="ml-auto text-brand-400 font-medium hover:text-brand-300 transition-colors flex items-center gap-1">
          Trade <ChevronRight className="w-3.5 h-3.5" />
        </div>
      </div>
    </div>
  )
}

// ── Stat Row ──
function StatRow({ icon, label, value, color }: {
  icon: React.ReactNode; label: string; value: string; color: string
}) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <div className="flex items-center gap-2.5">
        <div className={cn('', color)}>{icon}</div>
        <span className="text-sm text-surface-400">{label}</span>
      </div>
      <span className={cn('text-sm font-bold tabular-nums', color)}>{value}</span>
    </div>
  )
}

// ── Slide animation ──
const slideVariants = {
  enter: (dir: number) => ({ opacity: 0, x: dir > 0 ? 60 : -60, scale: 0.97 }),
  center: { opacity: 1, x: 0, scale: 1 },
  exit: (dir: number) => ({ opacity: 0, x: dir > 0 ? -60 : 60, scale: 0.97 }),
}
const slideTransition = { duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] }

// ── Main Hero ──
interface DashboardHeroProps {
  markets: Market[]
  walletBalance: bigint
  activeBetsCount: number
  portfolioValue: number
  winningsValue: string
  totalVolume: string
  notificationCount: number
  onCreateMarket: () => void
  onToggleNotifications: () => void
  onMarketClick: (market: Market) => void
}

export function DashboardHero({
  markets, walletBalance, activeBetsCount, portfolioValue,
  winningsValue, totalVolume, notificationCount,
  onCreateMarket, onToggleNotifications, onMarketClick,
}: DashboardHeroProps) {
  const [currentSlide, setCurrentSlide] = useState(0)
  const [direction, setDirection] = useState(1)
  const [isAutoPlaying, setIsAutoPlaying] = useState(true)

  const activeMarkets = useMemo(
    () => markets.filter(m => m.status === 1 && m.timeRemaining !== 'Ended').slice(0, 8),
    [markets]
  )
  const slideCount = activeMarkets.length

  useEffect(() => {
    if (!isAutoPlaying || slideCount <= 1) return
    const iv = setInterval(() => {
      setDirection(1)
      setCurrentSlide(prev => (prev + 1) % slideCount)
    }, 6000)
    return () => clearInterval(iv)
  }, [isAutoPlaying, slideCount])

  const goNext = useCallback(() => { setIsAutoPlaying(false); setDirection(1); setCurrentSlide(p => (p + 1) % slideCount) }, [slideCount])
  const goPrev = useCallback(() => { setIsAutoPlaying(false); setDirection(-1); setCurrentSlide(p => (p - 1 + slideCount) % slideCount) }, [slideCount])
  const goTo = useCallback((i: number) => { setIsAutoPlaying(false); setDirection(i > currentSlide ? 1 : -1); setCurrentSlide(i) }, [currentSlide])

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-4 mb-6">
      {/* ── Left: Market Slider ── */}
      <div className="relative rounded-2xl border border-surface-800/40 bg-gradient-to-br from-surface-900/70 to-surface-900/40 backdrop-blur-xl overflow-hidden min-h-[370px]">
        {activeMarkets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <div className="w-14 h-14 rounded-2xl bg-brand-500/10 flex items-center justify-center mb-4">
              <TrendingUp className="w-7 h-7 text-brand-400" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">No Active Markets</h3>
            <p className="text-sm text-surface-400 mb-4">Be the first to create a prediction market</p>
            <button onClick={onCreateMarket} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 text-white hover:from-brand-500 hover:to-brand-400 transition-all shadow-lg shadow-brand-500/20 font-semibold text-sm">
              <Plus className="w-4 h-4" /> Create Market
            </button>
          </div>
        ) : (
          <>
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div key={currentSlide} custom={direction} variants={slideVariants} initial="enter" animate="center" exit="exit" transition={slideTransition} className="h-full">
                <MarketSlide market={activeMarkets[currentSlide]} onClick={() => onMarketClick(activeMarkets[currentSlide])} />
              </motion.div>
            </AnimatePresence>

            {slideCount > 1 && (
              <>
                <button onClick={goPrev} className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg bg-surface-900/80 border border-surface-700/30 text-surface-400 hover:text-white hover:border-surface-600/50 transition-all backdrop-blur-sm z-10" aria-label="Previous market">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button onClick={goNext} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg bg-surface-900/80 border border-surface-700/30 text-surface-400 hover:text-white hover:border-surface-600/50 transition-all backdrop-blur-sm z-10" aria-label="Next market">
                  <ChevronRight className="w-4 h-4" />
                </button>
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-10">
                  {activeMarkets.map((_, i) => (
                    <button key={i} onClick={() => goTo(i)} className={cn('transition-all duration-300 rounded-full', i === currentSlide ? 'w-6 h-1.5 bg-brand-400' : 'w-1.5 h-1.5 bg-surface-600 hover:bg-surface-400')} aria-label={`Go to market ${i + 1}`} />
                  ))}
                </div>
              </>
            )}
            <div className="absolute top-4 right-4 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-brand-500/10 border border-brand-500/20 text-[10px] font-semibold text-brand-400 uppercase tracking-wider z-10">Featured</div>
          </>
        )}
      </div>

      {/* ── Right: Dashboard Info Panel ── */}
      <div className="rounded-2xl border border-surface-800/40 bg-gradient-to-b from-surface-900/70 to-surface-900/40 backdrop-blur-xl p-5 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-white">Overview</h2>
          <div className="flex items-center gap-1.5">
            <button onClick={onToggleNotifications} aria-label="Notifications" className="relative p-2 rounded-lg bg-surface-800/50 border border-surface-700/30 text-surface-400 hover:text-white hover:border-brand-500/30 transition-all">
              <Bell className="w-3.5 h-3.5" />
              {notificationCount > 0 && <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-brand-500 rounded-full text-[9px] font-bold text-white flex items-center justify-center">{notificationCount}</span>}
            </button>
            <button onClick={onCreateMarket} className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-gradient-to-r from-brand-600 to-brand-500 text-white hover:from-brand-500 hover:to-brand-400 transition-all shadow-lg shadow-brand-500/20 font-semibold text-xs">
              <Plus className="w-3.5 h-3.5" /> New Market
            </button>
          </div>
        </div>

        <div className="flex-1 divide-y divide-surface-800/50">
          <StatRow icon={<Wallet className="w-4 h-4" />} label="Balance" value={`${formatCredits(walletBalance)} ALEO`} color="text-brand-400" />
          <StatRow icon={<Activity className="w-4 h-4" />} label="Active Bets" value={String(activeBetsCount)} color="text-yes-400" />
          <StatRow icon={<PieChart className="w-4 h-4" />} label="Portfolio" value={`${portfolioValue.toFixed(1)} ALEO`} color="text-brand-300" />
          <StatRow icon={<Trophy className="w-4 h-4" />} label="Winnings" value={winningsValue} color="text-accent-400" />
          <StatRow icon={<Zap className="w-4 h-4" />} label="Total Volume" value={totalVolume} color="text-surface-300" />
        </div>

        <div className="mt-3 pt-3 border-t border-surface-800/50 flex items-center justify-center gap-2 text-xs text-surface-500">
          <Shield className="w-3.5 h-3.5 text-brand-400" />
          <span>Zero-Knowledge Protected</span>
        </div>
      </div>
    </div>
  )
}
