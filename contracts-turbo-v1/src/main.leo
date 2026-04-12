// ============================================================================
// VEILED TURBO MARKETS v7 — Shared Vault Architecture
// ============================================================================
// Short-duration (1–60 min) BTC/ETH/SOL UP/DOWN prediction markets.
// Resolved by Pyth oracle via caller-based authorization.
//
// v7 changes from v6:
//   - SHARED VAULT: operator deposits ALEO once into a vault. All markets
//     draw from and pay into this single pool. No per-market LP lock.
//   - create_turbo_market no longer requires initial_liquidity transfer.
//     Market creation is fee-only (~0.01 ALEO gas), not 2+ ALEO per market.
//   - buy_up_down: user credits go into vault. Vault backs all payouts.
//   - claim_winnings: payout drawn from vault balance.
//   - New: deposit_vault / withdraw_vault for operator to manage vault size.
//   - Removed: withdraw_liquidity (replaced by withdraw_vault).
//
// Risk model: vault must be funded enough to cover worst-case payout across
// all active markets. Operator monitors vault_balance vs total_exposure.
// ============================================================================

import credits.aleo;

// ============================================================================
// MODULE-LEVEL CONSTANTS
// ============================================================================

const STATUS_ACTIVE: u8    = 1u8;
const STATUS_RESOLVED: u8  = 2u8;
const STATUS_CANCELLED: u8 = 3u8;

const OUTCOME_UP: u8   = 1u8;
const OUTCOME_DOWN: u8 = 2u8;

const MIN_DURATION_BLOCKS: u64 = 15u64;
const MAX_DURATION_BLOCKS: u64 = 900u64;
const RESOLUTION_WINDOW_BLOCKS: u64 = 60u64;
const RESOLUTION_GRACE_BLOCKS: u64 = 300u64;
const BASELINE_LAG_TOLERANCE: u64 = 60u64;

const PROTOCOL_FEE_BPS: u128 = 50u128;
const FEE_DENOMINATOR: u128  = 10000u128;

const MIN_TRADE_AMOUNT: u128 = 1000u128;

const CONF_DENOMINATOR_FRAC: u128 = 200u128;
const MAX_MOVE_FRAC: u128 = 2u128;
const MIN_PRICE: u128 = 1u128;
const MAX_PRICE: u128 = 100_000_000_000_000u128;

const ORACLE_OPERATOR: address = aleo10tm5ektsr5v7kdc5phs8pha42vrkhe2rlxfl2v979wunhzx07vpqnqplv8;
const DEPLOYER: address = aleo10tm5ektsr5v7kdc5phs8pha42vrkhe2rlxfl2v979wunhzx07vpqnqplv8;

const SYMBOL_BTC: u8 = 1u8;
const SYMBOL_ETH: u8 = 2u8;
const SYMBOL_SOL: u8 = 3u8;
const SYMBOL_DOGE: u8 = 4u8;
const SYMBOL_XRP: u8 = 5u8;
const SYMBOL_BNB: u8 = 6u8;
const SYMBOL_ADA: u8 = 7u8;
const SYMBOL_AVAX: u8 = 8u8;
const SYMBOL_LINK: u8 = 9u8;
const SYMBOL_DOT: u8 = 10u8;

// Vault key for ALEO
const VAULT_ALEO: u8 = 0u8;

// ============================================================================
// FINAL FUNCTIONS
// ============================================================================

final fn deposit_vault_fin(
    transfer_future: Final,
    amount: u128,
    caller: address,
) {
    transfer_future.run();
    assert(caller == ORACLE_OPERATOR);
    assert(amount > 0u128);
    let current: u128 = vault_balance.get_or_use(VAULT_ALEO, 0u128);
    vault_balance.set(VAULT_ALEO, current + amount);
}

final fn withdraw_vault_fin(
    transfer_future: Final,
    amount: u128,
    caller: address,
) {
    transfer_future.run();
    assert(caller == ORACLE_OPERATOR);
    assert(amount > 0u128);
    let current: u128 = vault_balance.get_or_use(VAULT_ALEO, 0u128);
    assert(current >= amount);
    vault_balance.set(VAULT_ALEO, current - amount);
}

