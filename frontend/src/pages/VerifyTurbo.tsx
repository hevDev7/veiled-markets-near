// ============================================================================
// VerifyTurbo — Public on-chain verification page for a turbo market
// ============================================================================
// URL: /verify/turbo/:marketId
//
// Reads two things and lets the user cross-check them:
//   1. The on-chain attestations the operator submitted (from the oracle's
//      audit log + NEAR explorer link)
//   2. Pyth Hermes historical data at the same timestamps
//
// The point: anyone can independently verify that the price the operator
// committed on-chain matches what Pyth was actually publishing at that
// instant. If they don't match → operator misbehavior → bug bounty.
// ============================================================================

import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle2, XCircle, ExternalLink, Loader2, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getTransactionUrl } from '@/lib/config'
import { DashboardHeader } from '@/components/DashboardHeader'
import { Footer } from '@/components/Footer'
import { TURBO_ORACLE_URL } from '@/lib/near/config'

const PYTH_FEED_IDS: Record<string, string> = {
  BTC: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  ETH: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  SOL: '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
}

interface AuditEntry {
  id: number
  event: 'create' | 'resolve' | 'cancel'
  market_id: string
  symbol: string
  pyth_price: number
  pyth_conf: number
  pyth_publish_time: string
  aleo_block: string
  aleo_tx_id: string
  operator_address: string
  metadata: Record<string, unknown>
  created_at: string
  /** Where the oracle took this price from; rows written before it was recorded have none. */
  price_source?: 'pyth' | 'coingecko'
}

interface PythHistorical {
  price: number
  conf: number
  publishTime: number
}

// NEAR: the turbo oracle serves the audit trail at the same PostgREST path Supabase did.
const SUPABASE_URL = TURBO_ORACLE_URL
const SUPABASE_KEY = 'public'

// Hermes answers only with an API key since Pyth's 2026 Core upgrade. The verifier brings their own key (free at
// app.pyth.com); it stays in this browser and goes only to Hermes, so the check never passes through the operator.
const PYTH_KEY_STORAGE = 'veiled.pythApiKey'
const PYTH_REFUSED = 'pyth-refused'

function readPythKey(): string {
  try {
    return localStorage.getItem(PYTH_KEY_STORAGE) ?? ''
  } catch {
    return ''
  }
}

function savePythKey(key: string): void {
  try {
    if (key) localStorage.setItem(PYTH_KEY_STORAGE, key)
    else localStorage.removeItem(PYTH_KEY_STORAGE)
  } catch {
    /* storage unavailable: the key still works for this visit */
  }
}

async function fetchAuditEntries(marketId: string): Promise<AuditEntry[]> {
  const url = `${SUPABASE_URL}/rest/v1/turbo_oracle_audit?market_id=eq.${marketId}&order=created_at.asc`
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${SUPABASE_KEY}` },
  })
  if (!res.ok) throw new Error(`supabase ${res.status}`)
  return res.json()
}

/**
 * Deterministic Pyth Hermes historical URL for a given symbol + publish
 * time, the same request the self-check commands below describe.
 *
 * Returns null when we don't have a feed id for the symbol (non-BTC/ETH/SOL).
 */
function buildPythHermesUrl(symbol: string, publishTimeIso: string): string | null {
  const feedId = PYTH_FEED_IDS[symbol]
  if (!feedId) return null
  const ts = Math.floor(new Date(publishTimeIso).getTime() / 1000)
  if (!Number.isFinite(ts) || ts <= 0) return null
  return `https://hermes.pyth.network/v2/updates/price/${ts}?ids[]=${feedId}&parsed=true`
}

