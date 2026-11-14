//! Turbo rounds priced by a Pyth-compatible contract instead of the operator. The price contract is the sandbox
//! stand-in in contracts/mock-pyth (Pyth's view names and JSON shapes; the test sets its prices).

use integration_tests::*;
use near_workspaces::Contract;
use serde_json::{json, Value};

const SK: &str = "1357911";
const BTC: u8 = 1;
const FEED: &str = "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43";
/// $60,000 with Pyth's expo -8.
const PRICE_E8: i64 = 6_000_000_000_000;
/// Close window in seconds: long enough for several sandbox transactions after a fast-forward, which can
/// overshoot the deadline by a tick or more (a round settles only while its window is open in block time).
const WINDOW: i64 = 60;

async fn price_contract(env: &Env) -> anyhow::Result<Contract> {
    let acct = account(&env.root, "pyth", 20).await?;
    Ok(acct.deploy(&mock_pyth_wasm()?).await?.into_result()?)
}

/// Points BTC rounds at the price contract with a WINDOW-second close window.
async fn configure(env: &Env, pyth: &Contract) -> anyhow::Result<()> {
    let r = call(env, &env.root, "set_turbo_oracle", json!({ "oracle": pyth.id(), "close_window_secs": WINDOW }), 0).await?;
    assert!(r.is_success(), "{:?}", r.failures());
    let r = call(env, &env.root, "set_turbo_feed", json!({ "symbol_id": BTC, "feed_id": FEED }), 0).await?;
    assert!(r.is_success(), "{:?}", r.failures());
    Ok(())
}

async fn set_price(env: &Env, pyth: &Contract, usd_e8: i64, publish_time: i64) -> anyhow::Result<()> {
    let price = json!({ "price": usd_e8.to_string(), "conf": "0", "expo": -8, "publish_time": publish_time });
    let r = env.root.call(pyth.id(), "set_price").args_json(json!({ "price_identifier": FEED, "price": price })).transact().await?;
    assert!(r.is_success(), "{:?}", r.failures());
    Ok(())
}

async fn now_secs(env: &Env) -> anyhow::Result<i64> {
    Ok((env.worker.view_block().await?.timestamp() / 1_000_000_000) as i64)
}

/// The operator opens a BTC round ending `ticks` from now; returns the transaction.
async fn open(env: &Env, ticks: u64) -> anyhow::Result<near_workspaces::result::ExecutionFinalResult> {
    let h = height(env).await?;
    call(env, &env.oracle, "open_turbo_round", json!({ "symbol_id": BTC, "deadline": s(h + ticks) }), 0).await
}

async fn turbo(env: &Env, id: u64) -> anyhow::Result<Value> {
    view(env, "get_turbo_market", json!({ "market_id": s(id) })).await
}

/// Unix second at which the round's deadline tick starts.
fn deadline_secs(t: &Value) -> i64 {
    t["deadline"].as_str().unwrap().parse::<i64>().unwrap() * 4
}

async fn settle(env: &Env, id: u64) -> anyhow::Result<near_workspaces::result::ExecutionFinalResult> {
    call(env, &env.carol, "settle_turbo_round", json!({ "market_id": s(id) }), 0).await
}

#[tokio::test]
async fn a_round_opens_and_settles_from_the_price_contract() -> anyhow::Result<()> {
    let env = setup(None).await?;
    let pyth = price_contract(&env).await?;
    configure(&env, &pyth).await?;
    assert_eq!(view(&env, "get_turbo_oracle", json!({})).await?["feeds"][0]["feed_id"], FEED);

    set_price(&env, &pyth, PRICE_E8, now_secs(&env).await?).await?;
    let r = open(&env, 20).await?;
    assert!(r.is_success(), "{:?}", r.failures());
    println!("open_turbo_round gas: {:.1} TGas", tgas(&r));
    let id: u64 = r.json::<String>()?.parse()?;
    let t = turbo(&env, id).await?;
    assert_eq!((t["baseline_price"].as_str(), t["creator"].as_str()), (Some("60000000000"), Some(env.oracle.id().as_str())));
    // The operator can no longer price BTC itself.
    let h = height(&env).await?;
    let legacy = call(
        &env,
        &env.oracle,
        "create_turbo_market",
        json!({ "symbol_id": BTC, "deadline": s(h + 20), "baseline_price": "60000000000", "baseline_conf": "0", "baseline_block": s(h) }),
        0,
    )
    .await?;
    assert_fails_with(&legacy, "ERR_ORACLE_FEED");

    // One private UP bet, then the round ends.
    let mut w = Wallet::new(SK);
    let bal = w.deposit(&env, &env.alice, 2_000_000).await?;
    let up = w.spend(&env, &[&bal], 1_000_000, json!({ "type": "turbo_buy", "market_id": s(id), "side": 1 })).await?;
    assert!(up.result.is_success(), "{:?}", up.result.failures());
    assert_fails_with(&settle(&env, id).await?, "ERR_NOT_ENDED");
    advance(&env, 20).await?;

    // $60,100 published 3 s into the deadline tick: UP wins.
    set_price(&env, &pyth, 6_010_000_000_000, deadline_secs(&t) + 3).await?;
    let r = settle(&env, id).await?;
    assert!(r.is_success(), "{:?}", r.failures());
    println!("settle_turbo_round gas: {:.1} TGas", tgas(&r));
    assert_eq!(r.json::<u8>()?, 2);
    let t = turbo(&env, id).await?;
    assert_eq!((t["closing_price"].as_str(), t["winning_outcome"].as_u64()), (Some("60100000000"), Some(1)));
    assert_fails_with(&settle(&env, id).await?, "ERR_STATUS");

    // The winning note claims the whole pool.
    let claim = w.spend(&env, &[&up.minted.unwrap()], 995_000, json!({ "type": "turbo_claim" })).await?;
    assert!(claim.result.is_success(), "{:?}", claim.result.failures());
    assert_eq!(claim.minted.unwrap().amount, 995_000);
    Ok(())
}

