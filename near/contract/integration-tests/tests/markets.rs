//! Prediction markets end to end with live proofs: create → private buy/sell/add-liquidity → bonded vote →
//! resolve → private redeem / LP exit → public withdraw; and a disputed market settled by the committee.

use integration_tests::*;
use serde_json::{json, Value};

const SK: &str = "1234567";

fn fast_config() -> Value {
    json!({
        "vote_window": 3, "dispute_window": 3, "winner_claim_priority": 40, "disputed_timeout": 40,
        "vote_bond": "1000000", "min_voters": 3, "dispute_bond_multiplier": 3,
        "min_trade": "1000", "min_liquidity": "10000",
        "protocol_fee_bps": "50", "creator_fee_bps": "50", "lp_fee_bps": "100", "committee_quorum": 3
    })
}

async fn market(env: &Env, id: u64) -> anyhow::Result<Value> {
    view(env, "get_market", json!({ "market_id": s(id) })).await
}

fn reserves(m: &Value) -> Vec<u128> {
    m["reserves"].as_array().unwrap().iter().map(u).collect()
}

/// Alice creates a NEAR market funded with `liquidity` micro NEAR; returns (id, creator LP note).
async fn create(env: &Env, w: &mut Wallet, liquidity: u128, n: u8, ticks: u64) -> anyhow::Result<(u64, Note)> {
    let h = height(env).await?;
    let lp_blinding = w.fresh();
    let index = u(&view(env, "get_tree_info", json!({})).await?["next_index"]) as u64;
    let r = call(
        env,
        &env.alice,
        "create_market",
        json!({ "args": {
            "question_hash": "q-hash", "category": 3, "num_outcomes": n,
            "deadline": s(h + ticks), "resolution_deadline": s(h + ticks + 500),
            "metadata": "{\"question\":\"Will NEAR flip?\",\"outcomes\":[\"Yes\",\"No\"]}",
            "lp_owner_blind": w.owner_blind(lp_blinding), "lp_memo": ""
        }}),
        liquidity,
    )
    .await?;
    assert!(r.is_success(), "{:?}", r.failures());
    println!("create_market gas: {:.1} TGas", tgas(&r));
    let id: String = r.clone().json()?;
    let id: u64 = id.parse()?;
    Ok((id, Note { kind: 3, asset: id, sub: 0, amount: liquidity, blinding: lp_blinding, index }))
}

