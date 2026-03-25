import { Link } from 'react-router-dom'
import { ArrowLeft, AlertTriangle } from 'lucide-react'
import { Footer } from '../components/Footer'

export function RiskDisclosure() {
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
        <h1 className="font-display text-3xl sm:text-4xl text-white mb-2">Risk Disclosure</h1>
        <p className="text-sm text-surface-500 mb-8">Last updated: March 22, 2026</p>

        {/* Warning Banner */}
        <div className="flex items-start gap-3 p-4 rounded-xl bg-yellow-500/[0.06] border border-yellow-500/[0.12] mb-12">
          <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
          <p className="text-sm text-yellow-200/80">
            <strong className="text-yellow-300">Important:</strong> Prediction markets involve significant risk.
            You may lose some or all of your funds. Please read this disclosure carefully before using the Protocol.
          </p>
        </div>

        <div className="space-y-10 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-white mb-4">1. General Risk Warning</h2>
            <p>
              Participating in prediction markets involves substantial financial risk. The value of your
              positions can fluctuate significantly, and you may lose your entire investment. Only participate
              with funds you can afford to lose. Veiled Markets does not provide financial advice, and nothing
              on the Protocol should be construed as such.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-4">2. Smart Contract Risk</h2>
            <p className="mb-3">
              The Protocol is powered by smart contracts deployed on the Aleo blockchain. These contracts carry inherent risks:
            </p>
            <ul className="list-disc list-inside space-y-2 text-surface-400">
              <li><strong className="text-surface-300">Code Vulnerabilities:</strong> Despite testing and review, smart contracts may contain undiscovered bugs or vulnerabilities that could result in loss of funds.</li>
              <li><strong className="text-surface-300">Immutability:</strong> Once deployed, smart contract code cannot be easily modified. Fixes may require deploying new contracts and migrating state.</li>
              <li><strong className="text-surface-300">Composability Risk:</strong> The Protocol interacts with multiple on-chain programs (main market contract, USAD stablecoin, governance). Issues in any component could affect the entire system.</li>
              <li><strong className="text-surface-300">Transition Limits:</strong> The Aleo snarkVM imposes a 31-transition limit per program, which constrains the functionality that can be included in a single contract.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-4">3. Blockchain & Network Risk</h2>
            <ul className="list-disc list-inside space-y-2 text-surface-400">
              <li><strong className="text-surface-300">Network Congestion:</strong> High network activity may cause transaction delays or failures.</li>
              <li><strong className="text-surface-300">Transaction Fees:</strong> Aleo transactions require gas fees that may vary. Failed transactions may still incur fees.</li>
              <li><strong className="text-surface-300">Testnet Risk:</strong> The Protocol is currently deployed on the Aleo Testnet. Testnet tokens have no real value, and the network may be reset at any time.</li>
              <li><strong className="text-surface-300">Network Upgrades:</strong> Aleo network upgrades or hard forks could affect the Protocol's functionality or your holdings.</li>
              <li><strong className="text-surface-300">Finality:</strong> Blockchain transactions are irreversible. Once a transaction is confirmed, it cannot be undone.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-4">4. Market Risk</h2>
            <ul className="list-disc list-inside space-y-2 text-surface-400">
              <li><strong className="text-surface-300">Price Volatility:</strong> Market share prices are determined by the FPMM (Fixed Product Market Maker) algorithm and can change rapidly based on trading activity.</li>
              <li><strong className="text-surface-300">Liquidity Risk:</strong> Markets with low liquidity may result in high slippage, meaning you may receive significantly less value than expected.</li>
              <li><strong className="text-surface-300">Resolution Risk:</strong> Markets are resolved by designated resolvers (not automated oracles). The resolution process includes an initial resolver decision, a 2,880-block challenge window (~12 hours on testnet), and the ability for any user to dispute by posting a bond. While governance can override incorrect resolutions, the process is human-initiated and may be subject to errors or disputes.</li>
              <li><strong className="text-surface-300">Impermanent Loss:</strong> Liquidity providers face impermanent loss risk when the market price diverges from the initial provision ratio. The FPMM formula (x * y = k) means LP value may decrease as outcomes become more certain.</li>
              <li><strong className="text-surface-300">LP Share Non-Transferability:</strong> LP shares are currently non-transferable due to claim key constraints. You cannot transfer your liquidity position to another wallet.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-4">5. Fee Risk</h2>
            <p className="mb-3">
              The Protocol charges a total trading fee of 2.0% on each buy transaction, distributed as follows:
            </p>
            <ul className="list-disc list-inside space-y-2 text-surface-400">
              <li><strong className="text-surface-300">Protocol Fee:</strong> 0.5% — sent to the protocol treasury.</li>
              <li><strong className="text-surface-300">Creator Fee:</strong> 0.5% — sent to the market creator.</li>
              <li><strong className="text-surface-300">LP Fee:</strong> 1.0% — retained in the AMM pool as rewards for liquidity providers.</li>
            </ul>
            <p className="mt-3 text-surface-400">
              Fees are deducted before the AMM pool calculation. Fee rates may be changed through governance proposals (requires 20% quorum and 72-hour timelock).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-4">6. Stablecoin Risk</h2>
            <ul className="list-disc list-inside space-y-2 text-surface-400">
              <li><strong className="text-surface-300">USAD & USDCX:</strong> The Protocol supports three tokens: native ALEO, USDCX (test_usdcx_stablecoin.aleo), and USAD (veiled_markets_usad_v11.aleo). These test stablecoin tokens may not maintain their peg to USD and have no guaranteed backing.</li>
              <li><strong className="text-surface-300">De-peg Risk:</strong> Stablecoins can lose their peg due to market conditions, smart contract issues, or governance failures.</li>
              <li><strong className="text-surface-300">Two-Transaction Flow:</strong> Buying shares with USDCX or USAD requires two sequential blockchain transactions (deposit to public, then buy). If the first transaction succeeds but the second fails, your funds may be temporarily locked in the contract's public balance until you retry.</li>
              <li><strong className="text-surface-300">Separate Contract Risk:</strong> USAD operates through a separate smart contract (veiled_markets_usad_v11.aleo) due to snarkVM transition limits. This adds additional composability risk compared to ALEO or USDCX markets.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-4">7. Privacy & Security Risk</h2>
            <ul className="list-disc list-inside space-y-2 text-surface-400">
              <li><strong className="text-surface-300">Key Management:</strong> If you lose your private keys or view keys, you will permanently lose access to your funds and cannot recover them.</li>
              <li><strong className="text-surface-300">Wallet Security:</strong> The security of your funds depends on the security of your wallet software and the device you use.</li>
              <li><strong className="text-surface-300">Privacy Limitations:</strong> While Aleo provides strong privacy guarantees, metadata analysis or user behavior patterns could potentially compromise privacy.</li>
              <li><strong className="text-surface-300">Phishing:</strong> Always verify you are accessing the official Veiled Markets website. Phishing attacks may attempt to steal your credentials.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-4">8. Regulatory Risk</h2>
            <p>
              The regulatory landscape for prediction markets and cryptocurrency is evolving and varies by
              jurisdiction. Changes in law or regulation could restrict or prohibit the use of the Protocol
              in your jurisdiction. You are responsible for understanding and complying with all applicable
              laws and regulations.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-4">9. No Guarantees</h2>
            <p className="mb-3">Veiled Markets does not guarantee:</p>
            <ul className="list-disc list-inside space-y-2 text-surface-400">
              <li>The accuracy of market probabilities or prices.</li>
              <li>The availability or uptime of the Protocol.</li>
              <li>The preservation of funds in all circumstances.</li>
              <li>Any specific return on investment.</li>
              <li>That the Protocol will be free from errors or vulnerabilities.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-4">10. Acknowledgment</h2>
            <p>
              By using Veiled Markets, you acknowledge that you have read and understood this Risk Disclosure,
              and that you accept all risks associated with using the Protocol. You agree that you are solely
              responsible for your own investment decisions and any losses that may result.
            </p>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  )
}
