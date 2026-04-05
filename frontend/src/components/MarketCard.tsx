import { Clock, Ticket, Users, TrendingUp, Shield } from 'lucide-react'
import { useMemo, useRef } from 'react'
import { useLiveCountdown } from '@/hooks/useGlobalTicker'
import { type Market } from '@/lib/store'
import { cn, formatCredits, formatPercentage, getCategoryName, getCategoryEmoji, getCategoryStrip, getCategoryColor } from '@/lib/utils'

import { StatusBadge, getStatusVariant } from '@/components/ui/StatusBadge'
import { getMarketThumbnail, isContainThumbnail } from '@/lib/market-thumbnails'
import { getMarketOutcomeSummaries } from '@/lib/market-outcomes'

function MarketThumb({ url, question, size = 'md' }: { url: string; question: string; size?: 'sm' | 'md' | 'lg' }) {
  const useContain = isContainThumbnail(url)
  const sizeClass = size === 'sm' ? 'w-8 h-8 rounded-lg' : size === 'lg' ? 'w-11 h-11 rounded-xl' : 'w-10 h-10 rounded-xl'
  return (
    <div className="flex gap-3 mb-4">
      <div className={cn(sizeClass, 'overflow-hidden shrink-0 bg-surface-800', useContain && 'p-1.5 flex items-center justify-center')}>
        <img src={url} alt="" className={cn('w-full h-full', useContain ? 'object-contain' : 'object-cover')} loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
      </div>
      <h3 className="text-sm md:text-[15px] font-semibold text-white line-clamp-3 group-hover:text-brand-300 transition-colors leading-snug">
        {question}
      </h3>
    </div>
  )
}

// Colors for up to 4 outcomes
const OUTCOME_COLORS = [
  { text: 'text-yes-400', bg: 'bg-yes-500/5', border: 'border-yes-500/20', bar: 'bg-yes-500', hoverBg: 'hover:bg-yes-500/20', hoverBorder: 'hover:border-yes-500/40' },
  { text: 'text-no-400', bg: 'bg-no-500/5', border: 'border-no-500/20', bar: 'bg-no-500', hoverBg: 'hover:bg-no-500/20', hoverBorder: 'hover:border-no-500/40' },
  { text: 'text-purple-400', bg: 'bg-purple-500/5', border: 'border-purple-500/20', bar: 'bg-purple-500', hoverBg: 'hover:bg-purple-500/20', hoverBorder: 'hover:border-purple-500/40' },
  { text: 'text-yellow-400', bg: 'bg-yellow-500/5', border: 'border-yellow-500/20', bar: 'bg-yellow-500', hoverBg: 'hover:bg-yellow-500/20', hoverBorder: 'hover:border-yellow-500/40' },
]

interface MarketCardProps {
  market: Market
  index: number
  onClick: () => void
  parlayMode?: boolean
  selectedParlayOutcome?: number | null
  onQuickAddParlay?: (market: Market, outcome: number) => void
}

export function MarketCard({
  market,
  index,
  onClick,
  parlayMode = false,
  selectedParlayOutcome = null,
  onQuickAddParlay,
}: MarketCardProps) {
  const timeRemaining = useLiveCountdown(market.deadlineTimestamp, market.timeRemaining)
  const isExpired = timeRemaining === 'Ended' || market.status !== 1
  const statusVariant = getStatusVariant(market.status, isExpired)

  const numOutcomes = market.numOutcomes ?? 2
  const outcomeSummaries = useMemo(() => getMarketOutcomeSummaries(market), [market])

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
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onClick()
        }
      }}
      role="button"
      tabIndex={0}
      style={shouldAnimate ? { animationDelay: `${index * 60}ms` } : undefined}
      className={cn(
        "market-card group relative overflow-hidden",
        shouldAnimate && "animate-fade-in-up",
        getCategoryStrip(market.category),
        isExpired && "opacity-60",
        isHot && "pulse-glow",
        parlayMode && selectedParlayOutcome && "border-brand-500/35 shadow-[0_16px_40px_rgba(201,168,76,0.12)]"
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
        <MarketThumb url={getMarketThumbnail(market.question, market.category, market.thumbnailUrl)} question={market.question} />

        {/* Description snippet */}
        {market.description && (
          <p className="text-xs text-surface-300 line-clamp-2 leading-relaxed -mt-1 mb-3">
            {market.description}
          </p>
        )}

        {!parlayMode && (
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
                    const colors = OUTCOME_COLORS[i] || OUTCOME_COLORS[0]
                    return (
                      <div key={i} className={cn(
                        'flex items-center gap-2 px-2.5 py-2 rounded-lg',
                        colors.bg
                      )}>
                        <span className={cn('text-xs truncate font-medium', colors.text)}>{outcome.label}</span>
                        <span className={cn('text-sm font-bold ml-auto tabular-nums', colors.text)}>{formatPercentage(outcome.percentage)}</span>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {parlayMode && (
          <div className="mb-4 rounded-2xl border border-brand-500/15 bg-brand-500/[0.04] p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-300/90 whitespace-nowrap">
                <Ticket className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">Parlay Quick Add</span>
              </div>
              {selectedParlayOutcome ? (
                <span className="rounded-full border border-brand-500/20 bg-brand-500/10 px-2 py-1 text-[10px] font-semibold text-brand-300">
                  Leg selected
                </span>
              ) : (
                <span className="text-[10px] text-surface-500">Tap an outcome</span>
              )}
            </div>
            <div className={cn('grid gap-2', isBinary ? 'grid-cols-1' : 'grid-cols-2')}>
              {outcomeSummaries.map((outcome) => {
                const isSelected = selectedParlayOutcome === outcome.outcome

                return (
                  <button
                    key={outcome.outcome}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      onQuickAddParlay?.(market, outcome.outcome)
                    }}
                    disabled={isExpired}
                    className={cn(
                      'rounded-xl border px-3 py-2 text-left transition-all duration-200 w-full',
                      outcome.styles.bg,
                      outcome.styles.border,
                      isExpired && 'cursor-not-allowed opacity-50',
                      !isExpired && 'hover:border-brand-400/35 hover:bg-white/[0.05]',
                      isSelected && 'border-brand-400/35 bg-brand-500/10 shadow-[0_0_0_1px_rgba(201,168,76,0.12)]'
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn('truncate text-xs font-semibold', outcome.styles.text)}>
                        {outcome.label}
                      </span>
                      <span className={cn('text-sm font-bold tabular-nums', outcome.styles.text)}>
                        {outcome.payout.toFixed(2)}x
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-surface-500">
                      {isSelected ? 'Tap again to remove' : `${formatPercentage(outcome.percentage)} implied`}
                    </p>
                  </button>
                )
              })}
            </div>
            {isExpired && (
              <p className="mt-2 text-[11px] text-surface-500">
                Closed markets stay view-only here. Open detail to review resolution state.
              </p>
            )}
          </div>
        )}

        {/* Stats — compact inline */}
        <div className="flex items-center gap-4 pt-3 mt-auto border-t border-white/[0.03] text-xs text-surface-500">
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
    </div>
  )
}
