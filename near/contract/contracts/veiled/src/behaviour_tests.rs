//! Contract behaviour through the real entry points with the mocked NEAR host: public calls as the accounts that
//! make them, private actions through `act_market` with the spend a verified proof would produce.
//! Expected numbers are worked out by hand in the comments, not by the code under test.

use crate::field::ZERO;
use crate::markets::CreateMarketArgs;
use crate::*;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::testing_env;

const TICK_MS_T: u64 = 4000;
/// Virtual height the tests start at.
const H0: u64 = 1000;
const NEAR: u128 = 1_000_000; // one token in micro units

fn acct(name: &str) -> AccountId {
    name.parse().unwrap()
}

/// Sets who is calling, what they attach (micro units) and the virtual height.
fn at(who: &str, attached_micro: u128, height: u64) {
    let mut b = VMContextBuilder::new();
    b.current_account_id(acct("veiled.test"))
        .predecessor_account_id(acct(who))
        .signer_account_id(acct(who))
        .attached_deposit(NearToken::from_yoctonear(attached_micro * YOCTO_PER_MICRO))
        .account_balance(NearToken::from_near(100_000))
        .block_timestamp(height * TICK_MS_T * 1_000_000);
    testing_env!(b.build());
}

fn config(min_voters: u8) -> Config {
    Config {
        vote_window: 3,
        dispute_window: 3,
        winner_claim_priority: 5,
        disputed_timeout: 40,
        vote_bond: U128(NEAR),
        min_voters,
        dispute_bond_multiplier: 3,
        min_trade: U128(1000),
        min_liquidity: U128(10_000),
        protocol_fee_bps: U128(50),
        creator_fee_bps: U128(50),
        lp_fee_bps: U128(100),
        committee_quorum: 3,
    }
}

fn contract(min_voters: u8) -> Veiled {
    at("owner.test", 0, H0);
    Veiled::new(
        acct("owner.test"),
        acct("oracle.test"),
        (1..=5).map(|i| acct(&format!("c{i}.test"))).collect(),
        acct("usdcx.test"),
        acct("usad.test"),
        Some(config(min_voters)),
    )
}

/// Alice opens a NEAR market with `liquidity`; trading ends `ticks` after H0.
fn open_market(c: &mut Veiled, liquidity: u128, outcomes: u8, ticks: u64, resolution_gap: u64) -> u64 {
    at("alice.test", liquidity, H0);
    c.create_market(CreateMarketArgs {
        question_hash: "q".into(),
        category: 3,
        num_outcomes: outcomes,
        deadline: U64(H0 + ticks),
        resolution_deadline: U64(H0 + ticks + resolution_gap),
        metadata: "{}".into(),
        lp_owner_blind: "1".into(),
        lp_memo: String::new(),
    })
    .0
}

/// The spend a verified proof hands to the action: `out_amount` leaves notes of (kind, asset, sub).
fn spend(kind: u8, asset: u64, sub: u8, out_amount: u128, action: Action) -> Spent {
    Spent {
        kind,
        asset,
        sub,
        out_amount,
        change_commitment: ZERO,
        ext: ExtData {
            action,
            new_owner_blind: "1".into(),
            new_memo: String::new(),
            change_memo: String::new(),
            relayer: None,
            fee: U128(0),
        },
    }
}

fn buy(c: &mut Veiled, market: u64, outcome: u8, amount: u128, height: u64) -> u128 {
    at("relayer.test", 0, height);
    let action = Action::Buy { market_id: U64(market), outcome, min_shares_out: U128(0) };
    c.act_market(&spend(KIND_BALANCE, TOKEN_NEAR as u64, 0, amount, action)).unwrap().amount
}

fn refund(c: &mut Veiled, market: u64, outcome: u8, shares: u128, height: u64) -> u128 {
    at("relayer.test", 0, height);
    c.act_market(&spend(KIND_SHARE, market, outcome, shares, Action::Refund)).unwrap().amount
}

// ---------------------------------------------------------------------------------------- cancelled markets

