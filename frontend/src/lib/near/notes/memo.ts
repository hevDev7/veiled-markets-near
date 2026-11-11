// Encrypted note memos. Every leaf the user creates carries a memo only their key opens, so their notes can be
// found again from the chain alone (another device, a cleared browser). AES-256-GCM, key from HKDF(seed).
const PREFIX = 'v1.';

export async function memoKeyFromSeed(seed: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new Uint8Array(seed), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new TextEncoder().encode('veiled-markets/near'), info: new TextEncoder().encode('memo-v1') },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function sealMemo(key: CryptoKey, payload: Record<string, string | number>): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(payload))));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return PREFIX + toB64(out);
}

/** The memo's payload if this key sealed it, else null. */
export async function openMemo(key: CryptoKey, memo: string): Promise<Record<string, string | number> | null> {
  if (!memo.startsWith(PREFIX)) return null;
  try {
    const raw = fromB64(memo.slice(PREFIX.length));
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12) }, key, raw.slice(12));
    return JSON.parse(new TextDecoder().decode(pt));
  } catch {
    return null;
  }
}
