import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  Activity,
  Zap,
  Clock,
  TrendingUp,
  MessageSquare,
  FileText,
  ExternalLink,
  Share2,
  Bookmark,
  BookmarkCheck,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Info,
  Copy,
  Check,
  Droplets,
  ShieldAlert,
  Shield,
  Coins,
  ShoppingCart,
  TrendingDown,
  Wallet,
  RefreshCw,
  ChevronDown,
} from 'lucide-react'
import { useEffect, useState, useMemo, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useWalletStore, useBetsStore, type Market, CONTRACT_INFO, outcomeToString } from '@/lib/store'
import { config } from '@/lib/config'
import { useAleoTransaction } from '@/hooks/useAleoTransaction'
import { useRealMarketsStore } from '@/lib/market-store'
import {
  buildBuySharesInputs,
  buildSellSharesInputs,
  buildMerkleProofsForAddress,
  getCurrentBlockHeight,
  getMarketResolution,
  getMarketFees,
  getMarketDispute,
  getProgramIdForToken,
  diagnoseTransaction,
  MARKET_STATUS,
  type MarketResolutionData,
  type MarketFeesData,
  type DisputeDataResult,
} from '@/lib/aleo-client'
import { OddsChart } from '@/components/OddsChart'
import { CryptoPriceChart } from '@/components/CryptoPriceChart'
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
import { OutcomeSelector } from '@/components/OutcomeSelector'
import { ProbabilityDonut } from '@/components/ProbabilityDonut'
import { LiquidityPanel } from '@/components/LiquidityPanel'
// DisputePanel removed in v33 — challenge integrated in ResolvePanel
import { CreatorFeesPanel } from '@/components/CreatorFeesPanel'
import { ResolvePanel } from '@/components/ResolvePanel'
import { cn, formatCredits, getTokenSymbol, sanitizeUrl, safeHostname, isValidAleoAddress } from '@/lib/utils'
import { getMarketThumbnail, isContainThumbnail } from '@/lib/market-thumbnails'
import { useLiveCountdown } from '@/hooks/useGlobalTicker'
import { fetchBetCountByMarket } from '@/lib/supabase'
import { Tooltip } from '@/components/ui/Tooltip'
import { StatusBadge, getStatusVariant } from '@/components/ui/StatusBadge'
import { devWarn } from '../lib/logger'

const categoryNames: Record<number, string> = {
  1: 'Politics',
  2: 'Sports',
  3: 'Crypto',
  4: 'Culture',
  5: 'AI & Tech',
  6: 'Macro',
  7: 'Science',
  8: 'Climate',
}

