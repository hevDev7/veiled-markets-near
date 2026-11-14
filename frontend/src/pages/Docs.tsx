import { Link } from 'react-router-dom'
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react'
import {
  Activity, AlertTriangle, ArrowLeft, BookOpen, ChevronRight, Code, Coins, Cpu, ExternalLink, FlaskConical,
  Gavel, Globe, Info, Layers, Lightbulb, ListOrdered, Network, Radio, Send, Server, Shield, Terminal, Timer,
  Wallet,
} from 'lucide-react'
import { Footer } from '../components/Footer'

// ============================================================================
// Docs: reference for Veiled Markets on NEAR testnet. Route /docs (/api-docs
// redirects here). Facts follow near/contract/contracts/veiled/src,
// docs/near/DESIGN.md and the testnet get_config; keep the numbers in sync.
// ============================================================================

const CONTRACT = 'v1.veiled-markets.testnet'
const USDC = '3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af'
const EXPLORER = 'https://testnet.nearblocks.io'

// ---------------------------------------------------------------- building blocks

function CodeBlock({ children, title }: { children: string; title?: string }) {
  return (
    <div className="rounded-xl overflow-hidden border border-white/[0.04] not-prose mb-4">
      {title && (
        <div className="px-4 py-2 bg-white/[0.04] border-b border-white/[0.04]">
          <span className="text-xs font-mono text-surface-400">{title}</span>
        </div>
      )}
      <pre className="p-4 bg-white/[0.02] overflow-x-auto">
        <code className="text-sm font-mono text-surface-300 leading-relaxed">{children}</code>
      </pre>
    </div>
  )
}

function SectionHeader({
  id,
  icon: Icon,
  title,
}: {
  id: string
  icon: ComponentType<{ className?: string }>
  title: string
}) {
  return (
    <div id={id} className="flex items-center gap-3 mb-4 scroll-mt-24">
      <Icon className="w-5 h-5 text-brand-400 shrink-0" />
      <h2 className="text-xl font-semibold text-white">{title}</h2>
    </div>
  )
}

function GroupHeading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-10 border-t border-white/[0.04] pt-10">
      <h2 className="text-2xl font-display text-white mb-2">{title}</h2>
      {children && <p className="text-sm text-surface-400 leading-relaxed">{children}</p>}
    </div>
  )
}

function H3({ children }: { children: ReactNode }) {
  return <h3 className="text-sm font-semibold text-white mt-8 mb-3">{children}</h3>
}

