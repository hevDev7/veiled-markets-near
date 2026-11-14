// Gasless USDC deposits (NEP-366): what the relayer accepts before it pays for a user's delegate action.
// Run: npx tsx --test src/meta-tx.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ed25519 } from '@noble/curves/ed25519.js';
import { sha256, sha512 } from '@noble/hashes/sha2.js';
import {
  KeyPair,
  KeyPairSigner,
  actions,
  baseDecode,
  buildDelegateAction,
  encodeDelegateAction,
  encodeSignedDelegate,
} from 'near-api-js';
import { MetaLimited, MetaRefused, metaRelay, parseMetaDeposit, type MetaChain, type MetaDepositPolicy } from './meta-tx';

const VEILED = 'v1.veiled-markets.testnet';
const USDC = '3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af';
const policy: MetaDepositPolicy = { veiled: VEILED, tokens: [USDC], minAmount: 10_000n };
const TGAS = 1_000_000_000_000n;
const depositMsg = JSON.stringify({ deposit: { owner_blind: '1234567890123', memo: 'c2VhbGVk' } });

interface Make {
  receiverId?: string;
  actions?: ReturnType<typeof actions.functionCall>[];
  /** the call arguments, as an object or as the exact bytes */
  args?: Record<string, unknown> | Uint8Array;
  method?: string;
  gas?: bigint;
  deposit?: bigint;
  nonce?: bigint;
  maxBlockHeight?: bigint;
  /** replaces the signature: gets the 32-byte seed, the public key and the signed message */
  sign?: (seed: Uint8Array, publicKey: Uint8Array, message: Uint8Array) => Uint8Array;
}

async function signed(m: Make = {}) {
  const key = KeyPair.fromRandom('ed25519');
  const args = m.args ?? { receiver_id: VEILED, amount: '2500000', msg: depositMsg };
  const delegate = buildDelegateAction({
    senderId: 'alice.testnet',
    receiverId: m.receiverId ?? USDC,
    actions: m.actions ?? [actions.functionCall(m.method ?? 'ft_transfer_call', args, m.gas ?? 150n * TGAS, m.deposit ?? 1n)],
    nonce: m.nonce ?? 10n,
    maxBlockHeight: m.maxBlockHeight ?? 1000n,
    publicKey: key.getPublicKey(),
  });
  const { signedDelegate } = await new KeyPairSigner(key).signDelegateAction(delegate);
  if (m.sign) {
    const seed = baseDecode((key as unknown as { secretKey: string }).secretKey);
    const message = sha256(encodeDelegateAction(signedDelegate.delegateAction));
    (signedDelegate.signature as any).ed25519Signature.data = m.sign(seed, key.getPublicKey().data, message);
  }
  return { b64: Buffer.from(encodeSignedDelegate(signedDelegate)).toString('base64'), key };
}

const L = ed25519.Point.Fn.ORDER;
const le = (b: Uint8Array) => b.reduceRight((n, x) => (n << 8n) | BigInt(x), 0n);
const le32 = (n: bigint) => Uint8Array.from({ length: 32 }, (_, i) => Number((n >> (8n * BigInt(i))) & 0xffn));

/**
 * An ed25519 signature whose R carries the order-2 point (0, -1): the cofactored check (noble's default, ZIP-215)
 * accepts it, the cofactorless check nearcore runs (ed25519-dalek) does not — and nothing but an ordinary key is needed.
 */
function torsionSignature(seed: Uint8Array, publicKey: Uint8Array, message: Uint8Array) {
  const a = ed25519.utils.getExtendedPublicKey(seed).scalar;
  const order2 = ed25519.Point.fromBytes(Uint8Array.from([0xec, ...Array(30).fill(0xff), 0x7f]));
  const r = 0x1234567890abcdefn;
  const R = ed25519.Point.BASE.multiply(r).add(order2).toBytes();
  const k = le(sha512(Uint8Array.from([...R, ...publicKey, ...message]))) % L;
  return Uint8Array.from([...R, ...le32((r + k * a) % L)]);
}

function refused(b64: string, reason: RegExp) {
  assert.throws(() => parseMetaDeposit(b64, policy), (err) => err instanceof MetaRefused && reason.test(err.message));
}

