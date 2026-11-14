import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Loader2, Sparkles } from 'lucide-react'
import { CATEGORIES } from '@/lib/create/form'
import { AiBadRequest, AiUnavailable, requestDraft, type DraftResult } from '@/lib/create/market-ai-client'

const IDEA_MIN = 10
const IDEA_MAX = 500
const SELECT = 'input-field appearance-none'
const LABEL = 'text-xs font-medium text-surface-300 mb-1.5 block'

/**
 * Step 1, "Describe it to AI": an idea and an optional category become a draft market (question, rules, source,
 * times) that opens the details step. When the AI cannot draft, the creator is pointed to the other two ways.
 */
export function AiDraftForm({ onDrafted, onOther }: { onDrafted(r: DraftResult): void; onOther(kind: 'template' | 'manual'): void }) {
  const [idea, setIdea] = useState('')
  const [category, setCategory] = useState(0)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const running = useRef<AbortController | null>(null)
  useEffect(() => () => running.current?.abort(), [])

  const text = idea.trim()
  const canSend = !busy && text.length >= IDEA_MIN && text.length <= IDEA_MAX

  const generate = async () => {
    if (!canSend) return
    const controller = new AbortController()
    running.current = controller
    setBusy(true)
    setFailure(null)
    try {
      const result = await requestDraft(text, category || undefined, controller.signal)
      if (!controller.signal.aborted) onDrafted(result)
    } catch (e) {
      if (controller.signal.aborted) return
      setFailure(e instanceof AiUnavailable || e instanceof AiBadRequest ? e.message : 'The AI draft failed. Try again, or use a template.')
    } finally {
      if (!controller.signal.aborted) setBusy(false)
    }
  }

  return (
    <div className="glass-card p-6 space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-white">Describe it to AI</h2>
        <p className="text-sm text-surface-400 mt-1 max-w-2xl">
          Say what should happen, by when, and the threshold if there is one. Claude drafts a Yes/No question, the rules
          and a source the AI resolver can read; you check and edit all of it before publishing.
        </p>
      </div>

      <div>
        <label htmlFor="ai-idea" className={LABEL}>Market idea</label>
        <textarea
          id="ai-idea"
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          maxLength={IDEA_MAX}
          rows={3}
          disabled={busy}
          placeholder="Will ETH be above $4,000 at noon UTC next Friday?"
          className="input-field resize-none"
        />
        <div className="flex justify-between gap-4 mt-1 text-2xs text-surface-500">
          <span>{text.length > 0 && text.length < IDEA_MIN ? `At least ${IDEA_MIN} characters.` : ' '}</span>
          <span>{idea.length}/{IDEA_MAX}</span>
        </div>
      </div>

      <div className="sm:w-64">
        <label htmlFor="ai-category" className={LABEL}>Category</label>
        <select id="ai-category" value={category} onChange={(e) => setCategory(Number(e.target.value))} disabled={busy} className={SELECT}>
          <option value={0} className="bg-surface-900">Let AI choose</option>
          {CATEGORIES.map((c) => <option key={c.id} value={c.id} className="bg-surface-900">{c.name}</option>)}
        </select>
      </div>

      {busy && (
        <div className="flex items-center gap-2 text-xs text-surface-400" role="status">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Drafting the market and checking its source. This usually takes under a minute.
        </div>
      )}

      {failure && (
        <div className="p-3 rounded-xl bg-yellow-400/[0.06] border border-yellow-400/[0.15] flex items-start gap-2.5" role="alert">
          <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-yellow-200">{failure}</p>
            <p className="text-2xs text-surface-400 mt-1">
              You can still{' '}
              <button type="button" onClick={() => onOther('template')} className="text-brand-400 hover:text-brand-300 underline underline-offset-2">
                use a template
              </button>{' '}
              or{' '}
              <button type="button" onClick={() => onOther('manual')} className="text-brand-400 hover:text-brand-300 underline underline-offset-2">
                write it yourself
              </button>
              .
            </p>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={generate}
        disabled={!canSend}
        className="btn-primary w-full sm:w-auto flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        Generate with AI
      </button>
    </div>
  )
}
