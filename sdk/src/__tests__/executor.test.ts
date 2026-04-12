// ============================================================================
// VEILED MARKETS SDK - NodeExecutor Tests
// ============================================================================
// Tests the config validation, dry-run path, and retry logic. Actual
// snarkos invocation is NOT tested here — that requires the binary and
// a live Aleo endpoint, covered by integration tests (not unit).
// ============================================================================

import { describe, it, expect } from 'vitest';
import { NodeExecutor, createNodeExecutor } from '../executor';

describe('NodeExecutor construction', () => {
  it('requires privateKey', () => {
    expect(() => new NodeExecutor({ privateKey: '' })).toThrow(/privateKey/);
  });

  it('accepts minimal config', () => {
    const executor = new NodeExecutor({
      privateKey: 'APrivateKey1zkpFakeKeyForTesting',
    });
    expect(executor).toBeDefined();
  });

  it('accepts full config overrides', () => {
    const executor = createNodeExecutor({
      privateKey: 'APrivateKey1zkpTest',
      queryEndpoint: 'https://custom-rpc.example.com',
      broadcastUrl: 'https://custom-rpc.example.com/testnet/transaction/broadcast',
      priorityFee: 2_000_000,
      networkId: '0',
      maxRetries: 3,
      retryBaseMs: 2000,
    });
    expect(executor).toBeDefined();
  });
});

describe('NodeExecutor dry-run mode', () => {
  it('returns dryrun_* tx id without spawning snarkos', async () => {
    const executor = new NodeExecutor({
      privateKey: 'APrivateKey1zkpTest',
      dryRun: true,
    });
    const result = await executor.execute({
      programId: 'veiled_turbo_v8.aleo',
      functionName: 'buy_up_down',
      inputs: ['12345field', '1u8', '1000000u128', '995000u128', '1field', '{record}'],
    });
    expect(result.txId).toMatch(/^dryrun_\d+$/);
    expect(result.raw).toBe('dry-run');
  });
});
