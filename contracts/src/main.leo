// ============================================================================
// VEILED MARKETS v11 - Privacy-Preserving Prediction Market Protocol
// ============================================================================
// Built on Aleo blockchain leveraging zero-knowledge proofs for complete
// betting privacy while maintaining market transparency and fairness.
//
// v11: Multi-token support (ALEO credits + USDCX stablecoin)
// - All internal amounts unified to u128
// - Markets are token-specific (token_type field)
// - Separate bet/payout transitions per token type
// - USDCX uses test_usdcx_stablecoin.aleo for transfers
//
// Architecture:
// - Records (Private State): Bet, WinningsClaim for user-specific data
// - Mappings (Public State): markets, market_pools for aggregate data
// - Async Transitions: For on-chain state mutations
//
// Privacy Model:
// - Individual bet amounts and outcomes are private (stored in Records)
// - Market totals are public (stored in Mappings) for odds calculation
// - ZK proofs verify bet validity without revealing position
//
// Credits Handling:
// - place_bet: Uses credits.aleo/transfer_private_to_public (hides bettor identity)
// - place_bet_public: Uses credits.aleo/transfer_public_as_signer (wallet-compatible)
// - place_bet_public_usdcx: Uses test_usdcx_stablecoin.aleo/transfer_public_as_signer
// - Winnings/refunds transferred back via respective token program's transfer_public
//
// v10 Audit Fixes (carried forward):
// - C-01: Unique bettor tracking via market_bettors mapping
// - C-02: Per-market credit isolation via market_credits mapping
// - C-03: Designated resolver (separate from creator)
// - H-01: Removed noise/delay mechanism
// - H-02: User-provided nonce for commit-reveal + reveal deadline enforcement
// ============================================================================

import credits.aleo;
import test_usdcx_stablecoin.aleo;

