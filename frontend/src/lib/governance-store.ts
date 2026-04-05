// ============================================================================
// VEILED GOVERNANCE — Zustand Store
// ============================================================================
// Manages governance state: proposals, ALEO staking, rewards, delegation
// ============================================================================

import { create } from 'zustand';
import {
  type GovernanceActorRole,
  type GovernanceProposal,
  type GovernanceProposalLane,
  type GovernanceStats,
  type ResolverProfile,
  type Delegation,
  type GovernanceEscalationMarket,
  type UserReward,
  PROPOSAL_STATUS,
  PROPOSAL_TYPES,
} from './governance-types';

// ============================================================================
// Types
// ============================================================================

export interface GovernanceState {
  // VEIL Token
  veilBalance: bigint;
  votingPower: bigint;              // own balance + delegated
  delegatedToOthers: bigint;

  // Proposals
  proposals: GovernanceProposal[];
  selectedProposal: GovernanceProposal | null;
  proposalFilter: 'all' | 'active' | 'passed' | 'executed' | 'rejected';
  proposalLaneFilter: GovernanceProposalLane;
  proposalFocusMarketId: string | null;
  actorFocusAddress: string | null;
  actorFocusRole: GovernanceActorRole | null;

  // Delegation
  delegations: Delegation[];

  // Rewards
  unclaimedRewards: UserReward[];
  totalClaimable: bigint;

  // Resolver
  resolverProfile: ResolverProfile | null;
  escalations: GovernanceEscalationMarket[];

  // Stats
  stats: GovernanceStats;

  // UI State
  isLoading: boolean;
  isVoting: boolean;
  isCreatingProposal: boolean;
  currentBlockHeight: bigint;

  // Actions
  setVeilBalance: (balance: bigint) => void;
  setVotingPower: (power: bigint) => void;
  setProposals: (proposals: GovernanceProposal[]) => void;
  addProposal: (proposal: GovernanceProposal) => void;
  updateProposal: (proposalId: string, updates: Partial<GovernanceProposal>) => void;
  setSelectedProposal: (proposal: GovernanceProposal | null) => void;
  setProposalFilter: (filter: GovernanceState['proposalFilter']) => void;
  setProposalLaneFilter: (filter: GovernanceProposalLane) => void;
  setProposalFocusMarketId: (marketId: string | null) => void;
  setActorFocus: (address: string | null, role: GovernanceActorRole | null) => void;
  clearProposalContext: () => void;
  setDelegations: (delegations: Delegation[]) => void;
  setUnclaimedRewards: (rewards: UserReward[]) => void;
  setResolverProfile: (profile: ResolverProfile | null) => void;
  setEscalations: (escalations: GovernanceEscalationMarket[]) => void;
  setStats: (stats: Partial<GovernanceStats>) => void;
  setIsLoading: (loading: boolean) => void;
  setIsVoting: (voting: boolean) => void;
  setIsCreatingProposal: (creating: boolean) => void;
  setCurrentBlockHeight: (height: bigint) => void;
  getFilteredProposals: () => GovernanceProposal[];
  reset: () => void;
}

// ============================================================================
// Default Stats
// ============================================================================

const defaultStats: GovernanceStats = {
  totalSupply: 0n,
  circulatingSupply: 0n,
  totalStakedInVotes: 0n,
  totalProposals: 0,
  proposalsPassed: 0,
  proposalsRejected: 0,
  proposalsExecuted: 0,
  proposalsVetoed: 0,
  totalVeilDistributedLP: 0n,
  totalVeilDistributedTrading: 0n,
  totalResolvers: 0,
  pauseState: false,
  protocolFeeBps: 50n,
  creatorFeeBps: 50n,
  lpFeeBps: 100n,
  minTradeAmount: 1_000n,
  minLiquidity: 10_000n,
  guardianThreshold: 0,
  guardianAddresses: [],
};

export function getActorFocusMarketIds(
  escalations: GovernanceEscalationMarket[],
  actorAddress: string | null,
  actorRole: GovernanceActorRole | null,
): string[] {
  if (!actorAddress || !actorRole) return [];

  return escalations
    .filter((item) => {
      if (actorRole === 'resolver') {
        return item.resolverAddress === actorAddress;
      }

      return item.stage === 'committee' || item.stage === 'community' || item.stage === 'cancelled';
    })
    .map((item) => item.marketId);
}

export function escalationMatchesActorFocus(
  escalation: GovernanceEscalationMarket,
  actorAddress: string | null,
  actorRole: GovernanceActorRole | null,
): boolean {
  if (!actorAddress || !actorRole) return true;

  if (actorRole === 'resolver') {
    return escalation.resolverAddress === actorAddress;
  }

  return escalation.stage === 'committee' || escalation.stage === 'community' || escalation.stage === 'cancelled';
}

export function proposalMatchesActorFocus(
  proposal: GovernanceProposal,
  actorAddress: string | null,
  actorRole: GovernanceActorRole | null,
  escalations: GovernanceEscalationMarket[],
): boolean {
  if (!actorAddress || !actorRole) return true;

  if (
    proposal.proposer === actorAddress
    || proposal.target === actorAddress
    || proposal.payload2 === actorAddress
  ) {
    return true;
  }

  const actorMarketIds = new Set(getActorFocusMarketIds(escalations, actorAddress, actorRole));
  if (actorMarketIds.has(proposal.target)) {
    return true;
  }

  if (actorRole === 'guardian') {
    return proposal.proposalType === PROPOSAL_TYPES.FEE_CHANGE
      || proposal.proposalType === PROPOSAL_TYPES.PARAMETER
      || proposal.proposalType === PROPOSAL_TYPES.EMERGENCY_PAUSE;
  }

  return false;
}