#[test]
fn cancelled_market_refunds_each_outcome_what_its_buyers_paid() {
    let mut c = contract(1);
    let id = open_market(&mut c, 10 * NEAR, 2, 20, 100);
    // 20 NEAR on outcome 1: 0.5% protocol + 0.5% creator fee leave 19.8 NEAR in the pool for those shares.
    let shares_1 = buy(&mut c, id, 1, 20 * NEAR, H0 + 1);
    // 1 NEAR on outcome 2 (now the cheap side): 0.99 NEAR in the pool for those shares.
    let shares_2 = buy(&mut c, id, 2, NEAR, H0 + 2);
    assert!(shares_2 > 10 * NEAR, "outcome 2 was cheap: 1 NEAR bought {shares_2} shares");

    at("carol.test", 0, H0 + 20 + 100 + 1);
    c.cancel_market(U64(id));

    assert_eq!(refund(&mut c, id, 1, shares_1, H0 + 122), 19_800_000);
    assert_eq!(refund(&mut c, id, 2, shares_2, H0 + 122), 990_000);
}

#[test]
fn a_market_from_before_the_per_outcome_ledger_refunds_by_share_count() {
    let mut c = contract(1);
    let id = open_market(&mut c, 10 * NEAR, 2, 20, 100);
    let shares_1 = buy(&mut c, id, 1, 20 * NEAR, H0 + 1);
    let shares_2 = buy(&mut c, id, 2, NEAR, H0 + 2);
    assert_eq!((shares_1, shares_2), (23_791_936, 13_277_895));
    // A market created by the previous contract version has no ledger entry.
    near_sdk::env::storage_remove(&markets::collateral_key(id));

    at("carol.test", 0, H0 + 121);
    c.cancel_market(U64(id));
    // 23_791_936 * 20_790_000 / 37_069_831 = 13_343_312 (floor): the old pro-rata rule.
    assert_eq!(refund(&mut c, id, 1, shares_1, H0 + 122), 13_343_312);
}

/// The per-outcome ledger must account for exactly the collateral traders are owed.
fn ledger_adds_up(c: &Veiled, id: u64) {
    let m = c.get_market(U64(id)).unwrap();
    let ledger: u128 = m.outcome_collateral.unwrap().iter().map(|x| x.0).sum();
    assert_eq!(ledger, m.trader_collateral.0);
}

#[test]
fn refunds_and_the_lp_exit_together_never_exceed_what_a_cancelled_market_holds() {
    let mut c = contract(1);
    let id = open_market(&mut c, 10 * NEAR, 2, 20, 100);
    let shares_2 = buy(&mut c, id, 2, 5 * NEAR, H0 + 1); // outcome 1 becomes cheap
    let shares_1 = buy(&mut c, id, 1, NEAR, H0 + 2);
    ledger_adds_up(&c, id);
    sell(&mut c, id, 2, shares_2, 1000, H0 + 3); // outcome 2 leaves at a loss; outcome 1 is worth more again
    ledger_adds_up(&c, id);
    sell(&mut c, id, 1, shares_1 / 2, 1000, H0 + 4); // half of outcome 1 leaves at a profit
    ledger_adds_up(&c, id);

    at("carol.test", 0, H0 + 121);
    c.cancel_market(U64(id));
    let before = c.get_market(U64(id)).unwrap();
    let owed_to_traders = before.trader_collateral.0;

    // Whatever outcome 1 still carries goes to its remaining shares; it cannot be more than the traders are owed.
    let left = shares_1 - shares_1 / 2;
    at("relayer.test", 0, H0 + 122);
    let refunded = match before.outcome_collateral.as_ref().map(|oc| oc[0].0) {
        Some(0) => 0,
        _ => c.act_market(&spend(KIND_SHARE, id, 1, left, Action::Refund)).unwrap().amount,
    };
    assert!(refunded <= owed_to_traders, "{refunded} > {owed_to_traders}");

    let lp = c.act_market(&spend(KIND_LP, id, 0, 10 * NEAR, Action::WithdrawLp { min_tokens_out: U128(0) })).unwrap().amount;
    let after = c.get_market(U64(id)).unwrap();
    // The LPs got everything except the traders' collateral; what remains is collateral nobody claimed.
    assert_eq!(lp, before.market_credits.0 - owed_to_traders);
    assert_eq!(after.market_credits.0, owed_to_traders - refunded);
}

// ---------------------------------------------------------------------------------------- resolution timing

#[test]
#[should_panic(expected = "ERR_RESOLUTION_DEADLINE")]
fn a_market_needs_room_for_two_vote_windows_and_a_dispute_window() {
    let mut c = contract(1);
    // vote_window 3 and dispute_window 3: the gap must be at least 2 * 3 + 3 = 9 ticks.
    open_market(&mut c, 10 * NEAR, 2, 20, 8);
}

#[test]
fn a_market_with_exactly_the_minimum_resolution_gap_is_accepted() {
    let mut c = contract(1);
    let id = open_market(&mut c, 10 * NEAR, 2, 20, 9);
    assert_eq!(c.get_market(U64(id)).unwrap().status, markets::STATUS_ACTIVE);
}

