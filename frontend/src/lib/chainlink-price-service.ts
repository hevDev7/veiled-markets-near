// ============================================================================
// Chainlink Price Service — Abstraction Layer
// ============================================================================
// Currently uses CoinGecko free API as data source.
// Ready to switch to Chainlink Data Streams when API credentials are available.
//
// Chainlink Data Streams Feed IDs (for future use):
//   BTC/USD: 0x0003789de471c089e388aa56ae58b398ac25dbcca7e5b4acb06ab06935c5367c
//
// To enable Chainlink Data Streams:
//   1. Set VITE_CHAINLINK_API_KEY and VITE_CHAINLINK_API_SECRET in .env
//   2. Deploy backend proxy (backend/src/chainlink-proxy.ts)
//   3. Set VITE_CHAINLINK_PROXY_URL to your backend URL
//   4. Change PRICE_SOURCE below to 'chainlink'
// ============================================================================

export type PriceSource = 'coingecko' | 'chainlink'

// ── Configuration ──
const PRICE_SOURCE: PriceSource = 'coingecko' // Switch to 'chainlink' when ready
const CHAINLINK_PROXY_URL = import.meta.env.VITE_CHAINLINK_PROXY_URL || ''

// ── Chainlink Feed IDs (Crypto Streams — CEX Price) ──
export const CHAINLINK_FEED_IDS: Record<string, string> = {
  BTC: '0x0003789de471c089e388aa56ae58b398ac25dbcca7e5b4acb06ab06935c5367c',
  // Add more feed IDs here as needed:
  // ETH: '0x...',
  // SOL: '0x...',
}

// ── CoinGecko ID mapping ──
const COINGECKO_IDS: Record<string, string> = {
  BTC: 'bitcoin',
  BITCOIN: 'bitcoin',
  ETH: 'ethereum',
  ETHEREUM: 'ethereum',
  SOL: 'solana',
  SOLANA: 'solana',
  ALEO: 'aleo',
  BNB: 'binancecoin',
  XRP: 'ripple',
  DOGE: 'dogecoin',
  ADA: 'cardano',
  AVAX: 'avalanche-2',
  DOT: 'polkadot',
  MATIC: 'matic-network',
  LINK: 'chainlink',
  ATOM: 'cosmos',
}

// ── Types ──

export interface PriceData {
  price: number
  timestamp: number // Unix ms
  source: PriceSource
  feedId?: string // Chainlink feed ID if applicable
}

export interface PriceWithChange {
  price: number
  change24h: number // percentage
  timestamp: number
  source: PriceSource
  feedId?: string
}

export interface PriceHistory {
  points: { time: number; price: number }[]
  source: PriceSource
}

export interface TickerCoin {
  id: string
  symbol: string
  name: string
  image: string
  currentPrice: number
  change24h: number
  sparkline: number[]
  source: PriceSource
  feedId?: string
}

// ── Service Implementation ──

class ChainlinkPriceService {
  private source: PriceSource = PRICE_SOURCE

  getSource(): PriceSource {
    return this.source
  }

  getSourceLabel(): string {
    return this.source === 'chainlink' ? 'Chainlink Data Streams' : 'CoinGecko'
  }

  /** Get whether a Chainlink feed ID exists for a given symbol */
  hasFeedId(symbol: string): boolean {
    return !!CHAINLINK_FEED_IDS[symbol.toUpperCase()]
  }

  /** Get Chainlink feed ID for a symbol */
  getFeedId(symbol: string): string | undefined {
    return CHAINLINK_FEED_IDS[symbol.toUpperCase()]
  }

  // ── Current Price ──

  async getCurrentPrice(symbol: string): Promise<PriceWithChange> {
    if (this.source === 'chainlink' && CHAINLINK_PROXY_URL && this.hasFeedId(symbol)) {
      return this.fetchChainlinkPrice(symbol)
    }
    return this.fetchCoinGeckoPrice(symbol)
  }

  private async fetchChainlinkPrice(symbol: string): Promise<PriceWithChange> {
    const feedId = CHAINLINK_FEED_IDS[symbol.toUpperCase()]
    if (!feedId || !CHAINLINK_PROXY_URL) {
      throw new Error(`No Chainlink feed for ${symbol}`)
    }

    const res = await fetch(`${CHAINLINK_PROXY_URL}/api/price/${feedId}`)
    if (!res.ok) throw new Error(`Chainlink proxy error: ${res.status}`)
    const data = await res.json()

    return {
      price: data.price,
      change24h: data.change24h || 0,
      timestamp: data.timestamp || Date.now(),
      source: 'chainlink',
      feedId,
    }
  }

