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
// The same server answers the create page: GET /check-source?url=… says whether this resolver can read a source,
// with the same reader the resolver votes with (market-ai-http.ts). With MARKET_AI_API_KEY set, POST /draft turns an
// idea into a Yes/No market and POST /review scores one before it is published, with Claude (market-ai.ts,
// anthropic-model.ts); without it they answer 503.
//
// While a market trades, it also reads the market's source every AI_EARLY_CLOSE_MINUTES and asks the model, the same
// way, whether the outcome is already settled (a market asking whether something happens before a date, and it
// happened). If it is, with enough confidence and a checked signature, it ends the market's trading with close_trading
// and the early-close receipt (/receipts/<market>.early.json) as evidence, so nobody bets on a known result. It does
// this only once the contract names this account its trading closer (set_trading_closer), and only on markets the
// owner opened to an early close (set_early_close) after checking the market and its source.
//
// It also keeps the app's market → creating-transaction index (market-index.ts), built from FastNEAR's Transactions
// API and saved next to the receipts: GET /market-tx answers {contract, byId}, so market pages link to
// /market/<tx hash> without every browser paging an explorer API.
//
// With OUTLAYER_PROJECT and OUTLAYER_PAYMENT_KEY set, the resolution source is read inside OutLayer's TEE by the
// owner's published source-reader build (outlayer.ts) instead of on this server, and the receipt's source names the
// OutLayer call and its attestation. Once either variable is set, a problem with them stops the resolver from reading
// sources (each market is retried later); it never goes back to reading them itself. The create page's
// /check-source always reads on this server.
//
//   npm run ai-resolver                        loop forever, serve /health, /receipts, /check-source and /market-tx
//                                              (reads backend/.env if any)
//   npm run ai-resolver -- --once              one pass, then exit
//   npm run ai-resolver -- --serve-only        serve only, never vote (NEARAI_API_KEY not needed)
//   DRY_RUN=1 …                                decide and write receipts, never vote
//
// Env: NEARAI_API_KEY (required unless --serve-only), NEARAI_MODEL (z-ai/glm-5.3-flash),
//      VEILED_CONTRACT (v1.veiled-markets.testnet),
//      AI_RESOLVER_ACCOUNT, AI_RESOLVER_PRIVATE_KEY (default: the legacy keychain file of that account),
//      AI_RESOLVER_PUBLIC_URL (the public base URL of this service: votes link their receipts there; without it
//      the service never votes),
//      NEAR_RPC_URL (comma-separated), AI_MIN_CONFIDENCE (0.8), AI_POLL_SECONDS (120),
//      AI_RETRY_ABSTAINED_MINUTES (60), AI_EARLY_CLOSE_MINUTES (60; 0 turns early closes off),
//      AI_EARLY_CLOSE_CONFIDENCE (0.9), AI_EARLY_CLOSE_PER_PASS (3),
//      AI_RESOLVER_PORT (4091), AI_RECEIPTS_DIR (backend/ai-receipts),
//      MARKET_AI_ORIGINS (the create page's origins, comma-separated;
//      https://veiledmarkets.xyz,http://localhost:3100), MARKET_AI_CLIENT_PER_HOUR (10), MARKET_AI_DAILY_CAP (150),
//      MARKET_AI_API_KEY (an Anthropic key; turns on /draft and /review), MARKET_AI_MODEL (claude-opus-5-5),
//      MARKET_INDEX_FILE (<AI_RECEIPTS_DIR>/market-index.json), MARKET_INDEX_API (FastNEAR's Transactions API for
//      the contract's network), MARKET_INDEX_SECONDS (15; a minute after FastNEAR answers 429), FASTNEAR_API_KEY
//      (optional, from https://dashboard.fastnear.com: FastNEAR rate-limits keyless clients harder),
//      OUTLAYER_PROJECT (<owner>/<project>) and OUTLAYER_PAYMENT_KEY (<owner>:<nonce>:<secret>) to read sources in
//      OutLayer, OUTLAYER_API (OutLayer's API for the contract's network), OUTLAYER_VERSION (a published version to
//      pin), OUTLAYER_COMPUTE_LIMIT (USD micro-units a call may spend on compute).
// ============================================================================

