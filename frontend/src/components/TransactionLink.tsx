import { useState } from 'react'
import { ExternalLink, Copy, Check } from 'lucide-react'
import { getTransactionUrl } from '@/lib/config'

interface TransactionLinkProps {
    transactionId: string
    className?: string
    showCopy?: boolean
    showNote?: boolean
}

export function TransactionLink({
    transactionId,
    className = '',
    showCopy = true,
    showNote = true
}: TransactionLinkProps) {
    const [copied, setCopied] = useState(false)

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(transactionId)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch (err) {
            console.error('Failed to copy:', err)
        }
    }

    const url = getTransactionUrl(transactionId)

    return (
        <div className={`space-y-2 ${className}`}>
            {/* Transaction ID */}
            <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                    <p className="text-xs text-surface-500 mb-1">Transaction ID</p>
                    <p className="text-xs text-white font-mono break-all">
                        {transactionId}
                    </p>
                </div>
                {showCopy && (
                    <button
                        onClick={handleCopy}
                        className="p-2 rounded-lg hover:bg-surface-700 transition-colors flex-shrink-0"
                        title="Copy transaction ID"
                    >
                        {copied ? (
                            <Check className="w-4 h-4 text-yes-400" />
                        ) : (
                            <Copy className="w-4 h-4 text-surface-400" />
                        )}
                    </button>
                )}
            </div>

            {/* Explorer Link */}
            <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-brand-400 hover:text-brand-300 transition-colors"
            >
                <ExternalLink className="w-4 h-4" />
                <span>View on Provable Explorer</span>
            </a>

            {/* Note */}
            {showNote && (
                <div className="flex items-start gap-2 p-2 rounded-lg bg-surface-800/30">
                    <span className="text-sm">⏱️</span>
                    <p className="text-xs text-surface-400 leading-relaxed">
                        Transaction may take 30-60 seconds to appear on the explorer.
                        If you see "not found", please wait and refresh the page.
                    </p>
                </div>
            )}
        </div>
    )
}
