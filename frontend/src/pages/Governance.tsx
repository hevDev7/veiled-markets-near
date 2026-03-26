// ============================================================================
// VEILED GOVERNANCE — Premium Layout
// ============================================================================

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Users, Vote, Gavel, Building, FileText, Plus } from 'lucide-react';
import { useGovernance } from '../hooks/useGovernance';
import { useAleoTransaction } from '../hooks/useAleoTransaction';
import { PROPOSAL_STATUS, type ResolverTier } from '../lib/governance-types';
import { config } from '../lib/config';
import { buildCreateProposalInputs, buildVoteInputs, buildRegisterResolverInputs, parseVeilInput as parseAleoInput } from '../lib/governance-client';
import {
  ProposalList,
  VotePanel,
  CreateProposalModal,
  GovernanceStats,
  RewardClaimPanel,
  ResolverPanel,
  type ProposalFormData,
} from '../components/governance';
import { DashboardHeader } from '../components/DashboardHeader';
import { Footer } from '../components/Footer';
import { useWalletStore } from '../lib/store';

type Tab = 'proposals' | 'resolver';

export function Governance() {
  const { executeTransaction } = useAleoTransaction();
  const governance = useGovernance();
  const { wallet } = useWalletStore();

  const [activeTab, setActiveTab] = useState<Tab>('proposals');
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [showCreateModal, setShowCreateModal] = useState(false);

  // === ALL BUSINESS LOGIC PRESERVED EXACTLY ===

  const handleCreateProposal = useCallback(async (data: ProposalFormData) => {
    governance.setIsCreatingProposal(true);
    try {
      const nonce = BigInt(Date.now());
      const { fetchCreditsRecord } = await import('../lib/credits-record');
      const creditsRecord = await fetchCreditsRecord(10_000000, wallet.address);
      if (!creditsRecord) throw new Error('No credits record found. Need at least 10 ALEO private balance to create a proposal.');

      const targetField = data.target || '0field';
      const payload1Value = parseAleoInput(data.payload1 || '0');
      const payload2Field = data.payload2 || '0field';
      const inputs = buildCreateProposalInputs(creditsRecord, data.proposalType, targetField, payload1Value, payload2Field, nonce);
      const result = await executeTransaction({ program: config.governanceProgramId, function: 'create_proposal', inputs, fee: 1.5 });

      // Only save to Supabase if TX was not rejected
      const isRejected = result?.status === 'Rejected' || result?.error || !result?.transactionId;
      if (result?.transactionId && !isRejected) {
        try {
          const { isSupabaseAvailable, supabase } = await import('../lib/supabase');
          const { getCurrentBlockHeight } = await import('../lib/aleo-client');
          if (isSupabaseAvailable() && supabase) {
            const currentBlock = await getCurrentBlockHeight().catch(() => 0n);
            const VOTING_PERIOD_BLOCKS = 40320n;
            const votingDeadline = currentBlock > 0n ? String(currentBlock + VOTING_PERIOD_BLOCKS) : '0';

            // Compute proposal_id using Aleo SDK BHP256 hash (same as contract)
            let proposalId = '';
            try {
              const sdk = await import('@provablehq/sdk');
              const structStr = `{ proposer: ${wallet.address}, proposal_type: ${data.proposalType}u8, target: ${targetField.endsWith('field') ? targetField : targetField + 'field'}, payload_1: ${payload1Value}u128, nonce: ${nonce}u64 }`;
              console.log('[Governance] Computing BHP256 hash for:', structStr);
              // @provablehq/sdk exposes WASM hash functions
              const hashResult = sdk.Field ? sdk.Field.hashBhp256(structStr) : null;
              if (hashResult) {
                proposalId = hashResult.toString();
                if (!proposalId.endsWith('field')) proposalId += 'field';
                console.log('[Governance] Computed proposal_id:', proposalId);
              }
            } catch (hashErr) {
              console.warn('[Governance] BHP256 hash computation failed:', hashErr);
            }

            // Fallback: scan TX on-chain for field outputs
            if (!proposalId) {
              await new Promise(r => setTimeout(r, 8000));
              try {
                const txResp = await fetch(`${config.rpcUrl}/testnet/transaction/${result.transactionId}`);
                if (txResp.ok) {
                  const txData = await txResp.text();
                  const fieldMatches = txData.match(/(\d{20,})field/g);
                  if (fieldMatches && fieldMatches.length > 0) {
                    proposalId = fieldMatches[fieldMatches.length - 1];
                    console.log('[Governance] Found proposal_id from TX:', proposalId);
                  }
                }
              } catch { /* ignore */ }
            }

            // Last resort
            if (!proposalId) {
              proposalId = `pending_${result.transactionId}`;
              console.warn('[Governance] Could not compute proposal_id — vote requires manual update');
            }
            await supabase.from('governance_proposals').upsert({
              proposal_id: proposalId,
              proposer: wallet.address,
              proposal_type: data.proposalType,
              proposal_type_name: data.proposalTypeName || 'Unknown',
              title: data.title || `Proposal #${nonce}`,
              description: data.description || '',
              target: data.target || '0field',
              payload_1: data.payload1 || '0',
              payload_2: data.payload2 || '0field',
              votes_for: '0',
              votes_against: '0',
              quorum_required: '0',
              status: 1, // ACTIVE
              created_at_ts: new Date().toISOString(),
              voting_deadline: votingDeadline,
              transaction_id: result.transactionId,
            }, { onConflict: 'proposal_id' });
          }
        } catch (e) {
          console.warn('[Governance] Failed to save proposal to Supabase:', e);
        }
      }

      await governance.refetch();
    } finally { governance.setIsCreatingProposal(false); }
  }, [executeTransaction, governance, wallet.address]);

  const handleVote = useCallback(async (proposalId: string, direction: 'for' | 'against', amount: bigint) => {
    governance.setIsVoting(true);
    try {
      const { fetchCreditsRecord } = await import('../lib/credits-record');
      const creditsRecord = await fetchCreditsRecord(Number(amount), wallet.address);
      if (!creditsRecord) throw new Error(`No credits record found. Need at least ${Number(amount) / 1_000000} ALEO private balance to vote.`);
      const inputs = buildVoteInputs(creditsRecord, proposalId, amount);
      await executeTransaction({ program: config.governanceProgramId, function: direction === 'for' ? 'vote_for' : 'vote_against', inputs, fee: 1.5 });
      await governance.refetch();
    } finally { governance.setIsVoting(false); }
  }, [executeTransaction, governance]);

  const handleClaimReward = useCallback(async (epochId: number, rewardType: 'lp' | 'trading', amount: bigint) => {
    if (amount <= 0n) throw new Error('Reward amount must be greater than zero.');
    await executeTransaction({
      program: config.governanceProgramId,
      function: 'claim_reward',
      inputs: [`${epochId}u64`, rewardType === 'lp' ? '1u8' : '2u8', `${amount}u64`],
      fee: 0.3,
    });
    await governance.refetch();
  }, [executeTransaction, governance]);

  const handleRegisterResolver = useCallback(async (_tier: ResolverTier) => {
    const { fetchCreditsRecord } = await import('../lib/credits-record');
    const creditsRecord = await fetchCreditsRecord(50_000000, wallet.address);
    if (!creditsRecord) throw new Error('No credits record found with sufficient balance. Need at least 50 ALEO private balance.');
    const inputs = buildRegisterResolverInputs(creditsRecord);
    await executeTransaction({ program: config.governanceProgramId, function: 'register_resolver', inputs, fee: 0.5 });
    await governance.refetch();
  }, [executeTransaction, governance]);

  const handleUpgradeResolver = useCallback(async (_newTier: ResolverTier) => {
    const { fetchCreditsRecord } = await import('../lib/credits-record');
    const creditsRecord = await fetchCreditsRecord(50_000000, wallet.address);
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

  // === COMING SOON LAYOUT ===

  return (
    <div className="min-h-screen bg-surface-950 flex flex-col">
      <DashboardHeader />

      <main className="flex-1 pt-24 lg:pt-28 pb-20 flex items-center justify-center">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 text-center">

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="w-20 h-20 rounded-2xl bg-brand-500/10 flex items-center justify-center mx-auto mb-6">
              <Building className="w-10 h-10 text-brand-400" />
            </div>
            <h1 className="font-display text-[2.5rem] leading-[1.1] tracking-tight text-white mb-3">Governance</h1>
            <p className="text-xl text-surface-400 mb-6">Coming Soon</p>
            <p className="text-surface-500 text-sm max-w-md mx-auto mb-8">
              On-chain governance with ALEO staking, proposal voting, resolver registry, and treasury management is being finalized. The governance contract is already deployed on testnet.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-lg mx-auto mb-8">
              {[
                { label: 'Proposal Voting', icon: Vote },
                { label: 'ALEO Staking', icon: Gavel },
                { label: 'Resolver Registry', icon: Users },
                { label: 'Treasury Multisig', icon: Building },
                { label: 'Vote Delegation', icon: FileText },
                { label: 'Reward Epochs', icon: Plus },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-2 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                  <item.icon className="w-4 h-4 text-brand-400 flex-shrink-0" />
                  <span className="text-xs text-surface-400">{item.label}</span>
                </div>
              ))}
            </div>

            <p className="text-[10px] text-surface-600 font-mono">
              Contract: {config.governanceProgramId}
            </p>
          </motion.div>

        </div>
      </main>

      <Footer />
    </div>
  );
}
