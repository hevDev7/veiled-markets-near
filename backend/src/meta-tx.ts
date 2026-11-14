// Gasless deposits (NEP-366 meta transactions). The user signs a delegate action; the relayer wraps it in its own
// transaction and pays the gas, and also the inner call's deposit (nearcore charges deposits inside a Delegate
// action to the outer signer). So the relayer accepts exactly one shape: an `ft_transfer_call` of 1 yocto on an
// accepted token contract, moving that token into the Veiled contract with a `{"deposit": ...}` message.

import { deserialize } from 'borsh'
import {
  SCHEMA,
  actions,
  baseEncode,
  encodeDelegateAction,
  encodeSignedDelegate,
  type Account,
  type FailoverRpcProvider,
  type JsonRpcProvider,
  type SignedDelegate,
} from 'near-api-js'
import { ed25519 } from '@noble/curves/ed25519.js'
import { sha256, sha512 } from '@noble/hashes/sha2.js'

/** Refused: the relayer will not pay for this delegate action (HTTP 400). */
export class MetaRefused extends Error {}
/** The sender's deposits per minute are used up (HTTP 429). */
export class MetaLimited extends Error {}

export interface MetaDepositPolicy {
  /** The Veiled contract: the only receiver of the transfer. */
  veiled: string
  /** Token contracts whose deposits the relayer pays for. */
  tokens: readonly string[]
  /** The contract's smallest deposit, in the token's base units. */
  minAmount: bigint
}

export interface MetaDeposit {
  senderId: string
  token: string
  amount: bigint
  nonce: bigint
  maxBlockHeight: bigint
  /** `ed25519:<base58>` */
  publicKey: string
  /** Decoded as signed; `encodeSignedDelegate` gives back the exact input bytes. */
  signedDelegate: SignedDelegate
}

const MAX_INPUT = 8 * 1024
const MIN_GAS = 100_000_000_000_000n
const MAX_GAS = 300_000_000_000_000n
const MAX_MEMO_BYTES = 400
const AMOUNT = /^[0-9]{1,39}$/
const FIELD = /^[0-9]{1,78}$/
/** BN254 scalar modulus: the contract parses owner_blind as a field element below it, and refuses zero. */
const FR_MODULUS = 21888242871839275222246405745257275088548364400416034343698204186575808495617n
/** Blocks between the final height the relayer reads and the block that runs the delegate action, with room to spare. */
const EXPIRY_MARGIN = 10n
/** nearcore refuses a delegate nonce of block height × this or more (ACCESS_KEY_NONCE_RANGE_MULTIPLIER). */
const NONCE_RANGE = 1_000_000n
const ED25519_ORDER = ed25519.Point.Fn.ORDER
const UTF8 = new TextDecoder('utf-8', { fatal: true })
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/

const littleEndian = (b: Uint8Array) => b.reduceRight((n, x) => (n << 8n) | BigInt(x), 0n)

/**
 * ed25519 as nearcore checks it (ed25519-dalek's `verify`): s below the group order, and [s]B - [k]A encoding to
 * exactly the signature's R bytes, without the cofactor. noble's own check is cofactored (ZIP-215), so it accepts
 * signatures whose R carries a small-order point, which anyone can make with an ordinary key and the chain refuses
 * before it records the nonce: the same bytes would then fail again and again at the relayer's expense. Stricter than
 * nearcore on keys: a non-canonical or small-order public key is refused too.
 */
function verifiesOnChain(signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array): boolean {
  if (signature.length !== 64 || publicKey.length !== 32) return false
  try {
    const A = ed25519.Point.fromBytes(publicKey, false)
    if (A.isSmallOrder()) return false
    const s = littleEndian(signature.subarray(32))
    if (s >= ED25519_ORDER) return false
    const R = signature.subarray(0, 32)
    const k = littleEndian(sha512(Uint8Array.from([...R, ...publicKey, ...message]))) % ED25519_ORDER
    const expected = ed25519.Point.BASE.multiplyUnsafe(s).subtract(A.multiplyUnsafe(k)).toBytes()
    return Buffer.compare(Buffer.from(expected), Buffer.from(R)) === 0
  } catch {
    return false
  }
}

function hasLoneSurrogate(v: unknown): boolean {
  if (typeof v === 'string') return LONE_SURROGATE.test(v)
  if (Array.isArray(v)) return v.some(hasLoneSurrogate)
  if (isObject(v)) return Object.entries(v).some(([k, x]) => LONE_SURROGATE.test(k) || hasLoneSurrogate(x))
  return false
}

/**
 * JSON the contracts read exactly as the relayer does: only what JSON.stringify writes (so no duplicate keys, which
 * JSON.parse resolves silently and serde refuses) and no lone surrogate (which serde refuses too).
 */
