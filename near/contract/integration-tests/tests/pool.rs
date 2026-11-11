//! The private note pool end to end, replaying near/circuits/scripts/gen-fixtures.mjs (same call order).

use integration_tests::*;
use near_workspaces::types::NearToken;
use serde_json::{json, Value};

async fn root(env: &Env) -> anyhow::Result<String> {
    let info: Value = env.veiled.view("get_tree_info").await?.json()?;
    Ok(info["root"].as_str().unwrap().to_string())
}

async fn deposit(env: &Env, d: &Value) -> anyhow::Result<near_workspaces::result::ExecutionFinalResult> {
    let yocto: u128 = d["yocto"].as_str().unwrap().parse()?;
    Ok(env
        .alice
        .call(env.veiled.id(), "deposit_near")
        .args_json(json!({ "owner_blind": d["owner_blind"], "memo": d["memo"] }))
        .deposit(NearToken::from_yoctonear(yocto))
        .max_gas()
        .transact()
        .await?)
}

#[tokio::test]
async fn private_pool_round_trip() -> anyhow::Result<()> {
    let env = setup(None).await?;
    let fx = fixture("pool");
    let roots = &fx["expected"]["roots"];
    let t = &fx["transacts"];

    // Dust: not a whole number of micro units.
    let dust = env
        .alice
        .call(env.veiled.id(), "deposit_near")
        .args_json(json!({ "owner_blind": fx["deposits"]["A"]["owner_blind"], "memo": "" }))
        .deposit(NearToken::from_yoctonear(1_500_000_000_000_000_000_001))
        .max_gas()
        .transact()
        .await?;
    assert_fails_with(&dust, "ERR_DEPOSIT_UNIT");

    let r = deposit(&env, &fx["deposits"]["A"]).await?;
    assert!(r.is_success(), "{:?}", r.failures());
    println!("deposit_near gas: {:.1} TGas", tgas(&r));
    assert_eq!(root(&env).await?, roots["R1"].as_str().unwrap());
    let r = deposit(&env, &fx["deposits"]["D"]).await?;
    assert!(r.is_success());
    assert_eq!(root(&env).await?, roots["R2"].as_str().unwrap());

    // W1 was proven against R1, before D landed: an older root in the history still verifies.
    let bob_before = env.bob.view_account().await?.balance;
    let r = relay(&env, &t["W1"]).await?;
    assert!(r.is_success(), "{:?}", r.failures());
    println!("transact (withdraw) gas: {:.1} TGas", tgas(&r));
    assert!(tgas(&r) < 250.0, "transact must fit well under 300 TGas");
    let bob_after = env.bob.view_account().await?.balance;
    assert_eq!(bob_after.as_yoctonear() - bob_before.as_yoctonear(), YOCTO_PER_MICRO * 1_000_000);
    assert_eq!(root(&env).await?, roots["R3"].as_str().unwrap());
    // The relayer signed it, not alice.
    assert_eq!(r.outcome().executor_id, *env.relayer.id());

    // Replay, tampering, duplicate note and a forged public input all fail.
    assert_fails_with(&relay(&env, &t["W1"]).await?, "ERR_NULLIFIER_SPENT");
    assert_fails_with(&relay(&env, &t["W1_tampered"]).await?, "ERR_EXT_DATA_HASH");
    assert_fails_with(&relay(&env, &t["DD"]).await?, "ERR_DUPLICATE_NULLIFIER");
    assert_fails_with(&relay(&env, &t["M_bad_proof"]).await?, "ERR_INVALID_PROOF");

    // Two-input merge: D + C1 become one 2 NEAR change note; nothing is paid out.
    let bob_before = env.bob.view_account().await?.balance;
    let r = relay(&env, &t["M"]).await?;
    assert!(r.is_success(), "{:?}", r.failures());
    println!("transact (merge) gas: {:.1} TGas", tgas(&r));
    assert_eq!(env.bob.view_account().await?.balance, bob_before);
    assert_eq!(root(&env).await?, roots["R4"].as_str().unwrap());

    let leaves: Value = env.veiled.view("get_leaves").args_json(json!({ "from": "0", "limit": 100 })).await?.json()?;
    let leaves = leaves.as_array().unwrap();
    assert_eq!(leaves.len(), 8);
    assert_eq!(leaves[0]["note"]["amount"], "2000000");
    assert_eq!(leaves[0]["memo"], "mA");
    assert_eq!(leaves[4]["memo"], "mC1");
    for (i, leaf) in leaves.iter().enumerate() {
        assert_eq!(leaf["commitment"], fx["expected"]["leaves"][i]);
    }
    for n in ["nullifier1", "nullifier2"] {
        let spent: bool =
            env.veiled.view("is_spent").args_json(json!({ "nullifier": t["M"]["public"][n] })).await?.json()?;
        assert!(spent);
    }
    let credits: Value = env.veiled.view("get_program_credits").await?.json()?;
    assert_eq!(credits[1], "2000000"); // 3 NEAR in, 1 NEAR withdrawn
    Ok(())
}
