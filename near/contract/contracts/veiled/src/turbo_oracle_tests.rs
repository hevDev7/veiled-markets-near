//! Turbo rounds priced by a Pyth-compatible contract (pyth-oracle.*, OutLayer price-oracle.near) instead of
//! the oracle operator. Callbacks are called the way the runtime calls them, with the oracle's answer.

use crate::behaviour_tests::*;
use crate::turbo_oracle::{to_micro, PythPrice};
use crate::*;
use near_sdk::json_types::I64;
use near_sdk::mock::MockAction;
use near_sdk::test_utils::{get_created_receipts, get_logs};
use near_sdk::PromiseError;

const BTC_FEED: &str = "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43";
const PRICE_ORACLE: &str = "pyth-oracle.test";
/// Turbo heights are 4-second ticks: height h starts at unix second 4h.
const SECS_PER_TICK: i64 = 4;

fn logged(event: &str) -> bool {
    get_logs().iter().any(|l| l.starts_with("EVENT_JSON:") && l.contains(&format!("\"event\":\"{event}\"")))
}

/// A contract whose BTC (symbol 1) prices come from the price oracle, with a 10-second close window.
fn with_btc_feed() -> Veiled {
    let mut c = contract(1);
    at("owner.test", 0, H0);
    c.set_turbo_oracle(acct(PRICE_ORACLE), 10);
    c.set_turbo_feed(1, BTC_FEED.into());
    c
}

/// A Pyth price with expo -8 (BTC/USD): `usd_e8` is the price in 1e-8 USD.
fn pyth(usd_e8: i64, conf_e8: u64, publish_time: i64) -> Result<Option<PythPrice>, PromiseError> {
    Ok(Some(PythPrice { price: I64(usd_e8), conf: U64(conf_e8), expo: -8, publish_time }))
}

/// The oracle answered the baseline request at H0 with $60,000 published two seconds earlier.
fn oracle_round(c: &mut Veiled, duration: u64) -> u64 {
    at("veiled.test", 0, H0);
    c.on_turbo_baseline(1, U64(H0 + duration), acct("oracle.test"), pyth(6_000_000_000_000, 0, H0 as i64 * 4 - 2)).0
}

fn bet(c: &mut Veiled, id: u64, side: u8, height: u64) {
    at("relayer.test", 0, height);
    let action = Action::TurboBuy { market_id: U64(id), side };
    c.act_market(&spend(KIND_BALANCE, TOKEN_NEAR as u64, 0, NEAR, action)).unwrap();
}

/// A call from `who` at block time `unix_secs` (`at` only reaches every fourth second).
fn at_second(who: &str, unix_secs: u64) {
    let mut b = near_sdk::test_utils::VMContextBuilder::new();
    b.current_account_id(acct("veiled.test"))
        .predecessor_account_id(acct(who))
        .signer_account_id(acct(who))
        .account_balance(NearToken::from_near(100_000))
        .block_timestamp(unix_secs * 1_000_000_000);
    near_sdk::testing_env!(b.build());
}

/// The single function call the last call sent to `to`: (method, JSON args).
fn call_to(to: &str) -> (String, serde_json::Value) {
    let calls: Vec<_> = get_created_receipts()
        .into_iter()
        .filter(|r| r.receiver_id.as_str() == to)
        .flat_map(|r| r.actions)
        .filter_map(|a| match a {
            MockAction::FunctionCallWeight { method_name, args, .. } => {
                Some((String::from_utf8(method_name).unwrap(), serde_json::from_slice(&args).unwrap()))
            }
            _ => None,
        })
        .collect();
    assert_eq!(calls.len(), 1, "{calls:?}");
    calls.into_iter().next().unwrap()
}

// ---------------------------------------------------------------------------------------- configuration

#[test]
fn the_owner_points_turbo_at_a_price_oracle() {
    let c = with_btc_feed();
    assert!(logged("turbo_oracle_set") && logged("turbo_feed_set"));
    let v = c.get_turbo_oracle();
    assert_eq!(v.oracle.as_ref().map(|a| a.as_str()), Some(PRICE_ORACLE));
    assert_eq!(v.close_window_secs, 10);
    assert_eq!(v.feeds.len(), 1);
    assert_eq!((v.feeds[0].symbol_id, v.feeds[0].feed_id.as_str()), (1, BTC_FEED));
}

