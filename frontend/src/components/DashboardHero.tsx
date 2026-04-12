import { useState, useEffect, useCallback, useMemo, useRef, type CSSProperties, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronLeft,
  ChevronRight,
  Activity,
  Trophy,
  Plus,
  Clock,
  TrendingUp,
} from 'lucide-react'
import { type Market } from '@/lib/store'
import { cn, formatCredits, formatPercentage, getCategoryEmoji, getCategoryName } from '@/lib/utils'
import { useLiveCountdown } from '@/hooks/useGlobalTicker'
import { getMarketThumbnail, isContainThumbnail } from '@/lib/market-thumbnails'
import { getMarketOutcomeSummaries } from '@/lib/market-outcomes'
import { TurboRollingView } from './TurboRollingView'
import type { TurboSymbol } from './TurboMarketPanel'

const CATEGORY_GRADIENTS: Record<number, string> = {
  1: 'linear-gradient(135deg, rgba(99, 102, 241, 0.16) 0%, rgba(139, 92, 246, 0.06) 100%)',
  2: 'linear-gradient(135deg, rgba(16, 185, 129, 0.16) 0%, rgba(6, 182, 212, 0.06) 100%)',
  3: 'linear-gradient(135deg, rgba(247, 147, 26, 0.18) 0%, rgba(201, 168, 76, 0.08) 100%)',
  4: 'linear-gradient(135deg, rgba(236, 72, 153, 0.16) 0%, rgba(244, 63, 94, 0.06) 100%)',
  5: 'linear-gradient(135deg, rgba(139, 92, 246, 0.16) 0%, rgba(59, 130, 246, 0.06) 100%)',
  6: 'linear-gradient(135deg, rgba(59, 130, 246, 0.16) 0%, rgba(6, 182, 212, 0.06) 100%)',
  7: 'linear-gradient(135deg, rgba(6, 182, 212, 0.16) 0%, rgba(16, 185, 129, 0.06) 100%)',
  8: 'linear-gradient(135deg, rgba(20, 184, 166, 0.16) 0%, rgba(16, 185, 129, 0.06) 100%)',
  99: 'linear-gradient(135deg, rgba(201, 168, 76, 0.14) 0%, rgba(0, 220, 130, 0.05) 100%)',
}

const OUTCOME_COLORS = [
  { text: 'text-yes-400', dot: 'bg-yes-400', bar: 'bg-yes-500', tint: 'bg-yes-500/8', border: 'border-yes-500/18' },
  { text: 'text-no-400', dot: 'bg-no-400', bar: 'bg-no-500', tint: 'bg-no-500/8', border: 'border-no-500/18' },
  { text: 'text-purple-400', dot: 'bg-purple-400', bar: 'bg-purple-500', tint: 'bg-purple-500/8', border: 'border-purple-500/18' },
  { text: 'text-yellow-400', dot: 'bg-yellow-400', bar: 'bg-yellow-500', tint: 'bg-yellow-500/8', border: 'border-yellow-500/18' },
]

const SLIDE_DURATION_MS = 9000
const AUTO_PLAY_RESUME_MS = 10000
const IMAGE_REVEAL_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]
const IMAGE_REVEAL_DURATION = 0.85
const IMAGE_DIM_FADE_DURATION = 0.65
const SLIDE_FADE_DURATION = 0.75

type OutcomeDatum = {
  index: number
  label: string
  pct: number
}

