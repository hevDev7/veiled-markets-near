// ============================================================================
// VEILED GOVERNANCE — ResolverPanel (Simplified)
// ============================================================================

import { useState } from 'react';
import {
  Shield, Star, AlertTriangle, Loader2, CheckCircle, Lock,
  Award, Zap, XCircle,
} from 'lucide-react';
import { formatVeil } from '../../lib/governance-client';
import { useGovernanceStore } from '../../lib/governance-store';
import { useWalletStore } from '../../lib/store';
import {
  type GovernanceActorRole,
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
  onFocusActor: (address: string, role: GovernanceActorRole) => void;
}

const TIER_COLORS: Record<ResolverTier, { text: string; bg: string; border: string; icon: typeof Star }> = {
  [RESOLVER_TIERS.BRONZE]: { text: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/25', icon: Shield },
  [RESOLVER_TIERS.SILVER]: { text: 'text-slate-300', bg: 'bg-slate-400/10', border: 'border-slate-400/25', icon: Award },
  [RESOLVER_TIERS.GOLD]: { text: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/25', icon: Star },
  [RESOLVER_TIERS.COMMITTEE]: { text: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/25', icon: Zap },
};

const TIERS = [
  { tier: RESOLVER_TIERS.BRONZE, label: 'Bronze', stake: RESOLVER_STAKE_REQUIREMENTS[RESOLVER_TIERS.BRONZE], desc: '0+ resolves · < 100 ALEO markets' },
  { tier: RESOLVER_TIERS.SILVER, label: 'Silver', stake: RESOLVER_STAKE_REQUIREMENTS[RESOLVER_TIERS.SILVER], desc: '10+ resolves · ≥ 70% rep' },
  { tier: RESOLVER_TIERS.GOLD, label: 'Gold', stake: RESOLVER_STAKE_REQUIREMENTS[RESOLVER_TIERS.GOLD], desc: '50+ resolves · ≥ 90% rep' },
  { tier: RESOLVER_TIERS.COMMITTEE, label: 'Committee', stake: RESOLVER_STAKE_REQUIREMENTS[RESOLVER_TIERS.COMMITTEE], desc: 'Elected via governance vote' },
];

export function ResolverPanel({ onRegister, onUpgrade, onDeregister, onFocusActor: _onFocusActor }: ResolverPanelProps) {
  const { resolverProfile } = useGovernanceStore();
  const { wallet } = useWalletStore();
  const [selectedTier, setSelectedTier] = useState<ResolverTier>(RESOLVER_TIERS.BRONZE);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const aleoBalance = wallet.balance.public + wallet.balance.private;
  const isRegistered = resolverProfile !== null && resolverProfile.isActive;

  const handleRegister = async () => {
    setError(null);
    const required = RESOLVER_STAKE_REQUIREMENTS[selectedTier];
    if (aleoBalance < required) {
      setError(`Need ${formatVeil(required)} ALEO to register.`);
      return;
    }
    setIsSubmitting(true);
    try { await onRegister(selectedTier); }
    catch (err) { setError(err instanceof Error ? err.message : 'Registration failed'); }
    finally { setIsSubmitting(false); }
  };

  const handleUpgrade = async (newTier: ResolverTier) => {
    setError(null);
    const additional = RESOLVER_STAKE_REQUIREMENTS[newTier] - (resolverProfile?.stakeAmount ?? 0n);
    if (additional > aleoBalance) {
      setError(`Need ${formatVeil(additional)} more ALEO.`);
      return;
    }
    setIsSubmitting(true);
    try { await onUpgrade(newTier); }
    catch (err) { setError(err instanceof Error ? err.message : 'Upgrade failed'); }
    finally { setIsSubmitting(false); }
  };

  const handleDeregister = async () => {
    setIsSubmitting(true);
    try { await onDeregister(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
    finally { setIsSubmitting(false); }
  };

  return (
    <div className="space-y-4">
      {/* Profile card — if registered */}
      {isRegistered && resolverProfile && (
        <ProfileCard profile={resolverProfile} onDeregister={handleDeregister} isSubmitting={isSubmitting} />
      )}

      {/* Register or Upgrade */}
      {!isRegistered ? (
        <div className="rounded-xl border border-white/[0.06] bg-surface-900/50 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-white">Become a Resolver</h3>
          <p className="text-xs text-surface-400">
            Stake ALEO to resolve markets and earn rewards. Wrong resolutions = slashing.
          </p>

          <div className="space-y-1.5">
            {TIERS.filter(t => t.tier !== RESOLVER_TIERS.COMMITTEE).map((t) => {
              const c = TIER_COLORS[t.tier];
              const Icon = c.icon;
              const canAfford = aleoBalance >= t.stake;
              return (
                <button
                  key={t.tier}
                  onClick={() => setSelectedTier(t.tier)}
                  disabled={!canAfford}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all ${
                    selectedTier === t.tier
                      ? `${c.bg} ${c.border} border`
                      : 'border border-transparent hover:bg-white/[0.03]'
                  } ${!canAfford ? 'opacity-35 cursor-not-allowed' : ''}`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${c.text}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-medium ${c.text}`}>{t.label}</span>
                      <span className="text-xs text-surface-400 font-mono">{formatVeil(t.stake)} ALEO</span>
                    </div>
                    <p className="text-[10px] text-surface-500 mt-0.5">{t.desc}</p>
                  </div>
                  {selectedTier === t.tier && <CheckCircle className={`w-4 h-4 shrink-0 ${c.text}`} />}
                </button>
              );
            })}
          </div>

          {error && (
            <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              {error}
            </div>
          )}

          <button
            onClick={handleRegister}
            disabled={isSubmitting || aleoBalance < RESOLVER_STAKE_REQUIREMENTS[selectedTier]}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-brand-500 hover:bg-brand-600 disabled:bg-surface-700 disabled:text-surface-500 text-white text-sm rounded-lg font-medium transition-colors"
          >
            {isSubmitting
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Registering...</>
              : <><Lock className="w-4 h-4" /> Stake & Register</>}
          </button>

          <p className="text-[10px] text-surface-500 text-center">
            Staked ALEO is locked while active. 10 ALEO slash per wrong resolution. 3 strikes = 90-day ban.
          </p>
        </div>
      ) : resolverProfile && (
        <UpgradeSection
          profile={resolverProfile}
          aleoBalance={aleoBalance}
          onUpgrade={handleUpgrade}
          isSubmitting={isSubmitting}
          error={error}
        />
      )}

      {/* Tier table — compact */}
      <TierTable currentTier={resolverProfile?.tier} />
    </div>
  );
}

// ---- Profile Card ----

function ProfileCard({ profile, onDeregister, isSubmitting }: {
  profile: ResolverProfile;
  onDeregister: () => void;
  isSubmitting: boolean;
}) {
  const c = TIER_COLORS[profile.tier];
  const Icon = c.icon;

  return (
    <div className={`rounded-xl border ${c.border} ${c.bg} p-4`}>
      <div className="flex items-center gap-3 mb-3">
        <Icon className={`w-5 h-5 ${c.text}`} />
        <div>
          <span className={`text-sm font-semibold ${c.text}`}>{RESOLVER_TIER_LABELS[profile.tier]} Resolver</span>
          <span className="ml-2 text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-medium">Active</span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 text-xs">
        <div className="bg-black/20 rounded-lg p-2">
          <div className="text-surface-500">Staked</div>
          <div className="mt-1 font-semibold text-white">{formatVeil(profile.stakeAmount)}</div>
        </div>
        <div className="bg-black/20 rounded-lg p-2">
          <div className="text-surface-500">Resolved</div>
          <div className="mt-1 font-semibold text-white">{profile.marketsResolved}</div>
        </div>
        <div className="bg-black/20 rounded-lg p-2">
          <div className="text-surface-500">Reputation</div>
          <div className="mt-1 font-semibold text-white">{profile.reputationScore.toFixed(0)}%</div>
        </div>
        <div className="bg-black/20 rounded-lg p-2">
          <div className="text-surface-500">Strikes</div>
          <div className={`mt-1 font-semibold ${profile.strikes > 0 ? 'text-red-400' : 'text-white'}`}>{profile.strikes}/3</div>
        </div>
      </div>

      <button
        onClick={onDeregister}
        disabled={isSubmitting}
        className="mt-3 text-[11px] text-surface-500 hover:text-red-400 transition-colors"
      >
        {isSubmitting ? 'Processing...' : 'Deregister (7-day cooldown)'}
      </button>
    </div>
  );
}

// ---- Upgrade Section ----

function UpgradeSection({ profile, aleoBalance, onUpgrade, isSubmitting, error }: {
  profile: ResolverProfile;
  aleoBalance: bigint;
  onUpgrade: (tier: ResolverTier) => Promise<void>;
  isSubmitting: boolean;
  error: string | null;
}) {
  const upgrades = TIERS.filter(t => t.tier > profile.tier && t.tier !== RESOLVER_TIERS.COMMITTEE);
  if (upgrades.length === 0) return null;

  return (
    <div className="rounded-xl border border-white/[0.06] bg-surface-900/50 p-4 space-y-2">
      <h3 className="text-sm font-semibold text-white">Upgrade Tier</h3>
      {upgrades.map((t) => {
        const c = TIER_COLORS[t.tier];
        const Icon = c.icon;
        const additional = t.stake - profile.stakeAmount;
        const canAfford = additional <= aleoBalance;
        return (
          <div key={t.tier} className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
            <Icon className={`w-4 h-4 ${c.text} shrink-0`} />
            <div className="flex-1 min-w-0">
              <span className={`text-sm font-medium ${c.text}`}>{t.label}</span>
              <span className="ml-2 text-[10px] text-surface-500">+{formatVeil(additional)} ALEO</span>
            </div>
            <button
              onClick={() => onUpgrade(t.tier)}
              disabled={isSubmitting || !canAfford}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                canAfford ? `${c.bg} ${c.text} hover:opacity-80` : 'bg-surface-700 text-surface-500 cursor-not-allowed'
              }`}
            >
              {isSubmitting ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Upgrade'}
            </button>
          </div>
        );
      })}
      {error && (
        <div className="flex items-center gap-2 text-xs text-red-400">
          <XCircle className="w-3 h-3 shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}

// ---- Tier Table ----

function TierTable({ currentTier }: { currentTier?: ResolverTier }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-surface-900/50 p-4">
      <h3 className="text-sm font-semibold text-white mb-2">Tier Overview</h3>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-surface-500 border-b border-white/[0.06]">
            <th className="text-left py-1.5 font-medium">Tier</th>
            <th className="text-right py-1.5 font-medium">Stake</th>
            <th className="text-right py-1.5 font-medium">Requirement</th>
          </tr>
        </thead>
        <tbody>
          {TIERS.map((t) => {
            const c = TIER_COLORS[t.tier];
            const Icon = c.icon;
            const isCurrent = currentTier === t.tier;
            return (
              <tr key={t.tier} className={`border-b border-white/[0.04] ${isCurrent ? c.bg : ''}`}>
                <td className="py-2 flex items-center gap-1.5">
                  <Icon className={`w-3 h-3 ${c.text}`} />
                  <span className={`font-medium ${c.text}`}>{t.label}</span>
                  {isCurrent && <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-1 rounded">You</span>}
                </td>
                <td className="text-right py-2 text-surface-300 font-mono">{formatVeil(t.stake)}</td>
                <td className="text-right py-2 text-surface-500">{t.desc}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
