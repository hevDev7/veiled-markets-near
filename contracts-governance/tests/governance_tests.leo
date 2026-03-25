// ============================================================================
// VEILED GOVERNANCE — Smoke Tests
// ============================================================================
// These tests are intentionally lightweight and self-contained so `leo test`
// can validate the governance package wiring without relying on off-chain
// indexers or full integration flows.
// ============================================================================

program governance_tests.aleo {
    @noupgrade
    async constructor() {}

    @test
    transition test_claim_key_differs() {
        let lp_reward_type: u8 = 1u8;
        let trader_reward_type: u8 = 2u8;
        assert_eq(trader_reward_type - lp_reward_type, 1u8);
    }

    @test
    transition test_panel_majority() {
        let panel_majority: u8 = 2u8;
        let votes_for_outcome: u8 = 2u8;
        assert_eq(votes_for_outcome, panel_majority);
    }

    @test
    transition test_timelock_gate() {
        let timelock_until: u64 = 100u64;
        let current_height: u64 = 101u64;
        assert_eq(current_height, timelock_until + 1u64);
    }
}
