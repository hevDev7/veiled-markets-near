//! In-place upgrade: state written by the previously deployed build must stay readable and usable after the
//! code is replaced without an init call (near/scripts/upgrade-testnet.sh).
//!
//! Needs the previous build: VEILED_WASM_OLD=<path to the wasm that is live>. Without it the test is skipped.

use integration_tests::*;
use serde_json::{json, Value};

const SK: &str = "424242";
const NEAR: u128 = 1_000_000;

fn fast_config() -> Value {
    json!({
        "vote_window": 3, "dispute_window": 3, "winner_claim_priority": 3, "disputed_timeout": 40,
        "vote_bond": "1000000", "min_voters": 1, "dispute_bond_multiplier": 3,
        "min_trade": "1000", "min_liquidity": "10000",
        "protocol_fee_bps": "50", "creator_fee_bps": "50", "lp_fee_bps": "100", "committee_quorum": 3
    })
}

async fn create(env: &Env, w: &mut Wallet, ticks: u64) -> anyhow::Result<u64> {
    let h = height(env).await?;
    let lp_blinding = w.fresh();
    let r = call(
        env,
        &env.alice,
        "create_market",
        json!({ "args": {
            "question_hash": "q", "category": 3, "num_outcomes": 2,
            "deadline": s(h + ticks), "resolution_deadline": s(h + ticks + 500),
            "metadata": "{}", "lp_owner_blind": w.owner_blind(lp_blinding), "lp_memo": ""
        }}),
        10 * NEAR,
    )
    .await?;
    assert!(r.is_success(), "{:?}", r.failures());
    Ok(r.json::<String>()?.parse()?)
}

async fn market(env: &Env, id: u64) -> anyhow::Result<Value> {
    view(env, "get_market", json!({ "market_id": s(id) })).await
}