test('a signed USDC deposit to the contract is accepted and re-encodes to the same bytes', async () => {
  const { b64, key } = await signed();
  const d = parseMetaDeposit(b64, policy);
  assert.equal(d.senderId, 'alice.testnet');
  assert.equal(d.token, USDC);
  assert.equal(d.amount, 2_500_000n);
  assert.equal(d.nonce, 10n);
  assert.equal(d.maxBlockHeight, 1000n);
  assert.equal(d.publicKey, key.getPublicKey().toString());
  // The relayer submits exactly what the user signed.
  assert.equal(Buffer.from(encodeSignedDelegate(d.signedDelegate)).toString('base64'), b64);
});

test('only the listed token contracts are accepted', async () => {
  refused((await signed({ receiverId: 'evil.testnet' })).b64, /token/);
});

test('exactly one ft_transfer_call with 1 yocto and 100 to 300 TGas', async () => {
  const one = actions.functionCall('ft_transfer_call', { receiver_id: VEILED, amount: '2500000', msg: depositMsg }, 150n * TGAS, 1n);
  refused((await signed({ actions: [one, one] })).b64, /one action/);
  refused((await signed({ actions: [actions.transfer(1n)] as never })).b64, /function call/);
  refused((await signed({ method: 'ft_transfer' })).b64, /ft_transfer_call/);
  refused((await signed({ deposit: 0n })).b64, /1 yocto/);
  refused((await signed({ deposit: 2n })).b64, /1 yocto/);
  refused((await signed({ gas: 99n * TGAS })).b64, /gas/);
  refused((await signed({ gas: 301n * TGAS })).b64, /gas/);
});

test('the transfer must be a deposit into the Veiled contract', async () => {
  const args = (over: Record<string, unknown>) => ({ receiver_id: VEILED, amount: '2500000', msg: depositMsg, ...over });
  refused((await signed({ args: args({ receiver_id: 'bob.testnet' }) })).b64, /receiver/);
  refused((await signed({ args: args({ amount: '9999' }) })).b64, /amount/);
  refused((await signed({ args: args({ amount: '1e9' }) })).b64, /amount/);
  refused((await signed({ args: args({ msg: JSON.stringify({ create_market: {} }) }) })).b64, /deposit message/);
  const extra = JSON.stringify({ deposit: { owner_blind: '1', memo: '' }, other: 1 });
  refused((await signed({ args: args({ msg: extra }) })).b64, /deposit message/);
  const badBlind = JSON.stringify({ deposit: { owner_blind: '0x12', memo: '' } });
  refused((await signed({ args: args({ msg: badBlind }) })).b64, /owner_blind/);
  const longMemo = JSON.stringify({ deposit: { owner_blind: '1', memo: 'm'.repeat(401) } });
  refused((await signed({ args: args({ msg: longMemo }) })).b64, /memo/);
  refused((await signed({ args: args({ memo: 'note', extra: true }) })).b64, /arguments/);
});

test('owner_blind must be a non-zero element of the scalar field, as the contract requires', async () => {
  // BN254 scalar modulus r; the contract parses owner_blind with parse_fr (< r) and refuses zero.
  const R = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
  const withBlind = async (owner_blind: string) =>
    (await signed({
      args: { receiver_id: VEILED, amount: '2500000', msg: JSON.stringify({ deposit: { owner_blind, memo: '' } }) },
    })).b64;
  refused(await withBlind('0'), /owner_blind/);
  refused(await withBlind('000'), /owner_blind/);
  refused(await withBlind(String(R)), /owner_blind/);
  refused(await withBlind('9'.repeat(78)), /owner_blind/);
  assert.equal(parseMetaDeposit(await withBlind(String(R - 1n)), policy).amount, 2_500_000n);
});

test('a signature that does not match the delegate is refused', async () => {
  const bytes = Buffer.from((await signed()).b64, 'base64');
  bytes[bytes.length - 1] ^= 1; // last byte of the ed25519 signature
  refused(bytes.toString('base64'), /signature/);
});

