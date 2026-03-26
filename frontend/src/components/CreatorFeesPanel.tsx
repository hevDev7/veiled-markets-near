import { motion } from 'framer-motion'
import { Coins, Loader2, Check, AlertCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { type Market, useWalletStore } from '@/lib/store'
import { useAleoTransaction } from '@/hooks/useAleoTransaction'
import { cn, formatCredits, getTokenSymbol } from '@/lib/utils'
import {
  buildWithdrawCreatorFeesInputs,
  formatTimeRemaining,
  getCurrentBlockHeight,
  type MarketFeesData,
  MARKET_STATUS,
  getProgramIdForToken,
  WINNER_CLAIM_PRIORITY_BLOCKS,
} from '@/lib/aleo-client'
import { TransactionLink } from './TransactionLink'

interface CreatorFeesPanelProps {
  market: Market
  fees: MarketFeesData
}

export function CreatorFeesPanel({ market, fees }: CreatorFeesPanelProps) {
  const { wallet } = useWalletStore()
  const { executeTransaction } = useAleoTransaction()

  const [isWithdrawing, setIsWithdrawing] = useState(false)
  const [transactionId, setTransactionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [currentBlock, setCurrentBlock] = useState<bigint | null>(null)

  const tokenSymbol = getTokenSymbol(market.tokenType)
  const isCreator = wallet.address === market.creator
  const isResolved = market.status === MARKET_STATUS.RESOLVED
  const winnerClaimUnlockBlock = isResolved && market.challengeDeadline !== undefined
    ? market.challengeDeadline + WINNER_CLAIM_PRIORITY_BLOCKS
    : null
  const winnerClaimWindowActive = isResolved
    && (winnerClaimUnlockBlock === null || currentBlock === null || currentBlock <= winnerClaimUnlockBlock)
  const winnerClaimTimeRemaining = winnerClaimUnlockBlock !== null && currentBlock !== null
    ? formatTimeRemaining(winnerClaimUnlockBlock, currentBlock)
    : null

  // Creator can withdraw fees only after market is resolved and finalized
  const canWithdraw = isCreator && isResolved && fees.creator_fees > 0n && !winnerClaimWindowActive

  useEffect(() => {
    if (!isResolved) {
      setCurrentBlock(null)
      return
    }

    let cancelled = false
    const updateCurrentBlock = async () => {
      try {
        const height = await getCurrentBlockHeight()
        if (!cancelled) {
          setCurrentBlock(height)
        }
      } catch {
        if (!cancelled) {
          setCurrentBlock(null)
        }
      }
    }

    void updateCurrentBlock()
    const intervalId = window.setInterval(() => {
      void updateCurrentBlock()
    }, 30_000)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [isResolved, market.id])

  const handleWithdraw = async () => {
    if (!canWithdraw) return

    setIsWithdrawing(true)
    setError(null)

    try {
      if (winnerClaimWindowActive) {
        throw new Error(
          winnerClaimTimeRemaining
            ? `Winner claims still have priority for about ${winnerClaimTimeRemaining}. Creator fees unlock after that window ends.`
            : 'Winner claims still have priority. Creator fees are temporarily locked until the winner claim window ends.'
        )
      }

      const tokenType = (market.tokenType || 'ALEO') as 'ALEO' | 'USDCX' | 'USAD'
      const { functionName, inputs } = buildWithdrawCreatorFeesInputs(
        market.id,
        fees.creator_fees,
        tokenType,
      )

      const result = await executeTransaction({
        program: getProgramIdForToken(tokenType),
        function: functionName,
        inputs,
        fee: 1.5,
      })

      if (result?.transactionId) {
        setTransactionId(result.transactionId)
      } else {
        throw new Error('No transaction ID returned from wallet')
      }
    } catch (err: unknown) {
      console.error('Failed to withdraw creator fees:', err)
      setError(err instanceof Error ? err.message : 'Failed to withdraw fees')
    } finally {
      setIsWithdrawing(false)
    }
  }

  return (
    <div className="glass-card overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-white/[0.04]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center">
            <Coins className="w-5 h-5 text-brand-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Creator Fees</h3>
            <p className="text-sm text-surface-400">
              Earned from trading volume
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-4">
        {/* Fee Summary */}
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 rounded-xl bg-white/[0.02]">
            <p className="text-xs text-surface-500 uppercase tracking-wide mb-1">Creator Fees</p>
            <p className="text-xl font-bold text-white">
              {formatCredits(fees.creator_fees)} {tokenSymbol}
            </p>
          </div>
          <div className="p-4 rounded-xl bg-white/[0.02]">
            <p className="text-xs text-surface-500 uppercase tracking-wide mb-1">Protocol Fees</p>
            <p className="text-xl font-bold text-surface-300">
              {formatCredits(fees.protocol_fees)} {tokenSymbol}
            </p>
          </div>
        </div>

        {/* Status Info */}
        <div className="p-4 rounded-xl bg-white/[0.02]">
          <div className="flex justify-between items-center mb-2">
            <span className="text-surface-400 text-sm">Market Status</span>
            <span className={cn(
              'text-sm font-medium',
              isResolved ? 'text-yes-400' : 'text-yellow-400'
            )}>
              {isResolved ? 'Resolved' : market.status === MARKET_STATUS.ACTIVE ? 'Active' : 'Pending'}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-surface-400 text-sm">You are Creator</span>
            <span className={cn(
              'text-sm font-medium',
              isCreator ? 'text-yes-400' : 'text-surface-500'
            )}>
              {isCreator ? 'Yes' : 'No'}
            </span>
          </div>
          {isResolved && (
            <div className="flex justify-between items-center mt-2">
              <span className="text-surface-400 text-sm">Winner Claim Window</span>
              <span className={cn(
                'text-sm font-medium',
                winnerClaimWindowActive ? 'text-yellow-400' : 'text-yes-400'
              )}>
                {winnerClaimWindowActive
                  ? winnerClaimTimeRemaining
                    ? `Active (${winnerClaimTimeRemaining})`
                    : 'Checking'
                  : 'Ended'}
              </span>
            </div>
          )}
        </div>

        {transactionId ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center"
          >
            <div className="w-16 h-16 rounded-full bg-yes-500/20 mx-auto mb-4 flex items-center justify-center">
              <Check className="w-8 h-8 text-yes-400" />
            </div>
            <h4 className="text-lg font-semibold text-white mb-2">Fees Withdrawn</h4>
            <p className="text-sm text-surface-400 mb-4">
              {formatCredits(fees.creator_fees)} {tokenSymbol} has been sent to your wallet.
            </p>
            <TransactionLink
              transactionId={transactionId}
              showCopy={true}
              showNote={true}
            />
          </motion.div>
        ) : (
          <>
            {!isCreator && (
              <div className="p-4 rounded-xl bg-white/[0.02] text-center">
                <p className="text-surface-400 text-sm">
                  Only the market creator can withdraw accumulated fees.
                </p>
              </div>
            )}

            {isCreator && !isResolved && (
              <div className="flex items-start gap-3 p-4 rounded-xl bg-yellow-500/5 border border-yellow-500/20">
                <AlertCircle className="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-yellow-300">Not Yet Withdrawable</p>
                  <p className="text-xs text-surface-400 mt-1">
                    Creator fees can only be withdrawn after the market is resolved and
                    the challenge window has passed (finalized).
                  </p>
                </div>
              </div>
            )}

            {isCreator && isResolved && fees.creator_fees > 0n && winnerClaimWindowActive && (
              <div className="flex items-start gap-3 p-4 rounded-xl bg-yellow-500/5 border border-yellow-500/20">
                <AlertCircle className="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-yellow-300">Winner claims come first</p>
                  <p className="text-xs text-surface-400 mt-1">
                    Creator fees stay locked until the winner claim priority window ends.
                    {winnerClaimTimeRemaining
                      ? ` Estimated unlock: ${winnerClaimTimeRemaining}.`
                      : ' The app is still verifying the current block height.'}
                  </p>
                </div>
              </div>
            )}

            {isCreator && isResolved && fees.creator_fees === 0n && (
              <div className="p-4 rounded-xl bg-white/[0.02] text-center">
                <p className="text-surface-400 text-sm">
                  No creator fees have been accumulated for this market.
                </p>
              </div>
            )}

            {/* Error Display */}
            {error && (
              <div className="flex items-start gap-3 p-4 rounded-xl bg-no-500/10 border border-no-500/20">
                <AlertCircle className="w-5 h-5 text-no-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-no-400">{error}</p>
              </div>
            )}

            {/* Withdraw Button */}
            <button
              onClick={handleWithdraw}
              disabled={!canWithdraw || isWithdrawing}
              className={cn(
                'w-full flex items-center justify-center gap-2 btn-primary',
                !canWithdraw && 'opacity-50 cursor-not-allowed'
              )}
            >
              {isWithdrawing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Confirm in Wallet...</span>
                </>
              ) : (
                <>
                  <Coins className="w-5 h-5" />
                  <span>
                    {winnerClaimWindowActive
                      ? 'Winner Claim Window Active'
                      : `Withdraw ${fees.creator_fees > 0n
                        ? `${formatCredits(fees.creator_fees)} ${tokenSymbol}`
                        : 'Fees'
                      }`}
                  </span>
                </>
              )}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
