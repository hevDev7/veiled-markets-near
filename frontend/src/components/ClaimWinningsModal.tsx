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
  ExternalLink,
  Loader2,
  Wallet,
} from 'lucide-react'
import { useState } from 'react'
import { type Bet, useBetsStore, useWalletStore, CONTRACT_INFO } from '@/lib/store'
import { useAleoTransaction } from '@/hooks/useAleoTransaction'
import { cn, formatCredits, getTokenSymbol } from '@/lib/utils'
import { getRedeemFunction, getRefundFunction } from '@/lib/aleo-client'
import { TransactionLink } from './TransactionLink'

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
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [txId, setTxId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showCli, setShowCli] = useState(false)
  const { markBetClaimed } = useBetsStore()
  const { wallet } = useWalletStore()
  const { executeTransaction } = useAleoTransaction()

  const isRefund = mode === 'refund'
  const bet = bets[0] // We handle one bet at a time

  const handleClose = () => {
    setCopiedCommand(null)
    setError(null)
    setTxId(null)
    setShowCli(false)
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

  // Execute claim/redeem via wallet
  const handleWalletClaim = async () => {
    if (!bet || !wallet.connected) return
    setIsSubmitting(true)
    setError(null)
    try {
      const tokenType = bet.tokenType || 'ALEO'
      const functionName = isRefund
        ? getRefundFunction(tokenType)
        : getRedeemFunction(tokenType)

      // For record-based transitions, we pass a placeholder for the record input.
      // Shield Wallet uses recordIndices to identify which inputs are records
      // and prompts the user to select the appropriate record from their wallet.
      const result = await executeTransaction({
        program: CONTRACT_INFO.programId,
        function: functionName,
        inputs: ['{}'], // Placeholder — wallet selects the OutcomeShare record
        fee: 0.5,
        recordIndices: [0], // Input 0 is a record (OutcomeShare)
      })

      if (result?.transactionId) {
        setTxId(result.transactionId)
        // Mark as claimed locally
        markBetClaimed(bet.id)
        onClaimSuccess?.()
      } else {
        throw new Error('No transaction ID returned from wallet')
      }
    } catch (err: unknown) {
      console.error(`${isRefund ? 'Claim refund' : 'Redeem shares'} failed:`, err)
      const msg = err instanceof Error ? err.message : 'Transaction failed'
      setError(msg)
    } finally {
      setIsSubmitting(false)
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

  // CLI commands as fallback
  const claimRefundCmd = `snarkos developer execute ${CONTRACT_INFO.programId} ${refundFn} \\
  "<YOUR_OUTCOME_SHARE_RECORD>" \\
  --private-key <YOUR_PRIVATE_KEY> \\
  --endpoint https://api.explorer.provable.com \\
  --broadcast --network 1 --priority-fee 500000`

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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="w-full max-w-lg max-h-[85vh] overflow-y-auto"
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
                {/* Transaction success */}
                {txId ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-center space-y-4"
                  >
                    <div className={cn(
                      "w-16 h-16 rounded-full mx-auto flex items-center justify-center",
                      isRefund ? "bg-orange-500/20" : "bg-yes-500/20"
                    )}>
                      <Check className={cn("w-8 h-8", isRefund ? "text-orange-400" : "text-yes-400")} />
                    </div>
                    <div>
                      <h4 className="text-lg font-semibold text-white">
                        {isRefund ? 'Refund Submitted' : 'Redemption Submitted'}
                      </h4>
                      <p className="text-sm text-surface-400 mt-1">
                        Transaction sent. Please wait for on-chain confirmation (1-3 minutes).
                      </p>
                    </div>
                    <TransactionLink
                      transactionId={txId}
                      showCopy={true}
                      showNote={true}
                    />
                    <button onClick={handleClose} className="w-full btn-secondary mt-4">
                      Close
                    </button>
                  </motion.div>
                ) : (
                  <>
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

                    {/* Error display */}
                    {error && (
                      <div className="flex items-start gap-3 p-4 rounded-xl bg-no-500/10 border border-no-500/20">
                        <AlertTriangle className="w-5 h-5 text-no-400 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-no-400">Transaction Failed</p>
                          <p className="text-xs text-surface-400 mt-1">{error}</p>
                          <p className="text-xs text-surface-500 mt-2">
                            If the wallet cannot find the record, try the CLI method below.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Wallet Claim Button */}
                    {wallet.connected && (
                      <div className="space-y-3">
                        <button
                          onClick={handleWalletClaim}
                          disabled={isSubmitting}
                          className={cn(
                            "w-full py-3 rounded-xl font-medium transition-all flex items-center justify-center gap-2",
                            isRefund
                              ? "bg-orange-500 hover:bg-orange-400 text-white"
                              : "bg-gradient-to-r from-yes-500 to-brand-500 hover:from-yes-400 hover:to-brand-400 text-white",
                            isSubmitting && "opacity-70 cursor-not-allowed"
                          )}
                        >
                          {isSubmitting ? (
                            <>
                              <Loader2 className="w-5 h-5 animate-spin" />
                              <span>Confirm in Wallet...</span>
                            </>
                          ) : (
                            <>
                              <Wallet className="w-5 h-5" />
                              <span>{isRefund ? 'Claim Refund via Wallet' : 'Redeem via Wallet'}</span>
                            </>
                          )}
                        </button>
                        <p className="text-xs text-surface-500 text-center">
                          Your wallet will prompt you to select the OutcomeShare record.
                        </p>
                      </div>
                    )}

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

                    {/* CLI Fallback (collapsible) */}
                    <div className="border border-surface-700/50 rounded-xl overflow-hidden">
                      <button
                        onClick={() => setShowCli(!showCli)}
                        className="w-full flex items-center justify-between p-3 text-sm text-surface-400 hover:text-surface-300 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <Terminal className="w-4 h-4" />
                          <span>CLI Fallback (Advanced)</span>
                        </div>
                        <span className="text-xs">{showCli ? 'Hide' : 'Show'}</span>
                      </button>

                      {showCli && (
                        <div className="p-3 pt-0 space-y-3">
                          <p className="text-xs text-surface-500">
                            If the wallet cannot find your record, use the CLI with your private key:
                          </p>
                          <div className="relative">
                            <pre className="p-3 rounded-lg bg-surface-900 border border-surface-700 text-xs text-surface-300 overflow-x-auto whitespace-pre-wrap break-all font-mono">
                              {isRefund ? claimRefundCmd : redeemSharesCmd}
                            </pre>
                            <button
                              onClick={() => copyToClipboard(isRefund ? claimRefundCmd : redeemSharesCmd, 'cmd')}
                              className="absolute top-2 right-2 p-1.5 rounded-lg bg-surface-800 hover:bg-surface-700 transition-colors"
                              title="Copy command"
                            >
                              {copiedCommand === 'cmd' ? (
                                <Check className="w-3.5 h-3.5 text-yes-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5 text-surface-400" />
                              )}
                            </button>
                          </div>
                          <p className="text-xs text-surface-500">
                            Replace <code className="text-surface-300">&lt;YOUR_OUTCOME_SHARE_RECORD&gt;</code> with your OutcomeShare record plaintext.
                          </p>

                          {/* Record hint */}
                          <div className="text-xs text-surface-500 p-3 rounded-lg bg-surface-800/50">
                            <p className="font-medium text-surface-400 mb-1">Finding your OutcomeShare record:</p>
                            <p>
                              Look up your buy transaction on the{' '}
                              <a
                                href="https://testnet.explorer.provable.com"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-brand-400 hover:text-brand-300 inline-flex items-center gap-1"
                              >
                                Aleo Explorer <ExternalLink className="w-3 h-3" />
                              </a>
                              {' '}and decrypt the record output with your view key.
                            </p>
                          </div>

                          <button
                            onClick={handleMarkClaimed}
                            className="w-full py-2 rounded-lg border border-surface-600 text-sm text-surface-300 hover:bg-surface-800 transition-colors flex items-center justify-center gap-2"
                          >
                            <Check className="w-4 h-4" />
                            Mark as Claimed (CLI done)
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Close button */}
                    <button onClick={handleClose} className="w-full btn-secondary">
                      Cancel
                    </button>
                  </>
                )}
              </div>
            </div>
          </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}
