import { motion } from 'framer-motion'
import { Shield, Eye, Lock, ArrowRight, Wallet, Terminal, Code, Zap } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useWalletStore } from '@/lib/store'
import { useWalletModal } from '@provablehq/aleo-wallet-adaptor-react-ui'
import { cn } from '@/lib/utils'

// Sequential typing animation hook
function useSequentialTyping(texts: string[], speed: number = 80, pauseBetween: number = 300) {
  const [displayedTexts, setDisplayedTexts] = useState<string[]>(texts.map(() => ''))
  const [currentLineIndex, setCurrentLineIndex] = useState(0)
  const [currentCharIndex, setCurrentCharIndex] = useState(0)
  const [isComplete, setIsComplete] = useState(false)

  useEffect(() => {
    // All lines completed
    if (currentLineIndex >= texts.length) {
      setIsComplete(true)
      return
    }

    const currentText = texts[currentLineIndex]

    // Current line completed
    if (currentCharIndex >= currentText.length) {
      // Pause before next line
      const pauseTimer = setTimeout(() => {
        setCurrentLineIndex(prev => prev + 1)
        setCurrentCharIndex(0)
      }, pauseBetween)

      return () => clearTimeout(pauseTimer)
    }

    // Type next character
    const typingTimer = setTimeout(() => {
      setDisplayedTexts(prev => {
        const newTexts = [...prev]
        newTexts[currentLineIndex] = currentText.slice(0, currentCharIndex + 1)
        return newTexts
      })
      setCurrentCharIndex(prev => prev + 1)
    }, speed)

    return () => clearTimeout(typingTimer)
  }, [currentLineIndex, currentCharIndex, texts, speed, pauseBetween])

  return { displayedTexts, currentIndex: currentLineIndex, isComplete }
}

// Sequential Terminal Component
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
        // Line complete, pause then move to next
        setTimeout(() => {
          setDisplayedLines(prev => [...prev, currentLine.text])
          setCurrentText('')
          setCurrentLineIndex(prev => prev + 1)
        }, 300) // 300ms pause between lines
      }
    }, 30) // 30ms per character

    return () => clearInterval(typingTimer)
  }, [currentLineIndex, lines])

  return (
    <>
      {/* Completed lines */}
      {displayedLines.map((text, index) => (
        <div key={index} className="flex items-start gap-2">
          {lines[index].prompt && (
            <span className="text-brand-400">{lines[index].prompt}</span>
          )}
          <span className={lines[index].color || 'text-surface-300'}>{text}</span>
        </div>
      ))}

      {/* Current typing line */}
      {currentLineIndex < lines.length && (
        <div className="flex items-start gap-2">
          {lines[currentLineIndex].prompt && (
            <span className="text-brand-400">{lines[currentLineIndex].prompt}</span>
          )}
          <span className={lines[currentLineIndex].color || 'text-surface-300'}>
            {currentText}
            {showCursor && <span className="animate-pulse">|</span>}
          </span>
        </div>
      )}

      {/* Ready message after all complete */}
      {allComplete && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="flex items-center gap-2 text-brand-400 pt-2"
        >
          <Terminal className="w-4 h-4 animate-pulse" />
          <span>Ready for next command...</span>
        </motion.div>
      )}
    </>
  )
}

