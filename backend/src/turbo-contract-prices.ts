// Turbo rounds priced by the oracle contract the Veiled contract names (`get_turbo_oracle`): Pyth's NEAR receiver
// or OutLayer's price-oracle.near. In this mode the keeper only opens and settles rounds; the contract reads the
// baseline and the closing price from the oracle itself.
//
// Pyth on NEAR stores a price only when someone submits a Hermes update. With `push` the keeper submits one only
// when the stored price is of no use: before an open when it is more than OPEN_PRICE_FRESH_SECS old (the previous
// round's settle usually left a fresh one), and before a settle when it is older than the round's deadline, in
// which case it stores the first update of the deadline second: the same update on every attempt, and always
// inside the close window. Pyth's `update_price_feeds` returns before its verification runs, so each push is read
// back; a feed whose push failed is not pushed again until a pause has passed (doubling, up to ten minutes). Rounds
// open only while the contract is live and names this keeper its oracle operator, checked with free views first.
// OutLayer's TEE pushes its own prices: run without `push`.

export type TurboPriceMode = 'operator' | 'contract'

/** TURBO_PRICES=contract switches the keeper to the oracle contract; anything else keeps the operator's prices. */
export function turboPriceMode(env: Record<string, string | undefined>): TurboPriceMode {
  return env.TURBO_PRICES === 'contract' ? 'contract' : 'operator'
}

export interface HttpAnswer {
  ok: boolean
  status: number
  json(): Promise<unknown>
}

export interface ContractPriceDeps {
  view(contract: string, method: string, args: Record<string, unknown>): Promise<unknown>
  /** Sends a transaction and waits for it; throws with the contract's ERR_ code in the message when it fails. */
  call(
    receiver: string,
    method: string,
    args: Record<string, unknown>,
    gas: bigint,
    deposit: bigint,
  ): Promise<{ txId: string; value: unknown }>
  get(url: string, headers: Record<string, string>): Promise<HttpAnswer>
  sleep(ms: number): Promise<void>
  now(): number
}

export interface PushFailure {
  count: number
  /** Keeper clock (ms) before which the feed is not pushed again. */
  retryAt: number
}

export interface PythPush {
  hermesUrl: string
  apiKey?: string
  /** Failed pushes per feed id, kept between calls. */
  failures: Map<string, PushFailure>
}

export function pythPush(hermesUrl: string, apiKey?: string): PythPush {
  return { hermesUrl: hermesUrl.replace(/\/+$/, ''), apiKey, failures: new Map() }
}

export interface ContractPriceOptions {
  veiled: string
  /** The keeper's own account: rounds are opened only while the contract names it the oracle operator. */
  operator: string
  push?: PythPush
}

/**
 * No oracle price landed inside the round's close window, so no settle can succeed any more. The round waits for
 * `emergency_cancel_turbo` (bets are refunded) once its resolution deadline passes.
 */
export class CloseWindowMissed extends Error {}

/** The contract's tick: height h starts at unix second 4h. */
const SECONDS_PER_TICK = 4
export const SETTLE_RETRY_MS = 2000
/** How far the keeper's clock may be off the chain's before it gives up on a close window. */
export const CLOCK_SLACK_MS = 3000
/** A stored price at most this old opens a round as it is. */
export const OPEN_PRICE_FRESH_SECS = 10
/** Pause after a failed push; it doubles with each further failure, up to PUSH_BACKOFF_MAX_MS. */
export const PUSH_BACKOFF_MS = 10_000
export const PUSH_BACKOFF_MAX_MS = 10 * 60_000
/** Reads of the stored price that confirm a push, a second apart (an RPC node may be a block behind). */
const PUSH_CONFIRM_READS = 3
const PUSH_CONFIRM_WAIT_MS = 1000
const GAS_OPEN_SETTLE = 100_000_000_000_000n
const GAS_PYTH_UPDATE = 300_000_000_000_000n

interface OracleConfig {
  oracle: string | null
  close_window_secs: number
  feeds: Array<{ symbol_id: number; feed_id: string }>
}

interface Round {
  symbol_id: number
  deadline: string
  status: number
  baseline_price: string
  baseline_block: string
}

interface HermesUpdate {
  data: string
  publishTime: number
}

async function oracleConfig(deps: ContractPriceDeps, veiled: string): Promise<OracleConfig> {
  return (await deps.view(veiled, 'get_turbo_oracle', {})) as OracleConfig
}