// ============================================================================
// Store
// ============================================================================

export const useGovernanceStore = create<GovernanceState>((set, get) => ({
  // Initial state
  veilBalance: 0n,
  votingPower: 0n,
  delegatedToOthers: 0n,
  proposals: [],
  selectedProposal: null,
  proposalFilter: 'all',
  proposalLaneFilter: 'all',
  proposalFocusMarketId: null,
  actorFocusAddress: null,
  actorFocusRole: null,
  delegations: [],
  unclaimedRewards: [],
  totalClaimable: 0n,
  resolverProfile: null,
  escalations: [],
  stats: defaultStats,
  isLoading: false,
  isVoting: false,
  isCreatingProposal: false,
  currentBlockHeight: 0n,

  // Actions
  setVeilBalance: (balance) => set({ veilBalance: balance }),
  setVotingPower: (power) => set({ votingPower: power }),
  setProposals: (proposals) => set({ proposals }),

  addProposal: (proposal) => set((state) => ({
    proposals: [proposal, ...state.proposals],
  })),

  updateProposal: (proposalId, updates) => set((state) => ({
    proposals: state.proposals.map((p) =>
      p.proposalId === proposalId ? { ...p, ...updates } : p
    ),
    selectedProposal:
      state.selectedProposal?.proposalId === proposalId
        ? { ...state.selectedProposal, ...updates }
        : state.selectedProposal,
  })),

  setSelectedProposal: (proposal) => set({ selectedProposal: proposal }),
  setProposalFilter: (filter) => set({ proposalFilter: filter }),
  setProposalLaneFilter: (filter) => set({ proposalLaneFilter: filter }),
  setProposalFocusMarketId: (marketId) => set({ proposalFocusMarketId: marketId }),
  setActorFocus: (address, role) => set({ actorFocusAddress: address, actorFocusRole: role }),
  clearProposalContext: () => set({
    proposalLaneFilter: 'all',
    proposalFocusMarketId: null,
    proposalFilter: 'all',
    actorFocusAddress: null,
    actorFocusRole: null,
  }),
  setDelegations: (delegations) => set({ delegations }),

  setUnclaimedRewards: (rewards) => set({
    unclaimedRewards: rewards,
    totalClaimable: rewards.reduce((sum, r) => sum + r.amount, 0n),
  }),

  setResolverProfile: (profile) => set({ resolverProfile: profile }),
  setEscalations: (escalations) => set({ escalations }),

  setStats: (updates) => set((state) => ({
    stats: { ...state.stats, ...updates },
  })),

  setIsLoading: (loading) => set({ isLoading: loading }),
  setIsVoting: (voting) => set({ isVoting: voting }),
  setIsCreatingProposal: (creating) => set({ isCreatingProposal: creating }),
  setCurrentBlockHeight: (height) => set({ currentBlockHeight: height }),

  getFilteredProposals: () => {
    const {
      proposals,
      proposalFilter,
      proposalLaneFilter,
      proposalFocusMarketId,
      actorFocusAddress,
      actorFocusRole,
      escalations,
    } = get();
    let filtered = proposals;

    if (proposalLaneFilter !== 'all') {
      filtered = filtered.filter((proposal) => {
        switch (proposalLaneFilter) {
          case 'dispute':
            return proposal.proposalType === PROPOSAL_TYPES.RESOLVE_DISPUTE;
          case 'resolver':
            return proposal.proposalType === PROPOSAL_TYPES.RESOLVER_ELECTION;
          case 'controls':
            return proposal.proposalType === PROPOSAL_TYPES.FEE_CHANGE
              || proposal.proposalType === PROPOSAL_TYPES.PARAMETER
              || proposal.proposalType === PROPOSAL_TYPES.EMERGENCY_PAUSE;
          case 'treasury':
            return proposal.proposalType === PROPOSAL_TYPES.TREASURY;
          default:
            return true;
        }
      });
    }

    if (proposalFocusMarketId) {
      filtered = filtered.filter((proposal) => proposal.target === proposalFocusMarketId);
    }

    if (actorFocusAddress && actorFocusRole) {
      filtered = filtered.filter((proposal) =>
        proposalMatchesActorFocus(proposal, actorFocusAddress, actorFocusRole, escalations)
      );
    }

    if (proposalFilter === 'all') return filtered;
    const statusMap: Record<string, number> = {
      active: PROPOSAL_STATUS.ACTIVE,
      passed: PROPOSAL_STATUS.PASSED,
      executed: PROPOSAL_STATUS.EXECUTED,
      rejected: PROPOSAL_STATUS.REJECTED,
    };
    const targetStatus = statusMap[proposalFilter];
    return filtered.filter((p) => p.status === targetStatus);
  },

  reset: () => set({
    veilBalance: 0n,
    votingPower: 0n,
    delegatedToOthers: 0n,
    proposals: [],
    selectedProposal: null,
    proposalFilter: 'all',
    proposalLaneFilter: 'all',
    proposalFocusMarketId: null,
    actorFocusAddress: null,
    actorFocusRole: null,
    delegations: [],
    unclaimedRewards: [],
    totalClaimable: 0n,
    resolverProfile: null,
    escalations: [],
    stats: defaultStats,
    isLoading: false,
    isVoting: false,
    isCreatingProposal: false,
  }),
}));
