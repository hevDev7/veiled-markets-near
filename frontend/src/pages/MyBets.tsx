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
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWalletStore, useBetsStore, type Bet } from '@/lib/store'
import { useRealMarketsStore } from '@/lib/market-store'
import { DashboardHeader } from '@/components/DashboardHeader'
import { Footer } from '@/components/Footer'
import { ClaimWinningsModal } from '@/components/ClaimWinningsModal'
import { cn, formatCredits } from '@/lib/utils'

type BetFilter = 'all' | 'accepted' | 'unredeemed' | 'settled'

const TABS: { key: BetFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'unredeemed', label: 'Unredeemed' },
  { key: 'settled', label: 'Settled' },
]

export function MyBets() {
  const navigate = useNavigate()
  const { wallet } = useWalletStore()
  const { userBets, pendingBets, fetchUserBets, syncBetStatuses, addPendingBet } = useBetsStore()
  const { markets } = useRealMarketsStore()
  const [isLoading, setIsLoading] = useState(true)
  const [filter, setFilter] = useState<BetFilter>('all')
  const [claimModalBet, setClaimModalBet] = useState<Bet | null>(null)
  const [claimModalMode, setClaimModalMode] = useState<'winnings' | 'refund'>('winnings')

  // Import Bet state
  const [showImport, setShowImport] = useState(false)
  const [importTxId, setImportTxId] = useState('')
  const [importMarketId, setImportMarketId] = useState('')
  const [importAmount, setImportAmount] = useState('')
  const [importOutcome, setImportOutcome] = useState<'yes' | 'no'>('yes')
  const [importError, setImportError] = useState('')
  const [importSuccess, setImportSuccess] = useState(false)

  // Categorize bets
  const allBets = [...pendingBets, ...userBets]
  const acceptedBets = [...pendingBets, ...userBets.filter(b => b.status === 'active')]
  const unredeemedBets = userBets.filter(b =>
    (b.status === 'won' || b.status === 'refunded') && !b.claimed
  )
  const settledBets = userBets.filter(b =>
    b.status === 'won' || b.status === 'lost' || b.status === 'refunded'
  )

  // Display bets based on active filter
  const displayBets =
    filter === 'all' ? allBets
    : filter === 'accepted' ? acceptedBets
    : filter === 'unredeemed' ? unredeemedBets
    : settledBets

  // Tab counts
  const tabCounts: Record<BetFilter, number> = {
    all: allBets.length,
    accepted: acceptedBets.length,
    unredeemed: unredeemedBets.length,
    settled: settledBets.length,
  }

  // Redirect to landing if not connected
  useEffect(() => {
    if (!wallet.connected) {
      navigate('/')
    }
  }, [wallet.connected, navigate])

  // Load bets and sync statuses on mount
  useEffect(() => {
    const loadAndSync = async () => {
      setIsLoading(true)

      // Debug: Check localStorage directly
      const addr = wallet.address
      if (addr) {
        const rawPending = localStorage.getItem(`veiled_markets_pending_${addr}`)
        const rawBets = localStorage.getItem(`veiled_markets_bets_${addr}`)
        console.warn('[MyBets] localStorage raw data:', {
          address: addr,
          pendingKey: `veiled_markets_pending_${addr}`,
          pendingData: rawPending ? JSON.parse(rawPending) : null,
          betsKey: `veiled_markets_bets_${addr}`,
          betsData: rawBets ? JSON.parse(rawBets) : null,
        })
      } else {
        console.warn('[MyBets] No wallet address available!')
      }

      await fetchUserBets()
      await syncBetStatuses()

      // Debug: Check store state after load (read directly from store, not stale closure)
      const storeState = useBetsStore.getState()
      console.warn('[MyBets] After load — store state:', {
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
      subtitle: "You haven't placed any bets yet.",
    },
    accepted: {
      title: 'No active bets',
      subtitle: "You don't have any active predictions at the moment.",
    },
    unredeemed: {
      title: 'No unredeemed bets',
      subtitle: "You don't have any winnings to claim right now.",
    },
    settled: {
      title: 'No settled bets',
      subtitle: "You don't have any settled bets at the moment.",
    },
  }

  if (!wallet.connected) {
    return null
  }

  return (
    <div className="min-h-screen bg-surface-950 flex flex-col">
      <DashboardHeader />

      <main className="flex-1 pt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Page Header */}
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-white">My Bets</h1>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowImport(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface-800/50 hover:bg-surface-700/50 transition-colors text-surface-400 hover:text-white text-sm"
                title="Import existing bet"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Import</span>
              </button>
              <button
                onClick={handleRefresh}
                disabled={isLoading}
                className="p-2 rounded-lg bg-surface-800/50 hover:bg-surface-700/50 transition-colors text-surface-400 hover:text-white disabled:opacity-50"
                title="Refresh"
              >
                <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
              </button>
            </div>
          </div>

          {/* Filter Tabs — pill style */}
          <div className="flex gap-2 mb-8">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={cn(
                  'px-4 py-2 rounded-full text-sm font-medium transition-all',
                  filter === tab.key
                    ? 'bg-brand-500 text-white'
                    : 'bg-surface-800/60 text-surface-400 hover:bg-surface-700/60 hover:text-surface-200'
                )}
              >
                {tab.label}
                {tabCounts[tab.key] > 0 && filter !== tab.key && (
                  <span className="ml-1.5 text-xs opacity-60">
                    {tabCounts[tab.key]}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Content */}
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
            </div>
          ) : displayBets.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="glass-card rounded-2xl py-16 text-center"
            >
              <div className="flex justify-center mb-4">
                <Search className="w-12 h-12 text-surface-500" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">
                {emptyConfig[filter].title}
              </h3>
              <p className="text-surface-400 text-sm mb-6">
                {emptyConfig[filter].subtitle}
              </p>
              <button
                onClick={() => navigate('/dashboard')}
                className="btn-primary text-sm px-6 py-2.5"
              >
                Place a Bet
              </button>
            </motion.div>
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-4">
          <div className="text-[10px] text-surface-600 font-mono bg-surface-900/50 rounded-lg p-2">
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
                  className="p-1.5 rounded-lg hover:bg-surface-800/50 transition-colors text-surface-400"
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
                    className="w-full px-3 py-2.5 rounded-lg bg-surface-800/50 border border-surface-700/50 text-white text-sm placeholder:text-surface-600 focus:outline-none focus:border-brand-500/50"
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
                    className="w-full px-3 py-2.5 rounded-lg bg-surface-800/50 border border-surface-700/50 text-white text-sm focus:outline-none focus:border-brand-500/50 appearance-none"
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
                    className="w-full px-3 py-2.5 rounded-lg bg-surface-800/50 border border-surface-700/50 text-white text-sm placeholder:text-surface-600 focus:outline-none focus:border-brand-500/50"
                  />
                </div>

                {/* Outcome */}
                <div>
                  <label className="block text-xs font-medium text-surface-400 mb-1.5">
                    Prediction
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setImportOutcome('yes')}
                      className={cn(
                        'flex-1 py-2.5 rounded-lg text-sm font-medium transition-all',
                        importOutcome === 'yes'
                          ? 'bg-yes-500 text-white'
                          : 'bg-surface-800/50 text-surface-400 hover:bg-surface-700/50'
                      )}
                    >
                      YES
                    </button>
                    <button
                      onClick={() => setImportOutcome('no')}
                      className={cn(
                        'flex-1 py-2.5 rounded-lg text-sm font-medium transition-all',
                        importOutcome === 'no'
                          ? 'bg-no-500 text-white'
                          : 'bg-surface-800/50 text-surface-400 hover:bg-surface-700/50'
                      )}
                    >
                      NO
                    </button>
                  </div>
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
  showClaimAction,
}: {
  bet: Bet
  market?: { question: string }
  index: number
  onClaim: (mode: 'winnings' | 'refund') => void
  showClaimAction: boolean
}) {
  const isSell = bet.type === 'sell'
  const isYes = bet.outcome === 'yes'
  const isPending = bet.status === 'pending'
  const isWon = bet.status === 'won'
  const isLost = bet.status === 'lost'
  const isRefunded = bet.status === 'refunded'
  const isActive = bet.status === 'active'

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
          isYes ? "bg-yes-500/10" : "bg-no-500/10"
        )}>
          {isSell ? (
            <ArrowDownToLine className="w-5 h-5 text-purple-400" />
          ) : isWon ? (
            <Trophy className="w-5 h-5 text-yes-400" />
          ) : isLost ? (
            <XCircle className="w-5 h-5 text-no-400" />
          ) : isRefunded ? (
            <RefreshCcw className="w-5 h-5 text-orange-400" />
          ) : isYes ? (
            <TrendingUp className="w-5 h-5 text-yes-400" />
          ) : (
            <TrendingDown className="w-5 h-5 text-no-400" />
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
                isYes ? "bg-yes-500/15 text-yes-400" : "bg-no-500/15 text-no-400"
              )}>
                {isYes ? 'YES' : 'NO'}
              </span>
            )}
            {isPending && (
              <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-accent-500/15 text-accent-400 flex items-center gap-1">
                <Loader2 className="w-2.5 h-2.5 animate-spin" />
                Pending
              </span>
            )}
            {isWon && (
              <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-yes-500/15 text-yes-400">Won</span>
            )}
            {isLost && (
              <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-no-500/15 text-no-400">Lost</span>
            )}
            {isRefunded && (
              <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-orange-500/15 text-orange-400">Refund</span>
            )}
            {bet.claimed && (
              <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-surface-700 text-surface-400">Claimed</span>
            )}
          </div>
          <h3 className="text-sm font-medium text-white truncate">
            {market?.question || bet.marketQuestion || `Market ${bet.marketId.slice(0, 12)}...`}
          </h3>
          <p className="text-xs text-surface-500 mt-0.5">
            {new Date(bet.placedAt).toLocaleDateString()}
          </p>
        </div>

        {/* Amount + Result */}
        <div className="flex items-center gap-3 sm:gap-4">
          {isSell ? (
            <>
              <div className="text-right">
                <p className="text-xs text-surface-500">Shares Sold</p>
                <p className="text-sm font-bold text-purple-400">
                  {bet.sharesSold ? formatCredits(bet.sharesSold) : '—'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-surface-500">Received</p>
                <p className="text-sm font-bold text-yes-400">
                  +{formatCredits(bet.tokensReceived || bet.amount)}
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="text-right">
                <p className="text-xs text-surface-500">Stake</p>
                <p className="text-sm font-bold text-white">{formatCredits(bet.amount)}</p>
              </div>

              {(isWon || isLost || isRefunded) && (
                <div className="text-right">
                  <p className="text-xs text-surface-500">
                    {isWon ? 'Payout' : isRefunded ? 'Refund' : 'P&L'}
                  </p>
                  <p className={cn(
                    "text-sm font-bold",
                    isWon && "text-yes-400",
                    isLost && "text-no-400",
                    isRefunded && "text-orange-400"
                  )}>
                    {isWon
                      ? `+${formatCredits(bet.payoutAmount || bet.amount)}`
                      : isRefunded
                        ? formatCredits(bet.amount)
                        : `-${formatCredits(bet.amount)}`}
                  </p>
                </div>
              )}

              {isActive && (
                <div className="text-right">
                  <p className="text-xs text-surface-500">Shares</p>
                  <p className={cn(
                    "text-sm font-bold",
                    isYes ? "text-yes-400" : "text-no-400"
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
              className="p-1.5 rounded-lg hover:bg-surface-800/50 transition-colors"
              title="View on Explorer"
            >
              <ExternalLink className="w-3.5 h-3.5 text-surface-500" />
            </a>
          ) : (
            <div
              className="p-1.5 cursor-help"
              title="Transaction pending"
            >
              <Clock className="w-3.5 h-3.5 text-surface-600" />
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}
