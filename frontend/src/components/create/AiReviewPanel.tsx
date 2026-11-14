import { useEffect, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, Loader2, RotateCw, Sparkles } from 'lucide-react'
import { afterReviewFailure, reviewFingerprint, reviewRequestOf, type MarketFormData, type ReviewState } from '@/lib/create/form'
import { AiBadRequest, AiUnavailable, requestReview, type ReviewScores } from '@/lib/create/market-ai-client'
import { cn } from '@/lib/utils'

const SCALES: { key: keyof ReviewScores; label: string; hint: string }[] = [
  { key: 'clarity', label: 'Clarity', hint: 'One reading, nothing left to argue about' },
  { key: 'verifiability', label: 'Verifiability', hint: 'Anyone can check the result' },
  { key: 'time_bounds', label: 'Timing', hint: 'Trading closes before the result is known, with time to publish it' },
  { key: 'source_quality', label: 'Source', hint: 'The resolver will find the deciding value in the source text' },
]

const tone = (score: number) => (score >= 7 ? 'yes' : score >= 4 ? 'mid' : 'no')

/**
 * The review step's AI review. "Run AI review" sends the market to Claude, which scores it 1–10 on four scales with
 * the text the resolver reads from the source today (for a catalog API, the same API for a recent past date, since it
 * shows nothing before the moment that counts). The page keeps the result with the fingerprint of what was
 * reviewed, so any later edit makes it out of date. When the AI cannot review this version, the panel reports a fall
 * back and the page shows the creator's tick instead; a failed re-run of a market the AI already judged keeps that
 * verdict, and a request the service refuses (400) is shown as something to fix.
 */
export function AiReviewPanel({ form, state, onState }: { form: MarketFormData; state: ReviewState; onState(s: ReviewState): void }) {
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const running = useRef<AbortController | null>(null)
  useEffect(() => () => running.current?.abort(), [])

  const fingerprint = reviewFingerprint(form)
  const result = state !== null && 'review' in state ? state : null
  const current = result !== null && result.fingerprint === fingerprint ? result.review : null

  const run = async () => {
    const input = reviewRequestOf(form)
    if (!input) {
      setFailure('Set both times in step 3 first.')
      return
    }
    const controller = new AbortController()
    running.current = controller
    setBusy(true)
    setFailure(null)
    try {
      const review = await requestReview(input, controller.signal)
      if (!controller.signal.aborted) onState({ fingerprint, review })
    } catch (e) {
      if (controller.signal.aborted) return
      if (e instanceof AiUnavailable) {
        const next = afterReviewFailure(state, fingerprint, e.message)
        if (next === state) setFailure(e.message)
        else onState(next)
      } else setFailure(e instanceof AiBadRequest ? e.message : 'The AI review failed. Try again in a minute.')
    } finally {
      if (!controller.signal.aborted) setBusy(false)
    }
  }

  return (
    <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-4">
      <div className="flex items-start gap-3">
        <Sparkles className="w-4 h-4 text-brand-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">AI review</p>
          <p className="text-xs text-surface-400 mt-1 leading-relaxed">
            Claude reads the market and the text the AI resolver gets from the source (for a known data API, the same
            API for a recent past date), and scores clarity, verifiability, timing and the source from 1 to 10. Create
            opens when every score is 7 or more.
          </p>
        </div>
      </div>

      {current && (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            {SCALES.map(({ key, label, hint }) => {
              const score = current.scores[key]
              const t = tone(score)
              return (
                <div key={key} className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-medium text-surface-200">{label}</span>
                    <span className={cn('text-sm font-semibold tabular-nums', t === 'yes' ? 'text-yes-400' : t === 'mid' ? 'text-yellow-300' : 'text-no-400')}>
                      {score}/10
                    </span>
                  </div>
                  <div className="mt-2 h-1 rounded-full bg-white/[0.05] overflow-hidden">
                    <div
                      className={cn('h-full rounded-full', t === 'yes' ? 'bg-yes-400' : t === 'mid' ? 'bg-yellow-300' : 'bg-no-400')}
                      style={{ width: `${score * 10}%` }}
                    />
                  </div>
                  <p className="text-2xs text-surface-500 mt-1.5">{hint}</p>
                </div>
              )
            })}
          </div>
          {current.critiques.length > 0 && (
            <div>
              <p className="text-xs font-medium text-surface-300 mb-1.5">What to improve</p>
              <ul className="space-y-1 list-disc pl-4 text-xs text-surface-400 leading-relaxed">
                {current.critiques.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            </div>
          )}
          <div
            className={cn(
              'p-3 rounded-lg flex items-start gap-2 border',
              current.ready ? 'bg-yes-500/[0.05] border-yes-500/[0.15]' : 'bg-no-500/[0.05] border-no-500/[0.18]',
            )}
            role="status"
          >
            {current.ready ? <CheckCircle2 className="w-4 h-4 text-yes-400 flex-shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 text-no-400 flex-shrink-0 mt-0.5" />}
            <p className={cn('text-xs leading-relaxed', current.ready ? 'text-yes-200' : 'text-no-200')}>
              {current.ready
                ? 'Ready to publish: every score is 7 or more.'
                : 'Not ready: every score must be 7 or more. Go back, fix what the review says, then run it again.'}
            </p>
          </div>
        </>
      )}

      {result && !current && !busy && (
        <p className="text-xs text-yellow-200">The market changed after the last AI review. Run it again.</p>
      )}

      {busy ? (
        <div className="flex items-center gap-2 text-xs text-surface-400" role="status">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Claude is reading the market and its source. This usually takes under a minute.
        </div>
      ) : (
        !current?.ready && (
          <button type="button" onClick={run} className="btn-secondary flex items-center gap-2 text-sm">
            {current ? <RotateCw className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
            {current ? 'Run AI review again' : 'Run AI review'}
          </button>
        )
      )}

      {failure && <p className="text-xs text-no-400" role="alert">{failure}</p>}
    </div>
  )
}
