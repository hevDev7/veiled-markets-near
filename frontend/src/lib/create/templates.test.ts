// Templates write the question, rules and a source the AI resolver can read, from a few fields.
// Also run under TZ=Asia/Jakarta: every date here is UTC or New York time, never the browser's.
import { describe, expect, it } from 'vitest';
import {
  TemplateError,
  cryptoTemplate,
  easterSunday,
  fxTemplate,
  isNyseHoliday,
  isTargetHoliday,
  nyCloseUtc,
  stockTemplate,
} from './templates';

const now = new Date('2026-11-14T00:00:00Z');

describe('cryptoTemplate', () => {
  it('cryptoTemplate builds the Coinbase minute market', () => {
    const t = cryptoTemplate({ coin: 'BTC', threshold: 100000, date: '2026-11-20', time: '14:30' }, now);
    expect(t.question).toBe('Will BTC trade above $100,000 at 14:30 UTC on November 20, 2026?');
    expect(t.source).toBe('https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=60&start=1795185000&end=1795185600');
    expect(t.closesAt.toISOString()).toBe('2026-11-20T14:30:00.000Z');
    expect(t.resolutionDeadlineAt.toISOString()).toBe('2026-11-27T14:30:00.000Z');
    expect(t.category).toBe(3);
    expect(t.rules).toContain('whose time is 1795185000');
    expect(t.rules.startsWith('This market will resolve to "Yes" if the opening price of the Coinbase BTC-USD one-minute candle that starts at 14:30 UTC on November 20, 2026 is above $100,000.')).toBe(true);
  });

  it('cryptoTemplate refuses a minute less than 15 minutes ahead', () => {
    expect(() => cryptoTemplate({ coin: 'BTC', threshold: 100000, date: '2026-11-14', time: '00:14' }, now)).toThrow(TemplateError);
    expect(() => cryptoTemplate({ coin: 'BTC', threshold: 100000, date: '2026-11-14', time: '00:15' }, now)).not.toThrow();
  });

  it('cryptoTemplate refuses an unknown coin, a bad threshold and a malformed time', () => {
    expect(() => cryptoTemplate({ coin: 'DOGE', threshold: 1, date: '2026-11-20', time: '14:30' }, now)).toThrow(TemplateError);
    expect(() => cryptoTemplate({ coin: 'BTC', threshold: 0, date: '2026-11-20', time: '14:30' }, now)).toThrow(TemplateError);
    expect(() => cryptoTemplate({ coin: 'BTC', threshold: Number.NaN, date: '2026-11-20', time: '14:30' }, now)).toThrow(TemplateError);
    expect(() => cryptoTemplate({ coin: 'BTC', threshold: 1, date: '2026-11-20', time: '24:00' }, now)).toThrow(TemplateError);
    expect(() => cryptoTemplate({ coin: 'BTC', threshold: 1, date: '2026-02-30', time: '14:30' }, now)).toThrow(TemplateError);
  });
});

