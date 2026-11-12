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
    // A reserve of 0 would price every other outcome at nothing: the pool keeps at least one unit of each.
    require!(x > 0, "ERR_POOL_DEPLETED");
    let shares_out = r[i] + a - x;
    let mut out = [0u128; 4];
    for k in 0..(n as usize) {
        out[k] = if k == i { x } else { r[k] + a };
    }
    (shares_out, out)
}

/// Leo `sell_shares_finalize` (main.leo:380-430). `p` is the collateral that leaves the pool.
/// Returns (shares_needed, new reserves), or None when the pool cannot release `p`: every other reserve must keep
/// at least one unit (Leo replaced a zero denominator by 1 for outcomes 3 and 4, which emptied that reserve), and
/// the products must fit in u128.
pub fn try_sell(r: [u128; 4], n: u8, outcome: u8, p: u128) -> Option<(u128, [u128; 4])> {
    let i = (outcome - 1) as usize;
    let mut x = r[i];
    let mut out = [0u128; 4];
    for k in 0..(n as usize) {
        if k != i {
            if r[k] <= p {
                return None;
            }
            x = x.checked_mul(r[k])? / (r[k] - p);
            out[k] = r[k] - p;
        }
    }
    let shares_needed = (x - r[i]).checked_add(p)?;
    out[i] = x;
    Some((shares_needed, out))
}

/// `try_sell` for a fixed `p`; panics with `ERR_POOL_UNDERFLOW` when the pool cannot release it.
pub fn fpmm_sell(r: [u128; 4], n: u8, outcome: u8, p: u128) -> (u128, [u128; 4]) {
    try_sell(r, n, outcome, p).unwrap_or_else(|| near_sdk::env::panic_str("ERR_POOL_UNDERFLOW"))
}

/// The most collateral that `shares` of `outcome` take out of the pool, never less than `min_tokens`.
/// Returns (tokens, shares the pool takes, new reserves), or None when the shares do not cover `min_tokens`.
/// The shares needed grow with the tokens released, so the largest amount is found by bisection.
pub fn sell_max_tokens(r: [u128; 4], n: u8, outcome: u8, shares: u128, min_tokens: u128) -> Option<(u128, u128, [u128; 4])> {
    let i = (outcome - 1) as usize;
    let cap = (0..n as usize).filter(|&k| k != i).map(|k| r[k]).min()?.checked_sub(1)?;
    let fits = |p: u128| try_sell(r, n, outcome, p).filter(|(needed, _)| *needed <= shares);
    if min_tokens > cap {
        return None;
    }
    fits(min_tokens)?;
    let (mut lo, mut hi) = (min_tokens, cap);
    while lo < hi {
        let mid = lo + (hi - lo + 1) / 2;
        if fits(mid).is_some() {
            lo = mid;
        } else {
            hi = mid - 1;
        }
    }
    let (needed, reserves) = fits(lo)?;
    Some((lo, needed, reserves))
}

