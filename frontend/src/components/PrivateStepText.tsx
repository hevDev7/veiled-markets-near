import { useEffect, useState } from 'react'
import { onPrivateStep } from '@/lib/near/executor'
import type { PrivateStep } from '@/lib/near/private'

const LABEL: Record<PrivateStep, string> = {
  unlocking: 'Sign the message in your wallet to unlock your private balance…',
  syncing: 'Syncing your private notes…',
  merging: 'Merging your notes…',
  proving: 'Generating the zero-knowledge proof…',
  relaying: 'The relayer is submitting your trade…',
  done: 'Confirmed on NEAR.',
}

/** The step of the private action in flight; before the first step, a deposit may still need wallet approval. */
export function PrivateStepText({ fallback = 'Preparing your private trade. If your private balance is short, approve the deposit in your wallet.' }: { fallback?: string }) {
  const [step, setStep] = useState<PrivateStep | null>(null)
  useEffect(() => {
    const off = onPrivateStep(setStep)
    return () => {
      off()
    }
  }, [])
  return <>{step ? LABEL[step] : fallback}</>
}
