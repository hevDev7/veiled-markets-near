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
    Lock,
    Grid3x3,
    Bitcoin,
    DollarSign,
    Cpu,
    Vote,
    Loader2,
    Gavel,
    LayoutGrid,
    List,
    Film,
    FlaskConical,
    Bookmark,
    ChevronRight,
    Bell,
    X,
    Coins,
    PieChart,
} from 'lucide-react'
import { useEffect, useMemo, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWalletStore, useBetsStore, type Market, outcomeToIndex } from '@/lib/store'
import { useRealMarketsStore } from '@/lib/market-store'
import { MarketRow } from '@/components/MarketRow'
import { MarketCard } from '@/components/MarketCard'
import { DashboardHeader } from '@/components/DashboardHeader'
import { Footer } from '@/components/Footer'
import { CreateMarketModal } from '@/components/CreateMarketModal'
import { EmptyState } from '@/components/EmptyState'
import { cn, formatCredits, getCategoryEmoji } from '@/lib/utils'
import { resolvePendingMarkets, hasPendingMarkets, getPendingMarketsInfo, clearPendingMarkets, type PendingMarketInfo } from '@/lib/aleo-client'
import { devLog, devWarn } from '../lib/logger'

// ── localStorage helpers for bookmarks ──
const BOOKMARKS_KEY = 'veiled_bookmarks'

function getBookmarks(): string[] {
    try { return JSON.parse(localStorage.getItem(BOOKMARKS_KEY) || '[]') } catch { return [] }
}

// ── Notification types ──
function dismissedKey(address: string) {
    return `veiled_dismissed_notifs_${address.slice(-8)}`
}

function getDismissedNotifs(address: string): Set<string> {
    try { return new Set(JSON.parse(localStorage.getItem(dismissedKey(address)) || '[]')) } catch { return new Set() }
}

function saveDismissedNotifs(address: string, ids: Set<string>) {
    try { localStorage.setItem(dismissedKey(address), JSON.stringify([...ids])) } catch {}
}

interface Notification {
    id: string
    type: 'expiring' | 'won' | 'lost' | 'resolved'
    message: string
    marketId?: string
    time: number
}

// ── Activity Feed types ──
interface ActivityItem {
    id: string
    message: string
    time: number
    marketId: string
}

