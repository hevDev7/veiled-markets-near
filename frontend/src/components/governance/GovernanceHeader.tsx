// ============================================================================
// VEILED GOVERNANCE — GovernanceHeader Component
// ============================================================================
// Displays ALEO balance, voting power, and claimable rewards
// ============================================================================

import { motion } from 'framer-motion';
import { Coins, Vote, Gift, ArrowRight, Loader2, Lock } from 'lucide-react';
import { formatVeil } from '../../lib/governance-client';
import { useGovernanceStore } from '../../lib/governance-store';
import { useWalletStore } from '../../lib/store';
import { formatCredits, shortenAddress } from '../../lib/utils';

interface GovernanceHeaderProps {
  onClaimAll?: () => Promise<void>;
  isClaimingAll?: boolean;
}

export function GovernanceHeader({
  onClaimAll,
  isClaimingAll = false,
}: GovernanceHeaderProps) {
  const {
    votingPower,
    totalClaimable,
    isLoading,
    stats,
  } = useGovernanceStore();
  const { wallet } = useWalletStore();

  const totalAleo = wallet.balance.public + wallet.balance.private;

  return (
    <div className="space-y-3">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="rounded-2xl border border-white/[0.06] bg-surface-900/55 p-4 sm:p-5"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-brand-500/20 bg-brand-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-200">
                Governance Workspace
              </span>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                stats.pauseState ? 'bg-red-500/15 text-red-300' : 'bg-emerald-500/15 text-emerald-300'
              }`}>
                {stats.pauseState ? 'Markets Paused' : 'Markets Active'}
              </span>
              {wallet.address && (
                <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11px] font-mono text-surface-300">
                  {shortenAddress(wallet.address, 4)}
                </span>
              )}
            </div>

            <div>
              <h2 className="text-lg font-semibold text-white sm:text-xl">Stake, vote, and manage protocol changes from one page.</h2>
              <p className="mt-1 text-sm text-surface-400">
                Track voting power, rewards, and live control parameters without digging through separate panels.
              </p>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:min-w-[420px] xl:max-w-[460px] xl:grid-cols-4">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
              <div className="flex items-center gap-1.5 text-[11px] text-surface-500">
                <Coins className="h-3.5 w-3.5 text-brand-400" />
                Wallet ALEO
              </div>
              <div className="mt-2 text-lg font-semibold text-white">{formatCredits(totalAleo, 2)}</div>
              <div className="mt-1 text-[11px] text-surface-500">
                {formatCredits(wallet.balance.public, 2)} public · {formatCredits(wallet.balance.private, 2)} private
              </div>
            </div>

            <div className="rounded-xl border border-brand-500/15 bg-brand-500/6 p-3">
              <div className="flex items-center gap-1.5 text-[11px] text-surface-500">
                <Lock className="h-3.5 w-3.5 text-yellow-400" />
                Protocol Locked
              </div>
              {isLoading ? (
                <div className="mt-3">
                  <Loader2 className="h-4 w-4 animate-spin text-surface-500" />
                </div>
              ) : (
                <>
                  <div className="mt-2 text-lg font-semibold text-yellow-300">{formatVeil(stats.totalStakedInVotes)}</div>
                  <div className="mt-1 text-[11px] text-surface-500">ALEO currently bonded into governance votes</div>
                </>
              )}
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
              <div className="flex items-center gap-1.5 text-[11px] text-surface-500">
                <Vote className="h-3.5 w-3.5 text-purple-400" />
                Voting Power
              </div>
              {isLoading ? (
                <div className="mt-3">
                  <Loader2 className="h-4 w-4 animate-spin text-surface-500" />
                </div>
              ) : (
                <>
                  <div className="mt-2 text-lg font-semibold text-white">{formatVeil(votingPower)}</div>
                  <div className="mt-1 text-[11px] text-surface-500">Current wallet power recognized in live governance tallies</div>
                  <div className="mt-2 text-[11px] text-amber-300/90">
                    Delegation submit is disabled in-app until delegated power is surfaced consistently end-to-end.
                  </div>
                </>
              )}
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
              <div className="flex items-center gap-1.5 text-[11px] text-surface-500">
                <Gift className="h-3.5 w-3.5 text-emerald-400" />
                Claimable
              </div>
              {isLoading ? (
                <div className="mt-3">
                  <Loader2 className="h-4 w-4 animate-spin text-surface-500" />
                </div>
              ) : (
                <>
                  <div className="mt-2 text-lg font-semibold text-emerald-300">{formatVeil(totalClaimable)}</div>
                  <div className="mt-1 text-[11px] text-surface-500">Rewards ready to withdraw</div>
                  {totalClaimable > 0n && onClaimAll && (
                    <button
                      onClick={() => void onClaimAll()}
                      disabled={isClaimingAll}
                      className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-emerald-300 transition-colors hover:text-emerald-200 disabled:opacity-50"
                    >
                      {isClaimingAll ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                      Claim all
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.14 }}
        className="rounded-xl border border-white/[0.06] bg-surface-900/45 p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-surface-200">Live Protocol Controls</h3>
            <p className="mt-1 text-xs text-surface-500">Current market parameters pushed by governance on-chain.</p>
          </div>
          <div className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-[11px] text-surface-300">
            Guardian threshold: {stats.guardianThreshold > 0 ? `${stats.guardianThreshold} of ${stats.guardianAddresses.length || 3}` : 'Loading'}
          </div>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
          <ControlStat label="Protocol Fee" value={`${(Number(stats.protocolFeeBps) / 100).toFixed(2)}%`} />
          <ControlStat label="Creator Fee" value={`${(Number(stats.creatorFeeBps) / 100).toFixed(2)}%`} />
          <ControlStat label="LP Fee" value={`${(Number(stats.lpFeeBps) / 100).toFixed(2)}%`} />
          <ControlStat label="Min Trade" value={`${formatCredits(stats.minTradeAmount, 4)} ALEO`} />
          <ControlStat label="Min Liquidity" value={`${formatCredits(stats.minLiquidity, 4)} ALEO`} />
          <ControlStat
            label="Guardian Set"
            value={stats.guardianAddresses.length > 0 ? `${stats.guardianAddresses.length} configured` : 'Loading'}
          />
        </div>
      </motion.div>
    </div>
  );
}

function ControlStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2.5">
      <div className="text-[11px] text-surface-500">{label}</div>
      <div className="mt-1 text-sm font-medium text-white">{value}</div>
    </div>
  );
}
