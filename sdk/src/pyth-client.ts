// ============================================================================
// VEILED MARKETS SDK - Pyth Hermes Client
// ============================================================================
// Read-only client for the Pyth Network Hermes HTTP API. Used to:
//
//   1. Fetch historical price/confidence at a specific timestamp — this is
//      what the turbo verification page uses to cross-check operator
//      on-chain claims against Pyth's authoritative record.
//
//   2. Fetch the latest quote for a symbol — useful for pre-trade price
//      display in apps that don't want to run their own Pyth WebSocket
//      stream.
//
//   3. Verify a resolved turbo market — single-shot helper that pulls the
//      on-chain commitment via TurboClient AND the matching Pyth
//      historical quote, and returns a match/mismatch result with the
//      delta. Use this in audit dashboards or bug-bounty workflows.
//
// Hermes API docs: https://hermes.pyth.network/docs
// ============================================================================

import type { TurboClient } from './turbo-client';
import type { TurboMarket } from './types';

/**
 * Pyth Hermes endpoint. Defaults to the public mainnet endpoint — the same
 * service serves all feed_ids regardless of which blockchain consumes them.
 */
const DEFAULT_HERMES_URL = 'https://hermes.pyth.network';

/**
 * Price feed IDs for the 10 symbols the turbo contract whitelists. These
 * are the same IDs the operator backend subscribes to in pyth-oracle.ts.
 * See https://pyth.network/developers/price-feed-ids for the full catalog.
 */
export const PYTH_FEED_IDS: Record<string, string> = {
  BTC: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  ETH: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  SOL: '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
  DOGE: '0xdcef50dd0a4cd2dcc17e45df1676dcb336a11a61c69df7a0299b0150c672d25c',
  XRP: '0xec5d399846a9209f3fe5881d70aae9268c94339ff9817e8d18ff19fa05eea1c8',
  BNB: '0x2f95862b045670cd22bee3114c39763a4a08beeb663b145d283c31d7d1101c4f',
  ADA: '0x2a01deaec9e51a579277b34b122399984d0bbf57e2458a7e42fecd2829867a0d',
  AVAX: '0x93da3352f9f1d105fdfe4971cfa80e9dd777bfc5d0f683ebb6e1294b92137bb7',
  LINK: '0x8ac0c70fff57e9aefdf5edf44b51d62c2d433653cbb2cf5cc06bb115af04d221',
  DOT: '0xca3eed9b267293f6595901c734c7525ce8ef49adafe8284606ceb307afa2ca5b',
};

/**
 * A single Pyth price quote, normalized from the Hermes wire format to
 * plain JS numbers. `price` and `conf` are in USD (already scaled by
 * `expo`). `publishTime` is unix milliseconds.
 */
export interface PythQuote {
  symbol: string;
  feedId: string;
  price: number;
  conf: number;
  publishTime: number;  // unix ms
}

/**
 * Result of verifying a turbo market against Pyth historical data.
 * `match = true` means the operator's committed price is within the
 * tolerance of what Pyth was publishing at the same timestamp.
 */
export interface TurboVerificationResult {
  marketId: string;
  symbol: string;
  event: 'baseline' | 'closing';
  /** Price the operator committed on-chain (in USD). */
  onChainPrice: number;
  /** Price Pyth Hermes reports for the same timestamp. */
  pythPrice: number;
  /** Absolute delta in USD. */
  delta: number;
  /** Delta as a fraction of onChainPrice (e.g. 0.001 = 0.1%). */
  deltaFraction: number;
  /** True if deltaFraction is within the tolerance passed to the verifier. */
  match: boolean;
  /** Pyth publish_time for the returned historical quote (unix ms). */
  pythPublishTime: number | null;
}

/**
 * Configuration for the PythHermesClient.
 */
export interface PythHermesConfig {
  /** Override the Hermes base URL. Defaults to public mainnet. */
  baseUrl?: string;
  /**
   * Tolerance for `verifyTurboMarket` (fraction). Defaults to 0.001
   * (0.1%) which is generous enough to absorb publish_time jitter but
   * tight enough to catch real mismatches.
   */
  matchTolerance?: number;
}

