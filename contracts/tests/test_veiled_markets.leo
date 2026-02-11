// ============================================================================
// VEILED MARKETS - Leo Contract Tests (v4 compatible)
// ============================================================================
// Run tests with: leo test
// ============================================================================

program test_veiled_markets.aleo {
    @noupgrade
    async constructor() {}

    @test
    transition test_fee_bps_math() {
        let protocol_fee_bps: u64 = 100u64;
        let creator_fee_bps: u64 = 100u64;
        let total_fee_bps: u64 = protocol_fee_bps + creator_fee_bps;
        assert_eq(total_fee_bps, 200u64);
    }

    @test
    transition test_minimum_bet_math() {
        let min_bet_amount: u64 = 1000u64;
        let doubled: u64 = min_bet_amount * 2u64;
        assert_eq(doubled, 2000u64);
    }
}
