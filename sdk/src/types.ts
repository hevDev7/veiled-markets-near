// ============================================================================
// VEILED MARKETS SDK - Type Definitions
// ============================================================================
// Matches the Leo contracts: veiled_markets_v37.aleo, veiled_markets_usdcx_v7.aleo,
// veiled_markets_usad_v14.aleo, veiled_governance_v6.aleo
// AMM-based multi-outcome prediction markets
// ============================================================================

/**
 * Market status enumeration (matches Leo constants)
 */
export enum MarketStatus {
  Active = 1,
  Closed = 2,
  Resolved = 3,
  Cancelled = 4,
  PendingResolution = 5,
}

/**
 * Outcome enumeration (matches Leo constants)
 * Supports up to 4 outcomes
 */
export enum Outcome {
  One = 1,
  Two = 2,
  Three = 3,
  Four = 4,
  // Legacy aliases
  Yes = 1,
  No = 2,
}

/**
 * Token type enumeration
 */
export enum TokenType {
  ALEO = 1,
  USDCX = 2,
  USAD = 3,
}

/**
 * Market category enumeration
 */
export enum MarketCategory {
  Politics = 1,
  Sports = 2,
  Crypto = 3,
  Entertainment = 4,
  Science = 5,
  Economics = 6,
  Other = 99,
}

/**
 * Network type
 */
export type NetworkType = 'mainnet' | 'testnet';

/**
 * Public market information (matches Leo Market struct)
 */
export interface Market {
  id: string;                    // field - Unique market identifier
  creator: string;               // address - Market creator
  resolver: string;              // address - Designated resolver
  questionHash: string;          // field - Hash of the market question
  question?: string;             // Resolved from IPFS/off-chain
  category: MarketCategory;      // u8 - Market category
  numOutcomes: number;           // u8 - Number of outcomes (2-4)
  deadline: bigint;              // u64 - Trading deadline (block height)
  resolutionDeadline: bigint;    // u64 - When market must be resolved
  status: MarketStatus;          // u8 - Current market status
  createdAt: bigint;             // u64 - Creation block height
  tokenType: TokenType;          // u8 - Token denomination (ALEO or USDCX)
}

/**
 * AMM pool data (AMM pool data)
 */
export interface AMMPool {
  marketId: string;              // field
  reserve1: bigint;              // u128 - Outcome 1 shares in pool
  reserve2: bigint;              // u128 - Outcome 2 shares
  reserve3: bigint;              // u128 - Outcome 3 (0 if binary)
  reserve4: bigint;              // u128 - Outcome 4 (0 if binary)
  totalLiquidity: bigint;        // u128 - Total tokens deposited
  totalLPShares: bigint;         // u128 - LP tokens in circulation
  totalVolume: bigint;           // u128 - Cumulative trading volume
}

/** Legacy alias */
export type MarketPool = AMMPool;

/**
 * Market resolution data (with challenge window)
 */
export interface MarketResolution {
  marketId: string;              // field
  winningOutcome: number;        // u8 - Winning outcome (1-4)
  resolver: string;              // address - Who resolved the market
  resolvedAt: bigint;            // u64 - Resolution block height
  challengeDeadline: bigint;     // u64 - When challenge window expires
  finalized: boolean;            // bool - Whether resolution is finalized
}

/**
 * Market fee tracking (per-trade fees)
 */
export interface MarketFees {
  marketId: string;              // field
  protocolFees: bigint;          // u128 - Accumulated protocol fees
  creatorFees: bigint;           // u128 - Accumulated creator fees
}

/**
 * Dispute data
 */
export interface DisputeData {
  marketId: string;              // field
  disputer: string;              // address
  proposedOutcome: number;       // u8
  bondAmount: bigint;            // u128
  disputedAt: bigint;            // u64
}

/**
 * Outcome share record (private outcome share)
 * This data is encrypted on-chain and only visible to the owner
 */
