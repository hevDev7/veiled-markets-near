//! Turbo UP/DOWN markets: port of veiled_turbo_v9.aleo. The oracle operator opens short rolling markets on a
//! crypto price and resolves them; bets are private turbo notes; winners split the whole pool pro rata
//! (pari-mutuel), so payouts never exceed what was staked and no vault float is needed. Status codes and
//! limits follow the Aleo program.

use crate::*;

pub const TURBO_ACTIVE: u8 = 1;
pub const TURBO_RESOLVED: u8 = 2;
pub const TURBO_CANCELLED: u8 = 3;
pub const UP: u8 = 1;
pub const DOWN: u8 = 2;

pub const MIN_DURATION: u64 = 15;
pub const MAX_DURATION: u64 = 900;
pub const RESOLUTION_WINDOW: u64 = 60;
pub const RESOLUTION_GRACE: u64 = 300;
pub const BASELINE_LAG_TOLERANCE: u64 = 60;
pub const LATE_CANCEL_GRACE: u64 = 5000;
pub const TURBO_FEE_BPS: u128 = 50;
pub const TURBO_MIN_TRADE: u128 = 1000;
/// Bets close this fraction of the round before its deadline (the last fifth). In a shared pool, a bet placed
/// when the result is all but known takes winnings from the bettors who carried the risk.
pub const BET_CUTOFF_DIVISOR: u64 = 5;
/// Aleo stores claim units = 2 × stake in the share record; kept for the views' parity.
pub const CLAIM_UNIT_SCALE: u128 = 2;
const CONF_DENOMINATOR_FRAC: u128 = 200;
const MAX_MOVE_FRAC: u128 = 2;
const MIN_PRICE: u128 = 1;
const MAX_PRICE: u128 = 100_000_000_000_000;
/// BTC ETH SOL DOGE XRP BNB ADA AVAX LINK DOT.
const MAX_SYMBOL: u8 = 10;

#[near(serializers = [borsh])]
pub struct TurboMarket {
    pub id: u64,
    pub creator: AccountId,
    pub symbol_id: u8,
    pub baseline_price: u128,
    pub baseline_conf: u128,
    pub baseline_block: u64,
    pub deadline: u64,
    pub resolution_deadline: u64,
    pub closing_price: u128,
    pub closing_conf: u128,
    pub closing_block: u64,
    pub winning_outcome: u8,
    pub status: u8,
    pub created_at: u64,
    pub total_up: u128,
    pub total_down: u128,
    pub total_volume: u128,
    /// Resolve-time snapshot of the pool the winners split.
    pub payout_pool: u128,
    pub fees: u128,
    pub up_bets: u32,
    pub down_bets: u32,
    pub paid_out: u128,
}

#[near(serializers = [json])]
pub struct TurboView {
    pub id: U64,
    pub creator: AccountId,
    pub symbol_id: u8,
    pub baseline_price: U128,
    pub baseline_conf: U128,
    pub baseline_block: U64,
    pub deadline: U64,
    /// Bets are taken while the height is below this.
    pub betting_deadline: U64,
    pub resolution_deadline: U64,
    pub closing_price: U128,
    pub closing_conf: U128,
    pub closing_block: U64,
    pub winning_outcome: u8,
    pub status: u8,
    pub created_at: U64,
    pub total_up_amount: U128,
    pub total_down_amount: U128,
    pub total_up_claim_units: U128,
    pub total_down_claim_units: U128,
    pub total_volume: U128,
    pub payout_pool: U128,
    pub fees: U128,
    pub up_bets: u32,
    pub down_bets: u32,
    pub paid_out: U128,
}

impl TurboMarket {
    /// First tick at which bets are no longer taken.
    pub fn betting_deadline(&self) -> u64 {
        self.deadline - (self.deadline - self.created_at) / BET_CUTOFF_DIVISOR
    }

