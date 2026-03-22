import { Clock, TrendingUp, Shield, ChevronRight, Flame } from 'lucide-react'
import { useMemo } from 'react'
import { useLiveCountdown as useGlobalCountdown } from '@/hooks/useGlobalTicker'
import { type Market } from '@/lib/store'
import { cn, formatCredits, formatPercentage, getCategoryName, getCategoryEmoji, getCategoryStrip, getCategoryColor } from '@/lib/utils'
import { getMarketThumbnail } from '@/lib/market-thumbnails'

import { Tooltip } from '@/components/ui/Tooltip'
import { StatusBadge, getStatusVariant } from '@/components/ui/StatusBadge'
import { calculateAllPrices, type AMMReserves } from '@/lib/amm'

const OUTCOME_COLORS = [
  { text: 'text-yes-400', bar: 'bg-yes-500', bg: 'bg-yes-500/10', border: 'border-yes-500/20' },
  { text: 'text-no-400', bar: 'bg-no-500', bg: 'bg-no-500/10', border: 'border-no-500/20' },
  { text: 'text-purple-400', bar: 'bg-purple-500', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
  { text: 'text-yellow-400', bar: 'bg-yellow-500', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20' },
]

interface MarketRowProps {
    market: Market
    index: number
    onClick: () => void
}

export function MarketRow({ market, index, onClick }: MarketRowProps) {
    const timeRemaining = useGlobalCountdown(market.deadlineTimestamp, market.timeRemaining).toUpperCase()
    const isExpired = timeRemaining === 'ENDED' || market.status !== 1
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

    // Find leading outcome
    const leadingIdx = useMemo(() => {
        let maxIdx = 0
        for (let i = 1; i < prices.length; i++) {
            if ((prices[i] ?? 0) > (prices[maxIdx] ?? 0)) maxIdx = i
        }
        return maxIdx
    }, [prices])
    const leadingPct = (prices[leadingIdx] ?? 0) * 100

    return (
        <div
            onClick={onClick}
            style={{ animationDelay: `${index * 50}ms` }}
            className={cn(
                "group relative overflow-hidden rounded-xl cursor-pointer",
                "bg-white/[0.01] backdrop-blur-sm",
                "border border-surface-700/30",
                "hover:border-brand-500/25 hover:bg-surface-900/60",
                "transition-all duration-250 ease-out",
                "p-4",
                getCategoryStrip(market.category),
                isExpired && "opacity-55",
                isHot && "border-gold-500/15 hover:border-gold-500/30"
            )}
        >
            {/* Hover glow */}
            <div
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-400 pointer-events-none"
                style={{ background: `radial-gradient(ellipse at 20% 0%, ${categoryColor.glow}, transparent 60%)` }}
            />

            <div className="relative flex items-center gap-4">

                {/* Left: Category Icon & Question */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 mb-2">
                        <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0 bg-surface-800 border border-white/[0.06]">
                            <img src={getMarketThumbnail(market.question, market.category)} alt="" className="w-full h-full object-cover" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className={cn("text-xs font-semibold uppercase tracking-wider", categoryColor.text)}>
                                {getCategoryName(market.category)}
                            </span>
                            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-brand-500/8">
                                <Shield className="w-2.5 h-2.5 text-brand-400" />
                                <span className="text-[10px] text-brand-400 font-semibold">Private</span>
                            </div>
                            {market.tags?.slice(0, 2).map(tag => (
                                <span
                                    key={tag}
                                    className={cn(
                                        "px-1.5 py-0.5 text-[10px] font-bold rounded uppercase tracking-wide",
                                        tag === 'Hot' || tag === 'Trending'
                                            ? "badge-hot"
                                            : tag === 'Featured'
                                                ? "badge-featured"
                                                : tag === 'Ending Soon'
                                                    ? "bg-no-500/12 text-no-400 border border-no-500/15"
                                                    : "bg-surface-700/30 text-surface-400"
                                    )}
                                >
                                    {(tag === 'Hot' || tag === 'Trending') && <Flame className="w-2.5 h-2.5 inline mr-0.5 -mt-px" />}
                                    {tag}
                                </span>
                            ))}
                            {isExpired && (
                                <StatusBadge variant={statusVariant} />
                            )}
                        </div>
                    </div>

                    <h3 className="text-base font-semibold text-white group-hover:text-brand-300 transition-colors mb-1.5 leading-snug">
                        {market.question}
                    </h3>

                    {market.description && (
                        <p className="text-xs text-surface-500 mb-2 text-pretty">
                            {market.description.length > 60 ? market.description.slice(0, 60) + '...' : market.description}
                        </p>
                    )}

                    {/* Odds Bar */}
                    <div className="max-w-md">
                        {isBinary ? (
                            <>
                                <div className="flex justify-between text-xs mb-1.5">
                                    <span className="text-yes-400 font-semibold flex items-center gap-1.5">
                                        <span className="w-2 h-2 rounded-full bg-yes-500 shadow-[0_0_4px_rgba(16,185,129,0.4)]" />
                                        {outcomeLabels[0]} <span className="tabular-nums font-bold">{formatPercentage(market.yesPercentage)}</span>
                                    </span>
                                    <span className="text-no-400 font-semibold flex items-center gap-1.5">
                                        <span className="tabular-nums font-bold">{formatPercentage(market.noPercentage)}</span> {outcomeLabels[1]}
                                        <span className="w-2 h-2 rounded-full bg-no-500 shadow-[0_0_4px_rgba(244,63,94,0.4)]" />
                                    </span>
                                </div>
                                <div className="h-2 rounded-full overflow-hidden bg-surface-800">
                                    <div
                                        className="h-full transition-all duration-700 ease-out"
                                        style={{
                                            width: `${market.yesPercentage}%`,
                                            background: 'linear-gradient(90deg, #059669, #34d399, #6ee7b7)',
                                        }}
                                    />
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="flex items-center gap-2 text-xs mb-1.5">
                                    <span className={cn('font-bold flex items-center gap-1.5', OUTCOME_COLORS[leadingIdx]?.text || 'text-yes-400')}>
                                        <span className={cn('w-2 h-2 rounded-full', OUTCOME_COLORS[leadingIdx]?.bar || 'bg-yes-500')} />
                                        {outcomeLabels[leadingIdx]} <span className="tabular-nums">{formatPercentage(leadingPct)}</span>
                                    </span>
                                    <span className="text-surface-600">|</span>
                                    <span className="text-surface-400">{numOutcomes} outcomes</span>
                                </div>
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
                </div>

                {/* Middle: Stats */}
                <div className="hidden md:flex items-center gap-6">
                    <Tooltip content="Total value of all trades in this market">
                      <div className="text-center">
                        <div className="flex items-center gap-1.5 text-surface-400 mb-1">
                            <TrendingUp className="w-3.5 h-3.5" />
                            <span className="text-[10px] text-surface-500 uppercase tracking-wider font-semibold">Volume</span>
                        </div>
                        <p className="text-sm font-bold text-white tabular-nums">
                            {formatCredits(market.totalVolume, 0)} <span className="text-[10px] font-medium text-surface-400">{market.tokenType ?? 'ALEO'}</span>
                        </p>
                      </div>
                    </Tooltip>

                    <Tooltip content={
                      (market.status === 3 || market.status === 4)
                        ? "Remaining funds in the market pool"
                        : "Available funds in the market's AMM pool"
                    }>
                      <div className="text-center">
                        <div className="flex items-center gap-1.5 text-surface-400 mb-1">
                            <span className="text-[10px] text-surface-500 uppercase tracking-wider font-semibold">
                                {(market.status === 3 || market.status === 4) ? 'Remaining' : 'Liquidity'}
                            </span>
                        </div>
                        <p className="text-sm font-bold text-white tabular-nums">{formatCredits(
                            (market.status === 3 || market.status === 4) && market.remainingCredits !== undefined
                                ? market.remainingCredits
                                : (market.totalLiquidity ?? 0n), 0
                        )} <span className="text-[10px] font-medium text-surface-400">{market.tokenType ?? 'ALEO'}</span></p>
                      </div>
                    </Tooltip>

                    <Tooltip content="Time remaining until trading closes">
                      <div className="text-center">
                        <div className="flex items-center gap-1.5 text-surface-400 mb-1">
                            <Clock className="w-3.5 h-3.5" />
                            <span className="text-[10px] text-surface-500 uppercase tracking-wider font-semibold">Time</span>
                        </div>
                        <p className="text-sm font-bold text-white tabular-nums">{timeRemaining}</p>
                      </div>
                    </Tooltip>
                </div>

                {/* Right: Payouts & Arrow */}
                <div className="flex items-center gap-3">
                    <div className="hidden lg:flex items-center gap-2">
                        {isBinary ? (
                            <>
                                <div className="px-3 py-1.5 rounded-lg bg-yes-500/8 border border-yes-500/15">
                                    <span className="text-xs font-bold text-yes-400 tabular-nums">
                                        {outcomeLabels[0]} {market.potentialYesPayout.toFixed(2)}x
                                    </span>
                                </div>
                                <div className="px-3 py-1.5 rounded-lg bg-no-500/8 border border-no-500/15">
                                    <span className="text-xs font-bold text-no-400 tabular-nums">
                                        {outcomeLabels[1]} {market.potentialNoPayout.toFixed(2)}x
                                    </span>
                                </div>
                            </>
                        ) : (() => {
                            const leadPrice = prices[leadingIdx] ?? (1 / numOutcomes)
                            const leadPayout = leadPrice > 0 ? 1 / leadPrice : 2.0
                            const colors = OUTCOME_COLORS[leadingIdx] || OUTCOME_COLORS[0]
                            return (
                                <div className={cn('px-3 py-1.5 rounded-lg', colors.bg, 'border', colors.border)}>
                                    <span className={cn('text-xs font-bold tabular-nums', colors.text)}>
                                        Top {leadPayout.toFixed(2)}x
                                    </span>
                                </div>
                            )
                        })()}
                    </div>

                    <ChevronRight className="w-5 h-5 text-surface-600 group-hover:text-brand-400 group-hover:translate-x-1 transition-all duration-200" />
                </div>
            </div>

            {/* Mobile Stats */}
            <div className="md:hidden mt-3 pt-3 border-t border-surface-700/20">
                <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-4">
                        <span className="text-surface-400 tabular-nums">
                            <TrendingUp className="w-3 h-3 inline mr-1" />
                            {formatCredits(market.totalVolume, 0)} {market.tokenType ?? 'ALEO'}
                        </span>
                        <span className="text-surface-400 tabular-nums">
                            LIQ {formatCredits(
                                (market.status === 3 || market.status === 4) && market.remainingCredits !== undefined
                                    ? market.remainingCredits
                                    : (market.totalLiquidity ?? 0n), 0
                            )} {market.tokenType ?? 'ALEO'}
                        </span>
                        <span className="text-surface-400 tabular-nums">
                            <Clock className="w-3 h-3 inline mr-1" />
                            {timeRemaining}
                        </span>
                    </div>
                </div>

            </div>
        </div>
    )
}
