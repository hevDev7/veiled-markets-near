import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  walletManager,
  fetchPublicBalance,
  fetchUsdcxPublicBalance,
  type WalletType,
  type NetworkType,
  type WalletAccount,
  type WalletBalance,
} from './wallet'
import {
  buildBuySharesInputs,
  CONTRACT_INFO,
  getMarket,
  getMarketResolution,
  getMarketPool,
} from './aleo-client'
import { config } from './config'
import {
  isSupabaseAvailable, fetchBets as sbFetchBets, upsertBets as sbUpsertBets,
  fetchPendingBets as sbFetchPendingBets, upsertPendingBets as sbUpsertPendingBets,
  removePendingBet as sbRemovePendingBet,
  fetchCommitments as sbFetchCommitments, upsertCommitments as sbUpsertCommitments,
} from './supabase'

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
  numOutcomes: number        // v12: 2, 3, or 4
  outcomeLabels: string[]    // v12: labels for each outcome
  deadline: bigint
  resolutionDeadline: bigint
  status: number // 1=active, 2=closed, 3=resolved, 4=cancelled, 5=pending_resolution

  // AMM Pool Data (v12 - multi-outcome reserves)
  yesReserve: bigint         // reserve_1
  noReserve: bigint          // reserve_2
  reserve3: bigint           // reserve_3 (0 if binary)
  reserve4: bigint           // reserve_4 (0 if binary)
  totalLiquidity: bigint     // Total tokens in pool
  totalLPShares: bigint      // LP tokens in circulation

  yesPrice: number           // Outcome 1 price (0-1)
  noPrice: number            // Outcome 2 price (0-1)

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

  // v12: Resolution with challenge window
  challengeDeadline?: bigint
  finalized?: boolean

  creator?: string
  timeRemaining?: string
  resolutionSource?: string
  tags?: string[]
  transactionId?: string
  tokenType?: 'ALEO' | 'USDCX'
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
  lockedMultiplier?: number    // Payout multiplier locked at time of bet
  sharesReceived?: bigint      // Shares received from buy (v14 FPMM)
  payoutAmount?: bigint        // Calculated payout when market resolves (won bets)
  winningOutcome?: 'yes' | 'no' // From resolution data
  claimed?: boolean            // Whether user has claimed winnings/refund
  tokenType?: 'ALEO' | 'USDCX' // v12: token denomination
}

// Phase 2: Commit-Reveal Scheme Records (SDK-based)
export interface CommitmentRecord {
  id: string                        // crypto.randomUUID()
  marketId: string
  amount: bigint
  outcome: 'yes' | 'no'
  commitmentHash: string            // BHP256 hash (stored on-chain)
  userNonce: string                 // field value
  bettor: string                    // address
  betAmountRecordPlaintext: string  // decrypted credits record for reveal
  commitTxId: string
  committedAt: number               // local timestamp
  revealed: boolean
  revealTxId?: string
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
  shieldCredits: (amount: bigint) => Promise<string>
  testTransaction: () => Promise<string>
  clearError: () => void
}

