// ============================================================================
// Multi-user wallet manager — one wallet per Telegram user
// ============================================================================
// Wallets are auto-generated on first interaction and persisted to a local
// JSON file. Each user gets their own Aleo private key, address, and
// credits record cache.
// ============================================================================

import { Account } from '@provablehq/sdk'
import { readFileSync, writeFileSync, existsSync } from 'fs'

const WALLETS_FILE = new URL('./wallets.json', import.meta.url).pathname

interface UserWallet {
  telegramId: number
  privateKey: string
  address: string
  creditsRecord: string | null  // cached private credits record
  createdAt: number
}

// In-memory store, synced to disk
let wallets: Map<number, UserWallet> = new Map()

/** Load wallets from disk on startup */
export function loadWallets(): void {
  try {
    if (existsSync(WALLETS_FILE)) {
      const data = JSON.parse(readFileSync(WALLETS_FILE, 'utf8'))
      for (const w of data) {
        wallets.set(w.telegramId, w)
      }
      console.log(`[wallets] Loaded ${wallets.size} user wallet(s)`)
    }
  } catch (err) {
    console.warn(`[wallets] Could not load wallets.json: ${(err as Error).message}`)
  }
}

/** Save wallets to disk */
function saveWallets(): void {
  try {
    const data = Array.from(wallets.values())
    writeFileSync(WALLETS_FILE, JSON.stringify(data, null, 2), 'utf8')
  } catch (err) {
    console.error(`[wallets] Failed to save: ${(err as Error).message}`)
  }
}

/** Get or create a wallet for a Telegram user */
export function getOrCreateWallet(telegramId: number): UserWallet {
  let w = wallets.get(telegramId)
  if (w) return w

  // Generate new Aleo account
  const account = new Account()
  w = {
    telegramId,
    privateKey: account.privateKey().to_string(),
    address: account.address().to_string(),
    creditsRecord: null,
    createdAt: Date.now(),
  }
  wallets.set(telegramId, w)
  saveWallets()
  console.log(`[wallets] Created wallet for user ${telegramId}: ${w.address}`)
  return w
}

/** Get existing wallet (returns null if not created yet) */
export function getWallet(telegramId: number): UserWallet | null {
  return wallets.get(telegramId) ?? null
}

/** Update the cached credits record for a user */
export function updateCreditsRecord(telegramId: number, record: string | null): void {
  const w = wallets.get(telegramId)
  if (!w) return
  w.creditsRecord = record
  saveWallets()

  const balance = record?.match(/microcredits:\s*(\d+)u64/)
  if (balance) {
    console.log(`[wallets] User ${telegramId} record updated: ${(Number(BigInt(balance[1])) / 1e6).toFixed(4)} ALEO`)
  }
}

/** Get the view key for a user */
export function getViewKey(telegramId: number): string | null {
  const w = wallets.get(telegramId)
  if (!w) return null
  try {
    const account = new Account({ privateKey: w.privateKey })
    return account.viewKey().to_string()
  } catch {
    return null
  }
}
