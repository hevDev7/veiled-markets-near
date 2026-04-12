// ============================================================================
// VEILED MARKETS SDK - TurboClient Tests
// ============================================================================
// Covers:
//   - quoteBuyUpDown arithmetic matches contract (buy_up_down_fin)
//   - quoteTurboPayout matches contract (claim_winnings_fin)
//   - parseTurboShareRecord roundtrips realistic wallet output
//   - Transaction builders produce the exact input array the contract
//     signature expects
//   - On-chain read helpers correctly parse Leo struct literals
// ============================================================================

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  TurboClient,
  createTurboClient,
  quoteBuyUpDown,
  quoteTurboPayout,
  parseTurboShareRecord,
} from '../turbo-client';
import {
  PROGRAM_IDS,
  TURBO_OUTCOME,
  TURBO_MIN_TRADE_AMOUNT,
  TurboMarketStatus,
} from '../types';

global.fetch = vi.fn();

describe('quoteBuyUpDown', () => {
  it('computes fee and shares for 1 ALEO bet', () => {
    const q = quoteBuyUpDown(1_000_000n); // 1 ALEO
    expect(q.amountIn).toBe(1_000_000n);
    expect(q.protocolFee).toBe(5_000n); // 0.5% of 1_000_000
    expect(q.amountToPool).toBe(995_000n);
    expect(q.expectedShares).toBe(995_000n); // parimutuel 1:1
  });

  it('computes fee for 100 ALEO bet', () => {
    const q = quoteBuyUpDown(100_000_000n);
    expect(q.protocolFee).toBe(500_000n);
    expect(q.amountToPool).toBe(99_500_000n);
    expect(q.expectedShares).toBe(99_500_000n);
  });

  it('throws when amountIn below MIN_TRADE_AMOUNT', () => {
    expect(() => quoteBuyUpDown(999n)).toThrow(/≥ 1000 microcredits/);
  });

  it('accepts the exact MIN_TRADE_AMOUNT', () => {
    const q = quoteBuyUpDown(TURBO_MIN_TRADE_AMOUNT);
    expect(q.amountIn).toBe(1000n);
    // 1000 × 50 / 10000 = 5
    expect(q.protocolFee).toBe(5n);
    expect(q.expectedShares).toBe(995n);
  });
});

describe('quoteTurboPayout', () => {
  it('sole winner gets back their own net stake minus protocol fee', () => {
    // 1 user bet 1 ALEO on UP, no one on DOWN, UP wins:
    // pool.total_up_shares = 995_000, market_payouts = 995_000
    const payout = quoteTurboPayout(995_000n, 995_000n, 995_000n);
    expect(payout).toBe(995_000n);
  });

  it('splits pool across multiple winners proportionally', () => {
    // 2 winners each bet 1 ALEO on UP, loser bet 1 ALEO on DOWN:
    // total_up_shares = 1_990_000, market_payouts = 2_985_000
    // Each winner's share = 995_000
    // payout = (995_000 × 2_985_000) / 1_990_000 = 1_492_500
    const payout = quoteTurboPayout(995_000n, 2_985_000n, 1_990_000n);
    expect(payout).toBe(1_492_500n);
  });

  it('sole winner against 2 losers wins 3× stake', () => {
    // 1 winner bet 1 ALEO, 2 losers bet 1 ALEO each:
    // total_up_shares = 995_000, market_payouts = 2_985_000
    // payout = (995_000 × 2_985_000) / 995_000 = 2_985_000
    const payout = quoteTurboPayout(995_000n, 2_985_000n, 995_000n);
    expect(payout).toBe(2_985_000n);
  });

  it('returns 0 when total winning shares is 0', () => {
    // Guard: should never happen in valid markets, but defensive
    expect(quoteTurboPayout(995_000n, 995_000n, 0n)).toBe(0n);
  });

  it('uses truncating integer division (Leo u128 semantics)', () => {
    // 100 × 333 / 1000 = 33_300 / 1000 = 33 (truncates 0.3)
    const payout = quoteTurboPayout(100n, 333n, 1000n);
    expect(payout).toBe(33n);
  });
});

