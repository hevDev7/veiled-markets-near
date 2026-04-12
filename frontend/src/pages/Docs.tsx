import { Link } from 'react-router-dom'
import { useState } from 'react'
import {
  ArrowLeft, Package, Terminal, Code, BookOpen, Layers, Radio, Vote,
  GitBranch, Database, Shield, Wallet, Cpu, Box, Network, ArrowRight,
  ChevronRight,
} from 'lucide-react'
import { Footer } from '../components/Footer'

// ============================================================================
// Docs — comprehensive documentation for the Veiled Markets protocol + SDK.
// Replaces the old APIDocs.tsx: adds protocol overview, architecture,
// per-client SDK reference, and real-world examples. Route: /docs
// (with /api-docs still mapped for backward compat via App.tsx).
// ============================================================================

function CodeBlock({ children, title }: { children: string; title?: string }) {
  return (
    <div className="rounded-xl overflow-hidden border border-white/[0.04] not-prose">
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

function SectionHeader({
  id,
  icon: Icon,
  title,
}: {
  id: string
  icon: React.ComponentType<{ className?: string }>
  title: string
}) {
  return (
    <div id={id} className="flex items-center gap-3 mb-4 scroll-mt-24">
      <Icon className="w-5 h-5 text-brand-400" />
      <h2 className="text-xl font-semibold text-white">{title}</h2>
    </div>
  )
}

// TOC entries — keep in sync with section ids below.
const toc = [
  {
    group: 'Getting Started',
    items: [
      { id: 'overview', label: 'Overview' },
      { id: 'architecture', label: 'Architecture' },
      { id: 'installation', label: 'Installation' },
      { id: 'quick-start', label: 'Quick Start' },
    ],
  },
  {
    group: 'Protocol',
    items: [
      { id: 'protocol-famm', label: 'FAMM Markets' },
      { id: 'protocol-turbo', label: 'Turbo Markets' },
      { id: 'protocol-governance', label: 'Governance' },
      { id: 'protocol-parlay', label: 'Parlay' },
      { id: 'protocol-privacy', label: 'Privacy Model' },
      { id: 'on-chain-programs', label: 'On-Chain Programs' },
    ],
  },
  {
    group: 'SDK Reference',
    items: [
      { id: 'sdk-client', label: 'VeiledMarketsClient' },
      { id: 'sdk-turbo', label: 'TurboClient' },
      { id: 'sdk-governance', label: 'VeiledGovernanceClient' },
      { id: 'sdk-parlay', label: 'ParlayClient' },
      { id: 'sdk-indexer', label: 'IndexerClient' },
      { id: 'sdk-pyth', label: 'PythHermesClient' },
      { id: 'sdk-wallets', label: 'Wallet Adapters' },
      { id: 'sdk-executor', label: 'NodeExecutor' },
      { id: 'sdk-types', label: 'Type Reference' },
      { id: 'sdk-utils', label: 'Utilities' },
    ],
  },
  {
    group: 'Recipes',
    items: [
      { id: 'recipe-buy-famm', label: 'Buy FAMM shares' },
      { id: 'recipe-buy-turbo', label: 'Bet on Turbo' },
      { id: 'recipe-verify-turbo', label: 'Verify Turbo with Pyth' },
      { id: 'recipe-monitor-disputes', label: 'Monitor disputes' },
    ],
  },
  {
    group: 'Deployment',
    items: [
      { id: 'networks', label: 'Networks & Endpoints' },
      { id: 'examples', label: 'Example Apps' },
    ],
  },
]

export function Docs() {
  const [activeSection, setActiveSection] = useState<string>('overview')

  return (
    <div className="min-h-screen bg-surface-950 text-surface-300">
      <header className="border-b border-white/[0.04] sticky top-0 bg-surface-950/95 backdrop-blur-sm z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-surface-500 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-sm text-white font-semibold">Documentation</span>
            <span className="px-2.5 py-1 rounded-lg bg-brand-500/15 text-brand-400 text-[11px] font-medium tabular-nums">
              v0.5.0
            </span>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-10">
        {/* Sticky TOC sidebar */}
        <aside className="hidden lg:block">
          <nav className="sticky top-24 max-h-[calc(100vh-6rem)] overflow-y-auto pr-2">
            {toc.map((group) => (
              <div key={group.group} className="mb-6">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-surface-500 mb-2">
                  {group.group}
                </div>
                <ul className="space-y-1">
                  {group.items.map((item) => (
                    <li key={item.id}>
                      <a
                        href={`#${item.id}`}
                        onClick={() => setActiveSection(item.id)}
                        className={`block text-sm py-1 border-l-2 pl-3 transition-colors ${
                          activeSection === item.id
                            ? 'border-brand-400 text-white'
                            : 'border-transparent text-surface-400 hover:text-white hover:border-white/[0.08]'
                        }`}
                      >
                        {item.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <main className="max-w-3xl">
          <h1 className="font-display text-3xl sm:text-4xl text-white mb-3">Veiled Markets Documentation</h1>
          <p className="text-surface-400 mb-10 leading-relaxed">
            Complete reference for the Veiled Markets protocol on Aleo. Covers the contract
            architecture, the TypeScript SDK, and practical recipes for building apps, bots,
            and verification tools on top of it.
          </p>

          {/* ══════════════ GETTING STARTED ══════════════ */}
          <section className="mb-16">
            <SectionHeader id="overview" icon={BookOpen} title="Overview" />
            <p className="text-sm leading-relaxed mb-4">
              Veiled Markets is a privacy-preserving prediction market protocol deployed on
              the Aleo blockchain. It combines four on-chain programs that share a single
              user-facing surface:
            </p>
            <div className="grid sm:grid-cols-2 gap-3 mb-4">
              {[
                { icon: Layers, title: 'FAMM Markets', desc: 'Multi-outcome AMM markets in ALEO, USDCX, and USAD. FPMM curves with private share records.' },
                { icon: Radio, title: 'Turbo Markets', desc: 'Rolling 5-minute UP/DOWN markets backed by the Pyth Network oracle.' },
                { icon: Vote, title: 'Governance', desc: 'Multi-Voter Quorum with dispute escalation to committee/community tiers.' },
                { icon: GitBranch, title: 'Parlay', desc: 'Multi-leg parlays that pay out only when every leg resolves in your favor.' },
              ].map((f) => (
                <div key={f.title} className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                  <div className="flex items-center gap-2 mb-2">
                    <f.icon className="w-4 h-4 text-brand-400" />
                    <span className="text-sm font-semibold text-white">{f.title}</span>
                  </div>
                  <p className="text-xs text-surface-400 leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>
            <p className="text-sm text-surface-400 leading-relaxed">
              All trades are encrypted using Aleo&apos;s zk-SNARKs — bet amounts, positions, and
              balances are stored as encrypted records visible only to the owner. The SDK
              abstracts the on-chain structure so third-party apps can integrate without
              writing Leo literal parsers.
            </p>
          </section>

          <section className="mb-16">
            <SectionHeader id="architecture" icon={Network} title="Architecture" />
            <p className="text-sm leading-relaxed mb-4">
              The system has three layers that the SDK orchestrates for you:
            </p>
            <CodeBlock title="layers">{`┌───────────────────────────────────────────────────────────┐
│                       Your Application                      │
│   (React app, Node.js bot, mobile, CLI tool, audit page)    │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌───────────────────────────────────────────────────────────┐
│                    @veiled-markets/sdk                       │
│                                                              │
│  • VeiledMarketsClient   — FAMM markets (v37/usdcx/usad)    │
│  • TurboClient           — rolling 5-min markets (v8)        │
│  • VeiledGovernanceClient — disputes + committee (v6)        │
│  • ParlayClient          — multi-leg parlays (v3)            │
│  • IndexerClient         — Supabase off-chain query layer    │
│  • PythHermesClient      — Pyth price verification           │
│  • Wallet adapters       — Shield / Puzzle / Leo             │
│  • NodeExecutor          — Node.js tx submission via snarkos │
└────────┬─────────────────┬──────────────────┬──────────────┘
         │                 │                  │
         ▼                 ▼                  ▼
┌─────────────────┐ ┌─────────────┐ ┌─────────────────────┐
│   Aleo RPC      │ │  Supabase   │ │    Pyth Hermes      │
│ (programs,      │ │ (registry,  │ │  (historical prices) │
│  mappings,      │ │  audit log, │ │                     │
│  tx broadcast)  │ │  metadata)  │ │                     │
└─────────────────┘ └─────────────┘ └─────────────────────┘
         │
         ▼
┌───────────────────────────────────────────────────────────┐
│                      Aleo Blockchain                          │
│                                                                │
│  • veiled_markets_v37.aleo       (ALEO FAMM)                  │
│  • veiled_markets_usdcx_v7.aleo  (USDCX FAMM)                 │
│  • veiled_markets_usad_v14.aleo  (USAD FAMM)                  │
│  • veiled_governance_v6.aleo     (disputes + multisig)        │
│  • veiled_parlay_v3.aleo         (multi-leg parlays)          │
│  • veiled_turbo_v8.aleo          (rolling 5-min markets)      │
└───────────────────────────────────────────────────────────┘`}</CodeBlock>
            <p className="text-sm text-surface-400 leading-relaxed mt-4">
              On-chain data (markets, pools, votes) lives in contract mappings and is queried
              via the Aleo RPC explorer endpoint. Off-chain metadata (market question text,
              turbo audit log, dispute state) lives in Supabase and is queried via
              <code className="text-surface-300 bg-white/[0.04] px-1.5 py-0.5 rounded mx-1">IndexerClient</code>.
              Oracle price data for turbo markets lives at Pyth Hermes and can be cross-checked via
              <code className="text-surface-300 bg-white/[0.04] px-1.5 py-0.5 rounded mx-1">PythHermesClient</code>.
            </p>
          </section>

          <section className="mb-16">
            <SectionHeader id="installation" icon={Package} title="Installation" />
            <CodeBlock title="terminal">{`npm install @veiled-markets/sdk @provablehq/sdk`}</CodeBlock>
            <p className="mt-4 text-sm text-surface-400">
              <code className="text-surface-300 bg-white/[0.04] px-1.5 py-0.5 rounded">@provablehq/sdk</code> is a peer dependency for Aleo network primitives.
              Node.js 18+ or modern browser with ES2020 support is required.
            </p>
          </section>

          <section className="mb-16">
            <SectionHeader id="quick-start" icon={Terminal} title="Quick Start" />
            <p className="text-sm mb-3">Read on-chain state — works with no wallet:</p>
            <CodeBlock title="typescript">{`import { createClient, createTurboClient } from '@veiled-markets/sdk'

// FAMM market
const client = createClient({ network: 'testnet' })
const market = await client.getMarket('12345field')
console.log(market?.prices)  // [0.45, 0.55] for binary

// Turbo market
const turbo = createTurboClient({ network: 'testnet' })
const btc = await turbo.getMarket('7967815297...field')
console.log(btc?.baselinePrice, btc?.closingPrice)`}</CodeBlock>

            <p className="text-sm mt-6 mb-3">Submit a transaction from the browser:</p>
            <CodeBlock title="typescript">{`import { detectWallet, createTurboClient, quoteBuyUpDown } from '@veiled-markets/sdk'

const wallet = detectWallet()  // Shield / Puzzle / Leo
if (!wallet) throw new Error('Install an Aleo wallet')

await wallet.connect()

const turbo = createTurboClient()
const quote = quoteBuyUpDown(1_000_000n)  // 1 ALEO

const call = turbo.buildBuyUpDownInputs({
  marketId: '7967815297...field',
  side: 'UP',
  amountIn: quote.amountIn,
  expectedShares: quote.expectedShares,
  creditsRecord: await getRecordFromWallet(),  // wallet-specific
})

const result = await wallet.requestTransaction({
  programId: call.programId,
  functionName: call.functionName,
  inputs: call.inputs,
  fee: 1_500_000n,
})
console.log(result.transactionId)  // at1...`}</CodeBlock>

            <p className="text-sm mt-6 mb-3">Submit a transaction from a Node.js bot:</p>
            <CodeBlock title="typescript">{`import { createNodeExecutor, createTurboClient, quoteBuyUpDown } from '@veiled-markets/sdk'

const executor = createNodeExecutor({
  privateKey: process.env.ALEO_PRIVATE_KEY!,  // APrivateKey1zkp...
  // DRY_RUN=1 env var also supported
})

const turbo = createTurboClient()
const call = turbo.buildBuyUpDownInputs({ /* ... */ })
const result = await executor.execute(call)
console.log(\`Broadcast \${result.txId}\`)  // at1...`}</CodeBlock>
          </section>

          {/* ══════════════ PROTOCOL ══════════════ */}
          <section className="mb-16">
            <SectionHeader id="protocol-famm" icon={Layers} title="FAMM Markets" />
            <p className="text-sm leading-relaxed mb-4">
              FAMM (Fixed-Product Automated Market Maker) markets are the protocol&apos;s main
              trading venue. Each market has 2–4 named outcomes and prices are determined
              algorithmically using an FPMM curve. Winners redeem 1:1 after resolution.
            </p>
            <ul className="list-disc list-inside space-y-2 text-sm text-surface-400 mb-4">
              <li>
                <strong className="text-surface-300">Complete-set minting</strong> — every market is
                fully collateralized across its outcomes at all times.
              </li>
              <li>
                <strong className="text-surface-300">Token-denominated variants</strong> — ALEO
                (v37), USDCX (v7), USAD (v14). Each token has its own deployed contract with
                identical transitions but different record primitives.
              </li>
              <li>
                <strong className="text-surface-300">Liquidity provision</strong> — anyone can add
                liquidity to earn 1% LP fee. LP shares are non-transferable.
              </li>
              <li>
                <strong className="text-surface-300">Resolution</strong> — Multi-Voter Quorum: any
                wallet can vote by posting a 1-token bond; after quorum, a 3-hour dispute
                window applies; after dispute window, outcome is confirmed and winners claim.
              </li>
            </ul>
          </section>

          <section className="mb-16">
            <SectionHeader id="protocol-turbo" icon={Radio} title="Turbo Markets" />
            <p className="text-sm leading-relaxed mb-4">
              Turbo markets are rolling 5-minute UP/DOWN prediction markets powered by the Pyth
              Network oracle. A trusted operator backend creates a new round every 5 minutes
              for each of 10 crypto symbols (BTC, ETH, SOL, DOGE, XRP, BNB, ADA, AVAX, LINK,
              DOT), freezes the Pyth quote at deadline, and resolves on-chain automatically.
            </p>
            <ul className="list-disc list-inside space-y-2 text-sm text-surface-400 mb-4">
              <li>
                <strong className="text-surface-300">Parimutuel payouts</strong> — winners split the
                entire pool (minus 0.5% protocol fee) proportionally to their bet. No FPMM curve.
              </li>
              <li>
                <strong className="text-surface-300">Shared vault</strong> — all turbo rounds share a
                single on-chain vault for liquidity. No per-round seed capital needed.
              </li>
              <li>
                <strong className="text-surface-300">Automatic resolution</strong> — no voting, no
                disputes. Resolution is driven by the oracle and can be publicly verified at
                <code className="text-surface-300 bg-white/[0.04] px-1.5 py-0.5 rounded mx-1">/verify/turbo/&lt;market_id&gt;</code>.
              </li>
              <li>
                <strong className="text-surface-300">Emergency cancel</strong> — if the operator fails
                to resolve within 60 blocks (~4 min) past deadline, anyone can call
                <code className="text-surface-300 bg-white/[0.04] px-1.5 py-0.5 rounded mx-1">emergency_cancel</code>
                so bettors refund their stake.
              </li>
            </ul>
          </section>

          <section className="mb-16">
            <SectionHeader id="protocol-governance" icon={Vote} title="Governance" />
            <p className="text-sm leading-relaxed mb-4">
              <code className="text-surface-300 bg-white/[0.04] px-1.5 py-0.5 rounded">veiled_governance_v6.aleo</code>{' '}
              is the coordination layer for disputes, committee decisions, and multisig treasury
              management. It cross-program calls the market contracts to apply overrides on
              escalated markets.
            </p>
            <ul className="list-disc list-inside space-y-2 text-sm text-surface-400 mb-4">
              <li>
                <strong className="text-surface-300">Dispute escalation</strong> — Tier 1 (challenge window),
                Tier 2 (committee), Tier 3 (community). Each tier has different quorum and timelock.
              </li>
              <li>
                <strong className="text-surface-300">Committee decisions</strong> — 5-member committee
                votes on disputed outcomes. Majority wins after the committee window expires.
              </li>
              <li>
                <strong className="text-surface-300">Multisig treasury</strong> — 3-of-N signatures required
                for treasury withdrawals, fee changes, and parameter updates.
              </li>
              <li>
                <strong className="text-surface-300">Emergency pause</strong> — governance can pause trading
                at 5% quorum. Unpause requires the same quorum.
              </li>
            </ul>
          </section>

          <section className="mb-16">
            <SectionHeader id="protocol-parlay" icon={GitBranch} title="Parlay" />
            <p className="text-sm leading-relaxed mb-4">
              Multi-leg parlays combine multiple market outcomes into a single ticket. A parlay
              pays out only when every leg resolves in your favor. The{' '}
              <code className="text-surface-300 bg-white/[0.04] px-1.5 py-0.5 rounded">veiled_parlay_v3.aleo</code>{' '}
              contract validates all legs at settlement time and issues a single payout record.
            </p>
            <ul className="list-disc list-inside space-y-2 text-sm text-surface-400">
              <li>2 to 8 legs per parlay</li>
              <li>Combined odds = product of individual leg prices</li>
              <li>2% protocol fee on winnings</li>
              <li>~12-hour dispute window per underlying market must clear before payout</li>
            </ul>
          </section>

          <section className="mb-16">
            <SectionHeader id="protocol-privacy" icon={Shield} title="Privacy Model" />
            <p className="text-sm leading-relaxed mb-4">
              All trades are encrypted using Aleo&apos;s zk-SNARKs. The privacy boundary is clear:
            </p>
            <div className="grid sm:grid-cols-2 gap-3 mb-4">
              <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-700/30">
                <div className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-2">Private</div>
                <ul className="text-xs text-surface-300 space-y-1 leading-relaxed">
                  <li>• Bet amounts</li>
                  <li>• Which outcome you bought</li>
                  <li>• Your share balances per market</li>
                  <li>• Credits records (transfer history)</li>
                  <li>• LP share balances</li>
                </ul>
              </div>
              <div className="p-4 rounded-xl bg-rose-500/5 border border-rose-700/30">
                <div className="text-xs font-semibold text-rose-400 uppercase tracking-wider mb-2">Public</div>
                <ul className="text-xs text-surface-300 space-y-1 leading-relaxed">
                  <li>• Market existence + question</li>
                  <li>• Total pool liquidity</li>
                  <li>• Current outcome prices</li>
                  <li>• Resolution outcome</li>
                  <li>• Fee rates + governance state</li>
                </ul>
              </div>
            </div>
            <p className="text-sm text-surface-400 leading-relaxed">
              Off-chain data (like market question text stored in Supabase) is public by design —
              only the per-user financial data is encrypted.
            </p>
          </section>

          <section className="mb-16">
            <SectionHeader id="on-chain-programs" icon={Box} title="On-Chain Programs" />
            <div className="space-y-3">
              {[
                { id: 'veiled_markets_v37.aleo', tag: '25 transitions', desc: 'ALEO-denominated FAMM market contract. Primary venue.' },
                { id: 'veiled_markets_usdcx_v7.aleo', tag: '25 transitions', desc: 'USDCX-denominated variant. Uses Token records + MerkleProof.' },
                { id: 'veiled_markets_usad_v14.aleo', tag: '25 transitions', desc: 'USAD-denominated variant. Same mechanism as USDCX.' },
                { id: 'veiled_governance_v6.aleo', tag: '31 transitions (at limit)', desc: 'Disputes, committee votes, multisig treasury, emergency pause.' },
                { id: 'veiled_parlay_v3.aleo', tag: 'multi-leg', desc: 'Composes multiple market outcomes into a single parlay slip.' },
                { id: 'veiled_turbo_v8.aleo', tag: '10 transitions', desc: 'Rolling 5-min Pyth-backed UP/DOWN markets. Single shared vault.' },
              ].map((p) => (
                <div key={p.id} className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                  <div className="flex items-center justify-between mb-2">
                    <code className="font-mono text-sm text-white">{p.id}</code>
                    <span className="text-[10px] text-surface-500 uppercase tracking-wider">{p.tag}</span>
                  </div>
                  <p className="text-xs text-surface-400 leading-relaxed">{p.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ══════════════ SDK REFERENCE ══════════════ */}
          <div className="mb-10 border-t border-white/[0.04] pt-10">
            <h2 className="text-2xl font-display text-white mb-2">SDK Reference</h2>
            <p className="text-sm text-surface-400 leading-relaxed">
              Each client class is a typed wrapper around one contract family or off-chain service.
              All transaction builders return a{' '}
              <code className="text-surface-300 bg-white/[0.04] px-1.5 py-0.5 rounded">(programId, functionName, inputs[])</code>{' '}
              tuple — pass it to a wallet adapter or{' '}
              <code className="text-surface-300 bg-white/[0.04] px-1.5 py-0.5 rounded">NodeExecutor</code>{' '}
              to submit.
            </p>
          </div>

          <section className="mb-16">
            <SectionHeader id="sdk-client" icon={Code} title="VeiledMarketsClient" />
            <p className="text-sm leading-relaxed mb-4">
              Main client for FAMM markets (ALEO / USDCX / USAD). Reads market/pool/resolution
              state from the Aleo RPC and builds transaction inputs for all user flows.
            </p>
            <div className="space-y-3 mb-4">
              {[
                { name: 'getMarket(marketId)', returns: 'MarketWithStats | null', desc: 'Fetch a market with pool, resolution, fees, prices, and volume in one call.' },
                { name: 'getAMMPool(marketId)', returns: 'AMMPool | null', desc: 'Raw pool reserves + totals (u128s). Use with contract-math helpers to quote trades.' },
                { name: 'getMarketFees(marketId)', returns: 'MarketFees | null', desc: 'Accumulated protocol + creator fees for a market.' },
                { name: 'getMarketDispute(marketId)', returns: 'DisputeData | null', desc: 'Dispute info including disputer, bond, and proposed outcome.' },
                { name: 'getActiveMarkets(limit?)', returns: 'MarketWithStats[]', desc: 'List all markets from the indexer and enrich with live pool state. Requires setIndexer().' },
                { name: 'setIndexer(indexer)', returns: 'void', desc: 'Attach a Supabase IndexerClient. Without it, list methods return empty arrays.' },
                { name: 'searchMarkets(query, limit?)', returns: 'MarketWithStats[]', desc: 'Full-text ilike search on question text via indexer.' },
                { name: 'getTrendingMarkets(limit?)', returns: 'MarketWithStats[]', desc: 'Top markets sorted by on-chain pool.totalVolume.' },
                { name: 'buildCreateMarketInputs(params)', returns: 'MarketCall', desc: 'Build create_market[_token] tx inputs. Accepts deadline as Date.' },
                { name: 'buildBuySharesInputs(params, tokenType?)', returns: 'MarketCall', desc: 'Build buy_shares_* tx inputs. expected_shares is a required contract input — quote first.' },
                { name: 'buildSellSharesInputs(params, tokenType?)', returns: 'MarketCall', desc: 'Build sell_shares_* tx inputs with fee-bps snapshot.' },
                { name: 'buildAddLiquidityInputs(params, tokenType?)', returns: 'MarketCall', desc: 'Build add_liquidity_* tx inputs.' },
                { name: 'buildRedeemSharesInputs(shareRecord, tokenType?)', returns: 'MarketCall', desc: 'Redeem winning shares after resolution.' },
                { name: 'buildClaimRefundInputs(shareRecord, tokenType?)', returns: 'MarketCall', desc: 'Claim refund for a cancelled market.' },
              ].map((m) => (
                <div key={m.name} className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-1">
                    <code className="text-sm font-mono text-brand-400">{m.name}</code>
                    <span className="text-xs text-surface-500">→ {m.returns}</span>
                  </div>
                  <p className="text-xs text-surface-400">{m.desc}</p>
                </div>
              ))}
            </div>
            <CodeBlock title="typescript">{`import { createClient, createIndexerClient } from '@veiled-markets/sdk'

const client = createClient({ network: 'testnet' })
client.setIndexer(createIndexerClient({
  supabaseUrl: process.env.SUPABASE_URL!,
  supabaseKey: process.env.SUPABASE_ANON_KEY!,
}))

// Now list methods return real data
const top = await client.getTrendingMarkets(10)
const search = await client.searchMarkets('bitcoin')`}</CodeBlock>
          </section>

          <section className="mb-16">
            <SectionHeader id="sdk-turbo" icon={Radio} title="TurboClient" />
            <p className="text-sm leading-relaxed mb-4">
              Builds transactions and reads state for{' '}
              <code className="text-surface-300 bg-white/[0.04] px-1.5 py-0.5 rounded">veiled_turbo_v8.aleo</code>.
              Only user-callable transitions are exposed — create/resolve are operator-only.
            </p>
            <div className="space-y-3 mb-4">
              {[
                { name: 'buildBuyUpDownInputs(params)', desc: 'Bet on UP or DOWN. Returns shareNonce — persist it alongside the resulting TurboShare.' },
                { name: 'buildClaimWinningsInputs(params)', desc: 'Claim payout on a winning share. declaredPayout must match the contract formula EXACTLY.' },
                { name: 'buildClaimRefundInputs(params)', desc: 'Refund after emergency_cancel. expectedAmount = TurboShare.quantity.' },
                { name: 'buildEmergencyCancelInputs(marketId)', desc: 'Permissionless cancel after resolution_deadline (300 blocks past deadline).' },
                { name: 'getMarket(marketId)', desc: 'Fetch the on-chain TurboMarket struct.' },
                { name: 'getPool(marketId)', desc: 'Fetch the TurboPool with total_up/down_shares and total_up/down_amount.' },
                { name: 'getMarketPayouts(marketId)', desc: 'market_payouts[market_id] — total pool committed at resolve.' },
                { name: 'getVaultBalance()', desc: 'Shared vault_balance[0u8] across all turbo markets.' },
                { name: 'isShareRedeemed(shareId)', desc: 'Check share_redeemed mapping to guard duplicate claims.' },
              ].map((m) => (
                <div key={m.name} className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                  <code className="text-sm font-mono text-brand-400 block mb-1">{m.name}</code>
                  <p className="text-xs text-surface-400">{m.desc}</p>
                </div>
              ))}
            </div>
            <p className="text-sm text-surface-400 mb-3">
              Off-chain quote helpers that mirror contract arithmetic 1:1:
            </p>
            <CodeBlock title="typescript">{`import { quoteBuyUpDown, quoteTurboPayout } from '@veiled-markets/sdk'

// Quote a buy — mirrors buy_up_down_fin exactly
const quote = quoteBuyUpDown(1_000_000n)  // 1 ALEO
// → { protocolFee: 5000n, amountToPool: 995000n, expectedShares: 995000n }

// Quote a claim_winnings payout — mirrors claim_winnings_fin exactly
const payout = quoteTurboPayout(
  shareQty,             // your TurboShare.quantity
  marketPayouts,        // from getMarketPayouts()
  totalWinningShares,   // pool.totalUpShares OR totalDownShares
)
// Contract asserts declaredPayout == payout strictly — use this value.`}</CodeBlock>
          </section>

          <section className="mb-16">
            <SectionHeader id="sdk-governance" icon={Vote} title="VeiledGovernanceClient" />
            <p className="text-sm leading-relaxed mb-4">
              Reads dispute state, committee decisions, and resolver profiles from{' '}
              <code className="text-surface-300 bg-white/[0.04] px-1.5 py-0.5 rounded">veiled_governance_v6.aleo</code>.
              Also exposes the initiate-escalation flow (split per token type) and the
              cross-program governance_resolve calls.
            </p>
            <div className="space-y-3">
              {[
                { name: 'getCommitteeDecision(marketId)', desc: 'Committee vote tally + finalization status.' },
                { name: 'getMarketDisputeState(marketId, tokenType)', desc: 'Full dispute state including disputer, bond, tier, and final outcome.' },
                { name: 'getCommitteeVoteCount(marketId)', desc: 'Number of votes cast so far (0–5).' },
                { name: 'getCommitteeMembers()', desc: 'List of 5 committee addresses (set by governance multisig).' },
                { name: 'buildInitiateEscalationInputs(marketId, tokenType)', desc: 'Escalate a disputed market to the committee tier.' },
                { name: 'buildGovernanceResolveInputs(marketId, tokenType, outcome, tier)', desc: 'Cross-program resolve call from governance to the market contract.' },
              ].map((m) => (
                <div key={m.name} className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                  <code className="text-sm font-mono text-brand-400 block mb-1">{m.name}</code>
                  <p className="text-xs text-surface-400">{m.desc}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mb-16">
            <SectionHeader id="sdk-parlay" icon={GitBranch} title="ParlayClient" />
            <p className="text-sm leading-relaxed mb-4">
              Builders for{' '}
              <code className="text-surface-300 bg-white/[0.04] px-1.5 py-0.5 rounded">veiled_parlay_v3.aleo</code>{' '}
              and off-chain quote helpers for combined odds computation.
            </p>
            <CodeBlock title="typescript">{`import {
  createParlayClient,
  calculateParlayQuote,
  validateParlayLegs,
  type ParlayLeg,
} from '@veiled-markets/sdk'

const legs: ParlayLeg[] = [
  { marketId: 'abc...field', outcome: 1 },
  { marketId: 'def...field', outcome: 2 },
  { marketId: 'ghi...field', outcome: 1 },
]

const validation = validateParlayLegs(legs)
if (!validation.valid) throw new Error(validation.error)

const quote = calculateParlayQuote(legs, stakeInMicro, pricesByLeg)
// → { combinedOddsBps, potentialPayout, fee }

const parlay = createParlayClient({ network: 'testnet' })
const call = parlay.buildCreateParlayInputs({
  legs,
  stake: stakeInMicro,
  minPayout: quote.potentialPayout * 98n / 100n,  // 2% slippage
})`}</CodeBlock>
          </section>

          <section className="mb-16">
            <SectionHeader id="sdk-indexer" icon={Database} title="IndexerClient" />
            <p className="text-sm leading-relaxed mb-4">
              Typed wrapper around the Veiled Markets Supabase project. The Aleo RPC can&apos;t
              enumerate markets (mappings are key-addressable only), so the frontend maintains a
              <code className="text-surface-300 bg-white/[0.04] px-1.5 py-0.5 rounded mx-1">market_registry</code>
              table off-chain that mirrors every create tx. IndexerClient wraps that table and
              related ones (<code className="text-surface-300 bg-white/[0.04] px-1.5 py-0.5 rounded">turbo_oracle_audit</code>).
            </p>
            <div className="space-y-3 mb-4">
              {[
                { name: 'listMarkets(opts)', desc: 'Paginated list with filters: category, creator, query (ilike), limit, offset.' },
                { name: 'getMarket(marketId)', desc: 'Single market by field id.' },
                { name: 'listTurboRounds(symbol, opts)', desc: 'Recently resolved turbo rounds for a symbol (BTC/ETH/…).' },
                { name: 'listTurboRoundsJoined(symbol, opts)', desc: 'Rounds joined with their matching create event — one query, ready-to-render.' },
                { name: 'listTurboEvents(symbol, opts)', desc: 'Raw audit events filterable by event type (create/resolve/cancel).' },
                { name: 'getTurboMarketEvents(marketId)', desc: 'Full lifecycle of a specific turbo market, chronological order.' },
                { name: 'countTurboRounds(symbol)', desc: 'Total resolved rounds — uses count=exact header for a single fast query.' },
              ].map((m) => (
                <div key={m.name} className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                  <code className="text-sm font-mono text-brand-400 block mb-1">{m.name}</code>
                  <p className="text-xs text-surface-400">{m.desc}</p>
                </div>
              ))}
            </div>
            <CodeBlock title="typescript">{`import { createIndexerClient, MarketCategory } from '@veiled-markets/sdk'

const indexer = createIndexerClient({
  supabaseUrl: process.env.SUPABASE_URL!,
  supabaseKey: process.env.SUPABASE_ANON_KEY!,   // anon, NOT service_role
})

const cryptoMarkets = await indexer.listMarkets({
  category: MarketCategory.Crypto,
  limit: 20,
})

const btcHistory = await indexer.listTurboRoundsJoined('BTC', { limit: 15 })
btcHistory.forEach(({ resolve, create }) => {
  console.log(\`Round \${resolve.marketId}: \${create?.pythPrice} → \${resolve.pythPrice}\`)
})`}</CodeBlock>
          </section>

          <section className="mb-16">
            <SectionHeader id="sdk-pyth" icon={Network} title="PythHermesClient" />
            <p className="text-sm leading-relaxed mb-4">
              Read-only client for the Pyth Network Hermes HTTP API. Used for turbo market
              verification — fetches Pyth historical quotes at the exact timestamp the
              operator committed on-chain and compares them to the contract state.
            </p>
            <CodeBlock title="typescript">{`import { createPythHermesClient, createTurboClient } from '@veiled-markets/sdk'

const pyth = createPythHermesClient({ matchTolerance: 0.001 })  // 0.1%
const turbo = createTurboClient()

// Verify a single round against Pyth
const result = await pyth.verifyTurboMarket(turbo, marketId, {
  baselinePublishTimeMs: auditRow.pythPublishTime,
})

if (result.baseline && !result.baseline.match) {
  console.error(\`MISMATCH on \${marketId}:\`, {
    onChain: result.baseline.onChainPrice,
    pyth: result.baseline.pythPrice,
    delta: result.baseline.deltaFraction,
  })
}`}</CodeBlock>
            <p className="text-sm text-surface-400 mt-4">
              Direct historical/latest fetch methods are also exposed:{' '}
              <code className="text-surface-300 bg-white/[0.04] px-1.5 py-0.5 rounded">fetchLatest(symbol)</code>{' '}
              and{' '}
              <code className="text-surface-300 bg-white/[0.04] px-1.5 py-0.5 rounded">fetchHistorical(symbol, unixSeconds)</code>.
              Supports 10 symbols via{' '}
              <code className="text-surface-300 bg-white/[0.04] px-1.5 py-0.5 rounded">PYTH_FEED_IDS</code> export.
            </p>
          </section>

          <section className="mb-16">
            <SectionHeader id="sdk-wallets" icon={Wallet} title="Wallet Adapters" />
            <p className="text-sm leading-relaxed mb-4">
              Browser-only adapters that wrap Aleo wallet extensions behind a common{' '}
              <code className="text-surface-300 bg-white/[0.04] px-1.5 py-0.5 rounded">WalletAdapter</code>{' '}
              interface. Use{' '}
              <code className="text-surface-300 bg-white/[0.04] px-1.5 py-0.5 rounded">detectWallet()</code>{' '}
              to auto-pick whichever is installed.
            </p>
            <CodeBlock title="typescript">{`import {
  detectWallet,
  listInstalledWallets,
  ShieldWalletAdapter,
  PuzzleWalletAdapter,
  LeoWalletAdapter,
} from '@veiled-markets/sdk'

// Auto-detect (preference order: Shield → Puzzle → Leo)
const wallet = detectWallet()
if (!wallet) {
  alert('Install Shield, Puzzle, or Leo wallet')
}

// Or force a specific wallet if installed
const wallet2 = detectWallet('puzzle')

// Or instantiate directly
const shield = new ShieldWalletAdapter()
await shield.connect()

// All adapters implement the same interface
await wallet!.connect()                          // returns { address, network, ... }
await wallet!.requestTransaction({ ... })        // submits tx via extension popup
const records = await wallet!.getRecords(programId)  // list private records

// Inspect installed wallets (for wallet selector UI)
console.log(listInstalledWallets())  // ['shield', 'puzzle']`}</CodeBlock>
          </section>

          <section className="mb-16">
            <SectionHeader id="sdk-executor" icon={Cpu} title="NodeExecutor" />
            <p className="text-sm leading-relaxed mb-4">
              Node.js-only executor that wraps{' '}
              <code className="text-surface-300 bg-white/[0.04] px-1.5 py-0.5 rounded">snarkos developer execute</code>{' '}
              as a child process. Lets backend bots and schedulers submit transactions without
              a wallet popup. Requires{' '}
              <code className="text-surface-300 bg-white/[0.04] px-1.5 py-0.5 rounded">snarkos</code> CLI in $PATH and
              an Aleo private key in env.
            </p>
            <CodeBlock title="typescript">{`import { createNodeExecutor, createTurboClient, quoteBuyUpDown } from '@veiled-markets/sdk'

const executor = createNodeExecutor({
  privateKey: process.env.ALEO_PRIVATE_KEY!,
  // Defaults (override if needed):
  // queryEndpoint: 'https://api.explorer.provable.com/v1',
  // broadcastUrl: 'https://api.explorer.provable.com/v1/testnet/transaction/broadcast',
  // priorityFee: 1_000_000,
  // networkId: '1',  // '0' for mainnet
  // maxRetries: 5,
  // retryBaseMs: 4000,  // exponential backoff: 4s → 8s → 16s → 32s → 60s
  dryRun: process.env.DRY_RUN === '1',  // print inputs, don't broadcast
})

const turbo = createTurboClient()
const quote = quoteBuyUpDown(1_000_000n)
const call = turbo.buildBuyUpDownInputs({ /* ... */ })
const result = await executor.execute(call)
console.log(\`Broadcast tx \${result.txId}\`)  // at1...`}</CodeBlock>
            <p className="text-sm text-surface-400 mt-4">
              The executor auto-retries on Cloudflare 5xx, ECONNRESET, ETIMEDOUT, and a few other
              transient errors with exponential backoff. Fatal errors (invalid inputs, assertion
              failures, rejected tx) throw immediately.
            </p>
          </section>

          <section className="mb-16">
            <SectionHeader id="sdk-types" icon={BookOpen} title="Type Reference" />
            <CodeBlock title="typescript">{`// Enums
enum MarketStatus { Active = 1, Closed = 2, Resolved = 3, Cancelled = 4, PendingResolution = 5 }
enum Outcome { One = 1, Two = 2, Three = 3, Four = 4, Yes = 1, No = 2 }
enum TokenType { ALEO = 1, USDCX = 2, USAD = 3 }
enum MarketCategory { Politics = 1, Sports = 2, Crypto = 3, Entertainment = 4, Science = 5, Economics = 6, Other = 99 }
enum TurboMarketStatus { Active = 1, Resolved = 2, Cancelled = 3 }
type TurboSide = 'UP' | 'DOWN'
type TurboSymbol = 'BTC' | 'ETH' | 'SOL' | 'DOGE' | 'XRP' | 'BNB' | 'ADA' | 'AVAX' | 'LINK' | 'DOT'

// Core FAMM
interface Market { id: string; creator: string; questionHash: string; category: MarketCategory; numOutcomes: number; deadline: bigint; /*…*/ }
interface AMMPool { marketId: string; reserve1: bigint; reserve2: bigint; reserve3: bigint; reserve4: bigint; totalLiquidity: bigint; totalLPShares: bigint; totalVolume: bigint }
interface MarketWithStats extends Market { pool: AMMPool; prices: number[]; totalVolume: bigint; /*…*/ }
interface MarketResolution { marketId: string; winningOutcome: number; finalized: boolean; /*…*/ }
interface DisputeData { marketId: string; disputer: string; proposedOutcome: number; bondAmount: bigint; disputedAt: bigint }

// Turbo
interface TurboMarket { id: string; creator: string; symbolId: number; baselinePrice: bigint; baselineBlock: bigint; deadline: bigint; resolutionDeadline: bigint; closingPrice: bigint; winningOutcome: number; status: TurboMarketStatus; createdAt: bigint }
interface TurboPool { marketId: string; totalUpAmount: bigint; totalDownAmount: bigint; totalUpShares: bigint; totalDownShares: bigint; totalVolume: bigint }
interface TurboShare { owner: string; marketId: string; side: TurboSide; quantity: bigint; shareNonce: string; plaintext?: string }
interface TurboBuyQuote { amountIn: bigint; protocolFee: bigint; amountToPool: bigint; expectedShares: bigint }

// Indexer
interface MarketRegistryRow { marketId: string; questionText: string | null; description: string | null; category: MarketCategory | null; creatorAddress: string | null; createdAt: number | null; outcomeLabels: string[] | null }
interface TurboAuditRow { id: number; createdAt: string; event: 'create' | 'resolve' | 'cancel'; marketId: string; symbol: string; pythPrice: number; pythConf: number; pythPublishTime: string; aleoBlock: bigint; aleoTxId: string | null }

// Pyth
interface PythQuote { symbol: string; feedId: string; price: number; conf: number; publishTime: number }
interface TurboVerificationResult { marketId: string; symbol: string; event: 'baseline' | 'closing'; onChainPrice: number; pythPrice: number; delta: number; deltaFraction: number; match: boolean; pythPublishTime: number | null }`}</CodeBlock>
          </section>

          <section className="mb-16">
            <SectionHeader id="sdk-utils" icon={Code} title="Utilities" />
            <p className="text-sm leading-relaxed mb-4">
              Pure functions for formatting, validation, and contract-parity math.
            </p>
            <CodeBlock title="typescript">{`import {
  // Formatting
  formatCredits,        // 1000000n → "1.00"
  parseCredits,         // "1.5" → 1500000n
  formatPercentage,     // 0.7523 → "75.2%"
  formatTimeRemaining,  // Date → "2h 15m"
  shortenAddress,       // "aleo1abc...xyz" → "aleo1a...xyz"

  // Validation
  isValidAleoAddress,
  validateTradeAmount,
  validateMarketDeadline,
  validateMarketQuestion,
  validateNumOutcomes,

  // Hashing
  hashToField,          // string → field element

  // AMM math (contract-parity)
  calculateContractAllPrices,
  calculateContractOutcomePrice,
  calculateContractTradeFees,
  quoteContractBuy,
  quoteContractSell,
  quoteContractAddLiquidity,
  calculateMinSharesOut,

  // Fee constants
  PROTOCOL_FEE_BPS,     // 50n
  CREATOR_FEE_BPS,      // 50n
  LP_FEE_BPS,           // 100n
  TOTAL_FEE_BPS,        // 200n (2%)
  FEE_DENOMINATOR,      // 10000n
  MIN_TRADE_AMOUNT,     // 1000n (0.001 tokens)
} from '@veiled-markets/sdk'`}</CodeBlock>
          </section>

          {/* ══════════════ RECIPES ══════════════ */}
          <div className="mb-10 border-t border-white/[0.04] pt-10">
            <h2 className="text-2xl font-display text-white mb-2">Recipes</h2>
            <p className="text-sm text-surface-400 leading-relaxed">
              End-to-end code snippets for common flows. Each recipe is self-contained and can
              be copy-pasted into your app.
            </p>
          </div>

          <section className="mb-12">
            <SectionHeader id="recipe-buy-famm" icon={ArrowRight} title="Buy FAMM shares" />
            <CodeBlock title="typescript">{`import {
  createClient, quoteContractBuy, calculateMinSharesOut, detectWallet, TokenType,
} from '@veiled-markets/sdk'

const wallet = detectWallet()!
await wallet.connect()

const client = createClient({ network: 'testnet' })
const market = await client.getMarket('12345field')
if (!market) throw new Error('Market not found')

// Quote using contract-parity math
const amountIn = 1_000_000n  // 1 ALEO
const quote = quoteContractBuy(
  { reserve1: market.pool.reserve1, reserve2: market.pool.reserve2,
    reserve3: market.pool.reserve3, reserve4: market.pool.reserve4,
    numOutcomes: market.numOutcomes },
  1,  // outcome
  amountIn,
)

// Apply 1% slippage tolerance
const minSharesOut = calculateMinSharesOut(quote.sharesOut, 100)  // 100 bps

// Build tx
const call = client.buildBuySharesInputs({
  marketId: '12345field',
  outcome: 1,
  amountIn,
  expectedShares: quote.sharesOut,
  minSharesOut,
}, TokenType.ALEO)

// Wallet appends the credits record at signing time
await wallet.requestTransaction({
  programId: call.programId,
  functionName: call.functionName,
  inputs: call.inputs,
  fee: 1_500_000n,
})`}</CodeBlock>
          </section>

          <section className="mb-12">
            <SectionHeader id="recipe-buy-turbo" icon={Radio} title="Bet on a Turbo round" />
            <CodeBlock title="typescript">{`import { createTurboClient, quoteBuyUpDown, detectWallet } from '@veiled-markets/sdk'

const wallet = detectWallet()!
await wallet.connect()

// 1. Fetch current active market from operator backend
const oracleUrl = 'http://localhost:4090'
const res = await fetch(\`\${oracleUrl}/chain/symbol?symbol=BTC\`)
const { market_id } = await res.json() as { market_id: string }

// 2. Verify on-chain that market is still active
const turbo = createTurboClient()
const market = await turbo.getMarket(market_id)
if (market?.status !== 1) throw new Error('Market not active')

// 3. Quote and build
const quote = quoteBuyUpDown(1_000_000n)  // 1 ALEO

// 4. Fetch a private credits record from wallet (wallet-specific API)
const records = await wallet.getRecords('credits.aleo')
const creditsRecord = (records[0] as any)?.plaintext

const call = turbo.buildBuyUpDownInputs({
  marketId: market_id,
  side: 'UP',
  amountIn: quote.amountIn,
  expectedShares: quote.expectedShares,
  creditsRecord,
})

// 5. Submit via wallet — persist call.shareNonce for later claim
localStorage.setItem(\`nonce-\${market_id}\`, call.shareNonce)
await wallet.requestTransaction({
  programId: call.programId,
  functionName: call.functionName,
  inputs: call.inputs,
  fee: 1_500_000n,
})`}</CodeBlock>
          </section>

          <section className="mb-12">
            <SectionHeader id="recipe-verify-turbo" icon={Shield} title="Verify a Turbo round against Pyth" />
            <CodeBlock title="typescript">{`import {
  createTurboClient, createPythHermesClient, createIndexerClient,
} from '@veiled-markets/sdk'

const turbo = createTurboClient({ network: 'testnet' })
const pyth = createPythHermesClient({ matchTolerance: 0.001 })
const indexer = createIndexerClient({
  supabaseUrl: process.env.SUPABASE_URL!,
  supabaseKey: process.env.SUPABASE_ANON_KEY!,
})

// 1. Fetch audit log for the market (has the real Pyth publish_time)
const events = await indexer.getTurboMarketEvents(marketId)
const createEvent = events.find(e => e.event === 'create')
const resolveEvent = events.find(e => e.event === 'resolve')

// 2. Verify against Pyth at the EXACT publish times from audit log
const result = await pyth.verifyTurboMarket(turbo, marketId, {
  baselinePublishTimeMs: createEvent
    ? new Date(createEvent.pythPublishTime).getTime()
    : undefined,
  closingPublishTimeMs: resolveEvent
    ? new Date(resolveEvent.pythPublishTime).getTime()
    : undefined,
})

if (result.baseline?.match && result.closing?.match) {
  console.log('✓ Market verified — operator committed correct prices')
} else {
  console.error('✗ Mismatch detected:', result)
}`}</CodeBlock>
          </section>

          <section className="mb-16">
            <SectionHeader id="recipe-monitor-disputes" icon={Vote} title="Monitor disputes" />
            <CodeBlock title="typescript">{`import {
  createGovernanceClient, createIndexerClient, TokenType,
} from '@veiled-markets/sdk'

const gov = createGovernanceClient({ network: 'testnet' })
const indexer = createIndexerClient({ supabaseUrl, supabaseKey })

const seen = new Set<string>()

async function tick() {
  const markets = await indexer.listMarkets({ limit: 50 })

  for (const m of markets) {
    for (const token of [TokenType.ALEO, TokenType.USDCX, TokenType.USAD]) {
      const state = await gov.getMarketDisputeState(m.marketId, token)
      if (!state || state.disputer === '') continue

      const key = \`\${m.marketId}-\${state.disputedAt}\`
      if (seen.has(key)) continue
      seen.add(key)

      console.log(\`New dispute: \${m.questionText ?? m.marketId}\`)
      console.log(\`  Bond: \${Number(state.disputeBond) / 1_000_000}\`)
      console.log(\`  Tier: \${state.escalatedTier}\`)
    }
  }
}

setInterval(tick, 60_000)  // poll every minute`}</CodeBlock>
          </section>

          {/* ══════════════ DEPLOYMENT ══════════════ */}
          <div className="mb-10 border-t border-white/[0.04] pt-10">
            <h2 className="text-2xl font-display text-white mb-2">Deployment</h2>
          </div>

          <section className="mb-16">
            <SectionHeader id="networks" icon={Network} title="Networks & Endpoints" />
            <CodeBlock title="typescript">{`// Testnet (default)
const client = createClient({
  network: 'testnet',
  rpcUrl: 'https://api.explorer.provable.com/v1/testnet',
  explorerUrl: 'https://testnet.explorer.provable.com',
})

// Mainnet
const client = createClient({
  network: 'mainnet',
  rpcUrl: 'https://api.explorer.provable.com/v1/mainnet',
  explorerUrl: 'https://explorer.provable.com',
})

// Shortcut — use the network name and let the SDK pick endpoints
const client = createClient({ network: 'testnet' })  // uses NETWORK_CONFIG.testnet`}</CodeBlock>
            <p className="text-sm text-surface-400 mt-4">
              Contract program IDs are network-independent — the same{' '}
              <code className="text-surface-300 bg-white/[0.04] px-1.5 py-0.5 rounded">PROGRAM_IDS.ALEO_MARKET</code>{' '}
              value (<code className="text-surface-300 bg-white/[0.04] px-1.5 py-0.5 rounded">veiled_markets_v37.aleo</code>)
              resolves to the deployment on whichever network you query.
            </p>
          </section>

          <section className="mb-20">
            <SectionHeader id="examples" icon={Terminal} title="Example Apps" />
            <p className="text-sm leading-relaxed mb-4">
              The SDK repository ships 3 complete example apps showing real-world usage. Find
              them at{' '}
              <code className="text-surface-300 bg-white/[0.04] px-1.5 py-0.5 rounded">sdk/examples/</code>:
            </p>
            <div className="space-y-3">
              {[
                {
                  name: 'turbo-bot',
                  stack: 'Node.js + tsx',
                  desc: 'Auto-bet scheduler that polls the operator backend, detects new turbo rounds, and submits buy_up_down via NodeExecutor. Demonstrates quote math, SDK + wallet integration, and DRY_RUN mode.',
                },
                {
                  name: 'market-dashboard',
                  stack: 'React + Vite',
                  desc: 'Minimal standalone web app. Reads FAMM markets via IndexerClient, displays top 10 by volume, and shows current Turbo market state. ~200 lines total — no design system dependencies.',
                },
                {
                  name: 'governance-monitor',
                  stack: 'Node.js CLI',
                  desc: 'Daemon that polls for new disputes, enriches with market metadata from IndexerClient, and posts alerts to a Discord webhook. Cron-friendly --once flag.',
                },
              ].map((e) => (
                <div key={e.name} className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                  <div className="flex items-baseline gap-3 mb-2">
                    <code className="text-sm font-mono text-brand-400">{e.name}</code>
                    <span className="text-[10px] text-surface-500">{e.stack}</span>
                  </div>
                  <p className="text-xs text-surface-400 leading-relaxed">{e.desc}</p>
                </div>
              ))}
            </div>
            <div className="mt-6 p-4 rounded-xl bg-brand-500/[0.04] border border-brand-500/[0.1] flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-white mb-1">Ready to build?</div>
                <div className="text-xs text-surface-400">
                  Clone the repo and start with the example that matches your stack.
                </div>
              </div>
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-500 text-white text-xs font-semibold hover:bg-brand-400 transition-colors"
              >
                Open the app <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </section>
        </main>
      </div>

      <Footer />
    </div>
  )
}
