// The create page's call to the resolver's source check. If the service cannot answer, the page must say so and
// keep Next locked: checkSourceRemote throws CheckServiceUnavailable, never hangs or returns a guess.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AI_RESOLVER_URL } from '../near/config';
import { canRetryCheck, CheckServiceUnavailable, checkSourceRemote, type SourceCheck } from './market-ai-client';

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
