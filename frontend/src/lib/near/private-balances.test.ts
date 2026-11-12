// The wallet store's private balance fields must each come from their token's own slot: 'usdcxPrivate' is Circle
// USDC (slot 3). Reading slot 2 (the retired mock) hid every USDC deposit from the Private balance.
import { describe, expect, it, vi } from 'vitest';
import { KIND, TOKEN } from './config';

const NOTES: Record<number, bigint> = { [TOKEN.NEAR]: 7n, [TOKEN.USAD]: 0n, [TOKEN.USDCX]: 1_000_000n };

vi.mock('./near-wallet', () => ({ currentAccountId: async () => 'alice.testnet', callContract: vi.fn(), signMessage: vi.fn() }));
vi.mock('./notes/keys', () => ({ cachedNoteKeys: async () => ({}), unlockNoteKeys: vi.fn() }));
vi.mock('./notes/store', () => ({
  balanceOf: (_account: string, kind: number, token: number, sub: number) =>
    kind === KIND.BALANCE && sub === 0 ? NOTES[token] ?? 0n : 0n,
  setStatus: vi.fn(), syncNotes: vi.fn(), treeOf: vi.fn(), unspent: vi.fn(), upsertNote: vi.fn(),
}));
vi.mock('./notes/prove', () => ({ prove: vi.fn() }));
vi.mock('./relayer', () => ({ relay: vi.fn() }));

const { privateBalances } = await import('./private');

describe('privateBalances', () => {
  it('reads each token from its own slot', async () => {
    expect(await privateBalances()).toEqual({ private: 7n, usdcxPrivate: 1_000_000n, usadPrivate: 0n });
  });
});
