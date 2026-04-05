import { motion } from 'framer-motion'
import { useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { TrendingUp, Clock, Users, Shield, ChevronRight, Flame, BarChart3 } from 'lucide-react'
import { useRealMarketsStore } from '@/lib/market-store'
import { type Market } from '@/lib/store'
import { cn, formatCredits, formatPercentage, getCategoryName, getCategoryEmoji, getCategoryColor } from '@/lib/utils'
import { useLiveCountdown } from '@/hooks/useGlobalTicker'
import { getMarketThumbnail, isContainThumbnail } from '@/lib/market-thumbnails'
import { getMarketOutcomeSummaries } from '@/lib/market-outcomes'

// ── Single Trending Card (landing-specific, self-contained) ──
function TrendingCard({ market, index }: { market: Market; index: number }) {
  const navigate = useNavigate()
  const timeRemaining = useLiveCountdown(market.deadlineTimestamp, market.timeRemaining)
  const isExpired = timeRemaining === 'Ended' || market.status !== 1

  const numOutcomes = market.numOutcomes ?? 2
  const outcomeSummaries = useMemo(() => getMarketOutcomeSummaries(market), [market])

  const isBinary = numOutcomes === 2
  const categoryColor = getCategoryColor(market.category)
  const thumbUrl = getMarketThumbnail(market.question, market.category, market.thumbnailUrl)
  const useContain = isContainThumbnail(thumbUrl)

  const isHot = market.tags?.includes('Hot') || market.tags?.includes('Trending') || market.tags?.includes('Featured')

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.08, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      onClick={() => navigate('/dashboard')}
      className={cn(
        "landing-market-card group relative overflow-hidden rounded-2xl cursor-pointer",
        "transition-all duration-300",
        isExpired && "opacity-60",
      )}
    >
      {/* Hover glow */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-2xl"
        style={{ background: `radial-gradient(ellipse at 50% 0%, ${categoryColor.glow}, transparent 70%)` }}
      />

      <div className="relative p-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-lg" role="img">{getCategoryEmoji(market.category)}</span>
            <span className={cn(
              "px-2.5 py-1 rounded-lg text-xs font-semibold",
              categoryColor.text
            )} style={{
              background: 'rgba(255, 255, 255, 0.03)',
            }}>
              {getCategoryName(market.category)}
            </span>
            {isHot && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold text-brand-400 bg-brand-500/8">
                <Flame className="w-3 h-3" />
                Hot
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0 px-2 py-1 rounded-md bg-brand-500/8">
            <Shield className="w-3 h-3 text-brand-400" />
            <span className="text-[10px] text-brand-400 font-semibold">Private</span>
          </div>
        </div>

        {/* Question + Thumbnail */}
        <div className="flex gap-3 mb-4">
          <div className={cn(
            'w-10 h-10 rounded-xl overflow-hidden shrink-0 bg-surface-800',
            useContain && 'p-1.5 flex items-center justify-center'
          )}>
            <img
              src={thumbUrl}
              alt=""
              className={cn('w-full h-full', useContain ? 'object-contain' : 'object-cover')}
              loading="lazy"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          </div>
          <h3 className="text-base font-semibold text-white line-clamp-2 group-hover:text-brand-300 transition-colors leading-snug">
            {market.question}
          </h3>
        </div>

        {/* Odds Display */}
        <div className="mb-4">
          {isBinary ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-yes-500/5">
                <span className="text-sm text-yes-400 font-medium">{outcomeSummaries[0]?.label || 'Yes'}</span>
                <span className="text-sm font-bold text-yes-400 tabular-nums">{formatPercentage(outcomeSummaries[0]?.percentage ?? 0)}</span>
              </div>
              <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-no-500/5">
                <span className="text-sm text-no-400 font-medium">{outcomeSummaries[1]?.label || 'No'}</span>
                <span className="text-sm font-bold text-no-400 tabular-nums">{formatPercentage(outcomeSummaries[1]?.percentage ?? 0)}</span>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-1.5">
                {outcomeSummaries.map((outcome, i) => {
                  const OUTCOME_BG_COLORS = [
                    'bg-yes-500/5', 'bg-no-500/5', 'bg-purple-500/5', 'bg-yellow-500/5'
                  ]
                  const OUTCOME_TEXT_COLORS = [
                    'text-yes-400', 'text-no-400', 'text-purple-400', 'text-yellow-400'
                  ]
                  return (
                    <div key={i} className={cn(
                      'flex items-center gap-2 px-2.5 py-2 rounded-lg',
                      OUTCOME_BG_COLORS[i] || OUTCOME_BG_COLORS[0]
                    )}>
                      <span className={cn('text-xs truncate font-medium', OUTCOME_TEXT_COLORS[i] || OUTCOME_TEXT_COLORS[0])}>{outcome.label}</span>
                      <span className={cn('text-sm font-bold ml-auto tabular-nums', OUTCOME_TEXT_COLORS[i] || OUTCOME_TEXT_COLORS[0])}>{formatPercentage(outcome.percentage)}</span>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 pt-3 border-t border-white/[0.03] text-xs text-surface-500">
          <span className="flex items-center gap-1.5 tabular-nums">
            <TrendingUp className="w-3 h-3" />
            {formatCredits(market.totalVolume, 0)} {market.tokenType ?? 'ALEO'}
          </span>
          <span className="flex items-center gap-1.5 tabular-nums">
            <Users className="w-3 h-3" />
            {market.totalBets}
          </span>
          <span className="flex items-center gap-1.5 tabular-nums ml-auto">
            <Clock className="w-3 h-3" />
            {timeRemaining}
          </span>
        </div>
      </div>
    </motion.div>
  )
}

// ── Main Section ──
export function TrendingMarkets() {
  const { markets, fetchMarkets, isLoading } = useRealMarketsStore()
  const navigate = useNavigate()

  useEffect(() => {
    if (markets.length === 0) {
      fetchMarkets()
    }
  }, [markets.length, fetchMarkets])

  // Get trending/hot/featured markets first, then by volume
  const trendingMarkets = useMemo(() => {
    const hot = markets.filter(m =>
      m.status === 1 &&
      (m.tags?.includes('Hot') || m.tags?.includes('Trending') || m.tags?.includes('Featured'))
    )
    const rest = markets.filter(m =>
      m.status === 1 &&
      !m.tags?.includes('Hot') && !m.tags?.includes('Trending') && !m.tags?.includes('Featured')
    ).sort((a, b) => Number(b.totalVolume - a.totalVolume))

    return [...hot, ...rest].slice(0, 6)
  }, [markets])

  if (isLoading) {
    return (
      <section className="relative py-24 z-10">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-brand-400 mb-4">Live Markets</p>
            <h2 className="font-display text-[2.5rem] lg:text-[3rem] leading-[1.1] tracking-tight text-white">
              Trending <span className="gradient-text">Predictions</span>
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="landing-market-card rounded-2xl p-6 animate-pulse">
                <div className="h-4 bg-surface-700 rounded w-1/4 mb-4" />
                <div className="h-6 bg-surface-700 rounded w-3/4 mb-4" />
                <div className="h-2 bg-surface-700 rounded w-full mb-4" />
                <div className="space-y-2 mb-4">
                  <div className="h-10 bg-surface-800 rounded-lg" />
                  <div className="h-10 bg-surface-800 rounded-lg" />
                </div>
                <div className="flex gap-4 pt-3 border-t border-white/[0.04]">
                  <div className="h-3 bg-surface-800 rounded w-16" />
                  <div className="h-3 bg-surface-800 rounded w-12" />
                  <div className="h-3 bg-surface-800 rounded w-14 ml-auto" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    )
  }

  if (trendingMarkets.length === 0) return null

  return (
    <section className="relative py-24 z-10">
      {/* Separator line */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-px bg-gradient-to-r from-transparent via-brand-400/20 to-transparent" />

      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="flex flex-col sm:flex-row items-start sm:items-end justify-between mb-12 gap-4"
        >
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-brand-400 mb-4">Live Markets</p>
            <h2 className="font-display text-[2.5rem] lg:text-[3rem] leading-[1.1] tracking-tight text-white">
              Trending <span className="gradient-text">Predictions</span>
            </h2>
            <p className="text-surface-400 mt-3">The most active prediction markets right now</p>
          </div>
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-surface-400 hover:text-white rounded-lg hover:bg-white/[0.04] transition-all duration-200"
          >
            View All Markets
            <ChevronRight className="w-4 h-4" />
          </button>
        </motion.div>

        {/* Markets Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {trendingMarkets.map((market, i) => (
            <TrendingCard key={market.id} market={market} index={i} />
          ))}
        </div>

        {/* Bottom stats strip */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 }}
          className="mt-12 flex flex-wrap items-center justify-center gap-8 py-6 rounded-2xl"
        >
          {[
            { icon: <BarChart3 className="w-4 h-4 text-brand-400" />, label: 'Total Volume', value: `${formatCredits(markets.reduce((sum, m) => sum + m.totalVolume, 0n), 0)} ALEO` },
            { icon: <Flame className="w-4 h-4 text-brand-400" />, label: 'Active Markets', value: markets.filter(m => m.status === 1).length.toString() },
            { icon: <Users className="w-4 h-4 text-brand-400" />, label: 'Total Bets', value: markets.reduce((sum, m) => sum + m.totalBets, 0).toLocaleString() },
            { icon: <Shield className="w-4 h-4 text-brand-400" />, label: '100% Private', value: 'ZK Proofs' },
          ].map((stat) => (
            <div key={stat.label} className="flex items-center gap-3 px-4">
              {stat.icon}
              <div>
                <p className="text-sm font-semibold text-white tabular-nums">{stat.value}</p>
                <p className="text-[11px] text-surface-500">{stat.label}</p>
              </div>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
