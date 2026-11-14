// Fixed-window limits for the public market endpoints. Run: npx tsx --test src/rate-limit.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RateLimiter } from './rate-limit';

test('allows perClient calls per window, then refuses with scope client', () => {
  let t = Date.parse('2026-11-14T10:00:00Z');
  const limiter = new RateLimiter({ perClient: 2, clientWindowMs: 60_000, now: () => t });
  assert.deepEqual(limiter.take('a'), { ok: true });
  assert.deepEqual(limiter.take('a'), { ok: true });
  const refused = limiter.take('a');
  assert.equal(refused.ok, false);
  assert.equal(refused.ok === false && refused.scope, 'client');
  assert.equal(refused.ok === false && refused.retryAfterSec, 60);
  assert.deepEqual(limiter.take('b'), { ok: true });
  t += 60_000;
  assert.deepEqual(limiter.take('a'), { ok: true });
});

test('the global cap refuses every client once reached and resets on the next UTC day', () => {
  let t = Date.parse('2026-11-14T23:00:00Z');
  const limiter = new RateLimiter({ perClient: 10, clientWindowMs: 3_600_000, globalPerUtcDay: 2, now: () => t });
  assert.deepEqual(limiter.take('a'), { ok: true });
  assert.deepEqual(limiter.take('b'), { ok: true });
  const refused = limiter.take('c');
  assert.equal(refused.ok === false && refused.scope, 'global');
  assert.equal(refused.ok === false && refused.retryAfterSec, 3600);
  t = Date.parse('2026-11-15T00:00:01Z');
  assert.deepEqual(limiter.take('c'), { ok: true });
});
