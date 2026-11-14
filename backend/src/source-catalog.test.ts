// The source catalog: data APIs whose answer for a future date is empty, so the source check reads them for a past
// date (a probe) and checks the answer's shape. Run: npx tsx --test src/source-catalog.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { catalogProbe } from './source-catalog';

const now = new Date('2026-11-14T01:00:30Z');
const START = 1794531600; // 2026-11-13T01:00:00Z, the minute 24 hours before `now`

test('coinbase candles URL gets a past 10-minute probe', () => {
  const p = catalogProbe(new URL('https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=60&start=1795185000&end=1795185600'), now);
  assert.equal(p?.id, 'coinbase-candles');
  assert.equal(p?.url.origin + p?.url.pathname, 'https://api.exchange.coinbase.com/products/BTC-USD/candles');
  assert.equal(p?.url.searchParams.get('granularity'), '60');
  assert.equal(p?.url.searchParams.get('start'), String(START));
  assert.equal(p?.url.searchParams.get('end'), String(START + 600));
});

test('coinbase probe accepts candles in its window and rejects [] and error objects', () => {
  const p = catalogProbe(new URL('https://api.exchange.coinbase.com/products/NEAR-USD/candles?granularity=60&start=1&end=61'), now)!;
  assert.equal(p.accepts(JSON.stringify([[START + 120, 2.1, 2.2, 2.15, 2.18, 1000]])), true);
  assert.equal(p.accepts('[]'), false);
  assert.equal(p.accepts('{"message":"NotFound"}'), false);
  assert.equal(p.accepts(JSON.stringify([[START - 600, 2.1, 2.2, 2.15, 2.18, 1000]])), false);
  assert.equal(p.accepts('not json'), false);
});

test('nasdaq historical URL gets a 10-day probe', () => {
  const p = catalogProbe(new URL('https://api.nasdaq.com/api/quote/NVDA/historical?assetclass=stocks&fromdate=2026-11-16&todate=2026-11-17&limit=10'), now)!;
  assert.equal(p.id, 'nasdaq-historical');
  assert.equal(p.url.pathname, '/api/quote/NVDA/historical');
  assert.equal(p.url.searchParams.get('assetclass'), 'stocks');
  assert.equal(p.url.searchParams.get('fromdate'), '2026-11-04');
  assert.equal(p.url.searchParams.get('todate'), '2026-11-13');
  assert.equal(p.url.searchParams.get('limit'), '10');
  assert.equal(p.accepts(JSON.stringify({ data: { tradesTable: { rows: [{ date: '11/13/2026', close: '$186.86' }] } } })), true);
  assert.equal(p.accepts(JSON.stringify({ data: null })), false);
});

test('frankfurter URL gets a probe 7 days back', () => {
  const p = catalogProbe(new URL('https://api.frankfurter.dev/v1/2026-11-20?from=USD&to=IDR'), now)!;
  assert.equal(p.id, 'frankfurter-rate');
  assert.equal(p.url.toString(), 'https://api.frankfurter.dev/v1/2026-11-07?from=USD&to=IDR');
  assert.equal(p.accepts('{"amount":1.0,"base":"USD","date":"2026-11-06","rates":{"IDR":18245.0}}'), true);
  assert.equal(p.accepts('{"rates":{}}'), false);
});

test('other URLs have no probe', () => {
  assert.equal(catalogProbe(new URL('https://www.boxofficemojo.com/weekend/2026W51/'), now), null);
  assert.equal(catalogProbe(new URL('https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=300'), now), null);
  assert.equal(catalogProbe(new URL('https://api.frankfurter.dev/v1/2026-11-20?from=USD&to=IDR,EUR'), now), null);
});
