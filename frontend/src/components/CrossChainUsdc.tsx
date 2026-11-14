// USDC on other chains through 1Click (mainnet only; PrivateBalancePanel shows this when ONECLICK_UI is on).
// Bring in: 1Click delivers USDC from another chain to the NEAR wallet, then a deposit moves it into the private
// balance. Take out: a private withdraw pays 1Click's deposit address, and 1Click sends the USDC on to the other chain.
// Every quote is used only once 1Click's signature shows it is for what the user asked (lib/near/oneclick.ts).
// The transfer under way is kept in this browser, so its deposit address and deadline survive a reload; once the
// deadline has passed with no deposit seen, the page stops offering the address.
import { useEffect, useState } from 'react'
import { ArrowDownToLine, ArrowUpFromLine, Copy, ExternalLink, Globe, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TOKEN, txUrl } from '@/lib/near/config'
import { deposit, type PrivateStep } from '@/lib/near/private'
import {
  TransferExpired, bringIn, chainLabel, deadlineText, fromUnits, quoteIn, quoteOut, refundNotice, refundProblem, saveTransfer,
  savedTransfer, takeOut, toUnits, usdcChains, waitForSwap, watchUntil,
  type OneClickQuote, type SavedTransfer, type SwapState, type SwapStatus, type UsdcChain,
} from '@/lib/near/oneclick'

const STATUS_TEXT: Record<SwapStatus, string> = {
  PENDING_DEPOSIT: 'Waiting for the deposit…',
  KNOWN_DEPOSIT_TX: 'Deposit seen; waiting for it to confirm…',
  PROCESSING: '1Click is moving the USDC…',
  SUCCESS: 'Done.',
  INCOMPLETE_DEPOSIT: 'Less than the quoted amount arrived. 1Click refunds it after the deadline.',
  REFUNDED: 'Refunded.',
  FAILED: 'The transfer failed. Contact 1Click support with the deposit address above.',
}

const STEP_TEXT: Record<PrivateStep, string> = {
  unlocking: 'Waiting for the wallet signature…',
  syncing: 'Syncing your private notes…',
  merging: 'Merging notes…',
  proving: 'Generating the zero-knowledge proof…',
  relaying: 'The relayer is paying 1Click from your private balance…',
  done: 'Paid. Waiting for 1Click…',
}

const ENDED = new Set<SwapStatus>(['SUCCESS', 'REFUNDED', 'FAILED'])
/** The least the quote shown to the user promised: a real quote must not promise less. */
const shownAtLeast = (q: OneClickQuote | null) => (q && /^\d+$/.test(q.minAmountOut) ? BigInt(q.minAmountOut) : undefined)
const field = 'w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-white text-sm'
const secondary = 'px-4 py-2.5 rounded-lg bg-white/[0.04] border border-white/10 text-surface-200 hover:bg-white/[0.08] transition-all text-sm disabled:opacity-50'
const primary = 'px-4 py-2.5 rounded-lg bg-brand-500/15 border border-brand-500/30 text-brand-300 hover:bg-brand-500/25 transition-all text-sm disabled:opacity-50'

