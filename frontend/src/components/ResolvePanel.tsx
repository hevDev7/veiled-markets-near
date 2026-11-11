import { motion } from 'framer-motion'
import {
  Lock,
  Gavel,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Clock,
  ArrowRight,
  Shield,
  Coins,
  Swords,
} from 'lucide-react'
import { useState, useEffect, useMemo } from 'react'
import { type Market, useWalletStore } from '@/lib/store'
import { useAleoTransaction } from '@/hooks/useAleoTransaction'
import { cn, getTokenSymbol } from '@/lib/utils'
import { devLog, devWarn } from '@/lib/logger'
import {
  buildCloseMarketInputs,
  buildCancelMarketInputs,
  buildSubmitOutcomeInputs as buildVoteOutcomeInputs,
  buildChallengeOutcomeInputs as buildDisputeInputs,
  buildFinalizeOutcomeInputs as buildFinalizeVotesInputs,
  getMarket,
  getMarketDispute,
  getMarketResolution,
  getCurrentBlockHeight,
  hasUserVotedOnMarket,
  MARKET_STATUS,
  type MarketResolutionData,
  getProgramIdForMarket,
} from '@/lib/aleo-client'
import { TransactionLink } from './TransactionLink'
import { config } from '@/lib/config'
import { getNearConfig, getNearVote } from '@/lib/near/chain'
import { currentAccountId } from '@/lib/near/near-wallet'
import { PUBLIC_CALL_GAS_MICRO } from '@/lib/near/config'

interface ResolvePanelProps {
  market: Market
  resolution: MarketResolutionData | null
  onResolutionChange?: () => void
}

type ResolveStep = 'close' | 'submit' | 'challenge' | 'disputed' | 'finalize' | 'cancel' | 'done'

// Resolution rules of the NEAR deployment. The panel reads the live values from get_config, and the executor
// attaches the on-chain bond amounts itself, so these defaults only cover the first render.
interface ResolutionRules { voteBond: bigint; minVoters: number; disputeMultiplier: bigint }
const DEFAULT_RULES: ResolutionRules = { voteBond: 100_000n, minVoters: 1, disputeMultiplier: 3n }
const nearAmount = (micro: bigint) => `${Number(micro) / 1_000_000} NEAR`

interface ParsedVoterBondReceipt {
  plaintext: string
  marketId: string | null
  votedOutcome: number | null
  owner: string | null
}

type BondIndicatorStatus = 'idle' | 'wallet_required' | 'checking' | 'claimable' | 'slashed' | 'claimed' | 'missing' | 'error'

interface BondIndicatorState {
  status: BondIndicatorStatus
  receipt: ParsedVoterBondReceipt | null
  message?: string
}

interface MarketReceiptScanResult {
  unspent: ParsedVoterBondReceipt | null
  spent: ParsedVoterBondReceipt | null
}

function parseVoterBondReceipt(text: string): ParsedVoterBondReceipt | null {
  const plaintext = String(text)
  if (!plaintext.includes('voted_outcome') || !plaintext.includes('bond_nonce')) return null

  const marketMatch = plaintext.match(/market_id:\s*([0-9]+field)/)
  const outcomeMatch = plaintext.match(/voted_outcome:\s*(\d+)u8/)
  const ownerMatch = plaintext.match(/owner:\s*(aleo1[a-z0-9]+)/)

  if (!marketMatch || !outcomeMatch) return null

  return {
    plaintext,
    marketId: marketMatch[1] ?? null,
    votedOutcome: Number(outcomeMatch[1]),
    owner: ownerMatch?.[1] ?? null,
  }
}

function isSpentRecord(record: any): boolean {
  return record?.spent === true
    || record?.is_spent === true
    || record?.isSpent === true
    || record?.status === 'spent'
    || record?.status === 'Spent'
    || record?.recordStatus === 'spent'
    || record?.recordStatus === 'Spent'
}

async function inspectVoterBondReceiptsForMarket(
  programId: string,
  marketId: string,
  logPrefix: string = '[ClaimBond]',
): Promise<MarketReceiptScanResult> {
  let matchedUnspent: ParsedVoterBondReceipt | null = null
  let matchedSpent: ParsedVoterBondReceipt | null = null
  const tryUseReceipt = (candidate: unknown, source: string, spent: boolean): boolean => {
    const parsed = parseVoterBondReceipt(String(candidate ?? ''))
    if (!parsed) return false
    if (parsed.marketId !== marketId) {
      devLog(`${logPrefix} Skipping ${source} receipt for different market:`, parsed.marketId)
      return false
    }
    if (spent) {
      if (!matchedSpent) {
        matchedSpent = parsed
        devLog(`${logPrefix} Found spent receipt from ${source} for market ${parsed.marketId}, outcome ${parsed.votedOutcome}`)
      }
      return Boolean(matchedUnspent)
    }
    matchedUnspent = parsed
    devLog(`${logPrefix} Matched unspent receipt from ${source} for market ${parsed.marketId}, outcome ${parsed.votedOutcome}`)
    return true
  }

  // NEAR: votes are public contract state, so the bond "receipt" is the account's get_vote entry.
  const account = await currentAccountId().catch(() => null)
  if (account) {
    const vote = await getNearVote(marketId, account)
    if (!vote) return { unspent: null, spent: null }
    const receipt: ParsedVoterBondReceipt = {
      plaintext: [
        '{',
        `  owner: ${account}.private,`,
        `  market_id: ${marketId}.private,`,
        `  voted_outcome: ${vote.outcome}u8.private,`,
        `  bond_amount: ${vote.bond}u64.private,`,
        '  bond_nonce: 0field.private,',
        '  _nonce: 0group.public',
        '}',
      ].join('\n'),
      marketId,
      votedOutcome: vote.outcome,
      owner: account,
    }
    devLog(`${logPrefix} NEAR vote for ${marketId}: outcome ${vote.outcome}, claimed ${vote.claimed}`)
    return vote.claimed ? { unspent: null, spent: receipt } : { unspent: receipt, spent: null }
  }

  const adapterFn = (window as any).__aleoRequestRecords
  if (!matchedUnspent && typeof adapterFn === 'function') {
    try {
      devLog(`${logPrefix} Strategy 1: adapter requestRecords(programId, true)`)
      const records = await adapterFn(programId, true)
      const arr = Array.isArray(records) ? records : (records?.records || [])
      devLog(`${logPrefix} Got ${arr.length} records, names:`, arr.map((r: any) => r?.recordName || '?').join(', '))
      for (const r of arr) {
        if (!r) continue
        const name = r?.recordName || r?.record_name || ''
        if (name !== 'VoterBondReceipt') continue
        const plain = r?.plaintext || r?.data || r?.value || ''
        if (tryUseReceipt(plain, 'adapter plaintext', isSpentRecord(r))) break
      }
    } catch (error) {
      devWarn(`${logPrefix} Strategy 1 failed:`, error)
    }
  }

  const shieldObj = (window as any).shield || (window as any).shieldWallet
  if (!matchedUnspent && shieldObj?.requestRecords) {
    try {
      devLog(`${logPrefix} Strategy 2: requestRecords + decrypt`)
      const records = await shieldObj.requestRecords(programId)
      const arr = Array.isArray(records) ? records : (records?.records || [])
      const decryptFn = (window as any).__aleoDecrypt
      for (const r of arr) {
        if (!r) continue
        const name = r?.recordName || r?.record_name || ''
        if (name !== 'VoterBondReceipt') continue
        const isSpent = isSpentRecord(r)
        const ciphertext = r?.recordCiphertext || r?.record_ciphertext || r?.ciphertext
        if (ciphertext && typeof decryptFn === 'function') {
          try {
            devLog(`${logPrefix} Decrypting VoterBondReceipt ciphertext...`)
            const decrypted = await decryptFn(String(ciphertext))
            if (tryUseReceipt(decrypted, 'decrypted ciphertext', isSpent)) break
          } catch (decryptError) {
            devWarn(`${logPrefix} Decrypt failed:`, decryptError)
          }
        }

        const plain = r?.plaintext || r?.data || r?.value || ''
        if (tryUseReceipt(plain, 'wallet plaintext', isSpent)) break
      }
    } catch (error) {
      devWarn(`${logPrefix} Strategy 2 failed:`, error)
    }
  }

  if (!matchedUnspent && !matchedSpent) {
    devLog(`${logPrefix} No VoterBondReceipt found for market:`, marketId)
  }

  return {
    unspent: matchedUnspent,
    spent: matchedSpent,
  }
}