const categories = [
    { id: 0, name: 'All Markets', icon: Flame },
    { id: 3, name: 'Crypto', icon: Bitcoin },
    { id: 6, name: 'Economics', icon: DollarSign },
    { id: 2, name: 'Sports', icon: Trophy },
    { id: 5, name: 'Tech', icon: Cpu },
    { id: 1, name: 'Politics', icon: Vote },
    { id: 4, name: 'Entertainment', icon: Film },
    { id: 7, name: 'Science', icon: FlaskConical },
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
    const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')
    const [isCreateMarketOpen, setIsCreateMarketOpen] = useState(false)
    const [pendingInfo, setPendingInfo] = useState<PendingMarketInfo>({ count: 0, questions: [], statuses: [], retryCounts: [] })
    const [isResolvingPending, setIsResolvingPending] = useState(false)
    const [tokenFilter, setTokenFilter] = useState<'all' | 'ALEO' | 'USDCX'>('all')
    const [visibleCount, setVisibleCount] = useState(10)
    const [expandPositions, setExpandPositions] = useState(false)
    const [notifications, setNotifications] = useState<Notification[]>([])
    const [showNotifications, setShowNotifications] = useState(false)
    const [activityFeed, setActivityFeed] = useState<ActivityItem[]>([])

    // Redirect handled by ProtectedRoute wrapper in App.tsx

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

    // Generate notifications from market/bet state (filtered by dismissed)
    useEffect(() => {
        if (!wallet.address) return
        const dismissed = getDismissedNotifs(wallet.address)
        const notifs: Notification[] = []

        // Markets expiring within 1 hour
        for (const m of markets) {
            if (m.status === 1 && m.deadlineTimestamp) {
                const hoursLeft = (m.deadlineTimestamp - Date.now()) / 3_600_000
                if (hoursLeft > 0 && hoursLeft <= 1) {
                    const id = `exp-${m.id}`
                    if (!dismissed.has(id)) {
                        notifs.push({
                            id,
                            type: 'expiring',
                            message: `"${m.question.slice(0, 40)}..." expires in < 1 hour`,
                            marketId: m.id,
                            time: Date.now(),
                        })
                    }
                }
            }
        }

        // Bet results
        for (const b of userBets) {
            if (b.status === 'won') {
                const id = `won-${b.id}`
                if (!dismissed.has(id)) {
                    notifs.push({
                        id,
                        type: 'won',
                        message: `You won on "${(b.marketQuestion || 'a market').slice(0, 35)}..."`,
                        marketId: b.marketId,
                        time: b.placedAt,
                    })
                }
            } else if (b.status === 'lost') {
                const id = `lost-${b.id}`
                if (!dismissed.has(id)) {
                    notifs.push({
                        id,
                        type: 'lost',
                        message: `You lost on "${(b.marketQuestion || 'a market').slice(0, 35)}..."`,
                        marketId: b.marketId,
                        time: b.placedAt,
                    })
                }
            }
        }

        setNotifications(notifs.slice(0, 10))
    }, [markets, userBets, wallet.address])

    // Generate activity feed from recent market activity
    useEffect(() => {
        const feed: ActivityItem[] = []
        for (const m of markets) {
            if (m.totalBets > 0 && m.status === 1) {
                feed.push({
                    id: `act-${m.id}`,
                    message: `${m.totalBets} bet${m.totalBets > 1 ? 's' : ''} on "${m.question.slice(0, 30)}..."`,
                    time: m.deadlineTimestamp ? m.deadlineTimestamp - Number(m.deadline) * 1000 : Date.now(),
                    marketId: m.id,
                })
            }
        }
        setActivityFeed(feed.sort((a, b) => b.time - a.time).slice(0, 5))
    }, [markets])

    const handleMarketClick = useCallback((market: Market) => {
        navigate(`/market/${market.id}`)
    }, [navigate])

    // Bookmarks
    const bookmarkedIds = useMemo(() => getBookmarks(), [markets])

    const bookmarkedMarkets = useMemo(() =>
        bookmarkedIds.map(id => markets.find(m => m.id === id)).filter(Boolean) as Market[]
    , [bookmarkedIds, markets])

    // Portfolio value calculation
    const portfolioValue = useMemo(() => {
        let total = 0
        for (const bet of userBets) {
            if (bet.status === 'active') {
                const amount = Number(bet.amount) / 1_000_000
                total += amount
            }
        }
        return total
    }, [userBets])

    // Compute category counts (active markets only, respecting sort mode)
    const categoryCounts = useMemo(() => {
        const counts: Record<number, number> = {}
        for (const market of markets) {
            if (sortBy === 'needs_resolution') {
                const isEnded = market.timeRemaining === 'Ended' || market.status !== 1
                if (!isEnded) continue
            } else {
                if (market.status !== 1 || market.timeRemaining === 'Ended') continue
            }
            if (searchQuery !== '' && !market.question.toLowerCase().includes(searchQuery.toLowerCase())) continue
            counts[market.category] = (counts[market.category] || 0) + 1
        }
        // "All Markets" (id=0) = total of all categories
        counts[0] = Object.values(counts).reduce((sum, c) => sum + c, 0)
        return counts
    }, [markets, sortBy, searchQuery])

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
            // Token type filter
            if (tokenFilter !== 'all' && (market.tokenType || 'ALEO') !== tokenFilter) return false
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

    // Paginated markets
    const paginatedMarkets = useMemo(() => filteredMarkets.slice(0, visibleCount), [filteredMarkets, visibleCount])
    const hasMore = filteredMarkets.length > visibleCount

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

            <main className="pt-20 pb-20 md:pb-0 relative z-10">
                {/* Main Content */}
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

                    {/* Command Center Header — full width */}
                    <div className="rounded-xl border border-brand-500/10 bg-surface-900/30 backdrop-blur-xl p-6 mb-6">
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

                                <div className="flex items-center gap-2">
                                    {/* Notification Bell */}
                                    <button
                                        onClick={() => setShowNotifications(!showNotifications)}
                                        aria-label="Notifications"
                                        className="relative p-2 rounded-lg bg-surface-800/50 border border-surface-700/50 text-surface-400 hover:text-white hover:border-brand-500/30 transition-all focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
                                    >
                                        <Bell className="w-4 h-4" />
                                        {notifications.length > 0 && (
                                            <span className="absolute -top-1 -right-1 w-4 h-4 bg-brand-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center">
                                                {notifications.length}
                                            </span>
                                        )}
                                    </button>

                                    <button
                                        onClick={() => setIsCreateMarketOpen(true)}
                                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-500/10 border border-brand-500/30 text-brand-400 hover:bg-brand-500/20 transition-all font-mono text-sm"
                                    >
                                        <Plus className="w-4 h-4" />
                                        <span>NEW_MARKET</span>
                                    </button>
                                </div>
                            </div>

                            {/* Stats */}
                            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
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
                                    icon={<PieChart className="w-4 h-4" />}
                                    label="PORTFOLIO"
                                    value={`${portfolioValue.toFixed(1)} ALEO`}
                                    color="text-brand-300"
                                    delay={0.15}
                                />
                                <StatTicker
                                    icon={<Trophy className="w-4 h-4" />}
                                    label="WINNINGS"
                                    value={(() => {
                                        const wonBets = userBets.filter(b => b.status === 'won')
                                        const totalWon = wonBets.reduce((sum, b) => {
                                            const payout = b.payoutAmount ? Number(b.payoutAmount) : 0
                                            return sum + payout
                                        }, 0)
                                        return `${(totalWon / 1_000_000).toFixed(1)} ALEO`
                                    })()}
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

                    {/* Sidebar + Content Layout */}
                    <div className="grid lg:grid-cols-[280px_1fr] gap-6">

                        {/* Left Sidebar - Filters */}
                        <motion.div
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="space-y-4 self-start lg:sticky lg:top-24"
                        >
                            {/* Token Type Filter */}
                            <div className="bg-surface-900/50 backdrop-blur-sm rounded-xl border border-surface-800/50 p-4">
                                <div className="flex items-center gap-2 mb-4">
                                    <Coins className="w-4 h-4 text-yellow-400" />
                                    <h3 className="text-sm font-bold text-white font-mono uppercase">Token</h3>
                                </div>
                                <div className="flex gap-1">
                                    {(['all', 'ALEO', 'USDCX'] as const).map((t) => (
                                        <button
                                            key={t}
                                            onClick={() => setTokenFilter(t)}
                                            className={cn(
                                                'flex-1 px-2 py-2 rounded-lg text-xs font-mono font-medium border transition-all',
                                                tokenFilter === t
                                                    ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                                                    : 'border-transparent text-surface-400 hover:text-white hover:bg-surface-800/50'
                                            )}
                                        >
                                            {t === 'all' ? 'ALL' : t}
                                        </button>
                                    ))}
                                </div>
                            </div>

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
                                                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium font-mono border',
                                                selectedCategory === category.id
                                                    ? 'bg-brand-500/20 text-brand-400 border-brand-500/30'
                                                    : 'border-transparent text-surface-400 hover:text-white hover:bg-surface-800/50'
                                            )}
                                        >
                                            <category.icon className="w-4 h-4" />
                                            <span className="flex-1 text-left">{category.name.toUpperCase()}</span>
                                            <span className={cn(
                                                'text-xs tabular-nums px-1.5 py-0.5 rounded-md',
                                                selectedCategory === category.id
                                                    ? 'bg-brand-500/30 text-brand-300'
                                                    : 'bg-surface-800 text-surface-500'
                                            )}>
                                                {categoryCounts[category.id] || 0}
                                            </span>
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
                                                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium font-mono border',
                                                sortBy === option.id
                                                    ? 'bg-accent-500/20 text-accent-400 border-accent-500/30'
                                                    : 'border-transparent text-surface-400 hover:text-white hover:bg-surface-800/50'
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

                            {/* My Active Positions — collapsed by default, max 3 shown */}
                            {(userBets.filter(b => b.status === 'active' && b.type !== 'sell').length + pendingBets.filter(b => b.type !== 'sell').length) > 0 && (() => {
                                const allPositions = [...pendingBets.filter(b => b.type !== 'sell'), ...userBets.filter(b => b.status === 'active' && b.type !== 'sell')]
                                const displayed = expandPositions ? allPositions : allPositions.slice(0, 3)
                                const hasMorePositions = allPositions.length > 3

                                return (
                                <motion.div
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="bg-surface-900/50 backdrop-blur-sm rounded-xl border border-brand-500/20 p-4"
                                >
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <Activity className="w-4 h-4 text-brand-400" />
                                            <h3 className="text-sm font-bold text-white font-mono">
                                                YOUR_POSITIONS ({allPositions.length})
                                            </h3>
                                        </div>
                                        <button
                                            onClick={() => navigate('/bets')}
                                            className="text-xs font-mono text-brand-400 hover:text-brand-300 flex items-center gap-1 transition-colors"
                                        >
                                            VIEW_ALL <ChevronRight className="w-3 h-3" />
                                        </button>
                                    </div>
                                    <div className="space-y-2">
                                        {displayed.map((bet) => {
                                            const market = markets.find(m => m.id === bet.marketId)
                                            return (
                                                <div
                                                    key={bet.id}
                                                    onClick={() => market && handleMarketClick(market)}
                                                    className="flex items-center gap-3 p-2 rounded-lg bg-surface-800/30 hover:bg-surface-800/50 cursor-pointer transition-colors"
                                                >
                                                    <span className="text-lg">{market ? getCategoryEmoji(market.category) : '🎯'}</span>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-xs text-white font-medium truncate">
                                                            {bet.marketQuestion || market?.question || 'Unknown Market'}
                                                        </p>
                                                        <div className="flex items-center gap-2 mt-0.5">
                                                            {(() => {
                                                                const idx = outcomeToIndex(bet.outcome)
                                                                const defaultLabels = ['YES', 'NO', 'OPTION C', 'OPTION D']
                                                                const label = market?.outcomeLabels?.[idx - 1]?.toUpperCase() || defaultLabels[idx - 1] || bet.outcome.toUpperCase()
                                                                const colorMap = [
                                                                    'bg-yes-500/20 text-yes-400',
                                                                    'bg-no-500/20 text-no-400',
                                                                    'bg-purple-500/20 text-purple-400',
                                                                    'bg-yellow-500/20 text-yellow-400',
                                                                ]
                                                                return (
                                                                    <span className={cn(
                                                                        'text-[10px] font-mono font-bold px-1.5 py-0.5 rounded',
                                                                        colorMap[idx - 1] || colorMap[0]
                                                                    )}>
                                                                        {label}
                                                                    </span>
                                                                )
                                                            })()}
                                                            <span className="text-[10px] font-mono text-surface-500">
                                                                {formatCredits(bet.amount)} {bet.tokenType || 'ALEO'}
                                                            </span>
                                                            {bet.status === 'pending' && (
                                                                <span className="text-[10px] font-mono text-yellow-400">PENDING</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <ChevronRight className="w-3.5 h-3.5 text-surface-500" />
                                                </div>
                                            )
                                        })}
                                    </div>
                                    {hasMorePositions && !expandPositions && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setExpandPositions(true) }}
                                            className="w-full mt-2 py-1.5 text-[10px] font-mono text-brand-400 hover:text-brand-300 transition-colors"
                                        >
                                            SHOW_ALL ({allPositions.length - 3} more)
                                        </button>
                                    )}
                                    {hasMorePositions && expandPositions && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setExpandPositions(false) }}
                                            className="w-full mt-2 py-1.5 text-[10px] font-mono text-surface-500 hover:text-surface-300 transition-colors"
                                        >
                                            COLLAPSE
                                        </button>
                                    )}
                                </motion.div>
                                )
                            })()}

                            {/* Bookmarked Markets */}
                            {bookmarkedMarkets.length > 0 && (
                                <motion.div
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="bg-surface-900/50 backdrop-blur-sm rounded-xl border border-yellow-500/20 p-4"
                                >
                                    <div className="flex items-center gap-2 mb-3">
                                        <Bookmark className="w-4 h-4 text-yellow-400" />
                                        <h3 className="text-sm font-bold text-white font-mono">
                                            WATCHLIST ({bookmarkedMarkets.length})
                                        </h3>
                                    </div>
                                    <div className="flex gap-2 overflow-x-auto pb-1">
                                        {bookmarkedMarkets.slice(0, 4).map(market => (
                                            <button
                                                key={market.id}
                                                onClick={() => handleMarketClick(market)}
                                                className="flex-shrink-0 px-3 py-2 rounded-lg bg-surface-800/40 border border-surface-700/50 hover:border-yellow-500/30 transition-colors text-left max-w-[200px]"
                                            >
                                                <p className="text-xs text-white font-medium truncate">{market.question}</p>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="text-[10px] font-mono text-yes-400">
                                                        {market.yesPercentage.toFixed(0)}%
                                                    </span>
                                                    <span className="text-[10px] text-surface-500">
                                                        {formatCredits(market.totalVolume, 0)} vol
                                                    </span>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </motion.div>
                            )}

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
                                <div className="flex items-center gap-3">
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
                                    {/* View Mode Toggle */}
                                    <div className="flex items-center bg-surface-800/50 border border-surface-700/50 rounded-lg p-1">
                                        <button
                                            onClick={() => setViewMode('list')}
                                            className={cn(
                                                'p-2 rounded-md transition-all',
                                                viewMode === 'list'
                                                    ? 'bg-brand-500/20 text-brand-400'
                                                    : 'text-surface-500 hover:text-surface-300'
                                            )}
                                            title="List view"
                                            aria-label="List view"
                                        >
                                            <List className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => setViewMode('grid')}
                                            className={cn(
                                                'p-2 rounded-md transition-all',
                                                viewMode === 'grid'
                                                    ? 'bg-brand-500/20 text-brand-400'
                                                    : 'text-surface-500 hover:text-surface-300'
                                            )}
                                            title="Grid view"
                                            aria-label="Grid view"
                                        >
                                            <LayoutGrid className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>

                                {/* Market Count */}
                                <div className="mt-3 pt-3 border-t border-surface-800/50 flex items-center justify-between text-xs font-mono">
                                    <span className="text-surface-500">
                                        SHOWING {Math.min(visibleCount, filteredMarkets.length)} OF {filteredMarkets.length} MARKETS
                                        {tokenFilter !== 'all' && <span className="text-yellow-400 ml-1">({tokenFilter})</span>}
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
                            <>
                                {isLoading ? (
                                    <div className="space-y-3">
                                        {[...Array(5)].map((_, i) => (
                                            <div
                                                key={i}
                                                className="bg-surface-900/50 backdrop-blur-sm rounded-lg border border-surface-800/50 p-4"
                                                style={{ animationDelay: `${i * 150}ms` }}
                                            >
                                                <div className="flex items-center gap-4">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-3 mb-2">
                                                            <div className="skeleton w-8 h-8 rounded-full flex-shrink-0" />
                                                            <div className="skeleton h-3 w-20 rounded" />
                                                            <div className="skeleton h-3 w-14 rounded" />
                                                        </div>
                                                        <div className="skeleton h-5 w-3/4 rounded mb-3" />
                                                        <div className="max-w-md space-y-1.5">
                                                            <div className="flex justify-between">
                                                                <div className="skeleton h-3 w-12 rounded" />
                                                                <div className="skeleton h-3 w-12 rounded" />
                                                            </div>
                                                            <div className="skeleton h-1.5 w-full rounded-full" />
                                                        </div>
                                                    </div>
                                                    <div className="hidden md:flex items-center gap-6">
                                                        <div className="text-center space-y-1">
                                                            <div className="skeleton h-3 w-14 rounded mx-auto" />
                                                            <div className="skeleton h-4 w-16 rounded mx-auto" />
                                                        </div>
                                                        <div className="text-center space-y-1">
                                                            <div className="skeleton h-3 w-14 rounded mx-auto" />
                                                            <div className="skeleton h-4 w-16 rounded mx-auto" />
                                                        </div>
                                                        <div className="text-center space-y-1">
                                                            <div className="skeleton h-3 w-10 rounded mx-auto" />
                                                            <div className="skeleton h-4 w-20 rounded mx-auto" />
                                                        </div>
                                                    </div>
                                                    <div className="skeleton w-5 h-5 rounded" />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : filteredMarkets.length === 0 ? (
                                    <EmptyState
                                        icon={<Search className="w-8 h-8 text-surface-500" />}
                                        title={searchQuery ? `No results for "${searchQuery}"` : selectedCategory !== 0 ? 'No markets in this category' : 'No active markets'}
                                        subtitle={searchQuery ? 'Try a different search term or browse all markets.' : selectedCategory !== 0 ? 'No markets in this category yet. Check back soon!' : 'No active markets at the moment. Create the first one!'}
                                        action={(searchQuery || selectedCategory !== 0)
                                            ? { label: 'Clear Filters', onClick: () => { setSearchQuery(''); setSelectedCategory(0); setSortBy('volume') } }
                                            : { label: 'Create Market', onClick: () => setIsCreateMarketOpen(true) }
                                        }
                                    />
                                ) : viewMode === 'list' ? (
                                    <div className="space-y-3">
                                        {paginatedMarkets.map((market, index) => (
                                            <MarketRow
                                                key={market.id}
                                                market={market}
                                                index={index}
                                                onClick={() => handleMarketClick(market)}
                                            />
                                        ))}
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                                        {paginatedMarkets.map((market, index) => (
                                            <MarketCard
                                                key={market.id}
                                                market={market}
                                                index={index}
                                                onClick={() => handleMarketClick(market)}
                                            />
                                        ))}
                                    </div>
                                )}
                            </>

                            {/* Load More */}
                            {hasMore && (
                                <div className="text-center pt-4">
                                    <button
                                        onClick={() => setVisibleCount(prev => prev + 10)}
                                        className="px-6 py-3 rounded-lg bg-surface-800/50 border border-surface-700/50 text-surface-400 hover:text-white hover:border-brand-500/30 transition-all font-mono text-sm"
                                    >
                                        LOAD_MORE ({filteredMarkets.length - visibleCount} remaining)
                                    </button>
                                </div>
                            )}

                            {/* Activity Feed */}
                            {activityFeed.length > 0 && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="bg-surface-900/50 backdrop-blur-sm rounded-xl border border-surface-800/50 p-4"
                                >
                                    <div className="flex items-center gap-2 mb-3">
                                        <Zap className="w-4 h-4 text-accent-400" />
                                        <h3 className="text-sm font-bold text-white font-mono">MARKET_ACTIVITY</h3>
                                    </div>
                                    <div className="space-y-2">
                                        {activityFeed.map(item => (
                                            <div
                                                key={item.id}
                                                onClick={() => {
                                                    const m = markets.find(mk => mk.id === item.marketId)
                                                    if (m) handleMarketClick(m)
                                                }}
                                                className="flex items-center gap-3 p-2 rounded-lg hover:bg-surface-800/30 cursor-pointer transition-colors"
                                            >
                                                <div className="w-1.5 h-1.5 rounded-full bg-accent-400 flex-shrink-0" />
                                                <p className="text-xs text-surface-300 font-mono flex-1 truncate">{item.message}</p>
                                                <ChevronRight className="w-3 h-3 text-surface-500 flex-shrink-0" />
                                            </div>
                                        ))}
                                    </div>
                                </motion.div>
                            )}

                            {/* Notification Panel */}
                            <AnimatePresence>
                                {showNotifications && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        className="fixed top-20 right-4 z-50 w-80 bg-surface-900/95 backdrop-blur-xl rounded-xl border border-surface-700/50 shadow-2xl p-4"
                                    >
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-2">
                                                <Bell className="w-4 h-4 text-brand-400" />
                                                <h3 className="text-sm font-bold text-white font-mono">NOTIFICATIONS</h3>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {notifications.length > 0 && (
                                                    <button
                                                        onClick={() => {
                                                            if (!wallet.address) return
                                                            const dismissed = getDismissedNotifs(wallet.address)
                                                            notifications.forEach(n => dismissed.add(n.id))
                                                            saveDismissedNotifs(wallet.address, dismissed)
                                                            setNotifications([])
                                                        }}
                                                        className="text-xs text-surface-500 hover:text-white font-mono"
                                                    >
                                                        CLEAR_ALL
                                                    </button>
                                                )}
                                                <button onClick={() => setShowNotifications(false)} className="text-surface-500 hover:text-white">
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                        {notifications.length === 0 ? (
                                            <p className="text-xs text-surface-500 font-mono text-center py-4">NO_NEW_NOTIFICATIONS</p>
                                        ) : (
                                            <div className="space-y-2 max-h-64 overflow-y-auto">
                                                {notifications.map(n => (
                                                    <div
                                                        key={n.id}
                                                        className={cn(
                                                            'p-2 rounded-lg flex items-start gap-2 transition-colors text-xs font-mono',
                                                            n.type === 'won' ? 'bg-yes-500/10 hover:bg-yes-500/20' :
                                                            n.type === 'lost' ? 'bg-no-500/10 hover:bg-no-500/20' :
                                                            n.type === 'expiring' ? 'bg-yellow-500/10 hover:bg-yellow-500/20' :
                                                            'bg-surface-800/30 hover:bg-surface-800/50'
                                                        )}
                                                    >
                                                        <span
                                                            className={cn(
                                                                'flex-1 cursor-pointer',
                                                                n.type === 'won' ? 'text-yes-400' :
                                                                n.type === 'lost' ? 'text-no-400' :
                                                                n.type === 'expiring' ? 'text-yellow-400' :
                                                                'text-surface-300'
                                                            )}
                                                            onClick={() => {
                                                                if (n.marketId) {
                                                                    const m = markets.find(mk => mk.id === n.marketId)
                                                                    if (m) handleMarketClick(m)
                                                                }
                                                                setShowNotifications(false)
                                                            }}
                                                        >
                                                            {n.type === 'won' ? '🏆 ' : n.type === 'lost' ? '❌ ' : n.type === 'expiring' ? '⏰ ' : '📊 '}
                                                            {n.message}
                                                        </span>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation()
                                                                if (!wallet.address) return
                                                                const dismissed = getDismissedNotifs(wallet.address)
                                                                dismissed.add(n.id)
                                                                saveDismissedNotifs(wallet.address, dismissed)
                                                                setNotifications(prev => prev.filter(x => x.id !== n.id))
                                                            }}
                                                            className="text-surface-600 hover:text-surface-300 mt-0.5 flex-shrink-0"
                                                        >
                                                            <X className="w-3 h-3" />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </motion.div>
                                )}
                            </AnimatePresence>
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
