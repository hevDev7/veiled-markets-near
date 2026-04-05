import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowRight,
  Clock3,
  Gavel,
  Scale,
  Shield,
  Sparkles,
  Vote,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  formatVeil,
  formatVeilCompact,
  getResolverProfile as fetchResolverProfile,
} from '../../lib/governance-client';
import { describeProposalIntent } from '../../lib/governance-display';
import {
  escalationMatchesActorFocus,
  proposalMatchesActorFocus,
  useGovernanceStore,
} from '../../lib/governance-store';
import { useWalletStore } from '../../lib/store';
import {
  GOVERNANCE_PROPOSAL_LANES,
  PROPOSAL_STATUS,
  PROPOSAL_STATUS_LABELS,
  RESOLVER_TIER_LABELS,
  type GovernanceEscalationMarket,
  type GovernanceProposal,
  type GovernanceProposalLane,
  type ResolverProfile,
} from '../../lib/governance-types';
import { cn, shortenAddress } from '../../lib/utils';

const STAGE_STYLES: Record<GovernanceEscalationMarket['stage'], { label: string; tone: string; icon: typeof Shield }> = {
  voting: {
    label: 'Resolver Voting',
    tone: 'text-brand-300 bg-brand-500/10 border-brand-500/20',
    icon: Vote,
  },
  dispute_window: {
    label: 'Dispute Window',
    tone: 'text-yellow-300 bg-yellow-500/10 border-yellow-500/20',
    icon: AlertTriangle,
  },
  disputed: {
    label: 'Bonded Dispute',
    tone: 'text-red-300 bg-red-500/10 border-red-500/20',
    icon: Shield,
  },
  committee: {
    label: 'Committee Review',
    tone: 'text-purple-300 bg-purple-500/10 border-purple-500/20',
    icon: Scale,
  },
  community: {
    label: 'Community Override',
    tone: 'text-blue-300 bg-blue-500/10 border-blue-500/20',
    icon: Gavel,
  },
  resolved: {
    label: 'Resolved',
    tone: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20',
    icon: Shield,
  },
  cancelled: {
    label: 'Cancelled',
    tone: 'text-surface-300 bg-white/[0.04] border-white/[0.08]',
    icon: AlertTriangle,
  },
};

function getOutcomeLabel(labels: string[], outcome?: number): string | null {
  if (!outcome || outcome < 1) return null;
  return labels[outcome - 1] || `Outcome ${outcome}`;
}

function getPreferredLane(role: 'resolver' | 'guardian'): GovernanceProposalLane {
  return role === 'resolver'
    ? GOVERNANCE_PROPOSAL_LANES.RESOLVER
    : GOVERNANCE_PROPOSAL_LANES.CONTROLS;
}

function sortActorProposals(proposals: GovernanceProposal[]): GovernanceProposal[] {
  const statusPriority: Record<number, number> = {
    [PROPOSAL_STATUS.ACTIVE]: 0,
    [PROPOSAL_STATUS.PASSED]: 1,
    [PROPOSAL_STATUS.EXECUTED]: 2,
    [PROPOSAL_STATUS.REJECTED]: 3,
    [PROPOSAL_STATUS.VETOED]: 4,
    [PROPOSAL_STATUS.EXPIRED]: 5,
  };

  return [...proposals].sort((a, b) => {
    const statusDelta = (statusPriority[a.status] ?? 99) - (statusPriority[b.status] ?? 99);
    if (statusDelta !== 0) return statusDelta;

    const votesDelta = Number(b.totalVotes - a.totalVotes);
    if (votesDelta !== 0) return votesDelta;

    return Number(b.createdAt - a.createdAt);
  });
}

function sortActorEscalations(items: GovernanceEscalationMarket[]): GovernanceEscalationMarket[] {
  const stagePriority: Record<GovernanceEscalationMarket['stage'], number> = {
    community: 0,
    committee: 1,
    disputed: 2,
    dispute_window: 3,
    voting: 4,
    resolved: 5,
    cancelled: 6,
  };

  return [...items].sort((a, b) => {
    const stageDelta = stagePriority[a.stage] - stagePriority[b.stage];
    if (stageDelta !== 0) return stageDelta;
    return a.question.localeCompare(b.question);
  });
}

