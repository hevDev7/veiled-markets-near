// ============================================================================
// VEILED MARKETS SDK - Type Definitions
// ============================================================================
// Matches the Leo contract: veiled_markets.aleo
// ============================================================================

/**
 * Market status enumeration (matches Leo constants)
 */
export enum MarketStatus {
  Active = 1,
  Closed = 2,
  Resolved = 3,
  Cancelled = 4,
}

/**
 * Bet outcome enumeration (matches Leo constants)
 */
export enum Outcome {
  Yes = 1,
  No = 2,
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
  questionHash: string;          // field - Hash of the market question
  question?: string;             // Resolved from IPFS/off-chain
  category: MarketCategory;      // u8 - Market category
  deadline: bigint;              // u64 - Betting deadline (block height)
  resolutionDeadline: bigint;    // u64 - When market must be resolved
  status: MarketStatus;          // u8 - Current market status
  createdAt: bigint;             // u64 - Creation block height
}

/**
 * Aggregate pool data (matches Leo MarketPool struct)
 */
export interface MarketPool {
  marketId: string;              // field
  totalYesPool: bigint;          // u64 - Total amount bet on YES (microcredits)
  totalNoPool: bigint;           // u64 - Total amount bet on NO (microcredits)
  totalBets: bigint;             // u64 - Number of bets placed
  totalUniqueBettors: bigint;    // u64 - Unique participants
}

/**
 * Market resolution data (matches Leo MarketResolution struct)
 */
export interface MarketResolution {
  marketId: string;              // field
  winningOutcome: Outcome;       // u8 - OUTCOME_YES or OUTCOME_NO
  resolver: string;              // address - Who resolved the market
  resolvedAt: bigint;            // u64 - Resolution block height
  totalPayoutPool: bigint;       // u64 - Pool after fees for winners
}

/**
 * User's private bet record (matches Leo Bet record)
 * This data is encrypted on-chain and only visible to the owner
 */
export interface Bet {
  owner: string;                 // address - The bettor's address
  marketId: string;              // field - Which market this bet is for
  amount: bigint;                // u64 - Amount wagered (in microcredits)
  outcome: Outcome;              // u8 - OUTCOME_YES or OUTCOME_NO
  placedAt: bigint;              // u64 - Block height when bet was placed
  // These are derived/client-side fields
  nonce?: string;                // group - Record nonce (for decryption)
  ciphertext?: string;           // The encrypted record on-chain
}

/**
 * Winnings claim record (matches Leo WinningsClaim record)
 */
export interface WinningsClaim {
  owner: string;                 // address - Winner's address
  marketId: string;              // field - Which market
  betAmount: bigint;             // u64 - Original bet amount
  winningOutcome: Outcome;       // u8 - The outcome that won
}

/**
 * Refund claim record (matches Leo RefundClaim record)
 */
export interface RefundClaim {
  owner: string;                 // address
  marketId: string;              // field
  amount: bigint;                // u64
}

/**
 * Market with computed statistics (for frontend display)
 */
export interface MarketWithStats extends Market {
  pool: MarketPool;
  resolution?: MarketResolution;
  yesPercentage: number;         // Calculated: yesPool / totalPool * 100
  noPercentage: number;          // Calculated: noPool / totalPool * 100
  totalVolume: bigint;           // Calculated: yesPool + noPool
  potentialYesPayout: number;    // Multiplier for YES bet
  potentialNoPayout: number;     // Multiplier for NO bet
  timeRemaining?: string;        // Formatted time until deadline
}

/**
 * Create market parameters
 */
export interface CreateMarketParams {
  question: string;
  category: MarketCategory;
  deadline: Date;
  resolutionDeadline: Date;
}

/**
 * Place bet parameters
 */
export interface PlaceBetParams {
  marketId: string;
  amount: bigint;                // Amount in microcredits
  outcome: Outcome;
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
 * Wallet adapter interface (for different wallet providers)
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
 * Fee configuration (matches Leo constants)
 */
export const PROTOCOL_FEE_BPS = 100n;      // 1% protocol fee
export const CREATOR_FEE_BPS = 100n;       // 1% creator fee
export const FEE_DENOMINATOR = 10000n;
export const MIN_BET_AMOUNT = 1000n;       // 0.001 credits minimum bet

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

