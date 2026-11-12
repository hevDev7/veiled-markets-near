//! Parlays end to end with live proofs: pool funding, private placement priced from the FPMM pools,
//! trustless settlement from the leg markets (won / lost / cancelled), private claims, pool withdrawal,
//! and the owner's token-slot setter.

use integration_tests::*;
use serde_json::{json, Value};

const SK: &str = "5550123";
const NEAR: u128 = 1_000_000;

fn fast_config() -> Value {
    json!({
        "vote_window": 3, "dispute_window": 3, "winner_claim_priority": 40, "disputed_timeout": 40,
        "vote_bond": "1000000", "min_voters": 1, "dispute_bond_multiplier": 3,
        "min_trade": "1000", "min_liquidity": "10000",
        "protocol_fee_bps": "50", "creator_fee_bps": "50", "lp_fee_bps": "100", "committee_quorum": 3
    })
}

/// Alice creates a 2-outcome NEAR market; returns its id.
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
            "metadata": "{\"question\":\"Leg?\",\"outcomes\":[\"Yes\",\"No\"]}",
            "lp_owner_blind": w.owner_blind(lp_blinding), "lp_memo": ""
        }}),
        10 * NEAR,
    )
    .await?;
    assert!(r.is_success(), "{:?}", r.failures());
    Ok(r.json::<String>()?.parse()?)
}

fn legs(l: &[(u64, u8)]) -> Value {
    Value::Array(l.iter().map(|(m, o)| json!({ "market_id": s(m), "outcome": o })).collect())
}

fn buy(l: &[(u64, u8)], min_payout: u128) -> Value {
    json!({ "type": "parlay_buy", "legs": legs(l), "min_payout": s(min_payout) })
}

async fn parlay(env: &Env, id: u64) -> anyhow::Result<Value> {
    view(env, "get_parlay", json!({ "parlay_id": s(id) })).await
}

async fn pool(env: &Env) -> anyhow::Result<(u128, u128)> {
    let p = view(env, "get_parlay_pool", json!({})).await?;
    Ok((u(&p["pool"][1]), u(&p["exposure"][1])))
}

/// One bonded vote for `outcome`, then finalize and confirm (min_voters = 1).
async fn resolve(env: &Env, id: u64, outcome: u8) -> anyhow::Result<()> {
    let r = call(env, &env.bob, "vote_outcome", json!({ "market_id": s(id), "outcome": outcome }), NEAR).await?;
    assert!(r.is_success(), "{:?}", r.failures());
    advance(env, 4).await?;
    assert!(call(env, &env.carol, "finalize_votes", json!({ "market_id": s(id) }), 0).await?.is_success());
    advance(env, 4).await?;
    let r = call(env, &env.carol, "confirm_resolution", json!({ "market_id": s(id) }), 0).await?;
    assert!(r.is_success(), "{:?}", r.failures());
    Ok(())
}

