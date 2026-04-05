// ============================================================================
// VEILED GOVERNANCE — GovernanceHeader Component
// ============================================================================
// Displays ALEO balance, voting power, and claimable rewards
// ============================================================================

import { motion } from 'framer-motion';
import { Coins, Vote, Gift, ArrowRight, Loader2, Lock, Unlock } from 'lucide-react';
import { formatVeil } from '../../lib/governance-client';
import { useGovernanceStore } from '../../lib/governance-store';
import { useWalletStore } from '../../lib/store';
import { formatCredits, shortenAddress } from '../../lib/utils';

interface GovernanceHeaderProps {
  onClaimAll?: () => Promise<void>;
  onOpenDelegate?: () => void;
  isClaimingAll?: boolean;
}

export function GovernanceHeader({
  onClaimAll,
  onOpenDelegate,
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
    <div className="space-y-4">
      {/* Balance Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        {/* ALEO Balance */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-surface-900/60 backdrop-blur-sm border border-white/[0.06] rounded-2xl p-5"
        >
          <div className="flex items-center gap-2 text-surface-400 text-sm mb-2">
            <Coins className="w-4 h-4 text-brand-400" />
            Your ALEO
          </div>
          <div className="text-2xl font-bold text-white">
            {formatCredits(totalAleo, 2)}
          </div>
          <div className="text-xs text-surface-500 mt-1">
            {formatCredits(wallet.balance.public, 2)} public · {formatCredits(wallet.balance.private, 2)} private
          </div>
        </motion.div>

        {/* Staked in Governance */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-surface-900/60 backdrop-blur-sm border border-brand-500/20 rounded-2xl p-5"
        >
          <div className="flex items-center gap-2 text-surface-400 text-sm mb-2">
            <Lock className="w-4 h-4 text-yellow-400" />
            Protocol Locked
          </div>
          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin text-surface-500" />
          ) : (
            <>
              <div className="text-2xl font-bold text-yellow-400">
                {formatVeil(stats.totalStakedInVotes)}
              </div>
              <div className="text-xs text-surface-500 mt-1">ALEO currently locked in tracked proposals</div>
            </>
          )}
        </motion.div>

        {/* Voting Power */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-surface-900/60 backdrop-blur-sm border border-white/[0.06] rounded-2xl p-5"
        >
          <div className="flex items-center gap-2 text-surface-400 text-sm mb-2">
            <Vote className="w-4 h-4 text-purple-400" />
            Voting Power
          </div>
          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin text-surface-500" />
          ) : (
            <>
              <div className="text-2xl font-bold text-white">
                {formatVeil(votingPower)}
              </div>
              <div className="text-xs text-surface-500 mt-1">ALEO (incl. delegated)</div>
              {onOpenDelegate && (
                <button
                  onClick={onOpenDelegate}
                  className="mt-2 flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 transition-colors"
                >
                  Delegate votes <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </>
          )}
        </motion.div>

        {/* Claimable Rewards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="bg-surface-900/60 backdrop-blur-sm border border-white/[0.06] rounded-2xl p-5"
        >
          <div className="flex items-center gap-2 text-surface-400 text-sm mb-2">
            <Gift className="w-4 h-4 text-emerald-400" />
            Rewards
          </div>
          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin text-surface-500" />
          ) : (
            <>
              <div className="text-2xl font-bold text-emerald-400">
                {formatVeil(totalClaimable)}
              </div>
              <div className="text-xs text-surface-500 mt-1">ALEO to claim</div>
              {totalClaimable > 0n && onClaimAll && (
                <button
                  onClick={() => void onClaimAll()}
                  disabled={isClaimingAll}
                  className="mt-2 flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 transition-colors disabled:opacity-50"
                >
                  {isClaimingAll ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                  Claim All <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </>
          )}
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.28 }}
        className="bg-surface-900/40 border border-surface-700/30 rounded-xl p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-surface-300">Live Market Controls</h3>
            <p className="text-xs text-surface-500 mt-1">
              Current on-chain settings pushed by governance into the market contracts.
            </p>
          </div>
          <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
            stats.pauseState ? 'bg-red-500/15 text-red-300' : 'bg-emerald-500/15 text-emerald-300'
          }`}>
            {stats.pauseState ? 'Markets Paused' : 'Markets Active'}
          </span>
        </div>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
          <div className="rounded-lg bg-white/[0.02] p-3">
            <div className="text-surface-500">Protocol Fee</div>
            <div className="mt-1 text-white font-medium">{(Number(stats.protocolFeeBps) / 100).toFixed(2)}%</div>
          </div>
          <div className="rounded-lg bg-white/[0.02] p-3">
            <div className="text-surface-500">Creator Fee</div>
            <div className="mt-1 text-white font-medium">{(Number(stats.creatorFeeBps) / 100).toFixed(2)}%</div>
          </div>
          <div className="rounded-lg bg-white/[0.02] p-3">
            <div className="text-surface-500">LP Fee</div>
            <div className="mt-1 text-white font-medium">{(Number(stats.lpFeeBps) / 100).toFixed(2)}%</div>
          </div>
          <div className="rounded-lg bg-white/[0.02] p-3">
            <div className="text-surface-500">Min Trade</div>
            <div className="mt-1 text-white font-medium">{formatCredits(stats.minTradeAmount, 4)} ALEO</div>
          </div>
          <div className="rounded-lg bg-white/[0.02] p-3">
            <div className="text-surface-500">Min Liquidity</div>
            <div className="mt-1 text-white font-medium">{formatCredits(stats.minLiquidity, 4)} ALEO</div>
          </div>
        </div>
        <div className="mt-4 rounded-lg bg-white/[0.02] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs text-surface-500">Guardian Committee</div>
              <div className="mt-1 text-sm text-white font-medium">
                {stats.guardianThreshold > 0
                  ? `${stats.guardianThreshold} of ${stats.guardianAddresses.length || 3} approvals required`
                  : 'Loading guardian configuration...'}
              </div>
            </div>
            {stats.guardianAddresses.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {stats.guardianAddresses.map((address) => (
                  <span
                    key={address}
                    className="rounded-full border border-white/[0.08] bg-surface-950/70 px-2.5 py-1 font-mono text-[11px] text-surface-300"
                  >
                    {shortenAddress(address, 4)}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* How Staking Works */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-surface-900/40 border border-surface-700/30 rounded-xl p-4"
      >
        <h3 className="text-sm font-semibold text-surface-300 mb-3 flex items-center gap-2">
          <Lock className="w-4 h-4 text-brand-400" />
          How ALEO Staking Works
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
          <div className="flex items-start gap-2">
            <Vote className="w-3.5 h-3.5 text-purple-400 mt-0.5 shrink-0" />
            <div>
              <span className="text-surface-300 font-medium">Vote on Proposals</span>
              <p className="text-surface-500 mt-0.5">Lock ALEO to vote. Unlocks after voting ends.</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Coins className="w-3.5 h-3.5 text-brand-400 mt-0.5 shrink-0" />
            <div>
              <span className="text-surface-300 font-medium">Create Proposals</span>
              <p className="text-surface-500 mt-0.5">Stake 10 ALEO to submit a proposal.</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Lock className="w-3.5 h-3.5 text-yellow-400 mt-0.5 shrink-0" />
            <div>
              <span className="text-surface-300 font-medium">Become Resolver</span>
              <p className="text-surface-500 mt-0.5">Stake 50 ALEO to resolve markets.</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Unlock className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
            <div>
              <span className="text-surface-300 font-medium">Earn Rewards</span>
              <p className="text-surface-500 mt-0.5">LP & traders earn ALEO from protocol fees.</p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
