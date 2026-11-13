// The governance page on NEAR: how a market's result is decided, which markets are being resolved now, and the
// settings the contract runs with. Everything shown is read from the contract. Proposals and resolver staking
// belong to the Aleo product and have no panel here.
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ArrowUpRight, Coins, Scale, ShieldAlert, Vote, type LucideIcon } from 'lucide-react'
import {
  decodeMetadata,
  getGovernanceValues,
  getNearConfig,
  getNearHeight,
  getResolverRewardBps,
  listNearMarkets,
  type NearConfig,
  type NearMarket,
} from '@/lib/near/chain'
import { accountUrl, TOKEN_SYMBOL, VEILED_CONTRACT } from '@/lib/near/config'
import {
  formatWindow,
  microToUnits,
  percentOfBps,
  resolutionCounts,
  resolutionStage,
  stageSummary,
  type ResolutionStage,
} from '@/lib/near/governance'
import { useMarketPath } from '@/lib/near/market-tx'
import { cn } from '@/lib/utils'

const card = 'rounded-2xl border border-white/[0.06] bg-surface-900/40'
const sectionTitle = 'font-display text-[1.375rem] leading-tight tracking-tight text-white'

const tokens = microToUnits

/** How often the markets and the contract's clock are read again, so stages move without a reload. */
const REFRESH_MS = 20_000

