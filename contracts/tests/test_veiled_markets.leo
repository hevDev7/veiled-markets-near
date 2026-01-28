// ============================================================================
// VEILED MARKETS - Leo Contract Tests
// ============================================================================
// Run tests with: leo test
// ============================================================================

program veiled_markets_test.aleo {
    
    // Import the main program
    import veiled_markets.aleo;
    
    // ========================================================================
    // TEST CONSTANTS
    // ========================================================================
    
    const TEST_CREATOR: address = aleo1rhgdu77hgyqd3xjj8ucu3jj9r2krwz6mnzyd80gncr5fxcwlh5rsvzp9px;
    const TEST_BETTOR: address = aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc;
    const TEST_QUESTION_HASH: field = 123456789field;
    const TEST_CATEGORY: u8 = 3u8; // Crypto category
    
    // ========================================================================
    // UNIT TESTS
    // ========================================================================
    
    // Test: calculate_yes_probability returns 50% for equal pools
    #[test]
    function test_probability_equal_pools() {
        let yes_pool: u64 = 1000u64;
        let no_pool: u64 = 1000u64;
        let probability: u64 = veiled_markets.aleo/calculate_yes_probability(yes_pool, no_pool);
        assert_eq(probability, 5000u64); // 50.00% in basis points
    }
    
    // Test: calculate_yes_probability returns 0% for empty yes pool
    #[test]
    function test_probability_empty_yes() {
        let yes_pool: u64 = 0u64;
        let no_pool: u64 = 1000u64;
        let probability: u64 = veiled_markets.aleo/calculate_yes_probability(yes_pool, no_pool);
        assert_eq(probability, 0u64);
    }
    
    // Test: calculate_yes_probability returns 100% for empty no pool
    #[test]
    function test_probability_empty_no() {
        let yes_pool: u64 = 1000u64;
        let no_pool: u64 = 0u64;
        let probability: u64 = veiled_markets.aleo/calculate_yes_probability(yes_pool, no_pool);
        assert_eq(probability, 10000u64); // 100.00%
    }
    
    // Test: calculate_yes_probability returns 50% for both empty
    #[test]
    function test_probability_both_empty() {
        let yes_pool: u64 = 0u64;
        let no_pool: u64 = 0u64;
        let probability: u64 = veiled_markets.aleo/calculate_yes_probability(yes_pool, no_pool);
        assert_eq(probability, 5000u64); // Default 50%
    }
    
    // Test: calculate_odds for YES outcome
    #[test]
    function test_odds_yes() {
        let yes_pool: u64 = 2500u64;
        let no_pool: u64 = 7500u64;
        // Total = 10000, YES = 2500
        // Odds = 10000 * 10000 / 2500 = 40000 (4.00x)
        let odds: u64 = veiled_markets.aleo/calculate_odds(true, yes_pool, no_pool);
        assert_eq(odds, 40000u64);
    }
    
    // Test: calculate_odds for NO outcome  
    #[test]
    function test_odds_no() {
        let yes_pool: u64 = 2500u64;
        let no_pool: u64 = 7500u64;
        // Total = 10000, NO = 7500
        // Odds = 10000 * 10000 / 7500 = 13333 (1.33x)
        let odds: u64 = veiled_markets.aleo/calculate_odds(false, yes_pool, no_pool);
        assert(odds > 13000u64 && odds < 14000u64);
    }
    
    // Test: calculate_potential_payout
    #[test]
    function test_potential_payout() {
        let bet_amount: u64 = 1000u64;
        let yes_pool: u64 = 4000u64;
        let no_pool: u64 = 6000u64;
        // Gross = 1000 * 10000 / 4000 = 2500
        // Fees = 2500 * 200 / 10000 = 50
        // Net = 2500 - 50 = 2450
        let payout: u64 = veiled_markets.aleo/calculate_potential_payout(
            bet_amount, 
            true, 
            yes_pool, 
            no_pool
        );
        assert_eq(payout, 2450u64);
    }
    
    // Test: outcome constants are correct
    #[test]
    function test_outcome_constants() {
        assert_eq(veiled_markets.aleo/OUTCOME_YES, 1u8);
        assert_eq(veiled_markets.aleo/OUTCOME_NO, 2u8);
    }
    
    // Test: status constants are correct
    #[test]
    function test_status_constants() {
        assert_eq(veiled_markets.aleo/MARKET_STATUS_ACTIVE, 1u8);
        assert_eq(veiled_markets.aleo/MARKET_STATUS_CLOSED, 2u8);
        assert_eq(veiled_markets.aleo/MARKET_STATUS_RESOLVED, 3u8);
        assert_eq(veiled_markets.aleo/MARKET_STATUS_CANCELLED, 4u8);
    }
    
    // Test: fee constants are correct
    #[test]
    function test_fee_constants() {
        assert_eq(veiled_markets.aleo/PROTOCOL_FEE_BPS, 100u64); // 1%
        assert_eq(veiled_markets.aleo/CREATOR_FEE_BPS, 100u64); // 1%
        assert_eq(veiled_markets.aleo/FEE_DENOMINATOR, 10000u64);
    }
    
    // Test: minimum bet amount is correct
    #[test]
    function test_min_bet_amount() {
        assert_eq(veiled_markets.aleo/MIN_BET_AMOUNT, 1000u64);
    }
    
    // ========================================================================
    // STRUCT TESTS
    // ========================================================================
    
    // Test: Market struct creation
    #[test]
    function test_market_struct() {
        let market: veiled_markets.aleo/Market = veiled_markets.aleo/Market {
            id: 1field,
            creator: TEST_CREATOR,
            question_hash: TEST_QUESTION_HASH,
            category: TEST_CATEGORY,
            deadline: 100000u64,
            resolution_deadline: 110000u64,
            status: 1u8,
            created_at: 50000u64,
        };
        
        assert_eq(market.id, 1field);
        assert_eq(market.creator, TEST_CREATOR);
        assert_eq(market.status, 1u8);
    }
    
    // Test: MarketPool struct creation
    #[test]
    function test_market_pool_struct() {
        let pool: veiled_markets.aleo/MarketPool = veiled_markets.aleo/MarketPool {
            market_id: 1field,
            total_yes_pool: 5000u64,
            total_no_pool: 5000u64,
            total_bets: 10u64,
            total_unique_bettors: 8u64,
        };
        
        assert_eq(pool.total_yes_pool + pool.total_no_pool, 10000u64);
        assert_eq(pool.total_bets, 10u64);
    }
    
    // Test: MarketResolution struct creation
    #[test]
    function test_resolution_struct() {
        let resolution: veiled_markets.aleo/MarketResolution = veiled_markets.aleo/MarketResolution {
            market_id: 1field,
            winning_outcome: 1u8,
            resolver: TEST_CREATOR,
            resolved_at: 100000u64,
            total_payout_pool: 9800u64, // After 2% fees
        };
        
        assert_eq(resolution.winning_outcome, 1u8);
        assert_eq(resolution.total_payout_pool, 9800u64);
    }
    
    // ========================================================================
    // RECORD TESTS
    // ========================================================================
    
    // Test: Bet record creation
    #[test]
    function test_bet_record() {
        let bet: veiled_markets.aleo/Bet = veiled_markets.aleo/Bet {
            owner: TEST_BETTOR,
            market_id: 1field,
            amount: 1000u64,
            outcome: 1u8, // YES
            placed_at: 50000u64,
        };
        
        assert_eq(bet.owner, TEST_BETTOR);
        assert_eq(bet.amount, 1000u64);
        assert_eq(bet.outcome, 1u8);
    }
    
    // Test: WinningsClaim record creation
    #[test]
    function test_winnings_claim_record() {
        let claim: veiled_markets.aleo/WinningsClaim = veiled_markets.aleo/WinningsClaim {
            owner: TEST_BETTOR,
            market_id: 1field,
            bet_amount: 1000u64,
            winning_outcome: 1u8,
        };
        
        assert_eq(claim.owner, TEST_BETTOR);
        assert_eq(claim.bet_amount, 1000u64);
    }
    
    // Test: RefundClaim record creation
    #[test]
    function test_refund_claim_record() {
        let refund: veiled_markets.aleo/RefundClaim = veiled_markets.aleo/RefundClaim {
            owner: TEST_BETTOR,
            market_id: 1field,
            amount: 1000u64,
        };
        
        assert_eq(refund.owner, TEST_BETTOR);
        assert_eq(refund.amount, 1000u64);
    }
    
    // ========================================================================
    // HELPER STRUCT TESTS
    // ========================================================================
    
    // Test: MarketSeed struct for ID generation
    #[test]
    function test_market_seed() {
        let seed: veiled_markets.aleo/MarketSeed = veiled_markets.aleo/MarketSeed {
            creator: TEST_CREATOR,
            question_hash: TEST_QUESTION_HASH,
            deadline: 100000u64,
            nonce: 110000u64,
        };
        
        // Verify struct can be hashed
        let market_id: field = BHP256::hash_to_field(seed);
        assert(market_id != 0field);
    }
    
    // Test: ClaimKey struct for claim tracking
    #[test]
    function test_claim_key() {
        let key: veiled_markets.aleo/ClaimKey = veiled_markets.aleo/ClaimKey {
            market_id: 1field,
            claimer: TEST_BETTOR,
        };
        
        // Verify struct can be hashed
        let claim_key: field = BHP256::hash_to_field(key);
        assert(claim_key != 0field);
    }
    
    // ========================================================================
    // EDGE CASE TESTS
    // ========================================================================
    
    // Test: Large pool values don't overflow
    #[test]
    function test_large_pools() {
        let yes_pool: u64 = 18446744073709551615u64; // Max u64
        let no_pool: u64 = 0u64;
        let probability: u64 = veiled_markets.aleo/calculate_yes_probability(yes_pool, no_pool);
        assert_eq(probability, 10000u64); // 100%
    }
    
    // Test: Minimum bet amount is enforced
    #[test]
    function test_minimum_bet() {
        let min_bet: u64 = veiled_markets.aleo/MIN_BET_AMOUNT;
        assert(min_bet >= 1000u64);
    }
    
    // Test: Fee calculation doesn't overflow
    #[test]
    function test_fee_calculation() {
        let pool: u64 = 1000000000u64; // 1 billion
        let protocol_fee: u64 = (pool * 100u64) / 10000u64;
        let creator_fee: u64 = (pool * 100u64) / 10000u64;
        let total_fee: u64 = protocol_fee + creator_fee;
        
        // 2% of 1 billion = 20 million
        assert_eq(total_fee, 20000000u64);
    }
}
