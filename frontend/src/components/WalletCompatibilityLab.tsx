import { useMemo, useState } from 'react'
import { Beaker, Download, Loader2, Play, ShieldAlert } from 'lucide-react'
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react'
import { findSuitableRecord } from '@/lib/credits-record'
import { useWalletStore } from '@/lib/store'
import { cn } from '@/lib/utils'

type ABCase = 'v11_private_place_bet' | 'v12_private_buy_shares'
type CaseTarget = 'v11' | 'v12' | 'both'

interface SerializedError {
  name?: string
  message: string
  code?: string
  stack?: string
  data?: unknown
  cause?: SerializedError
}

interface RecordFetchAttempt {
  strategy: string
  ok: boolean
  recordCount?: number
  selectedMicrocredits?: number | null
  error?: SerializedError
}

interface PollSample {
  attempt: number
  at: string
  status?: unknown
  error?: SerializedError
}

interface CaseResult {
  caseId: ABCase
  startedAt: string
  endedAt: string
  program: string
  functionName: string
  marketId: string
  outcome: number
  amountMicro: string
  feeMicro: number
  recordFetch: RecordFetchAttempt[]
  inputsPreview: string[]
  txResult?: unknown
  txId?: string
  poll: PollSample[]
  finalStatus: 'not_submitted' | 'submitted' | 'accepted' | 'failed' | 'unknown'
  error?: SerializedError
}

interface WalletSnapshot {
  capturedAt: string
  walletType: string | null
  adapterName: string | null
  address: string | null
  userAgent: string
  shield: {
    detected: boolean
    version: string | null
    methods: string[]
  }
  leo: {
    detected: boolean
    version: string | null
    methods: string[]
  }
}

type CompatibilityVerdict = 'supported' | 'unsupported' | 'indeterminate'

interface CaseAnalysis {
  caseId: ABCase
  verdict: CompatibilityVerdict
  basis: string
  status: CaseResult['finalStatus']
  txId?: string
}

interface RunAnalysis {
  generatedAt: string
  walletKey: string
  cases: CaseAnalysis[]
  incompatibility: 'confirmed' | 'not_confirmed' | 'insufficient_data'
  rationale: string
}

interface ABRun {
  runId: string
  target: CaseTarget
  walletSnapshot: WalletSnapshot
  results: CaseResult[]
  analysis: RunAnalysis
}

interface TestCaseConfig {
  caseId: ABCase
  program: string
  functionName: string
  marketId: string
  inputs: string[]
  amountIndex: number
  outcomeIndex: number
  recordIndex: number
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function randomField(): string {
  const randomBytes = new Uint8Array(31)
  crypto.getRandomValues(randomBytes)
  let nonce = 0n
  for (let i = 0; i < randomBytes.length; i++) {
    nonce = (nonce << 8n) | BigInt(randomBytes[i])
  }
  return `${nonce}field`
}

function normalizeRecords(result: unknown): unknown[] {
  if (Array.isArray(result)) return result
  if (result && typeof result === 'object') {
    const records = (result as Record<string, unknown>).records
    if (Array.isArray(records)) return records
  }
  return []
}

function parseMicrocredits(plaintext: string): number | null {
  const match = plaintext.match(/microcredits\s*:\s*(\d+)u64/)
  if (!match) return null
  return parseInt(match[1], 10)
}

function toSerializable(value: unknown): unknown {
  const seen = new WeakSet<object>()
  try {
    const json = JSON.stringify(value, (_key, inner) => {
      if (typeof inner === 'bigint') return `${inner}n`
      if (typeof inner === 'function') return `[Function ${inner.name || 'anonymous'}]`
      if (inner && typeof inner === 'object') {
        if (seen.has(inner)) return '[Circular]'
        seen.add(inner)
      }
      return inner
    })
    return JSON.parse(json)
  } catch {
    return String(value)
  }
}

function serializeError(error: unknown): SerializedError {
  if (error instanceof Error) {
    const errExt = error as Error & {
      code?: unknown
      data?: unknown
      cause?: unknown
    }
    return {
      name: error.name,
      message: error.message,
      code: errExt.code ? String(errExt.code) : undefined,
      stack: error.stack?.split('\n').slice(0, 8).join('\n'),
      data: errExt.data ? toSerializable(errExt.data) : undefined,
      cause: errExt.cause ? serializeError(errExt.cause) : undefined,
    }
  }

  if (error && typeof error === 'object') {
    const obj = error as Record<string, unknown>
    return {
      name: typeof obj.name === 'string' ? obj.name : undefined,
      message: typeof obj.message === 'string' ? obj.message : String(error),
      code: obj.code != null ? String(obj.code) : undefined,
      data: toSerializable(obj),
    }
  }

  return { message: String(error) }
}

function extractTransactionId(result: unknown): string | null {
  if (typeof result === 'string' && result.length > 0) {
    return result
  }

  if (result && typeof result === 'object') {
    const obj = result as Record<string, unknown>
    const id =
      obj.transactionId ??
      obj.txId ??
      obj.id ??
      obj.eventId ??
      obj.transaction_id ??
      obj.aleoTransactionId
    if (typeof id === 'string' && id.length > 0) {
      return id
    }
  }

  return null
}

function getMethods(obj: unknown): string[] {
  if (!obj || typeof obj !== 'object') return []
  const record = obj as Record<string, unknown>
  return Object.keys(record)
    .filter((key) => typeof record[key] === 'function')
    .sort()
}

function getVersion(obj: unknown): string | null {
  if (!obj || typeof obj !== 'object') return null
  const record = obj as Record<string, unknown>
  const candidates = [record.version, record.walletVersion, record.sdkVersion]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate
    }
  }
  return null
}

