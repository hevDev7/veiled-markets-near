import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronLeft,
  ChevronRight,
  Activity,
  Trophy,
  Zap,
  Plus,
  Clock,
  TrendingUp,
} from 'lucide-react'
import { type Market } from '@/lib/store'
import { cn, formatCredits, formatPercentage, getCategoryEmoji, getCategoryName } from '@/lib/utils'
import { useLiveCountdown } from '@/hooks/useGlobalTicker'
import { calculateAllPrices, type AMMReserves } from '@/lib/amm'

// Category-themed images from Unsplash (free, no attribution required for hotlinking)
const CATEGORY_IMAGES: Record<number, string> = {
  1: 'https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=600&h=400&fit=crop&q=80', // Politics — Capitol
  2: 'https://images.unsplash.com/photo-1461896836934-bd45ba8c0e78?w=600&h=400&fit=crop&q=80', // Sports — Stadium
  3: 'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=600&h=400&fit=crop&q=80', // Crypto — Bitcoin
  4: 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=600&h=400&fit=crop&q=80', // Culture — Festival
  5: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=600&h=400&fit=crop&q=80', // AI & Tech — AI chip
  6: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=600&h=400&fit=crop&q=80', // Macro — Charts
  7: 'https://images.unsplash.com/photo-1507413245164-6160d8298b31?w=600&h=400&fit=crop&q=80', // Science — Lab
  8: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=600&h=400&fit=crop&q=80', // Climate — Nature
  99: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=600&h=400&fit=crop&q=80', // Other — Globe
}

// Gradient fallbacks per category (if image fails)
const CATEGORY_GRADIENTS: Record<number, string> = {
  1: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(139, 92, 246, 0.08) 100%)',
  2: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(6, 182, 212, 0.08) 100%)',
  3: 'linear-gradient(135deg, rgba(247, 147, 26, 0.15) 0%, rgba(201, 168, 76, 0.08) 100%)',
  4: 'linear-gradient(135deg, rgba(236, 72, 153, 0.15) 0%, rgba(244, 63, 94, 0.08) 100%)',
  5: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(59, 130, 246, 0.08) 100%)',
  6: 'linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(6, 182, 212, 0.08) 100%)',
  7: 'linear-gradient(135deg, rgba(6, 182, 212, 0.15) 0%, rgba(16, 185, 129, 0.08) 100%)',
  8: 'linear-gradient(135deg, rgba(20, 184, 166, 0.15) 0%, rgba(16, 185, 129, 0.08) 100%)',
  99: 'linear-gradient(135deg, rgba(201, 168, 76, 0.1) 0%, rgba(0, 220, 130, 0.05) 100%)',
}

const OUTCOME_COLORS = [
  { text: 'text-yes-400', bg: 'bg-yes-400', border: 'border-yes-400/20' },
  { text: 'text-no-400', bg: 'bg-no-400', border: 'border-no-400/20' },
  { text: 'text-purple-400', bg: 'bg-purple-400', border: 'border-purple-400/20' },
  { text: 'text-yellow-400', bg: 'bg-yellow-400', border: 'border-yellow-400/20' },
]

