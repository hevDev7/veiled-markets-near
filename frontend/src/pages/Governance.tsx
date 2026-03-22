// ============================================================================
// VEILED GOVERNANCE — Premium Layout
// ============================================================================

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Shield, Users, Vote, Gavel, Building, FileText, Plus } from 'lucide-react';
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

  const [activeTab, setActiveTab] = useState<Tab>('proposals');
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDelegateModal, setShowDelegateModal] = useState(false);

  // === ALL BUSINESS LOGIC PRESERVED EXACTLY ===

  const handleCreateProposal = useCallback(async (data: ProposalFormData) => {
    governance.setIsCreatingProposal(true);
    try {
      const nonce = BigInt(Date.now());
      const { fetchCreditsRecord } = await import('../lib/credits-record');
      const creditsRecord = await fetchCreditsRecord(10_000000);
      if (!creditsRecord) throw new Error('No credits record found. Need at least 10 ALEO private balance to create a proposal.');
      const inputs = buildCreateProposalInputs(creditsRecord, data.proposalType, data.target || '0field', parseAleoInput(data.payload1 || '0'), data.payload2 || '0field', nonce);
      await executeTransaction({ program: config.governanceProgramId, function: 'create_proposal', inputs, fee: 0.5 });
      await governance.refetch();
    } finally { governance.setIsCreatingProposal(false); }
  }, [executeTransaction, governance]);

  const handleVote = useCallback(async (proposalId: string, direction: 'for' | 'against', amount: bigint) => {
    governance.setIsVoting(true);
    try {
      const { fetchCreditsRecord } = await import('../lib/credits-record');
      const creditsRecord = await fetchCreditsRecord(Number(amount));
      if (!creditsRecord) throw new Error(`No credits record found. Need at least ${Number(amount) / 1_000000} ALEO private balance to vote.`);
      const inputs = buildVoteInputs(creditsRecord, proposalId, amount);
      await executeTransaction({ program: config.governanceProgramId, function: direction === 'for' ? 'vote_for' : 'vote_against', inputs, fee: 0.3 });
      await governance.refetch();
    } finally { governance.setIsVoting(false); }
  }, [executeTransaction, governance]);

  const handleDelegate = useCallback(async (delegateAddress: string, amount: bigint) => {
    const { fetchCreditsRecord } = await import('../lib/credits-record');
    const creditsRecord = await fetchCreditsRecord(Number(amount));
    if (!creditsRecord) throw new Error(`No credits record found. Need at least ${Number(amount) / 1_000000} ALEO private balance to delegate.`);
    const inputs = buildDelegateInputs(creditsRecord, delegateAddress, amount);
    await executeTransaction({ program: config.governanceProgramId, function: 'delegate_votes', inputs, fee: 0.3 });
    await governance.refetch();
  }, [executeTransaction, governance]);

  const handleClaimReward = useCallback(async (epochId: number, rewardType: 'lp' | 'trading') => {
    await executeTransaction({ program: config.governanceProgramId, function: 'claim_reward', inputs: [`${epochId}u64`, rewardType === 'lp' ? '1u8' : '2u8'], fee: 0.3 });
    await governance.refetch();
  }, [executeTransaction, governance]);

  const handleRegisterResolver = useCallback(async (_tier: ResolverTier) => {
    const { fetchCreditsRecord } = await import('../lib/credits-record');
    const creditsRecord = await fetchCreditsRecord(50_000000);
    if (!creditsRecord) throw new Error('No credits record found with sufficient balance. Need at least 50 ALEO private balance.');
    const inputs = buildRegisterResolverInputs(creditsRecord);
    await executeTransaction({ program: config.governanceProgramId, function: 'register_resolver', inputs, fee: 0.5 });
    await governance.refetch();
  }, [executeTransaction, governance]);

  const handleUpgradeResolver = useCallback(async (_newTier: ResolverTier) => {
    const { fetchCreditsRecord } = await import('../lib/credits-record');
    const creditsRecord = await fetchCreditsRecord(50_000000);
    if (!creditsRecord) throw new Error('No credits record found with sufficient balance.');
    await executeTransaction({ program: config.governanceProgramId, function: 'register_resolver', inputs: [creditsRecord], fee: 0.5 });
    await governance.refetch();
  }, [executeTransaction, governance]);

  const handleDeregisterResolver = useCallback(async () => {
    let receiptRecord: string | null = null;
    try { const { findResolverStakeReceipt } = await import('../lib/record-scanner'); receiptRecord = await findResolverStakeReceipt(); } catch {}
    if (!receiptRecord) {
      const requestRecords = (window as any).__aleoRequestRecords;
      if (requestRecords) {
        try {
          const records = await requestRecords(config.governanceProgramId, true);
          const arr = Array.isArray(records) ? records : (records?.records || []);
          for (const r of arr) { const text = typeof r === 'string' ? r : (r?.plaintext || r?.data || JSON.stringify(r)); if (String(text).includes('stake_amount') && String(text).includes('tier')) { receiptRecord = typeof r === 'string' ? r : (r?.plaintext || JSON.stringify(r)); break; } }
        } catch {}
      }
    }
    if (!receiptRecord) throw new Error('ResolverStakeReceipt record not found. Make sure you are registered as a resolver.');
    await executeTransaction({ program: config.governanceProgramId, function: 'unstake_resolver', inputs: [receiptRecord], fee: 0.3 });
    await governance.refetch();
  }, [executeTransaction, governance]);

  const handleSelectProposal = (proposalId: string) => {
    const proposal = governance.proposals.find(p => p.proposalId === proposalId);
    if (proposal) { governance.setSelectedProposal(proposal); setView('detail'); }
  };

  // === PREMIUM LAYOUT ===

  return (
    <div className="min-h-screen bg-surface-950 flex flex-col">
      <DashboardHeader />

      <main className="flex-1 pt-24 lg:pt-28 pb-20">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">

          {/* Header — Premium style */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
            <h1 className="font-display text-[2.5rem] leading-[1.1] tracking-tight text-white mb-2">Governance</h1>
            <p className="text-surface-400">Shape the future of the Veiled protocol</p>
          </motion.div>

          {/* Stats Cards — Premium 4-column grid */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
            className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
            {[
              { label: 'Treasury', value: 'On-Chain', icon: Building, color: '#c9a84c' },
              { label: 'Active Proposals', value: String(governance.proposals.filter(p => p.status === 'active').length), icon: FileText, color: '#00dc82' },
              { label: 'Total Proposals', value: String(governance.proposals.length), icon: Vote, color: '#6366f1' },
              { label: 'Delegates', value: 'Enabled', icon: Users, color: '#3b82f6' },
            ].map((stat, i) => (
              <motion.div key={stat.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 + i * 0.04 }}
                className="glass-card rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${stat.color}10` }}>
                    <stat.icon className="w-4 h-4" style={{ color: stat.color }} />
                  </div>
                </div>
                <p className="text-xl font-heading font-bold text-white tabular-nums">{stat.value}</p>
                <p className="text-xs text-surface-500 mt-0.5">{stat.label}</p>
              </motion.div>
            ))}
          </motion.div>

          {/* Tabs — Premium pill style */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.02] border border-white/[0.04]">
              <button
                onClick={() => { setActiveTab('proposals'); setView('list'); }}
                className={`flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  activeTab === 'proposals' ? 'bg-white/[0.06] text-white' : 'text-surface-500 hover:text-surface-300'
                }`}>
                <Vote className="w-4 h-4" />
                Proposals
              </button>
              <button
                onClick={() => setActiveTab('resolver')}
                className={`flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  activeTab === 'resolver' ? 'bg-white/[0.06] text-white' : 'text-surface-500 hover:text-surface-300'
                }`}>
                <Gavel className="w-4 h-4" />
                Resolver
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button onClick={() => setShowDelegateModal(true)}
                className="hidden sm:flex items-center gap-1.5 px-4 py-2.5 bg-white/[0.04] hover:bg-white/[0.06] border border-white/[0.06] text-surface-300 rounded-xl text-sm font-medium transition-all">
                <Users className="w-4 h-4" /> Delegate
              </button>
              <button onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold active:scale-[0.96] transition-all"
                style={{ background: 'linear-gradient(135deg, #c9a84c 0%, #b8922e 100%)', color: '#08090c', boxShadow: '0 2px 8px rgba(201, 168, 76, 0.2)' }}>
                <Plus className="w-4 h-4" /> New Proposal
              </button>
            </div>
          </div>

          {/* Main Content — 2/3 + 1/3 grid */}
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
        </div>
      </main>

      <Footer />

      <CreateProposalModal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} onSubmit={handleCreateProposal} />
      <DelegateModal isOpen={showDelegateModal} onClose={() => setShowDelegateModal(false)} onDelegate={handleDelegate} />
    </div>
  );
}
