import { Link } from 'react-router-dom'
import { ArrowLeft, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { Footer } from '../components/Footer'

interface FAQItem {
  question: string
  answer: string
  category: string
}

const faqs: FAQItem[] = [
  // General
  {
    category: 'General',
    question: 'What is Veiled Markets?',
    answer: 'Veiled Markets is a privacy-preserving prediction market protocol built on the Aleo blockchain. It uses zero-knowledge proofs (zk-SNARKs) to keep your bets, positions, and balances private on-chain. You can predict outcomes across various categories while maintaining full financial privacy.',
  },
  {
    category: 'General',
    question: 'What network does Veiled Markets run on?',
    answer: 'Veiled Markets is currently deployed on the Aleo Testnet. Testnet tokens have no real monetary value and the network may be reset at any time. The protocol is built to support mainnet deployment in the future.',
  },
  {
    category: 'General',
    question: 'Which wallets are supported?',
    answer: 'Veiled Markets supports five Aleo-compatible wallets: Shield Wallet, Puzzle Wallet, Leo Wallet, Fox Wallet, and Soter Wallet. Each wallet is a browser extension that manages your private keys independently — the protocol never has access to your keys.',
  },
  {
    category: 'General',
    question: 'Is Veiled Markets custodial?',
    answer: 'No. Veiled Markets is fully non-custodial. Your funds are controlled by your wallet at all times. The protocol consists of on-chain smart contracts that execute trades, but never custody or control user assets. You interact with the contracts directly from your wallet.',
  },
  // Trading
  {
    category: 'Trading',
    question: 'How do I place a bet?',
    answer: 'Connect your wallet, navigate to a market, choose an outcome (YES or NO), enter your bet amount, and confirm the transaction in your wallet. The FPMM (Fixed Product Market Maker) determines how many shares you receive based on current market reserves. Your position is encrypted on-chain — only you can see your bet details.',
  },
  {
    category: 'Trading',
    question: 'What tokens can I use?',
    answer: 'Markets support three token types, each with its own market contract: ALEO (native token via veiled_markets_v35.aleo), USDCX (test stablecoin via veiled_markets_usdcx_v5.aleo), and USAD (stablecoin via veiled_markets_usad_v12.aleo). Each market is denominated in one specific token. ALEO markets use private credits records, while USDCX and USAD markets use Token records with MerkleProof verification for private trading.',
  },
  {
    category: 'Trading',
    question: 'What fees are charged?',
    answer: 'A total of 2.0% fee is charged on each buy transaction: 0.5% protocol fee (to treasury), 0.5% creator fee (to market creator), and 1.0% LP fee (stays in the AMM pool for liquidity providers). Sell transactions also incur fees. Fee rates can be modified through governance proposals.',
  },
  {
    category: 'Trading',
    question: 'What is slippage?',
    answer: 'Slippage is the difference between the expected price and the actual price you receive. Larger trades relative to pool liquidity cause higher slippage due to the FPMM price curve. You can check the estimated price impact before confirming any trade.',
  },
  {
    category: 'Trading',
    question: 'Can I sell my shares before the market resolves?',
    answer: 'Yes. You can sell your outcome shares back to the AMM at any time while the market is active. The amount of tokens you receive depends on the current reserves and the FPMM formula. Sell transactions also incur protocol and creator fees.',
  },
  // Markets
  {
    category: 'Markets',
    question: 'How are markets created?',
    answer: 'Anyone with a connected wallet can create a market by specifying a question, deadline (in block height), category, initial liquidity amount, and token type. The creator provides the initial liquidity and receives LP shares. Market creation requires a blockchain transaction.',
  },
  {
    category: 'Markets',
    question: 'How are markets resolved?',
    answer: 'Markets use a Multi-Voter Quorum resolution system (not automated oracles or single resolvers). After the market deadline passes and the market is closed (close_market), anyone can vote on the outcome by posting a 1 ALEO bond (vote_outcome). A minimum of 3 voters is required to reach quorum. After the voting window (~3 hours), votes are finalized (finalize_votes). A dispute window (~3 hours) follows, during which anyone can override the result by posting 3x the total bonds (dispute_resolution). If no dispute occurs, the outcome is confirmed (confirm_resolution). Majority voters can claim their bonds plus rewards, while minority voters lose their bonds (slashing).',
  },
  {
    category: 'Markets',
    question: 'What happens if a market is disputed?',
    answer: 'After votes are finalized, there is a dispute window (~3 hours). During this window, any user can dispute the resolution by posting a bond equal to 3x the total voter bonds and proposing an alternative outcome (dispute_resolution). If a dispute is submitted, the disputed outcome overrides the voter result. Successful disputors can reclaim their bond (claim_dispute_bond). If no dispute is filed within the window, the voted outcome is confirmed (confirm_resolution).',
  },
  {
    category: 'Markets',
    question: 'How do I claim my winnings?',
    answer: 'After a market is resolved and finalized, holders of winning outcome shares can redeem them for tokens. Navigate to your Portfolio, find the resolved market, and click "Claim Winnings." The payout is delivered as an encrypted Aleo record directly to your wallet.',
  },
  {
    category: 'Markets',
    question: 'What happens if a market is cancelled?',
    answer: 'If a market is cancelled (by the creator or due to failed resolution), all participants can claim refunds. Your original bet amount is returned proportionally based on your shares. LP providers also receive their liquidity back.',
  },
  // Liquidity
  {
    category: 'Liquidity',
    question: 'How does liquidity provision work?',
    answer: 'You can add liquidity to any active market by depositing tokens. You receive LP shares proportional to your deposit relative to the pool size. LP providers earn 1.0% of every trade as fees, which are automatically added to the pool reserves.',
  },
  {
    category: 'Liquidity',
    question: 'What is impermanent loss?',
    answer: 'Impermanent loss occurs when the market price diverges significantly from when you provided liquidity. As the FPMM formula (x * y = k) adjusts reserves, LP value can decrease compared to simply holding the tokens. This is a standard risk in all AMM-based protocols.',
  },
  {
    category: 'Liquidity',
    question: 'When can I withdraw liquidity?',
    answer: 'Liquidity can be withdrawn after the market resolves and is finalized. LP providers receive their proportional share of the pool reserves. If the market is cancelled, LP providers can claim a full refund of their deposited liquidity.',
  },
  {
    category: 'Liquidity',
    question: 'Can I transfer LP shares?',
    answer: 'No. LP shares are currently non-transferable due to claim key constraints in the smart contract. You must withdraw from the same wallet that provided the liquidity.',
  },
  // Privacy & Security
  {
    category: 'Privacy & Security',
    question: 'How is my privacy protected?',
    answer: 'All transactions use Aleo\'s zero-knowledge proofs (zk-SNARKs). Your bets, positions, and balances are stored as encrypted records on-chain that only you can decrypt with your view key. Off-chain data (if Supabase is enabled) is encrypted with AES-256-GCM using a key derived from your wallet signature.',
  },
  {
    category: 'Privacy & Security',
    question: 'Can anyone see my bets?',
    answer: 'No. Your bet amounts, outcome choices, and positions are private by default on the Aleo blockchain. Only you can view your own records using your view key. The protocol front-end decrypts your data locally in the browser.',
  },
  {
    category: 'Privacy & Security',
    question: 'What happens if I lose my private keys?',
    answer: 'If you lose your private keys, you permanently lose access to all funds and records associated with that wallet. There is no recovery mechanism — the protocol is non-custodial and has no ability to restore access. Always back up your wallet securely.',
  },
  // Governance
  {
    category: 'Governance',
    question: 'How does governance work?',
    answer: 'Veiled Markets uses on-chain governance (veiled_governance_v4.aleo, 29 transitions) powered by ALEO token voting. Features include dispute resolution overrides, fee changes, 3-of-N multisig treasury management, parameter updates, and emergency pause. ALEO native staking governance is Coming Soon in the UI.',
  },
  {
    category: 'Governance',
    question: 'What are the quorum requirements?',
    answer: 'Quorum varies by proposal type: Emergency Pause needs only 5%, Dispute Resolution and Parameter changes need 10-15%, Fee Changes need 20%, and Treasury proposals need 30%. After passing, proposals enter a timelock (0-72 hours) before execution.',
  },
]

const categories = ['General', 'Trading', 'Markets', 'Liquidity', 'Privacy & Security', 'Governance']

function FAQAccordion({ item }: { item: FAQItem }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="border-b border-white/[0.04] last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-start justify-between gap-4 py-5 text-left group"
      >
        <span className="text-sm font-medium text-white group-hover:text-brand-400 transition-colors">
          {item.question}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-surface-500 shrink-0 mt-0.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="pb-5 -mt-1">
          <p className="text-sm text-surface-400 leading-relaxed">{item.answer}</p>
        </div>
      )}
    </div>
  )
}

