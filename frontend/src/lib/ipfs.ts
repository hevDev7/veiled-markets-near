/**
 * IPFS / Pinata Service
 * Client-side upload of market metadata to IPFS via Pinata.
 * Market metadata is public — no encryption needed.
 * Upload returns a CID used to fetch from any IPFS gateway.
 */

import { devLog, devWarn } from './logger'

const PINATA_JWT = import.meta.env.VITE_PINATA_JWT as string | undefined
const PINATA_API_URL = 'https://api.pinata.cloud'
const PINATA_GATEWAY = (import.meta.env.VITE_PINATA_GATEWAY as string) || 'https://gateway.pinata.cloud'
const PUBLIC_GATEWAY = 'https://ipfs.io'

// In-memory cache: CID → metadata (immutable once pinned, never expires)
const metadataCache = new Map<string, MarketMetadataIPFS>()

/** Check if Pinata JWT is configured */
export function isPinataAvailable(): boolean {
  return !!PINATA_JWT && PINATA_JWT.length > 20
}

/** Metadata structure stored on IPFS */
export interface MarketMetadataIPFS {
  version: 1
  question: string
  description: string
  category: number
  outcomeLabels: string[]
  resolutionSource: string
  questionHash: string
  creator: string
  tokenType: 'ALEO' | 'USDCX'
  createdAt: number
}

/**
 * Upload market metadata JSON to Pinata IPFS.
 * Returns the IPFS CID on success, or null on failure.
 */
export async function uploadMarketMetadata(
  metadata: MarketMetadataIPFS,
): Promise<string | null> {
  if (!isPinataAvailable()) {
    devWarn('[IPFS] Pinata JWT not configured, skipping upload')
    return null
  }

  try {
    const response = await fetch(`${PINATA_API_URL}/pinning/pinJSONToIPFS`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${PINATA_JWT}`,
      },
      body: JSON.stringify({
        pinataContent: metadata,
        pinataMetadata: {
          name: `veiled-market-${metadata.questionHash.slice(0, 20)}`,
          keyvalues: {
            app: 'veiled-markets',
            questionHash: metadata.questionHash,
            category: String(metadata.category),
          },
        },
        pinataOptions: { cidVersion: 1 },
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      devWarn('[IPFS] Pinata upload failed:', response.status, errorText)
      return null
    }

    const result = await response.json()
    const cid: string = result.IpfsHash
    devLog('[IPFS] Uploaded metadata, CID:', cid)

    metadataCache.set(cid, metadata)
    return cid
  } catch (err) {
    devWarn('[IPFS] Upload error:', err)
    return null
  }
}

/**
 * Fetch market metadata from IPFS by CID.
 * Tries Pinata gateway first, then public gateway.
 * Returns cached data if available (content is immutable).
 */
export async function fetchMarketMetadata(
  cid: string,
): Promise<MarketMetadataIPFS | null> {
  const cached = metadataCache.get(cid)
  if (cached) return cached

  const gateways = [
    `${PINATA_GATEWAY}/ipfs/${cid}`,
    `${PUBLIC_GATEWAY}/ipfs/${cid}`,
  ]

  for (const url of gateways) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 8000)

      const response = await fetch(url, { signal: controller.signal })
      clearTimeout(timeoutId)

      if (!response.ok) continue

      const data = await response.json()

      if (data.version === 1 && data.question && data.questionHash) {
        metadataCache.set(cid, data as MarketMetadataIPFS)
        devLog('[IPFS] Fetched metadata from', url.includes('pinata') ? 'Pinata' : 'public', 'gateway')
        return data as MarketMetadataIPFS
      }

      devWarn('[IPFS] Invalid metadata structure from:', url)
    } catch {
      devWarn('[IPFS] Gateway fetch failed:', url)
    }
  }

  devWarn('[IPFS] All gateways failed for CID:', cid)
  return null
}

/**
 * Fetch metadata for multiple CIDs in parallel (max 5 concurrent).
 * Returns a map of CID → metadata (only successful fetches).
 */
export async function fetchMultipleMetadata(
  cids: string[],
): Promise<Map<string, MarketMetadataIPFS>> {
  const results = new Map<string, MarketMetadataIPFS>()

  const uncached = cids.filter(cid => {
    const cached = metadataCache.get(cid)
    if (cached) {
      results.set(cid, cached)
      return false
    }
    return true
  })

  if (uncached.length === 0) return results

  const BATCH_SIZE = 5
  for (let i = 0; i < uncached.length; i += BATCH_SIZE) {
    const batch = uncached.slice(i, i + BATCH_SIZE)
    const fetched = await Promise.allSettled(
      batch.map(async cid => {
        const data = await fetchMarketMetadata(cid)
        return { cid, data }
      }),
    )

    for (const result of fetched) {
      if (result.status === 'fulfilled' && result.value.data) {
        results.set(result.value.cid, result.value.data)
      }
    }
  }

  return results
}

/** Clear the in-memory metadata cache */
export function clearIPFSCache(): void {
  metadataCache.clear()
}

/**
 * Test Pinata connection by calling the auth test endpoint.
 * Returns true if JWT is valid, false otherwise.
 */
export async function testPinataConnection(): Promise<{ ok: boolean; message: string }> {
  if (!isPinataAvailable()) {
    return { ok: false, message: 'VITE_PINATA_JWT not configured or too short' }
  }

  try {
    const response = await fetch(`${PINATA_API_URL}/data/testAuthentication`, {
      headers: { Authorization: `Bearer ${PINATA_JWT}` },
    })

    if (!response.ok) {
      const text = await response.text()
      return { ok: false, message: `HTTP ${response.status}: ${text}` }
    }

    const data = await response.json()
    return { ok: true, message: `Authenticated as: ${data.message || JSON.stringify(data)}` }
  } catch (err) {
    return { ok: false, message: `Connection error: ${err}` }
  }
}
