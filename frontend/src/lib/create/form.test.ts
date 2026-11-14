// The create page's form state. Also run under TZ=Asia/Jakarta: a template's instant must survive the form's
// local date and time fields in any zone.
import { describe, expect, it } from 'vitest';
import { encodeMetadata, MAX_METADATA, metadataBytes } from '../near/chain';
import { initialFormData, isTemplateUnedited, normalizeDraft, publishBlocker, reviewFingerprint, storedMetadata, toLocalFields, type MarketFormData } from './form';
import type { SourceCheck } from './market-ai-client';

describe('publishBlocker', () => {
  const passed: SourceCheck = { ok: true, url: 'https://example.com/', message: 'fine' };
  it('publishBlocker stops a market whose stored text grew past 2,048 bytes after step 2', () => {
    // A thumbnail upload that finishes after step 2 swaps a short preview URL for a longer one.
    const f: MarketFormData = { ...initialFormData, question: 'Will it rain in Jakarta on 1 December 2026?', description: 'x'.repeat(1_850), resolutionSource: 'https://example.com/' };
    const before = metadataBytes(storedMetadata({ ...f, thumbnailUrl: 'blob:https://veiledmarkets.xyz/6c1f' }));
    const after = metadataBytes(storedMetadata({ ...f, thumbnailUrl: `https://gateway.pinata.cloud/ipfs/${'Q'.repeat(120)}` }));
    expect(before).toBeLessThanOrEqual(MAX_METADATA);
    expect(after).toBeGreaterThan(MAX_METADATA);
    expect(publishBlocker({ metaBytes: after, check: passed, needsConfirm: false, confirmed: false })).toMatch(/shorten the rules/i);
  });

  it('publishBlocker needs a passed source check and, when asked, the tick', () => {
    const failed: SourceCheck = { ok: false, url: 'https://example.com/', problem: 'fetch_failed', message: 'down' };
    expect(publishBlocker({ metaBytes: 500, check: null, needsConfirm: false, confirmed: false })).toMatch(/source/i);
    expect(publishBlocker({ metaBytes: 500, check: failed, needsConfirm: false, confirmed: false })).toMatch(/source/i);
    expect(publishBlocker({ metaBytes: 500, check: passed, needsConfirm: true, confirmed: false })).toMatch(/tick/i);
    expect(publishBlocker({ metaBytes: 500, check: passed, needsConfirm: true, confirmed: true })).toBeNull();
    expect(publishBlocker({ metaBytes: MAX_METADATA, check: passed, needsConfirm: false, confirmed: false })).toBeNull();
  });
});

describe('storedMetadata', () => {
  it('storedMetadata is what the page stores: trimmed text and Yes/No', () => {
    const f: MarketFormData = { ...initialFormData, question: '  Will it rain in Jakarta?  ', description: ' Hujan — €5 🌧 ', resolutionSource: ' https://example.com/ ' };
    const m = storedMetadata(f);
    expect(m).toEqual({ question: 'Will it rain in Jakarta?', description: 'Hujan — €5 🌧', resolutionSource: 'https://example.com/', outcomeLabels: ['Yes', 'No'] });
    expect(metadataBytes(m)).toBe(new TextEncoder().encode(encodeMetadata(m)).length);
  });
});

