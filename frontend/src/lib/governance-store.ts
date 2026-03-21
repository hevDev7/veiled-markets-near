// ============================================================================
// VEILED GOVERNANCE — Zustand Store
// ============================================================================
// Manages governance state: proposals, ALEO staking, rewards, delegation
// ============================================================================

import { create } from 'zustand';
import {
  type GovernanceProposal,
  type GovernanceStats,
  type ResolverProfile,
  type Delegation,
  type UserReward,
  PROPOSAL_STATUS,
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

  // Delegation
  delegations: Delegation[];

  // Rewards
  unclaimedRewards: UserReward[];
  totalClaimable: bigint;

  // Resolver
  resolverProfile: ResolverProfile | null;

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
  setDelegations: (delegations: Delegation[]) => void;
  setUnclaimedRewards: (rewards: UserReward[]) => void;
  setResolverProfile: (profile: ResolverProfile | null) => void;
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
};

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
  delegations: [],
  unclaimedRewards: [],
  totalClaimable: 0n,
  resolverProfile: null,
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
  setDelegations: (delegations) => set({ delegations }),

  setUnclaimedRewards: (rewards) => set({
    unclaimedRewards: rewards,
    totalClaimable: rewards.reduce((sum, r) => sum + r.amount, 0n),
  }),

  setResolverProfile: (profile) => set({ resolverProfile: profile }),

  setStats: (updates) => set((state) => ({
    stats: { ...state.stats, ...updates },
  })),

  setIsLoading: (loading) => set({ isLoading: loading }),
  setIsVoting: (voting) => set({ isVoting: voting }),
  setIsCreatingProposal: (creating) => set({ isCreatingProposal: creating }),
  setCurrentBlockHeight: (height) => set({ currentBlockHeight: height }),

  getFilteredProposals: () => {
    const { proposals, proposalFilter } = get();
    if (proposalFilter === 'all') return proposals;
    const statusMap: Record<string, number> = {
      active: PROPOSAL_STATUS.ACTIVE,
      passed: PROPOSAL_STATUS.PASSED,
      executed: PROPOSAL_STATUS.EXECUTED,
      rejected: PROPOSAL_STATUS.REJECTED,
    };
    const targetStatus = statusMap[proposalFilter];
    return proposals.filter((p) => p.status === targetStatus);
  },

  reset: () => set({
    veilBalance: 0n,
    votingPower: 0n,
    delegatedToOthers: 0n,
    proposals: [],
    selectedProposal: null,
    proposalFilter: 'all',
    delegations: [],
    unclaimedRewards: [],
    totalClaimable: 0n,
    resolverProfile: null,
    stats: defaultStats,
    isLoading: false,
    isVoting: false,
    isCreatingProposal: false,
  }),
}));
