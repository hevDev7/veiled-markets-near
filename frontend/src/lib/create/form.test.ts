// The create page's form state. Also run under TZ=Asia/Jakarta: a template's instant must survive the form's
// local date and time fields in any zone.
import { describe, expect, it } from 'vitest';
import { encodeMetadata, MAX_METADATA, metadataBytes } from '../near/chain';
import {
  afterReviewFailure,
  draftToForm,
  initialFormData,
  isTemplateUnedited,
  normalizeDraft,
  publishBlocker,
  reviewBlocker,
  reviewFingerprint,
  reviewFellBack,
  reviewRequestOf,
  storedMetadata,
  toLocalFields,
  type MarketFormData,
  type ReviewState,
} from './form';
import type { MarketDraft, MarketReview, SourceCheck } from './market-ai-client';

describe('publishBlocker', () => {
  const passed: SourceCheck = { ok: true, url: 'https://example.com/', message: 'fine' };
  it('publishBlocker stops a market whose stored text grew past 2,048 bytes after step 2', () => {
    // A thumbnail upload that finishes after step 2 swaps a short preview URL for a longer one.
    const f: MarketFormData = { ...initialFormData, question: 'Will it rain in Jakarta on 1 December 2026?', description: 'x'.repeat(1_850), resolutionSource: 'https://example.com/' };
    const before = metadataBytes(storedMetadata({ ...f, thumbnailUrl: 'blob:https://veiledmarkets.xyz/6c1f' }));
    const after = metadataBytes(storedMetadata({ ...f, thumbnailUrl: `https://gateway.pinata.cloud/ipfs/${'Q'.repeat(120)}` }));
    expect(before).toBeLessThanOrEqual(MAX_METADATA);
    expect(after).toBeGreaterThan(MAX_METADATA);
    expect(publishBlocker({ metaBytes: after, check: passed, review: null })).toMatch(/shorten the rules/i);
  });

  it("publishBlocker needs a passed source check, then the review step's answer", () => {
    const failed: SourceCheck = { ok: false, url: 'https://example.com/', problem: 'fetch_failed', message: 'down' };
    expect(publishBlocker({ metaBytes: 500, check: null, review: null })).toMatch(/source/i);
    expect(publishBlocker({ metaBytes: 500, check: failed, review: null })).toMatch(/source/i);
    expect(publishBlocker({ metaBytes: 500, check: passed, review: 'Run the AI review.' })).toBe('Run the AI review.');
    expect(publishBlocker({ metaBytes: 500, check: passed, review: null })).toBeNull();
    expect(publishBlocker({ metaBytes: MAX_METADATA, check: passed, review: null })).toBeNull();
  });
});

describe('AI draft and review requests', () => {
  const draft: MarketDraft = {
    question: 'Will ETH trade above $4,000 at 12:00 UTC on Friday, 20 November 2026?',
    rules: 'This market will resolve to "Yes" if …',
    source: 'https://api.exchange.coinbase.com/products/ETH-USD/candles?granularity=60&start=1795176000&end=1795176600',
    category: 3,
    closes_at: '2026-11-20T12:00:00.000Z',
    resolution_deadline_at: '2026-11-27T12:00:00.000Z',
  };

  it("draftToForm fills the text, the category and the form's local times, and reviewRequestOf turns them back into the same instants", () => {
    const fields = draftToForm(draft);
    expect(fields).toMatchObject({ question: draft.question, description: draft.rules, resolutionSource: draft.source, category: 3, origin: 'ai', templateText: null });
    expect(fields).toMatchObject({ ...prefixed('deadline', toLocalFields(new Date(draft.closes_at))), ...prefixed('resolutionDeadline', toLocalFields(new Date(draft.resolution_deadline_at))) });
    const form: MarketFormData = { ...initialFormData, ...fields, question: `  ${draft.question} ` };
    expect(reviewRequestOf(form)).toEqual({
      question: draft.question,
      rules: draft.rules,
      source: draft.source,
      closes_at: draft.closes_at,
      resolution_deadline_at: draft.resolution_deadline_at,
    });
  });

  it('reviewRequestOf is null until both times are set', () => {
    expect(reviewRequestOf({ ...initialFormData, ...draftToForm(draft), deadlineTime: '' })).toBeNull();
    expect(reviewRequestOf({ ...initialFormData, ...draftToForm(draft), resolutionDeadlineDate: '' })).toBeNull();
  });
});

function prefixed(prefix: 'deadline' | 'resolutionDeadline', f: { date: string; time: string }) {
  return { [`${prefix}Date`]: f.date, [`${prefix}Time`]: f.time };
}

