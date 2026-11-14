// Market templates: a few fields give the question, the rules and a resolution source the AI resolver can read
// (the resolver's source catalog knows each of these URLs and checks them with a past date). Every market is
// Yes/No. Trading closes at the moment the deciding value exists; resolving may take up to 7 days after that.
// Every date here is UTC or New York time, never the browser's own zone.

export interface TemplateResult {
  question: string;
  rules: string;
  source: string;
  category: number;
  closesAt: Date;
  resolutionDeadlineAt: Date;
}

/** A field the template cannot use; the message tells the creator what to change. */
export class TemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TemplateError';
  }
}

export const CRYPTO_COINS = ['BTC', 'ETH', 'SOL', 'NEAR'] as const;
export const FX_CURRENCIES = [
  'USD', 'EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'CAD', 'CNY', 'HKD', 'SGD', 'KRW', 'INR', 'IDR', 'MXN', 'BRL', 'ZAR', 'SEK', 'NOK',
] as const;

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const MIN_LEAD_MS = 15 * MINUTE;
const RESOLVE_WITHIN_MS = 7 * DAY;

const NYSE_YEARS = new Set([2026, 2027]);
const NYSE_HOLIDAYS = new Set([
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
  '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31', '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24',
]);
/** Days the NYSE closes at 13:00 New York time: trading on the market stops then too, not three hours later. */
const NYSE_EARLY_CLOSES = new Set(['2026-11-27', '2026-12-24', '2027-11-26']);

// ------------------------------------------------------------------ dates

/** UTC midnight of a YYYY-MM-DD calendar day. */
function dayMs(date: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date ?? '').trim());
  if (!m) throw new TemplateError('Enter the date as YYYY-MM-DD.');
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ms = Date.UTC(y, mo - 1, d);
  const back = new Date(ms);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) {
    throw new TemplateError(`${m[0]} is not a calendar date.`);
  }
  return ms;
}

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const longDate = (ms: number) =>
  new Date(ms).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' });
const isWeekend = (ms: number) => [0, 6].includes(new Date(ms).getUTCDay());

/** Easter Sunday of a Gregorian year (the anonymous Gregorian algorithm), as YYYY-MM-DD. */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** NYSE full-day holidays for 2026 and 2027. */
export const isNyseHoliday = (date: string): boolean => NYSE_HOLIDAYS.has(date);

/** TARGET2 closing days, when the ECB publishes no euro reference rates. */
export function isTargetHoliday(date: string): boolean {
  const day = dayMs(date);
  const md = isoDay(day).slice(5);
  if (md === '01-01' || md === '05-01' || md === '12-25' || md === '12-26') return true;
  const easter = dayMs(easterSunday(new Date(day).getUTCFullYear()));
  return day === easter - 2 * DAY || day === easter + DAY;
}

const NY = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
});

/** New York's wall-clock reading at an instant, written as if it were UTC. */
function nyWallMs(instant: number): number {
  const p: Record<string, number> = {};
  for (const part of NY.formatToParts(new Date(instant))) if (part.type !== 'literal') p[part.type] = Number(part.value);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}

/** The instant of `hour`:00 New York time on a day: 16:00, the NYSE close, unless told otherwise. */
export function nyCloseUtc(date: string, hour = 16): Date {
  const wall = dayMs(date) + hour * HOUR;
  let t = wall;
  for (let i = 0; i < 3; i++) t += wall - nyWallMs(t);
  return new Date(t);
}

// ------------------------------------------------------------------ fields

function threshold(raw: number | string): string {
  const value = typeof raw === 'string' ? Number(raw.trim() || Number.NaN) : raw;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new TemplateError('Enter a threshold above 0.');
  const text = value.toLocaleString('en-US', { maximumFractionDigits: 8 });
  if (Number(text.replace(/,/g, '')) !== value) throw new TemplateError('Use at most 8 decimal places in the threshold.');
  return text;
}

function leadTime(closes: number, now: Date, message: string): void {
  if (closes < now.getTime() + MIN_LEAD_MS) throw new TemplateError(message);
}

const result = (r: Omit<TemplateResult, 'closesAt' | 'resolutionDeadlineAt'>, closes: number): TemplateResult => ({
  ...r,
  closesAt: new Date(closes),
  resolutionDeadlineAt: new Date(closes + RESOLVE_WITHIN_MS),
});

// ------------------------------------------------------------------ templates

/** Coinbase's one-minute candle: will {coin} trade above $X at a UTC minute? */
export function cryptoTemplate(
  input: { coin: string; threshold: number | string; date: string; time: string },
  now: Date = new Date(),
): TemplateResult {
  const coin = String(input.coin ?? '').trim().toUpperCase();
  if (!(CRYPTO_COINS as readonly string[]).includes(coin)) throw new TemplateError(`Pick one of ${CRYPTO_COINS.join(', ')}.`);
  const price = `$${threshold(input.threshold)}`;
  const day = dayMs(input.date);
  const t = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(input.time ?? '').trim());
  if (!t) throw new TemplateError('Enter the time as HH:MM, in UTC.');
  const hhmm = `${t[1]}:${t[2]}`;
  const closes = day + Number(t[1]) * HOUR + Number(t[2]) * MINUTE;
  leadTime(closes, now, 'Pick a minute at least 15 minutes from now.');
  const unix = closes / 1000;
  const when = longDate(day);
  return result({
    question: `Will ${coin} trade above ${price} at ${hhmm} UTC on ${when}?`,
    rules: [
      `This market will resolve to "Yes" if the opening price of the Coinbase ${coin}-USD one-minute candle that starts at ${hhmm} UTC on ${when} is above ${price}. Otherwise, this market will resolve to "No."`,
      '',
      'For the purposes of this market:',
      `- The source lists candles as [time, low, high, open, close, volume], with time in Unix seconds. The deciding value is the open (fourth number) of the candle whose time is ${unix}.`,
      '- If the source has no candle with that time, the open of the earliest later candle in the source counts.',
      `- "Above" is strict: a price equal to ${price} resolves to "No."`,
      '- Prices from other exchanges, pairs or candle sizes do not count.',
    ].join('\n'),
    source: `https://api.exchange.coinbase.com/products/${coin}-USD/candles?granularity=60&start=${unix}&end=${unix + 600}`,
    category: 3,
  }, closes);
}

