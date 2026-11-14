// The create page's calls to the AI resolver service (backend/src/market-ai-http.ts). A failed check is an answer;
// a service that cannot answer is CheckServiceUnavailable, whose message the page shows as is while Next stays locked.
// AI drafting and review (backend/src/market-ai.ts) fail as AiUnavailable, and the page then offers the other ways.
import { AI_RESOLVER_URL } from '../near/config';

export type CheckProblem = 'not_a_url' | 'private_address' | 'fetch_failed' | 'http_error' | 'too_little_text' | 'unexpected_shape';

/** The resolver's answer to "can you read this source?" (backend/src/source-check.ts). */
export interface SourceCheck {
  ok: boolean;
  url: string;
  final_url?: string;
  status?: number;
  bytes?: number;
  chars?: number;
  excerpt?: string;
  checked_with?: string;
  problem?: CheckProblem;
  message: string;
}

export class CheckServiceUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CheckServiceUnavailable';
  }
}

const CHECK_TIMEOUT_MS = 30_000;
const TOO_SLOW = 'The source check took more than 30 seconds. Try again in a minute.';

/** A failed check worth repeating as is: the source did not answer, or answered with an error status. */
export function canRetryCheck(r: SourceCheck): boolean {
  return !r.ok && (r.problem === 'fetch_failed' || r.problem === 'http_error');
}

/**
 * fetch, ending in a Response or an error. Scripts that some browser extensions inject wrap fetch, and one seen on
 * 2026-11-14 resolves with undefined instead of rejecting when the service is down: that is a network error too.
 */
async function fetchResponse(input: string, init: RequestInit): Promise<Response> {
  const res: unknown = await fetch(input, init);
  if (typeof res !== 'object' || res === null || typeof (res as { status?: unknown }).status !== 'number') {
    throw new TypeError('Failed to fetch: no response.');
  }
  return res as Response;
}

/** `p`, or an AbortError as soon as `signal` aborts. */
function untilAborted<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new DOMException('The check was stopped.', 'AbortError'));
    if (signal.aborted) return abort();
    signal.addEventListener('abort', abort, { once: true });
    p.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

/**
 * Asks the resolver whether it can read `url`. A caller's abort rejects with an AbortError. The 30-second limit covers
 * the whole answer, body included.
 */
export async function checkSourceRemote(url: string, signal?: AbortSignal): Promise<SourceCheck> {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  try {
    let res: Response;
    try {
      res = await fetchResponse(`${AI_RESOLVER_URL}/check-source?url=${encodeURIComponent(url)}`, { signal: controller.signal });
    } catch (e) {
      if (signal?.aborted) throw e;
      throw new CheckServiceUnavailable(
        controller.signal.aborted ? TOO_SLOW : 'The source check service cannot be reached, so the source cannot be checked. Try again in a minute.',
      );
    }
    let body: (Partial<SourceCheck> & { error?: string }) | null;
    try {
      body = (await untilAborted(res.json(), controller.signal)) as Partial<SourceCheck> & { error?: string };
    } catch (e) {
      if (signal?.aborted) throw e;
      if (controller.signal.aborted) throw new CheckServiceUnavailable(TOO_SLOW);
      body = null;
    }
    return answerOf(res, body);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

function answerOf(res: Response, body: (Partial<SourceCheck> & { error?: string }) | null): SourceCheck {
  if (res.status === 429) {
    throw new CheckServiceUnavailable(typeof body?.error === 'string' ? body.error : 'Too many checks; try again in a minute.');
  }
  if (!res.ok) {
    throw new CheckServiceUnavailable(`The source check service answered HTTP ${res.status}. Try again in a minute.`);
  }
  if (!body || typeof body.ok !== 'boolean' || typeof body.message !== 'string') {
    throw new CheckServiceUnavailable('The source check service gave an answer this page cannot read. Try again in a minute.');
  }
  return body as SourceCheck;
}

// ── AI drafting and review ─────────────────────────────────────────────────────────────────────────────────────────

/** A draft market from POST /draft. Times are ISO 8601 in UTC. */
export interface MarketDraft {
  question: string;
  rules: string;
  source: string;
  category: number;
  closes_at: string;
  resolution_deadline_at: string;
}

export interface DraftResult {
  draft: MarketDraft;
  /** The resolver's check of the draft's source; the page will not publish it until a check passes. */
  source_check: SourceCheck;
  /** What the AI assumed, and the failed check, if any. */
  warnings: string[];
}

export type ReviewRequest = Omit<MarketDraft, 'category'>;

export interface ReviewScores {
  clarity: number;
  verifiability: number;
  time_bounds: number;
  source_quality: number;
}

/** POST /review's answer. `ready` comes from the server: every score is at least 7. */
export interface MarketReview {
  scores: ReviewScores;
  critiques: string[];
  ready: boolean;
}

/** The service refused the request itself (400): something in the market or the idea needs fixing first. */
export class AiBadRequest extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiBadRequest';
  }
}