#[tokio::test]
async fn state_written_by_the_previous_build_survives_the_upgrade() -> anyhow::Result<()> {
    let Ok(old) = std::env::var("VEILED_WASM_OLD") else {
        eprintln!("skipped: set VEILED_WASM_OLD to the wasm of the build that is live");
        return Ok(());
    };
    let new_wasm = veiled_wasm()?;
    // The harness deploys whatever VEILED_WASM names: the previous build first.
    unsafe { std::env::set_var("VEILED_WASM", &old) };
    let env = setup(Some(fast_config())).await?;
    unsafe { std::env::remove_var("VEILED_WASM") };
    let mut w = Wallet::new(SK);

    // ---- state from the previous build: two markets, a position, a parlay ticket, a turbo round with a bet.
    let a = create(&env, &mut w, 60).await?;
    let b = create(&env, &mut w, 60).await?;
    let bal = w.deposit(&env, &env.alice, 9 * NEAR).await?;
    let buy = w
        .spend(&env, &[&bal], 2 * NEAR, json!({ "type": "buy", "market_id": s(a), "outcome": 1, "min_shares_out": "0" }))
        .await?;
    assert!(buy.result.is_success(), "{:?}", buy.result.failures());
    let shares = buy.minted.unwrap();
    let bal = buy.change.unwrap();
    assert!(call(&env, &env.root, "fund_parlay_pool", json!({ "token": 1 }), 20 * NEAR).await?.is_success());
    let legs = json!([{ "market_id": s(a), "outcome": 1 }, { "market_id": s(b), "outcome": 1 }]);
    let ticket = w.spend(&env, &[&bal], NEAR / 2, json!({ "type": "parlay_buy", "legs": legs, "min_payout": "0" })).await?;
    assert!(ticket.result.is_success(), "{:?}", ticket.result.failures());
    let ticket_note = ticket.minted.unwrap();
    let bal = ticket.change.unwrap();
    let h = height(&env).await?;
    let turbo = call(
        &env,
        &env.oracle,
        "create_turbo_market",
        json!({ "symbol_id": 1, "deadline": s(h + 200), "baseline_price": "60000000000", "baseline_conf": "0", "baseline_block": s(h) }),
        0,
    )
    .await?;
    assert!(turbo.is_success(), "{:?}", turbo.failures());
    let turbo_id: u64 = turbo.json::<String>()?.parse()?;
    let bet = w.spend(&env, &[&bal], NEAR, json!({ "type": "turbo_buy", "market_id": s(turbo_id), "side": 1 })).await?;
    assert!(bet.result.is_success(), "{:?}", bet.result.failures());
    let bal = bet.change.unwrap();

    let before = market(&env, a).await?;
    let credits_before = view(&env, "get_program_credits", json!({})).await?;
    let tree_before = view(&env, "get_tree_info", json!({})).await?;
    let pool_before = view(&env, "get_parlay_pool", json!({})).await?;

    // ---- the upgrade: new code, same account, no init call.
    env.veiled.as_account().deploy(&new_wasm).await?.into_result()?;

    // ---- everything the previous build wrote reads back unchanged.
    let after = market(&env, a).await?;
    for field in ["reserves", "market_credits", "trader_collateral", "outcome_shares", "total_lp_shares", "status"] {
        assert_eq!(after[field], before[field], "{field}");
    }
    assert_eq!(view(&env, "get_program_credits", json!({})).await?, credits_before);
    assert_eq!(view(&env, "get_tree_info", json!({})).await?, tree_before);
    let pool_after = view(&env, "get_parlay_pool", json!({})).await?;
    assert_eq!((&pool_after["pool"], &pool_after["exposure"]), (&pool_before["pool"], &pool_before["exposure"]));
    assert_eq!(view(&env, "get_parlay", json!({ "parlay_id": "1" })).await?["status"], 1);
    assert_eq!(view(&env, "get_turbo_market", json!({ "market_id": s(turbo_id) })).await?["up_bets"], 1);
    // New fields take their defaults: no per-outcome ledger for the old market, not a parlay leg, 1% leg cap.
    assert_eq!(after["outcome_collateral"], Value::Null);
    assert_eq!(after["parlay_leg"], false);
    assert_eq!(pool_after["leg_payout_bps"], "100");

    // ---- the old notes still spend under the new code: a buy, a sell and a withdrawal.
    let buy2 = w
        .spend(&env, &[&bal], NEAR, json!({ "type": "buy", "market_id": s(a), "outcome": 2, "min_shares_out": "0" }))
        .await?;
    assert!(buy2.result.is_success(), "{:?}", buy2.result.failures());
    // The old market had shares outstanding, so it keeps the old refund rule (no ledger appears).
    assert_eq!(market(&env, a).await?["outcome_collateral"], Value::Null);
    let sell = w.spend(&env, &[&shares], shares.amount / 2, json!({ "type": "sell", "tokens_desired": "100000" })).await?;
    assert!(sell.result.is_success(), "{:?}", sell.result.failures());
    let shares = sell.change.unwrap();
    let out = w
        .spend(&env, &[&buy2.change.unwrap()], NEAR, json!({ "type": "withdraw", "recipient": env.bob.id() }))
        .await?;
    assert!(out.result.is_success(), "{:?}", out.result.failures());

    // ---- a market created after the upgrade has the ledger.
    let c = create(&env, &mut w, 60).await?;
    assert_eq!(market(&env, c).await?["outcome_collateral"], json!(["0", "0", "0", "0"]));

    // ---- the old market resolves and the old positions pay: shares redeem, the pre-upgrade ticket is claimed.
    advance(&env, 61).await?;
    for id in [a, b] {
        let r = call(&env, &env.bob, "vote_outcome", json!({ "market_id": s(id), "outcome": 1 }), NEAR).await?;
        assert!(r.is_success(), "{:?}", r.failures());
    }
    advance(&env, 4).await?;
    for id in [a, b] {
        assert!(call(&env, &env.carol, "finalize_votes", json!({ "market_id": s(id) }), 0).await?.is_success());
    }
    advance(&env, 4).await?;
    for id in [a, b] {
        assert!(call(&env, &env.carol, "confirm_resolution", json!({ "market_id": s(id) }), 0).await?.is_success());
    }
    let redeem = w.spend(&env, &[&shares], shares.amount, json!({ "type": "redeem" })).await?;
    assert!(redeem.result.is_success(), "{:?}", redeem.result.failures());
    assert_eq!(redeem.minted.unwrap().amount, shares.amount);
    let claim = w.spend(&env, &[&ticket_note], ticket_note.amount, json!({ "type": "parlay_claim" })).await?;
    assert!(claim.result.is_success(), "{:?}", claim.result.failures());
    Ok(())
}