import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import nodePath from 'node:path';
import { Account, FailoverRpcProvider, JsonRpcProvider, KeyPairSigner, actions } from 'near-api-js';
import {
  buildRequest,
  checkSignature,
  evidenceFor,
  parseDecision,
  readMarket,
  sha256Hex,
  shouldVote,
  verifyLink,
  buildEarlyCloseRequest,
  closesEarly,
  earlyEvidenceFor,
  mayCloseTrading,
  parseEarlyClose,
  receiptFile,
  shouldCheckEarly,
  type GovernanceRoles,
  type ChainMarket,
  type Decision,
  type TeeSignature,
} from './ai-resolver-core';
import { anthropicModel } from './anthropic-model';
import { draftMarket, reviewMarket } from './market-ai';
import { marketAiRoutes } from './market-ai-http';
import {
  catchUp,
  emptyIndex,
  loadIndex as loadMarketIndex,
  marketIndexApi,
  marketTxReplies,
  pollDelayMs,
  saveIndex as saveMarketIndex,
  type MarketIndex,
} from './market-index';
import { outlayerFromEnv, readSourceInOutLayer } from './outlayer';
import { RateLimiter } from './rate-limit';
import { checkSource } from './source-check';
import { defaultReaderDeps, fetchSource, limitLookups, readSource, type ReaderDeps } from './source-reader';

// The public source check reads with the resolver's own reader, but with at most 2 DNS lookups pending at once: the
// voting loop shares libuv's thread pool with them.
const checkReaderDeps: ReaderDeps = { ...defaultReaderDeps, resolveHost: limitLookups(defaultReaderDeps.resolveHost, 2) };

try {
  process.loadEnvFile(new URL('../.env', import.meta.url));
} catch (err) {
  if ((err as NodeJS.ErrnoException).code !== 'ENOENT') console.warn('[env] backend/.env not loaded:', (err as Error).message);
}

// A request handler's stray rejection must not stop the voting loop.
process.on('unhandledRejection', e => console.warn('[ai] unhandled', (e as Error)?.message ?? e));

const API = 'https://cloud-api.near.ai/v1';
const API_KEY = process.env.NEARAI_API_KEY || '';
const MODEL = process.env.NEARAI_MODEL || 'z-ai/glm-5.3-flash';
const CONTRACT = process.env.VEILED_CONTRACT || 'v1.veiled-markets.testnet';
const ACCOUNT = process.env.AI_RESOLVER_ACCOUNT || 'ai.veiled-markets.testnet';
const PUBLIC_URL = (process.env.AI_RESOLVER_PUBLIC_URL || '').replace(/\/+$/, '');
const MIN_CONFIDENCE = Number(process.env.AI_MIN_CONFIDENCE || 0.8);
const POLL_SECONDS = Number(process.env.AI_POLL_SECONDS || 120);
const RETRY_ABSTAINED_MS = Number(process.env.AI_RETRY_ABSTAINED_MINUTES || 60) * 60_000;
// How often each open market is checked for an outcome settled before its trading deadline (0 = never), the
// confidence that ends its trading, and how many checks one pass makes (each is a source read and a model call).
const EARLY_CLOSE_MS = Number(process.env.AI_EARLY_CLOSE_MINUTES ?? '60') * 60_000;
const EARLY_CLOSE_CONFIDENCE = Number(process.env.AI_EARLY_CLOSE_CONFIDENCE || 0.9);
const EARLY_CLOSE_PER_PASS = Number(process.env.AI_EARLY_CLOSE_PER_PASS || 3);
/** Trading that closes within five minutes is left to its deadline. */
const EARLY_CLOSE_MIN_TICKS_LEFT = 75n;
const PORT = Number(process.env.AI_RESOLVER_PORT || process.env.PORT || 4091);
const RECEIPTS = process.env.AI_RECEIPTS_DIR || nodePath.join(nodePath.dirname(new URL(import.meta.url).pathname), '..', 'ai-receipts');
const DRY_RUN = process.env.DRY_RUN === '1' || !PUBLIC_URL;
const RPC_URLS = (process.env.NEAR_RPC_URL || 'https://test.rpc.fastnear.com,https://near-testnet.drpc.org')
  .split(',').map(u => u.trim()).filter(Boolean);
const MARKET_AI_ORIGINS = (process.env.MARKET_AI_ORIGINS || 'https://veiledmarkets.xyz,http://localhost:3100')
  .split(',').map(o => o.trim().replace(/\/+$/, '')).filter(Boolean);
