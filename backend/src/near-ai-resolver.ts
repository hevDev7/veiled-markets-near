// ============================================================================
// Veiled Markets — AI resolver (NEAR AI Cloud, private inference in a TEE)
// ============================================================================
// When a market's trading closes, this service reads the question, rules and resolution source the creator put on
// chain, fetches the source page, and asks a model that runs inside NEAR AI Cloud's TEE which outcome the source
// supports. If the model answers with enough confidence and NEAR AI's model TEE signed the exact request and response
// bytes with a key from the attestation fetched beforehand, it casts the market's first bonded vote, with the
// receipt's link and hash as the vote's evidence. It casts an ordinary vote: anyone can vote against it or dispute
// it during the dispute window, and the committee decides disputes. The receipt (question, source excerpt, request,
// response, reasoning, signature, attestation) is served at /receipts/<market>.json and checks in any browser
// through NEAR AI's Verification Center.
//
//   npm run ai-resolver                        loop forever, serve /health and /receipts (reads backend/.env if any)
//   npm run ai-resolver -- --once              one pass, then exit
//   DRY_RUN=1 …                                decide and write receipts, never vote
//
// Env: NEARAI_API_KEY (required), NEARAI_MODEL (z-ai/glm-5.3-flash), VEILED_CONTRACT (v1.veiled-markets.testnet),
//      AI_RESOLVER_ACCOUNT, AI_RESOLVER_PRIVATE_KEY (default: the legacy keychain file of that account),
//      AI_RESOLVER_PUBLIC_URL (the public base URL of this service: votes link their receipts there; without it
//      the service never votes),
//      NEAR_RPC_URL (comma-separated), AI_MIN_CONFIDENCE (0.8), AI_POLL_SECONDS (120),
//      AI_RETRY_ABSTAINED_MINUTES (60), AI_RESOLVER_PORT (4091), AI_RECEIPTS_DIR (backend/ai-receipts).
// ============================================================================

import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isIP } from 'node:net';
import { homedir } from 'node:os';
import nodePath from 'node:path';
import { Account, FailoverRpcProvider, JsonRpcProvider, KeyPairSigner, actions } from 'near-api-js';
import {
  buildRequest,
  checkSignature,
  evidenceFor,
  htmlToText,
  isPrivateAddress,
  parseDecision,
  readMarket,
  sha256Hex,
  shouldVote,
  sourceUrl,
  verifyLink,
  type ChainMarket,
  type Decision,
  type TeeSignature,
} from './ai-resolver-core';

try {
  process.loadEnvFile(new URL('../.env', import.meta.url));
} catch (err) {
  if ((err as NodeJS.ErrnoException).code !== 'ENOENT') console.warn('[env] backend/.env not loaded:', (err as Error).message);
}

const API = 'https://cloud-api.near.ai/v1';
const API_KEY = process.env.NEARAI_API_KEY || '';
const MODEL = process.env.NEARAI_MODEL || 'z-ai/glm-5.3-flash';
const CONTRACT = process.env.VEILED_CONTRACT || 'v1.veiled-markets.testnet';
const ACCOUNT = process.env.AI_RESOLVER_ACCOUNT || 'ai.veiled-markets.testnet';
const PUBLIC_URL = (process.env.AI_RESOLVER_PUBLIC_URL || '').replace(/\/+$/, '');
const MIN_CONFIDENCE = Number(process.env.AI_MIN_CONFIDENCE || 0.8);
const POLL_SECONDS = Number(process.env.AI_POLL_SECONDS || 120);
const RETRY_ABSTAINED_MS = Number(process.env.AI_RETRY_ABSTAINED_MINUTES || 60) * 60_000;
const PORT = Number(process.env.AI_RESOLVER_PORT || process.env.PORT || 4091);
const RECEIPTS = process.env.AI_RECEIPTS_DIR || nodePath.join(nodePath.dirname(new URL(import.meta.url).pathname), '..', 'ai-receipts');
const DRY_RUN = process.env.DRY_RUN === '1' || !PUBLIC_URL;
const RPC_URLS = (process.env.NEAR_RPC_URL || 'https://test.rpc.fastnear.com,https://near-testnet.drpc.org')
  .split(',').map(u => u.trim()).filter(Boolean);
const SOURCE_CHARS = 20_000;
const SOURCE_BYTES = 1_000_000;
/** Seconds per contract tick (height = block time in ms / 4000). */
const TICK_SECONDS = 4;

const provider = new FailoverRpcProvider(RPC_URLS.map(url => new JsonRpcProvider({ url })));
let account: Account | null = null;

