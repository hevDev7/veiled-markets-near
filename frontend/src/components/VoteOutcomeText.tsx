import { VOTE_MOMENT_RULE } from '@/lib/near/market-time'

/**
 * The vote step's explainer, as one paragraph. JSX drops a line break between text and an expression, so the timing
 * rule stays on the line of the sentence before it.
 */
export function VoteOutcomeText({ bond, minVoters }: { bond: string; minVoters: number }) {
  return (
    <p className="text-xs text-surface-400 mt-1">
      Anyone can vote on the winning outcome with a <span className="text-white font-medium">{bond} bond</span>.{' '}
      {minVoters === 1 ? 'One vote is enough' : `${minVoters} voters are required`} before the market can advance.
      Wrong voters lose their bonds, and a disputed result goes to the committee. {VOTE_MOMENT_RULE}
    </p>
  )
}
