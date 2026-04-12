// ============================================================================
// Record Scanner — find unspent credits records for bet transactions
// ============================================================================
// Strategy (in order of preference):
//   1. CREDITS_RECORD_PLAINTEXT env var (manual — most reliable)
//   2. AleoNetworkClient.findUnspentRecords() scan (SDK — scans recent blocks)
//   3. Error with helpful instructions
// ============================================================================

import { Account, AleoNetworkClient } from '@provablehq/sdk'

const RPC_URL =
  process.env.ALEO_RPC_URL ??
  'https://api.explorer.provable.com/v1'

let _account: any = null

function getAccount(privateKey: string): any {
  if (_account) return _account
  console.log('[records] Initializing account from private key...')
  _account = new Account({ privateKey })
  console.log('[records] Address:', _account.address().to_string())
  return _account
}

// ── Cached records from startup scan ──────────────────────────────────
let _cachedRecords: string[] = []
let _cacheReady = false
let _cachePromise: Promise<void> | null = null

/**
 * Scan once at startup and cache all found records.
 * Call this early — subsequent findCreditsRecord() calls use the cache.
 */
export function startRecordScan(privateKey: string): void {
  if (_cachePromise) return
  _cachePromise = _scanAndCache(privateKey)
}

async function _scanAndCache(privateKey: string): Promise<void> {
  // Check env first
  const envRecord = process.env.CREDITS_RECORD_PLAINTEXT
  if (envRecord && !envRecord.startsWith('<') && !envRecord.startsWith('{owner: aleo1example')) {
    console.log('[records] Using CREDITS_RECORD_PLAINTEXT from env (skipping scan)')
    _cachedRecords = [envRecord]
    _cacheReady = true
    return
  }

  try {
    getAccount(privateKey)
    console.log('[records] Background scan starting...')

    const client = new AleoNetworkClient(RPC_URL)
    const latestHeight = Number(await client.getLatestHeight())
    const startHeight = Math.max(0, latestHeight - 5000)

    console.log(`[records] Scanning blocks ${startHeight} → ${latestHeight} (${latestHeight - startHeight} blocks)`)

    const records = await client.findUnspentRecords(
      startHeight,
      undefined,
      privateKey,
      undefined,
      undefined,
    )

    if (!records || (records instanceof Error)) {
      console.warn('[records] Scan returned no records or error')
      _cacheReady = true
      return
    }

    const recordList = Array.isArray(records) ? records : []
    for (const record of recordList) {
      const plaintext = record.toString()
      const amountMatch = plaintext.match(/microcredits:\s*(\d+)u64/)
      if (amountMatch) {
        const balance = BigInt(amountMatch[1])
        console.log(`[records] ✓ Cached record with ${(Number(balance) / 1e6).toFixed(4)} ALEO`)
        _cachedRecords.push(plaintext)
      }
    }

    if (_cachedRecords.length === 0) {
      console.warn('[records] No unspent records found in recent blocks')
    } else {
      console.log(`[records] ✅ Scan complete — ${_cachedRecords.length} record(s) cached and ready`)
    }
  } catch (err) {
    const msg = (err as Error).message ?? String(err)
    console.error(`[records] Scan failed: ${msg.slice(0, 300)}`)
  }
  _cacheReady = true
}

/**
 * Find an unspent credits.aleo record with at least `minAmountMicro`
 * microcredits. Uses cached records from startup scan — instant lookup.
 */
export async function findCreditsRecord(
  privateKey: string,
  minAmountMicro: bigint,
): Promise<string | null> {
  // Wait for background scan if still running
  if (!_cacheReady && _cachePromise) {
    console.log('[records] Waiting for background scan to finish...')
    await _cachePromise
  }

  // If no cached records, try env as fallback
  if (_cachedRecords.length === 0) {
    const envRecord = process.env.CREDITS_RECORD_PLAINTEXT
    if (envRecord && !envRecord.startsWith('<') && !envRecord.startsWith('{owner: aleo1example')) {
      return envRecord
    }
    return null
  }

  // Find cached record with enough balance
  for (const plaintext of _cachedRecords) {
    const amountMatch = plaintext.match(/microcredits:\s*(\d+)u64/)
    if (amountMatch) {
      const balance = BigInt(amountMatch[1])
      if (balance >= minAmountMicro) {
        console.log(`[records] Using cached record with ${(Number(balance) / 1e6).toFixed(4)} ALEO`)
        return plaintext
      }
    }
  }

  console.warn('[records] No cached record with enough balance')
  return null
}

/**
 * After a successful bet, the old record is spent and a change record
 * is returned. Call this to replace the cache with the new record.
 */
export function replaceRecord(newPlaintext: string): void {
  const amountMatch = newPlaintext.match(/microcredits:\s*(\d+)u64/)
  const balance = amountMatch ? Number(BigInt(amountMatch[1])) / 1e6 : 0
  console.log(`[records] Cache updated with change record (${balance.toFixed(4)} ALEO)`)
  _cachedRecords = [newPlaintext]
}

/**
 * Fetch a confirmed tx from the explorer, extract and decrypt the
 * credits.aleo change record, and update the cache.
 * Returns the plaintext on success, null on failure.
 */
export async function captureChangeRecord(
  txId: string,
  privateKey: string,
  maxWaitMs = 90_000,
): Promise<string | null> {
  // Derive view key directly (don't use cached global account)
  const account = new Account({ privateKey })
  const viewKey = account.viewKey().to_string()

  console.log(`[records] Waiting for tx ${txId.slice(0, 24)}… to confirm...`)

  const start = Date.now()
  const pollInterval = 5_000

  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await fetch(
        `${RPC_URL}/testnet/transaction/${txId}`
      )
      if (!res.ok) {
        // Not confirmed yet
        await new Promise((r) => setTimeout(r, pollInterval))
        continue
      }

      const tx = await res.json() as any
      const transitions = tx?.execution?.transitions ?? []

      // Look for credits.aleo record outputs (the change record)
      for (const t of transitions) {
        for (const o of (t.outputs ?? [])) {
          if (o.type !== 'record') continue
          const ciphertext = o.value
          if (!ciphertext || !ciphertext.startsWith('record1')) continue

          try {
            // Use snarkos to decrypt (more reliable than SDK)
            const { execSync } = await import('child_process')
            const plaintext = execSync(
              `snarkos developer decrypt --ciphertext "${ciphertext}" --view-key "${viewKey}" --network 1`,
              { encoding: 'utf8', timeout: 15_000 }
            ).trim()

            // Only keep credits records (has microcredits field)
            if (plaintext.includes('microcredits:')) {
              replaceRecord(plaintext)
              return plaintext
            }
          } catch {
            // Not our record or not credits — skip
          }
        }
      }

      console.warn('[records] Tx confirmed but no credits change record found')
      return null
    } catch {
      await new Promise((r) => setTimeout(r, pollInterval))
    }
  }

  console.warn('[records] Timed out waiting for tx confirmation')
  return null
}

/**
 * Get the Aleo address for the configured private key.
 */
export function getAddress(privateKey: string): string {
  try {
    const account = getAccount(privateKey)
    return account.address().to_string()
  } catch {
    return process.env.ALEO_ADDRESS ?? '(unknown)'
  }
}