function signer(): Account {
  if (account) return account;
  const key = process.env.AI_RESOLVER_PRIVATE_KEY ||
    JSON.parse(readFileSync(nodePath.join(homedir(), '.near-credentials', 'testnet', `${ACCOUNT}.json`), 'utf8')).private_key;
  account = new Account(ACCOUNT, provider, KeyPairSigner.fromSecretKey(key));
  return account;
}

const view = async <T>(method: string, args: Record<string, unknown>) =>
  (await provider.callFunction({ contractId: CONTRACT, method, args })) as T;

// ------------------------------------------------------------------ what the service remembers

interface Entry {
  state: 'voted' | 'abstained' | 'unverified' | 'error';
  at: string;
  outcome?: number;
  tx?: string;
  receipt_sha256?: string;
  note?: string;
}

mkdirSync(RECEIPTS, { recursive: true });
const INDEX = nodePath.join(RECEIPTS, 'index.json');
const index: Record<string, Entry> = existsSync(INDEX) ? JSON.parse(readFileSync(INDEX, 'utf8')) : {};
const saveIndex = () => writeFileSync(INDEX, JSON.stringify(index, null, 2));

// ------------------------------------------------------------------ the resolution source

interface Source {
  url: string;
  final_url?: string;
  status?: number;
  sha256?: string;
  bytes?: number;
  fetched_at: string;
  error?: string;
}

/** Fetches a public page: every hop's host must resolve to public addresses only; at most 3 redirects and 1 MB. */
async function fetchSource(url: URL, hops = 0): Promise<{ final: URL; status: number; body: Buffer }> {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map(a => a.address);
  if (!addresses.length || addresses.some(isPrivateAddress)) throw new Error('the source resolves to a private address');
  const res = await fetch(url, {
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
    headers: { 'user-agent': 'VeiledMarkets-AIResolver/1.0', accept: 'text/html,text/plain,application/json;q=0.9,*/*;q=0.5' },
  });
  const location = res.headers.get('location');
  if (res.status >= 300 && res.status < 400 && location) {
    const next = sourceUrl(new URL(location, url).toString());
    if (!next || hops >= 3) throw new Error('the source redirects somewhere it may not be fetched');
    return fetchSource(next, hops + 1);
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of res.body ?? []) {
    size += chunk.length;
    if (size > SOURCE_BYTES) break;
    chunks.push(Buffer.from(chunk));
  }
  return { final: url, status: res.status, body: Buffer.concat(chunks) };
}

async function readSource(text: string): Promise<{ source: Source | null; sourceText: string | null }> {
  const url = sourceUrl(text);
  if (!url) return { source: null, sourceText: null };
  const fetched_at = new Date().toISOString();
  try {
    const { final, status, body } = await fetchSource(url);
    const source: Source = { url: url.toString(), final_url: final.toString(), status, sha256: sha256Hex(body), bytes: body.length, fetched_at };
    if (status >= 400) return { source: { ...source, error: `HTTP ${status}` }, sourceText: null };
    return { source, sourceText: htmlToText(body.toString('utf8')).slice(0, SOURCE_CHARS) };
  } catch (e) {
    return { source: { url: url.toString(), fetched_at, error: (e as Error).message }, sourceText: null };
  }
}

// ------------------------------------------------------------------ NEAR AI Cloud

const auth = () => ({ authorization: `Bearer ${API_KEY}` });

/** Attestation for the model, fetched with a fresh nonce before the request. */
async function attest(): Promise<{ nonce: string; fetched_at: string; raw: string; signers: string[] }> {
  const nonce = randomBytes(32).toString('hex');
  const q = new URLSearchParams({ model: MODEL, provider: 'near', signing_algo: 'ecdsa', nonce });
  const res = await fetch(`${API}/attestation/report?${q}`, { headers: { ...auth(), accept: 'application/json' }, signal: AbortSignal.timeout(30_000) });
  const raw = await res.text();
  if (!res.ok) throw new Error(`attestation report: HTTP ${res.status} ${raw.slice(0, 200)}`);
  const report = JSON.parse(raw);
  const models: any[] = Array.isArray(report.model_attestations) ? report.model_attestations : [];
  const signers = models
    .filter(a => a.signing_algo === 'ecdsa' && (!a.request_nonce || a.request_nonce === nonce))
    .map(a => String(a.signing_address).toLowerCase());
  if (!signers.length) throw new Error('the attestation lists no ECDSA model signer for this nonce');
  return { nonce, fetched_at: new Date().toISOString(), raw, signers };
}

