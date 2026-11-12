// Checks the relayer makes before it spends gas on a request (near-relayer.ts): who is asking, how often, and
// whether the proof would pass the contract at all. A request that fails here costs the relayer nothing on chain.
import { createHash } from 'node:crypto';
// @ts-ignore -- snarkjs ships no type declarations
import * as snarkjs from 'snarkjs';

/**
 * The address to rate-limit by. `X-Forwarded-For` is a list each proxy appends to, and its left end is whatever
 * the client chose to send, so only the entries added by proxies we run behind can be trusted: with
 * `trustedProxies` proxies in front, the client's address is that many entries from the right.
 */
export function clientIp(
  forwardedFor: string | string[] | undefined,
  remoteAddress: string | undefined,
  trustedProxies: number,
): string {
  const hops = (Array.isArray(forwardedFor) ? forwardedFor.join(',') : forwardedFor ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (trustedProxies > 0 && hops.length >= trustedProxies) return hops[hops.length - trustedProxies];
  return remoteAddress ?? '?';
}

/** Sliding-window limits: `perClient` requests per window for one client, `global` for everyone together. */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  private all: number[] = [];

  constructor(
    private readonly perClient: number,
    private readonly global: number,
    private readonly windowMs = 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  /** Records the request when it is allowed; a refused request uses up nothing. */
  allow(key: string): 'ok' | 'client' | 'global' {
    const t = this.now();
    const fresh = (times: number[]) => times.filter((x) => t - x < this.windowMs);
    const mine = fresh(this.hits.get(key) ?? []);
    this.all = fresh(this.all);
    if (mine.length >= this.perClient) {
      this.hits.set(key, mine);
      return 'client';
    }
    if (this.all.length >= this.global) return 'global';
    mine.push(t);
    this.all.push(t);
    this.hits.set(key, mine);
    if (this.hits.size > 10_000) this.forgetIdle(t);
    return 'ok';
  }

  private forgetIdle(t: number) {
    for (const [key, times] of this.hits) {
      if (!times.some((x) => t - x < this.windowMs)) this.hits.delete(key);
    }
  }
}

/** sha256 of the exact ext_data text, big-endian, top 3 bits cleared: the circuit's `extDataHash`, in decimal. */
export function extDataHashOf(text: string): string {
  const h = createHash('sha256').update(text, 'utf8').digest();
  h[0] &= 0x1f;
  return BigInt('0x' + h.toString('hex')).toString();
}

const SIGNALS = [
  'root', 'nullifier1', 'nullifier2', 'change_commitment', 'kind', 'asset', 'sub', 'out_amount', 'ext_data_hash',
] as const;

export interface ProofArgs {
  a: [string, string];
  b: [[string, string], [string, string]];
  c: [string, string];
}

/** Whether the contract's Groth16 check would accept this proof for these public signals. */
export async function proofIsValid(vk: unknown, proof: ProofArgs, pub: Record<string, string>): Promise<boolean> {
  try {
    return await snarkjs.groth16.verify(
      vk,
      SIGNALS.map((name) => pub[name]),
      {
        pi_a: [proof.a[0], proof.a[1], '1'],
        pi_b: [proof.b[0], proof.b[1], ['1', '0']],
        pi_c: [proof.c[0], proof.c[1], '1'],
        protocol: 'groth16',
        curve: 'bn128',
      },
    );
  } catch {
    return false;
  }
}

/** Stops the worker threads snarkjs keeps for the curve, so a short-lived process can exit. */
export async function stopProofWorkers(): Promise<void> {
  await (globalThis as { curve_bn128?: { terminate(): Promise<void> } }).curve_bn128?.terminate();
}
