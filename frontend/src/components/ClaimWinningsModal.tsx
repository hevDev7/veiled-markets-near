import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Trophy,
  Shield,
  Copy,
  Check,
  RefreshCcw,
  Terminal,
  AlertTriangle,
  ExternalLink
} from 'lucide-react'
import { useState } from 'react'
import { type Bet, useBetsStore, CONTRACT_INFO } from '@/lib/store'
import { cn, formatCredits, getTokenSymbol } from '@/lib/utils'
import { getRedeemFunction, getRefundFunction } from '@/lib/aleo-client'

interface ClaimWinningsModalProps {
  mode: 'winnings' | 'refund'
  isOpen: boolean
  onClose: () => void
  bets: Bet[]
  onClaimSuccess?: () => void
}

export function ClaimWinningsModal({
  mode,
  isOpen,
  onClose,
  bets,
  onClaimSuccess
}: ClaimWinningsModalProps) {
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null)
  const { markBetClaimed } = useBetsStore()

  const isRefund = mode === 'refund'
  const bet = bets[0] // We now handle one bet at a time

  const handleClose = () => {
    setCopiedCommand(null)
    onClose()
  }

  const handleMarkClaimed = () => {
    if (bet) {
      markBetClaimed(bet.id)
      onClaimSuccess?.()
    }
    handleClose()
  }

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedCommand(id)
      setTimeout(() => setCopiedCommand(null), 2000)
    } catch {
      // Fallback for non-secure contexts
      const textarea = document.createElement('textarea')
      textarea.value = text
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopiedCommand(id)
      setTimeout(() => setCopiedCommand(null), 2000)
    }
  }

  if (!bet) return null

  const tokenType = bet.tokenType || 'ALEO'
  const tokenSymbol = getTokenSymbol(tokenType)
  const refundFn = getRefundFunction(tokenType)
  const redeemFn = getRedeemFunction(tokenType)

  const payoutDisplay = isRefund
    ? formatCredits(bet.amount)
    : formatCredits(bet.payoutAmount || bet.amount)

  // Build CLI commands for v12
  // v12: claim_refund(share: OutcomeShare) — single step for cancelled markets
  const claimRefundCmd = `snarkos developer execute ${CONTRACT_INFO.programId} ${refundFn} \\
  "<YOUR_OUTCOME_SHARE_RECORD>" \\
  --private-key <YOUR_PRIVATE_KEY> \\
  --endpoint https://api.explorer.provable.com \\
  --broadcast --network 1 --priority-fee 500000`

  // v12: redeem_shares(share: OutcomeShare) — single step for winning shares (1:1 redemption)
  const redeemSharesCmd = `snarkos developer execute ${CONTRACT_INFO.programId} ${redeemFn} \\
  "<YOUR_OUTCOME_SHARE_RECORD>" \\
  --private-key <YOUR_PRIVATE_KEY> \\
  --endpoint https://api.explorer.provable.com \\
  --broadcast --network 1 --priority-fee 500000`

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
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-lg z-50 max-h-[85vh] overflow-y-auto"
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
                  <div className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center",
                    isRefund
                      ? "bg-orange-500/20"
                      : "bg-gradient-to-br from-yellow-500/20 to-orange-500/20"
                  )}>
                    {isRefund ? (
                      <RefreshCcw className="w-6 h-6 text-orange-400" />
                    ) : (
                      <Trophy className="w-6 h-6 text-yellow-400" />
                    )}
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-white">
                      {isRefund ? 'Claim Refund' : 'Redeem Winnings'}
                    </h2>
                    <p className="text-sm text-surface-400">
                      {isRefund ? 'Market was cancelled — get your tokens back' : 'Redeem your winning shares for tokens'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="p-6 space-y-6">
                {/* Bet Summary */}
                <div className={cn(
                  "p-4 rounded-xl border",
                  isRefund
                    ? "bg-orange-500/5 border-orange-500/20"
                    : "bg-yes-500/5 border-yes-500/20"
                )}>
                  <p className="text-sm text-surface-400 mb-2 truncate">
                    {bet.marketQuestion || `Market ${bet.marketId}`}
                  </p>
                  <div className="flex items-center justify-between">
                    <div>
                      <span className={cn(
                        "text-xs font-medium px-2 py-0.5 rounded-full",
                        bet.outcome === 'yes'
                          ? "bg-yes-500/20 text-yes-400"
                          : "bg-no-500/20 text-no-400"
                      )}>
                        {bet.outcome.toUpperCase()}
                      </span>
                      <span className="text-sm text-surface-400 ml-2">
                        Shares: {formatCredits(bet.amount)} {tokenSymbol}
                      </span>
                    </div>
                    <div className="text-right">
                      <p className={cn(
                        "text-2xl font-bold",
                        isRefund ? "text-orange-400" : "text-yes-400"
                      )}>
                        {isRefund ? '' : '+'}{payoutDisplay}
                      </p>
                      <p className="text-xs text-surface-500">{tokenSymbol}</p>
                    </div>
                  </div>
                </div>

                {/* CLI Requirement Notice */}
                <div className="flex items-start gap-3 p-4 rounded-xl bg-accent-500/5 border border-accent-500/20">
                  <AlertTriangle className="w-5 h-5 text-accent-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-accent-300">CLI Required</p>
                    <p className="text-xs text-surface-400 mt-1">
                      {isRefund ? 'Claiming refunds' : 'Redeeming shares'} requires your private <strong>OutcomeShare record</strong>, which wallets cannot expose through their API.
                      You need to use the <code className="text-accent-300">snarkos</code> CLI with your private key.
                    </p>
                  </div>
                </div>

                {/* CLI Commands */}
                <div className="space-y-4">
                  {isRefund ? (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Terminal className="w-4 h-4 text-surface-400" />
                        <h4 className="text-sm font-medium text-white">Run {refundFn}</h4>
                      </div>
                      <div className="relative">
                        <pre className="p-4 rounded-xl bg-surface-900 border border-surface-700 text-xs text-surface-300 overflow-x-auto whitespace-pre-wrap break-all font-mono">
                          {claimRefundCmd}
                        </pre>
                        <button
                          onClick={() => copyToClipboard(claimRefundCmd, 'refund')}
                          className="absolute top-2 right-2 p-1.5 rounded-lg bg-surface-800 hover:bg-surface-700 transition-colors"
                          title="Copy command"
                        >
                          {copiedCommand === 'refund' ? (
                            <Check className="w-3.5 h-3.5 text-yes-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5 text-surface-400" />
                          )}
                        </button>
                      </div>
                      <p className="text-xs text-surface-500 mt-2">
                        Replace <code className="text-surface-300">&lt;YOUR_OUTCOME_SHARE_RECORD&gt;</code> with your OutcomeShare record plaintext and <code className="text-surface-300">&lt;YOUR_PRIVATE_KEY&gt;</code> with your Aleo private key.
                      </p>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Terminal className="w-4 h-4 text-surface-400" />
                        <h4 className="text-sm font-medium text-white">Run {redeemFn}</h4>
                      </div>
                      <div className="relative">
                        <pre className="p-4 rounded-xl bg-surface-900 border border-surface-700 text-xs text-surface-300 overflow-x-auto whitespace-pre-wrap break-all font-mono">
                          {redeemSharesCmd}
                        </pre>
                        <button
                          onClick={() => copyToClipboard(redeemSharesCmd, 'redeem')}
                          className="absolute top-2 right-2 p-1.5 rounded-lg bg-surface-800 hover:bg-surface-700 transition-colors"
                          title="Copy command"
                        >
                          {copiedCommand === 'redeem' ? (
                            <Check className="w-3.5 h-3.5 text-yes-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5 text-surface-400" />
                          )}
                        </button>
                      </div>
                      <p className="text-xs text-surface-500 mt-2">
                        Winning shares redeem 1:1 for tokens. Replace <code className="text-surface-300">&lt;YOUR_OUTCOME_SHARE_RECORD&gt;</code> with your OutcomeShare record plaintext.
                      </p>
                    </div>
                  )}
                </div>

                {/* Privacy Notice */}
                <div className="flex items-start gap-3 p-4 rounded-xl bg-brand-500/5 border border-brand-500/20">
                  <Shield className="w-5 h-5 text-brand-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-brand-300">Privacy Preserved</p>
                    <p className="text-xs text-surface-400 mt-1">
                      {isRefund
                        ? 'Your refund will be transferred privately. No one can see your position.'
                        : 'Your winnings are transferred privately via ZK proof. Your payout amount is hidden from observers.'}
                    </p>
                  </div>
                </div>

                {/* Record hint */}
                <div className="text-xs text-surface-500 p-3 rounded-xl bg-surface-800/50">
                  <p className="font-medium text-surface-400 mb-1">Finding your OutcomeShare record:</p>
                  <p>
                    Your OutcomeShare record was created when you bought shares. You can find it by looking up your transaction on the{' '}
                    <a
                      href="https://testnet.explorer.provable.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-400 hover:text-brand-300 inline-flex items-center gap-1"
                    >
                      Aleo Explorer <ExternalLink className="w-3 h-3" />
                    </a>
                    {' '}and decrypting the record output with your view key.
                  </p>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3">
                  <button onClick={handleClose} className="flex-1 btn-secondary">
                    Close
                  </button>
                  <button
                    onClick={handleMarkClaimed}
                    className={cn(
                      "flex-1 py-3 rounded-xl font-medium transition-all flex items-center justify-center gap-2",
                      isRefund
                        ? "bg-orange-500 hover:bg-orange-400 text-white"
                        : "bg-gradient-to-r from-yes-500 to-brand-500 hover:from-yes-400 hover:to-brand-400 text-white"
                    )}
                  >
                    <Check className="w-4 h-4" />
                    Mark as Claimed
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
