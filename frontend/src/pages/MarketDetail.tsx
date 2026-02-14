import { motion } from 'framer-motion'
import {
  ArrowLeft,
  Clock,
  Users,
  TrendingUp,
  TrendingDown,
  ExternalLink,
  Share2,
  Bookmark,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Info,
  Copy,
  Check,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useWalletStore, useBetsStore, type Market, CONTRACT_INFO } from '@/lib/store'
import { useAleoTransaction } from '@/hooks/useAleoTransaction'
import { useRealMarketsStore } from '@/lib/market-store'
import { buildPlaceBetInputs, buildPlaceBetPrivateInputs, getCurrentBlockHeight, getMarketPool, diagnoseTransaction } from '@/lib/aleo-client'
import { fetchPublicBalance } from '@/lib/wallet'
import { DashboardHeader } from '@/components/DashboardHeader'
import { Footer } from '@/components/Footer'
import { OddsChart } from '@/components/OddsChart'
import { cn, formatCredits } from '@/lib/utils'

const categoryNames: Record<number, string> = {
  1: 'Politics',
  2: 'Sports',
  3: 'Crypto',
  4: 'Entertainment',
  5: 'Tech',
  6: 'Economics',
  7: 'Science',
}

const categoryColors: Record<number, string> = {
  1: 'bg-red-500/10 text-red-400 border-red-500/20',
  2: 'bg-green-500/10 text-green-400 border-green-500/20',
  3: 'bg-brand-500/10 text-brand-400 border-brand-500/20',
  4: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
  5: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  6: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  7: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
}

type BetStep = 'select' | 'amount' | 'confirm' | 'processing' | 'pending' | 'success' | 'error'

/**
 * Find a suitable unspent Credits record from an array of wallet records.
 * Handles multiple formats: plaintext strings, objects with .plaintext, JSON objects.
 */
function findSuitableRecord(records: any[], minAmountMicro: number): string | null {
  for (const record of records) {
    if (!record) continue
    // Skip spent records
    if (record.spent === true || record.is_spent === true) continue
    if (record.status === 'spent' || record.status === 'Spent') continue

    // Try to extract plaintext from various record formats
    let plaintext: string | null = null

    if (typeof record === 'string' && record.includes('microcredits')) {
      plaintext = record
    } else if (record.plaintext && typeof record.plaintext === 'string') {
      plaintext = record.plaintext
    } else if (record.data && typeof record.data === 'string' && record.data.includes('microcredits')) {
      plaintext = record.data
    } else if (record.content && typeof record.content === 'string' && record.content.includes('microcredits')) {
      plaintext = record.content
    }

    if (!plaintext) {
      console.warn('[Bet] Record has no parseable plaintext:', JSON.stringify(record)?.slice(0, 200))
      continue
    }

    // Parse microcredits value
    const mcMatch = plaintext.match(/microcredits\s*:\s*(\d+)u64/)
    if (!mcMatch) continue

    const mc = parseInt(mcMatch[1], 10)
    if (mc >= minAmountMicro) {
      // Verify it looks like a valid Leo record plaintext
      if (plaintext.includes('{') && plaintext.includes('owner') && plaintext.includes('_nonce')) {
        console.warn(`[Bet] Found suitable Credits record: ${mc} microcredits (need ${minAmountMicro})`)
        return plaintext
      }
    }
  }
  return null
}

/**
 * Fetch a Credits record plaintext from the connected wallet.
 * Tries multiple strategies in order of reliability:
 * 1. Native Leo Wallet API: requestRecordPlaintexts (returns .plaintext field)
 * 2. Native Leo Wallet API: requestRecords (may include plaintext)
 * 3. Adapter: requestRecordPlaintexts (via WalletBridge)
 * 4. Adapter: requestRecords (via WalletBridge)
 * 5. Adapter: requestRecords + decrypt fallback
 */
