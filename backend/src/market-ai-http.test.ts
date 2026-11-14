// The market endpoints on the AI resolver service: /check-source (and /draft, /review in stage 2). Real HTTP on an
// ephemeral port, stubbed dependencies. Run: npx tsx --test src/market-ai-http.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { marketAiRoutes, type RouteDeps } from './market-ai-http';
import { RateLimiter } from './rate-limit';
import type { SourceCheck } from './source-check';

const APP = 'https://veiledmarkets.xyz';
const okCheck = (url: string): SourceCheck => ({ ok: true, url, chars: 500, excerpt: 'text', message: 'fine' });

function deps(over: Partial<RouteDeps> = {}): RouteDeps {
  return {
    checkSource: async url => okCheck(url),
    origins: [APP, 'http://localhost:3100'],
    checkLimiter: new RateLimiter({ perClient: 30, clientWindowMs: 60_000 }),
    aiLimiter: new RateLimiter({ perClient: 10, clientWindowMs: 3_600_000, globalPerUtcDay: 150 }),
    ...over,
  };
}

async function start(d: RouteDeps) {
  const routes = marketAiRoutes(d);
  const server = http.createServer((req, res) => {
    routes(req, res).then(handled => {
      if (!handled) {
        res.writeHead(404);
        res.end('not mine');
      }
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const request = (method: string, path: string, headers: Record<string, string> = {}, body?: string) =>
    new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }>((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port, method, path, headers }, res => {
        let text = '';
        res.on('data', c => (text += c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: text }));
      });
      req.on('error', reject);
      req.end(body);
    });
  const close = () => new Promise<void>(resolve => {
    server.closeAllConnections();
    server.close(() => resolve());
  });
  return { request, close };
}

const q = (url: string) => `/check-source?url=${encodeURIComponent(url)}`;

test('GET /check-source answers with the check result and echoes an allowed origin', async () => {
  const s = await start(deps());
  try {
    const r = await s.request('GET', q('https://example.com/a'), { origin: APP });
    assert.equal(r.status, 200);
    assert.deepEqual(JSON.parse(r.body), okCheck('https://example.com/a'));
    assert.equal(r.headers['access-control-allow-origin'], APP);
    assert.equal(r.headers['cache-control'], 'no-store');
  } finally {
    await s.close();
  }
});

test('an unknown origin gets no CORS header', async () => {
  const s = await start(deps());
  try {
    const r = await s.request('GET', q('https://example.com/a'), { origin: 'https://evil.example' });
    assert.equal(r.status, 200);
    assert.equal(r.headers['access-control-allow-origin'], undefined);
  } finally {
    await s.close();
  }
});

test('OPTIONS answers 204 with the allowed methods', async () => {
  const s = await start(deps());
  try {
    const r = await s.request('OPTIONS', '/draft', { origin: APP, 'access-control-request-method': 'POST' });
    assert.equal(r.status, 204);
    assert.equal(r.headers['access-control-allow-origin'], APP);
    assert.equal(r.headers['access-control-allow-methods'], 'GET, POST, OPTIONS');
    assert.equal(r.headers['access-control-allow-headers'], 'content-type');
  } finally {
    await s.close();
  }
});

test('the per-client limit answers 429', async () => {
  const s = await start(deps({ checkLimiter: new RateLimiter({ perClient: 1, clientWindowMs: 60_000 }) }));
  try {
    assert.equal((await s.request('GET', q('https://example.com/1'))).status, 200);
    assert.equal((await s.request('GET', q('https://example.com/2'))).status, 429);
  } finally {
    await s.close();
  }
});

test('a URL checked twice within 60 s is fetched once', async () => {
  let calls = 0;
  const s = await start(deps({ checkSource: async url => (calls++, okCheck(url)) }));
  try {
    await s.request('GET', q('https://example.com/same'));
    await s.request('GET', q(' https://example.com/same '));
    assert.equal(calls, 1);
  } finally {
    await s.close();
  }
});

