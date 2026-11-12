import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Footer } from '../components/Footer'

export function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-surface-950 text-surface-300">
      {/* Header */}
      <header className="border-b border-white/[0.04]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-surface-500 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h1 className="font-display text-3xl sm:text-4xl text-white mb-2">Privacy Policy</h1>
        <p className="text-sm text-surface-500 mb-12">Last updated: November 12, 2026</p>

        <div className="space-y-10 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-white mb-4">1. Introduction</h2>
            <p>
              Veiled Markets ("the Protocol") is a privacy-preserving prediction market built on NEAR. Privacy is at
              the core of its design. This Privacy Policy explains how information is handled when you use the
              Protocol&apos;s front-end interface and the services it talks to.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-4">2. Privacy by Design</h2>
            <p className="mb-3">
              Veiled Markets uses a private note pool and zero-knowledge proofs to separate your account from your positions:
            </p>
            <ul className="list-disc list-inside space-y-2 text-surface-400">
              <li><strong className="text-surface-300">Private Notes:</strong> Your private balance and your positions are notes in the smart contract&apos;s Merkle tree. Only your note key links them to you.</li>
              <li><strong className="text-surface-300">Zero-Knowledge Proofs:</strong> Trades, turbo bets, parlays, redemptions, claims and withdrawals carry a Groth16 proof made in your browser and are submitted by a relayer, so they are not signed by your NEAR account.</li>
              <li><strong className="text-surface-300">Encrypted Memos:</strong> Each of your notes carries a memo encrypted with AES-256-GCM under a key derived from your note key, so only your browser can find your notes on chain.</li>
              <li><strong className="text-surface-300">What Stays Public:</strong> Deposits and withdrawals (account and amount), market creation, resolution votes, disputes and bonds, and each trade&apos;s market, outcome and amount (without the account) are public on NEAR.</li>
              <li><strong className="text-surface-300">Your Wallet Keys:</strong> We never have access to your wallet&apos;s private keys.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-4">3. Information We Collect</h2>
            <p className="mb-4">We minimize data collection. Here is what the front end and its services process:</p>

            <h3 className="text-base font-medium text-white mb-2">3.1 Information You Provide</h3>
            <ul className="list-disc list-inside space-y-2 text-surface-400 mb-4">
              <li><strong className="text-surface-300">NEAR Account ID:</strong> Your account when you connect your wallet. It is needed to sign public calls such as deposits, and to show your wallet balances.</li>
              <li><strong className="text-surface-300">Message Signature:</strong> Unlocking your private balance asks your wallet to sign a fixed message (NEP-413). Your browser derives your note key from the signature. Neither the signature nor the key is sent to us.</li>
              <li><strong className="text-surface-300">Transaction Data:</strong> Public calls go from your wallet to NEAR. Private actions (a proof and the action) go from your browser to the relayer, which submits them to NEAR; they contain no account ID.</li>
            </ul>

            <h3 className="text-base font-medium text-white mb-2">3.2 Automatically Processed Information</h3>
            <ul className="list-disc list-inside space-y-2 text-surface-400">
              <li><strong className="text-surface-300">Local Storage:</strong> The interface stores data in your browser&apos;s localStorage: the seed of your note key for each account you unlock, a cache of your notes, wallet connection state, preferences and cached market data.</li>
              <li><strong className="text-surface-300">Network Requests:</strong> The relayer, the turbo price service and the server that delivers the front end receive your IP address with each request, as any web server does. The relayer keeps IP addresses in memory for one minute to limit request rates and does not write them to its logs.</li>
            </ul>
            <p className="mt-3 text-surface-500 italic">
              Note: The Protocol does not use any analytics or tracking services. No usage data, page views, or feature interactions are collected.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-4">4. Information We Do NOT Collect</h2>
            <ul className="list-disc list-inside space-y-2 text-surface-400">
              <li>Wallet private keys</li>
              <li>Your note key (it never leaves your browser)</li>
              <li>Which positions you hold</li>
              <li>Personal identification information (name, email, phone number)</li>
              <li>Browsing history outside the Protocol</li>
            </ul>
            <p className="mt-3 text-surface-400">We do not use IP addresses to track you.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-4">5. How We Use Information</h2>
            <p className="mb-3">Any information processed is used solely to:</p>
            <ul className="list-disc list-inside space-y-2 text-surface-400">
              <li>Facilitate your interaction with on-chain smart contracts.</li>
              <li>Display relevant market data and your transaction history.</li>
              <li>Improve the user interface and user experience.</li>
              <li>Maintain the security and integrity of the Protocol.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-4">6. Data Storage</h2>
            <ul className="list-disc list-inside space-y-2 text-surface-400">
              <li><strong className="text-surface-300">On-Chain Data:</strong> The NEAR contract stores note commitments with their encrypted memos, and every public call. Anyone can read the chain; only your note key decrypts your memos.</li>
              <li><strong className="text-surface-300">Local Data:</strong> Your note key seed and note cache are stored in your browser&apos;s localStorage. Anyone with access to this browser profile could read them and spend your notes, so use a device you trust. You can remove them by clearing this site&apos;s data in your browser. If your note key was derived from a wallet signature, signing again restores it; if it was created in the browser because your wallet cannot sign messages, clearing the data makes those notes unspendable.</li>
              <li><strong className="text-surface-300">Supabase (Optional):</strong> The NEAR deployment reads markets from the contract and needs no database. If an operator configures a Supabase database, the app may store market data, price snapshots and your bet history there. Sensitive bet fields (amounts, outcomes, shares, payouts) are encrypted in your browser with AES-256-GCM before they are sent; the market ID, your account ID and timestamps are stored unencrypted, which links your account to the markets you traded.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-4">7. Third-Party Services</h2>
            <p className="mb-3">The Protocol may interact with the following third-party services:</p>
            <ul className="list-disc list-inside space-y-2 text-surface-400">
              <li><strong className="text-surface-300">NEAR Network and RPC Providers:</strong> Your browser reads the contract through public NEAR testnet RPC endpoints (FastNEAR and dRPC by default), and your wallet sends your public transactions through them.</li>
              <li><strong className="text-surface-300">Wallet Providers:</strong> Meteor Wallet and MyNearWallet manage your keys. Each operates independently and has its own data practices.</li>
              <li><strong className="text-surface-300">Pyth Network:</strong> The turbo price service reads prices from Pyth Hermes. If you verify a turbo round with your own Pyth API key, your browser sends it only to Pyth Hermes.</li>
              <li><strong className="text-surface-300">CoinGecko:</strong> Public API used for cryptocurrency price data and charts. No account data is sent to CoinGecko.</li>
              <li><strong className="text-surface-300">Circle:</strong> USDC on NEAR testnet is Circle&apos;s token, and its faucet is Circle&apos;s website. We share no data with Circle.</li>
              <li><strong className="text-surface-300">NearBlocks:</strong> Transaction and account links open the NearBlocks testnet explorer.</li>
              <li><strong className="text-surface-300">Supabase (Optional):</strong> Database for cached data, only if configured.</li>
            </ul>
            <p className="mt-3">
              Each third-party service has its own privacy policy. We encourage you to review them.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-4">8. Your Rights</h2>
            <p className="mb-3">You have the right to:</p>
            <ul className="list-disc list-inside space-y-2 text-surface-400">
              <li>Disconnect your wallet at any time.</li>
              <li>Clear all locally stored data through your browser.</li>
              <li>Use the Protocol without providing any personal information beyond a wallet address.</li>
              <li>Request deletion of any off-chain data we may hold associated with your wallet address.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-4">9. Security</h2>
            <p>
              We use client-side AES-256-GCM encryption for note memos and optional database fields, zero-knowledge
              proofs for private actions, and HTTPS connections. However, no system is completely secure. You are
              responsible for the security of your wallet and of the browser that holds your note key.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-4">10. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. Changes will be posted on the Protocol's
              website with an updated "Last updated" date. Your continued use of the Protocol constitutes
              acceptance of any changes.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-4">11. Contact</h2>
            <p>
              For privacy-related inquiries, please reach out through our official communication channels
              listed on the Protocol's website.
            </p>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  )
}