const SLIDE_DURATION_MS = 8000
const AUTO_PLAY_RESUME_MS = 10000
const IMAGE_REVEAL_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]
const IMAGE_REVEAL_DURATION = 2.1
const IMAGE_DIM_FADE_DURATION = 1.75
const SLIDE_FADE_DURATION = 1.2

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

  const outcomeData = useMemo(() => {
    if (isBinary) {
      return [
        { label: outcomeLabels[0], pct: market.yesPercentage },
        { label: outcomeLabels[1], pct: market.noPercentage },
      ]
    }
    return outcomeLabels.map((label, i) => ({ label, pct: (prices[i] ?? 0) * 100 }))
  }, [isBinary, outcomeLabels, market.yesPercentage, market.noPercentage, prices])

  return (
    <div className="h-full flex flex-col p-6">
      {/* Top: Category + Title in same row */}
      <div className="flex items-start gap-3 mb-3">
        <div className="flex items-center gap-2 flex-shrink-0 pt-1">
          <span className="text-xs">{getCategoryEmoji(market.category)}</span>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider text-surface-300 bg-white/[0.04] border border-white/[0.06]">
            {getCategoryName(market.category)}
          </span>
        </div>
        <h3 onClick={onClick}
          className="text-sm lg:text-base font-semibold text-white hover:text-brand-300 transition-colors leading-snug line-clamp-2 cursor-pointer flex-1">
          {market.question}
        </h3>
        <div className="flex items-center gap-1.5 text-xs text-surface-400 flex-shrink-0 pt-1.5">
          <Clock className="w-3.5 h-3.5" />
          <span className="tabular-nums font-medium">{timeRemaining}</span>
        </div>
      </div>

      {market.description && (
        <p className="text-xs text-surface-500 line-clamp-1 mb-4">{market.description}</p>
      )}
      {!market.description && <div className="mb-4" />}

      {/* Full-width image with outcomes overlaid on the left */}
      <div className="flex-1 min-h-[220px] min-w-0 relative rounded-xl overflow-hidden">
        <motion.img
          key={`image-${market.id}`}
          src={CATEGORY_IMAGES[market.category] || CATEGORY_IMAGES[99]}
          alt={getCategoryName(market.category)}
          className="absolute inset-0 w-full h-full object-cover"
          initial={{
            opacity: 0.78,
            scale: 1.03,
            filter: 'blur(12px) brightness(0.74) saturate(0.9)',
          }}
          animate={{
            opacity: 1,
            scale: 1,
            filter: 'blur(0px) brightness(1) saturate(1)',
          }}
          transition={{
            duration: IMAGE_REVEAL_DURATION,
            ease: IMAGE_REVEAL_EASE,
            opacity: { duration: 1.45, ease: IMAGE_REVEAL_EASE },
            scale: { duration: IMAGE_REVEAL_DURATION, ease: IMAGE_REVEAL_EASE },
            filter: { duration: IMAGE_REVEAL_DURATION, ease: IMAGE_REVEAL_EASE },
          }}
          loading="eager"
          draggable={false}
          onError={(e) => {
            // Hide image on error, gradient fallback shows through
            (e.target as HTMLImageElement).style.display = 'none'
          }}
        />
        {/* Gradient overlay for readability */}
        <motion.div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t from-surface-950/80 via-surface-950/30 to-transparent"
          initial={{ opacity: 0.82 }}
          animate={{ opacity: 1 }}
          transition={{ duration: IMAGE_REVEAL_DURATION, ease: IMAGE_REVEAL_EASE }}
        />
        <motion.div
          aria-hidden="true"
          className="absolute inset-0 bg-surface-950/40"
          initial={{ opacity: 0.24 }}
          animate={{ opacity: 0 }}
          transition={{ duration: IMAGE_DIM_FADE_DURATION, ease: IMAGE_REVEAL_EASE }}
        />
        {/* Category gradient fallback */}
        <div
          className="absolute inset-0 -z-10"
          style={{ background: CATEGORY_GRADIENTS[market.category] || CATEGORY_GRADIENTS[99] }}
        />
        {/* Outcome pills over image */}
        <div className="absolute top-3 left-3 z-[2] flex w-[min(240px,calc(100%-24px))] flex-col gap-2">
          {outcomeData.map((item, i) => {
            const colors = OUTCOME_COLORS[i] || OUTCOME_COLORS[0]
            return (
              <div key={i} className={cn(
                'flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl border backdrop-blur-md transition-colors',
                'bg-surface-950/52 shadow-[0_10px_30px_rgba(0,0,0,0.2)]',
                colors.border
              )}>
                <div className="flex items-center gap-2 min-w-0">
                  <div className={cn('w-2.5 h-2.5 rounded-full shrink-0', colors.bg)} />
                  <span className="text-xs text-white/88 truncate">{item.label}</span>
                </div>
                <span className={cn('text-sm font-bold tabular-nums shrink-0', colors.text)}>
                  {formatPercentage(item.pct)}
                </span>
              </div>
            )
          })}
        </div>
        {/* Category label overlay */}
        <div className="absolute bottom-3 left-3 flex items-center gap-2">
          <span className="text-2xl">{getCategoryEmoji(market.category)}</span>
          <span className="text-xs font-semibold text-white/80">{getCategoryName(market.category)}</span>
        </div>
      </div>

      {/* Bottom stats */}
      <div onClick={onClick}
        className="flex items-center gap-4 text-xs text-surface-400 pt-3 mt-1 border-t border-white/[0.04] cursor-pointer">
        <div className="flex items-center gap-1.5">
          <TrendingUp className="w-3.5 h-3.5" />
          <span className="tabular-nums">{formatCredits(market.totalVolume, 0)} vol</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="tabular-nums">{market.totalBets} bets</span>
        </div>
        <div className="ml-auto text-brand-400 font-semibold hover:text-brand-300 transition-colors flex items-center gap-1">
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
    <div className="flex items-center justify-between py-3">
      <div className="flex items-center gap-2.5">
        <div className={cn('', color)}>{icon}</div>
        <span className="text-sm text-surface-400">{label}</span>
      </div>
      <span className={cn('text-sm font-bold tabular-nums', color)}>{value}</span>
    </div>
  )
}

