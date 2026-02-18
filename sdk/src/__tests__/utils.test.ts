// ============================================================================
// VEILED MARKETS SDK - Utils Tests (v12)
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  calculateYesProbability,
  calculateNoProbability,
  calculateOutcomePrice,
  calculateAllPrices,
  calculateTradeFees,
  calculateBuySharesOut,
  calculateSellTokensOut,
  calculateLPSharesOut,
  calculateLPTokensOut,
  calculatePotentialPayout,
  calculateMinSharesOut,
  formatTimeRemaining,
  formatCredits,
  parseCredits,
  validateTradeAmount,
  validateBetAmount,
  validateMarketDeadline,
  validateMarketQuestion,
  validateNumOutcomes,
  hashToField,
} from '../utils';

// ============================================================================
// AMM Price Calculations
// ============================================================================

describe('AMM Price Calculations', () => {
  describe('calculateOutcomePrice', () => {
    it('should return equal prices for equal reserves', () => {
      const price = calculateOutcomePrice(5000n, 5000n, 0n, 0n, 2, 1);
      expect(price).toBeCloseTo(0.5);
    });

    it('should return higher price for higher reserve', () => {
      const price = calculateOutcomePrice(7500n, 2500n, 0n, 0n, 2, 1);
      expect(price).toBeCloseTo(0.75);
    });

    it('should handle 4-outcome markets', () => {
      const price = calculateOutcomePrice(2500n, 2500n, 2500n, 2500n, 4, 1);
      expect(price).toBeCloseTo(0.25);
    });

    it('should return default for zero reserves', () => {
      const price = calculateOutcomePrice(0n, 0n, 0n, 0n, 2, 1);
      expect(price).toBeCloseTo(0.5);
    });
  });

  describe('calculateAllPrices', () => {
    it('should return prices summing to 1', () => {
      const prices = calculateAllPrices(3000n, 7000n, 0n, 0n, 2);
      expect(prices.length).toBe(2);
      expect(prices[0] + prices[1]).toBeCloseTo(1.0);
    });

    it('should handle 3-outcome markets', () => {
      const prices = calculateAllPrices(3000n, 3000n, 4000n, 0n, 3);
      expect(prices.length).toBe(3);
      expect(prices[0] + prices[1] + prices[2]).toBeCloseTo(1.0);
      expect(prices[2]).toBeCloseTo(0.4);
    });

    it('should handle 4-outcome markets', () => {
      const prices = calculateAllPrices(1000n, 2000n, 3000n, 4000n, 4);
      expect(prices.length).toBe(4);
      expect(prices.reduce((a, b) => a + b, 0)).toBeCloseTo(1.0);
    });
  });
});

describe('Fee Calculations', () => {
  describe('calculateTradeFees', () => {
    it('should calculate correct fees', () => {
      const fees = calculateTradeFees(10000n);
      expect(fees.protocolFee).toBe(50n);  // 0.5%
      expect(fees.creatorFee).toBe(50n);   // 0.5%
      expect(fees.lpFee).toBe(100n);       // 1%
      expect(fees.totalFees).toBe(200n);   // 2%
      expect(fees.amountAfterFees).toBe(9800n);
      expect(fees.amountToPool).toBe(9900n); // after fees + LP fee back
    });

    it('should handle large amounts', () => {
      const fees = calculateTradeFees(1000000000n);
      expect(fees.totalFees).toBe(20000000n); // 2%
    });
  });
});

describe('AMM Trading Calculations', () => {
  describe('calculateBuySharesOut', () => {
    it('should calculate shares out for binary market', () => {
      const shares = calculateBuySharesOut(5000n, 5000n, 0n, 0n, 2, 1, 1000n);
      expect(shares).toBeGreaterThan(0n);
      expect(shares).toBeLessThan(1000n);
    });

    it('should give more shares for underpriced outcome', () => {
      const sharesUnderpriced = calculateBuySharesOut(2500n, 7500n, 0n, 0n, 2, 1, 1000n);
      const sharesOverpriced = calculateBuySharesOut(2500n, 7500n, 0n, 0n, 2, 2, 1000n);
      expect(sharesUnderpriced).toBeLessThan(sharesOverpriced);
    });

    it('should return 0 for empty reserves', () => {
      const shares = calculateBuySharesOut(0n, 0n, 0n, 0n, 2, 1, 1000n);
      expect(shares).toBe(0n);
    });
  });

  describe('calculateSellTokensOut', () => {
    it('should calculate tokens out for selling shares', () => {
      const tokens = calculateSellTokensOut(5000n, 5000n, 0n, 0n, 2, 1, 1000n);
      expect(tokens).toBeGreaterThan(0n);
    });

    it('should return 0 for empty reserves', () => {
      const tokens = calculateSellTokensOut(0n, 0n, 0n, 0n, 2, 1, 1000n);
      expect(tokens).toBe(0n);
    });
  });
});

describe('LP Calculations', () => {
  describe('calculateLPSharesOut', () => {
    it('should return amount for initial liquidity', () => {
      const shares = calculateLPSharesOut(10000n, 0n, 0n);
      expect(shares).toBe(10000n);
    });

    it('should calculate proportional shares', () => {
      const shares = calculateLPSharesOut(5000n, 10000n, 20000n);
      expect(shares).toBe(2500n);
    });
  });

  describe('calculateLPTokensOut', () => {
    it('should calculate proportional tokens', () => {
      const tokens = calculateLPTokensOut(5000n, 10000n, 20000n);
      expect(tokens).toBe(10000n);
    });

    it('should return 0 for zero LP shares', () => {
      const tokens = calculateLPTokensOut(5000n, 0n, 20000n);
      expect(tokens).toBe(0n);
    });
  });
});

