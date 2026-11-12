//! Turbo UP/DOWN rounds with live proofs: oracle opens, private bets, oracle resolves, private claims.

use integration_tests::*;
use serde_json::{json, Value};

const SK: &str = "7654321";
const BTC: u8 = 1;
const PRICE: u128 = 60_000_000_000; // $60,000 with 6 decimals

async fn open(env: &Env, by: &near_workspaces::Account, ticks: u64, conf: u128) -> anyhow::Result<near_workspaces::result::ExecutionFinalResult> {
    let h = height(env).await?;
    call(
        env,
        by,
        "create_turbo_market",
        json!({ "symbol_id": BTC, "deadline": s(h + ticks), "baseline_price": s(PRICE), "baseline_conf": s(conf), "baseline_block": s(h) }),
        0,
    )
    .await
}

async fn turbo(env: &Env, id: u64) -> anyhow::Result<Value> {
    view(env, "get_turbo_market", json!({ "market_id": s(id) })).await
}

async fn resolve(env: &Env, id: u64, price: u128) -> anyhow::Result<near_workspaces::result::ExecutionFinalResult> {
    let t = turbo(env, id).await?;
    call(
        env,
        &env.oracle,
        "resolve_turbo_market",
        json!({ "market_id": s(id), "closing_price": s(price), "closing_conf": "0", "closing_block": t["deadline"] }),
        0,
    )
    .await
}

#[tokio::test]
async fn turbo_round_pays_winners_the_whole_pool() -> anyhow::Result<()> {
    let env = setup(None).await?;
    let mut w = Wallet::new(SK);
    assert_fails_with(&open(&env, &env.alice, 20, 0).await?, "ERR_NOT_ORACLE");
    assert_fails_with(&open(&env, &env.oracle, 20, PRICE / 100).await?, "ERR_CONFIDENCE");
    assert_fails_with(&open(&env, &env.oracle, 5, 0).await?, "ERR_DURATION");
    let r = open(&env, &env.oracle, 20, 1_000).await?;
    assert!(r.is_success(), "{:?}", r.failures());
    let id: u64 = r.clone().json::<String>()?.parse()?;
    assert_eq!(view(&env, "get_latest_turbo", json!({ "symbol_id": BTC })).await?["id"], s(id));

    let bal = w.deposit(&env, &env.alice, 3_000_000).await?;
    let up = w.spend(&env, &[&bal], 1_000_000, json!({ "type": "turbo_buy", "market_id": s(id), "side": 1 })).await?;
    assert!(up.result.is_success(), "{:?}", up.result.failures());
    println!("transact (turbo buy) gas: {:.1} TGas", tgas(&up.result));
    let up_note = up.minted.unwrap();
    assert_eq!((up_note.kind, up_note.asset, up_note.sub, up_note.amount), (4, id, 1, 995_000));
    let down = w
        .spend(&env, &[&up.change.unwrap()], 500_000, json!({ "type": "turbo_buy", "market_id": s(id), "side": 2 }))
        .await?;
    assert!(down.result.is_success(), "{:?}", down.result.failures());
    let down_note = down.minted.unwrap();
    let bal = down.change.unwrap();
    let t = turbo(&env, id).await?;
    assert_eq!((u(&t["total_up_amount"]), u(&t["total_down_amount"])), (995_000, 497_500));
    assert_eq!(u(&t["total_up_claim_units"]), 1_990_000);

    // A turbo note cannot be withdrawn or sold as if it were a balance or share note.
    let wd = w.spend(&env, &[&up_note], 1, json!({ "type": "withdraw", "recipient": env.bob.id() })).await?;
    assert_fails_with(&wd.result, "ERR_NOTE_KIND");
    // Claims wait for the oracle.
    let early = w.spend(&env, &[&up_note], up_note.amount, json!({ "type": "turbo_claim" })).await?;
    assert_fails_with(&early.result, "ERR_STATUS");

    advance(&env, 21).await?;
    let late = w.spend(&env, &[&bal], 1000, json!({ "type": "turbo_buy", "market_id": s(id), "side": 1 })).await?;
    assert_fails_with(&late.result, "ERR_DEADLINE");
    assert_fails_with(&resolve(&env, id, PRICE * 2).await?, "ERR_PRICE_MOVE");
    let r = resolve(&env, id, PRICE + 1).await?;
    assert!(r.is_success(), "{:?}", r.failures());
    let t = turbo(&env, id).await?;
    assert_eq!((t["status"].as_u64(), t["winning_outcome"].as_u64()), (Some(2), Some(1)));

    let lose = w.spend(&env, &[&down_note], down_note.amount, json!({ "type": "turbo_claim" })).await?;
    assert_fails_with(&lose.result, "ERR_NOT_WINNER");
    let win = w.spend(&env, &[&up_note], up_note.amount, json!({ "type": "turbo_claim" })).await?;
    assert!(win.result.is_success(), "{:?}", win.result.failures());
    assert_eq!(win.minted.unwrap().amount, 995_000 + 497_500);
    assert_eq!(view(&env, "get_turbo_exposure", json!({})).await?, "0");
    let treasury: Value = view(&env, "get_treasury", json!({})).await?;
    assert_eq!(u(&treasury[1]), 5_000 + 2_500);
    Ok(())
}

