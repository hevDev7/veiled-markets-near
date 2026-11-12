//! Parlays: port of veiled_parlay (contracts-parlay/src/main.leo), simplified by living in the same contract
//! as the markets. A parlay combines 2–4 legs (market, outcome); all legs must win.
//!
//! Differences from the Aleo program, each removing a trust assumption:
//! - Odds come from the live FPMM pools at placement (leg odds = 1 / outcome price), not from the caller
//!   (Aleo finding P-1: caller-supplied odds could inflate payouts).
//! - Settlement reads the leg markets directly, so there is no resolver submission and no dispute window.
//!
//! Placement and claims are private `transact` actions: a balance note pays the stake and the contract mints a
//! parlay ticket note (kind 5, asset = parlay id, sub = 0, amount = potential payout). The parlay itself
//! (legs, stake, payout) is public, like an AMM trade. Payouts come from a per-token pool the operator funds;
//! a parlay is accepted only while the pool covers 110% of every open obligation.
//!
//! State lives under its own storage keys (not in the root struct), so adding parlays did not change the
//! layout of the deployed contract's state.

use crate::markets::{STATUS_ACTIVE, STATUS_CANCELLED, STATUS_RESOLVED};
use crate::math::FEE_DENOMINATOR;
use crate::*;
use near_sdk::borsh;

pub const PARLAY_ACTIVE: u8 = 1;
pub const PARLAY_WON: u8 = 2;
pub const PARLAY_LOST: u8 = 3;
pub const PARLAY_CANCELLED: u8 = 4;

pub const LEG_PENDING: u8 = 0;
pub const LEG_WON: u8 = 1;
pub const LEG_LOST: u8 = 2;
pub const LEG_CANCELLED: u8 = 3;

pub const MIN_LEGS: usize = 2;
pub const MAX_LEGS: usize = 4;
/// Odds are basis points of the stake: 25_000 = 2.5×.
pub const ODDS_PRECISION: u128 = 10_000;
/// 100× per leg.
pub const MAX_LEG_ODDS: u128 = 1_000_000;
/// The pool must hold 110% of open obligations after accepting a parlay.
pub const SAFETY_BPS: u128 = 11_000;
/// Scale for the inverse-reserve weights (1/r_k); reserves are micro units, far below this.
const WEIGHT_SCALE: u128 = 1_000_000_000_000_000_000_000_000_000_000;

const KEY_GLOBALS: &[u8] = b"pg";
const KEY_PARLAY: &[u8] = b"pl";

#[near(serializers = [borsh])]
#[derive(Clone)]
pub struct Leg {
    pub market_id: u64,
    pub outcome: u8,
    pub odds_bps: u128,
}

#[near(serializers = [borsh])]
pub struct Parlay {
    pub id: u64,
    pub token: u8,
    pub legs: Vec<Leg>,
    pub stake: u128,
    pub combined_odds_bps: u128,
    pub payout: u128,
    pub status: u8,
    pub created_at: u64,
    pub settled_at: u64,
    pub claimed: bool,
}

/// Pool ledgers per token type (index 1..=3) and the Aleo governance parameters.
#[near(serializers = [borsh])]
pub struct ParlayGlobals {
    pub count: u64,
    pub pool: [u128; 4],
    /// What the pool owes open parlays: potential payouts of Active/Won ones, stakes of Cancelled ones.
    pub exposure: [u128; 4],
    pub min_stake: u128,
    pub max_payout: u128,
    pub fee_bps: u128,
    pub max_combined_odds_bps: u128,
    pub paused: bool,
}

impl Default for ParlayGlobals {
    fn default() -> Self {
        // Aleo constants: MIN_STAKE 0.1 token, max single payout 100_000 tokens, 2% fee, 1000× combined.
        Self {
            count: 0,
            pool: [0; 4],
            exposure: [0; 4],
            min_stake: 100_000,
            max_payout: 100_000_000_000,
            fee_bps: 200,
            max_combined_odds_bps: 10_000_000,
            paused: false,
        }
    }
}

#[near(serializers = [json])]
pub struct LegArg {
    pub market_id: U64,
    pub outcome: u8,
}

