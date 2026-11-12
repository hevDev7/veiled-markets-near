import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Menu, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { btnPrimary, btnSm, Container } from './shared'
import type { LaunchApp } from './data'

const NAV: { label: string; href: string; route?: boolean }[] = [
  { label: 'Markets', href: '#markets' },
  { label: 'Turbo', href: '/turbo', route: true },
  { label: 'Privacy', href: '#privacy' },
  { label: 'How it works', href: '#how' },
  { label: 'FAQ', href: '#faq' },
  { label: 'Docs', href: '/docs', route: true },
]

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <img src="/logo.png" alt="" width={34} height={34} className="h-[34px] w-[34px] rounded-[10px] object-cover" />
      <span className="font-display text-[19px] tracking-[-0.01em] text-[#f3efe6]">
        <span className="text-brand-300">Veiled</span> Markets
      </span>
    </span>
  )
}

function NavLink({ item, className, onClick }: { item: (typeof NAV)[number]; className: string; onClick?: () => void }) {
  return item.route ? (
    <Link to={item.href} className={className} onClick={onClick}>
      {item.label}
    </Link>
  ) : (
    <a href={item.href} className={className} onClick={onClick}>
      {item.label}
    </a>
  )
}

export function LandingNav({ app }: { app: LaunchApp }) {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-[background-color,border-color] duration-300',
        scrolled || open
          ? 'border-b border-white/[0.06] bg-[#07080b]/85 backdrop-blur-xl'
          : 'border-b border-transparent bg-transparent',
      )}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:rounded-full focus:bg-brand-400 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-[#0b0b0d]"
      >
        Skip to content
      </a>
      <Container className="flex h-16 items-center justify-between gap-6">
        <a href="#top" aria-label="Veiled Markets, back to top">
          <Wordmark />
        </a>

        <nav aria-label="Primary" className="hidden items-center gap-7 lg:flex">
          {NAV.map((item) => (
            <NavLink
              key={item.label}
              item={item}
              className="text-[14px] text-[#c4c8d0] transition-colors hover:text-[#f3efe6]"
            />
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={app.launch}
            disabled={app.connecting}
            className={cn(btnPrimary, btnSm, 'hidden sm:inline-flex')}
          >
            {app.connecting ? 'Connecting…' : 'Launch app'}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[#f3efe6] hover:bg-white/[0.06] lg:hidden"
            aria-expanded={open}
            aria-controls="landing-menu"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
          </button>
        </div>
      </Container>

      {open && (
        <div id="landing-menu" className="border-t border-white/[0.06] lg:hidden">
          <Container className="flex flex-col py-3">
            {NAV.map((item) => (
              <NavLink
                key={item.label}
                item={item}
                onClick={() => setOpen(false)}
                className="rounded-lg px-2 py-3 text-[16px] text-[#c4c8d0] hover:bg-white/[0.04] hover:text-[#f3efe6]"
              />
            ))}
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                app.launch()
              }}
              disabled={app.connecting}
              className={cn(btnPrimary, btnSm, 'mt-3 w-full sm:hidden')}
            >
              {app.connecting ? 'Connecting…' : 'Launch app'}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
          </Container>
        </div>
      )}
    </header>
  )
}
