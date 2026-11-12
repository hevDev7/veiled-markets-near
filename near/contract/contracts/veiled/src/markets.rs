//! FPMM prediction markets: port of veiled_markets_v37.aleo (+ the USDCX/USAD copies, as a token_type field),
//! including the working-tree fixes, bonded multi-voter resolution and committee escalation (governance tier 2).
//! Trades, redemptions and LP exits are private `transact` actions; votes, disputes and bonds are public calls,
//! as they are on Aleo.

use crate::field::parse_fr;
use crate::math::{self, fee};
use crate::*;

pub const STATUS_ACTIVE: u8 = 1;
pub const STATUS_CLOSED: u8 = 2;
pub const STATUS_RESOLVED: u8 = 3;
pub const STATUS_CANCELLED: u8 = 4;
pub const STATUS_PENDING_RESOLUTION: u8 = 5;
pub const STATUS_PENDING_FINALIZATION: u8 = 6;
pub const STATUS_DISPUTED: u8 = 7;

pub const MAX_METADATA: usize = 2048;
/// Protocol + creator + LP fee may not exceed 10% of a trade.
pub const MAX_TOTAL_FEE_BPS: u128 = 1000;

const KEY_COLLATERAL: &[u8] = b"oc";

pub(crate) fn collateral_key(market_id: u64) -> Vec<u8> {
    [KEY_COLLATERAL, &market_id.to_le_bytes()].concat()
}

/// Net collateral behind each outcome's outstanding shares: what a cancelled market refunds, outcome by outcome.
/// It always adds up to `trader_collateral`. Kept under its own storage key so the market record keeps its
/// layout; markets created before the ledger existed have no entry and refund by share count.
pub(crate) fn read_collateral(market_id: u64) -> Option<[u128; 4]> {
    env::storage_read(&collateral_key(market_id))
        .map(|b| near_sdk::borsh::from_slice(&b).unwrap_or_else(|_| env::panic_str("ERR_STATE")))
}

fn write_collateral(market_id: u64, oc: &[u128; 4]) {
    env::storage_write(&collateral_key(market_id), &near_sdk::borsh::to_vec(oc).unwrap());
}

#[near(serializers = [borsh])]
pub struct Market {
    pub id: u64,
    pub creator: AccountId,
    pub resolver: AccountId,
    pub question_hash: String,
    pub category: u8,
    pub num_outcomes: u8,
    pub deadline: u64,
    pub resolution_deadline: u64,
    pub status: u8,
    pub created_at: u64,
    pub token_type: u8,
    pub metadata: String,
}

#[near(serializers = [borsh])]
pub struct Pool {
    pub reserves: [u128; 4],
    pub total_liquidity: u128,
    pub total_lp_shares: u128,
    pub total_volume: u128,
}

#[near(serializers = [borsh])]
#[derive(Default)]
pub struct Tally {
    pub bonds: [u128; 4],
    pub total_voters: u8,
    pub total_bonded: u128,
    pub voting_deadline: u64,
    pub dispute_deadline: u64,
    pub finalized: bool,
    pub winning_outcome: u8,
}

#[near(serializers = [borsh])]
pub struct Dispute {
    pub disputer: AccountId,
    pub original_outcome: u8,
    pub proposed_outcome: u8,
    pub dispute_bond: u128,
    pub disputed_at: u64,
    pub escalated_tier: u8,
    pub final_outcome: u8,
    pub resolved_by: AccountId,
    pub bond_claimed: bool,
}

#[near(serializers = [borsh])]
pub struct MarketState {
    pub market: Market,
    pub pool: Pool,
    pub protocol_fees: u128,
    pub creator_fees: u128,
    pub tally: Option<Tally>,
    pub dispute: Option<Dispute>,
    pub market_credits: u128,
    pub outstanding_shares: u128,
    pub trader_collateral: u128,
    pub outcome_shares: [u128; 4],
    pub creator_fees_claimed: bool,
    pub trades: u64,
    pub escalation_tier: u8,
    pub committee_votes: Vec<(AccountId, u8)>,
    pub committee_outcome: u8,
    pub committee_finalized: bool,
}

#[near(serializers = [borsh])]
pub struct Vote {
    pub outcome: u8,
    pub bond: u128,
    pub claimed: bool,
}

#[near(serializers = [json])]
pub struct CreateMarketArgs {
    pub question_hash: String,
    pub category: u8,
    pub num_outcomes: u8,
    pub deadline: U64,
    pub resolution_deadline: U64,
    /// JSON text: question, description, outcome labels, resolution source, image.
    pub metadata: String,
    pub lp_owner_blind: String,
    pub lp_memo: String,
}

#[near(serializers = [json])]
pub struct TallyView {
    pub outcome_bonds: [U128; 4],
    pub total_voters: u8,
    pub total_bonded: U128,
    pub voting_deadline: U64,
    pub dispute_deadline: U64,
    pub finalized: bool,
    pub winning_outcome: u8,
}

#[near(serializers = [json])]
pub struct DisputeView {
    pub disputer: AccountId,
    pub original_outcome: u8,
    pub proposed_outcome: u8,
    pub dispute_bond: U128,
    pub disputed_at: U64,
    pub escalated_tier: u8,
    pub final_outcome: u8,
    pub resolved_by: AccountId,
}

