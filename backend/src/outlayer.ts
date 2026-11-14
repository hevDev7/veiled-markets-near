// ============================================================================
// OutLayer (https://outlayer.ai) runs a published WASI build inside an Intel TDX TEE and is paid per call from a
// payment key. The AI resolver can read a market's resolution source there instead of on its own server. The call's
// attestation then names the build that ran and the SHA-256 of what it was asked and of what it answered, so a reader
// can check the source in a receipt against OutLayer's record of the call rather than this server's word
// (backend/README.md, "Reading sources in OutLayer", lists the checks and what they leave to the operator).
//
// The client (callProject) follows OutLayer's API reference (https://api.outlayer.ai/openapi.json):
// - POST /call/{owner}/{project} {input, async: true[, version_key]} with X-Payment-Key (and X-Compute-Limit when
//   set). The call is always async: a synchronous call that outruns the server's window is settled as failed (408)
//   and charged, and must not be sent again.
// - GET /calls/{call_id} every 2 s until the run completed or failed, for at most 2 minutes. A failed poll is
//   simply polled again: polling runs nothing.
// - A 503 (upstream_unavailable, keystore_error) is answered before anything is queued. The call is sent again after
//   its Retry-After (at most 60 s; 5 s when the header is absent), at most 3 times. Every other refusal, and a
//   request that got no answer, ends the call for this pass: the call may have run, /call takes no idempotency key,
//   and a resend could run and charge it twice. The resolver tries the market again on a later pass.
//
// The source-reader build (readSourceInOutLayer) is the owner's to write and publish (backend/README.md, "Reading
// sources in OutLayer").
// - Input: {url, max_bytes, max_chars, max_redirects, timeout_ms, total_ms, user_agent}, the limits source-reader.ts
//   reads with.
// - Output: {bytes, final_url, sha256, status, text}, written as compact JSON with its keys in that (sorted) order,
//   non-ASCII unescaped and no trailing newline (so JSON.stringify of the answer is the bytes written): the body's
//   size and SHA-256 (hex), the address after redirects, the HTTP status, and the body's text by htmlToText's rules
//   (ai-resolver-core.ts), cut to max_chars UTF-16 code units. Or {error} when the source could not be read.
// - The model is given that text. The receipt keeps the call's input and output as OutLayer returned them, and
//   OutLayer's attestation for the call names the build that ran and the SHA-256 of both, so a reader can check that
//   the text the model saw is what that build answered for that input. A call without an attestation link is refused.
// ============================================================================

import { sourceUrl } from './ai-resolver-core';
import {
  MAX_REDIRECTS,
  SOURCE_BYTES,
  SOURCE_CHARS,
  SOURCE_UA,
  TIMEOUT_MS,
  TOTAL_MS,
  type OutLayerRead,
  type Source,
} from './source-reader';

export const OUTLAYER_APIS = { mainnet: 'https://api.outlayer.ai', testnet: 'https://testnet-api.outlayer.ai' } as const;

const POLL_EVERY_MS = 2000;
const WAIT_MS = 120_000;
const RESENDS = 3;
const RETRY_AFTER_DEFAULT_MS = 5000;
const RETRY_AFTER_MAX_MS = 60_000;
const REQUEST_TIMEOUT_MS = 30_000;
const CALL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACCOUNT = /^(?=.{2,64}$)(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;
const NAME = /^[A-Za-z0-9._-]{1,128}$/;

export interface OutLayerConfig {
  /** OutLayer's API, e.g. https://testnet-api.outlayer.ai (no trailing slash). */
  api: string;
  /** <owner account>/<project name>. */
  project: string;
  /** <owner>:<nonce>:<secret>, from OutLayer's dashboard. */
  paymentKey: string;
  /** A published version to run instead of the project's active one. */
  versionKey?: string;
  /** The most one call may spend on compute, in USD micro-units (X-Compute-Limit). */
  computeLimit?: string;
}

export interface OutLayerCall {
  call_id: string;
  output: Record<string, unknown>;
  attestation_url: string | null;
  compute_cost: string | null;
  time_ms: number | null;
}

export class OutLayerError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly reason?: string,
    readonly terminal?: boolean,
    readonly callId?: string,
  ) {
    super(message);
    this.name = 'OutLayerError';
  }
}

