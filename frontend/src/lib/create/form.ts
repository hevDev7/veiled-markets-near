// The create page's form state: what a saved draft may hold, how a template's instant becomes the form's local date
// and time fields, and which fields an AI review covers. Every new market is Yes/No.
import { MAX_METADATA, type MarketMetadata } from '../near/chain';
import type { SourceCheck } from './market-ai-client';

export type MarketOrigin = 'manual' | 'template' | 'ai';

/** The contract's categories, in the order the page shows them. */
export const CATEGORIES = [
  { id: 1, name: 'Politics', emoji: '🏛' },
  { id: 3, name: 'Crypto', emoji: '₿' },
  { id: 2, name: 'Sports', emoji: '⚽' },
  { id: 6, name: 'Macro', emoji: '📈' },
  { id: 5, name: 'AI & Tech', emoji: '🤖' },
  { id: 4, name: 'Culture', emoji: '🎭' },
  { id: 8, name: 'Climate', emoji: '🌍' },
  { id: 7, name: 'Science', emoji: '🔬' },
];

export interface MarketFormData {
  question: string;
  description: string;
  category: number;
  initialLiquidity: string;
  deadlineDate: string;
  deadlineTime: string;
  resolutionDeadlineDate: string;
  resolutionDeadlineTime: string;
  resolutionSource: string;
  tokenType: 'NEAR' | 'USDCX' | 'USAD';
  thumbnailUrl: string;
  /** How the text was written: by hand, by a template (then read-only until "Edit the text"), or drafted by AI. */
  origin: MarketOrigin;
  /** The template's own text, to tell whether it is still unedited. */
  templateText: { question: string; description: string; resolutionSource: string } | null;
}

export const initialFormData: MarketFormData = {
  question: '',
  description: '',
  category: 3,
  initialLiquidity: '10',
  deadlineDate: '',
  deadlineTime: '23:59',
  resolutionDeadlineDate: '',
  resolutionDeadlineTime: '23:59',
  resolutionSource: '',
  tokenType: 'NEAR',
  thumbnailUrl: '',
  origin: 'manual',
  templateText: null,
};

/** The outcomes every new market stores: outcome 1 is Yes, outcome 2 is No. */
export const METADATA_OUTCOMES = ['Yes', 'No'];

/** The metadata the page stores with the market: what the size meter measures and the source check covered. */
export function storedMetadata(f: MarketFormData): MarketMetadata {
  return {
    question: f.question.trim(),
    description: f.description.trim() || undefined,
    resolutionSource: f.resolutionSource.trim() || undefined,
    outcomeLabels: METADATA_OUTCOMES,
    thumbnailUrl: f.thumbnailUrl || undefined,
  };
}

/** The rules a hand-written market starts from, in the same shape the templates use. */
export const RULES_PATTERN =
  'This market will resolve to "Yes" if … . Otherwise, this market will resolve to "No."\n\nFor the purposes of this market:\n- ';

export const DRAFT_KEY = 'veiled_create_market_draft';

const ORIGINS: MarketOrigin[] = ['manual', 'template', 'ai'];
const str = (v: unknown, fallback: string) => (typeof v === 'string' ? v : fallback);

/** A saved draft in today's shape: outcome fields dropped, USAD turned into NEAR, new fields filled. */
export function normalizeDraft(raw: unknown): MarketFormData | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const i = initialFormData;
  const category = typeof r.category === 'number' && Number.isInteger(r.category) && r.category >= 1 && r.category <= 8 ? r.category : i.category;
  const tokenType = r.tokenType === 'USDCX' ? 'USDCX' : 'NEAR';
  const t = r.templateText as Record<string, unknown> | null | undefined;
  const templateText =
    t && typeof t === 'object' && typeof t.question === 'string' && typeof t.description === 'string' && typeof t.resolutionSource === 'string'
      ? { question: t.question, description: t.description, resolutionSource: t.resolutionSource }
      : null;
  let origin: MarketOrigin = ORIGINS.includes(r.origin as MarketOrigin) ? (r.origin as MarketOrigin) : 'manual';
  if (origin === 'template' && !templateText) origin = 'manual';
  return {
    question: str(r.question, i.question),
    description: str(r.description, i.description),
    category,
    initialLiquidity: str(r.initialLiquidity, i.initialLiquidity),
    deadlineDate: str(r.deadlineDate, i.deadlineDate),
    deadlineTime: str(r.deadlineTime, i.deadlineTime),
    resolutionDeadlineDate: str(r.resolutionDeadlineDate, i.resolutionDeadlineDate),
    resolutionDeadlineTime: str(r.resolutionDeadlineTime, i.resolutionDeadlineTime),
    resolutionSource: str(r.resolutionSource, i.resolutionSource),
    tokenType,
    thumbnailUrl: str(r.thumbnailUrl, i.thumbnailUrl),
    origin,
    templateText: origin === 'template' ? templateText : null,
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** An instant as the form's date and time inputs hold it: in the browser's own zone, to the minute. */
export function toLocalFields(d: Date): { date: string; time: string } {
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

/** True while a template's question, rules and source are exactly as the template wrote them. */
export function isTemplateUnedited(f: MarketFormData): boolean {
  const t = f.templateText;
  return f.origin === 'template' && t !== null &&
    f.question === t.question && f.description === t.description && f.resolutionSource === t.resolutionSource;
}

/**
 * Why the market cannot be published as it stands, or null. Create asks again even after step 2 passed: a thumbnail
 * upload that finishes later can make the stored text longer, and encodeMetadata would then cut the rules.
 */
export function publishBlocker(s: { metaBytes: number; check: SourceCheck | null; needsConfirm: boolean; confirmed: boolean }): string | null {
  if (s.metaBytes > MAX_METADATA) {
    return `The question, rules, source and thumbnail now take ${s.metaBytes.toLocaleString('en-US')} bytes; a market stores at most ${MAX_METADATA.toLocaleString('en-US')}. Go back to step 2 and shorten the rules.`;
  }
  if (!s.check?.ok) return 'The resolution source has not passed the check. Go back to step 2.';
  if (s.needsConfirm && !s.confirmed) return 'Tick the box above once the deciding value shows in the source text.';
  return null;
}

/** What an AI review or the creator's tick covers: the text, the source and both deadlines. */
export function reviewFingerprint(f: MarketFormData): string {
  return JSON.stringify([
    f.question,
    f.description,
    f.resolutionSource,
    f.deadlineDate,
    f.deadlineTime,
    f.resolutionDeadlineDate,
    f.resolutionDeadlineTime,
  ]);
}