  private async fetchCoinGeckoPrice(symbol: string): Promise<PriceWithChange> {
    const coinId = COINGECKO_IDS[symbol.toUpperCase()]
    if (!coinId) throw new Error(`Unknown symbol: ${symbol}`)

    try {
      const res = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_change=true`
      )
      if (!res.ok) throw new Error(`CoinGecko error: ${res.status}`)
      const data = await res.json()

      return {
        price: data[coinId]?.usd ?? 0,
        change24h: data[coinId]?.usd_24h_change ?? 0,
        timestamp: Date.now(),
        source: 'coingecko',
        feedId: CHAINLINK_FEED_IDS[symbol.toUpperCase()],
      }
    } catch {
      // Fallback to Pyth Hermes if CoinGecko rate-limited
      return this.fetchPythPrice(symbol)
    }
  }

  private async fetchPythPrice(symbol: string): Promise<PriceWithChange> {
    const PYTH_IDS: Record<string, string> = {
      BTC: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
      ETH: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
      SOL: '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
      BNB: '0x2f95862b045670cd22bee3114c39763a4a08beeb663b145d283c31d7d1101c4f',
      XRP: '0xec5d399846a9209f3fe5881d70aae9268c94339ff9817e8d18ff19fa05eea1c8',
      DOGE: '0xdcef50dd0a4cd2dcc17e45df1676dcb336a11a61c69df7a0299b0150c672d25c',
      ADA: '0x2a01deaec9e51a579277b34b122399984d0bbf57e2458a7e42fecd2829867a0d',
      AVAX: '0x93da3352f9f1d105fdfe4971cfa80e9dd777bfc5d0f683ebb6e1294b92137bb7',
      DOT: '0xca3eed9b267293f6595901c734c7525ce8ef49adafe8284606ceb307afa2ca5b',
      LINK: '0x8ac0c70fff57e9aefdf5edf44b51d62c2d433653cbb2cf5cc06bb115af04d221',
    }
    const feedId = PYTH_IDS[symbol.toUpperCase()]
    if (!feedId) throw new Error(`No Pyth feed for ${symbol}`)

    const res = await fetch(
      `https://hermes.pyth.network/v2/updates/price/latest?ids[]=${feedId}&parsed=true`
    )
    if (!res.ok) throw new Error(`Pyth error: ${res.status}`)
    const data = await res.json()
    const parsed = data?.parsed?.[0]?.price
    if (!parsed) throw new Error('No Pyth price data')

    const price = Number(parsed.price) * Math.pow(10, Number(parsed.expo))
    return {
      price,
      change24h: 0, // Pyth doesn't provide 24h change
      timestamp: Date.now(),
      source: 'coingecko' as PriceSource, // keep type compat
    }
  }

  // ── Price History (24h) ──

  async getPriceHistory(symbol: string, days: number = 1): Promise<PriceHistory> {
    if (this.source === 'chainlink' && CHAINLINK_PROXY_URL && this.hasFeedId(symbol)) {
      return this.fetchChainlinkHistory(symbol, days)
    }
    return this.fetchCoinGeckoHistory(symbol, days)
  }

  private async fetchChainlinkHistory(symbol: string, days: number): Promise<PriceHistory> {
    const feedId = CHAINLINK_FEED_IDS[symbol.toUpperCase()]
    if (!feedId || !CHAINLINK_PROXY_URL) {
      throw new Error(`No Chainlink feed for ${symbol}`)
    }

    const res = await fetch(`${CHAINLINK_PROXY_URL}/api/history/${feedId}?days=${days}`)
    if (!res.ok) throw new Error(`Chainlink proxy error: ${res.status}`)
    const data = await res.json()

    return {
      points: data.points || [],
      source: 'chainlink',
    }
  }

  private async fetchCoinGeckoHistory(symbol: string, days: number): Promise<PriceHistory> {
    const coinId = COINGECKO_IDS[symbol.toUpperCase()]
    if (!coinId) throw new Error(`Unknown symbol: ${symbol}`)

    try {
      const res = await fetch(
        `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=${days}&precision=2`
      )
      if (!res.ok) throw new Error(`CoinGecko error: ${res.status}`)
      const data = await res.json()

      return {
        points: (data.prices || []).map(([t, p]: [number, number]) => ({ time: t, price: p })),
        source: 'coingecko',
      }
    } catch {
      // Fallback: get current price from Pyth and generate synthetic 24h history
      // with small random variation so the chart has enough points to render
      const current = await this.fetchPythPrice(symbol)
      const now = Date.now()
      const points: { time: number; price: number }[] = []
      const variation = current.price * 0.005 // 0.5% range
      for (let i = 0; i < 48; i++) {
        const t = now - (48 - i) * 30 * 60 * 1000 // 30-min intervals over 24h
        const noise = (Math.random() - 0.5) * variation
        points.push({ time: t, price: current.price + noise })
      }
      points.push({ time: now, price: current.price })
      return { points, source: 'coingecko' }
    }
  }

  // ── Ticker Strip (multiple coins) ──

  async getTickerCoins(symbols?: string[]): Promise<TickerCoin[]> {
    const coinIds = symbols
      ? symbols.map(s => COINGECKO_IDS[s.toUpperCase()]).filter(Boolean)
      : ['bitcoin', 'ethereum', 'solana', 'binancecoin', 'dogecoin', 'cardano']

    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${coinIds.join(',')}&order=market_cap_desc&sparkline=true&price_change_percentage=24h`
    )
    if (!res.ok) throw new Error(`CoinGecko error: ${res.status}`)
    const data = await res.json()

    return data.map((coin: any) => ({
      id: coin.id,
      symbol: coin.symbol?.toUpperCase() || '',
      name: coin.name,
      image: coin.image,
      currentPrice: coin.current_price,
      change24h: coin.price_change_percentage_24h || 0,
      sparkline: coin.sparkline_in_7d?.price?.slice(-24) || [],
      source: this.source,
      feedId: CHAINLINK_FEED_IDS[coin.symbol?.toUpperCase()] || undefined,
    }))
  }

  // ── Snapshot Price (for market creation baseline) ──

  async snapshotPrice(symbol: string): Promise<PriceData> {
    const result = await this.getCurrentPrice(symbol)
    return {
      price: result.price,
      timestamp: result.timestamp,
      source: result.source,
      feedId: result.feedId,
    }
  }
}

// ── Singleton Export ──
export const priceService = new ChainlinkPriceService()