export function CrossChainUsdc({ account, privateMicro, onChange }: {
  account: string
  privateMicro: bigint
  onChange: () => Promise<void>
}) {
  const [mode, setMode] = useState<'in' | 'out'>('in')
  const [chains, setChains] = useState<UsdcChain[]>([])
  const [assetId, setAssetId] = useState('')
  const [amount, setAmount] = useState('')
  // The user's own address on the other chain: where a bring-in is refunded, or where a take-out goes.
  const [address, setAddress] = useState('')
  // Where a take-out is refunded, on NEAR: the connected account unless the user names another.
  const [refund, setRefund] = useState(account)
  const [preview, setPreview] = useState<OneClickQuote | null>(null)
  const [transfer, setTransfer] = useState<SavedTransfer | null>(() => savedTransfer(account))
  const [swap, setSwap] = useState<SwapState | null>(null)
  // The deadline passed with no deposit seen: the page no longer watches the transfer.
  const [expired, setExpired] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    usdcChains()
      .then((list) => {
        if (!live) return
        setChains(list)
        setAssetId((current) => current || list[0]?.assetId || '')
      })
      .catch((err) => live && setError(err instanceof Error ? err.message : String(err)))
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    setTransfer(savedTransfer(account))
    setSwap(null)
    setExpired(false)
    setRefund(account)
  }, [account])

  // Follows the transfer under way until it ends, or until its deadline passes with no deposit seen; the balances
  // change when it ends.
  const watching = transfer?.depositAddress
  useEffect(() => {
    if (!transfer) return
    const stop = new AbortController()
    setExpired(false)
    waitForSwap(transfer.depositAddress, setSwap, { memo: transfer.memo, signal: stop.signal, until: watchUntil(transfer) })
      .then(() => onChange())
      .catch((err) => {
        if (err instanceof TransferExpired && !stop.signal.aborted) setExpired(true)
      })
    return () => stop.abort()
    // Keyed on the address: a transfer re-read from storage is the same transfer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watching])

  const chain = chains.find((c) => c.assetId === assetId)
  const name = chain ? chainLabel(chain, chains) : ''
  // A bring-in is typed in the other chain's USDC; a take-out in USDC on NEAR (6 decimals).
  const units = toUnits(amount, mode === 'in' ? (chain?.decimals ?? 6) : 6)

  const edit = (change: () => void) => {
    change()
    setPreview(null)
    setError(null)
    setNote(null)
  }

  const fail = (err: unknown) => {
    setError(err instanceof Error ? err.message : String(err))
    setNote(null)
    setBusy(false)
  }

  const problem = (): string | null => {
    if (!chain) return 'Pick a chain.'
    if (!units) return 'Enter an amount.'
    if (!address.trim()) return mode === 'in' ? `Enter your ${name} address, for refunds.` : `Enter the ${name} address to send to.`
    if (mode === 'out' && units > privateMicro) return `Your private balance is ${fromUnits(privateMicro, 6)} USDC.`
    if (mode === 'out') return refundProblem(refund.trim())
    return null
  }

  const ask = (dry: boolean) =>
    mode === 'in'
      ? quoteIn({ from: assetId, amount: units!, refundTo: address.trim(), recipient: account, dry })
      : quoteOut({ to: assetId, amount: units!, recipient: address.trim(), refundTo: refund.trim(), dry })

  const begin = (t: SavedTransfer) => {
    saveTransfer(account, t)
    setTransfer(t)
    setSwap(null)
    setExpired(false)
    setPreview(null)
    setAmount('')
  }

  const dismiss = () => {
    saveTransfer(account, null)
    setTransfer(null)
    setSwap(null)
    setExpired(false)
  }

  const handleQuote = async () => {
    const why = problem()
    if (why) return setError(why)
    setBusy(true)
    setError(null)
    try {
      setPreview(await ask(true))
      setBusy(false)
    } catch (err) {
      fail(err)
    }
  }

  const handleBringIn = async () => {
    const why = problem()
    if (why || !chain) return setError(why)
    setBusy(true)
    setError(null)
    try {
      const q = await bringIn({ from: assetId, amount: units!, refundTo: address.trim(), recipient: account, atLeast: shownAtLeast(preview) })
      begin({ mode: 'in', chain, amount, depositAddress: q.depositAddress, memo: q.depositMemo, quote: q })
      setBusy(false)
    } catch (err) {
      fail(err)
    }
  }

  const handleTakeOut = async () => {
    const why = problem()
    if (why || !chain || !units) return setError(why)
    setBusy(true)
    setError(null)
    try {
      const refundTo = refund.trim()
      const r = await takeOut(
        { to: assetId, micro: units, recipient: address.trim(), refundTo, atLeast: shownAtLeast(preview) },
        (s) => setNote(STEP_TEXT[s]),
      )
      begin({ mode: 'out', chain, amount, depositAddress: r.depositAddress, quote: r.quote, txHash: r.txHash, refundTo })
      setNote(null)
      setBusy(false)
      await onChange()
    } catch (err) {
      fail(err)
    }
  }

  /** Moves what 1Click delivered into the private balance (gasless when the wallet and the relayer offer it). */
  const handleDepositArrived = async () => {
    const delivered = swap?.swapDetails?.amountOut
    if (!delivered) return
    setBusy(true)
    setError(null)
    try {
      setNote('Confirm the deposit in your wallet…')
      await deposit(TOKEN.USDCX, BigInt(delivered))
      dismiss()
      setNote(`Deposited ${fromUnits(delivered, 6)} USDC into your private balance.`)
      setBusy(false)
      await onChange()
    } catch (err) {
      fail(err)
    }
  }

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setNote('Copied.')
    } catch {
      setNote(text)
    }
  }

  const ended = !!swap && ENDED.has(swap.status)
  const there = transfer ? chainLabel(transfer.chain, chains.length ? chains : [transfer.chain]) : ''
  const destinationTx = swap?.swapDetails?.destinationChainTxHashes?.[0]
  // A bring-in nothing was sent to yet can be dropped; once a deposit is seen it runs to its end.
  const cancellable = transfer?.mode === 'in' && !expired && (!swap || swap.status === 'PENDING_DEPOSIT')
  const linked = mode === 'out' ? refundNotice(refund.trim(), account) : null

  return (
    <div className="mt-6 pt-5 border-t border-white/[0.06]">
      <div className="flex items-center gap-2 mb-1">
        <Globe className="w-4 h-4 text-brand-400" />
        <h3 className="text-sm font-semibold text-white">USDC on other chains</h3>
      </div>
      <p className="mb-3 text-xs text-surface-400">Through 1Click (NEAR Intents). Transfers are public on both chains.</p>

      {transfer ? (
        <div className="space-y-2 text-sm text-surface-300">
          {transfer.mode === 'in' && expired ? (
            <p className="text-amber-300">
              The deadline ({deadlineText(transfer.quote.deadline)}) passed and 1Click saw no deposit. Do not send USDC to
              that deposit address any more: USDC sent there now may be lost. If you sent some, contact 1Click support with
              your transaction on {there}.
            </p>
          ) : transfer.mode === 'in' ? (
            <>
              <p>
                Send exactly{' '}
                <span className="text-white font-medium">
                  {transfer.quote.amountInFormatted ?? transfer.amount} USDC on {there}
                </span>{' '}
                to:
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 min-w-0 break-all px-3 py-2 rounded-lg bg-black/20 text-xs text-surface-200">
                  {transfer.depositAddress}
                </code>
                <button
                  onClick={() => copy(transfer.depositAddress)}
                  aria-label="Copy the deposit address"
                  className="p-2 rounded-lg bg-white/[0.05] hover:bg-white/[0.08] text-surface-200"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
              {transfer.memo && (
                <p>
                  Include the memo <code className="px-1.5 py-0.5 rounded bg-black/20 text-xs">{transfer.memo}</code>: without
                  it the deposit is not credited.
                </p>
              )}
              <p className="text-xs text-amber-300">
                Send only USDC on {there}, before {deadlineText(transfer.quote.deadline)}. USDC sent after that may be lost.
              </p>
            </>
          ) : (
            <>
              <p>
                Sent {transfer.amount} USDC from your private balance to 1Click
                {transfer.txHash && (
                  <>
                    {' ('}
                    <a href={txUrl(transfer.txHash)} target="_blank" rel="noopener noreferrer" className="text-brand-400 hover:text-brand-300">
                      transaction
                    </a>
                    {')'}
                  </>
                )}
                , on its way to {there}.
              </p>
              {expired && (
                <p className="text-amber-300 break-all">
                  1Click had not seen this payment by the deadline ({deadlineText(transfer.quote.deadline)}). Contact 1Click
                  support with the transaction and the deposit address {transfer.depositAddress}.
                </p>
              )}
            </>
          )}

          {!expired && (
            <p className="flex items-center gap-2">
              {!ended && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{swap ? STATUS_TEXT[swap.status] : 'Checking with 1Click…'}</span>
            </p>
          )}

          {swap?.status === 'SUCCESS' && transfer.mode === 'in' && (
            <>
              <p>
                {fromUnits(swap.swapDetails?.amountOut ?? transfer.quote.amountOut, 6)} USDC arrived in {account}, as public
                USDC.
              </p>
              {swap.swapDetails?.amountOut && (
                <button onClick={handleDepositArrived} disabled={busy} className={cn(primary, 'w-full flex items-center justify-center gap-2')}>
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowDownToLine className="w-4 h-4" />}
                  <span>Deposit it into your private balance</span>
                </button>
              )}
            </>
          )}
          {swap?.status === 'SUCCESS' && transfer.mode === 'out' && (
            <p>
              Delivered {swap.swapDetails?.amountOutFormatted ?? transfer.quote.amountOutFormatted} USDC on {there}.
              {destinationTx && (
                <>
                  {' '}
                  <a
                    href={destinationTx.explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-brand-400 hover:text-brand-300"
                  >
                    <span>View on the explorer</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </>
              )}
            </p>
          )}
          {swap?.status === 'REFUNDED' && (
            <p>
              {transfer.mode === 'in'
                ? `1Click refunded ${swap.swapDetails?.refundedAmountFormatted ?? 'the'} USDC to your ${there} address.`
                : `1Click refunded ${swap.swapDetails?.refundedAmountFormatted ?? 'the'} USDC to ${transfer.refundTo ?? account} as public USDC. Deposit it from that account to make it private again.`}
            </p>
          )}
          {(ended || expired) && (
            <button onClick={dismiss} disabled={busy} className={secondary}>
              {ended ? 'Done' : 'Forget this transfer'}
            </button>
          )}
          {cancellable && (
            <button onClick={dismiss} disabled={busy} className={secondary}>
              Cancel (only if you sent nothing)
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex gap-2">
            {(
              [
                ['in', 'Bring in', ArrowDownToLine],
                ['out', 'Take out', ArrowUpFromLine],
              ] as const
            ).map(([m, label, Icon]) => (
              <button
                key={m}
                onClick={() => edit(() => setMode(m))}
                disabled={busy}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors',
                  mode === m ? 'bg-brand-500/20 text-brand-300' : 'bg-white/[0.03] text-surface-400 hover:text-white',
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{label}</span>
              </button>
            ))}
          </div>
          <select
            value={assetId}
            onChange={(e) => edit(() => setAssetId(e.target.value))}
            disabled={busy || chains.length === 0}
            aria-label="Chain"
            className={field}
          >
            {chains.map((c) => (
              <option key={c.assetId} value={c.assetId}>
                {chainLabel(c, chains)}
              </option>
            ))}
          </select>
          <input
            value={amount}
            onChange={(e) => edit(() => setAmount(e.target.value))}
            inputMode="decimal"
            placeholder={mode === 'in' ? `Amount of USDC on ${name || 'that chain'}` : 'Amount of USDC from your private balance'}
            disabled={busy}
            className={field}
          />
          <input
            value={address}
            onChange={(e) => edit(() => setAddress(e.target.value))}
            placeholder={mode === 'in' ? `Your ${name || 'other-chain'} address, for refunds` : `${name || 'Other-chain'} address to send to`}
            disabled={busy}
            spellCheck={false}
            className={field}
          />
          {mode === 'out' && (
            <>
              <input
                value={refund}
                onChange={(e) => edit(() => setRefund(e.target.value))}
                placeholder="NEAR account for refunds"
                aria-label="NEAR account for refunds"
                disabled={busy}
                spellCheck={false}
                className={field}
              />
              {linked && <p className="text-xs text-amber-300">{linked}</p>}
            </>
          )}
          {preview && chain && (
            <p className="text-sm text-surface-300">
              {mode === 'in'
                ? `You receive about ${preview.amountOutFormatted ?? fromUnits(preview.amountOut, 6)} USDC in ${account} (at least ${fromUnits(preview.minAmountOut, 6)}), about ${preview.timeEstimate ?? '?'} s after your deposit confirms.`
                : `About ${preview.amountOutFormatted ?? fromUnits(preview.amountOut, chain.decimals)} USDC arrives on ${name} (at least ${fromUnits(preview.minAmountOut, chain.decimals)}), about ${preview.timeEstimate ?? '?'} s after the withdraw.`}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <button onClick={handleQuote} disabled={busy} className={secondary}>
              Get a quote
            </button>
            <button
              onClick={mode === 'in' ? handleBringIn : handleTakeOut}
              disabled={busy || !preview}
              className={cn(primary, 'flex items-center justify-center gap-2')}
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{mode === 'in' ? 'Get the deposit address' : 'Send'}</span>
            </button>
          </div>
        </div>
      )}

      {note && <p className="mt-3 text-sm text-surface-300 break-all">{note}</p>}
      {error && <p className="mt-3 text-sm text-no-400">{error}</p>}
    </div>
  )
}