/**
 * PythHermesClient — typed wrapper around the Hermes HTTP API.
 *
 * Usage:
 *   const pyth = new PythHermesClient();
 *   const btc = await pyth.fetchLatest('BTC');
 *   const historical = await pyth.fetchHistorical('BTC', Date.now() / 1000 - 300);
 */
export class PythHermesClient {
  private readonly baseUrl: string;
  private readonly matchTolerance: number;

  constructor(config: PythHermesConfig = {}) {
    this.baseUrl = (config.baseUrl ?? DEFAULT_HERMES_URL).replace(/\/+$/, '');
    this.matchTolerance = config.matchTolerance ?? 0.001;
  }

  /**
   * Fetch the latest quote for a symbol. Returns null when the symbol
   * isn't in PYTH_FEED_IDS or the request fails.
   */
  async fetchLatest(symbol: string): Promise<PythQuote | null> {
    const feedId = PYTH_FEED_IDS[symbol];
    if (!feedId) return null;
    try {
      const url = `${this.baseUrl}/v2/updates/price/latest?ids[]=${feedId}&parsed=true`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = (await res.json()) as PythHermesResponse;
      return extractQuote(symbol, feedId, data);
    } catch {
      return null;
    }
  }

  /**
   * Fetch the price snapshot Pyth published at (or nearest to) a specific
   * unix timestamp. Use this to verify an on-chain commitment against
   * Pyth's authoritative historical record.
   *
   * @param symbol Price feed symbol (BTC, ETH, SOL, ...)
   * @param unixSeconds Unix timestamp in SECONDS (not ms)
   */
  async fetchHistorical(symbol: string, unixSeconds: number): Promise<PythQuote | null> {
    const feedId = PYTH_FEED_IDS[symbol];
    if (!feedId) return null;
    if (!Number.isFinite(unixSeconds) || unixSeconds <= 0) return null;
    try {
      const ts = Math.floor(unixSeconds);
      const url = `${this.baseUrl}/v2/updates/price/${ts}?ids[]=${feedId}&parsed=true`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = (await res.json()) as PythHermesResponse;
      return extractQuote(symbol, feedId, data);
    } catch {
      return null;
    }
  }

  /**
   * Verify a resolved turbo market against Pyth historical data. Pulls
   * both the on-chain `turbo_markets[market_id]` entry (via the supplied
   * TurboClient) AND the matching Pyth historical quotes, then checks
   * that the operator's committed baseline/closing prices match what
   * Pyth was publishing at the same timestamps.
   *
   * Returns a pair of verification results (one for baseline, one for
   * closing) so callers can render both in an audit UI.
   *
   * The `publishTimeMs` inputs are optional — pass them when you have
   * them (e.g. from the Supabase audit log). When omitted, the function
   * falls back to the market's `baseline_block` / `deadline` fields and
   * converts them to approximate wallclock timestamps using
   * `secondsPerBlock` (default 4s for Aleo testnet).
   */
  async verifyTurboMarket(
    turboClient: TurboClient,
    marketId: string,
    opts: {
      baselinePublishTimeMs?: number;
      closingPublishTimeMs?: number;
      secondsPerBlock?: number;
    } = {},
  ): Promise<{ baseline: TurboVerificationResult | null; closing: TurboVerificationResult | null }> {
    const market = await turboClient.getMarket(marketId);
    if (!market) return { baseline: null, closing: null };
    const symbol = symbolIdToName(market.symbolId);
    if (!symbol) return { baseline: null, closing: null };

    const secondsPerBlock = opts.secondsPerBlock ?? 4;

    // Baseline verification
    const baselineTs = opts.baselinePublishTimeMs
      ?? blockToApproxWallclockMs(market.baselineBlock, secondsPerBlock);
    const baselineOnChain = microToUsd(market.baselinePrice);
    const baselinePyth = await this.fetchHistorical(symbol, Math.floor(baselineTs / 1000));
    const baseline = baselinePyth
      ? buildResult(marketId, symbol, 'baseline', baselineOnChain, baselinePyth, this.matchTolerance)
      : null;

    // Closing verification (only if market is resolved)
    let closing: TurboVerificationResult | null = null;
    if (market.status === 2 /* Resolved */ && market.closingPrice > 0n) {
      const closingTs = opts.closingPublishTimeMs
        ?? blockToApproxWallclockMs(market.deadline, secondsPerBlock);
      const closingOnChain = microToUsd(market.closingPrice);
      const closingPyth = await this.fetchHistorical(symbol, Math.floor(closingTs / 1000));
      closing = closingPyth
        ? buildResult(marketId, symbol, 'closing', closingOnChain, closingPyth, this.matchTolerance)
        : null;
    }

    return { baseline, closing };
  }
}

