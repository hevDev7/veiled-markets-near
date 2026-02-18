import { motion, AnimatePresence } from 'framer-motion'
import { X, TrendingDown, AlertTriangle, Loader2, Check, Shield } from 'lucide-react'
import { useState, useMemo } from 'react'
import { type Market, CONTRACT_INFO } from '@/lib/store'
import { useAleoTransaction } from '@/hooks/useAleoTransaction'
import { cn, formatCredits, getTokenSymbol } from '@/lib/utils'
import { buildSellSharesInputs } from '@/lib/aleo-client'
import {
  calculateSellSharesNeeded,
  calculateSellNetTokens,
  calculateMaxTokensDesired,
  calculateSellPriceImpact,
  calculateFees,
  type AMMReserves,
} from '@/lib/amm'
import { TransactionLink } from './TransactionLink'

interface SellSharesModalProps {
  isOpen: boolean
  onClose: () => void
  shareRecord: string // Stringified OutcomeShare record
  market: Market
}

type SellStep = 'input' | 'success'

export function SellSharesModal({ isOpen, onClose, shareRecord, market }: SellSharesModalProps) {
  const { executeTransaction } = useAleoTransaction()

  const [tokensDesired, setTokensDesired] = useState('')
  const [slippage, setSlippage] = useState(2) // 2% default
  const [step, setStep] = useState<SellStep>('input')
  const [isSelling, setIsSelling] = useState(false)
  const [transactionId, setTransactionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const tokenSymbol = getTokenSymbol(market.tokenType)

  // Build reserves from market data
  const reserves: AMMReserves = useMemo(() => ({
    reserve_1: market.yesReserve,
    reserve_2: market.noReserve,
    reserve_3: market.reserve3 || 0n,
    reserve_4: market.reserve4 || 0n,
    num_outcomes: market.numOutcomes || 2,
  }), [market.yesReserve, market.noReserve, market.reserve3, market.reserve4, market.numOutcomes])

  // Determine outcome from share record (parse outcome field)
  const shareOutcome = useMemo(() => {
    const outcomeMatch = shareRecord.match(/outcome:\s*(\d+)u8/)
    return outcomeMatch ? parseInt(outcomeMatch[1]) : 1
  }, [shareRecord])

  // Parse share quantity from record
  const totalShares = useMemo(() => {
    const qtyMatch = shareRecord.match(/quantity:\s*(\d+)u128/)
    return qtyMatch ? BigInt(qtyMatch[1]) : 0n
  }, [shareRecord])

  // Maximum tokens the user can withdraw with their available shares
  const maxTokens = useMemo(() => {
    if (totalShares <= 0n) return 0n
    return calculateMaxTokensDesired(reserves, shareOutcome, totalShares)
  }, [reserves, shareOutcome, totalShares])

  const tokensDesiredMicro = tokensDesired
    ? BigInt(Math.floor(parseFloat(tokensDesired) * 1_000_000))
    : 0n

  // Compute shares needed and net tokens
  const sellPreview = useMemo(() => {
    if (tokensDesiredMicro <= 0n) return null

    const sharesNeeded = calculateSellSharesNeeded(reserves, shareOutcome, tokensDesiredMicro)
    const maxSharesUsed = (sharesNeeded * BigInt(Math.floor((100 + slippage) * 100))) / 10000n
    const netTokens = calculateSellNetTokens(tokensDesiredMicro)
    const fees = calculateFees(tokensDesiredMicro)
    const priceImpact = calculateSellPriceImpact(reserves, shareOutcome, tokensDesiredMicro)

    return {
      sharesNeeded,
      maxSharesUsed,
      netTokens,
      fees,
      priceImpact,
      exceedsBalance: maxSharesUsed > totalShares,
    }
  }, [reserves, shareOutcome, tokensDesiredMicro, slippage, totalShares])

  const highPriceImpact = sellPreview ? Math.abs(sellPreview.priceImpact) > 5 : false

  const handleSell = async () => {
    if (!tokensDesired || tokensDesiredMicro <= 0n || !sellPreview) return

    setIsSelling(true)
    setError(null)

    try {
      if (sellPreview.exceedsBalance) {
        throw new Error(
          `Need ${formatCredits(sellPreview.maxSharesUsed)} shares but only have ${formatCredits(totalShares)}.`
        )
      }

      const tokenType = (market.tokenType || 'ALEO') as 'ALEO' | 'USDCX'
      const { functionName, inputs } = buildSellSharesInputs(
        shareRecord,
        tokensDesiredMicro,
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
        setTransactionId(result.transactionId)
        setStep('success')
      } else {
        throw new Error('No transaction ID returned from wallet')
      }
    } catch (err: unknown) {
      console.error('Failed to sell shares:', err)
      setError(err instanceof Error ? err.message : 'Failed to sell shares')
    } finally {
      setIsSelling(false)
    }
  }

  const handleClose = () => {
    setTokensDesired('')
    setSlippage(2)
    setStep('input')
    setTransactionId(null)
    setError(null)
    onClose()
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-x-4 top-[10%] md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-lg z-50"
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
                  <div className="w-10 h-10 rounded-xl bg-no-500/10 flex items-center justify-center">
                    <TrendingDown className="w-5 h-5 text-no-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-white">Sell Shares</h2>
                    <p className="text-sm text-surface-400">
                      Outcome {shareOutcome} -- {market.question.slice(0, 40)}...
                    </p>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="p-6">
                <AnimatePresence mode="wait">
                  {step === 'input' && (
                    <motion.div
                      key="input"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="space-y-6"
                    >
                      {/* Balance Display */}
                      <div className="p-4 rounded-xl bg-surface-800/30">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-surface-400">Your Shares</span>
                          <span className="text-white font-medium">
                            {formatCredits(totalShares)} shares
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-surface-400">Max Withdrawable</span>
                          <span className="text-surface-300">
                            {formatCredits(maxTokens)} {tokenSymbol}
                          </span>
                        </div>
                      </div>

                      {/* Tokens Desired Input */}
                      <div>
                        <label className="block text-sm text-surface-400 mb-2">
                          Amount to Withdraw ({tokenSymbol})
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            value={tokensDesired}
                            onChange={(e) => setTokensDesired(e.target.value)}
                            placeholder="0.00"
                            className="input-field text-2xl font-semibold pr-24"
                          />
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                            <button
                              onClick={() => setTokensDesired(
                                (Number(maxTokens) / 1_000_000).toString()
                              )}
                              className="text-xs text-brand-400 hover:text-brand-300"
                            >
                              Max
                            </button>
                            <span className="text-surface-400 text-sm">{tokenSymbol}</span>
                          </div>
                        </div>
                      </div>

                      {/* Slippage Tolerance */}
                      <div>
                        <label className="block text-sm text-surface-400 mb-2">
                          Slippage Tolerance
                        </label>
                        <div className="flex gap-2">
                          {[0.5, 1, 2, 5].map((val) => (
                            <button
                              key={val}
                              onClick={() => setSlippage(val)}
                              className={cn(
                                'flex-1 py-2 rounded-lg text-sm font-medium transition-all',
                                slippage === val
                                  ? 'bg-brand-500/20 text-brand-400 border border-brand-500/30'
                                  : 'bg-surface-800/50 text-surface-400 border border-surface-700 hover:border-surface-600'
                              )}
                            >
                              {val}%
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Quote Preview */}
                      {sellPreview && tokensDesiredMicro > 0n && (
                        <div className="p-4 rounded-xl bg-surface-800/50 space-y-3">
                          <div className="flex justify-between items-center">
                            <span className="text-surface-400 text-sm">Shares Used</span>
                            <span className="text-sm text-white font-medium">
                              {formatCredits(sellPreview.sharesNeeded)} shares
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-surface-400 text-sm">Max Shares (slippage)</span>
                            <span className="text-sm text-surface-300">
                              {formatCredits(sellPreview.maxSharesUsed)} shares
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-surface-400 text-sm">Fees (2%)</span>
                            <span className="text-sm text-surface-300">
                              {formatCredits(sellPreview.fees.totalFees)} {tokenSymbol}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-surface-400 text-sm">Price Impact</span>
                            <span className={cn(
                              'text-sm font-medium',
                              highPriceImpact ? 'text-no-400' : 'text-surface-300'
                            )}>
                              {sellPreview.priceImpact.toFixed(2)}%
                            </span>
                          </div>
                          <div className="border-t border-surface-700 pt-2 flex justify-between items-center">
                            <span className="text-surface-400 text-sm">You Receive</span>
                            <span className="text-lg font-bold text-white">
                              {formatCredits(sellPreview.netTokens)} {tokenSymbol}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Exceeds Balance Warning */}
                      {sellPreview?.exceedsBalance && (
                        <div className="flex items-start gap-3 p-4 rounded-xl bg-no-500/10 border border-no-500/20">
                          <AlertTriangle className="w-5 h-5 text-no-400 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-sm font-medium text-no-300">Insufficient Shares</p>
                            <p className="text-xs text-surface-400 mt-1">
                              Need {formatCredits(sellPreview.maxSharesUsed)} shares (with {slippage}% slippage) but you only have {formatCredits(totalShares)}.
                              Try a smaller withdrawal amount.
                            </p>
                          </div>
                        </div>
                      )}

                      {/* High Price Impact Warning */}
                      {highPriceImpact && !sellPreview?.exceedsBalance && (
                        <div className="flex items-start gap-3 p-4 rounded-xl bg-no-500/10 border border-no-500/20">
                          <AlertTriangle className="w-5 h-5 text-no-400 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-sm font-medium text-no-300">High Price Impact</p>
                            <p className="text-xs text-surface-400 mt-1">
                              This trade has a price impact of {Math.abs(sellPreview?.priceImpact || 0).toFixed(2)}%.
                              Consider withdrawing a smaller amount.
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Error Display */}
                      {error && (
                        <div className="flex items-start gap-3 p-4 rounded-xl bg-no-500/10 border border-no-500/20">
                          <AlertTriangle className="w-5 h-5 text-no-400 flex-shrink-0 mt-0.5" />
                          <p className="text-sm text-no-400">{error}</p>
                        </div>
                      )}

                      <button
                        onClick={handleSell}
                        disabled={!tokensDesired || parseFloat(tokensDesired) <= 0 || isSelling || sellPreview?.exceedsBalance}
                        className={cn(
                          'w-full flex items-center justify-center gap-2 btn-primary',
                          (!tokensDesired || parseFloat(tokensDesired) <= 0 || sellPreview?.exceedsBalance) && 'opacity-50 cursor-not-allowed'
                        )}
                      >
                        {isSelling ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            <span>Confirm in Wallet...</span>
                          </>
                        ) : (
                          <>
                            <TrendingDown className="w-5 h-5" />
                            <span>Sell Shares</span>
                          </>
                        )}
                      </button>
                    </motion.div>
                  )}

                  {step === 'success' && (
                    <motion.div
                      key="success"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="text-center py-6"
                    >
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', delay: 0.2 }}
                        className="w-20 h-20 rounded-full bg-yes-500/20 shadow-glow-yes mx-auto mb-6 flex items-center justify-center"
                      >
                        <Check className="w-10 h-10 text-yes-400" />
                      </motion.div>

                      <h3 className="text-2xl font-bold text-white mb-2">
                        Shares Sold!
                      </h3>
                      <p className="text-surface-400 mb-6">
                        Your sell order has been submitted to the network
                      </p>

                      <div className="p-4 rounded-xl bg-surface-800/50 mb-6 text-left">
                        <div className="flex justify-between mb-2">
                          <span className="text-surface-400">Withdrawal</span>
                          <span className="font-medium text-white">
                            {tokensDesired} {tokenSymbol}
                          </span>
                        </div>
                        {sellPreview && (
                          <>
                            <div className="flex justify-between mb-2">
                              <span className="text-surface-400">Shares Used</span>
                              <span className="font-medium text-white">
                                {formatCredits(sellPreview.sharesNeeded)} shares
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-surface-400">Net Received</span>
                              <span className="font-medium text-white">
                                {formatCredits(sellPreview.netTokens)} {tokenSymbol}
                              </span>
                            </div>
                          </>
                        )}
                      </div>

                      {transactionId && (
                        <TransactionLink
                          transactionId={transactionId}
                          className="mb-4"
                          showCopy={true}
                          showNote={true}
                        />
                      )}

                      <div className="flex items-center justify-center gap-2 text-sm text-brand-400 mb-6">
                        <Shield className="w-4 h-4" />
                        <span>AMM Trade Executed On-Chain</span>
                      </div>

                      <button onClick={handleClose} className="btn-primary w-full">
                        Done
                      </button>
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
