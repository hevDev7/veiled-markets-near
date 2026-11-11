// Testnet smoke test of the private path: a public deposit, then a relayed private withdrawal proven in Node.
// Usage (from backend/): npx tsx scripts/testnet-smoke.ts [depositor=veiled-markets.testnet] [relayer=http://localhost:4100]
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { Account, JsonRpcProvider, KeyPairSigner, actions } from 'near-api-js';
// @ts-ignore -- plain ESM helper shared with the circuit tests
import { initPoseidon, MerkleTree, ownerBlind, spendInput, proveSpend, contractArgs } from '../../near/circuits/lib/notes.mjs';

const CONTRACT = process.env.VEILED_CONTRACT ?? 'v1.veiled-markets.testnet';
const RPC = process.env.NEAR_RPC_URL ?? 'https://test.rpc.fastnear.com';
const who = process.argv[2] ?? 'veiled-markets.testnet';
const relayerUrl = process.argv[3] ?? 'http://localhost:4100';
const key = JSON.parse(readFileSync(path.join(homedir(), '.near-credentials', 'testnet', `${who}.json`), 'utf8')).private_key;
const provider = new JsonRpcProvider({ url: RPC });
const account = new Account(who, provider, KeyPairSigner.fromSecretKey(key));
const rand = () => BigInt('0x' + randomBytes(31).toString('hex'));

await initPoseidon();
const sk = rand();
const [b1, b2, b3, b4] = [rand(), rand(), rand(), rand()];
const AMOUNT = 50_000n; // 0.05 NEAR in micro units

const dep: any = await account.signAndSendTransaction({
  receiverId: CONTRACT,
  actions: [actions.functionCall('deposit_near', { owner_blind: ownerBlind(sk, b1).toString(), memo: '' }, 50_000_000_000_000n, AMOUNT * 10n ** 18n)],
  waitUntil: 'EXECUTED_OPTIMISTIC',
});
const index = Number(JSON.parse(Buffer.from(dep.status.SuccessValue, 'base64').toString()));
console.log('deposit tx', dep.transaction_outcome.id, 'note index', index);

const leaves: string[] = [];
for (;;) {
  const page: any[] = (await provider.callFunction({ contractId: CONTRACT, method: 'get_leaves', args: { from: String(leaves.length), limit: 500 } })) as any[];
  if (!page.length) break;
  leaves.push(...page.map((l) => l.commitment));
}
const tree = new MerkleTree();
tree.leaves = leaves.map((x) => BigInt(x));
const extData = JSON.stringify({
  action: { type: 'withdraw', recipient: who },
  new_owner_blind: ownerBlind(sk, b3).toString(),
  new_memo: '',
  change_memo: '',
  fee: '0',
});
const t0 = Date.now();
const { input } = spendInput({
  sk, tree, kind: 1, asset: 1, sub: 0,
  notes: [{ amount: AMOUNT, blinding: b1, index }, { amount: 0n, blinding: b2 }],
  outAmount: 20_000n, changeBlinding: b4, extData,
});
const { proof, publicSignals } = await proveSpend(input);
console.log(`proved in ${Date.now() - t0} ms`);
const res = await fetch(`${relayerUrl}/relay`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ ...contractArgs(proof, publicSignals), ext_data: extData }),
});
const out: any = await res.json();
console.log('relay', res.status, JSON.stringify(out));
if (out.txHash) {
  const tx: any = await provider.viewTransactionStatus({ txHash: out.txHash, accountId: 'veiled-relayer.testnet', waitUntil: 'EXECUTED_OPTIMISTIC' });
  console.log('signer of the private withdrawal:', tx.transaction.signer_id);
  const burnt = [tx.transaction_outcome, ...tx.receipts_outcome].reduce((s: bigint, o: any) => s + BigInt(o.outcome.gas_burnt), 0n);
  console.log(`gas burnt: ${(Number(burnt) / 1e12).toFixed(1)} TGas`);
}
(globalThis as any).curve_bn128?.terminate?.();
process.exit(out.ok ? 0 : 1);
