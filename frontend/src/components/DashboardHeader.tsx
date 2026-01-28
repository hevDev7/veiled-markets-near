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
  Bell,
  Gamepad2,
  RefreshCw
} from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useWalletStore } from '@/lib/store'
import { cn, shortenAddress, formatCredits } from '@/lib/utils'

const navItems = [
  { name: 'Markets', href: '/dashboard', icon: LayoutDashboard },
  { name: 'My Bets', href: '/bets', icon: TrendingUp },
  { name: 'History', href: '/history', icon: History },
]

export function DashboardHeader() {
  const navigate = useNavigate()
  const location = useLocation()
  const { wallet, disconnect, refreshBalance } = useWalletStore()
  const [showDropdown, setShowDropdown] = useState(false)
  const [copied, setCopied] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

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
    await disconnect()
    setShowDropdown(false)
    navigate('/')
  }

  // Get total balance (public + private)
  const totalBalance = wallet.balance.public + wallet.balance.private

  return (
    <header className="fixed top-0 left-0 right-0 z-50">
      {/* Backdrop blur */}
      <div className="absolute inset-0 bg-surface-950/80 backdrop-blur-xl border-b border-surface-800/50" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 md:h-20">
          {/* Logo */}
          <motion.div
            className="flex items-center gap-8"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
          >
            <Link to="/dashboard" className="flex items-center gap-3 group">
              <div className="relative">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-accent-500 flex items-center justify-center shadow-lg shadow-brand-500/25">
                  <Shield className="w-5 h-5 text-white" />
                </div>
                <div className="absolute -inset-1 bg-gradient-to-br from-brand-500 to-accent-500 rounded-xl blur-lg opacity-30 group-hover:opacity-50 transition-opacity" />
              </div>

              <div className="hidden sm:block">
                <h1 className="font-display text-xl font-bold" style={{ letterSpacing: '0.02em' }}>
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
                      'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                      isActive
                        ? 'text-white bg-surface-800/80'
                        : 'text-surface-400 hover:text-white hover:bg-surface-800/50'
                    )}
                  >
                    <item.icon className="w-4 h-4" />
                    {item.name}
                  </Link>
                )
              })}
            </nav>
          </motion.div>

          {/* Right Side */}
          <motion.div
            className="flex items-center gap-3"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            {/* Demo Mode Badge */}
            {wallet.isDemoMode && (
              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent-500/10 border border-accent-500/30 text-accent-400 text-xs font-medium">
                <Gamepad2 className="w-3 h-3" />
                <span>Demo Mode</span>
              </div>
            )}

            {/* Network Badge */}
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-800/50 border border-surface-700/50 text-surface-400 text-xs font-medium">
              <div className={cn(
                'w-2 h-2 rounded-full',
                wallet.network === 'mainnet' ? 'bg-yes-400' : 'bg-accent-400'
              )} />
              <span className="capitalize">{wallet.network}</span>
            </div>

            {/* Privacy Badge */}
            <div className="hidden sm:flex privacy-indicator">
              <Shield className="w-3 h-3" />
              <span>ZK Protected</span>
            </div>

            {/* Notifications */}
            <button className="p-2 rounded-lg hover:bg-surface-800/50 text-surface-400 hover:text-white transition-colors relative">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-brand-500 rounded-full" />
            </button>

            {/* Wallet Dropdown */}
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
                  <div className={cn(
                    'w-2 h-2 rounded-full animate-pulse',
                    wallet.isDemoMode ? 'bg-accent-400' : 'bg-yes-400'
                  )} />
                  <span className="text-sm font-medium text-white">
                    {shortenAddress(wallet.address || '', 4)}
                  </span>
                </div>
                <div className="h-4 w-px bg-surface-700" />
                <span className="text-sm text-surface-400">
                  {formatCredits(totalBalance, 0)} <span className="text-xs">ALEO</span>
                </span>
                <ChevronDown className={cn(
                  'w-4 h-4 text-surface-400 transition-transform',
                  showDropdown && 'rotate-180'
                )} />
              </button>

              {/* Dropdown Menu */}
              {showDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute right-0 top-full mt-2 w-80 p-2 rounded-xl bg-surface-900 border border-surface-800 shadow-2xl"
                >
                  {/* Demo Mode Warning */}
                  {wallet.isDemoMode && (
                    <div className="mx-1 mb-2 p-3 rounded-lg bg-accent-500/10 border border-accent-500/20">
                      <div className="flex items-center gap-2 text-accent-400 text-sm font-medium mb-1">
                        <Gamepad2 className="w-4 h-4" />
                        Demo Mode Active
                      </div>
                      <p className="text-xs text-surface-400">
                        Connect a real wallet to make actual transactions on Aleo.
                      </p>
                    </div>
                  )}

                  {/* Wallet Info */}
                  <div className="p-3 border-b border-surface-800">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs text-surface-500">
                        {wallet.walletType === 'puzzle' && '🧩 Puzzle Wallet'}
                        {wallet.walletType === 'leo' && '🦁 Leo Wallet'}
                        {wallet.walletType === 'demo' && '🎮 Demo Wallet'}
                      </p>
                      <span className={cn(
                        'text-xs px-2 py-0.5 rounded-full',
                        wallet.network === 'mainnet'
                          ? 'bg-yes-500/10 text-yes-400'
                          : 'bg-accent-500/10 text-accent-400'
                      )}>
                        {wallet.network}
                      </span>
                    </div>
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

                  {/* Balance Card */}
                  <div className="p-3 m-1 rounded-lg bg-gradient-to-br from-brand-500/10 to-accent-500/10 border border-brand-500/20">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs text-surface-400">Total Balance</p>
                      <button
                        onClick={handleRefreshBalance}
                        disabled={refreshing}
                        className="p-1 rounded hover:bg-surface-800/50 transition-colors"
                      >
                        <RefreshCw className={cn(
                          'w-3.5 h-3.5 text-surface-400',
                          refreshing && 'animate-spin'
                        )} />
                      </button>
                    </div>
                    <p className="text-2xl font-bold text-white mb-3">
                      {formatCredits(totalBalance)} <span className="text-sm text-surface-400">ALEO</span>
                    </p>

                    {/* Public/Private breakdown */}
                    <div className="grid grid-cols-2 gap-2 pt-3 border-t border-surface-700/50">
                      <div>
                        <p className="text-xs text-surface-500 mb-0.5">Public</p>
                        <p className="text-sm font-medium text-white">
                          {formatCredits(wallet.balance.public)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-surface-500 mb-0.5">Private</p>
                        <p className="text-sm font-medium text-white">
                          {formatCredits(wallet.balance.private)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Menu Items */}
                  <div className="p-1 mt-1 border-t border-surface-800">
                    <Link
                      to="/settings"
                      onClick={() => setShowDropdown(false)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-surface-300 hover:text-white hover:bg-surface-800/50 transition-colors"
                    >
                      <Settings className="w-4 h-4" />
                      Settings
                    </Link>
                    {!wallet.isDemoMode && (
                      <a
                        href={`https://testnet.explorer.provable.com/address/${wallet.address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-surface-300 hover:text-white hover:bg-surface-800/50 transition-colors"
                      >
                        <ExternalLink className="w-4 h-4" />
                        View on Explorer
                      </a>
                    )}
                    <button
                      onClick={handleDisconnect}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-no-400 hover:text-no-300 hover:bg-no-500/10 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      {wallet.isDemoMode ? 'Exit Demo Mode' : 'Disconnect Wallet'}
                    </button>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </header>
  )
}

