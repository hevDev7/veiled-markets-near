import type { LucideIcon } from 'lucide-react'
import { LayoutTemplate, PenLine, Sparkles } from 'lucide-react'

export type StartKind = 'template' | 'manual' | 'ai'

interface Choice {
  kind: StartKind
  icon: LucideIcon
  title: string
  body: string
}

const CHOICES: Choice[] = [
  {
    kind: 'ai',
    icon: Sparkles,
    title: 'Describe it to AI',
    body: 'Write the idea in a sentence. AI drafts the question, the rules and a source the resolver can read; you check and edit everything before publishing.',
  },
  {
    kind: 'template',
    icon: LayoutTemplate,
    title: 'Use a template',
    body: 'A crypto price at a given minute, a stock close or a currency rate. Pick the asset, the threshold and the date; the question, rules, source and times are written for you.',
  },
  {
    kind: 'manual',
    icon: PenLine,
    title: 'Write it yourself',
    body: 'Your own question and rules, with a source the AI resolver can read. The rules box starts from the same pattern the templates use.',
  },
]

/** Step 1: how the creator wants to start. Every way ends in the same details, timing and review steps. */
export function StartStep({ aiEnabled, onPick }: { aiEnabled: boolean; onPick(kind: StartKind): void }) {
  const choices = CHOICES.filter((c) => aiEnabled || c.kind !== 'ai')
  return (
    <div className="glass-card p-6">
      <h2 className="text-lg font-semibold text-white">How do you want to start?</h2>
      <p className="text-sm text-surface-400 mt-1 mb-6 max-w-2xl">
        Every market is a Yes/No question with one source page. After trading closes, the AI resolver reads that page and
        casts the first vote.
      </p>
      <div className="grid gap-3">
        {choices.map((c) => (
          <button
            key={c.kind}
            type="button"
            onClick={() => onPick(c.kind)}
            className="group text-left flex items-start gap-4 p-5 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] hover:border-brand-400/[0.25] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40 transition-all"
          >
            <span className="w-10 h-10 rounded-lg bg-brand-400/[0.08] border border-brand-400/[0.12] flex items-center justify-center flex-shrink-0">
              <c.icon className="w-5 h-5 text-brand-400" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-white group-hover:text-brand-300 transition-colors">{c.title}</span>
              <span className="block text-xs text-surface-400 mt-1 leading-relaxed">{c.body}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
