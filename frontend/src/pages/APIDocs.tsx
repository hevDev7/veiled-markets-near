import { Link } from 'react-router-dom'
import { ArrowLeft, Package, Terminal, Code, BookOpen } from 'lucide-react'
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
  rpcUrl: 'https://api.explorer.provable.com/v1/testnet',
  programId: 'veiled_markets_v37.aleo',
})

// Fetch a market (marketId is a field string, e.g. "123field")
const market = await client.getMarket('123field')
console.log(market.status)    // MarketStatus.Active
console.log(market.tokenType) // TokenType.ALEO

// Get AMM pool reserves
const pool = await client.getAMMPool('123field')
console.log(pool.reserve1, pool.reserve2) // bigint, bigint

// Get current block height
const height = await client.getCurrentBlockHeight()

// Query any mapping value
const value = await client.getMappingValue('markets', '123field')`}</CodeBlock>
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
                  name: 'getMarket(marketId: string)',
                  returns: 'Promise<MarketWithStats | null>',
                  desc: 'Fetch market data with pool, resolution, fees, prices, and volume in one call.',
                },
                {
                  name: 'getAMMPool(marketId: string)',
                  returns: 'Promise<AMMPool | null>',
                  desc: 'Fetch AMM pool reserves (up to 4 outcomes), total LP shares, liquidity, and volume.',
                },
                {
                  name: 'getMarketFees(marketId: string)',
                  returns: 'Promise<MarketFees | null>',
                  desc: 'Fetch accumulated fee allocations (protocol and creator fees).',
                },
                {
                  name: 'getMarketDispute(marketId: string)',
                  returns: 'Promise<DisputeData | null>',
                  desc: 'Get dispute information including disputer, bond amount (3x total voter bonds), and proposed outcome.',
                },
                {
                  name: 'getActiveMarkets()',
                  returns: 'Promise<MarketWithStats[]>',
                  desc: 'List all currently active markets with full stats.',
                },
                {
                  name: 'getMarketsByCategory(category: number)',
                  returns: 'Promise<MarketWithStats[]>',
                  desc: 'Filter markets by category number (1=Politics, 2=Sports, 3=Crypto, etc.).',
                },
                {
                  name: 'getTrendingMarkets(limit?: number)',
                  returns: 'Promise<MarketWithStats[]>',
                  desc: 'Get top markets sorted by volume. Default limit is 10.',
                },
                {
                  name: 'searchMarkets(query: string)',
                  returns: 'Promise<MarketWithStats[]>',
                  desc: 'Search markets by question text (case-insensitive).',
                },
                {
                  name: 'getCurrentBlockHeight()',
                  returns: 'Promise<bigint>',
                  desc: 'Get current Aleo blockchain block height.',
                },
                {
                  name: 'getMappingValue<T>(mapping: string, key: string)',
                  returns: 'Promise<T | null>',
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
              Contract-parity helpers for FPMM price, trade, and liquidity calculations. All amounts use microcredits
              (1 token = 1,000,000 microcredits).
            </p>

            <CodeBlock title="typescript">{`import {
  calculateContractAllPrices,
  calculateContractOutcomePrice,
  calculateContractTradeFees,
  quoteContractBuy,
  quoteContractSell,
  quoteContractAddLiquidity,
  calculateMinSharesOut,
} from '@veiled-markets/sdk'

const reserves = {
  reserve1: pool.reserve1,
  reserve2: pool.reserve2,
  reserve3: pool.reserve3,
  reserve4: pool.reserve4,
  numOutcomes: market.numOutcomes,
}

// Get current prices (supports 2-4 outcome markets)
const prices = calculateContractAllPrices(reserves)
const outcomeOnePrice = calculateContractOutcomePrice(reserves, Outcome.One)

// Calculate trade fees (2% total by default)
const fees = calculateContractTradeFees(1_000_000n)
// { protocolFee: 5000n, creatorFee: 5000n, lpFee: 10000n, totalFees: 20000n, ... }