/// Everything the frontend reads for one market (the Aleo `markets`, `amm_pools`, `market_fees`,
/// `vote_tallies`, `market_dispute_state` and `market_credits` mappings in one view).
#[near(serializers = [json])]
pub struct MarketView {
    pub id: U64,
    pub creator: AccountId,
    pub resolver: AccountId,
    pub question_hash: String,
    pub category: u8,
    pub num_outcomes: u8,
    pub deadline: U64,
    pub resolution_deadline: U64,
    pub status: u8,
    pub created_at: U64,
    pub token_type: u8,
    pub metadata: String,
    pub reserves: [U128; 4],
    pub total_liquidity: U128,
    pub total_lp_shares: U128,
    pub total_volume: U128,
    pub protocol_fees: U128,
    pub creator_fees: U128,
    pub tally: Option<TallyView>,
    pub dispute: Option<DisputeView>,
    pub market_credits: U128,
    pub outstanding_shares: U128,
    pub trader_collateral: U128,
    pub outcome_shares: [U128; 4],
    /// Net collateral behind each outcome's shares (None for markets older than the ledger).
    pub outcome_collateral: Option<[U128; 4]>,
    /// The owner approved this market as a parlay leg.
    pub parlay_leg: bool,
    pub creator_fees_claimed: bool,
    pub trades: U64,
    pub escalation_tier: u8,
    pub committee_votes: u8,
    pub committee_outcome: u8,
    pub committee_finalized: bool,
}

#[near(serializers = [json])]
pub struct VoteView {
    pub outcome: u8,
    pub bond: U128,
    pub claimed: bool,
}

#[near(serializers = [json])]
pub struct GovernanceValues {
    pub protocol_fee_bps: U128,
    pub creator_fee_bps: U128,
    pub lp_fee_bps: U128,
    pub min_trade_amount: U128,
    pub min_liquidity: U128,
    pub paused: bool,
}

fn u4(a: [u128; 4]) -> [U128; 4] {
    a.map(U128)
}

impl MarketState {
    fn view(&self) -> MarketView {
        let m = &self.market;
        MarketView {
            id: U64(m.id),
            creator: m.creator.clone(),
            resolver: m.resolver.clone(),
            question_hash: m.question_hash.clone(),
            category: m.category,
            num_outcomes: m.num_outcomes,
            deadline: U64(m.deadline),
            resolution_deadline: U64(m.resolution_deadline),
            status: m.status,
            created_at: U64(m.created_at),
            token_type: m.token_type,
            metadata: m.metadata.clone(),
            reserves: u4(self.pool.reserves),
            total_liquidity: U128(self.pool.total_liquidity),
            total_lp_shares: U128(self.pool.total_lp_shares),
            total_volume: U128(self.pool.total_volume),
            protocol_fees: U128(self.protocol_fees),
            creator_fees: U128(self.creator_fees),
            tally: self.tally.as_ref().map(|t| TallyView {
                outcome_bonds: u4(t.bonds),
                total_voters: t.total_voters,
                total_bonded: U128(t.total_bonded),
                voting_deadline: U64(t.voting_deadline),
                dispute_deadline: U64(t.dispute_deadline),
                finalized: t.finalized,
                winning_outcome: t.winning_outcome,
            }),
            dispute: self.dispute.as_ref().map(|d| DisputeView {
                disputer: d.disputer.clone(),
                original_outcome: d.original_outcome,
                proposed_outcome: d.proposed_outcome,
                dispute_bond: U128(d.dispute_bond),
                disputed_at: U64(d.disputed_at),
                escalated_tier: d.escalated_tier,
                final_outcome: d.final_outcome,
                resolved_by: d.resolved_by.clone(),
            }),
            market_credits: U128(self.market_credits),
            outstanding_shares: U128(self.outstanding_shares),
            trader_collateral: U128(self.trader_collateral),
            outcome_shares: u4(self.outcome_shares),
            outcome_collateral: read_collateral(m.id).map(u4),
            parlay_leg: crate::parlay::is_leg(m.id),
            creator_fees_claimed: self.creator_fees_claimed,
            trades: U64(self.trades),
            escalation_tier: self.escalation_tier,
            committee_votes: self.committee_votes.len() as u8,
            committee_outcome: self.committee_outcome,
            committee_finalized: self.committee_finalized,
        }
    }
}

/// Attached deposit in micro NEAR; must be a whole number of micro units.
pub(crate) fn attached_micro() -> u128 {
    let yocto = env::attached_deposit().as_yoctonear();
    require!(yocto % YOCTO_PER_MICRO == 0, "ERR_DEPOSIT_UNIT");
    yocto / YOCTO_PER_MICRO
}

fn vote_key(market_id: u64, account: &AccountId) -> String {
    format!("{market_id}:{account}")
}

#[near]
impl Veiled {
    /// Creates a NEAR-collateral market with the attached deposit as initial liquidity. The creator's LP
    /// position is minted as a private LP note. (USDCX/USAD markets go through `ft_transfer_call`.)
    #[payable]
    pub fn create_market(&mut self, args: CreateMarketArgs) -> U64 {
        let liquidity = attached_micro();
        U64(self.internal_create_market(env::predecessor_account_id(), TOKEN_NEAR, liquidity, args))
    }

    pub fn close_market(&mut self, market_id: U64) {
        let h = self.height();
        let st = self.market_mut(market_id.0);
        require!(st.market.status == STATUS_ACTIVE, "ERR_STATUS");
        require!(h > st.market.deadline, "ERR_NOT_EXPIRED");
        st.market.status = STATUS_CLOSED;
    }

