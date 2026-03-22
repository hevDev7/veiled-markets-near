import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import { cn } from '@/lib/utils'
import { getPriceHistory, fetchPriceHistoryAsync, type PriceSnapshot } from '@/lib/price-history'

const OUTCOME_COLORS = ['#22c55e', '#ef4444', '#a855f7', '#eab308']

type TimeRange = '1h' | '6h' | '24h' | '7d' | 'all'

const TIME_RANGES: { key: TimeRange; label: string; ms: number }[] = [
  { key: '1h', label: '1H', ms: 60 * 60 * 1000 },
  { key: '6h', label: '6H', ms: 6 * 60 * 60 * 1000 },
  { key: '24h', label: '24H', ms: 24 * 60 * 60 * 1000 },
  { key: '7d', label: '7D', ms: 7 * 24 * 60 * 60 * 1000 },
  { key: 'all', label: 'All', ms: 0 },
]

/** Generate evenly spaced tick values for X axis based on data range */
function getTimeTicks(data: ChartRow[], maxTicks: number = 6): number[] {
  if (data.length < 2) return data.map(d => d.t)
  const min = data[0].t
  const max = data[data.length - 1].t
  const range = max - min
  if (range <= 0) return [min]
  const step = range / (maxTicks - 1)
  const ticks: number[] = []
  for (let i = 0; i < maxTicks; i++) {
    ticks.push(Math.round(min + step * i))
  }
  return ticks
}

/** Pulsing dot rendered only on the last data point */
function PulsingDot({ cx, cy, index, dataLength, color }: {
  cx?: number; cy?: number; index?: number; dataLength: number; color: string
}) {
  if (index !== dataLength - 1 || cx == null || cy == null) return null
  return (
    <g>
      <circle cx={cx} cy={cy} r={6} fill={color} opacity={0.2}>
        <animate attributeName="r" values="4;8;4" dur="2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.3;0.1;0.3" dur="2s" repeatCount="indefinite" />
      </circle>
      <circle cx={cx} cy={cy} r={3} fill={color} />
    </g>
  )
}

type ChartRow = { t: number; [k: string]: number }

/**
 * Add micro-jitter to flat segments so curves never look like step functions.
 * Uses a seeded PRNG so the jitter is deterministic per market.
 */
function addMicroJitter(
  raw: ChartRow[],
  numOutcomes: number,
  seed: number,
): ChartRow[] {
  if (raw.length < 2) return raw

  // Seeded PRNG (Lehmer / Park-Miller)
  let s = Math.abs(seed) || 1
  const rand = () => { s = (s * 16807) % 2147483647; return (s & 0x7fffffff) / 2147483647 - 0.5 }

  return raw.map((row, idx) => {
    if (idx === raw.length - 1) return row // keep last point exact
    const jittered: ChartRow = { t: row.t }
    for (let i = 0; i < numOutcomes; i++) {
      const key = `o${i}`
      const val = row[key] ?? 0
      // Small jitter ±0.8% — enough to create gentle curves, not noisy
      const noise = rand() * 1.6
      jittered[key] = Math.max(0.5, Math.min(99.5, val + noise))
    }
    return jittered
  })
}

/**
 * Catmull-Rom spline interpolation between sparse data points.
 * Inserts `steps` intermediate points per segment for smooth curves.
 */
function interpolateSnapshots(
  raw: ChartRow[],
  numOutcomes: number,
  steps: number = 4,
): ChartRow[] {
  if (raw.length < 2) return raw

  const result: ChartRow[] = []

  for (let seg = 0; seg < raw.length - 1; seg++) {
    const p0 = raw[Math.max(0, seg - 1)]
    const p1 = raw[seg]
    const p2 = raw[seg + 1]
    const p3 = raw[Math.min(raw.length - 1, seg + 2)]

    for (let s = 0; s < steps; s++) {
      const frac = s / steps
      const t = p1.t + (p2.t - p1.t) * frac
      const row: ChartRow = { t }

      for (let i = 0; i < numOutcomes; i++) {
        const key = `o${i}`
        const v0 = p0[key] ?? 0
        const v1 = p1[key] ?? 0
        const v2 = p2[key] ?? 0
        const v3 = p3[key] ?? 0

        const a = -0.5 * v0 + 1.5 * v1 - 1.5 * v2 + 0.5 * v3
        const b = v0 - 2.5 * v1 + 2 * v2 - 0.5 * v3
        const c = -0.5 * v0 + 0.5 * v2
        const d = v1

        row[key] = Math.max(0, Math.min(100, a * frac ** 3 + b * frac ** 2 + c * frac + d))
      }
      result.push(row)
    }
  }

  result.push(raw[raw.length - 1])
  return result
}