#[near(serializers = [json])]
pub struct LegView {
    pub market_id: U64,
    pub outcome: u8,
    pub odds_bps: U128,
    /// Live: 0 pending, 1 won, 2 lost, 3 cancelled.
    pub state: u8,
}

#[near(serializers = [json])]
pub struct ParlayView {
    pub id: U64,
    pub token_type: u8,
    pub num_legs: u8,
    pub legs: Vec<LegView>,
    pub stake: U128,
    pub combined_odds_bps: U128,
    pub potential_payout: U128,
    pub status: u8,
    /// What `settle_parlay` would set now (equals `status` once settled, 1 while undecided).
    pub settle_status: u8,
    pub created_at: U64,
    pub settled_at: U64,
    pub claimed: bool,
}

#[near(serializers = [json])]
pub struct ParlayPoolView {
    pub pool: [U128; 4],
    pub exposure: [U128; 4],
    pub min_stake: U128,
    pub max_payout: U128,
    pub fee_bps: U128,
    pub max_combined_odds_bps: U128,
    pub max_leg_odds_bps: U128,
    pub safety_bps: U128,
    pub paused: bool,
    pub count: U64,
}

#[near(serializers = [json])]
pub struct ParlayQuote {
    pub leg_odds_bps: Vec<U128>,
    pub combined_odds_bps: U128,
    pub potential_payout: U128,
    pub fee_if_won: U128,
    pub net_if_won: U128,
    /// Largest stake the pool accepts for these legs right now (0 if none).
    pub max_stake: U128,
}

fn parlay_key(id: u64) -> Vec<u8> {
    [KEY_PARLAY, &id.to_le_bytes()].concat()
}

/// Leg odds from the pool: odds_i = Σ_k (1/r_k) / (1/r_i), in basis points, the inverse of the FPMM price
/// the frontend shows (p_i ∝ 1/r_i).
pub fn leg_odds_bps(reserves: [u128; 4], n: u8, outcome: u8) -> u128 {
    let n = n as usize;
    let w: Vec<u128> = reserves[..n].iter().map(|r| WEIGHT_SCALE / (*r).max(1)).collect();
    let total: u128 = w.iter().sum();
    total * ODDS_PRECISION / w[(outcome - 1) as usize].max(1)
}

/// Aleo `calculate_combined_odds`: multiply leg by leg, flooring at each step.
pub fn combine_odds(odds: &[u128]) -> u128 {
    odds[1..].iter().fold(odds[0], |acc, o| acc * o / ODDS_PRECISION)
}

fn view_of(p: &Parlay, leg_states: Vec<u8>, settle_status: u8) -> ParlayView {
    ParlayView {
        id: U64(p.id),
        token_type: p.token,
        num_legs: p.legs.len() as u8,
        legs: p
            .legs
            .iter()
            .zip(leg_states)
            .map(|(l, state)| LegView { market_id: U64(l.market_id), outcome: l.outcome, odds_bps: U128(l.odds_bps), state })
            .collect(),
        stake: U128(p.stake),
        combined_odds_bps: U128(p.combined_odds_bps),
        potential_payout: U128(p.payout),
        status: p.status,
        settle_status,
        created_at: U64(p.created_at),
        settled_at: U64(p.settled_at),
        claimed: p.claimed,
    }
}

#[near]
impl Veiled {
    /// Anyone. Settles a parlay from its leg markets and returns the new status. A lost leg settles it at once;
    /// otherwise it waits until every leg market is final, so the result never depends on when this is called.
    pub fn settle_parlay(&mut self, parlay_id: U64) -> u8 {
        let mut p = self.load_parlay(parlay_id.0);
        require!(p.status == PARLAY_ACTIVE, "ERR_PARLAY_SETTLED");
        let status = self.settle_status(&p);
        require!(status != PARLAY_ACTIVE, "ERR_PARLAY_NOT_READY");
        self.apply_settlement(&mut p, status);
        self.save_parlay(&p);
        status
    }

    /// Adds NEAR to the parlay pool (stablecoins: `ft_transfer_call` with msg `{"fund_parlay_pool":{}}`).
    #[payable]
    pub fn fund_parlay_pool(&mut self, token: u8) -> U128 {
        require!(token == TOKEN_NEAR, "ERR_TOKEN");
        let amount = markets::attached_micro();
        require!(amount > 0, "ERR_AMOUNT");
        U128(self.credit_parlay_pool(token, amount))
    }