#[tokio::test]
async fn market_lifecycle_with_private_trades() -> anyhow::Result<()> {
    let env = setup(Some(fast_config())).await?;
    let mut w = Wallet::new(SK);

    // Dust deposits are refused (storage griefing).
    let dust = call(&env, &env.alice, "deposit_near", json!({ "owner_blind": w.owner_blind(1), "memo": "" }), 9_999).await?;
    assert_fails_with(&dust, "ERR_MIN_DEPOSIT");

    let (id, lp_note) = create(&env, &mut w, 10_000_000, 2, 40).await?;
    let m = market(&env, id).await?;
    assert_eq!(m["status"], 1);
    assert_eq!(reserves(&m)[..2], [5_000_000, 5_000_000]);
    assert_eq!(view(&env, "get_market_count", json!({})).await?, "1");

    // Private buy: 2 NEAR of outcome 1 from a 5 NEAR note.
    let bal = w.deposit(&env, &env.alice, 5_000_000).await?;
    let a = 2_000_000 - 10_000 - 10_000; // after protocol + creator fee
    let expected_shares = fpmm_buy(&reserves(&m), 2, 1, a);
    let buy = w
        .spend(&env, &[&bal], 2_000_000, json!({ "type": "buy", "market_id": s(id), "outcome": 1, "min_shares_out": "0" }))
        .await?;
    assert!(buy.result.is_success(), "{:?}", buy.result.failures());
    println!("transact (buy) gas: {:.1} TGas", tgas(&buy.result));
    let shares = buy.minted.unwrap();
    let bal = buy.change.unwrap();
    assert_eq!((shares.kind, shares.asset, shares.sub, shares.amount), (2, id, 1, expected_shares));
    assert_eq!(bal.amount, 3_000_000);

    // Slippage guard: asking for more shares than the pool gives fails and spends nothing.
    let greedy = w
        .spend(&env, &[&bal], 1_000_000, json!({ "type": "buy", "market_id": s(id), "outcome": 2, "min_shares_out": "99000000" }))
        .await?;
    assert_fails_with(&greedy.result, "ERR_SLIPPAGE");

    // Outcome 2 buy so both sides have volume.
    let buy2 = w
        .spend(&env, &[&bal], 1_000_000, json!({ "type": "buy", "market_id": s(id), "outcome": 2, "min_shares_out": "1" }))
        .await?;
    assert!(buy2.result.is_success(), "{:?}", buy2.result.failures());
    let shares2 = buy2.minted.unwrap();
    let bal = buy2.change.unwrap();

    // Private sell of part of the outcome-1 shares for 0.5 NEAR gross, using exactly the shares needed.
    let m = market(&env, id).await?;
    let tokens = 500_000u128;
    let p = tokens - tokens * 100 / 10_000;
    let needed = fpmm_sell_needed(&reserves(&m), 2, 1, p);
    let sell = w.spend(&env, &[&shares], needed, json!({ "type": "sell", "tokens_desired": s(tokens) })).await?;
    assert!(sell.result.is_success(), "{:?}", sell.result.failures());
    let proceeds = sell.minted.unwrap();
    assert_eq!((proceeds.kind, proceeds.asset, proceeds.amount), (1, 1, tokens - 2500 - 2500 - 5000));
    let shares = sell.change.unwrap();
    assert_eq!(shares.amount, expected_shares - needed);

    // Add liquidity with the proceeds' note merged... (a second balance note) → LP note.
    let add = w
        .spend(&env, &[&bal, &proceeds], 1_000_000, json!({ "type": "add_liquidity", "market_id": s(id), "min_lp_shares": "1" }))
        .await?;
    assert!(add.result.is_success(), "{:?}", add.result.failures());
    let lp2 = add.minted.unwrap();
    let bal = add.change.unwrap();
    assert_eq!(lp2.kind, 3);
    assert_eq!(bal.amount, 2_000_000 + 490_000 - 1_000_000);

    // Trading closes at the deadline; then three bonded votes (2 × outcome 1, 1 × outcome 2).
    let early = call(&env, &env.alice, "vote_outcome", json!({ "market_id": s(id), "outcome": 1 }), 1_000_000).await?;
    assert_fails_with(&early, "ERR_STATUS");
    advance(&env, 41).await?;
    let late = w.spend(&env, &[&bal], 1000, json!({ "type": "buy", "market_id": s(id), "outcome": 1, "min_shares_out": "0" })).await?;
    assert_fails_with(&late.result, "ERR_DEADLINE");
    assert!(call(&env, &env.carol, "close_market", json!({ "market_id": s(id) }), 0).await?.is_success());
    let wrong_bond = call(&env, &env.alice, "vote_outcome", json!({ "market_id": s(id), "outcome": 1 }), 500_000).await?;
    assert_fails_with(&wrong_bond, "ERR_VOTE_BOND");
    for (who, o) in [(&env.alice, 1), (&env.bob, 1), (&env.carol, 2)] {
        let r = call(&env, who, "vote_outcome", json!({ "market_id": s(id), "outcome": o }), 1_000_000).await?;
        assert!(r.is_success(), "{:?}", r.failures());
    }
    let twice = call(&env, &env.alice, "vote_outcome", json!({ "market_id": s(id), "outcome": 2 }), 1_000_000).await?;
    assert_fails_with(&twice, "ERR_ALREADY_VOTED");
    assert_fails_with(&call(&env, &env.bob, "finalize_votes", json!({ "market_id": s(id) }), 0).await?, "ERR_VOTING_OPEN");
    advance(&env, 4).await?;
    assert!(call(&env, &env.bob, "finalize_votes", json!({ "market_id": s(id) }), 0).await?.is_success());
    let m = market(&env, id).await?;
    assert_eq!((m["status"].as_u64(), m["tally"]["winning_outcome"].as_u64()), (Some(6), Some(1)));

    // Redeeming before the resolution is final fails.
    let r = w.spend(&env, &[&shares], shares.amount, json!({ "type": "redeem" })).await?;
    assert_fails_with(&r.result, "ERR_STATUS");
    advance(&env, 4).await?;
    assert!(call(&env, &env.carol, "confirm_resolution", json!({ "market_id": s(id) }), 0).await?.is_success());
    let m = market(&env, id).await?;
    assert_eq!(m["status"], 3);
    let treasury: Value = view(&env, "get_treasury", json!({})).await?;
    // protocol fees of the two buys and the sell, plus carol's slashed bond.
    assert_eq!(u(&treasury[1]), 10_000 + 5_000 + 2_500 + 1_000_000);

    // Winning shares redeem 1:1; losing ones cannot.
    let losing = w.spend(&env, &[&shares2], shares2.amount, json!({ "type": "redeem" })).await?;
    assert_fails_with(&losing.result, "ERR_NOT_WINNER");
    let red = w.spend(&env, &[&shares], shares.amount, json!({ "type": "redeem" })).await?;
    assert!(red.result.is_success(), "{:?}", red.result.failures());
    let payout = red.minted.unwrap();
    assert_eq!((payout.kind, payout.amount), (1, shares.amount));

    // Voter bonds: winners get theirs back, the loser was slashed.
    let alice_before = env.alice.view_account().await?.balance.as_yoctonear();
    assert!(call(&env, &env.alice, "claim_voter_bond", json!({ "market_id": s(id) }), 0).await?.is_success());
    assert!(env.alice.view_account().await?.balance.as_yoctonear() > alice_before + 990_000 * YOCTO_PER_MICRO);
    assert_fails_with(&call(&env, &env.carol, "claim_voter_bond", json!({ "market_id": s(id) }), 0).await?, "ERR_LOSING_VOTE");
    assert_fails_with(&call(&env, &env.alice, "claim_voter_bond", json!({ "market_id": s(id) }), 0).await?, "ERR_CLAIMED");

    // LPs wait out the winner-claim priority window, then exit with the pool minus what winners and the creator are owed.
    let r = w.spend(&env, &[&lp_note], lp_note.amount, json!({ "type": "withdraw_lp", "min_tokens_out": "1" })).await?;
    assert_fails_with(&r.result, "ERR_PRIORITY_WINDOW");
    advance(&env, 41).await?;
    let lp_out1 = w.spend(&env, &[&lp_note], lp_note.amount, json!({ "type": "withdraw_lp", "min_tokens_out": "1" })).await?;
    assert!(lp_out1.result.is_success(), "{:?}", lp_out1.result.failures());
    let lp_out2 = w.spend(&env, &[&lp2], lp2.amount, json!({ "type": "withdraw_lp", "min_tokens_out": "1" })).await?;
    assert!(lp_out2.result.is_success(), "{:?}", lp_out2.result.failures());
    let fees = call(&env, &env.alice, "withdraw_creator_fees", json!({ "market_id": s(id) }), 0).await?;
    assert!(fees.is_success(), "{:?}", fees.failures());
    let creator_fees: String = fees.clone().json()?;
    assert_eq!(creator_fees, s(10_000 + 5_000 + 2_500));

    // Everything owed is paid: only rounding dust may remain in the market.
    let m = market(&env, id).await?;
    println!("market credits left: {}", m["market_credits"]);
    assert!(u(&m["market_credits"]) < 10, "market should be drained, has {}", m["market_credits"]);

    // Two balance notes merge-and-withdraw publicly to bob.
    let lp_bal = lp_out1.minted.unwrap();
    let bob_before = env.bob.view_account().await?.balance.as_yoctonear();
    let wd = w
        .spend(&env, &[&lp_bal, &payout], lp_bal.amount + payout.amount, json!({ "type": "withdraw", "recipient": env.bob.id() }))
        .await?;
    assert!(wd.result.is_success(), "{:?}", wd.result.failures());
    let got = env.bob.view_account().await?.balance.as_yoctonear() - bob_before;
    assert_eq!(got, (lp_bal.amount + payout.amount) * YOCTO_PER_MICRO);

    // Solvency: the contract holds at least what its ledger says it owes.
    let credits: Value = view(&env, "get_program_credits", json!({})).await?;
    let held = env.veiled.view_account().await?.balance.as_yoctonear();
    assert!(held >= u(&credits[1]) * YOCTO_PER_MICRO, "contract balance below program credits");
    Ok(())
}

