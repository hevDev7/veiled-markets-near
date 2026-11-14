// Data APIs the AI resolver is known to read well (checked with its own reader on 2026-11-13), and how to check one
// before a market uses it. For a future date these APIs show nothing yet (Coinbase answers HTTP 400 "Start cannot be in
// the future", Nasdaq an empty table, Frankfurter an earlier date), so the source check fetches a probe instead: the
// same API for a recent past date, and it checks the shape of that answer. The AI review reads the same probe.
export type CatalogId = 'coinbase-candles' | 'nasdaq-historical' | 'frankfurter-rate';

export interface CatalogProbe {
  id: CatalogId;
  /** The same API for a recent past date. */
  url: URL;
  /** Whether the probe's answer has the shape a market on this API needs. */
  accepts(body: string): boolean;
  /** What the probe looks for, for messages: "a 1-minute candle". */
  what: string;
}

const DAY_MS = 86_400_000;
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function json(body: string): any {
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

function withQuery(base: string, query: Record<string, string>): URL {
  const url = new URL(base);
  url.search = new URLSearchParams(query).toString();
  return url;
}

export function catalogProbe(url: URL, now: Date): CatalogProbe | null {
  const host = url.hostname.toLowerCase();
  const t = now.getTime();

  if (host === 'api.exchange.coinbase.com') {
    const product = url.pathname.match(/^\/products\/([a-z0-9]+-usd)\/candles\/?$/i)?.[1];
    if (!product || url.searchParams.get('granularity') !== '60') return null;
    const start = Math.floor((t - DAY_MS) / 60_000) * 60;
    const end = start + 600;
    return {
      id: 'coinbase-candles',
      url: withQuery(`https://api.exchange.coinbase.com/products/${product}/candles`, { granularity: '60', start: String(start), end: String(end) }),
      what: 'a 1-minute candle',
      accepts: body => {
        const candles = json(body);
        return (
          Array.isArray(candles) &&
          candles.length > 0 &&
          candles.every(c => Array.isArray(c) && c.length === 6 && c.every(n => typeof n === 'number' && Number.isFinite(n))) &&
          candles.some(c => c[0] >= start && c[0] <= end)
        );
      },
    };
  }

  if (host === 'api.nasdaq.com') {
    const symbol = url.pathname.match(/^\/api\/quote\/([a-z.\-]+)\/historical\/?$/i)?.[1];
    if (!symbol) return null;
    return {
      id: 'nasdaq-historical',
      url: withQuery(`https://api.nasdaq.com/api/quote/${symbol}/historical`, {
        assetclass: url.searchParams.get('assetclass') || 'stocks',
        fromdate: ymd(t - 10 * DAY_MS),
        todate: ymd(t - DAY_MS),
        limit: '10',
      }),
      what: 'a daily closing price',
      accepts: body => {
        const rows = json(body)?.data?.tradesTable?.rows;
        return Array.isArray(rows) && rows.some(r => /^\d{2}\/\d{2}\/\d{4}$/.test(String(r?.date ?? '')) && /\d/.test(String(r?.close ?? '')));
      },
    };
  }

  if (host === 'api.frankfurter.dev') {
    const from = url.searchParams.get('from') ?? '';
    const to = url.searchParams.get('to') ?? '';
    if (!/^\/v1\/\d{4}-\d{2}-\d{2}\/?$/.test(url.pathname) || !/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) return null;
    return {
      id: 'frankfurter-rate',
      url: withQuery(`https://api.frankfurter.dev/v1/${ymd(t - 7 * DAY_MS)}`, { from, to }),
      what: `a ${from}/${to} reference rate`,
      accepts: body => {
        const j = json(body);
        return typeof j?.rates?.[to] === 'number' && Number.isFinite(j.rates[to]) && /^\d{4}-\d{2}-\d{2}$/.test(String(j?.date ?? ''));
      },
    };
  }

  return null;
}