function collectWalletSnapshot(
  walletType: string | null,
  adapterName: string | null,
  address: string | null,
): WalletSnapshot {
  const windowAny = window as unknown as Record<string, unknown>
  const shield = windowAny.shield ?? windowAny.shieldWallet ?? windowAny.shieldAleo
  const leo = windowAny.leoWallet ?? windowAny.leo
  return {
    capturedAt: new Date().toISOString(),
    walletType,
    adapterName,
    address,
    userAgent: navigator.userAgent,
    shield: {
      detected: Boolean(shield),
      version: getVersion(shield),
      methods: getMethods(shield),
    },
    leo: {
      detected: Boolean(leo),
      version: getVersion(leo),
      methods: getMethods(leo),
    },
  }
}

function buildWalletKey(snapshot: WalletSnapshot): string {
  const shieldVersion = snapshot.shield.version || 'unknown'
  const leoVersion = snapshot.leo.version || 'unknown'
  return [
    snapshot.walletType || 'unknown-wallet',
    snapshot.adapterName || 'unknown-adapter',
    `shield:${shieldVersion}`,
    `leo:${leoVersion}`,
  ].join('|')
}

function deriveCaseAnalysis(result: CaseResult): CaseAnalysis {
  const fallbackError = result.error?.message || 'No error message from adapter.'
  if (result.finalStatus === 'accepted') {
    return {
      caseId: result.caseId,
      verdict: 'supported',
      basis: 'Transaction accepted/finalized.',
      status: result.finalStatus,
      txId: result.txId,
    }
  }

  if (result.finalStatus === 'failed') {
    return {
      caseId: result.caseId,
      verdict: 'unsupported',
      basis: `Execution failed: ${fallbackError}`,
      status: result.finalStatus,
      txId: result.txId,
    }
  }

  if (result.finalStatus === 'submitted') {
    return {
      caseId: result.caseId,
      verdict: 'indeterminate',
      basis: 'Transaction submitted but not finalized in polling window.',
      status: result.finalStatus,
      txId: result.txId,
    }
  }

  return {
    caseId: result.caseId,
    verdict: 'indeterminate',
    basis: fallbackError,
    status: result.finalStatus,
    txId: result.txId,
  }
}

