import { MAX_METADATA } from '@/lib/near/chain'
import { cn } from '@/lib/utils'

/** The market's stored text against the contract's 2,048-byte limit. Counts UTF-8 bytes, as the chain does. */
export function SizeMeter({ bytes }: { bytes: number }) {
  const over = bytes > MAX_METADATA
  const share = Math.min(1, bytes / MAX_METADATA)
  const tone = over ? 'no' : share > 0.9 ? 'warn' : 'ok'
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-2xs mb-1.5">
        <span className="text-surface-400">Question, rules and source, as stored on chain</span>
        <span className={cn('tabular-nums', tone === 'no' ? 'text-no-400' : tone === 'warn' ? 'text-yellow-400' : 'text-surface-400')}>
          {bytes.toLocaleString('en-US')} / {MAX_METADATA.toLocaleString('en-US')} bytes
        </span>
      </div>
      <div
        className="h-1 rounded-full bg-white/[0.04] overflow-hidden"
        role="meter"
        aria-label="Size of the stored market text"
        aria-valuemin={0}
        aria-valuemax={MAX_METADATA}
        aria-valuenow={bytes}
      >
        <div
          className={cn('h-full rounded-full transition-all', tone === 'no' ? 'bg-no-400' : tone === 'warn' ? 'bg-yellow-400' : 'bg-brand-400')}
          style={{ width: `${share * 100}%` }}
        />
      </div>
      {over && (
        <p className="text-2xs text-no-400 mt-1.5">
          Shorten the question or rules by {(bytes - MAX_METADATA).toLocaleString('en-US')} bytes. Accented letters and emoji
          take 2 to 4 bytes each.
        </p>
      )}
    </div>
  )
}