type ActorTimelineEntry =
  | {
      kind: 'proposal';
      id: string;
      title: string;
      detail: string;
      meta: string;
      statusTone: string;
      createdAt: bigint;
      proposalId: string;
    }
  | {
      kind: 'escalation';
      id: string;
      title: string;
      detail: string;
      meta: string;
      statusTone: string;
      priority: number;
      marketId: string;
      communityProposalId?: string;
    };

function buildActorTimeline(
  actorProposals: GovernanceProposal[],
  actorEscalations: GovernanceEscalationMarket[],
): ActorTimelineEntry[] {
  const proposalEntries: ActorTimelineEntry[] = actorProposals.map((proposal) => ({
    kind: 'proposal',
    id: `proposal-${proposal.proposalId}`,
    title: proposal.title || proposal.proposalTypeName,
    detail: proposal.description || describeProposalIntent(proposal),
    meta: `${PROPOSAL_STATUS_LABELS[proposal.status]} · ${proposal.proposalTypeName}`,
    statusTone: proposal.status === PROPOSAL_STATUS.ACTIVE
      ? 'text-brand-200 border-brand-500/30 bg-brand-500/10'
      : proposal.status === PROPOSAL_STATUS.PASSED
        ? 'text-emerald-200 border-emerald-500/30 bg-emerald-500/10'
        : 'text-surface-300 border-white/[0.08] bg-white/[0.03]',
    createdAt: proposal.createdAt,
    proposalId: proposal.proposalId,
  }));

  const stagePriority: Record<GovernanceEscalationMarket['stage'], number> = {
    community: 6,
    committee: 5,
    disputed: 4,
    dispute_window: 3,
    voting: 2,
    resolved: 1,
    cancelled: 0,
  };

  const escalationEntries: ActorTimelineEntry[] = actorEscalations.map((item) => ({
    kind: 'escalation',
    id: `market-${item.marketId}`,
    title: item.question,
    detail: `${STAGE_STYLES[item.stage].label}${item.communityProposalId ? ' · override motion attached' : ''}`,
    meta: `${item.totalVoters} bonded voter${item.totalVoters === 1 ? '' : 's'} · ${formatVeilCompact(item.totalBonded)} bonded`,
    statusTone: STAGE_STYLES[item.stage].tone,
    priority: stagePriority[item.stage],
    marketId: item.marketId,
    communityProposalId: item.communityProposalId,
  }));

  return [...proposalEntries, ...escalationEntries].sort((a, b) => {
    if (a.kind === 'proposal' && b.kind === 'proposal') {
      return Number(b.createdAt - a.createdAt);
    }
    if (a.kind === 'escalation' && b.kind === 'escalation') {
      return b.priority - a.priority;
    }
    if (a.kind === 'proposal' && b.kind === 'escalation') return -1;
    return 1;
  });
}

interface ActorDetailDrawerProps {
  onSelectProposal: (proposalId: string) => void;
  onReviewLane: (marketId: string) => void;
  onOpenContextLane: (lane: GovernanceProposalLane) => void;
}

