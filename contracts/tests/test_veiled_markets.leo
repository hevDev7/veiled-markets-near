// ============================================================================
// VEILED MARKETS - Stable Leo Runtime Spot Checks
// ============================================================================
// Non-exact floor-division FPMM paths are covered in SDK BigInt parity tests,
// because `leo test` on Leo 3.5/snarkVM 4.5 panics on those divisions in this
// environment even though the contract formulas are valid.

program test_veiled_markets.aleo {
    @noupgrade
    async constructor() {}

    const PROTOCOL_FEE_BPS: u64 = 50u64;
    const CREATOR_FEE_BPS: u64 = 50u64;
    const LP_FEE_BPS: u64 = 100u64;
    const FEE_DENOMINATOR: u64 = 10000u64;

    @test
    transition test_buy_binary_exact() {
        let reserve_1: u64 = 10000u64;
        let reserve_2: u64 = 10000u64;
        let amount_in: u64 = 2000u64;

        let protocol_fee: u64 = (amount_in * PROTOCOL_FEE_BPS) / FEE_DENOMINATOR;
        let creator_fee: u64 = (amount_in * CREATOR_FEE_BPS) / FEE_DENOMINATOR;
        let amount_to_pool: u64 = amount_in - protocol_fee - creator_fee;
        let step2: u64 = (reserve_1 * reserve_2) / (reserve_2 + amount_to_pool);
        let shares_out: u64 = (reserve_1 + amount_to_pool) - step2;
        let new_reserve_2: u64 = reserve_2 + amount_to_pool;

        assert_eq(protocol_fee, 10u64);
        assert_eq(creator_fee, 10u64);
        assert_eq(amount_to_pool, 1980u64);
        assert_eq(step2, 8347u64);
        assert_eq(shares_out, 3633u64);
        assert_eq(new_reserve_2, 11980u64);
    }

    @test
    transition test_sell_binary_exact() {
        let reserve_1: u64 = 8347u64;
        let reserve_2: u64 = 11980u64;
        let tokens_desired: u64 = 1000u64;

        let protocol_fee: u64 = (tokens_desired * PROTOCOL_FEE_BPS) / FEE_DENOMINATOR;
        let creator_fee: u64 = (tokens_desired * CREATOR_FEE_BPS) / FEE_DENOMINATOR;
        let lp_fee: u64 = (tokens_desired * LP_FEE_BPS) / FEE_DENOMINATOR;
        let pool_tokens_out: u64 = tokens_desired - lp_fee;
        let step2: u64 = (reserve_1 * reserve_2) / (reserve_2 - pool_tokens_out);
        let shares_needed: u64 = step2 - reserve_1 + pool_tokens_out;
        let net_tokens: u64 = tokens_desired - protocol_fee - creator_fee - lp_fee;

        assert_eq(protocol_fee, 5u64);
        assert_eq(creator_fee, 5u64);
        assert_eq(lp_fee, 10u64);
        assert_eq(pool_tokens_out, 990u64);
        assert_eq(step2, 9098u64);
        assert_eq(shares_needed, 1741u64);
        assert_eq(net_tokens, 980u64);
    }

    @test
    transition test_buy4_exact() {
        let reserve_1: u64 = 10000u64;
        let reserve_2: u64 = 10000u64;
        let reserve_3: u64 = 10000u64;
        let reserve_4: u64 = 10000u64;
        let amount_in: u64 = 4000u64;

        let protocol_fee: u64 = (amount_in * PROTOCOL_FEE_BPS) / FEE_DENOMINATOR;
        let creator_fee: u64 = (amount_in * CREATOR_FEE_BPS) / FEE_DENOMINATOR;
        let amount_to_pool: u64 = amount_in - protocol_fee - creator_fee;

        let step2: u64 = (reserve_3 * reserve_1) / (reserve_1 + amount_to_pool);
        let step3: u64 = (step2 * reserve_2) / (reserve_2 + amount_to_pool);
        let step4: u64 = (step3 * reserve_4) / (reserve_4 + amount_to_pool);
        let shares_out: u64 = (reserve_3 + amount_to_pool) - step4;

        assert_eq(protocol_fee, 20u64);
        assert_eq(creator_fee, 20u64);
        assert_eq(amount_to_pool, 3960u64);
        assert_eq(step4, 3675u64);
        assert_eq(shares_out, 10285u64);
    }

    @test
    transition test_add_lp4_exact() {
        let reserve_1: u64 = 12000u64;
        let reserve_2: u64 = 8000u64;
        let reserve_3: u64 = 5000u64;
        let reserve_4: u64 = 7000u64;
        let total_lp_shares: u64 = 64000u64;
        let amount: u64 = 16000u64;
        let total_reserves: u64 = reserve_1 + reserve_2 + reserve_3 + reserve_4;

        let minted_lp_shares: u64 = (amount * total_lp_shares) / total_reserves;
        let add_1: u64 = (amount * reserve_1) / total_reserves;
        let add_2: u64 = (amount * reserve_2) / total_reserves;
        let add_3: u64 = (amount * reserve_3) / total_reserves;
        let add_4: u64 = amount - add_1 - add_2 - add_3;

        assert_eq(total_reserves, 32000u64);
        assert_eq(minted_lp_shares, 32000u64);
        assert_eq(add_1, 6000u64);
        assert_eq(add_2, 4000u64);
        assert_eq(add_3, 2500u64);
        assert_eq(add_4, 3500u64);
        assert_eq(add_1 + add_2 + add_3 + add_4, amount);
    }
}
