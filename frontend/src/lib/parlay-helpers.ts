import type { ParlayRecord, ParlaySlipLeg, ParlayTokenType } from './parlay-store'
import type { WalletBalance } from './wallet'
import { config, getTransactionUrl } from './config'
import { TOKEN, TOKEN_KEY, isChainTxId, tokenLabel } from './near/config'
import { getParlayPool, quoteParlay, type ParlayQuote } from './near/parlay'
import { devWarn } from './logger'
import { findRecords, type ScannedRecord } from './record-scanner'

export interface ParlayFundingRoute {
  privateBalance: bigint
  publicBalance: bigint
  hasEnoughPrivate: boolean
  hasEnoughPublic: boolean
  recommendedSource: 'private' | 'public' | null
}

export interface ParsedParlayTicketRecord {
  plaintext: string
  parlayId: string
  stake: bigint
  potentialPayout: bigint
  tokenType: ParlayTokenType
  ticketNonce: string
  transactionId?: string
  blockHeight?: number
}

export interface ParlayCreateReadiness {
  canCreate: boolean
  reason: string | null
  paused: boolean
  minStake: bigint
  maxCombinedMultiplier: bigint
  maxPayout: bigint
  pool: bigint
  exposure: bigint
  availableBacking: bigint
  requiredBacking: bigint
}

const ZERO_FIELD = '0field'
const ODDS_PRECISION = 10000n
const TOKEN_TYPE_TO_ID: Record<ParlayTokenType, number> = TOKEN

const TOKEN_ID_TO_TYPE: Record<number, ParlayTokenType> = TOKEN_KEY

function normalizeField(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ZERO_FIELD
  return trimmed.endsWith('field') ? trimmed : `${trimmed}field`
}

function normalizeRecordWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function extractFieldValue(plaintext: string, fieldName: string): string | null {
  const regex = new RegExp(`${fieldName}:\\s*([^,}]+)`)
  const match = plaintext.match(regex)
  return match ? match[1].trim() : null
}

function extractRecordPlaintext(record: unknown): string | null {
  if (typeof record === 'string') {
    return record.includes('parlay_id') && record.includes('ticket_nonce')
      ? normalizeRecordWhitespace(record)
      : null
  }

  if (!record || typeof record !== 'object') return null

  const candidates = [
    'plaintext',
    'recordPlaintext',
    'record_plaintext',
    'data',
    'content',
  ] as const

  for (const key of candidates) {
    const value = (record as Record<string, unknown>)[key]
    if (value == null) continue
    const text = String(value)
    if (text.includes('parlay_id') && text.includes('ticket_nonce')) {
      return normalizeRecordWhitespace(text)
    }
  }

  for (const value of Object.values(record as Record<string, unknown>)) {
    if (value == null) continue
    const text = String(value)
    if (text.includes('parlay_id') && text.includes('ticket_nonce')) {
      return normalizeRecordWhitespace(text)
    }
  }

  return null
}

async function collectWalletParlayTicketPlaintexts(): Promise<string[]> {
  if (typeof window === 'undefined') return []

  const programId = config.parlayProgramId
  const unique = new Set<string>()
  const browserWindow = window as unknown as Record<string, any>

  const addRecords = (records: unknown) => {
    const arr = Array.isArray(records)
      ? records
      : Array.isArray((records as { records?: unknown[] } | null)?.records)
        ? (records as { records: unknown[] }).records
        : []

    for (const record of arr) {
      const plaintext = extractRecordPlaintext(record)
      if (plaintext) unique.add(plaintext)
    }
  }

  const sharedPlaintexts = browserWindow.__aleoRequestRecordPlaintexts
  if (typeof sharedPlaintexts === 'function') {
    try {
      addRecords(await (sharedPlaintexts as (programId: string) => Promise<unknown>)(programId))
    } catch (error) {
      devWarn('[Parlay] Shared requestRecordPlaintexts failed:', error)
    }
  }

  const sharedRecords = browserWindow.__aleoRequestRecords
  if (typeof sharedRecords === 'function') {
    try {
      addRecords(await (sharedRecords as (programId: string, decrypt?: boolean) => Promise<unknown>)(programId, true))
    } catch (error) {
      devWarn('[Parlay] Shared requestRecords failed:', error)
    }
  }

  const walletObjects = [
    browserWindow.shield,
    browserWindow.shieldWallet,
    browserWindow.leo,
    browserWindow.leoWallet,
    browserWindow.foxwallet?.aleo,
    browserWindow.soter,
    browserWindow.soterWallet,
  ]

  for (const walletObject of walletObjects) {
    if (!walletObject || typeof walletObject !== 'object') continue
    const requestRecordPlaintexts = (walletObject as Record<string, unknown>).requestRecordPlaintexts
    if (typeof requestRecordPlaintexts === 'function') {
      try {
        addRecords(await (requestRecordPlaintexts as (programId: string) => Promise<unknown>)(programId))
      } catch {
        // Best-effort fallback only.
      }
    }

    const requestRecords = (walletObject as Record<string, unknown>).requestRecords
    if (typeof requestRecords === 'function') {
      try {
        addRecords(await (requestRecords as (programId: string, decrypt?: boolean) => Promise<unknown>)(programId, true))
      } catch {
        // Best-effort fallback only.
      }
    }
  }

  return Array.from(unique)
}

