// ============================================================================
// VEILED MARKETS SDK - PythHermesClient Tests
// ============================================================================

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  PythHermesClient,
  createPythHermesClient,
  PYTH_FEED_IDS,
} from '../pyth-client';

global.fetch = vi.fn();

describe('PythHermesClient config', () => {
  it('uses default Hermes URL', () => {
    const client = createPythHermesClient();
    expect(client).toBeDefined();
  });

  it('accepts custom baseUrl and tolerance', () => {
    const client = createPythHermesClient({
      baseUrl: 'https://custom-hermes.example.com',
      matchTolerance: 0.005,
    });
    expect(client).toBeDefined();
  });
});

describe('PythHermesClient.fetchLatest', () => {
  let client: PythHermesClient;
  beforeEach(() => {
    client = createPythHermesClient();
    vi.clearAllMocks();
  });
  afterEach(() => { vi.clearAllMocks(); });

  it('returns a parsed quote for a valid symbol', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        parsed: [
          {
            id: PYTH_FEED_IDS.BTC,
            price: {
              price: '7275000000000',    // 72,750.00
              conf: '2500000000',        // 25.00
              expo: -8,                  // scale by 10^-8
              publish_time: 1712345678,
            },
          },
        ],
      }),
    });
    const q = await client.fetchLatest('BTC');
    expect(q).not.toBeNull();
    expect(q!.symbol).toBe('BTC');
    expect(q!.feedId).toBe(PYTH_FEED_IDS.BTC);
    expect(q!.price).toBeCloseTo(72750, 0);
    expect(q!.conf).toBeCloseTo(25, 0);
    expect(q!.publishTime).toBe(1712345678000); // converted to ms
  });

  it('returns null for unknown symbol', async () => {
    const q = await client.fetchLatest('XYZ');
    expect(q).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns null on HTTP error', async () => {
    (global.fetch as any).mockResolvedValueOnce({ ok: false });
    expect(await client.fetchLatest('BTC')).toBeNull();
  });
});

describe('PythHermesClient.fetchHistorical', () => {
  let client: PythHermesClient;
  beforeEach(() => {
    client = createPythHermesClient();
    vi.clearAllMocks();
  });
  afterEach(() => { vi.clearAllMocks(); });

  it('calls the /v2/updates/price/:ts endpoint', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        parsed: [
          {
            id: PYTH_FEED_IDS.ETH,
            price: { price: '225000000000', conf: '100000000', expo: -8, publish_time: 1712345678 },
          },
        ],
      }),
    });
    const q = await client.fetchHistorical('ETH', 1712345678);
    expect(q).not.toBeNull();
    expect(q!.price).toBeCloseTo(2250, 0);

    const url = (global.fetch as any).mock.calls[0][0] as string;
    expect(url).toContain('/v2/updates/price/1712345678');
    expect(url).toContain(`ids[]=${PYTH_FEED_IDS.ETH}`);
    expect(url).toContain('parsed=true');
  });

  it('rejects invalid timestamps', async () => {
    expect(await client.fetchHistorical('BTC', NaN)).toBeNull();
    expect(await client.fetchHistorical('BTC', -1)).toBeNull();
    expect(await client.fetchHistorical('BTC', 0)).toBeNull();
  });
});

describe('PythHermesClient.verifyTurboMarket', () => {
  afterEach(() => { vi.clearAllMocks(); });

  it('verifies a turbo market with matching prices', async () => {
    // Mock turboClient.getMarket to return a resolved market
    const mockTurboClient = {
      getMarket: vi.fn().mockResolvedValue({
        id: '12345field',
        symbolId: 1, // BTC
        baselinePrice: 72000_000_000n, // 72,000 (expo -6 micro)
        closingPrice: 72100_000_000n,
        status: 2,
        winningOutcome: 1,
        baselineBlock: 100n,
        deadline: 175n,
        creator: 'aleo1xxx',
        resolutionDeadline: 475n,
        createdAt: 100n,
      }),
    } as unknown as import('../turbo-client').TurboClient;

    // Mock Pyth Hermes to return matching prices
    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          parsed: [
            {
              id: PYTH_FEED_IDS.BTC,
              price: { price: '72000000000', conf: '5000000', expo: -6, publish_time: 1712000000 },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          parsed: [
            {
              id: PYTH_FEED_IDS.BTC,
              price: { price: '72100000000', conf: '5000000', expo: -6, publish_time: 1712000300 },
            },
          ],
        }),
      });

    const pyth = createPythHermesClient();
    const result = await pyth.verifyTurboMarket(mockTurboClient, '12345field', {
      baselinePublishTimeMs: 1712000000_000,
      closingPublishTimeMs: 1712000300_000,
    });

    expect(result.baseline).not.toBeNull();
    expect(result.baseline!.onChainPrice).toBeCloseTo(72000, 0);
    expect(result.baseline!.pythPrice).toBeCloseTo(72000, 0);
    expect(result.baseline!.match).toBe(true);

    expect(result.closing).not.toBeNull();
    expect(result.closing!.onChainPrice).toBeCloseTo(72100, 0);
    expect(result.closing!.match).toBe(true);
  });

  it('detects price mismatch beyond tolerance', async () => {
    const mockTurboClient = {
      getMarket: vi.fn().mockResolvedValue({
        id: '12345field',
        symbolId: 1,
        baselinePrice: 72000_000_000n,
        closingPrice: 0n,
        status: 1, // active, no closing
        winningOutcome: 0,
        baselineBlock: 100n,
        deadline: 175n,
        creator: 'aleo1xxx',
        resolutionDeadline: 475n,
        createdAt: 100n,
      }),
    } as unknown as import('../turbo-client').TurboClient;

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        parsed: [
          {
            id: PYTH_FEED_IDS.BTC,
            // Pyth reports 73,500 — very different from on-chain 72,000
            price: { price: '73500000000', conf: '5000000', expo: -6, publish_time: 1712000000 },
          },
        ],
      }),
    });

    const pyth = createPythHermesClient({ matchTolerance: 0.001 });
    const result = await pyth.verifyTurboMarket(mockTurboClient, '12345field', {
      baselinePublishTimeMs: 1712000000_000,
    });

    expect(result.baseline).not.toBeNull();
    expect(result.baseline!.match).toBe(false);
    expect(result.baseline!.deltaFraction).toBeGreaterThan(0.001);
    expect(result.closing).toBeNull(); // market still active
  });

  it('returns nulls for non-existent market', async () => {
    const mockTurboClient = {
      getMarket: vi.fn().mockResolvedValue(null),
    } as unknown as import('../turbo-client').TurboClient;

    const pyth = createPythHermesClient();
    const result = await pyth.verifyTurboMarket(mockTurboClient, 'nonexistentfield');
    expect(result.baseline).toBeNull();
    expect(result.closing).toBeNull();
  });
});