async function complete(body: string): Promise<{ id: string; raw: Buffer; content: string }> {
  const res = await fetch(`${API}/chat/completions`, {
    method: 'POST',
    headers: { ...auth(), 'content-type': 'application/json', 'x-no-aliasing': 'true', 'accept-encoding': 'identity' },
    body,
    signal: AbortSignal.timeout(180_000),
  });
  const raw = Buffer.from(await res.arrayBuffer());
  if (!res.ok) throw new Error(`chat completion: HTTP ${res.status} ${raw.toString('utf8').slice(0, 200)}`);
  const j = JSON.parse(raw.toString('utf8'));
  return { id: String(j.id), raw, content: String(j.choices?.[0]?.message?.content ?? '') };
}

async function signatureOf(chatId: string): Promise<TeeSignature> {
  const q = new URLSearchParams({ model: MODEL, signing_algo: 'ecdsa' });
  for (let attempt = 0; attempt < 8; attempt++) {
    const res = await fetch(`${API}/signature/${encodeURIComponent(chatId)}?${q}`, { headers: { ...auth(), accept: 'application/json' } });
    if (res.status === 404) {
      await new Promise(r => setTimeout(r, 2000));
      continue;
    }
    const j: any = await res.json();
    if (!res.ok || j.error_code) throw new Error(`signature: ${j.message ?? `HTTP ${res.status}`}`);
    return j as TeeSignature;
  }
  throw new Error('signature: not recorded after 16 s');
}

// ------------------------------------------------------------------ one market

async function resolve(m: ChainMarket): Promise<void> {
  const id = m.id;
  const text = readMarket(m);
  const { source, sourceText } = await readSource(text.source);
  const attestation = await attest();
  const attestationFile = `${id}.attestation.json`;
  writeFileSync(nodePath.join(RECEIPTS, attestationFile), attestation.raw);
  const tradingClosedAt = new Date(Number(m.deadline) * TICK_SECONDS * 1000);
  const request = buildRequest(MODEL, text, sourceText, new Date(), tradingClosedAt);
  const reply = await complete(request);
  const decision: Decision | null = parseDecision(reply.content, m.num_outcomes);
  const signature = await signatureOf(reply.id);
  const check = checkSignature(signature, MODEL, request, reply.raw, attestation.signers);
  const verifiedAt = new Date().toISOString();
  const receipt = {
    version: 1,
    contract: CONTRACT,
    market_id: id,
    question: text.question,
    rules: text.rules,
    outcomes: text.outcomes,
    trading_closed_at: tradingClosedAt.toISOString(),
    resolution_source: text.source,
    source: source ? { ...source, excerpt: sourceText?.slice(0, 2000) ?? null } : null,
    model: MODEL,
    decision,
    resolver: ACCOUNT,
    tee: {
      attestation: {
        nonce: attestation.nonce,
        fetched_at: attestation.fetched_at,
        report_sha256: sha256Hex(attestation.raw),
        report: PUBLIC_URL ? `${PUBLIC_URL}/receipts/${attestationFile}` : attestationFile,
        model_signers: attestation.signers,
      },
      signature,
      check,
      verify: verifyLink({
        completionId: reply.id,
        model: MODEL,
        signatureKind: signature.signature_kind ?? '',
        signingAlgo: signature.signing_algo,
        signingAddress: signature.signing_address,
        signedText: signature.text,
        signature: signature.signature,
        verifiedAt,
      }),
    },
    request_body: request,
    response_body: reply.raw.toString('utf8'),
    created_at: verifiedAt,
  };
  const receiptJson = JSON.stringify(receipt, null, 2);
  writeFileSync(nodePath.join(RECEIPTS, `${id}.json`), receiptJson);
  const receipt_sha256 = sha256Hex(receiptJson);
  const at = new Date().toISOString();

  if (!check.ok) {
    index[id] = { state: 'unverified', at, receipt_sha256, note: check.reason };
    console.warn(`[ai] market ${id}: not voting, ${check.reason}`);
    return;
  }
  if (!decision || decision.outcome === null || decision.confidence < MIN_CONFIDENCE) {
    index[id] = { state: 'abstained', at, receipt_sha256, note: decision ? `confidence ${decision.confidence}` : 'no readable answer' };
    console.log(`[ai] market ${id}: abstained (${index[id].note})`);
    return;
  }
  if (DRY_RUN) {
    index[id] = { state: 'abstained', at, outcome: decision.outcome, receipt_sha256, note: 'dry run' };
    console.log(`[ai] market ${id}: DRY_RUN would vote ${decision.outcome} (${text.outcomes[decision.outcome - 1]})`);
    return;
  }
  const bond = BigInt((await view<{ vote_bond: string }>('get_config', {})).vote_bond) * 10n ** 18n;
  const evidence = evidenceFor(PUBLIC_URL, id, receiptJson);
  const outcome: any = await signer().signAndSendTransaction({
    receiverId: CONTRACT,
    actions: [actions.functionCall('vote_outcome', { market_id: id, outcome: decision.outcome, evidence }, 30_000_000_000_000n, bond)],
    waitUntil: 'EXECUTED_OPTIMISTIC',
    throwOnFailure: false,
  });
  const tx: string = outcome?.transaction_outcome?.id ?? outcome?.transaction?.hash ?? 'unknown';
  const failure = outcome?.status?.Failure;
  if (failure) {
    const code = JSON.stringify(failure).match(/ERR_[A-Z_0-9]+/)?.[0] ?? 'failed';
    index[id] = { state: 'error', at, tx, receipt_sha256, note: `vote failed: ${code}` };
    console.warn(`[ai] market ${id}: vote failed ${code} tx=${tx}`);
    return;
  }
  index[id] = { state: 'voted', at, outcome: decision.outcome, tx, receipt_sha256 };
  console.log(`[ai] market ${id}: voted ${decision.outcome} (${text.outcomes[decision.outcome - 1]}) tx=${tx}`);
}

