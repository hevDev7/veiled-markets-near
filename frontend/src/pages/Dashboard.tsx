import { motion, AnimatePresence } from 'framer-motion'
import {
    Search,
    TrendingUp,
    Clock,
    Flame,
    Plus,
    Wallet,
    Trophy,
    Terminal,
    Activity,
    Zap,
    Eye,
    Lock,
    Grid3x3,
    Bitcoin,
    DollarSign,
    Cpu,
    Vote,
    Loader2,
    Gavel,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWalletStore, useBetsStore, type Market } from '@/lib/store'
import { useRealMarketsStore } from '@/lib/market-store'
import { MarketRow } from '@/components/MarketRow'
import { DashboardHeader } from '@/components/DashboardHeader'
import { Footer } from '@/components/Footer'
import { CreateMarketModal } from '@/components/CreateMarketModal'
import { cn, formatCredits } from '@/lib/utils'
import { resolvePendingMarkets, hasPendingMarkets, getPendingMarketsInfo, clearPendingMarkets, type PendingMarketInfo } from '@/lib/aleo-client'
import { devLog, devWarn } from '../lib/logger'

const categories = [
    { id: 0, name: 'All Markets', icon: Flame },
    { id: 3, name: 'Crypto', icon: Bitcoin },
    { id: 6, name: 'Economics', icon: DollarSign },
    { id: 2, name: 'Sports', icon: Trophy },
    { id: 5, name: 'Tech', icon: Cpu },
    { id: 1, name: 'Politics', icon: Vote },
]

const sortOptions = [
    { id: 'volume', name: 'Highest Volume', icon: TrendingUp },
    { id: 'ending', name: 'Ending Soon', icon: Clock },
    { id: 'newest', name: 'Newest', icon: Flame },
    { id: 'needs_resolution', name: 'Needs Resolution', icon: Gavel },
]