    /// Owner only. The pool keeps at least 110% of open obligations.
    pub fn withdraw_parlay_pool(&mut self, token: u8, amount: U128, recipient: AccountId) {
        require!(env::predecessor_account_id() == self.owner, "ERR_OWNER");
        require!((TOKEN_NEAR..=TOKEN_USAD).contains(&token), "ERR_TOKEN");
        let mut g = self.parlay_globals();
        let t = token as usize;
        require!(amount.0 > 0 && g.pool[t] >= amount.0, "ERR_AMOUNT");
        let left = g.pool[t] - amount.0;
        require!(left * ODDS_PRECISION >= g.exposure[t] * SAFETY_BPS, "ERR_POOL_RESERVED");
        g.pool[t] = left;
        self.save_parlay_globals(&g);
        self.program_credits[t] -= amount.0;
        self.pay_booked(token, &recipient, amount.0);
    }

    /// Owner only. Any argument left out keeps its value.
    pub fn set_parlay_config(
        &mut self,
        min_stake: Option<U128>,
        max_payout: Option<U128>,
        fee_bps: Option<U128>,
        max_combined_odds_bps: Option<U128>,
        paused: Option<bool>,
    ) {
        require!(env::predecessor_account_id() == self.owner, "ERR_OWNER");
        let mut g = self.parlay_globals();
        if let Some(v) = min_stake {
            require!(v.0 > 0, "ERR_VALUE");
            g.min_stake = v.0;
        }
        if let Some(v) = max_payout {
            require!(v.0 > 0, "ERR_VALUE");
            g.max_payout = v.0;
        }
        if let Some(v) = fee_bps {
            require!(v.0 < FEE_DENOMINATOR, "ERR_VALUE");
            g.fee_bps = v.0;
        }
        if let Some(v) = max_combined_odds_bps {
            require!(v.0 > ODDS_PRECISION, "ERR_VALUE");
            g.max_combined_odds_bps = v.0;
        }
        if let Some(v) = paused {
            g.paused = v;
        }
        self.save_parlay_globals(&g);
    }

    pub fn get_parlay(&self, parlay_id: U64) -> Option<ParlayView> {
        self.read_parlay(parlay_id.0).map(|p| self.view_parlay(&p))
    }

    /// Parlays by creation order: ids [from + 1, from + limit] (ids start at 1).
    pub fn get_parlays(&self, from: U64, limit: u32) -> Vec<ParlayView> {
        let count = self.parlay_globals().count;
        let end = from.0.saturating_add(limit.min(100) as u64).min(count);
        (from.0..end).filter_map(|i| self.read_parlay(i + 1)).map(|p| self.view_parlay(&p)).collect()
    }

    pub fn get_parlay_count(&self) -> U64 {
        U64(self.parlay_globals().count)
    }

    pub fn get_parlay_pool(&self) -> ParlayPoolView {
        let g = self.parlay_globals();
        ParlayPoolView {
            pool: g.pool.map(U128),
            exposure: g.exposure.map(U128),
            min_stake: U128(g.min_stake),
            max_payout: U128(g.max_payout),
            fee_bps: U128(g.fee_bps),
            max_combined_odds_bps: U128(g.max_combined_odds_bps),
            max_leg_odds_bps: U128(MAX_LEG_ODDS),
            safety_bps: U128(SAFETY_BPS),
            paused: g.paused,
            count: U64(g.count),
        }
    }

