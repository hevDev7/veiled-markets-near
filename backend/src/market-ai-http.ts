// The create page's endpoints on the AI resolver service:
//   GET  /check-source?url=…   can the resolver read this source? (source-check.ts)
//   POST /draft, POST /review  AI drafting and review with the owner's Anthropic key (market-ai.ts; 503 until set up)
// CORS answers the app's origins only. Every response is JSON, and no error escapes: an unhandled rejection would stop
// the resolver's voting loop. Errors map by class: a bad body 400, a model refusal 422, a model failure 502, else 500.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { InvalidRequest, ModelFailure, ModelRefusal, parseDraftRequest, parseReviewRequest, type ReviewInput } from './market-ai';
import type { RateLimiter } from './rate-limit';
import type { SourceCheck } from './source-check';

export interface RouteDeps {
  checkSource(url: string): Promise<SourceCheck>;
  /** Absent until AI drafting is set up: the endpoint then answers 503. */
  draft?(input: { idea: string; category?: number }): Promise<unknown>;
  review?(input: ReviewInput): Promise<unknown>;
  origins: string[];
  checkLimiter: RateLimiter;
  aiLimiter: RateLimiter;
  now?(): number;
}

const PATHS = new Set(['/check-source', '/draft', '/review']);
const CACHE_MS = 60_000;
/** A failed check may be passing in a moment (a slow or briefly broken site), so the creator can retry soon. */
const FAILED_CACHE_MS = 5_000;
const CACHE_MAX = 500;
const MAX_IN_FLIGHT = 4;
const MAX_IN_FLIGHT_PER_CLIENT = 2;
const MAX_BODY = 4096;

/** The caller's address: the last X-Forwarded-For entry is the one Railway's proxy added. */
export function clientOf(req: IncomingMessage): string {
  const header = req.headers['x-forwarded-for'];
  const hops = (Array.isArray(header) ? header.join(',') : header ?? '').split(',').map(s => s.trim()).filter(Boolean);
  return hops[hops.length - 1] ?? req.socket.remoteAddress ?? 'unknown';
}

/** Reads a request body up to `max` bytes; null when it is larger. */
function readBody(req: IncomingMessage, max: number): Promise<string | null> {
  if (Number(req.headers['content-length'] ?? 0) > max) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > max) {
        req.pause();
        resolve(null);
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export function marketAiRoutes(deps: RouteDeps): (req: IncomingMessage, res: ServerResponse) => Promise<boolean> {
  const cache = new Map<string, { at: number; result: SourceCheck }>();
  let inFlight = 0;
  const inFlightBy = new Map<string, number>();
  const now = () => (deps.now ? deps.now() : Date.now());

  return async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (!PATHS.has(url.pathname)) return false;
    const origin = req.headers.origin;
    const cors: Record<string, string> = origin && deps.origins.includes(origin) ? { 'access-control-allow-origin': origin, vary: 'origin' } : {};
    const send = (status: number, body: unknown, extra: Record<string, string> = {}) => {
      if (res.headersSent) return;
      res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors, ...extra });
      res.end(JSON.stringify(body));
    };

    try {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          ...cors,
          'access-control-allow-methods': 'GET, POST, OPTIONS',
          'access-control-allow-headers': 'content-type',
          'access-control-max-age': '600',
        });
        res.end();
        return true;
      }

      if (url.pathname === '/check-source') {
        if (req.method !== 'GET') return send(405, { error: 'Use GET.' }), true;
        const target = (url.searchParams.get('url') ?? '').trim();
        if (!target) return send(400, { error: 'Give the source as ?url=…' }), true;
        const client = clientOf(req);
        const limit = deps.checkLimiter.take(client);
        if (!limit.ok) return send(429, { error: 'Too many checks; try again in a minute.' }, { 'retry-after': String(limit.retryAfterSec) }), true;
        const hit = cache.get(target);
        if (hit && now() - hit.at < (hit.result.ok ? CACHE_MS : FAILED_CACHE_MS)) return send(200, hit.result), true;
        const mine = inFlightBy.get(client) ?? 0;
        if (mine >= MAX_IN_FLIGHT_PER_CLIENT) return send(429, { error: 'Your earlier checks are still running; try again in a few seconds.' }), true;
        if (inFlight >= MAX_IN_FLIGHT) return send(429, { error: 'Too many checks at once; try again in a few seconds.' }), true;
        inFlight++;
        inFlightBy.set(client, mine + 1);
        try {
          const result = await deps.checkSource(target);
          cache.set(target, { at: now(), result });
          if (cache.size > CACHE_MAX) {
            for (const [key, entry] of cache) if (now() - entry.at >= CACHE_MS || cache.size > CACHE_MAX) cache.delete(key);
          }
          send(200, result);
        } finally {
          inFlight--;
          const left = (inFlightBy.get(client) ?? 1) - 1;
          if (left > 0) inFlightBy.set(client, left);
          else inFlightBy.delete(client);
        }
        return true;
      }

      // POST /draft and POST /review
      if (req.method !== 'POST') return send(405, { error: 'Use POST.' }), true;
      const raw = await readBody(req, MAX_BODY);
      if (raw === null) return send(413, { error: 'The request is larger than 4 KB.' }, { connection: 'close' }), true;
      let body: unknown;
      try {
        body = JSON.parse(raw);
      } catch {
        return send(400, { error: 'The request body is not JSON.' }), true;
      }
      // A body the endpoint cannot use is refused (InvalidRequest → 400) before it costs one of the client's AI calls.
      let run: (() => Promise<unknown>) | null = null;
      if (url.pathname === '/draft' && deps.draft) {
        const draft = deps.draft;
        const input = parseDraftRequest(body);
        run = () => draft(input);
      } else if (url.pathname === '/review' && deps.review) {
        const review = deps.review;
        const input = parseReviewRequest(body);
        run = () => review(input);
      }
      if (!run) return send(503, { error: 'AI drafting is not set up' }), true;
      const limit = deps.aiLimiter.take(clientOf(req));
      if (!limit.ok) {
        const error = limit.scope === 'global'
          ? "Today's AI budget is used up. Try again after midnight UTC, or use a template."
          : 'You have used your AI calls for this hour. Try again later, or use a template.';
        return send(429, { error, scope: limit.scope }, { 'retry-after': String(limit.retryAfterSec) }), true;
      }
      send(200, await run());
      return true;
    } catch (e) {
      if (e instanceof InvalidRequest) send(400, { error: e.message });
      else if (e instanceof ModelRefusal) send(422, { error: 'The model declined this request.' });
      else if (e instanceof ModelFailure) {
        send(502, { error: 'The AI service failed; try again.' });
        console.warn('[market-ai] model failure:', e.message);
      } else {
        send(500, { error: 'Internal error.' });
        console.warn('[market-ai]', (e as Error)?.message);
      }
      return true;
    }
  };
}
