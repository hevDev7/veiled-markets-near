import { devLog } from './logger'
/**
 * Shared utility for fetching Credits records from connected wallets.
 * Used by BettingModal and MarketDetail for private trading (buy_shares_private).
 */

/**
 * Validate that a string looks like a Leo record plaintext (NOT JSON metadata).
 * Valid: "{ owner: aleo1xxx.private, microcredits: 5000000u64.private, _nonce: ...group.public }"
 * Invalid: '{"blockHeight":123,"plaintext":"...","owner":"aleo1..."}' (JSON metadata)
 */
function isLeoRecordPlaintext(s: string): boolean {
  const trimmed = s.trim()
  // Leo record plaintexts use "key: value" format, NOT JSON "key": "value"
  // JSON metadata starts with '{"' — Leo records start with '{'
  if (trimmed.startsWith('{"')) return false
  if (!trimmed.startsWith('{')) return false
  if (!trimmed.includes('owner')) return false
  if (!trimmed.includes('microcredits')) return false
  return true
}

export function findSuitableRecord(records: any[], minAmountMicro: number): string | null {
  for (let i = 0; i < records.length; i++) {
    const record = records[i]
    if (!record) continue
    // Skip spent records
    if (record.spent === true || record.is_spent === true) continue
    if (record.status === 'spent' || record.status === 'Spent') continue

    // Try to extract Leo record plaintext from various record formats.
    // IMPORTANT: We must return a Leo record plaintext string, NOT JSON metadata.
    // Leo format: "{ owner: aleo1..., microcredits: 5000000u64.private, _nonce: ...group.public }"
    let plaintext: string | null = null

    // Case 1: Record IS a string (already plaintext)
    if (typeof record === 'string') {
      if (record.includes('microcredits')) plaintext = record
    }
    // Case 2: Record is an object — try known plaintext fields
    else if (typeof record === 'object') {
      // Try record.plaintext (use String() to handle non-string types)
      if (record.plaintext != null) {
        const pt = String(record.plaintext)
        if (pt.includes('microcredits')) {
          plaintext = pt
          devLog(`[Bet] Record ${i}: found plaintext via record.plaintext (type=${typeof record.plaintext}, len=${pt.length})`)
        }
      }
      // Try record.data
      if (!plaintext && record.data != null) {
        const dt = String(record.data)
        if (dt.includes('microcredits') && dt.includes('owner')) {
          plaintext = dt
          devLog(`[Bet] Record ${i}: found plaintext via record.data`)
        }
      }
      // Try record.content
      if (!plaintext && record.content != null) {
        const ct = String(record.content)
        if (ct.includes('microcredits') && ct.includes('owner')) {
          plaintext = ct
          devLog(`[Bet] Record ${i}: found plaintext via record.content`)
        }
      }
      // Scan ALL string fields for one that looks like a Leo record plaintext
      if (!plaintext) {
        for (const key of Object.keys(record)) {
          const val = record[key]
          if (val == null) continue
          const valStr = String(val)
          if (valStr.includes('microcredits') && valStr.includes('owner') && valStr.includes('{') && !valStr.startsWith('{"')) {
            plaintext = valStr
            devLog(`[Bet] Record ${i}: found Leo plaintext in field '${key}'`)
            break
          }
        }
      }
    }

    if (!plaintext) {
      // Debug logging for unrecognized record format
      if (typeof record === 'object') {
        const keys = Object.keys(record)
        const fieldInfo = keys.map(k => `${k}:${typeof record[k]}`).join(', ')
        devLog(`[Bet] Record ${i}: no plaintext found. keys=[${fieldInfo}]`)
        if (record.plaintext !== undefined) {
          devLog(`[Bet] Record ${i}: plaintext field (type=${typeof record.plaintext}):`, String(record.plaintext).slice(0, 500))
        }
      }
      continue
    }

    // Parse microcredits value
    const mcMatch = plaintext.match(/microcredits\s*:\s*(\d+)u64/)
    if (!mcMatch) {
      devLog(`[Bet] Record ${i}: has text with 'microcredits' but regex didn't match. Sample:`, plaintext.slice(0, 200))
      continue
    }

    const mc = parseInt(mcMatch[1], 10)
    devLog(`[Bet] Record ${i}: ${mc} microcredits (need ${minAmountMicro})`)

    if (mc >= minAmountMicro) {
      // Validate it's a proper Leo record plaintext, not JSON metadata
      if (isLeoRecordPlaintext(plaintext)) {
        devLog(`[Bet] Found suitable Credits record: ${mc} microcredits`)
        devLog(`[Bet] Record plaintext (first 300 chars):`, plaintext.slice(0, 300))
        return plaintext
      } else {
        devLog(`[Bet] Record ${i}: has ${mc} mc but NOT Leo format. Starts with:`, plaintext.slice(0, 80))
      }
    }
  }
  return null
}