describe('stockTemplate', () => {
  it('stockTemplate closes at 16:00 New York time across daylight saving', () => {
    expect(nyCloseUtc('2026-11-16').toISOString()).toBe('2026-11-16T21:00:00.000Z');
    expect(nyCloseUtc('2026-07-15').toISOString()).toBe('2026-07-15T20:00:00.000Z');
    expect(nyCloseUtc('2026-03-09').toISOString()).toBe('2026-03-09T20:00:00.000Z');
    expect(nyCloseUtc('2026-03-06').toISOString()).toBe('2026-03-06T21:00:00.000Z');
    expect(stockTemplate({ ticker: 'NVDA', threshold: 200, date: '2026-11-16' }, now).closesAt.toISOString()).toBe('2026-11-16T21:00:00.000Z');
  });

  it('stockTemplate builds the Nasdaq URL with todate the next day', () => {
    const t = stockTemplate({ ticker: 'nvda', threshold: 200, date: '2026-11-16' }, now);
    expect(t.source).toBe('https://api.nasdaq.com/api/quote/NVDA/historical?assetclass=stocks&fromdate=2026-11-16&todate=2026-11-17&limit=10');
    expect(t.question).toBe('Will NVDA close above $200 on November 16, 2026?');
    expect(t.rules).toContain('dated 11/16/2026');
    // The resolver polls right after the close, before Nasdaq adds the row: a missing row must mean "wait" then.
    expect(t.rules).toContain('Until the row for 11/16/2026 appears, the market waits.');
    expect(t.rules).toContain('If no row for 11/16/2026 appears before the resolution deadline, the market is not resolved: it is cancelled and every position is refunded.');
    expect(t.rules).not.toContain('trading did not take place');
    expect(t.category).toBe(5);
    expect(t.resolutionDeadlineAt.toISOString()).toBe('2026-11-23T21:00:00.000Z');
  });

  it('stockTemplate refuses weekends and NYSE holidays', () => {
    for (const date of ['2026-11-21', '2026-11-26', '2027-03-26', '2026-07-03']) {
      expect(() => stockTemplate({ ticker: 'NVDA', threshold: 200, date }, now)).toThrow(TemplateError);
    }
  });

  it('stockTemplate closes at 13:00 New York time on an NYSE early-close day', () => {
    expect(stockTemplate({ ticker: 'NVDA', threshold: 200, date: '2026-11-27' }, now).closesAt.toISOString()).toBe('2026-11-27T18:00:00.000Z');
    expect(stockTemplate({ ticker: 'NVDA', threshold: 200, date: '2026-12-24' }, now).closesAt.toISOString()).toBe('2026-12-24T18:00:00.000Z');
  });

  it('isNyseHoliday knows the 2026–2027 list and not 2026-11-27', () => {
    const holidays = [
      '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
      '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31', '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24',
    ];
    for (const d of holidays) expect(isNyseHoliday(d)).toBe(true);
    expect(isNyseHoliday('2026-11-27')).toBe(false);
  });
});

describe('fxTemplate', () => {
  it('fxTemplate closes at 12:00 UTC on a TARGET business day', () => {
    const t = fxTemplate({ base: 'USD', quote: 'IDR', threshold: 18500, date: '2026-11-20' }, now);
    expect(t.source).toBe('https://api.frankfurter.dev/v1/2026-11-20?from=USD&to=IDR');
    expect(t.question).toBe('Will the USD/IDR reference rate for November 20, 2026 be above 18,500?');
    expect(t.closesAt.toISOString()).toBe('2026-11-20T12:00:00.000Z');
    expect(t.category).toBe(6);
    expect(t.rules).toContain("rates.IDR in the source, and only if the source's date is 2026-11-20");
    // Trading closes before the ECB publishes: until then the source shows an earlier date, which must mean "wait".
    expect(t.rules).toContain('before then the source shows an earlier date and the market waits.');
    expect(t.rules).toContain('If the source never shows 2026-11-20 before the resolution deadline, the market is not resolved: it is cancelled and every position is refunded.');
    expect(t.rules).not.toContain('no rate was published');
  });

  it('fxTemplate refuses TARGET holidays and same-currency pairs', () => {
    expect(() => fxTemplate({ base: 'USD', quote: 'IDR', threshold: 18500, date: '2026-12-25' }, now)).toThrow(TemplateError);
    expect(() => fxTemplate({ base: 'USD', quote: 'IDR', threshold: 18500, date: '2027-03-29' }, now)).toThrow(TemplateError);
    expect(() => fxTemplate({ base: 'USD', quote: 'USD', threshold: 1, date: '2026-11-20' }, now)).toThrow(TemplateError);
    expect(isTargetHoliday('2027-03-26')).toBe(true);
    expect(isTargetHoliday('2026-11-20')).toBe(false);
  });

  it('easterSunday matches known dates', () => {
    expect(easterSunday(2026)).toBe('2026-04-05');
    expect(easterSunday(2027)).toBe('2027-03-28');
  });
});
