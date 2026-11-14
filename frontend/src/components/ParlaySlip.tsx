import { motion, AnimatePresence } from 'framer-motion'
import { X, Trash2, Ticket, AlertCircle, Shield, Coins, Layers3, ChevronRight } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  useParlayStore,
  oddsBpsToDisplay,
  oddsBpsToImpliedProbability,
  calculateCombinedOdds,
  calculateParlayPayout,
  slipLegBlockers,
  type ParlayTokenType,
} from '@/lib/parlay-store'
import { useRealMarketsStore } from '@/lib/market-store'
import { useWalletStore } from '@/lib/store'
import {
  describeParlayFundingSource,
  floorToCents,
  formatParlayAmount,
  getParlayFundingRoute,
  getParlayStakeLimits,
  parlayStakeLimitError,
  type ParlayStakeLimits,
} from '@/lib/parlay-helpers'
import { cn, getTokenSymbol } from '@/lib/utils'
import { ENABLED_TOKEN_KEYS } from '@/lib/near/config'
import { ContractRefusal } from '@/lib/near/relayer'
import { ParlayConfirmModal } from './ParlayConfirmModal'

const TOKEN_OPTIONS: ParlayTokenType[] = [...ENABLED_TOKEN_KEYS]

const QUICK_STAKES = [
  { label: '0.5', value: 500_000n },
  { label: '1', value: 1_000_000n },
  { label: '5', value: 5_000_000n },
  { label: '10', value: 10_000_000n },
]

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

