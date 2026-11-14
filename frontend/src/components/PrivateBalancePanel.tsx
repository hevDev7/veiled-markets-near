// Private balance on NEAR: moves funds between the wallet and the shielded note pool. Trades spend from the
// private balance, so depositing ahead of time keeps a trade from needing a public top-up at the same moment.
import { useEffect, useState } from 'react'
import { ArrowDownToLine, ArrowUpFromLine, ExternalLink, EyeOff, KeyRound, Loader2 } from 'lucide-react'
import { useWalletStore } from '@/lib/store'
import { cn, formatCredits } from '@/lib/utils'
import { ENABLED_TOKEN_KEYS, TOKEN, USDC_FAUCET_URL, tokenLabel, txUrl } from '@/lib/near/config'
import { cachedNoteKeys, exportNoteSeed, importNoteSeed, switchToWalletKey, type NoteKeys } from '@/lib/near/notes/keys'
import { forgetNotes, unspent } from '@/lib/near/notes/store'
import { signMessage } from '@/lib/near/near-wallet'
import { deposit, noteKeys, refreshNotes, withdraw, type PrivateStep } from '@/lib/near/private'
import { ONECLICK_UI } from '@/lib/near/oneclick'
import { GAS_RESERVE_MICRO } from '@/lib/near/wallet-records'
import { CrossChainUsdc } from './CrossChainUsdc'

// NEAR and Circle USDC (internal key 'USDCX').
const TOKENS = ENABLED_TOKEN_KEYS.map((key) => ({ id: TOKEN[key], symbol: tokenLabel(key) }))

const STEP_LABEL: Record<PrivateStep, string> = {
  unlocking: 'Waiting for the wallet signature…',
  syncing: 'Syncing your private notes…',
  merging: 'Merging notes…',
  proving: 'Generating the zero-knowledge proof…',
  relaying: 'The relayer is submitting the transaction…',
  done: 'Done.',
}

/** "1.5" → 1_500_000n (6 decimals); null for anything that is not a positive amount. */
function toMicro(text: string): bigint | null {
  const t = text.trim()
  if (!/^\d+(\.\d{0,6})?$/.test(t)) return null
  const [whole, frac = ''] = t.split('.')
  const v = BigInt(whole) * 1_000_000n + BigInt((frac + '000000').slice(0, 6))
  return v > 0n ? v : null
}

const microText = (v: bigint) => (Number(v) / 1_000_000).toString()

type Busy = null | 'unlock' | 'deposit' | 'withdraw'

