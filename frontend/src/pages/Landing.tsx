import { motion, AnimatePresence } from 'framer-motion'
import { Shield, Eye, Lock, ArrowRight, Wallet, Zap, ChevronRight, BarChart3, Users, Globe, Code } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useState, useEffect, useCallback } from 'react'
import { useWalletStore } from '@/lib/store'
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react'
import { useWalletModal } from '@provablehq/aleo-wallet-adaptor-react-ui'
import { Network } from '@provablehq/aleo-types'
import { cn } from '@/lib/utils'

// ── Sequential Terminal Typing ──
function SequentialTerminal({
  lines
}: {
  lines: Array<{ prompt?: string; text: string; color?: string }>
}) {
  const [currentLineIndex, setCurrentLineIndex] = useState(0)
  const [displayedLines, setDisplayedLines] = useState<string[]>([])
  const [currentText, setCurrentText] = useState('')
  const [showCursor, setShowCursor] = useState(true)
  const [allComplete, setAllComplete] = useState(false)

  useEffect(() => {
    if (currentLineIndex >= lines.length) {
      setAllComplete(true)
      setShowCursor(false)
      return
    }

    const currentLine = lines[currentLineIndex]
    let charIndex = 0
    setCurrentText('')
    setShowCursor(true)

    const typingTimer = setInterval(() => {
      if (charIndex <= currentLine.text.length) {
        setCurrentText(currentLine.text.slice(0, charIndex))
        charIndex++
      } else {
        clearInterval(typingTimer)
        setTimeout(() => {
          setDisplayedLines(prev => [...prev, currentLine.text])
          setCurrentText('')
          setCurrentLineIndex(prev => prev + 1)
        }, 250)
      }
    }, 25)

    return () => clearInterval(typingTimer)
  }, [currentLineIndex, lines])

  return (
    <>
      {displayedLines.map((text, index) => (
        <div key={index} className="flex items-start gap-2">
          {lines[index].prompt && (
            <span className="text-brand-400 select-none">{lines[index].prompt}</span>
          )}
          <span className={lines[index].color || 'text-surface-300'}>{text}</span>
        </div>
      ))}

      {currentLineIndex < lines.length && (
        <div className="flex items-start gap-2">
          {lines[currentLineIndex].prompt && (
            <span className="text-brand-400 select-none">{lines[currentLineIndex].prompt}</span>
          )}
          <span className={lines[currentLineIndex].color || 'text-surface-300'}>
            {currentText}
            {showCursor && <span className="animate-pulse text-brand-400">▊</span>}
          </span>
        </div>
      )}

      {allComplete && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
          className="flex items-center gap-2 text-brand-400 pt-2"
        >
          <div className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" />
          <span className="text-xs">Ready</span>
        </motion.div>
      )}
    </>
  )
}

