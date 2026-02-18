import { Check } from 'lucide-react'
import { cn, formatPercentage } from '@/lib/utils'

interface OutcomeSelectorProps {
  numOutcomes: number // 2-4
  outcomeLabels: string[]
  prices: number[] // 0-1 range per outcome
  selectedOutcome: number | null
  onSelect: (outcome: number) => void
  disabled?: boolean
}

// Color scheme per outcome index (1-indexed)
const OUTCOME_COLORS: Record<number, {
  border: string
  borderActive: string
  bg: string
  bgActive: string
  text: string
  glow: string
  check: string
}> = {
  1: {
    border: 'border-yes-500/50',
    borderActive: 'border-yes-500',
    bg: 'hover:bg-yes-500/5',
    bgActive: 'bg-yes-500/10',
    text: 'text-yes-400',
    glow: 'shadow-glow-yes',
    check: 'text-yes-400',
  },
  2: {
    border: 'border-no-500/50',
    borderActive: 'border-no-500',
    bg: 'hover:bg-no-500/5',
    bgActive: 'bg-no-500/10',
    text: 'text-no-400',
    glow: 'shadow-glow-no',
    check: 'text-no-400',
  },
  3: {
    border: 'border-purple-500/50',
    borderActive: 'border-purple-500',
    bg: 'hover:bg-purple-500/5',
    bgActive: 'bg-purple-500/10',
    text: 'text-purple-400',
    glow: 'shadow-[0_0_20px_rgba(168,85,247,0.2)]',
    check: 'text-purple-400',
  },
  4: {
    border: 'border-yellow-500/50',
    borderActive: 'border-yellow-500',
    bg: 'hover:bg-yellow-500/5',
    bgActive: 'bg-yellow-500/10',
    text: 'text-yellow-400',
    glow: 'shadow-[0_0_20px_rgba(234,179,8,0.2)]',
    check: 'text-yellow-400',
  },
}

export function OutcomeSelector({
  numOutcomes,
  outcomeLabels,
  prices,
  selectedOutcome,
  onSelect,
  disabled = false,
}: OutcomeSelectorProps) {
  const gridCols = numOutcomes <= 2 ? 'grid-cols-2' : numOutcomes === 3 ? 'grid-cols-3' : 'grid-cols-2'

  return (
    <div className={cn('grid gap-3', gridCols)}>
      {Array.from({ length: numOutcomes }, (_, i) => {
        const outcome = i + 1
        const isSelected = selectedOutcome === outcome
        const colors = OUTCOME_COLORS[outcome] || OUTCOME_COLORS[1]
        const label = outcomeLabels[i] || `Outcome ${outcome}`
        const price = prices[i] ?? (1 / numOutcomes)
        const percentage = price * 100

        return (
          <button
            key={outcome}
            onClick={() => !disabled && onSelect(outcome)}
            disabled={disabled}
            className={cn(
              'relative p-5 rounded-xl border-2 transition-all duration-200',
              disabled && 'opacity-60 cursor-not-allowed',
              isSelected
                ? cn(colors.borderActive, colors.bgActive, colors.glow)
                : cn('border-surface-700', colors.bg)
            )}
          >
            {isSelected && (
              <div className="absolute top-2 right-2">
                <Check className={cn('w-5 h-5', colors.check)} />
              </div>
            )}

            {/* Price / Probability */}
            <div className={cn('text-3xl font-bold mb-1', colors.text)}>
              {formatPercentage(percentage)}
            </div>

            {/* Label */}
            <div className="text-lg font-semibold text-white mb-2">
              {label}
            </div>

            {/* Implied odds */}
            <div className="text-sm text-surface-400">
              Price:{' '}
              <span className={cn('font-medium', colors.text)}>
                ${price.toFixed(3)}
              </span>
            </div>
          </button>
        )
      })}
    </div>
  )
}