// Estimate shares received from a buy
const buyQuote = quoteContractBuy(reserves, Outcome.Yes, 1_000_000n)

// Estimate how many shares are needed to receive 0.5 tokens on a sell
const sellQuote = quoteContractSell(reserves, Outcome.Yes, 500_000n)

// Calculate LP shares for a deposit
const liquidityQuote = quoteContractAddLiquidity(reserves, pool.totalLPShares, depositAmount)

// Apply slippage tolerance to the parity quote
const minShares = calculateMinSharesOut(buyQuote.sharesOut, slippageBps)`}</CodeBlock>
          </section>

          {/* Types */}
          <section>
            <h2 className="text-lg font-semibold text-white mb-4">Type Reference</h2>

            <CodeBlock title="typescript">{`// Enums
enum MarketStatus {
  Active = 1, Closed = 2, Resolved = 3, Cancelled = 4, PendingResolution = 5
}
enum Outcome {
  One = 1, Two = 2, Three = 3, Four = 4,
  Yes = 1, No = 2  // Legacy aliases
}
enum TokenType { ALEO = 1, USDCX = 2, USAD = 3 }
enum MarketCategory {
  Politics = 1, Sports = 2, Crypto = 3, Entertainment = 4,
  Science = 5, Economics = 6, Other = 99
}

// Core Types
interface Market {
  id: string                     // field — Unique market identifier
  creator: string                // address
  questionHash: string           // field — Hash of the market question
  question?: string              // Resolved from IPFS/off-chain
  category: MarketCategory       // u8
  numOutcomes: number            // u8 — 2, 3, or 4
  deadline: bigint               // u64 — Trading deadline (block height)
  resolutionDeadline: bigint     // u64
  status: MarketStatus           // u8
  createdAt: bigint              // u64
  tokenType: TokenType           // u8 — ALEO, USDCX, or USAD
}

interface MarketWithStats extends Market {
  pool: AMMPool
  resolution?: MarketResolution
  fees?: MarketFees
  outcomePrices: number[]        // Outcome prices (0-1 range)
  outcomePercentages: number[]   // Outcome percentages (0-100)
  totalVolume: bigint
  totalLiquidity: bigint
  outcomePayouts: number[]       // 1/price for each outcome
} 

interface AMMPool {
  marketId: string               // field
  reserve1: bigint               // u128 — Shares backing the first configured outcome label
  reserve2: bigint               // u128 — Shares backing the second configured outcome label
  reserve3: bigint               // u128 — Shares backing the third configured outcome label (0 when unused)
  reserve4: bigint               // u128 — Shares backing the fourth configured outcome label (0 when unused)
  totalLiquidity: bigint         // u128
  totalLPShares: bigint          // u128
  totalVolume: bigint            // u128
}

interface MarketResolution {
  marketId: string
  winningOutcome: number         // u8 (1-4)
  totalVoters: number            // u32 — Number of voters
  totalBonds: bigint             // u128 — Total bonds posted
  votingDeadline: bigint         // u64
  disputeDeadline: bigint        // u64
  finalized: boolean
}

interface MarketFees {
  marketId: string
  protocolFees: bigint           // u128
  creatorFees: bigint            // u128
}

