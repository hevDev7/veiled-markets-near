import { motion, AnimatePresence } from 'framer-motion'
import { X, Ticket, Shield, Loader2, Check, AlertCircle, Coins, Layers3 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  useParlayStore,
  calculateCombinedOdds,
  calculateParlayPayout,
  oddsBpsToDisplay,
  oddsBpsToImpliedProbability,
  type ParlayRecord,
} from '@/lib/parlay-store'
import { useWalletStore } from '@/lib/store'
import { useAleoTransaction } from '@/hooks/useAleoTransaction'
import { cn } from '@/lib/utils'
import { fetchCreditsRecord, releaseCreditsRecord, reserveCreditsRecord } from '@/lib/credits-record'
import { buildMerkleProofsForAddress } from '@/lib/aleo-client'
import { findTokenRecord, releaseTokenRecord, reserveTokenRecord } from '@/lib/private-stablecoin'
import { config } from '@/lib/config'
import {
  buildParlayLegInputs,
  computeParlayOnChainId,
  createParlayTicketNonce,
  describeParlayFundingSource,
  formatParlayAmount,
  getParlayCreateFunctionName,
  getParlayCreateReadiness,
  getParlayExplorerTransactionId,
  getParlayFundingRoute,
} from '@/lib/parlay-helpers'
import { TransactionLink } from './TransactionLink'

interface ParlayConfirmModalProps {
  isOpen: boolean
  onClose: () => void
}

type ConfirmStep = 'review' | 'submitting' | 'success' | 'error'

function getLegRiskHint(oddsBps: bigint): { label: string; tone: string; impliedProbability: number } | null {
  const impliedProbability = oddsBpsToImpliedProbability(oddsBps)
  if (impliedProbability <= 5) {
    return {
      label: 'High-risk longshot',
      tone: 'border-amber-500/20 bg-amber-500/10 text-amber-200',
      impliedProbability,
    }
  }
  if (impliedProbability <= 12) {
    return {
      label: 'Low-probability leg',
      tone: 'border-yellow-500/20 bg-yellow-500/10 text-yellow-200',
      impliedProbability,
    }
  }
  return null
}

