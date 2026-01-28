import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './styles/globals.css'
import { initializeQuestionMappings } from './lib/question-mapping'
import { initializeMarketIds } from './lib/aleo-client'

// Initialize question hash to text mappings on app startup
initializeQuestionMappings()

// Initialize market IDs from indexer on app startup
initializeMarketIds()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)