describe('parseTurboShareRecord', () => {
  it('parses a Shield wallet record with .private annotations', () => {
    const text = `{
  owner: aleo1xaytw2vtvhz2szhgjzqetadzjd92w2fdx233vq4fq3jdfd9ety8sna28t3.private,
  market_id: 7967815297976394251750780106871590127186163035743844152665110178164624084746field.private,
  side: 2u8.private,
  quantity: 995000u128.private,
  share_nonce: 1234567890field.private,
  _nonce: 5555555555555555555555555555555555555555555555555555555555555555group.public
}`;
    const parsed = parseTurboShareRecord(text);
    expect(parsed).not.toBeNull();
    expect(parsed!.owner).toBe('aleo1xaytw2vtvhz2szhgjzqetadzjd92w2fdx233vq4fq3jdfd9ety8sna28t3');
    expect(parsed!.marketId).toBe('7967815297976394251750780106871590127186163035743844152665110178164624084746field');
    expect(parsed!.side).toBe('DOWN');
    expect(parsed!.quantity).toBe(995_000n);
    expect(parsed!.shareNonce).toBe('1234567890field');
    expect(parsed!.plaintext).toBe(text);
  });

  it('parses a plain Leo record literal (no annotations)', () => {
    const text = `{ owner: aleo1abc, market_id: 555field, side: 1u8, quantity: 100000u128, share_nonce: 789field }`;
    const parsed = parseTurboShareRecord(text);
    expect(parsed).not.toBeNull();
    expect(parsed!.side).toBe('UP');
    expect(parsed!.quantity).toBe(100_000n);
  });

  it('returns null for malformed or non-TurboShare records', () => {
    // v37 OutcomeShare uses `outcome:` not `side:` — should be rejected
    const outcomeShare = `{ owner: aleo1abc, market_id: 555field, outcome: 1u8, quantity: 100u128 }`;
    expect(parseTurboShareRecord(outcomeShare)).toBeNull();
  });

  it('returns null for unknown side values', () => {
    const text = `{ owner: aleo1abc, market_id: 555field, side: 99u8, quantity: 100u128, share_nonce: 1field }`;
    expect(parseTurboShareRecord(text)).toBeNull();
  });
});

describe('TurboClient config', () => {
  it('defaults to testnet + PROGRAM_IDS.TURBO', () => {
    const client = createTurboClient();
    expect(client.network).toBe('testnet');
    expect(client.programId).toBe(PROGRAM_IDS.TURBO);
    expect(client.rpcUrl).toContain('testnet');
    expect(client.explorerUrl).toContain('testnet');
  });

  it('honors mainnet config', () => {
    const client = createTurboClient({ network: 'mainnet' });
    expect(client.network).toBe('mainnet');
    expect(client.rpcUrl).toContain('mainnet');
    expect(client.explorerUrl).not.toContain('testnet');
  });

  it('allows custom programId override', () => {
    const client = createTurboClient({ programId: 'veiled_turbo_v9.aleo' });
    expect(client.programId).toBe('veiled_turbo_v9.aleo');
  });
});

describe('TurboClient.buildBuyUpDownInputs', () => {
  let client: TurboClient;
  beforeEach(() => {
    client = createTurboClient({ network: 'testnet' });
  });

  it('produces the exact input array the contract signature expects', () => {
    const call = client.buildBuyUpDownInputs({
      marketId: '12345field',
      side: 'UP',
      amountIn: 1_000_000n,
      expectedShares: 995_000n,
      shareNonce: '99999field',
      creditsRecord: '{ owner: aleo1xxx, microcredits: 5000000u64 }',
    });
    expect(call.programId).toBe(PROGRAM_IDS.TURBO);
    expect(call.functionName).toBe('buy_up_down');
    expect(call.inputs).toEqual([
      '12345field',
      `${TURBO_OUTCOME.UP}u8`,
      '1000000u128',
      '995000u128',
      '99999field',
      '{ owner: aleo1xxx, microcredits: 5000000u64 }',
    ]);
    expect(call.shareNonce).toBe('99999field');
  });

  it('auto-generates shareNonce when omitted', () => {
    const call = client.buildBuyUpDownInputs({
      marketId: '12345field',
      side: 'DOWN',
      amountIn: 1_000_000n,
      expectedShares: 995_000n,
      creditsRecord: '{ owner: aleo1xxx, microcredits: 5000000u64 }',
    });
    expect(call.shareNonce).toMatch(/^\d+field$/);
    expect(call.inputs[4]).toBe(call.shareNonce);
  });

  it('maps DOWN to u8 = 2', () => {
    const call = client.buildBuyUpDownInputs({
      marketId: '12345field',
      side: 'DOWN',
      amountIn: 1_000_000n,
      expectedShares: 995_000n,
      shareNonce: '1field',
      creditsRecord: '{}',
    });
    expect(call.inputs[1]).toBe(`${TURBO_OUTCOME.DOWN}u8`);
  });
});

describe('TurboClient.buildClaimWinningsInputs', () => {
  it('builds claim_winnings call with exact declared_payout', () => {
    const client = createTurboClient();
    const call = client.buildClaimWinningsInputs({
      marketId: '12345field',
      shareRecord: '{ owner: aleo1xxx, market_id: 12345field, side: 1u8, quantity: 995000u128, share_nonce: 99field }',
      declaredPayout: 1_492_500n,
    });
    expect(call.functionName).toBe('claim_winnings');
    expect(call.inputs[0]).toBe('12345field');
    expect(call.inputs[1]).toContain('side: 1u8');
    expect(call.inputs[2]).toBe('1492500u128');
  });
});

