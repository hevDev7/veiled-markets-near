// A quote the contract refuses (ERR_…) must hold a parlay slip, but a view the RPC did not answer must not: testnet
// nodes answer 429 often, and a slip that locked on that would show the raw node message until it was reopened.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => ({ view: vi.fn() }));
vi.mock('./rpc', () => ({ view: rpc.view, cachedView: vi.fn(), invalidateViews: vi.fn() }));
vi.mock('./private', () => ({ privateAction: vi.fn(), refreshNotes: vi.fn() }));
vi.mock('./executor', () => ({ topUp: vi.fn() }));
vi.mock('./chain', () => ({ getNearMarket: vi.fn(), decodeMetadata: vi.fn() }));

import { quoteParlay } from './parlay';
import { ContractRefusal } from './relayer';

const legs = [{ marketId: '930field', outcome: 1 }, { marketId: '31field', outcome: 1 }];

describe('quoteParlay', () => {
  beforeEach(() => {
    rpc.view.mockReset();
  });

  it("reports the contract's refusal as a refusal, in words", async () => {
    rpc.view.mockRejectedValue(new Error('Smart contract panicked: ERR_LEG_NOT_ELIGIBLE'));
    const err = await quoteParlay(1, 1_000_000n, legs).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ContractRefusal);
    expect((err as Error).message).toBe('One of these markets is not open for parlays.');
  });

  it('reports a node or network failure as not a refusal, with its own message', async () => {
    rpc.view.mockRejectedValue(new Error('https://near-testnet.drpc.org answered 429'));
    const err = await quoteParlay(1, 1_000_000n, legs).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(ContractRefusal);
    expect((err as Error).message).toBe('https://near-testnet.drpc.org answered 429');
  });
});
