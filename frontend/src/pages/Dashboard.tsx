import { motion, AnimatePresence } from 'framer-motion'
import {
    Search, TrendingUp, Clock, Flame, Activity, Bitcoin,
    DollarSign, Cpu, Vote, Loader2, Gavel, LayoutGrid, List, Film, FlaskConical,
    Bookmark, ChevronRight, Bell, X, Trophy, SlidersHorizontal, Globe,
} from 'lucide-react'
import { useEffect, useMemo, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWalletStore, useBetsStore, type Market, outcomeToIndex } from '@/lib/store'
import { useRealMarketsStore } from '@/lib/market-store'
import { useWalletModal } from '@provablehq/aleo-wallet-adaptor-react-ui'
import { MarketRow } from '@/components/MarketRow'
import { MarketCard } from '@/components/MarketCard'
import { DashboardHeader } from '@/components/DashboardHeader'
import { Footer } from '@/components/Footer'
import { EmptyState } from '@/components/EmptyState'
import { DashboardHero } from '@/components/DashboardHero'
import { cn, formatCredits, getCategoryEmoji } from '@/lib/utils'
import { resolvePendingMarkets, hasPendingMarkets, getPendingMarketsInfo, clearPendingMarkets, type PendingMarketInfo } from '@/lib/aleo-client'
import { devWarn } from '../lib/logger'

// ── localStorage helpers ──
const BOOKMARKS_KEY = 'veiled_bookmarks'
function getBookmarks(): string[] {
    try { return JSON.parse(localStorage.getItem(BOOKMARKS_KEY) || '[]') } catch { return [] }
}
function dismissedKey(address: string) { return `veiled_dismissed_notifs_${address.slice(-8)}` }
function getDismissedNotifs(address: string): Set<string> {
    try { return new Set(JSON.parse(localStorage.getItem(dismissedKey(address)) || '[]')) } catch { return new Set() }
}
function saveDismissedNotifs(address: string, ids: Set<string>) {
    try { localStorage.setItem(dismissedKey(address), JSON.stringify([...ids])) } catch {}
}

interface Notification { id: string; type: 'expiring' | 'won' | 'lost' | 'resolved'; message: string; marketId?: string; time: number }
interface ActivityItem { id: string; message: string; time: number; marketId: string }