function buildRunAnalysis(walletSnapshot: WalletSnapshot, results: CaseResult[]): RunAnalysis {
  const cases = results.map(deriveCaseAnalysis)
  const v11 = cases.find((item) => item.caseId === 'v11_private_place_bet')
  const v12 = cases.find((item) => item.caseId === 'v12_private_buy_shares')

  let incompatibility: RunAnalysis['incompatibility'] = 'insufficient_data'
  let rationale = 'Both A and B are required in one run to determine incompatibility.'

  if (v11 && v12) {
    if (v11.verdict === 'supported' && v12.verdict === 'unsupported') {
      incompatibility = 'confirmed'
      rationale = `A works while B fails on same wallet/version. B basis: ${v12.basis}`
    } else if (v11.verdict === 'supported' && v12.verdict === 'supported') {
      incompatibility = 'not_confirmed'
      rationale = 'Both A and B are supported on same wallet/version.'
    } else if (v11.verdict === 'unsupported' && v12.verdict === 'unsupported') {
      incompatibility = 'not_confirmed'
      rationale = 'Both A and B fail; this does not isolate v12-only incompatibility.'
    } else if (v11.verdict === 'unsupported' && v12.verdict === 'supported') {
      incompatibility = 'not_confirmed'
      rationale = 'B works while A fails; opposite of expected incompatibility pattern.'
    } else {
      incompatibility = 'insufficient_data'
      rationale = 'At least one case is indeterminate; repeat with stable network and higher fee if needed.'
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    walletKey: buildWalletKey(walletSnapshot),
    cases,
    incompatibility,
    rationale,
  }
}

export function WalletCompatibilityLab() {
  const { wallet } = useWalletStore()
  const walletContext = useWallet() as unknown as Record<string, unknown>

  const adapterWallet = (walletContext.wallet ?? null) as { adapter?: { name?: string } } | null
  const adapterExecute = walletContext.executeTransaction as
    | ((payload: Record<string, unknown>) => Promise<unknown>)
    | undefined
  const adapterTxStatus = walletContext.transactionStatus as
    | ((txId: string) => Promise<unknown>)
    | undefined
  const requestRecords = walletContext.requestRecords as
    | ((program: string, includePlaintext?: boolean) => Promise<unknown>)
    | undefined
  const requestRecordPlaintexts = walletContext.requestRecordPlaintexts as
    | ((program: string) => Promise<unknown>)
    | undefined
  const decrypt = walletContext.decrypt as ((ciphertext: string) => Promise<unknown>) | undefined

  const [v11MarketId, setV11MarketId] = useState('')
  const [v12MarketId, setV12MarketId] = useState('')
  const [amount, setAmount] = useState('0.001')
  const [outcome, setOutcome] = useState(1)
  const [feeAleo, setFeeAleo] = useState('0.5')
  const [isRunning, setIsRunning] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)
  const [runs, setRuns] = useState<ABRun[]>([])

  const adapterName = adapterWallet?.adapter?.name || null
  const latestRun = runs[0] ?? null

  const latestSummary = useMemo(() => {
    if (!latestRun) return null
    const analysisByCase = new Map(latestRun.analysis.cases.map((item) => [item.caseId, item]))
    return latestRun.results.map((result) => ({
      caseId: result.caseId,
      finalStatus: result.finalStatus,
      verdict: analysisByCase.get(result.caseId)?.verdict || '-',
      txId: result.txId || '-',
      error: result.error?.message || '-',
    }))
  }, [latestRun])

  const fetchCreditsRecord = async (
    minAmountMicro: number,
  ): Promise<{ record: string | null; attempts: RecordFetchAttempt[] }> => {
    const attempts: RecordFetchAttempt[] = []

    const runStrategy = async (
      strategy: string,
      loader: () => Promise<unknown>,
    ): Promise<string | null> => {
      try {
        const raw = await loader()
        const records = normalizeRecords(raw)
        const found = findSuitableRecord(records as any[], minAmountMicro)
        attempts.push({
          strategy,
          ok: found !== null,
          recordCount: records.length,
          selectedMicrocredits: found ? parseMicrocredits(found) : null,
        })
        return found
      } catch (error) {
        attempts.push({
          strategy,
          ok: false,
          error: serializeError(error),
        })
        return null
      }
    }

    const runDecryptStrategy = async (
      strategy: string,
      loader: () => Promise<unknown>,
    ): Promise<string | null> => {
      if (!decrypt) return null
      try {
        const raw = await loader()
        const records = normalizeRecords(raw)
        for (const record of records) {
          if (!record || typeof record !== 'object') continue
          const obj = record as Record<string, unknown>
          const ciphertext =
            obj.ciphertext ??
            obj.recordCiphertext ??
            obj.record_ciphertext ??
            obj.data
          if (typeof ciphertext !== 'string') continue
          try {
            const decrypted = await decrypt(ciphertext)
            const text = String(decrypted)
            const microcredits = parseMicrocredits(text)
            if (microcredits !== null && microcredits >= minAmountMicro) {
              attempts.push({
                strategy,
                ok: true,
                recordCount: records.length,
                selectedMicrocredits: microcredits,
              })
              return text
            }
          } catch {
            // Ignore per-record decrypt failures.
          }
        }

        attempts.push({
          strategy,
          ok: false,
          recordCount: records.length,
          selectedMicrocredits: null,
        })
      } catch (error) {
        attempts.push({
          strategy,
          ok: false,
          error: serializeError(error),
        })
      }
      return null
    }

    if (requestRecordPlaintexts) {
      const found = await runStrategy('adapter.requestRecordPlaintexts(credits.aleo)', () =>
        requestRecordPlaintexts('credits.aleo'),
      )
      if (found) return { record: found, attempts }
    }

    if (requestRecords) {
      const foundWithTrue = await runStrategy(
        'adapter.requestRecords(credits.aleo, true)',
        () => requestRecords('credits.aleo', true),
      )
      if (foundWithTrue) return { record: foundWithTrue, attempts }

      const foundWithFalse = await runStrategy(
        'adapter.requestRecords(credits.aleo, false)',
        () => requestRecords('credits.aleo', false),
      )
      if (foundWithFalse) return { record: foundWithFalse, attempts }

      const foundDefault = await runStrategy('adapter.requestRecords(credits.aleo)', () =>
        requestRecords('credits.aleo'),
      )
      if (foundDefault) return { record: foundDefault, attempts }

      const decryptedFound = await runDecryptStrategy(
        'adapter.requestRecords + decrypt(ciphertext)',
        () => requestRecords('credits.aleo', false),
      )
      if (decryptedFound) return { record: decryptedFound, attempts }
    }

    const windowAny = window as unknown as Record<string, unknown>
    const shield = (windowAny.shield ??
      windowAny.shieldWallet ??
      windowAny.shieldAleo) as Record<string, unknown> | undefined
    if (shield && typeof shield.requestRecords === 'function') {
      const foundShield = await runStrategy('window.shield.requestRecords(credits.aleo)', () =>
        (shield.requestRecords as (program: string) => Promise<unknown>)('credits.aleo'),
      )
      if (foundShield) return { record: foundShield, attempts }
    }

    const leo = (windowAny.leoWallet ?? windowAny.leo) as Record<string, unknown> | undefined
    if (leo && typeof leo.requestRecordPlaintexts === 'function') {
      const foundLeo = await runStrategy(
        'window.leoWallet.requestRecordPlaintexts(credits.aleo)',
        () => (leo.requestRecordPlaintexts as (program: string) => Promise<unknown>)('credits.aleo'),
      )
      if (foundLeo) return { record: foundLeo, attempts }
    }

    return { record: null, attempts }
  }

  const runCase = async (config: TestCaseConfig, feeMicro: number): Promise<CaseResult> => {
    const startedAt = new Date().toISOString()
    const minAmount = parseInt(config.inputs[config.amountIndex].replace(/u\d+$/, ''), 10)
    const { record, attempts } = await fetchCreditsRecord(minAmount)

    const result: CaseResult = {
      caseId: config.caseId,
      startedAt,
      endedAt: startedAt,
      program: config.program,
      functionName: config.functionName,
      marketId: config.marketId,
      outcome: parseInt(config.inputs[config.outcomeIndex].replace('u8', ''), 10),
      amountMicro: config.inputs[config.amountIndex].replace('u128', ''),
      feeMicro,
      recordFetch: attempts,
      inputsPreview: [...config.inputs],
      poll: [],
      finalStatus: 'not_submitted',
    }

    if (!record) {
      result.error = { message: 'No suitable credits record found for private execution.' }
      result.endedAt = new Date().toISOString()
      return result
    }

    result.inputsPreview[config.recordIndex] = `[record:${parseMicrocredits(record) ?? 'unknown'}u64]`

    if (!adapterExecute) {
      result.error = { message: 'Adapter executeTransaction is not available.' }
      result.endedAt = new Date().toISOString()
      return result
    }

    const txPayload = {
      program: config.program,
      function: config.functionName,
      inputs: config.inputs.map((value, index) => (index === config.recordIndex ? record : value)),
      fee: feeMicro,
      privateFee: false,
      recordIndices: [config.recordIndex],
    }

    try {
      const txResult = await adapterExecute(txPayload)
      result.txResult = toSerializable(txResult)
      const txId = extractTransactionId(txResult)
      if (!txId) {
        result.error = { message: 'Adapter returned no transaction ID.' }
        result.finalStatus = 'unknown'
        result.endedAt = new Date().toISOString()
        return result
      }

      result.txId = txId
      result.finalStatus = 'submitted'

      if (adapterTxStatus) {
        for (let attempt = 1; attempt <= 8; attempt++) {
          await sleep(4000)
          try {
            const status = await adapterTxStatus(txId)
            result.poll.push({
              attempt,
              at: new Date().toISOString(),
              status: toSerializable(status),
            })
            const rawStatus =
              status && typeof status === 'object'
                ? String((status as Record<string, unknown>).status || '')
                : ''
            const normalized = rawStatus.toLowerCase()
            if (normalized === 'accepted' || normalized === 'finalized' || normalized === 'settled') {
              result.finalStatus = 'accepted'
              break
            }
            if (normalized === 'failed' || normalized === 'rejected') {
              result.finalStatus = 'failed'
              break
            }
          } catch (error) {
            result.poll.push({
              attempt,
              at: new Date().toISOString(),
              error: serializeError(error),
            })
          }
        }
      }
    } catch (error) {
      result.error = serializeError(error)
      result.finalStatus = 'failed'
    }

    result.endedAt = new Date().toISOString()
    return result
  }

  const runStructuredAB = async (target: CaseTarget) => {
    if (!wallet.connected || !wallet.address) {
      setRunError('Wallet not connected.')
      return
    }

    if (!adapterExecute) {
      setRunError('Wallet adapter executeTransaction is not available.')
      return
    }

    const amountNum = parseFloat(amount)
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setRunError('Amount must be a valid positive number.')
      return
    }

    const amountMicro = BigInt(Math.floor(amountNum * 1_000_000))
    if (amountMicro < 1000n) {
      setRunError('Minimum private test amount is 0.001 tokens (1000 microcredits).')
      return
    }

    const feeNum = parseFloat(feeAleo)
    if (!Number.isFinite(feeNum) || feeNum <= 0) {
      setRunError('Fee must be a valid positive number.')
      return
    }
    const feeMicro = Math.round(feeNum * 1_000_000)

    if ((target === 'v11' || target === 'both') && !v11MarketId.trim()) {
      setRunError('Market ID v11 wajib diisi untuk test A.')
      return
    }
    if ((target === 'v12' || target === 'both') && !v12MarketId.trim()) {
      setRunError('Market ID v12 wajib diisi untuk test B.')
      return
    }

    setIsRunning(true)
    setRunError(null)

    try {
      const runId = crypto.randomUUID()
      const walletSnapshot = collectWalletSnapshot(wallet.walletType, adapterName, wallet.address)
      const baseOutcome = `${outcome}u8`
      const baseAmount = `${amountMicro}u128`
      const results: CaseResult[] = []

      if (target === 'v11' || target === 'both') {
        const v11Config: TestCaseConfig = {
          caseId: 'v11_private_place_bet',
          program: 'veiled_markets_v11.aleo',
          functionName: 'place_bet',
          marketId: v11MarketId.trim(),
          inputs: [v11MarketId.trim(), baseAmount, baseOutcome, randomField(), '__record__'],
          amountIndex: 1,
          outcomeIndex: 2,
          recordIndex: 4,
        }
        results.push(await runCase(v11Config, feeMicro))
      }

      if (target === 'v12' || target === 'both') {
        const v12Config: TestCaseConfig = {
          caseId: 'v12_private_buy_shares',
          program: 'veiled_markets_v13.aleo',
          functionName: 'buy_shares_private',
          marketId: v12MarketId.trim(),
          inputs: [v12MarketId.trim(), baseOutcome, baseAmount, '0u128', randomField(), '__record__'],
          amountIndex: 2,
          outcomeIndex: 1,
          recordIndex: 5,
        }
        results.push(await runCase(v12Config, feeMicro))
      }

      const run: ABRun = {
        runId,
        target,
        walletSnapshot,
        results,
        analysis: buildRunAnalysis(walletSnapshot, results),
      }
      setRuns((prev) => [run, ...prev])
    } catch (error) {
      setRunError(serializeError(error).message)
    } finally {
      setIsRunning(false)
    }
  }

  const exportJson = () => {
    const payload = {
      generatedAt: new Date().toISOString(),
      app: 'veiled-markets',
      runs,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `wallet-ab-report-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="glass-card p-6">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-yellow-500/10 flex items-center justify-center">
            <Beaker className="w-5 h-5 text-yellow-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Wallet A/B Compatibility Lab</h2>
            <p className="text-sm text-surface-400">
              Structured test for `v11 private` vs `v12 private` with forensic logs.
            </p>
          </div>
        </div>

        <button
          onClick={exportJson}
          disabled={runs.length === 0}
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
            runs.length > 0
              ? 'bg-surface-800 hover:bg-surface-700 text-white'
              : 'bg-surface-800/50 text-surface-500 cursor-not-allowed',
          )}
        >
          <Download className="w-4 h-4" />
          Export JSON
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <label className="space-y-1">
          <span className="text-xs text-surface-400 uppercase tracking-wide">Market ID v11 (A)</span>
          <input
            value={v11MarketId}
            onChange={(e) => setV11MarketId(e.target.value)}
            placeholder="123...field"
            className="w-full bg-surface-900 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-surface-400 uppercase tracking-wide">Market ID v12 (B)</span>
          <input
            value={v12MarketId}
            onChange={(e) => setV12MarketId(e.target.value)}
            placeholder="456...field"
            className="w-full bg-surface-900 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-5">
        <label className="space-y-1">
          <span className="text-xs text-surface-400 uppercase tracking-wide">Amount</span>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full bg-surface-900 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-surface-400 uppercase tracking-wide">Outcome</span>
          <input
            value={outcome}
            onChange={(e) => setOutcome(Math.max(1, Math.min(4, Number(e.target.value) || 1)))}
            type="number"
            min={1}
            max={4}
            className="w-full bg-surface-900 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-surface-400 uppercase tracking-wide">Fee (ALEO)</span>
          <input
            value={feeAleo}
            onChange={(e) => setFeeAleo(e.target.value)}
            className="w-full bg-surface-900 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button
          onClick={() => runStructuredAB('v11')}
          disabled={isRunning}
          className="btn-secondary px-4 py-2 text-sm disabled:opacity-60"
        >
          {isRunning ? <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> : <Play className="w-4 h-4 inline mr-2" />}
          Run A (v11 private)
        </button>
        <button
          onClick={() => runStructuredAB('v12')}
          disabled={isRunning}
          className="btn-secondary px-4 py-2 text-sm disabled:opacity-60"
        >
          {isRunning ? <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> : <Play className="w-4 h-4 inline mr-2" />}
          Run B (v12 private)
        </button>
        <button
          onClick={() => runStructuredAB('both')}
          disabled={isRunning}
          className="btn-primary px-4 py-2 text-sm disabled:opacity-60"
        >
          {isRunning ? <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> : <Play className="w-4 h-4 inline mr-2" />}
          Run A+B
        </button>
      </div>

      <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 mb-4">
        <div className="flex items-start gap-2 text-yellow-300 text-sm">
          <ShieldAlert className="w-4 h-4 mt-0.5" />
          <p>
            This test executes real on-chain transactions if the wallet accepts them. Use minimal amount first.
          </p>
        </div>
      </div>

      {runError && (
        <div className="p-3 rounded-lg bg-no-500/10 border border-no-500/20 mb-4">
          <p className="text-sm text-no-300">{runError}</p>
        </div>
      )}

      <div className="p-3 rounded-lg bg-surface-900 border border-surface-700 mb-4">
        <p className="text-xs text-surface-400 mb-1 uppercase tracking-wide">Current Wallet Snapshot</p>
        <p className="text-sm text-surface-200">
          walletType: <span className="font-mono">{wallet.walletType || '-'}</span> | adapter:{' '}
          <span className="font-mono">{adapterName || '-'}</span> | address:{' '}
          <span className="font-mono">{wallet.address ? `${wallet.address.slice(0, 12)}...${wallet.address.slice(-8)}` : '-'}</span>
        </p>
      </div>

      {latestSummary && (
        <div className="p-3 rounded-lg bg-surface-900 border border-surface-700 mb-4">
          <p className="text-xs text-surface-400 mb-2 uppercase tracking-wide">Latest Run Summary</p>
          <div className="space-y-2">
            {latestSummary.map((item) => (
              <div key={item.caseId} className="text-sm text-surface-200 font-mono">
                {item.caseId} | status={item.finalStatus} | verdict={item.verdict} | txId={item.txId}
              </div>
            ))}
          </div>
        </div>
      )}

      {latestRun && (
        <div className="p-3 rounded-lg bg-surface-900 border border-surface-700 mb-4">
          <p className="text-xs text-surface-400 mb-1 uppercase tracking-wide">Compatibility Verdict</p>
          <p className="text-sm text-surface-200 font-mono">
            {latestRun.analysis.incompatibility} | walletKey={latestRun.analysis.walletKey}
          </p>
          <p className="text-sm text-surface-300 mt-1">{latestRun.analysis.rationale}</p>
        </div>
      )}

      {latestRun && (
        <div className="space-y-3">
          <p className="text-xs text-surface-400 uppercase tracking-wide">Latest Run (JSON)</p>
          <pre className="max-h-[420px] overflow-auto bg-surface-900 border border-surface-700 rounded-lg p-3 text-xs text-surface-200">
            {JSON.stringify(latestRun, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}
