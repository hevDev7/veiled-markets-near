// ============================================================================
// SUPABASE CLIENT
// ============================================================================
// Handles persistent storage of bet data in Supabase PostgreSQL.
// Works alongside localStorage as write-through cache.
// If VITE_SUPABASE_URL is not set, all operations return empty/no-op.
//
// PRIVACY: Sensitive bet fields (outcome, amount, shares) are encrypted
// with a wallet-derived AES-256-GCM key before storage. See crypto.ts.
// ============================================================================

import { createClient } from '@supabase/supabase-js'
import type { Bet, CommitmentRecord } from './store'
import { encryptField, decryptField, isEncrypted } from './crypto'
import { devLog, devWarn } from './logger'

// ---- Market Registry Types ----

export interface MarketRegistryEntry {
  market_id: string
  question_hash: string
  question_text: string
  description?: string
  resolution_source?: string
  category: number
  creator_address: string
  transaction_id?: string
  created_at: number  // epoch ms
}

// Initialize Supabase client (null if env vars not configured)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

export function isSupabaseAvailable(): boolean {
  return supabase !== null
}

// ---- Encryption helpers ----

/** Encrypt a field value if encryption key is available; otherwise pass through */
async function enc(value: string | null, key: CryptoKey | null): Promise<string | null> {
  if (!key || value === null) return value
  return encryptField(value, key)
}

/** Decrypt a field value if it's encrypted and key is available; otherwise pass through */
async function dec(value: string | null | undefined, key: CryptoKey | null): Promise<string | null> {
  if (!value) return value ?? null
  if (!key) {
    // No key — if the field is encrypted, we can't read it
    return isEncrypted(value) ? null : value
  }
  return decryptField(value, key)
}

// ---- Bet Serialization (DB row ↔ App type) ----

async function betToRow(bet: Bet, address: string, encryptionKey: CryptoKey | null) {
  return {
    id: bet.id,
    address,
    market_id: bet.marketId,
    // Sensitive fields — encrypted when key available
    amount: await enc(bet.amount.toString(), encryptionKey),
    outcome: await enc(bet.outcome, encryptionKey),
    locked_multiplier: await enc(bet.lockedMultiplier?.toString() || null, encryptionKey),
    shares_received: await enc(bet.sharesReceived?.toString() || null, encryptionKey),
    shares_sold: await enc(bet.sharesSold?.toString() || null, encryptionKey),
    tokens_received: await enc(bet.tokensReceived?.toString() || null, encryptionKey),
    payout_amount: await enc(bet.payoutAmount?.toString() || null, encryptionKey),
    winning_outcome: await enc(bet.winningOutcome || null, encryptionKey),
    // Non-sensitive fields — always plaintext
    placed_at: bet.placedAt,
    status: bet.status,
    type: bet.type || 'buy',
    market_question: bet.marketQuestion || null,
    claimed: bet.claimed || false,
    token_type: bet.tokenType || 'ALEO',
    updated_at: new Date().toISOString(),
  }
}

async function rowToBet(row: any, encryptionKey: CryptoKey | null): Promise<Bet | null> {
  const outcome = await dec(row.outcome, encryptionKey)
  const amount = await dec(row.amount, encryptionKey)

  // If we can't decrypt the core fields, skip this row
  if (outcome === null || amount === null) {
    devWarn('[Supabase] Cannot decrypt bet row (wrong key or no key):', row.id)
    return null
  }

  const lockedMultiplier = await dec(row.locked_multiplier, encryptionKey)
  const sharesReceived = await dec(row.shares_received, encryptionKey)
  const sharesSold = await dec(row.shares_sold, encryptionKey)
  const tokensReceived = await dec(row.tokens_received, encryptionKey)
  const payoutAmount = await dec(row.payout_amount, encryptionKey)
  const winningOutcome = await dec(row.winning_outcome, encryptionKey)

  return {
    id: row.id,
    marketId: row.market_id,
    amount: BigInt(amount),
    outcome: outcome as 'yes' | 'no',
    placedAt: row.placed_at,
    status: row.status,
    type: row.type || 'buy',
    marketQuestion: row.market_question || undefined,
    lockedMultiplier: lockedMultiplier ? Number(lockedMultiplier) : undefined,
    sharesReceived: sharesReceived ? BigInt(sharesReceived) : undefined,
    sharesSold: sharesSold ? BigInt(sharesSold) : undefined,
    tokensReceived: tokensReceived ? BigInt(tokensReceived) : undefined,
    payoutAmount: payoutAmount ? BigInt(payoutAmount) : undefined,
    winningOutcome: (winningOutcome as 'yes' | 'no') || undefined,
    claimed: row.claimed || false,
    tokenType: row.token_type || undefined,
  }
}