const categories = [
    { id: 0, name: 'All Markets', icon: Flame, emoji: '◉' },
    { id: 1, name: 'Politics', icon: Vote, emoji: '🏛' },
    { id: 3, name: 'Crypto', icon: Bitcoin, emoji: '₿' },
    { id: 2, name: 'Sports', icon: Trophy, emoji: '⚽' },
    { id: 6, name: 'Macro', icon: DollarSign, emoji: '📈' },
    { id: 5, name: 'AI & Tech', icon: Cpu, emoji: '🤖' },
    { id: 4, name: 'Culture', icon: Film, emoji: '🎭' },
    { id: 8, name: 'Climate', icon: Globe, emoji: '🌍' },
    { id: 7, name: 'Science', icon: FlaskConical, emoji: '🔬' },
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
    const { setVisible: setModalVisible } = useWalletModal()

    useEffect(() => { setModalVisible(false) }, [setModalVisible])

    const [selectedCategory, setSelectedCategory] = useState(0)
    const [searchQuery, setSearchQuery] = useState('')
    const [sortBy, setSortBy] = useState('volume')
    const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid')
    const [pendingInfo, setPendingInfo] = useState<PendingMarketInfo>({ count: 0, questions: [], statuses: [], retryCounts: [] })
    const [isResolvingPending, setIsResolvingPending] = useState(false)
    const [tokenFilter, setTokenFilter] = useState<'all' | 'ALEO' | 'USDCX' | 'USAD'>('all')
    const [marketTypeFilter, setMarketTypeFilter] = useState<'all' | 'binary' | 'multi' | 'scalar' | 'conditional'>('all')
    const [visibleCount, setVisibleCount] = useState(12)
    const [expandPositions, setExpandPositions] = useState(false)
    const [notifications, setNotifications] = useState<Notification[]>([])
    const [showNotifications, setShowNotifications] = useState(false)
    const [activityFeed, setActivityFeed] = useState<ActivityItem[]>([])
    const [showFilters, setShowFilters] = useState(false)

    // === ALL BUSINESS LOGIC PRESERVED EXACTLY ===
    useEffect(() => {
        fetchMarkets()
        fetchUserBets()
        syncBetStatuses()
        setPendingInfo(getPendingMarketsInfo())
        const tryResolvePending = () => {
            if (!hasPendingMarkets()) { setPendingInfo({ count: 0, questions: [], statuses: [], retryCounts: [] }); return }
            setIsResolvingPending(true)
            resolvePendingMarkets().then(resolvedIds => {
                if (resolvedIds.length > 0) { resolvedIds.forEach(id => addMarket(id)); fetchMarkets() }
                setPendingInfo(getPendingMarketsInfo())
            }).catch(err => devWarn('[Dashboard] Pending resolve error:', err)).finally(() => setIsResolvingPending(false))
        }
        tryResolvePending()
        const pendingInterval = setInterval(tryResolvePending, 60_000)
        const refreshInterval = setInterval(fetchMarkets, 60000)
        const syncInterval = setInterval(syncBetStatuses, 60_000)
        return () => { clearInterval(pendingInterval); clearInterval(refreshInterval); clearInterval(syncInterval) }
    }, [fetchMarkets, fetchUserBets, addMarket, syncBetStatuses])

    useEffect(() => {
        if (!wallet.address) return
        const dismissed = getDismissedNotifs(wallet.address)
        const notifs: Notification[] = []
        for (const m of markets) {
            if (m.status === 1 && m.deadlineTimestamp) {
                const hoursLeft = (m.deadlineTimestamp - Date.now()) / 3_600_000
                if (hoursLeft > 0 && hoursLeft <= 1) {
                    const id = `exp-${m.id}`
                    if (!dismissed.has(id)) notifs.push({ id, type: 'expiring', message: `"${m.question.slice(0, 40)}..." expires in < 1 hour`, marketId: m.id, time: Date.now() })
                }
            }
        }
        for (const b of userBets) {
            if (b.status === 'won') { const id = `won-${b.id}`; if (!dismissed.has(id)) notifs.push({ id, type: 'won', message: `You won on "${(b.marketQuestion || 'a market').slice(0, 35)}..."`, marketId: b.marketId, time: b.placedAt }) }
            else if (b.status === 'lost') { const id = `lost-${b.id}`; if (!dismissed.has(id)) notifs.push({ id, type: 'lost', message: `You lost on "${(b.marketQuestion || 'a market').slice(0, 35)}..."`, marketId: b.marketId, time: b.placedAt }) }
        }
        setNotifications(notifs.slice(0, 10))
    }, [markets, userBets, wallet.address])

    useEffect(() => {
        const feed: ActivityItem[] = []
        for (const m of markets) {
            if (m.totalBets > 0 && m.status === 1) feed.push({ id: `act-${m.id}`, message: `${m.totalBets} bet${m.totalBets > 1 ? 's' : ''} on "${m.question.slice(0, 30)}..."`, time: m.deadlineTimestamp ? m.deadlineTimestamp - Number(m.deadline) * 1000 : Date.now(), marketId: m.id })
        }
        setActivityFeed(feed.sort((a, b) => b.time - a.time).slice(0, 5))
    }, [markets])

    const handleMarketClick = useCallback((market: Market) => navigate(`/market/${market.id}`), [navigate])
    const bookmarkedIds = useMemo(() => getBookmarks(), [markets])
    const bookmarkedMarkets = useMemo(() => bookmarkedIds.map(id => markets.find(m => m.id === id)).filter(Boolean) as Market[], [bookmarkedIds, markets])
    const categoryCounts = useMemo(() => {
        const counts: Record<number, number> = {}
        for (const market of markets) {
            if (sortBy === 'needs_resolution') { if (market.timeRemaining !== 'Ended' && market.status === 1) continue }
            else { if (market.status !== 1 || market.timeRemaining === 'Ended') continue }
            if (searchQuery !== '' && !market.question.toLowerCase().includes(searchQuery.toLowerCase())) continue
            counts[market.category] = (counts[market.category] || 0) + 1
        }
        counts[0] = Object.values(counts).reduce((sum, c) => sum + c, 0)
        return counts
    }, [markets, sortBy, searchQuery])

    const filteredMarkets = markets
        .filter(market => {
            if (sortBy === 'needs_resolution') { if (market.timeRemaining !== 'Ended' && market.status === 1) return false }
            else { if (market.status !== 1 || market.timeRemaining === 'Ended') return false }
            if (selectedCategory !== 0 && market.category !== selectedCategory) return false
            if (searchQuery !== '' && !market.question.toLowerCase().includes(searchQuery.toLowerCase())) return false
            if (tokenFilter !== 'all' && (market.tokenType || 'ALEO') !== tokenFilter) return false
            // Market type filter
            if (marketTypeFilter !== 'all') {
                const outcomes = market.numOutcomes ?? 2
                if (marketTypeFilter === 'binary' && outcomes !== 2) return false
                if (marketTypeFilter === 'multi' && outcomes <= 2) return false
            }
            return true
        })
        .sort((a, b) => {
            switch (sortBy) {
                case 'volume': return Number(b.totalVolume - a.totalVolume)
                case 'ending': return Number(a.deadline - b.deadline)
                case 'newest': return Number(b.deadline - a.deadline)
                case 'needs_resolution': return a.status - b.status
                default: return 0
            }
        })

    const paginatedMarkets = useMemo(() => filteredMarkets.slice(0, visibleCount), [filteredMarkets, visibleCount])
    const hasMore = filteredMarkets.length > visibleCount

    if (!wallet.connected) return null

    return (
        <div className="min-h-screen bg-surface-950 relative overflow-hidden">
            {/* Background */}
            <div className="fixed inset-0 z-0">
                <div className="absolute inset-0 opacity-[0.02]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '64px 64px' }} />
                <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-brand-400/[0.03] rounded-full blur-[120px]" />
                <div className="absolute bottom-1/4 left-1/4 w-80 h-80 bg-yes-400/[0.02] rounded-full blur-[100px]" />
            </div>

            <DashboardHeader />

            <main className="pt-20 pb-20 md:pb-0 relative z-10">
                <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-8">

                    {/* Hero */}
                    <DashboardHero
                        markets={markets}
                        onCreateMarket={() => navigate('/create')}
                        activityFeed={activityFeed}
                        onMarketClick={handleMarketClick}
                    />

                    {/* Pending Markets Banner */}
                    {pendingInfo.count > 0 && (() => {
                        const allFailed = pendingInfo.statuses.every(s => s === 'likely_failed')
                        return (
                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                            className={cn('mb-6 rounded-xl p-4', allFailed ? 'bg-no-400/[0.06] border border-no-400/[0.12]' : 'bg-brand-400/[0.04] border border-brand-400/[0.1]')}>
                            <div className="flex items-start gap-3">
                                <div className="mt-0.5">
                                    {allFailed ? <Activity className="w-5 h-5 text-no-400" /> : isResolvingPending ? <Loader2 className="w-5 h-5 text-brand-400 animate-spin" /> : <Clock className="w-5 h-5 text-brand-400" />}
                                </div>
                                <div className="flex-1">
                                    <p className={cn('text-sm font-semibold', allFailed ? 'text-no-400' : 'text-brand-300')}>
                                        {allFailed ? `${pendingInfo.count} market${pendingInfo.count > 1 ? 's' : ''} likely failed` : `${pendingInfo.count} pending market${pendingInfo.count > 1 ? 's' : ''} awaiting confirmation`}
                                    </p>
                                    <p className="text-xs text-surface-400 mt-1">
                                        {allFailed ? 'Transaction was likely rejected. You can dismiss or check your wallet.' : isResolvingPending ? 'Scanning blockchain...' : 'Auto-retrying every 60 seconds.'}
                                    </p>
                                    {pendingInfo.questions.map((q, i) => {
                                        const status = pendingInfo.statuses[i] || 'pending'
                                        const retries = pendingInfo.retryCounts[i] || 0
                                        return (
                                            <div key={i} className="flex items-center gap-2 mt-1">
                                                <p className={cn('text-xs font-mono truncate flex-1', status === 'likely_failed' ? 'text-no-400/70' : 'text-brand-400/70')}>&gt; {q}</p>
                                                {status === 'likely_failed' ? <span className="text-2xs font-mono text-no-400 bg-no-400/10 px-1.5 py-0.5 rounded">FAILED</span>
                                                    : retries > 0 ? <span className="text-2xs font-mono text-surface-500">#{retries}</span> : null}
                                            </div>
                                        )
                                    })}
                                </div>
                                <button onClick={() => { clearPendingMarkets(); setPendingInfo({ count: 0, questions: [], statuses: [], retryCounts: [] }) }}
                                    className={cn('text-xs px-3 py-1.5 rounded-lg border font-medium transition-all', allFailed ? 'text-no-400/60 hover:text-no-400 border-no-400/20 hover:border-no-400/40' : 'text-brand-400/60 hover:text-brand-400 border-brand-400/20 hover:border-brand-400/40')}>
                                    Dismiss
                                </button>
                            </div>
                        </motion.div>
                        )
                    })()}

                    {/* Your Positions */}
                    {(userBets.filter(b => b.status === 'active' && b.type !== 'sell').length + pendingBets.filter(b => b.type !== 'sell').length) > 0 && (() => {
                        const allPositions = [...pendingBets.filter(b => b.type !== 'sell'), ...userBets.filter(b => b.status === 'active' && b.type !== 'sell')]
                        const displayed = expandPositions ? allPositions : allPositions.slice(0, 3)
                        const hasMorePositions = allPositions.length > 3
                        return (
                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                            className="mb-6 rounded-2xl p-5" style={{ background: 'linear-gradient(135deg, rgba(22, 26, 36, 0.8) 0%, rgba(13, 15, 20, 0.9) 100%)', border: '1px solid rgba(201, 168, 76, 0.1)', boxShadow: '0 1px 0 0 rgba(255, 255, 255, 0.02) inset' }}>
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <Activity className="w-4 h-4 text-brand-400" />
                                    <h3 className="text-sm font-semibold text-white">Your Positions ({allPositions.length})</h3>
                                </div>
                                <button onClick={() => navigate('/portfolio')} className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1 transition-colors font-medium">
                                    View All <ChevronRight className="w-3 h-3" />
                                </button>
                            </div>
                            <div className="space-y-2">
                                {displayed.map((bet) => {
                                    const market = markets.find(m => m.id === bet.marketId)
                                    return (
                                        <div key={bet.id} onClick={() => market && handleMarketClick(market)}
                                            className="flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.02] hover:bg-white/[0.04] cursor-pointer transition-colors border border-white/[0.02]">
                                            <span className="text-lg">{market ? getCategoryEmoji(market.category) : '🎯'}</span>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs text-white font-medium truncate">{bet.marketQuestion || market?.question || 'Unknown Market'}</p>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    {(() => {
                                                        const idx = outcomeToIndex(bet.outcome)
                                                        const defaultLabels = ['YES', 'NO', 'OPTION C', 'OPTION D']
                                                        const label = market?.outcomeLabels?.[idx - 1]?.toUpperCase() || defaultLabels[idx - 1] || bet.outcome.toUpperCase()
                                                        const colorMap = ['bg-yes-400/15 text-yes-400', 'bg-no-400/15 text-no-400', 'bg-purple-400/15 text-purple-400', 'bg-yellow-400/15 text-yellow-400']
                                                        return <span className={cn('text-2xs font-mono font-bold px-1.5 py-0.5 rounded', colorMap[idx - 1] || colorMap[0])}>{label}</span>
                                                    })()}
                                                    <span className="text-2xs font-mono text-surface-500">{formatCredits(bet.amount)} {bet.tokenType || 'ALEO'}</span>
                                                    {bet.status === 'pending' && <span className="text-2xs font-mono text-brand-400">PENDING</span>}
                                                </div>
                                            </div>
                                            <ChevronRight className="w-3.5 h-3.5 text-surface-500" />
                                        </div>
                                    )
                                })}
                            </div>
                            {hasMorePositions && !expandPositions && (
                                <button onClick={(e) => { e.stopPropagation(); setExpandPositions(true) }}
                                    className="w-full mt-2 py-1.5 text-2xs text-brand-400 hover:text-brand-300 transition-colors font-medium">
                                    Show all ({allPositions.length - 3} more)
                                </button>
                            )}
                            {hasMorePositions && expandPositions && (
                                <button onClick={(e) => { e.stopPropagation(); setExpandPositions(false) }}
                                    className="w-full mt-2 py-1.5 text-2xs text-surface-500 hover:text-surface-300 transition-colors font-medium">Collapse</button>
                            )}
                        </motion.div>
                        )
                    })()}

                    {/* Bookmarked Markets */}
                    {bookmarkedMarkets.length > 0 && (
                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                            className="mb-6 rounded-2xl p-5 bg-white/[0.01] border border-brand-400/[0.08]">
                            <div className="flex items-center gap-2 mb-3">
                                <Bookmark className="w-4 h-4 text-brand-400" />
                                <h3 className="text-sm font-semibold text-white">Watchlist ({bookmarkedMarkets.length})</h3>
                            </div>
                            <div className="flex gap-2 overflow-x-auto pb-1">
                                {bookmarkedMarkets.slice(0, 4).map(market => (
                                    <button key={market.id} onClick={() => handleMarketClick(market)}
                                        className="flex-shrink-0 px-3 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:border-brand-400/20 transition-colors text-left max-w-[200px]">
                                        <p className="text-xs text-white font-medium truncate">{market.question}</p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-2xs font-mono text-yes-400">{market.yesPercentage.toFixed(0)}%</span>
                                            <span className="text-2xs text-surface-500">{formatCredits(market.totalVolume, 0)} vol</span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </motion.div>
                    )}

                    {/* Search + Filters + Categories */}
                    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-6 space-y-4">
                        {/* Search bar */}
                        <div className="flex flex-row gap-3 items-center">
                            <div className="relative flex-1">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
                                <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search markets..."
                                    className="w-full pl-11 pr-4 py-2.5 rounded-xl bg-surface-900/80 text-white placeholder:text-surface-500 text-sm transition-all duration-200 outline-none"
                                    style={{ border: '1px solid rgba(255, 255, 255, 0.06)' }}
                                    onFocus={(e) => e.currentTarget.style.borderColor = 'rgba(201, 168, 76, 0.3)'}
                                    onBlur={(e) => e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.06)'}
                                />
                            </div>
                            <button onClick={() => setShowFilters(!showFilters)}
                                className={cn('btn-secondary gap-2 px-5 py-2.5 text-sm whitespace-nowrap flex items-center', showFilters && 'border-brand-400/30 text-brand-400')}>
                                <SlidersHorizontal className="w-4 h-4 flex-shrink-0" /> Filters
                            </button>
                            <div className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                                <button onClick={() => setViewMode('grid')}
                                    className={cn('p-2.5 rounded-lg transition-all duration-200', viewMode === 'grid' ? 'bg-white/[0.06] text-white' : 'text-surface-500 hover:text-surface-300')}>
                                    <LayoutGrid className="w-4 h-4" />
                                </button>
                                <button onClick={() => setViewMode('list')}
                                    className={cn('p-2.5 rounded-lg transition-all duration-200', viewMode === 'list' ? 'bg-white/[0.06] text-white' : 'text-surface-500 hover:text-surface-300')}>
                                    <List className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* Expanded filters */}
                        <AnimatePresence>
                            {showFilters && (
                                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}>
                                    <div className="rounded-2xl p-5 space-y-5" style={{ background: 'linear-gradient(135deg, rgba(22, 26, 36, 0.8) 0%, rgba(13, 15, 20, 0.9) 100%)', border: '1px solid rgba(255, 255, 255, 0.04)' }}>
                                        {/* Token filter */}
                                        <div>
                                            <label className="text-2xs font-semibold text-surface-400 mb-3 block uppercase tracking-wider">Token Type</label>
                                            <div className="flex gap-2">
                                                {(['all', 'ALEO', 'USDCX', 'USAD'] as const).map((t) => (
                                                    <button key={t} onClick={() => setTokenFilter(t)}
                                                        className={cn('px-4 py-2 rounded-lg text-xs font-medium transition-all duration-200', tokenFilter === t ? 'bg-brand-400/[0.12] text-brand-400 border border-brand-400/[0.2]' : 'bg-white/[0.02] text-surface-400 border border-white/[0.04] hover:bg-white/[0.04]')}>
                                                        {t === 'all' ? 'All' : t}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        {/* Market Type */}
                                        <div>
                                            <label className="text-2xs font-semibold text-surface-400 mb-3 block uppercase tracking-wider">Market Type</label>
                                            <div className="flex flex-wrap gap-2">
                                                {[
                                                    { id: 'all' as const, label: 'All Types' },
                                                    { id: 'binary' as const, label: 'Binary' },
                                                    { id: 'multi' as const, label: 'Multi-Outcome' },
                                                    { id: 'scalar' as const, label: 'Scalar' },
                                                    { id: 'conditional' as const, label: 'Conditional' },
                                                ].map((type) => (
                                                    <button key={type.id} onClick={() => setMarketTypeFilter(type.id)}
                                                        className={cn('px-4 py-2 rounded-lg text-xs font-medium transition-all duration-200',
                                                            marketTypeFilter === type.id ? 'bg-brand-400/[0.12] text-brand-400 border border-brand-400/[0.2]' : 'bg-white/[0.02] text-surface-400 border border-white/[0.04] hover:bg-white/[0.04]',
                                                            (type.id === 'scalar' || type.id === 'conditional') && 'opacity-50 cursor-not-allowed'
                                                        )}
                                                        disabled={type.id === 'scalar' || type.id === 'conditional'}
                                                        title={type.id === 'scalar' ? 'Coming soon — Range-based predictions' : type.id === 'conditional' ? 'Coming soon — Dependent market outcomes' : ''}>
                                                        {type.label}
                                                        {(type.id === 'scalar' || type.id === 'conditional') && <span className="ml-1 text-2xs opacity-60">Soon</span>}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        {/* Sort */}
                                        <div>
                                            <label className="text-2xs font-semibold text-surface-400 mb-3 block uppercase tracking-wider">Sort By</label>
                                            <div className="flex flex-wrap gap-2">
                                                {sortOptions.map((opt) => (
                                                    <button key={opt.id} onClick={() => setSortBy(opt.id)}
                                                        className={cn('flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all duration-200', sortBy === opt.id ? 'bg-brand-400/[0.12] text-brand-400 border border-brand-400/[0.2]' : 'bg-white/[0.02] text-surface-400 border border-white/[0.04] hover:bg-white/[0.04]')}>
                                                        <opt.icon className="w-3.5 h-3.5" /> {opt.name}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Category pills + Live indicator */}
                        <div className="flex items-center gap-2">
                            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none flex-1">
                                {categories.map((cat) => (
                                    <button key={cat.id} onClick={() => setSelectedCategory(cat.id)}
                                        className={cn('flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all duration-200',
                                            selectedCategory === cat.id
                                                ? 'bg-brand-400/[0.12] text-brand-400 border border-brand-400/[0.2]'
                                                : 'bg-white/[0.02] text-surface-200 border border-white/[0.04] hover:bg-white/[0.04] hover:text-white'
                                        )}>
                                        <span>{cat.emoji}</span>
                                        {cat.name}
                                        <span className="text-2xs tabular-nums opacity-60">{categoryCounts[cat.id] || 0}</span>
                                    </button>
                                ))}
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0 pb-2">
                                <div className={cn('w-1.5 h-1.5 rounded-full animate-pulse', isRefreshing ? 'bg-brand-400' : 'bg-yes-400')} />
                                <span className={cn('text-xs font-medium', isRefreshing ? 'text-brand-400' : 'text-yes-400')}>
                                    {isRefreshing ? 'Syncing' : 'Live'}
                                </span>
                            </div>
                        </div>
                    </motion.div>

                    {/* Markets */}
                    {isLoading ? (
                        <div className={viewMode === 'grid' ? 'grid md:grid-cols-2 xl:grid-cols-3 gap-5' : 'space-y-3'}>
                            {[...Array(6)].map((_, i) => (
                                <div key={i} className="rounded-2xl p-5" style={{ background: 'linear-gradient(135deg, rgba(22, 26, 36, 0.8) 0%, rgba(13, 15, 20, 0.9) 100%)', border: '1px solid rgba(255, 255, 255, 0.04)' }}>
                                    <div className="flex items-center gap-3 mb-3"><div className="skeleton w-8 h-8 rounded-full" /><div className="skeleton h-3 w-20 rounded" /></div>
                                    <div className="skeleton h-5 w-3/4 rounded mb-3" />
                                    <div className="skeleton h-2 w-full rounded-full mb-4" />
                                    <div className="flex gap-2"><div className="skeleton h-8 flex-1 rounded-lg" /><div className="skeleton h-8 flex-1 rounded-lg" /></div>
                                </div>
                            ))}
                        </div>
                    ) : filteredMarkets.length === 0 ? (
                        <EmptyState
                            icon={<Search className="w-8 h-8 text-surface-500" />}
                            title={searchQuery ? `No results for "${searchQuery}"` : selectedCategory !== 0 ? 'No markets in this category' : 'No active markets'}
                            subtitle={searchQuery ? 'Try a different search term.' : 'Create the first prediction market!'}
                            action={(searchQuery || selectedCategory !== 0)
                                ? { label: 'Clear Filters', onClick: () => { setSearchQuery(''); setSelectedCategory(0); setSortBy('volume') } }
                                : { label: 'Create Market', onClick: () => navigate('/create') }}
                        />
                    ) : viewMode === 'grid' ? (
                        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
                            {paginatedMarkets.map((market, index) => (
                                <MarketCard key={market.id} market={market} index={index} onClick={() => handleMarketClick(market)} />
                            ))}
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {paginatedMarkets.map((market, index) => (
                                <MarketRow key={market.id} market={market} index={index} onClick={() => handleMarketClick(market)} />
                            ))}
                        </div>
                    )}

                    {/* Load More */}
                    {hasMore && (
                        <div className="text-center pt-6">
                            <button onClick={() => setVisibleCount(prev => prev + 12)}
                                className="px-6 py-3 rounded-xl bg-white/[0.04] border border-white/[0.06] text-surface-400 hover:text-white hover:border-brand-400/20 transition-all text-sm font-medium">
                                Load more ({filteredMarkets.length - visibleCount} remaining)
                            </button>
                        </div>
                    )}


                    {/* Notification Panel */}
                    <AnimatePresence>
                        {showNotifications && (
                            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                                className="fixed top-20 right-4 z-50 w-80 rounded-2xl p-4 shadow-2xl"
                                style={{ background: 'linear-gradient(135deg, rgba(22, 26, 36, 0.98) 0%, rgba(13, 15, 20, 0.99) 100%)', border: '1px solid rgba(255, 255, 255, 0.06)', backdropFilter: 'blur(20px)' }}>
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2"><Bell className="w-4 h-4 text-brand-400" /><h3 className="text-sm font-semibold text-white">Notifications</h3></div>
                                    <div className="flex items-center gap-2">
                                        {notifications.length > 0 && (
                                            <button onClick={() => { if (!wallet.address) return; const d = getDismissedNotifs(wallet.address); notifications.forEach(n => d.add(n.id)); saveDismissedNotifs(wallet.address, d); setNotifications([]) }}
                                                className="text-xs text-surface-500 hover:text-white font-medium">Clear all</button>
                                        )}
                                        <button onClick={() => setShowNotifications(false)} className="text-surface-500 hover:text-white"><X className="w-4 h-4" /></button>
                                    </div>
                                </div>
                                {notifications.length === 0 ? (
                                    <p className="text-xs text-surface-500 text-center py-4">No new notifications</p>
                                ) : (
                                    <div className="space-y-2 max-h-64 overflow-y-auto">
                                        {notifications.map(n => (
                                            <div key={n.id} className={cn('p-2.5 rounded-xl flex items-start gap-2 transition-colors text-xs',
                                                n.type === 'won' ? 'bg-yes-400/[0.06] hover:bg-yes-400/[0.1]' : n.type === 'lost' ? 'bg-no-400/[0.06] hover:bg-no-400/[0.1]' : n.type === 'expiring' ? 'bg-brand-400/[0.06] hover:bg-brand-400/[0.1]' : 'bg-white/[0.02] hover:bg-white/[0.04]')}>
                                                <span className={cn('flex-1 cursor-pointer', n.type === 'won' ? 'text-yes-400' : n.type === 'lost' ? 'text-no-400' : n.type === 'expiring' ? 'text-brand-400' : 'text-surface-300')}
                                                    onClick={() => { if (n.marketId) { const m = markets.find(mk => mk.id === n.marketId); if (m) handleMarketClick(m) } setShowNotifications(false) }}>
                                                    {n.type === 'won' ? '🏆 ' : n.type === 'lost' ? '❌ ' : n.type === 'expiring' ? '⏰ ' : '📊 '}{n.message}
                                                </span>
                                                <button onClick={(e) => { e.stopPropagation(); if (!wallet.address) return; const d = getDismissedNotifs(wallet.address); d.add(n.id); saveDismissedNotifs(wallet.address, d); setNotifications(prev => prev.filter(x => x.id !== n.id)) }}
                                                    className="text-surface-600 hover:text-surface-300 mt-0.5 flex-shrink-0"><X className="w-3 h-3" /></button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </main>

            <Footer />
        </div>
    )
}
