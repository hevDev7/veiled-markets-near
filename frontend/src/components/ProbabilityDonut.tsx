import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface ProbabilityDonutProps {
  numOutcomes: number
  outcomeLabels: string[]
  prices: number[] // 0-1 range per outcome
  className?: string
}

const DONUT_COLORS = [
  { stroke: '#22c55e', label: 'text-yes-400' },   // Yes - green
  { stroke: '#ef4444', label: 'text-no-400' },     // No - red
  { stroke: '#a855f7', label: 'text-purple-400' }, // Outcome 3
  { stroke: '#eab308', label: 'text-yellow-400' }, // Outcome 4
]

export function ProbabilityDonut({
  numOutcomes,
  outcomeLabels,
  prices,
  className,
}: ProbabilityDonutProps) {
  const size = 200
  const strokeWidth = 28
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

  return (
    <div className={cn('flex flex-col items-center', className)}>
      {/* Donut Chart */}
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          {/* Background ring */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.05)"
            strokeWidth={strokeWidth}
          />
          {/* Segments */}
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
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn('text-3xl font-bold', dominantColor)}>
            {dominantPct.toFixed(1)}%
          </span>
          <span className="text-sm text-surface-400">{dominantLabel}</span>
        </div>
      </div>

      {/* Legend */}
      <div className={cn(
        'flex items-center gap-6 mt-4',
        numOutcomes > 2 && 'flex-wrap justify-center'
      )}>
        {segments.map((seg, i) => (
          <div key={i} className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: seg.color }}
            />
            <span className={cn('text-sm font-medium', DONUT_COLORS[i]?.label ?? 'text-white')}>
              {seg.label}
            </span>
            <span className="text-sm text-surface-400">
              {seg.pct.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
