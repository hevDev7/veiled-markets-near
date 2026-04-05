// ============================================================================
// VEILED GOVERNANCE — Standalone Logic Tests
// ============================================================================
// This suite intentionally has no external dependencies, so it can run on a
// clean temporary Leo home even when the user's global registry is stale.
// ============================================================================

program governance_logic_suite.aleo {
    @noupgrade
    async constructor() {}

    const MIN_PROPOSAL_STAKE: u64 = 10_000000u64;
    const VOTING_PERIOD_BLOCKS: u64 = 40320u64;
    const TIMELOCK_STANDARD: u64 = 11520u64;
    const TIMELOCK_LONG: u64 = 17280u64;
    const EMERGENCY_TIMELOCK: u64 = 0u64;

    const PROPOSAL_RESOLVE_DISPUTE: u8 = 1u8;
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

    const QUORUM_RESOLVE: u128 = 100_000000u128;
    const QUORUM_FEE: u128 = 500_000000u128;
    const QUORUM_TREASURY: u128 = 1000_000000u128;
    const QUORUM_PARAMETER: u128 = 250_000000u128;
    const QUORUM_EMERGENCY: u128 = 50_000000u128;
    const QUORUM_RESOLVER: u128 = 500_000000u128;

    const PANEL_MAJORITY: u8 = 2u8;
    const DEPLOYER: address = aleo10tm5ektsr5v7kdc5phs8pha42vrkhe2rlxfl2v979wunhzx07vpqnqplv8;

    @test
    transition test_create_fee_prop() {
        let proposal_type: u8 = PROPOSAL_FEE_CHANGE;
        let created_at: u64 = 500u64;

        let q1: u128 = proposal_type == PROPOSAL_RESOLVE_DISPUTE ? QUORUM_RESOLVE : 0u128;
        let q2: u128 = proposal_type == PROPOSAL_FEE_CHANGE ? QUORUM_FEE : q1;
        let q3: u128 = proposal_type == PROPOSAL_TREASURY ? QUORUM_TREASURY : q2;
        let q4: u128 = proposal_type == PROPOSAL_PARAMETER ? QUORUM_PARAMETER : q3;
        let q5: u128 = proposal_type == PROPOSAL_EMERGENCY_PAUSE ? QUORUM_EMERGENCY : q4;
        let quorum: u128 = proposal_type == PROPOSAL_RESOLVER_ELECTION ? QUORUM_RESOLVER : q5;
        let deadline: u64 = created_at + VOTING_PERIOD_BLOCKS;

        assert_eq(quorum, QUORUM_FEE);
        assert_eq(deadline, 40820u64);
        assert_eq(MIN_PROPOSAL_STAKE, 10_000000u64);
    }

    @test
    transition test_create_pause_prop() {
        let proposal_type: u8 = PROPOSAL_EMERGENCY_PAUSE;

        let q1: u128 = proposal_type == PROPOSAL_RESOLVE_DISPUTE ? QUORUM_RESOLVE : 0u128;
        let q2: u128 = proposal_type == PROPOSAL_FEE_CHANGE ? QUORUM_FEE : q1;
        let q3: u128 = proposal_type == PROPOSAL_TREASURY ? QUORUM_TREASURY : q2;
        let q4: u128 = proposal_type == PROPOSAL_PARAMETER ? QUORUM_PARAMETER : q3;
        let q5: u128 = proposal_type == PROPOSAL_EMERGENCY_PAUSE ? QUORUM_EMERGENCY : q4;
        let quorum: u128 = proposal_type == PROPOSAL_RESOLVER_ELECTION ? QUORUM_RESOLVER : q5;

        assert_eq(quorum, QUORUM_EMERGENCY);
    }

    @test
    transition test_finalize_param_pass() {
        let proposal_type: u8 = PROPOSAL_PARAMETER;
        let votes_for: u128 = 300_000000u128;
        let votes_against: u128 = 100_000000u128;
        let quorum_required: u128 = QUORUM_PARAMETER;
        let current_height: u64 = 50000u64;
        let total_votes: u128 = votes_for + votes_against;
        let passed: bool = total_votes >= quorum_required && votes_for > votes_against;

        let is_fee_or_treasury: bool = proposal_type == PROPOSAL_FEE_CHANGE || proposal_type == PROPOSAL_TREASURY;
        let is_emergency: bool = proposal_type == PROPOSAL_EMERGENCY_PAUSE;
        let timelock: u64 = is_emergency ? EMERGENCY_TIMELOCK : (is_fee_or_treasury ? TIMELOCK_LONG : TIMELOCK_STANDARD);
        let new_status: u8 = passed ? STATUS_PASSED : STATUS_REJECTED;
        let lock_until: u64 = passed ? current_height + timelock : 0u64;

        assert(passed);
        assert_eq(new_status, STATUS_PASSED);
        assert_eq(lock_until, 61520u64);
    }

    @test
    transition test_finalize_no_quorum() {
        let proposal_type: u8 = PROPOSAL_FEE_CHANGE;
        let votes_for: u128 = 100_000000u128;
        let votes_against: u128 = 10_000000u128;
        let quorum_required: u128 = QUORUM_FEE;
        let current_height: u64 = 60000u64;
        let total_votes: u128 = votes_for + votes_against;
        let passed: bool = total_votes >= quorum_required && votes_for > votes_against;

        let is_fee_or_treasury: bool = proposal_type == PROPOSAL_FEE_CHANGE || proposal_type == PROPOSAL_TREASURY;
        let is_emergency: bool = proposal_type == PROPOSAL_EMERGENCY_PAUSE;
        let timelock: u64 = is_emergency ? EMERGENCY_TIMELOCK : (is_fee_or_treasury ? TIMELOCK_LONG : TIMELOCK_STANDARD);
        let new_status: u8 = passed ? STATUS_PASSED : STATUS_REJECTED;
        let lock_until: u64 = passed ? current_height + timelock : 0u64;

        assert(!passed);
        assert_eq(new_status, STATUS_REJECTED);
        assert_eq(lock_until, 0u64);
    }

    @test
    transition test_timelock_fee_long() {
        let proposal_type: u8 = PROPOSAL_FEE_CHANGE;
        let is_fee_or_treasury: bool = proposal_type == PROPOSAL_FEE_CHANGE || proposal_type == PROPOSAL_TREASURY;
        let is_emergency: bool = proposal_type == PROPOSAL_EMERGENCY_PAUSE;
        let timelock: u64 = is_emergency ? EMERGENCY_TIMELOCK : (is_fee_or_treasury ? TIMELOCK_LONG : TIMELOCK_STANDARD);

        assert_eq(timelock, TIMELOCK_LONG);
    }

    @test
    transition test_timelock_emerg_now() {
        let proposal_type: u8 = PROPOSAL_EMERGENCY_PAUSE;
        let is_fee_or_treasury: bool = proposal_type == PROPOSAL_FEE_CHANGE || proposal_type == PROPOSAL_TREASURY;
        let is_emergency: bool = proposal_type == PROPOSAL_EMERGENCY_PAUSE;
        let timelock: u64 = is_emergency ? EMERGENCY_TIMELOCK : (is_fee_or_treasury ? TIMELOCK_LONG : TIMELOCK_STANDARD);

        assert_eq(timelock, 0u64);
    }

    @test
    transition test_exec_param_route() {
        let proposal_type: u8 = PROPOSAL_PARAMETER;
        let target: field = CONFIG_MIN_TRADE_AMOUNT;
        let payload_1: u128 = 5_000000u128;
        let is_config_update: bool = proposal_type == PROPOSAL_FEE_CHANGE || proposal_type == PROPOSAL_PARAMETER;
        let is_pause_update: bool = proposal_type == PROPOSAL_EMERGENCY_PAUSE;
        let config_key: field = is_config_update ? target : (is_pause_update ? CONFIG_PAUSE_STATE : CONFIG_NOOP);
        let config_value: u128 = (is_config_update || is_pause_update) ? payload_1 : 0u128;

        assert_eq(config_key, CONFIG_MIN_TRADE_AMOUNT);
        assert_eq(config_value, 5_000000u128);
    }

    @test
    transition test_exec_pause_route() {
        let proposal_type: u8 = PROPOSAL_EMERGENCY_PAUSE;
        let target: field = CONFIG_PROTOCOL_FEE_BPS;
        let payload_1: u128 = 1u128;
        let is_config_update: bool = proposal_type == PROPOSAL_FEE_CHANGE || proposal_type == PROPOSAL_PARAMETER;
        let is_pause_update: bool = proposal_type == PROPOSAL_EMERGENCY_PAUSE;
        let config_key: field = is_config_update ? target : (is_pause_update ? CONFIG_PAUSE_STATE : CONFIG_NOOP);
        let config_value: u128 = (is_config_update || is_pause_update) ? payload_1 : 0u128;

        assert_eq(config_key, CONFIG_PAUSE_STATE);
        assert_eq(config_value, 1u128);
    }

    @test
    transition test_exec_resolver_noop() {
        let proposal_type: u8 = PROPOSAL_RESOLVER_ELECTION;
        let target: field = 99field;
        let payload_1: u128 = 1u128;
        let is_config_update: bool = proposal_type == PROPOSAL_FEE_CHANGE || proposal_type == PROPOSAL_PARAMETER;
        let is_pause_update: bool = proposal_type == PROPOSAL_EMERGENCY_PAUSE;
        let config_key: field = is_config_update ? target : (is_pause_update ? CONFIG_PAUSE_STATE : CONFIG_NOOP);
        let config_value: u128 = (is_config_update || is_pause_update) ? payload_1 : 0u128;

        assert_eq(config_key, CONFIG_NOOP);
        assert_eq(config_value, 0u128);
    }

    @test
    transition test_exec_treasury_match() {
        let proposal_type: u8 = PROPOSAL_TREASURY;
        let amount: u128 = 25_000000u128;
        let timelock_until: u64 = 100u64;
        let current_height: u64 = 101u64;
        let recipient: address = DEPLOYER;
        let recipient_hash: field = BHP256::hash_to_field(recipient);
        let payload_1: u128 = amount;
        let payload_2: field = recipient_hash;
        let new_status: u8 = STATUS_EXECUTED;

        assert_eq(proposal_type, PROPOSAL_TREASURY);
        assert(current_height > timelock_until);
        assert_eq(payload_1, amount);
        assert_eq(payload_2, recipient_hash);
        assert_eq(new_status, STATUS_EXECUTED);
    }

    @test
    transition test_panel_majority() {
        let votes_for_outcome: u8 = 2u8;
        assert_eq(votes_for_outcome, PANEL_MAJORITY);
        assert_eq(STATUS_ACTIVE, 0u8);
    }
}
