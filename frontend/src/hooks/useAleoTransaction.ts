// ============================================================================
// useAleoTransaction - Wallet-agnostic transaction execution
// ============================================================================
// For Leo Wallet: Uses window.leoWallet.requestTransaction() directly.
//   The ProvableHQ adapter wraps errors poorly, so we bypass it for Leo.
//   Note: requestExecution() does NOT work for custom programs (returns
//   "An unknown error occurred"). requestTransaction() is the correct API.
//
// For other wallets: Falls back to the adapter's executeTransaction().
// ============================================================================

import { useCallback } from 'react'
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react'
import { useWalletStore } from '@/lib/store'

interface TransactionOptions {
  program: string
  function: string
  inputs: string[]
  fee: number
  privateFee?: boolean
}

interface TransactionResult {
  transactionId?: string
}

export type TxStatus = 'pending' | 'confirmed' | 'failed' | 'unknown'

// Leo Wallet registers as window.leoWallet OR window.leo
function getLeoWallet(): any | undefined {
  const w = window as any
  return w.leoWallet || w.leo
}

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

export function useAleoTransaction() {
  const {
    executeTransaction: adapterExecute,
    transactionStatus: adapterTxStatus,
  } = useWallet()
  const { wallet } = useWalletStore()

  const executeTransaction = useCallback(
    async (options: TransactionOptions): Promise<TransactionResult> => {
      const isLeo = wallet.walletType === 'leo'
      const isShield = wallet.walletType === 'shield'

      console.warn(`[TX] executeTransaction — walletType: ${wallet.walletType}`)

      try {
        // Leo Wallet: Call requestTransaction directly (bypasses adapter error wrapping)
        if (isLeo) {
          const leoWallet = getLeoWallet()
          if (leoWallet?.requestTransaction) {
            // Leo Wallet expects fee in MICROCREDITS (integer), not ALEO (decimal).
            // Callers pass fee in ALEO (e.g., 0.5 = 0.5 ALEO), so convert here.
            const feeInMicrocredits = Math.round((options.fee || 0.5) * 1_000_000)

            const txPayload = {
              address: wallet.address!,
              chainId: 'testnetbeta',
              transitions: [
                {
                  program: options.program,
                  functionName: options.function,
                  inputs: options.inputs,
                },
              ],
              fee: feeInMicrocredits,
              feePrivate: options.privateFee ?? false,
            }

            console.warn('[TX] Calling Leo requestTransaction directly:', {
              program: options.program,
              function: options.function,
              feeAleo: options.fee,
              feeMicrocredits: feeInMicrocredits,
              inputs: options.inputs,
            })

            const result = await leoWallet.requestTransaction(txPayload)
            console.warn('[TX] Leo raw response:', typeof result, JSON.stringify(result)?.substring(0, 500))

            const txId = extractTransactionId(result)
            if (txId) {
              console.warn('[TX] Submitted:', txId)
              return { transactionId: txId }
            }

            throw new Error('No transaction ID returned from Leo Wallet. Raw response: ' + JSON.stringify(result)?.substring(0, 200))
          }
          console.warn('[TX] Leo Wallet not found on window, falling back to adapter')
        }

        // Fallback: Use adapter's executeTransaction with correct AleoTransaction format
        // The ProvableHQ adapter expects fee in microcredits (same as Leo Wallet).
        const adapterFee = Math.round((options.fee || 0.5) * 1_000_000)
        const aleoTx = {
          address: wallet.address!,
          chainId: 'testnetbeta',
          transitions: [
            {
              program: options.program,
              functionName: options.function,
              inputs: options.inputs,
            },
          ],
          fee: adapterFee,
          feePrivate: options.privateFee ?? false,
        }

        console.warn('[TX] Calling adapter executeTransaction:', {
          program: options.program,
          function: options.function,
          fee: options.fee,
        })

        // Cast to any: adapter types differ between ProvableHQ versions
        const result = await (adapterExecute as any)(aleoTx)
        const txId = extractTransactionId(result)

        if (txId) {
          console.warn('[TX] Submitted via adapter:', txId)
          return { transactionId: txId }
        }

        throw new Error('No transaction ID returned from wallet')
      } catch (err: any) {
        const msg = err?.message || String(err)
        console.error('[TX] Failed:', msg)

        if (msg.includes('reject') || msg.includes('denied') || msg.includes('cancel')) {
          throw new Error('Transaction rejected by user')
        }

        if (isShield && msg.includes('Invalid transaction payload')) {
          throw new Error(
            'Shield Wallet does not yet support custom program transactions. ' +
            'Please use Leo Wallet to place bets, or use the CLI mode below.'
          )
        }

        throw err
      }
    },
    [adapterExecute, wallet.walletType, wallet.address]
  )

  // Poll transaction status using DUAL strategy:
  // 1. Poll Leo Wallet's transactionStatus API (for txId and fast detection)
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
      console.warn('[TX] Polling status for:', txId)
      let walletFailedCount = 0
      let walletFinalStatus: string | null = null
      let walletTxId: string | undefined

      for (let i = 0; i < maxAttempts; i++) {
        await new Promise(r => setTimeout(r, intervalMs))

        // === Strategy 1: On-chain verification (primary, most reliable) ===
        // Check every 3rd poll (30 seconds) to avoid excessive API calls
        if (onChainVerify && i > 0 && i % 3 === 0) {
          try {
            const verified = await onChainVerify()
            if (verified) {
              console.warn(`[TX] On-chain verification PASSED at poll ${i + 1}! Bet confirmed.`)
              onStatusChange('confirmed', walletTxId)
              return
            }
          } catch (verifyErr) {
            console.warn(`[TX] On-chain verify poll ${i + 1} error (will retry):`, verifyErr)
          }
        }

        // === Strategy 2: Wallet status API (secondary, for txId) ===
        try {
          const leoWallet = getLeoWallet()
          if (leoWallet?.transactionStatus) {
            const result = await leoWallet.transactionStatus(txId)
            console.warn(`[TX] Poll ${i + 1}/${maxAttempts}:`, JSON.stringify(result))

            if (result?.status === 'Finalized') {
              const onChainId = result.transactionId || txId
              console.warn('[TX] Transaction finalized! On-chain ID:', onChainId)
              onStatusChange('confirmed', onChainId)
              return
            }
            if (result?.status === 'Failed' || result?.status === 'Rejected') {
              walletFailedCount++
              walletTxId = result?.transactionId || walletTxId
              walletFinalStatus = result?.status

              // With a txId, the transaction WAS on-chain and genuinely failed
              if (result?.transactionId) {
                console.warn('[TX] Transaction CONFIRMED FAILED on-chain:', result.transactionId)
                // Do one final on-chain check (maybe pool changed anyway?)
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

              // Without txId, wait for more polls / on-chain check
              console.warn(`[TX] "Failed" without txId (${walletFailedCount}). Continuing to poll on-chain...`)

              // After 4+ failures without txId, do an immediate on-chain check
              if (walletFailedCount >= 4 && onChainVerify) {
                try {
                  console.warn('[TX] Multiple wallet failures — checking on-chain NOW...')
                  const verified = await onChainVerify()
                  if (verified) {
                    console.warn('[TX] On-chain verification PASSED despite wallet failures!')
                    onStatusChange('confirmed', undefined)
                    return
                  }
                  // On-chain confirms no change → genuinely failed
                  console.warn('[TX] On-chain confirms: bet did NOT go through.')
                  onStatusChange('failed', undefined)
                  return
                } catch {
                  // Network error on verification — continue polling
                  console.warn('[TX] On-chain check also failed (network). Will retry...')
                }
              }

              // After 6 failures without txId AND without on-chain verifier
              if (walletFailedCount >= 6 && !onChainVerify) {
                onStatusChange('failed', undefined)
                return
              }

              continue
            }
            // 'Completed' = still processing (proving/broadcasting)
            walletFailedCount = 0
          } else {
            // Non-Leo wallet: use adapter status
            const result = await adapterTxStatus(txId)
            console.warn(`[TX] Poll ${i + 1}/${maxAttempts}:`, result)

            if (result?.status === 'accepted' || result?.status === 'Finalized') {
              onStatusChange('confirmed', result.transactionId || txId)
              return
            }
            if (result?.status === 'failed' || result?.status === 'rejected') {
              if (onChainVerify) {
                try {
                  const verified = await onChainVerify()
                  if (verified) {
                    onStatusChange('confirmed', result?.transactionId || undefined)
                    return
                  }
                } catch { /* fall through */ }
              }
              onStatusChange('failed', result?.transactionId || undefined)
              return
            }
          }
        } catch (err) {
          console.warn(`[TX] Poll ${i + 1} wallet error:`, err)
          // On network error, still continue — on-chain check will handle it
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

      // Timeout — final on-chain verification with retries
      if (onChainVerify) {
        for (let retry = 0; retry < 3; retry++) {
          try {
            console.warn(`[TX] Final on-chain check (attempt ${retry + 1}/3)...`)
            const verified = await onChainVerify()
            if (verified) {
              console.warn('[TX] Final on-chain verification PASSED!')
              onStatusChange('confirmed', undefined)
              return
            }
            break // Pool didn't change, no need to retry
          } catch {
            if (retry < 2) await new Promise(r => setTimeout(r, 3000))
          }
        }
      }

      // If wallet reported failures, use 'failed'; otherwise 'unknown'
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
