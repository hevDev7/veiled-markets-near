/** Where a market is in its resolution, as the Resolve panel shows it. */
export type ResolveStep = 'close' | 'submit' | 'challenge' | 'disputed' | 'finalize' | 'cancel' | 'done'

/** How a stage chip shows: passed, the stage the market is at, or not reached. */
export type StepChip = 'complete' | 'current' | 'pending'

/** The stages a resolved market passes through, in contract order. */
const FLOW: ResolveStep[] = ['close', 'submit', 'challenge', 'finalize']

/**
 * The state of one stage chip while the market is at `current`. Cancel is not a stage after Settle but the other way
 * a market ends: it lights up only on a cancelled market, and then no other stage counts as passed, since a market
 * can be cancelled before any vote. A disputed market stays at Dispute until the committee decides.
 */
export function stepChip(chip: ResolveStep, current: ResolveStep): StepChip {
  if (chip === 'cancel') return current === 'cancel' ? 'current' : 'pending'
  if (current === 'cancel') return 'pending'
  if (current === 'done') return 'complete'
  const at = FLOW.indexOf(current === 'disputed' ? 'challenge' : current)
  const index = FLOW.indexOf(chip)
  return index < at ? 'complete' : index === at ? 'current' : 'pending'
}
