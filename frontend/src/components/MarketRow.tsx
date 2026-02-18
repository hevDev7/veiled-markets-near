import { motion } from 'framer-motion'
import { Clock, TrendingUp, Shield, ChevronRight, ExternalLink } from 'lucide-react'
import { useState, useEffect } from 'react'
import { type Market } from '@/lib/store'
import { cn, formatCredits, formatPercentage, getCategoryName, getCategoryEmoji } from '@/lib/utils'
import { config } from '@/lib/config'

interface MarketRowProps {
    market: Market
    index: number
    onClick: () => void
}

export function MarketRow({ market, index, onClick }: MarketRowProps) {
    const timeRemaining = useLiveCountdown(market.deadlineTimestamp, market.timeRemaining)
    const isExpired = timeRemaining === 'ENDED' || market.status !== 1

    return (
        <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: index * 0.05 }}
            onClick={onClick}
            className={cn(
                "group relative bg-surface-900/50 backdrop-blur-sm rounded-lg border border-surface-800/50",
                "hover:border-brand-500/30 hover:bg-surface-900/80 transition-all duration-200 cursor-pointer",
                "p-4",
                isExpired && "opacity-60"
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
                            {isExpired && (
                                <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded bg-no-500/20 text-no-400 border border-no-500/30">
                                    EXPIRED
                                </span>
                            )}
                        </div>
                    </div>

                    <h3 className="text-base font-semibold text-white group-hover:text-brand-300 transition-colors mb-2">
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
                            <span className="text-xs font-mono text-surface-500">LIQUIDITY</span>
                        </div>
                        <p className="text-sm font-bold text-white font-mono">{formatCredits(market.totalLiquidity ?? 0n, 0)}</p>
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

                    {/* On-chain Verification Link */}
                    {market.transactionId && (
                        <a
                            href={`${config.explorerUrl}/transaction/${market.transactionId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className={cn(
                                'hidden xl:flex items-center gap-1.5 px-3 py-1.5 rounded-lg',
                                'bg-brand-500/10 border border-brand-500/20 text-brand-400',
                                'hover:bg-brand-500/20 hover:border-brand-500/40 transition-all',
                                'text-xs font-mono'
                            )}
                            title="Verify on blockchain"
                        >
                            <Shield className="w-3 h-3" />
                            <span>VERIFY</span>
                            <ExternalLink className="w-3 h-3" />
                        </a>
                    )}

                    <ChevronRight className="w-5 h-5 text-surface-500 group-hover:text-brand-400 group-hover:translate-x-1 transition-all" />
                </div>
            </div>

            {/* Mobile Stats - Show on small screens */}
            <div className="md:hidden mt-3 pt-3 border-t border-surface-800/50">
                <div className="flex items-center justify-between text-xs font-mono mb-2">
                    <div className="flex items-center gap-4">
                        <span className="text-surface-400">
                            <TrendingUp className="w-3 h-3 inline mr-1" />
                            {formatCredits(market.totalVolume, 0)}
                        </span>
                        <span className="text-surface-400">
                            LIQ {formatCredits(market.totalLiquidity ?? 0n, 0)}
                        </span>
                        <span className="text-surface-400">
                            <Clock className="w-3 h-3 inline mr-1" />
                            {timeRemaining}
                        </span>
                    </div>
                </div>

                {/* Mobile Verification Link */}
                {market.transactionId && (
                    <a
                        href={`${config.explorerUrl}/transaction/${market.transactionId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className={cn(
                            'flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg',
                            'bg-brand-500/10 border border-brand-500/20 text-brand-400',
                            'hover:bg-brand-500/20 hover:border-brand-500/40 transition-all',
                            'text-xs font-mono'
                        )}
                    >
                        <Shield className="w-3 h-3" />
                        <span>VERIFY ON-CHAIN</span>
                        <ExternalLink className="w-3 h-3" />
                    </a>
                )}
            </div>
        </motion.div>
    )
}

/** Live countdown hook — updates every second when deadlineTimestamp is available */
function useLiveCountdown(deadlineTimestamp?: number, fallbackTimeRemaining?: string): string {
    const [now, setNow] = useState(Date.now())

    useEffect(() => {
        if (!deadlineTimestamp || deadlineTimestamp <= Date.now()) return
        const interval = setInterval(() => setNow(Date.now()), 1000)
        return () => clearInterval(interval)
    }, [deadlineTimestamp])

    if (!deadlineTimestamp || deadlineTimestamp <= 0) {
        if (fallbackTimeRemaining) return fallbackTimeRemaining.toUpperCase()
        return 'ENDED'
    }

    const diffMs = deadlineTimestamp - now
    if (diffMs <= 0) return 'ENDED'

    const totalSeconds = Math.floor(diffMs / 1000)
    const days = Math.floor(totalSeconds / 86400)
    const hours = Math.floor((totalSeconds % 86400) / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60

    if (days > 0) return `${days}D ${hours}H ${minutes}M`
    if (hours > 0) return `${hours}H ${minutes}M ${seconds}S`
    if (minutes > 0) return `${minutes}M ${seconds}S`
    return `${seconds}S`
}
