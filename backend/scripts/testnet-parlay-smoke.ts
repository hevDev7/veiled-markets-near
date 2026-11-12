// Testnet smoke test of a private parlay: a public deposit, then a parlay bet proven in Node that spends the deposit
// note and mints a parlay ticket note. The bet goes through the relayer when one is given, else the depositor submits
// the proof itself (the contract accepts a proof from any account).
// Usage (from backend/): npx tsx scripts/testnet-parlay-smoke.ts <marketA> <marketB> [depositor=veiled-markets.testnet] [relayer]
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { Account, JsonRpcProvider, KeyPairSigner, actions } from 'near-api-js';
// @ts-ignore -- plain ESM helper shared with the circuit tests
import { initPoseidon, MerkleTree, ownerBlind, spendInput, proveSpend, contractArgs } from '../../near/circuits/lib/notes.mjs';

const CONTRACT = process.env.VEILED_CONTRACT ?? 'v1.veiled-markets.testnet';
const RPC = process.env.NEAR_RPC_URL ?? 'https://test.rpc.fastnear.com';
const [marketA, marketB] = [process.argv[2], process.argv[3]];
if (!marketA || !marketB) throw new Error('usage: testnet-parlay-smoke.ts <marketA> <marketB> [depositor] [relayer]');
const who = process.argv[4] ?? 'veiled-markets.testnet';
const relayerUrl = process.argv[5];
const key = JSON.parse(readFileSync(path.join(homedir(), '.near-credentials', 'testnet', `${who}.json`), 'utf8')).private_key;
const provider = new JsonRpcProvider({ url: RPC });
const account = new Account(who, provider, KeyPairSigner.fromSecretKey(key));
const rand = () => BigInt('0x' + randomBytes(31).toString('hex'));
const view = (method: string, args: object) => provider.callFunction({ contractId: CONTRACT, method, args }) as Promise<any>;

await initPoseidon();
const sk = rand();
const [b1, b2, b3, b4] = [rand(), rand(), rand(), rand()];
const STAKE = 100_000n; // 0.1 NEAR, the minimum stake
const legs = [
  { market_id: marketA, outcome: 1 },
  { market_id: marketB, outcome: 1 },
];

const quote = await view('quote_parlay', { token: 1, stake: STAKE.toString(), legs });
console.log('quote', JSON.stringify(quote));

const dep: any = await account.signAndSendTransaction({
  receiverId: CONTRACT,
  actions: [actions.functionCall('deposit_near', { owner_blind: ownerBlind(sk, b1).toString(), memo: '' }, 50_000_000_000_000n, STAKE * 10n ** 18n)],
  waitUntil: 'EXECUTED_OPTIMISTIC',
});
const index = Number(JSON.parse(Buffer.from(dep.status.SuccessValue, 'base64').toString()));
console.log('deposit tx', dep.transaction_outcome.id, 'note index', index);

const leaves: string[] = [];
for (;;) {
  const page: any[] = await view('get_leaves', { from: String(leaves.length), limit: 500 });
  if (!page.length) break;
  leaves.push(...page.map((l) => l.commitment));
}
const tree = new MerkleTree();
tree.leaves = leaves.map((x) => BigInt(x));
// 2% below the quote, the slippage guard the app uses.
const minPayout = (BigInt(quote.potential_payout) * 98n) / 100n;
const extData = JSON.stringify({
  action: { type: 'parlay_buy', legs, min_payout: minPayout.toString() },
  new_owner_blind: ownerBlind(sk, b3).toString(),
  new_memo: '',
  change_memo: '',
  fee: '0',
});
const t0 = Date.now();
const { input } = spendInput({
  sk, tree, kind: 1, asset: 1, sub: 0,
  notes: [{ amount: STAKE, blinding: b1, index }, { amount: 0n, blinding: b2 }],
  outAmount: STAKE, changeBlinding: b4, extData,
});
const { proof, publicSignals } = await proveSpend(input);
console.log(`proved in ${Date.now() - t0} ms`);
const args = { ...contractArgs(proof, publicSignals), ext_data: extData };

let result: any;
if (relayerUrl) {
  const res = await fetch(`${relayerUrl}/relay`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(args) });
  const out: any = await res.json();
  console.log('relay', res.status, JSON.stringify(out));
  if (!out.ok) process.exit(1);
  result = out.result;
} else {
  const tx: any = await account.signAndSendTransaction({
    receiverId: CONTRACT,
    actions: [actions.functionCall('transact', args, 300_000_000_000_000n, 0n)],
    waitUntil: 'EXECUTED_OPTIMISTIC',
  });
  if (!tx.status.SuccessValue) throw new Error('transact failed: ' + JSON.stringify(tx.status).slice(0, 400));
  result = JSON.parse(Buffer.from(tx.status.SuccessValue, 'base64').toString());
  const burnt = [tx.transaction_outcome, ...tx.receipts_outcome].reduce((s: bigint, o: any) => s + BigInt(o.outcome.gas_burnt), 0n);
  console.log('parlay tx', tx.transaction_outcome.id, `gas burnt: ${(Number(burnt) / 1e12).toFixed(1)} TGas`);
}
console.log('transact result', JSON.stringify(result));
const parlay = await view('get_parlay', { parlay_id: String(result.new_asset) });
console.log('parlay', JSON.stringify(parlay));
console.log('pool', JSON.stringify(await view('get_parlay_pool', {})));
(globalThis as any).curve_bn128?.terminate?.();
process.exit(parlay ? 0 : 1);
