import { calculateAllPrices, type AMMReserves } from './amm'
import { type Market } from './store'

export const OUTCOME_STYLE_TOKENS = [
  { text: 'text-yes-400', bg: 'bg-yes-500/8', border: 'border-yes-500/20', bar: 'bg-yes-500', dot: 'bg-yes-500' },
  { text: 'text-no-400', bg: 'bg-no-500/8', border: 'border-no-500/20', bar: 'bg-no-500', dot: 'bg-no-500' },
  { text: 'text-purple-400', bg: 'bg-purple-500/8', border: 'border-purple-500/20', bar: 'bg-purple-500', dot: 'bg-purple-500' },
  { text: 'text-yellow-400', bg: 'bg-yellow-500/8', border: 'border-yellow-500/20', bar: 'bg-yellow-500', dot: 'bg-yellow-500' },
] as const

type MarketOutcomeFields = Pick<
  Market,
  'numOutcomes' | 'outcomeLabels' | 'yesReserve' | 'noReserve' | 'reserve3' | 'reserve4'
> & Partial<Pick<Market, 'outcomePrices' | 'outcomePercentages' | 'outcomePayouts'>>

export interface MarketOutcomeSummary {
  index: number
  outcome: number
  label: string
  probability: number
  percentage: number
  payout: number
  reserve: bigint
  styles: (typeof OUTCOME_STYLE_TOKENS)[number]
}

export function getMarketOutcomeLabels(market: Pick<Market, 'numOutcomes' | 'outcomeLabels'>): string[] {
  const numOutcomes = Math.min(Math.max(market.numOutcomes ?? 2, 2), 4)
  const defaultLabels = numOutcomes === 2
    ? ['Yes', 'No']
    : Array.from({ length: numOutcomes }, (_, i) => `Outcome ${i + 1}`)

  return Array.from({ length: numOutcomes }, (_, i) => {
    const label = market.outcomeLabels?.[i]?.trim()
    return label && label.length > 0 ? label : defaultLabels[i]
  })
}

export function getMarketOutcomeSummaries(market: MarketOutcomeFields): MarketOutcomeSummary[] {
  const numOutcomes = Math.min(Math.max(market.numOutcomes ?? 2, 2), 4)
  const labels = getMarketOutcomeLabels(market)
  const reserves = [
    market.yesReserve ?? 0n,
    market.noReserve ?? 0n,
    market.reserve3 ?? 0n,
    market.reserve4 ?? 0n,
  ].slice(0, numOutcomes)

  const ammReserves: AMMReserves = {
    reserve_1: reserves[0] ?? 0n,
    reserve_2: reserves[1] ?? 0n,
    reserve_3: reserves[2] ?? 0n,
    reserve_4: reserves[3] ?? 0n,
    num_outcomes: numOutcomes,
  }

  const fallbackProbabilities = calculateAllPrices(ammReserves)
  const probabilities = market.outcomePrices?.length && market.outcomePrices.length >= numOutcomes
    ? market.outcomePrices.slice(0, numOutcomes).map(probability => Math.max(0, probability))
    : fallbackProbabilities
  const percentages = market.outcomePercentages?.length && market.outcomePercentages.length >= numOutcomes
    ? market.outcomePercentages.slice(0, numOutcomes).map(percentage => Math.max(0, percentage))
    : probabilities.map(probability => probability * 100)
  const payouts = market.outcomePayouts?.length && market.outcomePayouts.length >= numOutcomes
    ? market.outcomePayouts.slice(0, numOutcomes)
    : probabilities.map(probability => probability > 0 ? 1 / probability : numOutcomes)

  return labels.map((label, index) => {
    const probability = Math.max(0, probabilities[index] ?? (1 / numOutcomes))

    return {
      index,
      outcome: index + 1,
      label,
      probability,
      percentage: percentages[index] ?? (probability * 100),
      payout: payouts[index] ?? (probability > 0 ? 1 / probability : numOutcomes),
      reserve: reserves[index] ?? 0n,
      styles: OUTCOME_STYLE_TOKENS[index] || OUTCOME_STYLE_TOKENS[0],
    }
  })
}

export function getLeadingOutcome(market: MarketOutcomeFields): MarketOutcomeSummary | null {
  const outcomes = getMarketOutcomeSummaries(market)
  if (outcomes.length === 0) return null

  return outcomes.reduce((leading, outcome) => (
    outcome.percentage > leading.percentage ? outcome : leading
  ))
}

export function getOutcomeIndexFromBetKey(outcome: string): number | null {
  if (outcome === 'yes') return 0
  if (outcome === 'no') return 1

  const match = outcome.match(/^outcome_(\d+)$/)
  if (!match) return null

  const index = Number(match[1]) - 1
  return Number.isInteger(index) && index >= 0 ? index : null
}

export function getOutcomeSummaryForBet(
  market: MarketOutcomeFields,
  outcome: string,
): MarketOutcomeSummary | null {
  const index = getOutcomeIndexFromBetKey(outcome)
  if (index === null) return null

  return getMarketOutcomeSummaries(market)[index] ?? null
}