const MARKET_AI_CLIENT_PER_HOUR = Number(process.env.MARKET_AI_CLIENT_PER_HOUR || 10);
const MARKET_AI_DAILY_CAP = Number(process.env.MARKET_AI_DAILY_CAP || 150);
const MARKET_AI_API_KEY = process.env.MARKET_AI_API_KEY || '';
const MARKET_AI_MODEL = process.env.MARKET_AI_MODEL || 'claude-opus-5-5';
const MARKET_INDEX_FILE = process.env.MARKET_INDEX_FILE || nodePath.join(RECEIPTS, 'market-index.json');
const MARKET_INDEX_API = marketIndexApi(CONTRACT, process.env.MARKET_INDEX_API);
// At least 5 s between polls, whatever the variable says: the index polls a public API.
const MARKET_INDEX_SECONDS = Math.max(5, Number(process.env.MARKET_INDEX_SECONDS) || 15);
const FASTNEAR_API_KEY = process.env.FASTNEAR_API_KEY || '';
const OUTLAYER = outlayerFromEnv(process.env, CONTRACT);
const SOURCE_READER = !OUTLAYER
  ? 'this server'
  : 'config' in OUTLAYER
    ? `OutLayer ${OUTLAYER.config.project}${OUTLAYER.config.versionKey ? ` (${OUTLAYER.config.versionKey})` : ''}`
    : `none: ${OUTLAYER.problem}`;
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

/** The last early-close check of each open market. */
interface EarlyEntry {
  state: 'open' | 'closed' | 'unverified' | 'error';
  at: string;
  outcome?: number;
  tx?: string;
  receipt_sha256?: string;
  note?: string;
}

const EARLY = nodePath.join(RECEIPTS, 'early-close.json');
const early: Record<string, EarlyEntry> = existsSync(EARLY) ? JSON.parse(readFileSync(EARLY, 'utf8')) : {};
const saveEarly = () => writeFileSync(EARLY, JSON.stringify(early, null, 2));

