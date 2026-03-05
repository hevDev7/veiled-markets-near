import { useState, useMemo } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import { cn } from '@/lib/utils'
import { getPriceHistory, type PriceSnapshot } from '@/lib/price-history'

const OUTCOME_COLORS = ['#22c55e', '#ef4444', '#a855f7', '#eab308']

type TimeRange = '1h' | '6h' | '24h' | 'all'

const TIME_RANGES: { key: TimeRange; label: string; ms: number }[] = [
  { key: '1h', label: '1H', ms: 60 * 60 * 1000 },
  { key: '6h', label: '6H', ms: 6 * 60 * 60 * 1000 },
  { key: '24h', label: '24H', ms: 24 * 60 * 60 * 1000 },
  { key: 'all', label: 'All', ms: 0 },
]

interface ProbabilityChartProps {
  marketId: string
  numOutcomes: number
  outcomeLabels: string[]
  currentPrices: number[]
  className?: string
}

export function ProbabilityChart({
  marketId,
  numOutcomes,
  outcomeLabels,
  currentPrices,
  className,
}: ProbabilityChartProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>('all')

  const history = useMemo(() => getPriceHistory(marketId), [marketId])

  // Build chart data: history + current point
  const chartData = useMemo(() => {
    const now = Date.now()
    const cutoff = timeRange === 'all' ? 0 : now - TIME_RANGES.find(r => r.key === timeRange)!.ms

    // Filter by time range
    const filtered = history.filter(s => s.t >= cutoff)

    // Add current prices as latest point
    const allPoints: PriceSnapshot[] = [
      ...filtered,
      { t: now, p: currentPrices },
    ]

    // Transform to recharts format
    return allPoints.map(snap => {
      const row: Record<string, number> = { t: snap.t }
      for (let i = 0; i < numOutcomes; i++) {
        row[`o${i}`] = Math.round((snap.p[i] ?? 0) * 1000) / 10 // percentage with 1 decimal
      }
      return row
    })
  }, [history, currentPrices, numOutcomes, timeRange])

  const formatTime = (ts: number) => {
    const d = new Date(ts)
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  }

  const hasData = chartData.length >= 2

  return (
    <div className={cn('w-full', className)}>
      {/* Time range filter */}
      <div className="flex gap-1 mb-3">
        {TIME_RANGES.map(r => (
          <button
            key={r.key}
            onClick={() => setTimeRange(r.key)}
            className={cn(
              'px-2.5 py-1 rounded text-xs font-medium transition-colors',
              timeRange === r.key
                ? 'bg-brand-500/20 text-brand-400'
                : 'text-surface-500 hover:text-surface-300'
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      {hasData ? (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis
                  dataKey="t"
                  tickFormatter={formatTime}
                  stroke="rgba(255,255,255,0.2)"
                  tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.4)' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  orientation="right"
                  domain={[0, 100]}
                  tickFormatter={v => `${v}%`}
                  stroke="rgba(255,255,255,0.2)"
                  tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.4)' }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(15,15,25,0.95)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                  labelFormatter={(ts) => {
                    const d = new Date(ts as number)
                    return d.toLocaleString(undefined, {
                      month: 'short', day: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })
                  }}
                  formatter={(value, name) => {
                    const idx = parseInt(String(name).replace('o', ''))
                    const label = outcomeLabels[idx] || `Outcome ${idx + 1}`
                    return [`${Number(value ?? 0).toFixed(1)}%`, label]
                  }}
                />
                {Array.from({ length: numOutcomes }, (_, i) => (
                  <Line
                    key={i}
                    type="monotone"
                    dataKey={`o${i}`}
                    stroke={OUTCOME_COLORS[i] || OUTCOME_COLORS[0]}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
      ) : (
        <div className="h-[180px] flex items-center justify-center rounded-lg bg-surface-800/20">
          <p className="text-xs text-surface-500">
            Chart updates as prices change over time
          </p>
        </div>
      )}
    </div>
  )
}
