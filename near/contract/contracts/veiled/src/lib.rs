//! Veiled Markets on NEAR (docs/near/DESIGN.md).
//!
//! One contract: a Groth16-verified note pool (private balances and positions), FPMM prediction markets,
//! bonded resolution with committee escalation, and turbo UP/DOWN markets. Every private action is a `transact`
//! call submitted by a relayer, so the bettor's account never appears in it.

pub mod field;
pub mod markets;
pub mod math;
pub mod poseidon;
mod poseidon_constants;
pub mod tree;
pub mod turbo;
pub mod types;
mod vk;
pub mod zk;

use field::{ext_data_hash, parse_fr, to_dec, to_u128, Felt, ZERO};
use near_sdk::json_types::{U128, U64};
use near_sdk::store::{LookupMap, LookupSet, Vector};
use near_sdk::{env, near, require, AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise};
use tree::{Tree, DEPTH};
pub use types::*;

pub const KIND_BALANCE: u8 = 1;
pub const KIND_SHARE: u8 = 2;
pub const KIND_LP: u8 = 3;
pub const KIND_TURBO: u8 = 4;

pub const TOKEN_NEAR: u8 = 1;
pub const TOKEN_USDCX: u8 = 2;
pub const TOKEN_USAD: u8 = 3;

pub const YOCTO_PER_MICRO: u128 = 1_000_000_000_000_000_000;
pub const TICK_MS: u64 = 4000;
pub const MAX_MEMO: usize = 1024;
/// Smallest public deposit (0.01 of a token): every note costs the contract storage.
pub const MIN_DEPOSIT: u128 = 10_000;

const GAS_FT_TRANSFER: Gas = Gas::from_tgas(15);
const GAS_ON_WITHDRAW: Gas = Gas::from_tgas(60);

#[near(serializers = [borsh])]
#[derive(BorshStorageKey)]
enum StorageKey {
    Leaves,
    Nullifiers,
    Markets,
    MarketIds,
    Votes,
    Turbo,
    TurboIds,
    LatestTurbo,
}

#[near(serializers = [borsh])]
#[derive(Clone)]
pub struct NoteInfo {
    pub kind: u8,
    pub asset: u64,
    pub sub: u8,
    pub amount: u128,
    pub owner_blind: Felt,
}

#[near(serializers = [borsh])]
pub struct Leaf {
    pub commitment: Felt,
    pub note: Option<NoteInfo>,
    pub memo: String,
}

/// A verified spend: the public facts the proof established, and the parsed ext_data.
pub struct Spent {
    pub kind: u8,
    pub asset: u64,
    pub sub: u8,
    pub out_amount: u128,
    pub change_commitment: Felt,
    pub ext: ExtData,
}

