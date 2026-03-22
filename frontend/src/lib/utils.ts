import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merge Tailwind CSS classes with clsx
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format large numbers with abbreviations
 */
export function formatNumber(num: number): string {
  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(1) + 'M'
  }
  if (num >= 1_000) {
    return (num / 1_000).toFixed(1) + 'K'
  }
  return num.toFixed(0)
}

/**
 * Format credits (microcredits to credits)
 */
export function formatCredits(microcredits: bigint, decimals: number = 2): string {
  const credits = Number(microcredits) / 1_000_000
  return credits.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

/**
 * Token type helpers
 */
export type TokenType = 'ALEO' | 'USDCX' | 'USAD'

export function getTokenSymbol(tokenType?: TokenType | number): string {
  if (tokenType === 3 || tokenType === 'USAD') return 'USAD'
  if (tokenType === 2 || tokenType === 'USDCX') return 'USDCX'
  return 'ALEO'
}

/**
 * Format token amount (both ALEO and USDCX use 6 decimals)
 */
export function formatTokenAmount(microAmount: bigint, _tokenType?: TokenType, decimals: number = 2): string {
  return formatCredits(microAmount, decimals)
}

/**
 * Format percentage
 */
export function formatPercentage(value: number, decimals: number = 1): string {
  return `${value.toFixed(decimals)}%`
}

/**
 * Format time remaining
 */
export function formatTimeRemaining(deadline: bigint): string {
  // Convert block height to approximate time (assuming ~15 sec blocks)
  const now = Date.now()
  const targetTime = Number(deadline) * 1000 // Simplified for demo
  const diff = targetTime - now

  if (diff <= 0) return 'Ended'

  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

/**
 * Shorten address for display
 */
export function shortenAddress(address: string, chars: number = 6): string {
  if (!address) return ''
  if (address.length <= chars * 2 + 3) return address
  return `${address.slice(0, chars)}...${address.slice(-chars)}`
}

/**
 * Get category name from ID
 */
export function getCategoryName(category: number): string {
  const categories: Record<number, string> = {
    1: 'Politics',
    2: 'Sports',
    3: 'Crypto',
    4: 'Culture',
    5: 'AI & Tech',
    6: 'Macro',
    7: 'Science',
    8: 'Climate',
    99: 'Other',
  }
  return categories[category] || 'Other'
}

/**
 * Get category emoji
 */
export function getCategoryEmoji(category: number): string {
  const emojis: Record<number, string> = {
    1: '🏛',
    2: '⚽',
    3: '₿',
    4: '🎭',
    5: '🤖',
    6: '📈',
    7: '🔬',
    8: '🌍',
    99: '🔮',
  }
  return emojis[category] || '🔮'
}

/**
 * Get CSS class for category color strip on cards
 */
export function getCategoryStrip(category: number): string {
  const strips: Record<number, string> = {
    1: 'category-strip-politics',
    2: 'category-strip-sports',
    3: 'category-strip-crypto',
    4: 'category-strip-entertainment',
    5: 'category-strip-tech',
    6: 'category-strip-economics',
    7: 'category-strip-science',
    8: 'category-strip-science',
    99: 'category-strip-other',
  }
  return strips[category] || 'category-strip-other'
}

/**
 * Get category accent color for dynamic styling
 */
export function getCategoryColor(category: number): { text: string; bg: string; border: string; glow: string } {
  const colors: Record<number, { text: string; bg: string; border: string; glow: string }> = {
    1: { text: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20', glow: 'rgba(99, 102, 241, 0.08)' },
    2: { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', glow: 'rgba(16, 185, 129, 0.08)' },
    3: { text: 'text-brand-400', bg: 'bg-brand-400/10', border: 'border-brand-400/20', glow: 'rgba(201, 168, 76, 0.08)' },
    4: { text: 'text-pink-400', bg: 'bg-pink-500/10', border: 'border-pink-500/20', glow: 'rgba(236, 72, 153, 0.08)' },
    5: { text: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20', glow: 'rgba(139, 92, 246, 0.08)' },
    6: { text: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20', glow: 'rgba(59, 130, 246, 0.08)' },
    7: { text: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20', glow: 'rgba(6, 182, 212, 0.08)' },
    8: { text: 'text-teal-400', bg: 'bg-teal-500/10', border: 'border-teal-500/20', glow: 'rgba(20, 184, 166, 0.08)' },
  }
  return colors[category] || { text: 'text-surface-400', bg: 'bg-surface-500/10', border: 'border-surface-500/20', glow: 'rgba(107, 114, 128, 0.08)' }
}

/**
 * Validate and sanitize a URL — only allows https: (and http: for localhost dev).
 * Returns the validated URL string, or null if invalid/unsafe.
 */
export function sanitizeUrl(url: string | undefined | null): string | null {
  if (!url || typeof url !== 'string') return null
  const trimmed = url.trim()
  if (!trimmed) return null
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.href
    }
    return null // Block javascript:, data:, etc.
  } catch {
    return null
  }
}

/**
 * Extract hostname from URL safely
 */
export function safeHostname(url: string): string | null {
  try {
    return new URL(url).hostname.replace('www.', '')
  } catch {
    return null
  }
}

/**
 * Validate Aleo address format (aleo1... followed by 58 alphanumeric chars)
 */
export function isValidAleoAddress(addr: string | undefined | null): boolean {
  if (!addr) return false
  return /^aleo1[a-z0-9]{58}$/.test(addr)
}

/**
 * Delay utility for animations
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

