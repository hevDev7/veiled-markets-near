// A share note's leaf records the market, outcome and shares, but not what the bet cost. The buyer's own memo on
// that leaf now carries the cost, so a browser that finds the note on chain can show the position's cost too.
import { describe, expect, it, vi } from 'vitest';
import { KIND } from '../config';
import { commitmentOf, ownerBlindOf, pkOf } from './crypto';
import { memoKeyFromSeed, sealMemo } from './memo';

const LEAVES: unknown[] = [];
vi.mock('../rpc', () => ({
  view: async (method: string) => {
    if (method === 'get_tree_info') return { next_index: String(LEAVES.length) };
    if (method === 'get_leaves') return LEAVES;
    if (method === 'is_spent') return false;
    throw new Error(method);
  },
}));

const { syncNotes } = await import('./store');

describe('syncNotes', () => {
  it('reads the cost a buy put in its share note memo, and leaves it unset when the memo has none', async () => {
    const seed = new Uint8Array(32).fill(7);
    const sk = 12345n;
    const keys = { accountId: 'cost.testnet', sk, pk: pkOf(sk), memoKey: await memoKeyFromSeed(seed), source: 'signature' as const };
    const leaf = async (index: number, blinding: bigint, amount: bigint, memo: Record<string, string>) => {
      const ownerBlind = ownerBlindOf(sk, blinding);
      return {
        index: String(index),
        commitment: commitmentOf(KIND.SHARE, 933n, 1, amount, ownerBlind).toString(),
        note: { kind: KIND.SHARE, asset: '933', sub: 1, amount: amount.toString(), owner_blind: ownerBlind.toString() },
        memo: await sealMemo(keys.memoKey, memo),
      };
    };
    LEAVES.push(await leaf(0, 11n, 195_277n, { b: '11', c: '100000' }), await leaf(1, 22n, 50_000n, { b: '22' }));

    const notes = await syncNotes(keys);

    expect(notes.map((n) => [n.amount, n.cost])).toEqual([
      [195_277n, 100_000n],
      [50_000n, undefined],
    ]);
  });
});
