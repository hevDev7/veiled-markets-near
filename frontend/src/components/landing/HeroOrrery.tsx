import { useEffect, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { motion, useInView, useReducedMotion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { cn, getCategoryName, getTokenSymbol } from '@/lib/utils'
import { getMarketOutcomeSummaries, type MarketOutcomeSummary } from '@/lib/market-outcomes'
import { useLiveCountdown } from '@/hooks/useGlobalTicker'
import { useMarketPath } from '@/lib/near/market-tx'
import type { Market } from '@/lib/store'
import { EASE } from './shared'
import { formatPct } from './data'

/** The drawing is 600 × 600, centred at (c, c). From the outside in: the engraved dial, the ring of public prices,
 *  the veil, the orbits of private notes, and the core where trades land. */
export const ORRERY = { c: 300, ticks: 274, text: 250, odds: 224, veil: 166, core: 54, landing: 60 } as const
/** Degrees left empty between two outcomes on the prices ring. */
export const ODDS_GAP_DEG = 5

const { c } = ORRERY
const GOLD = '#e7bf63'
/** The same order as the outcome styles: Yes, No, then the third and fourth outcomes. */
const OUTCOME_COLORS = ['#00dc82', '#ff4757', '#a78bfa', '#facc15']
const RING_TEXT = 'PUBLIC PRICES · PUBLIC POOLS · PRIVATE POSITIONS · ZERO-KNOWLEDGE PROOFS · '
/** One trade's loop, in seconds, and the share of it spent travelling (the rest it is out of sight). */
const TRADE_LOOP = 9
const TRAVEL = 0.55

const fix = (n: number) => n.toFixed(1)
function polar(r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180
  return [c + r * Math.cos(a), c + r * Math.sin(a)]
}
const circlePath = (r: number) => `M${c - r} ${c} a${r} ${r} 0 1 1 ${2 * r} 0 a${r} ${r} 0 1 1 ${-2 * r} 0`
const ellipsePath = (rx: number, ry: number) =>
  `M${c - rx} ${c} a${rx} ${ry} 0 1 0 ${2 * rx} 0 a${rx} ${ry} 0 1 0 ${-2 * rx} 0`
function arcPath(r: number, start: number, end: number): string {
  const [x1, y1] = polar(r, start)
  const [x2, y2] = polar(r, end)
  return `M${fix(x1)} ${fix(y1)} A${r} ${r} 0 ${end - start > 180 ? 1 : 0} 1 ${fix(x2)} ${fix(y2)}`
}

export interface OddsArc {
  /** Outcome index, for its label and colour. */
  index: number
  start: number
  end: number
  color: string
}

/** The prices ring: one arc per outcome, sized by its share, starting at 12 o'clock with a gap between outcomes.
 *  An outcome with no share gets no arc. */
export function oddsArcs(percentages: number[]): OddsArc[] {
  const shown = percentages.map((p, index) => ({ p: Math.max(p, 0), index })).filter((o) => o.p > 0)
  const total = shown.reduce((sum, o) => sum + o.p, 0)
  if (total <= 0) return []
  const free = 360 - ODDS_GAP_DEG * shown.length
  let at = -90 + ODDS_GAP_DEG / 2
  return shown.map(({ p, index }) => {
    const span = (free * p) / total
    const arc = { index, start: at, end: at + span, color: OUTCOME_COLORS[index] ?? GOLD }
    at += span + ODDS_GAP_DEG
    return arc
  })
}

/** A trade's way in: a spiral from the prices ring to the core, turning clockwise by `turn` degrees. `crossAt` is
 *  the share of the way at which it passes the veil, when the trade turns gold. */
export function spiral(startDeg: number, turn: number, steps = 56): { d: string; crossAt: number } {
  const pts: [number, number][] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    pts.push(polar(ORRERY.odds + (ORRERY.landing - ORRERY.odds) * t, startDeg + turn * t))
  }
  let total = 0
  let atVeil = 0
  for (let i = 1; i < pts.length; i++) {
    total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
    if (!atVeil && Math.hypot(pts[i][0] - c, pts[i][1] - c) <= ORRERY.veil) atVeil = total
  }
  return { d: pts.map(([x, y], i) => `${i ? 'L' : 'M'}${fix(x)} ${fix(y)}`).join(' '), crossAt: atVeil / total }
}

/** A small seeded generator, so the star dust is the same on every visit. */
function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const STARS = (() => {
  const rnd = seeded(11)
  return Array.from({ length: 36 }, () => {
    const [x, y] = polar(64 + rnd() * 232, rnd() * 360)
    return { x, y, r: 0.5 + rnd() * 1.1, delay: rnd() * 5, twinkle: rnd() > 0.3 }
  })
})()

const TICKS = Array.from({ length: 120 }, (_, i) => {
  const strong = i % 10 === 0
  const len = strong ? 14 : i % 5 === 0 ? 9 : 5
  const [x1, y1] = polar(ORRERY.ticks - len, i * 3)
  const [x2, y2] = polar(ORRERY.ticks, i * 3)
  return { x1, y1, x2, y2, strong }
})

/** Private notes circling inside the veil, all the same gold: nothing tells one holder from another. */
const ORBITS = [
  { tilt: -28, rx: 128, ry: 44, seconds: 16, notes: 2 },
  { tilt: 34, rx: 120, ry: 40, seconds: 21, notes: 2 },
  { tilt: 94, rx: 110, ry: 34, seconds: 27, notes: 1 },
]

const TRADES = [-60, 30, 120, 210].map((start) => spiral(start, 160))

const OCTAGON = Array.from({ length: 8 }, (_, i) => polar(ORRERY.core - 9, 22.5 + i * 45))
  .map(([x, y]) => `${fix(x)},${fix(y)}`)
  .join(' ')

/** Notes on the drawing, in the corners, with a leader line to what they name. */
const CALLOUTS = [
  { at: polar(ORRERY.odds, -50), line: '480,64 592,64', x: 484, anchor: 'start', title: 'PUBLIC', sub: 'prices & pools', y: 57 },
  { at: polar(ORRERY.veil, 145), line: '118,534 8,534', x: 10, anchor: 'start', title: 'THE VEIL', sub: 'zero-knowledge proofs', y: 527 },
  { at: polar(118, 38), line: '482,534 592,534', x: 590, anchor: 'end', title: 'PRIVATE', sub: 'who holds what', y: 527 },
] as const

/**
 * The hero's art: an engraved orrery. The featured market's prices ring the outside in its outcome colours, a veil
 * turns in the middle, and private notes orbit inside it. Trades spiral in from the prices ring and turn gold as they
 * cross the veil, then land in the core. The rings pause off screen and stand still for reduced motion. The live
 * market sits on a plaque under the art.
 */
export function HeroOrrery({ market, loading }: { market: Market | null; loading: boolean }) {
  const reduce = useReducedMotion() ?? false
  const wrap = useRef<HTMLDivElement>(null)
  const art = useRef<SVGSVGElement>(null)
  const onScreen = useInView(wrap, { margin: '0px 0px -10% 0px' })
  const outcomes = useMemo(() => (market ? getMarketOutcomeSummaries(market) : []), [market])
  const arcs = useMemo(() => oddsArcs(outcomes.map((o) => o.percentage)), [outcomes])
  const tradeColors = arcs.length > 1 ? arcs.map((a) => a.color) : OUTCOME_COLORS.slice(0, 2)

  // SMIL keeps running off screen unless told otherwise.
  useEffect(() => {
    const svg = art.current
    if (!svg || typeof svg.pauseAnimations !== 'function') return
    if (onScreen) svg.unpauseAnimations()
    else svg.pauseAnimations()
  }, [onScreen])

  const appear = (delay: number) =>
    reduce
      ? {}
      : { initial: { opacity: 0, scale: 0.94 }, animate: { opacity: 1, scale: 1 }, transition: { duration: 1.4, ease: EASE, delay } }
  const fade = (delay: number) =>
    reduce ? {} : { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 1, ease: EASE, delay } }

  return (
    <div ref={wrap} className={cn('vl-orrery relative mx-auto w-full max-w-[560px]', !onScreen && 'is-paused')}>
      <p className="sr-only">
        An engraved orrery: the market's public prices ring the outside, a veil of zero-knowledge proofs turns in the
        middle, and private notes orbit inside it, where nobody can tell whose they are.
      </p>
      <svg ref={art} viewBox="0 0 600 600" className="h-auto w-full overflow-visible" aria-hidden="true" focusable="false">
        <defs>
          <radialGradient id="vl-orrery-bg">
            <stop offset="0" stopColor={GOLD} stopOpacity="0.13" />
            <stop offset="0.55" stopColor={GOLD} stopOpacity="0.04" />
            <stop offset="1" stopColor={GOLD} stopOpacity="0" />
          </radialGradient>
          {/* A soft band on the veil's radius, drawn with a gradient so nothing needs a blur filter. */}
          <radialGradient id="vl-orrery-veil-band" gradientUnits="userSpaceOnUse" cx={c} cy={c} r={ORRERY.veil + 22}>
            <stop offset={(ORRERY.veil - 22) / (ORRERY.veil + 22)} stopColor={GOLD} stopOpacity="0" />
            <stop offset={ORRERY.veil / (ORRERY.veil + 22)} stopColor={GOLD} stopOpacity="0.11" />
            <stop offset="1" stopColor={GOLD} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="vl-orrery-halo">
            <stop offset="0.55" stopColor={GOLD} stopOpacity="0.28" />
            <stop offset="1" stopColor={GOLD} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="vl-orrery-core" cx="0.38" cy="0.32" r="0.75">
            <stop offset="0" stopColor="#4a3d18" />
            <stop offset="0.55" stopColor="#1a160d" />
            <stop offset="1" stopColor="#0b0c10" />
          </radialGradient>
          <linearGradient id="vl-orrery-gold" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f8edd0" />
            <stop offset="0.55" stopColor="#e7bf63" />
            <stop offset="1" stopColor="#9a7424" />
          </linearGradient>
          <path id="vl-orrery-text-path" d={circlePath(ORRERY.text)} fill="none" />
        </defs>

        <circle cx={c} cy={c} r="298" fill="url(#vl-orrery-bg)" />
        <g>
          {STARS.map((s, i) => (
            <circle
              key={i}
              cx={fix(s.x)}
              cy={fix(s.y)}
              r={s.r.toFixed(2)}
              fill="#f3efe6"
              opacity={s.twinkle ? 0.45 : 0.3}
              className={s.twinkle ? 'vl-orrery-twinkle' : undefined}
              style={s.twinkle ? { animationDelay: `${s.delay.toFixed(2)}s` } : undefined}
            />
          ))}
        </g>

        {/* The engraved dial, turning one way, and its legend, turning the other. */}
        <motion.g {...appear(0.15)}>
          <g className="vl-orrery-spin">
            <circle cx={c} cy={c} r={ORRERY.ticks} fill="none" stroke={GOLD} strokeOpacity="0.3" strokeWidth="0.8" />
            <circle cx={c} cy={c} r={ORRERY.ticks - 19} fill="none" stroke={GOLD} strokeOpacity="0.1" strokeWidth="0.6" />
            {TICKS.map((t, i) => (
              <line
                key={i}
                x1={fix(t.x1)}
                y1={fix(t.y1)}
                x2={fix(t.x2)}
                y2={fix(t.y2)}
                stroke={GOLD}
                strokeOpacity={t.strong ? 0.65 : 0.26}
                strokeWidth={t.strong ? 1.1 : 0.7}
              />
            ))}
          </g>
          <g className="vl-orrery-spin-rev">
            <text className="font-mono" fontSize="9.6" letterSpacing="4.2" fill={GOLD} fillOpacity="0.5">
              <textPath href="#vl-orrery-text-path" textLength={Math.round(2 * Math.PI * ORRERY.text) - 8} lengthAdjust="spacing">
                {RING_TEXT.repeat(2)}
              </textPath>
            </text>
          </g>
        </motion.g>

        {/* Public prices: the featured market's outcomes, in their colours. */}
        <motion.g {...appear(0.4)}>
          <circle cx={c} cy={c} r={ORRERY.odds} fill="none" stroke="#ffffff" strokeOpacity="0.06" strokeWidth="2" />
          {arcs.map((a, i) => {
            const d = arcPath(ORRERY.odds, a.start, a.end)
            return (
              <g key={a.index}>
                <path d={d} fill="none" stroke={a.color} strokeOpacity="0.16" strokeWidth="12" strokeLinecap="round" />
                <motion.path
                  d={d}
                  fill="none"
                  stroke={a.color}
                  strokeWidth="3"
                  strokeLinecap="round"
                  initial={reduce ? false : { pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 1.6, ease: EASE, delay: 0.7 + i * 0.25 }}
                />
              </g>
            )
          })}
          {arcs.map((a) => {
            const o = outcomes.find((x) => x.index === a.index)
            if (!o || a.end - a.start < 24) return null
            const [x, y] = polar(ORRERY.odds - 25, (a.start + a.end) / 2)
            return (
              <text
                key={a.index}
                x={fix(x)}
                y={fix(y)}
                textAnchor="middle"
                dominantBaseline="middle"
                className="font-mono"
                fontSize="11"
                letterSpacing="1.6"
                fill={a.color}
              >
                {o.label.toUpperCase().slice(0, 10)} {formatPct(Math.round(o.percentage * 10) / 10)}
              </text>
            )
          })}
        </motion.g>

        {/* The veil. */}
        <motion.g {...appear(0.6)}>
          <circle cx={c} cy={c} r={ORRERY.veil + 22} fill="url(#vl-orrery-veil-band)" />
          <g className="vl-orrery-veil">
            <circle
              cx={c}
              cy={c}
              r={ORRERY.veil}
              fill="none"
              stroke={GOLD}
              strokeOpacity="0.6"
              strokeWidth="1.1"
              strokeDasharray="1.2 5.6"
              strokeLinecap="round"
            />
          </g>
          <g className="vl-orrery-spin-rev">
            <circle
              cx={c}
              cy={c}
              r={ORRERY.veil + 12}
              fill="none"
              stroke={GOLD}
              strokeOpacity="0.22"
              strokeWidth="0.7"
              strokeDasharray="46 12 3 12"
            />
          </g>
          <circle cx={c} cy={c} r={ORRERY.veil - 12} fill="none" stroke={GOLD} strokeOpacity="0.09" strokeWidth="0.6" />
        </motion.g>

        {/* Private notes in orbit. */}
        <motion.g {...appear(0.8)}>
          <g className="vl-orrery-spin-rev">
            {ORBITS.map((o) => {
              const path = ellipsePath(o.rx, o.ry)
              return (
                <g key={o.tilt} transform={`rotate(${o.tilt} ${c} ${c})`}>
                  <path d={path} fill="none" stroke={GOLD} strokeOpacity="0.17" strokeWidth="0.8" />
                  {Array.from({ length: o.notes }, (_, n) => {
                    // With reduced motion each note rests at its own place on the orbit.
                    const angle = n * Math.PI + 0.7
                    const x = reduce ? fix(c + o.rx * Math.cos(angle)) : 0
                    const y = reduce ? fix(c + o.ry * Math.sin(angle)) : 0
                    return (
                      <g key={n}>
                        {!reduce && (
                          <animateMotion
                            path={path}
                            dur={`${o.seconds}s`}
                            begin={`-${((o.seconds / o.notes) * n).toFixed(1)}s`}
                            repeatCount="indefinite"
                          />
                        )}
                        <circle cx={x} cy={y} r="6" fill={GOLD} opacity="0.14" />
                        <circle cx={x} cy={y} r="2.3" fill={GOLD} />
                      </g>
                    )
                  })}
                </g>
              )
            })}
          </g>
        </motion.g>

        {/* The core, where every trade lands. */}
        <motion.g {...appear(0.95)}>
          <g className="vl-orrery-core">
            <circle cx={c} cy={c} r={ORRERY.core + 30} fill="url(#vl-orrery-halo)" />
            <circle cx={c} cy={c} r={ORRERY.core} fill="url(#vl-orrery-core)" stroke={GOLD} strokeOpacity="0.6" strokeWidth="1" />
            <polygon points={OCTAGON} fill="none" stroke={GOLD} strokeOpacity="0.28" strokeWidth="0.8" />
            <text x={c} y={c + 16} textAnchor="middle" className="font-display" fontSize="46" fill="url(#vl-orrery-gold)">
              V
            </text>
          </g>
        </motion.g>

        {!reduce &&
          TRADES.map((t, i) => (
            <Trade
              key={i}
              id={i}
              d={t.d}
              crossAt={t.crossAt}
              color={tradeColors[i % tradeColors.length]}
              begin={1.6 + (i * TRADE_LOOP) / TRADES.length}
            />
          ))}

        <motion.g className="hidden sm:inline" {...fade(1.6)}>
          {CALLOUTS.map((n) => (
            <g key={n.title}>
              <polyline
                points={`${fix(n.at[0])},${fix(n.at[1])} ${n.line}`}
                fill="none"
                stroke="#8b919e"
                strokeOpacity="0.55"
                strokeWidth="0.8"
              />
              <circle cx={fix(n.at[0])} cy={fix(n.at[1])} r="5" fill="none" stroke={GOLD} strokeOpacity="0.45" strokeWidth="0.8" />
              <circle cx={fix(n.at[0])} cy={fix(n.at[1])} r="2" fill={GOLD} />
              <text x={n.x} y={n.y} textAnchor={n.anchor} className="font-mono" fontSize="10.5" letterSpacing="2.4" fill={GOLD}>
                {n.title}
              </text>
              <text x={n.x} y={n.y + 21} textAnchor={n.anchor} className="font-display" fontSize="14" fontStyle="italic" fill="#c4c8d0">
                {n.sub}
              </text>
            </g>
          ))}
        </motion.g>
      </svg>

      <div className="relative z-10 mx-auto -mt-4 w-[94%] max-w-[440px] sm:-mt-8">
        {market ? <MarketPlaque market={market} outcomes={outcomes} /> : <TurboPlaque loading={loading} />}
      </div>
    </div>
  )
}

