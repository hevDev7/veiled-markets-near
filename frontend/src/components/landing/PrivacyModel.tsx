import { Eye, EyeOff, Info } from 'lucide-react'
import { Container, Reveal, Rule, SectionHeading, Stagger, StaggerItem, VeilDraw } from './shared'

const PUBLIC_ITEMS = [
  'Deposits and withdrawals, with account and amount',
  'Market prices and pool sizes',
  'Each trade’s market, outcome and amount',
  'Resolution votes and bonds',
]

const PRIVATE_ITEMS = [
  'Which account holds which position',
  'Your balance inside the private pool',
  'Who placed each trade',
  'Your trading history',
]

export function PrivacyModel() {
  return (
    <section id="privacy" aria-labelledby="privacy-title" className="relative py-24 sm:py-32">
      <Rule />
      <Container>
        <SectionHeading
          id="privacy-title"
          index="02"
          eyebrow="Privacy model"
          title={
            <>
              Public where it has to be.
              <br className="hidden sm:block" /> <em className="text-brand-300">Private</em> where it counts.
            </>
          }
          lead="A market needs public prices to work. It does not need to know who you are. This is exactly what NEAR can see, and what only your browser can read."
        />

        <div className="mt-14 grid gap-5 md:grid-cols-2">
          <Reveal from="left">
            <div className="h-full rounded-2xl border border-white/[0.08] bg-[#0c0e13] p-6 sm:p-8">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.05] text-[#c4c8d0]">
                  <Eye className="h-[18px] w-[18px]" aria-hidden />
                </span>
                <h3 className="text-[18px] font-semibold text-[#f3efe6]">Anyone on NEAR can see</h3>
              </div>
              <Stagger as="ul" gap={0.08} delay={0.25} className="mt-6 divide-y divide-white/[0.06]">
                {PUBLIC_ITEMS.map((item) => (
                  <StaggerItem as="li" from="fade" key={item} className="py-3.5 text-[15px] text-[#c4c8d0]">
                    {item}
                  </StaggerItem>
                ))}
              </Stagger>
            </div>
          </Reveal>

          <Reveal from="right" delay={0.08}>
            <div className="h-full rounded-2xl border border-brand-400/25 bg-[linear-gradient(180deg,rgba(201,168,76,0.07),rgba(12,14,19,0.95)_55%)] p-6 sm:p-8">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-400/[0.14] text-brand-300">
                  <EyeOff className="h-[18px] w-[18px]" aria-hidden />
                </span>
                <h3 className="text-[18px] font-semibold text-[#f3efe6]">Only you can see</h3>
              </div>
              <Stagger as="ul" gap={0.08} delay={0.33} className="mt-6 divide-y divide-white/[0.06]">
                {PRIVATE_ITEMS.map((item, i) => (
                  <StaggerItem
                    as="li"
                    from="fade"
                    key={item}
                    className="flex items-center justify-between gap-4 py-3.5 text-[15px] text-[#f3efe6]"
                  >
                    {item}
                    <VeilDraw label="Hidden from the chain" className={i % 2 ? 'w-[3.5em]' : 'w-[5em]'} delay={0.5 + i * 0.12} />
                  </StaggerItem>
                ))}
              </Stagger>
            </div>
          </Reveal>
        </div>

        <Reveal from="scale" delay={0.1}>
          <div className="mt-5 flex gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 text-[14.5px] leading-relaxed text-[#c4c8d0] sm:p-6">
            <Info className="mt-0.5 h-[18px] w-[18px] shrink-0 text-brand-300" aria-hidden />
            <p>
              <span className="font-semibold text-[#f3efe6]">Deposit before you trade.</span> If your private balance is
              too small, the app tops it up from your wallet in the same moment as the trade, and that timing can link the
              trade to you.
            </p>
          </div>
        </Reveal>
      </Container>
    </section>
  )
}
