// ============================================================================
// VEILED MARKETS SDK - Turbo Client (veiled_turbo_v8.aleo)
// ============================================================================
// Rolling 5-minute UP/DOWN prediction markets backed by the Pyth Network
// oracle. Unlike the main FAMM markets, turbo markets have a single shared
// vault, fixed 5-minute rounds, and use parimutuel payouts (no FPMM curve).
//
// This client exposes:
//   - Transaction builders for the 4 user-callable transitions
//   - Off-chain quoting that mirrors `buy_up_down_fin` / `claim_winnings_fin`
//   - On-chain reads for turbo_markets / turbo_pools / market_payouts
//   - TurboShare record plaintext parsing (for claim flows)
//
// Operator-only transitions (`create_turbo_market`, `resolve_turbo_market`)
// are NOT exposed here — they live in the operator backend which needs
// direct Pyth Hermes access and the operator private key.
// ============================================================================

import {
  type TurboSide,
  type TurboMarket,
  type TurboMarketStatus,
  type TurboPool,
  type TurboShare,
  type TurboBuyParams,
  type TurboBuyQuote,
  type TurboClaimWinningsParams,
  type TurboClaimRefundParams,
  type NetworkType,
  TURBO_OUTCOME,
  TURBO_PROTOCOL_FEE_BPS,
  TURBO_FEE_DENOMINATOR,
  TURBO_MIN_TRADE_AMOUNT,
  PROGRAM_IDS,
  NETWORK_CONFIG,
} from './types';

/**
 * Turbo client configuration. Mirrors the shape of `VeiledMarketsConfig`
 * but is turbo-specific: the default programId is always the turbo
 * contract, not one of the FAMM variants.
 */
export interface TurboClientConfig {
  network?: NetworkType;
  programId?: string;       // defaults to PROGRAM_IDS.TURBO
  rpcUrl?: string;           // overrides NETWORK_CONFIG[network].rpcUrl
  explorerUrl?: string;      // overrides NETWORK_CONFIG[network].explorerUrl
}

/**
 * Self-describing transaction call: (programId, functionName, inputs[]).
 * Callers pass this straight to their wallet adapter's executeTransaction
 * equivalent. All Leo-literal conversion (u8/u64/u128/field suffixes)
 * already applied.
 */
export interface TurboCall {
  programId: string;
  functionName: string;
  inputs: string[];
}

/**
 * Generate a random field literal suitable for `share_nonce` in
 * `buy_up_down`. Uses 8 bytes of crypto-random entropy — enough to avoid
 * collisions across markets.
 *
 * Works in both browser (crypto.getRandomValues) and Node.js 20+
 * (globalThis.crypto). Callers can override with a caller-provided
 * nonce by setting `shareNonce` on TurboBuyParams.
 */
function randomNonceField(): string {
  const g = globalThis as { crypto?: { getRandomValues: (arr: Uint8Array) => Uint8Array } };
  if (!g.crypto?.getRandomValues) {
    throw new Error('crypto.getRandomValues not available — provide a shareNonce manually');
  }
  const bytes = g.crypto.getRandomValues(new Uint8Array(8));
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return `${BigInt('0x' + hex)}field`;
}

// ============================================================================
// OFF-CHAIN QUOTES (mirrors contract finalize logic 1:1)
// ============================================================================

/**
 * Quote a `buy_up_down` call. Mirrors `buy_up_down_fin` arithmetic exactly:
 *
 *   protocol_fee = (amount_in × 50) / 10_000          (0.5%)
 *   amount_to_pool = amount_in - protocol_fee
 *   shares_out = amount_to_pool                        (parimutuel 1:1)
 *
 * The contract asserts `shares_out >= expected_shares`, so any value up to
 * the computed `shares_out` is legal — but passing the exact quote is what
 * the frontend should do so the user sees the real payout potential.
 */
export function quoteBuyUpDown(amountInMicro: bigint): TurboBuyQuote {
  if (amountInMicro < TURBO_MIN_TRADE_AMOUNT) {
    throw new Error(
      `amountIn must be ≥ ${TURBO_MIN_TRADE_AMOUNT} microcredits (0.001 ALEO)`,
    );
  }
  const protocolFee = (amountInMicro * TURBO_PROTOCOL_FEE_BPS) / TURBO_FEE_DENOMINATOR;
  const amountToPool = amountInMicro - protocolFee;
  return {
    amountIn: amountInMicro,
    protocolFee,
    amountToPool,
    expectedShares: amountToPool,
  };
}