/// Per-outcome collateral ledger after `p` leaves the pool for shares of `outcome`: the outcome's own collateral
/// goes first; anything beyond it (the seller's gain) comes from the other outcomes in proportion to theirs, so
/// the ledger keeps adding up to the traders' collateral.
pub fn collateral_after_sell(mut oc: [u128; 4], n: u8, outcome: u8, p: u128) -> [u128; 4] {
    let i = (outcome - 1) as usize;
    let n = n as usize;
    let own = p.min(oc[i]);
    oc[i] -= own;
    let mut rest = p - own;
    if rest == 0 {
        return oc;
    }
    let others: u128 = (0..n).filter(|&k| k != i).map(|k| oc[k]).sum();
    if rest >= others {
        for k in (0..n).filter(|&k| k != i) {
            oc[k] = 0;
        }
        return oc;
    }
    let before = oc;
    for k in (0..n).filter(|&k| k != i) {
        let take = rest * before[k] / others;
        oc[k] -= take;
    }
    rest -= (0..n).filter(|&k| k != i).map(|k| before[k] - oc[k]).sum::<u128>();
    // What flooring left over (less than one unit per outcome) comes from the first outcomes that have any.
    for k in (0..n).filter(|&k| k != i) {
        let take = rest.min(oc[k]);
        oc[k] -= take;
        rest -= take;
    }
    oc
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
        // Releasing p = 990 from the pool needs fewer shares than were bought.
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
    #[should_panic(expected = "ERR_POOL_DEPLETED")]
    fn a_buy_that_would_empty_a_reserve_is_refused() {
        // Four reserves of 2.5 tokens; 400 tokens on one outcome divides its reserve down to 0.
        fpmm_buy([2_500_000; 4], 4, 4, 400_000_000);
    }

    #[test]
    #[should_panic(expected = "ERR_POOL_UNDERFLOW")]
    fn a_sell_that_would_empty_a_reserve_is_refused() {
        // Releasing 3000 would take the third reserve from 3000 to 0.
        fpmm_sell([9000, 9000, 3000, 0], 3, 1, 3000);
    }

    #[test]
    fn sell_max_tokens_finds_the_most_the_offered_shares_cover() {
        // Pool after the 1000 buy above. p = 1000: x = 9090 * 11000 / 10000 = 9999, needs 9999 - 9090 + 1000 = 1909.
        // p = 1001: x = 9090 * 11000 / 9999 = 10000, needs 1911.
        assert_eq!(sell_max_tokens([9090, 11_000, 0, 0], 2, 1, 1910, 990), Some((1000, 1909, [9999, 10_000, 0, 0])));
    }

    #[test]
    fn sell_max_tokens_is_none_when_the_shares_do_not_cover_the_minimum() {
        // 990 needs 1889 shares (the test above this one's pool, see sell_inverts_buy_up_to_rounding).
        assert_eq!(sell_max_tokens([9090, 11_000, 0, 0], 2, 1, 1888, 990), None);
        assert_eq!(sell_max_tokens([9090, 11_000, 0, 0], 2, 1, 1889, 990), Some((990, 1889, [9989, 10_010, 0, 0])));
    }

    #[test]
    fn sell_max_tokens_never_empties_another_reserve() {
        // Far more shares than the pool can absorb: the other reserve keeps 1.
        let (p, _, r) = sell_max_tokens([9090, 11_000, 0, 0], 2, 1, u64::MAX as u128, 1000).unwrap();
        assert_eq!((p, r[1]), (10_999, 1));
    }

    #[test]
    fn a_sell_reduces_its_own_outcomes_collateral_first() {
        assert_eq!(collateral_after_sell([100, 50, 0, 0], 2, 1, 30), [70, 50, 0, 0]);
    }

    #[test]
    fn a_sell_above_its_outcomes_collateral_takes_the_rest_from_the_others_pro_rata() {
        assert_eq!(collateral_after_sell([10, 90, 0, 0], 2, 1, 50), [0, 50, 0, 0]);
        assert_eq!(collateral_after_sell([10, 60, 30, 0], 3, 1, 40), [0, 40, 20, 0]);
        // 7 over (5, 5, 5): 2 each by floor, the remaining 1 from the first of them.
        assert_eq!(collateral_after_sell([0, 5, 5, 5], 4, 1, 7), [0, 2, 3, 3]);
    }

    #[test]
    fn a_sell_larger_than_all_collateral_leaves_none() {
        assert_eq!(collateral_after_sell([3, 4, 0, 0], 2, 1, 10), [0, 0, 0, 0]);
    }

    #[test]
    fn ties_go_to_the_lower_outcome() {
        assert_eq!(vote_winner([20, 20, 0, 0], 2), 1);
        assert_eq!(vote_winner([10, 30, 30, 0], 3), 2);
        assert_eq!(fee(1_000_000, 50), 5000);
    }
}
