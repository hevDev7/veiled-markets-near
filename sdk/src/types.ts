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
 * Deployed program IDs (post-audit hardening, 2026-04-08)
 */
export const PROGRAM_IDS = {
  ALEO_MARKET: 'veiled_markets_v37.aleo',
  USDCX_MARKET: 'veiled_markets_usdcx_v7.aleo',
  USAD_MARKET: 'veiled_markets_usad_v14.aleo',
  GOVERNANCE: 'veiled_governance_v6.aleo',
} as const;

/**
 * Map TokenType -> deployed market program ID
 */
export const MARKET_PROGRAM_BY_TOKEN: Record<TokenType, string> = {
  [TokenType.ALEO]: PROGRAM_IDS.ALEO_MARKET,
  [TokenType.USDCX]: PROGRAM_IDS.USDCX_MARKET,
  [TokenType.USAD]: PROGRAM_IDS.USAD_MARKET,
};
