import { describe, expect, it } from 'vitest';
import {
  calculateCombinedOddsBps,
  calculateParlayQuote,
  formatParlayOdds,
  formatParlayPayout,
  getMarketProgram,
  oddsBpsToDisplay,
  PARLAY_FEE_BPS,
  PARLAY_ODDS_PRECISION,
  priceToOddsBps,
  type ParlayLeg,
  validateParlayLegs,
  validateParlayStake,
} from '../parlay';
import { createParlayClient } from '../parlay-client';
import { TokenType } from '../types';

// ============================================================================
// Odds Conversion
// ============================================================================

describe('Odds Conversion', () => {
  it('converts AMM price to odds bps', () => {
    expect(priceToOddsBps(0.5)).toBe(20000n);  // 2.0x
    expect(priceToOddsBps(0.4)).toBe(25000n);  // 2.5x
    expect(priceToOddsBps(0.25)).toBe(40000n); // 4.0x
    expect(priceToOddsBps(0.1)).toBe(100000n); // 10.0x
  });

  it('handles edge case prices', () => {
    expect(priceToOddsBps(0)).toBe(PARLAY_ODDS_PRECISION);
    expect(priceToOddsBps(1)).toBe(PARLAY_ODDS_PRECISION);
    expect(priceToOddsBps(-0.1)).toBe(PARLAY_ODDS_PRECISION);
  });

  it('converts odds bps to display', () => {
    expect(oddsBpsToDisplay(25000n)).toBeCloseTo(2.5);
    expect(oddsBpsToDisplay(40000n)).toBeCloseTo(4.0);
    expect(oddsBpsToDisplay(10000n)).toBeCloseTo(1.0);
  });
});

// ============================================================================
// Combined Odds
// ============================================================================

describe('Combined Odds Calculation', () => {
  const makeLeg = (oddsBps: bigint, i: number): ParlayLeg => ({
    marketId: `market_${i}field`,
    marketProgram: 1,
    outcome: 1,
    oddsBps,
  });

  it('calculates 2-leg parlay combined odds', () => {
    // 2.5x × 3.0x = 7.5x
    const legs = [makeLeg(25000n, 1), makeLeg(30000n, 2)];
    const combined = calculateCombinedOddsBps(legs);
    expect(combined).toBe(75000n);
    expect(oddsBpsToDisplay(combined)).toBeCloseTo(7.5);
  });

  it('calculates 3-leg parlay combined odds', () => {
    // 2.0x × 2.0x × 2.0x = 8.0x
    const legs = [makeLeg(20000n, 1), makeLeg(20000n, 2), makeLeg(20000n, 3)];
    const combined = calculateCombinedOddsBps(legs);
    expect(combined).toBe(80000n);
    expect(oddsBpsToDisplay(combined)).toBeCloseTo(8.0);
  });

  it('calculates 4-leg parlay combined odds', () => {
    // 2.5x × 3.0x × 4.0x × 2.0x = 60x
    const legs = [
      makeLeg(25000n, 1),
      makeLeg(30000n, 2),
      makeLeg(40000n, 3),
      makeLeg(20000n, 4),
    ];
    const combined = calculateCombinedOddsBps(legs);
    expect(combined).toBe(600000n);
    expect(oddsBpsToDisplay(combined)).toBeCloseTo(60.0);
  });

  it('returns 0 for invalid leg counts', () => {
    expect(calculateCombinedOddsBps([])).toBe(0n);
    expect(calculateCombinedOddsBps([makeLeg(20000n, 1)])).toBe(0n);
  });
});

// ============================================================================
// Parlay Quote
// ============================================================================

