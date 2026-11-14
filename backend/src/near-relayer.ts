// Veiled Markets relayer (docs/near/DESIGN.md §6): submits private `transact` calls so the bettor's NEAR account
// never signs, pays for, or appears in a private action. The proof binds the exact ext_data text (recipient,
// action, fee), so the relayer can neither redirect funds nor change the action; it can only refuse to relay.
//
//   POST /relay   {proof, public, ext_data}  -> 200 {ok:true, txHash, result} | 4xx/5xx {ok:false, error}
//   POST /meta    {signed_delegate}          -> 200 {ok:true, txHash} | 4xx/5xx {ok:false, error}   (RELAYER_META=1)
//   GET  /oneclick/tokens                    -> {ok, tokens: USDC on other chains}                   (ONECLICK_ENABLED=1)
//   POST /oneclick/quote-in  {from, amount, refundTo, recipient, dry}  -> {ok, quote}
//   POST /oneclick/quote-out {to, amount, recipient, refundTo, dry}    -> {ok, quote}
//   GET  /oneclick/status?depositAddress=...[&depositMemo=...]         -> {ok, status, updatedAt, swapDetails}
//   GET  /health                             -> {ok, relayer, contract, balanceNear, rpc, meta, oneclick}
//
// /meta pays the gas (and the 1 yocto) of a stablecoin deposit the user signed as a NEP-366 delegate action, so an
// account holding USDC but no NEAR can still move it into the private pool. Only that one action is accepted
// (src/meta-tx.ts), from the token contracts the Veiled contract lists, and only when the chain would accept it.
// RELAYER_META_PER_SENDER (3) caps such deposits per sender account per minute, counting only deposits that passed
// every check, and a signed deposit is submitted once.
//
// /oneclick/* moves USDC between another chain and Veiled through 1Click (src/oneclick.ts), mainnet only: the routes
// stay off for a .testnet contract. A real (not dry) quote registers the NEAR accounts it needs on USDC, paid by the
// relayer within ONECLICK_REGISTER_PER_HOUR (30). Every quote is appended to ONECLICK_QUOTE_LOG and printed.
// Env: ONECLICK_ENABLED, ONECLICK_API_KEY (partner JWT; optional, lowers the fee), ONECLICK_URL
//      (https://1click.chaindefuser.com), ONECLICK_NEAR_USDC (Circle USDC on NEAR mainnet),
//      ONECLICK_QUOTE_LOG (oneclick-quotes.jsonl), ONECLICK_REGISTER_PER_HOUR (30).
//
// Env: VEILED_CONTRACT (v1.veiled-markets.testnet), RELAYER_ACCOUNT (veiled-relayer.testnet),
//      RELAYER_PRIVATE_KEY (ed25519:...; default: ~/.near-credentials/testnet/<account>.json),
//      NEAR_RPC_URL (comma-separated, tried in order: https://test.rpc.fastnear.com,https://near-testnet.drpc.org),
//      RELAYER_PORT (4100), RELAYER_ALLOW_ORIGIN (*),
//      RELAYER_RATE_PER_MIN (30 per client), RELAYER_GLOBAL_PER_MIN (120 for everyone), RELAYER_MAX_QUEUE (20),
//      RELAYER_TRUSTED_PROXIES (1): how many proxies sit in front of this service. The client address is taken
//      that many entries from the right of X-Forwarded-For; the left end is whatever the client sent. Use 2 when
//      a CDN proxies in front of the host's own edge, 0 when the service is reached directly.
//
// Nothing is sent on chain unless the proof verifies here first (the same Groth16 check the contract runs), so
// a made-up proof cannot spend the relayer's gas.
import http from 'node:http';
import { appendFileSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { Account, FailoverRpcProvider, JsonRpcProvider, KeyPairSigner, actions } from 'near-api-js';
import { RateLimiter, clientIp, extDataHashOf, proofIsValid } from './relay-guards';
import { MetaLimited, MetaRefused, metaRelay, nearMetaChain, parseMetaDeposit } from './meta-tx';
import { OneClickBusy, OneClickError, OneClickRefused, nearUsdcChain, oneClick } from './oneclick';

const CONTRACT = process.env.VEILED_CONTRACT ?? 'v1.veiled-markets.testnet';
const RELAYER = process.env.RELAYER_ACCOUNT ?? 'veiled-relayer.testnet';
// Comma-separated: when one endpoint times out or rate-limits, calls move to the next.
const RPCS = (process.env.NEAR_RPC_URL ?? 'https://test.rpc.fastnear.com,https://near-testnet.drpc.org')
  .split(',').map((u) => u.trim()).filter(Boolean);
const PORT = Number(process.env.RELAYER_PORT ?? 4100);
const ALLOW_ORIGIN = process.env.RELAYER_ALLOW_ORIGIN ?? '*';
const GAS = 300_000_000_000_000n;
const MAX_BODY = 16 * 1024;
const RATE_PER_MIN = Number(process.env.RELAYER_RATE_PER_MIN ?? 30);
const GLOBAL_PER_MIN = Number(process.env.RELAYER_GLOBAL_PER_MIN ?? 120);
const MAX_QUEUE = Number(process.env.RELAYER_MAX_QUEUE ?? 20);
const TRUSTED_PROXIES = Number(process.env.RELAYER_TRUSTED_PROXIES ?? 1);
const META = process.env.RELAYER_META === '1';
const META_PER_SENDER = Number(process.env.RELAYER_META_PER_SENDER ?? 3);
/** The contract's MIN_DEPOSIT, in micro units (a token's base units). */
const MIN_DEPOSIT = 10_000n;
// The verification key of near/circuits/spend.circom, the one compiled into the contract (vk.rs).
const VK = JSON.parse(readFileSync(new URL('./zk/verification_key.json', import.meta.url), 'utf8'));

const ACTIONS = new Set([
  'withdraw', 'buy', 'sell', 'add_liquidity', 'redeem', 'refund', 'withdraw_lp', 'turbo_buy', 'turbo_claim',
  'parlay_buy', 'parlay_claim',
]);
const DEC = /^[0-9]{1,78}$/;

function loadKey(): string {
  if (process.env.RELAYER_PRIVATE_KEY) return process.env.RELAYER_PRIVATE_KEY;
  const file = path.join(homedir(), '.near-credentials', 'testnet', `${RELAYER}.json`);
  return JSON.parse(readFileSync(file, 'utf8')).private_key;
}

const provider = new FailoverRpcProvider(RPCS.map((url) => new JsonRpcProvider({ url })));
const account = new Account(RELAYER, provider, KeyPairSigner.fromSecretKey(loadKey() as `ed25519:${string}`));

async function view<T>(method: string, args: Record<string, unknown>): Promise<T> {
  return provider.callFunction({ contractId: CONTRACT, method, args }) as Promise<T>;
}

class BadRequest extends Error {}
class Busy extends Error {}

/** Shape checks only; the contract re-checks everything. Returns the request reduced to the known fields. */
function validate(body: unknown) {
  const b = body as { proof?: any; public?: any; ext_data?: unknown };
  if (!b || typeof b !== 'object') throw new BadRequest('body must be a JSON object');
  const p = b.proof;
  const coords = [p?.a?.[0], p?.a?.[1], p?.b?.[0]?.[0], p?.b?.[0]?.[1], p?.b?.[1]?.[0], p?.b?.[1]?.[1], p?.c?.[0], p?.c?.[1]];
  if (!coords.every((x) => typeof x === 'string' && DEC.test(x))) throw new BadRequest('proof must be decimal strings');
  const names = ['root', 'nullifier1', 'nullifier2', 'change_commitment', 'kind', 'asset', 'sub', 'out_amount', 'ext_data_hash'];
  if (!names.every((n) => typeof b.public?.[n] === 'string' && DEC.test(b.public[n]))) {
    throw new BadRequest('public signals must be decimal strings');
  }
  if (typeof b.ext_data !== 'string' || b.ext_data.length > 4096) throw new BadRequest('ext_data must be a string');
  let ext: any;
  try {
    ext = JSON.parse(b.ext_data);
  } catch {
    throw new BadRequest('ext_data is not JSON');
  }
  if (!ACTIONS.has(ext?.action?.type)) throw new BadRequest('unknown action');
  if (ext.fee !== undefined && ext.fee !== '0') throw new BadRequest('this relayer charges no fee: set fee "0"');
  return {
    proof: { a: [p.a[0], p.a[1]], b: [[p.b[0][0], p.b[0][1]], [p.b[1][0], p.b[1][1]]], c: [p.c[0], p.c[1]] },
    public: Object.fromEntries(names.map((n) => [n, b.public[n]])),
    ext_data: b.ext_data,
  };
}

/** The contract's panic text ("ERR_SLIPPAGE", ...) from a failed outcome. */
function failureText(outcome: any): string {
  const text = JSON.stringify(outcome?.status?.Failure ?? outcome?.receipts_outcome?.map((r: any) => r.outcome?.status?.Failure).filter(Boolean) ?? outcome);
  const m = text.match(/ERR_[A-Z_0-9]+/);
  return m ? m[0] : text.slice(0, 300);
}

function decodeSuccess(outcome: any): unknown {
  const v = outcome?.status?.SuccessValue;
  if (typeof v !== 'string' || v === '') return null;
  try {
    return JSON.parse(Buffer.from(v, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

// One key, one nonce sequence: transactions are sent one at a time. The queue is bounded so a burst cannot hold
// later requests for minutes (their proofs would go stale against the contract's recent roots anyway).
let queue: Promise<unknown> = Promise.resolve();
let waiting = 0;
function serial<T>(job: () => Promise<T>): Promise<T> {
  if (waiting >= MAX_QUEUE) throw new Busy('the relayer is busy, try again shortly');
  waiting++;
  const run = queue.then(job, job).finally(() => {
    waiting--;
  });
  queue = run.catch(() => undefined);
  return run;
}

async function relay(req: ReturnType<typeof validate>) {
  // The contract would reject these, after the relayer has paid for the call.
  if (extDataHashOf(req.ext_data) !== req.public.ext_data_hash) throw new BadRequest('ERR_EXT_DATA_HASH');
  if (!(await proofIsValid(VK, req.proof as Parameters<typeof proofIsValid>[1], req.public))) {
    throw new BadRequest('ERR_INVALID_PROOF');
  }
  // Cheap pre-checks so an obviously dead spend never costs gas.
  const [knownRoot, spent1, spent2] = await Promise.all([
    view<boolean>('is_known_root', { root: req.public.root }),
    view<boolean>('is_spent', { nullifier: req.public.nullifier1 }),
    view<boolean>('is_spent', { nullifier: req.public.nullifier2 }),
  ]);
  if (!knownRoot) throw new BadRequest('ERR_UNKNOWN_ROOT');
  if (spent1 || spent2) throw new BadRequest('ERR_NULLIFIER_SPENT');

  const outcome: any = await serial(() =>
    account.signAndSendTransaction({
      receiverId: CONTRACT,
      actions: [actions.functionCall('transact', req, GAS, 0n)],
      waitUntil: 'EXECUTED_OPTIMISTIC',
      throwOnFailure: false,
    }),
  );
  const txHash: string = outcome?.transaction_outcome?.id ?? outcome?.transaction?.hash;
  const failed = outcome?.status?.Failure !== undefined ||
    (outcome?.receipts_outcome ?? []).some((r: any) => r?.outcome?.status?.Failure !== undefined && r?.outcome?.executor_id === CONTRACT);
  if (failed) return { ok: false as const, txHash, error: failureText(outcome) };
  return { ok: true as const, txHash, result: decodeSuccess(outcome) };
}

// ------------------------------------------------------------------ gasless deposits (NEP-366)

// The token contracts come from the Veiled contract and are read again every ten minutes.
let metaTokens: { list: string[]; at: number } | null = null;
async function metaPolicy() {
  if (!metaTokens || Date.now() - metaTokens.at > 10 * 60_000) {
    metaTokens = { list: await view<string[]>('get_token_accounts', {}), at: Date.now() };
  }
  return { veiled: CONTRACT, tokens: metaTokens.list, minAmount: MIN_DEPOSIT };
}

const metaChain = nearMetaChain(provider, account, serial, failureText);

// ------------------------------------------------------------------ cross-chain USDC (1Click, mainnet only)

const ONECLICK = process.env.ONECLICK_ENABLED === '1' && !CONTRACT.endsWith('.testnet');
const ONECLICK_LOG = process.env.ONECLICK_QUOTE_LOG ?? 'oneclick-quotes.jsonl';
const oneclick = oneClick(
  {
    baseUrl: process.env.ONECLICK_URL ?? 'https://1click.chaindefuser.com',
    apiKey: process.env.ONECLICK_API_KEY || undefined,
    nearUsdc: process.env.ONECLICK_NEAR_USDC ?? '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
    registerPerHour: Number(process.env.ONECLICK_REGISTER_PER_HOUR ?? 30),
  },
  {
    fetch,
    chain: nearUsdcChain(provider, account, serial, failureText),
    now: Date.now,
    veiledTokens: async () => (await metaPolicy()).tokens,
    // Kept on disk and in the service log: the signed quote settles a dispute with 1Click.
    logQuote: (entry) => {
      const line = JSON.stringify(entry);
      appendFileSync(ONECLICK_LOG, `${line}\n`);
      console.log(`[oneclick-quote] ${line}`);
    },
  },
);

// ------------------------------------------------------------------ HTTP

const limiter = new RateLimiter(RATE_PER_MIN, GLOBAL_PER_MIN);
const senderLimiter = new RateLimiter(META_PER_SENDER, GLOBAL_PER_MIN);
const relayMeta = metaRelay(metaChain, { allowSender: (sender) => senderLimiter.allow(sender) === 'ok' });
// A transfer's page polls its status every 10 s until it ends: those polls have their own budget, so open tabs never
// use up the one /relay and /meta share.
const statusLimiter = new RateLimiter(30, 600);

function send(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': ALLOW_ORIGIN,
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
  });
  res.end(JSON.stringify(body));
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > MAX_BODY) throw new BadRequest('body too large');
    chunks.push(c as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return send(res, 204, {});
    if (req.method === 'GET' && req.url === '/health') {
      const acc: any = await provider.viewAccount({ accountId: RELAYER });
      return send(res, 200, {
        ok: true, relayer: RELAYER, contract: CONTRACT, rpc: RPCS, meta: META, oneclick: ONECLICK,
        balanceNear: Number(BigInt(acc.amount) / 10n ** 21n) / 1000,
      });
    }
    if (req.method === 'POST' && req.url === '/meta') {
      if (!META) return send(res, 404, { ok: false, error: 'gasless deposits are off on this relayer' });
      const ip = clientIp(req.headers['x-forwarded-for'], req.socket.remoteAddress, TRUSTED_PROXIES);
      const allowed = limiter.allow(ip);
      if (allowed === 'client') return send(res, 429, { ok: false, error: 'rate limited, try again in a minute' });
      if (allowed === 'global') return send(res, 503, { ok: false, error: 'the relayer is busy, try again shortly' });
      const body = JSON.parse(await readBody(req));
      const deposit = parseMetaDeposit(body?.signed_delegate, await metaPolicy());
      const started = Date.now();
      const out = await relayMeta(deposit);
      console.log(`[meta] ${deposit.senderId} ${deposit.amount} ${deposit.token} ${out.ok ? 'ok' : out.error} ${out.txHash ?? ''} ${Date.now() - started}ms`);
      return send(res, out.ok ? 200 : 422, out);
    }
    if (req.method === 'POST' && req.url === '/relay') {
      const ip = clientIp(req.headers['x-forwarded-for'], req.socket.remoteAddress, TRUSTED_PROXIES);
      const allowed = limiter.allow(ip);
      if (allowed === 'client') return send(res, 429, { ok: false, error: 'rate limited, try again in a minute' });
      if (allowed === 'global') return send(res, 503, { ok: false, error: 'the relayer is busy, try again shortly' });
      const body = validate(JSON.parse(await readBody(req)));
      const started = Date.now();
      const out = await relay(body);
      const ext = JSON.parse(body.ext_data);
      console.log(`[relay] ${ext.action.type} ${out.ok ? 'ok' : out.error} ${out.txHash ?? ''} ${Date.now() - started}ms`);
      return send(res, out.ok ? 200 : 422, out);
    }
    if (req.url?.startsWith('/oneclick/')) {
      if (!ONECLICK) return send(res, 404, { ok: false, error: 'cross-chain transfers are off on this relayer' });
      const ip = clientIp(req.headers['x-forwarded-for'], req.socket.remoteAddress, TRUSTED_PROXIES);
      const url = new URL(req.url, 'http://relayer');
      const allowed = (url.pathname === '/oneclick/status' ? statusLimiter : limiter).allow(ip);
      if (allowed === 'client') return send(res, 429, { ok: false, error: 'rate limited, try again in a minute' });
      if (allowed === 'global') return send(res, 503, { ok: false, error: 'the relayer is busy, try again shortly' });
      if (req.method === 'GET' && url.pathname === '/oneclick/tokens') {
        return send(res, 200, { ok: true, tokens: await oneclick.tokens() });
      }
      if (req.method === 'GET' && url.pathname === '/oneclick/status') {
        const memo = url.searchParams.get('depositMemo') ?? undefined;
        return send(res, 200, { ok: true, ...(await oneclick.status(url.searchParams.get('depositAddress') ?? '', memo)) });
      }
      if (req.method === 'POST' && (url.pathname === '/oneclick/quote-in' || url.pathname === '/oneclick/quote-out')) {
        const body = JSON.parse(await readBody(req));
        const out = url.pathname === '/oneclick/quote-in' ? await oneclick.quoteIn(body) : await oneclick.quoteOut(body);
        for (const r of out.registrations) console.log(`[oneclick] registered ${r.accountId} on USDC ${r.txHash}`);
        return send(res, 200, { ok: true, quote: out.quote });
      }
      return send(res, 404, { ok: false, error: 'not found' });
    }
    return send(res, 404, { ok: false, error: 'not found' });
  } catch (err) {
    if (err instanceof BadRequest || err instanceof SyntaxError || err instanceof MetaRefused || err instanceof OneClickRefused) {
      return send(res, 400, { ok: false, error: err.message });
    }
    if (err instanceof MetaLimited) return send(res, 429, { ok: false, error: err.message });
    if (err instanceof Busy || err instanceof OneClickBusy) return send(res, 503, { ok: false, error: err.message });
    if (err instanceof OneClickError) return send(res, err.status, { ok: false, error: err.message });
    console.error('[relay] error', err);
    return send(res, 502, { ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

server.listen(PORT, () => console.log(`[relay] ${RELAYER} -> ${CONTRACT} on :${PORT} via ${RPCS.join(', ')}`));
