//! Who runs the contract and how that changes. The owner hands over in two steps (propose, then the proposed
//! account accepts), so an account becomes owner only by acting itself; a Sputnik DAO accepts with a
//! FunctionCall proposal. The owner replaces the oracle operator and the committee (a DAO can be the whole
//! committee, with quorum 1), and upgrades the code with `upgrade`, which takes the wasm as the raw call input
//! the way Sputnik's UpgradeRemote proposal sends it.
//!
//! New state lives under raw storage keys, so the `Veiled` struct keeps the layout the deployed builds wrote.

use crate::*;
use serde_json::json;

const KEY_PENDING_OWNER: &[u8] = b"go";
/// The account (the AI resolver) that may end trading early on the markets the owner opened to it.
const KEY_TRADING_CLOSER: &[u8] = b"tc";
/// `committee.contains` is a linear scan on every committee call; fifteen keeps it cheap.
pub const MAX_COMMITTEE: usize = 15;
const GAS_MIGRATE: Gas = Gas::from_tgas(30);

#[near(serializers = [json])]
pub struct GovernanceView {
    pub owner: AccountId,
    pub pending_owner: Option<AccountId>,
    pub oracle_operator: AccountId,
    pub committee: Vec<AccountId>,
    pub committee_quorum: u8,
    /// The account that may end trading early on the markets the owner opened to it (`set_early_close`).
    pub trading_closer: Option<AccountId>,
}

/// 1..=15 distinct members and a quorum of more than half of them, so two outcomes can never both reach it.
pub(crate) fn check_committee(members: &[AccountId], quorum: u8) {
    require!((1..=MAX_COMMITTEE).contains(&members.len()), "ERR_COMMITTEE_SIZE");
    for (i, m) in members.iter().enumerate() {
        require!(!members[..i].contains(m), "ERR_COMMITTEE_DUPLICATE");
    }
    let n = members.len() as u8;
    require!(quorum > n / 2 && quorum <= n, "ERR_VALUE");
}

/// NEP-297 event in the contract's "veiled" standard.
pub(crate) fn log_event(event: &str, data: serde_json::Value) {
    let e = json!({ "standard": "veiled", "version": "1.0.0", "event": event, "data": [data] });
    env::log_str(&format!("EVENT_JSON:{e}"));
}

fn pending_owner() -> Option<AccountId> {
    env::storage_read(KEY_PENDING_OWNER).and_then(|b| String::from_utf8(b).ok()).and_then(|s| s.parse().ok())
}

pub(crate) fn trading_closer() -> Option<AccountId> {
    env::storage_read(KEY_TRADING_CLOSER).and_then(|b| String::from_utf8(b).ok()).and_then(|s| s.parse().ok())
}

#[near]
impl Veiled {
    /// Owner only. Names the account that may take over with `accept_owner`; `None` withdraws the offer.
    pub fn propose_owner(&mut self, new_owner: Option<AccountId>) {
        self.assert_owner();
        match &new_owner {
            Some(a) => {
                env::storage_write(KEY_PENDING_OWNER, a.as_bytes());
            }
            None => {
                env::storage_remove(KEY_PENDING_OWNER);
            }
        }
        log_event("owner_proposed", json!({ "owner": self.owner, "pending_owner": new_owner }));
    }

    /// The proposed account takes over as owner.
    pub fn accept_owner(&mut self) {
        let caller = env::predecessor_account_id();
        require!(pending_owner().as_ref() == Some(&caller), "ERR_NOT_PROPOSED");
        env::storage_remove(KEY_PENDING_OWNER);
        let previous = std::mem::replace(&mut self.owner, caller);
        log_event("owner_changed", json!({ "previous_owner": previous, "owner": self.owner }));
    }

    /// Owner only. The account that opens turbo rounds (and gives their prices for symbols without a feed).
    pub fn set_oracle_operator(&mut self, oracle_operator: AccountId) {
        self.assert_owner();
        self.oracle = oracle_operator;
        log_event("oracle_operator_set", json!({ "oracle_operator": self.oracle }));
    }

    /// Owner only. Names the account (the AI resolver) that may end trading early with `close_trading` on the
    /// markets the owner opened to it with `set_early_close`; `None` removes it.
    pub fn set_trading_closer(&mut self, trading_closer: Option<AccountId>) {
        self.assert_owner();
        match &trading_closer {
            Some(a) => {
                env::storage_write(KEY_TRADING_CLOSER, a.as_bytes());
            }
            None => {
                env::storage_remove(KEY_TRADING_CLOSER);
            }
        }
        log_event("trading_closer_set", json!({ "trading_closer": trading_closer }));
    }

    /// Owner only. Replaces the committee and its quorum. Votes already cast count only while their member is
    /// still on the committee.
    pub fn set_committee(&mut self, members: Vec<AccountId>, quorum: u8) {
        self.assert_owner();
        check_committee(&members, quorum);
        self.committee = members;
        self.config.committee_quorum = quorum;
        log_event("committee_set", json!({ "committee": self.committee, "quorum": quorum }));
    }

    /// Owner only. The new wasm is the raw call input (not JSON). One receipt deploys it and calls `migrate`;
    /// if `migrate` fails, the deploy is undone with it and the current code stays.
    pub fn upgrade(&self) -> Promise {
        self.assert_owner();
        let code = env::input().unwrap_or_default();
        require!(!code.is_empty(), "ERR_NO_CODE");
        Promise::new(env::current_account_id()).deploy_contract(code).function_call(
            "migrate".to_string(),
            vec![],
            NearToken::from_yoctonear(0),
            GAS_MIGRATE,
        )
    }

    /// Runs right after `upgrade` deploys new code. This version adds nothing to the struct, so it only reads
    /// the stored state back. Every later build keeps a `migrate`, or its upgrade rolls back.
    #[private]
    #[init(ignore_state)]
    pub fn migrate() -> Self {
        let state: Self = env::state_read().unwrap_or_else(|| env::panic_str("ERR_STATE"));
        log_event("contract_migrated", json!({}));
        state
    }

    pub fn get_governance(&self) -> GovernanceView {
        GovernanceView {
            owner: self.owner.clone(),
            pending_owner: pending_owner(),
            oracle_operator: self.oracle.clone(),
            committee: self.committee.clone(),
            committee_quorum: self.config.committee_quorum,
            trading_closer: trading_closer(),
        }
    }
}

impl Veiled {
    pub(crate) fn assert_owner(&self) {
        require!(env::predecessor_account_id() == self.owner, "ERR_OWNER");
    }
}