#[test]
fn without_a_price_oracle_the_view_is_empty() {
    let c = contract(1);
    let v = c.get_turbo_oracle();
    assert!(v.oracle.is_none() && v.feeds.is_empty());
}

#[test]
#[should_panic(expected = "ERR_OWNER")]
fn only_the_owner_sets_the_price_oracle() {
    let mut c = contract(1);
    at("oracle.test", 0, H0);
    c.set_turbo_oracle(acct(PRICE_ORACLE), 10);
}

#[test]
#[should_panic(expected = "ERR_VALUE")]
fn a_zero_close_window_is_refused() {
    let mut c = contract(1);
    at("owner.test", 0, H0);
    c.set_turbo_oracle(acct(PRICE_ORACLE), 0);
}

#[test]
#[should_panic(expected = "ERR_VALUE")]
fn a_close_window_under_ten_seconds_is_refused() {
    // Shorter than a keeper's push-then-read, a window lets a losing bettor store a later price first and so
    // force a refund.
    let mut c = contract(1);
    at("owner.test", 0, H0);
    c.set_turbo_oracle(acct(PRICE_ORACLE), 9);
}

#[test]
#[should_panic(expected = "ERR_VALUE")]
fn a_close_window_above_five_minutes_is_refused() {
    let mut c = contract(1);
    at("owner.test", 0, H0);
    c.set_turbo_oracle(acct(PRICE_ORACLE), 301);
}

#[test]
#[should_panic(expected = "ERR_NO_PRICE_ORACLE")]
fn a_feed_needs_the_price_oracle_first() {
    let mut c = contract(1);
    at("owner.test", 0, H0);
    c.set_turbo_feed(1, BTC_FEED.into());
}

#[test]
#[should_panic(expected = "ERR_OWNER")]
fn only_the_owner_sets_a_feed() {
    let mut c = with_btc_feed();
    at("oracle.test", 0, H0);
    c.set_turbo_feed(2, BTC_FEED.into());
}

#[test]
#[should_panic(expected = "ERR_FEED_ID")]
fn a_feed_id_must_be_64_hex_characters() {
    let mut c = with_btc_feed();
    at("owner.test", 0, H0);
    c.set_turbo_feed(2, BTC_FEED[..62].into());
}

#[test]
#[should_panic(expected = "ERR_FEED_ID")]
fn a_feed_id_with_a_non_hex_character_is_refused() {
    let mut c = with_btc_feed();
    at("owner.test", 0, H0);
    c.set_turbo_feed(2, format!("{}zz", &BTC_FEED[..62]));
}

#[test]
#[should_panic(expected = "ERR_SYMBOL")]
fn a_feed_for_an_unknown_symbol_is_refused() {
    let mut c = with_btc_feed();
    at("owner.test", 0, H0);
    c.set_turbo_feed(11, BTC_FEED.into());
}

#[test]
fn a_feed_is_replaced_in_place() {
    let mut c = with_btc_feed();
    at("owner.test", 0, H0);
    let other = "ff".repeat(32);
    c.set_turbo_feed(1, other.to_uppercase());
    let v = c.get_turbo_oracle();
    assert_eq!(v.feeds.len(), 1);
    assert_eq!(v.feeds[0].feed_id, other); // stored and shown in lower case
}

// ---------------------------------------------------------------------------------------- the operator's prices

#[test]
#[should_panic(expected = "ERR_ORACLE_FEED")]
fn the_operator_cannot_price_a_symbol_that_has_a_feed() {
    let mut c = with_btc_feed();
    open_turbo(&mut c, 75); // symbol 1, operator baseline
}

#[test]
fn symbols_without_a_feed_keep_the_operator_prices() {
    let mut c = with_btc_feed();
    at("oracle.test", 0, H0);
    let id = c.create_turbo_market(2, U64(H0 + 75), U128(3_000_000_000), U128(0), U64(H0)).0;
    assert!(c.get_turbo_market(U64(id)).is_some());
}

#[test]
#[should_panic(expected = "ERR_ORACLE_FEED")]
fn a_round_opened_before_the_feed_closes_from_the_oracle_too() {
    let mut c = contract(1);
    let id = open_turbo(&mut c, 75);
    at("owner.test", 0, H0 + 1);
    c.set_turbo_oracle(acct(PRICE_ORACLE), 10);
    c.set_turbo_feed(1, BTC_FEED.into());
    at("oracle.test", 0, H0 + 75);
    c.resolve_turbo_market(U64(id), U128(71_000_000_000), U128(0), U64(H0 + 75));
}

