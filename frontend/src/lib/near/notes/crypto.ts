// The note scheme of near/circuits/spend.circom (docs/near/DESIGN.md §3), in the browser:
//   pk = Poseidon(sk)                ownerBlind = Poseidon(pk, blinding)
//   commitment = Poseidon(kind, asset, sub, amount, ownerBlind)
//   nullifier  = Poseidon(sk, commitment)
// poseidon-lite uses circomlib's constants (Poseidon(1,2) = 7853200120…3530, the contract's test vector).
import { poseidon1, poseidon2, poseidon5 } from 'poseidon-lite';

export const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
export const DEPTH = 20;

export const hash2 = (a: bigint, b: bigint): bigint => poseidon2([a, b]);
export const pkOf = (sk: bigint): bigint => poseidon1([sk]);
export const ownerBlindOf = (sk: bigint, blinding: bigint): bigint => poseidon2([pkOf(sk), blinding]);
export const commitmentOf = (kind: number, asset: bigint, sub: number, amount: bigint, ownerBlind: bigint): bigint =>
  poseidon5([BigInt(kind), asset, BigInt(sub), amount, ownerBlind]);
export const nullifierOf = (sk: bigint, commitment: bigint): bigint => poseidon2([sk, commitment]);

export const bytesToBigInt = (b: Uint8Array): bigint =>
  b.reduce((acc, x) => (acc << 8n) | BigInt(x), 0n);

/** A uniformly random field element (31 random bytes, always below the modulus). */
export function randomField(): bigint {
  const b = new Uint8Array(31);
  crypto.getRandomValues(b);
  return bytesToBigInt(b);
}

/** sha256 of the exact ext_data text, big-endian, top 3 bits cleared: the circuit's extDataHash input. */
export async function extDataHash(text: string): Promise<bigint> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  h[0] &= 0x1f;
  return bytesToBigInt(h);
}