export function ParlayConfirmModal({ isOpen, onClose }: ParlayConfirmModalProps) {
  const {
    slipLegs,
    slipStake,
    slipTokenType,
    addParlay,
    validationError,
  } = useParlayStore()
  const { wallet } = useWalletStore()
  const { executeTransaction, pollTransactionStatus } = useAleoTransaction()

  const [step, setStep] = useState<ConfirmStep>('review')
  const [error, setError] = useState<string | null>(null)
  const [txId, setTxId] = useState<string | null>(null)
  const [fundingSourceUsed, setFundingSourceUsed] = useState<'private' | 'public' | null>(null)
  const [routeNote, setRouteNote] = useState<string | null>(null)
  const [savedParlay, setSavedParlay] = useState<ParlayRecord | null>(null)
  const [confirmationStatus, setConfirmationStatus] = useState<'pending' | 'confirmed' | 'rejected'>('pending')
  const isModalOpenRef = useRef(isOpen)

  const combinedOdds = useMemo(() => calculateCombinedOdds(slipLegs), [slipLegs])
  const payout = useMemo(
    () => calculateParlayPayout(slipStake, combinedOdds),
    [slipStake, combinedOdds],
  )
  const fundingRoute = useMemo(
    () => getParlayFundingRoute(wallet.balance, slipTokenType, slipStake),
    [wallet.balance, slipTokenType, slipStake],
  )

  const parlayProgramId = config.parlayProgramId || 'veiled_parlay_v3.aleo'

  useEffect(() => {
    isModalOpenRef.current = isOpen
  }, [isOpen])

  const handleConfirm = async () => {
    setStep('submitting')
    setError(null)
    setRouteNote(null)
    let releaseSelectedRecord: (() => void) | undefined

    try {
      const feeInMicro = 1_500_000n
      const walletAddress = wallet.address
      if (!wallet.connected || !walletAddress) {
        throw new Error('Connect your wallet before placing a parlay.')
      }
      if (!wallet.isDemoMode && wallet.balance.public < feeInMicro) {
        throw new Error('Insufficient public ALEO for transaction fee. Gas fees are always paid in public ALEO.')
      }
      const currentValidationError = validationError()
      if (currentValidationError) {
        throw new Error(currentValidationError)
      }
      if (slipLegs.length < 2) {
        throw new Error('Add at least two legs to place a parlay.')
      }
      if (slipStake <= 0n) {
        throw new Error('Enter a stake amount before continuing.')
      }

      const ticketNonce = createParlayTicketNonce()
      const legInputs = buildParlayLegInputs(slipLegs)
      const onChainParlayId = await computeParlayOnChainId({
        owner: walletAddress,
        legs: slipLegs,
        numLegs: slipLegs.length,
        stake: slipStake,
        tokenType: slipTokenType,
        ticketNonce,
      })

      let fundingSource: 'private' | 'public' | null = fundingRoute.recommendedSource
      if (!fundingSource) {
        throw new Error(
          `Parlay placement currently requires a private ${slipTokenType} balance. `
          + `Available private balance: ${formatParlayAmount(fundingRoute.privateBalance)} ${slipTokenType}.`,
        )
      }

      const readiness = await getParlayCreateReadiness({
        tokenType: slipTokenType,
        stake: slipStake,
        combinedOddsBps: combinedOdds,
        grossPayout: payout.gross,
      })
      if (!readiness.canCreate) {
        throw new Error(readiness.reason ?? 'Parlay is not ready for on-chain submission.')
      }

      const functionName = getParlayCreateFunctionName(slipTokenType)
      let inputs: string[] = []
      let recordIndices: number[] | undefined

      const buildPrivateInputs = async () => {
        if (slipTokenType === 'ALEO') {
          const creditsRecord = await fetchCreditsRecord(Number(slipStake), walletAddress)
          if (!creditsRecord) {
            throw new Error('No private ALEO record with sufficient balance was found.')
          }

          reserveCreditsRecord(creditsRecord)
          releaseSelectedRecord = () => releaseCreditsRecord(creditsRecord)
          inputs = [
            creditsRecord,
            ticketNonce,
            `${slipLegs.length}u8`,
            `${slipStake}u128`,
            ...legInputs,
          ]
          recordIndices = [0]
          return
        }

        const tokenRecord = await findTokenRecord(slipTokenType, slipStake)
        if (!tokenRecord) {
          throw new Error(`No private ${slipTokenType} token record with sufficient balance was found.`)
        }

        reserveTokenRecord(slipTokenType, tokenRecord)
        releaseSelectedRecord = () => releaseTokenRecord(slipTokenType, tokenRecord)
        const merkleProofs = await buildMerkleProofsForAddress(walletAddress)
        inputs = [
          tokenRecord,
          merkleProofs,
          ticketNonce,
          `${slipLegs.length}u8`,
          `${slipStake}u128`,
          ...legInputs,
        ]
        recordIndices = [0]
      }

      await buildPrivateInputs()

      console.log('[Parlay] Transaction submission:', {
        program: parlayProgramId,
        function: functionName,
        inputCount: inputs.length,
        inputs: inputs.map((inp, i) => `[${i}] ${inp.length > 80 ? inp.slice(0, 80) + '...' : inp}`),
        recordIndices,
        readiness: {
          pool: formatParlayAmount(readiness.pool),
          exposure: formatParlayAmount(readiness.exposure),
          available: formatParlayAmount(readiness.availableBacking),
          required: formatParlayAmount(readiness.requiredBacking),
        },
      })

      const result = await executeTransaction({
        program: parlayProgramId,
        function: functionName,
        inputs,
        fee: 1.5,
        recordIndices,
      })
      const submittedTxId = result.transactionId

      if (!submittedTxId) {
        throw new Error('Transaction was not submitted.')
      }

      const explorerReadyTxId = getParlayExplorerTransactionId(submittedTxId)

      const parlayRecord: ParlayRecord = {
        id: onChainParlayId ?? submittedTxId,
        onChainParlayId: onChainParlayId ?? undefined,
        ticketNonce,
        fundingSource,
        ownerAddress: walletAddress,
        legs: [...slipLegs],
        numLegs: slipLegs.length,
        stake: slipStake,
        potentialPayout: payout.net,
        tokenType: slipTokenType,
        status: 'active',
        createdAt: Date.now(),
        txId: explorerReadyTxId ?? undefined,
      }

      setSavedParlay(parlayRecord)
      setFundingSourceUsed(fundingSource)
      setTxId(explorerReadyTxId)
      setRouteNote(
        explorerReadyTxId
          ? 'This transaction will appear in My Parlays only after it is confirmed on-chain. Rejected submissions are not saved.'
          : 'Wallet returned a temporary submission ID. The explorer link will appear after the on-chain transaction ID is resolved.',
      )
      setStep('success')
      setConfirmationStatus('pending')

      void pollTransactionStatus(submittedTxId, (status, resolvedTxId) => {
        const confirmedExplorerTxId =
          getParlayExplorerTransactionId(resolvedTxId)
          || explorerReadyTxId

        if (status === 'confirmed') {
          const confirmedParlay: ParlayRecord = {
            ...parlayRecord,
            txId: confirmedExplorerTxId ?? undefined,
          }
          addParlay(confirmedParlay)
          if (isModalOpenRef.current) {
            setSavedParlay(confirmedParlay)
            setTxId(confirmedExplorerTxId)
            setConfirmationStatus('confirmed')
            setRouteNote(
              confirmedExplorerTxId
                ? 'Transaction confirmed on-chain and added to My Parlays.'
                : 'Transaction confirmed and added to My Parlays, but explorer link is waiting for the on-chain transaction ID to be exposed by the wallet.',
            )
          }
          return
        }
        if (status === 'failed') {
          releaseSelectedRecord?.()
          if (isModalOpenRef.current) {
            setConfirmationStatus('rejected')
            setError('Transaction was rejected on-chain and was not added to My Parlays.')
            setStep('error')
          }
        }
      })
    } catch (err: unknown) {
      releaseSelectedRecord?.()
      const message = err instanceof Error ? err.message : 'Failed to place parlay.'
      setError(message)
      setStep('error')
    }
  }

  const handleClose = () => {
    setStep('review')
    setError(null)
    setTxId(null)
    setFundingSourceUsed(null)
    setRouteNote(null)
    setSavedParlay(null)
    setConfirmationStatus('pending')
    onClose()
  }

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/[0.7] backdrop-blur-sm"
        onClick={handleClose}
      >
        <motion.div
          initial={{ y: 20, opacity: 0, scale: 0.96 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 20, opacity: 0, scale: 0.96 }}
          onClick={(event) => event.stopPropagation()}
          className="relative mx-4 w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[#10141f] shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
        >
          <div className="shrink-0 border-b border-white/[0.08] bg-gradient-to-r from-brand-500/12 via-white/[0.02] to-emerald-500/10 px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-surface-300">
                  <Ticket className="h-3.5 w-3.5 text-brand-400" />
                  {step === 'success'
                    ? (confirmationStatus === 'confirmed' ? 'Confirmed' : 'Parlay Submitted')
                    : 'Parlay Checkout'}
                </div>
                <h2 className="text-2xl font-semibold text-white">
                  {step === 'success'
                    ? (confirmationStatus === 'confirmed' ? 'Parlay confirmed!' : 'Pending confirmation...')
                    : 'Review your parlay'}
                </h2>
                <p className="text-sm text-surface-400">
                  {slipLegs.length}-leg slip · {describeParlayFundingSource(fundingSourceUsed ?? fundingRoute.recommendedSource ?? undefined)}
                </p>
              </div>
              <button
                onClick={handleClose}
                className="rounded-full border border-white/10 bg-white/5 p-2 text-surface-400 transition-colors hover:text-white"
                aria-label="Close parlay confirmation"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="space-y-5 px-6 py-6 overflow-y-auto flex-1 min-h-0">
            {(step === 'review' || step === 'submitting') && (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-surface-500">Stake</p>
                    <p className="mt-2 text-xl font-semibold text-white">
                      {formatParlayAmount(slipStake)} {slipTokenType}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-surface-500">Combined Odds</p>
                    <p className="mt-2 text-xl font-semibold text-brand-400">
                      {oddsBpsToDisplay(combinedOdds).toFixed(2)}x
                    </p>
                  </div>
                  <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-emerald-300/80">Net Payout</p>
                    <p className="mt-2 text-xl font-semibold text-emerald-300">
                      {formatParlayAmount(payout.net)} {slipTokenType}
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-white">Funding route</p>
                      <p className="text-xs text-surface-400">
                        Parlay placement now uses private records only, so the ticket can stay aligned with the lean core contract.
                      </p>
                    </div>
                    <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-surface-300">
                      {describeParlayFundingSource(fundingRoute.recommendedSource ?? undefined)}
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-surface-500">Private</p>
                      <p className="mt-2 flex items-center gap-2 text-base font-semibold text-white">
                        <Shield className="h-4 w-4 text-brand-400" />
                        {formatParlayAmount(fundingRoute.privateBalance)} {slipTokenType}
                      </p>
                    </div>
                    <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-surface-500">Public</p>
                      <p className="mt-2 flex items-center gap-2 text-base font-semibold text-white">
                        <Coins className="h-4 w-4 text-emerald-400" />
                        {formatParlayAmount(fundingRoute.publicBalance)} {slipTokenType}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
                  <div className="flex items-center gap-2">
                    <Layers3 className="h-4 w-4 text-brand-400" />
                    <p className="text-sm font-medium text-white">Leg review</p>
                  </div>
                  <div className="space-y-2">
                    {slipLegs.map((leg, index) => (
                      (() => {
                        const riskHint = getLegRiskHint(leg.oddsBps)
                        return (
                          <div
                            key={`${leg.marketId}-${leg.outcome}`}
                            className="rounded-xl border border-white/[0.06] bg-black/20 px-3 py-3"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 space-y-1">
                                <p className="text-xs uppercase tracking-[0.18em] text-surface-500">
                                  Leg {index + 1} · {leg.marketTokenType}
                                </p>
                                <p className="text-sm font-medium text-white">{leg.marketQuestion}</p>
                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                  <span className="rounded-full border border-brand-500/20 bg-brand-500/10 px-2 py-1 text-brand-300">
                                    {leg.outcomeLabel}
                                  </span>
                                  {riskHint && (
                                    <span className={cn('rounded-full border px-2 py-1', riskHint.tone)}>
                                      {riskHint.label}
                                    </span>
                                  )}
                                </div>
                                {riskHint && (
                                  <p className="text-xs text-amber-200/80">
                                    Implied probability {riskHint.impliedProbability.toFixed(2)}%
                                  </p>
                                )}
                              </div>
                              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-sm font-semibold text-brand-300">
                                {leg.displayOdds.toFixed(2)}x
                              </span>
                            </div>
                          </div>
                        )
                      })()
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-surface-400">Gross payout</span>
                    <span className="text-white">{formatParlayAmount(payout.gross)} {slipTokenType}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="text-surface-400">Protocol fee</span>
                    <span className="text-surface-300">-{formatParlayAmount(payout.fee, 4)} {slipTokenType}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-white/[0.08] pt-3 text-sm">
                    <span className="font-medium text-surface-300">Net payout if every leg wins</span>
                    <span className="text-lg font-semibold text-emerald-300">
                      {formatParlayAmount(payout.net)} {slipTokenType}
                    </span>
                  </div>
                </div>

                <div className="rounded-2xl border border-brand-500/15 bg-brand-500/10 px-4 py-3 text-sm text-brand-200">
                  <div className="flex items-start gap-3">
                    <Shield className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="space-y-1">
                      <p className="font-medium text-brand-100">Private ticket receipt</p>
                      <p className="text-xs leading-relaxed text-brand-200/85">
                        The placement creates a private ParlayTicket record. It can take a short moment for Shield or the record scanner to surface it after confirmation.
                      </p>
                    </div>
                  </div>
                </div>

                {routeNote && (
                  <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                    {routeNote}
                  </div>
                )}

                <button
                  onClick={handleConfirm}
                  disabled={step === 'submitting'}
                  className={cn(
                    'w-full rounded-2xl py-3.5 text-sm font-semibold transition-colors',
                    step === 'submitting'
                      ? 'cursor-wait bg-white/10 text-surface-500'
                      : 'bg-brand-500 text-white hover:bg-brand-600',
                  )}
                >
                  {step === 'submitting' ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Placing parlay...
                    </span>
                  ) : (
                    `Place ${slipLegs.length}-leg parlay`
                  )}
                </button>
              </>
            )}

            {step === 'success' && savedParlay && (
              <div className="space-y-5 py-2">
                <div className={cn(
                  'mx-auto flex h-16 w-16 items-center justify-center rounded-full border',
                  confirmationStatus === 'confirmed'
                    ? 'border-emerald-500/20 bg-emerald-500/15'
                    : 'border-amber-500/20 bg-amber-500/15',
                )}>
                  {confirmationStatus === 'confirmed' ? (
                    <Check className="h-8 w-8 text-emerald-300" />
                  ) : (
                    <Loader2 className="h-8 w-8 text-amber-300 animate-spin" />
                  )}
                </div>
                <div className="text-center">
                  <p className="text-2xl font-semibold text-white">
                    {confirmationStatus === 'confirmed' ? 'Transaction confirmed' : 'Pending confirmation'}
                  </p>
                  <p className="mt-2 text-sm text-surface-400">
                    {confirmationStatus === 'confirmed'
                      ? `${savedParlay.numLegs} legs · ${formatParlayAmount(savedParlay.stake)} ${savedParlay.tokenType} · ${describeParlayFundingSource(savedParlay.fundingSource)}`
                      : 'Waiting for the transaction to be accepted on-chain. This may take a few moments.'}
                  </p>
                  {confirmationStatus === 'pending' && (
                    <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-300">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Shield Wallet — awaiting block confirmation
                    </div>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-surface-500">Potential payout</p>
                    <p className="mt-2 text-xl font-semibold text-emerald-300">
                      {formatParlayAmount(savedParlay.potentialPayout)} {savedParlay.tokenType}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-surface-500">Ticket id</p>
                    <p className="mt-2 break-all text-sm font-medium text-white">
                      {savedParlay.onChainParlayId ?? 'Pending scanner sync'}
                    </p>
                  </div>
                </div>

                {txId && <TransactionLink transactionId={txId} />}

                {!txId && (
                  <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-surface-300">
                    Explorer link belum tersedia. Wallet mengembalikan submission ID sementara, dan tx on-chain akan muncul setelah resolve ke format `at1...`.
                  </div>
                )}

                {routeNote && (
                  <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-surface-300">
                    {routeNote}
                  </div>
                )}

                <button
                  onClick={handleClose}
                  className="w-full rounded-2xl bg-white/[0.08] py-3 text-sm font-semibold text-white transition-colors hover:bg-white/[0.12]"
                >
                  Done
                </button>
              </div>
            )}

            {step === 'error' && (
              <div className="space-y-5 py-2 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-red-500/20 bg-red-500/15">
                  <AlertCircle className="h-8 w-8 text-red-300" />
                </div>
                <div className="space-y-2">
                  <p className="text-2xl font-semibold text-white">Parlay placement failed</p>
                  <p className="text-sm leading-relaxed text-red-300">{error}</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    onClick={() => {
                      setStep('review')
                      setError(null)
                    }}
                    className="rounded-2xl bg-brand-500 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
                  >
                    Review Again
                  </button>
                  <button
                    onClick={handleClose}
                    className="rounded-2xl bg-white/[0.08] py-3 text-sm font-semibold text-surface-300 transition-colors hover:bg-white/[0.12]"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
