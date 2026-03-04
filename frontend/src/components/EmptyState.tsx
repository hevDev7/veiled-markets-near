import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon: React.ReactNode
  title: string
  subtitle: string
  action?: { label: string; onClick: () => void }
  className?: string
}

export function EmptyState({ icon, title, subtitle, action, className }: EmptyStateProps) {
  return (
    <div className={cn('glass-card rounded-2xl py-16 text-center', className)}>
      <div className="w-16 h-16 rounded-2xl bg-surface-800/50 flex items-center justify-center mx-auto mb-4">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
      <p className="text-surface-400 text-sm mb-6 max-w-sm mx-auto">{subtitle}</p>
      {action && (
        <button onClick={action.onClick} className="btn-primary text-sm px-6 py-2.5">
          {action.label}
        </button>
      )}
    </div>
  )
}
