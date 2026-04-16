// ============================================================================
// Oracle Record Scanner — credits.aleo records for dust-injection bets
// ============================================================================
// The operator already signs create_turbo_market / resolve_turbo_market with
// OPERATOR_PRIVATE_KEY. We reuse the same key to fund the sole-bettor dust
// injection path (buy_up_down requires a private credits.aleo record).
//
// Strategy:
//   1. At oracle startup, scan recent blocks for unspent credits records
//      owned by the operator. Cache plaintexts in memory.
//   2. On each dust inject, pop a record from cache and hand it to
//      snarkos developer execute.
//   3. After the inject tx is broadcast, decrypt the change record from the
//      tx outputs (view key derived from the same private key) and push it
//      back onto the cache.
//
// No separate env vars needed beyond what the oracle already requires:
//   OPERATOR_PRIVATE_KEY  — same key used for create/resolve
//   ALEO_RPC_URL          — already used elsewhere
//
// Startup fallback: if the scan yields no records, the operator can set
// CREDITS_RECORD_PLAINTEXT as a one-shot bootstrap. That record is used
// on the first dust inject, and the change record rotates in from there.
// ============================================================================

import { Account, AleoNetworkClient } from '@provablehq/sdk'
import { execSync } from 'node:child_process'

// AleoNetworkClient appends /<network> internally, so we pass the base URL.
// The tx-fetch / decrypt paths need the network-qualified URL and id.
const RPC_BASE = (process.env.ALEO_RPC_URL || 'https://api.explorer.provable.com/v1')
  .replace(/\/(testnet|mainnet|canary)\/?$/, '')
const NETWORK_NAME = process.env.ALEO_NETWORK === 'mainnet' ? 'mainnet' : 'testnet'
const NETWORK_ID_STR = NETWORK_NAME === 'mainnet' ? '0' : '1'
const RPC_URL_QUALIFIED = `${RPC_BASE}/${NETWORK_NAME}`
const SCAN_BLOCK_DEPTH = Number(process.env.ORACLE_RECORD_SCAN_BLOCKS || 5000)

let _account: Account | null = null
function getAccount(privateKey: string): Account {
  if (_account) return _account
  _account = new Account({ privateKey })
  return _account
}

// Module-level cache of unspent credits record plaintexts (latest last).
let cache: string[] = []
let cacheReady = false
let scanPromise: Promise<void> | null = null

function recordBalance(plaintext: string): bigint {
  const m = plaintext.match(/microcredits:\s*(\d+)u64/)
  return m ? BigInt(m[1]) : 0n
}

/**
 * Kick off a background scan of recent blocks for unspent credits records.
 * Idempotent — calling twice is a no-op. Subsequent `findCreditsRecord` calls
 * await the same promise.
 */
export function startRecordScan(privateKey: string): void {
  if (scanPromise) return
  scanPromise = runScan(privateKey)
}

async function runScan(privateKey: string): Promise<void> {
  // One-shot env bootstrap — useful on first deployment before the wallet
  // has any unspent records on-chain.
  const envBootstrap = process.env.CREDITS_RECORD_PLAINTEXT
  if (envBootstrap && !envBootstrap.startsWith('<') && !envBootstrap.startsWith('{owner: aleo1example')) {
    console.log('[oracle-records] using CREDITS_RECORD_PLAINTEXT bootstrap (skipping initial scan)')
    cache = [envBootstrap]
    cacheReady = true
    return
  }

  try {
    const account = getAccount(privateKey)
    const address = account.address().to_string()
    console.log(`[oracle-records] scanning last ${SCAN_BLOCK_DEPTH} blocks for unspent records owned by ${address.slice(0, 18)}...`)

    const client = new AleoNetworkClient(RPC_BASE)
    const latest = Number(await client.getLatestHeight())
    const start = Math.max(0, latest - SCAN_BLOCK_DEPTH)

    const records = await client.findUnspentRecords(start, undefined, privateKey, undefined, undefined)
    if (!records || records instanceof Error) {
      console.warn('[oracle-records] scan returned no records')
      cacheReady = true
      return
    }

    const list = Array.isArray(records) ? records : []
    for (const r of list) {
      const plaintext = r.toString()
      const balance = recordBalance(plaintext)
      if (balance > 0n) {
        cache.push(plaintext)
        console.log(`[oracle-records] cached record ${(Number(balance) / 1e6).toFixed(4)} ALEO`)
      }
    }
    console.log(`[oracle-records] scan complete — ${cache.length} record(s) ready`)
  } catch (err) {
    const msg = (err as Error).message ?? String(err)
    console.error(`[oracle-records] scan failed: ${msg.slice(0, 300)}`)
  }
  cacheReady = true
}