function feedOf(cfg: OracleConfig, symbolId: number): { oracle: string; feed: string } {
  const feed = cfg.feeds.find((f) => f.symbol_id === symbolId)?.feed_id
  if (!feed) throw new Error(`no oracle feed for symbol ${symbolId}`)
  if (!cfg.oracle) throw new Error('the contract names no price oracle')
  return { oracle: cfg.oracle, feed }
}

async function round(deps: ContractPriceDeps, veiled: string, marketId: string): Promise<Round> {
  const r = (await deps.view(veiled, 'get_turbo_market', { market_id: marketId })) as Round | null
  if (!r) throw new Error(`turbo round ${marketId} is not on chain`)
  return r
}

/** publish_time (unix seconds) of the price the oracle holds for a feed, or null. */
async function storedPublishTime(deps: ContractPriceDeps, oracle: string, feed: string): Promise<number | null> {
  const p = (await deps.view(oracle, 'get_price_unsafe', { price_identifier: feed })) as { publish_time?: unknown } | null
  return typeof p?.publish_time === 'number' ? p.publish_time : null
}

/** Throws at once while a feed waits after a failed push. */
function assertPushAllowed(deps: ContractPriceDeps, push: PythPush, feed: string) {
  const f = push.failures.get(feed)
  if (f && deps.now() < f.retryAt) {
    throw new Error(`the last push for feed ${feed.slice(0, 8)} failed; no push for this feed until ${new Date(f.retryAt).toISOString()}`)
  }
}

/** The latest Hermes update for a feed, or the first one published at or after unix second `second`. */
async function hermesUpdate(deps: ContractPriceDeps, push: PythPush, feed: string, second?: number): Promise<HermesUpdate> {
  const which = second === undefined ? 'latest' : String(second)
  const headers: Record<string, string> = push.apiKey ? { Authorization: `Bearer ${push.apiKey}` } : {}
  const res = await deps.get(`${push.hermesUrl}/v2/updates/price/${which}?ids[]=${feed}&encoding=hex&parsed=true`, headers)
  if (!res.ok) throw new Error(`Hermes answered ${res.status}`)
  const body = (await res.json()) as {
    binary?: { data?: unknown[] }
    parsed?: Array<{ price?: { publish_time?: unknown } }>
  }
  const data = body.binary?.data?.[0]
  const publishTime = body.parsed?.[0]?.price?.publish_time
  if (typeof data !== 'string' || !/^[0-9a-f]+$/i.test(data) || typeof publishTime !== 'number') {
    throw new Error('Hermes sent no price update')
  }
  return { data, publishTime }
}

/**
 * Stores a Hermes update on the Pyth contract and reads it back: the transaction succeeds before Pyth verifies the
 * update, so only the stored price shows that the push worked. A failed push makes the feed wait.
 */
async function storeUpdate(deps: ContractPriceDeps, push: PythPush, oracle: string, feed: string, u: HermesUpdate) {
  const fee = BigInt(String(await deps.view(oracle, 'get_update_fee_estimate', { data: u.data })))
  try {
    await deps.call(oracle, 'update_price_feeds', { data: u.data }, GAS_PYTH_UPDATE, fee)
    for (let i = 0; i < PUSH_CONFIRM_READS; i++) {
      if (i > 0) await deps.sleep(PUSH_CONFIRM_WAIT_MS)
      const stored = await storedPublishTime(deps, oracle, feed)
      if (stored !== null && stored >= u.publishTime) {
        push.failures.delete(feed)
        return
      }
    }
    throw new Error(`the Pyth push did not store the price published at ${u.publishTime}`)
  } catch (err) {
    const count = (push.failures.get(feed)?.count ?? 0) + 1
    const pause = Math.min(PUSH_BACKOFF_MAX_MS, PUSH_BACKOFF_MS * 2 ** (count - 1))
    push.failures.set(feed, { count, retryAt: deps.now() + pause })
    throw err
  }
}

/** Free checks before anything is paid for: the contract is live and names this keeper its oracle operator. */
async function assertReadyToOpen(deps: ContractPriceDeps, opts: ContractPriceOptions) {
  const [gov, values] = (await Promise.all([
    deps.view(opts.veiled, 'get_governance', {}),
    deps.view(opts.veiled, 'get_governance_values', {}),
  ])) as [{ oracle_operator?: string }, { paused?: boolean }]
  if (values?.paused) throw new Error('the contract is paused')
  if (gov?.oracle_operator !== opts.operator) {
    throw new Error(`${opts.operator} is not the oracle operator (${gov?.oracle_operator} is)`)
  }
}

