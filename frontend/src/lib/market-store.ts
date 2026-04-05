// ============================================================================
// REAL BLOCKCHAIN MARKET STORE
// ============================================================================
// This store fetches real market data from the deployed veiled_markets_v35.aleo contract
// Markets created via "Create Market" modal will appear here automatically
// ============================================================================

import { create } from 'zustand'
import type { Market } from './store'
import { recordPriceSnapshot } from './price-history'
import {
    fetchAllMarkets,
    getCurrentBlockHeight,
    fetchMarketById,
    getProgramIdForMarket,
    initializeMarketIds,
    getQuestionText,
    getOutcomeLabels,
    getMarketTransactionId,
    getMarketDescription,
    getMarketResolutionSource,
    getMarketThumbnailUrl,
    TOKEN_SYMBOLS,
    isTransientNetworkError,
    type MarketData,
    type AMMPoolData,
    type MarketResolutionData,
} from './aleo-client'
import { calculateAllPrices, type AMMReserves } from './amm'
import { config } from './config'
import { devLog, devWarn } from './logger'
import { fetchBetCountsForMarkets } from './supabase'

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

// Track whether initializeMarketIds has been called
let marketIdsInitialized = false;
let marketIdsInitPromise: Promise<void> | null = null;

async function ensureMarketIdsInitialized(): Promise<void> {
    if (marketIdsInitialized) return;
    if (marketIdsInitPromise) return marketIdsInitPromise;
    // Add a 15-second timeout so the dashboard never hangs indefinitely
    // waiting for market ID initialization (e.g. slow Supabase/indexer).
    marketIdsInitPromise = Promise.race([
        initializeMarketIds(),
        new Promise<void>((resolve) => setTimeout(() => {
            devWarn('[Markets] Market ID initialization timed out after 15s, proceeding with available IDs');
            resolve();
        }, 15_000)),
    ]).then(() => {
        marketIdsInitialized = true;
    });
    return marketIdsInitPromise;
}

