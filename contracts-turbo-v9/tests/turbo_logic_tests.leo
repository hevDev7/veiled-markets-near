// ============================================================================
// Veiled Turbo v9 — Logic Tests
// ============================================================================
// Pure-logic tests for the critical math in veiled_turbo_v9.aleo:
//   - Parimutuel buy calculation
//   - Payout proration on claim
//   - Solo-bettor-safe internal claim-unit scaling
//   - Sanity check thresholds (window, conf, max-move)
//   - Winner selection (UP/DOWN tiebreak)
//
// These tests do NOT exercise on-chain state or finalize blocks; they
// reproduce the inline arithmetic from main.leo and assert expected
// values for known inputs. Foundry-style integration tests against a
// running snarkOS node belong in `tests/integration/`.
// ============================================================================

program turbo_logic_tests.aleo {
    @noupgrade
    constructor() {}

    const OUTCOME_UP: u8   = 1u8;
    const OUTCOME_DOWN: u8 = 2u8;

    const PROTOCOL_FEE_BPS: u128 = 50u128;
    const FEE_DENOMINATOR: u128  = 10000u128;
    const CLAIM_UNIT_SCALE: u128 = 2u128;

    const MIN_DURATION_BLOCKS: u64 = 15u64;
    const MAX_DURATION_BLOCKS: u64 = 900u64;
    const RESOLUTION_WINDOW_BLOCKS: u64 = 10u64;
    const RESOLUTION_GRACE_BLOCKS: u64 = 150u64;

    const CONF_DENOMINATOR_FRAC: u128 = 200u128;
    const MAX_MOVE_FRAC: u128 = 2u128;

    // ------------------------------------------------------------------------
    // Parimutuel buy calculation — basic round trip
    // ------------------------------------------------------------------------
    // User buys 10 UP.
    //   protocol_fee = 10 * 50 / 10000 = 0
    //   refundable_amount = 10
    //   claim_units = 20
    @test
    fn test_parimutuel_buy() {
        let amount_in: u128 = 10u128;

        let protocol_fee: u128 = (amount_in * PROTOCOL_FEE_BPS) / FEE_DENOMINATOR;
        let refundable_amount: u128 = amount_in - protocol_fee;
        let claim_units: u128 = refundable_amount * CLAIM_UNIT_SCALE;

        assert_eq(protocol_fee, 0u128);
        assert_eq(refundable_amount, 10u128);
        assert_eq(claim_units, 20u128);
    }

    // ------------------------------------------------------------------------
    // Parimutuel with realistic numbers + non-zero protocol fee
    // ------------------------------------------------------------------------
    // Buy 1_000_000 UP.
    //   fee = 5000, refundable_amount = 995_000, claim_units = 1_990_000
    @test
    fn test_parimutuel_with_fee() {
        let amount_in: u128 = 1_000_000u128;

        let fee: u128 = (amount_in * PROTOCOL_FEE_BPS) / FEE_DENOMINATOR;
        let refundable_amount: u128 = amount_in - fee;
        let claim_units: u128 = refundable_amount * CLAIM_UNIT_SCALE;

        assert_eq(fee, 5000u128);
        assert_eq(refundable_amount, 995_000u128);
        assert_eq(claim_units, 1_990_000u128);
    }

    // ------------------------------------------------------------------------
    // Client quote must match the contract's exact refundable amount.
    // ------------------------------------------------------------------------
    @test
    fn test_expected_shares_exact() {
        let amount_in: u128 = 1_000_000u128;
        let fee: u128 = (amount_in * PROTOCOL_FEE_BPS) / FEE_DENOMINATOR;
        let shares_out: u128 = amount_in - fee;

        let correct_quote: u128 = 995_000u128;
        let stale_quote: u128 = 994_999u128;

        assert_eq(shares_out, correct_quote);
        assert(shares_out == correct_quote);
        assert(shares_out != stale_quote);
    }

    // ------------------------------------------------------------------------
    // Payout proration math
    // ------------------------------------------------------------------------
    // After resolution: market_credits = 1000, total_winning_shares = 200,
    // user holds 50 winning shares.
    //   payout = 50 * 1000 / 200 = 250
    @test
    fn test_payout_proration() {
        let market_credits: u128 = 1000u128;
        let total_winning: u128 = 200u128;
        let qty: u128 = 50u128;

        let payout: u128 = (qty * market_credits) / total_winning;
        assert_eq(payout, 250u128);
    }

    // ------------------------------------------------------------------------
    // Payout when one user owns 100% of winning side
    // ------------------------------------------------------------------------
    @test
    fn test_payout_sole_winner() {
        let market_credits: u128 = 9_995_000u128;
        let total_winning: u128 = 1_990_000u128;
        let claim_units: u128 = 1_990_000u128;

        let payout: u128 = (claim_units * market_credits) / total_winning;
        // Sole winner takes the whole pool (within rounding)
        assert(payout >= market_credits - 1u128);
        assert(payout <= market_credits);
    }

    // ------------------------------------------------------------------------
    // Solo bettor safety — payout remains the refundable stake, but the
    // internal claim units are different from that stake.
    // ------------------------------------------------------------------------
    @test
    fn test_solo_claim_units() {
        let refundable_amount: u128 = 995_000u128;
        let claim_units: u128 = refundable_amount * CLAIM_UNIT_SCALE;
        let total_pool: u128 = refundable_amount;
        let total_winning_claim_units: u128 = claim_units;
        let payout: u128 = (claim_units * total_pool) / total_winning_claim_units;

        assert_eq(payout, refundable_amount);
        assert(claim_units != refundable_amount);
    }

    // ------------------------------------------------------------------------
    // Payout snapshots keep integer rounding independent from claim order.
    // ------------------------------------------------------------------------
    @test
    fn test_payouts_order_independent() {
        let total_pool: u128 = 10u128;
        let total_winning_claim_units: u128 = 3u128;

        let claimer_a_units: u128 = 1u128;
        let claimer_b_units: u128 = 2u128;

        let payout_a_snapshot: u128 = (claimer_a_units * total_pool) / total_winning_claim_units;
        let payout_b_snapshot: u128 = (claimer_b_units * total_pool) / total_winning_claim_units;

        let remaining_after_a: u128 = total_pool - payout_a_snapshot;
        let remaining_units_after_a: u128 = total_winning_claim_units - claimer_a_units;
        let payout_b_residual: u128 = (claimer_b_units * remaining_after_a) / remaining_units_after_a;

        let remaining_after_b: u128 = total_pool - payout_b_snapshot;
        let remaining_units_after_b: u128 = total_winning_claim_units - claimer_b_units;
        let payout_a_residual: u128 = (claimer_a_units * remaining_after_b) / remaining_units_after_b;

        assert_eq(payout_a_snapshot, 3u128);
        assert_eq(payout_b_snapshot, 6u128);
        assert_eq(payout_a_snapshot + payout_b_snapshot, 9u128);

        assert_eq(payout_b_residual, 7u128);
        assert_eq(payout_a_residual, 4u128);
        assert(payout_b_residual != payout_b_snapshot);
        assert(payout_a_residual != payout_a_snapshot);
    }

    // ------------------------------------------------------------------------
    // Closing window enforcement
    // ------------------------------------------------------------------------
    @test
    fn test_resolution_window_pass() {
        let deadline: u64 = 1000u64;
        let closing_block: u64 = 1005u64; // within window
        let current_height: u64 = 1006u64;

        let upper_bound: u64 = deadline + RESOLUTION_WINDOW_BLOCKS;
        let grace_bound: u64 = deadline + RESOLUTION_GRACE_BLOCKS;

        assert(closing_block >= deadline);
        assert(closing_block <= upper_bound);
        assert(current_height >= closing_block);
        assert(current_height <= grace_bound);
    }

    @test
    fn test_resolution_window_too_late() {
        let deadline: u64 = 1000u64;
        let upper_bound: u64 = deadline + RESOLUTION_WINDOW_BLOCKS;
        let closing_block_late: u64 = 1011u64;
        // Operator submitted a snapshot 11 blocks after deadline → outside window
        let within_window: bool = closing_block_late <= upper_bound;
        assert_eq(within_window, false);
    }

    // ------------------------------------------------------------------------
    // Confidence interval sanity (≤ 0.5%)
    // ------------------------------------------------------------------------
    @test
    fn test_confidence_pass() {
        let price: u128 = 71_094_510_000u128;  // $71,094.51 in micro-USD
        let conf: u128  =     28_000_000u128;  // ±$28.00
        let max_conf: u128 = price / CONF_DENOMINATOR_FRAC;
        assert(conf <= max_conf);
    }

    @test
    fn test_confidence_too_wide() {
        let price: u128 = 71_094_510_000u128;
        // Pyth confidence of $400 → above 0.5% threshold for $71k
        let conf_bad: u128 = 400_000_000u128;
        let max_conf: u128 = price / CONF_DENOMINATOR_FRAC;
        let ok: bool = conf_bad <= max_conf;
        assert_eq(ok, false);
    }

    // ------------------------------------------------------------------------
    // Max-move sanity check (≤ 50% within 5 minutes = flash crash filter)
    // ------------------------------------------------------------------------
    @test
    fn test_max_move_normal() {
        // Same delta math as the contract, but expressed branch-free
        // to avoid Leo compile-time const-folding overflow on the unused arm.
        let baseline: u128 = 71_094_510_000u128;
        let closing: u128  = 71_021_070_000u128; // ~0.1% drop
        let max_move: u128 = baseline / MAX_MOVE_FRAC;
        let hi: u128 = baseline > closing ? baseline : closing;
        let lo: u128 = baseline > closing ? closing : baseline;
        let moved: u128 = hi - lo;
        assert(moved <= max_move);
    }

    @test
    fn test_max_move_flash_crash() {
        let baseline: u128 = 71_094_510_000u128;
        let closing: u128  = 30_000_000_000u128; // ~58% crash → reject
        let max_move: u128 = baseline / MAX_MOVE_FRAC;
        let hi: u128 = baseline > closing ? baseline : closing;
        let lo: u128 = baseline > closing ? closing : baseline;
        let moved: u128 = hi - lo;
        let ok: bool = moved <= max_move;
        assert_eq(ok, false);
    }

    // ------------------------------------------------------------------------
    // Winner selection — strict greater-than = UP, else DOWN (tie → DOWN)
    // ------------------------------------------------------------------------
    @test
    fn test_winner_up() {
        let baseline: u128 = 71_094_510_000u128;
        let closing: u128  = 71_200_000_000u128;
        let winner: u8 = closing > baseline ? OUTCOME_UP : OUTCOME_DOWN;
        assert_eq(winner, OUTCOME_UP);
    }

    @test
    fn test_winner_down() {
        let baseline: u128 = 71_094_510_000u128;
        let closing: u128  = 71_021_070_000u128;
        let winner: u8 = closing > baseline ? OUTCOME_UP : OUTCOME_DOWN;
        assert_eq(winner, OUTCOME_DOWN);
    }

    @test
    fn test_winner_tie_resolves_down() {
        let baseline: u128 = 71_000_000_000u128;
        let closing: u128  = 71_000_000_000u128;
        let winner: u8 = closing > baseline ? OUTCOME_UP : OUTCOME_DOWN;
        assert_eq(winner, OUTCOME_DOWN);
    }

    // ------------------------------------------------------------------------
    // Duration bounds
    // ------------------------------------------------------------------------
    @test
    fn test_duration_min_pass() {
        let current: u64 = 100u64;
        let deadline: u64 = current + 75u64; // 5 min testnet (~4s/block)
        let duration: u64 = deadline - current;
        assert(duration >= MIN_DURATION_BLOCKS);
        assert(duration <= MAX_DURATION_BLOCKS);
    }

    @test
    fn test_duration_too_short() {
        let current: u64 = 100u64;
        let deadline: u64 = current + 5u64; // ~20s — too short
        let duration: u64 = deadline - current;
        let ok: bool = duration >= MIN_DURATION_BLOCKS;
        assert_eq(ok, false);
    }

    @test
    fn test_duration_too_long() {
        let current: u64 = 100u64;
        let deadline: u64 = current + 901u64; // > 60 min testnet
        let duration: u64 = deadline - current;
        let ok: bool = duration <= MAX_DURATION_BLOCKS;
        assert_eq(ok, false);
    }
}
