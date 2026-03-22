// ============================================================================
// VEILED GOVERNANCE — ResolverPanel Component
// ============================================================================
// Resolver registration, staking, profile view, and tier management
// ============================================================================

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Shield, Star, AlertTriangle, Loader2, CheckCircle, Lock,
  TrendingUp, XCircle, Award, Zap,
} from 'lucide-react';
import { formatVeil } from '../../lib/governance-client';
import { useGovernanceStore } from '../../lib/governance-store';
import { useWalletStore } from '../../lib/store';
import {
  RESOLVER_TIERS,
  RESOLVER_TIER_LABELS,
  RESOLVER_STAKE_REQUIREMENTS,
  type ResolverProfile,
  type ResolverTier,
} from '../../lib/governance-types';

interface ResolverPanelProps {
  onRegister: (tier: ResolverTier) => Promise<void>;
  onUpgrade: (newTier: ResolverTier) => Promise<void>;
  onDeregister: () => Promise<void>;
}

// Tier visual config
const TIER_CONFIG: Record<ResolverTier, {
  color: string;
  bgColor: string;
  borderColor: string;
  icon: typeof Star;
  gradient: string;
}> = {
  [RESOLVER_TIERS.BRONZE]: {
    color: 'text-amber-600',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
    icon: Shield,
    gradient: 'from-amber-700 to-amber-500',
  },
  [RESOLVER_TIERS.SILVER]: {
    color: 'text-slate-300',
    bgColor: 'bg-slate-400/10',
    borderColor: 'border-slate-400/30',
    icon: Award,
    gradient: 'from-slate-400 to-slate-200',
  },
  [RESOLVER_TIERS.GOLD]: {
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/10',
    borderColor: 'border-yellow-500/30',
    icon: Star,
    gradient: 'from-yellow-500 to-amber-300',
  },
  [RESOLVER_TIERS.COMMITTEE]: {
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/30',
    icon: Zap,
    gradient: 'from-purple-500 to-violet-400',
  },
};

const TIER_REQUIREMENTS: {
  tier: ResolverTier;
  label: string;
  stake: bigint;
  resolves: string;
  reputation: string;
  marketLimit: string;
  reward: string;
}[] = [
  {
    tier: RESOLVER_TIERS.BRONZE,
    label: 'Bronze',
    stake: RESOLVER_STAKE_REQUIREMENTS[RESOLVER_TIERS.BRONZE],
    resolves: 'New (0+)',
    reputation: 'Any',
    marketLimit: '< 100 ALEO',
    reward: '5 ALEO / resolve',
  },
  {
    tier: RESOLVER_TIERS.SILVER,
    label: 'Silver',
    stake: RESOLVER_STAKE_REQUIREMENTS[RESOLVER_TIERS.SILVER],
    resolves: '10+ resolves',
    reputation: '≥ 70%',
    marketLimit: '< 1,000 ALEO',
    reward: '15 ALEO / resolve',
  },
  {
    tier: RESOLVER_TIERS.GOLD,
    label: 'Gold',
    stake: RESOLVER_STAKE_REQUIREMENTS[RESOLVER_TIERS.GOLD],
    resolves: '50+ resolves',
    reputation: '≥ 90%',
    marketLimit: 'Unlimited',
    reward: '50 ALEO / resolve',
  },
  {
    tier: RESOLVER_TIERS.COMMITTEE,
    label: 'Committee',
    stake: RESOLVER_STAKE_REQUIREMENTS[RESOLVER_TIERS.COMMITTEE],
    resolves: 'Elected via governance',
    reputation: 'Governance vote',
    marketLimit: 'Tier 2 disputes only',
    reward: '50 ALEO / dispute',
  },
];

