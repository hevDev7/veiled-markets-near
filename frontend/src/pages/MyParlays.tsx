import { useState, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Ticket,
  Trophy,
  XCircle,
  Clock,
  ArrowLeft,
  ExternalLink,
  Shield,
  Coins,
} from 'lucide-react'
import { useParlayStore, type ParlayRecord } from '@/lib/parlay-store'
import { useWalletStore } from '@/lib/store'
import { useRepairParlayExplorerIds } from '@/hooks/useRepairParlayExplorerIds'
import { cn } from '@/lib/utils'
import {
  describeParlayFundingSource,
  formatParlayAmount,
  getParlayTransactionUrl,
  getShortParlayId,
} from '@/lib/parlay-helpers'
import { ParlayClaimModal } from '@/components/ParlayClaimModal'
import { ParlayPoolAdmin } from '@/components/ParlayPoolAdmin'
import { Link } from 'react-router-dom'

type ParlayTab = 'active' | 'won' | 'lost' | 'all'

const TAB_CONFIG: { key: ParlayTab; label: string; icon: typeof Ticket }[] = [
  { key: 'active', label: 'Active', icon: Clock },
  { key: 'won', label: 'Won', icon: Trophy },
  { key: 'lost', label: 'Lost', icon: XCircle },
  { key: 'all', label: 'All', icon: Ticket },
]

function getStatusBadge(status: ParlayRecord['status']) {
  switch (status) {
    case 'active':
      return <span className="rounded-full border border-blue-500/20 bg-blue-500/15 px-2.5 py-1 text-xs font-medium text-blue-300">Active</span>
    case 'pending_dispute':
      return <span className="rounded-full border border-amber-500/20 bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-300">Pending dispute</span>
    case 'won':
      return <span className="rounded-full border border-emerald-500/20 bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-300">Won</span>
    case 'lost':
      return <span className="rounded-full border border-red-500/20 bg-red-500/15 px-2.5 py-1 text-xs font-medium text-red-300">Lost</span>
    case 'cancelled':
      return <span className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-xs font-medium text-surface-400">Cancelled</span>
    default:
      return null
  }
}

