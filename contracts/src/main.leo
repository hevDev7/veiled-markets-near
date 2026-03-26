// ============================================================================
// VEILED MARKETS v32 - Privacy-Preserving Prediction Market Protocol
// ============================================================================
// FPMM (Fixed Product Market Maker) with complete-set minting/burning.
// Privacy-first: buy, sell, redeem, refund all use private records.
// ALEO-only contract — USDCX transitions moved to separate contract.
// USAD supported via separate veiled_markets_usad program.
// Dispute bond always in ALEO.
//
// v32 changes from v31:
// - REMOVED: All USDCX transitions (create_market_usdcx, buy_shares_usdcx,
//   sell_shares_usdcx, add_liquidity_usdcx, withdraw_lp_resolved_usdcx,
//   redeem_shares_usdcx, claim_refund_usdcx, claim_lp_refund_usdcx,
//   withdraw_fees_usdcx, exec_proposal_usdcx)
// - REMOVED: test_usdcx_stablecoin.aleo import dependency
// - This is now an ALEO-only contract; USDCX is handled separately
//
// v25 changes (historical):
// - set_resolver_status — on-chain resolver whitelist (deployer managed)
// - claim_resolver_fee — resolver claims fee after market finalization
// - resolver_rewards mapping — tracks fees owed to resolvers
// - finalize_resolution allocates resolver fee from protocol_fees
// ============================================================================

import credits.aleo;
// USDCX is now handled by a separate contract (removed in v32).
// USAD is handled by a separate program: veiled_markets_usad_v12.aleo

