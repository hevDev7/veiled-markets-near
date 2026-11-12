// Live data for the landing page: markets from the contract, Turbo rounds and prices from the oracle, and a few
// protocol facts read from chain. Every number shown on the landing page comes from here or is a fixed protocol fact.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react'
import { useWalletModal } from '@provablehq/aleo-wallet-adaptor-react-ui'
import { useWalletStore, type Market } from '@/lib/store'
import { useRealMarketsStore } from '@/lib/market-store'
import { cachedView } from '@/lib/near/rpc'
import { getNearConfig } from '@/lib/near/chain'
import { accountUrl, RELAYER_ACCOUNT, TURBO_ORACLE_URL, VEILED_CONTRACT } from '@/lib/near/config'

export const ORACLE_ACCOUNT = 'veiled-oracle.testnet'
export const GITHUB_URL = 'https://github.com/hevDev7/veiled-markets-near'
export const LINKS = {
  contract: accountUrl(VEILED_CONTRACT),
  relayer: accountUrl(RELAYER_ACCOUNT),
  oracle: accountUrl(ORACLE_ACCOUNT),
  auditLog: `${TURBO_ORACLE_URL}/audit`,
  github: GITHUB_URL,
}

/** "Launch app": opens the NEAR wallet selector; once a wallet is connected the app takes over at /dashboard. */
export function useLaunchApp() {
  const navigate = useNavigate()
  const { wallet } = useWalletStore()
  const { connected: providerConnected, connecting } = useWallet() as { connected?: boolean; connecting?: boolean }
  const { setVisible } = useWalletModal()
  const [error, setError] = useState<string | null>(null)
  const isConnected = wallet.connected || !!providerConnected

  useEffect(() => {
    if (isConnected) {
      setVisible(false)
      navigate('/dashboard')
    }
  }, [isConnected, navigate, setVisible])

  const launch = useCallback(() => {
    setError(null)
    try {
      setVisible(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open the wallet selector')
    }
  }, [setVisible])

  return { launch, connecting: !!connecting, error, isConnected }
}

export type LaunchApp = ReturnType<typeof useLaunchApp>

/** Open markets, busiest first. */
export function useLiveMarkets() {
  const { markets, fetchMarkets, isLoading, error } = useRealMarketsStore()

  useEffect(() => {
    if (markets.length === 0) void fetchMarkets()
  }, [markets.length, fetchMarkets])

  const open = useMemo(
    () =>
      markets
        .filter((m: Market) => m.status === 1 && m.timeRemaining !== 'Ended')
        .sort((a: Market, b: Market) => (b.totalVolume > a.totalVolume ? 1 : b.totalVolume < a.totalVolume ? -1 : 0)),
    [markets],
  )

  return {
    markets: open,
    loading: isLoading && markets.length === 0,
    failed: !!error && markets.length === 0,
    retry: fetchMarkets,
  }
}

export const TURBO_SYMBOLS = ['BTC', 'ETH', 'SOL'] as const
export type TurboSymbol = (typeof TURBO_SYMBOLS)[number]

interface ChainRound {
  market_id: string
  symbol: string
  baseline_price: number
  deadline_ms: number
  status: string
}

export interface TurboRow {
  symbol: TurboSymbol
  /** Latest oracle price, or null before the first quote arrives. */
  price: number | null
  /** The open round's "price to beat". */
  baseline: number | null
  deadlineMs: number | null
  status: string | null
}

const isTurboSymbol = (s: string): s is TurboSymbol => (TURBO_SYMBOLS as readonly string[]).includes(s)

/** Open Turbo rounds (every 15 s) and live prices (every 4 s) from the oracle. Polling pauses in background tabs. */
export function useTurboBoard(): { rows: TurboRow[]; offline: boolean } {
  const [rounds, setRounds] = useState<Partial<Record<TurboSymbol, ChainRound>>>({})
  const [prices, setPrices] = useState<Partial<Record<TurboSymbol, number>>>({})
  const [roundsFailed, setRoundsFailed] = useState(false)

  useEffect(() => {
    let alive = true
    const ctrl = new AbortController()
    const get = async (path: string) => {
      const res = await fetch(`${TURBO_ORACLE_URL}${path}`, { signal: ctrl.signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    }

    const loadRounds = () =>
      get('/chain')
        .then((rows: unknown) => {
          if (!alive || !Array.isArray(rows)) return
          const next: Partial<Record<TurboSymbol, ChainRound>> = {}
          for (const r of rows as ChainRound[]) if (isTurboSymbol(r.symbol)) next[r.symbol] = r
          setRounds(next)
          setRoundsFailed(false)
        })
        .catch(() => {
          if (alive) setRoundsFailed(true)
        })

    const loadPrices = () =>
      Promise.all(
        TURBO_SYMBOLS.map((s) =>
          get(`/quote?symbol=${s}`)
            .then((q: { price?: unknown }) => [s, typeof q?.price === 'number' ? q.price : null] as const)
            .catch(() => [s, null] as const),
        ),
      ).then((entries) => {
        if (!alive) return
        setPrices((prev) => {
          const next = { ...prev }
          for (const [s, p] of entries) if (p !== null) next[s] = p
          return next
        })
      })

    const whenVisible = (fn: () => unknown) => () => {
      if (!document.hidden) void fn()
    }
    void loadRounds()
    void loadPrices()
    const roundTimer = window.setInterval(whenVisible(loadRounds), 15_000)
    const priceTimer = window.setInterval(whenVisible(loadPrices), 4_000)
    return () => {
      alive = false
      ctrl.abort()
      window.clearInterval(roundTimer)
      window.clearInterval(priceTimer)
    }
  }, [])

  const rows = useMemo(
    () =>
      TURBO_SYMBOLS.map((symbol) => ({
        symbol,
        price: prices[symbol] ?? null,
        baseline: rounds[symbol]?.baseline_price ?? null,
        deadlineMs: rounds[symbol]?.deadline_ms ?? null,
        status: rounds[symbol]?.status ?? null,
      })),
    [prices, rounds],
  )

  return { rows, offline: roundsFailed && Object.keys(prices).length === 0 }
}

export interface ProtocolFacts {
  /** Notes ever added to the private pool's Merkle tree. */
  notes: number | null
  /** Total trading fee in percent, and its parts. */
  feePct: number | null
  lpFeePct: number | null
  creatorFeePct: number | null
  protocolFeePct: number | null
}

const bpsToPct = (bps: string | undefined) => {
  const n = Number(bps)
  return Number.isFinite(n) ? n / 100 : null
}

export function useProtocolFacts(): ProtocolFacts {
  const [facts, setFacts] = useState<ProtocolFacts>({
    notes: null,
    feePct: null,
    lpFeePct: null,
    creatorFeePct: null,
    protocolFeePct: null,
  })

  useEffect(() => {
    let alive = true
    Promise.allSettled([cachedView<{ next_index: string }>('get_tree_info', {}, 30_000), getNearConfig()]).then(
      ([tree, config]) => {
        if (!alive) return
        const notes = tree.status === 'fulfilled' ? Number(tree.value.next_index) : NaN
        const lp = config.status === 'fulfilled' ? bpsToPct(config.value.lp_fee_bps) : null
        const creator = config.status === 'fulfilled' ? bpsToPct(config.value.creator_fee_bps) : null
        const protocol = config.status === 'fulfilled' ? bpsToPct(config.value.protocol_fee_bps) : null
        setFacts({
          notes: Number.isFinite(notes) ? notes : null,
          lpFeePct: lp,
          creatorFeePct: creator,
          protocolFeePct: protocol,
          feePct: lp !== null && creator !== null && protocol !== null ? lp + creator + protocol : null,
        })
      },
    )
    return () => {
      alive = false
    }
  }, [])

  return facts
}

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const formatUsd = (n: number) => usd.format(n)

export const formatPct = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)}%`

/** "4:05" style countdown, or null when the deadline has passed. */
export function formatClock(ms: number): string | null {
  if (ms <= 0) return null
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