async function commitmentToRow(record: CommitmentRecord, address: string, encryptionKey: CryptoKey | null) {
  return {
    id: record.id,
    address,
    market_id: record.marketId,
    // Sensitive fields — encrypted
    amount: await enc(record.amount.toString(), encryptionKey),
    outcome: await enc(record.outcome, encryptionKey),
    commitment_hash: await enc(record.commitmentHash, encryptionKey),
    user_nonce: await enc(record.userNonce, encryptionKey),
    // Non-sensitive fields
    bettor: record.bettor,
    // SECURITY: Never persist decrypted credits record plaintext
    bet_amount_record_plaintext: '[REDACTED]',
    commit_tx_id: record.commitTxId,
    committed_at: record.committedAt,
    revealed: record.revealed || false,
    reveal_tx_id: record.revealTxId || null,
    updated_at: new Date().toISOString(),
  }
}

async function rowToCommitment(row: any, encryptionKey: CryptoKey | null): Promise<CommitmentRecord | null> {
  const outcome = await dec(row.outcome, encryptionKey)
  const amount = await dec(row.amount, encryptionKey)

  if (outcome === null || amount === null) {
    devWarn('[Supabase] Cannot decrypt commitment row (wrong key or no key):', row.id)
    return null
  }

  const commitmentHash = await dec(row.commitment_hash, encryptionKey)
  const userNonce = await dec(row.user_nonce, encryptionKey)

  return {
    id: row.id,
    marketId: row.market_id,
    amount: BigInt(amount),
    outcome: outcome as 'yes' | 'no',
    commitmentHash: commitmentHash || row.commitment_hash,
    userNonce: userNonce || row.user_nonce,
    bettor: row.bettor,
    betAmountRecordPlaintext: row.bet_amount_record_plaintext,
    commitTxId: row.commit_tx_id,
    committedAt: row.committed_at,
    revealed: row.revealed,
    revealTxId: row.reveal_tx_id || undefined,
  }
}

// ---- CRUD Operations ----

export async function fetchBets(address: string, encryptionKey: CryptoKey | null = null): Promise<Bet[]> {
  if (!supabase) return []
  try {
    const { data, error } = await supabase
      .from('user_bets')
      .select('*')
      .eq('address', address)
    if (error) { devWarn('[Supabase] fetchBets error:', error.message); return [] }
    const results = await Promise.all((data || []).map(row => rowToBet(row, encryptionKey)))
    return results.filter((bet): bet is Bet => bet !== null)
  } catch (e) {
    devWarn('[Supabase] fetchBets exception:', e)
    return []
  }
}

export async function upsertBets(bets: Bet[], address: string, encryptionKey: CryptoKey | null = null): Promise<void> {
  if (!supabase || bets.length === 0) return
  try {
    const rows = await Promise.all(bets.map(b => betToRow(b, address, encryptionKey)))
    const { error } = await supabase
      .from('user_bets')
      .upsert(rows, { onConflict: 'id,address' })
    if (error) devWarn('[Supabase] upsertBets error:', error.message)
  } catch (e) {
    devWarn('[Supabase] upsertBets exception:', e)
  }
}

export async function fetchPendingBets(address: string, encryptionKey: CryptoKey | null = null): Promise<Bet[]> {
  if (!supabase) return []
  try {
    const { data, error } = await supabase
      .from('pending_bets')
      .select('*')
      .eq('address', address)
    if (error) { devWarn('[Supabase] fetchPendingBets error:', error.message); return [] }
    const results = await Promise.all((data || []).map(row => rowToBet(row, encryptionKey)))
    return results.filter((bet): bet is Bet => bet !== null)
  } catch (e) {
    devWarn('[Supabase] fetchPendingBets exception:', e)
    return []
  }
}

export async function upsertPendingBets(bets: Bet[], address: string, encryptionKey: CryptoKey | null = null): Promise<void> {
  if (!supabase || bets.length === 0) return
  try {
    const rows = await Promise.all(bets.map(b => betToRow(b, address, encryptionKey)))
    const { error } = await supabase
      .from('pending_bets')
      .upsert(rows, { onConflict: 'id,address' })
    if (error) devWarn('[Supabase] upsertPendingBets error:', error.message)
  } catch (e) {
    devWarn('[Supabase] upsertPendingBets exception:', e)
  }
}

export async function removePendingBet(betId: string, address: string): Promise<void> {
  if (!supabase) return
  try {
    const { error } = await supabase
      .from('pending_bets')
      .delete()
      .eq('id', betId)
      .eq('address', address)
    if (error) devWarn('[Supabase] removePendingBet error:', error.message)
  } catch (e) {
    devWarn('[Supabase] removePendingBet exception:', e)
  }
}

