import { motion, AnimatePresence } from 'framer-motion'
import { X, ExternalLink, AlertCircle, CheckCircle2, Download, Clock } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react'
import { Network } from '@provablehq/aleo-types'
import { WALLET_INFO, isLeoWalletInstalled, isFoxWalletInstalled, isShieldWalletInstalled } from '@/lib/wallet'
import { cn } from '@/lib/utils'

interface WalletModalProps {
  isOpen: boolean
  onClose: () => void
  onConnect: () => void
}

// Map our wallet types to provider wallet names
const WALLET_NAME_MAP: Record<string, string> = {
  leo: 'Leo Wallet',
  fox: 'Fox Wallet',
  soter: 'Soter Wallet',
  shield: 'Shield Wallet',
}

interface WalletOption {
  type: string
  name: string
  description: string
  downloadUrl: string
  icon: string
  logoSrc?: string
  checkInstalled: () => boolean
  recommended?: boolean
  comingSoon?: boolean
}

const walletOptions: WalletOption[] = [
  {
    type: 'leo',
    name: WALLET_INFO.leo.name,
    description: WALLET_INFO.leo.description,
    downloadUrl: WALLET_INFO.leo.downloadUrl,
    icon: WALLET_INFO.leo.icon,
    logoSrc: '/wallets/leo-wallet.png',
    checkInstalled: isLeoWalletInstalled,
  },
  {
    type: 'fox',
    name: WALLET_INFO.fox.name,
    description: WALLET_INFO.fox.description,
    downloadUrl: WALLET_INFO.fox.downloadUrl,
    icon: WALLET_INFO.fox.icon,
    checkInstalled: isFoxWalletInstalled,
  },
  {
    type: 'shield',
    name: WALLET_INFO.shield.name,
    description: WALLET_INFO.shield.description,
    downloadUrl: WALLET_INFO.shield.downloadUrl,
    icon: WALLET_INFO.shield.icon,
    logoSrc: '/wallets/shield-wallet.svg',
    checkInstalled: isShieldWalletInstalled,
  },
]