export function NearGovernance() {
  const [config, setConfig] = useState<NearConfig | null>(null)
  const [paused, setPaused] = useState<boolean | null>(null)
  const [rewardBps, setRewardBps] = useState<number | null>(null)
  const [chain, setChain] = useState<{ markets: NearMarket[]; height: bigint } | null>(null)

  useEffect(() => {
    let alive = true
    getNearConfig().then((c) => alive && setConfig(c)).catch(() => {})
    getGovernanceValues().then((g) => alive && setPaused(g.paused)).catch(() => {})
    getResolverRewardBps().then((b) => alive && setRewardBps(b)).catch(() => {})
    const load = () =>
      Promise.all([listNearMarkets(), getNearHeight()])
        .then(([markets, height]) => alive && setChain({ markets, height }))
        .catch(() => {})
    void load()
    const timer = window.setInterval(() => !document.hidden && void load(), REFRESH_MS)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [])

  const counts = useMemo(() => resolutionCounts(chain?.markets ?? [], chain?.height ?? 0n), [chain])

  return (
    <div className="mx-auto max-w-[1200px] space-y-12 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-[2rem] leading-[1.15] tracking-tight text-white">Governance</h1>
          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-surface-400">
            How a market's result is decided on NEAR, which markets are being resolved now, and the settings the
            contract runs with.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {paused !== null && (
            <span
              className={cn(
                'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium',
                paused ? 'border-no-500/30 bg-no-500/10 text-no-300' : 'border-yes-500/25 bg-yes-500/10 text-yes-300',
              )}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full', paused ? 'bg-no-400' : 'bg-yes-400')} />
              {paused ? 'Trading paused' : 'Trading open'}
            </span>
          )}
          <a
            href={accountUrl(VEILED_CONTRACT)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] px-3 py-1.5 font-mono text-xs text-surface-300 transition-colors hover:border-white/20 hover:text-white"
          >
            {VEILED_CONTRACT}
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
            <span className="sr-only">(opens NearBlocks in a new tab)</span>
          </a>
        </div>
      </header>

      <section aria-labelledby="gov-now">
        <h2 id="gov-now" className="sr-only">
          Markets by stage of resolution
        </h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Count value={counts.awaitingVote} label="Awaiting a vote" hint="Trading closed, no vote yet" />
          <Count value={counts.voting} label="Vote open" hint="Bonded votes are being cast" />
          <Count value={counts.disputeWindow} label="Open to dispute" hint="A result is voted, not final" />
          <Count value={counts.disputed} label="In dispute" hint="The committee decides" alert={counts.disputed > 0} />
          <Count value={counts.resolved} label="Resolved" hint="Result final, winners redeem" className="col-span-2 sm:col-span-1" />
        </dl>
      </section>

      <section aria-labelledby="gov-flow">
        <h2 id="gov-flow" className={sectionTitle}>
          How a market is resolved
        </h2>
        <ol className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Step n={1} icon={Vote} title="Vote">
            When trading closes, anyone can vote for an outcome by posting a bond of{' '}
            <V>{config ? `${tokens(config.vote_bond)} NEAR` : null}</V>. Voting stays open for{' '}
            <V>{config ? formatWindow(config.vote_window) : null}</V> and needs at least{' '}
            <V>{config ? `${config.min_voters} ${config.min_voters === 1 ? 'voter' : 'voters'}` : null}</V>. The outcome
            with the most bonded NEAR leads. Its first voter is the market's resolver, paid their bond back plus{' '}
            <V>{rewardBps !== null ? percentOfBps(rewardBps) : null}</V> of the market's protocol fees when it settles.
          </Step>
          <Step n={2} icon={ShieldAlert} title="Dispute window">
            For <V>{config ? formatWindow(config.dispute_window) : null}</V> the leading outcome can be challenged in
            favour of another, with a bond of at least{' '}
            <V>{config ? `${config.dispute_bond_multiplier}×` : null}</V> everything bonded in the vote. With no
            challenge, the result is final when the window ends: nobody has to confirm it.
          </Step>
          <Step n={3} icon={Scale} title="Committee">
            A disputed market goes to the committee. An outcome with{' '}
            <V>{config ? `${config.committee_quorum} votes` : null}</V> and no tie settles it, with no further call. Without
            a decision after <V>{config ? formatWindow(config.disputed_timeout) : null}</V>, the market is cancelled and
            every position and bond is refunded.
          </Step>
          <Step n={4} icon={Coins} title="Payout">
            Winners redeem their shares privately; the first redeem also records the result on chain and pays the
            resolver. Other voters on the winning outcome take their bond back, and bonds on a losing outcome go to
            the treasury. Liquidity and creator fees can be withdrawn{' '}
            <V>{config ? formatWindow(config.winner_claim_priority) : null}</V> after the result is final.
          </Step>
        </ol>
      </section>

      <section aria-labelledby="gov-disputes">
        <h2 id="gov-disputes" className={sectionTitle}>
          Markets in resolution
        </h2>
        <ResolutionList chain={chain} config={config} />
      </section>

      <section aria-labelledby="gov-settings">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
          <h2 id="gov-settings" className={sectionTitle}>
            Contract settings
          </h2>
          <p className="text-xs text-surface-500">Read from the contract. Only its owner can change them.</p>
        </div>
        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          <Settings
            title="Fees"
            rows={[
              ['Protocol fee', config && percentOfBps(config.protocol_fee_bps)],
              ['Creator fee', config && percentOfBps(config.creator_fee_bps)],
              ['Liquidity provider fee, on sells', config && percentOfBps(config.lp_fee_bps)],
            ]}
          />
          <Settings
            title="Limits"
            rows={[
              ['Smallest trade', config && `${tokens(config.min_trade)} NEAR or USDC`],
              ['Smallest market liquidity', config && `${tokens(config.min_liquidity)} NEAR or USDC`],
              ['Vote bond', config && `${tokens(config.vote_bond)} NEAR`],
              ['Dispute bond', config && `${config.dispute_bond_multiplier}× the vote's bonds`],
            ]}
          />
          <Settings
            title="Resolution"
            rows={[
              ['Vote window', config && formatWindow(config.vote_window)],
              ['Voters needed', config && String(config.min_voters)],
              ['Dispute window', config && formatWindow(config.dispute_window)],
              ['Committee votes needed', config && String(config.committee_quorum)],
              ['Dispute time limit', config && formatWindow(config.disputed_timeout)],
              ['Winners-first window', config && formatWindow(config.winner_claim_priority)],
              ['Resolver reward', rewardBps !== null ? `${percentOfBps(rewardBps)} of protocol fees` : null],
            ]}
          />
        </div>
      </section>

      <p className="border-t border-white/[0.06] pt-6 text-xs leading-relaxed text-surface-500">
        Governance proposals and resolver staking are part of the Aleo product and are not deployed on NEAR. The
        settings above are the testnet's: the windows are short, so a market nobody disputes resolves{' '}
        {config ? formatWindow(config.vote_window + config.dispute_window) : 'soon'} after its first vote.
      </p>
    </div>
  )
}

const STAGE: Record<ResolutionStage, { label: string; tone: string; order: number }> = {
  committee: { label: 'With the committee', tone: 'border-purple-400/30 bg-purple-400/10 text-purple-200', order: 0 },
  disputed: { label: 'In dispute', tone: 'border-no-500/30 bg-no-500/10 text-no-300', order: 1 },
  dispute_window: { label: 'Open to dispute', tone: 'border-amber-400/30 bg-amber-400/10 text-amber-200', order: 2 },
  voting: { label: 'Vote open', tone: 'border-brand-400/30 bg-brand-400/10 text-brand-200', order: 3 },
  awaiting_vote: { label: 'Awaiting a vote', tone: 'border-white/10 bg-white/[0.04] text-surface-200', order: 4 },
  resolved: { label: 'Resolved', tone: 'border-yes-500/25 bg-yes-500/10 text-yes-300', order: 5 },
  cancelled: { label: 'Cancelled', tone: 'border-white/10 bg-white/[0.04] text-surface-400', order: 6 },
}
const SETTLED: ResolutionStage[] = ['resolved', 'cancelled']

type ListFilter = 'active' | 'settled' | 'all'

/** Every market that has left trading, with its stage and what can happen to it next. Actions are on its page. */
function ResolutionList({ chain, config }: { chain: { markets: NearMarket[]; height: bigint } | null; config: NearConfig | null }) {
  const [filter, setFilter] = useState<ListFilter>('active')
  const marketHref = useMarketPath()

  const rows = useMemo(() => {
    if (!chain) return []
    return chain.markets
      .map((market) => ({ market, stage: resolutionStage(market, chain.height) }))
      .filter((row): row is { market: NearMarket; stage: ResolutionStage } => row.stage !== null)
      .sort((a, b) => STAGE[a.stage].order - STAGE[b.stage].order || Number(b.market.id) - Number(a.market.id))
  }, [chain])

  const active = rows.filter((r) => !SETTLED.includes(r.stage))
  const settled = rows.filter((r) => SETTLED.includes(r.stage))
  const shown = filter === 'active' ? active : filter === 'settled' ? settled : rows
  const filters: Array<{ key: ListFilter; label: string; count: number }> = [
    { key: 'active', label: 'In progress', count: active.length },
    { key: 'settled', label: 'Settled', count: settled.length },
    { key: 'all', label: 'All', count: rows.length },
  ]

  return (
    <div className={cn(card, 'mt-5')}>
      <div className="flex flex-col gap-3 border-b border-white/[0.06] p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="text-sm text-surface-400">
          Markets that have closed, with what can happen to each next. Voting and disputing are done on the market's
          own page.
        </p>
        <div role="group" aria-label="Which markets to list" className="inline-flex shrink-0 gap-1 rounded-xl border border-white/[0.06] bg-white/[0.02] p-1">
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                filter === f.key ? 'bg-brand-500/15 text-brand-200' : 'text-surface-400 hover:bg-white/[0.04] hover:text-white',
              )}
            >
              {f.label}
              <span className="tabular-nums text-surface-500">{f.count}</span>
            </button>
          ))}
        </div>
      </div>

      {!chain ? (
        <div className="space-y-3 p-4 sm:p-6" aria-busy="true" aria-label="Loading markets">
          {[0, 1].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-white/[0.03]" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <p className="px-6 py-12 text-center text-sm text-surface-500">
          {filter === 'settled'
            ? 'No market has been resolved or cancelled yet.'
            : filter === 'all'
              ? 'No market has closed yet.'
              : 'No market is being resolved right now. A market appears here as soon as its trading closes.'}
        </p>
      ) : (
        <ul className="divide-y divide-white/[0.05]">
          {shown.map(({ market, stage }) => {
            const meta = decodeMetadata(market.metadata)
            const label = (outcome: number) =>
              meta.outcomeLabels?.[outcome - 1] ?? (market.num_outcomes === 2 ? ['Yes', 'No'][outcome - 1] : undefined) ?? `Outcome ${outcome}`
            return (
              <li key={market.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6 sm:px-6 sm:py-5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium', STAGE[stage].tone)}>
                      {STAGE[stage].label}
                    </span>
                    <span className="font-mono text-xs text-surface-500">
                      #{market.id} · {TOKEN_SYMBOL[market.token_type] ?? 'NEAR'}
                    </span>
                  </div>
                  <p className="mt-2 text-[15px] font-medium leading-snug text-white">{meta.question ?? `Market #${market.id}`}</p>
                  <p className="mt-1 text-sm leading-relaxed text-surface-400">
                    {stageSummary(market, chain.height, { quorum: config?.committee_quorum ?? 0, timeout: config?.disputed_timeout, label })}
                  </p>
                </div>
                <Link
                  to={marketHref(market.id)}
                  className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg border border-white/[0.08] px-3 py-2 text-xs font-medium text-surface-200 transition-colors hover:border-white/20 hover:text-white"
                >
                  Open market
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** A value read from the contract, inside a sentence; a dash until it has loaded. */
function V({ children }: { children: ReactNode }) {
  return <span className="whitespace-nowrap font-medium text-white tabular-nums">{children ?? '—'}</span>
}

function Count({
  value,
  label,
  hint,
  alert = false,
  className,
}: {
  value: number
  label: string
  hint: string
  alert?: boolean
  className?: string
}) {
  return (
    <div className={cn(card, 'flex flex-col-reverse justify-end gap-1 p-4 sm:p-5', alert && 'border-no-500/30 bg-no-500/[0.05]', className)}>
      <dt>
        <span className="block text-sm font-medium text-surface-200">{label}</span>
        <span className="mt-0.5 block text-xs text-surface-400">{hint}</span>
      </dt>
      <dd className={cn('font-display text-[2rem] leading-none tabular-nums', alert ? 'text-no-300' : 'text-white')}>{value}</dd>
    </div>
  )
}

function Step({ n, icon: Icon, title, children }: { n: number; icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <li className={cn(card, 'p-5')}>
      <div className="flex items-center justify-between">
        <span className="flex h-9 w-9 items-center justify-center rounded-full border border-brand-400/30 bg-brand-400/[0.08] text-brand-300">
          <Icon className="h-[18px] w-[18px]" aria-hidden />
        </span>
        <span className="font-mono text-xs text-surface-500">Step {n}</span>
      </div>
      <h3 className="mt-4 text-base font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-surface-400">{children}</p>
    </li>
  )
}

function Settings({ title, rows }: { title: string; rows: Array<[string, string | null | false]> }) {
  return (
    <div className={cn(card, 'p-5')}>
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <dl className="mt-3 divide-y divide-white/[0.05]">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-4 py-2.5">
            <dt className="text-sm text-surface-400">{label}</dt>
            <dd className="text-right text-sm font-medium text-white tabular-nums">{value || '—'}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