/// A note the contract mints for the spender (owner blind and memo come from ext_data).
pub struct Mint {
    pub kind: u8,
    pub asset: u64,
    pub sub: u8,
    pub amount: u128,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Veiled {
    pub owner: AccountId,
    pub oracle: AccountId,
    pub committee: Vec<AccountId>,
    pub usdcx: AccountId,
    pub usad: AccountId,
    pub config: Config,
    pub tree: Tree,
    pub leaves: Vector<Leaf>,
    pub nullifiers: LookupSet<Felt>,
    /// Micro units held per token type (index 1..=3), the Aleo `program_credits` mapping.
    pub program_credits: Vec<u128>,
    /// Protocol fees and slashed bonds per token type, a sub-ledger of `program_credits`.
    pub treasury: Vec<u128>,
    pub paused: bool,
    /// Shared id counter for prediction and turbo markets (ids start at 1).
    pub next_id: u64,
    pub markets: LookupMap<u64, markets::MarketState>,
    pub market_ids: Vector<u64>,
    pub votes: LookupMap<String, markets::Vote>,
    pub turbo: LookupMap<u64, turbo::TurboMarket>,
    pub turbo_ids: Vector<u64>,
    pub latest_turbo: LookupMap<u8, u64>,
    pub turbo_exposure: u128,
}

/// `ft_transfer_call` message for USDCX/USAD: shield into a private note, or fund a new market.
#[near(serializers = [json])]
#[serde(rename_all = "snake_case")]
pub enum FtMsg {
    Deposit { owner_blind: String, memo: String },
    CreateMarket(markets::CreateMarketArgs),
}

#[near]
impl Veiled {
    #[init]
    pub fn new(
        owner: AccountId,
        oracle_operator: AccountId,
        committee: Vec<AccountId>,
        usdcx_token: AccountId,
        usad_token: AccountId,
        config: Option<Config>,
    ) -> Self {
        require!(committee.len() == 5, "ERR_COMMITTEE_SIZE");
        Self {
            owner,
            oracle: oracle_operator,
            committee,
            usdcx: usdcx_token,
            usad: usad_token,
            config: config.unwrap_or_default(),
            tree: Tree::new(),
            leaves: Vector::new(StorageKey::Leaves),
            nullifiers: LookupSet::new(StorageKey::Nullifiers),
            program_credits: vec![0; 4],
            treasury: vec![0; 4],
            paused: false,
            next_id: 1,
            markets: LookupMap::new(StorageKey::Markets),
            market_ids: Vector::new(StorageKey::MarketIds),
            votes: LookupMap::new(StorageKey::Votes),
            turbo: LookupMap::new(StorageKey::Turbo),
            turbo_ids: Vector::new(StorageKey::TurboIds),
            latest_turbo: LookupMap::new(StorageKey::LatestTurbo),
            turbo_exposure: 0,
        }
    }

    // ---------------------------------------------------------------- note pool

    /// Deposits attached NEAR as a private balance note. The deposit itself is public (like shielding on Aleo).
    #[payable]
    pub fn deposit_near(&mut self, owner_blind: String, memo: String) -> U64 {
        let yocto = env::attached_deposit().as_yoctonear();
        require!(yocto > 0 && yocto % YOCTO_PER_MICRO == 0, "ERR_DEPOSIT_UNIT");
        let amount = yocto / YOCTO_PER_MICRO;
        require!(amount >= MIN_DEPOSIT, "ERR_MIN_DEPOSIT");
        self.program_credits[TOKEN_NEAR as usize] += amount;
        let mint = Mint { kind: KIND_BALANCE, asset: TOKEN_NEAR as u64, sub: 0, amount };
        let (index, _) = self.mint_single(&mint, &parse_fr(&owner_blind), memo);
        U64(index)
    }

    /// NEP-141 receiver for USDCX/USAD (6 decimals = micro units). Returns the unused amount (always 0; a
    /// panic makes the token contract refund everything).
    pub fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String) -> U128 {
        let ft = env::predecessor_account_id();
        let token = if ft == self.usdcx {
            TOKEN_USDCX
        } else if ft == self.usad {
            TOKEN_USAD
        } else {
            env::panic_str("ERR_TOKEN")
        };
        let msg: FtMsg = serde_json::from_str(&msg).unwrap_or_else(|_| env::panic_str("ERR_FT_MSG"));
        match msg {
            FtMsg::Deposit { owner_blind, memo } => {
                require!(amount.0 >= MIN_DEPOSIT, "ERR_MIN_DEPOSIT");
                self.program_credits[token as usize] += amount.0;
                let mint = Mint { kind: KIND_BALANCE, asset: token as u64, sub: 0, amount: amount.0 };
                self.mint_single(&mint, &parse_fr(&owner_blind), memo);
            }
            FtMsg::CreateMarket(args) => {
                self.internal_create_market(sender_id, token, amount.0, args);
            }
        }
        U128(0)
    }

