import { Link } from 'react-router-dom'
import { ArrowLeft, Wallet, Target, Lock, Zap, Shield, BarChart3, Users, ArrowRight, GitBranch, Vote, Coins } from 'lucide-react'
import { Footer } from '../components/Footer'

const steps = [
  {
    number: '01',
    icon: Wallet,
    title: 'Connect Your Wallet',
    description: 'Connect a compatible Aleo wallet to get started. Supported wallets include Shield, Puzzle, Leo, Fox, and Soter. Your private keys never leave your wallet.',
    detail: 'The Protocol is non-custodial — we never have access to your keys or funds.',
  },
  {
    number: '02',
    icon: Target,
    title: 'Browse & Choose Markets',
    description: 'Explore prediction markets across various categories. Each market has a clear question, deadline, and current probability determined by the AMM.',
    detail: 'Markets support three tokens: ALEO (native), USDCX, and USAD stablecoins.',
  },
  {
    number: '03',
    icon: Lock,
    title: 'Place Encrypted Bets',
    description: 'Buy outcome shares using the FPMM (Fixed Product Market Maker). Your position is encrypted on-chain using zero-knowledge proofs — no one can see your bet amount or direction.',
    detail: 'A 2% fee is applied per trade: 0.5% protocol + 0.5% creator + 1.0% LP.',
  },
  {
    number: '04',
    icon: Zap,
    title: 'Claim Winnings',
    description: 'When a market resolves, winning shares can be redeemed for tokens. The payout is delivered privately as an encrypted Aleo record — fully on-chain and verifiable.',
    detail: 'Markets are resolved by Multi-Voter Quorum with dispute protection.',
  },
]

const mechanisms = [
  {
    icon: BarChart3,
    title: 'FPMM (Fixed Product Market Maker)',
    description: 'Prices are determined algorithmically using the constant product formula. When you buy YES shares, the YES price goes up and NO goes down — reflecting market sentiment in real time.',
    items: [
      'Complete-set minting: every buy creates both YES and NO shares',
      'Price = opposing reserves / total reserves',
      'Slippage increases with larger trades relative to pool size',
    ],
  },
  {
    icon: GitBranch,
    title: 'Market Resolution',
    description: 'Markets go through a Multi-Voter Quorum resolution process designed to ensure fair outcomes:',
    items: [
      'After close_market, anyone can vote on the outcome by posting a 1 ALEO bond (vote_outcome)',
      'Minimum 3 voters required to reach quorum; voting window ~3 hours',
      'Votes are finalized (finalize_votes), then a dispute window (~3 hours) begins',
      'Anyone can dispute by posting 3x total bonds to override the result (dispute_resolution)',
      'After dispute window passes without dispute, outcome is confirmed (confirm_resolution)',
      'Majority voters claim rewards; minority voters lose their bond (slashing)',
    ],
  },
  {
    icon: Shield,
    title: 'Zero-Knowledge Privacy',
    description: 'All transactions are processed using Aleo\'s zk-SNARK proofs. This means:',
    items: [
      'Your bet amounts are hidden from other users and the protocol',
      'Your positions are stored as encrypted records only you can decrypt',
      'Transaction validity is proven without revealing the details',
      'Client-side AES-256-GCM encryption for any off-chain data',
    ],
  },
  {
    icon: Users,
    title: 'Liquidity Provision',
    description: 'Anyone can provide liquidity to earn trading fees:',
    items: [
      'Deposit tokens to receive LP shares proportional to the pool',
      'Earn 1.0% LP fee on every trade automatically',
      'Withdraw liquidity after market resolution',
      'Note: LP shares are currently non-transferable between wallets',
    ],
  },
  {
    icon: Vote,
    title: 'Governance',
    description: 'The Protocol is governed by ALEO token holders through on-chain governance (veiled_governance_v4.aleo, 29 transitions):',
    items: [
      '3-of-N multisig treasury management',
      'Dispute resolution overrides, fee changes, parameter updates, emergency pause',
      'ALEO native staking governance (Coming Soon in UI)',
      'Variable quorum (5%–30%) and timelock (0–72 hours) per proposal type',
    ],
  },
  {
    icon: Coins,
    title: 'Supported Tokens',
    description: 'Markets can be denominated in three different tokens, each with its own market contract:',
    items: [
      'ALEO — Native Aleo blockchain token via veiled_markets_v35.aleo (22 transitions)',
      'USDCX — Test stablecoin via veiled_markets_usdcx_v5.aleo (22 transitions)',
      'USAD — Stablecoin via veiled_markets_usad_v12.aleo (22 transitions)',
      'ALEO uses private credits records; USDCX/USAD use Token records + MerkleProof for private trading',
    ],
  },
]

export function HowItWorks() {
  return (
    <div className="min-h-screen bg-surface-950 text-surface-300">
      <header className="border-b border-white/[0.04]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-surface-500 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h1 className="font-display text-3xl sm:text-4xl text-white mb-3">How It Works</h1>
        <p className="text-surface-400 max-w-2xl mb-16">
          Veiled Markets is a privacy-preserving prediction market on Aleo. Predict outcomes, provide
          liquidity, and claim winnings — all with zero-knowledge privacy.
        </p>

        {/* Steps */}
        <section className="mb-24">
          <h2 className="text-xs font-semibold text-surface-300 uppercase tracking-wider mb-8">Getting Started</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {steps.map((step) => (
              <div
                key={step.number}
                className="relative p-6 rounded-2xl bg-white/[0.02] border border-white/[0.04] hover:border-white/[0.08] transition-colors"
              >
                <div className="flex items-center gap-3 mb-4">
                  <span className="font-mono text-xs text-brand-400">{step.number}</span>
                  <div className="w-9 h-9 rounded-xl bg-brand-500/10 flex items-center justify-center">
                    <step.icon className="w-4.5 h-4.5 text-brand-400" />
                  </div>
                  <h3 className="text-base font-semibold text-white">{step.title}</h3>
                </div>
                <p className="text-sm text-surface-400 leading-relaxed mb-3">{step.description}</p>
                <p className="text-xs text-surface-500 italic">{step.detail}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Deep Dive */}
        <section className="mb-16">
          <h2 className="text-xs font-semibold text-surface-300 uppercase tracking-wider mb-8">How the Protocol Works</h2>
          <div className="space-y-8">
            {mechanisms.map((mech) => (
              <div
                key={mech.title}
                className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.04]"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 rounded-xl bg-white/[0.04] flex items-center justify-center">
                    <mech.icon className="w-4.5 h-4.5 text-surface-300" />
                  </div>
                  <h3 className="text-lg font-semibold text-white">{mech.title}</h3>
                </div>
                <p className="text-sm text-surface-400 leading-relaxed mb-4">{mech.description}</p>
                <ul className="space-y-2">
                  {mech.items.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-surface-400">
                      <ArrowRight className="w-3.5 h-3.5 text-brand-400 shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row items-center gap-4 p-8 rounded-2xl bg-gradient-to-r from-brand-500/[0.06] to-transparent border border-brand-500/[0.08]">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-white mb-1">Ready to start?</h3>
            <p className="text-sm text-surface-400">Connect your wallet and explore prediction markets.</p>
          </div>
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-brand-500 text-white text-sm font-medium hover:bg-brand-400 transition-colors"
          >
            Launch App
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  )
}
