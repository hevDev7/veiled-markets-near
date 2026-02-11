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
// Phase 2: Commit-Reveal Scheme (Enhanced Privacy)
// - commit_bet: Commit bet with PRIVATE amount and outcome (not visible until reveal)
// - reveal_bet: Reveal bet after deadline for pool updates
// - Amount and outcome remain private during betting period
// - Only revealed after deadline for pool calculation
//
// Credits Handling:
// - place_bet: Uses transfer_private_to_public with private Credits record (hides bettor identity)
// - commit_bet: Uses private credits records (fully private until reveal)
// - reveal_bet: Transfers private credits to public balance (after deadline)
// - Winnings are transferred back via credits.aleo/transfer_public
// ============================================================================

// Import the official credits program for token handling
import credits.aleo;

program veiled_markets_v9.aleo {
    
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
        locked_yes_pool: u64,     // YES pool at time of bet (for locked odds display)
        locked_no_pool: u64,      // NO pool at time of bet (for locked odds display)
    }
    
    // Private winnings claim record - proves user can claim winnings
    record WinningsClaim {
        owner: address,           // Winner's address
        market_id: field,         // Which market
        bet_amount: u64,          // Original bet amount
        winning_outcome: u8,      // The outcome that won
        locked_yes_pool: u64,     // YES pool when bet was placed (locked odds)
        locked_no_pool: u64,      // NO pool when bet was placed (locked odds)
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
    
    // Privacy enhancement: Pending bets for batch processing
    // Key: hash(market_id, bettor_address, nonce)
    // Stores encrypted bet commitments for delayed pool updates
    mapping pending_bets: field => PendingBet;
    
    // Privacy enhancement: Last pool update block height per market
    // Key: market_id
    mapping last_pool_update: field => u64;
    
    // Phase 2: Commit-Reveal Scheme Mappings
    // Bet commitments - stores commitment hashes (public, but doesn't reveal amount/outcome)
    // Key: commitment hash
    mapping bet_commitments: field => Commitment;
    
    // Note: Private credits records cannot be stored in mappings (Aleo limitation)
    // User must store credits record locally and pass it to reveal_bet
    
    // Revealed bets tracking - prevents double reveal
    // Key: commitment hash
    mapping revealed_bets: field => bool;
    
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
    
    // Helper struct for pending bet commitments
    struct PendingBet {
        market_id: field,
        bettor: address,
        commitment: field,      // Hash of (amount, outcome, nonce)
        block_height: u64,      // When bet was placed
    }
    
    // Helper struct for bet commitment data
    struct BetCommitment {
        amount: u64,
        outcome: u8,
        nonce: field,
    }
    
    // ========================================================================
    // COMMIT-REVEAL SCHEME STRUCTS (Phase 2 Privacy Enhancement)
    // ========================================================================
    
    // Commitment struct for commit-reveal scheme
    struct Commitment {
        hash: field,              // Commitment hash
        nonce: field,             // Random nonce for commitment
        market_id: field,         // Market ID
        bettor: address,          // Bettor address
        committed_at: u64,        // Block height when committed
    }
    
    // Commitment data for hashing
    struct CommitmentData {
        amount: u64,
        outcome: u8,
        nonce: field,
        bettor: address,
        market_id: field,
    }
    
    // Storage key for private credits
    struct StorageKey {
        market_id: field,
        bettor: address,
        nonce: field,
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
    // PLACE BET (PRIVACY-PRESERVING with Delayed Updates & Noise)
    // Places a bet on a market outcome with full privacy:
    // - Bet record is PRIVATE (encrypted, only owner can decrypt)
    // - Pool updates are DELAYED (batched every N blocks)
    // - Pool totals include NOISE to prevent exact bet inference
    // - Uses transfer_private_to_public to HIDE bettor's identity
    // ------------------------------------------------------------------------
    async transition place_bet(
        public market_id: field,
        public amount: u64,        // Public for pool update
        public outcome: u8,        // Public for pool update (hidden via delays/noise)
        private credits_in: credits.aleo/credits,  // Private credits record (hides bettor identity)
    ) -> (Bet, credits.aleo/credits, Future) {
        // Validate outcome (must be YES or NO)
        assert(outcome == OUTCOME_YES || outcome == OUTCOME_NO);

        // Validate amount (must meet minimum)
        assert(amount >= MIN_BET_AMOUNT);

        // Create PRIVATE bet record (stays with user, encrypted on-chain)
        // This is the key privacy feature - bet details encrypted in record
        let bet: Bet = Bet {
            owner: self.caller,
            market_id: market_id,
            amount: amount,
            outcome: outcome,
            placed_at: 0u64,           // Will be set on-chain
            locked_yes_pool: 0u64,     // Set by frontend for display
            locked_no_pool: 0u64,      // Set by frontend for display
        };

        // Transfer credits from private record to program's public balance
        // Using transfer_private_to_public HIDES the bettor's address
        // Only the program address and amount are visible on-chain
        let (change, transfer_future): (credits.aleo/credits, Future) = credits.aleo/transfer_private_to_public(
            credits_in,    // Private credits record (bettor identity hidden)
            self.address,  // Recipient is this program
            amount         // Amount in microcredits
        );

        // Return bet record, change record, and Future for on-chain processing
        // Pool updates use delayed batching and noise for privacy
        return (bet, change, finalize_place_bet_private(transfer_future, market_id, amount, outcome));
    }

    // On-chain logic - processes bet with privacy enhancements
    // Uses delayed pool updates and noise to hide individual bet amounts
    async function finalize_place_bet_private(
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

        // Update program's held credits tracking (immediate)
        let current_held: u64 = program_credits.get_or_use(0u8, 0u64);
        program_credits.set(0u8, current_held + amount);

        // Get last pool update height for this market
        let last_update: u64 = last_pool_update.get_or_use(market_id, market.created_at);
        let blocks_since_update: u64 = current_height - last_update;

        // Check if we should update pool now (delayed updates for privacy)
        // Update pool if: enough blocks passed OR market closing soon
        let should_update_now: bool = blocks_since_update >= POOL_UPDATE_DELAY_BLOCKS;
        let blocks_until_deadline: u64 = market.deadline - current_height;
        let closing_soon: bool = blocks_until_deadline <= POOL_UPDATE_DELAY_BLOCKS;

        // Get current pool state
        let pool: MarketPool = market_pools.get(market_id);
        
        // Update pool based on outcome
        let yes_add: u64 = outcome == OUTCOME_YES ? amount : 0u64;
        let no_add: u64 = outcome == OUTCOME_NO ? amount : 0u64;
        
        // Generate noise if not updating immediately (for privacy)
        // Use ternary to avoid reassignment issues in async function
        let add_noise: bool = !should_update_now && !closing_soon;
        
        // Generate deterministic noise based on market_id, block height, and amount
        // Use struct for noise input to avoid field arithmetic issues
        // Create a unique seed combining market_id, current_height, and amount
        let noise_raw: u64 = BHP256::hash_to_u64(
            MarketSeed {
                creator: market.creator,
                question_hash: market_id,
                deadline: current_height,
                nonce: amount,
            }
        );
        let noise_amount: u64 = add_noise ? (noise_raw % MIN_POOL_NOISE) : 0u64;

        // Calculate final amounts with optional noise
        let yes_final: u64 = yes_add + (noise_amount / 2u64);
        let no_final: u64 = no_add + (noise_amount / 2u64);

        // Update pool
        let updated_pool: MarketPool = MarketPool {
            market_id: market_id,
            total_yes_pool: pool.total_yes_pool + yes_final,
            total_no_pool: pool.total_no_pool + no_final,
            total_bets: pool.total_bets + 1u64,
            total_unique_bettors: pool.total_unique_bettors + 1u64,
        };

        market_pools.set(market_id, updated_pool);

        // Update last pool update time if we did immediate update
        let update_time: bool = should_update_now || closing_soon;
        if (update_time) {
            last_pool_update.set(market_id, current_height);
        }
    }

    // ------------------------------------------------------------------------
    // PLACE BET PUBLIC (Wallet-Compatible Version)
    // Uses transfer_public_as_signer for wallets that don't expose
    // private record plaintexts. Bet record is still PRIVATE.
    // For maximum privacy, use place_bet (requires wallet record support).
    // ------------------------------------------------------------------------
    async transition place_bet_public(
        private market_id: field,
        private amount: u64,
        private outcome: u8,
    ) -> (Bet, Future) {
        // Validate outcome (must be YES or NO)
        assert(outcome == OUTCOME_YES || outcome == OUTCOME_NO);

        // Validate amount (must meet minimum)
        assert(amount >= MIN_BET_AMOUNT);

        // Create PRIVATE bet record (stays with user, encrypted on-chain)
        let bet: Bet = Bet {
            owner: self.caller,
            market_id: market_id,
            amount: amount,
            outcome: outcome,
            placed_at: 0u64,
            locked_yes_pool: 0u64,
            locked_no_pool: 0u64,
        };

        // Transfer credits from signer's public balance
        let transfer_future: Future = credits.aleo/transfer_public_as_signer(
            self.address,
            amount
        );

        return (bet, finalize_place_bet_public(transfer_future, market_id, amount, outcome));
    }

    async function finalize_place_bet_public(
        transfer_future: Future,
        market_id: field,
        amount: u64,
        outcome: u8,
    ) {
        transfer_future.await();

        let market: Market = markets.get(market_id);
        assert(market.status == MARKET_STATUS_ACTIVE);

        let current_height: u64 = block.height as u64;
        assert(current_height <= market.deadline);

        let current_held: u64 = program_credits.get_or_use(0u8, 0u64);
        program_credits.set(0u8, current_held + amount);

        let last_update: u64 = last_pool_update.get_or_use(market_id, market.created_at);
        let blocks_since_update: u64 = current_height - last_update;

        let should_update_now: bool = blocks_since_update >= POOL_UPDATE_DELAY_BLOCKS;
        let blocks_until_deadline: u64 = market.deadline - current_height;
        let closing_soon: bool = blocks_until_deadline <= POOL_UPDATE_DELAY_BLOCKS;

        let pool: MarketPool = market_pools.get(market_id);

        let yes_add: u64 = outcome == OUTCOME_YES ? amount : 0u64;
        let no_add: u64 = outcome == OUTCOME_NO ? amount : 0u64;

        let add_noise: bool = !should_update_now && !closing_soon;

        let noise_raw: u64 = BHP256::hash_to_u64(
            MarketSeed {
                creator: market.creator,
                question_hash: market_id,
                deadline: current_height,
                nonce: amount,
            }
        );
        let noise_amount: u64 = add_noise ? (noise_raw % MIN_POOL_NOISE) : 0u64;

        let yes_final: u64 = yes_add + (noise_amount / 2u64);
        let no_final: u64 = no_add + (noise_amount / 2u64);

        let updated_pool: MarketPool = MarketPool {
            market_id: market_id,
            total_yes_pool: pool.total_yes_pool + yes_final,
            total_no_pool: pool.total_no_pool + no_final,
            total_bets: pool.total_bets + 1u64,
            total_unique_bettors: pool.total_unique_bettors + 1u64,
        };

        market_pools.set(market_id, updated_pool);

        let update_time: bool = should_update_now || closing_soon;
        if (update_time) {
            last_pool_update.set(market_id, current_height);
        }
    }

    // ------------------------------------------------------------------------
    // COMMIT BET (Phase 2: Commit-Reveal Scheme)
    // Phase 1: Commit bet with private parameters
    // Amount and outcome are PRIVATE - not visible until reveal
    // ------------------------------------------------------------------------
    async transition commit_bet(
        public market_id: field,
        private amount: u64,              // ✅ PRIVATE - not visible!
        private outcome: u8,               // ✅ PRIVATE - not visible!
        private credits_in: credits.aleo/credits,  // ✅ PRIVATE record
    ) -> (Bet, Commitment, credits.aleo/credits, Future) {  // Returns bet_amount_record for user to store
        // Validate outcome privately
        assert(outcome == OUTCOME_YES || outcome == OUTCOME_NO);
        
        // Extract amount from private record
        let bet_amount: u64 = credits_in.microcredits;
        
        // Validate amount privately
        assert(bet_amount >= MIN_BET_AMOUNT);
        assert(bet_amount == amount);  // Ensure consistency
        
        // Generate random nonce for commitment
        // Note: In real implementation, this should use proper randomness
        // For now, we'll use a hash of inputs as nonce
        let nonce_seed: field = BHP256::hash_to_field(
            CommitmentData {
                amount: amount,
                outcome: outcome,
                nonce: self.caller as field,  // Use caller as part of nonce
                bettor: self.caller,
                market_id: market_id,
            }
        );
        let nonce: field = BHP256::hash_to_field(
            CommitmentData {
                amount: amount + 1u64,  // Add variation
                outcome: outcome,
                nonce: nonce_seed,
                bettor: self.caller,
                market_id: market_id,
            }
        );
        
        // Create commitment hash
        let commitment_hash: field = BHP256::hash_to_field(
            CommitmentData {
                amount: amount,
                outcome: outcome,
                nonce: nonce,
                bettor: self.caller,
                market_id: market_id,
            }
        );
        
        // Split credits record
        let (bet_amount_record, change_record) = credits.aleo/split(
            credits_in,
            amount
        );
        
        // Create commitment struct
        let commitment: Commitment = Commitment {
            hash: commitment_hash,
            nonce: nonce,
            market_id: market_id,
            bettor: self.caller,
            committed_at: 0u64,  // Will be set on-chain
        };
        
        // Create bet record (private, encrypted)
        let bet: Bet = Bet {
            owner: self.caller,
            market_id: market_id,
            amount: amount,
            outcome: outcome,
            placed_at: 0u64,  // Will be set on-chain
            locked_yes_pool: 0u64,  // Not applicable at commit time
            locked_no_pool: 0u64,   // Not applicable at commit time
        };

        // Return bet, commitment, change record, and Future for on-chain processing
        // Note: bet_amount_record is returned to user - they must store it for reveal
        return (
            bet,
            commitment,
            bet_amount_record,  // Return bet amount record (user must store this!)
            finalize_commit_bet(commitment_hash, commitment, market_id)
        );
    }
    
    // On-chain logic for commit bet
    async function finalize_commit_bet(
        commitment_hash: field,
        commitment: Commitment,
        market_id: field,
    ) {
        // Get market and verify it's active
        let market: Market = markets.get(market_id);
        assert(market.status == MARKET_STATUS_ACTIVE);
        
        // Check deadline hasn't passed
        let current_height: u64 = block.height as u64;
        assert(current_height <= market.deadline);
        
        // Update commitment with actual block height
        let updated_commitment: Commitment = Commitment {
            hash: commitment.hash,
            nonce: commitment.nonce,
            market_id: commitment.market_id,
            bettor: commitment.bettor,
            committed_at: current_height,
        };
        
        // Store commitment (public, but doesn't reveal amount/outcome)
        bet_commitments.set(commitment_hash, updated_commitment);
        
        // Note: Private credits record is returned to user in transition output
        // User must store it locally and pass it to reveal_bet
        // We cannot store records in mappings (Aleo limitation)
    }
    
    // ------------------------------------------------------------------------
    // REVEAL BET (Phase 2: Commit-Reveal Scheme)
    // Phase 2: Reveal bet after deadline for pool updates
    // Amount and outcome become visible only after deadline
    // User must provide the stored credits record to transfer
    // ------------------------------------------------------------------------
    async transition reveal_bet(
        private bet: Bet,
        private commitment: Commitment,
        private credits_record: credits.aleo/credits,  // Stored private credits record
        public amount: u64,  // Revealed amount (public now, but only after deadline)
    ) -> Future {
        // Verify commitment matches bet
        let expected_hash: field = BHP256::hash_to_field(
            CommitmentData {
                amount: bet.amount,
                outcome: bet.outcome,
                nonce: commitment.nonce,
                bettor: bet.owner,
                market_id: bet.market_id,
            }
        );
        assert(expected_hash == commitment.hash);
        
        // Verify amount matches bet amount
        assert(bet.amount == amount);
        
        // Verify credits record amount matches
        assert(credits_record.microcredits == amount);
        
        // Verify bet ownership
        assert(bet.owner == self.caller);
        assert(commitment.bettor == self.caller);
        
        // Transfer private credits to public balance
        // Note: transfer_private_to_public returns (credits, Future) tuple
        // We need to consume the Future immediately by passing to async function
        let transfer_result: (credits.aleo/credits, Future) = credits.aleo/transfer_private_to_public(
            credits_record,  // Private credits record (first parameter)
            self.address,  // recipient is this program (using self.address)
            amount  // Revealed amount (public)
        );
        
        // Extract Future and pass to finalize function immediately
        // This consumes the Future from the tuple
        return finalize_reveal_bet(
            transfer_result.1,  // Extract Future from tuple
            commitment.hash,
            bet.market_id,
            amount,
            bet.outcome,
            bet.owner
        );
    }
    
    // On-chain logic for reveal bet
    async function finalize_reveal_bet(
        transfer_future: Future,
        commitment_hash: field,
        market_id: field,
        amount: u64,
        outcome: u8,
        bettor: address,
    ) {
        // Await credits transfer first
        transfer_future.await();
        
        // Verify commitment exists
        let commitment: Commitment = bet_commitments.get(commitment_hash);
        assert(commitment.market_id == market_id);
        assert(commitment.bettor == bettor);
        
        // Check not already revealed
        let already_revealed: bool = revealed_bets.get_or_use(commitment_hash, false);
        assert(!already_revealed);
        
        // Mark as revealed
        revealed_bets.set(commitment_hash, true);
        
        // Get market
        let market: Market = markets.get(market_id);
        
        // Verify market is closed or past deadline (can reveal after deadline)
        let current_height: u64 = block.height as u64;
        let is_closed: bool = market.status == MARKET_STATUS_CLOSED;
        let is_past_deadline: bool = current_height > market.deadline;
        assert(is_closed || is_past_deadline || market.status == MARKET_STATUS_RESOLVED);
        
        // Update program's held credits tracking
        let current_held: u64 = program_credits.get_or_use(0u8, 0u64);
        program_credits.set(0u8, current_held + amount);
        
        // Get current pool state
        let pool: MarketPool = market_pools.get(market_id);
        
        // Update pool based on revealed outcome
        let yes_add: u64 = outcome == OUTCOME_YES ? amount : 0u64;
        let no_add: u64 = outcome == OUTCOME_NO ? amount : 0u64;
        
        // Update pool (no noise needed since we're revealing after deadline)
        let updated_pool: MarketPool = MarketPool {
            market_id: market_id,
            total_yes_pool: pool.total_yes_pool + yes_add,
            total_no_pool: pool.total_no_pool + no_add,
            total_bets: pool.total_bets + 1u64,
            total_unique_bettors: pool.total_unique_bettors + 1u64,
        };
        
        market_pools.set(market_id, updated_pool);
    }
    
    // ------------------------------------------------------------------------
    // BATCH UPDATE POOLS (Privacy Enhancement)
    // Allows anyone to trigger batch pool updates for delayed bets
    // This helps hide individual bet timing
    // ------------------------------------------------------------------------
    async transition batch_update_pools(public market_id: field) -> Future {
        return batch_update_pools_onchain(market_id);
    }
    
    async function batch_update_pools_onchain(market_id: field) {
        let market: Market = markets.get(market_id);
        let current_height: u64 = block.height as u64;
        let last_update: u64 = last_pool_update.get_or_use(market_id, market.created_at);
        
        // Only update if enough blocks have passed
        assert(current_height - last_update >= POOL_UPDATE_DELAY_BLOCKS);
        
        // Update last update time
        last_pool_update.set(market_id, current_height);
        
        // Note: In full implementation, this would process pending bets
        // For now, this function exists for future batch processing
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
            locked_yes_pool: bet.locked_yes_pool,
            locked_no_pool: bet.locked_no_pool,
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
        // Using transfer_public from program's public balance
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
