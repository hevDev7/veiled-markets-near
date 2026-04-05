// ============================================================================
// AMM Utility Functions - v20 FPMM (Fixed Product Market Maker)
// ============================================================================
// Correct complete-set minting/burning formulas matching contract v20.
// Supports 2-4 outcome markets.

import {
    calculateContractAllPrices,
    calculateContractLPSharesOut,
    calculateContractLPTokensOut,
    calculateContractMaxTokensDesired,
    calculateContractOutcomePrice,
    calculateContractSellTokensOut,
    calculateContractTradeFees,
    quoteContractAddLiquidity,
    quoteContractBuy,
    quoteContractSell,
    type ContractFeeConfig,
    type ContractMathReserves,
} from '@sdk/contract-math'
import {
    CREATOR_FEE_BPS as SDK_CREATOR_FEE_BPS,
    FEE_DENOMINATOR as SDK_FEE_DENOMINATOR,
    LP_FEE_BPS as SDK_LP_FEE_BPS,
    PROTOCOL_FEE_BPS as SDK_PROTOCOL_FEE_BPS,
    TOTAL_FEE_BPS as SDK_TOTAL_FEE_BPS,
} from '@sdk/types'

const SHARE_PRICE_SCALE = 1_000_000 // $1.00 in microcredits

// Fee configuration matching contract (basis points)
export const PROTOCOL_FEE_BPS = SDK_PROTOCOL_FEE_BPS
export const CREATOR_FEE_BPS = SDK_CREATOR_FEE_BPS
export const LP_FEE_BPS = SDK_LP_FEE_BPS
export const TOTAL_FEE_BPS = SDK_TOTAL_FEE_BPS
export const FEE_DENOMINATOR = SDK_FEE_DENOMINATOR

export interface AMMFeeConfig {
    protocolFeeBps: bigint
    creatorFeeBps: bigint
    lpFeeBps: bigint
}

export const DEFAULT_AMM_FEE_CONFIG: AMMFeeConfig = {
    protocolFeeBps: PROTOCOL_FEE_BPS,
    creatorFeeBps: CREATOR_FEE_BPS,
    lpFeeBps: LP_FEE_BPS,
}

export interface AMMReserves {
    reserve_1: bigint
    reserve_2: bigint
    reserve_3: bigint
    reserve_4: bigint
    num_outcomes: number
}

export interface AddLiquidityPreview {
    mintedLPShares: bigint
    reserveAdditions: [bigint, bigint, bigint, bigint]
    updatedReserves: AMMReserves
}

function toContractReserves(reserves: AMMReserves): ContractMathReserves {
    return {
        reserve1: reserves.reserve_1,
        reserve2: reserves.reserve_2,
        reserve3: reserves.reserve_3,
        reserve4: reserves.reserve_4,
        numOutcomes: reserves.num_outcomes,
    }
}

function toAMMReserves(
    updatedReserves: [bigint, bigint, bigint, bigint],
    numOutcomes: number,
): AMMReserves {
    return {
        reserve_1: updatedReserves[0],
        reserve_2: updatedReserves[1],
        reserve_3: updatedReserves[2],
        reserve_4: updatedReserves[3],
        num_outcomes: numOutcomes,
    }
}

