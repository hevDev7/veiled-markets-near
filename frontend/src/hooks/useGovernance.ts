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
  getCommitteeDecision,
  getBlockHeight,
  getGovernanceLiveConfig,
  getVeilTotalSupply,
  getGovernanceMappingValue,
  getResolverProfile,
  formatVeil,
} from '../lib/governance-client';
import { supabase, isSupabaseAvailable } from '../lib/supabase';
import {
  PROPOSAL_TYPES,
  PROPOSAL_STATUS,
  PROPOSAL_TYPE_LABELS,
  type GovernanceEscalationMarket,
  type GovernanceProposal,
  type ProposalType,
  type ProposalStatus,
} from '../lib/governance-types';
import {
  fetchAllMarkets,
  fetchMarketById,
  getMarketDispute,
  getOutcomeLabels,
  getQuestionText,
  MARKET_STATUS,
  TOKEN_SYMBOLS,
} from '../lib/aleo-client';

const POLL_INTERVAL = 30_000; // 30s

export function useGovernance() {
  const { wallet } = useWalletStore();
  const store = useGovernanceStore();
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const fetchGovernanceData = useCallback(async () => {
    store.setIsLoading(true);
    try {
      // 1. Fetch block height from chain
      const height = await getBlockHeight();
      store.setCurrentBlockHeight(height);

      // 2. Fetch VEIL supply from on-chain mapping
      const supply = await getVeilTotalSupply();
      store.setStats({ circulatingSupply: supply });

      const liveConfig = await getGovernanceLiveConfig();
      store.setStats(liveConfig);

      // 3. Check if user is a registered resolver (on-chain)
      if (wallet.address) {
        const resolverProfile = await getResolverProfile(wallet.address);
        store.setResolverProfile(resolverProfile);
      } else {
        store.setResolverProfile(null);
      }

      // 4. Fetch governance_initialized state (verify contract is live)
      await getGovernanceMappingValue<string>('governance_initialized', '0u8');

      let parsedProposals: GovernanceProposal[] = [];

      // 5. Fetch proposals from Supabase (if available)
      if (isSupabaseAvailable() && supabase) {
        try {
          const { data: proposals } = await supabase
            .from('governance_proposals')
            .select('*')
            .order('created_at_ts', { ascending: false })
            .limit(50);

          if (proposals && proposals.length > 0) {
            parsedProposals = proposals.map(parseSupabaseProposal);
            store.setProposals(parsedProposals);
            updateStats(parsedProposals, store);
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
        } else {
          store.setUnclaimedRewards([]);
        }
      } else {
        store.setProposals([]);
        store.setUnclaimedRewards([]);
      }

      const escalations = await fetchGovernanceEscalations(parsedProposals);
      store.setEscalations(escalations);

      // 7. Set VEIL balance from wallet's actual ALEO balance
      // Governance uses ALEO credits for staking/voting
      if (wallet.isDemoMode) {
        store.setVeilBalance(12450_000000n);
        store.setVotingPower(15650_000000n);
      } else if (wallet.connected) {
        // Use real wallet balance (public + private ALEO)
        const { useWalletStore } = await import('../lib/store');
        const walletState = useWalletStore.getState().wallet;
        const totalBalance = walletState.balance.public + walletState.balance.private;
        store.setVeilBalance(totalBalance);
        store.setVotingPower(totalBalance); // Voting power = own balance (+ delegated in future)
      } else {
        store.setVeilBalance(0n);
        store.setVotingPower(0n);
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

async function fetchGovernanceEscalations(
  proposals: GovernanceProposal[],
): Promise<GovernanceEscalationMarket[]> {
  try {
    const chainMarkets = await fetchAllMarkets();
    const candidateMap = new Map(chainMarkets
      .filter(({ market }) =>
        market.status === MARKET_STATUS.PENDING_RESOLUTION
        || market.status === MARKET_STATUS.PENDING_FINALIZATION
        || market.status === MARKET_STATUS.DISPUTED
      )
      .map((entry) => [entry.market.id, entry]));

    const communityProposalByMarket = new Map<string, GovernanceProposal>();
    for (const proposal of proposals) {
      if (proposal.proposalType !== PROPOSAL_TYPES.RESOLVE_DISPUTE) continue;
      if (!proposal.target.endsWith('field')) continue;
      if (!communityProposalByMarket.has(proposal.target)) {
        communityProposalByMarket.set(proposal.target, proposal);
      }
      if (!candidateMap.has(proposal.target)) {
        const fetched = await fetchMarketById(proposal.target);
        if (fetched) candidateMap.set(proposal.target, fetched);
      }
    }

    const escalations = await Promise.all(
      Array.from(candidateMap.values()).map(async ({ market, resolution, programId }) => {
        const [dispute, committeeDecision] = await Promise.all([
          getMarketDispute(market.id, programId),
          getCommitteeDecision(market.id),
        ]);

        const communityProposal = communityProposalByMarket.get(market.id);
        const numOutcomes = market.num_outcomes || 2;
        const defaultLabels = numOutcomes === 2
          ? ['Yes', 'No']
          : Array.from({ length: numOutcomes }, (_, i) => `Outcome ${i + 1}`);
        const outcomeLabels = (getOutcomeLabels(market.id) || getOutcomeLabels(market.question_hash) || defaultLabels).slice(0, numOutcomes);
        const question = getQuestionText(market.question_hash) || getQuestionText(market.id) || `Market ${market.id.slice(0, 10)}...`;

        let stage: GovernanceEscalationMarket['stage'] = 'resolved';
        if (market.status === MARKET_STATUS.CANCELLED) {
          stage = 'cancelled';
        } else if (communityProposal && communityProposal.status !== PROPOSAL_STATUS.REJECTED && communityProposal.status !== PROPOSAL_STATUS.VETOED && communityProposal.status !== PROPOSAL_STATUS.EXPIRED) {
          stage = 'community';
        } else if (committeeDecision) {
          stage = 'committee';
        } else if (dispute) {
          stage = 'disputed';
        } else if (market.status === MARKET_STATUS.PENDING_FINALIZATION) {
          stage = 'dispute_window';
        } else if (market.status === MARKET_STATUS.PENDING_RESOLUTION) {
          stage = 'voting';
        } else if (market.status === MARKET_STATUS.RESOLVED) {
          stage = 'resolved';
        }

        return {
          marketId: market.id,
          question,
          tokenType: (TOKEN_SYMBOLS[market.token_type] || 'ALEO') as 'ALEO' | 'USDCX' | 'USAD',
          programId,
          resolverAddress: resolution?.proposer || resolution?.resolver || market.resolver || undefined,
          marketStatus: market.status,
          stage,
          outcomeLabels,
          currentOutcome: resolution?.proposed_outcome || resolution?.winning_outcome || undefined,
          disputeOutcome: dispute?.proposed_outcome || undefined,
          committeeOutcome: committeeDecision?.outcome || undefined,
          totalVoters: resolution?.round || 0,
          totalBonded: resolution?.total_bonded || 0n,
          challengeDeadline: resolution?.challenge_deadline,
          disputer: dispute?.disputer || undefined,
          disputeBond: dispute?.bond_amount || undefined,
          communityProposalId: communityProposal?.proposalId,
          communityProposalStatus: communityProposal?.status,
          committeeDecisionFinalized: committeeDecision?.finalized,
        } satisfies GovernanceEscalationMarket;
      }),
    );

    const stageOrder: Record<GovernanceEscalationMarket['stage'], number> = {
      community: 0,
      committee: 1,
      disputed: 2,
      dispute_window: 3,
      voting: 4,
      resolved: 5,
      cancelled: 6,
    };

    return escalations.sort((a, b) => {
      const stageDiff = stageOrder[a.stage] - stageOrder[b.stage];
      if (stageDiff !== 0) return stageDiff;
      return a.question.localeCompare(b.question);
    });
  } catch (error) {
    console.warn('[governance] Failed to fetch escalation data:', error);
    return [];
  }
}

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
  const totalStakedInVotes = proposals
    .filter((proposal) => proposal.status === PROPOSAL_STATUS.ACTIVE || proposal.status === PROPOSAL_STATUS.PASSED)
    .reduce((sum, proposal) => sum + proposal.totalVotes, 0n);

  store.setStats({
    totalStakedInVotes,
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
