import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, BarChart3 } from 'lucide-react'
import { cn, formatCredits } from '@/lib/utils'

interface OddsChartProps {
  currentYes: number
  currentNo: number
  yesPool: bigint
  noPool: bigint
  totalVolume: bigint
  totalBets: number
  potentialYesPayout: number
  potentialNoPayout: number
  tokenSymbol?: string
  className?: string
}

export function OddsChart({
  currentYes,
  currentNo,
  yesPool,
  noPool,
  totalVolume,
  totalBets,
  potentialYesPayout,
  potentialNoPayout,
  tokenSymbol = 'ALEO',
  className,
}: OddsChartProps) {
  const totalPool = yesPool + noPool
  const yesPoolPct = totalPool > 0n
    ? Math.round(Number((yesPool * 10000n) / totalPool)) / 100
    : 50
  const noPoolPct = totalPool > 0n
    ? Math.round(Number((noPool * 10000n) / totalPool)) / 100
    : 50

  return (
    <div className={cn("", className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Pool Breakdown</h3>
        <div className="flex items-center gap-2 text-sm">
          <BarChart3 className="w-4 h-4 text-surface-400" />
          <span className="text-surface-400">On-chain data</span>
        </div>
      </div>

      {/* Pool Visualization */}
      <div className="relative bg-surface-800/30 rounded-xl p-5">
        {/* Pool Size Bars */}
        <div className="space-y-4">
          {/* YES Pool */}
          <div>
            <div className="flex justify-between text-sm mb-1.5">
              <span className="text-yes-400 font-medium flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" />
                YES Pool
              </span>
              <span className="text-surface-300 font-mono">
                {formatCredits(yesPool)} {tokenSymbol}
              </span>
            </div>
            <div className="h-6 rounded-lg overflow-hidden bg-surface-800 relative">
              <motion.div
                className="h-full bg-gradient-to-r from-yes-600 to-yes-500 rounded-lg"
                initial={{ width: 0 }}
                animate={{ width: `${yesPoolPct}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
              />
              <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white drop-shadow-md">
                {yesPoolPct.toFixed(1)}%
              </span>
            </div>
          </div>

          {/* NO Pool */}
          <div>
            <div className="flex justify-between text-sm mb-1.5">
              <span className="text-no-400 font-medium flex items-center gap-1.5">
                <TrendingDown className="w-3.5 h-3.5" />
                NO Pool
              </span>
              <span className="text-surface-300 font-mono">
                {formatCredits(noPool)} {tokenSymbol}
              </span>
            </div>
            <div className="h-6 rounded-lg overflow-hidden bg-surface-800 relative">
              <motion.div
                className="h-full bg-gradient-to-r from-no-600 to-no-500 rounded-lg"
                initial={{ width: 0 }}
                animate={{ width: `${noPoolPct}%` }}
                transition={{ duration: 0.8, ease: 'easeOut', delay: 0.1 }}
              />
              <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white drop-shadow-md">
                {noPoolPct.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-surface-700/50 my-4" />

        {/* Total Pool */}
        <div className="flex justify-between items-center">
          <span className="text-surface-400 text-sm">Total Pool</span>
          <span className="text-white font-bold text-lg font-mono">
            {formatCredits(totalVolume)} {tokenSymbol}
          </span>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-4 mt-4">
        <div className="text-center p-3 rounded-lg bg-surface-800/30">
          <p className="text-xs text-surface-500 mb-1">YES Payout</p>
          <p className="text-lg font-bold text-yes-400">{potentialYesPayout.toFixed(2)}x</p>
        </div>
        <div className="text-center p-3 rounded-lg bg-surface-800/30">
          <p className="text-xs text-surface-500 mb-1">Total Bets</p>
          <p className="text-lg font-bold text-surface-300">{totalBets}</p>
        </div>
        <div className="text-center p-3 rounded-lg bg-surface-800/30">
          <p className="text-xs text-surface-500 mb-1">NO Payout</p>
          <p className="text-lg font-bold text-no-400">{potentialNoPayout.toFixed(2)}x</p>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 mt-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-yes-500" />
          <span className="text-surface-400">YES Pool ({currentYes.toFixed(1)}%)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-no-500" />
          <span className="text-surface-400">NO Pool ({currentNo.toFixed(1)}%)</span>
        </div>
      </div>
    </div>
  )
}
