// Parlay ticket records carry the on-chain token slot; slot 3 is Circle USDC (key 'USDCX'), slot 2 the retired mock.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const contract = vi.hoisted(() => ({ quoteParlay: vi.fn(), getParlayPool: vi.fn() }));
vi.mock('./near/parlay', () => contract);

import {
  checkParlayPlacement,
  floorToCents,
  getParlayStakeLimits,
  parlayStakeLimitError,
  parseParlayTicketRecord,
} from './parlay-helpers';

const ticket = (slot: number) =>
  `{ owner: alice.testnet, parlay_id: 7field, stake: 1000000u128, ` +
  `potential_payout: 3000000u128, token_type: ${slot}u8, ticket_nonce: 9field }`;

describe('parseParlayTicketRecord', () => {
  it('reads each token slot as its token', () => {
    expect(parseParlayTicketRecord(ticket(1))?.tokenType).toBe('NEAR');
    expect(parseParlayTicketRecord(ticket(3))?.tokenType).toBe('USDCX');
    expect(parseParlayTicketRecord(ticket(2))?.tokenType).toBe('USAD');
  });
});

// A ticket may pay at most a share of its thinnest leg's pool depth, so small markets take small stakes. The slip did
// not say how much, and a stake above the limit failed only after the wallet had been asked to deposit.
describe('parlayStakeLimitError', () => {
  const limits = { maxStake: 125_000n, minStake: 100_000n, pool: 4_100_000n };

  it('accepts a stake up to the limit', () => {
    expect(parlayStakeLimitError(125_000n, limits, 'NEAR')).toBeNull();
    expect(parlayStakeLimitError(0n, limits, 'NEAR')).toBeNull();
  });

  it('names the limit, rounded down, when the stake is above it', () => {
    expect(parlayStakeLimitError(500_000n, limits, 'NEAR'))
      .toBe('This parlay can take at most 0.12 NEAR right now. Lower the stake.');
  });

  it('says when the legs cannot take even the minimum stake, whatever stake is typed', () => {
    const thin = { ...limits, maxStake: 62_500n };
    const text = 'These legs can take at most 0.06 NEAR right now, below the 0.10 NEAR minimum. '
      + 'Try fewer legs or markets with more liquidity.';
    expect(parlayStakeLimitError(0n, thin, 'NEAR')).toBe(text);
    expect(parlayStakeLimitError(100_000n, thin, 'NEAR')).toBe(text);
  });

  it('says when the stake token has no parlay pool yet', () => {
    const empty = { maxStake: 0n, minStake: 100_000n, pool: 0n };
    expect(parlayStakeLimitError(100_000n, empty, 'USDCX'))
      .toBe('The USDC parlay pool is not funded yet, so it cannot back a payout. Stake NEAR instead.');
    expect(parlayStakeLimitError(100_000n, empty, 'NEAR'))
      .toBe('The NEAR parlay pool is not funded yet, so it cannot back a payout.');
  });
});

describe('floorToCents', () => {
  it('never rounds a limit up', () => {
    expect(floorToCents(125_000n)).toBe(120_000n);
    expect(floorToCents(129_999n)).toBe(120_000n);
    expect(floorToCents(100_000n)).toBe(100_000n);
    expect(floorToCents(9_999n)).toBe(0n);
  });
});

describe('getParlayStakeLimits', () => {
  const legs = [{ marketId: '930field', outcome: 1 }, { marketId: '931field', outcome: 2 }];

  beforeEach(() => {
    contract.quoteParlay.mockReset();
    contract.getParlayPool.mockReset();
    contract.getParlayPool.mockResolvedValue({
      pool: ['0', '4100000', '0', '7000000'], exposure: ['0', '365580', '0', '0'], min_stake: '100000',
    });
  });

  it("reads the contract's largest stake for these legs and the stake token's pool", async () => {
    contract.quoteParlay.mockResolvedValue({ max_stake: '125000' });
    expect(await getParlayStakeLimits('NEAR', legs)).toEqual({ maxStake: 125_000n, minStake: 100_000n, pool: 4_100_000n });
    expect(contract.quoteParlay).toHaveBeenCalledWith(1, 1_000_000n, legs);
    expect((await getParlayStakeLimits('USDCX', legs)).pool).toBe(7_000_000n);
    expect(contract.quoteParlay).toHaveBeenLastCalledWith(3, 1_000_000n, legs);
  });

  it("fails with the contract's reason when the legs cannot be quoted", async () => {
    contract.quoteParlay.mockRejectedValue(new Error('One of these markets is not open for parlays.'));
    await expect(getParlayStakeLimits('NEAR', legs)).rejects.toThrow('One of these markets is not open for parlays.');
  });
});

// Checkout runs these checks before placing, and placing may first ask the wallet for a deposit: a stake the contract
// would refuse must be refused here, not after the deposit.
describe('checkParlayPlacement', () => {
  const legs = [{ marketId: '933field', outcome: 1 }, { marketId: '930field', outcome: 1 }];

  beforeEach(() => {
    contract.quoteParlay.mockReset();
    contract.getParlayPool.mockReset();
    contract.quoteParlay.mockImplementation(async (_token: number, stake: bigint) => ({
      leg_odds_bps: ['18100', '20000'], combined_odds_bps: '36200', potential_payout: String((stake * 36_200n) / 10_000n),
      fee_if_won: '0', net_if_won: '0', max_stake: '125000',
    }));
    contract.getParlayPool.mockResolvedValue({
      pool: ['0', '4100000', '0', '0'], exposure: ['0', '365580', '0', '0'], min_stake: '100000', max_payout: '1000000000',
      fee_bps: '200', max_combined_odds_bps: '10000000', max_leg_odds_bps: '1000000', safety_bps: '11000',
      leg_payout_bps: '5000', paused: false, count: '1',
    });
  });

  it("refuses a stake above the contract's largest for these legs", async () => {
    await expect(checkParlayPlacement({ tokenType: 'NEAR', stake: 500_000n, legs }))
      .rejects.toThrow('This parlay can take at most 0.12 NEAR right now. Lower the stake.');
  });

  it('gives the quote to place with when the stake fits', async () => {
    const quote = await checkParlayPlacement({ tokenType: 'NEAR', stake: 120_000n, legs });
    expect(quote).toMatchObject({ max_stake: '125000', potential_payout: '434400' });
    expect(contract.quoteParlay).toHaveBeenCalledWith(1, 120_000n, legs);
  });
});
