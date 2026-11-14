// Can the AI resolver read this resolution source? Used by /check-source (the create page) and by
// `quick-market.ts open`, with the resolver's own reader, so a market only gets a source the resolver can use.
//
// A catalog API (source-catalog.ts) is checked with a probe for a past date and must answer in the expected shape.
// Any other URL must answer below HTTP 400 with at least 200 characters of text. Passing does not prove the deciding
// value will appear: the AI review judges that.
import { sourceUrl } from './ai-resolver-core';
import { catalogProbe } from './source-catalog';
import { fetchSource, SourceFetchError, sourceTextOf } from './source-reader';

export type CheckProblem = 'not_a_url' | 'private_address' | 'fetch_failed' | 'http_error' | 'too_little_text' | 'unexpected_shape';

export interface SourceCheck {
  ok: boolean;
  url: string;
  final_url?: string;
  status?: number;
  bytes?: number;
  chars?: number;
  /** The first 2,000 characters of what the model would be given. */
  excerpt?: string;
  /** The probe URL, when a catalog API was checked with a past date. */
  checked_with?: string;
  problem?: CheckProblem;
  message: string;
}

export const MIN_TEXT_CHARS = 200;
const EXCERPT_CHARS = 2_000;

const sentence = (s: string) => `${s.charAt(0).toUpperCase()}${s.slice(1)}${/[.!?]$/.test(s) ? '' : '.'}`;

export async function checkSource(input: string, opts: { now?: Date; fetch?: typeof fetchSource } = {}): Promise<SourceCheck> {
  const text = input.trim();
  const url = sourceUrl(text);
  if (!url) {
    return {
      ok: false,
      url: text,
      problem: 'not_a_url',
      message: 'Enter one http or https link the resolver can open: a public host on the default port, with no user name or password.',
    };
  }
  const probe = catalogProbe(url, opts.now ?? new Date());
  const checked_with = probe?.url.toString();
  let res: { final: URL; status: number; body: Buffer };
  try {
    res = await (opts.fetch ?? fetchSource)(probe?.url ?? url);
  } catch (e) {
    const problem = e instanceof SourceFetchError ? e.problem : 'fetch_failed';
    return { ok: false, url: text, checked_with, problem, message: sentence((e as Error).message || 'the source could not be fetched') };
  }
  const sourceText = sourceTextOf(res.body);
  const base = {
    url: text,
    final_url: res.final.toString(),
    status: res.status,
    bytes: res.body.length,
    chars: sourceText.length,
    excerpt: sourceText.slice(0, EXCERPT_CHARS),
    ...(checked_with ? { checked_with } : {}),
  };
  if (res.status >= 400) {
    return { ...base, ok: false, problem: 'http_error', message: `The source answered HTTP ${res.status}, so the resolver would get no text from it.` };
  }
  if (probe) {
    if (!probe.accepts(res.body.toString('utf8'))) {
      return {
        ...base,
        ok: false,
        problem: 'unexpected_shape',
        message: `Checked with a past date, the answer did not hold ${probe.what}. Check the product, symbol or currencies in the link.`,
      };
    }
    return { ...base, ok: true, message: `A known data source. Checked with a past date, the answer holds ${probe.what}, which the resolver will need.` };
  }
  if (sourceText.length < MIN_TEXT_CHARS) {
    return {
      ...base,
      ok: false,
      problem: 'too_little_text',
      message:
        `The page gives only ${sourceText.length} characters of text. It is probably filled in by JavaScript, which the resolver ` +
        'does not run. Use a page or API that shows the data in its HTML or JSON.',
    };
  }
  return {
    ...base,
    ok: true,
    message: `The resolver can read this page (${sourceText.length} characters of text). Check below that it will show the value that decides the market.`,
  };
}
