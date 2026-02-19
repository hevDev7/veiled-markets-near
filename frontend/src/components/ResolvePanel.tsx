import { motion } from 'framer-motion'
import {
  Lock,
  Gavel,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Clock,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react'
import { useState, useEffect, useMemo } from 'react'
import { type Market, useWalletStore, CONTRACT_INFO } from '@/lib/store'
import { useAleoTransaction } from '@/hooks/useAleoTransaction'
import { cn, getTokenSymbol } from '@/lib/utils'
import {
  buildCloseMarketInputs,
  buildResolveMarketInputs,
  buildFinalizeResolutionInputs,
  buildEmergencyCancelInputs,
  getCurrentBlockHeight,
  MARKET_STATUS,
  type MarketResolutionData,
} from '@/lib/aleo-client'
import { TransactionLink } from './TransactionLink'
import { config } from '@/lib/config'

interface ResolvePanelProps {
  market: Market
  resolution: MarketResolutionData | null
  onResolutionChange?: () => void
}

type ResolveStep = 'close' | 'resolve' | 'finalize' | 'done'

export function ResolvePanel({ market, resolution, onResolutionChange }: ResolvePanelProps) {
  const { wallet } = useWalletStore()
  const { executeTransaction } = useAleoTransaction()

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [transactionId, setTransactionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedOutcome, setSelectedOutcome] = useState<number | null>(null)
  const [currentBlock, setCurrentBlock] = useState<bigint>(0n)

  const tokenSymbol = getTokenSymbol(market.tokenType)
  const numOutcomes = market.numOutcomes ?? 2
  const outcomeLabels = market.outcomeLabels ?? (numOutcomes === 2 ? ['Yes', 'No'] : Array.from({ length: numOutcomes }, (_, i) => `Outcome ${i + 1}`))

  // Fetch current block height
  useEffect(() => {
    let mounted = true
    const fetchBlock = async () => {
      try {
        const height = await getCurrentBlockHeight()
        if (mounted) setCurrentBlock(height)
      } catch {
        // ignore
      }
    }
    fetchBlock()
    const interval = setInterval(fetchBlock, 15_000)
    return () => { mounted = false; clearInterval(interval) }
  }, [])

  // Determine which step the market is at
  const currentStep: ResolveStep = useMemo(() => {
    if (market.status === MARKET_STATUS.RESOLVED) return 'done'
    if (market.status === MARKET_STATUS.PENDING_RESOLUTION) return 'finalize'
    if (market.status === MARKET_STATUS.CLOSED) return 'resolve'
    // ACTIVE but expired
    return 'close'
  }, [market.status])

  const isResolver = wallet.address === market.creator || wallet.address === market.resolver
  const canFinalize = resolution && currentBlock > resolution.challenge_deadline

  // Check if market is past resolution deadline (eligible for emergency cancel)
  const isPastResolutionDeadline = currentBlock > 0n
    && market.resolutionDeadline > 0n
    && currentBlock > market.resolutionDeadline
    && market.status !== MARKET_STATUS.RESOLVED
    && market.status !== MARKET_STATUS.CANCELLED

  // Steps config
  const steps: { key: ResolveStep; label: string; icon: React.ElementType }[] = [
    { key: 'close', label: 'Close Market', icon: Lock },
    { key: 'resolve', label: 'Resolve', icon: Gavel },
    { key: 'finalize', label: 'Finalize', icon: CheckCircle2 },
  ]

  const handleCloseMarket = async () => {
    setIsSubmitting(true)
    setError(null)
    try {
      const inputs = buildCloseMarketInputs(market.id)
      const result = await executeTransaction({
        program: CONTRACT_INFO.programId,
        function: 'close_market',
        inputs,
        fee: 0.5,
      })
      if (result?.transactionId) {
        setTransactionId(result.transactionId)
        onResolutionChange?.()
      } else {
        throw new Error('No transaction ID returned from wallet')
      }
    } catch (err: unknown) {
      console.error('Close market failed:', err)
      setError(err instanceof Error ? err.message : 'Failed to close market')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleResolveMarket = async () => {
    if (!selectedOutcome) return
    setIsSubmitting(true)
    setError(null)
    try {
      const inputs = buildResolveMarketInputs(market.id, selectedOutcome)
      const result = await executeTransaction({
        program: CONTRACT_INFO.programId,
        function: 'resolve_market',
        inputs,
        fee: 0.5,
      })
      if (result?.transactionId) {
        setTransactionId(result.transactionId)
        onResolutionChange?.()
      } else {
        throw new Error('No transaction ID returned from wallet')
      }
    } catch (err: unknown) {
      console.error('Resolve market failed:', err)
      setError(err instanceof Error ? err.message : 'Failed to resolve market')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleFinalizeResolution = async () => {
    setIsSubmitting(true)
    setError(null)
    try {
      const inputs = buildFinalizeResolutionInputs(market.id)
      const result = await executeTransaction({
        program: CONTRACT_INFO.programId,
        function: 'finalize_resolution',
        inputs,
        fee: 0.5,
      })
      if (result?.transactionId) {
        setTransactionId(result.transactionId)
        onResolutionChange?.()
      } else {
        throw new Error('No transaction ID returned from wallet')
      }
    } catch (err: unknown) {
      console.error('Finalize resolution failed:', err)
      setError(err instanceof Error ? err.message : 'Failed to finalize resolution')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEmergencyCancel = async () => {
    setIsSubmitting(true)
    setError(null)
    try {
      const inputs = buildEmergencyCancelInputs(market.id)
      const result = await executeTransaction({
        program: CONTRACT_INFO.programId,
        function: 'cancel_market',
        inputs,
        fee: 0.5,
      })
      if (result?.transactionId) {
        setTransactionId(result.transactionId)
        onResolutionChange?.()
      } else {
        throw new Error('No transaction ID returned from wallet')
      }
    } catch (err: unknown) {
      console.error('Emergency cancel failed:', err)
      setError(err instanceof Error ? err.message : 'Failed to emergency cancel')
    } finally {
      setIsSubmitting(false)
    }
  }

  const resetState = () => {
    setTransactionId(null)
    setError(null)
    setSelectedOutcome(null)
    // Refresh market data so the step advances (e.g. ACTIVE → CLOSED)
    onResolutionChange?.()
  }

  // Challenge window countdown
  const challengeInfo = useMemo(() => {
    if (!resolution || currentBlock === 0n) return null
    const blocksLeft = resolution.challenge_deadline - currentBlock
    if (blocksLeft <= 0n) return { text: 'Challenge window ended', canFinalize: true }
    const secondsLeft = Number(blocksLeft) * config.secondsPerBlock
    const hours = Math.floor(secondsLeft / 3600)
    const minutes = Math.floor((secondsLeft % 3600) / 60)
    return {
      text: `${hours}h ${minutes}m remaining (${blocksLeft.toString()} blocks)`,
      canFinalize: false,
    }
  }, [resolution, currentBlock])

  const outcomeColors = [
    'bg-yes-500/10 border-yes-500/30 text-yes-400',
    'bg-no-500/10 border-no-500/30 text-no-400',
    'bg-purple-500/10 border-purple-500/30 text-purple-400',
    'bg-yellow-500/10 border-yellow-500/30 text-yellow-400',
  ]

  return (
    <div className="glass-card overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-surface-800">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center">
            <Gavel className="w-5 h-5 text-brand-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Market Resolution</h3>
            <p className="text-sm text-surface-400">3-step on-chain resolution flow</p>
          </div>
        </div>

        {/* Step Progress */}
        <div className="flex items-center gap-2">
          {steps.map((s, idx) => {
            const StepIcon = s.icon
            const isComplete = currentStep === 'done'
              ? true
              : steps.findIndex(x => x.key === currentStep) > idx
            const isCurrent = currentStep === s.key
            return (
              <div key={s.key} className="flex items-center gap-2 flex-1">
                <div className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium flex-1',
                  isComplete ? 'bg-yes-500/10 text-yes-400' :
                  isCurrent ? 'bg-brand-500/10 text-brand-400 ring-1 ring-brand-500/30' :
                  'bg-surface-800/30 text-surface-500'
                )}>
                  <StepIcon className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate">{s.label}</span>
                </div>
                {idx < steps.length - 1 && (
                  <ArrowRight className={cn(
                    'w-4 h-4 flex-shrink-0',
                    isComplete ? 'text-yes-500' : 'text-surface-700'
                  )} />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {/* Transaction success state */}
        {transactionId ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center"
          >
            <div className="w-16 h-16 rounded-full bg-yes-500/20 mx-auto mb-4 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-yes-400" />
            </div>
            <h4 className="text-lg font-semibold text-white mb-2">
              {currentStep === 'close' && 'Market Close Submitted'}
              {currentStep === 'resolve' && 'Resolution Submitted'}
              {currentStep === 'finalize' && 'Finalization Submitted'}
              {currentStep === 'done' && 'Market Resolved'}
            </h4>
            <p className="text-sm text-surface-400 mb-3">
              Transaction submitted. Please wait for on-chain confirmation (1-3 minutes).
            </p>
            <TransactionLink
              transactionId={transactionId}
              className="mb-4"
              showCopy={true}
              showNote={true}
            />
            <button
              onClick={resetState}
              className="btn-secondary w-full mt-4"
            >
              Continue
            </button>
          </motion.div>
        ) : currentStep === 'done' ? (
          /* Fully resolved */
          <div className="text-center py-6">
            <div className="w-16 h-16 rounded-full bg-yes-500/10 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8 text-yes-400" />
            </div>
            <h4 className="text-lg font-semibold text-white mb-2">Market Resolved</h4>
            {resolution && (
              <p className="text-surface-400">
                Winning outcome: <span className="text-white font-medium">
                  {outcomeLabels[resolution.winning_outcome - 1] || `Outcome ${resolution.winning_outcome}`}
                </span>
              </p>
            )}
            <p className="text-xs text-surface-500 mt-2">
              Winners can redeem their shares 1:1 for {tokenSymbol}.
            </p>
          </div>
        ) : (
          <>
            {/* Emergency Cancel Banner — shown when past resolution deadline */}
            {isPastResolutionDeadline && (
              <div className="mb-4 p-4 rounded-xl bg-no-500/10 border border-no-500/20 space-y-3">
                <div className="flex items-start gap-3">
                  <ShieldAlert className="w-5 h-5 text-no-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-no-400">Resolution Deadline Passed</p>
                    <p className="text-xs text-surface-400 mt-1">
                      This market has passed its resolution deadline (block {market.resolutionDeadline.toString()}).
                      {currentStep === 'resolve'
                        ? ' The resolver can no longer submit a resolution.'
                        : ''}
                      {' '}Anyone can emergency cancel this market to allow bettors to claim refunds.
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleEmergencyCancel}
                  disabled={isSubmitting}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-no-500/20 hover:bg-no-500/30 border border-no-500/30 text-no-400 font-medium text-sm transition-colors"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Confirm in Wallet...</span>
                    </>
                  ) : (
                    <>
                      <ShieldAlert className="w-4 h-4" />
                      <span>Emergency Cancel Market</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Step 1: Close Market */}
            {currentStep === 'close' && (
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 rounded-xl bg-surface-800/30">
                  <Lock className="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-white">Close Trading</p>
                    <p className="text-xs text-surface-400 mt-1">
                      This stops all trading on the market. Anyone can call this after the
                      trading deadline has passed.
                    </p>
                  </div>
                </div>

                {currentBlock > 0n && market.deadline > 0n && currentBlock <= market.deadline && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                    <Clock className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-yellow-300">
                      Trading deadline has not passed yet. Current block: {currentBlock.toString()},
                      deadline: {market.deadline.toString()}.
                    </p>
                  </div>
                )}

                <button
                  onClick={handleCloseMarket}
                  disabled={isSubmitting}
                  className="w-full flex items-center justify-center gap-2 btn-primary"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Confirm in Wallet...</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-5 h-5" />
                      <span>Close Market</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Step 2: Resolve Market */}
            {currentStep === 'resolve' && (
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 rounded-xl bg-surface-800/30">
                  <Gavel className="w-5 h-5 text-brand-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-white">Set Winning Outcome</p>
                    <p className="text-xs text-surface-400 mt-1">
                      Only the market resolver can select the winning outcome.
                      A challenge window opens after submission.
                    </p>
                  </div>
                </div>

                {!isResolver && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-no-500/10 border border-no-500/20">
                    <AlertCircle className="w-4 h-4 text-no-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-no-400">
                      Your wallet is not the designated resolver for this market.
                      Only the resolver ({market.resolver?.slice(0, 10)}...{market.resolver?.slice(-6) || market.creator?.slice(-6)}) can submit a resolution.
                    </p>
                  </div>
                )}

                {/* Outcome selection */}
                {!isPastResolutionDeadline && (
                  <div>
                    <label className="block text-sm text-surface-400 mb-2">Select Winning Outcome</label>
                    <div className="space-y-2">
                      {outcomeLabels.map((label, i) => {
                        const outcomeNum = i + 1
                        const isSelected = selectedOutcome === outcomeNum
                        const colorIdx = Math.min(i, 3)
                        return (
                          <button
                            key={outcomeNum}
                            onClick={() => setSelectedOutcome(outcomeNum)}
                            className={cn(
                              'w-full p-3 rounded-xl border text-left transition-all flex items-center justify-between',
                              isSelected
                                ? 'bg-brand-500/10 border-brand-500/40 ring-1 ring-brand-500/20'
                                : 'bg-surface-800/30 border-surface-700/50 hover:border-surface-600/50'
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <span className={cn(
                                'px-2 py-0.5 text-xs font-medium rounded-full border',
                                outcomeColors[colorIdx]
                              )}>
                                {label}
                              </span>
                            </div>
                            {isSelected && (
                              <CheckCircle2 className="w-4 h-4 text-brand-400" />
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {!isPastResolutionDeadline && (
                  <button
                    onClick={handleResolveMarket}
                    disabled={isSubmitting || !selectedOutcome || !isResolver}
                    className={cn(
                      'w-full flex items-center justify-center gap-2 btn-primary',
                      (!selectedOutcome || !isResolver) && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Confirm in Wallet...</span>
                      </>
                    ) : (
                      <>
                        <Gavel className="w-5 h-5" />
                        <span>
                          {selectedOutcome
                            ? `Resolve: ${outcomeLabels[selectedOutcome - 1]} Wins`
                            : 'Select Winning Outcome'}
                        </span>
                      </>
                    )}
                  </button>
                )}
              </div>
            )}

            {/* Step 3: Finalize Resolution */}
            {currentStep === 'finalize' && (
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 rounded-xl bg-surface-800/30">
                  <CheckCircle2 className="w-5 h-5 text-purple-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-white">Finalize Resolution</p>
                    <p className="text-xs text-surface-400 mt-1">
                      After the challenge window passes with no disputes, anyone can
                      finalize the resolution. This enables winners to redeem shares.
                    </p>
                  </div>
                </div>

                {/* Current resolution info */}
                {resolution && (
                  <div className="p-4 rounded-xl bg-surface-800/30 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-surface-400">Proposed Winner</span>
                      <span className="text-white font-medium">
                        {outcomeLabels[resolution.winning_outcome - 1] || `Outcome ${resolution.winning_outcome}`}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-surface-400">Challenge Window</span>
                      <span className={cn(
                        'font-medium',
                        challengeInfo?.canFinalize ? 'text-yes-400' : 'text-yellow-400'
                      )}>
                        {challengeInfo?.text || 'Loading...'}
                      </span>
                    </div>
                  </div>
                )}

                {challengeInfo && !challengeInfo.canFinalize && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                    <Clock className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-yellow-300">
                      The challenge window must end before finalization. Anyone can dispute
                      the resolution during this period.
                    </p>
                  </div>
                )}

                <button
                  onClick={handleFinalizeResolution}
                  disabled={isSubmitting || !canFinalize}
                  className={cn(
                    'w-full flex items-center justify-center gap-2 btn-primary',
                    !canFinalize && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Confirm in Wallet...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-5 h-5" />
                      <span>Finalize Resolution</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Error Display */}
            {error && (
              <div className="flex items-start gap-3 p-4 rounded-xl bg-no-500/10 border border-no-500/20 mt-4">
                <AlertCircle className="w-5 h-5 text-no-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-no-400">Action Failed</p>
                  <p className="text-sm text-surface-400 mt-1">{error}</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
