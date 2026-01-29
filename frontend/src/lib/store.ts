import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  walletManager,
  type WalletType,
  type NetworkType,
  type WalletAccount,
  type WalletBalance,
} from './wallet'
import {
  buildPlaceBetInputs,
  CONTRACT_INFO,
} from './aleo-client'
import { config } from './config'

// Re-export for use in components
export { CONTRACT_INFO } from './aleo-client'

// ============================================================================
// Types
// ============================================================================

export interface Market {
  id: string
  question: string
  description?: string
  category: number
  deadline: bigint
  resolutionDeadline: bigint
  status: number // 1 = active, 2 = resolved_yes, 3 = resolved_no, 4 = cancelled

  // AMM Pool Data
  yesReserve: bigint
  noReserve: bigint
  yesPrice: number      // Current YES price (0-1)
  noPrice: number       // Current NO price (0-1)

  // Legacy fields (for backward compatibility)
  yesPercentage: number
  noPercentage: number
  totalVolume: bigint
  totalBets: number

  // Issued shares
  totalYesIssued: bigint
  totalNoIssued: bigint

  // Payout calculations
  potentialYesPayout: number
  potentialNoPayout: number

  creator?: string
  timeRemaining?: string
  resolutionSource?: string
  tags?: string[]
  transactionId?: string // Creation transaction ID for verification
}

export interface SharePosition {
  id: string
  marketId: string
  shareType: 'yes' | 'no'
  quantity: bigint
  avgPrice: number
  currentValue: number
  profitLoss: number
  profitLossPercent: number
  acquiredAt: number
}

export interface Bet {
  id: string
  marketId: string
  amount: bigint
  outcome: 'yes' | 'no'
  placedAt: number
  status: 'pending' | 'active' | 'won' | 'lost' | 'refunded'
  marketQuestion?: string
}

export interface WalletState {
  connected: boolean
  connecting: boolean
  address: string | null
  network: NetworkType
  balance: WalletBalance
  walletType: WalletType | null
  isDemoMode: boolean
}

// ============================================================================
// Wallet Store
// ============================================================================

interface WalletStore {
  wallet: WalletState
  error: string | null

  // Actions
  connect: (walletType: WalletType) => Promise<void>
  disconnect: () => Promise<void>
  refreshBalance: () => Promise<void>
  clearError: () => void
}

const initialWalletState: WalletState = {
  connected: false,
  connecting: false,
  address: null,
  network: 'testnet',
  balance: { public: 0n, private: 0n },
  walletType: null,
  isDemoMode: false,
}

export const useWalletStore = create<WalletStore>((set, get) => ({
  wallet: initialWalletState,
  error: null,

  connect: async (walletType: WalletType) => {
    set({
      wallet: { ...get().wallet, connecting: true },
      error: null,
    })

    try {
      const account = await walletManager.connect(walletType)
      const balance = await walletManager.getBalance()

      set({
        wallet: {
          connected: true,
          connecting: false,
          address: account.address,
          network: account.network,
          balance,
          walletType,
          isDemoMode: walletManager.isDemoMode(),
        },
        error: null,
      })

      // Set up event listeners for real wallets
      if (!walletManager.isDemoMode()) {
        walletManager.onAccountChange((newAccount: WalletAccount | null) => {
          if (newAccount) {
            set({
              wallet: {
                ...get().wallet,
                address: newAccount.address,
                network: newAccount.network,
              },
            })
          } else {
            // Account disconnected
            get().disconnect()
          }
        })

        walletManager.onNetworkChange((network: NetworkType) => {
          set({
            wallet: {
              ...get().wallet,
              network,
            },
          })
        })
      }
    } catch (error: unknown) {
      console.error('Store connect error:', error)

      // Extract error message from various formats
      let errorMessage = 'Failed to connect wallet'

      if (error instanceof Error) {
        errorMessage = error.message
      } else if (typeof error === 'string') {
        errorMessage = error
      } else if (error && typeof error === 'object') {
        const errObj = error as Record<string, unknown>
        if (typeof errObj.message === 'string') {
          errorMessage = errObj.message
        }
      }

      set({
        wallet: { ...initialWalletState },
        error: errorMessage,
      })
      throw new Error(errorMessage)
    }
  },

  disconnect: async () => {
    try {
      await walletManager.disconnect()
    } catch (error) {
      console.error('Disconnect error:', error)
    }
    set({
      wallet: initialWalletState,
      error: null,
    })
  },

  refreshBalance: async () => {
    if (!get().wallet.connected) {
      console.log('refreshBalance: Wallet not connected, skipping')
      return
    }

    try {
      console.log('=== REFRESHING BALANCE ===')
      console.log('Current balance:', {
        public: get().wallet.balance.public.toString(),
        private: get().wallet.balance.private.toString(),
      })

      const balance = await walletManager.getBalance()

      console.log('New balance:', {
        public: balance.public.toString(),
        private: balance.private.toString(),
      })

      const oldTotal = get().wallet.balance.public + get().wallet.balance.private
      const newTotal = balance.public + balance.private

      if (oldTotal !== newTotal) {
        console.log('✅ Balance changed!')
        console.log('Old total:', oldTotal.toString())
        console.log('New total:', newTotal.toString())
        console.log('Difference:', (newTotal - oldTotal).toString())
      } else {
        console.log('⚠️ Balance unchanged')
      }

      set({
        wallet: {
          ...get().wallet,
          balance,
        },
      })
    } catch (error) {
      console.error('Failed to refresh balance:', error)
    }
  },

  clearError: () => {
    set({ error: null })
  },
}))

