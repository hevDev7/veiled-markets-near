import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, Clock } from 'lucide-react'
import { useMemo } from 'react'
import { cn } from '@/lib/utils'

interface OddsDataPoint {
  timestamp: number
  yesPercentage: number
  noPercentage: number
}

interface OddsChartProps {
  currentYes: number
  currentNo: number
  className?: string
}

// Generate mock historical data for demo
function generateMockHistory(currentYes: number): OddsDataPoint[] {
  const now = Date.now()
  const hour = 60 * 60 * 1000
  const points: OddsDataPoint[] = []
  
  // Start from 50% and gradually move towards current percentage
  let yesValue = 50
  const steps = 24 // 24 data points (hourly for last day)
  const stepSize = (currentYes - 50) / steps
  
  for (let i = 0; i < steps; i++) {
    // Add some randomness
    const noise = (Math.random() - 0.5) * 8
    yesValue = Math.max(5, Math.min(95, yesValue + stepSize + noise))
    
    points.push({
      timestamp: now - (steps - i) * hour,
      yesPercentage: yesValue,
      noPercentage: 100 - yesValue,
    })
  }
  
  // Ensure last point matches current
  points.push({
    timestamp: now,
    yesPercentage: currentYes,
    noPercentage: 100 - currentYes,
  })
  
  return points
}

export function OddsChart({ currentYes, currentNo, className }: OddsChartProps) {
  const historyData = useMemo(() => generateMockHistory(currentYes), [currentYes])
  
  // Calculate chart dimensions
  const width = 100 // percentage
  const height = 100 // will be mapped to actual height
  const padding = 5
  
  // Generate SVG path for the line
  const yesPath = useMemo(() => {
    if (historyData.length < 2) return ''
    
    const xStep = (width - padding * 2) / (historyData.length - 1)
    
    const points = historyData.map((d, i) => ({
      x: padding + i * xStep,
      y: height - padding - (d.yesPercentage / 100) * (height - padding * 2),
    }))
    
    // Create smooth curve
    let path = `M ${points[0].x} ${points[0].y}`
    
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1]
      const curr = points[i]
      const cpx = (prev.x + curr.x) / 2
      path += ` C ${cpx} ${prev.y}, ${cpx} ${curr.y}, ${curr.x} ${curr.y}`
    }
    
    return path
  }, [historyData])
  
  // Generate area fill path
  const areaPath = useMemo(() => {
    if (!yesPath) return ''
    
    const xStep = (width - padding * 2) / (historyData.length - 1)
    const lastX = padding + (historyData.length - 1) * xStep
    const firstX = padding
    
    return `${yesPath} L ${lastX} ${height - padding} L ${firstX} ${height - padding} Z`
  }, [yesPath, historyData])
  
  // Calculate trend
  const startYes = historyData[0]?.yesPercentage || 50
  const trend = currentYes - startYes
  const trendDirection = trend > 0 ? 'up' : trend < 0 ? 'down' : 'neutral'
  
  // Time labels
  const timeLabels = ['24h ago', '12h ago', 'Now']

  return (
    <div className={cn("", className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Probability History</h3>
        <div className="flex items-center gap-2 text-sm">
          <Clock className="w-4 h-4 text-surface-400" />
          <span className="text-surface-400">Last 24 hours</span>
        </div>
      </div>
      
      {/* Chart Container */}
      <div className="relative h-48 bg-surface-800/30 rounded-xl p-4">
        {/* Grid Lines */}
        <div className="absolute inset-4">
          {[75, 50, 25].map((line) => (
            <div
              key={line}
              className="absolute w-full border-t border-dashed border-surface-700/50"
              style={{ top: `${100 - line}%` }}
            >
              <span className="absolute -left-2 -top-2.5 text-xs text-surface-500 -translate-x-full">
                {line}%
              </span>
            </div>
          ))}
        </div>
        
        {/* SVG Chart */}
        <svg 
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-full"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="yesGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="rgb(16, 185, 129)" stopOpacity="0.3" />
              <stop offset="100%" stopColor="rgb(16, 185, 129)" stopOpacity="0.05" />
            </linearGradient>
            <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgb(16, 185, 129)" stopOpacity="0.5" />
              <stop offset="100%" stopColor="rgb(16, 185, 129)" stopOpacity="1" />
            </linearGradient>
          </defs>
          
          {/* Area Fill */}
          <motion.path
            d={areaPath}
            fill="url(#yesGradient)"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          />
          
          {/* Line */}
          <motion.path
            d={yesPath}
            fill="none"
            stroke="url(#lineGradient)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1, ease: "easeOut" }}
          />
          
          {/* Current Point */}
          <motion.circle
            cx={padding + (historyData.length - 1) * ((width - padding * 2) / (historyData.length - 1))}
            cy={height - padding - (currentYes / 100) * (height - padding * 2)}
            r="4"
            fill="rgb(16, 185, 129)"
            stroke="white"
            strokeWidth="2"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 1, type: "spring" }}
          />
        </svg>
        
        {/* Time Labels */}
        <div className="absolute bottom-1 left-4 right-4 flex justify-between">
          {timeLabels.map((label) => (
            <span key={label} className="text-xs text-surface-500">
              {label}
            </span>
          ))}
        </div>
      </div>
      
      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-4 mt-4">
        <div className="text-center p-3 rounded-lg bg-surface-800/30">
          <p className="text-xs text-surface-500 mb-1">Starting</p>
          <p className="text-lg font-bold text-surface-300">{startYes.toFixed(1)}%</p>
        </div>
        <div className="text-center p-3 rounded-lg bg-surface-800/30">
          <p className="text-xs text-surface-500 mb-1">24h Change</p>
          <div className={cn(
            "flex items-center justify-center gap-1",
            trendDirection === 'up' ? "text-yes-400" : 
            trendDirection === 'down' ? "text-no-400" : "text-surface-400"
          )}>
            {trendDirection === 'up' ? (
              <TrendingUp className="w-4 h-4" />
            ) : trendDirection === 'down' ? (
              <TrendingDown className="w-4 h-4" />
            ) : null}
            <span className="text-lg font-bold">
              {trend > 0 ? '+' : ''}{trend.toFixed(1)}%
            </span>
          </div>
        </div>
        <div className="text-center p-3 rounded-lg bg-surface-800/30">
          <p className="text-xs text-surface-500 mb-1">Current</p>
          <p className="text-lg font-bold text-yes-400">{currentYes.toFixed(1)}%</p>
        </div>
      </div>
      
      {/* Legend */}
      <div className="flex items-center justify-center gap-6 mt-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-yes-500" />
          <span className="text-surface-400">YES Probability</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-no-500" />
          <span className="text-surface-400">NO Probability</span>
        </div>
      </div>
    </div>
  )
}