test('a signature only the cofactored check accepts is refused, as nearcore refuses it', async () => {
  let seen: { sig: Uint8Array; publicKey: Uint8Array; message: Uint8Array } | null = null;
  const { b64 } = await signed({
    sign: (seed, publicKey, message) => {
      const sig = torsionSignature(seed, publicKey, message);
      seen = { sig, publicKey, message };
      return sig;
    },
  });
  const s = seen!;
  // The stand-in is real: the ZIP-215 check passes it.
  assert.equal(ed25519.verify(s.sig, s.message, s.publicKey), true);
  refused(b64, /signature/);
});

test('a signature with a non-canonical s (s + L) is refused', async () => {
  const { b64 } = await signed({
    sign: (seed, _publicKey, message) => {
      const sig = ed25519.sign(message, seed);
      return Uint8Array.from([...sig.slice(0, 32), ...le32(le(sig.slice(32)) + L)]);
    },
  });
  refused(b64, /signature/);
});

test('call arguments the token contract would read differently are refused', async () => {
  const raw = (text: string) => Buffer.from(text, 'utf8');
  const head = `"receiver_id":"${VEILED}","amount":"2500000"`;
  const msgField = `"msg":${JSON.stringify(depositMsg)}`;
  // JSON.parse keeps the last of two keys; serde refuses them.
  refused((await signed({ args: raw(`{${head},"amount":"2500001",${msgField}}`) })).b64, /plain JSON/);
  // Spaces are valid JSON, but not what any wallet writes: only exact JSON.stringify output is accepted.
  refused((await signed({ args: raw(`{ ${head},${msgField}}`) })).b64, /plain JSON/);
  // Bytes that are not UTF-8, and a lone surrogate, which serde refuses and JavaScript accepts.
  const bad = Buffer.concat([raw(`{${head},${msgField},"memo":"`), Buffer.from([0xff, 0xfe]), raw('"}')]);
  refused((await signed({ args: bad })).b64, /UTF-8/);
  refused((await signed({ args: raw(`{${head},${msgField},"memo":"\\ud800"}`) })).b64, /surrogate/);
  // The same rules for the deposit message inside.
  const lone = '{"deposit":{"owner_blind":"1234567890123","memo":"\\ud800"}}';
  refused((await signed({ args: { receiver_id: VEILED, amount: '2500000', msg: lone } })).b64, /surrogate/);
  const twice = '{"deposit":{"owner_blind":"1234567890123","owner_blind":"5","memo":""}}';
  refused((await signed({ args: { receiver_id: VEILED, amount: '2500000', msg: twice } })).b64, /plain JSON/);
  // What wallets write is still accepted.
  assert.equal(parseMetaDeposit((await signed({ args: raw(`{${head},${msgField}}`) })).b64, policy).amount, 2_500_000n);
});

test('garbage and oversized input are refused', () => {
  refused('not base64 at all!', /decode/);
  refused(Buffer.from('short').toString('base64'), /decode/);
  refused('A'.repeat(20_000), /too large/);
});

// ------------------------------------------------------------------ checks against the chain, then submission

interface ChainState {
  height?: bigint;
  key?: { nonce: bigint; fullAccess: boolean } | null;
  balance?: bigint;
  failure?: string;
}

function chain(s: ChainState = {}) {
  const submitted: string[] = [];
  const c: MetaChain = {
    blockHeight: async () => s.height ?? 900n,
    accessKey: async () => (s.key === undefined ? { nonce: 9n, fullAccess: true } : s.key),
    ftBalance: async () => s.balance ?? 2_500_000n,
    submit: async (senderId) => {
      submitted.push(senderId);
      return { txHash: 'tx-meta', failure: s.failure };
    },
  };
  return { c, submitted };
}

async function deposit(m: Make = {}) {
  return parseMetaDeposit((await signed(m)).b64, policy);
}

test('a deposit that passes the chain checks is submitted for its sender', async () => {
  const { c, submitted } = chain();
  assert.deepEqual(await metaRelay(c)(await deposit()), { ok: true, txHash: 'tx-meta' });
  assert.deepEqual(submitted, ['alice.testnet']);
});