// The resolution source is read by source-reader.ts: the same reader /check-source uses, with DNS pinned to the
// addresses it vetted. With OutLayer set up, it is read inside OutLayer's TEE instead (outlayer.ts), and the model is
// given the text made the same way.
async function readMarketSource(text: string): ReturnType<typeof readSource> {
  if (!OUTLAYER) return readSource(text);
  if ('problem' in OUTLAYER) throw new Error(`sources are not read until OutLayer is set up right: ${OUTLAYER.problem}`);
  return readSourceInOutLayer(text, OUTLAYER.config, { fetch });
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
  const { source, sourceText } = await readMarketSource(text.source);
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

// ------------------------------------------------------------------ one open market: settled already?

/** Whether the contract lets this account end trading early, read again every ten minutes. */
let closer: { at: number; may: boolean } | null = null;

async function mayClose(): Promise<boolean> {
  if (closer && Date.now() - closer.at < 600_000) return closer.may;
  let may = false;
  try {
    may = mayCloseTrading(await view<GovernanceRoles>('get_governance', {}), ACCOUNT);
  } catch {
    may = false; // a contract from before close_trading has no get_governance
  }
  if (closer?.may !== may) {
    console.log(`[ai] early close ${may ? `on: each open market every ${EARLY_CLOSE_MS / 60_000} min` : `off: the contract does not let ${ACCOUNT} close trading`}`);
  }
  closer = { at: Date.now(), may };
  return may;
}

async function checkEarly(m: ChainMarket): Promise<void> {
  const id = m.id;
  const text = readMarket(m);
  const { source, sourceText } = await readMarketSource(text.source);
  if (!sourceText) {
    // Settled means the source shows the result: with nothing read there is nothing to ask the model.
    early[id] = { state: 'open', at: new Date().toISOString(), note: 'source not readable' };
    return;
  }
  const attestation = await attest();
  const attestationFile = `${id}.early.attestation.json`;
  writeFileSync(nodePath.join(RECEIPTS, attestationFile), attestation.raw);
  const tradingClosesAt = new Date(Number(m.deadline) * TICK_SECONDS * 1000);
  const request = buildEarlyCloseRequest(MODEL, text, sourceText, new Date(), tradingClosesAt);
  const reply = await complete(request);
  const decision = parseEarlyClose(reply.content, m.num_outcomes);
  const signature = await signatureOf(reply.id);
  const check = checkSignature(signature, MODEL, request, reply.raw, attestation.signers);
  const verifiedAt = new Date().toISOString();
  const receipt = {
    version: 1,
    kind: 'early_close',
    contract: CONTRACT,
    market_id: id,
    question: text.question,
    rules: text.rules,
    outcomes: text.outcomes,
    trading_closes_at: tradingClosesAt.toISOString(),
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
  writeFileSync(nodePath.join(RECEIPTS, `${id}.early.json`), receiptJson);
  const receipt_sha256 = sha256Hex(receiptJson);
  const at = new Date().toISOString();

  if (!check.ok) {
    early[id] = { state: 'unverified', at, receipt_sha256, note: check.reason };
    console.warn(`[ai] market ${id}: early-close check not used, ${check.reason}`);
    return;
  }
  if (!decision || !closesEarly(decision, EARLY_CLOSE_CONFIDENCE)) {
    early[id] = { state: 'open', at, receipt_sha256, note: decision ? `settled ${decision.settled}, confidence ${decision.confidence}` : 'no readable answer' };
    return;
  }
  const outcome = decision.outcome as number;
  if (DRY_RUN) {
    early[id] = { state: 'open', at, outcome, receipt_sha256, note: 'dry run' };
    console.log(`[ai] market ${id}: DRY_RUN would close trading, the source settles ${outcome} (${text.outcomes[outcome - 1]})`);
    return;
  }
  const evidence = earlyEvidenceFor(PUBLIC_URL, id, receiptJson);
  const result: any = await signer().signAndSendTransaction({
    receiverId: CONTRACT,
    actions: [actions.functionCall('close_trading', { market_id: id, evidence }, 30_000_000_000_000n, 0n)],
    waitUntil: 'EXECUTED_OPTIMISTIC',
    throwOnFailure: false,
  });
  const tx: string = result?.transaction_outcome?.id ?? result?.transaction?.hash ?? 'unknown';
  const failure = result?.status?.Failure;
  if (failure) {
    const code = JSON.stringify(failure).match(/ERR_[A-Z_0-9]+/)?.[0] ?? 'failed';
    early[id] = { state: 'error', at, tx, receipt_sha256, note: `close_trading failed: ${code}` };
    console.warn(`[ai] market ${id}: close_trading failed ${code} tx=${tx}`);
    return;
  }
  early[id] = { state: 'closed', at, outcome, tx, receipt_sha256 };
  console.log(`[ai] market ${id}: trading closed early, the source settles ${outcome} (${text.outcomes[outcome - 1]}) tx=${tx}`);
}

// ------------------------------------------------------------------ the loop

let lastPass: { at: string; candidates: number; early_checks?: number; error?: string } | null = null;

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
  // Then a few open markets, each at most every EARLY_CLOSE_MS: is the outcome already settled?
  let earlyChecks = 0;
  if (EARLY_CLOSE_MS > 0 && (await mayClose())) {
    for (const m of markets) {
      if (earlyChecks >= EARLY_CLOSE_PER_PASS) break;
      if (!shouldCheckEarly(m, height, EARLY_CLOSE_MIN_TICKS_LEFT)) continue;
      const prior = early[m.id];
      if (prior && Date.now() - Date.parse(prior.at) < EARLY_CLOSE_MS) continue;
      earlyChecks++;
      try {
        await checkEarly(m);
      } catch (e) {
        early[m.id] = { state: 'error', at: new Date().toISOString(), note: (e as Error).message.slice(0, 300) };
        console.warn(`[ai] market ${m.id}: early-close check failed, ${(e as Error).message}`);
      }
      saveEarly();
    }
  }
  lastPass = { at: new Date().toISOString(), candidates, early_checks: earlyChecks };
}

// Market id → creating transaction hash (market-index.ts). Updated in place by each poll, so /market-tx serves the
// progress of a rebuild while it runs.
let markets: MarketIndex = emptyIndex();
let marketsPoll: { at: string; error?: string } | null = null;

async function followMarkets(): Promise<void> {
  try {
    markets = loadMarketIndex(MARKET_INDEX_FILE);
  } catch (e) {
    console.warn(`[index] ${(e as Error).message}; rebuilding it`);
  }
  console.log(`[index] ${Object.keys(markets.byId).length} markets up to block ${markets.height}; following ${MARKET_INDEX_API}`);
  const deps = { fetch, api: MARKET_INDEX_API, contract: CONTRACT, apiKey: FASTNEAR_API_KEY || undefined };
  for (;;) {
    let failure: unknown = null;
    try {
      await catchUp(markets, deps, i => saveMarketIndex(MARKET_INDEX_FILE, i));
      marketsPoll = { at: new Date().toISOString() };
    } catch (e) {
      failure = e;
      marketsPoll = { at: new Date().toISOString(), error: (e as Error).message.slice(0, 300) };
      console.warn('[index] poll failed:', (e as Error).message);
    }
    await new Promise(r => setTimeout(r, pollDelayMs(failure, MARKET_INDEX_SECONDS * 1000)));
  }
}

function serve(): void {
  const marketTx = marketTxReplies(CONTRACT);
  void followMarkets();
  const send = (res: http.ServerResponse, status: number, body: string, type = 'application/json') => {
    if (res.headersSent) return;
    res.writeHead(status, { 'content-type': type, 'access-control-allow-origin': '*', 'cache-control': 'no-cache' });
    res.end(body);
  };
  // The create page's endpoints. /draft and /review answer 503 until MARKET_AI_API_KEY is set. A draft's source is
  // checked, and a review reads the source, with the same reader as the public check.
  const check = (url: string) => checkSource(url, { fetch: target => fetchSource(target, checkReaderDeps) });
  const model = MARKET_AI_API_KEY ? anthropicModel({ apiKey: MARKET_AI_API_KEY, model: MARKET_AI_MODEL, log: line => console.log(line) }) : null;
  console.log(`[ai] AI drafting and review: ${model ? MARKET_AI_MODEL : 'off (no MARKET_AI_API_KEY)'}`);
  const now = () => new Date();
  const routes = marketAiRoutes({
    checkSource: check,
    draft: model ? input => draftMarket(input, { model, check, now }) : undefined,
    review: model ? input => reviewMarket(input, { model, read: async url => (await readSource(url, checkReaderDeps)).sourceText, now }) : undefined,
    origins: MARKET_AI_ORIGINS,
    checkLimiter: new RateLimiter({ perClient: 30, clientWindowMs: 60_000 }),
    aiLimiter: new RateLimiter({ perClient: MARKET_AI_CLIENT_PER_HOUR, clientWindowMs: 3_600_000, globalPerUtcDay: MARKET_AI_DAILY_CAP }),
  });
  http
    .createServer((req, res) => {
      routes(req, res)
        .then(handled => {
          if (handled) return;
          const url = new URL(req.url ?? '/', 'http://x');
          if (url.pathname === '/health') {
            const marketIndex = { height: markets.height, markets: Object.keys(markets.byId).length, last_poll: marketsPoll };
            const earlyClose = {
              every_minutes: EARLY_CLOSE_MS / 60_000,
              confidence: EARLY_CLOSE_CONFIDENCE,
              permitted: closer?.may ?? null,
              closed: Object.values(early).filter(e => e.state === 'closed').length,
            };
            return send(res, 200, JSON.stringify({ ok: true, contract: CONTRACT, resolver: ACCOUNT, model: MODEL, dry_run: DRY_RUN, source_reader: SOURCE_READER, drafting: model ? MARKET_AI_MODEL : 'off', last_pass: lastPass, early_close: earlyClose, market_index: marketIndex }));
          }
          if (url.pathname === '/market-tx') {
            const r = marketTx(markets, { acceptEncoding: req.headers['accept-encoding'], ifNoneMatch: req.headers['if-none-match'] });
            if (res.headersSent) return;
            res.writeHead(r.status, { ...r.headers, 'access-control-allow-origin': '*', 'cache-control': 'no-cache' });
            return void res.end(r.body);
          }
          if (url.pathname === '/receipts' || url.pathname === '/receipts/') return send(res, 200, JSON.stringify(index));
          if (url.pathname === '/receipts/early') return send(res, 200, JSON.stringify(early));
          const file = receiptFile(url.pathname);
          if (file && existsSync(nodePath.join(RECEIPTS, file))) return send(res, 200, readFileSync(nodePath.join(RECEIPTS, file), 'utf8'));
          return send(res, 404, JSON.stringify({ error: 'not found' }));
        })
        .catch(e => {
          console.warn('[ai] request failed:', (e as Error)?.message);
          send(res, 500, JSON.stringify({ error: 'Internal error.' }));
        });
    })
    .listen(PORT, () => console.log(`[ai] listening on :${PORT}`));
}

async function main(): Promise<void> {
  if (process.argv.includes('--serve-only')) {
    console.log(`[ai] serve only (no voting): /health, /receipts, /check-source, /draft, /review, /market-tx; origins ${MARKET_AI_ORIGINS.join(', ')}`);
    serve();
    return;
  }
  if (!API_KEY) throw new Error('NEARAI_API_KEY is not set (backend/.env or the environment)');
  console.log(`[ai] ${ACCOUNT} on ${CONTRACT}, model ${MODEL}${DRY_RUN ? ', DRY RUN (no votes)' : ''}; sources read by ${SOURCE_READER}`);
  if (OUTLAYER && 'problem' in OUTLAYER) console.warn(`[ai] OutLayer is not set up right, so no market is resolved: ${OUTLAYER.problem}`);
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
