//! Turbo prices from a Pyth-compatible contract: Pyth's NEAR receiver (pyth-oracle.near / .testnet) or OutLayer's
//! price-oracle.near, which serves the same view methods. The owner names the contract, a close window and a
//! feed id per symbol. From then on that symbol's rounds open with the oracle's price (at most a minute old) as
//! the baseline, and anyone settles a round once its deadline passes, with the oracle's latest price if it was
//! published inside the close window that starts with the deadline tick. The operator can no longer give
//! prices for that symbol (a feed is replaced, never removed).
//!
//! Pyth on NEAR keeps only the latest price and anyone can push a newer one, however old, so the window bounds
//! two things. It must outlast the keeper's push and read (10 s at least, 20 s advised): otherwise a losing
//! bettor stores a price published after the window first and the round can never settle. And a round settles
//! only while its window is open in block time too, so nobody can wait and push the window's most convenient
//! price later; whoever settles first may still pick among the prices published so far. A round nobody settles
//! inside its window is refunded through `emergency_cancel_turbo`.

use crate::governance::log_event;
use crate::turbo::*;
use crate::*;
use near_sdk::json_types::I64;
use near_sdk::PromiseError;
use serde_json::json;

const KEY_ORACLE: &[u8] = b"ta";
const KEY_WINDOW: &[u8] = b"tw";
const KEY_FEED: &[u8] = b"tf";
/// A baseline is at most this old when the round opens (asked of the oracle with `get_price_no_older_than`).
pub const BASELINE_MAX_AGE_SECS: u64 = 60;
pub const MIN_CLOSE_WINDOW_SECS: u64 = 10;
pub const MAX_CLOSE_WINDOW_SECS: u64 = 300;
const GAS_ORACLE_VIEW: Gas = Gas::from_tgas(10);
const GAS_ON_PRICE: Gas = Gas::from_tgas(20);

/// Pyth's `Price` as the NEAR receiver returns it: `price × 10^expo` USD, published at unix second `publish_time`.
#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct PythPrice {
    pub price: I64,
    pub conf: U64,
    pub expo: i32,
    pub publish_time: i64,
}

#[near(serializers = [json])]
pub struct TurboFeedView {
    pub symbol_id: u8,
    pub feed_id: String,
}

#[near(serializers = [json])]
pub struct TurboOracleView {
    pub oracle: Option<AccountId>,
    pub close_window_secs: u64,
    pub feeds: Vec<TurboFeedView>,
}

fn feed_key(symbol_id: u8) -> Vec<u8> {
    [KEY_FEED, &[symbol_id]].concat()
}

/// The feed id configured for a symbol, if any.
pub(crate) fn turbo_feed(symbol_id: u8) -> Option<[u8; 32]> {
    env::storage_read(&feed_key(symbol_id)).and_then(|b| b.try_into().ok())
}

fn price_oracle() -> Option<AccountId> {
    env::storage_read(KEY_ORACLE).and_then(|b| String::from_utf8(b).ok()).and_then(|s| s.parse().ok())
}

fn close_window_secs() -> u64 {
    env::storage_read(KEY_WINDOW).and_then(|b| b.try_into().ok()).map(u64::from_le_bytes).unwrap_or(0)
}

fn feed_hex(feed: &[u8; 32]) -> String {
    feed.iter().map(|b| format!("{b:02x}")).collect()
}

/// 64 hex digits, either case.
fn parse_feed_id(s: &str) -> Option<[u8; 32]> {
    if s.len() != 64 || !s.bytes().all(|c| c.is_ascii_hexdigit()) {
        return None;
    }
    let mut out = [0u8; 32];
    for (i, b) in out.iter_mut().enumerate() {
        *b = u8::from_str_radix(&s[2 * i..2 * i + 2], 16).ok()?;
    }
    Some(out)
}

/// `value × 10^(expo + 6)`: an oracle amount in micro-USD, rounded down. None if it does not fit.
fn scale(value: u128, expo: i32) -> Option<u128> {
    let shift = expo.checked_add(6)?;
    if shift >= 0 {
        10u128.checked_pow(shift as u32)?.checked_mul(value)
    } else {
        Some(value / 10u128.checked_pow(shift.unsigned_abs())?)
    }
}

/// A positive oracle price in micro-USD.
pub(crate) fn to_micro(price: i64, expo: i32) -> Option<u128> {
    if price <= 0 {
        return None;
    }
    scale(price as u128, expo)
}

/// The virtual height (4-second tick) a unix second falls in.
fn tick_of(unix_secs: i64) -> u64 {
    (unix_secs.max(0) as u64).saturating_mul(1000) / TICK_MS
}

/// The unix second a round's close window opens: height h starts at second h × 4.
fn window_opens(deadline: u64) -> i64 {
    (deadline * TICK_MS / 1000) as i64
}

fn answer(r: Result<Option<PythPrice>, PromiseError>) -> PythPrice {
    match r {
        Ok(Some(p)) => p,
        Ok(None) => env::panic_str("ERR_NO_PRICE"),
        Err(_) => env::panic_str("ERR_ORACLE_CALL"),
    }
}

fn micro_price_and_conf(p: &PythPrice) -> (u128, u128) {
    let price = to_micro(p.price.0, p.expo).unwrap_or_else(|| env::panic_str("ERR_PRICE"));
    let conf = scale(p.conf.0 as u128, p.expo).unwrap_or_else(|| env::panic_str("ERR_CONFIDENCE"));
    (price, conf)
}