final fn create_turbo_market_fin(
    market_id: field,
    creator: address,
    symbol_id: u8,
    deadline: u64,
    baseline_price: u128,
    baseline_conf: u128,
    baseline_block: u64,
    caller: address,
) {
    assert(caller == ORACLE_OPERATOR);

    let exists: bool = turbo_markets.contains(market_id);
    assert(!exists);

    let current_height: u64 = block.height as u64;

    assert(baseline_block <= current_height);
    assert(current_height - baseline_block <= BASELINE_LAG_TOLERANCE);

    assert(deadline > current_height);
    let duration: u64 = deadline - current_height;
    assert(duration >= MIN_DURATION_BLOCKS);
    assert(duration <= MAX_DURATION_BLOCKS);

    // Symbol whitelist — all supported crypto assets
    assert(
        symbol_id == SYMBOL_BTC || symbol_id == SYMBOL_ETH || symbol_id == SYMBOL_SOL ||
        symbol_id == SYMBOL_DOGE || symbol_id == SYMBOL_XRP || symbol_id == SYMBOL_BNB ||
        symbol_id == SYMBOL_ADA || symbol_id == SYMBOL_AVAX || symbol_id == SYMBOL_LINK ||
        symbol_id == SYMBOL_DOT
    );

    assert(baseline_price >= MIN_PRICE);
    assert(baseline_price <= MAX_PRICE);
    let max_conf: u128 = baseline_price / CONF_DENOMINATOR_FRAC;
    assert(baseline_conf <= max_conf);

    let m: TurboMarket = TurboMarket {
        id: market_id,
        creator: creator,
        symbol_id: symbol_id,
        baseline_price: baseline_price,
        baseline_block: baseline_block,
        deadline: deadline,
        resolution_deadline: deadline + RESOLUTION_GRACE_BLOCKS,
        closing_price: 0u128,
        winning_outcome: 0u8,
        status: STATUS_ACTIVE,
        created_at: current_height,
    };

    // Initialize pool with zero reserves — vault-backed, no initial liquidity
    let pool: TurboPool = TurboPool {
        market_id: market_id,
        total_up_amount: 0u128,
        total_down_amount: 0u128,
        total_up_shares: 0u128,
        total_down_shares: 0u128,
        total_volume: 0u128,
    };

    turbo_markets.set(market_id, m);
    turbo_pools.set(market_id, pool);
    protocol_treasury.set(market_id, 0u128);
}

final fn buy_up_down_fin(
    transfer_future: Final,
    market_id: field,
    side: u8,
    amount_in: u128,
    expected_shares: u128,
) {
    transfer_future.run();

    let m: TurboMarket = turbo_markets.get(market_id);
    assert(m.status == STATUS_ACTIVE);
    let current_height: u64 = block.height as u64;
    assert(current_height < m.deadline);
    assert(side == OUTCOME_UP || side == OUTCOME_DOWN);
    assert(amount_in >= MIN_TRADE_AMOUNT);

    // Protocol fee
    let protocol_fee: u128 = (amount_in * PROTOCOL_FEE_BPS) / FEE_DENOMINATOR;
    let amount_to_pool: u128 = amount_in - protocol_fee;

    // Accumulate fee per market
    let current_fee: u128 = protocol_treasury.get_or_use(market_id, 0u128);
    protocol_treasury.set(market_id, current_fee + protocol_fee);

    // User's FULL bet (including fee) goes into the vault accounting.
    // Fee is tracked separately in protocol_treasury but lives in vault.
    let vault_current: u128 = vault_balance.get_or_use(VAULT_ALEO, 0u128);
    vault_balance.set(VAULT_ALEO, vault_current + amount_in);

    let pool: TurboPool = turbo_pools.get(market_id);

    // Simple share calculation: 1 ALEO bet = 1 share (no FPMM curve needed
    // with shared vault — odds are determined purely by total_up vs total_down
    // amounts at resolution time).
    let shares_out: u128 = amount_to_pool;
    assert(shares_out >= expected_shares);
    assert(shares_out > 0u128);

    let new_up_amount: u128 = side == OUTCOME_UP
        ? pool.total_up_amount + amount_to_pool
        : pool.total_up_amount;
    let new_down_amount: u128 = side == OUTCOME_DOWN
        ? pool.total_down_amount + amount_to_pool
        : pool.total_down_amount;
    let new_up_shares: u128 = side == OUTCOME_UP
        ? pool.total_up_shares + shares_out
        : pool.total_up_shares;
    let new_down_shares: u128 = side == OUTCOME_DOWN
        ? pool.total_down_shares + shares_out
        : pool.total_down_shares;

    turbo_pools.set(market_id, TurboPool {
        market_id: market_id,
        total_up_amount: new_up_amount,
        total_down_amount: new_down_amount,
        total_up_shares: new_up_shares,
        total_down_shares: new_down_shares,
        total_volume: pool.total_volume + amount_in,
    });
}

