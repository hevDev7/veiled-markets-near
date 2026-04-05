import { useEffect, useState } from 'react'
import {
  DEFAULT_MARKET_GOVERNANCE_CONFIG,
  getMarketGovernanceConfig,
  getProgramIdForToken,
  type MarketGovernanceConfig,
} from '@/lib/aleo-client'

export function useMarketGovernanceConfig(
  tokenType: 'ALEO' | 'USDCX' | 'USAD' = 'ALEO'
): MarketGovernanceConfig {
  const [governanceConfig, setGovernanceConfig] = useState<MarketGovernanceConfig>(
    DEFAULT_MARKET_GOVERNANCE_CONFIG
  )

  useEffect(() => {
    let cancelled = false

    const loadGovernanceConfig = async () => {
      try {
        const nextConfig = await getMarketGovernanceConfig(getProgramIdForToken(tokenType))
        if (!cancelled) {
          setGovernanceConfig(nextConfig)
        }
      } catch {
        if (!cancelled) {
          setGovernanceConfig(DEFAULT_MARKET_GOVERNANCE_CONFIG)
        }
      }
    }

    void loadGovernanceConfig()

    return () => {
      cancelled = true
    }
  }, [tokenType])

  return governanceConfig
}
