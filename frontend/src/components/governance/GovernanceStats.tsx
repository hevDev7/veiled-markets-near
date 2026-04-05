// ============================================================================
// VEILED GOVERNANCE — GovernanceStats (Compact Sidebar)
// ============================================================================

import { formatVeilCompact } from '../../lib/governance-client';
import { useGovernanceStore } from '../../lib/governance-store';
import { PROPOSAL_STATUS } from '../../lib/governance-types';
import { shortenAddress } from '../../lib/utils';

export function GovernanceStats() {
  const { stats, proposals } = useGovernanceStore();
  const active = proposals.filter((p) => p.status === PROPOSAL_STATUS.ACTIVE).length;

  return (
    <div className="rounded-xl border border-white/[0.06] bg-surface-900/50 p-4 space-y-4 text-xs">
      {/* Key metrics — single row */}
      <div className="grid grid-cols-4 gap-2 text-center">
        <div>
          <div className="text-lg font-semibold text-white">{formatVeilCompact(stats.totalStakedInVotes)}</div>
          <div className="text-surface-500">Staked</div>
        </div>
        <div>
          <div className="text-lg font-semibold text-white">{active}</div>
          <div className="text-surface-500">Active</div>
        </div>
        <div>
          <div className="text-lg font-semibold text-white">{stats.totalProposals}</div>
          <div className="text-surface-500">Proposals</div>
        </div>
        <div>
          <div className="text-lg font-semibold text-white">{stats.totalResolvers || 0}</div>
          <div className="text-surface-500">Resolvers</div>
        </div>
      </div>

      <hr className="border-white/[0.06]" />

      {/* Outcomes — inline */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-surface-400">
        <span><span className="text-emerald-400 font-medium">{stats.proposalsPassed}</span> passed</span>
        <span><span className="text-blue-400 font-medium">{stats.proposalsExecuted}</span> executed</span>
        <span><span className="text-red-400 font-medium">{stats.proposalsRejected}</span> rejected</span>
        <span><span className="text-purple-400 font-medium">{stats.proposalsVetoed}</span> vetoed</span>
      </div>

      <hr className="border-white/[0.06]" />

      {/* Model params — compact list */}
      <div className="space-y-1.5 text-surface-400">
        <div className="flex justify-between">
          <span>Voting period</span>
          <span className="text-surface-300">~7 days</span>
        </div>
        <div className="flex justify-between">
          <span>Min proposal stake</span>
          <span className="text-surface-300">10 ALEO</span>
        </div>
        <div className="flex justify-between">
          <span>Guardian threshold</span>
          <span className="text-surface-300">
            {stats.guardianThreshold > 0 ? `${stats.guardianThreshold} of ${stats.guardianAddresses.length}` : '...'}
          </span>
        </div>
        <div className="flex justify-between">
          <span>Market state</span>
          <span className={stats.pauseState ? 'text-red-400' : 'text-emerald-400'}>
            {stats.pauseState ? 'Paused' : 'Active'}
          </span>
        </div>
      </div>

      {/* Guardians — inline pills */}
      {stats.guardianAddresses.length > 0 && (
        <>
          <hr className="border-white/[0.06]" />
          <div>
            <div className="text-surface-500 mb-1.5">Guardians</div>
            <div className="flex flex-wrap gap-1">
              {stats.guardianAddresses.map((addr) => (
                <span key={addr} className="rounded bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-surface-400">
                  {shortenAddress(addr, 4)}
                </span>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
