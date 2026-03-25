import { Link } from 'react-router-dom'
import { ArrowLeft, Shield, Clock, ArrowRight } from 'lucide-react'
import { Footer } from '../components/Footer'

export function BugBounty() {
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
        <div className="flex flex-col items-center text-center max-w-lg mx-auto">
          {/* Icon */}
          <div className="w-20 h-20 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center mb-8">
            <Shield className="w-10 h-10 text-brand-400" />
          </div>

          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-yellow-500/[0.08] border border-yellow-500/[0.15] mb-6">
            <Clock className="w-3.5 h-3.5 text-yellow-400" />
            <span className="text-xs font-medium text-yellow-300">Coming Soon</span>
          </div>

          <h1 className="font-display text-3xl sm:text-4xl text-white mb-4">Bug Bounty Program</h1>
          <p className="text-surface-400 leading-relaxed mb-8">
            We're building a formal bug bounty program to reward security researchers who help keep
            Veiled Markets safe. The program will cover smart contract vulnerabilities, front-end
            security issues, and privacy-related bugs.
          </p>

          {/* What to expect */}
          <div className="w-full p-6 rounded-2xl bg-white/[0.02] border border-white/[0.04] text-left mb-8">
            <h2 className="text-sm font-semibold text-white mb-4">What to Expect</h2>
            <div className="space-y-3">
              {[
                {
                  title: 'Smart Contract Scope',
                  desc: 'veiled_markets_v34.aleo, veiled_markets_usad_v11.aleo, and veiled_governance_v4.aleo',
                },
                {
                  title: 'Frontend Scope',
                  desc: 'XSS, injection, key exposure, and encryption bypass vulnerabilities',
                },
                {
                  title: 'Privacy Scope',
                  desc: 'Information leakage, metadata analysis, and zero-knowledge proof weaknesses',
                },
                {
                  title: 'Tiered Rewards',
                  desc: 'Bounty amounts based on severity: Critical, High, Medium, Low',
                },
              ].map((item) => (
                <div key={item.title} className="flex items-start gap-3">
                  <ArrowRight className="w-3.5 h-3.5 text-brand-400 shrink-0 mt-1" />
                  <div>
                    <p className="text-sm text-white font-medium">{item.title}</p>
                    <p className="text-xs text-surface-500">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Current reporting */}
          <div className="w-full p-6 rounded-2xl bg-white/[0.02] border border-white/[0.04] text-left">
            <h2 className="text-sm font-semibold text-white mb-3">Found a Vulnerability?</h2>
            <p className="text-sm text-surface-400 leading-relaxed">
              While the formal program is being prepared, please report any security issues through
              our official communication channels. We take all security reports seriously and will
              respond promptly. Please do not publicly disclose vulnerabilities before they are resolved.
            </p>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