describe('Slippage', () => {
  describe('calculateMinSharesOut', () => {
    it('should apply 1% slippage', () => {
      const min = calculateMinSharesOut(10000n, 1);
      expect(min).toBe(9900n);
    });

    it('should apply 5% slippage', () => {
      const min = calculateMinSharesOut(10000n, 5);
      expect(min).toBe(9500n);
    });
  });
});

// ============================================================================
// Legacy Probability Functions
// ============================================================================

describe('Legacy Probability Calculations', () => {
  describe('calculateYesProbability', () => {
    it('should return 50% when pools are equal', () => {
      expect(calculateYesProbability(1000n, 1000n)).toBe(50);
    });

    it('should return 0% when yes pool is empty', () => {
      expect(calculateYesProbability(0n, 1000n)).toBe(0);
    });

    it('should return 100% when no pool is empty', () => {
      expect(calculateYesProbability(1000n, 0n)).toBe(100);
    });

    it('should return 50% when both pools are empty', () => {
      expect(calculateYesProbability(0n, 0n)).toBe(50);
    });

    it('should calculate correct probability', () => {
      expect(calculateYesProbability(7500n, 2500n)).toBe(75);
    });
  });

  describe('calculateNoProbability', () => {
    it('should be complement of yes probability', () => {
      const yesPct = calculateYesProbability(6000n, 4000n);
      const noPct = calculateNoProbability(6000n, 4000n);
      expect(yesPct + noPct).toBe(100);
    });
  });
});

describe('Payout Calculations', () => {
  describe('calculatePotentialPayout', () => {
    it('should return shares out for AMM model', () => {
      const payout = calculatePotentialPayout(1000n, 1, 5000n, 5000n);
      expect(payout).toBeGreaterThan(0n);
    });

    it('should handle multi-outcome', () => {
      const payout = calculatePotentialPayout(1000n, 3, 2500n, 2500n, 2500n, 2500n, 4);
      expect(payout).toBeGreaterThan(0n);
    });

    it('should return 0 for empty reserves', () => {
      const payout = calculatePotentialPayout(1000n, 1, 0n, 0n);
      expect(payout).toBe(0n);
    });
  });
});

// ============================================================================
// Formatting
// ============================================================================

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
      expect(formatTimeRemaining(past).toLowerCase()).toContain('ended');
    });
  });
});

describe('Credits Formatting', () => {
  describe('formatCredits', () => {
    it('should format microcredits to credits', () => {
      expect(formatCredits(1000000n)).toContain('1');
    });

    it('should handle decimal values', () => {
      const formatted = formatCredits(1500000n);
      expect(formatted).toContain('1');
      expect(formatted).toContain('5');
    });

    it('should handle zero', () => {
      expect(formatCredits(0n)).toContain('0');
    });
  });

  describe('parseCredits', () => {
    it('should parse credits to microcredits', () => {
      expect(parseCredits('1')).toBe(1000000n);
    });

    it('should handle decimal values', () => {
      expect(parseCredits('1.5')).toBe(1500000n);
    });

    it('should handle values with commas', () => {
      expect(parseCredits('1,000')).toBe(1000000000n);
    });
  });
});

// ============================================================================
// Validation
// ============================================================================

describe('Validation', () => {
  describe('validateTradeAmount', () => {
    it('should accept valid trade amounts', () => {
      expect(validateTradeAmount(1000000n, 10000000n).valid).toBe(true);
    });

    it('should reject amount below minimum', () => {
      const result = validateTradeAmount(100n, 10000000n);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('minimum');
    });

    it('should reject amount exceeding balance', () => {
      const result = validateTradeAmount(20000000n, 10000000n);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('balance');
    });

    it('should reject zero amount', () => {
      expect(validateTradeAmount(0n, 10000000n).valid).toBe(false);
    });
  });

  describe('validateBetAmount (legacy alias)', () => {
    it('should work same as validateTradeAmount', () => {
      expect(validateBetAmount(1000000n, 10000000n).valid).toBe(true);
    });
  });

  describe('validateMarketDeadline', () => {
    it('should accept future deadlines', () => {
      const future = new Date(Date.now() + 86400000);
      expect(validateMarketDeadline(future).valid).toBe(true);
    });

    it('should reject past deadlines', () => {
      const result = validateMarketDeadline(new Date(Date.now() - 1000));
      expect(result.valid).toBe(false);
      expect(result.error).toContain('future');
    });

    it('should reject deadlines too close to now', () => {
      const result = validateMarketDeadline(new Date(Date.now() + 60000), 3600000);
      expect(result.valid).toBe(false);
    });
  });

  describe('validateMarketQuestion', () => {
    it('should accept valid questions', () => {
      expect(validateMarketQuestion('Will BTC reach $200k by end of 2026?').valid).toBe(true);
    });

    it('should reject short questions', () => {
      expect(validateMarketQuestion('Short?').valid).toBe(false);
    });

    it('should reject questions without question mark', () => {
      expect(validateMarketQuestion('This is not a question statement').valid).toBe(false);
    });
  });

  describe('validateNumOutcomes', () => {
    it('should accept 2-4 outcomes', () => {
      expect(validateNumOutcomes(2).valid).toBe(true);
      expect(validateNumOutcomes(3).valid).toBe(true);
      expect(validateNumOutcomes(4).valid).toBe(true);
    });

    it('should reject invalid outcomes', () => {
      expect(validateNumOutcomes(1).valid).toBe(false);
      expect(validateNumOutcomes(5).valid).toBe(false);
    });
  });
});

// ============================================================================
// Hashing
// ============================================================================

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
