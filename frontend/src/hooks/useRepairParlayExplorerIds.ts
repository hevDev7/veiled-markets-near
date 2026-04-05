import { useEffect, useRef } from 'react'
import type { ParlayRecord } from '@/lib/parlay-store'
import {
  findParlayTicketRecord,
  getParlayExplorerTransactionId,
} from '@/lib/parlay-helpers'
import { lookupWalletTransactionStatus } from '@/lib/wallet'
import { devWarn } from '@/lib/logger'

interface UseRepairParlayExplorerIdsParams {
  parlays: ParlayRecord[]
  patchParlay: (parlayId: string, patch: Partial<ParlayRecord>) => void
  walletAddress?: string
}

export function useRepairParlayExplorerIds({
  parlays,
  patchParlay,
  walletAddress,
}: UseRepairParlayExplorerIdsParams) {
  const attemptedRefs = useRef<Set<string>>(new Set())

  useEffect(() => {
    const candidates = parlays.filter((parlay) =>
      !parlay.ownerAddress || (parlay.txId && !getParlayExplorerTransactionId(parlay.txId)),
    )

    if (candidates.length === 0) return

    let cancelled = false

    const repair = async () => {
      for (const parlay of candidates) {
        const candidateTxId = parlay.txId

        const attemptKey = `${parlay.id}:${candidateTxId ?? 'no_tx'}:${walletAddress ?? 'no_wallet'}`
        if (attemptedRefs.current.has(attemptKey)) continue
        attemptedRefs.current.add(attemptKey)

        try {
          const ticketRecord = await findParlayTicketRecord(parlay)
          const ticketTxId = getParlayExplorerTransactionId(ticketRecord?.transactionId)

          if (!cancelled && (ticketTxId || ticketRecord?.parlayId || ticketRecord?.ticketNonce)) {
            patchParlay(parlay.id, {
              txId: ticketTxId ?? parlay.txId,
              ownerAddress: parlay.ownerAddress ?? walletAddress,
              onChainParlayId: parlay.onChainParlayId ?? ticketRecord?.parlayId,
              ticketNonce: parlay.ticketNonce ?? ticketRecord?.ticketNonce,
            })
            if (ticketTxId && candidateTxId && ticketTxId !== candidateTxId) {
              continue
            }
          }

          if (!candidateTxId) continue

          const status = await lookupWalletTransactionStatus(candidateTxId)
          const resolvedTxId = getParlayExplorerTransactionId(status?.transactionId)

          if (!cancelled && resolvedTxId && resolvedTxId !== candidateTxId) {
            patchParlay(parlay.id, { txId: resolvedTxId })
          }
        } catch (error) {
          devWarn('[Parlay] Failed to repair explorer transaction id:', error)
        }
      }
    }

    void repair()

    return () => {
      cancelled = true
    }
  }, [parlays, patchParlay, walletAddress])
}
