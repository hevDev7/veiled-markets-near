import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ENABLED_TOKEN_KEYS, tokenLabel } from '@/lib/near/config'

type TokenKey = (typeof ENABLED_TOKEN_KEYS)[number]

/** Official marks: NEAR's logomark, and the USDC icon Circle publishes in its token contract's ft_metadata. */
export const TOKEN_LOGO: Record<TokenKey, string> = {
  NEAR: '/near-logo.svg',
  USDCX: '/usdc-logo.svg',
}

const TOKEN_NAME: Record<TokenKey, string> = {
  NEAR: 'NEAR Protocol',
  USDCX: 'USD Coin (Circle)',
}

const asKey = (token?: string | null): TokenKey => (token === 'USDCX' ? 'USDCX' : 'NEAR')

export function TokenIcon({ token, className }: { token?: string | null; className?: string }) {
  const key = asKey(token)
  return <img src={TOKEN_LOGO[key]} alt={tokenLabel(key)} className={cn('h-5 w-5 flex-shrink-0 rounded-full', className)} />
}

/**
 * The token pill inside a trade amount field. A market holds one collateral token, set when it was created, so the
 * market's token is the one in use; the other supported token is listed with a link to the markets that use it.
 */
export function TokenSelect({ marketToken, className }: { marketToken?: string | null; className?: string }) {
  const active = asKey(marketToken)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] py-1 pl-1 pr-2 text-sm font-semibold text-white transition-colors hover:bg-white/[0.08]"
      >
        <TokenIcon token={active} />
        {tokenLabel(active)}
        <ChevronDown className={cn('h-3.5 w-3.5 text-surface-400 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 top-full z-30 mt-2 w-64 overflow-hidden rounded-xl border border-white/[0.08] bg-surface-900 p-1 shadow-[0_18px_50px_rgba(0,0,0,0.45)]"
        >
          {ENABLED_TOKEN_KEYS.map((key) => {
            const isActive = key === active
            return (
              <div
                key={key}
                role="option"
                aria-selected={isActive}
                aria-disabled={!isActive}
                className={cn('flex items-start gap-3 rounded-lg px-3 py-2.5', isActive ? 'bg-white/[0.04]' : 'opacity-80')}
              >
                <TokenIcon token={key} className="mt-0.5 h-7 w-7" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">{tokenLabel(key)}</span>
                    {isActive && <Check className="h-3.5 w-3.5 text-brand-400" />}
                  </div>
                  <p className="text-xs text-surface-500">{TOKEN_NAME[key]}</p>
                  {!isActive && (
                    <p className="mt-1 text-xs leading-relaxed text-surface-400">
                      This market trades in {tokenLabel(active)}.{' '}
                      <Link
                        to={`/dashboard?token=${key}`}
                        onClick={() => setOpen(false)}
                        className="font-medium text-brand-400 hover:text-brand-300"
                      >
                        Browse {tokenLabel(key)} markets →
                      </Link>
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
