// ============================================================================
// AMM Utility Functions - v14 FPMM (Fixed Product Market Maker)
// ============================================================================
// Correct complete-set minting/burning formulas matching contract v14.
// Supports 2-4 outcome markets.

const SHARE_PRICE_SCALE = 1_000_000 // $1.00 in microcredits

// Fee configuration matching contract (basis points)
export const PROTOCOL_FEE_BPS = 50n   // 0.5%
export const CREATOR_FEE_BPS = 50n    // 0.5%
export const LP_FEE_BPS = 100n        // 1.0%
export const TOTAL_FEE_BPS = 200n     // 2.0% total
export const FEE_DENOMINATOR = 10000n

export interface AMMReserves {
    reserve_1: bigint
    reserve_2: bigint
    reserve_3: bigint
    reserve_4: bigint
    num_outcomes: number
}

/**
 * Get total reserves across all active outcomes
 */
export function getTotalReserves(reserves: AMMReserves): bigint {
    let total = reserves.reserve_1 + reserves.reserve_2
    if (reserves.num_outcomes >= 3) total += reserves.reserve_3
    if (reserves.num_outcomes >= 4) total += reserves.reserve_4
    return total
}

/**
 * Get reserve for a specific outcome (1-indexed)
 */
export function getReserve(reserves: AMMReserves, outcome: number): bigint {
    switch (outcome) {
        case 1: return reserves.reserve_1
        case 2: return reserves.reserve_2
        case 3: return reserves.reserve_3
        case 4: return reserves.reserve_4
        default: return 0n
    }
}

/**
 * Get active reserves as array (0-indexed, only active outcomes)
 */
function getActiveReserves(reserves: AMMReserves): bigint[] {
    const arr = [reserves.reserve_1, reserves.reserve_2]
    if (reserves.num_outcomes >= 3) arr.push(reserves.reserve_3)
    if (reserves.num_outcomes >= 4) arr.push(reserves.reserve_4)
    return arr
}

/**
 * Calculate FPMM price of a specific outcome (0-1 range)
 * FPMM: price_i = product(r_j for j!=i) / sum(product(r_j for j!=k) for each k)
 * Binary simplification: price_i = r_other / total
 */
export function calculateOutcomePrice(reserves: AMMReserves, outcome: number): number {
    const total = getTotalReserves(reserves)
    if (total === 0n) return 1 / reserves.num_outcomes
    const n = reserves.num_outcomes

    if (n === 2) {
        // Binary: price_i = r_other / total
        const other = outcome === 1 ? reserves.reserve_2 : reserves.reserve_1
        return Number(other) / Number(total)
    }

    // General N-outcome: use Number for display precision (acceptable for UI)
    const arr = getActiveReserves(reserves)
    const products: number[] = []
    for (let i = 0; i < n; i++) {
        let prod = 1
        for (let j = 0; j < n; j++) {
            if (j !== i) prod *= Number(arr[j])
        }
        products.push(prod)
    }
    const sumProducts = products.reduce((a, b) => a + b, 0)
    if (sumProducts === 0) return 1 / n
    return products[outcome - 1] / sumProducts
}

/**
 * Calculate all outcome prices at once
 */
export function calculateAllPrices(reserves: AMMReserves): number[] {
    const prices: number[] = []
    for (let i = 1; i <= reserves.num_outcomes; i++) {
        prices.push(calculateOutcomePrice(reserves, i))
    }
    return prices
}

/**
 * Calculate fees for a given amount (buy side)
 */
export function calculateFees(amountIn: bigint): {
    protocolFee: bigint
    creatorFee: bigint
    lpFee: bigint
    totalFees: bigint
    amountAfterFees: bigint
    amountToPool: bigint
} {
    const protocolFee = (amountIn * PROTOCOL_FEE_BPS) / FEE_DENOMINATOR
    const creatorFee = (amountIn * CREATOR_FEE_BPS) / FEE_DENOMINATOR
    const lpFee = (amountIn * LP_FEE_BPS) / FEE_DENOMINATOR
    const totalFees = protocolFee + creatorFee + lpFee
    const amountAfterFees = amountIn - totalFees
    const amountToPool = amountIn - protocolFee - creatorFee // LP fee stays in pool
    return { protocolFee, creatorFee, lpFee, totalFees, amountAfterFees, amountToPool }
}