#[tokio::test]
async fn parlays_win_lose_and_refund() -> anyhow::Result<()> {
    let env = setup(Some(fast_config())).await?;
    let mut w = Wallet::new(SK);
    let a = create(&env, &mut w, 90).await?;
    let b = create(&env, &mut w, 90).await?;
    let c = create(&env, &mut w, 90).await?;

    // The operator funds the NEAR pool; stablecoins would use ft_transfer_call instead.
    assert_fails_with(&call(&env, &env.root, "fund_parlay_pool", json!({ "token": 2 }), NEAR).await?, "ERR_TOKEN");
    let r = call(&env, &env.root, "fund_parlay_pool", json!({ "token": 1 }), 20 * NEAR).await?;
    assert!(r.is_success(), "{:?}", r.failures());
    assert_eq!(pool(&env).await?, (20 * NEAR, 0));

    // Even 2-outcome pools: each leg pays 2×, two legs 4×.
    let q = view(&env, "quote_parlay", json!({ "token": 1, "stake": s(NEAR), "legs": legs(&[(a, 1), (b, 1)]) })).await?;
    assert_eq!(q["leg_odds_bps"], json!(["20000", "20000"]));
    assert_eq!((u(&q["combined_odds_bps"]), u(&q["potential_payout"]), u(&q["fee_if_won"])), (40_000, 4 * NEAR, 80_000));

    let bal = w.deposit(&env, &env.alice, 9 * NEAR).await?;

    // Validation, each refused before anything is spent.
    let one = w.spend(&env, &[&bal], NEAR, buy(&[(a, 1)], 0)).await?;
    assert_fails_with(&one.result, "ERR_LEG_COUNT");
    let dup = w.spend(&env, &[&bal], NEAR, buy(&[(a, 1), (a, 2)], 0)).await?;
    assert_fails_with(&dup.result, "ERR_DUPLICATE_LEG");
    let small = w.spend(&env, &[&bal], 50_000, buy(&[(a, 1), (b, 1)], 0)).await?;
    assert_fails_with(&small.result, "ERR_MIN_STAKE");
    let greedy = w.spend(&env, &[&bal], NEAR, buy(&[(a, 1), (b, 1)], 4 * NEAR + 1)).await?;
    assert_fails_with(&greedy.result, "ERR_SLIPPAGE");
    // 4 NEAR at 8× owes 32 NEAR; 110% of that exceeds the 24 NEAR the pool would hold.
    let big = w.spend(&env, &[&bal], 4 * NEAR, buy(&[(a, 1), (b, 1), (c, 1)], 0)).await?;
    assert_fails_with(&big.result, "ERR_POOL_CAPACITY");

    // P1 wins (A=1, B=1), P2 loses (A=2), P3 is refunded (C is cancelled).
    let p1 = w.spend(&env, &[&bal], NEAR, buy(&[(a, 1), (b, 1)], 4 * NEAR)).await?;
    assert!(p1.result.is_success(), "{:?}", p1.result.failures());
    println!("transact (parlay_buy) gas: {:.1} TGas", tgas(&p1.result));
    let t1 = p1.minted.unwrap();
    assert_eq!((t1.kind, t1.asset, t1.sub, t1.amount), (5, 1, 0, 4 * NEAR));
    let bal = p1.change.unwrap();

    let p2 = w.spend(&env, &[&bal], NEAR / 2, buy(&[(a, 2), (b, 1)], 0)).await?;
    assert!(p2.result.is_success(), "{:?}", p2.result.failures());
    let t2 = p2.minted.unwrap();
    let bal = p2.change.unwrap();
    let p3 = w.spend(&env, &[&bal], NEAR / 2, buy(&[(a, 1), (c, 1)], 0)).await?;
    assert!(p3.result.is_success(), "{:?}", p3.result.failures());
    let t3 = p3.minted.unwrap();
    assert_eq!((t2.asset, t2.amount, t3.asset, t3.amount), (2, 2 * NEAR, 3, 2 * NEAR));
    assert_eq!(pool(&env).await?, (22 * NEAR, 8 * NEAR));
    assert_eq!(view(&env, "get_parlay_count", json!({})).await?, "3");
    let v = parlay(&env, 1).await?;
    assert_eq!((v["status"].as_u64(), v["settle_status"].as_u64(), v["num_legs"].as_u64()), (Some(1), Some(1), Some(2)));

    // Nothing is decided yet.
    let early = w.spend(&env, &[&t1], t1.amount, json!({ "type": "parlay_claim" })).await?;
    assert_fails_with(&early.result, "ERR_PARLAY_NOT_READY");
    assert_fails_with(&call(&env, &env.bob, "settle_parlay", json!({ "parlay_id": "1" }), 0).await?, "ERR_PARLAY_NOT_READY");

    // C is cancelled by its creator (no trades); P3 still waits for A, so the outcome cannot depend on timing.
    assert!(call(&env, &env.alice, "cancel_market", json!({ "market_id": s(c) }), 0).await?.is_success());
    assert_eq!(parlay(&env, 3).await?["legs"][1]["state"], 3);
    assert_fails_with(&call(&env, &env.bob, "settle_parlay", json!({ "parlay_id": "3" }), 0).await?, "ERR_PARLAY_NOT_READY");

    advance(&env, 91).await?;
    resolve(&env, a, 1).await?;
    // A is final and P2's leg on A lost: P2 settles as lost while B is still open.
    assert_eq!(parlay(&env, 2).await?["settle_status"], 3);
    let r = call(&env, &env.bob, "settle_parlay", json!({ "parlay_id": "2" }), 0).await?;
    assert!(r.is_success(), "{:?}", r.failures());
    assert_eq!(r.json::<u8>()?, 3);
    assert_eq!(pool(&env).await?, (22 * NEAR, 6 * NEAR));
    resolve(&env, b, 1).await?;

    // P1 won: 4 NEAR minus the 2% fee, into a private balance note.
    let c1 = w.spend(&env, &[&t1], t1.amount, json!({ "type": "parlay_claim" })).await?;
    assert!(c1.result.is_success(), "{:?}", c1.result.failures());
    let paid = c1.minted.unwrap();
    assert_eq!((paid.kind, paid.asset, paid.amount), (1, 1, 4 * NEAR - 80_000));
    let v = parlay(&env, 1).await?;
    assert_eq!((v["status"].as_u64(), v["claimed"].as_bool()), (Some(2), Some(true)));

    // P2 lost; P3 refunds its stake (A won, C cancelled).
    let c2 = w.spend(&env, &[&t2], t2.amount, json!({ "type": "parlay_claim" })).await?;
    assert_fails_with(&c2.result, "ERR_PARLAY_LOST");
    let partial = w.spend(&env, &[&t3], t3.amount - 1, json!({ "type": "parlay_claim" })).await?;
    assert_fails_with(&partial.result, "ERR_AMOUNT");
    let c3 = w.spend(&env, &[&t3], t3.amount, json!({ "type": "parlay_claim" })).await?;
    assert!(c3.result.is_success(), "{:?}", c3.result.failures());
    assert_eq!(c3.minted.unwrap().amount, NEAR / 2);
    assert_eq!(parlay(&env, 3).await?["status"], 4);

    // 20 funded + 2 staked − 4 paid (fee included) − 0.5 refunded; nothing is owed any more.
    assert_eq!(pool(&env).await?, (17_500_000, 0));
    let treasury = u(&view(&env, "get_treasury", json!({})).await?[1]);
    assert!(treasury >= 80_000);
    // A payout to an account that cannot receive it is booked back into the treasury, not lost.
    let r = call(&env, &env.root, "withdraw_treasury", json!({ "token": 1, "amount": "80000", "recipient": "ghost.test.near" }), 0).await?;
    assert!(r.is_success(), "{:?}", r.failures());
    assert_eq!(u(&view(&env, "get_treasury", json!({})).await?[1]), treasury);
    assert_fails_with(
        &call(&env, &env.alice, "withdraw_parlay_pool", json!({ "token": 1, "amount": "1", "recipient": env.alice.id() }), 0).await?,
        "ERR_OWNER",
    );
    let before = env.carol.view_account().await?.balance;
    let r = call(&env, &env.root, "withdraw_parlay_pool", json!({ "token": 1, "amount": "17500000", "recipient": env.carol.id() }), 0).await?;
    assert!(r.is_success(), "{:?}", r.failures());
    let after = env.carol.view_account().await?.balance;
    assert_eq!(after.as_yoctonear() - before.as_yoctonear(), 17_500_000 * YOCTO_PER_MICRO);
    assert_eq!(pool(&env).await?, (0, 0));
    Ok(())
}

#[tokio::test]
async fn owner_points_an_unused_token_slot_at_another_contract() -> anyhow::Result<()> {
    let env = setup(Some(fast_config())).await?;
    let set = |who: &near_workspaces::Account, token: u8, account: &str| {
        let (who, account) = (who.clone(), account.to_string());
        let env = &env;
        async move { call(env, &who, "set_token_account", json!({ "token": token, "account_id": account }), 0).await }
    };
    assert_fails_with(&set(&env.alice, 2, "usdc.test.near").await?, "ERR_OWNER");
    assert_fails_with(&set(&env.root, 1, "usdc.test.near").await?, "ERR_TOKEN");
    assert_fails_with(&set(&env.root, 2, "usad.test.near").await?, "ERR_TOKEN_DUPLICATE");
    let r = set(&env.root, 2, "usdc.test.near").await?;
    assert!(r.is_success(), "{:?}", r.failures());
    assert_eq!(view(&env, "get_token_accounts", json!({})).await?, json!(["usdc.test.near", "usad.test.near"]));
    Ok(())
}
