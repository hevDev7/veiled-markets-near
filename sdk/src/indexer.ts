// ============================================================================
// VEILED MARKETS SDK - Supabase Indexer Client
// ============================================================================
// Read-only query layer for the off-chain Veiled Markets Supabase store.
// The on-chain contracts store data in Leo mappings, but you can't enumerate
// "all active markets" from a mapping — Aleo RPC requires a known key to read.
// The frontend solves this by maintaining a `market_registry` table in
// Supabase that mirrors every `create_market_*` call. This client wraps that
// table (and related ones: `turbo_oracle_audit`, `market_disputes`) behind a
// typed API.
//
// RLS is configured so public `anon` key can SELECT but only the backend
// service_role can INSERT/UPDATE. Pass the ANON key to the constructor —
// the SDK never writes.
// ============================================================================

import type { MarketCategory } from './types';

/**
 * Public market registry row (matches the `market_registry` table in
 * supabase-schema.sql). All fields are public, unencrypted — the private
 * per-user bet records live in a separate table and are not exposed by
 * this client.
 */
export interface MarketRegistryRow {
  marketId: string;              // field literal
  questionHash: string | null;   // field literal
  questionText: string | null;   // human-readable question
  description: string | null;
  resolutionSource: string | null;
  category: MarketCategory | null;
  creatorAddress: string | null;
  transactionId: string | null;  // create_market tx hash
  createdAt: number | null;      // unix seconds
  ipfsCid: string | null;
  outcomeLabels: string[] | null;
}

/**
 * Turbo oracle audit row — matches `turbo_oracle_audit` table
 * (supabase/create_turbo_audit_table.sql). Append-only log of every
 * operator action against `veiled_turbo_v8.aleo`.
 */
export interface TurboAuditRow {
  id: number;
  createdAt: string;             // ISO timestamp
  event: 'create' | 'resolve' | 'cancel';
  marketId: string;
  symbol: string;                // BTC, ETH, SOL, ...
  pythPrice: number;             // baseline on create, closing on resolve
  pythConf: number;
  pythPublishTime: string;       // ISO — Pyth's own publish_time
  aleoBlock: bigint;
  aleoTxId: string | null;
  operatorAddress: string | null;
  metadata: Record<string, unknown>;
}

/**
 * Configuration for the IndexerClient.
 */
export interface IndexerConfig {
  /** Supabase project URL, e.g. `https://xxxxx.supabase.co` */
  supabaseUrl: string;
  /** Supabase anon/public key. Never pass service_role from a client. */
  supabaseKey: string;
}

/**
 * Query options for list endpoints.
 */
export interface ListOptions {
  /** Max rows to return. Default 50. */
  limit?: number;
  /** Offset for pagination (client-side). Default 0. */
  offset?: number;
  /** Filter by category (markets only). */
  category?: MarketCategory;
  /** Full-text filter on `question_text` (case-insensitive contains). */
  query?: string;
  /**
   * Filter by creator address (markets only). Useful for "my markets"
   * views or creator leaderboards.
   */
  creator?: string;
}

/**
 * IndexerClient — typed wrapper around the Supabase PostgREST API.
 *
 * Usage:
 *   const indexer = new IndexerClient({
 *     supabaseUrl: process.env.SUPABASE_URL!,
 *     supabaseKey: process.env.SUPABASE_ANON_KEY!,
 *   });
 *
 *   const markets = await indexer.listMarkets({ limit: 20 });
 *   const btcRounds = await indexer.listTurboRounds('BTC', { limit: 10 });
 */
