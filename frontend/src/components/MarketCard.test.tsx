// Parlay Mode offered every market's outcomes as legs, but the contract only takes markets the owner approved, so a
// slip built from the others failed at placement. Cards and rows now say why a market cannot be a leg instead.
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Market } from '@/lib/store';

vi.hoisted(() => {
  const data = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: () => null,
    length: 0,
  } as Storage;
});
// The countdown is not under test (and its global ticker has no server snapshot).
vi.mock('@/hooks/useGlobalTicker', () => ({
  useLiveCountdown: (_deadline?: number, fallback?: string) => fallback ?? '1d 0h 0m',
}));

import { MarketCard } from './MarketCard';
import { MarketRow } from './MarketRow';
import { PARLAY_LEG_CLOSED, PARLAY_LEG_NOT_APPROVED } from '@/lib/parlay-store';

const market = (o: Partial<Market> = {}): Market => ({
  id: '933field',
  question: 'Will it rain in Jakarta tomorrow?',
  category: 7,
  numOutcomes: 2,
  outcomeLabels: ['Yes', 'No'],
  deadline: 1_000n,
  resolutionDeadline: 2_000n,
  status: 1,
  yesReserve: 3_000_000n,
  noReserve: 3_000_000n,
  reserve3: 0n,
  reserve4: 0n,
  totalLiquidity: 6_000_000n,
  totalLPShares: 6_000_000n,
  outcomePrices: [0.5, 0.5],
  outcomePercentages: [50, 50],
  outcomePayouts: [2, 2],
  totalVolume: 0n,
  totalBets: 0,
  totalYesIssued: 0n,
  totalNoIssued: 0n,
  timeRemaining: '2d 3h 0m',
  deadlineTimestamp: Date.now() + 86_400_000,
  tokenType: 'NEAR',
  parlayLeg: true,
  ...o,
});

const views = {
  MarketCard: (m: Market, selected: number | null = null) =>
    renderToStaticMarkup(<MarketCard market={m} index={0} onClick={() => {}} parlayMode selectedParlayOutcome={selected} />),
  MarketRow: (m: Market, selected: number | null = null) =>
    renderToStaticMarkup(<MarketRow market={m} index={0} onClick={() => {}} parlayMode selectedParlayOutcome={selected} />),
};

describe.each(Object.entries(views))('%s in Parlay Mode', (_name, render) => {
  it('offers the outcomes of an approved, open market as legs', () => {
    const html = render(market());
    expect(html).toContain('implied');
    expect(html).not.toContain(PARLAY_LEG_NOT_APPROVED);
  });

  it('says a market the owner has not approved is not open for parlays, with no outcome to tap', () => {
    const html = render(market({ parlayLeg: false }));
    expect(html).toContain(PARLAY_LEG_NOT_APPROVED);
    expect(html).not.toContain('implied');
  });

  it('says a closed market cannot join a new parlay, with no outcome to tap', () => {
    const html = render(market({ status: 3 }));
    expect(html).toContain(PARLAY_LEG_CLOSED);
    expect(html).not.toContain('implied');
  });

  it('still lets a leg already on the slip be taken off a market that cannot be a leg', () => {
    expect(render(market({ parlayLeg: false }), 1)).toContain('Remove from slip');
    expect(render(market({ parlayLeg: false }))).not.toContain('Remove from slip');
  });
});