// Helper: Transform blockchain data to Market format (v12 AMM)
async function transformMarketData(
    market: MarketData,
    pool: AMMPoolData,
    currentBlock: bigint,
    resolution?: MarketResolutionData,
    marketCredits?: bigint,
    sourceProgramId?: string,
): Promise<Market> {
    const numOutcomes = market.num_outcomes || 2
    const tokenType = (TOKEN_SYMBOLS[market.token_type] || 'ALEO') as 'ALEO' | 'USDCX' | 'USAD'

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
    const outcomePrices = prices.slice(0, numOutcomes)
    const outcomePercentages = outcomePrices.map(price => price * 100)
    const outcomePayouts = outcomePrices.map(price => price > 0 ? 1 / price : numOutcomes)

    // Calculate time remaining
    const blocksRemaining = Number(market.deadline - currentBlock)
    const secondsRemaining = blocksRemaining * config.secondsPerBlock
    const daysRemaining = Math.floor(secondsRemaining / 86400)
    const hoursRemaining = Math.floor((secondsRemaining % 86400) / 3600)
    const minutesRemaining = Math.floor((secondsRemaining % 3600) / 60)
    const secsRemaining = Math.floor(secondsRemaining % 60)

    // Estimated deadline as unix timestamp (ms) for live countdown
    const deadlineTimestamp = blocksRemaining > 0
        ? Date.now() + blocksRemaining * config.msPerBlock
        : 0

    let timeRemaining: string
    if (blocksRemaining <= 0) {
        timeRemaining = 'Ended'
    } else if (daysRemaining > 0) {
        timeRemaining = `${daysRemaining}d ${hoursRemaining}h ${minutesRemaining}m`
    } else if (hoursRemaining > 0) {
        timeRemaining = `${hoursRemaining}h ${minutesRemaining}m ${secsRemaining}s`
    } else if (minutesRemaining > 0) {
        timeRemaining = `${minutesRemaining}m ${secsRemaining}s`
    } else {
        timeRemaining = `${secsRemaining}s`
    }

    // Look up custom outcome labels (saved during market creation), fall back to defaults
    const defaultLabels = numOutcomes === 2
        ? ['Yes', 'No']
        : Array.from({ length: numOutcomes }, (_, i) => `Outcome ${i + 1}`)
    const savedLabels = getOutcomeLabels(market.id) || getOutcomeLabels(market.question_hash)
    const outcomeLabels = (savedLabels && savedLabels.length >= numOutcomes)
        ? savedLabels.slice(0, numOutcomes)
        : defaultLabels

    const questionText = getQuestionText(market.question_hash)
        || getQuestionText(market.id)
        || `Market ${market.id.slice(0, 12)}...`
    const transactionId = getMarketTransactionId(market.id)
    const registryDescription = getMarketDescription(market.id) || getMarketDescription(market.question_hash)
    const registryResolutionSource = getMarketResolutionSource(market.id) || getMarketResolutionSource(market.question_hash)
    const registryThumbnail = getMarketThumbnailUrl(market.id) || getMarketThumbnailUrl(market.question_hash)

    return {
        id: market.id,
        question: questionText,
        description: registryDescription || undefined,
        programId: getProgramIdForMarket(tokenType, sourceProgramId),
        category: market.category,
        numOutcomes,
        outcomeLabels,
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
        outcomePrices,
        outcomePercentages,
        outcomePayouts,

        // Volume & trades
        totalVolume: pool.total_volume,
        totalBets: 0, // v12 tracks volume, not bet count

        // Shares issued (legacy - not tracked separately in v12)
        totalYesIssued: pool.reserve_1,
        totalNoIssued: pool.reserve_2,

        // Resolution / dispute
        challengeDeadline: resolution?.challenge_deadline,
        finalized: resolution?.finalized,

        creator: market.creator,
        resolver: market.resolver,
        timeRemaining,
        deadlineTimestamp: deadlineTimestamp || undefined,
        resolutionSource: registryResolutionSource || undefined,
        tags: getCategoryTags(market.category),
        transactionId: transactionId || undefined,
        tokenType,
        remainingCredits: marketCredits,
        thumbnailUrl: registryThumbnail || undefined,
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
            // Ensure market IDs are loaded (only fetches once)
            await ensureMarketIdsInitialized()

            // Fetch markets and block height in parallel
            const [blockchainMarkets, currentBlock] = await Promise.all([
                fetchAllMarkets(),
                getCurrentBlockHeight().catch(() => {
                    devWarn('[Markets] Block height fetch failed, using 0')
                    return 0n
                }),
            ])

            // Transform to Market format (v12: pass resolution for challenge window)
            const allMarkets: Market[] = await Promise.all(
                blockchainMarkets.map(({ market, pool, resolution, marketCredits, programId }) =>
                    transformMarketData(market, pool, currentBlock, resolution, marketCredits, programId)
                )
            )

            // Keep every distinct on-chain market ID visible. KNOWN_MARKET_IDS is already
            // unique, so collapsing by question/deadline can hide legitimate retry markets.
            const markets = allMarkets

            // Record price snapshots for chart history
            for (const m of markets) {
                const allPrices = calculateAllPrices({
                    reserve_1: m.yesReserve, reserve_2: m.noReserve,
                    reserve_3: m.reserve3, reserve_4: m.reserve4,
                    num_outcomes: m.numOutcomes,
                })
                recordPriceSnapshot(m.id, allPrices)
            }

            // Merge new data into existing markets to preserve object identity
            // where possible, preventing unnecessary React re-renders and flickering.
            const prevMarkets = get().markets
            const prevMap = new Map(prevMarkets.map(m => [m.id, m]))
            const mergedMarkets = markets.map(m => {
                const prev = prevMap.get(m.id)
                if (!prev) return m
                // Check if anything meaningful changed
                if (
                    prev.yesReserve === m.yesReserve &&
                    prev.noReserve === m.noReserve &&
                    prev.totalVolume === m.totalVolume &&
                    prev.totalLiquidity === m.totalLiquidity &&
                    prev.status === m.status &&
                    prev.question === m.question &&
                    prev.timeRemaining === m.timeRemaining
                ) {
                    return prev // keep same reference — no re-render
                }
                return { ...prev, ...m, totalBets: prev.totalBets || m.totalBets }
            })

            set({
                markets: mergedMarkets,
                isLoading: false,
                isRefreshing: false,
                lastFetchTime: Date.now()
            })

            // Hydrate bet counts from Supabase (non-blocking)
            const marketIds = markets.map(m => m.id)
            fetchBetCountsForMarkets(marketIds).then(counts => {
                if (Object.keys(counts).length === 0) return
                set(state => ({
                    markets: state.markets.map(m => ({
                        ...m,
                        totalBets: counts[m.id] ?? m.totalBets,
                    }))
                }))
            })
        } catch (error) {
            if (isTransientNetworkError(error)) {
                devWarn('[Markets] Transient network change while fetching markets')
            } else {
                console.error('Failed to fetch markets:', error)
            }
            // On error during refresh, keep existing markets visible
            set((state) => ({
                error: isTransientNetworkError(error)
                    ? null
                    : (error instanceof Error ? error.message : 'Failed to fetch markets'),
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
                marketData.marketCredits,
                marketData.programId,
            )

            set((state) => ({
                markets: [market, ...state.markets]
            }))

            devLog('✅ Market added to store:', marketId)
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
                marketData.marketCredits,
                marketData.programId,
            )

            // Record price snapshot for chart
            const allPrices = calculateAllPrices({
                reserve_1: updatedMarket.yesReserve, reserve_2: updatedMarket.noReserve,
                reserve_3: updatedMarket.reserve3, reserve_4: updatedMarket.reserve4,
                num_outcomes: updatedMarket.numOutcomes,
            })
            recordPriceSnapshot(marketId, allPrices)

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
