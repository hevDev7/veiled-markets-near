import { motion } from 'framer-motion'
import {
  Bell,
  Shield,
  Palette,
  Globe,
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
  Wallet,
  Trash2,
  Database,
  Loader2,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react'
import { useWalletStore } from '@/lib/store'
import { DashboardHeader } from '@/components/DashboardHeader'
import { Footer } from '@/components/Footer'
import { WalletCompatibilityLab } from '@/components/WalletCompatibilityLab'
import { cn, formatCredits } from '@/lib/utils'
import { clearAllStaleData } from '@/lib/aleo-client'

export function Settings() {
  const navigate = useNavigate()
  const { wallet, refreshBalance } = useWalletStore()
  const { connected: providerConnected, connecting: providerConnecting } = useWallet()
  const [copied, setCopied] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isClearing, setIsClearing] = useState(false)
  const [clearResult, setClearResult] = useState<string | null>(null)
  const isConnected = wallet.connected || providerConnected

  // Redirect to landing if not connected
  useEffect(() => {
    if (!isConnected && !providerConnecting) {
      navigate('/')
    }
  }, [isConnected, providerConnecting, navigate])

  const handleCopy = () => {
    if (wallet.address) {
      navigator.clipboard.writeText(wallet.address)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleRefreshBalance = async () => {
    setIsRefreshing(true)
    await refreshBalance()
    setIsRefreshing(false)
  }

  const handleClearData = async () => {
    setIsClearing(true)
    setClearResult(null)
    try {
      const result = await clearAllStaleData()
      setClearResult(result)
    } catch (e) {
      setClearResult(`Error: ${e}`)
    } finally {
      setIsClearing(false)
    }
  }

  if (!isConnected) {
    return null
  }

  return (
    <div className="min-h-screen bg-surface-950 flex flex-col">
      <DashboardHeader />

      <main className="flex-1 pt-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Page Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <h1 className="text-3xl font-display font-bold text-white">Settings</h1>
            <p className="text-surface-400 mt-1">
              Manage your account and preferences
            </p>
          </motion.div>

          <div className="space-y-6">
            {/* Wallet Section */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="glass-card p-6"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center">
                  <Wallet className="w-5 h-5 text-brand-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">Wallet</h2>
                  <p className="text-sm text-surface-400">Your connected wallet details</p>
                </div>
              </div>

              <div className="space-y-4">
                {/* Address */}
                <div className="flex items-center justify-between p-4 rounded-xl bg-surface-800/30">
                  <div>
                    <p className="text-sm text-surface-400 mb-1">Address</p>
                    <p className="font-mono text-sm text-white">
                      {wallet.address?.slice(0, 20)}...{wallet.address?.slice(-10)}
                    </p>
                  </div>
                  <button
                    onClick={handleCopy}
                    className="p-2 rounded-lg bg-surface-700/50 hover:bg-surface-600/50 transition-colors"
                  >
                    {copied ? (
                      <Check className="w-4 h-4 text-yes-400" />
                    ) : (
                      <Copy className="w-4 h-4 text-surface-400" />
                    )}
                  </button>
                </div>

                {/* Balance */}
                <div className="flex items-center justify-between p-4 rounded-xl bg-surface-800/30">
                  <div>
                    <p className="text-sm text-surface-400 mb-1">Balance</p>
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="text-lg font-bold text-white">
                          {formatCredits(wallet.balance.public + wallet.balance.private)} ALEO
                        </p>
                        <p className="text-xs text-surface-500">
                          Public: {formatCredits(wallet.balance.public)} | Private: {formatCredits(wallet.balance.private)}
                        </p>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={handleRefreshBalance}
                    disabled={isRefreshing}
                    className="p-2 rounded-lg bg-surface-700/50 hover:bg-surface-600/50 transition-colors"
                  >
                    <RefreshCw className={cn("w-4 h-4 text-surface-400", isRefreshing && "animate-spin")} />
                  </button>
                </div>

                {/* Network */}
                <div className="flex items-center justify-between p-4 rounded-xl bg-surface-800/30">
                  <div>
                    <p className="text-sm text-surface-400 mb-1">Network</p>
                    <p className="text-white capitalize">{wallet.network}</p>
                  </div>
                  <span className="px-3 py-1 rounded-full bg-yes-500/10 text-yes-400 text-sm">
                    Connected
                  </span>
                </div>

                {/* Wallet Type */}
                <div className="flex items-center justify-between p-4 rounded-xl bg-surface-800/30">
                  <div>
                    <p className="text-sm text-surface-400 mb-1">Wallet Type</p>
                    <p className="text-white capitalize">
                      {wallet.walletType} {wallet.isDemoMode && '(Demo Mode)'}
                    </p>
                  </div>
                  <a
                    href={`https://testnet.explorer.provable.com/address/${wallet.address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-brand-400 hover:text-brand-300 text-sm"
                  >
                    <span>View on Explorer</span>
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>
            </motion.div>

            {/* Preferences Section */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="glass-card p-6"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-accent-500/10 flex items-center justify-center">
                  <Palette className="w-5 h-5 text-accent-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">Preferences</h2>
                  <p className="text-sm text-surface-400">Customize your experience</p>
                </div>
              </div>

              <div className="space-y-4">
                <SettingRow
                  icon={<Globe className="w-5 h-5" />}
                  title="Language"
                  description="Choose your preferred language"
                  action={
                    <select className="bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-white text-sm">
                      <option value="en">English</option>
                      <option value="id">Bahasa Indonesia</option>
                      <option value="zh">中文</option>
                    </select>
                  }
                />

                <SettingRow
                  icon={<Palette className="w-5 h-5" />}
                  title="Theme"
                  description="Select your preferred theme"
                  action={
                    <select className="bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-white text-sm">
                      <option value="dark">Dark</option>
                      <option value="light" disabled>Light (Coming Soon)</option>
                    </select>
                  }
                />
              </div>
            </motion.div>

            {/* Notifications Section */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="glass-card p-6"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-yes-500/10 flex items-center justify-center">
                  <Bell className="w-5 h-5 text-yes-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">Notifications</h2>
                  <p className="text-sm text-surface-400">Manage your notification preferences</p>
                </div>
              </div>

              <div className="space-y-4">
                <ToggleSetting
                  title="Market Resolution Alerts"
                  description="Get notified when markets you bet on resolve"
                  defaultChecked={true}
                />
                <ToggleSetting
                  title="Price Movement Alerts"
                  description="Get notified of significant odds changes"
                  defaultChecked={false}
                />
                <ToggleSetting
                  title="New Market Alerts"
                  description="Get notified when new markets are created"
                  defaultChecked={false}
                />
              </div>
            </motion.div>

            {/* Security Section */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="glass-card p-6"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-no-500/10 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-no-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">Privacy & Security</h2>
                  <p className="text-sm text-surface-400">Your data is protected by zero-knowledge proofs</p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-brand-500/5 border border-brand-500/20">
                <div className="flex items-start gap-3">
                  <Shield className="w-5 h-5 text-brand-400 mt-0.5" />
                  <div>
                    <p className="text-sm text-white font-medium mb-1">
                      Zero-Knowledge Privacy Enabled
                    </p>
                    <p className="text-sm text-surface-400">
                      All your bets are encrypted using Aleo's zero-knowledge proofs. 
                      Your bet amounts, positions, and trading history are completely private 
                      and cannot be viewed by anyone else on the network.
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Data Management Section */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="glass-card p-6"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-yellow-500/10 flex items-center justify-center">
                  <Database className="w-5 h-5 text-yellow-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">Data Management</h2>
                  <p className="text-sm text-surface-400">Clear cached data from previous program versions</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-surface-800/30">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white font-medium">Clear All Stale Data</p>
                      <p className="text-sm text-surface-400 mt-1">
                        Removes cached market IDs, pending markets, question mappings, and Supabase entries from previous program versions.
                      </p>
                    </div>
                    <button
                      onClick={handleClearData}
                      disabled={isClearing}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-no-500/10 border border-no-500/30 text-no-400 hover:bg-no-500/20 transition-all text-sm whitespace-nowrap"
                    >
                      {isClearing ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                      <span>{isClearing ? 'Clearing...' : 'Clear Data'}</span>
                    </button>
                  </div>
                  {clearResult && (
                    <div className="mt-3 p-3 rounded-lg bg-surface-900/50 text-xs font-mono text-surface-400">
                      {clearResult}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>

            {/* Wallet A/B Lab */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
            >
              <WalletCompatibilityLab />
            </motion.div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}

function SettingRow({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode
  title: string
  description: string
  action: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between p-4 rounded-xl bg-surface-800/30">
      <div className="flex items-center gap-3">
        <div className="text-surface-400">{icon}</div>
        <div>
          <p className="text-white font-medium">{title}</p>
          <p className="text-sm text-surface-400">{description}</p>
        </div>
      </div>
      {action}
    </div>
  )
}

function ToggleSetting({
  title,
  description,
  defaultChecked = false,
}: {
  title: string
  description: string
  defaultChecked?: boolean
}) {
  const [checked, setChecked] = useState(defaultChecked)

  return (
    <div className="flex items-center justify-between p-4 rounded-xl bg-surface-800/30">
      <div>
        <p className="text-white font-medium">{title}</p>
        <p className="text-sm text-surface-400">{description}</p>
      </div>
      <button
        onClick={() => setChecked(!checked)}
        className={cn(
          "w-12 h-6 rounded-full transition-colors relative",
          checked ? "bg-brand-500" : "bg-surface-700"
        )}
      >
        <div
          className={cn(
            "w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform",
            checked ? "translate-x-6" : "translate-x-0.5"
          )}
        />
      </button>
    </div>
  )
}
