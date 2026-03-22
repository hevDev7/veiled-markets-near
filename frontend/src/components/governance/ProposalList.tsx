// ============================================================================
// VEILED GOVERNANCE — ProposalList Component
// ============================================================================

import { motion } from 'framer-motion';
import { Plus, Filter, Loader2, FileQuestion } from 'lucide-react';
import { useGovernanceStore } from '../../lib/governance-store';
import { ProposalCard } from './ProposalCard';

interface ProposalListProps {
  onCreateProposal: () => void;
  onSelectProposal: (proposalId: string) => void;
}

const FILTER_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'passed', label: 'Passed' },
  { key: 'executed', label: 'Executed' },
  { key: 'rejected', label: 'Rejected' },
] as const;

export function ProposalList({ onCreateProposal, onSelectProposal }: ProposalListProps) {
  const {
    proposalFilter,
    setProposalFilter,
    getFilteredProposals,
    isLoading,
  } = useGovernanceStore();

  const filteredProposals = getFilteredProposals();

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <Filter className="w-5 h-5 text-brand-400" />
          Proposals
        </h2>
        <button
          onClick={onCreateProposal}
          className="flex items-center gap-1.5 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create Proposal
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1 bg-surface-900/60 p-1 rounded-xl border border-white/[0.06]">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            onClick={() => setProposalFilter(opt.key as typeof proposalFilter)}
            className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              proposalFilter === opt.key
                ? 'bg-brand-500/20 text-brand-300 border border-brand-500/30'
                : 'text-surface-400 hover:text-surface-300 hover:bg-white/[0.03]'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Proposal Cards */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-surface-500" />
        </div>
      ) : filteredProposals.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-16 text-surface-500"
        >
          <FileQuestion className="w-12 h-12 mb-3 opacity-50" />
          <p className="text-sm">No proposals found</p>
          <p className="text-xs mt-1">Be the first to create a governance proposal</p>
        </motion.div>
      ) : (
        <div className="space-y-3">
          {filteredProposals.map((proposal, i) => (
            <ProposalCard
              key={proposal.proposalId}
              proposal={proposal}
              index={i}
              onClick={() => onSelectProposal(proposal.proposalId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