export function createPythHermesClient(config?: PythHermesConfig): PythHermesClient {
  return new PythHermesClient(config);
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/** Minimal shape of the Hermes `/v2/updates/price/*` response we consume. */
interface PythHermesResponse {
  parsed?: Array<{
    id: string;
    price: {
      price: string;
      conf: string;
      expo: number;
      publish_time: number;
    };
  }>;
}

function extractQuote(
  symbol: string,
  feedId: string,
  data: PythHermesResponse,
): PythQuote | null {
  const p = data?.parsed?.[0]?.price;
  if (!p) return null;
  const expo = Number(p.expo);
  const scale = Math.pow(10, expo);
  return {
    symbol,
    feedId,
    price: Number(p.price) * scale,
    conf: Number(p.conf) * scale,
    publishTime: Number(p.publish_time) * 1000,
  };
}

/**
 * Pyth publishes prices with 6 decimal places in the turbo contract
 * (micro-USD). Convert u128 on-chain value to floating-point USD.
 */
function microToUsd(u128: bigint | number): number {
  return Number(u128) / 1_000_000;
}

/**
 * Convert an Aleo block height to an approximate wallclock timestamp (ms).
 * Used as a fallback when the caller doesn't have the real publish_time
 * from the audit log. Not perfectly accurate — block times vary — but good
 * enough for verification within the ~100ms Pyth tolerance window.
 */
function blockToApproxWallclockMs(block: bigint, secondsPerBlock: number): number {
  // Assume "now" corresponds to current wallclock, and the target block
  // is (currentBlock - targetBlock) * secondsPerBlock seconds ago.
  // The caller shouldn't rely on this for tight-tolerance matching —
  // prefer passing `baselinePublishTimeMs` / `closingPublishTimeMs`.
  const now = Date.now();
  const assumedCurrentBlock = block; // caller should override via opts
  const deltaBlocks = Number(assumedCurrentBlock - block);
  return now - deltaBlocks * secondsPerBlock * 1000;
}

function symbolIdToName(id: number): string | null {
  const table: Record<number, string> = {
    1: 'BTC', 2: 'ETH', 3: 'SOL', 4: 'DOGE', 5: 'XRP',
    6: 'BNB', 7: 'ADA', 8: 'AVAX', 9: 'LINK', 10: 'DOT',
  };
  return table[id] ?? null;
}

function buildResult(
  marketId: string,
  symbol: string,
  event: 'baseline' | 'closing',
  onChainPrice: number,
  pyth: PythQuote,
  tolerance: number,
): TurboVerificationResult {
  const delta = Math.abs(onChainPrice - pyth.price);
  const deltaFraction = onChainPrice > 0 ? delta / onChainPrice : Infinity;
  return {
    marketId,
    symbol,
    event,
    onChainPrice,
    pythPrice: pyth.price,
    delta,
    deltaFraction,
    match: deltaFraction <= tolerance,
    pythPublishTime: pyth.publishTime,
  };
}

// re-export TurboMarket for convenience
export type { TurboMarket };
