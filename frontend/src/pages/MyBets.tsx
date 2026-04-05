import { motion, AnimatePresence } from 'framer-motion'
import {
  TrendingUp,
  TrendingDown,
  ArrowDownToLine,
  Clock,
  Loader2,
  ExternalLink,
  RefreshCw,
  Trophy,
  XCircle,
  RefreshCcw,
  Gift,
  Search,
  Plus,
  X,
  Download,
  DollarSign,
  BarChart2,
  Shield,
  Ticket,
  ArrowUpRight,
  ArrowDownRight,
  Star,
  ChevronRight,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useWalletStore, useBetsStore, type Bet, type Market, outcomeToIndex, outcomeToString } from '@/lib/store'
import { useParlayStore, type ParlayRecord } from '@/lib/parlay-store'
import { useRealMarketsStore } from '@/lib/market-store'
import { DashboardHeader } from '@/components/DashboardHeader'
import { Footer } from '@/components/Footer'
import { ClaimWinningsModal } from '@/components/ClaimWinningsModal'
import { ParlayClaimModal } from '@/components/ParlayClaimModal'
import { EmptyState } from '@/components/EmptyState'
import { useRepairParlayExplorerIds } from '@/hooks/useRepairParlayExplorerIds'
import { cn, formatCredits } from '@/lib/utils'
import { devWarn } from '../lib/logger'
import { calculateAllPrices, calculateSellTokensOut, type AMMReserves } from '@/lib/amm'
import { getMarketOutcomeLabels } from '@/lib/market-outcomes'
import {
  describeParlayFundingSource,
  formatParlayAmount,
  getParlayTransactionUrl,
  getShortParlayId,
} from '@/lib/parlay-helpers'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

type BetFilter = 'all' | 'accepted' | 'unredeemed' | 'settled' | 'history' | 'watchlist'

const TABS: { key: BetFilter; label: string }[] = [
  { key: 'accepted', label: 'Open Positions' },
  { key: 'unredeemed', label: 'Unredeemed' },
  { key: 'settled', label: 'Resolved' },
  { key: 'history', label: 'History' },
  { key: 'watchlist', label: 'Watchlist' },
]

/* ─── Outcome badge colors (shared between table & card) ─── */
const OUTCOME_BADGE_COLORS = [
  { bg: 'bg-yes-500/15', text: 'text-yes-400' },
  { bg: 'bg-no-500/15', text: 'text-no-400' },
  { bg: 'bg-purple-500/15', text: 'text-purple-400' },
  { bg: 'bg-yellow-500/15', text: 'text-yellow-400' },
]

function getBetOutcomeLabel(
  bet: Bet,
  market?: Partial<Pick<Market, 'numOutcomes' | 'outcomeLabels'>>,
): string {
  const outcomeIdx = outcomeToIndex(bet.outcome)
  const label = market ? getMarketOutcomeLabels({
    numOutcomes: market.numOutcomes ?? Math.max(market.outcomeLabels?.length || 2, 2),
    outcomeLabels: market.outcomeLabels ?? [],
  })[outcomeIdx - 1] : null
  return label || bet.outcome
}

function formatPurchaseTime(timestamp: number): string {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return 'Purchase time unavailable'

  const dateLabel = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  const timeLabel = date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  })

  return `Bought on ${dateLabel} at ${timeLabel}`
}

function getOutcomeCurrentPrice(market: Market | undefined, outcomeIdx: number): number | null {
  if (!market) return null
  const genericPrice = market.outcomePrices?.[outcomeIdx - 1]
  if (genericPrice !== undefined) return genericPrice

  const reserves: AMMReserves = {
    reserve_1: market.yesReserve ?? 0n,
    reserve_2: market.noReserve ?? 0n,
    reserve_3: market.reserve3 ?? 0n,
    reserve_4: market.reserve4 ?? 0n,
    num_outcomes: market.numOutcomes || 2,
  }
  const prices = calculateAllPrices(reserves)
  return prices[outcomeIdx - 1] ?? null
}

function getMarketReserves(market: Market | undefined): AMMReserves | null {
  if (!market) return null
  return {
    reserve_1: market.yesReserve ?? 0n,
    reserve_2: market.noReserve ?? 0n,
    reserve_3: market.reserve3 ?? 0n,
    reserve_4: market.reserve4 ?? 0n,
    num_outcomes: market.numOutcomes || 2,
  }
}

function formatShareQuantity(quantity: bigint): string {
  const value = Number(quantity) / 1_000_000
  return value.toLocaleString(undefined, {
    minimumFractionDigits: value >= 100 || Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 4,
  })
}

type PortfolioToken = 'ALEO' | 'USDCX' | 'USAD'
type PortfolioTokenTotals = Record<PortfolioToken, number>

function createPortfolioTokenTotals(): PortfolioTokenTotals {
  return {
    ALEO: 0,
    USDCX: 0,
    USAD: 0,
  }
}

function normalizePortfolioToken(token?: string): PortfolioToken {
  if (token === 'USDCX' || token === 'USAD') return token
  return 'ALEO'
}

function formatPortfolioTokenSummary(
  totals: PortfolioTokenTotals,
  options?: { signed?: boolean; emptyLabel?: string },
): string {
  const signed = options?.signed ?? false
  const entries = (Object.entries(totals) as [PortfolioToken, number][])
    .filter(([, amount]) => Math.abs(amount) >= 0.000001)

  if (entries.length === 0) return options?.emptyLabel ?? '0'

  return entries
    .map(([token, amount]) => {
      const prefix = signed && amount > 0 ? '+' : ''
      return `${prefix}${amount.toFixed(2)} ${token}`
    })
    .join(' · ')
}

function getOpenPositionMetrics(bet: Bet, market: Market | undefined) {
  const shares = bet.sharesReceived || bet.amount
  const sharesRaw = Number(shares) / 1_000_000
  const amountRaw = Number(bet.amount) / 1_000_000
  const avgPrice = sharesRaw > 0 ? amountRaw / sharesRaw : 0
  const outcomeIdx = outcomeToIndex(bet.outcome)
  const currentPrice = getOutcomeCurrentPrice(market, outcomeIdx) ?? avgPrice
  const reserves = getMarketReserves(market)
  const quotedValueMicro = reserves ? calculateSellTokensOut(reserves, outcomeIdx, shares) : 0n
  const currentValue = quotedValueMicro > 0n
    ? Number(quotedValueMicro) / 1_000_000
    : sharesRaw * currentPrice
  const exitPrice = sharesRaw > 0 ? currentValue / sharesRaw : currentPrice
  const pnlAmount = currentValue - amountRaw
  const pnlPct = amountRaw > 0 ? (pnlAmount / amountRaw) * 100 : 0

  return {
    shares,
    sharesRaw,
    amountRaw,
    avgPrice,
    currentPrice,
    exitPrice,
    currentValue,
    pnlAmount,
    pnlPct,
  }
}

