// ============================================================================
// SUPABASE CLIENT
// ============================================================================
// Handles persistent storage of bet data in Supabase PostgreSQL.
// Works alongside localStorage as write-through cache.
// If VITE_SUPABASE_URL is not set, all operations return empty/no-op.
// ============================================================================

import { createClient } from '@supabase/supabase-js'
import type { Bet, CommitmentRecord } from './store'

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

// ---- Bet Serialization (DB row ↔ App type) ----

function betToRow(bet: Bet, address: string) {
  return {
    id: bet.id,
    address,
    market_id: bet.marketId,
    amount: bet.amount.toString(),
    outcome: bet.outcome,
    placed_at: bet.placedAt,
    status: bet.status,
    type: bet.type || 'buy',
    market_question: bet.marketQuestion || null,
    locked_multiplier: bet.lockedMultiplier || null,
    shares_received: bet.sharesReceived?.toString() || null,
    shares_sold: bet.sharesSold?.toString() || null,
    tokens_received: bet.tokensReceived?.toString() || null,
    payout_amount: bet.payoutAmount?.toString() || null,
    winning_outcome: bet.winningOutcome || null,
    claimed: bet.claimed || false,
    token_type: bet.tokenType || 'ALEO',
    updated_at: new Date().toISOString(),
  }
}

function rowToBet(row: any): Bet {
  return {
    id: row.id,
    marketId: row.market_id,
    amount: BigInt(row.amount),
    outcome: row.outcome,
    placedAt: row.placed_at,
    status: row.status,
    type: row.type || 'buy',
    marketQuestion: row.market_question || undefined,
    lockedMultiplier: row.locked_multiplier || undefined,
    sharesReceived: row.shares_received ? BigInt(row.shares_received) : undefined,
    sharesSold: row.shares_sold ? BigInt(row.shares_sold) : undefined,
    tokensReceived: row.tokens_received ? BigInt(row.tokens_received) : undefined,
    payoutAmount: row.payout_amount ? BigInt(row.payout_amount) : undefined,
    winningOutcome: row.winning_outcome || undefined,
    claimed: row.claimed || false,
    tokenType: row.token_type || undefined,
  }
}

function commitmentToRow(record: CommitmentRecord, address: string) {
  return {
    id: record.id,
    address,
    market_id: record.marketId,
    amount: record.amount.toString(),
    outcome: record.outcome,
    commitment_hash: record.commitmentHash,
    user_nonce: record.userNonce,
    bettor: record.bettor,
    bet_amount_record_plaintext: record.betAmountRecordPlaintext,
    commit_tx_id: record.commitTxId,
    committed_at: record.committedAt,
    revealed: record.revealed || false,
    reveal_tx_id: record.revealTxId || null,
    updated_at: new Date().toISOString(),
  }
}

function rowToCommitment(row: any): CommitmentRecord {
  return {
    id: row.id,
    marketId: row.market_id,
    amount: BigInt(row.amount),
    outcome: row.outcome,
    commitmentHash: row.commitment_hash,
    userNonce: row.user_nonce,
    bettor: row.bettor,
    betAmountRecordPlaintext: row.bet_amount_record_plaintext,
    commitTxId: row.commit_tx_id,
    committedAt: row.committed_at,
    revealed: row.revealed,
    revealTxId: row.reveal_tx_id || undefined,
  }
}

// ---- CRUD Operations ----

export async function fetchBets(address: string): Promise<Bet[]> {
  if (!supabase) return []
  try {
    const { data, error } = await supabase
      .from('user_bets')
      .select('*')
      .eq('address', address)
    if (error) { console.warn('[Supabase] fetchBets error:', error.message); return [] }
    return (data || []).map(rowToBet)
  } catch (e) {
    console.warn('[Supabase] fetchBets exception:', e)
    return []
  }
}

export async function upsertBets(bets: Bet[], address: string): Promise<void> {
  if (!supabase || bets.length === 0) return
  try {
    const rows = bets.map(b => betToRow(b, address))
    const { error } = await supabase
      .from('user_bets')
      .upsert(rows, { onConflict: 'id,address' })
    if (error) console.warn('[Supabase] upsertBets error:', error.message)
  } catch (e) {
    console.warn('[Supabase] upsertBets exception:', e)
  }
}

export async function fetchPendingBets(address: string): Promise<Bet[]> {
  if (!supabase) return []
  try {
    const { data, error } = await supabase
      .from('pending_bets')
      .select('*')
      .eq('address', address)
    if (error) { console.warn('[Supabase] fetchPendingBets error:', error.message); return [] }
    return (data || []).map(rowToBet)
  } catch (e) {
    console.warn('[Supabase] fetchPendingBets exception:', e)
    return []
  }
}

export async function upsertPendingBets(bets: Bet[], address: string): Promise<void> {
  if (!supabase || bets.length === 0) return
  try {
    const rows = bets.map(b => betToRow(b, address))
    const { error } = await supabase
      .from('pending_bets')
      .upsert(rows, { onConflict: 'id,address' })
    if (error) console.warn('[Supabase] upsertPendingBets error:', error.message)
  } catch (e) {
    console.warn('[Supabase] upsertPendingBets exception:', e)
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
    if (error) console.warn('[Supabase] removePendingBet error:', error.message)
  } catch (e) {
    console.warn('[Supabase] removePendingBet exception:', e)
  }
}

export async function fetchCommitments(address: string): Promise<CommitmentRecord[]> {
  if (!supabase) return []
  try {
    const { data, error } = await supabase
      .from('commitment_records')
      .select('*')
      .eq('address', address)
    if (error) { console.warn('[Supabase] fetchCommitments error:', error.message); return [] }
    return (data || []).map(rowToCommitment)
  } catch (e) {
    console.warn('[Supabase] fetchCommitments exception:', e)
    return []
  }
}

export async function upsertCommitments(records: CommitmentRecord[], address: string): Promise<void> {
  if (!supabase || records.length === 0) return
  try {
    const rows = records.map(r => commitmentToRow(r, address))
    const { error } = await supabase
      .from('commitment_records')
      .upsert(rows, { onConflict: 'id,address' })
    if (error) console.warn('[Supabase] upsertCommitments error:', error.message)
  } catch (e) {
    console.warn('[Supabase] upsertCommitments exception:', e)
  }
}

// ---- Market Registry Operations ----

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
      console.warn('[Supabase] fetchMarketRegistry error:', error.message)
      return []
    }
    return (data || []) as MarketRegistryEntry[]
  } catch (e) {
    console.warn('[Supabase] fetchMarketRegistry exception:', e)
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
    if (error) console.warn('[Supabase] registerMarket error:', error.message)
    else console.log('[Supabase] Market registered:', entry.market_id.slice(0, 20) + '...')
  } catch (e) {
    console.warn('[Supabase] registerMarket exception:', e)
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
    if (error) console.warn('[Supabase] updateMarketRegistry error:', error.message)
  } catch (e) {
    console.warn('[Supabase] updateMarketRegistry exception:', e)
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

  console.log('[Supabase] Cleared tables:', deleted, 'Errors:', errors)
  return { deleted, errors }
}