export interface CallDeps {
  fetch: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  /** How long to poll a call before giving up on it (120 s). */
  waitMs?: number;
}

/** OutLayer's API on the network of `contract` (an account ending in .testnet is on testnet), unless one is named. */
export function outlayerApi(contract: string, override?: string): string {
  if (override) return override.replace(/\/+$/, '');
  return contract.endsWith('.testnet') ? OUTLAYER_APIS.testnet : OUTLAYER_APIS.mainnet;
}

/** What is wrong with a configuration, naming its environment variable; null when nothing is. Never shows the key. */
export function outlayerConfigProblem(c: OutLayerConfig): string | null {
  let api: URL | null = null;
  try {
    api = new URL(c.api);
  } catch {
    api = null;
  }
  if (!api || api.protocol !== 'https:') return 'OUTLAYER_API must be an https:// address';
  const [owner, name, ...rest] = c.project.split('/');
  if (rest.length || !ACCOUNT.test(owner ?? '') || !NAME.test(name ?? '')) {
    return 'OUTLAYER_PROJECT must be <owner account>/<project name>';
  }
  const key = c.paymentKey.match(/^([^:\s]+):(\d+):(\S+)$/);
  if (!key || !ACCOUNT.test(key[1])) return 'OUTLAYER_PAYMENT_KEY must be <owner>:<nonce>:<secret>';
  if (c.versionKey !== undefined && !NAME.test(c.versionKey)) {
    return 'OUTLAYER_VERSION must be a published version key (letters, digits, . _ -)';
  }
  if (c.computeLimit !== undefined && !/^\d{1,20}$/.test(c.computeLimit)) {
    return 'OUTLAYER_COMPUTE_LIMIT must be a whole number of USD micro-units';
  }
  return null;
}

/**
 * The OutLayer configuration in `env`: null when neither OUTLAYER_PROJECT nor OUTLAYER_PAYMENT_KEY is set (sources are
 * read on this server); otherwise the configuration, or the problem with it. A problem must stop the resolver from
 * reading sources, never send it back to reading them itself.
 */
export function outlayerFromEnv(
  env: Record<string, string | undefined>,
  contract: string,
): { config: OutLayerConfig } | { problem: string } | null {
  const project = env.OUTLAYER_PROJECT?.trim() ?? '';
  const paymentKey = env.OUTLAYER_PAYMENT_KEY?.trim() ?? '';
  if (!project && !paymentKey) return null;
  if (!paymentKey) return { problem: 'OUTLAYER_PROJECT is set without OUTLAYER_PAYMENT_KEY' };
  if (!project) return { problem: 'OUTLAYER_PAYMENT_KEY is set without OUTLAYER_PROJECT' };
  const config: OutLayerConfig = { api: outlayerApi(contract, env.OUTLAYER_API?.trim() || undefined), project, paymentKey };
  const versionKey = env.OUTLAYER_VERSION?.trim();
  if (versionKey) config.versionKey = versionKey;
  const computeLimit = env.OUTLAYER_COMPUTE_LIMIT?.trim();
  if (computeLimit) config.computeLimit = computeLimit;
  const problem = outlayerConfigProblem(config);
  return problem ? { problem } : { config };
}

type Answer = Record<string, unknown>;

/** The payment key's secret is never kept in an error: the resolver publishes its notes at /receipts. */
function redact(text: string, config: OutLayerConfig): string {
  const secret = config.paymentKey.split(':').slice(2).join(':');
  let out = text.split(config.paymentKey).join('<payment key>');
  if (secret) out = out.split(secret).join('<secret>');
  return out;
}

