/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Network
  readonly VITE_NETWORK: 'testnet' | 'mainnet';
  readonly VITE_ALEO_RPC_URL: string;
  readonly VITE_EXPLORER_URL: string;
  
  // Program
  readonly VITE_PROGRAM_ID: string;
  readonly VITE_CREDITS_PROGRAM_ID: string;
  
  // Wallet
  readonly VITE_ENABLE_DEMO_MODE: string;
  readonly VITE_DEFAULT_WALLET: 'puzzle' | 'leo';
  
  // Development Keys (local testing only)
  readonly VITE_DEV_PRIVATE_KEY?: string;
  readonly VITE_DEV_VIEW_KEY?: string;
  readonly VITE_DEV_ADDRESS?: string;
  
  // Features
  readonly VITE_ENABLE_CREATE_MARKET: string;
  readonly VITE_ENABLE_BETTING: string;
  readonly VITE_SHOW_TESTNET_BANNER: string;
  readonly VITE_DEBUG: string;
  
  // App
  readonly VITE_APP_NAME: string;
  readonly VITE_APP_DESCRIPTION: string;
  readonly VITE_APP_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