describe('TurboClient.buildClaimRefundInputs', () => {
  it('builds claim_refund call with expected amount', () => {
    const client = createTurboClient();
    const call = client.buildClaimRefundInputs({
      marketId: '12345field',
      shareRecord: '{...}',
      expectedAmount: 995_000n,
    });
    expect(call.functionName).toBe('claim_refund');
    expect(call.inputs[2]).toBe('995000u128');
  });
});

describe('TurboClient.buildEmergencyCancelInputs', () => {
  it('takes only the market id', () => {
    const client = createTurboClient();
    const call = client.buildEmergencyCancelInputs('12345field');
    expect(call.functionName).toBe('emergency_cancel');
    expect(call.inputs).toEqual(['12345field']);
  });
});

describe('TurboClient.getMarket', () => {
  afterEach(() => { vi.clearAllMocks(); });

  it('parses a resolved market struct from the RPC response', async () => {
    const mockResponse = `"{\\n  id: 12345field,\\n  creator: aleo10tm5ektsr5v7kdc5phs8pha42vrkhe2rlxfl2v979wunhzx07vpqnqplv8,\\n  symbol_id: 1u8,\\n  baseline_price: 72749703357u128,\\n  baseline_block: 15716026u64,\\n  deadline: 15716101u64,\\n  resolution_deadline: 15716401u64,\\n  closing_price: 72800000000u128,\\n  winning_outcome: 1u8,\\n  status: 2u8,\\n  created_at: 15716029u64\\n}"`;
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      text: async () => mockResponse,
    });

    const client = createTurboClient({ network: 'testnet' });
    const m = await client.getMarket('12345field');
    expect(m).not.toBeNull();
    expect(m!.id).toBe('12345field');
    expect(m!.symbolId).toBe(1);
    expect(m!.baselinePrice).toBe(72_749_703_357n);
    expect(m!.closingPrice).toBe(72_800_000_000n);
    expect(m!.winningOutcome).toBe(1);
    expect(m!.status).toBe(TurboMarketStatus.Resolved);
    expect(m!.deadline).toBe(15_716_101n);
  });

  it('returns null when mapping key is missing', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      text: async () => '"null"',
    });
    const client = createTurboClient();
    expect(await client.getMarket('nonexistentfield')).toBeNull();
  });

  it('returns null on RPC error', async () => {
    (global.fetch as any).mockResolvedValueOnce({ ok: false });
    const client = createTurboClient();
    expect(await client.getMarket('12345field')).toBeNull();
  });
});

describe('TurboClient.getPool', () => {
  afterEach(() => { vi.clearAllMocks(); });

  it('parses a pool struct with bets on both sides', async () => {
    const mockResponse = `"{\\n  market_id: 12345field,\\n  total_up_amount: 1990000u128,\\n  total_down_amount: 995000u128,\\n  total_up_shares: 1990000u128,\\n  total_down_shares: 995000u128,\\n  total_volume: 3000000u128\\n}"`;
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      text: async () => mockResponse,
    });
    const client = createTurboClient();
    const pool = await client.getPool('12345field');
    expect(pool).not.toBeNull();
    expect(pool!.totalUpAmount).toBe(1_990_000n);
    expect(pool!.totalDownAmount).toBe(995_000n);
    expect(pool!.totalUpShares).toBe(1_990_000n);
    expect(pool!.totalDownShares).toBe(995_000n);
    expect(pool!.totalVolume).toBe(3_000_000n);
  });
});

describe('TurboClient.getMarketPayouts', () => {
  afterEach(() => { vi.clearAllMocks(); });

  it('parses a u128 payout value', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      text: async () => '"2985000u128"',
    });
    const client = createTurboClient();
    expect(await client.getMarketPayouts('12345field')).toBe(2_985_000n);
  });

  it('returns null for unresolved markets', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      text: async () => '"null"',
    });
    const client = createTurboClient();
    expect(await client.getMarketPayouts('12345field')).toBeNull();
  });
});

describe('TurboClient.getVaultBalance', () => {
  afterEach(() => { vi.clearAllMocks(); });

  it('parses the shared vault balance', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      text: async () => '"62015000u128"',
    });
    const client = createTurboClient();
    expect(await client.getVaultBalance()).toBe(62_015_000n);
  });
});

describe('TurboClient URL helpers', () => {
  it('builds correct testnet transaction URL', () => {
    const client = createTurboClient({ network: 'testnet' });
    const url = client.getTransactionUrl('at1abc');
    expect(url).toBe('https://testnet.explorer.provable.com/transaction/at1abc');
  });

  it('builds verify URL with relative path', () => {
    const client = createTurboClient();
    expect(client.getVerifyUrl('12345field')).toBe('/verify/turbo/12345field');
    expect(client.getVerifyUrl('12345field', 'https://veiledmarkets.xyz'))
      .toBe('https://veiledmarkets.xyz/verify/turbo/12345field');
  });
});
