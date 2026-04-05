import { useCallback, useEffect, useState } from 'react'
import { Loader2, RefreshCw, Shield, AlertCircle, Check, Coins } from 'lucide-react'
import { useWalletStore } from '@/lib/store'
import { useAleoTransaction } from '@/hooks/useAleoTransaction'
import { config } from '@/lib/config'
import { getMappingValue } from '@/lib/aleo-client'
import { cn } from '@/lib/utils'
import { formatParlayAmount } from '@/lib/parlay-helpers'
import type { ParlayTokenType } from '@/lib/parlay-store'
import { TransactionLink } from './TransactionLink'

const ADMIN_ADDRESS = 'aleo10tm5ektsr5v7kdc5phs8pha42vrkhe2rlxfl2v979wunhzx07vpqnqplv8'

const TOKEN_TYPE_TO_ID: Record<ParlayTokenType, number> = { ALEO: 1, USDCX: 2, USAD: 3 }
const TOKENS: ParlayTokenType[] = ['ALEO', 'USDCX', 'USAD']

interface PoolState {
  pool: bigint
  exposure: bigint
  treasury: bigint
  available: bigint
}

export function ParlayPoolAdmin() {
  const { wallet } = useWalletStore()
  const { executeTransaction, pollTransactionStatus } = useAleoTransaction()

  const [pools, setPools] = useState<Record<ParlayTokenType, PoolState>>({
    ALEO: { pool: 0n, exposure: 0n, treasury: 0n, available: 0n },
    USDCX: { pool: 0n, exposure: 0n, treasury: 0n, available: 0n },
    USAD: { pool: 0n, exposure: 0n, treasury: 0n, available: 0n },
  })
  const [loading, setLoading] = useState(false)
  const [fundAmount, setFundAmount] = useState('')
  const [selectedToken, setSelectedToken] = useState<ParlayTokenType>('ALEO')
  const [funding, setFunding] = useState(false)
  const [txId, setTxId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const isAdmin = wallet.address === ADMIN_ADDRESS

  const fetchPoolState = useCallback(async () => {
    setLoading(true)
    const programId = config.parlayProgramId
    const newPools = { ...pools }

    for (const token of TOKENS) {
      const id = TOKEN_TYPE_TO_ID[token]
      const [pool, exposure, treasury] = await Promise.all([
        getMappingValue<bigint>('parlay_pool', `${id}u8`, programId).catch(() => null),
        getMappingValue<bigint>('total_exposure', `${id}u8`, programId).catch(() => null),
        getMappingValue<bigint>('parlay_treasury', `${id}u8`, programId).catch(() => null),
      ])
      const p = pool ?? 0n
      const e = exposure ?? 0n
      newPools[token] = {
        pool: p,
        exposure: e,
        treasury: treasury ?? 0n,
        available: p > e ? p - e : 0n,
      }
    }

    setPools(newPools)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchPoolState()
  }, [fetchPoolState])

  const handleFundPool = async () => {
    if (!isAdmin || funding) return
    setFunding(true)
    setError(null)
    setTxId(null)

    try {
      const amountNum = parseFloat(fundAmount)
      if (isNaN(amountNum) || amountNum <= 0) throw new Error('Enter a valid amount')

      const amountMicro = BigInt(Math.round(amountNum * 1_000_000))

      if (selectedToken !== 'ALEO') {
        throw new Error('Only ALEO pool funding is supported via this panel currently.')
      }

      const result = await executeTransaction({
        program: config.parlayProgramId,
        function: 'fund_pool_aleo_public',
        inputs: [`${amountMicro}u128`],
        fee: 1.0,
      })

      const submittedTxId = result.transactionId
      if (!submittedTxId) throw new Error('Transaction was not submitted')

      setTxId(submittedTxId)
      void pollTransactionStatus(submittedTxId, () => {})

      setTimeout(() => fetchPoolState(), 15000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fund pool')
    } finally {
      setFunding(false)
    }
  }

  if (!wallet.connected) return null

  return (
    <div className="rounded-[24px] border border-white/[0.08] bg-[#10141f] p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Coins className="h-5 w-5 text-brand-400" />
          <h3 className="text-lg font-semibold text-white">Parlay Pool Status</h3>
        </div>
        <button
          onClick={fetchPoolState}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-surface-400 hover:text-white transition-colors"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Refresh
        </button>
      </div>

      {/* Pool overview */}
      <div className="grid gap-3 sm:grid-cols-3 mb-6">
        {TOKENS.map((token) => {
          const state = pools[token]
          return (
            <div key={token} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-wider text-surface-500">{token} Pool</p>
              <p className="mt-2 text-xl font-semibold text-white">
                {formatParlayAmount(state.pool)} {token}
              </p>
              <div className="mt-2 space-y-1 text-xs text-surface-400">
                <div className="flex justify-between">
                  <span>Exposure</span>
                  <span className="text-amber-400">{formatParlayAmount(state.exposure)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Available</span>
                  <span className={state.available > 0n ? 'text-emerald-400' : 'text-red-400'}>
                    {formatParlayAmount(state.available)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Treasury (fees)</span>
                  <span className="text-brand-400">{formatParlayAmount(state.treasury)}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Fund pool (admin only) */}
      {isAdmin && (
        <div className="rounded-2xl border border-brand-500/20 bg-brand-500/5 p-4">
          <p className="text-sm font-medium text-white mb-3">
            <Shield className="h-4 w-4 inline mr-1.5 text-brand-400" />
            Admin: Fund Pool
          </p>

          <div className="flex gap-2 mb-3">
            {TOKENS.map((token) => (
              <button
                key={token}
                onClick={() => setSelectedToken(token)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                  selectedToken === token
                    ? 'bg-brand-500/20 text-brand-400 ring-1 ring-brand-500/50'
                    : 'bg-white/[0.04] text-surface-400 hover:text-white',
                )}
              >
                {token}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              type="number"
              value={fundAmount}
              onChange={(e) => setFundAmount(e.target.value)}
              placeholder="Amount to fund"
              className="flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder-surface-500 focus:border-brand-500 focus:outline-none"
            />
            <button
              onClick={handleFundPool}
              disabled={funding || !fundAmount}
              className={cn(
                'rounded-lg px-4 py-2 text-sm font-semibold transition-colors',
                funding || !fundAmount
                  ? 'bg-white/[0.04] text-surface-500 cursor-not-allowed'
                  : 'bg-brand-500 text-white hover:bg-brand-600',
              )}
            >
              {funding ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                `Fund ${selectedToken}`
              )}
            </button>
          </div>

          {error && (
            <div className="mt-2 flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
          )}

          {txId && (
            <div className="mt-2 flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">
              <Check className="h-3.5 w-3.5 shrink-0" />
              Fund transaction submitted
              <TransactionLink transactionId={txId} />
            </div>
          )}
        </div>
      )}

      {!isAdmin && (
        <p className="text-xs text-surface-500 text-center">
          Pool funding is restricted to the protocol admin.
        </p>
      )}
    </div>
  )
}