program veiled_markets_v35.aleo {

    // ========================================================================
    // CONSTANTS
    // ========================================================================

    const MARKET_STATUS_ACTIVE: u8 = 1u8;
    const MARKET_STATUS_CLOSED: u8 = 2u8;
    const MARKET_STATUS_RESOLVED: u8 = 3u8;
    const MARKET_STATUS_CANCELLED: u8 = 4u8;
    const STATUS_PENDING_RESOLUTION: u8 = 5u8;
    const STATUS_PENDING_FINALIZATION: u8 = 6u8;  // v34: votes tallied, dispute window open
    const STATUS_DISPUTED: u8 = 7u8;               // v34: dispute filed, awaiting re-vote or governance

    const OUTCOME_1: u8 = 1u8;
    const OUTCOME_2: u8 = 2u8;
    const OUTCOME_3: u8 = 3u8;
    const OUTCOME_4: u8 = 4u8;

    const TOKEN_ALEO: u8 = 1u8;
    const TOKEN_USDCX: u8 = 2u8;  // Kept for shared structs; USDCX transitions now in separate contract
    const TOKEN_USAD: u8 = 3u8;

    // Fee configuration (basis points: 100 = 1%)
    const PROTOCOL_FEE_BPS: u128 = 50u128;
    const CREATOR_FEE_BPS: u128 = 50u128;
    const LP_FEE_BPS: u128 = 100u128;
    const FEE_DENOMINATOR: u128 = 10000u128;

    // v34: Voter reward — 20% of accumulated protocol_fees split among winning voters
    const VOTER_REWARD_PERCENT: u128 = 20u128;

    const MIN_TRADE_AMOUNT: u128 = 1000u128;
    const MIN_LIQUIDITY: u128 = 10000u128;

    // v34: Multi-Voter Quorum + Dispute resolution system
    const MIN_VOTE_BOND: u128 = 1000000u128;          // 1 ALEO per vote
    const MIN_VOTERS: u8 = 3u8;                        // Minimum 3 voters for valid resolution
    const VOTE_WINDOW_BLOCKS: u64 = 2880u64;           // 12 hours voting window
    const DISPUTE_WINDOW_BLOCKS: u64 = 2880u64;        // 12 hours dispute window after finalize
    const WINNER_CLAIM_PRIORITY_BLOCKS: u64 = 2880u64; // Lock LP/creator withdrawals so winners can redeem first
    const DISPUTE_BOND_MULTIPLIER: u128 = 3u128;       // Dispute bond = 3× total voter bonds

    const MULTISIG_CONFIG_KEY: u8 = 0u8;
    const ACTION_WITHDRAW: u8 = 1u8;
    const DEPLOYER: address = aleo10tm5ektsr5v7kdc5phs8pha42vrkhe2rlxfl2v979wunhzx07vpqnqplv8;

    // v31: Governance program address for cross-program authorization
    // Update this after deploying veiled_governance_v4.aleo
    const GOVERNANCE_PROGRAM: address = aleo10tm5ektsr5v7kdc5phs8pha42vrkhe2rlxfl2v979wunhzx07vpqnqplv8;

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

    // v34: Multi-Voter Quorum — receipt for each voter's bond
    record VoterBondReceipt {
        owner: address,
        market_id: field,
        voted_outcome: u8,
        bond_amount: u128,
        bond_nonce: field,
    }

    // v34: Dispute bond receipt
    record DisputeBondReceipt {
        owner: address,
        market_id: field,
        proposed_outcome: u8,
        bond_amount: u128,
        dispute_nonce: field,
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

    // v34: Multi-Voter Quorum — tracks vote tallies per market
    struct VoteTally {
        market_id: field,
        outcome_1_bonds: u128,
        outcome_2_bonds: u128,
        outcome_3_bonds: u128,
        outcome_4_bonds: u128,
        total_voters: u8,
        total_bonded: u128,
        voting_deadline: u64,
        dispute_deadline: u64,
        finalized: bool,
        winning_outcome: u8,
    }

    struct MarketFees {
        market_id: field,
        protocol_fees: u128,
        creator_fees: u128,
    }

    // v34: Voter/Dispute bond claim key
    struct BondClaimKey {
        market_id: field,
        claimer: address,
        bond_nonce: field,
    }

    // v34: Voter participation key (prevent double voting)
    struct VoterKey {
        market_id: field,
        voter: address,
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

    // DisputeClaimKey removed in v33 — replaced by BondClaimKey above

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
    // MAPPINGS (17 total)
    // ========================================================================

    mapping markets: field => Market;
    mapping amm_pools: field => AMMPool;
    mapping market_fees: field => MarketFees;
    mapping share_redeemed: field => bool;
    mapping creator_fees_claimed: field => bool;
    mapping program_credits: u8 => u128;       // 0u8=ALEO (1u8=USDCX legacy data)
    mapping market_credits: field => u128;
    mapping protocol_treasury: u8 => u128;     // 0u8=ALEO (1u8=USDCX legacy data)
    mapping multisig_config: u8 => SignerConfig;
    mapping multisig_proposals: field => MultiSigProposal;
    mapping multisig_approvals: field => bool;
    mapping lp_positions: field => bool;

    // v34: Multi-Voter Quorum + Dispute resolution system
    mapping vote_tallies: field => VoteTally;              // market_id => vote tally
    mapping voter_participated: field => bool;             // hash(VoterKey) => voted
    mapping bond_claimed: field => bool;                   // hash(BondClaimKey) => claimed
    mapping voter_rewards: address => u128;                // Accumulated voter rewards (microcredits)
    mapping dispute_bonds: field => u128;                  // market_id => dispute bond amount

    // ========================================================================
    // CONSTRUCTOR
    // ========================================================================

    @noupgrade
    async constructor() {
    }

    // ########################################################################
    //                      ALEO MARKET OPERATIONS
    // ########################################################################

    // ========================================================================
    // 1. CREATE MARKET (ALEO)
    // ========================================================================

    async transition create_market(
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
            token_type: TOKEN_ALEO,
        };

        let amount_u64: u64 = initial_liquidity as u64;
        let transfer_future: Future = credits.aleo/transfer_public_as_signer(
            self.address,
            amount_u64
        );

        return (market_id, lp_token, create_market_finalize(
            transfer_future,
            market_id,
            self.caller,
            question_hash,
            category,
            num_outcomes,
            deadline,
            resolution_deadline,
            resolver,
            initial_liquidity,
            TOKEN_ALEO
        ));
    }

    async function create_market_finalize(
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
        token_type: u8,
    ) {
        transfer_future.await();

        let market_exists: bool = markets.contains(market_id);
        assert(!market_exists);

        // v33: No resolver whitelist — anyone can submit outcome via Open Voting + Bond
        // resolver field in Market struct is now advisory (suggested resolver), not enforced

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
            token_type: token_type,
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

        // Credit key: 0u8 for ALEO
        let credit_key: u8 = token_type == TOKEN_ALEO ? 0u8 : 1u8;
        let current_held: u128 = program_credits.get_or_use(credit_key, 0u128);
        program_credits.set(credit_key, current_held + initial_liquidity);
        market_credits.set(market_id, initial_liquidity);
    }

    // ========================================================================
    // 2. BUY SHARES PRIVATE (ALEO) - Primary path with credits record
    // ========================================================================
    // FPMM complete-set minting:
    //   shares_out = (r_i + a) - r_i * prod(r_k/(r_k+a)) for active k!=i
    // Reserve update: r_k += a for all active k, then r_i = r_i_new

    async transition buy_shares_private(
        private market_id: field,
        private outcome: u8,
        private amount_in: u128,
        private expected_shares: u128,
        private min_shares_out: u128,
        private share_nonce: field,
        private credits_in: credits.aleo/credits,
    ) -> (OutcomeShare, credits.aleo/credits, Future) {
        assert(outcome >= OUTCOME_1 && outcome <= OUTCOME_4);
        assert(amount_in >= MIN_TRADE_AMOUNT);

        let share: OutcomeShare = OutcomeShare {
            owner: self.caller,
            market_id: market_id,
            outcome: outcome,
            quantity: expected_shares,
            share_nonce: share_nonce,
            token_type: TOKEN_ALEO,
        };

        let amount_u64: u64 = amount_in as u64;
        let (change, transfer_future): (credits.aleo/credits, Future) = credits.aleo/transfer_private_to_public(
            credits_in,
            self.address,
            amount_u64
        );

        return (share, change, buy_shares_priv_fin(
            transfer_future, market_id, outcome, amount_in,
            expected_shares, min_shares_out, TOKEN_ALEO
        ));
    }

    async function buy_shares_priv_fin(
        transfer_future: Future,
        market_id: field,
        outcome: u8,
        amount_in: u128,
        expected_shares: u128,
        min_shares_out: u128,
        token_type: u8,
    ) {
        transfer_future.await();

        let market: Market = markets.get(market_id);
        assert(market.status == MARKET_STATUS_ACTIVE);
        assert(market.token_type == token_type);
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
        let credit_key: u8 = token_type == TOKEN_ALEO ? 0u8 : 1u8;
        let current_treasury: u128 = protocol_treasury.get_or_use(credit_key, 0u128);
        protocol_treasury.set(credit_key, current_treasury + protocol_fee);

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

        // r_i_new = r_i * prod(r_k / (r_k + a)) for active k != i
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

        // Reserve update: non-target += a, target = r_i_new
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

        let current_held: u128 = program_credits.get_or_use(credit_key, 0u128);
        program_credits.set(credit_key, current_held + amount_in);
        let market_held: u128 = market_credits.get_or_use(market_id, 0u128);
        market_credits.set(market_id, market_held + amount_in);
    }

    // ========================================================================
    // 3. SELL SHARES (ALEO) - tokens_desired approach with actual transfer
    // ========================================================================
    // FPMM complete-set burning:
    //   r_i_new = r_i * prod(r_k / (r_k - pool_out)) for active k != i
    //   shares_needed = r_i_new - r_i + pool_out
    // User specifies tokens_desired (gross). Net after fees transferred.

    async transition sell_shares(
        private shares: OutcomeShare,
        private tokens_desired: u128,
        private max_shares_used: u128,
    ) -> (OutcomeShare, credits.aleo/credits, Future) {
        assert(shares.owner == self.caller);
        assert(shares.token_type == TOKEN_ALEO);
        assert(tokens_desired >= MIN_TRADE_AMOUNT);
        assert(max_shares_used > 0u128);
        assert(max_shares_used <= shares.quantity);

        // Compute fees (constants, no mapping needed)
        let protocol_fee: u128 = (tokens_desired * PROTOCOL_FEE_BPS) / FEE_DENOMINATOR;
        let creator_fee: u128 = (tokens_desired * CREATOR_FEE_BPS) / FEE_DENOMINATOR;
        let lp_fee: u128 = (tokens_desired * LP_FEE_BPS) / FEE_DENOMINATOR;
        let net_tokens: u128 = tokens_desired - protocol_fee - creator_fee - lp_fee;

        // Transfer net tokens to seller as private credits record
        let net_u64: u64 = net_tokens as u64;
        let (payout_record, transfer_future): (credits.aleo/credits, Future) =
            credits.aleo/transfer_public_to_private(self.caller, net_u64);

        let remainder: OutcomeShare = OutcomeShare {
            owner: self.caller,
            market_id: shares.market_id,
            outcome: shares.outcome,
            quantity: shares.quantity - max_shares_used,
            share_nonce: shares.share_nonce,
            token_type: TOKEN_ALEO,
        };

        return (remainder, payout_record, sell_shares_finalize(
            transfer_future, shares.market_id, shares.outcome,
            tokens_desired, max_shares_used, TOKEN_ALEO
        ));
    }

    async function sell_shares_finalize(
        transfer_future: Future,
        market_id: field,
        outcome: u8,
        tokens_desired: u128,
        max_shares_used: u128,
        token_type: u8,
    ) {
        transfer_future.await();

        let market: Market = markets.get(market_id);
        assert(market.status == MARKET_STATUS_ACTIVE);
        assert(market.token_type == token_type);
        assert(outcome >= 1u8 && outcome <= market.num_outcomes);

        let current_height: u64 = block.height as u64;
        assert(current_height <= market.deadline);

        // Recompute fees
        let protocol_fee: u128 = (tokens_desired * PROTOCOL_FEE_BPS) / FEE_DENOMINATOR;
        let creator_fee: u128 = (tokens_desired * CREATOR_FEE_BPS) / FEE_DENOMINATOR;
        let lp_fee: u128 = (tokens_desired * LP_FEE_BPS) / FEE_DENOMINATOR;
        let net_tokens: u128 = tokens_desired - protocol_fee - creator_fee - lp_fee;
        let pool_tokens_out: u128 = tokens_desired - lp_fee;

        // Fee tracking
        let fees: MarketFees = market_fees.get(market_id);
        market_fees.set(market_id, MarketFees {
            market_id: market_id,
            protocol_fees: fees.protocol_fees + protocol_fee,
            creator_fees: fees.creator_fees + creator_fee,
        });
        let credit_key: u8 = token_type == TOKEN_ALEO ? 0u8 : 1u8;
        let current_treasury: u128 = protocol_treasury.get_or_use(credit_key, 0u128);
        protocol_treasury.set(credit_key, current_treasury + protocol_fee);

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

        // Step division: r_i_new = r_i * prod(r_k / (r_k - p)) for active k != i
        // v19 fix: Guard all reserves against underflow before subtraction.
        // Previously only r3/r4 had safe guards; r1/r2 would panic on p > r_k.
        let sub1: u128 = outcome != 1u8 ? p : 0u128;
        assert(r1 >= sub1);  // v19: prevent underflow
        let den1: u128 = r1 - sub1;
        let step0: u128 = r_i;
        let step1: u128 = outcome != 1u8 ? (step0 * r1) / den1 : step0;

        let sub2: u128 = outcome != 2u8 ? p : 0u128;
        assert(r2 >= sub2);  // v19: prevent underflow
        let den2: u128 = r2 - sub2;
        let step2: u128 = outcome != 2u8 ? (step1 * r2) / den2 : step1;

        // For r3/r4: safe denominator when inactive (r=0, sub=0 -> den=0)
        let apply3: bool = outcome != 3u8 && n >= 3u8;
        let sub3: u128 = apply3 ? p : 0u128;
        assert(r3 >= sub3);  // v19: prevent underflow
        let den3_raw: u128 = r3 - sub3;
        let safe_den3: u128 = den3_raw == 0u128 ? 1u128 : den3_raw;
        let step3: u128 = apply3 ? (step2 * r3) / safe_den3 : step2;

        let apply4: bool = outcome != 4u8 && n >= 4u8;
        let sub4: u128 = apply4 ? p : 0u128;
        assert(r4 >= sub4);  // v19: prevent underflow
        let den4_raw: u128 = r4 - sub4;
        let safe_den4: u128 = den4_raw == 0u128 ? 1u128 : den4_raw;
        let step4: u128 = apply4 ? (step3 * r4) / safe_den4 : step3;

        let r_i_new: u128 = step4;
        let shares_needed: u128 = r_i_new - r_i + p;
        assert(shares_needed <= max_shares_used);
        assert(shares_needed > 0u128);

        // Reserve update: non-target -= p, target = r_i_new
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

        let current_held: u128 = program_credits.get_or_use(credit_key, 0u128);
        assert(current_held >= net_tokens);
        program_credits.set(credit_key, current_held - net_tokens);
    }

    // ========================================================================
    // 5. ADD LIQUIDITY (ALEO) - with expected_lp_shares
    // ========================================================================

    async transition add_liquidity(
        private market_id: field,
        private amount: u128,
        private expected_lp_shares: u128,
        private lp_nonce: field,
        private credits_in: credits.aleo/credits,
    ) -> (LPToken, credits.aleo/credits, Future) {
        assert(amount >= MIN_LIQUIDITY);

        let lp_token: LPToken = LPToken {
            owner: self.caller,
            market_id: market_id,
            lp_shares: expected_lp_shares,
            lp_nonce: lp_nonce,
            token_type: TOKEN_ALEO,
        };

        let amount_u64: u64 = amount as u64;
        let (change, transfer_future): (credits.aleo/credits, Future) =
            credits.aleo/transfer_private_to_public(credits_in, self.address, amount_u64);

        return (lp_token, change, add_liq_finalize(
            transfer_future, market_id, amount, expected_lp_shares, TOKEN_ALEO
        ));
    }

    async function add_liq_finalize(
        transfer_future: Future,
        market_id: field,
        amount: u128,
        expected_lp_shares: u128,
        token_type: u8,
    ) {
        transfer_future.await();

        let market: Market = markets.get(market_id);
        assert(market.status == MARKET_STATUS_ACTIVE);
        assert(market.token_type == token_type);

        let current_height: u64 = block.height as u64;
        assert(current_height <= market.deadline);

        let pool: AMMPool = amm_pools.get(market_id);

        // v17 FIX: Use total_reserves for LP share pricing (consistent with withdraw_lp_resolved)
        let total_reserves: u128 = pool.reserve_1 + pool.reserve_2 + pool.reserve_3 + pool.reserve_4;
        assert(total_reserves > 0u128);
        let computed_shares: u128 = (amount * pool.total_lp_shares) / total_reserves;
        assert(computed_shares >= expected_lp_shares);
        assert(expected_lp_shares > 0u128);

        // Add proportionally to all reserves
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

        let credit_key: u8 = token_type == TOKEN_ALEO ? 0u8 : 1u8;
        let current_held: u128 = program_credits.get_or_use(credit_key, 0u128);
        program_credits.set(credit_key, current_held + amount);
        let market_held: u128 = market_credits.get_or_use(market_id, 0u128);
        market_credits.set(market_id, market_held + amount);
    }

    // ========================================================================
    // 6. REMOVE LIQUIDITY — REMOVED in v17 (LP locked until finalize/cancel)
    // ========================================================================
    // LP providers cannot remove liquidity during ACTIVE trading.
    // After market resolves: use withdraw_lp_resolved
    // After market cancels:  use claim_lp_refund

    // ########################################################################
    //                      USAD TOKEN TRANSITIONS
    // ########################################################################
    // NOTE: USAD transitions commented out — snarkVM limits programs to 31
    // transitions. USAD support requires a separate program or the limit
    // must be raised. See: contracts/usad/ (planned separate program).

    /* USAD TRANSITIONS DISABLED (snarkVM 31-transition limit)

    // ========================================================================
    // 33. BUY SHARES (USAD)
    // ========================================================================

    async transition buy_shares_usad(
        private market_id: field,
        private outcome: u8,
        private amount_in: u128,
        private expected_shares: u128,
        private min_shares_out: u128,
        private share_nonce: field,
    ) -> (OutcomeShare, Future) {
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

        let transfer_future: Future = test_usad_stablecoin.aleo/transfer_public_as_signer(
            self.address,
            amount_in
        );

        return (share, buy_shares_usad_fin(
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

        let protocol_fee: u128 = (amount_in * PROTOCOL_FEE_BPS) / FEE_DENOMINATOR;
        let creator_fee: u128 = (amount_in * CREATOR_FEE_BPS) / FEE_DENOMINATOR;
        let amount_to_pool: u128 = amount_in - protocol_fee - creator_fee;

        let fees: MarketFees = market_fees.get(market_id);
        market_fees.set(market_id, MarketFees {
            market_id: market_id,
            protocol_fees: fees.protocol_fees + protocol_fee,
            creator_fees: fees.creator_fees + creator_fee,
        });
        let current_treasury: u128 = protocol_treasury.get_or_use(2u8, 0u128);
        protocol_treasury.set(2u8, current_treasury + protocol_fee);

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

        let current_held: u128 = program_credits.get_or_use(2u8, 0u128);
        program_credits.set(2u8, current_held + amount_in);
        let market_held: u128 = market_credits.get_or_use(market_id, 0u128);
        market_credits.set(market_id, market_held + amount_in);
    }

    // ========================================================================
    // 34. SELL SHARES (USAD)
    // ========================================================================

    async transition sell_shares_usad(
        private shares: OutcomeShare,
        private tokens_desired: u128,
        private max_shares_used: u128,
    ) -> (OutcomeShare, Future) {
        assert(shares.owner == self.caller);
        assert(shares.token_type == TOKEN_USAD);
        assert(tokens_desired >= MIN_TRADE_AMOUNT);
        assert(max_shares_used > 0u128);
        assert(max_shares_used <= shares.quantity);

        let protocol_fee: u128 = (tokens_desired * PROTOCOL_FEE_BPS) / FEE_DENOMINATOR;
        let creator_fee: u128 = (tokens_desired * CREATOR_FEE_BPS) / FEE_DENOMINATOR;
        let lp_fee: u128 = (tokens_desired * LP_FEE_BPS) / FEE_DENOMINATOR;
        let net_tokens: u128 = tokens_desired - protocol_fee - creator_fee - lp_fee;

        let transfer_future: Future = test_usad_stablecoin.aleo/transfer_public(self.caller, net_tokens);

        let remainder: OutcomeShare = OutcomeShare {
            owner: self.caller,
            market_id: shares.market_id,
            outcome: shares.outcome,
            quantity: shares.quantity - max_shares_used,
            share_nonce: shares.share_nonce,
            token_type: TOKEN_USAD,
        };

        return (remainder, sell_shares_usad_fin(
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
        let current_treasury: u128 = protocol_treasury.get_or_use(2u8, 0u128);
        protocol_treasury.set(2u8, current_treasury + protocol_fee);

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

        // v19 fix: Guard all reserves against underflow before subtraction.
        let sub1: u128 = outcome != 1u8 ? p : 0u128;
        assert(r1 >= sub1);  // v19: prevent underflow
        let den1: u128 = r1 - sub1;
        let step0: u128 = r_i;
        let step1: u128 = outcome != 1u8 ? (step0 * r1) / den1 : step0;

        let sub2: u128 = outcome != 2u8 ? p : 0u128;
        assert(r2 >= sub2);  // v19: prevent underflow
        let den2: u128 = r2 - sub2;
        let step2: u128 = outcome != 2u8 ? (step1 * r2) / den2 : step1;

        let apply3: bool = outcome != 3u8 && n >= 3u8;
        let sub3: u128 = apply3 ? p : 0u128;
        assert(r3 >= sub3);  // v19: prevent underflow
        let den3_raw: u128 = r3 - sub3;
        let safe_den3: u128 = den3_raw == 0u128 ? 1u128 : den3_raw;
        let step3: u128 = apply3 ? (step2 * r3) / safe_den3 : step2;

        let apply4: bool = outcome != 4u8 && n >= 4u8;
        let sub4: u128 = apply4 ? p : 0u128;
        assert(r4 >= sub4);  // v19: prevent underflow
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

        let current_held: u128 = program_credits.get_or_use(2u8, 0u128);
        assert(current_held >= net_tokens);
        program_credits.set(2u8, current_held - net_tokens);
    }

    // ========================================================================
    // 35. ADD LIQUIDITY (USAD)
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

        let transfer_future: Future = test_usad_stablecoin.aleo/transfer_public_as_signer(
            self.address,
            amount
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

        let current_held: u128 = program_credits.get_or_use(2u8, 0u128);
        program_credits.set(2u8, current_held + amount);
        let market_held: u128 = market_credits.get_or_use(market_id, 0u128);
        market_credits.set(market_id, market_held + amount);
    }

    END USAD TRANSITIONS (buy/sell/add_liq) */

    // ########################################################################
    //                      SHARED MARKET LIFECYCLE
    // ########################################################################

    // ========================================================================
    // 12. CLOSE MARKET
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

    // ########################################################################
    //                      MULTI-VOTER QUORUM + DISPUTE RESOLUTION (v34)
    // ########################################################################
    // Minimum 3 independent voters required. Each voter bonds 1 ALEO.
    // After voting window + quorum: finalize tallies votes.
    // Dispute window: anyone can dispute with 3× total bonds.
    // Winners get bond back + share of loser bonds. Losers slashed.
    // Bond is always in ALEO regardless of market token type.

    // ========================================================================
    // 13. VOTE OUTCOME — Anyone votes with 1 ALEO bond
    // ========================================================================

    async transition vote_outcome(
        private market_id: field,
        private outcome: u8,
        private bond_nonce: field,
        private credits_in: credits.aleo/credits,
    ) -> (VoterBondReceipt, credits.aleo/credits, Future) {
        let receipt: VoterBondReceipt = VoterBondReceipt {
            owner: self.caller,
            market_id: market_id,
            voted_outcome: outcome,
            bond_amount: MIN_VOTE_BOND,
            bond_nonce: bond_nonce,
        };

        let bond_u64: u64 = MIN_VOTE_BOND as u64;
        let (change, transfer_future): (credits.aleo/credits, Future) =
            credits.aleo/transfer_private_to_public(credits_in, self.address, bond_u64);

        return (receipt, change, vote_outcome_fin(
            transfer_future, market_id, outcome, self.caller
        ));
    }

    async function vote_outcome_fin(
        transfer_future: Future,
        market_id: field,
        outcome: u8,
        voter: address,
    ) {
        transfer_future.await();

        let market: Market = markets.get(market_id);
        assert(outcome >= 1u8 && outcome <= market.num_outcomes);

        let current_height: u64 = block.height as u64;

        // Market must be CLOSED or ACTIVE past deadline
        let is_closed: bool = market.status == MARKET_STATUS_CLOSED;
        let is_pending: bool = market.status == STATUS_PENDING_RESOLUTION;
        let is_past_deadline: bool = market.status == MARKET_STATUS_ACTIVE && current_height > market.deadline;
        assert(is_closed || is_pending || is_past_deadline);
        assert(current_height <= market.resolution_deadline);

        // Prevent double voting
        let voter_key: field = BHP256::hash_to_field(VoterKey { market_id: market_id, voter: voter });
        let already_voted: bool = voter_participated.get_or_use(voter_key, false);
        assert(!already_voted);
        voter_participated.set(voter_key, true);

        // Get or create tally using get_or_use with default empty tally
        // CRITICAL: Leo does NOT short-circuit ternary — get() on missing key panics!
        // Must use get_or_use to safely handle first vote (no tally exists yet)
        let default_tally: VoteTally = VoteTally {
            market_id: market_id,
            outcome_1_bonds: 0u128,
            outcome_2_bonds: 0u128,
            outcome_3_bonds: 0u128,
            outcome_4_bonds: 0u128,
            total_voters: 0u8,
            total_bonded: 0u128,
            voting_deadline: 0u64,
            dispute_deadline: 0u64,
            finalized: false,
            winning_outcome: 0u8,
        };
        let has_tally: bool = vote_tallies.contains(market_id);
        let tally: VoteTally = vote_tallies.get_or_use(market_id, default_tally);

        let prev_o1: u128 = tally.outcome_1_bonds;
        let prev_o2: u128 = tally.outcome_2_bonds;
        let prev_o3: u128 = tally.outcome_3_bonds;
        let prev_o4: u128 = tally.outcome_4_bonds;
        let prev_voters: u8 = tally.total_voters;
        let prev_bonded: u128 = tally.total_bonded;

        // If first vote, set voting deadline; otherwise use existing
        let voting_deadline: u64 = has_tally ? tally.voting_deadline : (current_height + VOTE_WINDOW_BLOCKS);

        // If tally exists, must be within voting window
        assert(!has_tally || current_height <= voting_deadline);

        // Add bond to voted outcome
        let new_o1: u128 = outcome == 1u8 ? prev_o1 + MIN_VOTE_BOND : prev_o1;
        let new_o2: u128 = outcome == 2u8 ? prev_o2 + MIN_VOTE_BOND : prev_o2;
        let new_o3: u128 = outcome == 3u8 ? prev_o3 + MIN_VOTE_BOND : prev_o3;
        let new_o4: u128 = outcome == 4u8 ? prev_o4 + MIN_VOTE_BOND : prev_o4;

        vote_tallies.set(market_id, VoteTally {
            market_id: market_id,
            outcome_1_bonds: new_o1,
            outcome_2_bonds: new_o2,
            outcome_3_bonds: new_o3,
            outcome_4_bonds: new_o4,
            total_voters: prev_voters + 1u8,
            total_bonded: prev_bonded + MIN_VOTE_BOND,
            voting_deadline: voting_deadline,
            dispute_deadline: 0u64,
            finalized: false,
            winning_outcome: 0u8,
        });

        // Set market to PENDING if not already
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

        // Track bond in ALEO credits
        let current_held: u128 = program_credits.get_or_use(0u8, 0u128);
        program_credits.set(0u8, current_held + MIN_VOTE_BOND);
    }

    // ========================================================================
    // 14. FINALIZE VOTES — Tally votes, determine winner, start dispute window
    // ========================================================================

    async transition finalize_votes(public market_id: field) -> Future {
        return finalize_votes_fin(market_id);
    }

    async function finalize_votes_fin(market_id: field) {
        let market: Market = markets.get(market_id);
        assert(market.status == STATUS_PENDING_RESOLUTION);

        let tally: VoteTally = vote_tallies.get(market_id);
        assert(!tally.finalized);

        let current_height: u64 = block.height as u64;

        // Voting window must have passed
        assert(current_height > tally.voting_deadline);

        // Minimum 3 voters required
        assert(tally.total_voters >= MIN_VOTERS);

        // Determine winning outcome (highest total bonds)
        let max_bonds: u128 = tally.outcome_1_bonds;
        let winner: u8 = 1u8;
        let is_o2_higher: bool = tally.outcome_2_bonds > max_bonds;
        let max2: u128 = is_o2_higher ? tally.outcome_2_bonds : max_bonds;
        let winner2: u8 = is_o2_higher ? 2u8 : winner;
        let is_o3_higher: bool = tally.outcome_3_bonds > max2;
        let max3: u128 = is_o3_higher ? tally.outcome_3_bonds : max2;
        let winner3: u8 = is_o3_higher ? 3u8 : winner2;
        let is_o4_higher: bool = tally.outcome_4_bonds > max3;
        let winning_outcome: u8 = is_o4_higher ? 4u8 : winner3;

        // Set dispute window
        let dispute_deadline: u64 = current_height + DISPUTE_WINDOW_BLOCKS;

        vote_tallies.set(market_id, VoteTally {
            market_id: market_id,
            outcome_1_bonds: tally.outcome_1_bonds,
            outcome_2_bonds: tally.outcome_2_bonds,
            outcome_3_bonds: tally.outcome_3_bonds,
            outcome_4_bonds: tally.outcome_4_bonds,
            total_voters: tally.total_voters,
            total_bonded: tally.total_bonded,
            voting_deadline: tally.voting_deadline,
            dispute_deadline: dispute_deadline,
            finalized: false,
            winning_outcome: winning_outcome,
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
            status: STATUS_PENDING_FINALIZATION,
            created_at: market.created_at,
            token_type: market.token_type,
        });
    }

    // ========================================================================
    // 15. CONFIRM RESOLUTION — No dispute filed, finalize market
    // ========================================================================

    async transition confirm_resolution(public market_id: field) -> Future {
        return confirm_resolution_fin(market_id);
    }

    async function confirm_resolution_fin(market_id: field) {
        let market: Market = markets.get(market_id);
        assert(market.status == STATUS_PENDING_FINALIZATION);

        let tally: VoteTally = vote_tallies.get(market_id);
        assert(tally.winning_outcome >= 1u8);

        let current_height: u64 = block.height as u64;
        assert(current_height > tally.dispute_deadline);

        // No dispute was filed — confirm resolution
        let has_dispute: bool = dispute_bonds.contains(market_id);
        assert(!has_dispute);

        // Allocate voter reward: 20% of protocol fees split among winning voters
        let fees: MarketFees = market_fees.get(market_id);
        let total_reward: u128 = (fees.protocol_fees * VOTER_REWARD_PERCENT) / 100u128;

        // Store total reward for later distribution (winning voters claim individually)
        // Reward stored in voter_rewards mapping keyed by market resolver (first winning voter)
        let current_reward: u128 = voter_rewards.get_or_use(market.resolver, 0u128);
        voter_rewards.set(market.resolver, current_reward + total_reward);

        // Mark as finalized
        vote_tallies.set(market_id, VoteTally {
            market_id: market_id,
            outcome_1_bonds: tally.outcome_1_bonds,
            outcome_2_bonds: tally.outcome_2_bonds,
            outcome_3_bonds: tally.outcome_3_bonds,
            outcome_4_bonds: tally.outcome_4_bonds,
            total_voters: tally.total_voters,
            total_bonded: tally.total_bonded,
            voting_deadline: tally.voting_deadline,
            dispute_deadline: tally.dispute_deadline,
            finalized: true,
            winning_outcome: tally.winning_outcome,
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
    // 16. DISPUTE RESOLUTION — Challenge voter majority with 3× bond
    // ========================================================================

    async transition dispute_resolution(
        private market_id: field,
        private proposed_outcome: u8,
        private dispute_nonce: field,
        private credits_in: credits.aleo/credits,
        private dispute_bond: u128,
    ) -> (DisputeBondReceipt, credits.aleo/credits, Future) {
        assert(dispute_bond >= MIN_VOTE_BOND);

        let receipt: DisputeBondReceipt = DisputeBondReceipt {
            owner: self.caller,
            market_id: market_id,
            proposed_outcome: proposed_outcome,
            bond_amount: dispute_bond,
            dispute_nonce: dispute_nonce,
        };

        let bond_u64: u64 = dispute_bond as u64;
        let (change, transfer_future): (credits.aleo/credits, Future) =
            credits.aleo/transfer_private_to_public(credits_in, self.address, bond_u64);

        return (receipt, change, dispute_resolution_fin(
            transfer_future, market_id, proposed_outcome, dispute_bond, self.caller
        ));
    }

    async function dispute_resolution_fin(
        transfer_future: Future,
        market_id: field,
        proposed_outcome: u8,
        dispute_bond: u128,
        disputer: address,
    ) {
        transfer_future.await();

        let market: Market = markets.get(market_id);
        assert(market.status == STATUS_PENDING_FINALIZATION);

        let tally: VoteTally = vote_tallies.get(market_id);
        assert(tally.winning_outcome >= 1u8);

        let current_height: u64 = block.height as u64;
        assert(current_height <= tally.dispute_deadline);

        // Must propose a DIFFERENT outcome than the voted winner
        assert(proposed_outcome != tally.winning_outcome);
        assert(proposed_outcome >= 1u8 && proposed_outcome <= market.num_outcomes);

        // Dispute bond must be >= 3× total voter bonds
        let min_dispute: u128 = tally.total_bonded * DISPUTE_BOND_MULTIPLIER;
        assert(dispute_bond >= min_dispute);

        // Only one dispute per market
        let has_dispute: bool = dispute_bonds.contains(market_id);
        assert(!has_dispute);
        dispute_bonds.set(market_id, dispute_bond);

        // Override winning outcome to disputer's proposal
        vote_tallies.set(market_id, VoteTally {
            market_id: market_id,
            outcome_1_bonds: tally.outcome_1_bonds,
            outcome_2_bonds: tally.outcome_2_bonds,
            outcome_3_bonds: tally.outcome_3_bonds,
            outcome_4_bonds: tally.outcome_4_bonds,
            total_voters: tally.total_voters,
            total_bonded: tally.total_bonded,
            voting_deadline: tally.voting_deadline,
            dispute_deadline: tally.dispute_deadline,
            finalized: true,
            winning_outcome: proposed_outcome,  // Disputer's outcome wins
        });

        // Market resolved with disputer's outcome
        markets.set(market_id, Market {
            id: market.id,
            creator: market.creator,
            resolver: disputer,
            question_hash: market.question_hash,
            category: market.category,
            num_outcomes: market.num_outcomes,
            deadline: market.deadline,
            resolution_deadline: market.resolution_deadline,
            status: MARKET_STATUS_RESOLVED,
            created_at: market.created_at,
            token_type: market.token_type,
        });

        // Track dispute bond
        let current_held: u128 = program_credits.get_or_use(0u8, 0u128);
        program_credits.set(0u8, current_held + dispute_bond);
    }

    // ========================================================================
    // 15. CANCEL MARKET (combined: creator cancel + emergency cancel)
    // ========================================================================
    // Two paths:
    //   A) Creator cancel: caller is creator, market ACTIVE, zero volume
    //   B) Emergency cancel: anyone, past resolution_deadline, not resolved/cancelled

    async transition cancel_market(public market_id: field) -> Future {
        return cancel_market_finalize(market_id, self.caller);
    }

    async function cancel_market_finalize(market_id: field, caller: address) {
        let market: Market = markets.get(market_id);
        let current_height: u64 = block.height as u64;

        // Path A: Creator cancel — active market with no volume
        let is_creator_cancel: bool = market.creator == caller
            && market.status == MARKET_STATUS_ACTIVE;

        // Path B: Emergency cancel — anyone, past resolution_deadline
        // Excludes only RESOLVED and CANCELLED
        // v35: Allow emergency cancel on PENDING_RESOLUTION (< MIN_VOTERS, stuck market)
        let is_emergency: bool = current_height > market.resolution_deadline
            && market.status != MARKET_STATUS_RESOLVED
            && market.status != MARKET_STATUS_CANCELLED;

        assert(is_creator_cancel || is_emergency);

        // Creator cancel requires zero volume
        let pool: AMMPool = amm_pools.get(market_id);
        assert(!is_creator_cancel || pool.total_volume == 0u128);

        // v34: Clean up vote data. Bond holders can still claim via
        // claim_voter_bond which accepts CANCELLED status.
        vote_tallies.remove(market_id);

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

    // ========================================================================
    // 17. CLAIM VOTER BOND — Winners claim bond back (v34)
    // ========================================================================
    // If RESOLVED and voted_outcome == winning → bond back
    // If RESOLVED and voted_outcome != winning → nothing (slashed)
    // If CANCELLED → everyone gets bond back

    async transition claim_voter_bond(
        private receipt: VoterBondReceipt,
    ) -> (credits.aleo/credits, Future) {
        assert(receipt.owner == self.caller);
        assert(receipt.bond_amount > 0u128);

        let claim_key: field = BHP256::hash_to_field(BondClaimKey {
            market_id: receipt.market_id,
            claimer: self.caller,
            bond_nonce: receipt.bond_nonce,
        });

        let bond_u64: u64 = receipt.bond_amount as u64;
        let (payout, transfer_future): (credits.aleo/credits, Future) =
            credits.aleo/transfer_public_to_private(self.caller, bond_u64);

        return (payout, claim_voter_bond_fin(
            transfer_future, claim_key, receipt.market_id,
            receipt.bond_amount, receipt.voted_outcome
        ));
    }

    async function claim_voter_bond_fin(
        transfer_future: Future,
        claim_key: field,
        market_id: field,
        bond_amount: u128,
        voted_outcome: u8,
    ) {
        transfer_future.await();

        let market: Market = markets.get(market_id);
        let is_resolved: bool = market.status == MARKET_STATUS_RESOLVED;
        let is_cancelled: bool = market.status == MARKET_STATUS_CANCELLED;
        assert(is_resolved || is_cancelled);

        // If resolved: only winning voters can claim bond back
        // If cancelled: everyone gets bond back
        let tally_exists: bool = vote_tallies.contains(market_id);
        let outcome_matches: bool = tally_exists ?
            vote_tallies.get(market_id).winning_outcome == voted_outcome : false;
        assert(is_cancelled || outcome_matches);

        // Prevent double claim
        let already_claimed: bool = bond_claimed.get_or_use(claim_key, false);
        assert(!already_claimed);
        bond_claimed.set(claim_key, true);

        let current_held: u128 = program_credits.get_or_use(0u8, 0u128);
        assert(current_held >= bond_amount);
        program_credits.set(0u8, current_held - bond_amount);
    }

    // ========================================================================
    // 18. CLAIM DISPUTE BOND — Disputer claims bond after resolution (v34)
    // ========================================================================

    async transition claim_dispute_bond(
        private receipt: DisputeBondReceipt,
    ) -> (credits.aleo/credits, Future) {
        assert(receipt.owner == self.caller);
        assert(receipt.bond_amount > 0u128);

        let claim_key: field = BHP256::hash_to_field(BondClaimKey {
            market_id: receipt.market_id,
            claimer: self.caller,
            bond_nonce: receipt.dispute_nonce,
        });

        let bond_u64: u64 = receipt.bond_amount as u64;
        let (payout, transfer_future): (credits.aleo/credits, Future) =
            credits.aleo/transfer_public_to_private(self.caller, bond_u64);

        return (payout, claim_dispute_bond_fin(
            transfer_future, claim_key, receipt.market_id,
            receipt.bond_amount, receipt.proposed_outcome
        ));
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

        // Disputer gets bond back if their proposed outcome is the final winner
        let tally_exists: bool = vote_tallies.contains(market_id);
        let outcome_matches: bool = tally_exists ?
            vote_tallies.get(market_id).winning_outcome == proposed_outcome : false;
        assert(is_cancelled || outcome_matches);

        let already_claimed: bool = bond_claimed.get_or_use(claim_key, false);
        assert(!already_claimed);
        bond_claimed.set(claim_key, true);

        let current_held: u128 = program_credits.get_or_use(0u8, 0u128);
        assert(current_held >= bond_amount);
        program_credits.set(0u8, current_held - bond_amount);
    }

    // ########################################################################
    //                      REDEMPTION / REFUND (ALEO)
    // ########################################################################

    // ========================================================================
    // 19. REDEEM SHARES (ALEO) - Winning shares 1:1
    // ========================================================================

    async transition redeem_shares(
        private shares: OutcomeShare,
    ) -> (credits.aleo/credits, Future) {
        assert(shares.owner == self.caller);
        assert(shares.token_type == TOKEN_ALEO);
        assert(shares.quantity > 0u128);

        let claim_key: field = BHP256::hash_to_field(ShareClaimKey {
            market_id: shares.market_id,
            claimer: self.caller,
            share_nonce: shares.share_nonce,
        });

        let payout_u64: u64 = shares.quantity as u64;
        let (payout_record, transfer_future): (credits.aleo/credits, Future) =
            credits.aleo/transfer_public_to_private(self.caller, payout_u64);

        return (payout_record, redeem_shares_finalize(
            transfer_future, claim_key, shares.market_id,
            shares.outcome, shares.quantity, TOKEN_ALEO
        ));
    }

    async function redeem_shares_finalize(
        transfer_future: Future,
        claim_key: field,
        market_id: field,
        outcome: u8,
        quantity: u128,
        token_type: u8,
    ) {
        transfer_future.await();

        let market: Market = markets.get(market_id);
        assert(market.status == MARKET_STATUS_RESOLVED);
        assert(market.token_type == token_type);

        let resolution: VoteTally = vote_tallies.get(market_id);
        assert(resolution.finalized);
        assert(outcome == resolution.winning_outcome);

        let already_claimed: bool = share_redeemed.get_or_use(claim_key, false);
        assert(!already_claimed);
        share_redeemed.set(claim_key, true);

        let credit_key: u8 = token_type == TOKEN_ALEO ? 0u8 : 1u8;
        let market_held: u128 = market_credits.get_or_use(market_id, 0u128);
        assert(market_held >= quantity);
        market_credits.set(market_id, market_held - quantity);

        let current_held: u128 = program_credits.get_or_use(credit_key, 0u128);
        assert(current_held >= quantity);
        program_credits.set(credit_key, current_held - quantity);
    }

    // ========================================================================
    // 20. CLAIM REFUND (ALEO) - Cancelled markets
    // ========================================================================

    async transition claim_refund(
        private shares: OutcomeShare,
    ) -> (RefundClaim, credits.aleo/credits, Future) {
        assert(shares.owner == self.caller);
        assert(shares.token_type == TOKEN_ALEO);
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
            token_type: TOKEN_ALEO,
        };

        let refund_u64: u64 = shares.quantity as u64;
        let (refund_record, transfer_future): (credits.aleo/credits, Future) =
            credits.aleo/transfer_public_to_private(self.caller, refund_u64);

        return (refund, refund_record, claim_refund_finalize(
            transfer_future, claim_key, shares.market_id, shares.quantity, TOKEN_ALEO
        ));
    }

    async function claim_refund_finalize(
        transfer_future: Future,
        claim_key: field,
        market_id: field,
        amount: u128,
        token_type: u8,
    ) {
        transfer_future.await();

        let market: Market = markets.get(market_id);
        assert(market.status == MARKET_STATUS_CANCELLED);
        assert(market.token_type == token_type);

        let already_claimed: bool = share_redeemed.get_or_use(claim_key, false);
        assert(!already_claimed);
        share_redeemed.set(claim_key, true);

        let credit_key: u8 = token_type == TOKEN_ALEO ? 0u8 : 1u8;
        let market_held: u128 = market_credits.get_or_use(market_id, 0u128);
        assert(market_held >= amount);
        market_credits.set(market_id, market_held - amount);

        let current_held: u128 = program_credits.get_or_use(credit_key, 0u128);
        assert(current_held >= amount);
        program_credits.set(credit_key, current_held - amount);
    }

    // ========================================================================
    // 21. CLAIM LP REFUND (ALEO) - LP tokens on cancelled markets
    // ========================================================================

    async transition claim_lp_refund(
        private lp_token: LPToken,
        private min_tokens_out: u128,
    ) -> (RefundClaim, Future) {
        assert(lp_token.owner == self.caller);
        assert(lp_token.token_type == TOKEN_ALEO);
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
            token_type: TOKEN_ALEO,
        };

        let min_u64: u64 = min_tokens_out as u64;
        let transfer_future: Future = credits.aleo/transfer_public(self.caller, min_u64);

        return (refund, claim_lp_refund_finalize(
            transfer_future, claim_key, lp_token.market_id,
            lp_token.lp_shares, min_tokens_out, TOKEN_ALEO
        ));
    }

    async function claim_lp_refund_finalize(
        transfer_future: Future,
        claim_key: field,
        market_id: field,
        lp_shares: u128,
        min_tokens_out: u128,
        token_type: u8,
    ) {
        transfer_future.await();

        let market: Market = markets.get(market_id);
        assert(market.status == MARKET_STATUS_CANCELLED);
        assert(market.token_type == token_type);

        let already_claimed: bool = lp_positions.get_or_use(claim_key, false);
        assert(!already_claimed);
        lp_positions.set(claim_key, true);

        let pool: AMMPool = amm_pools.get(market_id);
        // v17 FIX: Use total_reserves instead of total_liquidity
        let total_reserves: u128 = pool.reserve_1 + pool.reserve_2 + pool.reserve_3 + pool.reserve_4;
        assert(total_reserves > 0u128);
        let tokens_out: u128 = (lp_shares * total_reserves) / pool.total_lp_shares;
        assert(tokens_out >= min_tokens_out);
        assert(min_tokens_out > 0u128);

        let credit_key: u8 = token_type == TOKEN_ALEO ? 0u8 : 1u8;
        // Use min_tokens_out for all accounting (matches actual transfer from transition)
        let market_held: u128 = market_credits.get_or_use(market_id, 0u128);
        assert(market_held >= min_tokens_out);
        market_credits.set(market_id, market_held - min_tokens_out);

        let current_held: u128 = program_credits.get_or_use(credit_key, 0u128);
        assert(current_held >= min_tokens_out);
        program_credits.set(credit_key, current_held - min_tokens_out);

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
    // 22. WITHDRAW LP FROM RESOLVED MARKET (ALEO)
    // ========================================================================
    // LPs can withdraw their proportional share of remaining collateral after
    // a market has been finalized. Uses market_credits (not pool.total_liquidity)
    // because redeem_shares_finalize decrements market_credits but not amm_pools.

    async transition withdraw_lp_resolved(
        private lp_token: LPToken,
        private min_tokens_out: u128,
    ) -> (credits.aleo/credits, Future) {
        assert(lp_token.owner == self.caller);
        assert(lp_token.token_type == TOKEN_ALEO);
        assert(lp_token.lp_shares > 0u128);
        assert(min_tokens_out > 0u128);

        let claim_key: field = BHP256::hash_to_field(LPClaimKey {
            market_id: lp_token.market_id,
            claimer: self.caller,
            lp_nonce: lp_token.lp_nonce,
        });

        let min_u64: u64 = min_tokens_out as u64;
        let (payout_record, transfer_future): (credits.aleo/credits, Future) =
            credits.aleo/transfer_public_to_private(self.caller, min_u64);

        return (payout_record, withdraw_lp_resolved_fin(
            transfer_future, claim_key, lp_token.market_id,
            lp_token.lp_shares, min_tokens_out, TOKEN_ALEO
        ));
    }

    async function withdraw_lp_resolved_fin(
        transfer_future: Future,
        claim_key: field,
        market_id: field,
        lp_shares: u128,
        min_tokens_out: u128,
        token_type: u8,
    ) {
        transfer_future.await();

        let market: Market = markets.get(market_id);
        assert(market.status == MARKET_STATUS_RESOLVED);
        assert(market.token_type == token_type);

        // Ensure resolution is fully finalized (challenge window passed)
        let resolution: VoteTally = vote_tallies.get(market_id);
        assert(resolution.finalized);

        // Winner claims must be prioritized before LP withdrawals.
        let current_height: u64 = block.height as u64;
        let winner_claim_unlock: u64 = resolution.dispute_deadline + WINNER_CLAIM_PRIORITY_BLOCKS;
        assert(current_height > winner_claim_unlock);

        let already_claimed: bool = lp_positions.get_or_use(claim_key, false);
        assert(!already_claimed);
        lp_positions.set(claim_key, true);

        // Compute LP share based on actual remaining market_credits
        // (amm_pools.total_liquidity is NOT updated by redeem_shares, so we
        // use market_credits which reflects real remaining collateral)
        let pool: AMMPool = amm_pools.get(market_id);
        let credit_key: u8 = token_type == TOKEN_ALEO ? 0u8 : 1u8;
        let market_held: u128 = market_credits.get_or_use(market_id, 0u128);
        let tokens_out: u128 = (lp_shares * market_held) / pool.total_lp_shares;
        assert(tokens_out >= min_tokens_out);
        assert(tokens_out > 0u128);

        market_credits.set(market_id, market_held - tokens_out);

        let current_held: u128 = program_credits.get_or_use(credit_key, 0u128);
        assert(current_held >= tokens_out);
        program_credits.set(credit_key, current_held - tokens_out);

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
    // 23. WITHDRAW CREATOR FEES (ALEO)
    // ========================================================================

    async transition withdraw_creator_fees(
        public market_id: field,
        public expected_amount: u128,
    ) -> Future {
        assert(expected_amount > 0u128);

        let amount_u64: u64 = expected_amount as u64;
        let transfer_future: Future = credits.aleo/transfer_public(self.caller, amount_u64);

        return withdraw_fees_finalize(
            transfer_future, market_id, self.caller, expected_amount, TOKEN_ALEO
        );
    }

    async function withdraw_fees_finalize(
        transfer_future: Future,
        market_id: field,
        caller: address,
        expected_amount: u128,
        token_type: u8,
    ) {
        transfer_future.await();

        let market: Market = markets.get(market_id);
        assert(market.status == MARKET_STATUS_RESOLVED);
        assert(market.creator == caller);
        assert(market.token_type == token_type);

        let resolution: VoteTally = vote_tallies.get(market_id);
        assert(resolution.finalized);

        // Winner claims must be prioritized before creator fees are withdrawn.
        let current_height: u64 = block.height as u64;
        let winner_claim_unlock: u64 = resolution.dispute_deadline + WINNER_CLAIM_PRIORITY_BLOCKS;
        assert(current_height > winner_claim_unlock);

        let already_claimed: bool = creator_fees_claimed.get_or_use(market_id, false);
        assert(!already_claimed);
        creator_fees_claimed.set(market_id, true);

        let fees: MarketFees = market_fees.get(market_id);
        assert(fees.creator_fees >= expected_amount);

        let credit_key: u8 = token_type == TOKEN_ALEO ? 0u8 : 1u8;
        let market_held: u128 = market_credits.get_or_use(market_id, 0u128);
        assert(market_held >= expected_amount);
        market_credits.set(market_id, market_held - expected_amount);

        let current_held: u128 = program_credits.get_or_use(credit_key, 0u128);
        assert(current_held >= expected_amount);
        program_credits.set(credit_key, current_held - expected_amount);
    }

    /* USAD REDEMPTION/REFUND DISABLED (snarkVM 31-transition limit)
    // ########################################################################
    //                      REDEMPTION / REFUND (USAD)
    // ########################################################################

    // ========================================================================
    // 36. WITHDRAW LP FROM RESOLVED MARKET (USAD)
    // ========================================================================

    async transition withdraw_lp_res_usad(
        private lp_token: LPToken,
        private min_tokens_out: u128,
    ) -> Future {
        assert(lp_token.owner == self.caller);
        assert(lp_token.token_type == TOKEN_USAD);
        assert(lp_token.lp_shares > 0u128);
        assert(min_tokens_out > 0u128);

        let claim_key: field = BHP256::hash_to_field(LPClaimKey {
            market_id: lp_token.market_id,
            claimer: self.caller,
            lp_nonce: lp_token.lp_nonce,
        });

        let transfer_future: Future = test_usad_stablecoin.aleo/transfer_public(
            self.caller, min_tokens_out
        );

        return withdraw_lp_res_usad_fin(
            transfer_future, claim_key, lp_token.market_id,
            lp_token.lp_shares, min_tokens_out
        );
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

        let resolution: VoteTally = vote_tallies.get(market_id);
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

        let current_held: u128 = program_credits.get_or_use(2u8, 0u128);
        assert(current_held >= tokens_out);
        program_credits.set(2u8, current_held - tokens_out);

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
    // 37. REDEEM SHARES (USAD)
    // ========================================================================

    async transition redeem_shares_usad(
        private shares: OutcomeShare,
    ) -> Future {
        assert(shares.owner == self.caller);
        assert(shares.token_type == TOKEN_USAD);
        assert(shares.quantity > 0u128);

        let claim_key: field = BHP256::hash_to_field(ShareClaimKey {
            market_id: shares.market_id,
            claimer: self.caller,
            share_nonce: shares.share_nonce,
        });

        let transfer_future: Future = test_usad_stablecoin.aleo/transfer_public(
            self.caller, shares.quantity
        );

        return redeem_shares_usad_fin(
            transfer_future, claim_key, shares.market_id,
            shares.outcome, shares.quantity
        );
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

        let resolution: VoteTally = vote_tallies.get(market_id);
        assert(resolution.finalized);
        assert(outcome == resolution.winning_outcome);

        let already_claimed: bool = share_redeemed.get_or_use(claim_key, false);
        assert(!already_claimed);
        share_redeemed.set(claim_key, true);

        let market_held: u128 = market_credits.get_or_use(market_id, 0u128);
        assert(market_held >= quantity);
        market_credits.set(market_id, market_held - quantity);

        let current_held: u128 = program_credits.get_or_use(2u8, 0u128);
        assert(current_held >= quantity);
        program_credits.set(2u8, current_held - quantity);
    }

    // ========================================================================
    // 38. CLAIM REFUND (USAD)
    // ========================================================================

    async transition claim_refund_usad(
        private shares: OutcomeShare,
    ) -> (RefundClaim, Future) {
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

        let transfer_future: Future = test_usad_stablecoin.aleo/transfer_public(
            self.caller, shares.quantity
        );

        return (refund, claim_refund_usad_fin(
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

        let current_held: u128 = program_credits.get_or_use(2u8, 0u128);
        assert(current_held >= amount);
        program_credits.set(2u8, current_held - amount);
    }

    // ========================================================================
    // 39. CLAIM LP REFUND (USAD)
    // ========================================================================

    async transition claim_lp_refund_usad(
        private lp_token: LPToken,
        private min_tokens_out: u128,
    ) -> (RefundClaim, Future) {
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

        let transfer_future: Future = test_usad_stablecoin.aleo/transfer_public(
            self.caller, min_tokens_out
        );

        return (refund, claim_lp_ref_usad_fin(
            transfer_future, claim_key, lp_token.market_id,
            lp_token.lp_shares, min_tokens_out
        ));
    }

    async function claim_lp_ref_usad_fin(
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

        let current_held: u128 = program_credits.get_or_use(2u8, 0u128);
        assert(current_held >= min_tokens_out);
        program_credits.set(2u8, current_held - min_tokens_out);

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
    // 40. WITHDRAW CREATOR FEES (USAD)
    // ========================================================================

    async transition withdraw_fees_usad(
        public market_id: field,
        public expected_amount: u128,
    ) -> Future {
        assert(expected_amount > 0u128);

        let transfer_future: Future = test_usad_stablecoin.aleo/transfer_public(
            self.caller, expected_amount
        );

        return withdraw_fees_usad_fin(
            transfer_future, market_id, self.caller, expected_amount
        );
    }

    async function withdraw_fees_usad_fin(
        transfer_future: Future,
        market_id: field,
        caller: address,
        expected_amount: u128,
    ) {
        transfer_future.await();

        let market: Market = markets.get(market_id);
        assert(market.status == MARKET_STATUS_RESOLVED);
        assert(market.creator == caller);
        assert(market.token_type == TOKEN_USAD);

        let resolution: VoteTally = vote_tallies.get(market_id);
        assert(resolution.finalized);

        let already_claimed: bool = creator_fees_claimed.get_or_use(market_id, false);
        assert(!already_claimed);
        creator_fees_claimed.set(market_id, true);

        let fees: MarketFees = market_fees.get(market_id);
        assert(fees.creator_fees >= expected_amount);

        let market_held: u128 = market_credits.get_or_use(market_id, 0u128);
        assert(market_held >= expected_amount);
        market_credits.set(market_id, market_held - expected_amount);

        let current_held: u128 = program_credits.get_or_use(2u8, 0u128);
        assert(current_held >= expected_amount);
        program_credits.set(2u8, current_held - expected_amount);
    }
    END USAD REDEMPTION/REFUND */

    // ########################################################################
    //                      MULTI-SIG TREASURY WITHDRAWAL
    // ########################################################################

    // ========================================================================
    // 27. INIT MULTISIG
    // ========================================================================

    async transition init_multisig(
        public signer_1: address,
        public signer_2: address,
        public signer_3: address,
        public threshold: u8,
    ) -> Future {
        assert(threshold >= 2u8 && threshold <= 3u8);
        return init_multisig_finalize(signer_1, signer_2, signer_3, threshold, self.caller);
    }

    async function init_multisig_finalize(
        signer_1: address,
        signer_2: address,
        signer_3: address,
        threshold: u8,
        caller: address,
    ) {
        let config_exists: bool = multisig_config.contains(MULTISIG_CONFIG_KEY);
        assert(!config_exists);
        assert(caller == DEPLOYER);
        assert(signer_1 != signer_2);
        assert(signer_1 != signer_3);
        assert(signer_2 != signer_3);

        multisig_config.set(MULTISIG_CONFIG_KEY, SignerConfig {
            signer_1: signer_1,
            signer_2: signer_2,
            signer_3: signer_3,
            threshold: threshold,
        });
    }

    // ========================================================================
    // 28. PROPOSE TREASURY WITHDRAWAL
    // ========================================================================

    async transition propose_treasury_withdrawal(
        public amount: u128,
        public recipient: address,
        public token_type: u8,
        public nonce: u64,
    ) -> (field, Future) {
        assert(amount > 0u128);
        assert(token_type == TOKEN_ALEO);  // v32: ALEO-only (USDCX removed)

        let proposal_id: field = BHP256::hash_to_field(ProposalSeed {
            proposer: self.caller,
            action: ACTION_WITHDRAW,
            amount: amount,
            recipient: recipient,
            token_type: token_type,
            nonce: nonce,
        });

        return (proposal_id, propose_withdrawal_fin(
            proposal_id, amount, recipient, self.caller, token_type
        ));
    }

    async function propose_withdrawal_fin(
        proposal_id: field,
        amount: u128,
        recipient: address,
        proposer: address,
        token_type: u8,
    ) {
        let config: SignerConfig = multisig_config.get(MULTISIG_CONFIG_KEY);
        let is_signer: bool = proposer == config.signer_1 || proposer == config.signer_2 || proposer == config.signer_3;
        assert(is_signer);

        let exists: bool = multisig_proposals.contains(proposal_id);
        assert(!exists);

        let credit_key: u8 = token_type == TOKEN_ALEO ? 0u8 : 1u8;
        let treasury_balance: u128 = protocol_treasury.get_or_use(credit_key, 0u128);
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
    // 29. APPROVE PROPOSAL
    // ========================================================================

    async transition approve_proposal(
        public proposal_id: field,
    ) -> Future {
        return approve_proposal_finalize(proposal_id, self.caller);
    }

    async function approve_proposal_finalize(
        proposal_id: field,
        signer: address,
    ) {
        let config: SignerConfig = multisig_config.get(MULTISIG_CONFIG_KEY);
        let is_signer: bool = signer == config.signer_1 || signer == config.signer_2 || signer == config.signer_3;
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
    // 30. EXECUTE PROPOSAL (ALEO treasury)
    // ========================================================================

    async transition execute_proposal(
        public proposal_id: field,
        public amount: u128,
        public recipient: address,
    ) -> Future {
        let amount_u64: u64 = amount as u64;
        let transfer_future: Future = credits.aleo/transfer_public(recipient, amount_u64);

        return execute_proposal_finalize(
            transfer_future, proposal_id, amount, recipient, 0u8
        );
    }

    async function execute_proposal_finalize(
        transfer_future: Future,
        proposal_id: field,
        amount: u128,
        recipient: address,
        credit_key: u8,
    ) {
        transfer_future.await();

        let config: SignerConfig = multisig_config.get(MULTISIG_CONFIG_KEY);
        let proposal: MultiSigProposal = multisig_proposals.get(proposal_id);

        assert(proposal.amount == amount);
        assert(proposal.recipient == recipient);
        assert(proposal.token_type == TOKEN_ALEO);

        // Count approvals
        let key_1: field = BHP256::hash_to_field(ApprovalKey {
            proposal_id: proposal_id,
            signer: config.signer_1,
        });
        let key_2: field = BHP256::hash_to_field(ApprovalKey {
            proposal_id: proposal_id,
            signer: config.signer_2,
        });
        let key_3: field = BHP256::hash_to_field(ApprovalKey {
            proposal_id: proposal_id,
            signer: config.signer_3,
        });

        let a1: bool = multisig_approvals.get_or_use(key_1, false);
        let a2: bool = multisig_approvals.get_or_use(key_2, false);
        let a3: bool = multisig_approvals.get_or_use(key_3, false);

        let c0: u8 = 0u8;
        let c1: u8 = a1 ? c0 + 1u8 : c0;
        let c2: u8 = a2 ? c1 + 1u8 : c1;
        let count: u8 = a3 ? c2 + 1u8 : c2;
        assert(count >= config.threshold);

        let treasury_balance: u128 = protocol_treasury.get(credit_key);
        assert(treasury_balance >= amount);
        protocol_treasury.set(credit_key, treasury_balance - amount);

        let current_held: u128 = program_credits.get_or_use(credit_key, 0u128);
        assert(current_held >= amount);
        program_credits.set(credit_key, current_held - amount);

        multisig_proposals.remove(proposal_id);
        multisig_approvals.remove(key_1);
        multisig_approvals.remove(key_2);
        multisig_approvals.remove(key_3);
    }

    /* USAD EXEC_PROPOSAL DISABLED (snarkVM 31-transition limit)
    // ========================================================================
    // 41. EXECUTE PROPOSAL (USAD treasury)
    // ========================================================================
    // ... (exec_proposal_usad + exec_proposal_usad_fin)
    END USAD EXEC_PROPOSAL */

    // ########################################################################
    //                      RESOLVER REWARD CLAIM (v33)
    // ########################################################################

    // ========================================================================
    // 28. CLAIM RESOLVER REWARD — Claim accumulated protocol fee rewards
    // ========================================================================
    // Resolvers who successfully finalize markets accumulate rewards from
    // protocol fees (20%). This transition claims those rewards as private ALEO.

    async transition claim_voter_reward(
        public expected_reward: u64,
    ) -> (credits.aleo/credits, Future) {
        assert(expected_reward > 0u64);
        let (payout, transfer_future): (credits.aleo/credits, Future) =
            credits.aleo/transfer_public_to_private(self.caller, expected_reward);

        return (payout, claim_voter_reward_fin(transfer_future, self.caller, expected_reward as u128));
    }

    async function claim_voter_reward_fin(
        transfer_future: Future,
        voter: address,
        expected_reward: u128,
    ) {
        transfer_future.await();

        let reward: u128 = voter_rewards.get_or_use(voter, 0u128);
        assert(reward > 0u128);
        assert(reward == expected_reward);

        voter_rewards.set(voter, 0u128);

        let current_held: u128 = program_credits.get_or_use(0u8, 0u128);
        assert(current_held >= reward);
        program_credits.set(0u8, current_held - reward);
    }
}