/**
 * Calculate shares out for buying outcome i with amount_in tokens
 * FPMM complete-set minting (step division):
 *   r_i_new = r_i * prod(r_k / (r_k + a)) for active k != i
 *   shares_out = (r_i + a) - r_i_new
 */
export function calculateBuySharesOut(
    reserves: AMMReserves,
    outcome: number,
    amountIn: bigint,
): bigint {
    const { amountToPool } = calculateFees(amountIn)
    const n = reserves.num_outcomes
    const a = amountToPool
    const r_i = getReserve(reserves, outcome)

    if (r_i === 0n || a === 0n) return 0n

    // Step division: r_i_new = r_i * prod(r_k / (r_k + a)) for active k != i
    const arr = getActiveReserves(reserves)
    let step = r_i
    for (let k = 0; k < n; k++) {
        if (k + 1 !== outcome) {
            const r_k = arr[k]
            step = (step * r_k) / (r_k + a)
        }
    }

    const sharesOut = (r_i + a) - step
    return sharesOut > 0n ? sharesOut : 0n
}

/**
 * Calculate shares needed to withdraw tokens_desired (gross) from the pool.
 * FPMM complete-set burning (step division):
 *   pool_out = tokensDesired - lpFee
 *   r_i_new = r_i * prod(r_k / (r_k - pool_out)) for active k != i
 *   shares_needed = r_i_new - r_i + pool_out
 */
export function calculateSellSharesNeeded(
    reserves: AMMReserves,
    outcome: number,
    tokensDesired: bigint,
): bigint {
    const lpFee = (tokensDesired * LP_FEE_BPS) / FEE_DENOMINATOR
    const poolOut = tokensDesired - lpFee
    const n = reserves.num_outcomes
    const r_i = getReserve(reserves, outcome)

    if (r_i === 0n || poolOut === 0n) return 0n

    // Step division: r_i_new = r_i * prod(r_k / (r_k - poolOut)) for active k != i
    const arr = getActiveReserves(reserves)
    let step = r_i
    for (let k = 0; k < n; k++) {
        if (k + 1 !== outcome) {
            const r_k = arr[k]
            if (r_k <= poolOut) return 0n // Pool can't support this withdrawal
            step = (step * r_k) / (r_k - poolOut)
        }
    }

    return step - r_i + poolOut
}

/**
 * Calculate net tokens received after selling (tokens_desired minus all fees)
 */
export function calculateSellNetTokens(tokensDesired: bigint): bigint {
    const protocolFee = (tokensDesired * PROTOCOL_FEE_BPS) / FEE_DENOMINATOR
    const creatorFee = (tokensDesired * CREATOR_FEE_BPS) / FEE_DENOMINATOR
    const lpFee = (tokensDesired * LP_FEE_BPS) / FEE_DENOMINATOR
    return tokensDesired - protocolFee - creatorFee - lpFee
}

/**
 * Calculate maximum tokens_desired given available shares.
 * Uses binary search to find the max withdrawal where sharesNeeded <= availableShares.
 */
export function calculateMaxTokensDesired(
    reserves: AMMReserves,
    outcome: number,
    availableShares: bigint,
): bigint {
    if (availableShares === 0n) return 0n

    // Upper bound: can't withdraw more than smallest non-target reserve
    const arr = getActiveReserves(reserves)
    let maxPool = 0n
    for (let k = 0; k < reserves.num_outcomes; k++) {
        if (k + 1 !== outcome) {
            const limit = arr[k] - 1n // Must leave at least 1
            if (maxPool === 0n || limit < maxPool) maxPool = limit
        }
    }
    if (maxPool <= 0n) return 0n

    // Convert pool limit to tokens_desired (pool_out = td - lpFee → td = pool_out * 10000 / 9900)
    let high = (maxPool * FEE_DENOMINATOR) / (FEE_DENOMINATOR - LP_FEE_BPS)
    let low = 0n
    let result = 0n

    // Binary search with max 60 iterations (covers u128 range)
    for (let iter = 0; iter < 60 && low <= high; iter++) {
        const mid = (low + high) / 2n
        if (mid === 0n) { low = 1n; continue }
        const sharesNeeded = calculateSellSharesNeeded(reserves, outcome, mid)
        if (sharesNeeded > 0n && sharesNeeded <= availableShares) {
            result = mid
            low = mid + 1n
        } else {
            high = mid - 1n
        }
    }

    return result
}

