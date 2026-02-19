// ============================================================================
// useSDKTransaction - SDK-based proving in a Web Worker
// ============================================================================
// Spawns a Web Worker that runs @provablehq/sdk ProgramManager.
// This is required because Atomics.wait (used by the WASM thread pool)
// is blocked on the browser main thread but allowed in Web Workers.
//
// The user's PRIVATE KEY is sent to the worker via postMessage.
// It never leaves the browser — proving happens entirely client-side.
// ============================================================================

import { useCallback, useRef, useState } from 'react'
import { config } from '@/lib/config'
import type { WorkerRequest, WorkerResponse, CommitmentData } from '@/workers/aleo-sdk.worker'
import { devWarn } from '../lib/logger'

export type SDKTxPhase =
  | 'idle'
  | 'initializing'
  | 'proving'
  | 'broadcasting'
  | 'polling'
  | 'confirmed'
  | 'failed'

export interface SDKTxState {
  phase: SDKTxPhase
  progress: string
  txId: string | null
  error: string | null
  commitmentData?: CommitmentData | null
}

export { type CommitmentData } from '@/workers/aleo-sdk.worker'

interface ExecuteOptions {
  programName: string
  functionName: string
  inputs: string[]
  privateKey: string
  priorityFee?: number   // in microcredits (default 500_000 = 0.5 ALEO)
  usePrivateCredits?: boolean // If true, scan for Credits record and use buy_shares_private (privacy mode)
}

interface CommitBetOptions {
  programName: string
  privateKey: string
  marketId: string
  amount: number        // microcredits
  outcome: 'yes' | 'no'
  priorityFee?: number
  creditsRecordPlaintext?: string
}

interface RevealBetOptions {
  programName: string
  privateKey: string
  commitmentHash: string
  userNonce: string
  marketId: string
  betAmountRecordPlaintext: string
  amount: number        // microcredits
  outcome: 'yes' | 'no'
  priorityFee?: number
}

/**
 * Try to fetch a Credits record plaintext from the connected wallet adapter.
 * Uses window.__aleoRequestRecords (set by WalletBridge) on the main thread.
 * Returns the record plaintext string or null if unavailable.
 */
async function fetchCreditsRecordFromWallet(minAmountMicro: number): Promise<string | null> {
  const requestRecords = (window as any).__aleoRequestRecords
  if (!requestRecords) return null

  try {
    // Try with plaintext=true first (wallet returns decrypted records)
    devWarn('[SDK] Trying wallet requestRecords(credits.aleo, true)...')
    const records = await requestRecords('credits.aleo', true)
    const recordsArr = Array.isArray(records) ? records : ((records as any)?.records || [])

    for (const record of recordsArr) {
      if (!record) continue
      // Skip spent records
      if ((record as any)?.spent === true || (record as any)?.is_spent === true) continue

      const text = typeof record === 'string'
        ? record
        : ((record as any)?.plaintext || (record as any)?.data || JSON.stringify(record))
      const textStr = String(text)

      // Parse microcredits from record plaintext
      const mcMatch = textStr.match(/microcredits\s*:\s*(\d+)u64/)
      if (mcMatch) {
        const mc = parseInt(mcMatch[1], 10)
        if (mc >= minAmountMicro) {
          devWarn(`[SDK] Found Credits record from wallet: ${mc} microcredits`)
          // Return the plaintext in Leo record format
          if (textStr.includes('{') && textStr.includes('owner')) {
            return textStr
          }
        }
      }
    }
    devWarn('[SDK] Wallet returned records but none had sufficient balance')
  } catch (err) {
    devWarn('[SDK] Wallet requestRecords failed:', err)
  }

  // Try with plaintext=false + decrypt
  try {
    const decryptFn = (window as any).__aleoDecrypt
    if (!decryptFn) return null

    devWarn('[SDK] Trying wallet requestRecords(credits.aleo, false) + decrypt...')
    const records = await requestRecords('credits.aleo', false)
    const recordsArr = Array.isArray(records) ? records : ((records as any)?.records || [])

    for (const record of recordsArr) {
      if (!record) continue
      if ((record as any)?.spent === true || (record as any)?.is_spent === true) continue

      const ciphertext = (record as any)?.ciphertext || (record as any)?.record_ciphertext || (record as any)?.data
      if (!ciphertext) continue

      try {
        const decrypted = await decryptFn(String(ciphertext))
        const textStr = String(decrypted)
        const mcMatch = textStr.match(/microcredits\s*:\s*(\d+)u64/)
        if (mcMatch) {
          const mc = parseInt(mcMatch[1], 10)
          if (mc >= minAmountMicro) {
            devWarn(`[SDK] Found Credits record from wallet (decrypted): ${mc} microcredits`)
            if (textStr.includes('{') && textStr.includes('owner')) {
              return textStr
            }
          }
        }
      } catch { /* decrypt failed for this record */ }
    }
  } catch (err) {
    devWarn('[SDK] Wallet decrypt flow failed:', err)
  }

  return null
}

