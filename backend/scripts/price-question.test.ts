// Run with: npx tsx --test scripts/price-question.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { priceQuestion, priceSeriesUrl, questionMoment } from './price-question';
import { metadataOf } from './market-meta';
import { sourceUrl } from '../src/ai-resolver-core';

const utc = (iso: string) => Date.parse(iso);

test('the question moment is the first five-minute mark at least the asked minutes away', () => {
  assert.equal(questionMoment(utc('2026-11-13T13:21:30Z'), 6).toISOString(), '2026-11-13T13:30:00.000Z');
  assert.equal(questionMoment(utc('2026-11-13T13:24:00Z'), 6).toISOString(), '2026-11-13T13:30:00.000Z');
  assert.equal(questionMoment(utc('2026-11-13T13:24:00.001Z'), 6).toISOString(), '2026-11-13T13:35:00.000Z');
  assert.equal(questionMoment(utc('2026-11-13T23:58:10Z'), 6).toISOString(), '2026-11-14T00:05:00.000Z');
});

test('the source is CoinGecko\'s price series from five minutes before the moment to five minutes after', () => {
  const at = new Date('2026-11-13T13:30:00Z');
  const url = new URL(priceSeriesUrl('near', at));
  assert.equal(url.origin + url.pathname, 'https://api.coingecko.com/api/v3/coins/near/market_chart/range');
  assert.equal(url.searchParams.get('vs_currency'), 'usd');
  assert.equal(Number(url.searchParams.get('from')), at.getTime() / 1000 - 300);
  assert.equal(Number(url.searchParams.get('to')), at.getTime() / 1000 + 300);
  assert.match(priceSeriesUrl('wrapped bitcoin', at), /\/coins\/wrapped%20bitcoin\/market_chart\/range\?/);
});

test('the market names the sample that decides it, and the AI resolver can fetch its source', () => {
  const at = new Date('2026-11-13T13:30:00Z');
  const q = priceQuestion({ name: 'NEAR Protocol', symbol: 'NEAR' }, 'near', '3.53', at);
  assert.equal(q.question, 'Will NEAR trade above $3.53 at 13:30 UTC on November 13, 2026?');
  assert.deepEqual(q.outcomes, ['Yes', 'No']);
  assert.equal(q.resolutionSource, priceSeriesUrl('near', at));
  assert.ok(sourceUrl(q.resolutionSource), 'the resolver only reads a source that is a URL');
  assert.ok(q.description.includes(String(at.getTime())), 'the rules name the sample time in milliseconds');
  assert.ok(q.description.includes('above $3.53'));
});

test('a coin whose name does not carry its ticker is named with both, and the metadata fits the contract', () => {
  const at = new Date('2026-11-13T13:30:00Z');
  const q = priceQuestion({ name: 'Bittensor', symbol: 'TAO' }, 'bittensor', '412.50', at);
  assert.ok(q.question.startsWith('Will Bittensor (TAO) trade above $412.50 at 13:30 UTC'));
  // create_market rejects metadata over 2048 bytes (ERR_METADATA_LEN).
  const long = priceQuestion({ name: 'A'.repeat(60), symbol: 'LONG' }, 'x'.repeat(60), '0.000123', at);
  assert.ok(Buffer.byteLength(metadataOf(long)) <= 2048);
});
