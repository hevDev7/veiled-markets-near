// The governance page on NEAR: how a market's result is decided, which markets are being resolved now, and the
// settings the contract runs with. Everything shown is read from the contract. Proposals, resolver staking and
// rewards belong to the Aleo product and have no panel here.
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowUpRight, Coins, Scale, ShieldAlert, Vote, type LucideIcon } from 'lucide-react'
import { getGovernanceValues, getNearConfig, type NearConfig } from '@/lib/near/chain'
import { accountUrl, VEILED_CONTRACT } from '@/lib/near/config'
import { formatWindow, percentOfBps, resolutionCounts } from '@/lib/near/governance'
import { useRealMarketsStore } from '@/lib/market-store'
import { cn } from '@/lib/utils'

const card = 'rounded-2xl border border-white/[0.06] bg-surface-900/40'
const sectionTitle = 'font-display text-[1.375rem] leading-tight tracking-tight text-white'

/** Micro units (6 decimals) as a plain number: "0.1", "0.001". */
const tokens = (micro: string) => String(Number(micro) / 1_000_000)

export function NearGovernance({ disputes }: { disputes: ReactNode }) {
  const [config, setConfig] = useState<NearConfig | null>(null)
  const [paused, setPaused] = useState<boolean | null>(null)
  const { markets, fetchMarkets } = useRealMarketsStore()

  useEffect(() => {
    let alive = true
    getNearConfig().then((c) => alive && setConfig(c)).catch(() => {})
    getGovernanceValues().then((g) => alive && setPaused(g.paused)).catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (markets.length === 0) void fetchMarkets()
  }, [markets.length, fetchMarkets])

  const counts = useMemo(() => resolutionCounts(markets), [markets])

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
            with the most bonded NEAR leads.
          </Step>
          <Step n={2} icon={ShieldAlert} title="Dispute window">
            For <V>{config ? formatWindow(config.dispute_window) : null}</V> the leading outcome can be challenged in
            favour of another, with a bond of at least{' '}
            <V>{config ? `${config.dispute_bond_multiplier}×` : null}</V> everything bonded in the vote. With no
            challenge, the result becomes final.
          </Step>
          <Step n={3} icon={Scale} title="Committee">
            A disputed market goes to the committee. An outcome with{' '}
            <V>{config ? `${config.committee_quorum} votes` : null}</V> and no tie settles it. Without a decision after{' '}
            <V>{config ? formatWindow(config.disputed_timeout) : null}</V>, anyone can cancel the market and every
            position is refunded.
          </Step>
          <Step n={4} icon={Coins} title="Payout">
            Winners redeem their shares privately. Voters on the winning outcome take their bond back, and bonds on
            a losing outcome go to the treasury. Liquidity and creator fees can be withdrawn{' '}
            <V>{config ? formatWindow(config.winner_claim_priority) : null}</V> after the result is final.
          </Step>
        </ol>
      </section>

      <section aria-labelledby="gov-disputes">
        <h2 id="gov-disputes" className={sectionTitle}>
          Markets in resolution
        </h2>
        <div className={cn(card, 'mt-5 p-4 sm:p-6')}>{disputes}</div>
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
            ]}
          />
        </div>
      </section>

      <p className="border-t border-white/[0.06] pt-6 text-xs leading-relaxed text-surface-500">
        Governance proposals, resolver staking and rewards are part of the Aleo product and are not deployed on NEAR.
        The settings above are the testnet's: the windows are short so that a demo market resolves in minutes.
      </p>
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
