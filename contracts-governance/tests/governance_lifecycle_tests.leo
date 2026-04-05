// ============================================================================
// VEILED GOVERNANCE — Lifecycle Scenario Tests
// ============================================================================
// These tests exercise full proposal lifecycles as self-contained scenarios
// using the exact constants, proposal hashing, timelock rules, and execution
// routing semantics from the governance contract.
// ============================================================================

program governance_lifecycle_tests.aleo {
    @noupgrade
    async constructor() {}

    const VOTING_PERIOD_BLOCKS: u64 = 40320u64;
    const TIMELOCK_STANDARD: u64 = 11520u64;
    const TIMELOCK_LONG: u64 = 17280u64;
    const EMERGENCY_TIMELOCK: u64 = 0u64;

    const PROPOSAL_FEE_CHANGE: u8 = 2u8;
    const PROPOSAL_TREASURY: u8 = 3u8;
    const PROPOSAL_PARAMETER: u8 = 4u8;
    const PROPOSAL_EMERGENCY_PAUSE: u8 = 5u8;
    const PROPOSAL_RESOLVER_ELECTION: u8 = 6u8;

    const CONFIG_NOOP: field = 0field;
    const CONFIG_PROTOCOL_FEE_BPS: field = 1field;
    const CONFIG_MIN_TRADE_AMOUNT: field = 4field;
    const CONFIG_PAUSE_STATE: field = 6field;

    const STATUS_ACTIVE: u8 = 0u8;
    const STATUS_PASSED: u8 = 1u8;
    const STATUS_REJECTED: u8 = 2u8;
    const STATUS_EXECUTED: u8 = 3u8;

    const QUORUM_FEE: u128 = 500_000000u128;
    const QUORUM_TREASURY: u128 = 1000_000000u128;
    const QUORUM_PARAMETER: u128 = 250_000000u128;
    const QUORUM_EMERGENCY: u128 = 50_000000u128;
    const QUORUM_RESOLVER: u128 = 500_000000u128;

    const DEPLOYER: address = aleo10tm5ektsr5v7kdc5phs8pha42vrkhe2rlxfl2v979wunhzx07vpqnqplv8;

    struct ProposalSeedGov {
        proposer: address,
        proposal_type: u8,
        target: field,
        payload_1: u128,
        nonce: u64,
    }

    struct ProposalSnapshot {
        proposal_id: field,
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

    @test
    transition test_parameter_lifecycle() {
        let seed: ProposalSeedGov = ProposalSeedGov {
            proposer: DEPLOYER,
            proposal_type: PROPOSAL_PARAMETER,
            target: CONFIG_MIN_TRADE_AMOUNT,
            payload_1: 5_000000u128,
            nonce: 7u64,
        };
        let proposal_id: field = BHP256::hash_to_field(seed);
        let created_at: u64 = 1_000u64;
        let deadline: u64 = created_at + VOTING_PERIOD_BLOCKS;

        let voted: ProposalSnapshot = ProposalSnapshot {
            proposal_id: proposal_id,
            proposal_type: PROPOSAL_PARAMETER,
            target: CONFIG_MIN_TRADE_AMOUNT,
            payload_1: 5_000000u128,
            payload_2: 0field,
            votes_for: 300_000000u128,
            votes_against: 50_000000u128,
            quorum_required: QUORUM_PARAMETER,
            created_at: created_at,
            voting_deadline: deadline,
            timelock_until: 0u64,
            status: STATUS_ACTIVE,
        };

        let finalize_height: u64 = 60_000u64;
        let total_votes: u128 = voted.votes_for + voted.votes_against;
        let passed: bool = total_votes >= voted.quorum_required && voted.votes_for > voted.votes_against;
        let finalized: ProposalSnapshot = ProposalSnapshot {
            proposal_id: voted.proposal_id,
            proposal_type: voted.proposal_type,
            target: voted.target,
            payload_1: voted.payload_1,
            payload_2: voted.payload_2,
            votes_for: voted.votes_for,
            votes_against: voted.votes_against,
            quorum_required: voted.quorum_required,
            created_at: voted.created_at,
            voting_deadline: voted.voting_deadline,
            timelock_until: passed ? finalize_height + TIMELOCK_STANDARD : 0u64,
            status: passed ? STATUS_PASSED : STATUS_REJECTED,
        };

        let is_config_update: bool = finalized.proposal_type == PROPOSAL_FEE_CHANGE || finalized.proposal_type == PROPOSAL_PARAMETER;
        let is_pause_update: bool = finalized.proposal_type == PROPOSAL_EMERGENCY_PAUSE;
        let config_key: field = is_config_update ? finalized.target : (is_pause_update ? CONFIG_PAUSE_STATE : CONFIG_NOOP);
        let config_value: u128 = (is_config_update || is_pause_update) ? finalized.payload_1 : 0u128;

        let execute_height: u64 = finalized.timelock_until + 1u64;
        let executed: ProposalSnapshot = ProposalSnapshot {
            proposal_id: finalized.proposal_id,
            proposal_type: finalized.proposal_type,
            target: finalized.target,
            payload_1: finalized.payload_1,
            payload_2: finalized.payload_2,
            votes_for: finalized.votes_for,
            votes_against: finalized.votes_against,
            quorum_required: finalized.quorum_required,
            created_at: finalized.created_at,
            voting_deadline: finalized.voting_deadline,
            timelock_until: finalized.timelock_until,
            status: STATUS_EXECUTED,
        };

        assert_eq(voted.voting_deadline, 41_320u64);
        assert(passed);
        assert_eq(finalized.status, STATUS_PASSED);
        assert_eq(finalized.timelock_until, 71_520u64);
        assert_eq(config_key, CONFIG_MIN_TRADE_AMOUNT);
        assert_eq(config_value, 5_000000u128);
        assert(execute_height > finalized.timelock_until);
        assert_eq(executed.status, STATUS_EXECUTED);
        assert_eq(executed.proposal_id, proposal_id);
    }

    @test
    transition test_emergency_pause_lifecycle() {
        let seed: ProposalSeedGov = ProposalSeedGov {
            proposer: DEPLOYER,
            proposal_type: PROPOSAL_EMERGENCY_PAUSE,
            target: CONFIG_PROTOCOL_FEE_BPS,
            payload_1: 1u128,
            nonce: 11u64,
        };
        let proposal_id: field = BHP256::hash_to_field(seed);

        let voted: ProposalSnapshot = ProposalSnapshot {
            proposal_id: proposal_id,
            proposal_type: PROPOSAL_EMERGENCY_PAUSE,
            target: CONFIG_PROTOCOL_FEE_BPS,
            payload_1: 1u128,
            payload_2: 0field,
            votes_for: 60_000000u128,
            votes_against: 0u128,
            quorum_required: QUORUM_EMERGENCY,
            created_at: 5_000u64,
            voting_deadline: 45_320u64,
            timelock_until: 0u64,
            status: STATUS_ACTIVE,
        };

        let total_votes: u128 = voted.votes_for + voted.votes_against;
        let passed: bool = total_votes >= voted.quorum_required && voted.votes_for > voted.votes_against;
        let finalized: ProposalSnapshot = ProposalSnapshot {
            proposal_id: voted.proposal_id,
            proposal_type: voted.proposal_type,
            target: voted.target,
            payload_1: voted.payload_1,
            payload_2: voted.payload_2,
            votes_for: voted.votes_for,
            votes_against: voted.votes_against,
            quorum_required: voted.quorum_required,
            created_at: voted.created_at,
            voting_deadline: voted.voting_deadline,
            timelock_until: passed ? 70_000u64 + EMERGENCY_TIMELOCK : 0u64,
            status: passed ? STATUS_PASSED : STATUS_REJECTED,
        };

        let is_config_update: bool = finalized.proposal_type == PROPOSAL_FEE_CHANGE || finalized.proposal_type == PROPOSAL_PARAMETER;
        let is_pause_update: bool = finalized.proposal_type == PROPOSAL_EMERGENCY_PAUSE;
        let config_key: field = is_config_update ? finalized.target : (is_pause_update ? CONFIG_PAUSE_STATE : CONFIG_NOOP);
        let config_value: u128 = (is_config_update || is_pause_update) ? finalized.payload_1 : 0u128;

        assert(passed);
        assert_eq(finalized.status, STATUS_PASSED);
        assert_eq(finalized.timelock_until, 70_000u64);
        assert_eq(config_key, CONFIG_PAUSE_STATE);
        assert_eq(config_value, 1u128);
    }

    @test
    transition test_treasury_lifecycle() {
        let recipient_hash: field = BHP256::hash_to_field(DEPLOYER);
        let seed: ProposalSeedGov = ProposalSeedGov {
            proposer: DEPLOYER,
            proposal_type: PROPOSAL_TREASURY,
            target: 0field,
            payload_1: 25_000000u128,
            nonce: 22u64,
        };
        let proposal_id: field = BHP256::hash_to_field(seed);

        let voted: ProposalSnapshot = ProposalSnapshot {
            proposal_id: proposal_id,
            proposal_type: PROPOSAL_TREASURY,
            target: 0field,
            payload_1: 25_000000u128,
            payload_2: recipient_hash,
            votes_for: 1_200_000000u128,
            votes_against: 100_000000u128,
            quorum_required: QUORUM_TREASURY,
            created_at: 9_000u64,
            voting_deadline: 49_320u64,
            timelock_until: 0u64,
            status: STATUS_ACTIVE,
        };

        let total_votes: u128 = voted.votes_for + voted.votes_against;
        let passed: bool = total_votes >= voted.quorum_required && voted.votes_for > voted.votes_against;
        let finalized: ProposalSnapshot = ProposalSnapshot {
            proposal_id: voted.proposal_id,
            proposal_type: voted.proposal_type,
            target: voted.target,
            payload_1: voted.payload_1,
            payload_2: voted.payload_2,
            votes_for: voted.votes_for,
            votes_against: voted.votes_against,
            quorum_required: voted.quorum_required,
            created_at: voted.created_at,
            voting_deadline: voted.voting_deadline,
            timelock_until: passed ? 90_000u64 + TIMELOCK_LONG : 0u64,
            status: passed ? STATUS_PASSED : STATUS_REJECTED,
        };

        let execute_height: u64 = finalized.timelock_until + 1u64;
        let executed: ProposalSnapshot = ProposalSnapshot {
            proposal_id: finalized.proposal_id,
            proposal_type: finalized.proposal_type,
            target: finalized.target,
            payload_1: finalized.payload_1,
            payload_2: finalized.payload_2,
            votes_for: finalized.votes_for,
            votes_against: finalized.votes_against,
            quorum_required: finalized.quorum_required,
            created_at: finalized.created_at,
            voting_deadline: finalized.voting_deadline,
            timelock_until: finalized.timelock_until,
            status: STATUS_EXECUTED,
        };

        assert(passed);
        assert_eq(finalized.status, STATUS_PASSED);
        assert_eq(finalized.timelock_until, 107_280u64);
        assert(execute_height > finalized.timelock_until);
        assert_eq(finalized.payload_1, 25_000000u128);
        assert_eq(finalized.payload_2, recipient_hash);
        assert_eq(executed.status, STATUS_EXECUTED);
    }

    @test
    transition test_resolver_lifecycle() {
        let resolver_field: field = 99field;
        let seed: ProposalSeedGov = ProposalSeedGov {
            proposer: DEPLOYER,
            proposal_type: PROPOSAL_RESOLVER_ELECTION,
            target: 0field,
            payload_1: 1u128,
            nonce: 33u64,
        };
        let proposal_id: field = BHP256::hash_to_field(seed);

        let voted: ProposalSnapshot = ProposalSnapshot {
            proposal_id: proposal_id,
            proposal_type: PROPOSAL_RESOLVER_ELECTION,
            target: 0field,
            payload_1: 1u128,
            payload_2: resolver_field,
            votes_for: 700_000000u128,
            votes_against: 20_000000u128,
            quorum_required: QUORUM_RESOLVER,
            created_at: 12_000u64,
            voting_deadline: 52_320u64,
            timelock_until: 0u64,
            status: STATUS_ACTIVE,
        };

        let total_votes: u128 = voted.votes_for + voted.votes_against;
        let passed: bool = total_votes >= voted.quorum_required && voted.votes_for > voted.votes_against;
        let finalized: ProposalSnapshot = ProposalSnapshot {
            proposal_id: voted.proposal_id,
            proposal_type: voted.proposal_type,
            target: voted.target,
            payload_1: voted.payload_1,
            payload_2: voted.payload_2,
            votes_for: voted.votes_for,
            votes_against: voted.votes_against,
            quorum_required: voted.quorum_required,
            created_at: voted.created_at,
            voting_deadline: voted.voting_deadline,
            timelock_until: passed ? 80_000u64 + TIMELOCK_STANDARD : 0u64,
            status: passed ? STATUS_PASSED : STATUS_REJECTED,
        };

        let is_config_update: bool = finalized.proposal_type == PROPOSAL_FEE_CHANGE || finalized.proposal_type == PROPOSAL_PARAMETER;
        let is_pause_update: bool = finalized.proposal_type == PROPOSAL_EMERGENCY_PAUSE;
        let config_key: field = is_config_update ? finalized.target : (is_pause_update ? CONFIG_PAUSE_STATE : CONFIG_NOOP);
        let config_value: u128 = (is_config_update || is_pause_update) ? finalized.payload_1 : 0u128;
        let approved: bool = finalized.payload_1 > 0u128;

        assert(passed);
        assert_eq(finalized.status, STATUS_PASSED);
        assert_eq(finalized.timelock_until, 91_520u64);
        assert_eq(config_key, CONFIG_NOOP);
        assert_eq(config_value, 0u128);
        assert(approved);
        assert_eq(finalized.payload_2, resolver_field);
    }
}
