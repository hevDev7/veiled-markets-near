// ============================================================================
// VEILED GOVERNANCE — Governance Workspace
// ============================================================================

import { useCallback, useState } from 'react';
import { Plus, Vote as VoteIcon } from 'lucide-react';
import { useGovernance } from '../hooks/useGovernance';
import { useAleoTransaction } from '../hooks/useAleoTransaction';
import {
  buildCreateProposalInputs,
  buildDelegateInputs,
  buildExecuteGovernanceInputs,
  buildFinalizeVoteInputs,
  buildRegisterResolverInputs,
  buildUnstakeResolverInputs,
  buildUpgradeResolverTierInputs,
  buildVetoProposalInputs,
  buildVoteInputs,
  parseVeilInput as parseAleoInput,
} from '../lib/governance-client';
import { config } from '../lib/config';
import {
  GOVERNANCE_PROPOSAL_LANES,
  type GovernanceActorRole,
  type GovernanceProposalLane,
  PROPOSAL_STATUS,
  PROPOSAL_TYPES,
  type GovernanceProposal,
  type ResolverTier,
} from '../lib/governance-types';
import { proposalMatchesActorFocus } from '../lib/governance-store';
import {
  ActorDetailDrawer,
  CreateProposalModal,
  DelegateModal,
  EscalationPanel,
  GovernanceStats,
  ProposalList,
  RewardClaimPanel,
  ResolverPanel,
  VotePanel,
  type ProposalFormData,
} from '../components/governance';
import { DashboardHeader } from '../components/DashboardHeader';
import { Footer } from '../components/Footer';
import { useWalletStore } from '../lib/store';
import { devLog } from '../lib/logger';

type Tab = 'proposals' | 'resolver';
type ProposalStatusFilter = 'all' | 'active' | 'passed' | 'executed' | 'rejected';

function pickPreferredProposalFilter(proposals: GovernanceProposal[]): ProposalStatusFilter {
  if (proposals.some((proposal) => proposal.status === PROPOSAL_STATUS.ACTIVE)) return 'active';
  if (proposals.some((proposal) => proposal.status === PROPOSAL_STATUS.PASSED)) return 'passed';
  if (proposals.some((proposal) => proposal.status === PROPOSAL_STATUS.EXECUTED)) return 'executed';
  if (proposals.some((proposal) => proposal.status === PROPOSAL_STATUS.REJECTED)) return 'rejected';
  return 'all';
}

function proposalMatchesLane(proposal: GovernanceProposal, lane: GovernanceProposalLane): boolean {
  switch (lane) {
    case GOVERNANCE_PROPOSAL_LANES.DISPUTE:
      return proposal.proposalType === PROPOSAL_TYPES.RESOLVE_DISPUTE;
    case GOVERNANCE_PROPOSAL_LANES.RESOLVER:
      return proposal.proposalType === PROPOSAL_TYPES.RESOLVER_ELECTION;
    case GOVERNANCE_PROPOSAL_LANES.CONTROLS:
      return proposal.proposalType === PROPOSAL_TYPES.FEE_CHANGE
        || proposal.proposalType === PROPOSAL_TYPES.PARAMETER
        || proposal.proposalType === PROPOSAL_TYPES.EMERGENCY_PAUSE;
    case GOVERNANCE_PROPOSAL_LANES.TREASURY:
      return proposal.proposalType === PROPOSAL_TYPES.TREASURY;
    default:
      return true;
  }
}