export function PrivateBalancePanel({ className }: { className?: string } = {}) {
  const { wallet, refreshBalance } = useWalletStore()
  const [token, setToken] = useState<number>(TOKEN.NEAR)
  const [amount, setAmount] = useState('')
  const [unlocked, setUnlocked] = useState(false)
  const [busy, setBusy] = useState<Busy>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)
  // 'local' means the key exists only in this browser: the wallet cannot sign messages, or the key dates from when a
  // failed signature request silently fell back to a random key. Either way it needs a backup.
  const [keySource, setKeySource] = useState<NoteKeys['source'] | null>(null)
  const [backupNote, setBackupNote] = useState<string | null>(null)
  const [restoreText, setRestoreText] = useState('')
  // Switching keys leaves the old key's notes behind, so the first click only reports them.
  const [switchNote, setSwitchNote] = useState<string | null>(null)
  const [switchArmed, setSwitchArmed] = useState(false)

  useEffect(() => {
    let live = true
    if (!wallet.address) {
      setUnlocked(false)
      setKeySource(null)
      return
    }
    cachedNoteKeys(wallet.address)
      .then((k) => {
        if (!live) return
        setUnlocked(!!k)
        setKeySource(k?.source ?? null)
      })
      .catch(() => live && setUnlocked(false))
    return () => {
      live = false
    }
  }, [wallet.address])

  const b = wallet.balance
  const balances: Record<number, { pub: bigint; priv: bigint }> = {
    [TOKEN.NEAR]: { pub: b.public, priv: b.private },
    [TOKEN.USDCX]: { pub: b.usdcxPublic, priv: b.usdcxPrivate },
    [TOKEN.USAD]: { pub: b.usadPublic, priv: b.usadPrivate },
  }
  const symbol = TOKENS.find((t) => t.id === token)?.symbol ?? 'NEAR'
  const { pub, priv } = balances[token]
  // Keep some NEAR in the wallet for gas; tokens need no reserve.
  const maxDeposit = token === TOKEN.NEAR ? (pub > GAS_RESERVE_MICRO ? pub - GAS_RESERVE_MICRO : 0n) : pub
  const micro = toMicro(amount)

  const begin = (kind: Exclude<Busy, null>) => {
    setBusy(kind)
    setError(null)
    setTxHash(null)
    setStatus(null)
  }

  const finish = async () => {
    setUnlocked(true)
    if (wallet.address) {
      const k = await cachedNoteKeys(wallet.address).catch(() => null)
      setKeySource(k?.source ?? null)
    }
    await refreshBalance()
    setBusy(null)
  }

  const handleBackup = async () => {
    const seed = wallet.address ? exportNoteSeed(wallet.address) : null
    if (!seed) return setError('No private balance key is stored in this browser.')
    try {
      await navigator.clipboard.writeText(seed)
      setBackupNote('Backup key copied. Keep it somewhere safe and private: whoever has it can spend this balance.')
    } catch {
      setBackupNote(`Copy this backup key and keep it safe and private: ${seed}`)
    }
  }

  /** Replaces the browser-only key with the one the wallet's signature gives (the same in every browser). */
  const handleSwitchToWalletKey = async () => {
    if (!wallet.address) return
    begin('unlock')
    try {
      if (!switchArmed) {
        setStatus(STEP_LABEL.syncing)
        await refreshNotes(true)
        const left = unspent(wallet.address).length
        if (left > 0) {
          setSwitchNote(
            `${left} private ${left === 1 ? 'note is' : 'notes are'} still on this key (a balance, shares, an LP position ` +
              'or a ticket). After switching they can be reached only by restoring the backup key, so copy it first. ' +
              'Click again to switch.',
          )
          setSwitchArmed(true)
          setStatus(null)
          setBusy(null)
          return
        }
      }
      setStatus('Confirm the signature in your wallet…')
      await switchToWalletKey(wallet.address, signMessage)
      forgetNotes(wallet.address) // the notes listed here belong to the old key
      setSwitchNote(null)
      setSwitchArmed(false)
      setBackupNote(null)
      setStatus(STEP_LABEL.syncing)
      await refreshNotes(true)
      setStatus('The private balance key now comes from your wallet signature.')
      await finish()
    } catch (err) {
      fail(err)
    }
  }

  const handleRestore = async () => {
    if (!wallet.address) return
    begin('unlock')
    try {
      await importNoteSeed(wallet.address, restoreText)
      forgetNotes(wallet.address) // notes listed under the previous key are not this key's: scan again
      setRestoreText('')
      setSwitchNote(null)
      setSwitchArmed(false)
      setStatus(STEP_LABEL.syncing)
      await refreshNotes(true)
      setStatus('Private balance key restored from the backup.')
      await finish()
    } catch (err) {
      fail(err)
    }
  }

  const fail = (err: unknown) => {
    setStatus(null)
    setError(err instanceof Error ? err.message : String(err))
    setBusy(null)
  }

  const handleUnlock = async () => {
    begin('unlock')
    try {
      setStatus(STEP_LABEL.unlocking)
      await noteKeys()
      setStatus(STEP_LABEL.syncing)
      await refreshNotes(true)
      setStatus('Private balance unlocked.')
      await finish()
    } catch (err) {
      fail(err)
    }
  }

  const handleDeposit = async () => {
    if (!micro) return setError('Enter an amount.')
    if (micro > maxDeposit) {
      return setError(
        token === TOKEN.NEAR
          ? `You can deposit up to ${microText(maxDeposit)} NEAR (0.25 NEAR stays in the wallet for gas).`
          : `Your wallet has ${microText(pub)} ${symbol}.`,
      )
    }
    begin('deposit')
    try {
      setStatus('Confirm the deposit in your wallet…')
      const r = await deposit(token, micro)
      setTxHash(r.txHash)
      setStatus(`Deposited ${microText(micro)} ${symbol} into your private balance.`)
      setAmount('')
      await finish()
    } catch (err) {
      fail(err)
    }
  }

  const handleWithdraw = async () => {
    if (!micro) return setError('Enter an amount.')
    if (!wallet.address) return setError('Connect a NEAR wallet first.')
    if (micro > priv) return setError(`Your private balance is ${microText(priv)} ${symbol}.`)
    begin('withdraw')
    try {
      const r = await withdraw(token, micro, wallet.address, (s) => setStatus(STEP_LABEL[s]))
      setTxHash(r.txHash)
      setStatus(`Withdrew ${microText(micro)} ${symbol} to ${wallet.address}.`)
      setAmount('')
      await finish()
    } catch (err) {
      fail(err)
    }
  }

  return (
    <div className={cn('glass-card p-6', className)}>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center">
          <EyeOff className="w-5 h-5 text-brand-400" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-white">Private balance</h2>
          <p className="text-sm text-surface-400">Trades spend from here, so they are not linked to your account</p>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        {TOKENS.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setToken(t.id)
              setError(null)
            }}
            disabled={busy !== null}
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm transition-colors',
              token === t.id ? 'bg-brand-500/20 text-brand-300' : 'bg-white/[0.03] text-surface-400 hover:text-white',
            )}
          >
            {t.symbol}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="p-4 rounded-xl bg-white/[0.02]">
          <p className="text-sm text-surface-400 mb-1">Private</p>
          <p className="text-lg font-bold text-white">
            {unlocked ? `${formatCredits(priv)} ${symbol}` : 'Locked'}
          </p>
        </div>
        <div className="p-4 rounded-xl bg-white/[0.02]">
          <p className="text-sm text-surface-400 mb-1">Wallet</p>
          <p className="text-lg font-bold text-white">
            {formatCredits(pub)} {symbol}
          </p>
        </div>
      </div>

      {token === TOKEN.USDCX && (
        <p className="-mt-1 mb-4 text-xs text-surface-400">
          <a
            href={USDC_FAUCET_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-brand-400 hover:text-brand-300"
          >
            <span>Get test USDC from Circle's faucet (choose NEAR Testnet)</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </p>
      )}

      {unlocked && keySource === 'local' && (
        <div className="mb-4 p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-sm text-amber-200 space-y-2">
          <p>
            The key to this private balance exists only in this browser: it was not derived from your wallet&apos;s
            signature. If this browser&apos;s data is cleared, the balance and every private position are lost. Copy
            the backup key and keep it somewhere safe and private; pasting it here restores them in another browser.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleBackup}
              className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-100 transition-colors"
            >
              Copy backup key
            </button>
            <input
              value={restoreText}
              onChange={(e) => setRestoreText(e.target.value)}
              placeholder="Paste a backup key to restore"
              className="flex-1 min-w-[12rem] px-3 py-1.5 rounded-lg bg-black/20 border border-amber-500/20 text-amber-100 placeholder:text-amber-200/40"
            />
            <button
              onClick={handleRestore}
              disabled={busy !== null || !restoreText.trim()}
              className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-100 transition-colors disabled:opacity-50"
            >
              Restore
            </button>
          </div>
          {backupNote && <p className="text-xs break-all">{backupNote}</p>}
          <div className="pt-2 border-t border-amber-500/20 space-y-2">
            <p>
              Or switch to a key derived from your wallet&apos;s signature. Any browser with the same wallet gets it
              back by signing again, so it survives cleared browser data.
            </p>
            <button
              onClick={handleSwitchToWalletKey}
              disabled={busy !== null}
              className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-100 transition-colors disabled:opacity-50"
            >
              {switchArmed ? 'Switch now, leaving those notes on the old key' : 'Use my wallet\'s key instead'}
            </button>
            {switchNote && <p className="text-xs">{switchNote}</p>}
          </div>
        </div>
      )}

      {unlocked && keySource === 'signature' && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-surface-400">
          <span>Have a backup key from a browser-only balance?</span>
          <input
            value={restoreText}
            onChange={(e) => setRestoreText(e.target.value)}
            placeholder="Paste it to use that key here"
            className="flex-1 min-w-[12rem] px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/10 text-surface-200 placeholder:text-surface-500"
          />
          <button
            onClick={handleRestore}
            disabled={busy !== null || !restoreText.trim()}
            className="px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.08] text-surface-200 transition-colors disabled:opacity-50"
          >
            Use it
          </button>
        </div>
      )}

      {!unlocked ? (
        <button
          onClick={handleUnlock}
          disabled={busy !== null}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-brand-500/15 border border-brand-500/30 text-brand-300 hover:bg-brand-500/25 transition-all text-sm"
        >
          {busy === 'unlock' ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
          <span>Unlock private balance (sign a message, no fee)</span>
        </button>
      ) : (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder={`Amount in ${symbol}`}
              disabled={busy !== null}
              className="flex-1 min-w-0 bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-white text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handleDeposit}
              disabled={busy !== null}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-yes-500/10 border border-yes-500/30 text-yes-400 hover:bg-yes-500/20 transition-all text-sm"
            >
              {busy === 'deposit' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowDownToLine className="w-4 h-4" />}
              <span>Deposit</span>
            </button>
            <button
              onClick={handleWithdraw}
              disabled={busy !== null}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-white/[0.04] border border-white/10 text-surface-200 hover:bg-white/[0.08] transition-all text-sm"
            >
              {busy === 'withdraw' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUpFromLine className="w-4 h-4" />}
              <span>Withdraw</span>
            </button>
          </div>
        </div>
      )}

      {status && <p className="mt-3 text-sm text-surface-300">{status}</p>}
      {error && <p className="mt-3 text-sm text-no-400">{error}</p>}
      {txHash && (
        <a
          href={txUrl(txHash)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1.5 text-sm text-brand-400 hover:text-brand-300"
        >
          <span>View on NearBlocks</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      )}

      {ONECLICK_UI && unlocked && wallet.address && token === TOKEN.USDCX && (
        <CrossChainUsdc account={wallet.address} privateMicro={priv} onChange={refreshBalance} />
      )}

      <p className="mt-4 text-xs text-surface-500">
        Deposits and withdrawals are public on NEAR. Everything in between is private.
      </p>
    </div>
  )
}
