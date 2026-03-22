import { LayoutDashboard, TrendingUp, Plus, Vote, Settings } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useWalletStore } from '@/lib/store'

const items = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Markets' },
  { href: '/portfolio', icon: TrendingUp, label: 'Portfolio' },
  { href: '/create', icon: Plus, label: 'Create' },
  { href: '/governance', icon: Vote, label: 'Govern' },
]

export function MobileNav() {
  const location = useLocation()
  const { wallet } = useWalletStore()
  if (!wallet.connected) return null

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-surface-950/90 backdrop-blur-xl border-t border-white/[0.04]">
      <div className="flex items-center justify-around h-14">
        {items.map((item) => {
          const isActive = location.pathname === item.href
          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                'flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-all duration-200',
                isActive
                  ? 'text-brand-400'
                  : 'text-surface-500 hover:text-surface-300'
              )}
            >
              <item.icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
