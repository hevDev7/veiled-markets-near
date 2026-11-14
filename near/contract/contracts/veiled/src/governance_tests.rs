//! Who runs the contract and how that changes: the owner hand-over, the oracle operator, the committee (a
//! Sputnik DAO can hold the owner or the committee role) and code upgrades through `upgrade`.

use crate::behaviour_tests::*;
use crate::*;
use near_sdk::mock::MockAction;
use near_sdk::test_utils::{get_created_receipts, get_logs, VMContextBuilder};
use near_sdk::testing_env;

fn committee(names: &[&str]) -> Vec<AccountId> {
    names.iter().map(|n| acct(n)).collect()
}

fn logged(event: &str) -> bool {
    get_logs().iter().any(|l| l.starts_with("EVENT_JSON:") && l.contains(&format!("\"event\":\"{event}\"")))
}

// ---------------------------------------------------------------------------------------- owner hand-over

#[test]
fn the_owner_changes_only_when_the_proposed_account_accepts() {
    let mut c = contract(1);
    at("owner.test", 0, H0);
    c.propose_owner(Some(acct("dao.test")));
    assert!(logged("owner_proposed"));
    let g = c.get_governance();
    assert_eq!((g.owner.as_str(), g.pending_owner.as_ref().map(|a| a.as_str())), ("owner.test", Some("dao.test")));

    at("dao.test", 0, H0 + 1);
    c.accept_owner();
    assert!(logged("owner_changed"));
    let g = c.get_governance();
    assert_eq!((g.owner.as_str(), g.pending_owner), ("dao.test", None));
    // The new owner holds the owner methods.
    c.set_resolver_reward_bps(1000);
    assert_eq!(c.get_resolver_reward_bps(), 1000);
}

#[test]
#[should_panic(expected = "ERR_OWNER")]
fn the_previous_owner_loses_the_owner_methods() {
    let mut c = contract(1);
    at("owner.test", 0, H0);
    c.propose_owner(Some(acct("dao.test")));
    at("dao.test", 0, H0 + 1);
    c.accept_owner();
    at("owner.test", 0, H0 + 2);
    c.set_resolver_reward_bps(1000);
}

#[test]
#[should_panic(expected = "ERR_OWNER")]
fn only_the_owner_proposes_a_new_owner() {
    let mut c = contract(1);
    at("mallory.test", 0, H0);
    c.propose_owner(Some(acct("mallory.test")));
}

#[test]
#[should_panic(expected = "ERR_NOT_PROPOSED")]
fn only_the_proposed_account_accepts() {
    let mut c = contract(1);
    at("owner.test", 0, H0);
    c.propose_owner(Some(acct("dao.test")));
    at("mallory.test", 0, H0 + 1);
    c.accept_owner();
}

#[test]
#[should_panic(expected = "ERR_NOT_PROPOSED")]
fn a_withdrawn_proposal_cannot_be_accepted() {
    let mut c = contract(1);
    at("owner.test", 0, H0);
    c.propose_owner(Some(acct("dao.test")));
    c.propose_owner(None);
    at("dao.test", 0, H0 + 1);
    c.accept_owner();
}

#[test]
#[should_panic(expected = "ERR_NOT_PROPOSED")]
fn an_accepted_proposal_is_used_up() {
    let mut c = contract(1);
    at("owner.test", 0, H0);
    c.propose_owner(Some(acct("dao.test")));
    at("dao.test", 0, H0 + 1);
    c.accept_owner();
    c.accept_owner();
}

// ---------------------------------------------------------------------------------------- oracle operator

#[test]
fn the_owner_replaces_the_oracle_operator() {
    let mut c = contract(1);
    at("owner.test", 0, H0);
    c.set_oracle_operator(acct("keeper2.test"));
    assert!(logged("oracle_operator_set"));
    assert_eq!(c.get_governance().oracle_operator.as_str(), "keeper2.test");
    at("keeper2.test", 0, H0);
    let id = c.create_turbo_market(1, U64(H0 + 75), U128(70_000_000_000), U128(0), U64(H0)).0;
    assert!(c.get_turbo_market(U64(id)).is_some());
}

#[test]
#[should_panic(expected = "ERR_NOT_ORACLE")]
fn the_replaced_oracle_operator_cannot_open_rounds() {
    let mut c = contract(1);
    at("owner.test", 0, H0);
    c.set_oracle_operator(acct("keeper2.test"));
    open_turbo(&mut c, 75); // as oracle.test
}

#[test]
#[should_panic(expected = "ERR_OWNER")]
fn only_the_owner_replaces_the_oracle_operator() {
    let mut c = contract(1);
    at("oracle.test", 0, H0);
    c.set_oracle_operator(acct("oracle2.test"));
}