    fn view(&self) -> TurboView {
        TurboView {
            id: U64(self.id),
            creator: self.creator.clone(),
            symbol_id: self.symbol_id,
            baseline_price: U128(self.baseline_price),
            baseline_conf: U128(self.baseline_conf),
            baseline_block: U64(self.baseline_block),
            deadline: U64(self.deadline),
            betting_deadline: U64(self.betting_deadline()),
            resolution_deadline: U64(self.resolution_deadline),
            closing_price: U128(self.closing_price),
            closing_conf: U128(self.closing_conf),
            closing_block: U64(self.closing_block),
            winning_outcome: self.winning_outcome,
            status: self.status,
            created_at: U64(self.created_at),
            total_up_amount: U128(self.total_up),
            total_down_amount: U128(self.total_down),
            total_up_claim_units: U128(self.total_up * CLAIM_UNIT_SCALE),
            total_down_claim_units: U128(self.total_down * CLAIM_UNIT_SCALE),
            total_volume: U128(self.total_volume),
            payout_pool: U128(self.payout_pool),
            fees: U128(self.fees),
            up_bets: self.up_bets,
            down_bets: self.down_bets,
            paid_out: U128(self.paid_out),
        }
    }
}

#[near]
impl Veiled {
    /// Oracle operator only. `baseline_block` is the virtual height the baseline price was observed at.
    pub fn create_turbo_market(
        &mut self,
        symbol_id: u8,
        deadline: U64,
        baseline_price: U128,
        baseline_conf: U128,
        baseline_block: U64,
    ) -> U64 {
        let caller = env::predecessor_account_id();
        require!(caller == self.oracle, "ERR_NOT_ORACLE");
        require!(!self.paused, "ERR_PAUSED");
        let h = self.height();
        let (deadline, price, conf, base_block) = (deadline.0, baseline_price.0, baseline_conf.0, baseline_block.0);
        require!(base_block <= h && h - base_block <= BASELINE_LAG_TOLERANCE, "ERR_BASELINE_STALE");
        require!(deadline > h, "ERR_DEADLINE");
        let duration = deadline - h;
        require!((MIN_DURATION..=MAX_DURATION).contains(&duration), "ERR_DURATION");
        require!((1..=MAX_SYMBOL).contains(&symbol_id), "ERR_SYMBOL");
        require!((MIN_PRICE..=MAX_PRICE).contains(&price), "ERR_PRICE");
        require!(conf <= price / CONF_DENOMINATOR_FRAC, "ERR_CONFIDENCE");

        let id = self.take_id();
        self.turbo.insert(
            id,
            TurboMarket {
                id,
                creator: caller,
                symbol_id,
                baseline_price: price,
                baseline_conf: conf,
                baseline_block: base_block,
                deadline,
                resolution_deadline: deadline + RESOLUTION_GRACE,
                closing_price: 0,
                closing_conf: 0,
                closing_block: 0,
                winning_outcome: 0,
                status: TURBO_ACTIVE,
                created_at: h,
                total_up: 0,
                total_down: 0,
                total_volume: 0,
                payout_pool: 0,
                fees: 0,
                up_bets: 0,
                down_bets: 0,
                paid_out: 0,
            },
        );
        // Rounds enter `turbo_ids` on their first bet (act_turbo_buy): the rolling chain opens one every few
        // minutes per symbol and most stay empty on testnet, so indexing them all would only grow storage.
        self.latest_turbo.insert(symbol_id, id);
        env::log_str(&format!(
            "EVENT_JSON:{{\"standard\":\"veiled\",\"version\":\"1.0.0\",\"event\":\"turbo_created\",\"data\":[{{\"market_id\":\"{id}\",\"symbol_id\":{symbol_id},\"deadline\":\"{deadline}\",\"baseline_price\":\"{price}\"}}]}}"
        ));
        U64(id)
    }