    /// Bonded vote on the outcome. The bond (config.vote_bond micro NEAR) is attached.
    #[payable]
    pub fn vote_outcome(&mut self, market_id: U64, outcome: u8) {
        let bond = attached_micro();
        require!(bond == self.config.vote_bond.0, "ERR_VOTE_BOND");
        let h = self.height();
        let voter = env::predecessor_account_id();
        let key = vote_key(market_id.0, &voter);
        require!(!self.votes.contains_key(&key), "ERR_ALREADY_VOTED");
        let (vote_window, min_voters) = (self.config.vote_window, self.config.min_voters);
        let st = self.market_mut(market_id.0);
        let m = &st.market;
        require!(outcome >= 1 && outcome <= m.num_outcomes, "ERR_OUTCOME");
        let s = m.status;
        require!(
            s == STATUS_CLOSED || s == STATUS_PENDING_RESOLUTION || (s == STATUS_ACTIVE && h > m.deadline),
            "ERR_STATUS"
        );
        require!(h <= m.resolution_deadline, "ERR_RESOLUTION_EXPIRED");
        let tally = st.tally.get_or_insert_with(Tally::default);
        // The first vote opens the window. A window that closed short of the quorum reopens with the next vote,
        // so one early vote cannot leave the market with cancellation as its only way out.
        if tally.total_voters == 0 || (h > tally.voting_deadline && tally.total_voters < min_voters) {
            tally.voting_deadline = h + vote_window;
        } else {
            require!(h <= tally.voting_deadline, "ERR_VOTING_CLOSED");
        }
        tally.bonds[(outcome - 1) as usize] += bond;
        tally.total_voters += 1;
        tally.total_bonded += bond;
        st.market.status = STATUS_PENDING_RESOLUTION;
        self.program_credits[TOKEN_NEAR as usize] += bond;
        self.votes.insert(key, Vote { outcome, bond, claimed: false });
    }

    pub fn finalize_votes(&mut self, market_id: U64) {
        let h = self.height();
        let (min_voters, dispute_window) = (self.config.min_voters, self.config.dispute_window);
        let st = self.market_mut(market_id.0);
        require!(st.market.status == STATUS_PENDING_RESOLUTION, "ERR_STATUS");
        let n = st.market.num_outcomes;
        let tally = st.tally.as_mut().unwrap_or_else(|| env::panic_str("ERR_NO_VOTES"));
        require!(!tally.finalized, "ERR_FINALIZED");
        require!(h > tally.voting_deadline, "ERR_VOTING_OPEN");
        require!(tally.total_voters >= min_voters, "ERR_QUORUM");
        tally.winning_outcome = math::vote_winner(tally.bonds, n);
        tally.dispute_deadline = h + dispute_window;
        st.market.status = STATUS_PENDING_FINALIZATION;
    }

    pub fn confirm_resolution(&mut self, market_id: U64) {
        let h = self.height();
        let st = self.market_mut(market_id.0);
        require!(st.market.status == STATUS_PENDING_FINALIZATION, "ERR_STATUS");
        require!(st.dispute.is_none(), "ERR_DISPUTED");
        let tally = st.tally.as_mut().unwrap();
        require!(tally.winning_outcome >= 1, "ERR_NO_WINNER");
        require!(h > tally.dispute_deadline, "ERR_DISPUTE_WINDOW");
        let losing = tally.total_bonded - tally.bonds[(tally.winning_outcome - 1) as usize];
        tally.finalized = true;
        st.market.status = STATUS_RESOLVED;
        self.treasury[TOKEN_NEAR as usize] += losing;
    }

    /// Disputes the voted outcome with a bond of at least `dispute_bond_multiplier × total_bonded`.
    #[payable]
    pub fn dispute_resolution(&mut self, market_id: U64, proposed_outcome: u8) {
        let bond = attached_micro();
        let h = self.height();
        let multiplier = self.config.dispute_bond_multiplier as u128;
        let disputer = env::predecessor_account_id();
        let st = self.market_mut(market_id.0);
        require!(st.market.status == STATUS_PENDING_FINALIZATION, "ERR_STATUS");
        require!(st.dispute.is_none(), "ERR_ALREADY_DISPUTED");
        let tally = st.tally.as_ref().unwrap();
        require!(h <= tally.dispute_deadline, "ERR_DISPUTE_WINDOW");
        require!(proposed_outcome >= 1 && proposed_outcome <= st.market.num_outcomes, "ERR_OUTCOME");
        require!(proposed_outcome != tally.winning_outcome, "ERR_SAME_OUTCOME");
        require!(bond >= multiplier * tally.total_bonded, "ERR_DISPUTE_BOND");
        let original = tally.winning_outcome;
        let creator = st.market.creator.clone();
        st.dispute = Some(Dispute {
            disputer,
            original_outcome: original,
            proposed_outcome,
            dispute_bond: bond,
            disputed_at: h,
            escalated_tier: 0,
            final_outcome: 0,
            resolved_by: creator,
            bond_claimed: false,
        });
        st.market.status = STATUS_DISPUTED;
        self.program_credits[TOKEN_NEAR as usize] += bond;
    }

    pub fn cancel_market(&mut self, market_id: U64) {
        let h = self.height();
        let timeout = self.config.disputed_timeout;
        let caller = env::predecessor_account_id();
        let st = self.market_mut(market_id.0);
        let m = &st.market;
        let creator_path = caller == m.creator && m.status == STATUS_ACTIVE && st.pool.total_volume == 0;
        // PENDING_FINALIZATION already has a voted outcome: it is confirmed (or disputed), never cancelled, so
        // the side that lost the vote cannot void the market by waiting out the resolution deadline.
        let emergency_path = h > m.resolution_deadline
            && !matches!(
                m.status,
                STATUS_RESOLVED | STATUS_CANCELLED | STATUS_DISPUTED | STATUS_PENDING_FINALIZATION
            );
        let dispute_timeout_path =
            m.status == STATUS_DISPUTED && st.dispute.as_ref().is_some_and(|d| h > d.disputed_at + timeout);
        require!(creator_path || emergency_path || dispute_timeout_path, "ERR_CANNOT_CANCEL");
        st.market.status = STATUS_CANCELLED;
    }

