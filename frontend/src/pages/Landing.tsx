import '@/styles/landing.css'
import { useLaunchApp, useLiveMarkets } from '@/components/landing/data'
import { LandingNav } from '@/components/landing/LandingNav'
import { Hero } from '@/components/landing/Hero'
import { LiveMarkets } from '@/components/landing/LiveMarkets'
import { PrivacyModel } from '@/components/landing/PrivacyModel'
import { Steps } from '@/components/landing/Steps'
import { Features } from '@/components/landing/Features'
import { Verify } from '@/components/landing/Verify'
import { Faq } from '@/components/landing/Faq'
import { FinalCta } from '@/components/landing/FinalCta'
import { LandingFooter } from '@/components/landing/LandingFooter'

// The public landing page at "/". Connected wallets go straight to the app (/dashboard).
export function Landing() {
  const app = useLaunchApp()
  const live = useLiveMarkets()

  if (app.isConnected) return null

  return (
    <div id="top" className="vl relative min-h-screen overflow-x-clip bg-[#07080b] font-sans text-[#c4c8d0] antialiased">
      <div aria-hidden className="vl-grain" />
      <LandingNav app={app} />
      <main id="main" tabIndex={-1} className="outline-none">
        <Hero app={app} markets={live.markets} loading={live.loading} />
        <LiveMarkets app={app} markets={live.markets} loading={live.loading} failed={live.failed} retry={live.retry} />
        <PrivacyModel />
        <Steps />
        <Features />
        <Verify />
        <Faq />
        <FinalCta app={app} />
      </main>
      <LandingFooter />
    </div>
  )
}
