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
import { cn } from '@/lib/utils'
import {
  checkParlayPlacement,
  describeParlayFundingSource,
  floorToCents,
  formatParlayAmount,
  getParlayFundingRoute,
} from '@/lib/parlay-helpers'
import { placeParlay, quoteParlay } from '@/lib/near/parlay'
import { tokenOfType } from '@/lib/near/programs'
import { tokenLabel } from '@/lib/near/config'
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
    setSlipLegOdds,
    validationError,
  } = useParlayStore()
  const { wallet } = useWalletStore()

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

  useEffect(() => {
    isModalOpenRef.current = isOpen
  }, [isOpen])

  // NEAR: refresh the slip with the contract's live leg odds whenever the modal opens or the stake changes, so the
  // odds and payout shown are exactly what parlay_buy will give (the pools move with every trade).
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [maxStake, setMaxStake] = useState<bigint | null>(null)
  const legKey = slipLegs.map((l) => `${l.marketId}:${l.outcome}`).join(',')
  useEffect(() => {
    if (!isOpen || step !== 'review' || slipLegs.length < 2) return
    let cancelled = false
    const stake = slipStake > 0n ? slipStake : 1_000_000n
    quoteParlay(tokenOfType(slipTokenType), stake, slipLegs)
      .then((q) => {
        if (cancelled) return
        setQuoteError(null)
        setMaxStake(BigInt(q.max_stake))
        setSlipLegOdds(q.leg_odds_bps.map((x) => BigInt(x)))
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setMaxStake(null)
        setQuoteError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [isOpen, step, legKey, slipStake, slipTokenType])

  const handleConfirm = async () => {
    setStep('submitting')
    setError(null)
    setRouteNote(null)

    try {
      const walletAddress = wallet.address
      if (!wallet.connected || !walletAddress) {
        throw new Error('Connect your wallet before placing a parlay.')
      }
      const currentValidationError = validationError()
      if (currentValidationError) {
        throw new Error(currentValidationError)
      }
      if (fundingRoute.privateBalance + fundingRoute.publicBalance < slipStake) {
        throw new Error(
          `Not enough ${tokenLabel(slipTokenType)}: ${formatParlayAmount(fundingRoute.privateBalance)} private + `
          + `${formatParlayAmount(fundingRoute.publicBalance)} in the wallet.`,
        )
      }

      // Exact contract quote at submit time, checked before placing (which may first ask the wallet for a deposit);
      // the bet accepts up to 2% worse in case a trade lands first.
      const token = tokenOfType(slipTokenType)
      const quote = await checkParlayPlacement({ tokenType: slipTokenType, stake: slipStake, legs: slipLegs })
      const gross = BigInt(quote.potential_payout)
      setSlipLegOdds(quote.leg_odds_bps.map((x) => BigInt(x)))

      const legsAtSubmit = useParlayStore.getState().slipLegs.map((l) => ({ ...l }))
      const placed = await placeParlay({
        token,
        stake: slipStake,
        legs: legsAtSubmit,
        minPayout: (gross * 98n) / 100n,
      })
      const fee = (placed.grossPayout * 200n) / 10000n

      const parlayRecord: ParlayRecord = {
        id: placed.parlayId,
        onChainParlayId: placed.parlayId,
        fundingSource: 'private',
        ownerAddress: walletAddress,
        legs: legsAtSubmit,
        numLegs: legsAtSubmit.length,
        stake: slipStake,
        potentialPayout: placed.grossPayout - fee,
        grossPayout: placed.grossPayout,
        tokenType: slipTokenType,
        status: 'active',
        createdAt: Date.now(),
        txId: placed.txHash,
      }
      addParlay(parlayRecord)
      setSavedParlay(parlayRecord)
      setFundingSourceUsed('private')
      setTxId(placed.txHash)
      setConfirmationStatus('confirmed')
      setRouteNote('Placed privately through the relayer: your account does not appear in the transaction. Track it in My Parlays.')
      setStep('success')
    } catch (err: unknown) {
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
                      {formatParlayAmount(slipStake)} {tokenLabel(slipTokenType)}
                    </p>
                    {maxStake !== null && (
                      <p className="mt-1 text-xs text-surface-500">
                        Max {formatParlayAmount(floorToCents(maxStake))} now
                      </p>
                    )}
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
                      {formatParlayAmount(payout.net)} {tokenLabel(slipTokenType)}
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-white">Funding route</p>
                      <p className="text-xs text-surface-400">
                        The stake comes from your private balance. If it is short, your wallet first deposits the
                        difference; the bet itself is proven in this browser and sent by the relayer.
                      </p>
                      {quoteError && (
                        <p className="mt-2 text-xs text-amber-300">{quoteError}</p>
                      )}
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
                        {formatParlayAmount(fundingRoute.privateBalance)} {tokenLabel(slipTokenType)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-surface-500">Public</p>
                      <p className="mt-2 flex items-center gap-2 text-base font-semibold text-white">
                        <Coins className="h-4 w-4 text-emerald-400" />
                        {formatParlayAmount(fundingRoute.publicBalance)} {tokenLabel(slipTokenType)}
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
                    <span className="text-white">{formatParlayAmount(payout.gross)} {tokenLabel(slipTokenType)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="text-surface-400">Protocol fee</span>
                    <span className="text-surface-300">-{formatParlayAmount(payout.fee, 4)} {tokenLabel(slipTokenType)}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-white/[0.08] pt-3 text-sm">
                    <span className="font-medium text-surface-300">Net payout if every leg wins</span>
                    <span className="text-lg font-semibold text-emerald-300">
                      {formatParlayAmount(payout.net)} {tokenLabel(slipTokenType)}
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
