import { Link, useLocation } from 'react-router-dom'
import { LayoutDashboard, TrendingUp, History, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { name: 'Markets', href: '/dashboard', icon: LayoutDashboard },
  { name: 'My Bets', href: '/bets', icon: TrendingUp },
  { name: 'History', href: '/history', icon: History },
  { name: 'Settings', href: '/settings', icon: Settings },
]

export function MobileNav() {
  const location = useLocation()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden">
      <div className="bg-surface-950/90 backdrop-blur-xl border-t border-surface-800/50">
        <div className="grid grid-cols-4">
          {navItems.map((item) => {
            const isActive = location.pathname === item.href
            return (
              <Link
                key={item.name}
                to={item.href}
                className={cn(
                  'flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors',
                  isActive ? 'text-brand-400' : 'text-surface-500'
                )}
              >
                <item.icon className="w-5 h-5" />
                <span>{item.name}</span>
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
