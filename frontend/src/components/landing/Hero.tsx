import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, ArrowUpRight } from 'lucide-react'
import { cn, formatCredits, getCategoryName } from '@/lib/utils'
import { getMarketOutcomeSummaries } from '@/lib/market-outcomes'
import { useLiveCountdown } from '@/hooks/useGlobalTicker'
import { RELAYER_ACCOUNT } from '@/lib/near/config'
import type { Market } from '@/lib/store'
import { btnPrimary, btnSecondary, btnLg, Container, EASE, Tag, Veil } from './shared'
import { formatPct, LINKS, useProtocolFacts, type LaunchApp } from './data'

const PROOF_POINTS = ['Groth16 proofs', 'Pyth-priced Turbo', 'MIT open source']

export function Hero({ app, markets, loading }: { app: LaunchApp; markets: Market[]; loading: boolean }) {
  const reduce = useReducedMotion()
  const rise = (delay: number) =>
    reduce
      ? {}
      : { initial: { opacity: 0, y: 22 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.7, ease: EASE, delay } }

  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden pb-16 pt-32 sm:pb-20 sm:pt-40">
      <div aria-hidden className="vl-grid absolute inset-0" />
      <div
        aria-hidden
        className="absolute -top-40 left-1/2 h-[620px] w-[1100px] -translate-x-1/2 bg-[radial-gradient(closest-side,rgba(201,168,76,0.13),transparent)]"
      />

      <Container className="relative grid items-center gap-14 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-6">
          <motion.a
            {...rise(0)}
            href={LINKS.contract}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2.5 rounded-full border border-white/[0.09] bg-white/[0.03] py-1.5 pl-3 pr-3.5 font-mono text-[11px] uppercase tracking-[0.16em] text-[#c4c8d0] transition-colors hover:border-brand-400/40"
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yes-400 opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-yes-400" />
            </span>
            Live on NEAR testnet
            <ArrowUpRight className="h-3 w-3 text-[#8b919e]" aria-hidden />
          </motion.a>

          <motion.h1
            {...rise(0.08)}
            id="hero-title"
            className="mt-8 font-display text-[clamp(3.1rem,7.2vw,5.6rem)] leading-[0.98] tracking-[-0.03em] text-[#f3efe6]"
          >
            Predict freely.
            <br />
            Bet <em className="text-brand-300">privately.</em>
          </motion.h1>

          <motion.p {...rise(0.16)} className="mt-7 max-w-[34rem] text-[18px] leading-[1.65] text-[#c4c8d0]">
            Veiled Markets is a prediction market on NEAR. Trades run through a zero-knowledge note pool, so prices
            and pools stay public, but nobody can see which account holds which position.
          </motion.p>

          <motion.div {...rise(0.24)} className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <button type="button" onClick={app.launch} disabled={app.connecting} className={cn(btnPrimary, btnLg)}>
              {app.connecting ? 'Connecting…' : 'Launch app'}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
            <a href="#markets" className={cn(btnSecondary, btnLg)}>
              Explore live markets
            </a>
          </motion.div>
          {app.error && (
            <p role="alert" className="mt-3 text-sm text-no-400">
              {app.error}
            </p>
          )}

          <motion.p {...rise(0.3)} className="mt-5 text-[14px] text-[#8b919e]">
            New here?{' '}
            <Link to="/turbo" className="font-medium text-[#f3efe6] underline decoration-brand-400/50 underline-offset-4 hover:decoration-brand-300">
              Try a 5-minute Turbo round
            </Link>{' '}
            without connecting a wallet.
          </motion.p>

          <motion.ul
            {...rise(0.36)}
            aria-label="Built with"
            className="mt-10 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[#8b919e]"
          >
            {PROOF_POINTS.map((p, i) => (
              <li key={p} className="flex items-center gap-4">
                {i > 0 && <span aria-hidden className="h-1 w-1 rounded-full bg-brand-400/60" />}
                {p}
              </li>
            ))}
          </motion.ul>
        </div>

        <motion.div
          className="lg:col-span-6"
          {...(reduce
            ? {}
            : { initial: { opacity: 0, y: 30 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.9, ease: EASE, delay: 0.2 } })}
        >
          <HeroVisual market={markets[0] ?? null} loading={loading} />
        </motion.div>
      </Container>

      <Container className="relative mt-20 sm:mt-24">
        <FactsStrip openMarkets={loading ? null : markets.length} />
      </Container>
    </section>
  )
}

function HeroVisual({ market, loading }: { market: Market | null; loading: boolean }) {
  return (
    <div className="relative mx-auto max-w-[540px]">
      <div
        aria-hidden
        className="absolute -inset-10 bg-[radial-gradient(closest-side,rgba(201,168,76,0.12),transparent)] blur-2xl"
      />
      <div className="relative">
        {market ? <FeaturedMarket market={market} /> : <FeaturedPlaceholder loading={loading} />}
        <TradeAnatomy className="relative -mt-10 ml-auto w-[94%] sm:-mt-12 sm:w-[84%]" />
      </div>
    </div>
  )
}

const panel =
  'rounded-2xl border border-white/[0.08] bg-[#0c0e13]/95 shadow-[0_40px_90px_-45px_rgba(0,0,0,0.95)]'

