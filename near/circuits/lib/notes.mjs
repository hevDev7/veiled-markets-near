// Note scheme helpers shared by the circuit tests, fixture generator and relayer tests (docs/near/DESIGN.md §3).
// The browser has its own copy in frontend/src/lib/near/notes; both must agree with spend.circom.
import { buildPoseidon } from 'circomlibjs';
import * as snarkjs from 'snarkjs';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const DEPTH = 20;
export const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

const here = path.dirname(fileURLToPath(import.meta.url));
// The circuit's proving files. A local build (scripts/build.sh) is used when there is one. A fresh clone has none,
// so it uses the files committed for the browser prover, which belong to the deployed contract's verifying key.
const built = (file) => path.join(here, '../build', file);
const committed = (file) => path.join(here, '../../../frontend/public/zk', file);
const artifact = (builtFile, committedFile) => (existsSync(built(builtFile)) ? built(builtFile) : committed(committedFile));
export const WASM = artifact('spend_js/spend.wasm', 'spend.wasm');
export const ZKEY = artifact('spend_final.zkey', 'spend_final.zkey');
export const VKEY = artifact('verification_key.json', 'verification_key.json');

let P;
export async function initPoseidon() {
  if (!P) P = await buildPoseidon();
  return P;
}

export function poseidon(...xs) {
  if (!P) throw new Error('call initPoseidon() first');
  return P.F.toObject(P(xs.map((x) => BigInt(x))));
}

export const pkOf = (sk) => poseidon(sk);
export const ownerBlind = (sk, blinding) => poseidon(pkOf(sk), blinding);
export const noteCommitment = ({ kind, asset, sub, amount, ownerBlind: ob }) => poseidon(kind, asset, sub, amount, ob);
export const nullifierOf = (sk, commitment) => poseidon(sk, commitment);

/** sha256 of the exact ext_data text, big-endian, top 3 bits cleared (fits the BN254 scalar field). */
export function extDataHash(text) {
  const h = createHash('sha256').update(text, 'utf8').digest();
  h[0] &= 0x1f;
  return BigInt('0x' + h.toString('hex'));
}

/** Append-only Poseidon tree mirroring the contract: leaves arrive in pairs, empty leaf = 0. */
export class MerkleTree {
  constructor(depth = DEPTH) {
    this.depth = depth;
    this.zeros = [0n];
    for (let i = 0; i < depth; i++) this.zeros.push(poseidon(this.zeros[i], this.zeros[i]));
    this.leaves = [];
  }

  insertPair(a, b) {
    this.leaves.push(BigInt(a), BigInt(b));
    return this.leaves.length - 2;
  }

  layers() {
    const layers = [this.leaves.slice()];
    for (let level = 0; level < this.depth; level++) {
      const cur = layers[level];
      const next = [];
      for (let i = 0; i < cur.length; i += 2) {
        const left = cur[i];
        const right = i + 1 < cur.length ? cur[i + 1] : this.zeros[level];
        next.push(poseidon(left, right));
      }
      layers.push(next);
    }
    return layers;
  }

  root() {
    if (this.leaves.length === 0) return this.zeros[this.depth];
    return this.layers()[this.depth][0];
  }

  path(index) {
    const layers = this.layers();
    const pathElements = [];
    const pathIndices = [];
    let idx = index;
    for (let level = 0; level < this.depth; level++) {
      const sibling = idx ^ 1;
      const layer = layers[level];
      pathElements.push(sibling < layer.length ? layer[sibling] : this.zeros[level]);
      pathIndices.push(idx & 1);
      idx >>= 1;
    }
    return { pathElements, pathIndices };
  }
}

/**
 * Builds the circuit input for spending up to two notes of one (kind, asset, sub).
 * notes: [{amount, blinding, index}] (index undefined for a dummy with amount 0).
 */
export function spendInput({ sk, tree, kind, asset, sub, notes, outAmount, changeBlinding, extData }) {
  if (notes.length !== 2) throw new Error('exactly two input notes (use a dummy)');
  const root = tree.root();
  const inAmount = [];
  const inBlinding = [];
  const pathElements = [];
  const pathIndices = [];
  const nullifiers = [];
  for (const n of notes) {
    const ob = ownerBlind(sk, n.blinding);
    const c = noteCommitment({ kind, asset, sub, amount: n.amount, ownerBlind: ob });
    nullifiers.push(nullifierOf(sk, c));
    inAmount.push(BigInt(n.amount));
    inBlinding.push(BigInt(n.blinding));
    if (n.index === undefined) {
      pathElements.push(Array(tree.depth).fill(0n));
      pathIndices.push(Array(tree.depth).fill(0));
    } else {
      const p = tree.path(n.index);
      pathElements.push(p.pathElements);
      pathIndices.push(p.pathIndices);
    }
  }
  const changeAmount = inAmount[0] + inAmount[1] - BigInt(outAmount);
  const changeCommitment = noteCommitment({
    kind, asset, sub, amount: changeAmount, ownerBlind: ownerBlind(sk, changeBlinding),
  });
  return {
    input: {
      root, nullifier1: nullifiers[0], nullifier2: nullifiers[1], changeCommitment,
      kind: BigInt(kind), asset: BigInt(asset), sub: BigInt(sub), outAmount: BigInt(outAmount),
      extDataHash: extDataHash(extData),
      sk: BigInt(sk), inAmount, inBlinding, pathElements, pathIndices, changeBlinding: BigInt(changeBlinding),
    },
    changeAmount,
    changeCommitment,
  };
}

export async function proveSpend(input) {
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(stringify(input), WASM, ZKEY);
  return { proof, publicSignals };
}

/** The `proof` and `public` arguments of the contract's `transact`, from a snarkjs proof. */
export function contractArgs(proof, publicSignals) {
  const [root, nullifier1, nullifier2, change_commitment, kind, asset, sub, out_amount, ext_data_hash] = publicSignals;
  return {
    proof: {
      a: [proof.pi_a[0], proof.pi_a[1]],
      b: [[proof.pi_b[0][0], proof.pi_b[0][1]], [proof.pi_b[1][0], proof.pi_b[1][1]]],
      c: [proof.pi_c[0], proof.pi_c[1]],
    },
    public: { root, nullifier1, nullifier2, change_commitment, kind, asset, sub, out_amount, ext_data_hash },
  };
}

function stringify(v) {
  if (typeof v === 'bigint') return v.toString();
  if (Array.isArray(v)) return v.map(stringify);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, stringify(x)]));
  return v;
}