export function Governance() {
  const { executeTransaction } = useAleoTransaction();
  const governance = useGovernance();
  const { wallet } = useWalletStore();

  const [activeTab, setActiveTab] = useState<Tab>('proposals');
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDelegateModal, setShowDelegateModal] = useState(false);
  const [activeProposalActionId, setActiveProposalActionId] = useState<string | null>(null);
  const [isClaimingAllRewards, setIsClaimingAllRewards] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleCreateProposal = useCallback(async (data: ProposalFormData) => {
    governance.setIsCreatingProposal(true);

    try {
      if (!wallet.address) {
        throw new Error('Connect your wallet before creating a proposal.');
      }

      const nonce = BigInt(Date.now());
      const { fetchCreditsRecord } = await import('../lib/credits-record');
      const creditsRecord = await fetchCreditsRecord(10_000000, wallet.address);
      if (!creditsRecord) {
        throw new Error('No credits record found. Need at least 10 ALEO private balance to create a proposal.');
      }

      const targetField = data.target.trim() || '0field';
      const payload1Value = parseAleoInput(data.payload1.trim() || '0');
      const payload2Field = data.payload2.trim() || '0field';
      const inputs = buildCreateProposalInputs(
        creditsRecord,
        data.proposalType,
        targetField,
        payload1Value,
        payload2Field,
        nonce,
      );

      const result = await executeTransaction({
        program: config.governanceProgramId,
        function: 'create_proposal',
        inputs,
        fee: 1.5,
      });

      const transactionId = result.transactionId;

      if (transactionId) {
        try {
          const { isSupabaseAvailable, supabase } = await import('../lib/supabase');
          const { getCurrentBlockHeight } = await import('../lib/aleo-client');

          if (isSupabaseAvailable() && supabase) {
            const currentBlock = await getCurrentBlockHeight().catch(() => 0n);
            const votingDeadline = currentBlock > 0n ? String(currentBlock + 40320n) : '0';

            let proposalId = '';
            try {
              const sdk = await import('@provablehq/sdk');
              const structStr = `{ proposer: ${wallet.address}, proposal_type: ${data.proposalType}u8, target: ${targetField.endsWith('field') ? targetField : `${targetField}field`}, payload_1: ${payload1Value}u128, nonce: ${nonce}u64 }`;
              devLog('[Governance] Computing BHP256 hash for:', structStr);
              const hashField = sdk.Field as unknown as { hashBhp256?: (value: string) => { toString: () => string } };
              const hashResult = hashField?.hashBhp256 ? hashField.hashBhp256(structStr) : null;
              if (hashResult) {
                proposalId = hashResult.toString();
                if (!proposalId.endsWith('field')) proposalId += 'field';
              }
            } catch (hashErr) {
              console.warn('[Governance] BHP256 hash computation failed:', hashErr);
            }

            if (!proposalId) {
              await new Promise((resolve) => setTimeout(resolve, 8000));
              try {
                const txResp = await fetch(`${config.rpcUrl}/transaction/${transactionId}`);
                if (txResp.ok) {
                  const txData = await txResp.text();
                  const fieldMatches = txData.match(/(\d{20,})field/g);
                  if (fieldMatches && fieldMatches.length > 0) {
                    proposalId = fieldMatches[fieldMatches.length - 1];
                  }
                }
              } catch {
                // Ignore explorer lookup failures and fall back to a pending ID.
              }
            }

            if (!proposalId) {
              proposalId = `pending_${transactionId}`;
            }

            await supabase.from('governance_proposals').upsert(
              {
                proposal_id: proposalId,
                proposer: wallet.address,
                proposal_type: data.proposalType,
                proposal_type_name: data.proposalTypeName,
                title: data.title || `Proposal #${nonce}`,
                description: data.description || '',
                target: targetField,
                payload_1: data.payload1 || '0',
                payload_2: payload2Field,
                votes_for: '0',
                votes_against: '0',
                quorum_required: '0',
                status: 'active',
                created_at_ts: new Date().toISOString(),
                voting_deadline: votingDeadline,
                transaction_id: transactionId,
              },
              { onConflict: 'proposal_id' },
            );
          }
        } catch (error) {
          console.warn('[Governance] Failed to save proposal metadata:', error);
        }
      }

      await governance.refetch();
    } finally {
      governance.setIsCreatingProposal(false);
    }
  }, [executeTransaction, governance, wallet.address]);

  const handleVote = useCallback(async (proposalId: string, direction: 'for' | 'against', amount: bigint) => {
    governance.setIsVoting(true);

    try {
      if (!wallet.address) {
        throw new Error('Connect your wallet before voting.');
      }

      const { fetchCreditsRecord } = await import('../lib/credits-record');
      const creditsRecord = await fetchCreditsRecord(Number(amount), wallet.address);
      if (!creditsRecord) {
        throw new Error(`No credits record found. Need at least ${Number(amount) / 1_000000} ALEO private balance to vote.`);
      }

      const inputs = buildVoteInputs(creditsRecord, proposalId, amount);
      await executeTransaction({
        program: config.governanceProgramId,
        function: direction === 'for' ? 'vote_for' : 'vote_against',
        inputs,
        fee: 1.5,
      });

      await governance.refetch();
    } finally {
      governance.setIsVoting(false);
    }
  }, [executeTransaction, governance, wallet.address]);

  const claimRewardInternal = useCallback(async (
    epochId: number,
    rewardType: 'lp' | 'trading',
    amount: bigint,
    refetchAfter: boolean,
  ) => {
    await executeTransaction({
      program: config.governanceProgramId,
      function: 'claim_reward',
      inputs: [`${epochId}u64`, rewardType === 'lp' ? '1u8' : '2u8', `${amount}u64`],
      fee: 0.3,
    });

    if (refetchAfter) {
      await governance.refetch();
    }
  }, [executeTransaction, governance]);

  const handleClaimReward = useCallback(async (epochId: number, rewardType: 'lp' | 'trading', amount: bigint) => {
    if (amount <= 0n) {
      throw new Error('Reward amount must be greater than zero.');
    }

    await claimRewardInternal(epochId, rewardType, amount, true);
  }, [claimRewardInternal]);

  const handleClaimAllRewards = useCallback(async () => {
    const rewards = governance.unclaimedRewards;
    if (rewards.length === 0) return;

    setIsClaimingAllRewards(true);
    try {
      for (const reward of rewards) {
        await claimRewardInternal(reward.epochId, reward.rewardType, reward.amount, false);
      }
      await governance.refetch();
    } finally {
      setIsClaimingAllRewards(false);
    }
  }, [claimRewardInternal, governance]);

  const handleDelegateVotes = useCallback(async (delegateAddress: string, amount: bigint) => {
    if (!wallet.address) {
      throw new Error('Connect your wallet before delegating voting power.');
    }

    const { fetchCreditsRecord } = await import('../lib/credits-record');
    const creditsRecord = await fetchCreditsRecord(Number(amount), wallet.address);
    if (!creditsRecord) {
      throw new Error(`No credits record found. Need at least ${Number(amount) / 1_000000} ALEO private balance.`);
    }

    await executeTransaction({
      program: config.governanceProgramId,
      function: 'delegate_votes',
      inputs: buildDelegateInputs(creditsRecord, delegateAddress, amount),
      fee: 0.5,
    });

    await governance.refetch();
  }, [executeTransaction, governance, wallet.address]);

  const handleRegisterResolver = useCallback(async (_tier: ResolverTier) => {
    if (!wallet.address) {
      throw new Error('Connect your wallet before registering as a resolver.');
    }

    const { fetchCreditsRecord } = await import('../lib/credits-record');
    const creditsRecord = await fetchCreditsRecord(50_000000, wallet.address);
    if (!creditsRecord) {
      throw new Error('No credits record found with sufficient balance. Need at least 50 ALEO private balance.');
    }

    await executeTransaction({
      program: config.governanceProgramId,
      function: 'register_resolver',
      inputs: buildRegisterResolverInputs(creditsRecord),
      fee: 0.5,
    });

    await governance.refetch();
  }, [executeTransaction, governance, wallet.address]);

  const handleUpgradeResolver = useCallback(async (_newTier: ResolverTier) => {
    if (!wallet.address) {
      throw new Error('Connect your wallet before upgrading resolver tier.');
    }

    await executeTransaction({
      program: config.governanceProgramId,
      function: 'upgrade_resolver_tier',
      inputs: buildUpgradeResolverTierInputs(wallet.address),
      fee: 0.3,
    });

    await governance.refetch();
  }, [executeTransaction, governance, wallet.address]);

  const handleDeregisterResolver = useCallback(async () => {
    let receiptRecord: string | null = null;

    try {
      const { findResolverStakeReceipt } = await import('../lib/record-scanner');
      receiptRecord = await findResolverStakeReceipt();
    } catch {
      // Fallback to raw wallet record request below.
    }

    if (!receiptRecord) {
      const requestRecords = (window as typeof window & { __aleoRequestRecords?: (...args: unknown[]) => Promise<unknown> }).__aleoRequestRecords;
      if (requestRecords) {
        try {
          const records = await requestRecords(config.governanceProgramId, true);
          const arr = Array.isArray(records) ? records : (records as { records?: unknown[] } | null)?.records || [];
          for (const record of arr) {
            const text = typeof record === 'string'
              ? record
              : JSON.stringify(record);
            if (text.includes('stake_amount') && text.includes('tier')) {
              receiptRecord = typeof record === 'string' ? record : JSON.stringify(record);
              break;
            }
          }
        } catch {
          // Ignore and surface a clean error below.
        }
      }
    }

    if (!receiptRecord) {
      throw new Error('ResolverStakeReceipt record not found. Make sure you are registered as a resolver.');
    }

    const withdrawAmount = governance.resolverProfile?.stakeAmount ?? 0n;
    if (withdrawAmount <= 0n) {
      throw new Error('Resolver stake amount is unavailable. Refresh governance data and try again.');
    }

    await executeTransaction({
      program: config.governanceProgramId,
      function: 'unstake_resolver',
      inputs: buildUnstakeResolverInputs(receiptRecord, withdrawAmount),
      fee: 0.3,
    });

    await governance.refetch();
  }, [executeTransaction, governance]);

  const runProposalAction = useCallback(async (
    proposal: GovernanceProposal,
    fn: 'finalize_vote' | 'execute_governance' | 'veto_proposal',
    fee: number,
  ) => {
    setActiveProposalActionId(proposal.proposalId);

    try {
      const inputs =
        fn === 'execute_governance'
          ? buildExecuteGovernanceInputs(proposal)
          : fn === 'finalize_vote'
            ? buildFinalizeVoteInputs(proposal.proposalId)
            : buildVetoProposalInputs(proposal.proposalId);

      await executeTransaction({
        program: config.governanceProgramId,
        function: fn,
        inputs,
        fee,
      });

      await governance.refetch();
    } finally {
      setActiveProposalActionId(null);
    }
  }, [executeTransaction, governance]);

  const handleFinalizeProposal = useCallback(async (proposal: GovernanceProposal) => {
    await runProposalAction(proposal, 'finalize_vote', 0.3);
  }, [runProposalAction]);

  const handleExecuteProposal = useCallback(async (proposal: GovernanceProposal) => {
    if (proposal.proposalType === PROPOSAL_TYPES.TREASURY) {
      throw new Error('Treasury proposal execution still needs recipient-aware wiring in the UI. Execute this one via CLI for now.');
    }

    await runProposalAction(proposal, 'execute_governance', 0.5);
  }, [runProposalAction]);

  const handleVetoProposal = useCallback(async (proposal: GovernanceProposal) => {
    await runProposalAction(proposal, 'veto_proposal', 0.3);
  }, [runProposalAction]);

  const handleSelectProposal = useCallback((proposalId: string) => {
    const proposal = governance.proposals.find((item) => item.proposalId === proposalId);
    if (!proposal) return;

    governance.setSelectedProposal(proposal);
    setActiveTab('proposals');
    setView('detail');
  }, [governance]);

  const handleReviewDisputeLane = useCallback((marketId: string) => {
    const relatedDisputeProposals = governance.proposals.filter((proposal) =>
      proposal.proposalType === PROPOSAL_TYPES.RESOLVE_DISPUTE && proposal.target === marketId
    );

    governance.setSelectedProposal(null);
    governance.setProposalFilter(pickPreferredProposalFilter(relatedDisputeProposals));
    governance.setProposalLaneFilter(GOVERNANCE_PROPOSAL_LANES.DISPUTE);
    governance.setProposalFocusMarketId(marketId);
    governance.setActorFocus(null, null);
    setActiveTab('proposals');
    setView('list');
  }, [governance]);

  const handleOpenContextLane = useCallback((lane: GovernanceProposalLane) => {
    const laneProposals = governance.proposals.filter((proposal) => proposalMatchesLane(proposal, lane));

    governance.setSelectedProposal(null);
    governance.setProposalFilter(pickPreferredProposalFilter(laneProposals));
    governance.setProposalLaneFilter(lane);
    governance.setProposalFocusMarketId(null);
    governance.setActorFocus(null, null);
    setActiveTab('proposals');
    setView('list');
  }, [governance]);

  const handleFocusActor = useCallback((actorAddress: string, actorRole: GovernanceActorRole) => {
    const actorProposals = governance.proposals.filter((proposal) =>
      proposalMatchesActorFocus(proposal, actorAddress, actorRole, governance.escalations)
    );

    governance.setSelectedProposal(null);
    governance.setProposalFilter(pickPreferredProposalFilter(actorProposals));
    governance.setProposalLaneFilter(GOVERNANCE_PROPOSAL_LANES.ALL);
    governance.setProposalFocusMarketId(null);
    governance.setActorFocus(actorAddress, actorRole);
    setActiveTab('proposals');
    setView('list');
  }, [governance]);

  const handleBackToList = useCallback(() => {
    governance.setSelectedProposal(null);
    setView('list');
  }, [governance]);

  return (
    <div className="min-h-screen bg-surface-950 flex flex-col">
      <DashboardHeader />

      <main className="flex-1 pt-24 lg:pt-28 pb-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          {/* Header — compact */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-xl font-semibold text-white">Governance</h1>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Create Proposal
              </button>
              <button
                onClick={() => setShowDelegateModal(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm font-medium text-surface-300 hover:bg-white/[0.06] transition-colors"
              >
                <VoteIcon className="w-4 h-4 text-purple-400" />
                Delegate
              </button>
            </div>
          </div>

          {!wallet.connected && (
            <p className="rounded-lg border border-amber-500/20 bg-amber-500/8 px-4 py-2.5 text-xs text-amber-200">
              Connect a wallet to vote, create proposals, and claim rewards.
            </p>
          )}

          {/* Tabs + content */}
          <div className="flex items-center gap-2 border-b border-white/[0.06] pb-px">
            {[
              { key: 'proposals' as const, label: 'Proposals' },
              { key: 'resolver' as const, label: 'Resolvers' },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => {
                  setActiveTab(tab.key);
                  if (tab.key !== 'proposals') {
                    setView('list');
                    governance.setSelectedProposal(null);
                  }
                }}
                className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                  activeTab === tab.key
                    ? 'border-brand-400 text-brand-300'
                    : 'border-transparent text-surface-400 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}

            {/* Sidebar toggle — right-aligned */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-xs text-surface-400 hover:text-white transition-colors"
            >
              {sidebarOpen ? 'Hide' : 'Stats'}
            </button>
          </div>

          <div className={`grid gap-6 ${sidebarOpen ? 'xl:grid-cols-[minmax(0,1fr)_280px]' : ''}`}>
            {/* Main content */}
            <div className="min-w-0">
              {activeTab === 'proposals' ? (
                view === 'detail' && governance.selectedProposal ? (
                  <VotePanel
                    proposal={governance.selectedProposal}
                    onBack={handleBackToList}
                    onVote={handleVote}
                    onFinalize={handleFinalizeProposal}
                    onExecute={handleExecuteProposal}
                    onVeto={handleVetoProposal}
                    isActing={activeProposalActionId === governance.selectedProposal.proposalId}
                  />
                ) : (
                  <ProposalList
                    onCreateProposal={() => setShowCreateModal(true)}
                    onSelectProposal={handleSelectProposal}
                  />
                )
              ) : (
                <ResolverPanel
                  onRegister={handleRegisterResolver}
                  onUpgrade={handleUpgradeResolver}
                  onDeregister={handleDeregisterResolver}
                  onFocusActor={handleFocusActor}
                />
              )}
            </div>

            {/* Sidebar — toggle-based, compact */}
            {sidebarOpen && (
              <div className="space-y-3">
                <GovernanceStats />
                <EscalationPanel
                  onOpenProposal={handleSelectProposal}
                  onReviewLane={handleReviewDisputeLane}
                  onOpenContextLane={handleOpenContextLane}
                />
                <RewardClaimPanel
                  onClaimReward={handleClaimReward}
                  onClaimAllRewards={handleClaimAllRewards}
                  isClaimingAll={isClaimingAllRewards}
                />
              </div>
            )}
          </div>
        </div>
      </main>

      <CreateProposalModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreateProposal}
      />

      <ActorDetailDrawer
        onSelectProposal={handleSelectProposal}
        onReviewLane={handleReviewDisputeLane}
        onOpenContextLane={handleOpenContextLane}
      />

      <DelegateModal
        isOpen={showDelegateModal}
        onClose={() => setShowDelegateModal(false)}
        onDelegate={handleDelegateVotes}
      />

      <Footer />
    </div>
  );
}
