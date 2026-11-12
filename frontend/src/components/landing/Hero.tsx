import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion, useInView, useReducedMotion, useScroll, useTransform } from 'framer-motion'
import { Activity, ArrowRight, ArrowUpRight, Blocks, Check, Code2, Fingerprint, Send, ShieldCheck } from 'lucide-react'
import { cn, formatCredits, getCategoryName, getTokenSymbol } from '@/lib/utils'
import { getMarketOutcomeSummaries } from '@/lib/market-outcomes'
import { useLiveCountdown } from '@/hooks/useGlobalTicker'
import { RELAYER_ACCOUNT } from '@/lib/near/config'
import type { Market } from '@/lib/store'
import { btnPrimary, btnSecondary, btnLg, Container, CountUp, EASE, GrowBar, Stagger, StaggerItem, Tag, Veil } from './shared'
import { formatPct, LINKS, useProtocolFacts, type LaunchApp } from './data'
import { useMarketPath } from '@/lib/near/market-tx'

const PROOF_POINTS = [
  { icon: ShieldCheck, text: 'Groth16 proofs' },
  { icon: Activity, text: 'Pyth-priced Turbo' },
  { icon: Code2, text: 'MIT open source' },
]

export function Hero({ app, markets, loading }: { app: LaunchApp; markets: Market[]; loading: boolean }) {
  const reduce = useReducedMotion()
  const rise = (delay: number, y = 22) =>
    reduce
      ? {}
      : { initial: { opacity: 0, y }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.8, ease: EASE, delay } }

  // The visual drifts up a little slower than the page as the hero is scrolled away.
  const section = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({ target: section, offset: ['start start', 'end start'] })
  const drift = useTransform(scrollYProgress, [0, 1], [0, -70])

  return (
    <section ref={section} aria-labelledby="hero-title" className="relative overflow-hidden pb-16 pt-32 sm:pb-20 sm:pt-40">
      <div aria-hidden className="vl-hero-light">
        <div className="vl-hero-glow" />
        <div className="vl-hero-beams" />
      </div>

      <Container className="relative grid items-center gap-14 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-6">
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
            className="mt-8 font-display text-[clamp(3rem,7.2vw,5.6rem)] leading-[1] tracking-[-0.03em] text-[#f3efe6]"
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

          <motion.p {...rise(0.34)} className="mt-7 max-w-[34rem] text-[18px] leading-[1.65] text-[#c4c8d0]">
            Veiled Markets is a prediction market on NEAR. Trades run through a zero-knowledge note pool, so prices
            and pools stay public, but nobody can see which account holds which position.
          </motion.p>

          <motion.div {...rise(0.44)} className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
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

          <motion.ul
            {...rise(0.6)}
            aria-label="Built with"
            className="mt-10 flex flex-wrap items-center gap-x-7 gap-y-3 text-[14px] text-[#8b919e]"
          >
            {PROOF_POINTS.map((p) => (
              <li key={p.text} className="inline-flex items-center gap-2">
                <p.icon className="h-4 w-4 text-brand-300" strokeWidth={1.7} aria-hidden />
                {p.text}
              </li>
            ))}
          </motion.ul>
        </div>

        <motion.div
          className="lg:col-span-6"
          style={reduce ? undefined : { y: drift }}
          {...(reduce
            ? {}
            : { initial: { opacity: 0, x: 36 }, animate: { opacity: 1, x: 0 }, transition: { duration: 1, ease: EASE, delay: 0.3 } })}
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

/** The three hops of a private trade, in order, and how long the animation rests on each. */
const FLOW = [
  { icon: Fingerprint, label: 'Your browser', status: 'Your browser builds a zero-knowledge proof.', ms: 3000 },
  { icon: Send, label: 'Relayer', status: 'The relayer signs it and pays the gas.', ms: 2400 },
  { icon: Blocks, label: 'NEAR', status: 'NEAR verifies the proof and records the trade.', ms: 6200 },
] as const
const RECORDED = FLOW.length - 1

/** Plays the hops in a loop while the visual is on screen. Reduced motion rests on the last one. */
function useTradeFlow(running: boolean): number {
  const reduce = useReducedMotion()
  const [step, setStep] = useState(reduce ? RECORDED : 0)
  useEffect(() => {
    if (reduce) {
      setStep(RECORDED)
      return
    }
    if (!running) return
    const timer = window.setTimeout(() => setStep((s) => (s + 1) % FLOW.length), FLOW[step].ms)
    return () => window.clearTimeout(timer)
  }, [step, running, reduce])
  return step
}

/** A live market, and a private trade on it played hop by hop until NEAR has recorded it. */
function HeroVisual({ market, loading }: { market: Market | null; loading: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  const onScreen = useInView(ref, { margin: '0px 0px -10% 0px' })
  const step = useTradeFlow(onScreen)
  const float = (distance: number, seconds: number) =>
    reduce ? {} : { animate: { y: [0, distance, 0] }, transition: { duration: seconds, ease: 'easeInOut' as const, repeat: Infinity } }

  return (
    <div ref={ref} className="relative mx-auto max-w-[540px]">
      <div
        aria-hidden
        className="absolute -inset-12 bg-[radial-gradient(closest-side,rgba(201,168,76,0.16),transparent)] blur-2xl"
      />
      <motion.div className="relative" {...float(-7, 8)}>
        {market ? <FeaturedMarket market={market} /> : <FeaturedPlaceholder loading={loading} />}
        {/* The market's edge lights up for a moment when the trade lands. */}
        {step === RECORDED && !reduce && (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-brand-300/80"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0] }}
            transition={{ duration: 1.8, ease: 'easeOut' }}
          />
        )}
      </motion.div>
      <motion.div className="relative -mt-10 ml-auto w-[94%] sm:-mt-12 sm:w-[86%]" {...float(6, 9)}>
        <TradeFlow step={step} />
      </motion.div>
    </div>
  )
}

const panel =
  'rounded-2xl border border-white/[0.08] bg-[#0c0e13]/95 shadow-[0_40px_90px_-45px_rgba(0,0,0,0.95)]'

function FeaturedMarket({ market }: { market: Market }) {
  const outcomes = useMemo(() => getMarketOutcomeSummaries(market), [market])
  const timeLeft = useLiveCountdown(market.deadlineTimestamp, market.timeRemaining)
  const marketHref = useMarketPath()

  return (
    <Link
      to={marketHref(market.id)}
      className={cn(panel, 'group block p-6 pb-16 transition-colors hover:border-white/[0.16] sm:p-7 sm:pb-20')}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand-300">
          {getCategoryName(market.category)} · {getTokenSymbol(market.tokenType)}
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
              <GrowBar pct={o.percentage} className={o.styles.bar} />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex items-center justify-between font-mono text-[12px] text-[#8b919e]">
        <span className="tabular-nums">
          Vol {formatCredits(market.totalVolume, 2)} {getTokenSymbol(market.tokenType)}
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

/** What ends up on chain for the trade. The widths are those of the placeholders shown before it is recorded. */
const RECORD: { label: string; value: ReactNode; tone: 'public' | 'private'; width: string }[] = [
  { label: 'Signer', value: <span className="text-[#f3efe6]">{RELAYER_ACCOUNT}</span>, tone: 'public', width: '11em' },
  { label: 'Proof', value: <span className="text-yes-400">Groth16, verified</span>, tone: 'public', width: '9em' },
  { label: 'Trade', value: <span className="text-[#c4c8d0]">market, outcome, amount</span>, tone: 'public', width: '12em' },
  { label: 'Trader', value: null, tone: 'private', width: '8.5em' },
  { label: 'Balance', value: null, tone: 'private', width: '6em' },
]

/** A private trade in motion: the proof is built in the browser, the relayer carries it, and NEAR's record of it
 *  fills in with the trader and the balance left veiled. Screen readers get the same story as one sentence. */
function TradeFlow({ step }: { step: number }) {
  const reduce = useReducedMotion()
  const recorded = step === RECORDED

  return (
    <figure className="rounded-2xl border border-brand-400/25 bg-[#0b0b0e]/95 p-5 shadow-[0_40px_90px_-40px_rgba(0,0,0,1)] backdrop-blur-md sm:p-6">
      <figcaption className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-brand-300">A private trade</figcaption>
      <p className="sr-only">
        Your browser builds a zero-knowledge proof, the relayer signs it and pays the gas, and NEAR records the
        signer, the proof and the trade. The trader and the balance are not recorded.
      </p>

      <div aria-hidden>
        <div className="relative mt-5 grid grid-cols-3">
          <div className="absolute left-[16.67%] right-[16.67%] top-[18px] h-px bg-white/[0.1]" />
          <motion.div
            className="absolute left-[16.67%] right-[16.67%] top-[18px] h-px origin-left bg-gradient-to-r from-brand-500 to-brand-300"
            initial={false}
            animate={{ scaleX: step / RECORDED }}
            transition={{ duration: reduce ? 0 : 0.9, ease: EASE }}
          />
          {FLOW.map((hop, i) => {
            const reached = i <= step
            return (
              <div key={hop.label} className="relative flex flex-col items-center gap-2.5 text-center">
                <span
                  className={cn(
                    'relative flex h-9 w-9 items-center justify-center rounded-full border bg-[#0b0b0e] transition-colors duration-500',
                    reached ? 'border-brand-400/70 text-brand-300' : 'border-white/15 text-[#8b919e]',
                  )}
                >
                  {i === step && !reduce && (
                    <motion.span
                      key={`${i}-${step}`}
                      className="absolute inset-0 rounded-full border border-brand-300/70"
                      initial={{ scale: 1, opacity: 0.7 }}
                      animate={{ scale: 1.75, opacity: 0 }}
                      transition={{ duration: 1.5, ease: 'easeOut', repeat: Infinity }}
                    />
                  )}
                  {i === 0 && step === 0 && !reduce && <ProofRing seconds={FLOW[0].ms / 1000 - 0.3} />}
                  <hop.icon className="h-4 w-4" />
                </span>
                <span className={cn('text-[12.5px] transition-colors duration-500', reached ? 'text-[#f3efe6]' : 'text-[#8b919e]')}>
                  {hop.label}
                </span>
              </div>
            )
          })}
        </div>

        <div className="mt-4 flex h-10 items-center justify-center overflow-hidden text-center text-[13.5px] leading-snug text-[#c4c8d0]">
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={step}
              className="inline-flex items-center gap-2"
              initial={reduce ? false : { y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={reduce ? undefined : { y: -10, opacity: 0 }}
              transition={{ duration: 0.3, ease: EASE }}
            >
              {recorded && <Check className="h-4 w-4 shrink-0 text-yes-400" strokeWidth={2.4} />}
              {FLOW[step].status}
            </motion.p>
          </AnimatePresence>
        </div>

        <div className="mt-3 border-t border-white/[0.07] pt-4">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-[#8b919e]">What NEAR records</p>
          <div className="mt-3 space-y-2.5 font-mono text-[12px]">
            {RECORD.map((row, i) => (
              <div key={row.label} className="grid h-[22px] grid-cols-[54px_minmax(0,1fr)_auto] items-center gap-x-2.5 sm:grid-cols-[76px_minmax(0,1fr)_auto] sm:gap-x-3">
                <span className="text-[#8b919e]">{row.label}</span>
                <span className="flex min-w-0 items-center">
                  <RecordValue row={row} recorded={recorded} delay={reduce ? 0 : 0.25 + i * 0.16} />
                </span>
                <motion.span
                  initial={false}
                  animate={{ opacity: recorded ? 1 : 0.28 }}
                  transition={{ duration: 0.4, delay: recorded && !reduce ? 0.25 + i * 0.16 : 0 }}
                >
                  <Tag tone={row.tone}>{row.tone === 'private' ? 'Hidden' : 'Public'}</Tag>
                </motion.span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </figure>
  )
}

/** The proof being built: a ring that closes around the browser's node. */
function ProofRing({ seconds }: { seconds: number }) {
  return (
    <svg className="absolute -inset-[5px] -rotate-90" viewBox="0 0 46 46" fill="none">
      <motion.circle
        cx="23"
        cy="23"
        r="21.5"
        stroke="#e7bf63"
        strokeWidth="1.5"
        strokeLinecap="round"
        initial={{ pathLength: 0, opacity: 1 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: seconds, ease: 'linear' }}
      />
    </svg>
  )
}

/** One field of the record: a faint placeholder until the trade is recorded, then its value, or a veil drawn
 *  across it when the field is one NEAR never receives. */
function RecordValue({ row, recorded, delay }: { row: (typeof RECORD)[number]; recorded: boolean; delay: number }) {
  if (!recorded) return <span className="h-[7px] rounded-full bg-white/[0.07]" style={{ width: row.width }} />
  if (row.tone === 'private') {
    return (
      <motion.span
        className="inline-flex origin-left"
        initial={{ scaleX: 0, opacity: 0 }}
        animate={{ scaleX: 1, opacity: 1 }}
        transition={{ duration: 0.9, ease: EASE, delay }}
      >
        <Veil label="Not recorded" className={row.label === 'Balance' ? 'w-[6em]' : undefined} />
      </motion.span>
    )
  }
  return (
    <motion.span
      className="truncate"
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, ease: EASE, delay }}
    >
      {row.value}
    </motion.span>
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
