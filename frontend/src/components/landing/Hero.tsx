import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion'
import { Activity, ArrowRight, ArrowUpRight, Code2, ShieldCheck } from 'lucide-react'
import { cn, formatCredits, getCategoryName, getTokenSymbol } from '@/lib/utils'
import { getMarketOutcomeSummaries } from '@/lib/market-outcomes'
import { useLiveCountdown } from '@/hooks/useGlobalTicker'
import { RELAYER_ACCOUNT } from '@/lib/near/config'
import type { Market } from '@/lib/store'
import { btnPrimary, btnSecondary, btnLg, Container, CountUp, EASE, GrowBar, Stagger, StaggerItem, Tag, VeilDraw } from './shared'
import { formatPct, LINKS, useProtocolFacts, type LaunchApp } from './data'
import { useMarketPath } from '@/lib/near/market-tx'

const PROOF_POINTS = [
  { icon: ShieldCheck, text: 'Groth16 proofs, verified on chain' },
  { icon: Activity, text: 'Turbo rounds priced by Pyth' },
  { icon: Code2, text: 'Open source under MIT' },
]

export function Hero({ app, markets, loading }: { app: LaunchApp; markets: Market[]; loading: boolean }) {
  const reduce = useReducedMotion()
  const rise = (delay: number, y = 22) =>
    reduce
      ? {}
      : { initial: { opacity: 0, y }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.8, ease: EASE, delay } }

  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden pb-16 pt-28 sm:pb-20 sm:pt-36">
      <div aria-hidden className="vl-hero-light">
        <div className="vl-hero-glow" />
        <div className="vl-hero-beams" />
      </div>

      <Container className="relative text-center">
        <motion.a
          {...rise(0)}
          href={LINKS.contract}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2.5 rounded-full border border-white/[0.1] bg-white/[0.03] py-1.5 pl-3 pr-3.5 text-[13px] text-[#c4c8d0] backdrop-blur-sm transition-colors hover:border-brand-400/40 hover:text-[#f3efe6]"
        >
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yes-400 opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-yes-400" />
          </span>
          Live on NEAR testnet
          <ArrowUpRight className="h-3.5 w-3.5 text-[#8b919e]" aria-hidden />
          <span className="sr-only">(opens the contract on NearBlocks in a new tab)</span>
        </motion.a>

        <h1
          id="hero-title"
          className="mx-auto mt-8 font-display text-[clamp(2.9rem,8.2vw,6.6rem)] leading-[1] tracking-[-0.03em] text-[#f3efe6]"
        >
          <HeadlineLine delay={0.08}>Predict freely.</HeadlineLine>
          <HeadlineLine delay={0.2}>
            Bet{' '}
            <span className="relative inline-block">
              <em className="text-brand-300">privately.</em>
              {!reduce && (
                <motion.span
                  aria-hidden
                  className="vl-veil-cover"
                  initial={{ scaleX: 1 }}
                  animate={{ scaleX: 0 }}
                  transition={{ duration: 0.95, ease: [0.65, 0, 0.35, 1], delay: 1.05 }}
                />
              )}
            </span>
          </HeadlineLine>
        </h1>

        <motion.p {...rise(0.34)} className="mx-auto mt-7 max-w-[42rem] text-balance text-[18px] leading-[1.65] text-[#c4c8d0]">
          Veiled Markets is a prediction market on NEAR. Trades run through a zero-knowledge note pool, so prices and
          pools stay public, but nobody can see which account holds which position.
        </motion.p>

        <motion.div {...rise(0.44)} className="mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
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

        <motion.p {...rise(0.52)} className="mt-5 text-[14px] text-[#8b919e]">
          New here?{' '}
          <Link to="/turbo" className="font-medium text-[#f3efe6] underline decoration-brand-400/50 underline-offset-4 hover:decoration-brand-300">
            Try a 5-minute Turbo round
          </Link>{' '}
          without connecting a wallet.
        </motion.p>
      </Container>

      <Container className="relative mt-14 sm:mt-16">
        <motion.div {...rise(0.62, 44)}>
          <Stage market={markets[0] ?? null} loading={loading} />
        </motion.div>

        <Stagger as="ul" gap={0.1} className="mt-10 flex flex-col items-center gap-x-9 gap-y-3 text-[14px] text-[#8b919e] sm:flex-row sm:flex-wrap sm:justify-center">
          {PROOF_POINTS.map((p) => (
            <StaggerItem as="li" key={p.text} className="inline-flex items-center gap-2.5">
              <p.icon className="h-4 w-4 text-brand-300" strokeWidth={1.7} aria-hidden />
              {p.text}
            </StaggerItem>
          ))}
        </Stagger>
      </Container>

      <Container className="relative mt-16 sm:mt-20">
        <FactsStrip openMarkets={loading ? null : markets.length} />
      </Container>
    </section>
  )
}

