import { useState } from 'react'
import { ArrowLeftRight, CandlestickChart, Landmark } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { CATEGORIES } from '@/lib/create/form'
import {
  CRYPTO_COINS,
  FX_CURRENCIES,
  TemplateError,
  cryptoTemplate,
  fxTemplate,
  stockTemplate,
  type TemplateResult,
} from '@/lib/create/templates'
import { cn } from '@/lib/utils'

type Kind = 'crypto' | 'stock' | 'fx'

const KINDS: { kind: Kind; icon: LucideIcon; title: string; note: string }[] = [
  {
    kind: 'crypto',
    icon: CandlestickChart,
    title: 'Crypto price',
    note: "Trading closes at the minute you pick. Coinbase's one-minute candle that starts then decides it.",
  },
  {
    kind: 'stock',
    icon: Landmark,
    title: 'Stock close',
    note: "Trading closes at the NYSE close, 16:00 New York time (13:00 on early-close days). Nasdaq's daily history decides it.",
  },
  {
    kind: 'fx',
    icon: ArrowLeftRight,
    title: 'Currency rate',
    note: "Trading closes at 12:00 UTC that day, before the ECB publishes its reference rates. Frankfurter's copy of them decides it.",
  },
]

const SELECT = 'input-field appearance-none'
const tomorrowUtc = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)

/** Builds a market from a few fields. The result opens the details step with its text, source and times. */
export function TemplateForm({ onBuilt }: { onBuilt(r: TemplateResult): void }) {
  const [kind, setKind] = useState<Kind>('crypto')
  const [coin, setCoin] = useState<string>('BTC')
  const [ticker, setTicker] = useState('')
  const [category, setCategory] = useState(5)
  const [base, setBase] = useState<string>('USD')
  const [quote, setQuote] = useState<string>('IDR')
  const [threshold, setThreshold] = useState('')
  const [date, setDate] = useState(tomorrowUtc)
  const [time, setTime] = useState('14:30')
  const [error, setError] = useState<string | null>(null)

  const make = (): TemplateResult => {
    const now = new Date()
    if (kind === 'crypto') return cryptoTemplate({ coin, threshold, date, time }, now)
    if (kind === 'stock') return stockTemplate({ ticker, threshold, date, category }, now)
    return fxTemplate({ base, quote, threshold, date }, now)
  }

  let preview: string | null = null
  try {
    preview = make().question
  } catch {
    preview = null
  }

  const build = () => {
    try {
      const r = make()
      setError(null)
      onBuilt(r)
    } catch (e) {
      if (e instanceof TemplateError) setError(e.message)
      else throw e
    }
  }

  const pick = (k: Kind) => {
    setKind(k)
    setThreshold('')
    setError(null)
  }

  const field = 'text-xs font-medium text-surface-300 mb-1.5 block'
  const current = KINDS.find((k) => k.kind === kind)!

  return (
    <div className="glass-card p-6 space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white">Use a template</h2>
        <p className="text-sm text-surface-400 mt-1">Fill in the fields; the question, rules, source and times follow from them.</p>
      </div>

      <div className="grid grid-cols-3 gap-2" role="tablist" aria-label="Template">
        {KINDS.map((k) => (
          <button
            key={k.kind}
            type="button"
            role="tab"
            aria-selected={kind === k.kind}
            onClick={() => pick(k.kind)}
            className={cn(
              'flex flex-col items-center gap-1.5 p-3 rounded-xl text-xs font-medium transition-all',
              kind === k.kind
                ? 'bg-brand-400/[0.12] text-brand-400 border border-brand-400/[0.2]'
                : 'bg-white/[0.02] text-surface-400 border border-white/[0.04] hover:bg-white/[0.04]',
            )}
          >
            <k.icon className="w-4 h-4" />
            {k.title}
          </button>
        ))}
      </div>

      <p className="text-2xs text-surface-400 leading-relaxed -mt-2">{current.note}</p>

      <div className="grid gap-4 sm:grid-cols-2">
        {kind === 'crypto' && (
          <div>
            <label htmlFor="tpl-coin" className={field}>Coin</label>
            <select id="tpl-coin" value={coin} onChange={(e) => setCoin(e.target.value)} className={SELECT}>
              {CRYPTO_COINS.map((c) => <option key={c} value={c} className="bg-surface-900">{c}</option>)}
            </select>
          </div>
        )}
        {kind === 'stock' && (
          <>
            <div>
              <label htmlFor="tpl-ticker" className={field}>Ticker</label>
              <input id="tpl-ticker" type="text" value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} placeholder="NVDA" maxLength={6} className="input-field" autoComplete="off" />
            </div>
            <div>
              <label htmlFor="tpl-category" className={field}>Category</label>
              <select id="tpl-category" value={category} onChange={(e) => setCategory(Number(e.target.value))} className={SELECT}>
                {CATEGORIES.map((c) => <option key={c.id} value={c.id} className="bg-surface-900">{c.name}</option>)}
              </select>
            </div>
          </>
        )}
        {kind === 'fx' && (
          <>
            <div>
              <label htmlFor="tpl-base" className={field}>Base currency</label>
              <select id="tpl-base" value={base} onChange={(e) => setBase(e.target.value)} className={SELECT}>
                {FX_CURRENCIES.map((c) => <option key={c} value={c} className="bg-surface-900">{c}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="tpl-quote" className={field}>Quote currency</label>
              <select id="tpl-quote" value={quote} onChange={(e) => setQuote(e.target.value)} className={SELECT}>
                {FX_CURRENCIES.map((c) => <option key={c} value={c} className="bg-surface-900">{c}</option>)}
              </select>
            </div>
          </>
        )}

        <div>
          <label htmlFor="tpl-threshold" className={field}>
            {kind === 'crypto' ? 'Price above (USD)' : kind === 'stock' ? 'Close above (USD)' : `Rate above (${quote} per ${base})`}
          </label>
          <input
            id="tpl-threshold"
            type="text"
            inputMode="decimal"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value.replace(/,/g, ''))}
            placeholder={kind === 'crypto' ? '100000' : kind === 'stock' ? '200' : '18500'}
            className="input-field"
            autoComplete="off"
          />
        </div>

        <div>
          <label htmlFor="tpl-date" className={field}>{kind === 'stock' ? 'Trading day' : 'Date (UTC)'}</label>
          <input id="tpl-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input-field" />
        </div>

        {kind === 'crypto' && (
          <div>
            <label htmlFor="tpl-time" className={field}>Minute (UTC)</label>
            <input id="tpl-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className="input-field" />
          </div>
        )}
      </div>

      <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04]" aria-live="polite">
        <p className="text-2xs text-surface-500 mb-1">The question</p>
        <p className={cn('text-sm', preview ? 'text-white' : 'text-surface-500')}>
          {preview ?? 'Fill in the fields to see the question.'}
        </p>
      </div>

      {error && <p className="text-xs text-no-400" role="alert">{error}</p>}

      <button type="button" onClick={build} className="btn-primary w-full sm:w-auto">
        Use this market
      </button>
    </div>
  )
}
