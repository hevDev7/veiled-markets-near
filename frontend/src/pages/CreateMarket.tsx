import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowRight, ArrowLeft, AlertCircle, CheckCircle2, Lightbulb,
  Shield, Coins, ExternalLink,
  Check, Loader2, AlertTriangle, DollarSign,
  Upload, Link, Image, Sparkles,
} from 'lucide-react'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWalletStore } from '@/lib/store'
import { config } from '@/lib/config'
import { cn, formatCredits } from '@/lib/utils'
import { useAleoTransaction } from '@/hooks/useAleoTransaction'
import {
  hashToField, getCurrentBlockHeight, getTransactionUrl,
  getMappingValue,
  registerQuestionText, registerOutcomeLabels, registerMarketTransaction, setMarketThumbnailUrl,
  waitForMarketCreation, savePendingMarket, updatePendingMarketTxId,
} from '@/lib/aleo-client'
import { registerMarketInRegistry, isSupabaseAvailable } from '@/lib/supabase'
import { uploadMarketMetadata, uploadImageToIPFS, isPinataAvailable } from '@/lib/ipfs'
import { saveIPFSCid, getMarket } from '@/lib/aleo-client'
import { devWarn } from '@/lib/logger'
import { stashMarketMetadata } from '@/lib/near/executor'
import { DashboardHeader } from '@/components/DashboardHeader'
import { Footer } from '@/components/Footer'
import { PUBLIC_CALL_GAS_MICRO, ENABLED_TOKEN_KEYS, tokenLabel } from '@/lib/near/config'
import { isChainTxId } from '@/lib/near/config'
import { MAX_METADATA, metadataBytes } from '@/lib/near/chain'
import {
  CATEGORIES, DRAFT_KEY, METADATA_OUTCOMES, RULES_PATTERN, draftToForm, initialFormData, isTemplateUnedited, normalizeDraft,
  publishBlocker, reviewBlocker, reviewFellBack, reviewFingerprint, storedMetadata, toLocalFields, type MarketFormData, type ReviewState,
} from '@/lib/create/form'
import { draftingAvailable, type DraftResult, type SourceCheck } from '@/lib/create/market-ai-client'
import type { TemplateResult } from '@/lib/create/templates'
import { StartStep, type StartKind } from '@/components/create/StartStep'
import { TemplateForm } from '@/components/create/TemplateForm'
import { AiDraftForm } from '@/components/create/AiDraftForm'
import { AiReviewPanel } from '@/components/create/AiReviewPanel'
import { SourceCheckPanel } from '@/components/create/SourceCheckPanel'
import { SizeMeter } from '@/components/create/SizeMeter'

type CreateStep = 'start' | 'details' | 'timing' | 'review' | 'creating' | 'success' | 'error'

const STEP_LABELS = ['Start', 'Market details', 'Timing & liquidity', 'Review & publish']

function saveDraft(data: MarketFormData) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(data)) } catch {} }
/** A saved draft in today's shape: Yes/No only, USAD turned into NEAR (normalizeDraft). */
function loadDraft(): MarketFormData | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    return raw ? normalizeDraft(JSON.parse(raw)) : null
  } catch { return null }
}
function clearDraft() { try { localStorage.removeItem(DRAFT_KEY) } catch {} }
function hasFormContent(data: MarketFormData) { return data.question.trim() !== '' || data.description.trim() !== '' }

function getCreateMarketBalanceError(
  tokenType: 'NEAR' | 'USDCX' | 'USAD',
  liquidityMicro: bigint,
  balances: {
    public: bigint
    private: bigint
    usdcxPublic: bigint
    usdcxPrivate: bigint
    usadPublic: bigint
    usadPrivate: bigint
  },
): string | null {
  const feeMicro = PUBLIC_CALL_GAS_MICRO

  if (tokenType === 'NEAR') {
    const totalNeeded = liquidityMicro + feeMicro
    if (balances.public < totalNeeded) {
      return (
        `Insufficient wallet NEAR. Market creation uses NEAR from your wallet, not your private balance. ` +
        `Need ${formatCredits(totalNeeded)} NEAR total ` +
        `(${formatCredits(liquidityMicro)} NEAR liquidity + ${formatCredits(feeMicro)} NEAR gas), ` +
        `but only have ${formatCredits(balances.public)} public NEAR. ` +
        `Private NEAR available: ${formatCredits(balances.private)}.`
      )
    }
    return null
  }

  const label = tokenLabel(tokenType)
  const publicStableBalance = tokenType === 'USDCX' ? balances.usdcxPublic : balances.usadPublic
  const privateStableBalance = tokenType === 'USDCX' ? balances.usdcxPrivate : balances.usadPrivate
  if (publicStableBalance < liquidityMicro) {
    return (
      `Insufficient public ${label}. Market creation uses public ${label} for initial liquidity (ft_transfer_call). ` +
      `Need ${formatCredits(liquidityMicro)} ${label}, ` +
      `but only have ${formatCredits(publicStableBalance)} public ${label}.` +
      (privateStableBalance > 0n
        ? ` Private ${label} available: ${formatCredits(privateStableBalance)}. Withdraw it from your private balance (Portfolio) first.`
        : '')
    )
  }

  if (balances.public < PUBLIC_CALL_GAS_MICRO) {
    return (
      `Insufficient wallet NEAR for gas. Market creation also needs ${formatCredits(PUBLIC_CALL_GAS_MICRO)} NEAR ` +
      `for gas, but only have ${formatCredits(balances.public)} NEAR in your wallet.`
    )
  }

  return null
}