export function Landing() {
  const navigate = useNavigate()
  const { wallet } = useWalletStore()
  const { setVisible } = useWalletModal()

  // Sequential typing animation for hero text
  const heroTexts = ['Predict.', 'Bet.', 'Stay Hidden.']
  const typing = useSequentialTyping(heroTexts, 80, 200)

  // Terminal lines data
  const terminalLines = [
    { prompt: '$', text: 'aleo connect --wallet shield', color: 'text-surface-300' },
    { text: '✓ Wallet connected: aleo1...', color: 'text-yes-400' },
    { prompt: '$', text: 'veiled bet --market 0x4f2a --amount 100 --side YES', color: 'text-surface-300' },
    { text: '⚡ Generating zero-knowledge proof...', color: 'text-accent-400' },
    { text: '✓ Bet placed privately', color: 'text-yes-400' },
    { text: '🔒 Your position: ENCRYPTED', color: 'text-brand-400' },
    { text: '📊 Market odds updated: 67% YES', color: 'text-surface-400' },
  ]

  // Redirect to dashboard if already connected
  useEffect(() => {
    if (wallet.connected) {
      navigate('/dashboard')
    }
  }, [wallet.connected, navigate])

  const handleConnectClick = () => {
    setVisible(true)
  }

  // Don't render if already connected (will redirect)
  if (wallet.connected) {
    return null
  }

  return (
    <div className="min-h-screen bg-surface-950 relative overflow-hidden">
      {/* Animated Grid Background */}
      <div className="fixed inset-0 z-0">
        <div className="absolute inset-0" style={{
          backgroundImage: `
            linear-gradient(rgba(139, 92, 246, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(139, 92, 246, 0.03) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px',
          maskImage: 'radial-gradient(ellipse 80% 50% at 50% 50%, black, transparent)',
          WebkitMaskImage: 'radial-gradient(ellipse 80% 50% at 50% 50%, black, transparent)'
        }} />

        {/* Floating orbs */}
        <motion.div
          animate={{
            x: [0, 100, 0],
            y: [0, -100, 0],
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className="absolute top-20 left-1/4 w-64 h-64 bg-brand-500/10 rounded-full blur-[100px]"
        />
        <motion.div
          animate={{
            x: [0, -100, 0],
            y: [0, 100, 0],
          }}
          transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
          className="absolute bottom-20 right-1/4 w-80 h-80 bg-accent-500/10 rounded-full blur-[120px]"
        />
      </div>

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-40">
        <div className="absolute inset-0 bg-surface-950/60 backdrop-blur-xl border-b border-brand-500/10" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 md:h-20">
            {/* Logo */}
            <motion.div
              className="flex items-center gap-3"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5 }}
            >
              <div className="relative">
                <img
                  src="/logo.png"
                  alt="Veiled Markets"
                  className="h-10 w-10 object-cover rounded-xl"
                />
              </div>
              <div className="hidden sm:block">
                <h1 className="font-display text-xl font-bold" style={{ letterSpacing: '0.02em' }}>
                  <span className="gradient-text">Veiled</span>
                  <span className="text-white"> Markets</span>
                </h1>
                <p className="text-[10px] text-surface-500 tracking-widest uppercase">
                  Private Predictions
                </p>
              </div>
            </motion.div>

            {/* Launch App Button */}
            <motion.button
              onClick={handleConnectClick}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5 }}
              className={cn(
                'flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm',
                'bg-gradient-to-r from-brand-600 to-brand-500',
                'hover:from-brand-500 hover:to-brand-400',
                'shadow-lg shadow-brand-500/25 hover:shadow-xl hover:shadow-brand-500/30',
                'transition-all duration-200 group'
              )}
            >
              <Wallet className="w-4 h-4" />
              <span>Launch App</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </motion.button>
          </div>
        </div>
      </header>

      {/* Hero Section - Terminal Style */}
      <section className="relative flex items-center justify-center pt-24 pb-12 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <div className="grid lg:grid-cols-2 gap-12 items-center">

            {/* Left: Terminal Window */}
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
              className="order-2 lg:order-1"
            >
              <div className="bg-surface-900/80 backdrop-blur-xl rounded-2xl border border-brand-500/20 overflow-hidden shadow-2xl">
                {/* Terminal Header */}
                <div className="bg-surface-800/50 px-4 py-3 flex items-center gap-2 border-b border-brand-500/10">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-no-500" />
                    <div className="w-3 h-3 rounded-full bg-amber-500" />
                    <div className="w-3 h-3 rounded-full bg-yes-500" />
                  </div>
                  <span className="text-xs text-surface-400 font-mono ml-2">veiled_markets_v16.aleo</span>
                </div>

                {/* Terminal Content */}
                <div className="p-6 font-mono text-sm space-y-3 min-h-[280px]">
                  <SequentialTerminal lines={terminalLines} />
                </div>
              </div>

              {/* Stats Below Terminal */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.8 }}
                className="mt-4 grid grid-cols-3 gap-3"
              >
                <StatCard value="$2.4M+" label="Volume" icon={<Zap className="w-4 h-4" />} />
                <StatCard value="1,234" label="Markets" icon={<Eye className="w-4 h-4" />} />
                <StatCard value="100%" label="Private" icon={<Lock className="w-4 h-4" />} />
              </motion.div>
            </motion.div>

            {/* Right: Hero Text */}
            <motion.div
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
              className="order-1 lg:order-2 text-center lg:text-left"
            >
              {/* Badge */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-500/10 border border-brand-500/20 mb-6"
              >
                <Code className="w-4 h-4 text-brand-400" />
                <span className="text-sm font-medium text-brand-300">
                  Zero-Knowledge • Aleo Blockchain
                </span>
              </motion.div>

              <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight mb-6 leading-tight">
                <span className="text-white inline-block min-h-[1.2em]">
                  {typing.displayedTexts[0]}
                  {typing.currentIndex === 0 && <span className="animate-pulse">|</span>}
                </span>
                <br />
                {typing.currentIndex >= 1 && (
                  <span className="text-white inline-block min-h-[1.2em]">
                    {typing.displayedTexts[1]}
                    {typing.currentIndex === 1 && <span className="animate-pulse">|</span>}
                  </span>
                )}
                <br />
                {typing.currentIndex >= 2 && (
                  <span className="gradient-text inline-block min-h-[1.2em]">
                    {typing.displayedTexts[2]}
                    {typing.currentIndex === 2 && !typing.isComplete && <span className="animate-pulse">|</span>}
                  </span>
                )}
              </h1>

              <p className="text-lg sm:text-xl text-surface-400 mb-8 leading-relaxed max-w-xl mx-auto lg:mx-0">
                The first prediction market where your bets are <span className="text-brand-400 font-semibold">cryptographically private</span>.
                No tracking. No manipulation. Pure market intelligence.
              </p>

              {/* Feature Pills */}
              <div className="flex flex-wrap justify-center lg:justify-start gap-3 mb-8">
                <FeaturePill icon={<Shield />} text="MEV Protected" />
                <FeaturePill icon={<Eye />} text="Hidden Positions" />
                <FeaturePill icon={<Lock />} text="Anonymous" />
              </div>

              {/* Supported Wallets */}
              <div className="flex items-center justify-center lg:justify-start gap-3 text-surface-500 text-sm">
                <span>Supports:</span>
                <span className="text-surface-400">Shield Wallet</span>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Features Section - Bento Grid */}
      <section className="relative py-16 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
              Privacy-First Architecture
            </h2>
            <p className="text-lg text-surface-400 max-w-2xl mx-auto">
              Built on Aleo's zero-knowledge infrastructure
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <BentoCard
              title="Hidden Positions"
              description="Your bet amount and side stay encrypted on-chain. Only you can decrypt your position."
              icon={<Eye className="w-8 h-8" />}
              gradient="from-brand-500/20 to-brand-600/20"
              delay={0.1}
            />
            <BentoCard
              title="MEV Protected"
              description="Zero front-running. Your transactions are invisible until confirmed."
              icon={<Shield className="w-8 h-8" />}
              gradient="from-accent-500/20 to-accent-600/20"
              delay={0.2}
            />
            <BentoCard
              title="Anonymous Betting"
              description="No wallet tracking. Express beliefs without social pressure."
              icon={<Lock className="w-8 h-8" />}
              gradient="from-yes-500/20 to-yes-600/20"
              delay={0.3}
            />
          </div>
        </div>
      </section>

      {/* How It Works - Minimal */}
      <section className="relative py-16 border-t border-surface-800/30 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
              How It Works
            </h2>
            <p className="text-lg text-surface-400">
              Four simple steps to private predictions
            </p>
          </motion.div>

          <div className="space-y-8">
            {[
              { num: '01', title: 'Connect', desc: 'Link your Shield Wallet' },
              { num: '02', title: 'Browse', desc: 'Explore prediction markets across multiple categories' },
              { num: '03', title: 'Bet', desc: 'Place encrypted bets with zero-knowledge proofs' },
              { num: '04', title: 'Claim', desc: 'Privately collect your winnings when markets resolve' },
            ].map((step, i) => (
              <motion.div
                key={step.num}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="flex items-center gap-8 group"
              >
                <div className="text-6xl font-bold text-brand-500/20 group-hover:text-brand-500/40 transition-colors font-mono w-24 flex-shrink-0">
                  {step.num}
                </div>
                <div className="flex-1 border-l-2 border-brand-500/20 pl-8 py-4">
                  <h3 className="text-2xl font-bold text-white mb-2">{step.title}</h3>
                  <p className="text-surface-400">{step.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative border-t border-surface-800/30 py-8 z-10">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-sm text-surface-500 font-mono">
            © 2026 Veiled Markets • Built on Aleo • Open Source
          </p>
        </div>
      </footer>

    </div>
  )
}

// Stat Card Component
function StatCard({
  value,
  label,
  icon
}: {
  value: string
  label: string
  icon: React.ReactNode
}) {
  return (
    <div className="bg-surface-800/40 backdrop-blur-sm rounded-xl p-5 border border-brand-500/10 hover:border-brand-500/20 transition-colors">
      <div className="flex items-center gap-2 mb-3 text-brand-400">
        {icon}
        <span className="text-xs font-medium text-surface-500 uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-3xl font-bold text-white font-mono">{value}</div>
    </div>
  )
}

// Feature Pill Component
function FeaturePill({
  icon,
  text
}: {
  icon: React.ReactNode
  text: string
}) {
  return (
    <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-surface-800/50 border border-surface-700/50 text-surface-300 text-sm">
      <div className="w-4 h-4 text-brand-400 flex-shrink-0 flex items-center justify-center">
        {icon}
      </div>
      <span className="leading-none">{text}</span>
    </div>
  )
}

// Bento Card Component
function BentoCard({
  title,
  description,
  icon,
  gradient,
  delay = 0
}: {
  title: string
  description: string
  icon: React.ReactNode
  gradient: string
  delay?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay }}
      className="group relative bg-surface-900/50 backdrop-blur-sm rounded-2xl p-8 border border-surface-800/50 hover:border-brand-500/30 transition-all duration-300"
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient} rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
      <div className="relative">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500/20 to-accent-500/20 flex items-center justify-center mb-6 text-brand-400 group-hover:scale-110 transition-transform">
          {icon}
        </div>
        <h3 className="text-2xl font-bold text-white mb-3 group-hover:text-brand-300 transition-colors">
          {title}
        </h3>
        <p className="text-base text-surface-400 leading-relaxed">
          {description}
        </p>
      </div>
    </motion.div>
  )
}
