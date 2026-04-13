// ============================================================================
// useAleoTransaction - Wallet-agnostic transaction execution
// ============================================================================
// All wallets go through the ProvableHQ adapter's executeTransaction().
// We do NOT call any wallet's native API directly to avoid misrouting when
// multiple wallet extensions are installed (e.g., Shield misdetected as Leo).
// Demo mode simulates transactions.
// ============================================================================

import { useCallback } from 'react'
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react'
import { diagnoseTransaction } from '@/lib/aleo-client'
import { useWalletStore } from '@/lib/store'
import { devWarn } from '../lib/logger'
import {
  ShieldWalletAdapter as DirectShieldWalletAdapter,
  lookupWalletTransactionStatus,
} from '../lib/wallet'

interface TransactionOptions {
  program: string
  function: string
  inputs: string[]
  fee: number       // in ALEO (e.g., 0.5). Hook converts to microcredits.
  privateFee?: boolean
  recordIndices?: number[]  // Which input indices are records (needed by Shield Wallet)
}

interface TransactionResult {
  transactionId?: string
}

export type TxStatus = 'pending' | 'confirmed' | 'failed' | 'unknown'

/**
 * Extract transaction ID from various wallet response formats.
 * Leo Wallet native API may return:
 *   - A plain string (the UUID event ID)
 *   - An object with transactionId, txId, id, eventId, or transaction_id
 */
function extractTransactionId(result: any): string | null {
  if (!result) return null

  // Plain string response
  if (typeof result === 'string' && result.length > 0) {
    return result
  }

  // Object response — try all known key names
  if (typeof result === 'object') {
    const id = result.transactionId
      || result.txId
      || result.id
      || result.eventId
      || result.transaction_id
      || result.aleoTransactionId
    if (id && typeof id === 'string') return id
  }

  return null
}

function isShieldProgramFetchError(message: string): boolean {
  const msg = message.toLowerCase()
  return (
    msg.includes('error finding')
    || msg.includes('error fetching program')
    || msg.includes('failed to fetch')
  )
}

function isShieldReconnectableError(message: string): boolean {
  const msg = message.toLowerCase()
  return (
    isShieldProgramFetchError(msg)
    || msg.includes('connection expired')
    || msg.includes('dapp not connected')
    || msg.includes('not connected')
    || msg.includes('no valid aleo address')
  )
}

function isLikelyUserRejectedTransaction(message: string): boolean {
  const msg = message.toLowerCase()
  return (
    msg.includes('user rejected')
    || msg.includes('rejected by user')
    || msg.includes('user denied')
    || msg.includes('denied by user')
    || msg.includes('cancelled by user')
    || msg.includes('canceled by user')
    || msg.includes('user cancel')
  )
}

function extractStatusTransactionId(result: any, fallbackTxId: string): string | undefined {
  const candidates: unknown[] = [
    result?.transactionId,
    result?.transaction_id,
    result?.txId,
    result?.aleoTransactionId,
    result?.onChainTransactionId,
    result?.on_chain_transaction_id,
    result?.transaction?.id,
    result?.transaction?.transactionId,
    result?.transaction?.transaction_id,
    result?.transaction?.txId,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.startsWith('at1')) {
      return candidate
    }
  }

  return fallbackTxId.startsWith('at1') ? fallbackTxId : undefined
}

