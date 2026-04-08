import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  walletManager,
  fetchPublicBalance,
  fetchUsdcxPublicBalance,
  lookupWalletTransactionStatus,
  type WalletType,
  type NetworkType,
  type WalletAccount,
  type WalletBalance,
} from './wallet'
import {
  buildBuySharesInputs,
  CONTRACT_INFO,
  diagnoseTransaction,
  getMarket,
  getMarketResolution,
  getProgramIdForToken,
} from './aleo-client'
import { config } from './config'
import { devLog, devWarn } from './logger'
import {
  isSupabaseAvailable, fetchBets as sbFetchBets, upsertBets as sbUpsertBets,
  fetchPendingBets as sbFetchPendingBets, upsertPendingBets as sbUpsertPendingBets,
  removePendingBet as sbRemovePendingBet, removeUserBet as sbRemoveUserBet,
  fetchCommitments as sbFetchCommitments, upsertCommitments as sbUpsertCommitments,
  setSupabaseAleoAddress,
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
  programId?: string
  category: number
  numOutcomes: number        // v12: 2, 3, or 4
  outcomeLabels: string[]    // v12: labels for each outcome
  deadline: bigint
  resolutionDeadline: bigint
  status: number // 1=active, 2=closed, 3=resolved, 4=cancelled, 5=pending_resolution

  // AMM Pool Data (v12 - multi-outcome reserves)
  yesReserve: bigint         // reserve_1
  noReserve: bigint          // reserve_2
  reserve3: bigint           // reserve_3 (0 when market has fewer than 3 outcomes)
  reserve4: bigint           // reserve_4 (0 when market has fewer than 4 outcomes)
  totalLiquidity: bigint     // Total tokens in pool
  totalLPShares: bigint      // LP tokens in circulation

  outcomePrices?: number[]   // Generic prices for active outcomes (0-1)
  outcomePercentages?: number[] // Generic percentages for active outcomes (0-100)
  outcomePayouts?: number[]  // Generic 1/price payout multipliers

  totalVolume: bigint
  totalBets: number

  // Issued shares
  totalYesIssued: bigint
  totalNoIssued: bigint

  // v12: Resolution with challenge window
  challengeDeadline?: bigint
  finalized?: boolean

  // Remaining collateral after winner claims (only for resolved/cancelled markets)
  remainingCredits?: bigint

  creator?: string
  resolver?: string
  timeRemaining?: string
  deadlineTimestamp?: number  // Estimated deadline as unix ms (for live countdown)
  resolutionSource?: string
  tags?: string[]
  transactionId?: string
  tokenType?: 'ALEO' | 'USDCX' | 'USAD'
  thumbnailUrl?: string
}

export interface SharePosition {
  id: string
  marketId: string
  outcome: string
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
  outcome: string             // 'yes' | 'no' | 'outcome_3' | 'outcome_4' (1-indexed via outcomeToIndex)
  placedAt: number
  status: 'pending' | 'active' | 'won' | 'lost' | 'refunded'
  type?: 'buy' | 'sell'       // Trade type (default 'buy')
  marketQuestion?: string
  lockedMultiplier?: number    // Payout multiplier locked at time of bet
  sharesReceived?: bigint      // Shares received from buy (v19FPMM)
  sharesSold?: bigint          // Shares burned in sell
  tokensReceived?: bigint      // Net tokens received from sell (after fees)
  payoutAmount?: bigint        // Calculated payout when market resolves (won bets)
  winningOutcome?: string      // From resolution data
  claimed?: boolean            // Whether user has claimed winnings/refund
  tokenType?: 'ALEO' | 'USDCX' | 'USAD' // v12: token denomination
}

/** Convert 1-indexed outcome number to string key */
export function outcomeToString(outcomeNum: number): string {
  if (outcomeNum === 1) return 'yes'
  if (outcomeNum === 2) return 'no'
  return `outcome_${outcomeNum}`
}

/** Convert outcome string key to 1-indexed number */
export function outcomeToIndex(outcome: string): number {
  if (outcome === 'yes') return 1
  if (outcome === 'no') return 2
  const match = outcome.match(/^outcome_(\d+)$/)
  return match ? parseInt(match[1]) : 1
}

// Phase 2: Commit-Reveal Scheme Records (SDK-based)
export interface CommitmentRecord {
  id: string                        // crypto.randomUUID()
  marketId: string
  amount: bigint
  outcome: string
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
  encryptionKey: CryptoKey | null  // wallet-derived AES-256-GCM key for Supabase privacy
}

export type BalanceStatus = 'idle' | 'refreshing' | 'partial' | 'ready' | 'error'

// ============================================================================
// Wallet Store
// ============================================================================

interface WalletStore {
  wallet: WalletState
  error: string | null
  balanceStatus: BalanceStatus
  lastBalanceRefreshAt: number | null
  balanceError: string | null

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
  balance: { public: 0n, private: 0n, usdcxPublic: 0n, usdcxPrivate: 0n, usadPublic: 0n, usadPrivate: 0n },
  walletType: null,
  isDemoMode: false,
  encryptionKey: null,
}

// Track listener cleanup functions to prevent duplicate listeners on reconnect
const _listenerCleanups: (() => void)[] = []
const _activeBalanceRefreshIds = new Map<string, number>()
const _privateBalanceZeroMisses = new Map<string, { private: number; usdcxPrivate: number; usadPrivate: number }>()
let _balanceRefreshSequence = 0

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    promise
      .then((value) => {
        clearTimeout(timeoutId)
        resolve(value)
      })
      .catch((error) => {
        clearTimeout(timeoutId)
        reject(error)
      })
  })
}

function getPrivateBalanceMissState(address: string) {
  const existing = _privateBalanceZeroMisses.get(address)
  if (existing) return existing
  const fresh = { private: 0, usdcxPrivate: 0, usadPrivate: 0 }
  _privateBalanceZeroMisses.set(address, fresh)
  return fresh
}

function stabilizeShieldPrivateBalance(
  address: string,
  asset: 'private' | 'usdcxPrivate' | 'usadPrivate',
  detected: bigint,
  previous: bigint,
) {
  const misses = getPrivateBalanceMissState(address)

  if (detected > 0n) {
    misses[asset] = 0
    return { value: detected, preserved: false }
  }

  if (previous > 0n) {
    misses[asset] += 1
    if (misses[asset] < 2) {
      return { value: previous, preserved: true }
    }
  }

  misses[asset] = 0
  return { value: detected, preserved: false }
}

