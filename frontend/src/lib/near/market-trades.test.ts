// The dashboard's "Total Bets" and each market's bet count come from the contract's own counter of buys and sells.
// They used to come from an off-chain table that the NEAR deployment does not have, so every market showed 0.
import { describe, expect, it } from 'vitest';
import { installAleoRestShim } from './aleo-rest';
import type { NearMarket } from './chain';
import { primeView } from './rpc';

const market = (over: Partial<NearMarket>): NearMarket =>
  ({
    id: '77',
    creator: 'alice.testnet',
    resolver: 'alice.testnet',
    question_hash: '123field',
    category: 2,
    num_outcomes: 2,
    deadline: '900',
    resolution_deadline: '1900',
    status: 1,
    created_at: '100',
    token_type: 1,
    metadata: '',
    reserves: ['500000', '500000', '0', '0'],
    total_liquidity: '1000000',
    total_lp_shares: '1000000',
    total_volume: '3000000',
    tally: null,
    dispute: null,
    trades: '0',
    ...over,
  }) as NearMarket;

describe('a market read from NEAR', () => {
  it('carries the number of trades the contract has counted', async () => {
    // The shim that answers the pages' legacy reads from NEAR patches window.fetch; give this test a window.
    const kept = new Map<string, string>();
    Object.assign(globalThis, {
      window: globalThis,
      location: { href: 'http://localhost/' },
      localStorage: { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v), removeItem: (k: string) => void kept.delete(k) },
    });
    installAleoRestShim();
    primeView('get_market', { market_id: '77' }, market({ id: '77', trades: '7' }));
    const { getAMMPool } = await import('../aleo-client');

    const pool = await getAMMPool('77field');

    expect(pool?.total_volume).toBe(3_000_000n);
    expect(pool?.total_trades).toBe(7);
  });
});
