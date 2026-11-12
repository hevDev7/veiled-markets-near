import { describe, expect, it } from 'vitest';
import type { NearMarket } from './chain';
import { addLiquidityOutlook, lpWithdrawAmount } from './lp-math';

// A 10 USDC binary market after a 50 USDC buy of outcome 1, as the contract's integer math leaves it.
const lopsided = {
  num_outcomes: 2,
  status: 1,
  reserves: ['458715', '54500000', '0', '0'],
  market_credits: '59750000',
  creator_fees: '250000',
  creator_fees_claimed: false,
  outcome_shares: ['54041285', '0', '0', '0'],
  total_lp_shares: '10000000',
  trader_collateral: '49500000',
  tally: null,
} as unknown as NearMarket;

describe('addLiquidityOutlook', () => {
  it('shows that liquidity added to a lopsided market mostly backs the expected loser', () => {
    const o = addLiquidityOutlook(lopsided, 10_000_000n)!;
    expect(o.lpShares).toBe(1_819_547n);
    expect(o.payoutIfWins).toEqual([2_379_774n, 10_699_100n]);
    expect(o.poolShare).toBeCloseTo(0.1539, 4);
  });

  it('returns the deposit on a fresh, balanced market', () => {
    const fresh = {
      ...lopsided,
      reserves: ['5000000', '5000000', '0', '0'],
      market_credits: '10000000',
      creator_fees: '0',
      outcome_shares: ['0', '0', '0', '0'],
      trader_collateral: '0',
    } as NearMarket;
    const o = addLiquidityOutlook(fresh, 2_000_000n)!;
    expect(o.lpShares).toBe(2_000_000n);
    expect(o.payoutIfWins).toEqual([2_000_000n, 2_000_000n]);
  });
});

describe('lpWithdrawAmount', () => {
  it('sets aside unredeemed winning shares and unclaimed creator fees on a resolved market', () => {
    const resolved = {
      ...lopsided,
      status: 3,
      tally: { finalized: true, winning_outcome: 1 },
    } as unknown as NearMarket;
    // (59.75 − 54.041285 − 0.25) USDC to the only LP.
    expect(lpWithdrawAmount(resolved, 10_000_000n)).toBe(5_458_715n);
    expect(lpWithdrawAmount({ ...resolved, creator_fees_claimed: true }, 10_000_000n)).toBe(5_708_715n);
  });

  it('pays what is left after trader collateral on a cancelled market, and nothing while active', () => {
    expect(lpWithdrawAmount({ ...lopsided, status: 4 } as NearMarket, 5_000_000n)).toBe(5_125_000n);
    expect(lpWithdrawAmount(lopsided, 5_000_000n)).toBeNull();
  });
});