// ── Rotating Words ──
function RotatingWords({ words, interval = 3000 }: { words: string[]; interval?: number }) {
  const [current, setCurrent] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrent(prev => (prev + 1) % words.length)
    }, interval)
    return () => clearInterval(timer)
  }, [words.length, interval])

  return (
    <span className="inline-block relative">
      <AnimatePresence mode="wait">
        <motion.span
          key={words[current]}
          initial={{ opacity: 0, y: 20, filter: 'blur(4px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -20, filter: 'blur(4px)' }}
          transition={{ duration: 0.4 }}
          className="gradient-text-vivid"
        >
          {words[current]}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}

// ═══════════════════════════════════════════
// LANDING PAGE
// ═══════════════════════════════════════════
export function Landing() {
  const navigate = useNavigate()
  const { wallet } = useWalletStore()
  const { connected: providerConnected, connecting, selectWallet, connect } = useWallet() as any
  const { setVisible } = useWalletModal()
  const [connectError, setConnectError] = useState<string | null>(null)

  const isConnected = wallet.connected || providerConnected

  const terminalLines = [
    { prompt: '~', text: 'veiled connect --wallet shield', color: 'text-surface-300' },
    { text: '✓ Connected: aleo1q8f...7x2m', color: 'text-yes-400' },
    { prompt: '~', text: 'veiled bet --market 42 --amount 100 --outcome YES', color: 'text-surface-300' },
    { text: '⟳ Generating zero-knowledge proof...', color: 'text-accent-400' },
    { text: '✓ Bet placed — position encrypted on-chain', color: 'text-yes-400' },
    { text: '⊘ Your bet: HIDDEN from all observers', color: 'text-brand-300' },
  ]

  useEffect(() => {
    if (isConnected) {
      setVisible(false) // Close wallet modal before navigating
      navigate('/dashboard')
    }
  }, [isConnected, navigate, setVisible])

  const handleConnectClick = useCallback(async () => {
    setConnectError(null)
    try {
      // Try direct connection to Shield wallet first
      const hasShield = !!(window as any).shield
      console.log('[Landing] Connect clicked. window.shield:', hasShield, '| connecting:', connecting)

      if (hasShield) {
        // Select Shield wallet adapter and connect directly
        selectWallet('Shield Wallet')
        await connect(Network.TESTNET)
        console.log('[Landing] Direct connect succeeded')
      } else {
        // No Shield detected — open modal for wallet selection
        console.log('[Landing] No window.shield, opening modal')
        setVisible(true)
      }
    } catch (err: any) {
      console.error('[Landing] Connect failed:', err)
      setConnectError(err?.message || 'Connection failed')
      // Fall back to modal on error
      setVisible(true)
    }
  }, [connecting, selectWallet, connect, setVisible])

  if (isConnected) return null

  return (
    <div className="min-h-screen bg-surface-950 relative overflow-hidden noise-overlay">

      {/* ── Background Layers ── */}
      <div className="fixed inset-0 z-0">
        {/* Grid pattern */}
        <div className="absolute inset-0 grid-pattern grid-pattern-fade" />

        {/* Gradient orbs */}
        <motion.div
          animate={{ x: [0, 80, 0], y: [0, -60, 0] }}
          transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
          className="absolute -top-20 left-1/4 w-[500px] h-[500px] rounded-full blur-[160px]"
          style={{ background: 'radial-gradient(circle, rgba(124, 58, 237, 0.15), transparent 70%)' }}
        />
        <motion.div
          animate={{ x: [0, -60, 0], y: [0, 80, 0] }}
          transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
          className="absolute -bottom-20 right-1/4 w-[600px] h-[600px] rounded-full blur-[180px]"
          style={{ background: 'radial-gradient(circle, rgba(20, 200, 191, 0.1), transparent 70%)' }}
        />
        <motion.div
          animate={{ x: [0, 40, 0], y: [0, -30, 0] }}
          transition={{ duration: 35, repeat: Infinity, ease: "linear" }}
          className="absolute top-1/2 right-0 w-[400px] h-[400px] rounded-full blur-[150px]"
          style={{ background: 'radial-gradient(circle, rgba(245, 158, 11, 0.06), transparent 70%)' }}
        />

        {/* Top spotlight */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] blur-[120px]"
          style={{ background: 'radial-gradient(ellipse, rgba(124, 58, 237, 0.1), transparent 70%)' }}
        />
      </div>

      {/* ── Header ── */}
      <header className="fixed top-0 left-0 right-0 z-40">
        <div className="absolute inset-0 bg-surface-950/60 backdrop-blur-2xl" style={{ borderBottom: '1px solid rgba(48, 40, 71, 0.3)' }} />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 lg:h-20">
            {/* Logo */}
            <motion.div
              className="flex items-center gap-3"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
            >
              <img
                src="/logo.png"
                alt="Veiled Markets"
                className="h-9 w-9 object-cover rounded-xl"
              />
              <div className="hidden sm:block">
                <h1 className="font-display text-lg font-bold tracking-tight">
                  <span className="gradient-text">Veiled</span>
                  <span className="text-white"> Markets</span>
                </h1>
              </div>
            </motion.div>

            {/* Nav Links */}
            <motion.nav
              className="hidden md:flex items-center gap-1"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              {['Protocol', 'Markets', 'Docs'].map((item) => (
                <a
                  key={item}
                  href={`#${item.toLowerCase()}`}
                  className="px-4 py-2 text-sm font-medium text-surface-400 hover:text-white rounded-lg hover:bg-surface-800/30 transition-all duration-200"
                >
                  {item}
                </a>
              ))}
            </motion.nav>

            {/* CTA */}
            <motion.button
              onClick={handleConnectClick}
              disabled={connecting}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
              className="btn-primary flex items-center gap-2.5 text-sm group disabled:opacity-50"
            >
              <Wallet className="w-4 h-4" />
              <span>{connecting ? 'Connecting...' : 'Launch App'}</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </motion.button>
          </div>
        </div>
      </header>

      {/* ═══════════════════════════════════
          HERO SECTION
          ═══════════════════════════════════ */}
      <section className="relative pt-32 lg:pt-40 pb-16 lg:pb-24 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-[1.1fr_1fr] gap-12 lg:gap-16 items-center">

            {/* Left: Hero Copy */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              className="text-center lg:text-left"
            >
              {/* Eyebrow */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-brand-500/10 mb-8"
                style={{ border: '1px solid rgba(124, 58, 237, 0.25)' }}
              >
                <div className="w-2 h-2 rounded-full bg-yes-400 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                <span className="text-xs font-bold text-brand-300 tracking-wide uppercase">
                  Live on Aleo Testnet
                </span>
              </motion.div>

              {/* Headline */}
              <h1 className="font-display text-display-md lg:text-display-lg tracking-tight mb-6">
                <span className="text-white">Predict the Future.</span>
                <br />
                <RotatingWords words={['Stay Anonymous.', 'Stay Hidden.', 'Stay Private.']} />
              </h1>

              {/* Sub-headline */}
              <p className="text-body-lg text-surface-400 mb-10 max-w-lg mx-auto lg:mx-0 leading-relaxed">
                The first prediction market where your positions are{' '}
                <span className="text-brand-300 font-semibold">cryptographically invisible</span>.
                Built on Aleo with zero-knowledge proofs.
              </p>

              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start mb-10">
                <button
                  onClick={handleConnectClick}
                  disabled={connecting}
                  className="btn-primary flex items-center gap-3 text-base px-8 py-4 w-full sm:w-auto justify-center group disabled:opacity-50"
                >
                  <Wallet className="w-5 h-5" />
                  <span>{connecting ? 'Connecting...' : 'Start Predicting'}</span>
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </button>
                <a
                  href="#protocol"
                  className="btn-secondary flex items-center gap-2.5 text-base px-8 py-4 w-full sm:w-auto justify-center"
                >
                  <span>How It Works</span>
                  <ChevronRight className="w-4 h-4" />
                </a>
              </div>

              {connectError && (
                <p className="text-no-400 text-sm mb-4 text-center lg:text-left">{connectError}</p>
              )}

              {/* Trust Indicators */}
              <div className="flex flex-wrap items-center gap-4 justify-center lg:justify-start">
                <TrustPill icon={<Shield className="w-3.5 h-3.5" />} text="MEV Protected" />
                <TrustPill icon={<Eye className="w-3.5 h-3.5" />} text="Hidden Bets" />
                <TrustPill icon={<Lock className="w-3.5 h-3.5" />} text="ZK Proofs" />
              </div>
            </motion.div>

            {/* Right: Terminal + Stats */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="relative"
            >
              {/* Terminal Glow */}
              <div className="absolute -inset-4 bg-brand-500/5 rounded-3xl blur-2xl" />

              {/* Terminal Window */}
              <div className="relative rounded-2xl overflow-hidden" style={{
                background: 'rgba(14, 10, 31, 0.85)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(124, 58, 237, 0.2)',
                boxShadow: '0 0 0 1px rgba(14, 10, 31, 0.5), 0 20px 60px rgba(0, 0, 0, 0.6), 0 0 80px rgba(124, 58, 237, 0.08)',
              }}>
                {/* Terminal Header */}
                <div className="px-4 py-3 flex items-center gap-3" style={{ borderBottom: '1px solid rgba(48, 40, 71, 0.4)' }}>
                  <div className="flex gap-2">
                    <div className="w-3 h-3 rounded-full bg-no-500/60" />
                    <div className="w-3 h-3 rounded-full bg-gold-500/60" />
                    <div className="w-3 h-3 rounded-full bg-yes-500/60" />
                  </div>
                  <span className="text-[11px] text-surface-500 font-mono ml-1">veiled_markets.aleo</span>
                  <div className="ml-auto flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-yes-500 animate-pulse" />
                    <span className="text-[10px] text-surface-500 font-mono">LIVE</span>
                  </div>
                </div>

                {/* Terminal Content */}
                <div className="p-5 font-mono text-sm space-y-2.5 min-h-[240px]">
                  <SequentialTerminal lines={terminalLines} />
                </div>
              </div>

              {/* Stats Below */}
              <div className="grid grid-cols-3 gap-3 mt-4">
                <StatChip
                  value="ZK"
                  label="Powered"
                  icon={<Zap className="w-3.5 h-3.5" />}
                  delay={0.6}
                />
                <StatChip
                  value="FPMM"
                  label="AMM Model"
                  icon={<BarChart3 className="w-3.5 h-3.5" />}
                  delay={0.7}
                />
                <StatChip
                  value="100%"
                  label="Private"
                  icon={<Lock className="w-3.5 h-3.5" />}
                  delay={0.8}
                />
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════
          FEATURES SECTION — Bento Grid
          ═══════════════════════════════════ */}
      <section id="protocol" className="relative py-24 z-10">
        {/* Divider */}
        <div className="divider mb-24" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            className="text-center mb-16"
          >
            <p className="section-header mb-4">Privacy-First Architecture</p>
            <h2 className="text-display-sm lg:text-display-md text-white text-balance">
              Your Predictions.{' '}
              <span className="gradient-text">Your Secret.</span>
            </h2>
          </motion.div>

          {/* Bento Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-5">
            <FeatureCard
              icon={<Eye className="w-6 h-6" />}
              title="Hidden Positions"
              description="Bet amounts and outcomes stay encrypted on-chain. Only you hold the decryption key."
              accentColor="brand"
              delay={0.1}
            />
            <FeatureCard
              icon={<Shield className="w-6 h-6" />}
              title="MEV Protected"
              description="Transactions are invisible until confirmed. Zero front-running. Zero manipulation."
              accentColor="accent"
              delay={0.2}
            />
            <FeatureCard
              icon={<Lock className="w-6 h-6" />}
              title="Anonymous Trading"
              description="No wallet tracking. No social pressure. Express your genuine beliefs freely."
              accentColor="yes"
              delay={0.3}
            />
          </div>

          {/* Protocol Highlights Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 lg:mt-5">
            <HighlightChip icon={<BarChart3 />} label="FPMM" sublabel="Market Maker" />
            <HighlightChip icon={<Users />} label="Dual Token" sublabel="ALEO + USDCX" />
            <HighlightChip icon={<Globe />} label="Multi-Outcome" sublabel="Up to 4 options" />
            <HighlightChip icon={<Code />} label="Open Source" sublabel="Fully audited" />
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════
          HOW IT WORKS — Steps
          ═══════════════════════════════════ */}
      <section className="relative py-24 z-10">
        <div className="divider mb-24" />

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            className="text-center mb-16"
          >
            <p className="section-header mb-4">Getting Started</p>
            <h2 className="text-display-sm lg:text-display-md text-white">
              Four Steps to{' '}
              <span className="gradient-text">Private Predictions</span>
            </h2>
          </motion.div>

          <div className="space-y-6">
            {[
              { num: '01', title: 'Connect Wallet', desc: 'Link your Shield Wallet for private transactions on Aleo', icon: Wallet },
              { num: '02', title: 'Browse Markets', desc: 'Explore prediction markets across crypto, politics, sports & more', icon: BarChart3 },
              { num: '03', title: 'Place Encrypted Bets', desc: 'Your position is hidden with zero-knowledge proofs — no one sees your bet', icon: Lock },
              { num: '04', title: 'Claim Winnings', desc: 'Privately collect payouts when markets resolve. Fully on-chain.', icon: Zap },
            ].map((step, i) => (
              <motion.div
                key={step.num}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ delay: i * 0.1, duration: 0.5 }}
                className="group flex items-start gap-6 p-5 rounded-2xl transition-all duration-300 hover:bg-surface-900/30"
                style={{ border: '1px solid transparent' }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = 'rgba(124, 58, 237, 0.12)'}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = 'transparent'}
              >
                {/* Step Number */}
                <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-brand-500/10 flex items-center justify-center group-hover:bg-brand-500/15 transition-colors" style={{ border: '1px solid rgba(124, 58, 237, 0.18)' }}>
                  <span className="font-display text-lg font-bold text-brand-400">{step.num}</span>
                </div>

                {/* Content */}
                <div className="flex-1 pt-1">
                  <h3 className="text-heading-sm text-white mb-1 group-hover:text-brand-300 transition-colors">
                    {step.title}
                  </h3>
                  <p className="text-body-sm text-surface-400 leading-relaxed">
                    {step.desc}
                  </p>
                </div>

                {/* Icon */}
                <div className="hidden sm:flex flex-shrink-0 w-10 h-10 items-center justify-center text-surface-600 group-hover:text-brand-400 transition-colors">
                  <step.icon className="w-5 h-5" />
                </div>
              </motion.div>
            ))}
          </div>

          {/* Bottom CTA */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mt-12"
          >
            <button
              onClick={handleConnectClick}
              className="btn-primary inline-flex items-center gap-3 text-base px-8 py-4 group"
            >
              <span>Connect & Start</span>
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════════════════════
          FOOTER
          ═══════════════════════════════════ */}
      <footer className="relative z-10 py-12">
        <div className="divider mb-12" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="Veiled Markets" className="h-8 w-8 object-cover rounded-lg" />
              <span className="font-display text-sm font-semibold text-surface-400">
                <span className="text-white">Veiled</span> Markets
              </span>
            </div>
            <p className="text-xs text-surface-500">
              © 2026 Veiled Markets · Built on Aleo · Open Source
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}

// ═══════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════

function TrustPill({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-semibold text-surface-300"
      style={{ background: 'rgba(14, 10, 31, 0.6)', border: '1px solid rgba(48, 40, 71, 0.4)' }}
    >
      <span className="text-brand-400">{icon}</span>
      <span>{text}</span>
    </div>
  )
}

function StatChip({ value, label, icon, delay }: { value: string; label: string; icon: React.ReactNode; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5 }}
      className="rounded-xl p-4 text-center"
      style={{
        background: 'rgba(14, 10, 31, 0.6)',
        border: '1px solid rgba(48, 40, 71, 0.4)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <div className="flex items-center justify-center gap-1.5 mb-2 text-brand-400">
        {icon}
        <span className="text-[10px] font-semibold text-surface-500 uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-xl font-display font-bold text-white">{value}</div>
    </motion.div>
  )
}

function FeatureCard({
  icon, title, description, accentColor, delay = 0
}: {
  icon: React.ReactNode; title: string; description: string;
  accentColor: 'brand' | 'accent' | 'yes'; delay?: number
}) {
  const colorMap = {
    brand: { icon: 'text-brand-400', bg: 'rgba(124, 58, 237, 0.1)', border: 'rgba(124, 58, 237, 0.15)', glow: 'rgba(124, 58, 237, 0.06)' },
    accent: { icon: 'text-accent-400', bg: 'rgba(20, 200, 191, 0.1)', border: 'rgba(20, 200, 191, 0.15)', glow: 'rgba(20, 200, 191, 0.06)' },
    yes: { icon: 'text-yes-400', bg: 'rgba(16, 185, 129, 0.1)', border: 'rgba(16, 185, 129, 0.15)', glow: 'rgba(16, 185, 129, 0.06)' },
  }
  const c = colorMap[accentColor]

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ delay, duration: 0.5 }}
      className="group relative p-8 rounded-2xl transition-all duration-300"
      style={{
        background: 'rgba(14, 10, 31, 0.5)',
        border: `1px solid rgba(48, 40, 71, 0.4)`,
        backdropFilter: 'blur(8px)',
        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.02)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = c.border
        e.currentTarget.style.background = `linear-gradient(135deg, ${c.glow}, rgba(14, 10, 31, 0.5))`
        e.currentTarget.style.boxShadow = `inset 0 1px 0 rgba(255, 255, 255, 0.02), 0 8px 32px rgba(0, 0, 0, 0.3)`
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'rgba(48, 40, 71, 0.4)'
        e.currentTarget.style.background = 'rgba(14, 10, 31, 0.5)'
        e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255, 255, 255, 0.02)'
      }}
    >
      <div className={cn(
        'w-12 h-12 rounded-xl flex items-center justify-center mb-5 transition-transform group-hover:scale-110',
        c.icon
      )} style={{ background: c.bg, border: `1px solid ${c.border}` }}>
        {icon}
      </div>
      <h3 className="text-heading-sm text-white mb-2 group-hover:text-brand-300 transition-colors">
        {title}
      </h3>
      <p className="text-body-sm text-surface-400 leading-relaxed">
        {description}
      </p>
    </motion.div>
  )
}

function HighlightChip({ icon, label, sublabel }: { icon: React.ReactNode; label: string; sublabel: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="flex items-center gap-3 p-4 rounded-xl"
      style={{
        background: 'rgba(14, 10, 31, 0.4)',
        border: '1px solid rgba(48, 40, 71, 0.3)',
      }}
    >
      <div className="w-8 h-8 rounded-lg bg-brand-500/10 flex items-center justify-center text-brand-400 flex-shrink-0">
        {icon}
      </div>
      <div>
        <p className="text-sm font-semibold text-white leading-tight">{label}</p>
        <p className="text-[11px] text-surface-500">{sublabel}</p>
      </div>
    </motion.div>
  )
}
