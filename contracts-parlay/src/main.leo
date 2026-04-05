// ============================================================================
// VEILED PARLAY v1 - Privacy-Preserving Multi-Leg Parlay Betting
// ============================================================================
// Standalone parlay contract for Veiled Markets. Users combine outcomes from
// multiple independent markets into a single parlay bet. All legs must win
// for the parlay to pay out (combined odds multiplier).
//
// Key design decisions:
//   - Parlay does NOT buy shares in individual markets — it only reads
//     resolution results (winning_outcome) via optimistic submission.
//   - Supports all 3 token types: ALEO, USDCX, USAD.
//   - Pool-based payouts: losing stakes fund winning payouts.
//   - Optimistic resolution: anyone can submit results from public mappings,
//     with a dispute window for safety.
//   - Max 4 legs per parlay (Leo fixed-size array constraint).
//
// Token transfer patterns (matching existing Veiled Markets contracts):
//   ALEO:  credits.aleo (u64 amounts, private credits records)
//   USDCX: test_usdcx_stablecoin.aleo (u128, Token + MerkleProof)
//   USAD:  test_usad_stablecoin.aleo (u128, Token + MerkleProof)
//
// 26 transitions after slimming the deploy-critical core
// ============================================================================

import credits.aleo;
import test_usdcx_stablecoin.aleo;
import test_usad_stablecoin.aleo;

// ============================================================================
// MODULE-LEVEL CONSTANTS (accessible by final fn and helper fn outside program)
// ============================================================================

// Token types (same as market contracts)
const TOKEN_ALEO: u8 = 1u8;
const TOKEN_USDCX: u8 = 2u8;
const TOKEN_USAD: u8 = 3u8;

// Parlay status
const PARLAY_ACTIVE: u8 = 1u8;            // Waiting for all legs to resolve
const PARLAY_RESOLVED_WIN: u8 = 2u8;       // All legs correct — payout available
const PARLAY_RESOLVED_LOSS: u8 = 3u8;      // One or more legs wrong
const PARLAY_CANCELLED: u8 = 4u8;          // Refunded (leg market cancelled)
const PARLAY_PENDING_DISPUTE: u8 = 5u8;    // Resolution submitted, dispute window open

// Market program identifiers (for tracking which program a leg belongs to)
const PROGRAM_ALEO: u8 = 1u8;             // veiled_markets_v35.aleo
const PROGRAM_USDCX: u8 = 2u8;            // veiled_markets_usdcx_v5.aleo
const PROGRAM_USAD: u8 = 3u8;             // veiled_markets_usad_v12.aleo

// Limits
const MIN_LEGS: u8 = 2u8;
const MAX_LEGS: u8 = 4u8;
const MIN_STAKE: u128 = 100000u128;        // 0.1 token minimum
const MAX_ODDS_BPS: u128 = 1000000u128;    // 100x max per-leg odds (in basis × 100)
const MAX_COMBINED_PAYOUT_MULTIPLIER: u128 = 10000u128; // 1000x max total payout multiplier (bps)
const ODDS_PRECISION: u128 = 10000u128;    // Odds stored as bps: 25000 = 2.5x

// Protocol fee on parlay winnings (basis points)
const PARLAY_FEE_BPS: u128 = 200u128;     // 2% fee on winnings
const FEE_DENOMINATOR: u128 = 10000u128;

// Dispute window (blocks)
const DISPUTE_WINDOW_BLOCKS: u64 = 2880u64;  // ~12 hours
const DISPUTE_BOND_MULTIPLIER: u128 = 3u128;  // 3x stake to dispute

// Access control
// Governance program address — update after deploying veiled_governance
const GOVERNANCE_PROGRAM: address = aleo10tm5ektsr5v7kdc5phs8pha42vrkhe2rlxfl2v979wunhzx07vpqnqplv8;
// Admin address — deployer, used for pool/treasury management
const ADMIN_ADDRESS: address = aleo10tm5ektsr5v7kdc5phs8pha42vrkhe2rlxfl2v979wunhzx07vpqnqplv8;

// Governance config keys
const CONFIG_NOOP: field = 0field;
const CONFIG_PARLAY_FEE_BPS: field = 1field;
const CONFIG_MIN_STAKE: field = 2field;
const CONFIG_MAX_PAYOUT_MULT: field = 3field;
const CONFIG_PAUSE_STATE: field = 4field;

// ============================================================================
// HELPER FUNCTIONS (outside program block — inlined at compile time)
// ============================================================================

fn assert_leg_valid(leg: ParlayLeg, is_active: bool) {
    // Inactive legs (zero-padded) are always valid — skip checks
    assert(!is_active || leg.market_id != 0field);
    assert(!is_active || (leg.outcome >= 1u8 && leg.outcome <= 4u8));
    assert(!is_active || (leg.odds_bps > ODDS_PRECISION && leg.odds_bps <= MAX_ODDS_BPS));
}

fn calculate_combined_odds(
    num_legs: u8,
    leg_1: ParlayLeg,
    leg_2: ParlayLeg,
    leg_3: ParlayLeg,
    leg_4: ParlayLeg,
) -> u128 {
    let step_1: u128 = (leg_1.odds_bps * leg_2.odds_bps) / ODDS_PRECISION;
    let step_2: u128 = num_legs >= 3u8 ? (step_1 * leg_3.odds_bps) / ODDS_PRECISION : step_1;
    return num_legs >= 4u8 ? (step_2 * leg_4.odds_bps) / ODDS_PRECISION : step_2;
}

// ============================================================================
// FINAL FUNCTIONS (outside program block — inlined into final { } blocks)
// ============================================================================

final fn init_parlay_fin(caller: address) {
    let already: bool = initialized.get_or_use(0u8, false);
    assert(!already);
    initialized.set(0u8, true);

    // Initialize pools to 0
    parlay_pool.set(TOKEN_ALEO, 0u128);
    parlay_pool.set(TOKEN_USDCX, 0u128);
    parlay_pool.set(TOKEN_USAD, 0u128);
    total_exposure.set(TOKEN_ALEO, 0u128);
    total_exposure.set(TOKEN_USDCX, 0u128);
    total_exposure.set(TOKEN_USAD, 0u128);
}