/**
 * Return a cached credits record plaintext with at least `minAmountMicro`.
 * Waits for the initial scan to finish if it's still running. The returned
 * record is REMOVED from the cache immediately — callers must either
 * replace it via `replaceRecord(changePlaintext)` after a successful tx,
 * or return it via `pushRecord(plaintext)` if the tx failed.
 */
export async function takeCreditsRecord(
  privateKey: string,
  minAmountMicro: bigint,
): Promise<string | null> {
  if (!cacheReady && scanPromise) {
    console.log('[oracle-records] waiting for initial scan...')
    await scanPromise
  }
  // Lazy re-scan if cache is empty.
  if (cache.length === 0 && !scanPromise) {
    scanPromise = runScan(privateKey)
    await scanPromise
  }
  for (let i = 0; i < cache.length; i++) {
    const plaintext = cache[i]
    if (recordBalance(plaintext) >= minAmountMicro) {
      cache.splice(i, 1)
      return plaintext
    }
  }
  return null
}

/** Push a record back onto the cache (e.g. tx failed, record still unspent). */
export function pushRecord(plaintext: string): void {
  cache.push(plaintext)
}

/** Replace the cache with the single most-recent change record. */
export function replaceRecord(plaintext: string): void {
  cache = [plaintext]
  const balance = recordBalance(plaintext)
  console.log(`[oracle-records] cache rotated to change record (${(Number(balance) / 1e6).toFixed(4)} ALEO)`)
}

/**
 * Fetch the confirmed tx from the explorer, find the credits.aleo record
 * output, decrypt it with the operator's view key (derived from private key
 * via the SDK — no extra env needed), and push it into the cache.
 */
export async function captureChangeRecord(
  txId: string,
  privateKey: string,
  maxWaitMs = 90_000,
): Promise<string | null> {
  const account = getAccount(privateKey)
  const viewKey = account.viewKey().to_string()

  const start = Date.now()
  const pollIntervalMs = 4_000
  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await fetch(`${RPC_URL_QUALIFIED}/transaction/${txId}`)
      if (!res.ok) {
        await new Promise((r) => setTimeout(r, pollIntervalMs))
        continue
      }
      const tx = (await res.json()) as any
      const transitions = tx?.execution?.transitions ?? []
      for (const t of transitions) {
        for (const o of (t.outputs ?? [])) {
          if (o.type !== 'record') continue
          const ct = o.value
          if (typeof ct !== 'string' || !ct.startsWith('record1')) continue
          try {
            const plaintext = execSync(
              `snarkos developer decrypt --ciphertext "${ct}" --view-key "${viewKey}" --network ${NETWORK_ID_STR}`,
              { encoding: 'utf8', timeout: 15_000 },
            ).trim()
            if (plaintext.includes('microcredits:')) {
              replaceRecord(plaintext)
              return plaintext
            }
          } catch {
            // Wrong-owner ciphertext — try next output.
          }
        }
      }
      // Tx confirmed but no matching record — don't keep polling.
      return null
    } catch {
      await new Promise((r) => setTimeout(r, pollIntervalMs))
    }
  }
  return null
}

/** Operator address derived from the private key (cached). */
export function getOperatorAddress(privateKey: string): string | null {
  try {
    return getAccount(privateKey).address().to_string()
  } catch {
    return null
  }
}

/** Debug helper — how many records are currently cached. */
export function cacheSize(): number {
  return cache.length
}