function P({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return <p className={`text-sm leading-relaxed mb-4 ${muted ? 'text-surface-400' : ''}`}>{children}</p>
}

/** Inline code. */
function C({ children }: { children: ReactNode }) {
  return <code className="text-surface-300 bg-white/[0.04] px-1.5 py-0.5 rounded font-mono text-[0.85em] break-words">{children}</code>
}

function A({ href, children }: { href: string; children: ReactNode }) {
  const external = href.startsWith('http')
  return (
    <a
      href={href}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className="text-brand-400 hover:text-brand-300 transition-colors"
    >
      {children}
      {external && <ExternalLink className="inline w-3 h-3 ml-0.5 -mt-0.5" />}
    </a>
  )
}

function Bullets({ children }: { children: ReactNode }) {
  return <ul className="list-disc pl-5 space-y-2 text-sm text-surface-400 leading-relaxed mb-4 marker:text-surface-600">{children}</ul>
}

function B({ children }: { children: ReactNode }) {
  return <strong className="text-surface-300 font-semibold">{children}</strong>
}

function Table({ head, rows }: { head?: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-white/[0.04] mb-4">
      <table className="w-full text-xs">
        {head && (
          <thead>
            <tr className="bg-white/[0.03]">
              {head.map((h) => (
                <th key={h} className="px-3 py-2 text-left font-semibold text-surface-400 whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-white/[0.04]">
              {row.map((cell, j) => (
                <td key={j} className={`px-3 py-2 align-top leading-relaxed ${!head && j === 0 ? 'text-surface-400 whitespace-nowrap' : 'text-surface-300'}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const calloutStyles = {
  info: { icon: Info, box: 'border-brand-500/20 bg-brand-500/[0.05]', iconClass: 'text-brand-400' },
  tip: { icon: Lightbulb, box: 'border-emerald-700/30 bg-emerald-500/5', iconClass: 'text-emerald-400' },
  warn: { icon: AlertTriangle, box: 'border-yellow-500/[0.15] bg-yellow-500/[0.06]', iconClass: 'text-yellow-400' },
} as const

function Callout({ tone = 'info', children }: { tone?: keyof typeof calloutStyles; children: ReactNode }) {
  const s = calloutStyles[tone]
  return (
    <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 mb-4 ${s.box}`}>
      <s.icon className={`mt-0.5 h-4 w-4 shrink-0 ${s.iconClass}`} />
      <div className="text-sm text-surface-300 leading-relaxed">{children}</div>
    </div>
  )
}

interface Method {
  name: string
  tag?: string
  desc: ReactNode
}

function MethodList({ methods }: { methods: Method[] }) {
  return (
    <div className="space-y-2 mb-4">
      {methods.map((m) => (
        <div key={m.name} className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-1">
            <code className="text-sm font-mono text-brand-400 break-all">{m.name}</code>
            {m.tag && <span className="text-[10px] uppercase tracking-wider text-surface-500">{m.tag}</span>}
          </div>
          <p className="text-xs text-surface-400 leading-relaxed">{m.desc}</p>
        </div>
      ))}
    </div>
  )
}

function Steps({ steps }: { steps: { title: string; body: ReactNode }[] }) {
  return (
    <ol className="space-y-3 mb-4">
      {steps.map((s, i) => (
        <li key={s.title} className="flex gap-3 p-4 rounded-xl bg-white/[0.02] border border-white/[0.04]">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-[11px] font-semibold text-brand-400 tabular-nums">
            {i + 1}
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white mb-1">{s.title}</div>
            <div className="text-[13px] text-surface-400 leading-relaxed">{s.body}</div>
          </div>
        </li>
      ))}
    </ol>
  )
}

// ---------------------------------------------------------------- table of contents

// Keep in sync with the SectionHeader ids below.
const toc = [
  {
    group: 'Getting started',
    items: [
      { id: 'overview', label: 'Overview' },
      { id: 'use-the-app', label: 'Use the app' },
      { id: 'architecture', label: 'Architecture' },
    ],
  },
  {
    group: 'Protocol',
    items: [
      { id: 'privacy', label: 'Privacy model' },
      { id: 'markets', label: 'Prediction markets' },
      { id: 'resolution', label: 'Resolution' },
      { id: 'turbo', label: 'Turbo rounds' },
      { id: 'parlays', label: 'Parlays' },
      { id: 'tokens', label: 'Tokens' },
    ],
  },
  {
    group: 'Reference',
    items: [
      { id: 'contract-api', label: 'Contract API' },
      { id: 'circuit', label: 'Circuit' },
      { id: 'relayer-api', label: 'Relayer API' },
      { id: 'oracle-api', label: 'Turbo oracle API' },
    ],
  },
  {
    group: 'Recipes',
    items: [
      { id: 'recipe-read-markets', label: 'Read markets and prices' },
      { id: 'recipe-stream-prices', label: 'Stream turbo prices' },
      { id: 'recipe-verify-turbo', label: 'Verify a turbo round' },
      { id: 'recipe-run-locally', label: 'Run it locally' },
    ],
  },
  {
    group: 'Deployment',
    items: [
      { id: 'deployment', label: 'Testnet deployment' },
      { id: 'limits', label: 'Limits and what is missing' },
    ],
  },
]

const SECTION_IDS = toc.flatMap((g) => g.items.map((i) => i.id))

/** The section whose header has scrolled past the sticky page header (the last one at the bottom of the page). */
function useScrollSpy(ids: string[], offset = 120): string {
  const [active, setActive] = useState(ids[0])
  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      const doc = document.documentElement
      if (window.innerHeight + window.scrollY >= doc.scrollHeight - 4) {
        setActive(ids[ids.length - 1])
        return
      }
      let current = ids[0]
      for (const id of ids) {
        const el = document.getElementById(id)
        if (el && el.getBoundingClientRect().top - offset <= 0) current = id
      }
      setActive(current)
    }
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [ids, offset])
  return active
}

function TocLinks({ active, onPick }: { active: string; onPick?: () => void }) {
  return (
    <>
      {toc.map((group) => (
        <div key={group.group} className="mb-6 last:mb-0">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-surface-500 mb-2">{group.group}</div>
          <ul className="space-y-1">
            {group.items.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  onClick={onPick}
                  aria-current={active === item.id ? 'location' : undefined}
                  className={`block text-sm py-1 border-l-2 pl-3 transition-colors ${
                    active === item.id
                      ? 'border-brand-400 text-white'
                      : 'border-transparent text-surface-400 hover:text-white hover:border-white/[0.08]'
                  }`}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  )
}

// ---------------------------------------------------------------- code samples

const READ_MARKETS = `// Lists the active prediction markets and their prices. Node 18+: node read-markets.mjs
const RPC = 'https://rpc.testnet.fastnear.com'
const CONTRACT = 'v1.veiled-markets.testnet'

async function view(method, args = {}) {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'query',
      params: {
        request_type: 'call_function',
        finality: 'final',
        account_id: CONTRACT,
        method_name: method,
        args_base64: btoa(JSON.stringify(args)),
      },
    }),
  }).then((r) => r.json())
  if (res.error || res.result?.error) throw new Error(JSON.stringify(res.error ?? res.result.error))
  return JSON.parse(new TextDecoder().decode(new Uint8Array(res.result.result)))
}

const markets = await view('get_markets', { from: '0', limit: 50 })
for (const m of markets.filter((m) => m.status === 1)) {
  const { q } = JSON.parse(m.metadata)
  // FPMM: an outcome's price is proportional to 1 / its reserve.
  const inv = m.reserves.slice(0, m.num_outcomes).map((r) => 1 / Number(r))
  const sum = inv.reduce((a, b) => a + b, 0)
  const prices = inv.map((x) => x / sum)
  console.log('#' + m.id + ' ' + q + '  ' + prices.map((p) => (p * 100).toFixed(1) + '%').join(' / '))
}`

const STREAM_PRICES = `// Runs in a browser. In Node: import { EventSource } from 'eventsource'
const ORACLE = 'http://localhost:4090' // your VITE_TURBO_ORACLE_URL

const es = new EventSource(ORACLE + '/stream?symbol=ETH')
es.onmessage = (e) => {
  const q = JSON.parse(e.data) // { symbol, feedId, price, conf, publishTime }
  console.log(q.symbol, q.price.toFixed(2), new Date(q.publishTime).toISOString())
}

// The round the price is measured against, from the contract (view() as in the previous recipe).
// symbol_id: 1 BTC, 2 ETH, 3 SOL. Prices on chain have 6 decimals; a tick is 4 s of block time.
const round = await view('get_latest_turbo', { symbol_id: 2 })
console.log('round', round.id, 'baseline', Number(round.baseline_price) / 1e6,
  'closes', new Date(Number(round.deadline) * 4000).toISOString())`

const VERIFY_TURBO = `// Cross-checks the prices the operator submitted for one round against Pyth Hermes. Node 18+.
// view() is the helper from "Read markets and prices".
const ORACLE = 'http://localhost:4090'          // your VITE_TURBO_ORACLE_URL
const PYTH_KEY = process.env.PYTH_API_KEY       // your own key, free at app.pyth.com
const FEEDS = {
  1: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43', // BTC/USD
  2: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace', // ETH/USD
  3: '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d', // SOL/USD
}
const ROUND = '161'

// 1. What the contract stored (price × 10^6).
const round = await view('get_turbo_market', { market_id: ROUND })
console.log('contract baseline', Number(round.baseline_price) / 1e6, 'closing', Number(round.closing_price) / 1e6)

// 2. The operator's audit rows: one per create / resolve, with the Pyth publish time of the price it used.
const rows = await fetch(ORACLE + '/audit?market_id=eq.' + ROUND + 'field&order=id.asc').then((r) => r.json())

// 3. Pyth's own price at each of those moments.
for (const row of rows) {
  const ts = Math.floor(new Date(row.pyth_publish_time).getTime() / 1000)
  const url = 'https://hermes.pyth.network/v2/updates/price/' + ts + '?ids[]=' + FEEDS[round.symbol_id] + '&parsed=true'
  const res = await fetch(url, { headers: { authorization: 'Bearer ' + PYTH_KEY } })
  if (!res.ok) throw new Error('Hermes ' + res.status) // 401: no key or a bad one
  const p = (await res.json()).parsed[0].price
  console.log(row.event, 'operator', row.pyth_price, 'pyth', Number(p.price) * 10 ** Number(p.expo))
}`

// ---------------------------------------------------------------- page

export function Docs() {
  const active = useScrollSpy(SECTION_IDS)
  const mobileToc = useRef<HTMLDetailsElement>(null)

  return (
    <div className="min-h-screen bg-surface-950 text-surface-300">
      <header className="border-b border-white/[0.04] sticky top-0 bg-surface-950/95 backdrop-blur-sm z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-surface-500 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-sm text-white font-semibold">Documentation</span>
            <span className="px-2.5 py-1 rounded-lg bg-brand-500/15 text-brand-400 text-[11px] font-medium whitespace-nowrap">
              NEAR testnet
            </span>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)] gap-10">
        {/* Sticky TOC sidebar */}
        <aside className="hidden lg:block">
          <nav aria-label="Table of contents" className="sticky top-24 max-h-[calc(100vh-6rem)] overflow-y-auto pr-2 pb-6">
            <TocLinks active={active} />
          </nav>
        </aside>

        {/* Main content */}
        <main className="max-w-3xl min-w-0">
          <h1 className="font-display text-3xl sm:text-4xl text-white mb-3">Veiled Markets Documentation</h1>
          <p className="text-surface-400 mb-8 leading-relaxed">
            How Veiled Markets works on NEAR testnet: the app, the contract <C>{CONTRACT}</C>, the zero-knowledge
            circuit, the relayer and turbo oracle APIs, and recipes that read live testnet data.
          </p>

          {/* Mobile TOC */}
          <details ref={mobileToc} className="group lg:hidden mb-10 rounded-xl border border-white/[0.06] bg-white/[0.02]">
            <summary className="flex cursor-pointer select-none list-none items-center justify-between px-4 py-3 text-sm font-medium text-white [&::-webkit-details-marker]:hidden">
              On this page
              <ChevronRight className="w-4 h-4 text-surface-500 transition-transform group-open:rotate-90" />
            </summary>
            <nav aria-label="Table of contents" className="px-4 pb-4 pt-1">
              <TocLinks
                active={active}
                onPick={() => {
                  if (mobileToc.current) mobileToc.current.open = false
                }}
              />
            </nav>
          </details>

          {/* ══════════════ GETTING STARTED ══════════════ */}
          <section className="mb-16">
            <SectionHeader id="overview" icon={BookOpen} title="Overview" />
            <P>
              Veiled Markets is a prediction market on NEAR testnet in which your balance and your positions are
              private. One contract, <C>{CONTRACT}</C>, runs all of it:
            </P>
            <div className="grid sm:grid-cols-2 gap-3 mb-4">
              {[
                {
                  icon: Layers,
                  title: 'Prediction markets',
                  desc: 'Yes/No markets with a source the AI resolver can read, priced by an FPMM market maker, in NEAR or USDC. Resolved by bonded votes, with a dispute window and a 5-member committee.',
                },
                {
                  icon: Radio,
                  title: 'Turbo rounds',
                  desc: '5-minute UP/DOWN rounds on BTC, ETH and SOL, opened and resolved by the oracle operator. Winners split the pool.',
                },
                {
                  icon: ListOrdered,
                  title: 'Parlays',
                  desc: '2 to 4 legs on different markets; every leg must win. Odds come from the live pools, and the contract settles from the leg markets.',
                },
                {
                  icon: Shield,
                  title: 'Private note pool',
                  desc: 'Balances and positions are notes in a Poseidon Merkle tree. Each private action carries a Groth16 proof and is submitted by a relayer.',
                },
              ].map((f) => (
                <div key={f.title} className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                  <div className="flex items-center gap-2 mb-2">
                    <f.icon className="w-4 h-4 text-brand-400" />
                    <span className="text-sm font-semibold text-white">{f.title}</span>
                  </div>
                  <p className="text-xs text-surface-400 leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>
            <P muted>
              Trades, turbo bets, parlays, redemptions and claims are private: your browser proves that you own the notes
              it spends, and a relayer submits the call, so your account never signs it. Deposits, withdrawals, market
              creation and resolution votes are ordinary public calls from your wallet.
            </P>
            <Table
              rows={[
                ['Network', 'NEAR testnet (tokens have no monetary value)'],
                ['Contract', <A key="c" href={`${EXPLORER}/address/${CONTRACT}`}>{CONTRACT}</A>],
                ['Tokens', 'NEAR and USDC (Circle testnet USDC)'],
                ['Wallet', 'Meteor Wallet'],
                ['Explorer', <A key="e" href={EXPLORER}>testnet.nearblocks.io</A>],
              ]}
            />
            <Callout>
              Veiled Markets started on Aleo. This page documents the NEAR version only. Aleo features that are not
              ported yet are listed under <A href="#limits">Limits</A>.
            </Callout>
          </section>

          <section className="mb-16">
            <SectionHeader id="use-the-app" icon={Wallet} title="Use the app" />
            <Steps
              steps={[
                {
                  title: 'Connect a wallet',
                  body: (
                    <>
                      Meteor Wallet, on NEAR testnet. For USDC, use Circle&apos;s faucet at{' '}
                      <A href="https://faucet.circle.com">faucet.circle.com</A> and choose NEAR Testnet. The faucet also
                      registers your account with the USDC contract, which USDC withdrawals need.
                    </>
                  ),
                },
                {
                  title: 'Unlock your private balance',
                  body: (
                    <>
                      Portfolio → Private balance → <B>Unlock private balance (sign a message, no fee)</B>. This is a
                      NEP-413 message signature, not a transaction. Your note key is derived from it, so the same wallet
                      finds its notes on any device. If the wallet cannot sign messages, the app makes a random key and
                      keeps it in this browser; notes made with that key can only be spent from this browser.
                    </>
                  ),
                },
                {
                  title: 'Deposit',
                  body: 'In the same panel, move NEAR or USDC from your wallet into your private balance (at least 0.01). The deposit is a public transaction from your account.',
                },
                {
                  title: 'Trade',
                  body: 'Open a market, pick an outcome and an amount, and confirm. Your browser builds a zero-knowledge proof in a few seconds and the relayer submits the trade, so no wallet approval is needed when your private balance covers the amount. If it does not, the wallet first asks you to approve a deposit for the difference.',
                },
                {
                  title: 'Build a parlay',
                  body: (
                    <>
                      Turn on <B>Parlay Mode</B> on the dashboard and pick one outcome in each of 2 to 4 markets, or use{' '}
                      <B>Add &quot;…&quot; to Parlay</B> on a market page. Choose the stake token and amount in the Parlay
                      Slip and confirm; this is private, like a trade. Your tickets are on{' '}
                      <Link to="/my-parlays" className="text-brand-400 hover:text-brand-300">My Parlays</Link>.
                    </>
                  ),
                },
                {
                  title: 'Bet on a turbo round',
                  body: (
                    <>
                      Open <Link to="/turbo" className="text-brand-400 hover:text-brand-300">Turbo</Link>, choose BTC,
                      ETH or SOL, pick UP or DOWN and an amount in NEAR.
                    </>
                  ),
                },
                {
                  title: 'Collect',
                  body: (
                    <>
                      When a market resolves, <Link to="/portfolio" className="text-brand-400 hover:text-brand-300">Portfolio</Link>{' '}
                      shows <B>Redeem Winnings</B>; when it is cancelled, <B>Claim Refund</B>. Turbo winnings are claimed
                      from Portfolio and parlay tickets from My Parlays. Every payout goes into your private balance.
                    </>
                  ),
                },
                {
                  title: 'Withdraw',
                  body: 'From the Private balance panel. The panel pays your connected account; the contract itself accepts any NEAR account as the recipient. Withdrawals are public.',
                },
              ]}
            />
            <Callout tone="tip">
              Deposit before you trade. If your private balance is too small, the app tops it up from your wallet in the
              same moment as the trade, and that timing links the trade to your account.
            </Callout>
          </section>

          <section className="mb-16">
            <SectionHeader id="architecture" icon={Network} title="Architecture" />
            <CodeBlock title="components">{`Browser (React + Vite), frontend/src/lib/near/
  wallet   NEAR Wallet Selector: Meteor Wallet
  reads    contract view calls over NEAR RPC
  notes    scans leaves, decrypts memos, builds Merkle paths
  prover   snarkjs Groth16 in a web worker (/zk/spend.wasm, /zk/spend_final.zkey)
   │
   ├─ public calls signed by your wallet ────────┐
   │  deposit_near, create_market, votes …       │
   │                                             ▼
   └─ proof + ext_data ─▶ Relayer ─ transact ─▶  v1.veiled-markets.testnet
                          veiled-relayer.testnet  ├─ note pool: Poseidon tree, nullifiers
                                                  ├─ markets: FPMM AMM, LP, fees
Turbo oracle, veiled-oracle.testnet               ├─ resolution: votes, disputes, committee
  Pyth prices ─ create / resolve rounds ───────▶  ├─ turbo rounds
                                                  └─ parlays: tickets, pool, settlement
USDC (Circle, NEP-141) ─ ft_transfer_call ─────▶
                       ◀─ ft_transfer ─────────── withdrawals and USDC payouts`}</CodeBlock>
            <P>
              One contract holds the note pool and every market type, so each private action is a single synchronous
              call. The only cross-contract calls are USDC transfers in (<C>ft_transfer_call</C>) and out (
              <C>ft_transfer</C>) and NEAR transfers out. The market list and the market text come from the contract
              itself (the metadata is stored on chain); a Supabase cache is optional.
            </P>
            <Table
              head={['Call', 'Signed by', 'Public']}
              rows={[
                ['deposit_near, USDC ft_transfer_call', 'your account', 'account, token, amount'],
                ['transact: trade, bet, parlay, redeem, claim, withdraw', 'the relayer', 'the action and its amounts, not your account'],
                ['create_market, vote_outcome, dispute_resolution, bond and fee claims', 'your account', 'everything'],
                ['close_market, settle_market, settle_parlay (optional: the next call that touches a market does it)', 'anyone', 'everything'],
                ['create_turbo_market, resolve_turbo_market', 'the oracle operator', 'everything'],
              ]}
            />
          </section>

          {/* ══════════════ PROTOCOL ══════════════ */}
          <GroupHeading title="Protocol">
            Contract behaviour, with the values the testnet deployment uses. Durations are in ticks: one tick is 4 seconds
            of block time (<C>tick = floor(block_timestamp_ms / 4000)</C>, view <C>get_height</C>).
          </GroupHeading>

          <section className="mb-16">
            <SectionHeader id="privacy" icon={Shield} title="Privacy model" />
            <P>
              A note is a hidden UTXO: a commitment in a depth-20 Poseidon Merkle tree held by the contract. Only the
              holder of the note key can spend it, and spending publishes a nullifier, not the note.
            </P>
            <CodeBlock title="notes (circomlib Poseidon on BN254)">{`sk          note secret key, derived from your wallet signature
pk          = Poseidon(sk)
ownerBlind  = Poseidon(pk, blinding)
commitment  = Poseidon(kind, asset, sub, amount, ownerBlind)
nullifier   = Poseidon(sk, commitment)     published when the note is spent`}</CodeBlock>
            <Table
              head={['kind', 'Note', 'asset', 'sub', 'amount']}
              rows={[
                ['1', 'Private balance', 'token id (1 NEAR, 3 USDC)', '0', 'micro units'],
                ['2', 'Outcome shares', 'market id', 'outcome 1–4', 'shares'],
                ['3', 'LP position', 'market id', '0', 'LP shares'],
                ['4', 'Turbo bet', 'round id', '1 UP, 2 DOWN', 'stake after the fee'],
                ['5', 'Parlay ticket', 'parlay id', '0', 'potential payout'],
              ]}
            />
            <P muted>
              Every private action spends up to two notes of the same kind, asset and sub, uses <C>out_amount</C> of their
              total, and returns the rest to you as a change note. The contract then mints one new note for the result
              (shares, a balance, a ticket) to the owner named in the action. It never learns which leaves were spent.
            </P>
            <div className="grid sm:grid-cols-2 gap-3 mb-4">
              <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-700/30">
                <div className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-2">Private</div>
                <ul className="text-xs text-surface-300 space-y-1 leading-relaxed">
                  <li>• Which account holds which shares, LP note, turbo bet or parlay ticket</li>
                  <li>• Who placed each trade, bet or parlay</li>
                  <li>• Your private balance</li>
                  <li>• Your history of trades and claims</li>
                </ul>
              </div>
              <div className="p-4 rounded-xl bg-rose-500/5 border border-rose-700/30">
                <div className="text-xs font-semibold text-rose-400 uppercase tracking-wider mb-2">Public</div>
                <ul className="text-xs text-surface-300 space-y-1 leading-relaxed">
                  <li>• Deposits and withdrawals: account, token, amount</li>
                  <li>• Each trade: market, outcome, amount (the AMM pool is public)</li>
                  <li>• Each turbo bet: round, side, amount</li>
                  <li>• Each parlay: legs, stake, potential payout, status</li>
                  <li>• Market creation, votes, disputes and bonds</li>
                </ul>
              </div>
            </div>
            <H3>Finding your notes</H3>
            <P muted>
              Each leaf carries a memo encrypted with AES-256-GCM under a key derived (HKDF) from your note seed. Your
              browser reads the leaves with <C>get_leaves</C> and keeps the ones it can decrypt, so your notes can be
              recovered from the chain alone. The seed comes from the NEP-413 signature and is cached in this
              browser&apos;s local storage for your account.
            </P>
            <Callout tone="warn">
              Timing and amounts are not hidden. A deposit of 1.37 NEAR followed seconds later by a 1.37 NEAR trade is
              easy to link. The relayer also sees the IP address a request comes from, though not your account.
            </Callout>
          </section>

          <section className="mb-16">
            <SectionHeader id="markets" icon={Layers} title="Prediction markets" />
            <P>
              Anyone can create a market. The create page makes Yes/No markets, and each names one source URL that the AI
              resolver must be able to read: before publishing, the page checks the source with the resolver&apos;s own
              reader and shows the text the resolver will get (see AI resolver below). The contract itself still takes 2,
              3 or 4 outcomes, and older markets with more than two keep working. The initial liquidity is split equally
              across the outcome reserves, and the creator receives it as a private LP note.
            </P>
            <P muted>
              Templates write three kinds of market from a few fields. <B>Crypto price</B>: BTC, ETH, SOL or NEAR above a
              price at a UTC minute, decided by the open of Coinbase&apos;s one-minute candle; trading closes at that
              minute. <B>Stock close</B>: a ticker&apos;s close above a price on an NYSE trading day (2026 and 2027),
              decided by Nasdaq&apos;s daily history; trading closes at 16:00 New York time, or 13:00 on early-close days.
              <B> Currency rate</B>: a pair&apos;s ECB reference rate for a TARGET business day above a value, decided by
              Frankfurter; trading closes at 12:00 UTC, before the ECB publishes. A template&apos;s question, rules and
              source stay read-only unless the creator edits them; a hand-written market is published only after its
              creator ticks that the deciding value appears in the checked source text.
            </P>
            <Table
              head={['Rule', 'Value']}
              rows={[
                ['Collateral', <>NEAR attached to <C>create_market</C>, or USDC through <C>ft_transfer_call</C> with a <C>create_market</C> message</>],
                ['Initial liquidity', 'at least 0.01 (min_liquidity = 10,000 micro units)'],
                ['Deadlines', 'ticks; the deadline must be in the future, and the resolution deadline at least two vote windows plus one dispute window after it (ERR_RESOLUTION_DEADLINE)'],
                ['Metadata', <>JSON text up to 2048 bytes, stored on chain: <C>q</C> question, <C>d</C> description, <C>s</C> resolution source, <C>o</C> outcome labels, <C>i</C> image</>],
                ['question_hash', 'up to 96 characters'],
              ]}
            />
            <H3>Pricing</H3>
            <P muted>
              Each market is a fixed-product market maker (FPMM) with the same integer math as the Aleo program. An
              outcome&apos;s price is proportional to the inverse of its reserve:
            </P>
            <CodeBlock title="FPMM">{`price_i = (1 / r_i) / Σ_k (1 / r_k)

buy outcome i with a tokens (after fees):
  x = r_i
  for every other outcome k:   x = x × r_k / (r_k + a)
  shares_out = r_i + a − x
  new reserves:  r_i = x,  r_k = r_k + a

sell outcome i, releasing t (gross) for the shares offered:
  x = r_i
  for every other outcome k:   x = x × r_k / (r_k − t)
  shares_needed = x − r_i + t
  new reserves:  r_i = x,  r_k = r_k − t
  t = the largest amount whose shares_needed fits in the shares offered,
      and at least tokens_desired (otherwise ERR_SLIPPAGE)
  seller receives t − protocol fee − creator fee − LP fee
every reserve keeps at least one unit (ERR_POOL_DEPLETED, ERR_SLIPPAGE)`}</CodeBlock>
            <H3>Fees</H3>
            <Table
              head={['', 'Protocol', 'Creator', 'LP', 'Total']}
              rows={[
                ['Buy (of the amount in)', '0.5%', '0.5%', '—', '1.0%'],
                ['Sell (of the amount released)', '0.5%', '0.5%', '1.0%', '2.0%'],
              ]}
            />
            <P muted>
              Protocol fees go to the treasury. Creator fees accumulate in the market, and the creator collects them once
              with <C>withdraw_creator_fees</C> after resolution. A sell pays for every share offered:{' '}
              <C>tokens_desired</C> is the least the seller accepts, and the pool releases as much as the shares cover.
              The seller receives that minus the three fees, and the LP fee stays in the market&apos;s collateral, so LPs
              collect it when they withdraw. (The Aleo program released exactly tokens_desired, burned the shares offered
              beyond that, and priced sells on tokens_desired − LP fee, so LPs never received the LP fee; the NEAR
              contract fixes both.) The owner can change the rates with <C>set_governance_value</C>; their sum is capped
              at 10%.
            </P>
            <H3>Trading rules</H3>
            <Bullets>
              <li>Minimum trade 0.001 (min_trade = 1,000 micro units), for buys and for the amount a sell asks for.</li>
              <li>Buying, selling and adding liquidity are open while the market is Active and the current tick is at or before the deadline.</li>
              <li>
                Slippage guards: <C>min_shares_out</C> (buy), the note amount offered (sell), <C>min_lp_shares</C> and{' '}
                <C>min_tokens_out</C>. A trade that would fall short fails with <C>ERR_SLIPPAGE</C>.
              </li>
              <li>
                While the owner has paused the contract, creating markets, trading, adding liquidity, turbo bets and new
                parlays stop. Redemptions, refunds, claims, deposits and withdrawals keep working.
              </li>
            </Bullets>
            <H3>Liquidity and payouts</H3>
            <Bullets>
              <li><B>add_liquidity</B>: at least 0.01; LP shares = amount × total LP shares / sum of reserves, and the amount is spread over the reserves in proportion.</li>
              <li>
                LP outcome risk: on a 2-outcome market the pool can lose up to half of its liquidity when the favoured
                outcome wins, and gains when the other one does. Liquidity added to a lopsided market mostly backs the
                outcomes traders expect to lose, so a late LP can get back much less than they put in while earlier LPs
                gain the difference. The Liquidity panel shows what a deposit would return under each outcome before you add it.
              </li>
              <li><B>redeem</B>: on a Resolved market, winning shares pay 1:1 in the market&apos;s token.</li>
              <li><B>refund</B>: on a Cancelled market, an outcome&apos;s shares get back the collateral that was paid into that outcome, pro rata within it (shares × that outcome&apos;s collateral / that outcome&apos;s shares), so cheap shares of one outcome cannot draw on what another outcome&apos;s buyers paid. <C>get_market</C> shows the ledger as <C>outcome_collateral</C>. Markets created before this ledger refund pro rata to all trader collateral.</li>
              <li>
                <B>withdraw_lp</B>: on a Resolved market, after the dispute deadline plus the winner-claim priority window
                (75 ticks on testnet), LPs receive their share of what is left once unredeemed winning shares and unclaimed
                creator fees are reserved. On a Cancelled market, their share of what is left after the traders&apos;
                collateral.
              </li>
            </Bullets>
            <H3>Market statuses</H3>
            <Table
              head={['status', 'Name', 'Meaning']}
              rows={[
                ['1', 'Active', 'trading open until the deadline'],
                ['2', 'Closed', 'close_market was called after the deadline'],
                ['5', 'Pending resolution', 'at least one vote; the voting window is running'],
                ['6', 'Pending finalization', 'the vote is counted; the dispute window is running'],
                ['7', 'Disputed', 'waiting for the committee or the timeout'],
                ['3', 'Resolved', 'the winning outcome is final; redeem is open'],
                ['4', 'Cancelled', 'refunds are open'],
              ]}
            />
          </section>

          <section className="mb-16">
            <SectionHeader id="resolution" icon={Gavel} title="Resolution" />
            <P>
              Markets resolve by bonded voting from ordinary NEAR accounts, with a dispute window and a 5-member committee
              as the last step. Bonds are paid in NEAR for every market, whatever its collateral. Nobody has to run a
              keeper: each stage takes effect when its window ends. The contract&apos;s views show every market at its
              effective stage, and the next call that touches the market (the first redeem, a refund, a bond claim, or{' '}
              <C>settle_market</C>) writes that stage on chain and pays the resolver in the same transaction. With the
              testnet windows below, a market nobody disputes resolves 1 h 15 min after its first vote.
            </P>
            <Steps
              steps={[
                {
                  title: 'Close',
                  body: <>After the deadline anyone may call <C>close_market</C>; it is optional, since voting also accepts an Active market whose deadline has passed.</>,
                },
                {
                  title: 'Vote',
                  body: <><C>vote_outcome(market_id, outcome, evidence)</C> with exactly 0.1 NEAR attached, one vote per account, until the resolution deadline. <C>evidence</C> is optional: a link of up to 300 bytes, stored with the vote (<C>get_vote_evidence</C>). The first vote opens the voting window (225 ticks, 15 minutes) and fixes the dispute deadline, one dispute window after it. A window that ends without the quorum reopens with the next vote.</>,
                },
                {
                  title: 'Counted',
                  body: <>When the window ends with at least min_voters votes (1 on testnet), the outcome with the largest total bond is the result; a tie goes to the lower outcome number. No call is needed (<C>finalize_votes</C> still exists and does only this step).</>,
                },
                {
                  title: 'Dispute window',
                  body: <>For 900 ticks (1 hour) anyone can call <C>dispute_resolution(market_id, proposed_outcome)</C>, naming a different outcome and attaching 3 × the total voter bonds. Without a dispute the result is final when the window ends, and bonds on losing outcomes go to the treasury (<C>confirm_resolution</C> is optional).</>,
                },
                {
                  title: 'Resolver paid',
                  body: <>The first voter of the winning outcome is the market&apos;s resolver. The call that settles the market pays them their bond back plus a share of the market&apos;s protocol fees (<C>get_resolver_reward_bps</C>, 5000 = half), so a correct resolver earns something and claims nothing. If nobody voted for the outcome the committee chose, the disputer who proposed it is the resolver.</>,
                },
                {
                  title: 'Committee',
                  body: <>On a disputed market anyone calls <C>initiate_escalation</C>. The 5 committee members vote with <C>committee_vote_resolve</C>, one vote each. Once <C>finalize_committee_vote</C> finds one outcome with at least 3 votes and no tie at the top, the decision applies by itself (<C>governance_resolve</C> only writes it down early). Bonds on other outcomes are forfeited, and so is the dispute bond if the committee chose another outcome than the disputer&apos;s.</>,
                },
                {
                  title: 'Cancellation',
                  body: <>A dispute the committee has not decided within disputed_timeout (21600 ticks, 24 hours) cancels the market, and so does a resolution deadline reached with no vote counted. Every position, liquidity share and bond is then refunded.</>,
                },
              ]}
            />
            <H3>How a result is decided</H3>
            <P>
              Voters, disputers and the committee all apply the same standard, written out in{' '}
              <A href="https://github.com/hevDev7/veiled-markets-near/blob/main/docs/near/RESOLUTION.md">RESOLUTION.md</A>. In short:
            </P>
            <Bullets>
              <li>A market resolves on its own question, rules and named resolution source, as they stood when it was created, for what was true at its trading deadline (UTC).</li>
              <li>The named source decides. If it is unavailable, a clear consensus of reliable public reporting decides. A &quot;Will X happen by D?&quot; market whose X has not happened by D resolves No.</li>
              <li>A market that cannot be decided this way (an ambiguous question, an event called off, a source that never publishes) is not forced onto an outcome: its vote is disputed, the committee declines to pick one, and the time limit cancels the market with every bond returned.</li>
              <li>A vote should carry a link to the evidence it relies on. The committee reads the votes&apos; evidence and the market&apos;s source, and decides by the same rules.</li>
            </Bullets>
            <Callout tone="warn">
              Who resolves today: anyone can vote, but on testnet most votes so far come from the team&apos;s own accounts,
              and the five committee accounts are all run by the operator, so a disputed market is decided by the team.
              One voter is enough and the bond is 0.1 NEAR, so a single account can decide a market that nobody disputes
              within the hour. A production deployment needs a larger bond, more voters, and a committee the operator does
              not control.
            </Callout>
            <H3>AI resolver (NEAR AI Cloud)</H3>
            <P>
              <C>backend/src/near-ai-resolver.ts</C> is an optional first voter. When a market&apos;s trading closes, it
              fetches the market&apos;s resolution source and asks a model that runs inside NEAR AI Cloud&apos;s TEE which
              outcome the source supports under the market&apos;s rules. It votes only when the model is confident and NEAR
              AI&apos;s model TEE signed the exact request and response with a key from the hardware attestation fetched just
              before the request. The vote carries a link to a receipt (question, source excerpt, request, response,
              reasoning, signature, attestation) and the receipt&apos;s SHA-256, so anyone can check it, including in NEAR
              AI&apos;s Verification Center. It casts an ordinary bonded vote with no special power: a wrong AI vote is
              disputed and decided by the committee like any other. It votes as <C>ai.veiled-markets.testnet</C>, an
              account of its own. It runs on the hosted demo and looks for closed markets every two minutes; its{' '}
              <A href="https://ai-resolver-production.up.railway.app/receipts">receipt index</A> lists every market it
              has looked at and what it did.
            </P>
            <P muted>
              The same service answers the create page&apos;s source check, <C>GET /check-source?url=…</C>, with the
              reader it votes with: a public http or https address on the default port, at most 3 redirects, 10 seconds
              a request and 15 for the whole read, and 1 MB, read as plain text without running JavaScript. A source that gives fewer than 200 characters of
              text, or that the reader cannot fetch, is refused. Coinbase candles, Nasdaq daily history and Frankfurter
              rates are checked with a past date and the shape of the answer instead. The service answers browsers only
              from the origins in <C>MARKET_AI_ORIGINS</C> (default <C>https://veiledmarkets.xyz,http://localhost:3100</C>);{' '}
              <C>npm run ai-resolver -- --serve-only</C> runs the check and the receipts without voting.
            </P>
            <H3>Bonds, fees and cancellation</H3>
            <Bullets>
              <li><B>settle_market(market_id)</B>: anyone; applies every stage that is due and returns the status. Optional: redeems, refunds and claims do the same.</li>
              <li><B>claim_voter_bond(market_id)</B>: voters on the winning outcome once the market is Resolved (the resolver was already paid); every voter once it is Cancelled.</li>
              <li><B>claim_dispute_bond(market_id)</B>: the disputer, if the proposed outcome won or the market was cancelled, unless the settling call already paid them as resolver.</li>
              <li><B>withdraw_creator_fees(market_id)</B>: the creator, once, after the dispute deadline plus the winner-claim priority window.</li>
              <li>
                <B>cancel_market(market_id)</B>: the creator while the market is Active with no volume. For anyone else it
                only writes down a cancellation that is already due: no vote counted by the resolution deadline, or a
                dispute left undecided past disputed_timeout. A voted outcome is confirmed or disputed, never cancelled.
              </li>
            </Bullets>
            <Callout tone="warn">
              Public payouts (bond refunds, creator fees, treasury and parlay pool withdrawals) are plain transfers. If one
              fails, for example a USDC creator fee to an account that is not registered with the USDC contract, the
              contract books the amount into the treasury and logs a <C>payout_failed</C> event.
            </Callout>
            <H3>Testnet configuration (get_config)</H3>
            <Table
              head={['Parameter', 'Value']}
              rows={[
                ['vote_window', '225 ticks (15 min)'],
                ['dispute_window', '900 ticks (1 h)'],
                ['winner_claim_priority', '900 ticks (1 h)'],
                ['disputed_timeout', '21600 ticks (24 h)'],
                ['vote_bond', '100000 (0.1 NEAR)'],
                ['min_voters', '1'],
                ['dispute_bond_multiplier', '3'],
                ['min_trade', '1000 (0.001)'],
                ['min_liquidity', '10000 (0.01)'],
                ['protocol_fee_bps / creator_fee_bps / lp_fee_bps', '50 / 50 / 100'],
                ['committee_quorum', '3'],
                ['resolver reward (get_resolver_reward_bps)', '5000 (half the protocol fees)'],
              ]}
            />
            <CodeBlock title="vote from the command line (near-cli-rs)">{`near contract call-function as-transaction v1.veiled-markets.testnet vote_outcome \\
  json-args '{"market_id":"30","outcome":1}' prepaid-gas '30 Tgas' attached-deposit '0.1 NEAR' \\
  sign-as <your-account>.testnet network-config testnet sign-with-keychain send`}</CodeBlock>
          </section>

          <section className="mb-16">
            <SectionHeader id="turbo" icon={Radio} title="Turbo rounds" />
            <P>
              Turbo rounds are short UP/DOWN markets on a crypto price. The oracle operator account{' '}
              <C>veiled-oracle.testnet</C> opens a round per symbol every 5 minutes (75 ticks) and resolves it at the
              deadline; each round&apos;s closing price becomes the next round&apos;s baseline. There is no voting and no
              dispute. The trust sits with the operator, so the contract checks every price it submits and the operator
              logs each one for public verification.
            </P>
            <Table
              head={['Rule', 'Value']}
              rows={[
                ['Symbols', '1 BTC, 2 ETH, 3 SOL'],
                ['Duration', '15 to 900 ticks (1 to 60 min); the app runs 75 ticks'],
                ['Stake token', 'NEAR only'],
                ['Minimum bet', '0.001 NEAR'],
                ['Fee', '0.5% of each bet, to the treasury'],
                ['Betting closes', 'one fifth of the round before the deadline (get_turbo_market shows betting_deadline); later bets fail with ERR_BETTING_CLOSED'],
                ['Prices', 'USD with 6 decimals (price × 10^6)'],
              ]}
            />
            <H3>What the contract checks</H3>
            <Bullets>
              <li>
                <B>create_turbo_market(symbol_id, deadline, baseline_price, baseline_conf, baseline_block)</B>: operator
                only; the baseline was observed at most 60 ticks ago; its confidence interval is at most 0.5% of the price.
              </li>
              <li>
                <B>resolve_turbo_market(market_id, closing_price, closing_conf, closing_block)</B>: operator only; the
                closing block lies between the deadline and the deadline + 60 ticks; the call comes no later than the
                deadline + 300 ticks (20 min); the confidence is at most 0.5%; the close is within 50% of the baseline.
              </li>
              <li>UP wins if the close is above the baseline. Otherwise DOWN wins, so a tie goes to DOWN.</li>
            </Bullets>
            <H3>Payouts</H3>
            <CodeBlock title="pari-mutuel">{`pool   = total_up + total_down              (stakes after the 0.5% fee)
payout = your_stake × pool / winning_side_total`}</CodeBlock>
            <P muted>
              If nobody bet on the winning side, the round becomes Cancelled and every bet is refunded. Bets and claims are
              private: <C>turbo_buy</C> spends a NEAR balance note and mints a turbo note (kind 4), and{' '}
              <C>turbo_claim</C> turns a winning or cancelled turbo note into a NEAR balance note. Example: round 161 (BTC)
              had a baseline of 73,769.812924 and closed at 73,613.086499, so DOWN won; its one bet of 0.1 NEAR staked
              0.0995 after the fee and was paid 0.0995.
            </P>
            <H3>Cancellation and statuses</H3>
            <Bullets>
              <li><B>emergency_cancel_turbo(market_id)</B>: the operator after the resolution deadline (deadline + 300 ticks); anyone after a further 5000 ticks (about 5.5 h).</li>
              <li><B>prune_turbo(market_ids)</B>: the operator or owner deletes finished rounds that had no bets (up to 100 per call). Rounds with bets are never removed.</li>
              <li>Statuses: 1 Active, 2 Resolved, 3 Cancelled.</li>
              <li><C>get_turbo_markets</C> lists only rounds that received a bet; <C>get_latest_turbo(symbol_id)</C> returns the current round.</li>
            </Bullets>
            <H3>Pyth price feeds</H3>
            <Table
              head={['Symbol', 'Pyth feed id']}
              rows={[
                ['BTC/USD', <C key="b">0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43</C>],
                ['ETH/USD', <C key="e">0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace</C>],
                ['SOL/USD', <C key="s">0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d</C>],
              ]}
            />
          </section>

          <section className="mb-16">
            <SectionHeader id="parlays" icon={ListOrdered} title="Parlays" />
            <P>
              A parlay combines 2 to 4 legs. Each leg is one outcome on a different prediction market, and every leg must
              win for the ticket to pay. Placing and claiming are private. Settlement is read directly from the leg
              markets, which live in the same contract.
            </P>
            <H3>Odds</H3>
            <CodeBlock title="computed by the contract at placement">{`leg odds         = 1 / price of the outcome    (above 1×, at most 100×)
combined odds    = leg odds × leg odds × …     (at most 1000×)
potential payout = stake × combined odds
net if won       = potential payout − 2% fee`}</CodeBlock>
            <P muted>
              Odds come from the live FPMM pools when the parlay is placed, so they match the prices the app shows.
              The contract keeps them in basis points (20000 = 2×) and rounds down after each multiplication.{' '}
              <C>min_payout</C> is the slippage guard: if prices move before the transaction lands and the payout would
              be lower, the parlay fails with <C>ERR_SLIPPAGE</C>. Example: legs priced at 50% and 25% have odds of 2× and
              4×, 8× combined, so a 1 NEAR stake has a potential payout of 8 NEAR before the fee.{' '}
              <C>quote_parlay(token, stake, legs)</C> returns the same numbers without placing anything.
            </P>
            <Table
              head={['Rule', 'Value']}
              rows={[
                ['Legs', '2 to 4, each on a different market that the owner approved for parlays, is Active and not past its deadline'],
                ['Leg cap', 'one ticket pays at most 1% of its thinnest leg\'s pool depth (outcomes × smallest reserve); the owner can change the share'],
                ['Stake token', 'NEAR or USDC, paid from your private balance'],
                ['Minimum stake', '0.1'],
                ['Maximum payout', '100,000 per parlay'],
                ['Fee', '2% of the payout of a winning ticket, to the treasury'],
              ]}
            />
            <P muted>
              Minimum stake, maximum payout, fee and the combined-odds cap are defaults the owner can change with{' '}
              <C>set_parlay_config</C>; the 100× leg cap and the 110% coverage are fixed. Leg odds are read from the
              markets&apos; own pools, so a ticket is only as sound as its legs: the owner approves leg markets with{' '}
              <C>set_parlay_leg</C> (<C>ERR_LEG_NOT_ELIGIBLE</C> otherwise), and a ticket that would pay more than the
              leg cap fails with <C>ERR_LEG_LIQUIDITY</C>. A pool pushed to one side has a small reserve, so the legs
              with the most extreme odds carry the smallest tickets.
            </P>
            <H3>Payout pool</H3>
            <P muted>
              Payouts come from a parlay pool per token, which the operator funds with <C>fund_parlay_pool</C>. Stakes
              join the pool. A new parlay is accepted only if the pool, including its stake, still covers 110% of what it
              owes open tickets (potential payouts, and stakes of cancelled parlays not yet refunded); otherwise it fails
              with <C>ERR_POOL_CAPACITY</C>. <C>quote_parlay</C> reports the largest stake the pool accepts right now as{' '}
              <C>max_stake</C>, and <C>get_parlay_pool</C> shows the pool, what it owes and the limits.
            </P>
            <H3>Lifecycle</H3>
            <Table
              head={['Step', 'Call', 'What happens']}
              rows={[
                [
                  'Place (private)',
                  <C key="p">{'transact parlay_buy{legs, min_payout}'}</C>,
                  'spends a balance note (kind 1) of the stake token and mints a ticket note (kind 5: asset = parlay id, sub = 0, amount = potential payout)',
                ],
                [
                  'Settle (public, anyone)',
                  <C key="s">settle_parlay(parlay_id)</C>,
                  'reads the leg markets and sets Won, Lost or Cancelled; fails with ERR_PARLAY_NOT_READY while the result is open',
                ],
                [
                  'Claim (private)',
                  <C key="c">transact parlay_claim</C>,
                  'spends the whole ticket and mints a balance note: the payout minus 2% if Won, the stake if Cancelled. Settles first if needed',
                ],
              ]}
            />
            <H3>Settlement rules</H3>
            <Bullets>
              <li>As soon as any leg market resolves to a different outcome, the parlay is <B>Lost</B>. The stake stays in the pool.</li>
              <li>Otherwise it waits until every leg market is final (Resolved or Cancelled).</li>
              <li>Then it is <B>Cancelled</B> if any leg market was cancelled (the stake is refunded), and <B>Won</B> if every leg won.</li>
              <li>So the result never depends on when <C>settle_parlay</C> is called. Statuses: 1 Active, 2 Won, 3 Lost, 4 Cancelled.</li>
            </Bullets>
            <P muted>
              The ticket&apos;s holder is hidden. Its legs, stake and potential payout are public, like an AMM trade.{' '}
              <C>get_parlay(parlay_id)</C> shows each leg&apos;s live state (0 pending, 1 won, 2 lost, 3 cancelled) and{' '}
              <C>settle_status</C>, the status that <C>settle_parlay</C> would set now.
            </P>
            <Callout>
              Unlike the Aleo version, parlays on NEAR have no resolver submission and no dispute window: the leg
              markets&apos; own resolution decides the parlay.
            </Callout>
          </section>

          <section className="mb-16">
            <SectionHeader id="tokens" icon={Coins} title="Tokens" />
            <Table
              head={['id', 'Token', 'Account', 'Used for']}
              rows={[
                ['1', 'NEAR', 'native', 'markets, turbo rounds, parlays, resolution bonds'],
                ['2', 'retired', <C key="m">usdcx.veiled-tokens.testnet</C>, 'an early mock token; not offered'],
                ['3', 'USDC', <C key="u">{USDC}</C>, 'markets, parlays'],
              ]}
            />
            <P muted>
              Every amount in the contract is in 6-decimal micro units. 1 NEAR = 1,000,000 micro, so 1 micro NEAR =
              10^18 yoctoNEAR and an attached NEAR deposit must be a whole number of micro units. USDC has 6 decimals, so
              its micro unit is its own smallest unit. The smallest deposit is 0.01 of either token.
            </P>
            <H3>USDC</H3>
            <P muted>
              The app uses Circle&apos;s official testnet USDC on NEAR. Get it at{' '}
              <A href="https://faucet.circle.com">faucet.circle.com</A> (choose NEAR Testnet); the faucet registers your
              account with the USDC contract.
            </P>
            <Bullets>
              <li>
                <B>Deposit</B>: <C>ft_transfer_call</C> on the USDC contract to <C>{CONTRACT}</C> with msg{' '}
                <C>{'{"deposit":{"owner_blind":"…","memo":"…"}}'}</C>. The app fills in <C>owner_blind</C> and{' '}
                <C>memo</C> from your note key; a note with an owner blind you did not derive from your key cannot be found
                or spent by the app.
              </li>
              <li><B>Create a USDC market</B>: <C>ft_transfer_call</C> with msg <C>{'{"create_market":{…CreateMarketArgs}}'}</C>; the amount is the initial liquidity.</li>
              <li><B>Fund the parlay pool</B>: <C>ft_transfer_call</C> with msg <C>{'{"fund_parlay_pool":{}}'}</C>.</li>
              <li>
                <B>Withdraw</B>: the contract pays with <C>ft_transfer</C>, so the receiving account must be registered
                with the USDC contract (NEP-145 <C>storage_deposit</C>); an account that used the faucet already is. If
                the transfer fails, the amount comes back to your private balance as a new note.
              </li>
              <li>Transfers from any other token contract are rejected (<C>ERR_TOKEN</C>), and the token contract refunds them.</li>
            </Bullets>
            <CodeBlock title="USDC deposit arguments (the app builds these)">{`// call ft_transfer_call on 3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af
// with 1 yoctoNEAR attached
{
  receiver_id: 'v1.veiled-markets.testnet',
  amount: '5000000',                                   // 5 USDC
  msg: JSON.stringify({ deposit: { owner_blind, memo } }),
}`}</CodeBlock>
          </section>

          {/* ══════════════ REFERENCE ══════════════ */}
          <GroupHeading title="Reference">
            Methods, data formats and HTTP endpoints. Everything here can be called directly; the app is one client of it.
          </GroupHeading>

          <section className="mb-16">
            <SectionHeader id="contract-api" icon={Code} title="Contract API" />
            <P>
              Account <C>{CONTRACT}</C>. Arguments are JSON. u64 and u128 values (ids, amounts, ticks) are strings; u8
              values (outcome, side, token, kind) are numbers; field elements (owner blinds, roots, nullifiers) are
              decimal strings. A failed call panics with an <C>ERR_*</C> code such as <C>ERR_SLIPPAGE</C>,{' '}
              <C>ERR_MIN_TRADE</C>, <C>ERR_STATUS</C> or <C>ERR_DEADLINE</C>.
            </P>

            <H3>Private actions: transact</H3>
            <P muted>
              <C>transact(proof, public, ext_data)</C> verifies a Groth16 proof, marks both nullifiers spent and performs{' '}
              <C>ext_data.action</C>. Anyone may call it; in practice the relayer does. <C>ext_data</C> is the exact JSON
              text whose sha256 is bound into the proof, so nobody can change the action, the recipient, the fee or the
              owner of the minted note after the proof is made.
            </P>
            <CodeBlock title="ext_data (a buy)">{`{
  "action": {
    "type": "buy", "market_id": "30", "outcome": 1, "min_shares_out": "1800000"
  },
  "new_owner_blind": "<field: owner of the minted note>",
  "new_memo": "<encrypted memo for the minted note>",
  "change_memo": "<encrypted memo for the change note>",
  "relayer": null,
  "fee": "0"
}`}</CodeBlock>
            <Table
              head={['action.type', 'Fields', 'Spends', 'Mints']}
              rows={[
                ['withdraw', 'recipient', 'balance (1)', 'nothing; pays the recipient. out_amount 0 merges two notes'],
                ['buy', 'market_id, outcome, min_shares_out', 'balance (1) in the market token', 'shares (2)'],
                ['sell', 'tokens_desired', 'shares (2); out_amount = shares sold, all paid for; tokens_desired is the least the pool must release', 'balance (1)'],
                ['add_liquidity', 'market_id, min_lp_shares', 'balance (1)', 'LP (3)'],
                ['withdraw_lp', 'min_tokens_out', 'LP (3)', 'balance (1)'],
                ['redeem', '—', 'winning shares (2)', 'balance (1)'],
                ['refund', '—', 'shares (2) of a cancelled market', 'balance (1)'],
                ['turbo_buy', 'market_id, side (1 UP, 2 DOWN)', 'NEAR balance (1)', 'turbo (4)'],
                ['turbo_claim', '—', 'turbo (4)', 'NEAR balance (1)'],
                ['parlay_buy', 'legs [{market_id, outcome}], min_payout', 'balance (1)', 'parlay ticket (5)'],
                ['parlay_claim', '—', 'parlay ticket (5), whole', 'balance (1)'],
              ]}
            />
            <P muted>
              <C>fee</C> and <C>relayer</C> are allowed only on <C>withdraw</C> (<C>ERR_FEE_ACTION</C> otherwise), and the
              testnet relayer requires <C>&quot;fee&quot;: &quot;0&quot;</C>. The call returns{' '}
              <C>{'{change_index, new_index, new_commitment, new_kind, new_asset, new_sub, new_amount}'}</C>.
            </P>

            <H3>Note pool</H3>
            <MethodList
              methods={[
                { name: 'deposit_near(owner_blind, memo)', tag: 'payable', desc: 'Mints a NEAR balance note for the attached deposit (a whole number of micro units, at least 0.01 NEAR). Returns the leaf index.' },
                { name: 'ft_on_transfer(sender_id, amount, msg)', tag: 'called by the USDC contract', desc: <>The NEP-141 receiver. msg is <C>{'{"deposit":{…}}'}</C>, <C>{'{"create_market":{…}}'}</C> or <C>{'{"fund_parlay_pool":{}}'}</C>.</> },
                { name: 'transact(proof, public, ext_data)', tag: 'anyone (the relayer)', desc: 'Private actions, above.' },
              ]}
            />

            <H3>Markets and resolution</H3>
            <MethodList
              methods={[
                { name: 'create_market(args)', tag: 'payable', desc: 'Creates a NEAR market with the attached deposit as liquidity; returns the market id. USDC markets use ft_transfer_call.' },
                { name: 'close_market(market_id)', tag: 'anyone', desc: 'Active → Closed after the deadline.' },
                { name: 'vote_outcome(market_id, outcome, evidence?)', tag: 'payable, 0.1 NEAR', desc: 'One bonded vote per account, until the resolution deadline; evidence is an optional link of up to 300 bytes.' },
                { name: 'settle_market(market_id)', tag: 'anyone', desc: 'Applies every resolution stage that is due and returns the status. Optional: the next call that touches the market does it.' },
                { name: 'finalize_votes(market_id)', tag: 'anyone', desc: 'Optional. After the voting window; counts the vote (the dispute window is already fixed).' },
                { name: 'confirm_resolution(market_id)', tag: 'anyone', desc: 'Optional. After the dispute window, without a dispute: Resolved, and the resolver is paid.' },
                { name: 'dispute_resolution(market_id, proposed_outcome)', tag: 'payable', desc: 'Inside the dispute window, with at least 3 × the total voter bonds.' },
                { name: 'initiate_escalation(market_id)', tag: 'anyone', desc: 'Sends a disputed market to the committee.' },
                { name: 'committee_vote_resolve(market_id, outcome)', tag: 'committee', desc: 'One vote per committee member.' },
                { name: 'finalize_committee_vote(market_id)', tag: 'anyone', desc: 'Needs one outcome with at least 3 votes and no tie at the top.' },
                { name: 'governance_resolve(market_id)', tag: 'anyone', desc: 'Optional. Writes down the committee decision, which applies anyway once finalized.' },
                { name: 'cancel_market(market_id)', tag: 'creator or anyone', desc: 'See Resolution for the three cases.' },
                { name: 'claim_voter_bond(market_id)', tag: 'voter', desc: 'Pays the bond back to the voter; returns the amount (for the resolver, what the settling call paid).' },
                { name: 'claim_dispute_bond(market_id)', tag: 'disputer', desc: 'Pays the dispute bond back if the proposed outcome won or the market was cancelled; returns the amount.' },
                { name: 'withdraw_creator_fees(market_id)', tag: 'creator', desc: 'Once, after the winner-claim priority window.' },
                { name: 'get_vote_evidence(market_id, account_id)', tag: 'view', desc: 'The evidence link stored with that account’s vote, or null.' },
                { name: 'get_resolver_reward_bps()', tag: 'view', desc: 'The resolver’s share of a market’s protocol fees; the owner sets it with set_resolver_reward_bps.' },
              ]}
            />
            <CodeBlock title="create_market arguments">{`{
  "args": {
    "question_hash": "<up to 96 characters>",
    "category": 3,
    "num_outcomes": 2,
    "deadline": "448700000",              // tick
    "resolution_deadline": "448750000",   // tick, after the deadline
    "metadata": "{\\"v\\":1,\\"q\\":\\"Will …?\\",\\"o\\":[\\"Yes\\",\\"No\\"]}",
    "lp_owner_blind": "<field: owner of the creator's LP note>",
    "lp_memo": "<encrypted memo>"
  }
}`}</CodeBlock>

            <H3>Turbo</H3>
            <MethodList
              methods={[
                { name: 'create_turbo_market(symbol_id, deadline, baseline_price, baseline_conf, baseline_block)', tag: 'oracle operator', desc: 'Opens a round; returns its id.' },
                { name: 'resolve_turbo_market(market_id, closing_price, closing_conf, closing_block)', tag: 'oracle operator', desc: 'Resolves a round; returns the new status.' },
                { name: 'emergency_cancel_turbo(market_id)', tag: 'operator, later anyone', desc: 'Cancels an unresolved round after its resolution deadline.' },
                { name: 'prune_turbo(market_ids)', tag: 'operator or owner', desc: 'Deletes up to 100 finished rounds that had no bets; returns how many went.' },
              ]}
            />

            <H3>Parlays</H3>
            <MethodList
              methods={[
                { name: 'settle_parlay(parlay_id)', tag: 'anyone', desc: 'Settles from the leg markets; returns the new status.' },
                { name: 'fund_parlay_pool(token)', tag: 'payable', desc: <>Adds the attached NEAR to the pool (token must be 1). USDC uses ft_transfer_call with <C>{'{"fund_parlay_pool":{}}'}</C>.</> },
                { name: 'withdraw_parlay_pool(token, amount, recipient)', tag: 'owner', desc: 'The pool must keep 110% of what open parlays are owed.' },
                { name: 'set_parlay_config(min_stake?, max_payout?, fee_bps?, max_combined_odds_bps?, paused?)', tag: 'owner', desc: 'Arguments left out keep their value.' },
                { name: 'set_parlay_leg(market_id, eligible)', tag: 'owner', desc: 'Approves a market as a parlay leg, or withdraws the approval. Open tickets are not affected.' },
                { name: 'set_parlay_leg_cap(bps)', tag: 'owner', desc: 'The share of its thinnest leg\'s pool depth one ticket may pay (default 100 = 1%).' },
              ]}
            />

            <H3>Owner</H3>
            <MethodList
              methods={[
                { name: 'set_governance_value(key, value)', tag: 'owner', desc: 'Keys: 1 protocol fee, 2 creator fee, 3 LP fee (bps, at most 1000 together), 4 min trade, 5 min liquidity, 6 pause (1) or unpause (0).' },
                { name: 'set_resolution_config(vote_window?, dispute_window?, winner_claim_priority?, disputed_timeout?, vote_bond?, min_voters?, dispute_bond_multiplier?, committee_quorum?)', tag: 'owner', desc: 'Resolution windows (ticks), bond and quorums; arguments left out keep their value. Applies to votes, disputes and finalizations made afterwards.' },
                { name: 'withdraw_treasury(token, amount, recipient)', tag: 'owner', desc: 'Pays out protocol fees and forfeited bonds.' },
                { name: 'set_token_account(token, account_id)', tag: 'owner', desc: 'Points token slot 2 or 3 at a NEP-141 contract; allowed only while nothing is held in that token.' },
              ]}
            />

            <H3>Views</H3>
            <Table
              head={['View', 'Returns']}
              rows={[
                [<C key="1">get_markets(from, limit)</C>, 'up to 100 markets in creation order'],
                [<C key="2">get_market(market_id)</C>, 'one market or null: status, reserves, deadlines, token_type, metadata, fees, tally, dispute, committee state'],
                [<C key="3">get_market_count()</C>, 'number of prediction markets'],
                [<C key="4">get_vote(market_id, account_id)</C>, '{outcome, bond, claimed} or null'],
                [<C key="5">get_turbo_market(market_id)</C>, 'one round or null'],
                [<C key="6">get_latest_turbo(symbol_id)</C>, 'the current round for a symbol'],
                [<C key="7">get_turbo_markets(from, limit)</C>, 'up to 100 rounds that received a bet'],
                [<C key="8">get_turbo_count()</C>, 'number of rounds that received a bet'],
                [<C key="9">get_turbo_exposure()</C>, 'stake owed to unclaimed turbo bets'],
                [<C key="10">get_parlay(parlay_id)</C>, 'legs with live state, stake, potential_payout, combined_odds_bps, status, settle_status, claimed'],
                [<C key="11">get_parlays(from, limit)</C>, 'up to 100 parlays in creation order (parlay ids start at 1)'],
                [<C key="12">get_parlay_count()</C>, 'number of parlays'],
                [<C key="13">get_parlay_pool()</C>, 'pool and exposure per token, limits, fee, paused'],
                [<C key="14">quote_parlay(token, stake, legs)</C>, 'leg_odds_bps, combined_odds_bps, potential_payout, fee_if_won, net_if_won, max_stake'],
                [<C key="15">get_tree_info()</C>, '{next_index, root, depth}'],
                [<C key="16">get_leaves(from, limit)</C>, 'up to 500 leaves: {index, commitment, note?, memo}'],
                [<C key="17">is_spent(nullifier), is_known_root(root)</C>, 'booleans'],
                [<C key="18">get_config(), get_governance_values()</C>, 'parameters; governance values include paused'],
                [<C key="19">get_treasury(), get_program_credits()</C>, 'amounts per token id (index 0 unused)'],
                [<C key="20">get_token_accounts()</C>, 'the token contracts of slots 2 and 3'],
                [<C key="21">get_height()</C>, 'the current tick'],
                [<C key="22">get_next_id()</C>, 'the next market or round id (markets and turbo rounds share one counter)'],
              ]}
            />
          </section>

          <section className="mb-16">
            <SectionHeader id="circuit" icon={Cpu} title="Circuit" />
            <P>
              One circuit, <C>near/circuits/spend.circom</C>, covers every private action: Groth16 on BN254 with circomlib
              Poseidon. It proves that the spender owns two notes of the same (kind, asset, sub) under a known root (a
              zero-amount input is a dummy and skips the tree check), that the nullifiers belong to those notes, that{' '}
              <C>outAmount</C> is at most their total, and that <C>changeCommitment</C> holds the rest for the same owner.
            </P>
            <CodeBlock title="public signals, in order">{`root, nullifier1, nullifier2, changeCommitment, kind, asset, sub, outAmount, extDataHash

extDataHash = sha256(ext_data as UTF-8), read big-endian, top 3 bits cleared`}</CodeBlock>
            <Bullets>
              <li>Tree depth 20. Leaves are inserted in pairs (change note, minted note); a deposit inserts (note, 0). The zero leaf is 0 and <C>zeros[i+1] = Poseidon(zeros[i], zeros[i])</C>.</li>
              <li>The contract accepts any of the last 32 roots, so a proof stays valid while a few other transactions land.</li>
              <li>Proofs are <C>{'{a, b, c}'}</C> as decimal strings in snarkjs order without the projective coordinate.</li>
              <li>The app serves the circuit files at <C>/zk/spend.wasm</C>, <C>/zk/spend_final.zkey</C> and <C>/zk/verification_key.json</C>.</li>
              <li>Trusted setup: PSE Perpetual Powers of Tau (2^15) plus a single phase-2 contribution. Mainnet would need a multi-party ceremony.</li>
            </Bullets>
          </section>

          <section className="mb-16">
            <SectionHeader id="relayer-api" icon={Send} title="Relayer API" />
            <P>
              The relayer (<C>backend/src/near-relayer.ts</C>, account <C>veiled-relayer.testnet</C>) submits{' '}
              <C>transact</C> with 300 TGas and charges no fee on testnet. It can refuse a request but cannot change one,
              because the proof binds the action. The app reads its address from <C>VITE_RELAYER_URL</C> (default{' '}
              <C>http://localhost:4100</C>). CORS is open.
            </P>
            <Table
              head={['Endpoint', 'Response']}
              rows={[
                [<C key="h">GET /health</C>, '{ok, relayer, contract, rpc, balanceNear}'],
                [<C key="r">POST /relay</C>, 'body {proof, public, ext_data}; 200 {ok: true, txHash, result}'],
                ['', '422 {ok: false, txHash, error}: the contract rejected it; error is the ERR_* code'],
                ['', '400: malformed body, unknown action, a fee other than "0", an unknown root or a spent nullifier (checked before sending)'],
                ['', '429: more than 30 requests per minute from one IP; 502: the RPC failed'],
              ]}
            />
            <CodeBlock title="terminal">{`curl -s $RELAYER/health

curl -s -X POST $RELAYER/relay -H 'content-type: application/json' \\
  -d '{"proof":{"a":[…],"b":[[…],[…]],"c":[…]},"public":{"root":"…", …},"ext_data":"{\\"action\\":…}"}'`}</CodeBlock>
          </section>

          <section className="mb-16">
            <SectionHeader id="oracle-api" icon={Timer} title="Turbo oracle API" />
            <P>
              The turbo oracle (<C>backend/src/near-turbo-oracle.ts</C>, operator <C>veiled-oracle.testnet</C>) streams
              prices, opens and resolves rounds, and keeps the audit trail. The app reads it from{' '}
              <C>VITE_TURBO_ORACLE_URL</C> (default <C>http://localhost:4090</C>). CORS is open.
            </P>
            <Table
              head={['Endpoint', 'Response']}
              rows={[
                [<C key="h">GET /health</C>, '{ok, ts, chain, contract, price_source}; price_source is pyth or coingecko'],
                [<C key="q">GET /quote?symbol=BTC</C>, '{symbol, feedId, price, conf, publishTime}; price in USD, publishTime in Unix ms; 503 without a fresh quote'],
                [<C key="s">GET /stream?symbol=BTC</C>, 'server-sent events, each data: line a quote; paused while a round of that symbol is being resolved'],
                [<C key="c">GET /chain</C>, 'the current round of every symbol'],
                [<C key="cs">GET /chain/symbol?symbol=BTC</C>, 'the current round of one symbol; 404 if none'],
                [<C key="a">GET /audit</C>, 'audit rows, filtered PostgREST-style, for example ?symbol=eq.ETH&order=id.desc&limit=20'],
              ]}
            />
            <P muted>
              Audit rows have <C>id</C>, <C>event</C> (create, resolve or cancel), <C>market_id</C>, <C>symbol</C>,{' '}
              <C>pyth_price</C>, <C>pyth_conf</C>, <C>pyth_publish_time</C>, <C>operator_address</C>, <C>price_source</C>{' '}
              and the transaction. Some column names are kept from the Aleo version: <C>aleo_block</C> holds the
              contract tick and <C>aleo_tx_id</C> the NEAR transaction hash. Round ids carry the Aleo suffix{' '}
              <C>field</C> (<C>161field</C>), and the verify page takes the same form: <C>/verify/turbo/161field</C>.
            </P>
          </section>

          {/* ══════════════ RECIPES ══════════════ */}
          <GroupHeading title="Recipes">
            Short programs against the live testnet contract. They need no wallet and no API key unless stated.
          </GroupHeading>

          <section className="mb-16">
            <SectionHeader id="recipe-read-markets" icon={Terminal} title="Read markets and prices" />
            <P muted>
              A view call is a JSON-RPC <C>query</C> with base64 arguments. This lists the active markets with their
              outcome prices, computed from the reserves as in <A href="#markets">Pricing</A>.
            </P>
            <CodeBlock title="read-markets.mjs">{READ_MARKETS}</CodeBlock>
            <CodeBlock title="output (testnet, 12 Nov 2026)">{`#30 Will Bitcoin trade above $80,000 on December 31, 2026?  54.7% / 45.3%
#31 Will NEAR trade above $4 on December 31, 2026?  50.0% / 50.0%
#32 Where will ETH close on November 30, 2026?  25.0% / 25.0% / 25.0% / 25.0%`}</CodeBlock>
          </section>

          <section className="mb-16">
            <SectionHeader id="recipe-stream-prices" icon={Activity} title="Stream turbo prices" />
            <P muted>
              The oracle relays one price stream to every client, so all charts show the same price. The round&apos;s
              baseline and deadline come from the contract.
            </P>
            <CodeBlock title="stream.mjs">{STREAM_PRICES}</CodeBlock>
          </section>

          <section className="mb-16">
            <SectionHeader id="recipe-verify-turbo" icon={FlaskConical} title="Verify a turbo round" />
            <P muted>
              Anyone can check that the operator submitted the price Pyth published. The page{' '}
              <C>/verify/turbo/&lt;id&gt;field</C> does this in the app: it shows the audit trail and the contract values,
              and compares them with Pyth Hermes using your own Pyth API key, which stays in your browser&apos;s local
              storage and is sent only to Hermes. Hermes answers HTTP 401 without a key. The same check as a script:
            </P>
            <CodeBlock title="verify-turbo.mjs">{VERIFY_TURBO}</CodeBlock>
            <Callout>
              When the oracle runs without a Pyth key it uses CoinGecko (<C>price_source</C> is <C>coingecko</C>), and the
              comparison with Pyth is only approximate.
            </Callout>
          </section>

          <section className="mb-16">
            <SectionHeader id="recipe-run-locally" icon={Server} title="Run it locally" />
            <P muted>Requires Node.js 20 or newer and a NEAR testnet account in Meteor Wallet.</P>
            <CodeBlock title="terminal">{`# 1. Relayer (port 4100). Key: RELAYER_PRIVATE_KEY, or ~/.near-credentials/testnet/<RELAYER_ACCOUNT>.json
cd backend && npm install
npx tsx src/near-relayer.ts

# 2. Turbo oracle (port 4090). Key: ORACLE_PRIVATE_KEY, or ~/.near-credentials/testnet/veiled-oracle.testnet.json
#    Prices come from Pyth Hermes when backend/.env has PYTH_API_KEY, otherwise from CoinGecko.
npx tsx src/near-turbo-oracle.ts --serve --auto-create

# 3. Frontend (http://localhost:3100)
cd ../frontend && npm install
cp .env.example .env.local   # the NEAR section at the top has working testnet defaults
npm run dev`}</CodeBlock>
            <Bullets>
              <li>The frontend reads markets from the deployed contract without steps 1 and 2. Private actions need a relayer, and turbo rounds need the oracle.</li>
              <li>Any NEAR account can run a relayer: set <C>RELAYER_ACCOUNT</C> and <C>RELAYER_PRIVATE_KEY</C>, and point <C>VITE_RELAYER_URL</C> at it.</li>
              <li>The contract accepts turbo rounds only from <C>veiled-oracle.testnet</C>, so a second oracle needs its own contract deployment.</li>
              <li>
                A demo market: <C>cd backend && npx tsx scripts/quick-market.ts create 6</C> opens a NEAR price question for
                the first five-minute mark at least 6 minutes away. Its source is CoinGecko&apos;s price series around that
                moment, which has a sample exactly at the mark, so the AI resolver can decide it. To vote yourself after it
                closes, <C>npx tsx scripts/quick-market.ts resolve &lt;id&gt; &lt;1=Yes|2=No&gt;</C> casts the bonded vote.
                Unless someone disputes, the result is final 1 h 15 min later, and the first redeem settles the market
                (<C>--settle</C> waits and sends <C>settle_market</C> instead).
              </li>
              <li><C>NEAR_RPC_URL</C> takes a comma-separated list for the relayer, the oracle and the scripts; a call moves to the next endpoint on a timeout or rate limit.</li>
            </Bullets>
          </section>

          {/* ══════════════ DEPLOYMENT ══════════════ */}
          <GroupHeading title="Deployment" />

          <section className="mb-16">
            <SectionHeader id="deployment" icon={Globe} title="Testnet deployment" />
            <Table
              head={['Account', 'Role']}
              rows={[
                [<C key="v">{CONTRACT}</C>, 'the contract'],
                [<C key="o">veiled-markets.testnet</C>, 'owner: parameters, pause, treasury, parlay pool'],
                [<C key="r">veiled-relayer.testnet</C>, 'submits private transactions (fee 0)'],
                [<C key="or">veiled-oracle.testnet</C>, 'opens and resolves turbo rounds'],
                [<C key="c">c1 … c5.veiled-markets.testnet</C>, 'the dispute committee'],
                [<C key="u">{USDC}</C>, 'USDC (Circle testnet)'],
              ]}
            />
            <Table
              head={['Frontend variable', 'Default']}
              rows={[
                [<C key="1">VITE_NEAR_CONTRACT</C>, CONTRACT],
                [<C key="2">VITE_NEAR_RPC_URLS</C>, 'https://test.rpc.fastnear.com, https://near-testnet.drpc.org'],
                [<C key="3">VITE_RELAYER_URL</C>, 'http://localhost:4100'],
                [<C key="4">VITE_RELAYER_ACCOUNT</C>, 'veiled-relayer.testnet'],
                [<C key="5">VITE_TURBO_ORACLE_URL</C>, 'http://localhost:4090'],
                [<C key="6">VITE_AI_RESOLVER_URL</C>, 'https://ai-resolver-production.up.railway.app'],
              ]}
            />
            <H3>Deploy your own contract</H3>
            <P muted>
              Build the wasm, then run <C>near/scripts/deploy-testnet.sh v2</C>: it creates the committee accounts and
              deploys and initializes <C>v2.veiled-markets.testnet</C> with the testnet configuration above. Then, as the
              registers the contract on Circle USDC, which it puts in token slot 3. (The live <C>v1</C> contract got it with
              <C>set_token_account(3, &quot;{USDC}&quot;)</C> after its upgrade; that is allowed only while nothing is held in
              the slot.) To rebuild the circuit, run{' '}
              <C>cd near/circuits && npm run build</C>.
            </P>
            <Table
              head={['Tests', 'Command']}
              rows={[
                ['Circuit', <C key="1">node --test near/circuits/test/spend.test.mjs</C>],
                ['Contract (near-workspaces sandbox)', <C key="2">cd near/contract && cargo test -p integration-tests</C>],
                ['Live testnet smoke test', <C key="3">cd backend && npx tsx scripts/testnet-smoke.ts</C>],
              ]}
            />
          </section>

          <section className="mb-16">
            <SectionHeader id="limits" icon={AlertTriangle} title="Limits and what is missing" />
            <H3>Not on NEAR yet</H3>
            <P muted>
              These parts of the Aleo version are not ported: community governance proposals, resolver staking and the
              resolver registry, reward epochs, and the multisig treasury. On NEAR the owner account holds the
              treasury and the parameters, disputed markets go to the 5-member committee, and a market&apos;s resolver is
              paid per market from its protocol fees.
            </P>
            <H3>Known limits</H3>
            <Bullets>
              <li><B>Testnet only.</B> Tokens have no value, and the contract may be redeployed.</li>
              <li><B>Resolution trust.</B> The team runs the five committee accounts and casts most votes on testnet, and one 0.1 NEAR vote can decide a market nobody disputes. See <A href="#resolution">Resolution</A>.</li>
              <li><B>Trusted setup.</B> The circuit key comes from a single phase-2 contribution.</li>
              <li><B>Turbo operator trust.</B> The operator submits prices. The contract checks its identity, the price range, the confidence and the maximum move, and the audit trail is public, but it cannot prove the price itself.</li>
              <li><B>One relayer.</B> If it is down, private actions wait. It pays the gas and cannot alter a trade.</li>
              <li><B>Central roles.</B> The owner can pause, change fees and minimums, and withdraw the treasury and spare parlay pool funds. The operator funds the parlay pool; when it runs low, new parlays are refused. The team holds the contract account&apos;s key and can deploy new contract code.</li>
              <li><B>Timing.</B> The note pool hides who trades, not when or how much. See <A href="#privacy">Privacy model</A>.</li>
              <li><B>Your note key.</B> It is derived from your wallet. If you lose the wallet, you lose the notes; if the wallet cannot sign messages, the key lives only in this browser.</li>
            </Bullets>

            <div className="mt-8 p-4 rounded-xl bg-brand-500/[0.04] border border-brand-500/[0.1] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-white mb-1">Try it on testnet</div>
                <div className="text-xs text-surface-400">Connect a NEAR testnet wallet, unlock your private balance and place a trade.</div>
              </div>
              <Link
                to="/dashboard"
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-brand-500 text-white text-xs font-semibold hover:bg-brand-400 transition-colors whitespace-nowrap"
              >
                Open the app <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </section>
        </main>
      </div>

      <Footer />
    </div>
  )
}
