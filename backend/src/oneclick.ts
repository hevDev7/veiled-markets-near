// 1Click (NEAR Intents) for USDC in and out of Veiled, mainnet only (the relayer serves it under /oneclick/*).
//
// Bring-in: 1Click delivers USDC from another chain to the user's own NEAR account; a gasless deposit
// (src/meta-tx.ts) then moves it into the private pool. Not `customRecipientMsg` straight into the contract: 1Click
// marks it highly experimental, and a deposit the contract refuses would go back to NEAR Intents, not to the user.
// Take-out: a private withdraw pays a 1Click deposit address on NEAR, and 1Click sends USDC on to the other chain;
// a refund comes back to the user's NEAR account as public USDC.
//
// USDC only, both ways. The partner key stays on the server. Every quote 1Click signs is kept (logQuote) before it
// is handed out: the signature is what settles a dispute. A NEAR account must be registered on USDC to receive it,
// so the relayer registers the user's account (bring-in), the refund account and the 1Click deposit address
// (take-out) when they are not, within an hourly budget: each registration costs it about 0.00125 NEAR.
import { actions, type Account, type FailoverRpcProvider, type JsonRpcProvider } from 'near-api-js'
import { RateLimiter } from './relay-guards'

/** A request this service will not make (bad input, or outside the USDC policy). */
export class OneClickRefused extends Error {}
/** The hourly registration budget is spent. */
export class OneClickBusy extends Error {}
/** 1Click refused or failed; `status` is what the relayer answers with. */
export class OneClickError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

export interface UsdcOption { assetId: string; blockchain: string; symbol: string; decimals: number; contractAddress?: string }
export interface Quote {
  depositAddress?: string
  depositMemo?: string
  amountIn: string
  amountOut: string
  minAmountOut: string
  [field: string]: unknown
}
export interface QuoteResponse { correlationId: string; timestamp: string; signature: string; quoteRequest: unknown; quote: Quote }
export interface QuoteLogEntry { at: string; direction: 'in' | 'out'; response: QuoteResponse }
export interface Registration { accountId: string; txHash: string }

/** What the relayer reads and pays for on the USDC contract. */
export interface UsdcChain {
  /** NEP-145 `storage_balance_of`: null when the account is not registered. */
  storageBalanceOf(token: string, accountId: string): Promise<unknown>
  /** Registers `accountId` on `token` (registration only), paid by the relayer. */
  register(token: string, accountId: string): Promise<{ txHash: string; failure?: string }>
}

export interface OneClickConfig {
  baseUrl: string
  /** Partner JWT, sent as X-API-Key; without one 1Click charges its keyless fee. */
  apiKey?: string
  /** The USDC contract on NEAR (Circle's), the only NEAR asset moved. */
  nearUsdc: string
  registerPerHour: number
}

export interface OneClickDeps {
  fetch: typeof fetch
  chain: UsdcChain
  now: () => number
  /** The token contracts the Veiled contract takes (get_token_accounts). */
  veiledTokens: () => Promise<string[]>
  /** Keeps a quote; a throw stops the quote from being handed out. */
  logQuote: (entry: QuoteLogEntry) => void
}

export interface QuoteInInput { from: string; amount: string; refundTo: string; recipient: string; dry: boolean }
export interface QuoteOutInput { to: string; amount: string; recipient: string; refundTo: string; dry: boolean }