/**
 * Fetch a Credits record plaintext from the connected wallet.
 * Strategy priority matches the working approach in store.ts balance detection:
 * 1. Adapter requestRecords with plaintext=true (WORKS for Shield Wallet)
 * 2. Adapter requestRecords without plaintext + decrypt fallback
 * 3. Adapter requestRecordPlaintexts
 * 4. Native wallet API (Leo/Shield direct)
 */
export async function fetchCreditsRecord(minAmountMicro: number): Promise<string | null> {
  devLog('[Bet] === Fetching Credits record for private betting ===')
  devLog(`[Bet] Need record with >= ${minAmountMicro} microcredits (${minAmountMicro / 1_000_000} ALEO)`)

  // Strategy 1: Adapter requestRecords with plaintext=true
  // This is the SAME approach that works in store.ts balance detection (line 314)
  const adapterRecords = (window as any).__aleoRequestRecords
  if (typeof adapterRecords === 'function') {
    try {
      devLog('[Bet] Strategy 1: adapter requestRecords("credits.aleo", true) — plaintext mode')
      const records = await adapterRecords('credits.aleo', true)
      const recordsArr = Array.isArray(records) ? records : (records?.records || [])
      devLog(`[Bet] Strategy 1 → Got ${recordsArr.length} record(s)`)
      if (recordsArr.length > 0) {
        devLog('[Bet] Strategy 1 → First record sample:', JSON.stringify(recordsArr[0])?.slice(0, 500))
        // Show last record too (record 6 is the one with 5 ALEO in balance detection)
        const last = recordsArr[recordsArr.length - 1]
        devLog(`[Bet] Strategy 1 → Last record (#${recordsArr.length - 1}) sample:`, JSON.stringify(last)?.slice(0, 500))
      }
      const found = findSuitableRecord(recordsArr, minAmountMicro)
      if (found) return found
    } catch (err) {
      devLog('[Bet] Strategy 1 failed:', err)
    }

    // Strategy 2: Adapter requestRecords without plaintext flag + decrypt
    try {
      devLog('[Bet] Strategy 2: adapter requestRecords("credits.aleo", false) + decrypt')
      const records = await adapterRecords('credits.aleo', false)
      const recordsArr = Array.isArray(records) ? records : (records?.records || [])
      devLog(`[Bet] Strategy 2 → Got ${recordsArr.length} record(s)`)

      // First try parsing as-is (some wallets include plaintext even without flag)
      const found = findSuitableRecord(recordsArr, minAmountMicro)
      if (found) return found

      // Try decrypting ciphertext records
      const decryptFn = (window as any).__aleoDecrypt
      if (typeof decryptFn === 'function' && recordsArr.length > 0) {
        devLog('[Bet] Strategy 2b: decrypting ciphertext records...')
        let decryptAttempts = 0
        for (let idx = 0; idx < recordsArr.length; idx++) {
          const record = recordsArr[idx]
          if (!record) continue
          if (record.spent === true || record.is_spent === true) continue
          if (record.status === 'spent' || record.status === 'Spent') continue
          // Shield Wallet uses camelCase 'recordCiphertext'
          const ciphertext = record.ciphertext || record.recordCiphertext || record.record_ciphertext || record.data
          if (!ciphertext || typeof ciphertext !== 'string') {
            devLog(`[Bet] Strategy 2b: record ${idx} — no ciphertext field found`)
            continue
          }
          decryptAttempts++
          try {
            devLog(`[Bet] Strategy 2b: decrypting record ${idx} (${ciphertext.slice(0, 40)}...)`)
            const decrypted = await decryptFn(ciphertext)
            const textStr = String(decrypted)
            devLog(`[Bet] Strategy 2b: decrypted record ${idx}:`, textStr.slice(0, 200))
            const mcMatch = textStr.match(/microcredits\s*:\s*(\d+)u64/)
            if (mcMatch) {
              const mc = parseInt(mcMatch[1], 10)
              devLog(`[Bet] Strategy 2b: record ${idx} has ${mc} microcredits (need ${minAmountMicro})`)
              if (mc >= minAmountMicro && textStr.includes('{') && textStr.includes('owner')) {
                devLog(`[Bet] Strategy 2b: FOUND suitable record with ${mc} microcredits`)
                return textStr
              }
            }
          } catch (decErr) {
            devLog(`[Bet] Strategy 2b: decrypt failed for record ${idx}:`, (decErr as any)?.message || decErr)
          }
        }
        devLog(`[Bet] Strategy 2b: tried ${decryptAttempts} decrypt(s), none suitable`)
      }
    } catch (err) {
      devLog('[Bet] Strategy 2 failed:', err)
    }
  } else {
    devLog('[Bet] No __aleoRequestRecords adapter found on window')
  }

  // Strategy 3: Adapter's requestRecordPlaintexts
  const adapterPlaintexts = (window as any).__aleoRequestRecordPlaintexts
  if (typeof adapterPlaintexts === 'function') {
    try {
      devLog('[Bet] Strategy 3: adapter requestRecordPlaintexts("credits.aleo")')
      const records = await adapterPlaintexts('credits.aleo')
      const recordsArr = Array.isArray(records) ? records : (records?.records || [])
      devLog(`[Bet] Strategy 3 → Got ${recordsArr.length} record(s)`)
      if (recordsArr.length > 0) {
        devLog('[Bet] Strategy 3 → First record sample:', JSON.stringify(recordsArr[0])?.slice(0, 300))
      }
      const found = findSuitableRecord(recordsArr, minAmountMicro)
      if (found) return found
    } catch (err) {
      devLog('[Bet] Strategy 3 failed:', err)
    }
  }

  // Strategy 4: Native wallet API (Leo Wallet or Shield direct)
  const leoWallet = (window as any).leoWallet || (window as any).leo
  if (leoWallet) {
    if (typeof leoWallet.requestRecordPlaintexts === 'function') {
      try {
        devLog('[Bet] Strategy 4a: leoWallet.requestRecordPlaintexts("credits.aleo")')
        const result = await leoWallet.requestRecordPlaintexts('credits.aleo')
        const records = result?.records || (Array.isArray(result) ? result : [])
        devLog(`[Bet] Strategy 4a → Got ${records.length} record(s)`)
        const found = findSuitableRecord(records, minAmountMicro)
        if (found) return found
      } catch (err) {
        devLog('[Bet] Strategy 4a failed:', err)
      }
    }

    if (typeof leoWallet.requestRecords === 'function') {
      try {
        devLog('[Bet] Strategy 4b: leoWallet.requestRecords("credits.aleo")')
        const result = await leoWallet.requestRecords('credits.aleo')
        const records = result?.records || (Array.isArray(result) ? result : [])
        devLog(`[Bet] Strategy 4b → Got ${records.length} record(s)`)
        const found = findSuitableRecord(records, minAmountMicro)
        if (found) return found
      } catch (err) {
        devLog('[Bet] Strategy 4b failed:', err)
      }
    }
  }

  devLog('[Bet] All strategies exhausted — no Credits record found for buy_shares_private')
  return null
}

