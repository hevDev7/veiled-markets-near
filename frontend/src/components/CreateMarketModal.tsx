import { motion, AnimatePresence } from 'framer-motion'
import { 
  X, 
  Plus, 
  Calendar, 
  Hash, 
  FileText, 
  AlertCircle, 
  Check, 
  Loader2,
  Shield,
  Coins,
  Clock
} from 'lucide-react'
import { useState } from 'react'
import { useWalletStore } from '@/lib/store'
import { cn } from '@/lib/utils'

interface CreateMarketModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: (marketId: string) => void
}

type CreateStep = 'details' | 'timing' | 'review' | 'creating' | 'success' | 'error'

interface MarketFormData {
  question: string
  description: string
  category: number
  deadlineDate: string
  deadlineTime: string
  resolutionDeadlineDate: string
  resolutionDeadlineTime: string
  resolutionSource: string
}

const categories = [
  { id: 1, name: 'Politics', emoji: '🏛️' },
  { id: 2, name: 'Sports', emoji: '⚽' },
  { id: 3, name: 'Crypto', emoji: '₿' },
  { id: 4, name: 'Entertainment', emoji: '🎬' },
  { id: 5, name: 'Tech', emoji: '🔬' },
  { id: 6, name: 'Economics', emoji: '📈' },
  { id: 7, name: 'Science', emoji: '🧪' },
]

const initialFormData: MarketFormData = {
  question: '',
  description: '',
  category: 3,
  deadlineDate: '',
  deadlineTime: '23:59',
  resolutionDeadlineDate: '',
  resolutionDeadlineTime: '23:59',
  resolutionSource: '',
}