// ============================================================================
// Markets Store
// ============================================================================

interface MarketsStore {
  markets: Market[]
  selectedMarket: Market | null
  isLoading: boolean
  searchQuery: string
  selectedCategory: number | null
  viewMode: 'grid' | 'list'

  // Actions
  fetchMarkets: () => Promise<void>
  selectMarket: (market: Market | null) => void
  setSearchQuery: (query: string) => void
  setCategory: (category: number | null) => void
  setViewMode: (mode: 'grid' | 'list') => void
  getFilteredMarkets: () => Market[]
}

// Categories: 1=Politics, 2=Sports, 3=Crypto, 4=Entertainment, 5=Tech, 6=Economics, 7=Science

// Helper to calculate AMM fields from percentages
const calculateAMMFields = (yesPercentage: number, totalVolume: bigint) => {
  const yesPrice = yesPercentage / 100
  const noPrice = 1 - yesPrice

  // Calculate reserves based on constant product formula
  // For simplicity: yesReserve * noReserve = k
  // yesPrice = noReserve / (yesReserve + noReserve)
  const totalLiquidity = Number(totalVolume) * 2 // Approximate total liquidity
  const yesReserve = BigInt(Math.floor(totalLiquidity * noPrice))
  const noReserve = BigInt(Math.floor(totalLiquidity * yesPrice))

  return {
    yesReserve,
    noReserve,
    yesPrice,
    noPrice,
    totalYesIssued: BigInt(Math.floor(Number(totalVolume) * yesPrice)),
    totalNoIssued: BigInt(Math.floor(Number(totalVolume) * noPrice)),
  }
}

// ============================================================================
// MOCK DATA FOR DEMONSTRATION
// ============================================================================
// These markets are for UI demonstration only and are NOT on-chain.
// Real markets created via the "Create Market" modal will be stored on-chain
// in the veiled_markets_v2.aleo program.
//
// TODO: Replace with real blockchain data once indexer is available
// An indexer service will track market creation events and provide a list
// of all market IDs that can be queried from the blockchain.
// ============================================================================

