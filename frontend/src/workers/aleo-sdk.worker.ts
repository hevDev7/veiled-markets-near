import { devWarn } from '../lib/logger'
// ============================================================================
// Aleo SDK Web Worker
// ============================================================================
// Runs @provablehq/sdk ProgramManager inside a Web Worker where
// Atomics.wait is allowed. The main thread communicates via postMessage.
//
// IMPORTANT: All SDK imports are DYNAMIC (inside the handler) so that:
// 1. The worker's onmessage is registered immediately
// 2. Any WASM load errors are caught and reported to the main thread
//
// NOTE: The SDK's internal network calls can fail in Worker contexts.
// All network calls use fetchWithRetry() for robustness.
// ============================================================================

export interface WorkerRequest {
  type: 'execute' | 'commit_bet' | 'reveal_bet'
  id: string
  programName: string
  functionName: string
  inputs: string[]
  privateKey: string
  priorityFee: number // in microcredits
  rpcUrl: string
  usePrivateCredits?: boolean // If true, scan for Credits record and use buy_shares_private (privacy-preserving)
  creditsRecordPlaintext?: string // Pre-fetched Credits record from wallet (skips block scanning)
  // commit_bet specific
  marketId?: string
  amount?: number        // microcredits
  outcome?: number       // 1=yes, 2=no
  userNonce?: string     // field value
  // reveal_bet specific
  commitmentHash?: string
  betAmountRecordPlaintext?: string
}

export interface CommitmentData {
  commitmentHash: string
  userNonce: string
  marketId: string
  bettor: string
  betAmountRecordPlaintext: string
}

export interface WorkerResponse {
  type: 'progress' | 'result' | 'error'
  id: string
  phase?: string
  message?: string
  txId?: string
  usedPrivateCredits?: boolean // Indicates if privacy mode was used
  commitmentData?: CommitmentData // commit_bet result
}

function send(msg: WorkerResponse) {
  self.postMessage(msg)
}

/**
 * Fetch with automatic retry and exponential backoff.
 * All network calls in the worker go through this to handle transient failures.
 */
async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  maxAttempts = 5,
): Promise<Response> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(url, options)
      if (!response.ok && attempt < maxAttempts && response.status >= 500) {
        throw new Error(`HTTP ${response.status}`)
      }
      return response
    } catch (err: any) {
      devWarn(`[Worker] Fetch attempt ${attempt}/${maxAttempts} failed for ${url.slice(0, 80)}:`, err?.message || err)
      if (attempt === maxAttempts) throw err
      // Longer delays for network instability (ERR_NETWORK_CHANGED etc.)
      const delay = Math.min(2000 * Math.pow(2, attempt - 1), 15000)
      devWarn(`[Worker] Retrying in ${delay}ms...`)
      await new Promise(r => setTimeout(r, delay))
    }
  }
  throw new Error('unreachable')
}

/**
 * Download binary data with retry (retries entire fetch+read cycle).
 * Critical for large files like proving keys (~29MB) where the connection
 * can drop mid-download.
 */
async function downloadBytes(
  url: string,
  id: string,
  label: string,
  maxAttempts = 5,
): Promise<Uint8Array> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      devWarn(`[Worker] Download ${label} attempt ${attempt}/${maxAttempts}: ${url.slice(0, 80)}`)
      const response = await fetch(url)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const buffer = await response.arrayBuffer()
      devWarn(`[Worker] Downloaded ${label}: ${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB`)
      return new Uint8Array(buffer)
    } catch (err: any) {
      devWarn(`[Worker] Download ${label} attempt ${attempt}/${maxAttempts} failed:`, err?.message || err)
      if (attempt === maxAttempts) {
        throw new Error(`Failed to download ${label} after ${maxAttempts} attempts: ${err?.message}`)
      }
      send({ type: 'progress', id, phase: 'initializing', message: `${label} download failed, retrying (${attempt}/${maxAttempts})...` })
      await new Promise(r => setTimeout(r, 2000 * attempt))
    }
  }
  throw new Error('unreachable')
}