export function formatParlayAmount(amount: bigint, decimals: number = 2): string {
  return (Number(amount) / 1_000_000).toFixed(decimals)
}

export function getParlayPrivateBalance(balance: WalletBalance, tokenType: ParlayTokenType): bigint {
  switch (tokenType) {
    case 'USDCX':
      return balance.usdcxPrivate
    case 'USAD':
      return balance.usadPrivate
    default:
      return balance.private
  }
}

export function getParlayPublicBalance(balance: WalletBalance, tokenType: ParlayTokenType): bigint {
  switch (tokenType) {
    case 'USDCX':
      return balance.usdcxPublic
    case 'USAD':
      return balance.usadPublic
    default:
      return balance.public
  }
}

export function getParlayFundingRoute(
  balance: WalletBalance,
  tokenType: ParlayTokenType,
  stake: bigint,
): ParlayFundingRoute {
  const privateBalance = getParlayPrivateBalance(balance, tokenType)
  const publicBalance = getParlayPublicBalance(balance, tokenType)
  const hasEnoughPrivate = stake > 0n && privateBalance >= stake
  const hasEnoughPublic = stake > 0n && publicBalance >= stake

  return {
    privateBalance,
    publicBalance,
    hasEnoughPrivate,
    hasEnoughPublic,
    // NEAR: the stake is always paid privately; a short private balance is topped up from the wallet first.
    recommendedSource: stake > 0n && privateBalance + publicBalance >= stake ? 'private' : null,
  }
}

export function getParlayCreateFunctionName(tokenType: ParlayTokenType): string {
  if (tokenType === 'USDCX') return 'create_parlay_usdcx'
  if (tokenType === 'USAD') return 'create_parlay_usad'
  return 'create_parlay_aleo'
}

export function buildParlayLegInputs(legs: ParlaySlipLeg[]): string[] {
  const legInputs: string[] = []

  for (let i = 0; i < 4; i++) {
    const leg = legs[i]
    if (leg) {
      legInputs.push(
        `{ market_id: ${normalizeField(leg.marketId)}, market_program: ${leg.marketProgram}u8, outcome: ${leg.outcome}u8, odds_bps: ${leg.oddsBps}u128 }`,
      )
    } else {
      legInputs.push(
        `{ market_id: ${ZERO_FIELD}, market_program: 0u8, outcome: 0u8, odds_bps: 0u128 }`,
      )
    }
  }

  return legInputs
}

export function createParlayTicketNonce(): string {
  const nonceBytes = new Uint8Array(32)
  crypto.getRandomValues(nonceBytes)
  const nonceHex = Array.from(nonceBytes).map((value) => value.toString(16).padStart(2, '0')).join('')
  return `${BigInt(`0x${nonceHex}`)}field`
}

export async function getParlayCreateReadiness(params: {
  tokenType: ParlayTokenType
  stake: bigint
  combinedOddsBps: bigint
  grossPayout: bigint
}): Promise<ParlayCreateReadiness> {
  // NEAR: the contract's parlay pool view; the solvency rule is pool + stake >= 110% of open payouts.
  const tokenTypeId = TOKEN_TYPE_TO_ID[params.tokenType]
  const label = tokenLabel(params.tokenType)
  const p = await getParlayPool()
  const paused = p.paused
  const minStake = BigInt(p.min_stake)
  const maxCombinedOdds = BigInt(p.max_combined_odds_bps)
  const maxCombinedMultiplier = maxCombinedOdds / ODDS_PRECISION
  const maxPayout = BigInt(p.max_payout)
  const pool = BigInt(p.pool[tokenTypeId] ?? '0')
  const exposure = BigInt(p.exposure[tokenTypeId] ?? '0')
  const safety = BigInt(p.safety_bps)
  const needed = ((exposure + params.grossPayout) * safety) / ODDS_PRECISION
  const capacity = pool + params.stake
  const availableBacking = pool > exposure ? pool - exposure : 0n
  const requiredBacking = params.grossPayout > params.stake ? params.grossPayout - params.stake : 0n

  let reason: string | null = null
  if (paused) {
    reason = 'Parlay placement is currently paused on-chain.'
  } else if (params.stake < minStake) {
    reason = `Stake is below the on-chain minimum of ${formatParlayAmount(minStake)} ${label}.`
  } else if (params.combinedOddsBps > maxCombinedOdds) {
    reason = `Combined parlay odds exceed the ${maxCombinedMultiplier.toString()}× limit.`
  } else if (params.grossPayout > maxPayout) {
    reason = `Potential payout of ${formatParlayAmount(params.grossPayout)} ${label} exceeds the max single payout of ${formatParlayAmount(maxPayout)} ${label}.`
  } else if (capacity < needed) {
    reason = pool === 0n
      ? `The ${label} parlay pool is not funded yet, so it cannot back a payout. Try NEAR, or a smaller stake later.`
      : `The ${label} parlay pool cannot back this payout right now (it keeps 110% of open payouts). Try a smaller stake.`
  }

  return {
    canCreate: reason === null,
    reason,
    paused,
    minStake,
    maxCombinedMultiplier,
    maxPayout,
    pool,
    exposure,
    availableBacking,
    requiredBacking,
  }
}

