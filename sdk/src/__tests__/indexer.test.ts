// ============================================================================
// VEILED MARKETS SDK - IndexerClient Tests
// ============================================================================

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { IndexerClient, createIndexerClient } from '../indexer';
import { MarketCategory } from '../types';

global.fetch = vi.fn();

describe('IndexerClient construction', () => {
  it('requires supabaseUrl and supabaseKey', () => {
    expect(() => new IndexerClient({ supabaseUrl: '', supabaseKey: '' }))
      .toThrow(/supabaseUrl and supabaseKey/);
    expect(() => new IndexerClient({ supabaseUrl: 'https://x.supabase.co', supabaseKey: '' }))
      .toThrow();
    expect(() => new IndexerClient({ supabaseUrl: '', supabaseKey: 'xxx' }))
      .toThrow();
  });

  it('strips trailing slash from supabaseUrl', () => {
    const client = createIndexerClient({
      supabaseUrl: 'https://x.supabase.co/',
      supabaseKey: 'anon',
    });
    expect(client).toBeDefined();
  });
});

describe('IndexerClient.listMarkets', () => {
  let client: IndexerClient;
  beforeEach(() => {
    client = createIndexerClient({
      supabaseUrl: 'https://x.supabase.co',
      supabaseKey: 'anon',
    });
    vi.clearAllMocks();
  });

  afterEach(() => { vi.clearAllMocks(); });

  it('parses a list of market rows', async () => {
    const mockRows = [
      {
        market_id: '12345field',
        question_hash: '67890field',
        question_text: 'Will BTC hit $100k?',
        description: 'Binary outcome',
        resolution_source: 'CoinGecko',
        category: 3,
        creator_address: 'aleo1xxx',
        transaction_id: 'at1yyy',
        created_at: 1712345678,
        ipfs_cid: 'Qm123',
        outcome_labels: '["Yes","No"]',
      },
    ];
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockRows,
    });

    const markets = await client.listMarkets({ limit: 10 });
    expect(markets).toHaveLength(1);
    expect(markets[0].marketId).toBe('12345field');
    expect(markets[0].questionText).toBe('Will BTC hit $100k?');
    expect(markets[0].category).toBe(MarketCategory.Crypto);
    expect(markets[0].outcomeLabels).toEqual(['Yes', 'No']);
    expect(markets[0].createdAt).toBe(1712345678);
  });

  it('constructs correct filter URL with category', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });
    await client.listMarkets({ category: MarketCategory.Sports, limit: 5 });
    const calls = (global.fetch as any).mock.calls;
    const url = calls[0][0] as string;
    expect(url).toContain('category=eq.2');
    expect(url).toContain('limit=5');
    expect(url).toContain('order=created_at.desc');
  });

  it('throws on HTTP error', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    });
    await expect(client.listMarkets()).rejects.toThrow(/listMarkets failed: 500/);
  });

  it('supports query/search parameter (ilike)', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });
    await client.listMarkets({ query: 'bitcoin' });
    const url = (global.fetch as any).mock.calls[0][0] as string;
    expect(url).toContain('question_text=ilike.%25bitcoin%25');
  });
});

describe('IndexerClient.getMarket', () => {
  afterEach(() => { vi.clearAllMocks(); });

  it('returns single market by id', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { market_id: '12345field', question_text: 'Test', category: 1 },
      ],
    });
    const client = createIndexerClient({
      supabaseUrl: 'https://x.supabase.co',
      supabaseKey: 'anon',
    });
    const m = await client.getMarket('12345field');
    expect(m).not.toBeNull();
    expect(m!.marketId).toBe('12345field');
  });

  it('returns null for missing market', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });
    const client = createIndexerClient({
      supabaseUrl: 'https://x.supabase.co',
      supabaseKey: 'anon',
    });
    expect(await client.getMarket('missingfield')).toBeNull();
  });
});

describe('IndexerClient.listTurboRounds', () => {
  afterEach(() => { vi.clearAllMocks(); });

  it('filters to event=resolve', async () => {
    const mockRows = [
      {
        id: 1,
        created_at: '2026-04-11T14:24:04Z',
        event: 'resolve',
        market_id: '12345field',
        symbol: 'BTC',
        pyth_price: 72750.5,
        pyth_conf: 25,
        pyth_publish_time: '2026-04-11T14:23:00Z',
        aleo_block: '15716203',
        aleo_tx_id: 'at1resolve',
        operator_address: 'aleo10tm',
        metadata: { baseline_price: 72700 },
      },
    ];
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockRows,
    });
    const client = createIndexerClient({
      supabaseUrl: 'https://x.supabase.co',
      supabaseKey: 'anon',
    });
    const rounds = await client.listTurboRounds('BTC', { limit: 5 });
    expect(rounds).toHaveLength(1);
    expect(rounds[0].event).toBe('resolve');
    expect(rounds[0].symbol).toBe('BTC');
    expect(rounds[0].pythPrice).toBe(72750.5);
    expect(rounds[0].aleoBlock).toBe(15716203n);

    const url = (global.fetch as any).mock.calls[0][0] as string;
    expect(url).toContain('event=eq.resolve');
    expect(url).toContain('symbol=eq.BTC');
    expect(url).toContain('limit=5');
  });
});

describe('IndexerClient.listTurboRoundsJoined', () => {
  afterEach(() => { vi.clearAllMocks(); });

  it('joins create and resolve events by market_id', async () => {
    // Mock 2 fetch calls: resolves first, then creates
    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            id: 2, event: 'resolve', market_id: '111field', symbol: 'BTC',
            pyth_price: 73000, created_at: '2026-04-11T14:30:00Z',
            pyth_publish_time: '2026-04-11T14:29:55Z',
            aleo_block: '15716300',
          },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            id: 1, event: 'create', market_id: '111field', symbol: 'BTC',
            pyth_price: 72900, created_at: '2026-04-11T14:25:00Z',
            pyth_publish_time: '2026-04-11T14:24:55Z',
            aleo_block: '15716225',
          },
        ],
      });

    const client = createIndexerClient({
      supabaseUrl: 'https://x.supabase.co',
      supabaseKey: 'anon',
    });
    const joined = await client.listTurboRoundsJoined('BTC', { limit: 5 });
    expect(joined).toHaveLength(1);
    expect(joined[0].resolve.pythPrice).toBe(73000);
    expect(joined[0].create).not.toBeNull();
    expect(joined[0].create!.pythPrice).toBe(72900);
  });
});

describe('IndexerClient.countTurboRounds', () => {
  afterEach(() => { vi.clearAllMocks(); });

  it('parses Content-Range header for total count', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      headers: { get: (h: string) => h === 'content-range' ? '0-0/42' : null },
      json: async () => [],
    });
    const client = createIndexerClient({
      supabaseUrl: 'https://x.supabase.co',
      supabaseKey: 'anon',
    });
    expect(await client.countTurboRounds('BTC')).toBe(42);
  });

  it('returns 0 when header is missing', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      headers: { get: () => null },
      json: async () => [],
    });
    const client = createIndexerClient({
      supabaseUrl: 'https://x.supabase.co',
      supabaseKey: 'anon',
    });
    expect(await client.countTurboRounds('BTC')).toBe(0);
  });
});
