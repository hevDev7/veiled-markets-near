import { motion } from 'framer-motion'
import { cn, formatCredits } from '@/lib/utils'

interface ProbabilityDonutProps {
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
    <div className={cn('flex flex-col items-center', className)}>
      {/* Donut + Pool info side by side on larger screens */}
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

        {/* Pool data + legend */}
        <div className="flex-1 w-full space-y-3">
          {/* Per-outcome pool info */}
          {segments.map((seg, i) => {
            const colors = DONUT_COLORS[i] || DONUT_COLORS[0]
            const reserve = hasPoolData ? reserves[i] ?? 0n : null
            const price = prices[i] ?? (1 / numOutcomes)
            const payout = price > 0 ? 1 / price : numOutcomes

            return (
              <div
                key={i}
                className={cn(
                  'flex items-center justify-between p-3 rounded-lg border',
                  colors.bg,
                  colors.border,
                )}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: seg.color }}
                  />
                  <div>
                    <span className={cn('text-sm font-semibold', colors.label)}>
                      {seg.label}
                    </span>
                    <span className="text-sm text-surface-400 ml-2">
                      {seg.pct.toFixed(1)}%
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  {reserve !== null && (
                    <div className="text-sm font-mono text-surface-300">
                      {formatCredits(reserve)} {tokenSymbol}
                    </div>
                  )}
                  <div className="text-xs text-surface-500">
                    {payout.toFixed(2)}x payout
                  </div>
                </div>
              </div>
            )
          })}

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
    </div>
  )
}
