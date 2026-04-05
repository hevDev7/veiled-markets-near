import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { AlertCircle, Info, TrendingUp } from 'lucide-react'
import { type Market } from '@/lib/store'
import {
    calculateBuySharesOut,
    calculateSellTokensOut,
    calculateBuyPriceImpact,
    calculateSellPriceImpact,
    formatSharePrice,
    calculateMinSharesOut,
    calculateMinTokensOut,
    estimateTradeFees,
    type AMMReserves,
} from '@/lib/amm'
import { getMarketOutcomeSummaries } from '@/lib/market-outcomes'
import { cn, formatCredits, getTokenSymbol } from '@/lib/utils'

interface TradingPanelProps {
    market: Market
    onTrade: (type: 'buy' | 'sell', outcome: number, amount: bigint) => void
}

export function TradingPanel({ market, onTrade }: TradingPanelProps) {
    const [tradeType, setTradeType] = useState<'buy' | 'sell'>('buy')
    const [selectedOutcome, setSelectedOutcome] = useState(1)
    const [amount, setAmount] = useState('')
    const [slippageTolerance, setSlippageTolerance] = useState(1) // 1%
    const outcomeSummaries = useMemo(() => getMarketOutcomeSummaries(market), [market])
    const activeOutcome = outcomeSummaries.find((outcome) => outcome.outcome === selectedOutcome) ?? outcomeSummaries[0] ?? null
    const tokenSymbol = getTokenSymbol(market.tokenType)
    const outcomeGridClass = outcomeSummaries.length <= 2
        ? 'grid-cols-2'
        : outcomeSummaries.length === 3
            ? 'grid-cols-1 sm:grid-cols-3'
            : 'grid-cols-2'

    const amountBigInt = useMemo(() => {
        try {
            return BigInt(Math.floor(parseFloat(amount || '0') * 1_000_000))
        } catch {
            return 0n
        }
    }, [amount])

    // Calculate trade details
    const reserves: AMMReserves = useMemo(() => ({
        reserve_1: market.yesReserve,
        reserve_2: market.noReserve,
        reserve_3: market.reserve3 ?? 0n,
        reserve_4: market.reserve4 ?? 0n,
        num_outcomes: market.numOutcomes ?? 2,
    }), [market])

    const tradeDetails = useMemo(() => {
        if (amountBigInt === 0n || !activeOutcome) return null

        const outcome = activeOutcome.outcome

        if (tradeType === 'buy') {
            const sharesOut = calculateBuySharesOut(reserves, outcome, amountBigInt)
            const minSharesOut = calculateMinSharesOut(sharesOut, slippageTolerance)
            const priceImpact = calculateBuyPriceImpact(reserves, outcome, amountBigInt)
            const avgPrice = Number(amountBigInt) / Number(sharesOut)
            const fees = estimateTradeFees(amountBigInt)

            return {
                sharesOut,
                minSharesOut,
                priceImpact,
                avgPrice: avgPrice / 1_000_000,
                fees,
                total: amountBigInt + fees
            }
        } else {
            // Selling shares
            const creditsOut = calculateSellTokensOut(reserves, outcome, amountBigInt)
            const fees = estimateTradeFees(creditsOut)
            const netCredits = creditsOut - fees
            const minCreditsOut = calculateMinTokensOut(netCredits, slippageTolerance)
            const priceImpact = calculateSellPriceImpact(reserves, outcome, amountBigInt)
            const avgPrice = Number(netCredits) / Number(amountBigInt)

            return {
                creditsOut: netCredits,
                minCreditsOut,
                priceImpact,
                avgPrice: avgPrice / 1_000_000,
                fees,
                total: netCredits
            }
        }
    }, [activeOutcome, reserves, tradeType, amountBigInt, slippageTolerance])

    const handleTrade = () => {
        if (!tradeDetails || amountBigInt === 0n || !activeOutcome) return
        onTrade(tradeType, activeOutcome.outcome, amountBigInt)
        setAmount('')
    }

    return (
        <div className="space-y-4">
            {/* Trade Type Selector */}
            <div className="flex gap-2">
                <button
                    onClick={() => setTradeType('buy')}
                    className={cn(
                        'flex-1 py-2 px-4 rounded-lg font-medium transition-all',
                        tradeType === 'buy'
                            ? 'bg-yes-500 text-white'
                            : 'bg-surface-800 text-surface-400 hover:text-white'
                    )}
                >
                    Buy
                </button>
                <button
                    onClick={() => setTradeType('sell')}
                    className={cn(
                        'flex-1 py-2 px-4 rounded-lg font-medium transition-all',
                        tradeType === 'sell'
                            ? 'bg-no-500 text-white'
                            : 'bg-surface-800 text-surface-400 hover:text-white'
                    )}
                >
                    Sell
                </button>
            </div>

            {/* Outcome Selector */}
            <div className={cn('grid gap-3', outcomeGridClass)}>
                {outcomeSummaries.map((outcome) => {
                    const isSelected = outcome.outcome === (activeOutcome?.outcome ?? 1)

                    return (
                        <button
                            key={outcome.outcome}
                            onClick={() => setSelectedOutcome(outcome.outcome)}
                            className={cn(
                                'p-4 rounded-xl border-2 transition-all text-left',
                                isSelected
                                    ? cn(outcome.styles.border, outcome.styles.bg)
                                    : 'border-surface-700 hover:border-surface-600'
                            )}
                        >
                            <div className="flex items-center justify-between mb-2">
                                <span className="font-medium text-white">{outcome.label}</span>
                                <TrendingUp className={cn('w-4 h-4', outcome.styles.text)} />
                            </div>
                            <div className={cn('text-2xl font-bold', outcome.styles.text)}>
                                {formatSharePrice(outcome.probability)}
                            </div>
                            <div className="text-xs text-surface-400 mt-1">
                                {outcome.percentage.toFixed(1)}% probability
                            </div>
                        </button>
                    )
                })}
            </div>

            {/* Amount Input */}
            <div>
                <label className="block text-sm font-medium text-surface-300 mb-2">
                    {tradeType === 'buy'
                        ? `Amount to Spend (${tokenSymbol})`
                        : `Shares to Sell (${activeOutcome?.label ?? 'selected outcome'})`
                    }
                </label>
                <div className="relative">
                    <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full px-4 py-3 bg-surface-800 border border-surface-700 rounded-lg text-white placeholder-surface-500 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none"
                        step="0.01"
                        min="0"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 text-sm">
                        {tradeType === 'buy' ? tokenSymbol : 'shares'}
                    </div>
                </div>
            </div>

            {/* Trade Details */}
            {tradeDetails && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white/[0.03] rounded-lg p-4 space-y-2 text-sm"
                >
                    <div className="flex justify-between">
                        <span className="text-surface-400">
                            {tradeType === 'buy' ? 'Shares Received' : 'Credits Received'}
                        </span>
                        <span className="text-white font-medium">
                            {tradeType === 'buy'
                                ? `${(Number(tradeDetails.sharesOut) / 1_000_000).toFixed(2)} shares`
                                : `${formatCredits(tradeDetails.creditsOut || 0n)} ${tokenSymbol}`
                            }
                        </span>
                    </div>

                    <div className="flex justify-between">
                        <span className="text-surface-400">Average Price</span>
                        <span className="text-white font-medium">
                            {formatSharePrice(tradeDetails.avgPrice)}
                        </span>
                    </div>

                    <div className="flex justify-between">
                        <span className="text-surface-400">Price Impact</span>
                        <span className={cn(
                            'font-medium',
                            Math.abs(tradeDetails.priceImpact) > 5 ? 'text-amber-400' : 'text-surface-300'
                        )}>
                            {tradeDetails.priceImpact.toFixed(2)}%
                        </span>
                    </div>

                    <div className="flex justify-between">
                        <span className="text-surface-400">Fees (2%)</span>
                        <span className="text-surface-300">
                            {formatCredits(tradeDetails.fees)} {tokenSymbol}
                        </span>
                    </div>

                    <div className="pt-2 border-t border-surface-700 flex justify-between">
                        <span className="text-white font-medium">Total</span>
                        <span className="text-white font-bold">
                            {formatCredits(tradeDetails.total)} {tokenSymbol}
                        </span>
                    </div>

                    {Math.abs(tradeDetails.priceImpact) > 5 && (
                        <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                            <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                            <p className="text-xs text-amber-300">
                                High price impact! Consider splitting into smaller trades.
                            </p>
                        </div>
                    )}
                </motion.div>
            )}

            {/* Slippage Settings */}
            <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 text-surface-400">
                    <Info className="w-4 h-4" />
                    <span>Slippage Tolerance</span>
                </div>
                <div className="flex gap-2">
                    {[0.5, 1, 2].map((value) => (
                        <button
                            key={value}
                            onClick={() => setSlippageTolerance(value)}
                            className={cn(
                                'px-3 py-1 rounded text-xs font-medium transition-all',
                                slippageTolerance === value
                                    ? 'bg-brand-500 text-white'
                                    : 'bg-surface-800 text-surface-400 hover:text-white'
                            )}
                        >
                            {value}%
                        </button>
                    ))}
                </div>
            </div>

            {/* Trade Button */}
            <button
                onClick={handleTrade}
                disabled={!tradeDetails || amountBigInt === 0n || !activeOutcome}
                className={cn(
                    'w-full py-3 rounded-lg font-medium transition-all',
                    tradeType === 'buy'
                        ? 'bg-yes-500 hover:bg-yes-600 text-white'
                        : 'bg-no-500 hover:bg-no-600 text-white',
                    (!tradeDetails || amountBigInt === 0n || !activeOutcome) && 'opacity-50 cursor-not-allowed'
                )}
            >
                {tradeType === 'buy' ? 'Buy' : 'Sell'} {activeOutcome?.label ?? 'Selected'} Shares
            </button>
        </div>
    )
}
