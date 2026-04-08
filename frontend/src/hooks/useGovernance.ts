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
  getCommitteeVoteCount,
  getCommitteeMembers,
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
      // Each fetch is wrapped in .catch() so a single failure (e.g. record
      // scanner CORS error on api.provable.com/scanner/* breaking
      // fetchGovernanceVoteLocks) doesn't tank the entire Promise.all and
      // prevent escalations from being set on the store. Without these
      // fallbacks, ANY one failed call here would cause the whole governance
      // page to render empty — including the escalation list, which is
      // populated below at fetchGovernanceEscalations().
      const [
        height,
        supply,
        liveConfig,
        proposalMetadata,
        walletRewards,
        voteLocks,
      ] = await Promise.all([
        getBlockHeight().catch(err => {
          console.warn('[governance] getBlockHeight failed:', err);
          return 0n;
        }),
        getVeilTotalSupply().catch(err => {
          console.warn('[governance] getVeilTotalSupply failed:', err);
          return 0n;
        }),
        getGovernanceLiveConfig().catch(err => {
          console.warn('[governance] getGovernanceLiveConfig failed:', err);
          return {} as Awaited<ReturnType<typeof getGovernanceLiveConfig>>;
        }),
        listGovernanceProposalMetadata(wallet.address || undefined).catch(err => {
          console.warn('[governance] listGovernanceProposalMetadata failed:', err);
          return [];
        }),
        wallet.address
          ? fetchGovernanceRewards(wallet.address).catch(err => {
              console.warn('[governance] fetchGovernanceRewards failed:', err);
              return [];
            })
          : Promise.resolve([]),
        wallet.address
          ? fetchGovernanceVoteLocks().catch(err => {
              console.warn('[governance] fetchGovernanceVoteLocks failed (record scanner CORS?):', err);
              return [];
            })
          : Promise.resolve([]),
      ]);

      store.setCurrentBlockHeight(height);
      store.setStats({ circulatingSupply: supply });
      store.setStats(liveConfig);
      store.setVoteLocks(voteLocks);

      if (wallet.address) {
        try {
          const resolverProfile = await getResolverProfile(wallet.address);
          store.setResolverProfile(resolverProfile);
        } catch (err) {
          console.warn('[governance] getResolverProfile failed:', err);
          store.setResolverProfile(null);
        }
      } else {
        store.setResolverProfile(null);
      }

      try {
        await getGovernanceMappingValue<string>('governance_initialized', '0u8');
      } catch (err) {
        console.warn('[governance] governance_initialized read failed:', err);
      }

      let parsedProposals: GovernanceProposal[] = [];
      try {
        parsedProposals = await hydrateGovernanceProposals(
          proposalMetadata,
          voteLocks,
          useGovernanceStore.getState().proposals,
        );
      } catch (err) {
        console.warn('[governance] hydrateGovernanceProposals failed:', err);
      }

      store.setProposals(parsedProposals);
      updateStats(parsedProposals, store);
      store.setUnclaimedRewards(walletRewards);

      // Critical: this is what populates the escalation list shown in the
      // EscalationPanel. Wrap in its own try/catch so any failure here does
      // not block the wallet balance updates below.
      try {
        const escalations = await fetchGovernanceEscalations(parsedProposals);
        store.setEscalations(escalations);
      } catch (err) {
        console.warn('[governance] fetchGovernanceEscalations failed:', err);
      }

      // v6: Load registered committee members so EscalationPanel can show
      // the "Cast Committee Vote" button only to wallets that are actually
      // allowed to vote (committee_vote_resolve reverts otherwise).
      try {
        const members = await getCommitteeMembers();
        store.setCommitteeMembers(members);
      } catch (err) {
        console.warn('[governance] getCommitteeMembers failed:', err);
      }

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
        const [dispute, committeeDecision, disputeStateOnChain, escalationTier, committeeVoteCount] = await Promise.all([
          getMarketDispute(market.id, programId),
          getCommitteeDecision(market.id),
          programId
            ? getMarketDisputeState(market.id, programId).catch(() => null as MarketDisputeState | null)
            : Promise.resolve(null as MarketDisputeState | null),
          getMarketEscalationTier(market.id).catch(() => 0),
          getCommitteeVoteCount(market.id).catch(() => 0),
        ]);

        const communityProposal = communityProposalByMarket.get(market.id);
        const numOutcomes = market.num_outcomes || 2;
        const defaultLabels = numOutcomes === 2
          ? ['Yes', 'No']
          : Array.from({ length: numOutcomes }, (_, i) => `Outcome ${i + 1}`);
        const outcomeLabels = (getOutcomeLabels(market.id) || getOutcomeLabels(market.question_hash) || defaultLabels).slice(0, numOutcomes);
        const question = getQuestionText(market.question_hash) || getQuestionText(market.id) || `Market ${market.id.slice(0, 10)}...`;

        // Stage detection — determines which UI badge + which action buttons
        // are rendered in EscalationPanel for the market.
        //
        // v6 IMPORTANT: 'committee' stage covers EVERYTHING under tier 2:
        //   - tier 2 + no votes yet (just escalated)        ← waiting for committee
        //   - tier 2 + votes in progress (1/3, 2/3)        ← waiting for quorum
        //   - tier 2 + committeeDecision.finalized = true  ← ready to apply
        // The old logic only checked `committeeDecision` which meant the UI
        // showed stage='disputed' (with "Initiate Escalation" button still
        // visible) even AFTER initiate_escalation was called. The fix is to
        // also use `escalationTier` from market_escalation_tier mapping —
        // if tier === 2 (or 3), the market has already been escalated.
        let stage: GovernanceEscalationMarket['stage'] = 'resolved';
        if (market.status === MARKET_STATUS.CANCELLED) {
          stage = 'cancelled';
        } else if (communityProposal && communityProposal.status !== PROPOSAL_STATUS.REJECTED && communityProposal.status !== PROPOSAL_STATUS.VETOED && communityProposal.status !== PROPOSAL_STATUS.EXPIRED) {
          stage = 'community';
        } else if (escalationTier === 3) {
          // Tier 3 = community override path (governance proposal active)
          stage = 'community';
        } else if (committeeDecision || escalationTier === 2) {
          // Tier 2 = committee review (with or without finalized decision yet)
          stage = 'committee';
        } else if (market.status === MARKET_STATUS.DISPUTED || dispute || disputeStateOnChain) {
          // v6: STATUS_DISPUTED markets at tier 0 (not yet escalated). Show
          // the "Initiate Escalation" button to move them to tier 2.
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
          committeeVoteCount,
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