final fn resolve_turbo_market_fin(
    market_id: field,
    closing_price: u128,
    closing_conf: u128,
    closing_block: u64,
    caller: address,
) {
    assert(caller == ORACLE_OPERATOR);

    let m: TurboMarket = turbo_markets.get(market_id);
    assert(m.status == STATUS_ACTIVE);

    let current_height: u64 = block.height as u64;

    assert(closing_block >= m.deadline);
    assert(closing_block <= m.deadline + RESOLUTION_WINDOW_BLOCKS);
    assert(current_height >= closing_block);
    assert(current_height <= m.deadline + RESOLUTION_GRACE_BLOCKS);

    assert(closing_price >= MIN_PRICE);
    assert(closing_price <= MAX_PRICE);

    let max_conf: u128 = closing_price / CONF_DENOMINATOR_FRAC;
    assert(closing_conf <= max_conf);

    let baseline: u128 = m.baseline_price;
    let max_move: u128 = baseline / MAX_MOVE_FRAC;
    let hi: u128 = closing_price > baseline ? closing_price : baseline;
    let lo: u128 = closing_price > baseline ? baseline : closing_price;
    let moved: u128 = hi - lo;
    assert(moved <= max_move);

    let winner: u8 = closing_price > baseline ? OUTCOME_UP : OUTCOME_DOWN;

    // Calculate payouts from vault:
    // Total pool for this market = total_up_amount + total_down_amount
    // Winners split the entire pool proportionally to their shares.
    // Vault absorbs the losing side's amount and pays out to winners.
    let pool: TurboPool = turbo_pools.get(market_id);
    let total_pool: u128 = pool.total_up_amount + pool.total_down_amount;

    // Store total_payout_pool in market_payouts mapping so claim can compute
    market_payouts.set(market_id, total_pool);

    turbo_markets.set(market_id, TurboMarket {
        id: m.id,
        creator: m.creator,
        symbol_id: m.symbol_id,
        baseline_price: m.baseline_price,
        baseline_block: m.baseline_block,
        deadline: m.deadline,
        resolution_deadline: m.resolution_deadline,
        closing_price: closing_price,
        winning_outcome: winner,
        status: STATUS_RESOLVED,
        created_at: m.created_at,
    });
}

final fn emergency_cancel_fin(market_id: field) {
    let m: TurboMarket = turbo_markets.get(market_id);
    assert(m.status == STATUS_ACTIVE);

    let current_height: u64 = block.height as u64;
    assert(current_height > m.resolution_deadline);

    turbo_markets.set(market_id, TurboMarket {
        id: m.id,
        creator: m.creator,
        symbol_id: m.symbol_id,
        baseline_price: m.baseline_price,
        baseline_block: m.baseline_block,
        deadline: m.deadline,
        resolution_deadline: m.resolution_deadline,
        closing_price: 0u128,
        winning_outcome: 0u8,
        status: STATUS_CANCELLED,
        created_at: m.created_at,
    });
}

