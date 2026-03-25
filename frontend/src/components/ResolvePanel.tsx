import { motion } from 'framer-motion'
import {
  Lock,
  Gavel,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Clock,
  ArrowRight,
  Shield,
  Coins,
  Swords,
} from 'lucide-react'
import { useState, useEffect, useMemo } from 'react'
import { type Market, useWalletStore } from '@/lib/store'
import { useAleoTransaction } from '@/hooks/useAleoTransaction'
import { cn, getTokenSymbol } from '@/lib/utils'
import {
  buildCloseMarketInputs,
  buildSubmitOutcomeInputs,
  buildChallengeOutcomeInputs,
  buildFinalizeOutcomeInputs,
  getCurrentBlockHeight,
  MARKET_STATUS,
  type MarketResolutionData,
  getProgramIdForToken,
} from '@/lib/aleo-client'
import { TransactionLink } from './TransactionLink'
import { config } from '@/lib/config'

interface ResolvePanelProps {
  market: Market
  resolution: MarketResolutionData | null
  onResolutionChange?: () => void
}

type ResolveStep = 'close' | 'submit' | 'challenge' | 'finalize' | 'done'

// v33 constants (must match contract)
const MIN_RESOLUTION_BOND = 1_000_000n // 1 ALEO
const BOND_MULTIPLIER = 2n