export interface OutcomeShare {
  owner: string;                 // address
  marketId: string;              // field
  outcome: number;               // u8 (1-4)
  quantity: bigint;              // u128 - Number of shares
  shareNonce: string;            // field - Unique nonce
  tokenType: TokenType;          // u8
}

/**
 * LP token record
 */
export interface LPToken {
  owner: string;                 // address
  marketId: string;              // field
  lpShares: bigint;              // u128
  lpNonce: string;               // field
  tokenType: TokenType;          // u8
}

/**
 * Dispute bond receipt record
 */
export interface DisputeBondReceipt {
  owner: string;                 // address
  marketId: string;              // field
  bondAmount: bigint;            // u128
  disputeNonce: string;          // field
  tokenType: TokenType;          // u8
}

/**
 * Refund claim record
 */
export interface RefundClaim {
  owner: string;                 // address
  marketId: string;              // field
  amount: bigint;                // u128
}

/** Legacy alias for Bet (v11 compat) */
export interface Bet {
  owner: string;
  marketId: string;
  amount: bigint;
  outcome: Outcome;
  placedAt: bigint;
  nonce?: string;
  ciphertext?: string;
}

/** Legacy alias for WinningsClaim */
export interface WinningsClaim {
  owner: string;
  marketId: string;
  betAmount: bigint;
  winningOutcome: Outcome;
}

/**
 * Market with computed statistics (for frontend display)
 */
export interface MarketWithStats extends Market {
  pool: AMMPool;
  resolution?: MarketResolution;
  fees?: MarketFees;
  prices: number[];              // Outcome prices (0-1 range)
  totalVolume: bigint;           // From pool
  totalLiquidity: bigint;        // From pool
  potentialPayouts: number[];    // 1/price for each outcome
  // Legacy binary fields
  yesPercentage: number;
  noPercentage: number;
  potentialYesPayout: number;
  potentialNoPayout: number;
  timeRemaining?: string;
}

/**
 * Create market parameters
 */
export interface CreateMarketParams {
  question: string;
  category: MarketCategory;
  numOutcomes: number;           // 2, 3, or 4
  deadline: Date;
  resolutionDeadline: Date;
  resolver?: string;             // Defaults to creator
  creatorOwner?: string;         // Defaults to self.caller (signer)
  tokenType?: TokenType;         // Defaults to ALEO
  initialLiquidity: bigint;      // Required to seed AMM
}

/**
 * Buy shares parameters (replaces PlaceBetParams)
 */
export interface BuySharesParams {
  marketId: string;
  outcome: number;               // 1-4
  amountIn: bigint;              // Amount in microcredits
  expectedShares?: bigint;       // Quoted from contract math; required by contract
  minSharesOut?: bigint;         // Slippage protection
  shareNonce?: string;           // Caller-provided field nonce; auto-generated if omitted
}

/** Legacy alias */
export type PlaceBetParams = BuySharesParams;

/**
 * Sell shares parameters
 */
export interface SellSharesParams {
  shareRecord: string;           // Encrypted OutcomeShare record (appended by wallet)
  sharesToSell: bigint;          // Legacy alias for maxSharesUsed
  tokensDesired?: bigint;        // Gross tokens out (before fees)
  maxSharesUsed?: bigint;        // Max OutcomeShare quantity to consume
  minTokensOut?: bigint;         // Slippage protection
  protocolFeeBps?: bigint;       // Fee snapshot from market_fees
  creatorFeeBps?: bigint;
  lpFeeBps?: bigint;
}

/**
 * Add liquidity parameters
 */
export interface AddLiquidityParams {
  marketId: string;
  amount: bigint;
  expectedLpShares?: bigint;     // Quoted from contract math
  lpNonce?: string;              // Caller-provided; auto-generated if omitted
}

// RemoveLiquidityParams removed in v17 — LP locked until finalize/cancel

/**
 * Buy shares private USDCX parameters (v18)
 * Requires a private Token record + freeze-list Merkle proofs
 */
