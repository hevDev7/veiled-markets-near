// NEAR testnet configuration for Veiled Markets. Everything chain-specific the UI needs is here; values can be
// overridden with VITE_* variables (see frontend/.env.example).
const env = import.meta.env as Record<string, string | undefined>;

export const NEAR_NETWORK = 'testnet' as const;
export const VEILED_CONTRACT = env.VITE_NEAR_CONTRACT || 'v1.veiled-markets.testnet';
/**
 * Circle's official USDC on NEAR testnet, the contract's token slot 3 (`set_token_account(3, …)`). The app's internal
 * key for it stays 'USDCX' so the Aleo-shaped code paths keep working; users only ever see "USDC".
 */
export const USDCX_TOKEN = env.VITE_NEAR_USDCX_TOKEN || '3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af';
/**
 * Slot 2 is retired: it still points at the early mock token and carries its old balances, so it could not be
 * re-pointed. Not offered in the UI (internal key 'USAD'); shown as "USDCX" if an old note turns up.
 */
export const USAD_TOKEN = env.VITE_NEAR_USAD_TOKEN || 'usdcx.veiled-tokens.testnet';
/** Circle's public faucet; choose "NEAR Testnet" there. */
export const USDC_FAUCET_URL = 'https://faucet.circle.com/';
export const RELAYER_URL = (env.VITE_RELAYER_URL || 'http://localhost:4100').replace(/\/$/, '');
export const RELAYER_ACCOUNT = env.VITE_RELAYER_ACCOUNT || 'veiled-relayer.testnet';
export const TURBO_ORACLE_URL = (env.VITE_TURBO_ORACLE_URL || env.VITE_PYTH_ORACLE_URL || 'http://localhost:4090').replace(/\/$/, '');
/** The AI resolver service: the create page's source check (and AI drafting), and the resolver's receipts. */
export const AI_RESOLVER_URL = (env.VITE_AI_RESOLVER_URL || 'https://ai-resolver-production.up.railway.app').replace(/\/$/, '');
export const RPC_URLS = (env.VITE_NEAR_RPC_URLS || 'https://test.rpc.fastnear.com,https://near-testnet.drpc.org')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export const EXPLORER_URL = 'https://testnet.nearblocks.io';
export const txUrl = (hash: string) => `${EXPLORER_URL}/txns/${hash}`;
export const accountUrl = (id: string) => `${EXPLORER_URL}/address/${id}`;
/** A NEAR transaction hash (base58, 32 bytes). */
export const isNearTxHash = (id?: string | null): id is string => !!id && /^[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(id);
/** An id the explorer can show: an Aleo at1… id or a NEAR transaction hash (not a wallet event UUID). */
export const isChainTxId = (id?: string | null): id is string => !!id && (id.startsWith('at1') || isNearTxHash(id));

/** The contract's virtual height advances one tick per 4 s of block time (the Aleo testnet cadence the UI assumes). */
export const SECONDS_PER_TICK = 4;
/** All amounts are 6-decimal micro units; 1 micro NEAR = 1e18 yoctoNEAR. */
export const YOCTO_PER_MICRO = 10n ** 18n;

/** On-chain token slots by the app's internal keys: 'USDCX' is Circle USDC (slot 3), 'USAD' the retired slot 2. */
export const TOKEN = { NEAR: 1, USAD: 2, USDCX: 3 } as const;
export type TokenId = (typeof TOKEN)[keyof typeof TOKEN];
export const KIND = { BALANCE: 1, SHARE: 2, LP: 3, TURBO: 4, PARLAY: 5 } as const;

export const TOKEN_SYMBOL: Record<number, string> = { 1: 'NEAR', 2: 'USDCX', 3: 'USDC' };
/** Internal key of an on-chain token slot. */
export const TOKEN_KEY: Record<number, 'NEAR' | 'USDCX' | 'USAD'> = { 1: 'NEAR', 2: 'USAD', 3: 'USDCX' };
/** Tokens a user can pick on NEAR: NEAR and Circle USDC. */
export const ENABLED_TOKEN_KEYS = ['NEAR', 'USDCX'] as const;
/** Display label for the app's internal token keys ('NEAR', or legacy 'ALEO'; 'USDCX' is Circle USDC). */
export const tokenLabel = (key?: string | null): string =>
  key === 'USDCX' ? 'USDC' : key === 'USAD' ? 'USDCX' : 'NEAR';
export const tokenAccount = (token: number): string | null =>
  token === TOKEN.USDCX ? USDCX_TOKEN : token === TOKEN.USAD ? USAD_TOKEN : null;

export const ZK_WASM_URL = '/zk/spend.wasm';
export const ZK_ZKEY_URL = '/zk/spend_final.zkey';

export const GAS_DEFAULT = 100_000_000_000_000n; // 100 TGas
export const GAS_MAX = 300_000_000_000_000n;

/** Public NEAR that covers the gas of any public call (create, vote, dispute, cancel) with room to spare. */
export const PUBLIC_CALL_GAS_MICRO = 10_000n; // 0.01 NEAR

/** Aleo features and whether the NEAR contract has them (hidden entry points stay hidden until it does). */
export const FEATURES = { parlays: true, proposals: false } as const;