function MarketSlide({
  market,
  onClick,
  controls,
}: {
  market: Market
  onClick: () => void
  controls?: ReactNode
}) {
  const timeRemaining = useLiveCountdown(market.deadlineTimestamp, market.timeRemaining)
  const numOutcomes = market.numOutcomes ?? 2
  const outcomeSummaries = useMemo(() => getMarketOutcomeSummaries(market), [market])

  const outcomeData = useMemo<OutcomeDatum[]>(() => {
    return outcomeSummaries.map((outcome) => ({
      index: outcome.index,
      label: outcome.label,
      pct: outcome.percentage,
    }))
  }, [outcomeSummaries])

  const sortedOutcomes = useMemo(
    () => [...outcomeData].sort((a, b) => b.pct - a.pct),
    [outcomeData]
  )

  const leadingOutcome = sortedOutcomes[0] ?? outcomeData[0]
  const leadingOutcomeColor = OUTCOME_COLORS[leadingOutcome?.index ?? 0] || OUTCOME_COLORS[0]
  const leadingOutcomeWidth = Math.max(8, Math.min(leadingOutcome?.pct ?? 0, 100))

  const heroImageUrl = market.thumbnailUrl || null
  const thumbUrl = getMarketThumbnail(market.question, market.category, market.thumbnailUrl)
  const useContainThumb = isContainThumbnail(thumbUrl)

  return (
    <div className="h-full flex flex-col p-4 lg:p-5">
      <div className="mb-3 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-brand-400/20 bg-brand-400/8 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-300">
              Trending Market
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.03] px-3 py-1 text-xs font-medium text-surface-300">
              <span>{getCategoryEmoji(market.category)}</span>
              <span>{getCategoryName(market.category)}</span>
            </span>
          </div>

          <div className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-surface-950/55 px-3 py-1.5 text-xs text-surface-400 backdrop-blur-md">
            <Clock className="h-3.5 w-3.5" />
            <span className="tabular-nums font-medium">{timeRemaining}</span>
          </div>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1 lg:max-w-[70%]">
            <button onClick={onClick} className="text-left">
              <h3 className="font-display text-[1rem] font-bold leading-[1.2] text-white transition-colors hover:text-brand-300 text-balance lg:text-[1.28rem]">
                {market.question}
              </h3>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-surface-500 lg:max-w-[30%] lg:justify-end lg:pl-4">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.04] bg-white/[0.02] px-2.5 py-1.5">
              <TrendingUp className="h-3.5 w-3.5" />
              <span className="tabular-nums">{formatCredits(market.totalVolume, 0)} {market.tokenType ?? 'ALEO'}</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.04] bg-white/[0.02] px-2.5 py-1.5">
              <span className="tabular-nums">{market.totalBets}</span>
              <span>bets</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.04] bg-white/[0.02] px-2.5 py-1.5">
              <span className="tabular-nums">{numOutcomes}</span>
              <span>{numOutcomes === 1 ? 'outcome' : 'outcomes'}</span>
            </span>
          </div>
        </div>
      </div>

      <div className="relative flex-1 min-h-[188px] overflow-hidden rounded-[26px] border border-white/[0.06] bg-surface-900/75 lg:min-h-[204px]">
        <div
          className="absolute inset-0"
          style={{ background: CATEGORY_GRADIENTS[market.category] || CATEGORY_GRADIENTS[99] }}
        />

        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.08),transparent_32%),linear-gradient(180deg,rgba(8,9,12,0.02),rgba(8,9,12,0.22))]" />
        <div className="absolute right-[-12%] top-[-10%] h-48 w-48 rounded-full bg-brand-400/10 blur-3xl" />
        <div className="absolute bottom-[-18%] left-[-6%] h-44 w-44 rounded-full bg-yes-400/8 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />

        {heroImageUrl && (
          <motion.img
            key={`image-${market.id}`}
            src={heroImageUrl}
            alt={market.question}
            className="absolute inset-0 h-full w-full object-cover"
            initial={{
              opacity: 0.62,
              scale: 1.015,
              filter: 'brightness(0.86) saturate(0.94)',
            }}
            animate={{
              opacity: 0.92,
              scale: 1,
              filter: 'brightness(1) saturate(1)',
            }}
            transition={{
              duration: IMAGE_REVEAL_DURATION,
              ease: IMAGE_REVEAL_EASE,
            }}
            loading="eager"
            draggable={false}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none'
            }}
          />
        )}

        <motion.div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,9,12,0.12),rgba(8,9,12,0.5)_70%,rgba(8,9,12,0.74)_100%)]"
          initial={{ opacity: 0.72 }}
          animate={{ opacity: 1 }}
          transition={{ duration: IMAGE_REVEAL_DURATION, ease: IMAGE_REVEAL_EASE }}
        />
        <motion.div
          aria-hidden="true"
          className="absolute inset-0 bg-surface-950/28"
          initial={{ opacity: 0.18 }}
          animate={{ opacity: 0 }}
          transition={{ duration: IMAGE_DIM_FADE_DURATION, ease: IMAGE_REVEAL_EASE }}
        />

        <div className="absolute left-3 top-3 flex items-center gap-2.5 rounded-2xl border border-white/[0.08] bg-surface-950/52 px-2.5 py-2 shadow-[0_14px_40px_rgba(0,0,0,0.22)] backdrop-blur-md">
          <div className={cn(
            'h-9 w-9 overflow-hidden rounded-xl border border-white/[0.06] bg-surface-900/90',
            useContainThumb && 'flex items-center justify-center p-2'
          )}>
            <img
              src={thumbUrl}
              alt=""
              className={cn('h-full w-full', useContainThumb ? 'object-contain' : 'object-cover')}
              loading="lazy"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none'
              }}
            />
          </div>

          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-surface-500">
              Market Focus
            </p>
            <p className="mt-0.5 text-xs font-semibold text-white">
              {getCategoryName(market.category)}
            </p>
          </div>
        </div>

        <div className="absolute inset-x-3 bottom-3 lg:inset-x-auto lg:left-3 lg:max-w-[280px]">
          <div className="rounded-[22px] border border-white/[0.08] bg-surface-950/58 p-3 shadow-[0_18px_50px_rgba(0,0,0,0.24)] backdrop-blur-md">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-surface-500">
                  Leading Outcome
                </p>
                <p className="mt-0.5 text-sm font-semibold text-white">
                  {leadingOutcome?.label}
                </p>
              </div>

              <span className={cn('shrink-0 text-xl font-display font-bold tabular-nums', leadingOutcomeColor.text)}>
                {formatPercentage(leadingOutcome?.pct ?? 0)}
              </span>
            </div>

            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
              <div
                className={cn('h-full rounded-full transition-[width] duration-500', leadingOutcomeColor.bar)}
                style={{ width: `${leadingOutcomeWidth}%` }}
              />
            </div>

            <p className="mt-2.5 text-xs leading-6 text-surface-400">
              Current market consensus is leaning toward this outcome.
            </p>
          </div>
        </div>
      </div>

      {controls && (
        <div className="mt-2.5 flex justify-center">
          {controls}
        </div>
      )}
    </div>
  )
}

