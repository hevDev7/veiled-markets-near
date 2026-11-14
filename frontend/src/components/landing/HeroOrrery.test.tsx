// The hero's right side was two stacked cards. It is now an engraved orrery: the featured market's prices ring the
// outside in its outcome colours, a veil sits in the middle, and private notes orbit inside it. Trades spiral in from
// the prices ring and turn gold as they cross the veil. The live market stays one click away on a plaque under the art.
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
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

import { HeroOrrery, ODDS_GAP_DEG, ORRERY, oddsArcs, spiral } from './HeroOrrery';

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
  outcomePrices: [0.62, 0.38],
  outcomePercentages: [62, 38],
  outcomePayouts: [1.6, 2.6],
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

const render = (m: Market | null, loading = false) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <HeroOrrery market={m} loading={loading} />
    </MemoryRouter>,
  );

describe('oddsArcs', () => {
  it('splits the prices ring by outcome share, from 12 o’clock, with a gap between outcomes', () => {
    const arcs = oddsArcs([62, 38]);
    expect(arcs).toHaveLength(2);
    const span = (a: { start: number; end: number }) => a.end - a.start;
    expect(span(arcs[0]) / span(arcs[1])).toBeCloseTo(62 / 38, 5);
    expect(arcs[1].start - arcs[0].end).toBeCloseTo(ODDS_GAP_DEG, 5);
    expect(arcs[0].start).toBeCloseTo(-90 + ODDS_GAP_DEG / 2, 5);
    expect(span(arcs[0]) + span(arcs[1]) + 2 * ODDS_GAP_DEG).toBeCloseTo(360, 5);
    expect(arcs.map((a) => a.color)).toEqual(['#00dc82', '#ff4757']);
  });

  it('leaves out an outcome with no share, and draws nothing when no outcome has one', () => {
    expect(oddsArcs([100, 0]).map((a) => a.color)).toEqual(['#00dc82']);
    expect(oddsArcs([0, 0])).toEqual([]);
  });
});

describe('spiral', () => {
  const points = (d: string) => [...d.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  const radius = ([x, y]: number[]) => Math.hypot(x - ORRERY.c, y - ORRERY.c);

  it('runs from the prices ring at its start angle to the edge of the core', () => {
    const { d } = spiral(0, 150);
    const pts = points(d);
    expect(pts[0][0]).toBeCloseTo(ORRERY.c + ORRERY.odds, 0);
    expect(pts[0][1]).toBeCloseTo(ORRERY.c, 0);
    expect(radius(pts[pts.length - 1])).toBeCloseTo(ORRERY.landing, 0);
  });

  it('says how far along the way the trade crosses the veil', () => {
    const { d, crossAt } = spiral(40, 150);
    const pts = points(d);
    let total = 0;
    let atVeil = 0;
    for (let i = 1; i < pts.length; i++) {
      total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (!atVeil && radius(pts[i]) <= ORRERY.veil) atVeil = total;
    }
    expect(crossAt).toBeGreaterThan(0);
    expect(crossAt).toBeLessThan(1);
    expect(crossAt).toBeCloseTo(atVeil / total, 2);
  });
});

describe('HeroOrrery', () => {
  it('puts the live market on a plaque under the art, with its odds and a link to it', () => {
    const html = render(market());
    expect(html).toContain('Will it rain in Jakarta tomorrow?');
    expect(html).toMatch(/62(\.0)?%/);
    expect(html).toMatch(/38(\.0)?%/);
    expect(html).toMatch(/href="\/market\//);
    expect(html).toContain('Live market');
  });

  it('draws the prices ring in the outcome colours and keeps the art out of the accessibility tree', () => {
    const html = render(market());
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
    expect(html).toContain('stroke="#00dc82"');
    expect(html).toContain('stroke="#ff4757"');
  });

  it('offers the live Turbo round when there is no market to show', () => {
    expect(render(null)).toContain('href="/turbo/BTC"');
    expect(render(null, true)).toContain('aria-busy="true"');
  });
});
