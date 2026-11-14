// The create page's calls to the AI resolver service (backend/src/market-ai-http.ts). A failed check is an answer;
// a service that cannot answer is CheckServiceUnavailable, whose message the page shows as is while Next stays locked.
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
      res = await fetch(`${AI_RESOLVER_URL}/check-source?url=${encodeURIComponent(url)}`, { signal: controller.signal });
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