function strictJson(text: string, what: string): unknown {
  let v: unknown
  try {
    v = JSON.parse(text)
  } catch {
    throw new MetaRefused(`${what} are not JSON`)
  }
  if (JSON.stringify(v) !== text) throw new MetaRefused(`${what} must be plain JSON, as JSON.stringify writes it`)
  if (hasLoneSurrogate(v)) throw new MetaRefused(`${what} hold a lone surrogate`)
  return v
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

function onlyKeys(o: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(o).every((k) => allowed.includes(k))
}

function decode(b64: string): any {
  if (typeof b64 !== 'string' || b64.length > MAX_INPUT) throw new MetaRefused('the signed delegate is too large')
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) throw new MetaRefused('cannot decode the signed delegate')
  const bytes = Buffer.from(b64, 'base64')
  try {
    const sd = deserialize(SCHEMA.SignedDelegate, bytes)
    // Nothing trailing or reshaped: what is submitted is byte for byte what was signed.
    if (Buffer.compare(Buffer.from(encodeSignedDelegate(sd as SignedDelegate)), bytes) === 0) return sd
  } catch {
    // fall through
  }
  throw new MetaRefused('cannot decode the signed delegate')
}

function depositArgs(raw: number[] | Uint8Array, policy: MetaDepositPolicy): bigint {
  let text: string
  try {
    text = UTF8.decode(Uint8Array.from(raw))
  } catch {
    throw new MetaRefused('the call arguments are not UTF-8 text')
  }
  const args = strictJson(text, 'the call arguments')
  if (!isObject(args) || !onlyKeys(args, ['receiver_id', 'amount', 'msg', 'memo'])) {
    throw new MetaRefused('unexpected call arguments')
  }
  if (args.memo !== undefined && args.memo !== null && typeof args.memo !== 'string') {
    throw new MetaRefused('unexpected call arguments')
  }
  if (args.receiver_id !== policy.veiled) throw new MetaRefused(`the receiver must be ${policy.veiled}`)
  if (typeof args.amount !== 'string' || !AMOUNT.test(args.amount) || BigInt(args.amount) < policy.minAmount) {
    throw new MetaRefused(`the amount must be a whole number of at least ${policy.minAmount}`)
  }
  if (typeof args.msg !== 'string') throw new MetaRefused('the msg is not a deposit message')
  const msg = strictJson(args.msg, 'the msg contents')
  const d = isObject(msg) && onlyKeys(msg, ['deposit']) ? msg.deposit : undefined
  if (!isObject(d) || !onlyKeys(d, ['owner_blind', 'memo'])) throw new MetaRefused('the msg is not a deposit message')
  if (
    typeof d.owner_blind !== 'string' || !FIELD.test(d.owner_blind) ||
    BigInt(d.owner_blind) === 0n || BigInt(d.owner_blind) >= FR_MODULUS
  ) {
    throw new MetaRefused('owner_blind must be a non-zero decimal field element')
  }
  if (typeof d.memo !== 'string' || Buffer.byteLength(d.memo) > MAX_MEMO_BYTES) {
    throw new MetaRefused(`the memo must be text of at most ${MAX_MEMO_BYTES} bytes`)
  }
  return BigInt(args.amount)
}

/** Checks a base64 SignedDelegate offline: its shape, the deposit it makes, and the user's signature over it. */
export function parseMetaDeposit(b64: string, policy: MetaDepositPolicy): MetaDeposit {
  const sd = decode(b64)
  const da = sd.delegateAction
  if (!policy.tokens.includes(da.receiverId)) throw new MetaRefused(`token ${da.receiverId} is not accepted`)
  if (da.actions.length !== 1) throw new MetaRefused('exactly one action is accepted')
  const call = da.actions[0].functionCall
  if (!call) throw new MetaRefused('the action must be a function call')
  if (call.methodName !== 'ft_transfer_call') throw new MetaRefused('only ft_transfer_call is accepted')
  if (call.deposit !== 1n) throw new MetaRefused('the call must attach exactly 1 yocto')
  if (call.gas < MIN_GAS || call.gas > MAX_GAS) throw new MetaRefused('the call gas must be 100 to 300 TGas')
  const amount = depositArgs(call.args, policy)

  const key = da.publicKey?.ed25519Key?.data
  const signature = sd.signature?.ed25519Signature?.data
  if (!key || !signature) throw new MetaRefused('only ed25519 keys are accepted')
  const message = sha256(encodeDelegateAction(da))
  if (!verifiesOnChain(Uint8Array.from(signature), message, Uint8Array.from(key))) {
    throw new MetaRefused('the signature does not match the delegate action')
  }

  return {
    senderId: da.senderId,
    token: da.receiverId,
    amount,
    nonce: da.nonce,
    maxBlockHeight: da.maxBlockHeight,
    publicKey: `ed25519:${baseEncode(Uint8Array.from(key))}`,
    signedDelegate: sd as SignedDelegate,
  }
}