/** One trade: it leaves the prices ring in its outcome's colour, turns gold as it crosses the veil, and lands in
 *  the core with a ripple. It then waits out of sight until its next loop. */
function Trade({ id, d, crossAt, color, begin }: { id: number; d: string; crossAt: number; color: string; begin: number }) {
  const k = (x: number) => x.toFixed(3)
  const timing = { dur: `${TRADE_LOOP}s`, begin: `${begin.toFixed(2)}s`, repeatCount: 'indefinite' }
  const cross = TRAVEL * crossAt
  const shade = { values: `${color};${color};${GOLD};${GOLD}`, keyTimes: `0;${k(cross)};${k(Math.min(cross + 0.04, TRAVEL))};1` }
  const tail = `vl-orrery-tail-${id}`
  return (
    <g>
      <defs>
        <linearGradient id={tail} gradientUnits="userSpaceOnUse" x1="-28" y1="0" x2="0" y2="0">
          <stop offset="0" stopColor={color} stopOpacity="0">
            <animate attributeName="stop-color" {...shade} {...timing} />
          </stop>
          <stop offset="1" stopColor={color} stopOpacity="0.95">
            <animate attributeName="stop-color" {...shade} {...timing} />
          </stop>
        </linearGradient>
      </defs>
      <g opacity="0">
        <animateMotion path={d} rotate="auto" calcMode="linear" keyPoints="0;1;1" keyTimes={`0;${TRAVEL};1`} {...timing} />
        <animate attributeName="opacity" values="0;1;1;0;0" keyTimes={`0;0.04;${k(TRAVEL - 0.03)};${TRAVEL};1`} {...timing} />
        <line x1="-28" y1="0" x2="0" y2="0" stroke={`url(#${tail})`} strokeWidth="2.2" strokeLinecap="round" />
        <circle r="3" fill={color}>
          <animate attributeName="fill" {...shade} {...timing} />
        </circle>
      </g>
      <circle cx={c} cy={c} r={ORRERY.core} fill="none" stroke={GOLD} strokeWidth="1" opacity="0">
        <animate
          attributeName="r"
          values={`${ORRERY.core};${ORRERY.core};${ORRERY.core + 64};${ORRERY.core + 64}`}
          keyTimes={`0;${TRAVEL};${k(TRAVEL + 0.24)};1`}
          {...timing}
        />
        <animate
          attributeName="opacity"
          values="0;0;0.75;0;0"
          keyTimes={`0;${TRAVEL};${k(TRAVEL + 0.01)};${k(TRAVEL + 0.24)};1`}
          {...timing}
        />
      </circle>
    </g>
  )
}

