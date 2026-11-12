// The private balance key comes from a wallet signature, and the request passes through the wallet selector's own
// parameter check before any wallet sees it. These tests run that real check with a stand-in wallet.
import { describe, expect, it } from 'vitest';
import { setupWalletSelector, type WalletModuleFactory } from '@near-wallet-selector/core';
import { signMessageWith } from './near-wallet';

interface Asked {
  message: string;
  recipient: string;
  nonce: Uint8Array;
}

async function walletThatRecords(asked: Asked[]) {
  const unused = async (): Promise<never> => {
    throw new Error('not used in this test');
  };
  const module = (async () => ({
    id: 'recording-wallet',
    type: 'injected',
    metadata: { name: 'Recording wallet', description: null, iconUrl: '', deprecated: false, available: true, downloadUrl: '' },
    init: async () => ({
      signIn: async () => [{ accountId: 'alice.testnet' }],
      signOut: async () => {},
      getAccounts: async () => [{ accountId: 'alice.testnet' }],
      verifyOwner: unused,
      signMessage: async (params: Asked) => {
        asked.push(params);
        return { accountId: 'alice.testnet', publicKey: 'ed25519:stand-in', signature: btoa('signature-bytes') };
      },
      signAndSendTransaction: unused,
      signAndSendTransactions: unused,
    }),
  })) as unknown as WalletModuleFactory;
  const kept = new Map<string, string>();
  const selector = await setupWalletSelector({
    network: 'testnet',
    modules: [module],
    storage: {
      getItem: async (k) => kept.get(k) ?? null,
      setItem: async (k, v) => void kept.set(k, v),
      removeItem: async (k) => void kept.delete(k),
    },
  });
  return selector.wallet('recording-wallet');
}

describe('signing the key message', () => {
  it('reaches the wallet with the 32-byte nonce it was given', async () => {
    const asked: Asked[] = [];
    const wallet = await walletThatRecords(asked);
    const nonce = Uint8Array.from({ length: 32 }, (_, i) => i + 1);

    const signed = await signMessageWith(wallet, 'the key message', nonce);

    expect(signed.signature).toBe(btoa('signature-bytes'));
    expect(asked).toHaveLength(1);
    expect(asked[0].message).toBe('the key message');
    expect(Array.from(asked[0].nonce)).toEqual(Array.from(nonce));
  });
});
