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
  ArrowUpRight,
  ArrowDownRight,
  Star,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWalletStore, useBetsStore, type Bet, outcomeToIndex, outcomeToString } from '@/lib/store'
import { useRealMarketsStore } from '@/lib/market-store'
import { DashboardHeader } from '@/components/DashboardHeader'
import { Footer } from '@/components/Footer'
import { ClaimWinningsModal } from '@/components/ClaimWinningsModal'
import { EmptyState } from '@/components/EmptyState'
import { cn, formatCredits } from '@/lib/utils'
import { devWarn } from '../lib/logger'

type BetFilter = 'all' | 'accepted' | 'unredeemed' | 'settled' | 'watchlist'

const TABS: { key: BetFilter; label: string }[] = [
  { key: 'accepted', label: 'Open Positions' },
  { key: 'unredeemed', label: 'Unredeemed' },
  { key: 'settled', label: 'Resolved' },
  { key: 'all', label: 'History' },
  { key: 'watchlist', label: 'Watchlist' },
]

export function MyBets() {
  const navigate = useNavigate()
  const { wallet } = useWalletStore()
  const { userBets, pendingBets, fetchUserBets, syncBetStatuses, addPendingBet, removePendingBet } = useBetsStore()
  const { markets } = useRealMarketsStore()
  const [isLoading, setIsLoading] = useState(true)
  const [filter, setFilter] = useState<BetFilter>('accepted')
  const [claimModalBet, setClaimModalBet] = useState<Bet | null>(null)
  const [claimModalMode, setClaimModalMode] = useState<'winnings' | 'refund'>('winnings')

  // Import Bet state
  const [showImport, setShowImport] = useState(false)
  const [importTxId, setImportTxId] = useState('')
  const [importMarketId, setImportMarketId] = useState('')
  const [importAmount, setImportAmount] = useState('')
  const [importOutcome, setImportOutcome] = useState<string>('yes')
  const [importError, setImportError] = useState('')
  const [importSuccess, setImportSuccess] = useState(false)

  // Categorize bets (deduplicate: if a bet ID exists in userBets, skip it from pendingBets)
  const userBetIds = new Set(userBets.map(b => b.id))
  const uniquePending = pendingBets.filter(b => !userBetIds.has(b.id))
  const allBets = [...uniquePending, ...userBets]
  // Sell bets with status 'active' are completed trades — show in settled, not accepted
  const acceptedBets = [...uniquePending, ...userBets.filter(b => b.status === 'active' && b.type !== 'sell')]
  const unredeemedBets = userBets.filter(b =>
    (b.status === 'won' || b.status === 'refunded') && !b.claimed && b.type !== 'sell'
  )
  const settledBets = userBets.filter(b =>
    b.status === 'won' || b.status === 'lost' || b.status === 'refunded'
    || (b.type === 'sell' && b.status === 'active')
  )

  // Tab counts
  const tabCounts: Record<BetFilter, number> = {
    all: allBets.length,
    accepted: acceptedBets.length,
    unredeemed: unredeemedBets.length,
    settled: settledBets.length,
    watchlist: 0,
  }

  // Display bets based on active filter
  const displayBets =
    filter === 'all' ? allBets
    : filter === 'accepted' ? acceptedBets
    : filter === 'unredeemed' ? unredeemedBets
    : filter === 'settled' ? settledBets
    : []

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

      await fetchUserBets()
      await syncBetStatuses()

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
  }, [fetchUserBets, syncBetStatuses])

  // Get market info for a bet
  const getMarketInfo = (marketId: string) => {
    return markets.find(m => m.id === marketId)
  }

  // Handle refresh with sync
  const handleRefresh = async () => {
    setIsLoading(true)
    await fetchUserBets()
    await syncBetStatuses()
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
      subtitle: "Active bets appear here after on-chain confirmation (usually 1-3 minutes).",
    },
    unredeemed: {
      title: 'No unredeemed bets',
      subtitle: "When you win a bet, you can claim your winnings here.",
    },
    settled: {
      title: 'No resolved bets',
      subtitle: "Resolved bets appear here after markets are resolved.",
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
              <p className="text-surface-400 text-sm">Track your positions and performance</p>
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
              const portfolioVal = activeBets.reduce((sum, b) => sum + Number(b.amount), 0) / 1_000_000
              const wonBets = userBets.filter(b => b.status === 'won')
              const totalWon = wonBets.reduce((sum, b) => sum + Number(b.sharesReceived || b.amount), 0) / 1_000_000
              const totalStaked = wonBets.reduce((sum, b) => sum + Number(b.amount), 0) / 1_000_000
              const pnl = totalWon - totalStaked
              const lostBets = userBets.filter(b => b.status === 'lost')
              const totalLost = lostBets.reduce((sum, b) => sum + Number(b.amount), 0) / 1_000_000
              const netPnl = pnl - totalLost
              const claimable = userBets.filter(b => (b.status === 'won' || b.status === 'refunded') && !b.claimed)
              const claimableVal = claimable.reduce((sum, b) => sum + Number(b.sharesReceived || b.amount), 0) / 1_000_000

              return [
                { label: 'Portfolio Value', value: `${portfolioVal.toFixed(2)} ALEO`, icon: DollarSign, color: 'text-white', sub: `${activeBets.length} active positions` },
                { label: 'Total P&L', value: `${netPnl >= 0 ? '+' : ''}${netPnl.toFixed(2)} ALEO`, icon: netPnl >= 0 ? TrendingUp : TrendingDown, color: netPnl >= 0 ? 'text-yes-400' : 'text-no-400', sub: `${wonBets.length} won, ${lostBets.length} lost` },
                { label: 'Open Positions', value: `${activeBets.length + uniquePending.length}`, icon: BarChart2, color: 'text-white', sub: `${uniquePending.length} pending` },
                { label: 'Claimable', value: `${claimableVal.toFixed(2)} ALEO`, icon: Shield, color: claimableVal > 0 ? 'text-brand-400' : 'text-white', sub: `${claimable.length} unredeemed` },
              ].map((stat, i) => (
                <motion.div key={stat.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 + i * 0.04 }}
                  className="glass-card rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <stat.icon className={cn('w-4 h-4', stat.color === 'text-white' ? 'text-surface-500' : stat.color)} />
                    <span className="text-2xs font-heading font-semibold text-surface-500 uppercase tracking-wider">{stat.label}</span>
                  </div>
                  <p className={cn('text-base font-heading font-bold tabular-nums', stat.color)}>{stat.value}</p>
                  <p className="text-2xs text-surface-600 mt-1 font-heading">{stat.sub}</p>
                </motion.div>
              ))
            })()}
          </div>

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
                  <span className="ml-1.5 text-2xs tabular-nums opacity-60">
                    {tabCounts[tab.key]}
                  </span>
                )}
              </button>
            ))}
          </div>

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
          ) : displayBets.length === 0 ? (
            <EmptyState
              icon={<Search className="w-8 h-8 text-surface-500" />}
              title={emptyConfig[filter].title}
              subtitle={emptyConfig[filter].subtitle}
              action={{ label: 'Place a Bet', onClick: () => navigate('/dashboard') }}
            />
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={filter}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
                className="space-y-3"
              >
                {displayBets.map((bet, index) => (
                  <BetCard
                    key={bet.id}
                    bet={bet}
                    market={getMarketInfo(bet.marketId)}
                    index={index}
                    onClaim={(mode) => openClaimModal(bet, mode)}
                    onRemove={bet.status === 'pending' ? () => removePendingBet(bet.id) : undefined}
                    showClaimAction={filter === 'unredeemed' || filter === 'all'}
                  />
                ))}
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
    </div>
  )
}

function BetCard({
  bet,
  market,
  index,
  onClaim,
  onRemove,
  showClaimAction,
}: {
  bet: Bet
  market?: { question: string; tokenType?: 'ALEO' | 'USDCX' | 'USAD'; numOutcomes?: number; outcomeLabels?: string[] }
  index: number
  onClaim: (mode: 'winnings' | 'refund') => void
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
  const OUTCOME_BADGE_COLORS = [
    { bg: 'bg-yes-500/15', text: 'text-yes-400' },
    { bg: 'bg-no-500/15', text: 'text-no-400' },
    { bg: 'bg-purple-500/15', text: 'text-purple-400' },
    { bg: 'bg-yellow-500/15', text: 'text-yellow-400' },
  ]
  const defaultLabels = ['YES', 'NO', 'OPTION C', 'OPTION D']
  const outcomeLabel = market?.outcomeLabels?.[outcomeIdx - 1]?.toUpperCase() || defaultLabels[outcomeIdx - 1] || bet.outcome.toUpperCase()
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
                  {bet.sharesSold ? formatCredits(bet.sharesSold) : '—'}
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
                    <p className="text-2xs text-yes-400/60 tabular-nums">
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
                        : '—'}
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
