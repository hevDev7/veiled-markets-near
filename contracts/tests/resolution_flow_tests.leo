program resolution_flow_tests.aleo {
    @noupgrade
    async constructor() {}

    const MARKET_STATUS_RESOLVED: u8 = 3u8;
    const VOTER_REWARD_PERCENT: u64 = 20u64;
    const MIN_VOTE_BOND: u64 = 1000000u64;
    const MIN_VOTERS: u8 = 3u8;
    const VOTE_WINDOW_BLOCKS: u64 = 2880u64;
    const DISPUTE_WINDOW_BLOCKS: u64 = 2880u64;
    const WINNER_CLAIM_PRIORITY_BLOCKS: u64 = 2880u64;
    const DISPUTE_BOND_MULTIPLIER: u64 = 3u64;

    @test
    transition test_vote_window_bonds() {
        let first_vote_height: u64 = 100u64;
        let voting_deadline: u64 = first_vote_height + VOTE_WINDOW_BLOCKS;
        let total_bonded: u64 = MIN_VOTE_BOND * 3u64;

        assert_eq(voting_deadline, 2980u64);
        assert_eq(total_bonded, 3000000u64);
        assert_eq(3u8, MIN_VOTERS);
    }

    @test
    transition test_confirm_resolution_reward() {
        let protocol_fees: u64 = 5000u64;
        let total_reward: u64 = (protocol_fees * VOTER_REWARD_PERCENT) / 100u64;
        let dispute_deadline: u64 = 5861u64;
        let confirm_height: u64 = dispute_deadline + 1u64;

        assert_eq(total_reward, 1000u64);
        assert_eq(confirm_height, 5862u64);
        assert_eq(MARKET_STATUS_RESOLVED, 3u8);
    }

    @test
    transition test_dispute_bond_multiplier() {
        let total_bonded: u64 = 3000000u64;
        let min_dispute_bond: u64 = total_bonded * DISPUTE_BOND_MULTIPLIER;

        assert_eq(min_dispute_bond, 9000000u64);
        assert_eq(DISPUTE_BOND_MULTIPLIER, 3u64);
    }

    @test
    transition test_claim_priority_unlock() {
        let dispute_deadline: u64 = 5861u64;
        let winner_claim_unlock: u64 = dispute_deadline + WINNER_CLAIM_PRIORITY_BLOCKS;

        assert_eq(winner_claim_unlock, 8741u64);
        assert_eq(winner_claim_unlock - dispute_deadline, WINNER_CLAIM_PRIORITY_BLOCKS);
    }

    @test
    transition test_finalize_pick_max() {
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
    transition test_finalize_tie_first() {
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
    transition test_dispute_override() {
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
    transition test_resolution_timeline() {
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
}