function KpiCard({
  icon,
  label,
  value,
  color,
}: {
  icon: ReactNode
  label: string
  value: string
  color: string
}) {
  return (
    <div className="rounded-2xl border border-white/[0.05] bg-white/[0.03] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.05] bg-surface-900/80', color)}>
          {icon}
        </div>
        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-surface-500">
          {label}
        </p>
      </div>

      <p className={cn('mt-4 text-2xl font-display font-bold tabular-nums', color)}>
        {value}
      </p>
    </div>
  )
}

function StatRow({
  icon,
  label,
  value,
  color,
}: {
  icon: ReactNode
  label: string
  value: string
  color: string
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className={cn('shrink-0', color)}>{icon}</div>
        <span className="truncate text-sm text-surface-400">{label}</span>
      </div>

      <span className={cn('shrink-0 text-sm font-semibold tabular-nums', color)}>
        {value}
      </span>
    </div>
  )
}

const slideVariants = {
  enter: {
    opacity: 0.76,
    scale: 0.995,
  },
  center: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: SLIDE_FADE_DURATION,
      ease: IMAGE_REVEAL_EASE,
      opacity: { duration: SLIDE_FADE_DURATION, ease: IMAGE_REVEAL_EASE },
      scale: { duration: SLIDE_FADE_DURATION, ease: IMAGE_REVEAL_EASE },
    },
  },
  exit: {
    opacity: 0.7,
    scale: 1.003,
    transition: {
      duration: 0.55,
      ease: [0.4, 0, 0.2, 1],
    },
  },
}

interface ActivityItem { id: string; message: string; time: number; marketId: string }

// Re-export for backward compat (Dashboard.tsx imports this type)
export interface TurboHeroMarket {
  marketId: string
  symbol: TurboSymbol
  baselinePrice: number
  deadlineMs: number
}

