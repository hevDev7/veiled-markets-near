// ============================================================================
// REAL BLOCKCHAIN MARKET STORE
// ============================================================================
// This store fetches real market data from the deployed veiled_markets_v14.aleo contract
// Markets created via "Create Market" modal will appear here automatically
// ============================================================================

import { create } from 'zustand'
import type { Market } from './store'
import {
    fetchAllMarkets,
    getCurrentBlockHeight,
    fetchMarketById,
    initializeMarketIds,
    getQuestionText,
    getMarketTransactionId,
    getMarketDescription,
    getMarketResolutionSource,
    TOKEN_SYMBOLS,
    type MarketData,
    type AMMPoolData,
    type MarketResolutionData,
} from './aleo-client'
import { calculateAllPrices, type AMMReserves } from './amm'

interface MarketsState {
    markets: Market[]
    isLoading: boolean      // True only on initial load (no markets yet)
    isRefreshing: boolean   // True during background refresh (markets still visible)
    error: string | null
    lastFetchTime: number | null
}

interface MarketsActions {
    fetchMarkets: () => Promise<void>
    addMarket: (marketId: string) => Promise<void>
    refreshMarket: (marketId: string) => Promise<void>
}

type MarketsStore = MarketsState & MarketsActions

// Helper: Transform blockchain data to Market format (v12 AMM)
async function transformMarketData(
    market: MarketData,
    pool: AMMPoolData,
    currentBlock: bigint,
    resolution?: MarketResolutionData,
): Promise<Market> {
    const numOutcomes = market.num_outcomes || 2

    // Build AMM reserves for price calculation
    const reserves: AMMReserves = {
        reserve_1: pool.reserve_1,
        reserve_2: pool.reserve_2,
        reserve_3: pool.reserve_3,
        reserve_4: pool.reserve_4,
        num_outcomes: numOutcomes,
    }

    // Calculate AMM prices for all outcomes
    const prices = calculateAllPrices(reserves)
    const yesPrice = prices[0] ?? 0.5
    const noPrice = prices[1] ?? 0.5
    const yesPercentage = yesPrice * 100
    const noPercentage = noPrice * 100

    // In v12 AMM, winning shares redeem 1:1, so payout = 1/price
    const potentialYesPayout = yesPrice > 0 ? 1 / yesPrice : 2.0
    const potentialNoPayout = noPrice > 0 ? 1 / noPrice : 2.0

    // Calculate time remaining
    const blocksRemaining = Number(market.deadline - currentBlock)
    const secondsRemaining = blocksRemaining * 15
    const daysRemaining = Math.floor(secondsRemaining / 86400)
    const hoursRemaining = Math.floor((secondsRemaining % 86400) / 3600)
    const minutesRemaining = Math.floor((secondsRemaining % 3600) / 60)

    let timeRemaining: string
    if (blocksRemaining <= 0) {
        timeRemaining = 'Ended'
    } else if (daysRemaining > 0) {
        timeRemaining = `${daysRemaining}d ${hoursRemaining}h`
    } else if (hoursRemaining > 0) {
        timeRemaining = `${hoursRemaining}h ${minutesRemaining}m`
    } else {
        timeRemaining = `${minutesRemaining}m`
    }

    // Default outcome labels
    const defaultLabels = numOutcomes === 2
        ? ['Yes', 'No']
        : Array.from({ length: numOutcomes }, (_, i) => `Outcome ${i + 1}`)

    const questionText = getQuestionText(market.question_hash)
    const transactionId = getMarketTransactionId(market.id)
    const registryDescription = getMarketDescription(market.id)
    const registryResolutionSource = getMarketResolutionSource(market.id)

    return {
        id: market.id,
        question: questionText,
        description: registryDescription || undefined,
        category: market.category,
        numOutcomes,
        outcomeLabels: defaultLabels,
        deadline: market.deadline,
        resolutionDeadline: market.resolution_deadline,
        status: market.status,

        // AMM reserves
        yesReserve: pool.reserve_1,
        noReserve: pool.reserve_2,
        reserve3: pool.reserve_3,
        reserve4: pool.reserve_4,
        totalLiquidity: pool.total_liquidity,
        totalLPShares: pool.total_lp_shares,

        // Prices
        yesPrice,
        noPrice,
        yesPercentage,
        noPercentage,

        // Volume & trades
        totalVolume: pool.total_volume,
        totalBets: 0, // v12 tracks volume, not bet count

        // Shares issued (legacy - not tracked separately in v12)
        totalYesIssued: pool.reserve_1,
        totalNoIssued: pool.reserve_2,

        // Payouts (1/price for AMM)
        potentialYesPayout,
        potentialNoPayout,

        // Resolution / dispute
        challengeDeadline: resolution?.challenge_deadline,
        finalized: resolution?.finalized,

        creator: market.creator,
        timeRemaining,
        resolutionSource: registryResolutionSource || undefined,
        tags: getCategoryTags(market.category),
        transactionId: transactionId || undefined,
        tokenType: (TOKEN_SYMBOLS[market.token_type] || 'ALEO') as 'ALEO' | 'USDCX',
    }
}

