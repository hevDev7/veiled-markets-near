// ============================================================================
// VEILED GOVERNANCE v2 — Pure ALEO Governance System
// ============================================================================
// Governance system for Veiled Markets protocol using native ALEO credits.
// No custom governance token — all staking, voting, and rewards use credits.aleo.
// Privacy-preserving: stake/unstake use private credits records.
//
// Leo 3.5.0 syntax: async transition returns Future.
// 20 transitions (within snarkVM 31-transition limit)
// ============================================================================

import credits.aleo;

program veiled_governance_v3.aleo {

    // ========================================================================
    // CONSTANTS
    // ========================================================================

    const MIN_PROPOSAL_STAKE: u64 = 10_000000u64;      // 10 ALEO to create proposal
    const MIN_VOTE_AMOUNT: u64 = 1_000000u64;           // 1 ALEO minimum vote
    const VOTING_PERIOD_BLOCKS: u64 = 40320u64;         // ~7 days at 15s blocks
    const TIMELOCK_STANDARD: u64 = 11520u64;            // ~2 days
    const TIMELOCK_LONG: u64 = 17280u64;                // ~3 days
    const EMERGENCY_TIMELOCK: u64 = 0u64;               // Immediate

    const PROPOSAL_RESOLVE_DISPUTE: u8 = 1u8;
    const PROPOSAL_FEE_CHANGE: u8 = 2u8;
    const PROPOSAL_TREASURY: u8 = 3u8;
    const PROPOSAL_PARAMETER: u8 = 4u8;
    const PROPOSAL_EMERGENCY_PAUSE: u8 = 5u8;
    const PROPOSAL_RESOLVER_ELECTION: u8 = 6u8;

    const STATUS_ACTIVE: u8 = 0u8;
    const STATUS_PASSED: u8 = 1u8;
    const STATUS_REJECTED: u8 = 2u8;
    const STATUS_EXECUTED: u8 = 3u8;
    const STATUS_VETOED: u8 = 4u8;

    // Quorum in microcredits (testnet-friendly amounts)
    const QUORUM_RESOLVE: u128 = 100_000000u128;         // 100 ALEO
    const QUORUM_FEE: u128 = 500_000000u128;              // 500 ALEO
    const QUORUM_TREASURY: u128 = 1000_000000u128;        // 1K ALEO
    const QUORUM_PARAMETER: u128 = 250_000000u128;        // 250 ALEO
    const QUORUM_EMERGENCY: u128 = 50_000000u128;         // 50 ALEO
    const QUORUM_RESOLVER: u128 = 500_000000u128;         // 500 ALEO

    const TIER_BRONZE: u8 = 1u8;
    const TIER_SILVER: u8 = 2u8;
    const TIER_GOLD: u8 = 3u8;
    const TIER_COMMITTEE: u8 = 4u8;

    const RESOLVER_STAKE_BRONZE: u64 = 50_000000u64;    // 50 ALEO
    const COMMITTEE_QUORUM: u8 = 3u8;

    const GUARDIAN_CONFIG_KEY: u8 = 0u8;
    const CREDIT_KEY: u8 = 0u8;

    const DEPLOYER: address = aleo10tm5ektsr5v7kdc5phs8pha42vrkhe2rlxfl2v979wunhzx07vpqnqplv8;

    // ========================================================================
    // RECORDS
    // ========================================================================

    // Vote lock receipt — proves user locked ALEO for voting
    record VoteLock {
        owner: address,
        proposal_id: field,
        amount: u64,
        unlock_at: u64,
    }

    // Resolver stake receipt — proves user staked ALEO to be resolver
    record ResolverStakeReceipt {
        owner: address,
        stake_amount: u64,
        tier: u8,
        registered_at: u64,
    }

    // ========================================================================
    // STRUCTS
    // ========================================================================

    struct GovernanceProposal {
        proposal_id: field,
        proposer: address,
        proposal_type: u8,
        target: field,
        payload_1: u128,
        payload_2: field,
        votes_for: u128,
        votes_against: u128,
        quorum_required: u128,
        created_at: u64,
        voting_deadline: u64,
        timelock_until: u64,
        status: u8,
    }

    struct ProposalSeedGov {
        proposer: address,
        proposal_type: u8,
        target: field,
        payload_1: u128,
        nonce: u64,
    }

    struct VoteKey {
        proposal_id: field,
        voter: address,
    }

    struct GuardianConfig {
        guardian_1: address,
        guardian_2: address,
        guardian_3: address,
        threshold: u8,
    }

    struct DelegationKey {
        delegator: address,
        delegate: address,
    }

    struct ResolverProfile {
        resolver: address,
        stake_amount: u128,
        tier: u8,
        markets_resolved: u64,
        disputes_received: u64,
        disputes_lost: u64,
        strikes: u8,
        reputation_score: u128,
        registered_at: u64,
        last_active_at: u64,
        is_active: bool,
    }

    struct CommitteeVoteKey {
        market_id: field,
        voter: address,
    }

    struct CommitteeOutcomeKey {
        market_id: field,
        outcome: u8,
    }

    struct CommitteeDecision {
        market_id: field,
        outcome: u8,
        votes_count: u8,
        decided_at: u64,
        finalized: bool,
    }

    struct RewardEpoch {
        epoch_id: u64,
        total_lp_reward: u64,
        total_trader_reward: u64,
        total_lp_contributions: u128,
        total_trade_volume: u128,
        started_at: u64,
        distributed: bool,
    }

    struct UserContribution {
        user: address,
        epoch_id: u64,
        lp_contribution: u128,
        trade_volume: u128,
    }

    struct UserContributionKey {
        user: address,
        epoch_id: u64,
    }

    // ========================================================================
    // MAPPINGS
    // ========================================================================

    // Program ALEO balance tracking
    mapping program_credits: u8 => u128;

    // Governance
    mapping governance_proposals: field => GovernanceProposal;
    mapping proposal_votes: field => bool;
    mapping vote_weights: field => u128;

    // Delegation (delegate staked voting power)
    mapping delegation_amounts: field => u128;
    mapping delegated_power: address => u128;

    // Guardian
    mapping guardian_config: u8 => GuardianConfig;
    mapping governance_initialized: u8 => bool;

    // Resolver registry
    mapping resolver_registry: address => ResolverProfile;
    mapping resolver_stakes: address => u128;
    mapping blacklisted_resolvers: address => bool;

    // Committee
    mapping committee_members: u8 => address;
    mapping committee_votes: field => u8;
    mapping committee_vote_count: field => u8;
    mapping committee_decisions: field => CommitteeDecision;
    mapping committee_outcome_votes: field => u8;

    // Escalation
    mapping market_escalation_tier: field => u8;
    mapping market_community_proposal: field => field;
    mapping governance_resolved_outcomes: field => u8;

    // Rewards (ALEO-funded)
    mapping reward_epochs: u64 => RewardEpoch;
    mapping user_contributions: field => UserContribution;
    mapping reward_claimed: field => bool;

    // ========================================================================
    // CONSTRUCTOR
    // ========================================================================

    @noupgrade
    async constructor() {
    }

    // ########################################################################
    //                    GOVERNANCE LIFECYCLE (T1-T8)
    // ########################################################################

    // ========================================================================
    // T1. CREATE PROPOSAL — Stake ALEO privately to create proposal
    // ========================================================================

    async transition create_proposal(
        private credits_in: credits.aleo/credits,
        public proposal_type: u8,
        public target: field,
        public payload_1: u128,
        public payload_2: field,
        public nonce: u64
    ) -> (VoteLock, credits.aleo/credits, field, Future) {
        assert(proposal_type >= 1u8 && proposal_type <= 6u8);

        let seed: ProposalSeedGov = ProposalSeedGov {
            proposer: self.caller,
            proposal_type: proposal_type,
            target: target,
            payload_1: payload_1,
            nonce: nonce,
        };
        let proposal_id: field = BHP256::hash_to_field(seed);

        let lock: VoteLock = VoteLock {
            owner: self.caller,
            proposal_id: proposal_id,
            amount: MIN_PROPOSAL_STAKE,
            unlock_at: 0u64,
        };

        // Stake ALEO privately
        let (change, transfer_future): (credits.aleo/credits, Future) =
            credits.aleo/transfer_private_to_public(credits_in, self.address, MIN_PROPOSAL_STAKE);

        return (lock, change, proposal_id, create_proposal_fin(
            transfer_future, proposal_id, self.caller, proposal_type, target, payload_1, payload_2
        ));
    }

    async function create_proposal_fin(
        transfer_future: Future,
        proposal_id: field,
        proposer: address,
        proposal_type: u8,
        target: field,
        payload_1: u128,
        payload_2: field
    ) {
        transfer_future.await();

        assert(governance_initialized.get_or_use(0u8, false));
        assert(!governance_proposals.contains(proposal_id));

        let q1: u128 = proposal_type == PROPOSAL_RESOLVE_DISPUTE ? QUORUM_RESOLVE : 0u128;
        let q2: u128 = proposal_type == PROPOSAL_FEE_CHANGE ? QUORUM_FEE : q1;
        let q3: u128 = proposal_type == PROPOSAL_TREASURY ? QUORUM_TREASURY : q2;
        let q4: u128 = proposal_type == PROPOSAL_PARAMETER ? QUORUM_PARAMETER : q3;
        let q5: u128 = proposal_type == PROPOSAL_EMERGENCY_PAUSE ? QUORUM_EMERGENCY : q4;
        let quorum: u128 = proposal_type == PROPOSAL_RESOLVER_ELECTION ? QUORUM_RESOLVER : q5;

        let deadline: u64 = block.height as u64 + VOTING_PERIOD_BLOCKS;

        governance_proposals.set(proposal_id, GovernanceProposal {
            proposal_id: proposal_id, proposer: proposer, proposal_type: proposal_type,
            target: target, payload_1: payload_1, payload_2: payload_2,
            votes_for: 0u128, votes_against: 0u128, quorum_required: quorum,
            created_at: block.height as u64, voting_deadline: deadline,
            timelock_until: 0u64, status: STATUS_ACTIVE,
        });

        let current_held: u128 = program_credits.get_or_use(CREDIT_KEY, 0u128);
        program_credits.set(CREDIT_KEY, current_held + MIN_PROPOSAL_STAKE as u128);
    }

    // ========================================================================
    // T2. VOTE FOR — Lock ALEO privately to vote for a proposal
    // ========================================================================

    async transition vote_for(
        private credits_in: credits.aleo/credits,
        public proposal_id: field,
        private amount: u64,
    ) -> (VoteLock, credits.aleo/credits, Future) {
        assert(amount >= MIN_VOTE_AMOUNT);

        let lock: VoteLock = VoteLock {
            owner: self.caller,
            proposal_id: proposal_id,
            amount: amount,
            unlock_at: 0u64,
        };

        let (change, transfer_future): (credits.aleo/credits, Future) =
            credits.aleo/transfer_private_to_public(credits_in, self.address, amount);

        return (lock, change, vote_for_fin(transfer_future, proposal_id, self.caller, amount as u128));
    }

    async function vote_for_fin(
        transfer_future: Future,
        proposal_id: field,
        voter: address,
        amount: u128,
    ) {
        transfer_future.await();

        let proposal: GovernanceProposal = governance_proposals.get(proposal_id);
        assert(proposal.status == STATUS_ACTIVE);
        assert(block.height as u64 <= proposal.voting_deadline);

        let vote_key: VoteKey = VoteKey { proposal_id: proposal_id, voter: voter };
        let vote_hash: field = BHP256::hash_to_field(vote_key);
        assert(!proposal_votes.contains(vote_hash));
        proposal_votes.set(vote_hash, true);
        vote_weights.set(vote_hash, amount);

        governance_proposals.set(proposal_id, GovernanceProposal {
            proposal_id: proposal.proposal_id, proposer: proposal.proposer,
            proposal_type: proposal.proposal_type, target: proposal.target,
            payload_1: proposal.payload_1, payload_2: proposal.payload_2,
            votes_for: proposal.votes_for + amount, votes_against: proposal.votes_against,
            quorum_required: proposal.quorum_required, created_at: proposal.created_at,
            voting_deadline: proposal.voting_deadline, timelock_until: proposal.timelock_until,
            status: proposal.status,
        });

        let current_held: u128 = program_credits.get_or_use(CREDIT_KEY, 0u128);
        program_credits.set(CREDIT_KEY, current_held + amount);
    }

    // ========================================================================
    // T3. VOTE AGAINST — Lock ALEO privately to vote against a proposal
    // ========================================================================

    async transition vote_against(
        private credits_in: credits.aleo/credits,
        public proposal_id: field,
        private amount: u64,
    ) -> (VoteLock, credits.aleo/credits, Future) {
        assert(amount >= MIN_VOTE_AMOUNT);

        let lock: VoteLock = VoteLock {
            owner: self.caller,
            proposal_id: proposal_id,
            amount: amount,
            unlock_at: 0u64,
        };

        let (change, transfer_future): (credits.aleo/credits, Future) =
            credits.aleo/transfer_private_to_public(credits_in, self.address, amount);

        return (lock, change, vote_against_fin(transfer_future, proposal_id, self.caller, amount as u128));
    }

    async function vote_against_fin(
        transfer_future: Future,
        proposal_id: field,
        voter: address,
        amount: u128,
    ) {
        transfer_future.await();

        let proposal: GovernanceProposal = governance_proposals.get(proposal_id);
        assert(proposal.status == STATUS_ACTIVE);
        assert(block.height as u64 <= proposal.voting_deadline);

        let vote_key: VoteKey = VoteKey { proposal_id: proposal_id, voter: voter };
        let vote_hash: field = BHP256::hash_to_field(vote_key);
        assert(!proposal_votes.contains(vote_hash));
        proposal_votes.set(vote_hash, true);
        vote_weights.set(vote_hash, amount);

        governance_proposals.set(proposal_id, GovernanceProposal {
            proposal_id: proposal.proposal_id, proposer: proposal.proposer,
            proposal_type: proposal.proposal_type, target: proposal.target,
            payload_1: proposal.payload_1, payload_2: proposal.payload_2,
            votes_for: proposal.votes_for, votes_against: proposal.votes_against + amount,
            quorum_required: proposal.quorum_required, created_at: proposal.created_at,
            voting_deadline: proposal.voting_deadline, timelock_until: proposal.timelock_until,
            status: proposal.status,
        });

        let current_held: u128 = program_credits.get_or_use(CREDIT_KEY, 0u128);
        program_credits.set(CREDIT_KEY, current_held + amount);
    }

    // ========================================================================
    // T4. UNLOCK AFTER VOTE — Return staked ALEO as private credits record
    // ========================================================================

    async transition unlock_after_vote(
        private lock: VoteLock,
    ) -> (credits.aleo/credits, Future) {
        assert(lock.owner == self.caller);

        let (payout, transfer_future): (credits.aleo/credits, Future) =
            credits.aleo/transfer_public_to_private(self.caller, lock.amount);

        return (payout, unlock_after_vote_fin(transfer_future, lock.proposal_id, lock.amount as u128));
    }

    async function unlock_after_vote_fin(
        transfer_future: Future,
        proposal_id: field,
        amount: u128,
    ) {
        transfer_future.await();

        let proposal: GovernanceProposal = governance_proposals.get(proposal_id);
        let unlock_time: u64 = proposal.timelock_until > 0u64 ? proposal.timelock_until : proposal.voting_deadline;
        assert(block.height as u64 > unlock_time);

        let current_held: u128 = program_credits.get_or_use(CREDIT_KEY, 0u128);
        assert(current_held >= amount);
        program_credits.set(CREDIT_KEY, current_held - amount);
    }

    // ========================================================================
    // T5. FINALIZE VOTE — Tally votes and determine outcome
    // ========================================================================

    async transition finalize_vote(public proposal_id: field) -> Future {
        return finalize_vote_fin(proposal_id);
    }

    async function finalize_vote_fin(proposal_id: field) {
        let proposal: GovernanceProposal = governance_proposals.get(proposal_id);
        assert(block.height as u64 > proposal.voting_deadline);
        assert(proposal.status == STATUS_ACTIVE);

        let total_votes: u128 = proposal.votes_for + proposal.votes_against;
        let passed: bool = total_votes >= proposal.quorum_required && proposal.votes_for > proposal.votes_against;

        let is_fee_or_treasury: bool = proposal.proposal_type == PROPOSAL_FEE_CHANGE || proposal.proposal_type == PROPOSAL_TREASURY;
        let is_emergency: bool = proposal.proposal_type == PROPOSAL_EMERGENCY_PAUSE;
        let timelock: u64 = is_emergency ? EMERGENCY_TIMELOCK : (is_fee_or_treasury ? TIMELOCK_LONG : TIMELOCK_STANDARD);

        let new_status: u8 = passed ? STATUS_PASSED : STATUS_REJECTED;
        let lock_until: u64 = passed ? block.height as u64 + timelock : 0u64;

        governance_proposals.set(proposal_id, GovernanceProposal {
            proposal_id: proposal.proposal_id, proposer: proposal.proposer,
            proposal_type: proposal.proposal_type, target: proposal.target,
            payload_1: proposal.payload_1, payload_2: proposal.payload_2,
            votes_for: proposal.votes_for, votes_against: proposal.votes_against,
            quorum_required: proposal.quorum_required, created_at: proposal.created_at,
            voting_deadline: proposal.voting_deadline, timelock_until: lock_until,
            status: new_status,
        });
    }

    // ========================================================================
    // T6. EXECUTE GOVERNANCE — Execute a passed & timelocked proposal
    // ========================================================================

    async transition execute_governance(public proposal_id: field) -> Future {
        return execute_governance_fin(proposal_id);
    }

    async function execute_governance_fin(proposal_id: field) {
        let proposal: GovernanceProposal = governance_proposals.get(proposal_id);
        assert(proposal.status == STATUS_PASSED);
        assert(proposal.timelock_until > 0u64);
        assert(block.height as u64 > proposal.timelock_until);

        governance_proposals.set(proposal_id, GovernanceProposal {
            proposal_id: proposal.proposal_id, proposer: proposal.proposer,
            proposal_type: proposal.proposal_type, target: proposal.target,
            payload_1: proposal.payload_1, payload_2: proposal.payload_2,
            votes_for: proposal.votes_for, votes_against: proposal.votes_against,
            quorum_required: proposal.quorum_required, created_at: proposal.created_at,
            voting_deadline: proposal.voting_deadline, timelock_until: proposal.timelock_until,
            status: STATUS_EXECUTED,
        });
    }

    // ========================================================================
    // T7. VETO PROPOSAL — Guardian-only emergency veto
    // ========================================================================

    async transition veto_proposal(public proposal_id: field) -> Future {
        return veto_proposal_fin(proposal_id, self.caller);
    }

    async function veto_proposal_fin(proposal_id: field, caller: address) {
        let proposal: GovernanceProposal = governance_proposals.get(proposal_id);
        assert(proposal.status == STATUS_PASSED);
        assert(proposal.timelock_until > 0u64);
        assert(block.height as u64 <= proposal.timelock_until);

        let config: GuardianConfig = guardian_config.get(GUARDIAN_CONFIG_KEY);
        let is_guardian: bool = caller == config.guardian_1 || caller == config.guardian_2 || caller == config.guardian_3;
        assert(is_guardian);

        governance_proposals.set(proposal_id, GovernanceProposal {
            proposal_id: proposal.proposal_id, proposer: proposal.proposer,
            proposal_type: proposal.proposal_type, target: proposal.target,
            payload_1: proposal.payload_1, payload_2: proposal.payload_2,
            votes_for: proposal.votes_for, votes_against: proposal.votes_against,
            quorum_required: proposal.quorum_required, created_at: proposal.created_at,
            voting_deadline: proposal.voting_deadline, timelock_until: proposal.timelock_until,
            status: STATUS_VETOED,
        });
    }

    // ========================================================================
    // T8. DELEGATE VOTES — Delegate ALEO voting power to another address
    // ========================================================================

    async transition delegate_votes(
        private credits_in: credits.aleo/credits,
        public delegate_to: address,
        private amount: u64,
    ) -> (credits.aleo/credits, Future) {
        assert(amount >= MIN_VOTE_AMOUNT);

        let (change, transfer_future): (credits.aleo/credits, Future) =
            credits.aleo/transfer_private_to_public(credits_in, self.address, amount);

        return (change, delegate_votes_fin(transfer_future, self.caller, delegate_to, amount as u128));
    }

    async function delegate_votes_fin(
        transfer_future: Future,
        delegator: address,
        delegate_to: address,
        amount: u128,
    ) {
        transfer_future.await();

        assert(delegator != delegate_to);
        let del_key: DelegationKey = DelegationKey { delegator: delegator, delegate: delegate_to };
        let del_hash: field = BHP256::hash_to_field(del_key);
        let existing: u128 = delegation_amounts.get_or_use(del_hash, 0u128);
        delegation_amounts.set(del_hash, existing + amount);
        let current_power: u128 = delegated_power.get_or_use(delegate_to, 0u128);
        delegated_power.set(delegate_to, current_power + amount);

        let current_held: u128 = program_credits.get_or_use(CREDIT_KEY, 0u128);
        program_credits.set(CREDIT_KEY, current_held + amount);
    }

    // ########################################################################
    //                       RESOLVER REGISTRY (T9-T10)
    // ########################################################################

    // ========================================================================
    // T9. REGISTER RESOLVER — Stake ALEO to become a market resolver
    // ========================================================================

    async transition register_resolver(
        private credits_in: credits.aleo/credits,
    ) -> (ResolverStakeReceipt, credits.aleo/credits, Future) {
        let receipt: ResolverStakeReceipt = ResolverStakeReceipt {
            owner: self.caller,
            stake_amount: RESOLVER_STAKE_BRONZE,
            tier: TIER_BRONZE,
            registered_at: 0u64,
        };

        let (change, transfer_future): (credits.aleo/credits, Future) =
            credits.aleo/transfer_private_to_public(credits_in, self.address, RESOLVER_STAKE_BRONZE);

        return (receipt, change, register_resolver_fin(transfer_future, self.caller));
    }

    async function register_resolver_fin(
        transfer_future: Future,
        resolver: address,
    ) {
        transfer_future.await();

        assert(!resolver_registry.contains(resolver));
        assert(!blacklisted_resolvers.get_or_use(resolver, false));

        resolver_registry.set(resolver, ResolverProfile {
            resolver: resolver, stake_amount: RESOLVER_STAKE_BRONZE as u128, tier: TIER_BRONZE,
            markets_resolved: 0u64, disputes_received: 0u64, disputes_lost: 0u64,
            strikes: 0u8, reputation_score: 10000u128,
            registered_at: block.height as u64, last_active_at: block.height as u64, is_active: true,
        });
        resolver_stakes.set(resolver, RESOLVER_STAKE_BRONZE as u128);

        let current_held: u128 = program_credits.get_or_use(CREDIT_KEY, 0u128);
        program_credits.set(CREDIT_KEY, current_held + RESOLVER_STAKE_BRONZE as u128);
    }

    // ========================================================================
    // T10. UNSTAKE RESOLVER — Withdraw staked ALEO (deregisters resolver)
    // ========================================================================

    async transition unstake_resolver(
        private receipt: ResolverStakeReceipt,
    ) -> (credits.aleo/credits, Future) {
        assert(receipt.owner == self.caller);

        let (payout, transfer_future): (credits.aleo/credits, Future) =
            credits.aleo/transfer_public_to_private(self.caller, receipt.stake_amount);

        return (payout, unstake_resolver_fin(transfer_future, self.caller, receipt.stake_amount as u128));
    }

    async function unstake_resolver_fin(
        transfer_future: Future,
        resolver: address,
        amount: u128,
    ) {
        transfer_future.await();

        let profile: ResolverProfile = resolver_registry.get(resolver);
        assert(profile.is_active);

        resolver_registry.set(resolver, ResolverProfile {
            resolver: profile.resolver, stake_amount: 0u128, tier: 0u8,
            markets_resolved: profile.markets_resolved, disputes_received: profile.disputes_received,
            disputes_lost: profile.disputes_lost, strikes: profile.strikes,
            reputation_score: profile.reputation_score, registered_at: profile.registered_at,
            last_active_at: block.height as u64, is_active: false,
        });
        resolver_stakes.set(resolver, 0u128);

        let current_held: u128 = program_credits.get_or_use(CREDIT_KEY, 0u128);
        assert(current_held >= amount);
        program_credits.set(CREDIT_KEY, current_held - amount);
    }

    // ########################################################################
    //              COMMITTEE RESOLUTION & ESCALATION (T11-T15)
    // ########################################################################

    // ========================================================================
    // T11. COMMITTEE VOTE RESOLVE
    // ========================================================================

    async transition committee_vote_resolve(
        public market_id: field,
        public proposed_outcome: u8
    ) -> Future {
        assert(proposed_outcome >= 1u8 && proposed_outcome <= 4u8);
        return committee_vote_resolve_fin(market_id, proposed_outcome, self.caller);
    }

    async function committee_vote_resolve_fin(market_id: field, proposed_outcome: u8, voter: address) {
        let tier: u8 = market_escalation_tier.get_or_use(market_id, 0u8);
        assert(tier == 2u8);

        let member_1: address = committee_members.get_or_use(1u8, DEPLOYER);
        let member_2: address = committee_members.get_or_use(2u8, DEPLOYER);
        let member_3: address = committee_members.get_or_use(3u8, DEPLOYER);
        let member_4: address = committee_members.get_or_use(4u8, DEPLOYER);
        let member_5: address = committee_members.get_or_use(5u8, DEPLOYER);
        let is_member: bool = voter == member_1 || voter == member_2 || voter == member_3 || voter == member_4 || voter == member_5;
        assert(is_member);

        let cvk: CommitteeVoteKey = CommitteeVoteKey { market_id: market_id, voter: voter };
        let cv_hash: field = BHP256::hash_to_field(cvk);
        assert(!committee_votes.contains(cv_hash));
        committee_votes.set(cv_hash, proposed_outcome);

        let current_count: u8 = committee_vote_count.get_or_use(market_id, 0u8);
        committee_vote_count.set(market_id, current_count + 1u8);

        let outcome_key: CommitteeOutcomeKey = CommitteeOutcomeKey { market_id: market_id, outcome: proposed_outcome };
        let outcome_hash: field = BHP256::hash_to_field(outcome_key);
        let outcome_count: u8 = committee_outcome_votes.get_or_use(outcome_hash, 0u8);
        committee_outcome_votes.set(outcome_hash, outcome_count + 1u8);
    }

    // ========================================================================
    // T12. FINALIZE COMMITTEE VOTE
    // ========================================================================

    async transition finalize_committee_vote(public market_id: field) -> Future {
        return finalize_committee_vote_fin(market_id);
    }

    async function finalize_committee_vote_fin(market_id: field) {
        let total_votes: u8 = committee_vote_count.get_or_use(market_id, 0u8);
        assert(total_votes >= COMMITTEE_QUORUM);

        let hash_o1: field = BHP256::hash_to_field(CommitteeOutcomeKey { market_id: market_id, outcome: 1u8 });
        let hash_o2: field = BHP256::hash_to_field(CommitteeOutcomeKey { market_id: market_id, outcome: 2u8 });
        let hash_o3: field = BHP256::hash_to_field(CommitteeOutcomeKey { market_id: market_id, outcome: 3u8 });
        let hash_o4: field = BHP256::hash_to_field(CommitteeOutcomeKey { market_id: market_id, outcome: 4u8 });

        let votes_o1: u8 = committee_outcome_votes.get_or_use(hash_o1, 0u8);
        let votes_o2: u8 = committee_outcome_votes.get_or_use(hash_o2, 0u8);
        let votes_o3: u8 = committee_outcome_votes.get_or_use(hash_o3, 0u8);
        let votes_o4: u8 = committee_outcome_votes.get_or_use(hash_o4, 0u8);

        let w2_votes: u8 = votes_o2 > votes_o1 ? votes_o2 : votes_o1;
        let w2_idx: u8 = votes_o2 > votes_o1 ? 2u8 : 1u8;
        let w3_votes: u8 = votes_o3 > w2_votes ? votes_o3 : w2_votes;
        let w3_idx: u8 = votes_o3 > w2_votes ? 3u8 : w2_idx;
        let max_votes: u8 = votes_o4 > w3_votes ? votes_o4 : w3_votes;
        let winning: u8 = votes_o4 > w3_votes ? 4u8 : w3_idx;

        let has_majority: bool = max_votes >= COMMITTEE_QUORUM;
        let t1: u8 = votes_o1 == max_votes ? 1u8 : 0u8;
        let t2: u8 = votes_o2 == max_votes ? t1 + 1u8 : t1;
        let t3: u8 = votes_o3 == max_votes ? t2 + 1u8 : t2;
        let tie_count: u8 = votes_o4 == max_votes ? t3 + 1u8 : t3;
        let is_tie: bool = tie_count > 1u8;

        let resolved_outcome: u8 = has_majority && !is_tie ? winning : 0u8;
        let is_finalized: bool = has_majority && !is_tie;

        committee_decisions.set(market_id, CommitteeDecision {
            market_id: market_id, outcome: resolved_outcome, votes_count: total_votes,
            decided_at: block.height as u64, finalized: is_finalized,
        });

        if (is_finalized) {
            governance_resolved_outcomes.set(market_id, resolved_outcome);
        }
    }

    // ========================================================================
    // T13. ESCALATE TO COMMUNITY
    // ========================================================================

    async transition escalate_to_community(public market_id: field, public nonce: u64) -> Future {
        return escalate_to_community_fin(market_id, nonce, self.caller);
    }

    async function escalate_to_community_fin(market_id: field, nonce: u64, caller: address) {
        let tier: u8 = market_escalation_tier.get_or_use(market_id, 0u8);
        assert(tier == 2u8);

        let decision: CommitteeDecision = committee_decisions.get(market_id);
        assert(!decision.finalized);

        market_escalation_tier.set(market_id, 3u8);

        let seed: ProposalSeedGov = ProposalSeedGov {
            proposer: caller, proposal_type: PROPOSAL_RESOLVE_DISPUTE,
            target: market_id, payload_1: 0u128, nonce: nonce,
        };
        let proposal_id: field = BHP256::hash_to_field(seed);
        assert(!governance_proposals.contains(proposal_id));

        let deadline: u64 = block.height as u64 + VOTING_PERIOD_BLOCKS;

        governance_proposals.set(proposal_id, GovernanceProposal {
            proposal_id: proposal_id, proposer: caller, proposal_type: PROPOSAL_RESOLVE_DISPUTE,
            target: market_id, payload_1: 0u128, payload_2: 0field,
            votes_for: 0u128, votes_against: 0u128, quorum_required: QUORUM_RESOLVE,
            created_at: block.height as u64, voting_deadline: deadline,
            timelock_until: 0u64, status: STATUS_ACTIVE,
        });

        market_community_proposal.set(market_id, proposal_id);
    }

    // ========================================================================
    // T14. GOVERNANCE RESOLVE — Final authority on market outcome
    // ========================================================================

    async transition governance_resolve(public market_id: field, public winning_outcome: u8) -> Future {
        assert(winning_outcome >= 1u8 && winning_outcome <= 4u8);
        return governance_resolve_fin(market_id, winning_outcome);
    }

    async function governance_resolve_fin(market_id: field, winning_outcome: u8) {
        let tier: u8 = market_escalation_tier.get_or_use(market_id, 0u8);
        assert(!governance_resolved_outcomes.contains(market_id));

        if (tier == 2u8) {
            let decision: CommitteeDecision = committee_decisions.get(market_id);
            assert(decision.finalized);
            assert(decision.outcome == winning_outcome);
        } else if (tier == 3u8) {
            let proposal_id: field = market_community_proposal.get(market_id);
            let proposal: GovernanceProposal = governance_proposals.get(proposal_id);
            assert(proposal.status == STATUS_EXECUTED);
        } else {
            assert(false);
        }

        governance_resolved_outcomes.set(market_id, winning_outcome);
    }

    // ========================================================================
    // T15. INITIATE ESCALATION — Tier 0 → Tier 2
    // ========================================================================

    async transition initiate_escalation(public market_id: field) -> Future {
        return initiate_escalation_fin(market_id);
    }

    async function initiate_escalation_fin(market_id: field) {
        let current_tier: u8 = market_escalation_tier.get_or_use(market_id, 0u8);
        assert(current_tier == 0u8);
        market_escalation_tier.set(market_id, 2u8);
    }

    // ########################################################################
    //                       REWARD DISTRIBUTION (T16-T18)
    //             Rewards funded by protocol fees (deposited as ALEO)
    // ########################################################################

    // ========================================================================
    // T16. FUND REWARD EPOCH — Deployer deposits ALEO for rewards
    // ========================================================================

    async transition fund_reward_epoch(
        private credits_in: credits.aleo/credits,
        public epoch_id: u64,
        private lp_reward: u64,
        private trader_reward: u64,
    ) -> (credits.aleo/credits, Future) {
        let total: u64 = lp_reward + trader_reward;
        assert(total > 0u64);

        let (change, transfer_future): (credits.aleo/credits, Future) =
            credits.aleo/transfer_private_to_public(credits_in, self.address, total);

        return (change, fund_reward_epoch_fin(transfer_future, epoch_id, lp_reward, trader_reward));
    }

    async function fund_reward_epoch_fin(
        transfer_future: Future,
        epoch_id: u64,
        lp_reward: u64,
        trader_reward: u64,
    ) {
        transfer_future.await();

        assert(!reward_epochs.contains(epoch_id));
        reward_epochs.set(epoch_id, RewardEpoch {
            epoch_id: epoch_id,
            total_lp_reward: lp_reward,
            total_trader_reward: trader_reward,
            total_lp_contributions: 0u128,
            total_trade_volume: 0u128,
            started_at: block.height as u64,
            distributed: false,
        });

        let total: u128 = (lp_reward + trader_reward) as u128;
        let current_held: u128 = program_credits.get_or_use(CREDIT_KEY, 0u128);
        program_credits.set(CREDIT_KEY, current_held + total);
    }

    // ========================================================================
    // T17. RECORD CONTRIBUTION — Track LP/trader activity for epoch
    // ========================================================================

    async transition record_contribution(
        public user: address,
        public epoch_id: u64,
        public lp_contribution: u128,
        public trade_volume: u128
    ) -> Future {
        return record_contribution_fin(user, epoch_id, lp_contribution, trade_volume);
    }

    async function record_contribution_fin(
        user: address,
        epoch_id: u64,
        lp_contribution: u128,
        trade_volume: u128,
    ) {
        let epoch: RewardEpoch = reward_epochs.get(epoch_id);
        assert(!epoch.distributed);

        let uck: UserContributionKey = UserContributionKey { user: user, epoch_id: epoch_id };
        let uc_hash: field = BHP256::hash_to_field(uck);

        let existing: UserContribution = user_contributions.get_or_use(uc_hash, UserContribution {
            user: user, epoch_id: epoch_id, lp_contribution: 0u128, trade_volume: 0u128,
        });

        user_contributions.set(uc_hash, UserContribution {
            user: user, epoch_id: epoch_id,
            lp_contribution: existing.lp_contribution + lp_contribution,
            trade_volume: existing.trade_volume + trade_volume,
        });

        reward_epochs.set(epoch_id, RewardEpoch {
            epoch_id: epoch.epoch_id,
            total_lp_reward: epoch.total_lp_reward,
            total_trader_reward: epoch.total_trader_reward,
            total_lp_contributions: epoch.total_lp_contributions + lp_contribution,
            total_trade_volume: epoch.total_trade_volume + trade_volume,
            started_at: epoch.started_at,
            distributed: epoch.distributed,
        });
    }

    // ========================================================================
    // T18. CLAIM REWARD — Claim ALEO reward as private credits record
    // ========================================================================

    async transition claim_reward(
        public epoch_id: u64,
        public reward_type: u8,
    ) -> (credits.aleo/credits, Future) {
        assert(reward_type == 1u8 || reward_type == 2u8);

        // Placeholder — actual amount computed in finalize and validated
        // transfer_public_to_private sends from program's public balance
        let (payout, transfer_future): (credits.aleo/credits, Future) =
            credits.aleo/transfer_public_to_private(self.caller, 1u64);

        return (payout, claim_reward_fin(transfer_future, self.caller, epoch_id, reward_type));
    }

    async function claim_reward_fin(
        transfer_future: Future,
        claimer: address,
        epoch_id: u64,
        reward_type: u8,
    ) {
        transfer_future.await();

        let epoch: RewardEpoch = reward_epochs.get(epoch_id);

        let claim_seed: field = BHP256::hash_to_field(UserContributionKey { user: claimer, epoch_id: epoch_id });
        assert(!reward_claimed.contains(claim_seed));
        reward_claimed.set(claim_seed, true);

        let uck: UserContributionKey = UserContributionKey { user: claimer, epoch_id: epoch_id };
        let uc_hash: field = BHP256::hash_to_field(uck);
        let contribution: UserContribution = user_contributions.get(uc_hash);

        let lp_reward: u128 = epoch.total_lp_contributions > 0u128 ?
            contribution.lp_contribution * epoch.total_lp_reward as u128 / epoch.total_lp_contributions : 0u128;
        let trader_reward: u128 = epoch.total_trade_volume > 0u128 ?
            contribution.trade_volume * epoch.total_trader_reward as u128 / epoch.total_trade_volume : 0u128;
        let reward_amount: u128 = reward_type == 1u8 ? lp_reward : trader_reward;

        assert(reward_amount > 0u128);

        let current_held: u128 = program_credits.get_or_use(CREDIT_KEY, 0u128);
        assert(current_held >= reward_amount);
        program_credits.set(CREDIT_KEY, current_held - reward_amount);
    }

    // ########################################################################
    //                       ADMINISTRATION (T19-T20)
    // ########################################################################

    // ========================================================================
    // T19. INIT GOVERNANCE — Deployer-only, one-time setup
    // ========================================================================

    async transition init_governance(
        public guardian_1: address,
        public guardian_2: address,
        public guardian_3: address,
        public guardian_threshold: u8
    ) -> Future {
        assert(self.caller == DEPLOYER);
        assert(guardian_threshold >= 2u8 && guardian_threshold <= 3u8);
        assert(guardian_1 != guardian_2);
        assert(guardian_1 != guardian_3);
        assert(guardian_2 != guardian_3);
        return init_governance_fin(guardian_1, guardian_2, guardian_3, guardian_threshold);
    }

    async function init_governance_fin(
        guardian_1: address,
        guardian_2: address,
        guardian_3: address,
        guardian_threshold: u8,
    ) {
        assert(!governance_initialized.get_or_use(0u8, false));
        guardian_config.set(GUARDIAN_CONFIG_KEY, GuardianConfig {
            guardian_1: guardian_1, guardian_2: guardian_2,
            guardian_3: guardian_3, threshold: guardian_threshold,
        });
        governance_initialized.set(0u8, true);
    }

    // ========================================================================
    // T20. DEPOSIT PROTOCOL FEES — Accept ALEO deposits for reward pool
    // ========================================================================

    async transition deposit_protocol_fees(
        private credits_in: credits.aleo/credits,
        private amount: u64,
    ) -> (credits.aleo/credits, Future) {
        assert(amount > 0u64);

        let (change, transfer_future): (credits.aleo/credits, Future) =
            credits.aleo/transfer_private_to_public(credits_in, self.address, amount);

        return (change, deposit_fees_fin(transfer_future, amount as u128));
    }

    async function deposit_fees_fin(
        transfer_future: Future,
        amount: u128,
    ) {
        transfer_future.await();

        let current_held: u128 = program_credits.get_or_use(CREDIT_KEY, 0u128);
        program_credits.set(CREDIT_KEY, current_held + amount);
    }
}