const initialWalletState: WalletState = {
  connected: false,
  connecting: false,
  address: null,
  network: 'testnet',
  balance: { public: 0n, private: 0n, usdcxPublic: 0n },
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
    const { wallet } = get()
    if (!wallet.connected || !wallet.address) {
      return
    }

    try {
      // Fetch public balance directly from Aleo RPC
      const publicBalance = await fetchPublicBalance(wallet.address)

      // Try to get private balance from credits records
      let privateBalance = 0n

      // Helper: parse microcredits from various record text formats
      const parseMicrocredits = (text: string): bigint => {
        // Try patterns: microcredits: 1000000u64, "microcredits": "1000000u64", microcredits: 1000000
        const patterns = [
          /microcredits["\s:]+(\d+)u64/,
          /microcredits["\s:]+(\d+)/,
          /"microcredits"\s*:\s*"?(\d+)/,
        ]
        for (const pattern of patterns) {
          const match = text.match(pattern)
          if (match) return BigInt(match[1])
        }
        return 0n
      }

      // Helper: check if record is spent
      const isRecordSpent = (record: any): boolean => {
        if (typeof record === 'object' && record !== null) {
          if (record.spent === true || record.is_spent === true) return true
          if (record.spent === 'true' || record.is_spent === 'true') return true
        }
        return false
      }

      // Determine connected wallet type for prioritized detection
      const connectedType = wallet.walletType
      console.log('[Balance] Connected wallet type:', connectedType)

      // Helper: extract private balance from records array
      const sumRecordsBalance = (records: any[], label: string): bigint => {
        let sum = 0n
        const recordsArr = Array.isArray(records) ? records : ((records as any)?.records || [])
        if (recordsArr.length === 0) {
          console.log(`[Balance] ${label}: 0 records returned`)
          return 0n
        }
        console.log(`[Balance] ${label}: ${recordsArr.length} records returned`)
        for (let i = 0; i < recordsArr.length; i++) {
          const record = recordsArr[i]
          if (isRecordSpent(record)) {
            console.log(`[Balance] ${label} record ${i}: SPENT, skipping`)
            continue
          }
          const text = typeof record === 'string'
            ? record
            : ((record as any)?.plaintext || (record as any)?.data || JSON.stringify(record))
          const mc = parseMicrocredits(String(text))
          if (mc > 0n) {
            console.log(`[Balance] ${label} record ${i}: ${Number(mc) / 1_000_000} ALEO`)
          }
          sum += mc
        }
        return sum
      }

      // Method 1: Provider adapter's requestRecords (from WalletBridge)
      if ((window as any).__aleoRequestRecords) {
        try {
          console.log('[Balance] Method 1: adapter requestRecords(credits.aleo, true)...')
          const records = await (window as any).__aleoRequestRecords('credits.aleo', true)
          privateBalance = sumRecordsBalance(records, 'M1-plaintext')
        } catch (err) {
          console.log('[Balance] Method 1 plaintext failed:', err)
        }

        // Try without plaintext flag
        if (privateBalance === 0n) {
          try {
            console.log('[Balance] Method 1b: adapter requestRecords(credits.aleo, false)...')
            const records = await (window as any).__aleoRequestRecords('credits.aleo', false)
            const recordsArr = Array.isArray(records) ? records : ((records as any)?.records || [])
            if (recordsArr.length > 0) {
              console.log('[Balance] Method 1b: Got', recordsArr.length, 'encrypted records, trying decrypt...')
              const decryptFn = (window as any).__aleoDecrypt
              for (let i = 0; i < recordsArr.length; i++) {
                const record = recordsArr[i]
                if (isRecordSpent(record)) continue
                let recordMc = 0n
                const ciphertext = (record as any)?.ciphertext || (record as any)?.record_ciphertext || (record as any)?.data
                if (ciphertext && decryptFn) {
                  try {
                    const decrypted = await decryptFn(String(ciphertext))
                    recordMc = parseMicrocredits(String(decrypted))
                  } catch { /* decrypt failed */ }
                }
                if (recordMc === 0n) {
                  const text = typeof record === 'string' ? record : JSON.stringify(record)
                  recordMc = parseMicrocredits(text)
                }
                if (recordMc > 0n) {
                  console.log(`[Balance] M1b record ${i} decrypted: ${Number(recordMc) / 1_000_000} ALEO`)
                }
                privateBalance += recordMc
              }
            }
          } catch (err) {
            console.log('[Balance] Method 1b failed:', err)
          }
        }
      }

      // Method 2: Direct wallet window object - prioritize connected wallet
      if (privateBalance === 0n) {
        // Build ordered list of wallet objects to try, connected wallet first
        const walletCandidates: Array<{ name: string; obj: any }> = []

        const shieldObj = (window as any).shield || (window as any).shieldWallet || (window as any).shieldAleo
        const leoObj = (window as any).leoWallet || (window as any).leo
        const foxObj = (window as any).foxwallet?.aleo

        // Add connected wallet first
        if (connectedType === 'shield' && shieldObj) {
          walletCandidates.push({ name: 'Shield', obj: shieldObj })
        } else if ((connectedType === 'leo') && leoObj) {
          walletCandidates.push({ name: 'Leo', obj: leoObj })
        } else if (connectedType === 'fox' && foxObj) {
          walletCandidates.push({ name: 'Fox', obj: foxObj })
        }

        // Add other wallets as fallback
        if (shieldObj && connectedType !== 'shield') walletCandidates.push({ name: 'Shield', obj: shieldObj })
        if (leoObj && connectedType !== 'leo') walletCandidates.push({ name: 'Leo', obj: leoObj })
        if (foxObj && connectedType !== 'fox') walletCandidates.push({ name: 'Fox', obj: foxObj })

        for (const { name: wName, obj: wObj } of walletCandidates) {
          if (privateBalance > 0n) break
          console.log(`[Balance] Method 2: Trying ${wName} wallet window object...`)

          // 2a: requestRecordPlaintexts (decrypted records)
          if (typeof wObj.requestRecordPlaintexts === 'function') {
            try {
              const result = await wObj.requestRecordPlaintexts('credits.aleo')
              privateBalance = sumRecordsBalance(result, `M2a-${wName}`)
            } catch (err) {
              console.log(`[Balance] M2a ${wName} requestRecordPlaintexts:`, err)
            }
          }

          // 2b: requestRecords + decrypt
          if (privateBalance === 0n && typeof wObj.requestRecords === 'function') {
            try {
              const result = await wObj.requestRecords('credits.aleo')
              const recordsArr = Array.isArray(result) ? result : ((result as any)?.records || [])
              if (recordsArr.length > 0) {
                console.log(`[Balance] M2b ${wName}: ${recordsArr.length} records, decrypting...`)
                const decryptFn = (window as any).__aleoDecrypt
                  || (typeof wObj.decrypt === 'function' ? wObj.decrypt.bind(wObj) : null)
                for (let i = 0; i < recordsArr.length; i++) {
                  const record = recordsArr[i]
                  if (isRecordSpent(record)) continue
                  let recordMc = 0n
                  const ciphertext = (record as any)?.ciphertext || (record as any)?.record_ciphertext || (record as any)?.data
                  if (ciphertext && decryptFn) {
                    try {
                      const decrypted = await decryptFn(String(ciphertext))
                      recordMc = parseMicrocredits(String(decrypted))
                    } catch { /* decrypt failed */ }
                  }
                  if (recordMc === 0n) {
                    const text = typeof record === 'string' ? record : JSON.stringify(record)
                    recordMc = parseMicrocredits(text)
                  }
                  if (recordMc > 0n) console.log(`[Balance] M2b ${wName} record ${i}: ${Number(recordMc) / 1_000_000} ALEO`)
                  privateBalance += recordMc
                }
              }
            } catch (err) {
              console.log(`[Balance] M2b ${wName} requestRecords:`, err)
            }
          }

          // 2c: getBalance (Shield Wallet native API)
          if (privateBalance === 0n && typeof wObj.getBalance === 'function') {
            try {
              console.log(`[Balance] M2c ${wName} getBalance...`)
              const bal = await wObj.getBalance()
              console.log(`[Balance] M2c ${wName} getBalance response:`, JSON.stringify(bal).substring(0, 200))
              if (bal?.private !== undefined) {
                const privVal = String(bal.private).replace(/[ui]\d+\.?\w*$/i, '').trim()
                const parsed = BigInt(privVal.replace(/[^\d]/g, '') || '0')
                if (parsed > 0n) {
                  privateBalance = parsed
                  console.log(`[Balance] M2c ${wName}: ${Number(parsed) / 1_000_000} ALEO`)
                }
              }
            } catch (err) {
              console.log(`[Balance] M2c ${wName} getBalance:`, err)
            }
          }
        }

        if (privateBalance === 0n) {
          console.log('[Balance] Method 2: No private balance found from any wallet object')
        }
      }

      // Method 3: Shield Wallet specific - log available methods and try alternatives
      if (privateBalance === 0n && connectedType === 'shield') {
        const shieldObj = (window as any).shield || (window as any).shieldWallet || (window as any).shieldAleo
        if (shieldObj) {
          // Log available methods for debugging
          try {
            const methods = Object.keys(shieldObj).filter(k => typeof shieldObj[k] === 'function')
            console.log('[Balance] Shield Wallet methods:', methods.join(', '))
            const allKeys = Object.keys(shieldObj)
            console.log('[Balance] Shield Wallet all keys:', allKeys.join(', '))
          } catch { /* ignore */ }

          // Try alternative method names that Shield might use
          const altMethods = [
            'getRecords', 'records', 'fetchRecords',
            'getCredits', 'credits', 'getPrivateBalance',
            'balance', 'getUnspentRecords',
          ]
          for (const method of altMethods) {
            if (privateBalance > 0n) break
            if (typeof shieldObj[method] === 'function') {
              try {
                console.log(`[Balance] M3 Shield trying ${method}()...`)
                const result = await shieldObj[method]('credits.aleo')
                console.log(`[Balance] M3 Shield ${method}() returned:`, typeof result, JSON.stringify(result).substring(0, 300))
                if (result) {
                  const records = Array.isArray(result) ? result : (result?.records || [])
                  for (const r of records) {
                    if (isRecordSpent(r)) continue
                    const text = typeof r === 'string' ? r : ((r as any)?.plaintext || (r as any)?.data || JSON.stringify(r))
                    const mc = parseMicrocredits(String(text))
                    if (mc > 0n) privateBalance += mc
                  }
                  // Also try if result is a balance object directly
                  if (privateBalance === 0n && typeof result === 'object' && !Array.isArray(result)) {
                    const privVal = result?.private ?? result?.privateBalance ?? result?.unspent
                    if (privVal !== undefined) {
                      const cleaned = String(privVal).replace(/[ui]\d+\.?\w*$/i, '').replace(/[^\d]/g, '')
                      if (cleaned) privateBalance = BigInt(cleaned)
                    }
                  }
                }
              } catch (err) {
                console.log(`[Balance] M3 Shield ${method}() failed:`, err)
              }
            }
          }

          // Try property access (some wallets expose balance as a property)
          if (privateBalance === 0n) {
            try {
              const balProp = shieldObj.balance || shieldObj.privateBalance
              if (balProp !== undefined) {
                console.log('[Balance] M3 Shield balance property:', balProp)
                const cleaned = String(balProp).replace(/[ui]\d+\.?\w*$/i, '').replace(/[^\d]/g, '')
                if (cleaned) privateBalance = BigInt(cleaned)
              }
            } catch { /* ignore */ }
          }

          if (privateBalance === 0n) {
            console.log('[Balance] Shield Wallet: Private balance detection not supported by this wallet extension')
          }
        }
      }

      // Fetch USDCX public balance in parallel (non-blocking)
      let usdcxPublic = 0n
      try {
        usdcxPublic = await fetchUsdcxPublicBalance(wallet.address)
      } catch {
        // USDCX balance is non-critical
      }

      const balance: WalletBalance = { public: publicBalance, private: privateBalance, usdcxPublic }

      console.log('[Balance] Final:', {
        public: `${Number(publicBalance) / 1_000_000} ALEO`,
        private: `${Number(privateBalance) / 1_000_000} ALEO`,
        usdcxPublic: `${Number(usdcxPublic) / 1_000_000} USDCX`,
      })

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

  shieldCredits: async (amount: bigint) => {
    const txId = await walletManager.shieldCredits(amount)

    // Refresh balance after a delay to allow transaction to process
    setTimeout(() => {
      useWalletStore.getState().refreshBalance()
    }, 3000)

    // Poll for confirmation
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(
          `${config.rpcUrl}/transaction/${txId}`
        )
        if (response.ok) {
          clearInterval(pollInterval)
          useWalletStore.getState().refreshBalance()
        }
      } catch {
        // Not confirmed yet
      }
    }, 5000)

    setTimeout(() => clearInterval(pollInterval), 120000)

    return txId
  },

  testTransaction: async () => {
    const txId = await walletManager.testTransaction()
    console.log('Test transaction submitted:', txId)

    setTimeout(() => {
      useWalletStore.getState().refreshBalance()
    }, 5000)

    return txId
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
    reserve3: 0n,
    reserve4: 0n,
    totalLiquidity: yesReserve + noReserve,
    totalLPShares: 0n,
    yesPrice,
    noPrice,
    numOutcomes: 2,
    outcomeLabels: ['Yes', 'No'],
    totalYesIssued: BigInt(Math.floor(Number(totalVolume) * yesPrice)),
    totalNoIssued: BigInt(Math.floor(Number(totalVolume) * noPrice)),
  }
}

