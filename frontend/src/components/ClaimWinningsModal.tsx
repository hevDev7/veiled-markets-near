import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Trophy,
  Shield,
  Check,
  RefreshCcw,
  AlertTriangle,
  Loader2,
  Wallet,
  Search,
  ClipboardPaste,
} from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import { type Bet, useBetsStore, useWalletStore, outcomeToIndex } from '@/lib/store'
import { useAleoTransaction } from '@/hooks/useAleoTransaction'
import { cn, formatCredits, getTokenSymbol } from '@/lib/utils'
import { diagnoseTransaction, getMarketCredits, getRedeemFunction, getRefundFunction, getProgramIdForToken } from '@/lib/aleo-client'
import { getMarketOutcomeLabels } from '@/lib/market-outcomes'
import { fetchOutcomeShareRecords, type ParsedOutcomeShare } from '@/lib/credits-record'
import { TransactionLink } from './TransactionLink'

interface ClaimWinningsModalProps {
  mode: 'winnings' | 'refund'
  isOpen: boolean
  onClose: () => void
  bets: Bet[]
  market?: { numOutcomes?: number; outcomeLabels?: string[] }
  onClaimSuccess?: () => void
}

interface InspectedOutcomeShareInput {
  marketId: string | null
  owner: string | null
  outcome: number | null
  quantity: bigint | null
}

function inspectOutcomeShareInput(text: string): InspectedOutcomeShareInput {
  const outcomeMatch = text.match(/outcome:\s*(\d+)u8/)
  const qtyMatch = text.match(/quantity:\s*(\d+)u128/)
  const marketMatch = text.match(/market_id:\s*(\d+field)/)
  const ownerMatch = text.match(/owner:\s*(aleo1[a-z0-9]+)/)

  return {
    marketId: marketMatch ? marketMatch[1] : null,
    owner: ownerMatch ? ownerMatch[1] : null,
    outcome: outcomeMatch ? parseInt(outcomeMatch[1]) : null,
    quantity: qtyMatch ? BigInt(qtyMatch[1]) : null,
  }
}

