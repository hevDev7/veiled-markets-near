// ============================================================================
// VEILED MARKETS — Parlay Store (Zustand)
// ============================================================================
// Manages parlay slip draft state, active parlays, and parlay history.
// ============================================================================

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { devLog, devWarn } from './logger'
import type { Market } from './store'
import {
  isSupabaseAvailable, fetchParlays as sbFetchParlays,
  upsertParlays as sbUpsertParlays,
} from './supabase'

// ============================================================================
// Types
// ============================================================================

export interface ParlaySlipLeg {
  marketId: string
  marketQuestion: string
  marketProgram: number         // 1=ALEO, 2=USDCX, 3=USAD (which market contract)
  outcome: number               // 1-4
  outcomeLabel: string
  oddsBps: bigint               // Odds in basis points (25000 = 2.5x)
  displayOdds: number           // Human-readable (2.5)
  marketTokenType: string       // Market's native token (for display only)
}

export type ParlayTokenType = 'ALEO' | 'USDCX' | 'USAD'

export interface ParlayRecord {
  id: string                     // local primary key (on-chain id when available, tx fallback otherwise)
  legs: ParlaySlipLeg[]
  numLegs: number
  stake: bigint
  potentialPayout: bigint
  tokenType: ParlayTokenType
  ownerAddress?: string
  status: 'active' | 'pending_dispute' | 'won' | 'lost' | 'cancelled'
  createdAt: number              // timestamp ms
  resolvedAt?: number
  txId?: string
  claimed?: boolean
  onChainParlayId?: string
  ticketNonce?: string
  fundingSource?: 'private' | 'public'
}

// ============================================================================
// Constants
// ============================================================================

const ODDS_PRECISION = 10000n
const FEE_BPS = 200n
const FEE_DENOM = 10000n
const MIN_LEGS = 2
const MAX_LEGS = 4
const MIN_STAKE = 100000n // 0.1 token
const MAX_ODDS_BPS = 1000000n // 100x
const MAX_COMBINED_PAYOUT_MULTIPLIER = 10000n // 1000x

// ============================================================================
// Helpers
// ============================================================================

/** Convert AMM price (0-1) to odds bps. Price 0.4 → 2.5x → 25000 */
export function priceToOddsBps(price: number): bigint {
  if (price <= 0 || price >= 1) return ODDS_PRECISION
  const odds = 1 / price
  return BigInt(Math.round(odds * Number(ODDS_PRECISION)))
}

/** Odds bps to display. 25000 → 2.5 */
export function oddsBpsToDisplay(oddsBps: bigint): number {
  return Number(oddsBps) / Number(ODDS_PRECISION)
}

/** Convert odds bps to implied probability percentage. 25000 → 40 (%) */
export function oddsBpsToImpliedProbability(oddsBps: bigint): number {
  const displayOdds = oddsBpsToDisplay(oddsBps)
  if (!Number.isFinite(displayOdds) || displayOdds <= 0) return 0
  return 100 / displayOdds
}

/** Calculate combined odds from legs */
export function calculateCombinedOdds(legs: ParlaySlipLeg[]): bigint {
  if (legs.length < 2) return 0n
  let combined = legs[0].oddsBps
  for (let i = 1; i < legs.length; i++) {
    combined = (combined * legs[i].oddsBps) / ODDS_PRECISION
  }
  return combined
}

/** Calculate payout after fees */
export function calculateParlayPayout(stake: bigint, combinedOddsBps: bigint): {
  gross: bigint
  fee: bigint
  net: bigint
} {
  const gross = (stake * combinedOddsBps) / ODDS_PRECISION
  const fee = (gross * FEE_BPS) / FEE_DENOM
  return { gross, fee, net: gross - fee }
}

/** Get market program ID from token type */
export function getMarketProgramId(tokenType?: string): number {
  if (tokenType === 'USDCX') return 2
  if (tokenType === 'USAD') return 3
  return 1
}

/** Sync parlays to Supabase (fire-and-forget) */
function syncParlaysToSupabase(parlays: ParlayRecord[]) {
  if (!isSupabaseAvailable() || parlays.length === 0) return
  // Lazy import to avoid circular deps
  import('./store').then(({ useWalletStore }) => {
    const { address, encryptionKey } = useWalletStore.getState().wallet
    if (!address) return
    sbUpsertParlays(parlays, address, encryptionKey).catch(err =>
      devWarn('[Parlay] Supabase sync failed:', err),
    )
  }).catch(() => {})
}