    /// Spends notes with a Groth16 proof and performs `ext_data.action`. Called by a relayer.
    pub fn transact(&mut self, proof: ProofArgs, public: PublicArgs, ext_data: String) -> TransactResult {
        let spent = self.verify_spend(&proof, &public, &ext_data);
        require!(spent.ext.new_memo.len() <= MAX_MEMO && spent.ext.change_memo.len() <= MAX_MEMO, "ERR_MEMO_LEN");
        let new_owner_blind = parse_fr(&spent.ext.new_owner_blind);

        let minted = match &spent.ext.action {
            Action::Withdraw { recipient } => {
                self.act_withdraw(&spent, recipient.clone(), &new_owner_blind);
                None
            }
            _ => self.act_market(&spent),
        };
        require!(spent.ext.fee.0 == 0 || matches!(spent.ext.action, Action::Withdraw { .. }), "ERR_FEE_ACTION");

        let change_leaf = Leaf { commitment: spent.change_commitment, note: None, memo: spent.ext.change_memo.clone() };
        let (new_leaf, result_note) = match minted {
            Some(m) => {
                let commitment = poseidon::note_commitment(m.kind, m.asset, m.sub, m.amount, &new_owner_blind);
                let info = NoteInfo { kind: m.kind, asset: m.asset, sub: m.sub, amount: m.amount, owner_blind: new_owner_blind };
                (Leaf { commitment, note: Some(info.clone()), memo: spent.ext.new_memo.clone() }, Some(info))
            }
            None => (Leaf { commitment: ZERO, note: None, memo: String::new() }, None),
        };
        let new_commitment = new_leaf.commitment;
        let change_index = self.insert_pair(change_leaf, new_leaf);
        let n = result_note.unwrap_or(NoteInfo { kind: 0, asset: 0, sub: 0, amount: 0, owner_blind: ZERO });
        env::log_str(&format!(
            "EVENT_JSON:{{\"standard\":\"veiled\",\"version\":\"1.0.0\",\"event\":\"transact\",\"data\":[{{\"change_index\":{},\"kind\":{},\"asset\":{},\"sub\":{},\"out_amount\":\"{}\",\"new_amount\":\"{}\"}}]}}",
            change_index, spent.kind, spent.asset, spent.sub, spent.out_amount, n.amount
        ));
        TransactResult {
            change_index: U64(change_index),
            new_index: U64(change_index + 1),
            new_commitment: to_dec(&new_commitment),
            new_kind: n.kind,
            new_asset: U64(n.asset),
            new_sub: n.sub,
            new_amount: U128(n.amount),
        }
    }

    /// Re-mints a bounced withdrawal as a private balance note (a missing recipient account, say).
    #[private]
    pub fn on_withdraw(&mut self, token: u8, amount: U128, refund_owner_blind: String) -> bool {
        if near_sdk::is_promise_success() {
            return true;
        }
        self.program_credits[token as usize] += amount.0;
        let blind = parse_fr(&refund_owner_blind);
        if blind != ZERO {
            let mint = Mint { kind: KIND_BALANCE, asset: token as u64, sub: 0, amount: amount.0 };
            self.mint_single(&mint, &blind, "refund".to_string());
        }
        false
    }

    // ---------------------------------------------------------------- views

    pub fn get_tree_info(&self) -> TreeInfo {
        TreeInfo { next_index: U64(self.tree.next_index), root: to_dec(&self.tree.root()), depth: DEPTH as u8 }
    }

    pub fn get_leaves(&self, from: U64, limit: u32) -> Vec<LeafView> {
        let end = (from.0 + limit.min(500) as u64).min(self.leaves.len() as u64);
        (from.0..end)
            .map(|i| {
                let leaf = self.leaves.get(i as u32).unwrap();
                LeafView {
                    index: U64(i),
                    commitment: to_dec(&leaf.commitment),
                    note: leaf.note.as_ref().map(|n| NoteView {
                        kind: n.kind,
                        asset: U64(n.asset),
                        sub: n.sub,
                        amount: U128(n.amount),
                        owner_blind: to_dec(&n.owner_blind),
                    }),
                    memo: leaf.memo.clone(),
                }
            })
            .collect()
    }