describe('normalizeDraft', () => {
  it('normalizeDraft drops 3- and 4-way outcomes and keeps the text', () => {
    const old = {
      question: 'Who finishes second in the 2026 F1 drivers championship?',
      description: 'Resolves to the driver in second place.',
      category: 2,
      numOutcomes: 4,
      outcomeLabels: ['Max Verstappen', 'George Russell', 'Lewis Hamilton', 'Another driver'],
      initialLiquidity: '5',
      deadlineDate: '2026-12-06',
      deadlineTime: '13:00',
      resolutionDeadlineDate: '2026-12-13',
      resolutionDeadlineTime: '13:00',
      resolutionSource: 'https://www.formula1.com/en/results/2026/drivers',
      tokenType: 'NEAR',
      thumbnailUrl: '',
    };
    const d = normalizeDraft(old)!;
    expect(d).not.toHaveProperty('numOutcomes');
    expect(d).not.toHaveProperty('outcomeLabels');
    expect(d.question).toBe(old.question);
    expect(d.description).toBe(old.description);
    expect(d.resolutionSource).toBe(old.resolutionSource);
    expect(d.category).toBe(2);
    expect(d.initialLiquidity).toBe('5');
    expect(d.deadlineDate).toBe('2026-12-06');
    expect(d.origin).toBe('manual');
    expect(d.templateText).toBeNull();
  });

  it('normalizeDraft turns USAD into NEAR and an unmarked template into manual', () => {
    expect(normalizeDraft({ ...initialFormData, tokenType: 'USAD' })!.tokenType).toBe('NEAR');
    expect(normalizeDraft({ ...initialFormData, tokenType: 'USDCX' })!.tokenType).toBe('USDCX');
    expect(normalizeDraft({ ...initialFormData, origin: 'template', templateText: null })!.origin).toBe('manual');
    const text = { question: 'Q?', description: 'R', resolutionSource: 'https://example.com/' };
    const kept = normalizeDraft({ ...initialFormData, ...text, origin: 'template', templateText: text })!;
    expect(kept.origin).toBe('template');
    expect(kept.templateText).toEqual(text);
    expect(normalizeDraft(null)).toBeNull();
    expect(normalizeDraft('not a draft')).toBeNull();
  });
});

describe('toLocalFields', () => {
  it("toLocalFields round-trips an instant through the form's local date and time", () => {
    for (const iso of ['2026-11-16T21:00:00Z', '2026-11-20T23:30:00Z']) {
      const { date, time } = toLocalFields(new Date(iso));
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(time).toMatch(/^\d{2}:\d{2}$/);
      expect(new Date(`${date}T${time}`).toISOString()).toBe(new Date(iso).toISOString());
    }
    if (process.env.TZ === 'Asia/Jakarta') {
      expect(toLocalFields(new Date('2026-11-16T21:00:00Z'))).toEqual({ date: '2026-11-17', time: '04:00' });
    }
  });
});

describe('review fingerprint and template state', () => {
  const form: MarketFormData = {
    ...initialFormData,
    question: 'Will BTC trade above $100,000 at 14:30 UTC on November 20, 2026?',
    description: 'This market will resolve to "Yes" if …',
    resolutionSource: 'https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=60&start=1795185000&end=1795185600',
    deadlineDate: '2026-11-20',
    deadlineTime: '21:30',
    resolutionDeadlineDate: '2026-11-27',
    resolutionDeadlineTime: '21:30',
  };

  it('reviewFingerprint changes when a reviewed field changes and not for liquidity or thumbnail', () => {
    const base = reviewFingerprint(form);
    const reviewed = ['question', 'description', 'resolutionSource', 'deadlineDate', 'deadlineTime', 'resolutionDeadlineDate', 'resolutionDeadlineTime'] as const;
    for (const key of reviewed) expect(reviewFingerprint({ ...form, [key]: `${form[key]}x` })).not.toBe(base);
    expect(reviewFingerprint({ ...form, deadlineTime: '21:31' })).not.toBe(base);
    expect(reviewFingerprint({ ...form, initialLiquidity: '99', thumbnailUrl: 'https://example.com/a.png' })).toBe(base);
  });

  it('isTemplateUnedited is false once the rules change', () => {
    const text = { question: form.question, description: form.description, resolutionSource: form.resolutionSource };
    const fromTemplate: MarketFormData = { ...form, origin: 'template', templateText: text };
    expect(isTemplateUnedited(fromTemplate)).toBe(true);
    expect(isTemplateUnedited({ ...fromTemplate, description: `${form.description} Edited.` })).toBe(false);
    expect(isTemplateUnedited({ ...fromTemplate, origin: 'manual' })).toBe(false);
    expect(isTemplateUnedited({ ...fromTemplate, templateText: null })).toBe(false);
  });
});
