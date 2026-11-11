// Append-only Poseidon Merkle tree mirroring the contract (near/contract/contracts/veiled/src/tree.rs):
// depth 20, empty leaf 0, leaves inserted in pairs. Built from the contract's leaf list to make inclusion paths.
import { DEPTH, hash2 } from './crypto';

const ZEROS: bigint[] = (() => {
  const z = [0n];
  for (let i = 0; i < DEPTH; i++) z.push(hash2(z[i], z[i]));
  return z;
})();

export class MerkleTree {
  private layersCache: bigint[][] | null = null;

  constructor(public leaves: bigint[] = []) {}

  push(...leaves: bigint[]) {
    this.leaves.push(...leaves);
    this.layersCache = null;
  }

  private layers(): bigint[][] {
    if (this.layersCache) return this.layersCache;
    const layers: bigint[][] = [this.leaves.slice()];
    for (let level = 0; level < DEPTH; level++) {
      const cur = layers[level];
      const next: bigint[] = [];
      for (let i = 0; i < cur.length; i += 2) {
        next.push(hash2(cur[i], i + 1 < cur.length ? cur[i + 1] : ZEROS[level]));
      }
      layers.push(next);
    }
    this.layersCache = layers;
    return layers;
  }

  root(): bigint {
    return this.leaves.length === 0 ? ZEROS[DEPTH] : this.layers()[DEPTH][0];
  }

  path(index: number): { pathElements: bigint[]; pathIndices: number[] } {
    if (index < 0 || index >= this.leaves.length) throw new Error(`leaf ${index} is not in the tree`);
    const layers = this.layers();
    const pathElements: bigint[] = [];
    const pathIndices: number[] = [];
    let idx = index;
    for (let level = 0; level < DEPTH; level++) {
      const sibling = idx ^ 1;
      const layer = layers[level];
      pathElements.push(sibling < layer.length ? layer[sibling] : ZEROS[level]);
      pathIndices.push(idx & 1);
      idx >>= 1;
    }
    return { pathElements, pathIndices };
  }
}

export const EMPTY_PATH = { pathElements: Array<bigint>(DEPTH).fill(0n), pathIndices: Array<number>(DEPTH).fill(0) };
