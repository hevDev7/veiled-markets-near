import { cn } from '@/lib/utils'

type BadgeVariant = 'active' | 'closed' | 'resolved' | 'cancelled' | 'pending' | 'ended'
type BadgeSize = 'sm' | 'md'

interface StatusBadgeProps {
  variant: BadgeVariant
  label?: string
  size?: BadgeSize
  className?: string
}

const VARIANT_STYLES: Record<BadgeVariant, { bg: string; text: string; border: string; pulse?: boolean; defaultLabel: string }> = {
  active:    { bg: 'bg-yes-500/20',    text: 'text-yes-400',    border: 'border-yes-500/30',    pulse: true,  defaultLabel: 'ACTIVE' },
  closed:    { bg: 'bg-yellow-500/20',  text: 'text-yellow-400', border: 'border-yellow-500/30', pulse: false, defaultLabel: 'CLOSED' },
  resolved:  { bg: 'bg-brand-500/20',   text: 'text-brand-400',  border: 'border-brand-500/30',  pulse: false, defaultLabel: 'RESOLVED' },
  cancelled: { bg: 'bg-no-500/20',      text: 'text-no-400',     border: 'border-no-500/30',     pulse: false, defaultLabel: 'CANCELLED' },
  pending:   { bg: 'bg-purple-500/20',  text: 'text-purple-400', border: 'border-purple-500/30', pulse: true,  defaultLabel: 'PENDING' },
  ended:     { bg: 'bg-no-500/20',      text: 'text-no-400',     border: 'border-no-500/30',     pulse: false, defaultLabel: 'ENDED' },
}

const SIZE_STYLES: Record<BadgeSize, string> = {
  sm: 'px-2 py-0.5 text-[10px]',
  md: 'px-3 py-1 text-xs',
}

export function StatusBadge({ variant, label, size = 'sm', className }: StatusBadgeProps) {
  const style = VARIANT_STYLES[variant]

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-mono font-bold rounded border',
        style.bg, style.text, style.border,
        SIZE_STYLES[size],
        className,
      )}
    >
      {style.pulse && (
        <span className={cn('w-1.5 h-1.5 rounded-full animate-pulse', variant === 'active' ? 'bg-yes-400' : 'bg-purple-400')} />
      )}
      {label ?? style.defaultLabel}
    </span>
  )
}

/** Map on-chain market status number to StatusBadge variant */
export function getStatusVariant(status: number, isExpired: boolean): BadgeVariant {
  switch (status) {
    case 3: return 'resolved'
    case 4: return 'cancelled'
    case 2: return 'closed'
    case 5: return 'pending'
    default: return isExpired ? 'ended' : 'active'
  }
}
