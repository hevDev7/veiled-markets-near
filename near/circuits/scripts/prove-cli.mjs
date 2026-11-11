#!/usr/bin/env node
// Dev/test helper: one JSON request on stdin, one JSON result on stdout. Used by the contract sandbox tests
// (near/contract/integration-tests) to prove spends against the live tree.
//
//   {"op":"owner_blinds","sk":"..","blindings":["1","2"]}          -> {"owner_blinds":["..",".."]}
//   {"op":"prove","sk":"..","leaves":[".."],"kind":1,"asset":1,"sub":0,
//    "notes":[{"amount":"..","blinding":"..","index":0},{"amount":"0","blinding":".."}],
//    "out_amount":"..","change_blinding":"..",
//    "action":{..},"new_blinding":"..","new_memo":"","change_memo":"","fee":"0","relayer":null}
//      -> {"proof":..,"public":..,"ext_data":"..","change_amount":"..","change_commitment":"..","new_owner_blind":".."}
//   ("ext_data" may be given verbatim instead of action/new_blinding/memos/fee.)
import { initPoseidon, MerkleTree, ownerBlind, spendInput, proveSpend, contractArgs } from '../lib/notes.mjs';

const chunks = [];
for await (const c of process.stdin) chunks.push(c);
const req = JSON.parse(Buffer.concat(chunks).toString('utf8'));
await initPoseidon();
const sk = BigInt(req.sk);

let out;
if (req.op === 'owner_blinds') {
  out = { owner_blinds: req.blindings.map((b) => ownerBlind(sk, BigInt(b)).toString()) };
} else if (req.op === 'prove') {
  const tree = new MerkleTree();
  tree.leaves = req.leaves.map((x) => BigInt(x));
  let extData = req.ext_data;
  let newOwnerBlind = '0';
  if (extData === undefined) {
    newOwnerBlind = req.new_blinding ? ownerBlind(sk, BigInt(req.new_blinding)).toString() : '0';
    const ext = {
      action: req.action,
      new_owner_blind: newOwnerBlind,
      new_memo: req.new_memo ?? '',
      change_memo: req.change_memo ?? '',
      fee: req.fee ?? '0',
    };
    if (req.relayer) ext.relayer = req.relayer;
    extData = JSON.stringify(ext);
  }
  const notes = req.notes.map((n) => ({
    amount: BigInt(n.amount),
    blinding: BigInt(n.blinding),
    index: n.index === undefined || n.index === null ? undefined : Number(n.index),
  }));
  const { input, changeAmount, changeCommitment } = spendInput({
    sk, tree, kind: req.kind, asset: req.asset, sub: req.sub, notes,
    outAmount: BigInt(req.out_amount), changeBlinding: BigInt(req.change_blinding), extData,
  });
  const { proof, publicSignals } = await proveSpend(input);
  out = {
    ...contractArgs(proof, publicSignals),
    ext_data: extData,
    change_amount: changeAmount.toString(),
    change_commitment: changeCommitment.toString(),
    new_owner_blind: newOwnerBlind,
  };
} else {
  throw new Error(`unknown op ${req.op}`);
}
process.stdout.write(JSON.stringify(out));
process.exit(0);
