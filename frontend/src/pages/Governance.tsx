// ============================================================================
// VEILED GOVERNANCE — Governance Workspace
// ============================================================================

import { useCallback, useState } from 'react';
import { Plus } from 'lucide-react';
import { useGovernance } from '../hooks/useGovernance';
import { useAleoTransaction, type TxStatus } from '../hooks/useAleoTransaction';
import {
  buildCreateProposalInputs,
  buildExecuteGovernanceInputs,
  buildExecuteTreasuryProposalInputs,
  buildFinalizeVoteInputs,
  buildRegisterResolverInputs,
  buildUnlockVoteInputs,
  buildUnstakeResolverInputs,
  buildUpgradeResolverTierInputs,
  buildVetoProposalInputs,
  buildVoteInputs,
  computeGovernanceProposalId,
  getGovernanceMappingValue,
  getGovernanceProposal,
  getVeilPublicBalance,
  hashAddressToField,
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
  type VoteLock,
} from '../lib/governance-types';
import { proposalMatchesActorFocus } from '../lib/governance-store';
import {
  ActorDetailDrawer,
  CreateProposalModal,
  EscalationPanel,
  GovernanceHeader,
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
import {
  markGovernanceRewardClaimed,
  saveGovernanceProposalMetadata,
  saveGovernanceVoteReceipt,
} from '../lib/governance-persistence';

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
  const { executeTransaction, pollTransactionStatus } = useAleoTransaction();
  const governance = useGovernance();
  const { wallet } = useWalletStore();

  const [activeTab, setActiveTab] = useState<Tab>('proposals');
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [activeProposalActionId, setActiveProposalActionId] = useState<string | null>(null);
  const [isClaimingAllRewards, setIsClaimingAllRewards] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const ensurePublicFeeBalance = useCallback(async (requiredFeeAleo: number, actionLabel: string) => {
    if (!wallet.address) {
      throw new Error('Connect your wallet first.');
    }

    const requiredFee = BigInt(Math.round(requiredFeeAleo * 1_000_000));
    let publicBalance = wallet.balance.public;

    if (publicBalance < requiredFee) {
      publicBalance = await getVeilPublicBalance(wallet.address);
    }

    if (publicBalance < requiredFee) {
      const requiredLabel = requiredFeeAleo.toFixed(requiredFeeAleo % 1 === 0 ? 0 : 1);
      const currentLabel = (Number(publicBalance) / 1_000_000).toFixed(6);
      throw new Error(
        `Need at least ${requiredLabel} ALEO public balance to pay the ${actionLabel} fee. `
        + `Current public balance: ${currentLabel} ALEO.`,
      );
    }
  }, [wallet.address, wallet.balance.public]);

  const ensureGovernanceInitialized = useCallback(async () => {
    const initialized = await getGovernanceMappingValue<boolean | string>('governance_initialized', '0u8');
    const isInitialized = initialized === true || String(initialized || '').replace(/"/g, '').trim() === 'true';

    if (!isInitialized) {
      throw new Error(
        'Governance contract is not initialized on-chain yet. '
        + 'Run init_governance from the deployer wallet before creating proposals.',
      );
    }
  }, []);

  const waitForConfirmedTransaction = useCallback(async (
    submittedTxId: string,
    onChainVerify?: () => Promise<boolean>,
  ): Promise<string> => new Promise((resolve, reject) => {
    let settled = false;

    const settle = (status: TxStatus, resolvedTxId?: string) => {
      if (settled) return;
      if (status === 'confirmed') {
        settled = true;
        resolve(resolvedTxId || submittedTxId);
        return;
      }
      if (status === 'failed' || status === 'unknown') {
        settled = true;
        reject(new Error(status === 'failed'
          ? 'Transaction was rejected on-chain.'
          : 'Transaction confirmation timed out. Please refresh governance data shortly.'));
      }
    };

    void pollTransactionStatus(submittedTxId, settle, 30, 10_000, onChainVerify);
  }), [pollTransactionStatus]);

  const handleCreateProposal = useCallback(async (data: ProposalFormData) => {
    governance.setIsCreatingProposal(true);

    try {
      if (!wallet.address) {
        throw new Error('Connect your wallet before creating a proposal.');
      }

      await ensureGovernanceInitialized();
      await ensurePublicFeeBalance(1.5, 'create proposal');

      const nonce = BigInt(Date.now());
      const { fetchCreditsRecord } = await import('../lib/credits-record');
      const creditsRecord = await fetchCreditsRecord(10_000000, wallet.address);
      if (!creditsRecord) {
        throw new Error('No credits record found. Need at least 10 ALEO private balance to create a proposal.');
      }

      const targetField = data.target.trim() || '0field';
      const payload1Value = parseAleoInput(data.payload1.trim() || '0');
      let payload2Field = data.payload2.trim() || '0field';

      if (data.proposalType === PROPOSAL_TYPES.TREASURY) {
        if (!data.recipientAddress?.startsWith('aleo1')) {
          throw new Error('Treasury proposals require a valid recipient address.');
        }

        const recipientHash = await hashAddressToField(data.recipientAddress);
        if (!recipientHash) {
          throw new Error('Failed to hash the treasury recipient address.');
        }
        payload2Field = recipientHash;
      }

      const proposalId = await computeGovernanceProposalId({
        proposer: wallet.address,
        proposalType: data.proposalType,
        target: targetField,
        payload1: payload1Value,
        nonce,
      });

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
        recordIndices: [0],
      });

      if (!result.transactionId) {
        throw new Error('Wallet did not return a governance transaction ID.');
      }

      const confirmedTxId = await waitForConfirmedTransaction(
        result.transactionId,
        proposalId
          ? async () => (await getGovernanceProposal(proposalId)) !== null
          : undefined,
      );

      await saveGovernanceProposalMetadata({
        proposalId: proposalId || `pending_${confirmedTxId}`,
        proposer: wallet.address,
        proposalType: data.proposalType,
        proposalTypeName: data.proposalTypeName,
        title: data.title || `Proposal #${nonce}`,
        description: data.description || '',
        target: targetField,
        payload1: payload1Value.toString(),
        payload2: payload2Field,
        transactionId: confirmedTxId,
        recipientAddress: data.recipientAddress || null,
        createdAtTs: new Date().toISOString(),
        status: PROPOSAL_STATUS.ACTIVE,
      });

      await governance.refetch();
    } finally {
      governance.setIsCreatingProposal(false);
    }
  }, [
    ensureGovernanceInitialized,
    ensurePublicFeeBalance,
    executeTransaction,
    governance,
    waitForConfirmedTransaction,
    wallet.address,
  ]);

  const handleVote = useCallback(async (proposalId: string, direction: 'for' | 'against', amount: bigint) => {
    governance.setIsVoting(true);

    try {
      if (!wallet.address) {
        throw new Error('Connect your wallet before voting.');
      }

      await ensurePublicFeeBalance(1.5, 'governance vote');

      const { fetchCreditsRecord } = await import('../lib/credits-record');
      const creditsRecord = await fetchCreditsRecord(Number(amount), wallet.address);
      if (!creditsRecord) {
        throw new Error(`No credits record found. Need at least ${Number(amount) / 1_000000} ALEO private balance to vote.`);
      }

      const inputs = buildVoteInputs(creditsRecord, proposalId, amount);
      const result = await executeTransaction({
        program: config.governanceProgramId,
        function: direction === 'for' ? 'vote_for' : 'vote_against',
        inputs,
        fee: 1.5,
        recordIndices: [0],
      });

      if (!result.transactionId) {
        throw new Error('Wallet did not return a governance vote transaction ID.');
      }

      const confirmedTxId = await waitForConfirmedTransaction(result.transactionId);
      await saveGovernanceVoteReceipt({
        proposalId,
        voter: wallet.address,
        direction,
        amount,
        transactionId: confirmedTxId,
      });

      await governance.refetch();
    } finally {
      governance.setIsVoting(false);
    }
  }, [ensurePublicFeeBalance, executeTransaction, governance, waitForConfirmedTransaction, wallet.address]);

  const claimRewardInternal = useCallback(async (
    epochId: number,
    rewardType: 'lp' | 'trading',
    amount: bigint,
    refetchAfter: boolean,
  ) => {
    await ensurePublicFeeBalance(0.3, 'reward claim');

    const result = await executeTransaction({
      program: config.governanceProgramId,
      function: 'claim_reward',
      inputs: [`${epochId}u64`, rewardType === 'lp' ? '1u8' : '2u8', `${amount}u64`],
      fee: 0.3,
    });

    if (!result.transactionId) {
      throw new Error('Wallet did not return a reward claim transaction ID.');
    }

    const confirmedTxId = await waitForConfirmedTransaction(result.transactionId);
    if (wallet.address) {
      await markGovernanceRewardClaimed({
        userAddress: wallet.address,
        epochId,
        rewardType,
        claimTxId: confirmedTxId,
      });
    }

    if (refetchAfter) {
      await governance.refetch();
    }
  }, [ensurePublicFeeBalance, executeTransaction, governance, waitForConfirmedTransaction, wallet.address]);

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

  const handleRegisterResolver = useCallback(async (_tier: ResolverTier) => {
    if (!wallet.address) {
      throw new Error('Connect your wallet before registering as a resolver.');
    }

    await ensurePublicFeeBalance(0.5, 'resolver registration');

    const { fetchCreditsRecord } = await import('../lib/credits-record');
    const creditsRecord = await fetchCreditsRecord(50_000000, wallet.address);
    if (!creditsRecord) {
      throw new Error('No credits record found with sufficient balance. Need at least 50 ALEO private balance.');
    }

    const result = await executeTransaction({
      program: config.governanceProgramId,
      function: 'register_resolver',
      inputs: buildRegisterResolverInputs(creditsRecord),
      fee: 0.5,
      recordIndices: [0],
    });

    if (result.transactionId) {
      await waitForConfirmedTransaction(result.transactionId);
    }

    await governance.refetch();
  }, [ensurePublicFeeBalance, executeTransaction, governance, waitForConfirmedTransaction, wallet.address]);

  const handleUpgradeResolver = useCallback(async (_newTier: ResolverTier) => {
    if (!wallet.address) {
      throw new Error('Connect your wallet before upgrading resolver tier.');
    }

    await ensurePublicFeeBalance(0.3, 'resolver upgrade');

    const result = await executeTransaction({
      program: config.governanceProgramId,
      function: 'upgrade_resolver_tier',
      inputs: buildUpgradeResolverTierInputs(wallet.address),
      fee: 0.3,
    });

    if (result.transactionId) {
      await waitForConfirmedTransaction(result.transactionId);
    }

    await governance.refetch();
  }, [ensurePublicFeeBalance, executeTransaction, governance, waitForConfirmedTransaction, wallet.address]);

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

    await ensurePublicFeeBalance(0.3, 'resolver unstake');

    const result = await executeTransaction({
      program: config.governanceProgramId,
      function: 'unstake_resolver',
      inputs: buildUnstakeResolverInputs(receiptRecord, withdrawAmount),
      fee: 0.3,
      recordIndices: [0],
    });

    if (result.transactionId) {
      await waitForConfirmedTransaction(result.transactionId);
    }

    await governance.refetch();
  }, [ensurePublicFeeBalance, executeTransaction, governance, waitForConfirmedTransaction]);

  const runProposalAction = useCallback(async (
    proposal: GovernanceProposal,
    fn: 'finalize_vote' | 'execute_governance' | 'veto_proposal',
    fee: number,
  ) => {
    setActiveProposalActionId(proposal.proposalId);

    try {
      await ensurePublicFeeBalance(fee, fn.replace('_', ' '));

      const inputs =
        fn === 'execute_governance'
          ? buildExecuteGovernanceInputs(proposal)
          : fn === 'finalize_vote'
            ? buildFinalizeVoteInputs(proposal.proposalId)
            : buildVetoProposalInputs(proposal.proposalId);

      const result = await executeTransaction({
        program: config.governanceProgramId,
        function: fn,
        inputs,
        fee,
      });

      if (!result.transactionId) {
        throw new Error('Wallet did not return a governance action transaction ID.');
      }

      const confirmedTxId = await waitForConfirmedTransaction(
        result.transactionId,
        async () => {
          const updated = await getGovernanceProposal(proposal.proposalId);
          if (!updated) return false;
          if (fn === 'finalize_vote') return updated.status !== PROPOSAL_STATUS.ACTIVE;
          if (fn === 'veto_proposal') return updated.status === PROPOSAL_STATUS.VETOED;
          return updated.status === PROPOSAL_STATUS.EXECUTED;
        },
      );

      if (fn === 'execute_governance') {
        await saveGovernanceProposalMetadata({
          proposalId: proposal.proposalId,
          proposer: proposal.proposer,
          proposalType: proposal.proposalType,
          proposalTypeName: proposal.proposalTypeName,
          title: proposal.title,
          description: proposal.description,
          target: proposal.target,
          payload1: proposal.payload1.toString(),
          payload2: proposal.payload2,
          transactionId: proposal.transactionId || null,
          executedTxId: confirmedTxId,
          recipientAddress: proposal.recipientAddress || null,
          status: PROPOSAL_STATUS.EXECUTED,
        });
      }

      await governance.refetch();
    } finally {
      setActiveProposalActionId(null);
    }
  }, [ensurePublicFeeBalance, executeTransaction, governance, waitForConfirmedTransaction]);

  const handleFinalizeProposal = useCallback(async (proposal: GovernanceProposal) => {
    await runProposalAction(proposal, 'finalize_vote', 0.3);
  }, [runProposalAction]);

  const handleExecuteProposal = useCallback(async (proposal: GovernanceProposal) => {
    await runProposalAction(proposal, 'execute_governance', 0.5);
  }, [runProposalAction]);

  const handleExecuteTreasuryProposal = useCallback(async (proposal: GovernanceProposal, recipientAddress: string) => {
    const recipientHash = await hashAddressToField(recipientAddress);
    if (!recipientHash) {
      throw new Error('Failed to hash the treasury recipient address.');
    }

    if (recipientHash !== proposal.payload2) {
      throw new Error('Recipient address does not match the treasury recipient hashed into this proposal.');
    }

    setActiveProposalActionId(proposal.proposalId);
    try {
      await ensurePublicFeeBalance(0.5, 'treasury execution');

      const result = await executeTransaction({
        program: config.governanceProgramId,
        function: 'execute_treasury_proposal',
        inputs: buildExecuteTreasuryProposalInputs(proposal.proposalId, recipientAddress, BigInt(proposal.payload1)),
        fee: 0.5,
      });

      if (!result.transactionId) {
        throw new Error('Wallet did not return a treasury execution transaction ID.');
      }

      const confirmedTxId = await waitForConfirmedTransaction(
        result.transactionId,
        async () => {
          const updated = await getGovernanceProposal(proposal.proposalId);
          return updated?.status === PROPOSAL_STATUS.EXECUTED;
        },
      );

      await saveGovernanceProposalMetadata({
        proposalId: proposal.proposalId,
        proposer: proposal.proposer,
        proposalType: proposal.proposalType,
        proposalTypeName: proposal.proposalTypeName,
        title: proposal.title,
        description: proposal.description,
        target: proposal.target,
        payload1: proposal.payload1.toString(),
        payload2: proposal.payload2,
        transactionId: proposal.transactionId || null,
        executedTxId: confirmedTxId,
        recipientAddress,
        status: PROPOSAL_STATUS.EXECUTED,
      });

      await governance.refetch();
    } finally {
      setActiveProposalActionId(null);
    }
  }, [ensurePublicFeeBalance, executeTransaction, governance, waitForConfirmedTransaction]);

  const handleUnlockVoteLock = useCallback(async (voteLock: VoteLock) => {
    if (!voteLock.recordPlaintext) {
      throw new Error('Vote lock record is unavailable. Refresh governance data and try again.');
    }

    setActiveProposalActionId(voteLock.proposalId);
    try {
      await ensurePublicFeeBalance(0.3, 'vote unlock');

      const result = await executeTransaction({
        program: config.governanceProgramId,
        function: 'unlock_after_vote',
        inputs: buildUnlockVoteInputs(voteLock.recordPlaintext),
        fee: 0.3,
        recordIndices: [0],
      });

      if (!result.transactionId) {
        throw new Error('Wallet did not return an unlock transaction ID.');
      }

      await waitForConfirmedTransaction(result.transactionId);
      await governance.refetch();
    } finally {
      setActiveProposalActionId(null);
    }
  }, [ensurePublicFeeBalance, executeTransaction, governance, waitForConfirmedTransaction]);

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
        <div className="mx-auto max-w-7xl space-y-5 px-4 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-white/[0.06] bg-surface-900/40 p-4 sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-200/80">Veiled Governance</div>
                <h1 className="mt-2 text-2xl font-semibold text-white">Governance</h1>
                <p className="mt-1 text-sm text-surface-400">
                  Proposal voting, resolver ops, rewards, and escalation context are all kept in one compact workspace.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-600"
                >
                  <Plus className="h-4 w-4" />
                  Create Proposal
                </button>
              </div>
            </div>

            {!wallet.connected && (
              <p className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/8 px-4 py-2.5 text-xs text-amber-200">
                Connect a wallet to vote, create proposals, claim rewards, or manage resolver status.
              </p>
            )}
          </div>

          <GovernanceHeader
            onClaimAll={handleClaimAllRewards}
            isClaimingAll={isClaimingAllRewards}
          />

          <div className="rounded-2xl border border-white/[0.06] bg-surface-900/35 overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-white/[0.06] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="flex items-center gap-2">
                {[
                  { key: 'proposals' as const, label: 'Proposals', count: governance.proposals.length },
                  { key: 'resolver' as const, label: 'Resolvers', count: governance.stats.totalResolvers || 0 },
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
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition-colors ${
                      activeTab === tab.key
                        ? 'bg-brand-500/15 text-brand-200'
                        : 'text-surface-400 hover:bg-white/[0.04] hover:text-white'
                    }`}
                  >
                    {tab.label}
                    <span className={`rounded-full px-2 py-0.5 text-[11px] ${
                      activeTab === tab.key
                        ? 'bg-brand-500/15 text-brand-100'
                        : 'bg-white/[0.05] text-surface-500'
                    }`}>
                      {tab.count}
                    </span>
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-surface-500">
                  {activeTab === 'proposals'
                    ? 'Review motions, open details, and act on governance lifecycle steps.'
                    : 'Register, upgrade, or review current resolver standing.'}
                </span>
                <button
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-xs text-surface-400 transition-colors hover:text-white"
                >
                  {sidebarOpen ? 'Hide panels' : 'Show panels'}
                </button>
              </div>
            </div>

            <div className={`grid gap-6 p-4 sm:p-5 ${sidebarOpen ? 'xl:grid-cols-[minmax(0,1fr)_300px]' : ''}`}>
              <div className="min-w-0">
                {activeTab === 'proposals' ? (
                  view === 'detail' && governance.selectedProposal ? (
                    <VotePanel
                      proposal={governance.selectedProposal}
                      onBack={handleBackToList}
                      onVote={handleVote}
                      onFinalize={handleFinalizeProposal}
                      onExecute={handleExecuteProposal}
                      onExecuteTreasury={handleExecuteTreasuryProposal}
                      onVeto={handleVetoProposal}
                      onUnlockVoteLock={handleUnlockVoteLock}
                      isActing={activeProposalActionId === governance.selectedProposal.proposalId}
                    />
                  ) : (
                    <ProposalList
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

      <Footer />
    </div>
  );
}
