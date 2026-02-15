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
export type TokenType = 'ALEO' | 'USDCX'

export function getTokenSymbol(tokenType?: TokenType | number): string {
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
    4: 'Entertainment',
    5: 'Science & Tech',
    6: 'Economics',
    99: 'Other',
  }
  return categories[category] || 'Other'
}

/**
 * Get category emoji
 */
export function getCategoryEmoji(category: number): string {
  const emojis: Record<number, string> = {
    1: '🗳️',
    2: '⚽',
    3: '₿',
    4: '🎬',
    5: '🔬',
    6: '📈',
    99: '🎯',
  }
  return emojis[category] || '🎯'
}

/**
 * Delay utility for animations
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