    /// Returns the caller's vote bond: winners on RESOLVED (losers were slashed), everyone on CANCELLED.
    pub fn claim_voter_bond(&mut self, market_id: U64) -> U128 {
        let caller = env::predecessor_account_id();
        let key = vote_key(market_id.0, &caller);
        let st = self.market_ref(market_id.0);
        let status = st.market.status;
        let winner = st.tally.as_ref().map(|t| t.winning_outcome).unwrap_or(0);
        let vote = self.votes.get_mut(&key).unwrap_or_else(|| env::panic_str("ERR_NO_VOTE"));
        require!(!vote.claimed, "ERR_CLAIMED");
        match status {
            STATUS_CANCELLED => {}
            STATUS_RESOLVED => require!(vote.outcome == winner, "ERR_LOSING_VOTE"),
            _ => env::panic_str("ERR_STATUS"),
        }
        vote.claimed = true;
        let bond = vote.bond;
        self.program_credits[TOKEN_NEAR as usize] -= bond;
        self.pay(TOKEN_NEAR, &caller, bond).detach(); // NEAR to the signer itself cannot bounce
        U128(bond)
    }

    pub fn claim_dispute_bond(&mut self, market_id: U64) -> U128 {
        let caller = env::predecessor_account_id();
        let st = self.market_mut(market_id.0);
        let status = st.market.status;
        let winner = st.tally.as_ref().map(|t| t.winning_outcome).unwrap_or(0);
        let d = st.dispute.as_mut().unwrap_or_else(|| env::panic_str("ERR_NO_DISPUTE"));
        require!(d.disputer == caller, "ERR_NOT_DISPUTER");
        require!(!d.bond_claimed, "ERR_CLAIMED");
        match status {
            STATUS_CANCELLED => {}
            STATUS_RESOLVED => require!(d.proposed_outcome == winner, "ERR_LOSING_DISPUTE"),
            _ => env::panic_str("ERR_STATUS"),
        }
        d.bond_claimed = true;
        let bond = d.dispute_bond;
        self.program_credits[TOKEN_NEAR as usize] -= bond;
        self.pay(TOKEN_NEAR, &caller, bond).detach(); // NEAR to the signer itself cannot bounce
        U128(bond)
    }

    /// The creator's fee share, once, after the winner-claim priority window. Paid publicly (as on Aleo).
    pub fn withdraw_creator_fees(&mut self, market_id: U64) -> U128 {
        let h = self.height();
        let priority = self.config.winner_claim_priority;
        let caller = env::predecessor_account_id();
        let st = self.market_mut(market_id.0);
        require!(st.market.status == STATUS_RESOLVED, "ERR_STATUS");
        require!(st.market.creator == caller, "ERR_NOT_CREATOR");
        let tally = st.tally.as_ref().unwrap();
        require!(tally.finalized, "ERR_NOT_FINAL");
        require!(h > tally.dispute_deadline + priority, "ERR_PRIORITY_WINDOW");
        require!(!st.creator_fees_claimed, "ERR_CLAIMED");
        st.creator_fees_claimed = true;
        let amount = st.creator_fees;
        require!(st.market_credits >= amount, "ERR_MARKET_CREDITS");
        st.market_credits -= amount;
        let token = st.market.token_type;
        self.program_credits[token as usize] -= amount;
        if amount > 0 {
            self.pay_booked(token, &caller, amount);
        }
        U128(amount)
    }

    // ------------------------------------------------------------ committee escalation (governance tier 2)

    pub fn initiate_escalation(&mut self, market_id: U64) {
        let st = self.market_mut(market_id.0);
        require!(st.market.status == STATUS_DISPUTED, "ERR_STATUS");
        require!(st.escalation_tier == 0, "ERR_TIER");
        st.escalation_tier = 2;
        if let Some(d) = st.dispute.as_mut() {
            d.escalated_tier = 2;
        }
    }

    pub fn committee_vote_resolve(&mut self, market_id: U64, outcome: u8) {
        let caller = env::predecessor_account_id();
        require!(self.committee.contains(&caller), "ERR_NOT_COMMITTEE");
        let st = self.market_mut(market_id.0);
        require!(st.escalation_tier == 2, "ERR_TIER");
        require!(!st.committee_finalized, "ERR_FINALIZED");
        require!(outcome >= 1 && outcome <= st.market.num_outcomes, "ERR_OUTCOME");
        require!(!st.committee_votes.iter().any(|(a, _)| *a == caller), "ERR_ALREADY_VOTED");
        st.committee_votes.push((caller, outcome));
    }

    /// Finalizes when one outcome has at least `committee_quorum` votes and no tie at the top.
    pub fn finalize_committee_vote(&mut self, market_id: U64) {
        let quorum = self.config.committee_quorum as usize;
        let st = self.market_mut(market_id.0);
        require!(st.escalation_tier == 2 && !st.committee_finalized, "ERR_TIER");
        require!(st.committee_votes.len() >= quorum, "ERR_QUORUM");
        let mut counts = [0usize; 4];
        for (_, o) in &st.committee_votes {
            counts[(*o - 1) as usize] += 1;
        }
        let max = *counts.iter().max().unwrap();
        let leaders: Vec<_> = (0..4).filter(|&k| counts[k] == max).collect();
        require!(max >= quorum && leaders.len() == 1, "ERR_NO_MAJORITY");
        st.committee_outcome = leaders[0] as u8 + 1;
        st.committee_finalized = true;
    }

