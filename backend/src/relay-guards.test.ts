// Run with: npx tsx --test src/relay-guards.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RateLimiter, clientIp, extDataHashOf, proofIsValid, stopProofWorkers } from './relay-guards';

const fx = JSON.parse(
  readFileSync(new URL('../../near/contract/integration-tests/fixtures/pool.json', import.meta.url), 'utf8'),
);
const vk = JSON.parse(readFileSync(new URL('./zk/verification_key.json', import.meta.url), 'utf8'));

test('the address the trusted proxy appended is used, not one the client sent', () => {
  // The client put 1.2.3.4 in the header; the proxy in front of the relayer appended the real peer.
  assert.equal(clientIp('1.2.3.4, 9.9.9.9', '10.0.0.1', 1), '9.9.9.9');
  assert.equal(clientIp('1.2.3.4, 9.9.9.9, 172.16.0.1', '10.0.0.1', 2), '9.9.9.9');
});

test('without a trusted proxy, or without the header, the socket address is used', () => {
  assert.equal(clientIp('9.9.9.9', '10.0.0.1', 0), '10.0.0.1');
  assert.equal(clientIp(undefined, '10.0.0.1', 1), '10.0.0.1');
  assert.equal(clientIp('9.9.9.9', '10.0.0.1', 3), '10.0.0.1'); // fewer hops in the header than trusted proxies
});

test('a client gets its allowance per window and no more', () => {
  let now = 0;
  const limiter = new RateLimiter(2, 100, 60_000, () => now);
  assert.equal(limiter.allow('a'), 'ok');
  assert.equal(limiter.allow('a'), 'ok');
  assert.equal(limiter.allow('a'), 'client');
  assert.equal(limiter.allow('b'), 'ok');
  now = 60_001;
  assert.equal(limiter.allow('a'), 'ok');
});

test('all clients together stop at the global allowance', () => {
  const limiter = new RateLimiter(10, 3, 60_000, () => 0);
  assert.deepEqual(['a', 'b', 'c', 'd'].map((k) => limiter.allow(k)), ['ok', 'ok', 'ok', 'global']);
});

test('a refused request does not use up allowance', () => {
  let now = 0;
  const limiter = new RateLimiter(1, 100, 60_000, () => now);
  limiter.allow('a');
  for (let i = 0; i < 50; i++) assert.equal(limiter.allow('a'), 'client');
  now = 60_001;
  assert.equal(limiter.allow('a'), 'ok');
});

test('the ext_data hash is the one the circuit binds', () => {
  const t = fx.transacts.W1;
  assert.equal(extDataHashOf(t.ext_data), t.public.ext_data_hash);
});

test.after(() => stopProofWorkers());

test('a proof from the circuit verifies and one with an altered public input does not', async () => {
  const good = fx.transacts.W1;
  const bad = fx.transacts.M_bad_proof;
  assert.equal(await proofIsValid(vk, good.proof, good.public), true);
  assert.equal(await proofIsValid(vk, bad.proof, bad.public), false);
});
