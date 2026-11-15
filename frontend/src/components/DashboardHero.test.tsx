// The owner asked for the Turbo chart on the dashboard without grid lines: the faint price lines across the plot and
// the square grid printed behind the hero card both go.
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

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
// The live Turbo view streams prices from the oracle; only what the hero asks of it is under test.
const rollingViewProps: Record<string, unknown>[] = [];
vi.mock('./TurboRollingView', () => ({
  TurboRollingView: (props: Record<string, unknown>) => {
    rollingViewProps.push(props);
    return null;
  },
}));

import { DashboardHero } from './DashboardHero';

const renderHero = () =>
  renderToStaticMarkup(
    <DashboardHero markets={[]} activityFeed={[]} onCreateMarket={() => {}} onMarketClick={() => {}} />,
  );

describe('DashboardHero Turbo chart', () => {
  it('asks the Turbo chart to leave out its grid lines', () => {
    rollingViewProps.length = 0;
    renderHero();

    expect(rollingViewProps).toHaveLength(1);
    expect(rollingViewProps[0].showGrid).toBe(false);
  });

  it('prints no square grid behind the hero card', () => {
    expect(renderHero()).not.toContain('background-size:48px 48px');
  });
});
