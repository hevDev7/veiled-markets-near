import { useEffect, useState } from 'react'
import { useMarketTx } from './lib/near/market-tx'
import { Routes, Route, Navigate, useLocation, useNavigationType } from 'react-router-dom'
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react'
import { Landing, Dashboard, MyBets, History, MarketDetail, Governance, CreateMarketPage, TermsOfService, PrivacyPolicy, RiskDisclosure, CookiesPolicy, HowItWorks, FAQ, Docs, BrandKit, BugBounty } from './pages'
import { MyParlays } from './pages/MyParlays'
import { VerifyTurbo } from './pages/VerifyTurbo'
import { Turbo } from './pages/Turbo'
import { TurboDetail } from './pages/TurboDetail'
import { useWalletStore } from './lib/store'
import { initializeMarketIds } from './lib/aleo-client'
import { ErrorBoundary } from './components/ErrorBoundary'
import { MobileNav } from './components/MobileNav'
import { ParlaySlip } from './components/ParlaySlip'
import { FEATURES } from './lib/near/config'

// Protected Route Component
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { wallet } = useWalletStore()
  const { connected: providerConnected, connecting: providerConnecting } = useWallet()
  const [canRedirect, setCanRedirect] = useState(false)

  const isConnected = wallet.connected || providerConnected

  useEffect(() => {
    if (isConnected || providerConnecting) {
      setCanRedirect(false)
      return
    }

    // Give wallet auto-connect enough time to reconnect before redirecting.
    const timeout = window.setTimeout(() => setCanRedirect(true), 2500)
    return () => window.clearTimeout(timeout)
  }, [isConnected, providerConnecting])

  if (isConnected) {
    return <>{children}</>
  }

  if (!canRedirect) {
    return <div className="min-h-screen bg-surface-950" />
  }

  if (!isConnected) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}

// A new page opens at the top, or at the element its #hash names once that has rendered. Back and forward (POP)
// keep the browser's own scroll handling.
function ScrollToTop() {
  const { pathname, hash } = useLocation()
  const navigationType = useNavigationType()

  useEffect(() => {
    if (navigationType === 'POP') return
    if (!hash) {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior })
      return
    }
    let tries = 0
    const timer = window.setInterval(() => {
      const target = document.getElementById(decodeURIComponent(hash.slice(1)))
      if (target || ++tries > 30) {
        window.clearInterval(timer)
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' })
        else window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior })
      }
    }, 100)
    return () => window.clearInterval(timer)
  }, [pathname, hash, navigationType])

  return null
}

function App() {
  // Initialize market IDs from indexer on app startup
  useEffect(() => {
    initializeMarketIds().catch(console.error);
    // Market pages are addressed by their creating transaction hash; fill in hashes of markets created since last visit.
    useMarketTx.getState().refresh().catch(() => undefined);
  }, []);

  return (
    <ErrorBoundary>
      <ScrollToTop />
      <Routes>
        {/* Landing Page - shown when not connected */}
        <Route path="/" element={<Landing />} />

        {/* Dashboard - requires wallet connection */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />

        {/* My Bets Page */}
        <Route
          path="/portfolio"
          element={
            <ProtectedRoute>
              <MyBets />
            </ProtectedRoute>
          }
        />

        {/* My Parlays Page */}
        <Route
          path="/my-parlays"
          element={
            <ProtectedRoute>
              <MyParlays />
            </ProtectedRoute>
          }
        />

        {/* History Page */}
        <Route
          path="/history"
          element={
            <ProtectedRoute>
              <History />
            </ProtectedRoute>
          }
        />

        {/* Market Detail Page */}
        <Route
          path="/market/:marketId"
          element={<MarketDetail />}
        />

        {/* The Settings page is gone; its private balance panel lives on Portfolio. */}
        <Route path="/settings" element={<Navigate to="/portfolio" replace />} />

        {/* Governance Page — accessible without wallet for viewing */}
        <Route
          path="/governance"
          element={
            <Governance />
          }
        />

        {/* Create Market Page */}
        <Route
          path="/create"
          element={
            <ProtectedRoute>
              <CreateMarketPage />
            </ProtectedRoute>
          }
        />

        {/* Resource Pages */}
        <Route path="/how-it-works" element={<HowItWorks />} />
        <Route path="/faq" element={<FAQ />} />
        {/* Docs — new comprehensive page (replaces /api-docs). /api-docs
            still redirects here so existing links keep working. */}
        <Route path="/docs" element={<Docs />} />
        <Route path="/api-docs" element={<Navigate to="/docs" replace />} />
        <Route path="/brand-kit" element={<BrandKit />} />
        <Route path="/bug-bounty" element={<BugBounty />} />

        {/* Veiled Turbo — rolling market detail + index + verify */}
        <Route path="/turbo" element={<Turbo />} />
        <Route path="/turbo/:symbol" element={<TurboDetail />} />
        <Route path="/verify/turbo/:marketId" element={<VerifyTurbo />} />

        {/* Legal Pages */}
        <Route path="/terms" element={<TermsOfService />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/risk-disclosure" element={<RiskDisclosure />} />
        <Route path="/cookies" element={<CookiesPolicy />} />

        {/* Catch all - redirect to landing */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* Parlay Slip — floating overlay */}
      {FEATURES.parlays && <ParlaySlip />}

      {/* Mobile bottom navigation — hidden on md+ */}
      <MobileNav />
    </ErrorBoundary>
  )
}

export default App