/// Votes outcome 1 with one bonded voter and finalizes; the dispute window then ends at H0 + 34.
fn vote_and_finalize(c: &mut Veiled, id: u64) {
    at("bob.test", NEAR, H0 + 21);
    c.vote_outcome(U64(id), 1);
    at("carol.test", 0, H0 + 30); // the vote window (3 ticks) closed at H0 + 24
    c.finalize_votes(U64(id));
}

#[test]
#[should_panic(expected = "ERR_CANNOT_CANCEL")]
fn a_voted_outcome_cannot_be_cancelled_once_the_resolution_deadline_passes() {
    let mut c = contract(1);
    let id = open_market(&mut c, 10 * NEAR, 2, 20, 12);
    vote_and_finalize(&mut c, id);
    at("mallory.test", 0, H0 + 20 + 12 + 5);
    c.cancel_market(U64(id));
}

#[test]
fn a_voted_outcome_can_still_be_confirmed_after_the_resolution_deadline() {
    let mut c = contract(1);
    let id = open_market(&mut c, 10 * NEAR, 2, 20, 12);
    vote_and_finalize(&mut c, id);
    at("carol.test", 0, H0 + 20 + 12 + 5);
    c.confirm_resolution(U64(id));
    assert_eq!(c.get_market(U64(id)).unwrap().status, markets::STATUS_RESOLVED);
}

#[test]
fn voting_reopens_when_the_first_window_ended_without_a_quorum() {
    let mut c = contract(3);
    let id = open_market(&mut c, 10 * NEAR, 2, 20, 200);
    at("v1.test", NEAR, H0 + 21);
    c.vote_outcome(U64(id), 1); // window ends at H0 + 24 with one voter of the three required
    at("v2.test", NEAR, H0 + 30);
    c.vote_outcome(U64(id), 1); // a late vote opens a new window: H0 + 30 + 3
    assert_eq!(c.get_market(U64(id)).unwrap().tally.unwrap().voting_deadline.0, H0 + 33);
    at("v3.test", NEAR, H0 + 31);
    c.vote_outcome(U64(id), 1);
    at("carol.test", 0, H0 + 34);
    c.finalize_votes(U64(id));
    assert_eq!(c.get_market(U64(id)).unwrap().status, markets::STATUS_PENDING_FINALIZATION);
}

// ---------------------------------------------------------------------------------------- selling

fn sell(c: &mut Veiled, market: u64, outcome: u8, shares: u128, min_tokens: u128, height: u64) -> u128 {
    at("relayer.test", 0, height);
    let action = Action::Sell { tokens_desired: U128(min_tokens) };
    c.act_market(&spend(KIND_SHARE, market, outcome, shares, action)).unwrap().amount
}

#[test]
fn a_sell_pays_for_every_share_offered() {
    let mut c = contract(1);
    let id = open_market(&mut c, 200_000, 2, 20, 100); // reserves 100_000 / 100_000
    // Buy 10_000: fees 50 + 50, 9900 into the pool. x = 100000 * 100000 / 109900 = 90991,
    // shares = 100000 + 9900 - 90991.
    let shares = buy(&mut c, id, 1, 10_000, H0 + 1);
    assert_eq!(shares, 18_909);
    // Offer all 18_909 shares, asking for at least 9000. The pool [90991, 109900] can release
    //   p = 9900: x = 90991 * 109900 / 100000 = 99999,  shares needed 99999 - 90991 + 9900 = 18908   (fits)
    //   p = 9901: x = 90991 * 109900 /  99999 = 100000, shares needed 100000 - 90991 + 9901 = 18910  (does not)
    // so 9900 leaves the pool; fees 49 + 49 + 99, the seller gets 9703 (asking for 9000 used to pay 8820).
    assert_eq!(sell(&mut c, id, 1, shares, 9000, H0 + 2), 9703);
    let m = c.get_market(U64(id)).unwrap();
    assert_eq!((m.reserves[0].0, m.reserves[1].0), (99_999, 100_000));
    assert_eq!(m.outcome_shares[0].0, 0);
}

#[test]
#[should_panic(expected = "ERR_SLIPPAGE")]
fn a_sell_fails_when_the_shares_do_not_cover_the_minimum_asked() {
    let mut c = contract(1);
    let id = open_market(&mut c, 200_000, 2, 20, 100);
    let shares = buy(&mut c, id, 1, 10_000, H0 + 1);
    sell(&mut c, id, 1, shares, 9901, H0 + 2); // 9901 would need 18_910 shares
}

