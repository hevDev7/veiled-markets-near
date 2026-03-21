// ============================================================================
// VEILED GOVERNANCE — TypeScript Types
// ============================================================================

// --- VEIL Token ---
export interface VeilToken {
  owner: string;
  amount: bigint;
}

export interface VoteLock {
  owner: string;
  proposalId: string;
  amount: bigint;
  unlockAt: bigint;
}

// --- Proposal Types ---
export const PROPOSAL_TYPES = {
  RESOLVE_DISPUTE: 1,
  FEE_CHANGE: 2,
  TREASURY: 3,
  PARAMETER: 4,
  EMERGENCY_PAUSE: 5,
  RESOLVER_ELECTION: 6,
} as const;

export type ProposalType = (typeof PROPOSAL_TYPES)[keyof typeof PROPOSAL_TYPES];

export const PROPOSAL_TYPE_LABELS: Record<ProposalType, string> = {
  [PROPOSAL_TYPES.RESOLVE_DISPUTE]: 'Dispute Resolution',
  [PROPOSAL_TYPES.FEE_CHANGE]: 'Fee Structure Change',
  [PROPOSAL_TYPES.TREASURY]: 'Treasury Withdrawal',
  [PROPOSAL_TYPES.PARAMETER]: 'Parameter Update',
  [PROPOSAL_TYPES.EMERGENCY_PAUSE]: 'Emergency Pause',
  [PROPOSAL_TYPES.RESOLVER_ELECTION]: 'Resolver Election',
};

export const PROPOSAL_TYPE_DESCRIPTIONS: Record<ProposalType, string> = {
  [PROPOSAL_TYPES.RESOLVE_DISPUTE]: 'Override a disputed market resolution via community vote',
  [PROPOSAL_TYPES.FEE_CHANGE]: 'Change protocol, creator, or LP fee rates',
  [PROPOSAL_TYPES.TREASURY]: 'Withdraw funds from the protocol treasury',
  [PROPOSAL_TYPES.PARAMETER]: 'Update governance or market parameters',
  [PROPOSAL_TYPES.EMERGENCY_PAUSE]: 'Emergency pause of market operations',
  [PROPOSAL_TYPES.RESOLVER_ELECTION]: 'Elect or replace resolver committee members',
};

// --- Proposal Status ---
export const PROPOSAL_STATUS = {
  ACTIVE: 0,
  PASSED: 1,
  REJECTED: 2,
  EXECUTED: 3,
  VETOED: 4,
  EXPIRED: 5,
} as const;

export type ProposalStatus = (typeof PROPOSAL_STATUS)[keyof typeof PROPOSAL_STATUS];

export const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  [PROPOSAL_STATUS.ACTIVE]: 'Active',
  [PROPOSAL_STATUS.PASSED]: 'Passed',
  [PROPOSAL_STATUS.REJECTED]: 'Rejected',
  [PROPOSAL_STATUS.EXECUTED]: 'Executed',
  [PROPOSAL_STATUS.VETOED]: 'Vetoed',
  [PROPOSAL_STATUS.EXPIRED]: 'Expired',
};

// --- Quorum Thresholds (BPS) ---
export const QUORUM_BPS: Record<ProposalType, number> = {
  [PROPOSAL_TYPES.RESOLVE_DISPUTE]: 1000,
  [PROPOSAL_TYPES.FEE_CHANGE]: 2000,
  [PROPOSAL_TYPES.TREASURY]: 3000,
  [PROPOSAL_TYPES.PARAMETER]: 1500,
  [PROPOSAL_TYPES.EMERGENCY_PAUSE]: 500,
  [PROPOSAL_TYPES.RESOLVER_ELECTION]: 2000,
};

// --- Timelock Durations (blocks → approximate hours) ---
export const TIMELOCK_BLOCKS: Record<ProposalType, number> = {
  [PROPOSAL_TYPES.RESOLVE_DISPUTE]: 11520,   // 48h
  [PROPOSAL_TYPES.FEE_CHANGE]: 17280,        // 72h
  [PROPOSAL_TYPES.TREASURY]: 17280,          // 72h
  [PROPOSAL_TYPES.PARAMETER]: 11520,         // 48h
  [PROPOSAL_TYPES.EMERGENCY_PAUSE]: 0,       // immediate
  [PROPOSAL_TYPES.RESOLVER_ELECTION]: 11520, // 48h
};

// --- Governance Proposal ---
export interface GovernanceProposal {
  proposalId: string;
  proposer: string;
  proposalType: ProposalType;
  proposalTypeName: string;
  target: string;
  payload1: bigint;
  payload2: string;
  votesFor: bigint;
  votesAgainst: bigint;
  quorumRequired: bigint;
  createdAt: bigint;
  votingDeadline: bigint;
  timelockUntil: bigint;
  status: ProposalStatus;

  // Frontend-computed fields
  title?: string;
  description?: string;
  totalVotes: bigint;
  quorumPercent: number;
  forPercent: number;
  againstPercent: number;
  isQuorumMet: boolean;
  timeRemaining?: string;
  estimatedDeadlineMs?: number;
}

// --- Resolver ---
export const RESOLVER_TIERS = {
  BRONZE: 1,
  SILVER: 2,
  GOLD: 3,
  COMMITTEE: 4,
} as const;

