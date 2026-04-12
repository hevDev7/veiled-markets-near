// ============================================================================
// /turbo — Veiled Turbo Markets index page
// ============================================================================
// Bare-bones smoke-test surface for the Turbo MVP. Lists active turbo
// markets pulled from the Supabase audit log (cron-create writes a row per
// market) and renders one TurboMarketPanel per active market.
//
// For early testing you can also add ?market_id=<id>&symbol=BTC&baseline=70000&deadline=<unix-ms>
// to the URL to render a single panel without any backend dependency. Useful
// for end-to-end click-through testing right after deploying the contract.
// ============================================================================

import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { TurboMarketPanel, type TurboSymbol } from '@/components/TurboMarketPanel'

interface TurboMarketRow {
  market_id: string
  symbol: TurboSymbol
  baseline_price: number
  deadline_ms: number
}

const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL || ''
const SUPABASE_KEY = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || ''
// Mainnet 15s/block; testnet 4s/block. Used to convert deadline_block → epoch ms.
const SECONDS_PER_BLOCK = Number(
  (import.meta as any).env?.VITE_ALEO_SECONDS_PER_BLOCK || 4,
)
const ALEO_RPC =
  (import.meta as any).env?.VITE_ALEO_RPC_URL ||
  'https://api.explorer.provable.com/v1/testnet'

async function fetchActiveTurboMarkets(): Promise<TurboMarketRow[]> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return []
  const sinceIso = new Date(Date.now() - 30 * 60 * 1000).toISOString()
  const headers = { apikey: SUPABASE_KEY, authorization: `Bearer ${SUPABASE_KEY}` }

  const [createsRes, doneRes] = await Promise.all([
    fetch(
      `${SUPABASE_URL}/rest/v1/turbo_oracle_audit?event=eq.create&created_at=gte.${sinceIso}&order=created_at.desc`,
      { headers },
    ),
    fetch(
      `${SUPABASE_URL}/rest/v1/turbo_oracle_audit?event=in.(resolve,cancel)&created_at=gte.${sinceIso}`,
      { headers },
    ),
  ])
  if (!createsRes.ok) return []
  const creates = (await createsRes.json()) as any[]
  const done = doneRes.ok ? ((await doneRes.json()) as any[]) : []
  const doneIds = new Set(done.map((d) => d.market_id))

  // Fetch current Aleo block once so we can convert deadline_block → ms
  let currentBlock = 0n
  let nowMs = Date.now()
  try {
    const heightRes = await fetch(`${ALEO_RPC}/latest/height`)
    if (heightRes.ok) {
      currentBlock = BigInt((await heightRes.text()).trim())
      nowMs = Date.now()
    }
  } catch {
    /* ignore — fall back to zero, panel will show 00:00 immediately */
  }

  const out: TurboMarketRow[] = []
  for (const row of creates) {
    if (doneIds.has(row.market_id)) continue
    const deadlineBlock = BigInt(row.metadata?.deadline ?? '0')
    const blocksAhead = deadlineBlock > currentBlock ? deadlineBlock - currentBlock : 0n
    const deadline_ms = nowMs + Number(blocksAhead) * SECONDS_PER_BLOCK * 1000
    out.push({
      market_id: row.market_id,
      symbol: row.symbol,
      baseline_price: Number(row.pyth_price),
      deadline_ms,
    })
  }
  return out
}

export function Turbo() {
  const [params] = useSearchParams()
  const [markets, setMarkets] = useState<TurboMarketRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Manual override via URL: /turbo?market_id=...&symbol=BTC&baseline=71000&deadline=<unix_ms>
  const overrideMarketId = params.get('market_id')
  const override: TurboMarketRow | null = overrideMarketId
    ? {
        market_id: overrideMarketId,
        symbol: (params.get('symbol') || 'BTC') as 'BTC',
        baseline_price: Number(params.get('baseline') || '0'),
        deadline_ms: Number(params.get('deadline') || Date.now() + 5 * 60 * 1000),
      }
    : null

  useEffect(() => {
    if (override) return
    let cancelled = false
    const refresh = async () => {
      try {
        const list = await fetchActiveTurboMarkets()
        if (!cancelled) setMarkets(list)
      } catch (err: any) {
        if (!cancelled) setError(err?.message || String(err))
      }
    }
    refresh()
    const id = setInterval(refresh, 15_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [override])

  if (override) {
    return (
      <div className="max-w-3xl mx-auto py-8 px-4">
        <Header subtitle="Manual override mode (URL params)" />
        <TurboMarketPanel
          marketId={override.market_id}
          symbol={override.symbol}
          baselinePrice={override.baseline_price}
          deadlineMs={override.deadline_ms}
          status="active"
        />
      </div>
    )
  }

  if (markets === null && !error) {
    return (
      <div className="max-w-3xl mx-auto py-20 flex items-center justify-center text-surface-400 gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading active turbo markets…
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 space-y-6">
      <Header subtitle={error ? `Error: ${error}` : `${markets?.length || 0} active`} />

      {markets && markets.length === 0 && (
        <div className="bg-surface-900/40 border border-surface-700/30 rounded-xl p-8 text-center text-sm text-surface-400">
          No active turbo markets right now. The operator backend creates a fresh BTC/ETH/SOL
          5-minute market every 5 minutes.
          <div className="mt-3 text-xs text-surface-500">
            For manual testing, append URL params:{' '}
            <code className="bg-black/40 px-1 rounded">
              ?market_id=&lt;id&gt;&amp;symbol=BTC&amp;baseline=71000
            </code>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {markets?.map((m) => (
          <TurboMarketPanel
            key={m.market_id}
            marketId={m.market_id}
            symbol={m.symbol}
            baselinePrice={m.baseline_price}
            deadlineMs={m.deadline_ms}
            status="active"
          />
        ))}
      </div>
    </div>
  )
}

function Header({ subtitle }: { subtitle: string }) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-white">Veiled Turbo</h1>
      <p className="text-xs text-surface-400 mt-1">
        5-minute UP/DOWN markets · Pyth-resolved · {subtitle}
      </p>
    </div>
  )
}
