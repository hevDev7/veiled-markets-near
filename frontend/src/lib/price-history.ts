/**
 * Price history snapshot collector.
 * Stores probability snapshots in Supabase (primary) + localStorage (fallback)
 * so we can render Polymarket-style line charts consistent across all devices.
 */

import { upsertPriceSnapshot, fetchPriceSnapshots, isSupabaseAvailable } from './supabase'

export interface PriceSnapshot {
  t: number    // timestamp (ms)
  p: number[]  // prices per outcome (0-1 range)
}

const MAX_SNAPSHOTS = 500
const MIN_INTERVAL_MS = 60_000 // 1 minute minimum between snapshots

// In-memory dedup tracker (avoids extra DB/localStorage reads)
const lastRecordedTime = new Map<string, number>()

function storageKey(marketId: string): string {
  const short = marketId.replace('field', '').slice(0, 20)
  return `veiled_price_history_${short}`
}

/**
 * Record a price snapshot. Writes to both Supabase and localStorage.
 * Dedup: skips if last snapshot was < 60s ago.
 */
export function recordPriceSnapshot(marketId: string, prices: number[]): void {
  const now = Date.now()

  // In-memory dedup check (fast, no I/O)
  const lastTime = lastRecordedTime.get(marketId) ?? 0
  if (now - lastTime < MIN_INTERVAL_MS) return

  // Round prices to 4 decimals
  const rounded = prices.map(p => Math.round(p * 10000) / 10000)

  // Update dedup tracker
  lastRecordedTime.set(marketId, now)

  // Write to localStorage (sync, immediate)
  try {
    const key = storageKey(marketId)
    const raw = localStorage.getItem(key)
    const history: PriceSnapshot[] = raw ? JSON.parse(raw) : []
    history.push({ t: now, p: rounded })
    if (history.length > MAX_SNAPSHOTS) {
      history.splice(0, history.length - MAX_SNAPSHOTS)
    }
    localStorage.setItem(key, JSON.stringify(history))
  } catch {
    // localStorage full or unavailable — silently ignore
  }

  // Write to Supabase (async, fire-and-forget)
  if (isSupabaseAvailable()) {
    upsertPriceSnapshot(marketId, now, rounded).catch(() => {
      // Supabase write failed — localStorage still has the data
    })
  }
}

/**
 * Get price history from localStorage (sync, for instant render).
 */
export function getPriceHistory(marketId: string): PriceSnapshot[] {
  try {
    const key = storageKey(marketId)
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

/**
 * Fetch price history from Supabase (async, for cross-device consistency).
 * Falls back to localStorage if Supabase is unavailable.
 */
export async function fetchPriceHistoryAsync(
  marketId: string,
  since?: number
): Promise<PriceSnapshot[]> {
  if (!isSupabaseAvailable()) {
    return getPriceHistory(marketId)
  }

  try {
    const rows = await fetchPriceSnapshots(marketId, since)
    // Return Supabase data (even if empty — don't fallback to stale localStorage)
    return rows.map(r => ({ t: r.timestamp, p: r.prices }))
  } catch {
    return getPriceHistory(marketId)
  }
}