// ============================================================================
// MOCK DATA FOR DEMONSTRATION
// ============================================================================
// These markets are for UI demonstration only and are NOT on-chain.
// Real markets created via the "Create Market" modal will be stored on-chain
// in the veiled_markets_v14.aleo program.
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
  commitmentRecords: CommitmentRecord[]  // Phase 2: Store commitments for reveal

  // Actions
  placeBet: (marketId: string, amount: bigint, outcome: 'yes' | 'no') => Promise<string>  // Legacy method
  addPendingBet: (bet: Bet) => void  // Save bet from external tx (e.g. BettingModal)
  confirmPendingBet: (pendingBetId: string, confirmedTxId?: string) => void
  removePendingBet: (pendingBetId: string) => void
  storeCommitment: (commitment: CommitmentRecord) => void
  markRevealed: (commitmentId: string, revealTxId: string) => void
  exportCommitments: () => string
  importCommitments: (json: string) => number
  fetchUserBets: () => Promise<void>
  loadBetsForAddress: (address: string) => void
  syncBetStatuses: () => Promise<void>
  markBetClaimed: (betId: string) => void
  getBetsByMarket: (marketId: string) => Bet[]
  getTotalBetsValue: () => bigint
  getCommitmentRecords: (marketId?: string) => CommitmentRecord[]
  getPendingReveals: () => CommitmentRecord[]
}

