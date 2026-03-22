import { Link } from 'react-router-dom'
import { ArrowLeft, Package, Terminal, Code, BookOpen, ArrowRight } from 'lucide-react'
import { Footer } from '../components/Footer'

function CodeBlock({ children, title }: { children: string; title?: string }) {
  return (
    <div className="rounded-xl overflow-hidden border border-white/[0.04]">
      {title && (
        <div className="px-4 py-2 bg-white/[0.04] border-b border-white/[0.04]">
          <span className="text-xs font-mono text-surface-400">{title}</span>
        </div>
      )}
      <pre className="p-4 bg-white/[0.02] overflow-x-auto">
        <code className="text-sm font-mono text-surface-300 leading-relaxed">{children}</code>
      </pre>
    </div>
  )
}

export function APIDocs() {
  return (
    <div className="min-h-screen bg-surface-950 text-surface-300">
      <header className="border-b border-white/[0.04]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-surface-500 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="flex items-center gap-3 mb-3">
          <h1 className="font-display text-3xl sm:text-4xl text-white">API Documentation</h1>
          <span className="px-2.5 py-1 rounded-lg bg-brand-500/15 text-brand-400 text-xs font-medium">v0.2.0</span>
        </div>
        <p className="text-surface-400 mb-12">
          TypeScript SDK for interacting with the Veiled Markets prediction protocol on Aleo.
        </p>

        <div className="space-y-16 text-sm leading-relaxed">
          {/* Installation */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Package className="w-5 h-5 text-brand-400" />
              <h2 className="text-lg font-semibold text-white">Installation</h2>
            </div>
            <CodeBlock title="terminal">{`npm install @veiled-markets/sdk @provablehq/sdk`}</CodeBlock>
            <p className="mt-4 text-surface-400">
              The SDK requires <code className="text-surface-300 bg-white/[0.04] px-1.5 py-0.5 rounded">@provablehq/sdk</code> as
              a peer dependency for Aleo network communication.
            </p>
          </section>

          {/* Quick Start */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Terminal className="w-5 h-5 text-brand-400" />
              <h2 className="text-lg font-semibold text-white">Quick Start</h2>
            </div>
            <CodeBlock title="typescript">{`import { createClient, MarketStatus, Outcome, TokenType } from '@veiled-markets/sdk'

// Initialize client
const client = createClient({
  networkUrl: 'https://api.explorer.provable.com/v1/testnet',
  programId: 'veiled_markets_v30.aleo',
})

// Fetch a market
const market = await client.getMarket(1)
console.log(market.status)    // MarketStatus.Active
console.log(market.tokenType) // TokenType.ALEO

// Get AMM pool reserves
const pool = await client.getAMMPool(1)
console.log(pool.reserves) // [bigint, bigint]

// Get current block height
const height = await client.getCurrentBlockHeight()

// Query any mapping value
const value = await client.getMappingValue('markets', '1u64')`}</CodeBlock>
          </section>

          {/* Client Methods */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Code className="w-5 h-5 text-brand-400" />
              <h2 className="text-lg font-semibold text-white">Client Methods</h2>
            </div>

            <div className="space-y-4">
              {[
                {
                  name: 'getMarket(marketId: number)',
                  returns: 'Promise<Market>',
                  desc: 'Fetch market data including status, deadline, token type, and creator.',
                },
                {
                  name: 'getAMMPool(marketId: number)',
                  returns: 'Promise<AMMPool>',
                  desc: 'Fetch AMM pool reserves, total LP shares, and liquidity depth.',
                },
                {
                  name: 'getMarketResolution(marketId: number)',
                  returns: 'Promise<MarketResolution | null>',
                  desc: 'Get resolution data including winning outcome and finalization status.',
                },
                {
                  name: 'getMarketFees(marketId: number)',
                  returns: 'Promise<MarketFees>',
                  desc: 'Fetch accumulated fee allocations (protocol, creator, resolver).',
                },
                {
                  name: 'getDisputeData(marketId: number)',
                  returns: 'Promise<DisputeData | null>',
                  desc: 'Get dispute information including proposer, bond, and proposed outcome.',
                },
                {
                  name: 'getActiveMarkets()',
                  returns: 'Promise<Market[]>',
                  desc: 'List all currently active markets.',
                },
                {
                  name: 'getMarketsByCategory(category: MarketCategory)',
                  returns: 'Promise<Market[]>',
                  desc: 'Filter markets by category (Crypto, Politics, Sports, etc.).',
                },
                {
                  name: 'getCurrentBlockHeight()',
                  returns: 'Promise<number>',
                  desc: 'Get current Aleo blockchain block height.',
                },
                {
                  name: 'getMappingValue<T>(mapping: string, key: string)',
                  returns: 'Promise<T>',
                  desc: 'Query any on-chain mapping value directly from the contract.',
                },
              ].map((method) => (
                <div key={method.name} className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2">
                    <code className="text-sm font-mono text-brand-400">{method.name}</code>
                    <span className="text-xs text-surface-500">{method.returns}</span>
                  </div>
                  <p className="text-sm text-surface-400">{method.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* AMM Utilities */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <BookOpen className="w-5 h-5 text-brand-400" />
              <h2 className="text-lg font-semibold text-white">AMM Utilities</h2>
            </div>
            <p className="text-surface-400 mb-4">
              Pure functions for FPMM price and trade calculations. All amounts use microcredits (1 token = 1,000,000 microcredits).
            </p>

            <CodeBlock title="typescript">{`import {
  calculateOutcomePrice,
  calculateAllPrices,
  calculateTradeFees,
  calculateBuySharesOut,
  calculateSellTokensOut,
  calculateLPSharesOut,
  calculateMinSharesOut,
} from '@veiled-markets/sdk'

// Get current prices
const yesPrice = calculateOutcomePrice(pool.reserves, Outcome.Yes)  // 0.0 - 1.0
const allPrices = calculateAllPrices(pool.reserves)                  // [yesPrice, noPrice]

// Calculate trade fees (2% total)
const fees = calculateTradeFees(1_000_000n)
// { protocolFee: 5000n, creatorFee: 5000n, lpFee: 10000n, total: 20000n }

// Estimate shares received from a buy
const sharesOut = calculateBuySharesOut(pool.reserves, Outcome.Yes, 1_000_000n)

// Estimate tokens received from a sell
const tokensOut = calculateSellTokensOut(pool.reserves, Outcome.Yes, sharesAmount)

// Calculate LP shares for a deposit
const lpShares = calculateLPSharesOut(pool, depositAmount)`}</CodeBlock>
          </section>

          {/* Types */}
          <section>
            <h2 className="text-lg font-semibold text-white mb-4">Type Reference</h2>

            <CodeBlock title="typescript">{`// Enums
enum MarketStatus { Pending, Active, Closed, Resolved, Cancelled }
enum Outcome { Yes, No }
enum TokenType { ALEO = 1, USDCX = 2, USAD = 3 }
enum MarketCategory { Crypto, Politics, Sports, Entertainment, Science, Other }

// Core Types
interface Market {
  id: number
  question: string
  status: MarketStatus
  tokenType: TokenType
  category: MarketCategory
  creator: string
  deadline: number        // Block height
  createdAt: number       // Block height
}

interface AMMPool {
  reserves: [bigint, bigint]   // [YES reserves, NO reserves]
  totalLPShares: bigint
}

interface MarketResolution {
  winningOutcome: Outcome
  resolver: string
  resolvedAt: number
  finalized: boolean
  challengeDeadline: number   // Block height
}

interface MarketFees {
  protocolFees: bigint
  creatorFees: bigint
  resolverFees: bigint
}

interface DisputeData {
  proposer: string
  proposedOutcome: Outcome
  bond: bigint
  disputedAt: number
}`}</CodeBlock>
          </section>

          {/* On-Chain Programs */}
          <section>
            <h2 className="text-lg font-semibold text-white mb-4">On-Chain Programs</h2>
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                <h3 className="font-mono text-sm text-white mb-1">veiled_markets_v30.aleo</h3>
                <p className="text-xs text-surface-500 mb-3">Main market contract — 31 transitions (at snarkVM limit)</p>
                <p className="text-sm text-surface-400">
                  Handles ALEO and USDCX markets: creation, trading (buy/sell), liquidity provision,
                  resolution, disputes, fee collection, and multisig treasury.
                </p>
              </div>
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                <h3 className="font-mono text-sm text-white mb-1">veiled_markets_usad_v8.aleo</h3>
                <p className="text-xs text-surface-500 mb-3">USAD market contract — separate program for USAD token</p>
                <p className="text-sm text-surface-400">
                  Mirrors the main contract functionality for USAD-denominated markets. Separated due
                  to the 31-transition limit per program in snarkVM.
                </p>
              </div>
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                <h3 className="font-mono text-sm text-white mb-1">veiled_governance_v3.aleo</h3>
                <p className="text-xs text-surface-500 mb-3">Governance program — 6 proposal types</p>
                <p className="text-sm text-surface-400">
                  On-chain governance for protocol decisions: dispute resolution, fee changes, treasury
                  management, parameter updates, emergency pause, and resolver elections.
                </p>
              </div>
            </div>
          </section>

          {/* Network Config */}
          <section>
            <h2 className="text-lg font-semibold text-white mb-4">Network Configuration</h2>
            <CodeBlock title="typescript">{`// Testnet (default)
const client = createClient({
  networkUrl: 'https://api.explorer.provable.com/v1/testnet',
  programId: 'veiled_markets_v30.aleo',
})

// Mainnet (future)
const client = createClient({
  networkUrl: 'https://api.explorer.provable.com/v1/mainnet',
  programId: 'veiled_markets_v30.aleo',
})

// Explorer URLs
// Testnet: https://testnet.explorer.provable.com
// Mainnet: https://explorer.provable.com`}</CodeBlock>
          </section>

          {/* Formatting Utilities */}
          <section>
            <h2 className="text-lg font-semibold text-white mb-4">Formatting Utilities</h2>
            <CodeBlock title="typescript">{`import {
  formatCredits,      // 1000000n → "1.000000"
  parseCredits,       // "1.5" → 1500000n
  formatPercentage,   // 0.7523 → "75.23%"
  formatTimeRemaining,// blocks → "2h 15m"
  shortenAddress,     // "aleo1abc...xyz" → "aleo1ab...xyz"
  isValidAleoAddress, // validate address format
  hashToField,        // string → field element
  blockHeightToTime,  // block number → estimated Date
} from '@veiled-markets/sdk'`}</CodeBlock>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  )
}
