import { useState } from 'react';
import { AlertTriangle, ArrowRight, Gavel, Loader2, Scale, Shield, Vote } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { escalationMatchesActorFocus, useGovernanceStore } from '../../lib/governance-store';
import {
  GOVERNANCE_PROPOSAL_LANES,
  type GovernanceEscalationMarket,
  type GovernanceProposalLane,
  PROPOSAL_STATUS_LABELS,
} from '../../lib/governance-types';
import {
  buildInitiateEscalationAleoInputs,
  buildInitiateEscalationUsdcxInputs,
  buildInitiateEscalationUsadInputs,
  buildCommitteeVoteResolveInputs,
  buildFinalizeCommitteeVoteInputs,
  buildGovernanceResolveAleoInputs,
  buildGovernanceResolveUsdcxInputs,
  buildGovernanceResolveUsadInputs,
  buildSlashResolverInputs,
  formatVeilCompact,
  getGovernanceResolveFunctionName,
  getInitiateEscalationFunctionName,
  ESCALATION_TIER_COMMITTEE,
  ESCALATION_TIER_COMMUNITY,
} from '../../lib/governance-client';
import { useWalletStore } from '../../lib/store';
import { useAleoTransaction } from '../../hooks/useAleoTransaction';
import { config } from '../../lib/config';
import { cn, shortenAddress } from '../../lib/utils';

const STAGE_STYLES = {
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
} as const;

function getOutcomeLabel(labels: string[], outcome?: number): string | null {
  if (!outcome || outcome < 1) return null;
  return labels[outcome - 1] || `Outcome ${outcome}`;
}

function getContextShortcut(item: GovernanceEscalationMarket): { lane: GovernanceProposalLane; label: string } | null {
  if (item.communityProposalId) return null;

  if (item.stage === 'voting' || item.stage === 'dispute_window' || item.stage === 'disputed' || item.stage === 'committee') {
    return { lane: GOVERNANCE_PROPOSAL_LANES.RESOLVER, label: 'Open Resolver Lane' };
  }

  if (item.stage === 'cancelled') {
    return { lane: GOVERNANCE_PROPOSAL_LANES.CONTROLS, label: 'Open Controls Lane' };
  }

  return null;
}

interface EscalationPanelProps {
  onOpenProposal?: (proposalId: string) => void;
  onReviewLane?: (marketId: string) => void;
  onOpenContextLane?: (lane: GovernanceProposalLane) => void;
}

// Admin (deployer) address that holds slash_resolver authority on-chain.
const ADMIN_ADDRESS = 'aleo10tm5ektsr5v7kdc5phs8pha42vrkhe2rlxfl2v979wunhzx07vpqnqplv8';

type EscalationFilterMode = 'active' | 'history' | 'all';

