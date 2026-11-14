// The wallet glue runs on NEAR Connect. Its connector opens sandboxed wallet iframes, so these tests stand a fake
// connector in its place: the same methods, events and payload shapes as @hot-labs/near-connect 0.12.0, with a
// wallet that records what it is asked. Each test loads a fresh copy of near-wallet.ts (it keeps one connector).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GAS_DEFAULT, VEILED_CONTRACT } from './config';

type Handler = (payload: unknown) => void;
interface Pick {
  walletId: string;
  accountId: string;
}

const h = vi.hoisted(() => ({
  /** Options of every NearConnector the module constructed. */
  options: [] as Array<Record<string, unknown>>,
  /** The session the connector would restore on load (null: nobody signed in). */
  session: null as Pick | null,
  /** What the person picks in the wallet list; null closes the list. */
  pick: null as Pick | null,
  /** Replaces the restore answer, to model a wallet that is slow or never answers. */
  restore: null as null | (() => Promise<{ wallet: unknown; accounts: Array<{ accountId: string; publicKey: string }> }>),
  restoreCalls: 0,
  signed: [] as Array<{ message: string; recipient: string; nonce: Uint8Array; network?: string; signerId?: string }>,
  sent: [] as Array<{ signerId?: string; receiverId: string; actions: unknown[]; network?: string }>,
  sendAnswer: null as null | (() => Promise<unknown>),
  delegated: [] as Array<{ signerId?: string; network?: string; delegateActions: Array<{ receiverId: string; actions: unknown[] }> }>,
  delegateAnswer: null as null | (() => Promise<unknown>),
  /** Features of the wallet's manifest that differ from a wallet that supports everything. */
  featureOverrides: {} as Record<string, boolean>,
  /** The account the wallet says it signed as (null: the session's account). */
  signAs: null as string | null,
  /** The signature the wallet answers with (null: a valid base64 ed25519 signature). */
  signature: null as string | null,
  /** Replaces the wallet's sign-out, to model one that fails or never answers. */
  signOutAnswer: null as null | (() => Promise<void>),
  signOutCalls: 0,
  /** Every NearConnector the module constructed. */
  instances: [] as unknown[],
}));

/** localStorage of the page, as a map the tests can look into. */
const store = new Map<string, string>();

const PUBLIC_KEY = 'ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp';
// base64 of 64 bytes 0x01..0x40: the shape of a NEP-413 ed25519 signature as wallets return it.
const SIGNATURE_B64 = 'AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyAhIiMkJSYnKCkqKywtLi8wMTIzNDU2Nzg5Ojs8PT4/QA==';

function walletFor(id: string) {
  return {
    manifest: {
      id,
      platform: ['web'],
      name: id === 'meteor-wallet' ? 'Meteor Wallet' : 'Intear Wallet',
      icon: 'https://example.org/icon.png',
      description: 'stand-in',
      website: 'https://example.org',
      version: '1.0.0',
      executor: 'https://example.org/executor.js',
      type: 'sandbox',
      permissions: { storage: true },
      features: {
        signMessage: true,
        signTransaction: false,
        signAndSendTransaction: true,
        signAndSendTransactions: true,
        signInWithoutAddKey: true,
        signInAndSignMessage: false,
        signInWithFunctionCallKey: false,
        signDelegateActions: false,
        mainnet: true,
        testnet: true,
        ...h.featureOverrides,
      },
    },
    signIn: async () => [{ accountId: h.pick?.accountId ?? '', publicKey: PUBLIC_KEY }],
    signInAndSignMessage: async () => {
      throw new Error('not used');
    },
    signOut: async () => {
      h.signOutCalls++;
      if (h.signOutAnswer) return h.signOutAnswer();
    },
    getAccounts: async () => (h.session ? [{ accountId: h.session.accountId, publicKey: PUBLIC_KEY }] : []),
    signMessage: async (params: (typeof h.signed)[number]) => {
      h.signed.push(params);
      return { accountId: h.signAs ?? h.session?.accountId ?? '', publicKey: PUBLIC_KEY, signature: h.signature ?? SIGNATURE_B64 };
    },
    signAndSendTransaction: async (params: (typeof h.sent)[number]) => {
      h.sent.push(params);
      if (!h.sendAnswer) throw new Error('no answer set for this test');
      return h.sendAnswer();
    },
    signAndSendTransactions: async () => {
      throw new Error('not used');
    },
    signDelegateActions: async (params: (typeof h.delegated)[number]) => {
      h.delegated.push(params);
      if (!h.delegateAnswer) throw new Error('no answer set for this test');
      return h.delegateAnswer();
    },
  };
}