final fn claim_winnings_fin(
    transfer_future: Final,
    market_id: field,
    share_side: u8,
    share_quantity: u128,
    declared_payout: u128,
    share_id: field,
) {
    transfer_future.run();

    let m: TurboMarket = turbo_markets.get(market_id);
    assert(m.status == STATUS_RESOLVED);
    assert(share_side == m.winning_outcome);

    let already: bool = share_redeemed.get_or_use(share_id, false);
    assert(!already);
    share_redeemed.set(share_id, true);

    // Payout = (share_quantity / total_winning_shares) × total_pool
    let pool: TurboPool = turbo_pools.get(market_id);
    let total_winning: u128 = m.winning_outcome == OUTCOME_UP
        ? pool.total_up_shares
        : pool.total_down_shares;
    assert(total_winning > 0u128);

    let total_pool: u128 = market_payouts.get(market_id);
    let payout: u128 = (share_quantity * total_pool) / total_winning;

    assert(declared_payout == payout);
    assert(payout > 0u128);

    // Payout comes from vault
    let vault_current: u128 = vault_balance.get_or_use(VAULT_ALEO, 0u128);
    assert(vault_current >= payout);
    vault_balance.set(VAULT_ALEO, vault_current - payout);

    // Decrement winning shares for subsequent claims
    let new_up: u128 = m.winning_outcome == OUTCOME_UP
        ? pool.total_up_shares - share_quantity
        : pool.total_up_shares;
    let new_dn: u128 = m.winning_outcome == OUTCOME_DOWN
        ? pool.total_down_shares - share_quantity
        : pool.total_down_shares;
    turbo_pools.set(market_id, TurboPool {
        market_id: pool.market_id,
        total_up_amount: pool.total_up_amount,
        total_down_amount: pool.total_down_amount,
        total_up_shares: new_up,
        total_down_shares: new_dn,
        total_volume: pool.total_volume,
    });

    // Decrement remaining payout pool
    let remaining: u128 = total_pool - payout;
    market_payouts.set(market_id, remaining);
}

final fn claim_refund_fin(
    transfer_future: Final,
    market_id: field,
    share_quantity: u128,
    declared_refund: u128,
    share_id: field,
) {
    transfer_future.run();

    let m: TurboMarket = turbo_markets.get(market_id);
    assert(m.status == STATUS_CANCELLED);

    let already: bool = share_redeemed.get_or_use(share_id, false);
    assert(!already);
    share_redeemed.set(share_id, true);

    // Refund amount MUST equal share quantity (what user originally bet minus fee).
    // This prevents users from claiming arbitrary amounts.
    assert(declared_refund == share_quantity);
    assert(declared_refund > 0u128);

    // Refund from vault
    let vault_current: u128 = vault_balance.get_or_use(VAULT_ALEO, 0u128);
    assert(vault_current >= declared_refund);
    vault_balance.set(VAULT_ALEO, vault_current - declared_refund);
}

final fn withdraw_fees_fin(
    transfer_future: Final,
    market_id: field,
    amount: u128,
    caller: address,
) {
    transfer_future.run();
    assert(caller == ORACLE_OPERATOR);
    assert(amount > 0u128);

    let fee_held: u128 = protocol_treasury.get_or_use(market_id, 0u128);
    assert(fee_held >= amount);
    protocol_treasury.set(market_id, fee_held - amount);

    // Fees are held in vault, reduce vault balance
    let vault_current: u128 = vault_balance.get_or_use(VAULT_ALEO, 0u128);
    assert(vault_current >= amount);
    vault_balance.set(VAULT_ALEO, vault_current - amount);
}

// ============================================================================
// PROGRAM BLOCK
// ============================================================================

