// formatCredits truncates (never rounds up) a 6-decimal amount. It did so on a float, so amounts whose float times
// 100 lands just under an integer showed one cent short: 2.30 NEAR as 2.29, 0.29 as 0.28.
import { describe, expect, it } from 'vitest';
import { formatCredits } from './utils';

describe('formatCredits', () => {
  it('shows amounts whose float is just under the decimal exactly', () => {
    expect(formatCredits(2_300_000n)).toBe('2.30');
    expect(formatCredits(290_000n)).toBe('0.29');
    expect(formatCredits(4_350_000n)).toBe('4.35');
  });

  it('still truncates rather than rounds', () => {
    expect(formatCredits(995_000n)).toBe('0.99');
    expect(formatCredits(2_299_999n)).toBe('2.29');
  });

  it('gives a small non-zero amount two significant digits', () => {
    expect(formatCredits(9_950n)).toBe('0.0099');
    expect(formatCredits(1n)).toBe('0.000001');
  });

  it('keeps zero, whole amounts, other precisions and negatives', () => {
    expect(formatCredits(0n)).toBe('0.00');
    expect(formatCredits(3_000_000n)).toBe('3.00');
    expect(formatCredits(1_234_000_000n, 0)).toBe('1,234');
    expect(formatCredits(1_234_567n, 4)).toBe('1.2345');
    expect(formatCredits(-2_300_000n)).toBe('-2.30');
  });
});