// ============================================================================
// Store
// ============================================================================

interface ParlayState {
  // Slip (draft)
  slipLegs: ParlaySlipLeg[]
  slipStake: bigint
  slipTokenType: ParlayTokenType
  slipOpen: boolean

  // Active & historical parlays
  parlays: ParlayRecord[]

  // Actions — slip
  addLeg: (market: Market, outcome: number) => void
  removeLeg: (marketId: string) => void
  clearSlip: () => void
  setSlipStake: (stake: bigint) => void
  setSlipTokenType: (tokenType: ParlayTokenType) => void
  toggleSlip: () => void
  openSlip: () => void
  closeSlip: () => void
  hasLeg: (marketId: string) => boolean
  getLegForMarket: (marketId: string) => ParlaySlipLeg | undefined

  // Actions — parlays
  addParlay: (parlay: ParlayRecord) => void
  patchParlay: (parlayId: string, patch: Partial<ParlayRecord>) => void
  updateParlayStatus: (parlayId: string, status: ParlayRecord['status']) => void
  markParlayClaimed: (parlayId: string) => void
  getParlaysByStatus: (status: ParlayRecord['status']) => ParlayRecord[]
  syncParlaysFromSupabase: (address: string, encryptionKey?: CryptoKey | null) => Promise<void>

  // Computed
  combinedOdds: () => bigint
  combinedOddsDisplay: () => number
  payoutQuote: () => { gross: bigint; fee: bigint; net: bigint }
  isValid: () => boolean
  validationError: () => string | null
}

// Custom serializer for BigInt in persist middleware
const bigintReplacer = (_key: string, value: unknown) =>
  typeof value === 'bigint' ? `__bigint__${value.toString()}` : value

const bigintReviver = (_key: string, value: unknown) =>
  typeof value === 'string' && value.startsWith('__bigint__')
    ? BigInt(value.slice(10))
    : value

