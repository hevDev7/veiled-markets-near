// ============================================================================
// VEILED GOVERNANCE — ProposalList Component
// ============================================================================

import { motion } from 'framer-motion';
import { Plus, Filter, Loader2, FileQuestion, X } from 'lucide-react';
import { useMemo } from 'react';
import { useGovernanceStore } from '../../lib/governance-store';
import {
  GOVERNANCE_PROPOSAL_LANES,
  PROPOSAL_STATUS,
  PROPOSAL_TYPES,
} from '../../lib/governance-types';
import { ProposalCard } from './ProposalCard';

interface ProposalListProps {
  onCreateProposal: () => void;
  onSelectProposal: (proposalId: string) => void;
}

const FILTER_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'passed', label: 'Passed' },
  { key: 'executed', label: 'Executed' },
  { key: 'rejected', label: 'Rejected' },
] as const;

const LANE_OPTIONS = [
  { key: GOVERNANCE_PROPOSAL_LANES.ALL, label: 'All Lanes' },
  { key: GOVERNANCE_PROPOSAL_LANES.DISPUTE, label: 'Disputes' },
  { key: GOVERNANCE_PROPOSAL_LANES.RESOLVER, label: 'Resolvers' },
  { key: GOVERNANCE_PROPOSAL_LANES.CONTROLS, label: 'Controls' },
  { key: GOVERNANCE_PROPOSAL_LANES.TREASURY, label: 'Treasury' },
] as const;

