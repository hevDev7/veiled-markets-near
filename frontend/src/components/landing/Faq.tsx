import { Link } from 'react-router-dom'
import { ArrowRight, Plus } from 'lucide-react'
import { Container, Eyebrow, Reveal } from './shared'
import { formatPct, useProtocolFacts } from './data'

export function Faq() {
  const facts = useProtocolFacts()
  const fee =
    facts.feePct !== null && facts.lpFeePct !== null && facts.creatorFeePct !== null && facts.protocolFeePct !== null
      ? `A buy pays ${formatPct(facts.feePct)}: ${formatPct(facts.creatorFeePct)} to the market’s creator and ${formatPct(facts.protocolFeePct)} to the protocol. A sell pays the same plus ${formatPct(facts.lpFeePct)} to liquidity providers.`
      : 'Each trade pays a small fee, split between liquidity providers, the market’s creator and the protocol.'

  const items = [
    {
      q: 'What exactly stays private?',
      a: 'Which account holds which position, your balance inside the pool, who placed each trade, and your trading history. Market prices, pool sizes, and each trade’s market, outcome and amount are public, and so are deposits and withdrawals.',
    },
    {
      q: 'Is this real money?',
      a: 'No. Veiled Markets runs on NEAR testnet. You trade with testnet NEAR and Circle’s testnet USDC, and neither has any value. You can get test USDC from Circle’s faucet at faucet.circle.com (choose NEAR Testnet).',
    },
    {
      q: 'Which wallets can I use?',
      a: 'Meteor Wallet or MyNearWallet, through NEAR Wallet Selector. You need a NEAR testnet account.',
    },
    {
      q: 'Who decides how a market resolves?',
      a: 'Standard markets resolve by vote: resolvers post a bond, anyone can dispute the result, and disputes escalate to a committee. Turbo rounds are settled by the oracle from live prices, and every price it used is in a public audit log.',
    },
    {
      q: 'Can I get my private balance back on another device?',
      a: 'Yes. Your note keys come from one wallet signature, so the same wallet finds your notes again on any device. If your wallet declines to sign, the app keeps a random key in this browser instead, and those notes can only be spent from this browser.',
    },
    {
      q: 'What does it cost?',
      a: `${fee} On testnet the relayer pays the gas for private trades and charges nothing.`,
    },
  ]

  return (
    <section id="faq" aria-labelledby="faq-title" className="relative border-t border-white/[0.06] py-24 sm:py-32">
      <Container className="grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
        <Reveal>
          <Eyebrow index="06">FAQ</Eyebrow>
          <h2
            id="faq-title"
            className="mt-4 font-display text-[clamp(2.1rem,4.4vw,3.4rem)] leading-[1.04] tracking-[-0.02em] text-[#f3efe6]"
          >
            Questions, answered.
          </h2>
          <p className="mt-5 max-w-sm text-[16px] leading-relaxed text-[#8b919e]">
            The docs cover the contract, the circuit and the relayer in detail.
          </p>
          <Link to="/docs" className="mt-6 inline-flex items-center gap-1.5 text-[15px] font-medium text-brand-300 hover:text-brand-200">
            Read the docs <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </Reveal>

        <Reveal delay={0.06} className="vl-faq divide-y divide-white/[0.07] border-y border-white/[0.07]">
          {items.map((item) => (
            <details key={item.q} className="group">
              <summary className="flex items-center justify-between gap-6 py-5 text-left text-[17px] font-medium text-[#f3efe6] transition-colors hover:text-brand-200">
                {item.q}
                <Plus className="vl-faq-icon h-5 w-5 shrink-0 text-brand-300" aria-hidden />
              </summary>
              <p className="max-w-[60ch] pb-6 pr-10 text-[15.5px] leading-relaxed text-[#c4c8d0]">{item.a}</p>
            </details>
          ))}
        </Reveal>
      </Container>
    </section>
  )
}
