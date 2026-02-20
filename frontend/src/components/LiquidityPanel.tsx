import { motion } from 'framer-motion'
import { Droplets, Plus, Minus, Loader2, AlertCircle, Check } from 'lucide-react'
import { useState, useMemo } from 'react'
import { type Market, useWalletStore, CONTRACT_INFO } from '@/lib/store'
import { useAleoTransaction } from '@/hooks/useAleoTransaction'
import { cn, formatCredits, getTokenSymbol } from '@/lib/utils'
import { buildAddLiquidityInputs, buildRemoveLiquidityInputs } from '@/lib/aleo-client'
import { calculateLPSharesOut, calculateLPTokensOut } from '@/lib/amm'
import { TransactionLink } from './TransactionLink'

interface LiquidityPanelProps {
  market: Market
}

type LiquidityTab = 'add' | 'remove'

export function LiquidityPanel({ market }: LiquidityPanelProps) {
  const { wallet } = useWalletStore()
  const { executeTransaction } = useAleoTransaction()

  const [activeTab, setActiveTab] = useState<LiquidityTab>('add')
  const [amount, setAmount] = useState('')
  const [lpSharesInput, setLpSharesInput] = useState('')
  const [lpTokenRecord, setLpTokenRecord] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [transactionId, setTransactionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const tokenSymbol = getTokenSymbol(market.tokenType)

  // Total liquidity and LP shares from on-chain pool data
  const totalLiquidity = market.totalLiquidity ?? (market.yesReserve + market.noReserve)
  const totalLPShares = market.totalLPShares ?? totalLiquidity

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

  const isMarketActive = market.status === 1

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
              Pool: {formatCredits(totalLiquidity)} {tokenSymbol}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex bg-surface-800/50 rounded-xl p-1">
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
              {activeTab === 'add' ? 'Liquidity Added' : 'Liquidity Removed'}
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
            {!isMarketActive && (
              <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20 mb-4">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0" />
                  <p className="text-sm text-yellow-400">
                    This market is no longer active. Liquidity modifications may be limited.
                  </p>
                </div>
              </div>
            )}

            {activeTab === 'add' ? (
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
                  disabled={!amount || parseFloat(amount) <= 0 || isSubmitting || !isMarketActive}
                  className={cn(
                    'w-full flex items-center justify-center gap-2 btn-primary',
                    (!amount || parseFloat(amount) <= 0 || !isMarketActive) && 'opacity-50 cursor-not-allowed'
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
                {/* LP Token Record */}
                <div>
                  <label className="block text-sm text-surface-400 mb-2">
                    LP Token Record
                  </label>
                  <textarea
                    value={lpTokenRecord}
                    onChange={(e) => setLpTokenRecord(e.target.value)}
                    placeholder="Paste your LPToken record here..."
                    className="input-field w-full h-24 resize-none text-sm font-mono"
                  />
                </div>

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
