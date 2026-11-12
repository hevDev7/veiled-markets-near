//! USDCX/USAD (mock NEP-141) collateral: shield via ft_transfer_call, fund a market, trade privately,
//! withdraw to a fresh account, and refuse tokens that are not whitelisted.

use integration_tests::*;
use near_workspaces::types::NearToken;
use near_workspaces::{Account, Contract};
use serde_json::{json, Value};

const SK: &str = "24680";

async fn deploy_ft(env: &Env, name: &str, symbol: &str) -> anyhow::Result<Contract> {
    let acc = account(&env.root, name, 50).await?;
    let ft = acc.deploy(&mock_ft_wasm()?).await?.into_result()?;
    ft.call("new").args_json(json!({ "name": name, "symbol": symbol })).max_gas().transact().await?.into_result()?;
    Ok(ft)
}

async fn mint(ft: &Contract, to: &Account, amount: u128) -> anyhow::Result<()> {
    to.call(ft.id(), "mint")
        .args_json(json!({ "account_id": to.id(), "amount": s(amount) }))
        .max_gas()
        .transact()
        .await?
        .into_result()?;
    Ok(())
}

async fn balance(ft: &Contract, who: &near_workspaces::AccountId) -> anyhow::Result<u128> {
    let b: String = ft.view("ft_balance_of").args_json(json!({ "account_id": who })).await?.json()?;
    Ok(b.parse()?)
}

async fn transfer_call(
    env: &Env,
    ft: &Contract,
    from: &Account,
    amount: u128,
    msg: Value,
) -> anyhow::Result<near_workspaces::result::ExecutionFinalResult> {
    Ok(from
        .call(ft.id(), "ft_transfer_call")
        .args_json(json!({ "receiver_id": env.veiled.id(), "amount": s(amount), "msg": msg.to_string() }))
        .deposit(NearToken::from_yoctonear(1))
        .max_gas()
        .transact()
        .await?)
}

#[tokio::test]
async fn stablecoin_collateral_round_trip() -> anyhow::Result<()> {
    let env = setup(None).await?;
    let mut w = Wallet::new(SK);
    let usdcx = deploy_ft(&env, "usdcx", "USDCX").await?;
    let fake = deploy_ft(&env, "fake", "FAKE").await?;
    mint(&usdcx, &env.alice, 100_000_000).await?;
    mint(&fake, &env.alice, 100_000_000).await?;

    // Shield 50 USDCX into a private note (kind 1, asset 2).
    let blinding = w.fresh();
    let index = u(&view(&env, "get_tree_info", json!({})).await?["next_index"]) as u64;
    let r = transfer_call(&env, &usdcx, &env.alice, 50_000_000,
        json!({ "deposit": { "owner_blind": w.owner_blind(blinding), "memo": "" } })).await?;
    assert!(r.is_success(), "{:?}", r.failures());
    assert_eq!(balance(&usdcx, env.alice.id()).await?, 50_000_000);
    assert_eq!(balance(&usdcx, env.veiled.id()).await?, 50_000_000);
    let note = Note { kind: 1, asset: 2, sub: 0, amount: 50_000_000, blinding, index };
    let credits: Value = view(&env, "get_program_credits", json!({})).await?;
    assert_eq!(u(&credits[2]), 50_000_000);

    // A token that is not USDCX/USAD is refused and refunded by the token contract.
    let r = transfer_call(&env, &fake, &env.alice, 1_000_000,
        json!({ "deposit": { "owner_blind": w.owner_blind(9_999), "memo": "" } })).await?;
    assert!(r.receipt_failures().iter().any(|f| format!("{f:?}").contains("ERR_TOKEN")));
    assert_eq!(balance(&fake, env.alice.id()).await?, 100_000_000);

    // A USDCX-collateral market funded through ft_transfer_call.
    let h = height(&env).await?;
    let lp_blinding = w.fresh();
    let r = transfer_call(&env, &usdcx, &env.alice, 10_000_000, json!({ "create_market": {
        "question_hash": "q", "category": 1, "num_outcomes": 2,
        "deadline": s(h + 100), "resolution_deadline": s(h + 100 + 8640),
        "metadata": "{}", "lp_owner_blind": w.owner_blind(lp_blinding), "lp_memo": ""
    }})).await?;
    assert!(r.is_success(), "{:?}", r.failures());
    let count: String = view(&env, "get_market_count", json!({})).await?.as_str().unwrap().to_string();
    assert_eq!(count, "1");
    let m: Value = view(&env, "get_markets", json!({ "from": "0", "limit": 10 })).await?;
    let m = &m[0];
    assert_eq!(m["token_type"], 2);
    assert_eq!(u(&m["total_liquidity"]), 10_000_000);
    let id = m["id"].as_str().unwrap().to_string();

    // Private USDCX buy; a NEAR note could not buy here and a USDCX note cannot buy a NEAR market.
    let buy = w.spend(&env, &[&note], 5_000_000, json!({ "type": "buy", "market_id": id, "outcome": 1, "min_shares_out": "1" })).await?;
    assert!(buy.result.is_success(), "{:?}", buy.result.failures());
    let change = buy.change.unwrap();
    let near_market = call(&env, &env.alice, "create_market", json!({ "args": {
        "question_hash": "q2", "category": 1, "num_outcomes": 2, "deadline": s(h + 100), "resolution_deadline": s(h + 100 + 8640),
        "metadata": "{}", "lp_owner_blind": w.owner_blind(9_999), "lp_memo": "" }}), 1_000_000).await?;
    let near_id: String = near_market.clone().json()?;
    let cross = w.spend(&env, &[&change], 1_000_000, json!({ "type": "buy", "market_id": near_id, "outcome": 1, "min_shares_out": "1" })).await?;
    assert_fails_with(&cross.result, "ERR_NOTE_KIND");

    // Withdraw 20 USDCX to carol, who never registered with the token.
    let wd = w.spend(&env, &[&change], 20_000_000, json!({ "type": "withdraw", "recipient": env.carol.id() })).await?;
    assert!(wd.result.is_success(), "{:?}", wd.result.failures());
    assert_eq!(balance(&usdcx, env.carol.id()).await?, 20_000_000);
    assert_eq!(wd.change.unwrap().amount, 25_000_000);
    let credits: Value = view(&env, "get_program_credits", json!({})).await?;
    assert_eq!(u(&credits[2]), 50_000_000 + 10_000_000 - 20_000_000);
    assert_eq!(balance(&usdcx, env.veiled.id()).await?, 40_000_000);
    Ok(())
}