// ---------------------------------------------------------------------------------------- committee

/// A traded market whose vote (outcome 1, by bob) carol disputes (outcome 2), escalated to the committee at
/// H0 + 27. The dispute times out 40 ticks after H0 + 26.
fn escalated(c: &mut Veiled) -> u64 {
    let (id, _) = traded_market(c);
    vote(c, "bob.test", id, 1, H0 + 21);
    at("carol.test", 3 * NEAR, H0 + 26);
    c.dispute_resolution(U64(id), 2);
    at("carol.test", 0, H0 + 27);
    c.initiate_escalation(U64(id));
    id
}

fn committee_vote(c: &mut Veiled, who: &str, id: u64, outcome: u8, height: u64) {
    at(who, 0, height);
    c.committee_vote_resolve(U64(id), outcome);
}

#[test]
fn a_dao_alone_can_be_the_committee() {
    let mut c = contract(1);
    at("owner.test", 0, H0);
    c.set_committee(committee(&["dao.test"]), 1);
    assert!(logged("committee_set"));
    let g = c.get_governance();
    assert_eq!((g.committee.len(), g.committee_quorum), (1, 1));
    assert_eq!(c.get_config().committee_quorum, 1);

    let id = escalated(&mut c);
    committee_vote(&mut c, "dao.test", id, 2, H0 + 28);
    at("carol.test", 0, H0 + 29);
    c.finalize_committee_vote(U64(id));
    c.governance_resolve(U64(id));
    let m = market_at(&c, id, H0 + 29);
    assert_eq!((m.status, m.committee_outcome), (markets::STATUS_RESOLVED, 2));
}

#[test]
#[should_panic(expected = "ERR_NOT_COMMITTEE")]
fn a_replaced_member_can_no_longer_vote() {
    let mut c = contract(1);
    at("owner.test", 0, H0);
    c.set_committee(committee(&["dao.test"]), 1);
    let id = escalated(&mut c);
    committee_vote(&mut c, "c1.test", id, 2, H0 + 28);
}

#[test]
#[should_panic(expected = "ERR_QUORUM")]
fn votes_of_removed_members_stop_counting() {
    let mut c = contract(1);
    let id = escalated(&mut c);
    for (i, who) in ["c1.test", "c2.test", "c3.test"].iter().enumerate() {
        committee_vote(&mut c, who, id, 2, H0 + 28 + i as u64);
    }
    // c1 and c2 leave before anyone finalizes: only c3's vote is left of the three.
    at("owner.test", 0, H0 + 31);
    c.set_committee(committee(&["c3.test", "c4.test", "c5.test", "c6.test", "c7.test"]), 3);
    at("carol.test", 0, H0 + 32);
    c.finalize_committee_vote(U64(id));
}

#[test]
fn new_members_complete_the_quorum_after_a_rotation() {
    let mut c = contract(1);
    let id = escalated(&mut c);
    for (i, who) in ["c1.test", "c2.test", "c3.test"].iter().enumerate() {
        committee_vote(&mut c, who, id, 2, H0 + 28 + i as u64);
    }
    at("owner.test", 0, H0 + 31);
    c.set_committee(committee(&["c3.test", "c4.test", "c5.test", "c6.test", "c7.test"]), 3);
    committee_vote(&mut c, "c4.test", id, 2, H0 + 32);
    committee_vote(&mut c, "c6.test", id, 1, H0 + 33);
    at("carol.test", 0, H0 + 34);
    // Counted: c3 and c4 for outcome 2, c6 for outcome 1 → no outcome has 3 yet.
    let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| c.finalize_committee_vote(U64(id))));
    assert!(r.is_err());
    committee_vote(&mut c, "c5.test", id, 2, H0 + 35);
    at("carol.test", 0, H0 + 36);
    c.finalize_committee_vote(U64(id));
    assert_eq!(market_at(&c, id, H0 + 36).committee_outcome, 2);
}

#[test]
#[should_panic(expected = "ERR_OWNER")]
fn only_the_owner_sets_the_committee() {
    let mut c = contract(1);
    at("c1.test", 0, H0);
    c.set_committee(committee(&["c1.test"]), 1);
}

#[test]
#[should_panic(expected = "ERR_COMMITTEE_SIZE")]
fn an_empty_committee_is_refused() {
    let mut c = contract(1);
    at("owner.test", 0, H0);
    c.set_committee(vec![], 1);
}

#[test]
#[should_panic(expected = "ERR_COMMITTEE_SIZE")]
fn a_committee_above_fifteen_members_is_refused() {
    let mut c = contract(1);
    at("owner.test", 0, H0);
    let members: Vec<AccountId> = (1..=16).map(|i| acct(&format!("m{i}.test"))).collect();
    c.set_committee(members, 9);
}