/**
 * Compute a winner's `claim_winnings` payout. Mirrors `claim_winnings_fin`:
 *
 *   payout = (share_quantity × total_pool) / total_winning_shares
 *
 * Integer division truncating — matches Leo u128 division. The contract
 * asserts `declared_payout == payout` exactly, so pass this value directly
 * into `TurboClaimWinningsParams.declaredPayout`.
 *
 * Returns 0n if `totalWinningShares` is 0 (no winners, shouldn't happen
 * with valid markets but we guard).
 */
export function quoteTurboPayout(
  shareQuantity: bigint,
  totalPool: bigint,             // = market_payouts[market_id]
  totalWinningShares: bigint,    // = pool.total_up_shares OR total_down_shares
): bigint {
  if (totalWinningShares === 0n) return 0n;
  return (shareQuantity * totalPool) / totalWinningShares;
}

// ============================================================================
// RECORD PARSERS
// ============================================================================

/**
 * Parse a TurboShare record plaintext returned by a wallet adapter.
 * Handles both raw Leo literal format and wallets that add `.private` /
 * `.public` annotations.
 *
 * Returns null when the string isn't a valid TurboShare record (e.g. an
 * OutcomeShare from a different contract, or malformed plaintext).
 *
 * Example input:
 *   `{ owner: aleo1xxx.private, market_id: 12345field.private,
 *      side: 2u8.private, quantity: 995000u128.private,
 *      share_nonce: 67890field.private, _nonce: ... }`
 */
export function parseTurboShareRecord(text: string): TurboShare | null {
  const marketMatch = text.match(/market_id:\s*([0-9]+field)/);
  const sideMatch = text.match(/side:\s*(\d+)u8/);
  const qtyMatch = text.match(/quantity:\s*(\d+)u128/);
  const ownerMatch = text.match(/owner:\s*(aleo1[a-z0-9]+)/);
  const nonceMatch = text.match(/share_nonce:\s*([0-9]+field)/);
  if (!marketMatch || !sideMatch || !qtyMatch || !ownerMatch) return null;

  const sideNum = Number(sideMatch[1]);
  let side: TurboSide;
  if (sideNum === TURBO_OUTCOME.UP) side = 'UP';
  else if (sideNum === TURBO_OUTCOME.DOWN) side = 'DOWN';
  else return null;

  return {
    owner: ownerMatch[1],
    marketId: marketMatch[1],
    side,
    quantity: BigInt(qtyMatch[1]),
    shareNonce: nonceMatch?.[1] ?? '0field',
    plaintext: text,
  };
}

// ============================================================================
// TURBO CLIENT CLASS
// ============================================================================

/**
 * TurboClient — builds transactions and reads on-chain state for
 * `veiled_turbo_v8.aleo`.
 *
 * Usage:
 *   const client = new TurboClient({ network: 'testnet' });
 *   const quote = quoteBuyUpDown(1_000_000n); // 1 ALEO
 *   const call = client.buildBuyUpDownInputs({
 *     marketId: '12345field',
 *     side: 'UP',
 *     amountIn: quote.amountIn,
 *     expectedShares: quote.expectedShares,
 *     creditsRecord: '<record plaintext from wallet>',
 *   });
 *   // Pass `call` to your wallet adapter's executeTransaction
 */
export class TurboClient {
  private readonly config: Required<TurboClientConfig>;

  constructor(config: TurboClientConfig = {}) {
    const network = config.network ?? 'testnet';
    this.config = {
      network,
      programId: config.programId ?? PROGRAM_IDS.TURBO,
      rpcUrl: config.rpcUrl ?? NETWORK_CONFIG[network].rpcUrl,
      explorerUrl: config.explorerUrl ?? NETWORK_CONFIG[network].explorerUrl,
    };
  }

  get programId(): string {
    return this.config.programId;
  }

  get network(): NetworkType {
    return this.config.network;
  }

  get rpcUrl(): string {
    return this.config.rpcUrl;
  }

  get explorerUrl(): string {
    return this.config.explorerUrl;
  }

  // --------------------------------------------------------------------------
  // TRANSACTION BUILDERS
  // --------------------------------------------------------------------------

  /**
   * Build inputs for `buy_up_down(market_id, side, amount_in,
   * expected_shares, share_nonce, credits_in)`.
   *
   * The returned `shareNonce` on the result — persist it alongside the
   * resulting TurboShare record plaintext so you can later use it to
   * verify ownership on claim.
   */
  buildBuyUpDownInputs(
    params: TurboBuyParams,
  ): TurboCall & { shareNonce: string } {
    const shareNonce = params.shareNonce ?? randomNonceField();
    return {
      programId: this.programId,
      functionName: 'buy_up_down',
      inputs: [
        params.marketId,
        `${TURBO_OUTCOME[params.side]}u8`,
        `${params.amountIn}u128`,
        `${params.expectedShares}u128`,
        shareNonce,
        params.creditsRecord,
      ],
      shareNonce,
    };
  }

