import { motion } from 'framer-motion'
import {
  Shield,
  ChevronDown,
  LogOut,
  ExternalLink,
  Copy,
  Check,
  LayoutDashboard,
  TrendingUp,
  History,
  Settings,
  Gamepad2,
  RefreshCw,
  Menu,
  X,
  Vote,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react'
import { useWalletStore } from '@/lib/store'
import { cn, shortenAddress, formatCredits } from '@/lib/utils'

const navItems = [
  { name: 'Markets', href: '/dashboard', icon: LayoutDashboard },
  { name: 'My Bets', href: '/bets', icon: TrendingUp },
  { name: 'History', href: '/history', icon: History },
  { name: 'Governance', href: '/governance', icon: Vote },
]

export function DashboardHeader() {
  const navigate = useNavigate()
  const location = useLocation()
  const { wallet, refreshBalance } = useWalletStore()
  const { disconnect: providerDisconnect } = useWallet()
  const [showDropdown, setShowDropdown] = useState(false)
  const [showMobileMenu, setShowMobileMenu] = useState(false)
  const [copied, setCopied] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    setShowMobileMenu(false)
  }, [location.pathname])

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showDropdown) return
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-wallet-dropdown]')) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showDropdown])

  const handleCopy = () => {
    if (wallet.address) {
      navigator.clipboard.writeText(wallet.address)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleRefreshBalance = async () => {
    setRefreshing(true)
    try {
      await refreshBalance()
    } finally {
      setRefreshing(false)
    }
  }

  const handleDisconnect = async () => {
    try {
      await providerDisconnect()
    } catch (e) {
      console.error('Disconnect error:', e)
    }
    setShowDropdown(false)
    navigate('/')
  }

  const totalBalance = wallet.balance.public + wallet.balance.private

  return (
    <header className="fixed top-0 left-0 right-0 z-50">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-surface-950/70 backdrop-blur-2xl" style={{ borderBottom: '1px solid rgba(48, 40, 71, 0.3)' }} />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 lg:h-18">
          {/* Logo + Nav */}
          <div className="flex items-center gap-8">
            <Link to="/dashboard" className="flex items-center gap-3 group">
              <img
                src="/logo.png"
                alt="Veiled Markets"
                className="h-9 w-9 object-cover rounded-xl transition-transform group-hover:scale-105"
              />
              <div className="hidden sm:block">
                <h1 className="font-display text-lg font-bold tracking-tight">
                  <span className="gradient-text">Veiled</span>
                  <span className="text-white"> Markets</span>
                </h1>
              </div>
            </Link>

            {/* Navigation */}
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => {
                const isActive = location.pathname === item.href
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={cn(
                      'flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all duration-200',
                      isActive
                        ? 'text-white bg-surface-800/70'
                        : 'text-surface-400 hover:text-white hover:bg-surface-800/40'
                    )}
                    style={isActive ? { boxShadow: 'inset 0 0 0 1px rgba(48, 40, 71, 0.5)' } : undefined}
                  >
                    <item.icon className="w-4 h-4" />
                    {item.name}
                  </Link>
                )
              })}
            </nav>
          </div>

          {/* Right Side */}
          <div className="flex items-center gap-2.5">
            {/* Demo Mode */}
            {wallet.isDemoMode && (
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold"
                style={{ background: 'rgba(20, 200, 191, 0.08)', border: '1px solid rgba(20, 200, 191, 0.15)', color: '#67e8f9' }}
              >
                <Gamepad2 className="w-3 h-3" />
                <span>Demo</span>
              </div>
            )}

            {/* Network Badge */}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-surface-400"
              style={{ background: 'rgba(14, 10, 31, 0.5)', border: '1px solid rgba(48, 40, 71, 0.3)' }}
            >
              <div className={cn(
                'w-1.5 h-1.5 rounded-full animate-pulse',
                wallet.network === 'mainnet' ? 'bg-yes-400' : 'bg-accent-400'
              )} />
              <span className="capitalize">{wallet.network}</span>
            </div>

            {/* Privacy Badge */}
            <div className="hidden lg:flex privacy-indicator">
              <Shield className="w-3 h-3" />
              <span>ZK</span>
            </div>

            {/* Mobile Menu */}
            <button
              onClick={() => setShowMobileMenu(!showMobileMenu)}
              className="md:hidden p-2 rounded-lg text-surface-400 hover:text-white hover:bg-surface-800/40 transition-colors"
            >
              {showMobileMenu ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            {/* Wallet Button */}
            <div className="relative" data-wallet-dropdown>
              <button
                onClick={() => setShowDropdown(!showDropdown)}
                className={cn(
                  'flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl transition-all duration-200',
                  showDropdown
                    ? 'bg-surface-800/80'
                    : 'bg-surface-800/50 hover:bg-surface-800/70'
                )}
                style={{ border: `1px solid ${showDropdown ? 'rgba(124, 58, 237, 0.3)' : 'rgba(48, 40, 71, 0.4)'}` }}
              >
                <div className="flex items-center gap-2">
                  <div className={cn(
                    'w-2 h-2 rounded-full animate-pulse',
                    wallet.isDemoMode ? 'bg-accent-400' : 'bg-yes-400'
                  )} />
                  <span className="text-sm font-semibold text-white">
                    {shortenAddress(wallet.address || '', 4)}
                  </span>
                </div>
                <div className="h-4 w-px bg-surface-700/50" />
                <span className="text-sm text-surface-400 tabular-nums">
                  {formatCredits(totalBalance, 1)} <span className="text-xs text-surface-500">ALEO</span>
                </span>
                <ChevronDown className={cn(
                  'w-3.5 h-3.5 text-surface-500 transition-transform duration-200',
                  showDropdown && 'rotate-180'
                )} />
              </button>

              {/* Dropdown */}
              {showDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-2 w-80 rounded-xl p-1.5 shadow-elevated-lg z-50"
                  style={{
                    background: 'rgba(14, 10, 31, 0.95)',
                    backdropFilter: 'blur(20px)',
                    border: '1px solid rgba(48, 40, 71, 0.6)',
                  }}
                >
                  {/* Demo Warning */}
                  {wallet.isDemoMode && (
                    <div className="mx-1 mb-1.5 p-3 rounded-lg"
                      style={{ background: 'rgba(20, 200, 191, 0.06)', border: '1px solid rgba(20, 200, 191, 0.12)' }}
                    >
                      <div className="flex items-center gap-2 text-accent-400 text-sm font-semibold mb-1">
                        <Gamepad2 className="w-4 h-4" />
                        Demo Mode
                      </div>
                      <p className="text-xs text-surface-400">
                        Connect a real wallet for actual transactions on Aleo.
                      </p>
                    </div>
                  )}

                  {/* Wallet Info */}
                  <div className="p-3" style={{ borderBottom: '1px solid rgba(48, 40, 71, 0.5)' }}>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-xs text-surface-500">
                        {wallet.walletType === 'puzzle' && '🧩 Puzzle'}
                        {wallet.walletType === 'leo' && '🦁 Leo'}
                        {wallet.walletType === 'shield' && '🛡️ Shield'}
                        {wallet.walletType === 'fox' && '🦊 Fox'}
                        {wallet.walletType === 'soter' && '🛡️ Soter'}
                        {wallet.walletType === 'demo' && '🎮 Demo'}
                      </p>
                      <span className={cn(
                        'text-[10px] font-semibold px-2 py-0.5 rounded-md uppercase tracking-wider',
                        wallet.network === 'mainnet'
                          ? 'bg-yes-500/10 text-yes-400'
                          : 'bg-accent-500/10 text-accent-400'
                      )}>
                        {wallet.network}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono text-surface-300 truncate flex-1">
                        {wallet.address}
                      </span>
                      <button
                        onClick={handleCopy}
                        className="p-1.5 rounded-lg hover:bg-surface-800/60 transition-colors flex-shrink-0"
                      >
                        {copied ? (
                          <Check className="w-3.5 h-3.5 text-yes-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5 text-surface-400" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Balance Card */}
                  <div className="p-3 m-1.5 rounded-xl" style={{
                    background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.06), rgba(20, 200, 191, 0.04))',
                    border: '1px solid rgba(124, 58, 237, 0.12)',
                  }}>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs text-surface-400 font-medium">Total Balance</p>
                      <button
                        onClick={handleRefreshBalance}
                        disabled={refreshing}
                        className="p-1 rounded-md hover:bg-surface-800/40 transition-colors"
                      >
                        <RefreshCw className={cn(
                          'w-3.5 h-3.5 text-surface-500',
                          refreshing && 'animate-spin'
                        )} />
                      </button>
                    </div>
                    <p className="text-2xl font-display font-bold text-white mb-3 tabular-nums">
                      {formatCredits(totalBalance)} <span className="text-sm text-surface-400 font-sans font-medium">ALEO</span>
                    </p>

                    <div className="pt-3 space-y-1.5" style={{ borderTop: '1px solid rgba(48, 40, 71, 0.3)' }}>
                      <div className="flex justify-between items-center">
                        <p className="text-xs text-surface-500">Public</p>
                        <p className="text-sm font-medium text-surface-200 tabular-nums">
                          {formatCredits(wallet.balance.public)} ALEO
                        </p>
                      </div>
                      {wallet.balance.private > 0n ? (
                        <div className="flex justify-between items-center">
                          <p className="text-xs text-surface-500">Private</p>
                          <p className="text-sm font-medium text-surface-200 tabular-nums">
                            {formatCredits(wallet.balance.private)} ALEO
                          </p>
                        </div>
                      ) : wallet.walletType === 'shield' ? (
                        <p className="text-[10px] text-surface-500 mt-1.5 leading-relaxed">
                          Private balance detection not yet supported by Shield Wallet.
                        </p>
                      ) : null}
                      {/* USDCX Balances */}
                      <div className="flex justify-between items-center">
                        <p className="text-xs text-surface-500">USDCX (Public)</p>
                        <p className="text-sm font-medium text-surface-200 tabular-nums">
                          {formatCredits(wallet.balance.usdcxPublic)} USDCX
                        </p>
                      </div>
                      <div className="flex justify-between items-center">
                        <p className="text-xs text-surface-500">USDCX (Private)</p>
                        <p className="text-sm font-medium text-surface-200 tabular-nums">
                          {formatCredits(wallet.balance.usdcxPrivate)} USDCX
                        </p>
                      </div>
                      {/* USAD Balances */}
                      <div className="flex justify-between items-center">
                        <p className="text-xs text-surface-500">USAD (Public)</p>
                        <p className="text-sm font-medium text-surface-200 tabular-nums">
                          {formatCredits(wallet.balance.usadPublic)} USAD
                        </p>
                      </div>
                      <div className="flex justify-between items-center">
                        <p className="text-xs text-surface-500">USAD (Private)</p>
                        <p className="text-sm font-medium text-surface-200 tabular-nums">
                          {formatCredits(wallet.balance.usadPrivate)} USAD
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Menu */}
                  <div className="p-1 mt-0.5" style={{ borderTop: '1px solid rgba(48, 40, 71, 0.5)' }}>
                    <Link
                      to="/settings"
                      onClick={() => setShowDropdown(false)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-surface-300 hover:text-white hover:bg-surface-800/40 transition-colors"
                    >
                      <Settings className="w-4 h-4" />
                      Settings
                    </Link>
                    {!wallet.isDemoMode && (
                      <a
                        href={`https://testnet.explorer.provable.com/address/${wallet.address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-surface-300 hover:text-white hover:bg-surface-800/40 transition-colors"
                      >
                        <ExternalLink className="w-4 h-4" />
                        View on Explorer
                      </a>
                    )}
                    <button
                      onClick={handleDisconnect}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-no-400 hover:text-no-300 hover:bg-no-500/8 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      {wallet.isDemoMode ? 'Exit Demo' : 'Disconnect'}
                    </button>
                  </div>
                </motion.div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {showMobileMenu && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="md:hidden absolute top-full left-0 right-0 p-4"
          style={{
            background: 'rgba(2, 6, 23, 0.95)',
            backdropFilter: 'blur(20px)',
            borderBottom: '1px solid rgba(48, 40, 71, 0.4)',
          }}
        >
          <nav className="space-y-1">
            {navItems.map((item) => {
              const isActive = location.pathname === item.href
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={() => setShowMobileMenu(false)}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors',
                    isActive
                      ? 'text-white bg-surface-800/60'
                      : 'text-surface-400 hover:text-white hover:bg-surface-800/30'
                  )}
                >
                  <item.icon className="w-5 h-5" />
                  {item.name}
                </Link>
              )
            })}
          </nav>
          <div className="mt-3 pt-3 flex items-center gap-3" style={{ borderTop: '1px solid rgba(48, 40, 71, 0.4)' }}>
            <div className={cn(
              'w-1.5 h-1.5 rounded-full',
              wallet.network === 'mainnet' ? 'bg-yes-400' : 'bg-accent-400'
            )} />
            <span className="text-xs text-surface-400 capitalize">{wallet.network}</span>
            <Shield className="w-3 h-3 text-brand-400 ml-2" />
            <span className="text-xs text-surface-400">ZK Protected</span>
          </div>
        </motion.div>
      )}
    </header>
  )
}