export function ResolvePanel({ market, resolution, onResolutionChange }: ResolvePanelProps) {
  const { wallet, balanceStatus, refreshBalance } = useWalletStore()
  const { executeTransaction } = useAleoTransaction()

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [transactionId, setTransactionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedOutcome, setSelectedOutcome] = useState<number | null>(null)
  const [currentBlock, setCurrentBlock] = useState<bigint>(0n)
  const [bondIndicator, setBondIndicator] = useState<BondIndicatorState>({ status: 'idle', receipt: null })

  const tokenSymbol = getTokenSymbol(market.tokenType)
  const tokenTypeStr: 'NEAR' | 'USDCX' | 'USAD' = market.tokenType === 'USDCX' ? 'USDCX'
    : market.tokenType === 'USAD' ? 'USAD' : 'NEAR'
  const marketProgramId = getProgramIdForMarket(tokenTypeStr, market.programId)
  const numOutcomes = market.numOutcomes ?? 2
  const outcomeLabels = market.outcomeLabels ?? (numOutcomes === 2 ? ['Yes', 'No'] : Array.from({ length: numOutcomes }, (_, i) => `Outcome ${i + 1}`))

  // Fetch current block height
  useEffect(() => {
    let mounted = true
    const fetchBlock = async () => {
      try {
        const height = await getCurrentBlockHeight()
        if (mounted) setCurrentBlock(height)
      } catch {
        // ignore
      }
    }
    fetchBlock()
    const interval = setInterval(fetchBlock, 15_000)
    return () => { mounted = false; clearInterval(interval) }
  }, [])

  // Determine current step (v37: Status DISPUTED gates governance escalation)
  // Status flow: ACTIVE(1) → CLOSED(2) → PENDING_RESOLUTION(5) → PENDING_FINALIZATION(6) → RESOLVED(3)
  // Plus new path: PENDING_FINALIZATION(6) → DISPUTED(7) → RESOLVED(3) via governance
  const STATUS_PENDING_FINALIZATION = 6
  const STATUS_DISPUTED = 7
  const isPastResolutionDeadline = currentBlock > 0n && market.resolutionDeadline > 0n && currentBlock > market.resolutionDeadline
  const currentStep: ResolveStep = useMemo(() => {
    if (market.status === MARKET_STATUS.RESOLVED) return 'done'
    if (market.status === MARKET_STATUS.CANCELLED) return 'cancel'
    if (currentBlock > 0n && market.resolutionDeadline > 0n && currentBlock > market.resolutionDeadline) {
      return 'cancel'
    }
    // v37: STATUS_DISPUTED markets are locked until governance resolves them.
    // No claim/redeem allowed; UI directs user to the governance escalation path.
    if (market.status === STATUS_DISPUTED) return 'disputed'
    if (market.status === STATUS_PENDING_FINALIZATION) {
      // Dispute window — challenge_deadline is set to dispute_deadline when status=6
      // (see getMarketResolution: challengeDeadline = disputeDeadline when PENDING_FINALIZATION)
      if (resolution && currentBlock > 0n && resolution.challenge_deadline > 0n && currentBlock > resolution.challenge_deadline) {
        return 'finalize' // Dispute window passed → confirm_resolution
      }
      return 'challenge' // Within dispute window — can file dispute
    }
    if (market.status === MARKET_STATUS.PENDING_RESOLUTION) {
      // Voting phase — check if voting window passed with enough voters
      if (resolution && currentBlock > 0n && currentBlock > resolution.challenge_deadline) {
        return 'finalize' // Voting window passed → finalize_votes
      }
      return 'submit' // Still in voting window — can vote
    }
    if (market.status === MARKET_STATUS.CLOSED) return 'submit'
    return 'close' // ACTIVE but expired
  }, [market.status, market.resolutionDeadline, resolution, currentBlock])

  const canFinalize = resolution && currentBlock > resolution.challenge_deadline

  const [rules, setRules] = useState<ResolutionRules>(DEFAULT_RULES)
  useEffect(() => {
    let cancelled = false
    getNearConfig()
      .then((c) => {
        if (cancelled) return
        setRules({ voteBond: BigInt(c.vote_bond), minVoters: c.min_voters, disputeMultiplier: BigInt(c.dispute_bond_multiplier) })
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  // Resolution round info from on-chain data
  const roundInfo = useMemo(() => {
    if (!resolution) return null
    return {
      round: resolution.round || 1,
      proposer: resolution.proposer || resolution.resolver || 'unknown',
      bondAmount: resolution.bond_amount || rules.voteBond,
      totalBonded: resolution.total_bonded || rules.voteBond,
      proposedOutcome: resolution.proposed_outcome || resolution.winning_outcome,
    }
  }, [resolution, rules.voteBond])

  // The dispute bond the contract requires: dispute_bond_multiplier × the bonds already posted. Without tally data,
  // the smallest legal dispute (the minimum number of voters, each posting the vote bond).
  const minChallengeBond = roundInfo
    ? BigInt(roundInfo.totalBonded) * rules.disputeMultiplier
    : rules.voteBond * BigInt(rules.minVoters) * rules.disputeMultiplier

  // Challenge window countdown
  const challengeInfo = useMemo(() => {
    if (!resolution || currentBlock === 0n) return null
    const blocksLeft = resolution.challenge_deadline - currentBlock
    if (blocksLeft <= 0n) return { text: 'Challenge window ended', canFinalize: true, blocksLeft: 0n }
    const secondsLeft = Number(blocksLeft) * config.secondsPerBlock
    const hours = Math.floor(secondsLeft / 3600)
    const minutes = Math.floor((secondsLeft % 3600) / 60)
    return {
      text: `${hours}h ${minutes}m remaining (${blocksLeft.toString()} blocks)`,
      canFinalize: false,
      blocksLeft,
    }
  }, [resolution, currentBlock])

  const needsPrivateAleoBond = currentStep === 'submit' || currentStep === 'challenge'
  const shieldNeedsPrivateBondSync = wallet.walletType === 'shield'
    && needsPrivateAleoBond
    && !wallet.isDemoMode
    && wallet.balance.private < rules.voteBond

  const refreshShieldPrivateBalance = async () => {
    try {
      await refreshBalance()
    } catch {
      // Refresh failures are surfaced through the shared wallet store state.
    }
  }

  useEffect(() => {
    let cancelled = false

    if (currentStep !== 'done' || market.status !== MARKET_STATUS.RESOLVED || !resolution) {
      setBondIndicator({ status: 'idle', receipt: null })
      return () => { cancelled = true }
    }

    if (!wallet.connected || !wallet.address) {
      setBondIndicator({
        status: 'wallet_required',
        receipt: null,
        message: 'Connect your wallet to check whether your bond is claimable or slashed.',
      })
      return () => { cancelled = true }
    }

    setBondIndicator({ status: 'checking', receipt: null })

    ;(async () => {
      try {
        const receipt = await inspectVoterBondReceiptsForMarket(
          marketProgramId,
          market.id,
          '[BondStatus]',
        )

        if (cancelled) return

        if (receipt.unspent?.votedOutcome === resolution.winning_outcome) {
          setBondIndicator({ status: 'claimable', receipt: receipt.unspent })
          return
        }

        if (receipt.unspent) {
          setBondIndicator({ status: 'slashed', receipt: receipt.unspent })
          return
        }

        if (receipt.spent) {
          setBondIndicator({
            status: 'claimed',
            receipt: receipt.spent,
            message: 'This bond receipt has already been spent in a successful claim.',
          })
          return
        }

        if (!receipt.unspent && !receipt.spent) {
          setBondIndicator({
            status: 'missing',
            receipt: null,
            message: 'This wallet does not have a VoterBondReceipt for this market.',
          })
          return
        }
      } catch (err) {
        if (cancelled) return
        console.error('[BondStatus] Failed to inspect voter bond receipt:', err)
        setBondIndicator({
          status: 'error',
          receipt: null,
          message: 'Bond status could not be checked automatically. Try reconnecting your wallet and refreshing the page.',
        })
      }
    })()

    return () => { cancelled = true }
  }, [
    currentStep,
    market.id,
    market.status,
    resolution,
    marketProgramId,
    wallet.connected,
    wallet.address,
  ])

  // Steps config — order matches contract semantics:
  //   ACTIVE → Close → CLOSED → Vote → PENDING_RESOLUTION → Finalize →
  //   PENDING_FINALIZATION → [Dispute (optional) → STATUS_DISPUTED → governance]
  //   or                    → [no dispute → Finalize again calls confirm_resolution] → RESOLVED
  // Cancel is a separate alternative path (creator early-cancel or emergency cancel
  // past resolution_deadline) and is shown last.
  const steps: { key: ResolveStep; label: string; icon: React.ElementType }[] = [
    { key: 'close', label: 'Close', icon: Lock },
    { key: 'submit', label: 'Vote', icon: Gavel },
    { key: 'finalize', label: 'Finalize', icon: CheckCircle2 },
    { key: 'challenge', label: 'Dispute', icon: Shield },
    { key: 'cancel', label: 'Cancel', icon: AlertCircle },
  ]

  const handleCloseMarket = async () => {
    setIsSubmitting(true)
    setError(null)
    try {
      const inputs = buildCloseMarketInputs(market.id)
      const result = await executeTransaction({
        program: marketProgramId,
        function: 'close_market',
        inputs,
        fee: 1.5,
      })
      if (result?.transactionId) {
        setTransactionId(result.transactionId)
        onResolutionChange?.()
      } else {
        throw new Error('No transaction ID returned from wallet')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to close market')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSubmitOutcome = async () => {
    if (!selectedOutcome) return
    setIsSubmitting(true)
    setError(null)
    try {
      if (!wallet.address) {
        throw new Error('Wallet address not available. Reconnect your wallet and try again.')
      }

      const [onChainMarket, onChainResolution, onChainBlock] = await Promise.all([
        getMarket(market.id, marketProgramId),
        getMarketResolution(market.id, marketProgramId),
        getCurrentBlockHeight(),
      ])

      if (!onChainMarket) {
        throw new Error('Market data could not be loaded from chain. Please refresh and try again.')
      }

      if (selectedOutcome < 1 || selectedOutcome > onChainMarket.num_outcomes) {
        throw new Error(`Outcome ${selectedOutcome} is invalid for this market.`)
      }

      const canVoteNow =
        onChainMarket.status === MARKET_STATUS.CLOSED
        || onChainMarket.status === MARKET_STATUS.PENDING_RESOLUTION
        || (onChainMarket.status === MARKET_STATUS.ACTIVE && onChainBlock > onChainMarket.deadline)

      if (!canVoteNow) {
        throw new Error(
          `vote_outcome is not open yet. Market status=${onChainMarket.status}, ` +
          `current block=${onChainBlock.toString()}, deadline=${onChainMarket.deadline.toString()}.`
        )
      }

      if (onChainBlock > onChainMarket.resolution_deadline) {
        throw new Error(
          `Resolution deadline already passed at block ${onChainMarket.resolution_deadline.toString()}. ` +
          `vote_outcome can no longer be submitted.`
        )
      }

      if (
        onChainMarket.status === MARKET_STATUS.PENDING_RESOLUTION
        && onChainResolution
        && onChainResolution.challenge_deadline > 0n
        && onChainBlock > onChainResolution.challenge_deadline
      ) {
        throw new Error(
          `Voting window already ended at block ${onChainResolution.challenge_deadline.toString()}. ` +
          `Use finalize_votes instead of vote_outcome.`
        )
      }

      // Precheck: contract enforces one vote per (market_id, voter). If we
      // submit a second time the on-chain finalize will reject the tx, so
      // surface a clear message before opening the wallet popup.
      const alreadyVoted = await hasUserVotedOnMarket(market.id, wallet.address, marketProgramId)
      if (alreadyVoted) {
        throw new Error(
          'You have already voted on this market with this wallet. Each address can only submit one vote per market — switch wallets to add another vote, or wait for the voting window to end.'
        )
      }

      const publicFeeRequired = PUBLIC_CALL_GAS_MICRO
      if (!wallet.isDemoMode && wallet.balance.public < publicFeeRequired) {
        throw new Error(
          `Insufficient public NEAR for gas. vote_outcome needs about 0.01 NEAR for gas, ` +
          `but only ${Number(wallet.balance.public) / 1_000_000} NEAR is public in your wallet.`
        )
      }

      // A vote is a public call: the bond is attached from the wallet's NEAR balance.
      if (!wallet.isDemoMode && wallet.balance.public < rules.voteBond + publicFeeRequired) {
        throw new Error(
          `Voting attaches a ${nearAmount(rules.voteBond)} bond from your wallet, plus about 0.01 NEAR for gas. ` +
          `Your wallet holds ${nearAmount(wallet.balance.public)}.`
        )
      }

      const bondNonce = `${Date.now()}field`
      const result = await executeTransaction({
        program: marketProgramId,
        function: 'vote_outcome',
        inputs: buildVoteOutcomeInputs(market.id, selectedOutcome, bondNonce),
        fee: 1.5,
      })
      if (result?.transactionId) {
        setTransactionId(result.transactionId)
        onResolutionChange?.()
      } else {
        throw new Error('No transaction ID returned from wallet')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit outcome')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleChallengeOutcome = async () => {
    if (!selectedOutcome) return
    setIsSubmitting(true)
    setError(null)
    try {
      if (!wallet.address) {
        throw new Error('Wallet address not available. Reconnect your wallet and try again.')
      }

      // Re-fetch on-chain market status to avoid stale UI state. dispute_resolution
      // is only valid when market is in STATUS_PENDING_FINALIZATION (6). Calling it
      // during PENDING_RESOLUTION (5, voting phase) always rejects on-chain.
      const [onChainMarket, onChainTally, onChainBlock] = await Promise.all([
        getMarket(market.id, marketProgramId),
        getMarketResolution(market.id, marketProgramId),
        getCurrentBlockHeight(),
      ])
      if (!onChainMarket) {
        throw new Error('Market data could not be loaded from chain. Refresh and try again.')
      }
      if (onChainMarket.status !== MARKET_STATUS.PENDING_FINALIZATION) {
        if (onChainMarket.status === MARKET_STATUS.PENDING_RESOLUTION) {
          throw new Error(
            'This market is still in the voting phase. Use Vote (vote_outcome) instead — disputes only open after the voting window is finalized.'
          )
        }
        throw new Error(
          `Market is not in the dispute window (status=${onChainMarket.status}). dispute_resolution is rejected outside PENDING_FINALIZATION.`
        )
      }
      if (onChainTally && onChainTally.challenge_deadline > 0n && onChainBlock > onChainTally.challenge_deadline) {
        throw new Error(
          `Dispute window already ended at block ${onChainTally.challenge_deadline.toString()}. Use confirm_resolution / finalize instead.`
        )
      }
      if (onChainTally && onChainTally.winning_outcome === selectedOutcome) {
        throw new Error(
          'You must dispute with a DIFFERENT outcome than the current winning outcome. Pick another option.'
        )
      }

      const publicFeeRequired = PUBLIC_CALL_GAS_MICRO
      if (!wallet.isDemoMode && wallet.balance.public < publicFeeRequired) {
        throw new Error(
          `Insufficient public NEAR for gas. dispute_resolution needs about 0.01 NEAR for gas, ` +
          `but only ${Number(wallet.balance.public) / 1_000_000} NEAR is public in your wallet.`
        )
      }

      // A dispute is a public call: the executor attaches the bond the contract requires from the wallet.
      const bondAmount = minChallengeBond
      if (!wallet.isDemoMode && wallet.balance.public < bondAmount + publicFeeRequired) {
        throw new Error(
          `Disputing attaches a ${nearAmount(bondAmount)} bond from your wallet ` +
          `(${rules.disputeMultiplier.toString()}× the bonds already posted), plus about 0.01 NEAR for gas. ` +
          `Your wallet holds ${nearAmount(wallet.balance.public)}.`
        )
      }

      const bondNonce = `${Date.now()}field`
      const result = await executeTransaction({
        program: marketProgramId,
        function: 'dispute_resolution',
        inputs: buildDisputeInputs(market.id, selectedOutcome, bondAmount, bondNonce),
        fee: 1.5,
      })
      if (result?.transactionId) {
        setTransactionId(result.transactionId)
        onResolutionChange?.()
      } else {
        throw new Error('No transaction ID returned from wallet')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to challenge outcome')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEmergencyCancel = async () => {
    setIsSubmitting(true)
    setError(null)
    try {
      const publicFeeRequired = PUBLIC_CALL_GAS_MICRO
      if (!wallet.isDemoMode && wallet.balance.public < publicFeeRequired) {
        throw new Error(
          `Insufficient public NEAR for gas. cancel_market needs about 0.01 NEAR for gas, ` +
          `but only ${Number(wallet.balance.public) / 1_000_000} NEAR is public in your wallet.`
        )
      }

      const inputs = buildCancelMarketInputs(market.id)
      const result = await executeTransaction({
        program: marketProgramId,
        function: 'cancel_market',
        inputs,
        fee: 1.5,
      })
      if (result?.transactionId) {
        setTransactionId(result.transactionId)
        onResolutionChange?.()
      } else {
        throw new Error('No transaction ID returned from wallet')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to cancel market')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleFinalizeOutcome = async () => {
    setIsSubmitting(true)
    setError(null)
    try {
      const [onChainMarket, onChainResolution, onChainDispute, onChainBlock] = await Promise.all([
        getMarket(market.id, marketProgramId),
        getMarketResolution(market.id, marketProgramId),
        getMarketDispute(market.id, marketProgramId),
        getCurrentBlockHeight(),
      ])

      if (!onChainMarket) {
        throw new Error('Market data could not be loaded from chain. Please refresh and try again.')
      }

      const inputs = buildFinalizeVotesInputs(market.id)
      let fnName: 'finalize_votes' | 'confirm_resolution'

      if (onChainMarket.status === STATUS_PENDING_FINALIZATION) {
        if (!onChainResolution) {
          throw new Error('Dispute window data is missing on-chain. Refresh the market and try again.')
        }
        if (onChainBlock <= onChainResolution.challenge_deadline) {
          throw new Error(
            `Dispute window is still open until block ${onChainResolution.challenge_deadline.toString()}. ` +
            'confirm_resolution will be rejected until that window ends.'
          )
        }
        fnName = 'confirm_resolution'
      } else if (onChainMarket.status === MARKET_STATUS.PENDING_RESOLUTION) {
        if (!onChainResolution) {
          throw new Error('Voting tally is missing on-chain. Refresh the market and try again.')
        }
        if (onChainBlock <= onChainResolution.challenge_deadline) {
          throw new Error(
            `Voting window is still open until block ${onChainResolution.challenge_deadline.toString()}. ` +
            'finalize_votes will be rejected until that window ends.'
          )
        }
        if ((onChainResolution.round || 0) < rules.minVoters) {
          throw new Error(
            `finalize_votes requires at least ${rules.minVoters} voters on-chain, ` +
            `but this market currently has only ${onChainResolution.round || 0}.`
          )
        }
        fnName = 'finalize_votes'
      } else if (onChainMarket.status === MARKET_STATUS.RESOLVED) {
        throw new Error('This market is already fully resolved on-chain.')
      } else if (onChainMarket.status === MARKET_STATUS.CANCELLED) {
        throw new Error('This market was cancelled on-chain and can no longer be finalized.')
      } else {
        throw new Error(
          `Finalize is not available from market status ${onChainMarket.status}. ` +
          'Refresh the market state and make sure the market is already in voting or finalization phase.'
        )
      }

      if (fnName === 'confirm_resolution' && onChainDispute) {
        throw new Error(
          `confirm_resolution will be rejected because a dispute is still recorded on-chain ` +
          `(outcome ${onChainDispute.proposed_outcome}).`
        )
      }

      const result = await executeTransaction({
        program: marketProgramId,
        function: fnName,
        inputs,
        fee: 1.5,
      })
      if (result?.transactionId) {
        setTransactionId(result.transactionId)
        onResolutionChange?.()
      } else {
        throw new Error('No transaction ID returned from wallet')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to finalize outcome')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClaimVoterBond = async () => {
    devLog('[ClaimBond] Starting claim for market:', market.id)
    setIsSubmitting(true)
    setError(null)
    try {
      const programId = marketProgramId
      devLog('[ClaimBond] Program:', programId)

      let matchedReceipt: ParsedVoterBondReceipt | null = bondIndicator.receipt
      if (!matchedReceipt) {
        const receiptScan = await inspectVoterBondReceiptsForMarket(programId, market.id, '[ClaimBond]')
        matchedReceipt = receiptScan.unspent
        if (!matchedReceipt && receiptScan.spent) {
          setBondIndicator({
            status: 'claimed',
            receipt: receiptScan.spent,
            message: 'This bond receipt has already been spent in a successful claim.',
          })
          throw new Error('This bond has already been claimed.')
        }
      }

      const receiptRecord = matchedReceipt?.plaintext ?? null

      if (!receiptRecord) {
        setBondIndicator({
          status: 'missing',
          receipt: null,
          message: 'This wallet does not have a VoterBondReceipt for this market.',
        })
        throw new Error('No VoterBondReceipt for this market was found in your wallet. If you voted from another wallet, already claimed, or only have receipts from other NEAR markets, this claim will fail.')
      }

      if (
        matchedReceipt?.votedOutcome != null
        && resolution
        && market.status === MARKET_STATUS.RESOLVED
        && matchedReceipt.votedOutcome !== resolution.winning_outcome
      ) {
        setBondIndicator({ status: 'slashed', receipt: matchedReceipt })
        throw new Error(
          `Your recorded vote was ${getOutcomeLabel(matchedReceipt.votedOutcome)}, but the resolved winner is ${getOutcomeLabel(resolution.winning_outcome)}. Losing voter bonds are slashed and cannot be claimed.`
        )
      }

      if (matchedReceipt) {
        setBondIndicator({ status: 'claimable', receipt: matchedReceipt })
      }

      devLog('[ClaimBond] Submitting claim_voter_bond')
      const result = await executeTransaction({
        program: programId,
        function: 'claim_voter_bond',
        inputs: [receiptRecord],
        fee: 1.5,
        recordIndices: [0],
      })
      if (result?.transactionId) {
        setTransactionId(result.transactionId)
        onResolutionChange?.()
      } else {
        throw new Error('No transaction ID returned from wallet')
      }
    } catch (err: unknown) {
      devWarn('[ClaimBond] Error:', err)
      setError(err instanceof Error ? err.message : 'Failed to claim voter bond')
    } finally {
      setIsSubmitting(false)
    }
  }

  const resetState = () => {
    setTransactionId(null)
    setError(null)
    setSelectedOutcome(null)
    onResolutionChange?.()
  }

  const outcomeColors = [
    'bg-yes-500/10 border-yes-500/30 text-yes-400',
    'bg-no-500/10 border-no-500/30 text-no-400',
    'bg-purple-500/10 border-purple-500/30 text-purple-400',
    'bg-yellow-500/10 border-yellow-500/30 text-yellow-400',
  ]
  const getOutcomeLabel = (outcomeNum?: number | null): string => {
    if (!outcomeNum || outcomeNum < 1) return 'Pending'
    return outcomeLabels[outcomeNum - 1] || `Outcome ${outcomeNum}`
  }
  const votedOutcomeLabel = bondIndicator.receipt?.votedOutcome
    ? getOutcomeLabel(bondIndicator.receipt.votedOutcome)
    : null
  const winningOutcomeLabel = resolution?.winning_outcome
    ? getOutcomeLabel(resolution.winning_outcome)
    : null
  const claimButtonDisabled = isSubmitting
    || !wallet.address
    || bondIndicator.status === 'checking'
    || bondIndicator.status === 'slashed'
    || bondIndicator.status === 'claimed'

  return (
    <div className="glass-card overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-white/[0.04]">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center">
            <Gavel className="w-5 h-5 text-brand-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Open Resolution Flow</h3>
            <p className="text-sm text-surface-400">Close, vote, dispute, finalize, or emergency-cancel based on the current on-chain phase.</p>
          </div>
        </div>

        {/* Step Progress */}
        <div className="flex items-center gap-1">
          {steps.map((s, idx) => {
            const StepIcon = s.icon
            const stepOrder = ['close', 'submit', 'challenge', 'finalize', 'cancel', 'done']
            const currentIdx = stepOrder.indexOf(currentStep)
            const stepIdx = stepOrder.indexOf(s.key)
            const isComplete = currentStep === 'done' || stepIdx < currentIdx
            const isCurrent = currentStep === s.key || (currentStep === 'challenge' && s.key === 'challenge')
            return (
              <div key={s.key} className="flex items-center gap-1 flex-1">
                <div className={cn(
                  'flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium flex-1',
                  isComplete ? 'bg-yes-500/10 text-yes-400' :
                  isCurrent ? 'bg-brand-500/10 text-brand-400 ring-1 ring-brand-500/30' :
                  'bg-white/[0.02] text-surface-500'
                )}>
                  <StepIcon className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate">{s.label}</span>
                </div>
                {idx < steps.length - 1 && (
                  <ArrowRight className={cn(
                    'w-3 h-3 flex-shrink-0',
                    isComplete ? 'text-yes-500' : 'text-surface-700'
                  )} />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {/* Transaction success */}
        {transactionId ? (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
            <div className="w-16 h-16 rounded-full bg-yes-500/20 mx-auto mb-4 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-yes-400" />
            </div>
            <h4 className="text-lg font-semibold text-white mb-2">Transaction Submitted</h4>
            <p className="text-sm text-surface-400 mb-3">Please wait for on-chain confirmation (1-3 minutes).</p>
            <TransactionLink transactionId={transactionId} className="mb-4" showCopy={true} showNote={true} />
            <button onClick={resetState} className="btn-secondary w-full mt-4">Continue</button>
          </motion.div>
        ) : currentStep === 'done' ? (
          /* Fully resolved — show claim voter bond */
          <div className="space-y-4">
            <div className="text-center py-4">
              <div className="w-14 h-14 rounded-full bg-yes-500/10 flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 className="w-7 h-7 text-yes-400" />
              </div>
              <h4 className="text-lg font-semibold text-white mb-1">Market Resolved</h4>
              {resolution && (
                <p className="text-surface-400 text-sm">
                  Winning outcome: <span className="text-white font-medium">
                    {getOutcomeLabel(resolution.winning_outcome)}
                  </span>
                </p>
              )}
            </div>

            {/* Claim Voter Bond */}
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04] space-y-3">
              <div className="flex items-center gap-2">
                <Coins className="w-4 h-4 text-brand-400" />
                <span className="text-sm font-medium text-white">Claim Voter Bond</span>
              </div>
              <p className="text-xs text-surface-400">
                If you voted on the winning outcome, claim your {nearAmount(rules.voteBond)} bond back.
                Wrong voters' bonds are forfeited (slashed).
              </p>
              {bondIndicator.status === 'checking' && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-brand-500/5 border border-brand-500/20">
                  <Loader2 className="w-4 h-4 text-brand-400 flex-shrink-0 mt-0.5 animate-spin" />
                  <div>
                    <p className="text-xs font-medium text-brand-300">Checking bond status...</p>
                    <p className="text-xs text-surface-400 mt-1">We are looking for the vote receipt for this market in your wallet.</p>
                  </div>
                </div>
              )}
              {bondIndicator.status === 'claimable' && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-yes-500/5 border border-yes-500/20">
                  <CheckCircle2 className="w-4 h-4 text-yes-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-yes-300">Bond can be claimed</p>
                    <p className="text-xs text-surface-400 mt-1">
                      Your vote: <span className="text-white">{votedOutcomeLabel}</span>. Final outcome: <span className="text-white">{winningOutcomeLabel}</span>.
                    </p>
                  </div>
                </div>
              )}
              {bondIndicator.status === 'slashed' && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-no-500/5 border border-no-500/20">
                  <AlertCircle className="w-4 h-4 text-no-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-no-300">Bond was slashed</p>
                    <p className="text-xs text-surface-400 mt-1">
                      Your vote: <span className="text-white">{votedOutcomeLabel}</span>. Final outcome: <span className="text-white">{winningOutcomeLabel}</span>.
                    </p>
                  </div>
                </div>
              )}
              {bondIndicator.status === 'claimed' && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-yes-500/5 border border-yes-500/20">
                  <CheckCircle2 className="w-4 h-4 text-yes-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-yes-300">Bond already claimed</p>
                    <p className="text-xs text-surface-400 mt-1">
                      Your vote: <span className="text-white">{votedOutcomeLabel}</span>. Final outcome: <span className="text-white">{winningOutcomeLabel}</span>.
                    </p>
                  </div>
                </div>
              )}
              {bondIndicator.status === 'wallet_required' && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/20">
                  <Shield className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-yellow-300">Connect wallet to check bond</p>
                    <p className="text-xs text-surface-400 mt-1">{bondIndicator.message}</p>
                  </div>
                </div>
              )}
              {bondIndicator.status === 'missing' && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/20">
                  <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-yellow-300">Bond receipt not found</p>
                    <p className="text-xs text-surface-400 mt-1">
                      {bondIndicator.message} If you are sure you voted, try reconnecting your wallet and refreshing the page.
                    </p>
                  </div>
                </div>
              )}
              {bondIndicator.status === 'error' && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/20">
                  <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-yellow-300">Bond status not yet verified</p>
                    <p className="text-xs text-surface-400 mt-1">{bondIndicator.message}</p>
                  </div>
                </div>
              )}
              {roundInfo && (
                <div className="flex justify-between text-xs text-surface-500">
                  <span>Total Voters</span>
                  <span className="text-white">{roundInfo.round}</span>
                </div>
              )}
              {roundInfo && (
                <div className="flex justify-between text-xs text-surface-500">
                  <span>Total Bonded</span>
                  <span className="text-white font-mono">{Number(roundInfo.totalBonded) / 1_000_000} NEAR</span>
                </div>
              )}
              <button
                onClick={handleClaimVoterBond}
                disabled={claimButtonDisabled}
                className={cn(
                  'w-full flex items-center justify-center gap-2 btn-primary',
                  claimButtonDisabled && 'opacity-60 cursor-not-allowed',
                )}
              >
                {isSubmitting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /><span>Claiming...</span></>
                ) : bondIndicator.status === 'checking' ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /><span>Checking Bond...</span></>
                ) : bondIndicator.status === 'slashed' ? (
                  <><AlertCircle className="w-4 h-4" /><span>Bond Slashed</span></>
                ) : bondIndicator.status === 'claimed' ? (
                  <><CheckCircle2 className="w-4 h-4" /><span>Bond Claimed</span></>
                ) : !wallet.address ? (
                  <><Shield className="w-4 h-4" /><span>Connect Wallet</span></>
                ) : (
                  <><Coins className="w-4 h-4" /><span>Claim {nearAmount(rules.voteBond)} Bond</span></>
                )}
              </button>
            </div>

            <p className="text-xs text-surface-500 text-center">
              Winners can also redeem shares 1:1 for {tokenSymbol} in the Trade tab.
            </p>
          </div>
        ) : (
          <>
            {/* Step 1: Close Market */}
            {currentStep === 'close' && (
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 rounded-xl bg-white/[0.02]">
                  <Lock className="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-white">Close Trading</p>
                    <p className="text-xs text-surface-400 mt-1">
                      Stops all trading. Anyone can call this after the deadline.
                    </p>
                  </div>
                </div>

                {currentBlock > 0n && market.deadline > 0n && currentBlock <= market.deadline && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                    <Clock className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-yellow-300">
                      Trading deadline not passed. Block {currentBlock.toString()} / {market.deadline.toString()}.
                    </p>
                  </div>
                )}

                <button onClick={handleCloseMarket} disabled={isSubmitting} className="w-full flex items-center justify-center gap-2 btn-primary">
                  {isSubmitting ? <><Loader2 className="w-5 h-5 animate-spin" /><span>Confirm in Wallet...</span></> : <><Lock className="w-5 h-5" /><span>Close Market</span></>}
                </button>
              </div>
            )}

            {/* Step 2: Vote Outcome (Open Voting + Bond) */}
            {currentStep === 'submit' && (
              <div className="space-y-4">
                {shieldNeedsPrivateBondSync && (
                  <div className="flex items-start gap-3 p-4 rounded-xl bg-yellow-500/5 border border-yellow-500/20">
                    <Shield className="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-yellow-300">Shield private bond not detected yet</p>
                      <p className="text-xs text-surface-400 mt-1">
                        vote_outcome needs a private NEAR bond record. If Shield has not finished syncing `credits.aleo`,
                        clicking submit will stop before the wallet confirmation popup appears.
                      </p>
                      <button
                        onClick={refreshShieldPrivateBalance}
                        disabled={balanceStatus === 'refreshing' || isSubmitting}
                        className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 text-xs font-medium hover:bg-yellow-500/15 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {balanceStatus === 'refreshing' ? (
                          <><Loader2 className="w-3.5 h-3.5 animate-spin" /><span>Refreshing Shield balance...</span></>
                        ) : (
                          <><Clock className="w-3.5 h-3.5" /><span>Refresh Private NEAR</span></>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* Show voting status if votes already exist */}
                {roundInfo && roundInfo.totalBonded > 0n && (
                  <div className="p-4 rounded-xl bg-white/[0.02] space-y-2">
                    <div className="flex items-center gap-2 mb-2">
                      <Gavel className="w-4 h-4 text-brand-400" />
                      <span className="text-sm font-medium text-white">Voting in Progress</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-surface-400">Total Voters</span>
                      <span className="text-white font-medium">{roundInfo.round} / {rules.minVoters} minimum</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-surface-400">Total Bonded</span>
                      <span className="text-white font-mono">{Number(roundInfo.totalBonded) / 1_000_000} NEAR</span>
                    </div>
                    {challengeInfo && (
                      <div className="flex justify-between text-sm">
                        <span className="text-surface-400">Voting Deadline</span>
                        <span className={cn('font-medium', challengeInfo.canFinalize ? 'text-yes-400' : 'text-yellow-400')}>
                          {challengeInfo.text}
                        </span>
                      </div>
                    )}
                    {roundInfo.round >= 3 && challengeInfo && !challengeInfo.canFinalize && (
                      <div className="flex items-start gap-2 p-3 mt-2 rounded-lg bg-yes-500/5 border border-yes-500/20">
                        <CheckCircle2 className="w-4 h-4 text-yes-400 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-yes-300">
                          Quorum reached (3+ voters). After voting deadline passes, anyone can call Finalize.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-start gap-3 p-4 rounded-xl bg-white/[0.02]">
                  <Gavel className="w-5 h-5 text-brand-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-white">Vote Outcome</p>
                    <p className="text-xs text-surface-400 mt-1">
                      Anyone can vote on the winning outcome with a <span className="text-white font-medium">{nearAmount(rules.voteBond)} bond</span>.
                      {rules.minVoters === 1 ? 'One vote is enough' : `${rules.minVoters} voters are required`} before the market can advance. Wrong voters lose their bonds, and a disputed result goes to the committee.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 p-3 rounded-lg bg-brand-500/5 border border-brand-500/20">
                  <Shield className="w-4 h-4 text-brand-400 flex-shrink-0" />
                  <p className="text-xs text-brand-300">
                    Bond: <span className="font-mono font-medium">{nearAmount(rules.voteBond)}</span> (returned if your outcome wins)
                  </p>
                </div>

                {/* Outcome selection */}
                <div>
                  <label className="block text-sm text-surface-400 mb-2">Select Winning Outcome</label>
                  <div className="space-y-2">
                    {outcomeLabels.map((label, i) => {
                      const outcomeNum = i + 1
                      const isSelected = selectedOutcome === outcomeNum
                      const colorIdx = Math.min(i, 3)
                      return (
                        <button key={outcomeNum} onClick={() => setSelectedOutcome(outcomeNum)}
                          className={cn(
                            'w-full p-3 rounded-xl border text-left transition-all flex items-center justify-between',
                            isSelected ? 'bg-brand-500/10 border-brand-500/40 ring-1 ring-brand-500/20' : 'bg-white/[0.02] border-white/[0.06] hover:border-surface-600/50'
                          )}>
                          <span className={cn('px-2 py-0.5 text-xs font-medium rounded-full border', outcomeColors[colorIdx])}>{label}</span>
                          {isSelected && <CheckCircle2 className="w-4 h-4 text-brand-400" />}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <button onClick={handleSubmitOutcome} disabled={isSubmitting || !selectedOutcome}
                  className={cn('w-full flex items-center justify-center gap-2 btn-primary', !selectedOutcome && 'opacity-50 cursor-not-allowed')}>
                  {isSubmitting ? <><Loader2 className="w-5 h-5 animate-spin" /><span>Confirm in Wallet...</span></> : <><Gavel className="w-5 h-5" /><span>{selectedOutcome ? `Vote: ${outcomeLabels[selectedOutcome - 1]} Wins (1 NEAR bond)` : 'Select Outcome'}</span></>}
                </button>
              </div>
            )}

            {/* Step 3: Dispute Window (status 6 = PENDING_FINALIZATION) */}
            {currentStep === 'challenge' && (
              <div className="space-y-4">
                {shieldNeedsPrivateBondSync && (
                  <div className="flex items-start gap-3 p-4 rounded-xl bg-yellow-500/5 border border-yellow-500/20">
                    <Shield className="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-yellow-300">Shield private dispute bond not detected yet</p>
                      <p className="text-xs text-surface-400 mt-1">
                        dispute_resolution needs a private NEAR bond record. If Shield has not finished syncing `credits.aleo`,
                        clicking dispute will stop before the wallet confirmation popup appears.
                      </p>
                      <button
                        onClick={refreshShieldPrivateBalance}
                        disabled={balanceStatus === 'refreshing' || isSubmitting}
                        className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 text-xs font-medium hover:bg-yellow-500/15 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {balanceStatus === 'refreshing' ? (
                          <><Loader2 className="w-3.5 h-3.5 animate-spin" /><span>Refreshing Shield balance...</span></>
                        ) : (
                          <><Clock className="w-3.5 h-3.5" /><span>Refresh Private NEAR</span></>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* Finalized vote result */}
                {roundInfo && (
                  <div className="p-4 rounded-xl bg-white/[0.02] space-y-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Shield className="w-4 h-4 text-purple-400" />
                      <span className="text-sm font-medium text-white">Dispute Window — Vote Result Pending Confirmation</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-surface-400">Winning Outcome</span>
                      <span className="text-yes-400 font-medium">
                        {getOutcomeLabel(roundInfo.proposedOutcome)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-surface-400">Total Voters</span>
                      <span className="text-white font-medium">{roundInfo.round}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-surface-400">Total Bonded</span>
                      <span className="text-white font-mono">{Number(roundInfo.totalBonded) / 1_000_000} NEAR</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-surface-400">Dispute Deadline</span>
                      <span className={cn('font-medium', challengeInfo?.canFinalize ? 'text-yes-400' : 'text-yellow-400')}>
                        {challengeInfo?.text || 'Loading...'}
                      </span>
                    </div>
                  </div>
                )}

                {/* Agree — wait for confirm */}
                <div className="flex items-start gap-2 p-3 rounded-lg bg-yes-500/5 border border-yes-500/20">
                  <CheckCircle2 className="w-4 h-4 text-yes-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-yes-300">
                    Agree with the result? Nothing to do now. After {challengeInfo?.blocksLeft?.toString() || '...'} blocks, anyone can confirm it here and the market resolves.
                  </p>
                </div>

                {/* Disagree — dispute */}
                <div className="border-t border-white/[0.04] pt-4">
                  <div className="flex items-start gap-3 p-4 rounded-xl bg-no-500/5 border border-no-500/20 mb-4">
                    <Swords className="w-5 h-5 text-no-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-no-300">Disagree? File a Dispute!</p>
                      <p className="text-xs text-surface-400 mt-1">
                        Override the vote result with <span className="text-white font-medium">{nearAmount(minChallengeBond)} bond</span> ({rules.disputeMultiplier.toString()}× total bonded).
                        If your outcome is correct, you get your bond back + all voter bonds. If wrong, you lose your entire bond. A successful dispute is the hand-off point into the escalation lane.
                      </p>
                    </div>
                  </div>

                  <div className="mb-4 grid gap-3 md:grid-cols-3">
                    <div className="rounded-xl bg-white/[0.02] p-3">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-surface-500">Resolver quorum</div>
                      <p className="mt-2 text-xs text-surface-400">Open voters produce the provisional outcome and bond pool.</p>
                    </div>
                    <div className="rounded-xl bg-white/[0.02] p-3">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-surface-500">Bonded dispute</div>
                      <p className="mt-2 text-xs text-surface-400">A challenger posts {rules.disputeMultiplier.toString()}× the bonded value to contest the result during the dispute window.</p>
                    </div>
                    <div className="rounded-xl bg-white/[0.02] p-3">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-surface-500">Governance override</div>
                      <p className="mt-2 text-xs text-surface-400">Escalated markets can be handled by the resolver committee or a dispute-resolution proposal.</p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm text-surface-400 mb-2">Select Correct Outcome</label>
                    <div className="space-y-2">
                      {outcomeLabels.map((label, i) => {
                        const outcomeNum = i + 1
                        // Cannot select same outcome as winning
                        if (roundInfo && outcomeNum === roundInfo.proposedOutcome) return null
                        const isSelected = selectedOutcome === outcomeNum
                        const colorIdx = Math.min(i, 3)
                        return (
                          <button key={outcomeNum} onClick={() => setSelectedOutcome(outcomeNum)}
                            className={cn(
                              'w-full p-3 rounded-xl border text-left transition-all flex items-center justify-between',
                              isSelected ? 'bg-no-500/10 border-no-500/40 ring-1 ring-no-500/20' : 'bg-white/[0.02] border-white/[0.06] hover:border-surface-600/50'
                            )}>
                            <span className={cn('px-2 py-0.5 text-xs font-medium rounded-full border', outcomeColors[colorIdx])}>{label}</span>
                            {isSelected && <CheckCircle2 className="w-4 h-4 text-no-400" />}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <button onClick={handleChallengeOutcome} disabled={isSubmitting || !selectedOutcome}
                    className={cn('w-full flex items-center justify-center gap-2 mt-4', 'bg-no-500/20 hover:bg-no-500/30 text-no-300 font-medium py-3 rounded-xl transition-colors', !selectedOutcome && 'opacity-50 cursor-not-allowed')}>
                    {isSubmitting ? <><Loader2 className="w-5 h-5 animate-spin" /><span>Confirm in Wallet...</span></> : <><Swords className="w-5 h-5" /><span>{selectedOutcome ? `Dispute: ${outcomeLabels[selectedOutcome - 1]} (${Number(BigInt(roundInfo?.totalBonded || 0) * 3n) / 1_000_000} NEAR)` : 'Select Outcome to Dispute'}</span></>}
                  </button>
                </div>
              </div>
            )}

            {/* Step 3b (v37): DISPUTED — locked, awaiting governance escalation */}
            {currentStep === 'disputed' && (
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 rounded-xl bg-purple-500/5 border border-purple-500/20">
                  <Shield className="w-5 h-5 text-purple-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-purple-200">Awaiting governance resolution</p>
                    <p className="text-xs text-surface-400 mt-1">
                      A dispute has been filed on this market. All payouts are locked until the
                      governance committee or community vote confirms a final outcome via{' '}
                      <code className="text-purple-300">apply_governance_resolution</code>.
                    </p>
                  </div>
                </div>

                {roundInfo && (
                  <div className="p-4 rounded-xl bg-white/[0.02] space-y-2">
                    <div className="flex items-center gap-2 mb-2">
                      <Swords className="w-4 h-4 text-no-400" />
                      <span className="text-sm font-medium text-white">Dispute snapshot</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-surface-400">Voted winner</span>
                      <span className="text-white font-medium">
                        {getOutcomeLabel(roundInfo.proposedOutcome)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-surface-400">Total voter bond</span>
                      <span className="text-white font-mono">
                        {Number(roundInfo.totalBonded) / 1_000_000} NEAR
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-surface-400">Voters</span>
                      <span className="text-white">{roundInfo.round}</span>
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-3 p-4 rounded-xl bg-brand-500/5 border border-brand-500/20">
                  <Gavel className="w-5 h-5 text-brand-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white">Next step: governance escalation</p>
                    <p className="text-xs text-surface-400 mt-1">
                      Open the Governance workspace to file a committee panel vote
                      (<code className="text-brand-300">initiate_escalation_aleo/usdcx/usad</code> →{' '}
                      <code className="text-brand-300">assign_resolver_panel</code> →{' '}
                      <code className="text-brand-300">panel_vote</code>) or escalate to a community
                      proposal. Once the committee or community settles the outcome,{' '}
                      <code className="text-brand-300">governance_resolve_*</code> (with the matching
                      tier) will unlock this market with the corrected winner.
                    </p>
                    <a
                      href="/governance"
                      className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-brand-500/15 border border-brand-500/30 text-brand-200 text-xs font-medium hover:bg-brand-500/25 transition-colors"
                    >
                      <Shield className="w-3.5 h-3.5" />
                      Open Governance
                    </a>
                  </div>
                </div>
              </div>
            )}

            {/* Step 4: Finalize */}
            {currentStep === 'finalize' && (
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 rounded-xl bg-white/[0.02]">
                  <CheckCircle2 className="w-5 h-5 text-purple-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-white">Finalize Resolution</p>
                    <p className="text-xs text-surface-400 mt-1">
                      Challenge window ended. Anyone can finalize if no active dispute remains on-chain. The resolver earns 20% of protocol fees as reward.
                    </p>
                  </div>
                </div>

                {roundInfo && (
                  <div className="p-4 rounded-xl bg-yes-500/5 border border-yes-500/20 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-surface-400">Final Outcome</span>
                      <span className="text-yes-400 font-medium">
                        {getOutcomeLabel(roundInfo.proposedOutcome)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-surface-400">Resolution Rounds</span>
                      <span className="text-white">{roundInfo.round}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-surface-400">Total Bonded</span>
                      <span className="text-white font-mono">{Number(roundInfo.totalBonded) / 1_000_000} NEAR</span>
                    </div>
                  </div>
                )}

                <button onClick={handleFinalizeOutcome} disabled={isSubmitting || !canFinalize}
                  className={cn('w-full flex items-center justify-center gap-2 btn-primary', !canFinalize && 'opacity-50 cursor-not-allowed')}>
                  {isSubmitting ? <><Loader2 className="w-5 h-5 animate-spin" /><span>Confirm in Wallet...</span></> : <><CheckCircle2 className="w-5 h-5" /><span>Finalize Resolution</span></>}
                </button>
              </div>
            )}

            {/* Resolution window expired */}
            {currentStep === 'cancel' && market.status !== MARKET_STATUS.CANCELLED && (
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 rounded-xl bg-yellow-500/5 border border-yellow-500/20">
                  <AlertCircle className="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-white">Resolution window expired</p>
                    <p className="text-xs text-surface-400 mt-1">
                      This market is already past its resolution deadline, so `vote_outcome` can no longer be submitted.
                      The correct on-chain action now is `cancel_market`.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-4 rounded-xl bg-white/[0.02]">
                  <Shield className="w-5 h-5 text-brand-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-white">Emergency Cancel</p>
                    <p className="text-xs text-surface-400 mt-1">
                      Anyone can cancel an unresolved market after the resolution deadline passes. LP refunds and bond claims remain available after cancellation.
                    </p>
                  </div>
                </div>

                {isPastResolutionDeadline && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-brand-500/5 border border-brand-500/20">
                    <Clock className="w-4 h-4 text-brand-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-brand-300">
                      Current block {currentBlock.toString()} is past resolution deadline {market.resolutionDeadline.toString()}.
                    </p>
                  </div>
                )}

                <button onClick={handleEmergencyCancel} disabled={isSubmitting}
                  className="w-full flex items-center justify-center gap-2 btn-primary">
                  {isSubmitting ? <><Loader2 className="w-5 h-5 animate-spin" /><span>Confirm in Wallet...</span></> : <><AlertCircle className="w-5 h-5" /><span>Emergency Cancel Market</span></>}
                </button>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-start gap-3 p-4 rounded-xl bg-no-500/10 border border-no-500/20 mt-4">
                <AlertCircle className="w-5 h-5 text-no-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-no-400">Action Failed</p>
                  <p className="text-sm text-surface-400 mt-1">{error}</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