export interface BuySharesPrivateUsdcxParams extends BuySharesParams {
  tokenRecord: string;           // Serialized USDCX Token record
  merkleProofs: string;          // Serialized [MerkleProof; 2] (freeze-list proofs)
}

/**
 * Transaction result
 */
export interface TransactionResult {
  transactionId: string;
  status: 'pending' | 'confirmed' | 'rejected' | 'failed';
  blockHeight?: bigint;
  error?: string;
  outputs?: Record<string, unknown>[];
}

/**
 * Wallet connection state
 */
export interface WalletState {
  connected: boolean;
  connecting: boolean;
  address: string | null;
  publicKey?: string;
  viewKey?: string;
  balance: bigint;               // Public credits balance (microcredits)
  network: NetworkType;
}

/**
 * Wallet adapter interface
 */
export interface WalletAdapter {
  name: string;
  icon: string;
  url: string;
  connect(): Promise<WalletConnectionResult>;
  disconnect(): Promise<void>;
  signMessage(message: string): Promise<string>;
  requestTransaction(params: TransactionRequestParams): Promise<TransactionResult>;
  getRecords(programId: string): Promise<unknown[]>;
  onAccountChange(callback: (address: string | null) => void): void;
  onNetworkChange(callback: (network: NetworkType) => void): void;
}

/**
 * Wallet connection result
 */
export interface WalletConnectionResult {
  address: string;
  publicKey: string;
  viewKey?: string;
  network: NetworkType;
}

/**
 * Transaction request parameters
 */
export interface TransactionRequestParams {
  programId: string;
  functionName: string;
  inputs: string[];
  fee: bigint;
  privateFee?: boolean;
}

/**
 * SDK Configuration
 */
export interface VeiledMarketsConfig {
  network: NetworkType;
  programId: string;
  explorerUrl?: string;
  rpcUrl?: string;
}

/**
 * Fee configuration (per-trade fee constants)
 */
export const PROTOCOL_FEE_BPS = 50n;       // 0.5% protocol fee per trade
export const CREATOR_FEE_BPS = 50n;        // 0.5% creator fee per trade
export const LP_FEE_BPS = 100n;            // 1.0% LP fee per trade
export const TOTAL_FEE_BPS = 200n;         // 2.0% total per trade
export const FEE_DENOMINATOR = 10000n;
export const MIN_TRADE_AMOUNT = 1000n;     // 0.001 tokens minimum
export const MIN_DISPUTE_BOND = 1000000n;  // 1 token minimum bond
export const CHALLENGE_WINDOW_BLOCKS = 2880n; // ~12 hours

/** Legacy alias */
export const MIN_BET_AMOUNT = MIN_TRADE_AMOUNT;

/**
 * Network configuration
 */
export const NETWORK_CONFIG = {
  mainnet: {
    rpcUrl: 'https://api.explorer.provable.com/v1/mainnet',
    explorerUrl: 'https://explorer.provable.com',
  },
  testnet: {
    rpcUrl: 'https://api.explorer.provable.com/v1/testnet',
    explorerUrl: 'https://testnet.explorer.provable.com',
  },
} as const;

/**
 * Deployed program IDs (post-audit hardening, 2026-04-08; turbo 2026-04-10)
 */
export const PROGRAM_IDS = {
  ALEO_MARKET: 'veiled_markets_v37.aleo',
  USDCX_MARKET: 'veiled_markets_usdcx_v7.aleo',
  USAD_MARKET: 'veiled_markets_usad_v14.aleo',
  GOVERNANCE: 'veiled_governance_v6.aleo',
  PARLAY: 'veiled_parlay_v3.aleo',
  TURBO: 'veiled_turbo_v8.aleo',
} as const;

/**
 * Map TokenType -> deployed market program ID
 */
export const MARKET_PROGRAM_BY_TOKEN: Record<TokenType, string> = {
  [TokenType.ALEO]: PROGRAM_IDS.ALEO_MARKET,
  [TokenType.USDCX]: PROGRAM_IDS.USDCX_MARKET,
  [TokenType.USAD]: PROGRAM_IDS.USAD_MARKET,
};

