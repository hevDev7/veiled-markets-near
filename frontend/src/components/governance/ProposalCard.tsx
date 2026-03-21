// ============================================================================
// VEILED GOVERNANCE — ProposalCard Component
// ============================================================================

import { motion } from 'framer-motion';
import { Clock, CheckCircle, XCircle, Shield, AlertTriangle, Timer } from 'lucide-react';
import { formatVeil, formatBlocksRemaining } from '../../lib/governance-client';
import { useGovernanceStore } from '../../lib/governance-store';
import {
  PROPOSAL_STATUS,
  PROPOSAL_STATUS_LABELS,
  type GovernanceProposal,
} from '../../lib/governance-types';

interface ProposalCardProps {
  proposal: GovernanceProposal;
  onClick?: () => void;
  index?: number;
}

export function ProposalCard({ proposal, onClick, index = 0 }: ProposalCardProps) {
  const { currentBlockHeight } = useGovernanceStore();

  const blocksRemaining = proposal.votingDeadline > currentBlockHeight
    ? proposal.votingDeadline - currentBlockHeight
    : 0n;

  const timelockRemaining = proposal.timelockUntil > currentBlockHeight
    ? proposal.timelockUntil - currentBlockHeight
    : 0n;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      onClick={onClick}
      className="bg-surface-900/60 backdrop-blur-sm border border-surface-700/50 rounded-2xl p-5 hover:border-surface-600/50 transition-all cursor-pointer group"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono text-surface-500">
              #{proposal.proposalId.slice(0, 8)}
            </span>
            <StatusBadge status={proposal.status} />
          </div>
          <h3 className="text-white font-semibold text-sm leading-tight line-clamp-2 group-hover:text-brand-300 transition-colors">
            {proposal.title || `${proposal.proposalTypeName}: ${proposal.proposalId.slice(0, 16)}...`}
          </h3>
        </div>
        <span className="text-xs text-surface-500 bg-surface-800 px-2 py-0.5 rounded-full ml-2 whitespace-nowrap">
          {proposal.proposalTypeName}
        </span>
      </div>

      {/* Vote Progress Bar */}
      <div className="mb-3">
        <div className="flex justify-between text-xs mb-1.5">
          <span className="text-emerald-400">
            FOR {proposal.forPercent.toFixed(1)}% ({formatVeil(proposal.votesFor)})
          </span>
          <span className="text-red-400">
            AGAINST {proposal.againstPercent.toFixed(1)}% ({formatVeil(proposal.votesAgainst)})
          </span>
        </div>
        <div className="h-2 bg-surface-800 rounded-full overflow-hidden flex">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
            style={{ width: `${proposal.forPercent}%` }}
          />
          <div
            className="h-full bg-gradient-to-r from-red-500 to-red-400 transition-all duration-500"
            style={{ width: `${proposal.againstPercent}%` }}
          />
        </div>
      </div>

      {/* Quorum */}
      <div className="mb-3">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-surface-400">
            Quorum: {proposal.quorumPercent.toFixed(0)}% met
          </span>
          <span className="text-surface-500">
            {formatVeil(proposal.totalVotes)} / {formatVeil(proposal.quorumRequired)}
          </span>
        </div>
        <div className="h-1.5 bg-surface-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              proposal.isQuorumMet
                ? 'bg-emerald-500'
                : 'bg-amber-500'
            }`}
            style={{ width: `${Math.min(100, proposal.quorumPercent)}%` }}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-surface-400">
        {proposal.status === PROPOSAL_STATUS.ACTIVE && blocksRemaining > 0n ? (
          <div className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            Voting ends in: {formatBlocksRemaining(blocksRemaining)}
          </div>
        ) : proposal.status === PROPOSAL_STATUS.PASSED && timelockRemaining > 0n ? (
          <div className="flex items-center gap-1 text-amber-400">
            <Timer className="w-3.5 h-3.5" />
            Timelock: {formatBlocksRemaining(timelockRemaining)}
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <CheckCircle className="w-3.5 h-3.5" />
            {PROPOSAL_STATUS_LABELS[proposal.status]}
          </div>
        )}

        {proposal.status === PROPOSAL_STATUS.ACTIVE && (
          <div className="flex gap-2">
            <button className="px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/30 transition-colors text-xs font-medium">
              Vote For
            </button>
            <button className="px-3 py-1 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors text-xs font-medium">
              Against
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// Status badge component
function StatusBadge({ status }: { status: number }) {
  const configs: Record<number, { label: string; className: string; Icon: typeof CheckCircle }> = {
    [PROPOSAL_STATUS.ACTIVE]: { label: 'Active', className: 'bg-blue-500/20 text-blue-400', Icon: Clock },
    [PROPOSAL_STATUS.PASSED]: { label: 'Passed', className: 'bg-amber-500/20 text-amber-400', Icon: Timer },
    [PROPOSAL_STATUS.REJECTED]: { label: 'Rejected', className: 'bg-red-500/20 text-red-400', Icon: XCircle },
    [PROPOSAL_STATUS.EXECUTED]: { label: 'Executed', className: 'bg-emerald-500/20 text-emerald-400', Icon: CheckCircle },
    [PROPOSAL_STATUS.VETOED]: { label: 'Vetoed', className: 'bg-purple-500/20 text-purple-400', Icon: Shield },
    [PROPOSAL_STATUS.EXPIRED]: { label: 'Expired', className: 'bg-surface-600/50 text-surface-400', Icon: AlertTriangle },
  };

  const cfg = configs[status] || configs[PROPOSAL_STATUS.ACTIVE];
  const { Icon } = cfg;

  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium ${cfg.className}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}