    /// Applies the committee decision: RESOLVED, losing voter bonds and a wrong disputer's bond slashed.
    pub fn governance_resolve(&mut self, market_id: U64) {
        let me = env::current_account_id();
        let st = self.market_mut(market_id.0);
        require!(st.market.status == STATUS_DISPUTED, "ERR_STATUS");
        require!(st.committee_finalized, "ERR_NOT_DECIDED");
        let outcome = st.committee_outcome;
        let tally = st.tally.as_mut().unwrap();
        let mut slashed = tally.total_bonded - tally.bonds[(outcome - 1) as usize];
        tally.winning_outcome = outcome;
        tally.finalized = true;
        let d = st.dispute.as_mut().unwrap();
        if d.proposed_outcome != outcome {
            slashed += d.dispute_bond;
            d.bond_claimed = true;
        }
        d.final_outcome = outcome;
        d.escalated_tier = 2;
        d.resolved_by = me.clone();
        st.market.resolver = me;
        st.market.status = STATUS_RESOLVED;
        self.treasury[TOKEN_NEAR as usize] += slashed;
    }

    // ------------------------------------------------------------ owner parameters

    /// Aleo `set_governance_value` keys: 1 protocol fee, 2 creator fee, 3 LP fee, 4 min trade,
    /// 5 min liquidity, 6 pause.
    pub fn set_governance_value(&mut self, key: u8, value: U128) {
        require!(env::predecessor_account_id() == self.owner, "ERR_OWNER");
        let v = value.0;
        let c = &mut self.config;
        match key {
            1 | 2 | 3 => {
                let (mut p, mut cr, mut l) = (c.protocol_fee_bps.0, c.creator_fee_bps.0, c.lp_fee_bps.0);
                match key {
                    1 => p = v,
                    2 => cr = v,
                    _ => l = v,
                }
                require!(p + cr + l <= MAX_TOTAL_FEE_BPS, "ERR_FEES");
                (c.protocol_fee_bps, c.creator_fee_bps, c.lp_fee_bps) = (U128(p), U128(cr), U128(l));
            }
            4 => {
                require!(v > 0, "ERR_VALUE");
                c.min_trade = value;
            }
            5 => {
                require!(v > 0, "ERR_VALUE");
                c.min_liquidity = value;
            }
            6 => {
                require!(v <= 1, "ERR_VALUE");
                self.paused = v == 1;
            }
            _ => env::panic_str("ERR_KEY"),
        }
    }

    /// Owner only. The resolution windows (ticks), the vote bond, the quorums and the dispute multiplier; any
    /// argument left out keeps its value. Votes, disputes and finalizations made afterwards use the new values;
    /// deadlines and bonds already recorded do not change.
    #[allow(clippy::too_many_arguments)]
    pub fn set_resolution_config(
        &mut self,
        vote_window: Option<U64>,
        dispute_window: Option<U64>,
        winner_claim_priority: Option<U64>,
        disputed_timeout: Option<U64>,
        vote_bond: Option<U128>,
        min_voters: Option<u8>,
        dispute_bond_multiplier: Option<u8>,
        committee_quorum: Option<u8>,
    ) {
        require!(env::predecessor_account_id() == self.owner, "ERR_OWNER");
        let members = self.committee.len() as u8;
        let c = &mut self.config;
        if let Some(v) = vote_window {
            require!(v.0 > 0, "ERR_VALUE");
            c.vote_window = v.0;
        }
        if let Some(v) = dispute_window {
            require!(v.0 > 0, "ERR_VALUE");
            c.dispute_window = v.0;
        }
        if let Some(v) = winner_claim_priority {
            c.winner_claim_priority = v.0;
        }
        if let Some(v) = disputed_timeout {
            require!(v.0 > 0, "ERR_VALUE");
            c.disputed_timeout = v.0;
        }
        if let Some(v) = vote_bond {
            require!(v.0 > 0, "ERR_VALUE");
            c.vote_bond = v;
        }
        if let Some(v) = min_voters {
            require!(v > 0, "ERR_VALUE");
            c.min_voters = v;
        }
        if let Some(v) = dispute_bond_multiplier {
            require!(v > 0, "ERR_VALUE");
            c.dispute_bond_multiplier = v;
        }
        if let Some(v) = committee_quorum {
            // More than half of the committee, so two different outcomes cannot both reach it.
            require!(v > members / 2 && v <= members, "ERR_VALUE");
            c.committee_quorum = v;
        }
    }

    pub fn withdraw_treasury(&mut self, token: u8, amount: U128, recipient: AccountId) {
        require!(env::predecessor_account_id() == self.owner, "ERR_OWNER");
        require!(self.treasury[token as usize] >= amount.0, "ERR_TREASURY");
        self.treasury[token as usize] -= amount.0;
        self.program_credits[token as usize] -= amount.0;
        self.pay_booked(token, &recipient, amount.0);
    }

    // ------------------------------------------------------------ views

    pub fn get_market(&self, market_id: U64) -> Option<MarketView> {
        self.markets.get(&market_id.0).map(|st| st.view())
    }

    /// Prediction markets by creation order: indexes [from, from + limit) of the market list.
    pub fn get_markets(&self, from: U64, limit: u32) -> Vec<MarketView> {
        let end = from.0.saturating_add(limit.min(100) as u64).min(self.market_ids.len() as u64);
        (from.0..end)
            .filter_map(|i| self.market_ids.get(i as u32).and_then(|id| self.markets.get(id)).map(|st| st.view()))
            .collect()
    }

    pub fn get_market_count(&self) -> U64 {
        U64(self.market_ids.len() as u64)
    }

    pub fn get_vote(&self, market_id: U64, account_id: AccountId) -> Option<VoteView> {
        self.votes
            .get(&vote_key(market_id.0, &account_id))
            .map(|v| VoteView { outcome: v.outcome, bond: U128(v.bond), claimed: v.claimed })
    }

