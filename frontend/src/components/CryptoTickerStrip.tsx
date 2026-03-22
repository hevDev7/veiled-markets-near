import { useEffect, useState, useRef, useCallback } from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { priceService, CHAINLINK_FEED_IDS, type TickerCoin } from '@/lib/chainlink-price-service'

function MiniSparkline({ prices, isUp }: { prices: number[]; isUp: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || prices.length < 2) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = 80 * dpr
    canvas.height = 32 * dpr
    ctx.scale(dpr, dpr)

    const w = 80, h = 32
    const min = Math.min(...prices)
    const max = Math.max(...prices)
    const range = max - min || 1

    ctx.clearRect(0, 0, w, h)
    ctx.beginPath()
    for (let i = 0; i < prices.length; i++) {
      const x = (i / (prices.length - 1)) * w
      const y = h - ((prices[i] - min) / range) * (h - 4) - 2
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    }
    ctx.strokeStyle = isUp ? '#10b981' : '#f43f5e'
    ctx.lineWidth = 1.5
    ctx.lineJoin = 'round'
    ctx.stroke()
  }, [prices, isUp])

  return <canvas ref={canvasRef} className="w-[80px] h-[32px]" style={{ width: 80, height: 32 }} />
}

/** Small Chainlink icon badge for coins with feed IDs */
function ChainlinkBadge() {
  return (
    <span
      className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-blue-500/90 flex items-center justify-center"
      title="Chainlink Data Streams feed available"
    >
      <svg className="w-2 h-2 text-white" viewBox="0 0 37.8 43.6" fill="currentColor">
        <path d="M18.9 0l-4 2.3L4 8.6l-4 2.3v21.8l4 2.3L14.9 41.3l4 2.3 4-2.3L33.8 35l4-2.3V10.9l-4-2.3L22.9 2.3 18.9 0zM8 28.4V15.2l10.9-6.3 10.9 6.3v13.2l-10.9 6.3L8 28.4z"/>
      </svg>
    </span>
  )
}

export function CryptoTickerStrip() {
  const [coins, setCoins] = useState<TickerCoin[]>([])
  const [loading, setLoading] = useState(true)

  const fetchPrices = useCallback(async () => {
    try {
      const data = await priceService.getTickerCoins()
      setCoins(data)
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPrices()
    const iv = setInterval(fetchPrices, 30_000)
    return () => clearInterval(iv)
  }, [fetchPrices])

  if (loading && coins.length === 0) {
    return (
      <div className="flex items-center gap-6 px-4 py-3 overflow-x-auto scrollbar-hide">
        {[1,2,3,4,5].map(i => (
          <div key={i} className="flex items-center gap-3 animate-pulse">
            <div className="w-6 h-6 rounded-full bg-surface-800" />
            <div className="w-16 h-4 rounded bg-surface-800" />
            <div className="w-12 h-4 rounded bg-surface-800" />
          </div>
        ))}
      </div>
    )
  }

  if (coins.length === 0) return null

  return (
    <div className="flex items-center gap-5 overflow-x-auto scrollbar-hide py-2">
      {coins.map(coin => {
        const isUp = coin.change24h >= 0
        const hasFeed = !!CHAINLINK_FEED_IDS[coin.symbol]
        return (
          <div
            key={coin.id}
            className="flex items-center gap-3 flex-shrink-0 px-3 py-2 rounded-xl bg-white/[0.01] border border-surface-700/20 hover:border-surface-600/40 transition-all cursor-default"
          >
            <div className="relative flex-shrink-0">
              <img
                src={coin.image}
                alt={coin.name}
                className="w-7 h-7 rounded-full"
                loading="lazy"
              />
              {hasFeed && <ChainlinkBadge />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-white uppercase">{coin.symbol}</span>
                <span className={cn(
                  'flex items-center gap-0.5 text-[10px] font-semibold',
                  isUp ? 'text-emerald-400' : 'text-rose-400'
                )}>
                  {isUp ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                  {isUp ? '+' : ''}{coin.change24h.toFixed(1)}%
                </span>
              </div>
              <span className="text-xs text-surface-300 tabular-nums font-medium">
                ${coin.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: coin.currentPrice < 1 ? 4 : 2 })}
              </span>
            </div>
            {coin.sparkline.length > 2 && (
              <MiniSparkline prices={coin.sparkline} isUp={isUp} />
            )}
          </div>
        )
      })}
      {/* Chainlink attribution */}
      <div className="flex items-center gap-1.5 flex-shrink-0 px-2 py-2 opacity-40">
        <svg className="w-3 h-3 text-blue-400" viewBox="0 0 37.8 43.6" fill="currentColor">
          <path d="M18.9 0l-4 2.3L4 8.6l-4 2.3v21.8l4 2.3L14.9 41.3l4 2.3 4-2.3L33.8 35l4-2.3V10.9l-4-2.3L22.9 2.3 18.9 0zM8 28.4V15.2l10.9-6.3 10.9 6.3v13.2l-10.9 6.3L8 28.4z"/>
        </svg>
        <span className="text-[10px] text-surface-500 whitespace-nowrap">
          Powered by {priceService.getSourceLabel()}
        </span>
      </div>
    </div>
  )
}