    /// Oracle operator only. UP wins on a strictly higher close; a tie is DOWN. No winning bets → CANCELLED
    /// so every bettor can refund.
    pub fn resolve_turbo_market(
        &mut self,
        market_id: U64,
        closing_price: U128,
        closing_conf: U128,
        closing_block: U64,
    ) -> u8 {
        require!(env::predecessor_account_id() == self.oracle, "ERR_NOT_ORACLE");
        let h = self.height();
        let (price, conf, block) = (closing_price.0, closing_conf.0, closing_block.0);
        let t = self.turbo_mut(market_id.0);
        require!(t.status == TURBO_ACTIVE, "ERR_STATUS");
        require!(block >= t.deadline && block <= t.deadline + RESOLUTION_WINDOW, "ERR_CLOSING_BLOCK");
        require!(h >= block && h <= t.deadline + RESOLUTION_GRACE, "ERR_RESOLUTION_WINDOW");
        require!((MIN_PRICE..=MAX_PRICE).contains(&price), "ERR_PRICE");
        require!(conf <= price / CONF_DENOMINATOR_FRAC, "ERR_CONFIDENCE");
        let base = t.baseline_price;
        require!(price.abs_diff(base) <= base / MAX_MOVE_FRAC, "ERR_PRICE_MOVE");

        let winner = if price > base { UP } else { DOWN };
        let winning_stake = if winner == UP { t.total_up } else { t.total_down };
        t.closing_price = price;
        t.closing_conf = conf;
        t.closing_block = block;
        t.winning_outcome = winner;
        t.payout_pool = t.total_up + t.total_down;
        t.status = if winning_stake > 0 { TURBO_RESOLVED } else { TURBO_CANCELLED };
        let status = t.status;
        env::log_str(&format!(
            "EVENT_JSON:{{\"standard\":\"veiled\",\"version\":\"1.0.0\",\"event\":\"turbo_resolved\",\"data\":[{{\"market_id\":\"{}\",\"closing_price\":\"{price}\",\"winning_outcome\":{winner},\"status\":{status}}}]}}",
            market_id.0
        ));
        status
    }

    /// Oracle or owner. Deletes finished rounds nobody bet on (RESOLVED/CANCELLED with zero bets), returning
    /// their storage to the contract; the symbol's latest round is kept so `get_latest_turbo` stays useful.
    /// Rounds with any bet are never touched: their notes still need them to claim. Returns how many went.
    pub fn prune_turbo(&mut self, market_ids: Vec<U64>) -> u32 {
        let caller = env::predecessor_account_id();
        require!(caller == self.oracle || caller == self.owner, "ERR_NOT_ORACLE");
        require!(market_ids.len() <= 100, "ERR_TOO_MANY");
        let mut pruned = 0;
        for id in market_ids {
            let prunable = match self.turbo.get(&id.0) {
                Some(t) => {
                    t.status != TURBO_ACTIVE
                        && t.up_bets == 0
                        && t.down_bets == 0
                        && self.latest_turbo.get(&t.symbol_id) != Some(&id.0)
                }
                None => false,
            };
            if prunable {
                self.turbo.remove(&id.0);
                pruned += 1;
            }
        }
        pruned
    }

    /// The oracle may cancel after the resolution deadline; anyone may after a long grace.
    pub fn emergency_cancel_turbo(&mut self, market_id: U64) {
        let h = self.height();
        let is_oracle = env::predecessor_account_id() == self.oracle;
        let t = self.turbo_mut(market_id.0);
        require!(t.status == TURBO_ACTIVE, "ERR_STATUS");
        let past_deadline = h > t.resolution_deadline;
        let past_grace = h > t.resolution_deadline + LATE_CANCEL_GRACE;
        require!((is_oracle && past_deadline) || past_grace, "ERR_CANNOT_CANCEL");
        t.status = TURBO_CANCELLED;
        t.winning_outcome = 0;
    }

    pub fn get_turbo_market(&self, market_id: U64) -> Option<TurboView> {
        self.turbo.get(&market_id.0).map(|t| t.view())
    }

    /// The most recent turbo market for a symbol (the one the UI shows).
    pub fn get_latest_turbo(&self, symbol_id: u8) -> Option<TurboView> {
        self.latest_turbo.get(&symbol_id).and_then(|id| self.turbo.get(id)).map(|t| t.view())
    }

