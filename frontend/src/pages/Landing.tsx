import { motion, AnimatePresence } from 'framer-motion'
import { Shield, Eye, Lock, ArrowRight, Wallet, Zap, ChevronRight, BarChart3, Users, Globe, Code, Sparkles, Target, Clock, ArrowUpRight, TrendingUp } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useWalletStore, type Market } from '@/lib/store'
import { useRealMarketsStore } from '@/lib/market-store'
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react'
import { useWalletModal } from '@provablehq/aleo-wallet-adaptor-react-ui'
import { Network } from '@provablehq/aleo-types'
import { cn, formatCredits, formatPercentage, getCategoryName, getCategoryEmoji, getCategoryColor } from '@/lib/utils'
import { getLeadingOutcome, getMarketOutcomeSummaries } from '@/lib/market-outcomes'
import { TrendingMarkets } from '@/components/TrendingMarkets'
import { useLiveCountdown } from '@/hooks/useGlobalTicker'
import { getMarketThumbnail, isContainThumbnail } from '@/lib/market-thumbnails'

// ── Sequential Terminal Typing (preserved) ──
// ── Rotating Words (preserved) ──
function RotatingWords({ words, interval = 3000 }: { words: string[]; interval?: number }) {
  const [current, setCurrent] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setCurrent(prev => (prev + 1) % words.length), interval)
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
          className="gradient-text"
        >
          {words[current]}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}

const HERO_SLIDE_INTERVAL_MS = 7000

const heroDeckVariants = {
  enter: { opacity: 0, x: 28, scale: 0.985 } as const,
  center: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] },
  } as const,
  exit: {
    opacity: 0,
    x: -28,
    scale: 0.99,
    transition: { duration: 0.3, ease: [0.4, 0, 0.2, 1] },
  } as const,
}