let sdkCache: typeof import('@provablehq/sdk') | null = null
let threadPoolReady = false

async function loadSDK(id: string) {
  if (sdkCache) return sdkCache

  send({ type: 'progress', id, phase: 'initializing', message: 'Loading Aleo SDK in worker...' })
  devWarn('[Worker] Importing @provablehq/sdk...')

  const sdk = await import('@provablehq/sdk')
  sdkCache = sdk
  devWarn('[Worker] SDK loaded successfully')

  if (!threadPoolReady) {
    send({ type: 'progress', id, phase: 'initializing', message: 'Initializing WASM thread pool...' })
    try {
      await sdk.initThreadPool()
      threadPoolReady = true
      devWarn('[Worker] Thread pool initialized (multi-threaded)')
    } catch (e) {
      devWarn('[Worker] initThreadPool failed, continuing single-threaded:', e)
    }
  }

  return sdk
}

/**
 * Pre-fetch program source and its imports using plain fetch (no custom headers).
 */
async function fetchProgramSources(
  rpcUrl: string,
  programName: string,
  id: string,
): Promise<{ programSource: string; imports: Record<string, string> }> {
  const apiBase = `${rpcUrl}/testnet`

  send({ type: 'progress', id, phase: 'initializing', message: `Fetching ${programName}...` })
  devWarn('[Worker] Fetching program:', `${apiBase}/program/${programName}`)
  const progResp = await fetchWithRetry(`${apiBase}/program/${programName}`)
  if (!progResp.ok) {
    throw new Error(`Failed to fetch ${programName}: HTTP ${progResp.status}`)
  }
  const programSource = (await progResp.text()).replace(/^"|"$/g, '').replace(/\\n/g, '\n')
  devWarn('[Worker] Program fetched, length:', programSource.length)

  const importRegex = /import\s+(\S+\.aleo)\s*;/g
  const imports: Record<string, string> = {}
  let match: RegExpExecArray | null
  while ((match = importRegex.exec(programSource)) !== null) {
    const importName = match[1]
    if (importName === programName) continue

    devWarn('[Worker] Fetching import:', importName)
    send({ type: 'progress', id, phase: 'initializing', message: `Fetching import ${importName}...` })
    const importResp = await fetchWithRetry(`${apiBase}/program/${importName}`)
    if (!importResp.ok) {
      throw new Error(`Failed to fetch import ${importName}: HTTP ${importResp.status}`)
    }
    const importSource = (await importResp.text()).replace(/^"|"$/g, '').replace(/\\n/g, '\n')
    imports[importName] = importSource
    devWarn('[Worker] Import fetched:', importName, 'length:', importSource.length)
  }

  return { programSource, imports }
}

/**
 * Scan for an unspent Credits record with enough balance.
 * Uses the SDK's AleoNetworkClient with patched fetchRaw to avoid CORS issues.
 * Scans the last ~1000 blocks for records belonging to the account.
 */
async function findCreditsRecord(
  sdk: typeof import('@provablehq/sdk'),
  account: InstanceType<typeof import('@provablehq/sdk').Account>,
  rpcUrl: string,
  minAmount: number,
  id: string,
): Promise<string | null> {
  try {
    send({ type: 'progress', id, phase: 'initializing', message: 'Scanning for private Credits records...' })

    const networkClient = new sdk.AleoNetworkClient(rpcUrl)
    networkClient.setAccount(account)

    // Patch fetchRaw to use plain fetch (SDK's get() has custom headers that cause CORS in Workers)
    const apiBase = `${rpcUrl}/testnet`
    ;(networkClient as any).fetchRaw = async (url: string) => {
      const response = await fetchWithRetry(`${apiBase}${url}`)
      return await response.text()
    }

    // Get latest block height
    const latestHeight: number = await networkClient.getLatestHeight()
    const startHeight = Math.max(0, latestHeight - 1000) // scan last ~1000 blocks
    devWarn(`[Worker] Scanning blocks ${startHeight} to ${latestHeight} for Credits records...`)

    const recordProvider = new sdk.NetworkRecordProvider(account, networkClient)
    const records = await recordProvider.findCreditsRecords([minAmount], {
      startHeight,
      unspent: true,
      nonces: [],
    })

    if (records && records.length > 0) {
      const record = records[0] as any
      const plaintext: string = record.recordPlaintext || record.record_plaintext
      devWarn('[Worker] Found Credits record:', plaintext.slice(0, 100))
      return plaintext
    }

    devWarn('[Worker] No Credits records found with sufficient balance')
    return null
  } catch (err: any) {
    devWarn('[Worker] Record scan failed:', err?.message || err)
    return null
  }
}

