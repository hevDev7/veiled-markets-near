// The browser note engine must agree bit for bit with the circuit and the contract. These vectors come from
// near/circuits/scripts/gen-fixtures.mjs (the same file the contract's sandbox tests replay).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { commitmentOf, extDataHash, ownerBlindOf, pkOf } from './crypto';
import { memoKeyFromSeed, openMemo, sealMemo } from './memo';
import { MerkleTree } from './tree';
import { selectNotes, PrivateBalanceError } from '../private';
import type { Note } from './store';

const fx = JSON.parse(
  readFileSync(new URL('../../../../../near/contract/integration-tests/fixtures/pool.json', import.meta.url), 'utf8'),
);
const SK = 987654321n;

describe('note scheme', () => {
  it('matches the circuit fixture commitments', () => {
    const ob = ownerBlindOf(SK, 101n);
    expect(ob.toString()).toBe(fx.deposits.A.owner_blind);
    expect(commitmentOf(1, 1n, 0, 2_000_000n, ob).toString()).toBe(fx.deposits.A.commitment);
    expect(pkOf(SK)).not.toBe(0n);
  });

  it('builds the same tree root as the contract', () => {
    const tree = new MerkleTree(fx.expected.leaves.map((x: string) => BigInt(x)));
    expect(tree.root().toString()).toBe(fx.expected.roots.R4);
    const partial = new MerkleTree(fx.expected.leaves.slice(0, 2).map((x: string) => BigInt(x)));
    expect(partial.root().toString()).toBe(fx.expected.roots.R1);
  });

  it('hashes ext_data like the contract', async () => {
    const t = fx.transacts.W1;
    expect((await extDataHash(t.ext_data)).toString()).toBe(t.public.ext_data_hash);
  });
});

describe('memos', () => {
  it('open only with the sealing key', async () => {
    const k1 = await memoKeyFromSeed(new Uint8Array(32).fill(1));
    const k2 = await memoKeyFromSeed(new Uint8Array(32).fill(2));
    const memo = await sealMemo(k1, { b: '123', m: '5' });
    expect(memo.length).toBeLessThan(1024);
    expect(await openMemo(k1, memo)).toEqual({ b: '123', m: '5' });
    expect(await openMemo(k2, memo)).toBeNull();
    expect(await openMemo(k1, 'not a memo')).toBeNull();
  });
});

describe('note selection', () => {
  const note = (amount: bigint, index: number, extra: Partial<Note> = {}): Note => ({
    kind: 1, asset: 1n, sub: 0, amount, blinding: 1n, index, commitment: 0n, nullifier: BigInt(index),
    status: 'unspent', createdAt: 0, ...extra,
  });
  const notes = [note(5n, 0), note(30n, 2), note(10n, 4), note(99n, 6, { status: 'spent' }), note(50n, 8, { asset: 2n })];

  it('prefers the smallest single note that covers the amount', () => {
    expect(selectNotes(notes, 1, 1n, 0, 8n)!.map((n) => n.index)).toEqual([4]);
  });
  it('falls back to the two largest notes', () => {
    expect(selectNotes(notes, 1, 1n, 0, 40n)!.map((n) => n.index)).toEqual([2, 4]);
  });
  it('asks for a merge when two notes are not enough', () => {
    expect(selectNotes(notes, 1, 1n, 0, 45n)).toBeNull();
  });
  it('never touches spent notes or other assets, and reports the shortfall', () => {
    expect(() => selectNotes(notes, 1, 1n, 0, 46n)).toThrow(PrivateBalanceError);
  });
});
