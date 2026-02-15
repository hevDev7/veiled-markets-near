// ============================================================================
// useAleoTransaction - Wallet-agnostic transaction execution
// ============================================================================
// Strategy:
//   1. For Leo Wallet: Call leoWallet.requestTransaction() DIRECTLY.
//      The ProvableHQ adapter swallows Leo Wallet's real error messages,
//      replacing them with generic "Failed to execute transaction". By calling
//      directly, we get the actual error for debugging.
//
//   2. For other wallets: Use ProvableHQ adapter's executeTransaction().
//
//   3. For demo mode: Simulate transaction.
// ============================================================================

import { useCallback } from 'react'
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react'
import { useWalletStore } from '@/lib/store'

interface TransactionOptions {
  program: string
  function: string
  inputs: string[]
  fee: number       // in ALEO (e.g., 0.5). Hook converts to microcredits.
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
      const isShield = wallet.walletType === 'shield'
      const isDemo = wallet.isDemoMode

      console.warn(`[TX] executeTransaction — walletType: ${wallet.walletType}`)

      try {
        // Demo mode: simulate transaction
        if (isDemo) {
          console.warn('[TX] Demo mode — simulating transaction')
          await new Promise(resolve => setTimeout(resolve, 2000))
          return { transactionId: `demo_tx_${Date.now()}_${Math.random().toString(36).substring(7)}` }
        }

        // Convert fee from ALEO to microcredits
        // Callers pass ALEO (e.g., 0.5), wallet expects microcredits (500000)
        const feeAleo = options.fee || 0.5
        const feeMicrocredits = Math.round(feeAleo * 1_000_000)

        console.warn('[TX] Calling adapter executeTransaction:', {
          program: options.program,
          function: options.function,
          fee: `${feeAleo} ALEO = ${feeMicrocredits} microcredits`,
          inputCount: options.inputs.length,
          inputs: options.inputs,
        })

        // Detect Leo Wallet — only use direct API if Leo is the CONNECTED wallet
        const isLeoConnected = wallet.walletType === 'leo'
        const leoWallet = isLeoConnected ? getLeoWallet() : undefined

        // For Leo Wallet: ensure the wallet has the correct program permissions.
        if (isLeoConnected && leoWallet && typeof leoWallet.connect === 'function') {
          try {
            const programs = [
              options.program,
              'credits.aleo',
              // Include USDCX program and ALL its transitive dependencies
              // Leo Wallet must resolve all imports to validate the program
              'test_usdcx_stablecoin.aleo',
              'merkle_tree.aleo',
              'test_usdcx_multisig_core.aleo',
              'test_usdcx_freezelist.aleo',
            ]
            console.warn('[TX] Refreshing Leo Wallet permissions for:', programs)
            await leoWallet.connect('AutoDecrypt', 'testnetbeta', programs)
            console.warn('[TX] Leo Wallet permissions refreshed')
          } catch (connectErr) {
            console.warn('[TX] Leo Wallet permission refresh (non-fatal):', (connectErr as any)?.message)
          }
        }

        // === Leo Wallet: call requestTransaction() directly ===
        // The adapter wraps Leo Wallet errors with generic messages, losing the
        // real error. By calling directly, we get actionable error messages.
        if (isLeoConnected && leoWallet && typeof leoWallet.requestTransaction === 'function') {
          const requestData = {
            address: wallet.address,
            chainId: 'testnetbeta',
            fee: feeMicrocredits,
            feePrivate: options.privateFee ?? false,
            transitions: [{
              program: options.program,
              functionName: options.function,
              inputs: options.inputs,
            }],
          }

          console.warn('[TX] Calling Leo Wallet requestTransaction directly:', JSON.stringify(requestData, null, 2))

          const result = await leoWallet.requestTransaction(requestData)
          console.warn('[TX] Leo Wallet response:', result)

          const txId = extractTransactionId(result)
          if (txId) {
            console.warn('[TX] Submitted via Leo Wallet direct:', txId)
            return { transactionId: txId }
          }

          throw new Error('No transaction ID returned from Leo Wallet')
        }

        // === Other wallets: use ProvableHQ adapter ===
        const result = await (adapterExecute as any)({
          program: options.program,
          function: options.function,
          inputs: options.inputs,
          fee: feeMicrocredits,
          privateFee: options.privateFee ?? false,
        })

        const txId = extractTransactionId(result)
        if (txId) {
          console.warn('[TX] Submitted via adapter:', txId)
          return { transactionId: txId }
        }

        throw new Error('No transaction ID returned from wallet')
      } catch (err: any) {
        // Extract the REAL error message — Leo Wallet errors may be nested
        // AleoWalletError objects where the real message is buried
        const msg = err?.message || err?.data?.message || String(err)
        const errName = err?.name || ''
        const errCode = err?.code || ''

        // For AleoWalletError, try to extract the original INVALID_PARAMS message
        // Leo Wallet wraps real errors with "An unknown error occured"
        let realMessage = msg
        if (errName === 'AleoWalletError' || msg.includes('unknown error')) {
          realMessage = `Leo Wallet error: ${msg}. ` +
            `Browser wallets cannot execute "${options.program}" due to nested signer authorization.`
        }

        console.error('[TX] Failed:', { name: errName, code: errCode, message: msg, realMessage, raw: err })

        if (msg.includes('reject') || msg.includes('denied') || msg.includes('cancel')) {
          throw new Error('Transaction rejected by user')
        }

        if (isShield && msg.includes('Invalid transaction payload')) {
          throw new Error(
            'Shield Wallet does not yet support custom program transactions. ' +
            'Please use Puzzle Wallet or Leo Wallet instead.'
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
        if (onChainVerify && i > 0 && i % 3 === 0) {
          try {
            const verified = await onChainVerify()
            if (verified) {
              console.warn(`[TX] On-chain verification PASSED at poll ${i + 1}!`)
              onStatusChange('confirmed', walletTxId)
              return
            }
          } catch (verifyErr) {
            console.warn(`[TX] On-chain verify poll ${i + 1} error (will retry):`, verifyErr)
          }
        }

        // === Strategy 2: Wallet status API (secondary, for txId) ===
        try {
          const currentWalletType = useWalletStore.getState().wallet.walletType
          const leoWallet = currentWalletType === 'leo' ? getLeoWallet() : undefined
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

              if (result?.transactionId) {
                console.warn('[TX] Transaction CONFIRMED FAILED on-chain:', result.transactionId)
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

              console.warn(`[TX] "Failed" without txId (${walletFailedCount}). Continuing...`)

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
                  console.warn('[TX] On-chain check also failed (network). Will retry...')
                }
              }

              if (walletFailedCount >= 6 && !onChainVerify) {
                onStatusChange('failed', undefined)
                return
              }
              continue
            }
            walletFailedCount = 0
          } else {
            const result = await adapterTxStatus(txId)
            console.warn(`[TX] Poll ${i + 1}/${maxAttempts}:`, result)
            if (result?.status === 'accepted' || result?.status === 'Finalized' || result?.status === 'Settled') {
              onStatusChange('confirmed', result.transactionId || txId)
              return
            }
            if (result?.status === 'failed' || result?.status === 'rejected' || result?.status === 'Failed') {
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
