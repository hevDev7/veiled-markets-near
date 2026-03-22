// ============================================================================
// VEILED GOVERNANCE — GovernanceStats Component
// ============================================================================

import { motion } from 'framer-motion';
import {
  BarChart3, Coins, Vote, CheckCircle, XCircle, Shield, TrendingUp,
} from 'lucide-react';
import { formatVeilCompact } from '../../lib/governance-client';
import { useGovernanceStore } from '../../lib/governance-store';

export function GovernanceStats() {
  const { stats } = useGovernanceStore();

  const statItems = [
    {
      label: 'Total ALEO Staked',
      value: formatVeilCompact(stats.totalStakedInVotes),
      sub: 'ALEO locked in governance',
      icon: Coins,
      color: 'text-brand-400',
    },
    {
      label: 'Active Voters',
      value: String(stats.totalProposals > 0 ? stats.proposalsPassed + stats.proposalsRejected + stats.proposalsExecuted : 0),
      sub: 'Proposals with votes',
      icon: Vote,
      color: 'text-purple-400',
    },
    {
      label: 'Total Proposals',
      value: String(stats.totalProposals),
      sub: `${stats.proposalsPassed} passed · ${stats.proposalsExecuted} executed`,
      icon: BarChart3,
      color: 'text-blue-400',
    },
    {
      label: 'Resolvers',
      value: String(stats.totalResolvers || 0),
      sub: 'Active market resolvers',
      icon: Shield,
      color: 'text-emerald-400',
    },
  ];

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-white flex items-center gap-2">
        <BarChart3 className="w-5 h-5 text-brand-400" />
        Governance Statistics
      </h2>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        {statItems.map((item, i) => {
          const Icon = item.icon;
          return (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-surface-900/60 border border-white/[0.06] rounded-xl p-4 min-w-0 overflow-hidden"
            >
              <div className={`flex items-center gap-1.5 text-xs ${item.color} mb-2`}>
                <Icon className="w-3.5 h-3.5 shrink-0" />
                {item.label}
              </div>
              <div className="text-lg font-bold text-white truncate">{item.value}</div>
              <div className="text-[10px] text-surface-500 mt-0.5 truncate">{item.sub}</div>
            </motion.div>
          );
        })}
      </div>

      {/* Proposal Outcomes */}
      <div className="bg-surface-900/60 border border-white/[0.06] rounded-xl p-4">
        <h3 className="text-sm font-semibold text-surface-300 mb-3">Proposal Outcomes</h3>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
          <div className="flex items-center gap-1 text-emerald-400">
            <CheckCircle className="w-3.5 h-3.5" />
            {stats.proposalsPassed} Passed
          </div>
          <div className="flex items-center gap-1 text-red-400">
            <XCircle className="w-3.5 h-3.5" />
            {stats.proposalsRejected} Rejected
          </div>
          <div className="flex items-center gap-1 text-blue-400">
            <CheckCircle className="w-3.5 h-3.5" />
            {stats.proposalsExecuted} Executed
          </div>
          <div className="flex items-center gap-1 text-purple-400">
            <Shield className="w-3.5 h-3.5" />
            {stats.proposalsVetoed} Vetoed
          </div>
        </div>
      </div>

      {/* Governance Info */}
      <div className="bg-surface-900/60 border border-white/[0.06] rounded-xl p-4">
        <h3 className="text-sm font-semibold text-surface-300 mb-3">Governance Model</h3>
        <div className="space-y-2 text-xs text-surface-400">
          <div className="flex justify-between">
            <span>Staking Token</span>
            <span className="text-white font-medium">ALEO (native)</span>
          </div>
          <div className="flex justify-between">
            <span>Min Proposal Stake</span>
            <span className="text-white font-medium">10 ALEO</span>
          </div>
          <div className="flex justify-between">
            <span>Resolver Stake</span>
            <span className="text-white font-medium">50 ALEO</span>
          </div>
          <div className="flex justify-between">
            <span>Voting Period</span>
            <span className="text-white font-medium">~7 days</span>
          </div>
        </div>
      </div>
    </div>
  );
}