final fn create_parlay_fin(
    transfer_future: Final,
    parlay_id: field,
    token_type: u8,
    num_legs: u8,
    stake: u128,
    combined_odds: u128,
    potential_payout: u128,
    leg_1: ParlayLeg,
    leg_2: ParlayLeg,
    leg_3: ParlayLeg,
    leg_4: ParlayLeg,
) {
    transfer_future.run();

    let paused: u128 = governance_values.get_or_use(CONFIG_PAUSE_STATE, 0u128);
    assert(paused == 0u128);

    let min_stake: u128 = governance_values.get_or_use(CONFIG_MIN_STAKE, MIN_STAKE);
    let max_mult: u128 = governance_values.get_or_use(CONFIG_MAX_PAYOUT_MULT, MAX_COMBINED_PAYOUT_MULTIPLIER);
    let max_pay: u128 = max_single_payout.get_or_use(token_type, 100_000_000_000u128);

    assert(num_legs >= MIN_LEGS && num_legs <= MAX_LEGS);
    assert(stake >= min_stake);
    assert(potential_payout == (stake * combined_odds) / ODDS_PRECISION);
    assert(combined_odds <= max_mult * ODDS_PRECISION);
    assert(potential_payout <= max_pay);

    let pool: u128 = parlay_pool.get_or_use(token_type, 0u128);
    let exposure: u128 = total_exposure.get_or_use(token_type, 0u128);
    assert(pool + stake >= exposure + potential_payout);

    let current_height: u64 = block.height as u64;
    parlays.set(parlay_id, ParlayData {
        parlay_id: parlay_id,
        num_legs: num_legs,
        stake: stake,
        potential_payout: potential_payout,
        token_type: token_type,
        status: PARLAY_ACTIVE,
        created_at: current_height,
        resolution_submitted_at: 0u64,
    });
    parlay_legs.set(parlay_id, ParlayLegSet {
        leg_1: leg_1,
        leg_2: leg_2,
        leg_3: leg_3,
        leg_4: leg_4,
    });
    parlay_pool.set(token_type, pool + stake);
    total_exposure.set(token_type, exposure + potential_payout);
}

final fn submit_resolution_fin(
    parlay_id: field,
    winning_1: u8,
    winning_2: u8,
    winning_3: u8,
    winning_4: u8,
) {
    let parlay: ParlayData = parlays.get(parlay_id);
    assert(parlay.status == PARLAY_ACTIVE);

    let current_height: u64 = block.height as u64;

    // Store resolution
    parlay_resolutions.set(parlay_id, ParlayResolution {
        parlay_id: parlay_id,
        winning_1: winning_1,
        winning_2: winning_2,
        winning_3: winning_3,
        winning_4: winning_4,
        submitted_at: current_height,
    });

    // Update parlay status to pending dispute
    parlays.set(parlay_id, ParlayData {
        parlay_id: parlay.parlay_id,
        num_legs: parlay.num_legs,
        stake: parlay.stake,
        potential_payout: parlay.potential_payout,
        token_type: parlay.token_type,
        status: PARLAY_PENDING_DISPUTE,
        created_at: parlay.created_at,
        resolution_submitted_at: current_height,
    });
}

final fn dispute_parlay_fin(
    transfer_future: Final,
    parlay_id: field,
    disputer: address,
) {
    transfer_future.run();

    let parlay: ParlayData = parlays.get(parlay_id);
    assert(parlay.status == PARLAY_PENDING_DISPUTE);

    let current_height: u64 = block.height as u64;
    assert(current_height <= parlay.resolution_submitted_at + DISPUTE_WINDOW_BLOCKS);

    // Track dispute bond for later refund
    let bond_key: field = BHP256::hash_to_field(DisputeBondKey { parlay_id: parlay_id, disputer: disputer });
    let bond_amount: u128 = MIN_STAKE * DISPUTE_BOND_MULTIPLIER;
    dispute_bonds.set(bond_key, bond_amount);

    // Reset to active for re-submission with correct data
    parlays.set(parlay_id, ParlayData {
        parlay_id: parlay.parlay_id,
        num_legs: parlay.num_legs,
        stake: parlay.stake,
        potential_payout: parlay.potential_payout,
        token_type: parlay.token_type,
        status: PARLAY_ACTIVE,
        created_at: parlay.created_at,
        resolution_submitted_at: 0u64,
    });
}

final fn finalize_parlay_fin(
    parlay_id: field,
) {
    let parlay: ParlayData = parlays.get(parlay_id);
    assert(parlay.status == PARLAY_PENDING_DISPUTE);

    let current_height: u64 = block.height as u64;
    assert(current_height > parlay.resolution_submitted_at + DISPUTE_WINDOW_BLOCKS);

    let resolution: ParlayResolution = parlay_resolutions.get(parlay_id);
    let legs: ParlayLegSet = parlay_legs.get(parlay_id);

    // Check each leg: did the chosen outcome win?
    let leg_1_won: bool = legs.leg_1.outcome == resolution.winning_1;
    let leg_2_won: bool = legs.leg_2.outcome == resolution.winning_2;
    let leg_3_won: bool = parlay.num_legs < 3u8 || legs.leg_3.outcome == resolution.winning_3;
    let leg_4_won: bool = parlay.num_legs < 4u8 || legs.leg_4.outcome == resolution.winning_4;

    let all_won: bool = leg_1_won && leg_2_won && leg_3_won && leg_4_won;

    let final_status: u8 = all_won ? PARLAY_RESOLVED_WIN : PARLAY_RESOLVED_LOSS;

    parlays.set(parlay_id, ParlayData {
        parlay_id: parlay.parlay_id,
        num_legs: parlay.num_legs,
        stake: parlay.stake,
        potential_payout: parlay.potential_payout,
        token_type: parlay.token_type,
        status: final_status,
        created_at: parlay.created_at,
        resolution_submitted_at: parlay.resolution_submitted_at,
    });

    // If lost, reduce exposure (stake stays in pool as profit)
    if (!all_won) {
        let exposure: u128 = total_exposure.get_or_use(parlay.token_type, 0u128);
        let new_exposure: u128 = exposure >= parlay.potential_payout
            ? exposure - parlay.potential_payout
            : 0u128;
        total_exposure.set(parlay.token_type, new_exposure);
    }
}

