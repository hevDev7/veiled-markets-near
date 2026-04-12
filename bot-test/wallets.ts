// ============================================================================
// Multi-user wallet manager — one wallet per Telegram user
// ============================================================================
// Private keys are encrypted with AES-256-GCM before saving to disk.
// Encryption key is derived from WALLET_ENCRYPTION_KEY env var.
// ============================================================================

import { Account } from '@provablehq/sdk'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'

const WALLETS_FILE = new URL('./wallets.json', import.meta.url).pathname

// Derive a 32-byte encryption key from env var
const ENCRYPTION_PASSPHRASE = process.env.WALLET_ENCRYPTION_KEY
if (!ENCRYPTION_PASSPHRASE) {
  console.error('FATAL: WALLET_ENCRYPTION_KEY not set in .env — required to encrypt user private keys')
  process.exit(1)
}
const ENCRYPTION_KEY = scryptSync(ENCRYPTION_PASSPHRASE, 'veiled-wallets-salt', 32)

// ── AES-256-GCM encryption helpers ─────────────────────────────────────────

function encrypt(plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  // Format: iv:tag:ciphertext (all hex)
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
}

function decrypt(encoded: string): string {
  const [ivHex, tagHex, dataHex] = encoded.split(':')
  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const encrypted = Buffer.from(dataHex, 'hex')
  const decipher = createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv)
  decipher.setAuthTag(tag)
  return decipher.update(encrypted) + decipher.final('utf8')
}

// ── Wallet types ────────────────────────────────────────────────────────────

interface UserWallet {
  telegramId: number
  privateKey: string       // plaintext in memory only
  address: string
  creditsRecord: string | null
  createdAt: number
}

interface StoredWallet {
  telegramId: number
  encryptedKey: string     // AES-256-GCM encrypted private key
  address: string
  creditsRecord: string | null
  createdAt: number
}

// In-memory store (plaintext keys), synced to disk (encrypted keys)
let wallets: Map<number, UserWallet> = new Map()

/** Load wallets from disk on startup */
export function loadWallets(): void {
  try {
    if (existsSync(WALLETS_FILE)) {
      const data: StoredWallet[] = JSON.parse(readFileSync(WALLETS_FILE, 'utf8'))
      for (const stored of data) {
        try {
          const privateKey = decrypt(stored.encryptedKey)
          wallets.set(stored.telegramId, {
            telegramId: stored.telegramId,
            privateKey,
            address: stored.address,
            creditsRecord: stored.creditsRecord,
            createdAt: stored.createdAt,
          })
        } catch {
          console.warn(`[wallets] Failed to decrypt wallet for user ${stored.telegramId} — skipped`)
        }
      }
      console.log(`[wallets] Loaded ${wallets.size} user wallet(s) (encrypted)`)
    }
  } catch (err) {
    console.warn(`[wallets] Could not load wallets.json: ${(err as Error).message}`)
  }
}

/** Save wallets to disk (private keys encrypted) */
function saveWallets(): void {
  try {
    const data: StoredWallet[] = Array.from(wallets.values()).map((w) => ({
      telegramId: w.telegramId,
      encryptedKey: encrypt(w.privateKey),
      address: w.address,
      creditsRecord: w.creditsRecord,
      createdAt: w.createdAt,
    }))
    writeFileSync(WALLETS_FILE, JSON.stringify(data, null, 2), 'utf8')
  } catch (err) {
    console.error(`[wallets] Failed to save: ${(err as Error).message}`)
  }
}

/** Get or create a wallet for a Telegram user */
export function getOrCreateWallet(telegramId: number): UserWallet {
  let w = wallets.get(telegramId)
  if (w) return w

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