/** What the relayer reads from the chain before paying for a delegate action, and how it submits one. */
export interface MetaChain {
  blockHeight(): Promise<bigint>
  /** The sender's access key, or null when the account has no such key. */
  accessKey(accountId: string, publicKey: string): Promise<{ nonce: bigint; fullAccess: boolean } | null>
  ftBalance(token: string, accountId: string): Promise<bigint>
  /** Sends the delegate action in a transaction to `senderId`; `failure` is the contract's error, if any. */
  submit(senderId: string, signedDelegate: SignedDelegate): Promise<{ txHash: string; failure?: string }>
}

export interface MetaRelayOptions {
  /** Asked once every check passed, just before submitting; false refuses the deposit with MetaLimited. */
  allowSender?: (senderId: string) => boolean
  /** How many submitted deposits are remembered and refused if sent again (default 10 000). */
  remember?: number
}

/**
 * Submits checked deposits, each only when the chain would accept it: the action does not expire before it can run,
 * its nonce is below nearcore's cap, it is signed by a full-access key of the sender with an unused nonce (a deposit
 * attaches 1 yocto, which a function-call key cannot), and the sender holds the amount. Otherwise the relayer would pay
 * for a transaction that fails. A deposit already submitted (or being checked) is refused, so the same bytes are paid
 * for once; one refused before submission is forgotten, so it can be sent again once the reason is gone. The
 * per-sender limit is asked last, so a stranger posting someone's old, public SignedDelegate cannot use it up.
 */
export function metaRelay(chain: MetaChain, opts: MetaRelayOptions = {}) {
  const remember = opts.remember ?? 10_000
  const sent = new Set<string>()
  return async (d: MetaDeposit) => {
    const id = `${d.senderId} ${d.publicKey} ${d.nonce}`
    if (sent.has(id)) throw new MetaRefused('this signed deposit was already sent; sign again')
    sent.add(id)
    let submitted = false
    try {
      const height = await chain.blockHeight()
      if (d.maxBlockHeight <= height + EXPIRY_MARGIN) {
        throw new MetaRefused('the delegate action has expired or expires before it can run; sign again')
      }
      if (d.nonce >= height * NONCE_RANGE) throw new MetaRefused('the nonce is above what the chain accepts; sign again')
      const key = await chain.accessKey(d.senderId, d.publicKey)
      if (!key) throw new MetaRefused(`the signing key is not a key of ${d.senderId}`)
      if (!key.fullAccess) throw new MetaRefused('a deposit must be signed with a full-access key')
      if (key.nonce >= d.nonce) throw new MetaRefused('the nonce was already used; sign again')
      if ((await chain.ftBalance(d.token, d.senderId)) < d.amount) {
        throw new MetaRefused(`${d.senderId} holds less than the amount`)
      }
      if (opts.allowSender && !opts.allowSender(d.senderId)) {
        throw new MetaLimited('too many deposits from this account, try again in a minute')
      }
      submitted = true
      const r = await chain.submit(d.senderId, d.signedDelegate)
      return r.failure ? { ok: false as const, txHash: r.txHash, error: r.failure } : { ok: true as const, txHash: r.txHash }
    } finally {
      if (!submitted) sent.delete(id)
      while (sent.size > remember) sent.delete(sent.values().next().value as string)
    }
  }
}

/**
 * The relayer's MetaChain over near-api-js. `serial` keeps the relayer's transactions in nonce order;
 * `failureText` turns a failed outcome into the contract's error code.
 */
export function nearMetaChain(
  provider: FailoverRpcProvider | JsonRpcProvider,
  relayer: Account,
  serial: <T>(job: () => Promise<T>) => Promise<T>,
  failureText: (outcome: unknown) => string,
): MetaChain {
  return {
    blockHeight: async () => BigInt((await provider.viewBlock({ finality: 'final' })).header.height),
    accessKey: async (accountId, publicKey) => {
      try {
        const k = await provider.viewAccessKey({ accountId, publicKey })
        return { nonce: BigInt(k.nonce), fullAccess: k.permission === 'FullAccess' }
      } catch (err) {
        if (/does not exist|UNKNOWN_ACCESS_KEY|AccessKeyDoesNotExist/i.test(String((err as Error)?.message ?? err))) return null
        throw err
      }
    },
    ftBalance: async (token, accountId) =>
      BigInt(String(await provider.callFunction({ contractId: token, method: 'ft_balance_of', args: { account_id: accountId } }))),
    submit: async (senderId, signedDelegate) => {
      const outcome: any = await serial(() =>
        relayer.signAndSendTransaction({
          receiverId: senderId,
          actions: [actions.signedDelegate(signedDelegate)],
          waitUntil: 'EXECUTED_OPTIMISTIC',
          throwOnFailure: false,
        }),
      )
      const txHash: string = outcome?.transaction_outcome?.id ?? outcome?.transaction?.hash
      // The transaction succeeds once the delegate action is accepted; the deposit's own receipts tell.
      const failed = outcome?.status?.Failure !== undefined ||
        (outcome?.receipts_outcome ?? []).some((r: any) => r?.outcome?.status?.Failure !== undefined)
      return { txHash, failure: failed ? failureText(outcome) : undefined }
    },
  }
}
