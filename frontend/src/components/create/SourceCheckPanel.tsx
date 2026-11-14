import { useEffect, useRef, useState } from 'react'
import { AlertCircle, AlertTriangle, CheckCircle2, Loader2, RotateCw } from 'lucide-react'
import { canRetryCheck, CheckServiceUnavailable, checkSourceRemote, type SourceCheck } from '@/lib/create/market-ai-client'
import { cn } from '@/lib/utils'

const DEBOUNCE_MS = 700

type PanelState =
  | { kind: 'empty' }
  | { kind: 'checking' }
  | { kind: 'done'; result: SourceCheck }
  | { kind: 'unavailable'; message: string }

/**
 * Asks the AI resolver whether it can read the resolution source, each time the source changes (debounced), and
 * shows the text it would read. `onResult(null, false)` means "not checked yet": the page keeps Next locked.
 */
export function SourceCheckPanel({ url, onResult }: { url: string; onResult(r: SourceCheck | null, unavailable: boolean): void }) {
  const [state, setState] = useState<PanelState>({ kind: 'empty' })
  const [attempt, setAttempt] = useState(0)
  const report = useRef(onResult)
  report.current = onResult
  const target = url.trim()

  useEffect(() => {
    report.current(null, false)
    if (!target) {
      setState({ kind: 'empty' })
      return
    }
    setState({ kind: 'checking' })
    const controller = new AbortController()
    const timer = setTimeout(() => {
      checkSourceRemote(target, controller.signal)
        .then((result) => {
          if (controller.signal.aborted) return
          setState({ kind: 'done', result })
          report.current(result, false)
        })
        .catch((e: unknown) => {
          if (controller.signal.aborted) return
          const message = e instanceof CheckServiceUnavailable ? e.message : 'The source check failed. Try again in a minute.'
          setState({ kind: 'unavailable', message })
          report.current(null, true)
        })
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [target, attempt])

  if (state.kind === 'empty') {
    return (
      <p className="text-2xs text-surface-500 mt-2 leading-relaxed">
        Link one page or API that will show the deciding value. After trading closes, the AI resolver reads that page as
        plain text, without running its JavaScript, and votes from what it finds there.
      </p>
    )
  }

  if (state.kind === 'checking') {
    return (
      <div className="flex items-center gap-2 mt-3 text-xs text-surface-400" role="status">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Checking whether the AI resolver can read this source…
      </div>
    )
  }

  if (state.kind === 'unavailable') {
    return (
      <div className="mt-3 p-3 rounded-xl bg-yellow-400/[0.06] border border-yellow-400/[0.15] flex items-start gap-2.5" role="alert">
        <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-yellow-200">{state.message}</p>
          <p className="text-2xs text-surface-400 mt-1">Markets can't be published until the source has been checked.</p>
        </div>
        <button
          type="button"
          onClick={() => setAttempt((n) => n + 1)}
          className="flex items-center gap-1 text-2xs font-medium text-yellow-200 hover:text-white transition-colors flex-shrink-0"
        >
          <RotateCw className="w-3 h-3" /> Check again
        </button>
      </div>
    )
  }

  const r = state.result
  const catalog = Boolean(r.checked_with)
  return (
    <div className="mt-3 space-y-2" role="status">
      <div
        className={cn(
          'p-3 rounded-xl flex items-start gap-2.5 border',
          r.ok ? 'bg-yes-500/[0.05] border-yes-500/[0.15]' : 'bg-no-500/[0.05] border-no-500/[0.18]',
        )}
      >
        {r.ok ? <CheckCircle2 className="w-4 h-4 text-yes-400 flex-shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 text-no-400 flex-shrink-0 mt-0.5" />}
        <p className={cn('flex-1 min-w-0 text-xs leading-relaxed', r.ok ? 'text-yes-200' : 'text-no-200')}>{r.message}</p>
        {canRetryCheck(r) ? (
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="flex items-center gap-1 text-2xs font-medium text-no-200 hover:text-white transition-colors flex-shrink-0"
          >
            <RotateCw className="w-3 h-3" /> Check again
          </button>
        ) : null}
      </div>
      {r.excerpt ? (
        <details open={r.ok && !catalog} className="rounded-xl bg-white/[0.02] border border-white/[0.04]">
          <summary className="cursor-pointer select-none px-3 py-2 text-2xs text-surface-400 hover:text-surface-200">
            {catalog ? 'What the past-date check read (first 2,000 characters)' : 'What the resolver reads (first 2,000 characters)'}
          </summary>
          <pre className="px-3 pb-3 max-h-56 overflow-auto whitespace-pre-wrap break-words text-2xs leading-relaxed text-surface-300 font-sans">
            {r.excerpt}
          </pre>
        </details>
      ) : null}
    </div>
  )
}
