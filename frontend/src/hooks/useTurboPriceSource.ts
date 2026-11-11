import { useEffect, useState } from 'react'
import { TURBO_ORACLE_URL } from '@/lib/near/config'

/** The turbo oracle prices rounds with Pyth Hermes when it has an API key, otherwise with CoinGecko. */
export type TurboPriceSource = 'pyth' | 'coingecko'

const COINGECKO_SLUGS: Record<string, string> = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', DOGE: 'dogecoin', XRP: 'xrp',
  BNB: 'bnb', ADA: 'cardano', AVAX: 'avalanche', LINK: 'chainlink', DOT: 'polkadot',
}

export interface TurboSourceInfo {
  /** "Pyth Network" */
  name: string
  /** Short form for tight spots: "Pyth" */
  short: string
  /** Header tag: "Pyth-resolved" */
  label: string
  feedUrl: (symbol: string) => string
  feedText: (symbol: string) => string
  /** One sentence on what the source is. */
  about: string
}

export const TURBO_SOURCES: Record<TurboPriceSource, TurboSourceInfo> = {
  pyth: {
    name: 'Pyth Network',
    short: 'Pyth',
    label: 'Pyth-resolved',
    feedUrl: (s) => `https://www.pyth.network/price-feeds/crypto-${s.toLowerCase()}-usd`,
    feedText: (s) => `pyth.network/price-feeds/crypto-${s.toLowerCase()}-usd`,
    about:
      'Pyth Network aggregates prices from 90+ institutional publishers including major exchanges, market makers, and trading firms.',
  },
  coingecko: {
    name: 'CoinGecko',
    short: 'CoinGecko',
    label: 'CoinGecko-priced',
    feedUrl: (s) => `https://www.coingecko.com/en/coins/${COINGECKO_SLUGS[s] ?? s.toLowerCase()}`,
    feedText: (s) => `coingecko.com/en/coins/${COINGECKO_SLUGS[s] ?? s.toLowerCase()}`,
    about:
      "CoinGecko aggregates spot prices across many exchanges and refreshes about once a minute; the oracle records each price it used in the audit trail.",
  },
}

let pending: Promise<TurboPriceSource | null> | null = null

function fetchSource(): Promise<TurboPriceSource | null> {
  if (!TURBO_ORACLE_URL) return Promise.resolve(null)
  pending ??= fetch(`${TURBO_ORACLE_URL}/health`)
    .then((r) => (r.ok ? r.json() : null))
    .then((h) => (h?.price_source === 'pyth' || h?.price_source === 'coingecko' ? h.price_source : null))
    .catch(() => null)
  return pending
}

/** The price source the running oracle reports; CoinGecko (the keyless default) until it answers. */
export function useTurboPriceSource(): TurboSourceInfo {
  const [source, setSource] = useState<TurboPriceSource | null>(null)
  useEffect(() => {
    let cancelled = false
    fetchSource().then((s) => {
      if (!cancelled) setSource(s)
    })
    return () => {
      cancelled = true
    }
  }, [])
  return TURBO_SOURCES[source ?? 'coingecko']
}
