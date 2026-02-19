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
  const networkConfig = NETWORK_CONFIGS[network] || NETWORK_CONFIGS.testnet;

  return {
    // Network
    network,
    rpcUrl: getEnv('VITE_ALEO_RPC_URL', networkConfig.rpcUrl),
    explorerUrl: getEnv('VITE_EXPLORER_URL', networkConfig.explorerUrl),

    // Block time (measured on testnet: ~3.6s, use 4s as conservative estimate)
    secondsPerBlock: network === 'mainnet' ? 15 : 4,
    msPerBlock: network === 'mainnet' ? 15000 : 4000,

    // Program
    programId: getEnv('VITE_PROGRAM_ID', 'veiled_markets_v16.aleo'),
    creditsProgramId: getEnv('VITE_CREDITS_PROGRAM_ID', 'credits.aleo'),
    usdcxProgramId: getEnv('VITE_USDCX_PROGRAM_ID', 'test_usdcx_stablecoin.aleo'),

    // Wallet
    enableDemoMode: getEnvBool('VITE_ENABLE_DEMO_MODE', true),
    defaultWallet: getEnv('VITE_DEFAULT_WALLET', 'puzzle') as WalletType,

    // Development keys (local testing only)
    devPrivateKey: getEnv('VITE_DEV_PRIVATE_KEY') || null,
    devViewKey: getEnv('VITE_DEV_VIEW_KEY') || null,
    devAddress: getEnv('VITE_DEV_ADDRESS') || null,

    // Features
    enableCreateMarket: getEnvBool('VITE_ENABLE_CREATE_MARKET', true),
    enableBetting: getEnvBool('VITE_ENABLE_BETTING', true),
    showTestnetBanner: getEnvBool('VITE_SHOW_TESTNET_BANNER', true),
    debug: getEnvBool('VITE_DEBUG', false),

    // App
    appName: getEnv('VITE_APP_NAME', 'Veiled Markets'),
    appDescription: getEnv('VITE_APP_DESCRIPTION', 'Privacy-Preserving Prediction Markets on Aleo'),
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

  // Build the URL - Provable Explorer supports both formats
  const url = `${config.explorerUrl}/transaction/${cleanTxId}`;

  devLog('Generated URL:', url);
  devLog('Explorer base:', config.explorerUrl);
  devLog('Transaction ID format:', cleanTxId.startsWith('at1') ? 'Aleo format' : 'UUID format');

  return url;
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
export function getProgramUrl(programId?: string): string {
  return `${config.explorerUrl}/program/${programId || config.programId}`;
}

// Export default config
export default config;