// ---------------------------------------------------------------------------------------- owner limits

#[test]
#[should_panic(expected = "ERR_FEES")]
fn total_fees_above_ten_percent_are_refused() {
    let mut c = contract(1);
    at("owner.test", 0, H0);
    c.set_governance_value(1, U128(851)); // 851 + 50 + 100 = 1001 bps
}

#[test]
fn total_fees_of_exactly_ten_percent_are_accepted() {
    let mut c = contract(1);
    at("owner.test", 0, H0);
    c.set_governance_value(1, U128(850));
    assert_eq!(c.get_governance_values().protocol_fee_bps.0, 850);
}

// ---------------------------------------------------------------------------------------- storage

#[test]
#[should_panic(expected = "ERR_MEMO_LEN")]
fn a_deposit_memo_longer_than_400_bytes_is_refused() {
    let mut c = contract(1);
    at("alice.test", NEAR, H0);
    c.deposit_near("1".into(), "m".repeat(401));
}

#[test]
fn a_400_byte_deposit_memo_is_accepted() {
    let mut c = contract(1);
    at("alice.test", NEAR, H0);
    c.deposit_near("1".into(), "m".repeat(400));
    assert_eq!(c.get_tree_info().next_index.0, 2);
}

// ---------------------------------------------------------------------------------------- turbo

fn open_turbo(c: &mut Veiled, duration: u64) -> u64 {
    at("oracle.test", 0, H0);
    c.create_turbo_market(1, U64(H0 + duration), U128(70_000_000_000), U128(0), U64(H0)).0
}

fn turbo_bet(c: &mut Veiled, id: u64, height: u64) -> u128 {
    at("relayer.test", 0, height);
    let action = Action::TurboBuy { market_id: U64(id), side: turbo::UP };
    c.act_market(&spend(KIND_BALANCE, TOKEN_NEAR as u64, 0, NEAR, action)).unwrap().amount
}

#[test]
fn turbo_bets_are_taken_during_the_first_four_fifths_of_a_round() {
    let mut c = contract(1);
    let id = open_turbo(&mut c, 75); // betting closes 15 ticks before the deadline
    assert_eq!(turbo_bet(&mut c, id, H0 + 59), 995_000); // 16 ticks left; 0.5% fee
}

#[test]
#[should_panic(expected = "ERR_BETTING_CLOSED")]
fn turbo_bets_are_refused_in_the_last_fifth_of_a_round() {
    let mut c = contract(1);
    let id = open_turbo(&mut c, 75);
    turbo_bet(&mut c, id, H0 + 60); // 15 ticks left
}

// ---------------------------------------------------------------------------------------- parlays

fn fund_parlay_pool(c: &mut Veiled, amount: u128) {
    at("owner.test", amount, H0);
    c.fund_parlay_pool(TOKEN_NEAR);
}

fn approve_leg(c: &mut Veiled, market: u64) {
    at("owner.test", 0, H0);
    c.set_parlay_leg(U64(market), true);
}

/// Places a parlay on outcome 1 of each market; returns the payout written on the ticket.
fn parlay(c: &mut Veiled, markets: &[u64], stake: u128, height: u64) -> u128 {
    at("relayer.test", 0, height);
    let legs = markets.iter().map(|m| parlay::LegArg { market_id: U64(*m), outcome: 1 }).collect();
    let action = Action::ParlayBuy { legs, min_payout: U128(0) };
    c.act_market(&spend(KIND_BALANCE, TOKEN_NEAR as u64, 0, stake, action)).unwrap().amount
}

/// Two even 100 NEAR markets (reserves 50 / 50, so each leg pays 2x) and a 50 NEAR parlay pool.
fn two_markets_and_a_pool(c: &mut Veiled) -> (u64, u64) {
    let a = open_market(c, 100 * NEAR, 2, 20, 100);
    let b = open_market(c, 100 * NEAR, 2, 20, 100);
    fund_parlay_pool(c, 50 * NEAR);
    (a, b)
}

#[test]
#[should_panic(expected = "ERR_LEG_NOT_ELIGIBLE")]
fn a_parlay_leg_must_be_a_market_the_owner_approved() {
    let mut c = contract(1);
    let (a, b) = two_markets_and_a_pool(&mut c);
    approve_leg(&mut c, a);
    parlay(&mut c, &[a, b], NEAR / 5, H0 + 1);
}