// ------------------------------------------------------------------ the loop

let lastPass: { at: string; candidates: number; error?: string } | null = null;

async function pass(): Promise<void> {
  const height = BigInt(await view<string>('get_height', {}));
  const count = Number(await view<string>('get_market_count', {}));
  const markets: ChainMarket[] = [];
  for (let from = 0; from < count; from += 100) {
    markets.push(...(await view<ChainMarket[]>('get_markets', { from: String(from), limit: 100 })));
  }
  let candidates = 0;
  for (const m of markets) {
    if (!shouldVote(m, height, false)) continue;
    const prior = index[m.id];
    if (prior?.state === 'voted') continue;
    if (prior && Date.now() - Date.parse(prior.at) < RETRY_ABSTAINED_MS) continue;
    if (await view('get_vote', { market_id: m.id, account_id: ACCOUNT })) continue;
    candidates++;
    try {
      await resolve(m);
    } catch (e) {
      index[m.id] = { state: 'error', at: new Date().toISOString(), note: (e as Error).message.slice(0, 300) };
      console.warn(`[ai] market ${m.id}: ${(e as Error).message}`);
    }
    saveIndex();
  }
  lastPass = { at: new Date().toISOString(), candidates };
}

function serve(): void {
  const send = (res: http.ServerResponse, status: number, body: string, type = 'application/json') => {
    res.writeHead(status, { 'content-type': type, 'access-control-allow-origin': '*', 'cache-control': 'no-cache' });
    res.end(body);
  };
  http
    .createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://x');
      if (url.pathname === '/health') {
        return send(res, 200, JSON.stringify({ ok: true, contract: CONTRACT, resolver: ACCOUNT, model: MODEL, dry_run: DRY_RUN, last_pass: lastPass }));
      }
      if (url.pathname === '/receipts' || url.pathname === '/receipts/') return send(res, 200, JSON.stringify(index));
      const file = url.pathname.match(/^\/receipts\/(\d+(?:\.attestation)?\.json)$/)?.[1];
      if (file && existsSync(nodePath.join(RECEIPTS, file))) return send(res, 200, readFileSync(nodePath.join(RECEIPTS, file), 'utf8'));
      return send(res, 404, JSON.stringify({ error: 'not found' }));
    })
    .listen(PORT, () => console.log(`[ai] receipts on :${PORT}`));
}

async function main(): Promise<void> {
  if (!API_KEY) throw new Error('NEARAI_API_KEY is not set (backend/.env or the environment)');
  console.log(`[ai] ${ACCOUNT} on ${CONTRACT}, model ${MODEL}${DRY_RUN ? ', DRY RUN (no votes)' : ''}`);
  if (!PUBLIC_URL) console.warn('[ai] AI_RESOLVER_PUBLIC_URL is not set: running dry, since a vote must link a receipt anyone can fetch');
  if (process.argv.includes('--once')) {
    await pass();
    console.log('[ai] pass done', JSON.stringify(lastPass));
    process.exit(0);
  }
  serve();
  for (;;) {
    try {
      await pass();
    } catch (e) {
      lastPass = { at: new Date().toISOString(), candidates: 0, error: (e as Error).message };
      console.warn('[ai] pass failed:', (e as Error).message);
    }
    await new Promise(r => setTimeout(r, POLL_SECONDS * 1000));
  }
}

main().catch(e => {
  console.error('[ai]', e.message);
  process.exit(1);
});