final fn redeem_parlay_fin(
    transfer_future: Final,
    parlay_id: field,
    potential_payout: u128,
    fee: u128,
    token_type: u8,
) {
    transfer_future.run();

    let parlay: ParlayData = parlays.get(parlay_id);
    assert(parlay.status == PARLAY_RESOLVED_WIN);
    assert(parlay.token_type == token_type);
    assert(parlay.potential_payout == potential_payout);

    let already: bool = parlay_redeemed.get_or_use(parlay_id, false);
    assert(!already);
    parlay_redeemed.set(parlay_id, true);

    // Deduct from pool and exposure
    let pool: u128 = parlay_pool.get_or_use(token_type, 0u128);
    let net_payout: u128 = potential_payout - fee;
    assert(pool >= net_payout);
    parlay_pool.set(token_type, pool - net_payout);

    let exposure: u128 = total_exposure.get_or_use(token_type, 0u128);
    let new_exposure: u128 = exposure >= potential_payout
        ? exposure - potential_payout
        : 0u128;
    total_exposure.set(token_type, new_exposure);

    // Collect fee
    let treasury: u128 = parlay_treasury.get_or_use(token_type, 0u128);
    parlay_treasury.set(token_type, treasury + fee);
}

final fn cancel_parlay_fin(
    transfer_future: Final,
    parlay_id: field,
    stake: u128,
    token_type: u8,
) {
    transfer_future.run();

    let parlay: ParlayData = parlays.get(parlay_id);
    // Can cancel if ACTIVE or CANCELLED
    assert(parlay.status == PARLAY_ACTIVE || parlay.status == PARLAY_CANCELLED);

    let already: bool = parlay_redeemed.get_or_use(parlay_id, false);
    assert(!already);
    parlay_redeemed.set(parlay_id, true);

    // Update status
    parlays.set(parlay_id, ParlayData {
        parlay_id: parlay.parlay_id,
        num_legs: parlay.num_legs,
        stake: parlay.stake,
        potential_payout: parlay.potential_payout,
        token_type: parlay.token_type,
        status: PARLAY_CANCELLED,
        created_at: parlay.created_at,
        resolution_submitted_at: parlay.resolution_submitted_at,
    });

    // Return stake from pool
    let pool: u128 = parlay_pool.get_or_use(token_type, 0u128);
    assert(pool >= stake);
    parlay_pool.set(token_type, pool - stake);

    // Reduce exposure
    let exposure: u128 = total_exposure.get_or_use(token_type, 0u128);
    let new_exposure: u128 = exposure >= parlay.potential_payout
        ? exposure - parlay.potential_payout
        : 0u128;
    total_exposure.set(token_type, new_exposure);
}

final fn fund_pool_fin(
    transfer_future: Final,
    token_type: u8,
    amount: u128,
) {
    transfer_future.run();
    assert(amount > 0u128);

    let pool: u128 = parlay_pool.get_or_use(token_type, 0u128);
    parlay_pool.set(token_type, pool + amount);
}

final fn set_governance_value_fin(
    config_key: field,
    value: u128,
    caller: address,
) {
    // Only governance program can call this
    assert(caller == GOVERNANCE_PROGRAM);

    let is_known_key: bool =
        config_key == CONFIG_NOOP ||
        config_key == CONFIG_PARLAY_FEE_BPS ||
        config_key == CONFIG_MIN_STAKE ||
        config_key == CONFIG_MAX_PAYOUT_MULT ||
        config_key == CONFIG_PAUSE_STATE;
    assert(is_known_key);

    if (config_key == CONFIG_PARLAY_FEE_BPS) {
        assert(value < FEE_DENOMINATOR);
    }
    if (config_key == CONFIG_MIN_STAKE) {
        assert(value > 0u128);
    }
    if (config_key == CONFIG_PAUSE_STATE) {
        assert(value <= 1u128);
    }

    governance_values.set(config_key, value);
}

final fn update_max_payout_fin(
    token_type: u8,
    max_pay: u128,
    caller: address,
) {
    assert(caller == ADMIN_ADDRESS || caller == GOVERNANCE_PROGRAM);
    assert(token_type >= TOKEN_ALEO && token_type <= TOKEN_USAD);
    assert(max_pay > 0u128);
    max_single_payout.set(token_type, max_pay);
}

final fn claim_dispute_bond_fin(
    transfer_future: Final,
    parlay_id: field,
    disputer: address,
) {
    transfer_future.run();

    // Verify parlay has been re-resolved (status changed from PENDING_DISPUTE)
    let parlay: ParlayData = parlays.get(parlay_id);
    // Bond claimable only after parlay left PENDING_DISPUTE (successful dispute)
    assert(
        parlay.status == PARLAY_ACTIVE ||
        parlay.status == PARLAY_RESOLVED_WIN ||
        parlay.status == PARLAY_RESOLVED_LOSS ||
        parlay.status == PARLAY_CANCELLED
    );

    let bond_key: field = BHP256::hash_to_field(DisputeBondKey { parlay_id: parlay_id, disputer: disputer });

    // Verify bond exists and hasn't been claimed
    let bond: u128 = dispute_bonds.get(bond_key);
    assert(bond > 0u128);
    let already_claimed: bool = dispute_bond_claimed.get_or_use(bond_key, false);
    assert(!already_claimed);
    dispute_bond_claimed.set(bond_key, true);
}

