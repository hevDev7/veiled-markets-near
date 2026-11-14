// First: Aleo explorer reads are answered from the NEAR contract (lib/near/aleo-rest.ts).
import './lib/near/boot'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
// The Aleo wallet provider/modal names resolve to the NEAR Connect stand-ins (see vite.config.ts).
import { AleoWalletProvider } from '@provablehq/aleo-wallet-adaptor-react'
import { WalletModalProvider } from '@provablehq/aleo-wallet-adaptor-react-ui'
import App from './App'
import { WalletBridge } from './components/WalletBridge'
import './styles/globals.css'
import { initializeQuestionMappings } from './lib/question-mapping'
import { initializeMarketIds } from './lib/aleo-client'

// Keep walletName in localStorage so autoConnect can reconnect on refresh

function applyInitialTheme() {
  const root = document.documentElement
  root.classList.add('dark')
  root.classList.remove('light')
  root.style.colorScheme = 'dark'
}

// Initialize question hash to text mappings on app startup
initializeQuestionMappings()

// Load the market list (ids, questions, labels, metadata) from the NEAR contract
initializeMarketIds()

// Apply persisted UI theme before the app renders.
applyInitialTheme()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AleoWalletProvider>
      <WalletModalProvider>
        <BrowserRouter>
          <WalletBridge />
          <App />
        </BrowserRouter>
      </WalletModalProvider>
    </AleoWalletProvider>
  </React.StrictMode>,
)