    pub fn is_spent(&self, nullifier: String) -> bool {
        self.nullifiers.contains(&parse_fr(&nullifier))
    }

    pub fn is_known_root(&self, root: String) -> bool {
        self.tree.is_known_root(&parse_fr(&root))
    }

    /// Virtual block height: one tick per 4 seconds of block time (the Aleo testnet cadence).
    pub fn get_height(&self) -> U64 {
        U64(env::block_timestamp_ms() / TICK_MS)
    }

    pub fn get_config(&self) -> Config {
        self.config.clone()
    }

    pub fn get_program_credits(&self) -> Vec<U128> {
        self.program_credits.iter().map(|x| U128(*x)).collect()
    }
}

impl Veiled {
    pub fn height(&self) -> u64 {
        env::block_timestamp_ms() / TICK_MS
    }

    /// Checks ext_data hash, root, nullifiers and the proof, then marks both nullifiers spent.
    fn verify_spend(&mut self, proof: &ProofArgs, public: &PublicArgs, ext_data: &str) -> Spent {
        let inputs: [Felt; vk::N_PUBLIC] = [
            parse_fr(&public.root),
            parse_fr(&public.nullifier1),
            parse_fr(&public.nullifier2),
            parse_fr(&public.change_commitment),
            parse_fr(&public.kind),
            parse_fr(&public.asset),
            parse_fr(&public.sub),
            parse_fr(&public.out_amount),
            parse_fr(&public.ext_data_hash),
        ];
        require!(inputs[8] == ext_data_hash(ext_data), "ERR_EXT_DATA_HASH");
        require!(self.tree.is_known_root(&inputs[0]), "ERR_UNKNOWN_ROOT");
        require!(inputs[1] != inputs[2], "ERR_DUPLICATE_NULLIFIER");
        require!(!self.nullifiers.contains(&inputs[1]) && !self.nullifiers.contains(&inputs[2]), "ERR_NULLIFIER_SPENT");
        require!(zk::verify(&zk::Proof::parse(proof), &inputs), "ERR_INVALID_PROOF");
        self.nullifiers.insert(inputs[1]);
        self.nullifiers.insert(inputs[2]);

        let kind = to_u128(&inputs[4]);
        let asset = to_u128(&inputs[5]);
        let sub = to_u128(&inputs[6]);
        require!(kind <= u8::MAX as u128 && asset <= u64::MAX as u128 && sub <= u8::MAX as u128, "ERR_FIELD_RANGE");
        let ext: ExtData =
            serde_json::from_str(ext_data).unwrap_or_else(|_| env::panic_str("ERR_EXT_DATA_JSON"));
        Spent {
            kind: kind as u8,
            asset: asset as u64,
            sub: sub as u8,
            out_amount: to_u128(&inputs[7]),
            change_commitment: inputs[3],
            ext,
        }
    }

    fn insert_pair(&mut self, a: Leaf, b: Leaf) -> u64 {
        let index = self.tree.insert_pair(&a.commitment, &b.commitment);
        self.leaves.push(a);
        self.leaves.push(b);
        index
    }

    /// Mints one note as a (note, empty) pair. Returns (index, commitment).
    pub(crate) fn mint_single(&mut self, m: &Mint, owner_blind: &Felt, memo: String) -> (u64, Felt) {
        require!(memo.len() <= MAX_MEMO, "ERR_MEMO_LEN");
        require!(*owner_blind != ZERO, "ERR_OWNER_BLIND");
        let commitment = poseidon::note_commitment(m.kind, m.asset, m.sub, m.amount, owner_blind);
        let info = NoteInfo { kind: m.kind, asset: m.asset, sub: m.sub, amount: m.amount, owner_blind: *owner_blind };
        let index = self.insert_pair(
            Leaf { commitment, note: Some(info), memo },
            Leaf { commitment: ZERO, note: None, memo: String::new() },
        );
        (index, commitment)
    }