const mockMarkets: Market[] = [
  // === CRYPTO MARKETS ===
  {
    id: 'market_001',
    question: 'Will Bitcoin reach $150,000 by end of Q1 2026?',
    description: 'This market resolves YES if the price of Bitcoin (BTC) reaches or exceeds $150,000 USD on any major exchange (Coinbase, Binance, Kraken) before March 31, 2026 11:59 PM UTC.',
    category: 3,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 65 * 24 * 60 * 60),
    resolutionDeadline: BigInt(Math.floor(Date.now() / 1000) + 68 * 24 * 60 * 60),
    status: 1,
    yesPercentage: 62.5,
    noPercentage: 37.5,
    totalVolume: 2500000000n, // 2500 ALEO
    totalBets: 342,
    ...calculateAMMFields(62.5, 2500000000n),
    potentialYesPayout: 1.60,
    potentialNoPayout: 2.67,
    creator: 'aleo1rhgdu77hgyqd3xjj8ucu3jj9r2krwz6mnzyd80gncr5fxcwlh5rsvzp9px',
    timeRemaining: '65d',
    resolutionSource: 'CoinGecko API',
    tags: ['Bitcoin', 'Price Prediction', 'Hot'],
  },
  {
    id: 'market_002',
    question: 'Will Ethereum flip Bitcoin in market cap by 2027?',
    description: 'Resolves YES if Ethereum market capitalization exceeds Bitcoin market cap at any point before January 1, 2027.',
    category: 3,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60),
    resolutionDeadline: BigInt(Math.floor(Date.now() / 1000) + 370 * 24 * 60 * 60),
    status: 1,
    yesPercentage: 18.2,
    noPercentage: 81.8,
    totalVolume: 1800000000n,
    totalBets: 567,
    ...calculateAMMFields(18.2, 1800000000n),
    potentialYesPayout: 5.49,
    potentialNoPayout: 1.22,
    creator: 'aleo1rhgdu77hgyqd3xjj8ucu3jj9r2krwz6mnzyd80gncr5fxcwlh5rsvzp9px',
    timeRemaining: '365d',
    resolutionSource: 'CoinMarketCap',
    tags: ['Ethereum', 'Bitcoin', 'Flippening'],
  },
  {
    id: 'market_003',
    question: 'Will Solana reach $500 before ETH reaches $10,000?',
    description: 'Race market: Resolves YES if SOL reaches $500 first, NO if ETH reaches $10,000 first. If neither happens by end of 2026, resolves NO.',
    category: 3,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 340 * 24 * 60 * 60),
    resolutionDeadline: BigInt(Math.floor(Date.now() / 1000) + 345 * 24 * 60 * 60),
    status: 1,
    yesPercentage: 45.3,
    noPercentage: 54.7,
    totalVolume: 980000000n,
    totalBets: 234,
    ...calculateAMMFields(45.3, 980000000n),
    potentialYesPayout: 2.21,
    potentialNoPayout: 1.83,
    creator: 'aleo1rhgdu77hgyqd3xjj8ucu3jj9r2krwz6mnzyd80gncr5fxcwlh5rsvzp9px',
    timeRemaining: '340d',
    resolutionSource: 'CoinGecko API',
    tags: ['Solana', 'Ethereum', 'Race'],
  },
  {
    id: 'market_004',
    question: 'Will Aleo token price exceed $1 by June 2026?',
    description: 'Resolves YES if ALEO token trades above $1.00 USD on any major exchange before June 30, 2026.',
    category: 3,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 155 * 24 * 60 * 60),
    resolutionDeadline: BigInt(Math.floor(Date.now() / 1000) + 160 * 24 * 60 * 60),
    status: 1,
    yesPercentage: 71.8,
    noPercentage: 28.2,
    totalVolume: 3200000000n,
    totalBets: 892,
    ...calculateAMMFields(71.8, 3200000000n),
    potentialYesPayout: 1.39,
    potentialNoPayout: 3.55,
    creator: 'aleo1rhgdu77hgyqd3xjj8ucu3jj9r2krwz6mnzyd80gncr5fxcwlh5rsvzp9px',
    timeRemaining: '155d',
    resolutionSource: 'CoinGecko API',
    tags: ['Aleo', 'Price', 'Featured'],
  },
  // === ECONOMICS MARKETS ===
  {
    id: 'market_005',
    question: 'Will the Fed cut interest rates in February 2026?',
    description: 'Resolves YES if the Federal Reserve announces a rate cut at the FOMC meeting in February 2026.',
    category: 6,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 14 * 24 * 60 * 60),
    resolutionDeadline: BigInt(Math.floor(Date.now() / 1000) + 16 * 24 * 60 * 60),
    status: 1,
    yesPercentage: 36.3,
    noPercentage: 63.7,
    totalVolume: 1450000000n,
    totalBets: 423,
    ...calculateAMMFields(36.3, 1450000000n),
    potentialYesPayout: 2.75,
    potentialNoPayout: 1.57,
    creator: 'aleo1rhgdu77hgyqd3xjj8ucu3jj9r2krwz6mnzyd80gncr5fxcwlh5rsvzp9px',
    timeRemaining: '14d',
    resolutionSource: 'Federal Reserve',
    tags: ['Fed', 'Interest Rates', 'Ending Soon'],
  },
  {
    id: 'market_006',
    question: 'Will US inflation drop below 2% by Q2 2026?',
    description: 'Resolves YES if the official US CPI year-over-year inflation rate drops below 2.0% in any month of Q2 2026.',
    category: 6,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 120 * 24 * 60 * 60),
    resolutionDeadline: BigInt(Math.floor(Date.now() / 1000) + 125 * 24 * 60 * 60),
    status: 1,
    yesPercentage: 42.1,
    noPercentage: 57.9,
    totalVolume: 890000000n,
    totalBets: 312,
    ...calculateAMMFields(42.1, 890000000n),
    potentialYesPayout: 2.38,
    potentialNoPayout: 1.73,
    creator: 'aleo1rhgdu77hgyqd3xjj8ucu3jj9r2krwz6mnzyd80gncr5fxcwlh5rsvzp9px',
    timeRemaining: '120d',
    resolutionSource: 'Bureau of Labor Statistics',
    tags: ['Inflation', 'Economy'],
  },
  // === TECH MARKETS ===
  {
    id: 'market_007',
    question: 'Will Apple announce Apple Intelligence 2.0 at WWDC 2026?',
    description: 'Resolves YES if Apple announces a major update to Apple Intelligence branded as "2.0" or equivalent at WWDC 2026.',
    category: 5,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 135 * 24 * 60 * 60),
    resolutionDeadline: BigInt(Math.floor(Date.now() / 1000) + 140 * 24 * 60 * 60),
    status: 1,
    yesPercentage: 72.4,
    noPercentage: 27.6,
    totalVolume: 1230000000n,
    totalBets: 456,
    ...calculateAMMFields(72.4, 1230000000n),
    potentialYesPayout: 1.38,
    potentialNoPayout: 3.62,
    creator: 'aleo1rhgdu77hgyqd3xjj8ucu3jj9r2krwz6mnzyd80gncr5fxcwlh5rsvzp9px',
    timeRemaining: '135d',
    resolutionSource: 'Apple Official Announcement',
    tags: ['Apple', 'AI', 'WWDC'],
  },
  {
    id: 'market_008',
    question: 'Will OpenAI release GPT-5 before July 2026?',
    description: 'Resolves YES if OpenAI publicly releases or announces GPT-5 (or equivalent next-gen model) before July 1, 2026.',
    category: 5,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 160 * 24 * 60 * 60),
    resolutionDeadline: BigInt(Math.floor(Date.now() / 1000) + 165 * 24 * 60 * 60),
    status: 1,
    yesPercentage: 58.9,
    noPercentage: 41.1,
    totalVolume: 2100000000n,
    totalBets: 678,
    ...calculateAMMFields(58.9, 2100000000n),
    potentialYesPayout: 1.70,
    potentialNoPayout: 2.43,
    creator: 'aleo1rhgdu77hgyqd3xjj8ucu3jj9r2krwz6mnzyd80gncr5fxcwlh5rsvzp9px',
    timeRemaining: '160d',
    resolutionSource: 'OpenAI Official',
    tags: ['OpenAI', 'GPT-5', 'AI'],
  },
  // === SPORTS MARKETS ===
  {
    id: 'market_009',
    question: 'Will Real Madrid win Champions League 2026?',
    description: 'Resolves YES if Real Madrid CF wins the UEFA Champions League 2025-26 season.',
    category: 2,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 120 * 24 * 60 * 60),
    resolutionDeadline: BigInt(Math.floor(Date.now() / 1000) + 122 * 24 * 60 * 60),
    status: 1,
    yesPercentage: 28.5,
    noPercentage: 71.5,
    totalVolume: 1560000000n,
    totalBets: 534,
    ...calculateAMMFields(28.5, 1560000000n),
    potentialYesPayout: 3.51,
    potentialNoPayout: 1.40,
    creator: 'aleo1rhgdu77hgyqd3xjj8ucu3jj9r2krwz6mnzyd80gncr5fxcwlh5rsvzp9px',
    timeRemaining: '120d',
    resolutionSource: 'UEFA Official',
    tags: ['Champions League', 'Real Madrid', 'Football'],
  },
  {
    id: 'market_010',
    question: 'Will the Super Bowl 2026 have over 110M US viewers?',
    description: 'Resolves YES if official Nielsen ratings show over 110 million US viewers for Super Bowl LX.',
    category: 2,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 20 * 24 * 60 * 60),
    resolutionDeadline: BigInt(Math.floor(Date.now() / 1000) + 25 * 24 * 60 * 60),
    status: 1,
    yesPercentage: 67.2,
    noPercentage: 32.8,
    totalVolume: 780000000n,
    totalBets: 289,
    ...calculateAMMFields(67.2, 780000000n),
    potentialYesPayout: 1.49,
    potentialNoPayout: 3.05,
    creator: 'aleo1rhgdu77hgyqd3xjj8ucu3jj9r2krwz6mnzyd80gncr5fxcwlh5rsvzp9px',
    timeRemaining: '20d',
    resolutionSource: 'Nielsen Ratings',
    tags: ['Super Bowl', 'NFL', 'Trending'],
  },
  // === POLITICS MARKETS ===
  {
    id: 'market_011',
    question: 'Will a new crypto regulation bill pass US Congress in 2026?',
    description: 'Resolves YES if any comprehensive cryptocurrency regulation bill is signed into law in the US during 2026.',
    category: 1,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 340 * 24 * 60 * 60),
    resolutionDeadline: BigInt(Math.floor(Date.now() / 1000) + 345 * 24 * 60 * 60),
    status: 1,
    yesPercentage: 45.8,
    noPercentage: 54.2,
    totalVolume: 920000000n,
    totalBets: 367,
    ...calculateAMMFields(45.8, 920000000n),
    potentialYesPayout: 2.18,
    potentialNoPayout: 1.85,
    creator: 'aleo1rhgdu77hgyqd3xjj8ucu3jj9r2krwz6mnzyd80gncr5fxcwlh5rsvzp9px',
    timeRemaining: '340d',
    resolutionSource: 'US Congress Records',
    tags: ['Regulation', 'Crypto', 'Politics'],
  },
  // === ENDING SOON ===
  {
    id: 'market_012',
    question: 'Will ETH close above $4,000 this week?',
    description: 'Resolves YES if Ethereum (ETH) price is above $4,000 at Sunday 11:59 PM UTC.',
    category: 3,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 3 * 24 * 60 * 60),
    resolutionDeadline: BigInt(Math.floor(Date.now() / 1000) + 4 * 24 * 60 * 60),
    status: 1,
    yesPercentage: 52.3,
    noPercentage: 47.7,
    totalVolume: 650000000n,
    totalBets: 198,
    ...calculateAMMFields(52.3, 650000000n),
    potentialYesPayout: 1.91,
    potentialNoPayout: 2.10,
    creator: 'aleo1rhgdu77hgyqd3xjj8ucu3jj9r2krwz6mnzyd80gncr5fxcwlh5rsvzp9px',
    timeRemaining: '3d',
    resolutionSource: 'CoinGecko API',
    tags: ['Ethereum', 'Weekly', 'Ending Soon'],
  },
]

