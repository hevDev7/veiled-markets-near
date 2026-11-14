// Owner tool for ending a market's trading early, so nobody bets on a result that is already known. The owner may
// close any open market; the trading closer (the AI resolver) only markets the owner opened to an early close, after
// checking the market and its source. Nothing reopens trading once it is closed.
//
// Usage (from backend/):
//   npx tsx scripts/early-close.ts status [marketId ...]       the trading closer, and which open markets it may close
//   npx tsx scripts/early-close.ts closer <account|none>       name the trading closer (the AI resolver), or remove it
//   npx tsx scripts/early-close.ts open <marketId> [...]       let the trading closer close these markets early
//   npx tsx scripts/early-close.ts withdraw <marketId> [...]   take that back
//   npx tsx scripts/early-close.ts close <marketId> [--evidence=<url>]   end a market's trading now, as the owner
// Options: --account=<owner, default veiled-markets.testnet>. Signs with the key in ~/.near-credentials.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { Account, FailoverRpcProvider, JsonRpcProvider, KeyPairSigner, actions } from 'near-api-js';
import { settled } from './settle';

const CONTRACT = process.env.VEILED_CONTRACT ?? 'v1.veiled-markets.testnet';
const RPCS = (process.env.NEAR_RPC_URL ?? 'https://test.rpc.fastnear.com,https://near-testnet.drpc.org').split(',');
const argv = process.argv.slice(2);
const option = (name: string) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const accountId = option('account') ?? 'veiled-markets.testnet';
const [command, ...rest] = argv.filter((a) => !a.startsWith('--'));

const provider = new FailoverRpcProvider(RPCS.map((url) => new JsonRpcProvider({ url: url.trim() })));
const view = <T>(method: string, args: Record<string, unknown> = {}) =>
  provider.callFunction({ contractId: CONTRACT, method, args }) as Promise<T>;

function signer(): Account {
  const file = path.join(homedir(), '.near-credentials', 'testnet', `${accountId}.json`);
  return new Account(accountId, provider, KeyPairSigner.fromSecretKey(JSON.parse(readFileSync(file, 'utf8')).private_key));
}

async function call(method: string, args: Record<string, unknown>) {
  const tx: any = await signer().signAndSendTransaction({
    receiverId: CONTRACT,
    actions: [actions.functionCall(method, args, 30_000_000_000_000n, 0n)],
    waitUntil: 'EXECUTED_OPTIMISTIC',
  });
  if (tx.status?.SuccessValue === undefined) throw new Error(`${method} failed: ${JSON.stringify(tx.status).slice(0, 300)}`);
  console.log(`  ${method} ${JSON.stringify(args)} ok  tx ${tx.transaction_outcome.id}`);
}

interface MarketView { id: string; status: number; deadline: string; early_close?: boolean; metadata: string }
const ACTIVE = 1;

/** The trading closer, null when none is named, undefined on a contract without close_trading. */
async function tradingCloser(): Promise<string | null | undefined> {
  try {
    return (await view<{ trading_closer?: string | null }>('get_governance')).trading_closer;
  } catch {
    return undefined;
  }
}

const LAGS = 'the RPC does not show the change yet; the transaction succeeded';

/** Waits until the RPC shows what was just written to a market, and says so when it still does not. */
async function marketShows(id: string, done: (m: MarketView) => boolean) {
  const m = await settled(() => view<MarketView | null>('get_market', { market_id: id }), (v) => !!v && done(v));
  if (!m || !done(m)) console.log(`  #${id}: ${LAGS}`);
}

async function status(ids: string[]) {
  const closer = await tradingCloser();
  if (closer === undefined) {
    console.log(`${CONTRACT} has no close_trading yet: upgrade the contract first.`);
    return;
  }
  console.log(`trading closer: ${closer ?? 'none'}`);
  let markets: MarketView[];
  if (ids.length) {
    markets = (await Promise.all(ids.map((id) => view<MarketView | null>('get_market', { market_id: id })))).filter((m): m is MarketView => !!m);
  } else {
    const count = Number(await view<string>('get_market_count'));
    markets = [];
    for (let from = 0; from < count; from += 100) markets.push(...(await view<MarketView[]>('get_markets', { from: String(from), limit: 100 })));
    markets = markets.filter((m) => m.status === ACTIVE);
  }
  for (const m of markets) {
    let question = '';
    try { question = JSON.parse(m.metadata).q ?? ''; } catch { /* not JSON */ }
    const trading = m.status === ACTIVE ? `trades until tick ${m.deadline}` : `status ${m.status}`;
    console.log(`#${m.id} ${m.early_close ? 'open to an early close' : 'owner only'}  ${trading}  ${question.slice(0, 60)}`);
  }
}

if (command === 'status') {
  await status(rest);
} else if (command === 'closer' && rest.length === 1) {
  const want = rest[0] === 'none' ? null : rest[0];
  await call('set_trading_closer', { trading_closer: want });
  const now = await settled(tradingCloser, (c) => (c ?? null) === want);
  console.log(`trading closer: ${now ?? 'none'}${(now ?? null) === want ? '' : `  (${LAGS})`}`);
} else if ((command === 'open' || command === 'withdraw') && rest.length) {
  const allowed = command === 'open';
  for (const id of rest) await call('set_early_close', { market_id: id, allowed });
  for (const id of rest) await marketShows(id, (m) => (m.early_close === true) === allowed);
  await status(rest);
} else if (command === 'close' && rest.length === 1) {
  const evidence = option('evidence');
  await call('close_trading', { market_id: rest[0], evidence: evidence ?? null });
  await marketShows(rest[0], (m) => m.status !== ACTIVE);
  await status(rest);
} else {
  console.error('usage: early-close.ts status [marketId ...] | closer <account|none> | open <marketId ...> | ' +
    'withdraw <marketId ...> | close <marketId> [--evidence=<url>]  [--account=<owner>]');
  process.exit(1);
}
