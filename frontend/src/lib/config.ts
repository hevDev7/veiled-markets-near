// ============================================================================
// VEILED MARKETS - Configuration
// ============================================================================
// Reads environment variables with type safety and defaults
// ============================================================================
import { devLog } from './logger'

/**
 * Network type
 */
export type NetworkType = 'testnet' | 'mainnet';

/**
 * Wallet type
 */
export type WalletType = 'puzzle' | 'leo' | 'demo';

/**
 * Application configuration
 */
export interface AppConfig {
  // Network
  network: NetworkType;
  rpcUrl: string;
  explorerUrl: string;

  // Block time
  secondsPerBlock: number;
  msPerBlock: number;

  // Program
  programId: string;
  creditsProgramId: string;
  usdcxProgramId: string;
  usdcxMarketProgramId: string;
  usadProgramId: string;
  governanceProgramId: string;
  parlayProgramId: string;

  // Wallet
  enableDemoMode: boolean;
  defaultWallet: WalletType;

  // Development keys (local testing only - NEVER use in production!)
  devPrivateKey: string | null;
  devViewKey: string | null;
  devAddress: string | null;

  // Features
  enableCreateMarket: boolean;
  enableBetting: boolean;
  showTestnetBanner: boolean;
  debug: boolean;

  // IPFS / Pinata
  pinataJwt: string | null;
  pinataGateway: string;

  // App
  appName: string;
  appDescription: string;
  appUrl: string;
}

/**
 * Network-specific configuration
 */
export const NETWORK_CONFIGS = {
  testnet: {
    rpcUrl: 'https://api.explorer.provable.com/v1/testnet',
    explorerUrl: 'https://testnet.explorer.provable.com',
  },
  mainnet: {
    rpcUrl: 'https://api.explorer.provable.com/v1/mainnet',
    explorerUrl: 'https://explorer.provable.com',
  },
} as const;

/**
 * Get environment variable with fallback
 */
function getEnv(key: string, fallback: string = ''): string {
  return import.meta.env[key] ?? fallback;
}

/**
 * Get boolean environment variable
 */
function getEnvBool(key: string, fallback: boolean = false): boolean {
  const value = import.meta.env[key];
  if (value === undefined) return fallback;
  return value === 'true' || value === '1';
}

/**
 * Load configuration from environment variables
 */
function loadConfig(): AppConfig {
  const network = (getEnv('VITE_NETWORK', 'testnet') as NetworkType);

  return {
    // Network
    network,
    // NEAR testnet. rpcUrl stays for legacy readers; the NEAR layer (lib/near) keeps its own RPC list.
    rpcUrl: getEnv('VITE_NEAR_RPC_URL', 'https://test.rpc.fastnear.com'),
    explorerUrl: getEnv('VITE_NEAR_EXPLORER_URL', 'https://testnet.nearblocks.io'),

    // The Veiled contract's height is block_timestamp_ms / 4000: one tick every 4 s, like Aleo testnet.
    secondsPerBlock: 4,
    msPerBlock: 4000,

    // Program (v6 post-audit hardening, deployed 2026-04-08)
    // - Bug A: removed governance_resolved_outcomes collision in committee/panel
    // - Bug B: cross-program auth uses program literal veiled_governance_v6.aleo
    // - Bug C: governance_resolve_* propagates real escalation tier (2 vs 3)
    // - Bug D: MarketSeed includes token_type so market_id unique across tokens
    // - Hardening: initiate_escalation split into 3 token-specific variants
    programId: getEnv('VITE_PROGRAM_ID', 'veiled_markets_v37.aleo'),
    creditsProgramId: getEnv('VITE_CREDITS_PROGRAM_ID', 'credits.aleo'),
    usdcxProgramId: getEnv('VITE_USDCX_PROGRAM_ID', 'test_usdcx_stablecoin.aleo'),
    usdcxMarketProgramId: getEnv('VITE_USDCX_MARKET_PROGRAM_ID', 'veiled_markets_usdcx_v7.aleo'),
    usadProgramId: getEnv('VITE_USAD_PROGRAM_ID', 'veiled_markets_usad_v14.aleo'),
    governanceProgramId: getEnv('VITE_GOVERNANCE_PROGRAM_ID', 'veiled_governance_v6.aleo'),
    parlayProgramId: getEnv('VITE_PARLAY_PROGRAM_ID', 'veiled_parlay_v3.aleo'),

    // Wallet
    // Demo mode is force-disabled in production builds regardless of env to
    // prevent fake balances and fake TX IDs from leaking into prod.
    enableDemoMode: import.meta.env.PROD ? false : getEnvBool('VITE_ENABLE_DEMO_MODE', true),
    defaultWallet: getEnv('VITE_DEFAULT_WALLET', 'shield') as WalletType,

    // Development keys (local testing only)
    devPrivateKey: getEnv('VITE_DEV_PRIVATE_KEY') || null,
    devViewKey: getEnv('VITE_DEV_VIEW_KEY') || null,
    devAddress: getEnv('VITE_DEV_ADDRESS') || null,

    // Features
    enableCreateMarket: getEnvBool('VITE_ENABLE_CREATE_MARKET', true),
    enableBetting: getEnvBool('VITE_ENABLE_BETTING', true),
    showTestnetBanner: getEnvBool('VITE_SHOW_TESTNET_BANNER', true),
    debug: getEnvBool('VITE_DEBUG', false),

    // IPFS / Pinata
    pinataJwt: getEnv('VITE_PINATA_JWT') || null,
    pinataGateway: getEnv('VITE_PINATA_GATEWAY', 'https://gateway.pinata.cloud'),

    // App
    appName: getEnv('VITE_APP_NAME', 'Veiled Markets'),
    appDescription: getEnv('VITE_APP_DESCRIPTION', 'Privacy-Preserving Prediction Markets on NEAR'),
    appUrl: getEnv('VITE_APP_URL', 'https://veiled.markets'),
  };
}

/**
 * Application configuration singleton
 */
export const config: AppConfig = loadConfig();

/**
 * Check if running in development mode
 */
export const isDev = import.meta.env.DEV;

/**
 * Check if running in production mode
 */
export const isProd = import.meta.env.PROD;

/**
 * Log debug message (only in debug mode)
 */
export function debug(...args: unknown[]): void {
  if (config.debug) {
    devLog('[Veiled Markets]', ...args);
  }
}

/**
 * Get transaction URL on explorer
 * Supports both Aleo transaction IDs (at1...) and UUIDs
 */
export function getTransactionUrl(txId: string): string {
  devLog('getTransactionUrl called with:', txId);

  // Clean the transaction ID (remove any whitespace)
  const cleanTxId = txId.trim();

  return `${config.explorerUrl}/txns/${cleanTxId}`;
}

/**
 * Get address URL on explorer
 */
export function getAddressUrl(address: string): string {
  return `${config.explorerUrl}/address/${address}`;
}

/**
 * Get program URL on explorer
 */
export function getProgramUrl(_programId?: string): string {
  // Every Aleo program maps to the one Veiled contract on NEAR.
  return `${config.explorerUrl}/address/${import.meta.env.VITE_NEAR_CONTRACT || 'v1.veiled-markets.testnet'}`;
}

// Export default config
export default config;
