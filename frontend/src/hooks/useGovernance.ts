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
  getGovernanceProposal,
  getVeilTotalSupply,
  getGovernanceMappingValue,
  getResolverProfile,
  getMarketDisputeState,
  getMarketEscalationTier,
  formatVeil,
  parseVoteLockRecord,
  type MarketDisputeState,
} from '../lib/governance-client';
import {
  PROPOSAL_TYPES,
  PROPOSAL_STATUS,
  type GovernanceEscalationMarket,
  type GovernanceProposal,
  type VoteLock,
} from '../lib/governance-types';
import {
  fetchGovernanceRewards,
  listGovernanceProposalMetadata,
  type GovernanceProposalMetadata,
} from '../lib/governance-persistence';
import {
  fetchAllMarkets,
  fetchMarketById,
  getMarketDispute,
  getOutcomeLabels,
  getQuestionText,
  MARKET_STATUS,
  TOKEN_SYMBOLS,
} from '../lib/aleo-client';
import { findVoteLocks } from '../lib/record-scanner';

const POLL_INTERVAL = 30_000; // 30s

export function useGovernance() {
  const { wallet } = useWalletStore();
  const store = useGovernanceStore();
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const fetchGovernanceData = useCallback(async () => {
    store.setIsLoading(true);
    try {
      const [
        height,
        supply,
        liveConfig,
        proposalMetadata,
        walletRewards,
        voteLocks,
      ] = await Promise.all([
        getBlockHeight(),
        getVeilTotalSupply(),
        getGovernanceLiveConfig(),
        listGovernanceProposalMetadata(wallet.address || undefined),
        wallet.address ? fetchGovernanceRewards(wallet.address) : Promise.resolve([]),
        wallet.address ? fetchGovernanceVoteLocks() : Promise.resolve([]),
      ]);

      store.setCurrentBlockHeight(height);
      store.setStats({ circulatingSupply: supply });
      store.setStats(liveConfig);
      store.setVoteLocks(voteLocks);

      if (wallet.address) {
        const resolverProfile = await getResolverProfile(wallet.address);
        store.setResolverProfile(resolverProfile);
      } else {
        store.setResolverProfile(null);
      }

      await getGovernanceMappingValue<string>('governance_initialized', '0u8');

      const parsedProposals = await hydrateGovernanceProposals(
        proposalMetadata,
        voteLocks,
        useGovernanceStore.getState().proposals,
      );

      store.setProposals(parsedProposals);
      updateStats(parsedProposals, store);
      store.setUnclaimedRewards(walletRewards);

      const escalations = await fetchGovernanceEscalations(parsedProposals);
      store.setEscalations(escalations);

      if (wallet.isDemoMode) {
        store.setVeilBalance(12450_000000n);
        store.setVotingPower(15650_000000n);
      } else if (wallet.connected) {
        const { useWalletStore } = await import('../lib/store');
        const walletState = useWalletStore.getState().wallet;
        const totalBalance = walletState.balance.public + walletState.balance.private;
        store.setVeilBalance(totalBalance);
        store.setVotingPower(totalBalance);
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

async function fetchGovernanceVoteLocks(): Promise<VoteLock[]> {
  try {
    const records = await findVoteLocks();
    return records
      .map((record) => parseVoteLockRecord(record.plaintext, record))
      .filter((lock): lock is VoteLock => lock !== null);
  } catch (error) {
    console.warn('[governance] Failed to fetch vote locks:', error);
    return [];
  }
}

async function hydrateGovernanceProposals(
  metadataEntries: GovernanceProposalMetadata[],
  voteLocks: VoteLock[],
  existingProposals: GovernanceProposal[],
): Promise<GovernanceProposal[]> {
  const metadataMap = new Map<string, GovernanceProposalMetadata>();
  const candidateIds = new Set<string>();

  for (const entry of metadataEntries) {
    if (!entry?.proposalId) continue;
    metadataMap.set(entry.proposalId, entry);
    if (isHydratableProposalId(entry.proposalId)) {
      candidateIds.add(entry.proposalId);
    }
  }

  for (const lock of voteLocks) {
    if (isHydratableProposalId(lock.proposalId)) {
      candidateIds.add(lock.proposalId);
    }
  }

  for (const proposal of existingProposals) {
    if (isHydratableProposalId(proposal.proposalId)) {
      candidateIds.add(proposal.proposalId);
    }
  }

  const hydrated = await Promise.all(
    Array.from(candidateIds).map(async (proposalId) => {
      const onChainProposal = await getGovernanceProposal(proposalId);
      if (!onChainProposal) return null;
      return mergeProposalMetadata(onChainProposal, metadataMap.get(proposalId));
    }),
  );

  return hydrated
    .filter((proposal): proposal is GovernanceProposal => proposal !== null)
    .sort((a, b) => Number(b.createdAt - a.createdAt));
}

function mergeProposalMetadata(
  proposal: GovernanceProposal,
  metadata?: GovernanceProposalMetadata,
): GovernanceProposal {
  if (!metadata) {
    return {
      ...proposal,
      metadataSource: 'chain',
    };
  }

  return {
    ...proposal,
    proposalTypeName: metadata.proposalTypeName || proposal.proposalTypeName,
    title: metadata.title || proposal.title,
    description: metadata.description || proposal.description,
    transactionId: metadata.transactionId ?? proposal.transactionId,
    executedTxId: metadata.executedTxId ?? proposal.executedTxId,
    recipientAddress: metadata.recipientAddress ?? proposal.recipientAddress,
    metadataSource: 'hybrid',
  };
}

function isHydratableProposalId(proposalId: string): boolean {
  return proposalId.endsWith('field') && !proposalId.startsWith('pending_');
}

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
        // v6: Fetch on-chain dispute state from the market contract itself,
        // plus the escalation tier from governance contract.
        const [dispute, committeeDecision, disputeStateOnChain, escalationTier] = await Promise.all([
          getMarketDispute(market.id, programId),
          getCommitteeDecision(market.id),
          programId
            ? getMarketDisputeState(market.id, programId).catch(() => null as MarketDisputeState | null)
            : Promise.resolve(null as MarketDisputeState | null),
          getMarketEscalationTier(market.id).catch(() => 0),
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
        } else if (market.status === MARKET_STATUS.DISPUTED || dispute || disputeStateOnChain) {
          // v6: STATUS_DISPUTED markets always show in disputed stage until
          // governance applies the resolution.
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
          // v6: prefer the persistent dispute state stored in the market contract.
          disputeOutcome: disputeStateOnChain?.proposedOutcome || dispute?.proposed_outcome || undefined,
          committeeOutcome: committeeDecision?.outcome || undefined,
          totalVoters: resolution?.round || 0,
          totalBonded: resolution?.total_bonded || 0n,
          challengeDeadline: resolution?.challenge_deadline,
          disputer: disputeStateOnChain?.disputer || dispute?.disputer || undefined,
          disputeBond: disputeStateOnChain?.disputeBond || dispute?.bond_amount || undefined,
          communityProposalId: communityProposal?.proposalId,
          communityProposalStatus: communityProposal?.status,
          committeeDecisionFinalized: committeeDecision?.finalized,
          // v6 enrichment — these fields are read by EscalationPanel buttons.
          escalationTier,
          finalOutcome: disputeStateOnChain?.finalOutcome || undefined,
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