/**
 * Parsed OutcomeShare record
 */
export interface ParsedOutcomeShare {
  plaintext: string
  outcome: number
  quantity: bigint
  marketId: string | null
  owner: string | null
}

/**
 * Parse an OutcomeShare record plaintext string into structured data.
 */
function parseOutcomeShare(text: string): ParsedOutcomeShare | null {
  const outcomeMatch = text.match(/outcome:\s*(\d+)u8/)
  const qtyMatch = text.match(/quantity:\s*(\d+)u128/)
  if (!outcomeMatch || !qtyMatch) return null
  const marketMatch = text.match(/market_id:\s*(\d+field)/)
  const ownerMatch = text.match(/owner:\s*(aleo1[a-z0-9]+)/)
  return {
    plaintext: text,
    outcome: parseInt(outcomeMatch[1]),
    quantity: BigInt(qtyMatch[1]),
    marketId: marketMatch ? marketMatch[1] : null,
    owner: ownerMatch ? ownerMatch[1] : null,
  }
}

/**
 * Extract OutcomeShare records from a list of raw wallet records.
 * Filters for records containing "outcome:" and "quantity:" (OutcomeShare fields).
 */
function extractShareRecords(records: any[]): ParsedOutcomeShare[] {
  const results: ParsedOutcomeShare[] = []
  for (const record of records) {
    if (!record) continue
    if (record.spent === true || record.is_spent === true) continue
    if (record.status === 'spent' || record.status === 'Spent') continue

    let plaintext: string | null = null

    if (typeof record === 'string') {
      if (record.includes('outcome:') && record.includes('quantity:')) plaintext = record
    } else if (typeof record === 'object') {
      // Try known plaintext fields
      for (const key of ['plaintext', 'data', 'content']) {
        if (record[key] != null) {
          const val = String(record[key])
          if (val.includes('outcome:') && val.includes('quantity:')) {
            plaintext = val
            break
          }
        }
      }
      // Scan all string fields
      if (!plaintext) {
        for (const key of Object.keys(record)) {
          const val = record[key]
          if (val == null) continue
          const valStr = String(val)
          if (valStr.includes('outcome:') && valStr.includes('quantity:') && valStr.includes('{') && !valStr.startsWith('{"')) {
            plaintext = valStr
            break
          }
        }
      }
    }

    if (plaintext) {
      const parsed = parseOutcomeShare(plaintext)
      if (parsed && parsed.quantity > 0n) results.push(parsed)
    }
  }
  return results
}

