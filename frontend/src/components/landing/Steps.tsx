import { ArrowDownToLine, ArrowUpFromLine, Fingerprint } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Container, Reveal, SectionHeading, Tag } from './shared'

const STEPS = [
  {
    n: '01',
    icon: ArrowDownToLine,
    title: 'Deposit',
    text: 'Move NEAR or testnet USDC from your wallet into your private balance.',
    tone: 'public' as const,
  },
  {
    n: '02',
    icon: Fingerprint,
    title: 'Trade',
    text: 'Your browser proves you own enough notes with a zero-knowledge proof. A relayer submits it, so your account never signs the trade.',
    tone: 'private' as const,
  },
  {
    n: '03',
    icon: ArrowUpFromLine,
    title: 'Withdraw',
    text: 'Send your balance or your winnings to any NEAR account, whenever you choose.',
    tone: 'public' as const,
  },
]

export function Steps() {
  return (
    <section id="how" aria-labelledby="how-title" className="relative border-t border-white/[0.06] py-24 sm:py-32">
      <Container>
        <SectionHeading
          id="how-title"
          index="03"
          eyebrow="How it works"
          title="Ordinary transfers in and out. Private trading in between."
          lead="Deposits and withdrawals are normal NEAR transactions. Everything you do between them runs through the note pool."
        />

        <div className="relative mt-14">
          <div
            aria-hidden
            className="absolute left-[16%] right-[16%] top-[50px] hidden h-px bg-gradient-to-r from-white/10 via-brand-400/50 to-white/10 lg:block"
          />
          <ol className="relative grid gap-5 lg:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.n}>
              <Reveal delay={i * 0.08} className="h-full">
                <div
                  className={cn(
                    'relative flex h-full flex-col rounded-2xl border p-6 sm:p-7',
                    s.tone === 'private'
                      ? 'border-brand-400/30 bg-[linear-gradient(180deg,#17150f,#0c0e13_60%)]'
                      : 'border-white/[0.08] bg-[#0c0e13]',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        'flex h-11 w-11 items-center justify-center rounded-full border bg-[#07080b]',
                        s.tone === 'private' ? 'border-brand-400/50 text-brand-300' : 'border-white/15 text-[#c4c8d0]',
                      )}
                    >
                      <s.icon className="h-5 w-5" aria-hidden />
                    </span>
                    <Tag tone={s.tone}>{s.tone === 'private' ? 'Private' : 'Public'}</Tag>
                  </div>
                  <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.2em] text-[#8b919e]">Step {s.n}</p>
                  <h3 className="mt-2 font-display text-[28px] leading-tight text-[#f3efe6]">{s.title}</h3>
                  <p className="mt-3 text-[15px] leading-relaxed text-[#c4c8d0]">{s.text}</p>
                </div>
              </Reveal>
            </li>
          ))}
          </ol>
        </div>

        <Reveal delay={0.1}>
          <p className="mt-8 font-mono text-[12px] leading-relaxed text-[#8b919e]">
            Under the hood: a depth-20 Poseidon Merkle tree of notes · nullifiers stop double spends · Groth16 proofs
            built in a web worker in your browser · one contract holds the pool, the markets and the AMM
          </p>
        </Reveal>
      </Container>
    </section>
  )
}
