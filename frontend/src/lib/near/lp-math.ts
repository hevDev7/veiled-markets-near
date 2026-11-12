// LP payouts computed the way the contract computes them (near/contract/contracts/veiled/src/markets.rs,
// act_add_liquidity and act_withdraw_lp), from the market view.
import type { NearMarket } from './chain';

const big = (v: string | number | undefined | null) => BigInt(v ?? 0);
const sub = (a: bigint, b: bigint) => (a > b ? a - b : 0n);

/** Collateral the LPs share once outcome `winner` (1-based) is final: winners' unredeemed shares and the
 *  unclaimed creator fees are set aside first. */
export function lpPoolIfResolved(m: NearMarket, winner: number): bigint {
  const owedToWinners = big(m.outcome_shares[winner - 1]);
  const creatorFees = m.creator_fees_claimed ? 0n : big(m.creator_fees);
  return sub(big(m.market_credits), owedToWinners + creatorFees);
}

/** Collateral the LPs share on a cancelled market: what is left after the traders' collateral. */
export function lpPoolIfCancelled(m: NearMarket): bigint {
  return sub(big(m.market_credits), big(m.trader_collateral));
}

/** What `withdraw_lp` pays for `lpShares` on a resolved or cancelled market, or null while it cannot pay. */
export function lpWithdrawAmount(m: NearMarket, lpShares: bigint): bigint | null {
  const total = big(m.total_lp_shares);
  if (lpShares <= 0n || total === 0n) return null;
  let pool: bigint;
  if (m.status === 3) {
    if (!m.tally?.finalized) return null;
    pool = lpPoolIfResolved(m, m.tally.winning_outcome);
  } else if (m.status === 4) {
    pool = lpPoolIfCancelled(m);
  } else {
    return null;
  }
  return (lpShares * pool) / total;
}

export interface AddLiquidityOutlook {
  /** LP shares minted for the deposit (amount × total LP shares ÷ sum of reserves). */
  lpShares: bigint;
  /** The depositor's fraction of all LP shares after the deposit, 0..1. */
  poolShare: number;
  /** For each outcome (index 0 = outcome 1): what the deposit would withdraw if that outcome won with the
   *  market's current positions, before any LP fees still to come. */
  payoutIfWins: bigint[];
}

export function addLiquidityOutlook(m: NearMarket, amount: bigint): AddLiquidityOutlook | null {
  const n = m.num_outcomes;
  const reserves = m.reserves.slice(0, n).map(big);
  const reserveSum = reserves.reduce((a, b) => a + b, 0n);
  const totalLp = big(m.total_lp_shares);
  if (amount <= 0n || reserveSum === 0n) return null;
  const lpShares = (amount * totalLp) / reserveSum;
  if (lpShares === 0n) return null;
  const after: NearMarket = {
    ...m,
    market_credits: String(big(m.market_credits) + amount),
    total_lp_shares: String(totalLp + lpShares),
  };
  const totalAfter = totalLp + lpShares;
  const payoutIfWins = Array.from({ length: n }, (_, i) => (lpShares * lpPoolIfResolved(after, i + 1)) / totalAfter);
  return { lpShares, poolShare: Number(lpShares) / Number(totalAfter), payoutIfWins };
}