async function handleExecute(req: WorkerRequest) {
  const { id, programName, inputs, privateKey, priorityFee, rpcUrl, usePrivateCredits, creditsRecordPlaintext } = req
  let { functionName } = req

  try {
    const sdk = await loadSDK(id)

    send({ type: 'progress', id, phase: 'initializing', message: 'Setting up account...' })
    let account: InstanceType<typeof sdk.Account>
    try {
      account = new sdk.Account({ privateKey })
    } catch {
      throw new Error('Invalid private key. Please check and try again.')
    }

    const address = account.address().to_string()
    devWarn('[Worker] Account address:', address)

    // If privacy mode requested, try to find a Credits record for buy_shares_private
    let finalInputs = [...inputs]
    let usedPrivateCredits = false

    if (usePrivateCredits && (functionName === 'buy_shares_public' || functionName === 'place_bet_public')) {
      // Extract amount from inputs (3rd input for v12: market_id, outcome, amount_in, ...)
      const amountStr = functionName === 'buy_shares_public' ? inputs[2] : inputs[1]
      const amountMicro = parseInt(amountStr.replace(/u\d+$/, ''), 10)

      let recordPlaintext: string | null = null

      // Strategy 1: Use pre-fetched record from wallet adapter (instant, no scanning needed)
      if (creditsRecordPlaintext) {
        devWarn('[Worker] Privacy mode: using pre-fetched Credits record from wallet')
        send({ type: 'progress', id, phase: 'initializing', message: 'Using Credits record from wallet...' })
        recordPlaintext = creditsRecordPlaintext
      }

      // Strategy 2: Scan blocks using SDK (slower, works with any private key)
      if (!recordPlaintext) {
        recordPlaintext = await findCreditsRecord(sdk, account, rpcUrl, amountMicro, id)
      }

      if (recordPlaintext) {
        // Switch to privacy-preserving buy_shares_private
        // buy_shares_private inputs: market_id, outcome, amount_in, min_shares_out, share_nonce, credits_in
        functionName = 'buy_shares_private'
        finalInputs = [...inputs, recordPlaintext]
        usedPrivateCredits = true
        devWarn('[Worker] Privacy mode: using buy_shares_private with Credits record')
        send({ type: 'progress', id, phase: 'initializing', message: 'Using privacy-preserving mode (private Credits)' })
      } else {
        devWarn('[Worker] Privacy mode: no Credits record found, falling back to buy_shares_public')
        send({ type: 'progress', id, phase: 'initializing', message: 'No private Credits found, using standard mode' })
      }
    }

    // Pre-fetch program sources using plain fetch (bypasses SDK network issues)
    const { programSource, imports } = await fetchProgramSources(rpcUrl, programName, id)

    const keyProvider = new sdk.AleoKeyProvider()
    keyProvider.useCache(true)

    // Override fetchBytes to use our retry-capable fetch for any remaining key downloads.
    // The SDK's default get() adds custom headers that cause CORS failures in Workers.
    ;(keyProvider as any).fetchBytes = async (url: string) => {
      devWarn('[Worker] fetchBytes override called for:', url.slice(0, 80))
      return await downloadBytes(url, id, 'key', 5)
    }

    // Pre-download and cache fee proving keys BEFORE buildExecutionTransaction.
    // The SDK's fetchCreditsKeys → fetchProvingKey → fetchBytes chain fails
    // in Worker contexts. By pre-populating the cache, fetchCreditsKeys()
    // finds a cache hit and skips the problematic download entirely.
    send({ type: 'progress', id, phase: 'initializing', message: 'Downloading fee proving key (~29MB)...' })
    const feeKeyMeta = sdk.CREDITS_PROGRAM_KEYS.fee_public
    devWarn('[Worker] Pre-downloading fee key:', feeKeyMeta.prover)
    devWarn('[Worker] Fee key locator:', feeKeyMeta.locator)

    const feeKeyBytes = await downloadBytes(feeKeyMeta.prover, id, 'fee proving key')
    const feeProvingKey = sdk.ProvingKey.fromBytes(feeKeyBytes)
    const feeVerifyingKey = feeKeyMeta.verifyingKey()
    ;(keyProvider as any).cache.set(
      feeKeyMeta.locator,
      [feeProvingKey.toBytes(), feeVerifyingKey.toBytes()]
    )
    devWarn('[Worker] Fee keys pre-cached at locator:', feeKeyMeta.locator)

    const programManager = new sdk.ProgramManager(rpcUrl, keyProvider, undefined)
    programManager.setAccount(account)

    devWarn('[Worker] Starting execution:', { programName, functionName, inputs: finalInputs, priorityFee })

    const priorityFeeCredits = priorityFee / 1_000_000

    // Retry buildExecutionTransaction up to 3 times.
    // The WASM module downloads SRS (powers of tau, ~130MB) via XMLHttpRequest internally.
    // We can't intercept that, but we can retry the entire build if it fails.
    let tx: any
    const maxBuildAttempts = 3
    for (let buildAttempt = 1; buildAttempt <= maxBuildAttempts; buildAttempt++) {
      try {
        send({ type: 'progress', id, phase: 'proving',
          message: buildAttempt === 1
            ? 'Building ZK proof (this takes 1-3 minutes)...'
            : `Retrying ZK proof build (attempt ${buildAttempt}/${maxBuildAttempts})...`
        })

        tx = await programManager.buildExecutionTransaction({
          programName,
          functionName,
          inputs: finalInputs,
          program: programSource,
          imports,
          priorityFee: priorityFeeCredits,
          privateFee: false,
          keySearchParams: {
            cacheKey: `${programName}:${functionName}`,
          },
        })
        break // success
      } catch (buildErr: any) {
        const buildMsg = buildErr?.message || String(buildErr)
        devWarn(`[Worker] Build attempt ${buildAttempt}/${maxBuildAttempts} failed:`, buildMsg)

        // Retry on SRS/powers download failures or transient network errors
        const isRetryable = buildMsg.includes('powers') ||
          buildMsg.includes('XMLHttpRequest') ||
          buildMsg.includes('Failed to fetch') ||
          buildMsg.includes('NetworkError') ||
          buildMsg.includes('Download failed')

        if (isRetryable && buildAttempt < maxBuildAttempts) {
          const delay = 5000 * buildAttempt
          send({ type: 'progress', id, phase: 'proving',
            message: `Download failed, retrying in ${delay / 1000}s (attempt ${buildAttempt}/${maxBuildAttempts})...`
          })
          await new Promise(r => setTimeout(r, delay))
          continue
        }
        throw buildErr
      }
    }

    devWarn('[Worker] Transaction built successfully')

    // Broadcast via plain fetch
    send({ type: 'progress', id, phase: 'broadcasting', message: 'Broadcasting transaction to network...' })
    const txString = tx.toString()
    devWarn('[Worker] Broadcasting transaction, size:', txString.length)

    const broadcastResp = await fetchWithRetry(`${rpcUrl}/testnet/transaction/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: txString,
    })

    if (!broadcastResp.ok) {
      const errText = await broadcastResp.text()
      throw new Error(`Broadcast failed (${broadcastResp.status}): ${errText}`)
    }

    const txId = (await broadcastResp.text()).replace(/"/g, '')
    devWarn('[Worker] Transaction submitted:', txId)

    send({ type: 'result', id, txId, usedPrivateCredits })
  } catch (err: any) {
    const msg = err?.message || String(err)
    console.error('[Worker] Error:', msg)
    send({ type: 'error', id, message: msg })
  }
}

// ============================================================================
// Commit-Reveal: commit_bet handler
// ============================================================================
async function handleCommitBet(req: WorkerRequest) {
  const { id, programName, privateKey, priorityFee, rpcUrl, marketId, amount, outcome, userNonce, creditsRecordPlaintext } = req

  try {
    if (!marketId || !amount || !outcome || !userNonce) {
      throw new Error('Missing required commit_bet parameters')
    }

    const sdk = await loadSDK(id)

    send({ type: 'progress', id, phase: 'initializing', message: 'Setting up account...' })
    let account: InstanceType<typeof sdk.Account>
    try {
      account = new sdk.Account({ privateKey })
    } catch {
      throw new Error('Invalid private key. Please check and try again.')
    }

    const address = account.address().to_string()
    devWarn('[Worker] commit_bet account:', address)

    // Find or use provided credits record
    let recordPlaintext = creditsRecordPlaintext || null
    if (!recordPlaintext) {
      recordPlaintext = await findCreditsRecord(sdk, account, rpcUrl, amount, id)
    }
    if (!recordPlaintext) {
      throw new Error(
        'No private Credits record found with sufficient balance. ' +
        'Commit-reveal requires private (shielded) ALEO credits. ' +
        'Shield credits first using Leo Wallet → Send → Private transfer to your own address.'
      )
    }

    // Build inputs: market_id (public), amount (private), outcome (private), user_nonce (private), credits_in (private)
    const outcomeStr = outcome === 1 ? '1u8' : '2u8'
    const finalInputs = [
      marketId,
      `${amount}u64`,
      outcomeStr,
      userNonce,
      recordPlaintext,
    ]

    // Pre-fetch program sources
    const { programSource, imports } = await fetchProgramSources(rpcUrl, programName, id)

    const keyProvider = new sdk.AleoKeyProvider()
    keyProvider.useCache(true)
    ;(keyProvider as any).fetchBytes = async (url: string) => {
      return await downloadBytes(url, id, 'key', 5)
    }

    // Pre-download fee keys
    send({ type: 'progress', id, phase: 'initializing', message: 'Downloading fee proving key (~29MB)...' })
    const feeKeyMeta = sdk.CREDITS_PROGRAM_KEYS.fee_public
    const feeKeyBytes = await downloadBytes(feeKeyMeta.prover, id, 'fee proving key')
    const feeProvingKey = sdk.ProvingKey.fromBytes(feeKeyBytes)
    const feeVerifyingKey = feeKeyMeta.verifyingKey()
    ;(keyProvider as any).cache.set(
      feeKeyMeta.locator,
      [feeProvingKey.toBytes(), feeVerifyingKey.toBytes()]
    )

    const programManager = new sdk.ProgramManager(rpcUrl, keyProvider, undefined)
    programManager.setAccount(account)

    const priorityFeeCredits = priorityFee / 1_000_000

    // Build execution transaction
    let tx: any
    const maxBuildAttempts = 3
    for (let buildAttempt = 1; buildAttempt <= maxBuildAttempts; buildAttempt++) {
      try {
        send({ type: 'progress', id, phase: 'proving',
          message: buildAttempt === 1
            ? 'Building commit_bet ZK proof (this takes 1-3 minutes)...'
            : `Retrying ZK proof build (attempt ${buildAttempt}/${maxBuildAttempts})...`
        })

        tx = await programManager.buildExecutionTransaction({
          programName,
          functionName: 'commit_bet',
          inputs: finalInputs,
          program: programSource,
          imports,
          priorityFee: priorityFeeCredits,
          privateFee: false,
          keySearchParams: {
            cacheKey: `${programName}:commit_bet`,
          },
        })
        break
      } catch (buildErr: any) {
        const buildMsg = buildErr?.message || String(buildErr)
        devWarn(`[Worker] commit_bet build attempt ${buildAttempt}/${maxBuildAttempts} failed:`, buildMsg)
        const isRetryable = buildMsg.includes('powers') || buildMsg.includes('XMLHttpRequest') ||
          buildMsg.includes('Failed to fetch') || buildMsg.includes('NetworkError') || buildMsg.includes('Download failed')
        if (isRetryable && buildAttempt < maxBuildAttempts) {
          const delay = 5000 * buildAttempt
          send({ type: 'progress', id, phase: 'proving', message: `Download failed, retrying in ${delay / 1000}s...` })
          await new Promise(r => setTimeout(r, delay))
          continue
        }
        throw buildErr
      }
    }

    devWarn('[Worker] commit_bet transaction built successfully')

    // Extract bet_amount_record from transaction outputs
    send({ type: 'progress', id, phase: 'proving', message: 'Extracting commitment data from transaction...' })

    let betAmountRecordPlaintext = ''
    let commitmentHash = ''

    try {
      const txJson = JSON.parse(tx.toString())
      const transitions = txJson?.execution?.transitions || []

      // Find the commit_bet transition
      for (const transition of transitions) {
        if (transition.function === 'commit_bet' && transition.program === programName) {
          const outputs = transition.outputs || []

          // output[0] = Commitment struct (public/plaintext on transition level)
          // output[1] = bet_amount_record (record ciphertext)
          // There may also be credits.aleo/split outputs

          for (const output of outputs) {
            // Extract commitment hash from the Commitment struct output
            if (output.type === 'public' || output.type === 'future') {
              // The commitment hash might be in a public output
              const val = output.value || ''
              if (typeof val === 'string' && val.includes('field')) {
                const hashMatch = val.match(/(\d+field)/)
                if (hashMatch && !commitmentHash) {
                  commitmentHash = hashMatch[1]
                }
              }
            }

            // Extract record ciphertext and try to decrypt
            if (output.type === 'record' && !betAmountRecordPlaintext) {
              const ciphertext = output.value || ''
              if (ciphertext && typeof ciphertext === 'string') {
                try {
                  const recordCiphertext = sdk.RecordCiphertext.fromString(ciphertext)
                  const viewKey = account.viewKey()
                  const decrypted = recordCiphertext.decrypt(viewKey)
                  const decryptedStr = decrypted.toString()
                  devWarn('[Worker] Decrypted record:', decryptedStr.slice(0, 100))

                  // Check if this is a credits record (has microcredits field)
                  if (decryptedStr.includes('microcredits')) {
                    // Check if this matches bet amount (bet_amount_record) vs change
                    const mcMatch = decryptedStr.match(/microcredits\s*:\s*(\d+)u64/)
                    if (mcMatch) {
                      const mc = parseInt(mcMatch[1], 10)
                      if (mc === amount) {
                        betAmountRecordPlaintext = decryptedStr
                        devWarn('[Worker] Found bet_amount_record:', mc, 'microcredits')
                      }
                    }
                  }
                } catch (decryptErr) {
                  devWarn('[Worker] Could not decrypt record:', decryptErr)
                }
              }
            }
          }
        }

        // Also check split outputs for the bet_amount_record
        if (transition.function === 'split' && transition.program === 'credits.aleo' && !betAmountRecordPlaintext) {
          const outputs = transition.outputs || []
          for (const output of outputs) {
            if (output.type === 'record') {
              const ciphertext = output.value || ''
              if (ciphertext && typeof ciphertext === 'string') {
                try {
                  const recordCiphertext = sdk.RecordCiphertext.fromString(ciphertext)
                  const viewKey = account.viewKey()
                  const decrypted = recordCiphertext.decrypt(viewKey)
                  const decryptedStr = decrypted.toString()
                  const mcMatch = decryptedStr.match(/microcredits\s*:\s*(\d+)u64/)
                  if (mcMatch) {
                    const mc = parseInt(mcMatch[1], 10)
                    if (mc === amount) {
                      betAmountRecordPlaintext = decryptedStr
                      devWarn('[Worker] Found bet_amount_record from split:', mc, 'microcredits')
                    }
                  }
                } catch { /* skip */ }
              }
            }
          }
        }
      }

      // Also try to extract commitment hash from finalize arguments
      if (!commitmentHash) {
        for (const transition of transitions) {
          if (transition.function === 'commit_bet' && transition.program === programName) {
            // The finalize inputs contain the commitment_hash as first argument
            const finalizeInputs = transition.finalize || []
            if (finalizeInputs.length > 0) {
              const hashVal = typeof finalizeInputs[0] === 'string' ? finalizeInputs[0] : finalizeInputs[0]?.value
              if (hashVal && typeof hashVal === 'string' && hashVal.includes('field')) {
                commitmentHash = hashVal.trim()
                devWarn('[Worker] Found commitment hash from finalize:', commitmentHash)
              }
            }
          }
        }
      }
    } catch (parseErr) {
      devWarn('[Worker] Failed to parse transaction outputs:', parseErr)
    }

    if (!betAmountRecordPlaintext) {
      devWarn('[Worker] WARNING: Could not extract bet_amount_record. User will need to provide it manually for reveal.')
    }

    // Broadcast
    send({ type: 'progress', id, phase: 'broadcasting', message: 'Broadcasting commit_bet transaction...' })
    const txString = tx.toString()
    const broadcastResp = await fetchWithRetry(`${rpcUrl}/testnet/transaction/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: txString,
    })

    if (!broadcastResp.ok) {
      const errText = await broadcastResp.text()
      throw new Error(`Broadcast failed (${broadcastResp.status}): ${errText}`)
    }

    const txId = (await broadcastResp.text()).replace(/"/g, '')
    devWarn('[Worker] commit_bet submitted:', txId)

    send({
      type: 'result',
      id,
      txId,
      commitmentData: {
        commitmentHash,
        userNonce,
        marketId,
        bettor: address,
        betAmountRecordPlaintext,
      },
    })
  } catch (err: any) {
    const msg = err?.message || String(err)
    console.error('[Worker] commit_bet error:', msg)
    send({ type: 'error', id, message: msg })
  }
}

