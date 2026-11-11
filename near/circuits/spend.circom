pragma circom 2.1.6;

// Veiled Markets on NEAR: one circuit for every private action (see docs/near/DESIGN.md §3).
//
// A note is a hidden UTXO held in the contract's Merkle tree:
//   pk          = Poseidon(sk)
//   ownerBlind  = Poseidon(pk, blinding)
//   commitment  = Poseidon(kind, asset, sub, amount, ownerBlind)
//   nullifier   = Poseidon(sk, commitment)
//
// The proof shows: the spender owns two notes of the same (kind, asset, sub) that are in the tree under `root`
// (a zero-amount input is a dummy and skips the tree check), the nullifiers belong to those notes,
// outAmount <= in1 + in2, and changeCommitment holds the rest for the same owner. extDataHash binds the action
// text (market, outcome, recipient, relayer fee, owner of the minted note) so a relayer cannot change it.

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/bitify.circom";
include "node_modules/circomlib/circuits/comparators.circom";

template MerkleRoot(levels) {
    signal input leaf;
    signal input pathElements[levels];
    signal input pathIndices[levels];
    signal output root;

    component hashers[levels];
    signal cur[levels + 1];
    signal leftDiff[levels];
    signal left[levels];
    signal right[levels];
    cur[0] <== leaf;
    for (var i = 0; i < levels; i++) {
        pathIndices[i] * (1 - pathIndices[i]) === 0;
        // index 0: (cur, sibling); index 1: (sibling, cur)
        leftDiff[i] <== pathIndices[i] * (pathElements[i] - cur[i]);
        left[i] <== cur[i] + leftDiff[i];
        right[i] <== pathElements[i] - leftDiff[i];
        hashers[i] = Poseidon(2);
        hashers[i].inputs[0] <== left[i];
        hashers[i].inputs[1] <== right[i];
        cur[i + 1] <== hashers[i].out;
    }
    root <== cur[levels];
}

template Spend(levels) {
    // Public inputs, in this order (snarkjs orders public signals by declaration).
    signal input root;
    signal input nullifier1;
    signal input nullifier2;
    signal input changeCommitment;
    signal input kind;
    signal input asset;
    signal input sub;
    signal input outAmount;
    signal input extDataHash;

    // Private inputs.
    signal input sk;
    signal input inAmount[2];
    signal input inBlinding[2];
    signal input pathElements[2][levels];
    signal input pathIndices[2][levels];
    signal input changeBlinding;

    component pk = Poseidon(1);
    pk.inputs[0] <== sk;

    component inOwner[2];
    component inCommit[2];
    component tree[2];
    component rootCheck[2];
    component nf[2];
    component rangeIn[2];
    for (var j = 0; j < 2; j++) {
        inOwner[j] = Poseidon(2);
        inOwner[j].inputs[0] <== pk.out;
        inOwner[j].inputs[1] <== inBlinding[j];

        inCommit[j] = Poseidon(5);
        inCommit[j].inputs[0] <== kind;
        inCommit[j].inputs[1] <== asset;
        inCommit[j].inputs[2] <== sub;
        inCommit[j].inputs[3] <== inAmount[j];
        inCommit[j].inputs[4] <== inOwner[j].out;

        tree[j] = MerkleRoot(levels);
        tree[j].leaf <== inCommit[j].out;
        for (var i = 0; i < levels; i++) {
            tree[j].pathElements[i] <== pathElements[j][i];
            tree[j].pathIndices[i] <== pathIndices[j][i];
        }
        // A zero-amount input is a dummy: its Merkle root is not checked.
        rootCheck[j] = ForceEqualIfEnabled();
        rootCheck[j].enabled <== inAmount[j];
        rootCheck[j].in[0] <== root;
        rootCheck[j].in[1] <== tree[j].root;

        rangeIn[j] = Num2Bits(128);
        rangeIn[j].in <== inAmount[j];
    }

    nf[0] = Poseidon(2);
    nf[0].inputs[0] <== sk;
    nf[0].inputs[1] <== inCommit[0].out;
    nullifier1 === nf[0].out;
    nf[1] = Poseidon(2);
    nf[1].inputs[0] <== sk;
    nf[1].inputs[1] <== inCommit[1].out;
    nullifier2 === nf[1].out;

    // 0 <= outAmount <= in1 + in2, change fits 128 bits.
    signal changeAmount;
    changeAmount <== inAmount[0] + inAmount[1] - outAmount;
    component rangeOut = Num2Bits(128);
    rangeOut.in <== outAmount;
    component rangeChange = Num2Bits(128);
    rangeChange.in <== changeAmount;

    component changeOwner = Poseidon(2);
    changeOwner.inputs[0] <== pk.out;
    changeOwner.inputs[1] <== changeBlinding;

    component changeCommit = Poseidon(5);
    changeCommit.inputs[0] <== kind;
    changeCommit.inputs[1] <== asset;
    changeCommit.inputs[2] <== sub;
    changeCommit.inputs[3] <== changeAmount;
    changeCommit.inputs[4] <== changeOwner.out;
    changeCommitment === changeCommit.out;

    // Bind extDataHash into the proof.
    signal extSquare;
    extSquare <== extDataHash * extDataHash;
}

component main {public [root, nullifier1, nullifier2, changeCommitment, kind, asset, sub, outAmount, extDataHash]} = Spend(20);
