//! Governance on a real chain: handing the contract to a DAO account in two steps, rotating the committee, and
//! `upgrade`, which takes the new code as the raw call input (Sputnik DAO's UpgradeRemote passes a stored blob
//! this way) and runs `migrate` in the same receipt, so code without `migrate` never stays deployed.

use integration_tests::*;
use serde_json::json;

async fn upgrade(env: &Env, who: &near_workspaces::Account, code: Vec<u8>) -> anyhow::Result<near_workspaces::result::ExecutionFinalResult> {
    Ok(who.call(env.veiled.id(), "upgrade").args(code).max_gas().transact().await?)
}

#[tokio::test]
async fn the_owner_hands_the_contract_to_a_dao_that_rotates_the_committee() -> anyhow::Result<()> {
    let env = setup(None).await?;
    let dao = account(&env.root, "dao", 20).await?;

    let r = call(&env, &env.root, "propose_owner", json!({ "new_owner": dao.id() }), 0).await?;
    assert!(r.is_success(), "{:?}", r.failures());
    // Nothing changes until the proposed account accepts.
    assert_eq!(view(&env, "get_governance", json!({})).await?["owner"], env.root.id().as_str());
    assert_fails_with(&call(&env, &env.alice, "accept_owner", json!({}), 0).await?, "ERR_NOT_PROPOSED");
    let r = call(&env, &dao, "accept_owner", json!({}), 0).await?;
    assert!(r.is_success(), "{:?}", r.failures());
    assert!(r.logs().iter().any(|l| l.contains("\"owner_changed\"")), "{:?}", r.logs());

    // The old owner is out; the DAO rotates the committee down to itself.
    let members = json!({ "members": [dao.id()], "quorum": 1 });
    assert_fails_with(&call(&env, &env.root, "set_committee", members.clone(), 0).await?, "ERR_OWNER");
    let r = call(&env, &dao, "set_committee", members, 0).await?;
    assert!(r.is_success(), "{:?}", r.failures());
    let g = view(&env, "get_governance", json!({})).await?;
    assert_eq!(g["owner"], dao.id().as_str());
    assert_eq!(g["pending_owner"], serde_json::Value::Null);
    assert_eq!(g["committee"], json!([dao.id()]));
    assert_eq!(g["committee_quorum"], 1);
    Ok(())
}

#[tokio::test]
async fn upgrade_deploys_raw_code_and_keeps_the_state() -> anyhow::Result<()> {
    let env = setup(None).await?;
    let pyth = account(&env.root, "pyth", 5).await?;
    let r = call(&env, &env.root, "set_turbo_oracle", json!({ "oracle": pyth.id(), "close_window_secs": 10 }), 0).await?;
    assert!(r.is_success(), "{:?}", r.failures());
    let r = call(&env, &env.root, "set_committee", json!({ "members": [env.carol.id()], "quorum": 1 }), 0).await?;
    assert!(r.is_success(), "{:?}", r.failures());
    let before = view(&env, "get_governance", json!({})).await?;

    assert_fails_with(&upgrade(&env, &env.alice, veiled_wasm()?).await?, "ERR_OWNER");
    assert_fails_with(&upgrade(&env, &env.root, Vec::new()).await?, "ERR_NO_CODE");
    // Only the contract itself runs migrate.
    assert_fails_with(&call(&env, &env.root, "migrate", json!({}), 0).await?, "is private");

    let r = upgrade(&env, &env.root, veiled_wasm()?).await?;
    assert!(r.is_success(), "{:?}", r.failures());
    println!("upgrade gas: {:.1} TGas", tgas(&r));
    assert!(r.logs().iter().any(|l| l.contains("\"contract_migrated\"")), "{:?}", r.logs());
    assert_eq!(view(&env, "get_governance", json!({})).await?, before);
    assert_eq!(view(&env, "get_turbo_oracle", json!({})).await?["oracle"], pyth.id().as_str());
    Ok(())
}

#[tokio::test]
async fn code_without_migrate_is_rolled_back() -> anyhow::Result<()> {
    let env = setup(None).await?;
    let before = view(&env, "get_governance", json!({})).await?;
    let r = upgrade(&env, &env.root, mock_ft_wasm()?).await?;
    assert!(r.is_failure(), "code without migrate stayed deployed");
    // The deploy and the failed migrate call were one receipt: the old code still answers.
    assert_eq!(view(&env, "get_governance", json!({})).await?, before);
    let r = call(&env, &env.root, "set_committee", json!({ "members": [env.carol.id()], "quorum": 1 }), 0).await?;
    assert!(r.is_success(), "{:?}", r.failures());
    Ok(())
}
