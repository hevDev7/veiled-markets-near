import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AleoWalletProvider } from '@provablehq/aleo-wallet-adaptor-react'
import { LeoWalletAdapter } from '@provablehq/aleo-wallet-adaptor-leo'
import { FoxWalletAdapter } from '@provablehq/aleo-wallet-adaptor-fox'
import { SoterWalletAdapter } from '@provablehq/aleo-wallet-adaptor-soter'
import { ShieldWalletAdapter } from '@provablehq/aleo-wallet-adaptor-shield'
import { DecryptPermission } from '@provablehq/aleo-wallet-adaptor-core'
import { Network } from '@provablehq/aleo-types'
import App from './App'
import { WalletBridge } from './components/WalletBridge'
import './styles/globals.css'
import { initializeQuestionMappings } from './lib/question-mapping'
import { initializeMarketIds } from './lib/aleo-client'
import { config } from './lib/config'

// Initialize question hash to text mappings on app startup
initializeQuestionMappings()

// Initialize market IDs from indexer on app startup
initializeMarketIds()

const wallets = [
  new LeoWalletAdapter({ appName: 'Veiled Markets' }),
  new FoxWalletAdapter({ appName: 'Veiled Markets' }),
  new SoterWalletAdapter({ appName: 'Veiled Markets' }),
  new ShieldWalletAdapter(),
]

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AleoWalletProvider
      wallets={wallets}
      network={Network.TESTNET}
      autoConnect={true}
      decryptPermission={DecryptPermission.AutoDecrypt}
      programs={[config.programId, 'credits.aleo']}
      onError={(error) => console.error('[Wallet Error]', error.message)}
    >
      <BrowserRouter>
        <WalletBridge />
        <App />
      </BrowserRouter>
    </AleoWalletProvider>
  </React.StrictMode>,
)

