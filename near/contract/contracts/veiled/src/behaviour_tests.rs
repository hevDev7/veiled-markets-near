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
pub(crate) const H0: u64 = 1000;
pub(crate) const NEAR: u128 = 1_000_000; // one token in micro units

pub(crate) fn acct(name: &str) -> AccountId {
    name.parse().unwrap()
}

/// Sets who is calling, what they attach (micro units) and the virtual height.
pub(crate) fn at(who: &str, attached_micro: u128, height: u64) {
    let mut b = VMContextBuilder::new();
    b.current_account_id(acct("veiled.test"))
        .predecessor_account_id(acct(who))
        .signer_account_id(acct(who))
        .attached_deposit(NearToken::from_yoctonear(attached_micro * YOCTO_PER_MICRO))
        .account_balance(NearToken::from_near(100_000))
        .block_timestamp(height * TICK_MS_T * 1_000_000);
    testing_env!(b.build());
}

pub(crate) fn config(min_voters: u8) -> Config {
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

pub(crate) fn contract(min_voters: u8) -> Veiled {
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
pub(crate) fn open_market(c: &mut Veiled, liquidity: u128, outcomes: u8, ticks: u64, resolution_gap: u64) -> u64 {
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
pub(crate) fn spend(kind: u8, asset: u64, sub: u8, out_amount: u128, action: Action) -> Spent {
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

pub(crate) fn buy(c: &mut Veiled, market: u64, outcome: u8, amount: u128, height: u64) -> u128 {
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

/// Votes outcome 1 with one bonded voter and finalizes. The vote window closes at H0 + 24 and the dispute window
/// at H0 + 27: both are fixed when the vote opens, whenever the finalize call comes.
fn vote_and_finalize(c: &mut Veiled, id: u64) {
    at("bob.test", NEAR, H0 + 21);
    c.vote_outcome(U64(id), 1, None);
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
    c.vote_outcome(U64(id), 1, None); // window ends at H0 + 24 with one voter of the three required
    at("v2.test", NEAR, H0 + 30);
    c.vote_outcome(U64(id), 1, None); // a late vote opens a new window: H0 + 30 + 3
    assert_eq!(c.get_market(U64(id)).unwrap().tally.unwrap().voting_deadline.0, H0 + 33);
    at("v3.test", NEAR, H0 + 31);
    c.vote_outcome(U64(id), 1, None);
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

pub(crate) fn open_turbo(c: &mut Veiled, duration: u64) -> u64 {
    at("oracle.test", 0, H0);
    c.create_turbo_market(1, U64(H0 + duration), U128(70_000_000_000), U128(0), U64(H0)).0
}

pub(crate) fn turbo_bet(c: &mut Veiled, id: u64, height: u64) -> u128 {
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
    c.vote_outcome(U64(id), 1, None);
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

// ---------------------------------------------------------------------------------------- settlement without a keeper
//
// Every stage after the vote follows from the clock: nobody has to call finalize, confirm or cancel. Whoever
// touches the market next (a redeem, a refund, a bond claim, a dispute) settles it first, and the views show the
// settled state before anyone does.

pub(crate) fn vote(c: &mut Veiled, who: &str, id: u64, outcome: u8, height: u64) {
    at(who, NEAR, height);
    c.vote_outcome(U64(id), outcome, None);
}

fn redeem(c: &mut Veiled, market: u64, outcome: u8, shares: u128, height: u64) -> u128 {
    at("relayer.test", 0, height);
    c.act_market(&spend(KIND_SHARE, market, outcome, shares, Action::Redeem)).unwrap().amount
}

/// The market as the views show it at `height`.
pub(crate) fn market_at(c: &Veiled, id: u64, height: u64) -> markets::MarketView {
    at("viewer.test", 0, height);
    c.get_market(U64(id)).unwrap()
}

/// NEAR (micro units) the calls since the last `at` sent to `who`.
pub(crate) fn sent_to(who: &str) -> u128 {
    near_sdk::test_utils::get_created_receipts()
        .iter()
        .filter(|r| r.receiver_id.as_str() == who)
        .flat_map(|r| r.actions.iter())
        .map(|a| match a {
            near_sdk::mock::MockAction::Transfer { deposit, .. } => deposit.as_yoctonear() / YOCTO_PER_MICRO,
            _ => 0,
        })
        .sum()
}

/// Alice's 10 NEAR market (trading ends at H0 + 20, resolution deadline H0 + 120) with 20 NEAR bought on outcome 1
/// at H0 + 1. Returns (market, outcome-1 shares).
pub(crate) fn traded_market(c: &mut Veiled) -> (u64, u128) {
    let id = open_market(c, 10 * NEAR, 2, 20, 100);
    let shares = buy(c, id, 1, 20 * NEAR, H0 + 1);
    (id, shares)
}

#[test]
fn the_dispute_deadline_is_fixed_when_the_vote_opens() {
    let mut c = contract(1);
    let (id, _) = traded_market(&mut c);
    vote(&mut c, "bob.test", id, 1, H0 + 21);
    let t = market_at(&c, id, H0 + 22).tally.unwrap();
    // vote window 3 ticks, dispute window 3 ticks after it
    assert_eq!((t.voting_deadline.0, t.dispute_deadline.0), (H0 + 24, H0 + 27));
    // A late finalize call does not move it.
    at("carol.test", 0, H0 + 26);
    c.finalize_votes(U64(id));
    assert_eq!(market_at(&c, id, H0 + 26).tally.unwrap().dispute_deadline.0, H0 + 27);
}

#[test]
fn the_views_show_each_stage_before_anyone_calls_finalize_or_confirm() {
    let mut c = contract(1);
    let (id, _) = traded_market(&mut c);
    vote(&mut c, "bob.test", id, 1, H0 + 21);
    assert_eq!(market_at(&c, id, H0 + 24).status, markets::STATUS_PENDING_RESOLUTION); // voting open
    let m = market_at(&c, id, H0 + 25);
    assert_eq!((m.status, m.tally.unwrap().winning_outcome), (markets::STATUS_PENDING_FINALIZATION, 1));
    let m = market_at(&c, id, H0 + 28);
    let t = m.tally.unwrap();
    assert_eq!((m.status, t.winning_outcome, t.finalized), (markets::STATUS_RESOLVED, 1, true));
}

#[test]
fn the_first_redeem_settles_a_market_nobody_finalized() {
    let mut c = contract(1);
    let (id, shares) = traded_market(&mut c);
    vote(&mut c, "bob.test", id, 1, H0 + 21);
    assert_eq!(redeem(&mut c, id, 1, shares, H0 + 28), shares);
    at("carol.test", 0, H0 + 28);
    assert_eq!(c.settle_market(U64(id)), markets::STATUS_RESOLVED);
}

#[test]
#[should_panic(expected = "ERR_STATUS")]
fn a_redeem_inside_the_dispute_window_is_refused() {
    let mut c = contract(1);
    let (id, shares) = traded_market(&mut c);
    vote(&mut c, "bob.test", id, 1, H0 + 21);
    redeem(&mut c, id, 1, shares, H0 + 27);
}

#[test]
fn a_dispute_is_taken_once_voting_closes_without_a_finalize_call() {
    let mut c = contract(1);
    let (id, _) = traded_market(&mut c);
    vote(&mut c, "bob.test", id, 1, H0 + 21);
    at("carol.test", 3 * NEAR, H0 + 26); // 3 × the 1 NEAR bonded
    c.dispute_resolution(U64(id), 2);
    assert_eq!(market_at(&c, id, H0 + 26).status, markets::STATUS_DISPUTED);
}

#[test]
#[should_panic(expected = "ERR_STATUS")]
fn a_dispute_after_the_dispute_window_is_refused() {
    let mut c = contract(1);
    let (id, _) = traded_market(&mut c);
    vote(&mut c, "bob.test", id, 1, H0 + 21);
    at("carol.test", 3 * NEAR, H0 + 28);
    c.dispute_resolution(U64(id), 2);
}

/// Bob votes outcome 1 first, dave agrees, erin votes outcome 2.
fn three_voters(c: &mut Veiled, id: u64) {
    vote(c, "bob.test", id, 1, H0 + 21);
    vote(c, "dave.test", id, 1, H0 + 22);
    vote(c, "erin.test", id, 2, H0 + 23);
}

#[test]
fn the_first_correct_voter_is_paid_bond_and_reward_by_the_settling_call() {
    let mut c = contract(1);
    let (id, shares) = traded_market(&mut c);
    three_voters(&mut c, id);
    // The market earned 100_000 in protocol fees (0.5% of 20 NEAR); half of that is the resolver's reward.
    assert_eq!(market_at(&c, id, H0 + 22).resolver_reward.0, 50_000);
    redeem(&mut c, id, 1, shares, H0 + 28);
    assert_eq!(sent_to("bob.test"), NEAR + 50_000);
    assert_eq!(sent_to("dave.test"), 0); // the second voter claims their bond back as before
    let m = market_at(&c, id, H0 + 28);
    assert_eq!(m.resolver.as_str(), "bob.test");
    assert!(c.get_vote(U64(id), acct("bob.test")).unwrap().claimed);
    // fees 100_000 + erin's slashed bond − bob's reward
    assert_eq!(c.get_treasury()[1].0, 100_000 + NEAR - 50_000);
}

#[test]
fn the_resolver_is_paid_only_once() {
    let mut c = contract(1);
    let (id, shares) = traded_market(&mut c);
    three_voters(&mut c, id);
    redeem(&mut c, id, 1, shares / 2, H0 + 28);
    redeem(&mut c, id, 1, shares - shares / 2, H0 + 29);
    assert_eq!(sent_to("bob.test"), 0);
    assert_eq!(c.get_treasury()[1].0, 100_000 + NEAR - 50_000);
}

#[test]
fn a_resolver_claiming_their_bond_settles_the_market_and_gets_the_reward() {
    let mut c = contract(1);
    let (id, _) = traded_market(&mut c);
    three_voters(&mut c, id);
    at("bob.test", 0, H0 + 28);
    assert_eq!(c.claim_voter_bond(U64(id)).0, NEAR + 50_000);
    assert_eq!(sent_to("bob.test"), NEAR + 50_000);
    at("dave.test", 0, H0 + 28);
    assert_eq!(c.claim_voter_bond(U64(id)).0, NEAR);
}

#[test]
#[should_panic(expected = "ERR_CLAIMED")]
fn a_paid_resolver_cannot_claim_the_bond_again() {
    let mut c = contract(1);
    let (id, shares) = traded_market(&mut c);
    three_voters(&mut c, id);
    redeem(&mut c, id, 1, shares, H0 + 28);
    at("bob.test", 0, H0 + 29);
    c.claim_voter_bond(U64(id));
}

#[test]
fn the_owner_sets_the_resolver_share_of_protocol_fees() {
    let mut c = contract(1);
    let (id, shares) = traded_market(&mut c);
    at("owner.test", 0, H0 + 2);
    c.set_resolver_reward_bps(2000);
    assert_eq!(c.get_resolver_reward_bps(), 2000);
    three_voters(&mut c, id);
    redeem(&mut c, id, 1, shares, H0 + 28);
    assert_eq!(sent_to("bob.test"), NEAR + 20_000);
}

#[test]
#[should_panic(expected = "ERR_OWNER")]
fn only_the_owner_sets_the_resolver_reward() {
    let mut c = contract(1);
    at("mallory.test", 0, H0);
    c.set_resolver_reward_bps(10_000);
}

#[test]
#[should_panic(expected = "ERR_VALUE")]
fn the_resolver_reward_cannot_exceed_the_protocol_fees() {
    let mut c = contract(1);
    at("owner.test", 0, H0);
    c.set_resolver_reward_bps(10_001);
}

#[test]
fn a_market_nobody_voted_on_refunds_once_its_resolution_deadline_passes() {
    let mut c = contract(1);
    let (id, shares) = traded_market(&mut c);
    assert_eq!(market_at(&c, id, H0 + 120).status, markets::STATUS_ACTIVE);
    assert_eq!(market_at(&c, id, H0 + 121).status, markets::STATUS_CANCELLED);
    // 20 NEAR less 0.5% protocol and 0.5% creator fee went into the pool for these shares
    assert_eq!(refund(&mut c, id, 1, shares, H0 + 121), 19_800_000);
}

#[test]
fn a_vote_still_open_at_the_resolution_deadline_is_counted_not_cancelled() {
    let mut c = contract(1);
    let id = open_market(&mut c, 10 * NEAR, 2, 20, 9); // resolution deadline H0 + 29
    vote(&mut c, "bob.test", id, 1, H0 + 29); // the window runs to H0 + 32
    assert_eq!(market_at(&c, id, H0 + 31).status, markets::STATUS_PENDING_RESOLUTION);
    assert_eq!(market_at(&c, id, H0 + 33).status, markets::STATUS_PENDING_FINALIZATION);
}

#[test]
#[should_panic(expected = "ERR_CANNOT_CANCEL")]
fn an_open_vote_cannot_be_cancelled_after_the_resolution_deadline() {
    let mut c = contract(1);
    let id = open_market(&mut c, 10 * NEAR, 2, 20, 9);
    vote(&mut c, "bob.test", id, 1, H0 + 29);
    at("mallory.test", 0, H0 + 31);
    c.cancel_market(U64(id));
}

#[test]
fn a_vote_short_of_its_quorum_at_the_resolution_deadline_ends_in_a_refund() {
    let mut c = contract(2);
    let (id, shares) = traded_market(&mut c);
    vote(&mut c, "bob.test", id, 1, H0 + 21);
    assert_eq!(market_at(&c, id, H0 + 120).status, markets::STATUS_PENDING_RESOLUTION);
    assert_eq!(refund(&mut c, id, 1, shares, H0 + 121), 19_800_000);
    at("bob.test", 0, H0 + 121);
    assert_eq!(c.claim_voter_bond(U64(id)).0, NEAR);
}

/// 5 NEAR buys outcome 2 at H0 + 2; after trading closes bob votes outcome 1 and carol disputes it for outcome 2
/// at H0 + 26. Returns (market, the outcome-2 shares).
fn disputed(c: &mut Veiled) -> (u64, u128) {
    let id = open_market(c, 10 * NEAR, 2, 20, 100);
    let shares_2 = buy(c, id, 2, 5 * NEAR, H0 + 2);
    vote(c, "bob.test", id, 1, H0 + 21);
    at("carol.test", 3 * NEAR, H0 + 26);
    c.dispute_resolution(U64(id), 2);
    (id, shares_2)
}

#[test]
fn a_dispute_nobody_decides_is_cancelled_by_its_time_limit() {
    let mut c = contract(1);
    let (id, _) = disputed(&mut c);
    // disputed_timeout is 40 ticks: H0 + 26 + 40
    assert_eq!(market_at(&c, id, H0 + 66).status, markets::STATUS_DISPUTED);
    assert_eq!(market_at(&c, id, H0 + 67).status, markets::STATUS_CANCELLED);
    at("carol.test", 0, H0 + 67);
    assert_eq!(c.claim_dispute_bond(U64(id)).0, 3 * NEAR);
    at("bob.test", 0, H0 + 67);
    assert_eq!(c.claim_voter_bond(U64(id)).0, NEAR);
}

fn committee_decides(c: &mut Veiled, id: u64, outcome: u8, height: u64) {
    at("carol.test", 0, height);
    c.initiate_escalation(U64(id));
    for i in 1..=3 {
        at(&format!("c{i}.test"), 0, height);
        c.committee_vote_resolve(U64(id), outcome);
    }
    at("carol.test", 0, height);
    c.finalize_committee_vote(U64(id));
}

#[test]
fn a_committee_decision_applies_without_a_governance_resolve_call() {
    let mut c = contract(1);
    let (id, shares_2) = disputed(&mut c);
    committee_decides(&mut c, id, 2, H0 + 30);
    let m = market_at(&c, id, H0 + 30);
    assert_eq!((m.status, m.tally.unwrap().winning_outcome), (markets::STATUS_RESOLVED, 2));
    assert_eq!(redeem(&mut c, id, 2, shares_2, H0 + 31), shares_2);
    // Nobody voted outcome 2, so the disputer who proposed it is the resolver: the settling call paid back their
    // 3 NEAR bond plus half of the 25_000 protocol fee the 5 NEAR buy paid.
    assert_eq!(sent_to("carol.test"), 3 * NEAR + 12_500);
    // The view shows the dispute bond as paid, so the app does not offer a claim that would fail.
    assert!(market_at(&c, id, H0 + 32).dispute.unwrap().bond_claimed);
}

#[test]
#[should_panic(expected = "ERR_CLAIMED")]
fn a_paid_disputer_cannot_claim_the_bond_again() {
    let mut c = contract(1);
    let (id, shares_2) = disputed(&mut c);
    committee_decides(&mut c, id, 2, H0 + 30);
    redeem(&mut c, id, 2, shares_2, H0 + 31);
    at("carol.test", 0, H0 + 32);
    c.claim_dispute_bond(U64(id));
}

#[test]
#[should_panic(expected = "ERR_STATUS")]
fn the_committee_cannot_vote_after_the_dispute_time_limit() {
    let mut c = contract(1);
    let (id, _) = disputed(&mut c);
    at("carol.test", 0, H0 + 30);
    c.initiate_escalation(U64(id));
    at("c1.test", 0, H0 + 67);
    c.committee_vote_resolve(U64(id), 2);
}

#[test]
fn a_parlay_settles_on_legs_nobody_finalized() {
    let mut c = contract(1);
    let (a, b) = two_markets_and_a_pool(&mut c);
    approve_leg(&mut c, a);
    approve_leg(&mut c, b);
    parlay(&mut c, &[a, b], NEAR / 5, H0 + 1);
    vote(&mut c, "bob.test", a, 1, H0 + 21);
    vote(&mut c, "bob.test", b, 1, H0 + 21);
    at("carol.test", 0, H0 + 28);
    assert_eq!(c.settle_parlay(U64(1)), parlay::PARLAY_WON);
    // Settling the parlay settled its legs: bob, who resolved both, got his bonds back in that call.
    assert_eq!(sent_to("bob.test"), 2 * NEAR);
}

#[test]
fn a_vote_can_carry_a_link_to_its_evidence() {
    let mut c = contract(1);
    let (id, _) = traded_market(&mut c);
    at("ai.test", NEAR, H0 + 21);
    c.vote_outcome(U64(id), 1, Some("https://veiledmarkets.xyz/r/1#sha256=ab12".into()));
    let logs = near_sdk::test_utils::get_logs();
    assert!(logs.iter().any(|l| l.contains("\"vote_evidence\"") && l.contains("sha256=ab12")), "{logs:?}");
    let stored = c.get_vote_evidence(U64(id), acct("ai.test"));
    assert_eq!(stored.as_deref(), Some("https://veiledmarkets.xyz/r/1#sha256=ab12"));
    assert_eq!(c.get_vote_evidence(U64(id), acct("bob.test")), None);
}

#[test]
#[should_panic(expected = "ERR_EVIDENCE_LEN")]
fn vote_evidence_is_kept_short() {
    let mut c = contract(1);
    let (id, _) = traded_market(&mut c);
    at("ai.test", NEAR, H0 + 21);
    c.vote_outcome(U64(id), 1, Some("x".repeat(301)));
}

#[test]
fn the_view_names_the_first_voter_of_the_leading_outcome() {
    let mut c = contract(1);
    let (id, _) = traded_market(&mut c);
    three_voters(&mut c, id);
    assert_eq!(market_at(&c, id, H0 + 23).proposer.unwrap().as_str(), "bob.test");
}
