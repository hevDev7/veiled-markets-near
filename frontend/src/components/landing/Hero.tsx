import { useRef, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion'
import { Activity, ArrowRight, ArrowUpRight, Code2, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Market } from '@/lib/store'
import { btnPrimary, btnSecondary, btnLg, Container, CountUp, EASE, Stagger, StaggerItem } from './shared'
import { formatPct, LINKS, useProtocolFacts, type LaunchApp } from './data'
import { HeroOrrery } from './HeroOrrery'

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
          <HeroOrrery market={markets[0] ?? null} loading={loading} />
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
