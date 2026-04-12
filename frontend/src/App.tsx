import { useEffect, useState, useCallback } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useWallet, useWalletModal } from '@provablehq/aleo-wallet-adaptor-react'
import { Network } from '@provablehq/sdk'
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

// Connect Wallet page for app subdomain
function ConnectPage() {
  const navigate = useNavigate()
  const { wallet } = useWalletStore()
  const { connected: providerConnected, connecting, selectWallet, connect } = useWallet() as any
  const { setVisible } = useWalletModal()

  const isConnected = wallet.connected || providerConnected

  useEffect(() => {
    if (isConnected) {
      navigate('/dashboard', { replace: true })
    }
  }, [isConnected, navigate])

  const handleConnect = useCallback(async () => {
    try {
      const hasShield = !!(window as any).shield
      if (hasShield) {
        selectWallet('Shield Wallet')
        await connect(Network.TESTNET)
      } else {
        setVisible(true)
      }
    } catch {
      setVisible(true)
    }
  }, [selectWallet, connect, setVisible])

  if (isConnected) return null

  return (
    <div className="min-h-screen bg-surface-950 flex items-center justify-center">
      <div className="text-center max-w-md mx-auto px-6">
        <img src="/logo.svg" alt="Veiled Markets" className="w-12 h-12 mx-auto mb-6" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
        <h1 className="font-display text-3xl text-white mb-3">Connect Your Wallet</h1>
        <p className="text-surface-400 mb-8">Connect your wallet to access the prediction market dashboard.</p>
        <button onClick={handleConnect} disabled={connecting}
          className="flex items-center justify-center gap-3 w-full px-7 py-3.5 rounded-xl font-semibold text-sm active:scale-[0.96] transition-all duration-200 disabled:opacity-50"
          style={{
            background: 'linear-gradient(135deg, #c9a84c 0%, #b8922e 100%)',
            color: '#08090c',
            boxShadow: '0 2px 8px rgba(201, 168, 76, 0.25)',
          }}>
          {connecting ? 'Connecting...' : 'Connect Wallet'}
        </button>
        <a href="https://veiledmarkets.xyz" className="block mt-6 text-surface-500 hover:text-surface-300 text-sm transition-colors">
          &larr; Back to home
        </a>
      </div>
    </div>
  )
}

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
    // Redirect to "/" which shows ConnectPage on subdomain, Landing on main domain
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
        {/* Main domain: landing page. Subdomain: connect wallet page */}
        <Route path="/" element={
          window.location.hostname === 'app.veiledmarkets.xyz'
            ? <ConnectPage />
            : <Landing />
        } />

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