/** One line of the headline, rising from behind its own baseline. */
function HeadlineLine({ children, delay }: { children: ReactNode; delay: number }) {
  const reduce = useReducedMotion()
  if (reduce) return <span className="block">{children}</span>
  return (
    <span className="-mb-[0.14em] block overflow-hidden pb-[0.14em]">
      <motion.span
        className="block"
        initial={{ y: '112%' }}
        animate={{ y: 0 }}
        transition={{ duration: 0.95, ease: EASE, delay }}
      >
        {children}
      </motion.span>
    </span>
  )
}

function useMinWidth(px: number): boolean {
  const query = `(min-width: ${px}px)`
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const update = () => setMatches(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [query])
  return matches
}

/** The product on a stage: a live market beside what the chain records for a private trade on it. On wide screens
 *  the stage leans back at first and settles flat as it is scrolled into view. */
function Stage({ market, loading }: { market: Market | null; loading: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  const wide = useMinWidth(1024)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'start 0.38'] })
  const rotateX = useTransform(scrollYProgress, [0, 1], [18, 0])
  const scale = useTransform(scrollYProgress, [0, 1], [0.94, 1])
  const glow = useTransform(scrollYProgress, [0, 1], [0.45, 1])
  const tilt = wide && !reduce

  return (
    <div ref={ref} className="relative mx-auto max-w-[1080px] [perspective:1700px]">
      <motion.div
        aria-hidden
        style={tilt ? { opacity: glow } : undefined}
        className="absolute inset-x-[6%] -bottom-16 top-[18%] bg-[radial-gradient(closest-side,rgba(201,168,76,0.24),transparent)] blur-3xl"
      />
      <motion.div
        style={tilt ? { rotateX, scale, transformOrigin: '50% 0%' } : undefined}
        className="relative overflow-hidden rounded-[22px] border border-white/[0.1] bg-[#0b0d12] shadow-[0_70px_140px_-60px_rgba(0,0,0,1)]"
      >
        <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-300/80 to-transparent" />
        <div className="grid text-left lg:grid-cols-[minmax(0,11fr)_minmax(0,10fr)]">
          {market ? <FeaturedMarket market={market} /> : <FeaturedPlaceholder loading={loading} />}
          <TradeAnatomy />
        </div>
      </motion.div>
    </div>
  )
}

const pane = 'p-6 sm:p-8 lg:p-10'