export const useMarketsStore = create<MarketsStore>((set, get) => ({
  markets: [],
  selectedMarket: null,
  isLoading: false,
  searchQuery: '',
  selectedCategory: null,
  viewMode: 'grid',

  fetchMarkets: async () => {
    set({ isLoading: true })
    try {
      // TODO: Implement real blockchain data fetching
      // For now, we'll use mock data until we have an indexer or can query the chain
      // In production, this would:
      // 1. Query all market IDs from an indexer
      // 2. Fetch each market's data from the blockchain
      // 3. Fetch pool data for each market
      // 4. Transform to Market format

      // Temporary: Use mock data for demo
      await new Promise(resolve => setTimeout(resolve, 800))
      set({ markets: mockMarkets, isLoading: false })
    } catch (error) {
      console.error('Failed to fetch markets:', error)
      set({ markets: [], isLoading: false })
    }
  },

  selectMarket: (market) => {
    set({ selectedMarket: market })
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query })
  },

  setCategory: (category) => {
    set({ selectedCategory: category })
  },

  setViewMode: (mode) => {
    set({ viewMode: mode })
  },

  getFilteredMarkets: () => {
    const { markets, searchQuery, selectedCategory } = get()

    return markets.filter(market => {
      // Filter by search query
      if (searchQuery && !market.question.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false
      }
      // Filter by category
      if (selectedCategory !== null && market.category !== selectedCategory) {
        return false
      }
      return true
    })
  },
}))

