import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

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
  bar: string
  barBg: string
}> = {
  1: {
    border: 'border-yes-500/50',
    borderActive: 'border-yes-500',
    bg: 'hover:bg-yes-500/5',
    bgActive: 'bg-yes-500/10',
    text: 'text-yes-400',
    glow: 'shadow-glow-yes',
    check: 'text-yes-400',
    bar: 'bg-yes-500',
    barBg: 'bg-yes-500/10',
  },
  2: {
    border: 'border-no-500/50',
    borderActive: 'border-no-500',
    bg: 'hover:bg-no-500/5',
    bgActive: 'bg-no-500/10',
    text: 'text-no-400',
    glow: 'shadow-glow-no',
    check: 'text-no-400',
    bar: 'bg-no-500',
    barBg: 'bg-no-500/10',
  },
  3: {
    border: 'border-purple-500/50',
    borderActive: 'border-purple-500',
    bg: 'hover:bg-purple-500/5',
    bgActive: 'bg-purple-500/10',
    text: 'text-purple-400',
    glow: 'shadow-[0_0_20px_rgba(168,85,247,0.2)]',
    check: 'text-purple-400',
    bar: 'bg-purple-500',
    barBg: 'bg-purple-500/10',
  },
  4: {
    border: 'border-yellow-500/50',
    borderActive: 'border-yellow-500',
    bg: 'hover:bg-yellow-500/5',
    bgActive: 'bg-yellow-500/10',
    text: 'text-yellow-400',
    glow: 'shadow-[0_0_20px_rgba(234,179,8,0.2)]',
    check: 'text-yellow-400',
    bar: 'bg-yellow-500',
    barBg: 'bg-yellow-500/10',
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

  // 4-outcome: stacked rows with progress bars (Polymarket style)
  if (numOutcomes >= 4) {
    return (
      <div className="space-y-2">
        {Array.from({ length: numOutcomes }, (_, i) => {
          const outcome = i + 1
          const isSelected = selectedOutcome === outcome
          const colors = OUTCOME_COLORS[outcome] || OUTCOME_COLORS[1]
          const label = outcomeLabels[i] || `Outcome ${outcome}`
          const price = prices[i] ?? (1 / numOutcomes)
          const pct = Math.round(price * 100)

          return (
            <button
              key={outcome}
              onClick={() => !disabled && onSelect(outcome)}
              disabled={disabled}
              className={cn(
                'relative w-full rounded-xl border-2 transition-all duration-200 overflow-hidden',
                'flex items-center gap-3 px-4 py-3',
                disabled && 'opacity-60 cursor-not-allowed',
                isSelected
                  ? cn(colors.borderActive, colors.bgActive, colors.glow)
                  : cn('border-surface-700', colors.bg)
              )}
            >
              {/* Progress bar background */}
              <div
                className={cn('absolute inset-y-0 left-0 transition-all duration-500', colors.barBg)}
                style={{ width: `${Math.max(pct, 4)}%` }}
              />
              <div
                className={cn('absolute bottom-0 left-0 h-0.5 transition-all duration-500', colors.bar)}
                style={{ width: `${Math.max(pct, 4)}%` }}
              />

              {/* Content */}
              <div className="relative flex items-center justify-between w-full z-10">
                <div className="flex items-center gap-2.5">
                  {isSelected && (
                    <Check className={cn('w-4 h-4 flex-shrink-0', colors.check)} />
                  )}
                  <span className="font-semibold text-white text-sm leading-tight">
                    {label}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={cn('font-bold text-base tabular-nums', colors.text)}>
                    {pct}%
                  </span>
                  <span className={cn('text-xs tabular-nums', colors.text, 'opacity-70')}>
                    ${price.toFixed(2)}
                  </span>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    )
  }

  // 2-3 outcomes: grid layout (original)
  const gridCols = numOutcomes <= 2 ? 'grid-cols-2' : 'grid-cols-3'
  const isCompact = numOutcomes >= 3

  return (
    <div className={cn('grid gap-2', gridCols)}>
      {Array.from({ length: numOutcomes }, (_, i) => {
        const outcome = i + 1
        const isSelected = selectedOutcome === outcome
        const colors = OUTCOME_COLORS[outcome] || OUTCOME_COLORS[1]
        const label = outcomeLabels[i] || `Outcome ${outcome}`
        const price = prices[i] ?? (1 / numOutcomes)

        return (
          <button
            key={outcome}
            onClick={() => !disabled && onSelect(outcome)}
            disabled={disabled}
            className={cn(
              'relative rounded-xl border-2 transition-all duration-200 text-center',
              isCompact ? 'p-3' : 'p-5',
              disabled && 'opacity-60 cursor-not-allowed',
              isSelected
                ? cn(colors.borderActive, colors.bgActive, colors.glow)
                : cn('border-surface-700', colors.bg)
            )}
          >
            {isSelected && (
              <div className="absolute top-1.5 right-1.5">
                <Check className={cn(isCompact ? 'w-4 h-4' : 'w-5 h-5', colors.check)} />
              </div>
            )}

            {/* Label */}
            <div className={cn(
              'font-semibold text-white mb-1 leading-tight',
              isCompact ? 'text-sm' : 'text-lg'
            )}>
              {label}
            </div>

            {/* Price */}
            <div className={cn('font-bold', isCompact ? 'text-lg' : 'text-2xl', colors.text)}>
              ${price.toFixed(2)}
            </div>
          </button>
        )
      })}
    </div>
  )
}
