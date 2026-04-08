program resolution_flow_tests.aleo {
    @noupgrade
    constructor() {}

    const MARKET_STATUS_RESOLVED: u8 = 3u8;
    const VOTER_REWARD_PERCENT: u64 = 20u64;
    const MIN_VOTE_BOND: u64 = 1000000u64;
    const MIN_VOTERS: u8 = 3u8;
    const VOTE_WINDOW_BLOCKS: u64 = 2880u64;
    const DISPUTE_WINDOW_BLOCKS: u64 = 2880u64;
    const WINNER_CLAIM_PRIORITY_BLOCKS: u64 = 2880u64;
    const DISPUTE_BOND_MULTIPLIER: u64 = 3u64;

    // FPMM fee constants (merged from former test_veiled_markets.leo)
    const PROTOCOL_FEE_BPS: u64 = 50u64;
    const CREATOR_FEE_BPS: u64 = 50u64;
    const LP_FEE_BPS: u64 = 100u64;
    const FEE_DENOMINATOR: u64 = 10000u64;

    @test
    fn test_vote_window_bonds() {
        let first_vote_height: u64 = 100u64;
        let voting_deadline: u64 = first_vote_height + VOTE_WINDOW_BLOCKS;
        let total_bonded: u64 = MIN_VOTE_BOND * 3u64;

        assert_eq(voting_deadline, 2980u64);
        assert_eq(total_bonded, 3000000u64);
        assert_eq(3u8, MIN_VOTERS);
    }

    @test
    fn test_confirm_resolution_reward() {
        let protocol_fees: u64 = 5000u64;
        let total_reward: u64 = (protocol_fees * VOTER_REWARD_PERCENT) / 100u64;
        let dispute_deadline: u64 = 5861u64;
        let confirm_height: u64 = dispute_deadline + 1u64;

        assert_eq(total_reward, 1000u64);
        assert_eq(confirm_height, 5862u64);
        assert_eq(MARKET_STATUS_RESOLVED, 3u8);
    }

    @test
    fn test_dispute_bond_multiplier() {
        let total_bonded: u64 = 3000000u64;
        let min_dispute_bond: u64 = total_bonded * DISPUTE_BOND_MULTIPLIER;

        assert_eq(min_dispute_bond, 9000000u64);
        assert_eq(DISPUTE_BOND_MULTIPLIER, 3u64);
    }

    @test
    fn test_claim_priority_unlock() {
        let dispute_deadline: u64 = 5861u64;
        let winner_claim_unlock: u64 = dispute_deadline + WINNER_CLAIM_PRIORITY_BLOCKS;

        assert_eq(winner_claim_unlock, 8741u64);
        assert_eq(winner_claim_unlock - dispute_deadline, WINNER_CLAIM_PRIORITY_BLOCKS);
    }

    @test
    fn test_finalize_pick_max() {
        let current_height: u64 = 3000u64;
        let outcome_1_bonds: u64 = MIN_VOTE_BOND * 1u64;
        let outcome_2_bonds: u64 = MIN_VOTE_BOND * 4u64;
        let outcome_3_bonds: u64 = MIN_VOTE_BOND * 2u64;
        let outcome_4_bonds: u64 = 0u64;

        let max_bonds: u64 = outcome_1_bonds;
        let winner: u8 = 1u8;
        let is_o2_higher: bool = outcome_2_bonds > max_bonds;
        let max2: u64 = is_o2_higher ? outcome_2_bonds : max_bonds;
        let winner2: u8 = is_o2_higher ? 2u8 : winner;
        let is_o3_higher: bool = outcome_3_bonds > max2;
        let max3: u64 = is_o3_higher ? outcome_3_bonds : max2;
        let winner3: u8 = is_o3_higher ? 3u8 : winner2;
        let is_o4_higher: bool = outcome_4_bonds > max3;
        let winning_outcome: u8 = is_o4_higher ? 4u8 : winner3;
        let dispute_deadline: u64 = current_height + DISPUTE_WINDOW_BLOCKS;

        assert_eq(winning_outcome, 2u8);
        assert_eq(dispute_deadline, 5880u64);
    }

    @test
    fn test_finalize_tie_first() {
        let outcome_1_bonds: u64 = MIN_VOTE_BOND * 3u64;
        let outcome_2_bonds: u64 = MIN_VOTE_BOND * 3u64;
        let outcome_3_bonds: u64 = MIN_VOTE_BOND * 1u64;
        let outcome_4_bonds: u64 = 0u64;

        let max_bonds: u64 = outcome_1_bonds;
        let winner: u8 = 1u8;
        let is_o2_higher: bool = outcome_2_bonds > max_bonds;
        let max2: u64 = is_o2_higher ? outcome_2_bonds : max_bonds;
        let winner2: u8 = is_o2_higher ? 2u8 : winner;
        let is_o3_higher: bool = outcome_3_bonds > max2;
        let max3: u64 = is_o3_higher ? outcome_3_bonds : max2;
        let winner3: u8 = is_o3_higher ? 3u8 : winner2;
        let is_o4_higher: bool = outcome_4_bonds > max3;
        let winning_outcome: u8 = is_o4_higher ? 4u8 : winner3;

        assert_eq(winning_outcome, 1u8);
    }

    @test
    fn test_dispute_override() {
        let voted_winner: u8 = 2u8;
        let proposed_outcome: u8 = 4u8;
        let total_bonded: u64 = MIN_VOTE_BOND * 3u64;
        let min_dispute_bond: u64 = total_bonded * DISPUTE_BOND_MULTIPLIER;
        let dispute_bond: u64 = 9000000u64;
        let final_winner: u8 = proposed_outcome;

        assert(proposed_outcome != voted_winner);
        assert_eq(min_dispute_bond, 9000000u64);
        assert(dispute_bond >= min_dispute_bond);
        assert_eq(final_winner, 4u8);
    }

    @test
    fn test_resolution_timeline() {
        let first_vote_height: u64 = 100u64;
        let voting_deadline: u64 = first_vote_height + VOTE_WINDOW_BLOCKS;
        let finalize_height: u64 = voting_deadline + 1u64;
        let dispute_deadline: u64 = finalize_height + DISPUTE_WINDOW_BLOCKS;
        let confirm_height: u64 = dispute_deadline + 1u64;
        let winner_claim_unlock: u64 = dispute_deadline + WINNER_CLAIM_PRIORITY_BLOCKS;

        assert_eq(voting_deadline, 2980u64);
        assert_eq(finalize_height, 2981u64);
        assert_eq(dispute_deadline, 5861u64);
        assert_eq(confirm_height, 5862u64);
        assert_eq(winner_claim_unlock, 8741u64);
    }

    // ========================================================================
    // v37 / v6 post-audit fix tests
    // ========================================================================

    // Bug B (auth check) — shadow logic for the new gating: cross-program
    // caller must equal `veiled_governance_v6.aleo` (the program-derived
    // address). Direct deployer wallet calls must NOT be accepted.
    @test
    fn test_gov_caller_check() {
        // The deployer wallet MUST NOT be allowed to satisfy the new check.
        // We model the v37 assertion as `caller == veiled_governance_v6.aleo`
        // and confirm that an arbitrary deployer-equivalent address fails it.
        let deployer: address = aleo10tm5ektsr5v7kdc5phs8pha42vrkhe2rlxfl2v979wunhzx07vpqnqplv8;
        let governance_program: address = veiled_governance_v6.aleo;

        // The deployer wallet is NOT the governance program address.
        assert(deployer != governance_program);

        // Only governance program calls satisfy the assertion.
        let caller_governance: address = veiled_governance_v6.aleo;
        let auth_ok: bool = caller_governance == governance_program;
        assert(auth_ok);

        // Direct deployer call would fail the auth check.
        let auth_fail: bool = deployer == governance_program;
        assert(!auth_fail);
    }

    // Bug D (namespace collision) — same creator/question/deadline/nonce on
    // different token contracts must produce DIFFERENT market_ids when
    // token_type is part of the seed.
    struct MarketSeedV37 {
        creator: address,
        question_hash: field,
        deadline: u64,
        nonce: u64,
        token_type: u8,
    }

    @test
    fn test_seed_token_namespace() {
        let creator: address = aleo10tm5ektsr5v7kdc5phs8pha42vrkhe2rlxfl2v979wunhzx07vpqnqplv8;
        let qh: field = 12345field;
        let dl: u64 = 1000u64;
        let n: u64 = 2000u64;

        let id_aleo: field = BHP256::hash_to_field(MarketSeedV37 {
            creator: creator, question_hash: qh, deadline: dl, nonce: n, token_type: 1u8,
        });
        let id_usdcx: field = BHP256::hash_to_field(MarketSeedV37 {
            creator: creator, question_hash: qh, deadline: dl, nonce: n, token_type: 2u8,
        });
        let id_usad: field = BHP256::hash_to_field(MarketSeedV37 {
            creator: creator, question_hash: qh, deadline: dl, nonce: n, token_type: 3u8,
        });

        // All three market IDs MUST be distinct so governance state keyed by
        // raw market_id cannot collide across token contracts.
        assert(id_aleo != id_usdcx);
        assert(id_aleo != id_usad);
        assert(id_usdcx != id_usad);
    }

    // Bug C (tier passthrough) — apply_governance_resolution must accept
    // tier 2 (committee) AND tier 3 (community), and reject anything else.
    @test
    fn test_gov_tier_bounds() {
        let valid_committee: u8 = 2u8;
        let valid_community: u8 = 3u8;
        let invalid_zero: u8 = 0u8;
        let invalid_one: u8 = 1u8;
        let invalid_four: u8 = 4u8;

        let committee_ok: bool = valid_committee == 2u8 || valid_committee == 3u8;
        let community_ok: bool = valid_community == 2u8 || valid_community == 3u8;
        let zero_ok: bool = invalid_zero == 2u8 || invalid_zero == 3u8;
        let one_ok: bool = invalid_one == 2u8 || invalid_one == 3u8;
        let four_ok: bool = invalid_four == 2u8 || invalid_four == 3u8;

        assert(committee_ok);
        assert(community_ok);
        assert(!zero_ok);
        assert(!one_ok);
        assert(!four_ok);
    }

    // ========================================================================
    // FPMM math spot checks (merged from former test_veiled_markets.leo)
    // ========================================================================

    @test
    fn test_buy_binary_exact() {
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
    fn test_sell_binary_exact() {
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
    fn test_buy4_exact() {
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
    fn test_add_lp4_exact() {
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