const SLIPPAGE_BPS = 50
/** Time to send USDC on the other chain from another wallet. */
const IN_DEADLINE_MS = 60 * 60_000
/** A take-out is one relayed withdraw, seconds after the quote. */
const OUT_DEADLINE_MS = 30 * 60_000
const TOKENS_TTL_MS = 10 * 60_000
const AMOUNT = /^[1-9][0-9]{0,38}$/
const NEAR_ACCOUNT = /^(?=.{2,64}$)(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/
/** An address on another chain: printable ASCII, no spaces. 1Click checks the chain's own format. */
const ADDRESS = /^[\x21-\x7e]{1,128}$/

function check(ok: boolean, why: string) {
  if (!ok) throw new OneClickRefused(why)
}

const isAmount = (v: unknown): v is string => typeof v === 'string' && AMOUNT.test(v)
const isNearAccount = (v: unknown): v is string => typeof v === 'string' && NEAR_ACCOUNT.test(v)
const isAddress = (v: unknown): v is string => typeof v === 'string' && ADDRESS.test(v)

export function oneClick(config: OneClickConfig, deps: OneClickDeps) {
  const nearAsset = `nep141:${config.nearUsdc}`
  const budget = new RateLimiter(config.registerPerHour, config.registerPerHour, 60 * 60_000, deps.now)
  let cache: { list: UsdcOption[]; at: number } | null = null

  function headers(json: boolean): Record<string, string> {
    const h: Record<string, string> = json ? { 'content-type': 'application/json' } : {}
    if (config.apiKey) h['X-API-Key'] = config.apiKey
    return h
  }

  async function call<T>(path: string, init: RequestInit): Promise<T> {
    let res: Response
    try {
      res = await deps.fetch(`${config.baseUrl}${path}`, init)
    } catch {
      throw new OneClickError('1Click is not reachable', 502)
    }
    const body: any = await res.json().catch(() => null)
    if (res.ok) return body as T
    if (res.status === 400 || res.status === 404) {
      throw new OneClickError(typeof body?.message === 'string' ? body.message : `1Click answered ${res.status}`, res.status)
    }
    if (res.status === 401 || res.status === 403) throw new OneClickError(`1Click refused the partner key (${res.status})`, 502)
    throw new OneClickError(`1Click answered ${res.status}`, 502)
  }

  /** USDC on the chains other than NEAR that 1Click serves, read again every ten minutes. */
  async function tokens(): Promise<UsdcOption[]> {
    if (!cache || deps.now() - cache.at > TOKENS_TTL_MS) {
      const all = await call<any[]>('/v0/tokens', { headers: headers(false) })
      if (!Array.isArray(all)) throw new OneClickError('1Click sent no token list', 502)
      const list = all
        .filter((t) => t?.symbol === 'USDC' && t.blockchain !== 'near' && typeof t.assetId === 'string')
        .map((t) => ({
          assetId: t.assetId, blockchain: t.blockchain, symbol: t.symbol, decimals: t.decimals,
          ...(typeof t.contractAddress === 'string' ? { contractAddress: t.contractAddress } : {}),
        }))
      cache = { list, at: deps.now() }
    }
    return cache.list
  }

  async function usdcElsewhere(assetId: string) {
    check((await tokens()).some((t) => t.assetId === assetId), 'only USDC on a chain other than NEAR can be moved')
  }

  async function veiledTakesUsdc() {
    check((await deps.veiledTokens()).includes(config.nearUsdc), `the Veiled contract does not take ${config.nearUsdc}`)
  }

  async function ensureRegistered(accountId: string, done: Registration[]) {
    if (await deps.chain.storageBalanceOf(config.nearUsdc, accountId)) return
    if (budget.allow('registrations') !== 'ok') {
      throw new OneClickBusy('cross-chain transfers are busy right now; try again later')
    }
    const r = await deps.chain.register(config.nearUsdc, accountId)
    if (r.failure) throw new OneClickError(`registering ${accountId} on USDC failed: ${r.failure}`, 502)
    done.push({ accountId, txHash: r.txHash })
  }

  /** Asks for a quote and keeps it; refuses one that is not for the amount asked or, if real, has no address. */
  async function quote(direction: 'in' | 'out', request: Record<string, unknown>): Promise<QuoteResponse> {
    const response = await call<QuoteResponse>('/v0/quote', {
      method: 'POST', headers: headers(true), body: JSON.stringify(request),
    })
    if (!response || typeof response !== 'object' || !response.quote || typeof response.quote !== 'object') {
      throw new OneClickError('1Click sent an unreadable quote', 502)
    }
    deps.logQuote({ at: new Date(deps.now()).toISOString(), direction, response })
    if (typeof response.signature !== 'string') throw new OneClickError('1Click sent an unsigned quote', 502)
    if (response.quote.amountIn !== request.amount) {
      throw new OneClickError(`1Click quoted ${String(response.quote.amountIn)} instead of ${String(request.amount)}`, 502)
    }
    if (!request.dry && !isAddress(response.quote.depositAddress)) throw new OneClickError('1Click sent no deposit address', 502)
    return response
  }

  /** USDC from another chain to the user's own NEAR account. */
  async function quoteIn(input: QuoteInInput) {
    check(typeof input?.dry === 'boolean', 'dry must be true or false')
    check(isAmount(input.amount), 'amount must be a whole number of base units')
    check(isNearAccount(input.recipient), 'recipient must be a NEAR account')
    check(isAddress(input.refundTo), 'refundTo must be an address on the other chain')
    check(typeof input.from === 'string', 'name the USDC asset on the other chain')
    await veiledTakesUsdc()
    await usdcElsewhere(input.from)
    const registrations: Registration[] = []
    if (!input.dry) await ensureRegistered(input.recipient, registrations)
    const response = await quote('in', {
      dry: input.dry, swapType: 'EXACT_INPUT', slippageTolerance: SLIPPAGE_BPS,
      originAsset: input.from, depositType: 'ORIGIN_CHAIN',
      destinationAsset: nearAsset, amount: input.amount,
      refundTo: input.refundTo, refundType: 'ORIGIN_CHAIN',
      recipient: input.recipient, recipientType: 'DESTINATION_CHAIN',
      deadline: new Date(deps.now() + IN_DEADLINE_MS).toISOString(),
    })
    return { quote: response, registrations }
  }

  /** USDC on NEAR (paid by a private withdraw) to another chain; refunds go to the user's NEAR account. */
  async function quoteOut(input: QuoteOutInput) {
    check(typeof input?.dry === 'boolean', 'dry must be true or false')
    check(isAmount(input.amount), 'amount must be a whole number of base units')
    check(isAddress(input.recipient), 'recipient must be an address on the other chain')
    check(isNearAccount(input.refundTo), 'refundTo must be a NEAR account')
    check(typeof input.to === 'string', 'name the USDC asset on the other chain')
    await veiledTakesUsdc()
    await usdcElsewhere(input.to)
    const registrations: Registration[] = []
    if (!input.dry) await ensureRegistered(input.refundTo, registrations)
    const response = await quote('out', {
      dry: input.dry, swapType: 'EXACT_INPUT', slippageTolerance: SLIPPAGE_BPS,
      originAsset: nearAsset, depositType: 'ORIGIN_CHAIN',
      destinationAsset: input.to, amount: input.amount,
      refundTo: input.refundTo, refundType: 'ORIGIN_CHAIN',
      recipient: input.recipient, recipientType: 'DESTINATION_CHAIN',
      deadline: new Date(deps.now() + OUT_DEADLINE_MS).toISOString(),
    })
    if (!input.dry) {
      // The private withdraw pays with a plain ft_transfer: no memo, and only to a NEAR account on USDC.
      const q = response.quote
      if (q.depositMemo !== undefined) throw new OneClickError('1Click asked for a deposit memo, which a withdraw cannot send', 502)
      if (!isNearAccount(q.depositAddress)) throw new OneClickError('1Click sent a deposit address that is not a NEAR account', 502)
      await ensureRegistered(q.depositAddress, registrations)
    }
    return { quote: response, registrations }
  }

  /** Where a swap stands, by the deposit address of its quote (and its memo, when the quote had one). */
  async function status(depositAddress: string, depositMemo?: string) {
    check(isAddress(depositAddress), 'name the deposit address of a quote')
    check(depositMemo === undefined || isAddress(depositMemo), 'the deposit memo is malformed')
    const q = new URLSearchParams({ depositAddress })
    if (depositMemo !== undefined) q.set('depositMemo', depositMemo)
    const r = await call<any>(`/v0/status?${q}`, { headers: headers(false) })
    return { status: r?.status as string, updatedAt: r?.updatedAt as string, swapDetails: r?.swapDetails as unknown }
  }

  return { tokens, quoteIn, quoteOut, status }
}

/** Most the relayer pays to register one account (Circle's USDC asks 0.00125 NEAR). */
const MAX_REGISTRATION_YOCTO = 10n ** 22n
const REGISTER_GAS = 30_000_000_000_000n

/**
 * The relayer's UsdcChain over near-api-js. `serial` keeps the relayer's transactions in nonce order;
 * `failureText` turns a failed outcome into the contract's error.
 */
export function nearUsdcChain(
  provider: FailoverRpcProvider | JsonRpcProvider,
  relayer: Account,
  serial: <T>(job: () => Promise<T>) => Promise<T>,
  failureText: (outcome: unknown) => string,
): UsdcChain {
  return {
    storageBalanceOf: (token, accountId) =>
      provider.callFunction({ contractId: token, method: 'storage_balance_of', args: { account_id: accountId } }),
    register: async (token, accountId) => {
      const bounds = (await provider.callFunction({ contractId: token, method: 'storage_balance_bounds', args: {} })) as
        { min?: string } | null
      const min = BigInt(bounds?.min ?? '0')
      if (min > MAX_REGISTRATION_YOCTO) return { txHash: '', failure: `${token} asks ${min} yoctoNEAR to register an account` }
      const outcome: any = await serial(() =>
        relayer.signAndSendTransaction({
          receiverId: token,
          actions: [actions.functionCall('storage_deposit', { account_id: accountId, registration_only: true }, REGISTER_GAS, min)],
          waitUntil: 'EXECUTED_OPTIMISTIC',
          throwOnFailure: false,
        }),
      )
      const txHash: string = outcome?.transaction_outcome?.id ?? outcome?.transaction?.hash
      const failed = outcome?.status?.Failure !== undefined ||
        (outcome?.receipts_outcome ?? []).some((r: any) => r?.outcome?.status?.Failure !== undefined)
      return { txHash, failure: failed ? failureText(outcome) : undefined }
    },
  }
}