async function refusal(res: Response, config: OutLayerConfig): Promise<OutLayerError> {
  const text = await res.text().catch(() => '');
  let j: Answer | null = null;
  try {
    j = JSON.parse(text);
  } catch {
    j = null;
  }
  const reason = typeof j?.reason === 'string' ? j.reason : undefined;
  const terminal = typeof j?.terminal === 'boolean' ? j.terminal : undefined;
  const sentence = typeof j?.error === 'string' ? j.error : text.trim().slice(0, 200) || 'no reason given';
  const callId = typeof j?.call_id === 'string' && CALL_ID.test(j.call_id) ? j.call_id : undefined;
  const message = redact(`OutLayer refused the call (${res.status}${reason ? ` ${reason}` : ''}): ${sentence}`, config);
  return new OutLayerError(message.slice(0, 300), res.status, reason, terminal, callId);
}

/** A JSON object, or null. */
async function objectOf(res: Response): Promise<Answer | null> {
  try {
    const j = JSON.parse(await res.text());
    return j && typeof j === 'object' && !Array.isArray(j) ? (j as Answer) : null;
  } catch {
    return null;
  }
}

function retryAfterMs(header: string | null, nowMs: number): number {
  const h = header?.trim();
  if (h) {
    const ms = /^\d+$/.test(h) ? Number(h) * 1000 : Date.parse(h) - nowMs;
    if (Number.isFinite(ms)) return Math.min(RETRY_AFTER_MAX_MS, Math.max(1000, ms));
  }
  return RETRY_AFTER_DEFAULT_MS;
}

function httpsOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  try {
    return new URL(v).protocol === 'https:' ? v : null;
  } catch {
    return null;
  }
}

