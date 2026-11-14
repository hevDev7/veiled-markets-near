// The create page's success step said "Waiting for on-chain confirmation..." forever (2026-11-14, market #1977): the
// panel was static, left over from the Aleo flow. On NEAR the wallet returns once the transaction has run, so the page
// asks for the market the transaction created, a few times while the RPC catches up, and shows it.
import { describe, expect, it } from 'vitest';
import { waitForCreatedMarket } from './market-tx';

const HASH = 'EZuSbZFMJViAwV7eUDBeYbwoDozY1cBb6teu3nMFC8dh';

describe('waitForCreatedMarket', () => {
  it('asks again until the transaction shows the market it created', async () => {
    const asked: string[] = [];
    const answers = [null, null, '1977field'];
    const id = await waitForCreatedMarket(HASH, {
      delayMs: 0,
      resolve: async (hash) => {
        asked.push(hash);
        return answers[asked.length - 1] ?? null;
      },
    });
    expect(id).toBe('1977field');
    expect(asked).toEqual([HASH, HASH, HASH]);
  });

  it('gives up with null after the last attempt', async () => {
    let calls = 0;
    const id = await waitForCreatedMarket(HASH, {
      attempts: 4,
      delayMs: 0,
      resolve: async () => {
        calls++;
        return null;
      },
    });
    expect(id).toBeNull();
    expect(calls).toBe(4);
  });

  it('counts a lookup that throws as not found yet', async () => {
    let calls = 0;
    const id = await waitForCreatedMarket(HASH, {
      delayMs: 0,
      resolve: async () => {
        calls++;
        if (calls === 1) throw new Error('RPC down');
        return '1977field';
      },
    });
    expect(id).toBe('1977field');
    expect(calls).toBe(2);
  });
});