/**
 * Calculate tokens out for selling shares (legacy API, uses tokens_desired approach internally)
 * Returns estimated net tokens for a given number of shares to sell.
 */
export function calculateSellTokensOut(
    reserves: AMMReserves,
    outcome: number,
    sharesToSell: bigint,
): bigint {
    const maxTd = calculateMaxTokensDesired(reserves, outcome, sharesToSell)
    if (maxTd === 0n) return 0n
    return calculateSellNetTokens(maxTd)
}

/**
 * Calculate reserves after a buy trade (for price impact simulation)
 * FPMM: add a to all reserves, then target = r_i_new (step division result)
 */
export function simulateBuy(
    reserves: AMMReserves,
    outcome: number,
    amountIn: bigint,
): AMMReserves {
    const { amountToPool } = calculateFees(amountIn)
    const n = reserves.num_outcomes
    const a = amountToPool
    const r_i = getReserve(reserves, outcome)

    // Step division
    const arr = getActiveReserves(reserves)
    let step = r_i
    for (let k = 0; k < n; k++) {
        if (k + 1 !== outcome) {
            const r_k = arr[k]
            if (r_k + a > 0n) step = (step * r_k) / (r_k + a)
        }
    }
    const r_i_new = step

    // Reserve update: non-target += a, target = r_i_new
    const nr = [reserves.reserve_1, reserves.reserve_2, reserves.reserve_3, reserves.reserve_4]
    for (let k = 0; k < n; k++) {
        if (k + 1 === outcome) {
            nr[k] = r_i_new
        } else {
            nr[k] = nr[k] + a
        }
    }

    return {
        reserve_1: nr[0],
        reserve_2: nr[1],
        reserve_3: nr[2],
        reserve_4: nr[3],
        num_outcomes: n,
    }
}

/**
 * Calculate price impact of a buy trade (percentage)
 */
export function calculateBuyPriceImpact(
    reserves: AMMReserves,
    outcome: number,
    amountIn: bigint,
): number {
    const oldPrice = calculateOutcomePrice(reserves, outcome)
    if (amountIn === 0n) return 0

    const newReserves = simulateBuy(reserves, outcome, amountIn)
    const newPrice = calculateOutcomePrice(newReserves, outcome)

    if (oldPrice === 0) return 0
    return ((newPrice - oldPrice) / oldPrice) * 100
}

/**
 * Simulate reserves after a sell trade
 */
export function simulateSell(
    reserves: AMMReserves,
    outcome: number,
    tokensDesired: bigint,
): AMMReserves | null {
    const lpFee = (tokensDesired * LP_FEE_BPS) / FEE_DENOMINATOR
    const poolOut = tokensDesired - lpFee
    const n = reserves.num_outcomes
    const r_i = getReserve(reserves, outcome)

    // Step division for sell
    const arr = getActiveReserves(reserves)
    let step = r_i
    for (let k = 0; k < n; k++) {
        if (k + 1 !== outcome) {
            const r_k = arr[k]
            if (r_k <= poolOut) return null // Can't sell this much
            step = (step * r_k) / (r_k - poolOut)
        }
    }
    const r_i_new = step

    // Reserve update: non-target -= poolOut, target = r_i_new
    const nr = [reserves.reserve_1, reserves.reserve_2, reserves.reserve_3, reserves.reserve_4]
    for (let k = 0; k < n; k++) {
        if (k + 1 === outcome) {
            nr[k] = r_i_new
        } else if (k < n) {
            nr[k] = nr[k] - poolOut
        }
    }

    return {
        reserve_1: nr[0],
        reserve_2: nr[1],
        reserve_3: nr[2],
        reserve_4: nr[3],
        num_outcomes: n,
    }
}

/**
 * Calculate price impact of a sell trade (percentage)
 */
export function calculateSellPriceImpact(
    reserves: AMMReserves,
    outcome: number,
    tokensDesired: bigint,
): number {
    const oldPrice = calculateOutcomePrice(reserves, outcome)
    if (tokensDesired === 0n) return 0

    const newReserves = simulateSell(reserves, outcome, tokensDesired)
    if (!newReserves) return 0

    const newPrice = calculateOutcomePrice(newReserves, outcome)
    if (oldPrice === 0) return 0
    return ((newPrice - oldPrice) / oldPrice) * 100
}

