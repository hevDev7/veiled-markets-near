import { animate, motion, useInView, useReducedMotion } from 'framer-motion'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export const EASE = [0.16, 1, 0.3, 1] as const

/** Scroll animations run once, when the element is a little way inside the viewport. */
export const IN_VIEW = { once: true, margin: '0px 0px -12% 0px' } as const

export const btnPrimary =
  'inline-flex items-center justify-center gap-2 rounded-full bg-brand-400 font-semibold text-[#0b0b0d] ' +
  'shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_12px_32px_-14px_rgba(201,168,76,0.7)] ' +
  'transition-colors duration-200 hover:bg-brand-300 active:translate-y-px disabled:cursor-wait disabled:opacity-60'

export const btnSecondary =
  'inline-flex items-center justify-center gap-2 rounded-full border border-white/15 font-medium text-[#f3efe6] ' +
  'transition-colors duration-200 hover:border-white/35 hover:bg-white/[0.04]'

export const btnLg = 'h-12 px-6 text-[15px]'
export const btnSm = 'h-10 px-4 text-[14px]'

export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mx-auto w-full max-w-[1200px] px-5 sm:px-8', className)}>{children}</div>
}

/** Where an element comes from as it appears. */
export type From = 'up' | 'left' | 'right' | 'scale' | 'fade'

const OFFSET: Record<From, { x?: number; y?: number; scale?: number }> = {
  up: { y: 30 },
  left: { x: -40 },
  right: { x: 40 },
  scale: { scale: 0.94 },
  fade: {},
}
const hiddenFrom = (from: From) => ({ opacity: 0, ...OFFSET[from] })
const SHOWN = { opacity: 1, x: 0, y: 0, scale: 1 }

/** Brings content in once when it scrolls into view. */
export function Reveal({
  children,
  delay = 0,
  from = 'up',
  className,
}: {
  children: ReactNode
  delay?: number
  from?: From
  className?: string
}) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={reduce ? false : hiddenFrom(from)}
      whileInView={SHOWN}
      viewport={IN_VIEW}
      transition={{ duration: 0.75, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  )
}

type StaggerTag = 'div' | 'ul' | 'ol' | 'li' | 'dl'
const tagOf = (as: StaggerTag) => motion[as] as typeof motion.div

/** A group whose `StaggerItem`s appear one after another when the group scrolls into view. */
export function Stagger({
  children,
  className,
  as = 'div',
  gap = 0.09,
  delay = 0,
}: {
  children: ReactNode
  className?: string
  as?: StaggerTag
  gap?: number
  delay?: number
}) {
  const reduce = useReducedMotion()
  const Tag = tagOf(as)
  return (
    <Tag
      className={className}
      initial={reduce ? false : 'hidden'}
      whileInView="show"
      viewport={IN_VIEW}
      variants={{ hidden: {}, show: { transition: { staggerChildren: gap, delayChildren: delay } } }}
    >
      {children}
    </Tag>
  )
}

export function StaggerItem({
  children,
  className,
  as = 'div',
  from = 'up',
}: {
  children: ReactNode
  className?: string
  as?: StaggerTag
  from?: From
}) {
  const Tag = tagOf(as)
  return (
    <Tag
      className={className}
      variants={{ hidden: hiddenFrom(from), show: { ...SHOWN, transition: { duration: 0.75, ease: EASE } } }}
    >
      {children}
    </Tag>
  )
}

/** The hairline between two sections; it draws outward from the middle as the section arrives. */
export function Rule() {
  const reduce = useReducedMotion()
  return (
    <motion.div
      aria-hidden
      className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.16] to-transparent"
      initial={reduce ? false : { scaleX: 0, opacity: 0 }}
      whileInView={{ scaleX: 1, opacity: 1 }}
      viewport={IN_VIEW}
      transition={{ duration: 1.2, ease: EASE }}
    />
  )
}

