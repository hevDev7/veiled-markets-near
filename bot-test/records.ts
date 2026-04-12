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

/**
 * Find an unspent credits.aleo record with at least `minAmountMicro`
 * microcredits. Returns the record plaintext string on success.
 */
export async function findCreditsRecord(
  privateKey: string,
  minAmountMicro: bigint,
): Promise<string | null> {
  // ── Strategy 1: Manual env var (most reliable) ────────────────────
  const envRecord = process.env.CREDITS_RECORD_PLAINTEXT
  if (envRecord && !envRecord.startsWith('<') && !envRecord.startsWith('{owner: aleo1example')) {
    console.log('[records] Using CREDITS_RECORD_PLAINTEXT from env')
    return envRecord
  }

  // ── Strategy 2: SDK scan via AleoNetworkClient ────────────────────
  try {
    getAccount(privateKey)

    console.log(`[records] Scanning recent blocks for credits record >= ${(Number(minAmountMicro) / 1e6).toFixed(4)} ALEO...`)
    console.log('[records] This may take 30-60 seconds...')

    const client = new AleoNetworkClient(RPC_URL)

    // Get current block height to scan only recent blocks
    const latestHeight = Number(await client.getLatestHeight())
    // Scan last 5000 blocks (~5.5 hours at 4s/block) — covers recent faucet/transfers
    const startHeight = Math.max(0, latestHeight - 5000)

    console.log(`[records] Scanning blocks ${startHeight} → ${latestHeight} (${latestHeight - startHeight} blocks)`)

    // findUnspentRecords expects the PRIVATE KEY (not view key) —
    // it derives the view key internally for decryption.
    const records = await client.findUnspentRecords(
      startHeight,
      undefined, // to latest
      privateKey, // SDK derives view key internally
      undefined, // amounts
      undefined, // max records
    )

    if (!records || (records instanceof Error)) {
      console.warn('[records] Scan returned no records or error')
      return null
    }

    const recordList = Array.isArray(records) ? records : []
    if (recordList.length === 0) {
      console.warn('[records] No unspent records found in recent blocks')
      return null
    }

    // Find one with enough balance
    for (const record of recordList) {
      const plaintext = record.toString()
      const amountMatch = plaintext.match(/microcredits:\s*(\d+)u64/)
      if (amountMatch) {
        const balance = BigInt(amountMatch[1])
        if (balance >= minAmountMicro) {
          console.log(`[records] ✓ Found record with ${(Number(balance) / 1e6).toFixed(4)} ALEO`)
          return plaintext
        }
      }
    }

    console.warn('[records] Found records but none with enough balance')
    return null
  } catch (err) {
    const msg = (err as Error).message ?? String(err)
    console.error(`[records] SDK scan failed: ${msg.slice(0, 300)}`)
    console.error('[records] Tip: set CREDITS_RECORD_PLAINTEXT in .env as manual fallback')
    return null
  }
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