/** Opens a round whose baseline the contract takes from the oracle; returns that baseline as stored. */
export async function openRound(deps: ContractPriceDeps, opts: ContractPriceOptions, symbolId: number, deadline: bigint) {
  const { oracle, feed } = feedOf(await oracleConfig(deps, opts.veiled), symbolId)
  await assertReadyToOpen(deps, opts)
  if (opts.push) {
    const stored = await storedPublishTime(deps, oracle, feed)
    if (stored === null || stored < Math.floor(deps.now() / 1000) - OPEN_PRICE_FRESH_SECS) {
      assertPushAllowed(deps, opts.push, feed)
      await storeUpdate(deps, opts.push, oracle, feed, await hermesUpdate(deps, opts.push, feed))
    }
  }
  const r = await deps.call(
    opts.veiled,
    'open_turbo_round',
    { symbol_id: symbolId, deadline: deadline.toString() },
    GAS_OPEN_SETTLE,
    0n,
  )
  const marketId = String(r.value)
  if (!/^\d+$/.test(marketId)) throw new Error(`open_turbo_round returned ${marketId}`)
  const t = await round(deps, opts.veiled, marketId)
  return { txId: r.txId, marketId, baselineMicro: BigInt(t.baseline_price), baselineBlock: BigInt(t.baseline_block) }
}

/**
 * Settles a round with the oracle's price once one inside the close window is stored, pushing the deadline
 * second's first update when needed, and retrying until the window has passed. A round already settled, by this
 * keeper or by anyone else, counts as settled.
 */
export async function settleRound(
  deps: ContractPriceDeps,
  opts: ContractPriceOptions,
  marketId: string,
): Promise<{ txId: string; alreadySettled: boolean }> {
  const t = await round(deps, opts.veiled, marketId)
  if (t.status !== 1) return { txId: '', alreadySettled: true }
  const cfg = await oracleConfig(deps, opts.veiled)
  const { oracle, feed } = feedOf(cfg, t.symbol_id)
  const opens = Number(t.deadline) * SECONDS_PER_TICK
  const closes = opens + cfg.close_window_secs
  const lastTry = closes * 1000 + CLOCK_SLACK_MS
  let why = `no oracle price inside the close window ${opens}..${closes}`
  for (;;) {
    if (deps.now() > lastTry) throw new CloseWindowMissed(why)
    const stored = await storedPublishTime(deps, oracle, feed)
    if (stored !== null && stored > closes) {
      throw new CloseWindowMissed(`the oracle's price is from ${stored}, after the close window ${opens}..${closes}`)
    }
    if (stored === null || stored < opens) {
      if (!opts.push) {
        // The oracle pushes its own prices: wait for one from inside the window.
        await deps.sleep(SETTLE_RETRY_MS)
        continue
      }
      try {
        assertPushAllowed(deps, opts.push, feed)
        const u = await hermesUpdate(deps, opts.push, feed, opens)
        if (u.publishTime > closes) {
          throw new CloseWindowMissed(`Hermes has no update inside the close window ${opens}..${closes}`)
        }
        await storeUpdate(deps, opts.push, oracle, feed, u)
      } catch (err) {
        if (err instanceof CloseWindowMissed) throw err
        why = (err as Error).message
        await deps.sleep(SETTLE_RETRY_MS)
        continue
      }
    }
    try {
      const r = await deps.call(opts.veiled, 'settle_turbo_round', { market_id: marketId }, GAS_OPEN_SETTLE, 0n)
      return { txId: r.txId, alreadySettled: false }
    } catch (err) {
      const message = (err as Error).message
      if (/ERR_STATUS\b/.test(message)) return { txId: '', alreadySettled: true }
      if (/ERR_PRICE_TOO_LATE|ERR_RESOLUTION_WINDOW/.test(message)) throw new CloseWindowMissed(message)
      if (!/ERR_PRICE_TOO_EARLY|ERR_NOT_ENDED/.test(message)) throw err
      why = message
      await deps.sleep(SETTLE_RETRY_MS)
    }
  }
}