// ── Slide animation — gentle fade while image handles the blur-to-clear reveal ──
const slideVariants = {
  enter: () => ({
    opacity: 0.9,
    scale: 1,
    zIndex: 2,
    transition: {
      duration: 0,
    },
  }),
  center: {
    opacity: 1,
    scale: 1,
    zIndex: 2,
    transition: {
      duration: SLIDE_FADE_DURATION,
      ease: IMAGE_REVEAL_EASE,
      opacity: { duration: 1.05, ease: IMAGE_REVEAL_EASE },
      scale: { duration: SLIDE_FADE_DURATION, ease: IMAGE_REVEAL_EASE },
    },
  },
  exit: {
    opacity: 0.72,
    scale: 1.004,
    zIndex: 1,
    transition: {
      duration: 0.9,
      ease: [0.4, 0, 0.2, 1],
      opacity: { duration: 0.78, ease: [0.4, 0, 0.2, 1] },
      scale: { duration: 0.9, ease: [0.4, 0, 0.2, 1] },
    },
  },
}

// ── Main Hero ──
interface ActivityItem { id: string; message: string; time: number; marketId: string }

interface DashboardHeroProps {
  markets: Market[]
  activityFeed: ActivityItem[]
  onCreateMarket: () => void
  onMarketClick: (market: Market) => void
}