// ============================================================================
// Bets Store
// ============================================================================

interface BetsStore {
  userBets: Bet[]
  pendingBets: Bet[]
  isPlacingBet: boolean

  // Actions
  placeBet: (marketId: string, amount: bigint, outcome: 'yes' | 'no') => Promise<string>
  fetchUserBets: () => Promise<void>
  getBetsByMarket: (marketId: string) => Bet[]
  getTotalBetsValue: () => bigint
}

// Helper to load bets from localStorage
function loadBetsFromStorage(): Bet[] {
  if (typeof window === 'undefined') return []
  try {
    const saved = localStorage.getItem('veiled_markets_user_bets')
    if (!saved) return []
    const parsed = JSON.parse(saved)
    // Convert amount strings back to BigInt
    return parsed.map((bet: any) => ({
      ...bet,
      amount: BigInt(bet.amount),
    }))
  } catch (e) {
    console.error('Failed to load bets from storage:', e)
    return []
  }
}

// Helper to save bets to localStorage
function saveBetsToStorage(bets: Bet[]) {
  if (typeof window === 'undefined') return
  try {
    // Convert BigInt to string for JSON serialization
    const serializable = bets.map(bet => ({
      ...bet,
      amount: bet.amount.toString(),
    }))
    localStorage.setItem('veiled_markets_user_bets', JSON.stringify(serializable))
  } catch (e) {
    console.error('Failed to save bets to storage:', e)
  }
}

