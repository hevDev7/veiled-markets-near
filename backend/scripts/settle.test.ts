import test from 'node:test';
import assert from 'node:assert/strict';
import { settled } from './settle';

/** A read that returns these values in turn (the last one again once they run out), counting its calls. */
function reads<T>(...values: T[]) {
  let calls = 0;
  const read = async () => values[Math.min(calls++, values.length - 1)];
  return { read, calls: () => calls };
}
const noWait = async () => {};

test('a read right after a write is repeated until the RPC shows the write', async () => {
  // A node behind the RPC's load balancer can still be a block behind the transaction.
  const r = reads<string | null>(null, null, 'ai.testnet');
  assert.equal(await settled(r.read, (v) => v === 'ai.testnet', { sleep: noWait }), 'ai.testnet');
  assert.equal(r.calls(), 3);
});

test('a read that already shows the write is not repeated', async () => {
  const r = reads('ai.testnet');
  assert.equal(await settled(r.read, (v) => v === 'ai.testnet', { sleep: noWait }), 'ai.testnet');
  assert.equal(r.calls(), 1);
});

test('after the last try the latest value comes back, so the caller can say the RPC still lags', async () => {
  const r = reads<string | null>(null);
  assert.equal(await settled(r.read, (v) => v === 'ai.testnet', { tries: 4, sleep: noWait }), null);
  assert.equal(r.calls(), 4);
});

test('it waits between reads, not before the first', async () => {
  const waits: number[] = [];
  const r = reads(1, 2);
  await settled(r.read, (v) => v === 2, { delayMs: 700, sleep: async (ms) => { waits.push(ms); } });
  assert.deepEqual(waits, [700]);
});
