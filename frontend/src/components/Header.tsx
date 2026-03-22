import { motion } from 'framer-motion'
import {
  Shield,
  Wallet,
  ChevronDown,
  LogOut,
  ExternalLink,
  Copy,
  Check,
  ArrowRight,
  Search,
  Bell,
  Menu,
  X
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useWalletStore } from '@/lib/store'
import { cn, shortenAddress, formatCredits } from '@/lib/utils'
import { useWalletModal } from '@provablehq/aleo-wallet-adaptor-react-ui'

const NAV_ITEMS = [
  { path: '/dashboard', label: 'Markets' },
  { path: '/portfolio', label: 'Portfolio' },
  { path: '/governance', label: 'Govern' },
  { path: '/settings', label: 'Settings' },
]

export function Header() {
  const { wallet, disconnect } = useWalletStore()
  const [showDropdown, setShowDropdown] = useState(false)
  const [copied, setCopied] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const { setVisible } = useWalletModal()
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const handleCopy = () => {
    if (wallet.address) {
      navigator.clipboard.writeText(wallet.address)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <>
      <header
        className={cn(
          'fixed top-0 left-0 right-0 z-50 transition-all duration-500',
          scrolled
            ? 'bg-surface-950/90 backdrop-blur-xl border-b border-white/[0.04]'
            : 'bg-transparent'
        )}
      >
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 lg:h-[72px]">
            {/* Logo */}
            <motion.button
              onClick={() => navigate(wallet.connected ? '/dashboard' : '/')}
              className="flex items-center gap-3 group"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5 }}
            >
              <div className="relative w-9 h-9 rounded-xl overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-brand-400 to-brand-600" />
                <div className="absolute inset-[1px] bg-surface-950 rounded-[10px] flex items-center justify-center">
                  <img
                    src="/logo.png"
                    alt="Veiled"
                    className="w-6 h-6 object-contain"
                    onError={(e) => {
                      // Fallback to text if image fails
                      (e.target as HTMLElement).style.display = 'none'
                    }}
                  />
                  <span className="text-brand-400 font-display text-lg font-bold tracking-tight absolute opacity-0">V</span>
                </div>
              </div>
              <span className="font-display text-xl text-white tracking-tight hidden sm:block">
                <span className="gradient-text">Veiled</span>
                {' '}Markets
              </span>
            </motion.button>

            {/* Desktop Nav */}
            <nav className="hidden lg:flex items-center gap-1">
              {NAV_ITEMS.map((item) => {
                const isActive = location.pathname === item.path
                return (
                  <button
                    key={item.path}
                    onClick={() => navigate(item.path)}
                    className={cn(
                      'relative px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200',
                      isActive
                        ? 'text-white'
                        : 'text-surface-400 hover:text-white'
                    )}
                  >
                    {item.label}
                    {isActive && (
                      <motion.div
                        layoutId="nav-indicator"
                        className="absolute inset-0 rounded-lg bg-white/[0.06]"
                        transition={{ type: 'spring', duration: 0.4, bounce: 0 }}
                      />
                    )}
                  </button>
                )
              })}
            </nav>

            {/* Right section */}
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Privacy badge */}
              <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-brand-400 bg-brand-400/[0.06] border border-brand-400/[0.12]">
                <Shield className="w-3 h-3" />
                <span>ZK Protected</span>
              </div>

              {/* Notifications */}
              <button className="relative p-2.5 rounded-xl text-surface-400 hover:text-white hover:bg-white/[0.04] transition-all duration-200">
                <Bell className="w-[18px] h-[18px]" />
              </button>

              {/* Wallet */}
              {wallet.connected ? (
                <div className="relative">
                  <button
                    onClick={() => setShowDropdown(!showDropdown)}
                    className={cn(
                      'hidden sm:flex items-center gap-2.5 pl-3 pr-4 py-2 rounded-xl',
                      'bg-white/[0.04] border border-white/[0.06]',
                      'hover:bg-white/[0.06] transition-all duration-200',
                      showDropdown && 'border-brand-400/30'
                    )}
                  >
                    <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-yes-400/30 to-brand-400/30 flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-yes-400" />
                    </div>
                    <span className="text-sm font-medium text-white">
                      {shortenAddress(wallet.address || '', 4)}
                    </span>
                    <div className="h-4 w-px bg-white/[0.06]" />
                    <span className="text-xs text-surface-400 tabular-nums">
                      {formatCredits(wallet.balance.public + wallet.balance.private, 1)}
                    </span>
                    <ChevronDown className={cn(
                      'w-3.5 h-3.5 text-surface-500 transition-transform',
                      showDropdown && 'rotate-180'
                    )} />
                  </button>

                  {/* Dropdown */}
                  {showDropdown && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)} />
                      <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.96 }}
                        transition={{ type: 'spring', duration: 0.3, bounce: 0 }}
                        className="absolute right-0 top-full mt-2 w-72 p-2 rounded-2xl z-50"
                        style={{
                          background: 'linear-gradient(135deg, rgba(22, 26, 36, 0.95) 0%, rgba(13, 15, 20, 0.98) 100%)',
                          border: '1px solid rgba(255, 255, 255, 0.06)',
                          boxShadow: '0 8px 32px -8px rgba(0,0,0,0.5), 0 4px 8px -4px rgba(0,0,0,0.3)',
                          backdropFilter: 'blur(16px)',
                        }}
                      >
                        <div className="p-3 border-b border-white/[0.04]">
                          <p className="text-2xs text-surface-500 mb-1.5 uppercase tracking-wider font-semibold">
                            Connected Wallet
                          </p>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-white truncate flex-1">
                              {wallet.address}
                            </span>
                            <button
                              onClick={handleCopy}
                              aria-label="Copy address"
                              className="p-1.5 rounded-lg hover:bg-white/[0.04] transition-colors"
                            >
                              {copied ? (
                                <Check className="w-3.5 h-3.5 text-yes-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5 text-surface-400" />
                              )}
                            </button>
                          </div>
                          <div className="flex items-center gap-4 mt-3">
                            <div>
                              <p className="text-2xs text-surface-500">Public</p>
                              <p className="text-xs font-semibold text-white tabular-nums">
                                {formatCredits(wallet.balance.public, 2)}
                              </p>
                            </div>
                            <div className="h-6 w-px bg-white/[0.04]" />
                            <div>
                              <p className="text-2xs text-surface-500">Private</p>
                              <p className="text-xs font-semibold text-white tabular-nums">
                                {formatCredits(wallet.balance.private, 2)}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="p-1 mt-1 space-y-0.5">
                          <a
                            href={`https://testnet.explorer.provable.com/address/${wallet.address}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs text-surface-300 hover:text-white hover:bg-white/[0.04] transition-colors"
                          >
                            <ExternalLink className="w-4 h-4" />
                            View on Explorer
                          </a>
                          <button
                            onClick={() => {
                              disconnect()
                              setShowDropdown(false)
                              navigate('/')
                            }}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs text-no-400 hover:text-no-300 hover:bg-no-500/10 transition-colors"
                          >
                            <LogOut className="w-4 h-4" />
                            Disconnect
                          </button>
                        </div>
                      </motion.div>
                    </>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => setVisible(true)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm active:scale-[0.96] transition-all duration-200"
                  style={{
                    background: 'linear-gradient(135deg, #c9a84c 0%, #b8922e 100%)',
                    color: '#08090c',
                    boxShadow: '0 2px 8px rgba(201, 168, 76, 0.25), 0 0 20px -5px rgba(201, 168, 76, 0.3)',
                  }}
                >
                  <Wallet className="w-4 h-4" />
                  <span className="hidden sm:inline">Launch App</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}

              {/* Mobile menu toggle */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="lg:hidden p-2.5 rounded-xl text-surface-400 hover:text-white hover:bg-white/[0.04] transition-all duration-200"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile slide-out menu */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            transition={{ type: 'spring', duration: 0.4, bounce: 0 }}
            className="absolute right-0 top-0 bottom-0 w-72 bg-surface-900 border-l border-white/[0.04] p-6 pt-20"
          >
            <div className="flex flex-col gap-2">
              {NAV_ITEMS.map((item, i) => (
                <motion.button
                  key={item.path}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={() => { navigate(item.path); setMobileMenuOpen(false) }}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 rounded-xl text-left font-medium transition-all duration-200',
                    location.pathname === item.path
                      ? 'bg-white/[0.06] text-white'
                      : 'text-surface-400 hover:text-white hover:bg-white/[0.04]'
                  )}
                >
                  {item.label}
                </motion.button>
              ))}
            </div>
          </motion.div>
        </div>
      )}
    </>
  )
}