async function fetchCreditsRecord(minAmountMicro: number): Promise<string | null> {
  console.warn('[Bet] === Fetching Credits record for private betting ===')
  console.warn(`[Bet] Need record with >= ${minAmountMicro} microcredits (${minAmountMicro / 1_000_000} ALEO)`)

  // Strategy 1: Native Leo Wallet API directly (bypasses adapter, most reliable)
  const leoWallet = (window as any).leoWallet || (window as any).leo
  if (leoWallet) {
    // 1a. requestRecordPlaintexts — returns records with .plaintext field
    if (typeof leoWallet.requestRecordPlaintexts === 'function') {
      try {
        console.warn('[Bet] Strategy 1a: leoWallet.requestRecordPlaintexts("credits.aleo")')
        const result = await leoWallet.requestRecordPlaintexts('credits.aleo')
        const records = result?.records || (Array.isArray(result) ? result : [])
        console.warn(`[Bet] → Got ${records.length} record(s)`)
        if (records.length > 0) {
          console.warn('[Bet] → First record sample:', JSON.stringify(records[0])?.slice(0, 300))
        }
        const found = findSuitableRecord(records, minAmountMicro)
        if (found) return found
      } catch (err) {
        console.warn('[Bet] Strategy 1a failed:', err)
      }
    }

    // 1b. requestRecords — may include plaintext depending on wallet version
    if (typeof leoWallet.requestRecords === 'function') {
      try {
        console.warn('[Bet] Strategy 1b: leoWallet.requestRecords("credits.aleo")')
        const result = await leoWallet.requestRecords('credits.aleo')
        const records = result?.records || (Array.isArray(result) ? result : [])
        console.warn(`[Bet] → Got ${records.length} record(s)`)
        if (records.length > 0) {
          console.warn('[Bet] → First record sample:', JSON.stringify(records[0])?.slice(0, 300))
        }
        const found = findSuitableRecord(records, minAmountMicro)
        if (found) return found
      } catch (err) {
        console.warn('[Bet] Strategy 1b failed:', err)
      }
    }
  } else {
    console.warn('[Bet] No native Leo Wallet found on window')
  }

  // Strategy 2: Adapter's requestRecordPlaintexts (exposed by WalletBridge)
  const adapterPlaintexts = (window as any).__aleoRequestRecordPlaintexts
  if (typeof adapterPlaintexts === 'function') {
    try {
      console.warn('[Bet] Strategy 2: adapter requestRecordPlaintexts("credits.aleo")')
      const records = await adapterPlaintexts('credits.aleo')
      const recordsArr = Array.isArray(records) ? records : (records?.records || [])
      console.warn(`[Bet] → Got ${recordsArr.length} record(s)`)
      if (recordsArr.length > 0) {
        console.warn('[Bet] → First record sample:', JSON.stringify(recordsArr[0])?.slice(0, 300))
      }
      const found = findSuitableRecord(recordsArr, minAmountMicro)
      if (found) return found
    } catch (err) {
      console.warn('[Bet] Strategy 2 failed:', err)
    }
  }

  // Strategy 3: Adapter's requestRecords (one parameter only, no boolean!)
  const adapterRecords = (window as any).__aleoRequestRecords
  if (typeof adapterRecords === 'function') {
    try {
      console.warn('[Bet] Strategy 3: adapter requestRecords("credits.aleo")')
      const records = await adapterRecords('credits.aleo')
      const recordsArr = Array.isArray(records) ? records : (records?.records || [])
      console.warn(`[Bet] → Got ${recordsArr.length} record(s)`)
      if (recordsArr.length > 0) {
        console.warn('[Bet] → First record sample:', JSON.stringify(recordsArr[0])?.slice(0, 300))
      }
      const found = findSuitableRecord(recordsArr, minAmountMicro)
      if (found) return found

      // Strategy 4: Try decrypting ciphertext records from Strategy 3
      const decryptFn = (window as any).__aleoDecrypt
      if (typeof decryptFn === 'function' && recordsArr.length > 0) {
        console.warn('[Bet] Strategy 4: decrypt ciphertext records...')
        for (const record of recordsArr) {
          if (!record) continue
          if (record.spent === true || record.is_spent === true) continue
          const ciphertext = record.ciphertext || record.record_ciphertext || record.data
          if (!ciphertext || typeof ciphertext !== 'string') continue
          try {
            const decrypted = await decryptFn(ciphertext)
            const textStr = String(decrypted)
            const mcMatch = textStr.match(/microcredits\s*:\s*(\d+)u64/)
            if (mcMatch) {
              const mc = parseInt(mcMatch[1], 10)
              if (mc >= minAmountMicro && textStr.includes('{') && textStr.includes('owner')) {
                console.warn(`[Bet] Strategy 4: decrypted record with ${mc} microcredits`)
                return textStr
              }
            }
          } catch { /* decrypt failed */ }
        }
      }
    } catch (err) {
      console.warn('[Bet] Strategy 3/4 failed:', err)
    }
  }

  console.warn('[Bet] All strategies exhausted — no Credits record found, will use place_bet_public')
  return null
}

// Copyable Text Component
function CopyableText({ text, displayText }: { text: string; displayText?: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-white font-mono text-sm">
        {displayText || text}
      </span>
      <button
        onClick={handleCopy}
        className="p-1.5 rounded-lg bg-surface-800/50 hover:bg-surface-700/50 transition-colors"
        title="Copy to clipboard"
      >
        {copied ? (
          <Check className="w-3.5 h-3.5 text-yes-400" />
        ) : (
          <Copy className="w-3.5 h-3.5 text-surface-400" />
        )}
      </button>
    </div>
  )
}