export function MyParlays() {
  const { parlays, patchParlay, syncParlaysFromSupabase } = useParlayStore()
  const { wallet } = useWalletStore()
  const [activeTab, setActiveTab] = useState<ParlayTab>('active')
  const [claimParlay, setClaimParlay] = useState<ParlayRecord | null>(null)

  // Sync parlays from Supabase on mount / wallet change
  useEffect(() => {
    if (wallet.connected && wallet.address) {
      syncParlaysFromSupabase(wallet.address, wallet.encryptionKey)
    }
  }, [wallet.connected, wallet.address])

  useRepairParlayExplorerIds({
    parlays,
    patchParlay,
    walletAddress: wallet.address ?? undefined,
  })

  const walletParlays = useMemo(
    () => wallet.address ? parlays.filter((parlay) => parlay.ownerAddress === wallet.address) : [],
    [parlays, wallet.address],
  )

  const filteredParlays = useMemo(() => {
    if (activeTab === 'all') return walletParlays
    if (activeTab === 'active') return walletParlays.filter((parlay) => parlay.status === 'active' || parlay.status === 'pending_dispute')
    return walletParlays.filter((parlay) => parlay.status === activeTab)
  }, [walletParlays, activeTab])

  const counts = useMemo(() => ({
    active: walletParlays.filter((parlay) => parlay.status === 'active' || parlay.status === 'pending_dispute').length,
    won: walletParlays.filter((parlay) => parlay.status === 'won').length,
    lost: walletParlays.filter((parlay) => parlay.status === 'lost').length,
    all: walletParlays.length,
  }), [walletParlays])

  const stats = useMemo(() => {
    const activeStake = walletParlays
      .filter((parlay) => parlay.status === 'active' || parlay.status === 'pending_dispute')
      .reduce((sum, parlay) => sum + parlay.stake, 0n)

    const openPotential = walletParlays
      .filter((parlay) => parlay.status === 'active' || parlay.status === 'pending_dispute')
      .reduce((sum, parlay) => sum + parlay.potentialPayout, 0n)

    const claimable = walletParlays
      .filter((parlay) => parlay.status === 'won' && !parlay.claimed)
      .reduce((sum, parlay) => sum + parlay.potentialPayout, 0n)

    const claimableCount = walletParlays.filter((parlay) => parlay.status === 'won' && !parlay.claimed).length

    return {
      activeStake,
      openPotential,
      claimable,
      claimableCount,
    }
  }, [walletParlays])

  const ADMIN_ADDRESS = 'aleo10tm5ektsr5v7kdc5phs8pha42vrkhe2rlxfl2v979wunhzx07vpqnqplv8'
  const isAdmin = wallet.connected && wallet.address === ADMIN_ADDRESS

  if (!wallet.connected || !isAdmin) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="rounded-[28px] border border-white/[0.08] bg-[#10141f] px-10 py-12 text-center shadow-[0_18px_50px_rgba(0,0,0,0.3)]">
          <Ticket className="mx-auto h-12 w-12 text-surface-500" />
          <p className="mt-4 text-xl font-semibold text-white">
            {!wallet.connected ? 'Connect your wallet to view parlays' : 'Admin access only'}
          </p>
          <p className="mt-2 text-sm text-surface-400">
            Your private parlay tickets and local slip history appear here after you connect.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="rounded-[32px] border border-white/[0.08] bg-[#10141f] shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
        <div className="border-b border-white/[0.08] bg-gradient-to-r from-brand-500/12 via-white/[0.01] to-emerald-500/10 px-6 py-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <Link to="/my-bets" className="inline-flex items-center gap-2 text-sm text-surface-400 transition-colors hover:text-white">
                <ArrowLeft className="h-4 w-4" />
                Back to Portfolio
              </Link>
              <div>
                <h1 className="text-3xl font-semibold text-white">My Parlays</h1>
                <p className="mt-2 text-sm text-surface-400">
                  Track every multi-leg ticket, claim window, and checkout route from one place.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
                <p className="text-xs uppercase tracking-[0.18em] text-surface-500">Active Stake</p>
                <p className="mt-2 text-xl font-semibold text-white">{formatParlayAmount(stats.activeStake)}</p>
              </div>
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
                <p className="text-xs uppercase tracking-[0.18em] text-surface-500">Open Potential</p>
                <p className="mt-2 text-xl font-semibold text-brand-300">{formatParlayAmount(stats.openPotential)}</p>
              </div>
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.18em] text-emerald-300/80">Claimable</p>
                <p className="mt-2 text-xl font-semibold text-emerald-300">
                  {formatParlayAmount(stats.claimable)}
                </p>
                <p className="mt-1 text-xs text-emerald-200/75">{stats.claimableCount} ticket{stats.claimableCount !== 1 ? 's' : ''}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="border-b border-white/[0.08] px-6 py-4">
          <div className="flex flex-wrap gap-2 rounded-2xl bg-black/20 p-1.5">
            {TAB_CONFIG.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors',
                  activeTab === tab.key
                  ? 'bg-white/[0.08] text-white'
                    : 'text-surface-400 hover:text-white',
                )}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
                {counts[tab.key] > 0 && (
                  <span className="rounded-full border border-white/[0.08] bg-white/[0.06] px-2 py-0.5 text-xs">
                    {counts[tab.key]}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="px-6 py-6">
          {filteredParlays.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-[28px] border border-dashed border-white/10 bg-black/[0.15] py-20 text-center">
              <Ticket className="h-10 w-10 text-surface-500" />
              <p className="mt-4 text-lg font-medium text-white">
                {activeTab === 'active'
                  ? 'No active parlays yet'
                  : activeTab === 'won'
                    ? 'No winning parlays yet'
                    : activeTab === 'lost'
                      ? 'No lost parlays yet'
                      : 'No parlays placed yet'}
              </p>
              <p className="mt-2 max-w-md text-sm text-surface-400">
                Start from any market detail page, add two or more outcomes to the slip, and your tickets will land here.
              </p>
              <Link
                to="/markets"
                className="mt-5 rounded-2xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
              >
                Browse Markets
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              <AnimatePresence mode="popLayout">
                {filteredParlays.map((parlay) => {
                  const txUrl = getParlayTransactionUrl(parlay.txId)
                  const hasWalletSubmissionRef = Boolean(parlay.txId && !txUrl)
                  return (
                    <motion.div
                      key={parlay.id}
                      layout
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -12 }}
                      className="overflow-hidden rounded-[28px] border border-white/[0.08] bg-white/[0.03]"
                    >
                      <div className="border-b border-white/[0.08] px-5 py-4">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="space-y-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm font-medium text-white">
                                <Ticket className="h-4 w-4 text-brand-400" />
                                {parlay.numLegs}-Leg Parlay
                              </div>
                              {getStatusBadge(parlay.status)}
                              {parlay.claimed && (
                                <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-300">
                                  Claimed
                                </span>
                              )}
                            </div>

                            <div className="flex flex-wrap gap-2 text-xs text-surface-400">
                              <span className="rounded-full border border-white/[0.08] px-2.5 py-1">
                                {describeParlayFundingSource(parlay.fundingSource)}
                              </span>
                              <span className="rounded-full border border-white/[0.08] px-2.5 py-1">
                                Ticket {getShortParlayId(parlay.onChainParlayId) ?? 'pending sync'}
                              </span>
                              <span className="rounded-full border border-white/[0.08] px-2.5 py-1">
                                Placed {new Date(parlay.createdAt).toLocaleDateString()}
                              </span>
                            </div>
                          </div>

                          <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[260px]">
                            <div className="rounded-2xl border border-white/[0.08] bg-black/20 px-4 py-3">
                              <p className="text-xs uppercase tracking-[0.18em] text-surface-500">Stake</p>
                              <p className="mt-2 text-lg font-semibold text-white">
                                {formatParlayAmount(parlay.stake)} {parlay.tokenType}
                              </p>
                            </div>
                            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3">
                              <p className="text-xs uppercase tracking-[0.18em] text-emerald-300/80">Potential</p>
                              <p className={cn(
                                'mt-2 text-lg font-semibold',
                                parlay.status === 'lost'
                                  ? 'text-red-300 line-through'
                                  : 'text-emerald-300',
                              )}>
                                {formatParlayAmount(parlay.potentialPayout)} {parlay.tokenType}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-5 px-5 py-5 lg:grid-cols-[1.4fr_0.8fr]">
                        <div className="space-y-2">
                          {parlay.legs.map((leg, index) => (
                            <div key={`${leg.marketId}-${leg.outcome}`} className="flex items-start gap-3 rounded-2xl border border-white/[0.06] bg-black/20 px-4 py-3">
                              <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-white/5 text-xs font-semibold text-surface-300">
                                {index + 1}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-white">{leg.marketQuestion}</p>
                                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                                  <span className="rounded-full border border-brand-500/20 bg-brand-500/10 px-2 py-1 text-brand-300">
                                    {leg.outcomeLabel}
                                  </span>
                                  <span className="rounded-full border border-white/[0.08] bg-white/[0.06] px-2 py-1 text-surface-300">
                                    {leg.displayOdds.toFixed(2)}x
                                  </span>
                                  <span className="rounded-full border border-white/[0.08] px-2 py-1 text-surface-400">
                                    {leg.marketTokenType}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="space-y-3">
                          <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-4">
                            <p className="text-sm font-medium text-white">Execution details</p>
                            <div className="mt-3 space-y-2 text-sm text-surface-400">
                              <div className="flex items-center justify-between gap-3">
                                <span>Funding source</span>
                                <span className="inline-flex items-center gap-2 text-white">
                                  {parlay.fundingSource === 'private' ? (
                                    <Shield className="h-4 w-4 text-brand-400" />
                                  ) : (
                                    <Coins className="h-4 w-4 text-emerald-400" />
                                  )}
                                  {describeParlayFundingSource(parlay.fundingSource)}
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <span>Claim state</span>
                                <span className="text-white">
                                  {parlay.claimed ? 'Claimed' : parlay.status === 'won' ? 'Ready / syncing' : 'Not claimable'}
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <span>Transaction</span>
                                {txUrl ? (
                                  <a
                                    href={txUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-brand-300 transition-colors hover:text-brand-200"
                                  >
                                    Explorer
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </a>
                                ) : hasWalletSubmissionRef ? (
                                  <span className="text-white">
                                    Wallet Ref {getShortParlayId(parlay.txId)}
                                  </span>
                                ) : (
                                  <span className="text-white">Pending</span>
                                )}
                              </div>
                            </div>
                          </div>

                          {parlay.status === 'won' && !parlay.claimed ? (
                            <button
                              onClick={() => setClaimParlay(parlay)}
                              className="w-full rounded-2xl bg-emerald-500 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-600"
                            >
                              Open Claim Flow
                            </button>
                          ) : (
                            <div className="rounded-2xl border border-white/[0.08] bg-black/20 px-4 py-3 text-sm text-surface-400">
                              {parlay.claimed
                                ? 'This parlay has already been claimed.'
                                : parlay.status === 'lost'
                                  ? 'At least one leg missed, so this ticket cannot be redeemed.'
                                  : 'This ticket is still waiting on final resolution or dispute flow.'}
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      {/* Pool Admin Panel */}
      <div className="mt-6">
        <ParlayPoolAdmin />
      </div>

      <ParlayClaimModal
        parlay={claimParlay}
        isOpen={!!claimParlay}
        onClose={() => setClaimParlay(null)}
      />
    </div>
  )
}