describe('Parlay Quote', () => {
  const legs: ParlayLeg[] = [
    { marketId: 'market_1field', marketProgram: 1, outcome: 1, oddsBps: 25000n },
    { marketId: 'market_2field', marketProgram: 2, outcome: 2, oddsBps: 30000n },
  ];

  it('calculates full quote with fees', () => {
    const quote = calculateParlayQuote(legs, 1_000_000n, TokenType.ALEO);

    // 2.5x × 3.0x = 7.5x
    expect(quote.combinedOddsBps).toBe(75000n);
    expect(quote.combinedOdds).toBeCloseTo(7.5);

    // Gross: 1_000_000 × 7.5 = 7_500_000
    expect(quote.grossPayout).toBe(7_500_000n);

    // Fee: 7_500_000 × 200 / 10000 = 150_000
    expect(quote.fee).toBe(150_000n);

    // Net: 7_500_000 - 150_000 = 7_350_000
    expect(quote.netPayout).toBe(7_350_000n);
  });

  it('handles custom fee bps', () => {
    const quote = calculateParlayQuote(legs, 1_000_000n, TokenType.ALEO, 500n);
    // Fee: 7_500_000 × 500 / 10000 = 375_000
    expect(quote.fee).toBe(375_000n);
    expect(quote.netPayout).toBe(7_125_000n);
  });

  it('handles USDCX token type', () => {
    const quote = calculateParlayQuote(legs, 5_000_000n, TokenType.USDCX);
    expect(quote.tokenType).toBe(TokenType.USDCX);
    expect(quote.grossPayout).toBe(37_500_000n);
  });

  it('handles USAD token type', () => {
    const quote = calculateParlayQuote(legs, 2_000_000n, TokenType.USAD);
    expect(quote.tokenType).toBe(TokenType.USAD);
    expect(quote.grossPayout).toBe(15_000_000n);
  });
});

// ============================================================================
// Validation
// ============================================================================

describe('Parlay Validation', () => {
  const validLeg = (id: number): ParlayLeg => ({
    marketId: `market_${id}field`,
    marketProgram: 1,
    outcome: 1,
    oddsBps: 25000n,
  });

  it('accepts valid 2-4 leg parlays', () => {
    expect(validateParlayLegs([validLeg(1), validLeg(2)]).valid).toBe(true);
    expect(validateParlayLegs([validLeg(1), validLeg(2), validLeg(3)]).valid).toBe(true);
    expect(validateParlayLegs([validLeg(1), validLeg(2), validLeg(3), validLeg(4)]).valid).toBe(true);
  });

  it('rejects too few or too many legs', () => {
    expect(validateParlayLegs([validLeg(1)]).valid).toBe(false);
    expect(validateParlayLegs([]).valid).toBe(false);
    expect(validateParlayLegs([validLeg(1), validLeg(2), validLeg(3), validLeg(4), validLeg(5)]).valid).toBe(false);
  });

  it('rejects duplicate markets', () => {
    const result = validateParlayLegs([validLeg(1), validLeg(1)]);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Duplicate');
  });

  it('rejects invalid outcomes', () => {
    const badLeg = { ...validLeg(2), outcome: 0 };
    expect(validateParlayLegs([validLeg(1), badLeg]).valid).toBe(false);

    const badLeg5 = { ...validLeg(2), outcome: 5 };
    expect(validateParlayLegs([validLeg(1), badLeg5]).valid).toBe(false);
  });

  it('rejects odds <= 1.0x', () => {
    const badLeg = { ...validLeg(2), oddsBps: 10000n }; // 1.0x = not valid (must be >)
    expect(validateParlayLegs([validLeg(1), badLeg]).valid).toBe(false);
  });

  it('rejects odds > 100x per leg', () => {
    const badLeg = { ...validLeg(2), oddsBps: 1_000_001n };
    expect(validateParlayLegs([validLeg(1), badLeg]).valid).toBe(false);
  });

  it('validates stake amounts', () => {
    expect(validateParlayStake(1_000_000n, 10_000_000n).valid).toBe(true);
    expect(validateParlayStake(0n, 10_000_000n).valid).toBe(false);
    expect(validateParlayStake(50000n, 10_000_000n).valid).toBe(false); // below min
    expect(validateParlayStake(20_000_000n, 10_000_000n).valid).toBe(false); // exceeds balance
  });
});

// ============================================================================
// Formatting
// ============================================================================

describe('Formatting', () => {
  it('formats odds for display', () => {
    expect(formatParlayOdds(25000n)).toBe('2.50x');
    expect(formatParlayOdds(100000n)).toBe('10.00x');
    expect(formatParlayOdds(15000n)).toBe('1.50x');
  });

  it('formats payout for display', () => {
    expect(formatParlayPayout(1_000_000n, 75000n, 'ALEO')).toBe('7.35 ALEO');
    expect(formatParlayPayout(2_000_000n, 30000n, 'USDCX')).toBe('5.88 USDCX');
  });
});

