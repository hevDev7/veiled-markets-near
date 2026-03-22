// ============================================================================
// VEILED GOVERNANCE — RewardClaimPanel Component
// ============================================================================

import { motion } from 'framer-motion';
import { Gift, TrendingUp, Droplets, Loader2 } from 'lucide-react';
import { formatVeil } from '../../lib/governance-client';
import { useGovernanceStore } from '../../lib/governance-store';

interface RewardClaimPanelProps {
  onClaimReward: (epochId: number, rewardType: 'lp' | 'trading') => Promise<void>;
}

export function RewardClaimPanel({ onClaimReward }: RewardClaimPanelProps) {
  const { unclaimedRewards, totalClaimable, isLoading } = useGovernanceStore();

  const lpRewards = unclaimedRewards.filter(r => r.rewardType === 'lp');
  const tradingRewards = unclaimedRewards.filter(r => r.rewardType === 'trading');
  const totalLpReward = lpRewards.reduce((sum, r) => sum + r.amount, 0n);
  const totalTradingReward = tradingRewards.reduce((sum, r) => sum + r.amount, 0n);

  return (
    <div className="bg-surface-900/60 backdrop-blur-sm border border-white/[0.06] rounded-2xl p-5">
      <h3 className="text-base font-bold text-white flex items-center gap-2 mb-4">
        <Gift className="w-5 h-5 text-emerald-400" />
        ALEO Rewards
      </h3>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-surface-500" />
        </div>
      ) : totalClaimable === 0n ? (
        <div className="text-center py-8 text-surface-500 text-sm">
          <Gift className="w-10 h-10 mx-auto mb-2 opacity-30" />
          No rewards to claim yet
          <p className="text-xs mt-1">Provide liquidity or trade to earn ALEO</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white/[0.02] rounded-xl p-3">
              <div className="flex items-center gap-1.5 text-xs text-blue-400 mb-1">
                <Droplets className="w-3.5 h-3.5" />
                LP Rewards
              </div>
              <div className="text-lg font-bold text-white">{formatVeil(totalLpReward)}</div>
              <div className="text-[10px] text-surface-500">{lpRewards.length} epochs</div>
            </div>
            <div className="bg-white/[0.02] rounded-xl p-3">
              <div className="flex items-center gap-1.5 text-xs text-purple-400 mb-1">
                <TrendingUp className="w-3.5 h-3.5" />
                Trading Rewards
              </div>
              <div className="text-lg font-bold text-white">{formatVeil(totalTradingReward)}</div>
              <div className="text-[10px] text-surface-500">{tradingRewards.length} epochs</div>
            </div>
          </div>

          {/* Individual Rewards */}
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {unclaimedRewards.map((reward) => (
              <motion.div
                key={`${reward.epochId}-${reward.rewardType}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center justify-between bg-surface-800/20 rounded-lg px-3 py-2"
              >
                <div>
                  <span className="text-xs text-surface-300">
                    Epoch #{reward.epochId} — {reward.rewardType === 'lp' ? 'LP' : 'Trading'}
                  </span>
                  <div className="text-sm font-medium text-white">{formatVeil(reward.amount)} ALEO</div>
                </div>
                <button
                  onClick={() => onClaimReward(reward.epochId, reward.rewardType)}
                  className="px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/30 transition-colors text-xs font-medium"
                >
                  Claim
                </button>
              </motion.div>
            ))}
          </div>

          {/* Claim All Button */}
          <button
            className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-medium text-sm transition-colors"
          >
            Claim All — {formatVeil(totalClaimable)} ALEO
          </button>
        </div>
      )}
    </div>
  );
}
