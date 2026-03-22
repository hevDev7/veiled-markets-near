// ============================================================================
// MARKET THUMBNAIL RESOLVER
// ============================================================================
// Matches market question keywords to specific, relevant thumbnail images.
// Falls back to category-based generic images if no keyword match is found.
// All images are from free sources (Wikipedia Commons, Unsplash, crypto logos).
// ============================================================================

// ── Keyword → Image mapping ──
// Each entry: [keywords[], imageUrl]
// First match wins, so more specific patterns should come first.
const KEYWORD_IMAGES: Array<[string[], string]> = [
  // ── Crypto: Specific coins & protocols ──
  [['bitcoin', 'btc'],       'https://assets.coingecko.com/coins/images/1/small/bitcoin.png'],
  [['ethereum', 'eth'],      'https://assets.coingecko.com/coins/images/279/small/ethereum.png'],
  [['solana', 'sol'],        'https://assets.coingecko.com/coins/images/4128/small/solana.png'],
  [['aleo'],                 'https://assets.coingecko.com/coins/images/29936/small/aleo.png'],
  [['cardano', 'ada'],       'https://assets.coingecko.com/coins/images/975/small/cardano.png'],
  [['polkadot', 'dot'],      'https://assets.coingecko.com/coins/images/12171/small/polkadot.png'],
  [['avalanche', 'avax'],    'https://assets.coingecko.com/coins/images/12559/small/Avalanche_Circle_RedWhite_Trans.png'],
  [['bnb', 'binance'],       'https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png'],
  [['xrp', 'ripple'],        'https://assets.coingecko.com/coins/images/44/small/xrp-symbol-white-128.png'],
  [['dogecoin', 'doge'],     'https://assets.coingecko.com/coins/images/5/small/dogecoin.png'],
  [['tron', 'trx'],          'https://assets.coingecko.com/coins/images/1094/small/tron-logo.png'],
  [['chainlink', 'link'],    'https://assets.coingecko.com/coins/images/877/small/chainlink-new-logo.png'],
  [['uniswap', 'uni'],       'https://assets.coingecko.com/coins/images/12504/small/uni.jpg'],
  [['stablecoin', 'usdt', 'usdc', 'tether'], 'https://assets.coingecko.com/coins/images/325/small/Tether.png'],
  [['defi', 'tvl'],          'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=80&h=80&fit=crop&q=60'],
  [['nft'],                  'https://images.unsplash.com/photo-1646463623770-2a50b720d160?w=80&h=80&fit=crop&q=60'],

  // ── Sports ──
  [['world cup', 'fifa'],        'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=80&h=80&fit=crop&q=60'], // soccer ball
  [['champions league', 'ucl'], 'https://images.unsplash.com/photo-1522778119026-d647f0596c20?w=80&h=80&fit=crop&q=60'], // football stadium
  [['premier league', 'epl'],   'https://images.unsplash.com/photo-1522778119026-d647f0596c20?w=80&h=80&fit=crop&q=60'],
  [['nba', 'basketball'],       'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=80&h=80&fit=crop&q=60'], // basketball
  [['nfl', 'super bowl'],       'https://images.unsplash.com/photo-1566577739112-5180d4bf9390?w=80&h=80&fit=crop&q=60'], // american football
  [['formula 1', 'f1'],         'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=80&h=80&fit=crop&q=60'], // racing
  [['olympics', 'olympic'],     'https://images.unsplash.com/photo-1461896836934-bd45ba8c0e78?w=80&h=80&fit=crop&q=60'], // stadium
  [['mma', 'ufc'],              'https://images.unsplash.com/photo-1549719386-74dfcbf7dbed?w=80&h=80&fit=crop&q=60'], // fighting
  [['tennis', 'wimbledon'],     'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=80&h=80&fit=crop&q=60'],
  [['cricket'],                 'https://images.unsplash.com/photo-1531415074968-036ba1b575da?w=80&h=80&fit=crop&q=60'],

  // ── AI & Tech ──
  [['openai', 'gpt', 'chatgpt'],    'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=80&h=80&fit=crop&q=60'], // AI chip
  [['anthropic', 'claude'],          'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=80&h=80&fit=crop&q=60'],
  [['google', 'gemini', 'alphabet'], 'https://images.unsplash.com/photo-1573804633927-bfcbcd909acd?w=80&h=80&fit=crop&q=60'], // google office
  [['apple', 'iphone', 'vision pro'], 'https://images.unsplash.com/photo-1611186871348-b1ce696e52c9?w=80&h=80&fit=crop&q=60'], // apple product
  [['microsoft', 'copilot'],         'https://images.unsplash.com/photo-1633419461186-7d40a38105ec?w=80&h=80&fit=crop&q=60'], // microsoft
  [['meta', 'facebook', 'instagram'],'https://images.unsplash.com/photo-1636114673156-052a83459fc1?w=80&h=80&fit=crop&q=60'], // VR headset
  [['tesla'],                        'https://images.unsplash.com/photo-1560958089-b8a1929cea89?w=80&h=80&fit=crop&q=60'], // tesla car
  [['nvidia'],                       'https://images.unsplash.com/photo-1555618254-5e7f05da3aa1?w=80&h=80&fit=crop&q=60'], // GPU
  [['spacex', 'starship'],           'https://images.unsplash.com/photo-1516849841032-87cbac4d88f7?w=80&h=80&fit=crop&q=60'], // rocket
  [['x.ai', 'xai', 'grok'],         'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=80&h=80&fit=crop&q=60'],

  // ── Politics & Geopolitics ──
  [['trump'],                    'https://images.unsplash.com/photo-1580128660010-fd027e1e587a?w=80&h=80&fit=crop&q=60'], // white house
  [['biden'],                    'https://images.unsplash.com/photo-1580128660010-fd027e1e587a?w=80&h=80&fit=crop&q=60'],
  [['us election', 'presidential', 'congress', 'senate', 'primary'], 'https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=80&h=80&fit=crop&q=60'], // capitol
  [['eu ', 'european union', 'mica'], 'https://images.unsplash.com/photo-1519677100203-a0e668c92439?w=80&h=80&fit=crop&q=60'], // EU flags
  [['china', 'chinese'],             'https://images.unsplash.com/photo-1547981609-4b6bfe67ca0b?w=80&h=80&fit=crop&q=60'], // great wall
  [['russia', 'russian'],            'https://images.unsplash.com/photo-1513326738677-b964603b136d?w=80&h=80&fit=crop&q=60'], // kremlin
  [['ukraine', 'ukrainian'],         'https://images.unsplash.com/photo-1589810264340-0ce27bfbf751?w=80&h=80&fit=crop&q=60'], // ukraine flag

  // ── Macro & Finance ──
  [['fed ', 'federal reserve', 'fomc', 'interest rate'], 'https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=80&h=80&fit=crop&q=60'], // dollar bills
  [['gold', 'xau'],                'https://images.unsplash.com/photo-1610375461246-83df859d849d?w=80&h=80&fit=crop&q=60'], // gold bars
  [['oil', 'crude', 'opec'],       'https://images.unsplash.com/photo-1611273426858-450d8e3c9fce?w=80&h=80&fit=crop&q=60'], // oil barrels
  [['inflation', 'cpi'],           'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=80&h=80&fit=crop&q=60'], // charts
  [['stock', 's&p', 'nasdaq', 'dow'], 'https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=80&h=80&fit=crop&q=60'], // stock exchange
  [['us debt', 'national debt', 'treasury'], 'https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=80&h=80&fit=crop&q=60'],

  // ── Science ──
  [['superconductor'],           'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=80&h=80&fit=crop&q=60'], // science
  [['mars', 'nasa'],             'https://images.unsplash.com/photo-1614728263952-84ea256f9679?w=80&h=80&fit=crop&q=60'], // mars
  [['quantum'],                  'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=80&h=80&fit=crop&q=60'],

  // ── Climate ──
  [['climate', 'temperature', 'hottest', 'warming'], 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=80&h=80&fit=crop&q=60'], // nature
  [['hurricane', 'typhoon', 'cyclone', 'disaster'],  'https://images.unsplash.com/photo-1527482797697-8795b05a13fe?w=80&h=80&fit=crop&q=60'], // storm

  // ── Culture & Entertainment ──
  [['netflix'],                  'https://images.unsplash.com/photo-1522869635100-9f4c5e86aa37?w=80&h=80&fit=crop&q=60'], // streaming
  [['disney'],                   'https://images.unsplash.com/photo-1597655601841-214a4cfe8b2c?w=80&h=80&fit=crop&q=60'], // castle
  [['spotify'],                  'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=80&h=80&fit=crop&q=60'], // music
  [['k-pop', 'kpop', 'bts', 'blackpink'], 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=80&h=80&fit=crop&q=60'],
  [['oscar', 'academy award'],  'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=80&h=80&fit=crop&q=60'], // cinema
  [['grammy'],                  'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=80&h=80&fit=crop&q=60'],
  [['streaming'],               'https://images.unsplash.com/photo-1522869635100-9f4c5e86aa37?w=80&h=80&fit=crop&q=60'],
]

// ── Category fallback images ──
const CATEGORY_THUMBS: Record<number, string> = {
  1: 'https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=80&h=80&fit=crop&q=60', // Politics
  2: 'https://images.unsplash.com/photo-1461896836934-bd45ba8c0e78?w=80&h=80&fit=crop&q=60', // Sports
  3: 'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=80&h=80&fit=crop&q=60', // Crypto
  4: 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=80&h=80&fit=crop&q=60', // Culture
  5: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=80&h=80&fit=crop&q=60', // AI & Tech
  6: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=80&h=80&fit=crop&q=60', // Macro
  7: 'https://images.unsplash.com/photo-1507413245164-6160d8298b31?w=80&h=80&fit=crop&q=60', // Science
  8: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=80&h=80&fit=crop&q=60', // Climate
  99: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=80&h=80&fit=crop&q=60', // Other
}

// ── Simple in-memory cache ──
const cache = new Map<string, string>()

/**
 * Resolve the best thumbnail image URL for a market.
 * Priority: custom URL > keyword match > category fallback.
 */
export function getMarketThumbnail(question: string, category: number, customUrl?: string): string {
  // Custom thumbnail from creator takes highest priority
  if (customUrl) return customUrl

  const cacheKey = `${category}:${question}`
  const cached = cache.get(cacheKey)
  if (cached) return cached

  const q = question.toLowerCase()

  for (const [keywords, imageUrl] of KEYWORD_IMAGES) {
    if (keywords.some(kw => q.includes(kw))) {
      cache.set(cacheKey, imageUrl)
      return imageUrl
    }
  }

  const fallback = CATEGORY_THUMBS[category] || CATEGORY_THUMBS[99]
  cache.set(cacheKey, fallback)
  return fallback
}