export const useWalletStore = create<WalletStore>((set, get) => ({
  wallet: initialWalletState,
  error: null,
  balanceStatus: 'idle',
  lastBalanceRefreshAt: null,
  balanceError: null,

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
          encryptionKey: null,
        },
        error: null,
      })

      // Inform Supabase client about the connected address so RLS works
      setSupabaseAleoAddress(account.address)

      // Set up event listeners for real wallets
      // Clean up previous listeners first to prevent duplicates
      if (_listenerCleanups.length > 0) {
        _listenerCleanups.forEach(fn => fn())
        _listenerCleanups.length = 0
      }

      if (!walletManager.isDemoMode()) {
        const unsubAccount = walletManager.onAccountChange((newAccount: WalletAccount | null) => {
          if (newAccount) {
            devLog('[Store] Account changed to:', newAccount.address?.slice(0, 12))
            import('./record-scanner').then(({ resetScanner }) => resetScanner()).catch(() => {})
            setSupabaseAleoAddress(newAccount.address)
            set({
              wallet: {
                ...get().wallet,
                address: newAccount.address,
                network: newAccount.network,
              },
            })
            // Refresh balance for the new account
            setTimeout(() => get().refreshBalance(), 300)
          } else {
            // Account disconnected
            get().disconnect()
          }
        })
        _listenerCleanups.push(unsubAccount)

        const unsubNetwork = walletManager.onNetworkChange((network: NetworkType) => {
          set({
            wallet: {
              ...get().wallet,
              network,
            },
          })
        })
        _listenerCleanups.push(unsubNetwork)
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
        balanceStatus: 'error',
        lastBalanceRefreshAt: null,
        balanceError: errorMessage,
      })
      throw new Error(errorMessage)
    }
  },

  disconnect: async () => {
    const disconnectAddress = get().wallet.address
    try {
      await walletManager.disconnect()
    } catch (error) {
      console.error('Disconnect error:', error)
    }
    setSupabaseAleoAddress(null)
    import('./record-scanner').then(({ resetScanner }) => resetScanner()).catch(() => {})
    if (disconnectAddress) {
      _activeBalanceRefreshIds.delete(disconnectAddress)
      _privateBalanceZeroMisses.delete(disconnectAddress)
    }
    set({
      wallet: initialWalletState,
      error: null,
      balanceStatus: 'idle',
      lastBalanceRefreshAt: null,
      balanceError: null,
    })
  },

  refreshBalance: async () => {
    const { wallet } = get()
    if (!wallet.connected || !wallet.address) {
      return
    }

    const refreshAddress = wallet.address
    const currentBalance = wallet.balance
    const refreshId = ++_balanceRefreshSequence
    _activeBalanceRefreshIds.set(refreshAddress, refreshId)
    const applyBalanceUpdate = (
      balance: WalletBalance,
      status: BalanceStatus,
      errorMessage: string | null = null,
    ) => {
      const latestWallet = get().wallet
      if (!latestWallet.connected || latestWallet.address !== refreshAddress) return false
      if (_activeBalanceRefreshIds.get(refreshAddress) !== refreshId) return false

      set({
        wallet: {
          ...latestWallet,
          balance,
        },
        balanceStatus: status,
        lastBalanceRefreshAt: Date.now(),
        balanceError: errorMessage,
      })
      return true
    }

    set({
      balanceStatus: 'refreshing',
      balanceError: null,
    })

    try {
      // Public balances are fast and reliable, so publish them immediately.
      const [publicResult, usdcxPublicResult, usadPublicResult] = await Promise.allSettled([
        withTimeout(fetchPublicBalance(refreshAddress), 6_000, 'ALEO public balance'),
        withTimeout(fetchUsdcxPublicBalance(refreshAddress), 6_000, 'USDCX public balance'),
        withTimeout(fetchUsdcxPublicBalance(refreshAddress, 'test_usad_stablecoin.aleo'), 6_000, 'USAD public balance'),
      ])

      const publicBalance = publicResult.status === 'fulfilled' ? publicResult.value : currentBalance.public
      const usdcxPublic = usdcxPublicResult.status === 'fulfilled' ? usdcxPublicResult.value : currentBalance.usdcxPublic
      const usadPublic = usadPublicResult.status === 'fulfilled' ? usadPublicResult.value : currentBalance.usadPublic

      const publicErrors: string[] = []
      if (publicResult.status === 'rejected') publicErrors.push('ALEO public balance unavailable')
      if (usdcxPublicResult.status === 'rejected') publicErrors.push('USDCX public balance unavailable')
      if (usadPublicResult.status === 'rejected') publicErrors.push('USAD public balance unavailable')
      const hasPublicErrors = publicErrors.length > 0

      applyBalanceUpdate(
        {
          ...currentBalance,
          public: publicBalance,
          usdcxPublic,
          usadPublic,
        },
        'partial',
        publicErrors.length > 0 ? publicErrors.join(' · ') : null,
      )

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

      const normalizeRecords = (records: any): any[] => (
        Array.isArray(records) ? records : ((records as any)?.records || [])
      )

      const extractRecordText = (record: any, requiredField: 'microcredits' | 'amount'): string | null => {
        if (!record) return null
        if (typeof record === 'string') {
          return record.includes(requiredField) ? record : null
        }
        if (typeof record !== 'object') return null

        const directFields = [
          record.plaintext,
          record.text,
          record.content,
          record.recordPlaintext,
          record.record_plaintext,
          record.data,
          record.record,
        ]

        for (const field of directFields) {
          if (field == null) continue
          const text = String(field)
          if (text.includes(requiredField)) return text
        }

        for (const key of Object.keys(record)) {
          const value = record[key]
          if (value == null) continue
          const text = String(value)
          if (text.includes(requiredField) && text.includes('{')) return text
        }

        return null
      }

      const extractRecordCiphertext = (record: any): string | null => {
        if (!record || typeof record !== 'object') return null
        const candidates = [
          record.ciphertext,
          record.recordCiphertext,
          record.record_ciphertext,
        ]
        for (const candidate of candidates) {
          if (typeof candidate === 'string' && candidate.length > 0) {
            return candidate
          }
        }
        return null
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
      devLog('[Balance] Connected wallet type:', connectedType)

      // Helper: extract private balance from records array
      const sumRecordsBalance = (records: any, label: string): bigint => {
        let sum = 0n
        const recordsArr = normalizeRecords(records)
        if (recordsArr.length === 0) {
          devLog(`[Balance] ${label}: 0 records returned`)
          return 0n
        }
        let spentCount = 0
        let unspentCount = 0
        for (let i = 0; i < recordsArr.length; i++) {
          const record = recordsArr[i]
          if (isRecordSpent(record)) {
            spentCount++
            continue
          }
          unspentCount++
          const text = extractRecordText(record, 'microcredits') || JSON.stringify(record)
          const mc = parseMicrocredits(String(text))
          sum += mc
        }
        devLog(`[Balance] ${label}: ${recordsArr.length} records (${unspentCount} unspent, ${spentCount} spent) = ${Number(sum) / 1_000_000} ALEO`)
        return sum
      }

      const sumDecryptedCreditsRecords = async (records: any, label: string): Promise<bigint> => {
        const decryptFn = (window as any).__aleoDecrypt
        if (typeof decryptFn !== 'function') return 0n

        const recordsArr = normalizeRecords(records)
        if (recordsArr.length === 0) return 0n

        let sum = 0n
        let decryptedCount = 0

        for (const record of recordsArr) {
          if (isRecordSpent(record)) continue

          const plaintext = extractRecordText(record, 'microcredits')
          if (plaintext) {
            sum += parseMicrocredits(plaintext)
            continue
          }

          const ciphertext = extractRecordCiphertext(record)
          if (!ciphertext) continue

          try {
            const decrypted = await withTimeout(
              Promise.resolve(decryptFn(ciphertext)),
              3_500,
              `${label} decrypt`,
            )
            const text = String(decrypted)
            sum += parseMicrocredits(text)
            decryptedCount++
          } catch (error: any) {
            devLog(`[Balance] ${label} decrypt failed:`, error?.message || error)
          }
        }

        if (decryptedCount > 0) {
          devLog(`[Balance] ${label}: decrypted ${decryptedCount} record(s) = ${Number(sum) / 1_000_000} ALEO`)
        }

        return sum
      }

      // Fetch ALEO private balance with retry (same pattern as USDCX/USAD)
      for (let attempt = 0; attempt <= 2; attempt++) {
        if (privateBalance > 0n) break
        if (attempt > 0) {
          devLog(`[Balance] ALEO private retry ${attempt}/2...`)
          await new Promise(r => setTimeout(r, 1000))
        }

        // Try Shield wallet direct first (most reliable)
        if (privateBalance === 0n && connectedType === 'shield') {
          const shieldObj = (window as any).shield || (window as any).shieldWallet || (window as any).shieldAleo
          if (shieldObj) {
            if (typeof shieldObj.requestRecordPlaintexts === 'function') {
              try {
                devLog('[Balance] ALEO: Shield requestRecordPlaintexts(credits.aleo)...')
                const result = await withTimeout(
                  Promise.resolve(shieldObj.requestRecordPlaintexts('credits.aleo')),
                  4_000,
                  'Shield credits plaintext lookup',
                )
                privateBalance = sumRecordsBalance(result, 'ALEO-Shield-plaintexts')
                if (privateBalance > 0n) break
              } catch (err: any) {
                devLog('[Balance] ALEO Shield plaintexts failed:', err?.message || err)
              }
            }
            if (privateBalance === 0n && typeof shieldObj.requestRecords === 'function') {
              try {
                devLog('[Balance] ALEO: Shield requestRecords(credits.aleo)...')
                const result = await withTimeout(
                  Promise.resolve(shieldObj.requestRecords('credits.aleo')),
                  4_000,
                  'Shield credits record lookup',
                )
                privateBalance = sumRecordsBalance(result, 'ALEO-Shield-records')
                if (privateBalance > 0n) break
              } catch (err: any) {
                devLog('[Balance] ALEO Shield records failed:', err?.message || err)
              }
            }
          }
        }

        // Adapter API fallback
        if (privateBalance === 0n && (window as any).__aleoRequestRecordPlaintexts) {
          try {
            devLog('[Balance] ALEO: adapter requestRecordPlaintexts(credits.aleo)...')
            const records = await withTimeout(
              Promise.resolve((window as any).__aleoRequestRecordPlaintexts('credits.aleo')),
              4_500,
              'Wallet adapter credits plaintext lookup',
            )
            privateBalance = sumRecordsBalance(records, 'ALEO-adapter-plaintexts')
          } catch (err: any) {
            devLog('[Balance] ALEO adapter plaintexts failed:', err?.message || err)
          }
        }

        if (privateBalance === 0n && (window as any).__aleoRequestRecords) {
          try {
            devLog('[Balance] ALEO: adapter requestRecords(credits.aleo)...')
            const records = await withTimeout(
              Promise.resolve((window as any).__aleoRequestRecords('credits.aleo', true)),
              4_500,
              'Wallet adapter credits lookup',
            )
            privateBalance = sumRecordsBalance(records, 'ALEO-adapter')
            if (privateBalance === 0n) {
              const encryptedRecords = await withTimeout(
                Promise.resolve((window as any).__aleoRequestRecords('credits.aleo', false)),
                4_500,
                'Wallet adapter encrypted credits lookup',
              )
              privateBalance = await sumDecryptedCreditsRecords(encryptedRecords, 'ALEO-adapter-decrypt')
            }
        } catch (err: any) {
          devLog('[Balance] ALEO adapter failed:', err?.message || err)
        }
        }

        // walletManager fallback
        if (privateBalance === 0n) {
          try {
            devLog('[Balance] ALEO: walletManager.getRecords(credits.aleo)...')
            const records = await withTimeout(
              walletManager.getRecords('credits.aleo'),
              4_500,
              'walletManager credits lookup',
            )
            privateBalance = sumRecordsBalance(records, 'ALEO-walletManager')
            if (privateBalance === 0n) {
              privateBalance = await sumDecryptedCreditsRecords(records, 'ALEO-walletManager-decrypt')
            }
          } catch {
            // Non-critical
          }
        }
      }

      let reusedShieldPrivate = false
      if (connectedType === 'shield') {
        const stabilizedAleo = stabilizeShieldPrivateBalance(refreshAddress, 'private', privateBalance, currentBalance.private)
        privateBalance = stabilizedAleo.value
        reusedShieldPrivate = reusedShieldPrivate || stabilizedAleo.preserved
      }

      if (privateBalance > 0n) {
        devLog(`[Balance] ALEO private total: ${Number(privateBalance) / 1_000_000} ALEO`)
      } else {
        devLog('[Balance] ALEO private: 0 (records not found after 3 attempts)')
      }

      // Fetch USDCX private balance from Token records (non-blocking)
      // USDCX Token record has `amount` field (u128), not `microcredits`
      let usdcxPrivate = 0n
      const usdcxProgramId = config.usdcxProgramId || 'test_usdcx_stablecoin.aleo'

      // Helper: parse USDCX amount from record (looks for `amount` field)
      const parseUsdcxAmount = (text: string): bigint => {
        const patterns = [
          /amount["\s:]+(\d+)u128/,
          /amount["\s:]+(\d+)u64/,
          /amount["\s:]+(\d+)/,
          /"amount"\s*:\s*"?(\d+)/,
        ]
        for (const pattern of patterns) {
          const match = text.match(pattern)
          if (match) return BigInt(match[1])
        }
        return 0n
      }

      // Helper: sum USDCX Token records
      const sumUsdcxRecords = (records: any, label: string): bigint => {
        const arr = Array.isArray(records) ? records : (records?.records || [])
        if (arr.length === 0) return 0n
        let sum = 0n
        devLog(`[Balance] ${label}: ${arr.length} USDCX records`)
        for (const r of arr) {
          if (isRecordSpent(r)) continue
          if (r && typeof r === 'object') {
            const amt = r.amount ?? r.data?.amount
            if (amt !== undefined) {
              const cleaned = String(amt).replace(/[ui]\d+\.?\w*$/i, '').trim()
              const digits = cleaned.replace(/[^\d]/g, '')
              if (digits) { sum += BigInt(digits); continue }
            }
          }
          const text = typeof r === 'string' ? r
            : (r?.plaintext || r?.data || r?.record || r?.content || JSON.stringify(r))
          sum += parseUsdcxAmount(String(text))
        }
        return sum
      }

      // Helper: fetch private token balance with retry for Shield wallet
      const fetchPrivateTokenBalance = async (
        programId: string,
        label: string,
        maxRetries: number = 2,
      ): Promise<bigint> => {
        let result = 0n

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          if (attempt > 0) {
            devLog(`[Balance] ${label} retry ${attempt}/${maxRetries}...`)
            await new Promise(r => setTimeout(r, 1000)) // Wait 1s between retries
          }

          // Method 1: Shield wallet direct (most reliable for Shield)
          if (result === 0n && connectedType === 'shield') {
            const shieldObj = (window as any).shield || (window as any).shieldWallet || (window as any).shieldAleo
            if (shieldObj) {
              // Try requestRecordPlaintexts first (returns plaintext directly)
              if (typeof shieldObj.requestRecordPlaintexts === 'function') {
                try {
                  devLog(`[Balance] ${label}: Shield requestRecordPlaintexts(${programId})...`)
                  const records = await withTimeout(
                    Promise.resolve(shieldObj.requestRecordPlaintexts(programId)),
                    4_000,
                    `${label} Shield plaintext lookup`,
                  )
                  result = sumUsdcxRecords(records, `${label}-Shield-plaintexts`)
                  if (result > 0n) break
                } catch (err: any) {
                  devLog(`[Balance] ${label} Shield plaintexts failed:`, err?.message || err)
                }
              }
              // Fallback: requestRecords
              if (result === 0n && typeof shieldObj.requestRecords === 'function') {
                try {
                  devLog(`[Balance] ${label}: Shield requestRecords(${programId})...`)
                  const records = await withTimeout(
                    Promise.resolve(shieldObj.requestRecords(programId)),
                    4_000,
                    `${label} Shield record lookup`,
                  )
                  result = sumUsdcxRecords(records, `${label}-Shield-records`)
                  if (result > 0n) break
                } catch (err: any) {
                  devLog(`[Balance] ${label} Shield records failed:`, err?.message || err)
                }
              }
            }
          }

          // Method 2: Adapter API (works for all wallet types)
          if (result === 0n) {
            const requestRecords = (window as any).__aleoRequestRecords
            if (typeof requestRecords === 'function') {
              try {
                devLog(`[Balance] ${label}: adapter requestRecords(${programId})...`)
                const records = await withTimeout(
                  Promise.resolve(requestRecords(programId, true)),
                  4_500,
                  `${label} adapter lookup`,
                )
                result = sumUsdcxRecords(records, `${label}-adapter`)
                if (result > 0n) break
              } catch (err: any) {
                devLog(`[Balance] ${label} adapter failed:`, err?.message || err)
              }
            }
          }

          // Method 3: walletManager fallback
          if (result === 0n) {
            try {
              devLog(`[Balance] ${label}: walletManager.getRecords(${programId})...`)
              const records = await withTimeout(
                walletManager.getRecords(programId),
                4_500,
                `${label} walletManager lookup`,
              )
              result = sumUsdcxRecords(records, `${label}-walletManager`)
              if (result > 0n) break
            } catch {
              // Non-critical
            }
          }

          // If all methods returned 0 on first try, retry (Shield sometimes needs warmup)
          if (result > 0n) break
        }

        if (result > 0n) {
          devLog(`[Balance] ${label} private total: ${Number(result) / 1_000_000}`)
        } else {
          devLog(`[Balance] ${label} private: 0 (records not found after ${maxRetries + 1} attempts)`)
        }
        return result
      }

      // Fetch USDCX and USAD private balances (with retry)
      usdcxPrivate = await fetchPrivateTokenBalance(usdcxProgramId, 'USDCX')

      // Fetch USAD private balance (same helper with retry)
      let usadPrivate = 0n
      const usadProgramId = 'test_usad_stablecoin.aleo'
      usadPrivate = await fetchPrivateTokenBalance(usadProgramId, 'USAD')

      if (connectedType === 'shield') {
        const stabilizedUsdcx = stabilizeShieldPrivateBalance(refreshAddress, 'usdcxPrivate', usdcxPrivate, currentBalance.usdcxPrivate)
        usdcxPrivate = stabilizedUsdcx.value
        reusedShieldPrivate = reusedShieldPrivate || stabilizedUsdcx.preserved

        const stabilizedUsad = stabilizeShieldPrivateBalance(refreshAddress, 'usadPrivate', usadPrivate, currentBalance.usadPrivate)
        usadPrivate = stabilizedUsad.value
        reusedShieldPrivate = reusedShieldPrivate || stabilizedUsad.preserved
      }

      // Record Scanner fallback — if wallet methods missed any private balances
      if (privateBalance === 0n || usdcxPrivate === 0n || usadPrivate === 0n) {
        try {
          const { getAllPrivateBalances } = await import('./record-scanner');
          const scanned = await withTimeout(
            getAllPrivateBalances(),
            8_000,
            'Record scanner private balance scan',
          )
          if (privateBalance === 0n && scanned.aleoPrivate > 0n) {
            privateBalance = scanned.aleoPrivate;
            devLog(`[Balance] Scanner found ALEO private: ${Number(scanned.aleoPrivate) / 1_000_000}`)
          }
          if (usdcxPrivate === 0n && scanned.usdcxPrivate > 0n) {
            usdcxPrivate = scanned.usdcxPrivate;
            devLog(`[Balance] Scanner found USDCX private: ${Number(scanned.usdcxPrivate) / 1_000_000}`)
          }
          if (usadPrivate === 0n && scanned.usadPrivate > 0n) {
            usadPrivate = scanned.usadPrivate;
            devLog(`[Balance] Scanner found USAD private: ${Number(scanned.usadPrivate) / 1_000_000}`)
          }
        } catch {
          devLog('[Balance] Record scanner fallback unavailable')
        }
      }

      const balance: WalletBalance = { public: publicBalance, private: privateBalance, usdcxPublic, usdcxPrivate, usadPublic, usadPrivate }
      const isPartial = hasPublicErrors || reusedShieldPrivate || (connectedType === 'shield' && privateBalance === 0n)
      const balanceError = isPartial
        ? hasPublicErrors
          ? publicErrors.join(' · ')
          : reusedShieldPrivate
            ? 'Using the last successful private balance scan because Shield returned empty records on this refresh.'
          : 'Showing public balances immediately; private ALEO balance may take longer to detect in Shield.'
        : null

      devLog('[Balance] Final:', {
        public: `${Number(publicBalance) / 1_000_000} ALEO`,
        private: `${Number(privateBalance) / 1_000_000} ALEO`,
        usdcxPublic: `${Number(usdcxPublic) / 1_000_000} USDCX`,
        usdcxPrivate: `${Number(usdcxPrivate) / 1_000_000} USDCX`,
        usadPublic: `${Number(usadPublic) / 1_000_000} USAD`,
        usadPrivate: `${Number(usadPrivate) / 1_000_000} USAD`,
      })

      applyBalanceUpdate(balance, isPartial ? 'partial' : 'ready', balanceError)
    } catch (error) {
      console.error('Failed to refresh balance:', error)
      const latestWallet = get().wallet
      if (latestWallet.connected && latestWallet.address === refreshAddress && _activeBalanceRefreshIds.get(refreshAddress) === refreshId) {
        set({
          balanceStatus: 'error',
          balanceError: error instanceof Error ? error.message : 'Failed to refresh balance',
          lastBalanceRefreshAt: Date.now(),
        })
      }
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
    devLog('Test transaction submitted:', txId)

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

type MockOutcomeSpec = {
  label: string
  percentage: number
}

// Mock-only helper to seed reserve-looking fields for demo cards.
// Real market quotes and previews come from the parity helpers in `lib/amm.ts`.
const seedMockMarketFields = (outcomes: MockOutcomeSpec[], totalVolume: bigint) => {
  const totalPercentage = outcomes.reduce((sum, outcome) => sum + outcome.percentage, 0)
  const safeTotal = totalPercentage > 0 ? totalPercentage : outcomes.length
  const outcomePrices = outcomes.map(outcome => outcome.percentage / safeTotal)
  const outcomePercentages = outcomePrices.map(price => price * 100)
  const outcomePayouts = outcomePrices.map(price => price > 0 ? 1 / price : 0)

  // These reserves are only for placeholder UI data and are not treated as
  // contract-parity quotes. Higher-probability outcomes get smaller reserves
  // so the cards still feel directionally correct in demo mode.
  const liquidityBudget = Number(totalVolume) * Math.max(2, outcomes.length)
  const inverseWeights = outcomePrices.map(price => Math.max(0.05, 1 - price))
  const inverseTotal = inverseWeights.reduce((sum, weight) => sum + weight, 0)
  const reserves = inverseWeights.map(weight => BigInt(Math.max(1, Math.floor(liquidityBudget * (weight / inverseTotal)))))

  return {
    yesReserve: reserves[0] ?? 0n,
    noReserve: reserves[1] ?? 0n,
    reserve3: reserves[2] ?? 0n,
    reserve4: reserves[3] ?? 0n,
    totalLiquidity: reserves.reduce((sum, reserve) => sum + reserve, 0n),
    totalLPShares: 0n,
    outcomePrices,
    outcomePercentages,
    outcomePayouts,
    numOutcomes: outcomes.length,
    outcomeLabels: outcomes.map(outcome => outcome.label),
    totalYesIssued: BigInt(Math.floor(Number(totalVolume) * outcomePrices[0])),
    totalNoIssued: BigInt(Math.floor(Number(totalVolume) * (outcomePrices[1] ?? 0))),
  }
}

const seedMockBinaryMarketFields = (
  outcomeOnePercentage: number,
  totalVolume: bigint,
  labels: [string, string] = ['Yes', 'No'],
) =>
  seedMockMarketFields(
    [
      { label: labels[0], percentage: outcomeOnePercentage },
      { label: labels[1], percentage: 100 - outcomeOnePercentage },
    ],
    totalVolume,
  )

// ============================================================================
// MOCK DATA FOR DEMONSTRATION
// ============================================================================
// These markets are for UI demonstration only and are NOT on-chain.
// Real markets created via the "Create Market" modal will be stored on-chain
// in the veiled_markets_v37.aleo program.
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
    description: 'Binary market with outcomes Above $150k and Below $150k, based on whether Bitcoin trades at or above $150,000 on a major exchange before March 31, 2026 11:59 PM UTC.',
    category: 3,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 65 * 24 * 60 * 60),
    resolutionDeadline: BigInt(Math.floor(Date.now() / 1000) + 68 * 24 * 60 * 60),
    status: 1,
    totalVolume: 2500000000n, // 2500 ALEO
    totalBets: 342,
    ...seedMockBinaryMarketFields(62.5, 2500000000n, ['Above $150k', 'Below $150k']),
    creator: 'aleo1rhgdu77hgyqd3xjj8ucu3jj9r2krwz6mnzyd80gncr5fxcwlh5rsvzp9px',
    timeRemaining: '65d',
    resolutionSource: 'CoinGecko API',
    tags: ['Bitcoin', 'Price Prediction', 'Hot'],
  },
  {
    id: 'market_002',
    question: 'Will Ethereum flip Bitcoin in market cap by 2027?',
    description: 'Binary market with Flippening and No Flippening outcomes, based on whether Ethereum market capitalization exceeds Bitcoin before January 1, 2027.',
    category: 3,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60),
    resolutionDeadline: BigInt(Math.floor(Date.now() / 1000) + 370 * 24 * 60 * 60),
    status: 1,
    totalVolume: 1800000000n,
    totalBets: 567,
    ...seedMockBinaryMarketFields(18.2, 1800000000n, ['Flippening', 'No Flippening']),
    creator: 'aleo1rhgdu77hgyqd3xjj8ucu3jj9r2krwz6mnzyd80gncr5fxcwlh5rsvzp9px',
    timeRemaining: '365d',
    resolutionSource: 'CoinMarketCap',
    tags: ['Ethereum', 'Bitcoin', 'Flippening'],
  },
  {
    id: 'market_003',
    question: 'Which milestone lands first before end of 2026?',
    description: 'Race market across three outcomes: SOL reaches $500 first, ETH reaches $10,000 first, or neither milestone is hit before December 31, 2026.',
    category: 3,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 340 * 24 * 60 * 60),
    resolutionDeadline: BigInt(Math.floor(Date.now() / 1000) + 345 * 24 * 60 * 60),
    status: 1,
    totalVolume: 980000000n,
    totalBets: 234,
    ...seedMockMarketFields([
      { label: 'SOL hits $500 first', percentage: 37 },
      { label: 'ETH hits $10k first', percentage: 41 },
      { label: 'Neither in 2026', percentage: 22 },
    ], 980000000n),
    creator: 'aleo1rhgdu77hgyqd3xjj8ucu3jj9r2krwz6mnzyd80gncr5fxcwlh5rsvzp9px',
    timeRemaining: '340d',
    resolutionSource: 'CoinGecko API',
    tags: ['Solana', 'Ethereum', '3-Way'],
  },
  {
    id: 'market_004',
    question: 'Will Aleo token price exceed $1 by June 2026?',
    description: 'Binary market with Above $1.00 and At or Below $1.00 outcomes for the ALEO token before June 30, 2026.',
    category: 3,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 155 * 24 * 60 * 60),
    resolutionDeadline: BigInt(Math.floor(Date.now() / 1000) + 160 * 24 * 60 * 60),
    status: 1,
    totalVolume: 3200000000n,
    totalBets: 892,
    ...seedMockBinaryMarketFields(71.8, 3200000000n, ['Above $1.00', 'At or Below $1.00']),
    creator: 'aleo1rhgdu77hgyqd3xjj8ucu3jj9r2krwz6mnzyd80gncr5fxcwlh5rsvzp9px',
    timeRemaining: '155d',
    resolutionSource: 'CoinGecko API',
    tags: ['Aleo', 'Price', 'Featured'],
  },
  // === ECONOMICS MARKETS ===
  {
    id: 'market_005',
    question: 'What will the Fed do at the February 2026 meeting?',
    description: 'Three-way macro market: cut, hold, or hike at the February 2026 FOMC decision.',
    category: 6,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 14 * 24 * 60 * 60),
    resolutionDeadline: BigInt(Math.floor(Date.now() / 1000) + 16 * 24 * 60 * 60),
    status: 1,
    totalVolume: 1450000000n,
    totalBets: 423,
    ...seedMockMarketFields([
      { label: 'Cut', percentage: 28 },
      { label: 'Hold', percentage: 58 },
      { label: 'Hike', percentage: 14 },
    ], 1450000000n),
    creator: 'aleo1rhgdu77hgyqd3xjj8ucu3jj9r2krwz6mnzyd80gncr5fxcwlh5rsvzp9px',
    timeRemaining: '14d',
    resolutionSource: 'Federal Reserve',
    tags: ['Fed', 'Macro', '3-Way'],
  },
  {
    id: 'market_006',
    question: 'Will US inflation drop below 2% by Q2 2026?',
    description: 'Binary macro market with Below 2% CPI and 2% or Higher CPI outcomes, based on official US CPI year-over-year readings during Q2 2026.',
    category: 6,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 120 * 24 * 60 * 60),
    resolutionDeadline: BigInt(Math.floor(Date.now() / 1000) + 125 * 24 * 60 * 60),
    status: 1,
    totalVolume: 890000000n,
    totalBets: 312,
    ...seedMockBinaryMarketFields(42.1, 890000000n, ['Below 2% CPI', '2% or Higher']),
    creator: 'aleo1rhgdu77hgyqd3xjj8ucu3jj9r2krwz6mnzyd80gncr5fxcwlh5rsvzp9px',
    timeRemaining: '120d',
    resolutionSource: 'Bureau of Labor Statistics',
    tags: ['Inflation', 'Economy'],
  },
  // === TECH MARKETS ===
  {
    id: 'market_007',
    question: 'Will Apple announce Apple Intelligence 2.0 at WWDC 2026?',
    description: 'Binary market with Major AI launch and No major AI launch outcomes, based on Apple announcements at WWDC 2026.',
    category: 5,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 135 * 24 * 60 * 60),
    resolutionDeadline: BigInt(Math.floor(Date.now() / 1000) + 140 * 24 * 60 * 60),
    status: 1,
    totalVolume: 1230000000n,
    totalBets: 456,
    ...seedMockBinaryMarketFields(72.4, 1230000000n, ['Major AI launch', 'No major AI launch']),
    creator: 'aleo1rhgdu77hgyqd3xjj8ucu3jj9r2krwz6mnzyd80gncr5fxcwlh5rsvzp9px',
    timeRemaining: '135d',
    resolutionSource: 'Apple Official Announcement',
    tags: ['Apple', 'AI', 'WWDC'],
  },
  {
    id: 'market_008',
    question: 'When will OpenAI release GPT-5?',
    description: 'Three-way timeline market covering a launch before July 2026, a launch in the second half of 2026, or no public release during 2026.',
    category: 5,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 160 * 24 * 60 * 60),
    resolutionDeadline: BigInt(Math.floor(Date.now() / 1000) + 165 * 24 * 60 * 60),
    status: 1,
    totalVolume: 2100000000n,
    totalBets: 678,
    ...seedMockMarketFields([
      { label: 'Before Jul 2026', percentage: 46 },
      { label: 'H2 2026', percentage: 34 },
      { label: 'Not in 2026', percentage: 20 },
    ], 2100000000n),
    creator: 'aleo1rhgdu77hgyqd3xjj8ucu3jj9r2krwz6mnzyd80gncr5fxcwlh5rsvzp9px',
    timeRemaining: '160d',
    resolutionSource: 'OpenAI Official',
    tags: ['OpenAI', 'GPT-5', '3-Way'],
  },
  // === SPORTS MARKETS ===
  {
    id: 'market_009',
    question: 'Who will win the 2025-26 Champions League?',
    description: 'Four-way winner market across Real Madrid, Arsenal, PSG, or any other club lifting the UEFA Champions League trophy.',
    category: 2,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 120 * 24 * 60 * 60),
    resolutionDeadline: BigInt(Math.floor(Date.now() / 1000) + 122 * 24 * 60 * 60),
    status: 1,
    totalVolume: 1560000000n,
    totalBets: 534,
    ...seedMockMarketFields([
      { label: 'Real Madrid', percentage: 19 },
      { label: 'Arsenal', percentage: 24 },
      { label: 'PSG', percentage: 21 },
      { label: 'Other club', percentage: 36 },
    ], 1560000000n),
    creator: 'aleo1rhgdu77hgyqd3xjj8ucu3jj9r2krwz6mnzyd80gncr5fxcwlh5rsvzp9px',
    timeRemaining: '120d',
    resolutionSource: 'UEFA Official',
    tags: ['Champions League', 'Football', '4-Way'],
  },
  {
    id: 'market_010',
    question: 'Will the Super Bowl 2026 have over 110M US viewers?',
    description: 'Binary audience market with Over 110M viewers and 110M or fewer viewers outcomes using official Nielsen ratings for Super Bowl LX.',
    category: 2,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 20 * 24 * 60 * 60),
    resolutionDeadline: BigInt(Math.floor(Date.now() / 1000) + 25 * 24 * 60 * 60),
    status: 1,
    totalVolume: 780000000n,
    totalBets: 289,
    ...seedMockBinaryMarketFields(67.2, 780000000n, ['Over 110M viewers', '110M or fewer']),
    creator: 'aleo1rhgdu77hgyqd3xjj8ucu3jj9r2krwz6mnzyd80gncr5fxcwlh5rsvzp9px',
    timeRemaining: '20d',
    resolutionSource: 'Nielsen Ratings',
    tags: ['Super Bowl', 'NFL', 'Trending'],
  },
  // === POLITICS MARKETS ===
  {
    id: 'market_011',
    question: 'Will a new crypto regulation bill pass US Congress in 2026?',
    description: 'Binary policy market with Bill signed and No bill signed outcomes, based on whether a comprehensive US crypto regulation bill becomes law during 2026.',
    category: 1,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 340 * 24 * 60 * 60),
    resolutionDeadline: BigInt(Math.floor(Date.now() / 1000) + 345 * 24 * 60 * 60),
    status: 1,
    totalVolume: 920000000n,
    totalBets: 367,
    ...seedMockBinaryMarketFields(45.8, 920000000n, ['Bill signed', 'No bill signed']),
    creator: 'aleo1rhgdu77hgyqd3xjj8ucu3jj9r2krwz6mnzyd80gncr5fxcwlh5rsvzp9px',
    timeRemaining: '340d',
    resolutionSource: 'US Congress Records',
    tags: ['Regulation', 'Crypto', 'Politics'],
  },
  // === ENDING SOON ===
  {
    id: 'market_012',
    question: 'Will ETH close above $4,000 this week?',
    description: 'Binary weekly market with Above $4k close and Below $4k close outcomes, based on the Ethereum price at Sunday 11:59 PM UTC.',
    category: 3,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 3 * 24 * 60 * 60),
    resolutionDeadline: BigInt(Math.floor(Date.now() / 1000) + 4 * 24 * 60 * 60),
    status: 1,
    totalVolume: 650000000n,
    totalBets: 198,
    ...seedMockBinaryMarketFields(52.3, 650000000n, ['Above $4k close', 'Below $4k close']),
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
  placeBet: (marketId: string, amount: bigint, outcome: string) => Promise<string>  // Legacy method
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
  markBetUnclaimed: (betId: string) => void
  reconcileClaimedBets: () => Promise<number>
  getBetsByMarket: (marketId: string) => Bet[]
  getTotalBetsValue: () => bigint
  getCommitmentRecords: (marketId?: string) => CommitmentRecord[]
  getPendingReveals: () => CommitmentRecord[]
  flushToSupabase: () => Promise<void>
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
    sharesSold: bet.sharesSold ? BigInt(bet.sharesSold) : undefined,
    tokensReceived: bet.tokensReceived ? BigInt(bet.tokensReceived) : undefined,
    payoutAmount: bet.payoutAmount ? BigInt(bet.payoutAmount) : undefined,
  }
}

