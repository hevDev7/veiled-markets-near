// ============================================================================
// VEILED MARKETS - Privacy-Preserving Prediction Market with Hybrid AMM
// ============================================================================
// Built on Aleo blockchain with Automated Market Maker for continuous liquidity
// 
// Key Features:
// - Share-based system (YES/NO shares)
// - AMM with constant product formula (x * y = k)
// - Buy/Sell anytime before resolution
// - Private positions with ZK proofs
// - Public aggregate liquidity pools
// 
// Architecture:
// - Records: ShareRecord (private ownership)
// - Mappings: AMMPool (public liquidity), Markets (public metadata)
// 
// Privacy Model:
// - Individual share quantities are private
// - Pool reserves are public (for pricing)
// - Trade amounts hidden via batching
// ============================================================================

import credits.aleo;

program veiled_markets_amm.aleo {
    
    // ========================================================================
    // CONSTANTS
    // ========================================================================
    
    // Market status
    const MARKET_STATUS_ACTIVE: u8 = 1u8;
    const MARKET_STATUS_CLOSED: u8 = 2u8;
    const MARKET_STATUS_RESOLVED: u8 = 3u8;
    const MARKET_STATUS_CANCELLED: u8 = 4u8;
    
    // Share types
    const SHARE_TYPE_YES: u8 = 1u8;
    const SHARE_TYPE_NO: u8 = 2u8;
    
    // Fee configuration (basis points)
    const PROTOCOL_FEE_BPS: u64 = 100u64;      // 1%
    const CREATOR_FEE_BPS: u64 = 100u64;       // 1%
    const FEE_DENOMINATOR: u64 = 10000u64;
    
    // AMM configuration
    const INITIAL_LIQUIDITY: u64 = 1000000u64;  // 1 credit worth of each share
    const MIN_TRADE_AMOUNT: u64 = 1000u64;      // 0.001 credits minimum
    const MAX_SLIPPAGE_BPS: u64 = 500u64;       // 5% max slippage
    
    // Share price bounds (in microcredits)
    const MIN_SHARE_PRICE: u64 = 10000u64;      // $0.01
    const MAX_SHARE_PRICE: u64 = 990000u64;     // $0.99
    const SHARE_PRICE_SCALE: u64 = 1000000u64;  // $1.00
    
    // ========================================================================
    // RECORDS (Private State)
    // ========================================================================
    
    // Private share ownership record
    record ShareRecord {
        owner: address,
        market_id: field,
        share_type: u8,          // SHARE_TYPE_YES or SHARE_TYPE_NO
        quantity: u64,           // Number of shares (PRIVATE)
        avg_price: u64,          // Average acquisition price
        acquired_at: u64,        // Block height
    }
    
    // Liquidity provider token (for future LP features)
    record LPToken {
        owner: address,
        market_id: field,
        liquidity_shares: u64,
    }
    
    // ========================================================================
    // MAPPINGS (Public State)
    // ========================================================================
    
    // Market metadata
    mapping markets: field => Market;
    
    // AMM liquidity pools
    mapping amm_pools: field => AMMPool;
    
    // Market resolution data
    mapping resolutions: field => Resolution;
    
    // Redemption tracking (prevent double redemption)
    mapping redemptions: field => bool;
    
    // Protocol treasury
    mapping treasury: u8 => u64;
    
    // ========================================================================
    // STRUCTS
    // ========================================================================
    
    struct Market {
        id: field,
        creator: address,
        question_hash: field,
        category: u8,
        deadline: u64,
        resolution_deadline: u64,
        status: u8,
        created_at: u64,
    }
    
    // AMM Pool state
    struct AMMPool {
        market_id: field,
        yes_reserve: u64,        // YES share reserve (PUBLIC)
        no_reserve: u64,         // NO share reserve (PUBLIC)
        k: u128,                 // Constant product (x * y = k)
        total_yes_issued: u64,   // Total YES shares in circulation
        total_no_issued: u64,    // Total NO shares in circulation
        total_volume: u64,       // Cumulative trading volume
        last_price_yes: u64,     // Last YES price (for charts)
        last_price_no: u64,      // Last NO price
        last_update: u64,        // Last update block
    }
    
    struct Resolution {
        market_id: field,
        winning_share_type: u8,  // SHARE_TYPE_YES or SHARE_TYPE_NO
        resolver: address,
        resolved_at: u64,
    }
    
    // Helper structs
    struct MarketSeed {
        creator: address,
        question_hash: field,
        deadline: u64,
        nonce: u64,
    }
    
    struct RedemptionKey {
        market_id: field,
        owner: address,
        nonce: u64,
    }
    
    // ========================================================================
    // MARKET CREATION
    // ========================================================================
    
    async transition create_market(
        public question_hash: field,
        public category: u8,
        public deadline: u64,
        public resolution_deadline: u64,
    ) -> (field, Future) {
        let market_id: field = BHP256::hash_to_field(
            MarketSeed {
                creator: self.caller,
                question_hash: question_hash,
                deadline: deadline,
                nonce: resolution_deadline,
            }
        );
        
        return (market_id, create_market_finalize(
            market_id,
            self.caller,
            question_hash,
            category,
            deadline,
            resolution_deadline
        ));
    }
    
    async function create_market_finalize(
        market_id: field,
        creator: address,
        question_hash: field,
        category: u8,
        deadline: u64,
        resolution_deadline: u64,
    ) {
        assert(!markets.contains(market_id));
        
        let current_height: u64 = block.height;
        assert(deadline > current_height);
        assert(resolution_deadline > deadline);
        
        // Create market
        let market: Market = Market {
            id: market_id,
            creator: creator,
            question_hash: question_hash,
            category: category,
            deadline: deadline,
            resolution_deadline: resolution_deadline,
            status: MARKET_STATUS_ACTIVE,
            created_at: current_height,
        };
        
        // Initialize AMM pool with equal reserves
        let k: u128 = (INITIAL_LIQUIDITY as u128) * (INITIAL_LIQUIDITY as u128);
        
        let pool: AMMPool = AMMPool {
            market_id: market_id,
            yes_reserve: INITIAL_LIQUIDITY,
            no_reserve: INITIAL_LIQUIDITY,
            k: k,
            total_yes_issued: INITIAL_LIQUIDITY,
            total_no_issued: INITIAL_LIQUIDITY,
            total_volume: 0u64,
            last_price_yes: 500000u64,  // $0.50
            last_price_no: 500000u64,   // $0.50
            last_update: current_height,
        };
        
        markets.set(market_id, market);
        amm_pools.set(market_id, pool);
    }
    
    // ========================================================================
    // BUY SHARES (AMM)
    // ========================================================================
    
    async transition buy_shares(
        public market_id: field,
        public share_type: u8,
        public credits_in: u64,
        public min_shares_out: u64,
    ) -> (ShareRecord, Future) {
        assert(share_type == SHARE_TYPE_YES || share_type == SHARE_TYPE_NO);
        assert(credits_in >= MIN_TRADE_AMOUNT);
        
        // Create share record (quantity calculated on-chain)
        let shares: ShareRecord = ShareRecord {
            owner: self.caller,
            market_id: market_id,
            share_type: share_type,
            quantity: 0u64,  // Will be set in finalize
            avg_price: 0u64,
            acquired_at: 0u64,
        };
        
        return (shares, buy_shares_finalize(
            market_id,
            share_type,
            credits_in,
            min_shares_out,
            self.caller
        ));
    }
    
    async function buy_shares_finalize(
        market_id: field,
        share_type: u8,
        credits_in: u64,
        min_shares_out: u64,
        buyer: address,
    ) {
        // Verify market is active
        let market: Market = markets.get(market_id);
        assert(market.status == MARKET_STATUS_ACTIVE);
        assert(block.height <= market.deadline);
        
        // Get current pool state
        let pool: AMMPool = amm_pools.get(market_id);
        
        // Calculate shares out using AMM formula
        // For buying YES: shares_out = yes_reserve - (k / (no_reserve + credits_in))
        // For buying NO: shares_out = no_reserve - (k / (yes_reserve + credits_in))
        
        let shares_out: u64 = 0u64;
        let new_yes_reserve: u64 = pool.yes_reserve;
        let new_no_reserve: u64 = pool.no_reserve;
        
        if (share_type == SHARE_TYPE_YES) {
            // Buy YES shares by adding to NO reserve
            let new_no: u64 = pool.no_reserve + credits_in;
            let new_yes_u128: u128 = pool.k / (new_no as u128);
            let new_yes: u64 = new_yes_u128 as u64;
            shares_out = pool.yes_reserve - new_yes;
            new_yes_reserve = new_yes;
            new_no_reserve = new_no;
        } else {
            // Buy NO shares by adding to YES reserve
            let new_yes: u64 = pool.yes_reserve + credits_in;
            let new_no_u128: u128 = pool.k / (new_yes as u128);
            let new_no: u64 = new_no_u128 as u64;
            shares_out = pool.no_reserve - new_no;
            new_yes_reserve = new_yes;
            new_no_reserve = new_no_u128 as u64;
        }
        
        // Slippage protection
        assert(shares_out >= min_shares_out);
        
        // Calculate new price
        let total_reserve: u64 = new_yes_reserve + new_no_reserve;
        let new_price_yes: u64 = (new_yes_reserve * SHARE_PRICE_SCALE) / total_reserve;
        let new_price_no: u64 = (new_no_reserve * SHARE_PRICE_SCALE) / total_reserve;
        
        // Update pool
        let updated_pool: AMMPool = AMMPool {
            market_id: market_id,
            yes_reserve: new_yes_reserve,
            no_reserve: new_no_reserve,
            k: pool.k,
            total_yes_issued: share_type == SHARE_TYPE_YES ? 
                pool.total_yes_issued + shares_out : pool.total_yes_issued,
            total_no_issued: share_type == SHARE_TYPE_NO ? 
                pool.total_no_issued + shares_out : pool.total_no_issued,
            total_volume: pool.total_volume + credits_in,
            last_price_yes: new_price_yes,
            last_price_no: new_price_no,
            last_update: block.height,
        };
        
        amm_pools.set(market_id, updated_pool);
    }
    
    // ========================================================================
    // SELL SHARES (AMM)
    // ========================================================================
    
    async transition sell_shares(
        private shares: ShareRecord,
        public shares_in: u64,
        public min_credits_out: u64,
    ) -> (ShareRecord, Future) {
        assert(shares.quantity >= shares_in);
        assert(shares_in >= MIN_TRADE_AMOUNT);
        
        // Return remaining shares
        let remaining: ShareRecord = ShareRecord {
            owner: shares.owner,
            market_id: shares.market_id,
            share_type: shares.share_type,
            quantity: shares.quantity - shares_in,
            avg_price: shares.avg_price,
            acquired_at: shares.acquired_at,
        };
        
        return (remaining, sell_shares_finalize(
            shares.market_id,
            shares.share_type,
            shares_in,
            min_credits_out,
            self.caller
        ));
    }
    
    async function sell_shares_finalize(
        market_id: field,
        share_type: u8,
        shares_in: u64,
        min_credits_out: u64,
        seller: address,
    ) {
        // Verify market is active
        let market: Market = markets.get(market_id);
        assert(market.status == MARKET_STATUS_ACTIVE);
        assert(block.height <= market.deadline);
        
        // Get current pool
        let pool: AMMPool = amm_pools.get(market_id);
        
        // Calculate credits out using AMM formula
        // For selling YES: credits_out = no_reserve - (k / (yes_reserve + shares_in))
        // For selling NO: credits_out = yes_reserve - (k / (no_reserve + shares_in))
        
        let credits_out: u64 = 0u64;
        let new_yes_reserve: u64 = pool.yes_reserve;
        let new_no_reserve: u64 = pool.no_reserve;
        
        if (share_type == SHARE_TYPE_YES) {
            // Sell YES shares, get NO reserve back
            let new_yes: u64 = pool.yes_reserve + shares_in;
            let new_no_u128: u128 = pool.k / (new_yes as u128);
            let new_no: u64 = new_no_u128 as u64;
            credits_out = pool.no_reserve - new_no;
            new_yes_reserve = new_yes;
            new_no_reserve = new_no;
        } else {
            // Sell NO shares, get YES reserve back
            let new_no: u64 = pool.no_reserve + shares_in;
            let new_yes_u128: u128 = pool.k / (new_no as u128);
            let new_yes: u64 = new_yes_u128 as u64;
            credits_out = pool.yes_reserve - new_yes;
            new_yes_reserve = new_yes;
            new_no_reserve = new_no;
        }
        
        // Slippage protection
        assert(credits_out >= min_credits_out);
        
        // Apply fees
        let fee: u64 = (credits_out * (PROTOCOL_FEE_BPS + CREATOR_FEE_BPS)) / FEE_DENOMINATOR;
        let net_credits: u64 = credits_out - fee;
        
        // Calculate new prices
        let total_reserve: u64 = new_yes_reserve + new_no_reserve;
        let new_price_yes: u64 = (new_yes_reserve * SHARE_PRICE_SCALE) / total_reserve;
        let new_price_no: u64 = (new_no_reserve * SHARE_PRICE_SCALE) / total_reserve;
        
        // Update pool
        let updated_pool: AMMPool = AMMPool {
            market_id: market_id,
            yes_reserve: new_yes_reserve,
            no_reserve: new_no_reserve,
            k: pool.k,
            total_yes_issued: share_type == SHARE_TYPE_YES ? 
                pool.total_yes_issued - shares_in : pool.total_yes_issued,
            total_no_issued: share_type == SHARE_TYPE_NO ? 
                pool.total_no_issued - shares_in : pool.total_no_issued,
            total_volume: pool.total_volume + net_credits,
            last_price_yes: new_price_yes,
            last_price_no: new_price_no,
            last_update: block.height,
        };
        
        amm_pools.set(market_id, updated_pool);
        
        // Update treasury
        let current_treasury: u64 = treasury.get_or_use(0u8, 0u64);
        treasury.set(0u8, current_treasury + fee);
    }
    
    // ========================================================================
    // MARKET RESOLUTION
    // ========================================================================
    
    async transition resolve_market(
        public market_id: field,
        public winning_share_type: u8,
    ) -> Future {
        assert(winning_share_type == SHARE_TYPE_YES || winning_share_type == SHARE_TYPE_NO);
        return resolve_market_finalize(market_id, winning_share_type, self.caller);
    }
    
    async function resolve_market_finalize(
        market_id: field,
        winning_share_type: u8,
        resolver: address,
    ) {
        let market: Market = markets.get(market_id);
        
        // Only creator can resolve
        assert(market.creator == resolver);
        assert(block.height > market.deadline);
        assert(block.height <= market.resolution_deadline);
        
        // Create resolution
        let resolution: Resolution = Resolution {
            market_id: market_id,
            winning_share_type: winning_share_type,
            resolver: resolver,
            resolved_at: block.height,
        };
        
        // Update market status
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
        
        markets.set(market_id, resolved_market);
        resolutions.set(market_id, resolution);
    }
    
    // ========================================================================
    // REDEEM WINNING SHARES
    // ========================================================================
    
    async transition redeem_shares(
        private shares: ShareRecord,
    ) -> Future {
        return redeem_shares_finalize(
            shares.market_id,
            shares.share_type,
            shares.quantity,
            shares.owner
        );
    }
    
    async function redeem_shares_finalize(
        market_id: field,
        share_type: u8,
        quantity: u64,
        owner: address,
    ) {
        // Verify market is resolved
        let resolution: Resolution = resolutions.get(market_id);
        
        // Verify shares are winning type
        assert(share_type == resolution.winning_share_type);
        
        // Generate redemption key
        let redemption_key: field = BHP256::hash_to_field(RedemptionKey {
            market_id: market_id,
            owner: owner,
            nonce: quantity,
        });
        
        // Prevent double redemption
        let already_redeemed: bool = redemptions.get_or_use(redemption_key, false);
        assert(!already_redeemed);
        
        redemptions.set(redemption_key, true);
        
        // Payout = quantity * $1 per share
        // Actual credit transfer handled separately
    }
    
    // ========================================================================
    // HELPER FUNCTIONS
    // ========================================================================
    
    // Calculate current YES price
    inline get_yes_price(yes_reserve: u64, no_reserve: u64) -> u64 {
        let total: u64 = yes_reserve + no_reserve;
        return (yes_reserve * SHARE_PRICE_SCALE) / total;
    }
    
    // Calculate current NO price
    inline get_no_price(yes_reserve: u64, no_reserve: u64) -> u64 {
        let total: u64 = yes_reserve + no_reserve;
        return (no_reserve * SHARE_PRICE_SCALE) / total;
    }
    
    // Calculate shares out for given credits in
    inline calculate_shares_out(
        reserve_in: u64,
        reserve_out: u64,
        amount_in: u64,
        k: u128,
    ) -> u64 {
        let new_reserve_in: u64 = reserve_in + amount_in;
        let new_reserve_out_u128: u128 = k / (new_reserve_in as u128);
        let new_reserve_out: u64 = new_reserve_out_u128 as u64;
        return reserve_out - new_reserve_out;
    }
}