export function CreateMarketModal({ isOpen, onClose, onSuccess }: CreateMarketModalProps) {
  const { wallet } = useWalletStore()
  const [step, setStep] = useState<CreateStep>('details')
  const [formData, setFormData] = useState<MarketFormData>(initialFormData)
  const [error, setError] = useState<string | null>(null)
  const [marketId, setMarketId] = useState<string | null>(null)

  const updateForm = (updates: Partial<MarketFormData>) => {
    setFormData(prev => ({ ...prev, ...updates }))
  }

  const handleClose = () => {
    setStep('details')
    setFormData(initialFormData)
    setError(null)
    setMarketId(null)
    onClose()
  }

  const validateDetails = (): boolean => {
    if (!formData.question.trim()) {
      setError('Please enter a market question')
      return false
    }
    if (formData.question.length < 20) {
      setError('Question must be at least 20 characters')
      return false
    }
    if (!formData.category) {
      setError('Please select a category')
      return false
    }
    setError(null)
    return true
  }

  const validateTiming = (): boolean => {
    const deadline = new Date(`${formData.deadlineDate}T${formData.deadlineTime}`)
    const resolutionDeadline = new Date(`${formData.resolutionDeadlineDate}T${formData.resolutionDeadlineTime}`)
    const now = new Date()

    if (!formData.deadlineDate) {
      setError('Please set a betting deadline')
      return false
    }
    if (deadline <= now) {
      setError('Deadline must be in the future')
      return false
    }
    if (!formData.resolutionDeadlineDate) {
      setError('Please set a resolution deadline')
      return false
    }
    if (resolutionDeadline <= deadline) {
      setError('Resolution deadline must be after betting deadline')
      return false
    }
    setError(null)
    return true
  }

  const handleNext = () => {
    if (step === 'details') {
      if (validateDetails()) setStep('timing')
    } else if (step === 'timing') {
      if (validateTiming()) setStep('review')
    }
  }

  const handleBack = () => {
    if (step === 'timing') setStep('details')
    else if (step === 'review') setStep('timing')
  }

  const handleCreate = async () => {
    setStep('creating')
    setError(null)

    try {
      // Simulate market creation (in production, this would call the SDK)
      await new Promise(resolve => setTimeout(resolve, 2500))
      
      // Generate mock market ID
      const newMarketId = `market_${Date.now()}_${Math.random().toString(36).substring(7)}`
      setMarketId(newMarketId)
      setStep('success')
      onSuccess?.(newMarketId)
    } catch (err: unknown) {
      console.error('Failed to create market:', err)
      setError(err instanceof Error ? err.message : 'Failed to create market')
      setStep('error')
    }
  }

  const deadline = formData.deadlineDate 
    ? new Date(`${formData.deadlineDate}T${formData.deadlineTime}`)
    : null
  const resolutionDeadline = formData.resolutionDeadlineDate
    ? new Date(`${formData.resolutionDeadlineDate}T${formData.resolutionDeadlineTime}`)
    : null

  const selectedCategory = categories.find(c => c.id === formData.category)

  // Get minimum dates for date inputs
  const today = new Date().toISOString().split('T')[0]
  const minResolutionDate = formData.deadlineDate || today

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-x-4 top-[5%] md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-2xl z-50 max-h-[90vh] overflow-y-auto"
          >
            <div className="glass-card overflow-hidden">
              {/* Header */}
              <div className="relative p-6 border-b border-surface-800">
                <button
                  onClick={handleClose}
                  className="absolute right-4 top-4 p-2 rounded-lg hover:bg-surface-800 transition-colors"
                >
                  <X className="w-5 h-5 text-surface-400" />
                </button>

                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center">
                    <Plus className="w-5 h-5 text-brand-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-white">Create New Market</h2>
                    <p className="text-sm text-surface-400">Create a prediction market for others to bet on</p>
                  </div>
                </div>

                {/* Progress Steps */}
                {(step === 'details' || step === 'timing' || step === 'review') && (
                  <div className="flex items-center gap-2 mt-4">
                    {['details', 'timing', 'review'].map((s, i) => (
                      <div key={s} className="flex items-center">
                        <div className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all",
                          step === s 
                            ? "bg-brand-500 text-white" 
                            : ['details', 'timing', 'review'].indexOf(step) > i
                              ? "bg-yes-500/20 text-yes-400"
                              : "bg-surface-800 text-surface-500"
                        )}>
                          {['details', 'timing', 'review'].indexOf(step) > i ? (
                            <Check className="w-4 h-4" />
                          ) : (
                            i + 1
                          )}
                        </div>
                        {i < 2 && (
                          <div className={cn(
                            "w-12 h-0.5 mx-2",
                            ['details', 'timing', 'review'].indexOf(step) > i
                              ? "bg-yes-500/50"
                              : "bg-surface-800"
                          )} />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="p-6">
                <AnimatePresence mode="wait">
                  {/* Step 1: Details */}
                  {step === 'details' && (
                    <motion.div
                      key="details"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="space-y-6"
                    >
                      {/* Question */}
                      <div>
                        <label className="flex items-center gap-2 text-sm font-medium text-white mb-2">
                          <FileText className="w-4 h-4 text-surface-400" />
                          Market Question
                        </label>
                        <textarea
                          value={formData.question}
                          onChange={(e) => updateForm({ question: e.target.value })}
                          placeholder="Will Bitcoin reach $150,000 by end of Q1 2026?"
                          className="input-field w-full h-24 resize-none"
                          maxLength={200}
                        />
                        <p className="text-xs text-surface-500 mt-1">
                          {formData.question.length}/200 characters. Make it clear and specific.
                        </p>
                      </div>

                      {/* Description */}
                      <div>
                        <label className="flex items-center gap-2 text-sm font-medium text-white mb-2">
                          <FileText className="w-4 h-4 text-surface-400" />
                          Description (Optional)
                        </label>
                        <textarea
                          value={formData.description}
                          onChange={(e) => updateForm({ description: e.target.value })}
                          placeholder="Provide additional context about how this market will be resolved..."
                          className="input-field w-full h-20 resize-none"
                          maxLength={500}
                        />
                      </div>

                      {/* Category */}
                      <div>
                        <label className="flex items-center gap-2 text-sm font-medium text-white mb-2">
                          <Hash className="w-4 h-4 text-surface-400" />
                          Category
                        </label>
                        <div className="grid grid-cols-4 gap-2">
                          {categories.map((cat) => (
                            <button
                              key={cat.id}
                              onClick={() => updateForm({ category: cat.id })}
                              className={cn(
                                "p-3 rounded-xl border-2 transition-all text-center",
                                formData.category === cat.id
                                  ? "border-brand-500 bg-brand-500/10"
                                  : "border-surface-700 hover:border-surface-600"
                              )}
                            >
                              <span className="text-2xl block mb-1">{cat.emoji}</span>
                              <span className="text-xs text-surface-300">{cat.name}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Resolution Source */}
                      <div>
                        <label className="flex items-center gap-2 text-sm font-medium text-white mb-2">
                          <Shield className="w-4 h-4 text-surface-400" />
                          Resolution Source (Optional)
                        </label>
                        <input
                          type="text"
                          value={formData.resolutionSource}
                          onChange={(e) => updateForm({ resolutionSource: e.target.value })}
                          placeholder="e.g., CoinGecko API, Official announcement, etc."
                          className="input-field w-full"
                        />
                      </div>

                      {error && (
                        <div className="flex items-center gap-2 p-3 rounded-lg bg-no-500/10 border border-no-500/20 text-no-400">
                          <AlertCircle className="w-5 h-5 flex-shrink-0" />
                          <span className="text-sm">{error}</span>
                        </div>
                      )}

                      <button onClick={handleNext} className="w-full btn-primary">
                        Continue to Timing
                      </button>
                    </motion.div>
                  )}

                  {/* Step 2: Timing */}
                  {step === 'timing' && (
                    <motion.div
                      key="timing"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="space-y-6"
                    >
                      {/* Betting Deadline */}
                      <div>
                        <label className="flex items-center gap-2 text-sm font-medium text-white mb-2">
                          <Calendar className="w-4 h-4 text-surface-400" />
                          Betting Deadline
                        </label>
                        <p className="text-xs text-surface-400 mb-3">
                          After this time, no new bets can be placed.
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                          <input
                            type="date"
                            value={formData.deadlineDate}
                            onChange={(e) => updateForm({ deadlineDate: e.target.value })}
                            min={today}
                            className="input-field"
                          />
                          <input
                            type="time"
                            value={formData.deadlineTime}
                            onChange={(e) => updateForm({ deadlineTime: e.target.value })}
                            className="input-field"
                          />
                        </div>
                      </div>

                      {/* Resolution Deadline */}
                      <div>
                        <label className="flex items-center gap-2 text-sm font-medium text-white mb-2">
                          <Clock className="w-4 h-4 text-surface-400" />
                          Resolution Deadline
                        </label>
                        <p className="text-xs text-surface-400 mb-3">
                          The market must be resolved by this time. If not resolved, it can be cancelled for refunds.
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                          <input
                            type="date"
                            value={formData.resolutionDeadlineDate}
                            onChange={(e) => updateForm({ resolutionDeadlineDate: e.target.value })}
                            min={minResolutionDate}
                            className="input-field"
                          />
                          <input
                            type="time"
                            value={formData.resolutionDeadlineTime}
                            onChange={(e) => updateForm({ resolutionDeadlineTime: e.target.value })}
                            className="input-field"
                          />
                        </div>
                      </div>

                      {/* Timeline Preview */}
                      {deadline && resolutionDeadline && (
                        <div className="p-4 rounded-xl bg-surface-800/30 space-y-3">
                          <h4 className="text-sm font-medium text-white">Timeline Preview</h4>
                          <div className="flex items-center gap-3">
                            <div className="w-3 h-3 rounded-full bg-yes-500" />
                            <div>
                              <p className="text-sm text-white">Betting Open</p>
                              <p className="text-xs text-surface-400">Now → {deadline.toLocaleDateString()}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="w-3 h-3 rounded-full bg-yellow-500" />
                            <div>
                              <p className="text-sm text-white">Awaiting Resolution</p>
                              <p className="text-xs text-surface-400">{deadline.toLocaleDateString()} → {resolutionDeadline.toLocaleDateString()}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="w-3 h-3 rounded-full bg-brand-500" />
                            <div>
                              <p className="text-sm text-white">Resolved & Payouts</p>
                              <p className="text-xs text-surface-400">After resolution</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {error && (
                        <div className="flex items-center gap-2 p-3 rounded-lg bg-no-500/10 border border-no-500/20 text-no-400">
                          <AlertCircle className="w-5 h-5 flex-shrink-0" />
                          <span className="text-sm">{error}</span>
                        </div>
                      )}

                      <div className="flex gap-3">
                        <button onClick={handleBack} className="flex-1 btn-secondary">
                          Back
                        </button>
                        <button onClick={handleNext} className="flex-1 btn-primary">
                          Review Market
                        </button>
                      </div>
                    </motion.div>
                  )}

                  {/* Step 3: Review */}
                  {step === 'review' && (
                    <motion.div
                      key="review"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="space-y-6"
                    >
                      <div className="p-4 rounded-xl bg-surface-800/30 space-y-4">
                        <div>
                          <p className="text-xs text-surface-500 uppercase tracking-wide mb-1">Question</p>
                          <p className="text-lg font-medium text-white">{formData.question}</p>
                        </div>

                        {formData.description && (
                          <div>
                            <p className="text-xs text-surface-500 uppercase tracking-wide mb-1">Description</p>
                            <p className="text-sm text-surface-300">{formData.description}</p>
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs text-surface-500 uppercase tracking-wide mb-1">Category</p>
                            <p className="text-sm text-white">
                              {selectedCategory?.emoji} {selectedCategory?.name}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-surface-500 uppercase tracking-wide mb-1">Resolution Source</p>
                            <p className="text-sm text-white">
                              {formData.resolutionSource || 'Not specified'}
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs text-surface-500 uppercase tracking-wide mb-1">Betting Ends</p>
                            <p className="text-sm text-white">
                              {deadline?.toLocaleString()}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-surface-500 uppercase tracking-wide mb-1">Resolution Deadline</p>
                            <p className="text-sm text-white">
                              {resolutionDeadline?.toLocaleString()}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Fee Info */}
                      <div className="p-4 rounded-xl bg-brand-500/5 border border-brand-500/20">
                        <div className="flex items-start gap-3">
                          <Coins className="w-5 h-5 text-brand-400 mt-0.5" />
                          <div>
                            <p className="text-sm font-medium text-brand-300">Creator Rewards</p>
                            <p className="text-xs text-surface-400 mt-1">
                              As the market creator, you'll earn 1% of all betting volume as a fee.
                              Protocol takes an additional 1%.
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Creator Info */}
                      <div className="p-4 rounded-xl bg-surface-800/30">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-surface-400">Creator</span>
                          <span className="text-sm text-white font-mono">
                            {wallet.address?.slice(0, 12)}...{wallet.address?.slice(-6)}
                          </span>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <button onClick={handleBack} className="flex-1 btn-secondary">
                          Back
                        </button>
                        <button onClick={handleCreate} className="flex-1 btn-primary">
                          Create Market
                        </button>
                      </div>
                    </motion.div>
                  )}

                  {/* Creating State */}
                  {step === 'creating' && (
                    <motion.div
                      key="creating"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-center py-12"
                    >
                      <Loader2 className="w-12 h-12 text-brand-500 animate-spin mx-auto mb-4" />
                      <h3 className="text-xl font-bold text-white mb-2">Creating Market...</h3>
                      <p className="text-surface-400">
                        Please confirm the transaction in your wallet.
                      </p>
                    </motion.div>
                  )}

                  {/* Success State */}
                  {step === 'success' && (
                    <motion.div
                      key="success"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="text-center py-8"
                    >
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', delay: 0.2 }}
                        className="w-20 h-20 rounded-full bg-yes-500/20 shadow-glow-yes mx-auto mb-6 flex items-center justify-center"
                      >
                        <Check className="w-10 h-10 text-yes-400" />
                      </motion.div>

                      <h3 className="text-2xl font-bold text-white mb-2">
                        Market Created!
                      </h3>
                      <p className="text-surface-400 mb-6">
                        Your prediction market is now live.
                      </p>

                      <div className="p-4 rounded-xl bg-surface-800/50 mb-6 text-left">
                        <p className="text-xs text-surface-500 uppercase tracking-wide mb-1">Market ID</p>
                        <p className="text-sm text-white font-mono break-all">{marketId}</p>
                      </div>

                      <div className="flex items-center justify-center gap-2 text-sm text-brand-400 mb-6">
                        <Shield className="w-4 h-4" />
                        <span>On-Chain • Decentralized • Transparent</span>
                      </div>

                      <button onClick={handleClose} className="btn-primary w-full">
                        Done
                      </button>
                    </motion.div>
                  )}

                  {/* Error State */}
                  {step === 'error' && (
                    <motion.div
                      key="error"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-center py-8"
                    >
                      <div className="w-16 h-16 rounded-full bg-no-500/10 flex items-center justify-center mx-auto mb-4">
                        <AlertCircle className="w-8 h-8 text-no-400" />
                      </div>
                      <h3 className="text-xl font-bold text-white mb-2">Creation Failed</h3>
                      <p className="text-surface-400 mb-6">{error}</p>
                      <div className="flex gap-3">
                        <button onClick={() => setStep('review')} className="flex-1 btn-secondary">
                          Go Back
                        </button>
                        <button onClick={handleCreate} className="flex-1 btn-primary">
                          Try Again
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