/**
 * Fetch OutcomeShare records from the wallet for a given program.
 * Returns parsed records. Optionally filters by marketId.
 */
export async function fetchOutcomeShareRecords(
  programId: string,
  marketId?: string,
): Promise<ParsedOutcomeShare[]> {
  devLog(`[Sell] === Fetching OutcomeShare records for ${programId} ===`)

  let allRecords: ParsedOutcomeShare[] = []

  // Strategy 1: Adapter requestRecords with plaintext=true
  const adapterRecords = (window as any).__aleoRequestRecords
  if (typeof adapterRecords === 'function') {
    try {
      devLog('[Sell] Strategy 1: adapter requestRecords(program, true)')
      const records = await adapterRecords(programId, true)
      const recordsArr = Array.isArray(records) ? records : (records?.records || [])
      devLog(`[Sell] Strategy 1 → Got ${recordsArr.length} record(s)`)
      allRecords = extractShareRecords(recordsArr)
      if (allRecords.length > 0) {
        devLog(`[Sell] Found ${allRecords.length} OutcomeShare record(s)`)
      }
    } catch (err) {
      devLog('[Sell] Strategy 1 failed:', err)
    }
  }

  // Strategy 2: Adapter requestRecordPlaintexts
  if (allRecords.length === 0) {
    const adapterPlaintexts = (window as any).__aleoRequestRecordPlaintexts
    if (typeof adapterPlaintexts === 'function') {
      try {
        devLog('[Sell] Strategy 2: adapter requestRecordPlaintexts(program)')
        const records = await adapterPlaintexts(programId)
        const recordsArr = Array.isArray(records) ? records : (records?.records || [])
        devLog(`[Sell] Strategy 2 → Got ${recordsArr.length} record(s)`)
        allRecords = extractShareRecords(recordsArr)
      } catch (err) {
        devLog('[Sell] Strategy 2 failed:', err)
      }
    }
  }

  // Strategy 3: Native wallet API
  if (allRecords.length === 0) {
    const wallet = (window as any).leoWallet || (window as any).leo
    if (wallet && typeof wallet.requestRecords === 'function') {
      try {
        devLog('[Sell] Strategy 3: native wallet requestRecords(program)')
        const result = await wallet.requestRecords(programId)
        const recordsArr = result?.records || (Array.isArray(result) ? result : [])
        devLog(`[Sell] Strategy 3 → Got ${recordsArr.length} record(s)`)
        allRecords = extractShareRecords(recordsArr)
      } catch (err) {
        devLog('[Sell] Strategy 3 failed:', err)
      }
    }
  }

  // Filter by market if specified
  if (marketId && allRecords.length > 0) {
    const filtered = allRecords.filter(r => !r.marketId || r.marketId === marketId)
    devLog(`[Sell] Filtered to ${filtered.length} record(s) for market ${marketId.slice(0, 20)}...`)
    return filtered
  }

  devLog(`[Sell] Returning ${allRecords.length} OutcomeShare record(s)`)
  return allRecords
}