export const useParlayStore = create<ParlayState>()(
  persist(
    (set, get) => ({
      // State
      slipLegs: [],
      slipStake: 0n,
      slipTokenType: 'ALEO' as ParlayTokenType,
      slipOpen: false,
      parlays: [],

      // Slip actions
      addLeg: (market: Market, outcome: number) => {
        const state = get()
        const existingIndex = state.slipLegs.findIndex(l => l.marketId === market.id)
        if (state.slipLegs.length >= MAX_LEGS && existingIndex === -1) return

        const prices = market.outcomePrices ?? []
        const price = prices[outcome - 1] ?? 0.5
        const oddsBps = priceToOddsBps(price)

        const labels = market.outcomeLabels ?? ['Yes', 'No', 'Option C', 'Option D']
        const label = labels[outcome - 1] ?? `Outcome ${outcome}`

        const leg: ParlaySlipLeg = {
          marketId: market.id,
          marketQuestion: market.question,
          marketProgram: getMarketProgramId(market.tokenType),
          outcome,
          outcomeLabel: label,
          oddsBps,
          displayOdds: oddsBpsToDisplay(oddsBps),
          marketTokenType: market.tokenType ?? 'ALEO',
        }

        const nextLegs = existingIndex >= 0
          ? state.slipLegs.map((existingLeg, index) => index === existingIndex ? leg : existingLeg)
          : [...state.slipLegs, leg]

        devLog(
          `[Parlay] ${existingIndex >= 0 ? 'Updated' : 'Added'} leg:`,
          market.id,
          label,
          `${oddsBpsToDisplay(oddsBps)}x`,
        )
        set({ slipLegs: nextLegs, slipOpen: true })
      },

      removeLeg: (marketId: string) => {
        set(s => ({ slipLegs: s.slipLegs.filter(l => l.marketId !== marketId) }))
      },

      clearSlip: () => {
        set({ slipLegs: [], slipStake: 0n })
      },

      setSlipStake: (stake: bigint) => {
        set({ slipStake: stake })
      },

      setSlipTokenType: (tokenType: ParlayTokenType) => {
        set({ slipTokenType: tokenType })
      },

      toggleSlip: () => set(s => ({ slipOpen: !s.slipOpen })),
      openSlip: () => set({ slipOpen: true }),
      closeSlip: () => set({ slipOpen: false }),

      hasLeg: (marketId: string) => {
        return get().slipLegs.some(l => l.marketId === marketId)
      },

      getLegForMarket: (marketId: string) => {
        return get().slipLegs.find(l => l.marketId === marketId)
      },

      // Parlay records
      addParlay: (parlay: ParlayRecord) => {
        set(s => ({ parlays: [parlay, ...s.parlays], slipLegs: [], slipStake: 0n }))
        syncParlaysToSupabase([parlay])
      },

      patchParlay: (parlayId: string, patch: Partial<ParlayRecord>) => {
        set(s => ({
          parlays: s.parlays.map(p =>
            p.id === parlayId ? { ...p, ...patch } : p,
          ),
        }))
        const updated = get().parlays.find(p => p.id === parlayId)
        if (updated) syncParlaysToSupabase([updated])
      },

      updateParlayStatus: (parlayId: string, status: ParlayRecord['status']) => {
        set(s => ({
          parlays: s.parlays.map(p =>
            p.id === parlayId ? { ...p, status, resolvedAt: Date.now() } : p,
          ),
        }))
        const updated = get().parlays.find(p => p.id === parlayId)
        if (updated) syncParlaysToSupabase([updated])
      },

      markParlayClaimed: (parlayId: string) => {
        set(s => ({
          parlays: s.parlays.map(p =>
            p.id === parlayId ? { ...p, claimed: true } : p,
          ),
        }))
        const updated = get().parlays.find(p => p.id === parlayId)
        if (updated) syncParlaysToSupabase([updated])
      },

      getParlaysByStatus: (status: ParlayRecord['status']) => {
        return get().parlays.filter(p => p.status === status)
      },

      syncParlaysFromSupabase: async (address: string, encryptionKey?: CryptoKey | null) => {
        if (!isSupabaseAvailable()) return
        try {
          const remoteParlays = await sbFetchParlays(address, encryptionKey ?? null)
          if (remoteParlays.length === 0) return

          const local = get().parlays
          const localIds = new Set(local.map(p => p.id))
          const merged = [
            ...local,
            ...remoteParlays.filter((p: ParlayRecord) => !localIds.has(p.id)),
          ]
          if (merged.length > local.length) {
            devLog(`[Parlay] Merged ${merged.length - local.length} parlays from Supabase`)
            set({ parlays: merged })
          }
        } catch (e) {
          devWarn('[Parlay] Supabase sync failed:', e)
        }
      },

      // Computed
      combinedOdds: () => calculateCombinedOdds(get().slipLegs),
      combinedOddsDisplay: () => oddsBpsToDisplay(calculateCombinedOdds(get().slipLegs)),

      payoutQuote: () => {
        const { slipStake, slipLegs } = get()
        const combined = calculateCombinedOdds(slipLegs)
        return calculateParlayPayout(slipStake, combined)
      },

      isValid: () => {
        const { slipLegs, slipStake } = get()
        return slipLegs.length >= MIN_LEGS && slipLegs.length <= MAX_LEGS && slipStake >= MIN_STAKE
      },

      validationError: () => {
        const { slipLegs, slipStake } = get()
        if (slipLegs.length < MIN_LEGS) return `Add at least ${MIN_LEGS} legs`
        if (slipLegs.length > MAX_LEGS) return `Maximum ${MAX_LEGS} legs`
        const invalidLeg = slipLegs.find(leg => leg.oddsBps <= ODDS_PRECISION || leg.oddsBps > MAX_ODDS_BPS)
        if (invalidLeg) {
          return invalidLeg.oddsBps > MAX_ODDS_BPS
            ? `${invalidLeg.outcomeLabel} exceeds the 100x per-leg protocol limit`
            : `${invalidLeg.outcomeLabel} no longer has valid locked odds`
        }
        const combinedOdds = calculateCombinedOdds(slipLegs)
        if (combinedOdds > MAX_COMBINED_PAYOUT_MULTIPLIER * ODDS_PRECISION) {
          return 'Combined parlay odds exceed the 1000x protocol limit'
        }
        if (slipStake <= 0n) return 'Enter stake amount'
        if (slipStake < MIN_STAKE) return `Minimum stake: 0.1 token`
        return null
      },
    }),
    {
      name: 'veiled-parlay-store',
      partialize: (state) => ({
        slipLegs: state.slipLegs,
        slipStake: state.slipStake,
        slipTokenType: state.slipTokenType,
        parlays: state.parlays,
      }),
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name)
          if (!str) return null
          return JSON.parse(str, bigintReviver)
        },
        setItem: (name, value) => {
          localStorage.setItem(name, JSON.stringify(value, bigintReplacer))
        },
        removeItem: (name) => localStorage.removeItem(name),
      },
    },
  ),
)