// Per-address localStorage key helpers
function getBetsKey(address: string): string {
  return `veiled_markets_bets_${address}`
}
function getPendingBetsKey(address: string): string {
  return `veiled_markets_pending_${address}`
}
function getCommitmentsKey(address: string): string {
  return `veiled_markets_commitments_${address}`
}

// Migrate old global localStorage keys to per-address keys
function migrateGlobalToAddressScoped(address: string): void {
  if (typeof window === 'undefined') return
  try {
    const oldBets = localStorage.getItem('veiled_markets_user_bets')
    const oldPending = localStorage.getItem('veiled_markets_pending_bets')
    const oldCommitments = localStorage.getItem('veiled_markets_commitments')

    if (oldBets && !localStorage.getItem(getBetsKey(address))) {
      localStorage.setItem(getBetsKey(address), oldBets)
      localStorage.removeItem('veiled_markets_user_bets')
    }
    if (oldPending && !localStorage.getItem(getPendingBetsKey(address))) {
      localStorage.setItem(getPendingBetsKey(address), oldPending)
      localStorage.removeItem('veiled_markets_pending_bets')
    }
    if (oldCommitments && !localStorage.getItem(getCommitmentsKey(address))) {
      localStorage.setItem(getCommitmentsKey(address), oldCommitments)
      localStorage.removeItem('veiled_markets_commitments')
    }
  } catch (e) {
    console.error('Migration failed:', e)
  }
}

function parseBetFromStorage(bet: any): Bet {
  return {
    ...bet,
    amount: BigInt(bet.amount),
    sharesReceived: bet.sharesReceived ? BigInt(bet.sharesReceived) : undefined,
    payoutAmount: bet.payoutAmount ? BigInt(bet.payoutAmount) : undefined,
  }
}

function serializeBetForStorage(bet: Bet): any {
  return {
    ...bet,
    amount: bet.amount.toString(),
    sharesReceived: bet.sharesReceived?.toString(),
    payoutAmount: bet.payoutAmount?.toString(),
  }
}

// Helper to load bets from localStorage (per-address)
function loadBetsFromStorage(address?: string): Bet[] {
  if (typeof window === 'undefined' || !address) return []
  try {
    const saved = localStorage.getItem(getBetsKey(address))
    if (!saved) return []
    const parsed = JSON.parse(saved)
    return parsed.map(parseBetFromStorage)
  } catch (e) {
    console.error('Failed to load bets from storage:', e)
    return []
  }
}

// Helper to load pending bets from localStorage (per-address)
function loadPendingBetsFromStorage(address?: string): Bet[] {
  if (typeof window === 'undefined' || !address) return []
  try {
    const saved = localStorage.getItem(getPendingBetsKey(address))
    if (!saved) return []
    const parsed = JSON.parse(saved)
    return parsed.map(parseBetFromStorage)
  } catch (e) {
    console.error('Failed to load pending bets from storage:', e)
    return []
  }
}

// Helper to save pending bets to localStorage (per-address)
function savePendingBetsToStorage(bets: Bet[]) {
  const address = useWalletStore.getState().wallet.address
  if (typeof window === 'undefined' || !address) {
    console.warn('[Bets] savePendingBetsToStorage SKIPPED — no address:', address)
    return
  }
  try {
    const serializable = bets.map(serializeBetForStorage)
    const key = getPendingBetsKey(address)
    localStorage.setItem(key, JSON.stringify(serializable))
    console.warn(`[Bets] Saved ${bets.length} pending bets to localStorage key: ${key}`)
    // Sync to Supabase (async, fire-and-forget)
    if (isSupabaseAvailable()) {
      sbUpsertPendingBets(bets, address).catch(err =>
        console.warn('[Supabase] Failed to sync pending bets:', err)
      )
    }
  } catch (e) {
    console.error('[Bets] Failed to save pending bets to storage:', e)
  }
}

// Helper to save bets to localStorage (per-address)
function saveBetsToStorage(bets: Bet[]) {
  const address = useWalletStore.getState().wallet.address
  if (typeof window === 'undefined' || !address) return
  try {
    const serializable = bets.map(serializeBetForStorage)
    localStorage.setItem(getBetsKey(address), JSON.stringify(serializable))
    // Sync to Supabase (async, fire-and-forget)
    if (isSupabaseAvailable()) {
      sbUpsertBets(bets, address).catch(err =>
        console.warn('[Supabase] Failed to sync bets:', err)
      )
    }
  } catch (e) {
    console.error('Failed to save bets to storage:', e)
  }
}

// Helper to load commitment records from localStorage (per-address)
function loadCommitmentRecordsFromStorage(address?: string): CommitmentRecord[] {
  if (typeof window === 'undefined' || !address) return []
  try {
    const saved = localStorage.getItem(getCommitmentsKey(address))
    if (!saved) return []
    const parsed = JSON.parse(saved)
    return parsed.map((record: any) => ({
      ...record,
      amount: BigInt(record.amount),
    }))
  } catch (e) {
    console.error('Failed to load commitment records from storage:', e)
    return []
  }
}