// ============================================================================
// Market Program Helper
// ============================================================================

describe('getMarketProgram', () => {
  it('maps token types to program identifiers', () => {
    expect(getMarketProgram(TokenType.ALEO)).toBe(1);
    expect(getMarketProgram(TokenType.USDCX)).toBe(2);
    expect(getMarketProgram(TokenType.USAD)).toBe(3);
  });
});

// ============================================================================
// Parlay Client — Transaction Builders
// ============================================================================

describe('ParlayClient', () => {
  const client = createParlayClient({ network: 'testnet' });

  const legs: ParlayLeg[] = [
    { marketId: 'abc123field', marketProgram: 1, outcome: 1, oddsBps: 25000n },
    { marketId: 'def456field', marketProgram: 2, outcome: 2, oddsBps: 30000n },
  ];

  it('builds create_parlay_aleo inputs', () => {
    const result = client.buildCreateParlayAleoInputs(legs, 1_000_000n, 'nonce123field', 'credits_record');
    expect(result.functionName).toBe('create_parlay_aleo');
    expect(result.inputs[0]).toBe('credits_record');
    expect(result.inputs[1]).toBe('nonce123field');
    expect(result.inputs[2]).toBe('2u8');
    expect(result.inputs[3]).toBe('1000000u128');
    // Legs are struct literals
    expect(result.inputs[4]).toBe('{ market_id: abc123field, market_program: 1u8, outcome: 1u8, odds_bps: 25000u128 }');
    expect(result.inputs[5]).toBe('{ market_id: def456field, market_program: 2u8, outcome: 2u8, odds_bps: 30000u128 }');
    // Legs 3-4 are zero-padded structs
    expect(result.inputs[6]).toBe('{ market_id: 0field, market_program: 0u8, outcome: 0u8, odds_bps: 0u128 }');
    expect(result.inputs[7]).toBe('{ market_id: 0field, market_program: 0u8, outcome: 0u8, odds_bps: 0u128 }');
  });

  it('builds create_parlay_usdcx inputs', () => {
    const result = client.buildCreateParlayUsdcxInputs(legs, 1_000_000n, 'nonce123field', 'token_record', 'proofs');
    expect(result.functionName).toBe('create_parlay_usdcx');
    expect(result.inputs[0]).toBe('token_record');
    expect(result.inputs[1]).toBe('proofs');
    expect(result.inputs[2]).toBe('nonce123field');
  });

  it('builds create_parlay_usad inputs', () => {
    const result = client.buildCreateParlayUsadInputs(legs, 1_000_000n, 'nonce123field', 'token_record', 'proofs');
    expect(result.functionName).toBe('create_parlay_usad');
  });

  it('auto-selects token variant for createParlay', () => {
    const aleo = client.buildCreateParlayInputs(legs, 1_000_000n, 'nonce', TokenType.ALEO, 'cred');
    expect(aleo.functionName).toBe('create_parlay_aleo');

    const usdcx = client.buildCreateParlayInputs(legs, 1_000_000n, 'nonce', TokenType.USDCX, 'tok', 'proofs');
    expect(usdcx.functionName).toBe('create_parlay_usdcx');

    const usad = client.buildCreateParlayInputs(legs, 1_000_000n, 'nonce', TokenType.USAD, 'tok', 'proofs');
    expect(usad.functionName).toBe('create_parlay_usad');
  });

  it('builds submit_resolution inputs', () => {
    const result = client.buildSubmitResolutionInputs('parlay_id_field', [1, 2, 0, 0]);
    expect(result.functionName).toBe('submit_resolution');
    expect(result.inputs).toEqual(['parlay_id_field', '1u8', '2u8', '0u8', '0u8']);
  });

  it('builds finalize_parlay inputs', () => {
    const result = client.buildFinalizeParlayInputs('parlay_id_field');
    expect(result.functionName).toBe('finalize_parlay');
    expect(result.inputs).toEqual(['parlay_id_field']);
  });

  it('builds redeem_parlay inputs per token type', () => {
    expect(client.buildRedeemParlayInputs('ticket', TokenType.ALEO).functionName).toBe('redeem_parlay_aleo');
    expect(client.buildRedeemParlayInputs('ticket', TokenType.USDCX).functionName).toBe('redeem_parlay_usdcx');
    expect(client.buildRedeemParlayInputs('ticket', TokenType.USAD).functionName).toBe('redeem_parlay_usad');
  });

  it('builds cancel_parlay inputs per token type', () => {
    expect(client.buildCancelParlayInputs('ticket', TokenType.ALEO).functionName).toBe('cancel_parlay_aleo');
    expect(client.buildCancelParlayInputs('ticket', TokenType.USDCX).functionName).toBe('cancel_parlay_usdcx');
    expect(client.buildCancelParlayInputs('ticket', TokenType.USAD).functionName).toBe('cancel_parlay_usad');
  });

  it('builds dispute inputs', () => {
    const result = client.buildDisputeInputs('parlay123field', 'credits_rec');
    expect(result.functionName).toBe('dispute_parlay_resolution');
    expect(result.inputs[0]).toBe('credits_rec');
    expect(result.inputs[1]).toBe('parlay123field');
  });

  it('builds fund_pool inputs per token type', () => {
    expect(client.buildFundPoolInputs(5_000_000n, TokenType.ALEO, 'cred').functionName).toBe('fund_pool_aleo');
    expect(client.buildFundPoolInputs(5_000_000n, TokenType.USDCX, 'tok', 'proofs').functionName).toBe('fund_pool_usdcx');
    expect(client.buildFundPoolInputs(5_000_000n, TokenType.USAD, 'tok', 'proofs').functionName).toBe('fund_pool_usad');
  });

  it('parses ParlayTicket record', () => {
    const record = {
      owner: 'aleo1test',
      parlay_id: 'abc123field',
      stake: '1000000u128',
      potential_payout: '7500000u128',
      token_type: '1u8',
      ticket_nonce: 'nonce123field',
    };

    const parsed = client.parseParlayTicketRecord(record);
    expect(parsed.stake).toBe(1_000_000n);
    expect(parsed.potentialPayout).toBe(7_500_000n);
    expect(parsed.tokenType).toBe(TokenType.ALEO);
    expect(parsed.ticketNonce).toBe('nonce123field');
  });

  // New transition builders (gap fixes)

  it('builds claim_dispute_bond inputs', () => {
    const result = client.buildClaimDisputeBondInputs('parlay123field');
    expect(result.functionName).toBe('claim_dispute_bond');
    expect(result.inputs).toEqual(['parlay123field']);
  });

  it('builds submit_cancel_proof inputs', () => {
    const result = client.buildSubmitCancelProofInputs('parlay123field', 'market456field');
    expect(result.functionName).toBe('submit_cancel_proof');
    expect(result.inputs).toEqual(['parlay123field', 'market456field']);
  });

  it('builds withdraw_pool inputs per token type', () => {
    expect(client.buildWithdrawPoolInputs(5_000_000n, TokenType.ALEO).functionName).toBe('withdraw_pool_aleo');
    expect(client.buildWithdrawPoolInputs(5_000_000n, TokenType.USDCX).functionName).toBe('withdraw_pool_usdcx');
    expect(client.buildWithdrawPoolInputs(5_000_000n, TokenType.USAD).functionName).toBe('withdraw_pool_usad');
    expect(client.buildWithdrawPoolInputs(5_000_000n, TokenType.ALEO).inputs).toEqual(['5000000u128']);
  });

  it('builds withdraw_treasury inputs per token type', () => {
    expect(client.buildWithdrawTreasuryInputs(1_000_000n, TokenType.ALEO).functionName).toBe('withdraw_treasury_aleo');
    expect(client.buildWithdrawTreasuryInputs(1_000_000n, TokenType.USDCX).functionName).toBe('withdraw_treasury_usdcx');
    expect(client.buildWithdrawTreasuryInputs(1_000_000n, TokenType.USAD).functionName).toBe('withdraw_treasury_usad');
  });

});
