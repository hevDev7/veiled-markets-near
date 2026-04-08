// ============================================================================
// VEILED GOVERNANCE — CreateProposalModal Component
// ============================================================================

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertCircle, Loader2, Zap, FileText, DollarSign, Settings, Users } from 'lucide-react';
import { useGovernanceStore } from '../../lib/governance-store';
import { formatVeil } from '../../lib/governance-client';
import {
  PROPOSAL_TYPES,
  PROPOSAL_TYPE_LABELS,
  PROPOSAL_TYPE_DESCRIPTIONS,
  QUORUM_BPS,
  TIMELOCK_BLOCKS,
  MIN_PROPOSAL_STAKE,
  type ProposalType,
} from '../../lib/governance-types';

interface CreateProposalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: ProposalFormData) => Promise<void>;
}

export interface ProposalFormData {
  proposalType: ProposalType;
  proposalTypeName: string;
  title: string;
  description: string;
  target: string;
  payload1: string;
  payload2: string;
  recipientAddress?: string;
}

const TYPE_ICONS: Record<number, typeof FileText> = {
  [PROPOSAL_TYPES.RESOLVE_DISPUTE]: FileText,
  [PROPOSAL_TYPES.FEE_CHANGE]: DollarSign,
  [PROPOSAL_TYPES.TREASURY]: DollarSign,
  [PROPOSAL_TYPES.PARAMETER]: Settings,
  [PROPOSAL_TYPES.EMERGENCY_PAUSE]: Zap,
  [PROPOSAL_TYPES.RESOLVER_ELECTION]: Users,
};

export function CreateProposalModal({ isOpen, onClose, onSubmit }: CreateProposalModalProps) {
  const { veilBalance, isCreatingProposal } = useGovernanceStore();

  const [proposalType, setProposalType] = useState<ProposalType>(PROPOSAL_TYPES.RESOLVE_DISPUTE);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [target, setTarget] = useState('');
  const [payload1, setPayload1] = useState('');
  const [payload2, setPayload2] = useState('');
  const [recipientAddress, setRecipientAddress] = useState('');
  const [error, setError] = useState<string | null>(null);

  const hasEnoughStake = veilBalance >= MIN_PROPOSAL_STAKE;
  const quorumPercent = QUORUM_BPS[proposalType] / 100;
  const timelockHours = Math.round((TIMELOCK_BLOCKS[proposalType] * 15) / 3600);

  const handleSubmit = async () => {
    setError(null);
    if (!title.trim()) { setError('Title is required'); return; }
    if (!hasEnoughStake) { setError('Insufficient ALEO balance for stake'); return; }
    if (proposalType === PROPOSAL_TYPES.TREASURY && !recipientAddress.trim().startsWith('aleo1')) {
      setError('Treasury proposals require a valid recipient address');
      return;
    }

    try {
      await onSubmit({
        proposalType,
        proposalTypeName: PROPOSAL_TYPE_LABELS[proposalType],
        title,
        description,
        target,
        payload1,
        payload2,
        recipientAddress: recipientAddress.trim() || undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create proposal');
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-surface-900 border border-white/[0.06] rounded-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-white/[0.06]">
              <h2 className="text-lg font-bold text-white">Create Governance Proposal</h2>
              <button onClick={onClose} className="text-surface-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-5">
              {/* Proposal Type Selector */}
              <div>
                <label className="text-sm font-medium text-surface-300 mb-2 block">Proposal Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(PROPOSAL_TYPES).map(([key, value]) => {
                    const Icon = TYPE_ICONS[value] || FileText;
                    return (
                      <button
                        key={key}
                        onClick={() => setProposalType(value)}
                        className={`flex items-center gap-2 p-3 rounded-xl text-left text-xs transition-all ${
                          proposalType === value
                            ? 'bg-brand-500/20 border border-brand-500/40 text-brand-300'
                            : 'bg-white/[0.03] border border-surface-700/30 text-surface-400 hover:border-surface-600/50'
                        }`}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span className="font-medium">{PROPOSAL_TYPE_LABELS[value]}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-surface-500 mt-2">
                  {PROPOSAL_TYPE_DESCRIPTIONS[proposalType]}
                </p>
              </div>

              {/* Title */}
              <div>
                <label className="text-sm font-medium text-surface-300 mb-1.5 block">Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Short descriptive title..."
                  className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-surface-600 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500/50"
                />
              </div>

              {/* Description */}
              <div>
                <label className="text-sm font-medium text-surface-300 mb-1.5 block">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Detailed explanation of the proposal..."
                  rows={3}
                  className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-surface-600 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500/50 resize-none"
                />
              </div>

              {/* Target */}
              <div>
                <label className="text-sm font-medium text-surface-300 mb-1.5 block">
                  Target {proposalType === PROPOSAL_TYPES.RESOLVE_DISPUTE ? '(Market ID)' : '(optional)'}
                </label>
                <input
                  type="text"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  placeholder="field value or 0field..."
                  className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-surface-600 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500/50 font-mono"
                />
              </div>

              {/* Payload Fields */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-surface-300 mb-1.5 block">Payload 1</label>
                <input
                  type="text"
                  value={payload1}
                  onChange={(e) => setPayload1(e.target.value)}
                  placeholder={proposalType === PROPOSAL_TYPES.TREASURY ? 'Amount in ALEO' : '0'}
                  className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-surface-600 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500/50 font-mono"
                />
              </div>
                <div>
                  <label className="text-sm font-medium text-surface-300 mb-1.5 block">
                    {proposalType === PROPOSAL_TYPES.TREASURY ? 'Recipient Address' : 'Payload 2'}
                  </label>
                  {proposalType === PROPOSAL_TYPES.TREASURY ? (
                    <>
                      <input
                        type="text"
                        value={recipientAddress}
                        onChange={(e) => setRecipientAddress(e.target.value)}
                        placeholder="aleo1..."
                        className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-surface-600 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500/50 font-mono"
                      />
                      <p className="mt-1 text-[11px] text-surface-500">
                        The recipient address is hashed into `payload_2` automatically before submission.
                      </p>
                    </>
                  ) : (
                    <input
                      type="text"
                      value={payload2}
                      onChange={(e) => setPayload2(e.target.value)}
                      placeholder="0field"
                      className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-surface-600 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500/50 font-mono"
                    />
                  )}
                </div>
              </div>

              {/* Stake Info Box */}
              <div className="bg-white/[0.02] border border-surface-700/30 rounded-xl p-4 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-surface-400">Stake Required</span>
                  <span className="text-white font-medium">{formatVeil(MIN_PROPOSAL_STAKE)} ALEO</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-surface-400">Your Balance</span>
                  <span className={`font-medium ${hasEnoughStake ? 'text-emerald-400' : 'text-red-400'}`}>
                    {formatVeil(veilBalance)} ALEO
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-surface-400">Quorum Needed</span>
                  <span className="text-white font-medium">{quorumPercent}% of supply</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-surface-400">Timelock</span>
                  <span className="text-white font-medium">
                    {timelockHours === 0 ? 'None (immediate)' : `${timelockHours} hours`}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-surface-400">Voting Period</span>
                  <span className="text-white font-medium">7 days</span>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 p-5 border-t border-white/[0.06]">
              <button
                onClick={onClose}
                className="px-5 py-2 text-sm text-surface-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={isCreatingProposal || !hasEnoughStake || !title.trim()}
                className="flex items-center gap-2 px-5 py-2 bg-brand-500 hover:bg-brand-600 disabled:bg-surface-700 disabled:text-surface-500 text-white rounded-xl text-sm font-medium transition-colors"
              >
                {isCreatingProposal ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Proposal'
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
