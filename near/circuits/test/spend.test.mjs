import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as snarkjs from 'snarkjs';
import {
  initPoseidon, poseidon, MerkleTree, ownerBlind, noteCommitment, spendInput, proveSpend, extDataHash,
} from '../lib/notes.mjs';

const vkey = JSON.parse(readFileSync(new URL('../build/verification_key.json', import.meta.url)));
const SK = 123456789n;
const NEAR = { kind: 1, asset: 1, sub: 0 };
const EXT = '{"action":{"type":"withdraw","recipient":"bob.test.near"},"new_owner_blind":"0","new_memo":"","change_memo":"","fee":"0"}';

let tree;
const a = { amount: 2_000_000n, blinding: 11n };
const b = { amount: 3_000_000n, blinding: 22n };

before(async () => {
  await initPoseidon();
  tree = new MerkleTree();
  for (const n of [a, b]) {
    const c = noteCommitment({ ...NEAR, amount: n.amount, ownerBlind: ownerBlind(SK, n.blinding) });
    n.index = tree.insertPair(c, 0n);
  }
});

after(async () => {
  // snarkjs keeps curve worker threads alive; stop them so the test process exits.
  if (globalThis.curve_bn128) await globalThis.curve_bn128.terminate();
});

test('poseidon matches the circomlib reference vector', () => {
  assert.equal(poseidon(1n, 2n), 0x115cc0f5e7d690413df64c6b9662e9cf2a3617f2743245519e19607a4417189an);
});

test('one real note plus a dummy proves and verifies', async () => {
  const { input, changeAmount } = spendInput({
    sk: SK, tree, ...NEAR, notes: [a, { amount: 0n, blinding: 99n }], outAmount: 1_500_000n,
    changeBlinding: 33n, extData: EXT,
  });
  assert.equal(changeAmount, 500_000n);
  const { proof, publicSignals } = await proveSpend(input);
  assert.ok(await snarkjs.groth16.verify(vkey, publicSignals, proof));
  // Public signal order is the contract's order (DESIGN §3).
  assert.deepEqual(publicSignals, [
    input.root, input.nullifier1, input.nullifier2, input.changeCommitment,
    input.kind, input.asset, input.sub, input.outAmount, input.extDataHash,
  ].map(String));
  assert.equal(input.extDataHash, extDataHash(EXT));
});

test('two notes cover an amount larger than either note', async () => {
  const { input, changeAmount } = spendInput({
    sk: SK, tree, ...NEAR, notes: [a, b], outAmount: 4_000_000n, changeBlinding: 44n, extData: EXT,
  });
  assert.equal(changeAmount, 1_000_000n);
  const { proof, publicSignals } = await proveSpend(input);
  assert.ok(await snarkjs.groth16.verify(vkey, publicSignals, proof));
});

test('spending more than both notes cannot be proven', async () => {
  const { input } = spendInput({
    sk: SK, tree, ...NEAR, notes: [a, b], outAmount: 5_000_001n, changeBlinding: 55n, extData: EXT,
  });
  await assert.rejects(proveSpend(input));
});

test('a note that is not in the tree cannot be spent', async () => {
  const ghost = { amount: 1_000_000n, blinding: 77n, index: a.index };
  const { input } = spendInput({
    sk: SK, tree, ...NEAR, notes: [ghost, { amount: 0n, blinding: 98n }], outAmount: 1n,
    changeBlinding: 66n, extData: EXT,
  });
  await assert.rejects(proveSpend(input));
});

test('the same note used twice gives equal nullifiers (the contract rejects them)', () => {
  const { input } = spendInput({
    sk: SK, tree, ...NEAR, notes: [a, a], outAmount: 1n, changeBlinding: 88n, extData: EXT,
  });
  assert.equal(input.nullifier1, input.nullifier2);
});
