import { motion } from 'framer-motion'
import {
  Shield,
  Send,
  CheckCircle,
  Play,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { useWalletStore, CONTRACT_INFO } from '@/lib/store'
import { useAleoTransaction } from '@/hooks/useAleoTransaction'
import { cn, formatCredits } from '@/lib/utils'
import { getMappingValue } from '@/lib/aleo-client'
import { TransactionLink } from './TransactionLink'
import { devWarn } from '../lib/logger'

type AdminAction = 'propose' | 'approve' | 'execute'

interface TreasuryBalances {
  aleo: bigint
  usdcx: bigint
}

export function AdminPanel() {
  const { wallet } = useWalletStore()
  const { executeTransaction } = useAleoTransaction()

  const [activeAction, setActiveAction] = useState<AdminAction>('propose')
  const [treasuryBalances, setTreasuryBalances] = useState<TreasuryBalances>({
    aleo: 0n,
    usdcx: 0n,
  })
  const [isLoadingBalances, setIsLoadingBalances] = useState(true)

  // Propose form
  const [proposalAmount, setProposalAmount] = useState('')
  const [proposalRecipient, setProposalRecipient] = useState('')
  const [proposalTokenType, setProposalTokenType] = useState<'aleo' | 'usdcx'>('aleo')

  // Approve/Execute form
  const [proposalId, setProposalId] = useState('')
  const [executeAmount, setExecuteAmount] = useState('')
  const [executeRecipient, setExecuteRecipient] = useState('')

  // Transaction state
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [transactionId, setTransactionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Fetch treasury balances
  useEffect(() => {
    let mounted = true

    const fetchBalances = async () => {
      setIsLoadingBalances(true)
      try {
        // program_credits[0u8] = ALEO, program_credits[1u8] = USDCX
        const [aleoBalRaw, usdcxBalRaw] = await Promise.all([
          getMappingValue<string>('protocol_treasury', '0u8'),
          getMappingValue<string>('protocol_treasury', '1u8'),
        ])

        if (mounted) {
          setTreasuryBalances({
            aleo: aleoBalRaw ? BigInt(String(aleoBalRaw).replace(/u\d+$/, '')) : 0n,
            usdcx: usdcxBalRaw ? BigInt(String(usdcxBalRaw).replace(/u\d+$/, '')) : 0n,
          })
        }
      } catch (err) {
        devWarn('Failed to fetch treasury balances:', err)
      } finally {
        if (mounted) setIsLoadingBalances(false)
      }
    }

    fetchBalances()
    const interval = setInterval(fetchBalances, 30_000)

    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [])

  const handlePropose = async () => {
    setIsSubmitting(true)
    setError(null)

    try {
      const amountMicro = proposalAmount
        ? BigInt(Math.floor(parseFloat(proposalAmount) * 1_000_000))
        : 0n

      // propose_treasury_withdrawal(amount: u128, recipient: address, token_type: u8, nonce: u64)
      const tokenTypeValue = proposalTokenType === 'aleo' ? 1 : 2
      const nonce = Date.now()

      const inputs = [
        `${amountMicro}u128`,
        proposalRecipient || wallet.address!,
        `${tokenTypeValue}u8`,
        `${nonce}u64`,
      ]

      const result = await executeTransaction({
        program: CONTRACT_INFO.programId,
        function: 'propose_treasury_withdrawal',
        inputs,
        fee: 1.5,
      })

      if (result?.transactionId) {
        setTransactionId(result.transactionId)
      } else {
        throw new Error('No transaction ID returned from wallet')
      }
    } catch (err: unknown) {
      console.error('Failed to propose:', err)
      setError(err instanceof Error ? err.message : 'Failed to submit proposal')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleApprove = async () => {
    if (!proposalId) return

    setIsSubmitting(true)
    setError(null)

    try {
      const result = await executeTransaction({
        program: CONTRACT_INFO.programId,
        function: 'approve_proposal',
        inputs: [proposalId],
        fee: 1.5,
      })

      if (result?.transactionId) {
        setTransactionId(result.transactionId)
      } else {
        throw new Error('No transaction ID returned from wallet')
      }
    } catch (err: unknown) {
      console.error('Failed to approve:', err)
      setError(err instanceof Error ? err.message : 'Failed to approve proposal')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleExecute = async () => {
    if (!proposalId || !executeAmount || !executeRecipient) return

    setIsSubmitting(true)
    setError(null)

    try {
      // execute_proposal(proposal_id: field, amount: u128, recipient: address)
      const amountMicro = BigInt(Math.floor(parseFloat(executeAmount) * 1_000_000))

      const result = await executeTransaction({
        program: CONTRACT_INFO.programId,
        function: 'execute_proposal',
        inputs: [proposalId, `${amountMicro}u128`, executeRecipient],
        fee: 1.5,
      })

      if (result?.transactionId) {
        setTransactionId(result.transactionId)
      } else {
        throw new Error('No transaction ID returned from wallet')
      }
    } catch (err: unknown) {
      console.error('Failed to execute:', err)
      setError(err instanceof Error ? err.message : 'Failed to execute proposal')
    } finally {
      setIsSubmitting(false)
    }
  }

  const resetState = () => {
    setTransactionId(null)
    setError(null)
    setProposalAmount('')
    setProposalRecipient('')
    setProposalId('')
    setExecuteAmount('')
    setExecuteRecipient('')
  }

  return (
    <div className="glass-card overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-surface-800">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center">
            <Shield className="w-5 h-5 text-brand-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Treasury Admin</h3>
            <p className="text-sm text-surface-400">Multi-sig treasury management</p>
          </div>
        </div>

        {/* Treasury Balances */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-4 rounded-xl bg-surface-800/30">
            <p className="text-xs text-surface-500 uppercase tracking-wide mb-1">ALEO Treasury</p>
            {isLoadingBalances ? (
              <div className="h-7 w-20 bg-surface-700/50 rounded animate-pulse" />
            ) : (
              <p className="text-lg font-bold text-white">
                {formatCredits(treasuryBalances.aleo)} ALEO
              </p>
            )}
          </div>
          <div className="p-4 rounded-xl bg-surface-800/30">
            <p className="text-xs text-surface-500 uppercase tracking-wide mb-1">USDCX Treasury</p>
            {isLoadingBalances ? (
              <div className="h-7 w-20 bg-surface-700/50 rounded animate-pulse" />
            ) : (
              <p className="text-lg font-bold text-white">
                {formatCredits(treasuryBalances.usdcx)} USDCX
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Action Tabs */}
      <div className="border-b border-surface-800">
        <div className="flex">
          {[
            { key: 'propose' as const, icon: Send, label: 'Propose' },
            { key: 'approve' as const, icon: CheckCircle, label: 'Approve' },
            { key: 'execute' as const, icon: Play, label: 'Execute' },
          ].map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              onClick={() => {
                setActiveAction(key)
                resetState()
              }}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-all border-b-2',
                activeAction === key
                  ? 'border-brand-500 text-brand-400'
                  : 'border-transparent text-surface-400 hover:text-surface-300'
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {transactionId ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center"
          >
            <div className="w-16 h-16 rounded-full bg-yes-500/20 mx-auto mb-4 flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-yes-400" />
            </div>
            <h4 className="text-lg font-semibold text-white mb-2">
              {activeAction === 'propose' && 'Proposal Submitted'}
              {activeAction === 'approve' && 'Approval Submitted'}
              {activeAction === 'execute' && 'Execution Submitted'}
            </h4>
            <TransactionLink
              transactionId={transactionId}
              className="mb-4"
              showCopy={true}
              showNote={true}
            />
            <button
              onClick={resetState}
              className="btn-secondary w-full mt-4"
            >
              New Action
            </button>
          </motion.div>
        ) : (
          <>
            {/* Propose */}
            {activeAction === 'propose' && (
              <div className="space-y-4">
                {/* Token Type */}
                <div>
                  <label className="block text-sm text-surface-400 mb-2">Token Type</label>
                  <div className="flex gap-2">
                    {(['aleo', 'usdcx'] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setProposalTokenType(t)}
                        className={cn(
                          'flex-1 py-2 rounded-lg text-sm font-medium transition-all border',
                          proposalTokenType === t
                            ? 'border-brand-500 bg-brand-500/10 text-brand-400'
                            : 'border-surface-700 text-surface-400 hover:text-surface-300'
                        )}
                      >
                        {t.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Amount */}
                <div>
                  <label className="block text-sm text-surface-400 mb-2">Amount</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={proposalAmount}
                      onChange={(e) => setProposalAmount(e.target.value)}
                      placeholder="0.00"
                      className="input-field text-lg font-semibold pr-20"
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-surface-400 text-sm">
                      {proposalTokenType.toUpperCase()}
                    </div>
                  </div>
                </div>

                {/* Recipient */}
                <div>
                  <label className="block text-sm text-surface-400 mb-2">
                    Recipient Address
                  </label>
                  <input
                    type="text"
                    value={proposalRecipient}
                    onChange={(e) => setProposalRecipient(e.target.value)}
                    placeholder={wallet.address || 'aleo1...'}
                    className="input-field text-sm font-mono"
                  />
                  <p className="text-xs text-surface-500 mt-1">
                    Leave empty to use your connected address.
                  </p>
                </div>

                <button
                  onClick={handlePropose}
                  disabled={isSubmitting || !proposalAmount}
                  className={cn(
                    'w-full flex items-center justify-center gap-2 btn-primary',
                    !proposalAmount && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Confirm in Wallet...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5" />
                      <span>Submit Proposal</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Approve */}
            {activeAction === 'approve' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-surface-400 mb-2">Proposal ID</label>
                  <input
                    type="text"
                    value={proposalId}
                    onChange={(e) => setProposalId(e.target.value)}
                    placeholder="Enter proposal ID (field)"
                    className="input-field text-sm font-mono"
                  />
                </div>

                <div className="p-3 rounded-lg bg-brand-500/5 border border-brand-500/20">
                  <p className="text-xs text-surface-400">
                    As a multi-sig signer, your approval counts toward the threshold.
                    The proposal can be executed once enough signers approve.
                  </p>
                </div>

                <button
                  onClick={handleApprove}
                  disabled={isSubmitting || !proposalId}
                  className={cn(
                    'w-full flex items-center justify-center gap-2 btn-primary',
                    !proposalId && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Confirm in Wallet...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-5 h-5" />
                      <span>Approve Proposal</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Execute */}
            {activeAction === 'execute' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-surface-400 mb-2">Proposal ID</label>
                  <input
                    type="text"
                    value={proposalId}
                    onChange={(e) => setProposalId(e.target.value)}
                    placeholder="Enter proposal ID (field)"
                    className="input-field text-sm font-mono"
                  />
                </div>

                <div>
                  <label className="block text-sm text-surface-400 mb-2">Amount</label>
                  <input
                    type="number"
                    value={executeAmount}
                    onChange={(e) => setExecuteAmount(e.target.value)}
                    placeholder="0.00"
                    className="input-field text-lg font-semibold"
                  />
                  <p className="text-xs text-surface-500 mt-1">
                    Must match the proposed amount exactly.
                  </p>
                </div>

                <div>
                  <label className="block text-sm text-surface-400 mb-2">Recipient Address</label>
                  <input
                    type="text"
                    value={executeRecipient}
                    onChange={(e) => setExecuteRecipient(e.target.value)}
                    placeholder="aleo1..."
                    className="input-field text-sm font-mono"
                  />
                  <p className="text-xs text-surface-500 mt-1">
                    Must match the proposed recipient exactly.
                  </p>
                </div>

                <div className="flex items-start gap-3 p-4 rounded-xl bg-yellow-500/5 border border-yellow-500/20">
                  <AlertCircle className="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-yellow-300">Execution Requirements</p>
                    <p className="text-xs text-surface-400 mt-1">
                      The proposal must have met the required approval threshold before it can
                      be executed. Amount and recipient must match the proposal exactly.
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleExecute}
                  disabled={isSubmitting || !proposalId || !executeAmount || !executeRecipient}
                  className={cn(
                    'w-full flex items-center justify-center gap-2 btn-primary',
                    (!proposalId || !executeAmount || !executeRecipient) && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Confirm in Wallet...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-5 h-5" />
                      <span>Execute Proposal</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Error Display */}
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
