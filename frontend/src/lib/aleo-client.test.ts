// The contract's get_market says whether the owner approved a market as a parlay leg (`parlay_leg`), but the UI reads
// markets through the Aleo-era readers, which rebuilt them from Leo structs without that field, so the UI could not
// tell which markets take parlays. Only get_market is faked here: the struct goes through the real REST shim and parser.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NearMarket } from './near/chain';

const chain = vi.hoisted(() => ({ markets: new Map<string, unknown>() }));

vi.mock('./near/chain', () => ({
  getNearMarket: async (id: string) => chain.markets.get(String(id)) ?? null,
}));
vi.mock('./near/near-wallet', () => ({ currentAccountId: () => null }));
vi.mock('./near/executor', () => ({ createdMarketFor: vi.fn(), knownTxOutcome: vi.fn() }));

import { getMarket } from './aleo-client';
import { aleoMappingValue } from './near/aleo-rest';
import { TOKEN } from './near/config';

const nearMarket = (id: string, o: Partial<NearMarket> = {}) => ({
  id,
  creator: 'alice.testnet',
  resolver: 'alice.testnet',
  question_hash: '77',
  category: 7,
  num_outcomes: 2,
  deadline: '500000000',
  resolution_deadline: '500100000',
  status: 1,
  created_at: '400000000',
  token_type: TOKEN.NEAR,
  ...o,
}) as NearMarket;

beforeEach(() => {
  chain.markets.clear();
  // What installAleoRestShim does in the browser: answer the Aleo mapping URL from NEAR.
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const m = String(input).match(/\/program\/([^/]+)\/mapping\/([^/]+)\/([^/?#]+)$/);
    if (!m) return new Response('null', { status: 404 });
    return new Response(JSON.stringify(await aleoMappingValue(m[1], m[2], decodeURIComponent(m[3]))));
  }));
});

describe('getMarket', () => {
  it('reads that the owner approved a market as a parlay leg', async () => {
    chain.markets.set('933', nearMarket('933', { parlay_leg: true }));
    expect(await getMarket('933field')).toMatchObject({ id: '933field', status: 1, parlay_leg: true });
  });

  it('reads a market without that approval as not a leg', async () => {
    chain.markets.set('930', nearMarket('930', { parlay_leg: false }));
    chain.markets.set('931', nearMarket('931'));
    expect((await getMarket('930field'))?.parlay_leg).toBe(false);
    expect((await getMarket('931field'))?.parlay_leg).toBe(false);
  });
});
