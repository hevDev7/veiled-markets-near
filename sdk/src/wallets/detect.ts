// ============================================================================
// Wallet Detection Helper
// ============================================================================
// Auto-detects which Aleo wallet extension is installed in the current
// browser and returns a ready-to-use adapter. Falls back to null if none
// are available.
// ============================================================================

import type { WalletAdapter } from '../types';
import { ShieldWalletAdapter, detectShield } from './shield';
import { PuzzleWalletAdapter, detectPuzzle } from './puzzle';
import { LeoWalletAdapter, detectLeo } from './leo';

/**
 * Wallet preference order — Shield first (primary supported), then
 * Puzzle, then Leo. Callers can override by instantiating adapters
 * directly.
 */
export const AVAILABLE_WALLETS = ['shield', 'puzzle', 'leo'] as const;
export type WalletName = (typeof AVAILABLE_WALLETS)[number];

/**
 * Detect which wallets are currently installed in the browser.
 * Returns an array of names — useful for wallet selector UI.
 */
export function listInstalledWallets(): WalletName[] {
  const found: WalletName[] = [];
  if (detectShield()) found.push('shield');
  if (detectPuzzle()) found.push('puzzle');
  if (detectLeo()) found.push('leo');
  return found;
}

/**
 * Auto-detect and return the preferred installed wallet adapter.
 * Returns null if no supported wallet is installed.
 *
 * Usage:
 *   const wallet = detectWallet();
 *   if (!wallet) {
 *     alert('Please install Shield, Puzzle, or Leo wallet');
 *     return;
 *   }
 *   await wallet.connect();
 */
export function detectWallet(preferred?: WalletName): WalletAdapter | null {
  // Honor caller preference first
  if (preferred) {
    try {
      if (preferred === 'shield' && detectShield()) return new ShieldWalletAdapter();
      if (preferred === 'puzzle' && detectPuzzle()) return new PuzzleWalletAdapter();
      if (preferred === 'leo' && detectLeo()) return new LeoWalletAdapter();
    } catch {
      // fall through to auto-detect
    }
  }

  // Auto-detect in preference order
  try {
    if (detectShield()) return new ShieldWalletAdapter();
  } catch {}
  try {
    if (detectPuzzle()) return new PuzzleWalletAdapter();
  } catch {}
  try {
    if (detectLeo()) return new LeoWalletAdapter();
  } catch {}

  return null;
}
