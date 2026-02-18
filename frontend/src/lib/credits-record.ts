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
          console.log(`[Bet] Record ${i}: found plaintext via record.plaintext (type=${typeof record.plaintext}, len=${pt.length})`)
        }
      }
      // Try record.data
      if (!plaintext && record.data != null) {
        const dt = String(record.data)
        if (dt.includes('microcredits') && dt.includes('owner')) {
          plaintext = dt
          console.log(`[Bet] Record ${i}: found plaintext via record.data`)
        }
      }
      // Try record.content
      if (!plaintext && record.content != null) {
        const ct = String(record.content)
        if (ct.includes('microcredits') && ct.includes('owner')) {
          plaintext = ct
          console.log(`[Bet] Record ${i}: found plaintext via record.content`)
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
            console.log(`[Bet] Record ${i}: found Leo plaintext in field '${key}'`)
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
        console.log(`[Bet] Record ${i}: no plaintext found. keys=[${fieldInfo}]`)
        if (record.plaintext !== undefined) {
          console.log(`[Bet] Record ${i}: plaintext field (type=${typeof record.plaintext}):`, String(record.plaintext).slice(0, 500))
        }
      }
      continue
    }

    // Parse microcredits value
    const mcMatch = plaintext.match(/microcredits\s*:\s*(\d+)u64/)
    if (!mcMatch) {
      console.log(`[Bet] Record ${i}: has text with 'microcredits' but regex didn't match. Sample:`, plaintext.slice(0, 200))
      continue
    }

    const mc = parseInt(mcMatch[1], 10)
    console.log(`[Bet] Record ${i}: ${mc} microcredits (need ${minAmountMicro})`)

    if (mc >= minAmountMicro) {
      // Validate it's a proper Leo record plaintext, not JSON metadata
      if (isLeoRecordPlaintext(plaintext)) {
        console.log(`[Bet] Found suitable Credits record: ${mc} microcredits`)
        console.log(`[Bet] Record plaintext (first 300 chars):`, plaintext.slice(0, 300))
        return plaintext
      } else {
        console.log(`[Bet] Record ${i}: has ${mc} mc but NOT Leo format. Starts with:`, plaintext.slice(0, 80))
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
  console.log('[Bet] === Fetching Credits record for private betting ===')
  console.log(`[Bet] Need record with >= ${minAmountMicro} microcredits (${minAmountMicro / 1_000_000} ALEO)`)

  // Strategy 1: Adapter requestRecords with plaintext=true
  // This is the SAME approach that works in store.ts balance detection (line 314)
  const adapterRecords = (window as any).__aleoRequestRecords
  if (typeof adapterRecords === 'function') {
    try {
      console.log('[Bet] Strategy 1: adapter requestRecords("credits.aleo", true) — plaintext mode')
      const records = await adapterRecords('credits.aleo', true)
      const recordsArr = Array.isArray(records) ? records : (records?.records || [])
      console.log(`[Bet] Strategy 1 → Got ${recordsArr.length} record(s)`)
      if (recordsArr.length > 0) {
        console.log('[Bet] Strategy 1 → First record sample:', JSON.stringify(recordsArr[0])?.slice(0, 500))
        // Show last record too (record 6 is the one with 5 ALEO in balance detection)
        const last = recordsArr[recordsArr.length - 1]
        console.log(`[Bet] Strategy 1 → Last record (#${recordsArr.length - 1}) sample:`, JSON.stringify(last)?.slice(0, 500))
      }
      const found = findSuitableRecord(recordsArr, minAmountMicro)
      if (found) return found
    } catch (err) {
      console.log('[Bet] Strategy 1 failed:', err)
    }

    // Strategy 2: Adapter requestRecords without plaintext flag + decrypt
    try {
      console.log('[Bet] Strategy 2: adapter requestRecords("credits.aleo", false) + decrypt')
      const records = await adapterRecords('credits.aleo', false)
      const recordsArr = Array.isArray(records) ? records : (records?.records || [])
      console.log(`[Bet] Strategy 2 → Got ${recordsArr.length} record(s)`)

      // First try parsing as-is (some wallets include plaintext even without flag)
      const found = findSuitableRecord(recordsArr, minAmountMicro)
      if (found) return found

      // Try decrypting ciphertext records
      const decryptFn = (window as any).__aleoDecrypt
      if (typeof decryptFn === 'function' && recordsArr.length > 0) {
        console.log('[Bet] Strategy 2b: decrypting ciphertext records...')
        let decryptAttempts = 0
        for (let idx = 0; idx < recordsArr.length; idx++) {
          const record = recordsArr[idx]
          if (!record) continue
          if (record.spent === true || record.is_spent === true) continue
          if (record.status === 'spent' || record.status === 'Spent') continue
          // Shield Wallet uses camelCase 'recordCiphertext'
          const ciphertext = record.ciphertext || record.recordCiphertext || record.record_ciphertext || record.data
          if (!ciphertext || typeof ciphertext !== 'string') {
            console.log(`[Bet] Strategy 2b: record ${idx} — no ciphertext field found`)
            continue
          }
          decryptAttempts++
          try {
            console.log(`[Bet] Strategy 2b: decrypting record ${idx} (${ciphertext.slice(0, 40)}...)`)
            const decrypted = await decryptFn(ciphertext)
            const textStr = String(decrypted)
            console.log(`[Bet] Strategy 2b: decrypted record ${idx}:`, textStr.slice(0, 200))
            const mcMatch = textStr.match(/microcredits\s*:\s*(\d+)u64/)
            if (mcMatch) {
              const mc = parseInt(mcMatch[1], 10)
              console.log(`[Bet] Strategy 2b: record ${idx} has ${mc} microcredits (need ${minAmountMicro})`)
              if (mc >= minAmountMicro && textStr.includes('{') && textStr.includes('owner')) {
                console.log(`[Bet] Strategy 2b: FOUND suitable record with ${mc} microcredits`)
                return textStr
              }
            }
          } catch (decErr) {
            console.log(`[Bet] Strategy 2b: decrypt failed for record ${idx}:`, (decErr as any)?.message || decErr)
          }
        }
        console.log(`[Bet] Strategy 2b: tried ${decryptAttempts} decrypt(s), none suitable`)
      }
    } catch (err) {
      console.log('[Bet] Strategy 2 failed:', err)
    }
  } else {
    console.log('[Bet] No __aleoRequestRecords adapter found on window')
  }

  // Strategy 3: Adapter's requestRecordPlaintexts
  const adapterPlaintexts = (window as any).__aleoRequestRecordPlaintexts
  if (typeof adapterPlaintexts === 'function') {
    try {
      console.log('[Bet] Strategy 3: adapter requestRecordPlaintexts("credits.aleo")')
      const records = await adapterPlaintexts('credits.aleo')
      const recordsArr = Array.isArray(records) ? records : (records?.records || [])
      console.log(`[Bet] Strategy 3 → Got ${recordsArr.length} record(s)`)
      if (recordsArr.length > 0) {
        console.log('[Bet] Strategy 3 → First record sample:', JSON.stringify(recordsArr[0])?.slice(0, 300))
      }
      const found = findSuitableRecord(recordsArr, minAmountMicro)
      if (found) return found
    } catch (err) {
      console.log('[Bet] Strategy 3 failed:', err)
    }
  }

  // Strategy 4: Native wallet API (Leo Wallet or Shield direct)
  const leoWallet = (window as any).leoWallet || (window as any).leo
  if (leoWallet) {
    if (typeof leoWallet.requestRecordPlaintexts === 'function') {
      try {
        console.log('[Bet] Strategy 4a: leoWallet.requestRecordPlaintexts("credits.aleo")')
        const result = await leoWallet.requestRecordPlaintexts('credits.aleo')
        const records = result?.records || (Array.isArray(result) ? result : [])
        console.log(`[Bet] Strategy 4a → Got ${records.length} record(s)`)
        const found = findSuitableRecord(records, minAmountMicro)
        if (found) return found
      } catch (err) {
        console.log('[Bet] Strategy 4a failed:', err)
      }
    }

    if (typeof leoWallet.requestRecords === 'function') {
      try {
        console.log('[Bet] Strategy 4b: leoWallet.requestRecords("credits.aleo")')
        const result = await leoWallet.requestRecords('credits.aleo')
        const records = result?.records || (Array.isArray(result) ? result : [])
        console.log(`[Bet] Strategy 4b → Got ${records.length} record(s)`)
        const found = findSuitableRecord(records, minAmountMicro)
        if (found) return found
      } catch (err) {
        console.log('[Bet] Strategy 4b failed:', err)
      }
    }
  }

  console.log('[Bet] All strategies exhausted — no Credits record found for buy_shares_private')
  return null
}
