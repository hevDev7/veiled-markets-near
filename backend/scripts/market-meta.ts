// What the market scripts must write exactly as the frontend does, or the app cannot show the market's question.
import { createHash } from 'node:crypto';

const FIELD_MODULUS = 8444461749428370424248824938781546531375899335154063827935233455917409239040n;

/** The frontend's hashToField: the first 31 bytes of sha256(question), as a Leo field literal. */
export function questionHash(question: string): string {
  const h = createHash('sha256').update(question, 'utf8').digest();
  let v = 0n;
  for (let i = 0; i < 31; i++) v = (v << 8n) | BigInt(h[i]);
  v %= FIELD_MODULUS;
  return `${v === 0n ? 1n : v}field`;
}

export interface MarketText {
  question: string;
  description: string;
  resolutionSource: string;
  outcomes: string[];
}

/** The frontend's encodeMetadata format (lib/near/chain.ts). */
export const metadataOf = (s: MarketText) =>
  JSON.stringify({ v: 1, q: s.question, d: s.description, s: s.resolutionSource, o: s.outcomes });