    /// The exact odds and payout `parlay_buy` would give now (it panics with the same errors).
    pub fn quote_parlay(&self, token: u8, stake: U128, legs: Vec<LegArg>) -> ParlayQuote {
        require!((TOKEN_NEAR..=TOKEN_USAD).contains(&token), "ERR_TOKEN");
        let g = self.parlay_globals();
        let legs = self.price_legs(&legs);
        let odds: Vec<u128> = legs.iter().map(|l| l.odds_bps).collect();
        let combined = combine_odds(&odds);
        require!(combined <= g.max_combined_odds_bps, "ERR_COMBINED_ODDS");
        let payout = stake.0 * combined / ODDS_PRECISION;
        let fee = payout * g.fee_bps / FEE_DENOMINATOR;
        // Largest s with (exposure + s·c) · 1.1 <= pool + s, i.e. s · (1.1c − 1) <= pool − 1.1·exposure.
        let t = token as usize;
        let room = (g.pool[t] * ODDS_PRECISION).saturating_sub(g.exposure[t] * SAFETY_BPS);
        let per_stake = (combined * SAFETY_BPS / ODDS_PRECISION).saturating_sub(ODDS_PRECISION).max(1);
        let by_pool = room / per_stake;
        let by_cap = g.max_payout * ODDS_PRECISION / combined;
        ParlayQuote {
            leg_odds_bps: odds.into_iter().map(U128).collect(),
            combined_odds_bps: U128(combined),
            potential_payout: U128(payout),
            fee_if_won: U128(fee),
            net_if_won: U128(payout - fee),
            max_stake: U128(by_pool.min(by_cap)),
        }
    }

    /// Owner only. Points token slot 2 or 3 at a NEP-141 contract (for example Circle's testnet USDC). Allowed
    /// only while nothing is held in that token, so no note, market, bond or pool can be stranded.
    pub fn set_token_account(&mut self, token: u8, account_id: AccountId) {
        require!(env::predecessor_account_id() == self.owner, "ERR_OWNER");
        require!(token == TOKEN_USDCX || token == TOKEN_USAD, "ERR_TOKEN");
        let t = token as usize;
        require!(self.program_credits[t] == 0 && self.treasury[t] == 0, "ERR_TOKEN_IN_USE");
        require!(self.parlay_globals().pool[t] == 0, "ERR_TOKEN_IN_USE");
        require!(account_id != self.usdcx && account_id != self.usad, "ERR_TOKEN_DUPLICATE");
        if token == TOKEN_USDCX {
            self.usdcx = account_id;
        } else {
            self.usad = account_id;
        }
    }

    pub fn get_token_accounts(&self) -> Vec<AccountId> {
        vec![self.usdcx.clone(), self.usad.clone()]
    }
}

impl Veiled {
    pub(crate) fn parlay_globals(&self) -> ParlayGlobals {
        env::storage_read(KEY_GLOBALS)
            .map(|b| borsh::from_slice(&b).unwrap_or_else(|_| env::panic_str("ERR_STATE")))
            .unwrap_or_default()
    }

    fn save_parlay_globals(&self, g: &ParlayGlobals) {
        env::storage_write(KEY_GLOBALS, &borsh::to_vec(g).unwrap());
    }

    fn read_parlay(&self, id: u64) -> Option<Parlay> {
        env::storage_read(&parlay_key(id)).map(|b| borsh::from_slice(&b).unwrap_or_else(|_| env::panic_str("ERR_STATE")))
    }

    fn load_parlay(&self, id: u64) -> Parlay {
        self.read_parlay(id).unwrap_or_else(|| env::panic_str("ERR_NO_PARLAY"))
    }

    fn save_parlay(&self, p: &Parlay) {
        env::storage_write(&parlay_key(p.id), &borsh::to_vec(p).unwrap());
    }

    /// Adds `amount` (already received by the contract) to the pool; returns the new pool size.
    pub(crate) fn credit_parlay_pool(&mut self, token: u8, amount: u128) -> u128 {
        let mut g = self.parlay_globals();
        g.pool[token as usize] += amount;
        self.program_credits[token as usize] += amount;
        let pool = g.pool[token as usize];
        self.save_parlay_globals(&g);
        pool
    }