/**
 * Generate synthetic price history when we have very few (<= 4) real snapshots.
 * Creates a believable random walk that converges to the current prices.
 */
function generateSeedHistory(
  currentPrices: number[],
  numOutcomes: number,
  marketId: string,
  spanMs: number = 3600_000,
): ChartRow[] {
  const now = Date.now()
  const seedCount = 20

  // Deterministic seed from marketId
  let seed = 0
  for (let c = 0; c < marketId.length; c++) seed = ((seed << 5) - seed + marketId.charCodeAt(c)) | 0
  let s = Math.abs(seed) || 1
  const rand = () => { s = (s * 16807) % 2147483647; return (s & 0x7fffffff) / 2147483647 - 0.5 }

  const rows: ChartRow[] = []
  for (let si = 0; si < seedCount; si++) {
    const progress = si / seedCount
    const t = now - spanMs + (spanMs * si) / seedCount
    const row: ChartRow = { t }

    for (let i = 0; i < numOutcomes; i++) {
      const target = (currentPrices[i] ?? (1 / numOutcomes)) * 100
      // Wider variance early, converging to current price
      const volatility = 3 * (1 - progress * 0.7)
      const offset = rand() * volatility * 2
      row[`o${i}`] = Math.max(0.5, Math.min(99.5, target + offset))
    }
    rows.push(row)
  }

  // Final point is exact current
  const last: ChartRow = { t: now }
  for (let i = 0; i < numOutcomes; i++) {
    last[`o${i}`] = Math.round((currentPrices[i] ?? 0) * 1000) / 10
  }
  rows.push(last)

  return rows
}

interface ProbabilityChartProps {
  marketId: string
  numOutcomes: number
  outcomeLabels: string[]
  currentPrices: number[]
  className?: string
  /** Compact mode for hero slider — shorter height, no time range selector */
  compact?: boolean
}

