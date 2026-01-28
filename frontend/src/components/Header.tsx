import { motion } from 'framer-motion'
import {
  Shield,
  Wallet,
  ChevronDown,
  LogOut,
  ExternalLink,
  Copy,
  Check
} from 'lucide-react'
import { useState } from 'react'
import { useWalletStore } from '@/lib/store'
import { cn, shortenAddress, formatCredits } from '@/lib/utils'

export function Header() {
  const { wallet, connect, disconnect } = useWalletStore()
  const [isConnecting, setIsConnecting] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleConnect = async () => {
    setIsConnecting(true)
    try {
      await connect('puzzle')
    } finally {
      setIsConnecting(false)
    }
  }

  const handleCopy = () => {
    if (wallet.address) {
      navigator.clipboard.writeText(wallet.address)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50">
      {/* Backdrop blur */}
      <div className="absolute inset-0 bg-surface-950/80 backdrop-blur-xl border-b border-surface-800/50" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 md:h-20">
          {/* Logo */}
          <motion.a
            href="/"
            className="flex items-center gap-3 group"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
          >
            {/* Logo Image */}
            <div className="relative">
              <img
                src="/logo.png"
                alt="Veiled Markets"
                className="h-10 w-10 object-cover rounded-xl"
              />
            </div>

            {/* Logo Text */}
            <div className="hidden sm:block">
              <h1 className="font-display text-xl font-bold" style={{ letterSpacing: '0.02em' }}>
                <span className="gradient-text">Veiled</span>
                <span className="text-white"> Markets</span>
              </h1>
              <p className="text-[10px] text-surface-500 tracking-widest uppercase">
                Private Predictions
              </p>
            </div>
          </motion.a>

          {/* Navigation */}
          <motion.nav
            className="hidden md:flex items-center gap-1"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            {['Markets', 'Create', 'Portfolio', 'Learn'].map((item, index) => (
              <a
                key={item}
                href={`#${item.toLowerCase()}`}
                className={cn(
                  'px-4 py-2 text-sm font-medium rounded-lg transition-colors',
                  index === 0
                    ? 'text-white bg-surface-800/50'
                    : 'text-surface-400 hover:text-white hover:bg-surface-800/30'
                )}
              >
                {item}
              </a>
            ))}
          </motion.nav>

          {/* Wallet Connection */}
          <motion.div
            className="flex items-center gap-3"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            {/* Privacy Badge */}
            <div className="hidden sm:flex privacy-indicator">
              <Shield className="w-3 h-3" />
              <span>ZK Protected</span>
            </div>

            {wallet.connected ? (
              <div className="relative">
                <button
                  onClick={() => setShowDropdown(!showDropdown)}
                  className={cn(
                    'flex items-center gap-3 px-4 py-2.5 rounded-xl',
                    'bg-surface-800/80 border border-surface-700/50',
                    'hover:border-brand-500/50 transition-all duration-200',
                    showDropdown && 'border-brand-500/50'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-yes-400 animate-pulse" />
                    <span className="text-sm font-medium text-white">
                      {shortenAddress(wallet.address || '', 4)}
                    </span>
                  </div>
                  <div className="h-4 w-px bg-surface-700" />
                  <span className="text-sm text-surface-400">
                    {formatCredits(wallet.balance.public + wallet.balance.private, 0)} <span className="text-xs">ALEO</span>
                  </span>
                  <ChevronDown className={cn(
                    'w-4 h-4 text-surface-400 transition-transform',
                    showDropdown && 'rotate-180'
                  )} />
                </button>

                {/* Dropdown */}
                {showDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 top-full mt-2 w-64 p-2 rounded-xl bg-surface-900 border border-surface-800 shadow-2xl"
                  >
                    <div className="p-3 border-b border-surface-800">
                      <p className="text-xs text-surface-500 mb-1">Connected Wallet</p>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-mono text-white truncate flex-1">
                          {wallet.address}
                        </span>
                        <button
                          onClick={handleCopy}
                          className="p-1.5 rounded-lg hover:bg-surface-800 transition-colors"
                        >
                          {copied ? (
                            <Check className="w-4 h-4 text-yes-400" />
                          ) : (
                            <Copy className="w-4 h-4 text-surface-400" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="p-1 mt-1">
                      <a
                        href={`https://testnet.explorer.provable.com/address/${wallet.address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-surface-300 hover:text-white hover:bg-surface-800/50 transition-colors"
                      >
                        <ExternalLink className="w-4 h-4" />
                        View on Explorer
                      </a>
                      <button
                        onClick={() => {
                          disconnect()
                          setShowDropdown(false)
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-no-400 hover:text-no-300 hover:bg-no-500/10 transition-colors"
                      >
                        <LogOut className="w-4 h-4" />
                        Disconnect
                      </button>
                    </div>
                  </motion.div>
                )}
              </div>
            ) : (
              <button
                onClick={handleConnect}
                disabled={isConnecting}
                className={cn(
                  'flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm',
                  'bg-gradient-to-r from-brand-600 to-brand-500',
                  'hover:from-brand-500 hover:to-brand-400',
                  'shadow-lg shadow-brand-500/25 hover:shadow-xl hover:shadow-brand-500/30',
                  'transition-all duration-200',
                  isConnecting && 'opacity-80 cursor-wait'
                )}
              >
                {isConnecting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Connecting...</span>
                  </>
                ) : (
                  <>
                    <Wallet className="w-4 h-4" />
                    <span>Connect Wallet</span>
                  </>
                )}
              </button>
            )}
          </motion.div>
        </div>
      </div>
    </header>
  )
}

