//! Sandbox stand-in for Pyth's NEAR receiver (pyth-oracle.near): the view methods the Veiled contract calls, with
//! the same argument names and JSON shapes, but prices are set directly by a test instead of arriving as verified
//! Wormhole updates. Never deploy it to a network.

use near_sdk::json_types::{I64, U64};
use near_sdk::store::LookupMap;
use near_sdk::{env, near};

/// Pyth's `Price`: `price × 10^expo` USD, published at unix second `publish_time`.
#[near(serializers = [json])]
pub struct Price {
    pub price: I64,
    pub conf: U64,
    pub expo: i32,
    pub publish_time: i64,
}

#[near(serializers = [borsh])]
#[derive(Clone)]
struct Stored {
    price: i64,
    conf: u64,
    expo: i32,
    publish_time: i64,
}

impl From<&Stored> for Price {
    fn from(s: &Stored) -> Self {
        Price { price: I64(s.price), conf: U64(s.conf), expo: s.expo, publish_time: s.publish_time }
    }
}

#[near(contract_state)]
pub struct MockPyth {
    prices: LookupMap<String, Stored>,
}

impl Default for MockPyth {
    fn default() -> Self {
        Self { prices: LookupMap::new(b"p".to_vec()) }
    }
}

#[near]
impl MockPyth {
    /// Test only: replaces the latest price of a feed (feed id in hex).
    pub fn set_price(&mut self, price_identifier: String, price: Price) {
        let stored =
            Stored { price: price.price.0, conf: price.conf.0, expo: price.expo, publish_time: price.publish_time };
        self.prices.insert(price_identifier.to_lowercase(), stored);
    }

    pub fn get_price_unsafe(&self, price_identifier: String) -> Option<Price> {
        self.prices.get(&price_identifier.to_lowercase()).map(Price::from)
    }

    /// As Pyth: nothing when the publish time is more than `age` seconds away from the block time, either way.
    pub fn get_price_no_older_than(&self, price_id: String, age: u64) -> Option<Price> {
        let now = env::block_timestamp() / 1_000_000_000;
        self.prices
            .get(&price_id.to_lowercase())
            .filter(|p| now.abs_diff(p.publish_time.max(0) as u64) <= age)
            .map(Price::from)
    }
}
