// The AI resolver can read a market's resolution source inside OutLayer's TEE instead of on its own server. These
// tests run the OutLayer client and that reader against a stand-in for OutLayer's API: nothing is sent to OutLayer.
// Run: npx tsx --test src/outlayer.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  OUTLAYER_APIS,
  OutLayerError,
  callProject,
  outlayerApi,
  outlayerConfigProblem,
  outlayerFromEnv,
  readSourceInOutLayer,
  type OutLayerConfig,
} from './outlayer';
import { SOURCE_BYTES, SOURCE_CHARS, SOURCE_UA, sourceTextOf } from './source-reader';

const API = 'https://testnet-api.outlayer.ai';
const KEY = 'veiled.testnet:1:secret-part';
const CONFIG: OutLayerConfig = { api: API, project: 'veiled.testnet/source-reader', paymentKey: KEY };
const ID = '0f6c1a52-6f7e-4d47-9b1a-3c2d5e8f9a10';
const ATTESTATION = `${API}/attestations/by-call/${ID}`;

interface Sent {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

/** Stands in for OutLayer's API: answers in order; an Error is a request that never got an answer. */
function outlayer(...answers: Array<{ status: number; body?: unknown; headers?: Record<string, string> } | Error>) {
  const sent: Sent[] = [];
  const fetch = (async (url: string | URL, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => (headers[k] = v));
    sent.push({ url: String(url), method: init?.method ?? 'GET', headers, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const a = answers.shift();
    if (!a) throw new Error(`unexpected request ${init?.method ?? 'GET'} ${url}`);
    if (a instanceof Error) throw a;
    const text = typeof a.body === 'string' ? a.body : a.body === undefined ? '' : JSON.stringify(a.body);
    return new Response(text, { status: a.status, headers: a.headers });
  }) as typeof globalThis.fetch;
  return { fetch, sent };
}

/** A clock that only moves when the code under test sleeps. */
function clock() {
  let t = Date.parse('2026-11-20T10:00:00.000Z');
  const sleeps: number[] = [];
  return { now: () => t, sleep: async (ms: number) => void (sleeps.push(ms), (t += ms)), sleeps };
}

const pending = { status: 200, body: { call_id: ID, status: 'pending', poll_url: `${API}/calls/${ID}` } };
const done = (output: unknown = { ok: 1 }) => ({
  status: 200,
  body: { call_id: ID, status: 'completed', output, error: null, compute_cost: '1250', instructions: 9000, time_ms: 840, poll_url: null, attestation_url: ATTESTATION },
});

// ------------------------------------------------------------------ the client

test('sends the input as an async call with the payment key, then polls until the run completes', async () => {
  const api = outlayer(pending, { status: 200, body: { call_id: ID, status: 'pending' } }, done({ answer: 42 }));
  const c = clock();

  const call = await callProject(CONFIG, { url: 'https://example.com/' }, { fetch: api.fetch, ...c });

  assert.deepEqual(call, { call_id: ID, output: { answer: 42 }, attestation_url: ATTESTATION, compute_cost: '1250', time_ms: 840 });
  assert.equal(api.sent.length, 3);
  assert.equal(api.sent[0].method, 'POST');
  assert.equal(api.sent[0].url, `${API}/call/veiled.testnet/source-reader`);
  assert.equal(api.sent[0].headers['x-payment-key'], KEY);
  assert.equal(api.sent[0].headers['content-type'], 'application/json');
  assert.deepEqual(api.sent[0].body, { input: { url: 'https://example.com/' }, async: true });
  for (const poll of api.sent.slice(1)) {
    assert.equal(poll.method, 'GET');
    assert.equal(poll.url, `${API}/calls/${ID}`);
    assert.equal(poll.headers['x-payment-key'], KEY);
  }
  assert.deepEqual(c.sleeps, [2000, 2000]);
});

test('pins a published version and caps the compute when asked', async () => {
  const api = outlayer(done());
  await callProject({ ...CONFIG, versionKey: 'v1.2.0', computeLimit: '50000' }, { a: 1 }, { fetch: api.fetch, ...clock() });

  assert.deepEqual(api.sent[0].body, { input: { a: 1 }, async: true, version_key: 'v1.2.0' });
  assert.equal(api.sent[0].headers['x-compute-limit'], '50000');
});

test('takes a run that completed at once without polling', async () => {
  const api = outlayer(done());
  const c = clock();
  const call = await callProject(CONFIG, {}, { fetch: api.fetch, ...c });

  assert.deepEqual(call.output, { ok: 1 });
  assert.equal(api.sent.length, 1);
  assert.deepEqual(c.sleeps, []);
});

test('sends a call again after a 503 once its Retry-After has passed (at most 60 seconds)', async () => {
  const api = outlayer(
    { status: 503, body: { error: 'Try again shortly.', reason: 'upstream_unavailable' }, headers: { 'retry-after': '2' } },
    { status: 503, body: { error: 'Keystore unavailable.', reason: 'keystore_error' }, headers: { 'retry-after': '600' } },
    { status: 503, body: { error: 'Try again shortly.', reason: 'upstream_unavailable' } },
    done(),
  );
  const c = clock();

  const call = await callProject(CONFIG, {}, { fetch: api.fetch, ...c });

  assert.deepEqual(call.output, { ok: 1 });
  assert.equal(api.sent.filter(s => s.method === 'POST').length, 4);
  assert.deepEqual(c.sleeps, [2000, 60_000, 5000]);
});

test('gives up after three resends that all answer 503', async () => {
  const busy = { status: 503, body: { error: 'Try again shortly.', reason: 'upstream_unavailable' }, headers: { 'retry-after': '1' } };
  const api = outlayer(busy, busy, busy, busy);

  await assert.rejects(callProject(CONFIG, {}, { fetch: api.fetch, ...clock() }), (e: unknown) => {
    assert.ok(e instanceof OutLayerError);
    assert.equal(e.status, 503);
    assert.equal(e.reason, 'upstream_unavailable');
    return true;
  });
  assert.equal(api.sent.length, 4);
});

// Each of these may have run (and been charged) or can never succeed as sent: sending it again could run it twice.
for (const [what, answer, reason, terminal] of [
  ['a synchronous window that ran out (408)', { status: 408, body: { error: 'Timed out.', reason: 'timeout', call_id: ID } }, 'timeout', undefined],
  ['a call already in flight (429)', { status: 429, body: { error: 'One call at a time.', reason: 'call_already_in_flight', terminal: false } }, 'call_already_in_flight', false],
  ['the per-address limiter (bare 429)', { status: 429 }, undefined, undefined],
  ['a failure after queuing (500)', { status: 500, body: { error: 'Internal error.', reason: 'internal_error' } }, 'internal_error', undefined],
  ['an empty balance (402)', { status: 402, body: { error: 'Not enough balance.', reason: 'insufficient_balance', terminal: false } }, 'insufficient_balance', false],
  ['a spent trial (402)', { status: 402, body: { error: 'Trial used.', reason: 'trial_exhausted', terminal: true } }, 'trial_exhausted', true],
  ['no payment key (401)', { status: 401, body: { error: 'No key.', reason: 'missing_payment_key' } }, 'missing_payment_key', undefined],
  ['a body that is not JSON (plain 400)', { status: 400, body: 'Json deserialize error' }, undefined, undefined],
] as const) {
  test(`never sends a call again after ${what}`, async () => {
    const api = outlayer(answer, done());

    await assert.rejects(callProject(CONFIG, {}, { fetch: api.fetch, ...clock() }), (e: unknown) => {
      assert.ok(e instanceof OutLayerError, String(e));
      assert.equal(e.status, answer.status);
      assert.equal(e.reason, reason);
      assert.equal(e.terminal, terminal);
      assert.match(e.message, new RegExp(`OutLayer refused the call \\(${answer.status}`));
      return true;
    });
    assert.equal(api.sent.length, 1);
  });
}

test('never puts the payment key in an error, even when OutLayer quotes it back', async () => {
  const api = outlayer({ status: 400, body: { error: `Key ${KEY} is malformed.`, reason: 'bad_key_format' } });

  await assert.rejects(callProject(CONFIG, {}, { fetch: api.fetch, ...clock() }), (e: unknown) => {
    assert.ok(e instanceof OutLayerError);
    assert.ok(!e.message.includes('secret-part'), e.message);
    assert.match(e.message, /bad_key_format/);
    return true;
  });
});

test('keeps an attestation link only when it is an https address', async () => {
  const answer = done();
  const api = outlayer({ ...answer, body: { ...answer.body, attestation_url: 'javascript:alert(1)' } });
  const call = await callProject(CONFIG, {}, { fetch: api.fetch, ...clock() });
  assert.equal(call.attestation_url, null);
});

test('never sends a call again when the request got no answer', async () => {
  const api = outlayer(new TypeError('fetch failed'), done());

  await assert.rejects(callProject(CONFIG, {}, { fetch: api.fetch, ...clock() }), /OutLayer could not be reached/);
  assert.equal(api.sent.length, 1);
});

test('reports a run that failed, with its call id', async () => {
  const api = outlayer(pending, { status: 200, body: { call_id: ID, status: 'failed', error: 'wasm trap: out of fuel' } });

  await assert.rejects(callProject(CONFIG, {}, { fetch: api.fetch, ...clock() }), (e: unknown) => {
    assert.ok(e instanceof OutLayerError);
    assert.equal(e.callId, ID);
    assert.match(e.message, /failed: wasm trap: out of fuel/);
    return true;
  });
});

test('keeps polling through polls that fail', async () => {
  const api = outlayer(pending, new TypeError('fetch failed'), { status: 502, body: 'Bad gateway' }, { status: 429 }, done());

  const call = await callProject(CONFIG, {}, { fetch: api.fetch, ...clock() });

  assert.deepEqual(call.output, { ok: 1 });
  assert.equal(api.sent.length, 5);
});

test('stops polling after the wait, naming the call that may still finish', async () => {
  const still = { status: 200, body: { call_id: ID, status: 'pending' } };
  const api = outlayer(pending, still, still, still, still);
  const c = clock();

  await assert.rejects(callProject(CONFIG, {}, { fetch: api.fetch, ...c, waitMs: 6000 }), (e: unknown) => {
    assert.ok(e instanceof OutLayerError);
    assert.equal(e.callId, ID);
    assert.match(e.message, /still running after 6 s/);
    return true;
  });
  assert.deepEqual(c.sleeps, [2000, 2000, 2000]);
  assert.equal(api.sent.length, 4);
});

test('stops on a call OutLayer does not know', async () => {
  const api = outlayer(pending, { status: 404, body: { error: 'No such call.', reason: 'call_not_found' } });

  await assert.rejects(callProject(CONFIG, {}, { fetch: api.fetch, ...clock() }), (e: unknown) => {
    assert.ok(e instanceof OutLayerError);
    assert.equal(e.status, 404);
    assert.equal(e.reason, 'call_not_found');
    return true;
  });
});

test('refuses an answer that is not a call: no call id, a malformed one, another call, or no output', async () => {
  for (const answers of [
    [{ status: 200, body: { status: 'pending' } }],
    [{ status: 200, body: { call_id: '../wallet/v1/transfer', status: 'pending' } }],
    [{ status: 200, body: '<html>proxy</html>' }],
    [pending, { status: 200, body: { call_id: '11111111-2222-4333-8444-555555555555', status: 'completed', output: {} } }],
    [{ status: 200, body: { call_id: ID, status: 'completed', output: null } }],
    [{ status: 200, body: { call_id: ID, status: 'completed', output: ['not', 'an', 'object'] } }],
    [{ status: 200, body: { call_id: ID, status: 'queued' } }],
  ]) {
    const api = outlayer(...answers);
    await assert.rejects(callProject(CONFIG, {}, { fetch: api.fetch, ...clock() }), OutLayerError, JSON.stringify(answers));
    for (const s of api.sent) assert.ok(s.url === `${API}/call/veiled.testnet/source-reader` || s.url === `${API}/calls/${ID}`, s.url);
  }
});

// ------------------------------------------------------------------ configuration

test("OutLayer's API follows the contract's network unless one is named", () => {
  assert.equal(outlayerApi('v1.veiled-markets.testnet'), OUTLAYER_APIS.testnet);
  assert.equal(outlayerApi('veiled-markets.near'), OUTLAYER_APIS.mainnet);
  assert.equal(outlayerApi('v1.veiled-markets.testnet', 'https://api.outlayer.ai/'), 'https://api.outlayer.ai');
  assert.equal(OUTLAYER_APIS.testnet, 'https://testnet-api.outlayer.ai');
  assert.equal(OUTLAYER_APIS.mainnet, 'https://api.outlayer.ai');
});

test('names what is wrong with a configuration', () => {
  assert.equal(outlayerConfigProblem(CONFIG), null);
  assert.equal(outlayerConfigProblem({ ...CONFIG, versionKey: 'v1.2.0', computeLimit: '50000' }), null);
  for (const project of ['', 'source-reader', 'a/b/c', 'veiled.testnet/', '/source-reader', 'veiled.testnet/so urce']) {
    assert.match(outlayerConfigProblem({ ...CONFIG, project }) ?? '', /OUTLAYER_PROJECT/, project);
  }
  for (const paymentKey of ['', 'secret', 'owner:secret', 'owner:x:secret', 'owner:1:']) {
    assert.match(outlayerConfigProblem({ ...CONFIG, paymentKey }) ?? '', /OUTLAYER_PAYMENT_KEY/, paymentKey);
  }
  assert.match(outlayerConfigProblem({ ...CONFIG, versionKey: '../v1' }) ?? '', /OUTLAYER_VERSION/);
  assert.match(outlayerConfigProblem({ ...CONFIG, computeLimit: '5 USD' }) ?? '', /OUTLAYER_COMPUTE_LIMIT/);
  assert.match(outlayerConfigProblem({ ...CONFIG, api: 'http://testnet-api.outlayer.ai' }) ?? '', /OUTLAYER_API/);
});

test('reads the configuration from the environment, and never quietly falls back once asked', () => {
  const contract = 'v1.veiled-markets.testnet';
  assert.equal(outlayerFromEnv({}, contract), null);
  assert.deepEqual(outlayerFromEnv({ OUTLAYER_PROJECT: CONFIG.project, OUTLAYER_PAYMENT_KEY: KEY }, contract), {
    config: { api: OUTLAYER_APIS.testnet, project: CONFIG.project, paymentKey: KEY },
  });
  assert.deepEqual(
    outlayerFromEnv(
      { OUTLAYER_PROJECT: CONFIG.project, OUTLAYER_PAYMENT_KEY: KEY, OUTLAYER_API: 'https://api.outlayer.ai', OUTLAYER_VERSION: 'v3', OUTLAYER_COMPUTE_LIMIT: '90000' },
      contract,
    ),
    { config: { api: 'https://api.outlayer.ai', project: CONFIG.project, paymentKey: KEY, versionKey: 'v3', computeLimit: '90000' } },
  );
  assert.match((outlayerFromEnv({ OUTLAYER_PROJECT: CONFIG.project }, contract) as { problem: string }).problem, /OUTLAYER_PAYMENT_KEY/);
  assert.match((outlayerFromEnv({ OUTLAYER_PAYMENT_KEY: KEY }, contract) as { problem: string }).problem, /OUTLAYER_PROJECT/);
  const bad = outlayerFromEnv({ OUTLAYER_PROJECT: 'nope', OUTLAYER_PAYMENT_KEY: KEY }, contract) as { problem: string };
  assert.match(bad.problem, /OUTLAYER_PROJECT/);
  assert.ok(!bad.problem.includes(KEY), 'the problem never shows the payment key');
});


// ------------------------------------------------------------------ reading a source in OutLayer

const HTML = Buffer.from('<html><head><title>Result</title><style>p{}</style></head><body><h1>Final score</h1><p>Lakers 112 &ndash; Celtics 104</p></body></html>');
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
/** What the source-reader build answers for `body`, its keys in sorted order as the build writes them. */
const fetched = (body: Buffer, extra: Record<string, unknown> = {}) => ({
  bytes: body.length,
  final_url: 'https://www.example.com/scores/final',
  sha256: sha(body),
  status: 200,
  text: sourceTextOf(body),
  ...extra,
});
const INPUT = {
  url: 'https://example.com/scores',
  max_bytes: SOURCE_BYTES,
  max_chars: SOURCE_CHARS,
  max_redirects: 3,
  timeout_ms: 10_000,
  total_ms: 15_000,
  user_agent: SOURCE_UA,
};
const CALL = { api: API, project: CONFIG.project, call_id: ID, attestation_url: ATTESTATION, compute_cost: '1250', time_ms: 840 };

test('gives the model the text the build read inside OutLayer, and keeps the call so its attestation can be checked', async () => {
  const output = fetched(HTML);
  const api = outlayer(pending, done(output));

  const read = await readSourceInOutLayer('https://example.com/scores', CONFIG, { fetch: api.fetch, ...clock() });

  assert.deepEqual(api.sent[0].body, { input: INPUT, async: true });
  assert.equal(read.sourceText, output.text);
  assert.match(read.sourceText ?? '', /Lakers 112/);
  assert.deepEqual(read.source, {
    url: 'https://example.com/scores',
    final_url: 'https://www.example.com/scores/final',
    status: 200,
    sha256: sha(HTML),
    bytes: HTML.length,
    fetched_at: '2026-11-20T10:00:00.000Z',
    outlayer: { ...CALL, input: INPUT, output },
  });
  // OutLayer's attestation holds the SHA-256 of the input and of the output: the receipt keeps both as they were sent.
  assert.equal(JSON.stringify(read.source?.outlayer?.input), JSON.stringify((api.sent[0].body as { input: unknown }).input));
  assert.equal(JSON.stringify(read.source?.outlayer?.output), JSON.stringify(output));
});

test('records the pinned version with the read', async () => {
  const api = outlayer(done(fetched(HTML)));
  const read = await readSourceInOutLayer('https://example.com/scores', { ...CONFIG, versionKey: 'v1.2.0' }, { fetch: api.fetch, ...clock() });
  assert.equal(read.source?.outlayer?.version_key, 'v1.2.0');
});

test('an error page gives the model no text, as the local reader does', async () => {
  const api = outlayer(done(fetched(Buffer.from('Not found'), { status: 404 })));
  const read = await readSourceInOutLayer('https://example.com/scores', CONFIG, { fetch: api.fetch, ...clock() });

  assert.equal(read.sourceText, null);
  assert.equal(read.source?.error, 'HTTP 404');
  assert.equal(read.source?.outlayer?.call_id, ID);
});

test('a page without text gives the model empty text, as the local reader does', async () => {
  const api = outlayer(done(fetched(Buffer.from('<html><body><script>x()</script></body></html>'))));
  const read = await readSourceInOutLayer('https://example.com/scores', CONFIG, { fetch: api.fetch, ...clock() });

  assert.equal(read.sourceText, '');
  assert.equal(read.source?.error, undefined);
});

test('a source the build could not read is recorded with the call, not thrown', async () => {
  const output = { error: 'the source did not answer in time (10 seconds a request, 15 in all)' };
  const api = outlayer(done(output));
  const read = await readSourceInOutLayer('https://example.com/scores', CONFIG, { fetch: api.fetch, ...clock() });

  assert.equal(read.sourceText, null);
  assert.deepEqual(read.source, {
    url: 'https://example.com/scores',
    fetched_at: '2026-11-20T10:00:00.000Z',
    error: 'the source did not answer in time (10 seconds a request, 15 in all)',
    outlayer: { ...CALL, input: INPUT, output },
  });
});

test('sends nothing for a source that is not a public http(s) address', async () => {
  const api = outlayer();
  for (const text of ['ESPN box score', 'ftp://example.com/x', 'https://example.com:8443/x', '']) {
    assert.deepEqual(await readSourceInOutLayer(text, CONFIG, { fetch: api.fetch, ...clock() }), { source: null, sourceText: null });
  }
  assert.equal(api.sent.length, 0);
});

test("refuses a build's answer it cannot trust, so the market is tried again rather than judged on it", async () => {
  for (const [what, output] of [
    ['text over 20,000 characters', fetched(HTML, { text: 'a'.repeat(SOURCE_CHARS + 1) })],
    ['text that is not a string', fetched(HTML, { text: 42 })],
    ['a hash that is not SHA-256', fetched(HTML, { sha256: 'abc' })],
    ['a size over 1 MB', fetched(HTML, { bytes: SOURCE_BYTES + 1 })],
    ['a size that is not a byte count', fetched(HTML, { bytes: -1 })],
    ['a final address that is not http(s)', fetched(HTML, { final_url: 'file:///etc/passwd' })],
    ['a status that is not a number', fetched(HTML, { status: 'ok' })],
    ['a status outside HTTP', fetched(HTML, { status: 700 })],
    ['an unknown shape', { body_base64: HTML.toString('base64') }],
  ] as const) {
    const api = outlayer(done(output));
    await assert.rejects(
      readSourceInOutLayer('https://example.com/scores', CONFIG, { fetch: api.fetch, ...clock() }),
      (e: unknown) => e instanceof OutLayerError && /source reader/.test(e.message),
      what,
    );
  }
});

test('refuses a read OutLayer gave no attestation for, so no receipt rests on a read nobody can check', async () => {
  const unattested = (output: unknown, link: unknown) => {
    const answer = done(output);
    return { ...answer, body: { ...answer.body, attestation_url: link } };
  };
  for (const [what, answer] of [
    ['a page read without an attestation', unattested(fetched(HTML), null)],
    ['a page read whose attestation link is not https', unattested(fetched(HTML), 'javascript:alert(1)')],
    ['a failed read without an attestation', unattested({ error: 'the source did not answer in time' }, null)],
  ] as const) {
    const api = outlayer(answer);
    await assert.rejects(
      readSourceInOutLayer('https://example.com/scores', CONFIG, { fetch: api.fetch, ...clock() }),
      (e: unknown) => e instanceof OutLayerError && /attestation/.test(e.message) && e.callId === ID,
      what,
    );
  }
});

test('an OutLayer refusal stops the read, so the market is tried again rather than judged without its source', async () => {
  const api = outlayer({ status: 402, body: { error: 'Not enough balance.', reason: 'insufficient_balance', terminal: false } });
  await assert.rejects(
    readSourceInOutLayer('https://example.com/scores', CONFIG, { fetch: api.fetch, ...clock() }),
    (e: unknown) => e instanceof OutLayerError && e.reason === 'insufficient_balance',
  );
});