// Helper to save commitment records to localStorage (per-address)
function saveCommitmentRecordsToStorage(records: CommitmentRecord[]) {
  const address = useWalletStore.getState().wallet.address
  if (typeof window === 'undefined' || !address) return
  try {
    const serializable = records.map(record => ({
      ...record,
      amount: record.amount.toString(),
    }))
    localStorage.setItem(getCommitmentsKey(address), JSON.stringify(serializable))
    // Sync to Supabase (async, fire-and-forget)
    if (isSupabaseAvailable()) {
      sbUpsertCommitments(records, address).catch(err =>
        console.warn('[Supabase] Failed to sync commitments:', err)
      )
    }
  } catch (e) {
    console.error('Failed to save commitment records to storage:', e)
  }
}

// ---- Supabase background sync helpers ----

async function syncFromSupabase(
  address: string,
  set: (partial: Partial<{ userBets: Bet[]; pendingBets: Bet[]; commitmentRecords: CommitmentRecord[] }>) => void,
  get: () => { userBets: Bet[]; pendingBets: Bet[]; commitmentRecords: CommitmentRecord[] }
) {
  try {
    const [remoteBets, remotePending, remoteCommitments] = await Promise.all([
      sbFetchBets(address),
      sbFetchPendingBets(address),
      sbFetchCommitments(address),
    ])

    if (remoteBets.length > 0) {
      const merged = mergeBets(get().userBets, remoteBets)
      set({ userBets: merged })
      const serializable = merged.map(serializeBetForStorage)
      localStorage.setItem(getBetsKey(address), JSON.stringify(serializable))
    }

    if (remotePending.length > 0) {
      const merged = mergeBets(get().pendingBets, remotePending)
      set({ pendingBets: merged })
      const serializable = merged.map(serializeBetForStorage)
      localStorage.setItem(getPendingBetsKey(address), JSON.stringify(serializable))
    }

    if (remoteCommitments.length > 0) {
      const merged = mergeCommitments(get().commitmentRecords, remoteCommitments)
      set({ commitmentRecords: merged })
      const serializable = merged.map(r => ({ ...r, amount: r.amount.toString() }))
      localStorage.setItem(getCommitmentsKey(address), JSON.stringify(serializable))
    }
  } catch (error) {
    console.warn('[Supabase] Background sync failed:', error)
  }
}

function mergeBets(local: Bet[], remote: Bet[]): Bet[] {
  const byId = new Map<string, Bet>()
  const STATUS_PRIORITY: Record<string, number> = {
    pending: 0, active: 1, won: 2, lost: 2, refunded: 2,
  }
  for (const bet of local) byId.set(bet.id, bet)
  for (const bet of remote) {
    const existing = byId.get(bet.id)
    if (!existing) {
      byId.set(bet.id, bet)
    } else {
      const localPri = STATUS_PRIORITY[existing.status] ?? 0
      const remotePri = STATUS_PRIORITY[bet.status] ?? 0
      if (remotePri >= localPri) {
        byId.set(bet.id, { ...existing, ...bet })
      }
    }
  }
  return Array.from(byId.values())
}

function mergeCommitments(local: CommitmentRecord[], remote: CommitmentRecord[]): CommitmentRecord[] {
  const byId = new Map<string, CommitmentRecord>()
  for (const r of local) byId.set(r.id, r)
  for (const r of remote) {
    const existing = byId.get(r.id)
    if (!existing || (r.revealed && !existing.revealed)) {
      byId.set(r.id, r)
    }
  }
  return Array.from(byId.values())
}

