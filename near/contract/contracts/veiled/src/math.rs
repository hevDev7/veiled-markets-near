//! FPMM and fee math, integer-for-integer with contracts-v37/src/main.leo (u128, floor division).

use near_sdk::require;

pub const FEE_DENOMINATOR: u128 = 10_000;

pub fn fee(amount: u128, bps: u128) -> u128 {
    amount * bps / FEE_DENOMINATOR
}

/// Leo `buy_shares_priv_fin` (main.leo:255-284). `a` is the amount after fees.
/// Returns (shares_out, new reserves). Inactive reserves (k > n) are forced to 0.
pub fn fpmm_buy(r: [u128; 4], n: u8, outcome: u8, a: u128) -> (u128, [u128; 4]) {
    let i = (outcome - 1) as usize;
    let mut x = r[i];
    for k in 0..4 {
        if k != i && (k as u8) < n {
            x = x * r[k] / (r[k] + a);
        }
    }
    let shares_out = r[i] + a - x;
    let mut out = [0u128; 4];
    for k in 0..(n as usize) {
        out[k] = if k == i { x } else { r[k] + a };
    }
    (shares_out, out)
}

/// Leo `sell_shares_finalize` (main.leo:380-430). `p` = tokens_desired − lp_fee leaves the pool.
/// Returns (shares_needed, new reserves). A zero denominator for outcome 3/4 is replaced by 1 as in Leo;
/// for outcome 1/2 it cannot occur because `r_k >= p` is asserted and r_k > p when the pool is live.
pub fn fpmm_sell(r: [u128; 4], n: u8, outcome: u8, p: u128) -> (u128, [u128; 4]) {
    let i = (outcome - 1) as usize;
    let mut x = r[i];
    let mut out = [0u128; 4];
    for k in 0..4 {
        let active = (k as u8) < n;
        if k != i && active {
            require!(r[k] >= p, "ERR_POOL_UNDERFLOW");
            let den = r[k] - p;
            let den = if den == 0 {
                require!(k >= 2, "ERR_POOL_UNDERFLOW");
                1
            } else {
                den
            };
            x = x * r[k] / den;
            out[k] = r[k] - p;
        }
    }
    let shares_needed = x - r[i] + p;
    out[i] = x;
    (shares_needed, out)
}

/// Leo `add_liq_finalize` (main.leo:490-503), with the rounding dust going to the last active reserve
/// instead of reserve_4 (the Leo version leaks dust into reserve_4 when n < 4).
/// Returns (lp_shares, new reserves).
pub fn add_liquidity(r: [u128; 4], n: u8, total_lp_shares: u128, amount: u128) -> (u128, [u128; 4]) {
    let total: u128 = r.iter().sum();
    require!(total > 0, "ERR_EMPTY_POOL");
    let lp = amount * total_lp_shares / total;
    let mut out = r;
    let mut added = 0u128;
    let last = (n - 1) as usize;
    for k in 0..last {
        let add = amount * r[k] / total;
        out[k] += add;
        added += add;
    }
    out[last] += amount - added;
    (lp, out)
}

/// Winner of a bonded vote: highest bond, ties go to the lower outcome (Leo `finalize_votes`).
pub fn vote_winner(bonds: [u128; 4], n: u8) -> u8 {
    let mut best = 0usize;
    for k in 1..(n as usize) {
        if bonds[k] > bonds[best] {
            best = k;
        }
    }
    best as u8 + 1
}

/// Outcome prices as the frontend computes them: p_i ∝ Π_{k≠i} r_k (FPMM), returned in basis points.
pub fn prices_bps(r: [u128; 4], n: u8) -> Vec<u128> {
    let n = n as usize;
    let weights: Vec<u128> = (0..n)
        .map(|i| (0..n).filter(|&k| k != i).fold(1u128, |acc, k| acc.saturating_mul(r[k].max(1) / 1000 + 1)))
        .collect();
    let total: u128 = weights.iter().sum();
    weights.iter().map(|w| w * FEE_DENOMINATOR / total.max(1)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn buy_matches_leo_step_division() {
        // 2-outcome pool, 10_000 each, buy outcome 1 with a = 1000.
        // x = 10000 * 10000 / 11000 = 9090; shares = 10000 + 1000 - 9090 = 1910.
        let (shares, r) = fpmm_buy([10_000, 10_000, 0, 0], 2, 1, 1000);
        assert_eq!(shares, 1910);
        assert_eq!(r, [9090, 11_000, 0, 0]);
        // 3 outcomes: x = 9000*9000/10000 = 8100; x = 8100*9000/10000 = 7290; shares = 9000+1000-7290.
        let (shares, r) = fpmm_buy([9000, 9000, 9000, 0], 3, 2, 1000);
        assert_eq!(shares, 2710);
        assert_eq!(r, [10_000, 7290, 10_000, 0]);
    }

    #[test]
    fn sell_inverts_buy_up_to_rounding() {
        let (shares, r) = fpmm_buy([10_000, 10_000, 0, 0], 2, 1, 1000);
        // Selling back p = 990 (1000 − 1% LP fee) needs fewer shares than were bought.
        let (needed, r2) = fpmm_sell(r, 2, 1, 990);
        // x = 9090 * 11000 / 10010 = 9989 ; needed = 9989 − 9090 + 990 = 1889
        assert_eq!(needed, 1889);
        assert!(needed <= shares);
        assert_eq!(r2, [9989, 10_010, 0, 0]);
    }

    #[test]
    fn add_liquidity_keeps_dust_in_active_reserves() {
        let (lp, r) = add_liquidity([3333, 3333, 3334, 0], 3, 10_000, 1000);
        assert_eq!(lp, 1000);
        assert_eq!(r, [3333 + 333, 3333 + 333, 3334 + 334, 0]);
        assert_eq!(r[3], 0);
    }

    #[test]
    fn ties_go_to_the_lower_outcome() {
        assert_eq!(vote_winner([20, 20, 0, 0], 2), 1);
        assert_eq!(vote_winner([10, 30, 30, 0], 3), 2);
        assert_eq!(fee(1_000_000, 50), 5000);
    }
}