#[tokio::test]
async fn turbo_round_without_winners_refunds_everyone() -> anyhow::Result<()> {
    let env = setup(None).await?;
    let mut w = Wallet::new(SK);
    let id: u64 = open(&env, &env.oracle, 20, 0).await?.json::<String>()?.parse()?;
    let bal = w.deposit(&env, &env.alice, 1_000_000).await?;
    let down = w.spend(&env, &[&bal], 200_000, json!({ "type": "turbo_buy", "market_id": s(id), "side": 2 })).await?;
    let down_note = down.minted.unwrap();
    advance(&env, 21).await?;
    // Price went up but nobody bet UP: the round is cancelled, not swallowed.
    assert!(resolve(&env, id, PRICE + 5).await?.is_success());
    assert_eq!(turbo(&env, id).await?["status"], 3);
    let refund = w.spend(&env, &[&down_note], down_note.amount, json!({ "type": "turbo_claim" })).await?;
    assert!(refund.result.is_success(), "{:?}", refund.result.failures());
    assert_eq!(refund.minted.unwrap().amount, 199_000);
    Ok(())
}

#[tokio::test]
async fn empty_finished_rounds_are_pruned_traded_ones_stay() -> anyhow::Result<()> {
    let env = setup(None).await?;
    let mut w = Wallet::new(SK);
    let traded: u64 = open(&env, &env.oracle, 20, 0).await?.json::<String>()?.parse()?;
    let empty: u64 = open(&env, &env.oracle, 20, 0).await?.json::<String>()?.parse()?;
    let bal = w.deposit(&env, &env.alice, 1_000_000).await?;
    let bet = w.spend(&env, &[&bal], 200_000, json!({ "type": "turbo_buy", "market_id": s(traded), "side": 1 })).await?;
    assert!(bet.result.is_success(), "{:?}", bet.result.failures());
    let note = bet.minted.unwrap();
    // Only rounds that got a bet are indexed.
    assert_eq!(view(&env, "get_turbo_count", json!({})).await?, "1");
    let listed: Value = view(&env, "get_turbo_markets", json!({ "from": "0", "limit": 10 })).await?;
    assert_eq!(listed.as_array().unwrap().len(), 1);
    assert_eq!(listed[0]["id"], s(traded));

    let both = json!({ "market_ids": [s(traded), s(empty)] });
    assert_fails_with(&call(&env, &env.alice, "prune_turbo", both.clone(), 0).await?, "ERR_NOT_ORACLE");
    // Active rounds stay.
    assert_eq!(call(&env, &env.oracle, "prune_turbo", both.clone(), 0).await?.json::<u32>()?, 0);
    advance(&env, 21).await?;
    assert!(resolve(&env, traded, PRICE + 1).await?.is_success());
    assert!(resolve(&env, empty, PRICE + 1).await?.is_success());
    // `empty` is still BTC's latest round and `traded` has a bet: nothing goes.
    assert_eq!(call(&env, &env.oracle, "prune_turbo", both.clone(), 0).await?.json::<u32>()?, 0);
    assert!(open(&env, &env.oracle, 20, 0).await?.is_success());
    assert_eq!(call(&env, &env.oracle, "prune_turbo", both.clone(), 0).await?.json::<u32>()?, 1);
    assert!(turbo(&env, empty).await?.is_null());
    // The traded round still pays out.
    let claim = w.spend(&env, &[&note], note.amount, json!({ "type": "turbo_claim" })).await?;
    assert!(claim.result.is_success(), "{:?}", claim.result.failures());
    assert_eq!(claim.minted.unwrap().amount, 199_000);
    Ok(())
}

#[tokio::test]
async fn turbo_bets_stop_in_the_last_fifth_of_a_round() -> anyhow::Result<()> {
    let env = setup(None).await?;
    let mut w = Wallet::new(SK);
    let r = open(&env, &env.oracle, 900, 0).await?;
    assert!(r.is_success(), "{:?}", r.failures());
    let id: u64 = r.clone().json::<String>()?.parse()?;
    let t = turbo(&env, id).await?;
    let (deadline, betting_deadline) = (u(&t["deadline"]) as u64, u(&t["betting_deadline"]) as u64);
    // A 900-tick round takes bets for its first 720 ticks.
    assert_eq!(deadline - betting_deadline, 180);

    let bal = w.deposit(&env, &env.alice, 3_000_000).await?;
    let early = w.spend(&env, &[&bal], 1_000_000, json!({ "type": "turbo_buy", "market_id": s(id), "side": 1 })).await?;
    assert!(early.result.is_success(), "{:?}", early.result.failures());

    // The sandbox clock moves in coarse steps: go most of the way at once, then creep past the betting deadline.
    advance(&env, 550).await?;
    while height(&env).await? < betting_deadline {
        advance(&env, 10).await?;
    }
    assert!(height(&env).await? < deadline, "the round must still be open for this check");
    let late = w
        .spend(&env, &[&early.change.unwrap()], 1_000_000, json!({ "type": "turbo_buy", "market_id": s(id), "side": 1 }))
        .await?;
    assert_fails_with(&late.result, "ERR_BETTING_CLOSED");
    Ok(())
}