program veiled_turbo_v8.aleo {

    // ------------------------------------------------------------------------
    // STRUCTS
    // ------------------------------------------------------------------------

    struct TurboSeed {
        creator: address,
        symbol_id: u8,
        deadline: u64,
        nonce: u64,
    }

    struct TurboMarket {
        id: field,
        creator: address,
        symbol_id: u8,
        baseline_price: u128,
        baseline_block: u64,
        deadline: u64,
        resolution_deadline: u64,
        closing_price: u128,
        winning_outcome: u8,
        status: u8,
        created_at: u64,
    }

    // Pool tracks total bet amounts and shares per side (no FPMM reserves)
    struct TurboPool {
        market_id: field,
        total_up_amount: u128,    // total ALEO bet on UP
        total_down_amount: u128,  // total ALEO bet on DOWN
        total_up_shares: u128,
        total_down_shares: u128,
        total_volume: u128,
    }

    // ------------------------------------------------------------------------
    // RECORDS
    // ------------------------------------------------------------------------

    record TurboShare {
        owner: address,
        market_id: field,
        side: u8,
        quantity: u128,
        share_nonce: field,
    }

    // ------------------------------------------------------------------------
    // MAPPINGS
    // ------------------------------------------------------------------------

    mapping turbo_markets: field => TurboMarket;
    mapping turbo_pools: field => TurboPool;
    mapping vault_balance: u8 => u128;          // VAULT_ALEO(0) => total ALEO in vault
    mapping protocol_treasury: field => u128;   // market_id => accumulated fees
    mapping market_payouts: field => u128;       // market_id => total payout pool (set at resolve)
    mapping share_redeemed: field => bool;

    // ------------------------------------------------------------------------
    // CONSTRUCTOR
    // ------------------------------------------------------------------------

    @noupgrade
    constructor() {}

    // ------------------------------------------------------------------------
    // 1a. DEPOSIT TO VAULT — private credits record
    // ------------------------------------------------------------------------
    fn deposit_vault(private credits_in: credits.aleo::credits, private amount: u128) -> (credits.aleo::credits, Final) {
        let caller: address = self.caller;
        let amount_u64: u64 = amount as u64;
        let (change, transfer_future): (credits.aleo::credits, Final) =
            credits.aleo::transfer_private_to_public(credits_in, self.address, amount_u64);
        return (change, final {
            deposit_vault_fin(transfer_future, amount, caller);
        });
    }

    // ------------------------------------------------------------------------
    // 1b. DEPOSIT TO VAULT — public balance (no record needed)
    // ------------------------------------------------------------------------
    fn deposit_vault_public(public amount: u128) -> Final {
        let caller: address = self.caller;
        let amount_u64: u64 = amount as u64;
        let transfer_future: Final = credits.aleo::transfer_public_as_signer(
            self.address,
            amount_u64
        );
        return final {
            deposit_vault_fin(transfer_future, amount, caller);
        };
    }

    // ------------------------------------------------------------------------
    // 2. WITHDRAW FROM VAULT (operator reclaims funds)
    // ------------------------------------------------------------------------
    fn withdraw_vault(public amount: u128) -> (credits.aleo::credits, Final) {
        let caller: address = self.caller;
        let amount_u64: u64 = amount as u64;
        let (payout, transfer_future): (credits.aleo::credits, Final) =
            credits.aleo::transfer_public_to_private(caller, amount_u64);
        return (payout, final {
            withdraw_vault_fin(transfer_future, amount, caller);
        });
    }

    // ------------------------------------------------------------------------
    // 3. CREATE TURBO MARKET (no liquidity needed — vault-backed)
    // ------------------------------------------------------------------------
    fn create_turbo_market(
        public symbol_id: u8,
        public deadline: u64,
        public nonce: u64,
        public baseline_price: u128,
        public baseline_conf: u128,
        public baseline_block: u64,
        public creator_owner: address,
    ) -> (field, Final) {
        let caller: address = self.caller;

        let market_id: field = BHP256::hash_to_field(TurboSeed {
            creator: creator_owner,
            symbol_id: symbol_id,
            deadline: deadline,
            nonce: nonce,
        });

        return (market_id, final {
            create_turbo_market_fin(
                market_id,
                creator_owner,
                symbol_id,
                deadline,
                baseline_price,
                baseline_conf,
                baseline_block,
                caller
            );
        });
    }

    // ------------------------------------------------------------------------
    // 4. BUY UP / DOWN (private credits in → TurboShare out)
    // ------------------------------------------------------------------------
    fn buy_up_down(
        private market_id: field,
        private side: u8,
        private amount_in: u128,
        private expected_shares: u128,
        private share_nonce: field,
        private credits_in: credits.aleo::credits,
    ) -> (TurboShare, credits.aleo::credits, Final) {
        assert(side == OUTCOME_UP || side == OUTCOME_DOWN);
        assert(amount_in >= MIN_TRADE_AMOUNT);

        let share: TurboShare = TurboShare {
            owner: credits_in.owner,
            market_id: market_id,
            side: side,
            quantity: expected_shares,
            share_nonce: share_nonce,
        };

        let amount_u64: u64 = amount_in as u64;
        let (change, transfer_future): (credits.aleo::credits, Final) =
            credits.aleo::transfer_private_to_public(credits_in, self.address, amount_u64);

        return (share, change, final {
            buy_up_down_fin(transfer_future, market_id, side, amount_in, expected_shares);
        });
    }

    // ------------------------------------------------------------------------
    // 5. RESOLVE TURBO MARKET
    // ------------------------------------------------------------------------
    fn resolve_turbo_market(
        public market_id: field,
        public closing_price: u128,
        public closing_conf: u128,
        public closing_block: u64,
    ) -> Final {
        let caller: address = self.caller;
        return final {
            resolve_turbo_market_fin(market_id, closing_price, closing_conf, closing_block, caller);
        };
    }

    // ------------------------------------------------------------------------
    // 6. EMERGENCY CANCEL
    // ------------------------------------------------------------------------
    fn emergency_cancel(public market_id: field) -> Final {
        return final {
            emergency_cancel_fin(market_id);
        };
    }

    // ------------------------------------------------------------------------
    // 7. CLAIM WINNINGS (payout from vault)
    // ------------------------------------------------------------------------
    fn claim_winnings(
        public market_id: field,
        share: TurboShare,
        public declared_payout: u128,
    ) -> (credits.aleo::credits, Final) {
        assert(share.market_id == market_id);
        assert(share.owner == self.caller);

        let share_id: field = BHP256::hash_to_field(share);
        let side_local: u8 = share.side;
        let qty_local: u128 = share.quantity;
        let payout_u64: u64 = declared_payout as u64;
        let (payout_record, transfer_future): (credits.aleo::credits, Final) =
            credits.aleo::transfer_public_to_private(self.caller, payout_u64);

        return (payout_record, final {
            claim_winnings_fin(transfer_future, market_id, side_local, qty_local, declared_payout, share_id);
        });
    }

    // ------------------------------------------------------------------------
    // 8. CLAIM REFUND (after emergency_cancel)
    // ------------------------------------------------------------------------
    fn claim_refund(
        public market_id: field,
        share: TurboShare,
        public declared_refund: u128,
    ) -> (credits.aleo::credits, Final) {
        assert(share.market_id == market_id);
        assert(share.owner == self.caller);

        let refund_id: field = BHP256::hash_to_field(share);
        let qty_local: u128 = share.quantity;

        let amount_u64: u64 = declared_refund as u64;
        let (refund_record, transfer_future): (credits.aleo::credits, Final) =
            credits.aleo::transfer_public_to_private(self.caller, amount_u64);

        return (refund_record, final {
            claim_refund_fin(transfer_future, market_id, qty_local, declared_refund, refund_id);
        });
    }

    // ------------------------------------------------------------------------
    // 9. WITHDRAW PROTOCOL FEES (per market)
    // ------------------------------------------------------------------------
    fn withdraw_fees(public market_id: field, public amount: u128) -> (credits.aleo::credits, Final) {
        let caller: address = self.caller;
        let amount_u64: u64 = amount as u64;
        let (payout_record, transfer_future): (credits.aleo::credits, Final) =
            credits.aleo::transfer_public_to_private(caller, amount_u64);
        return (payout_record, final {
            withdraw_fees_fin(transfer_future, market_id, amount, caller);
        });
    }
}