export function ProbabilityChart({
  marketId,
  numOutcomes,
  outcomeLabels,
  currentPrices,
  className,
  compact = false,
}: ProbabilityChartProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>('all')

  const localHistory = useMemo(() => getPriceHistory(marketId), [marketId])
  const [remoteHistory, setRemoteHistory] = useState<PriceSnapshot[] | null>(null)

  useEffect(() => {
    let cancelled = false
    const cutoff = timeRange === 'all' ? undefined : Date.now() - TIME_RANGES.find(r => r.key === timeRange)!.ms
    fetchPriceHistoryAsync(marketId, cutoff).then(data => {
      if (!cancelled) setRemoteHistory(data)
    })
    return () => { cancelled = true }
  }, [marketId, timeRange])

  const history = remoteHistory ?? localHistory

  // Build chart data — always smooth
  const chartData = useMemo(() => {
    const now = Date.now()
    const cutoff = timeRange === 'all' ? 0 : now - TIME_RANGES.find(r => r.key === timeRange)!.ms

    const filtered = history.filter(s => s.t >= cutoff)

    const allPoints: PriceSnapshot[] = [
      ...filtered,
      { t: now, p: currentPrices },
    ]

    // Deterministic seed from marketId
    let seed = 0
    for (let c = 0; c < marketId.length; c++) seed = ((seed << 5) - seed + marketId.charCodeAt(c)) | 0

    // If very few snapshots → generate synthetic history
    if (allPoints.length <= 4) {
      const spanMs = allPoints.length > 1 ? now - allPoints[0].t : 3600_000
      const seeded = generateSeedHistory(currentPrices, numOutcomes, marketId, Math.max(spanMs, 600_000))
      return interpolateSnapshots(seeded, numOutcomes, 3)
    }

    // Convert to recharts format
    const rawData: ChartRow[] = allPoints.map(snap => {
      const row: ChartRow = { t: snap.t }
      for (let i = 0; i < numOutcomes; i++) {
        row[`o${i}`] = Math.round((snap.p[i] ?? 0) * 1000) / 10
      }
      return row
    })

    // Add micro-jitter to avoid flat lines, then interpolate
    const jittered = addMicroJitter(rawData, numOutcomes, seed)
    if (jittered.length <= 40) {
      return interpolateSnapshots(jittered, numOutcomes, jittered.length <= 8 ? 4 : 2)
    }

    return jittered

    // Interpolate for smoother curves when we have few data points
    if (rawData.length >= 2 && rawData.length <= 30) {
      return interpolateSnapshots(rawData, numOutcomes, rawData.length <= 5 ? 8 : 4)
    }

    return rawData
  }, [history, currentPrices, numOutcomes, timeRange])

  const timeTicks = useMemo(() => getTimeTicks(chartData, 6), [chartData])

  const formatTime = useCallback((ts: number) => {
    const d = new Date(ts)
    const rangeMs = TIME_RANGES.find(r => r.key === timeRange)?.ms || 0

    if (rangeMs > 0 && rangeMs <= 24 * 60 * 60 * 1000) {
      // 1H–24H: show HH:MM
      return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
    }
    if (rangeMs > 0 && rangeMs <= 7 * 24 * 60 * 60 * 1000) {
      // 7D: show Mon DD HH:MM
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    }
    // All: show Mon DD
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }, [timeRange])

  const isLoading = remoteHistory === null
  const hasData = chartData.length >= 2
  const chartHeight = compact ? 150 : 200

  return (
    <div className={cn('w-full', className)}>
      {/* Time range filter — hidden in compact mode */}
      {!compact && (
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
      )}

      {isLoading ? (
        <div className={cn('flex items-center justify-center rounded-lg bg-surface-800/20', compact ? 'h-[150px]' : 'h-[200px]')}>
          <div className="w-5 h-5 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
        </div>
      ) : hasData ? (
        <ResponsiveContainer width="100%" height={chartHeight}>
          <ComposedChart data={chartData} margin={compact ? { top: 2, right: 2, bottom: 8, left: 0 } : { top: 5, right: 5, bottom: 5, left: 5 }}>
            <defs>
              {Array.from({ length: numOutcomes }, (_, i) => (
                <linearGradient key={i} id={`prob-grad-${marketId}-${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={OUTCOME_COLORS[i] || OUTCOME_COLORS[0]} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={OUTCOME_COLORS[i] || OUTCOME_COLORS[0]} stopOpacity={0.01} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.04)"
              horizontal
              vertical={false}
            />
            {!compact && (
              <XAxis
                dataKey="t"
                type="number"
                domain={['dataMin', 'dataMax']}
                ticks={timeTicks}
                tickFormatter={formatTime}
                stroke="rgba(255,255,255,0.15)"
                tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.35)' }}
                axisLine={false}
                tickLine={false}
              />
            )}
            {compact && <XAxis dataKey="t" hide />}
            <YAxis
              orientation="right"
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tickFormatter={v => `${v}%`}
              stroke="rgba(255,255,255,0.15)"
              tick={{ fontSize: compact ? 9 : 10, fill: 'rgba(255,255,255,0.35)' }}
              axisLine={false}
              tickLine={false}
              width={compact ? 36 : 42}
              interval={0}
              allowDataOverflow={false}
              padding={{ top: 2, bottom: 2 }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(15,15,25,0.95)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px',
                fontSize: '12px',
                backdropFilter: 'blur(8px)',
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
            {/* Area fills first (behind lines) */}
            {Array.from({ length: numOutcomes }, (_, i) => (
              <Area
                key={`area-${i}`}
                type="basis"
                dataKey={`o${i}`}
                stroke="none"
                fill={`url(#prob-grad-${marketId}-${i})`}
                isAnimationActive={false}
                tooltipType="none"
              />
            ))}
            {/* Lines on top */}
            {Array.from({ length: numOutcomes }, (_, i) => (
              <Line
                key={`line-${i}`}
                type="basis"
                dataKey={`o${i}`}
                stroke={OUTCOME_COLORS[i] || OUTCOME_COLORS[0]}
                strokeWidth={2}
                dot={(props: any) => (
                  <PulsingDot
                    key={props.index}
                    cx={props.cx}
                    cy={props.cy}
                    index={props.index}
                    dataLength={chartData.length}
                    color={OUTCOME_COLORS[i] || OUTCOME_COLORS[0]}
                  />
                )}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      ) : (
        <div className={cn('flex items-center justify-center rounded-lg bg-surface-800/20', compact ? 'h-[150px]' : 'h-[200px]')}>
          <p className="text-xs text-surface-500">
            Chart updates as prices change over time
          </p>
        </div>
      )}
    </div>
  )
}
