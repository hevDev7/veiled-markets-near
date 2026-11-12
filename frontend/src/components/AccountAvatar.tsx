import { useMemo } from 'react'
import { User } from 'lucide-react'
import { accountAvatar } from '@/lib/account-avatar'
import { cn } from '@/lib/utils'

/**
 * The account's own picture (lib/account-avatar): one account shows the same pattern everywhere, and two accounts
 * show different ones. Without an account it is a plain person icon. Sizes that are multiples of 6 px keep the
 * pattern's cells on whole pixels.
 */
export function AccountAvatar({
  accountId,
  size = 24,
  className,
}: {
  accountId?: string | null
  size?: number
  className?: string
}) {
  const avatar = useMemo(() => (accountId ? accountAvatar(accountId) : null), [accountId])
  const box = cn('inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg', className)

  if (!avatar) {
    return (
      <span aria-hidden className={cn(box, 'bg-white/[0.06] text-surface-400')} style={{ width: size, height: size }}>
        <User style={{ width: size * 0.58, height: size * 0.58 }} />
      </span>
    )
  }

  return (
    <span aria-hidden className={box} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 6 6" shapeRendering="crispEdges">
        <rect width="6" height="6" fill={`hsl(${avatar.hue} 40% 16%)`} />
        {avatar.cells.flatMap((row, y) =>
          row.map((on, x) =>
            on ? <rect key={`${x}-${y}`} x={x + 0.5} y={y + 0.5} width="1" height="1" fill={`hsl(${avatar.hue} 80% 68%)`} /> : null,
          ),
        )}
      </svg>
    </span>
  )
}
