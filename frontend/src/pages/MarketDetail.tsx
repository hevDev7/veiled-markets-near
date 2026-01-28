import { motion } from 'framer-motion'
import {
  ArrowLeft,
  Clock,
  Users,
  TrendingUp,
  TrendingDown,
  ExternalLink,
  Share2,
  Bookmark,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Info,
  Copy,
  Check
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useWalletStore, useBetsStore, type Market } from '@/lib/store'
import { useRealMarketsStore } from '@/lib/market-store'
import { DashboardHeader } from '@/components/DashboardHeader'
import { Footer } from '@/components/Footer'
import { OddsChart } from '@/components/OddsChart'
import { cn, formatCredits } from '@/lib/utils'

const categoryNames: Record<number, string> = {
  1: 'Politics',
  2: 'Sports',
  3: 'Crypto',
  4: 'Entertainment',
  5: 'Tech',
  6: 'Economics',
  7: 'Science',
}

const categoryColors: Record<number, string> = {
  1: 'bg-red-500/10 text-red-400 border-red-500/20',
  2: 'bg-green-500/10 text-green-400 border-green-500/20',
  3: 'bg-brand-500/10 text-brand-400 border-brand-500/20',
  4: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
  5: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  6: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  7: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
}

type BetStep = 'select' | 'amount' | 'confirm' | 'processing' | 'success' | 'error'

// Copyable Text Component
function CopyableText({ text, displayText }: { text: string; displayText?: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-white font-mono text-sm">
        {displayText || text}
      </span>
      <button
        onClick={handleCopy}
        className="p-1.5 rounded-lg bg-surface-800/50 hover:bg-surface-700/50 transition-colors"
        title="Copy to clipboard"
      >
        {copied ? (
          <Check className="w-3.5 h-3.5 text-yes-400" />
        ) : (
          <Copy className="w-3.5 h-3.5 text-surface-400" />
        )}
      </button>
    </div>
  )
}

