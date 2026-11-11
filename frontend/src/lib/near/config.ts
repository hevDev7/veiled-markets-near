// NEAR testnet configuration for Veiled Markets. Everything chain-specific the UI needs is here; values can be
// overridden with VITE_* variables (see frontend/.env.example).
const env = import.meta.env as Record<string, string | undefined>;

export const NEAR_NETWORK = 'testnet' as const;
export const VEILED_CONTRACT = env.VITE_NEAR_CONTRACT || 'v1.veiled-markets.testnet';
export const USDCX_TOKEN = env.VITE_NEAR_USDCX_TOKEN || 'usdcx.veiled-tokens.testnet';
export const USAD_TOKEN = env.VITE_NEAR_USAD_TOKEN || 'usad.veiled-tokens.testnet';
export const RELAYER_URL = (env.VITE_RELAYER_URL || 'http://localhost:4100').replace(/\/$/, '');
export const RELAYER_ACCOUNT = env.VITE_RELAYER_ACCOUNT || 'veiled-relayer.testnet';
export const TURBO_ORACLE_URL = (env.VITE_TURBO_ORACLE_URL || env.VITE_PYTH_ORACLE_URL || 'http://localhost:4090').replace(/\/$/, '');
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

export const TOKEN = { NEAR: 1, USDCX: 2, USAD: 3 } as const;
export type TokenId = (typeof TOKEN)[keyof typeof TOKEN];
export const KIND = { BALANCE: 1, SHARE: 2, LP: 3, TURBO: 4 } as const;

export const TOKEN_SYMBOL: Record<number, string> = { 1: 'NEAR', 2: 'USDCX', 3: 'USAD' };
export const tokenAccount = (token: number): string | null =>
  token === TOKEN.USDCX ? USDCX_TOKEN : token === TOKEN.USAD ? USAD_TOKEN : null;

export const ZK_WASM_URL = '/zk/spend.wasm';
export const ZK_ZKEY_URL = '/zk/spend_final.zkey';

export const GAS_DEFAULT = 100_000_000_000_000n; // 100 TGas
export const GAS_MAX = 300_000_000_000_000n;

/** Public NEAR that covers the gas of any public call (create, vote, dispute, cancel) with room to spare. */
export const PUBLIC_CALL_GAS_MICRO = 10_000n; // 0.01 NEAR

/** Aleo features the NEAR contract does not have yet; their entry points stay hidden until it does. */
export const FEATURES = { parlays: false, proposals: false } as const;