export function ClaimWinningsModal({
  mode,
  isOpen,
  onClose,
  bets,
  market,
  onClaimSuccess
}: ClaimWinningsModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [txId, setTxId] = useState<string | null>(null)
  const [txPhase, setTxPhase] = useState<'idle' | 'pending' | 'confirmed'>('idle')
  const [error, setError] = useState<string | null>(null)
  const { markBetClaimed } = useBetsStore()
  const { wallet } = useWalletStore()
  const { executeTransaction, pollTransactionStatus } = useAleoTransaction()

  // Record fetching state
  const [shareRecords, setShareRecords] = useState<ParsedOutcomeShare[]>([])
  const [selectedRecord, setSelectedRecord] = useState<ParsedOutcomeShare | null>(null)
  const [isFetchingRecords, setIsFetchingRecords] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [showPasteInput, setShowPasteInput] = useState(false)
  const [pastedRecord, setPastedRecord] = useState('')

  const isRefund = mode === 'refund'
  const bet = bets[0] // We handle one bet at a time
  const expectedOutcome = bet ? outcomeToIndex(bet.outcome) : null
  const expectedQuantity = bet ? (bet.sharesReceived || bet.amount) : null

  const matchesCurrentBet = useCallback((record: ParsedOutcomeShare) => {
    if (!bet) return false
    if (record.marketId && record.marketId !== bet.marketId) return false
    if (record.owner && wallet.address && record.owner !== wallet.address) return false
    return record.outcome === expectedOutcome
  }, [bet, expectedOutcome, wallet.address])

  const sortRecordsForBet = useCallback((records: ParsedOutcomeShare[]) => {
    if (!bet) return records

    return [...records].sort((a, b) => {
      const aExactQty = expectedQuantity != null && a.quantity === expectedQuantity ? 1 : 0
      const bExactQty = expectedQuantity != null && b.quantity === expectedQuantity ? 1 : 0
      if (aExactQty !== bExactQty) return bExactQty - aExactQty
      if (a.outcome !== b.outcome) return a.outcome - b.outcome
      if (a.quantity === b.quantity) return 0
      return a.quantity > b.quantity ? -1 : 1
    })
  }, [bet, expectedQuantity])

  // Fetch records when modal opens
  const fetchRecords = useCallback(async () => {
    if (!bet) return
    setIsFetchingRecords(true)
    setFetchError(null)
    try {
      const betTokenType = (bet.tokenType || 'ALEO') as 'ALEO' | 'USDCX' | 'USAD'
      const records = await fetchOutcomeShareRecords(getProgramIdForToken(betTokenType), bet.marketId)
      const matchingRecords = sortRecordsForBet(records.filter(matchesCurrentBet))

      setShareRecords(matchingRecords)

      if (matchingRecords.length >= 1) {
        const exactMatch = matchingRecords.find(record => expectedQuantity != null && record.quantity === expectedQuantity)
        setSelectedRecord(exactMatch || (matchingRecords.length === 1 ? matchingRecords[0] : null))
      } else if (records.length === 0) {
        setSelectedRecord(null)
        setFetchError('No OutcomeShare records found. Your wallet may not support record fetching, or records may be spent.')
      } else {
        setSelectedRecord(null)
        setFetchError(
          isRefund
            ? 'No OutcomeShare record matching this position was found. Remaining records for this market belong to a different outcome or trade.'
            : 'No winning OutcomeShare record matching this bet was found. Remaining records for this market belong to a different outcome or trade.'
        )
      }
    } catch (err) {
      console.error('Failed to fetch OutcomeShare records:', err)
      setFetchError('Failed to fetch records from wallet. Try pasting the record manually.')
    } finally {
      setIsFetchingRecords(false)
    }
  }, [bet, expectedQuantity, isRefund, matchesCurrentBet, sortRecordsForBet])

  useEffect(() => {
    if (isOpen && bet && wallet.connected) {
      fetchRecords()
    }
    if (!isOpen) {
      // Reset state when modal closes
      setShareRecords([])
      setSelectedRecord(null)
      setFetchError(null)
      setShowPasteInput(false)
      setPastedRecord('')
    }
  }, [isOpen, bet, wallet.connected, fetchRecords])

  const handleClose = () => {
    setError(null)
    setTxId(null)
    setTxPhase('idle')
    onClose()
  }

  const handleMarkClaimed = () => {
    if (bet) {
      markBetClaimed(bet.id)
      onClaimSuccess?.()
    }
    handleClose()
  }

  // Get the record plaintext to use for the transaction
  const getRecordPlaintext = (): string | null => {
    if (selectedRecord) return selectedRecord.plaintext
    if (pastedRecord.trim()) return pastedRecord.trim()
    return null
  }

  // Execute claim/redeem via wallet
  const handleWalletClaim = async () => {
    if (!bet || !wallet.connected) return

    const recordPlaintext = getRecordPlaintext()
    if (!recordPlaintext) {
      setError('No OutcomeShare record selected. Fetch records or paste one manually.')
      return
    }

    setIsSubmitting(true)
    setError(null)
    try {
      const publicFeeRequired = 1_500_000n
      if (!wallet.isDemoMode && wallet.balance.public < publicFeeRequired) {
        throw new Error(
          `Insufficient public ALEO for transaction fee. ${isRefund ? 'claim_refund' : 'redeem_shares'} needs 1.50 public ALEO for gas, ` +
          `but only ${Number(wallet.balance.public) / 1_000_000} ALEO is public in your wallet.`
        )
      }

      const inspectedRecord = selectedRecord ?? inspectOutcomeShareInput(recordPlaintext)
      if (inspectedRecord.marketId && inspectedRecord.marketId !== bet.marketId) {
        throw new Error('The selected OutcomeShare record belongs to a different market.')
      }
      if (inspectedRecord.owner && wallet.address && inspectedRecord.owner !== wallet.address) {
        throw new Error('The selected OutcomeShare record belongs to a different wallet address.')
      }
      if (inspectedRecord.outcome != null && inspectedRecord.outcome !== expectedOutcome) {
        throw new Error(
          `The selected OutcomeShare record is for ${resolveOutcomeLabel(inspectedRecord.outcome)}, ` +
          `but this bet needs ${resolveOutcomeLabel(expectedOutcome || 1)}.`
        )
      }

      const tokenType = (bet.tokenType || 'ALEO') as 'ALEO' | 'USDCX' | 'USAD'
      if (inspectedRecord.quantity != null) {
        try {
          const remainingCollateral = await getMarketCredits(bet.marketId, getProgramIdForToken(tokenType))
          if (remainingCollateral !== null && remainingCollateral < inspectedRecord.quantity) {
            throw new Error(
              `This market only has ${formatCredits(remainingCollateral)} ${tokenType} remaining on-chain, ` +
              `but this share record needs ${formatCredits(inspectedRecord.quantity)} ${tokenType}. ` +
              `Redemption will be rejected until enough collateral remains.`
            )
          }
        } catch (collateralErr) {
          if (collateralErr instanceof Error && collateralErr.message.includes('remaining on-chain')) {
            throw collateralErr
          }
        }
      }

      const functionName = isRefund
        ? getRefundFunction(tokenType)
        : getRedeemFunction(tokenType)

      const result = await executeTransaction({
        program: getProgramIdForToken(tokenType),
        function: functionName,
        inputs: [recordPlaintext],
        fee: 1.5,
        recordIndices: [0],
      })

      if (result?.transactionId) {
        const submittedTxId = result.transactionId
        setTxId(submittedTxId)
        setTxPhase('pending')

        const onChainVerify = submittedTxId.startsWith('at1')
          ? async () => {
              const diagnosis = await diagnoseTransaction(submittedTxId)
              return diagnosis.status === 'accepted'
            }
          : undefined

        void pollTransactionStatus(
          submittedTxId,
          async (status, onChainTxId) => {
            const finalTxId = onChainTxId || submittedTxId
            if (onChainTxId) {
              setTxId(onChainTxId)
            }

            if (status === 'confirmed') {
              setTxPhase('confirmed')
              markBetClaimed(bet.id)
              onClaimSuccess?.()
              return
            }

            setTxPhase('idle')
            setTxId(null)

            if (status === 'failed') {
              let message = `${isRefund ? 'Refund' : 'Redemption'} failed. Your portfolio was not marked as claimed.`
              try {
                if (finalTxId.startsWith('at1')) {
                  const diagnosis = await diagnoseTransaction(finalTxId)
                  const suffix = diagnosis.message ? ` ${diagnosis.message}` : ''
                  if (diagnosis.status === 'rejected') {
                    message = `Transaction was rejected on-chain.${suffix} Your portfolio was not marked as claimed.`
                  } else if (diagnosis.status === 'accepted') {
                    message = `Transaction was accepted on-chain, but wallet status reported a failure. Please refresh and verify your claim manually.`
                  }
                }
              } catch {
                // keep fallback message
              }
              setError(message)
              return
            }

            setError(
              `Transaction was submitted, but final confirmation could not be verified yet. ` +
              `Your portfolio was not marked as claimed. ` +
              `Check the explorer or reopen this modal later to verify the result.`
            )
          },
          30,
          10_000,
          onChainVerify,
        )
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

  // FPMM: winning shares redeem 1:1, payout = quantity from OutcomeShare record (most accurate)
  // Fallback chain: selected record quantity > bet.sharesReceived > bet.amount
  const recordQuantity = selectedRecord?.quantity
  const payoutDisplay = isRefund
    ? formatCredits(bet.amount)
    : formatCredits(recordQuantity || bet.sharesReceived || bet.amount)

  // Resolve outcome label from market data
  const resolveOutcomeLabel = (outcomeNum: number): string => {
    if (outcomeNum < 1) return 'Pending'
    return market ? (getMarketOutcomeLabels({
      numOutcomes: Math.max(market.numOutcomes || market.outcomeLabels?.length || 2, 2),
      outcomeLabels: market.outcomeLabels ?? [],
    })[outcomeNum - 1] || `Outcome ${outcomeNum}`) : `Outcome ${outcomeNum}`
  }

  const hasRecord = !!getRecordPlaintext()
  const canMarkClaimedManually = fetchError === 'No OutcomeShare records found. Your wallet may not support record fetching, or records may be spent.'
  const hasRecordMismatch = !!fetchError && fetchError.includes('different outcome or trade')

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
              <div className="relative p-6 border-b border-white/[0.04]">
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
                      txPhase === 'pending'
                        ? "bg-brand-500/20"
                        : isRefund ? "bg-orange-500/20" : "bg-yes-500/20"
                    )}>
                      {txPhase === 'pending' ? (
                        <Loader2 className="w-8 h-8 animate-spin text-brand-400" />
                      ) : (
                        <Check className={cn("w-8 h-8", isRefund ? "text-orange-400" : "text-yes-400")} />
                      )}
                    </div>
                    <div>
                      <h4 className="text-lg font-semibold text-white">
                        {txPhase === 'pending'
                          ? 'Transaction Submitted'
                          : isRefund ? 'Refund Submitted' : 'Redemption Submitted'}
                      </h4>
                      <p className="text-sm text-surface-400 mt-1">
                        {txPhase === 'pending'
                          ? 'Waiting for final confirmation. Your portfolio will only be marked as claimed after the transaction is accepted.'
                          : 'Transaction confirmed. Your portfolio has been marked as claimed.'}
                      </p>
                    </div>
                    <TransactionLink
                      transactionId={txId}
                      showCopy={true}
                      showNote={true}
                    />
                    <button onClick={handleClose} className="w-full btn-secondary mt-4">
                      {txPhase === 'pending' ? 'Close' : 'Done'}
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
                          {(() => {
                            const idx = outcomeToIndex(bet.outcome)
                            const colors = [
                              'bg-yes-500/20 text-yes-400',
                              'bg-no-500/20 text-no-400',
                              'bg-purple-500/20 text-purple-400',
                              'bg-yellow-500/20 text-yellow-400',
                            ]
                            return (
                              <span className={cn(
                                "text-xs font-medium px-2 py-0.5 rounded-full",
                                colors[idx - 1] || colors[0]
                              )}>
                                {resolveOutcomeLabel(outcomeToIndex(bet.outcome))}
                              </span>
                            )
                          })()}
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

                    {/* Record Selection */}
                    {wallet.connected && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-surface-300">OutcomeShare Record</p>
                          <button
                            onClick={fetchRecords}
                            disabled={isFetchingRecords}
                            className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1"
                          >
                            {isFetchingRecords ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Search className="w-3 h-3" />
                            )}
                            {isFetchingRecords ? 'Fetching...' : 'Fetch Records'}
                          </button>
                        </div>

                        {/* Records list */}
                        {shareRecords.length > 0 && (
                          <div className="space-y-2 max-h-40 overflow-y-auto">
                            {shareRecords.map((rec, idx) => (
                              <button
                                key={idx}
                                onClick={() => {
                                  setSelectedRecord(rec)
                                  setShowPasteInput(false)
                                  setPastedRecord('')
                                }}
                                className={cn(
                                  "w-full p-3 rounded-lg border text-left transition-all text-sm",
                                  selectedRecord === rec
                                    ? "border-brand-500/50 bg-brand-500/10"
                                    : "border-surface-700 bg-white/[0.02] hover:border-surface-600"
                                )}
                              >
                                <div className="flex items-center justify-between">
                                  <span className={cn(
                                    "text-xs font-medium px-2 py-0.5 rounded-full",
                                    [
                                      'bg-yes-500/20 text-yes-400',
                                      'bg-no-500/20 text-no-400',
                                      'bg-purple-500/20 text-purple-400',
                                      'bg-yellow-500/20 text-yellow-400',
                                    ][rec.outcome - 1] || 'bg-yes-500/20 text-yes-400'
                                  )}>
                                    {resolveOutcomeLabel(rec.outcome)}
                                  </span>
                                  <span className="text-surface-300 font-medium">
                                    {formatCredits(rec.quantity)} shares
                                  </span>
                                </div>
                                {selectedRecord === rec && (
                                  <Check className="w-4 h-4 text-brand-400 absolute right-3 top-3" />
                                )}
                              </button>
                            ))}
                          </div>
                        )}

                        {/* No records found — likely already redeemed */}
                        {fetchError && !isFetchingRecords && !showPasteInput && (
                          <div className="p-4 rounded-xl bg-yellow-500/5 border border-yellow-500/20 space-y-3">
                            <div className="flex items-start gap-3">
                              <Check className="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" />
                              <div>
                                <p className="text-sm font-medium text-yellow-300">
                                  {hasRecordMismatch ? 'Record Mismatch' : 'Already Redeemed?'}
                                </p>
                                <p className="text-xs text-surface-400 mt-1">
                                  {hasRecordMismatch
                                    ? fetchError
                                    : 'No unspent OutcomeShare records were found for this market. Only mark this bet as claimed if you have already verified a successful redemption in your wallet or on the explorer.'}
                                </p>
                              </div>
                            </div>
                            {canMarkClaimedManually && (
                              <button
                                onClick={handleMarkClaimed}
                                className="w-full py-2.5 rounded-xl font-medium bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 border border-yellow-500/30 transition-colors flex items-center justify-center gap-2"
                              >
                                <Check className="w-4 h-4" />
                                Mark as Claimed Manually
                              </button>
                            )}
                          </div>
                        )}

                        {/* Paste record toggle */}
                        <button
                          onClick={() => {
                            setShowPasteInput(!showPasteInput)
                            if (!showPasteInput) {
                              setSelectedRecord(null)
                            }
                          }}
                          className="text-xs text-surface-400 hover:text-surface-300 flex items-center gap-1"
                        >
                          <ClipboardPaste className="w-3 h-3" />
                          {showPasteInput ? 'Hide paste input' : 'Paste record manually'}
                        </button>

                        {/* Manual paste input */}
                        {showPasteInput && (
                          <textarea
                            value={pastedRecord}
                            onChange={(e) => {
                              setPastedRecord(e.target.value)
                              setSelectedRecord(null)
                            }}
                            placeholder="{ owner: aleo1..., market_id: ...field, outcome: 1u8, quantity: ...u128, share_nonce: ...field, token_type: 1u8, _nonce: ...group.public }"
                            className="w-full p-3 rounded-lg bg-surface-900 border border-surface-700 text-xs text-surface-300 font-mono resize-none focus:border-brand-500/50 focus:outline-none"
                            rows={4}
                          />
                        )}
                      </div>
                    )}

                    {/* Error display */}
                    {error && (
                      <div className="flex items-start gap-3 p-4 rounded-xl bg-no-500/10 border border-no-500/20">
                        <AlertTriangle className="w-5 h-5 text-no-400 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-no-400">Transaction Failed</p>
                          <p className="text-xs text-surface-400 mt-1">{error}</p>
                          <p className="text-xs text-surface-500 mt-2">
                            If the wallet cannot find the record, try pasting it manually or use the CLI method below.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Wallet Claim Button */}
                    {wallet.connected && (
                      <div className="space-y-3">
                        <button
                          onClick={handleWalletClaim}
                          disabled={isSubmitting || !hasRecord}
                          className={cn(
                            "w-full py-3 rounded-xl font-medium transition-all flex items-center justify-center gap-2",
                            isRefund
                              ? "bg-orange-500 hover:bg-orange-400 text-white"
                              : "bg-gradient-to-r from-yes-500 to-brand-500 hover:from-yes-400 hover:to-brand-400 text-white",
                            (isSubmitting || !hasRecord) && "opacity-70 cursor-not-allowed"
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
                              <span>{isRefund ? 'Claim Refund' : 'Redeem'}</span>
                            </>
                          )}
                        </button>
                        {!hasRecord && (
                          <p className="text-xs text-surface-500 text-center">
                            Select or paste an OutcomeShare record to continue.
                          </p>
                        )}
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
