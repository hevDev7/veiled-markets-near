// ============================================================================
// VEILED PARLAY — Unit Tests
// ============================================================================

program parlay_tests.aleo {
    @noupgrade
    async constructor() {}

    const ODDS_PRECISION: u128 = 10000u128;
    const FEE_BPS: u128 = 200u128;
    const FEE_DENOMINATOR: u128 = 10000u128;
    const DISPUTE_WINDOW_BLOCKS: u64 = 2880u64;

    // ---- Combined odds math ----

    @test
    transition test_two_leg_combined_odds() {
        // 2.5x × 3.0x = 7.5x
        let odds_1: u128 = 25000u128;
        let odds_2: u128 = 30000u128;
        let combined: u128 = (odds_1 * odds_2) / ODDS_PRECISION;
        assert_eq(combined, 75000u128);
    }

    @test
    transition test_three_leg_combined_odds() {
        // 2.0x × 2.0x × 2.0x = 8.0x
        let odds_1: u128 = 20000u128;
        let odds_2: u128 = 20000u128;
        let odds_3: u128 = 20000u128;
        let step_1: u128 = (odds_1 * odds_2) / ODDS_PRECISION;
        let combined: u128 = (step_1 * odds_3) / ODDS_PRECISION;
        assert_eq(combined, 80000u128);
    }

    @test
    transition test_four_leg_combined_odds() {
        // 2.5x × 3.0x × 4.0x × 2.0x = 60.0x
        let odds_1: u128 = 25000u128;
        let odds_2: u128 = 30000u128;
        let odds_3: u128 = 40000u128;
        let odds_4: u128 = 20000u128;
        let step_1: u128 = (odds_1 * odds_2) / ODDS_PRECISION;
        let step_2: u128 = (step_1 * odds_3) / ODDS_PRECISION;
        let combined: u128 = (step_2 * odds_4) / ODDS_PRECISION;
        assert_eq(combined, 600000u128);
    }

    // ---- Payout calculation with fees ----

    @test
    transition test_payout_with_fee() {
        let stake: u128 = 1000000u128;  // 1 token
        let combined_odds: u128 = 75000u128; // 7.5x
        let gross_payout: u128 = (stake * combined_odds) / ODDS_PRECISION;
        let fee: u128 = (gross_payout * FEE_BPS) / FEE_DENOMINATOR;
        let net_payout: u128 = gross_payout - fee;

        assert_eq(gross_payout, 7500000u128);
        assert_eq(fee, 150000u128);
        assert_eq(net_payout, 7350000u128);
    }

    @test
    transition test_payout_large_combined_odds() {
        let stake: u128 = 5000000u128;  // 5 tokens
        let combined_odds: u128 = 600000u128; // 60x
        let gross_payout: u128 = (stake * combined_odds) / ODDS_PRECISION;
        let fee: u128 = (gross_payout * FEE_BPS) / FEE_DENOMINATOR;
        let net_payout: u128 = gross_payout - fee;

        assert_eq(gross_payout, 300000000u128);     // 300 tokens
        assert_eq(fee, 6000000u128);                // 6 tokens fee
        assert_eq(net_payout, 294000000u128);       // 294 tokens net
    }

    // ---- Resolution logic ----

    @test
    transition test_all_legs_win() {
        let leg_1_outcome: u8 = 1u8;
        let leg_2_outcome: u8 = 2u8;
        let leg_3_outcome: u8 = 1u8;
        let num_legs: u8 = 3u8;

        let winning_1: u8 = 1u8;
        let winning_2: u8 = 2u8;
        let winning_3: u8 = 1u8;

        let leg_1_won: bool = leg_1_outcome == winning_1;
        let leg_2_won: bool = leg_2_outcome == winning_2;
        let leg_3_won: bool = num_legs < 3u8 || leg_3_outcome == winning_3;

        let all_won: bool = leg_1_won && leg_2_won && leg_3_won;
        assert(all_won);
    }

    @test
    transition test_one_leg_loses() {
        let leg_1_outcome: u8 = 1u8;
        let leg_2_outcome: u8 = 2u8;  // picked outcome 2
        let num_legs: u8 = 2u8;

        let winning_1: u8 = 1u8;
        let winning_2: u8 = 1u8;      // outcome 1 won, not 2

        let leg_1_won: bool = leg_1_outcome == winning_1;
        let leg_2_won: bool = leg_2_outcome == winning_2;

        let all_won: bool = leg_1_won && leg_2_won;
        assert(!all_won);  // Parlay loses
    }

    @test
    transition test_unused_legs_ignored() {
        // 2-leg parlay: legs 3 and 4 should be ignored
        let num_legs: u8 = 2u8;
        let leg_1_outcome: u8 = 1u8;
        let leg_2_outcome: u8 = 2u8;
        let leg_3_outcome: u8 = 0u8;  // unused
        let leg_4_outcome: u8 = 0u8;  // unused

        let winning_1: u8 = 1u8;
        let winning_2: u8 = 2u8;
        let winning_3: u8 = 3u8;  // doesn't matter
        let winning_4: u8 = 4u8;  // doesn't matter

        let leg_1_won: bool = leg_1_outcome == winning_1;
        let leg_2_won: bool = leg_2_outcome == winning_2;
        let leg_3_won: bool = num_legs < 3u8 || leg_3_outcome == winning_3;
        let leg_4_won: bool = num_legs < 4u8 || leg_4_outcome == winning_4;

        let all_won: bool = leg_1_won && leg_2_won && leg_3_won && leg_4_won;
        assert(all_won);  // Should win — unused legs are treated as won
    }

    // ---- Dispute window ----

    @test
    transition test_dispute_window_timing() {
        let submitted_at: u64 = 1000u64;
        let dispute_deadline: u64 = submitted_at + DISPUTE_WINDOW_BLOCKS;
        assert_eq(dispute_deadline, 3880u64);

        // During window: can dispute
        let during_window: u64 = 2000u64;
        assert(during_window <= dispute_deadline);

        // After window: can finalize
        let after_window: u64 = 3881u64;
        assert(after_window > dispute_deadline);
    }

    // ---- Pool risk management ----

    @test
    transition test_pool_covers_exposure() {
        let pool_balance: u128 = 100000000u128;     // 100 tokens
        let current_exposure: u128 = 50000000u128;   // 50 tokens committed
        let new_payout: u128 = 30000000u128;         // 30 tokens new parlay
        let new_stake: u128 = 1000000u128;           // 1 token stake incoming

        // Pool + new stake must cover exposure + new payout
        let pool_after: u128 = pool_balance + new_stake;
        let exposure_after: u128 = current_exposure + new_payout;
        assert(pool_after >= exposure_after);         // 101M >= 80M ✓
    }

    @test
    transition test_pool_insufficient() {
        let pool_balance: u128 = 10000000u128;       // 10 tokens
        let current_exposure: u128 = 5000000u128;    // 5 tokens committed
        let new_payout: u128 = 30000000u128;         // 30 tokens — too large
        let new_stake: u128 = 1000000u128;

        let pool_after: u128 = pool_balance + new_stake;
        let exposure_after: u128 = current_exposure + new_payout;
        assert(pool_after < exposure_after);          // 11M < 35M — would fail
    }

    // ---- Multi-token support ----

    @test
    transition test_token_type_constants() {
        let token_aleo: u8 = 1u8;
        let token_usdcx: u8 = 2u8;
        let token_usad: u8 = 3u8;

        assert(token_aleo != token_usdcx);
        assert(token_aleo != token_usad);
        assert(token_usdcx != token_usad);
        assert(token_aleo >= 1u8 && token_aleo <= 3u8);
        assert(token_usdcx >= 1u8 && token_usdcx <= 3u8);
        assert(token_usad >= 1u8 && token_usad <= 3u8);
    }

    // ---- No duplicate markets ----

    @test
    transition test_unique_market_ids() {
        let market_1: field = 111field;
        let market_2: field = 222field;
        let market_3: field = 333field;

        assert(market_1 != market_2);
        assert(market_1 != market_3);
        assert(market_2 != market_3);
    }

    // ---- Dispute bond tracking ----

    @test
    transition test_dispute_bond_amount() {
        let min_stake: u128 = 100000u128;
        let multiplier: u128 = 3u128;
        let bond: u128 = min_stake * multiplier;
        assert_eq(bond, 300000u128);
    }

    @test
    transition test_dispute_bond_keys() {
        // Different disputers get different bond keys
        let parlay_id: field = 123field;
        let disputer_1: address = aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc;
        let disputer_2: address = aleo1qgqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqanmpl0;

        // Bond keys should differ (hashes of different addresses)
        assert(disputer_1 != disputer_2);
    }

    // ---- Pool withdrawal safety ----

    @test
    transition test_withdraw_only_excess() {
        let pool: u128 = 100000000u128;     // 100 tokens
        let exposure: u128 = 60000000u128;  // 60 tokens committed
        let withdraw: u128 = 30000000u128;  // 30 tokens

        // After withdrawal: pool=70, exposure=60 → OK
        let pool_after: u128 = pool - withdraw;
        assert(pool_after >= exposure);
    }

    @test
    transition test_withdraw_over_exposed() {
        let pool: u128 = 100000000u128;     // 100 tokens
        let exposure: u128 = 60000000u128;  // 60 tokens committed
        let withdraw: u128 = 50000000u128;  // 50 tokens — too much

        // After withdrawal: pool=50, exposure=60 → FAIL
        let pool_after: u128 = pool - withdraw;
        assert(pool_after < exposure);  // Would be rejected on-chain
    }

    // ---- Cancel proof verification ----

    @test
    transition test_cancel_leg_must_match() {
        let leg_1_market: field = 111field;
        let leg_2_market: field = 222field;
        let cancelled_market: field = 222field;

        let is_leg: bool =
            cancelled_market == leg_1_market ||
            cancelled_market == leg_2_market;
        assert(is_leg);
    }

    @test
    transition test_cancel_unrelated_reject() {
        let leg_1_market: field = 111field;
        let leg_2_market: field = 222field;
        let unrelated_market: field = 999field;

        let is_leg: bool =
            unrelated_market == leg_1_market ||
            unrelated_market == leg_2_market;
        assert(!is_leg);  // Would be rejected
    }

    // ---- Treasury fee math ----

    @test
    transition test_treasury_accumulates_fees() {
        let treasury_before: u128 = 500000u128;
        let new_fee: u128 = 150000u128;
        let treasury_after: u128 = treasury_before + new_fee;
        assert_eq(treasury_after, 650000u128);

        // Withdraw partial
        let withdraw: u128 = 400000u128;
        assert(treasury_after >= withdraw);
        let treasury_final: u128 = treasury_after - withdraw;
        assert_eq(treasury_final, 250000u128);
    }
}