export function MyBets() {
  const navigate = useNavigate()
  const { wallet } = useWalletStore()
  const { parlays, patchParlay } = useParlayStore()
  const {
    userBets,
    pendingBets,
    fetchUserBets,
    syncBetStatuses,
    reconcileClaimedBets,
    markBetUnclaimed,
    addPendingBet,
    removePendingBet,
  } = useBetsStore()
  const { markets, fetchMarkets } = useRealMarketsStore()
  const [isLoading, setIsLoading] = useState(true)
  const [filter, setFilter] = useState<BetFilter>('accepted')
  const [claimModalBet, setClaimModalBet] = useState<Bet | null>(null)
  const [claimModalMode, setClaimModalMode] = useState<'winnings' | 'refund'>('winnings')
  const [claimParlay, setClaimParlay] = useState<ParlayRecord | null>(null)
  const [claimRepairNotice, setClaimRepairNotice] = useState<string | null>(null)

  // Import Bet state
  const [showImport, setShowImport] = useState(false)
  const [importTxId, setImportTxId] = useState('')
  const [importMarketId, setImportMarketId] = useState('')
  const [importAmount, setImportAmount] = useState('')
  const [importOutcome, setImportOutcome] = useState<string>('yes')
  const [importError, setImportError] = useState('')
  const [importSuccess, setImportSuccess] = useState(false)

  useRepairParlayExplorerIds({
    parlays,
    patchParlay,
    walletAddress: wallet.address ?? undefined,
  })

  const walletParlays = useMemo(
    () => wallet.address ? parlays.filter((parlay) => parlay.ownerAddress === wallet.address) : [],
    [parlays, wallet.address],
  )

  // Categorize bets (deduplicate: if a bet ID exists in userBets, skip it from pendingBets)
  const userBetIds = new Set(userBets.map(b => b.id))
  const uniquePending = pendingBets.filter(b => !userBetIds.has(b.id))
  const allBets = [...uniquePending, ...userBets]
  // Open Positions should only show confirmed active buys, not still-pending submissions.
  const acceptedBets = userBets.filter(b => b.status === 'active' && b.type !== 'sell')
  const unredeemedBets = userBets.filter(b =>
    (b.status === 'won' || b.status === 'refunded') && !b.claimed && b.type !== 'sell'
  )
  const settledBets = userBets.filter(b =>
    b.status === 'won' || b.status === 'lost' || b.status === 'refunded'
    || (b.type === 'sell' && b.status === 'active')
  )
  // History: only completed/settled bets (won, lost, refunded, sold)
  const historyBets = userBets.filter(b =>
    b.status === 'won' || b.status === 'lost' || b.status === 'refunded'
    || (b.type === 'sell')
  )
  const activeParlays = walletParlays.filter((parlay) => parlay.status === 'active' || parlay.status === 'pending_dispute')
  const claimableParlays = walletParlays.filter((parlay) => parlay.status === 'won' && !parlay.claimed)
  const settledParlays = walletParlays.filter((parlay) =>
    parlay.status === 'won' || parlay.status === 'lost' || parlay.status === 'cancelled'
  )
  const historyParlays = walletParlays

  // Tab counts
  const tabCounts: Record<BetFilter, number> = {
    all: allBets.length + historyParlays.length,
    accepted: acceptedBets.length + activeParlays.length,
    unredeemed: unredeemedBets.length + claimableParlays.length,
    settled: settledBets.length + settledParlays.length,
    history: historyBets.length + historyParlays.length,
    watchlist: 0,
  }

  // Display bets based on active filter
  const displayBets =
    filter === 'all' ? allBets
    : filter === 'accepted' ? acceptedBets
    : filter === 'unredeemed' ? unredeemedBets
    : filter === 'settled' ? settledBets
    : filter === 'history' ? historyBets
    : []
  const displayParlays =
    filter === 'all' ? historyParlays
    : filter === 'accepted' ? activeParlays
    : filter === 'unredeemed' ? claimableParlays
    : filter === 'settled' ? settledParlays
    : filter === 'history' ? historyParlays
    : []
  const hasPortfolioEntries = displayBets.length > 0 || displayParlays.length > 0

  // ─── Performance chart data ───
  const performanceData = useMemo(() => {
    if (allBets.length < 2) return null
    // Build cumulative portfolio value over time from chronological bets
    const sorted = [...allBets].sort((a, b) => a.placedAt - b.placedAt)
    let cumValue = 0
    return sorted.map((bet) => {
      const amount = Number(bet.amount) / 1_000_000
      if (bet.status === 'won') {
        cumValue += Number(bet.sharesReceived || bet.amount) / 1_000_000 - amount
      } else if (bet.status === 'lost') {
        cumValue -= amount
      } else if (bet.status === 'active') {
        cumValue += amount * 0.1 // open positions: approximate unrealised
      }
      return {
        date: new Date(bet.placedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        value: parseFloat(cumValue.toFixed(2)),
      }
    })
  }, [allBets])

  // Redirect handled by ProtectedRoute wrapper in App.tsx

  // Load bets and sync statuses on mount
  useEffect(() => {
    const loadAndSync = async () => {
      setIsLoading(true)

      // Debug: Check localStorage directly
      const addr = wallet.address
      if (addr) {
        const rawPending = localStorage.getItem(`veiled_markets_pending_${addr}`)
        const rawBets = localStorage.getItem(`veiled_markets_bets_${addr}`)
        devWarn('[MyBets] localStorage raw data:', {
          address: addr,
          pendingKey: `veiled_markets_pending_${addr}`,
          pendingData: rawPending ? JSON.parse(rawPending) : null,
          betsKey: `veiled_markets_bets_${addr}`,
          betsData: rawBets ? JSON.parse(rawBets) : null,
        })
      } else {
        devWarn('[MyBets] No wallet address available!')
      }

      await Promise.all([
        fetchMarkets(),
        fetchUserBets(),
      ])
      await syncBetStatuses()
      const restoredClaims = await reconcileClaimedBets()
      setClaimRepairNotice(
        restoredClaims > 0
          ? `${restoredClaims} claimed ${restoredClaims === 1 ? 'position was' : 'positions were'} restored after checking your wallet records.`
          : null
      )

      // Debug: Check store state after load (read directly from store, not stale closure)
      const storeState = useBetsStore.getState()
      devWarn('[MyBets] After load — store state:', {
        userBets: storeState.userBets.length,
        pendingBets: storeState.pendingBets.length,
        userBetIds: storeState.userBets.map(b => b.id.slice(0, 20)),
        pendingBetIds: storeState.pendingBets.map(b => b.id.slice(0, 20)),
        markets: markets.length,
      })

      setIsLoading(false)
    }
    loadAndSync()
  }, [fetchMarkets, fetchUserBets, syncBetStatuses, reconcileClaimedBets])

  // Get market info for a bet
  const getMarketInfo = (marketId: string) => {
    return markets.find(m => m.id === marketId)
  }

  // Handle refresh with sync
  const handleRefresh = async () => {
    setIsLoading(true)
    await Promise.all([
      fetchMarkets(),
      fetchUserBets(),
    ])
    await syncBetStatuses()
    const restoredClaims = await reconcileClaimedBets()
    setClaimRepairNotice(
      restoredClaims > 0
        ? `${restoredClaims} claimed ${restoredClaims === 1 ? 'position was' : 'positions were'} restored after checking your wallet records.`
        : null
    )
    setIsLoading(false)
  }

  // Open claim/refund modal for a specific bet
  const openClaimModal = (bet: Bet, mode: 'winnings' | 'refund') => {
    setClaimModalBet(bet)
    setClaimModalMode(mode)
  }

  // Handle import bet
  const handleImportBet = () => {
    setImportError('')
    const txId = importTxId.trim()
    if (!txId) {
      setImportError('Transaction ID is required')
      return
    }
    if (!txId.startsWith('at1')) {
      setImportError('Transaction ID must start with "at1"')
      return
    }
    if (!importMarketId) {
      setImportError('Please select a market')
      return
    }
    const amountNum = parseFloat(importAmount)
    if (!amountNum || amountNum <= 0) {
      setImportError('Enter a valid amount')
      return
    }
    // Check for duplicate
    const allExisting = [...userBets, ...pendingBets]
    if (allExisting.some(b => b.id === txId)) {
      setImportError('This transaction is already tracked')
      return
    }

    const amountMicro = BigInt(Math.floor(amountNum * 1_000_000))
    const market = markets.find(m => m.id === importMarketId)

    addPendingBet({
      id: txId,
      marketId: importMarketId,
      amount: amountMicro,
      outcome: importOutcome,
      placedAt: Date.now(),
      status: 'active',
      marketQuestion: market?.question,
    })

    setImportSuccess(true)
    setTimeout(() => {
      setShowImport(false)
      setImportTxId('')
      setImportMarketId('')
      setImportAmount('')
      setImportOutcome('yes')
      setImportSuccess(false)
      setImportError('')
    }, 1500)
  }

  // Empty state config per tab
  const emptyConfig: Record<BetFilter, { title: string; subtitle: string }> = {
    all: {
      title: 'No bets yet',
      subtitle: "You haven't placed any bets. Browse active markets to make your first prediction.",
    },
    accepted: {
      title: 'No open positions',
      subtitle: "Active market positions and parlays appear here after on-chain confirmation.",
    },
    unredeemed: {
      title: 'No unredeemed bets',
      subtitle: "Winning positions and parlays that still need claiming will appear here.",
    },
    settled: {
      title: 'No resolved positions yet',
      subtitle: "Resolved bets and parlays appear here after final outcome settlement.",
    },
    history: {
      title: 'No transaction history',
      subtitle: "All confirmed bets and parlay tickets will appear here.",
    },
    watchlist: {
      title: 'No saved markets',
      subtitle: "Bookmark markets to track them here.",
    },
  }

  if (!wallet.connected) {
    return null
  }

  return (
    <div className="min-h-screen bg-surface-950 flex flex-col">
      <DashboardHeader />

      <main className="flex-1 pt-20 pb-20 md:pb-0">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Page Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="font-display text-[2rem] leading-[1.15] tracking-tight text-white mb-1">Portfolio</h1>
              <div className="flex items-center gap-3">
                <p className="text-surface-400 text-sm">Track your positions and performance</p>
                <Link
                  to="/my-parlays"
                  className="inline-flex items-center gap-1.5 rounded-full bg-brand-500/10 px-3 py-1 text-xs font-medium text-brand-400 hover:bg-brand-500/20 transition-colors"
                >
                  Parlay Details
                </Link>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowImport(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.04] hover:bg-white/[0.06] transition-colors text-surface-400 hover:text-white text-sm"
                title="Import existing bet"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Import</span>
              </button>
              <button
                onClick={handleRefresh}
                disabled={isLoading}
                className="p-2 rounded-lg bg-white/[0.03] border border-white/[0.04] hover:bg-white/[0.06] transition-colors text-surface-400 hover:text-white disabled:opacity-50"
                title="Refresh"
              >
                <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
              </button>
            </div>
          </div>

          {/* ═══ STATS CARDS (Premium Layout) ═══ */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {(() => {
              const activeBets = userBets.filter(b => b.status === 'active' && b.type !== 'sell')
              const exposureByToken = createPortfolioTokenTotals()
              const profitByToken = createPortfolioTokenTotals()
              const activeBetCount = activeBets.length

              activeBets.forEach((bet) => {
                const market = getMarketInfo(bet.marketId)
                const token = normalizePortfolioToken(market?.tokenType || bet.tokenType)
                exposureByToken[token] += getOpenPositionMetrics(bet, market).currentValue
              })

              activeParlays.forEach((parlay) => {
                exposureByToken[parlay.tokenType] += Number(parlay.stake) / 1_000_000
              })

              const wonParlays = settledParlays.filter((parlay) => parlay.status === 'won')
              const lostParlays = settledParlays.filter((parlay) => parlay.status === 'lost')
              userBets.forEach((bet) => {
                if (bet.type === 'sell') return
                const market = getMarketInfo(bet.marketId)
                const token = normalizePortfolioToken(market?.tokenType || bet.tokenType)

                if (bet.status === 'won') {
                  profitByToken[token] += Number((bet.sharesReceived || bet.amount) - bet.amount) / 1_000_000
                } else if (bet.status === 'lost') {
                  profitByToken[token] -= Number(bet.amount) / 1_000_000
                }
              })

              wonParlays.forEach((parlay) => {
                profitByToken[parlay.tokenType] += Number(parlay.potentialPayout - parlay.stake) / 1_000_000
              })

              lostParlays.forEach((parlay) => {
                profitByToken[parlay.tokenType] -= Number(parlay.stake) / 1_000_000
              })

              const claimable = userBets.filter(b => (b.status === 'won' || b.status === 'refunded') && !b.claimed)
              const claimableItems = claimable.length + claimableParlays.length

              return [
                {
                  label: 'Active Exposure',
                  value: formatPortfolioTokenSummary(exposureByToken, { emptyLabel: '0' }),
                  icon: DollarSign,
                  color: 'text-white',
                  sub: `${activeBetCount} market positions · ${activeParlays.length} active parlays`,
                },
                {
                  label: 'Total P&L',
                  value: formatPortfolioTokenSummary(profitByToken, { signed: true, emptyLabel: '0' }),
                  icon: Object.values(profitByToken).reduce((sum, amount) => sum + amount, 0) >= 0 ? TrendingUp : TrendingDown,
                  color: Object.values(profitByToken).reduce((sum, amount) => sum + amount, 0) >= 0 ? 'text-yes-400' : 'text-no-400',
                  sub: `${userBets.filter((bet) => bet.status === 'won').length} won bets · ${wonParlays.length} won parlays`,
                },
                { label: 'Open Positions', value: `${activeBets.length + uniquePending.length + activeParlays.length}`, icon: BarChart2, color: 'text-white', sub: `${uniquePending.length} pending bets · ${activeParlays.length} active parlays` },
                { label: 'Claimable Items', value: `${claimableItems}`, icon: Shield, color: claimableItems > 0 ? 'text-brand-400' : 'text-white', sub: `${claimable.length} bets · ${claimableParlays.length} parlays` },
              ].map((stat, i) => (
                <motion.div key={stat.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 + i * 0.04 }}
                  className="glass-card rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <stat.icon className={cn('w-4 h-4', stat.color === 'text-white' ? 'text-surface-500' : stat.color)} />
                    <span className="text-[10px] font-heading font-semibold text-surface-500 uppercase tracking-wider">{stat.label}</span>
                  </div>
                  <p className={cn('text-base font-heading font-bold tabular-nums', stat.color)}>{stat.value}</p>
                  <p className="text-[10px] text-surface-600 mt-1 font-heading">{stat.sub}</p>
                </motion.div>
              ))
            })()}
          </div>

          {/* ═══ PERFORMANCE CHART ═══ */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="glass-card rounded-2xl p-6 mb-8"
          >
            <div className="mb-4">
              <h2 className="text-base font-heading font-semibold text-white">Performance</h2>
              <p className="text-xs text-surface-500 mt-0.5">Market position value over time. Parlays are included in the activity feed below.</p>
            </div>
            {performanceData ? (
              <div className="h-[200px] w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <LineChart data={performanceData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                    <XAxis
                      dataKey="date"
                      tick={{ fill: '#6b7280', fontSize: 10 }}
                      axisLine={{ stroke: 'rgba(255,255,255,0.04)' }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: '#6b7280', fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) => `${v >= 0 ? '+' : ''}${v}`}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'rgba(15,15,20,0.95)',
                        border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: '12px',
                        fontSize: '12px',
                        color: '#fff',
                      }}
                      formatter={(value?: number) => [`${(value ?? 0) >= 0 ? '+' : ''}${(value ?? 0).toFixed(2)} ALEO`, 'P&L']}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="#8b5cf6"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, fill: '#8b5cf6', strokeWidth: 0 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[160px] flex items-center justify-center text-surface-600 text-sm">
                Not enough data &mdash; place at least 2 bets to see your performance chart.
              </div>
            )}
          </motion.div>

          {/* Filter Tabs — premium style */}
          <div className="flex items-center gap-1 p-1 mb-8 rounded-xl bg-white/[0.02] border border-white/[0.04] w-fit">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={cn(
                  'px-4 py-2 rounded-lg text-xs font-heading font-medium transition-all duration-200',
                  filter === tab.key
                    ? 'bg-white/[0.06] text-white'
                    : 'text-surface-500 hover:text-surface-300'
                )}
              >
                {tab.label}
                {tabCounts[tab.key] > 0 && (
                  <span className="ml-1.5 text-[10px] tabular-nums opacity-60">
                    {tabCounts[tab.key]}
                  </span>
                )}
              </button>
            ))}
          </div>

          {claimRepairNotice && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-8 rounded-2xl border border-yellow-500/20 bg-yellow-500/8 px-4 py-3"
            >
              <div className="flex items-start gap-3">
                <RefreshCcw className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-yellow-100">Claim status repaired</p>
                  <p className="text-xs text-yellow-200/75 mt-0.5">{claimRepairNotice}</p>
                </div>
              </div>
            </motion.div>
          )}

          {/* Content */}
          {filter === 'watchlist' ? (
            <div className="glass-card rounded-2xl p-12 text-center">
              <Star className="w-10 h-10 text-surface-600 mx-auto mb-4" />
              <h3 className="text-lg font-heading font-semibold text-white mb-2">No saved markets</h3>
              <p className="text-sm text-surface-500">Bookmark markets to track them here</p>
            </div>
          ) : isLoading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="glass-card rounded-2xl p-5"
                  style={{ animationDelay: `${i * 150}ms` }}
                >
                  <div className="flex items-start gap-4">
                    <div className="skeleton w-10 h-10 rounded-xl flex-shrink-0" />
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="skeleton h-4 w-2/3 rounded" />
                      <div className="skeleton h-3 w-1/3 rounded" />
                      <div className="flex gap-4 mt-3">
                        <div className="skeleton h-3 w-20 rounded" />
                        <div className="skeleton h-3 w-20 rounded" />
                        <div className="skeleton h-3 w-16 rounded" />
                      </div>
                    </div>
                    <div className="skeleton h-8 w-20 rounded-lg flex-shrink-0" />
                  </div>
                </div>
              ))}
            </div>
          ) : !hasPortfolioEntries ? (
            <EmptyState
              icon={<Search className="w-8 h-8 text-surface-500" />}
              title={emptyConfig[filter].title}
              subtitle={emptyConfig[filter].subtitle}
              action={{ label: 'Place a Bet', onClick: () => navigate('/dashboard') }}
            />
          ) : filter === 'accepted' ? (
            /* ═══ TABLE LAYOUT for Open Positions ═══ */
            <AnimatePresence mode="wait">
              <motion.div
                key="accepted-table"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
                className="space-y-6"
              >
                {displayBets.length > 0 && (
                  <>
                    {displayParlays.length > 0 && (
                      <div className="flex items-center gap-2 px-1">
                        <BarChart2 className="w-4 h-4 text-surface-400" />
                        <p className="text-sm font-heading font-semibold text-white">Market Positions</p>
                      </div>
                    )}

                    {/* Desktop table */}
                    <div className="hidden md:block glass-card rounded-2xl overflow-hidden">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-white/[0.04]">
                            <th className="text-left px-5 py-3 text-xs font-heading font-semibold text-surface-500 uppercase tracking-wider">Market</th>
                            <th className="text-center px-4 py-3 text-xs font-heading font-semibold text-surface-500 uppercase tracking-wider">Side</th>
                            <th className="text-center px-4 py-3 text-xs font-heading font-semibold text-surface-500 uppercase tracking-wider">Shares</th>
                            <th className="text-center px-4 py-3 text-xs font-heading font-semibold text-surface-500 uppercase tracking-wider">Value</th>
                            <th className="text-right px-4 py-3 text-xs font-heading font-semibold text-surface-500 uppercase tracking-wider">Unrealized P&L</th>
                            <th className="w-10 px-3 py-3"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {displayBets.map((bet, index) => {
                            const market = getMarketInfo(bet.marketId)
                            const tokenSymbol = market?.tokenType || bet.tokenType || 'ALEO'
                            const outcomeIdx = outcomeToIndex(bet.outcome)
                            const badgeColors = OUTCOME_BADGE_COLORS[outcomeIdx - 1] || OUTCOME_BADGE_COLORS[0]
                            const outcomeLabel = getBetOutcomeLabel(bet, market)
                            const isPending = bet.status === 'pending'
                            const {
                              shares,
                              avgPrice,
                              exitPrice,
                              currentValue,
                              pnlAmount,
                              pnlPct,
                            } = getOpenPositionMetrics(bet, market)

                            return (
                              <motion.tr
                                key={bet.id}
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.03 }}
                                onClick={() => navigate(`/market/${bet.marketId}`)}
                                className="border-b border-white/[0.03] last:border-0 cursor-pointer hover:bg-white/[0.02] transition-colors group"
                              >
                                <td className="px-5 py-4 max-w-[320px]">
                                  <p className="text-sm font-heading font-medium text-white truncate">
                                    {market?.question || bet.marketQuestion || `Market ${bet.marketId.slice(0, 12)}...`}
                                  </p>
                                  <p className="text-[10px] text-surface-400 mt-1">
                                    {formatPurchaseTime(bet.placedAt)}
                                  </p>
                                  <p className="text-[10px] text-surface-500 mt-0.5 tabular-nums">
                                    Avg. {avgPrice.toFixed(3)} {tokenSymbol} &rarr; Exit {exitPrice.toFixed(3)} {tokenSymbol}
                                  </p>
                                </td>
                                <td className="px-4 py-4 text-center">
                                  <div className="flex items-center justify-center gap-1.5">
                                    {isPending && (
                                      <Loader2 className="w-3 h-3 animate-spin text-accent-400" />
                                    )}
                                    <span className={cn(
                                      "px-2 py-0.5 text-[10px] font-bold rounded uppercase",
                                      badgeColors.bg, badgeColors.text
                                    )}>
                                      {outcomeLabel}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-4 py-4 text-center">
                                  <span className="text-sm font-heading font-semibold text-white tabular-nums">
                                    {formatShareQuantity(shares)}
                                  </span>
                                </td>
                                <td className="px-4 py-4 text-center">
                                  <span className="text-sm font-heading font-semibold text-white tabular-nums">
                                    {currentValue.toLocaleString(undefined, {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 4,
                                    })} {tokenSymbol}
                                  </span>
                                </td>
                                <td className="px-4 py-4 text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    {pnlAmount >= 0 ? (
                                      <ArrowUpRight className="w-3.5 h-3.5 text-yes-400" />
                                    ) : (
                                      <ArrowDownRight className="w-3.5 h-3.5 text-no-400" />
                                    )}
                                    <span className={cn(
                                      "text-sm font-heading font-semibold tabular-nums",
                                      pnlAmount >= 0 ? "text-yes-400" : "text-no-400"
                                    )}>
                                      {pnlAmount >= 0 ? '+' : ''}{pnlAmount.toFixed(2)}
                                    </span>
                                    <span className={cn(
                                      "text-[10px] tabular-nums ml-0.5",
                                      pnlAmount >= 0 ? "text-yes-400/60" : "text-no-400/60"
                                    )}>
                                      ({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%)
                                    </span>
                                  </div>
                                </td>
                                <td className="px-3 py-4">
                                  <ChevronRight className="w-4 h-4 text-surface-600 group-hover:text-surface-400 transition-colors" />
                                </td>
                              </motion.tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile cards for Open Positions */}
                    <div className="md:hidden space-y-3">
                      {displayBets.map((bet, index) => {
                        const market = getMarketInfo(bet.marketId)
                        const tokenSymbol = market?.tokenType || bet.tokenType || 'ALEO'
                        const outcomeIdx = outcomeToIndex(bet.outcome)
                        const badgeColors = OUTCOME_BADGE_COLORS[outcomeIdx - 1] || OUTCOME_BADGE_COLORS[0]
                        const outcomeLabel = getBetOutcomeLabel(bet, market)
                        const isPending = bet.status === 'pending'
                        const {
                          shares,
                          currentValue,
                          pnlAmount,
                          pnlPct,
                        } = getOpenPositionMetrics(bet, market)

                        return (
                          <motion.div
                            key={bet.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.03 }}
                            onClick={() => navigate(`/market/${bet.marketId}`)}
                            className="glass-card p-4 cursor-pointer hover:border-surface-600/50 transition-all"
                          >
                            <div className="flex items-start justify-between gap-3 mb-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 mb-1">
                                  {isPending && <Loader2 className="w-3 h-3 animate-spin text-accent-400" />}
                                  <span className={cn("px-2 py-0.5 text-[10px] font-bold rounded uppercase", badgeColors.bg, badgeColors.text)}>
                                    {outcomeLabel}
                                  </span>
                                </div>
                                <p className="text-sm font-heading font-medium text-white truncate">
                                  {market?.question || bet.marketQuestion || `Market ${bet.marketId.slice(0, 12)}...`}
                                </p>
                                <p className="text-[10px] text-surface-400 mt-1">
                                  {formatPurchaseTime(bet.placedAt)}
                                </p>
                              </div>
                              <ChevronRight className="w-4 h-4 text-surface-600 flex-shrink-0 mt-1" />
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                              <div>
                                <p className="text-[10px] text-surface-500 uppercase font-heading mb-0.5">Shares</p>
                                <p className="text-sm font-heading font-semibold text-white tabular-nums">{formatShareQuantity(shares)}</p>
                              </div>
                              <div>
                                <p className="text-[10px] text-surface-500 uppercase font-heading mb-0.5">Value</p>
                                <p className="text-sm font-heading font-semibold text-white tabular-nums">
                                  {currentValue.toLocaleString(undefined, {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 4,
                                  })} {tokenSymbol}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-[10px] text-surface-500 uppercase font-heading mb-0.5">Unrealized P&L</p>
                                <div className="flex items-center justify-end gap-0.5">
                                  {pnlAmount >= 0 ? (
                                    <ArrowUpRight className="w-3 h-3 text-yes-400" />
                                  ) : (
                                    <ArrowDownRight className="w-3 h-3 text-no-400" />
                                  )}
                                  <span className={cn("text-sm font-heading font-semibold tabular-nums", pnlAmount >= 0 ? "text-yes-400" : "text-no-400")}>
                                    {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%
                                  </span>
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        )
                      })}
                    </div>
                  </>
                )}

                {displayParlays.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 px-1">
                      <Ticket className="w-4 h-4 text-brand-400" />
                      <p className="text-sm font-heading font-semibold text-white">Parlays</p>
                    </div>
                    {displayParlays.map((parlay, index) => (
                      <ParlayPortfolioCard
                        key={parlay.id}
                        parlay={parlay}
                        index={index}
                        showClaimAction={false}
                        onClaim={() => setClaimParlay(parlay)}
                      />
                    ))}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          ) : (
            /* ═══ CARD LAYOUT for all other tabs ═══ */
            <AnimatePresence mode="wait">
              <motion.div
                key={filter}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
                className="space-y-6"
              >
                {displayBets.length > 0 && (
                  <div className="space-y-3">
                    {displayParlays.length > 0 && (
                      <div className="flex items-center gap-2 px-1">
                        <BarChart2 className="w-4 h-4 text-surface-400" />
                        <p className="text-sm font-heading font-semibold text-white">Market Positions</p>
                      </div>
                    )}
                    {displayBets.map((bet, index) => (
                      <BetCard
                        key={bet.id}
                        bet={bet}
                        market={getMarketInfo(bet.marketId)}
                        index={index}
                        onClaim={(mode) => openClaimModal(bet, mode)}
                        onRestoreClaim={() => {
                          markBetUnclaimed(bet.id)
                          setClaimRepairNotice('Claim status was restored manually. You can retry redemption now.')
                        }}
                        onRemove={bet.status === 'pending' ? () => removePendingBet(bet.id) : undefined}
                        showClaimAction={filter === 'unredeemed' || filter === 'all'}
                      />
                    ))}
                  </div>
                )}

                {displayParlays.length > 0 && (
                  <div className="space-y-3">
                    {displayBets.length > 0 && (
                      <div className="flex items-center gap-2 px-1">
                        <Ticket className="w-4 h-4 text-brand-400" />
                        <p className="text-sm font-heading font-semibold text-white">Parlays</p>
                      </div>
                    )}
                    {displayParlays.map((parlay, index) => (
                      <ParlayPortfolioCard
                        key={parlay.id}
                        parlay={parlay}
                        index={index}
                        showClaimAction={filter === 'unredeemed' || filter === 'all'}
                        onClaim={() => setClaimParlay(parlay)}
                      />
                    ))}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </main>

      {/* Debug info (dev mode) */}
      {import.meta.env.DEV && (
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 pb-4">
          <div className="text-[10px] text-surface-600 font-mono bg-white/[0.01] rounded-lg p-2">
            Store: {userBets.length} bets, {pendingBets.length} pending | Wallet: {wallet.address?.slice(0, 12)}... | Markets: {markets.length}
            {wallet.address && (() => {
              const raw = localStorage.getItem(`veiled_markets_pending_${wallet.address}`)
              const rawBets = localStorage.getItem(`veiled_markets_bets_${wallet.address}`)
              return ` | LS-pending: ${raw ? JSON.parse(raw).length : 0}, LS-bets: ${rawBets ? JSON.parse(rawBets).length : 0}`
            })()}
          </div>
        </div>
      )}

      <Footer />

      {/* Import Bet Modal */}
      <AnimatePresence>
        {showImport && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={(e) => e.target === e.currentTarget && setShowImport(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-md glass-card p-6 rounded-2xl"
            >
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-bold text-white">Import Bet</h2>
                <button
                  onClick={() => setShowImport(false)}
                  className="p-1.5 rounded-lg hover:bg-white/[0.03] transition-colors text-surface-400"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-xs text-surface-400 mb-4">
                Import an existing on-chain bet by entering its transaction details.
              </p>

              <div className="space-y-4">
                {/* Transaction ID */}
                <div>
                  <label className="block text-xs font-medium text-surface-400 mb-1.5">
                    Transaction ID
                  </label>
                  <input
                    type="text"
                    value={importTxId}
                    onChange={(e) => setImportTxId(e.target.value)}
                    placeholder="at1..."
                    className="w-full px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06] text-white text-sm placeholder:text-surface-600 focus:outline-none focus:border-brand-500/50"
                  />
                </div>

                {/* Market */}
                <div>
                  <label className="block text-xs font-medium text-surface-400 mb-1.5">
                    Market
                  </label>
                  <select
                    value={importMarketId}
                    onChange={(e) => setImportMarketId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06] text-white text-sm focus:outline-none focus:border-brand-500/50 appearance-none"
                  >
                    <option value="" className="bg-surface-900">Select market...</option>
                    {markets.map((m) => (
                      <option key={m.id} value={m.id} className="bg-surface-900">
                        {m.question}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Amount */}
                <div>
                  <label className="block text-xs font-medium text-surface-400 mb-1.5">
                    Amount (ALEO)
                  </label>
                  <input
                    type="number"
                    value={importAmount}
                    onChange={(e) => setImportAmount(e.target.value)}
                    placeholder="1.0"
                    step="0.1"
                    min="0"
                    className="w-full px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06] text-white text-sm placeholder:text-surface-600 focus:outline-none focus:border-brand-500/50"
                  />
                </div>

                {/* Outcome */}
                <div>
                  <label className="block text-xs font-medium text-surface-400 mb-1.5">
                    Prediction
                  </label>
                  {(() => {
                    const selectedMarket = markets.find(m => m.id === importMarketId)
                    const numOutcomes = selectedMarket?.numOutcomes ?? 2
                    const labels = selectedMarket?.outcomeLabels ?? (numOutcomes === 2 ? ['Yes', 'No'] : Array.from({ length: numOutcomes }, (_, i) => `Outcome ${i + 1}`))
                    const btnColors = [
                      { active: 'bg-yes-500 text-white', inactive: 'bg-white/[0.03] text-surface-400 hover:bg-white/[0.06]' },
                      { active: 'bg-no-500 text-white', inactive: 'bg-white/[0.03] text-surface-400 hover:bg-white/[0.06]' },
                      { active: 'bg-purple-500 text-white', inactive: 'bg-white/[0.03] text-surface-400 hover:bg-white/[0.06]' },
                      { active: 'bg-yellow-500 text-white', inactive: 'bg-white/[0.03] text-surface-400 hover:bg-white/[0.06]' },
                    ]
                    return (
                      <div className={cn('grid gap-2', numOutcomes <= 2 ? 'grid-cols-2' : 'grid-cols-2')}>
                        {labels.map((label, i) => {
                          const key = outcomeToString(i + 1)
                          const colors = btnColors[i] || btnColors[0]
                          return (
                            <button
                              key={key}
                              onClick={() => setImportOutcome(key)}
                              className={cn(
                                'py-2.5 rounded-lg text-sm font-medium transition-all',
                                importOutcome === key ? colors.active : colors.inactive
                              )}
                            >
                              {label.toUpperCase()}
                            </button>
                          )
                        })}
                      </div>
                    )
                  })()}
                </div>

                {/* Error */}
                {importError && (
                  <p className="text-xs text-red-400">{importError}</p>
                )}

                {/* Success */}
                {importSuccess && (
                  <p className="text-xs text-yes-400">Bet imported successfully!</p>
                )}

                {/* Submit */}
                <button
                  onClick={handleImportBet}
                  disabled={importSuccess}
                  className="w-full py-2.5 rounded-lg text-sm font-medium bg-brand-500 hover:bg-brand-400 text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Import Bet
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Claim/Refund Modal */}
      <ClaimWinningsModal
        mode={claimModalMode}
        isOpen={claimModalBet !== null}
        onClose={() => setClaimModalBet(null)}
        bets={claimModalBet ? [claimModalBet] : []}
        market={claimModalBet ? getMarketInfo(claimModalBet.marketId) : undefined}
        onClaimSuccess={() => {
          fetchUserBets()
        }}
      />

      <ParlayClaimModal
        parlay={claimParlay}
        isOpen={claimParlay !== null}
        onClose={() => setClaimParlay(null)}
      />
    </div>
  )
}

function BetCard({
  bet,
  market,
  index,
  onClaim,
  onRestoreClaim,
  onRemove,
  showClaimAction,
}: {
  bet: Bet
  market?: { question: string; tokenType?: 'ALEO' | 'USDCX' | 'USAD'; numOutcomes?: number; outcomeLabels?: string[] }
  index: number
  onClaim: (mode: 'winnings' | 'refund') => void
  onRestoreClaim: () => void
  onRemove?: () => void
  showClaimAction: boolean
}) {
  const isSell = bet.type === 'sell'
  const tokenSymbol = market?.tokenType || bet.tokenType || 'ALEO'
  const outcomeIdx = outcomeToIndex(bet.outcome) // 1-indexed
  const isPending = bet.status === 'pending'
  const isWon = bet.status === 'won'
  const isLost = bet.status === 'lost'
  const isRefunded = bet.status === 'refunded'
  const isActive = bet.status === 'active'

  // Resolve outcome label from market data
  const outcomeLabel = getBetOutcomeLabel(bet, market)
  const badgeColors = OUTCOME_BADGE_COLORS[outcomeIdx - 1] || OUTCOME_BADGE_COLORS[0]

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      className={cn(
        "glass-card p-5 transition-all duration-200 hover:border-surface-600/50",
        isPending && "border-accent-500/20",
        isSell && "border-purple-500/20",
        isWon && !bet.claimed && "border-yes-500/20",
        isLost && "border-no-500/15",
        isRefunded && !bet.claimed && "border-orange-500/20"
      )}
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        {/* Icon */}
        <div className={cn(
          "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0",
          isSell ? "bg-purple-500/10" :
          isWon ? "bg-yes-500/10" :
          isLost ? "bg-no-500/10" :
          isRefunded ? "bg-orange-500/10" :
          outcomeIdx === 1 ? "bg-yes-500/10" :
          outcomeIdx === 2 ? "bg-no-500/10" :
          outcomeIdx === 3 ? "bg-purple-500/10" : "bg-yellow-500/10"
        )}>
          {isSell ? (
            <ArrowDownToLine className="w-5 h-5 text-purple-400" />
          ) : isWon ? (
            <Trophy className="w-5 h-5 text-yes-400" />
          ) : isLost ? (
            <XCircle className="w-5 h-5 text-no-400" />
          ) : isRefunded ? (
            <RefreshCcw className="w-5 h-5 text-orange-400" />
          ) : (
            <TrendingUp className={cn('w-5 h-5', badgeColors.text)} />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            {isSell ? (
              <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded uppercase bg-purple-500/15 text-purple-400">
                SELL
              </span>
            ) : (
              <span className={cn(
                "px-1.5 py-0.5 text-[10px] font-semibold rounded uppercase",
                badgeColors.bg, badgeColors.text
              )}>
                {outcomeLabel}
              </span>
            )}
            {isPending && (
              <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-accent-500/15 text-accent-400 flex items-center gap-1">
                <Loader2 className="w-2.5 h-2.5 animate-spin" />
                Pending
              </span>
            )}
            {isSell && !isPending ? (
              <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-surface-600/30 text-surface-300">Completed</span>
            ) : (
              <>
                {isWon && (
                  <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-yes-500/15 text-yes-400">Won</span>
                )}
                {isLost && (
                  <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-no-500/15 text-no-400">Lost</span>
                )}
                {isRefunded && (
                  <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-orange-500/15 text-orange-400">Refund</span>
                )}
              </>
            )}
            {bet.claimed && (
              <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-surface-700 text-surface-400">Claimed</span>
            )}
          </div>
          <h3 className="text-sm font-heading font-medium text-white truncate">
            {market?.question || bet.marketQuestion || `Market ${bet.marketId.slice(0, 12)}...`}
          </h3>
          <p className="text-xs text-surface-500 mt-0.5 tabular-nums">
            {new Date(bet.placedAt).toLocaleDateString()}
          </p>
        </div>

        {/* Amount + Result */}
        <div className="flex items-center gap-3 sm:gap-4">
          {isSell ? (
            <>
              <div className="text-right">
                <p className="text-xs font-heading text-surface-500">Shares Sold</p>
                <p className="text-sm font-heading font-bold text-purple-400 tabular-nums">
                  {bet.sharesSold ? formatCredits(bet.sharesSold) : '\u2014'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs font-heading text-surface-500">Received</p>
                <p className="text-sm font-heading font-bold text-yes-400 tabular-nums">
                  +{formatCredits(bet.tokensReceived || bet.amount)} {tokenSymbol}
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="text-right">
                <p className="text-xs font-heading text-surface-500">Stake</p>
                <p className="text-sm font-heading font-bold text-white tabular-nums">{formatCredits(bet.amount)} {tokenSymbol}</p>
              </div>

              {(isWon || isLost || isRefunded) && (
                <div className="text-right">
                  <p className="text-xs text-surface-500">
                    {isWon ? 'Payout' : isRefunded ? 'Refund' : 'Result'}
                  </p>
                  <p className={cn(
                    "text-sm font-bold",
                    isWon && "text-yes-400",
                    isLost && "text-no-400",
                    isRefunded && "text-orange-400"
                  )}>
                    {isWon
                      ? `+${formatCredits(bet.sharesReceived || bet.amount)} ${tokenSymbol}`
                      : isRefunded
                        ? `${formatCredits(bet.amount)} ${tokenSymbol}`
                        : `-${formatCredits(bet.amount)} ${tokenSymbol}`}
                  </p>
                  {isWon && bet.sharesReceived != null && bet.sharesReceived > bet.amount ? (
                    <p className="text-[10px] text-yes-400/60 tabular-nums">
                      profit +{formatCredits(bet.sharesReceived - bet.amount)} {tokenSymbol}
                    </p>
                  ) : null}
                </div>
              )}

              {isActive && (
                <div className="text-right">
                  <p className="text-xs font-heading text-surface-500">Shares</p>
                  <p className={cn(
                    "text-sm font-bold",
                    badgeColors.text
                  )}>
                    {bet.sharesReceived
                      ? formatCredits(bet.sharesReceived)
                      : bet.lockedMultiplier
                        ? formatCredits(BigInt(Math.floor(Number(bet.amount) * bet.lockedMultiplier)))
                        : '\u2014'}
                  </p>
                </div>
              )}
            </>
          )}

          {/* Claim/Refund actions */}
          {!isSell && showClaimAction && isWon && !bet.claimed && (
            <button
              onClick={() => onClaim('winnings')}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-yes-500 hover:bg-yes-400 text-white transition-colors flex items-center gap-1.5"
            >
              <Gift className="w-3.5 h-3.5" />
              Claim
            </button>
          )}

          {!isSell && showClaimAction && isRefunded && !bet.claimed && (
            <button
              onClick={() => onClaim('refund')}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-orange-500 hover:bg-orange-400 text-white transition-colors flex items-center gap-1.5"
            >
              <RefreshCcw className="w-3.5 h-3.5" />
              Refund
            </button>
          )}

          {!isSell && bet.claimed && (isWon || isRefunded) && (
            <button
              onClick={onRestoreClaim}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.06] text-surface-300 transition-colors flex items-center gap-1.5"
              title="Use this if your redemption was rejected but this bet still shows claimed"
            >
              <RefreshCcw className="w-3.5 h-3.5" />
              Restore Claim
            </button>
          )}

          {bet.id.startsWith('at1') ? (
            <a
              href={`https://testnet.explorer.provable.com/transaction/${bet.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-lg hover:bg-white/[0.03] transition-colors"
              title="View on Explorer"
            >
              <ExternalLink className="w-3.5 h-3.5 text-surface-500" />
            </a>
          ) : (
            <div className="flex items-center gap-1">
              <div
                className="p-1.5 cursor-help"
                title="Transaction pending"
              >
                <Clock className="w-3.5 h-3.5 text-surface-600" />
              </div>
              {isPending && (
                <button
                  onClick={(e) => { e.stopPropagation(); onRemove?.() }}
                  className="p-1.5 rounded-lg hover:bg-no-500/20 transition-colors"
                  title="Remove this bet (if transaction was rejected)"
                >
                  <XCircle className="w-3.5 h-3.5 text-surface-500 hover:text-no-400" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}

function getParlayStatusBadge(status: ParlayRecord['status']) {
  switch (status) {
    case 'active':
      return (
        <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-blue-500/15 text-blue-300">
          Active
        </span>
      )
    case 'pending_dispute':
      return (
        <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-amber-500/15 text-amber-300">
          Pending Dispute
        </span>
      )
    case 'won':
      return (
        <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-yes-500/15 text-yes-400">
          Won
        </span>
      )
    case 'lost':
      return (
        <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-no-500/15 text-no-400">
          Lost
        </span>
      )
    case 'cancelled':
      return (
        <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-white/[0.06] text-surface-400">
          Cancelled
        </span>
      )
    default:
      return null
  }
}

function ParlayPortfolioCard({
  parlay,
  index,
  showClaimAction,
  onClaim,
}: {
  parlay: ParlayRecord
  index: number
  showClaimAction: boolean
  onClaim: () => void
}) {
  const txUrl = getParlayTransactionUrl(parlay.txId)
  const hasWalletSubmissionRef = Boolean(parlay.txId && !txUrl)
  const isWon = parlay.status === 'won'
  const isLost = parlay.status === 'lost'
  const isCancelled = parlay.status === 'cancelled'
  const isPendingDispute = parlay.status === 'pending_dispute'
  const isActive = parlay.status === 'active'
  const previewLegs = parlay.legs.slice(0, 2)
  const remainingLegs = Math.max(parlay.legs.length - previewLegs.length, 0)
  const legSummary = previewLegs
    .map((leg) => `${leg.outcomeLabel}: ${leg.marketQuestion}`)
    .join(' • ')
  const compactLegSummary = remainingLegs > 0
    ? `${legSummary} • +${remainingLegs} more`
    : legSummary
  const statusSummary = parlay.claimed
    ? 'Already claimed'
    : isWon
      ? 'Ready to claim'
      : isLost
        ? 'Ticket lost'
        : isCancelled
          ? 'Ticket cancelled'
          : isActive
            ? 'Waiting for resolution'
            : 'Waiting for dispute outcome'

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      className={cn(
        'glass-card p-5 transition-all duration-200 hover:border-surface-600/50',
        isWon && !parlay.claimed && 'border-yes-500/20',
        isLost && 'border-no-500/15',
        isPendingDispute && 'border-amber-500/20',
        isCancelled && 'border-white/[0.08]',
      )}
    >
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1.8fr)_minmax(120px,0.6fr)_minmax(140px,0.7fr)_auto] lg:items-center lg:gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={cn(
              'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
              isWon
                ? 'bg-yes-500/10'
                : isLost
                  ? 'bg-no-500/10'
                  : isPendingDispute
                    ? 'bg-amber-500/10'
                    : isCancelled
                      ? 'bg-white/[0.06]'
                      : 'bg-brand-500/10',
            )}
          >
            {isWon ? (
              <Trophy className="w-5 h-5 text-yes-400" />
            ) : isLost ? (
              <XCircle className="w-5 h-5 text-no-400" />
            ) : isPendingDispute ? (
              <Clock className="w-5 h-5 text-amber-300" />
            ) : isCancelled ? (
              <RefreshCcw className="w-5 h-5 text-surface-400" />
            ) : (
              <Ticket className="w-5 h-5 text-brand-400" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-heading font-semibold text-white">
                {parlay.numLegs}-Leg Parlay
              </h3>
              <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded uppercase bg-brand-500/15 text-brand-300">
                {parlay.tokenType}
              </span>
              {getParlayStatusBadge(parlay.status)}
              {parlay.claimed && (
                <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-emerald-500/10 text-emerald-300">
                  Claimed
                </span>
              )}
            </div>

            <p className="mt-1 text-xs text-surface-300 truncate">{compactLegSummary}</p>

            <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-surface-500">
              <span className="rounded-full border border-white/[0.08] px-2 py-1">
                {new Date(parlay.createdAt).toLocaleDateString()}
              </span>
              <span className="rounded-full border border-white/[0.08] px-2 py-1">
                {describeParlayFundingSource(parlay.fundingSource)}
              </span>
              <span className="rounded-full border border-white/[0.08] px-2 py-1">
                Ticket {getShortParlayId(parlay.onChainParlayId) ?? 'pending sync'}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-black/20 px-4 py-3">
          <p className="text-xs font-heading text-surface-500">Stake</p>
          <p className="mt-1 text-sm font-heading font-bold text-white tabular-nums">
            {formatParlayAmount(parlay.stake)} {parlay.tokenType}
          </p>
        </div>

        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3">
          <p className="text-xs font-heading text-emerald-300/80">Potential</p>
          <p
            className={cn(
              'mt-1 text-sm font-heading font-bold tabular-nums',
              isLost ? 'text-red-300 line-through' : 'text-emerald-300',
            )}
          >
            {formatParlayAmount(parlay.potentialPayout)} {parlay.tokenType}
          </p>
        </div>

        <div className="flex flex-col gap-2 rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3 sm:flex-row sm:items-center sm:justify-between lg:min-w-[240px]">
          <p className="text-xs text-surface-500">{statusSummary}</p>

          <div className="flex items-center gap-2">
            {txUrl ? (
              <a
                href={txUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-3 py-1.5 text-xs font-medium text-surface-300 hover:text-white transition-colors"
              >
                Explorer
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            ) : hasWalletSubmissionRef ? (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-3 py-1.5 text-xs text-surface-500">
                Wallet Ref {getShortParlayId(parlay.txId)}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-3 py-1.5 text-xs text-surface-500">
                <Clock className="w-3.5 h-3.5" />
                Pending
              </span>
            )}

            {showClaimAction && isWon && !parlay.claimed && (
              <button
                onClick={onClaim}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-600"
              >
                <Gift className="w-3.5 h-3.5" />
                Claim
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
