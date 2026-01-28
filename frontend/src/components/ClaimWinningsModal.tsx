import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Trophy,
  Shield,
  Check,
  Loader2,
  AlertCircle,
  Wallet,
  Sparkles,
  ExternalLink
} from 'lucide-react'
import { useState } from 'react'
import { type Bet, type Market } from '@/lib/store'
import { cn, formatCredits } from '@/lib/utils'

interface WinningBet extends Bet {
  market?: Market
  winAmount: bigint
}

interface ClaimWinningsModalProps {
  isOpen: boolean
  onClose: () => void
  winningBets: WinningBet[]
  onClaimSuccess?: () => void
}

type ClaimStep = 'select' | 'claiming' | 'success' | 'error'

export function ClaimWinningsModal({
  isOpen,
  onClose,
  winningBets,
  onClaimSuccess
}: ClaimWinningsModalProps) {
  const [step, setStep] = useState<ClaimStep>('select')
  const [selectedBets, setSelectedBets] = useState<Set<string>>(new Set())
  const [claimedBets, setClaimedBets] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [txIds, setTxIds] = useState<string[]>([])

  const toggleBet = (betId: string) => {
    const newSelected = new Set(selectedBets)
    if (newSelected.has(betId)) {
      newSelected.delete(betId)
    } else {
      newSelected.add(betId)
    }
    setSelectedBets(newSelected)
  }

  const selectAll = () => {
    if (selectedBets.size === winningBets.length) {
      setSelectedBets(new Set())
    } else {
      setSelectedBets(new Set(winningBets.map(b => b.id)))
    }
  }

  const totalWinnings = winningBets
    .filter(b => selectedBets.has(b.id))
    .reduce((sum, b) => sum + b.winAmount, 0n)

  const handleClose = () => {
    setStep('select')
    setSelectedBets(new Set())
    setError(null)
    setTxIds([])
    onClose()
  }

  const handleClaim = async () => {
    if (selectedBets.size === 0) return

    setStep('claiming')
    setError(null)

    try {
      // Simulate claiming (in production, this would call the SDK for each bet)
      await new Promise(resolve => setTimeout(resolve, 2500))

      // Generate mock transaction IDs
      const newTxIds = Array.from(selectedBets).map(
        () => `tx_${Date.now()}_${Math.random().toString(36).substring(7)}`
      )

      setTxIds(newTxIds)
      setClaimedBets(Array.from(selectedBets))
      setStep('success')
      onClaimSuccess?.()
    } catch (err: unknown) {
      console.error('Failed to claim winnings:', err)
      setError(err instanceof Error ? err.message : 'Failed to claim winnings')
      setStep('error')
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-x-4 top-[10%] md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-lg z-50 max-h-[80vh] overflow-y-auto"
          >
            <div className="glass-card overflow-hidden">
              {/* Header */}
              <div className="relative p-6 border-b border-surface-800">
                <button
                  onClick={handleClose}
                  className="absolute right-4 top-4 p-2 rounded-lg hover:bg-surface-800 transition-colors"
                >
                  <X className="w-5 h-5 text-surface-400" />
                </button>

                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-yellow-500/20 to-orange-500/20 flex items-center justify-center">
                    <Trophy className="w-6 h-6 text-yellow-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-white">Claim Winnings</h2>
                    <p className="text-sm text-surface-400">
                      {winningBets.length} winning {winningBets.length === 1 ? 'bet' : 'bets'} available
                    </p>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="p-6">
                <AnimatePresence mode="wait">
                  {/* Select Bets */}
                  {step === 'select' && (
                    <motion.div
                      key="select"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      {winningBets.length === 0 ? (
                        <div className="text-center py-8">
                          <div className="w-16 h-16 rounded-full bg-surface-800 flex items-center justify-center mx-auto mb-4">
                            <Trophy className="w-8 h-8 text-surface-500" />
                          </div>
                          <h3 className="text-lg font-semibold text-white mb-2">No Winnings to Claim</h3>
                          <p className="text-surface-400 text-sm">
                            Your winning bets will appear here after markets are resolved.
                          </p>
                        </div>
                      ) : (
                        <>
                          {/* Select All */}
                          <div className="flex items-center justify-between mb-4">
                            <button
                              onClick={selectAll}
                              className="text-sm text-brand-400 hover:text-brand-300"
                            >
                              {selectedBets.size === winningBets.length ? 'Deselect All' : 'Select All'}
                            </button>
                            <span className="text-sm text-surface-400">
                              {selectedBets.size} selected
                            </span>
                          </div>

                          {/* Winning Bets List */}
                          <div className="space-y-3 max-h-64 overflow-y-auto mb-6">
                            {winningBets.map((bet) => (
                              <button
                                key={bet.id}
                                onClick={() => toggleBet(bet.id)}
                                className={cn(
                                  "w-full p-4 rounded-xl border-2 transition-all text-left",
                                  selectedBets.has(bet.id)
                                    ? "border-yes-500 bg-yes-500/10"
                                    : "border-surface-700 hover:border-surface-600"
                                )}
                              >
                                <div className="flex items-start justify-between">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm text-white font-medium truncate pr-4">
                                      {bet.marketQuestion || `Market ${bet.marketId.slice(0, 12)}...`}
                                    </p>
                                    <div className="flex items-center gap-2 mt-1">
                                      <span className={cn(
                                        "text-xs font-medium px-2 py-0.5 rounded-full",
                                        bet.outcome === 'yes'
                                          ? "bg-yes-500/20 text-yes-400"
                                          : "bg-no-500/20 text-no-400"
                                      )}>
                                        {bet.outcome.toUpperCase()}
                                      </span>
                                      <span className="text-xs text-surface-400">
                                        Bet: {formatCredits(bet.amount)} ALEO
                                      </span>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-lg font-bold text-yes-400">
                                      +{formatCredits(bet.winAmount)}
                                    </p>
                                    <p className="text-xs text-surface-500">ALEO</p>
                                  </div>
                                </div>

                                {/* Checkbox indicator */}
                                <div className={cn(
                                  "absolute top-3 right-3 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all",
                                  selectedBets.has(bet.id)
                                    ? "border-yes-500 bg-yes-500"
                                    : "border-surface-600"
                                )}>
                                  {selectedBets.has(bet.id) && (
                                    <Check className="w-3 h-3 text-white" />
                                  )}
                                </div>
                              </button>
                            ))}
                          </div>

                          {/* Total Winnings */}
                          {selectedBets.size > 0 && (
                            <div className="p-4 rounded-xl bg-gradient-to-r from-yes-500/10 to-brand-500/10 border border-yes-500/20 mb-6">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Sparkles className="w-5 h-5 text-yellow-400" />
                                  <span className="text-surface-300">Total Winnings</span>
                                </div>
                                <div className="text-right">
                                  <p className="text-2xl font-bold text-white">
                                    {formatCredits(totalWinnings)} ALEO
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Privacy Notice */}
                          <div className="flex items-start gap-3 p-4 rounded-xl bg-brand-500/5 border border-brand-500/20 mb-6">
                            <Shield className="w-5 h-5 text-brand-400 mt-0.5 flex-shrink-0" />
                            <div>
                              <p className="text-sm font-medium text-brand-300">Private Claim</p>
                              <p className="text-xs text-surface-400 mt-1">
                                Your winnings will be transferred privately. Only you will know how much you won.
                              </p>
                            </div>
                          </div>

                          {/* Claim Button */}
                          <button
                            onClick={handleClaim}
                            disabled={selectedBets.size === 0}
                            className={cn(
                              "w-full py-4 rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-2",
                              selectedBets.size > 0
                                ? "bg-gradient-to-r from-yes-500 to-brand-500 hover:from-yes-400 hover:to-brand-400 text-white"
                                : "bg-surface-800 text-surface-500 cursor-not-allowed"
                            )}
                          >
                            <Wallet className="w-5 h-5" />
                            Claim {formatCredits(totalWinnings)} ALEO
                          </button>
                        </>
                      )}
                    </motion.div>
                  )}

                  {/* Claiming State */}
                  {step === 'claiming' && (
                    <motion.div
                      key="claiming"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-center py-12"
                    >
                      <Loader2 className="w-12 h-12 text-brand-500 animate-spin mx-auto mb-4" />
                      <h3 className="text-xl font-bold text-white mb-2">Processing Claims...</h3>
                      <p className="text-surface-400">
                        Please confirm the transactions in your wallet.
                      </p>
                      <div className="mt-6 flex items-center justify-center gap-2 text-sm text-surface-500">
                        <Shield className="w-4 h-4" />
                        <span>Generating ZK proofs for private transfer</span>
                      </div>
                    </motion.div>
                  )}

                  {/* Success State */}
                  {step === 'success' && (
                    <motion.div
                      key="success"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="text-center py-8"
                    >
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', delay: 0.2 }}
                        className="w-20 h-20 rounded-full bg-gradient-to-br from-yellow-500/20 to-yes-500/20 mx-auto mb-6 flex items-center justify-center"
                      >
                        <motion.div
                          initial={{ rotate: -20 }}
                          animate={{ rotate: 0 }}
                          transition={{ type: 'spring', delay: 0.3 }}
                        >
                          <Trophy className="w-10 h-10 text-yellow-400" />
                        </motion.div>
                      </motion.div>

                      <h3 className="text-2xl font-bold text-white mb-2">
                        Winnings Claimed!
                      </h3>
                      <p className="text-surface-400 mb-6">
                        {formatCredits(totalWinnings)} ALEO has been added to your wallet.
                      </p>

                      {/* Claimed Bets Summary */}
                      <div className="p-4 rounded-xl bg-surface-800/50 mb-6 text-left">
                        <p className="text-xs text-surface-500 uppercase tracking-wide mb-2">
                          Claimed {claimedBets.length} winning {claimedBets.length === 1 ? 'bet' : 'bets'}
                        </p>
                        <div className="flex items-center justify-between">
                          <span className="text-surface-400">Total Amount</span>
                          <span className="text-xl font-bold text-yes-400">
                            +{formatCredits(totalWinnings)} ALEO
                          </span>
                        </div>
                      </div>

                      {/* Transaction Links */}
                      {txIds.length > 0 && (
                        <div className="space-y-2 mb-6">
                          {txIds.slice(0, 3).map((txId, i) => (
                            <a
                              key={txId}
                              href={`https://testnet.explorer.provable.com/transaction/${txId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center justify-center gap-2 text-sm text-brand-400 hover:text-brand-300"
                            >
                              <span>Transaction {i + 1}</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          ))}
                          {txIds.length > 3 && (
                            <p className="text-xs text-surface-500">
                              +{txIds.length - 3} more transactions
                            </p>
                          )}
                        </div>
                      )}

                      <div className="flex items-center justify-center gap-2 text-sm text-brand-400 mb-6">
                        <Shield className="w-4 h-4" />
                        <span>Private Transfer Complete</span>
                      </div>

                      <button onClick={handleClose} className="btn-primary w-full">
                        Done
                      </button>
                    </motion.div>
                  )}

                  {/* Error State */}
                  {step === 'error' && (
                    <motion.div
                      key="error"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-center py-8"
                    >
                      <div className="w-16 h-16 rounded-full bg-no-500/10 flex items-center justify-center mx-auto mb-4">
                        <AlertCircle className="w-8 h-8 text-no-400" />
                      </div>
                      <h3 className="text-xl font-bold text-white mb-2">Claim Failed</h3>
                      <p className="text-surface-400 mb-6">{error}</p>
                      <div className="flex gap-3">
                        <button onClick={() => setStep('select')} className="flex-1 btn-secondary">
                          Go Back
                        </button>
                        <button onClick={handleClaim} className="flex-1 btn-primary">
                          Try Again
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