export function MarketDetail() {
  const navigate = useNavigate()
  const { marketId } = useParams<{ marketId: string }>()
  const { wallet } = useWalletStore()
  const { markets } = useRealMarketsStore()
  const { placeBet, isPlacingBet } = useBetsStore()

  const [market, setMarket] = useState<Market | null>(null)
  const [selectedOutcome, setSelectedOutcome] = useState<'yes' | 'no' | null>(null)
  const [betAmount, setBetAmount] = useState('')
  const [step, setStep] = useState<BetStep>('select')
  const [error, setError] = useState<string | null>(null)
  const [txId, setTxId] = useState<string | null>(null)

  // Redirect to landing if not connected
  useEffect(() => {
    if (!wallet.connected) {
      navigate('/')
    }
  }, [wallet.connected, navigate])

  // Find market
  useEffect(() => {
    const found = markets.find(m => m.id === marketId)
    if (found) {
      setMarket(found)
    }
  }, [marketId, markets])

  if (!wallet.connected) {
    return null
  }

  if (!market) {
    return (
      <div className="min-h-screen bg-surface-950 flex flex-col">
        <DashboardHeader />
        <main className="flex-1 pt-20 flex items-center justify-center">
          <div className="text-center">
            <AlertCircle className="w-12 h-12 text-surface-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-white mb-2">Market Not Found</h2>
            <p className="text-surface-400 mb-6">The market you're looking for doesn't exist.</p>
            <button onClick={() => navigate('/dashboard')} className="btn-primary">
              Back to Markets
            </button>
          </div>
        </main>
        <Footer />
      </div>
    )
  }

  const potentialPayout = selectedOutcome === 'yes'
    ? market.potentialYesPayout
    : market.potentialNoPayout

  const betAmountNum = parseFloat(betAmount) || 0
  const betAmountMicro = BigInt(Math.floor(betAmountNum * 1_000_000))
  const potentialWin = betAmountNum * potentialPayout

  const handlePlaceBet = async () => {
    if (!selectedOutcome || betAmountMicro <= 0n || !market) return

    setStep('processing')
    setError(null)

    try {
      // Validate market ID format - must be a field type for on-chain betting
      if (!market.id.endsWith('field')) {
        throw new Error(
          'This market cannot accept bets yet. The market ID must be in blockchain field format. ' +
          'Only markets created via the "Create Market" button with confirmed transactions can accept bets.'
        )
      }

      const transactionId = await placeBet(market.id, betAmountMicro, selectedOutcome)
      setTxId(transactionId)
      setStep('success')
    } catch (err: unknown) {
      console.error('Bet failed:', err)
      const errorMessage = err instanceof Error ? err.message : 'Failed to place bet'

      // Check for "unknown error" which usually means the market doesn't exist on-chain
      if (errorMessage.toLowerCase().includes('unknown error')) {
        setError(
          'Transaction failed. This usually means the market does not exist on the blockchain yet. ' +
          'If you just created this market, please wait for the transaction to be confirmed and ' +
          'the actual market ID to be indexed. The contract generates a unique market ID that differs ' +
          'from the question hash used for display.'
        )
      } else {
        setError(errorMessage)
      }
      setStep('error')
    }
  }

  const resetBet = () => {
    setSelectedOutcome(null)
    setBetAmount('')
    setStep('select')
    setError(null)
    setTxId(null)
  }

  const quickAmounts = [1, 5, 10, 25, 50, 100]

  return (
    <div className="min-h-screen bg-surface-950 flex flex-col">
      <DashboardHeader />

      <main className="flex-1 pt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Back Button */}
          <motion.button
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 text-surface-400 hover:text-white transition-colors mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Markets</span>
          </motion.button>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-6">
              {/* Market Header */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-card p-6"
              >
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="flex items-center gap-3">
                    <span className={cn(
                      "px-3 py-1 text-sm font-medium rounded-full border",
                      categoryColors[market.category]
                    )}>
                      {categoryNames[market.category]}
                    </span>
                    {market.tags?.map(tag => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 text-xs font-medium rounded-full bg-surface-700/50 text-surface-300"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="p-2 rounded-lg bg-surface-800/50 hover:bg-surface-700/50 transition-colors">
                      <Share2 className="w-4 h-4 text-surface-400" />
                    </button>
                    <button className="p-2 rounded-lg bg-surface-800/50 hover:bg-surface-700/50 transition-colors">
                      <Bookmark className="w-4 h-4 text-surface-400" />
                    </button>
                  </div>
                </div>

                <h1 className="text-2xl md:text-3xl font-bold text-white mb-4">
                  {market.question}
                </h1>

                {market.description && (
                  <p className="text-surface-400 mb-6">
                    {market.description}
                  </p>
                )}

                {/* Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 rounded-xl bg-surface-800/30">
                    <div className="flex items-center gap-2 text-surface-400 text-sm mb-1">
                      <TrendingUp className="w-4 h-4" />
                      <span>Volume</span>
                    </div>
                    <p className="text-lg font-bold text-white">
                      {formatCredits(market.totalVolume)} ALEO
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-surface-800/30">
                    <div className="flex items-center gap-2 text-surface-400 text-sm mb-1">
                      <Users className="w-4 h-4" />
                      <span>Total Bets</span>
                    </div>
                    <p className="text-lg font-bold text-white">
                      {market.totalBets}
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-surface-800/30">
                    <div className="flex items-center gap-2 text-surface-400 text-sm mb-1">
                      <Clock className="w-4 h-4" />
                      <span>Ends In</span>
                    </div>
                    <p className="text-lg font-bold text-white">
                      {market.timeRemaining}
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-surface-800/30">
                    <div className="flex items-center gap-2 text-surface-400 text-sm mb-1">
                      <Info className="w-4 h-4" />
                      <span>Resolution</span>
                    </div>
                    <p className="text-sm font-medium text-white truncate">
                      {market.resolutionSource || 'Oracle'}
                    </p>
                  </div>
                </div>
              </motion.div>

              {/* Probability Chart */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="glass-card p-6"
              >
                <h2 className="text-lg font-semibold text-white mb-4">Current Probability</h2>

                {/* Probability Bar */}
                <div className="mb-6">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-yes-400 font-medium">YES {market.yesPercentage}%</span>
                    <span className="text-no-400 font-medium">{market.noPercentage}% NO</span>
                  </div>
                  <div className="h-4 rounded-full overflow-hidden bg-surface-800 flex">
                    <div
                      className="h-full bg-gradient-to-r from-yes-600 to-yes-500 transition-all duration-500"
                      style={{ width: `${market.yesPercentage}%` }}
                    />
                    <div
                      className="h-full bg-gradient-to-r from-no-500 to-no-600 transition-all duration-500"
                      style={{ width: `${market.noPercentage}%` }}
                    />
                  </div>
                </div>

                {/* Payout Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div className={cn(
                    "p-4 rounded-xl border transition-all cursor-pointer",
                    selectedOutcome === 'yes'
                      ? "bg-yes-500/10 border-yes-500/50"
                      : "bg-surface-800/30 border-surface-700/50 hover:border-yes-500/30"
                  )}
                    onClick={() => {
                      setSelectedOutcome('yes')
                      if (step === 'select') setStep('amount')
                    }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-yes-400 font-bold text-lg">YES</span>
                      <TrendingUp className="w-5 h-5 text-yes-400" />
                    </div>
                    <p className="text-2xl font-bold text-white">{market.potentialYesPayout.toFixed(2)}x</p>
                    <p className="text-sm text-surface-400">Potential payout</p>
                  </div>

                  <div className={cn(
                    "p-4 rounded-xl border transition-all cursor-pointer",
                    selectedOutcome === 'no'
                      ? "bg-no-500/10 border-no-500/50"
                      : "bg-surface-800/30 border-surface-700/50 hover:border-no-500/30"
                  )}
                    onClick={() => {
                      setSelectedOutcome('no')
                      if (step === 'select') setStep('amount')
                    }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-no-400 font-bold text-lg">NO</span>
                      <TrendingDown className="w-5 h-5 text-no-400" />
                    </div>
                    <p className="text-2xl font-bold text-white">{market.potentialNoPayout.toFixed(2)}x</p>
                    <p className="text-sm text-surface-400">Potential payout</p>
                  </div>
                </div>
              </motion.div>

              {/* Odds History Chart */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="glass-card p-6"
              >
                <OddsChart
                  currentYes={market.yesPercentage}
                  currentNo={market.noPercentage}
                />
              </motion.div>

              {/* Market Info */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="glass-card p-6"
              >
                <h2 className="text-lg font-semibold text-white mb-4">Market Information</h2>
                <div className="space-y-4">
                  <div className="flex justify-between items-center py-3 border-b border-surface-800/50">
                    <span className="text-surface-400">Market ID</span>
                    <CopyableText
                      text={market.id}
                      displayText={`${market.id.slice(0, 10)}...${market.id.slice(-8)}`}
                    />
                  </div>
                  <div className="flex justify-between items-center py-3 border-b border-surface-800/50">
                    <span className="text-surface-400">Creator</span>
                    <div className="flex items-center gap-2">
                      <a
                        href={`https://testnet.explorer.provable.com/address/${market.creator}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-400 hover:text-brand-300 flex items-center gap-1"
                      >
                        <span className="font-mono text-sm">
                          {market.creator?.slice(0, 10)}...{market.creator?.slice(-6)}
                        </span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                  <div className="flex justify-between py-3 border-b border-surface-800/50">
                    <span className="text-surface-400">Resolution Source</span>
                    <span className="text-white">{market.resolutionSource || 'Oracle'}</span>
                  </div>
                  <div className="flex justify-between py-3">
                    <span className="text-surface-400">Contract</span>
                    <a
                      href="https://testnet.explorer.provable.com/program/veiled_markets.aleo"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-400 hover:text-brand-300 flex items-center gap-1"
                    >
                      <span>veiled_markets.aleo</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Betting Panel */}
            <div className="lg:col-span-1">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="glass-card p-6 sticky top-24"
              >
                <h2 className="text-lg font-semibold text-white mb-4">Place Your Bet</h2>

                {/* Success State */}
                {step === 'success' && (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 rounded-full bg-yes-500/10 flex items-center justify-center mx-auto mb-4">
                      <CheckCircle2 className="w-8 h-8 text-yes-400" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">Bet Placed!</h3>
                    <p className="text-surface-400 mb-4">
                      Your {selectedOutcome?.toUpperCase()} bet of {betAmount} ALEO has been submitted.
                    </p>
                    {txId && (
                      <a
                        href={`https://testnet.explorer.provable.com/transaction/${txId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-brand-400 hover:text-brand-300 mb-6"
                      >
                        <span>View Transaction</span>
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                    <button onClick={resetBet} className="btn-primary w-full">
                      Place Another Bet
                    </button>
                  </div>
                )}

                {/* Error State */}
                {step === 'error' && (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 rounded-full bg-no-500/10 flex items-center justify-center mx-auto mb-4">
                      <AlertCircle className="w-8 h-8 text-no-400" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">Bet Failed</h3>
                    <p className="text-surface-400 mb-6">{error}</p>
                    <button onClick={resetBet} className="btn-primary w-full">
                      Try Again
                    </button>
                  </div>
                )}

                {/* Processing State */}
                {step === 'processing' && (
                  <div className="text-center py-8">
                    <Loader2 className="w-12 h-12 text-brand-500 animate-spin mx-auto mb-4" />
                    <h3 className="text-xl font-bold text-white mb-2">Processing...</h3>
                    <p className="text-surface-400">
                      Please confirm the transaction in your wallet.
                    </p>
                  </div>
                )}

                {/* Betting Form */}
                {(step === 'select' || step === 'amount' || step === 'confirm') && (
                  <>
                    {/* Outcome Selection */}
                    <div className="mb-6">
                      <label className="text-sm text-surface-400 mb-2 block">Select Outcome</label>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          onClick={() => {
                            setSelectedOutcome('yes')
                            setStep('amount')
                          }}
                          className={cn(
                            "p-4 rounded-xl border-2 transition-all",
                            selectedOutcome === 'yes'
                              ? "bg-yes-500/10 border-yes-500 text-yes-400"
                              : "bg-surface-800/30 border-surface-700 text-surface-400 hover:border-yes-500/50"
                          )}
                        >
                          <TrendingUp className="w-6 h-6 mx-auto mb-2" />
                          <span className="font-bold">YES</span>
                          <p className="text-xs mt-1">{market.potentialYesPayout.toFixed(2)}x</p>
                        </button>
                        <button
                          onClick={() => {
                            setSelectedOutcome('no')
                            setStep('amount')
                          }}
                          className={cn(
                            "p-4 rounded-xl border-2 transition-all",
                            selectedOutcome === 'no'
                              ? "bg-no-500/10 border-no-500 text-no-400"
                              : "bg-surface-800/30 border-surface-700 text-surface-400 hover:border-no-500/50"
                          )}
                        >
                          <TrendingDown className="w-6 h-6 mx-auto mb-2" />
                          <span className="font-bold">NO</span>
                          <p className="text-xs mt-1">{market.potentialNoPayout.toFixed(2)}x</p>
                        </button>
                      </div>
                    </div>

                    {/* Amount Input */}
                    {selectedOutcome && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="mb-6"
                      >
                        <label className="text-sm text-surface-400 mb-2 block">Bet Amount (ALEO)</label>
                        <div className="relative">
                          <input
                            type="number"
                            value={betAmount}
                            onChange={(e) => setBetAmount(e.target.value)}
                            placeholder="0.00"
                            className="input-field w-full pr-16 text-lg"
                            min="0"
                            step="0.1"
                          />
                          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-surface-400">
                            ALEO
                          </span>
                        </div>

                        {/* Quick Amount Buttons */}
                        <div className="flex flex-wrap gap-2 mt-3">
                          {quickAmounts.map(amount => (
                            <button
                              key={amount}
                              onClick={() => setBetAmount(amount.toString())}
                              className={cn(
                                "px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                                parseFloat(betAmount) === amount
                                  ? "bg-brand-500 text-white"
                                  : "bg-surface-800/50 text-surface-400 hover:text-white"
                              )}
                            >
                              {amount}
                            </button>
                          ))}
                        </div>

                        <p className="text-xs text-surface-500 mt-2">
                          Balance: {formatCredits(wallet.balance.public + wallet.balance.private)} ALEO
                        </p>
                      </motion.div>
                    )}

                    {/* Payout Preview */}
                    {selectedOutcome && betAmountNum > 0 && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="p-4 rounded-xl bg-surface-800/30 mb-6"
                      >
                        <div className="flex justify-between mb-2">
                          <span className="text-surface-400">Your Bet</span>
                          <span className="text-white font-medium">
                            {betAmount} ALEO on {selectedOutcome.toUpperCase()}
                          </span>
                        </div>
                        <div className="flex justify-between mb-2">
                          <span className="text-surface-400">Payout Multiplier</span>
                          <span className="text-white font-medium">{potentialPayout.toFixed(2)}x</span>
                        </div>
                        <div className="flex justify-between pt-2 border-t border-surface-700/50">
                          <span className="text-surface-400">Potential Win</span>
                          <span className={cn(
                            "font-bold",
                            selectedOutcome === 'yes' ? "text-yes-400" : "text-no-400"
                          )}>
                            {potentialWin.toFixed(2)} ALEO
                          </span>
                        </div>
                      </motion.div>
                    )}

                    {/* Place Bet Button */}
                    <button
                      onClick={handlePlaceBet}
                      disabled={!selectedOutcome || betAmountNum <= 0 || isPlacingBet}
                      className={cn(
                        "w-full py-4 rounded-xl font-bold text-lg transition-all",
                        selectedOutcome && betAmountNum > 0
                          ? selectedOutcome === 'yes'
                            ? "bg-yes-500 hover:bg-yes-400 text-white"
                            : "bg-no-500 hover:bg-no-400 text-white"
                          : "bg-surface-800 text-surface-500 cursor-not-allowed"
                      )}
                    >
                      {isPlacingBet ? (
                        <span className="flex items-center justify-center gap-2">
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Processing...
                        </span>
                      ) : selectedOutcome && betAmountNum > 0 ? (
                        `Place ${selectedOutcome.toUpperCase()} Bet`
                      ) : (
                        'Select Outcome & Amount'
                      )}
                    </button>

                    {/* Privacy Notice */}
                    <p className="text-xs text-surface-500 text-center mt-4">
                      Your bet is encrypted with zero-knowledge proofs.
                      Only you can see your position.
                    </p>
                  </>
                )}
              </motion.div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