export function useAleoTransaction() {
  const {
    executeTransaction: adapterExecute,
    transactionStatus: adapterTxStatus,
  } = useWallet()
  const { wallet } = useWalletStore()

  const executeTransaction = useCallback(
    async (options: TransactionOptions): Promise<TransactionResult> => {
      const isShield = wallet.walletType === 'shield'
      const isDemo = wallet.isDemoMode

      devWarn(`[TX] executeTransaction — walletType: ${wallet.walletType}`)

      try {
        // Demo mode: simulate transaction (development only)
        if (isDemo) {
          if (import.meta.env.PROD) {
            throw new Error('Demo mode is not available in production builds.')
          }
          devWarn('[TX] Demo mode — simulating transaction')
          await new Promise(resolve => setTimeout(resolve, 2000))
          return { transactionId: `demo_tx_${Date.now()}_${Math.random().toString(36).substring(7)}` }
        }

        // Convert fee from ALEO to microcredits
        // Callers pass ALEO (e.g., 0.5), wallet expects microcredits (500000)
        const feeAleo = options.fee || 0.5
        const feeMicrocredits = Math.round(feeAleo * 1_000_000)

        const privateFeeFlag = options.privateFee ?? false

        // ── Shield direct extension helper ─────────────────────────────────
        // Calls the raw window.shield API. Probes address first to SKIP
        // connect() (which triggers "Connect Site" popup). Only falls back
        // to full connect() when the session is genuinely dead.
        const submitViaShieldExtension = async (): Promise<string> => {
          const sw = (window as any).shield || (window as any).shieldWallet || (window as any).shieldAleo
          if (!sw) throw new Error('Shield Wallet extension not found')

          // Probe for live session without calling connect()
          let liveAddr: string | null = null
          try {
            if (typeof sw.publicKey === 'string' && sw.publicKey.startsWith('aleo1')) {
              liveAddr = sw.publicKey
            }
          } catch { /* ignore */ }
          if (!liveAddr) {
            try {
              if (typeof sw.getAccount === 'function') {
                const acc = await sw.getAccount()
                const a = acc?.address || acc?.publicKey || acc
                if (typeof a === 'string' && a.startsWith('aleo1')) liveAddr = a
              }
            } catch { /* ignore */ }
          }
          if (!liveAddr) {
            // Session dead — must fall through to adapter or full reconnect
            throw new Error('Shield session not available')
          }

          devWarn('[TX] Shield session alive (' + liveAddr.slice(0, 12) + '…), sending tx directly')
          const feeInMicro = Math.round(feeAleo * 1_000_000)
          const txPayload = {
            address: liveAddr,
            chainId: 'testnet',
            network: 'testnet',
            program: options.program,
            function: options.function,
            programId: options.program,
            functionName: options.function,
            inputs: options.inputs,
            fee: feeInMicro,
            feePrivate: false,
            privateFee: false,
            recordIndices: options.recordIndices,
            transitions: [{
              program: options.program,
              functionName: options.function,
              inputs: options.inputs,
            }],
          }

          let result: any = null
          if (typeof sw.executeTransaction === 'function') {
            try { result = await sw.executeTransaction(txPayload) } catch (e: any) {
              devWarn('[TX] Shield executeTransaction failed:', e?.message)
            }
          }
          if (!result && typeof sw.requestExecution === 'function') {
            try { result = await sw.requestExecution(txPayload) } catch (e: any) {
              devWarn('[TX] Shield requestExecution failed:', e?.message)
            }
          }
          if (!result && typeof sw.requestTransaction === 'function') {
            try { result = await sw.requestTransaction(txPayload) } catch (e: any) {
              devWarn('[TX] Shield requestTransaction failed:', e?.message)
            }
          }

          if (!result) throw new Error('Shield Wallet: all transaction methods failed')

          const id = typeof result === 'string' ? result
            : result?.transactionId || result?.txId || result?.id || result?.transaction_id || result?.eventId
          if (id) return id
          throw new Error('No transaction ID returned from Shield Wallet')
        }

        // Full reconnect fallback — only used when both direct extension
        // and adapter have failed. Will show "Connect Site" popup.
        const submitViaDirectShieldReconnect = async (): Promise<string> => {
          const directShield = new DirectShieldWalletAdapter()
          try { await directShield.disconnect() } catch { /* ignore */ }
          await directShield.connect({ forceReconnect: true, refreshPrograms: true })
          return directShield.requestTransaction({
            programId: options.program,
            functionName: options.function,
            inputs: options.inputs,
            fee: feeAleo,
            privateFee: privateFeeFlag,
            recordIndices: options.recordIndices,
          })
        }

        devWarn('[TX] Calling executeTransaction:', {
          program: options.program,
          function: options.function,
          fee: `${feeAleo} ALEO = ${feeMicrocredits} microcredits`,
          privateFee: privateFeeFlag,
          recordIndices: options.recordIndices || 'none',
          inputCount: options.inputs.length,
          inputs: options.inputs,
        })

        // ── Shield: try direct extension API first (no popup) ──────────
        // The direct API handles private records (TurboShare, OutcomeShare)
        // better than the adapter, which may fail to locate records that
        // were pasted/restored rather than fetched from wallet storage.
        // We probe the address first to skip connect() and avoid the popup.
        if (isShield) {
          try {
            devWarn('[TX] Shield — trying direct extension API (no connect)')
            const txId = await submitViaShieldExtension()
            return { transactionId: txId }
          } catch (directErr: any) {
            const directMsg = directErr?.message || directErr?.data?.message || String(directErr)
            devWarn('[TX] Shield direct extension failed:', directMsg, '— falling through to adapter')
          }
        }

        // ── All wallets: ProvableHQ adapter ────────────────────────────
        // Already connected via AleoWalletProvider (autoConnect).
        const adapterPayload: Record<string, unknown> = {
          program: options.program,
          function: options.function,
          inputs: options.inputs,
          fee: feeMicrocredits,
          privateFee: options.privateFee ?? false,
        }
        if (options.recordIndices && options.recordIndices.length > 0) {
          adapterPayload.recordIndices = options.recordIndices
        }
        let result: unknown
        try {
          result = await (adapterExecute as any)(adapterPayload)
        } catch (adapterErr: any) {
          const adapterMsg = adapterErr?.message || adapterErr?.data?.message || String(adapterErr)

          // Shield last-resort: full reconnect (will show popup)
          if (isShield && (isShieldProgramFetchError(adapterMsg) || isShieldReconnectableError(adapterMsg))) {
            devWarn('[TX] Shield adapter failed, last resort reconnect:', adapterMsg)
            try {
              const txId = await submitViaDirectShieldReconnect()
              return { transactionId: txId }
            } catch (retryErr: any) {
              const retryMsg = retryErr?.message || retryErr?.data?.message || String(retryErr)
              devWarn('[TX] Shield reconnect fallback also failed:', retryMsg)
              if (retryMsg.toLowerCase().includes('no valid aleo address') ||
                  retryMsg.toLowerCase().includes('not connected')) {
                useWalletStore.getState().disconnect()
                throw new Error(
                  'Shield Wallet lost connection. Please: 1) Click the Shield Wallet extension icon, ' +
                  '2) Make sure you are on Testnet, 3) Disconnect and reconnect, then try again.'
                )
              }
            }
          }

          throw adapterErr
        }

        const txId = extractTransactionId(result)
        if (txId) {
          devWarn('[TX] Submitted via adapter:', txId)
          return { transactionId: txId }
        }

        throw new Error('No transaction ID returned from wallet')
      } catch (err: any) {
        const msg = err?.message || err?.data?.message || String(err)
        const errName = err?.name || ''
        console.error('[TX] Failed:', { name: errName, message: msg, raw: err })

        if (isLikelyUserRejectedTransaction(msg)) {
          throw new Error('Transaction rejected by user')
        }

        if (isShield && msg.includes('not in the allowed programs')) {
          throw new Error(
            `"${options.program}" is not registered with Shield Wallet. ` +
            'Please disconnect Shield Wallet and reconnect — ' +
            'click your wallet icon in the top-right, then Disconnect, then Connect again. ' +
            'This will register the correct program.'
          )
        }

        if (isShield && msg.includes('Invalid transaction payload')) {
          throw new Error(
            'Shield Wallet cannot process this transaction. ' +
            'Please try using Puzzle Wallet instead, which supports complex programs via server-side proving.'
          )
        }

        if (isShield && isShieldProgramFetchError(msg)) {
          throw new Error(
            `Shield Wallet could not fetch "${options.program}" or one of its imported programs from Aleo testnet, ` +
            'even though the program is deployed. ' +
            'Please disconnect and reconnect Shield Wallet, then try again. ' +
            'If it still fails, update Shield or use Puzzle Wallet for this transaction.'
          )
        }

        if (msg.includes('Invalid Aleo program') || msg.includes('INVALID_PARAMS')) {
          throw new Error(
            `Wallet cannot validate program "${options.program}". ` +
            'This is a known wallet limitation with nested signer authorization. ' +
            'Try using Puzzle Wallet, which handles complex programs via server-side proving.'
          )
        }

        // For adapter-wrapped errors like "Failed to execute transaction"
        if (msg.includes('Failed to execute') || msg.includes('unknown error')) {
          throw new Error(
            `Wallet cannot execute "${options.function}" on "${options.program}". ` +
            'Please try again or try a different wallet (Puzzle Wallet recommended for complex programs).'
          )
        }

        throw err
      }
    },
    [adapterExecute, wallet.walletType, wallet.address, wallet.isDemoMode]
  )

  // Poll transaction status using DUAL strategy:
  // 1. Poll adapter's transactionStatus API (for txId and fast detection)
  // 2. Poll on-chain state directly via onChainVerify (for reliable verification)
  // The on-chain check is the SOURCE OF TRUTH — wallet status is secondary.
  const pollTransactionStatus = useCallback(
    async (
      txId: string,
      onStatusChange: (status: TxStatus, onChainTxId?: string) => void,
      maxAttempts = 30,
      intervalMs = 10_000,
      onChainVerify?: () => Promise<boolean>,
    ) => {
      devWarn('[TX] Polling status for:', txId)
      let walletFailedCount = 0
      let walletFinalStatus: string | null = null
      let walletTxId: string | undefined

      for (let i = 0; i < maxAttempts; i++) {
        await new Promise(r => setTimeout(r, intervalMs))

        // === Strategy 1: On-chain verification (primary, most reliable) ===
        if (onChainVerify && i > 0 && i % 3 === 0) {
          try {
            const verified = await onChainVerify()
            if (verified) {
              devWarn(`[TX] On-chain verification PASSED at poll ${i + 1}!`)
              onStatusChange('confirmed', walletTxId)
              return
            }
          } catch (verifyErr) {
            devWarn(`[TX] On-chain verify poll ${i + 1} error (will retry):`, verifyErr)
          }
        }

        if (txId.startsWith('at1') && i > 0 && i % 3 === 0) {
          try {
            const diagnosis = await diagnoseTransaction(txId)
            if (diagnosis.status === 'accepted') {
              devWarn(`[TX] Explorer diagnosis CONFIRMED tx at poll ${i + 1}`)
              onStatusChange('confirmed', txId)
              return
            }
            if (diagnosis.status === 'rejected') {
              devWarn(`[TX] Explorer diagnosis REJECTED tx at poll ${i + 1}`)
              onStatusChange('failed', txId)
              return
            }
          } catch (diagErr) {
            devWarn(`[TX] Explorer diagnosis poll ${i + 1} error (will retry):`, diagErr)
          }
        }

        // === Strategy 2: Adapter status API (secondary, for txId) ===
        try {
          const result = await adapterTxStatus(txId)
          devWarn(`[TX] Poll ${i + 1}/${maxAttempts}:`, JSON.stringify(result))
          const resolvedTxId = extractStatusTransactionId(result, txId)

          if (result?.status === 'accepted' || result?.status === 'Finalized' || result?.status === 'Settled') {
            onStatusChange('confirmed', resolvedTxId || txId)
            return
          }
          if (result?.status === 'failed' || result?.status === 'rejected' || result?.status === 'Failed' || result?.status === 'Rejected') {
            walletFailedCount++
            walletTxId = resolvedTxId || walletTxId
            walletFinalStatus = result?.status

            if (resolvedTxId) {
              devWarn('[TX] Transaction CONFIRMED FAILED on-chain:', resolvedTxId)
              if (onChainVerify) {
                try {
                  const verified = await onChainVerify()
                  if (verified) {
                    onStatusChange('confirmed', resolvedTxId)
                    return
                  }
                } catch { /* fall through */ }
              }
              onStatusChange('failed', resolvedTxId)
              return
            }

            devWarn(`[TX] "Failed" without txId (${walletFailedCount}). Continuing...`)

            if (walletFailedCount >= 4 && onChainVerify) {
              try {
                const verified = await onChainVerify()
                if (verified) {
                  onStatusChange('confirmed', undefined)
                  return
                }
                onStatusChange('failed', undefined)
                return
              } catch {
                devWarn('[TX] On-chain check also failed (network). Will retry...')
              }
            }

            if (walletFailedCount >= 6 && !onChainVerify) {
              onStatusChange('failed', undefined)
              return
            }
            continue
          }
          walletFailedCount = 0

          const walletNativeStatus = await lookupWalletTransactionStatus(txId)
          if (walletNativeStatus?.transactionId?.startsWith('at1')) {
            try {
              const diagnosis = await diagnoseTransaction(walletNativeStatus.transactionId)
              if (diagnosis.status === 'accepted') {
                onStatusChange('confirmed', walletNativeStatus.transactionId)
                return
              }
              if (diagnosis.status === 'rejected') {
                onStatusChange('failed', walletNativeStatus.transactionId)
                return
              }
            } catch (nativeDiagErr) {
              devWarn('[TX] Native wallet tx diagnosis failed (will retry):', nativeDiagErr)
            }
          }

          if (walletNativeStatus?.status === 'accepted') {
            onStatusChange('confirmed', walletNativeStatus.transactionId || txId)
            return
          }

          if (walletNativeStatus?.status === 'rejected') {
            onStatusChange('failed', walletNativeStatus.transactionId)
            return
          }
        } catch (err) {
          devWarn(`[TX] Poll ${i + 1} wallet error:`, err)
          if (txId.startsWith('at1')) {
            try {
              const diagnosis = await diagnoseTransaction(txId)
              if (diagnosis.status === 'accepted') {
                onStatusChange('confirmed', txId)
                return
              }
              if (diagnosis.status === 'rejected') {
                onStatusChange('failed', txId)
                return
              }
            } catch { /* continue */ }
          }

          try {
            const walletNativeStatus = await lookupWalletTransactionStatus(txId)
            if (walletNativeStatus?.transactionId?.startsWith('at1')) {
              const diagnosis = await diagnoseTransaction(walletNativeStatus.transactionId)
              if (diagnosis.status === 'accepted') {
                onStatusChange('confirmed', walletNativeStatus.transactionId)
                return
              }
              if (diagnosis.status === 'rejected') {
                onStatusChange('failed', walletNativeStatus.transactionId)
                return
              }
            }
            if (walletNativeStatus?.status === 'accepted') {
              onStatusChange('confirmed', walletNativeStatus.transactionId || txId)
              return
            }
            if (walletNativeStatus?.status === 'rejected') {
              onStatusChange('failed', walletNativeStatus.transactionId)
              return
            }
          } catch {
            // Continue polling on transient native-wallet errors.
          }
        }
      }

      // Timeout — final on-chain verification
      if (onChainVerify) {
        for (let retry = 0; retry < 3; retry++) {
          try {
            const verified = await onChainVerify()
            if (verified) {
              onStatusChange('confirmed', undefined)
              return
            }
            break
          } catch {
            if (retry < 2) await new Promise(r => setTimeout(r, 3000))
          }
        }
      }

      if (txId.startsWith('at1')) {
        try {
          const diagnosis = await diagnoseTransaction(txId)
          if (diagnosis.status === 'accepted') {
            onStatusChange('confirmed', txId)
            return
          }
          if (diagnosis.status === 'rejected') {
            onStatusChange('failed', txId)
            return
          }
        } catch {
          // Fall through to wallet-derived status below.
        }
      }

      try {
        const walletNativeStatus = await lookupWalletTransactionStatus(txId)
        if (walletNativeStatus?.transactionId?.startsWith('at1')) {
          const diagnosis = await diagnoseTransaction(walletNativeStatus.transactionId)
          if (diagnosis.status === 'accepted') {
            onStatusChange('confirmed', walletNativeStatus.transactionId)
            return
          }
          if (diagnosis.status === 'rejected') {
            onStatusChange('failed', walletNativeStatus.transactionId)
            return
          }
        }

        if (walletNativeStatus?.status === 'accepted') {
          onStatusChange('confirmed', walletNativeStatus.transactionId || txId)
          return
        }
        if (walletNativeStatus?.status === 'rejected') {
          onStatusChange('failed', walletNativeStatus.transactionId)
          return
        }
      } catch {
        // Fall through to wallet-derived status below.
      }

      if (walletFinalStatus && ['failed', 'rejected'].includes(walletFinalStatus.toLowerCase())) {
        onStatusChange('failed', walletTxId)
      } else {
        onStatusChange('unknown')
      }
    },
    [adapterTxStatus]
  )

  return { executeTransaction, pollTransactionStatus }
}