#[tokio::test]
async fn only_a_price_published_inside_the_close_window_settles_a_round() -> anyhow::Result<()> {
    let env = setup(None).await?;
    let pyth = price_contract(&env).await?;
    configure(&env, &pyth).await?;
    set_price(&env, &pyth, PRICE_E8, now_secs(&env).await?).await?;
    let id: u64 = open(&env, 20).await?.json::<String>()?.parse()?;
    let t = turbo(&env, id).await?;
    advance(&env, 20).await?;

    // The latest price is from before the deadline: nothing changes, and the call can be made again later.
    set_price(&env, &pyth, 6_010_000_000_000, deadline_secs(&t) - 1).await?;
    assert_fails_with(&settle(&env, id).await?, "ERR_PRICE_TOO_EARLY");
    set_price(&env, &pyth, 6_010_000_000_000, deadline_secs(&t) + WINDOW + 1).await?;
    assert_fails_with(&settle(&env, id).await?, "ERR_PRICE_TOO_LATE");
    assert_eq!(turbo(&env, id).await?["status"], 1);

    // The last second of the window still counts. Nobody bet, so the round is cancelled.
    set_price(&env, &pyth, 6_010_000_000_000, deadline_secs(&t) + WINDOW).await?;
    let r = settle(&env, id).await?;
    assert!(r.is_success(), "{:?}", r.failures());
    assert_eq!(r.json::<u8>()?, 3);
    Ok(())
}

#[tokio::test]
async fn a_round_missed_in_its_close_window_is_only_refunded() -> anyhow::Result<()> {
    let env = setup(None).await?;
    let pyth = price_contract(&env).await?;
    configure(&env, &pyth).await?;
    set_price(&env, &pyth, PRICE_E8, now_secs(&env).await?).await?;
    let id: u64 = open(&env, 20).await?.json::<String>()?.parse()?;
    let t = turbo(&env, id).await?;

    // Nobody settles before the window has passed in block time ...
    advance(&env, 20 + 16).await?;
    assert!(now_secs(&env).await? > deadline_secs(&t) + WINDOW);
    // ... so a price from inside the window, stored only now, can no longer be picked to settle the round.
    set_price(&env, &pyth, 6_010_000_000_000, deadline_secs(&t) + 5).await?;
    assert_fails_with(&settle(&env, id).await?, "ERR_RESOLUTION_WINDOW");
    assert_eq!(turbo(&env, id).await?["status"], 1);

    // The operator refunds it once the resolution deadline (300 ticks after the deadline) has passed.
    advance(&env, 300).await?;
    let r = call(&env, &env.oracle, "emergency_cancel_turbo", json!({ "market_id": s(id) }), 0).await?;
    assert!(r.is_success(), "{:?}", r.failures());
    assert_eq!(turbo(&env, id).await?["status"], 3);
    Ok(())
}

#[tokio::test]
async fn no_round_opens_without_a_fresh_price() -> anyhow::Result<()> {
    let env = setup(None).await?;
    let pyth = price_contract(&env).await?;
    configure(&env, &pyth).await?;
    set_price(&env, &pyth, PRICE_E8, now_secs(&env).await? - 120).await?;
    assert_fails_with(&open(&env, 20).await?, "ERR_NO_PRICE");
    assert_eq!(view(&env, "get_latest_turbo", json!({ "symbol_id": BTC })).await?, Value::Null);
    Ok(())
}

#[tokio::test]
async fn only_the_contract_calls_its_price_callbacks() -> anyhow::Result<()> {
    let env = setup(None).await?;
    // Called directly, a callback would have no oracle answer to read; it refuses before that.
    for (method, args) in [
        ("on_turbo_baseline", json!({ "symbol_id": BTC, "deadline": "999999999", "creator": env.carol.id() })),
        ("on_turbo_close", json!({ "market_id": "1" })),
    ] {
        assert_fails_with(&call(&env, &env.carol, method, args, 0).await?, "is private");
    }
    Ok(())
}