test('a failed check is reused for 5 s only, a passed one for 60 s', async () => {
  let t = 1_000_000;
  let calls = 0;
  const failed = (url: string): SourceCheck => ({ ok: false, url, problem: 'fetch_failed', message: 'The source did not answer in time.' });
  const s = await start(deps({ now: () => t, checkSource: async url => (calls++, url.includes('down') ? failed(url) : okCheck(url)) }));
  try {
    await s.request('GET', q('https://example.com/down'));
    t += 4_000;
    await s.request('GET', q('https://example.com/down'));
    assert.equal(calls, 1, 'reused within 5 s');
    t += 2_000;
    await s.request('GET', q('https://example.com/down'));
    assert.equal(calls, 2, 'checked again after 5 s');

    await s.request('GET', q('https://example.com/up'));
    t += 59_000;
    await s.request('GET', q('https://example.com/up'));
    assert.equal(calls, 3, 'a passed check is reused for 60 s');
  } finally {
    await s.close();
  }
});

test('a fifth check in flight answers 429', { timeout: 5000 }, async () => {
  let started = 0;
  let release!: () => void;
  const gate = new Promise<void>(r => (release = r));
  const s = await start(deps({ checkSource: async url => (started++, await gate, okCheck(url)) }));
  const from = (i: number) => ({ 'x-forwarded-for': `203.0.113.${i}` });
  try {
    const first = [1, 2, 3, 4].map(i => s.request('GET', q(`https://example.com/${i}`), from(i)));
    while (started < 4) await new Promise(r => setTimeout(r, 5));
    const fifth = await s.request('GET', q('https://example.com/5'), from(5));
    assert.equal(fifth.status, 429);
    release();
    assert.deepEqual((await Promise.all(first)).map(r => r.status), [200, 200, 200, 200]);
  } finally {
    await s.close();
  }
});

test('one client gets at most 2 checks in flight; another client still gets one', { timeout: 5000 }, async () => {
  let started = 0;
  let release!: () => void;
  const gate = new Promise<void>(r => (release = r));
  const s = await start(deps({ checkSource: async url => (started++, await gate, okCheck(url)) }));
  const a = { 'x-forwarded-for': '203.0.113.7' };
  const b = { 'x-forwarded-for': '198.51.100.9' };
  try {
    const mine = [1, 2].map(i => s.request('GET', q(`https://example.com/a${i}`), a));
    while (started < 2) await new Promise(r => setTimeout(r, 5));
    const third = await s.request('GET', q('https://example.com/a3'), a);
    assert.equal(third.status, 429);
    assert.match(JSON.parse(third.body).error, /earlier checks/);
    const other = s.request('GET', q('https://example.com/b1'), b);
    while (started < 3) await new Promise(r => setTimeout(r, 5));
    release();
    assert.deepEqual((await Promise.all([...mine, other])).map(r => r.status), [200, 200, 200]);
  } finally {
    await s.close();
  }
});

test('POST /draft answers 503 when AI drafting is not set up', async () => {
  const s = await start(deps());
  try {
    const r = await s.request('POST', '/draft', { 'content-type': 'application/json' }, JSON.stringify({ idea: 'Will it rain?' }));
    assert.equal(r.status, 503);
    assert.equal(JSON.parse(r.body).error, 'AI drafting is not set up');
  } finally {
    await s.close();
  }
});

test('a body over 4 KB answers 413', async () => {
  const s = await start(deps({ draft: async () => ({}) }));
  try {
    const r = await s.request('POST', '/draft', { 'content-type': 'application/json' }, JSON.stringify({ idea: 'x'.repeat(5000) }));
    assert.equal(r.status, 413);
  } finally {
    await s.close();
  }
});

test('an error that carries a status answers with it', async () => {
  const declined = Object.assign(new Error('The model declined this request.'), { status: 422 });
  const s = await start(deps({ review: async () => { throw declined; } }));
  try {
    const r = await s.request('POST', '/review', { 'content-type': 'application/json' }, '{}');
    assert.equal(r.status, 422);
    assert.equal(JSON.parse(r.body).error, 'The model declined this request.');
  } finally {
    await s.close();
  }
});

test('other paths are not handled', async () => {
  const s = await start(deps());
  try {
    const r = await s.request('GET', '/health');
    assert.equal(r.status, 404);
    assert.equal(r.body, 'not mine');
  } finally {
    await s.close();
  }
});