export function FAQ() {
  const [activeCategory, setActiveCategory] = useState('General')

  const filtered = faqs.filter((f) => f.category === activeCategory)

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
        <h1 className="font-display text-3xl sm:text-4xl text-white mb-3">Frequently Asked Questions</h1>
        <p className="text-surface-400 mb-10">Everything you need to know about using Veiled Markets.</p>

        {/* Category tabs */}
        <div className="flex flex-wrap gap-2 mb-10">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-4 py-2 rounded-xl text-xs font-medium transition-all ${
                activeCategory === cat
                  ? 'bg-brand-500/15 text-brand-400 border border-brand-500/20'
                  : 'bg-white/[0.03] text-surface-500 border border-white/[0.04] hover:text-white hover:border-white/[0.08]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* FAQ list */}
        <div className="rounded-2xl bg-white/[0.02] border border-white/[0.04] px-6">
          {filtered.map((item, i) => (
            <FAQAccordion key={i} item={item} />
          ))}
        </div>

        {/* Still have questions */}
        <div className="mt-12 p-6 rounded-2xl bg-white/[0.02] border border-white/[0.04] text-center">
          <p className="text-sm text-surface-400 mb-1">Still have questions?</p>
          <p className="text-sm text-surface-500">
            Join our community on Discord or reach out through our official channels.
          </p>
        </div>
      </main>

      <Footer />
    </div>
  )
}
