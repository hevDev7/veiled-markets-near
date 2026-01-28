import { motion } from 'framer-motion'
import { Search, TrendingUp, Clock, Flame, Bitcoin, DollarSign, Trophy, Cpu, Vote } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useMarketsStore, type Market } from '@/lib/store'
import { MarketCard } from './MarketCard'
import { BettingModal } from './BettingModal'
import { cn } from '@/lib/utils'

const categories = [
  { id: 0, name: 'All', icon: Flame },
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

export function MarketsSection() {
  const { markets, isLoading, fetchMarkets, selectMarket, selectedMarket } = useMarketsStore()
  const [selectedCategory, setSelectedCategory] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState('volume')
  const [isModalOpen, setIsModalOpen] = useState(false)

  useEffect(() => {
    fetchMarkets()
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
    selectMarket(market)
    setIsModalOpen(true)
  }

  return (
    <section id="markets" className="py-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <h2 className="font-display text-4xl sm:text-5xl font-bold text-white mb-4">
            Active Markets
          </h2>
          <p className="text-lg text-surface-400 max-w-2xl mx-auto">
            Browse prediction markets and place private bets with zero-knowledge proofs
          </p>
        </motion.div>

        {/* Filters */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
          className="mb-8"
        >
          {/* Search */}
          <div className="relative max-w-md mx-auto mb-6">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-surface-500" />
            <input
              type="text"
              placeholder="Search markets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-field pl-12"
            />
          </div>

          {/* Categories */}
          <div className="flex flex-wrap justify-center gap-2 mb-6">
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() => setSelectedCategory(category.id)}
                className={cn(
                  'px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200',
                  selectedCategory === category.id
                    ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/25'
                    : 'bg-surface-800/50 text-surface-400 hover:text-white hover:bg-surface-700/50'
                )}
              >
                {category.name}
              </button>
            ))}
          </div>

          {/* Sort Options */}
          <div className="flex justify-center gap-2">
            {sortOptions.map((option) => (
              <button
                key={option.id}
                onClick={() => setSortBy(option.id)}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200',
                  sortBy === option.id
                    ? 'bg-surface-700 text-white'
                    : 'text-surface-500 hover:text-surface-300'
                )}
              >
                <option.icon className="w-3.5 h-3.5" />
                {option.name}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Markets Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="glass-card p-6 animate-pulse">
                <div className="h-4 bg-surface-700 rounded w-1/4 mb-4" />
                <div className="h-6 bg-surface-700 rounded w-3/4 mb-4" />
                <div className="h-2 bg-surface-700 rounded w-full mb-4" />
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {[...Array(3)].map((_, j) => (
                    <div key={j} className="h-16 bg-surface-800 rounded-lg" />
                  ))}
                </div>
                <div className="flex gap-2">
                  <div className="h-10 bg-surface-800 rounded-lg flex-1" />
                  <div className="h-10 bg-surface-800 rounded-lg flex-1" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredMarkets.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-20"
          >
            <div className="w-16 h-16 rounded-full bg-surface-800 flex items-center justify-center mx-auto mb-4">
              <Search className="w-8 h-8 text-surface-500" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">No markets found</h3>
            <p className="text-surface-400">Try adjusting your search or filters</p>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredMarkets.map((market, index) => (
              <MarketCard
                key={market.id}
                market={market}
                index={index}
                onClick={() => handleMarketClick(market)}
              />
            ))}
          </div>
        )}

        {/* Load More */}
        {filteredMarkets.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-center mt-12"
          >
            <button className="btn-secondary">
              Load More Markets
            </button>
          </motion.div>
        )}
      </div>

      {/* Betting Modal */}
      <BettingModal
        market={selectedMarket}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false)
          selectMarket(null)
        }}
      />
    </section>
  )
}

