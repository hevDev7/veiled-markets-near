// ============================================================================
// AMM Utility Functions
// ============================================================================
// Helper functions for Automated Market Maker calculations

const SHARE_PRICE_SCALE = 1_000_000 // $1.00 in microcredits

/**
 * Calculate current YES price from reserves
 */
export function calculateYesPrice(yesReserve: bigint, noReserve: bigint): number {
    const total = yesReserve + noReserve
    if (total === 0n) return 0.5
    return Number(yesReserve) / Number(total)
}

/**
 * Calculate current NO price from reserves
 */
export function calculateNoPrice(yesReserve: bigint, noReserve: bigint): number {
    const total = yesReserve + noReserve
    if (total === 0n) return 0.5
    return Number(noReserve) / Number(total)
}

/**
 * Calculate shares received for given credits input
 * Formula: shares_out = reserve_out - (k / (reserve_in + credits_in))
 */
export function calculateSharesOut(
    reserveIn: bigint,
    reserveOut: bigint,
    creditsIn: bigint
): bigint {
    const k = reserveIn * reserveOut
    const newReserveIn = reserveIn + creditsIn
    const newReserveOut = k / newReserveIn
    return reserveOut - newReserveOut
}

/**
 * Calculate credits received for given shares input
 * Formula: credits_out = reserve_out - (k / (reserve_in + shares_in))
 */
export function calculateCreditsOut(
    reserveIn: bigint,
    reserveOut: bigint,
    sharesIn: bigint
): bigint {
    const k = reserveIn * reserveOut
    const newReserveIn = reserveIn + sharesIn
    const newReserveOut = k / newReserveIn
    return reserveOut - newReserveOut
}

/**
 * Calculate price impact of a trade
 * Returns percentage change in price
 */
export function calculatePriceImpact(
    yesReserve: bigint,
    noReserve: bigint,
    shareType: 'yes' | 'no',
    amount: bigint,
    isBuy: boolean
): number {
    const oldPrice = shareType === 'yes'
        ? calculateYesPrice(yesReserve, noReserve)
        : calculateNoPrice(yesReserve, noReserve)

    let newYesReserve = yesReserve
    let newNoReserve = noReserve

    if (isBuy) {
        if (shareType === 'yes') {
            const sharesOut = calculateSharesOut(noReserve, yesReserve, amount)
            newYesReserve = yesReserve - sharesOut
            newNoReserve = noReserve + amount
        } else {
            const sharesOut = calculateSharesOut(yesReserve, noReserve, amount)
            newNoReserve = noReserve - sharesOut
            newYesReserve = yesReserve + amount
        }
    } else {
        if (shareType === 'yes') {
            const creditsOut = calculateCreditsOut(yesReserve, noReserve, amount)
            newYesReserve = yesReserve + amount
            newNoReserve = noReserve - creditsOut
        } else {
            const creditsOut = calculateCreditsOut(noReserve, yesReserve, amount)
            newNoReserve = noReserve + amount
            newYesReserve = yesReserve - creditsOut
        }
    }

    const newPrice = shareType === 'yes'
        ? calculateYesPrice(newYesReserve, newNoReserve)
        : calculateNoPrice(newYesReserve, newNoReserve)

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
    const profitPercent = (profit / invested) * 100

    return {
        value: currentValue,
        profit,
        profitPercent
    }
}

/**
 * Calculate potential payout if shares win
 */
export function calculateWinningPayout(quantity: bigint): number {
    // Each winning share = $1
    return Number(quantity) / SHARE_PRICE_SCALE
}

/**
 * Estimate gas/fees for a trade
 */
export function estimateTradeFees(amount: bigint): bigint {
    // 2% total fees (1% protocol + 1% creator)
    return (amount * 200n) / 10000n
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
 * Calculate minimum credits out with slippage tolerance
 */
export function calculateMinCreditsOut(
    expectedCredits: bigint,
    slippageTolerance: number
): bigint {
    const slippageFactor = BigInt(Math.floor((100 - slippageTolerance) * 100))
    return (expectedCredits * slippageFactor) / 10000n
}

/**
 * Check if price is within acceptable bounds
 */
export function isPriceValid(price: number): boolean {
    return price >= 0.01 && price <= 0.99
}

/**
 * Calculate liquidity depth (how much can be traded before X% price impact)
 */
export function calculateLiquidityDepth(
    yesReserve: bigint,
    noReserve: bigint,
    maxPriceImpact: number // percentage
): {
    yesDepth: bigint
    noDepth: bigint
} {
    // Binary search to find max trade size for given price impact
    const findMaxTrade = (
        reserveIn: bigint,
        reserveOut: bigint,
        targetImpact: number
    ): bigint => {
        let low = 0n
        let high = reserveIn / 2n // Max 50% of reserve
        let result = 0n

        while (low <= high) {
            const mid = (low + high) / 2n
            const sharesOut = calculateSharesOut(reserveIn, reserveOut, mid)
            const newReserveOut = reserveOut - sharesOut
            const newReserveIn = reserveIn + mid

            const oldPrice = Number(reserveOut) / Number(reserveIn + reserveOut)
            const newPrice = Number(newReserveOut) / Number(newReserveIn + newReserveOut)
            const impact = Math.abs((newPrice - oldPrice) / oldPrice) * 100

            if (impact <= targetImpact) {
                result = mid
                low = mid + 1n
            } else {
                high = mid - 1n
            }
        }

        return result
    }

    return {
        yesDepth: findMaxTrade(noReserve, yesReserve, maxPriceImpact),
        noDepth: findMaxTrade(yesReserve, noReserve, maxPriceImpact)
    }
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