export function EscalationPanel({ onOpenProposal, onReviewLane, onOpenContextLane }: EscalationPanelProps) {
  const navigate = useNavigate();
  const { escalations, currentBlockHeight, actorFocusAddress, actorFocusRole, clearProposalContext, committeeMembers } = useGovernanceStore();
  const { executeTransaction } = useAleoTransaction();
  const { wallet } = useWalletStore();
  const [actionError, setActionError] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  // v6: history toggle so users can see markets that already passed through
  // governance escalation (resolved with escalationTier > 0). Defaults to
  // 'active' so the most actionable markets render first.
  const [filterMode, setFilterMode] = useState<EscalationFilterMode>('active');
  const isAdmin = wallet.address === ADMIN_ADDRESS;

  // Categorize for the toggle counts.
  const activeEscalations = escalations.filter(
    (item) => item.stage !== 'resolved' && item.stage !== 'cancelled',
  );
  const historyEscalations = escalations.filter(
    (item) => (item.stage === 'resolved' || item.stage === 'cancelled') && (item.escalationTier ?? 0) > 0,
  );

  const baseEscalations = filterMode === 'active'
    ? activeEscalations
    : filterMode === 'history'
      ? historyEscalations
      : escalations;

  const filteredEscalations = actorFocusAddress && actorFocusRole
    ? baseEscalations.filter((item) => escalationMatchesActorFocus(item, actorFocusAddress, actorFocusRole))
    : baseEscalations;

  const handleInitiateEscalation = async (marketId: string, tokenType: string | undefined) => {
    setActionError(null);
    setActiveAction(`init-${marketId}`);
    try {
      // v6: split into 3 token-specific transitions, each cross-program calls
      // assert_disputed in the matching market contract.
      const fnName = getInitiateEscalationFunctionName(tokenType);
      if (!fnName) {
        throw new Error(`Unknown token type "${tokenType}" — cannot route initiate_escalation`);
      }
      const inputs =
        fnName === 'initiate_escalation_usdcx'
          ? buildInitiateEscalationUsdcxInputs(marketId)
          : fnName === 'initiate_escalation_usad'
            ? buildInitiateEscalationUsadInputs(marketId)
            : buildInitiateEscalationAleoInputs(marketId);

      await executeTransaction({
        program: config.governanceProgramId,
        function: fnName,
        inputs,
        fee: 0.5,
      });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to initiate escalation');
    } finally {
      setActiveAction(null);
    }
  };

  const handleCommitteeVoteResolve = async (marketId: string, outcome: number) => {
    setActionError(null);
    setActiveAction(`cvote-${marketId}-${outcome}`);
    try {
      // Pre-flight: caller must be in committee_members. Contract reverts
      // otherwise; this client-side check just gives a friendlier error.
      if (!wallet.address) {
        throw new Error('Connect your wallet to cast a committee vote.');
      }
      if (!committeeMembers.includes(wallet.address)) {
        throw new Error(
          'Your wallet is not a registered committee member. Only the 5 addresses set via set_committee_members can vote.'
        );
      }
      await executeTransaction({
        program: config.governanceProgramId,
        function: 'committee_vote_resolve',
        inputs: buildCommitteeVoteResolveInputs(marketId, outcome),
        fee: 0.5,
      });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to cast committee vote');
    } finally {
      setActiveAction(null);
    }
  };

  const handleFinalizeCommitteeVote = async (marketId: string) => {
    setActionError(null);
    setActiveAction(`finalize-${marketId}`);
    try {
      await executeTransaction({
        program: config.governanceProgramId,
        function: 'finalize_committee_vote',
        inputs: buildFinalizeCommitteeVoteInputs(marketId),
        fee: 0.5,
      });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to finalize committee vote');
    } finally {
      setActiveAction(null);
    }
  };

  const handleGovernanceResolve = async (
    marketId: string,
    winningOutcome: number,
    tokenType: string | undefined,
    escalationTier: number | undefined,
  ) => {
    setActionError(null);
    setActiveAction(`resolve-${marketId}`);
    try {
      const fnName = getGovernanceResolveFunctionName(tokenType);
      if (!fnName) {
        throw new Error(`Unknown token type "${tokenType}" — cannot route governance_resolve`);
      }
      // v6 (Bug C): tier must match the on-chain market_escalation_tier mapping.
      // Default to committee=2 if escalationTier is missing (most common case);
      // for community-resolved disputes, escalationTier should be 3.
      const tier = escalationTier === ESCALATION_TIER_COMMUNITY
        ? ESCALATION_TIER_COMMUNITY
        : ESCALATION_TIER_COMMITTEE;

      const inputs =
        fnName === 'governance_resolve_usdcx'
          ? buildGovernanceResolveUsdcxInputs(marketId, winningOutcome, tier)
          : fnName === 'governance_resolve_usad'
            ? buildGovernanceResolveUsadInputs(marketId, winningOutcome, tier)
            : buildGovernanceResolveAleoInputs(marketId, winningOutcome, tier);

      await executeTransaction({
        program: config.governanceProgramId,
        function: fnName,
        inputs,
        fee: 1.0,
      });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to apply governance resolution');
    } finally {
      setActiveAction(null);
    }
  };

  const handleSlashResolver = async (resolverAddress: string, marketId: string) => {
    setActionError(null);
    setActiveAction(`slash-${marketId}`);
    try {
      if (!isAdmin) {
        throw new Error('Only the admin/deployer wallet can slash resolvers (on-chain assertion).');
      }
      await executeTransaction({
        program: config.governanceProgramId,
        function: 'slash_resolver',
        inputs: buildSlashResolverInputs(resolverAddress, marketId),
        fee: 0.5,
      });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to slash resolver');
    } finally {
      setActiveAction(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <Scale className="w-5 h-5 text-brand-400" />
          Market Escalations
        </h2>

        {/* v6: filter toggle so users can switch between active escalations
            and the history of markets that already passed through governance.
            Counts shown inline on each chip so users immediately know how
            many items are in each bucket. */}
        <div className="inline-flex items-center gap-1 rounded-xl border border-white/[0.06] bg-white/[0.02] p-1">
          {([
            { key: 'active' as const, label: 'Active', count: activeEscalations.length },
            { key: 'history' as const, label: 'History', count: historyEscalations.length },
            { key: 'all' as const, label: 'All', count: escalations.length },
          ]).map((opt) => (
            <button
              key={opt.key}
              onClick={() => setFilterMode(opt.key)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                filterMode === opt.key
                  ? 'bg-brand-500/15 text-brand-200'
                  : 'text-surface-400 hover:text-white hover:bg-white/[0.04]',
              )}
            >
              {opt.label}
              <span className={cn(
                'rounded-full px-1.5 py-0.5 text-[10px]',
                filterMode === opt.key
                  ? 'bg-brand-500/15 text-brand-100'
                  : 'bg-white/[0.05] text-surface-500',
              )}>
                {opt.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-surface-900/60 border border-white/[0.06] rounded-xl p-4">
        <p className="text-xs text-surface-400">
          {filterMode === 'history'
            ? 'Markets that already passed through governance escalation. Read-only audit trail — no further actions available.'
            : filterMode === 'all'
              ? 'All escalation candidates including active disputes and resolved-via-governance history.'
              : 'Live on-chain escalation state for markets moving through voter quorum, dispute bonds, committee review, or governance override.'}
        </p>
      </div>

      {actorFocusAddress && actorFocusRole && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-purple-500/20 bg-purple-500/8 px-4 py-3 text-sm text-purple-100">
          <div>
            <div className="font-medium">Focused on {actorFocusRole} escalation context</div>
            <div className="mt-1 text-xs text-purple-100/75">
              Showing {filteredEscalations.length} market escalation{filteredEscalations.length === 1 ? '' : 's'} related to the selected actor context.
            </div>
            <div className="mt-1 font-mono text-xs text-purple-100/70">{actorFocusAddress}</div>
          </div>
          <button
            onClick={clearProposalContext}
            className="inline-flex items-center gap-2 rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-2 text-xs font-medium text-purple-100 transition-colors hover:bg-purple-500/15"
          >
            Clear Focus
          </button>
        </div>
      )}

      {filteredEscalations.length === 0 ? (
        <div className="bg-surface-900/60 border border-white/[0.06] rounded-xl p-5 text-sm text-surface-500">
          {actorFocusAddress
            ? 'No market escalations match the current actor focus.'
            : filterMode === 'history'
              ? 'No governance-resolved markets in history yet. Once a disputed market completes the committee/community resolve flow, it will appear here.'
              : filterMode === 'all'
                ? 'No escalation candidates found on-chain.'
                : 'No active market escalations found on-chain right now.'}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredEscalations.map((item) => {
            const stage = STAGE_STYLES[item.stage];
            const StageIcon = stage.icon;
            const currentOutcomeLabel = getOutcomeLabel(item.outcomeLabels, item.currentOutcome);
            const disputeOutcomeLabel = getOutcomeLabel(item.outcomeLabels, item.disputeOutcome);
            const committeeOutcomeLabel = getOutcomeLabel(item.outcomeLabels, item.committeeOutcome);
            const contextShortcut = getContextShortcut(item);
            const blocksRemaining = item.challengeDeadline && item.challengeDeadline > currentBlockHeight
              ? item.challengeDeadline - currentBlockHeight
              : 0n;

            return (
              <div
                key={item.marketId}
                className="rounded-xl border border-white/[0.06] bg-surface-900/60 p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-white">{item.question}</span>
                      <span className="rounded-full border border-white/[0.08] bg-white/[0.02] px-2 py-0.5 text-[11px] text-surface-400">
                        {item.tokenType}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-surface-500 font-mono">
                      {shortenAddress(item.marketId, 6)}
                    </div>
                  </div>
                  <span className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium', stage.tone)}>
                    <StageIcon className="w-3.5 h-3.5" />
                    {stage.label}
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2 text-xs">
                    {currentOutcomeLabel && (
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-surface-500">Current tally</span>
                        <span className="text-white font-medium">{currentOutcomeLabel}</span>
                      </div>
                    )}
                    {disputeOutcomeLabel && (
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-surface-500">Disputed outcome</span>
                        <span className="text-red-300 font-medium">{disputeOutcomeLabel}</span>
                      </div>
                    )}
                    {committeeOutcomeLabel && (
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-surface-500">Committee outcome</span>
                        <span className="text-purple-300 font-medium">{committeeOutcomeLabel}</span>
                      </div>
                    )}
                    {item.communityProposalId && (
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-surface-500">Override proposal</span>
                        <span className="text-blue-300 font-medium">
                          {item.communityProposalId.slice(0, 8)}...
                          {item.communityProposalStatus !== undefined ? ` · ${PROPOSAL_STATUS_LABELS[item.communityProposalStatus]}` : ''}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-surface-500">Bonded voters</span>
                      <span className="text-white font-medium">{item.totalVoters}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-surface-500">Total bonded</span>
                      <span className="text-white font-medium">{formatVeilCompact(item.totalBonded)}</span>
                    </div>
                    {item.disputer && (
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-surface-500">Disputer</span>
                        <span className="text-white font-medium font-mono">{shortenAddress(item.disputer, 4)}</span>
                      </div>
                    )}
                    {item.disputeBond !== undefined && item.disputeBond > 0n && (
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-surface-500">Dispute bond</span>
                        <span className="text-white font-medium">{formatVeilCompact(item.disputeBond)}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  {item.committeeDecisionFinalized !== undefined && (
                    <div className="flex items-center gap-2 rounded-lg bg-white/[0.02] px-3 py-2 text-xs text-surface-400">
                      <ArrowRight className="w-3.5 h-3.5 text-surface-500" />
                      {item.committeeDecisionFinalized
                        ? 'Committee decision is finalized on-chain.'
                        : 'Committee decision exists but is not yet finalized.'}
                    </div>
                  )}

                  {item.challengeDeadline !== undefined && item.challengeDeadline > 0n ? (
                    <div className="flex items-center gap-2 rounded-lg bg-white/[0.02] px-3 py-2 text-xs text-surface-400">
                      <ArrowRight className="w-3.5 h-3.5 text-surface-500" />
                      {blocksRemaining > 0n
                        ? `${blocksRemaining.toString()} blocks remain before the current lane can advance.`
                        : 'Current deadline passed on-chain; next action can be executed now.'}
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => navigate(`/market/${item.marketId}`)}
                      className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs font-medium text-surface-200 transition-colors hover:bg-white/[0.06]"
                    >
                      Open Market
                    </button>
                    <button
                      onClick={() => onReviewLane?.(item.marketId)}
                      className="inline-flex items-center gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs font-medium text-yellow-200 transition-colors hover:bg-yellow-500/15"
                    >
                      Review Dispute Lane
                    </button>
                    {contextShortcut && (
                      <button
                        onClick={() => onOpenContextLane?.(contextShortcut.lane)}
                        className="inline-flex items-center gap-2 rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-2 text-xs font-medium text-purple-200 transition-colors hover:bg-purple-500/15"
                      >
                        {contextShortcut.label}
                      </button>
                    )}
                    {item.communityProposalId && (
                      <button
                        onClick={() => {
                          const proposalId = item.communityProposalId;
                          if (!proposalId) return;
                          if (onOpenProposal) {
                            onOpenProposal(proposalId);
                            return;
                          }
                          const target = document.getElementById(`proposal-${proposalId}`);
                          target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }}
                        className="inline-flex items-center gap-2 rounded-lg border border-brand-500/30 bg-brand-500/10 px-3 py-2 text-xs font-medium text-brand-200 transition-colors hover:bg-brand-500/15"
                      >
                        Jump to Proposal
                      </button>
                    )}
                  </div>

                  {/* v6 governance escalation status + action buttons */}
                  <div className="border-t border-white/[0.06] pt-3 mt-2">
                    {/* Tier + committee progress banner — shows current state
                        even before any action button is rendered. This is the
                        ONLY visible signal that initiate_escalation has run
                        (escalationTier flips 0 → 2). Without this banner the
                        user can't tell tier 0 vs tier 2 vs tier 3 apart. */}
                    {(item.escalationTier === 2 || item.escalationTier === 3) && (
                      <div className={cn(
                        'mb-3 flex items-center justify-between rounded-lg border px-3 py-2 text-xs',
                        item.escalationTier === 3
                          ? 'border-blue-500/30 bg-blue-500/10 text-blue-200'
                          : 'border-purple-500/30 bg-purple-500/10 text-purple-200',
                      )}>
                        <div className="flex items-center gap-2">
                          <Scale className="w-3.5 h-3.5" />
                          <span className="font-medium">
                            {item.escalationTier === 3
                              ? 'Tier 3 — Community Override'
                              : item.committeeDecisionFinalized
                                ? 'Tier 2 — Committee Decided'
                                : 'Tier 2 — Committee Review'}
                          </span>
                        </div>
                        {item.escalationTier === 2 && (
                          <span className="font-mono text-[11px] text-purple-100/80">
                            Votes: {item.committeeVoteCount ?? 0} / 3 needed
                          </span>
                        )}
                      </div>
                    )}

                    {/* Hint when connected wallet is not a committee member —
                        explains why no "Cast Vote" button shows up. Only
                        renders during tier 2 + not finalized. */}
                    {item.stage === 'committee'
                      && !item.committeeDecisionFinalized
                      && wallet.address
                      && !committeeMembers.includes(wallet.address) && (
                      <div className="mb-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[11px] text-surface-400">
                        Your wallet is not a registered committee member. Only the 5 addresses set via{' '}
                        <code className="text-surface-300">set_committee_members</code> can cast committee votes.
                        Switch wallet to vote, or wait for other members to reach quorum.
                      </div>
                    )}

                    <div className="text-[11px] uppercase tracking-[0.18em] text-surface-500 mb-2">
                      Governance Actions
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {item.stage === 'disputed' && item.escalationTier !== 2 && item.escalationTier !== 3 && (
                        <button
                          onClick={() => handleInitiateEscalation(item.marketId, item.tokenType)}
                          disabled={activeAction === `init-${item.marketId}`}
                          className="inline-flex items-center gap-2 rounded-lg border border-purple-500/40 bg-purple-500/15 px-3 py-2 text-xs font-medium text-purple-100 transition-colors hover:bg-purple-500/25 disabled:opacity-50"
                        >
                          {activeAction === `init-${item.marketId}` ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Scale className="w-3.5 h-3.5" />
                          )}
                          Initiate Escalation → Tier 2
                        </button>
                      )}

                      {/* Cast committee vote — only visible to addresses
                          registered in committee_members mapping. One button
                          per outcome (Yes/No/Outcome 3/Outcome 4) so members
                          can directly choose their vote without an extra
                          modal. Contract enforces 1 vote per member per
                          market via committee_votes mapping check. */}
                      {item.stage === 'committee'
                        && !item.committeeDecisionFinalized
                        && wallet.address
                        && committeeMembers.includes(wallet.address)
                        && item.outcomeLabels.map((label, idx) => {
                          const outcome = idx + 1;
                          const actionKey = `cvote-${item.marketId}-${outcome}`;
                          return (
                            <button
                              key={`cvote-${outcome}`}
                              onClick={() => handleCommitteeVoteResolve(item.marketId, outcome)}
                              disabled={activeAction === actionKey}
                              className="inline-flex items-center gap-2 rounded-lg border border-blue-500/40 bg-blue-500/15 px-3 py-2 text-xs font-medium text-blue-100 transition-colors hover:bg-blue-500/25 disabled:opacity-50"
                            >
                              {activeAction === actionKey ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Vote className="w-3.5 h-3.5" />
                              )}
                              Cast Vote: {label}
                            </button>
                          );
                        })}

                      {item.stage === 'committee' && !item.committeeDecisionFinalized && (
                        <button
                          onClick={() => handleFinalizeCommitteeVote(item.marketId)}
                          disabled={
                            activeAction === `finalize-${item.marketId}`
                            || (item.committeeVoteCount ?? 0) < 3
                          }
                          title={
                            (item.committeeVoteCount ?? 0) < 3
                              ? `Need ${3 - (item.committeeVoteCount ?? 0)} more committee vote${3 - (item.committeeVoteCount ?? 0) === 1 ? '' : 's'} before finalize`
                              : undefined
                          }
                          className="inline-flex items-center gap-2 rounded-lg border border-purple-500/40 bg-purple-500/15 px-3 py-2 text-xs font-medium text-purple-100 transition-colors hover:bg-purple-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {activeAction === `finalize-${item.marketId}` ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Vote className="w-3.5 h-3.5" />
                          )}
                          Finalize Committee Vote
                        </button>
                      )}

                      {/* Apply Resolution — only show when committee decision
                          is finalized AND market is still in DISPUTED state.
                          Hide for terminal states (resolved/cancelled) so the
                          History view doesn't display a stale action button
                          that would revert if clicked. */}
                      {item.committeeOutcome
                        && item.committeeDecisionFinalized
                        && item.stage !== 'resolved'
                        && item.stage !== 'cancelled' && (
                        <button
                          onClick={() =>
                            handleGovernanceResolve(
                              item.marketId,
                              item.committeeOutcome ?? 1,
                              item.tokenType,
                              item.escalationTier,
                            )
                          }
                          disabled={activeAction === `resolve-${item.marketId}`}
                          className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-2 text-xs font-medium text-emerald-100 transition-colors hover:bg-emerald-500/25 disabled:opacity-50"
                        >
                          {activeAction === `resolve-${item.marketId}` ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Shield className="w-3.5 h-3.5" />
                          )}
                          Apply Resolution → {getOutcomeLabel(item.outcomeLabels, item.committeeOutcome) || 'outcome'}
                        </button>
                      )}

                      {/* Admin slash button — show when governance has decided
                          a different outcome than the original voter winner. */}
                      {isAdmin
                        && item.resolverAddress
                        && item.committeeOutcome
                        && item.currentOutcome
                        && item.committeeOutcome !== item.currentOutcome
                        && item.committeeDecisionFinalized && (
                          <button
                            onClick={() =>
                              item.resolverAddress &&
                              handleSlashResolver(item.resolverAddress, item.marketId)
                            }
                            disabled={activeAction === `slash-${item.marketId}`}
                            className="inline-flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/15 px-3 py-2 text-xs font-medium text-red-100 transition-colors hover:bg-red-500/25 disabled:opacity-50"
                          >
                            {activeAction === `slash-${item.marketId}` ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <AlertTriangle className="w-3.5 h-3.5" />
                            )}
                            Slash Resolver
                          </button>
                        )}
                    </div>
                  </div>

                  {actionError && (
                    <div className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                      {actionError}
                    </div>
                  )}

                  <p className="text-[11px] text-surface-500">
                    Market detail opens in read-only mode for viewers. Use the lane shortcuts to jump straight into the governance motions that matter for this escalation stage.
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
