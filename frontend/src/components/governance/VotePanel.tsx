// ============================================================================
// VEILED GOVERNANCE — VotePanel Component
// ============================================================================
// Full proposal detail view with voting controls
// ============================================================================

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft, ThumbsUp, ThumbsDown, Clock, CheckCircle,
  Timer, AlertTriangle, Loader2, User,
} from 'lucide-react';
import { formatVeil, formatBlocksRemaining, parseVeilInput } from '../../lib/governance-client';
import { useGovernanceStore } from '../../lib/governance-store';
import {
  PROPOSAL_STATUS,
  PROPOSAL_STATUS_LABELS,
  type GovernanceProposal,
} from '../../lib/governance-types';

interface VotePanelProps {
  proposal: GovernanceProposal;
  onBack: () => void;
  onVote: (proposalId: string, direction: 'for' | 'against', amount: bigint) => Promise<void>;
}

export function VotePanel({ proposal, onBack, onVote }: VotePanelProps) {
  const { veilBalance, currentBlockHeight, isVoting } = useGovernanceStore();
  const [voteAmount, setVoteAmount] = useState('');
  const [error, setError] = useState<string | null>(null);

  const blocksRemaining = proposal.votingDeadline > currentBlockHeight
    ? proposal.votingDeadline - currentBlockHeight
    : 0n;
  const timelockRemaining = proposal.timelockUntil > currentBlockHeight
    ? proposal.timelockUntil - currentBlockHeight
    : 0n;
  const isVotingOpen = proposal.status === PROPOSAL_STATUS.ACTIVE && blocksRemaining > 0n;

  const handleVote = async (direction: 'for' | 'against') => {
    setError(null);
    const amount = parseVeilInput(voteAmount || '0');
    if (amount <= 0n) { setError('Enter a vote amount'); return; }
    if (amount > veilBalance) { setError('Insufficient ALEO balance'); return; }

    try {
      await onVote(proposal.proposalId, direction, amount);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Vote failed');
    }
  };

  const setPercentage = (pct: number) => {
    const amount = (veilBalance * BigInt(pct)) / 100n;
    setVoteAmount(formatVeil(amount, 6));
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="space-y-5"
    >
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-surface-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to proposals
      </button>

      {/* Proposal Header */}
      <div className="bg-surface-900/60 backdrop-blur-sm border border-surface-700/50 rounded-2xl p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-mono text-surface-500">#{proposal.proposalId.slice(0, 12)}</span>
              <StatusPill status={proposal.status} />
            </div>
            <h2 className="text-xl font-bold text-white">
              {proposal.title || `${proposal.proposalTypeName} Proposal`}
            </h2>
            <p className="text-sm text-surface-400 mt-1">{proposal.description}</p>
          </div>
          <span className="text-xs text-surface-500 bg-surface-800 px-3 py-1 rounded-full">
            {proposal.proposalTypeName}
          </span>
        </div>

        {/* Proposer */}
        <div className="flex items-center gap-2 text-xs text-surface-400 mb-4">
          <User className="w-3.5 h-3.5" />
          Proposed by: <span className="font-mono text-surface-300">{proposal.proposer.slice(0, 20)}...</span>
        </div>

        {/* Vote Tally */}
        <div className="space-y-3">
          {/* FOR bar */}
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="flex items-center gap-1 text-emerald-400">
                <ThumbsUp className="w-3.5 h-3.5" />
                FOR — {proposal.forPercent.toFixed(1)}%
              </span>
              <span className="text-emerald-400 font-mono text-xs">
                {formatVeil(proposal.votesFor)} ALEO
              </span>
            </div>
            <div className="h-3 bg-surface-800 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${proposal.forPercent}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full"
              />
            </div>
          </div>

          {/* AGAINST bar */}
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="flex items-center gap-1 text-red-400">
                <ThumbsDown className="w-3.5 h-3.5" />
                AGAINST — {proposal.againstPercent.toFixed(1)}%
              </span>
              <span className="text-red-400 font-mono text-xs">
                {formatVeil(proposal.votesAgainst)} ALEO
              </span>
            </div>
            <div className="h-3 bg-surface-800 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${proposal.againstPercent}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                className="h-full bg-gradient-to-r from-red-600 to-red-400 rounded-full"
              />
            </div>
          </div>

          {/* Quorum */}
          <div className="pt-2 border-t border-surface-700/50">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-surface-400">
                Quorum: {proposal.quorumPercent.toFixed(1)}% met
                {proposal.isQuorumMet && <CheckCircle className="w-3 h-3 inline ml-1 text-emerald-400" />}
              </span>
              <span className="text-surface-500 font-mono">
                {formatVeil(proposal.totalVotes)} / {formatVeil(proposal.quorumRequired)}
              </span>
            </div>
            <div className="h-2 bg-surface-800 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, proposal.quorumPercent)}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                className={`h-full rounded-full ${
                  proposal.isQuorumMet ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              />
            </div>
          </div>
        </div>

        {/* Timeline */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="bg-surface-800/30 rounded-xl p-3">
            <div className="text-xs text-surface-500 mb-1 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Voting Ends
            </div>
            <div className="text-sm text-white font-medium">
              {blocksRemaining > 0n
                ? formatBlocksRemaining(blocksRemaining)
                : 'Ended'}
            </div>
          </div>
          <div className="bg-surface-800/30 rounded-xl p-3">
            <div className="text-xs text-surface-500 mb-1 flex items-center gap-1">
              <Timer className="w-3 h-3" />
              Timelock
            </div>
            <div className="text-sm text-white font-medium">
              {proposal.timelockUntil > 0n && timelockRemaining > 0n
                ? formatBlocksRemaining(timelockRemaining)
                : proposal.status === PROPOSAL_STATUS.PASSED ? 'Pending' : 'N/A'}
            </div>
          </div>
        </div>
      </div>

      {/* Vote Controls */}
      {isVotingOpen && (
        <div className="bg-surface-900/60 backdrop-blur-sm border border-surface-700/50 rounded-2xl p-6">
          <h3 className="text-base font-bold text-white mb-4">Cast Your Vote</h3>

          {/* Amount Input */}
          <div className="mb-4">
            <label className="text-sm text-surface-400 mb-1.5 block">Vote Amount (ALEO)</label>
            <div className="relative">
              <input
                type="text"
                value={voteAmount}
                onChange={(e) => setVoteAmount(e.target.value)}
                placeholder="0.00"
                className="w-full bg-surface-800/50 border border-surface-700/50 rounded-xl px-4 py-3 text-white placeholder:text-surface-600 focus:outline-none focus:ring-2 focus:ring-brand-500/50 text-lg font-mono"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-surface-500 text-sm">ALEO</span>
            </div>
            <div className="flex gap-2 mt-2">
              {[25, 50, 75, 100].map((pct) => (
                <button
                  key={pct}
                  onClick={() => setPercentage(pct)}
                  className="flex-1 text-xs py-1.5 bg-surface-800/50 hover:bg-surface-700/50 text-surface-400 hover:text-white rounded-lg transition-colors"
                >
                  {pct}%
                </button>
              ))}
            </div>
            <div className="text-xs text-surface-500 mt-1.5">
              Balance: {formatVeil(veilBalance)} ALEO
            </div>
          </div>

          {/* Vote Buttons */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handleVote('for')}
              disabled={isVoting}
              className="flex items-center justify-center gap-2 py-3 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-400 rounded-xl font-medium transition-all disabled:opacity-50"
            >
              {isVoting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ThumbsUp className="w-4 h-4" />}
              Vote For
            </button>
            <button
              onClick={() => handleVote('against')}
              disabled={isVoting}
              className="flex items-center justify-center gap-2 py-3 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-400 rounded-xl font-medium transition-all disabled:opacity-50"
            >
              {isVoting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ThumbsDown className="w-4 h-4" />}
              Vote Against
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5 mt-3">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}

function StatusPill({ status }: { status: number }) {
  const colors: Record<number, string> = {
    [PROPOSAL_STATUS.ACTIVE]: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    [PROPOSAL_STATUS.PASSED]: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    [PROPOSAL_STATUS.REJECTED]: 'bg-red-500/20 text-red-400 border-red-500/30',
    [PROPOSAL_STATUS.EXECUTED]: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    [PROPOSAL_STATUS.VETOED]: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    [PROPOSAL_STATUS.EXPIRED]: 'bg-surface-600/50 text-surface-400 border-surface-600/50',
  };

  return (
    <span className={`px-2 py-0.5 rounded-md text-xs font-medium border ${colors[status] || colors[0]}`}>
      {PROPOSAL_STATUS_LABELS[status as keyof typeof PROPOSAL_STATUS_LABELS]}
    </span>
  );
}