function FeaturedMarket({ market }: { market: Market }) {
  const outcomes = useMemo(() => getMarketOutcomeSummaries(market), [market])
  const timeLeft = useLiveCountdown(market.deadlineTimestamp, market.timeRemaining)
  const marketHref = useMarketPath()

  return (
    <Link to={marketHref(market.id)} className={cn(pane, 'group flex flex-col transition-colors hover:bg-white/[0.015]')}>
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand-300">
          {getCategoryName(market.category)} · {getTokenSymbol(market.tokenType)}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-yes-500/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-yes-400">
          <span className="h-1.5 w-1.5 rounded-full bg-yes-400" />
          Live market
        </span>
      </div>

      <p className="mt-5 font-display text-[25px] leading-[1.22] text-[#f3efe6] sm:text-[30px]">{market.question}</p>

      <div className="mt-7 space-y-4">
        {outcomes.map((o) => (
          <div key={o.outcome}>
            <div className="flex items-baseline justify-between text-[15px]">
              <span className="text-[#c4c8d0]">{o.label}</span>
              <span className={cn('font-mono tabular-nums', o.styles.text)}>{formatPct(Math.round(o.percentage * 10) / 10)}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <GrowBar pct={o.percentage} className={o.styles.bar} />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-auto flex items-center justify-between gap-4 pt-8 font-mono text-[12px] text-[#8b919e]">
        <span className="tabular-nums">
          Vol {formatCredits(market.totalVolume, 2)} {getTokenSymbol(market.tokenType)}
        </span>
        <span className="inline-flex items-center gap-1.5 tabular-nums">
          {timeLeft === 'Ended' ? 'Closed' : `Ends in ${timeLeft}`}
          <ArrowRight className="h-3.5 w-3.5 text-[#c4c8d0] transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden />
        </span>
      </div>
    </Link>
  )
}

function FeaturedPlaceholder({ loading }: { loading: boolean }) {
  return (
    <div className={pane} aria-busy={loading}>
      {loading ? (
        <div className="animate-pulse space-y-4">
          <div className="h-3 w-28 rounded bg-white/[0.07]" />
          <div className="h-7 w-4/5 rounded bg-white/[0.07]" />
          <div className="h-7 w-3/5 rounded bg-white/[0.07]" />
          <div className="h-2 w-full rounded bg-white/[0.05]" />
          <div className="h-2 w-full rounded bg-white/[0.05]" />
        </div>
      ) : (
        <>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand-300">Turbo</p>
          <p className="mt-5 font-display text-[30px] leading-[1.22] text-[#f3efe6]">Will BTC be up or down in five minutes?</p>
          <Link to="/turbo/BTC" className="mt-6 inline-flex items-center gap-1.5 text-[15px] text-brand-300 hover:text-brand-200">
            Open the live round <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </>
      )}
    </div>
  )
}

function TradeAnatomy() {
  const rows: { label: string; value: ReactNode; tone: 'public' | 'private' }[] = [
    { label: 'Signer', value: <span className="text-[#f3efe6]">{RELAYER_ACCOUNT}</span>, tone: 'public' },
    { label: 'Proof', value: <span className="text-yes-400">Groth16, verified</span>, tone: 'public' },
    { label: 'Trade', value: <span className="text-[#c4c8d0]">market, outcome, amount</span>, tone: 'public' },
    { label: 'Trader', value: <VeilDraw label="Not recorded" delay={0.5} />, tone: 'private' },
    { label: 'Balance', value: <VeilDraw label="Not recorded" className="w-[6em]" delay={0.65} />, tone: 'private' },
  ]

  return (
    <figure className={cn(pane, 'border-t border-white/[0.08] bg-[linear-gradient(180deg,rgba(201,168,76,0.05),transparent_55%)] lg:border-l lg:border-t-0')}>
      <figcaption className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand-300">
        What NEAR records for a private trade
      </figcaption>
      <dl className="mt-6 space-y-3.5 font-mono text-[13px]">
        {rows.map((r) => (
          <div key={r.label} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[84px_1fr_auto]">
            <dt className="text-[#8b919e]">{r.label}</dt>
            <dd className="order-3 col-span-2 truncate sm:order-none sm:col-span-1">{r.value}</dd>
            <dd className="justify-self-end">
              <Tag tone={r.tone}>{r.tone === 'private' ? 'Hidden' : 'Public'}</Tag>
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-7 border-t border-white/[0.07] pt-5 text-[14px] leading-relaxed text-[#8b919e]">
        The relayer signs and pays gas. Your proof binds the action, the recipient and the fee, so the relayer cannot
        change your trade.
      </p>
    </figure>
  )
}

function FactsStrip({ openMarkets }: { openMarkets: number | null }) {
  const facts = useProtocolFacts()
  const items: { value: ReactNode; label: string }[] = [
    { value: openMarkets === null ? '—' : <CountUp to={openMarkets} />, label: 'Markets open now' },
    { value: <CountUp to={5} format={(n) => `${Math.round(n)} min`} />, label: 'Turbo rounds on BTC, ETH, SOL' },
    {
      value: facts.notes === null ? '—' : <CountUp to={facts.notes} format={(n) => Math.round(n).toLocaleString('en-US')} />,
      label: 'Notes in the private pool',
    },
    {
      value: facts.feePct === null ? '—' : <CountUp to={facts.feePct} format={(n) => formatPct(Math.round(n * 10) / 10)} />,
      label: facts.lpFeePct === null ? 'Fee per buy' : `Fee per buy; sells add ${formatPct(facts.lpFeePct)} for LPs`,
    },
  ]

  return (
    <Stagger as="dl" gap={0.1} className="grid grid-cols-2 gap-x-6 gap-y-10 lg:grid-cols-4">
      {items.map((f) => (
        <StaggerItem key={f.label} className="flex flex-col-reverse justify-end gap-2.5 border-l border-white/[0.1] pl-5 sm:pl-6">
          <dt className="text-[13.5px] leading-snug text-[#8b919e]">{f.label}</dt>
          <dd className="font-display text-[34px] leading-none text-[#f3efe6] tabular-nums sm:text-[42px]">{f.value}</dd>
        </StaggerItem>
      ))}
    </Stagger>
  )
}