#[test]
fn approved_legs_price_a_parlay_from_their_pools() {
    let mut c = contract(1);
    let (a, b) = two_markets_and_a_pool(&mut c);
    approve_leg(&mut c, a);
    approve_leg(&mut c, b);
    // 0.2 NEAR at 2x * 2x. The thinnest leg holds 2 * 50 NEAR, so one ticket may pay up to 1% of that: 1 NEAR.
    assert_eq!(parlay(&mut c, &[a, b], NEAR / 5, H0 + 1), 800_000);
}

#[test]
#[should_panic(expected = "ERR_LEG_LIQUIDITY")]
fn a_parlay_cannot_pay_more_than_one_percent_of_its_thinnest_leg() {
    let mut c = contract(1);
    let (a, b) = two_markets_and_a_pool(&mut c);
    approve_leg(&mut c, a);
    approve_leg(&mut c, b);
    parlay(&mut c, &[a, b], 3 * NEAR / 10, H0 + 1); // 1.2 NEAR against a 1 NEAR cap
}

#[test]
#[should_panic(expected = "ERR_LEG_LIQUIDITY")]
fn pushing_a_leg_price_shrinks_what_a_parlay_on_it_may_pay() {
    let mut c = contract(1);
    let (a, b) = two_markets_and_a_pool(&mut c);
    approve_leg(&mut c, a);
    approve_leg(&mut c, b);
    assert_eq!(parlay(&mut c, &[a, b], NEAR / 10, H0 + 1), 400_000); // even pools: 0.1 NEAR at 4x is fine
    // 30 NEAR on outcome 2 of market A makes outcome 1 a long shot (about 3.5x) and leaves its smaller reserve
    // near 31 NEAR, so the cap falls to about 0.63 NEAR while the same stake would now be owed about 0.71.
    buy(&mut c, a, 2, 30 * NEAR, H0 + 2);
    parlay(&mut c, &[a, b], NEAR / 10, H0 + 3);
}

#[test]
fn the_owner_can_widen_the_leg_cap() {
    let mut c = contract(1);
    let (a, b) = two_markets_and_a_pool(&mut c);
    approve_leg(&mut c, a);
    approve_leg(&mut c, b);
    at("owner.test", 0, H0);
    c.set_parlay_leg_cap(U128(5000)); // half of the thinnest leg
    assert_eq!(parlay(&mut c, &[a, b], 3 * NEAR / 10, H0 + 1), 1_200_000);
}

#[test]
#[should_panic(expected = "ERR_OWNER")]
fn only_the_owner_approves_parlay_legs() {
    let mut c = contract(1);
    let (a, _) = two_markets_and_a_pool(&mut c);
    at("mallory.test", 0, H0);
    c.set_parlay_leg(U64(a), true);
}

// ---------------------------------------------------------------------------------------- resolution settings

#[test]
#[should_panic(expected = "ERR_OWNER")]
fn only_the_owner_changes_resolution_settings() {
    let mut c = contract(1);
    at("mallory.test", 0, H0);
    c.set_resolution_config(None, None, None, None, None, Some(1), None, None);
}

#[test]
#[should_panic(expected = "ERR_QUORUM")]
fn a_raised_quorum_applies_to_the_next_finalization() {
    let mut c = contract(1);
    let id = open_market(&mut c, 10 * NEAR, 2, 20, 100);
    at("bob.test", NEAR, H0 + 21);
    c.vote_outcome(U64(id), 1);
    at("owner.test", 0, H0 + 22);
    c.set_resolution_config(None, None, None, None, None, Some(2), None, None);
    at("carol.test", 0, H0 + 30);
    c.finalize_votes(U64(id)); // one voter, two required
}

#[test]
#[should_panic(expected = "ERR_VALUE")]
fn a_zero_vote_window_is_refused() {
    let mut c = contract(1);
    at("owner.test", 0, H0);
    c.set_resolution_config(Some(U64(0)), None, None, None, None, None, None, None);
}

#[test]
fn changed_windows_show_in_the_config() {
    let mut c = contract(1);
    at("owner.test", 0, H0);
    c.set_resolution_config(Some(U64(2880)), Some(U64(2880)), None, None, Some(U128(10 * NEAR)), Some(3), None, None);
    let cfg = c.get_config();
    assert_eq!((cfg.vote_window, cfg.dispute_window, cfg.vote_bond.0, cfg.min_voters), (2880, 2880, 10 * NEAR, 3));
    assert_eq!(cfg.winner_claim_priority, 5); // left as it was
}