/** An odds bar that fills to its share when it scrolls into view, and follows the price after that. */
export function GrowBar({ pct, className }: { pct: number; className?: string }) {
  const reduce = useReducedMotion()
  const width = `${Math.max(2, pct)}%`
  if (reduce) return <div className={cn('h-full rounded-full', className)} style={{ width }} />
  return (
    <motion.div
      className={cn('h-full rounded-full', className)}
      initial={{ width: '0%' }}
      whileInView={{ width }}
      viewport={IN_VIEW}
      transition={{ duration: 1.1, ease: EASE, delay: 0.2 }}
    />
  )
}

/** A number that counts up to its value the first time it is seen. */
export function CountUp({ to, format = (n) => String(Math.round(n)) }: { to: number; format?: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, IN_VIEW)
  const reduce = useReducedMotion()
  const [value, setValue] = useState(reduce ? to : 0)

  useEffect(() => {
    if (reduce) {
      setValue(to)
      return
    }
    if (!inView) return
    const controls = animate(0, to, { duration: 1.5, ease: EASE, onUpdate: setValue })
    return () => controls.stop()
  }, [inView, to, reduce])

  return <span ref={ref}>{format(value)}</span>
}

export function Eyebrow({ index, children }: { index?: string; children: ReactNode }) {
  return (
    <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-brand-300">
      {index && <span className="text-[#8b919e]">{index} / </span>}
      {children}
    </p>
  )
}

/** A heading that is uncovered from its top edge down while it rises into place. */
const TITLE_REVEAL = {
  hidden: { opacity: 0, y: 28, clipPath: 'inset(0% -6% 100% -6%)' },
  show: { opacity: 1, y: 0, clipPath: 'inset(0% -6% -18% -6%)', transition: { duration: 0.95, ease: EASE } },
}

export function SectionHeading({
  id,
  index,
  eyebrow,
  title,
  lead,
  action,
  className,
}: {
  id: string
  index: string
  eyebrow: string
  title: ReactNode
  lead?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <Stagger gap={0.12} className={cn('flex flex-col gap-6 md:flex-row md:items-end md:justify-between', className)}>
      <div className="max-w-2xl">
        <StaggerItem from="left">
          <Eyebrow index={index}>{eyebrow}</Eyebrow>
        </StaggerItem>
        <motion.h2
          id={id}
          variants={TITLE_REVEAL}
          className="mt-4 font-display text-[clamp(2.1rem,4.4vw,3.4rem)] leading-[1.04] tracking-[-0.02em] text-[#f3efe6]"
        >
          {title}
        </motion.h2>
        {lead && (
          <StaggerItem>
            <p className="mt-5 text-[17px] leading-[1.65] text-[#8b919e]">{lead}</p>
          </StaggerItem>
        )}
      </div>
      {action && (
        <StaggerItem from="fade" className="shrink-0">
          {action}
        </StaggerItem>
      )}
    </Stagger>
  )
}

/** A redaction bar for information that never reaches the chain. */
export function Veil({ className, label = 'Hidden' }: { className?: string; label?: string }) {
  return <span role="img" aria-label={label} className={cn('vl-veil w-[8.5em]', className)} />
}

/** A veil that is drawn across from the left when it scrolls into view. */
export function VeilDraw({ delay = 0, className, label }: { delay?: number; className?: string; label?: string }) {
  const reduce = useReducedMotion()
  return (
    <motion.span
      className="inline-flex origin-left"
      initial={reduce ? false : { scaleX: 0, opacity: 0 }}
      whileInView={{ scaleX: 1, opacity: 1 }}
      viewport={IN_VIEW}
      transition={{ duration: 0.9, ease: EASE, delay }}
    >
      <Veil className={className} label={label} />
    </motion.span>
  )
}

export function Tag({ tone, children }: { tone: 'public' | 'private'; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em]',
        tone === 'private'
          ? 'bg-brand-400/[0.12] text-brand-300 ring-1 ring-inset ring-brand-400/30'
          : 'bg-white/[0.04] text-[#8b919e] ring-1 ring-inset ring-white/10',
      )}
    >
      {children}
    </span>
  )
}