    pub fn get_governance_values(&self) -> GovernanceValues {
        let c = &self.config;
        GovernanceValues {
            protocol_fee_bps: c.protocol_fee_bps,
            creator_fee_bps: c.creator_fee_bps,
            lp_fee_bps: c.lp_fee_bps,
            min_trade_amount: c.min_trade,
            min_liquidity: c.min_liquidity,
            paused: self.paused,
        }
    }

    pub fn get_treasury(&self) -> Vec<U128> {
        self.treasury.iter().map(|x| U128(*x)).collect()
    }

    pub fn get_next_id(&self) -> U64 {
        U64(self.next_id)
    }
}

impl Veiled {
    pub(crate) fn market_mut(&mut self, id: u64) -> &mut MarketState {
        self.markets.get_mut(&id).unwrap_or_else(|| env::panic_str("ERR_NO_MARKET"))
    }

    pub(crate) fn market_ref(&self, id: u64) -> &MarketState {
        self.markets.get(&id).unwrap_or_else(|| env::panic_str("ERR_NO_MARKET"))
    }

    pub(crate) fn take_id(&mut self) -> u64 {
        let id = self.next_id;
        self.next_id += 1;
        id
    }

    pub(crate) fn internal_create_market(
        &mut self,
        creator: AccountId,
        token: u8,
        liquidity: u128,
        args: CreateMarketArgs,
    ) -> u64 {
        require!(!self.paused, "ERR_PAUSED");
        let n = args.num_outcomes;
        require!((2..=4).contains(&n), "ERR_OUTCOMES");
        require!(liquidity >= self.config.min_liquidity.0, "ERR_MIN_LIQUIDITY");
        let h = self.height();
        require!(args.deadline.0 > h, "ERR_DEADLINE");
        // Resolution needs a vote window, a dispute window, and one more vote window for the first vote to arrive.
        let room = 2 * self.config.vote_window + self.config.dispute_window;
        require!(
            args.resolution_deadline.0 > args.deadline.0 && args.resolution_deadline.0 - args.deadline.0 >= room,
            "ERR_RESOLUTION_DEADLINE"
        );
        require!(args.metadata.len() <= MAX_METADATA, "ERR_METADATA_LEN");
        require!(args.question_hash.len() <= 96, "ERR_QUESTION_HASH");
        let lp_blind = parse_fr(&args.lp_owner_blind);

        let id = self.take_id();
        let per = liquidity / n as u128;
        let mut reserves = [0u128; 4];
        for r in reserves.iter_mut().take(n as usize) {
            *r = per;
        }
        let state = MarketState {
            market: Market {
                id,
                creator: creator.clone(),
                resolver: creator,
                question_hash: args.question_hash,
                category: args.category,
                num_outcomes: n,
                deadline: args.deadline.0,
                resolution_deadline: args.resolution_deadline.0,
                status: STATUS_ACTIVE,
                created_at: h,
                token_type: token,
                metadata: args.metadata,
            },
            pool: Pool { reserves, total_liquidity: liquidity, total_lp_shares: liquidity, total_volume: 0 },
            protocol_fees: 0,
            creator_fees: 0,
            tally: None,
            dispute: None,
            market_credits: liquidity,
            outstanding_shares: 0,
            trader_collateral: 0,
            outcome_shares: [0; 4],
            creator_fees_claimed: false,
            trades: 0,
            escalation_tier: 0,
            committee_votes: Vec::new(),
            committee_outcome: 0,
            committee_finalized: false,
        };
        self.markets.insert(id, state);
        write_collateral(id, &[0; 4]);
        self.market_ids.push(id);
        self.program_credits[token as usize] += liquidity;
        let lp = Mint { kind: KIND_LP, asset: id, sub: 0, amount: liquidity };
        self.mint_single(&lp, &lp_blind, args.lp_memo);
        env::log_str(&format!(
            "EVENT_JSON:{{\"standard\":\"veiled\",\"version\":\"1.0.0\",\"event\":\"market_created\",\"data\":[{{\"market_id\":\"{id}\",\"token_type\":{token}}}]}}"
        ));
        id
    }

    /// Private market actions (see DESIGN §4). Turbo and parlay actions are handled in turbo.rs and parlay.rs.
    pub(crate) fn act_market(&mut self, s: &Spent) -> Option<Mint> {
        match &s.ext.action {
            Action::Buy { market_id, outcome, min_shares_out } => {
                Some(self.act_buy(s, market_id.0, *outcome, min_shares_out.0))
            }
            Action::Sell { tokens_desired } => Some(self.act_sell(s, tokens_desired.0)),
            Action::AddLiquidity { market_id, min_lp_shares } => {
                Some(self.act_add_liquidity(s, market_id.0, min_lp_shares.0))
            }
            Action::Redeem => Some(self.act_redeem(s)),
            Action::Refund => Some(self.act_refund(s)),
            Action::WithdrawLp { min_tokens_out } => Some(self.act_withdraw_lp(s, min_tokens_out.0)),
            Action::TurboBuy { market_id, side } => Some(self.act_turbo_buy(s, market_id.0, *side)),
            Action::TurboClaim => Some(self.act_turbo_claim(s)),
            Action::ParlayBuy { legs, min_payout } => Some(self.act_parlay_buy(s, legs, min_payout.0)),
            Action::ParlayClaim => Some(self.act_parlay_claim(s)),
            Action::Withdraw { .. } => unreachable!(),
        }
    }

