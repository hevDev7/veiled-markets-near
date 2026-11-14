// The shared source reader: what the AI resolver and the source check fetch, and how. Every connection goes to the
// address that passed the private-address check. Run: npx tsx --test src/source-reader.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  defaultReaderDeps,
  fetchSource,
  limitLookups,
  pinnedLookup,
  readSource,
  SOURCE_BYTES,
  SourceFetchError,
  type ReaderDeps,
} from './source-reader';

async function serve(handler: http.RequestListener): Promise<{ port: number; close(): Promise<void> }> {
  const server = http.createServer(handler);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    port,
    close: () => new Promise<void>(resolve => {
      server.closeAllConnections();
      server.close(() => resolve());
    }),
  };
}

/** Deps that let a test reach its own server on 127.0.0.1 under a made-up host name. */
const local = (): ReaderDeps => ({ resolveHost: async () => ['127.0.0.1'], allowAddress: ip => ip === '127.0.0.1' });

const call = (look: ReturnType<typeof pinnedLookup>, host: string, options: object) =>
  new Promise<unknown[]>(resolve => look(host, options, (...args: unknown[]) => resolve(args)));

test('pinnedLookup answers only the vetted host, in both callback forms', async () => {
  const look = pinnedLookup('example.test', ['93.184.216.34']);
  assert.deepEqual(await call(look, 'example.test', {}), [null, '93.184.216.34', 4]);
  assert.deepEqual(await call(look, 'example.test', { all: true }), [null, [{ address: '93.184.216.34', family: 4 }]]);
  const other = await call(look, 'other.test', {});
  assert.ok(other[0] instanceof Error);
});

test('fetchSource refuses a host that resolves to a private address', async () => {
  const deps: ReaderDeps = { resolveHost: async () => ['10.0.0.5'], allowAddress: defaultReaderDeps.allowAddress };
  await assert.rejects(
    fetchSource(new URL('http://intranet.test/'), deps),
    (e: unknown) => e instanceof SourceFetchError && e.problem === 'private_address',
  );
});

test('fetchSource connects to the address it vetted, without a second lookup', async () => {
  let seenHost = '';
  const srv = await serve((req, res) => {
    seenHost = String(req.headers.host);
    res.end('hello world');
  });
  try {
    let lookups = 0;
    const deps: ReaderDeps = {
      resolveHost: async () => (++lookups === 1 ? ['127.0.0.1'] : ['10.9.9.9']),
      allowAddress: ip => ip === '127.0.0.1',
    };
    const r = await fetchSource(new URL(`http://rebind.test:${srv.port}/`), deps);
    assert.equal(r.status, 200);
    assert.equal(r.body.toString('utf8'), 'hello world');
    assert.equal(lookups, 1);
    assert.equal(seenHost, `rebind.test:${srv.port}`);
  } finally {
    await srv.close();
  }
});

test('fetchSource refuses a redirect to a disallowed URL', async () => {
  const srv = await serve((_req, res) => {
    res.writeHead(302, { location: 'http://localhost/x' });
    res.end();
  });
  try {
    await assert.rejects(
      fetchSource(new URL(`http://hop.test:${srv.port}/`), local()),
      (e: unknown) => e instanceof SourceFetchError && e.problem === 'fetch_failed' && /redirects/.test(e.message),
    );
  } finally {
    await srv.close();
  }
});

test('fetchSource refuses a redirect to an IPv6 literal that carries a private IPv4 address', async () => {
  const srv = await serve((_req, res) => {
    res.writeHead(302, { location: 'http://[::ffff:127.0.0.1]/' });
    res.end();
  });
  try {
    await assert.rejects(
      fetchSource(new URL(`http://hop.test:${srv.port}/`), local()),
      (e: unknown) => e instanceof SourceFetchError && /redirects somewhere it may not be fetched/.test(e.message),
    );
  } finally {
    await srv.close();
  }
});

test('fetchSource gives up at its deadline when DNS does not answer', { timeout: 3000 }, async () => {
  const deps: ReaderDeps = { resolveHost: () => new Promise<string[]>(() => {}), allowAddress: () => true };
  const t0 = Date.now();
  await assert.rejects(
    fetchSource(new URL('http://slow-dns.test/'), deps, 0, Date.now() + 50),
    (e: unknown) => e instanceof SourceFetchError && e.problem === 'fetch_failed' && /in time/.test(e.message),
  );
  assert.ok(Date.now() - t0 < 1000, `took ${Date.now() - t0} ms`);
});

test('fetchSource gives up at its deadline when the server does not answer', { timeout: 3000 }, async () => {
  const srv = await serve(() => {}); // accepts the request and never answers
  try {
    const t0 = Date.now();
    await assert.rejects(
      fetchSource(new URL(`http://stall.test:${srv.port}/`), local(), 0, Date.now() + 100),
      (e: unknown) => e instanceof SourceFetchError && e.problem === 'fetch_failed' && /in time/.test(e.message),
    );
    assert.ok(Date.now() - t0 < 1500, `took ${Date.now() - t0} ms`);
  } finally {
    await srv.close();
  }
});

test('limitLookups refuses a lookup while two are still pending, even after their callers gave up', async () => {
  const pending: Array<(a: string[]) => void> = [];
  const resolveHost = limitLookups(() => new Promise<string[]>(r => pending.push(r)), 2);
  const first = resolveHost('a.test');
  const second = resolveHost('b.test');
  await assert.rejects(resolveHost('c.test'), (e: unknown) => e instanceof SourceFetchError && e.problem === 'fetch_failed');
  pending[0](['93.184.216.34']);
  assert.deepEqual(await first, ['93.184.216.34']);
  const third = resolveHost('c.test');
  pending[1](['1.1.1.1']);
  pending[2](['8.8.8.8']);
  assert.deepEqual(await Promise.all([second, third]), [['1.1.1.1'], ['8.8.8.8']]);
});

test('fetchSource stops reading at 1 MB', async () => {
  const srv = await serve((_req, res) => res.end(Buffer.alloc(1_500_000, 97)));
  try {
    const r = await fetchSource(new URL(`http://big.test:${srv.port}/`), local());
    assert.ok(r.body.length > 0 && r.body.length <= SOURCE_BYTES, `read ${r.body.length} bytes`);
  } finally {
    await srv.close();
  }
});

test('readSource gives the page text, and no text for HTTP 404', async () => {
  const page = async (url: URL) => ({ final: url, status: 200, body: Buffer.from('<p>Hi <b>there</b></p><script>x()</script>') });
  const ok = await readSource('https://example.com/page', defaultReaderDeps, page);
  assert.equal(ok.sourceText, 'Hi there');
  assert.equal(ok.source?.status, 200);

  const missing = async (url: URL) => ({ final: url, status: 404, body: Buffer.from('<h1>Not found</h1>') });
  const r = await readSource('https://example.com/missing', defaultReaderDeps, missing);
  assert.equal(r.sourceText, null);
  assert.equal(r.source?.error, 'HTTP 404');
});

test('readSource gives nothing for a source that is not a URL', async () => {
  assert.deepEqual(await readSource('CoinGecko API'), { source: null, sourceText: null });
});