/** Runs the project with `input` and waits for its answer. Nothing is sent twice that may already have run. */
export async function callProject(config: OutLayerConfig, input: Record<string, unknown>, deps: CallDeps): Promise<OutLayerCall> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)));
  const now = deps.now ?? Date.now;
  const waitMs = deps.waitMs ?? WAIT_MS;
  const auth = { accept: 'application/json', 'x-payment-key': config.paymentKey };
  const headers: Record<string, string> = { ...auth, 'content-type': 'application/json' };
  if (config.computeLimit) headers['x-compute-limit'] = config.computeLimit;
  const body = JSON.stringify({ input, async: true, ...(config.versionKey ? { version_key: config.versionKey } : {}) });
  const [owner, name] = config.project.split('/');
  const callUrl = `${config.api}/call/${encodeURIComponent(owner ?? '')}/${encodeURIComponent(name ?? '')}`;

  let state: Answer | null = null;
  for (let resend = 0; !state; resend++) {
    let res: Response;
    try {
      res = await deps.fetch(callUrl, { method: 'POST', headers, body, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (e) {
      throw new OutLayerError(
        redact(`OutLayer could not be reached (${(e as Error).message}); the call is not sent again, since it may have run`, config),
      );
    }
    if (res.status === 503 && resend < RESENDS) {
      await sleep(retryAfterMs(res.headers.get('retry-after'), now()));
      continue;
    }
    if (!res.ok) throw await refusal(res, config);
    state = await objectOf(res);
    if (!state) throw new OutLayerError(`OutLayer answered HTTP ${res.status} with something that is not a call`);
  }

  const callId = state.call_id;
  if (typeof callId !== 'string' || !CALL_ID.test(callId)) throw new OutLayerError('OutLayer answered without a call id');
  const failed = (message: string) => new OutLayerError(message, undefined, undefined, undefined, callId);
  const deadline = now() + waitMs;
  while (state.status === 'pending') {
    if (now() >= deadline) {
      throw failed(`OutLayer call ${callId} is still running after ${Math.round(waitMs / 1000)} s (it may still finish, and be charged)`);
    }
    await sleep(POLL_EVERY_MS);
    let res: Response;
    try {
      res = await deps.fetch(`${config.api}/calls/${callId}`, { headers: auth, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch {
      continue; // no answer: poll again
    }
    if (res.status === 401 || res.status === 403 || res.status === 404) throw await refusal(res, config);
    if (!res.ok) continue; // rate-limited or a server error: poll again
    const polled = await objectOf(res);
    if (!polled) continue;
    if (polled.call_id !== undefined && polled.call_id !== callId) {
      throw failed(`OutLayer answered another call when asked for ${callId}`);
    }
    state = polled;
  }

  if (state.status === 'failed') {
    throw failed(redact(`OutLayer call ${callId} failed: ${String(state.error ?? 'no reason given').slice(0, 200)}`, config));
  }
  if (state.status !== 'completed') throw failed(`OutLayer call ${callId} is in an unknown state (${String(state.status).slice(0, 40)})`);
  const output = state.output;
  if (!output || typeof output !== 'object' || Array.isArray(output)) {
    throw failed(`OutLayer call ${callId} completed without an output object`);
  }
  return {
    call_id: callId,
    output: output as Answer,
    attestation_url: httpsOrNull(state.attestation_url),
    compute_cost: typeof state.compute_cost === 'string' ? state.compute_cost : null,
    time_ms: typeof state.time_ms === 'number' ? state.time_ms : null,
  };
}

/**
 * Reads a market's resolution source inside OutLayer: a record like readSource's, with the call that read it, and the
 * text the build made. A source the build could not read is recorded like the local reader's failures. A refusal, a
 * failed call or an answer that breaks the build's contract throws, so the market is tried again rather than judged
 * without its source.
 */
export async function readSourceInOutLayer(
  text: string,
  config: OutLayerConfig,
  deps: CallDeps,
): Promise<{ source: Source | null; sourceText: string | null }> {
  const url = sourceUrl(text);
  if (!url) return { source: null, sourceText: null };
  const fetched_at = new Date((deps.now ?? Date.now)()).toISOString();
  const input = {
    url: url.toString(),
    max_bytes: SOURCE_BYTES,
    max_chars: SOURCE_CHARS,
    max_redirects: MAX_REDIRECTS,
    timeout_ms: TIMEOUT_MS,
    total_ms: TOTAL_MS,
    user_agent: SOURCE_UA,
  };
  const call = await callProject(config, input, deps);
  // A read nobody can check is not recorded as read in a TEE: the market is tried again on a later pass.
  if (!call.attestation_url) {
    throw new OutLayerError(`OutLayer gave no attestation for call ${call.call_id}, so its read cannot be checked`, undefined, undefined, undefined, call.call_id);
  }
  const out = call.output;
  const outlayer: OutLayerRead = {
    api: config.api,
    project: config.project,
    ...(config.versionKey ? { version_key: config.versionKey } : {}),
    call_id: call.call_id,
    attestation_url: call.attestation_url,
    compute_cost: call.compute_cost,
    time_ms: call.time_ms,
    input,
    output: out,
  };
  if (typeof out.error === 'string') {
    return { source: { url: url.toString(), fetched_at, error: out.error.slice(0, 300), outlayer }, sourceText: null };
  }
  const bad = (why: string) =>
    new OutLayerError(`OutLayer's source reader answered ${why} (call ${call.call_id})`, undefined, undefined, undefined, call.call_id);
  const { bytes, final_url, sha256, status, text: pageText } = out;
  if ([bytes, final_url, sha256, status, pageText].includes(undefined)) throw bad('in an unknown shape');
  if (typeof pageText !== 'string' || pageText.length > SOURCE_CHARS) throw bad(`text that is not a string of at most ${SOURCE_CHARS} characters`);
  if (typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(sha256)) throw bad('a hash that is not a SHA-256 in hex');
  if (typeof bytes !== 'number' || !Number.isInteger(bytes) || bytes < 0 || bytes > SOURCE_BYTES) {
    throw bad(`a size that is not a byte count up to ${SOURCE_BYTES}`);
  }
  if (typeof status !== 'number' || !Number.isInteger(status) || status < 100 || status > 599) throw bad('a status that is not an HTTP status');
  const final = typeof final_url === 'string' ? sourceUrl(final_url) : null;
  if (!final) throw bad('a final address that may not be read');
  const source: Source = { url: url.toString(), final_url: final.toString(), status, sha256, bytes, fetched_at, outlayer };
  if (status >= 400) return { source: { ...source, error: `HTTP ${status}` }, sourceText: null };
  return { source, sourceText: pageText };
}
