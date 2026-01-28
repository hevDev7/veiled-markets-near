import { motion } from 'framer-motion'
import { Shield, Eye, Lock, ArrowRight, Sparkles } from 'lucide-react'

export function Hero() {
  return (
    <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0">
        {/* Gradient orbs */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-brand-500/20 rounded-full blur-[120px] animate-pulse-slow" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-accent-500/20 rounded-full blur-[100px] animate-pulse-slow" style={{ animationDelay: '2s' }} />

        {/* Grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `
              linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
            `,
            backgroundSize: '60px 60px'
          }}
        />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20">
        <div className="text-center">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-500/10 border border-brand-500/20 mb-8"
          >
            <Sparkles className="w-4 h-4 text-brand-400" />
            <span className="text-sm font-medium text-brand-300">
              Built on Aleo • Zero-Knowledge Privacy
            </span>
          </motion.div>

          {/* Main Heading */}
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="font-display text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold tracking-tight mb-6"
          >
            <span className="text-white">Predict Freely.</span>
            <br />
            <span className="gradient-text">Bet Privately.</span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="max-w-2xl mx-auto text-lg sm:text-xl text-surface-400 mb-10"
          >
            The first prediction market where your bets are truly private.
            No front-running, no whale tracking, no social pressure.
            Just pure market wisdom.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16"
          >
            <a href="#markets" className="btn-primary flex items-center gap-2 text-lg px-8 py-4">
              <span>Explore Markets</span>
              <ArrowRight className="w-5 h-5" />
            </a>
            <a href="#learn" className="btn-secondary flex items-center gap-2 text-lg px-8 py-4">
              <span>How It Works</span>
            </a>
          </motion.div>

          {/* Feature Cards */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto"
          >
            <FeatureCard
              icon={<Eye className="w-6 h-6" />}
              title="Hidden Positions"
              description="Your bet amount and side stay encrypted. Only you know your position."
              gradient="from-brand-500 to-brand-600"
            />
            <FeatureCard
              icon={<Shield className="w-6 h-6" />}
              title="MEV Protected"
              description="No front-running or sandwich attacks. Your order is invisible to bots."
              gradient="from-accent-500 to-accent-600"
            />
            <FeatureCard
              icon={<Lock className="w-6 h-6" />}
              title="Anonymous Betting"
              description="Express your true beliefs without social pressure or judgment."
              gradient="from-yes-500 to-yes-600"
            />
          </motion.div>
        </div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-8 text-center"
        >
          <StatItem value="$2.4M+" label="Total Volume" />
          <StatItem value="1,234" label="Active Markets" />
          <StatItem value="8,567" label="Private Bets" />
          <StatItem value="100%" label="ZK Protected" />
        </motion.div>
      </div>
    </section>
  )
}

function FeatureCard({
  icon,
  title,
  description,
  gradient
}: {
  icon: React.ReactNode
  title: string
  description: string
  gradient: string
}) {
  return (
    <div className="glass-card p-6 text-left group hover:border-brand-500/30 transition-all duration-300">
      <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center mb-4 shadow-lg`}>
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-white mb-2 group-hover:text-brand-300 transition-colors">
        {title}
      </h3>
      <p className="text-sm text-surface-400">
        {description}
      </p>
    </div>
  )
}

function StatItem({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="stat-value gradient-text">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  )
}

