// ============================================================================
// VEILED GOVERNANCE — DelegateModal Component
// ============================================================================

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Users, AlertCircle, Loader2 } from 'lucide-react';
import { formatVeil } from '../../lib/governance-client';
import { useGovernanceStore } from '../../lib/governance-store';

interface DelegateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDelegate: (delegateAddress: string, amount: bigint) => Promise<void>;
}

export function DelegateModal({ isOpen, onClose, onDelegate }: DelegateModalProps) {
  const { veilBalance } = useGovernanceStore();

  const [delegateAddress, setDelegateAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      await onDelegate(delegateAddress, 0n);
    } catch (err) {
      console.warn('[Governance] Delegation is disabled in UI:', err);
    } finally {
      setIsSubmitting(false);
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
            className="bg-surface-900 border border-white/[0.06] rounded-2xl max-w-md w-full"
          >
            <div className="flex items-center justify-between p-5 border-b border-white/[0.06]">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-purple-400" />
                Delegate Voting Power
              </h2>
              <button onClick={onClose} className="text-surface-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-sm text-surface-400">
                New delegation submissions are disabled in the app for now. The contract still stores
                delegation balances, but the frontend does not surface delegated vote weight
                consistently enough to present this as a live feature yet.
              </p>

              <div>
                <label className="text-sm font-medium text-surface-300 mb-1.5 block">Delegate Address</label>
                <input
                  type="text"
                  value={delegateAddress}
                  onChange={(e) => setDelegateAddress(e.target.value)}
                  placeholder="aleo1..."
                  disabled
                  className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-surface-600 focus:outline-none focus:ring-2 focus:ring-purple-500/50 font-mono"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-surface-300 mb-1.5 block">Amount (ALEO)</label>
                <input
                  type="text"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  disabled
                  className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-surface-600 focus:outline-none focus:ring-2 focus:ring-purple-500/50 font-mono"
                />
                <div className="text-xs text-surface-500 mt-1">
                  Available: {formatVeil(veilBalance)} ALEO
                </div>
              </div>

              <div className="flex items-center gap-2 text-sm text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-2.5">
                <AlertCircle className="w-4 h-4 shrink-0" />
                Existing delegations should be managed outside this UI until live tally support is completed.
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-5 border-t border-white/[0.06]">
              <button onClick={onClose} className="px-5 py-2 text-sm text-surface-400 hover:text-white transition-colors">
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled
                className="flex items-center gap-2 px-5 py-2 bg-surface-700 disabled:text-surface-500 text-white rounded-xl text-sm font-medium transition-colors"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Temporarily Disabled
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
