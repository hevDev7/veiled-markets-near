// The create page's call to the resolver's source check. If the service cannot answer, the page must say so and
// keep Next locked: checkSourceRemote throws CheckServiceUnavailable, never hangs or returns a guess.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AI_RESOLVER_URL } from '../near/config';
import {
  AiBadRequest,
  AiUnavailable,
  canRetryCheck,
  CheckServiceUnavailable,
  checkSourceRemote,
  draftingAvailable,
  requestDraft,
  requestReview,
  type DraftResult,
  type MarketReview,
  type ReviewRequest,
  type SourceCheck,
} from './market-ai-client';

const SOURCE = 'https://api.frankfurter.dev/v1/2026-11-20?from=USD&to=IDR';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('checkSourceRemote', () => {
  it("checkSourceRemote returns the service's answer", async () => {
    const answer: SourceCheck = { ok: true, url: SOURCE, checked_with: SOURCE, excerpt: '{"amount":1.0}', message: 'A known data source.' };
    const fetchMock = vi.fn(async () => json(answer));
    vi.stubGlobal('fetch', fetchMock);
    await expect(checkSourceRemote(SOURCE)).resolves.toEqual(answer);
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toBe(`${AI_RESOLVER_URL}/check-source?url=${encodeURIComponent(SOURCE)}`);
  });

  it('a failed check is an answer, not an outage', async () => {
    const answer: SourceCheck = { ok: false, url: 'https://www.spacex.com/launches/', problem: 'too_little_text', chars: 6, message: 'The page gives only 6 characters of text.' };
    vi.stubGlobal('fetch', vi.fn(async () => json(answer)));
    await expect(checkSourceRemote(answer.url)).resolves.toEqual(answer);
  });

  it('checkSourceRemote throws CheckServiceUnavailable when the service cannot be reached or answers 5xx', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(checkSourceRemote(SOURCE)).rejects.toBeInstanceOf(CheckServiceUnavailable);

    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'bad gateway' }, 502)));
    await expect(checkSourceRemote(SOURCE)).rejects.toBeInstanceOf(CheckServiceUnavailable);

    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'Too many checks; try again in a minute.' }, 429)));
    await expect(checkSourceRemote(SOURCE)).rejects.toThrow('Too many checks; try again in a minute.');

    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>proxy error</html>', { status: 200 })));
    await expect(checkSourceRemote(SOURCE)).rejects.toBeInstanceOf(CheckServiceUnavailable);
  });

  it('a body that never finishes ends as CheckServiceUnavailable after 30 s', async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal('fetch', vi.fn(async () => ({ status: 200, ok: true, json: () => new Promise(() => {}) }) as unknown as Response));
      const outcome = checkSourceRemote(SOURCE).then(() => 'answered', (e: unknown) => e);
      await vi.advanceTimersByTimeAsync(30_000);
      const settled = await Promise.race([outcome, Promise.resolve('still waiting')]);
      expect(settled).toBeInstanceOf(CheckServiceUnavailable);
      expect((settled as Error).message).toMatch(/30 seconds/);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a caller's abort during the body read passes through as an abort", async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ status: 200, ok: true, json: () => new Promise(() => {}) }) as unknown as Response));
    const controller = new AbortController();
    const pending = checkSourceRemote(SOURCE, controller.signal);
    await new Promise(r => setTimeout(r, 0));
    controller.abort();
    const settled = await Promise.race([pending.then(() => 'answered', (e: unknown) => e), new Promise(r => setTimeout(() => r('still waiting'), 50))]);
    expect(settled).toMatchObject({ name: 'AbortError' });
  });

  it('canRetryCheck offers a retry only when the source may answer next time', () => {
    const base = { ok: false, url: SOURCE, message: 'x' };
    expect(canRetryCheck({ ...base, problem: 'fetch_failed' })).toBe(true);
    expect(canRetryCheck({ ...base, problem: 'http_error', status: 503 })).toBe(true);
    expect(canRetryCheck({ ...base, problem: 'too_little_text' })).toBe(false);
    expect(canRetryCheck({ ...base, problem: 'private_address' })).toBe(false);
    expect(canRetryCheck({ ok: true, url: SOURCE, message: 'fine' })).toBe(false);
  });

  it("a caller's abort passes through as an abort", async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    })));
    const controller = new AbortController();
    const pending = checkSourceRemote(SOURCE, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('AI drafting and review', () => {
  const SOURCE_URL = 'https://api.exchange.coinbase.com/products/ETH-USD/candles?granularity=60&start=1795176000&end=1795176600';
  const draftResult: DraftResult = {
    draft: {
      question: 'Will ETH trade above $4,000 at 12:00 UTC on Friday, 20 November 2026?',
      rules: 'This market will resolve to "Yes" if the opening price … is above $4,000. Otherwise, this market will resolve to "No."',
      source: SOURCE_URL,
      category: 3,
      closes_at: '2026-11-20T12:00:00.000Z',
      resolution_deadline_at: '2026-11-27T12:00:00.000Z',
    },
    source_check: { ok: true, url: SOURCE_URL, message: 'A known data source.' },
    warnings: ['The idea named no time, so the market uses 12:00 UTC.'],
  };
  const reviewInput: ReviewRequest = {
    question: draftResult.draft.question,
    rules: draftResult.draft.rules,
    source: SOURCE_URL,
    closes_at: draftResult.draft.closes_at,
    resolution_deadline_at: draftResult.draft.resolution_deadline_at,
  };
  const IDEA = 'ETH above 4000 next Friday at noon?';

  it('requestDraft posts the idea and returns the draft', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json(draftResult));
    vi.stubGlobal('fetch', fetchMock);
    await expect(requestDraft(IDEA, 3)).resolves.toEqual(draftResult);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${AI_RESOLVER_URL}/draft`);
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('content-type')).toBe('application/json');
    expect(JSON.parse(String(init?.body))).toEqual({ idea: IDEA, category: 3 });
    await requestDraft(IDEA);
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({ idea: IDEA });
  });

  it('requestReview posts the market and returns the scores', async () => {
    const review: MarketReview = { scores: { clarity: 9, verifiability: 10, time_bounds: 8, source_quality: 9 }, critiques: [], ready: true };
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json(review));
    vi.stubGlobal('fetch', fetchMock);
    await expect(requestReview(reviewInput)).resolves.toEqual(review);
    expect(fetchMock.mock.calls[0][0]).toBe(`${AI_RESOLVER_URL}/review`);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual(reviewInput);
  });

  it('each error status maps to its AiUnavailable reason', async () => {
    const cases: [() => Promise<Response>, AiUnavailable['reason'], RegExp?][] = [
      [async () => json({ error: 'AI drafting is not set up' }, 503), 'not_set_up'],
      [async () => json({ error: 'You have used your AI calls for this hour. Try again later, or use a template.', scope: 'client' }, 429), 'limit', /used your AI calls for this hour/],
      [async () => json({ error: 'The AI service failed; try again.' }, 502), 'failed'],
      [async () => json({ error: 'The model declined this request.' }, 422), 'declined'],
      [async () => json({ error: 'Internal error.' }, 500), 'failed'],
      [async () => { throw new TypeError('Failed to fetch'); }, 'failed'],
      [async () => new Response('<html>proxy error</html>', { status: 200 }), 'failed'],
      [async () => json({ draft: null, warnings: [] }), 'failed'],
    ];
    for (const [answer, reason, message] of cases) {
      vi.stubGlobal('fetch', vi.fn(answer));
      const e = await requestDraft(IDEA).then(() => null, (err: unknown) => err);
      expect(e, reason).toBeInstanceOf(AiUnavailable);
      expect((e as AiUnavailable).reason).toBe(reason);
      expect((e as Error).message.length).toBeGreaterThan(10);
      if (message) expect((e as Error).message).toMatch(message);
    }
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'The model declined this request.' }, 422)));
    await expect(requestReview(reviewInput)).rejects.toMatchObject({ reason: 'declined' });
    vi.stubGlobal('fetch', vi.fn(async () => json({ scores: { clarity: 9 }, critiques: [], ready: true })));
    await expect(requestReview(reviewInput)).rejects.toMatchObject({ reason: 'failed' });
  });

  it('a fetch that resolves with no Response counts as the network error it is', async () => {
    // Seen 2026-11-14 in Chrome: a script a browser extension injects wraps fetch and, when the service is down,
    // resolves with undefined instead of rejecting.
    vi.stubGlobal('fetch', vi.fn(async () => undefined));
    const e = await requestReview(reviewInput).then(() => null, (err: unknown) => err);
    expect(e).toBeInstanceOf(AiUnavailable);
    expect((e as AiUnavailable).reason).toBe('failed');
    expect((e as Error).message).toMatch(/cannot be reached/);
    await expect(checkSourceRemote(SOURCE)).rejects.toBeInstanceOf(CheckServiceUnavailable);
  });

  it('a 400 is AiBadRequest with the service\'s reason: something to fix, not the AI being unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'rules must be non-empty text.' }, 400)));
    const e = await requestReview({ ...reviewInput, rules: '' }).then(() => null, (err: unknown) => err);
    expect(e).toBeInstanceOf(AiBadRequest);
    expect(e).not.toBeInstanceOf(AiUnavailable);
    expect((e as Error).message).toBe('rules must be non-empty text.');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Bad Request', { status: 400 })));
    await expect(requestDraft(IDEA)).rejects.toThrow(/could not use this request/);
  });

  it('a draft that takes more than 3 minutes ends as AiUnavailable failed', async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      })));
      const outcome = requestDraft(IDEA).then(() => 'answered', (e: unknown) => e);
      await vi.advanceTimersByTimeAsync(180_000);
      const settled = await Promise.race([outcome, Promise.resolve('still waiting')]);
      expect(settled).toBeInstanceOf(AiUnavailable);
      expect((settled as AiUnavailable).reason).toBe('failed');
      expect((settled as Error).message).toMatch(/3 minutes/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('draftingAvailable is true only when /health names a model', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json({ ok: true, drafting: 'claude-opus-5-5' }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(draftingAvailable()).resolves.toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe(`${AI_RESOLVER_URL}/health`);
    for (const answer of [
      async () => json({ ok: true, drafting: 'off' }),
      async () => json({ ok: true }),
      async () => json({ error: 'down' }, 502),
      async () => { throw new TypeError('Failed to fetch'); },
    ]) {
      vi.stubGlobal('fetch', vi.fn(answer));
      await expect(draftingAvailable()).resolves.toBe(false);
    }
  });
});