interface DashboardHeroProps {
  markets: Market[]
  activityFeed: ActivityItem[]
  onCreateMarket: () => void
  onMarketClick: (market: Market) => void
  /** If provided (non-null), renders TurboRollingView as the hero left panel */
  turboMarket?: TurboHeroMarket | null
  /** Symbols available for hero tab selector */
  turboSymbols?: string[]
  /** All fetched turbo markets keyed by symbol */
  turboMarkets?: Record<string, TurboHeroMarket>
  /** Currently selected hero symbol */
  activeHeroSymbol?: string
  /** Callback when user switches hero symbol tab */
  onHeroSymbolChange?: (symbol: string) => void
}

export function DashboardHero({
  markets, activityFeed, onCreateMarket, onMarketClick, turboMarket,
  turboSymbols, turboMarkets, activeHeroSymbol, onHeroSymbolChange,
}: DashboardHeroProps) {
  const [currentSlide, setCurrentSlide] = useState(0)
  const [isAutoPlaying, setIsAutoPlaying] = useState(true)
  const resumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const activeMarkets = useMemo(() => {
    const active = markets.filter(m => m.status === 1 && m.timeRemaining !== 'Ended')
    if (active.length === 0) return []

    const maxVolume = Math.max(...active.map(m => Number(m.totalVolume)), 1)
    const maxBets = Math.max(...active.map(m => m.totalBets), 1)
    const now = Date.now()

    const scored = active.map(m => {
      const volumeScore = Number(m.totalVolume) / maxVolume
      const betsScore = m.totalBets / maxBets
      const msLeft = (m.deadlineTimestamp || now + 86400000) - now
      const daysLeft = Math.max(msLeft / 86400000, 0.1)
      const recencyScore = Math.min(1, 7 / daysLeft)
      const score = volumeScore * 0.4 + betsScore * 0.3 + recencyScore * 0.3
      return { market: m, score }
    })

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map(s => s.market)
  }, [markets])

  const slideCount = activeMarkets.length

  const activeMarketCount = useMemo(
    () => markets.filter(m => m.status === 1 && m.timeRemaining !== 'Ended').length,
    [markets]
  )

  const totalBets = useMemo(
    () => markets.reduce((sum, m) => sum + m.totalBets, 0),
    [markets]
  )

  const aleoVolume = useMemo(
    () => markets.filter(m => !m.tokenType || m.tokenType === 'ALEO').reduce((sum, m) => sum + m.totalVolume, 0n),
    [markets]
  )

  const usdcxVolume = useMemo(
    () => markets.filter(m => m.tokenType === 'USDCX').reduce((sum, m) => sum + m.totalVolume, 0n),
    [markets]
  )

  const usadVolume = useMemo(
    () => markets.filter(m => m.tokenType === 'USAD').reduce((sum, m) => sum + m.totalVolume, 0n),
    [markets]
  )

  const recentActivity = useMemo(
    () => activityFeed.slice(0, 5),
    [activityFeed]
  )

  const activityTickerItems = useMemo(
    () => recentActivity.length > 1 ? [...recentActivity, ...recentActivity] : recentActivity,
    [recentActivity]
  )

  const activityItemHeight = 32
  const activityTotalHeight = recentActivity.length * activityItemHeight
  const activityVisibleHeight = Math.min(activityItemHeight * 3, activityTotalHeight)

  useEffect(() => {
    if (slideCount === 0) {
      setCurrentSlide(0)
      return
    }

    if (currentSlide >= slideCount) {
      setCurrentSlide(0)
    }
  }, [currentSlide, slideCount])

  useEffect(() => {
    const heroImages = activeMarkets
      .map(m => m.thumbnailUrl)
      .filter((src): src is string => Boolean(src))

    heroImages.forEach(src => {
      const image = new Image()
      image.decoding = 'async'
      image.src = src
    })
  }, [activeMarkets])

  useEffect(() => {
    if (!isAutoPlaying || slideCount <= 1) return

    const iv = setInterval(() => {
      setCurrentSlide(prev => (prev + 1) % slideCount)
    }, SLIDE_DURATION_MS)

    return () => clearInterval(iv)
  }, [isAutoPlaying, slideCount])

  useEffect(() => (
    () => {
      if (resumeTimeoutRef.current) {
        clearTimeout(resumeTimeoutRef.current)
      }
    }
  ), [])

  const pauseAutoPlay = useCallback(() => {
    setIsAutoPlaying(false)

    if (resumeTimeoutRef.current) {
      clearTimeout(resumeTimeoutRef.current)
    }

    resumeTimeoutRef.current = setTimeout(() => {
      setIsAutoPlaying(true)
      resumeTimeoutRef.current = null
    }, AUTO_PLAY_RESUME_MS)
  }, [])

  const goNext = useCallback(() => {
    if (slideCount <= 1) return
    pauseAutoPlay()
    setCurrentSlide(prev => (prev + 1) % slideCount)
  }, [slideCount, pauseAutoPlay])

  const goPrev = useCallback(() => {
    if (slideCount <= 1) return
    pauseAutoPlay()
    setCurrentSlide(prev => (prev - 1 + slideCount) % slideCount)
  }, [slideCount, pauseAutoPlay])

  const goTo = useCallback((index: number) => {
    pauseAutoPlay()
    setCurrentSlide(index)
  }, [pauseAutoPlay])

  const sliderControls = slideCount > 1 ? (
    <div className="flex w-fit items-center gap-2 rounded-full border border-white/[0.06] bg-surface-950/62 px-2.5 py-2 backdrop-blur-md shadow-[0_14px_36px_rgba(0,0,0,0.28)]">
      <button
        onClick={goPrev}
        className="flex h-8 w-8 items-center justify-center rounded-full text-surface-400 transition-all duration-200 hover:bg-white/[0.06] hover:text-white"
        aria-label="Previous"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      <div className="flex items-center gap-1.5 px-1">
        {activeMarkets.map((_, index) => (
          <button
            key={index}
            onClick={() => goTo(index)}
            className={cn(
              'relative overflow-hidden rounded-full transition-all duration-300',
              index === currentSlide ? 'h-1.5 w-8 bg-white/[0.10]' : 'h-1.5 w-1.5 bg-white/[0.18] hover:bg-white/[0.28]'
            )}
            aria-label={`Go to market ${index + 1}`}
          >
            {index === currentSlide && isAutoPlaying && (
              <motion.div
                key={`progress-${currentSlide}`}
                className="absolute inset-y-0 left-0 rounded-full bg-brand-400"
                initial={{ width: '0%' }}
                animate={{ width: '100%' }}
                transition={{ duration: SLIDE_DURATION_MS / 1000, ease: 'linear' }}
              />
            )}
            {index === currentSlide && !isAutoPlaying && (
              <div className="absolute inset-0 rounded-full bg-brand-400" />
            )}
          </button>
        ))}
      </div>

      <button
        onClick={goNext}
        className="flex h-8 w-8 items-center justify-center rounded-full text-surface-400 transition-all duration-200 hover:bg-white/[0.06] hover:text-white"
        aria-label="Next"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  ) : null

  return (
    <div className="mx-auto mb-6 max-w-[1360px] grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="glass-card relative min-h-[448px] overflow-hidden border border-white/[0.05] lg:min-h-[430px]">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(201,168,76,0.06),transparent_42%),radial-gradient(circle_at_bottom_left,rgba(0,220,130,0.05),transparent_30%)]" />
          <div
            className="absolute inset-0 opacity-[0.02]"
            style={{
              backgroundImage: 'linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)',
              backgroundSize: '48px 48px',
            }}
          />
        </div>

        {/* Symbol tabs — switch between BTC/ETH/SOL */}
        {turboSymbols && turboSymbols.length > 1 && (
          <div className="absolute bottom-14 left-3 z-20 flex gap-1.5">
            {turboSymbols.map((sym) => {
              const isActive = sym === (activeHeroSymbol || 'BTC')
              const hasMarket = !!(turboMarkets?.[sym])
              return (
                <button
                  key={sym}
                  onClick={() => onHeroSymbolChange?.(sym)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                    isActive
                      ? 'bg-brand-400/20 text-brand-300 border border-brand-400/30'
                      : 'bg-white/[0.04] text-surface-400 border border-white/[0.06] hover:bg-white/[0.08] hover:text-surface-200'
                  }`}
                >
                  {sym}
                  {hasMarket && <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-yes-400" />}
                </button>
              )
            })}
          </div>
        )}

        {/* Hero always shows Turbo rolling market — locked mode keeps the
            current round visible and shows a "Live Market" button when it
            resolves, instead of auto-rotating to the next round. */}
        <TurboRollingView
          symbol={(turboMarket?.symbol || activeHeroSymbol || 'BTC') as TurboSymbol}
          className="absolute inset-0 h-full rounded-none border-0 bg-transparent"
          compact
          lockedMode
        />
      </div>

      <div className="glass-card flex flex-col rounded-2xl border border-white/[0.05] p-3.5 lg:p-4">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-surface-500">
              Market Pulse
            </p>
          </div>

          <button
            onClick={onCreateMarket}
            className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all active:scale-[0.96]"
            style={{
              background: 'linear-gradient(135deg, #c9a84c 0%, #b8922e 100%)',
              color: '#08090c',
              boxShadow: '0 2px 8px rgba(201, 168, 76, 0.2)',
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            New Market
          </button>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-3">
          <KpiCard
            icon={<Activity className="h-4 w-4" />}
            label="Active Markets"
            value={activeMarketCount.toLocaleString()}
            color="text-yes-400"
          />
          <KpiCard
            icon={<Trophy className="h-4 w-4" />}
            label="Total Bets"
            value={totalBets.toLocaleString()}
            color="text-brand-300"
          />
        </div>

        <div className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-4">
          <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.18em] text-surface-500">
            Liquidity by Token
          </p>

          <div className="divide-y divide-white/[0.04]">
            <StatRow
              icon={<img src="/aleo-logo.png" alt="ALEO" className="h-4 w-4 rounded-full object-contain" />}
              label="ALEO Volume"
              value={`${formatCredits(aleoVolume)} ALEO`}
              color="text-brand-400"
            />
            <StatRow
              icon={<img src="/usdcx-logo.png" alt="USDCX" className="h-4 w-4 rounded-full object-contain" />}
              label="USDCX Volume"
              value={`${formatCredits(usdcxVolume)} USDCX`}
              color="text-blue-400"
            />
            <StatRow
              icon={<img src="/usad-logo.svg" alt="USAD" className="h-4 w-4 rounded-full object-contain" />}
              label="USAD Volume"
              value={`${formatCredits(usadVolume)} USAD`}
              color="text-purple-400"
            />
          </div>
        </div>

        <div className="mt-3 rounded-2xl border border-white/[0.05] bg-white/[0.02] p-4">
          <div className="mb-3 flex items-center gap-2">
            <Activity className="h-4 w-4 text-brand-400" />
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-surface-500">
              Recent Activity
            </p>
          </div>

          {recentActivity.length > 0 ? (
            <div
              className="relative overflow-hidden rounded-xl border border-white/[0.04] bg-surface-950/36"
              style={{ height: activityVisibleHeight }}
            >
              <div
                className={recentActivity.length > 1 ? 'animate-ticker-up' : undefined}
                style={{
                  '--ticker-distance': `-${activityTotalHeight}px`,
                  animationDuration: `${recentActivity.length * 4}s`,
                } as CSSProperties}
              >
                {activityTickerItems.map((item, index) => (
                  <button
                    key={`${item.id}-${index}`}
                    onClick={() => {
                      const market = markets.find(entry => entry.id === item.marketId)
                      if (market) onMarketClick(market)
                    }}
                    className="flex w-full items-center gap-2 px-2.5 text-left transition-colors hover:bg-white/[0.03]"
                    style={{ height: activityItemHeight }}
                  >
                    <div className="h-1 w-1 shrink-0 rounded-full bg-brand-400" />
                    <p className="flex-1 truncate text-[11px] text-surface-400">
                      {item.message}
                    </p>
                    <ChevronRight className="h-3 w-3 shrink-0 text-surface-600" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-white/[0.06] px-3 py-4 text-sm text-surface-500">
              Activity will appear here once markets start moving.
            </div>
          )}
        </div>

        <div className="mt-auto pt-3">
          <div className="flex items-center justify-center gap-2 rounded-xl border border-white/[0.05] bg-white/[0.02] px-4 py-3 text-xs text-surface-500">
            <div className="h-1.5 w-1.5 rounded-full bg-yes-400 animate-pulse" />
            <span>Live on Aleo Testnet</span>
          </div>
        </div>
      </div>
    </div>
  )
}