export async function removeUserBet(betId: string, address: string): Promise<void> {
  if (!supabase) return
  try {
    const { error } = await supabase
      .from('user_bets')
      .delete()
      .eq('id', betId)
      .eq('address', address)
    if (error) devWarn('[Supabase] removeUserBet error:', error.message)
  } catch (e) {
    devWarn('[Supabase] removeUserBet exception:', e)
  }
}

export async function fetchCommitments(address: string, encryptionKey: CryptoKey | null = null): Promise<CommitmentRecord[]> {
  if (!supabase) return []
  try {
    const { data, error } = await supabase
      .from('commitment_records')
      .select('*')
      .eq('address', address)
    if (error) { devWarn('[Supabase] fetchCommitments error:', error.message); return [] }
    const results = await Promise.all((data || []).map(row => rowToCommitment(row, encryptionKey)))
    return results.filter((r): r is CommitmentRecord => r !== null)
  } catch (e) {
    devWarn('[Supabase] fetchCommitments exception:', e)
    return []
  }
}

export async function upsertCommitments(records: CommitmentRecord[], address: string, encryptionKey: CryptoKey | null = null): Promise<void> {
  if (!supabase || records.length === 0) return
  try {
    const rows = await Promise.all(records.map(r => commitmentToRow(r, address, encryptionKey)))
    const { error } = await supabase
      .from('commitment_records')
      .upsert(rows, { onConflict: 'id,address' })
    if (error) devWarn('[Supabase] upsertCommitments error:', error.message)
  } catch (e) {
    devWarn('[Supabase] upsertCommitments exception:', e)
  }
}

// ---- Market Registry Operations ----
// Note: Market registry is PUBLIC data — no encryption needed.

/**
 * Fetch all registered markets from Supabase.
 * Returns market IDs, question texts, and transaction IDs for all known markets.
 */
export async function fetchMarketRegistry(): Promise<MarketRegistryEntry[]> {
  if (!supabase) return []
  try {
    const { data, error } = await supabase
      .from('market_registry')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) {
      devWarn('[Supabase] fetchMarketRegistry error:', error.message)
      return []
    }
    return (data || []) as MarketRegistryEntry[]
  } catch (e) {
    devWarn('[Supabase] fetchMarketRegistry exception:', e)
    return []
  }
}

/**
 * Register a newly created market in Supabase so all users can discover it.
 */
export async function registerMarketInRegistry(entry: MarketRegistryEntry): Promise<void> {
  if (!supabase) return
  try {
    const { error } = await supabase
      .from('market_registry')
      .upsert([entry], { onConflict: 'market_id' })
    if (error) devWarn('[Supabase] registerMarket error:', error.message)
    else devLog('[Supabase] Market registered:', entry.market_id.slice(0, 20) + '...')
  } catch (e) {
    devWarn('[Supabase] registerMarket exception:', e)
  }
}

/**
 * Update a market registry entry (e.g., when market_id is resolved from transaction).
 */
export async function updateMarketRegistry(
  marketId: string,
  updates: Partial<MarketRegistryEntry>
): Promise<void> {
  if (!supabase) return
  try {
    const { error } = await supabase
      .from('market_registry')
      .update(updates)
      .eq('market_id', marketId)
    if (error) devWarn('[Supabase] updateMarketRegistry error:', error.message)
  } catch (e) {
    devWarn('[Supabase] updateMarketRegistry exception:', e)
  }
}

/**
 * Clear all data from Supabase tables (used when switching program versions).
 * Deletes: market_registry, user_bets, pending_bets, commitment_records
 */
export async function clearAllSupabaseData(): Promise<{ deleted: string[]; errors: string[] }> {
  const deleted: string[] = []
  const errors: string[] = []
  if (!supabase) {
    errors.push('Supabase not available')
    return { deleted, errors }
  }

  const tables = ['market_registry', 'user_bets', 'pending_bets', 'commitment_records']
  for (const table of tables) {
    try {
      // Delete all rows (neq '' matches all non-null primary keys)
      const { error } = await supabase.from(table).delete().neq('id', '')
      if (error) {
        // Try alternate approach for tables with different PK
        const { error: err2 } = await supabase.from(table).delete().neq('market_id', '')
        if (err2) {
          errors.push(`${table}: ${error.message}`)
        } else {
          deleted.push(table)
        }
      } else {
        deleted.push(table)
      }
    } catch (e) {
      errors.push(`${table}: ${e}`)
    }
  }

  devLog('[Supabase] Cleared tables:', deleted, 'Errors:', errors)
  return { deleted, errors }
}