// ============================================================================
// Commit-Reveal: reveal_bet handler
// ============================================================================
async function handleRevealBet(req: WorkerRequest) {
  const { id, programName, privateKey, priorityFee, rpcUrl,
    commitmentHash, userNonce, marketId, betAmountRecordPlaintext, amount, outcome } = req

  try {
    if (!commitmentHash || !userNonce || !marketId || !betAmountRecordPlaintext || !amount || !outcome) {
      throw new Error('Missing required reveal_bet parameters')
    }

    const sdk = await loadSDK(id)

    send({ type: 'progress', id, phase: 'initializing', message: 'Setting up account...' })
    let account: InstanceType<typeof sdk.Account>
    try {
      account = new sdk.Account({ privateKey })
    } catch {
      throw new Error('Invalid private key. Please check and try again.')
    }

    const address = account.address().to_string()
    devWarn('[Worker] reveal_bet account:', address)

    // Reconstruct Commitment struct as input string
    // committed_at is 0u64 — the transition value, not the finalize-updated value
    const commitmentStructInput = `{ hash: ${commitmentHash}, nonce: ${userNonce}, market_id: ${marketId}, bettor: ${address}, committed_at: 0u64 }`

    const outcomeStr = outcome === 1 ? '1u8' : '2u8'

    // reveal_bet(commitment: Commitment, credits_record: credits.aleo/credits, amount: u64, outcome: u8)
    const finalInputs = [
      commitmentStructInput,
      betAmountRecordPlaintext,
      `${amount}u64`,
      outcomeStr,
    ]

    // Pre-fetch program sources
    const { programSource, imports } = await fetchProgramSources(rpcUrl, programName, id)

    const keyProvider = new sdk.AleoKeyProvider()
    keyProvider.useCache(true)
    ;(keyProvider as any).fetchBytes = async (url: string) => {
      return await downloadBytes(url, id, 'key', 5)
    }

    // Pre-download fee keys
    send({ type: 'progress', id, phase: 'initializing', message: 'Downloading fee proving key (~29MB)...' })
    const feeKeyMeta = sdk.CREDITS_PROGRAM_KEYS.fee_public
    const feeKeyBytes = await downloadBytes(feeKeyMeta.prover, id, 'fee proving key')
    const feeProvingKey = sdk.ProvingKey.fromBytes(feeKeyBytes)
    const feeVerifyingKey = feeKeyMeta.verifyingKey()
    ;(keyProvider as any).cache.set(
      feeKeyMeta.locator,
      [feeProvingKey.toBytes(), feeVerifyingKey.toBytes()]
    )

    const programManager = new sdk.ProgramManager(rpcUrl, keyProvider, undefined)
    programManager.setAccount(account)

    const priorityFeeCredits = priorityFee / 1_000_000

    // Build execution transaction
    let tx: any
    const maxBuildAttempts = 3
    for (let buildAttempt = 1; buildAttempt <= maxBuildAttempts; buildAttempt++) {
      try {
        send({ type: 'progress', id, phase: 'proving',
          message: buildAttempt === 1
            ? 'Building reveal_bet ZK proof (this takes 1-3 minutes)...'
            : `Retrying ZK proof build (attempt ${buildAttempt}/${maxBuildAttempts})...`
        })

        tx = await programManager.buildExecutionTransaction({
          programName,
          functionName: 'reveal_bet',
          inputs: finalInputs,
          program: programSource,
          imports,
          priorityFee: priorityFeeCredits,
          privateFee: false,
          keySearchParams: {
            cacheKey: `${programName}:reveal_bet`,
          },
        })
        break
      } catch (buildErr: any) {
        const buildMsg = buildErr?.message || String(buildErr)
        devWarn(`[Worker] reveal_bet build attempt ${buildAttempt}/${maxBuildAttempts} failed:`, buildMsg)
        const isRetryable = buildMsg.includes('powers') || buildMsg.includes('XMLHttpRequest') ||
          buildMsg.includes('Failed to fetch') || buildMsg.includes('NetworkError') || buildMsg.includes('Download failed')
        if (isRetryable && buildAttempt < maxBuildAttempts) {
          const delay = 5000 * buildAttempt
          send({ type: 'progress', id, phase: 'proving', message: `Download failed, retrying in ${delay / 1000}s...` })
          await new Promise(r => setTimeout(r, delay))
          continue
        }
        throw buildErr
      }
    }

    devWarn('[Worker] reveal_bet transaction built successfully')

    // Broadcast
    send({ type: 'progress', id, phase: 'broadcasting', message: 'Broadcasting reveal_bet transaction...' })
    const txString = tx.toString()
    const broadcastResp = await fetchWithRetry(`${rpcUrl}/testnet/transaction/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: txString,
    })

    if (!broadcastResp.ok) {
      const errText = await broadcastResp.text()
      throw new Error(`Broadcast failed (${broadcastResp.status}): ${errText}`)
    }

    const txId = (await broadcastResp.text()).replace(/"/g, '')
    devWarn('[Worker] reveal_bet submitted:', txId)

    send({ type: 'result', id, txId })
  } catch (err: any) {
    const msg = err?.message || String(err)
    console.error('[Worker] reveal_bet error:', msg)
    send({ type: 'error', id, message: msg })
  }
}

// Register handler IMMEDIATELY (before any async imports)
self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  devWarn('[Worker] Received message:', event.data.type)
  const req = event.data
  if (req.type === 'execute') {
    handleExecute(req)
  } else if (req.type === 'commit_bet') {
    handleCommitBet(req)
  } else if (req.type === 'reveal_bet') {
    handleRevealBet(req)
  }
}

devWarn('[Worker] Aleo SDK worker ready')
