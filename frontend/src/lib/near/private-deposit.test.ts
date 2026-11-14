// Public deposits into the private balance: a stablecoin deposit goes gasless (a NEP-366 delegate action the
// relayer submits and pays for) when both the wallet and the relayer offer it, and is signed and sent by the
// account otherwise. NEAR deposits attach NEAR, so the account always sends them itself.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TOKEN, VEILED_CONTRACT, tokenAccount } from './config';

interface Health {
  ok: boolean;
  meta?: boolean;
}

const w = vi.hoisted(() => ({
  canSignDelegate: vi.fn(async (): Promise<boolean> => true),
  signDelegate: vi.fn(async (_call: unknown): Promise<string> => 'c2lnbmVkLWRlbGVnYXRl'),
  callContract: vi.fn(async (_call: unknown) => ({ txHash: 'tx-signed', value: null as unknown, signerId: 'alice.testnet' })),
  relayMeta: vi.fn(async (_signed: string): Promise<{ txHash: string }> => ({ txHash: 'tx-gasless' })),
  relayerHealth: vi.fn(async (): Promise<Health> => ({ ok: true, meta: true })),
  syncNotes: vi.fn(async (_keys: unknown) => [] as unknown[]),
}));

vi.mock('./near-wallet', () => ({
  currentAccountId: async () => 'alice.testnet',
  callContract: w.callContract,
  canSignDelegate: w.canSignDelegate,
  signDelegate: w.signDelegate,
  signMessage: vi.fn(),
}));
vi.mock('./notes/keys', () => ({
  cachedNoteKeys: async () => ({ accountId: 'alice.testnet', sk: 7n, memoKey: 'memo-key' }),
  unlockNoteKeys: vi.fn(),
}));
// The real module (the Merkle tree reads its DEPTH); only the deposit's random blinding and its hash are fixed.
vi.mock('./notes/crypto', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./notes/crypto')>()),
  ownerBlindOf: () => 123456789n,
  randomField: () => 5n,
}));
vi.mock('./notes/memo', () => ({ sealMemo: async () => 'sealed-memo' }));
vi.mock('./notes/store', () => ({
  balanceOf: vi.fn(),
  setStatus: vi.fn(),
  syncNotes: w.syncNotes,
  treeOf: vi.fn(),
  unspent: vi.fn(),
  upsertNote: vi.fn(),
}));
vi.mock('./notes/prove', () => ({ prove: vi.fn() }));
vi.mock('./relayer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./relayer')>()),
  relay: vi.fn(),
  relayMeta: w.relayMeta,
  relayerHealth: w.relayerHealth,
}));

// A fresh module for every test: after a failed gasless deposit the page signs its deposits itself.
let deposit: typeof import('./private').deposit;
let RelayError: typeof import('./relayer').RelayError;

const USDC = tokenAccount(TOKEN.USDCX)!;
const usdcDeposit = {
  contractId: USDC,
  method: 'ft_transfer_call',
  args: {
    receiver_id: VEILED_CONTRACT,
    amount: '2500000',
    msg: JSON.stringify({ deposit: { owner_blind: '123456789', memo: 'sealed-memo' } }),
  },
  deposit: 1n,
  gas: 200_000_000_000_000n,
};

beforeEach(async () => {
  vi.clearAllMocks();
  w.canSignDelegate.mockResolvedValue(true);
  w.signDelegate.mockResolvedValue('c2lnbmVkLWRlbGVnYXRl');
  w.relayerHealth.mockResolvedValue({ ok: true, meta: true });
  w.relayMeta.mockResolvedValue({ txHash: 'tx-gasless' });
  vi.resetModules();
  ({ deposit } = await import('./private'));
  ({ RelayError } = await import('./relayer'));
});