/**
 * The AI could not draft or review: not set up on the service (503), over a limit (429), failed or unreachable (502,
 * another error, a network error, a timeout), or declined the request (422). A 400 is AiBadRequest instead.
 */
export class AiUnavailable extends Error {
  readonly reason: 'not_set_up' | 'limit' | 'failed' | 'declined';
  constructor(reason: AiUnavailable['reason'], message: string) {
    super(message);
    this.name = 'AiUnavailable';
    this.reason = reason;
  }
}

/** A draft can take two model calls and two source checks; a review reads the source and makes one call. */
const DRAFT_TIMEOUT_MS = 180_000;
const REVIEW_TIMEOUT_MS = 120_000;
const UNREADABLE = 'The AI service gave an answer this page cannot read. Try again in a minute.';

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === 'string';

async function postAi(path: '/draft' | '/review', body: unknown, timeoutMs: number, signal?: AbortSignal): Promise<unknown> {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const tooSlow = `The AI took more than ${timeoutMs / 60_000} minutes to answer. Try again, or use a template.`;
  try {
    let res: Response;
    try {
      res = await fetchResponse(`${AI_RESOLVER_URL}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (e) {
      if (signal?.aborted) throw e;
      throw new AiUnavailable('failed', controller.signal.aborted ? tooSlow : 'The AI service cannot be reached. Try again in a minute, or use a template.');
    }
    let answer: unknown = null;
    try {
      answer = await untilAborted(res.json(), controller.signal);
    } catch (e) {
      if (signal?.aborted) throw e;
      if (controller.signal.aborted) throw new AiUnavailable('failed', tooSlow);
    }
    const error = isRecord(answer) && isText(answer.error) ? answer.error : null;
    if (res.status === 503) throw new AiUnavailable('not_set_up', 'AI drafting is not set up on this site yet.');
    if (res.status === 429) throw new AiUnavailable('limit', error ?? 'Too many AI requests. Try again later, or use a template.');
    if (res.status === 422) throw new AiUnavailable('declined', 'The AI declined this request. Try another idea, or use a template.');
    if (res.status === 400) throw new AiBadRequest(error ?? 'The AI service could not use this request. Check the question, rules, source and times.');
    if (!res.ok) {
      const said = res.status === 502 && error ? error : `The AI service answered HTTP ${res.status}. Try again in a minute.`;
      throw new AiUnavailable('failed', said);
    }
    return answer;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

function asDraftResult(v: unknown): DraftResult | null {
  if (!isRecord(v) || !isRecord(v.draft) || !isRecord(v.source_check)) return null;
  const d = v.draft;
  const c = v.source_check;
  if (![d.question, d.rules, d.source, d.closes_at, d.resolution_deadline_at].every(isText) || typeof d.category !== 'number') return null;
  if (typeof c.ok !== 'boolean' || !isText(c.url) || !isText(c.message)) return null;
  return {
    draft: d as unknown as MarketDraft,
    source_check: c as unknown as SourceCheck,
    warnings: Array.isArray(v.warnings) ? v.warnings.filter(isText) : [],
  };
}

function asReview(v: unknown): MarketReview | null {
  if (!isRecord(v) || !isRecord(v.scores) || !Array.isArray(v.critiques) || typeof v.ready !== 'boolean') return null;
  const s = v.scores;
  if (![s.clarity, s.verifiability, s.time_bounds, s.source_quality].every((n) => typeof n === 'number')) return null;
  return {
    scores: { clarity: s.clarity as number, verifiability: s.verifiability as number, time_bounds: s.time_bounds as number, source_quality: s.source_quality as number },
    critiques: v.critiques.filter(isText),
    ready: v.ready,
  };
}

/** Asks the AI to turn an idea into a Yes/No market. */
export async function requestDraft(idea: string, category?: number, signal?: AbortSignal): Promise<DraftResult> {
  const result = asDraftResult(await postAi('/draft', category === undefined ? { idea } : { idea, category }, DRAFT_TIMEOUT_MS, signal));
  if (!result) throw new AiUnavailable('failed', UNREADABLE);
  return result;
}

/** Asks the AI to score a market before it is published. */
export async function requestReview(input: ReviewRequest, signal?: AbortSignal): Promise<MarketReview> {
  const review = asReview(await postAi('/review', input, REVIEW_TIMEOUT_MS, signal));
  if (!review) throw new AiUnavailable('failed', UNREADABLE);
  return review;
}

/** Whether the service has AI drafting set up: its /health names the model, or says "off". False when unreachable. */
export async function draftingAvailable(signal?: AbortSignal): Promise<boolean> {
  try {
    const res = await fetch(`${AI_RESOLVER_URL}/health`, { signal: signal ?? AbortSignal.timeout(8_000) });
    if (!res.ok) return false;
    const body: unknown = await res.json();
    return isRecord(body) && isText(body.drafting) && body.drafting !== 'off';
  } catch {
    return false;
  }
}
