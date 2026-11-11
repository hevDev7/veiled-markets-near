//! JSON argument and view types. Field elements are decimal strings; u64/u128 use U64/U128 (strings).

use near_sdk::json_types::{U128, U64};
use near_sdk::{near, AccountId};

/// Groth16 proof in snarkjs order without the projective coordinate.
#[near(serializers = [json])]
#[derive(Clone)]
pub struct ProofArgs {
    pub a: [String; 2],
    pub b: [[String; 2]; 2],
    pub c: [String; 2],
}

/// Public signals of spend.circom, in circuit order.
#[near(serializers = [json])]
#[derive(Clone)]
pub struct PublicArgs {
    pub root: String,
    pub nullifier1: String,
    pub nullifier2: String,
    pub change_commitment: String,
    pub kind: String,
    pub asset: String,
    pub sub: String,
    pub out_amount: String,
    pub ext_data_hash: String,
}

/// What a private spend does. `ext_data` is the JSON text of this struct; its sha256 is bound into the proof.
#[near(serializers = [json])]
pub struct ExtData {
    pub action: Action,
    /// Owner blind of the note the contract mints (or of the refund note if a withdrawal bounces).
    pub new_owner_blind: String,
    pub new_memo: String,
    pub change_memo: String,
    #[serde(default)]
    pub relayer: Option<AccountId>,
    pub fee: U128,
}

#[near(serializers = [json])]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Action {
    Withdraw { recipient: AccountId },
    Buy { market_id: U64, outcome: u8, min_shares_out: U128 },
    Sell { tokens_desired: U128 },
    AddLiquidity { market_id: U64, min_lp_shares: U128 },
    Redeem,
    Refund,
    WithdrawLp { min_tokens_out: U128 },
    TurboBuy { market_id: U64, side: u8 },
    TurboClaim,
}

#[near(serializers = [json])]
pub struct TransactResult {
    pub change_index: U64,
    pub new_index: U64,
    pub new_commitment: String,
    pub new_kind: u8,
    pub new_asset: U64,
    pub new_sub: u8,
    pub new_amount: U128,
}

#[near(serializers = [json])]
pub struct NoteView {
    pub kind: u8,
    pub asset: U64,
    pub sub: u8,
    pub amount: U128,
    pub owner_blind: String,
}

#[near(serializers = [json])]
pub struct LeafView {
    pub index: U64,
    pub commitment: String,
    pub note: Option<NoteView>,
    pub memo: String,
}

#[near(serializers = [json])]
pub struct TreeInfo {
    pub next_index: U64,
    pub root: String,
    pub depth: u8,
}

/// Protocol parameters. Windows are in 4-second ticks, amounts in 6-decimal micro units.
/// Defaults are the Aleo program's constants (contracts-v37/src/main.leo:32-89).
#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Config {
    pub vote_window: u64,
    pub dispute_window: u64,
    pub winner_claim_priority: u64,
    pub disputed_timeout: u64,
    pub vote_bond: U128,
    pub min_voters: u8,
    pub dispute_bond_multiplier: u8,
    pub min_trade: U128,
    pub min_liquidity: U128,
    pub protocol_fee_bps: U128,
    pub creator_fee_bps: U128,
    pub lp_fee_bps: U128,
    pub committee_quorum: u8,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            vote_window: 2880,
            dispute_window: 2880,
            winner_claim_priority: 2880,
            disputed_timeout: 100_800,
            vote_bond: U128(10_000_000),
            min_voters: 3,
            dispute_bond_multiplier: 3,
            min_trade: U128(1000),
            min_liquidity: U128(10_000),
            protocol_fee_bps: U128(50),
            creator_fee_bps: U128(50),
            lp_fee_bps: U128(100),
            committee_quorum: 3,
        }
    }
}