// ============================================================================
// TURBO MARKET TYPES (veiled_turbo_v8.aleo)
// ============================================================================
// Rolling 5-minute UP/DOWN prediction markets backed by Pyth Network oracle.
// Operator (ORACLE_OPERATOR hardcoded in the contract) creates markets every
// 5 min with a baseline price, freezes at deadline with a closing price, and
// winners claim a parimutuel payout from the combined pool.
//
// Only `buy_up_down`, `claim_winnings`, `claim_refund`, and `emergency_cancel`
// are user-callable. `create_turbo_market` / `resolve_turbo_market` are
// operator-only (see backend/src/pyth-oracle.ts for the operator flow).
// ============================================================================

/**
 * Turbo market side (UP or DOWN). Maps to the u8 side field the contract
 * uses — 1 = UP, 2 = DOWN. Matches `OUTCOME_UP` / `OUTCOME_DOWN` constants
 * in contracts-turbo-v1/src/main.leo.
 */
export type TurboSide = 'UP' | 'DOWN';

/**
 * Contract-level u8 values for sides, exported so callers can compare
 * parsed records without re-deriving the mapping.
 */
export const TURBO_OUTCOME = {
  UP: 1,
  DOWN: 2,
} as const;

/**
 * Turbo market status (matches contract u8 values):
 *   1 = STATUS_ACTIVE      — accepting bets, pre-deadline
 *   2 = STATUS_RESOLVED    — oracle posted closing_price, winners can claim
 *   3 = STATUS_CANCELLED   — emergency_cancel fired, bettors can refund
 */
export enum TurboMarketStatus {
  Active = 1,
  Resolved = 2,
  Cancelled = 3,
}

/**
 * Symbol ids the turbo contract whitelists. Same order as
 * `SYMBOL_*` constants in contracts-turbo-v1/src/main.leo.
 */
export const TURBO_SYMBOL_IDS = {
  BTC: 1,
  ETH: 2,
  SOL: 3,
  DOGE: 4,
  XRP: 5,
  BNB: 6,
  ADA: 7,
  AVAX: 8,
  LINK: 9,
  DOT: 10,
} as const;

export type TurboSymbol = keyof typeof TURBO_SYMBOL_IDS;

/**
 * On-chain `TurboMarket` struct (mapped by `turbo_markets[market_id]`).
 * All u128/u64 fields decoded to JS bigint.
 */
export interface TurboMarket {
  id: string;                    // field - market_id (= BHP256 hash of TurboSeed)
  creator: string;               // address - always the operator wallet
  symbolId: number;              // u8 - see TURBO_SYMBOL_IDS
  baselinePrice: bigint;         // u128 - price at create time (Pyth micro, 6 decimals)
  baselineBlock: bigint;         // u64 - block height of baseline snapshot
  deadline: bigint;              // u64 - trading deadline (block height)
  resolutionDeadline: bigint;    // u64 - deadline + RESOLUTION_GRACE_BLOCKS (300 blocks)
  closingPrice: bigint;          // u128 - 0 while active, Pyth micro at resolve
  winningOutcome: number;        // u8 - 0 while active, 1=UP, 2=DOWN after resolve
  status: TurboMarketStatus;     // u8 - see TurboMarketStatus
  createdAt: bigint;             // u64 - create-time block height
}

/**
 * On-chain `TurboPool` struct (mapped by `turbo_pools[market_id]`).
 * Tracks parimutuel totals — no FPMM curve.
 */
export interface TurboPool {
  marketId: string;              // field
  totalUpAmount: bigint;         // u128 - ALEO staked on UP (net, after fees)
  totalDownAmount: bigint;       // u128 - ALEO staked on DOWN (net, after fees)
  totalUpShares: bigint;         // u128 - redeemable shares if UP wins
  totalDownShares: bigint;       // u128 - redeemable shares if DOWN wins
  totalVolume: bigint;           // u128 - sum of all raw amount_in values
}