/** Nasdaq's daily history: will {ticker} close above $X on a trading day? */
export function stockTemplate(
  input: { ticker: string; threshold: number | string; date: string; category?: number },
  now: Date = new Date(),
): TemplateResult {
  const ticker = String(input.ticker ?? '').trim().toUpperCase();
  if (!/^[A-Z][A-Z.]{0,5}$/.test(ticker)) throw new TemplateError('Enter a ticker of up to 6 letters, such as NVDA or BRK.B.');
  const category = input.category ?? 5;
  if (!Number.isInteger(category) || category < 1 || category > 8) throw new TemplateError('Pick a category.');
  const price = `$${threshold(input.threshold)}`;
  const day = dayMs(input.date);
  const date = isoDay(day);
  const when = longDate(day);
  if (!NYSE_YEARS.has(new Date(day).getUTCFullYear())) throw new TemplateError('Stock markets can use trading days in 2026 and 2027 only.');
  if (isWeekend(day)) throw new TemplateError(`${when} is a weekend: the NYSE does not trade.`);
  if (isNyseHoliday(date)) throw new TemplateError(`${when} is an NYSE holiday: there is no close that day.`);
  const closes = nyCloseUtc(date, NYSE_EARLY_CLOSES.has(date) ? 13 : 16).getTime();
  leadTime(closes, now, 'Pick a trading day whose close is at least 15 minutes from now.');
  const [y, m, d] = date.split('-');
  return result({
    question: `Will ${ticker} close above ${price} on ${when}?`,
    rules: [
      `This market will resolve to "Yes" if ${ticker}'s official closing price on ${when}, as listed by Nasdaq, is above ${price}. Otherwise, this market will resolve to "No."`,
      '',
      'For the purposes of this market:',
      `- The deciding value is the "close" ("Close/Last") of the row dated ${m}/${d}/${y} in the source.`,
      `- Nasdaq adds the day's row after the close. Until the row for ${m}/${d}/${y} appears, the market waits.`,
      `- "Above" is strict: a close equal to ${price} resolves to "No."`,
      `- If no row for ${m}/${d}/${y} appears before the resolution deadline, the market is not resolved: it is cancelled and every position is refunded.`,
      '- After-hours trades, intraday prices and other venues do not count.',
    ].join('\n'),
    source: `https://api.nasdaq.com/api/quote/${ticker}/historical?assetclass=stocks&fromdate=${date}&todate=${isoDay(day + DAY)}&limit=10`,
    category,
  }, closes);
}

/** Frankfurter's copy of the ECB reference rates: will {base}/{quote} be above X on a day? */
export function fxTemplate(
  input: { base: string; quote: string; threshold: number | string; date: string },
  now: Date = new Date(),
): TemplateResult {
  const base = String(input.base ?? '').trim().toUpperCase();
  const quote = String(input.quote ?? '').trim().toUpperCase();
  const list = FX_CURRENCIES as readonly string[];
  if (!list.includes(base) || !list.includes(quote)) throw new TemplateError('Pick both currencies from the list.');
  if (base === quote) throw new TemplateError('Pick two different currencies.');
  const rate = threshold(input.threshold);
  const day = dayMs(input.date);
  const date = isoDay(day);
  const when = longDate(day);
  if (isWeekend(day)) throw new TemplateError(`${when} is a weekend: no reference rate is published.`);
  if (isTargetHoliday(date)) throw new TemplateError(`${when} is a TARGET holiday: the ECB publishes no reference rate.`);
  const closes = day + 12 * HOUR;
  leadTime(closes, now, 'Pick a day whose 12:00 UTC is at least 15 minutes from now.');
  return result({
    question: `Will the ${base}/${quote} reference rate for ${when} be above ${rate}?`,
    rules: [
      `This market will resolve to "Yes" if the ${base}/${quote} reference rate for ${when}, as published by Frankfurter from the European Central Bank's euro reference rates, is above ${rate}. Otherwise, this market will resolve to "No."`,
      '',
      'For the purposes of this market:',
      `- The deciding value is rates.${quote} in the source, and only if the source's date is ${date}.`,
      "- The ECB publishes each day's rates at about 16:00 Frankfurt time; before then the source shows an earlier date and the market waits.",
      `- If the source never shows ${date} before the resolution deadline, the market is not resolved: it is cancelled and every position is refunded.`,
      `- "Above" is strict: a rate equal to ${rate} resolves to "No."`,
      '- Rates from other providers or other days do not count.',
    ].join('\n'),
    source: `https://api.frankfurter.dev/v1/${date}?from=${base}&to=${quote}`,
    category: 6,
  }, closes);
}
