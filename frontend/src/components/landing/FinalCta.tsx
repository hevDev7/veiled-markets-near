import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { btnLg, btnPrimary, btnSecondary, Container, Eyebrow, Reveal, Stagger, StaggerItem } from './shared'
import type { LaunchApp } from './data'

export function FinalCta({ app }: { app: LaunchApp }) {
  return (
    <section aria-labelledby="cta-title" className="relative py-24 sm:py-32">
      <Container>
        <Reveal from="scale">
          <div className="relative overflow-hidden rounded-[28px] border border-brand-400/20 bg-[#0b0c10] px-6 py-16 text-center sm:px-12 sm:py-20">
            <div
              aria-hidden
              className="absolute inset-x-0 -top-1/2 mx-auto h-[140%] max-w-[900px] bg-[radial-gradient(closest-side,rgba(201,168,76,0.16),transparent)]"
            />
            <div aria-hidden className="vl-hero-beams opacity-70" />
            <Stagger gap={0.12} delay={0.2} className="relative">
              <StaggerItem from="fade">
                <Eyebrow>Ready when you are</Eyebrow>
              </StaggerItem>
              <StaggerItem>
              <h2
                id="cta-title"
                className="mx-auto mt-5 max-w-3xl font-display text-[clamp(2.3rem,5.2vw,4.2rem)] leading-[1.02] tracking-[-0.025em] text-[#f3efe6]"
              >
                Your next position doesn’t need an <em className="text-brand-300">audience.</em>
              </h2>
              </StaggerItem>
              <StaggerItem>
              <p className="mx-auto mt-6 max-w-xl text-[17px] leading-relaxed text-[#c4c8d0]">
                Connect Meteor Wallet on NEAR testnet and place your first private trade in a few minutes.
              </p>
              </StaggerItem>
              <StaggerItem>
              <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
                <button type="button" onClick={app.launch} disabled={app.connecting} className={cn(btnPrimary, btnLg)}>
                  {app.connecting ? 'Connecting…' : 'Launch app'}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </button>
                <Link to="/turbo" className={cn(btnSecondary, btnLg)}>
                  Try Turbo first
                </Link>
              </div>
              </StaggerItem>
            </Stagger>
          </div>
        </Reveal>
      </Container>
    </section>
  )
}