// ---------------------------------------------------------------------------------------- opening a round

#[test]
fn opening_a_round_asks_the_oracle_for_a_price_at_most_a_minute_old() {
    let c = with_btc_feed();
    at("oracle.test", 0, H0);
    let _ = c.open_turbo_round(1, U64(H0 + 75));
    let (method, args) = call_to(PRICE_ORACLE);
    assert_eq!(method, "get_price_no_older_than");
    assert_eq!(args, serde_json::json!({ "price_id": BTC_FEED, "age": 60 }));
    let (method, args) = call_to("veiled.test");
    assert_eq!(method, "on_turbo_baseline");
    assert_eq!(args, serde_json::json!({ "symbol_id": 1, "deadline": (H0 + 75).to_string(), "creator": "oracle.test" }));
}

#[test]
#[should_panic(expected = "ERR_NOT_ORACLE")]
fn only_the_operator_opens_oracle_rounds() {
    let c = with_btc_feed();
    at("mallory.test", 0, H0);
    let _ = c.open_turbo_round(1, U64(H0 + 75));
}

#[test]
#[should_panic(expected = "ERR_NO_FEED")]
fn an_oracle_round_needs_a_feed_for_its_symbol() {
    let c = with_btc_feed();
    at("oracle.test", 0, H0);
    let _ = c.open_turbo_round(2, U64(H0 + 75));
}

#[test]
#[should_panic(expected = "ERR_DURATION")]
fn an_oracle_round_checks_its_duration_before_asking() {
    let c = with_btc_feed();
    at("oracle.test", 0, H0);
    let _ = c.open_turbo_round(1, U64(H0 + 10));
}

#[test]
#[should_panic(expected = "ERR_PAUSED")]
fn no_oracle_round_opens_while_paused() {
    let mut c = with_btc_feed();
    at("owner.test", 0, H0);
    c.set_governance_value(6, U128(1));
    at("oracle.test", 0, H0);
    let _ = c.open_turbo_round(1, U64(H0 + 75));
}

#[test]
fn the_baseline_is_the_oracle_price_in_micro_dollars() {
    let mut c = with_btc_feed();
    at("veiled.test", 0, H0);
    // $60,001.23456789 ± $123.45678: expo -8 → micro-USD drops the last two digits.
    let publish = H0 as i64 * SECS_PER_TICK - 2;
    let id = c.on_turbo_baseline(1, U64(H0 + 75), acct("oracle.test"), pyth(6_000_123_456_789, 12_345_678_000, publish)).0;
    assert!(logged("turbo_created"));
    let t = c.get_turbo_market(U64(id)).unwrap();
    assert_eq!((t.baseline_price.0, t.baseline_conf.0), (60_001_234_567, 123_456_780));
    // Published 2 s before H0 began: tick H0 - 1.
    assert_eq!((t.baseline_block.0, t.created_at.0, t.deadline.0), (H0 - 1, H0, H0 + 75));
    assert_eq!(t.creator.as_str(), "oracle.test");
    assert_eq!(c.get_latest_turbo(1).unwrap().id.0, id);
}

#[test]
#[should_panic(expected = "ERR_NO_PRICE")]
fn no_round_opens_when_the_oracle_has_no_fresh_price() {
    let mut c = with_btc_feed();
    at("veiled.test", 0, H0);
    c.on_turbo_baseline(1, U64(H0 + 75), acct("oracle.test"), Ok(None));
}

#[test]
#[should_panic(expected = "ERR_ORACLE_CALL")]
fn no_round_opens_when_the_oracle_call_fails() {
    let mut c = with_btc_feed();
    at("veiled.test", 0, H0);
    c.on_turbo_baseline(1, U64(H0 + 75), acct("oracle.test"), Err(PromiseError::Failed));
}

#[test]
#[should_panic(expected = "ERR_PRICE")]
fn a_negative_oracle_price_is_refused() {
    let mut c = with_btc_feed();
    at("veiled.test", 0, H0);
    c.on_turbo_baseline(1, U64(H0 + 75), acct("oracle.test"), pyth(-1, 0, H0 as i64 * 4));
}

