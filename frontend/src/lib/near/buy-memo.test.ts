// A buy writes what it spent into the memo of the share note it mints (sealed with the buyer's key; the amount is
// already public as the transaction's out_amount), so the position's cost can be recovered from the chain.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KIND, TOKEN } from './config';
import { pkOf } from './notes/crypto';
import { memoKeyFromSeed, openMemo } from './notes/memo';
import type { Note } from './notes/store';

const sk = 999n;
const memoKey = await memoKeyFromSeed(new Uint8Array(32).fill(3));
const keys = { accountId: 'buyer.testnet', sk, pk: pkOf(sk), memoKey, source: 'signature' as const };
const balance: Note = {
  kind: KIND.BALANCE, asset: BigInt(TOKEN.NEAR), sub: 0, amount: 1_000_000n, blinding: 5n, index: 0, commitment: 1n,
  nullifier: 2n, status: 'unspent', createdAt: 0,
};
const share: Note = { ...balance, kind: KIND.SHARE, asset: 933n, sub: 1, amount: 195_277n, index: 1 };
const upserted: Note[] = [];
const relayed: { ext_data: string }[] = [];

vi.mock('./near-wallet', () => ({ currentAccountId: async () => 'buyer.testnet', callContract: vi.fn(), signMessage: vi.fn() }));
vi.mock('./notes/keys', () => ({ cachedNoteKeys: async () => keys, unlockNoteKeys: vi.fn() }));
vi.mock('./notes/store', () => ({
  balanceOf: vi.fn(),
  setStatus: vi.fn(),
  syncNotes: async () => [],
  treeOf: () => ({ path: () => ({ pathElements: Array(20).fill(0n), pathIndices: Array(20).fill(0) }), root: () => 0n, push: vi.fn() }),
  unspent: () => [balance, share],
  upsertNote: (_a: string, n: Note) => upserted.push(n),
}));
vi.mock('./notes/prove', () => ({
  prove: async () => ({ proof: { pi_a: ['1', '2'], pi_b: [['1', '2'], ['3', '4']], pi_c: ['1', '2'] }, publicSignals: Array(9).fill('0') }),
}));
vi.mock('./relayer', () => ({
  relay: async (body: { ext_data: string }) => {
    relayed.push(body);
    return {
      txHash: 'tx',
      result: { change_index: '5', new_index: '6', new_commitment: '77', new_kind: 2, new_asset: '933', new_sub: 1, new_amount: '195277' },
    };
  },
}));

const { privateAction } = await import('./private');

beforeEach(() => {
  upserted.length = 0;
  relayed.length = 0;
});

describe('privateAction memo of the minted note', () => {
  it('carries the cost of a buy, and the minted note knows it', async () => {
    await privateAction({
      kind: KIND.BALANCE, asset: TOKEN.NEAR, sub: 0, amount: 100_000n,
      action: { type: 'buy', market_id: '933', outcome: 1, min_shares_out: '1' },
    });
    const ext = JSON.parse(relayed[0].ext_data);
    expect(await openMemo(memoKey, ext.new_memo)).toMatchObject({ c: '100000' });
    expect(upserted.find((n) => n.kind === KIND.SHARE)?.cost).toBe(100_000n);
  });

  it('carries no cost for a sell', async () => {
    await privateAction({
      kind: KIND.SHARE, asset: 933n, sub: 1, amount: 195_277n, notes: [share],
      action: { type: 'sell', tokens_desired: '90000' },
    });
    const ext = JSON.parse(relayed[0].ext_data);
    expect(await openMemo(memoKey, ext.new_memo)).not.toHaveProperty('c');
  });
});
