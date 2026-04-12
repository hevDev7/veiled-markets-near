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

// 60s poll instead of 30s — heavy fetch (block height + supply + config +
// proposals + rewards + vote locks + escalations + committee members + all
// market mappings × N markets) shouldn't run more often than necessary.
const POLL_INTERVAL = 60_000; // 60s

export function useGovernance() {
  const { wallet } = useWalletStore();
  const store = useGovernanceStore();
  const intervalRef = useRef<ReturnType<typeof setInterval>>();
  // Track whether we've completed at least one fetch. Subsequent polls run
  // "silently" — data still refreshes in the store but isLoading stays false
  // so the loading skeletons in GovernanceHeader / RewardClaimPanel /
  // ProposalList don't flicker every 60 seconds.
  const isFirstLoadRef = useRef(true);
  // Track in-flight transaction actions so background polls can defer until
  // the user finishes their current button click — prevents the data from
  // refreshing mid-interaction and resetting the optimistic UI state.
  const isFetchingRef = useRef(false);

  const fetchGovernanceData = useCallback(async (options: { silent?: boolean } = {}) => {
    if (isFetchingRef.current) {
      // Already a fetch in progress — drop this poll trigger to avoid
      // overlapping requests that double the perceived "refresh".
      return;
    }
    isFetchingRef.current = true;

    // Only show loading skeletons on the very first load. Subsequent
    // background polls update the store invisibly. Pass `silent: false` to
    // force a loading state (e.g. for an explicit "Refresh" button later).
    const showLoading = isFirstLoadRef.current && !options.silent;
    if (showLoading) {
      store.setIsLoading(true);
    }
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
      // Always clear loading + first-load flag + in-flight guard, even if
      // the fetch failed. The user can manually retry via the refetch
      // function returned by the hook.
      if (showLoading) {
        store.setIsLoading(false);
      }
      isFirstLoadRef.current = false;
      isFetchingRef.current = false;
    }
  }, [wallet.connected, wallet.address, wallet.isDemoMode]);

  // Auto-poll with visibility awareness — pauses while the tab is hidden
  // and resumes (with an immediate fetch) when the user returns. Avoids
  // wasting RPC + Supabase quota when the tab is in the background.
  useEffect(() => {
    fetchGovernanceData();

    const startInterval = () => {
      if (intervalRef.current) return;
      intervalRef.current = setInterval(() => {
        fetchGovernanceData();
      }, POLL_INTERVAL);
    };

    const stopInterval = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = undefined;
      }
    };

    const handleVisibility = () => {
      if (document.hidden) {
        stopInterval();
      } else {
        // Tab back in focus — refresh once immediately so user sees fresh
        // data, then resume the interval.
        fetchGovernanceData();
        startInterval();
      }
    };

    if (!document.hidden) {
      startInterval();
    }
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      stopInterval();
      document.removeEventListener('visibilitychange', handleVisibility);
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
    // Active escalations: markets in voting / pre-finalize / disputed states.
    // Note: RESOLVED markets are added below ONLY if they have a non-zero
    // escalation tier (i.e. they passed through governance), so the Disputes
    // tab can show a history of resolved-via-governance markets without
    // polluting it with regular non-disputed resolved markets.
    const candidateMap = new Map(chainMarkets
      .filter(({ market }) =>
        market.status === MARKET_STATUS.PENDING_RESOLUTION
        || market.status === MARKET_STATUS.PENDING_FINALIZATION
        || market.status === MARKET_STATUS.DISPUTED
      )
      .map((entry) => [entry.market.id, entry]));

    // History inclusion: also pull in RESOLVED markets that have governance
    // escalation history (escalation tier > 0). We probe market_escalation_tier
    // for every chain market — cheap mapping reads, parallelized — and only
    // add the market as a candidate if the tier is non-zero.
    const resolvedCandidates = chainMarkets.filter(
      ({ market }) => market.status === MARKET_STATUS.RESOLVED && !candidateMap.has(market.id),
    );
    const resolvedTiers = await Promise.all(
      resolvedCandidates.map((entry) =>
        getMarketEscalationTier(entry.market.id).catch(() => 0).then((tier) => ({ entry, tier })),
      ),
    );
    for (const { entry, tier } of resolvedTiers) {
      if (tier > 0) {
        candidateMap.set(entry.market.id, entry);
      }
    }

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
        // v6 IMPORTANT: terminal market states (CANCELLED, RESOLVED) MUST be
        // checked first. After governance_resolve_aleo flips status to
        // MARKET_STATUS_RESOLVED, the market_escalation_tier mapping still
        // holds the historical tier value (2 for committee path, 3 for
        // community), and committee_decisions still contains the finalized
        // record. Without checking RESOLVED first, the tier check would
        // win and the market would forever appear in 'committee' stage even
        // though it's actually finished.
        //
        // Order of priority:
        //   1. CANCELLED  → cancelled (terminal)
        //   2. RESOLVED   → resolved  (terminal — covers all governance-resolved markets)
        //   3. community proposal active OR tier 3 → community
        //   4. committee finalize OR tier 2 → committee
        //   5. STATUS_DISPUTED → disputed (tier 0, awaiting initiate_escalation)
        //   6. PENDING_FINALIZATION → dispute_window
        //   7. PENDING_RESOLUTION → voting
        let stage: GovernanceEscalationMarket['stage'] = 'resolved';
        if (market.status === MARKET_STATUS.CANCELLED) {
          stage = 'cancelled';
        } else if (market.status === MARKET_STATUS.RESOLVED) {
          // Terminal state — market lifecycle complete. Could have arrived
          // here either via confirm_resolution (no dispute, tier 0) OR via
          // governance_resolve_aleo/usdcx/usad (tier 2 or 3). Either way the
          // market is done, so stage='resolved' regardless of escalationTier.
          stage = 'resolved';
        } else if (communityProposal && communityProposal.status !== PROPOSAL_STATUS.REJECTED && communityProposal.status !== PROPOSAL_STATUS.VETOED && communityProposal.status !== PROPOSAL_STATUS.EXPIRED) {
          stage = 'community';
        } else if (escalationTier === 3) {
          stage = 'community';
        } else if (committeeDecision || escalationTier === 2) {
          stage = 'committee';
        } else if (market.status === MARKET_STATUS.DISPUTED || dispute || disputeStateOnChain) {
          stage = 'disputed';
        } else if (market.status === MARKET_STATUS.PENDING_FINALIZATION) {
          stage = 'dispute_window';
        } else if (market.status === MARKET_STATUS.PENDING_RESOLUTION) {
          stage = 'voting';
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
