// ============================================================================
// Turbo Client — Helpers for veiled_turbo_v8.aleo frontend integration
// ============================================================================
// Builds inputs for the 5 user-callable transitions:
//   1. buy_up_down(market_id, side, amount_in, expected_shares, share_nonce)
//   2. claim_winnings(market_id, share, declared_payout)
//   3. claim_refund(market_id, share, expected_amount)
//   4. emergency_cancel(market_id)  -- permissionless
//
// Operator-only transitions (create_turbo_market, resolve_turbo_market) are
// NOT exposed here — they live in backend/src/pyth-oracle.ts.
//
// AMM math mirrors the contract's binary FPMM (see contracts-turbo-v1/src/main.leo
// buy_up_down_fin):
//   protocol_fee  = amount_in * 50 / 10000        (0.5%)
//   to_pool       = amount_in - protocol_fee
//   r_i_new       = (r_i * r_other) / (r_other + to_pool)
//   shares_out    = (r_i + to_pool) - r_i_new
// ============================================================================

export const TURBO_PROGRAM_ID =
  (import.meta as any).env?.VITE_TURBO_PROGRAM_ID || 'veiled_turbo_v8.aleo'

export const TURBO_OUTCOME = {
  UP: 1,
  DOWN: 2,
} as const

export type TurboSide = keyof typeof TURBO_OUTCOME

const PROTOCOL_FEE_BPS = 50n
const FEE_DENOMINATOR = 10000n

export interface TurboPoolView {
  reserveUp: bigint
  reserveDown: bigint
  totalUpShares: bigint
  totalDownShares: bigint
}

export interface QuoteResult {
  amountIn: bigint
  protocolFee: bigint
  amountToPool: bigint
  expectedShares: bigint
  newReserveUp: bigint
  newReserveDown: bigint
}

/**
 * Quote how many shares the user gets for a given bet amount.
 *
 * Pure off-chain calculation that exactly mirrors `buy_up_down_fin` in
 * contracts-turbo-v1/src/main.leo. Use this to display the expected payout
 * before the user signs the tx.
 */
export function quoteBuyUpDown(
  pool: TurboPoolView,
  side: TurboSide,
  amountInMicro: bigint,
): QuoteResult {
  const protocolFee = (amountInMicro * PROTOCOL_FEE_BPS) / FEE_DENOMINATOR
  const amountToPool = amountInMicro - protocolFee

  const rI = side === 'UP' ? pool.reserveUp : pool.reserveDown
  const rOther = side === 'UP' ? pool.reserveDown : pool.reserveUp

  const rINew = (rI * rOther) / (rOther + amountToPool)
  const shares = rI + amountToPool - rINew

  const newReserveUp = side === 'UP' ? rINew : pool.reserveUp + amountToPool
  const newReserveDown = side === 'DOWN' ? rINew : pool.reserveDown + amountToPool

  return {
    amountIn: amountInMicro,
    protocolFee,
    amountToPool,
    expectedShares: shares,
    newReserveUp,
    newReserveDown,
  }
}

/**
 * Compute payout for a winning share given the latest pool state.
 * Mirrors `claim_winnings_fin`:
 *   payout = quantity * market_credits / total_winning_shares
 */
export function quotePayout(
  marketCredits: bigint,
  totalWinningShares: bigint,
  shareQuantity: bigint,
): bigint {
  if (totalWinningShares === 0n) return 0n
  return (shareQuantity * marketCredits) / totalWinningShares
}

// ----------------------------------------------------------------------------
// Inputs for useAleoTransaction.executeTransaction
// ----------------------------------------------------------------------------

function randomNonceField(): string {
  // 8 bytes hex → BigInt → "...field"
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  let hex = ''
  for (const b of bytes) hex += b.toString(16).padStart(2, '0')
  return `${BigInt('0x' + hex)}field`
}

export interface BuildBuyResult {
  programId: string
  functionName: string
  inputs: string[]
  shareNonce: string
  expectedShares: bigint
}

/**
 * Build the input array for `buy_up_down`. The returned `shareNonce` MUST
 * be persisted alongside the user's resulting share record for later claim,
 * since the contract returns a private record and the nonce is its anchor.
 */
/**
 * Build the input array for `buy_up_down`. v5 uses private credits:
 *   buy_up_down(market_id, side, amount_in, expected_shares, share_nonce, credits_in)
 *
 * `creditsRecord` is the plaintext of a credits.aleo::credits record
 * fetched via `fetchCreditsRecord()`.
 */
