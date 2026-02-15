// ============================================================================
// REAL BLOCKCHAIN MARKET STORE
// ============================================================================
// This store fetches real market data from the deployed veiled_markets_v10.aleo contract
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
    type MarketPoolData,
} from './aleo-client'

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

// Helper: Transform blockchain data to Market format
async function transformMarketData(
    market: MarketData,
    pool: MarketPoolData,
    currentBlock: bigint
): Promise<Market> {
    console.log('=== TRANSFORM MARKET DATA ===');
    console.log('Market:', market);
    console.log('Pool:', pool);
    console.log('Current block:', currentBlock);
    console.log('Deadline:', market.deadline);
    console.log('Blocks remaining:', Number(market.deadline - currentBlock));

    // Calculate percentages (both from BigInt to avoid JS floating-point subtraction)
    const totalPool = pool.total_yes_pool + pool.total_no_pool
    const yesPercentage = totalPool > 0n
        ? Math.round(Number((pool.total_yes_pool * 10000n) / totalPool)) / 100
        : 50
    const noPercentage = totalPool > 0n
        ? Math.round(Number((pool.total_no_pool * 10000n) / totalPool)) / 100
        : 50

    // Calculate time remaining
    const blocksRemaining = Number(market.deadline - currentBlock)
    console.log('Blocks remaining (calculated):', blocksRemaining);

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

    console.log('Time remaining:', timeRemaining);

    // Calculate Parimutuel Pool fields
    // In parimutuel betting, all bets go into pools and winners split the total pool
    const yesPool = pool.total_yes_pool || 1000000n // Default 1 ALEO if empty for display
    const noPool = pool.total_no_pool || 1000000n
    // totalPool already calculated above

    // Implied probability based on pool sizes
    const yesPrice = totalPool > 0n
        ? Number(yesPool * 10000n / totalPool) / 10000
        : 0.5
    const noPrice = totalPool > 0n
        ? Number(noPool * 10000n / totalPool) / 10000
        : 0.5

    // Calculate potential payouts (parimutuel formula)
    // Payout = (total_pool / winning_pool) * (1 - fees)
    // If you bet 1 ALEO on YES and YES wins, you get: (total_pool / yes_pool) * 0.98 ALEO
    const potentialYesPayout = pool.total_yes_pool > 0n
        ? Number(totalPool * 9800n / pool.total_yes_pool) / 10000 // 98% after 2% fees
        : 2.0 // Default 2x when no bets
    const potentialNoPayout = pool.total_no_pool > 0n
        ? Number(totalPool * 9800n / pool.total_no_pool) / 10000
        : 2.0

    const questionText = getQuestionText(market.question_hash);
    const transactionId = getMarketTransactionId(market.id);
    const registryDescription = getMarketDescription(market.id);
    const registryResolutionSource = getMarketResolutionSource(market.id);
    console.log('Question hash:', market.question_hash);
    console.log('Question text:', questionText);
    console.log('Category:', market.category);
    console.log('Transaction ID:', transactionId);

    return {
        id: market.id,
        question: questionText,
        description: registryDescription || undefined,
        category: market.category,
        deadline: market.deadline,
        resolutionDeadline: market.resolution_deadline,
        status: market.status,
        yesPercentage,
        noPercentage,
        totalVolume: totalPool,
        totalBets: Number(pool.total_bets),
        yesReserve: yesPool,
        noReserve: noPool,
        yesPrice,
        noPrice,
        totalYesIssued: pool.total_yes_pool,
        totalNoIssued: pool.total_no_pool,
        potentialYesPayout,
        potentialNoPayout,
        creator: market.creator,
        timeRemaining,
        resolutionSource: registryResolutionSource || undefined,
        tags: getCategoryTags(market.category),
        transactionId: transactionId || undefined,
        tokenType: TOKEN_SYMBOLS[market.token_type] || 'ALEO',
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

            // Transform to Market format
            const markets: Market[] = await Promise.all(
                blockchainMarkets.map(({ market, pool }) =>
                    transformMarketData(market, pool, currentBlock)
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
                currentBlock
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
                currentBlock
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
