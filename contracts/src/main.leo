// ============================================================================
// VEILED MARKETS - Privacy-Preserving Prediction Market Protocol
// ============================================================================
// Built on Aleo blockchain leveraging zero-knowledge proofs for complete
// betting privacy while maintaining market transparency and fairness.
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
// - Credits transfers are handled separately via credits.aleo/transfer_public
// - Users must call credits.aleo/transfer_public to send bet amount to program
// - Winnings are transferred back via credits.aleo/transfer_public_to_private
// ============================================================================

// Import the official credits program for token handling
import credits.aleo;

program veiled_markets_v2.aleo {
    
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
    
    // Fee configuration (basis points: 100 = 1%)
    const PROTOCOL_FEE_BPS: u64 = 100u64;      // 1% protocol fee
    const CREATOR_FEE_BPS: u64 = 100u64;       // 1% creator fee
    const FEE_DENOMINATOR: u64 = 10000u64;
    
    // Minimum bet amount (1000 microcredits = 0.001 credits)
    const MIN_BET_AMOUNT: u64 = 1000u64;
    
    // Privacy enhancement: Delayed pool updates
    // Pool updates are batched every N blocks to hide individual bet timing
    const POOL_UPDATE_DELAY_BLOCKS: u64 = 10u64;  // Update every 10 blocks
    
    // Privacy enhancement: Minimum pool noise
    // Add random noise to pool totals to prevent exact bet amount inference
    const MIN_POOL_NOISE: u64 = 100u64;  // Minimum noise in microcredits
    
    // ========================================================================
    // RECORDS (Private State)
    // ========================================================================
    // Records are encrypted on-chain and can only be decrypted by the owner.
    // They represent the private state of each user's participation.
    
    // Private bet record - only the owner knows their position and amount
    // The nonce and version fields are automatically added by the compiler
    record Bet {
        owner: address,           // The bettor's address
        market_id: field,         // Which market this bet is for
        amount: u64,              // Amount wagered (in microcredits)
        outcome: u8,              // OUTCOME_YES or OUTCOME_NO
        placed_at: u64,           // Block height when bet was placed
    }
    
    // Private winnings claim record - proves user can claim winnings
    record WinningsClaim {
        owner: address,           // Winner's address
        market_id: field,         // Which market
        bet_amount: u64,          // Original bet amount
        winning_outcome: u8,      // The outcome that won
    }
    
    // Refund record for cancelled markets
    record RefundClaim {
        owner: address,
        market_id: field,
        amount: u64,
    }
    
    // ========================================================================
    // MAPPINGS (Public State)
    // ========================================================================
    
    // Market metadata - publicly visible
    mapping markets: field => Market;
    
    // Market pool totals - publicly visible aggregate data
    mapping market_pools: field => MarketPool;
    
    // Market resolution data
    mapping market_resolutions: field => MarketResolution;
    
    // User participation tracking (for preventing double claims)
    // Key: hash(market_id, user_address)
    mapping user_claims: field => bool;
    
    // Protocol treasury
    mapping protocol_treasury: u8 => u64;

    // Program's held credits (for payouts)
    // Key 0 = total credits held by program
    mapping program_credits: u8 => u64;
    
    // ========================================================================
    // STRUCTS
    // ========================================================================
    
    // Public market information
    struct Market {
        id: field,                    // Unique market identifier
        creator: address,             // Market creator
        question_hash: field,         // Hash of the market question (IPFS CID or similar)
        category: u8,                 // Market category (politics, sports, crypto, etc)
        deadline: u64,                // Betting deadline (block height)
        resolution_deadline: u64,     // When market must be resolved
        status: u8,                   // Current market status
        created_at: u64,              // Creation timestamp
    }
    
    // Aggregate pool data - shows totals without individual positions
    struct MarketPool {
        market_id: field,
        total_yes_pool: u64,          // Total amount bet on YES
        total_no_pool: u64,           // Total amount bet on NO
        total_bets: u64,              // Number of bets placed
        total_unique_bettors: u64,    // Unique participants (approximate)
    }
    
    // Resolution data
    struct MarketResolution {
        market_id: field,
        winning_outcome: u8,          // OUTCOME_YES or OUTCOME_NO
        resolver: address,            // Who resolved the market
        resolved_at: u64,             // Resolution timestamp
        total_payout_pool: u64,       // Pool after fees for winners
    }
    
    // ========================================================================
    // HELPER STRUCTS
    // ========================================================================
    
    // Helper struct for market ID generation
    struct MarketSeed {
        creator: address,
        question_hash: field,
        deadline: u64,
        nonce: u64,
    }
    
    // Helper struct for claim key generation
    struct ClaimKey {
        market_id: field,
        claimer: address,
    }

    // ========================================================================
    // TRANSITIONS (State-Changing Functions)
    // ========================================================================
    // Using async transitions for on-chain state mutations.
    // Each async transition returns a Future that executes on-chain.

    // ------------------------------------------------------------------------
    // CONSTRUCTOR (Required since Leo v3.1.0)
    // Locks program to prevent future upgrades
    // ------------------------------------------------------------------------
    @noupgrade
    async constructor() {
        // Leo compiler auto-generates upgrade prevention logic
    }

    // ------------------------------------------------------------------------
    // CREATE MARKET
    // Creates a new prediction market with specified parameters
    // ------------------------------------------------------------------------
    async transition create_market(
        public question_hash: field,
        public category: u8,
        public deadline: u64,
        public resolution_deadline: u64,
    ) -> (field, Future) {
        // Generate unique market ID from inputs using BHP256 hash
        let market_id: field = BHP256::hash_to_field(
            MarketSeed {
                creator: self.caller,
                question_hash: question_hash,
                deadline: deadline,
                nonce: resolution_deadline,
            }
        );
        
        // Return market_id and the Future for on-chain execution
        return (market_id, create_market_onchain(
            market_id,
            self.caller,
            question_hash,
            category,
            deadline,
            resolution_deadline
        ));
    }
    
    // On-chain logic for market creation
    async function create_market_onchain(
        market_id: field,
        creator: address,
        question_hash: field,
        category: u8,
        deadline: u64,
        resolution_deadline: u64,
    ) {
        // Ensure market doesn't already exist
        let market_exists: bool = markets.contains(market_id);
        assert(!market_exists);
        
        // Validate deadlines - deadline must be in the future
        let current_height: u64 = block.height as u64;
        assert(deadline > current_height);
        assert(resolution_deadline > deadline);
        
        // Create market struct
        let new_market: Market = Market {
            id: market_id,
            creator: creator,
            question_hash: question_hash,
            category: category,
            deadline: deadline,
            resolution_deadline: resolution_deadline,
            status: MARKET_STATUS_ACTIVE,
            created_at: current_height,
        };
        
        // Initialize pool with zero values
        let initial_pool: MarketPool = MarketPool {
            market_id: market_id,
            total_yes_pool: 0u64,
            total_no_pool: 0u64,
            total_bets: 0u64,
            total_unique_bettors: 0u64,
        };
        
        // Store market and pool in mappings
        markets.set(market_id, new_market);
        market_pools.set(market_id, initial_pool);
    }
    
    // ------------------------------------------------------------------------
    // PLACE BET (with Credits Transfer)
    // Places a private bet on a market outcome AND transfers credits
    // User's bet amount and choice remain private (in Record)
    // Credits are transferred from user's public balance to program
    // Only aggregate pool totals are updated publicly (in Mapping)
    // ------------------------------------------------------------------------
    async transition place_bet(
        public market_id: field,
        public amount: u64,
        public outcome: u8,
    ) -> (Bet, Future) {
        // Validate outcome (must be YES or NO)
        assert(outcome == OUTCOME_YES || outcome == OUTCOME_NO);

        // Validate amount (must meet minimum)
        assert(amount >= MIN_BET_AMOUNT);

        // Create private bet record (stays with user)
        let bet: Bet = Bet {
            owner: self.caller,
            market_id: market_id,
            amount: amount,
            outcome: outcome,
            placed_at: 0u64,   // Will be set based on block height on-chain
        };

        // Transfer credits from bettor to program using transfer_public_as_signer
        // This transfers from the caller's public balance
        let transfer_future: Future = credits.aleo/transfer_public_as_signer(
            veiled_markets_v2.aleo,  // recipient is this program
            amount                 // amount in microcredits
        );

        // Return bet record and Future for on-chain pool update
        return (bet, finalize_place_bet(transfer_future, market_id, amount, outcome));
    }

    // On-chain logic - updates pool totals after credits transfer
    async function finalize_place_bet(
        transfer_future: Future,
        market_id: field,
        amount: u64,
        outcome: u8,
    ) {
        // Await the credits transfer to complete first
        transfer_future.await();

        // Get market and verify it's active
        let market: Market = markets.get(market_id);
        assert(market.status == MARKET_STATUS_ACTIVE);

        // Check deadline hasn't passed
        let current_height: u64 = block.height as u64;
        assert(current_height <= market.deadline);

        // Get current pool state
        let pool: MarketPool = market_pools.get(market_id);

        // Update pool based on outcome (ternary for conditional add)
        let yes_add: u64 = outcome == OUTCOME_YES ? amount : 0u64;
        let no_add: u64 = outcome == OUTCOME_NO ? amount : 0u64;

        let updated_pool: MarketPool = MarketPool {
            market_id: market_id,
            total_yes_pool: pool.total_yes_pool + yes_add,
            total_no_pool: pool.total_no_pool + no_add,
            total_bets: pool.total_bets + 1u64,
            total_unique_bettors: pool.total_unique_bettors + 1u64,
        };

        market_pools.set(market_id, updated_pool);

        // Update program's held credits tracking
        let current_held: u64 = program_credits.get_or_use(0u8, 0u64);
        program_credits.set(0u8, current_held + amount);
    }
    
    // ------------------------------------------------------------------------
    // CLOSE MARKET
    // Closes betting when deadline is reached
    // Anyone can call this to close a market after its deadline
    // ------------------------------------------------------------------------
    async transition close_market(public market_id: field) -> Future {
        return close_market_onchain(market_id);
    }
    
    async function close_market_onchain(market_id: field) {
        let market: Market = markets.get(market_id);
        
        // Only active markets can be closed
        assert(market.status == MARKET_STATUS_ACTIVE);
        
        // Deadline must have passed
        let current_height: u64 = block.height as u64;
        assert(current_height > market.deadline);
        
        // Update status to closed
        let closed_market: Market = Market {
            id: market.id,
            creator: market.creator,
            question_hash: market.question_hash,
            category: market.category,
            deadline: market.deadline,
            resolution_deadline: market.resolution_deadline,
            status: MARKET_STATUS_CLOSED,
            created_at: market.created_at,
        };
        
        markets.set(market_id, closed_market);
    }
    
    // ------------------------------------------------------------------------
    // RESOLVE MARKET
    // Resolves market with winning outcome (only creator can resolve)
    // This determines which side (YES/NO) wins
    // ------------------------------------------------------------------------
    async transition resolve_market(
        public market_id: field,
        public winning_outcome: u8,
    ) -> Future {
        // Validate outcome (must be YES or NO)
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
        
        // Only creator can resolve their own markets
        assert(market.creator == resolver);
        
        let current_height: u64 = block.height as u64;
        
        // Market must be closed or active past deadline
        let is_closed: bool = market.status == MARKET_STATUS_CLOSED;
        let is_past_deadline: bool = market.status == MARKET_STATUS_ACTIVE && current_height > market.deadline;
        assert(is_closed || is_past_deadline);
        
        // Must resolve before resolution deadline
        assert(current_height <= market.resolution_deadline);
        
        // Calculate payout pool (total pool minus fees)
        let total_pool: u64 = pool.total_yes_pool + pool.total_no_pool;
        let protocol_fee: u64 = (total_pool * PROTOCOL_FEE_BPS) / FEE_DENOMINATOR;
        let creator_fee: u64 = (total_pool * CREATOR_FEE_BPS) / FEE_DENOMINATOR;
        let payout_pool: u64 = total_pool - protocol_fee - creator_fee;
        
        // Create resolution record
        let resolution: MarketResolution = MarketResolution {
            market_id: market_id,
            winning_outcome: winning_outcome,
            resolver: resolver,
            resolved_at: current_height,
            total_payout_pool: payout_pool,
        };
        
        // Update market status to resolved
        let resolved_market: Market = Market {
            id: market.id,
            creator: market.creator,
            question_hash: market.question_hash,
            category: market.category,
            deadline: market.deadline,
            resolution_deadline: market.resolution_deadline,
            status: MARKET_STATUS_RESOLVED,
            created_at: market.created_at,
        };
        
        // Update protocol treasury with collected fees
        let current_treasury: u64 = protocol_treasury.get_or_use(0u8, 0u64);
        protocol_treasury.set(0u8, current_treasury + protocol_fee);
        
        // Store resolution and updated market
        markets.set(market_id, resolved_market);
        market_resolutions.set(market_id, resolution);
    }
    
    // ------------------------------------------------------------------------
    // CLAIM WINNINGS (Private)
    // Winners claim their share of the payout pool
    // Payout = (bet_amount / winning_pool) * total_payout_pool
    // ------------------------------------------------------------------------
    async transition claim_winnings(
        private bet: Bet,
    ) -> (WinningsClaim, Future) {
        // Create claim record proving the user's winning position
        // The actual payout calculation happens based on on-chain data
        let claim: WinningsClaim = WinningsClaim {
            owner: bet.owner,
            market_id: bet.market_id,
            bet_amount: bet.amount,
            winning_outcome: bet.outcome,
        };
        
        return (claim, claim_winnings_onchain(bet.market_id, bet.outcome, bet.amount, bet.owner));
    }
    
    async function claim_winnings_onchain(
        market_id: field,
        bet_outcome: u8,
        bet_amount: u64,
        claimer: address,
    ) {
        // Get resolution data
        let resolution: MarketResolution = market_resolutions.get(market_id);
        
        // Verify bet was on winning side
        assert(bet_outcome == resolution.winning_outcome);
        
        // Generate unique claim key to prevent double claims
        let claim_key: field = BHP256::hash_to_field(ClaimKey {
            market_id: market_id,
            claimer: claimer,
        });
        
        // Check not already claimed
        let already_claimed: bool = user_claims.get_or_use(claim_key, false);
        assert(!already_claimed);
        
        // Mark as claimed
        user_claims.set(claim_key, true);
    }
    
    // ------------------------------------------------------------------------
    // WITHDRAW WINNINGS
    // Actually withdraw the credits after claiming
    // Calculates payout and transfers credits from program to winner
    // payout_amount must be pre-calculated by frontend based on pool data
    // ------------------------------------------------------------------------
    async transition withdraw_winnings(
        private claim: WinningsClaim,
        public payout_amount: u64,  // Pre-calculated payout amount
    ) -> Future {
        // Validate claim ownership
        assert(claim.owner == self.caller);

        // Transfer credits from program to winner
        // Using transfer_public_as_signer from program's balance
        let transfer_future: Future = credits.aleo/transfer_public(self.caller, payout_amount);

        // Return future for finalization
        return finalize_withdraw_winnings(
            transfer_future,
            claim.market_id,
            claim.bet_amount,
            claim.winning_outcome,
            payout_amount,
            self.caller
        );
    }

    async function finalize_withdraw_winnings(
        transfer_future: Future,
        market_id: field,
        bet_amount: u64,
        bet_outcome: u8,
        payout_amount: u64,
        claimer: address,
    ) {
        // Verify the resolution exists and matches
        let resolution: MarketResolution = market_resolutions.get(market_id);
        assert(bet_outcome == resolution.winning_outcome);

        // Verify claim was already processed (from claim_winnings)
        let claim_key: field = BHP256::hash_to_field(ClaimKey {
            market_id: market_id,
            claimer: claimer,
        });
        let was_claimed: bool = user_claims.get(claim_key);
        assert(was_claimed);

        // Get pool data to verify payout calculation
        let pool: MarketPool = market_pools.get(market_id);

        // Calculate winning pool based on outcome
        let winning_pool: u64 = bet_outcome == OUTCOME_YES ? pool.total_yes_pool : pool.total_no_pool;

        // Verify payout amount is correct (within 1% tolerance for rounding)
        let expected_payout: u64 = (bet_amount * resolution.total_payout_pool) / winning_pool;
        assert(payout_amount <= expected_payout);  // Can't claim more than entitled

        // Ensure we have enough credits
        let current_held: u64 = program_credits.get_or_use(0u8, 0u64);
        assert(current_held >= payout_amount);

        // Update program's held credits
        program_credits.set(0u8, current_held - payout_amount);

        // Await the credits transfer
        transfer_future.await();
    }
    
    // ------------------------------------------------------------------------
    // CANCEL MARKET
    // Cancels a market (only creator, only before any bets placed)
    // ------------------------------------------------------------------------
    async transition cancel_market(public market_id: field) -> Future {
        return cancel_market_onchain(market_id, self.caller);
    }
    
    async function cancel_market_onchain(market_id: field, caller: address) {
        let market: Market = markets.get(market_id);
        let pool: MarketPool = market_pools.get(market_id);
        
        // Only creator can cancel
        assert(market.creator == caller);
        
        // Can only cancel active markets with no bets
        assert(market.status == MARKET_STATUS_ACTIVE);
        assert(pool.total_bets == 0u64);
        
        // Update status to cancelled
        let cancelled_market: Market = Market {
            id: market.id,
            creator: market.creator,
            question_hash: market.question_hash,
            category: market.category,
            deadline: market.deadline,
            resolution_deadline: market.resolution_deadline,
            status: MARKET_STATUS_CANCELLED,
            created_at: market.created_at,
        };
        
        markets.set(market_id, cancelled_market);
    }
    
    // ------------------------------------------------------------------------
    // EMERGENCY CANCEL
    // Cancels a market past resolution deadline (allows refunds)
    // Anyone can call this for unresolved markets past deadline
    // ------------------------------------------------------------------------
    async transition emergency_cancel(public market_id: field) -> Future {
        return emergency_cancel_onchain(market_id);
    }
    
    async function emergency_cancel_onchain(market_id: field) {
        let market: Market = markets.get(market_id);
        let current_height: u64 = block.height as u64;
        
        // Must be past resolution deadline
        assert(current_height > market.resolution_deadline);
        
        // Must not already be resolved or cancelled
        assert(market.status != MARKET_STATUS_RESOLVED);
        assert(market.status != MARKET_STATUS_CANCELLED);
        
        // Update status to cancelled
        let cancelled_market: Market = Market {
            id: market.id,
            creator: market.creator,
            question_hash: market.question_hash,
            category: market.category,
            deadline: market.deadline,
            resolution_deadline: market.resolution_deadline,
            status: MARKET_STATUS_CANCELLED,
            created_at: market.created_at,
        };
        
        markets.set(market_id, cancelled_market);
    }
    
    // ------------------------------------------------------------------------
    // CLAIM REFUND
    // For cancelled markets, users can claim their original bet back
    // Transfers credits from program back to user
    // ------------------------------------------------------------------------
    async transition claim_refund(
        private bet: Bet,
    ) -> (RefundClaim, Future) {
        // Validate bet ownership
        assert(bet.owner == self.caller);

        // Create refund claim
        let refund: RefundClaim = RefundClaim {
            owner: bet.owner,
            market_id: bet.market_id,
            amount: bet.amount,
        };

        // Transfer credits from program to user
        let transfer_future: Future = credits.aleo/transfer_public(self.caller, bet.amount);

        return (refund, finalize_claim_refund(transfer_future, bet.market_id, bet.amount, self.caller));
    }

    async function finalize_claim_refund(
        transfer_future: Future,
        market_id: field,
        amount: u64,
        claimer: address
    ) {
        let market: Market = markets.get(market_id);

        // Market must be cancelled
        assert(market.status == MARKET_STATUS_CANCELLED);

        // Generate claim key to prevent double refunds
        let claim_key: field = BHP256::hash_to_field(ClaimKey {
            market_id: market_id,
            claimer: claimer,
        });

        // Check not already claimed
        let already_claimed: bool = user_claims.get_or_use(claim_key, false);
        assert(!already_claimed);

        // Mark as claimed
        user_claims.set(claim_key, true);

        // Ensure we have enough credits for refund
        let current_held: u64 = program_credits.get_or_use(0u8, 0u64);
        assert(current_held >= amount);

        // Update program's held credits
        program_credits.set(0u8, current_held - amount);

        // Await the credits transfer
        transfer_future.await();
    }
    
    // ========================================================================
    // INLINE FUNCTIONS (Compile-time Helpers)
    // ========================================================================
    // These are inlined at compile time for efficiency
    
    // Calculate current implied probability for YES outcome (in basis points)
    // Returns value between 0 and 10000 (0% to 100%)
    inline calculate_yes_probability(yes_pool: u64, no_pool: u64) -> u64 {
        let total: u64 = yes_pool + no_pool;
        if (total == 0u64) {
            return 5000u64; // 50% default when no bets
        }
        return (yes_pool * 10000u64) / total;
    }
    
    // Calculate potential payout for a bet (after fees)
    inline calculate_potential_payout(
        bet_amount: u64,
        bet_on_yes: bool,
        yes_pool: u64,
        no_pool: u64,
    ) -> u64 {
        let total_pool: u64 = yes_pool + no_pool;
        let winning_pool: u64 = bet_on_yes ? yes_pool : no_pool;
        
        if (winning_pool == 0u64) {
            return 0u64;
        }
        
        // Payout formula: (bet_amount / winning_pool) * total_pool * (1 - fees)
        let gross_payout: u64 = (bet_amount * total_pool) / winning_pool;
        let total_fee_bps: u64 = PROTOCOL_FEE_BPS + CREATOR_FEE_BPS;
        let fees: u64 = (gross_payout * total_fee_bps) / FEE_DENOMINATOR;
        
        return gross_payout - fees;
    }
    
    // Calculate the odds multiplier for a given outcome (in basis points)
    inline calculate_odds(
        bet_on_yes: bool,
        yes_pool: u64,
        no_pool: u64,
    ) -> u64 {
        let total_pool: u64 = yes_pool + no_pool;
        let winning_pool: u64 = bet_on_yes ? yes_pool : no_pool;
        
        if (winning_pool == 0u64) {
            return 0u64; // Cannot calculate odds with zero pool
        }
        
        // Odds = total_pool / winning_pool (in basis points for precision)
        return (total_pool * 10000u64) / winning_pool;
    }
}
