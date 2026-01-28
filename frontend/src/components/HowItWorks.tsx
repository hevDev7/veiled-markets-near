import { motion } from 'framer-motion'
import { Wallet, MousePointer, Shield, Trophy, ArrowRight, CheckCircle2 } from 'lucide-react'

const steps = [
  {
    number: '01',
    icon: Wallet,
    title: 'Connect Wallet',
    description: 'Link your Aleo wallet to access the protocol. Your wallet address remains private in all transactions.',
    color: 'brand',
  },
  {
    number: '02',
    icon: MousePointer,
    title: 'Choose a Market',
    description: 'Browse prediction markets across categories. View aggregated odds without seeing individual positions.',
    color: 'accent',
  },
  {
    number: '03',
    icon: Shield,
    title: 'Place Private Bet',
    description: 'Your bet amount and position are encrypted using zero-knowledge proofs. Nobody can see your bet.',
    color: 'yes',
  },
  {
    number: '04',
    icon: Trophy,
    title: 'Claim Winnings',
    description: 'When the market resolves, claim your winnings privately. Even your payout remains confidential.',
    color: 'brand',
  },
]

const privacyFeatures = [
  'Bet amounts are encrypted on-chain',
  'Your position (Yes/No) is hidden from everyone',
  'No front-running or MEV attacks possible',
  'Claim winnings without revealing profit',
  'Zero-knowledge proofs verify correctness',
  'Only aggregated pool data is public',
]

export function HowItWorks() {
  return (
    <section id="learn" className="py-24 px-4 sm:px-6 lg:px-8 relative">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-brand-950/20 to-transparent" />
      
      <div className="relative max-w-7xl mx-auto">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="font-display text-4xl sm:text-5xl font-bold text-white mb-4">
            How It Works
          </h2>
          <p className="text-lg text-surface-400 max-w-2xl mx-auto">
            Four simple steps to start betting privately on prediction markets
          </p>
        </motion.div>

        {/* Steps */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-20">
          {steps.map((step, index) => (
            <motion.div
              key={step.number}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="relative"
            >
              {/* Connector Line */}
              {index < steps.length - 1 && (
                <div className="hidden lg:block absolute top-16 left-full w-full h-px bg-gradient-to-r from-surface-700 to-transparent z-0" />
              )}
              
              <div className="glass-card p-6 h-full relative z-10">
                {/* Step Number */}
                <div className="text-6xl font-display font-bold text-surface-800 absolute top-4 right-4">
                  {step.number}
                </div>
                
                {/* Icon */}
                <div className={`w-14 h-14 rounded-2xl bg-${step.color}-500/10 border border-${step.color}-500/20 flex items-center justify-center mb-4`}>
                  <step.icon className={`w-7 h-7 text-${step.color}-400`} />
                </div>
                
                {/* Content */}
                <h3 className="text-xl font-semibold text-white mb-2">
                  {step.title}
                </h3>
                <p className="text-surface-400 text-sm">
                  {step.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Privacy Explainer */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="glass-card p-8 md:p-12"
        >
          <div className="grid md:grid-cols-2 gap-10 items-center">
            {/* Left - Visual */}
            <div className="relative">
              <div className="aspect-square max-w-md mx-auto relative">
                {/* Central Shield */}
                <motion.div
                  animate={{ 
                    boxShadow: [
                      '0 0 40px rgba(139, 92, 246, 0.3)',
                      '0 0 60px rgba(139, 92, 246, 0.5)',
                      '0 0 40px rgba(139, 92, 246, 0.3)',
                    ]
                  }}
                  transition={{ duration: 3, repeat: Infinity }}
                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 rounded-3xl bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center"
                >
                  <Shield className="w-16 h-16 text-white" />
                </motion.div>
                
                {/* Orbiting Elements */}
                {[0, 1, 2, 3].map((i) => (
                  <motion.div
                    key={i}
                    className="absolute w-12 h-12 rounded-xl bg-surface-800 border border-surface-700 flex items-center justify-center"
                    style={{
                      top: `${50 + 40 * Math.sin((i * Math.PI) / 2)}%`,
                      left: `${50 + 40 * Math.cos((i * Math.PI) / 2)}%`,
                      transform: 'translate(-50%, -50%)',
                    }}
                    animate={{
                      scale: [1, 1.1, 1],
                      opacity: [0.5, 1, 0.5],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      delay: i * 0.5,
                    }}
                  >
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-brand-400 to-accent-400" />
                  </motion.div>
                ))}
                
                {/* Connection Lines */}
                <svg className="absolute inset-0 w-full h-full" style={{ transform: 'rotate(45deg)' }}>
                  <circle
                    cx="50%"
                    cy="50%"
                    r="35%"
                    fill="none"
                    stroke="url(#gradient)"
                    strokeWidth="1"
                    strokeDasharray="5 5"
                    opacity="0.3"
                  />
                  <defs>
                    <linearGradient id="gradient">
                      <stop offset="0%" stopColor="#8b5cf6" />
                      <stop offset="100%" stopColor="#06b6d4" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
            </div>

            {/* Right - Content */}
            <div>
              <h3 className="text-3xl font-display font-bold text-white mb-4">
                True Privacy with <span className="gradient-text">Zero-Knowledge Proofs</span>
              </h3>
              <p className="text-surface-400 mb-6">
                Veiled Markets uses Aleo's cutting-edge zero-knowledge cryptography to ensure your bets are completely private while still being verifiable and fair.
              </p>
              
              <div className="space-y-3">
                {privacyFeatures.map((feature, index) => (
                  <motion.div
                    key={feature}
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.1 }}
                    className="flex items-center gap-3"
                  >
                    <CheckCircle2 className="w-5 h-5 text-yes-400 flex-shrink-0" />
                    <span className="text-surface-300">{feature}</span>
                  </motion.div>
                ))}
              </div>

              <motion.a
                href="#markets"
                whileHover={{ x: 5 }}
                className="inline-flex items-center gap-2 mt-8 text-brand-400 hover:text-brand-300 font-medium"
              >
                <span>Start Betting Privately</span>
                <ArrowRight className="w-4 h-4" />
              </motion.a>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