#[tokio::test]
async fn disputed_market_is_settled_by_the_committee() -> anyhow::Result<()> {
    let env = setup(Some(fast_config())).await?;
    let mut w = Wallet::new(SK);
    let (id, _lp) = create(&env, &mut w, 1_000_000, 2, 10).await?;
    let bal = w.deposit(&env, &env.alice, 2_000_000).await?;
    let buy = w
        .spend(&env, &[&bal], 1_000_000, json!({ "type": "buy", "market_id": s(id), "outcome": 2, "min_shares_out": "1" }))
        .await?;
    let shares = buy.minted.unwrap();

    advance(&env, 11).await?;
    for who in [&env.alice, &env.bob, &env.carol] {
        assert!(call(&env, who, "vote_outcome", json!({ "market_id": s(id), "outcome": 1 }), 1_000_000).await?.is_success());
    }
    advance(&env, 4).await?;
    assert!(call(&env, &env.bob, "finalize_votes", json!({ "market_id": s(id) }), 0).await?.is_success());

    // A dispute needs 3 × the 3 NEAR bonded.
    let cheap = call(&env, &env.bob, "dispute_resolution", json!({ "market_id": s(id), "proposed_outcome": 2 }), 8_999_999).await?;
    assert_fails_with(&cheap, "ERR_DISPUTE_BOND");
    let d = call(&env, &env.bob, "dispute_resolution", json!({ "market_id": s(id), "proposed_outcome": 2 }), 9_000_000).await?;
    assert!(d.is_success(), "{:?}", d.failures());
    assert_eq!(market(&env, id).await?["status"], 7);
    // The disputed market cannot be confirmed or emergency-cancelled.
    advance(&env, 4).await?;
    assert_fails_with(&call(&env, &env.carol, "confirm_resolution", json!({ "market_id": s(id) }), 0).await?, "ERR_STATUS");

    assert!(call(&env, &env.carol, "initiate_escalation", json!({ "market_id": s(id) }), 0).await?.is_success());
    let outsider = call(&env, &env.carol, "committee_vote_resolve", json!({ "market_id": s(id), "outcome": 2 }), 0).await?;
    assert_fails_with(&outsider, "ERR_NOT_COMMITTEE");
    for (i, o) in [(0, 2), (1, 2), (2, 1), (3, 2)] {
        let r = call(&env, &env.committee[i], "committee_vote_resolve", json!({ "market_id": s(id), "outcome": o }), 0).await?;
        assert!(r.is_success(), "{:?}", r.failures());
    }
    assert!(call(&env, &env.carol, "finalize_committee_vote", json!({ "market_id": s(id) }), 0).await?.is_success());
    assert!(call(&env, &env.carol, "governance_resolve", json!({ "market_id": s(id) }), 0).await?.is_success());
    let m = market(&env, id).await?;
    assert_eq!((m["status"].as_u64(), m["tally"]["winning_outcome"].as_u64()), (Some(3), Some(2)));
    assert_eq!(m["dispute"]["final_outcome"], 2);

    // The disputer was right: bond back. All three voters were wrong: slashed.
    let bob_before = env.bob.view_account().await?.balance.as_yoctonear();
    let c = call(&env, &env.bob, "claim_dispute_bond", json!({ "market_id": s(id) }), 0).await?;
    assert!(c.is_success(), "{:?}", c.failures());
    assert!(env.bob.view_account().await?.balance.as_yoctonear() > bob_before + 8_990_000 * YOCTO_PER_MICRO);
    assert_fails_with(&call(&env, &env.alice, "claim_voter_bond", json!({ "market_id": s(id) }), 0).await?, "ERR_LOSING_VOTE");
    let treasury: Value = view(&env, "get_treasury", json!({})).await?;
    assert_eq!(u(&treasury[1]), 5_000 + 3_000_000);

    // Outcome-2 shares redeem.
    let red = w.spend(&env, &[&shares], shares.amount, json!({ "type": "redeem" })).await?;
    assert!(red.result.is_success(), "{:?}", red.result.failures());
    Ok(())
}