    pub(crate) fn token_account(&self, token: u8) -> Option<AccountId> {
        match token {
            TOKEN_USDCX => Some(self.usdcx.clone()),
            TOKEN_USAD => Some(self.usad.clone()),
            _ => None,
        }
    }

    /// Sends `amount` micro units of `token` to `to`.
    pub(crate) fn pay(&self, token: u8, to: &AccountId, amount: u128) -> Promise {
        match self.token_account(token) {
            None => Promise::new(to.clone()).transfer(NearToken::from_yoctonear(amount * YOCTO_PER_MICRO)),
            Some(ft) => Promise::new(ft).function_call(
                "ft_transfer".to_string(),
                serde_json::json!({ "receiver_id": to, "amount": U128(amount) }).to_string().into_bytes(),
                NearToken::from_yoctonear(1),
                GAS_FT_TRANSFER,
            ),
        }
    }

    fn act_withdraw(&mut self, s: &Spent, recipient: AccountId, refund_blind: &Felt) {
        require!(s.kind == KIND_BALANCE && s.sub == 0, "ERR_NOTE_KIND");
        let token = s.asset as u8;
        require!((TOKEN_NEAR..=TOKEN_USAD).contains(&token) && s.asset <= TOKEN_USAD as u64, "ERR_TOKEN");
        let fee = s.ext.fee.0;
        require!(fee <= s.out_amount, "ERR_FEE");
        if s.out_amount == 0 {
            return; // a merge: both notes become one change note
        }
        self.program_credits[token as usize] -= s.out_amount;
        if fee > 0 {
            let relayer = s.ext.relayer.clone().unwrap_or_else(|| env::panic_str("ERR_RELAYER"));
            self.pay(token, &relayer, fee).detach();
        }
        let net = s.out_amount - fee;
        if net > 0 {
            self.pay(token, &recipient, net).then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_ON_WITHDRAW)
                    .on_withdraw(token, U128(net), to_dec(refund_blind)),
            )
            .detach();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> serde_json::Value {
        let text = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/../../integration-tests/fixtures/pool.json"))
            .expect("run near/circuits/scripts/gen-fixtures.mjs first");
        serde_json::from_str(&text).unwrap()
    }

    fn inputs_of(t: &serde_json::Value) -> (ProofArgs, [Felt; vk::N_PUBLIC]) {
        let proof: ProofArgs = serde_json::from_value(t["proof"].clone()).unwrap();
        let p: PublicArgs = serde_json::from_value(t["public"].clone()).unwrap();
        let inputs = [
            p.root, p.nullifier1, p.nullifier2, p.change_commitment, p.kind, p.asset, p.sub, p.out_amount, p.ext_data_hash,
        ]
        .map(|s| parse_fr(&s));
        (proof, inputs)
    }

    #[test]
    fn fixture_proofs_verify_with_the_host_functions() {
        let fx = fixture();
        for name in ["W1", "DD", "M"] {
            let (proof, inputs) = inputs_of(&fx["transacts"][name]);
            assert!(zk::verify(&zk::Proof::parse(&proof), &inputs), "{name} should verify");
        }
        let (proof, inputs) = inputs_of(&fx["transacts"]["M_bad_proof"]);
        assert!(!zk::verify(&zk::Proof::parse(&proof), &inputs), "altered public input must fail");
    }

    #[test]
    fn ext_data_hash_matches_the_circuit_input() {
        let fx = fixture();
        let t = &fx["transacts"]["W1"];
        let h = ext_data_hash(t["ext_data"].as_str().unwrap());
        assert_eq!(to_dec(&h), t["public"]["ext_data_hash"].as_str().unwrap());
    }
}
