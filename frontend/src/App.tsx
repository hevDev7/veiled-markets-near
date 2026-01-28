import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Landing, Dashboard, MyBets, History, MarketDetail, Settings } from './pages'
import { useWalletStore } from './lib/store'
import { initializeMarketIds } from './lib/aleo-client'

// Protected Route Component
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { wallet } = useWalletStore()

  if (!wallet.connected) {
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
        path="/bets"
        element={
          <ProtectedRoute>
            <MyBets />
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
        element={
          <ProtectedRoute>
            <MarketDetail />
          </ProtectedRoute>
        }
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

      {/* Catch all - redirect to landing */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
