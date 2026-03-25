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
  Plus,
  Settings,
  Gamepad2,
  RefreshCw,
  Menu,
  X,
  Vote,
  Bell,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react'
import { useWalletStore } from '@/lib/store'
import { cn, shortenAddress, formatCredits } from '@/lib/utils'

const navItems = [
  { name: 'Markets', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Portfolio', href: '/portfolio', icon: TrendingUp },
  { name: 'Create', href: '/create', icon: Plus },
  { name: 'Govern', href: '/governance', icon: Vote },
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
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => setShowMobileMenu(false), [location.pathname])

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    if (!showDropdown) return
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-wallet-dropdown]')) setShowDropdown(false)
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
    try { await refreshBalance() } finally { setRefreshing(false) }
  }

  const handleDisconnect = async () => {
    try { await providerDisconnect() } catch (e) { console.error('Disconnect error:', e) }
    setShowDropdown(false)
    navigate('/')
  }

  const totalBalance = wallet.balance.public + wallet.balance.private

  return (
    <>
      <header className={cn(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-500',
        scrolled
          ? 'bg-surface-950/90 backdrop-blur-xl border-b border-white/[0.04]'
          : 'bg-surface-950/70 backdrop-blur-xl border-b border-white/[0.02]'
      )}>
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 lg:h-[72px]">
            {/* Logo — Left */}
              <Link to="/dashboard" className="flex items-center gap-3 group">
                <div className="relative w-10 h-10 rounded-xl overflow-hidden">
                  <img src="/logo.png" alt="Veiled" className="w-10 h-10 object-cover rounded-xl" />
                </div>
                <div className="hidden sm:block">
                  <h1 className="font-display text-lg font-bold tracking-tight">
                    <span className="gradient-text">Veiled</span>
                    <span className="text-white"> Markets</span>
                  </h1>
                </div>
              </Link>

              {/* Desktop Navigation — Center */}
              <nav className="hidden md:flex items-center gap-1">
                {navItems.map((item) => {
                  const isActive = location.pathname === item.href
                  return (
                    <Link
                      key={item.name}
                      to={item.href}
                      className={cn(
                        'relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200',
                        isActive ? 'text-white' : 'text-surface-400 hover:text-white'
                      )}
                    >
                      {item.name}
                      {isActive && (
                        <motion.div
                          layoutId="dashboard-nav"
                          className="absolute inset-0 rounded-lg bg-white/[0.06]"
                          transition={{ type: 'spring', duration: 0.4, bounce: 0 }}
                        />
                      )}
                    </Link>
                  )
                })}
              </nav>

            {/* Right Side */}
            <div className="flex items-center gap-2.5">
              {/* Demo Mode */}
              {wallet.isDemoMode && (
                <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold"
                  style={{ background: 'rgba(0, 220, 130, 0.06)', border: '1px solid rgba(0, 220, 130, 0.12)', color: '#00dc82' }}>
                  <Gamepad2 className="w-3 h-3" />
                  <span>Demo</span>
                </div>
              )}

              {/* Network Badge */}
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-surface-400 bg-white/[0.02] border border-white/[0.04]">
                <div className={cn('w-1.5 h-1.5 rounded-full animate-pulse',
                  wallet.network === 'mainnet' ? 'bg-yes-400' : 'bg-brand-400'
                )} />
                <span className="capitalize">{wallet.network}</span>
              </div>

              {/* ZK Badge */}
              <div className="hidden lg:flex privacy-indicator">
                <Shield className="w-3 h-3" />
                <span>ZK</span>
              </div>

              {/* Notifications */}
              <button className="relative p-2.5 rounded-xl text-surface-400 hover:text-white hover:bg-white/[0.04] transition-all duration-200">
                <Bell className="w-[18px] h-[18px]" />
              </button>

              {/* Mobile Menu Toggle */}
              <button
                onClick={() => setShowMobileMenu(!showMobileMenu)}
                className="md:hidden p-2.5 rounded-xl text-surface-400 hover:text-white hover:bg-white/[0.04] transition-all duration-200"
              >
                {showMobileMenu ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>

              {/* Wallet Button */}
              <div className="relative" data-wallet-dropdown>
                <button
                  onClick={() => setShowDropdown(!showDropdown)}
                  className={cn(
                    'flex items-center gap-2.5 pl-3 pr-4 py-2 rounded-xl transition-all duration-200',
                    'bg-white/[0.04] border',
                    showDropdown ? 'border-brand-400/30' : 'border-white/[0.06] hover:bg-white/[0.06]'
                  )}
                >
                  <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-yes-400/30 to-brand-400/30 flex items-center justify-center">
                    <div className={cn('w-2 h-2 rounded-full animate-pulse',
                      wallet.isDemoMode ? 'bg-brand-400' : 'bg-yes-400'
                    )} />
                  </div>
                  <span className="text-sm font-medium text-white">
                    {shortenAddress(wallet.address || '', 4)}
                  </span>
                  <div className="h-4 w-px bg-white/[0.06]" />
                  <span className="text-xs text-surface-400 tabular-nums">
                    {formatCredits(totalBalance, 1)} <img src="/aleo-logo.png" alt="ALEO" className="w-3.5 h-3.5 rounded-full inline-block ml-0.5" />
                  </span>
                  <ChevronDown className={cn(
                    'w-3.5 h-3.5 text-surface-500 transition-transform duration-200',
                    showDropdown && 'rotate-180'
                  )} />
                </button>

                {/* Dropdown */}
                {showDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ type: 'spring', duration: 0.3, bounce: 0 }}
                    className="absolute right-0 top-full mt-2 w-80 rounded-2xl p-1.5 shadow-elevated-lg z-50"
                    style={{
                      background: 'linear-gradient(135deg, rgba(22, 26, 36, 0.95) 0%, rgba(13, 15, 20, 0.98) 100%)',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                      backdropFilter: 'blur(20px)',
                    }}
                  >
                    {/* Demo Warning */}
                    {wallet.isDemoMode && (
                      <div className="mx-1 mb-1.5 p-3 rounded-xl"
                        style={{ background: 'rgba(0, 220, 130, 0.04)', border: '1px solid rgba(0, 220, 130, 0.1)' }}>
                        <div className="flex items-center gap-2 text-yes-400 text-sm font-semibold mb-1">
                          <Gamepad2 className="w-4 h-4" />
                          Demo Mode
                        </div>
                        <p className="text-xs text-surface-400">
                          Connect a real wallet for actual transactions on Aleo.
                        </p>
                      </div>
                    )}

                    {/* Wallet Info */}
                    <div className="p-3 border-b border-white/[0.04]">
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-2xs text-surface-500 uppercase tracking-wider font-semibold">
                          {wallet.walletType === 'puzzle' && '🧩 Puzzle'}
                          {wallet.walletType === 'leo' && '🦁 Leo'}
                          {wallet.walletType === 'shield' && '🛡️ Shield'}
                          {wallet.walletType === 'fox' && '🦊 Fox'}
                          {wallet.walletType === 'soter' && '🛡️ Soter'}
                          {wallet.walletType === 'demo' && '🎮 Demo'}
                        </p>
                        <span className={cn(
                          'text-2xs font-semibold px-2 py-0.5 rounded-md uppercase tracking-wider',
                          wallet.network === 'mainnet'
                            ? 'bg-yes-500/10 text-yes-400'
                            : 'bg-brand-500/10 text-brand-400'
                        )}>
                          {wallet.network}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-surface-300 truncate flex-1">{wallet.address}</span>
                        <button onClick={handleCopy} className="p-1.5 rounded-lg hover:bg-white/[0.04] transition-colors flex-shrink-0">
                          {copied ? <Check className="w-3.5 h-3.5 text-yes-400" /> : <Copy className="w-3.5 h-3.5 text-surface-400" />}
                        </button>
                      </div>
                    </div>

                    {/* Balance Card */}
                    <div className="p-3 m-1.5 rounded-xl"
                      style={{
                        background: 'linear-gradient(135deg, rgba(201, 168, 76, 0.04), rgba(0, 220, 130, 0.02))',
                        border: '1px solid rgba(201, 168, 76, 0.08)',
                      }}>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs text-surface-400 font-medium">Total Balance</p>
                        <button onClick={handleRefreshBalance} disabled={refreshing} className="p-1 rounded-md hover:bg-white/[0.04] transition-colors">
                          <RefreshCw className={cn('w-3.5 h-3.5 text-surface-500', refreshing && 'animate-spin')} />
                        </button>
                      </div>
                      <p className="text-2xl font-display font-bold text-white mb-3 tabular-nums">
                        {formatCredits(totalBalance)} <img src="/aleo-logo.png" alt="ALEO" className="w-4 h-4 rounded-full inline-block ml-1" />
                      </p>
                      <div className="pt-3 space-y-1.5 border-t border-white/[0.04]">
                        <div className="flex justify-between items-center">
                          <p className="text-xs text-surface-500">Public</p>
                          <p className="text-sm font-medium text-surface-200 tabular-nums">{formatCredits(wallet.balance.public)} <img src="/aleo-logo.png" alt="" className="w-3.5 h-3.5 rounded-full inline-block ml-0.5" /></p>
                        </div>
                        {wallet.balance.private > 0n ? (
                          <div className="flex justify-between items-center">
                            <p className="text-xs text-surface-500">Private</p>
                            <p className="text-sm font-medium text-surface-200 tabular-nums">{formatCredits(wallet.balance.private)} <img src="/aleo-logo.png" alt="" className="w-3.5 h-3.5 rounded-full inline-block ml-0.5" /></p>
                          </div>
                        ) : wallet.walletType === 'shield' ? (
                          <p className="text-2xs text-surface-500 mt-1.5 leading-relaxed">
                            Private balance detection not yet supported by Shield Wallet.
                          </p>
                        ) : null}
                        <div className="flex justify-between items-center">
                          <p className="text-xs text-surface-500">USDCX (Public)</p>
                          <p className="text-sm font-medium text-surface-200 tabular-nums">{formatCredits(wallet.balance.usdcxPublic)} <img src="/usdcx-logo.png" alt="" className="w-3.5 h-3.5 rounded-full inline-block ml-0.5" /></p>
                        </div>
                        <div className="flex justify-between items-center">
                          <p className="text-xs text-surface-500">USDCX (Private)</p>
                          <p className="text-sm font-medium text-surface-200 tabular-nums">{formatCredits(wallet.balance.usdcxPrivate)} <img src="/usdcx-logo.png" alt="" className="w-3.5 h-3.5 rounded-full inline-block ml-0.5" /></p>
                        </div>
                        <div className="flex justify-between items-center">
                          <p className="text-xs text-surface-500">USAD (Public)</p>
                          <p className="text-sm font-medium text-surface-200 tabular-nums">{formatCredits(wallet.balance.usadPublic)} <img src="/usad-logo.svg" alt="" className="w-3.5 h-3.5 rounded-full inline-block ml-0.5" /></p>
                        </div>
                        <div className="flex justify-between items-center">
                          <p className="text-xs text-surface-500">USAD (Private)</p>
                          <p className="text-sm font-medium text-surface-200 tabular-nums">{formatCredits(wallet.balance.usadPrivate)} <img src="/usad-logo.svg" alt="" className="w-3.5 h-3.5 rounded-full inline-block ml-0.5" /></p>
                        </div>
                      </div>
                    </div>

                    {/* Menu */}
                    <div className="p-1 mt-0.5 border-t border-white/[0.04]">
                      <Link to="/settings" onClick={() => setShowDropdown(false)}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs text-surface-300 hover:text-white hover:bg-white/[0.04] transition-colors">
                        <Settings className="w-4 h-4" />
                        Settings
                      </Link>
                      {!wallet.isDemoMode && (
                        <a href={`https://testnet.explorer.provable.com/address/${wallet.address}`}
                          target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs text-surface-300 hover:text-white hover:bg-white/[0.04] transition-colors">
                          <ExternalLink className="w-4 h-4" />
                          View on Explorer
                        </a>
                      )}
                      <button onClick={handleDisconnect}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs text-no-400 hover:text-no-300 hover:bg-no-500/8 transition-colors">
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
      </header>

      {/* Mobile Menu */}
      {showMobileMenu && (
        <div className="fixed inset-0 z-40 md:hidden">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowMobileMenu(false)} />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            transition={{ type: 'spring', duration: 0.4, bounce: 0 }}
            className="absolute right-0 top-0 bottom-0 w-72 bg-surface-900 border-l border-white/[0.04] p-6 pt-20"
          >
            <nav className="flex flex-col gap-2">
              {navItems.map((item, i) => {
                const isActive = location.pathname === item.href
                return (
                  <motion.div key={item.name} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
                    <Link to={item.href} onClick={() => setShowMobileMenu(false)}
                      className={cn(
                        'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200',
                        isActive ? 'bg-white/[0.06] text-white' : 'text-surface-400 hover:text-white hover:bg-white/[0.04]'
                      )}>
                      {item.name}
                    </Link>
                  </motion.div>
                )
              })}
            </nav>
            <div className="mt-6 pt-4 border-t border-white/[0.04] flex items-center gap-3">
              <div className={cn('w-1.5 h-1.5 rounded-full', wallet.network === 'mainnet' ? 'bg-yes-400' : 'bg-brand-400')} />
              <span className="text-xs text-surface-400 capitalize">{wallet.network}</span>
              <Shield className="w-3 h-3 text-brand-400 ml-2" />
              <span className="text-xs text-surface-400">ZK Protected</span>
            </div>
          </motion.div>
        </div>
      )}
    </>
  )
}