const categoryColors: Record<number, string> = {
  1: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  2: 'bg-green-500/10 text-green-400 border-green-500/20',
  3: 'bg-brand-400/10 text-brand-400 border-brand-400/20',
  4: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
  5: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  6: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  7: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  8: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
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
        className="p-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] transition-colors"
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
function MarketStatusBadgeWrapper({ status }: { status: number }) {
  const variant = getStatusVariant(status, false)
  return <StatusBadge variant={variant} size="md" />
}

const DESC_LIMIT = 150

function ExpandableDescription({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  const needsTruncation = text.length > DESC_LIMIT

  return (
    <div className="mb-6">
      <p className="text-surface-400">
        {expanded || !needsTruncation ? text : `${text.slice(0, DESC_LIMIT)}...`}
      </p>
      {needsTruncation && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-brand-400 hover:text-brand-300 text-sm mt-1 flex items-center gap-1 transition-colors"
        >
          {expanded ? 'Show less' : 'Show more'}
          <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', expanded && 'rotate-180')} />
        </button>
      )}
    </div>
  )
}

// ── Hero Description with Read More ──
function HeroDescription({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  const needsTruncation = text.length > 120

  return (
    <div className="mb-4">
      <p className={cn('text-sm text-surface-400 leading-relaxed', !expanded && needsTruncation && 'line-clamp-2')}>
        {text}
      </p>
      {needsTruncation && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-brand-400 hover:text-brand-300 mt-1 transition-colors"
        >
          {expanded ? 'Show less' : 'Read more'}
        </button>
      )}
    </div>
  )
}

// ── Vertical News Ticker ──
function MarketNewsTicker({ markets, currentMarketId }: { markets: Market[]; currentMarketId: string }) {
  const navigate = useNavigate()
  const otherMarkets = useMemo(
    () => markets.filter(m => m.id !== currentMarketId && m.status === 1),
    [markets, currentMarketId]
  )

  if (otherMarkets.length === 0) return null

  // Build ticker items — show leading outcome label + price
  const items = useMemo(() => {
    const list: Array<{ id: string; text: string; token: string; leadLabel: string; leadPrice: number; direction: 'yes' | 'no' }> = []
    for (const m of otherMarkets) {
      const yesPrice = (m.yesPercentage ?? 50) / 100
      const noPrice = (m.noPercentage ?? 50) / 100
      const isYesLeading = yesPrice >= noPrice
      const labels = m.outcomeLabels ?? ['Yes', 'No']
      const label = m.question.length > 50 ? m.question.slice(0, 50) + '...' : m.question
      list.push({
        id: m.id,
        text: label,
        token: m.tokenType ?? 'ALEO',
        leadLabel: isYesLeading ? labels[0] : labels[1],
        leadPrice: isYesLeading ? yesPrice : noPrice,
        direction: isYesLeading ? 'yes' : 'no',
      })
    }
    return list
  }, [otherMarkets])

  // Duplicate items for seamless loop
  const doubled = useMemo(() => [...items, ...items], [items])
  const itemHeight = 36 // px per item
  const totalHeight = items.length * itemHeight

  return (
    <div className="mt-6 pt-5 border-t border-white/[0.04]">
      <p className="text-[10px] font-semibold text-surface-500 uppercase tracking-wider mb-3">Other Markets</p>
      <div
        className="relative overflow-hidden rounded-xl bg-white/[0.02] border border-white/[0.04]"
        style={{ height: Math.min(itemHeight * 4, totalHeight) }}
      >
        <div
          className="animate-ticker-up"
          style={{
            // @ts-ignore -- CSS custom property
            '--ticker-distance': `-${totalHeight}px`,
            animationDuration: `${items.length * 4}s`,
          } as React.CSSProperties}
        >
          {doubled.map((item, i) => (
            <button
              key={`${item.id}-${i}`}
              onClick={() => navigate(`/market/${item.id}`)}
              className="flex items-center gap-3 w-full px-3 text-left hover:bg-white/[0.03] transition-colors"
              style={{ height: itemHeight }}
            >
              <span className={cn(
                'w-1.5 h-1.5 rounded-full shrink-0',
                item.direction === 'yes' ? 'bg-yes-400' : 'bg-no-400'
              )} />
              <span className="flex-1 text-xs text-surface-300 truncate">{item.text}</span>
              <span className={cn(
                'text-[11px] font-semibold shrink-0',
                item.direction === 'yes' ? 'text-yes-400' : 'text-no-400'
              )}>
                {item.leadLabel}
              </span>
              <span className={cn(
                'text-xs font-bold tabular-nums shrink-0',
                item.direction === 'yes' ? 'text-yes-400' : 'text-no-400'
              )}>
                ${item.leadPrice.toFixed(2)}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export function MarketDetail() {
  const navigate = useNavigate()
  const { marketId } = useParams<{ marketId: string }>()
  const { wallet } = useWalletStore()
  const { addPendingBet, confirmPendingBet, removePendingBet } = useBetsStore()
  const { markets, fetchMarkets, isLoading: marketsLoading } = useRealMarketsStore()
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

  // Bet count from Supabase
  const [betCount, setBetCount] = useState(0)
  const [createdTimestamp, setCreatedTimestamp] = useState<string | null>(null)

  // Active tab for extra panels
  const [activeTab, setActiveTab] = useState<'trade' | 'liquidity' | 'dispute' | 'fees' | 'resolve'>('trade')

  // Content tab for chart/activity/discussion/rules
  const [contentTab, setContentTab] = useState<'chart' | 'activity' | 'discussion' | 'rules'>('chart')

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

  // Share & Bookmark state
  const [linkCopied, setLinkCopied] = useState(false)
  const [isBookmarked, setIsBookmarked] = useState(() => {
    const saved = localStorage.getItem('veiled_bookmarks')
    return saved ? (JSON.parse(saved) as string[]).includes(marketId || '') : false
  })

  // Ref for mobile scroll-to-trading
  const tradingPanelRef = useRef<HTMLDivElement>(null)

  // Redirect handled by ProtectedRoute wrapper in App.tsx

  // Fetch markets if not loaded yet (e.g. page refresh directly on /market/:id)
  useEffect(() => {
    if (markets.length === 0) {
      fetchMarkets()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Find market
  useEffect(() => {
    const found = markets.find(m => m.id === marketId)
    if (found) {
      setMarket(found)
    }
  }, [marketId, markets])

  // Fetch bet count from Supabase
  useEffect(() => {
    if (!market?.id) return
    fetchBetCountByMarket(market.id).then(setBetCount)
  }, [market?.id])

  // Fetch created timestamp from explorer API
  useEffect(() => {
    if (!market?.transactionId) return
    const txId = market.transactionId
    if (!txId.startsWith('at1')) {
      setCreatedTimestamp(null)
      return
    }
    const fetchTimestamp = async () => {
      try {
        // Step 1: Find block hash from transaction ID
        const hashResp = await fetch(`${config.rpcUrl}/find/blockHash/${txId}`)
        if (!hashResp.ok) return
        const blockHash = (await hashResp.json()) as string
        if (!blockHash || typeof blockHash !== 'string') return

        // Step 2: Get block by hash → read timestamp from metadata
        const blockResp = await fetch(`${config.rpcUrl}/block/${blockHash.replace(/"/g, '')}`)
        if (!blockResp.ok) return
        const block = await blockResp.json()
        const ts = block?.header?.metadata?.timestamp
        if (ts && typeof ts === 'number') {
          const date = new Date(ts * 1000)
          setCreatedTimestamp(date.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }))
        }
      } catch { /* silent */ }
    }
    fetchTimestamp()
  }, [market?.transactionId])

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
        devWarn('[MarketDetail] Failed to fetch extras:', err)
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

  // Live countdown with seconds
  const liveTimeRemaining = useLiveCountdown(market?.deadlineTimestamp, market?.timeRemaining)

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

    // Potential payout: winning shares redeem 1:1 (use minShares — matches on-chain record quantity)
    const potentialPayout = Number(minShares) / 1_000_000

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

      const tokenType = (market.tokenType || 'ALEO') as 'ALEO' | 'USDCX' | 'USAD'
      const { functionName, inputs, programId: sellProgramId } = buildSellSharesInputs(
        sellShareRecord,
        sellTokensMicro,
        sellPreview.maxSharesUsed,
        tokenType,
      )

      const result = await executeTransaction({
        program: sellProgramId,
        function: functionName,
        inputs,
        fee: 1.5,
      })

      if (result?.transactionId) {
        setSellTxId(result.transactionId)
        setSellStep('pending')

        // Record sell in My Bets
        const outcomeStr = outcomeToString(parsedShareRecord.outcome)
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

        const sellTxId = result.transactionId
        pollTransactionStatus(sellTxId, async (status, onChainTxId) => {
          if (onChainTxId) setSellTxId(onChainTxId)
          if (status === 'confirmed') {
            confirmPendingBet(sellTxId, onChainTxId)
            setSellStep('success')
          } else if (status === 'failed') {
            removePendingBet(sellTxId)
            setSellError('Transaction failed on-chain.')
            setSellStep('error')
          } else {
            confirmPendingBet(sellTxId, onChainTxId)
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
      // Use correct program ID based on market token type
      const tokenType = market?.tokenType || 'ALEO'
      const programId = getProgramIdForToken(tokenType as 'ALEO' | 'USDCX' | 'USAD')
      const records = await fetchOutcomeShareRecords(programId, market?.id)
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

  // Auto-fetch share records when switching to sell tab
  useEffect(() => {
    if (tradeMode === 'sell' && walletShareRecords.length === 0 && !isFetchingRecords && market) {
      handleFetchRecords()
    }
  }, [tradeMode, market?.id])

  if (!wallet.connected) return null

  if (!market) {
    // Still loading markets — show skeleton instead of "Not Found"
    if (marketsLoading || markets.length === 0) {
      return (
        <div className="min-h-screen bg-surface-950 flex flex-col">
          <DashboardHeader />
          <main className="flex-1 pt-20">
            <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
              <div className="skeleton h-8 w-32 rounded-lg mb-6" />
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                  {/* Header skeleton */}
                  <div className="glass-card p-6 space-y-4">
                    <div className="flex gap-2">
                      <div className="skeleton h-6 w-20 rounded-full" />
                      <div className="skeleton h-6 w-16 rounded-full" />
                    </div>
                    <div className="skeleton h-8 w-4/5 rounded" />
                    <div className="skeleton h-4 w-full rounded" />
                    <div className="skeleton h-4 w-2/3 rounded" />
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                      {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-16 rounded-xl" />)}
                    </div>
                  </div>
                  {/* Donut skeleton */}
                  <div className="glass-card p-6">
                    <div className="flex flex-col sm:flex-row items-center gap-6">
                      <div className="skeleton w-48 h-48 rounded-full flex-shrink-0" />
                      <div className="flex-1 space-y-3 w-full">
                        {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-8 rounded-lg" />)}
                      </div>
                    </div>
                  </div>
                  {/* Pool breakdown skeleton */}
                  <div className="glass-card p-6 space-y-4">
                    <div className="skeleton h-5 w-32 rounded" />
                    {[...Array(2)].map((_, i) => <div key={i} className="skeleton h-8 rounded-lg" />)}
                  </div>
                </div>
                {/* Sidebar skeleton */}
                <div className="space-y-4">
                  <div className="glass-card p-6 space-y-4">
                    <div className="flex gap-2">
                      <div className="skeleton h-10 flex-1 rounded-lg" />
                      <div className="skeleton h-10 flex-1 rounded-lg" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="skeleton h-20 rounded-xl" />
                      <div className="skeleton h-20 rounded-xl" />
                    </div>
                    <div className="skeleton h-12 rounded-xl" />
                    <div className="skeleton h-12 rounded-lg" />
                  </div>
                </div>
              </div>
            </div>
          </main>
          <Footer />
        </div>
      )
    }

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
  const tokenType = (market.tokenType || 'ALEO') as 'ALEO' | 'USDCX' | 'USAD'
  const isUsdcx = tokenType === 'USDCX'
  const isStablecoin = tokenType === 'USDCX' || tokenType === 'USAD'
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
      const feeInMicro = 1_500_000n
      if (isStablecoin) {
        const totalStablecoin = tokenType === 'USDCX'
          ? wallet.balance.usdcxPublic + wallet.balance.usdcxPrivate
          : wallet.balance.usadPublic + wallet.balance.usadPrivate
        if (buyAmountMicro > totalStablecoin) {
          throw new Error(`Insufficient ${tokenType} balance. You need ${buyAmount} ${tokenType} but only have ${(Number(totalStablecoin) / 1_000_000).toFixed(2)} ${tokenType}.`)
        }
        // Gas fees always in ALEO
        const publicBalance = wallet.balance.public
        if (publicBalance < feeInMicro) {
          throw new Error(`Insufficient ALEO for transaction fee. Gas fees are always paid in ALEO.`)
        }
      }

      // Build inputs
      let functionName: string
      let inputs: string[]

      {
        // expectedShares = minShares (conservative) so record quantity <= actual shares_out
        const expectedShares = tradePreview.minShares
        let creditsRecord: string | undefined

        if (tokenType === 'ALEO') {
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
          tokenType as 'ALEO' | 'USDCX' | 'USAD',
          creditsRecord,
        )
        functionName = result.functionName
        inputs = result.inputs

        // v29: USDCX private buy — append Token record + MerkleProof to inputs
        if (tokenType === 'USDCX') {
          const { findTokenRecord } = await import('@/lib/private-stablecoin')
          const tokenRecord = await findTokenRecord('USDCX', buyAmountMicro)
          if (tokenRecord) {
            if (!wallet.address) {
              throw new Error('Wallet address is unavailable. Please reconnect your wallet and try again.')
            }
            inputs.push(tokenRecord)
            inputs.push(await buildMerkleProofsForAddress(wallet.address))
            devWarn('[Trade] USDCX PRIVATE buy — Token record + MerkleProof appended')
          } else {
            throw new Error(
              `No private USDCX Token record found with at least ${Number(buyAmountMicro) / 1_000_000} USDCX. ` +
              `Private betting requires USDCX Token records in your wallet.`
            )
          }
        }

        // USAD v8: private buy — append Token record + MerkleProof (same as USDCX)
        if (tokenType === 'USAD') {
          const { findTokenRecord } = await import('@/lib/private-stablecoin')
          const tokenRecord = await findTokenRecord('USAD', buyAmountMicro)
          if (tokenRecord) {
            if (!wallet.address) {
              throw new Error('Wallet address is unavailable. Please reconnect your wallet and try again.')
            }
            inputs.push(tokenRecord)
            inputs.push(await buildMerkleProofsForAddress(wallet.address))
            devWarn('[Trade] USAD PRIVATE buy — Token record + MerkleProof appended')
          } else {
            throw new Error(
              `No private USAD Token record found with at least ${Number(buyAmountMicro) / 1_000_000} USAD. ` +
              `Please unshield USAD in Shield Wallet first.`
            )
          }
        }
      }

      devWarn('[Trade] Submitting:', { function: functionName, inputs: inputs.map((i, idx) => idx >= 6 ? `[${i.length} chars]` : i) })

      let result: any
      {
        // v7: Single TX — all bet inputs private, USAD uses transfer_public_as_signer
        const programId = getProgramIdForToken(tokenType)
        result = await executeTransaction({
          program: programId,
          function: functionName,
          inputs,
          fee: 1.5,
          recordIndices: tokenType === 'USDCX' || tokenType === 'USAD' ? [6] : undefined,
        })
      }

      if (result?.transactionId) {
        const submittedTxId = result.transactionId

        addPendingBet({
          id: submittedTxId,
          marketId: market.id,
          amount: buyAmountMicro,
          outcome: outcomeToString(selectedOutcome ?? 1),
          placedAt: Date.now(),
          status: 'pending',
          marketQuestion: market.question,
          sharesReceived: tradePreview.minShares,  // matches on-chain OutcomeShare.quantity (= expected_shares)
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
  // v33: showDispute removed — challenge is in ResolvePanel
  const showCreatorFees = market.status === MARKET_STATUS.RESOLVED && fees && wallet.address === market.creator
  const canTrade = market.status === MARKET_STATUS.ACTIVE && !isExpired
  // v33: Show liquidity tab for ALL statuses — LP needs to see positions and withdraw
  const showLiquidity = true

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
      devWarn('[MarketDetail] Failed to refresh extras:', err)
    }
  }

  return (
    <div className="min-h-screen bg-surface-950 flex flex-col">
      <DashboardHeader />

      <main className="flex-1 pt-20">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
                    <MarketStatusBadgeWrapper status={market.status} />
                    {market.tags?.map(tag => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 text-xs font-medium rounded-full bg-white/[0.04] text-surface-300 border border-white/[0.04]"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <MarketStatusBadgeWrapper status={market.status} />
                  </div>
                </div>

                <div className="flex gap-3 mb-2">
                  {(() => {
                    const thumbUrl = getMarketThumbnail(market.question, market.category, market.thumbnailUrl)
                    const useContain = isContainThumbnail(thumbUrl)
                    return (
                      <div className={cn('w-11 h-11 rounded-xl overflow-hidden shrink-0 border border-white/[0.06] bg-surface-800', useContain && 'p-1.5 flex items-center justify-center')}>
                        <img src={thumbUrl} alt="" className={cn('w-full h-full', useContain ? 'object-contain' : 'object-cover')} loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                      </div>
                    )
                  })()}
                  <h1 className="text-base md:text-lg font-semibold text-white leading-snug">
                    {market.question}
                  </h1>
                </div>

                {market.description && (
                  <HeroDescription text={market.description} />
                )}

                {/* Crypto Live Price Chart */}
                <CryptoPriceChart
                  question={market.question}
                  category={market.category}
                  className="mb-6"
                />

                {/* Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 rounded-xl bg-white/[0.02]">
                    <div className="flex items-center gap-2 text-surface-400 text-sm mb-1">
                      <TrendingUp className="w-4 h-4" />
                      <span>Volume</span>
                    </div>
                    <p className="text-lg font-bold text-white">
                      {formatCredits(market.totalVolume)} {tokenSymbol}
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-white/[0.02]">
                    <div className="flex items-center gap-2 text-surface-400 text-sm mb-1">
                      <Droplets className="w-4 h-4" />
                      <span>{(market.status === MARKET_STATUS.RESOLVED || market.status === MARKET_STATUS.CANCELLED) ? 'Remaining' : 'Liquidity'}</span>
                    </div>
                    <p className="text-lg font-bold text-white">
                      {formatCredits(
                        (market.status === MARKET_STATUS.RESOLVED || market.status === MARKET_STATUS.CANCELLED)
                          && market.remainingCredits !== undefined
                          ? market.remainingCredits
                          : (market.totalLiquidity ?? 0n)
                      )} {tokenSymbol}
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-white/[0.02]">
                    <div className="flex items-center gap-2 text-surface-400 text-sm mb-1">
                      <Clock className="w-4 h-4" />
                      <span>Ends In</span>
                    </div>
                    <p className="text-lg font-bold text-white">
                      {liveTimeRemaining}
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-white/[0.02]">
                    <div className="flex items-center gap-2 text-surface-400 text-sm mb-1">
                      <Info className="w-4 h-4" />
                      <span>Outcomes</span>
                    </div>
                    <p className="text-lg font-bold text-white">
                      {numOutcomes}
                    </p>
                  </div>
                </div>

                {/* Market News Ticker */}
                {markets.length > 1 && (
                  <MarketNewsTicker markets={markets} currentMarketId={market.id} />
                )}

                {/* Action buttons */}
                <div className="flex items-center gap-3 mt-6 pt-6 border-t border-white/[0.04]">
                  <button
                    onClick={async () => {
                      const url = window.location.href
                      if (navigator.share) {
                        try { await navigator.share({ title: market.question, url }) } catch {}
                      } else {
                        await navigator.clipboard.writeText(url)
                        setLinkCopied(true)
                        setTimeout(() => setLinkCopied(false), 2000)
                      }
                    }}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs text-surface-400 hover:text-white hover:bg-white/[0.04] transition-all duration-200"
                  >
                    {linkCopied ? <Check className="w-3.5 h-3.5 text-yes-400" /> : <Share2 className="w-3.5 h-3.5" />}
                    {linkCopied ? 'Copied!' : 'Share'}
                  </button>
                  <button
                    onClick={() => {
                      const saved = JSON.parse(localStorage.getItem('veiled_bookmarks') || '[]') as string[]
                      const updated = isBookmarked ? saved.filter(id => id !== market.id) : [...saved, market.id]
                      localStorage.setItem('veiled_bookmarks', JSON.stringify(updated))
                      setIsBookmarked(!isBookmarked)
                    }}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs text-surface-400 hover:text-white hover:bg-white/[0.04] transition-all duration-200"
                  >
                    {isBookmarked ? <BookmarkCheck className="w-3.5 h-3.5 text-yellow-400" /> : <Bookmark className="w-3.5 h-3.5" />}
                    {isBookmarked ? 'Saved' : 'Watchlist'}
                  </button>
                </div>
              </motion.div>

              {/* ═══ CONTENT TABS: Price Chart | Activity | Discussion | Rules ═══ */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="glass-card overflow-hidden"
              >
                {/* Tab bar */}
                <div className="flex items-center gap-1 p-1.5 mx-4 mt-4 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                  {[
                    { id: 'chart' as const, label: 'Price Chart', icon: Activity },
                    { id: 'activity' as const, label: 'Activity', icon: Zap },
                    { id: 'discussion' as const, label: 'Discussion', icon: MessageSquare },
                    { id: 'rules' as const, label: 'Rules', icon: FileText },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setContentTab(tab.id)}
                      className={cn(
                        'flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all duration-200',
                        contentTab === tab.id
                          ? 'bg-white/[0.06] text-white'
                          : 'text-surface-500 hover:text-surface-300'
                      )}
                    >
                      <tab.icon className="w-3.5 h-3.5" />
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="p-4 lg:p-6">
                  {/* Price Chart tab */}
                  {contentTab === 'chart' && (
                    <div className="space-y-6">
                <h2 className="text-lg font-semibold text-white mb-4">Market Sentiment</h2>

                {/* Donut chart + pool data visualization */}
                <ProbabilityDonut
                  marketId={market.id}
                  numOutcomes={numOutcomes}
                  outcomeLabels={outcomeLabels}
                  prices={prices}
                  reserves={[market.yesReserve, market.noReserve, market.reserve3, market.reserve4].slice(0, market.numOutcomes)}
                  totalLiquidity={
                    (market.status === MARKET_STATUS.RESOLVED || market.status === MARKET_STATUS.CANCELLED)
                      && market.remainingCredits !== undefined
                      ? market.remainingCredits
                      : (market.totalLiquidity ?? 0n)
                  }
                  totalVolume={market.totalVolume}
                  tokenSymbol={market.tokenType || 'ALEO'}
                />

              {/* Pool Breakdown Chart */}
                <OddsChart
                  numOutcomes={numOutcomes}
                  outcomeLabels={outcomeLabels}
                  reserves={[market.yesReserve, market.noReserve, market.reserve3 || 0n, market.reserve4 || 0n].slice(0, numOutcomes)}
                  prices={prices}
                  totalVolume={market.totalVolume}
                  totalBets={betCount}
                  tokenSymbol={tokenSymbol}
                  className="rounded-xl border border-white/[0.04] p-5"
                />
                    </div>
                  )}

                  {/* Activity tab */}
                  {contentTab === 'activity' && (
                    <div className="space-y-4">
                      {(() => {
                        const { userBets, pendingBets } = useBetsStore.getState()
                        const marketBets = [...pendingBets, ...userBets]
                          .filter(b => b.marketId === market.id)
                          .sort((a, b) => b.placedAt - a.placedAt)

                        const getTimeAgo = (ts: number) => {
                          const diff = Date.now() - ts
                          if (diff < 60_000) return 'just now'
                          if (diff < 3600_000) return `${Math.floor(diff / 60_000)} min ago`
                          if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`
                          return `${Math.floor(diff / 86400_000)}d ago`
                        }

                        const hasVolume = market.totalVolume > 0n
                        const totalTraders = Math.max(betCount, market.totalBets || 0)
                        const otherTraders = Math.max(0, totalTraders - marketBets.length)
                        const volumeDisplay = (Number(market.totalVolume) / 1_000_000).toFixed(1)

                        return (
                          <>
                            {/* Your Trades */}
                            {marketBets.length > 0 && (
                              <>
                                <p className="text-2xs font-heading font-semibold text-surface-400 uppercase tracking-wider">Your Trades</p>
                                {marketBets.map((bet, i) => {
                                  const isYes = bet.outcome === 'yes' || bet.outcome === 'outcome_1'
                                  const label = outcomeLabels[(bet.outcome === 'yes' ? 0 : bet.outcome === 'no' ? 1 : parseInt(bet.outcome.replace('outcome_', '')) - 1)] || bet.outcome.toUpperCase()
                                  const isSell = bet.type === 'sell'
                                  const amount = Number(bet.amount) / 1_000_000
                                  const shares = bet.sharesReceived ? Number(bet.sharesReceived) / 1_000_000 : amount

                                  return (
                                    <motion.div key={bet.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                                      className="flex items-center gap-4 px-4 py-3 rounded-xl bg-white/[0.01] hover:bg-white/[0.02] transition-colors duration-200">
                                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                                        isSell ? 'bg-purple-500/10 text-purple-400' : isYes ? 'bg-yes-400/10 text-yes-400' : 'bg-no-400/10 text-no-400'
                                      }`}>
                                        {isSell ? 'S' : isYes ? 'Y' : 'N'}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm text-white">
                                          <span className="text-surface-400">You</span>
                                          {isSell ? ' sold ' : ' bought '}
                                          <span className={isYes ? 'text-yes-400 font-semibold' : 'text-no-400 font-semibold'}>
                                            {shares.toFixed(1)} {label.toUpperCase()}
                                          </span>
                                        </p>
                                        <p className="text-xs text-surface-500">{getTimeAgo(bet.placedAt)}</p>
                                      </div>
                                      <span className="text-sm font-heading font-medium text-white tabular-nums">
                                        {amount.toFixed(2)} {tokenSymbol}
                                      </span>
                                    </motion.div>
                                  )
                                })}
                              </>
                            )}

                            {/* Other traders info */}
                            {(hasVolume || otherTraders > 0) && (
                              <div className="rounded-xl p-4 mt-2" style={{ background: 'linear-gradient(135deg, rgba(201, 168, 76, 0.04), rgba(0, 220, 130, 0.02))', border: '1px solid rgba(201, 168, 76, 0.08)' }}>
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-xl bg-brand-400/[0.08] flex items-center justify-center flex-shrink-0">
                                    <Shield className="w-5 h-5 text-brand-400" />
                                  </div>
                                  <div className="flex-1">
                                    <p className="text-sm font-medium text-white">
                                      {otherTraders > 0
                                        ? `${otherTraders} other trader${otherTraders > 1 ? 's' : ''} bought shares in this market`
                                        : 'Other traders have bought shares in this market'}
                                    </p>
                                    <p className="text-xs text-surface-400 mt-0.5">
                                      Total volume: {volumeDisplay} {tokenSymbol} · All positions encrypted with ZK proofs
                                    </p>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Empty state */}
                            {marketBets.length === 0 && !hasVolume && otherTraders === 0 && (
                              <div className="text-center py-12">
                                <Zap className="w-8 h-8 text-surface-500 mx-auto mb-3" />
                                <p className="text-sm text-surface-300 mb-1">No activity yet</p>
                                <p className="text-xs text-surface-500">Be the first to trade on this market</p>
                              </div>
                            )}
                          </>
                        )
                      })()}
                    </div>
                  )}

                  {/* Discussion tab */}
                  {contentTab === 'discussion' && (
                    <div className="text-center py-12">
                      <MessageSquare className="w-8 h-8 text-surface-500 mx-auto mb-3" />
                      <p className="text-sm text-surface-300 mb-1">Discussion coming soon</p>
                      <p className="text-xs text-surface-500">Community comments and analysis will appear here</p>
                    </div>
                  )}

                  {/* Rules tab */}
                  {contentTab === 'rules' && (
                    <div className="space-y-6">
                      <div>
                        <h3 className="text-sm font-semibold text-white mb-2">Resolution Criteria</h3>
                        <p className="text-sm text-surface-400 leading-relaxed">
                          {market.description || 'No resolution criteria specified.'}
                        </p>
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-white mb-2">Oracle Source</h3>
                        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                          <Info className="w-4 h-4 text-brand-400" />
                          <span className="text-sm text-white">{market.resolutionSource || 'On-chain verification'}</span>
                          {market.resolutionSource && (
                            <ExternalLink className="w-3.5 h-3.5 text-surface-500 ml-auto" />
                          )}
                        </div>
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-white mb-2">Market Details</h3>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-surface-400">Token</span>
                            <span className="text-white font-medium">{tokenSymbol}</span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-surface-400">Outcomes</span>
                            <span className="text-white font-medium">{numOutcomes}</span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-surface-400">Trading Fees</span>
                            <span className="text-white font-medium">2%</span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-surface-400">Contract</span>
                            <a href={`https://testnet.explorer.provable.com/program/${CONTRACT_INFO.programId}`} target="_blank" rel="noopener noreferrer"
                              className="text-brand-400 hover:text-brand-300 flex items-center gap-1 text-xs">
                              {CONTRACT_INFO.programId} <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        </div>
                      </div>
                      {market.tags && market.tags.length > 0 && (
                        <div>
                          <h3 className="text-sm font-semibold text-white mb-2">Tags</h3>
                          <div className="flex flex-wrap gap-2">
                            {market.tags.map(tag => (
                              <span key={tag} className="px-2.5 py-1 rounded-lg text-2xs bg-white/[0.03] border border-white/[0.04] text-surface-300">
                                #{tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>

              {/* Tab panels: Liquidity, Dispute, Creator Fees */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                {/* Tab buttons */}
                <div className="flex gap-2 mb-4">
                  {showLiquidity && (
                    <button
                      onClick={() => setActiveTab('liquidity')}
                      className={cn(
                        'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                        activeTab === 'liquidity'
                          ? 'bg-brand-400/[0.12] text-brand-400 border border-brand-400/[0.2]'
                          : 'bg-white/[0.03] text-surface-400 hover:text-white'
                      )}
                    >
                      <Droplets className="w-4 h-4" />
                      {canTrade ? 'Liquidity' : 'Withdraw LP'}
                    </button>
                  )}
                  {/* v33: Dispute tab removed — challenge is now part of ResolvePanel */}
                  {showCreatorFees && (
                    <button
                      onClick={() => setActiveTab('fees')}
                      className={cn(
                        'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                        activeTab === 'fees'
                          ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                          : 'bg-white/[0.03] text-surface-400 hover:text-white'
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
                          ? 'bg-brand-400/[0.12] text-brand-400 border border-brand-400/[0.2]'
                          : 'bg-white/[0.03] text-surface-400 hover:text-white'
                      )}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Resolve
                    </button>
                  )}
                </div>

                {/* Tab content */}
                {activeTab === 'liquidity' && showLiquidity && (
                  <LiquidityPanel market={market} />
                )}
                {/* v33: DisputePanel removed — challenge integrated in ResolvePanel */}
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

            </div>

            {/* Trading Panel + Market Info (Right Sidebar) */}
            <div className="lg:col-span-1" ref={tradingPanelRef}>
              <div className="sticky top-28 space-y-4">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="glass-card p-6"
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
                          : 'bg-white/[0.03] text-surface-400 hover:text-white border border-transparent'
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
                          : 'bg-white/[0.03] text-surface-400 hover:text-white border border-transparent'
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
                    <div className="w-16 h-16 rounded-full bg-white/[0.03] flex items-center justify-center mx-auto mb-4">
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
                    <Loader2 className="w-12 h-12 text-brand-400 animate-spin mx-auto mb-4" />
                    <h3 className="text-xl font-display font-bold text-white mb-2">Transaction Pending</h3>
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
                    <h3 className="text-xl font-display font-bold text-white mb-2">Shares Purchased!</h3>
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
                    <h3 className="text-xl font-display font-bold text-white mb-2">Trade Failed</h3>
                    <p className="text-surface-400 mb-6 whitespace-pre-line text-left text-sm">{error}</p>
                    <button onClick={resetTrade} className="btn-primary w-full">
                      Try Again
                    </button>
                  </div>
                )}

                {/* Processing State */}
                {step === 'processing' && (
                  <div className="text-center py-8">
                    <Loader2 className="w-12 h-12 text-brand-400 animate-spin mx-auto mb-4" />
                    <h3 className="text-xl font-display font-bold text-white mb-2">Processing...</h3>
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
                                "px-3 py-1.5 rounded-lg text-sm font-medium transition-all active:scale-95",
                                parseFloat(buyAmount) === amount
                                  ? "bg-brand-400 text-white"
                                  : "bg-white/[0.03] text-surface-400 hover:text-white hover:bg-white/[0.06]"
                              )}
                            >
                              {amount}
                            </button>
                          ))}
                        </div>

                        {/* Slippage Tolerance */}
                        <div className="mt-4">
                          <Tooltip content="Maximum price change you'll accept between order and execution">
                            <label className="text-xs text-surface-500 mb-1.5 block cursor-help w-fit">
                              Slippage Tolerance
                            </label>
                          </Tooltip>
                          <div className="flex gap-2">
                            {SLIPPAGE_PRESETS.map(s => (
                              <button
                                key={s}
                                onClick={() => setSlippage(s)}
                                className={cn(
                                  'px-3 py-1 rounded-lg text-xs font-medium transition-all active:scale-95',
                                  slippage === s
                                    ? 'bg-brand-400/[0.12] text-brand-400 border border-brand-400/[0.2]'
                                    : 'bg-white/[0.03] text-surface-500 hover:text-surface-300'
                                )}
                              >
                                {s}%
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="mt-2 space-y-1">
                          {wallet.balance.public === 0n && (
                            <div className="flex items-start gap-2 p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 mb-1">
                              <AlertCircle className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0 mt-0.5" />
                              <p className="text-xs text-yellow-300 leading-relaxed">
                                You have <strong>0 public ALEO</strong>. Trading requires public ALEO for gas.
                              </p>
                            </div>
                          )}
                          <p className="text-xs text-surface-500">
                            {isStablecoin
                              ? `${tokenType} Balance: ${formatCredits(tokenType === 'USDCX' ? wallet.balance.usdcxPublic + wallet.balance.usdcxPrivate : wallet.balance.usadPublic + wallet.balance.usadPrivate)} ${tokenType}`
                              : <>Public Balance: {formatCredits(wallet.balance.public)} ALEO</>
                            }
                          </p>
                          <Tooltip content="Gas fee paid to Aleo network validators for processing your transaction" side="bottom">
                            <p className="text-xs text-surface-600 cursor-help w-fit">
                              Transaction fee: 1.5 ALEO (from public balance)
                            </p>
                          </Tooltip>
                        </div>
                      </motion.div>
                    )}

                    {/* Trade Preview */}
                    {tradePreview && selectedOutcome && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="p-4 rounded-xl bg-white/[0.02] mb-6"
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
                        <div className="flex justify-between pt-2 border-t border-white/[0.06]">
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
                          ? "bg-brand-400 hover:bg-brand-300 text-white active:scale-[0.98]"
                          : "bg-white/[0.04] text-surface-500 cursor-not-allowed"
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
                            <div className="flex items-center justify-center py-6 rounded-xl bg-white/[0.02]">
                              <Loader2 className="w-5 h-5 text-brand-400 animate-spin mr-2" />
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
                                        ? 'bg-brand-500/10 border-brand-500/40 ring-1 ring-brand-400/20'
                                        : 'bg-white/[0.02] border-white/[0.06] hover:border-surface-600/50'
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
                            <div className="p-4 rounded-xl bg-white/[0.02] text-center">
                              <Wallet className="w-6 h-6 text-surface-500 mx-auto mb-2" />
                              <p className="text-xs text-surface-400">{fetchRecordError}</p>
                            </div>
                          )}

                          {/* Initial prompt — no fetch attempted yet */}
                          {!isFetchingRecords && walletShareRecords.length === 0 && !fetchRecordError && (
                            <button
                              onClick={handleFetchRecords}
                              className="w-full py-6 rounded-xl bg-white/[0.02] border border-dashed border-white/[0.06] hover:border-brand-400/[0.2] transition-all text-center group"
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
                            className="p-3 rounded-xl bg-white/[0.03] space-y-2"
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
                                        ? 'bg-brand-400/[0.12] text-brand-400 border border-brand-400/[0.2]'
                                        : 'bg-white/[0.03] text-surface-500 hover:text-surface-300'
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
                            className="p-4 rounded-xl bg-white/[0.02] space-y-2"
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
                            <div className="flex justify-between pt-2 border-t border-white/[0.06]">
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
                              : "bg-white/[0.04] text-surface-500 cursor-not-allowed"
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
                        <Loader2 className="w-12 h-12 text-brand-400 animate-spin mx-auto mb-4" />
                        <h3 className="text-xl font-display font-bold text-white mb-2">Processing...</h3>
                        <p className="text-surface-400">Please confirm the transaction in your wallet.</p>
                      </div>
                    )}

                    {/* Sell: Pending */}
                    {sellStep === 'pending' && (
                      <div className="text-center py-8">
                        <Loader2 className="w-12 h-12 text-brand-400 animate-spin mx-auto mb-4" />
                        <h3 className="text-xl font-display font-bold text-white mb-2">Transaction Pending</h3>
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
                        <h3 className="text-xl font-display font-bold text-white mb-2">Shares Sold!</h3>
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
                        <h3 className="text-xl font-display font-bold text-white mb-2">Sell Failed</h3>
                        <p className="text-surface-400 mb-6 whitespace-pre-line text-left text-sm">{sellError}</p>
                        <button onClick={resetSell} className="btn-primary w-full">
                          Try Again
                        </button>
                      </div>
                    )}
                  </>
                )}
              </motion.div>

              {/* Market Information — below trading panel */}
              <div className="glass-card p-5">
                <h4 className="text-xs font-heading font-semibold text-surface-400 uppercase tracking-wider mb-4">Market Info</h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-surface-500">Market ID</span>
                    <CopyableText text={market.id} displayText={`${market.id.slice(0, 8)}...${market.id.slice(-6)}`} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-surface-500">Created</span>
                    <span className="text-xs font-medium text-white tabular-nums">
                      {createdTimestamp || (market.transactionId?.startsWith('at1') ? 'Fetching...' : 'On-chain')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-surface-500">Deadline</span>
                    <span className="text-xs font-medium text-white tabular-nums">
                      {market.deadlineTimestamp
                        ? new Date(market.deadlineTimestamp).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                        : `Block ${market.deadline.toString()}`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-surface-500">Token</span>
                    <span className="text-xs font-medium text-white">{tokenSymbol}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-surface-500">Creator</span>
                    {isValidAleoAddress(market.creator) ? (
                      <a href={`https://testnet.explorer.provable.com/address/${market.creator}`} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1">
                        {market.creator?.slice(0, 8)}...{market.creator?.slice(-4)} <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <span className="text-xs text-surface-400">{market.creator?.slice(0, 8)}...{market.creator?.slice(-4)}</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-surface-500">Oracle</span>
                    <span className="text-xs text-white truncate max-w-[140px]">{market.resolutionSource || 'On-chain'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-surface-500">Fees</span>
                    <span className="text-xs text-white">2%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-surface-500">Contract</span>
                    <a href={`https://testnet.explorer.provable.com/program/${CONTRACT_INFO.programId}`} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1">
                      {CONTRACT_INFO.programId.slice(0, 12)}... <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>

                {/* Verify On-Chain */}
                {market.transactionId && market.transactionId.startsWith('at1') && (
                  <a
                    href={`${config.explorerUrl}/transaction/${market.transactionId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-brand-500/8 border border-brand-500/15 text-brand-400 hover:bg-brand-500/15 hover:border-brand-500/30 transition-all text-xs font-semibold"
                  >
                    <Shield className="w-3.5 h-3.5" />
                    <span>Verify On-Chain</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />

      {/* Mobile sticky trade CTA — only when market is active and tradeable */}
      {canTrade && (
        <div className="fixed bottom-0 left-0 right-0 z-40 lg:hidden p-4 bg-surface-950/90 backdrop-blur-xl border-t border-white/[0.04]">
          <div className="flex gap-3">
            <button
              onClick={() => {
                setTradeMode('buy')
                tradingPanelRef.current?.scrollIntoView({ behavior: 'smooth' })
              }}
              className="flex-1 btn-yes py-3 text-sm font-semibold"
            >
              <ShoppingCart className="w-4 h-4 inline mr-1.5" />
              Buy Shares
            </button>
            <button
              onClick={() => {
                setTradeMode('sell')
                tradingPanelRef.current?.scrollIntoView({ behavior: 'smooth' })
              }}
              className="flex-1 btn-no py-3 text-sm font-semibold"
            >
              <TrendingDown className="w-4 h-4 inline mr-1.5" />
              Sell Shares
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