export const useBetsStore = create<BetsStore>((set, get) => ({
  userBets: [],
  pendingBets: [],
  commitmentRecords: [],
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
      // Get market question for display purposes (use real blockchain store)
      const { useRealMarketsStore } = await import('./market-store')
      const realMarkets = useRealMarketsStore.getState().markets
      const market = realMarkets.find(m => m.id === marketId)
      const marketQuestion = market?.question || `Market ${marketId}`

      // Build inputs for the veiled_markets_v14.aleo contract
      // ALEO: buy_shares_private (needs credits record)
      // USDCX: buy_shares_usdcx (no record needed)
      const tokenType = market?.tokenType || 'ALEO'
      const outcomeNum = outcome === 'yes' ? 1 : 2

      let creditsRecord: string | undefined
      if (tokenType === 'ALEO') {
        const { fetchCreditsRecord } = await import('./credits-record')
        const gasBuffer = 500_000
        const totalNeeded = Number(amount) + gasBuffer
        const record = await fetchCreditsRecord(totalNeeded)
        if (!record) {
          throw new Error(
            `Could not find a Credits record with at least ${(totalNeeded / 1_000_000).toFixed(2)} ALEO. ` +
            `Private betting requires an unspent Credits record.`
          )
        }
        creditsRecord = record
      }

      const { functionName: betFunctionName, inputs } = buildBuySharesInputs(
        marketId,
        outcomeNum,
        amount,
        0n, // expectedShares
        0n, // minSharesOut
        tokenType as 'ALEO' | 'USDCX',
        creditsRecord,
      )

      console.log('=== PLACE BET DEBUG ===')
      console.log('Market ID:', marketId)
      console.log('Amount:', amount.toString())
      console.log('Outcome:', outcome)
      console.log('Function:', betFunctionName)
      console.log('Program ID:', CONTRACT_INFO.programId)

      // Validate inputs
      for (let i = 0; i < inputs.length; i++) {
        if (typeof inputs[i] !== 'string') {
          throw new Error(`Input ${i} is not a string: ${typeof inputs[i]}`)
        }
        if (!inputs[i]) {
          throw new Error(`Input ${i} is empty`)
        }
      }

      // Request transaction through wallet
      // ALEO: buy_shares_private (privacy-preserving, transfer_private_to_public)
      // USDCX: buy_shares_usdcx (transfer_public_as_signer)
      const transactionId = await walletManager.requestTransaction({
        programId: CONTRACT_INFO.programId,
        functionName: betFunctionName,
        inputs,
        fee: 0.5, // 0.5 ALEO (Leo Wallet expects fee in ALEO, not microcredits)
      })

      console.log('Bet transaction submitted:', transactionId)

      // Immediately refresh balance
      setTimeout(() => {
        useWalletStore.getState().refreshBalance()
      }, 1000)

      // Calculate locked multiplier for display
      const lockedMultiplier = outcome === 'yes'
        ? market?.potentialYesPayout
        : market?.potentialNoPayout

      // Add to pending bets with market question and locked odds
      const newBet: Bet = {
        id: transactionId,
        marketId,
        amount,
        outcome,
        placedAt: Date.now(),
        status: 'pending',
        marketQuestion,
        lockedMultiplier,
      }

      const updatedPendingBets = [...get().pendingBets, newBet]
      set({
        pendingBets: updatedPendingBets,
        isPlacingBet: false,
      })

      // Save pending bets to localStorage immediately
      savePendingBetsToStorage(updatedPendingBets)

      // Refresh balance multiple times to catch the update
      const refreshIntervals = [3000, 5000, 10000, 15000, 30000]
      refreshIntervals.forEach(delay => {
        setTimeout(() => {
          console.log(`Refreshing balance after ${delay}ms...`)
          useWalletStore.getState().refreshBalance()
        }, delay)
      })

      // Poll for transaction confirmation
      // If we got a UUID (Leo Wallet event ID) instead of at1... tx ID,
      // skip explorer polling - the bet was accepted by the wallet
      const isRealTxId = transactionId.startsWith('at1')

      if (isRealTxId) {
        // Real at1... tx ID: poll the explorer for confirmation
        const pollInterval = setInterval(async () => {
          try {
            const response = await fetch(
              `${config.rpcUrl}/transaction/${transactionId}`
            )
            if (response.ok) {
              clearInterval(pollInterval)
              const activeBet = { ...newBet, status: 'active' as const }
              const updatedBets = [...get().userBets, activeBet]
              const updatedPending = get().pendingBets.filter(b => b.id !== transactionId)
              set({
                pendingBets: updatedPending,
                userBets: updatedBets,
              })
              saveBetsToStorage(updatedBets)
              savePendingBetsToStorage(updatedPending)
              // Remove from Supabase pending_bets
              if (isSupabaseAvailable() && walletState.address) {
                sbRemovePendingBet(transactionId, walletState.address)
              }
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
          const stillPending = get().pendingBets.find(b => b.id === transactionId)
          if (stillPending) {
            const activeBet = { ...newBet, status: 'active' as const }
            const updatedBets = [...get().userBets, activeBet]
            const updatedPending = get().pendingBets.filter(b => b.id !== transactionId)
            set({
              pendingBets: updatedPending,
              userBets: updatedBets,
            })
            saveBetsToStorage(updatedBets)
            savePendingBetsToStorage(updatedPending)
            if (isSupabaseAvailable() && walletState.address) {
              sbRemovePendingBet(transactionId, walletState.address)
            }
          }
        }, 120000)
      } else {
        // UUID (Leo Wallet event ID): bet was accepted by wallet, mark as active immediately
        // Leo Wallet doesn't expose the real at1... tx ID through its adapter API
        console.log('Transaction submitted via Leo Wallet (UUID event ID). Marking as active.')
        console.log('User can find the real transaction ID in their Leo Wallet extension.')

        // Short delay then mark as active (the wallet accepted it)
        setTimeout(() => {
          const activeBet = { ...newBet, status: 'active' as const }
          const updatedBets = [...get().userBets, activeBet]
          const updatedPending = get().pendingBets.filter(b => b.id !== transactionId)
          set({
            pendingBets: updatedPending,
            userBets: updatedBets,
          })
          saveBetsToStorage(updatedBets)
          savePendingBetsToStorage(updatedPending)
          if (isSupabaseAvailable() && walletState.address) {
            sbRemovePendingBet(transactionId, walletState.address)
          }
        }, 5000)
      }

      return transactionId
    } catch (error: any) {
      console.error('Place bet error:', error)
      set({ isPlacingBet: false })
      throw error
    }
  },

  // Save a bet from external transaction flow (e.g. BettingModal using useAleoTransaction)
  addPendingBet: (bet: Bet) => {
    const address = useWalletStore.getState().wallet.address
    console.warn('[Bets] addPendingBet called:', {
      betId: bet.id,
      marketId: bet.marketId?.slice(0, 20) + '...',
      amount: String(bet.amount),
      outcome: bet.outcome,
      status: bet.status,
      walletAddress: address || 'NOT CONNECTED',
    })

    const existingPending = get().pendingBets.find(b => b.id === bet.id)
    const existingUser = get().userBets.find(b => b.id === bet.id)

    if (existingPending || existingUser) {
      console.warn('[Bets] Skip duplicate pending bet:', bet.id)
      return
    }

    const updatedPending = [...get().pendingBets, bet]
    set({ pendingBets: updatedPending })
    savePendingBetsToStorage(updatedPending)
    console.warn('[Bets] Added pending bet:', bet.id, 'total pending:', updatedPending.length)

    // Verify it was saved to localStorage
    if (address) {
      const saved = localStorage.getItem(`veiled_markets_pending_${address}`)
      console.warn('[Bets] localStorage verification:', saved ? `${JSON.parse(saved).length} bets saved` : 'EMPTY/NULL')
    }
  },

  confirmPendingBet: (pendingBetId: string, confirmedTxId?: string) => {
    const pendingBet = get().pendingBets.find(b => b.id === pendingBetId)
    if (!pendingBet) return

    const activeBet: Bet = {
      ...pendingBet,
      id: confirmedTxId || pendingBet.id,
      status: 'active',
    }

    const updatedPending = get().pendingBets.filter(b => b.id !== pendingBetId)

    const existingIdx = get().userBets.findIndex(b => b.id === activeBet.id)
    const updatedUserBets = [...get().userBets]
    if (existingIdx >= 0) {
      updatedUserBets[existingIdx] = { ...updatedUserBets[existingIdx], ...activeBet }
    } else {
      updatedUserBets.push(activeBet)
    }

    set({
      pendingBets: updatedPending,
      userBets: updatedUserBets,
    })
    savePendingBetsToStorage(updatedPending)
    saveBetsToStorage(updatedUserBets)

    const address = useWalletStore.getState().wallet.address
    if (isSupabaseAvailable() && address) {
      sbRemovePendingBet(pendingBetId, address)
    }
  },

  removePendingBet: (pendingBetId: string) => {
    const exists = get().pendingBets.some(b => b.id === pendingBetId)
    if (!exists) return

    const updatedPending = get().pendingBets.filter(b => b.id !== pendingBetId)
    set({ pendingBets: updatedPending })
    savePendingBetsToStorage(updatedPending)

    const address = useWalletStore.getState().wallet.address
    if (isSupabaseAvailable() && address) {
      sbRemovePendingBet(pendingBetId, address)
    }
  },

  // Phase 2: Commit-Reveal Scheme - Store commitment data from SDK worker
  storeCommitment: (commitment: CommitmentRecord) => {
    const updatedCommitments = [...get().commitmentRecords, commitment]
    set({ commitmentRecords: updatedCommitments })
    saveCommitmentRecordsToStorage(updatedCommitments)
    console.log('Commitment stored:', commitment.id, 'market:', commitment.marketId)
  },

  // Phase 2: Mark a commitment as revealed
  markRevealed: (commitmentId: string, revealTxId: string) => {
    const updatedCommitments = get().commitmentRecords.map(record =>
      record.id === commitmentId
        ? { ...record, revealed: true, revealTxId }
        : record
    )
    set({ commitmentRecords: updatedCommitments })
    saveCommitmentRecordsToStorage(updatedCommitments)
    console.log('Commitment revealed:', commitmentId, 'tx:', revealTxId)
  },

  // Phase 2: Export all commitments as JSON for backup
  exportCommitments: (): string => {
    const records = get().commitmentRecords
    const serializable = records.map(record => ({
      ...record,
      amount: record.amount.toString(),
    }))
    return JSON.stringify(serializable, null, 2)
  },

  // Phase 2: Import commitments from JSON backup
  importCommitments: (json: string): number => {
    try {
      const parsed = JSON.parse(json)
      if (!Array.isArray(parsed)) throw new Error('Invalid format: expected array')

      const imported: CommitmentRecord[] = parsed.map((record: any) => ({
        ...record,
        amount: BigInt(record.amount),
      }))

      // Merge: skip duplicates by id
      const existingIds = new Set(get().commitmentRecords.map(r => r.id))
      const newRecords = imported.filter(r => !existingIds.has(r.id))

      if (newRecords.length > 0) {
        const updatedCommitments = [...get().commitmentRecords, ...newRecords]
        set({ commitmentRecords: updatedCommitments })
        saveCommitmentRecordsToStorage(updatedCommitments)
      }

      console.log(`Imported ${newRecords.length} new commitments (${imported.length - newRecords.length} duplicates skipped)`)
      return newRecords.length
    } catch (e) {
      console.error('Failed to import commitments:', e)
      throw e
    }
  },

  // Get commitment records (optionally filtered by marketId)
  getCommitmentRecords: (marketId?: string) => {
    const records = get().commitmentRecords
    return marketId ? records.filter(r => r.marketId === marketId) : records
  },

  // Get pending reveals (commitments that haven't been revealed yet)
  getPendingReveals: () => {
    return get().commitmentRecords.filter(r => !r.revealed)
  },

  fetchUserBets: async () => {
    const walletState = useWalletStore.getState().wallet

    if (!walletState.connected || !walletState.address) return

    const address = walletState.address

    // Run migration from global keys to per-address keys
    migrateGlobalToAddressScoped(address)

    try {
      // Load from per-address localStorage
      const localBets = loadBetsFromStorage(address)
      const localPendingBets = loadPendingBetsFromStorage(address)

      // Get markets for question lookup (use real blockchain store)
      const { useRealMarketsStore } = await import('./market-store')
      const realMarkets = useRealMarketsStore.getState().markets
      const getMarketQuestion = (marketId: string) => {
        const market = realMarkets.find(m => m.id === marketId)
        return market?.question || `Market ${marketId}`
      }

      // Try to fetch from wallet records (may not work with all wallets)
      let walletBets: Bet[] = []
      try {
        const records = await walletManager.getRecords(CONTRACT_INFO.programId)
        walletBets = records
          .filter((r: any) => r.type === 'Bet')
          .map((r: any) => ({
            id: r.id,
            marketId: r.data.market_id,
            amount: BigInt(r.data.amount),
            outcome: r.data.outcome === '1u8' ? 'yes' : 'no',
            placedAt: parseInt(r.data.placed_at),
            status: 'active' as const,
            marketQuestion: getMarketQuestion(r.data.market_id),
          }))
      } catch {
        // Wallet records not available (expected with Leo Wallet)
      }

      // Merge: use wallet bets if available, otherwise use local cache
      const existingIds = new Set(walletBets.map(b => b.id))
      const mergedBets = [
        ...walletBets,
        ...localBets.filter(b => !existingIds.has(b.id)).map(b => ({
          ...b,
          marketQuestion: b.marketQuestion || getMarketQuestion(b.marketId),
        }))
      ]

      set({
        userBets: mergedBets,
        pendingBets: localPendingBets,
      })

      if (mergedBets.length > 0) {
        saveBetsToStorage(mergedBets)
      }

      // Background: merge from Supabase if available
      if (isSupabaseAvailable()) {
        syncFromSupabase(address, set, get)
      }
    } catch (error) {
      console.error('Failed to fetch user bets:', error)
      const localBets = loadBetsFromStorage(address)
      const localPendingBets = loadPendingBetsFromStorage(address)
      set({
        userBets: localBets,
        pendingBets: localPendingBets,
      })
    }
  },

  loadBetsForAddress: (address: string) => {
    migrateGlobalToAddressScoped(address)
    // Instant: load from localStorage
    const bets = loadBetsFromStorage(address)
    const pending = loadPendingBetsFromStorage(address)
    const commitments = loadCommitmentRecordsFromStorage(address)
    set({
      userBets: bets,
      pendingBets: pending,
      commitmentRecords: commitments,
    })
    // Background: merge from Supabase if available
    if (isSupabaseAvailable()) {
      syncFromSupabase(address, set, get)
    }
  },

  syncBetStatuses: async () => {
    // --- Auto-promote stale pending bets (>2 minutes old) ---
    const pendingBets = get().pendingBets
    const STALE_THRESHOLD = 2 * 60 * 1000 // 2 minutes
    const stalePending = pendingBets.filter(b => Date.now() - b.placedAt > STALE_THRESHOLD)

    if (stalePending.length > 0) {
      const promoted: string[] = []

      for (const bet of stalePending) {
        if (bet.id.startsWith('at1')) {
          // Verify on-chain via explorer API
          try {
            const resp = await fetch(
              `https://api.explorer.provable.com/v1/testnet/transaction/${bet.id}`
            )
            if (resp.ok) {
              console.warn(`[Bets] Stale pending bet ${bet.id.slice(0, 20)}... confirmed on-chain → promoting`)
              promoted.push(bet.id)
            }
          } catch { /* keep as pending */ }
        } else {
          // Shield wallet or other non-at1 IDs — auto-promote
          // Shield transactions land on-chain even if ID format is shield_xxx
          console.warn(`[Bets] Stale pending bet ${bet.id.slice(0, 20)}... (non-at1, ${Math.round((Date.now() - bet.placedAt) / 1000)}s old) → auto-promoting`)
          promoted.push(bet.id)
        }
      }

      if (promoted.length > 0) {
        const updatedPending = pendingBets.filter(b => !promoted.includes(b.id))
        const newActive = stalePending
          .filter(b => promoted.includes(b.id))
          .map(b => ({ ...b, status: 'active' as const }))

        const updatedUserBets = [...get().userBets, ...newActive]
        set({ pendingBets: updatedPending, userBets: updatedUserBets })
        savePendingBetsToStorage(updatedPending)
        saveBetsToStorage(updatedUserBets)
        console.warn(`[Bets] Promoted ${promoted.length} stale pending bet(s) to active`)
      }
    }

    // --- Sync active bet statuses with market state ---
    const bets = get().userBets
    const activeBets = bets.filter(b => b.status === 'active')
    if (activeBets.length === 0) return

    // Get unique market IDs (only real on-chain markets ending with 'field')
    const marketIds = [...new Set(activeBets.map(b => b.marketId))]
      .filter(id => id.endsWith('field'))

    const updates: Array<{ betId: string; newStatus: Bet['status']; payoutAmount?: bigint; winningOutcome?: 'yes' | 'no' }> = []

    for (const marketId of marketIds) {
      try {
        const market = await getMarket(marketId)
        if (!market) continue

        const marketBets = activeBets.filter(b => b.marketId === marketId)

        if (market.status === 4) {
          // CANCELLED → eligible for refund
          for (const bet of marketBets) {
            updates.push({ betId: bet.id, newStatus: 'refunded' })
          }
        } else if (market.status === 3) {
          // RESOLVED → check winning outcome
          const resolution = await getMarketResolution(marketId)
          const pool = await getMarketPool(marketId)
          if (!resolution || !pool) continue

          const winningOutcome: 'yes' | 'no' = resolution.winning_outcome === 1 ? 'yes' : 'no'
          const winningPool = winningOutcome === 'yes' ? pool.reserve_1 : pool.reserve_2
          const totalPayoutPool = pool.total_liquidity

          for (const bet of marketBets) {
            if (bet.outcome === winningOutcome && winningPool > 0n) {
              const payoutAmount = (bet.amount * totalPayoutPool) / winningPool
              updates.push({ betId: bet.id, newStatus: 'won', payoutAmount, winningOutcome })
            } else {
              updates.push({ betId: bet.id, newStatus: 'lost', winningOutcome })
            }
          }
        }
        // Status 1 (active) or 2 (closed) → keep as 'active'
      } catch (err) {
        console.error(`Failed to sync status for market ${marketId}:`, err)
      }
    }

    if (updates.length > 0) {
      const updatedBets = bets.map(bet => {
        const update = updates.find(u => u.betId === bet.id)
        if (!update) return bet
        return {
          ...bet,
          status: update.newStatus,
          payoutAmount: update.payoutAmount,
          winningOutcome: update.winningOutcome,
        }
      })
      set({ userBets: updatedBets })
      saveBetsToStorage(updatedBets)
    }
  },

  markBetClaimed: (betId: string) => {
    const updatedBets = get().userBets.map(bet =>
      bet.id === betId ? { ...bet, claimed: true } : bet
    )
    set({ userBets: updatedBets })
    saveBetsToStorage(updatedBets)
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