export const useBetsStore = create<BetsStore>((set, get) => ({
  userBets: loadBetsFromStorage(),
  pendingBets: [],
  isPlacingBet: false,

  placeBet: async (marketId, amount, outcome) => {
    const walletState = useWalletStore.getState().wallet

    if (!walletState.connected) {
      throw new Error('Wallet not connected')
    }

    if (!walletState.address) {
      throw new Error('Wallet address not available')
    }

    set({ isPlacingBet: true })

    try {
      // Build inputs for the deployed veiled_markets_v2.aleo contract
      // place_bet(market_id: field, amount: u64, outcome: u8, bettor: address)
      const inputs = buildPlaceBetInputs(
        marketId,
        amount,
        outcome,
        walletState.address
      )

      console.log('=== PLACE BET DEBUG ===')
      console.log('Market ID:', marketId)
      console.log('Amount:', amount.toString())
      console.log('Outcome:', outcome)
      console.log('Bettor:', walletState.address)
      console.log('Inputs:', inputs)
      console.log('Inputs types:', inputs.map(i => typeof i))
      console.log('Program ID:', CONTRACT_INFO.programId)
      console.log('Wallet type:', walletState.walletType)

      // Validate inputs
      for (let i = 0; i < inputs.length; i++) {
        if (typeof inputs[i] !== 'string') {
          throw new Error(`Input ${i} is not a string: ${typeof inputs[i]}`)
        }
        if (!inputs[i]) {
          throw new Error(`Input ${i} is empty`)
        }
      }

      console.log('Inputs validated, requesting transaction...')

      // Request transaction through wallet
      const transactionId = await walletManager.requestTransaction({
        programId: CONTRACT_INFO.programId,
        functionName: 'place_bet',
        inputs,
        fee: 500000, // 0.5 credits fee for testnet
      })

      console.log('Bet transaction submitted:', transactionId)

      // Immediately refresh balance (optimistic update)
      console.log('Refreshing balance immediately after bet...')
      setTimeout(() => {
        useWalletStore.getState().refreshBalance()
      }, 1000)

      // Add to pending bets
      const newBet: Bet = {
        id: transactionId,
        marketId,
        amount,
        outcome,
        placedAt: Date.now(),
        status: 'pending',
      }

      set({
        pendingBets: [...get().pendingBets, newBet],
        isPlacingBet: false,
      })

      // Refresh balance multiple times to catch the update
      const refreshIntervals = [3000, 5000, 10000, 15000, 30000]
      refreshIntervals.forEach(delay => {
        setTimeout(() => {
          console.log(`Refreshing balance after ${delay}ms...`)
          useWalletStore.getState().refreshBalance()
        }, delay)
      })

      // Poll for transaction confirmation
      // In production, use WebSocket or more sophisticated polling
      const pollInterval = setInterval(async () => {
        try {
          const response = await fetch(
            `${config.rpcUrl}/transaction/${transactionId}`
          )
          if (response.ok) {
            clearInterval(pollInterval)
            const activeBet = { ...newBet, status: 'active' as const }
            const updatedBets = [...get().userBets, activeBet]
            set({
              pendingBets: get().pendingBets.filter(b => b.id !== transactionId),
              userBets: updatedBets,
            })
            saveBetsToStorage(updatedBets)
            // Final refresh after confirmation
            console.log('Transaction confirmed, final balance refresh...')
            useWalletStore.getState().refreshBalance()
          }
        } catch {
          // Transaction not confirmed yet, continue polling
        }
      }, 5000)

      // Timeout after 2 minutes
      setTimeout(() => {
        clearInterval(pollInterval)
        // If still pending after timeout, mark as active (optimistic)
        const stillPending = get().pendingBets.find(b => b.id === transactionId)
        if (stillPending) {
          const activeBet = { ...newBet, status: 'active' as const }
          const updatedBets = [...get().userBets, activeBet]
          set({
            pendingBets: get().pendingBets.filter(b => b.id !== transactionId),
            userBets: updatedBets,
          })
          saveBetsToStorage(updatedBets)
        }
      }, 120000)

      return transactionId
    } catch (error: any) {
      console.error('Place bet error:', error)
      set({ isPlacingBet: false })
      throw error
    }
  },

  fetchUserBets: async () => {
    const walletState = useWalletStore.getState().wallet

    if (!walletState.connected) return

    try {
      // First, load from localStorage (our local cache)
      const localBets = loadBetsFromStorage()

      // Try to fetch from wallet records (may not work with all wallets)
      const records = await walletManager.getRecords('veiled_markets_v2.aleo')

      // Parse bet records from wallet
      const walletBets: Bet[] = records
        .filter((r: any) => r.type === 'Bet')
        .map((r: any) => ({
          id: r.id,
          marketId: r.data.market_id,
          amount: BigInt(r.data.amount),
          outcome: r.data.outcome === '1u8' ? 'yes' : 'no',
          placedAt: parseInt(r.data.placed_at),
          status: 'active' as const,
        }))

      // Merge: use wallet bets if available, otherwise use local cache
      // Also merge to avoid duplicates (by id)
      const existingIds = new Set(walletBets.map(b => b.id))
      const mergedBets = [
        ...walletBets,
        ...localBets.filter(b => !existingIds.has(b.id))
      ]

      set({ userBets: mergedBets })

      // Update localStorage with merged data
      if (mergedBets.length > 0) {
        saveBetsToStorage(mergedBets)
      }
    } catch (error) {
      console.error('Failed to fetch user bets from wallet:', error)
      // On error, still use localStorage cache
      const localBets = loadBetsFromStorage()
      if (localBets.length > 0) {
        set({ userBets: localBets })
      }
    }
  },

  getBetsByMarket: (marketId) => {
    return get().userBets.filter(bet => bet.marketId === marketId)
  },

  getTotalBetsValue: () => {
    return get().userBets.reduce((total, bet) => total + bet.amount, 0n)
  },
}))

