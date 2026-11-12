import { AlertTriangle, ArrowUpRight } from 'lucide-react'
import { RELAYER_ACCOUNT, VEILED_CONTRACT } from '@/lib/near/config'
import { Container, Reveal, Rule, SectionHeading, Stagger, StaggerItem } from './shared'
import { LINKS, ORACLE_ACCOUNT } from './data'

const ITEMS: { label: string; id: string; text: string; links: { href: string; text: string }[] }[] = [
  {
    label: 'Contract',
    id: VEILED_CONTRACT,
    text: 'The note pool, the markets, the market maker, resolution and Turbo, all in one contract.',
    links: [{ href: LINKS.contract, text: 'NearBlocks' }],
  },
  {
    label: 'Relayer',
    id: RELAYER_ACCOUNT,
    text: 'Signs private trades and pays their gas. The proof stops it from changing them.',
    links: [{ href: LINKS.relayer, text: 'NearBlocks' }],
  },
  {
    label: 'Turbo oracle',
    id: ORACLE_ACCOUNT,
    text: 'Opens and settles every Turbo round, and logs each price it used.',
    links: [
      { href: LINKS.oracle, text: 'NearBlocks' },
      { href: LINKS.auditLog, text: 'Audit log' },
    ],
  },
  {
    label: 'Source code',
    id: 'hevDev7/veiled-markets-near',
    text: 'Circuit, contract, relayer, oracle and app, under the MIT license.',
    links: [{ href: LINKS.github, text: 'GitHub' }],
  },
]

export function Verify() {
  return (
    <section id="verify" aria-labelledby="verify-title" className="relative py-24 sm:py-32">
      <Rule />
      <Container>
        <SectionHeading
          id="verify-title"
          index="05"
          eyebrow="Verify"
          title="Don’t take our word for it. Check the chain."
          lead="Everything on this page runs in the open on NEAR testnet. Inspect the accounts, read the code, or audit any Turbo round."
        />

        <Stagger as="ul" gap={0.1} className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ITEMS.map((item) => (
            <StaggerItem as="li" key={item.label}>
              <div className="flex h-full flex-col rounded-2xl border border-white/[0.08] bg-[#0c0e13] p-6 transition-colors duration-300 hover:border-brand-400/30">
                <p className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-brand-300">{item.label}</p>
                <p className="mt-3 break-all font-mono text-[13px] text-[#f3efe6]">{item.id}</p>
                <p className="mt-3 text-[14px] leading-relaxed text-[#c4c8d0]">{item.text}</p>
                <div className="mt-auto flex flex-wrap gap-x-5 gap-y-2 pt-6">
                  {item.links.map((l) => (
                    <a
                      key={l.href}
                      href={l.href}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[14px] font-medium text-brand-300 hover:text-brand-200"
                    >
                      {l.text}
                      <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                      <span className="sr-only">(opens in a new tab)</span>
                    </a>
                  ))}
                </div>
              </div>
            </StaggerItem>
          ))}
        </Stagger>

        <Reveal from="scale" delay={0.1}>
          <div className="mt-5 flex gap-4 rounded-2xl border border-[#ffa502]/25 bg-[#ffa502]/[0.04] p-6">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#ffb733]" aria-hidden />
            <div className="text-[14.5px] leading-relaxed text-[#c4c8d0]">
              <p className="font-semibold text-[#f3efe6]">Testnet beta. Test tokens only.</p>
              <p className="mt-1">
                The code has not been audited. The circuit uses a single-contribution trusted setup, which is fine for
                testnet; a mainnet launch needs a multi-party ceremony.
              </p>
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  )
}
