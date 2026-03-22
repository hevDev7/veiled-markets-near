import { Clock, Users, TrendingUp, Shield } from 'lucide-react'
import { useMemo, useRef } from 'react'
import { useLiveCountdown } from '@/hooks/useGlobalTicker'
import { type Market } from '@/lib/store'
import { cn, formatCredits, formatPercentage, getCategoryName, getCategoryEmoji, getCategoryStrip, getCategoryColor } from '@/lib/utils'
import { Tooltip } from '@/components/ui/Tooltip'
import { StatusBadge, getStatusVariant } from '@/components/ui/StatusBadge'
import { calculateAllPrices, type AMMReserves } from '@/lib/amm'
import { getMarketThumbnail } from '@/lib/market-thumbnails'

// Colors for up to 4 outcomes
const OUTCOME_COLORS = [
  { text: 'text-yes-400', bg: 'bg-yes-500/10', border: 'border-yes-500/20', bar: 'bg-yes-500', hoverBg: 'hover:bg-yes-500/20', hoverBorder: 'hover:border-yes-500/40' },
  { text: 'text-no-400', bg: 'bg-no-500/10', border: 'border-no-500/20', bar: 'bg-no-500', hoverBg: 'hover:bg-no-500/20', hoverBorder: 'hover:border-no-500/40' },
  { text: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20', bar: 'bg-purple-500', hoverBg: 'hover:bg-purple-500/20', hoverBorder: 'hover:border-purple-500/40' },
  { text: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', bar: 'bg-yellow-500', hoverBg: 'hover:bg-yellow-500/20', hoverBorder: 'hover:border-yellow-500/40' },
]

interface MarketCardProps {
  market: Market
  index: number
  onClick: () => void
}

export function MarketCard({ market, index, onClick }: MarketCardProps) {
  const timeRemaining = useLiveCountdown(market.deadlineTimestamp, market.timeRemaining)
  const isExpired = timeRemaining === 'Ended' || market.status !== 1
  const statusVariant = getStatusVariant(market.status, isExpired)

  const numOutcomes = market.numOutcomes ?? 2
  const outcomeLabels = market.outcomeLabels ?? (numOutcomes === 2 ? ['Yes', 'No'] : Array.from({ length: numOutcomes }, (_, i) => `Outcome ${i + 1}`))

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

  const isBinary = numOutcomes === 2
  const categoryColor = getCategoryColor(market.category)

  const isHot = market.tags?.includes('Hot') || market.tags?.includes('Trending') || market.tags?.includes('Featured')

  // Only animate on first mount, not on data refreshes
  const hasAnimated = useRef(false)
  const shouldAnimate = !hasAnimated.current
  if (shouldAnimate) hasAnimated.current = true

  return (
    <div
      onClick={onClick}
      style={shouldAnimate ? { animationDelay: `${index * 60}ms` } : undefined}
      className={cn(
        "market-card group relative overflow-hidden",
        shouldAnimate && "animate-fade-in-up",
        getCategoryStrip(market.category),
        isExpired && "opacity-60",
        isHot && "pulse-glow"
      )}
    >
      {/* Subtle category glow on hover */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-2xl"
        style={{ background: `radial-gradient(ellipse at 50% 0%, ${categoryColor.glow}, transparent 70%)` }}
      />

      <div className="relative">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-lg" role="img">{getCategoryEmoji(market.category)}</span>
            <span className={cn("category-badge", categoryColor.text)}>{getCategoryName(market.category)}</span>
            {isExpired && <StatusBadge variant={statusVariant} />}
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0 px-2 py-1 rounded-md bg-brand-500/8">
            <Shield className="w-3 h-3 text-brand-400" />
            <span className="text-[10px] text-brand-400 font-semibold">Private</span>
          </div>
        </div>

        {/* Question + Thumbnail */}
        <div className="flex gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 bg-surface-800 border border-white/[0.06]">
            <img
              src={getMarketThumbnail(market.question, market.category, market.thumbnailUrl)}
              alt=""
              className="w-full h-full object-cover"
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
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-surface-800/40 border border-surface-700/30">
                <div className="w-2.5 h-2.5 rounded-full bg-yes-500 shadow-[0_0_6px_rgba(16,185,129,0.4)] shrink-0" />
                <span className="text-sm text-surface-300 font-medium">{outcomeLabels[0]}</span>
                <div className="flex-1 h-1.5 rounded-full bg-surface-700/40 overflow-hidden mx-2">
                  <div className="h-full rounded-full bg-yes-500" style={{ width: `${market.yesPercentage}%` }} />
                </div>
                <span className="text-sm font-bold text-white tabular-nums shrink-0">{formatPercentage(market.yesPercentage)}</span>
              </div>
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-surface-800/40 border border-surface-700/30">
                <div className="w-2.5 h-2.5 rounded-full bg-no-500 shadow-[0_0_6px_rgba(244,63,94,0.4)] shrink-0" />
                <span className="text-sm text-surface-300 font-medium">{outcomeLabels[1]}</span>
                <div className="flex-1 h-1.5 rounded-full bg-surface-700/40 overflow-hidden mx-2">
                  <div className="h-full rounded-full bg-no-500" style={{ width: `${market.noPercentage}%` }} />
                </div>
                <span className="text-sm font-bold text-white tabular-nums shrink-0">{formatPercentage(market.noPercentage)}</span>
              </div>
            </div>
          ) : (
            <>
              {/* Multi-outcome chips */}
              <div className="grid grid-cols-2 gap-1.5 mb-2.5">
                {outcomeLabels.map((label, i) => {
                  const pct = (prices[i] ?? 0) * 100
                  const colors = OUTCOME_COLORS[i] || OUTCOME_COLORS[0]
                  return (
                    <div key={i} className={cn(
                      'flex items-center gap-2 px-2.5 py-2 rounded-lg',
                      'bg-surface-800/40 border border-surface-700/30'
                    )}>
                      <div className={cn('w-2.5 h-2.5 rounded-full flex-shrink-0', colors.bar)} />
                      <span className="text-xs text-surface-300 truncate">{label}</span>
                      <span className="text-sm font-bold ml-auto tabular-nums text-white">{formatPercentage(pct)}</span>
                    </div>
                  )
                })}
              </div>
              {/* Segmented bar */}
              <div className="h-2 rounded-full overflow-hidden bg-surface-800 flex">
                {outcomeLabels.map((_, i) => {
                  const pct = (prices[i] ?? 0) * 100
                  const colors = OUTCOME_COLORS[i] || OUTCOME_COLORS[0]
                  return (
                    <div
                      key={i}
                      className={cn('h-full transition-all duration-700 ease-out', colors.bar)}
                      style={{ width: `${pct}%` }}
                    />
                  )
                })}
              </div>
            </>
          )}
        </div>

        {/* Stats — Refined layout */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <Tooltip content="Total value of all trades in this market" side="bottom">
            <div className="text-center p-2.5 rounded-xl bg-surface-800/30 border border-surface-700/20">
              <TrendingUp className="w-3.5 h-3.5 text-surface-500 mx-auto mb-1.5" />
              <p className="text-sm font-bold text-white tabular-nums">
                {formatCredits(market.totalVolume, 0)} <span className="text-[10px] font-medium text-surface-400">{market.tokenType ?? 'ALEO'}</span>
              </p>
              <p className="text-[10px] text-surface-500 uppercase tracking-wider mt-0.5">Volume</p>
            </div>
          </Tooltip>

          <Tooltip content="Number of bets placed on this market" side="bottom">
            <div className="text-center p-2.5 rounded-xl bg-surface-800/30 border border-surface-700/20">
              <Users className="w-3.5 h-3.5 text-surface-500 mx-auto mb-1.5" />
              <p className="text-sm font-bold text-white tabular-nums">{market.totalBets}</p>
              <p className="text-[10px] text-surface-500 uppercase tracking-wider mt-0.5">Bets</p>
            </div>
          </Tooltip>

          <Tooltip content="Time remaining until trading closes" side="bottom">
            <div className="text-center p-2.5 rounded-xl bg-surface-800/30 border border-surface-700/20">
              <Clock className="w-3.5 h-3.5 text-surface-500 mx-auto mb-1.5" />
              <p className="text-sm font-bold text-white tabular-nums">{timeRemaining}</p>
              <p className="text-[10px] text-surface-500 uppercase tracking-wider mt-0.5">Left</p>
            </div>
          </Tooltip>
        </div>


      </div>
    </div>
  )
}
