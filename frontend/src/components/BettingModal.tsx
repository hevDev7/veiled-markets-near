import { motion, AnimatePresence } from 'framer-motion'
import { X, Shield, TrendingUp, Check, Loader2, AlertCircle } from 'lucide-react'
import { useState } from 'react'
import { type Market, useWalletStore, useBetsStore, CONTRACT_INFO } from '@/lib/store'
import { useAleoTransaction } from '@/hooks/useAleoTransaction'
import { cn, formatCredits, formatPercentage, getCategoryName, getCategoryEmoji, getTokenSymbol } from '@/lib/utils'
import { TransactionLink } from './TransactionLink'
import { buildPlaceBetInputs, getMarket, MARKET_STATUS } from '@/lib/aleo-client'

interface BettingModalProps {
  market: Market | null
  isOpen: boolean
  onClose: () => void
}

type BetOutcome = 'yes' | 'no' | null
type BetStep = 'select' | 'amount' | 'confirm' | 'success'

export function BettingModal({ market, isOpen, onClose }: BettingModalProps) {
  const { wallet } = useWalletStore()
  const { addPendingBet } = useBetsStore()
  const { executeTransaction } = useAleoTransaction()

  const [selectedOutcome, setSelectedOutcome] = useState<BetOutcome>(null)
  const [betAmount, setBetAmount] = useState('')
  const [step, setStep] = useState<BetStep>('select')
  const [isPlacing, setIsPlacing] = useState(false)
  const [transactionId, setTransactionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handlePlaceBet = async () => {
    if (!market || !selectedOutcome || !betAmount) return

    setIsPlacing(true)
    setError(null)

    try {
      if (!market.id.endsWith('field')) {
        throw new Error(
          'This is a demo market for UI preview only. ' +
          'To place real bets, use markets created via the "Create Market" button.'
        )
      }

      const amountMicro = BigInt(Math.floor(parseFloat(betAmount) * 1_000_000))

      // Validate amount against public balance (place_bet_public uses public credits only)
      const tokenType = market.tokenType || 'ALEO'
      const availableBalance = tokenType === 'USDCX' ? wallet.balance.usdcxPublic : wallet.balance.public
      if (!wallet.isDemoMode && amountMicro > availableBalance) {
        throw new Error(
          `Insufficient public balance. You need ${(Number(amountMicro) / 1_000_000).toFixed(2)} ${tokenType} ` +
          `but only have ${(Number(availableBalance) / 1_000_000).toFixed(2)} ${tokenType} public balance.` +
          (tokenType === 'ALEO' && wallet.balance.private > 0n
            ? ' Convert private to public in your wallet first.'
            : '')
        )
      }

      // Pre-validate market status on-chain to avoid wasted gas
      try {
        const onChainMarket = await getMarket(market.id)
        if (onChainMarket && onChainMarket.status !== MARKET_STATUS.ACTIVE) {
          const statusNames: Record<number, string> = { 2: 'CLOSED', 3: 'RESOLVED', 4: 'CANCELLED' }
          throw new Error(
            `Market is ${statusNames[onChainMarket.status] || 'not active'} on-chain. Betting is no longer available.`
          )
        }
      } catch (validationErr) {
        // Re-throw market status errors, but don't block on network errors
        if (validationErr instanceof Error && validationErr.message.includes('Market is')) {
          throw validationErr
        }
        console.warn('Pre-validation skipped (network error):', validationErr)
      }

      const { functionName, inputs } = buildPlaceBetInputs(market.id, amountMicro, selectedOutcome, tokenType)

      const result = await executeTransaction({
        program: CONTRACT_INFO.programId,
        function: functionName,
        inputs,
        fee: 0.5,
      })

      if (result?.transactionId) {
        setTransactionId(result.transactionId)
        setStep('success')

        // Save bet to store (localStorage + Supabase)
        addPendingBet({
          id: result.transactionId,
          marketId: market.id,
          amount: amountMicro,
          outcome: selectedOutcome,
          placedAt: Date.now(),
          status: 'pending',
          marketQuestion: market.question,
          lockedMultiplier: selectedOutcome === 'yes'
            ? market.potentialYesPayout
            : market.potentialNoPayout,
        })
      } else {
        throw new Error('No transaction ID returned from wallet')
      }
    } catch (err: unknown) {
      console.error('Failed to place bet:', err)
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred. Please try again.'
      setError(errorMessage)
    } finally {
      setIsPlacing(false)
    }
  }

  const handleClose = () => {
    setSelectedOutcome(null)
    setBetAmount('')
    setStep('select')
    setTransactionId(null)
    setError(null)
    onClose()
  }

  const potentialPayout = selectedOutcome && betAmount
    ? parseFloat(betAmount) * (selectedOutcome === 'yes' ? market?.potentialYesPayout || 0 : market?.potentialNoPayout || 0)
    : 0

  const isExpired = market ? (market.timeRemaining === 'Ended' || market.status !== 1) : false
  const tokenSymbol = market ? getTokenSymbol(market.tokenType) : 'ALEO'
  const isUsdcx = market?.tokenType === 'USDCX'

  if (!market) return null

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

                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">{getCategoryEmoji(market.category)}</span>
                  <span className="category-badge">{getCategoryName(market.category)}</span>
                  <div className="privacy-indicator ml-auto">
                    <Shield className="w-3 h-3" />
                    <span>Private Bet</span>
                  </div>
                </div>

                <h2 className="text-xl font-semibold text-white pr-8">
                  {market.question}
                </h2>
              </div>

              {/* Content */}
              <div className="p-6">
                <AnimatePresence mode="wait">
                  {step === 'select' && (
                    <motion.div
                      key="select"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                    >
                      {isExpired && (
                        <div className="p-4 rounded-xl bg-no-500/10 border border-no-500/20 mb-4">
                          <div className="flex items-center gap-2">
                            <AlertCircle className="w-5 h-5 text-no-400 flex-shrink-0" />
                            <p className="text-sm text-no-400 font-medium">
                              This market has expired. Betting is no longer available.
                            </p>
                          </div>
                        </div>
                      )}

                      <p className="text-surface-400 text-sm mb-4">
                        {isExpired ? 'Market odds at close:' : 'Choose your prediction'}
                      </p>

                      <div className="grid grid-cols-2 gap-4 mb-6">
                        <button
                          onClick={() => setSelectedOutcome('yes')}
                          className={cn(
                            'relative p-5 rounded-xl border-2 transition-all duration-200',
                            selectedOutcome === 'yes'
                              ? 'border-yes-500 bg-yes-500/10 shadow-glow-yes'
                              : 'border-surface-700 hover:border-yes-500/50 hover:bg-yes-500/5'
                          )}
                        >
                          {selectedOutcome === 'yes' && (
                            <div className="absolute top-2 right-2">
                              <Check className="w-5 h-5 text-yes-400" />
                            </div>
                          )}
                          <div className="text-3xl font-bold text-yes-400 mb-1">
                            {formatPercentage(market.yesPercentage)}
                          </div>
                          <div className="text-lg font-semibold text-white mb-2">Yes</div>
                          <div className="text-sm text-surface-400">
                            Payout: <span className="text-yes-400 font-medium">{market.potentialYesPayout.toFixed(2)}x</span>
                          </div>
                        </button>

                        <button
                          onClick={() => setSelectedOutcome('no')}
                          className={cn(
                            'relative p-5 rounded-xl border-2 transition-all duration-200',
                            selectedOutcome === 'no'
                              ? 'border-no-500 bg-no-500/10 shadow-glow-no'
                              : 'border-surface-700 hover:border-no-500/50 hover:bg-no-500/5'
                          )}
                        >
                          {selectedOutcome === 'no' && (
                            <div className="absolute top-2 right-2">
                              <Check className="w-5 h-5 text-no-400" />
                            </div>
                          )}
                          <div className="text-3xl font-bold text-no-400 mb-1">
                            {formatPercentage(market.noPercentage)}
                          </div>
                          <div className="text-lg font-semibold text-white mb-2">No</div>
                          <div className="text-sm text-surface-400">
                            Payout: <span className="text-no-400 font-medium">{market.potentialNoPayout.toFixed(2)}x</span>
                          </div>
                        </button>
                      </div>

                      <button
                        onClick={() => selectedOutcome && !isExpired && setStep('amount')}
                        disabled={!selectedOutcome || isExpired}
                        className={cn(
                          'w-full btn-primary',
                          (!selectedOutcome || isExpired) && 'opacity-50 cursor-not-allowed'
                        )}
                      >
                        {isExpired ? 'Market Expired' : 'Continue'}
                      </button>
                    </motion.div>
                  )}

                  {step === 'amount' && (
                    <motion.div
                      key="amount"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                    >
                      <div className={cn(
                        'flex items-center gap-3 p-4 rounded-xl mb-6',
                        selectedOutcome === 'yes'
                          ? 'bg-yes-500/10 border border-yes-500/20'
                          : 'bg-no-500/10 border border-no-500/20'
                      )}>
                        <div className={cn(
                          'w-10 h-10 rounded-full flex items-center justify-center',
                          selectedOutcome === 'yes' ? 'bg-yes-500/20' : 'bg-no-500/20'
                        )}>
                          <TrendingUp className={cn(
                            'w-5 h-5',
                            selectedOutcome === 'yes' ? 'text-yes-400' : 'text-no-400'
                          )} />
                        </div>
                        <div>
                          <p className="text-sm text-surface-400">Your prediction</p>
                          <p className={cn(
                            'font-semibold',
                            selectedOutcome === 'yes' ? 'text-yes-400' : 'text-no-400'
                          )}>
                            {selectedOutcome === 'yes' ? 'Yes' : 'No'} @ {formatPercentage(
                              selectedOutcome === 'yes' ? market.yesPercentage : market.noPercentage
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="mb-6">
                        <label className="block text-sm text-surface-400 mb-2">
                          Bet Amount ({tokenSymbol})
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            value={betAmount}
                            onChange={(e) => setBetAmount(e.target.value)}
                            placeholder="0.00"
                            className="input-field text-2xl font-semibold pr-20"
                          />
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 text-surface-400">
                            {tokenSymbol}
                          </div>
                        </div>
                        <div className="mt-2 space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="text-surface-500">
                              {isUsdcx
                                ? `Balance: ${formatCredits(wallet.balance.usdcxPublic)} USDCX`
                                : `Public Balance: ${formatCredits(wallet.balance.public)} ALEO`
                              }
                            </span>
                            <button
                              onClick={() => {
                                // place_bet_public uses transfer_public_as_signer — only public balance is usable
                                const maxBalance = isUsdcx ? wallet.balance.usdcxPublic : wallet.balance.public
                                // Reserve 0.6 ALEO for gas fee when using ALEO
                                const reserveForGas = isUsdcx ? 0n : 600_000n
                                const usable = maxBalance > reserveForGas ? maxBalance - reserveForGas : 0n
                                setBetAmount((Number(usable) / 1_000_000).toString())
                              }}
                              className="text-brand-400 hover:text-brand-300"
                            >
                              Max
                            </button>
                          </div>
                          {!isUsdcx && wallet.balance.private > 0n && (
                            <div className="text-xs text-surface-600">
                              <span>Private: {formatCredits(wallet.balance.private)} ALEO</span>
                              <span className="ml-2 text-yellow-500/80">(not usable for betting)</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {betAmount && parseFloat(betAmount) > 0 && (
                        <div className="p-4 rounded-xl bg-surface-800/50 mb-6">
                          <div className="flex justify-between items-center">
                            <span className="text-surface-400">Potential Payout</span>
                            <span className="text-2xl font-bold text-white">
                              {potentialPayout.toFixed(2)} {tokenSymbol}
                            </span>
                          </div>
                          <div className="flex justify-between items-center mt-2">
                            <span className="text-surface-500 text-sm">Profit if you win</span>
                            <span className={cn(
                              'font-medium',
                              selectedOutcome === 'yes' ? 'text-yes-400' : 'text-no-400'
                            )}>
                              +{(potentialPayout - parseFloat(betAmount)).toFixed(2)} {tokenSymbol}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Privacy Notice */}
                      <div className="flex items-start gap-3 p-4 rounded-xl bg-brand-500/5 border border-brand-500/20 mb-4">
                        <Shield className="w-5 h-5 text-brand-400 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-brand-300">Your bet is private</p>
                          <p className="text-xs text-surface-400 mt-1">
                            Your wallet generates a zero-knowledge proof locally.
                            Transition inputs are encrypted on-chain.
                            Uses public credits — no shielding required.
                          </p>
                        </div>
                      </div>

                      {/* Warning: insufficient public balance */}
                      {(isUsdcx ? wallet.balance.usdcxPublic : wallet.balance.public) < 1_000_000n && !wallet.isDemoMode && (
                        <div className="flex items-start gap-3 p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20 mb-6">
                          <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm font-medium text-yellow-300 mb-1">Insufficient public balance</p>
                            <p className="text-xs text-surface-400 leading-relaxed">
                              Betting uses <span className="text-white">public</span> {tokenSymbol} only (via transfer_public_as_signer).
                              {!isUsdcx && wallet.balance.private > 0n && (
                                <> You have {formatCredits(wallet.balance.private)} ALEO in private balance — convert to public first in Leo Wallet (Send &gt; Public transfer to yourself).</>
                              )}
                              {(isUsdcx ? wallet.balance.usdcxPublic : wallet.balance.public) === 0n && (
                                <> Current public balance: <span className="text-white">0 {tokenSymbol}</span></>
                              )}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Error Display */}
                      {error && (
                        <div className="flex items-start gap-3 p-4 rounded-xl bg-no-500/10 border border-no-500/20 mb-6">
                          <AlertCircle className="w-5 h-5 text-no-400 flex-shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-sm font-medium text-no-400">Bet Failed</p>
                            <p className="text-sm text-surface-400 mt-1">{error}</p>
                          </div>
                        </div>
                      )}

                      <div className="flex gap-3">
                        <button
                          onClick={() => {
                            setStep('select')
                            setError(null)
                          }}
                          className="btn-secondary flex-1"
                        >
                          Back
                        </button>

                        <button
                          onClick={handlePlaceBet}
                          disabled={!betAmount || parseFloat(betAmount) <= 0 || isPlacing}
                          className={cn(
                            'flex-1 flex items-center justify-center gap-2 btn-primary',
                            (!betAmount || parseFloat(betAmount) <= 0) && 'opacity-50 cursor-not-allowed'
                          )}
                        >
                          {isPlacing ? (
                            <>
                              <Loader2 className="w-5 h-5 animate-spin" />
                              <span>Confirm in Wallet...</span>
                            </>
                          ) : (
                            <>
                              <Shield className="w-5 h-5" />
                              <span>Place Bet</span>
                            </>
                          )}
                        </button>
                      </div>
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
                        className={cn(
                          'w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center',
                          selectedOutcome === 'yes'
                            ? 'bg-yes-500/20 shadow-glow-yes'
                            : 'bg-no-500/20 shadow-glow-no'
                        )}
                      >
                        <Check className={cn(
                          'w-10 h-10',
                          selectedOutcome === 'yes' ? 'text-yes-400' : 'text-no-400'
                        )} />
                      </motion.div>

                      <h3 className="text-2xl font-bold text-white mb-2">
                        Bet Placed Successfully!
                      </h3>
                      <p className="text-surface-400 mb-6">
                        Your private bet has been recorded on-chain
                      </p>

                      <div className="p-4 rounded-xl bg-surface-800/50 mb-6">
                        <div className="flex justify-between mb-2">
                          <span className="text-surface-400">Amount</span>
                          <span className="font-medium text-white">{betAmount} {tokenSymbol}</span>
                        </div>
                        <div className="flex justify-between mb-2">
                          <span className="text-surface-400">Position</span>
                          <span className={cn(
                            'font-medium',
                            selectedOutcome === 'yes' ? 'text-yes-400' : 'text-no-400'
                          )}>
                            {selectedOutcome === 'yes' ? 'Yes' : 'No'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-surface-400">Potential Payout</span>
                          <span className="font-medium text-white">{potentialPayout.toFixed(2)} {tokenSymbol}</span>
                        </div>
                      </div>

                      {transactionId && (
                        <>
                          <TransactionLink
                            transactionId={transactionId}
                            className="mb-4"
                            showCopy={true}
                            showNote={true}
                          />

                          {/* Warning if UUID format */}
                          {transactionId.includes('-') && !transactionId.startsWith('at1') && (
                            <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 mb-4">
                              <div className="flex items-start gap-2">
                                <span className="text-yellow-400">⚠️</span>
                                <div className="flex-1">
                                  <p className="text-xs font-medium text-yellow-400 mb-1">
                                    Temporary Event ID
                                  </p>
                                  <p className="text-xs text-surface-400">
                                    This is a temporary event ID from Leo Wallet. The actual Aleo transaction ID (at1...)
                                    will be available after confirmation (30-60 seconds). Explorer link will work once confirmed.
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}
                        </>
                      )}

                      <div className="flex items-center justify-center gap-2 text-sm text-brand-400 mb-6">
                        <Shield className="w-4 h-4" />
                        <span>ZK Proof Generated • Fully Private</span>
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