export function ActorDetailDrawer({
  onSelectProposal,
  onReviewLane,
  onOpenContextLane,
}: ActorDetailDrawerProps) {
  const {
    actorFocusAddress,
    actorFocusRole,
    proposals,
    escalations,
    stats,
    resolverProfile,
    clearProposalContext,
  } = useGovernanceStore();
  const { wallet } = useWalletStore();
  const [remoteProfile, setRemoteProfile] = useState<ResolverProfile | null | undefined>(undefined);

  const actorProposals = useMemo(() => {
    if (!actorFocusAddress || !actorFocusRole) return [];
    return sortActorProposals(
      proposals.filter((proposal) =>
        proposalMatchesActorFocus(proposal, actorFocusAddress, actorFocusRole, escalations)
      ),
    );
  }, [actorFocusAddress, actorFocusRole, escalations, proposals]);

  const actorEscalations = useMemo(() => {
    if (!actorFocusAddress || !actorFocusRole) return [];
    return sortActorEscalations(
      escalations.filter((item) =>
        escalationMatchesActorFocus(item, actorFocusAddress, actorFocusRole)
      ),
    );
  }, [actorFocusAddress, actorFocusRole, escalations]);

  useEffect(() => {
    if (!actorFocusAddress || actorFocusRole !== 'resolver') {
      setRemoteProfile(undefined);
      return;
    }

    if (resolverProfile?.address === actorFocusAddress) {
      setRemoteProfile(resolverProfile);
      return;
    }

    let cancelled = false;
    setRemoteProfile(undefined);

    void fetchResolverProfile(actorFocusAddress).then((profile) => {
      if (cancelled) return;
      setRemoteProfile(profile ?? null);
    });

    return () => {
      cancelled = true;
    };
  }, [actorFocusAddress, actorFocusRole, resolverProfile]);

  const activeProfile = actorFocusRole === 'resolver'
    ? (resolverProfile?.address === actorFocusAddress ? resolverProfile : remoteProfile)
    : null;
  const activeProposalCount = actorProposals.filter((proposal) =>
    proposal.status === PROPOSAL_STATUS.ACTIVE || proposal.status === PROPOSAL_STATUS.PASSED
  ).length;
  const committeePressure = actorEscalations.filter((item) =>
    item.stage === 'committee' || item.stage === 'community'
  ).length;
  const guardianIndex = actorFocusAddress
    ? stats.guardianAddresses.findIndex((address) => address === actorFocusAddress)
    : -1;
  const drawerOpen = Boolean(actorFocusAddress && actorFocusRole);
  const actorTimeline = useMemo(
    () => buildActorTimeline(actorProposals, actorEscalations).slice(0, 8),
    [actorEscalations, actorProposals],
  );

  return (
    <AnimatePresence>
      {drawerOpen && actorFocusAddress && actorFocusRole && (
        <>
          <motion.button
            type="button"
            aria-label="Close actor detail drawer"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={clearProposalContext}
            className="fixed inset-0 z-40 bg-surface-950/75 backdrop-blur-sm"
          />

          <motion.aside
            initial={{ x: '100%', opacity: 0.96 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0.96 }}
            transition={{ type: 'spring', stiffness: 280, damping: 28 }}
            className="fixed inset-y-0 right-0 z-50 w-full max-w-xl border-l border-white/[0.08] bg-surface-950/96 shadow-2xl"
          >
            <div className="flex h-full flex-col">
              <div className="flex items-start justify-between gap-4 border-b border-white/[0.06] px-5 py-4">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-purple-500/20 bg-purple-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-purple-200">
                    <Sparkles className="h-3.5 w-3.5" />
                    {actorFocusRole === 'resolver' ? 'Resolver Focus' : 'Guardian Focus'}
                  </div>
                  <h3 className="mt-3 text-lg font-semibold text-white">
                    {actorFocusRole === 'resolver' ? 'Actor Detail Drawer' : 'Guardian Detail Drawer'}
                  </h3>
                  <p className="mt-1 font-mono text-xs text-surface-400">
                    {shortenAddress(actorFocusAddress, 8)}
                    {actorFocusAddress === wallet.address ? ' · connected wallet' : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={clearProposalContext}
                  className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs font-medium text-surface-200 transition-colors hover:bg-white/[0.06]"
                >
                  <X className="h-4 w-4" />
                  Close
                </button>
              </div>

              <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <SummaryCard label="Related proposals" value={String(actorProposals.length)} hint={`${activeProposalCount} active or timelocked`} />
                  <SummaryCard label="Escalation markets" value={String(actorEscalations.length)} hint={`${committeePressure} under committee pressure`} />
                  <SummaryCard
                    label={actorFocusRole === 'resolver' ? 'Committee pressure' : 'Guardian threshold'}
                    value={actorFocusRole === 'resolver' ? String(committeePressure) : `${stats.guardianThreshold || 0}`}
                    hint={actorFocusRole === 'resolver' ? 'Markets in committee/community lanes' : `${stats.guardianAddresses.length} guardians indexed`}
                  />
                  <SummaryCard
                    label={actorFocusRole === 'resolver' ? 'Preferred lane' : 'Emergency lane'}
                    value={actorFocusRole === 'resolver' ? 'Resolver' : 'Controls'}
                    hint="Quick jump for this actor context"
                  />
                </div>

                <section className="rounded-2xl border border-white/[0.06] bg-surface-900/60 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold text-white">
                        {actorFocusRole === 'resolver' ? 'Resolver snapshot' : 'Guardian snapshot'}
                      </h4>
                      <p className="mt-1 text-xs text-surface-400">
                        {actorFocusRole === 'resolver'
                          ? 'Stake, reputation, and registry metrics for the selected resolver.'
                          : 'Guardian context is currently role-based. Individual guardian votes are not indexed per market in the read model yet.'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onOpenContextLane(getPreferredLane(actorFocusRole))}
                      className="inline-flex items-center gap-2 rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-2 text-xs font-medium text-purple-100 transition-colors hover:bg-purple-500/15"
                    >
                      Open {actorFocusRole === 'resolver' ? 'Resolver' : 'Controls'} Lane
                    </button>
                  </div>

                  {actorFocusRole === 'resolver' ? (
                    activeProfile === undefined ? (
                      <div className="mt-4 rounded-xl border border-white/[0.06] bg-surface-950/50 p-4 text-sm text-surface-400">
                        Loading resolver registry profile...
                      </div>
                    ) : activeProfile ? (
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <InfoChip label="Tier" value={RESOLVER_TIER_LABELS[activeProfile.tier]} />
                        <InfoChip label="Stake" value={`${formatVeil(activeProfile.stakeAmount)} ALEO`} />
                        <InfoChip label="Reputation" value={`${activeProfile.reputationScore.toFixed(1)}%`} />
                        <InfoChip label="Strikes" value={`${activeProfile.strikes}/3`} />
                        <InfoChip label="Markets resolved" value={String(activeProfile.marketsResolved)} />
                        <InfoChip label="Disputes lost" value={String(activeProfile.disputesLost)} />
                      </div>
                    ) : (
                      <div className="mt-4 rounded-xl border border-white/[0.06] bg-surface-950/50 p-4 text-sm text-surface-400">
                        No resolver profile is currently indexed for this address, but it still appears in escalation context.
                      </div>
                    )
                  ) : (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <InfoChip label="Guardian threshold" value={`${stats.guardianThreshold || 0}`} />
                      <InfoChip label="Guardian set size" value={String(stats.guardianAddresses.length)} />
                      <InfoChip
                        label="Guardian position"
                        value={guardianIndex >= 0 ? `#${guardianIndex + 1}` : 'Indexed guardian'}
                      />
                      <InfoChip label="Committee pressure" value={`${committeePressure} markets`} />
                    </div>
                  )}
                </section>

                <section className="rounded-2xl border border-white/[0.06] bg-surface-900/60 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold text-white">Related proposals</h4>
                      <p className="mt-1 text-xs text-surface-400">
                        Governance motions tied to this actor through proposer, payload, target, or escalation market context.
                      </p>
                    </div>
                    <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11px] text-surface-300">
                      {actorProposals.length} found
                    </span>
                  </div>

                  <div className="mt-4 space-y-3">
                    {actorProposals.length === 0 ? (
                      <EmptyState text="No proposals match this actor focus yet." />
                    ) : (
                      actorProposals.slice(0, 5).map((proposal) => (
                        <button
                          key={proposal.proposalId}
                          type="button"
                          onClick={() => onSelectProposal(proposal.proposalId)}
                          className="w-full rounded-xl border border-white/[0.06] bg-surface-950/50 p-3 text-left transition-colors hover:bg-white/[0.04]"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-semibold text-white">
                                  {proposal.title || proposal.proposalTypeName}
                                </span>
                                <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[10px] font-medium text-surface-300">
                                  {PROPOSAL_STATUS_LABELS[proposal.status]}
                                </span>
                              </div>
                              <p className="mt-1 line-clamp-2 text-xs text-surface-400">
                                {proposal.description || describeProposalIntent(proposal)}
                              </p>
                            </div>
                            <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-surface-500" />
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </section>

                <section className="rounded-2xl border border-white/[0.06] bg-surface-900/60 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold text-white">Actor timeline</h4>
                      <p className="mt-1 text-xs text-surface-400">
                        A merged view of governance motions and escalation signals touching this actor, ordered with the freshest proposals first and the hottest market lanes close behind.
                      </p>
                    </div>
                    <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11px] text-surface-300">
                      {actorTimeline.length} events
                    </span>
                  </div>

                  <div className="mt-4 space-y-3">
                    {actorTimeline.length === 0 ? (
                      <EmptyState text="No timeline events match this actor focus yet." />
                    ) : (
                      actorTimeline.map((entry) => (
                        <button
                          key={entry.id}
                          type="button"
                          onClick={() => {
                            if (entry.kind === 'proposal') {
                              onSelectProposal(entry.proposalId);
                              return;
                            }
                            if (entry.communityProposalId) {
                              onSelectProposal(entry.communityProposalId);
                              return;
                            }
                            onReviewLane(entry.marketId);
                          }}
                          className="w-full rounded-xl border border-white/[0.06] bg-surface-950/50 p-3 text-left transition-colors hover:bg-white/[0.04]"
                        >
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5 rounded-full border border-white/[0.08] bg-white/[0.03] p-2 text-surface-300">
                              <Clock3 className="h-3.5 w-3.5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-semibold text-white">{entry.title}</span>
                                <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-medium', entry.statusTone)}>
                                  {entry.meta}
                                </span>
                              </div>
                              <p className="mt-1 line-clamp-2 text-xs text-surface-400">{entry.detail}</p>
                            </div>
                            <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-surface-500" />
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </section>

                <section className="rounded-2xl border border-white/[0.06] bg-surface-900/60 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold text-white">Escalation context</h4>
                      <p className="mt-1 text-xs text-surface-400">
                        Markets currently tied to this actor focus, including dispute lanes and committee pressure.
                      </p>
                    </div>
                    <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11px] text-surface-300">
                      {actorEscalations.length} markets
                    </span>
                  </div>

                  <div className="mt-4 space-y-3">
                    {actorEscalations.length === 0 ? (
                      <EmptyState text="No escalation markets match this actor focus right now." />
                    ) : (
                      actorEscalations.slice(0, 5).map((item) => {
                        const stage = STAGE_STYLES[item.stage];
                        const StageIcon = stage.icon;
                        const currentOutcomeLabel = getOutcomeLabel(item.outcomeLabels, item.currentOutcome);
                        const disputeOutcomeLabel = getOutcomeLabel(item.outcomeLabels, item.disputeOutcome);
                        const committeeOutcomeLabel = getOutcomeLabel(item.outcomeLabels, item.committeeOutcome);

                        return (
                          <div
                            key={item.marketId}
                            className="rounded-xl border border-white/[0.06] bg-surface-950/50 p-3"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="text-sm font-semibold text-white">{item.question}</div>
                                <div className="mt-1 text-[11px] font-mono text-surface-500">
                                  {shortenAddress(item.marketId, 6)}
                                </div>
                              </div>
                              <span className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium', stage.tone)}>
                                <StageIcon className="h-3.5 w-3.5" />
                                {stage.label}
                              </span>
                            </div>

                            <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                              <InfoChip label="Current tally" value={currentOutcomeLabel || 'Not tallied'} compact />
                              <InfoChip label="Disputed outcome" value={disputeOutcomeLabel || 'None'} compact />
                              <InfoChip label="Committee outcome" value={committeeOutcomeLabel || 'None'} compact />
                              <InfoChip label="Bonded total" value={formatVeilCompact(item.totalBonded)} compact />
                            </div>

                            <div className="mt-3 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => onReviewLane(item.marketId)}
                                className="inline-flex items-center gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs font-medium text-yellow-200 transition-colors hover:bg-yellow-500/15"
                              >
                                Review Lane
                              </button>
                              {item.communityProposalId && (
                                <button
                                  type="button"
                                  onClick={() => onSelectProposal(item.communityProposalId!)}
                                  className="inline-flex items-center gap-2 rounded-lg border border-brand-500/30 bg-brand-500/10 px-3 py-2 text-xs font-medium text-brand-200 transition-colors hover:bg-brand-500/15"
                                >
                                  Open Override Proposal
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </section>
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function SummaryCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-surface-900/60 p-4">
      <div className="text-[11px] uppercase tracking-[0.16em] text-surface-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
      <p className="mt-1 text-xs text-surface-400">{hint}</p>
    </div>
  );
}

function InfoChip({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2">
      <div className="text-[11px] uppercase tracking-[0.14em] text-surface-500">{label}</div>
      <div className={cn('mt-1 font-medium text-white', compact ? 'text-xs' : 'text-sm')}>{value}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-surface-950/50 p-4 text-sm text-surface-500">
      {text}
    </div>
  );
}