/**
 * Private TurboShare record issued by `buy_up_down`. User's wallet stores
 * this encrypted — pass the plaintext back to `claim_winnings` /
 * `claim_refund` to burn it and collect payout / refund.
 */
export interface TurboShare {
  owner: string;                 // address - bet placer
  marketId: string;              // field - which market this share belongs to
  side: TurboSide;               // derived from u8 (1=UP, 2=DOWN)
  quantity: bigint;              // u128 - net stake (amount_in - protocol fee)
  shareNonce: string;            // field - random anchor (unique per share)
  /** Raw plaintext string wallet adapters return. Pass back to claim txs
   *  verbatim — record literal parsing happens on-chain, not here. */
  plaintext?: string;
}

/**
 * `buy_up_down` parameters. The contract expects the user to supply
 * `expected_shares` computed off-chain — use `quoteBuyUpDown` to derive it
 * so the value exactly matches what `buy_up_down_fin` will compute.
 */
export interface TurboBuyParams {
  marketId: string;              // field - must include "field" suffix
  side: TurboSide;               // UP or DOWN
  amountIn: bigint;              // u128 - gross bet amount in microcredits
  expectedShares: bigint;        // u128 - net shares = amount_in - protocol_fee
  /** Optional caller-provided nonce (field literal). Auto-generated if omitted. */
  shareNonce?: string;
  /** Serialized `credits.aleo::credits` record plaintext (wallet-supplied). */
  creditsRecord: string;
}

/**
 * `claim_winnings` parameters. `declaredPayout` MUST match the contract's
 * `(quantity × market_payouts) / total_winning_shares` exactly — the
 * finalize assertion `declared_payout == payout` is strict. Use
 * `quoteTurboPayout()` to compute.
 */
export interface TurboClaimWinningsParams {
  marketId: string;              // field
  shareRecord: string;           // TurboShare record plaintext
  declaredPayout: bigint;        // u128 - must match on-chain payout formula
}

/**
 * `claim_refund` parameters. `expectedAmount` == the share's original net
 * quantity (no fee on refund, the whole stake comes back).
 */
export interface TurboClaimRefundParams {
  marketId: string;              // field
  shareRecord: string;           // TurboShare record plaintext
  expectedAmount: bigint;        // u128 - = TurboShare.quantity
}

/**
 * Quote result for `buy_up_down`. Exactly mirrors the arithmetic
 * `buy_up_down_fin` performs on-chain:
 *   protocol_fee = amount_in × 50 / 10_000        (0.5%)
 *   amount_to_pool = amount_in - protocol_fee
 *   shares_out = amount_to_pool                    (parimutuel: 1:1)
 */
export interface TurboBuyQuote {
  amountIn: bigint;              // echoed input
  protocolFee: bigint;           // deducted from amount_in
  amountToPool: bigint;          // amount_in - protocolFee
  expectedShares: bigint;        // == amountToPool (parimutuel 1:1)
}

/**
 * Turbo fee constants. 0.5% protocol fee, no LP fee (no liquidity
 * providers), no creator fee (creator == operator).
 */
export const TURBO_PROTOCOL_FEE_BPS = 50n;
export const TURBO_FEE_DENOMINATOR = 10000n;
/** Minimum bet: 0.001 ALEO (matches `MIN_TRADE_AMOUNT` in main.leo). */
export const TURBO_MIN_TRADE_AMOUNT = 1000n;
/** Market lifetime in blocks on testnet (~5 minutes at 4s/block). */
export const TURBO_DURATION_BLOCKS = 75n;
/** How long after deadline the operator can still submit resolve. */
export const TURBO_RESOLUTION_WINDOW_BLOCKS = 60n;
/** Total grace before `emergency_cancel` becomes available. */
export const TURBO_RESOLUTION_GRACE_BLOCKS = 300n;