    /// Turbo rounds that received at least one bet, in order of their first bet: indexes [from, from + limit).
    pub fn get_turbo_markets(&self, from: U64, limit: u32) -> Vec<TurboView> {
        let end = from.0.saturating_add(limit.min(100) as u64).min(self.turbo_ids.len() as u64);
        (from.0..end)
            .filter_map(|i| self.turbo_ids.get(i as u32).and_then(|id| self.turbo.get(id)).map(|t| t.view()))
            .collect()
    }

    /// How many turbo rounds received at least one bet.
    pub fn get_turbo_count(&self) -> U64 {
        U64(self.turbo_ids.len() as u64)
    }

    /// Stake owed to unclaimed turbo bets (the Aleo `total_exposure`).
    pub fn get_turbo_exposure(&self) -> U128 {
        U128(self.turbo_exposure)
    }
}

impl Veiled {
    fn turbo_mut(&mut self, id: u64) -> &mut TurboMarket {
        self.turbo.get_mut(&id).unwrap_or_else(|| env::panic_str("ERR_NO_MARKET"))
    }

    /// Private bet: a NEAR balance note in, a turbo note (asset = market, sub = side, amount = stake) out.
    pub(crate) fn act_turbo_buy(&mut self, s: &Spent, market_id: u64, side: u8) -> Mint {
        require!(s.kind == KIND_BALANCE && s.asset == TOKEN_NEAR as u64 && s.sub == 0, "ERR_NOTE_KIND");
        require!(side == UP || side == DOWN, "ERR_SIDE");
        require!(!self.paused, "ERR_PAUSED");
        let h = self.height();
        let amount_in = s.out_amount;
        require!(amount_in >= TURBO_MIN_TRADE, "ERR_MIN_TRADE");
        let fee = amount_in * TURBO_FEE_BPS / math::FEE_DENOMINATOR;
        let stake = amount_in - fee;
        let t = self.turbo_mut(market_id);
        require!(t.status == TURBO_ACTIVE, "ERR_STATUS");
        require!(h < t.deadline, "ERR_DEADLINE");
        require!(h < t.betting_deadline(), "ERR_BETTING_CLOSED");
        let first_bet = t.up_bets == 0 && t.down_bets == 0;
        if side == UP {
            t.total_up += stake;
            t.up_bets += 1;
        } else {
            t.total_down += stake;
            t.down_bets += 1;
        }
        t.total_volume += amount_in;
        t.fees += fee;
        if first_bet {
            self.turbo_ids.push(market_id);
        }
        self.treasury[TOKEN_NEAR as usize] += fee;
        self.turbo_exposure += stake;
        Mint { kind: KIND_TURBO, asset: market_id, sub: side, amount: stake }
    }

    /// Winning stake pays `stake × pool / winning stake`; on CANCELLED the stake is refunded.
    pub(crate) fn act_turbo_claim(&mut self, s: &Spent) -> Mint {
        require!(s.kind == KIND_TURBO, "ERR_NOTE_KIND");
        let stake = s.out_amount;
        require!(stake > 0, "ERR_AMOUNT");
        let t = self.turbo_mut(s.asset);
        let payout = match t.status {
            TURBO_RESOLVED => {
                require!(s.sub == t.winning_outcome, "ERR_NOT_WINNER");
                let winning = if t.winning_outcome == UP { t.total_up } else { t.total_down };
                require!(winning >= stake, "ERR_AMOUNT");
                stake * t.payout_pool / winning
            }
            TURBO_CANCELLED => stake,
            _ => env::panic_str("ERR_STATUS"),
        };
        require!(payout > 0, "ERR_AMOUNT");
        t.paid_out += payout;
        require!(t.paid_out <= t.total_up + t.total_down, "ERR_POOL_EXHAUSTED");
        self.turbo_exposure = self.turbo_exposure.saturating_sub(payout);
        Mint { kind: KIND_BALANCE, asset: TOKEN_NEAR as u64, sub: 0, amount: payout }
    }
}
