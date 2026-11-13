import { useEffect, useState } from 'react'
import { getNearConfig } from '@/lib/near/chain'
import { WINNER_CLAIM_PRIORITY_BLOCKS } from '@/lib/aleo-client'

/**
 * The contract's winner-claim priority window, in ticks (get_config winner_claim_priority): after a market's dispute
 * window, winners redeem first, and LP exits and creator fees wait this long. Until the config loads, the longer
 * Aleo-era default keeps those buttons locked rather than offering a call the contract would refuse.
 */
export function useWinnerClaimPriority(): bigint {
  const [ticks, setTicks] = useState<bigint>(WINNER_CLAIM_PRIORITY_BLOCKS)
  useEffect(() => {
    let cancelled = false
    getNearConfig()
      .then((c) => { if (!cancelled) setTicks(BigInt(c.winner_claim_priority)) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])
  return ticks
}
