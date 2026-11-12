// The user's note keys. The seed comes from a NEP-413 signature of a fixed message (ed25519 is deterministic, so the
// same wallet key always gives the same seed and the notes can be found from any browser). Only a wallet that
// cannot sign messages at all gets a random seed kept in this browser, which the user must back up
// (exportNoteSeed): a declined or failed signature request is an error, never a silent browser-only key.
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

/** Error code a `sign` callback uses when the wallet has no message signing at all. */
export const SIGN_UNSUPPORTED = 'SIGN_UNSUPPORTED';

// The key is derived from the signature over this exact text. Changing one character gives every user a different
// key and hides the notes they already have, so it must stay as deployed (a new text needs a new version and a
// fallback to this one).
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

export type SignKeyMessage = (message: string, nonce: Uint8Array) => Promise<{ signature: string }>;

/** The seed the wallet's signature over KEY_MESSAGE gives: the same in every browser for the same wallet key. */
async function seedFromWallet(accountId: string, sign: SignKeyMessage): Promise<Uint8Array> {
  const nonce = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`veiled-notes-v1:${accountId}`)));
  const { signature } = await sign(KEY_MESSAGE, nonce);
  const sigBytes = Uint8Array.from(atob(signature), (c) => c.charCodeAt(0));
  return new Uint8Array(await crypto.subtle.digest('SHA-256', sigBytes));
}

function storeSeed(accountId: string, seed: Uint8Array, source: NoteKeys['source']) {
  try {
    localStorage.setItem(storageKey(accountId), JSON.stringify({ seed: hex(seed), source }));
  } catch {
    /* storage disabled: keys live for this tab only */
  }
}

/** Unlocks the note keys, asking the wallet for the signature once. */
export async function unlockNoteKeys(accountId: string, sign: SignKeyMessage): Promise<NoteKeys> {
  const existing = await cachedNoteKeys(accountId);
  if (existing) return existing;
  let seed: Uint8Array;
  let source: NoteKeys['source'] = 'signature';
  try {
    seed = await seedFromWallet(accountId, sign);
  } catch (err) {
    if ((err as { code?: string } | null)?.code !== SIGN_UNSUPPORTED) {
      throw new Error(
        'The wallet did not sign the key message, so your private balance key was not unlocked. ' +
          'Approve the signature request to continue; if no wallet window opened, allow pop-ups for this site.',
      );
    }
    console.warn('[notes] this wallet cannot sign messages; using a key kept in this browser');
    seed = crypto.getRandomValues(new Uint8Array(32));
    source = 'local';
  }
  storeSeed(accountId, seed, source);
  const keys = await fromSeed(accountId, seed, source);
  cache.set(accountId, keys);
  return keys;
}

/**
 * Replaces the key stored in this browser with the one derived from the wallet's signature, which any browser
 * with the same wallet can derive again. Nothing is replaced unless the wallet signs, so a declined request
 * leaves the old key in place. Notes made under the old key stay with it: back it up first (exportNoteSeed).
 */
export async function switchToWalletKey(accountId: string, sign: SignKeyMessage): Promise<NoteKeys> {
  let seed: Uint8Array;
  try {
    seed = await seedFromWallet(accountId, sign);
  } catch (err) {
    throw new Error(
      (err as { code?: string } | null)?.code === SIGN_UNSUPPORTED
        ? 'This wallet cannot sign messages, so the key cannot come from it. The key in this browser was kept.'
        : 'The wallet did not sign the key message, so the key in this browser was kept. Approve the signature ' +
          'request to switch; if no wallet window opened, allow pop-ups for this site.',
    );
  }
  const keys = await fromSeed(accountId, seed, 'signature');
  storeSeed(accountId, seed, 'signature');
  cache.set(accountId, keys);
  return keys;
}

/** The stored seed as 64 hex characters, for the user to keep somewhere safe; null when nothing is stored. */
export function exportNoteSeed(accountId: string): string | null {
  try {
    const raw = localStorage.getItem(storageKey(accountId));
    const seed = raw ? JSON.parse(raw).seed : null;
    return typeof seed === 'string' && /^[0-9a-f]{64}$/.test(seed) ? seed : null;
  } catch {
    return null;
  }
}

/** Restores a backed-up seed for this account in this browser, replacing whatever key was stored. */
export async function importNoteSeed(accountId: string, backup: string): Promise<NoteKeys> {
  const seedHex = backup.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(seedHex)) throw new Error('That is not a key backup: it must be 64 hex characters.');
  const keys = await fromSeed(accountId, unhex(seedHex), 'local');
  try {
    localStorage.setItem(storageKey(accountId), JSON.stringify({ seed: seedHex, source: 'local' }));
  } catch {
    /* storage disabled: the key lives for this tab only */
  }
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