program veiled_markets_v11.aleo {

    // ========================================================================
    // CONSTANTS
    // ========================================================================

    // Market status constants
    const MARKET_STATUS_ACTIVE: u8 = 1u8;
    const MARKET_STATUS_CLOSED: u8 = 2u8;
    const MARKET_STATUS_RESOLVED: u8 = 3u8;
    const MARKET_STATUS_CANCELLED: u8 = 4u8;

    // Outcome constants
    const OUTCOME_YES: u8 = 1u8;
    const OUTCOME_NO: u8 = 2u8;

    // Token type constants
    const TOKEN_ALEO: u8 = 1u8;
    const TOKEN_USDCX: u8 = 2u8;

    // Fee configuration (basis points: 100 = 1%)
    const PROTOCOL_FEE_BPS: u128 = 100u128;      // 1% protocol fee
    const CREATOR_FEE_BPS: u128 = 100u128;        // 1% creator fee
    const FEE_DENOMINATOR: u128 = 10000u128;

    // Minimum bet amount (1000 micro-units = 0.001 tokens)
    const MIN_BET_AMOUNT: u128 = 1000u128;

    // ========================================================================
    // RECORDS (Private State)
    // ========================================================================

    record Bet {
        owner: address,
        market_id: field,
        amount: u128,
        outcome: u8,
        bet_nonce: field,
        placed_at: u64,
        locked_yes_pool: u128,
        locked_no_pool: u128,
        token_type: u8,
    }

    record WinningsClaim {
        owner: address,
        market_id: field,
        bet_amount: u128,
        winning_outcome: u8,
        bet_nonce: field,
        locked_yes_pool: u128,
        locked_no_pool: u128,
        token_type: u8,
    }

    record RefundClaim {
        owner: address,
        market_id: field,
        amount: u128,
        bet_nonce: field,
        token_type: u8,
    }

    // ========================================================================
    // MAPPINGS (Public State)
    // ========================================================================

    mapping markets: field => Market;
    mapping market_pools: field => MarketPool;
    mapping market_resolutions: field => MarketResolution;

    // Prevents double claims (key: hash(market_id, user_address, bet_nonce))
    mapping user_claims: field => bool;

    // Protocol treasury: key 0 = ALEO fees, key 1 = USDCX fees
    mapping protocol_treasury: u8 => u128;

    // Program's held tokens - global tracking
    // key 0 = total ALEO held, key 1 = total USDCX held
    mapping program_credits: u8 => u128;

    // Per-market token isolation (C-02 fix)
    // Key: market_id, Value: tokens held for this specific market
    // Works for both ALEO and USDCX since markets are token-specific
    mapping market_credits: field => u128;

    // Unique bettor tracking per market (C-01 fix)
    mapping market_bettors: field => bool;

    // Commit-Reveal Scheme Mappings
    mapping bet_commitments: field => Commitment;
    mapping revealed_bets: field => bool;

    // ========================================================================
    // STRUCTS
    // ========================================================================

    struct Market {
        id: field,
        creator: address,
        resolver: address,
        question_hash: field,
        category: u8,
        deadline: u64,
        resolution_deadline: u64,
        status: u8,
        created_at: u64,
        token_type: u8,
    }

    struct MarketPool {
        market_id: field,
        total_yes_pool: u128,
        total_no_pool: u128,
        total_bets: u64,
        total_unique_bettors: u64,
    }

    struct MarketResolution {
        market_id: field,
        winning_outcome: u8,
        resolver: address,
        resolved_at: u64,
        total_payout_pool: u128,
    }

    // ========================================================================
    // HELPER STRUCTS
    // ========================================================================

    struct MarketSeed {
        creator: address,
        question_hash: field,
        deadline: u64,
        nonce: u64,
    }

    struct ClaimKey {
        market_id: field,
        claimer: address,
    }

    struct BetClaimKey {
        market_id: field,
        claimer: address,
        bet_nonce: field,
    }

    struct PendingBet {
        market_id: field,
        bettor: address,
        commitment: field,
        block_height: u64,
    }

    struct BetCommitment {
        amount: u128,
        outcome: u8,
        nonce: field,
    }

    // ========================================================================
    // COMMIT-REVEAL SCHEME STRUCTS
    // ========================================================================

    struct Commitment {
        hash: field,
        nonce: field,
        market_id: field,
        bettor: address,
        committed_at: u64,
    }

    struct CommitmentData {
        amount: u128,
        outcome: u8,
        nonce: field,
        bettor: address,
        market_id: field,
    }

    struct StorageKey {
        market_id: field,
        bettor: address,
        nonce: field,
    }

    // ========================================================================
    // TRANSITIONS
    // ========================================================================

    // ------------------------------------------------------------------------
    // CONSTRUCTOR
    // ------------------------------------------------------------------------
    @noupgrade
    async constructor() {
    }

    // ------------------------------------------------------------------------
    // CREATE MARKET
    // v11: Added token_type parameter (6th input)
    // ------------------------------------------------------------------------
    async transition create_market(
        public question_hash: field,
        public category: u8,
        public deadline: u64,
        public resolution_deadline: u64,
        public resolver: address,
        public token_type: u8,
    ) -> (field, Future) {
        assert(token_type == TOKEN_ALEO || token_type == TOKEN_USDCX);

        let market_id: field = BHP256::hash_to_field(
            MarketSeed {
                creator: self.caller,
                question_hash: question_hash,
                deadline: deadline,
                nonce: resolution_deadline,
            }
        );

        return (market_id, create_market_onchain(
            market_id,
            self.caller,
            question_hash,
            category,
            deadline,
            resolution_deadline,
            resolver,
            token_type
        ));
    }

    async function create_market_onchain(
        market_id: field,
        creator: address,
        question_hash: field,
        category: u8,
        deadline: u64,
        resolution_deadline: u64,
        resolver: address,
        token_type: u8,
    ) {
        let market_exists: bool = markets.contains(market_id);
        assert(!market_exists);

        let current_height: u64 = block.height as u64;
        assert(deadline > current_height);
        assert(resolution_deadline > deadline);

        let new_market: Market = Market {
            id: market_id,
            creator: creator,
            resolver: resolver,
            question_hash: question_hash,
            category: category,
            deadline: deadline,
            resolution_deadline: resolution_deadline,
            status: MARKET_STATUS_ACTIVE,
            created_at: current_height,
            token_type: token_type,
        };

        let initial_pool: MarketPool = MarketPool {
            market_id: market_id,
            total_yes_pool: 0u128,
            total_no_pool: 0u128,
            total_bets: 0u64,
            total_unique_bettors: 0u64,
        };

        markets.set(market_id, new_market);
        market_pools.set(market_id, initial_pool);
    }

    // ------------------------------------------------------------------------
    // PLACE BET (PRIVACY-PRESERVING, ALEO ONLY)
    // Uses credits.aleo/transfer_private_to_public to HIDE bettor's identity
    // v11: amounts are u128, cast to u64 for credits.aleo call
    // ------------------------------------------------------------------------
    async transition place_bet(
        public market_id: field,
        public amount: u128,
        public outcome: u8,
        private bet_nonce: field,
        private credits_in: credits.aleo/credits,
    ) -> (Bet, credits.aleo/credits, Future) {
        assert(outcome == OUTCOME_YES || outcome == OUTCOME_NO);
        assert(amount >= MIN_BET_AMOUNT);

        let amount_u64: u64 = amount as u64;

        let bet: Bet = Bet {
            owner: self.caller,
            market_id: market_id,
            amount: amount,
            outcome: outcome,
            bet_nonce: bet_nonce,
            placed_at: 0u64,
            locked_yes_pool: 0u128,
            locked_no_pool: 0u128,
            token_type: TOKEN_ALEO,
        };

        let (change, transfer_future): (credits.aleo/credits, Future) = credits.aleo/transfer_private_to_public(
            credits_in,
            self.address,
            amount_u64
        );

        let bettor_key: field = BHP256::hash_to_field(ClaimKey {
            market_id: market_id,
            claimer: self.caller,
        });

        return (bet, change, finalize_place_bet_private(transfer_future, market_id, amount, outcome, bettor_key));
    }

    async function finalize_place_bet_private(
        transfer_future: Future,
        market_id: field,
        amount: u128,
        outcome: u8,
        bettor_key: field,
    ) {
        transfer_future.await();

        let market: Market = markets.get(market_id);
        assert(market.status == MARKET_STATUS_ACTIVE);
        assert(market.token_type == TOKEN_ALEO);

        let current_height: u64 = block.height as u64;
        assert(current_height <= market.deadline);

        // C-02: Update global (key 0 = ALEO) and per-market credit tracking
        let current_held: u128 = program_credits.get_or_use(0u8, 0u128);
        program_credits.set(0u8, current_held + amount);
        let market_held: u128 = market_credits.get_or_use(market_id, 0u128);
        market_credits.set(market_id, market_held + amount);

        // C-01: Track unique bettors
        let is_existing_bettor: bool = market_bettors.get_or_use(bettor_key, false);
        let new_bettor_increment: u64 = is_existing_bettor ? 0u64 : 1u64;
        market_bettors.set(bettor_key, true);

        let pool: MarketPool = market_pools.get(market_id);
        let yes_add: u128 = outcome == OUTCOME_YES ? amount : 0u128;
        let no_add: u128 = outcome == OUTCOME_NO ? amount : 0u128;

        let updated_pool: MarketPool = MarketPool {
            market_id: market_id,
            total_yes_pool: pool.total_yes_pool + yes_add,
            total_no_pool: pool.total_no_pool + no_add,
            total_bets: pool.total_bets + 1u64,
            total_unique_bettors: pool.total_unique_bettors + new_bettor_increment,
        };

        market_pools.set(market_id, updated_pool);
    }

    // ------------------------------------------------------------------------
    // PLACE BET PUBLIC (ALEO, Wallet-Compatible)
    // Uses credits.aleo/transfer_public_as_signer
    // v11: amounts are u128, cast to u64 for credits.aleo call
    // ------------------------------------------------------------------------
    async transition place_bet_public(
        private market_id: field,
        private amount: u128,
        private outcome: u8,
        private bet_nonce: field,
    ) -> (Bet, Future) {
        assert(outcome == OUTCOME_YES || outcome == OUTCOME_NO);
        assert(amount >= MIN_BET_AMOUNT);

        let amount_u64: u64 = amount as u64;

        let bet: Bet = Bet {
            owner: self.caller,
            market_id: market_id,
            amount: amount,
            outcome: outcome,
            bet_nonce: bet_nonce,
            placed_at: 0u64,
            locked_yes_pool: 0u128,
            locked_no_pool: 0u128,
            token_type: TOKEN_ALEO,
        };

        let transfer_future: Future = credits.aleo/transfer_public_as_signer(
            self.address,
            amount_u64
        );

        let bettor_key: field = BHP256::hash_to_field(ClaimKey {
            market_id: market_id,
            claimer: self.caller,
        });

        return (bet, finalize_place_bet_public(transfer_future, market_id, amount, outcome, bettor_key));
    }

    async function finalize_place_bet_public(
        transfer_future: Future,
        market_id: field,
        amount: u128,
        outcome: u8,
        bettor_key: field,
    ) {
        transfer_future.await();

        let market: Market = markets.get(market_id);
        assert(market.status == MARKET_STATUS_ACTIVE);
        assert(market.token_type == TOKEN_ALEO);

        let current_height: u64 = block.height as u64;
        assert(current_height <= market.deadline);

        // C-02: Update global (key 0 = ALEO) and per-market credit tracking
        let current_held: u128 = program_credits.get_or_use(0u8, 0u128);
        program_credits.set(0u8, current_held + amount);
        let market_held: u128 = market_credits.get_or_use(market_id, 0u128);
        market_credits.set(market_id, market_held + amount);

        // C-01: Track unique bettors
        let is_existing_bettor: bool = market_bettors.get_or_use(bettor_key, false);
        let new_bettor_increment: u64 = is_existing_bettor ? 0u64 : 1u64;
        market_bettors.set(bettor_key, true);

        let pool: MarketPool = market_pools.get(market_id);
        let yes_add: u128 = outcome == OUTCOME_YES ? amount : 0u128;
        let no_add: u128 = outcome == OUTCOME_NO ? amount : 0u128;

        let updated_pool: MarketPool = MarketPool {
            market_id: market_id,
            total_yes_pool: pool.total_yes_pool + yes_add,
            total_no_pool: pool.total_no_pool + no_add,
            total_bets: pool.total_bets + 1u64,
            total_unique_bettors: pool.total_unique_bettors + new_bettor_increment,
        };

        market_pools.set(market_id, updated_pool);
    }

    // ------------------------------------------------------------------------
    // PLACE BET PUBLIC USDCX (Wallet-Compatible)
    // Uses test_usdcx_stablecoin.aleo/transfer_public_as_signer
    // v11: NEW - USDCX native u128 amounts
    // ------------------------------------------------------------------------
    async transition place_bet_public_usdcx(
        private market_id: field,
        private amount: u128,
        private outcome: u8,
        private bet_nonce: field,
    ) -> (Bet, Future) {
        assert(outcome == OUTCOME_YES || outcome == OUTCOME_NO);
        assert(amount >= MIN_BET_AMOUNT);

        let bet: Bet = Bet {
            owner: self.caller,
            market_id: market_id,
            amount: amount,
            outcome: outcome,
            bet_nonce: bet_nonce,
            placed_at: 0u64,
            locked_yes_pool: 0u128,
            locked_no_pool: 0u128,
            token_type: TOKEN_USDCX,
        };

        let transfer_future: Future = test_usdcx_stablecoin.aleo/transfer_public_as_signer(
            self.address,
            amount
        );

        let bettor_key: field = BHP256::hash_to_field(ClaimKey {
            market_id: market_id,
            claimer: self.caller,
        });

        return (bet, finalize_place_bet_public_usdcx(transfer_future, market_id, amount, outcome, bettor_key));
    }

    async function finalize_place_bet_public_usdcx(
        transfer_future: Future,
        market_id: field,
        amount: u128,
        outcome: u8,
        bettor_key: field,
    ) {
        transfer_future.await();

        let market: Market = markets.get(market_id);
        assert(market.status == MARKET_STATUS_ACTIVE);
        assert(market.token_type == TOKEN_USDCX);

        let current_height: u64 = block.height as u64;
        assert(current_height <= market.deadline);

        // C-02: Update global (key 1 = USDCX) and per-market credit tracking
        let current_held: u128 = program_credits.get_or_use(1u8, 0u128);
        program_credits.set(1u8, current_held + amount);
        let market_held: u128 = market_credits.get_or_use(market_id, 0u128);
        market_credits.set(market_id, market_held + amount);

        // C-01: Track unique bettors
        let is_existing_bettor: bool = market_bettors.get_or_use(bettor_key, false);
        let new_bettor_increment: u64 = is_existing_bettor ? 0u64 : 1u64;
        market_bettors.set(bettor_key, true);

        let pool: MarketPool = market_pools.get(market_id);
        let yes_add: u128 = outcome == OUTCOME_YES ? amount : 0u128;
        let no_add: u128 = outcome == OUTCOME_NO ? amount : 0u128;

        let updated_pool: MarketPool = MarketPool {
            market_id: market_id,
            total_yes_pool: pool.total_yes_pool + yes_add,
            total_no_pool: pool.total_no_pool + no_add,
            total_bets: pool.total_bets + 1u64,
            total_unique_bettors: pool.total_unique_bettors + new_bettor_increment,
        };

        market_pools.set(market_id, updated_pool);
    }

    // ------------------------------------------------------------------------
    // COMMIT BET (Phase 2: Commit-Reveal Scheme, ALEO only)
    // ------------------------------------------------------------------------
    async transition commit_bet(
        public market_id: field,
        private amount: u128,
        private outcome: u8,
        private user_nonce: field,
        private credits_in: credits.aleo/credits,
    ) -> (Commitment, credits.aleo/credits, Future) {
        assert(outcome == OUTCOME_YES || outcome == OUTCOME_NO);

        let bet_amount: u64 = credits_in.microcredits;
        let bet_amount_u128: u128 = bet_amount as u128;
        assert(bet_amount_u128 >= MIN_BET_AMOUNT);
        assert(bet_amount_u128 == amount);

        let commitment_hash: field = BHP256::hash_to_field(
            CommitmentData {
                amount: amount,
                outcome: outcome,
                nonce: user_nonce,
                bettor: self.caller,
                market_id: market_id,
            }
        );

        let (bet_amount_record, change_record) = credits.aleo/split(
            credits_in,
            bet_amount
        );

        let commitment: Commitment = Commitment {
            hash: commitment_hash,
            nonce: user_nonce,
            market_id: market_id,
            bettor: self.caller,
            committed_at: 0u64,
        };

        return (
            commitment,
            bet_amount_record,
            finalize_commit_bet(commitment_hash, commitment, market_id)
        );
    }

    async function finalize_commit_bet(
        commitment_hash: field,
        commitment: Commitment,
        market_id: field,
    ) {
        let market: Market = markets.get(market_id);
        assert(market.status == MARKET_STATUS_ACTIVE);
        assert(market.token_type == TOKEN_ALEO);

        let current_height: u64 = block.height as u64;
        assert(current_height <= market.deadline);

        let commitment_exists: bool = bet_commitments.contains(commitment_hash);
        assert(!commitment_exists);

        let updated_commitment: Commitment = Commitment {
            hash: commitment.hash,
            nonce: commitment.nonce,
            market_id: commitment.market_id,
            bettor: commitment.bettor,
            committed_at: current_height,
        };

        bet_commitments.set(commitment_hash, updated_commitment);
    }

    // ------------------------------------------------------------------------
    // REVEAL BET (Phase 2: Commit-Reveal Scheme, ALEO only)
    // ------------------------------------------------------------------------
    async transition reveal_bet(
        private commitment: Commitment,
        private credits_record: credits.aleo/credits,
        private amount: u128,
        private outcome: u8,
    ) -> (Bet, Future) {
        let expected_hash: field = BHP256::hash_to_field(
            CommitmentData {
                amount: amount,
                outcome: outcome,
                nonce: commitment.nonce,
                bettor: self.caller,
                market_id: commitment.market_id,
            }
        );
        assert(expected_hash == commitment.hash);

        let amount_u64: u64 = amount as u64;
        assert(credits_record.microcredits == amount_u64);
        assert(commitment.bettor == self.caller);

        let bet_nonce: field = BHP256::hash_to_field(StorageKey {
            market_id: commitment.market_id,
            bettor: self.caller,
            nonce: commitment.nonce,
        });
        let bet: Bet = Bet {
            owner: self.caller,
            market_id: commitment.market_id,
            amount: amount,
            outcome: outcome,
            bet_nonce: bet_nonce,
            placed_at: 0u64,
            locked_yes_pool: 0u128,
            locked_no_pool: 0u128,
            token_type: TOKEN_ALEO,
        };

        let transfer_result: (credits.aleo/credits, Future) = credits.aleo/transfer_private_to_public(
            credits_record,
            self.address,
            amount_u64
        );

        return (bet, finalize_reveal_bet(
            transfer_result.1,
            commitment.hash,
            commitment.market_id,
            amount,
            outcome,
            self.caller
        ));
    }

    async function finalize_reveal_bet(
        transfer_future: Future,
        commitment_hash: field,
        market_id: field,
        amount: u128,
        outcome: u8,
        bettor: address,
    ) {
        transfer_future.await();

        let commitment: Commitment = bet_commitments.get(commitment_hash);
        assert(commitment.market_id == market_id);
        assert(commitment.bettor == bettor);

        let already_revealed: bool = revealed_bets.get_or_use(commitment_hash, false);
        assert(!already_revealed);
        revealed_bets.set(commitment_hash, true);

        let market: Market = markets.get(market_id);
        let current_height: u64 = block.height as u64;

        assert(market.status != MARKET_STATUS_RESOLVED);
        assert(current_height <= market.resolution_deadline);

        let is_closed: bool = market.status == MARKET_STATUS_CLOSED;
        let is_past_deadline: bool = current_height > market.deadline;
        assert(is_closed || is_past_deadline);

        // C-02: Update global (key 0 = ALEO) and per-market credit tracking
        let current_held: u128 = program_credits.get_or_use(0u8, 0u128);
        program_credits.set(0u8, current_held + amount);
        let market_held: u128 = market_credits.get_or_use(market_id, 0u128);
        market_credits.set(market_id, market_held + amount);

        // C-01: Track unique bettors
        let bettor_key: field = BHP256::hash_to_field(ClaimKey {
            market_id: market_id,
            claimer: bettor,
        });
        let is_existing_bettor: bool = market_bettors.get_or_use(bettor_key, false);
        let new_bettor_increment: u64 = is_existing_bettor ? 0u64 : 1u64;
        market_bettors.set(bettor_key, true);

        let pool: MarketPool = market_pools.get(market_id);
        let yes_add: u128 = outcome == OUTCOME_YES ? amount : 0u128;
        let no_add: u128 = outcome == OUTCOME_NO ? amount : 0u128;

        let updated_pool: MarketPool = MarketPool {
            market_id: market_id,
            total_yes_pool: pool.total_yes_pool + yes_add,
            total_no_pool: pool.total_no_pool + no_add,
            total_bets: pool.total_bets + 1u64,
            total_unique_bettors: pool.total_unique_bettors + new_bettor_increment,
        };

        market_pools.set(market_id, updated_pool);
    }

    // ------------------------------------------------------------------------
    // CLOSE MARKET
    // ------------------------------------------------------------------------
    async transition close_market(public market_id: field) -> Future {
        return close_market_onchain(market_id);
    }

    async function close_market_onchain(market_id: field) {
        let market: Market = markets.get(market_id);
        assert(market.status == MARKET_STATUS_ACTIVE);

        let current_height: u64 = block.height as u64;
        assert(current_height > market.deadline);

        let closed_market: Market = Market {
            id: market.id,
            creator: market.creator,
            resolver: market.resolver,
            question_hash: market.question_hash,
            category: market.category,
            deadline: market.deadline,
            resolution_deadline: market.resolution_deadline,
            status: MARKET_STATUS_CLOSED,
            created_at: market.created_at,
            token_type: market.token_type,
        };

        markets.set(market_id, closed_market);
    }

    // ------------------------------------------------------------------------
    // RESOLVE MARKET
    // v11: u128 fee math, token-type-aware treasury/credit tracking
    // ------------------------------------------------------------------------
    async transition resolve_market(
        public market_id: field,
        public winning_outcome: u8,
    ) -> Future {
        assert(winning_outcome == OUTCOME_YES || winning_outcome == OUTCOME_NO);
        return resolve_market_onchain(market_id, winning_outcome, self.caller);
    }

    async function resolve_market_onchain(
        market_id: field,
        winning_outcome: u8,
        resolver: address,
    ) {
        let market: Market = markets.get(market_id);
        let pool: MarketPool = market_pools.get(market_id);

        assert(market.resolver == resolver);

        let current_height: u64 = block.height as u64;

        let is_closed: bool = market.status == MARKET_STATUS_CLOSED;
        let is_past_deadline: bool = market.status == MARKET_STATUS_ACTIVE && current_height > market.deadline;
        assert(is_closed || is_past_deadline);

        assert(current_height <= market.resolution_deadline);

        let total_pool: u128 = pool.total_yes_pool + pool.total_no_pool;
        let protocol_fee: u128 = (total_pool * PROTOCOL_FEE_BPS) / FEE_DENOMINATOR;
        let creator_fee: u128 = (total_pool * CREATOR_FEE_BPS) / FEE_DENOMINATOR;
        let payout_pool: u128 = total_pool - protocol_fee - creator_fee;

        let resolution: MarketResolution = MarketResolution {
            market_id: market_id,
            winning_outcome: winning_outcome,
            resolver: resolver,
            resolved_at: current_height,
            total_payout_pool: payout_pool,
        };

        let resolved_market: Market = Market {
            id: market.id,
            creator: market.creator,
            resolver: market.resolver,
            question_hash: market.question_hash,
            category: market.category,
            deadline: market.deadline,
            resolution_deadline: market.resolution_deadline,
            status: MARKET_STATUS_RESOLVED,
            created_at: market.created_at,
            token_type: market.token_type,
        };

        // Token-type-aware treasury and credit tracking
        let treasury_key: u8 = market.token_type == TOKEN_ALEO ? 0u8 : 1u8;
        let current_treasury: u128 = protocol_treasury.get_or_use(treasury_key, 0u128);
        protocol_treasury.set(treasury_key, current_treasury + protocol_fee);

        // C-02: Deduct fees from per-market credits
        let market_held: u128 = market_credits.get_or_use(market_id, 0u128);
        market_credits.set(market_id, market_held - protocol_fee - creator_fee);

        markets.set(market_id, resolved_market);
        market_resolutions.set(market_id, resolution);
    }

    // ------------------------------------------------------------------------
    // CLAIM WINNINGS (Private, token-agnostic - just sets claim flag)
    // ------------------------------------------------------------------------
    async transition claim_winnings(
        private bet: Bet,
    ) -> (WinningsClaim, Future) {
        let claim_key: field = BHP256::hash_to_field(BetClaimKey {
            market_id: bet.market_id,
            claimer: bet.owner,
            bet_nonce: bet.bet_nonce,
        });

        let claim: WinningsClaim = WinningsClaim {
            owner: bet.owner,
            market_id: bet.market_id,
            bet_amount: bet.amount,
            winning_outcome: bet.outcome,
            bet_nonce: bet.bet_nonce,
            locked_yes_pool: bet.locked_yes_pool,
            locked_no_pool: bet.locked_no_pool,
            token_type: bet.token_type,
        };

        return (claim, claim_winnings_onchain(claim_key, bet.market_id, bet.outcome));
    }

    async function claim_winnings_onchain(
        claim_key: field,
        market_id: field,
        bet_outcome: u8,
    ) {
        let resolution: MarketResolution = market_resolutions.get(market_id);
        assert(bet_outcome == resolution.winning_outcome);

        let already_claimed: bool = user_claims.get_or_use(claim_key, false);
        assert(!already_claimed);
        user_claims.set(claim_key, true);
    }

    // ------------------------------------------------------------------------
    // WITHDRAW WINNINGS (ALEO)
    // v11: u128 amounts, assert token_type matches
    // ------------------------------------------------------------------------
    async transition withdraw_winnings(
        private claim: WinningsClaim,
        public payout_amount: u128,
    ) -> Future {
        assert(claim.owner == self.caller);
        assert(claim.token_type == TOKEN_ALEO);

        let claim_key: field = BHP256::hash_to_field(BetClaimKey {
            market_id: claim.market_id,
            claimer: claim.owner,
            bet_nonce: claim.bet_nonce,
        });

        let payout_u64: u64 = payout_amount as u64;
        let transfer_future: Future = credits.aleo/transfer_public(self.caller, payout_u64);

        return finalize_withdraw_winnings(
            transfer_future,
            claim_key,
            claim.market_id,
            claim.bet_amount,
            claim.winning_outcome,
            payout_amount,
            TOKEN_ALEO
        );
    }

    // ------------------------------------------------------------------------
    // WITHDRAW WINNINGS USDCX
    // v11: NEW - USDCX payout
    // ------------------------------------------------------------------------
    async transition withdraw_winnings_usdcx(
        private claim: WinningsClaim,
        public payout_amount: u128,
    ) -> Future {
        assert(claim.owner == self.caller);
        assert(claim.token_type == TOKEN_USDCX);

        let claim_key: field = BHP256::hash_to_field(BetClaimKey {
            market_id: claim.market_id,
            claimer: claim.owner,
            bet_nonce: claim.bet_nonce,
        });

        let transfer_future: Future = test_usdcx_stablecoin.aleo/transfer_public(self.caller, payout_amount);

        return finalize_withdraw_win_usdcx(
            transfer_future,
            claim_key,
            claim.market_id,
            claim.bet_amount,
            claim.winning_outcome,
            payout_amount,
            TOKEN_USDCX
        );
    }

    async function finalize_withdraw_winnings(
        transfer_future: Future,
        claim_key: field,
        market_id: field,
        bet_amount: u128,
        bet_outcome: u8,
        payout_amount: u128,
        token_type: u8,
    ) {
        let resolution: MarketResolution = market_resolutions.get(market_id);
        assert(bet_outcome == resolution.winning_outcome);

        let was_claimed: bool = user_claims.get(claim_key);
        assert(was_claimed);

        let pool: MarketPool = market_pools.get(market_id);
        let winning_pool: u128 = bet_outcome == OUTCOME_YES ? pool.total_yes_pool : pool.total_no_pool;

        let expected_payout: u128 = (bet_amount * resolution.total_payout_pool) / winning_pool;
        assert(payout_amount <= expected_payout);

        // C-02: Check per-market credits
        let market_held: u128 = market_credits.get_or_use(market_id, 0u128);
        assert(market_held >= payout_amount);
        market_credits.set(market_id, market_held - payout_amount);

        // Update global tracking (key 0 = ALEO)
        let current_held: u128 = program_credits.get_or_use(0u8, 0u128);
        assert(current_held >= payout_amount);
        program_credits.set(0u8, current_held - payout_amount);

        transfer_future.await();
    }

    async function finalize_withdraw_win_usdcx(
        transfer_future: Future,
        claim_key: field,
        market_id: field,
        bet_amount: u128,
        bet_outcome: u8,
        payout_amount: u128,
        token_type: u8,
    ) {
        let resolution: MarketResolution = market_resolutions.get(market_id);
        assert(bet_outcome == resolution.winning_outcome);

        let was_claimed: bool = user_claims.get(claim_key);
        assert(was_claimed);

        let pool: MarketPool = market_pools.get(market_id);
        let winning_pool: u128 = bet_outcome == OUTCOME_YES ? pool.total_yes_pool : pool.total_no_pool;

        let expected_payout: u128 = (bet_amount * resolution.total_payout_pool) / winning_pool;
        assert(payout_amount <= expected_payout);

        // C-02: Check per-market credits
        let market_held: u128 = market_credits.get_or_use(market_id, 0u128);
        assert(market_held >= payout_amount);
        market_credits.set(market_id, market_held - payout_amount);

        // Update global tracking (key 1 = USDCX)
        let current_held: u128 = program_credits.get_or_use(1u8, 0u128);
        assert(current_held >= payout_amount);
        program_credits.set(1u8, current_held - payout_amount);

        transfer_future.await();
    }

    // ------------------------------------------------------------------------
    // CANCEL MARKET
    // ------------------------------------------------------------------------
    async transition cancel_market(public market_id: field) -> Future {
        return cancel_market_onchain(market_id, self.caller);
    }

    async function cancel_market_onchain(market_id: field, caller: address) {
        let market: Market = markets.get(market_id);
        let pool: MarketPool = market_pools.get(market_id);

        assert(market.creator == caller);
        assert(market.status == MARKET_STATUS_ACTIVE);
        assert(pool.total_bets == 0u64);

        let cancelled_market: Market = Market {
            id: market.id,
            creator: market.creator,
            resolver: market.resolver,
            question_hash: market.question_hash,
            category: market.category,
            deadline: market.deadline,
            resolution_deadline: market.resolution_deadline,
            status: MARKET_STATUS_CANCELLED,
            created_at: market.created_at,
            token_type: market.token_type,
        };

        markets.set(market_id, cancelled_market);
    }

    // ------------------------------------------------------------------------
    // EMERGENCY CANCEL
    // ------------------------------------------------------------------------
    async transition emergency_cancel(public market_id: field) -> Future {
        return emergency_cancel_onchain(market_id);
    }

    async function emergency_cancel_onchain(market_id: field) {
        let market: Market = markets.get(market_id);
        let current_height: u64 = block.height as u64;

        assert(current_height > market.resolution_deadline);
        assert(market.status != MARKET_STATUS_RESOLVED);
        assert(market.status != MARKET_STATUS_CANCELLED);

        let cancelled_market: Market = Market {
            id: market.id,
            creator: market.creator,
            resolver: market.resolver,
            question_hash: market.question_hash,
            category: market.category,
            deadline: market.deadline,
            resolution_deadline: market.resolution_deadline,
            status: MARKET_STATUS_CANCELLED,
            created_at: market.created_at,
            token_type: market.token_type,
        };

        markets.set(market_id, cancelled_market);
    }

    // ------------------------------------------------------------------------
    // CLAIM REFUND (ALEO)
    // v11: u128 amounts, assert token_type matches
    // ------------------------------------------------------------------------
    async transition claim_refund(
        private bet: Bet,
    ) -> (RefundClaim, Future) {
        assert(bet.owner == self.caller);
        assert(bet.token_type == TOKEN_ALEO);

        let claim_key: field = BHP256::hash_to_field(BetClaimKey {
            market_id: bet.market_id,
            claimer: bet.owner,
            bet_nonce: bet.bet_nonce,
        });

        let refund: RefundClaim = RefundClaim {
            owner: bet.owner,
            market_id: bet.market_id,
            amount: bet.amount,
            bet_nonce: bet.bet_nonce,
            token_type: TOKEN_ALEO,
        };

        let refund_u64: u64 = bet.amount as u64;
        let transfer_future: Future = credits.aleo/transfer_public(self.caller, refund_u64);

        return (refund, finalize_claim_refund(transfer_future, claim_key, bet.market_id, bet.amount, TOKEN_ALEO));
    }

    // ------------------------------------------------------------------------
    // CLAIM REFUND USDCX
    // v11: NEW - USDCX refund
    // ------------------------------------------------------------------------
    async transition claim_refund_usdcx(
        private bet: Bet,
    ) -> (RefundClaim, Future) {
        assert(bet.owner == self.caller);
        assert(bet.token_type == TOKEN_USDCX);

        let claim_key: field = BHP256::hash_to_field(BetClaimKey {
            market_id: bet.market_id,
            claimer: bet.owner,
            bet_nonce: bet.bet_nonce,
        });

        let refund: RefundClaim = RefundClaim {
            owner: bet.owner,
            market_id: bet.market_id,
            amount: bet.amount,
            bet_nonce: bet.bet_nonce,
            token_type: TOKEN_USDCX,
        };

        let transfer_future: Future = test_usdcx_stablecoin.aleo/transfer_public(self.caller, bet.amount);

        return (refund, finalize_claim_refund_usdcx(transfer_future, claim_key, bet.market_id, bet.amount, TOKEN_USDCX));
    }

    async function finalize_claim_refund(
        transfer_future: Future,
        claim_key: field,
        market_id: field,
        amount: u128,
        token_type: u8,
    ) {
        let market: Market = markets.get(market_id);
        assert(market.status == MARKET_STATUS_CANCELLED);

        let already_claimed: bool = user_claims.get_or_use(claim_key, false);
        assert(!already_claimed);
        user_claims.set(claim_key, true);

        // C-02: Check per-market credits
        let market_held: u128 = market_credits.get_or_use(market_id, 0u128);
        assert(market_held >= amount);
        market_credits.set(market_id, market_held - amount);

        // Update global tracking (key 0 = ALEO)
        let current_held: u128 = program_credits.get_or_use(0u8, 0u128);
        assert(current_held >= amount);
        program_credits.set(0u8, current_held - amount);

        transfer_future.await();
    }

    async function finalize_claim_refund_usdcx(
        transfer_future: Future,
        claim_key: field,
        market_id: field,
        amount: u128,
        token_type: u8,
    ) {
        let market: Market = markets.get(market_id);
        assert(market.status == MARKET_STATUS_CANCELLED);

        let already_claimed: bool = user_claims.get_or_use(claim_key, false);
        assert(!already_claimed);
        user_claims.set(claim_key, true);

        // C-02: Check per-market credits
        let market_held: u128 = market_credits.get_or_use(market_id, 0u128);
        assert(market_held >= amount);
        market_credits.set(market_id, market_held - amount);

        // Update global tracking (key 1 = USDCX)
        let current_held: u128 = program_credits.get_or_use(1u8, 0u128);
        assert(current_held >= amount);
        program_credits.set(1u8, current_held - amount);

        transfer_future.await();
    }

    // ========================================================================
    // INLINE FUNCTIONS (Compile-time Helpers)
    // ========================================================================

    inline calculate_yes_probability(yes_pool: u128, no_pool: u128) -> u128 {
        let total: u128 = yes_pool + no_pool;
        if (total == 0u128) {
            return 5000u128;
        }
        return (yes_pool * 10000u128) / total;
    }

    inline calculate_potential_payout(
        bet_amount: u128,
        bet_on_yes: bool,
        yes_pool: u128,
        no_pool: u128,
    ) -> u128 {
        let total_pool: u128 = yes_pool + no_pool;
        let winning_pool: u128 = bet_on_yes ? yes_pool : no_pool;

        if (winning_pool == 0u128) {
            return 0u128;
        }

        let gross_payout: u128 = (bet_amount * total_pool) / winning_pool;
        let total_fee_bps: u128 = PROTOCOL_FEE_BPS + CREATOR_FEE_BPS;
        let fees: u128 = (gross_payout * total_fee_bps) / FEE_DENOMINATOR;

        return gross_payout - fees;
    }

    inline calculate_odds(
        bet_on_yes: bool,
        yes_pool: u128,
        no_pool: u128,
    ) -> u128 {
        let total_pool: u128 = yes_pool + no_pool;
        let winning_pool: u128 = bet_on_yes ? yes_pool : no_pool;

        if (winning_pool == 0u128) {
            return 0u128;
        }

        return (total_pool * 10000u128) / winning_pool;
    }
}