function HeroFeaturedCard({ market }: { market: Market }) {
  const timeRemaining = useLiveCountdown(market.deadlineTimestamp, market.timeRemaining)
  const catColor = getCategoryColor(market.category)
  const thumbUrl = getMarketThumbnail(market.question, market.category, market.thumbnailUrl)
  const useContain = isContainThumbnail(thumbUrl)
  const outcomes = useMemo(() => getMarketOutcomeSummaries(market), [market])
  const leadingOutcome = useMemo(() => getLeadingOutcome(market), [market])

  return (
    <div className="landing-market-card relative rounded-2xl overflow-hidden">
      <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-bl from-brand-400/[0.03] to-transparent rounded-full blur-3xl" />

      <div className="relative p-6 lg:p-8">
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${catColor.text}`}
              style={{ background: 'rgba(255,255,255,0.03)' }}>
              {getCategoryEmoji(market.category)} {getCategoryName(market.category)}
            </span>
            {(market.tags?.includes('Hot') || market.tags?.includes('Trending') || market.tags?.includes('Featured')) && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-brand-400 bg-brand-500/8">
                <Zap className="w-3 h-3" />
                Hot
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-yes-500/10">
            <div className="w-1.5 h-1.5 rounded-full bg-yes-400 animate-pulse" />
            <span className="text-[10px] font-semibold text-yes-400 uppercase tracking-wider">Live</span>
          </div>
        </div>

        <div className="flex gap-3 mb-6">
          <div className={`w-11 h-11 rounded-xl overflow-hidden shrink-0 bg-surface-800 ${useContain ? 'p-1.5 flex items-center justify-center' : ''}`}>
            <img src={thumbUrl} alt="" className={`w-full h-full ${useContain ? 'object-contain' : 'object-cover'}`} loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
          </div>
          <h3 className="font-display text-xl lg:text-2xl font-bold text-white leading-snug">
            {market.question}
          </h3>
        </div>

        <div className="flex items-baseline gap-2 mb-4">
          <span className={cn('text-3xl font-display font-bold tabular-nums', leadingOutcome?.styles.text || 'text-white')}>
            {formatPercentage(leadingOutcome?.percentage ?? 0)}
          </span>
          <span className="text-sm text-surface-400">
            {leadingOutcome ? `${leadingOutcome.label} lead` : 'probability'}
          </span>
        </div>

        <div className="w-full h-1.5 rounded-full bg-surface-700/40 overflow-hidden mb-6 flex">
          {outcomes.map((outcome) => (
            <div
              key={outcome.outcome}
              className={cn('h-full transition-all duration-700', outcome.styles.bar)}
              style={{ width: `${outcome.percentage}%` }}
            />
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 mb-6">
          {outcomes.map((outcome) => (
            <div
              key={outcome.outcome}
              className={cn(
                'flex items-center justify-between px-4 py-3 rounded-xl border',
                outcome.styles.bg,
                outcome.styles.border
              )}
            >
              <span className="text-xs font-medium text-surface-300 truncate pr-2">{outcome.label}</span>
              <span className={cn('text-sm font-bold tabular-nums', outcome.styles.text)}>
                {formatPercentage(outcome.percentage)}
              </span>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-4 pt-5 text-surface-500">
          <div className="flex items-center gap-1.5 text-surface-500">
            <BarChart3 className="w-3.5 h-3.5" />
            <span className="text-xs tabular-nums">{formatCredits(market.totalVolume, 0)} {market.tokenType ?? 'ALEO'}</span>
          </div>
          <div className="flex items-center gap-1.5 text-surface-500">
            <Users className="w-3.5 h-3.5" />
            <span className="text-xs tabular-nums">{market.totalBets}</span>
          </div>
          <div className="ml-auto flex items-center gap-1.5 text-surface-500">
            <Clock className="w-3.5 h-3.5" />
            <span className="text-xs">{timeRemaining}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function HeroCompactCard({ market }: { market: Market }) {
  const timeRemaining = useLiveCountdown(market.deadlineTimestamp, market.timeRemaining)
  const leadingOutcome = useMemo(() => getLeadingOutcome(market), [market])

  return (
    <div className="landing-market-card rounded-xl p-4 transition-all duration-300">
      <p className="text-sm font-semibold text-white line-clamp-1 mb-3">
        {market.question}
      </p>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xs text-surface-500 flex items-center gap-1 tabular-nums">
            <TrendingUp className="w-3 h-3" />
            {formatCredits(market.totalVolume, 0)} vol
          </span>
          <span className="text-xs text-surface-600">·</span>
          <span className="text-xs text-surface-500 tabular-nums">{timeRemaining}</span>
        </div>
        <div className="text-right">
          <p className={cn('text-[10px] font-semibold uppercase tracking-wider', leadingOutcome?.styles.text || 'text-surface-400')}>
            {leadingOutcome?.label || 'Lead'}
          </p>
          <span className={cn('text-lg font-display font-bold tabular-nums', leadingOutcome?.styles.text || 'text-white')}>
            {formatPercentage(leadingOutcome?.percentage ?? 0)}
          </span>
        </div>
      </div>
    </div>
  )
}

function HeroCompactCards({ markets }: { markets: Market[] }) {
  const compactMarkets = markets.slice(0, 2)
  const placeholderCount = Math.max(0, 2 - compactMarkets.length)

  return (
    <div className="grid grid-cols-2 gap-3">
      {compactMarkets.map((market) => (
        <HeroCompactCard key={market.id} market={market} />
      ))}

      {Array.from({ length: placeholderCount }, (_, index) => (
        <div key={`hero-placeholder-${index}`} className="landing-market-card rounded-xl p-4 opacity-60">
          <p className="text-sm font-semibold text-surface-300">
            More markets coming soon
          </p>
          <p className="mt-2 text-xs leading-6 text-surface-500">
            This spot will fill automatically as more trending markets appear.
          </p>
        </div>
      ))}
    </div>
  )
}

function HeroTrendingSlider() {
  const { markets, fetchMarkets, isLoading } = useRealMarketsStore()
  const [currentSlide, setCurrentSlide] = useState(0)

  useEffect(() => {
    if (markets.length === 0) void fetchMarkets()
  }, [markets.length, fetchMarkets])

  const heroMarkets = useMemo(() => {
    const active = markets.filter(m => m.status === 1 && m.timeRemaining !== 'Ended')
    const tagged = active
      .filter(m => m.tags?.includes('Hot') || m.tags?.includes('Trending') || m.tags?.includes('Featured'))
      .sort((a, b) => Number(b.totalVolume - a.totalVolume))
    const untagged = active
      .filter(m => !m.tags?.includes('Hot') && !m.tags?.includes('Trending') && !m.tags?.includes('Featured'))
      .sort((a, b) => Number(b.totalVolume - a.totalVolume))

    return [...tagged, ...untagged].slice(0, 6)
  }, [markets])

  useEffect(() => {
    if (heroMarkets.length === 0) {
      setCurrentSlide(0)
      return
    }

    if (currentSlide >= heroMarkets.length) {
      setCurrentSlide(0)
    }
  }, [currentSlide, heroMarkets.length])

  useEffect(() => {
    if (heroMarkets.length <= 1) return

    const interval = window.setInterval(() => {
      setCurrentSlide(prev => (prev + 1) % heroMarkets.length)
    }, HERO_SLIDE_INTERVAL_MS)

    return () => window.clearInterval(interval)
  }, [heroMarkets.length])

  const visibleMarkets = useMemo(() => {
    if (heroMarkets.length === 0) return []
    const count = Math.min(heroMarkets.length, 3)
    return Array.from({ length: count }, (_, offset) => heroMarkets[(currentSlide + offset) % heroMarkets.length])
  }, [currentSlide, heroMarkets])

  const featuredMarket = visibleMarkets[0] ?? null
  const compactMarkets = visibleMarkets.slice(1)

  if (isLoading && heroMarkets.length === 0) {
    return (
      <div className="space-y-4">
        <div className="landing-market-card rounded-2xl p-6 lg:p-8 animate-pulse">
          <div className="h-4 bg-surface-700 rounded w-1/4 mb-6" />
          <div className="h-6 bg-surface-700 rounded w-3/4 mb-6" />
          <div className="h-8 bg-surface-700 rounded w-1/3 mb-6" />
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="h-12 bg-surface-800 rounded-xl" />
            <div className="h-12 bg-surface-800 rounded-xl" />
          </div>
          <div className="flex gap-4"><div className="h-3 bg-surface-800 rounded w-16" /><div className="h-3 bg-surface-800 rounded w-16" /></div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {[0, 1].map((item) => (
            <div key={item} className="landing-market-card rounded-xl p-4 animate-pulse">
              <div className="h-4 bg-surface-700 rounded w-3/4 mb-3" />
              <div className="h-3 bg-surface-800 rounded w-1/2" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (heroMarkets.length === 0) {
    return (
      <div className="landing-market-card rounded-2xl p-8 text-left">
        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-brand-300/70">
          Hero Spotlight
        </p>
        <h3 className="mt-3 font-display text-2xl font-bold text-white">
          Trending markets will appear here
        </h3>
        <p className="mt-3 max-w-xl text-sm leading-7 text-surface-400">
          Once live markets have enough activity, the landing hero will rotate through the three strongest signals automatically.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <AnimatePresence initial={false} mode="wait">
        <motion.div
          key={visibleMarkets.map(m => m.id).join('-')}
          variants={heroDeckVariants}
          initial="enter"
          animate="center"
          exit="exit"
          className="space-y-4"
        >
          {featuredMarket && <HeroFeaturedCard market={featuredMarket} />}
          <HeroCompactCards markets={compactMarkets} />
        </motion.div>
      </AnimatePresence>

      <div className="flex items-center justify-center gap-2">
        {heroMarkets.map((market, index) => (
          <button
            key={market.id}
            type="button"
            onClick={() => setCurrentSlide(index)}
            className={`h-1.5 rounded-full transition-all duration-300 ${index === currentSlide ? 'w-8 bg-brand-400' : 'w-2 bg-white/[0.18] hover:bg-white/[0.28]'}`}
            aria-label={`Go to hero market ${index + 1}`}
          />
        ))}
      </div>
    </div>
  )
}

const stagger = {
  hidden: { opacity: 0 } as const,
  show: { opacity: 1, transition: { staggerChildren: 0.08 } } as const,
}
const fadeUp = {
  hidden: { opacity: 0, y: 20 } as const,
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } } as const,
}

// ═══════════════════════════════════════════
// LANDING PAGE — Premium Redesign
// ═══════════════════════════════════════════
export function Landing() {
  const navigate = useNavigate()
  const { wallet } = useWalletStore()
  const { connected: providerConnected, connecting, selectWallet, connect } = useWallet() as any
  const { setVisible } = useWalletModal()
  const [connectError, setConnectError] = useState<string | null>(null)

  const isConnected = wallet.connected || providerConnected

  useEffect(() => {
    if (isConnected) {
      setVisible(false)
      // Redirect to app subdomain after wallet connect
      window.location.href = 'https://app.veiledmarkets.xyz/dashboard'
    }
  }, [isConnected, setVisible])

  const handleConnectClick = useCallback(async () => {
    setConnectError(null)
    try {
      const hasShield = !!(window as any).shield
      if (hasShield) {
        selectWallet('Shield Wallet')
        await connect(Network.TESTNET)
      } else {
        setVisible(true)
      }
    } catch (err: any) {
      console.error('[Landing] Connect failed:', err)
      setConnectError(err?.message || 'Connection failed')
      setVisible(true)
    }
  }, [connecting, selectWallet, connect, setVisible])

  if (isConnected) return null

  return (
    <div className="min-h-screen bg-surface-950 relative overflow-hidden">

      {/* ── Background ── */}
      <div className="fixed inset-0 z-0">
        {/* Mesh gradient */}
        <div className="absolute inset-0"
          style={{
            background: `
              radial-gradient(ellipse at 20% 0%, rgba(201, 168, 76, 0.06) 0%, transparent 50%),
              radial-gradient(ellipse at 80% 100%, rgba(0, 220, 130, 0.04) 0%, transparent 50%),
              radial-gradient(ellipse at 50% 50%, #0d0f14 0%, #08090c 100%)
            `
          }}
        />
        {/* Grid */}
        <div className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
            backgroundSize: '64px 64px',
          }}
        />
        {/* Accent glow */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] rounded-full bg-brand-400/[0.03] blur-[120px]" />
        {/* Diagonal lines */}
        <div className="absolute top-0 right-0 w-[600px] h-[600px] opacity-[0.015]"
          style={{ backgroundImage: 'repeating-linear-gradient(-45deg, rgba(201,168,76,1) 0, rgba(201,168,76,1) 1px, transparent 0, transparent 40px)' }}
        />
        {/* Noise */}
        <div className="absolute inset-0 opacity-[0.015]"
          style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")" }}
        />
      </div>

      {/* ── Header ── */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-surface-950/60 backdrop-blur-xl border-b border-white/[0.04]">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 lg:h-[72px]">
            <div className="flex items-center gap-3">
              <div className="relative w-10 h-10 rounded-xl overflow-hidden">
                <img src="/logo.png" alt="Veiled" className="w-10 h-10 object-cover rounded-xl" />
              </div>
              <span className="font-display text-xl text-white tracking-tight hidden sm:block">
                <span className="gradient-text">Veiled</span> Markets
              </span>
            </div>
            <nav className="hidden md:flex items-center gap-1">
              {['Protocol', 'Markets', 'Docs'].map((item) => (
                <a key={item} href={`#${item.toLowerCase()}`}
                  className="px-4 py-2 text-sm font-medium text-surface-400 hover:text-white rounded-lg hover:bg-white/[0.04] transition-all duration-200">
                  {item}
                </a>
              ))}
            </nav>
            <button onClick={handleConnectClick} disabled={connecting}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm active:scale-[0.96] transition-all duration-200 disabled:opacity-50"
              style={{
                background: 'linear-gradient(135deg, #c9a84c 0%, #b8922e 100%)',
                color: '#08090c',
                boxShadow: '0 2px 8px rgba(201, 168, 76, 0.25), 0 0 20px -5px rgba(201, 168, 76, 0.3)',
              }}>
              <Wallet className="w-4 h-4" />
              <span>{connecting ? 'Connecting...' : 'Launch App'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* ═══════ HERO ═══════ */}
      <section className="relative z-10">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 pt-32 pb-12 w-full">
          <div className="grid lg:grid-cols-12 gap-12 lg:gap-16 items-center">
            {/* Left — Copy */}
            <motion.div className="lg:col-span-5" variants={stagger} initial="hidden" animate="show">
              {/* Badge */}
              <motion.div variants={fadeUp} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-400/[0.06] mb-5">
                <Sparkles className="w-3.5 h-3.5 text-brand-400" />
                <span className="text-xs font-semibold text-brand-400">Live on Aleo Testnet</span>
              </motion.div>

              <motion.h1 variants={fadeUp} className="font-display text-[3.25rem] lg:text-[4rem] leading-[1.05] tracking-tight text-white mb-6">
                Predict the Future.
                <br />
                <RotatingWords words={['Stay Anonymous.', 'Stay Hidden.', 'Stay Private.']} />
              </motion.h1>

              <motion.p variants={fadeUp} className="text-lg text-surface-400 leading-relaxed mb-8 max-w-lg">
                The first prediction market where your positions are{' '}
                <span className="text-brand-300 font-semibold">cryptographically invisible</span>.
                Built on Aleo with zero-knowledge proofs.
              </motion.p>

              <motion.div variants={fadeUp} className="flex items-center gap-4 mb-8">
                <button onClick={handleConnectClick} disabled={connecting}
                  className="flex items-center gap-3 px-7 py-3.5 rounded-xl font-semibold text-sm active:scale-[0.96] transition-all duration-200 group disabled:opacity-50"
                  style={{
                    background: 'linear-gradient(135deg, #c9a84c 0%, #b8922e 100%)',
                    color: '#08090c',
                    boxShadow: '0 2px 8px rgba(201, 168, 76, 0.25), 0 0 20px -5px rgba(201, 168, 76, 0.3)',
                  }}>
                  <Wallet className="w-5 h-5" />
                  <span>{connecting ? 'Connecting...' : 'Start Predicting'}</span>
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </button>
                <a href="#protocol" className="btn-secondary px-6 py-3.5 text-sm flex items-center gap-2">
                  How It Works <ChevronRight className="w-4 h-4" />
                </a>
              </motion.div>

              {connectError && (
                <p className="text-no-400 text-sm mb-4">{connectError}</p>
              )}

              {/* Trust pills */}
              <motion.div variants={fadeUp} className="flex flex-wrap items-center gap-3">
                {[
                  { icon: <Shield className="w-3.5 h-3.5" />, text: 'MEV Protected' },
                  { icon: <Eye className="w-3.5 h-3.5" />, text: 'Hidden Bets' },
                  { icon: <Lock className="w-3.5 h-3.5" />, text: 'ZK Proofs' },
                ].map((pill) => (
                  <div key={pill.text} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold text-surface-300 bg-white/[0.02]">
                    <span className="text-brand-400">{pill.icon}</span>
                    <span>{pill.text}</span>
                  </div>
                ))}
              </motion.div>
            </motion.div>

            {/* Right — Hero Market Cards */}
            <motion.div className="lg:col-span-7"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.7, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}>
              <div className="relative">
                {/* Glow */}
                <div className="absolute -inset-4 bg-gradient-to-br from-brand-400/[0.03] via-transparent to-transparent rounded-3xl blur-3xl" />

                <div className="relative space-y-4">
                  <HeroTrendingSlider />
                </div>
              </div>
            </motion.div>
          </div>
        </div>

        {/* Scroll indicator */}
        <motion.div className="flex justify-center mt-8 mb-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }}>
          <div className="w-5 h-8 rounded-full border border-white/[0.1] flex items-start justify-center p-1.5">
            <motion.div className="w-1 h-1.5 rounded-full bg-brand-400"
              animate={{ y: [0, 8, 0] }} transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }} />
          </div>
        </motion.div>
      </section>

      {/* ═══════ FEATURES — Bento Grid ═══════ */}
      <section id="protocol" className="relative py-24 z-10">
        <div className="absolute left-1/2 -translate-x-1/2 w-[600px] h-px bg-gradient-to-r from-transparent via-brand-400/20 to-transparent mb-24" />

        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 pt-8">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-16">
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-brand-400 mb-4">Privacy-First Architecture</p>
            <h2 className="font-display text-[2.5rem] lg:text-[3rem] leading-[1.1] tracking-tight text-white">
              Your Predictions.{' '}<span className="gradient-text">Your Secret.</span>
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-5">
            {[
              { icon: <Eye className="w-6 h-6" />, title: 'Hidden Positions', desc: 'Bet amounts and outcomes stay encrypted on-chain. Only you hold the decryption key.', color: '#c9a84c' },
              { icon: <Shield className="w-6 h-6" />, title: 'MEV Protected', desc: 'Transactions are invisible until confirmed. Zero front-running. Zero manipulation.', color: '#00dc82' },
              { icon: <Lock className="w-6 h-6" />, title: 'Anonymous Trading', desc: 'No wallet tracking. No social pressure. Express your genuine beliefs freely.', color: '#c9a84c' },
            ].map((f, i) => (
              <motion.div key={f.title} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                className="group relative p-8 rounded-2xl transition-all duration-300 hover:border-white/[0.08]"
                style={{
                  background: 'linear-gradient(135deg, rgba(22, 26, 36, 0.25) 0%, rgba(13, 15, 20, 0.3) 100%)',
                  border: '1px solid rgba(255, 255, 255, 0.04)',
                  boxShadow: '0 1px 0 0 rgba(255, 255, 255, 0.02) inset, 0 4px 20px -4px rgba(0, 0, 0, 0.4)',
                  backdropFilter: 'blur(14px)',
                  WebkitBackdropFilter: 'blur(14px)',
                }}>
                <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-5 transition-transform group-hover:scale-110"
                  style={{ background: `${f.color}10`, border: `1px solid ${f.color}20`, color: f.color }}>
                  {f.icon}
                </div>
                <h3 className="text-lg font-semibold text-white mb-2 group-hover:text-brand-300 transition-colors">{f.title}</h3>
                <p className="text-sm text-surface-400 leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>

          {/* Protocol highlights */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 lg:mt-5">
            {[
              { icon: <BarChart3 className="w-4 h-4" />, label: 'FPMM', sub: 'Market Maker' },
              { icon: <Users className="w-4 h-4" />, label: 'Dual Token', sub: 'ALEO + USDCX' },
              { icon: <Globe className="w-4 h-4" />, label: 'Multi-Outcome', sub: 'Up to 4 options' },
              { icon: <Code className="w-4 h-4" />, label: 'Open Source', sub: 'Fully audited' },
            ].map((h) => (
              <div key={h.label} className="flex items-center gap-3 p-4 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                <div className="w-8 h-8 rounded-lg bg-brand-400/[0.08] flex items-center justify-center text-brand-400 flex-shrink-0">{h.icon}</div>
                <div>
                  <p className="text-sm font-semibold text-white leading-tight">{h.label}</p>
                  <p className="text-[11px] text-surface-500">{h.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════ TRENDING MARKETS ═══════ */}
      <TrendingMarkets />

      {/* ═══════ HOW IT WORKS ═══════ */}
      <section className="relative py-24 z-10">
        <div className="absolute left-1/2 -translate-x-1/2 w-[600px] h-px bg-gradient-to-r from-transparent via-brand-400/20 to-transparent" />
        <div className="relative bg-surface-850/50 py-20 mt-8">
          <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-16">
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-brand-400 mb-4">Getting Started</p>
              <h2 className="font-display text-[2.5rem] lg:text-[3rem] leading-[1.1] tracking-tight text-white">
                From Prediction to{' '}<span className="gradient-text">Profit</span>
              </h2>
              <p className="text-surface-400 mt-3">Four simple steps to private predictions</p>
            </motion.div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
              {[
                { step: '01', icon: Wallet, title: 'Connect Wallet', desc: 'Link your Shield Wallet for private transactions on Aleo' },
                { step: '02', icon: Target, title: 'Browse Markets', desc: 'Explore prediction markets across crypto, politics, sports & more' },
                { step: '03', icon: Lock, title: 'Place Encrypted Bets', desc: 'Your position is hidden with ZK proofs — no one sees your bet' },
                { step: '04', icon: Zap, title: 'Claim Winnings', desc: 'Privately collect payouts when markets resolve. Fully on-chain.' },
              ].map((s, i) => (
                <motion.div key={s.step} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }} transition={{ delay: i * 0.1 }} className="relative">
                  {i < 3 && (
                    <div className="hidden lg:block absolute top-10 left-[calc(100%+8px)] w-[calc(100%-80px)] h-px bg-gradient-to-r from-white/[0.06] to-transparent" />
                  )}
                  <div className="rounded-2xl p-6 h-full"
                    style={{
                      background: 'linear-gradient(135deg, rgba(22, 26, 36, 0.25) 0%, rgba(13, 15, 20, 0.3) 100%)',
                      border: '1px solid rgba(255, 255, 255, 0.04)',
                      boxShadow: '0 1px 0 0 rgba(255, 255, 255, 0.02) inset, 0 4px 20px -4px rgba(0, 0, 0, 0.4)',
                      backdropFilter: 'blur(14px)',
                      WebkitBackdropFilter: 'blur(14px)',
                    }}>
                    <div className="flex items-center gap-3 mb-5">
                      <span className="text-xs font-mono text-brand-400/50">{s.step}</span>
                      <div className="w-10 h-10 rounded-xl bg-brand-400/[0.06] border border-brand-400/[0.1] flex items-center justify-center">
                        <s.icon className="w-5 h-5 text-brand-400" />
                      </div>
                    </div>
                    <h3 className="text-lg font-semibold text-white mb-2">{s.title}</h3>
                    <p className="text-sm text-surface-400 leading-relaxed">{s.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══════ CTA ═══════ */}
      <section className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-20 z-10 relative">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
          className="relative rounded-3xl p-12 lg:p-16 text-center overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, rgba(28, 33, 48, 0.3) 0%, rgba(17, 20, 27, 0.35) 100%)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            boxShadow: '0 8px 32px -8px rgba(0,0,0,0.5), 0 4px 8px -4px rgba(0,0,0,0.3)',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
          }}>
          <div className="absolute inset-0 bg-gradient-to-br from-brand-400/[0.04] via-transparent to-yes-400/[0.02]" />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-px bg-gradient-to-r from-transparent via-brand-400/30 to-transparent" />
          <div className="relative z-10">
            <h2 className="font-display text-[2.5rem] lg:text-[3rem] leading-[1.1] tracking-tight text-white mb-4">
              Ready to predict the future?
            </h2>
            <p className="text-lg text-surface-400 max-w-lg mx-auto mb-10">
              Join the first privacy-preserving prediction market. Your bets stay hidden.
            </p>
            <div className="flex items-center justify-center gap-4">
              <button onClick={handleConnectClick}
                className="flex items-center gap-3 px-8 py-4 rounded-xl font-semibold text-base active:scale-[0.96] transition-all duration-200 group"
                style={{
                  background: 'linear-gradient(135deg, #c9a84c 0%, #b8922e 100%)',
                  color: '#08090c',
                  boxShadow: '0 2px 8px rgba(201, 168, 76, 0.25), 0 0 30px -5px rgba(201, 168, 76, 0.3)',
                }}>
                Start Trading <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
              <a href="#" className="btn-secondary px-8 py-4 text-base flex items-center gap-2">
                Read Docs <ArrowUpRight className="w-4 h-4" />
              </a>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ═══════ FOOTER ═══════ */}
      <footer className="relative z-10 py-12 border-t border-white/[0.04]">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="relative w-9 h-9 rounded-xl overflow-hidden">
                <img src="/logo.png" alt="Veiled" className="w-9 h-9 object-cover rounded-xl" />
              </div>
              <span className="font-display text-sm font-semibold text-surface-400">
                <span className="text-white">Veiled</span> Markets
              </span>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-yes-400 animate-pulse" />
                <span className="text-xs text-surface-500">All systems operational</span>
              </div>
              <p className="text-xs text-surface-600">© 2026 Veiled Markets · Built on Aleo</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
