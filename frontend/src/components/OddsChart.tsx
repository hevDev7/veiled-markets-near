import { motion } from 'framer-motion'
import { BarChart3 } from 'lucide-react'
import { cn, formatCredits } from '@/lib/utils'

// Color config per outcome (1-indexed, matching OutcomeSelector)
const POOL_COLORS = [
  { text: 'text-yes-400', bg: 'bg-yes-500', gradient: 'from-yes-600 to-yes-500', dot: 'bg-yes-500' },
  { text: 'text-no-400', bg: 'bg-no-500', gradient: 'from-no-600 to-no-500', dot: 'bg-no-500' },
  { text: 'text-purple-400', bg: 'bg-purple-500', gradient: 'from-purple-600 to-purple-500', dot: 'bg-purple-500' },
  { text: 'text-yellow-400', bg: 'bg-yellow-500', gradient: 'from-yellow-600 to-yellow-500', dot: 'bg-yellow-500' },
]

interface OddsChartProps {
  numOutcomes: number
  outcomeLabels: string[]
  reserves: bigint[]        // [reserve_1, reserve_2, ...] per outcome
  prices: number[]          // [price_1, price_2, ...] 0-1 range
  totalVolume: bigint
  totalBets: number
  tokenSymbol?: string
  className?: string
}

export function OddsChart({
  numOutcomes,
  outcomeLabels,
  reserves,
  prices,
  totalVolume,
  totalBets,
  tokenSymbol = 'ALEO',
  className,
}: OddsChartProps) {
  const totalPool = reserves.reduce((sum, r) => sum + r, 0n)

  // Compute percentage for each pool
  const poolPcts = reserves.map(r =>
    totalPool > 0n
      ? Math.round(Number((r * 10000n) / totalPool)) / 100
      : Math.round(10000 / numOutcomes) / 100
  )

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
          {Array.from({ length: numOutcomes }, (_, i) => {
            const colors = POOL_COLORS[i] || POOL_COLORS[0]
            const label = outcomeLabels[i] || `Outcome ${i + 1}`
            const reserve = reserves[i] ?? 0n
            const pct = poolPcts[i] ?? 0

            return (
              <div key={i}>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className={cn(colors.text, 'font-medium')}>
                    {label} Pool
                  </span>
                  <span className="text-surface-300 font-mono">
                    {formatCredits(reserve)} {tokenSymbol}
                  </span>
                </div>
                <div className="h-6 rounded-lg overflow-hidden bg-surface-800 relative">
                  <motion.div
                    className={cn('h-full bg-gradient-to-r rounded-lg', colors.gradient)}
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut', delay: i * 0.1 }}
                  />
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white drop-shadow-md">
                    {pct.toFixed(1)}%
                  </span>
                </div>
              </div>
            )
          })}
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

      {/* Stats Row — payouts per outcome */}
      <div className={cn('grid gap-4 mt-4',
        numOutcomes === 2 ? 'grid-cols-3' :
        numOutcomes === 3 ? 'grid-cols-4' :
        'grid-cols-2 sm:grid-cols-4'
      )}>
        {Array.from({ length: numOutcomes }, (_, i) => {
          const colors = POOL_COLORS[i] || POOL_COLORS[0]
          const label = outcomeLabels[i] || `Outcome ${i + 1}`
          const price = prices[i] ?? (1 / numOutcomes)
          const payout = price > 0 ? 1 / price : numOutcomes

          return (
            <div key={i} className="text-center p-3 rounded-lg bg-surface-800/30">
              <p className="text-xs text-surface-500 mb-1">{label}</p>
              <p className={cn('text-lg font-bold', colors.text)}>{payout.toFixed(2)}x</p>
            </div>
          )
        })}
        {numOutcomes <= 3 && (
          <div className="text-center p-3 rounded-lg bg-surface-800/30">
            <p className="text-xs text-surface-500 mb-1">Total Bets</p>
            <p className="text-lg font-bold text-surface-300">{totalBets}</p>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className={cn('flex items-center justify-center gap-4 mt-4 text-sm', numOutcomes > 3 && 'flex-wrap')}>
        {Array.from({ length: numOutcomes }, (_, i) => {
          const colors = POOL_COLORS[i] || POOL_COLORS[0]
          const label = outcomeLabels[i] || `Outcome ${i + 1}`
          const pct = (prices[i] ?? (1 / numOutcomes)) * 100

          return (
            <div key={i} className="flex items-center gap-2">
              <div className={cn('w-3 h-3 rounded-full', colors.dot)} />
              <span className="text-surface-400">{label} ({pct.toFixed(1)}%)</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