describe('reviewBlocker', () => {
  const form: MarketFormData = {
    ...initialFormData,
    question: 'Will ETH trade above $4,000 at 12:00 UTC on Friday, 20 November 2026?',
    description: 'This market will resolve to "Yes" if …',
    resolutionSource: 'https://api.exchange.coinbase.com/products/ETH-USD/candles?granularity=60&start=1795176000&end=1795176600',
    deadlineDate: '2026-11-20',
    deadlineTime: '19:00',
    resolutionDeadlineDate: '2026-11-27',
    resolutionDeadlineTime: '19:00',
    origin: 'ai',
  };
  const fp = reviewFingerprint(form);
  const review = (ready: boolean): MarketReview => ({ scores: { clarity: 9, verifiability: 9, time_bounds: 9, source_quality: ready ? 9 : 6 }, critiques: [], ready });
  const gate = (over: { templateLocked?: boolean; aiEnabled?: boolean; state?: ReviewState; fingerprint?: string; confirmed?: boolean }) =>
    reviewBlocker({ templateLocked: false, aiEnabled: true, state: null, fingerprint: fp, confirmed: false, ...over });

  it('reviewBlocker asks an unedited template for nothing and any other market for a ready AI review of exactly its text and times', () => {
    expect(gate({ templateLocked: true })).toBeNull();
    expect(gate({})).toMatch(/Run the AI review/);
    expect(gate({ state: { fingerprint: fp, review: review(true) } })).toBeNull();
    expect(gate({ state: { fingerprint: fp, review: review(false) } })).toMatch(/7 or more/);
    expect(gate({ state: { fingerprint: fp, review: review(true) }, confirmed: true })).toBeNull();
    // Review Focus 4: a time edited in step 3 after a passed review makes it out of date, and Create locks again.
    const later = reviewFingerprint({ ...form, deadlineTime: '19:30' });
    expect(gate({ state: { fingerprint: fp, review: review(true) }, fingerprint: later })).toMatch(/changed after the AI review/);
  });

  it('reviewBlocker falls back to the tick when the AI cannot review or is not set up', () => {
    const fallback: ReviewState = { fallback: true, fingerprint: fp, message: 'AI drafting is not set up on this site.' };
    expect(gate({ state: fallback })).toMatch(/Tick the box/);
    expect(gate({ state: fallback, confirmed: true })).toBeNull();
    expect(gate({ aiEnabled: false })).toMatch(/Tick the box/);
    expect(gate({ aiEnabled: false, confirmed: true })).toBeNull();
    expect(gate({ aiEnabled: false, templateLocked: true })).toBeNull();
  });

  it('a fall back holds only for the version of the market the AI could not review', () => {
    const fallback: ReviewState = { fallback: true, fingerprint: fp, message: 'Too many AI requests.' };
    const later = reviewFingerprint({ ...form, description: `${form.description} Ties resolve to "No."` });
    expect(reviewFellBack(fallback, fp)).toBe(true);
    expect(reviewFellBack(fallback, later)).toBe(false);
    expect(reviewFellBack({ fingerprint: fp, review: review(false) }, fp)).toBe(false);
    expect(reviewFellBack(null, fp)).toBe(false);
    // An edit after the fall back asks for the AI review again, even with the tick given for the earlier text.
    expect(gate({ state: fallback, fingerprint: later, confirmed: true })).toMatch(/Run the AI review/);
  });

  it('a failed run keeps the AI review of exactly this market, so a score under 7 still blocks Create', () => {
    // The creator runs the review again on unchanged text and hits the hourly limit, a timeout or a network error.
    const notReady: ReviewState = { fingerprint: fp, review: review(false) };
    const kept = afterReviewFailure(notReady, fp, 'You have used your AI calls for this hour.');
    expect(kept).toBe(notReady);
    expect(gate({ state: kept, confirmed: true })).toMatch(/7 or more/);
    // Without a review of this version, the failure falls back to the tick for this version only.
    const fresh = afterReviewFailure(null, fp, 'The AI service cannot be reached.');
    expect(fresh).toEqual({ fallback: true, fingerprint: fp, message: 'The AI service cannot be reached.' });
    const later = reviewFingerprint({ ...form, deadlineTime: '19:30' });
    expect(afterReviewFailure(notReady, later, 'Too many AI requests.')).toEqual({ fallback: true, fingerprint: later, message: 'Too many AI requests.' });
    expect(afterReviewFailure(fresh, later, 'Too many AI requests.')).toEqual({ fallback: true, fingerprint: later, message: 'Too many AI requests.' });
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
