import { useSyncExternalStore } from 'react'

// Single global interval shared by all countdown consumers
let now = Date.now()
const listeners = new Set<() => void>()

let intervalId: ReturnType<typeof setInterval> | null = null

function startTicker() {
  if (intervalId) return
  intervalId = setInterval(() => {
    now = Date.now()
    listeners.forEach(l => l())
  }, 1000)
}

function stopTicker() {
  if (intervalId && listeners.size === 0) {
    clearInterval(intervalId)
    intervalId = null
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  startTicker()
  return () => {
    listeners.delete(listener)
    stopTicker()
  }
}

function getSnapshot() {
  return now
}

/** Returns current timestamp, updated every second via a single global interval. */
export function useGlobalTicker(): number {
  return useSyncExternalStore(subscribe, getSnapshot)
}

/** Countdown hook using the global ticker — no per-component interval. */
export function useLiveCountdown(deadlineTimestamp?: number, fallbackTimeRemaining?: string): string {
  const now = useGlobalTicker()

  if (!deadlineTimestamp || deadlineTimestamp <= 0) {
    return fallbackTimeRemaining || 'Ended'
  }

  const diffMs = deadlineTimestamp - now
  if (diffMs <= 0) return 'Ended'

  const totalSeconds = Math.floor(diffMs / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (days > 0) return `${days}d ${hours}h ${minutes}m`
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}