vi.mock('@hot-labs/near-connect', () => {
  class NearConnector {
    private handlers = new Map<string, Set<Handler>>();
    readonly whenManifestLoaded = Promise.resolve();
    constructor(options: Record<string, unknown>) {
      h.options.push(options);
      h.instances.push(this);
    }
    on(event: string, cb: Handler) {
      if (!this.handlers.has(event)) this.handlers.set(event, new Set());
      this.handlers.get(event)!.add(cb);
    }
    off(event: string, cb: Handler) {
      this.handlers.get(event)?.delete(cb);
    }
    private emit(event: string, payload: unknown) {
      for (const cb of this.handlers.get(event) ?? []) cb(payload);
    }
    // The real connect() shows the wallet list, signs in with the pick and emits wallet:signIn; closing the list
    // rejects with "User rejected".
    async connect() {
      if (!h.pick) throw new Error('User rejected');
      const wallet = walletFor(h.pick.walletId);
      h.session = { ...h.pick };
      this.emit('wallet:signIn', {
        wallet,
        accounts: [{ accountId: h.pick.accountId, publicKey: PUBLIC_KEY }],
        success: true,
        source: 'signIn',
      });
      return wallet;
    }
    async disconnect() {
      h.session = null;
      this.emit('wallet:signOut', { success: true });
    }
    async getConnectedWallet() {
      h.restoreCalls++;
      if (h.restore) return h.restore();
      if (!h.session) throw new Error('No wallet selected');
      return { wallet: walletFor(h.session.walletId), accounts: [{ accountId: h.session.accountId, publicKey: PUBLIC_KEY }] };
    }
  }
  return { NearConnector };
});

const load = () => import('./near-wallet');

/** A complete RPC outcome of a successful call whose return value is `value`. */
function outcome(hash: string, signer: string, value: unknown) {
  const ret = btoa(JSON.stringify(value));
  return {
    status: { SuccessValue: ret },
    transaction: { hash, signer_id: signer, receiver_id: VEILED_CONTRACT },
    transaction_outcome: { id: hash },
    receipts_outcome: [{ id: 'R1', outcome: { status: { SuccessValue: ret }, logs: [], executor_id: VEILED_CONTRACT } }],
  };
}

