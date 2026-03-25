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
import { useWalletStore } from '@/lib/store'
import { devWarn } from '../lib/logger'
import { ShieldWalletAdapter as DirectShieldWalletAdapter } from '../lib/wallet'

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
        // Demo mode: simulate transaction
        if (isDemo) {
          devWarn('[TX] Demo mode — simulating transaction')
          await new Promise(resolve => setTimeout(resolve, 2000))
          return { transactionId: `demo_tx_${Date.now()}_${Math.random().toString(36).substring(7)}` }
        }

        // Convert fee from ALEO to microcredits
        // Callers pass ALEO (e.g., 0.5), wallet expects microcredits (500000)
        const feeAleo = options.fee || 0.5
        const feeMicrocredits = Math.round(feeAleo * 1_000_000)

        const privateFeeFlag = options.privateFee ?? false
        const submitViaDirectShield = async (forceReconnect = false): Promise<string> => {
          const directShield = new DirectShieldWalletAdapter()

          if (forceReconnect) {
            try {
              await directShield.disconnect()
            } catch {
              // Ignore disconnect failures before forced reconnect.
            }
            await directShield.connect({ forceReconnect: true, refreshPrograms: true })
          } else {
            await directShield.connect()
          }

          return directShield.requestTransaction({
            programId: options.program,
            functionName: options.function,
            inputs: options.inputs,
            fee: feeAleo,
            privateFee: privateFeeFlag,
            recordIndices: options.recordIndices,
          })
        }

        devWarn('[TX] Calling adapter executeTransaction:', {
          program: options.program,
          function: options.function,
          fee: `${feeAleo} ALEO = ${feeMicrocredits} microcredits`,
          privateFee: privateFeeFlag,
          recordIndices: options.recordIndices || 'none',
          inputCount: options.inputs.length,
          inputs: options.inputs,
        })

        // Shield Wallet is still flaky through the shared adapter for some
        // complex transitions. When we know the active wallet is Shield, use
        // the direct Shield API first so we can avoid adapter-specific errors.
        if (isShield) {
          try {
            devWarn('[TX] Shield detected — trying direct Shield API first')
            const txId = await submitViaDirectShield(false)

            return { transactionId: txId }
          } catch (directErr: any) {
            const directMsg = directErr?.message || directErr?.data?.message || String(directErr)
            if (isShieldReconnectableError(directMsg)) {
              try {
                devWarn('[TX] Direct Shield API failed with reconnectable error, forcing reconnect and retrying once:', directMsg)
                const retriedTxId = await submitViaDirectShield(true)
                return { transactionId: retriedTxId }
              } catch (retryErr: any) {
                const retryMsg = retryErr?.message || retryErr?.data?.message || String(retryErr)
                devWarn('[TX] Forced Shield reconnect retry failed:', retryMsg)
              }
            }
            devWarn('[TX] Direct Shield API failed, falling back to adapter:', directMsg)
          }
        }

        // === Non-Shield wallets: use ProvableHQ adapter ===
        // Previously we had a Leo Wallet direct path (requestTransaction),
        // but this caused bugs when Shield was misdetected as Leo (both
        // extensions installed → walletType defaults to 'leo' → Shield
        // transactions routed to Leo Wallet which can't handle v12).
        // Leo Wallet can't handle v12 anyway (4-level import chain), so
        // the direct path is removed. All non-Shield wallets go through the adapter.
        const adapterPayload: Record<string, unknown> = {
          program: options.program,
          function: options.function,
          inputs: options.inputs,
          fee: feeMicrocredits,
          privateFee: options.privateFee ?? false,
        }
        // recordIndices tells wallets (especially Shield) which inputs are records
        if (options.recordIndices && options.recordIndices.length > 0) {
          adapterPayload.recordIndices = options.recordIndices
        }
        let result: unknown
        try {
          result = await (adapterExecute as any)(adapterPayload)
        } catch (adapterErr: any) {
          const adapterMsg = adapterErr?.message || adapterErr?.data?.message || String(adapterErr)

          if (isShield && isShieldProgramFetchError(adapterMsg)) {
            devWarn(
              '[TX] Shield adapter failed to fetch program, retrying via direct Shield API:',
              adapterMsg,
            )
            const txId = await submitViaDirectShield(true)

            return { transactionId: txId }
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

        // === Strategy 2: Adapter status API (secondary, for txId) ===
        try {
          const result = await adapterTxStatus(txId)
          devWarn(`[TX] Poll ${i + 1}/${maxAttempts}:`, JSON.stringify(result))

          if (result?.status === 'accepted' || result?.status === 'Finalized' || result?.status === 'Settled') {
            onStatusChange('confirmed', result.transactionId || txId)
            return
          }
          if (result?.status === 'failed' || result?.status === 'rejected' || result?.status === 'Failed' || result?.status === 'Rejected') {
            walletFailedCount++
            walletTxId = result?.transactionId || walletTxId
            walletFinalStatus = result?.status

            if (result?.transactionId) {
              devWarn('[TX] Transaction CONFIRMED FAILED on-chain:', result.transactionId)
              if (onChainVerify) {
                try {
                  const verified = await onChainVerify()
                  if (verified) {
                    onStatusChange('confirmed', result.transactionId)
                    return
                  }
                } catch { /* fall through */ }
              }
              onStatusChange('failed', result.transactionId)
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
        } catch (err) {
          devWarn(`[TX] Poll ${i + 1} wallet error:`, err)
          if (txId.startsWith('at1')) {
            try {
              const resp = await fetch(
                `https://api.explorer.provable.com/v1/testnet/transaction/${txId}`
              )
              if (resp.ok) {
                onStatusChange('confirmed', txId)
                return
              }
            } catch { /* continue */ }
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

      if (walletFinalStatus === 'Failed' || walletFinalStatus === 'Rejected') {
        onStatusChange('failed', walletTxId)
      } else {
        onStatusChange('unknown')
      }
    },
    [adapterTxStatus]
  )

  return { executeTransaction, pollTransactionStatus }
}