async function fetchPythHistorical(symbol: string, publishTimeIso: string, apiKey: string): Promise<PythHistorical | null> {
  const url = buildPythHermesUrl(symbol, publishTimeIso)
  if (!url) {
    console.warn('[VerifyTurbo] buildPythHermesUrl returned null for', symbol, publishTimeIso)
    return null
  }
  console.log('[VerifyTurbo] Fetching Pyth:', url)
  const res = await fetch(url, apiKey ? { headers: { authorization: `Bearer ${apiKey}` } } : undefined)
  // 401: no key or a bad one. 403: the key's plan does not cover this feed.
  if (res.status === 401 || res.status === 403) throw new Error(PYTH_REFUSED)
  if (!res.ok) {
    console.warn('[VerifyTurbo] Pyth fetch failed:', res.status, await res.text().catch(() => ''))
    return null
  }
  const data = await res.json()
  const p = data?.parsed?.[0]?.price
  if (!p) {
    console.warn('[VerifyTurbo] No parsed price in Pyth response:', JSON.stringify(data).slice(0, 200))
    return null
  }
  const expo = Number(p.expo)
  const scale = Math.pow(10, expo)
  return {
    price: Number(p.price) * scale,
    conf: Number(p.conf) * scale,
    publishTime: Number(p.publish_time) * 1000,
  }
}

