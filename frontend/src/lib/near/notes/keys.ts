// The user's note keys. The seed comes from a NEP-413 signature of a fixed message (ed25519 is deterministic, so the
// same wallet key always gives the same seed and the notes can be found from any browser). Wallets that cannot sign
// messages get a random seed kept in this browser only.
//   sk = first 31 bytes of sha256(signature)    pk = Poseidon(sk)    memo key = HKDF(seed)
import { bytesToBigInt, pkOf } from './crypto';
import { memoKeyFromSeed } from './memo';

export interface NoteKeys {
  accountId: string;
  sk: bigint;
  pk: bigint;
  memoKey: CryptoKey;
  source: 'signature' | 'local';
}

export const KEY_MESSAGE =
  'Veiled Markets private balance key (v1).\n\nSigning derives the key that unlocks your private notes on NEAR. ' +
  'It is not a transaction and costs nothing.';

const storageKey = (accountId: string) => `veiled:near:seed:${accountId}`;
const cache = new Map<string, NoteKeys>();

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const unhex = (s: string) => Uint8Array.from(s.match(/../g) ?? [], (x) => parseInt(x, 16));

async function fromSeed(accountId: string, seed: Uint8Array, source: NoteKeys['source']): Promise<NoteKeys> {
  const sk = bytesToBigInt(seed.slice(0, 31));
  return { accountId, sk, pk: pkOf(sk), memoKey: await memoKeyFromSeed(seed), source };
}

/** Keys already unlocked in this browser, or null. */
export async function cachedNoteKeys(accountId: string): Promise<NoteKeys | null> {
  const hit = cache.get(accountId);
  if (hit) return hit;
  try {
    const raw = localStorage.getItem(storageKey(accountId));
    if (!raw) return null;
    const { seed, source } = JSON.parse(raw);
    const keys = await fromSeed(accountId, unhex(seed), source);
    cache.set(accountId, keys);
    return keys;
  } catch {
    return null;
  }
}

/** Unlocks the note keys, asking the wallet for the signature once. */
export async function unlockNoteKeys(
  accountId: string,
  sign: (message: string, nonce: Uint8Array) => Promise<{ signature: string }>,
): Promise<NoteKeys> {
  const existing = await cachedNoteKeys(accountId);
  if (existing) return existing;
  let seed: Uint8Array;
  let source: NoteKeys['source'] = 'signature';
  try {
    const nonce = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`veiled-notes-v1:${accountId}`)));
    const { signature } = await sign(KEY_MESSAGE, nonce);
    const sigBytes = Uint8Array.from(atob(signature), (c) => c.charCodeAt(0));
    seed = new Uint8Array(await crypto.subtle.digest('SHA-256', sigBytes));
  } catch (err) {
    console.warn('[notes] wallet could not sign the key message; using a key kept in this browser', err);
    seed = crypto.getRandomValues(new Uint8Array(32));
    source = 'local';
  }
  try {
    localStorage.setItem(storageKey(accountId), JSON.stringify({ seed: hex(seed), source }));
  } catch {
    /* storage disabled: keys live for this tab only */
  }
  const keys = await fromSeed(accountId, seed, source);
  cache.set(accountId, keys);
  return keys;
}

export function forgetNoteKeys(accountId: string) {
  cache.delete(accountId);
  try {
    localStorage.removeItem(storageKey(accountId));
  } catch {
    /* ignore */
  }
}