// ============================================================================
// UI Store (for persistent preferences)
// ============================================================================

interface UIStore {
  theme: 'dark' | 'light'
  sidebarOpen: boolean
  notificationsEnabled: boolean

  // Actions
  setTheme: (theme: 'dark' | 'light') => void
  toggleSidebar: () => void
  setNotificationsEnabled: (enabled: boolean) => void
}

export const useUIStore = create<UIStore>()(
  persist(
    (set: (partial: Partial<UIStore>) => void, get: () => UIStore) => ({
      theme: 'dark' as const,
      sidebarOpen: true,
      notificationsEnabled: true,

      setTheme: (theme: 'light' | 'dark') => set({ theme }),
      toggleSidebar: () => set({ sidebarOpen: !get().sidebarOpen }),
      setNotificationsEnabled: (enabled: boolean) => set({ notificationsEnabled: enabled }),
    }),
    {
      name: 'veiled-markets-ui',
    }
  )
)

// ============================================================================
// Category Labels
// ============================================================================

export const CATEGORY_LABELS: Record<number, string> = {
  1: 'Politics',
  2: 'Sports',
  3: 'Crypto',
  4: 'Entertainment',
  5: 'Science & Tech',
  6: 'Economics',
  99: 'Other',
}

export const CATEGORY_ICONS: Record<number, string> = {
  1: '🏛️',
  2: '⚽',
  3: '₿',
  4: '🎬',
  5: '🔬',
  6: '📈',
  99: '🔮',
}