export function ParlaySlip() {
  const {
    slipLegs,
    slipStake,
    slipTokenType,
    slipOpen,
    removeLeg,
    clearSlip,
    setSlipStake,
    setSlipTokenType,
    closeSlip,
    toggleSlip,
    validationError,
  } = useParlayStore()

  const { wallet } = useWalletStore()
  const [stakeInput, setStakeInput] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)

  const combinedOdds = useMemo(() => calculateCombinedOdds(slipLegs), [slipLegs])
  const combinedDisplay = oddsBpsToDisplay(combinedOdds)
  const payout = useMemo(
    () => calculateParlayPayout(slipStake, combinedOdds),
    [slipStake, combinedOdds],
  )
  const fundingRoute = useMemo(
    () => getParlayFundingRoute(wallet.balance, slipTokenType, slipStake),
    [wallet.balance, slipTokenType, slipStake],
  )

  useEffect(() => {
    if (slipStake <= 0n) {
      setStakeInput('')
      return
    }

    setStakeInput(formatParlayAmount(slipStake, slipStake % 1_000_000n === 0n ? 0 : 2))
  }, [slipStake])

  // NEAR: what the contract lets these legs take (largest stake, minimum, pool), read again when the legs or the stake
  // token change. A ticket may pay only a share of its thinnest market's pool, so the slip shows the limit up front.
  // Only the contract refusing the legs holds checkout; a view the RPC did not answer is a note (checkout asks again).
  const [limits, setLimits] = useState<ParlayStakeLimits | null>(null)
  const [limitsError, setLimitsError] = useState<string | null>(null)
  const [limitsUnread, setLimitsUnread] = useState(false)
  const [limitsAttempt, setLimitsAttempt] = useState(0)
  const legKey = slipLegs.map((l) => `${l.marketId}:${l.outcome}`).join(',')
  useEffect(() => {
    setLimits(null)
    setLimitsError(null)
    setLimitsUnread(false)
    if (!slipOpen || slipLegs.length < 2) return
    let cancelled = false
    getParlayStakeLimits(slipTokenType, slipLegs)
      .then((l) => {
        if (!cancelled) setLimits(l)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        if (e instanceof ContractRefusal) setLimitsError(e.message)
        else setLimitsUnread(true)
      })
    return () => {
      cancelled = true
    }
  }, [slipOpen, legKey, slipTokenType, limitsAttempt])

  // A slip kept from an earlier visit can hold legs on markets that closed or lost their approval since: name them.
  // Once the contract has quoted the legs it accepted every one, so a stale market list cannot hold the slip.
  const markets = useRealMarketsStore((s) => s.markets)
  useEffect(() => {
    if (slipOpen && slipLegs.length > 0 && useRealMarketsStore.getState().markets.length === 0) {
      void useRealMarketsStore.getState().fetchMarkets()
    }
  }, [slipOpen])
  const legBlockers = useMemo<Record<string, string>>(
    () => (limits ? {} : slipLegBlockers(slipLegs, markets)),
    [limits, slipLegs, markets],
  )
  const blockedLegCount = Object.keys(legBlockers).length

  const handleStakeChange = (value: string) => {
    setStakeInput(value)
    const num = parseFloat(value)
    if (!Number.isNaN(num) && num > 0) {
      setSlipStake(BigInt(Math.round(num * 1_000_000)))
    } else {
      setSlipStake(0n)
    }
  }

  const handleQuickStake = (amount: bigint) => {
    setSlipStake(amount)
    setStakeInput(formatParlayAmount(amount, amount % 1_000_000n === 0n ? 0 : 2))
  }

  const balanceError = useMemo(() => {
    if (slipStake <= 0n) return null
    if (fundingRoute.recommendedSource) return null

    const sym = getTokenSymbol(slipTokenType)
    return `Not enough ${sym} for this stake: ${formatParlayAmount(fundingRoute.privateBalance)} ${sym} private `
      + `and ${formatParlayAmount(fundingRoute.publicBalance)} ${sym} in your wallet. Placing tops up the private `
      + `balance from the wallet when needed.`
  }, [fundingRoute, slipStake, slipTokenType])

  const validationMessage = validationError()
  const legMessage = blockedLegCount === 0
    ? null
    : blockedLegCount === 1
      ? 'Remove the leg marked above: its market cannot be in a parlay now.'
      : `Remove the ${blockedLegCount} legs marked above: their markets cannot be in a parlay now.`
  const limitMessage = limitsError ?? (limits ? parlayStakeLimitError(slipStake, limits, slipTokenType) : null)
  const error = legMessage ?? limitMessage ?? balanceError ?? validationMessage
  const canContinue = wallet.connected && !error

  if (slipLegs.length === 0 && !slipOpen) return null

  return (
    <AnimatePresence>
      {slipLegs.length > 0 && (
        <>
          {!slipOpen && (
            <motion.button
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              onClick={toggleSlip}
              className="fixed bottom-6 right-6 z-50 overflow-hidden rounded-2xl border border-brand-500/30 bg-[#121726] px-4 py-3 text-left shadow-[0_18px_50px_rgba(0,0,0,0.35)] transition-colors hover:border-brand-400/50"
            >
                <div className="absolute inset-0 bg-gradient-to-r from-brand-500/10 via-white/[0.01] to-emerald-500/10" />
              <div className="relative flex items-center gap-3">
                <div className="rounded-xl border border-brand-500/20 bg-brand-500/15 p-2 text-brand-300">
                  <Ticket className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Parlay Slip</p>
                  <p className="text-xs text-surface-400">
                    {slipLegs.length} leg{slipLegs.length !== 1 ? 's' : ''} · {combinedDisplay > 0 ? `${combinedDisplay.toFixed(2)}x` : 'Add one more leg'}
                  </p>
                </div>
                <div className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-xs font-semibold text-white">
                  {slipLegs.length}
                </div>
              </div>
            </motion.button>
          )}

          {slipOpen && (
            <>
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={closeSlip}
                className="fixed inset-0 z-40 bg-black/[0.55] backdrop-blur-[2px]"
                aria-label="Close parlay slip"
              />

              <motion.aside
                initial={{ x: 420, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 420, opacity: 0 }}
                transition={{ type: 'spring', damping: 28, stiffness: 220 }}
                className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[420px] flex-col border-l border-white/10 bg-[#0f1420] shadow-[0_28px_90px_rgba(0,0,0,0.5)]"
              >
                <div className="border-b border-white/[0.08] bg-gradient-to-r from-brand-500/12 via-white/[0.01] to-emerald-500/10 px-5 py-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-surface-300">
                        <Ticket className="h-3.5 w-3.5 text-brand-400" />
                        Multi-leg parlay
                      </div>
                      <h3 className="text-2xl font-semibold text-white">Build your slip</h3>
                      <p className="text-sm text-surface-400">
                        {slipLegs.length} leg{slipLegs.length !== 1 ? 's' : ''} · {describeParlayFundingSource(fundingRoute.recommendedSource ?? undefined)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={clearSlip}
                        className="rounded-full border border-white/10 bg-white/5 p-2 text-surface-400 transition-colors hover:text-red-300"
                        title="Clear parlay slip"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={closeSlip}
                        className="rounded-full border border-white/10 bg-white/5 p-2 text-surface-400 transition-colors hover:text-white"
                        aria-label="Close parlay slip"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="border-b border-white/[0.08] px-5 py-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-surface-500">Combined Odds</p>
                      <p className="mt-2 text-xl font-semibold text-brand-400">
                        {combinedDisplay > 0 ? `${combinedDisplay.toFixed(2)}x` : '—'}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-surface-500">Stake</p>
                      <p className="mt-2 text-xl font-semibold text-white">
                        {slipStake > 0n ? `${formatParlayAmount(slipStake)} ${getTokenSymbol(slipTokenType)}` : '—'}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-emerald-300/80">Potential</p>
                      <p className="mt-2 text-xl font-semibold text-emerald-300">
                        {slipStake > 0n ? `${formatParlayAmount(payout.net)} ${getTokenSymbol(slipTokenType)}` : '—'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Layers3 className="h-4 w-4 text-brand-400" />
                      <p className="text-sm font-medium text-white">Selected legs</p>
                    </div>
                    <AnimatePresence mode="popLayout">
                      {slipLegs.map((leg, index) => (
                        (() => {
                          const riskHint = getLegRiskHint(leg.oddsBps)
                          return (
                            <motion.div
                              key={`${leg.marketId}-${leg.outcome}`}
                              layout
                              initial={{ opacity: 0, y: -8 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, x: 80 }}
                              className={cn(
                                'rounded-2xl border bg-white/[0.03] p-4',
                                legBlockers[leg.marketId] ? 'border-red-500/30' : 'border-white/[0.08]',
                              )}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 space-y-2">
                                  <p className="text-xs uppercase tracking-[0.18em] text-surface-500">
                                    Leg {index + 1} · {getTokenSymbol(leg.marketTokenType)}
                                  </p>
                                  <p className="text-sm font-medium leading-relaxed text-white">
                                    {leg.marketQuestion}
                                  </p>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="rounded-full border border-brand-500/20 bg-brand-500/10 px-2.5 py-1 text-xs font-medium text-brand-300">
                                      {leg.outcomeLabel}
                                    </span>
                                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-surface-300">
                                      {leg.displayOdds.toFixed(2)}x
                                    </span>
                                    {riskHint && (
                                      <span className={cn('rounded-full border px-2.5 py-1 text-xs font-medium', riskHint.tone)}>
                                        {riskHint.label}
                                      </span>
                                    )}
                                  </div>
                                  {riskHint && (
                                    <p className="text-xs text-amber-200/80">
                                      Implied probability {riskHint.impliedProbability.toFixed(2)}%
                                    </p>
                                  )}
                                  {legBlockers[leg.marketId] && (
                                    <p className="text-xs text-red-300">{legBlockers[leg.marketId]}</p>
                                  )}
                                </div>
                                <button
                                  onClick={() => removeLeg(leg.marketId)}
                                  className="rounded-full border border-white/10 bg-white/5 p-2 text-surface-400 transition-colors hover:text-red-300"
                                  aria-label={`Remove ${leg.marketQuestion} from parlay`}
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </div>
                            </motion.div>
                          )
                        })()
                      ))}
                    </AnimatePresence>
                    {slipLegs.length < 2 && (
                      <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-5 text-center text-sm text-surface-400">
                        Add at least one more market to unlock checkout.
                      </div>
                    )}
                  </div>

                  {slipLegs.length >= 2 && (
                    <>
                      <div className="space-y-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
                        <div>
                          <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-surface-500">Stake Token</label>
                          <div className="grid grid-cols-3 gap-2">
                            {TOKEN_OPTIONS.map((token) => (
                              <button
                                key={token}
                                onClick={() => setSlipTokenType(token)}
                                className={cn(
                                  'rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                                  slipTokenType === token
                                    ? 'border border-brand-500/30 bg-brand-500/15 text-brand-300'
                                    : 'border border-white/[0.08] bg-black/20 text-surface-400 hover:text-white',
                                )}
                              >
                                {getTokenSymbol(token)}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
                            <p className="text-xs uppercase tracking-[0.18em] text-surface-500">Private</p>
                            <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-white">
                              <Shield className="h-4 w-4 text-brand-400" />
                              {formatParlayAmount(fundingRoute.privateBalance)} {getTokenSymbol(slipTokenType)}
                            </p>
                          </div>
                          <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
                            <p className="text-xs uppercase tracking-[0.18em] text-surface-500">Public</p>
                            <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-white">
                              <Coins className="h-4 w-4 text-emerald-400" />
                              {formatParlayAmount(fundingRoute.publicBalance)} {getTokenSymbol(slipTokenType)}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
                        <div>
                          <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-surface-500">Stake Amount</label>
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            value={stakeInput}
                            onChange={(event) => handleStakeChange(event.target.value)}
                            placeholder="0.00"
                            className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-lg font-semibold text-white placeholder:text-surface-500 focus:border-brand-500 focus:outline-none"
                          />
                        </div>

                        <div className="grid grid-cols-4 gap-2">
                          {QUICK_STAKES.map((quickStake) => (
                            <button
                              key={quickStake.label}
                              onClick={() => handleQuickStake(quickStake.value)}
                              className="rounded-xl border border-white/[0.08] bg-black/20 px-2 py-2 text-xs font-medium text-surface-300 transition-colors hover:border-brand-500/20 hover:text-white"
                            >
                              {quickStake.label}
                            </button>
                          ))}
                        </div>

                        {limits && (
                          <div className="flex items-center justify-between gap-3 text-xs">
                            <span className="text-surface-400">Max stake for these legs now</span>
                            <span className="flex items-center gap-2">
                              <span className="font-semibold text-white">
                                {formatParlayAmount(floorToCents(limits.maxStake))} {getTokenSymbol(slipTokenType)}
                              </span>
                              {floorToCents(limits.maxStake) >= limits.minStake && (
                                <button
                                  onClick={() => handleQuickStake(floorToCents(limits.maxStake))}
                                  className="rounded-lg border border-brand-500/20 bg-brand-500/10 px-2 py-1 font-medium text-brand-300 transition-colors hover:bg-brand-500/20"
                                >
                                  Use max
                                </button>
                              )}
                            </span>
                          </div>
                        )}
                        {limitsUnread && (
                          <div className="flex items-center justify-between gap-3 text-xs text-amber-300">
                            <span>Could not read this slip&apos;s limits right now. Checkout checks them again.</span>
                            <button
                              onClick={() => setLimitsAttempt((n) => n + 1)}
                              className="shrink-0 rounded-lg border border-amber-500/20 bg-amber-500/10 px-2 py-1 font-medium transition-colors hover:bg-amber-500/20"
                            >
                              Retry
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-surface-400">Funding route</span>
                          <span className="rounded-full border border-white/[0.08] bg-white/5 px-2.5 py-1 text-xs font-medium text-surface-300">
                            {describeParlayFundingSource(fundingRoute.recommendedSource ?? undefined)}
                          </span>
                        </div>
                        <div className="mt-3 flex items-center justify-between text-sm">
                          <span className="text-surface-400">Gross payout</span>
                          <span className="text-white">{formatParlayAmount(payout.gross)} {getTokenSymbol(slipTokenType)}</span>
                        </div>
                        <div className="mt-2 flex items-center justify-between text-sm">
                          <span className="text-surface-400">Protocol fee</span>
                          <span className="text-surface-300">-{formatParlayAmount(payout.fee, 4)} {getTokenSymbol(slipTokenType)}</span>
                        </div>
                        <div className="mt-3 flex items-center justify-between border-t border-white/[0.08] pt-3">
                          <span className="text-sm font-medium text-surface-300">Net payout if all legs win</span>
                          <span className="text-lg font-semibold text-emerald-300">
                            {formatParlayAmount(payout.net)} {getTokenSymbol(slipTokenType)}
                          </span>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {slipLegs.length >= 2 && (
                  <div className="border-t border-white/[0.08] px-5 py-5">
                    {error && (
                      <div className="mb-4 flex items-start gap-3 rounded-2xl border border-red-500/15 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{error}</span>
                      </div>
                    )}

                    <button
                      onClick={() => setShowConfirm(true)}
                      disabled={!canContinue}
                      className={cn(
                        'flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-semibold transition-colors',
                        canContinue
                          ? 'bg-brand-500 text-white hover:bg-brand-600'
                          : 'cursor-not-allowed bg-white/10 text-surface-500',
                      )}
                    >
                      {!wallet.connected ? (
                        'Connect Wallet'
                      ) : error ? (
                        error || 'Complete slip'
                      ) : (
                        <>
                          Continue to Checkout
                          <ChevronRight className="h-4 w-4" />
                        </>
                      )}
                    </button>
                  </div>
                )}
              </motion.aside>
            </>
          )}

          <ParlayConfirmModal
            isOpen={showConfirm}
            onClose={() => setShowConfirm(false)}
          />
        </>
      )}
    </AnimatePresence>
  )
}
