import { motion } from 'framer-motion'
import {
  ArrowLeft,
  Clock,
  TrendingUp,
  ExternalLink,
  Share2,
  Bookmark,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Info,
  Copy,
  Check,
  Droplets,
  ShieldAlert,
  Coins,
  ShoppingCart,
  TrendingDown,
  Wallet,
  RefreshCw,
  ChevronDown,
} from 'lucide-react'
import { useEffect, useState, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useWalletStore, useBetsStore, type Market, CONTRACT_INFO } from '@/lib/store'
import { useAleoTransaction } from '@/hooks/useAleoTransaction'
import { useRealMarketsStore } from '@/lib/market-store'
import {
  buildBuySharesInputs,
  buildSellSharesInputs,
  getCurrentBlockHeight,
  getMarketResolution,
  getMarketFees,
  getMarketDispute,
  diagnoseTransaction,
  MARKET_STATUS,
  type MarketResolutionData,
  type MarketFeesData,
  type DisputeDataResult,
} from '@/lib/aleo-client'
// fetchCreditsRecord dynamically imported where needed for buy_shares_private
import type { ParsedOutcomeShare } from '@/lib/credits-record'
import {
  calculateBuySharesOut,
  calculateBuyPriceImpact,
  calculateFees,
  calculateMinSharesOut,
  calculateAllPrices,
  calculateSellSharesNeeded,
  calculateSellNetTokens,
  calculateMaxTokensDesired,
  calculateSellPriceImpact,
  type AMMReserves,
} from '@/lib/amm'
import { DashboardHeader } from '@/components/DashboardHeader'
import { Footer } from '@/components/Footer'
import { OddsChart } from '@/components/OddsChart'
import { OutcomeSelector } from '@/components/OutcomeSelector'
import { LiquidityPanel } from '@/components/LiquidityPanel'
import { DisputePanel } from '@/components/DisputePanel'
import { CreatorFeesPanel } from '@/components/CreatorFeesPanel'
import { ResolvePanel } from '@/components/ResolvePanel'
import { cn, formatCredits, getTokenSymbol } from '@/lib/utils'

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

type TradeStep = 'select' | 'processing' | 'pending' | 'success' | 'error'

const SLIPPAGE_PRESETS = [0.5, 1, 2, 5]

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

