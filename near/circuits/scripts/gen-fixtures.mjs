// Generates the proofs the contract sandbox tests replay (near/contract/integration-tests/tests/pool.rs).
// The leaf sequence here must match the order of calls in that test exactly.
import { writeFileSync, mkdirSync } from 'node:fs';
import {
  initPoseidon, MerkleTree, ownerBlind, noteCommitment, spendInput, proveSpend, contractArgs,
} from '../lib/notes.mjs';

const OUT = new URL('../../contract/integration-tests/fixtures/pool.json', import.meta.url);
const SK = 987654321n;
const NEAR = { kind: 1, asset: 1, sub: 0 };
const YOCTO_PER_MICRO = 10n ** 18n;
const s = (x) => x.toString();

await initPoseidon();
const tree = new MerkleTree();
const roots = {};

const ext = (recipient, changeMemo) => JSON.stringify({
  action: { type: 'withdraw', recipient },
  new_owner_blind: '0',
  new_memo: '',
  change_memo: changeMemo,
  fee: '0',
});

function deposit(amountMicro, blinding, memo) {
  const ob = ownerBlind(SK, blinding);
  const c = noteCommitment({ ...NEAR, amount: amountMicro, ownerBlind: ob });
  const index = tree.insertPair(c, 0n);
  return {
    note: { amount: amountMicro, blinding, index },
    call: { owner_blind: s(ob), memo, yocto: s(amountMicro * YOCTO_PER_MICRO), commitment: s(c) },
  };
}

async function spend(notes, outAmount, changeBlinding, extData) {
  const { input, changeAmount, changeCommitment } = spendInput({
    sk: SK, tree, ...NEAR, notes, outAmount, changeBlinding, extData,
  });
  const { proof, publicSignals } = await proveSpend(input);
  return { args: { ...contractArgs(proof, publicSignals), ext_data: extData }, changeAmount, changeCommitment };
}

// 1-2: two deposits by alice. W1 is proven against the tree as it was after the first deposit.
const A = deposit(2_000_000n, 101n, 'mA');
roots.R1 = s(tree.root());
const treeAtR1 = new MerkleTree();
treeAtR1.leaves = tree.leaves.slice();
const D = deposit(1_000_000n, 102n, 'mD');
roots.R2 = s(tree.root());

// 3: W1 spends A against the older root R1 (a deposit landed in between) and withdraws 1 NEAR to bob.
const W1ext = ext('bob.test.near', 'mC1');
const { input: w1Input } = spendInput({
  sk: SK, tree: treeAtR1, ...NEAR, notes: [A.note, { amount: 0n, blinding: 201n }], outAmount: 1_000_000n,
  changeBlinding: 301n, extData: W1ext,
});
const w1 = await proveSpend(w1Input);
const W1args = { ...contractArgs(w1.proof, w1.publicSignals), ext_data: W1ext };
if (W1args.public.root !== roots.R1) throw new Error('W1 must use the old root');
const C1 = { amount: 1_000_000n, blinding: 301n, index: tree.insertPair(w1Input.changeCommitment, 0n) };
roots.R3 = s(tree.root());

// Tampered: same proof, recipient changed to carol.
const W1tampered = { ...W1args, ext_data: ext('carol.test.near', 'mC1') };

// DD: the same note D twice (valid proof, duplicate nullifiers).
const DD = await spend([D.note, D.note], 1n, 401n, ext('bob.test.near', 'mDD'));

// M: merge D + C1 (out 0) into one 2 NEAR change note.
const M = await spend([D.note, C1], 0n, 302n, ext('bob.test.near', 'mC2'));
const Mbad = { ...M.args, public: { ...M.args.public, out_amount: '1' } };
tree.insertPair(M.changeCommitment, 0n);
roots.R4 = s(tree.root());

mkdirSync(new URL('.', OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({
  deposits: { A: A.call, D: D.call },
  transacts: { W1: W1args, W1_tampered: W1tampered, DD: DD.args, M: M.args, M_bad_proof: Mbad },
  expected: { roots, change: { C1: s(C1.amount), C2: s(M.changeAmount) }, leaves: tree.leaves.map(s) },
}, null, 2));
console.log('wrote', OUT.pathname);
if (globalThis.curve_bn128) await globalThis.curve_bn128.terminate();