    /// Validates the legs against live markets and prices them.
    fn price_legs(&self, legs: &[LegArg]) -> Vec<Leg> {
        require!((MIN_LEGS..=MAX_LEGS).contains(&legs.len()), "ERR_LEG_COUNT");
        let h = self.height();
        let mut out: Vec<Leg> = Vec::with_capacity(legs.len());
        for l in legs {
            require!(out.iter().all(|o| o.market_id != l.market_id.0), "ERR_DUPLICATE_LEG");
            let st = self.market_ref(l.market_id.0);
            let m = &st.market;
            require!(m.status == STATUS_ACTIVE && h <= m.deadline, "ERR_LEG_CLOSED");
            require!(l.outcome >= 1 && l.outcome <= m.num_outcomes, "ERR_OUTCOME");
            let odds = leg_odds_bps(st.pool.reserves, m.num_outcomes, l.outcome);
            require!(odds > ODDS_PRECISION && odds <= MAX_LEG_ODDS, "ERR_LEG_ODDS");
            out.push(Leg { market_id: l.market_id.0, outcome: l.outcome, odds_bps: odds });
        }
        out
    }

    fn leg_state(&self, l: &Leg) -> u8 {
        let st = self.market_ref(l.market_id);
        match st.market.status {
            STATUS_CANCELLED => LEG_CANCELLED,
            STATUS_RESOLVED => match &st.tally {
                Some(t) if t.finalized && t.winning_outcome == l.outcome => LEG_WON,
                Some(t) if t.finalized => LEG_LOST,
                _ => LEG_PENDING,
            },
            _ => LEG_PENDING,
        }
    }

    /// Lost if any leg lost; otherwise, once every leg is final, Cancelled if any leg was cancelled, else Won.
    fn settle_status(&self, p: &Parlay) -> u8 {
        let states: Vec<u8> = p.legs.iter().map(|l| self.leg_state(l)).collect();
        if states.contains(&LEG_LOST) {
            PARLAY_LOST
        } else if states.contains(&LEG_PENDING) {
            PARLAY_ACTIVE
        } else if states.contains(&LEG_CANCELLED) {
            PARLAY_CANCELLED
        } else {
            PARLAY_WON
        }
    }

    fn view_parlay(&self, p: &Parlay) -> ParlayView {
        let states = p.legs.iter().map(|l| self.leg_state(l)).collect();
        let settle = if p.status == PARLAY_ACTIVE { self.settle_status(p) } else { p.status };
        view_of(p, states, settle)
    }

    /// Moves an Active parlay to `status` and re-books what the pool owes it.
    fn apply_settlement(&mut self, p: &mut Parlay, status: u8) {
        let mut g = self.parlay_globals();
        let t = p.token as usize;
        match status {
            PARLAY_LOST => g.exposure[t] = g.exposure[t].saturating_sub(p.payout),
            PARLAY_CANCELLED => g.exposure[t] = g.exposure[t].saturating_sub(p.payout) + p.stake,
            _ => {}
        }
        p.status = status;
        p.settled_at = self.height();
        self.save_parlay_globals(&g);
        env::log_str(&format!(
            "EVENT_JSON:{{\"standard\":\"veiled\",\"version\":\"1.0.0\",\"event\":\"parlay_settled\",\"data\":[{{\"parlay_id\":\"{}\",\"status\":{status}}}]}}",
            p.id
        ));
    }

    /// Private placement: a balance note pays the stake; the contract mints the ticket note.
    pub(crate) fn act_parlay_buy(&mut self, s: &Spent, legs: &[LegArg], min_payout: u128) -> Mint {
        require!(s.kind == KIND_BALANCE && s.sub == 0, "ERR_NOTE_KIND");
        let token = s.asset as u8;
        require!(s.asset <= TOKEN_USAD as u64 && (TOKEN_NEAR..=TOKEN_USAD).contains(&token), "ERR_TOKEN");
        let mut g = self.parlay_globals();
        require!(!self.paused && !g.paused, "ERR_PAUSED");
        let stake = s.out_amount;
        require!(stake >= g.min_stake, "ERR_MIN_STAKE");

        let legs = self.price_legs(legs);
        let odds: Vec<u128> = legs.iter().map(|l| l.odds_bps).collect();
        let combined = combine_odds(&odds);
        require!(combined <= g.max_combined_odds_bps, "ERR_COMBINED_ODDS");
        let payout = stake * combined / ODDS_PRECISION;
        require!(payout >= min_payout, "ERR_SLIPPAGE");
        require!(payout <= g.max_payout, "ERR_MAX_PAYOUT");

        let t = token as usize;
        let exposure = g.exposure[t] + payout;
        let pool = g.pool[t] + stake;
        require!(pool * ODDS_PRECISION >= exposure * SAFETY_BPS, "ERR_POOL_CAPACITY");
        g.pool[t] = pool;
        g.exposure[t] = exposure;
        g.count += 1;
        let id = g.count;
        self.save_parlay_globals(&g);

        let h = self.height();
        let p = Parlay {
            id,
            token,
            legs,
            stake,
            combined_odds_bps: combined,
            payout,
            status: PARLAY_ACTIVE,
            created_at: h,
            settled_at: 0,
            claimed: false,
        };
        self.save_parlay(&p);
        env::log_str(&format!(
            "EVENT_JSON:{{\"standard\":\"veiled\",\"version\":\"1.0.0\",\"event\":\"parlay_placed\",\"data\":[{{\"parlay_id\":\"{id}\",\"token_type\":{token},\"stake\":\"{stake}\",\"payout\":\"{payout}\"}}]}}"
        ));
        Mint { kind: KIND_PARLAY, asset: id, sub: 0, amount: payout }
    }