const plaque =
  'relative block rounded-2xl border border-white/[0.09] bg-[#0b0c10]/85 px-5 py-4 shadow-[0_30px_70px_-40px_rgba(0,0,0,1)] backdrop-blur-md'

function MarketPlaque({ market, outcomes }: { market: Market; outcomes: MarketOutcomeSummary[] }) {
  const timeLeft = useLiveCountdown(market.deadlineTimestamp, market.timeRemaining)
  const marketHref = useMarketPath()
  return (
    <Link to={marketHref(market.id)} className={cn(plaque, 'group transition-colors hover:border-brand-400/40')}>
      <div className="flex items-center justify-between gap-3 font-mono text-[10.5px] uppercase tracking-[0.18em]">
        <span className="inline-flex shrink-0 items-center gap-2 text-yes-400">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yes-400 opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-yes-400" />
          </span>
          Live market
        </span>
        <span className="truncate text-[#8b919e]">
          {getCategoryName(market.category)} · {getTokenSymbol(market.tokenType)}
        </span>
      </div>
      <p className="mt-2.5 line-clamp-2 font-display text-[19px] leading-[1.3] text-[#f3efe6] sm:text-[20px]">
        {market.question}
      </p>
      <div className="mt-3 flex items-center justify-between gap-3 font-mono text-[12px]">
        <span className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
          {outcomes.map((o) => (
            <span key={o.outcome} className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: OUTCOME_COLORS[o.index] ?? GOLD }} />
              <span className="text-[#c4c8d0]">{o.label}</span>
              <span className={cn('tabular-nums', o.styles.text)}>{formatPct(Math.round(o.percentage * 10) / 10)}</span>
            </span>
          ))}
        </span>
        <span className="shrink-0 tabular-nums text-[#8b919e]">{timeLeft === 'Ended' ? 'Closed' : `Ends in ${timeLeft}`}</span>
      </div>
    </Link>
  )
}

function TurboPlaque({ loading }: { loading: boolean }) {
  if (loading) {
    return (
      <div className={cn(plaque, 'animate-pulse space-y-3')} aria-busy="true">
        <div className="h-2.5 w-24 rounded bg-white/[0.07]" />
        <div className="h-5 w-4/5 rounded bg-white/[0.07]" />
        <div className="h-2.5 w-2/5 rounded bg-white/[0.05]" />
      </div>
    )
  }
  return (
    <div className={plaque}>
      <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-brand-300">Turbo</p>
      <p className="mt-2.5 font-display text-[19px] leading-[1.3] text-[#f3efe6] sm:text-[20px]">
        Will BTC be up or down in five minutes?
      </p>
      <Link to="/turbo/BTC" className="mt-3 inline-flex items-center gap-1.5 text-[14px] text-brand-300 hover:text-brand-200">
        Open the live round <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  )
}
