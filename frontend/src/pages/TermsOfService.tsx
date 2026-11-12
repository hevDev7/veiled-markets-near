import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Footer } from '../components/Footer'

export function TermsOfService() {
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
        <h1 className="font-display text-3xl sm:text-4xl text-white mb-2">Terms of Service</h1>
        <p className="text-sm text-surface-500 mb-12">Last updated: November 12, 2026</p>

        <div className="space-y-10 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-white mb-4">1. Acceptance of Terms</h2>
            <p>
              By accessing or using Veiled Markets ("the Protocol"), you agree to be bound by these Terms of Service.
              If you do not agree to these terms, do not use the Protocol. Veiled Markets is a prediction market
              protocol built on the NEAR blockchain. Your use of the Protocol is at your own risk.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-4">2. Eligibility</h2>
            <p className="mb-3">By using the Protocol, you represent and warrant that:</p>
            <ul className="list-disc list-inside space-y-2 text-surface-400">
              <li>You are at least 18 years old or the legal age of majority in your jurisdiction.</li>
              <li>You are not located in, or a citizen or resident of, any jurisdiction where the use of prediction markets is prohibited.</li>
              <li>You are not subject to any sanctions administered by OFAC, the United Nations, or any other applicable government authority.</li>
              <li>You have the legal capacity to enter into these Terms.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-4">3. Nature of the Protocol</h2>
            <p className="mb-3">
              Veiled Markets is a prediction market protocol with private positions. The Protocol:
            </p>
            <ul className="list-disc list-inside space-y-2 text-surface-400">
              <li>Runs as a smart contract on NEAR and uses zero-knowledge proofs to keep positions private.</li>
              <li>Holds deposits in that smart contract as private notes, which only the holder of the note key can spend. The Risk Disclosure describes the powers of the contract owner, including upgrades.</li>
              <li>Submits private transactions through a relayer, which cannot change them.</li>
              <li>Provides a front-end interface to interact with the smart contract.</li>
              <li>Uses an Automated Market Maker (AMM) based on the Fixed Product Market Maker (FPMM) model.</li>
              <li>Is currently deployed on NEAR testnet and may not reflect final production behavior.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-4">4. User Responsibilities</h2>
            <p className="mb-3">You are solely responsible for:</p>
            <ul className="list-disc list-inside space-y-2 text-surface-400">
              <li>Securing your wallet, its private keys, and the browser that holds your note key.</li>
              <li>Understanding the risks associated with blockchain transactions, including irreversibility.</li>
              <li>Ensuring compliance with all applicable laws and regulations in your jurisdiction.</li>
              <li>Any taxes or reporting obligations arising from your use of the Protocol.</li>
              <li>Conducting your own research before participating in any market.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-4">5. Prohibited Activities</h2>
            <p className="mb-3">You agree not to:</p>
            <ul className="list-disc list-inside space-y-2 text-surface-400">
              <li>Use the Protocol for any unlawful purpose or to facilitate illegal activities.</li>
              <li>Attempt to manipulate market outcomes or engage in market manipulation.</li>
              <li>Create markets related to illegal activities, harm to individuals, or other prohibited content.</li>
              <li>Attempt to exploit, hack, or disrupt the Protocol or its underlying smart contracts.</li>
              <li>Use automated systems or bots to gain unfair advantage over other users.</li>
              <li>Circumvent any access restrictions or security measures.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-4">6. Fees</h2>
            <p className="mb-3">
              The Protocol charges fees on trading activities. The current fee structure is:
            </p>
            <ul className="list-disc list-inside space-y-2 text-surface-400">
              <li><strong className="text-surface-300">Protocol Fee:</strong> 0.5% of every buy and sell, sent to the protocol treasury.</li>
              <li><strong className="text-surface-300">Market Creator Fee:</strong> 0.5% of every buy and sell, collected by the market creator after resolution.</li>
              <li><strong className="text-surface-300">Liquidity Provider Fee:</strong> 1.0% of every sell, retained in the AMM pool.</li>
              <li><strong className="text-surface-300">Total:</strong> 1.0% per buy and 2.0% per sell.</li>
              <li><strong className="text-surface-300">Turbo Fee:</strong> 0.5% of every turbo bet, sent to the protocol treasury.</li>
              <li><strong className="text-surface-300">Parlay Fee:</strong> 2% of the payout of a winning parlay, sent to the protocol treasury.</li>
            </ul>
            <p className="mt-3 text-surface-400">
              The contract owner may change these rates. Changes apply to transactions made after the change.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-4">7. Resolution and Administration</h2>
            <p className="mb-3">
              Market outcomes and protocol parameters are decided as follows:
            </p>
            <ul className="list-disc list-inside space-y-2 text-surface-400">
              <li>Prediction markets are resolved by bonded voting from NEAR accounts, with a dispute window.</li>
              <li>Disputed markets are decided by a 5-member committee; a market the committee does not decide in time can be cancelled and refunded.</li>
              <li>Turbo rounds are resolved by the oracle operator from market price data, without voting or disputes.</li>
              <li>Parlays settle from the outcomes of their leg markets.</li>
              <li>The contract owner can pause trading, change fees and minimum amounts, manage the treasury and the parlay payout pool, and upgrade the contract.</li>
            </ul>
            <p className="mt-3 text-surface-400">
              Community governance proposals and token voting are not available on NEAR. By using the Protocol, you acknowledge that resolution outcomes and administrative decisions may affect your positions and experience.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-4">8. Intellectual Property</h2>
            <p>
              The Veiled Markets name and logo identify the Protocol and may not be used to imply endorsement.
              The source code of the smart contract, the zero-knowledge circuit and the front-end interface is
              published under the MIT License, which governs its use.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-4">9. Disclaimers</h2>
            <p className="mb-3">
              THE PROTOCOL IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND,
              EITHER EXPRESS OR IMPLIED. TO THE FULLEST EXTENT PERMITTED BY LAW:
            </p>
            <ul className="list-disc list-inside space-y-2 text-surface-400">
              <li>We make no warranty that the Protocol will be uninterrupted, error-free, or secure.</li>
              <li>We do not guarantee the accuracy of market prices, probabilities, or outcomes.</li>
              <li>We are not responsible for losses arising from smart contract vulnerabilities, blockchain network issues, or user error.</li>
              <li>Past performance does not guarantee future results.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-4">10. Limitation of Liability</h2>
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, VEILED MARKETS AND ITS CONTRIBUTORS
              SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE
              DAMAGES, OR ANY LOSS OF PROFITS, DATA, USE, OR GOODWILL, ARISING FROM YOUR USE OF THE PROTOCOL.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-4">11. Modifications</h2>
            <p>
              We reserve the right to modify these Terms at any time. Changes will be effective upon posting
              to the Protocol's website. Your continued use of the Protocol after any changes constitutes
              acceptance of the modified Terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-4">12. Governing Law</h2>
            <p>
              These Terms shall be governed by and construed in accordance with applicable laws, without
              regard to conflict of law principles. Any disputes arising under these Terms shall be resolved
              through binding arbitration.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-4">13. Contact</h2>
            <p>
              For questions about these Terms, please reach out through our official communication channels
              listed on the Protocol's website.
            </p>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  )
}
