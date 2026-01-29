import { motion, AnimatePresence } from 'framer-motion'
import { X, ExternalLink, AlertCircle, CheckCircle2, Download } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import { useWalletStore } from '@/lib/store'
import { WALLET_INFO, isLeoWalletInstalled } from '@/lib/wallet'
import { cn } from '@/lib/utils'

interface WalletModalProps {
  isOpen: boolean
  onClose: () => void
  onConnect: () => void
}

export function WalletModal({ isOpen, onClose, onConnect }: WalletModalProps) {
  const { connect, error, clearError } = useWalletStore()
  const [isConnecting, setIsConnecting] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [isInstalled, setIsInstalled] = useState(false)

  // Check wallet installation status dynamically when modal opens
  const checkWalletStatus = useCallback(() => {
    setIsInstalled(isLeoWalletInstalled())
  }, [])

  // Re-check wallet status when modal opens and periodically while open
  useEffect(() => {
    if (isOpen) {
      checkWalletStatus()
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

  const handleConnect = async () => {
    setIsConnecting(true)
    setLocalError(null)
    clearError()

    try {
      await connect('leo')
      onConnect()
      onClose()
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
    } finally {
      setIsConnecting(false)
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
                    Connect with Leo Wallet to continue
                  </p>
                </div>
                <button
                  onClick={handleClose}
                  className="p-2 rounded-lg hover:bg-surface-800 transition-colors text-surface-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Leo Wallet Option */}
              <div className="p-4">
                <button
                  onClick={handleConnect}
                  disabled={isConnecting}
                  className={cn(
                    'flex items-center gap-4 w-full p-4 rounded-xl border transition-all duration-200',
                    'border-surface-700/50 bg-surface-800/30',
                    'hover:bg-surface-800/60 hover:border-brand-500/30',
                    isConnecting && 'border-brand-500/50 bg-brand-500/10'
                  )}
                >
                  {/* Leo Wallet Logo */}
                  <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0">
                    <img
                      src="/wallets/leo-wallet.png"
                      alt="Leo Wallet"
                      className="w-full h-full object-cover"
                    />
                  </div>

                  {/* Info */}
                  <div className="flex-1 text-left">
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-semibold text-white">
                        Leo Wallet
                      </span>
                      <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-brand-500/20 text-brand-400">
                        Recommended
                      </span>
                    </div>
                    <p className="text-sm text-surface-400 mt-0.5">
                      The official wallet for Aleo
                    </p>
                  </div>

                  {/* Status */}
                  <div className="w-8 h-8 flex items-center justify-center flex-shrink-0">
                    {isConnecting ? (
                      <div className="w-6 h-6 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
                    ) : isInstalled ? (
                      <CheckCircle2 className="w-6 h-6 text-green-500" />
                    ) : (
                      <Download className="w-5 h-5 text-surface-500" />
                    )}
                  </div>
                </button>

                {/* Install prompt if not installed */}
                {!isInstalled && !isConnecting && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="mt-3"
                  >
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-brand-500/10 border border-brand-500/20">
                      <Download className="w-5 h-5 text-brand-400 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm text-brand-300">
                          Leo Wallet not detected
                        </p>
                        <a
                          href={WALLET_INFO.leo.downloadUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 mt-1"
                        >
                          <span>Install from Chrome Web Store</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>

              {/* Error Message */}
              {(localError || error) && (
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
                        {localError || error}
                      </p>
                      <div className="flex flex-wrap gap-2 mt-3">
                        <a
                          href={WALLET_INFO.leo.downloadUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-500/10 text-xs text-brand-400 hover:bg-brand-500/20 transition-colors"
                        >
                          <span>Install Leo Wallet</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                        <button
                          onClick={() => {
                            setLocalError(null)
                            clearError()
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
