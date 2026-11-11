import { Link } from 'react-router-dom'
import { ArrowLeft, Wallet, Target, Lock, Zap, Shield, BarChart3, Users, ArrowRight, GitBranch, Vote, Coins, Radio } from 'lucide-react'
import { Footer } from '../components/Footer'

const steps = [
  {
    number: '01',
    icon: Wallet,
    title: 'Connect Your Wallet',
    description: 'Connect a NEAR testnet wallet: Meteor Wallet or MyNearWallet. Your keys never leave your wallet.',
    detail: 'One signed message (no fee) unlocks your private balance on any device.',
  },
  {
    number: '02',
    icon: Target,
    title: 'Fund Your Private Balance',
    description: 'Deposit NEAR, USDCX or USAD into your private balance in Settings. The deposit is public; what you do with it afterwards is not.',
    detail: 'If you skip this step, the app tops up your private balance right before your first trade.',
  },
  {
    number: '03',
    icon: Lock,
    title: 'Place Private Bets',
    description: 'Buy outcome shares from the market maker. Your browser proves the trade with a zero-knowledge proof and a relayer submits it, so the trade is not signed by your account.',
    detail: 'Markets have 2, 3 or 4 named outcomes with live prices set by the AMM.',
  },
  {
    number: '04',
    icon: Zap,
    title: 'Claim Winnings',
    description: 'When a market resolves, redeem your winning shares. The payout goes back into your private balance, and you withdraw to any NEAR account when you like.',
    detail: 'Markets are resolved by bonded voting with a dispute window.',
  },
]

const mechanisms = [
  {
    icon: BarChart3,
    title: 'FPMM (Fixed Product Market Maker)',
    description: 'Prices come from the constant product formula. Buying one outcome raises its implied probability, and the other outcomes reprice automatically.',
    items: [
      'Complete-set minting keeps every market fully collateralized',
      'Outcome prices are derived from the reserves of 2, 3 or 4 outcomes',
      'Slippage grows with the size of a trade relative to the pool',
      'Fees per trade: 1.0% to liquidity providers, 0.5% to the market creator, 0.5% to the protocol',
    ],
  },
  {
    icon: Shield,
    title: 'Private Notes on NEAR',
    description: 'Your private balance and your positions are notes: hidden entries in a Merkle tree inside the Veiled contract.',
    items: [
      'Each trade spends notes with a Groth16 zero-knowledge proof (BN254, Poseidon hashing)',
      'A relayer submits the proof, so no trade carries your NEAR account',
      'The proof binds the action, the recipient and the fee, so the relayer cannot change a trade',
      'Your browser finds your notes by decrypting memos with a key derived from your wallet signature',
      'Public: deposits, withdrawals and each trade’s market, outcome and amount. Private: who holds which position',
    ],
  },
  {
    icon: GitBranch,
    title: 'Market Resolution',
    description: 'After the deadline, markets are resolved by bonded voting (testnet settings shown):',
    items: [
      'Anyone closes the market, then votes on the outcome by posting a 0.1 NEAR bond',
      'The voting window lasts 5 minutes, then the votes are finalized',
      'A 5-minute dispute window follows; a dispute must post 3x the total bonds',
      'Without a dispute the outcome is confirmed; disputed markets can escalate to a 5-member committee (3 votes decide)',
      'Voters on the winning outcome get their bond back; bonds on the losing outcome are forfeited',
    ],
  },
  {
    icon: Users,
    title: 'Liquidity Provision',
    description: 'Anyone can add liquidity to a market and earn trading fees:',
    items: [
      'Add tokens from your private balance and receive a private LP position',
      'Earn the 1.0% LP fee on every trade',
      'Withdraw your liquidity after the market resolves',
    ],
  },
  {
    icon: Coins,
    title: 'Supported Tokens',
    description: 'One NEAR contract runs markets in three tokens:',
    items: [
      'NEAR, the native token',
      'USDCX and USAD, 6-decimal test stablecoins on NEAR testnet',
      'All amounts use 6 decimals, so every token works with the same market math',
    ],
  },
  {
    icon: Radio,
    title: 'Turbo Markets (rolling 5-minute rounds)',
    description: 'Fast parimutuel UP/DOWN rounds on BTC, ETH and SOL, run by the oracle operator:',
    items: [
      'A new round opens every 5 minutes; each round’s closing price becomes the next round’s baseline',
      'Bets and claims are private, through the same note pool as market trades',
      'Winners split the pool in proportion to their stake, after a 0.5% protocol fee',
      'If a round is not resolved in time, it is cancelled and every bet can be refunded',
      'On testnet the operator reads prices from CoinGecko; the contract checks the operator and the price bounds',
      'Each round’s audit record is public at /verify/turbo/:marketId',
    ],
  },
  {
    icon: Vote,
    title: 'Not on NEAR yet',
    description: 'These features of the Aleo version are not part of the NEAR deployment yet:',
    items: [
      'Multi-leg parlays',
      'Governance proposals, resolver staking and rewards',
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
          Veiled Markets is a privacy-preserving prediction market on NEAR. Predict outcomes, provide
          liquidity, and claim winnings, while zero-knowledge proofs keep your positions private.
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