test('nothing is submitted for an expired action, a foreign or limited key, a used nonce or a short balance', async () => {
  const cases: Array<[ChainState, RegExp]> = [
    [{ height: 1000n }, /expired/],
    [{ key: null }, /not a key of alice.testnet/],
    [{ key: { nonce: 1n, fullAccess: false } }, /full-access/],
    [{ key: { nonce: 10n, fullAccess: true } }, /nonce/],
    [{ balance: 2_499_999n }, /holds less/],
  ];
  for (const [state, reason] of cases) {
    const { c, submitted } = chain(state);
    await assert.rejects(metaRelay(c)(await deposit()), (err) => err instanceof MetaRefused && reason.test(err.message));
    assert.equal(submitted.length, 0, String(reason));
  }
});

test('nothing is submitted for an action that expires before it can run, or a nonce the chain caps', async () => {
  // The relayer's transaction lands a few blocks after the final height it read.
  const soon = chain({ height: 995n });
  await assert.rejects(metaRelay(soon.c)(await deposit({ maxBlockHeight: 1000n })), /expire/);
  assert.equal(soon.submitted.length, 0);
  // nearcore refuses a nonce of block height × 10^6 or more before it records the nonce, so the same bytes would
  // fail again and again at the relayer's expense.
  const capped = chain({ height: 900n });
  await assert.rejects(metaRelay(capped.c)(await deposit({ nonce: 900n * 1_000_000n })), /nonce/);
  await assert.rejects(metaRelay(capped.c)(await deposit({ nonce: 2n ** 63n })), /nonce/);
  assert.equal(capped.submitted.length, 0);
  assert.deepEqual(await metaRelay(capped.c)(await deposit({ nonce: 900n * 1_000_000n - 1n })), { ok: true, txHash: 'tx-meta' });
});

test('a signed deposit is submitted once, even when sent twice at the same time', async () => {
  const { c, submitted } = chain();
  const relay = metaRelay(c);
  const d = await deposit();
  const both = await Promise.allSettled([relay(d), relay(d)]);
  assert.deepEqual(both.map((r) => r.status).sort(), ['fulfilled', 'rejected']);
  await assert.rejects(relay(d), /already sent/);
  assert.deepEqual(submitted, ['alice.testnet']);
});

test('a deposit refused before submission can be sent again once the reason is gone', async () => {
  const state: ChainState = { balance: 1n };
  const { c, submitted } = chain(state);
  const relay = metaRelay(c);
  const d = await deposit();
  await assert.rejects(relay(d), /holds less/);
  state.balance = 2_500_000n;
  assert.deepEqual(await relay(d), { ok: true, txHash: 'tx-meta' });
  assert.equal(submitted.length, 1);
});

test('the per-sender limit is spent only by a deposit that passed every check', async () => {
  const asked: string[] = [];
  let allow = true;
  const allowSender = (sender: string) => {
    asked.push(sender);
    return allow;
  };
  // Anyone can post a sender's old, used SignedDelegate: it must not use up that sender's deposits.
  const used = chain({ key: { nonce: 10n, fullAccess: true } });
  await assert.rejects(metaRelay(used.c, { allowSender })(await deposit()), /nonce/);
  assert.deepEqual(asked, []);

  const { c, submitted } = chain();
  const relay = metaRelay(c, { allowSender });
  allow = false;
  const d = await deposit();
  await assert.rejects(relay(d), (err) => err instanceof MetaLimited);
  assert.equal(submitted.length, 0);
  allow = true;
  assert.deepEqual(await relay(d), { ok: true, txHash: 'tx-meta' });
  assert.deepEqual(asked, ['alice.testnet', 'alice.testnet']);
});

test('the memory of sent deposits is bounded', async () => {
  const { c, submitted } = chain();
  const relay = metaRelay(c, { remember: 2 });
  const [d1, d2, d3] = [await deposit(), await deposit(), await deposit()];
  for (const d of [d1, d2, d3]) await relay(d);
  await assert.rejects(relay(d3), /already sent/);
  // d1 was forgotten; the chain's own nonce check is what refuses it from here on.
  await relay(d1);
  assert.equal(submitted.length, 4);
});

test('a deposit the contract refused is reported with its error', async () => {
  const { c } = chain({ failure: 'ERR_MIN_DEPOSIT' });
  assert.deepEqual(await metaRelay(c)(await deposit()), { ok: false, txHash: 'tx-meta', error: 'ERR_MIN_DEPOSIT' });
});