#[near]
impl Veiled {
    /// Owner only. The Pyth-compatible contract turbo prices come from, and how long after a round's deadline
    /// (in seconds, 10..=300) a published price still closes it and the round can still be settled.
    pub fn set_turbo_oracle(&mut self, oracle: AccountId, close_window_secs: u64) {
        self.assert_owner();
        require!((MIN_CLOSE_WINDOW_SECS..=MAX_CLOSE_WINDOW_SECS).contains(&close_window_secs), "ERR_VALUE");
        env::storage_write(KEY_ORACLE, oracle.as_bytes());
        env::storage_write(KEY_WINDOW, &close_window_secs.to_le_bytes());
        log_event("turbo_oracle_set", json!({ "oracle": oracle, "close_window_secs": close_window_secs }));
    }

    /// Owner only. The oracle's feed id (64 hex digits) for a symbol. From then on the symbol's prices come only
    /// from the oracle; a feed can be replaced but not removed.
    pub fn set_turbo_feed(&mut self, symbol_id: u8, feed_id: String) {
        self.assert_owner();
        require!(price_oracle().is_some(), "ERR_NO_PRICE_ORACLE");
        require!((1..=MAX_SYMBOL).contains(&symbol_id), "ERR_SYMBOL");
        let feed = parse_feed_id(&feed_id).unwrap_or_else(|| env::panic_str("ERR_FEED_ID"));
        env::storage_write(&feed_key(symbol_id), &feed);
        log_event("turbo_feed_set", json!({ "symbol_id": symbol_id, "feed_id": feed_hex(&feed) }));
    }

    /// Oracle operator only: opens a round on a symbol that has a feed, with the oracle's price as the baseline.
    /// The transaction returns the new market id.
    pub fn open_turbo_round(&self, symbol_id: u8, deadline: U64) -> Promise {
        let caller = env::predecessor_account_id();
        require!(caller == self.oracle, "ERR_NOT_ORACLE");
        require!(!self.paused, "ERR_PAUSED");
        let feed = turbo_feed(symbol_id).unwrap_or_else(|| env::panic_str("ERR_NO_FEED"));
        check_round_duration(self.height(), deadline.0);
        let oracle = price_oracle().unwrap_or_else(|| env::panic_str("ERR_NO_PRICE_ORACLE"));
        let args = json!({ "price_id": feed_hex(&feed), "age": BASELINE_MAX_AGE_SECS });
        Promise::new(oracle)
            .function_call(
                "get_price_no_older_than".to_string(),
                args.to_string().into_bytes(),
                NearToken::from_yoctonear(0),
                GAS_ORACLE_VIEW,
            )
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_ON_PRICE)
                    .on_turbo_baseline(symbol_id, deadline, caller),
            )
    }

    #[private]
    pub fn on_turbo_baseline(
        &mut self,
        symbol_id: u8,
        deadline: U64,
        creator: AccountId,
        #[callback_result] price: Result<Option<PythPrice>, PromiseError>,
    ) -> U64 {
        let p = answer(price);
        let (price, conf) = micro_price_and_conf(&p);
        // A price stamped a little ahead of the block clock counts as observed now.
        let base_block = tick_of(p.publish_time).min(self.height());
        U64(self.insert_turbo_round(creator, symbol_id, deadline.0, price, conf, base_block))
    }

    /// Anyone, from the round's deadline until its close window ends (block time). Settles the round with the
    /// oracle's latest price; the transaction fails (and can be retried inside the window) unless that price was
    /// published inside the close window.
    pub fn settle_turbo_round(&self, market_id: U64) -> Promise {
        let t = self.turbo.get(&market_id.0).unwrap_or_else(|| env::panic_str("ERR_NO_MARKET"));
        require!(t.status == TURBO_ACTIVE, "ERR_STATUS");
        require!(self.height() >= t.deadline, "ERR_NOT_ENDED");
        let feed = turbo_feed(t.symbol_id).unwrap_or_else(|| env::panic_str("ERR_NO_FEED"));
        let oracle = price_oracle().unwrap_or_else(|| env::panic_str("ERR_NO_PRICE_ORACLE"));
        let now = (env::block_timestamp_ms() / 1000) as i64;
        require!(now <= window_opens(t.deadline) + close_window_secs() as i64, "ERR_RESOLUTION_WINDOW");
        let args = json!({ "price_identifier": feed_hex(&feed) });
        Promise::new(oracle)
            .function_call(
                "get_price_unsafe".to_string(),
                args.to_string().into_bytes(),
                NearToken::from_yoctonear(0),
                GAS_ORACLE_VIEW,
            )
            .then(Self::ext(env::current_account_id()).with_static_gas(GAS_ON_PRICE).on_turbo_close(market_id))
    }

    #[private]
    pub fn on_turbo_close(
        &mut self,
        market_id: U64,
        #[callback_result] price: Result<Option<PythPrice>, PromiseError>,
    ) -> u8 {
        let p = answer(price);
        let deadline = self.turbo.get(&market_id.0).unwrap_or_else(|| env::panic_str("ERR_NO_MARKET")).deadline;
        let opens = window_opens(deadline);
        require!(p.publish_time >= opens, "ERR_PRICE_TOO_EARLY");
        require!(p.publish_time <= opens + close_window_secs() as i64, "ERR_PRICE_TOO_LATE");
        let (price, conf) = micro_price_and_conf(&p);
        self.close_turbo_round(market_id.0, price, conf, tick_of(p.publish_time))
    }

    pub fn get_turbo_oracle(&self) -> TurboOracleView {
        TurboOracleView {
            oracle: price_oracle(),
            close_window_secs: close_window_secs(),
            feeds: (1..=MAX_SYMBOL)
                .filter_map(|s| turbo_feed(s).map(|f| TurboFeedView { symbol_id: s, feed_id: feed_hex(&f) }))
                .collect(),
        }
    }
}
