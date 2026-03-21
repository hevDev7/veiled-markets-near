// ============================================================================
// VEILED MARKETS USAD - Privacy-Preserving Prediction Market (USAD Token)
// ============================================================================
// Companion program to veiled_markets_v22.aleo for USAD stablecoin markets.
// Separated due to snarkVM 31-transition limit.
//
// All USAD transactions use PRIVATE token paths:
//   Inflow:  test_usad_stablecoin.aleo/transfer_private_to_public (Token record + MerkleProof)
//   Outflow: test_usad_stablecoin.aleo/transfer_public_to_private (returns Token record)
//
// Dispute bonds are always in ALEO (credits.aleo) regardless of market token.
//
// 19 transitions total (well within 31 limit)
// ============================================================================

import credits.aleo;
import test_usad_stablecoin.aleo;

program veiled_markets_usad_v8.aleo {

    // ========================================================================
    // CONSTANTS
    // ========================================================================

    const MARKET_STATUS_ACTIVE: u8 = 1u8;
    const MARKET_STATUS_CLOSED: u8 = 2u8;
    const MARKET_STATUS_RESOLVED: u8 = 3u8;
    const MARKET_STATUS_CANCELLED: u8 = 4u8;
    const STATUS_PENDING_RESOLUTION: u8 = 5u8;

    const OUTCOME_1: u8 = 1u8;
    const OUTCOME_2: u8 = 2u8;
    const OUTCOME_3: u8 = 3u8;
    const OUTCOME_4: u8 = 4u8;

    const TOKEN_ALEO: u8 = 1u8;
    const TOKEN_USAD: u8 = 3u8;

    // Fee configuration (basis points: 100 = 1%)
    const PROTOCOL_FEE_BPS: u128 = 50u128;
    const CREATOR_FEE_BPS: u128 = 50u128;
    const LP_FEE_BPS: u128 = 100u128;
    const FEE_DENOMINATOR: u128 = 10000u128;

    // Challenge window (~12 hours at ~15s blocks)
    const CHALLENGE_WINDOW_BLOCKS: u64 = 2880u64;

    const MIN_TRADE_AMOUNT: u128 = 1000u128;
    const MIN_DISPUTE_BOND: u128 = 1000000u128;
    const MIN_LIQUIDITY: u128 = 10000u128;

    const MULTISIG_CONFIG_KEY: u8 = 0u8;
    const ACTION_WITHDRAW: u8 = 1u8;
    const DEPLOYER: address = aleo10tm5ektsr5v7kdc5phs8pha42vrkhe2rlxfl2v979wunhzx07vpqnqplv8;

    // Treasury key for USAD
    const CREDIT_KEY_USAD: u8 = 2u8;
    // Treasury key for ALEO (dispute bonds)
    const CREDIT_KEY_ALEO: u8 = 0u8;

    // ========================================================================
    // RECORDS
    // ========================================================================

    record OutcomeShare {
        owner: address,
        market_id: field,
        outcome: u8,
        quantity: u128,
        share_nonce: field,
        token_type: u8,
    }

    record LPToken {
        owner: address,
        market_id: field,
        lp_shares: u128,
        lp_nonce: field,
        token_type: u8,
    }

    record DisputeBondReceipt {
        owner: address,
        market_id: field,
        proposed_outcome: u8,
        bond_amount: u128,
        dispute_nonce: field,
        token_type: u8,
    }

    record RefundClaim {
        owner: address,
        market_id: field,
        amount: u128,
        claim_nonce: field,
        token_type: u8,
    }

    // ========================================================================
    // STRUCTS
    // ========================================================================

    struct Market {
        id: field,
        creator: address,
        resolver: address,
        question_hash: field,
        category: u8,
        num_outcomes: u8,
        deadline: u64,
        resolution_deadline: u64,
        status: u8,
        created_at: u64,
        token_type: u8,
    }

    struct AMMPool {
        market_id: field,
        reserve_1: u128,
        reserve_2: u128,
        reserve_3: u128,
        reserve_4: u128,
        total_liquidity: u128,
        total_lp_shares: u128,
        total_volume: u128,
    }

    struct MarketResolution {
        market_id: field,
        winning_outcome: u8,
        resolver: address,
        resolved_at: u64,
        challenge_deadline: u64,
        finalized: bool,
    }

    struct MarketFees {
        market_id: field,
        protocol_fees: u128,
        creator_fees: u128,
    }

    struct DisputeData {
        market_id: field,
        disputer: address,
        proposed_outcome: u8,
        bond_amount: u128,
        disputed_at: u64,
    }

    struct SignerConfig {
        signer_1: address,
        signer_2: address,
        signer_3: address,
        threshold: u8,
    }

    struct MultiSigProposal {
        proposal_id: field,
        action: u8,
        amount: u128,
        recipient: address,
        token_type: u8,
        proposed_at: u64,
    }

    struct MarketSeed {
        creator: address,
        question_hash: field,
        deadline: u64,
        nonce: u64,
    }

    struct ShareClaimKey {
        market_id: field,
        claimer: address,
        share_nonce: field,
    }

    struct LPClaimKey {
        market_id: field,
        claimer: address,
        lp_nonce: field,
    }

    struct DisputeClaimKey {
        market_id: field,
        claimer: address,
        dispute_nonce: field,
    }

    struct ProposalSeed {
        proposer: address,
        action: u8,
        amount: u128,
        recipient: address,
        token_type: u8,
        nonce: u64,
    }

    struct ApprovalKey {
        proposal_id: field,
        signer: address,
    }

    // ========================================================================
    // MAPPINGS (14 total — mirrors main contract)
    // ========================================================================

    mapping markets: field => Market;
    mapping amm_pools: field => AMMPool;
    mapping market_resolutions: field => MarketResolution;
    mapping market_fees: field => MarketFees;
    mapping market_disputes: field => DisputeData;
    mapping share_redeemed: field => bool;
    mapping creator_fees_claimed: field => bool;
    mapping program_credits: u8 => u128;       // 0u8=ALEO(bonds), 2u8=USAD
    mapping market_credits: field => u128;
    mapping protocol_treasury: u8 => u128;     // 2u8=USAD
    mapping multisig_config: u8 => SignerConfig;
    mapping multisig_proposals: field => MultiSigProposal;
    mapping multisig_approvals: field => bool;
    mapping lp_positions: field => bool;

    // ========================================================================
    // CONSTRUCTOR
    // ========================================================================

    @noupgrade
    async constructor() {
    }

    // ########################################################################
    //                      USAD MARKET OPERATIONS (PRIVATE)
    // ########################################################################

    // ========================================================================
    // 1. CREATE MARKET (USAD) — Private inflow
    // ========================================================================

    async transition create_market_usad(
        public question_hash: field,
        public category: u8,
        public num_outcomes: u8,
        public deadline: u64,
        public resolution_deadline: u64,
        public resolver: address,
        private initial_liquidity: u128,
    ) -> (field, LPToken, Future) {
        assert(num_outcomes >= 2u8 && num_outcomes <= 4u8);
        assert(initial_liquidity >= MIN_LIQUIDITY);

        let market_id: field = BHP256::hash_to_field(
            MarketSeed {
                creator: self.caller,
                question_hash: question_hash,
                deadline: deadline,
                nonce: resolution_deadline,
            }
        );

        let lp_nonce: field = BHP256::hash_to_field(LPClaimKey {
            market_id: market_id,
            claimer: self.caller,
            lp_nonce: 0field,
        });

        let lp_token: LPToken = LPToken {
            owner: self.caller,
            market_id: market_id,
            lp_shares: initial_liquidity,
            lp_nonce: lp_nonce,
            token_type: TOKEN_USAD,
        };

        // Public inflow (MerkleProof parser bug workaround)
        let transfer_future: Future = test_usad_stablecoin.aleo/transfer_public_as_signer(
            self.address, initial_liquidity
        );

        return (market_id, lp_token, create_market_usad_fin(
            transfer_future,
            market_id,
            self.caller,
            question_hash,
            category,
            num_outcomes,
            deadline,
            resolution_deadline,
            resolver,
            initial_liquidity
        ));
    }

    async function create_market_usad_fin(
        transfer_future: Future,
        market_id: field,
        creator: address,
        question_hash: field,
        category: u8,
        num_outcomes: u8,
        deadline: u64,
        resolution_deadline: u64,
        resolver: address,
        initial_liquidity: u128,
    ) {
        transfer_future.await();

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
            num_outcomes: num_outcomes,
            deadline: deadline,
            resolution_deadline: resolution_deadline,
            status: MARKET_STATUS_ACTIVE,
            created_at: current_height,
            token_type: TOKEN_USAD,
        };

        let per_outcome: u128 = initial_liquidity / (num_outcomes as u128);
        let r3: u128 = num_outcomes >= 3u8 ? per_outcome : 0u128;
        let r4: u128 = num_outcomes >= 4u8 ? per_outcome : 0u128;

        let initial_pool: AMMPool = AMMPool {
            market_id: market_id,
            reserve_1: per_outcome,
            reserve_2: per_outcome,
            reserve_3: r3,
            reserve_4: r4,
            total_liquidity: initial_liquidity,
            total_lp_shares: initial_liquidity,
            total_volume: 0u128,
        };

        markets.set(market_id, new_market);
        amm_pools.set(market_id, initial_pool);
        market_fees.set(market_id, MarketFees {
            market_id: market_id,
            protocol_fees: 0u128,
            creator_fees: 0u128,
        });

        let current_held: u128 = program_credits.get_or_use(CREDIT_KEY_USAD, 0u128);
        program_credits.set(CREDIT_KEY_USAD, current_held + initial_liquidity);
        market_credits.set(market_id, initial_liquidity);
    }

    // ========================================================================
    // 2. BUY SHARES (USAD) — PRIVATE inflow with Token record + MerkleProof
    // ========================================================================
    // Uses transfer_private_to_public to deposit private Token to program balance.
    // Pattern matches buy_shares_usdcx in veiled_markets_v29.aleo.

    async transition buy_shares_usad(
        private market_id: field,
        private outcome: u8,
        private amount_in: u128,
        private expected_shares: u128,
        private min_shares_out: u128,
        private share_nonce: field,
        private token_in: test_usad_stablecoin.aleo/Token,
        private proofs: [test_usad_stablecoin.aleo/MerkleProof; 2],
    ) -> (OutcomeShare, test_usad_stablecoin.aleo/ComplianceRecord, test_usad_stablecoin.aleo/Token, Future) {
        assert(outcome >= OUTCOME_1 && outcome <= OUTCOME_4);
        assert(amount_in >= MIN_TRADE_AMOUNT);

        let share: OutcomeShare = OutcomeShare {
            owner: self.caller,
            market_id: market_id,
            outcome: outcome,
            quantity: expected_shares,
            share_nonce: share_nonce,
            token_type: TOKEN_USAD,
        };

        // Private inflow: Token record + MerkleProof → program public balance
        // Same pattern as credits.aleo/transfer_private_to_public in buy_shares_private
        let (compliance, change, transfer_future): (
            test_usad_stablecoin.aleo/ComplianceRecord,
            test_usad_stablecoin.aleo/Token,
            Future
        ) = test_usad_stablecoin.aleo/transfer_private_to_public(
            self.address, amount_in, token_in, proofs
        );

        return (share, compliance, change, buy_shares_usad_fin(
            transfer_future, market_id, outcome, amount_in,
            expected_shares, min_shares_out
        ));
    }

    async function buy_shares_usad_fin(
        transfer_future: Future,
        market_id: field,
        outcome: u8,
        amount_in: u128,
        expected_shares: u128,
        min_shares_out: u128,
    ) {
        transfer_future.await();

        let market: Market = markets.get(market_id);
        assert(market.status == MARKET_STATUS_ACTIVE);
        assert(market.token_type == TOKEN_USAD);
        assert(outcome >= 1u8 && outcome <= market.num_outcomes);

        let current_height: u64 = block.height as u64;
        assert(current_height <= market.deadline);

        // Fees
        let protocol_fee: u128 = (amount_in * PROTOCOL_FEE_BPS) / FEE_DENOMINATOR;
        let creator_fee: u128 = (amount_in * CREATOR_FEE_BPS) / FEE_DENOMINATOR;
        let amount_to_pool: u128 = amount_in - protocol_fee - creator_fee;

        let fees: MarketFees = market_fees.get(market_id);
        market_fees.set(market_id, MarketFees {
            market_id: market_id,
            protocol_fees: fees.protocol_fees + protocol_fee,
            creator_fees: fees.creator_fees + creator_fee,
        });
        let current_treasury: u128 = protocol_treasury.get_or_use(CREDIT_KEY_USAD, 0u128);
        protocol_treasury.set(CREDIT_KEY_USAD, current_treasury + protocol_fee);

        // FPMM calculation (step division)
        let pool: AMMPool = amm_pools.get(market_id);
        let n: u8 = market.num_outcomes;
        let r1: u128 = pool.reserve_1;
        let r2: u128 = pool.reserve_2;
        let r3: u128 = pool.reserve_3;
        let r4: u128 = pool.reserve_4;
        let a: u128 = amount_to_pool;

        let r_i: u128 = outcome == 1u8 ? r1 :
                         (outcome == 2u8 ? r2 :
                         (outcome == 3u8 ? r3 : r4));

        let step0: u128 = r_i;
        let step1: u128 = outcome != 1u8 ? (step0 * r1) / (r1 + a) : step0;
        let step2: u128 = outcome != 2u8 ? (step1 * r2) / (r2 + a) : step1;
        let step3: u128 = (outcome != 3u8 && n >= 3u8) ? (step2 * r3) / (r3 + a) : step2;
        let step4: u128 = (outcome != 4u8 && n >= 4u8) ? (step3 * r4) / (r4 + a) : step3;

        let r_i_new: u128 = step4;
        let shares_out: u128 = (r_i + a) - r_i_new;

        assert(shares_out >= min_shares_out);
        assert(shares_out >= expected_shares);
        assert(shares_out > 0u128);

        let new_r1: u128 = outcome == 1u8 ? r_i_new : (r1 + a);
        let new_r2: u128 = outcome == 2u8 ? r_i_new : (r2 + a);
        let nr3_active: u128 = outcome == 3u8 ? r_i_new : (r3 + a);
        let new_r3: u128 = n >= 3u8 ? nr3_active : 0u128;
        let nr4_active: u128 = outcome == 4u8 ? r_i_new : (r4 + a);
        let new_r4: u128 = n >= 4u8 ? nr4_active : 0u128;

        amm_pools.set(market_id, AMMPool {
            market_id: market_id,
            reserve_1: new_r1,
            reserve_2: new_r2,
            reserve_3: new_r3,
            reserve_4: new_r4,
            total_liquidity: pool.total_liquidity + amount_to_pool,
            total_lp_shares: pool.total_lp_shares,
            total_volume: pool.total_volume + amount_in,
        });

        let current_held: u128 = program_credits.get_or_use(CREDIT_KEY_USAD, 0u128);
        program_credits.set(CREDIT_KEY_USAD, current_held + amount_in);
        let market_held: u128 = market_credits.get_or_use(market_id, 0u128);
        market_credits.set(market_id, market_held + amount_in);
    }

    // ========================================================================
    // 3. SELL SHARES (USAD) — Private outflow with Token record
    // ========================================================================

    async transition sell_shares_usad(
        private shares: OutcomeShare,
        private tokens_desired: u128,
        private max_shares_used: u128,
    ) -> (OutcomeShare, test_usad_stablecoin.aleo/ComplianceRecord, test_usad_stablecoin.aleo/Token, Future) {
        assert(shares.owner == self.caller);
        assert(shares.token_type == TOKEN_USAD);
        assert(tokens_desired >= MIN_TRADE_AMOUNT);
        assert(max_shares_used > 0u128);
        assert(max_shares_used <= shares.quantity);

        let protocol_fee: u128 = (tokens_desired * PROTOCOL_FEE_BPS) / FEE_DENOMINATOR;
        let creator_fee: u128 = (tokens_desired * CREATOR_FEE_BPS) / FEE_DENOMINATOR;
        let lp_fee: u128 = (tokens_desired * LP_FEE_BPS) / FEE_DENOMINATOR;
        let net_tokens: u128 = tokens_desired - protocol_fee - creator_fee - lp_fee;

        // Private outflow: returns Token record to seller
        let (compliance, token_out, transfer_future): (
            test_usad_stablecoin.aleo/ComplianceRecord,
            test_usad_stablecoin.aleo/Token,
            Future
        ) = test_usad_stablecoin.aleo/transfer_public_to_private(self.caller, net_tokens);

        let remainder: OutcomeShare = OutcomeShare {
            owner: self.caller,
            market_id: shares.market_id,
            outcome: shares.outcome,
            quantity: shares.quantity - max_shares_used,
            share_nonce: shares.share_nonce,
            token_type: TOKEN_USAD,
        };

        return (remainder, compliance, token_out, sell_shares_usad_fin(
            transfer_future, shares.market_id, shares.outcome,
            tokens_desired, max_shares_used
        ));
    }

    async function sell_shares_usad_fin(
        transfer_future: Future,
        market_id: field,
        outcome: u8,
        tokens_desired: u128,
        max_shares_used: u128,
    ) {
        transfer_future.await();

        let market: Market = markets.get(market_id);
        assert(market.status == MARKET_STATUS_ACTIVE);
        assert(market.token_type == TOKEN_USAD);
        assert(outcome >= 1u8 && outcome <= market.num_outcomes);

        let current_height: u64 = block.height as u64;
        assert(current_height <= market.deadline);

        let protocol_fee: u128 = (tokens_desired * PROTOCOL_FEE_BPS) / FEE_DENOMINATOR;
        let creator_fee: u128 = (tokens_desired * CREATOR_FEE_BPS) / FEE_DENOMINATOR;
        let lp_fee: u128 = (tokens_desired * LP_FEE_BPS) / FEE_DENOMINATOR;
        let net_tokens: u128 = tokens_desired - protocol_fee - creator_fee - lp_fee;
        let pool_tokens_out: u128 = tokens_desired - lp_fee;

        let fees: MarketFees = market_fees.get(market_id);
        market_fees.set(market_id, MarketFees {
            market_id: market_id,
            protocol_fees: fees.protocol_fees + protocol_fee,
            creator_fees: fees.creator_fees + creator_fee,
        });
        let current_treasury: u128 = protocol_treasury.get_or_use(CREDIT_KEY_USAD, 0u128);
        protocol_treasury.set(CREDIT_KEY_USAD, current_treasury + protocol_fee);

        // FPMM sell calculation
        let pool: AMMPool = amm_pools.get(market_id);
        let n: u8 = market.num_outcomes;
        let r1: u128 = pool.reserve_1;
        let r2: u128 = pool.reserve_2;
        let r3: u128 = pool.reserve_3;
        let r4: u128 = pool.reserve_4;
        let p: u128 = pool_tokens_out;

        let r_i: u128 = outcome == 1u8 ? r1 :
                         (outcome == 2u8 ? r2 :
                         (outcome == 3u8 ? r3 : r4));

        let sub1: u128 = outcome != 1u8 ? p : 0u128;
        assert(r1 >= sub1);
        let den1: u128 = r1 - sub1;
        let step0: u128 = r_i;
        let step1: u128 = outcome != 1u8 ? (step0 * r1) / den1 : step0;

        let sub2: u128 = outcome != 2u8 ? p : 0u128;
        assert(r2 >= sub2);
        let den2: u128 = r2 - sub2;
        let step2: u128 = outcome != 2u8 ? (step1 * r2) / den2 : step1;

        let apply3: bool = outcome != 3u8 && n >= 3u8;
        let sub3: u128 = apply3 ? p : 0u128;
        assert(r3 >= sub3);
        let den3_raw: u128 = r3 - sub3;
        let safe_den3: u128 = den3_raw == 0u128 ? 1u128 : den3_raw;
        let step3: u128 = apply3 ? (step2 * r3) / safe_den3 : step2;

        let apply4: bool = outcome != 4u8 && n >= 4u8;
        let sub4: u128 = apply4 ? p : 0u128;
        assert(r4 >= sub4);
        let den4_raw: u128 = r4 - sub4;
        let safe_den4: u128 = den4_raw == 0u128 ? 1u128 : den4_raw;
        let step4: u128 = apply4 ? (step3 * r4) / safe_den4 : step3;

        let r_i_new: u128 = step4;
        let shares_needed: u128 = r_i_new - r_i + p;
        assert(shares_needed <= max_shares_used);
        assert(shares_needed > 0u128);

        let new_r1: u128 = outcome == 1u8 ? r_i_new : (r1 - sub1);
        let new_r2: u128 = outcome == 2u8 ? r_i_new : (r2 - sub2);
        let nr3_act: u128 = outcome == 3u8 ? r_i_new : (r3 - sub3);
        let new_r3: u128 = n >= 3u8 ? nr3_act : 0u128;
        let nr4_act: u128 = outcome == 4u8 ? r_i_new : (r4 - sub4);
        let new_r4: u128 = n >= 4u8 ? nr4_act : 0u128;

        amm_pools.set(market_id, AMMPool {
            market_id: market_id,
            reserve_1: new_r1,
            reserve_2: new_r2,
            reserve_3: new_r3,
            reserve_4: new_r4,
            total_liquidity: pool.total_liquidity - pool_tokens_out,
            total_lp_shares: pool.total_lp_shares,
            total_volume: pool.total_volume + tokens_desired,
        });

        let market_held: u128 = market_credits.get_or_use(market_id, 0u128);
        assert(market_held >= pool_tokens_out);
        market_credits.set(market_id, market_held - pool_tokens_out);

        let current_held: u128 = program_credits.get_or_use(CREDIT_KEY_USAD, 0u128);
        assert(current_held >= net_tokens);
        program_credits.set(CREDIT_KEY_USAD, current_held - net_tokens);
    }

    // ========================================================================
    // 4. ADD LIQUIDITY (USAD) — Private inflow
    // ========================================================================

    async transition add_liquidity_usad(
        private market_id: field,
        private amount: u128,
        private expected_lp_shares: u128,
        private lp_nonce: field,
    ) -> (LPToken, Future) {
        assert(amount >= MIN_LIQUIDITY);

        let lp_token: LPToken = LPToken {
            owner: self.caller,
            market_id: market_id,
            lp_shares: expected_lp_shares,
            lp_nonce: lp_nonce,
            token_type: TOKEN_USAD,
        };

        // Public inflow (MerkleProof parser bug workaround)
        let transfer_future: Future = test_usad_stablecoin.aleo/transfer_public_as_signer(
            self.address, amount
        );

        return (lp_token, add_liq_usad_fin(
            transfer_future, market_id, amount, expected_lp_shares
        ));
    }

    async function add_liq_usad_fin(
        transfer_future: Future,
        market_id: field,
        amount: u128,
        expected_lp_shares: u128,
    ) {
        transfer_future.await();

        let market: Market = markets.get(market_id);
        assert(market.status == MARKET_STATUS_ACTIVE);
        assert(market.token_type == TOKEN_USAD);

        let current_height: u64 = block.height as u64;
        assert(current_height <= market.deadline);

        let pool: AMMPool = amm_pools.get(market_id);

        let total_reserves: u128 = pool.reserve_1 + pool.reserve_2 + pool.reserve_3 + pool.reserve_4;
        assert(total_reserves > 0u128);
        let computed_shares: u128 = (amount * pool.total_lp_shares) / total_reserves;
        assert(computed_shares >= expected_lp_shares);
        assert(expected_lp_shares > 0u128);

        let add_1: u128 = (amount * pool.reserve_1) / total_reserves;
        let add_2: u128 = (amount * pool.reserve_2) / total_reserves;
        let add_3: u128 = (amount * pool.reserve_3) / total_reserves;
        let add_4: u128 = amount - add_1 - add_2 - add_3;

        amm_pools.set(market_id, AMMPool {
            market_id: market_id,
            reserve_1: pool.reserve_1 + add_1,
            reserve_2: pool.reserve_2 + add_2,
            reserve_3: pool.reserve_3 + add_3,
            reserve_4: pool.reserve_4 + add_4,
            total_liquidity: pool.total_liquidity + amount,
            total_lp_shares: pool.total_lp_shares + expected_lp_shares,
            total_volume: pool.total_volume,
        });

        let current_held: u128 = program_credits.get_or_use(CREDIT_KEY_USAD, 0u128);
        program_credits.set(CREDIT_KEY_USAD, current_held + amount);
        let market_held: u128 = market_credits.get_or_use(market_id, 0u128);
        market_credits.set(market_id, market_held + amount);
    }

    // ########################################################################
    //                      SHARED MARKET LIFECYCLE
    // ########################################################################

    // ========================================================================
    // 5. CLOSE MARKET
    // ========================================================================

    async transition close_market(public market_id: field) -> Future {
        return close_market_finalize(market_id);
    }

    async function close_market_finalize(market_id: field) {
        let market: Market = markets.get(market_id);
        assert(market.status == MARKET_STATUS_ACTIVE);
        let current_height: u64 = block.height as u64;
        assert(current_height > market.deadline);

        markets.set(market_id, Market {
            id: market.id,
            creator: market.creator,
            resolver: market.resolver,
            question_hash: market.question_hash,
            category: market.category,
            num_outcomes: market.num_outcomes,
            deadline: market.deadline,
            resolution_deadline: market.resolution_deadline,
            status: MARKET_STATUS_CLOSED,
            created_at: market.created_at,
            token_type: market.token_type,
        });
    }

    // ========================================================================
    // 6. RESOLVE MARKET
    // ========================================================================

    async transition resolve_market(
        public market_id: field,
        public winning_outcome: u8,
    ) -> Future {
        return resolve_market_finalize(market_id, winning_outcome, self.caller);
    }

    async function resolve_market_finalize(
        market_id: field,
        winning_outcome: u8,
        resolver: address,
    ) {
        let market: Market = markets.get(market_id);
        assert(market.resolver == resolver);
        assert(winning_outcome >= 1u8 && winning_outcome <= market.num_outcomes);

        let current_height: u64 = block.height as u64;
        let is_closed: bool = market.status == MARKET_STATUS_CLOSED;
        let is_past_deadline: bool = market.status == MARKET_STATUS_ACTIVE && current_height > market.deadline;
        assert(is_closed || is_past_deadline);
        assert(current_height <= market.resolution_deadline);

        let challenge_deadline: u64 = current_height + CHALLENGE_WINDOW_BLOCKS;

        market_disputes.remove(market_id);

        market_resolutions.set(market_id, MarketResolution {
            market_id: market_id,
            winning_outcome: winning_outcome,
            resolver: resolver,
            resolved_at: current_height,
            challenge_deadline: challenge_deadline,
            finalized: false,
        });

        markets.set(market_id, Market {
            id: market.id,
            creator: market.creator,
            resolver: market.resolver,
            question_hash: market.question_hash,
            category: market.category,
            num_outcomes: market.num_outcomes,
            deadline: market.deadline,
            resolution_deadline: market.resolution_deadline,
            status: STATUS_PENDING_RESOLUTION,
            created_at: market.created_at,
            token_type: market.token_type,
        });
    }

    // ========================================================================
    // 7. FINALIZE RESOLUTION
    // ========================================================================

    async transition finalize_resolution(public market_id: field) -> Future {
        return finalize_resolution_fin(market_id);
    }

    async function finalize_resolution_fin(market_id: field) {
        let market: Market = markets.get(market_id);
        assert(market.status == STATUS_PENDING_RESOLUTION);

        let resolution: MarketResolution = market_resolutions.get(market_id);
        assert(!resolution.finalized);

        let current_height: u64 = block.height as u64;
        assert(current_height > resolution.challenge_deadline);

        let has_dispute: bool = market_disputes.contains(market_id);
        assert(!has_dispute);

        market_resolutions.set(market_id, MarketResolution {
            market_id: market_id,
            winning_outcome: resolution.winning_outcome,
            resolver: resolution.resolver,
            resolved_at: resolution.resolved_at,
            challenge_deadline: resolution.challenge_deadline,
            finalized: true,
        });

        markets.set(market_id, Market {
            id: market.id,
            creator: market.creator,
            resolver: market.resolver,
            question_hash: market.question_hash,
            category: market.category,
            num_outcomes: market.num_outcomes,
            deadline: market.deadline,
            resolution_deadline: market.resolution_deadline,
            status: MARKET_STATUS_RESOLVED,
            created_at: market.created_at,
            token_type: market.token_type,
        });
    }

    // ========================================================================
    // 8. CANCEL MARKET
    // ========================================================================

    async transition cancel_market(public market_id: field) -> Future {
        return cancel_market_finalize(market_id, self.caller);
    }

    async function cancel_market_finalize(market_id: field, caller: address) {
        let market: Market = markets.get(market_id);
        let current_height: u64 = block.height as u64;

        let is_creator_cancel: bool = market.creator == caller
            && market.status == MARKET_STATUS_ACTIVE;

        let is_emergency: bool = current_height > market.resolution_deadline
            && market.status != MARKET_STATUS_RESOLVED
            && market.status != MARKET_STATUS_CANCELLED
            && market.status != STATUS_PENDING_RESOLUTION;

        assert(is_creator_cancel || is_emergency);

        let pool: AMMPool = amm_pools.get(market_id);
        assert(!is_creator_cancel || pool.total_volume == 0u128);

        market_resolutions.remove(market_id);

        markets.set(market_id, Market {
            id: market.id,
            creator: market.creator,
            resolver: market.resolver,
            question_hash: market.question_hash,
            category: market.category,
            num_outcomes: market.num_outcomes,
            deadline: market.deadline,
            resolution_deadline: market.resolution_deadline,
            status: MARKET_STATUS_CANCELLED,
            created_at: market.created_at,
            token_type: market.token_type,
        });
    }

    // ########################################################################
    //                      DISPUTE / CHALLENGE (ALEO bonds)
    // ########################################################################

    // ========================================================================
    // 9. DISPUTE RESOLUTION (bond in ALEO)
    // ========================================================================

    async transition dispute_resolution(
        private market_id: field,
        private proposed_outcome: u8,
        private dispute_nonce: field,
        private credits_in: credits.aleo/credits,
    ) -> (DisputeBondReceipt, credits.aleo/credits, Future) {
        let receipt: DisputeBondReceipt = DisputeBondReceipt {
            owner: self.caller,
            market_id: market_id,
            proposed_outcome: proposed_outcome,
            bond_amount: MIN_DISPUTE_BOND,
            dispute_nonce: dispute_nonce,
            token_type: TOKEN_ALEO,
        };

        let bond_u64: u64 = MIN_DISPUTE_BOND as u64;
        let (change, transfer_future): (credits.aleo/credits, Future) =
            credits.aleo/transfer_private_to_public(credits_in, self.address, bond_u64);

        return (receipt, change, dispute_resolution_fin(
            transfer_future, market_id, proposed_outcome, self.caller
        ));
    }

    async function dispute_resolution_fin(
        transfer_future: Future,
        market_id: field,
        proposed_outcome: u8,
        disputer: address,
    ) {
        transfer_future.await();

        let market: Market = markets.get(market_id);
        assert(market.status == STATUS_PENDING_RESOLUTION);

        let resolution: MarketResolution = market_resolutions.get(market_id);
        assert(!resolution.finalized);

        let current_height: u64 = block.height as u64;
        assert(current_height <= resolution.challenge_deadline);

        assert(proposed_outcome != resolution.winning_outcome);
        assert(proposed_outcome >= 1u8 && proposed_outcome <= market.num_outcomes);

        let has_dispute: bool = market_disputes.contains(market_id);
        assert(!has_dispute);

        market_disputes.set(market_id, DisputeData {
            market_id: market_id,
            disputer: disputer,
            proposed_outcome: proposed_outcome,
            bond_amount: MIN_DISPUTE_BOND,
            disputed_at: current_height,
        });

        markets.set(market_id, Market {
            id: market.id,
            creator: market.creator,
            resolver: market.resolver,
            question_hash: market.question_hash,
            category: market.category,
            num_outcomes: market.num_outcomes,
            deadline: market.deadline,
            resolution_deadline: market.resolution_deadline,
            status: MARKET_STATUS_CLOSED,
            created_at: market.created_at,
            token_type: market.token_type,
        });

        market_resolutions.remove(market_id);

        let current_held: u128 = program_credits.get_or_use(CREDIT_KEY_ALEO, 0u128);
        program_credits.set(CREDIT_KEY_ALEO, current_held + MIN_DISPUTE_BOND);
    }

    // ========================================================================
    // 10. CLAIM DISPUTE BOND (ALEO)
    // ========================================================================

    async transition claim_dispute_bond(
        private receipt: DisputeBondReceipt,
    ) -> Future {
        assert(receipt.owner == self.caller);
        assert(receipt.token_type == TOKEN_ALEO);

        let claim_key: field = BHP256::hash_to_field(DisputeClaimKey {
            market_id: receipt.market_id,
            claimer: self.caller,
            dispute_nonce: receipt.dispute_nonce,
        });

        let bond_u64: u64 = receipt.bond_amount as u64;
        let transfer_future: Future = credits.aleo/transfer_public(self.caller, bond_u64);

        return claim_dispute_bond_fin(
            transfer_future, claim_key, receipt.market_id,
            receipt.bond_amount, receipt.proposed_outcome
        );
    }

    async function claim_dispute_bond_fin(
        transfer_future: Future,
        claim_key: field,
        market_id: field,
        bond_amount: u128,
        proposed_outcome: u8,
    ) {
        transfer_future.await();

        let market: Market = markets.get(market_id);
        let is_resolved: bool = market.status == MARKET_STATUS_RESOLVED;
        let is_cancelled: bool = market.status == MARKET_STATUS_CANCELLED;
        assert(is_resolved || is_cancelled);

        let resolution_exists: bool = market_resolutions.contains(market_id);
        let outcome_matches: bool = resolution_exists ?
            market_resolutions.get(market_id).winning_outcome == proposed_outcome : false;
        assert(is_cancelled || outcome_matches);

        let already_claimed: bool = share_redeemed.get_or_use(claim_key, false);
        assert(!already_claimed);
        share_redeemed.set(claim_key, true);

        let current_held: u128 = program_credits.get_or_use(CREDIT_KEY_ALEO, 0u128);
        assert(current_held >= bond_amount);
        program_credits.set(CREDIT_KEY_ALEO, current_held - bond_amount);
    }

    // ########################################################################
    //                      REDEMPTION / REFUND (USAD — private outflow)
    // ########################################################################

    // ========================================================================
    // 11. REDEEM SHARES (USAD) — Winning shares → private Token
    // ========================================================================

    async transition redeem_shares_usad(
        private shares: OutcomeShare,
    ) -> (test_usad_stablecoin.aleo/ComplianceRecord, test_usad_stablecoin.aleo/Token, Future) {
        assert(shares.owner == self.caller);
        assert(shares.token_type == TOKEN_USAD);
        assert(shares.quantity > 0u128);

        let claim_key: field = BHP256::hash_to_field(ShareClaimKey {
            market_id: shares.market_id,
            claimer: self.caller,
            share_nonce: shares.share_nonce,
        });

        let (compliance, token_out, transfer_future): (
            test_usad_stablecoin.aleo/ComplianceRecord,
            test_usad_stablecoin.aleo/Token,
            Future
        ) = test_usad_stablecoin.aleo/transfer_public_to_private(self.caller, shares.quantity);

        return (compliance, token_out, redeem_shares_usad_fin(
            transfer_future, claim_key, shares.market_id,
            shares.outcome, shares.quantity
        ));
    }

    async function redeem_shares_usad_fin(
        transfer_future: Future,
        claim_key: field,
        market_id: field,
        outcome: u8,
        quantity: u128,
    ) {
        transfer_future.await();

        let market: Market = markets.get(market_id);
        assert(market.status == MARKET_STATUS_RESOLVED);
        assert(market.token_type == TOKEN_USAD);

        let resolution: MarketResolution = market_resolutions.get(market_id);
        assert(resolution.finalized);
        assert(outcome == resolution.winning_outcome);

        let already_claimed: bool = share_redeemed.get_or_use(claim_key, false);
        assert(!already_claimed);
        share_redeemed.set(claim_key, true);

        let market_held: u128 = market_credits.get_or_use(market_id, 0u128);
        assert(market_held >= quantity);
        market_credits.set(market_id, market_held - quantity);

        let current_held: u128 = program_credits.get_or_use(CREDIT_KEY_USAD, 0u128);
        assert(current_held >= quantity);
        program_credits.set(CREDIT_KEY_USAD, current_held - quantity);
    }

    // ========================================================================
    // 12. CLAIM REFUND (USAD) — Cancelled markets → private Token
    // ========================================================================

    async transition claim_refund_usad(
        private shares: OutcomeShare,
    ) -> (RefundClaim, test_usad_stablecoin.aleo/ComplianceRecord, test_usad_stablecoin.aleo/Token, Future) {
        assert(shares.owner == self.caller);
        assert(shares.token_type == TOKEN_USAD);
        assert(shares.quantity > 0u128);

        let claim_key: field = BHP256::hash_to_field(ShareClaimKey {
            market_id: shares.market_id,
            claimer: self.caller,
            share_nonce: shares.share_nonce,
        });

        let refund: RefundClaim = RefundClaim {
            owner: self.caller,
            market_id: shares.market_id,
            amount: shares.quantity,
            claim_nonce: shares.share_nonce,
            token_type: TOKEN_USAD,
        };

        let (compliance, token_out, transfer_future): (
            test_usad_stablecoin.aleo/ComplianceRecord,
            test_usad_stablecoin.aleo/Token,
            Future
        ) = test_usad_stablecoin.aleo/transfer_public_to_private(self.caller, shares.quantity);

        return (refund, compliance, token_out, claim_refund_usad_fin(
            transfer_future, claim_key, shares.market_id, shares.quantity
        ));
    }

    async function claim_refund_usad_fin(
        transfer_future: Future,
        claim_key: field,
        market_id: field,
        amount: u128,
    ) {
        transfer_future.await();

        let market: Market = markets.get(market_id);
        assert(market.status == MARKET_STATUS_CANCELLED);
        assert(market.token_type == TOKEN_USAD);

        let already_claimed: bool = share_redeemed.get_or_use(claim_key, false);
        assert(!already_claimed);
        share_redeemed.set(claim_key, true);

        let market_held: u128 = market_credits.get_or_use(market_id, 0u128);
        assert(market_held >= amount);
        market_credits.set(market_id, market_held - amount);

        let current_held: u128 = program_credits.get_or_use(CREDIT_KEY_USAD, 0u128);
        assert(current_held >= amount);
        program_credits.set(CREDIT_KEY_USAD, current_held - amount);
    }

    // ========================================================================
    // 13. CLAIM LP REFUND (USAD) — LP on cancelled markets
    // ========================================================================

    async transition claim_lp_refund_usad(
        private lp_token: LPToken,
        private min_tokens_out: u128,
    ) -> (RefundClaim, test_usad_stablecoin.aleo/ComplianceRecord, test_usad_stablecoin.aleo/Token, Future) {
        assert(lp_token.owner == self.caller);
        assert(lp_token.token_type == TOKEN_USAD);
        assert(lp_token.lp_shares > 0u128);
        assert(min_tokens_out > 0u128);

        let claim_key: field = BHP256::hash_to_field(LPClaimKey {
            market_id: lp_token.market_id,
            claimer: self.caller,
            lp_nonce: lp_token.lp_nonce,
        });

        let refund: RefundClaim = RefundClaim {
            owner: self.caller,
            market_id: lp_token.market_id,
            amount: min_tokens_out,
            claim_nonce: lp_token.lp_nonce,
            token_type: TOKEN_USAD,
        };

        // Private outflow — returns Token record to LP provider
        let (compliance, token_out, transfer_future): (
            test_usad_stablecoin.aleo/ComplianceRecord,
            test_usad_stablecoin.aleo/Token,
            Future
        ) = test_usad_stablecoin.aleo/transfer_public_to_private(self.caller, min_tokens_out);

        return (refund, compliance, token_out, claim_lp_refund_usad_fin(
            transfer_future, claim_key, lp_token.market_id,
            lp_token.lp_shares, min_tokens_out
        ));
    }

    async function claim_lp_refund_usad_fin(
        transfer_future: Future,
        claim_key: field,
        market_id: field,
        lp_shares: u128,
        min_tokens_out: u128,
    ) {
        transfer_future.await();

        let market: Market = markets.get(market_id);
        assert(market.status == MARKET_STATUS_CANCELLED);
        assert(market.token_type == TOKEN_USAD);

        let already_claimed: bool = lp_positions.get_or_use(claim_key, false);
        assert(!already_claimed);
        lp_positions.set(claim_key, true);

        let pool: AMMPool = amm_pools.get(market_id);
        let total_reserves: u128 = pool.reserve_1 + pool.reserve_2 + pool.reserve_3 + pool.reserve_4;
        assert(total_reserves > 0u128);
        let tokens_out: u128 = (lp_shares * total_reserves) / pool.total_lp_shares;
        assert(tokens_out >= min_tokens_out);
        assert(min_tokens_out > 0u128);

        let market_held: u128 = market_credits.get_or_use(market_id, 0u128);
        assert(market_held >= min_tokens_out);
        market_credits.set(market_id, market_held - min_tokens_out);

        let current_held: u128 = program_credits.get_or_use(CREDIT_KEY_USAD, 0u128);
        assert(current_held >= min_tokens_out);
        program_credits.set(CREDIT_KEY_USAD, current_held - min_tokens_out);

        amm_pools.set(market_id, AMMPool {
            market_id: market_id,
            reserve_1: pool.reserve_1,
            reserve_2: pool.reserve_2,
            reserve_3: pool.reserve_3,
            reserve_4: pool.reserve_4,
            total_liquidity: pool.total_liquidity - min_tokens_out,
            total_lp_shares: pool.total_lp_shares - lp_shares,
            total_volume: pool.total_volume,
        });
    }

    // ========================================================================
    // 14. WITHDRAW LP FROM RESOLVED MARKET (USAD) — private outflow
    // ========================================================================

    async transition withdraw_lp_resolved_usad(
        private lp_token: LPToken,
        private min_tokens_out: u128,
    ) -> (test_usad_stablecoin.aleo/ComplianceRecord, test_usad_stablecoin.aleo/Token, Future) {
        assert(lp_token.owner == self.caller);
        assert(lp_token.token_type == TOKEN_USAD);
        assert(lp_token.lp_shares > 0u128);
        assert(min_tokens_out > 0u128);

        let claim_key: field = BHP256::hash_to_field(LPClaimKey {
            market_id: lp_token.market_id,
            claimer: self.caller,
            lp_nonce: lp_token.lp_nonce,
        });

        let (compliance, token_out, transfer_future): (
            test_usad_stablecoin.aleo/ComplianceRecord,
            test_usad_stablecoin.aleo/Token,
            Future
        ) = test_usad_stablecoin.aleo/transfer_public_to_private(self.caller, min_tokens_out);

        return (compliance, token_out, withdraw_lp_res_usad_fin(
            transfer_future, claim_key, lp_token.market_id,
            lp_token.lp_shares, min_tokens_out
        ));
    }

    async function withdraw_lp_res_usad_fin(
        transfer_future: Future,
        claim_key: field,
        market_id: field,
        lp_shares: u128,
        min_tokens_out: u128,
    ) {
        transfer_future.await();

        let market: Market = markets.get(market_id);
        assert(market.status == MARKET_STATUS_RESOLVED);
        assert(market.token_type == TOKEN_USAD);

        let resolution: MarketResolution = market_resolutions.get(market_id);
        assert(resolution.finalized);

        let already_claimed: bool = lp_positions.get_or_use(claim_key, false);
        assert(!already_claimed);
        lp_positions.set(claim_key, true);

        let pool: AMMPool = amm_pools.get(market_id);
        let market_held: u128 = market_credits.get_or_use(market_id, 0u128);
        let tokens_out: u128 = (lp_shares * market_held) / pool.total_lp_shares;
        assert(tokens_out >= min_tokens_out);
        assert(tokens_out > 0u128);

        market_credits.set(market_id, market_held - tokens_out);

        let current_held: u128 = program_credits.get_or_use(CREDIT_KEY_USAD, 0u128);
        assert(current_held >= tokens_out);
        program_credits.set(CREDIT_KEY_USAD, current_held - tokens_out);

        amm_pools.set(market_id, AMMPool {
            market_id: market_id,
            reserve_1: pool.reserve_1,
            reserve_2: pool.reserve_2,
            reserve_3: pool.reserve_3,
            reserve_4: pool.reserve_4,
            total_liquidity: pool.total_liquidity,
            total_lp_shares: pool.total_lp_shares - lp_shares,
            total_volume: pool.total_volume,
        });
    }

    // ========================================================================
    // 15. WITHDRAW CREATOR FEES (USAD) — private outflow
    // ========================================================================

    async transition withdraw_fees_usad(
        public market_id: field,
        private expected_amount: u128,
    ) -> (test_usad_stablecoin.aleo/ComplianceRecord, test_usad_stablecoin.aleo/Token, Future) {
        let (compliance, token_out, transfer_future): (
            test_usad_stablecoin.aleo/ComplianceRecord,
            test_usad_stablecoin.aleo/Token,
            Future
        ) = test_usad_stablecoin.aleo/transfer_public_to_private(self.caller, expected_amount);

        return (compliance, token_out, withdraw_fees_usad_fin(
            transfer_future, market_id, self.caller, expected_amount
        ));
    }

    async function withdraw_fees_usad_fin(
        transfer_future: Future,
        market_id: field,
        caller: address,
        expected_amount: u128,
    ) {
        transfer_future.await();

        let market: Market = markets.get(market_id);
        assert(market.creator == caller);
        assert(market.status == MARKET_STATUS_RESOLVED);
        assert(market.token_type == TOKEN_USAD);

        let resolution: MarketResolution = market_resolutions.get(market_id);
        assert(resolution.finalized);

        let already_claimed: bool = creator_fees_claimed.get_or_use(market_id, false);
        assert(!already_claimed);
        creator_fees_claimed.set(market_id, true);

        let fees: MarketFees = market_fees.get(market_id);
        assert(fees.creator_fees >= expected_amount);

        let market_held: u128 = market_credits.get_or_use(market_id, 0u128);
        assert(market_held >= expected_amount);
        market_credits.set(market_id, market_held - expected_amount);

        let current_held: u128 = program_credits.get_or_use(CREDIT_KEY_USAD, 0u128);
        assert(current_held >= expected_amount);
        program_credits.set(CREDIT_KEY_USAD, current_held - expected_amount);
    }

    // ########################################################################
    //                      MULTISIG GOVERNANCE
    // ########################################################################

    // ========================================================================
    // 16. INIT MULTISIG (deployer only, one-time)
    // ========================================================================

    async transition init_multisig(
        public signer_1: address,
        public signer_2: address,
        public signer_3: address,
        public threshold: u8,
    ) -> Future {
        assert(self.caller == DEPLOYER);
        return init_multisig_fin(signer_1, signer_2, signer_3, threshold);
    }

    async function init_multisig_fin(
        signer_1: address,
        signer_2: address,
        signer_3: address,
        threshold: u8,
    ) {
        let already_exists: bool = multisig_config.contains(MULTISIG_CONFIG_KEY);
        assert(!already_exists);

        assert(threshold >= 2u8 && threshold <= 3u8);
        assert(signer_1 != signer_2 && signer_1 != signer_3 && signer_2 != signer_3);

        multisig_config.set(MULTISIG_CONFIG_KEY, SignerConfig {
            signer_1: signer_1,
            signer_2: signer_2,
            signer_3: signer_3,
            threshold: threshold,
        });
    }

    // ========================================================================
    // 17. PROPOSE TREASURY WITHDRAWAL
    // ========================================================================

    async transition propose_treasury_withdrawal(
        public amount: u128,
        public recipient: address,
        public token_type: u8,
        public nonce: u64,
    ) -> (field, Future) {
        let proposal_id: field = BHP256::hash_to_field(ProposalSeed {
            proposer: self.caller,
            action: ACTION_WITHDRAW,
            amount: amount,
            recipient: recipient,
            token_type: token_type,
            nonce: nonce,
        });

        return (proposal_id, propose_treasury_fin(
            proposal_id, self.caller, amount, recipient, token_type
        ));
    }

    async function propose_treasury_fin(
        proposal_id: field,
        proposer: address,
        amount: u128,
        recipient: address,
        token_type: u8,
    ) {
        let config: SignerConfig = multisig_config.get(MULTISIG_CONFIG_KEY);
        let is_signer: bool = proposer == config.signer_1
            || proposer == config.signer_2
            || proposer == config.signer_3;
        assert(is_signer);

        let proposal_exists: bool = multisig_proposals.contains(proposal_id);
        assert(!proposal_exists);

        let treasury_key: u8 = token_type == TOKEN_USAD ? CREDIT_KEY_USAD : CREDIT_KEY_ALEO;
        let treasury_balance: u128 = protocol_treasury.get_or_use(treasury_key, 0u128);
        assert(treasury_balance >= amount);

        let current_height: u64 = block.height as u64;
        multisig_proposals.set(proposal_id, MultiSigProposal {
            proposal_id: proposal_id,
            action: ACTION_WITHDRAW,
            amount: amount,
            recipient: recipient,
            token_type: token_type,
            proposed_at: current_height,
        });

        let approval_key: field = BHP256::hash_to_field(ApprovalKey {
            proposal_id: proposal_id,
            signer: proposer,
        });
        multisig_approvals.set(approval_key, true);
    }

    // ========================================================================
    // 18. APPROVE PROPOSAL
    // ========================================================================

    async transition approve_proposal(
        public proposal_id: field,
    ) -> Future {
        return approve_proposal_fin(proposal_id, self.caller);
    }

    async function approve_proposal_fin(
        proposal_id: field,
        signer: address,
    ) {
        let config: SignerConfig = multisig_config.get(MULTISIG_CONFIG_KEY);
        let is_signer: bool = signer == config.signer_1
            || signer == config.signer_2
            || signer == config.signer_3;
        assert(is_signer);

        let proposal: MultiSigProposal = multisig_proposals.get(proposal_id);

        let approval_key: field = BHP256::hash_to_field(ApprovalKey {
            proposal_id: proposal_id,
            signer: signer,
        });

        let already_approved: bool = multisig_approvals.get_or_use(approval_key, false);
        assert(!already_approved);

        multisig_approvals.set(approval_key, true);
    }

    // ========================================================================
    // 19. EXECUTE PROPOSAL (USAD treasury withdrawal)
    // ========================================================================

    async transition exec_proposal_usad(
        public proposal_id: field,
        public amount: u128,
        public recipient: address,
    ) -> Future {
        let transfer_future: Future = test_usad_stablecoin.aleo/transfer_public(
            recipient, amount
        );

        return exec_proposal_usad_fin(
            transfer_future, proposal_id, amount, recipient
        );
    }

    async function exec_proposal_usad_fin(
        transfer_future: Future,
        proposal_id: field,
        amount: u128,
        recipient: address,
    ) {
        transfer_future.await();

        let config: SignerConfig = multisig_config.get(MULTISIG_CONFIG_KEY);
        let proposal: MultiSigProposal = multisig_proposals.get(proposal_id);

        assert(proposal.token_type == TOKEN_USAD);
        assert(proposal.amount == amount);
        assert(proposal.recipient == recipient);

        // Count approvals
        let key_1: field = BHP256::hash_to_field(ApprovalKey { proposal_id: proposal_id, signer: config.signer_1 });
        let key_2: field = BHP256::hash_to_field(ApprovalKey { proposal_id: proposal_id, signer: config.signer_2 });
        let key_3: field = BHP256::hash_to_field(ApprovalKey { proposal_id: proposal_id, signer: config.signer_3 });

        let a1: u8 = multisig_approvals.get_or_use(key_1, false) ? 1u8 : 0u8;
        let a2: u8 = multisig_approvals.get_or_use(key_2, false) ? 1u8 : 0u8;
        let a3: u8 = multisig_approvals.get_or_use(key_3, false) ? 1u8 : 0u8;
        let total_approvals: u8 = a1 + a2 + a3;
        assert(total_approvals >= config.threshold);

        // Deduct from treasury
        let treasury_balance: u128 = protocol_treasury.get_or_use(CREDIT_KEY_USAD, 0u128);
        assert(treasury_balance >= amount);
        protocol_treasury.set(CREDIT_KEY_USAD, treasury_balance - amount);

        let current_held: u128 = program_credits.get_or_use(CREDIT_KEY_USAD, 0u128);
        assert(current_held >= amount);
        program_credits.set(CREDIT_KEY_USAD, current_held - amount);

        // Cleanup
        multisig_proposals.remove(proposal_id);
        multisig_approvals.remove(key_1);
        multisig_approvals.remove(key_2);
        multisig_approvals.remove(key_3);
    }
}