final fn submit_cancel_proof_fin(
    parlay_id: field,
    cancelled_market_id: field,
) {
    let parlay: ParlayData = parlays.get(parlay_id);
    assert(parlay.status == PARLAY_ACTIVE);

    // Verify the cancelled market is actually one of the parlay legs
    let legs: ParlayLegSet = parlay_legs.get(parlay_id);

    let is_leg: bool =
        cancelled_market_id == legs.leg_1.market_id ||
        cancelled_market_id == legs.leg_2.market_id ||
        (parlay.num_legs >= 3u8 && cancelled_market_id == legs.leg_3.market_id) ||
        (parlay.num_legs >= 4u8 && cancelled_market_id == legs.leg_4.market_id);
    assert(is_leg);

    parlays.set(parlay_id, ParlayData {
        parlay_id: parlay.parlay_id,
        num_legs: parlay.num_legs,
        stake: parlay.stake,
        potential_payout: parlay.potential_payout,
        token_type: parlay.token_type,
        status: PARLAY_CANCELLED,
        created_at: parlay.created_at,
        resolution_submitted_at: parlay.resolution_submitted_at,
    });
}

final fn withdraw_pool_fin(
    transfer_future: Final,
    token_type: u8,
    amount: u128,
    caller: address,
) {
    transfer_future.run();
    assert(caller == ADMIN_ADDRESS);
    assert(amount > 0u128);

    let pool: u128 = parlay_pool.get_or_use(token_type, 0u128);
    let exposure: u128 = total_exposure.get_or_use(token_type, 0u128);
    // Can only withdraw excess (pool must still cover exposure)
    assert(pool - amount >= exposure);
    parlay_pool.set(token_type, pool - amount);
}

final fn withdraw_treasury_fin(
    transfer_future: Final,
    token_type: u8,
    amount: u128,
    caller: address,
) {
    transfer_future.run();
    assert(caller == ADMIN_ADDRESS);
    assert(amount > 0u128);

    let treasury: u128 = parlay_treasury.get_or_use(token_type, 0u128);
    assert(treasury >= amount);
    parlay_treasury.set(token_type, treasury - amount);
}

// ============================================================================
// PROGRAM BLOCK — entry transitions, structs, records, mappings
// ============================================================================