interface DisputeData {
  marketId: string
  disputer: string               // address
  proposedOutcome: number        // u8
  bondAmount: bigint             // u128
  disputedAt: bigint             // u64
}`}</CodeBlock>
          </section>

          {/* On-Chain Programs */}
          <section>
            <h2 className="text-lg font-semibold text-white mb-4">On-Chain Programs</h2>
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                <h3 className="font-mono text-sm text-white mb-1">veiled_markets_v37.aleo</h3>
                <p className="text-xs text-surface-500 mb-3">ALEO market contract — 25 transitions</p>
                <p className="text-sm text-surface-400">
                  Handles ALEO-denominated markets: creation, trading (buy/sell), liquidity provision,
                  Multi-Voter Quorum resolution (vote_outcome, finalize_votes, confirm_resolution, dispute_resolution),
                  bond claiming, fee collection, and multisig treasury. v37 ships post-audit fixes (Bug A/B/C/D —
                  cross-program auth literal, MarketSeed token_type, and related hardening), adds the
                  assert_disputed helper, and keeps STATUS_DISPUTED gating with the apply_governance_resolution
                  cross-program override callable only by governance.
                </p>
              </div>
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                <h3 className="font-mono text-sm text-white mb-1">veiled_markets_usdcx_v7.aleo</h3>
                <p className="text-xs text-surface-500 mb-3">USDCX market contract — 25 transitions</p>
                <p className="text-sm text-surface-400">
                  Handles USDCX-denominated markets with the same functionality as the ALEO contract.
                  Uses Token records with MerkleProof for private trading. v7 ships post-audit fixes
                  (Bug A/B/C/D — cross-program auth literal, MarketSeed token_type, and related hardening),
                  adds the assert_disputed helper, and keeps STATUS_DISPUTED gating with
                  apply_governance_resolution.
                </p>
              </div>
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                <h3 className="font-mono text-sm text-white mb-1">veiled_markets_usad_v14.aleo</h3>
                <p className="text-xs text-surface-500 mb-3">USAD market contract — 25 transitions</p>
                <p className="text-sm text-surface-400">
                  Handles USAD-denominated markets with the same functionality as the ALEO contract.
                  Uses Token records with MerkleProof for private trading. v14 ships post-audit fixes
                  (Bug A/B/C/D — cross-program auth literal, MarketSeed token_type, and related hardening),
                  adds the assert_disputed helper, and keeps STATUS_DISPUTED gating with
                  apply_governance_resolution.
                </p>
              </div>
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                <h3 className="font-mono text-sm text-white mb-1">veiled_governance_v6.aleo</h3>
                <p className="text-xs text-surface-500 mb-3">Governance program — 31 transitions</p>
                <p className="text-sm text-surface-400">
                  On-chain governance for protocol decisions: dispute resolution overrides via committee or
                  community vote, fee changes, 3-of-N multisig treasury management, parameter updates, and
                  emergency pause. v6 splits initiate_escalation into three token-specific transitions
                  (ALEO/USDCX/USAD), adds tier passthrough to governance_resolve_*, removes blacklist_resolver
                  and update_resolver_stats, and keeps the cross-program resolve calls that drive
                  STATUS_DISPUTED markets to RESOLVED with the governance-chosen outcome.
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
  programId: 'veiled_markets_v37.aleo',
})

// Mainnet (future)
const client = createClient({
  networkUrl: 'https://api.explorer.provable.com/v1/mainnet',
  programId: 'veiled_markets_v37.aleo',
})

// Explorer URLs
// Testnet: https://testnet.explorer.provable.com
// Mainnet: https://explorer.provable.com`}</CodeBlock>
          </section>

          {/* Formatting Utilities */}
          <section>
            <h2 className="text-lg font-semibold text-white mb-4">Formatting Utilities</h2>
            <CodeBlock title="typescript">{`import {
  formatCredits,        // 1000000n → "1.00"
  parseCredits,         // "1.5" → 1500000n
  formatPercentage,     // 0.7523 → "75.2%"
  formatTimeRemaining,  // Date → "2h 15m"
  shortenAddress,       // "aleo1abc...xyz" → "aleo1a...xyz"
  isValidAleoAddress,   // validate aleo1... format
  hashToField,          // string → field element
  blockHeightToTime,    // block number → estimated Date
  getStatusDisplay,     // MarketStatus → "Active"
  getStatusColor,       // MarketStatus → "text-green-400"
  validateTradeAmount,  // (amount, balance) → { valid, error? }
  validateMarketDeadline,
  validateMarketQuestion,
  validateNumOutcomes,
} from '@veiled-markets/sdk'`}</CodeBlock>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  )
}