export function useSDKTransaction() {
  const [state, setState] = useState<SDKTxState>({
    phase: 'idle',
    progress: '',
    txId: null,
    error: null,
    commitmentData: null,
  })
  const workerRef = useRef<Worker | null>(null)

  const reset = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate()
      workerRef.current = null
    }
    setState({ phase: 'idle', progress: '', txId: null, error: null, commitmentData: null })
  }, [])

  const execute = useCallback(async (
    options: ExecuteOptions,
    onChainVerify?: () => Promise<boolean>,
  ) => {
    // Terminate previous worker if any
    if (workerRef.current) {
      workerRef.current.terminate()
    }

    setState({ phase: 'initializing', progress: 'Starting Web Worker...', txId: null, error: null })

    const requestId = crypto.randomUUID()
    // SDK's AleoNetworkClient (testnet build) internally appends /testnet/ to the host.
    // Our config.rpcUrl already includes /testnet, so strip it to avoid /testnet/testnet/.
    const rawRpcUrl = config.rpcUrl || 'https://api.explorer.provable.com/v1/testnet'
    const rpcUrl = rawRpcUrl.replace(/\/(testnet|mainnet)\/?$/, '')

    // If privacy mode, try to get Credits record from wallet BEFORE spawning worker
    let creditsRecordPlaintext: string | undefined
    if (options.usePrivateCredits && (options.functionName === 'buy_shares_public' || options.functionName === 'place_bet_public')) {
      setState(s => ({ ...s, progress: 'Checking wallet for private Credits records...' }))
      const amountStr = options.inputs[1] // format: "1000000u64"
      const amountMicro = parseInt(amountStr.replace('u64', ''), 10)
      const record = await fetchCreditsRecordFromWallet(amountMicro)
      if (record) {
        creditsRecordPlaintext = record
        devWarn('[SDK] Pre-fetched Credits record from wallet adapter')
      } else {
        devWarn('[SDK] No wallet record available, worker will scan blocks')
      }
    }

    // Create the worker (Vite handles the bundling with ?worker import)
    const worker = new Worker(
      new URL('../workers/aleo-sdk.worker.ts', import.meta.url),
      { type: 'module' }
    )
    workerRef.current = worker

    // Send the execute request
    const request: WorkerRequest = {
      type: 'execute',
      id: requestId,
      programName: options.programName,
      functionName: options.functionName,
      inputs: options.inputs,
      privateKey: options.privateKey,
      priorityFee: options.priorityFee ?? 500_000,
      rpcUrl,
      usePrivateCredits: options.usePrivateCredits,
      creditsRecordPlaintext,
    }

    worker.postMessage(request)

    // Listen for worker messages
    worker.onmessage = async (event: MessageEvent<WorkerResponse>) => {
      const resp = event.data
      if (resp.id !== requestId) return

      if (resp.type === 'progress') {
        setState(s => ({
          ...s,
          phase: (resp.phase as SDKTxPhase) || s.phase,
          progress: resp.message || s.progress,
        }))
      } else if (resp.type === 'result') {
        const txId = resp.txId!
        devWarn('[SDK] Transaction submitted:', txId)

        // Start polling for confirmation on the main thread
        setState({ phase: 'polling', progress: 'Waiting for confirmation...', txId, error: null })
        worker.terminate()
        workerRef.current = null

        const maxPolls = 30
        const pollInterval = 10_000
        for (let i = 0; i < maxPolls; i++) {
          await new Promise(r => setTimeout(r, pollInterval))

          // On-chain verification (pool change detection)
          if (onChainVerify && i > 0 && i % 2 === 0) {
            try {
              const verified = await onChainVerify()
              if (verified) {
                devWarn(`[SDK] On-chain verified at poll ${i + 1}!`)
                setState({ phase: 'confirmed', progress: 'Transaction confirmed!', txId, error: null })
                return
              }
            } catch { /* continue */ }
          }

          // Direct API lookup
          try {
            const resp = await fetch(`${rpcUrl}/transaction/${txId}`)
            if (resp.ok) {
              devWarn(`[SDK] Transaction on-chain at poll ${i + 1}`)
              setState({ phase: 'confirmed', progress: 'Transaction confirmed!', txId, error: null })
              return
            }
          } catch { /* continue */ }

          setState(s => ({
            ...s,
            progress: `Waiting for confirmation (${i + 1}/${maxPolls})...`,
          }))
        }

        // Timeout — final verify
        if (onChainVerify) {
          try {
            if (await onChainVerify()) {
              setState({ phase: 'confirmed', progress: 'Transaction confirmed!', txId, error: null })
              return
            }
          } catch { /* fall through */ }
        }

        // Tx was broadcast, just can't confirm yet
        setState({
          phase: 'confirmed',
          progress: 'Transaction broadcast successfully. Check explorer for status.',
          txId,
          error: null,
        })
      } else if (resp.type === 'error') {
        const msg = resp.message || 'Unknown error'
        console.error('[SDK] Worker error:', msg)

        let userMsg = msg
        if (msg.includes('insufficient') || msg.includes('balance')) {
          userMsg = `Insufficient public balance. Make sure your account has enough public ALEO to cover the bet amount + ~0.5 ALEO fee.\n\nOriginal error: ${msg}`
        } else if (msg.includes('Invalid private key')) {
          userMsg = msg
        } else if (msg.includes('deadline') || msg.includes('assert')) {
          userMsg = `Transaction would fail on-chain. The market may be expired or inactive.\n\nOriginal error: ${msg}`
        }

        setState({ phase: 'failed', progress: '', txId: null, error: userMsg })
        worker.terminate()
        workerRef.current = null
      }
    }

    worker.onerror = (err) => {
      console.error('[SDK] Worker crashed:', err)
      setState({
        phase: 'failed',
        progress: '',
        txId: null,
        error: `Web Worker crashed: ${err.message || 'Unknown error'}. Try refreshing the page.`,
      })
      worker.terminate()
      workerRef.current = null
    }
  }, [])

  // Generate a 248-bit random field nonce (same approach as buildBuySharesInputs)
  const generateNonce = (): string => {
    const randomBytes = new Uint8Array(31) // 248 bits, safely < field max
    crypto.getRandomValues(randomBytes)
    let nonce = BigInt(0)
    for (let i = 0; i < randomBytes.length; i++) {
      nonce = (nonce << BigInt(8)) | BigInt(randomBytes[i])
    }
    return `${nonce}field`
  }

  // Helper: create worker, register handlers, return cleanup
  const createWorkerWithHandlers = (
    requestId: string,
    _rpcUrl: string,
    onResult: (resp: WorkerResponse) => void,
  ) => {
    const worker = new Worker(
      new URL('../workers/aleo-sdk.worker.ts', import.meta.url),
      { type: 'module' }
    )
    workerRef.current = worker

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const resp = event.data
      if (resp.id !== requestId) return

      if (resp.type === 'progress') {
        setState(s => ({
          ...s,
          phase: (resp.phase as SDKTxPhase) || s.phase,
          progress: resp.message || s.progress,
        }))
      } else if (resp.type === 'result') {
        onResult(resp)
      } else if (resp.type === 'error') {
        const msg = resp.message || 'Unknown error'
        console.error('[SDK] Worker error:', msg)
        setState({ phase: 'failed', progress: '', txId: null, error: msg, commitmentData: null })
        worker.terminate()
        workerRef.current = null
      }
    }

    worker.onerror = (err) => {
      console.error('[SDK] Worker crashed:', err)
      setState({
        phase: 'failed',
        progress: '',
        txId: null,
        error: `Web Worker crashed: ${err.message || 'Unknown error'}. Try refreshing the page.`,
        commitmentData: null,
      })
      worker.terminate()
      workerRef.current = null
    }

    return worker
  }

  // Poll for confirmation (shared between commit/reveal/execute)
  const pollForConfirmation = async (
    txId: string,
    rpcUrl: string,
    onChainVerify?: () => Promise<boolean>,
  ) => {
    setState(s => ({ ...s, phase: 'polling', progress: 'Waiting for confirmation...', txId }))

    const maxPolls = 30
    const pollInterval = 10_000
    for (let i = 0; i < maxPolls; i++) {
      await new Promise(r => setTimeout(r, pollInterval))

      if (onChainVerify && i > 0 && i % 2 === 0) {
        try {
          if (await onChainVerify()) {
            setState(s => ({ ...s, phase: 'confirmed', progress: 'Transaction confirmed!' }))
            return
          }
        } catch { /* continue */ }
      }

      try {
        const resp = await fetch(`${rpcUrl}/transaction/${txId}`)
        if (resp.ok) {
          setState(s => ({ ...s, phase: 'confirmed', progress: 'Transaction confirmed!' }))
          return
        }
      } catch { /* continue */ }

      setState(s => ({
        ...s,
        progress: `Waiting for confirmation (${i + 1}/${maxPolls})...`,
      }))
    }

    // Final verify
    if (onChainVerify) {
      try {
        if (await onChainVerify()) {
          setState(s => ({ ...s, phase: 'confirmed', progress: 'Transaction confirmed!' }))
          return
        }
      } catch { /* fall through */ }
    }

    setState(s => ({
      ...s,
      phase: 'confirmed',
      progress: 'Transaction broadcast successfully. Check explorer for status.',
    }))
  }

  const commitBet = useCallback(async (
    options: CommitBetOptions,
    onChainVerify?: () => Promise<boolean>,
  ) => {
    if (workerRef.current) {
      workerRef.current.terminate()
    }

    setState({ phase: 'initializing', progress: 'Starting commit_bet...', txId: null, error: null, commitmentData: null })

    const requestId = crypto.randomUUID()
    const rawRpcUrl = config.rpcUrl || 'https://api.explorer.provable.com/v1/testnet'
    const rpcUrl = rawRpcUrl.replace(/\/(testnet|mainnet)\/?$/, '')

    const userNonce = generateNonce()
    const outcomeNum = options.outcome === 'yes' ? 1 : 2

    const worker = createWorkerWithHandlers(requestId, rpcUrl, async (resp) => {
      const txId = resp.txId!
      devWarn('[SDK] commit_bet submitted:', txId)

      const commitmentData = resp.commitmentData || null
      setState(s => ({ ...s, commitmentData }))

      worker.terminate()
      workerRef.current = null

      await pollForConfirmation(txId, rpcUrl, onChainVerify)
    })

    const request: WorkerRequest = {
      type: 'commit_bet',
      id: requestId,
      programName: options.programName,
      functionName: 'commit_bet',
      inputs: [],
      privateKey: options.privateKey,
      priorityFee: options.priorityFee ?? 500_000,
      rpcUrl,
      marketId: options.marketId,
      amount: options.amount,
      outcome: outcomeNum,
      userNonce,
      creditsRecordPlaintext: options.creditsRecordPlaintext,
    }

    worker.postMessage(request)
  }, [])

  const revealBet = useCallback(async (
    options: RevealBetOptions,
    onChainVerify?: () => Promise<boolean>,
  ) => {
    if (workerRef.current) {
      workerRef.current.terminate()
    }

    setState({ phase: 'initializing', progress: 'Starting reveal_bet...', txId: null, error: null, commitmentData: null })

    const requestId = crypto.randomUUID()
    const rawRpcUrl = config.rpcUrl || 'https://api.explorer.provable.com/v1/testnet'
    const rpcUrl = rawRpcUrl.replace(/\/(testnet|mainnet)\/?$/, '')

    const outcomeNum = options.outcome === 'yes' ? 1 : 2

    const worker = createWorkerWithHandlers(requestId, rpcUrl, async (resp) => {
      const txId = resp.txId!
      devWarn('[SDK] reveal_bet submitted:', txId)

      worker.terminate()
      workerRef.current = null

      await pollForConfirmation(txId, rpcUrl, onChainVerify)
    })

    const request: WorkerRequest = {
      type: 'reveal_bet',
      id: requestId,
      programName: options.programName,
      functionName: 'reveal_bet',
      inputs: [],
      privateKey: options.privateKey,
      priorityFee: options.priorityFee ?? 500_000,
      rpcUrl,
      commitmentHash: options.commitmentHash,
      userNonce: options.userNonce,
      marketId: options.marketId,
      betAmountRecordPlaintext: options.betAmountRecordPlaintext,
      amount: options.amount,
      outcome: outcomeNum,
    }

    worker.postMessage(request)
  }, [])

  return { state, execute, commitBet, revealBet, reset }
}