#[tokio::test]
async fn cancelled_market_refunds_traders_and_lps() -> anyhow::Result<()> {
    let env = setup(Some(fast_config())).await?;
    let mut w = Wallet::new(SK);
    let (id, lp) = create(&env, &mut w, 2_000_000, 3, 10).await?;
    // With no volume the creator may cancel; first trade then make cancellation wait for the emergency path.
    let bal = w.deposit(&env, &env.alice, 1_000_000).await?;
    let buy = w
        .spend(&env, &[&bal], 1_000_000, json!({ "type": "buy", "market_id": s(id), "outcome": 3, "min_shares_out": "1" }))
        .await?;
    assert!(buy.result.is_success(), "{:?}", buy.result.failures());
    let shares = buy.minted.unwrap();
    assert_fails_with(&call(&env, &env.alice, "cancel_market", json!({ "market_id": s(id) }), 0).await?, "ERR_CANNOT_CANCEL");
    advance(&env, 512).await?;
    assert!(call(&env, &env.carol, "cancel_market", json!({ "market_id": s(id) }), 0).await?.is_success());

    // Refund: the trader gets their net collateral back, the LP the rest.
    let refund = w.spend(&env, &[&shares], shares.amount, json!({ "type": "refund" })).await?;
    assert!(refund.result.is_success(), "{:?}", refund.result.failures());
    assert_eq!(refund.minted.unwrap().amount, 1_000_000 - 5_000 - 5_000);
    let out = w.spend(&env, &[&lp], lp.amount, json!({ "type": "withdraw_lp", "min_tokens_out": "1" })).await?;
    assert!(out.result.is_success(), "{:?}", out.result.failures());
    assert_eq!(out.minted.unwrap().amount, 2_000_000 + 5_000);
    let m = market(&env, id).await?;
    assert_eq!(u(&m["market_credits"]), 0);
    Ok(())
}