beforeEach(() => {
  vi.resetModules();
  h.options = [];
  h.session = null;
  h.pick = null;
  h.restore = null;
  h.restoreCalls = 0;
  h.signed = [];
  h.sent = [];
  h.sendAnswer = null;
  h.delegated = [];
  h.delegateAnswer = null;
  h.featureOverrides = {};
  h.signAs = null;
  h.signature = null;
  h.signOutAnswer = null;
  h.signOutCalls = 0;
  h.instances = [];
  store.clear();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('the wallet list', () => {
  it('offers only testnet wallets that can both sign messages and send transactions', async () => {
    const w = await load();
    await w.currentAccountId();

    expect(h.options).toHaveLength(1);
    expect(h.options[0].network).toBe('testnet');
    expect(h.options[0].features).toMatchObject({ signMessage: true, signAndSendTransaction: true });
  });

  it.each([
    ['the nonce Caddy put in the page', '0f1e2d3c4b5a69788796a5b4c3d2e1f0', '0f1e2d3c4b5a69788796a5b4c3d2e1f0'],
    ['the unrendered template the dev server serves', '{{placeholder `csp_nonce`}}', undefined],
  ])('hands the wallet iframes %s', async (_, nonce, expected) => {
    vi.stubGlobal('document', {
      querySelector: (sel: string) => (sel === 'meta[property="csp-nonce"]' ? { nonce } : null),
    });
    const w = await load();
    await w.currentAccountId();

    expect(h.options[0].cspNonce).toBe(expected);
  });

  it('lists only Meteor Wallet, from a manifest built into the app', async () => {
    const w = await load();
    await w.currentAccountId();

    const manifest = h.options[0].manifest as {
      wallets: Array<{ id: string; type: string; executor: string; features: Record<string, boolean> }>;
    };
    expect(manifest.wallets.map((x) => x.id)).toEqual(['meteor-wallet']);
    expect(manifest.wallets[0]).toMatchObject({
      type: 'sandbox',
      features: { testnet: true, signMessage: true, signAndSendTransaction: true },
    });
    expect(manifest.wallets[0].executor).toMatch(/^https:\/\//);
  });

  it('does not connect to a wallet another window announces', async () => {
    const w = await load();
    await w.currentAccountId();

    expect(h.options[0].autoConnect).toBe(false);
  });

  it('never lists a wallet pasted into the list settings, now or on a later visit', async () => {
    store.set('debug-wallets', '[{"id":"veiled","type":"sandbox"}]'); // pasted before this version
    const w = await load();
    await w.currentAccountId();
    const storage = h.options[0].storage as {
      get(k: string): Promise<string | null>;
      set(k: string, v: string): Promise<void>;
    };
    const connector = h.instances[0] as { registerDebugWallet(m: unknown): Promise<unknown> };

    expect(await storage.get('debug-wallets')).toBeNull();
    await storage.set('debug-wallets', '[{"id":"veiled","type":"sandbox"}]');
    expect(store.get('debug-wallets')).toBe('[{"id":"veiled","type":"sandbox"}]'); // untouched, never read
    await expect(connector.registerDebugWallet({ id: 'veiled', type: 'sandbox' })).rejects.toThrow();
  });

  it('keeps the chosen wallet in the page storage', async () => {
    const w = await load();
    await w.currentAccountId();
    const storage = h.options[0].storage as {
      get(k: string): Promise<string | null>;
      set(k: string, v: string): Promise<void>;
    };

    await storage.set('selected-wallet', 'meteor-wallet');
    expect(store.get('selected-wallet')).toBe('meteor-wallet');
    expect(await storage.get('selected-wallet')).toBe('meteor-wallet');
  });

  it('treats closing the list as no choice, not as an error', async () => {
    const w = await load();
    h.pick = null;

    await expect(w.openWalletModal()).resolves.toBeUndefined();
    expect(await w.currentAccountId()).toBeNull();
  });
});

describe('the connected account', () => {
  it('restores the session once and answers later lookups from memory', async () => {
    h.session = { walletId: 'meteor-wallet', accountId: 'alice.testnet' };
    const w = await load();

    expect(await w.currentAccountId()).toBe('alice.testnet');
    expect(await w.currentAccountId()).toBe('alice.testnet');
    expect(await w.currentWalletName()).toBe('Meteor Wallet');
    expect(h.restoreCalls).toBe(1);
  });

  it('is null when nobody signed in before', async () => {
    const w = await load();

    expect(await w.currentAccountId()).toBeNull();
    expect(await w.currentWalletName()).toBeNull();
  });

  it('follows sign-in and sign-out, and stops reporting after unsubscribing', async () => {
    const w = await load();
    const seen: Array<string | null> = [];
    const unsubscribe = await w.watchAccount((a) => seen.push(a));

    h.pick = { walletId: 'intear-wallet', accountId: 'bob.testnet' };
    await w.openWalletModal();
    expect(await w.currentWalletName()).toBe('Intear Wallet');
    await w.signOut();
    unsubscribe();
    h.pick = { walletId: 'meteor-wallet', accountId: 'carol.testnet' };
    await w.openWalletModal();

    expect(seen).toEqual([null, 'bob.testnet', null]);
  });

  it('keeps a sign-in made while the old session was still being restored', async () => {
    let answer!: (v: Awaited<ReturnType<NonNullable<typeof h.restore>>>) => void;
    h.restore = () => new Promise((resolve) => (answer = resolve));
    const w = await load();
    const first = w.currentAccountId();

    h.pick = { walletId: 'meteor-wallet', accountId: 'bob.testnet' };
    await w.openWalletModal();
    answer({ wallet: walletFor('meteor-wallet'), accounts: [{ accountId: 'stale.testnet', publicKey: PUBLIC_KEY }] });
    await first;

    expect(await w.currentAccountId()).toBe('bob.testnet');
  });

  it('does not hold the page up when the wallet never answers, and takes a late answer', async () => {
    let answer!: (v: Awaited<ReturnType<NonNullable<typeof h.restore>>>) => void;
    h.restore = () => new Promise((resolve) => (answer = resolve));
    const w = await load();
    vi.useFakeTimers();
    const seen: Array<string | null> = [];
    const watching = w.watchAccount((a) => seen.push(a));

    const lookup = w.currentAccountId();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await lookup).toBeNull();
    await watching;

    answer({ wallet: walletFor('meteor-wallet'), accounts: [{ accountId: 'alice.testnet', publicKey: PUBLIC_KEY }] });
    await vi.advanceTimersByTimeAsync(0);

    expect(await w.currentAccountId()).toBe('alice.testnet');
    expect(seen).toEqual([null, 'alice.testnet']);
  });
});

describe('signing out', () => {
  it('signs out here at once, even when the wallet never answers its own sign-out', async () => {
    h.session = { walletId: 'meteor-wallet', accountId: 'alice.testnet' };
    h.signOutAnswer = () => new Promise(() => {});
    const w = await load();
    expect(await w.currentAccountId()).toBe('alice.testnet');
    store.set('selected-wallet', 'meteor-wallet');
    vi.useFakeTimers();

    const out = w.signOut();
    expect(await w.currentAccountId()).toBeNull();
    await vi.advanceTimersByTimeAsync(5_000);
    await out;

    expect(store.has('selected-wallet')).toBe(false);
    expect(h.signOutCalls).toBe(1);
  });

  it('signs out here when the wallet fails to sign out', async () => {
    h.session = { walletId: 'meteor-wallet', accountId: 'alice.testnet' };
    h.signOutAnswer = () => Promise.reject(new Error('Failed to load executor: 429'));
    const w = await load();
    await w.currentAccountId();
    store.set('selected-wallet', 'meteor-wallet');

    await expect(w.signOut()).resolves.toBeUndefined();

    expect(await w.currentAccountId()).toBeNull();
    expect(store.has('selected-wallet')).toBe(false);
  });
});

describe('signing the key message', () => {
  it('reaches the wallet with its recipient and 32-byte nonce, and returns the signature as the wallet gave it', async () => {
    h.session = { walletId: 'meteor-wallet', accountId: 'alice.testnet' };
    const w = await load();
    const nonce = Uint8Array.from({ length: 32 }, (_, i) => i + 1);

    const signed = await w.signMessage('the key message', nonce);

    expect(signed).toEqual({ signature: SIGNATURE_B64, publicKey: PUBLIC_KEY });
    expect(h.signed).toHaveLength(1);
    expect(h.signed[0].message).toBe('the key message');
    expect(h.signed[0].recipient).toBe(VEILED_CONTRACT);
    expect(Array.from(h.signed[0].nonce)).toEqual(Array.from({ length: 32 }, (_, i) => i + 1));
  });

  it('asks for a connected wallet first', async () => {
    const w = await load();

    await expect(w.signMessage('the key message', new Uint8Array(32))).rejects.toThrow('Connect a NEAR wallet first.');
  });

  it('refuses a signature the wallet made as another account', async () => {
    h.session = { walletId: 'meteor-wallet', accountId: 'alice.testnet' };
    h.signAs = 'bob.testnet';
    const w = await load();

    const err = await w.signMessage('the key message', new Uint8Array(32)).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(w.WalletError);
    expect((err as Error).message).toMatch(/bob\.testnet/);
    expect((err as { code?: string }).code).not.toBe('SIGN_UNSUPPORTED');
  });

  it('accepts a signature that names no account', async () => {
    h.session = { walletId: 'meteor-wallet', accountId: 'alice.testnet' };
    h.signAs = '';
    const w = await load();

    await expect(w.signMessage('the key message', new Uint8Array(32))).resolves.toMatchObject({ signature: SIGNATURE_B64 });
  });

  it.each([
    ['hex', '01'.repeat(64)],
    ['base58', '3'.repeat(88)],
    ['base64 of 32 bytes', btoa(String.fromCharCode(...Array.from({ length: 32 }, (_, i) => i)))],
    ['not base64 at all', 'not a signature!'],
  ])('refuses a signature given as %s, which would make a key no other browser derives', async (_, signature) => {
    h.session = { walletId: 'meteor-wallet', accountId: 'alice.testnet' };
    h.signature = signature;
    const w = await load();

    const err = await w.signMessage('the key message', new Uint8Array(32)).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(w.WalletError);
    expect((err as { code?: string }).code).not.toBe('SIGN_UNSUPPORTED');
  });

  it('reports a wallet that cannot sign messages with the code the key fallback looks for', async () => {
    h.featureOverrides = { signMessage: false };
    h.session = { walletId: 'meteor-wallet', accountId: 'alice.testnet' };
    const w = await load();

    await expect(w.signMessage('the key message', new Uint8Array(32))).rejects.toMatchObject({ code: 'SIGN_UNSUPPORTED' });
    expect(h.signed).toHaveLength(0);
  });
});

describe('calling the contract', () => {
  it('sends one function call with gas and deposit as decimal strings and returns the hash and value', async () => {
    h.session = { walletId: 'meteor-wallet', accountId: 'alice.testnet' };
    h.sendAnswer = async () => outcome('9xTxHash', 'alice.testnet', 7);
    const w = await load();

    const res = await w.callContract({ method: 'buy', args: { market: 3 }, deposit: 1n, gas: 30_000_000_000_000n });

    expect(res).toEqual({ txHash: '9xTxHash', value: 7, signerId: 'alice.testnet' });
    expect(h.sent).toEqual([
      {
        signerId: 'alice.testnet',
        receiverId: VEILED_CONTRACT,
        actions: [
          { type: 'FunctionCall', params: { methodName: 'buy', args: { market: 3 }, gas: '30000000000000', deposit: '1' } },
        ],
      },
    ]);
  });

  it('sends the default gas and no deposit when none is given, to the contract asked for', async () => {
    h.session = { walletId: 'meteor-wallet', accountId: 'alice.testnet' };
    h.sendAnswer = async () => outcome('9xTxHash', 'alice.testnet', null);
    const w = await load();

    await w.callContract({ method: 'ft_transfer_call', args: {}, contractId: 'usdc.fakes.testnet' });

    expect(h.sent[0].receiverId).toBe('usdc.fakes.testnet');
    expect(h.sent[0].actions).toEqual([
      { type: 'FunctionCall', params: { methodName: 'ft_transfer_call', args: {}, gas: String(GAS_DEFAULT), deposit: '0' } },
    ]);
  });

  it('throws the contract error together with the hash when the call fails on chain', async () => {
    h.session = { walletId: 'meteor-wallet', accountId: 'alice.testnet' };
    h.sendAnswer = async () => ({
      ...outcome('9xFailed', 'alice.testnet', null),
      status: { Failure: { ActionError: { kind: { FunctionCallError: { ExecutionError: 'Smart contract panicked: ERR_MARKET_CLOSED' } } } } },
    });
    const w = await load();

    await expect(w.callContract({ method: 'buy', args: {} })).rejects.toMatchObject({
      message: 'ERR_MARKET_CLOSED',
      txHash: '9xFailed',
    });
  });

  it.each([
    ['an Error', () => new Error('Wallet closed'), 'The wallet request was cancelled.'],
    ['a plain object from the wallet iframe', () => ({ message: 'User rejected the request' }), 'The wallet request was cancelled.'],
    ['a string from the wallet iframe', () => 'Method not found', 'Method not found'],
  ])('turns a refusal given as %s into a readable error', async (_, refusal, message) => {
    h.session = { walletId: 'meteor-wallet', accountId: 'alice.testnet' };
    h.sendAnswer = () => Promise.reject(refusal());
    const w = await load();

    await expect(w.callContract({ method: 'buy', args: {} })).rejects.toThrow(message);
  });

  it('asks for a connected wallet before sending anything', async () => {
    const w = await load();

    await expect(w.callContract({ method: 'buy', args: {} })).rejects.toThrow('Connect a NEAR wallet first.');
    expect(h.sent).toHaveLength(0);
  });
});

/** Base64 of a SignedDelegate's first bytes: the borsh sender id (u32 length, little-endian, then the id). */
function signedDelegateOf(senderId: string): string {
  return btoa(String.fromCharCode(senderId.length, 0, 0, 0) + senderId + '\u0012usdc.fakes.testnet and the rest');
}

describe('signing a delegate action (gasless deposits)', () => {
  const deposit = {
    contractId: 'usdc.fakes.testnet',
    method: 'ft_transfer_call',
    args: { receiver_id: VEILED_CONTRACT, amount: '2500000', msg: '{"deposit":{}}' },
    gas: 200_000_000_000_000n,
    deposit: 1n,
  };

  it('asks the wallet for one delegate action as the connected account and returns it as the wallet gave it', async () => {
    h.featureOverrides = { signDelegateActions: true };
    h.session = { walletId: 'meteor-wallet', accountId: 'alice.testnet' };
    h.delegateAnswer = async () => ({ signedDelegateActions: [signedDelegateOf('alice.testnet')] });
    const w = await load();

    expect(await w.canSignDelegate()).toBe(true);
    expect(await w.signDelegate(deposit)).toBe(signedDelegateOf('alice.testnet'));
    expect(h.delegated).toEqual([
      {
        signerId: 'alice.testnet',
        network: 'testnet',
        delegateActions: [
          {
            receiverId: 'usdc.fakes.testnet',
            actions: [
              {
                type: 'FunctionCall',
                params: { methodName: 'ft_transfer_call', args: deposit.args, gas: '200000000000000', deposit: '1' },
              },
            ],
          },
        ],
      },
    ]);
  });

  it('does not ask a wallet that cannot sign delegate actions', async () => {
    h.session = { walletId: 'meteor-wallet', accountId: 'alice.testnet' };
    const w = await load();

    expect(await w.canSignDelegate()).toBe(false);
    await expect(w.signDelegate(deposit)).rejects.toMatchObject({ code: 'DELEGATE_UNSUPPORTED' });
    expect(h.delegated).toHaveLength(0);
  });

  it('asks for a connected wallet first', async () => {
    h.featureOverrides = { signDelegateActions: true };
    const w = await load();

    expect(await w.canSignDelegate()).toBe(false);
    await expect(w.signDelegate(deposit)).rejects.toThrow('Connect a NEAR wallet first.');
  });

  it('reports a cancelled signature as cancelled', async () => {
    h.featureOverrides = { signDelegateActions: true };
    h.session = { walletId: 'meteor-wallet', accountId: 'alice.testnet' };
    h.delegateAnswer = () => Promise.reject(new Error('User rejected the request'));
    const w = await load();

    await expect(w.signDelegate(deposit)).rejects.toThrow('The wallet request was cancelled.');
  });

  it.each([
    ['no list', {}],
    ['an empty list', { signedDelegateActions: [] }],
    ['two signed actions', { signedDelegateActions: [signedDelegateOf('alice.testnet'), signedDelegateOf('alice.testnet')] }],
    ['something that is not base64', { signedDelegateActions: ['not base64!'] }],
  ])('refuses an answer with %s', async (_, answer) => {
    h.featureOverrides = { signDelegateActions: true };
    h.session = { walletId: 'meteor-wallet', accountId: 'alice.testnet' };
    h.delegateAnswer = async () => answer;
    const w = await load();

    await expect(w.signDelegate(deposit)).rejects.toBeInstanceOf(w.WalletError);
  });

  it('refuses an action the wallet signed as another account', async () => {
    h.featureOverrides = { signDelegateActions: true };
    h.session = { walletId: 'meteor-wallet', accountId: 'alice.testnet' };
    h.delegateAnswer = async () => ({ signedDelegateActions: [signedDelegateOf('bob.testnet')] });
    const w = await load();

    await expect(w.signDelegate(deposit)).rejects.toThrow(/bob\.testnet/);
  });
});