export function ProposalList({ onCreateProposal, onSelectProposal }: ProposalListProps) {
  const {
    proposalFilter,
    proposalLaneFilter,
    proposalFocusMarketId,
    actorFocusAddress,
    actorFocusRole,
    setProposalFilter,
    setProposalLaneFilter,
    setProposalFocusMarketId,
    clearProposalContext,
    getFilteredProposals,
    isLoading,
    proposals,
    escalations,
    stats,
  } = useGovernanceStore();

  const filteredProposals = getFilteredProposals();
  const resolverAttentionMarkets = useMemo(
    () => escalations.filter((item) =>
      item.stage === 'voting'
      || item.stage === 'dispute_window'
      || item.stage === 'disputed'
      || item.stage === 'committee'
    ),
    [escalations],
  );
  const orderedProposals = useMemo(() => {
    if (proposalLaneFilter !== GOVERNANCE_PROPOSAL_LANES.RESOLVER) {
      return filteredProposals;
    }

    const statusPriority: Record<number, number> = {
      [PROPOSAL_STATUS.ACTIVE]: 0,
      [PROPOSAL_STATUS.PASSED]: 1,
      [PROPOSAL_STATUS.EXECUTED]: 2,
      [PROPOSAL_STATUS.REJECTED]: 3,
      [PROPOSAL_STATUS.VETOED]: 4,
      [PROPOSAL_STATUS.EXPIRED]: 5,
    };

    return [...filteredProposals].sort((a, b) => {
      const statusDelta = (statusPriority[a.status] ?? 99) - (statusPriority[b.status] ?? 99);
      if (statusDelta !== 0) return statusDelta;

      const quorumDelta = b.quorumPercent - a.quorumPercent;
      if (Math.abs(quorumDelta) > 0.01) return quorumDelta;

      const votesDelta = Number(b.totalVotes - a.totalVotes);
      if (votesDelta !== 0) return votesDelta;

      return Number(b.createdAt - a.createdAt);
    });
  }, [filteredProposals, proposalLaneFilter]);
  const resolverSpotlight = proposalLaneFilter === GOVERNANCE_PROPOSAL_LANES.RESOLVER
    ? orderedProposals.slice(0, 3)
    : [];
  const activeFilterLabel = FILTER_OPTIONS.find((opt) => opt.key === proposalFilter)?.label ?? 'All';
  const activeLaneLabel = LANE_OPTIONS.find((opt) => opt.key === proposalLaneFilter)?.label ?? 'All Lanes';
  const liveDisputeProposals = proposals.filter((proposal) =>
    proposal.proposalType === PROPOSAL_TYPES.RESOLVE_DISPUTE
    && (proposal.status === PROPOSAL_STATUS.ACTIVE || proposal.status === PROPOSAL_STATUS.PASSED)
  ).length;
  const liveResolverElections = proposals.filter((proposal) =>
    proposal.proposalType === PROPOSAL_TYPES.RESOLVER_ELECTION
    && (proposal.status === PROPOSAL_STATUS.ACTIVE || proposal.status === PROPOSAL_STATUS.PASSED)
  ).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <Filter className="w-5 h-5 text-brand-400" />
          Proposals
        </h2>
        <button
          onClick={onCreateProposal}
          className="flex items-center gap-1.5 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create Proposal
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-white/[0.06] bg-surface-900/50 p-4">
          <div className="text-[11px] uppercase tracking-[0.18em] text-surface-500">Dispute Lane</div>
          <div className="mt-2 text-2xl font-semibold text-white">{liveDisputeProposals}</div>
          <p className="mt-1 text-xs text-surface-400">Active or timelocked proposals that can override disputed market outcomes.</p>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-surface-900/50 p-4">
          <div className="text-[11px] uppercase tracking-[0.18em] text-surface-500">Resolver Elections</div>
          <div className="mt-2 text-2xl font-semibold text-white">{liveResolverElections}</div>
          <p className="mt-1 text-xs text-surface-400">Governance motions currently shaping the resolver committee and escalation lane.</p>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-surface-900/50 p-4">
          <div className="text-[11px] uppercase tracking-[0.18em] text-surface-500">Emergency Guardians</div>
          <div className="mt-2 text-2xl font-semibold text-white">
            {stats.guardianThreshold > 0 ? `${stats.guardianThreshold}/${stats.guardianAddresses.length || 3}` : '...'}
          </div>
          <p className="mt-1 text-xs text-surface-400">Guardian threshold required to veto malicious proposals or enforce an emergency market pause.</p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1 bg-surface-900/60 p-1 rounded-xl border border-white/[0.06]">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            onClick={() => setProposalFilter(opt.key as typeof proposalFilter)}
            className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              proposalFilter === opt.key
                ? 'bg-brand-500/20 text-brand-300 border border-brand-500/30'
                : 'text-surface-400 hover:text-surface-300 hover:bg-white/[0.03]'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {LANE_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            onClick={() => {
              setProposalLaneFilter(opt.key);
              if (opt.key !== GOVERNANCE_PROPOSAL_LANES.DISPUTE && proposalFocusMarketId) {
                setProposalFocusMarketId(null);
              }
            }}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
              proposalLaneFilter === opt.key
                ? 'bg-brand-500/20 text-brand-300 border border-brand-500/30'
                : 'border border-white/[0.06] bg-surface-900/60 text-surface-400 hover:text-surface-300 hover:bg-white/[0.03]'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {proposalFocusMarketId && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-500/20 bg-brand-500/8 px-4 py-3 text-sm text-brand-100">
          <div>
            <div className="font-medium">Focused on disputed market</div>
            <div className="mt-1 text-xs text-brand-200/90">
              Showing {filteredProposals.length} proposal{filteredProposals.length === 1 ? '' : 's'} in {activeLaneLabel.toLowerCase()} with {activeFilterLabel.toLowerCase()} status.
            </div>
            <div className="mt-1 font-mono text-xs text-brand-200/80">{proposalFocusMarketId}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {proposalFilter !== 'all' && (
              <button
                onClick={() => setProposalFilter('all')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-brand-500/30 bg-brand-500/10 px-3 py-2 text-xs font-medium text-brand-200 transition-colors hover:bg-brand-500/15"
              >
                Show All Statuses
              </button>
            )}
            <button
              onClick={clearProposalContext}
              className="inline-flex items-center gap-1.5 rounded-lg border border-brand-500/30 bg-brand-500/10 px-3 py-2 text-xs font-medium text-brand-200 transition-colors hover:bg-brand-500/15"
            >
              <X className="w-3.5 h-3.5" />
              Clear Focus
            </button>
          </div>
        </div>
      )}

      {actorFocusAddress && actorFocusRole && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-purple-500/20 bg-purple-500/8 px-4 py-3 text-sm text-purple-100">
          <div>
            <div className="font-medium">Focused on {actorFocusRole} context</div>
            <div className="mt-1 text-xs text-purple-100/80">
              Showing {filteredProposals.length} proposal{filteredProposals.length === 1 ? '' : 's'} in {activeLaneLabel.toLowerCase()} with {activeFilterLabel.toLowerCase()} status that match this actor.
            </div>
            <div className="mt-1 font-mono text-xs text-purple-100/70">{actorFocusAddress}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {proposalFilter !== 'all' && (
              <button
                onClick={() => setProposalFilter('all')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-2 text-xs font-medium text-purple-100 transition-colors hover:bg-purple-500/15"
              >
                Show All Statuses
              </button>
            )}
            <button
              onClick={clearProposalContext}
              className="inline-flex items-center gap-1.5 rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-2 text-xs font-medium text-purple-100 transition-colors hover:bg-purple-500/15"
            >
              <X className="w-3.5 h-3.5" />
              Clear Focus
            </button>
          </div>
        </div>
      )}

      {proposalLaneFilter === GOVERNANCE_PROPOSAL_LANES.RESOLVER && (
        <div className="rounded-2xl border border-purple-500/20 bg-purple-500/8 p-4 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-purple-200/70">Resolver Priority Queue</div>
              <div className="mt-2 text-sm font-semibold text-white">Active elections and committee-relevant motions rise to the top.</div>
              <p className="mt-1 text-xs text-purple-100/70">
                {resolverAttentionMarkets.length > 0
                  ? `${resolverAttentionMarkets.length} live escalation market${resolverAttentionMarkets.length === 1 ? '' : 's'} currently depend on resolver or committee attention.`
                  : 'No live escalation markets need committee attention right now, so resolver motions are ranked by status and participation.'}
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2">
                <div className="text-[11px] uppercase tracking-[0.14em] text-surface-500">Active Elections</div>
                <div className="mt-1 text-lg font-semibold text-white">
                  {orderedProposals.filter((proposal) => proposal.status === PROPOSAL_STATUS.ACTIVE).length}
                </div>
              </div>
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2">
                <div className="text-[11px] uppercase tracking-[0.14em] text-surface-500">Committee Watch</div>
                <div className="mt-1 text-lg font-semibold text-white">{resolverAttentionMarkets.length}</div>
              </div>
            </div>
          </div>

          {resolverSpotlight.length > 0 && (
            <div className="grid gap-3 xl:grid-cols-3">
              {resolverSpotlight.map((proposal, index) => {
                const priorityBadge =
                  proposal.status === PROPOSAL_STATUS.ACTIVE
                    ? 'Election Live'
                    : proposal.status === PROPOSAL_STATUS.PASSED
                      ? 'Timelocked Next'
                      : index === 0
                        ? 'Committee Context'
                        : undefined;

                const contextNote =
                  proposal.status === PROPOSAL_STATUS.ACTIVE
                    ? 'This resolver election is live now and should be reviewed first for committee composition changes.'
                    : proposal.status === PROPOSAL_STATUS.PASSED
                      ? 'This motion already passed and may soon affect the resolver committee after timelock.'
                      : resolverAttentionMarkets.length > 0
                        ? `Committee-related escalation is live across ${resolverAttentionMarkets.length} market${resolverAttentionMarkets.length === 1 ? '' : 's'}, so this resolver motion stays near the top.`
                        : undefined;

                return (
                  <ProposalCard
                    key={`resolver-spotlight-${proposal.proposalId}`}
                    proposal={proposal}
                    index={index}
                    onClick={() => onSelectProposal(proposal.proposalId)}
                    priorityBadge={priorityBadge}
                    contextNote={contextNote}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Proposal Cards */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-surface-500" />
        </div>
      ) : filteredProposals.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-16 text-surface-500"
        >
          <FileQuestion className="w-12 h-12 mb-3 opacity-50" />
          <p className="text-sm">
            {actorFocusAddress
              ? 'No proposals found for this actor focus'
              : proposalFocusMarketId
                ? 'No proposals found for this market lane'
                : 'No proposals found'}
          </p>
          <p className="text-xs mt-1">
            {actorFocusAddress
              ? 'Try showing all statuses or clear the actor focus.'
              : proposalFocusMarketId
              ? 'Try clearing the market focus or switching governance lanes.'
              : 'Be the first to create a governance proposal'}
          </p>
        </motion.div>
      ) : (
        <div className="space-y-3">
          {orderedProposals.map((proposal, i) => {
            const priorityBadge =
              proposalLaneFilter === GOVERNANCE_PROPOSAL_LANES.RESOLVER && i === 0 && proposal.status === PROPOSAL_STATUS.ACTIVE
                ? 'Highest Priority'
                : undefined;

            const contextNote =
              proposalLaneFilter === GOVERNANCE_PROPOSAL_LANES.RESOLVER
              && i === 0
              && resolverAttentionMarkets.length > 0
              && proposal.status !== PROPOSAL_STATUS.ACTIVE
                ? `Resolver escalation lane is active for ${resolverAttentionMarkets.length} market${resolverAttentionMarkets.length === 1 ? '' : 's'}, so this motion is surfaced first.`
                : undefined;

            return (
            <ProposalCard
              key={proposal.proposalId}
              proposal={proposal}
              index={i}
              onClick={() => onSelectProposal(proposal.proposalId)}
              priorityBadge={priorityBadge}
              contextNote={contextNote}
            />
            );
          })}
        </div>
      )}
    </div>
  );
}