// ============================================================================
// LP TOKEN RECORDS
// ============================================================================

/**
 * Parsed LPToken record
 */
export interface ParsedLPToken {
  plaintext: string
  marketId: string | null
  lpShares: bigint
  lpNonce: string | null
  tokenType: number
  owner: string | null
}

/**
 * Parse an LPToken record plaintext string into structured data.
 * Format: "{ owner: aleo1xxx.private, market_id: 123field.private, lp_shares: 5000000u128.private, lp_nonce: 456field.private, token_type: 1u8.private, _nonce: ...group.public }"
 */
function parseLPToken(text: string): ParsedLPToken | null {
  const sharesMatch = text.match(/lp_shares:\s*(\d+)u128/)
  if (!sharesMatch) return null
  const marketMatch = text.match(/market_id:\s*(\d+field)/)
  const nonceMatch = text.match(/lp_nonce:\s*(\d+field)/)
  const tokenMatch = text.match(/token_type:\s*(\d+)u8/)
  const ownerMatch = text.match(/owner:\s*(aleo1[a-z0-9]+)/)
  return {
    plaintext: text,
    marketId: marketMatch ? marketMatch[1] : null,
    lpShares: BigInt(sharesMatch[1]),
    lpNonce: nonceMatch ? nonceMatch[1] : null,
    tokenType: tokenMatch ? parseInt(tokenMatch[1]) : 1,
    owner: ownerMatch ? ownerMatch[1] : null,
  }
}

/**
 * Extract LPToken records from a list of raw wallet records.
 * Filters for records containing "lp_shares:" and "lp_nonce:" (LPToken fields).
 */
function extractLPTokenRecords(records: any[]): ParsedLPToken[] {
  const results: ParsedLPToken[] = []
  for (const record of records) {
    if (!record) continue
    if (record.spent === true || record.is_spent === true) continue
    if (record.status === 'spent' || record.status === 'Spent') continue

    let plaintext: string | null = null

    if (typeof record === 'string') {
      if (record.includes('lp_shares:') && record.includes('lp_nonce:')) plaintext = record
    } else if (typeof record === 'object') {
      // Try known plaintext fields
      for (const key of ['plaintext', 'data', 'content']) {
        if (record[key] != null) {
          const val = String(record[key])
          if (val.includes('lp_shares:') && val.includes('lp_nonce:')) {
            plaintext = val
            break
          }
        }
      }
      // Scan all string fields
      if (!plaintext) {
        for (const key of Object.keys(record)) {
          const val = record[key]
          if (val == null) continue
          const valStr = String(val)
          if (valStr.includes('lp_shares:') && valStr.includes('lp_nonce:') && valStr.includes('{') && !valStr.startsWith('{"')) {
            plaintext = valStr
            break
          }
        }
      }
    }

    if (plaintext) {
      const parsed = parseLPToken(plaintext)
      if (parsed && parsed.lpShares > 0n) results.push(parsed)
    }
  }
  return results
}

