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

// Clear stale wallet session to prevent hung autoConnect on reload
try { localStorage.removeItem('walletName') } catch { /* noop */ }

// Initialize question hash to text mappings on app startup
initializeQuestionMappings()

// Initialize market IDs from indexer on app startup
initializeMarketIds()

const wallets = [
  new ShieldWalletAdapter(),
]

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AleoWalletProvider
      wallets={wallets}
      network={Network.TESTNET}
      autoConnect={false}
      decryptPermission={DecryptPermission.AutoDecrypt}
      programs={[
        config.programId,
        'credits.aleo',
        config.usdcxProgramId,
        // Transitive dependencies of test_usdcx_stablecoin.aleo
        // Leo Wallet needs ALL imported programs registered to resolve them
        'merkle_tree.aleo',
        'test_usdcx_multisig_core.aleo',
        'test_usdcx_freezelist.aleo',
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