export function ResolvePanel({ market, resolution, onResolutionChange }: ResolvePanelProps) {
  const { wallet } = useWalletStore()
  const { executeTransaction } = useAleoTransaction()

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [transactionId, setTransactionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedOutcome, setSelectedOutcome] = useState<number | null>(null)
  const [currentBlock, setCurrentBlock] = useState<bigint>(0n)

  const tokenSymbol = getTokenSymbol(market.tokenType)
  const tokenTypeStr: 'ALEO' | 'USDCX' | 'USAD' = market.tokenType === 'USDCX' ? 'USDCX'
    : market.tokenType === 'USAD' ? 'USAD' : 'ALEO'
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

  // Determine current step
  const currentStep: ResolveStep = useMemo(() => {
    if (market.status === MARKET_STATUS.RESOLVED) return 'done'
    if (market.status === MARKET_STATUS.PENDING_RESOLUTION) {
      // Check if challenge window has passed
      if (resolution && currentBlock > 0n && currentBlock > resolution.challenge_deadline) {
        return 'finalize'
      }
      return 'challenge' // Within challenge window
    }
    if (market.status === MARKET_STATUS.CLOSED) return 'submit'
    return 'close' // ACTIVE but expired
  }, [market.status, resolution, currentBlock])

  const canFinalize = resolution && currentBlock > resolution.challenge_deadline

  // Resolution round info from on-chain data
  const roundInfo = useMemo(() => {
    if (!resolution) return null
    return {
      round: resolution.round || 1,
      proposer: resolution.proposer || resolution.resolver || 'unknown',
      bondAmount: resolution.bond_amount || MIN_RESOLUTION_BOND,
      totalBonded: resolution.total_bonded || MIN_RESOLUTION_BOND,
      proposedOutcome: resolution.proposed_outcome || resolution.winning_outcome,
    }
  }, [resolution])

  // Minimum bond for challenge (2x current)
  const minChallengeBond = roundInfo
    ? BigInt(roundInfo.bondAmount) * BOND_MULTIPLIER
    : MIN_RESOLUTION_BOND * BOND_MULTIPLIER

  // Challenge window countdown
  const challengeInfo = useMemo(() => {
    if (!resolution || currentBlock === 0n) return null
    const blocksLeft = resolution.challenge_deadline - currentBlock
    if (blocksLeft <= 0n) return { text: 'Challenge window ended', canFinalize: true, blocksLeft: 0n }
    const secondsLeft = Number(blocksLeft) * config.secondsPerBlock
    const hours = Math.floor(secondsLeft / 3600)
    const minutes = Math.floor((secondsLeft % 3600) / 60)
    return {
      text: `${hours}h ${minutes}m remaining (${blocksLeft.toString()} blocks)`,
      canFinalize: false,
      blocksLeft,
    }
  }, [resolution, currentBlock])

  // Steps config
  const steps: { key: ResolveStep; label: string; icon: React.ElementType }[] = [
    { key: 'close', label: 'Close', icon: Lock },
    { key: 'submit', label: 'Submit', icon: Gavel },
    { key: 'challenge', label: 'Challenge', icon: Swords },
    { key: 'finalize', label: 'Finalize', icon: CheckCircle2 },
  ]

  const handleCloseMarket = async () => {
    setIsSubmitting(true)
    setError(null)
    try {
      const inputs = buildCloseMarketInputs(market.id)
      const result = await executeTransaction({
        program: getProgramIdForToken(tokenTypeStr),
        function: 'close_market',
        inputs,
        fee: 1.5,
      })
      if (result?.transactionId) {
        setTransactionId(result.transactionId)
        onResolutionChange?.()
      } else {
        throw new Error('No transaction ID returned from wallet')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to close market')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSubmitOutcome = async () => {
    if (!selectedOutcome) return
    setIsSubmitting(true)
    setError(null)
    try {
      // Need a credits record for bond
      const { fetchCreditsRecord } = await import('@/lib/credits-record')
      const bondAmount = Number(MIN_RESOLUTION_BOND)
      const gasBuffer = 500_000
      const record = await fetchCreditsRecord(bondAmount + gasBuffer)
      if (!record) {
        throw new Error(`Need at least ${(bondAmount + gasBuffer) / 1_000_000} ALEO (1 ALEO bond + gas). No credits record found.`)
      }

      const bondNonce = `${Date.now()}field`
      const inputs = [
        ...buildSubmitOutcomeInputs(market.id, selectedOutcome, bondNonce),
        record,
      ]

      const result = await executeTransaction({
        program: getProgramIdForToken(tokenTypeStr),
        function: 'submit_outcome',
        inputs,
        fee: 1.5,
      })
      if (result?.transactionId) {
        setTransactionId(result.transactionId)
        onResolutionChange?.()
      } else {
        throw new Error('No transaction ID returned from wallet')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit outcome')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleChallengeOutcome = async () => {
    if (!selectedOutcome) return
    setIsSubmitting(true)
    setError(null)
    try {
      const bondAmount = minChallengeBond
      const { fetchCreditsRecord } = await import('@/lib/credits-record')
      const gasBuffer = 500_000
      const record = await fetchCreditsRecord(Number(bondAmount) + gasBuffer)
      if (!record) {
        throw new Error(`Need at least ${Number(bondAmount + BigInt(gasBuffer)) / 1_000_000} ALEO (${Number(bondAmount) / 1_000_000} ALEO bond + gas).`)
      }

      const bondNonce = `${Date.now()}field`
      const inputs = [
        ...buildChallengeOutcomeInputs(market.id, selectedOutcome, bondAmount, bondNonce),
        record,
      ]

      const result = await executeTransaction({
        program: getProgramIdForToken(tokenTypeStr),
        function: 'challenge_outcome',
        inputs,
        fee: 1.5,
      })
      if (result?.transactionId) {
        setTransactionId(result.transactionId)
        onResolutionChange?.()
      } else {
        throw new Error('No transaction ID returned from wallet')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to challenge outcome')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleFinalizeOutcome = async () => {
    setIsSubmitting(true)
    setError(null)
    try {
      const inputs = buildFinalizeOutcomeInputs(market.id)
      const result = await executeTransaction({
        program: getProgramIdForToken(tokenTypeStr),
        function: 'finalize_outcome',
        inputs,
        fee: 1.5,
      })
      if (result?.transactionId) {
        setTransactionId(result.transactionId)
        onResolutionChange?.()
      } else {
        throw new Error('No transaction ID returned from wallet')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to finalize outcome')
    } finally {
      setIsSubmitting(false)
    }
  }

  const resetState = () => {
    setTransactionId(null)
    setError(null)
    setSelectedOutcome(null)
    onResolutionChange?.()
  }

  const outcomeColors = [
    'bg-yes-500/10 border-yes-500/30 text-yes-400',
    'bg-no-500/10 border-no-500/30 text-no-400',
    'bg-purple-500/10 border-purple-500/30 text-purple-400',
    'bg-yellow-500/10 border-yellow-500/30 text-yellow-400',
  ]

  return (
    <div className="glass-card overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-white/[0.04]">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center">
            <Gavel className="w-5 h-5 text-brand-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Open Resolution</h3>
            <p className="text-sm text-surface-400">Anyone can resolve with bond</p>
          </div>
        </div>

        {/* Step Progress */}
        <div className="flex items-center gap-1">
          {steps.map((s, idx) => {
            const StepIcon = s.icon
            const stepOrder = ['close', 'submit', 'challenge', 'finalize', 'done']
            const currentIdx = stepOrder.indexOf(currentStep)
            const stepIdx = stepOrder.indexOf(s.key)
            const isComplete = currentStep === 'done' || stepIdx < currentIdx
            const isCurrent = currentStep === s.key || (currentStep === 'challenge' && s.key === 'challenge')
            return (
              <div key={s.key} className="flex items-center gap-1 flex-1">
                <div className={cn(
                  'flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium flex-1',
                  isComplete ? 'bg-yes-500/10 text-yes-400' :
                  isCurrent ? 'bg-brand-500/10 text-brand-400 ring-1 ring-brand-500/30' :
                  'bg-white/[0.02] text-surface-500'
                )}>
                  <StepIcon className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate">{s.label}</span>
                </div>
                {idx < steps.length - 1 && (
                  <ArrowRight className={cn(
                    'w-3 h-3 flex-shrink-0',
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
        {/* Transaction success */}
        {transactionId ? (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
            <div className="w-16 h-16 rounded-full bg-yes-500/20 mx-auto mb-4 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-yes-400" />
            </div>
            <h4 className="text-lg font-semibold text-white mb-2">Transaction Submitted</h4>
            <p className="text-sm text-surface-400 mb-3">Please wait for on-chain confirmation (1-3 minutes).</p>
            <TransactionLink transactionId={transactionId} className="mb-4" showCopy={true} showNote={true} />
            <button onClick={resetState} className="btn-secondary w-full mt-4">Continue</button>
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
              Winners can redeem shares 1:1 for {tokenSymbol}. Bond holders can claim bonds.
            </p>
          </div>
        ) : (
          <>
            {/* Step 1: Close Market */}
            {currentStep === 'close' && (
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 rounded-xl bg-white/[0.02]">
                  <Lock className="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-white">Close Trading</p>
                    <p className="text-xs text-surface-400 mt-1">
                      Stops all trading. Anyone can call this after the deadline.
                    </p>
                  </div>
                </div>

                {currentBlock > 0n && market.deadline > 0n && currentBlock <= market.deadline && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                    <Clock className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-yellow-300">
                      Trading deadline not passed. Block {currentBlock.toString()} / {market.deadline.toString()}.
                    </p>
                  </div>
                )}

                <button onClick={handleCloseMarket} disabled={isSubmitting} className="w-full flex items-center justify-center gap-2 btn-primary">
                  {isSubmitting ? <><Loader2 className="w-5 h-5 animate-spin" /><span>Confirm in Wallet...</span></> : <><Lock className="w-5 h-5" /><span>Close Market</span></>}
                </button>
              </div>
            )}

            {/* Step 2: Submit Outcome (Open Voting + Bond) */}
            {currentStep === 'submit' && (
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 rounded-xl bg-white/[0.02]">
                  <Gavel className="w-5 h-5 text-brand-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-white">Submit Outcome</p>
                    <p className="text-xs text-surface-400 mt-1">
                      Anyone can propose the winning outcome with a <span className="text-white font-medium">1 ALEO bond</span>.
                      A 12-hour challenge window opens after submission.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 p-3 rounded-lg bg-brand-500/5 border border-brand-500/20">
                  <Shield className="w-4 h-4 text-brand-400 flex-shrink-0" />
                  <p className="text-xs text-brand-300">
                    Bond: <span className="font-mono font-medium">1 ALEO</span> (returned if your outcome wins)
                  </p>
                </div>

                {/* Outcome selection */}
                <div>
                  <label className="block text-sm text-surface-400 mb-2">Select Winning Outcome</label>
                  <div className="space-y-2">
                    {outcomeLabels.map((label, i) => {
                      const outcomeNum = i + 1
                      const isSelected = selectedOutcome === outcomeNum
                      const colorIdx = Math.min(i, 3)
                      return (
                        <button key={outcomeNum} onClick={() => setSelectedOutcome(outcomeNum)}
                          className={cn(
                            'w-full p-3 rounded-xl border text-left transition-all flex items-center justify-between',
                            isSelected ? 'bg-brand-500/10 border-brand-500/40 ring-1 ring-brand-500/20' : 'bg-white/[0.02] border-white/[0.06] hover:border-surface-600/50'
                          )}>
                          <span className={cn('px-2 py-0.5 text-xs font-medium rounded-full border', outcomeColors[colorIdx])}>{label}</span>
                          {isSelected && <CheckCircle2 className="w-4 h-4 text-brand-400" />}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <button onClick={handleSubmitOutcome} disabled={isSubmitting || !selectedOutcome}
                  className={cn('w-full flex items-center justify-center gap-2 btn-primary', !selectedOutcome && 'opacity-50 cursor-not-allowed')}>
                  {isSubmitting ? <><Loader2 className="w-5 h-5 animate-spin" /><span>Confirm in Wallet...</span></> : <><Gavel className="w-5 h-5" /><span>{selectedOutcome ? `Submit: ${outcomeLabels[selectedOutcome - 1]} Wins (1 ALEO bond)` : 'Select Outcome'}</span></>}
                </button>
              </div>
            )}

            {/* Step 3: Challenge Window */}
            {currentStep === 'challenge' && (
              <div className="space-y-4">
                {/* Current proposal info */}
                {roundInfo && (
                  <div className="p-4 rounded-xl bg-white/[0.02] space-y-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Swords className="w-4 h-4 text-yellow-400" />
                      <span className="text-sm font-medium text-white">Round {roundInfo.round} — Active Proposal</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-surface-400">Proposed Winner</span>
                      <span className="text-white font-medium">
                        {outcomeLabels[roundInfo.proposedOutcome - 1] || `Outcome ${roundInfo.proposedOutcome}`}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-surface-400">Proposer Bond</span>
                      <span className="text-white font-mono">{Number(roundInfo.bondAmount) / 1_000_000} ALEO</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-surface-400">Total Bonded</span>
                      <span className="text-white font-mono">{Number(roundInfo.totalBonded) / 1_000_000} ALEO</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-surface-400">Challenge Window</span>
                      <span className={cn('font-medium', challengeInfo?.canFinalize ? 'text-yes-400' : 'text-yellow-400')}>
                        {challengeInfo?.text || 'Loading...'}
                      </span>
                    </div>
                  </div>
                )}

                {/* Agree — wait for finalize */}
                <div className="flex items-start gap-2 p-3 rounded-lg bg-yes-500/5 border border-yes-500/20">
                  <CheckCircle2 className="w-4 h-4 text-yes-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-yes-300">
                    Agree with the proposal? No action needed. After {challengeInfo?.blocksLeft?.toString() || '...'} blocks it will be finalized automatically.
                  </p>
                </div>

                {/* Disagree — challenge */}
                <div className="border-t border-white/[0.04] pt-4">
                  <div className="flex items-start gap-3 p-4 rounded-xl bg-no-500/5 border border-no-500/20 mb-4">
                    <Swords className="w-5 h-5 text-no-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-no-300">Disagree? Challenge!</p>
                      <p className="text-xs text-surface-400 mt-1">
                        Submit a different outcome with <span className="text-white font-medium">{Number(minChallengeBond) / 1_000_000} ALEO bond</span> (2x previous).
                        If your outcome wins, you get your bond back + the previous proposer's bond.
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm text-surface-400 mb-2">Select Different Outcome</label>
                    <div className="space-y-2">
                      {outcomeLabels.map((label, i) => {
                        const outcomeNum = i + 1
                        // Cannot select same outcome as current proposal
                        if (roundInfo && outcomeNum === roundInfo.proposedOutcome) return null
                        const isSelected = selectedOutcome === outcomeNum
                        const colorIdx = Math.min(i, 3)
                        return (
                          <button key={outcomeNum} onClick={() => setSelectedOutcome(outcomeNum)}
                            className={cn(
                              'w-full p-3 rounded-xl border text-left transition-all flex items-center justify-between',
                              isSelected ? 'bg-no-500/10 border-no-500/40 ring-1 ring-no-500/20' : 'bg-white/[0.02] border-white/[0.06] hover:border-surface-600/50'
                            )}>
                            <span className={cn('px-2 py-0.5 text-xs font-medium rounded-full border', outcomeColors[colorIdx])}>{label}</span>
                            {isSelected && <CheckCircle2 className="w-4 h-4 text-no-400" />}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <button onClick={handleChallengeOutcome} disabled={isSubmitting || !selectedOutcome}
                    className={cn('w-full flex items-center justify-center gap-2 mt-4', 'bg-no-500/20 hover:bg-no-500/30 text-no-300 font-medium py-3 rounded-xl transition-colors', !selectedOutcome && 'opacity-50 cursor-not-allowed')}>
                    {isSubmitting ? <><Loader2 className="w-5 h-5 animate-spin" /><span>Confirm in Wallet...</span></> : <><Swords className="w-5 h-5" /><span>{selectedOutcome ? `Challenge: ${outcomeLabels[selectedOutcome - 1]} (${Number(minChallengeBond) / 1_000_000} ALEO)` : 'Select Outcome to Challenge'}</span></>}
                  </button>
                </div>
              </div>
            )}

            {/* Step 4: Finalize */}
            {currentStep === 'finalize' && (
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 rounded-xl bg-white/[0.02]">
                  <CheckCircle2 className="w-5 h-5 text-purple-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-white">Finalize Resolution</p>
                    <p className="text-xs text-surface-400 mt-1">
                      Challenge window ended. Anyone can finalize. The resolver earns 20% of protocol fees as reward.
                    </p>
                  </div>
                </div>

                {roundInfo && (
                  <div className="p-4 rounded-xl bg-yes-500/5 border border-yes-500/20 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-surface-400">Final Outcome</span>
                      <span className="text-yes-400 font-medium">
                        {outcomeLabels[roundInfo.proposedOutcome - 1] || `Outcome ${roundInfo.proposedOutcome}`}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-surface-400">Resolution Rounds</span>
                      <span className="text-white">{roundInfo.round}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-surface-400">Total Bonded</span>
                      <span className="text-white font-mono">{Number(roundInfo.totalBonded) / 1_000_000} ALEO</span>
                    </div>
                  </div>
                )}

                <button onClick={handleFinalizeOutcome} disabled={isSubmitting || !canFinalize}
                  className={cn('w-full flex items-center justify-center gap-2 btn-primary', !canFinalize && 'opacity-50 cursor-not-allowed')}>
                  {isSubmitting ? <><Loader2 className="w-5 h-5 animate-spin" /><span>Confirm in Wallet...</span></> : <><CheckCircle2 className="w-5 h-5" /><span>Finalize Resolution</span></>}
                </button>
              </div>
            )}

            {/* Error */}
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