/**
 * Fetch LPToken records from the wallet for a given program.
 * Returns parsed records. Optionally filters by marketId.
 */
export async function fetchLPTokenRecords(
  programId: string,
  marketId?: string,
): Promise<ParsedLPToken[]> {
  devLog(`[LP] === Fetching LPToken records for ${programId} ===`)

  let allRecords: ParsedLPToken[] = []

  // Strategy 1: Adapter requestRecords with plaintext=true
  const adapterRecords = (window as any).__aleoRequestRecords
  if (typeof adapterRecords === 'function') {
    try {
      devLog('[LP] Strategy 1: adapter requestRecords(program, true)')
      const records = await adapterRecords(programId, true)
      const recordsArr = Array.isArray(records) ? records : (records?.records || [])
      devLog(`[LP] Strategy 1 → Got ${recordsArr.length} record(s)`)
      allRecords = extractLPTokenRecords(recordsArr)
      if (allRecords.length > 0) {
        devLog(`[LP] Found ${allRecords.length} LPToken record(s)`)
      }
    } catch (err) {
      devLog('[LP] Strategy 1 failed:', err)
    }
  }

  // Strategy 2: Adapter requestRecordPlaintexts
  if (allRecords.length === 0) {
    const adapterPlaintexts = (window as any).__aleoRequestRecordPlaintexts
    if (typeof adapterPlaintexts === 'function') {
      try {
        devLog('[LP] Strategy 2: adapter requestRecordPlaintexts(program)')
        const records = await adapterPlaintexts(programId)
        const recordsArr = Array.isArray(records) ? records : (records?.records || [])
        devLog(`[LP] Strategy 2 → Got ${recordsArr.length} record(s)`)
        allRecords = extractLPTokenRecords(recordsArr)
      } catch (err) {
        devLog('[LP] Strategy 2 failed:', err)
      }
    }
  }

  // Strategy 3: Adapter requestRecords with plaintext=false + decrypt
  if (allRecords.length === 0) {
    if (typeof adapterRecords === 'function') {
      try {
        devLog('[LP] Strategy 3: adapter requestRecords(program, false) + decrypt')
        const records = await adapterRecords(programId, false)
        const recordsArr = Array.isArray(records) ? records : (records?.records || [])
        devLog(`[LP] Strategy 3 → Got ${recordsArr.length} record(s)`)

        // Try parsing as-is first
        allRecords = extractLPTokenRecords(recordsArr)

        // Try decrypting if no results
        if (allRecords.length === 0) {
          const decryptFn = (window as any).__aleoDecrypt
          if (typeof decryptFn === 'function') {
            for (let idx = 0; idx < recordsArr.length; idx++) {
              const record = recordsArr[idx]
              if (!record) continue
              if (record.spent === true || record.is_spent === true) continue
              if (record.status === 'spent' || record.status === 'Spent') continue
              const ciphertext = record.ciphertext || record.recordCiphertext || record.record_ciphertext || record.data
              if (!ciphertext || typeof ciphertext !== 'string') continue
              try {
                const decrypted = await decryptFn(ciphertext)
                const textStr = String(decrypted)
                if (textStr.includes('lp_shares:') && textStr.includes('lp_nonce:')) {
                  const parsed = parseLPToken(textStr)
                  if (parsed && parsed.lpShares > 0n) {
                    allRecords.push(parsed)
                    devLog(`[LP] Strategy 3: decrypted LPToken record ${idx}`)
                  }
                }
              } catch {
                // Skip records that fail to decrypt
              }
            }
          }
        }
      } catch (err) {
        devLog('[LP] Strategy 3 failed:', err)
      }
    }
  }

  // Filter by market if specified
  if (marketId && allRecords.length > 0) {
    const filtered = allRecords.filter(r => !r.marketId || r.marketId === marketId)
    devLog(`[LP] Filtered to ${filtered.length} record(s) for market ${marketId.slice(0, 20)}...`)
    return filtered
  }

  devLog(`[LP] Returning ${allRecords.length} LPToken record(s)`)
  return allRecords
}
