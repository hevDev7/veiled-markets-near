// How Veiled Markets reads a market's resolution source. The AI resolver reads it this way at resolution, and the
// source check (/check-source) reads it the same way before a market is created, so both see the same text.
//
// - http or https on the default ports only (sourceUrl), and every hop's host must resolve to public addresses only;
// - the connection goes to exactly the addresses that passed that check: there is no second DNS lookup, so a host
//   cannot switch to a private address between the check and the connection;
// - at most 3 redirects, 10 seconds a request and 15 seconds for the whole read (DNS included), 1 MB; the model gets
//   htmlToText of the body, first 20,000 characters.
import { lookup } from 'node:dns/promises';
import { isIP, type LookupFunction } from 'node:net';
import { Agent, fetch } from 'undici';
import { htmlToText, isPrivateAddress, sha256Hex, sourceUrl } from './ai-resolver-core';

export const SOURCE_CHARS = 20_000;
export const SOURCE_BYTES = 1_000_000;
export const SOURCE_UA = 'VeiledMarkets-AIResolver/1.0';
const TIMEOUT_MS = 10_000;
export const TOTAL_MS = 15_000;
const MAX_REDIRECTS = 3;

export type ResolveHost = (host: string) => Promise<string[]>;

export interface ReaderDeps {
  resolveHost: ResolveHost;
  allowAddress(ip: string): boolean;
}

export const defaultReaderDeps: ReaderDeps = {
  resolveHost: async host => (await lookup(host, { all: true })).map(a => a.address),
  allowAddress: ip => !isPrivateAddress(ip),
};

export class SourceFetchError extends Error {
  constructor(readonly problem: 'private_address' | 'fetch_failed', message: string) {
    super(message);
    this.name = 'SourceFetchError';
  }
}

/**
 * At most `max` lookups of `resolveHost` pending at once, counted until each one settles, even after its caller gave
 * up at the deadline. dns.lookup runs on libuv's small thread pool, which the voting loop needs too, so the public
 * source check must not be able to fill it with lookups of hosts whose DNS never answers.
 */
export function limitLookups(resolveHost: ResolveHost, max: number): ResolveHost {
  let pending = 0;
  return async host => {
    if (pending >= max) throw new SourceFetchError('fetch_failed', 'too many sources are being looked up right now; try again in a few seconds');
    pending++;
    try {
      return await resolveHost(host);
    } finally {
      pending--;
    }
  };
}

/** A `lookup` for net/tls.connect that answers only `host`, and only with the addresses already vetted for it. */
export function pinnedLookup(host: string, addresses: string[]): LookupFunction {
  const want = host.replace(/^\[|\]$/g, '').toLowerCase();
  const all = addresses.map(address => ({ address, family: isIP(address) }));
  return (hostname, options, callback) => {
    const notFound = (why: string) => callback(Object.assign(new Error(why), { code: 'ENOTFOUND' }), '', 0);
    if (hostname.replace(/^\[|\]$/g, '').toLowerCase() !== want) return notFound(`not a vetted host: ${hostname}`);
    const f = options?.family;
    const family = f === 'IPv4' ? 4 : f === 'IPv6' ? 6 : Number(f) || 0;
    const usable = family ? all.filter(a => a.family === family) : all;
    if (!usable.length) return notFound(`no IPv${family} address vetted for ${hostname}`);
    if (options?.all) return callback(null, usable);
    callback(null, usable[0].address, usable[0].family);
  };
}

const TOO_SLOW = `the source did not answer in time (${TIMEOUT_MS / 1000} seconds a request, ${TOTAL_MS / 1000} in all)`;

function describe(e: unknown): string {
  const err = e as { name?: string; message?: string; cause?: { code?: string; message?: string; name?: string } };
  if (err?.name === 'TimeoutError' || err?.cause?.name === 'TimeoutError') return TOO_SLOW;
  const why = err?.cause?.code ?? err?.cause?.message ?? err?.message ?? 'unknown error';
  return `the source could not be fetched (${why})`;
}