export function ResolverPanel({ onRegister, onUpgrade, onDeregister }: ResolverPanelProps) {
  const { resolverProfile } = useGovernanceStore();
  const { wallet } = useWalletStore();
  const [selectedTier, setSelectedTier] = useState<ResolverTier>(RESOLVER_TIERS.BRONZE);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // v3: Use actual ALEO balance from wallet (public + private)
  const aleoBalance = wallet.balance.public + wallet.balance.private;
  const isRegistered = resolverProfile !== null && resolverProfile.isActive;
  const stakeRequired = RESOLVER_STAKE_REQUIREMENTS[selectedTier];
  const canAffordStake = aleoBalance >= stakeRequired;

  const handleRegister = async () => {
    setError(null);
    if (!canAffordStake) {
      setError(`Insufficient ALEO balance. Need ${formatVeil(stakeRequired)} ALEO.`);
      return;
    }
    setIsSubmitting(true);
    try {
      await onRegister(selectedTier);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpgrade = async (newTier: ResolverTier) => {
    setError(null);
    const additionalStake = RESOLVER_STAKE_REQUIREMENTS[newTier] - (resolverProfile?.stakeAmount ?? 0n);
    if (additionalStake > aleoBalance) {
      setError(`Need ${formatVeil(additionalStake)} more ALEO to upgrade.`);
      return;
    }
    setIsSubmitting(true);
    try {
      await onUpgrade(newTier);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upgrade failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeregister = async () => {
    setIsSubmitting(true);
    try {
      await onDeregister();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Deregistration failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold text-white flex items-center gap-2">
        <Shield className="w-5 h-5 text-brand-400" />
        Resolver Registry
      </h2>

      {/* Current Profile (if registered) */}
      {isRegistered && resolverProfile && (
        <ResolverProfileCard profile={resolverProfile} onDeregister={handleDeregister} isSubmitting={isSubmitting} />
      )}

      {/* Registration / Tier Upgrade */}
      {!isRegistered ? (
        <div className="space-y-4">
          <div className="bg-surface-900/60 border border-white/[0.06] rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-white mb-2">Become a Resolver</h3>
            <p className="text-xs text-surface-400 mb-4">
              Stake ALEO to register as a market resolver. Resolvers earn rewards for
              correctly resolving markets. Incorrect resolutions result in stake slashing.
            </p>

            {/* Tier Selection */}
            <div className="space-y-2 mb-4">
              {TIER_REQUIREMENTS.filter(t => t.tier !== RESOLVER_TIERS.COMMITTEE).map((t) => {
                const cfg = TIER_CONFIG[t.tier];
                const Icon = cfg.icon;
                const isSelected = selectedTier === t.tier;
                const canAfford = aleoBalance >= t.stake;

                return (
                  <button
                    key={t.tier}
                    onClick={() => setSelectedTier(t.tier)}
                    disabled={!canAfford}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all ${
                      isSelected
                        ? `${cfg.bgColor} ${cfg.borderColor} border-2`
                        : 'bg-white/[0.02] border border-surface-700/30 hover:border-surface-600/50'
                    } ${!canAfford ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${cfg.gradient} flex items-center justify-center shrink-0`}>
                      <Icon className="w-4.5 h-4.5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className={`text-sm font-semibold ${cfg.color}`}>{t.label}</span>
                        <span className="text-xs text-surface-400 font-mono">
                          {formatVeil(t.stake)} ALEO
                        </span>
                      </div>
                      <div className="text-[10px] text-surface-500 mt-0.5">
                        {t.resolves} · {t.marketLimit} · {t.reward}
                      </div>
                    </div>
                    {isSelected && <CheckCircle className={`w-4 h-4 shrink-0 ${cfg.color}`} />}
                  </button>
                );
              })}
            </div>

            {/* Stake Summary */}
            <div className="bg-white/[0.02] border border-surface-700/30 rounded-xl p-3 mb-4 space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-surface-400">Stake Required</span>
                <span className="text-white font-medium font-mono">
                  {formatVeil(stakeRequired)} ALEO
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-surface-400">Your Balance</span>
                <span className={`font-medium font-mono ${canAffordStake ? 'text-emerald-400' : 'text-red-400'}`}>
                  {formatVeil(aleoBalance)} ALEO
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-surface-400">After Staking</span>
                <span className="text-surface-300 font-mono">
                  {canAffordStake ? formatVeil(aleoBalance - stakeRequired) : '—'} ALEO
                </span>
              </div>
            </div>

            {/* Rules */}
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 mb-4">
              <div className="flex gap-2 text-xs text-amber-400">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium mb-1">Staking Rules</p>
                  <ul className="text-amber-400/80 space-y-0.5 list-disc list-inside">
                    <li>Staked ALEO is locked while you are an active resolver</li>
                    <li>Incorrect resolutions result in 10 ALEO slashing</li>
                    <li>3 strikes = blacklisted (90-day cooldown)</li>
                    <li>7-day cooldown when deregistering</li>
                    <li>Creator ≠ Resolver (conflict of interest prevention)</li>
                  </ul>
                </div>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5 mb-4">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            {/* Register Button */}
            <button
              onClick={handleRegister}
              disabled={isSubmitting || !canAffordStake}
              className="w-full flex items-center justify-center gap-2 py-3 bg-brand-500 hover:bg-brand-600 disabled:bg-surface-700 disabled:text-surface-500 text-white rounded-xl font-medium transition-colors"
            >
              {isSubmitting ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Registering...</>
              ) : (
                <><Lock className="w-4 h-4" /> Stake & Register as {RESOLVER_TIER_LABELS[selectedTier]} Resolver</>
              )}
            </button>
          </div>
        </div>
      ) : resolverProfile && (
        /* Tier Upgrade Options */
        <TierUpgradeSection
          currentProfile={resolverProfile}
          aleoBalance={aleoBalance}
          onUpgrade={handleUpgrade}
          isSubmitting={isSubmitting}
          error={error}
        />
      )}

      {/* Tier Comparison Table */}
      <TierComparisonTable currentTier={resolverProfile?.tier} />
    </div>
  );
}

// ============================================================================
// Resolver Profile Card
// ============================================================================

function ResolverProfileCard({
  profile,
  onDeregister,
  isSubmitting,
}: {
  profile: ResolverProfile;
  onDeregister: () => void;
  isSubmitting: boolean;
}) {
  const cfg = TIER_CONFIG[profile.tier];
  const Icon = cfg.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`${cfg.bgColor} border ${cfg.borderColor} rounded-2xl p-5`}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${cfg.gradient} flex items-center justify-center`}>
            <Icon className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-base font-bold ${cfg.color}`}>
                {RESOLVER_TIER_LABELS[profile.tier]} Resolver
              </span>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-md font-medium">
                Active
              </span>
            </div>
            <span className="text-xs text-surface-500 font-mono">
              {profile.address.slice(0, 20)}...
            </span>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <StatBox label="Staked" value={formatVeil(profile.stakeAmount)} sub="ALEO locked" icon={Lock} />
        <StatBox label="Resolved" value={String(profile.marketsResolved)} sub="markets" icon={CheckCircle} />
        <StatBox label="Reputation" value={`${profile.reputationScore.toFixed(1)}%`} sub={profile.reputationScore >= 90 ? 'Excellent' : profile.reputationScore >= 70 ? 'Good' : 'Needs improvement'} icon={TrendingUp} />
        <StatBox label="Strikes" value={`${profile.strikes}/3`} sub={profile.strikes === 0 ? 'Clean record' : `${3 - profile.strikes} remaining`} icon={profile.strikes > 0 ? AlertTriangle : Shield} />
      </div>

      {/* Disputes */}
      <div className="flex items-center gap-4 text-xs text-surface-400 mb-4">
        <span>Disputes received: <strong className="text-surface-300">{profile.disputesReceived}</strong></span>
        <span>Disputes lost: <strong className={profile.disputesLost > 0 ? 'text-red-400' : 'text-surface-300'}>{profile.disputesLost}</strong></span>
      </div>

      {/* Deregister */}
      <button
        onClick={onDeregister}
        disabled={isSubmitting}
        className="text-xs text-surface-500 hover:text-red-400 transition-colors"
      >
        {isSubmitting ? 'Processing...' : 'Deregister (7-day cooldown, returns stake)'}
      </button>
    </motion.div>
  );
}

// ============================================================================
// Stat Box
// ============================================================================

function StatBox({ label, value, sub, icon: Icon }: { label: string; value: string; sub: string; icon: typeof CheckCircle }) {
  return (
    <div className="bg-surface-900/40 rounded-lg p-2.5">
      <div className="flex items-center gap-1 text-[10px] text-surface-500 mb-1">
        <Icon className="w-3 h-3" />
        {label}
      </div>
      <div className="text-sm font-bold text-white">{value}</div>
      <div className="text-[10px] text-surface-500">{sub}</div>
    </div>
  );
}

// ============================================================================
// Tier Upgrade Section
// ============================================================================

function TierUpgradeSection({
  currentProfile,
  aleoBalance,
  onUpgrade,
  isSubmitting,
  error,
}: {
  currentProfile: ResolverProfile;
  aleoBalance: bigint;
  onUpgrade: (tier: ResolverTier) => Promise<void>;
  isSubmitting: boolean;
  error: string | null;
}) {
  const upgradeTiers = TIER_REQUIREMENTS.filter(
    (t) => t.tier > currentProfile.tier && t.tier !== RESOLVER_TIERS.COMMITTEE
  );

  if (upgradeTiers.length === 0) return null;

  return (
    <div className="bg-surface-900/60 border border-white/[0.06] rounded-2xl p-5">
      <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-brand-400" />
        Upgrade Tier
      </h3>

      <div className="space-y-2">
        {upgradeTiers.map((t) => {
          const cfg = TIER_CONFIG[t.tier];
          const Icon = cfg.icon;
          const additionalStake = t.stake - currentProfile.stakeAmount;
          const canAfford = additionalStake <= aleoBalance;

          return (
            <div
              key={t.tier}
              className={`flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-surface-700/30`}
            >
              <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${cfg.gradient} flex items-center justify-center shrink-0`}>
                <Icon className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-semibold ${cfg.color}`}>{t.label}</div>
                <div className="text-[10px] text-surface-500">
                  +{formatVeil(additionalStake)} ALEO additional · {t.resolves} · {t.reputation}
                </div>
              </div>
              <button
                onClick={() => onUpgrade(t.tier)}
                disabled={isSubmitting || !canAfford}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  canAfford
                    ? `${cfg.bgColor} ${cfg.color} hover:opacity-80`
                    : 'bg-surface-700 text-surface-500 cursor-not-allowed'
                }`}
              >
                {isSubmitting ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Upgrade'}
              </button>
            </div>
          );
        })}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-xs text-red-400 mt-3">
          <XCircle className="w-3.5 h-3.5 shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Tier Comparison Table
// ============================================================================

function TierComparisonTable({ currentTier }: { currentTier?: ResolverTier }) {
  return (
    <div className="bg-surface-900/60 border border-white/[0.06] rounded-2xl p-5">
      <h3 className="text-sm font-semibold text-white mb-3">Resolver Tiers</h3>

      <div className="overflow-x-auto -mx-2">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-surface-500 border-b border-white/[0.06]">
              <th className="text-left py-2 px-2 font-medium">Tier</th>
              <th className="text-right py-2 px-2 font-medium">Stake</th>
              <th className="text-right py-2 px-2 font-medium">Requirement</th>
              <th className="text-right py-2 px-2 font-medium">Market Limit</th>
              <th className="text-right py-2 px-2 font-medium">Reward</th>
            </tr>
          </thead>
          <tbody>
            {TIER_REQUIREMENTS.map((t) => {
              const cfg = TIER_CONFIG[t.tier];
              const Icon = cfg.icon;
              const isCurrent = currentTier === t.tier;

              return (
                <tr
                  key={t.tier}
                  className={`border-b border-white/[0.04] ${isCurrent ? cfg.bgColor : ''}`}
                >
                  <td className="py-2.5 px-2">
                    <div className="flex items-center gap-1.5">
                      <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
                      <span className={`font-medium ${cfg.color}`}>{t.label}</span>
                      {isCurrent && (
                        <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-1 py-0.5 rounded font-medium">
                          You
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="text-right py-2.5 px-2 text-surface-300 font-mono">
                    {formatVeil(t.stake)}
                  </td>
                  <td className="text-right py-2.5 px-2 text-surface-400">{t.resolves}</td>
                  <td className="text-right py-2.5 px-2 text-surface-400">{t.marketLimit}</td>
                  <td className="text-right py-2.5 px-2 text-surface-300">{t.reward}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Slash/Punishment Info */}
      <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
        <div className="bg-red-500/5 border border-red-500/10 rounded-lg p-2">
          <span className="text-red-400 font-medium">Wrong Resolution:</span>
          <span className="text-red-400/70 ml-1">-10 ALEO + 1 strike</span>
        </div>
        <div className="bg-red-500/5 border border-red-500/10 rounded-lg p-2">
          <span className="text-red-400 font-medium">3 Strikes:</span>
          <span className="text-red-400/70 ml-1">Blacklisted 90 days</span>
        </div>
      </div>
    </div>
  );
}