export function buildBuyUpDownInputs(
  marketId: string,           // already includes "field" suffix
  side: TurboSide,
  amountInMicro: bigint,
  expectedShares: bigint,
  creditsRecord: string,
): BuildBuyResult {
  const shareNonce = randomNonceField()
  return {
    programId: TURBO_PROGRAM_ID,
    functionName: 'buy_up_down',
    inputs: [
      marketId,
      `${TURBO_OUTCOME[side]}u8`,
      `${amountInMicro}u128`,
      `${expectedShares}u128`,
      shareNonce,
      creditsRecord,
    ],
    shareNonce,
    expectedShares,
  }
}

/**
 * Build inputs for `claim_winnings`. The TurboShare record is passed as a
 * Leo record literal (use the wallet adapter's record selection flow to
 * obtain it — same pattern as v37 OutcomeShare claim).
 */
export function buildClaimWinningsInputs(
  marketId: string,
  shareRecord: string,
  declaredPayoutMicro: bigint,
): { programId: string; functionName: string; inputs: string[] } {
  return {
    programId: TURBO_PROGRAM_ID,
    functionName: 'claim_winnings',
    inputs: [
      marketId,
      shareRecord,
      `${declaredPayoutMicro}u128`,
    ],
  }
}

export function buildClaimRefundInputs(
  marketId: string,
  shareRecord: string,
  expectedAmountMicro: bigint,
): { programId: string; functionName: string; inputs: string[] } {
  return {
    programId: TURBO_PROGRAM_ID,
    functionName: 'claim_refund',
    inputs: [
      marketId,
      shareRecord,
      `${expectedAmountMicro}u128`,
    ],
  }
}

export function buildEmergencyCancelInputs(
  marketId: string,
): { programId: string; functionName: string; inputs: string[] } {
  return {
    programId: TURBO_PROGRAM_ID,
    functionName: 'emergency_cancel',
    inputs: [marketId],
  }
}

export function buildWithdrawLiquidityInputs(
  marketId: string,
  amountMicro: bigint,
): { programId: string; functionName: string; inputs: string[] } {
  return {
    programId: TURBO_PROGRAM_ID,
    functionName: 'withdraw_liquidity',
    inputs: [marketId, `${amountMicro}u128`],
  }
}

// ----------------------------------------------------------------------------
// Read pool state from Aleo RPC
// ----------------------------------------------------------------------------

const ALEO_RPC =
  (import.meta as any).env?.VITE_ALEO_RPC_URL ||
  'https://api.explorer.provable.com/v1/testnet'

// ----------------------------------------------------------------------------
// TurboShare record fetching + parsing
// ----------------------------------------------------------------------------

export interface ParsedTurboShare {
  plaintext: string         // raw record literal — pass as-is to executeTransaction
  marketId: string          // "...field"
  side: TurboSide
  quantity: bigint
  owner: string | null
}

/**
 * Parse a TurboShare record plaintext.
 * Accepts the raw `{ owner: ..., market_id: ..., side: ..., quantity: ..., share_nonce: ... }`
 * literal that wallets return.
 */
export function parseTurboShare(text: string): ParsedTurboShare | null {
  // Handle .private/.public suffixes from wallet plaintext format
  const marketMatch = text.match(/market_id:\s*([0-9]+field)/)
  const sideMatch = text.match(/side:\s*(\d+)u8/)
  const qtyMatch = text.match(/quantity:\s*(\d+)u128/)
  const ownerMatch = text.match(/owner:\s*(aleo1[a-z0-9]+)/)
  if (!marketMatch || !sideMatch || !qtyMatch) return null
  const sideNum = Number(sideMatch[1])
  const side: TurboSide | null =
    sideNum === TURBO_OUTCOME.UP ? 'UP' : sideNum === TURBO_OUTCOME.DOWN ? 'DOWN' : null
  if (!side) return null
  return {
    plaintext: text,
    marketId: marketMatch[1],
    side,
    quantity: BigInt(qtyMatch[1]),
    owner: ownerMatch ? ownerMatch[1] : null,
  }
}

/**
 * Best-effort fetch of TurboShare records from the connected wallet.
 * Mirrors the multi-strategy pattern used by `fetchOutcomeShareRecords`
 * for v37 markets but tightened to TurboShare's record shape.
 */