export function WalletModal({ isOpen, onClose, onConnect }: WalletModalProps) {
  const { wallets, selectWallet, connect, connected } = useWallet()
  const [isConnecting, setIsConnecting] = useState(false)
  const [connectingType, setConnectingType] = useState<string | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const [installedWallets, setInstalledWallets] = useState<Record<string, boolean>>({})

  // Check wallet installation status dynamically when modal opens
  const checkWalletStatus = useCallback(() => {
    const status: Record<string, boolean> = {}
    for (const wallet of walletOptions) {
      // Check from provider's detected wallets
      const providerName = WALLET_NAME_MAP[wallet.type]
      const providerWallet = wallets.find(w => w.adapter.name === providerName)
      status[wallet.type] = providerWallet
        ? providerWallet.readyState === 'Installed'
        : wallet.checkInstalled()
    }
    setInstalledWallets(status)
  }, [wallets])

  // Re-check wallet status when modal opens
  useEffect(() => {
    if (isOpen) {
      checkWalletStatus()
    }
  }, [isOpen, checkWalletStatus])

  // Auto-close on successful connection
  useEffect(() => {
    if (connected && isConnecting) {
      setIsConnecting(false)
      setConnectingType(null)
      onConnect()
      onClose()
    }
  }, [connected, isConnecting, onConnect, onClose])

  const handleConnect = async (walletType: string) => {
    setIsConnecting(true)
    setConnectingType(walletType)
    setLocalError(null)

    try {
      const providerName = WALLET_NAME_MAP[walletType]
      if (!providerName) throw new Error(`Unsupported wallet: ${walletType}`)

      // Select wallet adapter by name, then connect
      selectWallet(providerName as any)

      // Small delay to let selection propagate
      await new Promise(r => setTimeout(r, 100))

      await connect(Network.TESTNET)
      // WalletBridge will sync state to useWalletStore
    } catch (err: unknown) {
      console.error('Wallet connection error:', err)
      let errorMessage = 'Failed to connect wallet'

      if (err instanceof Error) {
        errorMessage = err.message
      } else if (typeof err === 'string') {
        errorMessage = err
      } else if (err && typeof err === 'object') {
        const errObj = err as Record<string, unknown>
        if (typeof errObj.message === 'string') {
          errorMessage = errObj.message
        }
      }

      setLocalError(errorMessage)
      setIsConnecting(false)
      setConnectingType(null)
    }
  }

  const handleClose = () => {
    setLocalError(null)
    onClose()
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative z-10 w-full max-w-sm mx-auto"
          >
            <div className="bg-surface-900 rounded-2xl border border-surface-700/50 shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between p-5 border-b border-surface-800">
                <div>
                  <h2 className="text-lg font-semibold text-white">Connect Wallet</h2>
                  <p className="text-sm text-surface-400 mt-0.5">
                    Choose a wallet to continue
                  </p>
                </div>
                <button
                  onClick={handleClose}
                  className="p-2 rounded-lg hover:bg-surface-800 transition-colors text-surface-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Wallet Options */}
              <div className="p-4 space-y-3">
                {walletOptions.map((wallet) => {
                  const isInstalled = installedWallets[wallet.type] ?? false
                  const isThisConnecting = isConnecting && connectingType === wallet.type

                  // Coming Soon wallets: non-interactive, link to website
                  if (wallet.comingSoon) {
                    return (
                      <a
                        key={wallet.type}
                        href={wallet.downloadUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(
                          'flex items-center gap-4 w-full p-4 rounded-xl border',
                          'border-surface-700/30 bg-surface-800/20 opacity-60',
                          'hover:opacity-80 transition-opacity cursor-pointer'
                        )}
                      >
                        {/* Wallet Logo */}
                        <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 bg-surface-800 flex items-center justify-center">
                          {wallet.logoSrc ? (
                            <img
                              src={wallet.logoSrc}
                              alt={wallet.name}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement
                                target.style.display = 'none'
                                target.parentElement!.innerHTML = `<span class="text-2xl">${wallet.icon}</span>`
                              }}
                            />
                          ) : (
                            <span className="text-2xl">{wallet.icon}</span>
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 text-left">
                          <div className="flex items-center gap-2">
                            <span className="text-lg font-semibold text-surface-400">
                              {wallet.name}
                            </span>
                            <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-surface-700/50 text-surface-500">
                              Coming Soon
                            </span>
                          </div>
                          <p className="text-sm text-surface-500 mt-0.5">
                            {wallet.description}
                          </p>
                        </div>

                        {/* Status */}
                        <div className="w-8 h-8 flex items-center justify-center flex-shrink-0">
                          <Clock className="w-5 h-5 text-surface-600" />
                        </div>
                      </a>
                    )
                  }

                  return (
                    <div key={wallet.type}>
                      <button
                        onClick={() => handleConnect(wallet.type)}
                        disabled={isConnecting}
                        className={cn(
                          'flex items-center gap-4 w-full p-4 rounded-xl border transition-all duration-200',
                          'border-surface-700/50 bg-surface-800/30',
                          'hover:bg-surface-800/60 hover:border-brand-500/30',
                          isThisConnecting && 'border-brand-500/50 bg-brand-500/10',
                          isConnecting && !isThisConnecting && 'opacity-50 cursor-not-allowed'
                        )}
                      >
                        {/* Wallet Logo */}
                        <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 bg-surface-800 flex items-center justify-center">
                          {wallet.logoSrc ? (
                            <img
                              src={wallet.logoSrc}
                              alt={wallet.name}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement
                                target.style.display = 'none'
                                target.parentElement!.innerHTML = `<span class="text-2xl">${wallet.icon}</span>`
                              }}
                            />
                          ) : (
                            <span className="text-2xl">{wallet.icon}</span>
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 text-left">
                          <div className="flex items-center gap-2">
                            <span className="text-lg font-semibold text-white">
                              {wallet.name}
                            </span>
                            {wallet.recommended && (
                              <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-brand-500/20 text-brand-400">
                                Recommended
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-surface-400 mt-0.5">
                            {wallet.description}
                          </p>
                        </div>

                        {/* Status */}
                        <div className="w-8 h-8 flex items-center justify-center flex-shrink-0">
                          {isThisConnecting ? (
                            <div className="w-6 h-6 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
                          ) : isInstalled ? (
                            <CheckCircle2 className="w-6 h-6 text-green-500" />
                          ) : (
                            <Download className="w-5 h-5 text-surface-500" />
                          )}
                        </div>
                      </button>

                      {/* Install prompt if not installed and not connecting */}
                      {!isInstalled && !isConnecting && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="mt-2 mb-1"
                        >
                          <div className="flex items-center gap-3 p-3 rounded-xl bg-brand-500/10 border border-brand-500/20">
                            <Download className="w-5 h-5 text-brand-400 flex-shrink-0" />
                            <div className="flex-1">
                              <p className="text-sm text-brand-300">
                                {wallet.name} not detected
                              </p>
                              <a
                                href={wallet.downloadUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 mt-1"
                              >
                                <span>Install from {wallet.downloadUrl.replace('https://', '')}</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Error Message */}
              {localError && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="px-4 pb-4"
                >
                  <div className="flex items-start gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                    <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-red-400">Connection Failed</p>
                      <p className="text-xs text-surface-400 mt-1 break-words">
                        {localError}
                      </p>
                      <div className="flex flex-wrap gap-2 mt-3">
                        <button
                          onClick={() => {
                            setLocalError(null)
                          }}
                          className="px-3 py-1.5 rounded-lg bg-surface-700/50 text-xs text-surface-300 hover:bg-surface-700 transition-colors"
                        >
                          Try Again
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Footer */}
              <div className="p-4 border-t border-surface-800 bg-surface-900/50">
                <p className="text-xs text-surface-500 text-center">
                  By connecting, you agree to our{' '}
                  <a href="#" className="text-brand-400 hover:underline">Terms</a>
                  {' '}and{' '}
                  <a href="#" className="text-brand-400 hover:underline">Privacy Policy</a>
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
