import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Footer } from '../components/Footer'

export function CookiesPolicy() {
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
        <h1 className="font-display text-3xl sm:text-4xl text-white mb-2">Cookie Policy</h1>
        <p className="text-sm text-surface-500 mb-12">Last updated: March 22, 2026</p>

        <div className="space-y-10 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-white mb-4">1. Introduction</h2>
            <p>
              This Cookie Policy explains how Veiled Markets ("the Protocol") uses cookies and similar
              technologies when you access our website. As a privacy-focused platform, we minimize the use
              of tracking technologies and prioritize your privacy.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-4">2. What Are Cookies?</h2>
            <p>
              Cookies are small text files stored on your device when you visit a website. They help websites
              remember information about your visit. Similar technologies include localStorage, sessionStorage,
              and other browser storage mechanisms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-4">3. How We Use Storage Technologies</h2>
            <p className="mb-4">
              Veiled Markets primarily uses browser localStorage rather than traditional cookies. Here's what we store:
            </p>

            <div className="space-y-6">
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                <h3 className="text-base font-medium text-white mb-2">Essential Storage</h3>
                <p className="text-surface-400 mb-2">Required for the Protocol to function properly.</p>
                <ul className="list-disc list-inside space-y-1.5 text-surface-400">
                  <li><strong className="text-surface-300">Wallet Connection State:</strong> Remembers your connected wallet to enable auto-reconnection.</li>
                  <li><strong className="text-surface-300">Encrypted User Data:</strong> Locally cached transaction records and portfolio data, encrypted with AES-256-GCM.</li>
                  <li><strong className="text-surface-300">UI Preferences:</strong> Theme settings, display preferences, and interface state.</li>
                </ul>
              </div>

              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                <h3 className="text-base font-medium text-white mb-2">Functional Storage</h3>
                <p className="text-surface-400 mb-2">Enhances your experience but is not strictly necessary.</p>
                <ul className="list-disc list-inside space-y-1.5 text-surface-400">
                  <li><strong className="text-surface-300">Market Question Mappings:</strong> Cached mappings between market IDs and question text (stored as <code className="text-surface-300 bg-white/[0.04] px-1 rounded">veiled_markets_questions</code> in localStorage).</li>
                  <li><strong className="text-surface-300">Zustand Store:</strong> Application state persistence for market data, portfolio, and UI state via Zustand's persist middleware.</li>
                </ul>
              </div>

              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                <h3 className="text-base font-medium text-white mb-2">Session Storage</h3>
                <p className="text-surface-400 mb-2">Temporary data that is cleared when you close the browser tab.</p>
                <ul className="list-disc list-inside space-y-1.5 text-surface-400">
                  <li><strong className="text-surface-300">Encryption Key Cache:</strong> A wallet-derived signature used for AES-256-GCM encryption is temporarily cached in sessionStorage (key: <code className="text-surface-300 bg-white/[0.04] px-1 rounded">vm_enc_sig</code>). This is cleared automatically when you close the tab and is never persisted to disk.</li>
                </ul>
              </div>

              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] border-dashed">
                <h3 className="text-base font-medium text-surface-400 mb-2">Analytics</h3>
                <p className="text-surface-500">
                  The Protocol does not currently implement any analytics, tracking, or telemetry services. No usage data, page views, or performance metrics are collected.
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-4">4. What We Do NOT Use</h2>
            <ul className="list-disc list-inside space-y-2 text-surface-400">
              <li><strong className="text-surface-300">Traditional Cookies:</strong> The Protocol itself does not set any HTTP cookies (document.cookie is not used in our codebase).</li>
              <li><strong className="text-surface-300">Tracking Cookies:</strong> We do not use cookies to track your browsing activity across websites.</li>
              <li><strong className="text-surface-300">Third-Party Advertising:</strong> We do not use advertising cookies or share data with ad networks.</li>
              <li><strong className="text-surface-300">Fingerprinting:</strong> We do not use browser fingerprinting techniques.</li>
              <li><strong className="text-surface-300">Social Media Trackers:</strong> We do not embed social media tracking pixels.</li>
              <li><strong className="text-surface-300">Analytics Services:</strong> No Google Analytics, Mixpanel, PostHog, or similar services are active.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-4">5. Third-Party Services</h2>
            <p className="mb-3">
              Some third-party services integrated with the Protocol may set their own cookies:
            </p>
            <ul className="list-disc list-inside space-y-2 text-surface-400">
              <li><strong className="text-surface-300">Wallet Extensions:</strong> Browser wallet extensions may use their own storage mechanisms.</li>
              <li><strong className="text-surface-300">Hosting Provider (Vercel):</strong> May set minimal performance and security cookies.</li>
            </ul>
            <p className="mt-3">
              We have no control over third-party cookies. Please refer to their respective privacy policies.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-4">6. Managing Your Data</h2>
            <p className="mb-3">You have full control over locally stored data:</p>
            <ul className="list-disc list-inside space-y-2 text-surface-400">
              <li><strong className="text-surface-300">Settings Page:</strong> Use the Protocol's Settings page to clear cached data and reset preferences.</li>
              <li><strong className="text-surface-300">Browser Settings:</strong> Clear localStorage and cookies through your browser's privacy settings.</li>
              <li><strong className="text-surface-300">Disconnect Wallet:</strong> Disconnecting your wallet removes the active session data.</li>
              <li><strong className="text-surface-300">Incognito Mode:</strong> Use your browser's private browsing mode to prevent any data from being stored persistently.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-4">7. Changes to This Policy</h2>
            <p>
              We may update this Cookie Policy from time to time. Changes will be posted on the Protocol's
              website with an updated "Last updated" date. Your continued use of the Protocol after changes
              constitutes acceptance of the updated policy.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-4">8. Contact</h2>
            <p>
              For questions about this Cookie Policy, please reach out through our official communication
              channels listed on the Protocol's website.
            </p>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  )
}
