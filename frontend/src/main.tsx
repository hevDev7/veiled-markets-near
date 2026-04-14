import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AleoWalletProvider } from '@provablehq/aleo-wallet-adaptor-react'
import { ShieldWalletAdapter } from '@provablehq/aleo-wallet-adaptor-shield'
import { DecryptPermission } from '@provablehq/aleo-wallet-adaptor-core'
import { Network } from '@provablehq/aleo-types'
import { WalletModalProvider } from '@provablehq/aleo-wallet-adaptor-react-ui'
import '@provablehq/aleo-wallet-adaptor-react-ui/dist/styles.css'
import App from './App'
import { WalletBridge } from './components/WalletBridge'
import './styles/globals.css'
import { initializeQuestionMappings } from './lib/question-mapping'
import { initializeMarketIds } from './lib/aleo-client'
import { config } from './lib/config'

// Keep walletName in localStorage so autoConnect can reconnect on refresh

function applyInitialTheme() {
  const root = document.documentElement
  root.classList.add('dark')
  root.classList.remove('light')
  root.style.colorScheme = 'dark'
}

// Initialize question hash to text mappings on app startup
initializeQuestionMappings()

// Initialize market IDs from indexer on app startup
initializeMarketIds()

// Apply persisted UI theme before the app renders.
applyInitialTheme()

const wallets = [
  new ShieldWalletAdapter(),
]

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AleoWalletProvider
      wallets={wallets}
      network={Network.TESTNET}
      autoConnect={true}
      decryptPermission={DecryptPermission.AutoDecrypt}
      programs={[
        // Active v6 post-audit hardening (v37/v7/v14/v6) — only set
        config.programId,
        config.usdcxMarketProgramId,
        config.usadProgramId,
        config.governanceProgramId,
        config.parlayProgramId,
        // Turbo markets (Pyth-resolved 5-min UP/DOWN)
        import.meta.env?.VITE_TURBO_PROGRAM_ID || 'veiled_turbo_v8.aleo',
        // Token + utility programs
        'credits.aleo',
        config.usdcxProgramId,
        'test_usad_stablecoin.aleo',
        // Transitive dependencies of stablecoin programs
        'merkle_tree.aleo',
        'test_usdcx_multisig_core.aleo',
        'test_usdcx_freezelist.aleo',
        'test_usad_multisig_core.aleo',
        'test_usad_freezelist.aleo',
      ]}
      onError={(error) => console.error('[Wallet Error]', error.message)}
    >
      <WalletModalProvider>
        <BrowserRouter>
          <WalletBridge />
          <App />
        </BrowserRouter>
      </WalletModalProvider>
    </AleoWalletProvider>
  </React.StrictMode>,
)
