// ============================================================================
// Chainlink Data Streams Backend Proxy
// ============================================================================
// This proxy keeps API credentials server-side (never exposed to browser).
// Deploy this as a separate service or add to your existing backend.
//
// Setup:
//   1. npm install express cors
//   2. Set environment variables:
//      CHAINLINK_API_KEY=your-api-key
//      CHAINLINK_API_SECRET=your-api-secret
//   3. Run: tsx src/chainlink-proxy.ts
//   4. Set VITE_CHAINLINK_PROXY_URL=http://localhost:3001 in frontend .env
//   5. Change PRICE_SOURCE to 'chainlink' in chainlink-price-service.ts
//
// Endpoints:
//   GET /api/price/:feedId          → Latest price for a feed
//   GET /api/history/:feedId?days=1 → Price history
//   GET /health                     → Health check
// ============================================================================

import { createHmac, createHash } from 'crypto'
import https from 'https'

const PORT = process.env.PORT || 3001
const API_KEY = process.env.CHAINLINK_API_KEY || ''
const API_SECRET = process.env.CHAINLINK_API_SECRET || ''

// Chainlink Data Streams endpoints
const CHAINLINK_HOST = process.env.CHAINLINK_HOST || 'api.testnet-dataengine.chain.link' // Use api.dataengine.chain.link for mainnet

// ── Known Feed IDs ──
const KNOWN_FEEDS: Record<string, string> = {
  'btc-usd': '0x0003789de471c089e388aa56ae58b398ac25dbcca7e5b4acb06ab06935c5367c',
}

// ── HMAC Authentication (Chainlink Data Streams) ──

function generateHMAC(
  method: string,
  path: string,
  body: string,
  apiKey: string,
  apiSecret: string
): { signature: string; timestamp: number } {
  const timestamp = Date.now()
  const bodyHash = createHash('sha256').update(body || '').digest('hex')
  const stringToSign = `${method} ${path} ${bodyHash} ${apiKey} ${timestamp}`
  const signature = createHmac('sha256', apiSecret).update(stringToSign).digest('hex')
  return { signature, timestamp }
}

function generateAuthHeaders(method: string, path: string): Record<string, string> {
  const { signature, timestamp } = generateHMAC(method, path, '', API_KEY, API_SECRET)
  return {
    Authorization: API_KEY,
    'X-Authorization-Timestamp': timestamp.toString(),
    'X-Authorization-Signature-SHA256': signature,
  }
}

// ── HTTP Client ──

function makeRequest(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const options: https.RequestOptions = {
      hostname: CHAINLINK_HOST,
      path,
      method: 'GET',
      headers: generateAuthHeaders('GET', path),
    }

    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data)
        } else {
          reject(new Error(`Chainlink API error (${res.statusCode}): ${data}`))
        }
      })
    })

    req.on('error', (error) => reject(new Error(`Request error: ${error.message}`)))
    req.end()
  })
}

// ── Simple HTTP Server (no Express dependency) ──

import http from 'http'
import { URL } from 'url'

// Price cache (avoid hammering Chainlink API)
const priceCache = new Map<string, { data: any; timestamp: number }>()
const CACHE_TTL = 1000 // 1 second cache

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(200)
    res.end()
    return
  }

  const url = new URL(req.url || '/', `http://localhost:${PORT}`)
  const pathname = url.pathname

  try {
    // Health check
    if (pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        status: 'ok',
        source: 'chainlink-data-streams',
        hasCredentials: !!(API_KEY && API_SECRET),
        host: CHAINLINK_HOST,
      }))
      return
    }

    // GET /api/price/:feedId
    const priceMatch = pathname.match(/^\/api\/price\/(.+)$/)
    if (priceMatch) {
      const feedId = priceMatch[1]

      // Check cache
      const cached = priceCache.get(feedId)
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(cached.data))
        return
      }

      if (!API_KEY || !API_SECRET) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'API credentials not configured' }))
        return
      }

      const path = `/api/v1/reports/latest?feedID=${feedId}`
      const response = await makeRequest(path)
      const parsed = JSON.parse(response)

      // Decode the report (simplified — full decode requires ABI parsing)
      // For now, return raw report for frontend to display
      const result = {
        feedId,
        report: parsed.report,
        timestamp: Date.now(),
        source: 'chainlink-data-streams',
      }

      // Cache it
      priceCache.set(feedId, { data: result, timestamp: Date.now() })

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(result))
      return
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Not found' }))

  } catch (error: any) {
    console.error('Proxy error:', error.message)
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: error.message }))
  }
})

server.listen(PORT, () => {
  console.log(`\n🔗 Chainlink Data Streams Proxy`)
  console.log(`   Port: ${PORT}`)
  console.log(`   Host: ${CHAINLINK_HOST}`)
  console.log(`   Credentials: ${API_KEY ? '✅ Configured' : '❌ Missing'}`)
  console.log(`   Known feeds:`)
  for (const [name, id] of Object.entries(KNOWN_FEEDS)) {
    console.log(`     ${name}: ${id.slice(0, 20)}...`)
  }
  console.log(`\n   Endpoints:`)
  console.log(`     GET /api/price/:feedId`)
  console.log(`     GET /health`)
  console.log('')
})