export class IndexerClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(config: IndexerConfig) {
    if (!config.supabaseUrl || !config.supabaseKey) {
      throw new Error('IndexerClient requires supabaseUrl and supabaseKey');
    }
    this.baseUrl = `${config.supabaseUrl.replace(/\/+$/, '')}/rest/v1`;
    this.headers = {
      apikey: config.supabaseKey,
      authorization: `Bearer ${config.supabaseKey}`,
    };
  }

  // --------------------------------------------------------------------------
  // MARKET REGISTRY
  // --------------------------------------------------------------------------

  /**
   * List markets from the public registry. Returns most recently created
   * first. Use `listOptions.category` / `query` / `creator` to filter.
   */
  async listMarkets(opts: ListOptions = {}): Promise<MarketRegistryRow[]> {
    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;
    const params = new URLSearchParams();
    params.set('select', '*');
    params.set('order', 'created_at.desc');
    params.set('limit', String(limit));
    if (offset > 0) params.set('offset', String(offset));
    if (opts.category !== undefined) params.set('category', `eq.${opts.category}`);
    if (opts.creator) params.set('creator_address', `eq.${opts.creator}`);
    if (opts.query) params.set('question_text', `ilike.%${opts.query}%`);

    const res = await fetch(`${this.baseUrl}/market_registry?${params}`, {
      headers: this.headers,
    });
    if (!res.ok) {
      throw new Error(`[indexer] listMarkets failed: ${res.status} ${await res.text()}`);
    }
    const rows = (await res.json()) as unknown[];
    return rows.map(parseMarketRegistryRow);
  }

  /**
   * Fetch a single market by its field-id. Returns null when the row
   * doesn't exist.
   */
  async getMarket(marketId: string): Promise<MarketRegistryRow | null> {
    const params = new URLSearchParams({
      select: '*',
      market_id: `eq.${marketId}`,
      limit: '1',
    });
    const res = await fetch(`${this.baseUrl}/market_registry?${params}`, {
      headers: this.headers,
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as unknown[];
    return rows.length > 0 ? parseMarketRegistryRow(rows[0]) : null;
  }

  /**
   * Trending markets by created_at desc (proxy for "recently active" since
   * the registry doesn't track volume). For true volume-based trending,
   * combine with `VeiledMarketsClient.getAMMPool()` to compute live volume.
   */
  async listTrendingMarkets(limit: number = 10): Promise<MarketRegistryRow[]> {
    return this.listMarkets({ limit });
  }

  // --------------------------------------------------------------------------
  // TURBO AUDIT LOG
  // --------------------------------------------------------------------------

  /**
   * List turbo market rounds for a symbol, most recent first. Combines
   * `create` and `resolve` events — use `event` filter to scope.
   */
  async listTurboEvents(
    symbol: string,
    opts: { event?: 'create' | 'resolve' | 'cancel'; limit?: number } = {},
  ): Promise<TurboAuditRow[]> {
    const limit = opts.limit ?? 50;
    const params = new URLSearchParams();
    params.set('select', '*');
    params.set('order', 'created_at.desc');
    params.set('limit', String(limit));
    params.set('symbol', `eq.${symbol}`);
    if (opts.event) params.set('event', `eq.${opts.event}`);

    const res = await fetch(`${this.baseUrl}/turbo_oracle_audit?${params}`, {
      headers: this.headers,
    });
    if (!res.ok) {
      throw new Error(`[indexer] listTurboEvents failed: ${res.status} ${await res.text()}`);
    }
    const rows = (await res.json()) as unknown[];
    return rows.map(parseTurboAuditRow);
  }

  /**
   * List the most recent resolved turbo rounds for a symbol. Each row
   * represents one completed round — use `listTurboRoundsJoined()` if you
   * also need the matching `create` event (for baseline price + create tx).
   */
  async listTurboRounds(symbol: string, opts: { limit?: number } = {}): Promise<TurboAuditRow[]> {
    return this.listTurboEvents(symbol, { event: 'resolve', limit: opts.limit });
  }

  /**
   * Fetch both `create` and `resolve` events for a symbol and join them by
   * `market_id`. Returns an array of fully-formed rounds so callers can
   * render "Baseline → Closing" transitions without a second query.
   *
   * Create events are pulled with 2× the limit to guarantee every resolve
   * has a matching create within the result set.
   */
  async listTurboRoundsJoined(
    symbol: string,
    opts: { limit?: number } = {},
  ): Promise<Array<{ resolve: TurboAuditRow; create: TurboAuditRow | null }>> {
    const limit = opts.limit ?? 50;
    const [resolves, creates] = await Promise.all([
      this.listTurboEvents(symbol, { event: 'resolve', limit }),
      this.listTurboEvents(symbol, { event: 'create', limit: limit * 2 }),
    ]);
    const createByMarketId = new Map<string, TurboAuditRow>();
    for (const c of creates) {
      if (!createByMarketId.has(c.marketId)) createByMarketId.set(c.marketId, c);
    }
    return resolves.map((r) => ({
      resolve: r,
      create: createByMarketId.get(r.marketId) ?? null,
    }));
  }

  /**
   * Fetch all events (create + resolve + cancel) for a specific market_id.
   * Used by verification pages to show the full lifecycle of a single
   * market. Returns chronological order (create first).
   */
  async getTurboMarketEvents(marketId: string): Promise<TurboAuditRow[]> {
    const params = new URLSearchParams({
      select: '*',
      market_id: `eq.${marketId}`,
      order: 'created_at.asc',
    });
    const res = await fetch(`${this.baseUrl}/turbo_oracle_audit?${params}`, {
      headers: this.headers,
    });
    if (!res.ok) return [];
    const rows = (await res.json()) as unknown[];
    return rows.map(parseTurboAuditRow);
  }

  /**
   * Count total resolved rounds for a symbol. Uses Supabase's `count=exact`
   * header so this is a single fast aggregate query — no row download.
   */
  async countTurboRounds(symbol: string): Promise<number> {
    const params = new URLSearchParams({
      select: 'id',
      event: 'eq.resolve',
      symbol: `eq.${symbol}`,
      limit: '1',
    });
    const res = await fetch(`${this.baseUrl}/turbo_oracle_audit?${params}`, {
      headers: { ...this.headers, Prefer: 'count=exact' },
    });
    if (!res.ok) return 0;
    const range = res.headers.get('content-range') || '';
    const parts = range.split('/');
    const total = parts.length === 2 ? parseInt(parts[1], 10) : NaN;
    return Number.isFinite(total) ? total : 0;
  }
}

/**
 * Factory helper — mirrors `createClient()` / `createTurboClient()` style.
 */
export function createIndexerClient(config: IndexerConfig): IndexerClient {
  return new IndexerClient(config);
}

// ============================================================================
// INTERNAL PARSERS
// ============================================================================

function parseMarketRegistryRow(row: unknown): MarketRegistryRow {
  const r = row as Record<string, unknown>;
  let outcomeLabels: string[] | null = null;
  if (r.outcome_labels != null) {
    try {
      outcomeLabels = typeof r.outcome_labels === 'string'
        ? JSON.parse(r.outcome_labels)
        : (r.outcome_labels as string[]);
    } catch {
      outcomeLabels = null;
    }
  }
  return {
    marketId: String(r.market_id ?? ''),
    questionHash: r.question_hash != null ? String(r.question_hash) : null,
    questionText: r.question_text != null ? String(r.question_text) : null,
    description: r.description != null ? String(r.description) : null,
    resolutionSource: r.resolution_source != null ? String(r.resolution_source) : null,
    category: r.category != null ? (Number(r.category) as MarketCategory) : null,
    creatorAddress: r.creator_address != null ? String(r.creator_address) : null,
    transactionId: r.transaction_id != null ? String(r.transaction_id) : null,
    createdAt: r.created_at != null ? Number(r.created_at) : null,
    ipfsCid: r.ipfs_cid != null ? String(r.ipfs_cid) : null,
    outcomeLabels,
  };
}

function parseTurboAuditRow(row: unknown): TurboAuditRow {
  const r = row as Record<string, unknown>;
  return {
    id: Number(r.id ?? 0),
    createdAt: String(r.created_at ?? ''),
    event: (r.event as 'create' | 'resolve' | 'cancel'),
    marketId: String(r.market_id ?? ''),
    symbol: String(r.symbol ?? ''),
    pythPrice: r.pyth_price != null ? Number(r.pyth_price) : 0,
    pythConf: r.pyth_conf != null ? Number(r.pyth_conf) : 0,
    pythPublishTime: String(r.pyth_publish_time ?? ''),
    aleoBlock: r.aleo_block != null ? BigInt(String(r.aleo_block)) : 0n,
    aleoTxId: r.aleo_tx_id != null ? String(r.aleo_tx_id) : null,
    operatorAddress: r.operator_address != null ? String(r.operator_address) : null,
    metadata: (r.metadata as Record<string, unknown>) ?? {},
  };
}
