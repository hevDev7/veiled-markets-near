import { motion } from 'framer-motion'
import { Clock, TrendingUp, Shield, ChevronRight } from 'lucide-react'
import { type Market } from '@/lib/store'
import { cn, formatCredits, formatPercentage, getCategoryName, getCategoryEmoji } from '@/lib/utils'
import { PrivacyBadge } from './PrivacyNotice'

interface MarketRowProps {
    market: Market
    index: number
    onClick: () => void
}

export function MarketRow({ market, index, onClick }: MarketRowProps) {
    const timeRemaining = getTimeRemaining(market.deadline)

    return (
        <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: index * 0.05 }}
            onClick={onClick}
            className={cn(
                "group relative bg-surface-900/50 backdrop-blur-sm rounded-lg border border-surface-800/50",
                "hover:border-brand-500/30 hover:bg-surface-900/80 transition-all duration-200 cursor-pointer",
                "p-4"
            )}
        >
            <div className="flex items-center gap-4">

                {/* Left: Category Icon & Question */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                        <span className="text-2xl flex-shrink-0">{getCategoryEmoji(market.category)}</span>
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-mono text-surface-500 uppercase">
                                {getCategoryName(market.category)}
                            </span>
                            <div className="flex items-center gap-1.5">
                                <Shield className="w-3 h-3 text-brand-400" />
                                <span className="text-xs text-brand-400 font-mono">PRIVATE</span>
                            </div>
                        </div>
                    </div>

                    <h3 className="text-base font-semibold text-white group-hover:text-brand-300 transition-colors line-clamp-1 mb-2">
                        {market.question}
                    </h3>

                    {/* Odds Bar - Compact */}
                    <div className="max-w-md">
                        <div className="flex justify-between text-xs mb-1.5 font-mono">
                            <span className="text-yes-400">
                                YES {formatPercentage(market.yesPercentage)}
                            </span>
                            <span className="text-no-400">
                                NO {formatPercentage(market.noPercentage)}
                            </span>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden bg-surface-800">
                            <div
                                className="h-full bg-gradient-to-r from-yes-600 to-yes-400 transition-all duration-500"
                                style={{ width: `${market.yesPercentage}%` }}
                            />
                        </div>
                    </div>
                </div>

                {/* Middle: Stats */}
                <div className="hidden md:flex items-center gap-6">
                    <div className="text-center">
                        <div className="flex items-center gap-1.5 text-surface-400 mb-1">
                            <TrendingUp className="w-3.5 h-3.5" />
                            <span className="text-xs font-mono text-surface-500">VOLUME</span>
                        </div>
                        <p className="text-sm font-bold text-white font-mono">
                            {formatCredits(market.totalVolume, 0)}
                        </p>
                    </div>

                    <div className="text-center">
                        <div className="flex items-center gap-1.5 text-surface-400 mb-1">
                            <span className="text-xs font-mono text-surface-500">BETS</span>
                        </div>
                        <p className="text-sm font-bold text-white font-mono">{market.totalBets}</p>
                    </div>

                    <div className="text-center">
                        <div className="flex items-center gap-1.5 text-surface-400 mb-1">
                            <Clock className="w-3.5 h-3.5" />
                            <span className="text-xs font-mono text-surface-500">TIME</span>
                        </div>
                        <p className="text-sm font-bold text-white font-mono">{timeRemaining}</p>
                    </div>
                </div>

                {/* Right: Payouts & Arrow */}
                <div className="flex items-center gap-4">
                    <div className="hidden lg:flex items-center gap-2">
                        <div className="px-3 py-1.5 rounded-lg bg-yes-500/10 border border-yes-500/20">
                            <span className="text-xs font-mono text-yes-400">
                                YES {market.potentialYesPayout.toFixed(2)}x
                            </span>
                        </div>
                        <div className="px-3 py-1.5 rounded-lg bg-no-500/10 border border-no-500/20">
                            <span className="text-xs font-mono text-no-400">
                                NO {market.potentialNoPayout.toFixed(2)}x
                            </span>
                        </div>
                    </div>

                    <ChevronRight className="w-5 h-5 text-surface-500 group-hover:text-brand-400 group-hover:translate-x-1 transition-all" />
                </div>
            </div>

            {/* Mobile Stats - Show on small screens */}
            <div className="md:hidden mt-3 pt-3 border-t border-surface-800/50 flex items-center justify-between text-xs font-mono">
                <div className="flex items-center gap-4">
                    <span className="text-surface-400">
                        <TrendingUp className="w-3 h-3 inline mr-1" />
                        {formatCredits(market.totalVolume, 0)}
                    </span>
                    <span className="text-surface-400">
                        {market.totalBets} bets
                    </span>
                    <span className="text-surface-400">
                        <Clock className="w-3 h-3 inline mr-1" />
                        {timeRemaining}
                    </span>
                </div>
            </div>
        </motion.div>
    )
}

function getTimeRemaining(deadline: bigint): string {
    const now = Date.now() / 1000
    const target = Number(deadline)
    const diff = target - now

    if (diff <= 0) return 'ENDED'

    const days = Math.floor(diff / (60 * 60 * 24))
    const hours = Math.floor((diff % (60 * 60 * 24)) / (60 * 60))

    if (days > 0) return `${days}D ${hours}H`
    if (hours > 0) return `${hours}H`
    return '<1H'
}
