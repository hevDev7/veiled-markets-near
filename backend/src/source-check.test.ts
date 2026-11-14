// The readable-source check behind /check-source and `quick-market.ts open`. The network is stubbed.
// Run: npx tsx --test src/source-check.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSource, MIN_TEXT_CHARS } from './source-check';
import { SourceFetchError } from './source-reader';

const now = new Date('2026-11-14T01:00:30Z');
const START = 1794531600; // the Coinbase probe minute for `now`
const page = (status: number, body: string) => async (url: URL) => ({ final: url, status, body: Buffer.from(body) });

test('refuses text that is not a URL', async () => {
  const r = await checkSource('CoinGecko API', { now, fetch: page(200, 'x') });
  assert.equal(r.ok, false);
  assert.equal(r.problem, 'not_a_url');
});

test('a page with 6 characters of text fails as too_little_text', async () => {
  const r = await checkSource('https://www.spacex.com/launches/', { now, fetch: page(200, '<script>x()</script>Hello!') });
  assert.equal(r.ok, false);
  assert.equal(r.problem, 'too_little_text');
  assert.equal(r.chars, 6);
  assert.match(r.message, /6 characters/);
  assert.match(r.message, /JavaScript/);
});

test('a page with 200 characters passes', async () => {
  const r = await checkSource('  https://example.com/table  ', { now, fetch: page(200, `<p>${'a'.repeat(MIN_TEXT_CHARS)}</p>`) });
  assert.equal(r.ok, true);
  assert.equal(r.url, 'https://example.com/table');
  assert.equal(r.chars, 200);
  assert.equal(r.excerpt, 'a'.repeat(200));
  assert.equal(r.problem, undefined);
});

test('HTTP 403 fails as http_error', async () => {
  const r = await checkSource('https://stooq.com/q/d/?s=nvda.us', { now, fetch: page(403, 'Access denied'.repeat(30)) });
  assert.equal(r.ok, false);
  assert.equal(r.problem, 'http_error');
  assert.match(r.message, /403/);
});

test('a catalog URL is checked with its probe', async () => {
  const asked: string[] = [];
  const fetch = async (url: URL) => {
    asked.push(url.toString());
    return { final: url, status: 200, body: Buffer.from(JSON.stringify([[START + 60, 1, 2, 1.5, 1.7, 9]])) };
  };
  const r = await checkSource('https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=60&start=1795185000&end=1795185600', { now, fetch });
  const probe = `https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=60&start=${START}&end=${START + 600}`;
  assert.deepEqual(asked, [probe]);
  assert.equal(r.ok, true);
  assert.equal(r.checked_with, probe);
});

test('a catalog probe with the wrong shape fails as unexpected_shape', async () => {
  const r = await checkSource('https://api.frankfurter.dev/v1/2026-11-20?from=USD&to=XYZ', { now, fetch: page(200, '{"message":"not found"}') });
  assert.equal(r.ok, false);
  assert.equal(r.problem, 'unexpected_shape');
});

test('fetch errors keep their problem', async () => {
  const fetch = async () => {
    throw new SourceFetchError('private_address', 'the source resolves to a private address');
  };
  const r = await checkSource('https://intranet.example.com/', { now, fetch });
  assert.equal(r.ok, false);
  assert.equal(r.problem, 'private_address');
  assert.match(r.message, /private address/);
});
