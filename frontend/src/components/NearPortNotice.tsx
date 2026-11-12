import { Link } from 'react-router-dom'
import { Info } from 'lucide-react'

/** Shown on reference pages that were written for the Aleo version and still describe it. */
export function NearPortNotice({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-start gap-3 rounded-xl border border-brand-500/20 bg-brand-500/[0.05] px-4 py-3 text-sm text-surface-300 ${className}`}>
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
      <p className="leading-relaxed">
        This page was written for the Aleo version of Veiled Markets. The app now runs on NEAR testnet: trades stay
        private through a note pool and a relayer, the wallet is Meteor, and parlays and
        governance proposals are not deployed yet.{' '}
        <Link to="/how-it-works" className="text-brand-400 hover:text-brand-300">
          How it works on NEAR
        </Link>
      </p>
    </div>
  )
}
