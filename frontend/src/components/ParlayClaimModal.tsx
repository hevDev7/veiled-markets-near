import { motion, AnimatePresence } from 'framer-motion'
import { X, Trophy, Loader2, Check, AlertCircle, RefreshCw, ShieldAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useParlayStore, type ParlayRecord } from '@/lib/parlay-store'
import { useAleoTransaction } from '@/hooks/useAleoTransaction'
import { cn } from '@/lib/utils'
import { config } from '@/lib/config'
import {
  findParlayTicketRecord,
  formatParlayAmount,
  getShortParlayId,
} from '@/lib/parlay-helpers'
import { TransactionLink } from './TransactionLink'

interface ParlayClaimModalProps {
  parlay: ParlayRecord | null
  isOpen: boolean
  onClose: () => void
}

type ClaimStep = 'review' | 'claiming' | 'success' | 'error'
type TicketLookupState = 'idle' | 'locating' | 'ready' | 'missing' | 'blocked'

export function ParlayClaimModal({ parlay, isOpen, onClose }: ParlayClaimModalProps) {
  const { markParlayClaimed, patchParlay } = useParlayStore()
  const { executeTransaction, pollTransactionStatus } = useAleoTransaction()

  const [step, setStep] = useState<ClaimStep>('review')
  const [error, setError] = useState<string | null>(null)
  const [txId, setTxId] = useState<string | null>(null)
  const [ticketRecord, setTicketRecord] = useState<string | null>(null)
  const [ticketLookupState, setTicketLookupState] = useState<TicketLookupState>('idle')
  const [ticketMessage, setTicketMessage] = useState<string | null>(null)

  const parlayProgramId = config.parlayProgramId || 'veiled_parlay_v1.aleo'

  const getFunctionName = (): string => {
    if (!parlay) return 'redeem_parlay_aleo'
    switch (parlay.tokenType) {
      case 'USDCX':
        return 'redeem_parlay_usdcx'
      case 'USAD':
        return 'redeem_parlay_usad'
      default:
        return 'redeem_parlay_aleo'
    }
  }

  const locateTicket = async (currentParlay: ParlayRecord) => {
    setTicketLookupState('locating')
    setTicketMessage('Searching your wallet records for the private ParlayTicket...')
    setTicketRecord(null)

    try {
      const ticket = await findParlayTicketRecord(currentParlay)
      if (!ticket) {
        setTicketLookupState('missing')
        setTicketMessage(
          'Your private ParlayTicket has not surfaced yet. Shield and the record scanner can take a short moment after placement. Refresh and try again.',
        )
        return
      }

      setTicketRecord(ticket.plaintext)
      patchParlay(currentParlay.id, {
        onChainParlayId: currentParlay.onChainParlayId ?? ticket.parlayId,
        ticketNonce: currentParlay.ticketNonce ?? ticket.ticketNonce,
      })

      if (ticket.potentialPayout <= 0n && currentParlay.potentialPayout > 0n) {
        setTicketLookupState('blocked')
        setTicketMessage(
          'This ticket is present, but its on-chain payout metadata is still zero. Claim is temporarily blocked in the app to avoid sending a zero-payout redemption.',
        )
        return
      }

      setTicketLookupState('ready')
      setTicketMessage('Private ticket located and ready for redemption.')
    } catch (lookupError) {
      setTicketLookupState('missing')
      setTicketMessage(
        lookupError instanceof Error
          ? lookupError.message
          : 'Could not inspect your private ParlayTicket yet.',
      )
    }
  }

  useEffect(() => {
    if (!isOpen || !parlay) {
      setStep('review')
      setError(null)
      setTxId(null)
      setTicketRecord(null)
      setTicketLookupState('idle')
      setTicketMessage(null)
      return
    }

    void locateTicket(parlay)
  }, [isOpen, parlay?.id])

  if (!isOpen || !parlay) return null

  const handleClaim = async () => {
    if (ticketLookupState !== 'ready' || !ticketRecord) {
      setError(ticketMessage || 'Parlay ticket is not ready for redemption yet.')
      setStep('error')
      return
    }

    setStep('claiming')
    setError(null)

    try {
      const result = await executeTransaction({
        program: parlayProgramId,
        function: getFunctionName(),
        inputs: [ticketRecord],
        fee: 1.5,
        recordIndices: [0],
      })
      const submittedTxId = result.transactionId

      if (!submittedTxId) {
        throw new Error('Transaction was not submitted.')
      }

      setTxId(submittedTxId)
      markParlayClaimed(parlay.id)
      setStep('success')

      void pollTransactionStatus(submittedTxId, () => {})
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to claim parlay.')
      setStep('error')
    }
  }

  const handleClose = () => {
    setStep('review')
    setError(null)
    setTxId(null)
    setTicketRecord(null)
    setTicketLookupState('idle')
    setTicketMessage(null)
    onClose()
  }

  const payoutDisplay = formatParlayAmount(parlay.potentialPayout)
  const stakeDisplay = formatParlayAmount(parlay.stake)

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
          className="relative mx-4 w-full max-w-xl overflow-hidden rounded-[28px] border border-white/10 bg-[#10141f] shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
        >
          <div className="border-b border-white/[0.08] bg-gradient-to-r from-emerald-500/12 via-white/[0.02] to-brand-500/10 px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-surface-300">
                  <Trophy className="h-3.5 w-3.5 text-yellow-400" />
                  Claim Center
                </div>
                <h2 className="text-2xl font-semibold text-white">
                  {step === 'success' ? 'Winnings claimed' : 'Redeem your parlay'}
                </h2>
                <p className="text-sm text-surface-400">
                  {parlay.numLegs}-leg ticket · {payoutDisplay} {parlay.tokenType} potential return
                </p>
              </div>
              <button
                onClick={handleClose}
                className="rounded-full border border-white/10 bg-white/5 p-2 text-surface-400 transition-colors hover:text-white"
                aria-label="Close parlay claim modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="space-y-5 px-6 py-6">
            {(step === 'review' || step === 'claiming') && (
              <>
                <div className="rounded-[24px] border border-emerald-500/20 bg-emerald-500/10 p-5 text-center">
                  <p className="text-sm font-medium text-emerald-200">All {parlay.numLegs} legs are marked as winners</p>
                  <p className="mt-2 text-3xl font-semibold text-emerald-300">
                    +{payoutDisplay} {parlay.tokenType}
                  </p>
                  <p className="mt-1 text-xs text-surface-400">
                    From {stakeDisplay} {parlay.tokenType} stake
                  </p>
                </div>

                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-white">Private ticket status</p>
                      <p className="text-xs text-surface-400">
                        Claim needs the exact ParlayTicket record emitted when you placed the parlay.
                      </p>
                    </div>
                    <button
                      onClick={() => void locateTicket(parlay)}
                      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-surface-300 transition-colors hover:bg-white/10 hover:text-white"
                    >
                      <RefreshCw className={cn('h-3.5 w-3.5', ticketLookupState === 'locating' && 'animate-spin')} />
                      Refresh
                    </button>
                  </div>

                  <div className="mt-4 rounded-xl border border-white/[0.06] bg-black/20 p-3">
                    <div className="flex items-start gap-3">
                      {ticketLookupState === 'ready' ? (
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                      ) : ticketLookupState === 'locating' ? (
                        <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-brand-300" />
                      ) : (
                        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                      )}
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-white">
                          {ticketLookupState === 'ready'
                            ? 'Ticket ready'
                            : ticketLookupState === 'locating'
                              ? 'Locating ticket'
                              : ticketLookupState === 'blocked'
                                ? 'Claim temporarily blocked'
                                : 'Ticket not surfaced yet'}
                        </p>
                        {ticketMessage && (
                          <p className="text-xs leading-relaxed text-surface-400">{ticketMessage}</p>
                        )}
                        <div className="flex flex-wrap gap-2 pt-1 text-[11px] text-surface-500">
                          <span className="rounded-full border border-white/[0.08] px-2 py-1">
                            Ticket ID: {getShortParlayId(parlay.onChainParlayId) ?? 'Pending'}
                          </span>
                          {parlay.ticketNonce && (
                            <span className="rounded-full border border-white/[0.08] px-2 py-1">
                              Nonce: {getShortParlayId(parlay.ticketNonce)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
                  <p className="text-sm font-medium text-white">Winning legs</p>
                  {parlay.legs.map((leg, index) => (
                    <div key={`${leg.marketId}-${leg.outcome}`} className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-black/20 px-3 py-3">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs uppercase tracking-[0.18em] text-surface-500">Leg {index + 1}</p>
                        <p className="mt-1 text-sm font-medium text-white">{leg.marketQuestion}</p>
                        <p className="mt-1 text-xs text-surface-400">
                          {leg.outcomeLabel} · {leg.displayOdds.toFixed(2)}x
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={handleClaim}
                  disabled={step === 'claiming' || ticketLookupState !== 'ready'}
                  className={cn(
                    'w-full rounded-2xl py-3.5 text-sm font-semibold transition-colors',
                    step === 'claiming'
                      ? 'cursor-wait bg-white/10 text-surface-500'
                      : ticketLookupState === 'ready'
                        ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                        : 'cursor-not-allowed bg-white/10 text-surface-500',
                  )}
                >
                  {step === 'claiming' ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Redeeming ticket...
                    </span>
                  ) : (
                    `Claim ${payoutDisplay} ${parlay.tokenType}`
                  )}
                </button>
              </>
            )}

            {step === 'success' && (
              <div className="space-y-5 py-2 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-emerald-500/20 bg-emerald-500/15">
                  <Trophy className="h-8 w-8 text-yellow-400" />
                </div>
                <div className="space-y-2">
                  <p className="text-2xl font-semibold text-white">
                    +{payoutDisplay} {parlay.tokenType} claimed
                  </p>
                  <p className="text-sm text-surface-400">
                    Your private payout record is on its way back to the wallet.
                  </p>
                </div>
                {txId && <TransactionLink transactionId={txId} />}
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
                  <p className="text-2xl font-semibold text-white">Claim failed</p>
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
                    Back to Review
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
