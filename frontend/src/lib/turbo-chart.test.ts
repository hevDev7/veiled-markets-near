// The owner asked for the Turbo chart on the dashboard without its grid lines. The price labels on the right axis
// stay; only the faint lines drawn across the plot at each label go. Other Turbo charts keep them.
import { describe, expect, it } from 'vitest';
import { drawPriceAxis } from './turbo-chart';

type Call = { op: string; args: unknown[] };

// A 2D context that records every method call; property writes (fillStyle, font, ...) are kept as plain fields.
function recordingContext() {
  const calls: Call[] = [];
  const fields: Record<string, unknown> = {};
  const ctx = new Proxy(fields, {
    get: (target, prop: string) =>
      prop in target ? target[prop] : (...args: unknown[]) => void calls.push({ op: prop, args }),
    set: (target, prop: string, value) => {
      target[prop] = value;
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

// Prices 62,240 – 62,480 on a 240 px tall plot that starts 6 px from the left and is 700 px wide.
const layout = {
  yMin: 62_240,
  yMax: 62_480,
  plotLeft: 6,
  plotWidth: 700,
  toY: (price: number) => 252 - (price - 62_240),
};
const EXPECTED_PRICES = Array.from({ length: 13 }, (_, i) => 62_240 + i * 20);

const labelledPrices = (calls: Call[]) =>
  calls.filter((c) => c.op === 'fillText').map((c) => Number(String(c.args[0]).replace(/\D/g, '')));

describe('drawPriceAxis', () => {
  it('labels round prices but draws no line across the plot when grid lines are off', () => {
    const { ctx, calls } = recordingContext();
    drawPriceAxis(ctx, { ...layout, gridLines: false });

    expect(labelledPrices(calls)).toEqual(EXPECTED_PRICES);
    expect(calls.filter((c) => c.op === 'stroke')).toHaveLength(0);
  });

  it('draws one line across the whole plot at each labelled price when grid lines are on', () => {
    const { ctx, calls } = recordingContext();
    drawPriceAxis(ctx, { ...layout, gridLines: true });

    expect(labelledPrices(calls)).toEqual(EXPECTED_PRICES);
    expect(calls.filter((c) => c.op === 'stroke')).toHaveLength(EXPECTED_PRICES.length);
    const starts = calls.filter((c) => c.op === 'moveTo').map((c) => c.args);
    const ends = calls.filter((c) => c.op === 'lineTo').map((c) => c.args);
    expect(starts).toEqual(EXPECTED_PRICES.map((p) => [6, layout.toY(p) + 0.5]));
    expect(ends).toEqual(EXPECTED_PRICES.map((p) => [706, layout.toY(p) + 0.5]));
  });
});
