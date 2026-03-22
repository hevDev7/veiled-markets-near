import { motion } from 'framer-motion'
import { Wallet, BarChart3, Lock, Zap, Target, ArrowRight } from 'lucide-react'

const steps = [
  {
    num: '01',
    icon: Wallet,
    title: 'Connect Wallet',
    description: 'Link your Shield Wallet for private transactions on the Aleo blockchain.',
  },
  {
    num: '02',
    icon: Target,
    title: 'Browse Markets',
    description: 'Explore prediction markets across crypto, politics, sports & more.',
  },
  {
    num: '03',
    icon: Lock,
    title: 'Place Encrypted Bets',
    description: 'Your position is hidden with zero-knowledge proofs — no one sees your bet.',
  },
  {
    num: '04',
    icon: Zap,
    title: 'Claim Winnings',
    description: 'Privately collect payouts when markets resolve. Fully on-chain.',
  },
]

export function HowItWorks() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0" style={{ background: 'rgba(17, 20, 27, 0.5)' }} />

      <div className="relative max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-28">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-brand-400 mb-4">
            Getting Started
          </p>
          <h2 className="font-display text-[2.5rem] lg:text-[3rem] leading-[1.1] tracking-tight text-white mb-3">
            How It Works
          </h2>
          <p className="text-surface-400 max-w-lg mx-auto">
            From prediction to profit in four simple steps
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
          {steps.map((step, i) => (
            <motion.div
              key={step.num}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="relative"
            >
              {/* Connector line */}
              {i < 3 && (
                <div className="hidden lg:block absolute top-10 left-[calc(100%+8px)] w-[calc(100%-80px)] h-px bg-gradient-to-r from-white/[0.06] to-transparent" />
              )}

              <div
                className="rounded-2xl p-6 h-full"
                style={{
                  background: 'linear-gradient(135deg, rgba(22, 26, 36, 0.8) 0%, rgba(13, 15, 20, 0.9) 100%)',
                  border: '1px solid rgba(255, 255, 255, 0.04)',
                  boxShadow: '0 1px 0 0 rgba(255, 255, 255, 0.02) inset, 0 4px 20px -4px rgba(0, 0, 0, 0.4)',
                }}
              >
                <div className="flex items-center gap-3 mb-5">
                  <span className="text-xs font-mono text-brand-400/50">{step.num}</span>
                  <div className="w-10 h-10 rounded-xl bg-brand-400/[0.06] border border-brand-400/[0.1] flex items-center justify-center">
                    <step.icon className="w-5 h-5 text-brand-400" />
                  </div>
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">
                  {step.title}
                </h3>
                <p className="text-sm text-surface-400 leading-relaxed">
                  {step.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
