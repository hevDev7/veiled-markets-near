import { motion, useReducedMotion } from 'framer-motion'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export const EASE = [0.16, 1, 0.3, 1] as const

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

/** Fades content up once when it scrolls into view. */
export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.6, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  )
}

export function Eyebrow({ index, children }: { index?: string; children: ReactNode }) {
  return (
    <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-brand-300">
      {index && <span className="text-[#8b919e]">{index} / </span>}
      {children}
    </p>
  )
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
    <Reveal className={cn('flex flex-col gap-6 md:flex-row md:items-end md:justify-between', className)}>
      <div className="max-w-2xl">
        <Eyebrow index={index}>{eyebrow}</Eyebrow>
        <h2
          id={id}
          className="mt-4 font-display text-[clamp(2.1rem,4.4vw,3.4rem)] leading-[1.04] tracking-[-0.02em] text-[#f3efe6]"
        >
          {title}
        </h2>
        {lead && <p className="mt-5 text-[17px] leading-[1.65] text-[#8b919e]">{lead}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </Reveal>
  )
}

/** A redaction bar for information that never reaches the chain. */
export function Veil({ className, label = 'Hidden' }: { className?: string; label?: string }) {
  return <span role="img" aria-label={label} className={cn('vl-veil w-[8.5em]', className)} />
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