export async function fetchTurboShareRecords(
  marketId?: string,
): Promise<ParsedTurboShare[]> {
  const collected: ParsedTurboShare[] = []
  const seen = new Set<string>()

  const collect = (records: any[]) => {
    for (const r of records) {
      if (!r) continue
      if (r.spent === true || r.is_spent === true || r.status === 'spent') continue

      const candidates: string[] = []
      if (typeof r === 'string') candidates.push(r)
      else if (typeof r === 'object') {
        for (const key of ['plaintext', 'data', 'content']) {
          if (r[key] != null) candidates.push(String(r[key]))
        }
        for (const key of Object.keys(r)) {
          const v = r[key]
          if (typeof v === 'string' && v.includes('side:') && v.includes('quantity:')) {
            candidates.push(v)
          }
        }
      }

      for (const text of candidates) {
        if (!text.includes('side:') || !text.includes('quantity:')) continue
        const parsed = parseTurboShare(text)
        if (!parsed) continue
        if (parsed.quantity === 0n) continue
        if (marketId && parsed.marketId !== marketId) continue
        if (seen.has(parsed.plaintext)) continue
        seen.add(parsed.plaintext)
        collected.push(parsed)
      }
    }
  }

  // Strategy 1: adapter requestRecords
  const adapterRecords = (window as any).__aleoRequestRecords
  if (typeof adapterRecords === 'function') {
    try {
      const r = await adapterRecords(TURBO_PROGRAM_ID, true)
      collect(Array.isArray(r) ? r : (r?.records || []))
    } catch {}
  }

  // Strategy 2: native wallets
  if (collected.length === 0) {
    const wallets = [
      (window as any).shield,
      (window as any).shieldWallet,
      (window as any).leoWallet,
      (window as any).leo,
      (window as any).puzzle,
    ].filter(Boolean)
    for (const w of wallets) {
      if (typeof w.requestRecords !== 'function') continue
      try {
        const r = await w.requestRecords(TURBO_PROGRAM_ID)
        collect(r?.records || (Array.isArray(r) ? r : []))
      } catch {}
      if (collected.length > 0) break
    }
  }

  return collected
}

/**
 * Read TurboPool state from the on-chain `turbo_pools` mapping.
 * Returns null if the market doesn't exist yet.
 */
export async function fetchTurboPool(marketId: string): Promise<TurboPoolView | null> {
  const url = `${ALEO_RPC}/program/${TURBO_PROGRAM_ID}/mapping/turbo_pools/${marketId}`
  const res = await fetch(url)
  if (!res.ok) return null
  const text = (await res.text()).replace(/^"|"$/g, '')
  if (!text || text === 'null') return null

  // Parse Leo struct literal — supports both v6 (reserve_up/down) and v7 (total_up/down_amount)
  const upMatch = text.match(/(?:reserve_up|total_up_amount):\s*(\d+)u128/)
  const dnMatch = text.match(/(?:reserve_down|total_down_amount):\s*(\d+)u128/)
  const totUpMatch = text.match(/total_up_shares:\s*(\d+)u128/)
  const totDnMatch = text.match(/total_down_shares:\s*(\d+)u128/)
  if (!upMatch || !dnMatch) return null
  return {
    reserveUp: BigInt(upMatch[1]),
    reserveDown: BigInt(dnMatch[1]),
    totalUpShares: totUpMatch ? BigInt(totUpMatch[1]) : 0n,
    totalDownShares: totDnMatch ? BigInt(totDnMatch[1]) : 0n,
  }
}

export interface TurboMarketView {
  status: 'active' | 'resolved' | 'cancelled' | 'unknown'
  baselinePrice: bigint
  closingPrice: bigint
  winningOutcome: TurboSide | null
}

export async function fetchTurboMarket(marketId: string): Promise<TurboMarketView | null> {
  const url = `${ALEO_RPC}/program/${TURBO_PROGRAM_ID}/mapping/turbo_markets/${marketId}`
  const res = await fetch(url)
  if (!res.ok) return null
  const text = (await res.text()).replace(/^"|"$/g, '')
  if (!text || text === 'null') return null

  const statusMatch = text.match(/status:\s*(\d+)u8/)
  const baseMatch = text.match(/baseline_price:\s*(\d+)u128/)
  const closeMatch = text.match(/closing_price:\s*(\d+)u128/)
  const winnerMatch = text.match(/winning_outcome:\s*(\d+)u8/)

  let status: TurboMarketView['status'] = 'unknown'
  switch (Number(statusMatch?.[1] || 0)) {
    case 1: status = 'active'; break
    case 2: status = 'resolved'; break
    case 3: status = 'cancelled'; break
  }
  const winnerNum = Number(winnerMatch?.[1] || 0)
  const winningOutcome: TurboSide | null =
    winnerNum === TURBO_OUTCOME.UP ? 'UP' : winnerNum === TURBO_OUTCOME.DOWN ? 'DOWN' : null

  return {
    status,
    baselinePrice: BigInt(baseMatch?.[1] || '0'),
    closingPrice: BigInt(closeMatch?.[1] || '0'),
    winningOutcome,
  }
}