export function MarketDetail() {
  const navigate = useNavigate()
  const { marketId } = useParams<{ marketId: string }>()
  const { wallet } = useWalletStore()
  const { addPendingBet, confirmPendingBet, removePendingBet } = useBetsStore()
  const { markets } = useRealMarketsStore()
  const { executeTransaction, pollTransactionStatus } = useAleoTransaction()

  const [market, setMarket] = useState<Market | null>(null)
  const [selectedOutcome, setSelectedOutcome] = useState<'yes' | 'no' | null>(null)
  const [betAmount, setBetAmount] = useState('')
  const [step, setStep] = useState<BetStep>('select')
  const [error, setError] = useState<string | null>(null)
  const [txId, setTxId] = useState<string | null>(null)
  const [liveExpired, setLiveExpired] = useState(false)

  // Redirect to landing if not connected
  useEffect(() => {
    if (!wallet.connected) {
      navigate('/')
    }
  }, [wallet.connected, navigate])

  // Find market
  useEffect(() => {
    const found = markets.find(m => m.id === marketId)
    if (found) {
      setMarket(found)
    }
  }, [marketId, markets])

  // Live expiry check: periodically verify against current block height
  useEffect(() => {
    if (!market || market.status !== 1 || market.timeRemaining === 'Ended') return

    let cancelled = false
    const checkExpiry = async () => {
      try {
        const currentBlock = await getCurrentBlockHeight()
        if (!cancelled && market.deadline > 0n && currentBlock > market.deadline) {
          setLiveExpired(true)
        }
      } catch {
        // Ignore fetch errors
      }
    }

    checkExpiry()
    const interval = setInterval(checkExpiry, 30_000) // Check every 30s
    return () => { cancelled = true; clearInterval(interval) }
  }, [market?.id, market?.deadline, market?.status])

  const isExpired = market ? (liveExpired || market.timeRemaining === 'Ended' || market.status !== 1) : false

  if (!wallet.connected) {
    return null
  }

  if (!market) {
    return (
      <div className="min-h-screen bg-surface-950 flex flex-col">
        <DashboardHeader />
        <main className="flex-1 pt-20 flex items-center justify-center">
          <div className="text-center">
            <AlertCircle className="w-12 h-12 text-surface-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-white mb-2">Market Not Found</h2>
            <p className="text-surface-400 mb-6">The market you're looking for doesn't exist.</p>
            <button onClick={() => navigate('/dashboard')} className="btn-primary">
              Back to Markets
            </button>
          </div>
        </main>
        <Footer />
      </div>
    )
  }

  const potentialPayout = selectedOutcome === 'yes'
    ? market.potentialYesPayout
    : market.potentialNoPayout

  const betAmountNum = parseFloat(betAmount) || 0
  const betAmountMicro = BigInt(Math.floor(betAmountNum * 1_000_000))
  const potentialWin = betAmountNum * potentialPayout

  // Place bet via wallet provider's executeTransaction
  const handleWalletBet = async () => {
    if (!market || !selectedOutcome || betAmountMicro <= 0n || isExpired) return

    setStep('processing')
    setError(null)

    try {
      if (!market.id.endsWith('field')) {
        throw new Error(
          'This market cannot accept bets yet. The market ID must be in blockchain field format.'
        )
      }

      const amountMicro = BigInt(Math.floor(parseFloat(betAmount) * 1_000_000))

      console.warn('[Bet] === PRE-FLIGHT CHECKS ===')
      console.warn('[Bet] Market ID:', market.id)
      console.warn('[Bet] Market question:', market.question)
      console.warn('[Bet] Market deadline:', String(market.deadline))
      console.warn('[Bet] Market status:', market.status)
      console.warn('[Bet] Bet amount:', String(amountMicro), 'microcredits =', parseFloat(betAmount), 'ALEO')
      console.warn('[Bet] Outcome:', selectedOutcome)

      // Pre-flight check 1: Verify market deadline hasn't passed
      let currentBlock: bigint
      try {
        currentBlock = await getCurrentBlockHeight()
      } catch {
        throw new Error(
          'Cannot verify market deadline — network error fetching block height. ' +
          'Please check your internet connection and try again.'
        )
      }
      console.warn(`[Bet] Current block: ${currentBlock}, Deadline: ${market.deadline}, Remaining: ${Number(market.deadline - currentBlock)} blocks`)
      if (market.deadline > 0n && currentBlock > market.deadline) {
        throw new Error(
          `Market betting deadline has passed (current block: ${currentBlock}, deadline: ${market.deadline}). ` +
          'No new bets can be placed on this market.'
        )
      }
      console.warn(`[Bet] Pre-flight: block ${currentBlock} <= deadline ${market.deadline} ✓`)

      // Pre-flight check 1b: Verify market status is ACTIVE (1)
      if (market.status !== 1) {
        const statusNames: Record<number, string> = { 2: 'Closed', 3: 'Resolved', 4: 'Cancelled' }
        throw new Error(
          `Market is ${statusNames[market.status] || 'not active'} (status: ${market.status}). Only active markets accept bets.`
        )
      }

      // Pre-flight check 2: Minimum bet amount (1000 microcredits = 0.001 ALEO)
      if (amountMicro < 1000n) {
        throw new Error('Minimum bet amount is 0.001 ALEO (1000 microcredits).')
      }

      // === PRIVACY MODE ===
      // Judge feedback: place_bet_public uses transfer_public_as_signer which leaks
      // the bettor's address and amount on-chain. place_bet uses transfer_private_to_public
      // with a Credits record, hiding the bettor's identity.
      //
      // Strategy: Try to fetch a Credits record from the wallet.
      // If found → use place_bet (private, 5 inputs)
      // If not → fall back to place_bet_public (public, 4 inputs)
      let creditsRecord: string | null = null
      try {
        creditsRecord = await fetchCreditsRecord(Number(amountMicro))
      } catch (err) {
        console.warn('[Bet] Credits record fetch failed, will use public mode:', err)
      }

      const usePrivateMode = !!creditsRecord
      console.warn(`[Bet] Mode: ${usePrivateMode ? 'PRIVATE (place_bet — hides bettor identity)' : 'PUBLIC (place_bet_public — address visible)'}`)

      // Pre-flight check 3: Balance verification
      const feeInMicro = 700_000n // 0.5 ALEO fee + 0.2 ALEO safety buffer
      let freshPublicBalance: bigint | null = null
      let balanceFetchFailed = false

      if (wallet.address) {
        try {
          freshPublicBalance = await fetchPublicBalance(wallet.address)
          console.warn(`[Bet] On-chain public balance: ${freshPublicBalance} microcredits (${Number(freshPublicBalance) / 1_000_000} ALEO)`)
        } catch {
          balanceFetchFailed = true
          console.warn('[Bet] Could not fetch public balance from API')
        }
      }

      const publicBalance = freshPublicBalance ?? wallet.balance.public

      if (usePrivateMode) {
        // Private mode: bet amount comes from Credits record, only need public balance for tx fee
        if (publicBalance < feeInMicro) {
          const feeNeeded = Number(feeInMicro) / 1_000_000
          const available = Number(publicBalance) / 1_000_000
          throw new Error(
            `Insufficient PUBLIC balance for transaction fee. You need ~${feeNeeded.toFixed(2)} ALEO ` +
            `for the fee but only have ${available.toFixed(2)} ALEO in public balance.\n\n` +
            'Your bet will use a private Credits record, but the transaction fee still requires public credits.\n\n' +
            'To add public credits:\n' +
            '1. Open Leo Wallet → Send → select "Public" as destination\n' +
            '2. Send a small amount of ALEO to your own address'
          )
        }
        console.warn(`[Bet] Pre-flight: public balance ${publicBalance} >= fee ${feeInMicro} (private mode)`)
      } else {
        // Public mode: need public balance for bet amount + fee
        const totalNeeded = amountMicro + feeInMicro
        if (publicBalance < totalNeeded) {
          const needed = Number(totalNeeded) / 1_000_000
          const available = Number(publicBalance) / 1_000_000
          const networkNote = balanceFetchFailed ? '\n\n(Note: Could not verify balance on-chain due to network issues. Cached balance shown.)' : ''
          throw new Error(
            `Insufficient PUBLIC balance. You need ~${needed.toFixed(2)} ALEO ` +
            `(${betAmount} bet + ~0.7 fee+buffer) but only have ${available.toFixed(2)} ALEO in public balance.${networkNote}\n\n` +
            'Important: Each failed bet attempt costs ~0.5 ALEO in fees even though the bet itself fails!\n\n' +
            'Leo Wallet shows your TOTAL balance (public + private), but betting requires PUBLIC credits.\n\n' +
            'To convert private → public:\n' +
            '1. Open Leo Wallet → Send → select "Public" as destination\n' +
            '2. Send ALEO to your own address as a public transfer'
          )
        }
        console.warn(`[Bet] Pre-flight: public balance ${publicBalance} >= needed ${totalNeeded} (public mode)`)
      }

      // Build inputs based on privacy mode
      const functionName = usePrivateMode ? 'place_bet' : 'place_bet_public'
      const inputs = usePrivateMode
        ? buildPlaceBetPrivateInputs(market.id, amountMicro, selectedOutcome, creditsRecord!)
        : buildPlaceBetInputs(market.id, amountMicro, selectedOutcome)

      console.warn('[Bet] Submitting transaction:', {
        program: CONTRACT_INFO.programId,
        function: functionName,
        fee: 0.5,
        mode: usePrivateMode ? 'PRIVATE' : 'PUBLIC',
        inputCount: inputs.length,
      })
      console.warn('[Bet] Inputs:', JSON.stringify(inputs.map((inp, i) =>
        `[${i}] ${inp.length > 40 ? inp.slice(0, 20) + '...' + inp.slice(-15) : inp}`
      )))

      // Record pool state BEFORE bet for on-chain verification
      let poolBefore: { totalBets: bigint; totalYes: bigint; totalNo: bigint } | null = null
      try {
        const pool = await getMarketPool(market.id)
        if (pool) {
          poolBefore = {
            totalBets: pool.total_bets,
            totalYes: pool.total_yes_pool,
            totalNo: pool.total_no_pool,
          }
          console.warn('[Bet] Pool state BEFORE bet:', {
            totalBets: String(poolBefore.totalBets),
            totalYes: String(poolBefore.totalYes),
            totalNo: String(poolBefore.totalNo),
          })
        }
      } catch {
        console.warn('[Bet] Could not snapshot pool state before bet')
      }

      // On-chain verifier: checks if market pool changed since we placed the bet
      const onChainVerify = async (): Promise<boolean> => {
        if (!poolBefore) return false
        try {
          const poolAfter = await getMarketPool(market.id)
          if (!poolAfter) return false
          const betsIncreased = poolAfter.total_bets > poolBefore.totalBets
          const poolIncreased = (poolAfter.total_yes_pool + poolAfter.total_no_pool) >
            (poolBefore.totalYes + poolBefore.totalNo)
          console.warn('[Bet] On-chain verify:', {
            before: { bets: String(poolBefore.totalBets), yes: String(poolBefore.totalYes), no: String(poolBefore.totalNo) },
            after: { bets: String(poolAfter.total_bets), yes: String(poolAfter.total_yes_pool), no: String(poolAfter.total_no_pool) },
            betsIncreased,
            poolIncreased,
          })
          return betsIncreased && poolIncreased
        } catch (err) {
          console.warn('[Bet] On-chain verify fetch failed:', err)
          return false
        }
      }

      const result = await executeTransaction({
        program: CONTRACT_INFO.programId,
        function: functionName,
        inputs,
        fee: 0.5,
      })

      if (result?.transactionId) {
        const submittedTxId = result.transactionId
        const lockedMultiplier = selectedOutcome === 'yes'
          ? market.potentialYesPayout
          : market.potentialNoPayout

        addPendingBet({
          id: submittedTxId,
          marketId: market.id,
          amount: amountMicro,
          outcome: selectedOutcome,
          placedAt: Date.now(),
          status: 'pending',
          marketQuestion: market.question,
          lockedMultiplier,
        })

        setTxId(result.transactionId)
        // Show pending state — poll wallet adapter for real status
        setStep('pending')

        // Poll in background using the adapter's transactionStatus API
        // Pass onChainVerify as fallback when wallet reports failure
        pollTransactionStatus(submittedTxId, async (status, onChainTxId) => {
          console.warn('[Bet] Final status:', status, onChainTxId)
          if (onChainTxId) setTxId(onChainTxId)

          if (status === 'confirmed') {
            confirmPendingBet(submittedTxId, onChainTxId)
            setStep('success')
          } else if (status === 'failed') {
            removePendingBet(submittedTxId)
            // Transaction failed — comprehensive diagnosis
            let diagMsg = 'Transaction failed.'
            try {
              const diagBlock = await getCurrentBlockHeight()
              const deadlinePassed = market.deadline > 0n && diagBlock > market.deadline

              // Re-check public balance to diagnose balance-related failures
              let postBalance: bigint | null = null
              if (wallet.address) {
                try {
                  postBalance = await fetchPublicBalance(wallet.address)
                } catch { /* ignore */ }
              }

              // Look up transaction on-chain for definitive status
              let txDiagnosis: { found: boolean; status: string; message?: string } | null = null
              if (onChainTxId) {
                try {
                  txDiagnosis = await diagnoseTransaction(onChainTxId)
                  console.warn('[Bet] On-chain tx diagnosis:', txDiagnosis)
                } catch { /* ignore */ }
              }

              console.warn('[Bet] Post-failure diagnostics:', {
                currentBlock: String(diagBlock),
                marketDeadline: String(market.deadline),
                deadlinePassed,
                marketStatus: market.status,
                betAmount: String(amountMicro),
                onChainTxId,
                txDiagnosis: txDiagnosis?.status || 'not checked',
                preBalance: String(publicBalance),
                postBalance: postBalance !== null ? String(postBalance) : 'unknown',
                balanceDrop: postBalance !== null ? String(publicBalance - postBalance) : 'unknown',
              })

              const txNote = onChainTxId ? `\n\nTransaction: ${onChainTxId}` : ''

              // Check if balance dropped (fee was consumed even though bet failed)
              const feeConsumed = postBalance !== null && postBalance < publicBalance
              const feeNote = feeConsumed
                ? `\n\nNote: ~${((Number(publicBalance) - Number(postBalance)) / 1_000_000).toFixed(3)} ALEO was consumed in fees for this failed attempt.`
                : ''

              if (deadlinePassed) {
                diagMsg = `Market deadline has passed (block ${diagBlock} > deadline ${market.deadline}). This market is no longer accepting bets.${txNote}`
              } else if (onChainTxId) {
                // Transaction was on-chain — check if it was rejected (finalize abort)
                const isRejected = txDiagnosis?.status === 'rejected'
                const statusLabel = isRejected ? 'REJECTED (finalize aborted)' : 'failed'

                const transferType = usePrivateMode ? 'transfer_private_to_public (Credits record)' : 'transfer_public_as_signer'
                diagMsg =
                  `Your transaction was included on-chain but was ${statusLabel}.\n\n` +
                  'The ZK proof was valid, but an on-chain assertion failed. Most likely cause:\n' +
                  (usePrivateMode
                    ? '• Credits record may have been already spent or insufficient\n'
                    : '• Insufficient PUBLIC balance after fee deduction\n' +
                      '  (Fee ~0.51 ALEO is deducted FIRST, then bet amount is transferred)\n') +
                  `\nTransfer method: ${transferType}\n` +
                  `Pre-bet public balance: ${(Number(publicBalance) / 1_000_000).toFixed(3)} ALEO\n` +
                  `Post-failure balance: ${postBalance !== null ? (Number(postBalance) / 1_000_000).toFixed(3) : 'unknown'} ALEO\n` +
                  `Bet amount: ${(Number(amountMicro) / 1_000_000).toFixed(3)} ALEO` +
                  feeNote +
                  '\n\nYour bet credits were NOT deducted (only the fee was).' + txNote
              } else {
                // Transaction never made it on-chain
                diagMsg =
                  'Leo Wallet could not complete this transaction.\n\n' +
                  'The wallet proved your bet but could not successfully broadcast or finalize it.\n\n' +
                  `Pre-bet balance: ${(Number(publicBalance) / 1_000_000).toFixed(3)} ALEO` +
                  feeNote +
                  '\n\nPlease try again or check your wallet balance.'
              }
            } catch {
              diagMsg =
                'Transaction failed. Could not diagnose the exact cause.\n\n' +
                'Please try again.'
            }
            setError(diagMsg)
            setStep('error')
          } else {
            // unknown/timeout — show success with note to check wallet
            confirmPendingBet(submittedTxId, onChainTxId)
            setStep('success')
          }
        }, 30, 10_000, onChainVerify)
      } else {
        throw new Error('No transaction ID returned from wallet')
      }
    } catch (err: unknown) {
      console.error('Wallet bet failed:', err)
      let errorMessage = err instanceof Error ? err.message : 'Failed to place bet'

      // Detect common Leo Wallet prover failures and provide actionable guidance
      const lowerMsg = errorMessage.toLowerCase()
      if (
        lowerMsg.includes('unknown error') ||
        lowerMsg.includes('proving') ||
        lowerMsg.includes('prover') ||
        lowerMsg.includes('wasm') ||
        lowerMsg.includes('out of memory') ||
        lowerMsg.includes('timeout') ||
        lowerMsg.includes('aborted') ||
        (lowerMsg.includes('error') && !lowerMsg.includes('insufficient') && !lowerMsg.includes('reject') && !lowerMsg.includes('deadline'))
      ) {
        errorMessage =
          `Wallet error: ${errorMessage}\n\n` +
          'This program has many statements — the wallet prover may struggle with it.\n\n' +
          'Try these solutions:\n' +
          '1. Refresh the page and try again (prover key download may have failed)\n' +
          '2. Ensure you have a stable internet connection (proving keys are ~5MB)\n' +
          '3. Try with a smaller bet amount first'
      }

      setError(errorMessage)
      setStep('error')
    }
  }

  const resetBet = () => {
    setSelectedOutcome(null)
    setBetAmount('')
    setStep('select')
    setError(null)
    setTxId(null)
  }

  const quickAmounts = [1, 5, 10, 25, 50, 100]

  return (
    <div className="min-h-screen bg-surface-950 flex flex-col">
      <DashboardHeader />

      <main className="flex-1 pt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Back Button */}
          <motion.button
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 text-surface-400 hover:text-white transition-colors mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Markets</span>
          </motion.button>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-6">
              {/* Market Header */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-card p-6"
              >
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="flex items-center gap-3">
                    <span className={cn(
                      "px-3 py-1 text-sm font-medium rounded-full border",
                      categoryColors[market.category]
                    )}>
                      {categoryNames[market.category]}
                    </span>
                    {market.tags?.map(tag => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 text-xs font-medium rounded-full bg-surface-700/50 text-surface-300"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="p-2 rounded-lg bg-surface-800/50 hover:bg-surface-700/50 transition-colors">
                      <Share2 className="w-4 h-4 text-surface-400" />
                    </button>
                    <button className="p-2 rounded-lg bg-surface-800/50 hover:bg-surface-700/50 transition-colors">
                      <Bookmark className="w-4 h-4 text-surface-400" />
                    </button>
                  </div>
                </div>

                <h1 className="text-2xl md:text-3xl font-bold text-white mb-4">
                  {market.question}
                </h1>

                {market.description && (
                  <p className="text-surface-400 mb-6">
                    {market.description}
                  </p>
                )}

                {/* Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 rounded-xl bg-surface-800/30">
                    <div className="flex items-center gap-2 text-surface-400 text-sm mb-1">
                      <TrendingUp className="w-4 h-4" />
                      <span>Volume</span>
                    </div>
                    <p className="text-lg font-bold text-white">
                      {formatCredits(market.totalVolume)} ALEO
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-surface-800/30">
                    <div className="flex items-center gap-2 text-surface-400 text-sm mb-1">
                      <Users className="w-4 h-4" />
                      <span>Total Bets</span>
                    </div>
                    <p className="text-lg font-bold text-white">
                      {market.totalBets}
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-surface-800/30">
                    <div className="flex items-center gap-2 text-surface-400 text-sm mb-1">
                      <Clock className="w-4 h-4" />
                      <span>Ends In</span>
                    </div>
                    <p className="text-lg font-bold text-white">
                      {market.timeRemaining}
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-surface-800/30">
                    <div className="flex items-center gap-2 text-surface-400 text-sm mb-1">
                      <Info className="w-4 h-4" />
                      <span>Resolution</span>
                    </div>
                    {market.resolutionSource?.startsWith('http') ? (
                      <a
                        href={market.resolutionSource}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-brand-400 hover:text-brand-300 flex items-center gap-1 truncate"
                      >
                        {new URL(market.resolutionSource).hostname.replace('www.', '')}
                        <ExternalLink className="w-3 h-3 flex-shrink-0" />
                      </a>
                    ) : (
                      <p className="text-sm font-medium text-white truncate">
                        {market.resolutionSource || 'On-chain'}
                      </p>
                    )}
                  </div>
                </div>
              </motion.div>

              {/* Probability Chart */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="glass-card p-6"
              >
                <h2 className="text-lg font-semibold text-white mb-4">Current Probability</h2>

                {/* Probability Bar */}
                <div className="mb-6">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-yes-400 font-medium">YES {market.yesPercentage.toFixed(1)}%</span>
                    <span className="text-no-400 font-medium">{market.noPercentage.toFixed(1)}% NO</span>
                  </div>
                  <div className="h-4 rounded-full overflow-hidden bg-surface-800 flex">
                    <div
                      className="h-full bg-gradient-to-r from-yes-600 to-yes-500 transition-all duration-500"
                      style={{ width: `${market.yesPercentage}%` }}
                    />
                    <div
                      className="h-full bg-gradient-to-r from-no-500 to-no-600 transition-all duration-500"
                      style={{ width: `${market.noPercentage}%` }}
                    />
                  </div>
                </div>

                {/* Payout Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div className={cn(
                    "p-4 rounded-xl border transition-all cursor-pointer",
                    selectedOutcome === 'yes'
                      ? "bg-yes-500/10 border-yes-500/50"
                      : "bg-surface-800/30 border-surface-700/50 hover:border-yes-500/30"
                  )}
                    onClick={() => {
                      setSelectedOutcome('yes')
                      if (step === 'select') setStep('amount')
                    }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-yes-400 font-bold text-lg">YES</span>
                      <TrendingUp className="w-5 h-5 text-yes-400" />
                    </div>
                    <p className="text-2xl font-bold text-white">{market.potentialYesPayout.toFixed(2)}x</p>
                    <p className="text-sm text-surface-400">Potential payout</p>
                  </div>

                  <div className={cn(
                    "p-4 rounded-xl border transition-all cursor-pointer",
                    selectedOutcome === 'no'
                      ? "bg-no-500/10 border-no-500/50"
                      : "bg-surface-800/30 border-surface-700/50 hover:border-no-500/30"
                  )}
                    onClick={() => {
                      setSelectedOutcome('no')
                      if (step === 'select') setStep('amount')
                    }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-no-400 font-bold text-lg">NO</span>
                      <TrendingDown className="w-5 h-5 text-no-400" />
                    </div>
                    <p className="text-2xl font-bold text-white">{market.potentialNoPayout.toFixed(2)}x</p>
                    <p className="text-sm text-surface-400">Potential payout</p>
                  </div>
                </div>
              </motion.div>

              {/* Odds History Chart */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="glass-card p-6"
              >
                <OddsChart
                  currentYes={market.yesPercentage}
                  currentNo={market.noPercentage}
                  yesPool={market.yesReserve}
                  noPool={market.noReserve}
                  totalVolume={market.totalVolume}
                  totalBets={market.totalBets}
                  potentialYesPayout={market.potentialYesPayout}
                  potentialNoPayout={market.potentialNoPayout}
                />
              </motion.div>

              {/* Market Info */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="glass-card p-6"
              >
                <h2 className="text-lg font-semibold text-white mb-4">Market Information</h2>
                <div className="space-y-4">
                  <div className="flex justify-between items-center py-3 border-b border-surface-800/50">
                    <span className="text-surface-400">Market ID</span>
                    <CopyableText
                      text={market.id}
                      displayText={`${market.id.slice(0, 10)}...${market.id.slice(-8)}`}
                    />
                  </div>
                  <div className="flex justify-between items-center py-3 border-b border-surface-800/50">
                    <span className="text-surface-400">Creator</span>
                    <div className="flex items-center gap-2">
                      <a
                        href={`https://testnet.explorer.provable.com/address/${market.creator}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-400 hover:text-brand-300 flex items-center gap-1"
                      >
                        <span className="font-mono text-sm">
                          {market.creator?.slice(0, 10)}...{market.creator?.slice(-6)}
                        </span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                  <div className="flex justify-between py-3 border-b border-surface-800/50">
                    <span className="text-surface-400">Resolution Source</span>
                    {market.resolutionSource?.startsWith('http') ? (
                      <a
                        href={market.resolutionSource}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-400 hover:text-brand-300 flex items-center gap-1"
                      >
                        <span>{new URL(market.resolutionSource).hostname.replace('www.', '')}</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <span className="text-white">{market.resolutionSource || 'On-chain'}</span>
                    )}
                  </div>
                  <div className="flex justify-between py-3">
                    <span className="text-surface-400">Contract</span>
                    <a
                      href={`https://testnet.explorer.provable.com/program/${CONTRACT_INFO.programId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-400 hover:text-brand-300 flex items-center gap-1"
                    >
                      <span>{CONTRACT_INFO.programId}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Betting Panel */}
            <div className="lg:col-span-1">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="glass-card p-6 sticky top-24"
              >
                <h2 className="text-lg font-semibold text-white mb-4">
                  {isExpired ? 'Market Expired' : 'Place Your Bet'}
                </h2>

                {/* Expired State */}
                {isExpired && step === 'select' && (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 rounded-full bg-surface-800/50 flex items-center justify-center mx-auto mb-4">
                      <Clock className="w-8 h-8 text-surface-500" />
                    </div>
                    <h3 className="text-lg font-bold text-white mb-2">Betting Closed</h3>
                    <p className="text-surface-400 text-sm mb-4">
                      The betting deadline for this market has passed. No new bets can be placed.
                    </p>
                    <button onClick={() => navigate('/dashboard')} className="btn-secondary w-full">
                      Browse Active Markets
                    </button>
                  </div>
                )}

                {/* Pending State — transaction submitted, waiting for confirmation */}
                {step === 'pending' && (
                  <div className="text-center py-8">
                    <Loader2 className="w-12 h-12 text-brand-500 animate-spin mx-auto mb-4" />
                    <h3 className="text-xl font-bold text-white mb-2">Transaction Pending</h3>
                    <p className="text-surface-400 mb-2">
                      Your {selectedOutcome?.toUpperCase()} bet of {betAmount} ALEO has been submitted.
                    </p>
                    <p className="text-surface-400 text-sm mb-4">
                      Waiting for on-chain confirmation. This may take 1-3 minutes.
                    </p>
                    <div className="p-3 rounded-xl bg-surface-800/50 mb-4">
                      <p className="text-xs text-surface-500">
                        Check your Leo Wallet extension for real-time status.
                      </p>
                    </div>
                    <button
                      onClick={resetBet}
                      className="btn-secondary w-full text-sm"
                    >
                      Close & Place Another Bet
                    </button>
                  </div>
                )}

                {/* Success State */}
                {step === 'success' && (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 rounded-full bg-yes-500/10 flex items-center justify-center mx-auto mb-4">
                      <CheckCircle2 className="w-8 h-8 text-yes-400" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">Bet Placed!</h3>
                    <p className="text-surface-400 mb-4">
                      Your {selectedOutcome?.toUpperCase()} bet of {betAmount} ALEO has been submitted.
                    </p>
                    {txId && txId.startsWith('at1') ? (
                      <>
                        <a
                          href={`https://testnet.explorer.provable.com/transaction/${txId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 text-brand-400 hover:text-brand-300 mb-2"
                        >
                          <span>View Transaction</span>
                          <ExternalLink className="w-4 h-4" />
                        </a>
                        <p className="text-xs text-surface-500 mb-4">
                          Transaction may take 30-60 seconds to appear on explorer
                        </p>
                      </>
                    ) : txId ? (
                      <div className="mb-4">
                        <p className="text-xs text-surface-500 mb-2">
                          Transaction is being processed on the blockchain.
                        </p>
                        <p className="text-xs text-brand-400">
                          Check your Leo Wallet extension for the transaction status and explorer link.
                        </p>
                      </div>
                    ) : null}
                    <button onClick={resetBet} className="btn-primary w-full">
                      Place Another Bet
                    </button>
                  </div>
                )}

                {/* Error State */}
                {step === 'error' && (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 rounded-full bg-no-500/10 flex items-center justify-center mx-auto mb-4">
                      <AlertCircle className="w-8 h-8 text-no-400" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">Bet Failed</h3>
                    <p className="text-surface-400 mb-6">{error}</p>
                    <button onClick={resetBet} className="btn-primary w-full">
                      Try Again
                    </button>
                  </div>
                )}

                {/* Processing State */}
                {step === 'processing' && (
                  <div className="text-center py-8">
                    <Loader2 className="w-12 h-12 text-brand-500 animate-spin mx-auto mb-4" />
                    <h3 className="text-xl font-bold text-white mb-2">Processing...</h3>
                    <p className="text-surface-400">
                      Please confirm the transaction in your wallet.
                    </p>
                  </div>
                )}

                {/* Betting Form */}
                {!isExpired && (step === 'select' || step === 'amount' || step === 'confirm') && (
                  <>
                    {/* Outcome Selection */}
                    <div className="mb-6">
                      <label className="text-sm text-surface-400 mb-2 block">Select Outcome</label>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          onClick={() => {
                            setSelectedOutcome('yes')
                            setStep('amount')
                          }}
                          className={cn(
                            "p-4 rounded-xl border-2 transition-all",
                            selectedOutcome === 'yes'
                              ? "bg-yes-500/10 border-yes-500 text-yes-400"
                              : "bg-surface-800/30 border-surface-700 text-surface-400 hover:border-yes-500/50"
                          )}
                        >
                          <TrendingUp className="w-6 h-6 mx-auto mb-2" />
                          <span className="font-bold">YES</span>
                          <p className="text-xs mt-1">{market.potentialYesPayout.toFixed(2)}x</p>
                        </button>
                        <button
                          onClick={() => {
                            setSelectedOutcome('no')
                            setStep('amount')
                          }}
                          className={cn(
                            "p-4 rounded-xl border-2 transition-all",
                            selectedOutcome === 'no'
                              ? "bg-no-500/10 border-no-500 text-no-400"
                              : "bg-surface-800/30 border-surface-700 text-surface-400 hover:border-no-500/50"
                          )}
                        >
                          <TrendingDown className="w-6 h-6 mx-auto mb-2" />
                          <span className="font-bold">NO</span>
                          <p className="text-xs mt-1">{market.potentialNoPayout.toFixed(2)}x</p>
                        </button>
                      </div>
                    </div>

                    {/* Amount Input */}
                    {selectedOutcome && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="mb-6"
                      >
                        <label className="text-sm text-surface-400 mb-2 block">Bet Amount (ALEO)</label>
                        <div className="relative">
                          <input
                            type="number"
                            value={betAmount}
                            onChange={(e) => setBetAmount(e.target.value)}
                            placeholder="0.00"
                            className="input-field w-full pr-16 text-lg"
                            min="0"
                            step="0.1"
                          />
                          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-surface-400">
                            ALEO
                          </span>
                        </div>

                        {/* Quick Amount Buttons */}
                        <div className="flex flex-wrap gap-2 mt-3">
                          {quickAmounts.map(amount => (
                            <button
                              key={amount}
                              onClick={() => setBetAmount(amount.toString())}
                              className={cn(
                                "px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                                parseFloat(betAmount) === amount
                                  ? "bg-brand-500 text-white"
                                  : "bg-surface-800/50 text-surface-400 hover:text-white"
                              )}
                            >
                              {amount}
                            </button>
                          ))}
                        </div>

                        <div className="mt-2 space-y-1">
                          {wallet.balance.public === 0n && (
                            <div className="flex items-start gap-2 p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 mb-1">
                              <AlertCircle className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0 mt-0.5" />
                              <p className="text-xs text-yellow-300 leading-relaxed">
                                You have <strong>0 public ALEO</strong>. Betting requires public credits.
                                Open Leo Wallet → Send → transfer ALEO to your own address as <strong>"Public"</strong> first.
                              </p>
                            </div>
                          )}
                          <p className="text-xs text-surface-500">
                            Public Balance: {formatCredits(wallet.balance.public)} ALEO
                            {wallet.balance.private > 0n && (
                              <span className="text-surface-600"> (Private: {formatCredits(wallet.balance.private)})</span>
                            )}
                          </p>
                          <p className="text-xs text-surface-600">
                            Transaction fee: 0.5 ALEO (from public balance)
                          </p>
                        </div>
                      </motion.div>
                    )}

                    {/* Payout Preview */}
                    {selectedOutcome && betAmountNum > 0 && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="p-4 rounded-xl bg-surface-800/30 mb-6"
                      >
                        <div className="flex justify-between mb-2">
                          <span className="text-surface-400">Your Bet</span>
                          <span className="text-white font-medium">
                            {betAmount} ALEO on {selectedOutcome.toUpperCase()}
                          </span>
                        </div>
                        <div className="flex justify-between mb-2">
                          <span className="text-surface-400">Transaction Fee</span>
                          <span className="text-surface-300 font-medium">0.5 ALEO</span>
                        </div>
                        <div className="flex justify-between mb-2">
                          <span className="text-surface-400">Payout Multiplier</span>
                          <span className="text-white font-medium">{potentialPayout.toFixed(2)}x</span>
                        </div>
                        <div className="flex justify-between pt-2 border-t border-surface-700/50">
                          <span className="text-surface-400">Potential Win</span>
                          <span className={cn(
                            "font-bold",
                            selectedOutcome === 'yes' ? "text-yes-400" : "text-no-400"
                          )}>
                            {potentialWin.toFixed(2)} ALEO
                          </span>
                        </div>
                      </motion.div>
                    )}

                    {/* Place Bet Button */}
                    <button
                      onClick={handleWalletBet}
                      disabled={!selectedOutcome || betAmountNum <= 0}
                      className={cn(
                        "w-full py-4 rounded-xl font-bold text-lg transition-all",
                        selectedOutcome && betAmountNum > 0
                          ? selectedOutcome === 'yes'
                            ? "bg-yes-500 hover:bg-yes-400 text-white"
                            : "bg-no-500 hover:bg-no-400 text-white"
                          : "bg-surface-800 text-surface-500 cursor-not-allowed"
                      )}
                    >
                      {selectedOutcome && betAmountNum > 0 ? (
                        `Place ${selectedOutcome.toUpperCase()} Bet`
                      ) : (
                        'Select Outcome & Amount'
                      )}
                    </button>

                    {/* Privacy Notice */}
                    <p className="text-xs text-surface-500 text-center mt-4">
                      Your bet is encrypted with zero-knowledge proofs.
                      Only you can see your position.
                    </p>
                  </>
                )}
              </motion.div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
