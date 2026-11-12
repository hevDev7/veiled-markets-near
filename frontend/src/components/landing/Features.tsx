import { motion } from 'framer-motion'
import { Gavel, KeyRound, Layers, Scale, ShieldCheck, Timer, type LucideIcon } from 'lucide-react'
import { useTurboPriceSource } from '@/hooks/useTurboPriceSource'
import { Container, Rule, SectionHeading, Stagger, StaggerItem } from './shared'

interface Feature {
  icon: LucideIcon
  title: string
  text: string
  spec: string
}

export function Features() {
  const source = useTurboPriceSource()
  const features: Feature[] = [
    {
      icon: ShieldCheck,
      title: 'Private positions',
      text: 'Positions live as notes that only your browser can read. Nothing on chain ties them to your account.',
      spec: 'Note pool · Groth16',
    },
    {
      icon: Timer,
      title: 'Turbo rounds',
      text: 'Call BTC, ETH or SOL up or down over five minutes. The oracle opens and settles every round and logs each price it used.',
      spec: `5-minute rounds · ${source.short}`,
    },
    {
      icon: Scale,
      title: 'Always-on pricing',
      text: 'A fixed-product market maker quotes every outcome at all times. Add liquidity and earn the LP fee on every sell.',
      spec: 'FPMM · LP fees',
    },
    {
      icon: Layers,
      title: 'Up to four outcomes',
      text: 'Ask a yes-or-no question, or offer up to four outcomes in one market. Markets can trade in NEAR or USDC.',
      spec: '2 to 4 outcomes',
    },
    {
      icon: Gavel,
      title: 'Community resolution',
      text: 'Resolvers vote with a bond. Anyone can dispute the result, and disputes escalate to a committee.',
      spec: 'Vote · dispute · committee',
    },
    {
      icon: KeyRound,
      title: 'Your notes on any device',
      text: 'Your note keys come from one wallet signature, so the same wallet finds your private balance again anywhere.',
      spec: 'NEP-413 signMessage',
    },
  ]

  return (
    <section id="product" aria-labelledby="product-title" className="relative py-24 sm:py-32">
      <Rule />
      <Container>
        <SectionHeading
          id="product-title"
          index="04"
          eyebrow="Product"
          title="A complete prediction market, built around privacy."
          lead="Everything you expect from a prediction market, running on a single NEAR contract."
        />

        <Stagger
          as="ul"
          gap={0.08}
          className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.07] sm:grid-cols-2 lg:grid-cols-3"
        >
          {features.map((f) => (
            <li key={f.title} className="bg-[#08090c]">
              <StaggerItem className="flex h-full flex-col p-7 sm:p-8">
                <motion.span
                  className="inline-flex origin-bottom-left"
                  variants={{
                    hidden: { scale: 0.6, rotate: -12, opacity: 0 },
                    show: { scale: 1, rotate: 0, opacity: 1, transition: { type: 'spring', stiffness: 240, damping: 16, delay: 0.1 } },
                  }}
                >
                  <f.icon className="h-6 w-6 text-brand-300" strokeWidth={1.6} aria-hidden />
                </motion.span>
                <h3 className="mt-6 text-[18px] font-semibold text-[#f3efe6]">{f.title}</h3>
                <p className="mt-2.5 text-[15px] leading-relaxed text-[#c4c8d0]">{f.text}</p>
                <p className="mt-auto pt-6 font-mono text-[11px] uppercase tracking-[0.16em] text-[#8b919e]">{f.spec}</p>
              </StaggerItem>
            </li>
          ))}
        </Stagger>
      </Container>
    </section>
  )
}