/**
 * Fetch the total payout pool for a resolved market.
 * v7 uses `market_payouts` mapping (set at resolve time).
 * v6 used `market_credits` — this function checks both for backward compat.
 */
export async function fetchMarketCredits(marketId: string): Promise<bigint | null> {
  // v7: market_payouts (set at resolve, = total_up_amount + total_down_amount)
  const payoutsUrl = `${ALEO_RPC}/program/${TURBO_PROGRAM_ID}/mapping/market_payouts/${marketId}`
  try {
    const res = await fetch(payoutsUrl)
    if (res.ok) {
      const text = (await res.text()).replace(/^"|"$/g, '')
      if (text && text !== 'null') {
        const m = text.match(/(\d+)u128/)
        if (m) return BigInt(m[1])
      }
    }
  } catch {}

  // Fallback: v6 market_credits mapping
  const creditsUrl = `${ALEO_RPC}/program/${TURBO_PROGRAM_ID}/mapping/market_credits/${marketId}`
  try {
    const res = await fetch(creditsUrl)
    if (res.ok) {
      const text = (await res.text()).replace(/^"|"$/g, '')
      if (text && text !== 'null') {
        const m = text.match(/(\d+)u128/)
        if (m) return BigInt(m[1])
      }
    }
  } catch {}

  return null
}

// ----------------------------------------------------------------------------
// Sync turbo bet statuses with on-chain market state
// ----------------------------------------------------------------------------

/**
 * Check on-chain market status for turbo bets and return updated statuses.
 * Called from portfolio page to flip bet status to won/lost/refunded.
 */
export async function syncTurboBetStatus(
  marketId: string,
  betOutcome: string, // 'up' or 'down' (turbo), or legacy 'yes'/'no'
): Promise<{ status: 'active' | 'won' | 'lost' | 'refunded'; winningOutcome?: string } | null> {
  const market = await fetchTurboMarket(marketId)
  if (!market) return null

  if (market.status === 'active') return { status: 'active' }
  if (market.status === 'cancelled') return { status: 'refunded' }

  if (market.status === 'resolved' && market.winningOutcome) {
    // Support both 'up'/'down' (new) and 'yes'/'no' (legacy)
    const betSide = (betOutcome === 'up' || betOutcome === 'yes') ? 'UP' : 'DOWN'
    const won = betSide === market.winningOutcome
    return {
      status: won ? 'won' : 'lost',
      winningOutcome: market.winningOutcome === 'UP' ? 'up' : 'down',
    }
  }
  return null
}

/**
 * Check if a market_id belongs to a turbo market (checks on-chain).
 */
export async function isTurboMarket(marketId: string): Promise<boolean> {
  try {
    const url = `${ALEO_RPC}/program/${TURBO_PROGRAM_ID}/mapping/turbo_markets/${marketId}`
    const res = await fetch(url)
    if (!res.ok) return false
    const text = (await res.text()).replace(/^"|"$/g, '')
    return !!text && text !== 'null' && text.includes('symbol_id')
  } catch {
    return false
  }
}

/**
 * Reverse-lookup the symbol (BTC/ETH/…) for a given turbo market_id by
 * reading the `turbo_markets` mapping on-chain and parsing the `symbol_id`
 * field. Returns null when the market_id doesn't belong to the turbo
 * contract, or when the symbol_id is unknown.
 *
 * Used by MarketDetail to dispatch /market/:marketId routes that happen
 * to be turbo market ids into the TurboDetail view — this is what lets
 * the whole app use a unified `/market/<id>` URL format for both FAMM
 * markets and turbo markets.
 */
const TURBO_SYMBOL_BY_ID: Record<number, string> = {
  1: 'BTC',
  2: 'ETH',
  3: 'SOL',
  4: 'DOGE',
  5: 'XRP',
  6: 'BNB',
  7: 'ADA',
  8: 'AVAX',
  9: 'LINK',
  10: 'DOT',
}

export async function getTurboSymbolFromMarketId(marketId: string): Promise<string | null> {
  try {
    const url = `${ALEO_RPC}/program/${TURBO_PROGRAM_ID}/mapping/turbo_markets/${marketId}`
    const res = await fetch(url)
    if (!res.ok) return null
    const text = (await res.text()).replace(/^"|"$/g, '')
    if (!text || text === 'null') return null
    const match = text.match(/symbol_id:\s*(\d+)u8/)
    if (!match) return null
    const id = Number(match[1])
    return TURBO_SYMBOL_BY_ID[id] ?? null
  } catch {
    return null
  }
}
