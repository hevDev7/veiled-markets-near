// Veiled Markets relayer (docs/near/DESIGN.md §6): submits private `transact` calls so the bettor's NEAR account
// never signs, pays for, or appears in a private action. The proof binds the exact ext_data text (recipient,
// action, fee), so the relayer can neither redirect funds nor change the action; it can only refuse to relay.
//
//   POST /relay   {proof, public, ext_data}  -> 200 {ok:true, txHash, result} | 4xx/5xx {ok:false, error}
//   GET  /health                             -> {ok, relayer, contract, balanceNear, rpc}
//
// Env: VEILED_CONTRACT (v1.veiled-markets.testnet), RELAYER_ACCOUNT (veiled-relayer.testnet),
//      RELAYER_PRIVATE_KEY (ed25519:...; default: ~/.near-credentials/testnet/<account>.json),
//      NEAR_RPC_URL (comma-separated, tried in order: https://test.rpc.fastnear.com,https://near-testnet.drpc.org),
//      RELAYER_PORT (4100), RELAYER_ALLOW_ORIGIN (*).
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { Account, FailoverRpcProvider, JsonRpcProvider, KeyPairSigner, actions } from 'near-api-js';

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

// One key, one nonce sequence: transactions are sent one at a time.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  queue = run.catch(() => undefined);
  return run;
}

async function relay(req: ReturnType<typeof validate>) {
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

// ------------------------------------------------------------------ HTTP

const hits = new Map<string, number[]>();
function limited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > RATE_PER_MIN;
}

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
        ok: true, relayer: RELAYER, contract: CONTRACT, rpc: RPCS,
        balanceNear: Number(BigInt(acc.amount) / 10n ** 21n) / 1000,
      });
    }
    if (req.method === 'POST' && req.url === '/relay') {
      const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? req.socket.remoteAddress ?? '?';
      if (limited(ip)) return send(res, 429, { ok: false, error: 'rate limited, try again in a minute' });
      const body = validate(JSON.parse(await readBody(req)));
      const started = Date.now();
      const out = await relay(body);
      const ext = JSON.parse(body.ext_data);
      console.log(`[relay] ${ext.action.type} ${out.ok ? 'ok' : out.error} ${out.txHash ?? ''} ${Date.now() - started}ms`);
      return send(res, out.ok ? 200 : 422, out);
    }
    return send(res, 404, { ok: false, error: 'not found' });
  } catch (err) {
    if (err instanceof BadRequest || err instanceof SyntaxError) return send(res, 400, { ok: false, error: err.message });
    console.error('[relay] error', err);
    return send(res, 502, { ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

server.listen(PORT, () => console.log(`[relay] ${RELAYER} -> ${CONTRACT} on :${PORT} via ${RPCS.join(', ')}`));