// Helper: Get tags based on category
function getCategoryTags(category: number): string[] {
    const categoryMap: Record<number, string[]> = {
        1: ['Politics'],
        2: ['Sports'],
        3: ['Crypto'],
        4: ['Entertainment'],
        5: ['Tech'],
        6: ['Economics'],
        7: ['Science'],
    }
    return categoryMap[category] || []
}

export const useRealMarketsStore = create<MarketsStore>((set, get) => ({
    markets: [],
    isLoading: false,
    isRefreshing: false,
    error: null,
    lastFetchTime: null,

    fetchMarkets: async () => {
        const currentMarkets = get().markets
        const isInitialLoad = currentMarkets.length === 0

        // Only show loading skeleton on initial load, not on background refresh
        if (isInitialLoad) {
            set({ isLoading: true, error: null })
        } else {
            set({ isRefreshing: true, error: null })
        }

        try {
            // Ensure market IDs are loaded from index before fetching
            await initializeMarketIds()

            // Fetch all markets from blockchain
            const blockchainMarkets = await fetchAllMarkets()
            let currentBlock: bigint
            try {
                currentBlock = await getCurrentBlockHeight()
            } catch {
                console.warn('[Markets] Block height fetch failed, using 0 (all markets show active)')
                currentBlock = 0n
            }

            // Transform to Market format (v12: pass resolution for challenge window)
            const markets: Market[] = await Promise.all(
                blockchainMarkets.map(({ market, pool, resolution }) =>
                    transformMarketData(market, pool, currentBlock, resolution)
                )
            )

            set({
                markets,
                isLoading: false,
                isRefreshing: false,
                lastFetchTime: Date.now()
            })
        } catch (error) {
            console.error('Failed to fetch markets:', error)
            // On error during refresh, keep existing markets visible
            set((state) => ({
                error: error instanceof Error ? error.message : 'Failed to fetch markets',
                isLoading: false,
                isRefreshing: false,
                // Only clear markets if it was initial load that failed
                markets: isInitialLoad ? [] : state.markets
            }))
        }
    },

    addMarket: async (marketId: string) => {
        try {
            const marketData = await fetchMarketById(marketId)
            if (!marketData) {
                console.error('Market not found:', marketId)
                return
            }

            const currentBlock = await getCurrentBlockHeight()
            const market = await transformMarketData(
                marketData.market,
                marketData.pool,
                currentBlock,
                marketData.resolution,
            )

            set((state) => ({
                markets: [market, ...state.markets]
            }))

            console.log('✅ Market added to store:', marketId)
        } catch (error) {
            console.error('Failed to add market:', error)
        }
    },

    refreshMarket: async (marketId: string) => {
        try {
            const marketData = await fetchMarketById(marketId)
            if (!marketData) return

            const currentBlock = await getCurrentBlockHeight()
            const updatedMarket = await transformMarketData(
                marketData.market,
                marketData.pool,
                currentBlock,
                marketData.resolution,
            )

            set((state) => ({
                markets: state.markets.map((m) =>
                    m.id === marketId ? updatedMarket : m
                )
            }))
        } catch (error) {
            console.error('Failed to refresh market:', error)
        }
    },
}))
