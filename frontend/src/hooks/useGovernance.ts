// ============================================================================
// VEILED GOVERNANCE — useGovernance Hook
// ============================================================================
// Fetches governance data from on-chain mappings and Supabase.
// Falls back to on-chain data if Supabase is not available.
// ============================================================================

import { useEffect, useCallback, useRef } from 'react';
import { useWalletStore } from '../lib/store';
import { useGovernanceStore } from '../lib/governance-store';
import {
  getBlockHeight,
  getVeilTotalSupply,
  getGovernanceMappingValue,
  getResolverProfile,
  formatVeil,
} from '../lib/governance-client';
import { supabase, isSupabaseAvailable } from '../lib/supabase';
import {
  PROPOSAL_STATUS,
  PROPOSAL_TYPE_LABELS,
  type GovernanceProposal,
  type ProposalType,
  type ProposalStatus,
} from '../lib/governance-types';

const POLL_INTERVAL = 30_000; // 30s

export function useGovernance() {
  const { wallet } = useWalletStore();
  const store = useGovernanceStore();
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const fetchGovernanceData = useCallback(async () => {
    if (!wallet.connected) return;
    store.setIsLoading(true);
    try {
      // 1. Fetch block height from chain
      const height = await getBlockHeight();
      store.setCurrentBlockHeight(height);

      // 2. Fetch VEIL supply from on-chain mapping
      const supply = await getVeilTotalSupply();
      store.setStats({ circulatingSupply: supply });

      // 3. Check if user is a registered resolver (on-chain)
      if (wallet.address) {
        const resolverProfile = await getResolverProfile(wallet.address);
        store.setResolverProfile(resolverProfile);
      }

      // 4. Fetch governance_initialized state (verify contract is live)
      await getGovernanceMappingValue<string>('governance_initialized', '0u8');

      // 5. Fetch proposals from Supabase (if available)
      if (isSupabaseAvailable() && supabase) {
        try {
          const { data: proposals } = await supabase
            .from('governance_proposals')
            .select('*')
            .order('created_at_ts', { ascending: false })
            .limit(50);

          if (proposals && proposals.length > 0) {
            const parsed: GovernanceProposal[] = proposals.map(parseSupabaseProposal);
            store.setProposals(parsed);
            updateStats(parsed, store);
          }
        } catch {
          // Supabase tables may not exist yet — this is fine
        }

        // 6. Fetch unclaimed rewards
        if (wallet.address) {
          try {
            const { data: rewards } = await supabase
              .from('veil_rewards')
              .select('*')
              .eq('user_address', wallet.address)
              .eq('claimed', false);

            if (rewards) {
              store.setUnclaimedRewards(rewards.map((r: Record<string, unknown>) => ({
                userAddress: String(r.user_address),
                epochId: Number(r.epoch_id),
                rewardType: String(r.reward_type) as 'lp' | 'trading',
                amount: BigInt(String(r.amount || '0')),
                claimed: false,
              })));
            }
          } catch {
            // veil_rewards table may not exist yet
          }
        }
      }

      // 7. Set VEIL balance (demo/placeholder — real balance comes from VEIL token records)
      // In production: scan user's records for VeilToken records and sum amounts
      if (wallet.isDemoMode) {
        store.setVeilBalance(12450_000000n); // Demo: 12,450 VEIL
        store.setVotingPower(15650_000000n); // Demo: 15,650 VEIL (incl. delegated)
      }

    } catch (error) {
      console.error('[governance] Failed to fetch data:', error);
    } finally {
      store.setIsLoading(false);
    }
  }, [wallet.connected, wallet.address, wallet.isDemoMode]);

  // Auto-poll
  useEffect(() => {
    fetchGovernanceData();
    intervalRef.current = setInterval(fetchGovernanceData, POLL_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchGovernanceData]);

  return {
    ...store,
    refetch: fetchGovernanceData,
    formatVeil,
  };
}

// ============================================================================
// Helpers
// ============================================================================

function parseSupabaseProposal(p: Record<string, unknown>): GovernanceProposal {
  const votesFor = BigInt(String(p.votes_for || '0'));
  const votesAgainst = BigInt(String(p.votes_against || '0'));
  const quorumRequired = BigInt(String(p.quorum_required || '0'));
  const totalVotes = votesFor + votesAgainst;
  const totalVotesNum = Number(totalVotes);
  const quorumReqNum = Number(quorumRequired);

  return {
    proposalId: String(p.proposal_id),
    proposer: String(p.proposer),
    proposalType: Number(p.proposal_type) as ProposalType,
    proposalTypeName: String(p.proposal_type_name || PROPOSAL_TYPE_LABELS[Number(p.proposal_type) as ProposalType] || 'Unknown'),
    target: String(p.target || ''),
    payload1: BigInt(String(p.payload_1 || '0')),
    payload2: String(p.payload_2 || ''),
    votesFor,
    votesAgainst,
    quorumRequired,
    createdAt: BigInt(String(p.created_at || '0')),
    votingDeadline: BigInt(String(p.voting_deadline || '0')),
    timelockUntil: BigInt(String(p.timelock_until || '0')),
    status: mapStatusString(String(p.status)) as ProposalStatus,
    title: String(p.title || ''),
    description: String(p.description || ''),
    totalVotes,
    quorumPercent: quorumReqNum > 0 ? Math.min(100, (totalVotesNum / quorumReqNum) * 100) : 0,
    forPercent: totalVotesNum > 0 ? (Number(votesFor) / totalVotesNum) * 100 : 50,
    againstPercent: totalVotesNum > 0 ? (Number(votesAgainst) / totalVotesNum) * 100 : 50,
    isQuorumMet: totalVotes >= quorumRequired,
  };
}

function updateStats(proposals: GovernanceProposal[], store: { setStats: (s: Record<string, unknown>) => void }) {
  store.setStats({
    totalProposals: proposals.length,
    proposalsPassed: proposals.filter(p => p.status === PROPOSAL_STATUS.PASSED).length,
    proposalsExecuted: proposals.filter(p => p.status === PROPOSAL_STATUS.EXECUTED).length,
    proposalsRejected: proposals.filter(p => p.status === PROPOSAL_STATUS.REJECTED).length,
    proposalsVetoed: proposals.filter(p => p.status === PROPOSAL_STATUS.VETOED).length,
  });
}

function mapStatusString(status: string): number {
  switch (status.toLowerCase()) {
    case 'active': return PROPOSAL_STATUS.ACTIVE;
    case 'passed': return PROPOSAL_STATUS.PASSED;
    case 'rejected': return PROPOSAL_STATUS.REJECTED;
    case 'executed': return PROPOSAL_STATUS.EXECUTED;
    case 'vetoed': return PROPOSAL_STATUS.VETOED;
    case 'expired': return PROPOSAL_STATUS.EXPIRED;
    default: return PROPOSAL_STATUS.ACTIVE;
  }
}
