import { motion } from 'framer-motion'
import { Droplets, Plus, Minus, Loader2, AlertCircle, Check, RefreshCw, Edit3, Info } from 'lucide-react'
import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { type Market, useWalletStore, CONTRACT_INFO } from '@/lib/store'
import { useAleoTransaction } from '@/hooks/useAleoTransaction'
import { cn, formatCredits, getTokenSymbol } from '@/lib/utils'
import { buildAddLiquidityInputs, buildRemoveLiquidityInputs, buildWithdrawLpResolvedInputs, buildClaimLpRefundInputs, MARKET_STATUS } from '@/lib/aleo-client'
import { calculateLPSharesOut, calculateLPTokensOut } from '@/lib/amm'
import { fetchLPTokenRecords, type ParsedLPToken } from '@/lib/credits-record'
import { TransactionLink } from './TransactionLink'

interface LiquidityPanelProps {
  market: Market
}

type LiquidityTab = 'add' | 'remove' | 'withdraw'

export function LiquidityPanel({ market }: LiquidityPanelProps) {
  const { wallet } = useWalletStore()
  const { executeTransaction } = useAleoTransaction()

  const isResolved = market.status === MARKET_STATUS.RESOLVED
  const isCancelled = market.status === MARKET_STATUS.CANCELLED
  const isMarketEnded = market.status !== MARKET_STATUS.ACTIVE
  const isCreator = wallet.address && market.creator && wallet.address === market.creator

  const [activeTab, setActiveTab] = useState<LiquidityTab>(
    isResolved || isCancelled ? 'withdraw' : 'add'
  )
  const [amount, setAmount] = useState('')
  const [lpSharesInput, setLpSharesInput] = useState('')
  const [lpTokenRecord, setLpTokenRecord] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [transactionId, setTransactionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // LP Token record fetching
  const [lpTokens, setLpTokens] = useState<ParsedLPToken[]>([])
  const [selectedLPIndex, setSelectedLPIndex] = useState<number>(-1)
  const [isFetchingLP, setIsFetchingLP] = useState(false)
  const [lpFetchError, setLpFetchError] = useState<string | null>(null)
  const [showManualPaste, setShowManualPaste] = useState(false)
  const lpFetchedRef = useRef(false)

  const fetchLPTokens = useCallback(async () => {
    if (!wallet.connected) return
    setIsFetchingLP(true)
    setLpFetchError(null)
    try {
      // Timeout after 8s — requestRecords can hang if wallet has no records for this program
      const records = await Promise.race([
        fetchLPTokenRecords(CONTRACT_INFO.programId, market.id),
        new Promise<ParsedLPToken[]>((resolve) => setTimeout(() => resolve([]), 8_000)),
      ])
      lpFetchedRef.current = true
      setLpTokens(records)
      if (records.length > 0) {
        setSelectedLPIndex(0)
        setLpTokenRecord(records[0].plaintext)
        setShowManualPaste(false)
      } else {
        setSelectedLPIndex(-1)
        setLpTokenRecord('')
      }
    } catch (err) {
      lpFetchedRef.current = true
      setLpFetchError(err instanceof Error ? err.message : 'Failed to fetch LP tokens')
    } finally {
      setIsFetchingLP(false)
    }
  }, [wallet.connected, market.id])

  // Auto-fetch LP tokens once when switching to remove/withdraw tab
  useEffect(() => {
    if ((activeTab === 'remove' || activeTab === 'withdraw') && wallet.connected && !lpFetchedRef.current && !isFetchingLP) {
      fetchLPTokens()
    }
  }, [activeTab, wallet.connected, isFetchingLP, fetchLPTokens])

  const tokenSymbol = getTokenSymbol(market.tokenType)

  // Total liquidity and LP shares from on-chain pool data
  const totalLiquidity = market.totalLiquidity ?? (market.yesReserve + market.noReserve)
  const totalLPShares = market.totalLPShares ?? totalLiquidity

  // For resolved/cancelled markets, show actual remaining collateral (after winner claims)
  const displayLiquidity = (isResolved || isCancelled) && market.remainingCredits !== undefined
    ? market.remainingCredits
    : totalLiquidity

  const amountMicro = amount
    ? BigInt(Math.floor(parseFloat(amount) * 1_000_000))
    : 0n

  const lpSharesMicro = lpSharesInput
    ? BigInt(Math.floor(parseFloat(lpSharesInput) * 1_000_000))
    : 0n

  // Calculate LP shares for adding
  const lpSharesOut = useMemo(() => {
    if (amountMicro <= 0n) return 0n
    return calculateLPSharesOut(amountMicro, totalLPShares, totalLiquidity)
  }, [amountMicro, totalLPShares, totalLiquidity])

  // Calculate tokens for removing
  const tokensOut = useMemo(() => {
    if (lpSharesMicro <= 0n) return 0n
    return calculateLPTokensOut(lpSharesMicro, totalLPShares, totalLiquidity)
  }, [lpSharesMicro, totalLPShares, totalLiquidity])

  const handleAddLiquidity = async () => {
    if (!amount || amountMicro <= 0n) return

    setIsSubmitting(true)
    setError(null)

    try {
      const tokenType = (market.tokenType || 'ALEO') as 'ALEO' | 'USDCX'
      const { functionName, inputs } = buildAddLiquidityInputs(
        market.id,
        amountMicro,
        0n, // expectedLpShares — 0 = accept any amount
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
      } else {
        throw new Error('No transaction ID returned from wallet')
      }
    } catch (err: unknown) {
      console.error('Failed to add liquidity:', err)
      setError(err instanceof Error ? err.message : 'Failed to add liquidity')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRemoveLiquidity = async () => {
    if (!lpSharesInput || lpSharesMicro <= 0n || !lpTokenRecord) return

    setIsSubmitting(true)
    setError(null)

    try {
      const tokenType = (market.tokenType || 'ALEO') as 'ALEO' | 'USDCX'
      const { functionName, inputs } = buildRemoveLiquidityInputs(
        lpTokenRecord,
        lpSharesMicro,
        0n, // minTokensOut — 0 = accept any amount
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
      } else {
        throw new Error('No transaction ID returned from wallet')
      }
    } catch (err: unknown) {
      console.error('Failed to remove liquidity:', err)
      setError(err instanceof Error ? err.message : 'Failed to remove liquidity')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleWithdrawLpResolved = async () => {
    if (!lpTokenRecord) return

    setIsSubmitting(true)
    setError(null)

    try {
      const tokenType = (market.tokenType || 'ALEO') as 'ALEO' | 'USDCX'
      const builder = isCancelled ? buildClaimLpRefundInputs : buildWithdrawLpResolvedInputs
      const { functionName, inputs } = builder(
        lpTokenRecord,
        0n, // min_tokens_out — 0 = accept any
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
      } else {
        throw new Error('No transaction ID returned from wallet')
      }
    } catch (err: unknown) {
      console.error('Failed to withdraw LP:', err)
      setError(err instanceof Error ? err.message : 'Failed to withdraw LP')
    } finally {
      setIsSubmitting(false)
    }
  }

  const resetState = () => {
    setAmount('')
    setLpSharesInput('')
    setLpTokenRecord('')
    setTransactionId(null)
    setError(null)
  }

  const handleTabChange = (tab: LiquidityTab) => {
    setActiveTab(tab)
    resetState()
  }

  return (
    <div className="glass-card overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-surface-800">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-accent-500/10 flex items-center justify-center">
            <Droplets className="w-5 h-5 text-accent-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Liquidity</h3>
            <p className="text-sm text-surface-400">
              {(isResolved || isCancelled) ? 'Remaining' : 'Pool'}: {formatCredits(displayLiquidity)} {tokenSymbol}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex bg-surface-800/50 rounded-xl p-1">
          {(isResolved || isCancelled) ? (
            <button
              onClick={() => handleTabChange('withdraw')}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium bg-brand-500/20 text-brand-400"
            >
              <Minus className="w-4 h-4" />
              Withdraw LP
            </button>
          ) : (
            <>
              <button
                onClick={() => handleTabChange('add')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all',
                  activeTab === 'add'
                    ? 'bg-brand-500/20 text-brand-400'
                    : 'text-surface-400 hover:text-surface-300'
                )}
              >
                <Plus className="w-4 h-4" />
                Add
              </button>
              <button
                onClick={() => handleTabChange('remove')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all',
                  activeTab === 'remove'
                    ? 'bg-brand-500/20 text-brand-400'
                    : 'text-surface-400 hover:text-surface-300'
                )}
              >
                <Minus className="w-4 h-4" />
                Remove
              </button>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {transactionId ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center"
          >
            <div className="w-16 h-16 rounded-full bg-yes-500/20 mx-auto mb-4 flex items-center justify-center">
              <Check className="w-8 h-8 text-yes-400" />
            </div>
            <h4 className="text-lg font-semibold text-white mb-2">
              {activeTab === 'add' ? 'Liquidity Added' : activeTab === 'withdraw' ? 'LP Withdrawn' : 'Liquidity Removed'}
            </h4>
            <TransactionLink
              transactionId={transactionId}
              className="mb-4"
              showCopy={true}
              showNote={false}
            />
            <button
              onClick={resetState}
              className="btn-secondary w-full mt-4"
            >
              New Transaction
            </button>
          </motion.div>
        ) : (
          <>
            {activeTab === 'withdraw' ? (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-brand-500/10 border border-brand-500/20 mb-2">
                  <div className="flex items-center gap-2">
                    <Droplets className="w-5 h-5 text-brand-400 flex-shrink-0" />
                    <p className="text-sm text-brand-400">
                      {isCancelled
                        ? 'This market was cancelled. Claim your LP tokens back.'
                        : 'This market has been resolved. Withdraw your LP share.'}
                    </p>
                  </div>
                </div>

                {/* LP Token Record — auto-fetch or manual */}
                <LPTokenSelector
                  lpTokens={lpTokens}
                  selectedLPIndex={selectedLPIndex}
                  isFetchingLP={isFetchingLP}
                  lpFetchError={lpFetchError}
                  showManualPaste={showManualPaste}
                  lpTokenRecord={lpTokenRecord}
                  onSelect={(idx: number) => {
                    setSelectedLPIndex(idx)
                    setLpTokenRecord(lpTokens[idx].plaintext)
                  }}
                  onManualChange={setLpTokenRecord}
                  onToggleManual={() => setShowManualPaste(!showManualPaste)}
                  onRefresh={fetchLPTokens}
                  tokenSymbol={tokenSymbol}
                />

                {/* Non-creator notice */}
                {!isCreator && wallet.connected && (
                  <div className="flex items-start gap-2.5 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                    <Info className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-yellow-300/90 leading-relaxed">
                      Your wallet is not the creator of this market. You can only withdraw LP if you previously added liquidity via <span className="font-mono font-semibold">add_liquidity</span> and hold an LP Token record for this market.
                    </p>
                  </div>
                )}

                <button
                  onClick={handleWithdrawLpResolved}
                  disabled={!lpTokenRecord || isSubmitting}
                  className={cn(
                    'w-full flex items-center justify-center gap-2 btn-primary',
                    !lpTokenRecord && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Confirm in Wallet...</span>
                    </>
                  ) : (
                    <>
                      <Minus className="w-5 h-5" />
                      <span>{isCancelled ? 'Claim LP Refund' : 'Withdraw LP'}</span>
                    </>
                  )}
                </button>
              </div>
            ) : activeTab === 'add' ? (
              /* ---- ADD TAB ---- */
              <div className="space-y-4">
                {/* Amount Input */}
                <div>
                  <label className="block text-sm text-surface-400 mb-2">
                    Amount ({tokenSymbol})
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      className="input-field text-xl font-semibold pr-20"
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-surface-400 text-sm">
                      {tokenSymbol}
                    </div>
                  </div>
                  <div className="flex justify-between text-sm mt-2">
                    <span className="text-surface-500">
                      Balance: {formatCredits(
                        market.tokenType === 'USDCX'
                          ? wallet.balance.usdcxPublic
                          : wallet.balance.public
                      )} {tokenSymbol}
                    </span>
                    <button
                      onClick={() => {
                        const bal = market.tokenType === 'USDCX'
                          ? wallet.balance.usdcxPublic
                          : wallet.balance.public
                        const usable = bal > 700_000n ? bal - 700_000n : 0n
                        setAmount((Number(usable) / 1_000_000).toString())
                      }}
                      className="text-brand-400 hover:text-brand-300"
                    >
                      Max
                    </button>
                  </div>
                </div>

                {/* LP Shares Preview */}
                {amountMicro > 0n && (
                  <div className="p-4 rounded-xl bg-surface-800/50">
                    <div className="flex justify-between items-center">
                      <span className="text-surface-400 text-sm">LP Shares You Receive</span>
                      <span className="text-white font-semibold">
                        {formatCredits(lpSharesOut)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center mt-2">
                      <span className="text-surface-400 text-sm">Share of Pool</span>
                      <span className="text-surface-300 text-sm">
                        {totalLiquidity > 0n
                          ? ((Number(amountMicro) / Number(totalLiquidity + amountMicro)) * 100).toFixed(2)
                          : '100.00'
                        }%
                      </span>
                    </div>
                  </div>
                )}

                {/* Info */}
                <div className="p-3 rounded-lg bg-brand-500/5 border border-brand-500/20">
                  <p className="text-xs text-surface-400">
                    Adding liquidity earns you 1% of all trades in this market, proportional to your share.
                    Liquidity is split evenly across all outcomes.
                  </p>
                </div>

                <button
                  onClick={handleAddLiquidity}
                  disabled={!amount || parseFloat(amount) <= 0 || isSubmitting || !!isMarketEnded}
                  className={cn(
                    'w-full flex items-center justify-center gap-2 btn-primary',
                    (!amount || parseFloat(amount) <= 0 || !!isMarketEnded) && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Confirm in Wallet...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-5 h-5" />
                      <span>Add Liquidity</span>
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* LP Token Record — auto-fetch or manual */}
                <LPTokenSelector
                  lpTokens={lpTokens}
                  selectedLPIndex={selectedLPIndex}
                  isFetchingLP={isFetchingLP}
                  lpFetchError={lpFetchError}
                  showManualPaste={showManualPaste}
                  lpTokenRecord={lpTokenRecord}
                  onSelect={(idx: number) => {
                    setSelectedLPIndex(idx)
                    setLpTokenRecord(lpTokens[idx].plaintext)
                  }}
                  onManualChange={setLpTokenRecord}
                  onToggleManual={() => setShowManualPaste(!showManualPaste)}
                  onRefresh={fetchLPTokens}
                  tokenSymbol={tokenSymbol}
                />

                {/* Non-creator notice */}
                {!isCreator && wallet.connected && (
                  <div className="flex items-start gap-2.5 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                    <Info className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-yellow-300/90 leading-relaxed">
                      Your wallet is not the creator of this market. You can only remove LP if you previously added liquidity via <span className="font-mono font-semibold">add_liquidity</span> and hold an LP Token record for this market.
                    </p>
                  </div>
                )}

                {/* LP Shares to Remove */}
                <div>
                  <label className="block text-sm text-surface-400 mb-2">
                    LP Shares to Remove
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={lpSharesInput}
                      onChange={(e) => setLpSharesInput(e.target.value)}
                      placeholder="0.00"
                      className="input-field text-xl font-semibold pr-20"
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-surface-400 text-sm">
                      LP shares
                    </div>
                  </div>
                </div>

                {/* Tokens Out Preview */}
                {lpSharesMicro > 0n && (
                  <div className="p-4 rounded-xl bg-surface-800/50">
                    <div className="flex justify-between items-center">
                      <span className="text-surface-400 text-sm">Tokens You Receive</span>
                      <span className="text-white font-semibold">
                        {formatCredits(tokensOut)} {tokenSymbol}
                      </span>
                    </div>
                  </div>
                )}

                <button
                  onClick={handleRemoveLiquidity}
                  disabled={!lpSharesInput || parseFloat(lpSharesInput) <= 0 || !lpTokenRecord || isSubmitting}
                  className={cn(
                    'w-full flex items-center justify-center gap-2 btn-primary',
                    (!lpSharesInput || parseFloat(lpSharesInput) <= 0 || !lpTokenRecord) && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Confirm in Wallet...</span>
                    </>
                  ) : (
                    <>
                      <Minus className="w-5 h-5" />
                      <span>Remove Liquidity</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Error Display */}
            {error && (
              <div className="flex items-start gap-3 p-4 rounded-xl bg-no-500/10 border border-no-500/20 mt-4">
                <AlertCircle className="w-5 h-5 text-no-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-no-400">{error}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// LP Token Selector — auto-fetch from wallet + manual paste fallback
// ============================================================================

interface LPTokenSelectorProps {
  lpTokens: ParsedLPToken[]
  selectedLPIndex: number
  isFetchingLP: boolean
  lpFetchError: string | null
  showManualPaste: boolean
  lpTokenRecord: string
  onSelect: (idx: number) => void
  onManualChange: (value: string) => void
  onToggleManual: () => void
  onRefresh: () => void
  tokenSymbol: string
}

function LPTokenSelector({
  lpTokens,
  selectedLPIndex,
  isFetchingLP,
  lpFetchError,
  showManualPaste,
  lpTokenRecord,
  onSelect,
  onManualChange,
  onToggleManual,
  onRefresh,
  tokenSymbol,
}: LPTokenSelectorProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm text-surface-400">LP Token Record</label>
        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            disabled={isFetchingLP}
            className="flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn('w-3 h-3', isFetchingLP && 'animate-spin')} />
            {isFetchingLP ? 'Fetching...' : 'Refresh'}
          </button>
          <button
            onClick={onToggleManual}
            className="flex items-center gap-1 text-xs text-surface-500 hover:text-surface-300 transition-colors"
          >
            <Edit3 className="w-3 h-3" />
            {showManualPaste ? 'Auto' : 'Paste'}
          </button>
        </div>
      </div>

      {showManualPaste ? (
        /* Manual paste fallback */
        <div>
          <textarea
            value={lpTokenRecord}
            onChange={(e) => onManualChange(e.target.value)}
            placeholder="Paste your LPToken record plaintext here..."
            className="input-field w-full h-24 resize-none text-sm font-mono"
          />
          <p className="text-xs text-surface-500 mt-1">
            Paste the record from your wallet or block explorer.
          </p>
        </div>
      ) : isFetchingLP ? (
        /* Loading state */
        <div className="flex items-center justify-center gap-2 p-6 rounded-xl bg-surface-800/50 border border-surface-700/50">
          <Loader2 className="w-4 h-4 animate-spin text-brand-400" />
          <span className="text-sm text-surface-400">Fetching LP tokens from wallet...</span>
        </div>
      ) : lpFetchError ? (
        /* Error state */
        <div className="p-4 rounded-xl bg-no-500/10 border border-no-500/20">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-no-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-no-400">{lpFetchError}</p>
              <button
                onClick={onToggleManual}
                className="text-xs text-surface-400 hover:text-surface-300 mt-1 underline"
              >
                Paste record manually instead
              </button>
            </div>
          </div>
        </div>
      ) : lpTokens.length === 0 ? (
        /* No records found */
        <div className="p-4 rounded-xl bg-surface-800/50 border border-surface-700/50 text-center">
          <p className="text-sm text-surface-400 mb-2">No LP tokens found for this market</p>
          <p className="text-xs text-surface-500 mb-3">
            LP tokens are created when you add liquidity or create a market.
          </p>
          <button
            onClick={onToggleManual}
            className="text-xs text-brand-400 hover:text-brand-300 underline"
          >
            Paste record manually
          </button>
        </div>
      ) : (
        /* LP Token list */
        <div className="space-y-2">
          {lpTokens.map((lp, idx) => (
            <button
              key={idx}
              onClick={() => onSelect(idx)}
              className={cn(
                'w-full text-left p-3 rounded-xl border transition-all',
                selectedLPIndex === idx
                  ? 'bg-brand-500/10 border-brand-500/30'
                  : 'bg-surface-800/50 border-surface-700/50 hover:border-surface-600'
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Droplets className="w-4 h-4 text-accent-400" />
                  <span className="text-sm font-semibold text-white">
                    {formatCredits(lp.lpShares)} LP shares
                  </span>
                </div>
                <span className="text-xs text-surface-500 font-mono">
                  {tokenSymbol}
                </span>
              </div>
              {lp.marketId && (
                <p className="text-[10px] text-surface-500 font-mono mt-1 truncate">
                  Market: {lp.marketId.slice(0, 20)}...
                </p>
              )}
            </button>
          ))}
          {lpTokens.length > 0 && (
            <p className="text-xs text-surface-500 text-center">
              {lpTokens.length} LP token{lpTokens.length > 1 ? 's' : ''} found
            </p>
          )}
        </div>
      )}
    </div>
  )
}
