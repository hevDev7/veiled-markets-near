import { Link } from 'react-router-dom'
import { ArrowLeft, Download, Copy, Check } from 'lucide-react'
import { useState } from 'react'
import { Footer } from '../components/Footer'

function ColorSwatch({ name, hex, className }: { name: string; hex: string; className: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(hex)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <button
      onClick={handleCopy}
      className="group text-left"
    >
      <div className={`w-full h-20 rounded-xl ${className} mb-2 ring-1 ring-white/[0.06] group-hover:ring-white/[0.12] transition-all`} />
      <div className="flex items-center justify-between">
        <span className="text-xs text-surface-300 font-medium">{name}</span>
        <span className="text-xs text-surface-500 font-mono flex items-center gap-1">
          {copied ? <Check className="w-3 h-3 text-yes-400" /> : <Copy className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />}
          {hex}
        </span>
      </div>
    </button>
  )
}

export function BrandKit() {
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
        <h1 className="font-display text-3xl sm:text-4xl text-white mb-3">Brand Kit</h1>
        <p className="text-surface-400 mb-12">
          Brand assets and guidelines for Veiled Markets. Use these resources for integrations,
          press materials, and community content.
        </p>

        <div className="space-y-16 text-sm leading-relaxed">
          {/* Logo */}
          <section>
            <h2 className="text-lg font-semibold text-white mb-6">Logo</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="p-8 rounded-2xl bg-white/[0.02] border border-white/[0.04] flex flex-col items-center gap-4">
                <div className="w-16 h-16 rounded-2xl overflow-hidden">
                  <img src="/logo.png" alt="Veiled Markets Logo" className="w-16 h-16 object-cover" />
                </div>
                <span className="text-xs text-surface-500">Primary — Dark background</span>
              </div>
              <div className="p-8 rounded-2xl bg-white border border-surface-200 flex flex-col items-center gap-4">
                <div className="w-16 h-16 rounded-2xl overflow-hidden">
                  <img src="/logo.png" alt="Veiled Markets Logo" className="w-16 h-16 object-cover" />
                </div>
                <span className="text-xs text-surface-600">Primary — Light background</span>
              </div>
            </div>
            <div className="mt-6 p-4 rounded-xl bg-white/[0.02] border border-white/[0.04]">
              <h3 className="text-sm font-medium text-white mb-2">Logo Usage</h3>
              <ul className="space-y-1.5 text-surface-400">
                <li>- Maintain minimum clear space equal to the logo height around all sides</li>
                <li>- Do not stretch, rotate, or alter the logo proportions</li>
                <li>- Do not place the logo on busy or low-contrast backgrounds</li>
                <li>- Use the wordmark "Veiled Markets" alongside the icon when space permits</li>
              </ul>
            </div>
          </section>

          {/* Colors */}
          <section>
            <h2 className="text-lg font-semibold text-white mb-6">Brand Colors</h2>

            <h3 className="text-sm font-medium text-surface-300 mb-3">Primary / Brand</h3>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-4 mb-8">
              <ColorSwatch name="Brand 300" hex="#93c5fd" className="bg-brand-300" />
              <ColorSwatch name="Brand 400" hex="#60a5fa" className="bg-brand-400" />
              <ColorSwatch name="Brand 500" hex="#3b82f6" className="bg-brand-500" />
              <ColorSwatch name="Brand 600" hex="#2563eb" className="bg-brand-600" />
              <ColorSwatch name="Brand 700" hex="#1d4ed8" className="bg-brand-700" />
            </div>

            <h3 className="text-sm font-medium text-surface-300 mb-3">Outcome Colors</h3>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-4 mb-8">
              <ColorSwatch name="Yes / Green" hex="#4ade80" className="bg-yes-400" />
              <ColorSwatch name="Yes Dark" hex="#16a34a" className="bg-yes-600" />
              <ColorSwatch name="No / Red" hex="#f87171" className="bg-no-400" />
              <ColorSwatch name="No Dark" hex="#dc2626" className="bg-no-600" />
            </div>

            <h3 className="text-sm font-medium text-surface-300 mb-3">Surface / Background</h3>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-4">
              <ColorSwatch name="Surface 950" hex="#0a0a0f" className="bg-surface-950" />
              <ColorSwatch name="Surface 900" hex="#111118" className="bg-surface-900" />
              <ColorSwatch name="Surface 800" hex="#1a1a24" className="bg-surface-800" />
              <ColorSwatch name="Surface 600" hex="#4a4a5c" className="bg-surface-600" />
              <ColorSwatch name="Surface 400" hex="#8a8aa0" className="bg-surface-400" />
            </div>
          </section>

          {/* Typography */}
          <section>
            <h2 className="text-lg font-semibold text-white mb-6">Typography</h2>
            <div className="space-y-4">
              <div className="p-5 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                <p className="text-xs text-surface-500 mb-2">Display / Headings</p>
                <p className="font-display text-2xl text-white">Veiled Markets</p>
                <p className="text-xs text-surface-500 mt-2">Font: Display font (configured in Tailwind as <code className="bg-white/[0.04] px-1 rounded">font-display</code>)</p>
              </div>
              <div className="p-5 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                <p className="text-xs text-surface-500 mb-2">Body Text</p>
                <p className="text-base text-surface-300">Privacy-preserving prediction market built on Aleo. Predict freely, bet privately.</p>
                <p className="text-xs text-surface-500 mt-2">Font: System sans-serif stack</p>
              </div>
              <div className="p-5 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                <p className="text-xs text-surface-500 mb-2">Code / Technical</p>
                <p className="font-mono text-base text-surface-300">veiled_markets_v35.aleo</p>
                <p className="text-xs text-surface-500 mt-2">Font: Monospace stack (configured as <code className="bg-white/[0.04] px-1 rounded">font-mono</code>)</p>
              </div>
            </div>
          </section>

          {/* Naming */}
          <section>
            <h2 className="text-lg font-semibold text-white mb-6">Naming & Copy</h2>
            <div className="p-5 rounded-xl bg-white/[0.02] border border-white/[0.04] space-y-3">
              <div className="flex items-start gap-3">
                <Check className="w-4 h-4 text-yes-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-white font-medium">Veiled Markets</p>
                  <p className="text-xs text-surface-500">Full product name — use in first reference and headings</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Check className="w-4 h-4 text-yes-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-white font-medium">Veiled</p>
                  <p className="text-xs text-surface-500">Short form — acceptable after first reference</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Check className="w-4 h-4 text-yes-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-white font-medium">"the Protocol"</p>
                  <p className="text-xs text-surface-500">Use in legal and technical documentation</p>
                </div>
              </div>
            </div>
          </section>

          {/* Taglines */}
          <section>
            <h2 className="text-lg font-semibold text-white mb-6">Taglines</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                'Predict freely, bet privately.',
                'Privacy-preserving prediction markets on Aleo.',
                'Your bets, your business.',
                'ZK-powered predictions.',
              ].map((tagline) => (
                <div key={tagline} className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                  <p className="text-sm text-white italic">"{tagline}"</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  )
}