export interface ParlayStakeLimits {
  /** The largest stake quote_parlay allows on these legs now: pool solvency, max payout and the thinnest leg's depth. */
  maxStake: bigint
  minStake: bigint
  /** The stake token's parlay pool. */
  pool: bigint
}

/** Floors an amount to whole cents (0.01), so a limit shown with two decimals is never above the real one. */
export function floorToCents(amount: bigint): bigint {
  return amount - (amount % 10_000n)
}

/** What the contract lets a stake on these legs be right now; throws with the contract's reason for legs it refuses. */
export async function getParlayStakeLimits(
  tokenType: ParlayTokenType,
  legs: { marketId: string; outcome: number }[],
): Promise<ParlayStakeLimits> {
  const token = TOKEN_TYPE_TO_ID[tokenType]
  const [quote, p] = await Promise.all([quoteParlay(token, 1_000_000n, legs), getParlayPool()])
  return { maxStake: BigInt(quote.max_stake), minStake: BigInt(p.min_stake), pool: BigInt(p.pool[token] ?? '0') }
}

/** Why this stake cannot go on these legs now, or null (`limits` from getParlayStakeLimits). */
export function parlayStakeLimitError(stake: bigint, limits: ParlayStakeLimits, tokenType: ParlayTokenType): string | null {
  const label = tokenLabel(tokenType)
  if (limits.pool === 0n) {
    return `The ${label} parlay pool is not funded yet, so it cannot back a payout.${tokenType === 'NEAR' ? '' : ' Stake NEAR instead.'}`
  }
  const most = `${formatParlayAmount(floorToCents(limits.maxStake))} ${label}`
  if (limits.maxStake < limits.minStake) {
    return `These legs can take at most ${most} right now, below the ${formatParlayAmount(limits.minStake)} ${label} minimum. `
      + 'Try fewer legs or markets with more liquidity.'
  }
  if (stake > limits.maxStake) return `This parlay can take at most ${most} right now. Lower the stake.`
  return null
}

/**
 * Checkout's checks before placing, which may first ask the wallet for a deposit. Returns the contract's quote to place
 * with; throws with the reason the contract would refuse this stake on these legs.
 */
export async function checkParlayPlacement(params: {
  tokenType: ParlayTokenType
  stake: bigint
  legs: { marketId: string; outcome: number }[]
}): Promise<ParlayQuote> {
  const quote = await quoteParlay(TOKEN_TYPE_TO_ID[params.tokenType], params.stake, params.legs)
  const readiness = await getParlayCreateReadiness({
    tokenType: params.tokenType,
    stake: params.stake,
    combinedOddsBps: BigInt(quote.combined_odds_bps),
    grossPayout: BigInt(quote.potential_payout),
  })
  if (!readiness.canCreate) {
    throw new Error(readiness.reason ?? 'Parlay is not ready for on-chain submission.')
  }
  // A ticket may pay only a share of its thinnest leg's pool; the quote's max_stake folds that in with the pool limits.
  const limitError = parlayStakeLimitError(
    params.stake,
    { maxStake: BigInt(quote.max_stake), minStake: readiness.minStake, pool: readiness.pool },
    params.tokenType,
  )
  if (limitError) throw new Error(limitError)
  return quote
}

