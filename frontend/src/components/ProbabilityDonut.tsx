import { motion } from 'framer-motion'
import { cn, formatCredits } from '@/lib/utils'
import { ProbabilityChart } from './ProbabilityChart'

interface ProbabilityDonutProps {
  marketId: string
  numOutcomes: number
  outcomeLabels: string[]
  prices: number[] // 0-1 range per outcome
  reserves?: bigint[] // pool reserves per outcome
  totalLiquidity?: bigint
  totalVolume?: bigint
  tokenSymbol?: string
  className?: string
}

const DONUT_COLORS = [
  { stroke: '#22c55e', label: 'text-yes-400', bg: 'bg-yes-500/10', border: 'border-yes-500/20' },
  { stroke: '#ef4444', label: 'text-no-400', bg: 'bg-no-500/10', border: 'border-no-500/20' },
  { stroke: '#a855f7', label: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
  { stroke: '#eab308', label: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20' },
]

export function ProbabilityDonut({
  marketId,
  numOutcomes,
  outcomeLabels,
  prices,
  reserves,
  totalLiquidity,
  totalVolume,
  tokenSymbol = 'ALEO',
  className,
}: ProbabilityDonutProps) {
  const size = 180
  const strokeWidth = 26
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const center = size / 2

  // Build segments
  const segments: { offset: number; length: number; color: string; pct: number; label: string }[] = []
  let accumulated = 0
  for (let i = 0; i < numOutcomes; i++) {
    const pct = (prices[i] ?? 0) * 100
    const length = (pct / 100) * circumference
    segments.push({
      offset: accumulated,
      length,
      color: DONUT_COLORS[i]?.stroke ?? '#6b7280',
      pct,
      label: outcomeLabels[i] || `Outcome ${i + 1}`,
    })
    accumulated += length
  }

  // Find dominant outcome
  const dominantIdx = prices.indexOf(Math.max(...prices))
  const dominantPct = (prices[dominantIdx] ?? 0) * 100
  const dominantLabel = outcomeLabels[dominantIdx] || `Outcome ${dominantIdx + 1}`
  const dominantColor = DONUT_COLORS[dominantIdx]?.label ?? 'text-white'

  const hasPoolData = reserves && reserves.length > 0

  return (
    <div className={cn('flex flex-col', className)}>
      {/* Top: Donut + Chart side by side */}
      <div className="flex flex-col sm:flex-row items-center gap-6 w-full">
        {/* Donut Chart */}
        <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="-rotate-90">
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke="rgba(255,255,255,0.05)"
              strokeWidth={strokeWidth}
            />
            {segments.map((seg, i) => (
              <motion.circle
                key={i}
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={seg.color}
                strokeWidth={strokeWidth}
                strokeLinecap="butt"
                strokeDasharray={`${seg.length} ${circumference - seg.length}`}
                strokeDashoffset={-seg.offset}
                initial={{ strokeDasharray: `0 ${circumference}` }}
                animate={{ strokeDasharray: `${seg.length} ${circumference - seg.length}` }}
                transition={{ duration: 0.8, ease: 'easeOut', delay: i * 0.15 }}
              />
            ))}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={cn('text-3xl font-bold', dominantColor)}>
              {dominantPct.toFixed(1)}%
            </span>
            <span className="text-sm text-surface-400">{dominantLabel}</span>
          </div>
        </div>

        {/* Probability Line Chart */}
        <div className="flex-1 w-full min-w-0">
          <ProbabilityChart
            marketId={marketId}
            numOutcomes={numOutcomes}
            outcomeLabels={outcomeLabels}
            currentPrices={prices}
          />
        </div>
      </div>

      {/* Bottom: stats */}
      <div className="mt-4 space-y-2">
        {/* Total liquidity + volume */}
        {hasPoolData && (
          <div className="flex items-center justify-between pt-2 border-t border-surface-700/50">
            <span className="text-sm text-surface-400">Total Liquidity</span>
            <span className="text-sm font-bold font-mono text-white">
              {formatCredits(totalLiquidity ?? 0n)} {tokenSymbol}
            </span>
          </div>
        )}
        {totalVolume !== undefined && totalVolume > 0n && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-surface-400">Volume</span>
            <span className="text-sm font-bold font-mono text-surface-300">
              {formatCredits(totalVolume)} {tokenSymbol}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