function FeaturedMarket({ market }: { market: Market }) {
  const outcomes = useMemo(() => getMarketOutcomeSummaries(market), [market])
  const timeLeft = useLiveCountdown(market.deadlineTimestamp, market.timeRemaining)

  return (
    <Link
      to={`/market/${market.id}`}
      className={cn(panel, 'group block p-6 pb-16 transition-colors hover:border-white/[0.16] sm:p-7 sm:pb-20')}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand-300">
          {getCategoryName(market.category)} · {market.tokenType ?? 'NEAR'}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-yes-500/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-yes-400">
          <span className="h-1.5 w-1.5 rounded-full bg-yes-400" />
          Live market
        </span>
      </div>

      <p className="mt-4 font-display text-[23px] leading-[1.25] text-[#f3efe6] sm:text-[26px]">{market.question}</p>

      <div className="mt-6 space-y-3">
        {outcomes.map((o) => (
          <div key={o.outcome}>
            <div className="flex items-baseline justify-between text-[14px]">
              <span className="text-[#c4c8d0]">{o.label}</span>
              <span className={cn('font-mono tabular-nums', o.styles.text)}>{formatPct(Math.round(o.percentage * 10) / 10)}</span>
            </div>
            <div className="mt-1.5 h-[5px] overflow-hidden rounded-full bg-white/[0.06]">
              <div className={cn('h-full rounded-full', o.styles.bar)} style={{ width: `${Math.max(2, o.percentage)}%` }} />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex items-center justify-between font-mono text-[12px] text-[#8b919e]">
        <span className="tabular-nums">
          Vol {formatCredits(market.totalVolume, 2)} {market.tokenType ?? 'NEAR'}
        </span>
        <span className="tabular-nums">{timeLeft === 'Ended' ? 'Closed' : `Ends in ${timeLeft}`}</span>
      </div>
    </Link>
  )
}

function FeaturedPlaceholder({ loading }: { loading: boolean }) {
  return (
    <div className={cn(panel, 'p-7 pb-20')} aria-busy={loading}>
      {loading ? (
        <div className="animate-pulse space-y-4">
          <div className="h-3 w-28 rounded bg-white/[0.07]" />
          <div className="h-6 w-4/5 rounded bg-white/[0.07]" />
          <div className="h-6 w-3/5 rounded bg-white/[0.07]" />
          <div className="h-2 w-full rounded bg-white/[0.05]" />
          <div className="h-2 w-full rounded bg-white/[0.05]" />
        </div>
      ) : (
        <>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand-300">Turbo</p>
          <p className="mt-4 font-display text-[26px] leading-[1.25] text-[#f3efe6]">
            Will BTC be up or down in five minutes?
          </p>
          <Link to="/turbo/BTC" className="mt-5 inline-flex items-center gap-1.5 text-[14px] text-brand-300 hover:text-brand-200">
            Open the live round <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </>
      )}
    </div>
  )
}

function TradeAnatomy({ className }: { className?: string }) {
  const rows: { label: string; value: ReactNode; tone: 'public' | 'private' }[] = [
    { label: 'Signer', value: <span className="text-[#f3efe6]">{RELAYER_ACCOUNT}</span>, tone: 'public' },
    { label: 'Proof', value: <span className="text-yes-400">Groth16, verified</span>, tone: 'public' },
    { label: 'Trade', value: <span className="text-[#c4c8d0]">market, outcome, amount</span>, tone: 'public' },
    { label: 'Trader', value: <Veil label="Not recorded" />, tone: 'private' },
    { label: 'Balance', value: <Veil label="Not recorded" className="w-[6em]" />, tone: 'private' },
  ]

  return (
    <figure
      className={cn(
        'rounded-2xl border border-brand-400/25 bg-[#0b0b0e]/95 p-5 shadow-[0_40px_90px_-40px_rgba(0,0,0,1)] backdrop-blur-md sm:p-6',
        className,
      )}
    >
      <figcaption className="flex items-center justify-between gap-3">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-brand-300">Anatomy of a private trade</span>
      </figcaption>
      <dl className="mt-4 space-y-2.5 font-mono text-[12px]">
        {rows.map((r) => (
          <div key={r.label} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[76px_1fr_auto]">
            <dt className="text-[#8b919e]">{r.label}</dt>
            <dd className="order-3 col-span-2 truncate sm:order-none sm:col-span-1">{r.value}</dd>
            <dd className="justify-self-end">
              <Tag tone={r.tone}>{r.tone === 'private' ? 'Hidden' : 'Public'}</Tag>
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-5 border-t border-white/[0.06] pt-4 text-[13px] leading-relaxed text-[#8b919e]">
        The relayer signs and pays gas. Your proof binds the action, the recipient and the fee, so the relayer cannot
        change your trade.
      </p>
    </figure>
  )
}

function FactsStrip({ openMarkets }: { openMarkets: number | null }) {
  const facts = useProtocolFacts()
  const items: { value: string; label: string }[] = [
    { value: openMarkets === null ? '—' : String(openMarkets), label: 'Markets open now' },
    { value: '5 min', label: 'Turbo rounds on BTC, ETH, SOL' },
    { value: facts.notes === null ? '—' : facts.notes.toLocaleString('en-US'), label: 'Notes in the private pool' },
    {
      value: facts.feePct === null ? '—' : formatPct(facts.feePct),
      label: facts.lpFeePct === null ? 'Trading fee' : `Trading fee, ${formatPct(facts.lpFeePct)} to LPs`,
    },
  ]

  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.07] lg:grid-cols-4">
      {items.map((f) => (
        <div key={f.label} className="flex flex-col-reverse gap-2 bg-[#08090c] px-5 py-6 sm:px-7">
          <dt className="text-[13px] leading-snug text-[#8b919e]">{f.label}</dt>
          <dd className="font-display text-[30px] leading-none text-[#f3efe6] tabular-nums sm:text-[34px]">{f.value}</dd>
        </div>
      ))}
    </dl>
  )
}
