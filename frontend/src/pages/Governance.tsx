// ============================================================================
// VEILED GOVERNANCE — Governance Page
// ============================================================================
// Main governance dashboard: proposals, voting, delegation, rewards, stats,
// and resolver staking
// ============================================================================

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Shield, Users, Vote, Gavel } from 'lucide-react';
import { useGovernance } from '../hooks/useGovernance';
import { useAleoTransaction } from '../hooks/useAleoTransaction';
import { type ResolverTier } from '../lib/governance-types';
import { config } from '../lib/config';
import { buildCreateProposalInputs, buildVoteInputs, buildDelegateInputs, buildRegisterResolverInputs, parseVeilInput as parseAleoInput } from '../lib/governance-client';
import {
  GovernanceHeader,
  ProposalList,
  VotePanel,
  CreateProposalModal,
  DelegateModal,
  GovernanceStats,
  RewardClaimPanel,
  ResolverPanel,
  type ProposalFormData,
} from '../components/governance';
import { DashboardHeader } from '../components/DashboardHeader';
import { Footer } from '../components/Footer';

type Tab = 'proposals' | 'resolver';

export function Governance() {
  const { executeTransaction } = useAleoTransaction();
  const governance = useGovernance();

  // UI State
  const [activeTab, setActiveTab] = useState<Tab>('proposals');
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDelegateModal, setShowDelegateModal] = useState(false);

  // --- Create Proposal (stake ALEO) ---
  const handleCreateProposal = useCallback(async (data: ProposalFormData) => {
    governance.setIsCreatingProposal(true);
    try {
      const nonce = BigInt(Date.now());
      // Fetch credits record with enough for proposal stake (10 ALEO = 10_000000 microcredits)
      const { fetchCreditsRecord } = await import('../lib/credits-record');
      const creditsRecord = await fetchCreditsRecord(10_000000);
      if (!creditsRecord) {
        throw new Error('No credits record found. Need at least 10 ALEO private balance to create a proposal.');
      }

      const inputs = buildCreateProposalInputs(
        creditsRecord,
        data.proposalType,
        data.target || '0field',
        parseAleoInput(data.payload1 || '0'),
        data.payload2 || '0field',
        nonce
      );

      await executeTransaction({
        program: config.governanceProgramId,
        function: 'create_proposal',
        inputs,
        fee: 0.5,
      });

      await governance.refetch();
    } finally {
      governance.setIsCreatingProposal(false);
    }
  }, [executeTransaction, governance]);

  // --- Vote (lock ALEO) ---
  const handleVote = useCallback(async (
    proposalId: string,
    direction: 'for' | 'against',
    amount: bigint
  ) => {
    governance.setIsVoting(true);
    try {
      const { fetchCreditsRecord } = await import('../lib/credits-record');
      const creditsRecord = await fetchCreditsRecord(Number(amount));
      if (!creditsRecord) {
        throw new Error(`No credits record found. Need at least ${Number(amount) / 1_000000} ALEO private balance to vote.`);
      }
      const inputs = buildVoteInputs(creditsRecord, proposalId, amount);

      await executeTransaction({
        program: config.governanceProgramId,
        function: direction === 'for' ? 'vote_for' : 'vote_against',
        inputs,
        fee: 0.3,
      });

      await governance.refetch();
    } finally {
      governance.setIsVoting(false);
    }
  }, [executeTransaction, governance]);

  // --- Delegate (lock ALEO) ---
  const handleDelegate = useCallback(async (delegateAddress: string, amount: bigint) => {
    const { fetchCreditsRecord } = await import('../lib/credits-record');
    const creditsRecord = await fetchCreditsRecord(Number(amount));
    if (!creditsRecord) {
      throw new Error(`No credits record found. Need at least ${Number(amount) / 1_000000} ALEO private balance to delegate.`);
    }
    const inputs = buildDelegateInputs(creditsRecord, delegateAddress, amount);

    await executeTransaction({
      program: config.governanceProgramId,
      function: 'delegate_votes',
      inputs,
      fee: 0.3,
    });

    await governance.refetch();
  }, [executeTransaction, governance]);

  // --- Claim Reward ---
  const handleClaimReward = useCallback(async (epochId: number, rewardType: 'lp' | 'trading') => {
    await executeTransaction({
      program: config.governanceProgramId,
      function: 'claim_reward',
      inputs: [`${epochId}u64`, rewardType === 'lp' ? '1u8' : '2u8'],
      fee: 0.3,
    });

    await governance.refetch();
  }, [executeTransaction, governance]);

  // --- Register Resolver (Stake ALEO) ---
  const handleRegisterResolver = useCallback(async (_tier: ResolverTier) => {
    // Fetch a real credits record with enough ALEO for resolver stake (50 ALEO = 50_000000 microcredits)
    const { fetchCreditsRecord } = await import('../lib/credits-record');
    const creditsRecord = await fetchCreditsRecord(50_000000);
    if (!creditsRecord) {
      throw new Error('No credits record found with sufficient balance. Need at least 50 ALEO private balance.');
    }
    const inputs = buildRegisterResolverInputs(creditsRecord);

    await executeTransaction({
      program: config.governanceProgramId,
      function: 'register_resolver',
      inputs,
      fee: 0.5,
    });

    await governance.refetch();
  }, [executeTransaction, governance]);

  // --- Upgrade Resolver Tier ---
  const handleUpgradeResolver = useCallback(async (_newTier: ResolverTier) => {
    const { fetchCreditsRecord } = await import('../lib/credits-record');
    const creditsRecord = await fetchCreditsRecord(50_000000);
    if (!creditsRecord) {
      throw new Error('No credits record found with sufficient balance.');
    }

    await executeTransaction({
      program: config.governanceProgramId,
      function: 'register_resolver',
      inputs: [creditsRecord],
      fee: 0.5,
    });

    await governance.refetch();
  }, [executeTransaction, governance]);

  // --- Unstake Resolver (v3: returns ALEO credits) ---
  const handleDeregisterResolver = useCallback(async () => {
    // Method 1: Record Scanner (most reliable)
    let receiptRecord: string | null = null;
    try {
      const { findResolverStakeReceipt } = await import('../lib/record-scanner');
      receiptRecord = await findResolverStakeReceipt();
    } catch {
      // fallback below
    }

    // Method 2: Wallet adapter fallback
    if (!receiptRecord) {
      const requestRecords = (window as any).__aleoRequestRecords;
      if (requestRecords) {
        try {
          const records = await requestRecords(config.governanceProgramId, true);
          const arr = Array.isArray(records) ? records : (records?.records || []);
          for (const r of arr) {
            const text = typeof r === 'string' ? r : (r?.plaintext || r?.data || JSON.stringify(r));
            if (String(text).includes('stake_amount') && String(text).includes('tier')) {
              receiptRecord = typeof r === 'string' ? r : (r?.plaintext || JSON.stringify(r));
              break;
            }
          }
        } catch {
          // no records found
        }
      }
    }

    if (!receiptRecord) {
      throw new Error('ResolverStakeReceipt record not found. Make sure you are registered as a resolver.');
    }

    await executeTransaction({
      program: config.governanceProgramId,
      function: 'unstake_resolver',
      inputs: [receiptRecord],
      fee: 0.3,
    });

    await governance.refetch();
  }, [executeTransaction, governance]);

  // --- Select Proposal ---
  const handleSelectProposal = (proposalId: string) => {
    const proposal = governance.proposals.find(p => p.proposalId === proposalId);
    if (proposal) {
      governance.setSelectedProposal(proposal);
      setView('detail');
    }
  };

  return (
    <div className="min-h-screen bg-surface-950 flex flex-col">
      <DashboardHeader />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 pt-24 pb-20 md:pb-6 space-y-6">
        {/* Page Title */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between"
        >
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Shield className="w-6 h-6 text-brand-400" />
              Veiled Governance
            </h1>
            <p className="text-sm text-surface-400 mt-1">
              Govern the protocol with ALEO — stake to vote, delegate power, earn rewards
            </p>
          </div>

          <button
            onClick={() => setShowDelegateModal(true)}
            className="hidden sm:flex items-center gap-1.5 px-4 py-2 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 text-purple-400 rounded-xl text-sm font-medium transition-colors"
          >
            <Users className="w-4 h-4" />
            Delegate
          </button>
        </motion.div>

        {/* Header Stats */}
        <GovernanceHeader />

        {/* Tab Navigation */}
        <div className="flex gap-1 bg-surface-900/60 p-1 rounded-xl border border-surface-700/50">
          <button
            onClick={() => { setActiveTab('proposals'); setView('list'); }}
            className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'proposals'
                ? 'bg-brand-500/20 text-brand-300 border border-brand-500/30'
                : 'text-surface-400 hover:text-surface-300 hover:bg-surface-800/50'
            }`}
          >
            <Vote className="w-4 h-4" />
            Proposals & Voting
          </button>
          <button
            onClick={() => setActiveTab('resolver')}
            className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'resolver'
                ? 'bg-brand-500/20 text-brand-300 border border-brand-500/30'
                : 'text-surface-400 hover:text-surface-300 hover:bg-surface-800/50'
            }`}
          >
            <Gavel className="w-4 h-4" />
            Resolver Staking
          </button>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column */}
          <div className="lg:col-span-2">
            {activeTab === 'proposals' ? (
              view === 'list' ? (
                <ProposalList
                  onCreateProposal={() => setShowCreateModal(true)}
                  onSelectProposal={handleSelectProposal}
                />
              ) : governance.selectedProposal ? (
                <VotePanel
                  proposal={governance.selectedProposal}
                  onBack={() => { setView('list'); governance.setSelectedProposal(null); }}
                  onVote={handleVote}
                />
              ) : null
            ) : (
              <ResolverPanel
                onRegister={handleRegisterResolver}
                onUpgrade={handleUpgradeResolver}
                onDeregister={handleDeregisterResolver}
              />
            )}
          </div>

          {/* Right Column — Rewards & Stats */}
          <div className="space-y-6">
            <RewardClaimPanel onClaimReward={handleClaimReward} />
            <GovernanceStats />
          </div>
        </div>
      </main>

      <Footer />

      {/* Modals */}
      <CreateProposalModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreateProposal}
      />
      <DelegateModal
        isOpen={showDelegateModal}
        onClose={() => setShowDelegateModal(false)}
        onDelegate={handleDelegate}
      />
    </div>
  );
}