#[test]
#[should_panic(expected = "ERR_CONFIDENCE")]
fn a_baseline_with_a_wide_confidence_interval_is_refused() {
    let mut c = with_btc_feed();
    at("veiled.test", 0, H0);
    // conf above 0.5% of the price
    c.on_turbo_baseline(1, U64(H0 + 75), acct("oracle.test"), pyth(6_000_000_000_000, 30_000_000_100, H0 as i64 * 4));
}

#[test]
#[should_panic(expected = "ERR_DURATION")]
fn the_callback_checks_the_duration_again() {
    let mut c = with_btc_feed();
    // The answer came back at H0 + 61: a deadline of H0 + 75 leaves 14 ticks, under the 15-tick minimum.
    at("veiled.test", 0, H0 + 61);
    c.on_turbo_baseline(1, U64(H0 + 75), acct("oracle.test"), pyth(6_000_000_000_000, 0, (H0 as i64 + 61) * 4));
}

// ---------------------------------------------------------------------------------------- settling a round

#[test]
fn settling_asks_the_oracle_for_its_latest_price() {
    let mut c = with_btc_feed();
    let id = oracle_round(&mut c, 75);
    at("anyone.test", 0, H0 + 75);
    let _ = c.settle_turbo_round(U64(id));
    let (method, args) = call_to(PRICE_ORACLE);
    assert_eq!(method, "get_price_unsafe");
    assert_eq!(args, serde_json::json!({ "price_identifier": BTC_FEED }));
    let (method, args) = call_to("veiled.test");
    assert_eq!(method, "on_turbo_close");
    assert_eq!(args, serde_json::json!({ "market_id": id.to_string() }));
}

#[test]
#[should_panic(expected = "ERR_NOT_ENDED")]
fn a_round_cannot_settle_before_its_deadline() {
    let mut c = with_btc_feed();
    let id = oracle_round(&mut c, 75);
    at("anyone.test", 0, H0 + 74);
    let _ = c.settle_turbo_round(U64(id));
}

#[test]
fn a_round_settles_until_the_last_second_of_its_close_window() {
    let mut c = with_btc_feed();
    let id = oracle_round(&mut c, 75);
    // The deadline tick starts at second 4 × (H0 + 75); the window is 10 s.
    at_second("anyone.test", (H0 + 75) * 4 + 10);
    let _ = c.settle_turbo_round(U64(id));
    assert_eq!(call_to(PRICE_ORACLE).0, "get_price_unsafe");
}

#[test]
#[should_panic(expected = "ERR_RESOLUTION_WINDOW")]
fn a_round_does_not_settle_once_its_close_window_has_passed() {
    // Pyth takes any verified update newer than the stored one, however old: a settle after the window could
    // push the window's most convenient price. A round missed this way is only refunded.
    let mut c = with_btc_feed();
    let id = oracle_round(&mut c, 75);
    at_second("anyone.test", (H0 + 75) * 4 + 11);
    let _ = c.settle_turbo_round(U64(id));
}

#[test]
#[should_panic(expected = "ERR_NO_FEED")]
fn a_round_of_a_symbol_without_a_feed_does_not_settle_from_the_oracle() {
    let mut c = with_btc_feed();
    at("oracle.test", 0, H0);
    let id = c.create_turbo_market(2, U64(H0 + 75), U128(3_000_000_000), U128(0), U64(H0)).0;
    at("anyone.test", 0, H0 + 75);
    let _ = c.settle_turbo_round(U64(id));
}

#[test]
fn the_close_is_the_oracle_price_published_inside_the_window() {
    let mut c = with_btc_feed();
    let id = oracle_round(&mut c, 75);
    bet(&mut c, id, turbo::UP, H0 + 10);
    bet(&mut c, id, turbo::DOWN, H0 + 11);
    // The deadline tick starts at second 4 × (H0 + 75); the window is 10 s, both ends included.
    let end = (H0 as i64 + 75) * SECS_PER_TICK;
    at("veiled.test", 0, H0 + 78);
    let status = c.on_turbo_close(U64(id), pyth(6_000_100_000_000, 0, end + 10));
    assert_eq!(status, turbo::TURBO_RESOLVED);
    assert!(logged("turbo_resolved"));
    let t = c.get_turbo_market(U64(id)).unwrap();
    assert_eq!((t.closing_price.0, t.winning_outcome), (60_001_000_000, turbo::UP));
    assert_eq!(t.closing_block.0, H0 + 77); // second end + 10 is in tick H0 + 77
}

