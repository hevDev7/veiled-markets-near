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
    RefreshCw
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWalletStore, type Market } from '@/lib/store'
import { useRealMarketsStore } from '@/lib/market-store'
import { MarketRow } from '@/components/MarketRow'
import { DashboardHeader } from '@/components/DashboardHeader'
import { Footer } from '@/components/Footer'
import { CreateMarketModal } from '@/components/CreateMarketModal'
import { cn, formatCredits } from '@/lib/utils'

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
]

export function Dashboard() {
    const navigate = useNavigate()
    const { wallet } = useWalletStore()
    const { markets, isLoading, fetchMarkets, addMarket } = useRealMarketsStore()

    const [selectedCategory, setSelectedCategory] = useState(0)
    const [searchQuery, setSearchQuery] = useState('')
    const [sortBy, setSortBy] = useState('volume')
    const [isCreateMarketOpen, setIsCreateMarketOpen] = useState(false)

    useEffect(() => {
        if (!wallet.connected) {
            navigate('/')
        }
    }, [wallet.connected, navigate])

    useEffect(() => {
        fetchMarkets()
        // Refresh markets every 30 seconds
        const interval = setInterval(fetchMarkets, 30000)
        return () => clearInterval(interval)
    }, [fetchMarkets])

    const filteredMarkets = markets
        .filter(market =>
            (selectedCategory === 0 || market.category === selectedCategory) &&
            (searchQuery === '' || market.question.toLowerCase().includes(searchQuery.toLowerCase()))
        )
        .sort((a, b) => {
            switch (sortBy) {
                case 'volume':
                    return Number(b.totalVolume - a.totalVolume)
                case 'ending':
                    return Number(a.deadline - b.deadline)
                case 'newest':
                    return Number(b.deadline - a.deadline)
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
                {/* On-Chain Data Notice Banner */}
                <div className="border-b border-brand-500/20 bg-brand-500/5 backdrop-blur-xl">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
                        <div className="flex items-center gap-3 text-sm">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-yes-400 animate-pulse" />
                                <span className="text-brand-400 font-mono font-bold">ON_CHAIN_DATA</span>
                            </div>
                            <span className="text-brand-300/80 font-mono">
                                Showing real markets from veiled_markets.aleo contract. Create your first market to get started!
                            </span>
                            <button
                                onClick={() => fetchMarkets()}
                                className="ml-auto flex items-center gap-2 text-brand-400 hover:text-brand-300 font-mono text-xs"
                            >
                                <RefreshCw className="w-3 h-3" />
                                REFRESH
                            </button>
                        </div>
                    </div>
                </div>

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
                                value="0"
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
                                label="TOTAL_TRADES"
                                value="0"
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
                                        <div className="w-1.5 h-1.5 rounded-full bg-yes-400 animate-pulse" />
                                        <span className="text-yes-400">LIVE</span>
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
                    console.log('Market created:', marketId)
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
