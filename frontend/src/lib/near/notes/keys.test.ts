// The note key controls every private balance. These tests pin down when a browser-only key may exist and that
// it can be carried to another browser.
import { beforeEach, describe, expect, it } from 'vitest';
import { exportNoteSeed, forgetNoteKeys, importNoteSeed, switchToWalletKey, unlockNoteKeys } from './keys';

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
});

const signs = (text: string) => async () => ({ signature: btoa(text) });
const declines = async (): Promise<{ signature: string }> => {
  throw new Error('User rejected the request');
};
const cannotSign = async (): Promise<{ signature: string }> => {
  throw Object.assign(new Error('This wallet cannot sign messages.'), { code: 'SIGN_UNSUPPORTED' });
};

describe('note keys', () => {
  it('derives the same key from the same wallet signature', async () => {
    const first = await unlockNoteKeys('alice.testnet', signs('signature-bytes'));
    forgetNoteKeys('alice.testnet');
    const again = await unlockNoteKeys('alice.testnet', signs('signature-bytes'));
    expect(again.sk).toBe(first.sk);
    expect(first.source).toBe('signature');
  });

  it('does not invent a browser-only key when the signature request is declined', async () => {
    await expect(unlockNoteKeys('bob.testnet', declines)).rejects.toThrow(/did not sign/i);
    expect(store.size).toBe(0);
  });

  it('uses a browser-only key only when the wallet cannot sign messages at all', async () => {
    const keys = await unlockNoteKeys('carol.testnet', cannotSign);
    expect(keys.source).toBe('local');
  });

  it('restores the same key from its backup in another browser', async () => {
    const keys = await unlockNoteKeys('dave.testnet', cannotSign);
    const backup = exportNoteSeed('dave.testnet');
    expect(backup).toMatch(/^[0-9a-f]{64}$/);
    forgetNoteKeys('dave.testnet'); // the other browser has nothing stored
    expect(exportNoteSeed('dave.testnet')).toBeNull();
    const restored = await importNoteSeed('dave.testnet', backup!);
    expect(restored.sk).toBe(keys.sk);
    expect(restored.source).toBe('local');
  });

  it('replaces a browser-only key with the one the wallet signature gives', async () => {
    const local = await unlockNoteKeys('frank.testnet', cannotSign);
    const switched = await switchToWalletKey('frank.testnet', signs('franks-signature'));
    expect(switched.source).toBe('signature');
    expect(switched.sk).not.toBe(local.sk);
    // The same key any browser derives from that signature.
    forgetNoteKeys('frank.testnet');
    const elsewhere = await unlockNoteKeys('frank.testnet', signs('franks-signature'));
    expect(elsewhere.sk).toBe(switched.sk);
  });

  it('keeps the browser-only key when the wallet does not sign the switch', async () => {
    const local = await unlockNoteKeys('grace.testnet', cannotSign);
    const backup = exportNoteSeed('grace.testnet');
    await expect(switchToWalletKey('grace.testnet', declines)).rejects.toThrow(/did not sign/i);
    await expect(switchToWalletKey('grace.testnet', cannotSign)).rejects.toThrow(/cannot sign/i);
    expect(exportNoteSeed('grace.testnet')).toBe(backup);
    expect((await unlockNoteKeys('grace.testnet', declines)).sk).toBe(local.sk); // still the stored key
  });

  it('refuses a backup that is not 32 bytes of hex', async () => {
    await expect(importNoteSeed('erin.testnet', 'abc')).rejects.toThrow(/backup/i);
    expect(store.size).toBe(0);
  });
});