#[test]
#[should_panic(expected = "ERR_COMMITTEE_DUPLICATE")]
fn a_member_listed_twice_is_refused() {
    let mut c = contract(1);
    at("owner.test", 0, H0);
    c.set_committee(committee(&["a.test", "b.test", "a.test"]), 2);
}

#[test]
#[should_panic(expected = "ERR_VALUE")]
fn a_quorum_of_half_the_committee_is_refused() {
    let mut c = contract(1);
    at("owner.test", 0, H0);
    c.set_committee(committee(&["a.test", "b.test", "c.test", "d.test"]), 2);
}

#[test]
#[should_panic(expected = "ERR_VALUE")]
fn a_quorum_above_the_committee_size_is_refused() {
    let mut c = contract(1);
    at("owner.test", 0, H0);
    c.set_committee(committee(&["a.test", "b.test"]), 3);
}

#[test]
fn a_fifteen_member_committee_with_a_majority_quorum_is_accepted() {
    let mut c = contract(1);
    at("owner.test", 0, H0);
    let members: Vec<AccountId> = (1..=15).map(|i| acct(&format!("m{i}.test"))).collect();
    c.set_committee(members, 8);
    assert_eq!(c.get_governance().committee_quorum, 8);
}

#[test]
fn a_fresh_deployment_can_start_with_a_dao_committee() {
    at("owner.test", 0, H0);
    let c = Veiled::new(
        acct("owner.test"),
        acct("oracle.test"),
        committee(&["dao.test"]),
        acct("usdcx.test"),
        acct("usad.test"),
        Some(Config { committee_quorum: 1, ..config(1) }),
    );
    assert_eq!(c.get_governance().committee, committee(&["dao.test"]));
}

#[test]
#[should_panic(expected = "ERR_VALUE")]
fn a_fresh_deployment_checks_the_quorum_against_its_committee() {
    at("owner.test", 0, H0);
    Veiled::new(
        acct("owner.test"),
        acct("oracle.test"),
        committee(&["dao.test"]),
        acct("usdcx.test"),
        acct("usad.test"),
        None, // default quorum 3
    );
}

// ---------------------------------------------------------------------------------------- upgrade

/// `who` calls with `input` as the raw call arguments.
fn at_with_input(who: &str, input: &[u8]) {
    let mut ctx = VMContextBuilder::new()
        .current_account_id(acct("veiled.test"))
        .predecessor_account_id(acct(who))
        .signer_account_id(acct(who))
        .account_balance(NearToken::from_near(100_000))
        .block_timestamp(H0 * 4000 * 1_000_000)
        .build();
    ctx.input = input.into();
    testing_env!(ctx);
}

#[test]
fn upgrade_deploys_the_input_and_calls_migrate_in_the_same_receipt() {
    let c = contract(1);
    let code = b"\0asm new code".to_vec();
    at_with_input("owner.test", &code);
    let _ = c.upgrade();
    let receipts = get_created_receipts();
    assert_eq!(receipts.len(), 1);
    assert_eq!(receipts[0].receiver_id.as_str(), "veiled.test");
    match &receipts[0].actions[..] {
        [MockAction::DeployContract { code: deployed, .. }, MockAction::FunctionCallWeight { method_name, attached_deposit, .. }] =>
        {
            assert_eq!(deployed, &code);
            assert_eq!(method_name, b"migrate");
            assert_eq!(attached_deposit.as_yoctonear(), 0);
        }
        other => panic!("unexpected actions {other:?}"),
    }
}

#[test]
#[should_panic(expected = "ERR_OWNER")]
fn only_the_owner_upgrades() {
    let c = contract(1);
    at_with_input("mallory.test", b"\0asm");
    let _ = c.upgrade();
}

#[test]
#[should_panic(expected = "ERR_NO_CODE")]
fn an_upgrade_without_code_is_refused() {
    let c = contract(1);
    at_with_input("owner.test", b"");
    let _ = c.upgrade();
}

#[test]
fn migrate_keeps_the_stored_state() {
    let mut c = contract(1);
    at("owner.test", 0, H0);
    c.set_oracle_operator(acct("keeper2.test"));
    env::state_write(&c);
    let m = Veiled::migrate();
    assert!(logged("contract_migrated"));
    assert_eq!(m.get_governance().oracle_operator.as_str(), "keeper2.test");
    assert_eq!(m.get_config().committee_quorum, c.get_config().committee_quorum);
}

#[test]
#[should_panic(expected = "ERR_STATE")]
fn migrate_without_state_fails() {
    at("veiled.test", 0, H0);
    Veiled::migrate();
}