function toContractFeeConfig(feeConfig?: Partial<AMMFeeConfig>): Partial<ContractFeeConfig> | undefined {
    if (!feeConfig) return undefined
    return {
        protocolFeeBps: feeConfig.protocolFeeBps,
        creatorFeeBps: feeConfig.creatorFeeBps,
        lpFeeBps: feeConfig.lpFeeBps,
    }
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
 * Calculate FPMM price of a specific outcome (0-1 range)
 * Delegates to the contract parity layer.
 */
export function calculateOutcomePrice(reserves: AMMReserves, outcome: number): number {
    return calculateContractOutcomePrice(toContractReserves(reserves), outcome)
}

/**
 * Calculate all outcome prices at once
 */
export function calculateAllPrices(reserves: AMMReserves): number[] {
    return calculateContractAllPrices(toContractReserves(reserves))
}

/**
 * Calculate fees for a given amount (buy side)
 */
export function calculateFees(amountIn: bigint, feeConfig?: Partial<AMMFeeConfig>): {
    protocolFee: bigint
    creatorFee: bigint
    lpFee: bigint
    totalFees: bigint
    amountAfterFees: bigint
    amountToPool: bigint
} {
    return calculateFeesWithConfig(amountIn, feeConfig)
}

export function calculateFeesWithConfig(
    amountIn: bigint,
    feeConfig?: Partial<AMMFeeConfig>
): {
    protocolFee: bigint
    creatorFee: bigint
    lpFee: bigint
    totalFees: bigint
    amountAfterFees: bigint
    amountToPool: bigint
} {
    const resolvedFees = calculateContractTradeFees(amountIn, toContractFeeConfig(feeConfig))
    const { protocolFee, creatorFee, lpFee, totalFees, amountAfterFees, amountToPool } = resolvedFees
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
    feeConfig?: Partial<AMMFeeConfig>,
): bigint {
    if (amountIn <= 0n || getReserve(reserves, outcome) === 0n) return 0n
    return quoteContractBuy(
        toContractReserves(reserves),
        outcome,
        amountIn,
        toContractFeeConfig(feeConfig),
    ).sharesOut
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
    feeConfig?: Partial<AMMFeeConfig>,
): bigint {
    if (tokensDesired <= 0n || getReserve(reserves, outcome) === 0n) return 0n
    try {
        return quoteContractSell(
            toContractReserves(reserves),
            outcome,
            tokensDesired,
            toContractFeeConfig(feeConfig),
        ).sharesNeeded
    } catch {
        return 0n
    }
}

/**
 * Calculate net tokens received after selling (tokens_desired minus all fees)
 */
export function calculateSellNetTokens(tokensDesired: bigint, feeConfig?: Partial<AMMFeeConfig>): bigint {
    return calculateFeesWithConfig(tokensDesired, feeConfig).amountAfterFees
}

/**
 * Calculate maximum tokens_desired given available shares.
 * Uses binary search to find the max withdrawal where sharesNeeded <= availableShares.
 */
export function calculateMaxTokensDesired(
    reserves: AMMReserves,
    outcome: number,
    availableShares: bigint,
    feeConfig?: Partial<AMMFeeConfig>,
): bigint {
    return calculateContractMaxTokensDesired(
        toContractReserves(reserves),
        outcome,
        availableShares,
        toContractFeeConfig(feeConfig),
    )
}

/**
 * Calculate tokens out for selling shares (legacy API, uses tokens_desired approach internally)
 * Returns estimated net tokens for a given number of shares to sell.
 */
export function calculateSellTokensOut(
    reserves: AMMReserves,
    outcome: number,
    sharesToSell: bigint,
    feeConfig?: Partial<AMMFeeConfig>,
): bigint {
    return calculateContractSellTokensOut(
        toContractReserves(reserves),
        outcome,
        sharesToSell,
        toContractFeeConfig(feeConfig),
    )
}

/**
 * Calculate reserves after a buy trade (for price impact simulation)
 * FPMM: add a to all reserves, then target = r_i_new (step division result)
 */
export function simulateBuy(
    reserves: AMMReserves,
    outcome: number,
    amountIn: bigint,
    feeConfig?: Partial<AMMFeeConfig>,
): AMMReserves {
    return toAMMReserves(
        quoteContractBuy(
            toContractReserves(reserves),
            outcome,
            amountIn,
            toContractFeeConfig(feeConfig),
        ).updatedReserves,
        reserves.num_outcomes,
    )
}

/**
 * Calculate price impact of a buy trade (percentage)
 */
export function calculateBuyPriceImpact(
    reserves: AMMReserves,
    outcome: number,
    amountIn: bigint,
    feeConfig?: Partial<AMMFeeConfig>,
): number {
    const oldPrice = calculateOutcomePrice(reserves, outcome)
    if (amountIn === 0n) return 0

    const newReserves = simulateBuy(reserves, outcome, amountIn, feeConfig)
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
    feeConfig?: Partial<AMMFeeConfig>,
): AMMReserves | null {
    try {
        return toAMMReserves(
            quoteContractSell(
                toContractReserves(reserves),
                outcome,
                tokensDesired,
                toContractFeeConfig(feeConfig),
            ).updatedReserves,
            reserves.num_outcomes,
        )
    } catch {
        return null
    }
}

/**
 * Calculate price impact of a sell trade (percentage)
 */
export function calculateSellPriceImpact(
    reserves: AMMReserves,
    outcome: number,
    tokensDesired: bigint,
    feeConfig?: Partial<AMMFeeConfig>,
): number {
    const oldPrice = calculateOutcomePrice(reserves, outcome)
    if (tokensDesired === 0n) return 0

    const newReserves = simulateSell(reserves, outcome, tokensDesired, feeConfig)
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
export function estimateTradeFees(amount: bigint, feeConfig?: Partial<AMMFeeConfig>): bigint {
    return calculateContractTradeFees(amount, toContractFeeConfig(feeConfig)).totalFees
}

/**
 * Calculate minimum shares out with slippage tolerance
 */
export function calculateMinSharesOut(
    expectedShares: bigint,
    slippageTolerance: number // percentage (e.g., 1 = 1%)
): bigint {
    if (expectedShares <= 0n) return 0n
    const slippageFactor = BigInt(Math.floor((100 - slippageTolerance) * 100))
    const result = (expectedShares * slippageFactor) / 10000n
    // Floor of 1 prevents truncation to 0 for small orders
    return result < 1n ? 1n : result
}

/**
 * Calculate minimum tokens out with slippage tolerance
 */
export function calculateMinTokensOut(
    expectedTokens: bigint,
    slippageTolerance: number
): bigint {
    if (expectedTokens <= 0n) return 0n
    const slippageFactor = BigInt(Math.floor((100 - slippageTolerance) * 100))
    const result = (expectedTokens * slippageFactor) / 10000n
    // Floor of 1 prevents truncation to 0 for small orders
    return result < 1n ? 1n : result
}

/**
 * Check if price is within acceptable bounds
 */
export function isPriceValid(price: number): boolean {
    return price >= 0.01 && price <= 0.99
}

/**
 * Calculate LP shares for adding liquidity
 * lp_shares = (amount * total_lp_shares) / total_reserves
 * v20: Uses total_reserves (sum of AMM reserves) instead of total_liquidity
 */
export function calculateLPSharesOut(
    amount: bigint,
    totalLPShares: bigint,
    totalReserves: bigint,
): bigint {
    return calculateContractLPSharesOut(amount, totalLPShares, totalReserves)
}

export function calculateAddLiquidityQuote(
    reserves: AMMReserves,
    totalLPShares: bigint,
    amount: bigint,
): AddLiquidityPreview | null {
    if (amount <= 0n) return null

    const quote = quoteContractAddLiquidity(toContractReserves(reserves), totalLPShares, amount)

    return {
        mintedLPShares: quote.mintedLPShares,
        reserveAdditions: quote.reserveAdditions,
        updatedReserves: toAMMReserves(quote.updatedReserves, reserves.num_outcomes),
    }
}

/**
 * Calculate tokens returned when removing LP shares
 * tokens_out = (shares_to_remove * total_reserves) / total_lp_shares
 * v20: Uses total_reserves (sum of AMM reserves) instead of total_liquidity
 */
export function calculateLPTokensOut(
    sharesToRemove: bigint,
    totalLPShares: bigint,
    totalReserves: bigint,
): bigint {
    return calculateContractLPTokensOut(sharesToRemove, totalLPShares, totalReserves)
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