    fn act_buy(&mut self, s: &Spent, market_id: u64, outcome: u8, min_shares_out: u128) -> Mint {
        let h = self.height();
        let (paused, min_trade) = (self.paused, self.config.min_trade.0);
        let (pfb, cfb) = (self.config.protocol_fee_bps.0, self.config.creator_fee_bps.0);
        let st = self.market_mut(market_id);
        let m = &st.market;
        require!(s.kind == KIND_BALANCE && s.asset == m.token_type as u64 && s.sub == 0, "ERR_NOTE_KIND");
        require!(m.status == STATUS_ACTIVE, "ERR_STATUS");
        require!(outcome >= 1 && outcome <= m.num_outcomes, "ERR_OUTCOME");
        require!(!paused, "ERR_PAUSED");
        require!(h <= m.deadline, "ERR_DEADLINE");
        let amount_in = s.out_amount;
        require!(amount_in >= min_trade, "ERR_MIN_TRADE");

        let protocol_fee = fee(amount_in, pfb);
        let creator_fee = fee(amount_in, cfb);
        let a = amount_in - protocol_fee - creator_fee;
        let (shares_out, reserves) = math::fpmm_buy(st.pool.reserves, m.num_outcomes, outcome, a);
        require!(shares_out > 0 && shares_out >= min_shares_out, "ERR_SLIPPAGE");

        // A market from before the ledger gets one only while nobody holds shares; otherwise it stays on the
        // old refund rule, because what its existing shares cost is not known.
        let ledger = read_collateral(market_id).or((st.outstanding_shares == 0).then_some([0; 4]));
        if let Some(mut oc) = ledger {
            oc[(outcome - 1) as usize] += a;
            write_collateral(market_id, &oc);
        }
        st.protocol_fees += protocol_fee;
        st.creator_fees += creator_fee;
        st.pool.reserves = reserves;
        st.pool.total_liquidity += a;
        st.pool.total_volume += amount_in;
        st.market_credits += amount_in - protocol_fee;
        st.outstanding_shares += shares_out;
        st.trader_collateral += a;
        st.outcome_shares[(outcome - 1) as usize] += shares_out;
        st.trades += 1;
        let token = st.market.token_type;
        self.treasury[token as usize] += protocol_fee;
        Mint { kind: KIND_SHARE, asset: market_id, sub: outcome, amount: shares_out }
    }

    /// Sells shares: the spend releases `shares` (out_amount) and the pool pays for all of them, the most
    /// collateral they cover and never less than `tokens_desired` (the seller's floor). Only the remainder too
    /// small to buy one more unit is dropped. (Aleo priced exactly `tokens_desired` and burned the shares offered
    /// beyond that, so the slippage allowance was lost on every sell.) The seller gets the released collateral
    /// minus all three fees in a balance note. The protocol fee goes to the treasury; the creator and LP fees stay
    /// in the market's collateral, where the creator fee is set aside and the LP fee becomes part of what LPs
    /// withdraw.
    fn act_sell(&mut self, s: &Spent, tokens_desired: u128) -> Mint {
        require!(s.kind == KIND_SHARE, "ERR_NOTE_KIND");
        let h = self.height();
        let (paused, min_trade) = (self.paused, self.config.min_trade.0);
        let (pfb, cfb, lfb) =
            (self.config.protocol_fee_bps.0, self.config.creator_fee_bps.0, self.config.lp_fee_bps.0);
        let market_id = s.asset;
        let outcome = s.sub;
        let shares = s.out_amount;
        let st = self.market_mut(market_id);
        let m = &st.market;
        require!(m.status == STATUS_ACTIVE, "ERR_STATUS");
        require!(outcome >= 1 && outcome <= m.num_outcomes, "ERR_OUTCOME");
        require!(!paused, "ERR_PAUSED");
        require!(h <= m.deadline, "ERR_DEADLINE");
        require!(tokens_desired >= min_trade, "ERR_MIN_TRADE");

        let (tokens_out, shares_used, reserves) =
            math::sell_max_tokens(st.pool.reserves, m.num_outcomes, outcome, shares, tokens_desired)
                .unwrap_or_else(|| env::panic_str("ERR_SLIPPAGE"));
        require!(shares_used > 0, "ERR_SLIPPAGE");
        let protocol_fee = fee(tokens_out, pfb);
        let creator_fee = fee(tokens_out, cfb);
        let lp_fee = fee(tokens_out, lfb);
        let net = tokens_out - protocol_fee - creator_fee - lp_fee;

        st.protocol_fees += protocol_fee;
        st.creator_fees += creator_fee;
        st.pool.reserves = reserves;
        st.pool.total_liquidity = st.pool.total_liquidity.saturating_sub(tokens_out);
        st.pool.total_volume += tokens_out;
        // What leaves the market: the seller's net and the protocol fee.
        let market_exit = net + protocol_fee;
        require!(st.market_credits >= market_exit, "ERR_MARKET_CREDITS");
        st.market_credits -= market_exit;
        st.outstanding_shares = st.outstanding_shares.saturating_sub(shares);
        st.trader_collateral = st.trader_collateral.saturating_sub(tokens_out);
        let o = (outcome - 1) as usize;
        st.outcome_shares[o] = st.outcome_shares[o].saturating_sub(shares);
        if let Some(oc) = read_collateral(market_id) {
            let mut oc = math::collateral_after_sell(oc, st.market.num_outcomes, outcome, tokens_out);
            // The outcome's last shares are gone: collateral it still carried is nobody's refund any more and
            // stays with the LPs.
            if st.outcome_shares[o] == 0 && oc[o] > 0 {
                st.trader_collateral = st.trader_collateral.saturating_sub(oc[o]);
                oc[o] = 0;
            }
            write_collateral(market_id, &oc);
        }
        st.trades += 1;
        let token = st.market.token_type;
        self.treasury[token as usize] += protocol_fee;
        Mint { kind: KIND_BALANCE, asset: token as u64, sub: 0, amount: net }
    }

