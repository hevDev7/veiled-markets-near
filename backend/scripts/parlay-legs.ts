// Owner tool for parlay legs. Only markets the owner approved can be used in a parlay, and one ticket pays at most a
// set share of its thinnest leg's pool depth (outcomes x smallest reserve; 1% unless changed).
//
// Usage (from backend/):
//   npx tsx scripts/parlay-legs.ts status [marketId ...]          approval, depth and the largest payout per market
//   npx tsx scripts/parlay-legs.ts approve <marketId> [...]       let these markets be parlay legs
//   npx tsx scripts/parlay-legs.ts revoke <marketId> [...]        stop new tickets on them (open tickets stay valid)
//   npx tsx scripts/parlay-legs.ts cap <bps>                      share of the thinnest leg one ticket may pay (100 = 1%)
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

interface MarketView { id: string; status: number; num_outcomes: number; reserves: string[]; parlay_leg?: boolean; metadata: string }
const micro = (x: bigint) => (Number(x) / 1e6).toFixed(6);

async function status(ids: string[]) {
  const pool = await view<{ leg_payout_bps?: string }>('get_parlay_pool');
  const bps = BigInt(pool.leg_payout_bps ?? '100');
  console.log(`leg cap: ${bps} bps of the thinnest leg's depth`);
  let markets: MarketView[];
  if (ids.length) {
    markets = (await Promise.all(ids.map((id) => view<MarketView | null>('get_market', { market_id: id })))).filter((m): m is MarketView => !!m);
  } else {
    const count = Number(await view<string>('get_market_count'));
    markets = [];
    for (let from = 0; from < count; from += 100) markets.push(...(await view<MarketView[]>('get_markets', { from: String(from), limit: 100 })));
  }
  for (const m of markets) {
    const reserves = m.reserves.slice(0, m.num_outcomes).map(BigInt);
    const depth = reserves.reduce((a, b) => (a < b ? a : b)) * BigInt(m.num_outcomes);
    let question = '';
    try { question = JSON.parse(m.metadata).q ?? ''; } catch { /* not JSON */ }
    console.log(`#${m.id} ${m.parlay_leg ? 'approved' : 'not approved'}  status ${m.status}  depth ${micro(depth)}  ` +
      `largest payout ${micro((depth * bps) / 10_000n)}  ${question.slice(0, 50)}`);
  }
}

if (command === 'status') {
  await status(rest);
} else if ((command === 'approve' || command === 'revoke') && rest.length) {
  const eligible = command === 'approve';
  for (const id of rest) await call('set_parlay_leg', { market_id: id, eligible });
  // The RPC's load balancer can answer from a node a block behind the transaction: wait until it shows the change.
  for (const id of rest) {
    const m = await settled(() => view<MarketView | null>('get_market', { market_id: id }), (v) => (v?.parlay_leg === true) === eligible);
    if ((m?.parlay_leg === true) !== eligible) console.log(`  #${id}: the RPC does not show the change yet; the transaction succeeded`);
  }
  await status(rest);
} else if (command === 'cap' && /^\d+$/.test(rest[0] ?? '')) {
  await call('set_parlay_leg_cap', { bps: rest[0] });
} else {
  console.error('usage: parlay-legs.ts status [marketId ...] | approve <marketId ...> | revoke <marketId ...> | cap <bps>  [--account=<owner>]');
  process.exit(1);
}
