import { motion, AnimatePresence } from 'framer-motion'
import { X, ExternalLink, AlertCircle, CheckCircle2 } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import { useWalletStore } from '@/lib/store'
import { WALLET_INFO, type WalletType, isLeoWalletInstalled, isPuzzleWalletInstalled } from '@/lib/wallet'
import { cn } from '@/lib/utils'

interface WalletModalProps {
  isOpen: boolean
  onClose: () => void
  onConnect: () => void
}

interface WalletOption {
  type: WalletType
  name: string
  description: string
  icon: string
  installed: boolean
  downloadUrl?: string
  recommended?: boolean
}

export function WalletModal({ isOpen, onClose, onConnect }: WalletModalProps) {
  const { connect, error, clearError } = useWalletStore()
  const [connecting, setConnecting] = useState<WalletType | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const [walletStatus, setWalletStatus] = useState({
    puzzle: false,
    leo: false,
  })

  // Check wallet installation status dynamically when modal opens
  const checkWalletStatus = useCallback(() => {
    setWalletStatus({
      puzzle: isPuzzleWalletInstalled(),
      leo: isLeoWalletInstalled(),
    })
  }, [])

  // Re-check wallet status when modal opens and periodically while open
  useEffect(() => {
    if (isOpen) {
      // Check immediately
      checkWalletStatus()

      // Check again after a short delay (extensions may inject late)
      const timer1 = setTimeout(checkWalletStatus, 100)
      const timer2 = setTimeout(checkWalletStatus, 500)
      const timer3 = setTimeout(checkWalletStatus, 1000)

      return () => {
        clearTimeout(timer1)
        clearTimeout(timer2)
        clearTimeout(timer3)
      }
    }
  }, [isOpen, checkWalletStatus])

  // Get available wallets with dynamic status
  const walletOptions: WalletOption[] = [
    {
      type: 'puzzle',
      name: WALLET_INFO.puzzle.name,
      description: WALLET_INFO.puzzle.description,
      icon: WALLET_INFO.puzzle.icon,
      installed: walletStatus.puzzle || true, // Always show as clickable, SDK handles detection
      downloadUrl: WALLET_INFO.puzzle.downloadUrl,
      recommended: true,
    },
    {
      type: 'leo',
      name: WALLET_INFO.leo.name,
      description: WALLET_INFO.leo.description,
      icon: WALLET_INFO.leo.icon,
      installed: walletStatus.leo, // Show actual status but still allow clicking
      downloadUrl: WALLET_INFO.leo.downloadUrl,
    },
  ]

  const handleConnect = async (walletType: WalletType) => {
    setConnecting(walletType)
    setLocalError(null)
    clearError()

    try {
      await connect(walletType)
      onConnect()
      onClose()
    } catch (err: unknown) {
      console.error('Wallet connection error:', err)

      // Extract error message from various error formats
      let errorMessage = 'Failed to connect wallet'

      if (err instanceof Error) {
        errorMessage = err.message
      } else if (typeof err === 'string') {
        errorMessage = err
      } else if (err && typeof err === 'object') {
        const errObj = err as Record<string, unknown>
        if (typeof errObj.message === 'string') {
          errorMessage = errObj.message
        } else if (typeof errObj.error === 'string') {
          errorMessage = errObj.error
        } else if (typeof errObj.reason === 'string') {
          errorMessage = errObj.reason
        } else {
          try {
            errorMessage = JSON.stringify(err)
          } catch {
            errorMessage = 'An unexpected error occurred. Check console for details.'
          }
        }
      }

      setLocalError(errorMessage)
    } finally {
      setConnecting(null)
    }
  }

  const handleClose = () => {
    setLocalError(null)
    clearError()
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
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative z-10 w-full max-w-md mx-auto"
          >
            <div className="glass-card p-0 overflow-hidden shadow-2xl">
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-surface-800/50">
                <div>
                  <h2 className="text-xl font-bold text-white">Connect Wallet</h2>
                  <p className="text-sm text-surface-400 mt-1">
                    Choose a wallet to connect to Veiled Markets
                  </p>
                </div>
                <button
                  onClick={handleClose}
                  className="p-2 rounded-lg hover:bg-surface-800 transition-colors"
                >
                  <X className="w-5 h-5 text-surface-400" />
                </button>
              </div>

              {/* Wallet Options */}
              <div className="p-4 space-y-3">
                {walletOptions.map((wallet) => (
                  <WalletOptionButton
                    key={wallet.type}
                    wallet={wallet}
                    isConnecting={connecting === wallet.type}
                    disabled={connecting !== null}
                    onClick={() => handleConnect(wallet.type)}
                  />
                ))}
              </div>

              {/* Error Message */}
              {(localError || error) && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="px-6 pb-4"
                >
                  <div className="flex items-start gap-3 p-4 rounded-xl bg-no-500/10 border border-no-500/20">
                    <AlertCircle className="w-5 h-5 text-no-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-no-400">Connection Failed</p>
                      {/* Handle multiline error messages */}
                      <div className="text-sm text-surface-400 mt-1 whitespace-pre-line">
                        {localError || error}
                      </div>
                      {/* Show install link if wallet not found */}
                      {((localError || error || '').toLowerCase().includes('not installed') ||
                        (localError || error || '').toLowerCase().includes('not responding') ||
                        (localError || error || '').toLowerCase().includes('timed out') ||
                        (localError || error || '').toLowerCase().includes('not found') ||
                        (localError || error || '').toLowerCase().includes('please check')) && (
                          <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-surface-700/50">
                            {(localError || error || '').toLowerCase().includes('leo') ? (
                              <a
                                href={WALLET_INFO.leo.downloadUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-500/10 text-sm text-brand-400 hover:text-brand-300 hover:bg-brand-500/20 transition-colors"
                              >
                                <span>Install Leo Wallet</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            ) : (
                              <a
                                href={WALLET_INFO.puzzle.downloadUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-500/10 text-sm text-brand-400 hover:text-brand-300 hover:bg-brand-500/20 transition-colors"
                              >
                                <span>Install Puzzle Wallet</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                            <button
                              onClick={() => {
                                setLocalError(null)
                                clearError()
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-700/50 text-sm text-surface-300 hover:text-white hover:bg-surface-700 transition-colors"
                            >
                              Try Again
                            </button>
                          </div>
                        )}
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Footer */}
              <div className="p-4 border-t border-surface-800/50 bg-surface-900/50">
                <p className="text-xs text-surface-500 text-center">
                  By connecting, you agree to the{' '}
                  <a href="#" className="text-brand-400 hover:underline">Terms of Service</a>
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

function WalletOptionButton({
  wallet,
  isConnecting,
  disabled,
  onClick,
}: {
  wallet: WalletOption
  isConnecting: boolean
  disabled: boolean
  onClick: () => void
}) {
  const isLeo = wallet.type === 'leo'

  // Always show as clickable button - let the connect function handle detection
  // This is important because extensions may inject after page load
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex items-center gap-4 w-full p-4 rounded-xl border transition-all duration-200',
        'border-surface-700/50 bg-surface-800/30 hover:bg-surface-800/50 hover:border-brand-500/30',
        disabled && !isConnecting && 'opacity-50 cursor-not-allowed',
        isConnecting && 'border-brand-500/50 bg-brand-500/10'
      )}
    >
      <div className="text-3xl">{wallet.icon}</div>
      <div className="flex-1 text-left">
        <div className="flex items-center gap-2">
          <span className="font-medium text-white">{wallet.name}</span>
          {wallet.recommended && (
            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-brand-500/20 text-brand-400">
              Recommended
            </span>
          )}
          {!wallet.installed && (
            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-surface-700/50 text-surface-400">
              Click to connect
            </span>
          )}
        </div>
        <p className="text-sm text-surface-400 mt-0.5">
          {!wallet.installed
            ? `${wallet.description} (extension may need to be enabled)`
            : wallet.description
          }
        </p>
      </div>
      <div className="w-6 h-6 flex items-center justify-center">
        {isConnecting ? (
          <div className="w-5 h-5 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
        ) : wallet.installed ? (
          <CheckCircle2 className="w-5 h-5 text-yes-500" />
        ) : isLeo ? (
          <ExternalLink className="w-4 h-4 text-surface-400" />
        ) : null}
      </div>
    </button>
  )
}
