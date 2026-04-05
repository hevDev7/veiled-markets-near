import type { ParlayRecord, ParlaySlipLeg, ParlayTokenType } from './parlay-store'
import type { WalletBalance } from './wallet'
import { config, getTransactionUrl } from './config'
import { getMappingValue } from './aleo-client'
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
const DEFAULT_MIN_STAKE = 100000n
const DEFAULT_MAX_SINGLE_PAYOUT = 100_000_000_000n
const DEFAULT_MAX_COMBINED_MULTIPLIER = 10000n
const TOKEN_TYPE_TO_ID: Record<ParlayTokenType, number> = {
  ALEO: 1,
  USDCX: 2,
  USAD: 3,
}

const TOKEN_ID_TO_TYPE: Record<number, ParlayTokenType> = {
  1: 'ALEO',
  2: 'USDCX',
  3: 'USAD',
}

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
    recommendedSource: hasEnoughPrivate ? 'private' : null,
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
  const tokenTypeId = TOKEN_TYPE_TO_ID[params.tokenType]
  const programId = config.parlayProgramId

  const [
    pauseState,
    minStakeValue,
    maxCombinedMultiplierValue,
    poolValue,
    exposureValue,
    maxSinglePayoutValue,
  ] = await Promise.all([
    getMappingValue<bigint>('governance_values', '4field', programId),
    getMappingValue<bigint>('governance_values', '2field', programId),
    getMappingValue<bigint>('governance_values', '3field', programId),
    getMappingValue<bigint>('parlay_pool', `${tokenTypeId}u8`, programId),
    getMappingValue<bigint>('total_exposure', `${tokenTypeId}u8`, programId),
    getMappingValue<bigint>('max_single_payout', `${tokenTypeId}u8`, programId),
  ])

  const paused = (pauseState ?? 0n) > 0n
  const minStake = minStakeValue ?? DEFAULT_MIN_STAKE
  const maxCombinedMultiplier = maxCombinedMultiplierValue ?? DEFAULT_MAX_COMBINED_MULTIPLIER
  const pool = poolValue ?? 0n
  const exposure = exposureValue ?? 0n
  const maxPayout = maxSinglePayoutValue ?? DEFAULT_MAX_SINGLE_PAYOUT
  const availableBacking = pool > exposure ? pool - exposure : 0n
  const requiredBacking = params.grossPayout > params.stake ? params.grossPayout - params.stake : 0n

  let reason: string | null = null

  if (paused) {
    reason = 'Parlay placement is currently paused on-chain.'
  } else if (params.stake < minStake) {
    reason = `Stake is below the current on-chain minimum of ${formatParlayAmount(minStake)} ${params.tokenType}.`
  } else if (params.combinedOddsBps > maxCombinedMultiplier * ODDS_PRECISION) {
    reason = 'Combined parlay odds exceed the current on-chain multiplier limit.'
  } else if (params.grossPayout > maxPayout) {
    reason =
      `Potential payout of ${formatParlayAmount(params.grossPayout)} ${params.tokenType} `
      + `exceeds the current max single payout of ${formatParlayAmount(maxPayout)} ${params.tokenType}.`
  } else if (availableBacking + params.stake < params.grossPayout) {
    const shortfall = params.grossPayout - (availableBacking + params.stake)
    reason = availableBacking === 0n
      ? `Parlay pool has no available ${params.tokenType} backing. `
        + `This ticket needs ${formatParlayAmount(requiredBacking)} ${params.tokenType} of pool liquidity beyond your stake. `
        + 'Fund the parlay pool before placing parlays.'
      : `Parlay pool has insufficient ${params.tokenType} backing for this ticket. `
        + `Available backing: ${formatParlayAmount(availableBacking)} ${params.tokenType}. `
        + `Required backing beyond your stake: ${formatParlayAmount(requiredBacking)} ${params.tokenType}. `
        + `Shortfall: ${formatParlayAmount(shortfall)} ${params.tokenType}.`
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
  return trimmed.startsWith('at1') ? trimmed : null
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