  /**
   * Build inputs for `claim_winnings(market_id, share, declared_payout)`.
   * Compute `declaredPayout` with `quoteTurboPayout()` — the contract
   * asserts exact equality at finalize.
   */
  buildClaimWinningsInputs(params: TurboClaimWinningsParams): TurboCall {
    return {
      programId: this.programId,
      functionName: 'claim_winnings',
      inputs: [
        params.marketId,
        params.shareRecord,
        `${params.declaredPayout}u128`,
      ],
    };
  }

  /**
   * Build inputs for `claim_refund(market_id, share, declared_refund)`.
   * Only callable after `emergency_cancel` — `expectedAmount` equals the
   * TurboShare's `quantity` (no fee on refund).
   */
  buildClaimRefundInputs(params: TurboClaimRefundParams): TurboCall {
    return {
      programId: this.programId,
      functionName: 'claim_refund',
      inputs: [
        params.marketId,
        params.shareRecord,
        `${params.expectedAmount}u128`,
      ],
    };
  }

  /**
   * Build inputs for `emergency_cancel(market_id)`. Permissionless after
   * `resolution_deadline` has passed (300 blocks post-deadline). Flips
   * status to CANCELLED so bettors can call `claim_refund`.
   */
  buildEmergencyCancelInputs(marketId: string): TurboCall {
    return {
      programId: this.programId,
      functionName: 'emergency_cancel',
      inputs: [marketId],
    };
  }

  // --------------------------------------------------------------------------
  // ON-CHAIN READS
  // --------------------------------------------------------------------------

  /**
   * Fetch a TurboMarket row from `turbo_markets[market_id]`. Returns null
   * when the market doesn't exist (key not set) or the RPC endpoint errors.
   */
  async getMarket(marketId: string): Promise<TurboMarket | null> {
    try {
      const url = `${this.rpcUrl}/program/${this.programId}/mapping/turbo_markets/${marketId}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const text = (await res.text()).replace(/^"|"$/g, '');
      if (!text || text === 'null') return null;
      return parseTurboMarketStruct(text);
    } catch {
      return null;
    }
  }

  /**
   * Fetch TurboPool row from `turbo_pools[market_id]`. Returns null when
   * the market doesn't exist.
   */
  async getPool(marketId: string): Promise<TurboPool | null> {
    try {
      const url = `${this.rpcUrl}/program/${this.programId}/mapping/turbo_pools/${marketId}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const text = (await res.text()).replace(/^"|"$/g, '');
      if (!text || text === 'null') return null;
      return parseTurboPoolStruct(text, marketId);
    } catch {
      return null;
    }
  }