// Status label component
function MarketStatusBadge({ status }: { status: number }) {
  const labels: Record<number, { text: string; color: string }> = {
    1: { text: 'Active', color: 'bg-yes-500/10 text-yes-400 border-yes-500/20' },
    2: { text: 'Closed', color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' },
    3: { text: 'Resolved', color: 'bg-brand-500/10 text-brand-400 border-brand-500/20' },
    4: { text: 'Cancelled', color: 'bg-no-500/10 text-no-400 border-no-500/20' },
    5: { text: 'Pending Resolution', color: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
  }
  const label = labels[status] || labels[1]
  return (
    <span className={cn('px-2 py-0.5 text-xs font-medium rounded-full border', label.color)}>
      {label.text}
    </span>
  )
}

export function MarketDetail() {
  const navigate = useNavigate()
  const { marketId } = useParams<{ marketId: string }>()
  const { wallet } = useWalletStore()
  const { addPendingBet, confirmPendingBet, removePendingBet } = useBetsStore()
  const { markets, fetchMarkets } = useRealMarketsStore()
  const { executeTransaction, pollTransactionStatus } = useAleoTransaction()

  const [market, setMarket] = useState<Market | null>(null)
  const [selectedOutcome, setSelectedOutcome] = useState<number | null>(null)
  const [buyAmount, setBuyAmount] = useState('')
  const [slippage, setSlippage] = useState(1) // 1%
  const [step, setStep] = useState<TradeStep>('select')
  const [error, setError] = useState<string | null>(null)
  const [txId, setTxId] = useState<string | null>(null)
  const [liveExpired, setLiveExpired] = useState(false)

  // Additional data fetched on-demand
  const [resolution, setResolution] = useState<MarketResolutionData | null>(null)
  const [fees, setFees] = useState<MarketFeesData | null>(null)
  const [, setDispute] = useState<DisputeDataResult | null>(null)

  // Active tab for extra panels
  const [activeTab, setActiveTab] = useState<'trade' | 'liquidity' | 'dispute' | 'fees' | 'resolve'>('trade')

  // Sell shares state
  const [tradeMode, setTradeMode] = useState<'buy' | 'sell'>('buy')
  const [sellShareRecord, setSellShareRecord] = useState('')
  const [sellTokensDesired, setSellTokensDesired] = useState('')
  const [sellSlippage, setSellSlippage] = useState(2)
  const [sellStep, setSellStep] = useState<TradeStep>('select')
  const [sellError, setSellError] = useState<string | null>(null)
  const [sellTxId, setSellTxId] = useState<string | null>(null)
  const [walletShareRecords, setWalletShareRecords] = useState<ParsedOutcomeShare[]>([])
  const [isFetchingRecords, setIsFetchingRecords] = useState(false)
  const [fetchRecordError, setFetchRecordError] = useState<string | null>(null)
  const [showPasteInput, setShowPasteInput] = useState(false)

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

  // Fetch additional data (resolution, fees, dispute) when market loads
  useEffect(() => {
    if (!market?.id) return
    const fetchExtras = async () => {
      try {
        const [res, feesData, disputeData] = await Promise.all([
          getMarketResolution(market.id),
          getMarketFees(market.id),
          getMarketDispute(market.id),
        ])
        if (res) setResolution(res)
        if (feesData) setFees(feesData)
        if (disputeData) setDispute(disputeData)
      } catch (err) {
        console.warn('[MarketDetail] Failed to fetch extras:', err)
      }
    }
    fetchExtras()
  }, [market?.id])

  // Live expiry check
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
    const interval = setInterval(checkExpiry, 30_000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [market?.id, market?.deadline, market?.status])

  const isExpired = market ? (liveExpired || market.timeRemaining === 'Ended' || market.status !== 1) : false

  // AMM price calculations
  const reserves: AMMReserves | null = useMemo(() => {
    if (!market) return null
    return {
      reserve_1: market.yesReserve,
      reserve_2: market.noReserve,
      reserve_3: market.reserve3 ?? 0n,
      reserve_4: market.reserve4 ?? 0n,
      num_outcomes: market.numOutcomes ?? 2,
    }
  }, [market])

  const prices = useMemo(() => {
    if (!reserves) return []
    return calculateAllPrices(reserves)
  }, [reserves])

  // Trade preview calculations
  const buyAmountMicro = useMemo(() => {
    const num = parseFloat(buyAmount) || 0
    return BigInt(Math.floor(num * 1_000_000))
  }, [buyAmount])

  const tradePreview = useMemo(() => {
    if (!reserves || !selectedOutcome || buyAmountMicro <= 0n) {
      return null
    }

    const sharesOut = calculateBuySharesOut(reserves, selectedOutcome, buyAmountMicro)
    const minShares = calculateMinSharesOut(sharesOut, slippage)
    const priceImpact = calculateBuyPriceImpact(reserves, selectedOutcome, buyAmountMicro)
    const feeBreakdown = calculateFees(buyAmountMicro)

    // Potential payout: winning shares redeem 1:1
    const potentialPayout = Number(sharesOut) / 1_000_000

    return {
      sharesOut,
      minShares,
      priceImpact,
      fees: feeBreakdown,
      potentialPayout,
    }
  }, [reserves, selectedOutcome, buyAmountMicro, slippage])

  // ---- Sell computed values ----
  const parsedShareRecord = useMemo(() => {
    if (!sellShareRecord) return null
    const outcomeMatch = sellShareRecord.match(/outcome:\s*(\d+)u8/)
    const qtyMatch = sellShareRecord.match(/quantity:\s*(\d+)u128/)
    const marketMatch = sellShareRecord.match(/market_id:\s*(\d+field)/)
    if (!outcomeMatch || !qtyMatch) return null
    return {
      outcome: parseInt(outcomeMatch[1]),
      quantity: BigInt(qtyMatch[1]),
      marketId: marketMatch ? marketMatch[1] : null,
    }
  }, [sellShareRecord])

  const sellMaxTokens = useMemo(() => {
    if (!reserves || !parsedShareRecord || parsedShareRecord.quantity <= 0n) return 0n
    return calculateMaxTokensDesired(reserves, parsedShareRecord.outcome, parsedShareRecord.quantity)
  }, [reserves, parsedShareRecord])

  const sellTokensMicro = useMemo(() => {
    const num = parseFloat(sellTokensDesired) || 0
    return BigInt(Math.floor(num * 1_000_000))
  }, [sellTokensDesired])

  const sellPreview = useMemo(() => {
    if (!reserves || !parsedShareRecord || sellTokensMicro <= 0n) return null
    const sharesNeeded = calculateSellSharesNeeded(reserves, parsedShareRecord.outcome, sellTokensMicro)
    if (sharesNeeded <= 0n) return null
    const maxSharesUsed = (sharesNeeded * BigInt(Math.floor((100 + sellSlippage) * 100))) / 10000n
    const netTokens = calculateSellNetTokens(sellTokensMicro)
    const fees = calculateFees(sellTokensMicro)
    const priceImpact = calculateSellPriceImpact(reserves, parsedShareRecord.outcome, sellTokensMicro)
    return {
      sharesNeeded,
      maxSharesUsed,
      netTokens,
      fees,
      priceImpact,
      exceedsBalance: maxSharesUsed > parsedShareRecord.quantity,
    }
  }, [reserves, parsedShareRecord, sellTokensMicro, sellSlippage])

  // Sell handler
  const handleSellShares = async () => {
    if (!market || !parsedShareRecord || sellTokensMicro <= 0n || !sellPreview) return

    setSellStep('processing')
    setSellError(null)

    try {
      if (sellPreview.exceedsBalance) {
        throw new Error(
          `Need ${formatCredits(sellPreview.maxSharesUsed)} shares (with ${sellSlippage}% slippage) but only have ${formatCredits(parsedShareRecord.quantity)}.`
        )
      }

      const tokenType = (market.tokenType || 'ALEO') as 'ALEO' | 'USDCX'
      const { functionName, inputs } = buildSellSharesInputs(
        sellShareRecord,
        sellTokensMicro,
        sellPreview.maxSharesUsed,
        tokenType,
      )

      const result = await executeTransaction({
        program: CONTRACT_INFO.programId,
        function: functionName,
        inputs,
        fee: 0.5,
      })

      if (result?.transactionId) {
        setSellTxId(result.transactionId)
        setSellStep('pending')

        // Record sell in My Bets
        const outcomeStr = parsedShareRecord.outcome === 1 ? 'yes' : 'no' as const
        addPendingBet({
          id: result.transactionId,
          marketId: market.id,
          amount: sellTokensMicro,
          outcome: outcomeStr,
          placedAt: Date.now(),
          status: 'pending',
          type: 'sell',
          marketQuestion: market.question,
          sharesSold: sellPreview.maxSharesUsed,
          tokensReceived: sellPreview.netTokens,
          tokenType: market.tokenType || 'ALEO',
        })

        pollTransactionStatus(result.transactionId, async (status, onChainTxId) => {
          if (onChainTxId) setSellTxId(onChainTxId)
          if (status === 'confirmed') {
            setSellStep('success')
          } else if (status === 'failed') {
            setSellError('Transaction failed on-chain.')
            setSellStep('error')
          } else {
            setSellStep('success')
          }
        }, 30, 10_000)
      } else {
        throw new Error('No transaction ID returned from wallet')
      }
    } catch (err: unknown) {
      console.error('Sell failed:', err)
      setSellError(err instanceof Error ? err.message : 'Failed to sell shares')
      setSellStep('error')
    }
  }

  const resetSell = () => {
    setSellShareRecord('')
    setSellTokensDesired('')
    setSellStep('select')
    setSellError(null)
    setSellTxId(null)
    setWalletShareRecords([])
    setFetchRecordError(null)
    setShowPasteInput(false)
  }

  const handleFetchRecords = async () => {
    setIsFetchingRecords(true)
    setFetchRecordError(null)
    try {
      const { fetchOutcomeShareRecords } = await import('@/lib/credits-record')
      const records = await fetchOutcomeShareRecords(CONTRACT_INFO.programId, market?.id)
      setWalletShareRecords(records)
      if (records.length === 0) {
        setFetchRecordError('No share positions found for this market. Your wallet may not support record fetching.')
      }
    } catch (err) {
      console.error('[Sell] Failed to fetch records:', err)
      setFetchRecordError(err instanceof Error ? err.message : 'Failed to fetch records from wallet')
    } finally {
      setIsFetchingRecords(false)
    }
  }

  if (!wallet.connected) return null

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

  const tokenSymbol = getTokenSymbol(market.tokenType)
  const isUsdcx = market.tokenType === 'USDCX'
  const numOutcomes = market.numOutcomes ?? 2
  const outcomeLabels = market.outcomeLabels ?? (numOutcomes === 2 ? ['Yes', 'No'] : Array.from({ length: numOutcomes }, (_, i) => `Outcome ${i + 1}`))

  // Buy shares via wallet
  const handleBuyShares = async () => {
    if (!market || !selectedOutcome || buyAmountMicro <= 0n || isExpired || !tradePreview) return

    setStep('processing')
    setError(null)

    try {
      if (!market.id.endsWith('field')) {
        throw new Error('This market cannot accept trades yet. The market ID must be in blockchain field format.')
      }

      // Pre-flight: Verify market deadline
      let currentBlock: bigint
      try {
        currentBlock = await getCurrentBlockHeight()
      } catch {
        throw new Error('Cannot verify market deadline - network error fetching block height.')
      }
      if (market.deadline > 0n && currentBlock > market.deadline) {
        throw new Error(`Market trading deadline has passed (current block: ${currentBlock}, deadline: ${market.deadline}).`)
      }

      // Pre-flight: Verify market status is ACTIVE
      if (market.status !== 1) {
        const statusNames: Record<number, string> = { 2: 'Closed', 3: 'Resolved', 4: 'Cancelled', 5: 'Pending Resolution' }
        throw new Error(`Market is ${statusNames[market.status] || 'not active'} (status: ${market.status}).`)
      }

      // Pre-flight: Minimum trade amount
      if (buyAmountMicro < 1000n) {
        throw new Error('Minimum trade amount is 0.001 tokens (1000 microcredits).')
      }

      // Pre-flight: Balance verification
      const feeInMicro = 700_000n
      if (isUsdcx) {
        if (buyAmountMicro > wallet.balance.usdcxPublic) {
          throw new Error(`Insufficient USDCX balance. You need ${buyAmount} USDCX but only have ${(Number(wallet.balance.usdcxPublic) / 1_000_000).toFixed(2)} USDCX.`)
        }
        // Gas fees always in ALEO
        const publicBalance = wallet.balance.public
        if (publicBalance < feeInMicro) {
          throw new Error(`Insufficient ALEO for transaction fee. Gas fees are always paid in ALEO.`)
        }
      }

      // Build inputs
      const tokenType = market.tokenType || 'ALEO'
      let functionName: string
      let inputs: string[]

      {
        // expectedShares = minShares (conservative) so record quantity <= actual shares_out
        const expectedShares = tradePreview.minShares
        let creditsRecord: string | undefined

        if (tokenType !== 'USDCX') {
          // ALEO: buy_shares_private needs credits record
          const { fetchCreditsRecord } = await import('@/lib/credits-record')
          const gasBuffer = 500_000
          const totalNeeded = Number(buyAmountMicro) + gasBuffer
          const record = await fetchCreditsRecord(totalNeeded)
          if (!record) {
            throw new Error(
              `Could not find a Credits record with at least ${(totalNeeded / 1_000_000).toFixed(2)} ALEO. ` +
              `Private betting requires an unspent Credits record.`
            )
          }
          creditsRecord = record
        }

        const result = buildBuySharesInputs(
          market.id,
          selectedOutcome,
          buyAmountMicro,
          expectedShares,
          tradePreview.minShares,
          tokenType as 'ALEO' | 'USDCX',
          creditsRecord,
        )
        functionName = result.functionName
        inputs = result.inputs
      }

      console.warn('[Trade] Submitting:', { function: functionName, mode: tokenType === 'USDCX' ? 'PUBLIC' : 'PRIVATE', inputs })

      const result = await executeTransaction({
        program: CONTRACT_INFO.programId,
        function: functionName,
        inputs,
        fee: 0.5,
      })

      if (result?.transactionId) {
        const submittedTxId = result.transactionId

        addPendingBet({
          id: submittedTxId,
          marketId: market.id,
          amount: buyAmountMicro,
          outcome: selectedOutcome === 1 ? 'yes' : 'no',
          placedAt: Date.now(),
          status: 'pending',
          marketQuestion: market.question,
          sharesReceived: tradePreview.sharesOut,
          lockedMultiplier: tradePreview.potentialPayout / (Number(buyAmountMicro) / 1_000_000),
          tokenType: market.tokenType || 'ALEO',
        })

        setTxId(result.transactionId)
        setStep('pending')

        pollTransactionStatus(submittedTxId, async (status, onChainTxId) => {
          if (onChainTxId) setTxId(onChainTxId)

          if (status === 'confirmed') {
            confirmPendingBet(submittedTxId, onChainTxId)
            setStep('success')
          } else if (status === 'failed') {
            removePendingBet(submittedTxId)
            let diagMsg = 'Transaction failed.'
            try {
              let txDiagnosis: { found: boolean; status: string; message?: string } | null = null
              if (onChainTxId) {
                try { txDiagnosis = await diagnoseTransaction(onChainTxId) } catch {}
              }
              const txNote = onChainTxId ? `\n\nTransaction: ${onChainTxId}` : ''
              if (onChainTxId && txDiagnosis) {
                diagMsg = `Transaction was ${txDiagnosis.status === 'rejected' ? 'REJECTED (finalize aborted)' : 'failed'}.${txNote}`
              } else {
                diagMsg = 'Wallet could not complete this transaction. Please try again.' + txNote
              }
            } catch {
              diagMsg = 'Transaction failed. Could not diagnose the exact cause.'
            }
            setError(diagMsg)
            setStep('error')
          } else {
            confirmPendingBet(submittedTxId, onChainTxId)
            setStep('success')
          }
        }, 30, 10_000)
      } else {
        throw new Error('No transaction ID returned from wallet')
      }
    } catch (err: unknown) {
      console.error('Trade failed:', err)
      setError(err instanceof Error ? err.message : 'Failed to buy shares')
      setStep('error')
    }
  }

  const resetTrade = () => {
    setSelectedOutcome(null)
    setBuyAmount('')
    setStep('select')
    setError(null)
    setTxId(null)
  }

  const quickAmounts = [1, 5, 10, 25, 50, 100]

  // Determine which panels to show based on market status
  const showResolve = isExpired || market.status === MARKET_STATUS.CLOSED || market.status === MARKET_STATUS.PENDING_RESOLUTION || market.status === MARKET_STATUS.RESOLVED
  const showDispute = market.status === MARKET_STATUS.PENDING_RESOLUTION && resolution
  const showCreatorFees = market.status === MARKET_STATUS.RESOLVED && fees && wallet.address === market.creator
  const canTrade = market.status === MARKET_STATUS.ACTIVE && !isExpired

  // Re-fetch market + resolution data after a resolution action
  const refreshExtras = async () => {
    if (!market?.id) return
    try {
      // Refresh markets to get updated status (e.g. ACTIVE → CLOSED)
      await fetchMarkets()
      const [res, feesData, disputeData] = await Promise.all([
        getMarketResolution(market.id),
        getMarketFees(market.id),
        getMarketDispute(market.id),
      ])
      if (res) setResolution(res)
      if (feesData) setFees(feesData)
      if (disputeData) setDispute(disputeData)
    } catch (err) {
      console.warn('[MarketDetail] Failed to refresh extras:', err)
    }
  }

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
                    <MarketStatusBadge status={market.status} />
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
                  <p className="text-surface-400 mb-6">{market.description}</p>
                )}

                {/* Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 rounded-xl bg-surface-800/30">
                    <div className="flex items-center gap-2 text-surface-400 text-sm mb-1">
                      <TrendingUp className="w-4 h-4" />
                      <span>Volume</span>
                    </div>
                    <p className="text-lg font-bold text-white">
                      {formatCredits(market.totalVolume)} {tokenSymbol}
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-surface-800/30">
                    <div className="flex items-center gap-2 text-surface-400 text-sm mb-1">
                      <Droplets className="w-4 h-4" />
                      <span>Liquidity</span>
                    </div>
                    <p className="text-lg font-bold text-white">
                      {formatCredits(market.totalLiquidity ?? 0n)} {tokenSymbol}
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
                      <span>Outcomes</span>
                    </div>
                    <p className="text-lg font-bold text-white">
                      {numOutcomes}
                    </p>
                  </div>
                </div>
              </motion.div>

              {/* Multi-outcome Probability Display */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="glass-card p-6"
              >
                <h2 className="text-lg font-semibold text-white mb-4">Current Prices</h2>

                {/* Multi-outcome probability bar */}
                <div className="mb-6">
                  <div className="flex justify-between text-sm mb-2">
                    {outcomeLabels.map((label, i) => {
                      const pct = (prices[i] ?? 0) * 100
                      const colors = ['text-yes-400', 'text-no-400', 'text-purple-400', 'text-yellow-400']
                      return (
                        <span key={i} className={cn(colors[i], 'font-medium')}>
                          {label} {pct.toFixed(1)}%
                        </span>
                      )
                    })}
                  </div>
                  <div className="h-4 rounded-full overflow-hidden bg-surface-800 flex">
                    {prices.map((price, i) => {
                      const gradients = [
                        'bg-gradient-to-r from-yes-600 to-yes-500',
                        'bg-gradient-to-r from-no-500 to-no-600',
                        'bg-gradient-to-r from-purple-600 to-purple-500',
                        'bg-gradient-to-r from-yellow-600 to-yellow-500',
                      ]
                      return (
                        <div
                          key={i}
                          className={cn(gradients[i], 'h-full transition-all duration-500')}
                          style={{ width: `${price * 100}%` }}
                        />
                      )
                    })}
                  </div>
                </div>

                {/* Outcome price cards (using OutcomeSelector for consistency) */}
                <OutcomeSelector
                  numOutcomes={numOutcomes}
                  outcomeLabels={outcomeLabels}
                  prices={prices}
                  selectedOutcome={selectedOutcome}
                  onSelect={(o) => {
                    setSelectedOutcome(o)
                  }}
                  disabled={!canTrade}
                />
              </motion.div>

              {/* Odds History Chart */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="glass-card p-6"
              >
                <OddsChart
                  numOutcomes={market.numOutcomes}
                  outcomeLabels={outcomeLabels}
                  reserves={[market.yesReserve, market.noReserve, market.reserve3, market.reserve4].slice(0, market.numOutcomes)}
                  prices={prices}
                  totalVolume={market.totalVolume}
                  totalBets={market.totalBets}
                  tokenSymbol={market.tokenType || 'ALEO'}
                />
              </motion.div>

              {/* Tab panels: Liquidity, Dispute, Creator Fees */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                {/* Tab buttons */}
                <div className="flex gap-2 mb-4">
                  {canTrade && (
                    <button
                      onClick={() => setActiveTab('liquidity')}
                      className={cn(
                        'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                        activeTab === 'liquidity'
                          ? 'bg-brand-500/20 text-brand-400 border border-brand-500/30'
                          : 'bg-surface-800/50 text-surface-400 hover:text-white'
                      )}
                    >
                      <Droplets className="w-4 h-4" />
                      Liquidity
                    </button>
                  )}
                  {showDispute && (
                    <button
                      onClick={() => setActiveTab('dispute')}
                      className={cn(
                        'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                        activeTab === 'dispute'
                          ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                          : 'bg-surface-800/50 text-surface-400 hover:text-white'
                      )}
                    >
                      <ShieldAlert className="w-4 h-4" />
                      Dispute
                    </button>
                  )}
                  {showCreatorFees && (
                    <button
                      onClick={() => setActiveTab('fees')}
                      className={cn(
                        'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                        activeTab === 'fees'
                          ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                          : 'bg-surface-800/50 text-surface-400 hover:text-white'
                      )}
                    >
                      <Coins className="w-4 h-4" />
                      Creator Fees
                    </button>
                  )}
                  {showResolve && (
                    <button
                      onClick={() => setActiveTab('resolve')}
                      className={cn(
                        'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                        activeTab === 'resolve'
                          ? 'bg-brand-500/20 text-brand-400 border border-brand-500/30'
                          : 'bg-surface-800/50 text-surface-400 hover:text-white'
                      )}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Resolve
                    </button>
                  )}
                </div>

                {/* Tab content */}
                {activeTab === 'liquidity' && canTrade && (
                  <LiquidityPanel market={market} />
                )}
                {activeTab === 'dispute' && showDispute && resolution && (
                  <DisputePanel market={market} resolution={resolution} />
                )}
                {activeTab === 'fees' && showCreatorFees && fees && (
                  <CreatorFeesPanel market={market} fees={fees} />
                )}
                {activeTab === 'resolve' && showResolve && (
                  <ResolvePanel
                    market={market}
                    resolution={resolution}
                    onResolutionChange={refreshExtras}
                  />
                )}
              </motion.div>

              {/* Market Info */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
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
                    <span className="text-surface-400">Token</span>
                    <span className="text-white font-medium">{tokenSymbol}</span>
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
                  <div className="flex justify-between py-3 border-b border-surface-800/50">
                    <span className="text-surface-400">Trading Fees</span>
                    <span className="text-white text-sm">2% (0.5% protocol + 0.5% creator + 1% LP)</span>
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

            {/* Trading Panel (Right Sidebar) */}
            <div className="lg:col-span-1">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="glass-card p-6 sticky top-24"
              >
                {/* Buy/Sell Tab Toggle */}
                {!isExpired && canTrade && step === 'select' ? (
                  <div className="flex gap-2 mb-4">
                    <button
                      onClick={() => setTradeMode('buy')}
                      className={cn(
                        'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all',
                        tradeMode === 'buy'
                          ? 'bg-yes-500/20 text-yes-400 border border-yes-500/30'
                          : 'bg-surface-800/50 text-surface-400 hover:text-white border border-transparent'
                      )}
                    >
                      <ShoppingCart className="w-4 h-4" />
                      Buy
                    </button>
                    <button
                      onClick={() => setTradeMode('sell')}
                      className={cn(
                        'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all',
                        tradeMode === 'sell'
                          ? 'bg-no-500/20 text-no-400 border border-no-500/30'
                          : 'bg-surface-800/50 text-surface-400 hover:text-white border border-transparent'
                      )}
                    >
                      <TrendingDown className="w-4 h-4" />
                      Sell
                    </button>
                  </div>
                ) : (
                  <h2 className="text-lg font-semibold text-white mb-4">
                    {isExpired ? 'Market Expired' : 'Buy Shares'}
                  </h2>
                )}

                {/* Expired State */}
                {isExpired && step === 'select' && (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 rounded-full bg-surface-800/50 flex items-center justify-center mx-auto mb-4">
                      <Clock className="w-8 h-8 text-surface-500" />
                    </div>
                    <h3 className="text-lg font-bold text-white mb-2">Trading Closed</h3>
                    <p className="text-surface-400 text-sm mb-4">
                      The trading deadline for this market has passed.
                    </p>
                    <button onClick={() => navigate('/dashboard')} className="btn-secondary w-full">
                      Browse Active Markets
                    </button>
                  </div>
                )}

                {/* Pending State */}
                {step === 'pending' && (
                  <div className="text-center py-8">
                    <Loader2 className="w-12 h-12 text-brand-500 animate-spin mx-auto mb-4" />
                    <h3 className="text-xl font-bold text-white mb-2">Transaction Pending</h3>
                    <p className="text-surface-400 mb-2">
                      Your trade of {buyAmount} {tokenSymbol} has been submitted.
                    </p>
                    <p className="text-surface-400 text-sm mb-4">
                      Waiting for on-chain confirmation. This may take 1-3 minutes.
                    </p>
                    <button onClick={resetTrade} className="btn-secondary w-full text-sm">
                      Close & Place Another Trade
                    </button>
                  </div>
                )}

                {/* Success State */}
                {step === 'success' && (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 rounded-full bg-yes-500/10 flex items-center justify-center mx-auto mb-4">
                      <CheckCircle2 className="w-8 h-8 text-yes-400" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">Shares Purchased!</h3>
                    <p className="text-surface-400 mb-4">
                      You bought {outcomeLabels[(selectedOutcome ?? 1) - 1]} shares with {buyAmount} {tokenSymbol}.
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
                      </div>
                    ) : null}
                    <button onClick={resetTrade} className="btn-primary w-full">
                      Buy More Shares
                    </button>
                  </div>
                )}

                {/* Error State */}
                {step === 'error' && (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 rounded-full bg-no-500/10 flex items-center justify-center mx-auto mb-4">
                      <AlertCircle className="w-8 h-8 text-no-400" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">Trade Failed</h3>
                    <p className="text-surface-400 mb-6 whitespace-pre-line text-left text-sm">{error}</p>
                    <button onClick={resetTrade} className="btn-primary w-full">
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

                {/* Trading Form */}
                {canTrade && step === 'select' && tradeMode === 'buy' && (
                  <>
                    {/* Outcome Selection */}
                    <div className="mb-6">
                      <label className="text-sm text-surface-400 mb-2 block">Select Outcome</label>
                      <OutcomeSelector
                        numOutcomes={numOutcomes}
                        outcomeLabels={outcomeLabels}
                        prices={prices}
                        selectedOutcome={selectedOutcome}
                        onSelect={setSelectedOutcome}
                      />
                    </div>

                    {/* Amount Input */}
                    {selectedOutcome && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="mb-6"
                      >
                        <label className="text-sm text-surface-400 mb-2 block">Amount ({tokenSymbol})</label>
                        <div className="relative">
                          <input
                            type="number"
                            value={buyAmount}
                            onChange={(e) => setBuyAmount(e.target.value)}
                            placeholder="0.00"
                            className="input-field w-full pr-16 text-lg"
                            min="0"
                            step="0.1"
                          />
                          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-surface-400">
                            {tokenSymbol}
                          </span>
                        </div>

                        {/* Quick Amount Buttons */}
                        <div className="flex flex-wrap gap-2 mt-3">
                          {quickAmounts.map(amount => (
                            <button
                              key={amount}
                              onClick={() => setBuyAmount(amount.toString())}
                              className={cn(
                                "px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                                parseFloat(buyAmount) === amount
                                  ? "bg-brand-500 text-white"
                                  : "bg-surface-800/50 text-surface-400 hover:text-white"
                              )}
                            >
                              {amount}
                            </button>
                          ))}
                        </div>

                        {/* Slippage Tolerance */}
                        <div className="mt-4">
                          <label className="text-xs text-surface-500 mb-1.5 block">Slippage Tolerance</label>
                          <div className="flex gap-2">
                            {SLIPPAGE_PRESETS.map(s => (
                              <button
                                key={s}
                                onClick={() => setSlippage(s)}
                                className={cn(
                                  'px-3 py-1 rounded-lg text-xs font-medium transition-all',
                                  slippage === s
                                    ? 'bg-brand-500/20 text-brand-400 border border-brand-500/30'
                                    : 'bg-surface-800/50 text-surface-500 hover:text-surface-300'
                                )}
                              >
                                {s}%
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="mt-2 space-y-1">
                          {!isUsdcx && wallet.balance.public === 0n && (
                            <div className="flex items-start gap-2 p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 mb-1">
                              <AlertCircle className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0 mt-0.5" />
                              <p className="text-xs text-yellow-300 leading-relaxed">
                                You have <strong>0 public ALEO</strong>. Trading requires public credits.
                              </p>
                            </div>
                          )}
                          <p className="text-xs text-surface-500">
                            {isUsdcx
                              ? `USDCX Balance: ${formatCredits(wallet.balance.usdcxPublic)} USDCX`
                              : <>Public Balance: {formatCredits(wallet.balance.public)} ALEO</>
                            }
                          </p>
                          <p className="text-xs text-surface-600">
                            Transaction fee: 0.5 ALEO (from public balance)
                          </p>
                        </div>
                      </motion.div>
                    )}

                    {/* Trade Preview */}
                    {tradePreview && selectedOutcome && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="p-4 rounded-xl bg-surface-800/30 mb-6"
                      >
                        <div className="flex justify-between mb-2">
                          <span className="text-surface-400 text-sm">Shares Received</span>
                          <span className="text-white font-medium text-sm">
                            {formatCredits(tradePreview.sharesOut)}
                          </span>
                        </div>
                        <div className="flex justify-between mb-2">
                          <span className="text-surface-400 text-sm">Min Shares (slippage)</span>
                          <span className="text-surface-300 font-medium text-sm">
                            {formatCredits(tradePreview.minShares)}
                          </span>
                        </div>
                        <div className="flex justify-between mb-2">
                          <span className="text-surface-400 text-sm">Price Impact</span>
                          <span className={cn(
                            'font-medium text-sm',
                            Math.abs(tradePreview.priceImpact) > 5 ? 'text-no-400' : 'text-surface-300'
                          )}>
                            {tradePreview.priceImpact > 0 ? '+' : ''}{tradePreview.priceImpact.toFixed(2)}%
                          </span>
                        </div>
                        <div className="flex justify-between mb-2">
                          <span className="text-surface-400 text-sm">Trading Fee (2%)</span>
                          <span className="text-surface-300 font-medium text-sm">
                            {formatCredits(tradePreview.fees.totalFees)} {tokenSymbol}
                          </span>
                        </div>
                        <div className="flex justify-between pt-2 border-t border-surface-700/50">
                          <span className="text-surface-400 text-sm">Potential Payout (if wins)</span>
                          <span className="text-yes-400 font-bold text-sm">
                            {tradePreview.potentialPayout.toFixed(2)} {tokenSymbol}
                          </span>
                        </div>
                        {Math.abs(tradePreview.priceImpact) > 5 && (
                          <div className="mt-3 p-2 rounded-lg bg-no-500/10 border border-no-500/20">
                            <p className="text-xs text-no-400">
                              High price impact! Consider reducing trade size.
                            </p>
                          </div>
                        )}
                      </motion.div>
                    )}

                    {/* Buy Shares Button */}
                    <button
                      onClick={handleBuyShares}
                      disabled={!selectedOutcome || buyAmountMicro <= 0n}
                      className={cn(
                        "w-full py-4 rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-2",
                        selectedOutcome && buyAmountMicro > 0n
                          ? "bg-brand-500 hover:bg-brand-400 text-white"
                          : "bg-surface-800 text-surface-500 cursor-not-allowed"
                      )}
                    >
                      <ShoppingCart className="w-5 h-5" />
                      {selectedOutcome && buyAmountMicro > 0n ? (
                        `Buy ${outcomeLabels[selectedOutcome - 1]} Shares`
                      ) : (
                        'Select Outcome & Amount'
                      )}
                    </button>

                    {/* Privacy Notice */}
                    <p className="text-xs text-surface-500 text-center mt-4">
                      Your trade is encrypted with zero-knowledge proofs.
                      Only you can see your position.
                    </p>
                  </>
                )}

                {/* Sell Tab Content */}
                {canTrade && tradeMode === 'sell' && (
                  <>
                    {/* Sell: Select state */}
                    {sellStep === 'select' && (
                      <div className="space-y-4">
                        {/* Share Positions from Wallet */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <label className="text-sm text-surface-400">Your Share Positions</label>
                            {(walletShareRecords.length > 0 || isFetchingRecords) && (
                              <button
                                onClick={handleFetchRecords}
                                disabled={isFetchingRecords}
                                className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 disabled:text-surface-600 transition-colors"
                              >
                                {isFetchingRecords ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <RefreshCw className="w-3 h-3" />
                                )}
                                {isFetchingRecords ? 'Loading...' : 'Refresh'}
                              </button>
                            )}
                          </div>

                          {/* Loading state */}
                          {isFetchingRecords && walletShareRecords.length === 0 && (
                            <div className="flex items-center justify-center py-6 rounded-xl bg-surface-800/30">
                              <Loader2 className="w-5 h-5 text-brand-500 animate-spin mr-2" />
                              <span className="text-sm text-surface-400">Fetching from wallet...</span>
                            </div>
                          )}

                          {/* Records list */}
                          {walletShareRecords.length > 0 && (
                            <div className="space-y-2">
                              {walletShareRecords.map((rec, idx) => {
                                const isSelected = sellShareRecord === rec.plaintext
                                const label = outcomeLabels[rec.outcome - 1] || `Outcome ${rec.outcome}`
                                const colorIdx = Math.min(rec.outcome - 1, 3)
                                const outcomeColors = [
                                  'bg-yes-500/10 border-yes-500/30 text-yes-400',
                                  'bg-no-500/10 border-no-500/30 text-no-400',
                                  'bg-purple-500/10 border-purple-500/30 text-purple-400',
                                  'bg-yellow-500/10 border-yellow-500/30 text-yellow-400',
                                ]
                                return (
                                  <button
                                    key={idx}
                                    onClick={() => setSellShareRecord(isSelected ? '' : rec.plaintext)}
                                    className={cn(
                                      'w-full p-3 rounded-xl border text-left transition-all',
                                      isSelected
                                        ? 'bg-brand-500/10 border-brand-500/40 ring-1 ring-brand-500/20'
                                        : 'bg-surface-800/30 border-surface-700/50 hover:border-surface-600/50'
                                    )}
                                  >
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        <span className={cn(
                                          'px-2 py-0.5 text-xs font-medium rounded-full border',
                                          outcomeColors[colorIdx]
                                        )}>
                                          {label}
                                        </span>
                                        {isSelected && <Check className="w-3.5 h-3.5 text-brand-400" />}
                                      </div>
                                      <span className="text-white font-medium text-sm">
                                        {formatCredits(rec.quantity)} shares
                                      </span>
                                    </div>
                                  </button>
                                )
                              })}
                            </div>
                          )}

                          {/* No records found */}
                          {!isFetchingRecords && walletShareRecords.length === 0 && fetchRecordError && (
                            <div className="p-4 rounded-xl bg-surface-800/30 text-center">
                              <Wallet className="w-6 h-6 text-surface-500 mx-auto mb-2" />
                              <p className="text-xs text-surface-400">{fetchRecordError}</p>
                            </div>
                          )}

                          {/* Initial prompt — no fetch attempted yet */}
                          {!isFetchingRecords && walletShareRecords.length === 0 && !fetchRecordError && (
                            <button
                              onClick={handleFetchRecords}
                              className="w-full py-6 rounded-xl bg-surface-800/30 border border-dashed border-surface-700/50 hover:border-brand-500/30 transition-all text-center group"
                            >
                              <Wallet className="w-8 h-8 text-surface-500 group-hover:text-brand-400 mx-auto mb-2 transition-colors" />
                              <p className="text-sm text-surface-400 group-hover:text-surface-300 transition-colors">
                                Click to load your share positions
                              </p>
                              <p className="text-xs text-surface-600 mt-1">
                                Fetches OutcomeShare records from your wallet
                              </p>
                            </button>
                          )}
                        </div>

                        {/* Manual Paste Fallback */}
                        <div>
                          <button
                            onClick={() => setShowPasteInput(!showPasteInput)}
                            className="flex items-center gap-1.5 text-xs text-surface-500 hover:text-surface-300 transition-colors"
                          >
                            <ChevronDown className={cn('w-3 h-3 transition-transform', showPasteInput && 'rotate-180')} />
                            Enter record manually
                          </button>
                          {showPasteInput && (
                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-2">
                              <textarea
                                value={sellShareRecord}
                                onChange={(e) => setSellShareRecord(e.target.value)}
                                placeholder={`{\n  owner: aleo1...,\n  outcome: 1u8,\n  quantity: 1000000u128,\n  ...\n}`}
                                className="input-field w-full h-24 text-xs font-mono resize-none"
                              />
                            </motion.div>
                          )}
                        </div>

                        {/* Record Preview */}
                        {parsedShareRecord && (
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="p-3 rounded-xl bg-surface-800/50 space-y-2"
                          >
                            <div className="flex justify-between text-sm">
                              <span className="text-surface-400">Outcome</span>
                              <span className="text-white font-medium">
                                {outcomeLabels[parsedShareRecord.outcome - 1] || `Outcome ${parsedShareRecord.outcome}`}
                              </span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-surface-400">Your Shares</span>
                              <span className="text-white font-medium">
                                {formatCredits(parsedShareRecord.quantity)}
                              </span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-surface-400">Max Withdrawable</span>
                              <span className="text-surface-300">
                                {formatCredits(sellMaxTokens)} {tokenSymbol}
                              </span>
                            </div>
                            {parsedShareRecord.marketId && parsedShareRecord.marketId !== market.id && (
                              <div className="flex items-start gap-2 p-2 rounded-lg bg-no-500/10 border border-no-500/20">
                                <AlertCircle className="w-3.5 h-3.5 text-no-400 flex-shrink-0 mt-0.5" />
                                <p className="text-xs text-no-400">This record belongs to a different market!</p>
                              </div>
                            )}
                          </motion.div>
                        )}

                        {/* Amount to Withdraw */}
                        {parsedShareRecord && parsedShareRecord.quantity > 0n && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                          >
                            <label className="text-sm text-surface-400 mb-2 block">
                              Amount to Withdraw ({tokenSymbol})
                            </label>
                            <div className="relative">
                              <input
                                type="number"
                                value={sellTokensDesired}
                                onChange={(e) => setSellTokensDesired(e.target.value)}
                                placeholder="0.00"
                                className="input-field w-full pr-24 text-lg"
                                min="0"
                                step="0.1"
                              />
                              <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                                <button
                                  onClick={() => setSellTokensDesired(
                                    (Number(sellMaxTokens) / 1_000_000).toString()
                                  )}
                                  className="text-xs text-brand-400 hover:text-brand-300"
                                >
                                  Max
                                </button>
                                <span className="text-surface-400 text-sm">{tokenSymbol}</span>
                              </div>
                            </div>

                            {/* Slippage */}
                            <div className="mt-3">
                              <label className="text-xs text-surface-500 mb-1.5 block">Slippage Tolerance</label>
                              <div className="flex gap-2">
                                {SLIPPAGE_PRESETS.map(s => (
                                  <button
                                    key={s}
                                    onClick={() => setSellSlippage(s)}
                                    className={cn(
                                      'px-3 py-1 rounded-lg text-xs font-medium transition-all',
                                      sellSlippage === s
                                        ? 'bg-brand-500/20 text-brand-400 border border-brand-500/30'
                                        : 'bg-surface-800/50 text-surface-500 hover:text-surface-300'
                                    )}
                                  >
                                    {s}%
                                  </button>
                                ))}
                              </div>
                            </div>
                          </motion.div>
                        )}

                        {/* Sell Preview */}
                        {sellPreview && (
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="p-4 rounded-xl bg-surface-800/30 space-y-2"
                          >
                            <div className="flex justify-between text-sm">
                              <span className="text-surface-400">Shares Used</span>
                              <span className="text-white font-medium">
                                {formatCredits(sellPreview.sharesNeeded)}
                              </span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-surface-400">Max Shares (slippage)</span>
                              <span className="text-surface-300">
                                {formatCredits(sellPreview.maxSharesUsed)}
                              </span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-surface-400">Trading Fee (2%)</span>
                              <span className="text-surface-300">
                                {formatCredits(sellPreview.fees.totalFees)} {tokenSymbol}
                              </span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-surface-400">Price Impact</span>
                              <span className={cn(
                                'font-medium',
                                Math.abs(sellPreview.priceImpact) > 5 ? 'text-no-400' : 'text-surface-300'
                              )}>
                                {sellPreview.priceImpact.toFixed(2)}%
                              </span>
                            </div>
                            <div className="flex justify-between pt-2 border-t border-surface-700/50">
                              <span className="text-surface-400 text-sm">You Receive</span>
                              <span className="text-yes-400 font-bold">
                                {formatCredits(sellPreview.netTokens)} {tokenSymbol}
                              </span>
                            </div>
                            {sellPreview.exceedsBalance && (
                              <div className="mt-2 p-2 rounded-lg bg-no-500/10 border border-no-500/20">
                                <p className="text-xs text-no-400">
                                  Insufficient shares. Try a smaller amount.
                                </p>
                              </div>
                            )}
                            {Math.abs(sellPreview.priceImpact) > 5 && !sellPreview.exceedsBalance && (
                              <div className="mt-2 p-2 rounded-lg bg-no-500/10 border border-no-500/20">
                                <p className="text-xs text-no-400">
                                  High price impact! Consider reducing amount.
                                </p>
                              </div>
                            )}
                          </motion.div>
                        )}

                        {/* Sell Button */}
                        <button
                          onClick={handleSellShares}
                          disabled={!parsedShareRecord || sellTokensMicro <= 0n || sellPreview?.exceedsBalance}
                          className={cn(
                            "w-full py-4 rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-2",
                            parsedShareRecord && sellTokensMicro > 0n && !sellPreview?.exceedsBalance
                              ? "bg-no-500 hover:bg-no-400 text-white"
                              : "bg-surface-800 text-surface-500 cursor-not-allowed"
                          )}
                        >
                          <TrendingDown className="w-5 h-5" />
                          {parsedShareRecord && sellTokensMicro > 0n
                            ? `Sell for ${sellTokensDesired} ${tokenSymbol}`
                            : 'Select Position & Enter Amount'}
                        </button>

                        <p className="text-xs text-surface-500 text-center">
                          Shares are burned and tokens transferred to your public balance.
                        </p>
                      </div>
                    )}

                    {/* Sell: Processing */}
                    {sellStep === 'processing' && (
                      <div className="text-center py-8">
                        <Loader2 className="w-12 h-12 text-brand-500 animate-spin mx-auto mb-4" />
                        <h3 className="text-xl font-bold text-white mb-2">Processing...</h3>
                        <p className="text-surface-400">Please confirm the transaction in your wallet.</p>
                      </div>
                    )}

                    {/* Sell: Pending */}
                    {sellStep === 'pending' && (
                      <div className="text-center py-8">
                        <Loader2 className="w-12 h-12 text-brand-500 animate-spin mx-auto mb-4" />
                        <h3 className="text-xl font-bold text-white mb-2">Transaction Pending</h3>
                        <p className="text-surface-400 mb-4">
                          Waiting for on-chain confirmation. This may take 1-3 minutes.
                        </p>
                        <button onClick={resetSell} className="btn-secondary w-full text-sm">
                          Close
                        </button>
                      </div>
                    )}

                    {/* Sell: Success */}
                    {sellStep === 'success' && (
                      <div className="text-center py-8">
                        <div className="w-16 h-16 rounded-full bg-yes-500/10 flex items-center justify-center mx-auto mb-4">
                          <CheckCircle2 className="w-8 h-8 text-yes-400" />
                        </div>
                        <h3 className="text-xl font-bold text-white mb-2">Shares Sold!</h3>
                        <p className="text-surface-400 mb-4">
                          You withdrew {sellTokensDesired} {tokenSymbol} from the pool.
                        </p>
                        {sellTxId && sellTxId.startsWith('at1') && (
                          <a
                            href={`https://testnet.explorer.provable.com/transaction/${sellTxId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 text-brand-400 hover:text-brand-300 mb-4"
                          >
                            <span>View Transaction</span>
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        )}
                        <button onClick={resetSell} className="btn-primary w-full">
                          Done
                        </button>
                      </div>
                    )}

                    {/* Sell: Error */}
                    {sellStep === 'error' && (
                      <div className="text-center py-8">
                        <div className="w-16 h-16 rounded-full bg-no-500/10 flex items-center justify-center mx-auto mb-4">
                          <AlertCircle className="w-8 h-8 text-no-400" />
                        </div>
                        <h3 className="text-xl font-bold text-white mb-2">Sell Failed</h3>
                        <p className="text-surface-400 mb-6 whitespace-pre-line text-left text-sm">{sellError}</p>
                        <button onClick={resetSell} className="btn-primary w-full">
                          Try Again
                        </button>
                      </div>
                    )}
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