async function getStablecoinCreateFundingError(
  tokenType: 'USDCX' | 'USAD',
  address: string,
  liquidityMicro: bigint,
  balances: {
    public: bigint
    private: bigint
    usdcxPublic: bigint
    usdcxPrivate: bigint
    usadPublic: bigint
    usadPrivate: bigint
  },
): Promise<string | null> {
  const stableProgramId = tokenType === 'USAD' ? 'test_usad_stablecoin.aleo' : config.usdcxProgramId
  const label = tokenLabel(tokenType)
  const privateStableBalance = tokenType === 'USDCX' ? balances.usdcxPrivate : balances.usadPrivate

  try {
    const onChainPublicBalance = await getMappingValue<bigint>('balances', address, stableProgramId)
    const livePublicBalance = onChainPublicBalance ?? 0n

    if (livePublicBalance < liquidityMicro) {
      return (
        `On-chain public ${label} is too low for market creation. ` +
        `Market creation funds the initial liquidity from the ${label} in your wallet. ` +
        `Need ${formatCredits(liquidityMicro)} ${label}, but the stablecoin mapping shows ${formatCredits(livePublicBalance)} public ${label}.` +
        (privateStableBalance > 0n
          ? ` You still have ${formatCredits(privateStableBalance)} private ${label}; withdraw it from your private balance (Portfolio) first.`
          : '')
      )
    }
  } catch (error) {
    devWarn(`[CreateMarket] Failed to verify live public ${tokenType} balance:`, error)
  }

  return null
}

// ── Thumbnail Input (URL or file upload) ──
function ThumbnailInput({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const [mode, setMode] = useState<'url' | 'upload'>(value && !value.startsWith('blob:') ? 'url' : 'url')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate
    if (!file.type.startsWith('image/')) {
      setUploadError('Please select an image file')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('Image must be under 5MB')
      return
    }

    setUploadError(null)
    setUploading(true)

    // Show local preview immediately
    const localPreview = URL.createObjectURL(file)
    onChange(localPreview)

    // Upload to IPFS
    try {
      const ipfsUrl = await uploadImageToIPFS(file)
      if (ipfsUrl) {
        onChange(ipfsUrl)
        URL.revokeObjectURL(localPreview)
      } else {
        setUploadError('Upload failed. Using local preview — image may not persist.')
      }
    } catch {
      setUploadError('Upload failed. Using local preview.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      <label className="text-sm font-medium text-white mb-2 block">Thumbnail Image</label>
      {/* Mode toggle */}
      <div className="flex items-center gap-1 p-0.5 rounded-lg bg-white/[0.02] border border-white/[0.04] w-fit mb-3">
        <button onClick={() => setMode('url')}
          className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
            mode === 'url' ? 'bg-white/[0.06] text-white' : 'text-surface-500 hover:text-surface-300')}>
          <Link className="w-3 h-3" /> URL
        </button>
        <button onClick={() => setMode('upload')}
          className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
            mode === 'upload' ? 'bg-white/[0.06] text-white' : 'text-surface-500 hover:text-surface-300')}>
          <Upload className="w-3 h-3" /> Upload
        </button>
      </div>

      <div className="flex gap-3 items-start">
        <div className="flex-1">
          {mode === 'url' ? (
            <>
              <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
                placeholder="https://... image URL (optional)" className="input-field w-full" />
              <p className="text-2xs text-surface-500 mt-1.5">Paste an image URL. Leave empty for auto-detection.</p>
            </>
          ) : (
            <>
              <input ref={fileRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
              <button onClick={() => fileRef.current?.click()} disabled={uploading}
                className={cn(
                  'w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-dashed transition-all',
                  value && !uploading
                    ? 'border-yes-500/30 bg-yes-500/[0.04] text-yes-400'
                    : 'border-white/[0.08] bg-white/[0.02] text-surface-400 hover:border-white/[0.15] hover:bg-white/[0.04]'
                )}>
                {uploading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Uploading to IPFS...</>
                ) : value ? (
                  <><Check className="w-4 h-4" /> Image selected — click to change</>
                ) : (
                  <><Image className="w-4 h-4" /> Choose image file</>
                )}
              </button>
              <p className="text-2xs text-surface-500 mt-1.5">
                {isPinataAvailable() ? 'JPG, PNG, WebP — max 5MB. Uploaded to IPFS.' : 'IPFS not configured. Image will be stored as local preview only.'}
              </p>
              {uploadError && <p className="text-2xs text-no-400 mt-1">{uploadError}</p>}
            </>
          )}
        </div>

        {/* Preview */}
        <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 bg-surface-800 border border-white/[0.06] flex items-center justify-center">
          {value ? (
            <img src={value} alt="Preview" className="w-full h-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
          ) : (
            <Image className="w-4 h-4 text-surface-600" />
          )}
        </div>
      </div>

      {/* Clear button */}
      {value && (
        <button onClick={() => { onChange(''); if (fileRef.current) fileRef.current.value = '' }}
          className="text-2xs text-surface-500 hover:text-no-400 mt-2 transition-colors">
          Remove thumbnail
        </button>
      )}
    </div>
  )
}