  /**
   * Fetch `market_payouts[market_id]` — the total pool committed to
   * winners at resolve time. Returns null for markets that haven't been
   * resolved yet (mapping entry absent).
   */
  async getMarketPayouts(marketId: string): Promise<bigint | null> {
    try {
      const url = `${this.rpcUrl}/program/${this.programId}/mapping/market_payouts/${marketId}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const text = (await res.text()).replace(/^"|"$/g, '');
      if (!text || text === 'null') return null;
      const m = text.match(/(\d+)u128/);
      return m ? BigInt(m[1]) : null;
    } catch {
      return null;
    }
  }

  /**
   * Fetch `vault_balance[0u8]` — the shared vault's accounting balance
   * across ALL turbo markets. Useful for health checks (should roughly
   * equal credits.aleo::account[turbo_program] minus any protocol_treasury).
   */
  async getVaultBalance(): Promise<bigint | null> {
    try {
      const url = `${this.rpcUrl}/program/${this.programId}/mapping/vault_balance/0u8`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const text = (await res.text()).replace(/^"|"$/g, '');
      if (!text || text === 'null') return null;
      const m = text.match(/(\d+)u128/);
      return m ? BigInt(m[1]) : null;
    } catch {
      return null;
    }
  }

  /**
   * Check whether a specific share (by BHP256 hash of TurboShare record)
   * has already been redeemed. Used to guard claim retries.
   */
  async isShareRedeemed(shareId: string): Promise<boolean> {
    try {
      const url = `${this.rpcUrl}/program/${this.programId}/mapping/share_redeemed/${shareId}`;
      const res = await fetch(url);
      if (!res.ok) return false;
      const text = (await res.text()).replace(/^"|"$/g, '');
      return text === 'true';
    } catch {
      return false;
    }
  }

  // --------------------------------------------------------------------------
  // EXPLORER URL HELPERS
  // --------------------------------------------------------------------------

  getTransactionUrl(transactionId: string): string {
    return `${this.explorerUrl}/transaction/${transactionId}`;
  }

  getProgramUrl(): string {
    return `${this.explorerUrl}/program/${this.programId}`;
  }

  /** Public verification page (frontend route, not explorer). */
  getVerifyUrl(marketId: string, baseUrl: string = ''): string {
    return `${baseUrl}/verify/turbo/${marketId}`;
  }
}

/**
 * Factory function. Matches the style of `createClient()` /
 * `createGovernanceClient()` in the other SDK modules.
 */
export function createTurboClient(config?: TurboClientConfig): TurboClient {
  return new TurboClient(config);
}

// ============================================================================
// LEO STRUCT PARSERS (internal)
// ============================================================================

/**
 * Parse the `turbo_markets[market_id]` value returned by the Provable
 * explorer API. Example input (stripped of outer quotes):
 *
 *   `{
 *     id: 12345field,
 *     creator: aleo1xxx,
 *     symbol_id: 1u8,
 *     baseline_price: 72750000000u128,
 *     baseline_block: 15716026u64,
 *     deadline: 15716101u64,
 *     resolution_deadline: 15716401u64,
 *     closing_price: 0u128,
 *     winning_outcome: 0u8,
 *     status: 1u8,
 *     created_at: 15716029u64
 *   }`
 *
 * Returns null on parse failure — callers should treat null as "market
 * not found / RPC returned malformed data".
 */
function parseTurboMarketStruct(text: string): TurboMarket | null {
  const idMatch = text.match(/id:\s*([0-9]+field)/);
  const creatorMatch = text.match(/creator:\s*(aleo1[a-z0-9]+)/);
  const symbolIdMatch = text.match(/symbol_id:\s*(\d+)u8/);
  const baselinePriceMatch = text.match(/baseline_price:\s*(\d+)u128/);
  const baselineBlockMatch = text.match(/baseline_block:\s*(\d+)u64/);
  const deadlineMatch = text.match(/deadline:\s*(\d+)u64/);
  const resDeadlineMatch = text.match(/resolution_deadline:\s*(\d+)u64/);
  const closingPriceMatch = text.match(/closing_price:\s*(\d+)u128/);
  const winningOutcomeMatch = text.match(/winning_outcome:\s*(\d+)u8/);
  const statusMatch = text.match(/status:\s*(\d+)u8/);
  const createdAtMatch = text.match(/created_at:\s*(\d+)u64/);

  if (!idMatch || !creatorMatch || !symbolIdMatch || !statusMatch) return null;

  return {
    id: idMatch[1],
    creator: creatorMatch[1],
    symbolId: Number(symbolIdMatch[1]),
    baselinePrice: BigInt(baselinePriceMatch?.[1] ?? '0'),
    baselineBlock: BigInt(baselineBlockMatch?.[1] ?? '0'),
    deadline: BigInt(deadlineMatch?.[1] ?? '0'),
    resolutionDeadline: BigInt(resDeadlineMatch?.[1] ?? '0'),
    closingPrice: BigInt(closingPriceMatch?.[1] ?? '0'),
    winningOutcome: Number(winningOutcomeMatch?.[1] ?? '0'),
    status: Number(statusMatch[1]) as TurboMarketStatus,
    createdAt: BigInt(createdAtMatch?.[1] ?? '0'),
  };
}

/**
 * Parse the `turbo_pools[market_id]` struct. `marketId` is injected by the
 * caller since the RPC response echoes it inside the struct body.
 */
function parseTurboPoolStruct(text: string, marketId: string): TurboPool | null {
  const upAmountMatch = text.match(/total_up_amount:\s*(\d+)u128/);
  const dnAmountMatch = text.match(/total_down_amount:\s*(\d+)u128/);
  const upSharesMatch = text.match(/total_up_shares:\s*(\d+)u128/);
  const dnSharesMatch = text.match(/total_down_shares:\s*(\d+)u128/);
  const volumeMatch = text.match(/total_volume:\s*(\d+)u128/);
  if (!upAmountMatch || !dnAmountMatch) return null;
  return {
    marketId,
    totalUpAmount: BigInt(upAmountMatch[1]),
    totalDownAmount: BigInt(dnAmountMatch[1]),
    totalUpShares: BigInt(upSharesMatch?.[1] ?? '0'),
    totalDownShares: BigInt(dnSharesMatch?.[1] ?? '0'),
    totalVolume: BigInt(volumeMatch?.[1] ?? '0'),
  };
}