/**
 * Calculate slippage for a trade
 */
export function calculateSlippage(
    expectedPrice: number,
    actualPrice: number
): number {
    return Math.abs((actualPrice - expectedPrice) / expectedPrice) * 100
}

/**
 * Format share price for display
 */
export function formatSharePrice(price: number): string {
    return `$${price.toFixed(3)}`
}

/**
 * Calculate potential profit for a position
 */
export function calculatePotentialProfit(
    quantity: bigint,
    avgPrice: number,
    currentPrice: number
): {
    value: number
    profit: number
    profitPercent: number
} {
    const quantityNum = Number(quantity) / SHARE_PRICE_SCALE
    const invested = quantityNum * avgPrice
    const currentValue = quantityNum * currentPrice
    const profit = currentValue - invested
    const profitPercent = invested > 0 ? (profit / invested) * 100 : 0

    return { value: currentValue, profit, profitPercent }
}

/**
 * Calculate payout if shares win (1:1 redemption)
 */
export function calculateWinningPayout(quantity: bigint): number {
    return Number(quantity) / SHARE_PRICE_SCALE
}

/**
 * Estimate total trade fees
 */
export function estimateTradeFees(amount: bigint): bigint {
    return (amount * TOTAL_FEE_BPS) / FEE_DENOMINATOR
}

/**
 * Calculate minimum shares out with slippage tolerance
 */
export function calculateMinSharesOut(
    expectedShares: bigint,
    slippageTolerance: number // percentage (e.g., 1 = 1%)
): bigint {
    const slippageFactor = BigInt(Math.floor((100 - slippageTolerance) * 100))
    return (expectedShares * slippageFactor) / 10000n
}

/**
 * Calculate minimum tokens out with slippage tolerance
 */
export function calculateMinTokensOut(
    expectedTokens: bigint,
    slippageTolerance: number
): bigint {
    const slippageFactor = BigInt(Math.floor((100 - slippageTolerance) * 100))
    return (expectedTokens * slippageFactor) / 10000n
}

/**
 * Check if price is within acceptable bounds
 */
export function isPriceValid(price: number): boolean {
    return price >= 0.01 && price <= 0.99
}

/**
 * Calculate LP shares for adding liquidity
 * lp_shares = (amount * total_lp_shares) / total_liquidity
 */
export function calculateLPSharesOut(
    amount: bigint,
    totalLPShares: bigint,
    totalLiquidity: bigint,
): bigint {
    if (totalLiquidity === 0n) return amount
    return (amount * totalLPShares) / totalLiquidity
}

/**
 * Calculate tokens returned when removing LP shares
 * tokens_out = (shares_to_remove * total_liquidity) / total_lp_shares
 */
export function calculateLPTokensOut(
    sharesToRemove: bigint,
    totalLPShares: bigint,
    totalLiquidity: bigint,
): bigint {
    if (totalLPShares === 0n) return 0n
    return (sharesToRemove * totalLiquidity) / totalLPShares
}

/**
 * Calculate liquidity depth (how much can be traded before X% price impact)
 */
export function calculateLiquidityDepth(
    reserves: AMMReserves,
    outcome: number,
    maxPriceImpact: number
): bigint {
    let low = 0n
    let high = getTotalReserves(reserves) / 2n
    let result = 0n

    for (let iter = 0; iter < 60 && low <= high; iter++) {
        const mid = (low + high) / 2n
        const impact = Math.abs(calculateBuyPriceImpact(reserves, outcome, mid))

        if (impact <= maxPriceImpact) {
            result = mid
            low = mid + 1n
        } else {
            high = mid - 1n
        }
    }

    return result
}

/**
 * Format price change for display
 */
export function formatPriceChange(change: number): string {
    const sign = change >= 0 ? '+' : ''
    return `${sign}${change.toFixed(2)}%`
}

/**
 * Calculate average price from multiple trades
 */
export function calculateAveragePrice(
    trades: Array<{ quantity: bigint; price: number }>
): number {
    let totalQuantity = 0n
    let totalCost = 0

    for (const trade of trades) {
        totalQuantity += trade.quantity
        totalCost += Number(trade.quantity) * trade.price
    }

    if (totalQuantity === 0n) return 0
    return totalCost / Number(totalQuantity)
}

// Legacy aliases for backward compatibility
export const calculateMinCreditsOut = calculateMinTokensOut