export function VerifyTurbo() {
  const { marketId } = useParams<{ marketId: string }>()
  const [entries, setEntries] = useState<AuditEntry[] | null>(null)
  const [pythCheck, setPythCheck] = useState<Record<number, PythHistorical | null>>({})
  const [checking, setChecking] = useState(false)
  const [pythRefused, setPythRefused] = useState(false)
  const [apiKey, setApiKey] = useState(readPythKey)
  const [keyDraft, setKeyDraft] = useState(apiKey)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!marketId) return
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        const list = await fetchAuditEntries(marketId)
        if (!cancelled) setEntries(list)
      } catch (err: any) {
        if (!cancelled) setError(err?.message || String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [marketId])

  // Fan out: fetch Pyth historical for each Pyth-priced entry in parallel, with the verifier's key.
  useEffect(() => {
    if (!entries?.length) return
    setPythCheck({})
    setPythRefused(false)
    if (!apiKey) {
      setChecking(false)
      return
    }
    let cancelled = false
    let refused = false
    setChecking(true)
    ;(async () => {
      const checks = await Promise.all(
        entries.map(async (e) => {
          if (e.price_source === 'coingecko') return [e.id, null] as const
          const ph = await fetchPythHistorical(e.symbol, e.pyth_publish_time, apiKey).catch((err) => {
            // Hermes sends its 401/403 without CORS headers, so the browser usually reports a refused key as a
            // failed fetch (TypeError) rather than a status code.
            if (err?.message === PYTH_REFUSED || err instanceof TypeError) refused = true
            else console.error('[VerifyTurbo] Pyth fetch error for', e.event, e.symbol, ':', err)
            return null
          })
          return [e.id, ph] as const
        }),
      )
      if (cancelled) return
      setPythCheck(Object.fromEntries(checks))
      setPythRefused(refused)
      setChecking(false)
    })()
    return () => { cancelled = true }
  }, [entries, apiKey])

  // Shared page chrome: navbar + footer + bg. Every render path (loading,
  // error, success) wraps its body with this so the page looks consistent
  // with the rest of the app instead of showing a bare centered block.
  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen bg-surface-950 text-white flex flex-col">
      <DashboardHeader />
      <main className="flex-1 pt-20">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </div>
      </main>
      <Footer />
    </div>
  )

  if (loading) {
    return (
      <Shell>
        <div className="max-w-3xl mx-auto py-20 flex items-center justify-center text-surface-400 gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading verification data…
        </div>
      </Shell>
    )
  }
  if (error || !entries || entries.length === 0) {
    return (
      <Shell>
        <div className="max-w-3xl mx-auto py-20 text-center">
          <XCircle className="w-12 h-12 text-rose-400 mx-auto mb-4" />
          <div className="text-lg text-white font-semibold">No audit data found</div>
          <div className="text-sm text-surface-400 mt-2">{error || 'Market id not in audit log'}</div>
        </div>
      </Shell>
    )
  }

  // Fallback operator address for rows whose own `operator_address` column
  // is null. Historical resolve events (before the backend fix that added
  // operator_address to the resolve audit payload) can have a missing value
  // here. Since every entry in `entries` belongs to the SAME market_id, any
  // non-null operator_address in this list refers to the same operator that
  // signed all of this market's txs — safe to use as a fallback.
  const fallbackOperator = entries.find((e) => !!e.operator_address)?.operator_address || ''

  // Market-level direction (UP / DOWN). Derived from the create row's
  // baseline price vs the resolve row's closing price — both stored in
  // `pyth_price` depending on event type. Applied to BOTH the create card
  // and the resolve card so the whole verification view is color-coded by
  // the round's outcome: round went up → both cards green, went down →
  // both red. Neutral gray when the market hasn't resolved yet (only a
  // create row exists) or when data is incomplete.
  const createRow = entries.find((e) => e.event === 'create')
  const resolveRow = entries.find((e) => e.event === 'resolve')
  const marketDirection: 'UP' | 'DOWN' | null =
    createRow && resolveRow && createRow.pyth_price > 0
      ? resolveRow.pyth_price > createRow.pyth_price
        ? 'UP'
        : 'DOWN'
      : null

  return (
    <Shell>
      <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <ShieldCheck className="w-7 h-7 text-emerald-400" />
        <div>
          <div className="text-2xl font-bold text-white">Verify Turbo Market</div>
          <div className="text-xs text-surface-400 break-all">Market ID: {marketId}</div>
        </div>
      </div>

      <div className="bg-surface-900/40 rounded-xl border border-surface-700/30 p-4">
        <div className="text-sm text-surface-300 leading-relaxed">
          Below is the full on-chain attestation history for this market, cross-checked against
          Pyth Hermes historical data. If any row shows a mismatch between the operator's
          on-chain claim and Pyth's authoritative price, please file a report at{' '}
          <a href="/bug-bounty" className="text-blue-400 hover:underline">/bug-bounty</a>.
        </div>
      </div>

      <div className="space-y-4">
        {entries.map((e) => {
          const pyth = pythCheck[e.id]
          const fromCoinGecko = e.price_source === 'coingecko'
          const matched = !!pyth && Math.abs(pyth.price - e.pyth_price) / e.pyth_price < 0.001
          const mismatched = !!pyth && !matched
          // `getTransactionUrl` picks the correct explorer subdomain based
          // on the configured network (testnet.explorer.provable.com vs
          // explorer.provable.com). Hardcoding the path was routing users
          // to mainnet even on testnet deployments.
          const explorerUrl = getTransactionUrl(e.aleo_tx_id)

          return (
            <div
              key={e.id}
              className={cn(
                'rounded-xl border p-4',
                // Card background follows the MARKET DIRECTION (UP/DOWN),
                // not the per-row Pyth match result. The match status is
                // still communicated via the Check/X icon in the header
                // row below — so verification feedback isn't lost, just
                // de-emphasized relative to the round's outcome.
                marketDirection === 'UP'
                  ? 'border-emerald-700/40 bg-emerald-500/5'
                  : marketDirection === 'DOWN'
                    ? 'border-rose-700/40 bg-rose-500/5'
                    : 'border-surface-700/40 bg-surface-900/40',
              )}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  {matched ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  ) : mismatched ? (
                    <XCircle className="w-5 h-5 text-rose-400" />
                  ) : (
                    <Loader2 className={cn('w-5 h-5 text-surface-400', checking && !fromCoinGecko && 'animate-spin')} />
                  )}
                  <span className="text-sm font-bold text-white uppercase tracking-wide">
                    {e.event} · {e.symbol}
                  </span>
                </div>
                <span className="text-[11px] text-surface-500 tabular-nums">
                  Block {e.aleo_block} · {new Date(e.created_at).toLocaleString()}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <div className="text-surface-400 mb-1">Operator on-chain claim</div>
                  <div className="font-mono text-white tabular-nums">
                    ${e.pyth_price.toFixed(2)} ±${e.pyth_conf.toFixed(2)}
                  </div>
                  <div className="text-surface-500 text-[10px] mt-0.5">
                    @ {new Date(e.pyth_publish_time).toISOString()}
                  </div>
                </div>
                <div>
                  <div className="text-surface-400 mb-1">Pyth Hermes (independent)</div>
                  {pyth ? (
                    <>
                      <div className="font-mono text-white tabular-nums">
                        ${pyth.price.toFixed(2)} ±${pyth.conf.toFixed(2)}
                      </div>
                      <div className="text-surface-500 text-[10px] mt-0.5">
                        @ {new Date(pyth.publishTime).toISOString()}
                      </div>
                    </>
                  ) : (
                    <div className="text-surface-500">
                      {fromCoinGecko
                        ? 'Priced from CoinGecko (the oracle had no Pyth key then), so there is no Pyth price to compare.'
                        : !apiKey
                          ? 'Add your Pyth API key below to check this price.'
                          : checking
                            ? 'Checking…'
                            : pythRefused
                              ? 'Pyth Hermes refused the request. Check that the key is valid and covers this feed.'
                              : 'No historical data available'}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-surface-700/30 flex items-center flex-wrap gap-x-3 gap-y-1 text-[11px]">
                <a
                  href={explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 flex items-center gap-1"
                >
                  <ExternalLink className="w-3 h-3" /> NEAR explorer
                </a>
                <span className="text-surface-600">·</span>
                <span className="text-surface-500">
                  Operator:{' '}
                  <span className="font-mono">
                    {/* Prefer this row's own operator_address; fall back
                        to the market-level fallback (computed from the
                        create row) for historical resolve rows written
                        before the backend started populating this field. */}
                    {(e.operator_address || fallbackOperator).slice(0, 12)}…
                  </span>
                </span>
              </div>
            </div>
          )
        })}
      </div>

      <div className="bg-surface-900/40 rounded-xl border border-surface-700/30 p-4 text-xs text-surface-400 leading-relaxed">
        <div className="font-semibold text-white mb-2">How to verify yourself</div>
        <form
          className="mb-3 flex flex-wrap items-center gap-2"
          onSubmit={(ev) => {
            ev.preventDefault()
            const key = keyDraft.trim()
            savePythKey(key)
            setApiKey(key)
          }}
        >
          <label htmlFor="pyth-api-key" className="text-surface-300">Pyth API key</label>
          <input
            id="pyth-api-key"
            type="password"
            autoComplete="off"
            value={keyDraft}
            onChange={(ev) => setKeyDraft(ev.target.value)}
            placeholder="pyth_…"
            className="min-w-[14rem] flex-1 rounded-lg border border-surface-700/50 bg-black/40 px-3 py-1.5 font-mono text-[11px] text-white placeholder:text-surface-600 focus:border-brand-400/60 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-lg bg-brand-500/15 px-3 py-1.5 font-medium text-brand-300 hover:bg-brand-500/25"
          >
            Check with Pyth
          </button>
          <span className="w-full text-surface-500">
            Free at app.pyth.com. The key stays in this browser and is sent only to Pyth Hermes.
          </span>
        </form>
        <pre className="bg-black/40 rounded p-3 text-[11px] overflow-x-auto">
{`# 1. Read the price the operator submitted on NEAR
TX=<transaction hash from above>
curl -s https://test.rpc.fastnear.com -H 'content-type: application/json' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tx","params":{"tx_hash":"'$TX'","sender_account_id":"veiled-oracle.testnet"}}' \\
  | jq -r '.result.transaction.actions[0].FunctionCall.args | @base64d'

# 2. Ask Pyth Hermes for the price at the same moment (needs your own API key)
TS=<pyth_publish_time as unix seconds>
FEED=0xe62df6c8...  # BTC/USD (see PYTH_FEED_IDS)
curl -H "Authorization: Bearer $PYTH_API_KEY" \\
  "https://hermes.pyth.network/v2/updates/price/$TS?ids[]=$FEED&parsed=true"

# 3. Compare: the contract stores price × 10^6, Pyth reports price × 10^expo.
#    If they differ → operator misbehavior.`}
        </pre>
      </div>
      </div>
    </Shell>
  )
}
