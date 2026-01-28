// ============================================================================
// VEILED MARKETS SDK - Utils Tests
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  calculateYesProbability,
  calculateNoProbability,
  calculatePotentialPayout,
  formatTimeRemaining,
  formatCredits,
  parseCredits,
  validateBetAmount,
  validateMarketDeadline,
  hashToField,
} from '../utils';

describe('Probability Calculations', () => {
  describe('calculateYesProbability', () => {
    it('should return 50% when pools are equal', () => {
      const probability = calculateYesProbability(1000n, 1000n);
      expect(probability).toBe(50);
    });

    it('should return 0% when yes pool is empty', () => {
      const probability = calculateYesProbability(0n, 1000n);
      expect(probability).toBe(0);
    });

    it('should return 100% when no pool is empty', () => {
      const probability = calculateYesProbability(1000n, 0n);
      expect(probability).toBe(100);
    });

    it('should return 50% when both pools are empty', () => {
      const probability = calculateYesProbability(0n, 0n);
      expect(probability).toBe(50);
    });

    it('should calculate correct probability', () => {
      const probability = calculateYesProbability(7500n, 2500n);
      expect(probability).toBe(75);
    });
  });

  describe('calculateNoProbability', () => {
    it('should be complement of yes probability', () => {
      const yesPool = 6000n;
      const noPool = 4000n;
      const yesPct = calculateYesProbability(yesPool, noPool);
      const noPct = calculateNoProbability(yesPool, noPool);
      expect(yesPct + noPct).toBe(100);
    });
  });
});

describe('Payout Calculations', () => {
  describe('calculatePotentialPayout', () => {
    it('should calculate correct payout for yes bet', () => {
      // Total pool = 10000, yes pool = 4000
      // Betting 1000 on yes: (1000 / 4000) * 10000 * 0.98 = 2450
      const payout = calculatePotentialPayout(1000n, true, 4000n, 6000n);
      expect(payout).toBeGreaterThan(1000n);
    });

    it('should calculate correct payout for no bet', () => {
      const payout = calculatePotentialPayout(1000n, false, 4000n, 6000n);
      expect(payout).toBeGreaterThan(1000n);
    });

    it('should return 0 for empty winning pool', () => {
      const payout = calculatePotentialPayout(1000n, true, 0n, 5000n);
      expect(payout).toBe(0n);
    });

    it('should account for protocol fees', () => {
      // With 2% total fees, payout should be less than raw pool ratio
      const rawPayout = (1000n * 10000n) / 5000n; // 2000
      const actualPayout = calculatePotentialPayout(1000n, true, 5000n, 5000n);
      expect(actualPayout).toBeLessThan(rawPayout);
    });
  });
});

describe('Time Formatting', () => {
  describe('formatTimeRemaining', () => {
    it('should format days correctly', () => {
      const future = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
      const formatted = formatTimeRemaining(future);
      expect(formatted).toContain('5');
      expect(formatted.toLowerCase()).toContain('d');
    });

    it('should format hours correctly', () => {
      const future = new Date(Date.now() + 5 * 60 * 60 * 1000);
      const formatted = formatTimeRemaining(future);
      expect(formatted).toContain('5');
      expect(formatted.toLowerCase()).toContain('h');
    });

    it('should format minutes correctly', () => {
      const future = new Date(Date.now() + 30 * 60 * 1000);
      const formatted = formatTimeRemaining(future);
      expect(formatted).toContain('30');
      expect(formatted.toLowerCase()).toContain('m');
    });

    it('should return "Ended" for past dates', () => {
      const past = new Date(Date.now() - 1000);
      const formatted = formatTimeRemaining(past);
      expect(formatted.toLowerCase()).toContain('ended');
    });
  });
});

describe('Credits Formatting', () => {
  describe('formatCredits', () => {
    it('should format microcredits to credits', () => {
      const formatted = formatCredits(1000000n);
      expect(formatted).toBe('1');
    });

    it('should handle decimal values', () => {
      const formatted = formatCredits(1500000n);
      expect(formatted).toBe('1.5');
    });

    it('should handle large values', () => {
      const formatted = formatCredits(1000000000000n);
      expect(formatted).toBe('1,000,000');
    });

    it('should handle zero', () => {
      const formatted = formatCredits(0n);
      expect(formatted).toBe('0');
    });
  });

  describe('parseCredits', () => {
    it('should parse credits to microcredits', () => {
      const parsed = parseCredits('1');
      expect(parsed).toBe(1000000n);
    });

    it('should handle decimal values', () => {
      const parsed = parseCredits('1.5');
      expect(parsed).toBe(1500000n);
    });

    it('should handle values with commas', () => {
      const parsed = parseCredits('1,000');
      expect(parsed).toBe(1000000000n);
    });
  });
});

describe('Validation', () => {
  describe('validateBetAmount', () => {
    it('should accept valid bet amounts', () => {
      const result = validateBetAmount(1000000n, 10000000n);
      expect(result.valid).toBe(true);
    });

    it('should reject bet below minimum', () => {
      const result = validateBetAmount(100n, 10000000n);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('minimum');
    });

    it('should reject bet exceeding balance', () => {
      const result = validateBetAmount(20000000n, 10000000n);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('balance');
    });

    it('should reject zero amount', () => {
      const result = validateBetAmount(0n, 10000000n);
      expect(result.valid).toBe(false);
    });
  });

  describe('validateMarketDeadline', () => {
    it('should accept future deadlines', () => {
      const future = new Date(Date.now() + 86400000);
      const result = validateMarketDeadline(future);
      expect(result.valid).toBe(true);
    });

    it('should reject past deadlines', () => {
      const past = new Date(Date.now() - 1000);
      const result = validateMarketDeadline(past);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('future');
    });

    it('should reject deadlines too close to now', () => {
      const tooSoon = new Date(Date.now() + 60000); // 1 minute
      const result = validateMarketDeadline(tooSoon, 3600000); // min 1 hour
      expect(result.valid).toBe(false);
    });
  });
});

describe('Hashing', () => {
  describe('hashToField', () => {
    it('should return a field string', async () => {
      const hash = await hashToField('test question');
      expect(typeof hash).toBe('string');
      expect(hash).toMatch(/field$/);
    });

    it('should return consistent hash for same input', async () => {
      const hash1 = await hashToField('same input');
      const hash2 = await hashToField('same input');
      expect(hash1).toBe(hash2);
    });

    it('should return different hash for different input', async () => {
      const hash1 = await hashToField('input 1');
      const hash2 = await hashToField('input 2');
      expect(hash1).not.toBe(hash2);
    });
  });
});