export function DashboardHero({
  markets, activityFeed, onCreateMarket, onMarketClick,
}: DashboardHeroProps) {
  const [currentSlide, setCurrentSlide] = useState(0)
  const [isAutoPlaying, setIsAutoPlaying] = useState(true)
  const resumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const activeMarkets = useMemo(
    () => markets.filter(m => m.status === 1 && m.timeRemaining !== 'Ended').slice(0, 8),
    [markets]
  )
  const slideCount = activeMarkets.length

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
    const categories = [...new Set(activeMarkets.map(m => m.category))]
    categories.forEach(category => {
      const src = CATEGORY_IMAGES[category] || CATEGORY_IMAGES[99]
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

  // Pause autoplay on manual interaction, resume after a short idle period.
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

  const goNext = useCallback(() => { pauseAutoPlay(); setCurrentSlide(p => (p + 1) % slideCount) }, [slideCount, pauseAutoPlay])
  const goPrev = useCallback(() => { pauseAutoPlay(); setCurrentSlide(p => (p - 1 + slideCount) % slideCount) }, [slideCount, pauseAutoPlay])
  const goTo = useCallback((i: number) => { pauseAutoPlay(); setCurrentSlide(i) }, [pauseAutoPlay])

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-4 mb-6">
      {/* Left: Market Slider */}
      <div className="relative rounded-2xl overflow-hidden min-h-[480px]"
        style={{
          background: 'linear-gradient(135deg, rgba(22, 26, 36, 0.8) 0%, rgba(13, 15, 20, 0.9) 100%)',
          border: '1px solid rgba(255, 255, 255, 0.04)',
          boxShadow: '0 1px 0 0 rgba(255, 255, 255, 0.02) inset, 0 4px 20px -4px rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(12px)',
        }}>
        {activeMarkets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <div className="w-14 h-14 rounded-2xl bg-brand-400/[0.06] border border-brand-400/[0.1] flex items-center justify-center mb-4">
              <TrendingUp className="w-7 h-7 text-brand-400" />
            </div>
            <h3 className="text-lg font-display font-bold text-white mb-2">No Active Markets</h3>
            <p className="text-sm text-surface-400 mb-4">Be the first to create a prediction market</p>
            <button onClick={onCreateMarket} className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm active:scale-[0.96] transition-all"
              style={{ background: 'linear-gradient(135deg, #c9a84c 0%, #b8922e 100%)', color: '#08090c', boxShadow: '0 2px 8px rgba(201, 168, 76, 0.25)' }}>
              <Plus className="w-4 h-4" /> Create Market
            </button>
          </div>
        ) : (
          <>
            <AnimatePresence initial={false} mode="sync">
              <motion.div
                key={activeMarkets[currentSlide]?.id ?? currentSlide}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                className="absolute inset-0"
                style={{ willChange: 'transform, opacity', transformOrigin: 'center center' }}
              >
                <motion.div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 z-[1]"
                  initial={{ opacity: 0.03 }}
                  animate={{ opacity: 0 }}
                  exit={{ opacity: 0.02 }}
                  transition={{ duration: 1.0, ease: IMAGE_REVEAL_EASE }}
                  style={{ background: 'linear-gradient(180deg, rgba(9, 12, 18, 0.03) 0%, rgba(9, 12, 18, 0.06) 100%)' }}
                />
                <MarketSlide market={activeMarkets[currentSlide]} onClick={() => onMarketClick(activeMarkets[currentSlide])} />
              </motion.div>
            </AnimatePresence>

            {slideCount > 1 && (
              <>
                <button onClick={goPrev} className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-xl bg-surface-950/60 border border-white/[0.06] text-surface-400 hover:text-white hover:bg-surface-950/80 hover:border-white/[0.12] hover:scale-110 active:scale-95 transition-all duration-200 backdrop-blur-md z-10" aria-label="Previous">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button onClick={goNext} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-xl bg-surface-950/60 border border-white/[0.06] text-surface-400 hover:text-white hover:bg-surface-950/80 hover:border-white/[0.12] hover:scale-110 active:scale-95 transition-all duration-200 backdrop-blur-md z-10" aria-label="Next">
                  <ChevronRight className="w-4 h-4" />
                </button>
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 z-10">
                  {activeMarkets.map((_, i) => (
                    <button key={i} onClick={() => goTo(i)}
                      className={cn(
                        'relative rounded-full transition-all duration-500 overflow-hidden',
                        i === currentSlide ? 'w-8 h-1.5 bg-white/[0.1]' : 'w-1.5 h-1.5 bg-white/[0.1] hover:bg-white/[0.25]'
                      )}
                      aria-label={`Go to market ${i + 1}`}
                    >
                      {i === currentSlide && isAutoPlaying && (
                        <motion.div
                          className="absolute inset-y-0 left-0 bg-brand-400 rounded-full"
                          initial={{ width: '0%' }}
                          animate={{ width: '100%' }}
                          transition={{ duration: SLIDE_DURATION_MS / 1000, ease: 'linear' }}
                          key={`progress-${currentSlide}`}
                        />
                      )}
                      {i === currentSlide && !isAutoPlaying && (
                        <div className="absolute inset-0 bg-brand-400 rounded-full" />
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
            <div className="hidden">
              <Zap className="w-3 h-3" /> Featured
            </div>
          </>
        )}
      </div>

      {/* Right: Platform Stats Panel */}
      <div className="rounded-2xl p-5 flex flex-col"
        style={{
          background: 'linear-gradient(135deg, rgba(22, 26, 36, 0.8) 0%, rgba(13, 15, 20, 0.9) 100%)',
          border: '1px solid rgba(255, 255, 255, 0.04)',
          boxShadow: '0 1px 0 0 rgba(255, 255, 255, 0.02) inset, 0 4px 20px -4px rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(12px)',
        }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-white">Platform Stats</h2>
          <div className="flex items-center gap-1.5">
            <button onClick={onCreateMarket}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg font-semibold text-xs active:scale-[0.96] transition-all"
              style={{ background: 'linear-gradient(135deg, #c9a84c 0%, #b8922e 100%)', color: '#08090c', boxShadow: '0 2px 8px rgba(201, 168, 76, 0.2)' }}>
              <Plus className="w-3.5 h-3.5" /> New Market
            </button>
          </div>
        </div>

        <div className="flex-1 divide-y divide-white/[0.04]">
          <StatRow icon={<img src="/aleo-logo.png" alt="ALEO" className="w-4 h-4 rounded-full object-contain" />} label="Volume (ALEO)" value={formatCredits(markets.filter(m => !m.tokenType || m.tokenType === 'ALEO').reduce((s, m) => s + m.totalVolume, 0n)) + ' ALEO'} color="text-brand-400" />
          <StatRow icon={<img src="/usdcx-logo.png" alt="USDCX" className="w-4 h-4 rounded-full object-contain" />} label="Volume (USDCX)" value={formatCredits(markets.filter(m => m.tokenType === 'USDCX').reduce((s, m) => s + m.totalVolume, 0n)) + ' USDCX'} color="text-blue-400" />
          <StatRow icon={<img src="/usad-logo.svg" alt="USAD" className="w-4 h-4 rounded-full object-contain" />} label="Volume (USAD)" value={formatCredits(markets.filter(m => m.tokenType === 'USAD').reduce((s, m) => s + m.totalVolume, 0n)) + ' USAD'} color="text-purple-400" />
          <StatRow icon={<Activity className="w-4 h-4" />} label="Active Markets" value={String(markets.filter(m => m.status === 1 && m.timeRemaining !== 'Ended').length)} color="text-yes-400" />
          <StatRow icon={<Trophy className="w-4 h-4" />} label="Total Bets" value={String(markets.reduce((sum, m) => sum + m.totalBets, 0))} color="text-brand-300" />
        </div>

        {/* Recent Activity */}
        {activityFeed.length > 0 && (
          <div className="mt-3 pt-3 border-t border-white/[0.04]">
            <div className="flex items-center gap-2 mb-2.5">
              <Zap className="w-3.5 h-3.5 text-brand-400" />
              <span className="text-xs font-semibold text-white">Recent Activity</span>
            </div>
            <div className="space-y-1">
              {activityFeed.slice(0, 4).map(item => (
                <div key={item.id}
                  onClick={() => { const m = markets.find(mk => mk.id === item.marketId); if (m) onMarketClick(m) }}
                  className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-white/[0.03] cursor-pointer transition-colors">
                  <div className="w-1.5 h-1.5 rounded-full bg-brand-400 flex-shrink-0" />
                  <p className="text-[11px] text-surface-400 flex-1 truncate">{item.message}</p>
                  <ChevronRight className="w-3 h-3 text-surface-600 flex-shrink-0" />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-3 pt-3 border-t border-white/[0.04] flex items-center justify-center gap-2 text-xs text-surface-500">
          <div className="w-1.5 h-1.5 rounded-full bg-yes-400 animate-pulse" />
          <span>Live on Aleo Testnet</span>
        </div>
      </div>
    </div>
  )
}