    fn act_add_liquidity(&mut self, s: &Spent, market_id: u64, min_lp_shares: u128) -> Mint {
        let h = self.height();
        let (paused, min_liq) = (self.paused, self.config.min_liquidity.0);
        let st = self.market_mut(market_id);
        let m = &st.market;
        require!(s.kind == KIND_BALANCE && s.asset == m.token_type as u64 && s.sub == 0, "ERR_NOTE_KIND");
        require!(m.status == STATUS_ACTIVE, "ERR_STATUS");
        require!(!paused, "ERR_PAUSED");
        require!(h <= m.deadline, "ERR_DEADLINE");
        let amount = s.out_amount;
        require!(amount >= min_liq, "ERR_MIN_LIQUIDITY");
        let (lp, reserves) = math::add_liquidity(st.pool.reserves, m.num_outcomes, st.pool.total_lp_shares, amount);
        require!(lp > 0 && lp >= min_lp_shares, "ERR_SLIPPAGE");
        st.pool.reserves = reserves;
        st.pool.total_liquidity += amount;
        st.pool.total_lp_shares += lp;
        st.market_credits += amount;
        Mint { kind: KIND_LP, asset: market_id, sub: 0, amount: lp }
    }

    /// Winning shares pay 1:1 into a private balance note.
    fn act_redeem(&mut self, s: &Spent) -> Mint {
        require!(s.kind == KIND_SHARE, "ERR_NOTE_KIND");
        let q = s.out_amount;
        let st = self.market_mut(s.asset);
        require!(st.market.status == STATUS_RESOLVED, "ERR_STATUS");
        let tally = st.tally.as_ref().unwrap();
        require!(tally.finalized && s.sub == tally.winning_outcome, "ERR_NOT_WINNER");
        require!(q > 0, "ERR_AMOUNT");
        let o = (s.sub - 1) as usize;
        st.outcome_shares[o] = st.outcome_shares[o].saturating_sub(q);
        require!(st.market_credits >= q, "ERR_MARKET_CREDITS");
        st.market_credits -= q;
        Mint { kind: KIND_BALANCE, asset: st.market.token_type as u64, sub: 0, amount: q }
    }

    /// Cancelled market: an outcome's shares get back the collateral that was paid into that outcome, pro rata
    /// within it, so cheap shares of one outcome cannot draw on what another outcome's buyers paid. Markets
    /// from before the per-outcome ledger refund pro rata to all trader collateral, as before.
    fn act_refund(&mut self, s: &Spent) -> Mint {
        require!(s.kind == KIND_SHARE, "ERR_NOTE_KIND");
        let q = s.out_amount;
        let st = self.market_mut(s.asset);
        require!(st.market.status == STATUS_CANCELLED, "ERR_STATUS");
        require!(q > 0, "ERR_AMOUNT");
        let refund = match read_collateral(s.asset) {
            Some(mut oc) => {
                require!(s.sub >= 1 && s.sub <= st.market.num_outcomes, "ERR_OUTCOME");
                let o = (s.sub - 1) as usize;
                require!(st.outcome_shares[o] >= q, "ERR_AMOUNT");
                let refund = q * oc[o] / st.outcome_shares[o];
                oc[o] -= refund;
                st.outcome_shares[o] -= q;
                write_collateral(s.asset, &oc);
                refund
            }
            None => {
                require!(st.outstanding_shares >= q, "ERR_AMOUNT");
                q * st.trader_collateral / st.outstanding_shares
            }
        };
        require!(refund > 0, "ERR_AMOUNT");
        st.outstanding_shares = st.outstanding_shares.saturating_sub(q);
        st.trader_collateral = st.trader_collateral.saturating_sub(refund);
        require!(st.market_credits >= refund, "ERR_MARKET_CREDITS");
        st.market_credits -= refund;
        Mint { kind: KIND_BALANCE, asset: st.market.token_type as u64, sub: 0, amount: refund }
    }

    /// LP exit. RESOLVED: after the winner-claim priority window, reserving collateral owed to unredeemed
    /// winners and to unclaimed creator fees. CANCELLED: what is left after trader collateral.
    fn act_withdraw_lp(&mut self, s: &Spent, min_tokens_out: u128) -> Mint {
        require!(s.kind == KIND_LP && s.sub == 0, "ERR_NOTE_KIND");
        let h = self.height();
        let priority = self.config.winner_claim_priority;
        let lp = s.out_amount;
        let st = self.market_mut(s.asset);
        require!(lp > 0 && st.pool.total_lp_shares > 0, "ERR_AMOUNT");
        let lp_pool = match st.market.status {
            STATUS_RESOLVED => {
                let tally = st.tally.as_ref().unwrap();
                require!(tally.finalized, "ERR_NOT_FINAL");
                require!(h > tally.dispute_deadline + priority, "ERR_PRIORITY_WINDOW");
                let reserved = st.outcome_shares[(tally.winning_outcome - 1) as usize]
                    + if st.creator_fees_claimed { 0 } else { st.creator_fees };
                st.market_credits.saturating_sub(reserved)
            }
            STATUS_CANCELLED => st.market_credits.saturating_sub(st.trader_collateral),
            _ => env::panic_str("ERR_STATUS"),
        };
        let tokens_out = lp * lp_pool / st.pool.total_lp_shares;
        require!(tokens_out > 0 && tokens_out >= min_tokens_out, "ERR_SLIPPAGE");
        st.market_credits -= tokens_out;
        st.pool.total_lp_shares -= lp;
        st.pool.total_liquidity = st.pool.total_liquidity.saturating_sub(tokens_out);
        Mint { kind: KIND_BALANCE, asset: st.market.token_type as u64, sub: 0, amount: tokens_out }
    }
}
