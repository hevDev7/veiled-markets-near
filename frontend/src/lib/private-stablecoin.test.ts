// A stablecoin buy looks up the trader's balance in the token's own slot. Slot 3 is Circle USDC (key 'USDCX'),
// slot 2 the retired mock; reading the wrong slot made every USDC buy fail with "Not enough USDC".
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TOKEN } from './near/config';

const spendableRecord = vi.fn(async (_token: number, _min: bigint) => 'record');
vi.mock('./near/wallet-records', () => ({ spendableRecord }));

const { findTokenRecord } = await import('./private-stablecoin');

describe('findTokenRecord', () => {
  beforeEach(() => spendableRecord.mockClear());

  it('reads Circle USDC from its slot', async () => {
    await findTokenRecord('USDCX', 100_000n);
    expect(spendableRecord).toHaveBeenCalledWith(TOKEN.USDCX, 100_000n);
    expect(TOKEN.USDCX).toBe(3);
  });

  it('reads the second stablecoin from its slot', async () => {
    await findTokenRecord('USAD', 100_000n);
    expect(spendableRecord).toHaveBeenCalledWith(TOKEN.USAD, 100_000n);
  });
});