describe('depositing a stablecoin', () => {
  it('goes through the relayer as a signed delegate action when the wallet and the relayer both offer it', async () => {
    expect(await deposit(TOKEN.USDCX, 2_500_000n)).toEqual({ txHash: 'tx-gasless' });
    expect(w.signDelegate).toHaveBeenCalledWith(usdcDeposit);
    expect(w.relayMeta).toHaveBeenCalledWith('c2lnbmVkLWRlbGVnYXRl');
    expect(w.callContract).not.toHaveBeenCalled();
    // The new note is picked up as after any deposit.
    expect(w.syncNotes).toHaveBeenCalledTimes(1);
  });

  it('is signed and sent by the account when the relayer does not offer gasless deposits', async () => {
    w.relayerHealth.mockResolvedValue({ ok: true, meta: false });

    expect(await deposit(TOKEN.USDCX, 2_500_000n)).toEqual({ txHash: 'tx-signed' });
    expect(w.callContract).toHaveBeenCalledWith(usdcDeposit);
    expect(w.signDelegate).not.toHaveBeenCalled();
  });

  it('is signed and sent by the account when the relayer cannot be reached', async () => {
    w.relayerHealth.mockResolvedValue({ ok: false });

    expect(await deposit(TOKEN.USDCX, 2_500_000n)).toEqual({ txHash: 'tx-signed' });
    expect(w.signDelegate).not.toHaveBeenCalled();
  });

  it('is signed and sent by the account when the wallet cannot sign delegate actions', async () => {
    w.canSignDelegate.mockResolvedValue(false);

    expect(await deposit(TOKEN.USDCX, 2_500_000n)).toEqual({ txHash: 'tx-signed' });
    expect(w.signDelegate).not.toHaveBeenCalled();
    expect(w.relayMeta).not.toHaveBeenCalled();
  });

  it.each([400, 404, 429, 503])('falls back to a deposit the account signs when the relayer refused (%i) before sending', async (status) => {
    w.relayMeta.mockRejectedValue(new RelayError('too many deposits from this account, try again in a minute', 'x', undefined, status));

    expect(await deposit(TOKEN.USDCX, 2_500_000n)).toEqual({ txHash: 'tx-signed' });
    expect(w.signDelegate).toHaveBeenCalledTimes(1);
    expect(w.callContract).toHaveBeenCalledWith(usdcDeposit);
    expect(w.syncNotes).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a relayer error after which the deposit may have been sent', () => new RelayError('rpc timeout', 'rpc timeout', undefined, 502)],
    ['a deposit the chain ran and refused', () => new RelayError('below the minimum deposit', 'ERR_MIN_DEPOSIT', 'tx-failed', 422)],
    ['a relayer that stopped answering', () => new RelayError('The relayer is not reachable.', 'RELAYER_DOWN')],
    ['an unexpected error', () => new Error('boom')],
  ])('reports %s, never deposits twice, and signs the next deposit with the account', async (_what, error) => {
    w.relayMeta.mockRejectedValue(error());

    await expect(deposit(TOKEN.USDCX, 2_500_000n)).rejects.toThrow();
    expect(w.callContract).not.toHaveBeenCalled();

    expect(await deposit(TOKEN.USDCX, 2_500_000n)).toEqual({ txHash: 'tx-signed' });
    expect(w.signDelegate).toHaveBeenCalledTimes(1);
    expect(w.relayMeta).toHaveBeenCalledTimes(1);
  });

  it('reports a wallet that could not sign the delegate action, and signs the next deposit with the account', async () => {
    w.signDelegate.mockRejectedValue(new Error('Meteor: unsupported request'));

    await expect(deposit(TOKEN.USDCX, 2_500_000n)).rejects.toThrow('Meteor: unsupported request');
    expect(w.relayMeta).not.toHaveBeenCalled();
    expect(w.callContract).not.toHaveBeenCalled();

    expect(await deposit(TOKEN.USDCX, 2_500_000n)).toEqual({ txHash: 'tx-signed' });
    expect(w.signDelegate).toHaveBeenCalledTimes(1);
  });
});

describe('depositing NEAR', () => {
  it('is always signed and sent by the account', async () => {
    await deposit(TOKEN.NEAR, 1_000_000n);

    expect(w.callContract).toHaveBeenCalledWith(expect.objectContaining({ method: 'deposit_near' }));
    expect(w.signDelegate).not.toHaveBeenCalled();
    expect(w.relayerHealth).not.toHaveBeenCalled();
  });
});