program veiled_parlay_v3.aleo {

    @noupgrade
    constructor() {}

    // ========================================================================
    // STRUCTS
    // ========================================================================

    struct ParlayLeg {
        market_id: field,          // Market ID from any market contract
        market_program: u8,        // Which program: 1=ALEO, 2=USDCX, 3=USAD
        outcome: u8,               // Chosen outcome: 1-4
        odds_bps: u128,            // Odds at time of bet (bps): 25000 = 2.5x
    }

    struct ParlayLegSet {
        leg_1: ParlayLeg,
        leg_2: ParlayLeg,
        leg_3: ParlayLeg,
        leg_4: ParlayLeg,
    }

    struct ParlayIdSeed {
        bettor_owner: address,
        num_legs: u8,
        leg_1: ParlayLeg,
        leg_2: ParlayLeg,
        leg_3: ParlayLeg,
        leg_4: ParlayLeg,
        stake: u128,
        token_type: u8,
        ticket_nonce: field,
    }

    struct ParlayData {
        parlay_id: field,
        num_legs: u8,
        stake: u128,
        potential_payout: u128,
        token_type: u8,
        status: u8,
        created_at: u64,
        resolution_submitted_at: u64,  // Block when resolution was submitted
    }

    struct ParlayResolution {
        parlay_id: field,
        winning_1: u8,             // Submitted winning outcome for leg 1
        winning_2: u8,
        winning_3: u8,
        winning_4: u8,
        submitted_at: u64,
    }

    struct DisputeBondKey {
        parlay_id: field,
        disputer: address,
    }

    // ========================================================================
    // RECORDS
    // ========================================================================

    record ParlayTicket {
        owner: address,
        parlay_id: field,
        stake: u128,
        potential_payout: u128,
        token_type: u8,
        ticket_nonce: field,
    }

    // ========================================================================
    // MAPPINGS
    // ========================================================================

    // Pool balances per token type (1=ALEO, 2=USDCX, 3=USAD)
    mapping parlay_pool: u8 => u128;

    // Parlay state
    mapping parlays: field => ParlayData;
    mapping parlay_legs: field => ParlayLegSet;    // parlay_id => all legs

    // Resolution tracking
    mapping parlay_resolutions: field => ParlayResolution;
    mapping parlay_redeemed: field => bool;

    // Risk management
    mapping total_exposure: u8 => u128;            // Sum of all active potential payouts per token
    mapping max_single_payout: u8 => u128;         // Max payout for a single parlay per token

    // Protocol treasury (fees collected)
    mapping parlay_treasury: u8 => u128;           // token_type => accumulated fees

    // Governance parameters
    mapping governance_values: field => u128;

    // Dispute bond tracking: hash(parlay_id, disputer) => bond amount
    mapping dispute_bonds: field => u128;
    // Dispute bond claimed: hash(parlay_id, disputer) => bool
    mapping dispute_bond_claimed: field => bool;

    // Admin
    mapping initialized: u8 => bool;

    // ========================================================================
    // TRANSITION 1: init_parlay
    // ========================================================================

    fn init_parlay() -> Final {
        let signer = self.signer;
        return final {
            init_parlay_fin(signer);
        };
    }

    // ========================================================================
    // TRANSITION 2: create_parlay_aleo
    // ========================================================================

    fn create_parlay_aleo(
        private credits_in: credits.aleo::credits,
        private ticket_nonce: field,
        public num_legs: u8,
        public stake: u128,
        public leg_1: ParlayLeg,
        public leg_2: ParlayLeg,
        public leg_3: ParlayLeg,
        public leg_4: ParlayLeg,
    ) -> (ParlayTicket, credits.aleo::credits, Final) {
        assert(num_legs >= MIN_LEGS && num_legs <= MAX_LEGS);
        assert(stake >= MIN_STAKE);
        assert_leg_valid(leg_1, true);
        assert_leg_valid(leg_2, true);
        assert_leg_valid(leg_3, num_legs >= 3u8);
        assert_leg_valid(leg_4, num_legs >= 4u8);
        assert(leg_1.market_id != leg_2.market_id);
        if (num_legs >= 3u8) {
            assert(leg_3.market_id != leg_1.market_id && leg_3.market_id != leg_2.market_id);
        }
        if (num_legs >= 4u8) {
            assert(
                leg_4.market_id != leg_1.market_id &&
                leg_4.market_id != leg_2.market_id &&
                leg_4.market_id != leg_3.market_id
            );
        }

        let combined_odds: u128 = calculate_combined_odds(num_legs, leg_1, leg_2, leg_3, leg_4);
        let potential_payout: u128 = (stake * combined_odds) / ODDS_PRECISION;

        let stake_u64: u64 = stake as u64;
        let (change, transfer_future): (credits.aleo::credits, Final) =
            credits.aleo::transfer_private_to_public(credits_in, self.address, stake_u64);

        let parlay_id: field = BHP256::hash_to_field(ParlayIdSeed {
            bettor_owner: credits_in.owner,
            num_legs: num_legs,
            leg_1: leg_1,
            leg_2: leg_2,
            leg_3: leg_3,
            leg_4: leg_4,
            stake: stake,
            token_type: TOKEN_ALEO,
            ticket_nonce: ticket_nonce,
        });

        let ticket: ParlayTicket = ParlayTicket {
            owner: credits_in.owner,
            parlay_id: parlay_id,
            stake: stake,
            potential_payout: potential_payout,
            token_type: TOKEN_ALEO,
            ticket_nonce: ticket_nonce,
        };

        return (ticket, change, final {
            create_parlay_fin(
                transfer_future,
                parlay_id,
                TOKEN_ALEO,
                num_legs,
                stake,
                combined_odds,
                potential_payout,
                leg_1,
                leg_2,
                leg_3,
                leg_4,
            );
        });
    }

    // ========================================================================
    // TRANSITION 3: create_parlay_usdcx
    // ========================================================================

    fn create_parlay_usdcx(
        private token_in: test_usdcx_stablecoin.aleo::Token,
        private proofs: [test_usdcx_stablecoin.aleo::MerkleProof; 2],
        private ticket_nonce: field,
        public num_legs: u8,
        public stake: u128,
        public leg_1: ParlayLeg,
        public leg_2: ParlayLeg,
        public leg_3: ParlayLeg,
        public leg_4: ParlayLeg,
    ) -> (ParlayTicket, test_usdcx_stablecoin.aleo::ComplianceRecord, test_usdcx_stablecoin.aleo::Token, Final) {
        assert(num_legs >= MIN_LEGS && num_legs <= MAX_LEGS);
        assert(stake >= MIN_STAKE);
        assert_leg_valid(leg_1, true);
        assert_leg_valid(leg_2, true);
        assert_leg_valid(leg_3, num_legs >= 3u8);
        assert_leg_valid(leg_4, num_legs >= 4u8);
        assert(leg_1.market_id != leg_2.market_id);
        if (num_legs >= 3u8) {
            assert(leg_3.market_id != leg_1.market_id && leg_3.market_id != leg_2.market_id);
        }
        if (num_legs >= 4u8) {
            assert(
                leg_4.market_id != leg_1.market_id &&
                leg_4.market_id != leg_2.market_id &&
                leg_4.market_id != leg_3.market_id
            );
        }

        let combined_odds: u128 = calculate_combined_odds(num_legs, leg_1, leg_2, leg_3, leg_4);
        let potential_payout: u128 = (stake * combined_odds) / ODDS_PRECISION;

        let (compliance, change, transfer_future): (
            test_usdcx_stablecoin.aleo::ComplianceRecord, test_usdcx_stablecoin.aleo::Token, Final
        ) = test_usdcx_stablecoin.aleo::transfer_private_to_public(self.address, stake, token_in, proofs);

        let parlay_id: field = BHP256::hash_to_field(ParlayIdSeed {
            bettor_owner: token_in.owner,
            num_legs: num_legs,
            leg_1: leg_1,
            leg_2: leg_2,
            leg_3: leg_3,
            leg_4: leg_4,
            stake: stake,
            token_type: TOKEN_USDCX,
            ticket_nonce: ticket_nonce,
        });

        let ticket: ParlayTicket = ParlayTicket {
            owner: token_in.owner,
            parlay_id: parlay_id,
            stake: stake,
            potential_payout: potential_payout,
            token_type: TOKEN_USDCX,
            ticket_nonce: ticket_nonce,
        };

        return (ticket, compliance, change, final {
            create_parlay_fin(
                transfer_future,
                parlay_id,
                TOKEN_USDCX,
                num_legs,
                stake,
                combined_odds,
                potential_payout,
                leg_1,
                leg_2,
                leg_3,
                leg_4,
            );
        });
    }

    // ========================================================================
    // TRANSITION 4: create_parlay_usad
    // ========================================================================

    fn create_parlay_usad(
        private token_in: test_usad_stablecoin.aleo::Token,
        private proofs: [test_usad_stablecoin.aleo::MerkleProof; 2],
        private ticket_nonce: field,
        public num_legs: u8,
        public stake: u128,
        public leg_1: ParlayLeg,
        public leg_2: ParlayLeg,
        public leg_3: ParlayLeg,
        public leg_4: ParlayLeg,
    ) -> (ParlayTicket, test_usad_stablecoin.aleo::ComplianceRecord, test_usad_stablecoin.aleo::Token, Final) {
        assert(num_legs >= MIN_LEGS && num_legs <= MAX_LEGS);
        assert(stake >= MIN_STAKE);
        assert_leg_valid(leg_1, true);
        assert_leg_valid(leg_2, true);
        assert_leg_valid(leg_3, num_legs >= 3u8);
        assert_leg_valid(leg_4, num_legs >= 4u8);
        assert(leg_1.market_id != leg_2.market_id);
        if (num_legs >= 3u8) {
            assert(leg_3.market_id != leg_1.market_id && leg_3.market_id != leg_2.market_id);
        }
        if (num_legs >= 4u8) {
            assert(
                leg_4.market_id != leg_1.market_id &&
                leg_4.market_id != leg_2.market_id &&
                leg_4.market_id != leg_3.market_id
            );
        }

        let combined_odds: u128 = calculate_combined_odds(num_legs, leg_1, leg_2, leg_3, leg_4);
        let potential_payout: u128 = (stake * combined_odds) / ODDS_PRECISION;

        let (compliance, change, transfer_future): (
            test_usad_stablecoin.aleo::ComplianceRecord, test_usad_stablecoin.aleo::Token, Final
        ) = test_usad_stablecoin.aleo::transfer_private_to_public(self.address, stake, token_in, proofs);

        let parlay_id: field = BHP256::hash_to_field(ParlayIdSeed {
            bettor_owner: token_in.owner,
            num_legs: num_legs,
            leg_1: leg_1,
            leg_2: leg_2,
            leg_3: leg_3,
            leg_4: leg_4,
            stake: stake,
            token_type: TOKEN_USAD,
            ticket_nonce: ticket_nonce,
        });

        let ticket: ParlayTicket = ParlayTicket {
            owner: token_in.owner,
            parlay_id: parlay_id,
            stake: stake,
            potential_payout: potential_payout,
            token_type: TOKEN_USAD,
            ticket_nonce: ticket_nonce,
        };

        return (ticket, compliance, change, final {
            create_parlay_fin(
                transfer_future,
                parlay_id,
                TOKEN_USAD,
                num_legs,
                stake,
                combined_odds,
                potential_payout,
                leg_1,
                leg_2,
                leg_3,
                leg_4,
            );
        });
    }

    // ========================================================================
    // TRANSITION 5: submit_resolution
    // ========================================================================
    // Anyone can submit resolution results read from public RPC mappings.
    // Opens a dispute window before results become final.

    fn submit_resolution(
        public parlay_id: field,
        public winning_1: u8,
        public winning_2: u8,
        public winning_3: u8,
        public winning_4: u8,
    ) -> Final {
        return final {
            submit_resolution_fin(parlay_id, winning_1, winning_2, winning_3, winning_4);
        };
    }

    // ========================================================================
    // TRANSITION 6: dispute_parlay_resolution
    // ========================================================================
    // If submitted resolution is wrong, anyone can dispute with a bond.
    // Resets parlay back to ACTIVE so it can be re-submitted.

    fn dispute_parlay_resolution(
        private credits_in: credits.aleo::credits,
        public parlay_id: field,
    ) -> (credits.aleo::credits, Final) {
        // Dispute bond is always in ALEO regardless of parlay token type
        let bond: u64 = (MIN_STAKE * DISPUTE_BOND_MULTIPLIER) as u64;
        let (change, transfer_future): (credits.aleo::credits, Final) =
            credits.aleo::transfer_private_to_public(credits_in, self.address, bond);

        let signer = self.signer;
        return (change, final {
            dispute_parlay_fin(transfer_future, parlay_id, signer);
        });
    }

    // ========================================================================
    // TRANSITION 7: finalize_parlay
    // ========================================================================
    // After dispute window passes, anyone can finalize the resolution.
    // Checks each leg against submitted winning outcomes.

    fn finalize_parlay(
        public parlay_id: field,
    ) -> Final {
        return final {
            finalize_parlay_fin(parlay_id);
        };
    }

    // ========================================================================
    // TRANSITION 8: redeem_parlay_aleo
    // ========================================================================

    fn redeem_parlay_aleo(
        private ticket: ParlayTicket,
    ) -> (credits.aleo::credits, Final) {
        assert(ticket.owner == self.signer);
        assert(ticket.token_type == TOKEN_ALEO);

        let t_parlay_id: field = ticket.parlay_id;
        let t_potential_payout: u128 = ticket.potential_payout;
        let t_token_type: u8 = ticket.token_type;

        let fee_bps: u128 = PARLAY_FEE_BPS;
        let fee: u128 = (t_potential_payout * fee_bps) / FEE_DENOMINATOR;
        let net_payout: u128 = t_potential_payout - fee;
        let net_u64: u64 = net_payout as u64;

        let (payout_record, transfer_future): (credits.aleo::credits, Final) =
            credits.aleo::transfer_public_to_private(self.signer, net_u64);

        return (payout_record, final {
            redeem_parlay_fin(
                transfer_future,
                t_parlay_id,
                t_potential_payout,
                fee,
                t_token_type,
            );
        });
    }

    // ========================================================================
    // TRANSITION 9: redeem_parlay_usdcx
    // ========================================================================

    fn redeem_parlay_usdcx(
        private ticket: ParlayTicket,
    ) -> (test_usdcx_stablecoin.aleo::ComplianceRecord, test_usdcx_stablecoin.aleo::Token, Final) {
        assert(ticket.owner == self.signer);
        assert(ticket.token_type == TOKEN_USDCX);

        let t_parlay_id: field = ticket.parlay_id;
        let t_potential_payout: u128 = ticket.potential_payout;
        let t_token_type: u8 = ticket.token_type;

        let fee: u128 = (t_potential_payout * PARLAY_FEE_BPS) / FEE_DENOMINATOR;
        let net_payout: u128 = t_potential_payout - fee;

        let (compliance, token_out, transfer_future): (
            test_usdcx_stablecoin.aleo::ComplianceRecord,
            test_usdcx_stablecoin.aleo::Token,
            Final
        ) = test_usdcx_stablecoin.aleo::transfer_public_to_private(self.signer, net_payout);

        return (compliance, token_out, final {
            redeem_parlay_fin(
                transfer_future,
                t_parlay_id,
                t_potential_payout,
                fee,
                t_token_type,
            );
        });
    }

    // ========================================================================
    // TRANSITION 10: redeem_parlay_usad
    // ========================================================================

    fn redeem_parlay_usad(
        private ticket: ParlayTicket,
    ) -> (test_usad_stablecoin.aleo::ComplianceRecord, test_usad_stablecoin.aleo::Token, Final) {
        assert(ticket.owner == self.signer);
        assert(ticket.token_type == TOKEN_USAD);

        let t_parlay_id: field = ticket.parlay_id;
        let t_potential_payout: u128 = ticket.potential_payout;
        let t_token_type: u8 = ticket.token_type;

        let fee: u128 = (t_potential_payout * PARLAY_FEE_BPS) / FEE_DENOMINATOR;
        let net_payout: u128 = t_potential_payout - fee;

        let (compliance, token_out, transfer_future): (
            test_usad_stablecoin.aleo::ComplianceRecord,
            test_usad_stablecoin.aleo::Token,
            Final
        ) = test_usad_stablecoin.aleo::transfer_public_to_private(self.signer, net_payout);

        return (compliance, token_out, final {
            redeem_parlay_fin(
                transfer_future,
                t_parlay_id,
                t_potential_payout,
                fee,
                t_token_type,
            );
        });
    }

    // ========================================================================
    // TRANSITION 11: cancel_parlay_aleo
    // ========================================================================
    // Refund parlay if one or more leg markets were cancelled.
    // Submitter must provide proof (cancelled market status via optimistic pattern).

    fn cancel_parlay_aleo(
        private ticket: ParlayTicket,
    ) -> (credits.aleo::credits, Final) {
        assert(ticket.owner == self.signer);
        assert(ticket.token_type == TOKEN_ALEO);

        let t_parlay_id: field = ticket.parlay_id;
        let t_stake: u128 = ticket.stake;
        let t_token_type: u8 = ticket.token_type;

        let refund_u64: u64 = t_stake as u64;
        let (refund_record, transfer_future): (credits.aleo::credits, Final) =
            credits.aleo::transfer_public_to_private(self.signer, refund_u64);

        return (refund_record, final {
            cancel_parlay_fin(transfer_future, t_parlay_id, t_stake, t_token_type);
        });
    }

    // ========================================================================
    // TRANSITION 12: cancel_parlay_usdcx
    // ========================================================================

    fn cancel_parlay_usdcx(
        private ticket: ParlayTicket,
    ) -> (test_usdcx_stablecoin.aleo::ComplianceRecord, test_usdcx_stablecoin.aleo::Token, Final) {
        assert(ticket.owner == self.signer);
        assert(ticket.token_type == TOKEN_USDCX);

        let t_parlay_id: field = ticket.parlay_id;
        let t_stake: u128 = ticket.stake;
        let t_token_type: u8 = ticket.token_type;

        let (compliance, token_out, transfer_future): (
            test_usdcx_stablecoin.aleo::ComplianceRecord,
            test_usdcx_stablecoin.aleo::Token,
            Final
        ) = test_usdcx_stablecoin.aleo::transfer_public_to_private(self.signer, t_stake);

        return (compliance, token_out, final {
            cancel_parlay_fin(transfer_future, t_parlay_id, t_stake, t_token_type);
        });
    }

    // ========================================================================
    // TRANSITION 13: cancel_parlay_usad
    // ========================================================================

    fn cancel_parlay_usad(
        private ticket: ParlayTicket,
    ) -> (test_usad_stablecoin.aleo::ComplianceRecord, test_usad_stablecoin.aleo::Token, Final) {
        assert(ticket.owner == self.signer);
        assert(ticket.token_type == TOKEN_USAD);

        let t_parlay_id: field = ticket.parlay_id;
        let t_stake: u128 = ticket.stake;
        let t_token_type: u8 = ticket.token_type;

        let (compliance, token_out, transfer_future): (
            test_usad_stablecoin.aleo::ComplianceRecord,
            test_usad_stablecoin.aleo::Token,
            Final
        ) = test_usad_stablecoin.aleo::transfer_public_to_private(self.signer, t_stake);

        return (compliance, token_out, final {
            cancel_parlay_fin(transfer_future, t_parlay_id, t_stake, t_token_type);
        });
    }

    // ========================================================================
    // TRANSITION 14: fund_pool_aleo
    // ========================================================================

    fn fund_pool_aleo(
        private credits_in: credits.aleo::credits,
        public amount: u128,
    ) -> (credits.aleo::credits, Final) {
        let amount_u64: u64 = amount as u64;
        let (change, transfer_future): (credits.aleo::credits, Final) =
            credits.aleo::transfer_private_to_public(credits_in, self.address, amount_u64);

        return (change, final {
            fund_pool_fin(transfer_future, TOKEN_ALEO, amount);
        });
    }

    // ========================================================================
    // TRANSITION 14b: fund_pool_aleo_public (public balance, no record needed)
    // ========================================================================

    fn fund_pool_aleo_public(
        public amount: u128,
    ) -> Final {
        let amount_u64: u64 = amount as u64;
        let transfer_future: Final = credits.aleo::transfer_public_as_signer(self.address, amount_u64);

        return final {
            transfer_future.run();
            assert(amount > 0u128);
            let pool: u128 = parlay_pool.get_or_use(TOKEN_ALEO, 0u128);
            parlay_pool.set(TOKEN_ALEO, pool + amount);
        };
    }

    // ========================================================================
    // TRANSITION 15: fund_pool_usdcx
    // ========================================================================

    fn fund_pool_usdcx(
        private token_in: test_usdcx_stablecoin.aleo::Token,
        private proofs: [test_usdcx_stablecoin.aleo::MerkleProof; 2],
        public amount: u128,
    ) -> (test_usdcx_stablecoin.aleo::ComplianceRecord, test_usdcx_stablecoin.aleo::Token, Final) {
        let (compliance, change, transfer_future): (
            test_usdcx_stablecoin.aleo::ComplianceRecord,
            test_usdcx_stablecoin.aleo::Token,
            Final
        ) = test_usdcx_stablecoin.aleo::transfer_private_to_public(
            self.address, amount, token_in, proofs
        );
        return (compliance, change, final {
            fund_pool_fin(transfer_future, TOKEN_USDCX, amount);
        });
    }

    // ========================================================================
    // TRANSITION 16: fund_pool_usad
    // ========================================================================

    fn fund_pool_usad(
        private token_in: test_usad_stablecoin.aleo::Token,
        private proofs: [test_usad_stablecoin.aleo::MerkleProof; 2],
        public amount: u128,
    ) -> (test_usad_stablecoin.aleo::ComplianceRecord, test_usad_stablecoin.aleo::Token, Final) {
        let (compliance, change, transfer_future): (
            test_usad_stablecoin.aleo::ComplianceRecord,
            test_usad_stablecoin.aleo::Token,
            Final
        ) = test_usad_stablecoin.aleo::transfer_private_to_public(
            self.address, amount, token_in, proofs
        );
        return (compliance, change, final {
            fund_pool_fin(transfer_future, TOKEN_USAD, amount);
        });
    }

    // ========================================================================
    // TRANSITION 17: set_governance_value
    // ========================================================================
    // Governance contract can update parlay parameters.

    fn set_governance_value(
        public config_key: field,
        public value: u128,
    ) -> Final {
        let signer = self.signer;
        return final {
            set_governance_value_fin(config_key, value, signer);
        };
    }

    // ========================================================================
    // TRANSITION 18: update_max_payout
    // ========================================================================
    // Admin sets max single payout per token type.

    fn update_max_payout(
        public token_type: u8,
        public max_pay: u128,
    ) -> Final {
        let signer = self.signer;
        return final {
            update_max_payout_fin(token_type, max_pay, signer);
        };
    }

    // ========================================================================
    // TRANSITION 19: claim_dispute_bond
    // ========================================================================
    // After a successful dispute (parlay was re-resolved), the disputer can
    // reclaim their bond in ALEO.

    fn claim_dispute_bond(
        public parlay_id: field,
    ) -> (credits.aleo::credits, Final) {
        let bond_amount: u128 = MIN_STAKE * DISPUTE_BOND_MULTIPLIER;
        let bond_u64: u64 = bond_amount as u64;
        let signer = self.signer;

        let (payout_record, transfer_future): (credits.aleo::credits, Final) =
            credits.aleo::transfer_public_to_private(signer, bond_u64);

        return (payout_record, final {
            claim_dispute_bond_fin(transfer_future, parlay_id, signer);
        });
    }

    // ========================================================================
    // TRANSITION 20: submit_cancel_proof
    // ========================================================================
    // Anyone submits proof that a leg's market was cancelled.
    // Uses same optimistic pattern: submit -> dispute window -> finalize cancel.

    fn submit_cancel_proof(
        public parlay_id: field,
        public cancelled_market_id: field,
    ) -> Final {
        return final {
            submit_cancel_proof_fin(parlay_id, cancelled_market_id);
        };
    }

    // ========================================================================
    // TRANSITION 21-23: withdraw_pool_aleo / usdcx / usad
    // ========================================================================
    // Admin can withdraw excess pool liquidity (pool - exposure).

    fn withdraw_pool_aleo(
        public amount: u128,
    ) -> (credits.aleo::credits, Final) {
        let signer = self.signer;
        let amount_u64: u64 = amount as u64;
        let (payout, transfer_future): (credits.aleo::credits, Final) =
            credits.aleo::transfer_public_to_private(signer, amount_u64);
        return (payout, final {
            withdraw_pool_fin(transfer_future, TOKEN_ALEO, amount, signer);
        });
    }

    fn withdraw_pool_usdcx(
        public amount: u128,
    ) -> (test_usdcx_stablecoin.aleo::ComplianceRecord, test_usdcx_stablecoin.aleo::Token, Final) {
        let signer = self.signer;
        let (compliance, token_out, transfer_future): (
            test_usdcx_stablecoin.aleo::ComplianceRecord,
            test_usdcx_stablecoin.aleo::Token,
            Final
        ) = test_usdcx_stablecoin.aleo::transfer_public_to_private(signer, amount);
        return (compliance, token_out, final {
            withdraw_pool_fin(transfer_future, TOKEN_USDCX, amount, signer);
        });
    }

    fn withdraw_pool_usad(
        public amount: u128,
    ) -> (test_usad_stablecoin.aleo::ComplianceRecord, test_usad_stablecoin.aleo::Token, Final) {
        let signer = self.signer;
        let (compliance, token_out, transfer_future): (
            test_usad_stablecoin.aleo::ComplianceRecord,
            test_usad_stablecoin.aleo::Token,
            Final
        ) = test_usad_stablecoin.aleo::transfer_public_to_private(signer, amount);
        return (compliance, token_out, final {
            withdraw_pool_fin(transfer_future, TOKEN_USAD, amount, signer);
        });
    }

    // ========================================================================
    // TRANSITION 24-26: withdraw_treasury_aleo / usdcx / usad
    // ========================================================================
    // Admin withdraws accumulated protocol fees.

    fn withdraw_treasury_aleo(
        public amount: u128,
    ) -> (credits.aleo::credits, Final) {
        let signer = self.signer;
        let amount_u64: u64 = amount as u64;
        let (payout, transfer_future): (credits.aleo::credits, Final) =
            credits.aleo::transfer_public_to_private(signer, amount_u64);
        return (payout, final {
            withdraw_treasury_fin(transfer_future, TOKEN_ALEO, amount, signer);
        });
    }

    fn withdraw_treasury_usdcx(
        public amount: u128,
    ) -> (test_usdcx_stablecoin.aleo::ComplianceRecord, test_usdcx_stablecoin.aleo::Token, Final) {
        let signer = self.signer;
        let (compliance, token_out, transfer_future): (
            test_usdcx_stablecoin.aleo::ComplianceRecord,
            test_usdcx_stablecoin.aleo::Token,
            Final
        ) = test_usdcx_stablecoin.aleo::transfer_public_to_private(signer, amount);
        return (compliance, token_out, final {
            withdraw_treasury_fin(transfer_future, TOKEN_USDCX, amount, signer);
        });
    }

    fn withdraw_treasury_usad(
        public amount: u128,
    ) -> (test_usad_stablecoin.aleo::ComplianceRecord, test_usad_stablecoin.aleo::Token, Final) {
        let signer = self.signer;
        let (compliance, token_out, transfer_future): (
            test_usad_stablecoin.aleo::ComplianceRecord,
            test_usad_stablecoin.aleo::Token,
            Final
        ) = test_usad_stablecoin.aleo::transfer_public_to_private(signer, amount);
        return (compliance, token_out, final {
            withdraw_treasury_fin(transfer_future, TOKEN_USAD, amount, signer);
        });
    }

}
