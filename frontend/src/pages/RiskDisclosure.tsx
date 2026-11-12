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
        <p className="text-sm text-surface-500 mb-8">Last updated: November 12, 2026</p>

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
              The Protocol runs on one smart contract on NEAR testnet, v1.veiled-markets.testnet. It holds the private
              note pool, the prediction markets, market resolution, turbo rounds and parlays. This carries inherent risks:
            </p>
            <ul className="list-disc list-inside space-y-2 text-surface-400">
              <li><strong className="text-surface-300">Code Vulnerabilities:</strong> Despite testing and review, the contract may contain undiscovered bugs that could result in loss of funds.</li>
              <li><strong className="text-surface-300">Single Contract:</strong> Every deposit, market, turbo round and parlay pool is held by the same contract, so a flaw in one part could affect funds held for the others.</li>
              <li><strong className="text-surface-300">Zero-Knowledge Circuit:</strong> Private actions are verified with a Groth16 proof. A flaw in the circuit or in its trusted setup, which on testnet comes from a single phase-2 contribution, could allow invalid spends.</li>
              <li><strong className="text-surface-300">Upgrades and Redeployment:</strong> The team holds the key of the contract account and can deploy new code or a new contract version. A new version may not carry over testnet balances or markets.</li>
              <li><strong className="text-surface-300">Owner Controls:</strong> The owner account can pause trading, change fees and minimum amounts, withdraw protocol fees and forfeited bonds from the treasury, withdraw parlay pool funds that open parlays do not need, and change the parlay limits.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-4">2a. Turbo Market &amp; Oracle Risk</h2>
            <p className="mb-3">
              Turbo rounds are 5-minute UP/DOWN markets on BTC, ETH and SOL. They carry risks beyond the prediction markets:
            </p>
            <ul className="list-disc list-inside space-y-2 text-surface-400">
              <li><strong className="text-surface-300">Operator Trust:</strong> Rounds are created and resolved only by the oracle operator account (veiled-oracle.testnet), which reads prices from Pyth Network, or from CoinGecko when it has no Pyth API key. If the operator is offline, compromised or malicious, rounds may fail to resolve or resolve to the wrong outcome. The contract checks the operator&apos;s identity, the price range, a confidence interval of at most 0.5% of the price, and that the closing price is within 50% of the baseline, but it cannot verify the price itself.</li>
              <li><strong className="text-surface-300">Oracle Dependency:</strong> A Pyth outage or mispricing affects every round in that window. CoinGecko prices refresh only about once a minute.</li>
              <li><strong className="text-surface-300">No Dispute Window:</strong> Turbo rounds have no voting and no dispute period. Once the operator resolves a round, the outcome is final. Your recourse for suspected misbehavior is the public audit trail at /verify/turbo/:marketId and the bug bounty program.</li>
              <li><strong className="text-surface-300">Pool-Based Payouts:</strong> Winners split the stakes of both sides in proportion to their own stake, so your payout depends on how much others bet. If nobody bet on the winning side, the round is cancelled and every bet is refunded.</li>
              <li><strong className="text-surface-300">Late Resolution:</strong> The operator must resolve a round within 20 minutes of its deadline. If it does not, the operator can cancel the round, and after about 5.5 more hours anyone can. Every bet is then refundable, but your stake is locked until that happens.</li>
              <li><strong className="text-surface-300">Price Snapshot Divergence:</strong> The chart shows live prices streamed by the operator service. There can be a small gap between the closing price committed on chain and the last price you saw. The value stored in the contract is authoritative, not the dot on your chart.</li>
              <li><strong className="text-surface-300">Operator Runway:</strong> The operator pays NEAR gas for every create and resolve. If its account runs out of NEAR, new rounds stop.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-4">2b. Parlay Risk</h2>
            <ul className="list-disc list-inside space-y-2 text-surface-400">
              <li><strong className="text-surface-300">All Legs Must Win:</strong> A parlay combines 2 to 4 legs. If any leg resolves to a different outcome, the whole stake is lost.</li>
              <li><strong className="text-surface-300">Inherited Resolution:</strong> Each leg follows its market&apos;s resolution, including votes, disputes, committee decisions and cancellations. A parlay with a cancelled leg is refunded only after every leg market is final, which can take until the last leg resolves.</li>
              <li><strong className="text-surface-300">Odds at Placement:</strong> Odds are fixed from the live market prices when the parlay is placed. Prices can move before your transaction lands; the minimum payout you confirm protects you, and the parlay fails rather than accept less.</li>
              <li><strong className="text-surface-300">Payout Pool:</strong> Winning parlays are paid from a pool funded by the operator. A new parlay is accepted only while the pool covers 110% of what open parlays are owed, and new parlays are refused when it does not. A contract flaw could still affect the pool.</li>
              <li><strong className="text-surface-300">Fee:</strong> 2% of the payout of a winning parlay goes to the protocol treasury.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-4">3. Blockchain &amp; Network Risk</h2>
            <ul className="list-disc list-inside space-y-2 text-surface-400">
              <li><strong className="text-surface-300">Testnet Risk:</strong> The Protocol is deployed on NEAR testnet. Testnet tokens have no monetary value, and the network or the contract may be reset at any time.</li>
              <li><strong className="text-surface-300">Relayer Dependency:</strong> Private actions (trades, bets, parlays, redemptions, claims and withdrawals) are submitted by a relayer. If the relayer is offline, you cannot perform them until it returns. The relayer cannot change or redirect a transaction, because the proof binds it.</li>
              <li><strong className="text-surface-300">Network Congestion and RPC Outages:</strong> Busy or unavailable NEAR RPC endpoints may delay or fail transactions.</li>
              <li><strong className="text-surface-300">Transaction Fees:</strong> Public calls from your wallet (deposits, market creation, votes, disputes) cost NEAR gas. Failed transactions may still cost gas. The relayer pays the gas of private actions.</li>
              <li><strong className="text-surface-300">Network Upgrades:</strong> NEAR protocol upgrades could affect the Protocol&apos;s behavior.</li>
              <li><strong className="text-surface-300">Finality:</strong> Blockchain transactions are irreversible. Once a transaction is confirmed, it cannot be undone.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-4">4. Market Risk</h2>
            <ul className="list-disc list-inside space-y-2 text-surface-400">
              <li><strong className="text-surface-300">Price Volatility:</strong> Share prices are set by the FPMM (Fixed Product Market Maker) and can change rapidly with trading activity.</li>
              <li><strong className="text-surface-300">Liquidity Risk:</strong> In markets with low liquidity, large trades suffer high slippage, so you may receive significantly less than expected.</li>
              <li><strong className="text-surface-300">Resolution Risk:</strong> Markets are resolved by bonded voting, not by an automated oracle. After the deadline anyone can vote on the outcome by posting a 0.1 NEAR bond. On testnet one voter is enough, and the voting and dispute windows last 5 minutes each, so a single account can decide a market if nobody disputes in time. A dispute requires 3 times the total voter bonds and moves the decision to a 5-member committee; if the committee does not decide within 1 hour on testnet, the market can be cancelled and refunded. The process is human-driven and may produce errors.</li>
              <li><strong className="text-surface-300">Voter Bond Risk:</strong> If you vote and your outcome does not win, your 0.1 NEAR bond is forfeited to the treasury. A disputer whose outcome the committee rejects forfeits the dispute bond.</li>
              <li><strong className="text-surface-300">Impermanent Loss:</strong> Liquidity providers face impermanent loss when prices move away from where they provided liquidity. LP value can fall as an outcome becomes more certain.</li>
              <li><strong className="text-surface-300">LP Withdrawal Timing:</strong> Liquidity can only be withdrawn after the market resolves (after a short priority window for winners) or is cancelled.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-4">5. Fee Risk</h2>
            <p className="mb-3">The Protocol charges the following fees:</p>
            <ul className="list-disc list-inside space-y-2 text-surface-400">
              <li><strong className="text-surface-300">Buying shares:</strong> 1.0% in total: 0.5% protocol fee to the treasury and 0.5% to the market creator.</li>
              <li><strong className="text-surface-300">Selling shares:</strong> 2.0% in total: 0.5% protocol fee, 0.5% to the market creator, and 1.0% to liquidity providers (it stays in the pool).</li>
              <li><strong className="text-surface-300">Turbo bets:</strong> 0.5% of each bet, to the treasury.</li>
              <li><strong className="text-surface-300">Parlays:</strong> 2% of the payout of a winning parlay, to the treasury.</li>
            </ul>
            <p className="mt-3 text-surface-400">
              The contract owner can change the market fee rates and the parlay fee at any time, without a vote.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-4">6. Stablecoin Risk</h2>
            <ul className="list-disc list-inside space-y-2 text-surface-400">
              <li><strong className="text-surface-300">USDC on Testnet:</strong> The Protocol supports NEAR and USDC. USDC here is Circle&apos;s testnet USDC on NEAR, obtained from Circle&apos;s faucet; it has no monetary value, and its contract is operated by Circle, not by Veiled Markets.</li>
              <li><strong className="text-surface-300">De-peg and Issuer Risk:</strong> Stablecoins can lose their peg or be frozen by their issuer.</li>
              <li><strong className="text-surface-300">Account Registration:</strong> USDC payments out of the contract require the receiving account to be registered with the USDC contract. If a withdrawal to an unregistered account fails, the amount returns to your private balance. If another USDC payout fails, such as creator fees to an unregistered account, the amount is booked into the protocol treasury.</li>
              <li><strong className="text-surface-300">Two-Step Trades:</strong> If your private balance is too small, the app first asks your wallet for a deposit and then submits the trade. If the trade fails after the deposit, the deposit stays in your private balance until you use or withdraw it.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-4">7. Privacy &amp; Security Risk</h2>
            <ul className="list-disc list-inside space-y-2 text-surface-400">
              <li><strong className="text-surface-300">Note Key:</strong> Your private balance and positions can only be spent with your note key, which is derived from a message your wallet signs. If you lose access to your NEAR account, you lose access to your notes. If your wallet cannot sign messages, the key is created in your browser instead, and clearing the browser&apos;s data deletes it and the notes with it.</li>
              <li><strong className="text-surface-300">Key Stored in the Browser:</strong> The note key is cached in your browser&apos;s local storage. Anyone who can read that storage, such as malware, a malicious extension or another user of the same browser profile, can spend your notes without your wallet.</li>
              <li><strong className="text-surface-300">Wallet Security:</strong> The security of your funds depends on the security of your wallet software and the device you use.</li>
              <li><strong className="text-surface-300">Privacy Limitations:</strong> The note pool hides which account holds which position, not the timing or size of transactions. A deposit followed shortly by a trade of the same amount can be linked. Deposits, withdrawals, votes and market creation are public. The relayer and RPC providers can see the IP address your requests come from.</li>
              <li><strong className="text-surface-300">Phishing:</strong> Always verify you are using the official Veiled Markets website. Phishing sites may try to obtain your wallet signature, which would reveal your note key.</li>
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
