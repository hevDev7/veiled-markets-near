import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react'
import { Landing, Dashboard, MyBets, History, MarketDetail, Settings, Governance, CreateMarketPage, TermsOfService, PrivacyPolicy, RiskDisclosure, CookiesPolicy, HowItWorks, FAQ, Docs, BrandKit, BugBounty } from './pages'
import { MyParlays } from './pages/MyParlays'
import { VerifyTurbo } from './pages/VerifyTurbo'
import { Turbo } from './pages/Turbo'
import { TurboDetail } from './pages/TurboDetail'
import { useWalletStore } from './lib/store'
import { initializeMarketIds } from './lib/aleo-client'
import { ErrorBoundary } from './components/ErrorBoundary'
import { MobileNav } from './components/MobileNav'
import { ParlaySlip } from './components/ParlaySlip'

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

function App() {
  // Initialize market IDs from indexer on app startup
  useEffect(() => {
    initializeMarketIds().catch(console.error);
  }, []);

  return (
    <ErrorBoundary>
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

        {/* Settings Page */}
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <Settings />
            </ProtectedRoute>
          }
        />

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
      <ParlaySlip />

      {/* Mobile bottom navigation — hidden on md+ */}
      <MobileNav />
    </ErrorBoundary>
  )
}

export default App
