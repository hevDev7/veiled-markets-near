import { motion } from 'framer-motion'
import {
  TrendingUp,
  TrendingDown,
  Clock,
  Loader2,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  Trophy,
  Sparkles
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWalletStore, useBetsStore, useMarketsStore, type Bet } from '@/lib/store'
import { DashboardHeader } from '@/components/DashboardHeader'
import { Footer } from '@/components/Footer'
import { ClaimWinningsModal } from '@/components/ClaimWinningsModal'
import { cn, formatCredits } from '@/lib/utils'

interface WinningBet extends Bet {
  winAmount: bigint
}

export function MyBets() {
  const navigate = useNavigate()
  const { wallet } = useWalletStore()
  const { userBets, pendingBets, fetchUserBets } = useBetsStore()
  const { markets } = useMarketsStore()
  const [isLoading, setIsLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'active' | 'pending' | 'won'>('all')
  const [isClaimModalOpen, setIsClaimModalOpen] = useState(false)

  // Mock winning bets for demo
  const [winningBets] = useState<WinningBet[]>([
    {
      id: 'winning_bet_1',
      marketId: 'market_resolved_1',
      amount: 50000000n, // 50 ALEO
      outcome: 'yes',
      placedAt: Date.now() - 7 * 24 * 60 * 60 * 1000,
      status: 'won',
      marketQuestion: 'Did Ethereum reach $4,000 in December 2025?',
      winAmount: 82500000n, // 82.5 ALEO
    },
    {
      id: 'winning_bet_2',
      marketId: 'market_resolved_2',
      amount: 25000000n, // 25 ALEO
      outcome: 'no',
      placedAt: Date.now() - 14 * 24 * 60 * 60 * 1000,
      status: 'won',
      marketQuestion: 'Did the Fed raise rates in January 2026?',
      winAmount: 43750000n, // 43.75 ALEO
    },
  ])

  // Redirect to landing if not connected
  useEffect(() => {
    if (!wallet.connected) {
      navigate('/')
    }
  }, [wallet.connected, navigate])

  useEffect(() => {
    const loadBets = async () => {
      setIsLoading(true)
      await fetchUserBets()
      setIsLoading(false)
    }
    loadBets()
  }, [fetchUserBets])

  // Get active bets only (not completed)
  const activeBets = userBets.filter(bet => bet.status === 'active')

  // Get won bets
  const wonBets = userBets.filter(bet => bet.status === 'won')

  // Combine for display based on filter
  const displayBets = filter === 'pending'
    ? pendingBets
    : filter === 'active'
      ? activeBets
      : filter === 'won'
        ? wonBets
        : [...pendingBets, ...activeBets]

  // Total unclaimed winnings
  const totalUnclaimedWinnings = winningBets.reduce((sum, b) => sum + b.winAmount, 0n)

  // Get market info for a bet
  const getMarketInfo = (marketId: string) => {
    return markets.find(m => m.id === marketId)
  }

  // Calculate total value
  const totalValue = displayBets.reduce((sum, bet) => sum + bet.amount, 0n)

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
              <h1 className="text-3xl font-display font-bold text-white">My Bets</h1>
              <p className="text-surface-400 mt-1">
                Track your active and pending positions
              </p>
            </div>

            <button
              onClick={() => {
                setIsLoading(true)
                fetchUserBets().finally(() => setIsLoading(false))
              }}
              className="btn-secondary flex items-center gap-2 self-start"
            >
              <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
              <span>Refresh</span>
            </button>
          </motion.div>

          {/* Unclaimed Winnings Banner */}
          {winningBets.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="mb-6"
            >
              <div className="glass-card p-6 bg-gradient-to-r from-yellow-500/10 via-brand-500/10 to-yes-500/10 border-yellow-500/20">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-yellow-500/20 to-orange-500/20 flex items-center justify-center">
                      <Trophy className="w-7 h-7 text-yellow-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-yellow-400" />
                        <h3 className="text-lg font-bold text-white">Unclaimed Winnings!</h3>
                      </div>
                      <p className="text-surface-300">
                        You have {winningBets.length} winning {winningBets.length === 1 ? 'bet' : 'bets'} to claim
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm text-surface-400">Total Winnings</p>
                      <p className="text-2xl font-bold text-yes-400">
                        {formatCredits(totalUnclaimedWinnings)} ALEO
                      </p>
                    </div>
                    <button
                      onClick={() => setIsClaimModalOpen(true)}
                      className="btn-primary bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 px-6"
                    >
                      Claim All
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Stats Cards */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8"
          >
            <div className="glass-card p-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-brand-500/10 flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-brand-400" />
                </div>
                <div>
                  <p className="text-sm text-surface-400">Active Bets</p>
                  <p className="text-2xl font-bold text-white">{activeBets.length}</p>
                </div>
              </div>
            </div>

            <div className="glass-card p-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-accent-500/10 flex items-center justify-center">
                  <Clock className="w-6 h-6 text-accent-400" />
                </div>
                <div>
                  <p className="text-sm text-surface-400">Pending</p>
                  <p className="text-2xl font-bold text-white">{pendingBets.length}</p>
                </div>
              </div>
            </div>

            <div className="glass-card p-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-yellow-500/10 flex items-center justify-center">
                  <Trophy className="w-6 h-6 text-yellow-400" />
                </div>
                <div>
                  <p className="text-sm text-surface-400">Won</p>
                  <p className="text-2xl font-bold text-white">{winningBets.length}</p>
                </div>
              </div>
            </div>

            <div className="glass-card p-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-yes-500/10 flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-yes-400" />
                </div>
                <div>
                  <p className="text-sm text-surface-400">Total Value</p>
                  <p className="text-2xl font-bold text-white">{formatCredits(totalValue)} ALEO</p>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Filter Tabs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="flex gap-2 mb-6"
          >
            {(['all', 'active', 'pending', 'won'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                className={cn(
                  'px-4 py-2 rounded-xl text-sm font-medium transition-all',
                  filter === tab
                    ? 'bg-brand-500 text-white'
                    : 'bg-surface-800/50 text-surface-400 hover:text-white'
                )}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
                {tab === 'pending' && pendingBets.length > 0 && (
                  <span className="ml-2 px-1.5 py-0.5 text-xs rounded-full bg-accent-500/20 text-accent-400">
                    {pendingBets.length}
                  </span>
                )}
                {tab === 'won' && winningBets.length > 0 && (
                  <span className="ml-2 px-1.5 py-0.5 text-xs rounded-full bg-yellow-500/20 text-yellow-400">
                    {winningBets.length}
                  </span>
                )}
              </button>
            ))}
          </motion.div>

          {/* Bets List */}
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
                <AlertCircle className="w-8 h-8 text-surface-500" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">No bets found</h3>
              <p className="text-surface-400 mb-6">
                {filter === 'pending'
                  ? "You don't have any pending bets"
                  : filter === 'active'
                    ? "You don't have any active bets"
                    : "Start placing bets on prediction markets"}
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
                <BetCard
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

      {/* Claim Winnings Modal */}
      <ClaimWinningsModal
        isOpen={isClaimModalOpen}
        onClose={() => setIsClaimModalOpen(false)}
        winningBets={winningBets}
        onClaimSuccess={() => {
          // Refresh bets after claiming
          fetchUserBets()
        }}
      />
    </div>
  )
}

function BetCard({
  bet,
  market,
  index
}: {
  bet: Bet
  market?: { question: string; yesPercentage: number; noPercentage: number }
  index: number
}) {
  const isYes = bet.outcome === 'yes'
  const isPending = bet.status === 'pending'

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className={cn(
        "glass-card p-6 transition-all duration-200 hover:border-surface-600/50",
        isPending && "border-accent-500/30 bg-accent-500/5"
      )}
    >
      <div className="flex flex-col lg:flex-row lg:items-center gap-4">
        {/* Outcome Badge */}
        <div className={cn(
          "w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0",
          isYes ? "bg-yes-500/10" : "bg-no-500/10"
        )}>
          {isYes ? (
            <TrendingUp className="w-6 h-6 text-yes-400" />
          ) : (
            <TrendingDown className="w-6 h-6 text-no-400" />
          )}
        </div>

        {/* Market Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={cn(
              "px-2 py-0.5 text-xs font-medium rounded-full",
              isYes
                ? "bg-yes-500/20 text-yes-400"
                : "bg-no-500/20 text-no-400"
            )}>
              {isYes ? 'YES' : 'NO'}
            </span>
            {isPending && (
              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-accent-500/20 text-accent-400 flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                Pending
              </span>
            )}
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
            <p className="text-sm text-surface-400">Amount</p>
            <p className="text-lg font-bold text-white">
              {formatCredits(bet.amount)} ALEO
            </p>
          </div>

          {market && (
            <div className="text-right">
              <p className="text-sm text-surface-400">Current Odds</p>
              <p className={cn(
                "text-lg font-bold",
                isYes ? "text-yes-400" : "text-no-400"
              )}>
                {isYes ? market.yesPercentage : market.noPercentage}%
              </p>
            </div>
          )}

          <a
            href={`https://testnet.explorer.provable.com/transaction/${bet.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-lg bg-surface-800/50 hover:bg-surface-700/50 transition-colors"
          >
            <ExternalLink className="w-4 h-4 text-surface-400" />
          </a>
        </div>
      </div>
    </motion.div>
  )
}
