// ============================================================================
// useAleoTransaction — the pages' single entry point for on-chain writes.
// ============================================================================
// On NEAR the call shapes stay the ones the pages build for Aleo ({ program,
// function, inputs }); lib/near/executor.ts runs them: private trades are proven
// in the browser and relayed, public steps are signed by the NEAR wallet.
// executeTransaction resolves only after the transaction has executed, so the
// "polling" below reports the final state at once.
// ============================================================================

import { useCallback } from 'react'
import { executeAleoCall, knownTxOutcome } from '@/lib/near/executor'
import { txStatus, outcomeFailure } from '@/lib/near/rpc'
import { RELAYER_ACCOUNT } from '@/lib/near/config'
import { currentAccountId } from '@/lib/near/near-wallet'
import { devWarn } from '../lib/logger'

interface TransactionOptions {
  program: string
  function: string
  inputs: string[]
  fee: number // Aleo fee field; NEAR gas is paid by the wallet (public calls) or the relayer (private calls)
  privateFee?: boolean
  recordIndices?: number[]
}

interface TransactionResult {
  transactionId?: string
}

export type TxStatus = 'pending' | 'confirmed' | 'failed' | 'unknown'

/** Final state of a NEAR transaction this browser did not send itself (e.g. after a reload). */
async function lookupOutcome(txId: string): Promise<'confirmed' | 'failed' | null> {
  const senders = [RELAYER_ACCOUNT, await currentAccountId().catch(() => null)].filter(Boolean) as string[]
  for (const sender of senders) {
    try {
      const o = await txStatus(txId, sender)
      if (typeof o.status !== 'object') continue
      return outcomeFailure(o) ? 'failed' : 'confirmed'
    } catch {
      /* not this sender, or not indexed */
    }
  }
  return null
}

export function useAleoTransaction() {
  const executeTransaction = useCallback(async (options: TransactionOptions): Promise<TransactionResult> => {
    try {
      const r = await executeAleoCall(options)
      return { transactionId: r.transactionId }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      devWarn('[NEAR tx] failed:', options.function, msg)
      throw err instanceof Error ? err : new Error(msg)
    }
  }, [])

  const pollTransactionStatus = useCallback(
    async (
      txId: string,
      onStatusChange: (status: TxStatus, onChainTxId?: string) => void,
      _maxAttempts = 30,
      _intervalMs = 10_000,
      onChainVerify?: () => Promise<boolean>,
    ): Promise<void> => {
      const known = knownTxOutcome(txId)
      if (known) {
        onStatusChange(known === 'accepted' ? 'confirmed' : 'failed', txId)
        return
      }
      const looked = await lookupOutcome(txId)
      if (looked) {
        onStatusChange(looked, txId)
        return
      }
      if (onChainVerify) {
        try {
          if (await onChainVerify()) {
            onStatusChange('confirmed', txId)
            return
          }
        } catch {
          /* fall through */
        }
      }
      onStatusChange('unknown', txId)
    },
    [],
  )

  return { executeTransaction, pollTransactionStatus }
}
