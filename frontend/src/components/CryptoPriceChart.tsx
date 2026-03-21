import { useEffect, useState, useRef, useCallback } from 'react'
import { TrendingUp, TrendingDown, RefreshCw, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { priceService, CHAINLINK_FEED_IDS } from '@/lib/chainlink-price-service'

// ── Crypto ticker detection from market question text ──

const CRYPTO_MAP: Record<string, { id: string; symbol: string; name: string }> = {
  BTC: { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' },
  BITCOIN: { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' },
  ETH: { id: 'ethereum', symbol: 'ETH', name: 'Ethereum' },
  ETHEREUM: { id: 'ethereum', symbol: 'ETH', name: 'Ethereum' },
  SOL: { id: 'solana', symbol: 'SOL', name: 'Solana' },
  SOLANA: { id: 'solana', symbol: 'SOL', name: 'Solana' },
  ALEO: { id: 'aleo', symbol: 'ALEO', name: 'Aleo' },
  BNB: { id: 'binancecoin', symbol: 'BNB', name: 'BNB' },
  XRP: { id: 'ripple', symbol: 'XRP', name: 'XRP' },
  DOGE: { id: 'dogecoin', symbol: 'DOGE', name: 'Dogecoin' },
  ADA: { id: 'cardano', symbol: 'ADA', name: 'Cardano' },
  AVAX: { id: 'avalanche-2', symbol: 'AVAX', name: 'Avalanche' },
  DOT: { id: 'polkadot', symbol: 'DOT', name: 'Polkadot' },
  MATIC: { id: 'matic-network', symbol: 'MATIC', name: 'Polygon' },
  LINK: { id: 'chainlink', symbol: 'LINK', name: 'Chainlink' },
  ATOM: { id: 'cosmos', symbol: 'ATOM', name: 'Cosmos' },
}

// Logo URLs from CoinGecko CDN
const CRYPTO_LOGOS: Record<string, string> = {
  bitcoin: 'https://assets.coingecko.com/coins/images/1/small/bitcoin.png',
  ethereum: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
  solana: 'https://assets.coingecko.com/coins/images/4128/small/solana.png',
  aleo: 'https://assets.coingecko.com/coins/images/29860/small/aleo.png',
  binancecoin: 'https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png',
  ripple: 'https://assets.coingecko.com/coins/images/44/small/xrp-symbol-white-128.png',
  dogecoin: 'https://assets.coingecko.com/coins/images/5/small/dogecoin.png',
  cardano: 'https://assets.coingecko.com/coins/images/975/small/cardano.png',
  'avalanche-2': 'https://assets.coingecko.com/coins/images/12559/small/Avalanche_Circle_RedWhite_Trans.png',
  polkadot: 'https://assets.coingecko.com/coins/images/12171/small/polkadot.png',
  'matic-network': 'https://assets.coingecko.com/coins/images/4713/small/polygon.png',
  chainlink: 'https://assets.coingecko.com/coins/images/877/small/chainlink-new-logo.png',
  cosmos: 'https://assets.coingecko.com/coins/images/1481/small/cosmos_hub.png',
}

/** Try to extract a crypto from the question text */
export function detectCryptoFromQuestion(question: string): { id: string; symbol: string; name: string } | null {
  const upper = question.toUpperCase()
  for (const [key, val] of Object.entries(CRYPTO_MAP)) {
    const regex = new RegExp(`\\b${key}\\b`, 'i')
    if (regex.test(upper)) return val
  }
  const dollarMatch = upper.match(/\$([A-Z]{2,6})/)
  if (dollarMatch && CRYPTO_MAP[dollarMatch[1]]) return CRYPTO_MAP[dollarMatch[1]]
  return null
}

// ── Types ──

interface PricePoint {
  time: number
  price: number
}

interface CryptoPriceChartProps {
  question: string
  category: number
  /** Optional: baseline price when market was created (for Up/Down comparison) */
  baselinePrice?: number
  baselineTimestamp?: number
  className?: string
}

// ── Chainlink Logo SVG ──
function ChainlinkLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 37.8 43.6" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M18.9 0l-4 2.3L4 8.6l-4 2.3v21.8l4 2.3L14.9 41.3l4 2.3 4-2.3L33.8 35l4-2.3V10.9l-4-2.3L22.9 2.3 18.9 0zM8 28.4V15.2l10.9-6.3 10.9 6.3v13.2l-10.9 6.3L8 28.4z"/>
    </svg>
  )
}

// ── Component ──

export function CryptoPriceChart({ question, category, baselinePrice, baselineTimestamp, className }: CryptoPriceChartProps) {
  const crypto = detectCryptoFromQuestion(question)
  const [priceData, setPriceData] = useState<PricePoint[]>([])
  const [currentPrice, setCurrentPrice] = useState<number | null>(null)
  const [priceChange24h, setPriceChange24h] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval>>()

  // Only show for crypto category (3) or if crypto detected
  if (category !== 3 && !crypto) return null
  if (!crypto) return null

  const feedId = CHAINLINK_FEED_IDS[crypto.symbol]
  const sourceLabel = priceService.getSourceLabel()

  const fetchPriceData = useCallback(async () => {
    try {
      const [history, priceResult] = await Promise.all([
        priceService.getPriceHistory(crypto.symbol),
        priceService.getCurrentPrice(crypto.symbol),
      ])

      setPriceData(history.points)
      setCurrentPrice(priceResult.price)
      setPriceChange24h(priceResult.change24h)
      setLastUpdated(new Date())
      setError(null)
    } catch (err) {
      setError('Failed to load price data')
    } finally {
      setLoading(false)
    }
  }, [crypto.symbol])

  useEffect(() => {
    fetchPriceData()
    // Refresh every 30s (more frequent for price markets)
    intervalRef.current = setInterval(fetchPriceData, 30_000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [fetchPriceData])

  // ── Draw chart on canvas ──
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || priceData.length < 2) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)

    const w = rect.width
    const h = rect.height
    const prices = priceData.map(p => p.price)
    const minPrice = Math.min(...prices)
    const maxPrice = Math.max(...prices)
    const range = maxPrice - minPrice || 1

    ctx.clearRect(0, 0, w, h)

    // Determine color based on trend
    const isUp = prices[prices.length - 1] >= prices[0]
    const lineColor = isUp ? '#10b981' : '#f43f5e'
    const fillColor = isUp ? 'rgba(16, 185, 129, 0.08)' : 'rgba(244, 63, 94, 0.08)'

    // Draw baseline price line if available
    if (baselinePrice && baselinePrice >= minPrice && baselinePrice <= maxPrice) {
      const baselineY = h - ((baselinePrice - minPrice) / range) * (h - 8) - 4
      ctx.setLineDash([4, 4])
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(0, baselineY)
      ctx.lineTo(w, baselineY)
      ctx.stroke()
      ctx.setLineDash([])

      // Label
      ctx.font = '9px monospace'
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'
      ctx.fillText(`Baseline $${baselinePrice.toLocaleString()}`, 4, baselineY - 4)
    }

    // Draw filled area
    ctx.beginPath()
    ctx.moveTo(0, h)
    for (let i = 0; i < prices.length; i++) {
      const x = (i / (prices.length - 1)) * w
      const y = h - ((prices[i] - minPrice) / range) * (h - 8) - 4
      ctx.lineTo(x, y)
    }
    ctx.lineTo(w, h)
    ctx.closePath()
    ctx.fillStyle = fillColor
    ctx.fill()

    // Draw line
    ctx.beginPath()
    for (let i = 0; i < prices.length; i++) {
      const x = (i / (prices.length - 1)) * w
      const y = h - ((prices[i] - minPrice) / range) * (h - 8) - 4
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.strokeStyle = lineColor
    ctx.lineWidth = 2
    ctx.lineJoin = 'round'
    ctx.stroke()

    // Draw current price dot
    const lastX = w
    const lastY = h - ((prices[prices.length - 1] - minPrice) / range) * (h - 8) - 4
    ctx.beginPath()
    ctx.arc(lastX - 2, lastY, 3, 0, Math.PI * 2)
    ctx.fillStyle = lineColor
    ctx.fill()

    // Pulse effect
    ctx.beginPath()
    ctx.arc(lastX - 2, lastY, 6, 0, Math.PI * 2)
    ctx.fillStyle = isUp ? 'rgba(16, 185, 129, 0.2)' : 'rgba(244, 63, 94, 0.2)'
    ctx.fill()

  }, [priceData, baselinePrice])

  const isUp = priceChange24h !== null && priceChange24h >= 0

  // Calculate baseline comparison if available
  const baselineComparison = baselinePrice && currentPrice
    ? ((currentPrice - baselinePrice) / baselinePrice) * 100
    : null
  const isUpFromBaseline = baselineComparison !== null ? baselineComparison >= 0 : null

  return (
    <div className={cn(
      'rounded-2xl border border-surface-700/30 bg-surface-900/50 overflow-hidden',
      className
    )}>
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-surface-700/20">
        <div className="flex items-center gap-2">
          {CRYPTO_LOGOS[crypto.id] ? (
            <img src={CRYPTO_LOGOS[crypto.id]} alt={crypto.name} className="w-6 h-6 rounded-full" loading="lazy" />
          ) : (
            <div className="w-6 h-6 rounded-full bg-surface-800 flex items-center justify-center text-xs font-bold text-white">
              {crypto.symbol.charAt(0)}
            </div>
          )}
          <span className="text-sm font-semibold text-white">{crypto.name}</span>
          <span className="text-xs text-surface-400">{crypto.symbol}/USD</span>
          {feedId && (
            <span className="flex items-center gap-0.5 text-[10px] text-blue-400/60 bg-blue-500/5 px-1.5 py-0.5 rounded">
              <ChainlinkLogo className="w-2.5 h-2.5" />
              Feed
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {currentPrice !== null && (
            <span className="text-sm font-bold text-white tabular-nums">
              ${currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          )}
          {priceChange24h !== null && (
            <span className={cn(
              'flex items-center gap-0.5 text-xs font-semibold px-2 py-0.5 rounded-md',
              isUp
                ? 'text-emerald-400 bg-emerald-500/10'
                : 'text-rose-400 bg-rose-500/10'
            )}>
              {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {isUp ? '+' : ''}{priceChange24h.toFixed(2)}%
            </span>
          )}
          <button
            onClick={() => { setLoading(true); fetchPriceData() }}
            className="p-1 rounded-md hover:bg-surface-800/50 transition-colors"
            aria-label="Refresh price"
          >
            <RefreshCw className={cn('w-3.5 h-3.5 text-surface-400', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Baseline comparison bar (shows when market has a baseline price) */}
      {baselinePrice && currentPrice && baselineComparison !== null && (
        <div className="px-4 py-2 border-b border-surface-700/20 bg-surface-900/30">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="text-surface-400">Market Baseline:</span>
              <span className="text-surface-300 font-medium tabular-nums">
                ${baselinePrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              {baselineTimestamp && (
                <span className="text-surface-500 text-[10px]">
                  ({new Date(baselineTimestamp).toLocaleDateString()})
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-surface-400">Direction:</span>
              <span className={cn(
                'font-bold px-2 py-0.5 rounded text-xs',
                isUpFromBaseline
                  ? 'text-emerald-400 bg-emerald-500/10'
                  : 'text-rose-400 bg-rose-500/10'
              )}>
                {isUpFromBaseline ? '↑ UP' : '↓ DOWN'}
                {' '}({isUpFromBaseline ? '+' : ''}{baselineComparison.toFixed(2)}%)
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="px-4 py-3">
        {loading && priceData.length === 0 ? (
          <div className="h-[120px] flex items-center justify-center">
            <div className="flex items-center gap-2 text-xs text-surface-400">
              <RefreshCw className="w-4 h-4 animate-spin" />
              Loading chart…
            </div>
          </div>
        ) : error ? (
          <div className="h-[120px] flex items-center justify-center text-xs text-surface-500">
            {error}
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            className="w-full h-[120px]"
            style={{ width: '100%', height: '120px' }}
          />
        )}
      </div>

      {/* Footer with source attribution */}
      <div className="px-4 py-2 flex items-center justify-between border-t border-surface-700/20">
        <div className="flex items-center gap-2">
          <ChainlinkLogo className="w-3 h-3 text-blue-400/40" />
          <span className="text-[10px] text-surface-500">
            24h chart · {sourceLabel}
          </span>
          {feedId && (
            <a
              href={`https://data.chain.link/streams/${crypto.symbol.toLowerCase()}-usd-cexprice-streams`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-0.5 text-[10px] text-blue-400/40 hover:text-blue-400/70 transition-colors"
            >
              <ExternalLink className="w-2.5 h-2.5" />
              Feed
            </a>
          )}
        </div>
        <div className="flex items-center gap-1">
          <div className={cn('w-1.5 h-1.5 rounded-full animate-pulse', isUp ? 'bg-emerald-400' : 'bg-rose-400')} />
          <span className="text-[10px] text-surface-500">Live · 30s</span>
          {lastUpdated && (
            <span className="text-[10px] text-surface-600 tabular-nums">
              {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
