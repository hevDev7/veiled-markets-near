import { motion } from 'framer-motion'
import {
  Trophy,
  XCircle,
  RefreshCcw,
  Clock,
  Loader2,
  ExternalLink,
  RefreshCw,
  TrendingUp,
  Filter
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWalletStore, useBetsStore, type Bet } from '@/lib/store'
import { useRealMarketsStore } from '@/lib/market-store'
import { DashboardHeader } from '@/components/DashboardHeader'
import { Footer } from '@/components/Footer'
import { cn, formatCredits } from '@/lib/utils'

type HistoryFilter = 'all' | 'won' | 'lost' | 'refunded'

export function History() {
  const navigate = useNavigate()
  const { wallet } = useWalletStore()
  const { userBets, fetchUserBets, syncBetStatuses } = useBetsStore()
  const { markets } = useRealMarketsStore()
  const [isLoading, setIsLoading] = useState(true)
  const [filter, setFilter] = useState<HistoryFilter>('all')

  // Redirect handled by ProtectedRoute wrapper in App.tsx

  useEffect(() => {
    const loadBets = async () => {
      setIsLoading(true)
      await fetchUserBets()
      await syncBetStatuses()
      setIsLoading(false)
    }
    loadBets()
  }, [fetchUserBets, syncBetStatuses])

  // Get completed bets only
  const completedBets = userBets.filter(bet =>
    bet.status === 'won' || bet.status === 'lost' || bet.status === 'refunded'
  )

  // Filter based on selection
  const displayBets = filter === 'all'
    ? completedBets
    : completedBets.filter(bet => bet.status === filter)

  // Get market info for a bet
  const getMarketInfo = (marketId: string) => {
    return markets.find(m => m.id === marketId)
  }

  // Calculate stats
  const wonBets = completedBets.filter(b => b.status === 'won')
  const lostBets = completedBets.filter(b => b.status === 'lost')
  const refundedBets = completedBets.filter(b => b.status === 'refunded')

  const totalWon = wonBets.reduce((sum, bet) => sum + (bet.sharesReceived || bet.amount), 0n)
  const totalLost = lostBets.reduce((sum, bet) => sum + bet.amount, 0n)
  const netPnL = totalWon - totalLost

  if (!wallet.connected) {
    return null
  }

  return (
    <div className="min-h-screen bg-surface-950 flex flex-col">
      <DashboardHeader />

      <main className="flex-1 pt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Page Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8"
          >
            <div>
              <h1 className="text-3xl font-display font-bold text-white">Betting History</h1>
              <p className="text-surface-400 mt-1">
                View your completed bets and performance
              </p>
            </div>

            <button
              onClick={async () => {
                setIsLoading(true)
                await fetchUserBets()
                await syncBetStatuses()
                setIsLoading(false)
              }}
              className="btn-secondary flex items-center gap-2 self-start"
            >
              <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
              <span>Refresh</span>
            </button>
          </motion.div>

          {/* Stats Cards */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8"
          >
            <div className="glass-card p-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-yes-500/10 flex items-center justify-center">
                  <Trophy className="w-6 h-6 text-yes-400" />
                </div>
                <div>
                  <p className="text-sm text-surface-400">Won</p>
                  <p className="text-2xl font-bold text-yes-400">
                    {wonBets.length}
                  </p>
                </div>
              </div>
            </div>

            <div className="glass-card p-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-no-500/10 flex items-center justify-center">
                  <XCircle className="w-6 h-6 text-no-400" />
                </div>
                <div>
                  <p className="text-sm text-surface-400">Lost</p>
                  <p className="text-2xl font-bold text-no-400">
                    {lostBets.length}
                  </p>
                </div>
              </div>
            </div>

            <div className="glass-card p-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-accent-500/10 flex items-center justify-center">
                  <RefreshCcw className="w-6 h-6 text-accent-400" />
                </div>
                <div>
                  <p className="text-sm text-surface-400">Refunded</p>
                  <p className="text-2xl font-bold text-accent-400">
                    {refundedBets.length}
                  </p>
                </div>
              </div>
            </div>

            <div className="glass-card p-6">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-12 h-12 rounded-xl flex items-center justify-center",
                  netPnL >= 0n ? "bg-yes-500/10" : "bg-no-500/10"
                )}>
                  <TrendingUp className={cn(
                    "w-6 h-6",
                    netPnL >= 0n ? "text-yes-400" : "text-no-400"
                  )} />
                </div>
                <div>
                  <p className="text-sm text-surface-400">Net P&L</p>
                  <p className={cn(
                    "text-2xl font-bold",
                    netPnL >= 0n ? "text-yes-400" : "text-no-400"
                  )}>
                    {completedBets.length === 0
                      ? '0.00'
                      : (netPnL >= 0n ? '+' : '-') + formatCredits(netPnL < 0n ? -netPnL : netPnL)
                    } ALEO
                  </p>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Filter Tabs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="flex items-center gap-4 mb-6"
          >
            <Filter className="w-4 h-4 text-surface-500" />
            <div className="flex gap-2">
              {(['all', 'won', 'lost', 'refunded'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setFilter(tab)}
                  className={cn(
                    'px-4 py-2 rounded-xl text-sm font-medium transition-all',
                    filter === tab
                      ? tab === 'won'
                        ? 'bg-yes-500 text-white'
                        : tab === 'lost'
                          ? 'bg-no-500 text-white'
                          : tab === 'refunded'
                            ? 'bg-accent-500 text-white'
                            : 'bg-brand-500 text-white'
                      : 'bg-surface-800/50 text-surface-400 hover:text-white'
                  )}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
          </motion.div>

          {/* History List */}
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
            </div>
          ) : displayBets.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-20"
            >
              <div className="w-16 h-16 rounded-full bg-surface-800 flex items-center justify-center mx-auto mb-4">
                <Clock className="w-8 h-8 text-surface-500" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">No history yet</h3>
              <p className="text-surface-400 mb-6">
                Your completed bets will appear here after markets resolve
              </p>
              <button
                onClick={() => navigate('/dashboard')}
                className="btn-primary"
              >
                Browse Markets
              </button>
            </motion.div>
          ) : (
            <div className="space-y-4">
              {displayBets.map((bet, index) => (
                <HistoryCard
                  key={bet.id}
                  bet={bet}
                  market={getMarketInfo(bet.marketId)}
                  index={index}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  )
}

function HistoryCard({
  bet,
  market,
  index
}: {
  bet: Bet
  market?: { question: string }
  index: number
}) {
  const isYes = bet.outcome === 'yes'
  const isWon = bet.status === 'won'
  const isLost = bet.status === 'lost'
  const isRefunded = bet.status === 'refunded'

  const StatusIcon = isWon ? Trophy : isLost ? XCircle : RefreshCcw
  const statusColor = isWon ? 'yes' : isLost ? 'no' : 'accent'

  // FPMM: winning shares redeem 1:1, so payout = shares received
  const payout = isWon
    ? (bet.sharesReceived || bet.amount)
    : isRefunded
      ? bet.amount
      : 0n

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className={cn(
        "glass-card p-6 transition-all duration-200",
        isWon && "border-yes-500/20",
        isLost && "border-no-500/20",
        isRefunded && "border-accent-500/20"
      )}
    >
      <div className="flex flex-col lg:flex-row lg:items-center gap-4">
        {/* Status Badge */}
        <div className={cn(
          "w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0",
          `bg-${statusColor}-500/10`
        )}>
          <StatusIcon className={cn("w-6 h-6", `text-${statusColor}-400`)} />
        </div>

        {/* Market Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={cn(
              "px-2 py-0.5 text-xs font-medium rounded-full",
              isWon && "bg-yes-500/20 text-yes-400",
              isLost && "bg-no-500/20 text-no-400",
              isRefunded && "bg-accent-500/20 text-accent-400"
            )}>
              {bet.status.toUpperCase()}
            </span>
            <span className={cn(
              "px-2 py-0.5 text-xs font-medium rounded-full",
              isYes
                ? "bg-yes-500/10 text-yes-300"
                : "bg-no-500/10 text-no-300"
            )}>
              {isYes ? 'YES' : 'NO'}
            </span>
          </div>
          <h3 className="font-medium text-white truncate">
            {market?.question || bet.marketQuestion || `Market ${bet.marketId}`}
          </h3>
          <p className="text-sm text-surface-400 mt-1">
            Placed {new Date(bet.placedAt).toLocaleDateString()}
          </p>
        </div>

        {/* Bet Details */}
        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-sm text-surface-400">Bet Amount</p>
            <p className="text-lg font-bold text-white">
              {formatCredits(bet.amount)} ALEO
            </p>
          </div>

          <div className="text-right">
            <p className="text-sm text-surface-400">
              {isWon ? 'Payout' : isRefunded ? 'Refunded' : 'Result'}
            </p>
            <p className={cn(
              "text-lg font-bold",
              isWon && "text-yes-400",
              isLost && "text-no-400",
              isRefunded && "text-accent-400"
            )}>
              {isWon ? `+${formatCredits(payout)}` : isLost ? `-${formatCredits(bet.amount)}` : formatCredits(payout)} ALEO
            </p>
          </div>

          {bet.id.startsWith('at1') && (
            <a
              href={`https://testnet.explorer.provable.com/transaction/${bet.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg bg-surface-800/50 hover:bg-surface-700/50 transition-colors"
            >
              <ExternalLink className="w-4 h-4 text-surface-400" />
            </a>
          )}
        </div>
      </div>
    </motion.div>
  )
}