export async function computeParlayOnChainId(params: {
  owner: string
  legs: ParlaySlipLeg[]
  numLegs: number
  stake: bigint
  tokenType: ParlayTokenType
  ticketNonce: string
}): Promise<string | null> {
  try {
    const sdk = await import('@provablehq/sdk')
    const hashField = sdk.Field as unknown as {
      hashBhp256?: (value: string) => { toString: () => string }
    }
    if (!hashField?.hashBhp256) return null

    const legs = Array.from({ length: 4 }, (_, index) => params.legs[index] ?? null)
    const formatLeg = (leg: ParlaySlipLeg | null) => `{ market_id: ${leg ? normalizeField(leg.marketId) : ZERO_FIELD}, market_program: ${leg?.marketProgram ?? 0}u8, outcome: ${leg?.outcome ?? 0}u8, odds_bps: ${leg?.oddsBps ?? 0n}u128 }`
    const struct = `{ bettor_owner: ${params.owner}, num_legs: ${params.numLegs}u8, `
      + `leg_1: ${formatLeg(legs[0])}, `
      + `leg_2: ${formatLeg(legs[1])}, `
      + `leg_3: ${formatLeg(legs[2])}, `
      + `leg_4: ${formatLeg(legs[3])}, `
      + `stake: ${params.stake}u128, token_type: ${TOKEN_TYPE_TO_ID[params.tokenType]}u8, ticket_nonce: ${normalizeField(params.ticketNonce)} }`

    const hash = hashField.hashBhp256(struct).toString()
    return hash.endsWith('field') ? hash : `${hash}field`
  } catch (error) {
    devWarn('[Parlay] Failed to compute on-chain parlay id:', error)
    return null
  }
}

export function parseParlayTicketRecord(
  plaintext: string,
  metadata?: Pick<ScannedRecord, 'transactionId' | 'blockHeight'>,
): ParsedParlayTicketRecord | null {
  const normalized = normalizeRecordWhitespace(plaintext)
  if (!normalized.includes('parlay_id') || !normalized.includes('ticket_nonce')) return null

  const parlayId = extractFieldValue(normalized, 'parlay_id')
  const stake = extractFieldValue(normalized, 'stake')
  const potentialPayout = extractFieldValue(normalized, 'potential_payout')
  const tokenTypeValue = extractFieldValue(normalized, 'token_type')
  const ticketNonce = extractFieldValue(normalized, 'ticket_nonce')

  if (!parlayId || !stake || !potentialPayout || !tokenTypeValue || !ticketNonce) {
    return null
  }

  const tokenType = TOKEN_ID_TO_TYPE[Number(tokenTypeValue.replace('u8', ''))]
  if (!tokenType) return null

  return {
    plaintext: normalized,
    parlayId: normalizeField(parlayId),
    stake: BigInt(stake.replace('u128', '')),
    potentialPayout: BigInt(potentialPayout.replace('u128', '')),
    tokenType,
    ticketNonce: normalizeField(ticketNonce),
    transactionId: metadata?.transactionId,
    blockHeight: metadata?.blockHeight,
  }
}

function matchesParlayRecord(ticket: ParsedParlayTicketRecord, parlay: ParlayRecord): boolean {
  if (ticket.stake !== parlay.stake) return false
  if (ticket.tokenType !== parlay.tokenType) return false
  if (ticket.potentialPayout !== parlay.potentialPayout) return false

  if (parlay.onChainParlayId && ticket.parlayId !== normalizeField(parlay.onChainParlayId)) {
    return false
  }

  if (parlay.ticketNonce && ticket.ticketNonce !== normalizeField(parlay.ticketNonce)) {
    return false
  }

  return true
}

export async function findParlayTicketRecord(parlay: ParlayRecord): Promise<ParsedParlayTicketRecord | null> {
  const scannedRecords = await findRecords(config.parlayProgramId, 'ParlayTicket')
  const scannedTickets = scannedRecords
    .map((record) => parseParlayTicketRecord(record.plaintext, record))
    .filter((record): record is ParsedParlayTicketRecord => record !== null)

  const scannedMatch = scannedTickets.find((record) => matchesParlayRecord(record, parlay))
  if (scannedMatch) return scannedMatch

  const walletPlaintexts = await collectWalletParlayTicketPlaintexts()
  for (const plaintext of walletPlaintexts) {
    const record = parseParlayTicketRecord(plaintext)
    if (record && matchesParlayRecord(record, parlay)) {
      return record
    }
  }

  return null
}

export function getShortParlayId(value?: string | null): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (trimmed.length <= 20) return trimmed
  return `${trimmed.slice(0, 10)}…${trimmed.slice(-6)}`
}

export function getParlayExplorerTransactionId(txId?: string | null): string | null {
  if (!txId) return null
  const trimmed = txId.trim()
  return isChainTxId(trimmed) ? trimmed : null
}

export function getParlayTransactionUrl(txId?: string): string | null {
  const explorerTxId = getParlayExplorerTransactionId(txId)
  return explorerTxId ? getTransactionUrl(explorerTxId) : null
}

export function describeParlayFundingSource(source?: 'private' | 'public'): string {
  if (source === 'private') return 'Private balance'
  if (source === 'public') return 'Public balance'
  return 'Private route required'
}