    /// Private claim: the whole ticket note is spent. Won pays payout − fee, Cancelled refunds the stake.
    pub(crate) fn act_parlay_claim(&mut self, s: &Spent) -> Mint {
        require!(s.kind == KIND_PARLAY && s.sub == 0, "ERR_NOTE_KIND");
        let mut p = self.load_parlay(s.asset);
        require!(s.out_amount == p.payout, "ERR_AMOUNT");
        require!(!p.claimed, "ERR_CLAIMED");
        if p.status == PARLAY_ACTIVE {
            let status = self.settle_status(&p);
            require!(status != PARLAY_ACTIVE, "ERR_PARLAY_NOT_READY");
            self.apply_settlement(&mut p, status);
        }
        let mut g = self.parlay_globals();
        let t = p.token as usize;
        let amount = match p.status {
            PARLAY_WON => {
                let fee = p.payout * g.fee_bps / FEE_DENOMINATOR;
                require!(g.pool[t] >= p.payout, "ERR_POOL_EXHAUSTED");
                g.pool[t] -= p.payout;
                g.exposure[t] = g.exposure[t].saturating_sub(p.payout);
                self.treasury[t] += fee;
                p.payout - fee
            }
            PARLAY_CANCELLED => {
                require!(g.pool[t] >= p.stake, "ERR_POOL_EXHAUSTED");
                g.pool[t] -= p.stake;
                g.exposure[t] = g.exposure[t].saturating_sub(p.stake);
                p.stake
            }
            _ => env::panic_str("ERR_PARLAY_LOST"),
        };
        p.claimed = true;
        self.save_parlay_globals(&g);
        self.save_parlay(&p);
        Mint { kind: KIND_BALANCE, asset: p.token as u64, sub: 0, amount }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn leg_odds_are_the_inverse_of_the_fpmm_price() {
        // Even 2-outcome pool: price 50% → 2×.
        assert_eq!(leg_odds_bps([10_000, 10_000, 0, 0], 2, 1), 20_000);
        // Even 4-outcome pool: 4×.
        assert_eq!(leg_odds_bps([5_000, 5_000, 5_000, 5_000], 4, 3), 40_000);
        // r = [9090, 11000]: p1 = (1/9090) / (1/9090 + 1/11000) ≈ 0.5476 → 1.826×.
        assert_eq!(leg_odds_bps([9090, 11_000, 0, 0], 2, 1), 18_263);
        assert_eq!(leg_odds_bps([9090, 11_000, 0, 0], 2, 2), 22_101);
    }

    #[test]
    fn combined_odds_floor_at_each_step_like_leo() {
        assert_eq!(combine_odds(&[20_000, 20_000]), 40_000);
        assert_eq!(combine_odds(&[18_263, 22_101, 30_000]), 18_263 * 22_101 / 10_000 * 30_000 / 10_000);
    }

    #[test]
    fn default_parameters_match_the_aleo_program() {
        let g = ParlayGlobals::default();
        assert_eq!((g.min_stake, g.fee_bps, g.max_combined_odds_bps), (100_000, 200, 10_000_000));
    }
}
