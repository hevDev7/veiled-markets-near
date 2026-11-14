// The relayer client's gasless deposit call (POST /meta) and the health flag that offers it.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RELAYER_URL } from './config';
import { RelayError, relayMeta, relayerHealth } from './relayer';

function answer(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('gasless deposits through the relayer', () => {
  it('posts the signed delegate action and returns the transaction hash', async () => {
    const fetch = answer(200, { ok: true, txHash: '6FmLT9QX' });
    vi.stubGlobal('fetch', fetch);

    expect(await relayMeta('c2lnbmVk')).toEqual({ txHash: '6FmLT9QX' });
    expect(fetch).toHaveBeenCalledWith(`${RELAYER_URL}/meta`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ signed_delegate: 'c2lnbmVk' }),
    });
  });

  it('reports a deposit the contract refused with its code, its sentence and the transaction', async () => {
    vi.stubGlobal('fetch', answer(422, { ok: false, txHash: '9xFailed', error: 'ERR_MIN_DEPOSIT' }));

    const err = await relayMeta('c2lnbmVk').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(RelayError);
    expect(err).toMatchObject({ code: 'ERR_MIN_DEPOSIT', txHash: '9xFailed' });
    expect((err as Error).message).toMatch(/minimum deposit/);
  });

  it('passes on the reason the relayer refused to pay, with the HTTP status', async () => {
    vi.stubGlobal('fetch', answer(400, { ok: false, error: 'the nonce was already used; sign again' }));

    await expect(relayMeta('c2lnbmVk')).rejects.toThrow('the nonce was already used; sign again');
    await expect(relayMeta('c2lnbmVk')).rejects.toMatchObject({ status: 400, txHash: undefined });
    vi.stubGlobal('fetch', answer(429, { ok: false, error: 'too many deposits from this account, try again in a minute' }));
    await expect(relayMeta('c2lnbmVk')).rejects.toMatchObject({ status: 429 });
  });

  it('says so when the relayer cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));

    await expect(relayMeta('c2lnbmVk')).rejects.toMatchObject({ code: 'RELAYER_DOWN', status: undefined });
  });

  it('reads whether the relayer offers gasless deposits from its health', async () => {
    vi.stubGlobal('fetch', answer(200, { ok: true, relayer: 'veiled-relayer.testnet', balanceNear: 12.5, meta: true }));
    expect((await relayerHealth()).meta).toBe(true);

    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    expect(await relayerHealth()).toEqual({ ok: false });
  });
});