export function Dashboard() {
    const navigate = useNavigate()
    const { wallet } = useWalletStore()
    const { markets, isLoading, isRefreshing, fetchMarkets, addMarket } = useRealMarketsStore()
    const { userBets, pendingBets, fetchUserBets, syncBetStatuses } = useBetsStore()

    const [selectedCategory, setSelectedCategory] = useState(0)
    const [searchQuery, setSearchQuery] = useState('')
    const [sortBy, setSortBy] = useState('volume')
    const [isCreateMarketOpen, setIsCreateMarketOpen] = useState(false)
    const [pendingInfo, setPendingInfo] = useState<PendingMarketInfo>({ count: 0, questions: [], statuses: [], retryCounts: [] })
    const [isResolvingPending, setIsResolvingPending] = useState(false)

    useEffect(() => {
        if (!wallet.connected) {
            navigate('/')
        }
    }, [wallet.connected, navigate])

    useEffect(() => {
        fetchMarkets()
        fetchUserBets() // Fetch user's bet records
        syncBetStatuses() // Promote stale pending bets → user_bets (and sync to Supabase)

        // Check for pending markets and update banner
        setPendingInfo(getPendingMarketsInfo())

        // Auto-resolve pending markets (created but not yet discovered)
        const tryResolvePending = () => {
            // Only run if there are pending markets
            if (!hasPendingMarkets()) {
                setPendingInfo({ count: 0, questions: [], statuses: [], retryCounts: [] })
                return
            }

            setIsResolvingPending(true)
            resolvePendingMarkets().then(resolvedIds => {
                if (resolvedIds.length > 0) {
                    devLog('[Dashboard] Resolved pending markets:', resolvedIds)
                    resolvedIds.forEach(id => addMarket(id))
                    fetchMarkets()
                }
                // Update pending count
                setPendingInfo(getPendingMarketsInfo())
            }).catch(err => {
                devWarn('[Dashboard] Pending resolve error:', err)
            }).finally(() => {
                setIsResolvingPending(false)
            })
        }

        tryResolvePending() // Initial attempt

        // Retry resolution every 60 seconds (for pending Shield wallet markets)
        const pendingInterval = setInterval(tryResolvePending, 60_000)

        // Refresh markets every 30 seconds
        const refreshInterval = setInterval(fetchMarkets, 30000)

        // Sync bet statuses every 60 seconds (promote pending → active → Supabase)
        const syncInterval = setInterval(syncBetStatuses, 60_000)

        return () => {
            clearInterval(pendingInterval)
            clearInterval(refreshInterval)
            clearInterval(syncInterval)
        }
    }, [fetchMarkets, fetchUserBets, addMarket, syncBetStatuses])

    const filteredMarkets = markets
        .filter(market => {
            if (sortBy === 'needs_resolution') {
                // Show expired, closed, or pending resolution markets
                const isEnded = market.timeRemaining === 'Ended' || market.status !== 1
                if (!isEnded) return false
            } else {
                // Default: hide expired and non-active markets
                if (market.status !== 1 || market.timeRemaining === 'Ended') return false
            }
            // Category filter
            if (selectedCategory !== 0 && market.category !== selectedCategory) return false
            // Search filter
            if (searchQuery !== '' && !market.question.toLowerCase().includes(searchQuery.toLowerCase())) return false
            return true
        })
        .sort((a, b) => {
            switch (sortBy) {
                case 'volume':
                    return Number(b.totalVolume - a.totalVolume)
                case 'ending':
                    return Number(a.deadline - b.deadline)
                case 'newest':
                    return Number(b.deadline - a.deadline)
                case 'needs_resolution':
                    // Show unresolved first (status 1=active expired, 2=closed), then pending resolution, then resolved
                    return a.status - b.status
                default:
                    return 0
            }
        })

    const handleMarketClick = (market: Market) => {
        navigate(`/market/${market.id}`)
    }

    if (!wallet.connected) {
        return null
    }

    return (
        <div className="min-h-screen bg-surface-950 relative overflow-hidden">
            {/* Animated Background */}
            <div className="fixed inset-0 z-0">
                <div className="absolute inset-0" style={{
                    backgroundImage: `
            linear-gradient(rgba(139, 92, 246, 0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(139, 92, 246, 0.02) 1px, transparent 1px)
          `,
                    backgroundSize: '40px 40px',
                }} />
                <motion.div
                    animate={{
                        x: [0, 50, 0],
                        y: [0, -50, 0],
                    }}
                    transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                    className="absolute top-1/4 right-1/4 w-96 h-96 bg-brand-500/5 rounded-full blur-[120px]"
                />
            </div>

            <DashboardHeader />

            <main className="pt-20 relative z-10">
                {/* Command Center Header */}
                <div className="border-b border-brand-500/10 bg-surface-900/30 backdrop-blur-xl">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg bg-brand-500/10 flex items-center justify-center">
                                    <Terminal className="w-5 h-5 text-brand-400" />
                                </div>
                                <div>
                                    <h1 className="text-xl font-bold text-white font-mono">COMMAND_CENTER</h1>
                                    <p className="text-xs text-surface-500 font-mono">SYSTEM_ACTIVE • ZK_ENABLED</p>
                                </div>
                            </div>

                            <button
                                onClick={() => setIsCreateMarketOpen(true)}
                                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-500/10 border border-brand-500/30 text-brand-400 hover:bg-brand-500/20 transition-all font-mono text-sm"
                            >
                                <Plus className="w-4 h-4" />
                                <span>NEW_MARKET</span>
                            </button>
                        </div>

                        {/* Stats - Horizontal Ticker Style */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                            <StatTicker
                                icon={<Wallet className="w-4 h-4" />}
                                label="BALANCE"
                                value={`${formatCredits(wallet.balance.public + wallet.balance.private)} ALEO`}
                                color="text-brand-400"
                                delay={0}
                            />
                            <StatTicker
                                icon={<Activity className="w-4 h-4" />}
                                label="ACTIVE_BETS"
                                value={String(userBets.filter(b => b.status === 'active').length + pendingBets.length)}
                                color="text-yes-400"
                                delay={0.1}
                            />
                            <StatTicker
                                icon={<Trophy className="w-4 h-4" />}
                                label="WINNINGS"
                                value="0 ALEO"
                                color="text-accent-400"
                                delay={0.2}
                            />
                            <StatTicker
                                icon={<Zap className="w-4 h-4" />}
                                label="TOTAL_VOLUME"
                                value={`${(Number(markets.reduce((sum, m) => sum + m.totalVolume, 0n)) / 1_000_000).toFixed(1)} ALEO`}
                                color="text-surface-400"
                                delay={0.3}
                            />
                        </div>
                    </div>
                </div>

                {/* Main Content */}
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

                    {/* Sidebar + Content Layout */}
                    <div className="grid lg:grid-cols-[280px_1fr] gap-6">

                        {/* Left Sidebar - Filters */}
                        <motion.div
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="space-y-4"
                        >
                            {/* Categories */}
                            <div className="bg-surface-900/50 backdrop-blur-sm rounded-xl border border-surface-800/50 p-4">
                                <div className="flex items-center gap-2 mb-4">
                                    <Grid3x3 className="w-4 h-4 text-brand-400" />
                                    <h3 className="text-sm font-bold text-white font-mono uppercase">Categories</h3>
                                </div>
                                <div className="space-y-1">
                                    {categories.map((category) => (
                                        <button
                                            key={category.id}
                                            onClick={() => setSelectedCategory(category.id)}
                                            className={cn(
                                                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all font-mono',
                                                selectedCategory === category.id
                                                    ? 'bg-brand-500/20 text-brand-400 border border-brand-500/30'
                                                    : 'text-surface-400 hover:text-white hover:bg-surface-800/50'
                                            )}
                                        >
                                            <category.icon className="w-4 h-4" />
                                            <span>{category.name.toUpperCase()}</span>
                                            {selectedCategory === category.id && (
                                                <motion.div
                                                    layoutId="activeCategory"
                                                    className="ml-auto w-1.5 h-1.5 rounded-full bg-brand-400"
                                                />
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Sort Options */}
                            <div className="bg-surface-900/50 backdrop-blur-sm rounded-xl border border-surface-800/50 p-4">
                                <div className="flex items-center gap-2 mb-4">
                                    <TrendingUp className="w-4 h-4 text-accent-400" />
                                    <h3 className="text-sm font-bold text-white font-mono uppercase">Sort By</h3>
                                </div>
                                <div className="space-y-1">
                                    {sortOptions.map((option) => (
                                        <button
                                            key={option.id}
                                            onClick={() => setSortBy(option.id)}
                                            className={cn(
                                                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all font-mono',
                                                sortBy === option.id
                                                    ? 'bg-accent-500/20 text-accent-400 border border-accent-500/30'
                                                    : 'text-surface-400 hover:text-white hover:bg-surface-800/50'
                                            )}
                                        >
                                            <option.icon className="w-4 h-4" />
                                            <span>{option.name.toUpperCase()}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Privacy Status */}
                            <div className="bg-gradient-to-br from-brand-500/10 to-accent-500/10 backdrop-blur-sm rounded-xl border border-brand-500/20 p-4">
                                <div className="flex items-center gap-2 mb-3">
                                    <Lock className="w-4 h-4 text-brand-400" />
                                    <h3 className="text-sm font-bold text-white font-mono">PRIVACY_STATUS</h3>
                                </div>
                                <div className="space-y-2 text-xs font-mono">
                                    <div className="flex items-center justify-between">
                                        <span className="text-surface-400">ZK_PROOFS</span>
                                        <span className="text-yes-400">ACTIVE</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-surface-400">ENCRYPTION</span>
                                        <span className="text-yes-400">ENABLED</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-surface-400">MEV_PROTECTION</span>
                                        <span className="text-yes-400">ON</span>
                                    </div>
                                </div>
                            </div>
                        </motion.div>

                        {/* Right Content - Markets */}
                        <div className="space-y-4">
                            {/* Pending Markets Banner */}
                            {pendingInfo.count > 0 && (() => {
                                const allFailed = pendingInfo.statuses.every(s => s === 'likely_failed')
                                const borderColor = allFailed ? 'border-red-500/20' : 'border-yellow-500/20'
                                const bgColor = allFailed ? 'bg-red-500/10' : 'bg-yellow-500/10'

                                return (
                                <motion.div
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className={`${bgColor} border ${borderColor} rounded-xl p-4`}
                                >
                                    <div className="flex items-start gap-3">
                                        <div className="mt-0.5">
                                            {allFailed ? (
                                                <Activity className="w-5 h-5 text-red-400" />
                                            ) : isResolvingPending ? (
                                                <Loader2 className="w-5 h-5 text-yellow-400 animate-spin" />
                                            ) : (
                                                <Clock className="w-5 h-5 text-yellow-400" />
                                            )}
                                        </div>
                                        <div className="flex-1">
                                            <p className={`text-sm font-medium font-mono ${allFailed ? 'text-red-300' : 'text-yellow-300'}`}>
                                                {allFailed
                                                    ? `${pendingInfo.count} MARKET${pendingInfo.count > 1 ? 'S' : ''} LIKELY FAILED`
                                                    : `${pendingInfo.count} PENDING MARKET${pendingInfo.count > 1 ? 'S' : ''} AWAITING CONFIRMATION`}
                                            </p>
                                            <p className="text-xs text-surface-400 mt-1">
                                                {allFailed
                                                    ? 'Transaction was likely rejected on-chain. You can dismiss this or check your wallet.'
                                                    : isResolvingPending
                                                        ? 'Scanning blockchain for your market...'
                                                        : 'Your market was submitted but hasn\'t been found on-chain yet. Auto-retrying every 60 seconds.'}
                                            </p>
                                            {pendingInfo.questions.map((q, i) => {
                                                const status = pendingInfo.statuses[i] || 'pending'
                                                const retries = pendingInfo.retryCounts[i] || 0
                                                return (
                                                    <div key={i} className="flex items-center gap-2 mt-1">
                                                        <p className={`text-xs font-mono truncate flex-1 ${status === 'likely_failed' ? 'text-red-400/70' : 'text-yellow-400/70'}`}>
                                                            &gt; {q}
                                                        </p>
                                                        {status === 'likely_failed' ? (
                                                            <span className="text-[10px] font-mono text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded shrink-0">FAILED</span>
                                                        ) : retries > 0 ? (
                                                            <span className="text-[10px] font-mono text-surface-500 shrink-0">#{retries}</span>
                                                        ) : null}
                                                    </div>
                                                )
                                            })}
                                        </div>
                                        <button
                                            onClick={() => {
                                                clearPendingMarkets()
                                                setPendingInfo({ count: 0, questions: [], statuses: [], retryCounts: [] })
                                            }}
                                            className={`${allFailed ? 'text-red-400/50 hover:text-red-400 border-red-500/20 hover:border-red-500/40' : 'text-yellow-400/50 hover:text-yellow-400 border-yellow-500/20 hover:border-yellow-500/40'} text-xs font-mono px-2 py-1 rounded border transition-all`}
                                            title="Dismiss pending markets"
                                        >
                                            DISMISS
                                        </button>
                                    </div>
                                </motion.div>
                                )
                            })()}

                            {/* Search Bar */}
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.1 }}
                                className="bg-surface-900/50 backdrop-blur-sm rounded-xl border border-surface-800/50 p-4"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="relative flex-1">
                                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-surface-500" />
                                        <input
                                            type="text"
                                            placeholder="SEARCH_MARKETS..."
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            className="w-full pl-12 pr-4 py-3 bg-surface-800/50 border border-surface-700/50 rounded-lg focus:border-brand-500/50 focus:ring-2 focus:ring-brand-500/20 transition-all outline-none placeholder-surface-500 text-white font-mono text-sm"
                                        />
                                    </div>
                                </div>

                                {/* Market Count */}
                                <div className="mt-3 pt-3 border-t border-surface-800/50 flex items-center justify-between text-xs font-mono">
                                    <span className="text-surface-500">
                                        SHOWING {filteredMarkets.length} OF {markets.length} MARKETS
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <div className={cn(
                                            "w-1.5 h-1.5 rounded-full animate-pulse",
                                            isRefreshing ? "bg-accent-400" : "bg-yes-400"
                                        )} />
                                        <span className={isRefreshing ? "text-accent-400" : "text-yes-400"}>
                                            {isRefreshing ? "SYNCING" : "LIVE"}
                                        </span>
                                    </div>
                                </div>
                            </motion.div>

                            {/* Markets List */}
                            <AnimatePresence mode="wait">
                                {isLoading ? (
                                    <div className="space-y-3">
                                        {[...Array(6)].map((_, i) => (
                                            <div key={i} className="bg-surface-900/50 backdrop-blur-sm rounded-xl border border-surface-800/50 p-6 animate-pulse">
                                                <div className="h-4 bg-surface-700 rounded w-1/4 mb-4" />
                                                <div className="h-6 bg-surface-700 rounded w-3/4 mb-4" />
                                                <div className="h-2 bg-surface-700 rounded w-full" />
                                            </div>
                                        ))}
                                    </div>
                                ) : filteredMarkets.length === 0 ? (
                                    <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        className="bg-surface-900/50 backdrop-blur-sm rounded-xl border border-surface-800/50 p-12 text-center"
                                    >
                                        <div className="w-16 h-16 rounded-full bg-surface-800/50 flex items-center justify-center mx-auto mb-4">
                                            <Eye className="w-8 h-8 text-surface-500" />
                                        </div>
                                        <h3 className="text-xl font-bold text-white mb-2 font-mono">NO_MARKETS_FOUND</h3>
                                        <p className="text-surface-400 font-mono text-sm">ADJUST_FILTERS_OR_SEARCH</p>
                                    </motion.div>
                                ) : (
                                    <div className="space-y-3">
                                        {filteredMarkets.map((market, index) => (
                                            <MarketRow
                                                key={market.id}
                                                market={market}
                                                index={index}
                                                onClick={() => handleMarketClick(market)}
                                            />
                                        ))}
                                    </div>
                                )}
                            </AnimatePresence>

                            {/* Load More */}
                            {filteredMarkets.length > 0 && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    whileInView={{ opacity: 1 }}
                                    viewport={{ once: true }}
                                    className="text-center pt-4"
                                >
                                    <button className="px-6 py-3 rounded-lg bg-surface-800/50 border border-surface-700/50 text-surface-400 hover:text-white hover:border-brand-500/30 transition-all font-mono text-sm">
                                        LOAD_MORE_MARKETS
                                    </button>
                                </motion.div>
                            )}
                        </div>
                    </div>
                </div>
            </main>

            <Footer />

            <CreateMarketModal
                isOpen={isCreateMarketOpen}
                onClose={() => setIsCreateMarketOpen(false)}
                onSuccess={(marketId) => {
                    devLog('Market created:', marketId)
                    // Add the new market to the list
                    addMarket(marketId)
                    // Refresh all markets after a short delay to ensure blockchain state is updated
                    setTimeout(() => fetchMarkets(), 3000)
                }}
            />
        </div>
    )
}

// StatTicker Component
function StatTicker({
    icon,
    label,
    value,
    color,
    delay = 0
}: {
    icon: React.ReactNode
    label: string
    value: string
    color: string
    delay?: number
}) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay }}
            className="bg-surface-800/30 backdrop-blur-sm rounded-lg p-3 border border-surface-700/30"
        >
            <div className="flex items-center gap-2 mb-1">
                <div className={cn("text-xs font-mono", color)}>
                    {icon}
                </div>
                <span className="text-xs font-mono text-surface-500">{label}</span>
            </div>
            <div className={cn("text-lg font-bold font-mono", color)}>{value}</div>
        </motion.div>
    )
}
