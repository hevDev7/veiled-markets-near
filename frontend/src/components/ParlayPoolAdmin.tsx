import { useCallback, useEffect, useState } from 'react'
import { Loader2, RefreshCw, AlertCircle, Check, Coins } from 'lucide-react'
import { useWalletStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { formatParlayAmount } from '@/lib/parlay-helpers'
import { ENABLED_TOKEN_KEYS, TOKEN, VEILED_CONTRACT, YOCTO_PER_MICRO, tokenAccount, tokenLabel } from '@/lib/near/config'
import { getParlayPool, parlayErrorText, type NearParlayPool } from '@/lib/near/parlay'
import { callContract } from '@/lib/near/near-wallet'
import { invalidateViews } from '@/lib/near/rpc'
import { TransactionLink } from './TransactionLink'

type PoolKey = (typeof ENABLED_TOKEN_KEYS)[number]

/** "1.5" → 1_500_000 micro units; null when the text is not a positive amount with at most 6 decimals. */
function toMicro(text: string): bigint | null {
  const m = text.trim().match(/^(\d+)(?:\.(\d{0,6}))?$/)
  if (!m) return null
  const micro = BigInt(m[1]) * 1_000_000n + BigInt((m[2] ?? '').padEnd(6, '0') || '0')
  return micro > 0n ? micro : null
}

/**
 * The house pool that pays winning parlays. Anyone can add to it (the contract keeps it, and only the owner can take
 * out what is not needed to cover 110% of open tickets); this panel shows how much room it leaves for new parlays.
 */
export function ParlayPoolAdmin() {
  const { wallet } = useWalletStore()
  const [pool, setPool] = useState<NearParlayPool | null>(null)
  const [loading, setLoading] = useState(false)
  const [fundAmount, setFundAmount] = useState('')
  const [selected, setSelected] = useState<PoolKey>('NEAR')
  const [funding, setFunding] = useState(false)
  const [txId, setTxId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      invalidateViews('get_parlay_pool')
      setPool(await getParlayPool())
    } catch (err) {
      setError(parlayErrorText(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const handleFund = async () => {
    const micro = toMicro(fundAmount)
    if (!micro) {
      setError('Enter an amount, for example 1 or 2.5.')
      return
    }
    setFunding(true)
    setError(null)
    setTxId(null)
    try {
      const token = TOKEN[selected]
      const r = token === TOKEN.NEAR
        ? await callContract({ method: 'fund_parlay_pool', args: { token }, deposit: micro * YOCTO_PER_MICRO, gas: 30_000_000_000_000n })
        : await callContract({
            contractId: tokenAccount(token)!,
            method: 'ft_transfer_call',
            args: { receiver_id: VEILED_CONTRACT, amount: micro.toString(), msg: JSON.stringify({ fund_parlay_pool: {} }) },
            deposit: 1n,
            gas: 100_000_000_000_000n,
          })
      setTxId(r.txHash)
      setFundAmount('')
      await refresh()
    } catch (err) {
      setError(parlayErrorText(err))
    } finally {
      setFunding(false)
    }
  }

  const safetyBps = BigInt(pool?.safety_bps ?? '11000')
  const rows = ENABLED_TOKEN_KEYS.map((key) => {
    const id = TOKEN[key]
    const p = BigInt(pool?.pool[id] ?? '0')
    const e = BigInt(pool?.exposure[id] ?? '0')
    const covered = (e * safetyBps) / 10_000n
    return { key, pool: p, exposure: e, room: p > covered ? ((p - covered) * 10_000n) / safetyBps : 0n }
  })

  return (
    <div className="rounded-[24px] border border-white/[0.08] bg-[#10141f] p-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Coins className="h-5 w-5 text-brand-400" />
          <h3 className="text-lg font-semibold text-white">Parlay Pool</h3>
          {pool?.paused && (
            <span className="rounded-full border border-amber-500/20 bg-amber-500/15 px-2 py-0.5 text-xs text-amber-300">Paused</span>
          )}
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-surface-400 transition-colors hover:text-white"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Refresh
        </button>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.key} className="rounded-2xl border border-white/[0.06] bg-black/20 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-surface-500">{tokenLabel(r.key)}</p>
            <div className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between gap-3"><span className="text-surface-400">Pool</span><span className="text-white">{formatParlayAmount(r.pool)}</span></div>
              <div className="flex justify-between gap-3"><span className="text-surface-400">Open tickets could pay</span><span className="text-white">{formatParlayAmount(r.exposure)}</span></div>
              <div className="flex justify-between gap-3"><span className="text-surface-400">Room for new payouts</span><span className="text-emerald-300">{formatParlayAmount(r.room)}</span></div>
            </div>
          </div>
        ))}
      </div>

      <p className="mb-4 text-xs leading-relaxed text-surface-500">
        Every parlay&apos;s potential payout must stay covered 110% by this pool, so a large ticket can be refused until the
        pool grows. Anyone can add to it; added funds stay in the pool.
      </p>

      {wallet.connected && (
        <div className="space-y-3">
          <div className="flex gap-2">
            {ENABLED_TOKEN_KEYS.map((key) => (
              <button
                key={key}
                onClick={() => setSelected(key)}
                className={cn(
                  'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                  selected === key ? 'border-brand-400/40 bg-brand-500/15 text-brand-200' : 'border-white/10 bg-white/5 text-surface-400 hover:text-white',
                )}
              >
                {tokenLabel(key)}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={fundAmount}
              onChange={(e) => setFundAmount(e.target.value)}
              inputMode="decimal"
              placeholder={`Amount in ${tokenLabel(selected)}`}
              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-surface-500 focus:border-brand-400/50 focus:outline-none"
            />
            <button
              onClick={handleFund}
              disabled={funding}
              className="flex items-center gap-1.5 rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-60"
            >
              {funding && <Loader2 className="h-4 w-4 animate-spin" />}
              Add to pool
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {txId && (
        <div className="mt-3 flex items-center gap-2 text-sm text-emerald-300">
          <Check className="h-4 w-4" />
          <span>Added to the pool.</span>
          <TransactionLink transactionId={txId} />
        </div>
      )}
    </div>
  )
}
