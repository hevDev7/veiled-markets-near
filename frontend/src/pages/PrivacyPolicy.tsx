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
        <p className="text-sm text-surface-500 mb-12">Last updated: March 26, 2026</p>

        <div className="space-y-10 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-white mb-4">1. Introduction</h2>
            <p>
              Veiled Markets ("the Protocol") is a privacy-preserving prediction market built on the Aleo
              blockchain. Privacy is at the core of our design. This Privacy Policy explains how we handle
              information when you interact with the Protocol's front-end interface.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-4">2. Privacy by Design</h2>
            <p className="mb-3">
              Veiled Markets leverages Aleo's zero-knowledge proof technology to ensure maximum privacy:
            </p>
            <ul className="list-disc list-inside space-y-2 text-surface-400">
              <li><strong className="text-surface-300">Zero-Knowledge Proofs:</strong> All transactions are verified using zk-SNARKs, meaning your bets, positions, and balances remain private on-chain.</li>
              <li><strong className="text-surface-300">Private Records:</strong> Your holdings are stored as encrypted records on the Aleo blockchain, visible only to you with your view key. ALEO markets use private credits records, while USDCX and USAD markets use Token records with MerkleProof verification for private trading.</li>
              <li><strong className="text-surface-300">Non-Custodial:</strong> We never have access to your private keys, view keys, or wallet credentials.</li>
              <li><strong className="text-surface-300">Client-Side Encryption:</strong> Any data stored locally is encrypted with AES-256-GCM before storage.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-4">3. Information We Collect</h2>
            <p className="mb-4">We minimize data collection. Here is what the front-end may process:</p>

            <h3 className="text-base font-medium text-white mb-2">3.1 Information You Provide</h3>
            <ul className="list-disc list-inside space-y-2 text-surface-400 mb-4">
              <li><strong className="text-surface-300">Wallet Address:</strong> Your public Aleo address when you connect your wallet. This is necessary to interact with on-chain contracts.</li>
              <li><strong className="text-surface-300">Transaction Data:</strong> Transaction parameters you submit through the interface. These are processed client-side and sent directly to the Aleo network.</li>
            </ul>

            <h3 className="text-base font-medium text-white mb-2">3.2 Automatically Collected Information</h3>
            <ul className="list-disc list-inside space-y-2 text-surface-400">
              <li><strong className="text-surface-300">Local Storage:</strong> The interface stores encrypted preferences and cached data in your browser's localStorage, including wallet connection state, market question mappings, and Zustand store persistence.</li>
              <li><strong className="text-surface-300">Session Storage:</strong> Temporary encryption key cache (wallet-derived signature) is stored in sessionStorage and cleared when you close the browser tab.</li>
            </ul>
            <p className="mt-3 text-surface-500 italic">
              Note: The Protocol does not currently implement any analytics or tracking services. No usage data, page views, or feature interactions are collected.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-4">4. Information We Do NOT Collect</h2>
            <ul className="list-disc list-inside space-y-2 text-surface-400">
              <li>Private keys or view keys</li>
              <li>Bet amounts or positions (these are private on-chain)</li>
              <li>Personal identification information (name, email, phone number)</li>
              <li>IP addresses for tracking purposes</li>
              <li>Browsing history outside the Protocol</li>
            </ul>
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
              <li><strong className="text-surface-300">On-Chain Data:</strong> Transaction data is stored on the Aleo blockchain as encrypted records. Only you can decrypt your own records using your view key.</li>
              <li><strong className="text-surface-300">Local Data:</strong> Cached data is stored in your browser's localStorage with AES-256-GCM encryption. You can clear this data at any time through your browser settings or the Protocol's Settings page.</li>
              <li><strong className="text-surface-300">Supabase (Optional):</strong> If configured, betting history and pending transactions may be persisted in a Supabase database. All sensitive fields (amounts, outcomes, shares, payouts) are encrypted client-side with AES-256-GCM before transmission — the server never sees plaintext sensitive data. Non-sensitive fields such as market ID, wallet address, and timestamps are stored unencrypted. Market registry and price snapshot data are public and stored unencrypted. Supabase integration is optional and can be disabled entirely.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-4">7. Third-Party Services</h2>
            <p className="mb-3">The Protocol may interact with the following third-party services:</p>
            <ul className="list-disc list-inside space-y-2 text-surface-400">
              <li><strong className="text-surface-300">Aleo Network:</strong> Blockchain infrastructure for transaction processing via Provable Explorer API.</li>
              <li><strong className="text-surface-300">Wallet Providers:</strong> Third-party wallet extensions (Shield, Puzzle, Leo, Fox, Soter) for key management. Each wallet extension operates independently and may have its own data practices.</li>
              <li><strong className="text-surface-300">Vercel:</strong> Front-end hosting and deployment.</li>
              <li><strong className="text-surface-300">Supabase:</strong> Optional backend database for encrypted data persistence.</li>
              <li><strong className="text-surface-300">CoinGecko:</strong> Public API used for cryptocurrency price data. No user data is sent to CoinGecko.</li>
              <li><strong className="text-surface-300">Pinata/IPFS (Optional):</strong> If configured, used for storing public market metadata. No private user data is uploaded.</li>
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
              <li>Clear all locally stored data through your browser or the Settings page.</li>
              <li>Use the Protocol without providing any personal information beyond a wallet address.</li>
              <li>Request deletion of any off-chain data we may hold associated with your wallet address.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-4">9. Security</h2>
            <p>
              We implement industry-standard security measures including client-side AES-256-GCM encryption,
              secure HTTPS connections, and regular security reviews. However, no system is completely secure.
              You are responsible for maintaining the security of your wallet and private keys.
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