#[test]
fn a_close_equal_to_the_baseline_is_down() {
    let mut c = with_btc_feed();
    let id = oracle_round(&mut c, 75);
    bet(&mut c, id, turbo::DOWN, H0 + 10);
    let end = (H0 as i64 + 75) * SECS_PER_TICK;
    at("veiled.test", 0, H0 + 76);
    assert_eq!(c.on_turbo_close(U64(id), pyth(6_000_000_000_000, 0, end)), turbo::TURBO_RESOLVED);
    assert_eq!(c.get_turbo_market(U64(id)).unwrap().winning_outcome, turbo::DOWN);
}

#[test]
fn a_close_with_no_winning_stake_cancels_the_round() {
    let mut c = with_btc_feed();
    let id = oracle_round(&mut c, 75);
    bet(&mut c, id, turbo::UP, H0 + 10);
    let end = (H0 as i64 + 75) * SECS_PER_TICK;
    at("veiled.test", 0, H0 + 76);
    assert_eq!(c.on_turbo_close(U64(id), pyth(5_999_000_000_000, 0, end + 1)), turbo::TURBO_CANCELLED);
}

#[test]
#[should_panic(expected = "ERR_PRICE_TOO_EARLY")]
fn a_price_published_before_the_deadline_is_refused() {
    let mut c = with_btc_feed();
    let id = oracle_round(&mut c, 75);
    let end = (H0 as i64 + 75) * SECS_PER_TICK;
    at("veiled.test", 0, H0 + 76);
    c.on_turbo_close(U64(id), pyth(6_000_100_000_000, 0, end - 1));
}

#[test]
#[should_panic(expected = "ERR_PRICE_TOO_LATE")]
fn a_price_published_after_the_window_is_refused() {
    let mut c = with_btc_feed();
    let id = oracle_round(&mut c, 75);
    let end = (H0 as i64 + 75) * SECS_PER_TICK;
    at("veiled.test", 0, H0 + 80);
    c.on_turbo_close(U64(id), pyth(6_000_100_000_000, 0, end + 11));
}

#[test]
#[should_panic(expected = "ERR_STATUS")]
fn a_settled_round_is_not_settled_again() {
    let mut c = with_btc_feed();
    let id = oracle_round(&mut c, 75);
    bet(&mut c, id, turbo::UP, H0 + 10);
    let end = (H0 as i64 + 75) * SECS_PER_TICK;
    at("veiled.test", 0, H0 + 76);
    c.on_turbo_close(U64(id), pyth(6_000_100_000_000, 0, end));
    c.on_turbo_close(U64(id), pyth(5_000_000_000_000, 0, end + 1));
}

#[test]
#[should_panic(expected = "ERR_PRICE_MOVE")]
fn a_close_more_than_half_away_from_the_baseline_is_refused() {
    let mut c = with_btc_feed();
    let id = oracle_round(&mut c, 75);
    let end = (H0 as i64 + 75) * SECS_PER_TICK;
    at("veiled.test", 0, H0 + 76);
    c.on_turbo_close(U64(id), pyth(9_000_100_000_000, 0, end));
}

#[test]
#[should_panic(expected = "ERR_NO_PRICE")]
fn a_round_does_not_settle_without_an_oracle_price() {
    let mut c = with_btc_feed();
    let id = oracle_round(&mut c, 75);
    at("veiled.test", 0, H0 + 76);
    c.on_turbo_close(U64(id), Ok(None));
}

// ---------------------------------------------------------------------------------------- units

#[test]
fn oracle_prices_convert_to_micro_dollars() {
    assert_eq!(to_micro(6_000_123_456_789, -8), Some(60_001_234_567)); // BTC, expo -8: floor
    assert_eq!(to_micro(123_456, -6), Some(123_456));
    assert_eq!(to_micro(5, 0), Some(5_000_000));
    assert_eq!(to_micro(7, 2), Some(700_000_000));
    assert_eq!(to_micro(1, -7), Some(0));
    assert_eq!(to_micro(0, -8), None);
    assert_eq!(to_micro(-5, -8), None);
    assert_eq!(to_micro(i64::MAX, 20), None);
}