export function CreateMarketPage() {
  const navigate = useNavigate()
  const { wallet } = useWalletStore()
  const { executeTransaction, pollTransactionStatus } = useAleoTransaction()
  const [step, setStep] = useState<CreateStep>('start')
  const [startMode, setStartMode] = useState<'choose' | 'template' | 'ai'>('choose')
  const [formData, setFormData] = useState<MarketFormData>(initialFormData)
  const [error, setError] = useState<string | null>(null)
  const [marketId, setMarketId] = useState<string | null>(null)
  const [isSlowTransaction, setIsSlowTransaction] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  // The resolver's answer for the source in the form (SourceCheckPanel); unavailable when the service can't answer.
  const [sourceCheck, setSourceCheck] = useState<{ result: SourceCheck | null; unavailable: boolean }>({ result: null, unavailable: false })
  // The review step's tick, tied to what it covers: changing the text, the source or a time clears it.
  const [confirmedFor, setConfirmedFor] = useState<string | null>(null)
  // AI drafting and review run only when the resolver service has them set up (its /health says so).
  const [aiEnabled, setAiEnabled] = useState(false)
  const [aiReview, setAiReview] = useState<ReviewState>(null)
  const [aiWarnings, setAiWarnings] = useState<string[]>([])

  useEffect(() => {
    const draft = loadDraft()
    if (draft && hasFormContent(draft)) { setFormData(draft); setStep('details') }
  }, [])

  useEffect(() => {
    let live = true
    draftingAvailable().then((on) => { if (live) setAiEnabled(on) })
    return () => { live = false }
  }, [])

  const updateForm = (updates: Partial<MarketFormData>) => {
    setFormData(prev => { const next = { ...prev, ...updates }; saveDraft(next); return next })
  }

  const onSourceResult = useCallback((result: SourceCheck | null, unavailable: boolean) => {
    setSourceCheck({ result, unavailable })
  }, [])

  const templateLocked = isTemplateUnedited(formData)
  const metaBytes = metadataBytes(storedMetadata(formData))
  const fingerprint = reviewFingerprint(formData)
  const confirmed = confirmedFor === fingerprint
  const aiFellBack = reviewFellBack(aiReview, fingerprint)
  // Unedited template: nothing to confirm. Otherwise an AI review of exactly this market, or the tick when the AI could
  // not review this version of it.
  const showAiReview = !templateLocked && aiEnabled && !aiFellBack
  const showTick = !templateLocked && !showAiReview
  const reviewMsg = reviewBlocker({ templateLocked, aiEnabled, state: aiReview, fingerprint, confirmed })
  const checkedSource = sourceCheck.result && sourceCheck.result.url === formData.resolutionSource.trim() ? sourceCheck.result : null

  const startWith = (kind: StartKind) => {
    setError(null)
    if (kind === 'ai') { setStartMode('ai'); return }
    if (kind === 'template') { setStartMode('template'); return }
    setAiWarnings([])
    setAiReview(null)
    setStartMode('choose')
    updateForm({ origin: 'manual', templateText: null, description: formData.description.trim() ? formData.description : RULES_PATTERN })
    setStep('details')
  }

  const applyDraft = (r: DraftResult) => {
    updateForm(draftToForm(r.draft))
    setAiWarnings(r.warnings)
    setAiReview(null)
    setStartMode('choose')
    setError(null)
    setStep('details')
  }

  const applyTemplate = (r: TemplateResult) => {
    const closes = toLocalFields(r.closesAt)
    const resolves = toLocalFields(r.resolutionDeadlineAt)
    updateForm({
      question: r.question,
      description: r.rules,
      resolutionSource: r.source,
      category: r.category,
      deadlineDate: closes.date,
      deadlineTime: closes.time,
      resolutionDeadlineDate: resolves.date,
      resolutionDeadlineTime: resolves.time,
      origin: 'template',
      templateText: { question: r.question, description: r.rules, resolutionSource: r.source },
    })
    setAiWarnings([])
    setAiReview(null)
    setStartMode('choose')
    setError(null)
    setStep('details')
  }

  const validateDetails = (): boolean => {
    if (!formData.question.trim()) { setError('Please enter a market question'); return false }
    if (formData.question.trim().length < 20) { setError('Question must be at least 20 characters'); return false }
    if (formData.question.trim().length > 500) { setError('Question must be at most 500 characters'); return false }
    if (!formData.category) { setError('Please select a category'); return false }
    if (sourceCheck.unavailable) { setError("The source check service can't be reached, so markets can't be published right now."); return false }
    if (!formData.resolutionSource.trim()) { setError('Add a resolution source URL the AI resolver can read.'); return false }
    if (!checkedSource) { setError('Wait for the source check to finish.'); return false }
    if (!checkedSource.ok) { setError(`Fix the resolution source first: ${checkedSource.message}`); return false }
    if (metaBytes > MAX_METADATA) {
      setError(`The question, rules and source take ${metaBytes.toLocaleString('en-US')} bytes; a market stores at most ${MAX_METADATA.toLocaleString('en-US')}. Shorten the rules.`)
      return false
    }
    setError(null); return true
  }

  const validateTiming = (): boolean => {
    const deadline = new Date(`${formData.deadlineDate}T${formData.deadlineTime}`)
    const resDeadline = new Date(`${formData.resolutionDeadlineDate}T${formData.resolutionDeadlineTime}`)
    const now = new Date()
    if (!formData.deadlineDate) { setError('Please set a betting deadline'); return false }
    if (deadline <= now) { setError('Deadline must be in the future'); return false }
    if (!formData.resolutionDeadlineDate) { setError('Please set a resolution deadline'); return false }
    if (resDeadline <= deadline) { setError('Resolution deadline must be after betting deadline'); return false }
    const minResMs = 6 * 60 * 60 * 1000
    if (resDeadline.getTime() - deadline.getTime() < minResMs) {
      setError('Resolution deadline must be at least 6 hours after betting deadline (3h voting + 3h dispute window)')
      return false
    }
    const liq = parseFloat(formData.initialLiquidity)
    if (isNaN(liq) || liq < 1) { setError('Initial liquidity must be at least 1 token'); return false }
    if (liq > 10_000) { setError('Initial liquidity cannot exceed 10,000 tokens'); return false }
    setError(null); return true
  }

  const handleNext = () => {
    if (step === 'details' && validateDetails()) setStep('timing')
    else if (step === 'timing' && validateTiming()) setStep('review')
  }

  const handleBack = () => {
    setError(null)
    if (step === 'start' && startMode !== 'choose') setStartMode('choose')
    else if (step === 'details') { setStartMode('choose'); setStep('start') }
    else if (step === 'timing') setStep('details')
    else if (step === 'review') setStep('timing')
  }

  // ═══════════════════════════════════════════
  // handleCreate — EXACT same logic from CreateMarketModal
  // ═══════════════════════════════════════════
  const handleCreate = async () => {
    if (isSubmitting) return
    const blocker = publishBlocker({ metaBytes, check: checkedSource, review: reviewMsg })
    if (blocker) { setError(blocker); return }
    if (!validateTiming()) { setStep('timing'); return }
    setIsSubmitting(true); setStep('creating'); setError(null)
    try {
      const questionHash = await hashToField(formData.question)
      if (!questionHash) throw new Error('Failed to generate question hash')
      const currentBlock = await getCurrentBlockHeight()
      const deadlineDate = new Date(`${formData.deadlineDate}T${formData.deadlineTime}`)
      const resolutionDate = new Date(`${formData.resolutionDeadlineDate}T${formData.resolutionDeadlineTime}`)
      const deadlineBlockHeight = currentBlock + BigInt(Math.floor((deadlineDate.getTime() - Date.now()) / config.msPerBlock))
      const resolutionBlockHeight = currentBlock + BigInt(Math.floor((resolutionDate.getTime() - Date.now()) / config.msPerBlock))

      const liquidityMicro = BigInt(Math.floor(parseFloat(formData.initialLiquidity || '10') * 1_000_000))
      const inputs = [
        String(questionHash),
        `${Number(formData.category)}u8`,
        '2u8', // every new market is Yes/No
        `${deadlineBlockHeight.toString()}u64`,
        `${resolutionBlockHeight.toString()}u64`,
        wallet.address!,
        wallet.address!,
        `${liquidityMicro}u128`,
      ]

      const createProgramId = formData.tokenType === 'USAD' ? config.usadProgramId
        : formData.tokenType === 'USDCX' ? config.usdcxMarketProgramId
        : config.programId

      // v33: No resolver whitelist — Open Voting + Bond system allows anyone to resolve

      for (let i = 0; i < inputs.length; i++) {
        if (typeof inputs[i] !== 'string' || !inputs[i]) throw new Error(`Input ${i} is invalid`)
      }
      if (deadlineBlockHeight <= currentBlock) throw new Error('Deadline must be in the future')
      if (resolutionBlockHeight <= deadlineBlockHeight) throw new Error('Resolution deadline must be after betting deadline')
      if (!wallet.isDemoMode) {
        const balanceError = getCreateMarketBalanceError(formData.tokenType, liquidityMicro, wallet.balance)
        if (balanceError) throw new Error(balanceError)
        if (formData.tokenType !== 'NEAR') {
          const fundingError = await getStablecoinCreateFundingError(
            formData.tokenType,
            wallet.address!,
            liquidityMicro,
            wallet.balance,
          )
          if (fundingError) throw new Error(fundingError)
        }
      }

      setIsSlowTransaction(false)
      const slowTimer = setTimeout(() => setIsSlowTransaction(true), 30_000)

      const createFn = formData.tokenType === 'USAD' ? 'create_market_usad' : formData.tokenType === 'USDCX' ? 'create_market_usdcx' : 'create_market'
      // NEAR: the question, outcome labels and details are stored on chain with the market (no IPFS/registry needed).
      // storedMetadata is also what the size meter measured, so nothing is trimmed on the way.
      stashMarketMetadata(String(questionHash), storedMetadata(formData))
      const txPromise = executeTransaction({ program: createProgramId, function: createFn, inputs, fee: 1.5 })
      const timeoutPromise = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Wallet did not respond within 2 minutes.')), 120_000))

      let result: { transactionId?: string }; let transactionId: string
      try { result = await Promise.race([txPromise, timeoutPromise]); transactionId = result?.transactionId || ''; if (!transactionId) throw new Error('No transaction ID returned') } finally { clearTimeout(slowTimer) }

      registerQuestionText(questionHash, formData.question)
      registerMarketTransaction(questionHash, transactionId)
      const activeLabels = METADATA_OUTCOMES
      registerOutcomeLabels(questionHash, activeLabels)
      if (formData.thumbnailUrl) {
        setMarketThumbnailUrl(questionHash, formData.thumbnailUrl)
      }

      let ipfsCid: string | null = null
      if (isPinataAvailable()) {
        try {
          ipfsCid = await uploadMarketMetadata({
            version: 1, question: formData.question, description: formData.description || '',
            category: formData.category, outcomeLabels: activeLabels,
            resolutionSource: formData.resolutionSource || '', questionHash,
            creator: wallet.address!, tokenType: formData.tokenType, createdAt: Date.now(),
          })
          if (ipfsCid) saveIPFSCid(questionHash, ipfsCid)
        } catch (err) { devWarn('[CreateMarket] IPFS upload failed:', err) }
      }

      setMarketId(transactionId); clearDraft(); setStep('success')
      savePendingMarket({
        questionHash,
        questionText: formData.question,
        transactionId,
        programId: createProgramId,
        tokenType: formData.tokenType,
        createdAt: Date.now(),
      })

      if (isSupabaseAvailable()) {
        registerMarketInRegistry({
          market_id: `pending_${transactionId}`, question_hash: questionHash, question_text: formData.question,
          description: formData.description || undefined, resolution_source: formData.resolutionSource || undefined,
          thumbnail_url: formData.thumbnailUrl || undefined,
          category: formData.category, creator_address: wallet.address!, transaction_id: transactionId,
          created_at: Date.now(), ipfs_cid: ipfsCid || undefined, outcome_labels: JSON.stringify(activeLabels),
        }).catch(err => devWarn('[CreateMarket] Early Supabase register failed:', err))
      }

      // Background resolution (same 3-strategy approach)
      const resolveAndRegister = async () => {
        let resolved = false
        const onMarketFound = async (actualMarketId: string, onChainTxId: string) => {
          if (resolved) return; resolved = true
          registerOutcomeLabels(actualMarketId, activeLabels)
          if (ipfsCid) saveIPFSCid(actualMarketId, ipfsCid)
          if (formData.thumbnailUrl) setMarketThumbnailUrl(actualMarketId, formData.thumbnailUrl)
          let creatorAddress = wallet.address!
          try { const m = await getMarket(actualMarketId); if (m?.creator) creatorAddress = m.creator } catch {}
          if (isSupabaseAvailable()) {
            registerMarketInRegistry({ market_id: actualMarketId, question_hash: questionHash, question_text: formData.question, description: formData.description || undefined, resolution_source: formData.resolutionSource || undefined, thumbnail_url: formData.thumbnailUrl || undefined, category: formData.category, creator_address: creatorAddress, transaction_id: onChainTxId || transactionId, created_at: Date.now(), ipfs_cid: ipfsCid || undefined, outcome_labels: JSON.stringify(activeLabels) }).catch(() => {})
            import('@/lib/supabase').then(({ supabase: sb }) => { if (sb) Promise.resolve(sb.from('market_registry').delete().eq('market_id', `pending_${transactionId}`)).catch(() => {}) }).catch(() => {})
          }
        }
        const strategy1 = async () => {
          if (transactionId.startsWith('demo_')) return
          let onChainTxId = transactionId
          if (!transactionId.startsWith('at1')) {
            onChainTxId = await new Promise<string>((resolve) => {
              let done = false; const finish = (id: string) => { if (!done) { done = true; resolve(id) } }
              setTimeout(() => finish(transactionId), transactionId.startsWith('shield_') ? 90_000 : 300_000)
              pollTransactionStatus(transactionId, (status, txId) => { if (txId?.startsWith('at1')) finish(txId); else if (status === 'confirmed') finish(txId || transactionId); else if (status === 'failed' || status === 'unknown') finish(transactionId) }, transactionId.startsWith('shield_') ? 8 : 30, 10_000)
            })
          }
          if (resolved) return
          if (onChainTxId.startsWith('at1')) {
            updatePendingMarketTxId(questionHash, onChainTxId)
            const r = await waitForMarketCreation(onChainTxId, questionHash, formData.question, 20, 15000, createProgramId)
            if (r && !resolved) onMarketFound(r.marketId, r.transactionId)
          }
        }
        const strategy2 = async () => {
          await new Promise(r => setTimeout(r, transactionId.startsWith('shield_') || transactionId.startsWith('demo_') ? 5_000 : 30_000))
          if (resolved) return
          const r = await waitForMarketCreation('scan', questionHash, formData.question, 20, 15000, createProgramId)
          if (r && !resolved) onMarketFound(r.marketId, r.transactionId)
          if (!resolved && (transactionId.startsWith('shield_') || transactionId.startsWith('demo_'))) {
            await new Promise(r2 => setTimeout(r2, 60_000))
            if (resolved) return
            const r3 = await waitForMarketCreation('scan', questionHash, formData.question, 20, 15000, createProgramId)
            if (r3 && !resolved) onMarketFound(r3.marketId, r3.transactionId)
          }
        }
        await Promise.allSettled([strategy1(), strategy2()])
      }
      resolveAndRegister().catch(console.error)
    } catch (err: unknown) {
      const errObj = err as any; const msg = errObj?.message || String(err)
      let errorMsg = msg
      if (msg.includes('abort')) errorMsg = 'Network request timed out.'
      else if (msg.includes('Resolver') && msg.includes('not approved')) errorMsg = msg
      else if (
        msg.toLowerCase().includes('rejected by user')
        || msg.toLowerCase().includes('user rejected')
        || msg.toLowerCase().includes('denied by user')
        || msg.toLowerCase().includes('cancelled by user')
        || msg.toLowerCase().includes('canceled by user')
      ) errorMsg = 'Transaction was rejected in your wallet.'
      setError(errorMsg); setStep('error'); setIsSubmitting(false)
    }
  }

  const deadline = formData.deadlineDate ? new Date(`${formData.deadlineDate}T${formData.deadlineTime}`) : null
  const resolutionDeadline = formData.resolutionDeadlineDate ? new Date(`${formData.resolutionDeadlineDate}T${formData.resolutionDeadlineTime}`) : null
  const selectedCategory = CATEGORIES.find(c => c.id === formData.category)
  const today = new Date().toISOString().split('T')[0]
  const minResDate = formData.deadlineDate || today
  const totalSteps = STEP_LABELS.length
  const stepNum = step === 'start' ? 1 : step === 'details' ? 2 : step === 'timing' ? 3 : 4
  const inForm = step === 'start' || step === 'details' || step === 'timing' || step === 'review'

  if (!wallet.connected) return null

  return (
    <div className="min-h-screen bg-surface-950 flex flex-col">
      <DashboardHeader />
      <main className="flex-1 pt-24 lg:pt-28 pb-20">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-12 gap-8">
            {/* Main Form */}
            <div className="lg:col-span-7 xl:col-span-8">
              {/* Header */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
                <h1 className="font-display text-[2.5rem] leading-[1.1] tracking-tight text-white mb-2">Create Market</h1>
                <p className="text-surface-400">A Yes/No market with a source the AI resolver can read</p>
              </motion.div>

              {/* Progress bar */}
              {inForm && (
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="mb-10">
                  <div className="flex items-center gap-2 mb-3">
                    {Array.from({ length: totalSteps }).map((_, i) => (
                      <div key={i} className="flex-1 h-1 rounded-full overflow-hidden bg-white/[0.04]">
                        <div className="h-full rounded-full transition-all duration-500"
                          style={{ width: stepNum > i + 1 ? '100%' : stepNum === i + 1 ? '50%' : '0%', background: stepNum > i ? 'linear-gradient(90deg, #c9a84c, #e7bf63)' : 'transparent' }} />
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-surface-500">Step {stepNum} of {totalSteps}</span>
                    <span className="text-xs text-brand-400 font-semibold">{STEP_LABELS[stepNum - 1]}</span>
                  </div>
                </motion.div>
              )}

              {/* Form Steps */}
              <AnimatePresence mode="wait">
                {step === 'start' && (
                  <motion.div key={`s0-${startMode}`} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }}>
                    {startMode === 'template'
                      ? <TemplateForm onBuilt={applyTemplate} />
                      : startMode === 'ai'
                        ? <AiDraftForm onDrafted={applyDraft} onOther={startWith} />
                        : <StartStep aiEnabled={aiEnabled} onPick={startWith} />}
                  </motion.div>
                )}

                {step === 'details' && (
                  <motion.div key="s1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }}>
                    <div className="glass-card p-6 space-y-6">
                      {templateLocked && (
                        <div className="flex items-start gap-3 p-4 rounded-xl bg-brand-400/[0.05] border border-brand-400/[0.12]">
                          <Shield className="w-4 h-4 text-brand-400 flex-shrink-0 mt-0.5" />
                          <p className="flex-1 text-xs text-surface-300 leading-relaxed">
                            Written by a template. The question, rules and source stay as they are, so they keep matching
                            the source; editing them makes this a hand-written market that you confirm yourself.
                          </p>
                          <button type="button" onClick={() => updateForm({ origin: 'manual', templateText: null })}
                            className="text-xs font-medium text-brand-400 hover:text-brand-300 flex-shrink-0 transition-colors">
                            Edit the text
                          </button>
                        </div>
                      )}
                      {formData.origin === 'ai' && (
                        <div className="flex items-start gap-3 p-4 rounded-xl bg-brand-400/[0.05] border border-brand-400/[0.12]">
                          <Sparkles className="w-4 h-4 text-brand-400 flex-shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0 text-xs text-surface-300 leading-relaxed">
                            <p>Drafted by AI. Read the question, rules and source, and edit anything that is not what you meant.</p>
                            {aiWarnings.length > 0 && (
                              <ul className="mt-2 space-y-1 list-disc pl-4 text-surface-400">
                                {aiWarnings.map((w, i) => <li key={i}>{w}</li>)}
                              </ul>
                            )}
                          </div>
                        </div>
                      )}
                      <div>
                        <label htmlFor="cm-question" className="text-sm font-medium text-white mb-2 block">Market Question *</label>
                        <textarea id="cm-question" value={formData.question} onChange={(e) => updateForm({ question: e.target.value })} readOnly={templateLocked}
                          placeholder="Will NVDA close above $200 on November 20, 2026?" className={cn('input-field w-full h-24 resize-none', templateLocked && 'opacity-80')} maxLength={500} />
                        <p className="text-2xs text-surface-500 mt-2">{formData.question.length}/500 — a Yes/No question about one value on one date</p>
                      </div>
                      <div>
                        <label htmlFor="cm-rules" className="text-sm font-medium text-white mb-2 block">Rules</label>
                        <textarea id="cm-rules" value={formData.description} onChange={(e) => updateForm({ description: e.target.value })} readOnly={templateLocked}
                          placeholder="When the market resolves Yes, which value in the source decides it, and what happens in edge cases."
                          rows={8} className={cn('input-field w-full resize-y text-sm leading-relaxed', templateLocked && 'opacity-80')} />
                        <div className="mt-3">
                          <SizeMeter bytes={metaBytes} />
                        </div>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-white mb-3 block">Category *</label>
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                          {CATEGORIES.map((cat) => (
                            <button key={cat.id} onClick={() => updateForm({ category: cat.id })}
                              className={cn('flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium transition-all duration-200',
                                formData.category === cat.id ? 'bg-brand-400/[0.12] text-brand-400 border border-brand-400/[0.2]' : 'bg-white/[0.02] text-surface-400 border border-white/[0.04] hover:bg-white/[0.04]')}>
                              <span>{cat.emoji}</span>{cat.name}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label htmlFor="cm-source" className="text-sm font-medium text-white mb-2 block">Resolution source URL *</label>
                        <input id="cm-source" type="url" inputMode="url" value={formData.resolutionSource} onChange={(e) => updateForm({ resolutionSource: e.target.value })} readOnly={templateLocked}
                          placeholder="https://… a page or API the resolver can read" className={cn('input-field w-full', templateLocked && 'opacity-80')} autoComplete="off" spellCheck={false} />
                        <SourceCheckPanel url={formData.resolutionSource} onResult={onSourceResult} />
                      </div>
                      <ThumbnailInput
                        value={formData.thumbnailUrl}
                        onChange={(url) => updateForm({ thumbnailUrl: url })}
                      />
                      <div>
                        <span className="text-sm font-medium text-white mb-2 block">Outcomes</span>
                        <div className="flex items-center gap-2">
                          <span className="px-4 py-2 rounded-lg text-sm font-semibold bg-yes-500/[0.08] text-yes-400 border border-yes-500/[0.15]">Yes</span>
                          <span className="px-4 py-2 rounded-lg text-sm font-semibold bg-no-500/[0.08] text-no-400 border border-no-500/[0.15]">No</span>
                        </div>
                        <p className="text-2xs text-surface-500 mt-2">Every market is Yes/No: write the question so that Yes and No cover every case.</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-white mb-3 block">Betting Token</label>
                        <div className="grid grid-cols-2 gap-3">
                          {ENABLED_TOKEN_KEYS.map((t) => (
                            <button key={t} onClick={() => updateForm({ tokenType: t })}
                              className={cn('p-3 rounded-xl text-center transition-all', formData.tokenType === t ? 'bg-brand-400/[0.12] border border-brand-400/[0.2]' : 'bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04]')}>
                              <span className="text-lg font-semibold text-white block">{tokenLabel(t)}</span>
                              <span className="text-2xs text-surface-400">{t === 'NEAR' ? 'Native' : 'Circle stablecoin'}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {step === 'timing' && (
                  <motion.div key="s2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }}>
                    <div className="glass-card p-6 space-y-6">
                      <div>
                        <label className="text-sm font-medium text-white mb-2 block">Betting Deadline *</label>
                        <p className="text-2xs text-surface-500 mb-3">
                          {templateLocked
                            ? 'Set by the template: trading closes when the deciding value becomes known. Shown in your local time.'
                            : 'After this time, no new bets can be placed. Close trading before the deciding value can be known.'}
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                          <input type="date" aria-label="Betting deadline date" value={formData.deadlineDate} onChange={(e) => updateForm({ deadlineDate: e.target.value })} min={today} disabled={templateLocked} className={cn('input-field', templateLocked && 'opacity-70 cursor-not-allowed')} />
                          <input type="time" aria-label="Betting deadline time" value={formData.deadlineTime} onChange={(e) => updateForm({ deadlineTime: e.target.value })} disabled={templateLocked} className={cn('input-field', templateLocked && 'opacity-70 cursor-not-allowed')} />
                        </div>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-white mb-2 block">Resolution Deadline *</label>
                        <p className="text-[10px] text-surface-500 mb-1">Must be resolved by this time. If not, it can be cancelled for refunds.</p>
                        <p className="text-[10px] text-yellow-400/80 mb-3">Must be at least 6 hours after betting deadline (3h voting + 3h dispute)</p>
                        <div className="grid grid-cols-2 gap-3">
                          <input type="date" value={formData.resolutionDeadlineDate} onChange={(e) => updateForm({ resolutionDeadlineDate: e.target.value })} min={minResDate} className="input-field" />
                          <input type="time" value={formData.resolutionDeadlineTime} onChange={(e) => updateForm({ resolutionDeadlineTime: e.target.value })} className="input-field" />
                        </div>
                        {formData.deadlineDate && formData.resolutionDeadlineDate && (() => {
                          const dl = new Date(`${formData.deadlineDate}T${formData.deadlineTime}`)
                          const rd = new Date(`${formData.resolutionDeadlineDate}T${formData.resolutionDeadlineTime}`)
                          const diffMs = rd.getTime() - dl.getTime()
                          const minMs = 6 * 60 * 60 * 1000
                          if (diffMs > 0 && diffMs < minMs) {
                            const minTime = new Date(dl.getTime() + minMs)
                            const minTimeStr = minTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                            const minDateStr = minTime.toLocaleDateString([], { month: 'short', day: 'numeric' })
                            return <p className="text-xs text-no-400 mt-2">Too close — resolution must be after {minDateStr} {minTimeStr} (6h after betting deadline)</p>
                          }
                          if (diffMs > 0 && diffMs >= minMs) {
                            const hours = Math.floor(diffMs / (60 * 60 * 1000))
                            const mins = Math.floor((diffMs % (60 * 60 * 1000)) / (60 * 1000))
                            return <p className="text-xs text-yes-400/60 mt-2">Duration OK — {hours}h {mins}m after betting deadline</p>
                          }
                          return null
                        })()}
                      </div>
                      <div>
                        <label className="text-sm font-medium text-white mb-2 block">Initial Liquidity ({tokenLabel(formData.tokenType)}) *</label>
                        <div className="relative">
                          <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
                          <input type="number" value={formData.initialLiquidity} onChange={(e) => updateForm({ initialLiquidity: e.target.value })} placeholder="10" min="1" className="input-field pl-10 text-lg font-semibold" />
                        </div>
                        <p className="text-2xs text-surface-500 mt-2">
                          Seeds the AMM pool. Split equally across outcomes.
                          {formData.tokenType === 'NEAR'
                            ? ' Uses public NEAR balance; private credits cannot be used here.'
                            : ` Uses public ${tokenLabel(formData.tokenType)} balance, plus 1.5 public NEAR for the network fee.`}
                        </p>
                      </div>
                      {deadline && resolutionDeadline && (
                        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04] space-y-3">
                          <h4 className="text-sm font-medium text-white">Timeline Preview</h4>
                          {[
                            { color: 'bg-yes-400', label: 'Betting Open', range: `Now → ${deadline.toLocaleDateString()}` },
                            { color: 'bg-brand-400', label: 'Awaiting Resolution', range: `${deadline.toLocaleDateString()} → ${resolutionDeadline.toLocaleDateString()}` },
                            { color: 'bg-surface-400', label: 'Resolved & Payouts', range: 'After resolution' },
                          ].map((t) => (
                            <div key={t.label} className="flex items-center gap-3">
                              <div className={cn('w-3 h-3 rounded-full', t.color)} />
                              <div><p className="text-sm text-white">{t.label}</p><p className="text-xs text-surface-500">{t.range}</p></div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}

                {step === 'review' && (
                  <motion.div key="s3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }}>
                    <div className="glass-card p-6 space-y-6">
                      <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04] space-y-4">
                        {[
                          { label: 'Question', value: formData.question },
                          { label: 'Category', value: `${selectedCategory?.emoji} ${selectedCategory?.name}` },
                          { label: 'Outcomes', value: METADATA_OUTCOMES.join(', ') },
                          { label: 'Token', value: tokenLabel(formData.tokenType) },
                          { label: 'Liquidity', value: `${formData.initialLiquidity} ${tokenLabel(formData.tokenType)}` },
                          { label: 'Betting Ends', value: deadline?.toLocaleString() || 'Not set' },
                          { label: 'Resolution', value: resolutionDeadline?.toLocaleString() || 'Not set' },
                          { label: 'Resolution source', value: formData.resolutionSource || 'Not specified' },
                          { label: 'Creator', value: `${wallet.address?.slice(0, 12)}...${wallet.address?.slice(-6)}` },
                        ].map((item) => (
                          <div key={item.label} className="flex items-start justify-between gap-4">
                            <span className="text-xs text-surface-500 flex-shrink-0">{item.label}</span>
                            <span className="text-xs font-medium text-white text-right break-all">{item.value}</span>
                          </div>
                        ))}
                      </div>
                      {showAiReview ? (
                        <AiReviewPanel form={formData} state={aiReview} onState={setAiReview} />
                      ) : showTick ? (
                        <div className="space-y-3">
                          {aiReview !== null && 'fallback' in aiReview && (
                            <div className="p-3 rounded-xl bg-yellow-400/[0.06] border border-yellow-400/[0.15] flex items-start gap-2.5" role="alert">
                              <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-yellow-200">The AI review is unavailable: {aiReview.message}</p>
                                <p className="text-2xs text-surface-400 mt-1">Check the source yourself and tick the box below instead.</p>
                              </div>
                              <button type="button" onClick={() => setAiReview(null)}
                                className="text-2xs font-medium text-yellow-200 hover:text-white transition-colors flex-shrink-0">
                                Try the AI review again
                              </button>
                            </div>
                          )}
                          <label className="flex items-start gap-3 p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] cursor-pointer hover:border-brand-400/[0.2] transition-colors">
                            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmedFor(e.target.checked ? fingerprint : null)}
                              className="mt-0.5 h-4 w-4 flex-shrink-0 accent-[#c9a84c]" />
                            <span className="text-xs text-surface-300 leading-relaxed">
                              The value that decides this market appears in the source text shown in step 2.
                              <span className="block text-surface-500 mt-1">
                                The AI resolver votes only from that page. Changing the question, rules, source or a time clears this tick.
                              </span>
                            </span>
                          </label>
                        </div>
                      ) : (
                        <div className="flex items-start gap-3 p-4 rounded-xl bg-yes-500/[0.04] border border-yes-500/[0.12]">
                          <CheckCircle2 className="w-4 h-4 text-yes-400 flex-shrink-0 mt-0.5" />
                          <p className="text-xs text-surface-300 leading-relaxed">
                            Built from a template with a known data source, checked with a past date in step 2.
                          </p>
                        </div>
                      )}
                      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-brand-400/[0.04] border border-brand-400/[0.08]">
                        <Coins className="w-4 h-4 text-brand-400 flex-shrink-0" />
                        <p className="text-xs text-surface-300">As creator, you earn <strong className="text-brand-400">0.5%</strong> of all trading volume. Total fee: 2% per trade.</p>
                      </div>
                    </div>
                  </motion.div>
                )}

                {step === 'creating' && (
                  <motion.div key="creating" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card p-12 text-center">
                    <Loader2 className="w-12 h-12 text-brand-400 animate-spin mx-auto mb-4" />
                    <h3 className="text-xl font-display font-bold text-white mb-2">Creating Market...</h3>
                    <p className="text-surface-400">Please confirm the transaction in your wallet.</p>
                    {isSlowTransaction && (
                      <div className="mt-4 p-3 rounded-lg bg-brand-400/[0.06] border border-brand-400/[0.1]">
                        <p className="text-sm text-brand-300">
                          {wallet.walletType === 'shield' ? 'Shield Wallet is processing... This may take 30-60 seconds.' : 'Generating zero-knowledge proof. This can take 30-60 seconds.'}
                        </p>
                      </div>
                    )}
                  </motion.div>
                )}

                {step === 'success' && (
                  <motion.div key="success" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="glass-card p-12 text-center">
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', delay: 0.2 }}
                      className="w-20 h-20 rounded-full bg-yes-400/[0.1] mx-auto mb-6 flex items-center justify-center shadow-glow-yes">
                      <Check className="w-10 h-10 text-yes-400" />
                    </motion.div>
                    <h3 className="text-2xl font-display font-bold text-white mb-2">Transaction Submitted!</h3>
                    <p className="text-surface-400 mb-6">Your market creation transaction has been sent to the network.</p>
                    <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04] mb-4 text-left">
                      <p className="text-2xs text-surface-500 uppercase tracking-wider mb-1">{isChainTxId(marketId) ? 'Transaction ID' : 'Wallet Request ID'}</p>
                      <p className="text-sm text-white font-mono break-all">{marketId}</p>
                      {isChainTxId(marketId) && (
                        <a href={getTransactionUrl(marketId)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300 mt-2">
                          View on Explorer <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                    <div className="p-4 rounded-xl bg-brand-400/[0.06] border border-brand-400/[0.1] mb-6 text-left flex items-start gap-3">
                      <Loader2 className="w-5 h-5 text-brand-400 flex-shrink-0 mt-0.5 animate-spin" />
                      <div>
                        <p className="text-sm font-medium text-brand-300">Waiting for on-chain confirmation...</p>
                        <p className="text-xs text-surface-400 mt-1">This can take 1-3 minutes. You can navigate away — the process continues in the background.</p>
                      </div>
                    </div>
                    <button onClick={() => navigate('/dashboard')} className="btn-primary w-full">Back to Markets</button>
                  </motion.div>
                )}

                {step === 'error' && (
                  <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card p-12 text-center">
                    <div className="w-16 h-16 rounded-full bg-no-400/[0.1] flex items-center justify-center mx-auto mb-4">
                      <AlertCircle className="w-8 h-8 text-no-400" />
                    </div>
                    <h3 className="text-xl font-display font-bold text-white mb-2">Creation Failed</h3>
                    <p className="text-surface-400 mb-6 text-sm">{error}</p>
                    <div className="flex gap-3">
                      <button onClick={() => { setStep('review'); setIsSubmitting(false) }} className="flex-1 btn-secondary">Go Back</button>
                      <button onClick={handleCreate} className="flex-1 btn-primary">Try Again</button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Navigation buttons */}
              {inForm && (
                <div className="flex items-center justify-between gap-4 mt-8">
                  {step === 'start' && startMode === 'choose' ? (
                    <button onClick={() => navigate('/dashboard')} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-surface-400 hover:text-white hover:bg-white/[0.04] transition-all">
                      <ArrowLeft className="w-4 h-4" />Cancel
                    </button>
                  ) : (
                    <button onClick={handleBack} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-surface-400 hover:text-white hover:bg-white/[0.04] transition-all">
                      <ArrowLeft className="w-4 h-4" />Back
                    </button>
                  )}
                  {error && <p className="text-no-400 text-xs max-w-sm text-center" role="alert">{error}</p>}
                  {step === 'start' ? null : step !== 'review' ? (
                    <button onClick={handleNext} className="btn-primary flex items-center gap-2">Continue <ArrowRight className="w-4 h-4" /></button>
                  ) : (
                    <button onClick={handleCreate} disabled={isSubmitting || reviewMsg !== null} title={reviewMsg ?? undefined} className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                      <Shield className="w-4 h-4" />Create Market
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Side Panel — Tips */}
            <div className="lg:col-span-5 xl:col-span-4 lg:mt-[168px]">
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="sticky top-24 space-y-4">
                <div className="glass-card p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Lightbulb className="w-4 h-4 text-brand-400" />
                    <h3 className="text-sm font-semibold text-white">Tips</h3>
                  </div>
                  <ul className="space-y-3">
                    {[
                      'Ask a Yes/No question about one value on one date, so Yes and No cover every case',
                      'Close trading before the deciding value can be known',
                      'Pick a source the AI resolver can read: step 2 shows exactly the text it will see',
                      'Higher initial liquidity attracts more traders and tighter spreads',
                      'Spell out edge cases in the rules (ties, missing data, delays) to prevent disputes',
                    ].map((tip, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-yes-400 mt-0.5 flex-shrink-0" />
                        <span className="text-xs text-surface-300 leading-relaxed">{tip}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="glass-card p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <AlertTriangle className="w-4 h-4 text-yellow-400" />
                    <h3 className="text-sm font-semibold text-white">Important</h3>
                  </div>
                  <ul className="space-y-3">
                    {[
                      'Market creators earn 0.5% of all trading volume',
                      'Initial liquidity seeds the AMM pool and cannot be withdrawn until resolution',
                      'Markets require ZK proof generation (30-60 seconds)',
                      'Disputes are resolved by the community governance process',
                    ].map((note, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <span className="w-1 h-1 rounded-full bg-yellow-400 mt-2 flex-shrink-0" />
                        <span className="text-xs text-surface-400 leading-relaxed">{note}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="glass-card p-6">
                  <div className="flex items-center gap-2 mb-3">
                    <Shield className="w-4 h-4 text-brand-400" />
                    <h3 className="text-sm font-semibold text-white">Privacy</h3>
                  </div>
                  <p className="text-xs text-surface-400 leading-relaxed">
                    Market creation is processed with zero-knowledge proofs on the Aleo blockchain. 
                    Your identity as creator is encrypted on-chain.
                  </p>
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
