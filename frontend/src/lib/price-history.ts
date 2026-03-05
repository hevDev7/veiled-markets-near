/**
 * Price history snapshot collector.
 * Stores probability snapshots per market in localStorage
 * so we can render Polymarket-style line charts.
 */

export interface PriceSnapshot {
  t: number    // timestamp (ms)
  p: number[]  // prices per outcome (0-1 range)
}

const MAX_SNAPSHOTS = 500
const MIN_INTERVAL_MS = 60_000 // 1 minute minimum between snapshots

function storageKey(marketId: string): string {
  // Use first 20 chars of market ID to keep key short
  const short = marketId.replace('field', '').slice(0, 20)
  return `veiled_price_history_${short}`
}

export function recordPriceSnapshot(marketId: string, prices: number[]): void {
  try {
    const key = storageKey(marketId)
    const raw = localStorage.getItem(key)
    const history: PriceSnapshot[] = raw ? JSON.parse(raw) : []

    // Dedup: skip if last snapshot is too recent
    const now = Date.now()
    if (history.length > 0 && now - history[history.length - 1].t < MIN_INTERVAL_MS) {
      return
    }

    // Round prices to 4 decimals to save space
    const rounded = prices.map(p => Math.round(p * 10000) / 10000)
    history.push({ t: now, p: rounded })

    // Trim oldest if over limit
    if (history.length > MAX_SNAPSHOTS) {
      history.splice(0, history.length - MAX_SNAPSHOTS)
    }

    localStorage.setItem(key, JSON.stringify(history))
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

export function getPriceHistory(marketId: string): PriceSnapshot[] {
  try {
    const key = storageKey(marketId)
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}
