import { motion } from 'framer-motion'
import { Clock, Users, TrendingUp, Shield, Zap, ExternalLink } from 'lucide-react'
import { useState, useEffect } from 'react'
import { type Market } from '@/lib/store'
import { cn, formatCredits, formatPercentage, getCategoryName, getCategoryEmoji } from '@/lib/utils'
import { config } from '@/lib/config'
import { Tooltip } from '@/components/ui/Tooltip'
import { StatusBadge, getStatusVariant } from '@/components/ui/StatusBadge'

interface MarketCardProps {
  market: Market
  index: number
  onClick: () => void
}

export function MarketCard({ market, index, onClick }: MarketCardProps) {
  const timeRemaining = useLiveCountdown(market.deadlineTimestamp, market.timeRemaining)
  const isExpired = timeRemaining === 'Ended' || market.status !== 1
  const statusVariant = getStatusVariant(market.status, isExpired)

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      whileHover={{ y: -4 }}
      onClick={onClick}
      className={cn("market-card group", isExpired && "opacity-70")}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-lg">{getCategoryEmoji(market.category)}</span>
          <span className="category-badge">{getCategoryName(market.category)}</span>
          {isExpired && (
            <StatusBadge variant={statusVariant} />
          )}
          {market.tags?.slice(0, 2).map(tag => (
            <span
              key={tag}
              className={cn(
                "px-2 py-0.5 text-[10px] font-medium rounded-full",
                tag === 'Hot' || tag === 'Trending' || tag === 'Featured'
                  ? "bg-accent-500/20 text-accent-400"
                  : tag === 'Ending Soon'
                    ? "bg-no-500/20 text-no-400"
                    : "bg-surface-700/50 text-surface-400"
              )}
            >
              {tag}
            </span>
          ))}
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Shield className="w-3.5 h-3.5 text-brand-400" />
          <span className="text-xs text-brand-400 font-medium">Private</span>
        </div>
      </div>

      {/* Question */}
      <h3 className="text-lg font-semibold text-white mb-4 line-clamp-2 group-hover:text-brand-300 transition-colors">
        {market.question}
      </h3>

      {/* Odds Bar */}
      <div className="mb-4">
        <div className="flex justify-between text-sm mb-2">
          <div className="flex items-center gap-2">
            <span className="text-yes-400 font-semibold">Yes</span>
            <span className="text-white font-bold">{formatPercentage(market.yesPercentage)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-white font-bold">{formatPercentage(market.noPercentage)}</span>
            <span className="text-no-400 font-semibold">No</span>
          </div>
        </div>

        <div className="odds-bar">
          <div
            className="odds-bar-yes"
            style={{ width: `${market.yesPercentage}%` }}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <Tooltip content="Total value of all trades in this market" side="bottom">
          <div className="text-center p-2 rounded-lg bg-surface-800/50">
            <div className="flex items-center justify-center gap-1 text-surface-400 mb-1">
              <TrendingUp className="w-3.5 h-3.5" />
            </div>
            <p className="text-sm font-semibold text-white">
              {formatCredits(market.totalVolume, 0)}
            </p>
            <p className="text-[10px] text-surface-500 uppercase">Volume</p>
          </div>
        </Tooltip>

        <Tooltip content="Number of bets placed on this market" side="bottom">
          <div className="text-center p-2 rounded-lg bg-surface-800/50">
            <div className="flex items-center justify-center gap-1 text-surface-400 mb-1">
              <Users className="w-3.5 h-3.5" />
            </div>
            <p className="text-sm font-semibold text-white">{market.totalBets}</p>
            <p className="text-[10px] text-surface-500 uppercase">Bets</p>
          </div>
        </Tooltip>

        <Tooltip content="Time remaining until trading closes" side="bottom">
          <div className="text-center p-2 rounded-lg bg-surface-800/50">
            <div className="flex items-center justify-center gap-1 text-surface-400 mb-1">
              <Clock className="w-3.5 h-3.5" />
            </div>
            <p className="text-sm font-semibold text-white">{timeRemaining}</p>
            <p className="text-[10px] text-surface-500 uppercase">Left</p>
          </div>
        </Tooltip>
      </div>

      {/* Potential Payouts */}
      <div className="flex gap-2">
        <button className={cn(
          'flex-1 py-2.5 rounded-lg font-medium text-sm',
          'bg-yes-500/10 text-yes-400 border border-yes-500/20',
          'hover:bg-yes-500/20 hover:border-yes-500/40 transition-all',
          'flex items-center justify-center gap-2'
        )}>
          <Zap className="w-4 h-4" />
          <span>Yes {market.potentialYesPayout.toFixed(2)}x</span>
        </button>

        <button className={cn(
          'flex-1 py-2.5 rounded-lg font-medium text-sm',
          'bg-no-500/10 text-no-400 border border-no-500/20',
          'hover:bg-no-500/20 hover:border-no-500/40 transition-all',
          'flex items-center justify-center gap-2'
        )}>
          <Zap className="w-4 h-4" />
          <span>No {market.potentialNoPayout.toFixed(2)}x</span>
        </button>
      </div>

      {/* On-chain Verification Link (only for real at1... tx IDs) */}
      {market.transactionId && market.transactionId.startsWith('at1') && (
        <a
          href={`${config.explorerUrl}/transaction/${market.transactionId}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'mt-3 flex items-center justify-center gap-2 py-2 px-3 rounded-lg',
            'bg-brand-500/10 border border-brand-500/20 text-brand-400',
            'hover:bg-brand-500/20 hover:border-brand-500/40 transition-all',
            'text-xs font-medium'
          )}
        >
          <Shield className="w-3.5 h-3.5" />
          <span>Verify On-Chain</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      )}
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
    if (fallbackTimeRemaining) return fallbackTimeRemaining
    return 'Ended'
  }

  const diffMs = deadlineTimestamp - now
  if (diffMs <= 0) return 'Ended'

  const totalSeconds = Math.floor(diffMs / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (days > 0) return `${days}d ${hours}h ${minutes}m`
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