/** `p`, or a TOO_SLOW SourceFetchError once `deadline` (ms since the epoch) passes. `p` itself is not stopped. */
function beforeDeadline<T>(p: Promise<T>, deadline: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new SourceFetchError('fetch_failed', TOO_SLOW)), Math.max(0, deadline - Date.now()));
    p.then(
      value => (clearTimeout(timer), resolve(value)),
      error => (clearTimeout(timer), reject(error)),
    );
  });
}

/**
 * Fetches a public page: every hop's host must resolve to public addresses only; at most 3 redirects and 1 MB; each
 * request stops after 10 seconds and the whole read, DNS and redirects included, at `deadline`.
 */
export async function fetchSource(
  url: URL,
  deps: ReaderDeps = defaultReaderDeps,
  hops = 0,
  deadline = Date.now() + TOTAL_MS,
): Promise<{ final: URL; status: number; body: Buffer }> {
  if (Date.now() >= deadline) throw new SourceFetchError('fetch_failed', TOO_SLOW);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  let addresses: string[];
  if (isIP(host)) {
    addresses = [host];
  } else {
    try {
      addresses = await beforeDeadline(deps.resolveHost(host), deadline);
    } catch (e) {
      if (e instanceof SourceFetchError) throw e;
      throw new SourceFetchError('fetch_failed', `the source's host ${host} could not be found`);
    }
  }
  if (!addresses.length || addresses.some(a => !deps.allowAddress(a))) {
    throw new SourceFetchError('private_address', 'the source resolves to a private address');
  }
  const agent = new Agent({ connect: { lookup: pinnedLookup(host, addresses) } });
  try {
    let res: Awaited<ReturnType<typeof fetch>>;
    try {
      res = await fetch(url, {
        dispatcher: agent,
        redirect: 'manual',
        signal: AbortSignal.timeout(Math.max(1, Math.min(TIMEOUT_MS, deadline - Date.now()))),
        headers: { 'user-agent': SOURCE_UA, accept: 'text/html,text/plain,application/json;q=0.9,*/*;q=0.5' },
      });
    } catch (e) {
      throw new SourceFetchError('fetch_failed', describe(e));
    }
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      let next: URL | null = null;
      try {
        next = sourceUrl(new URL(location, url).toString());
      } catch {
        next = null;
      }
      if (!next || hops >= MAX_REDIRECTS) throw new SourceFetchError('fetch_failed', 'the source redirects somewhere it may not be fetched');
      return await fetchSource(next, deps, hops + 1, deadline);
    }
    const chunks: Buffer[] = [];
    let size = 0;
    try {
      for await (const chunk of res.body ?? []) {
        size += chunk.length;
        if (size > SOURCE_BYTES) break;
        chunks.push(Buffer.from(chunk));
      }
    } catch (e) {
      throw new SourceFetchError('fetch_failed', describe(e));
    }
    return { final: url, status: res.status, body: Buffer.concat(chunks) };
  } finally {
    agent.destroy().catch(() => {});
  }
}

export interface Source {
  url: string;
  final_url?: string;
  status?: number;
  sha256?: string;
  bytes?: number;
  fetched_at: string;
  error?: string;
}

/** The text the model is given: the body without markup, first 20,000 characters. */
export const sourceTextOf = (body: Buffer): string => htmlToText(body.toString('utf8')).slice(0, SOURCE_CHARS);

export async function readSource(
  text: string,
  deps: ReaderDeps = defaultReaderDeps,
  fetchImpl: typeof fetchSource = fetchSource,
): Promise<{ source: Source | null; sourceText: string | null }> {
  const url = sourceUrl(text);
  if (!url) return { source: null, sourceText: null };
  const fetched_at = new Date().toISOString();
  try {
    const { final, status, body } = await fetchImpl(url, deps);
    const source: Source = { url: url.toString(), final_url: final.toString(), status, sha256: sha256Hex(body), bytes: body.length, fetched_at };
    if (status >= 400) return { source: { ...source, error: `HTTP ${status}` }, sourceText: null };
    return { source, sourceText: sourceTextOf(body) };
  } catch (e) {
    return { source: { url: url.toString(), fetched_at, error: (e as Error).message }, sourceText: null };
  }
}