function serializeBetForStorage(bet: Bet): any {
  return {
    ...bet,
    amount: bet.amount.toString(),
    sharesReceived: bet.sharesReceived?.toString(),
    sharesSold: bet.sharesSold?.toString(),
    tokensReceived: bet.tokensReceived?.toString(),
    payoutAmount: bet.payoutAmount?.toString(),
  }
}

// Helper to load bets from localStorage (per-address), with deduplication
function loadBetsFromStorage(address?: string): Bet[] {
  if (typeof window === 'undefined' || !address) return []
  try {
    const saved = localStorage.getItem(getBetsKey(address))
    if (!saved) return []
    const parsed = JSON.parse(saved)
    const bets: Bet[] = parsed.map(parseBetFromStorage)
    // Deduplicate by bet ID (keep last occurrence which has the most recent status)
    const byId = new Map<string, Bet>()
    for (const bet of bets) byId.set(bet.id, bet)
    const deduped = Array.from(byId.values())
    if (deduped.length < bets.length) {
      devWarn(`[Bets] Deduped ${bets.length - deduped.length} duplicate bets from localStorage`)
      // Save cleaned data back
      const serializable = deduped.map(serializeBetForStorage)
      localStorage.setItem(getBetsKey(address), JSON.stringify(serializable))
    }
    return deduped
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
  const { address, encryptionKey } = useWalletStore.getState().wallet
  if (typeof window === 'undefined' || !address) {
    devWarn('[Bets] savePendingBetsToStorage SKIPPED — no address:', address)
    return
  }
  try {
    const serializable = bets.map(serializeBetForStorage)
    const key = getPendingBetsKey(address)
    localStorage.setItem(key, JSON.stringify(serializable))
    devWarn(`[Bets] Saved ${bets.length} pending bets to localStorage key: ${key}`)
    // Sync to Supabase (encrypted if key available, plaintext otherwise)
    if (isSupabaseAvailable()) {
      sbUpsertPendingBets(bets, address, encryptionKey).catch(err =>
        devWarn('[Supabase] Failed to sync pending bets:', err)
      )
    }
  } catch (e) {
    console.error('[Bets] Failed to save pending bets to storage:', e)
  }
}

// Helper to save bets to localStorage (per-address)
function saveBetsToStorage(bets: Bet[]) {
  const { address, encryptionKey } = useWalletStore.getState().wallet
  if (typeof window === 'undefined' || !address) return
  try {
    const serializable = bets.map(serializeBetForStorage)
    localStorage.setItem(getBetsKey(address), JSON.stringify(serializable))
    // Sync to Supabase (encrypted if key available, plaintext otherwise)
    if (isSupabaseAvailable()) {
      sbUpsertBets(bets, address, encryptionKey).catch(err =>
        devWarn('[Supabase] Failed to sync bets:', err)
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
// SECURITY: betAmountRecordPlaintext is stripped before persistence — it contains
// decrypted credits record data that should not be stored in localStorage or Supabase.
function saveCommitmentRecordsToStorage(records: CommitmentRecord[]) {
  const { address, encryptionKey } = useWalletStore.getState().wallet
  if (typeof window === 'undefined' || !address) return
  try {
    const serializable = records.map(record => ({
      ...record,
      amount: record.amount.toString(),
      betAmountRecordPlaintext: '[REDACTED]',
    }))
    localStorage.setItem(getCommitmentsKey(address), JSON.stringify(serializable))
    // Sync to Supabase (encrypted if key available, plaintext otherwise)
    if (isSupabaseAvailable()) {
      sbUpsertCommitments(records, address, encryptionKey).catch(err =>
        devWarn('[Supabase] Failed to sync commitments:', err)
      )
    }
  } catch (e) {
    console.error('Failed to save commitment records to storage:', e)
  }
}

// ---- Wallet record refresh helper ----
// After a bet is confirmed on-chain, try to fetch actual OutcomeShare records
// from the wallet and update sharesReceived with the real on-chain quantity.
// Best-effort: silently fails if wallet doesn't support record fetching.

async function refreshSharesFromWallet(
  bet: Bet,
  get: () => { userBets: Bet[] },
  set: (partial: Partial<{ userBets: Bet[] }>) => void,
) {
  try {
    const { fetchOutcomeShareRecords } = await import('./credits-record')
    const records = await fetchOutcomeShareRecords(CONTRACT_INFO.programId, bet.marketId)
    if (records.length === 0) return

    // Match by outcome (1-indexed)
    const outcomeNum = outcomeToIndex(bet.outcome)
    const matching = records.filter(r => r.outcome === outcomeNum)
    if (matching.length === 0) return

    // Use the record with the largest quantity (in case of multiple records for same outcome)
    const bestMatch = matching.reduce((a, b) => a.quantity > b.quantity ? a : b)

    if (bestMatch.quantity !== bet.sharesReceived) {
      devWarn(`[Bets] Updating sharesReceived from wallet record: ${bet.sharesReceived?.toString()} → ${bestMatch.quantity.toString()}`)
      const updatedBets = get().userBets.map(b =>
        b.id === bet.id ? { ...b, sharesReceived: bestMatch.quantity } : b
      )
      set({ userBets: updatedBets })
      saveBetsToStorage(updatedBets)
    }
  } catch (err) {
    // Wallet may not support record fetching — stored minShares value is already correct
    devLog('[Bets] refreshSharesFromWallet failed (non-critical):', err)
  }
}

// ---- Supabase background sync helpers ----

async function syncFromSupabase(
  address: string,
  set: (partial: Partial<{ userBets: Bet[]; pendingBets: Bet[]; commitmentRecords: CommitmentRecord[] }>) => void,
  get: () => { userBets: Bet[]; pendingBets: Bet[]; commitmentRecords: CommitmentRecord[] }
) {
  try {
    // Wait for encryption key if not yet available (WalletBridge may still be deriving it)
    let encryptionKey = useWalletStore.getState().wallet.encryptionKey
    if (!encryptionKey) {
      for (let i = 0; i < 5; i++) {
        await new Promise(r => setTimeout(r, 2000))
        encryptionKey = useWalletStore.getState().wallet.encryptionKey
        if (encryptionKey) break
      }
    }
    const [remoteBets, remotePending, remoteCommitments] = await Promise.all([
      sbFetchBets(address, encryptionKey),
      sbFetchPendingBets(address, encryptionKey),
      sbFetchCommitments(address, encryptionKey),
    ])

    const latestWallet = useWalletStore.getState().wallet
    if (!latestWallet.connected || latestWallet.address !== address) {
      devWarn(`[Supabase] Ignoring stale bets sync for ${address.slice(0, 12)}...`)
      return
    }

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
    devWarn('[Supabase] Background sync failed:', error)
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

async function resolvePendingBetStatus(bet: Bet): Promise<{
  status: 'confirmed' | 'rejected' | 'pending';
  transactionId?: string;
}> {
  if (bet.id.startsWith('at1')) {
    const diagnosis = await diagnoseTransaction(bet.id)
    if (diagnosis.status === 'accepted') {
      return { status: 'confirmed', transactionId: bet.id }
    }
    if (diagnosis.status === 'rejected') {
      return { status: 'rejected', transactionId: bet.id }
    }
  }

  const walletStatus = await lookupWalletTransactionStatus(bet.id)
  const resolvedTxId = walletStatus?.transactionId

  if (resolvedTxId?.startsWith('at1')) {
    try {
      const diagnosis = await diagnoseTransaction(resolvedTxId)
      if (diagnosis.status === 'accepted') {
        return { status: 'confirmed', transactionId: resolvedTxId }
      }
      if (diagnosis.status === 'rejected') {
        return { status: 'rejected', transactionId: resolvedTxId }
      }
    } catch {
      // Fall back to the wallet-native status below.
    }
  }

  if (walletStatus?.status === 'accepted') {
    return { status: 'confirmed', transactionId: resolvedTxId }
  }

  if (walletStatus?.status === 'rejected') {
    return { status: 'rejected', transactionId: resolvedTxId }
  }

  return { status: 'pending', transactionId: resolvedTxId }
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

      // Build inputs for the active market contract.
      // ALEO uses buy_shares_private, stablecoins use Token.record + MerkleProof.
      const tokenType = market?.tokenType || 'ALEO'
      const outcomeNum = outcomeToIndex(outcome)

      let creditsRecord: string | undefined

      if (tokenType === 'ALEO') {
        const { fetchCreditsRecord } = await import('./credits-record')
        const gasBuffer = 500_000
        const totalNeeded = Number(amount) + gasBuffer
        const record = await fetchCreditsRecord(totalNeeded, walletState.address)
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
        tokenType as 'ALEO' | 'USDCX' | 'USAD',
        creditsRecord,
      )

      if (tokenType === 'USDCX' || tokenType === 'USAD') {
        const [{ findTokenRecord }, { buildMerkleProofsForAddress }] = await Promise.all([
          import('./private-stablecoin'),
          import('./aleo-client'),
        ])

        const tokenRecord = await findTokenRecord(tokenType, amount)
        if (!tokenRecord) {
          throw new Error(
            `No private ${tokenType} Token record found with at least ${(Number(amount) / 1_000_000).toFixed(2)} ${tokenType}.`
          )
        }

        inputs.push(tokenRecord)
        const walletAddress = useWalletStore.getState().wallet.address
        if (!walletAddress) {
          throw new Error('Wallet address is unavailable. Please reconnect your wallet and try again.')
        }
        inputs.push(await buildMerkleProofsForAddress(walletAddress))
      }

      devLog('=== PLACE BET DEBUG ===')
      devLog('Market ID:', marketId)
      devLog('Amount:', amount.toString())
      devLog('Outcome:', outcome)
      devLog('Function:', betFunctionName)
      devLog('Program ID:', CONTRACT_INFO.programId)

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
      const programId = getProgramIdForToken(tokenType)
      const transactionId = await walletManager.requestTransaction({
        programId,
        functionName: betFunctionName,
        inputs,
        fee: 1.5, // 1.5 ALEO fee for v31
        recordIndices: tokenType === 'USDCX' || tokenType === 'USAD' ? [6] : undefined,
      })

      devLog('Bet transaction submitted:', transactionId)

      // Immediately refresh balance
      setTimeout(() => {
        useWalletStore.getState().refreshBalance()
      }, 1000)

      // Calculate locked multiplier for display
      const idx = outcomeToIndex(outcome) - 1 // 0-indexed
      const lockedMultiplier = market?.outcomePayouts?.[idx]

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
          devLog(`Refreshing balance after ${delay}ms...`)
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
              const alreadyExists = get().userBets.some(b => b.id === transactionId)
              const updatedBets = alreadyExists ? get().userBets : [...get().userBets, activeBet]
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
              devLog('Transaction confirmed, final balance refresh...')
              useWalletStore.getState().refreshBalance()
              // Best-effort: refresh sharesReceived from actual wallet record
              refreshSharesFromWallet(activeBet, get, set)
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
            const alreadyExists = get().userBets.some(b => b.id === transactionId)
            const updatedBets = alreadyExists ? get().userBets : [...get().userBets, activeBet]
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
        devLog('Transaction submitted via Leo Wallet (UUID event ID). Marking as active.')
        devLog('User can find the real transaction ID in their Leo Wallet extension.')

        // Short delay then mark as active (the wallet accepted it)
        setTimeout(() => {
          const activeBet = { ...newBet, status: 'active' as const }
          const alreadyExists = get().userBets.some(b => b.id === transactionId)
          const updatedBets = alreadyExists ? get().userBets : [...get().userBets, activeBet]
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
          // Best-effort: refresh sharesReceived from actual wallet record
          refreshSharesFromWallet(activeBet, get, set)
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
    devWarn('[Bets] addPendingBet called:', {
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
      devWarn('[Bets] Skip duplicate pending bet:', bet.id)
      return
    }

    const updatedPending = [...get().pendingBets, bet]
    set({ pendingBets: updatedPending })
    savePendingBetsToStorage(updatedPending)
    devWarn('[Bets] Added pending bet:', bet.id, 'total pending:', updatedPending.length)

    // Verify it was saved to localStorage
    if (address) {
      const saved = localStorage.getItem(`veiled_markets_pending_${address}`)
      devWarn('[Bets] localStorage verification:', saved ? `${JSON.parse(saved).length} bets saved` : 'EMPTY/NULL')
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
    const inPending = get().pendingBets.some(b => b.id === pendingBetId)
    const inActive = get().userBets.some(b => b.id === pendingBetId)

    if (!inPending && !inActive) return

    if (inPending) {
      const updatedPending = get().pendingBets.filter(b => b.id !== pendingBetId)
      set({ pendingBets: updatedPending })
      savePendingBetsToStorage(updatedPending)
    }

    // Also remove from userBets if already auto-promoted (e.g. syncBetStatuses ran before failed status arrived)
    if (inActive) {
      const updatedBets = get().userBets.filter(b => b.id !== pendingBetId)
      set({ userBets: updatedBets })
      saveBetsToStorage(updatedBets)
      devWarn(`[Bets] Removed failed/rejected bet ${pendingBetId.slice(0, 20)}... from userBets`)
    }

    const address = useWalletStore.getState().wallet.address
    if (isSupabaseAvailable() && address) {
      sbRemovePendingBet(pendingBetId, address)
      if (inActive) {
        sbRemoveUserBet(pendingBetId, address)
      }
    }
  },

  // Phase 2: Commit-Reveal Scheme - Store commitment data from SDK worker
  storeCommitment: (commitment: CommitmentRecord) => {
    const updatedCommitments = [...get().commitmentRecords, commitment]
    set({ commitmentRecords: updatedCommitments })
    saveCommitmentRecordsToStorage(updatedCommitments)
    devLog('Commitment stored:', commitment.id, 'market:', commitment.marketId)
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
    devLog('Commitment revealed:', commitmentId, 'tx:', revealTxId)
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

      devLog(`Imported ${newRecords.length} new commitments (${imported.length - newRecords.length} duplicates skipped)`)
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
            outcome: outcomeToString(parseInt(r.data.outcome)),
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

      const latestWallet = useWalletStore.getState().wallet
      if (!latestWallet.connected || latestWallet.address !== address) {
        devWarn(`[Bets] Ignoring stale fetchUserBets result for ${address.slice(0, 12)}...`)
        return
      }

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

      const latestWallet = useWalletStore.getState().wallet
      if (!latestWallet.connected || latestWallet.address !== address) {
        devWarn(`[Bets] Ignoring stale fetchUserBets fallback for ${address.slice(0, 12)}...`)
        return
      }

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
    // --- Reconcile pending bets using on-chain + native wallet status ---
    const pendingSnapshot = [...get().pendingBets]
    if (pendingSnapshot.length > 0) {
      const confirmed: Array<{ pendingId: string; confirmedTxId?: string }> = []
      const rejected: string[] = []

      for (const bet of pendingSnapshot) {
        try {
          const resolution = await resolvePendingBetStatus(bet)
          if (resolution.status === 'confirmed') {
            devWarn(
              `[Bets] Pending bet ${bet.id.slice(0, 20)}... confirmed${resolution.transactionId && resolution.transactionId !== bet.id ? ` as ${resolution.transactionId.slice(0, 20)}...` : ''}`
            )
            confirmed.push({ pendingId: bet.id, confirmedTxId: resolution.transactionId })
          } else if (resolution.status === 'rejected') {
            devWarn(`[Bets] Pending bet ${bet.id.slice(0, 20)}... was rejected → removing`)
            rejected.push(bet.id)
          }
        } catch (err) {
          devWarn(`[Bets] Pending bet ${bet.id.slice(0, 20)}... still unresolved`, err)
        }
      }

      for (const item of confirmed) {
        get().confirmPendingBet(item.pendingId, item.confirmedTxId)
        const activeId = item.confirmedTxId || item.pendingId
        const activeBet = useBetsStore.getState().userBets.find(b => b.id === activeId)
        if (activeBet) {
          refreshSharesFromWallet(activeBet, get, set)
        }
      }

      for (const betId of rejected) {
        get().removePendingBet(betId)
      }

      if (confirmed.length > 0 || rejected.length > 0) {
        devWarn(
          `[Bets] Reconciled pending bets: ${confirmed.length} confirmed, ${rejected.length} rejected`
        )
      }
    }

    // --- Repair legacy false-active bets whose original tx was actually rejected ---
    const rejectedActiveBetIds: string[] = []
    for (const bet of get().userBets) {
      if (bet.status !== 'active' || bet.type === 'sell' || !bet.id.startsWith('at1')) continue
      try {
        const diagnosis = await diagnoseTransaction(bet.id)
        if (diagnosis.status === 'rejected') {
          rejectedActiveBetIds.push(bet.id)
        }
      } catch {
        // Keep bet unchanged if diagnosis is temporarily unavailable.
      }
    }

    if (rejectedActiveBetIds.length > 0) {
      devWarn(`[Bets] Removing ${rejectedActiveBetIds.length} legacy active bet(s) whose tx was rejected on-chain`)
      for (const betId of rejectedActiveBetIds) {
        get().removePendingBet(betId)
      }
    }

    // --- Sync active bet statuses with market state ---
    // Sell bets are already settled (shares burned, tokens received) — skip them.
    const bets = get().userBets
    const activeBets = bets.filter(b => b.status === 'active' && b.type !== 'sell')
    if (activeBets.length === 0) return

    // Get unique market IDs (only real on-chain markets ending with 'field')
    const marketIds = [...new Set(activeBets.map(b => b.marketId))]
      .filter(id => id.endsWith('field'))

    const updates: Array<{ betId: string; newStatus: Bet['status']; payoutAmount?: bigint; winningOutcome?: string }> = []

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
          if (!resolution) continue

          const winningOutcome = outcomeToString(resolution.winning_outcome)

          for (const bet of marketBets) {
            if (bet.outcome === winningOutcome) {
              // FPMM: winning shares redeem 1:1 (payout = number of shares)
              const payoutAmount = bet.sharesReceived || bet.amount
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

  markBetUnclaimed: (betId: string) => {
    const updatedBets = get().userBets.map(bet =>
      bet.id === betId ? { ...bet, claimed: false } : bet
    )
    set({ userBets: updatedBets })
    saveBetsToStorage(updatedBets)
  },

  reconcileClaimedBets: async () => {
    const { connected, address } = useWalletStore.getState().wallet
    if (!connected || !address) return 0

    const claimedBets = get().userBets.filter(bet =>
      bet.claimed
      && bet.type !== 'sell'
      && (bet.status === 'won' || bet.status === 'refunded')
    )

    if (claimedBets.length === 0) return 0

    try {
      const { fetchOutcomeShareRecords } = await import('./credits-record')
      const restoredBetIds = new Set<string>()
      const groups = new Map<string, Bet[]>()

      for (const bet of claimedBets) {
        const tokenType = (bet.tokenType || 'ALEO') as 'ALEO' | 'USDCX' | 'USAD'
        const groupKey = `${getProgramIdForToken(tokenType)}::${bet.marketId}`
        const existing = groups.get(groupKey) || []
        existing.push(bet)
        groups.set(groupKey, existing)
      }

      for (const bets of groups.values()) {
        const sampleBet = bets[0]
        const tokenType = (sampleBet.tokenType || 'ALEO') as 'ALEO' | 'USDCX' | 'USAD'
        const programId = getProgramIdForToken(tokenType)

        let records = await fetchOutcomeShareRecords(programId, sampleBet.marketId)
        records = records.filter(record => !record.owner || record.owner === address)

        if (records.length === 0) continue

        const remainingRecords = [...records]
        for (const bet of bets) {
          const expectedOutcome = outcomeToIndex(bet.outcome)
          const expectedQuantity = bet.sharesReceived || bet.amount
          const matchIndex = remainingRecords.findIndex(record =>
            (!record.marketId || record.marketId === bet.marketId)
            && record.outcome === expectedOutcome
            && record.quantity === expectedQuantity
          )

          if (matchIndex >= 0) {
            restoredBetIds.add(bet.id)
            remainingRecords.splice(matchIndex, 1)
          }
        }
      }

      if (restoredBetIds.size === 0) return 0

      const updatedBets = get().userBets.map(bet =>
        restoredBetIds.has(bet.id)
          ? { ...bet, claimed: false }
          : bet
      )

      set({ userBets: updatedBets })
      saveBetsToStorage(updatedBets)
      devWarn(`[Bets] Restored ${restoredBetIds.size} claimed bet(s) after wallet reconciliation`)
      return restoredBetIds.size
    } catch (err) {
      devWarn('[Bets] Failed to reconcile claimed bets:', err)
      return 0
    }
  },

  getBetsByMarket: (marketId) => {
    return get().userBets.filter(bet => bet.marketId === marketId)
  },

  getTotalBetsValue: () => {
    return get().userBets.reduce((total, bet) => total + bet.amount, 0n)
  },

  // Flush all local bet data to Supabase with encryption.
  // Called by WalletBridge after encryption key is derived to ensure
  // no plaintext data leaks into the database.
  flushToSupabase: async () => {
    const { address, encryptionKey } = useWalletStore.getState().wallet
    if (!address || !isSupabaseAvailable()) return

    const { userBets, pendingBets, commitmentRecords } = get()
    devWarn(`[Bets] Flushing to Supabase: ${userBets.length} bets, ${pendingBets.length} pending, ${commitmentRecords.length} commitments`)

    try {
      await Promise.all([
        userBets.length > 0 ? sbUpsertBets(userBets, address, encryptionKey) : Promise.resolve(),
        pendingBets.length > 0 ? sbUpsertPendingBets(pendingBets, address, encryptionKey) : Promise.resolve(),
        commitmentRecords.length > 0 ? sbUpsertCommitments(commitmentRecords, address, encryptionKey) : Promise.resolve(),
      ])
      devWarn('[Bets] Supabase flush complete')
    } catch (err) {
      devWarn('[Bets] Supabase flush failed:', err)
    }
  },
}))

// ============================================================================
// UI Store (for persistent preferences)
// ============================================================================

interface UIStore {
  theme: 'dark'
  sidebarOpen: boolean
  notificationsEnabled: boolean

  // Actions
  setTheme: (_theme: 'dark' | 'light') => void
  toggleTheme: () => void
  toggleSidebar: () => void
  setNotificationsEnabled: (enabled: boolean) => void
}

/** Apply theme class to <html> element */
function applyThemeToDOM() {
  const root = document.documentElement
  root.classList.add('dark')
  root.classList.remove('light')
  root.style.colorScheme = 'dark'
}

export const useUIStore = create<UIStore>()(
  persist(
    (set: (partial: Partial<UIStore>) => void, get: () => UIStore) => ({
      theme: 'dark' as const,
      sidebarOpen: true,
      notificationsEnabled: true,

      setTheme: (_theme: 'light' | 'dark') => {
        applyThemeToDOM()
        set({ theme: 'dark' })
      },
      toggleTheme: () => {
        applyThemeToDOM()
        set({ theme: 'dark' })
      },
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
  4: 'Culture',
  5: 'AI & Tech',
  6: 'Macro',
  7: 'Science',
  8: 'Climate',
  99: 'Other',
}

export const CATEGORY_ICONS: Record<number, string> = {
  1: '🏛',
  2: '⚽',
  3: '₿',
  4: '🎭',
  5: '🤖',
  6: '📈',
  7: '🔬',
  8: '🌍',
  99: '🔮',
}
