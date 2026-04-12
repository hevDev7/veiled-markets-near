// ============================================================================
// VEILED MARKETS SDK - Wallet Adapters
// ============================================================================
// Browser-only adapters for Aleo wallet extensions. All adapters implement
// the common `WalletAdapter` interface defined in types.ts, so client code
// can switch wallets without changing the call site:
//
//   const wallet = detectWallet() ?? new ShieldWalletAdapter()
//   await wallet.connect()
//   const result = await wallet.requestTransaction({ ... })
//
// These adapters are THIN wrappers around the wallet extension's
// `window.shield` / `window.puzzle` / `window.leoWallet` globals. They
// don't do any proof generation themselves — the wallet extension handles
// that. For backend/Node.js bot scenarios that need to submit without a
// wallet popup, use `NodeExecutor` from `src/executor.ts` instead.
// ============================================================================

export { ShieldWalletAdapter, detectShield } from './shield';
export { PuzzleWalletAdapter, detectPuzzle } from './puzzle';
export { LeoWalletAdapter, detectLeo } from './leo';
export { detectWallet, listInstalledWallets, AVAILABLE_WALLETS } from './detect';
export type { WalletName } from './detect';
