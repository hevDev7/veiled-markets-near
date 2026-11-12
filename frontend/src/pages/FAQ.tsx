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
    answer: 'Veiled Markets is a privacy-preserving prediction market on NEAR. Your balance and your positions are private notes inside the Veiled contract. Every trade carries a zero-knowledge proof and is submitted by a relayer, so no trade is linked to your account. You can trade markets in many categories and 5-minute turbo rounds on BTC, ETH and SOL.',
  },
  {
    category: 'General',
    question: 'What network does Veiled Markets run on?',
    answer: 'NEAR testnet, on the contract v1.veiled-markets.testnet. Testnet tokens have no monetary value. Veiled Markets started on Aleo testnet, and that version still exists.',
  },
  {
    category: 'General',
    question: 'Which wallets are supported?',
    answer: 'Meteor Wallet and MyNearWallet on NEAR testnet. Your keys stay in your wallet. The app asks you to sign one message (no fee) to unlock your private balance.',
  },
  {
    category: 'General',
    question: 'Is Veiled Markets custodial?',
    answer: 'No one but you can spend your funds. Deposits sit in the Veiled contract as notes, and spending a note needs a proof made from your note key. The relayer only submits proofs and cannot change or redirect them. You can withdraw to any NEAR account at any time.',
  },
  // Trading
  {
    category: 'Trading',
    question: 'How do I place a bet?',
    answer: 'Connect your wallet, open a market, choose an outcome, enter an amount and confirm. Your browser makes a zero-knowledge proof in a few seconds and the relayer submits the trade, so no wallet approval is needed when your private balance covers the amount. If it does not, your wallet first asks you to approve a deposit. The FPMM (Fixed Product Market Maker) sets how many shares you receive.',
  },
  {
    category: 'Trading',
    question: 'What tokens can I use?',
    answer: 'NEAR and USDC. USDC is Circle\'s official testnet USDC on NEAR; get it at faucet.circle.com and choose NEAR Testnet. One contract runs markets in both tokens, and each market uses one of them. Turbo rounds use NEAR.',
  },
  {
    category: 'Trading',
    question: 'What fees are charged?',
    answer: 'A buy pays 1.0%: 0.5% protocol fee and 0.5% to the market creator. A sell pays 2.0%: the same 1.0% plus 1.0% to the liquidity providers, which stays in the pool. Turbo rounds charge 0.5%, and a winning parlay pays 2% of its payout.',
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
  {
    category: 'Trading',
    question: 'Can I combine multiple markets into a parlay?',
    answer: 'Yes. A parlay combines 2 to 4 legs, each one outcome on a different market, and pays only if every leg wins. Turn on Parlay Mode on the dashboard (or use Add to Parlay on a market page), set a stake in NEAR or USDC (at least 0.1) and confirm. The contract prices each leg from the live market (odds = 1 / price, at most 100× per leg and 1000× combined), and a winning ticket pays its potential payout minus a 2% fee. Placing and claiming are private; the parlay\'s legs and stake are public, like a trade. One losing leg loses the parlay; if a leg market is cancelled, the stake is refunded once every leg is final. Track and claim your tickets on My Parlays (Portfolio → Parlay Details).',
  },
  // Markets
  {
    category: 'Markets',
    question: 'How are markets created?',
    answer: 'Anyone with a connected wallet can create a market: a question, 2, 3 or 4 outcome labels, a deadline, a category, the token and the initial liquidity (at least 0.01 NEAR). The question and labels are stored on chain with the market. The creator receives the LP position as a private note.',
  },
  {
    category: 'Markets',
    question: 'How are markets resolved?',
    answer: 'By bonded voting. After the deadline, anyone closes the market and votes on the outcome by posting a 0.1 NEAR bond. On testnet the voting window is 5 minutes and one voter is enough. Then the votes are finalized and a 5-minute dispute window starts. Without a dispute, the outcome is confirmed. Voters on the winning outcome get their bond back; bonds on a losing outcome are forfeited.',
  },
  {
    category: 'Markets',
    question: 'What happens if a market is disputed?',
    answer: 'After the votes are finalized, a dispute window opens (5 minutes on testnet). Anyone can dispute by posting 3x the total voter bonds and proposing another outcome. A dispute puts the market on hold, and anyone can then escalate it to the 5-member committee, where 3 matching votes decide the outcome. If the committee agrees with the dispute, the disputer gets the bond back. If the committee does not decide in time (1 hour on testnet), the market is cancelled and everyone is refunded. Without a dispute, the voted outcome is confirmed.',
  },
  {
    category: 'Markets',
    question: 'How do I claim my winnings?',
    answer: 'After the market resolves, open your Portfolio and click "Claim Winnings". Your winning shares are redeemed through the relayer, and the payout goes into your private balance. Withdraw it to any NEAR account from the Private balance panel on the same page.',
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
    answer: 'You can add liquidity to any active market from your private balance and receive a private LP note. LPs earn the 1.0% LP fee on every sell, which stays in the market until they withdraw, and they carry the outcome risk of the pool: on a 2-outcome market the pool can lose up to half its liquidity if the favoured outcome wins. Adding to a lopsided market is costly, because most of the deposit backs the outcomes expected to lose; the Liquidity panel shows what you would get back under each outcome. Liquidity is withdrawn after the market resolves or is cancelled.',
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
    answer: 'Your balance and positions are notes: commitments in a Merkle tree inside the Veiled contract. Spending a note needs a zero-knowledge proof (Groth16) that your browser makes, and a relayer submits it. Public: deposits, withdrawals, and each trade\'s market, outcome and amount, because the market maker is public. Private: which account holds which position.',
  },
  {
    category: 'Privacy & Security',
    question: 'Can anyone see my bets?',
    answer: 'People can see that someone bought an outcome in a market, and how much, because the pool is public. They cannot see that it was you: the trade is submitted by the relayer and spends notes that only you can identify. Your browser decrypts your own notes locally.',
  },
  {
    category: 'Privacy & Security',
    question: 'What happens if I lose my private keys?',
    answer: 'Your note key comes from a message your wallet signs, so your wallet recovers your notes on any device. If you lose access to your NEAR account, you lose your notes as well. If your wallet cannot sign messages, the app keeps the note key in this browser instead. Always back up your wallet.',
  },
  // Governance
  {
    category: 'Governance',
    question: 'How does governance work?',
    answer: 'Governance proposals and token voting exist in the Aleo version only. On NEAR, disputed markets can be escalated to a committee of 5 members, and 3 matching votes decide the outcome.',
  },
  {
    category: 'Governance',
    question: 'What are the quorum requirements?',
    answer: 'Proposal quorums belong to the Aleo version\'s governance, which is not on NEAR yet. On NEAR, the dispute committee needs 3 of its 5 members to agree.',
  },
  // Turbo Markets
  {
    category: 'Turbo Markets',
    question: 'What are Turbo Markets?',
    answer: 'Rolling 5-minute UP/DOWN rounds on BTC, ETH and SOL. A new round opens every 5 minutes, and you predict whether the price will be higher or lower at the deadline than the baseline at the start. The operator resolves each round, so there is no voting. On testnet the operator reads prices from CoinGecko.',
  },
  {
    category: 'Turbo Markets',
    question: 'How do I bet on a Turbo market?',
    answer: 'Open Turbo from the dashboard, pick UP or DOWN, enter an amount in NEAR and confirm. Your bet is private: it goes through the same note pool as market trades. The chart shows the live price against the baseline until the countdown ends.',
  },
  {
    category: 'Turbo Markets',
    question: 'How is the payout calculated for Turbo?',
    answer: 'Turbo markets use parimutuel math: payout = (your_share_quantity × total_pool) / total_winning_shares. Winners split the entire pool (both UP and DOWN sides) proportionally to their bet size. If you\'re the sole winner against losers, you can collect up to ~3× your stake. If you\'re the only bettor on a side with no counterparty, you get back your net stake (0.5% protocol fee). There\'s no FPMM curve — it\'s straight pool sharing.',
  },
  {
    category: 'Turbo Markets',
    question: 'What happens when the round ends?',
    answer: 'At the deadline the operator submits the closing price to the contract, usually within seconds. When the round is RESOLVED, winners claim from the Portfolio page. If nobody bet on the winning side, or the round is not resolved within its grace period, the round is cancelled and every bet can be refunded.',
  },
  {
    category: 'Turbo Markets',
    question: 'Who operates the Turbo markets?',
    answer: 'The operator account veiled-oracle.testnet. The contract accepts round creation and resolution only from this account and checks the price bounds. The operator runs the backend that opens a round every 5 minutes and resolves it at the deadline.',
  },
  {
    category: 'Turbo Markets',
    question: 'How do I verify the operator isn\'t cheating?',
    answer: 'Open /verify/turbo/<market_id> for any turbo round. It shows the operator\'s audit record (baseline, closing price and transactions) next to the values stored in the contract. On testnet the prices come from CoinGecko, so the comparison with Pyth historical prices is approximate.',
  },
  {
    category: 'Turbo Markets',
    question: 'Are Turbo markets available for governance disputes?',
    answer: 'No. Turbo rounds are resolved by the operator and cannot be disputed. Fast 5-minute rounds leave no time for voting, so the trust moves to the operator, and its audit trail at /verify/turbo/:marketId is public.',
  },
]

const categories = ['General', 'Trading', 'Markets', 'Liquidity', 'Privacy & Security', 'Governance', 'Turbo Markets']

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
