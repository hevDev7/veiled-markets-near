import { motion } from 'framer-motion'
import { Shield, Eye, Lock, AlertTriangle, Info } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

interface PrivacyNoticeProps {
    variant?: 'info' | 'warning' | 'success'
    title?: string
    className?: string
}

export function PrivacyNotice({
    variant = 'info',
    title,
    className
}: PrivacyNoticeProps) {
    const [isExpanded, setIsExpanded] = useState(false)

    const config = {
        info: {
            icon: Shield,
            bgColor: 'bg-brand-500/10',
            borderColor: 'border-brand-500/30',
            textColor: 'text-brand-400',
            iconColor: 'text-brand-400'
        },
        warning: {
            icon: AlertTriangle,
            bgColor: 'bg-amber-500/10',
            borderColor: 'border-amber-500/30',
            textColor: 'text-amber-400',
            iconColor: 'text-amber-400'
        },
        success: {
            icon: Lock,
            bgColor: 'bg-yes-500/10',
            borderColor: 'border-yes-500/30',
            textColor: 'text-yes-400',
            iconColor: 'text-yes-400'
        }
    }

    const { icon: Icon, bgColor, borderColor, textColor, iconColor } = config[variant]

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
                'rounded-xl border p-4',
                bgColor,
                borderColor,
                className
            )}
        >
            <div className="flex items-start gap-3">
                <div className={cn('flex-shrink-0 mt-0.5', iconColor)}>
                    <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                    {title && (
                        <h4 className={cn('text-sm font-bold mb-2', textColor)}>
                            {title}
                        </h4>
                    )}
                    <div className={cn('text-sm space-y-2', textColor)}>
                        <p className="font-medium">
                            🔒 Your Privacy is Protected by Zero-Knowledge Proofs
                        </p>
                        <ul className="space-y-1 text-xs opacity-90">
                            <li className="flex items-start gap-2">
                                <Eye className="w-3 h-3 mt-0.5 flex-shrink-0" />
                                <span>Your bet amount is <strong>completely private</strong> - encrypted on-chain</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <Lock className="w-3 h-3 mt-0.5 flex-shrink-0" />
                                <span>Your position (YES/NO) is <strong>hidden</strong> - only you can decrypt it</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <Shield className="w-3 h-3 mt-0.5 flex-shrink-0" />
                                <span>No front-running or MEV attacks - <strong>transactions are private</strong></span>
                            </li>
                        </ul>

                        {isExpanded && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                className="pt-3 border-t border-current/20 space-y-2"
                            >
                                <p className="font-semibold">What's Private:</p>
                                <ul className="space-y-1 text-xs opacity-90 ml-4">
                                    <li>• Bet amount (fully encrypted)</li>
                                    <li>• Bet position (YES/NO hidden)</li>
                                    <li>• Winning claims (payout amounts private)</li>
                                    <li>• Your identity (not linked to bets)</li>
                                </ul>

                                <p className="font-semibold mt-3">What's Public:</p>
                                <ul className="space-y-1 text-xs opacity-90 ml-4">
                                    <li>• Market question and details</li>
                                    <li>• Total pool size (aggregate only)</li>
                                    <li>• Market resolution outcome</li>
                                    <li>• Pool distribution (YES/NO totals)</li>
                                </ul>

                                <p className="font-semibold mt-3">Privacy Best Practices:</p>
                                <ul className="space-y-1 text-xs opacity-90 ml-4">
                                    <li>• Use VPN/Tor for additional network privacy</li>
                                    <li>• Don't share your bet records publicly</li>
                                    <li>• Keep your wallet private key secure</li>
                                    <li>• Avoid discussing specific bet amounts publicly</li>
                                </ul>
                            </motion.div>
                        )}

                        <button
                            onClick={() => setIsExpanded(!isExpanded)}
                            className={cn(
                                'text-xs font-medium underline hover:no-underline transition-all mt-2',
                                textColor
                            )}
                        >
                            {isExpanded ? 'Show Less' : 'Learn More About Privacy'}
                        </button>
                    </div>
                </div>
            </div>
        </motion.div>
    )
}

export function PrivacyBadge({ className }: { className?: string }) {
    return (
        <div className={cn(
            'inline-flex items-center gap-1.5 px-2 py-1 rounded-lg',
            'bg-brand-500/10 border border-brand-500/20',
            className
        )}>
            <Shield className="w-3 h-3 text-brand-400" />
            <span className="text-xs font-mono text-brand-400">ZK_PRIVATE</span>
        </div>
    )
}

export function PrivacyWarning({ message, className }: { message: string; className?: string }) {
    return (
        <div className={cn(
            'flex items-start gap-2 p-3 rounded-lg',
            'bg-amber-500/10 border border-amber-500/30',
            className
        )}>
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-400">{message}</p>
        </div>
    )
}

export function PrivacyInfo({ message, className }: { message: string; className?: string }) {
    return (
        <div className={cn(
            'flex items-start gap-2 p-3 rounded-lg',
            'bg-brand-500/10 border border-brand-500/30',
            className
        )}>
            <Info className="w-4 h-4 text-brand-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-brand-400">{message}</p>
        </div>
    )
}