export type ResolverTier = (typeof RESOLVER_TIERS)[keyof typeof RESOLVER_TIERS];

export const RESOLVER_TIER_LABELS: Record<ResolverTier, string> = {
  [RESOLVER_TIERS.BRONZE]: 'Bronze',
  [RESOLVER_TIERS.SILVER]: 'Silver',
  [RESOLVER_TIERS.GOLD]: 'Gold',
  [RESOLVER_TIERS.COMMITTEE]: 'Committee',
};

export const RESOLVER_STAKE_REQUIREMENTS: Record<ResolverTier, bigint> = {
  [RESOLVER_TIERS.BRONZE]: 50_000000n,      // 50 ALEO
  [RESOLVER_TIERS.SILVER]: 150_000000n,      // 150 ALEO
  [RESOLVER_TIERS.GOLD]: 500_000000n,        // 500 ALEO
  [RESOLVER_TIERS.COMMITTEE]: 100_000000n,   // 100 ALEO
};

export interface ResolverProfile {
  address: string;
  stakeAmount: bigint;
  tier: ResolverTier;
  marketsResolved: number;
  disputesReceived: number;
  disputesLost: number;
  strikes: number;
  reputationScore: number;     // 0-100 (converted from BPS)
  registeredAt: bigint;
  lastActiveAt: bigint;
  isActive: boolean;
}

// --- Delegation ---
export interface Delegation {
  delegator: string;
  delegate: string;
  amount: bigint;
  active: boolean;
}

// --- Rewards ---
export interface RewardEpoch {
  epochId: number;
  totalLpReward: bigint;
  totalTraderReward: bigint;
  totalLpContributions: bigint;
  totalTradeVolume: bigint;
  startedAt: bigint;
  distributed: boolean;
}

export interface UserReward {
  userAddress: string;
  epochId: number;
  rewardType: 'lp' | 'trading';
  amount: bigint;
  claimed: boolean;
}

// --- Committee ---
export interface CommitteeVote {
  marketId: string;
  member: string;
  proposedOutcome: number;
  votedAt: bigint;
}

export interface CommitteeDecision {
  marketId: string;
  outcome: number;
  votesCount: number;
  decidedAt: bigint;
  finalized: boolean;
}

// --- Resolution Escalation ---
export type EscalationTier = 1 | 2 | 3;

export interface ResolutionEscalation {
  marketId: string;
  currentTier: EscalationTier;
  originalResolver: string;
  originalOutcome?: number;
  disputer?: string;
  disputeBond?: bigint;
  disputeOutcome?: number;
  committeeOutcome?: number;
  communityProposalId?: string;
  finalOutcome?: number;
  status: 'pending' | 'committee' | 'community' | 'resolved' | 'cancelled';
}

// --- Governance Stats ---
export interface GovernanceStats {
  totalSupply: bigint;           // Total ALEO held by governance program
  circulatingSupply: bigint;     // Not used in v3 (ALEO is native)
  totalStakedInVotes: bigint;    // ALEO locked in active votes
  totalProposals: number;
  proposalsPassed: number;
  proposalsRejected: number;
  proposalsExecuted: number;
  proposalsVetoed: number;
  totalVeilDistributedLP: bigint;      // ALEO distributed to LPs
  totalVeilDistributedTrading: bigint; // ALEO distributed to traders
  totalResolvers: number;              // Active resolver count
}

// --- Constants (v2: pure ALEO governance) ---
export const VEIL_DECIMALS = 6; // ALEO uses 6 decimals (microcredits)
export const MIN_PROPOSAL_STAKE = 10_000000n;            // 10 ALEO
export const MIN_VOTE_AMOUNT = 1_000000n;                // 1 ALEO
export const RESOLVER_STAKE_BRONZE = 50_000000n;         // 50 ALEO
export const VOTING_PERIOD_BLOCKS = 40320n;              // ~7 days
export const GOVERNANCE_PROGRAM_ID = 'veiled_governance_v3.aleo';
export const VEIL_TOKEN_PROGRAM_ID = 'credits.aleo'; // v2: uses native ALEO

// --- Parameter Registry (keys for governance parameter updates) ---
export const GOVERNANCE_PARAMS: Record<number, { name: string; currentValue: number; unit: string }> = {
  0: { name: 'Protocol Fee (BPS)', currentValue: 50, unit: 'BPS' },
  1: { name: 'Creator Fee (BPS)', currentValue: 50, unit: 'BPS' },
  2: { name: 'LP Fee (BPS)', currentValue: 100, unit: 'BPS' },
  3: { name: 'Min Trade Amount', currentValue: 1000, unit: 'microcredits' },
  4: { name: 'Min Liquidity', currentValue: 10000, unit: 'microcredits' },
  5: { name: 'Min Dispute Bond', currentValue: 1000000, unit: 'microcredits' },
  6: { name: 'Challenge Window', currentValue: 2880, unit: 'blocks' },
  7: { name: 'Min Proposal Stake', currentValue: 1000, unit: 'VEIL' },
  8: { name: 'Voting Period', currentValue: 40320, unit: 'blocks' },
  9: { name: 'Timelock Standard', currentValue: 11520, unit: 'blocks' },
};
