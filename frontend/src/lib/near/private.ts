// Private actions end to end: select notes → build ext_data (encrypted memos for the change and the minted note)
// → prove in a worker → submit through the relayer → update the local notes. Also the public deposits that fund
// the private balance (shielding), which are the only wallet-signed steps of private trading.
import { KIND, TOKEN, VEILED_CONTRACT, YOCTO_PER_MICRO, tokenAccount } from './config';
import { callContract, currentAccountId, signMessage } from './near-wallet';
import { commitmentOf, extDataHash, nullifierOf, ownerBlindOf, randomField } from './notes/crypto';
import { cachedNoteKeys, unlockNoteKeys, type NoteKeys } from './notes/keys';
import { sealMemo } from './notes/memo';
import { prove } from './notes/prove';
import { balanceOf, setStatus, syncNotes, treeOf, unspent, upsertNote, type Note } from './notes/store';
import { EMPTY_PATH } from './notes/tree';
import { relay, type TransactResult } from './relayer';

export type PrivateStep = 'unlocking' | 'syncing' | 'merging' | 'proving' | 'relaying' | 'done';

export class PrivateBalanceError extends Error {
  constructor(message: string, readonly available: bigint, readonly needed: bigint) {
    super(message);
    this.name = 'PrivateBalanceError';
  }
}

export async function requireAccount(): Promise<string> {
  const id = await currentAccountId();
  if (!id) throw new Error('Connect a NEAR wallet first.');
  return id;
}

/** Note keys for the connected account, asking the wallet to sign the key message on first use. */
export async function noteKeys(): Promise<NoteKeys> {
  const accountId = await requireAccount();
  return (await cachedNoteKeys(accountId)) ?? unlockNoteKeys(accountId, signMessage);
}

/** Up-to-date notes of the connected account (empty when keys are not unlocked yet and `unlock` is false). */
export async function refreshNotes(unlock = false): Promise<Note[]> {
  const accountId = await currentAccountId();
  if (!accountId) return [];
  const keys = unlock ? await noteKeys() : await cachedNoteKeys(accountId);
  if (!keys) return [];
  return syncNotes(keys);
}

// One private action at a time: two concurrent ones could pick the same notes.
let chain: Promise<unknown> = Promise.resolve();
function exclusive<T>(job: () => Promise<T>): Promise<T> {
  const run = chain.then(job, job);
  chain = run.catch(() => undefined);
  return run;
}

/** Picks one or two unspent notes of (kind, asset, sub) covering `amount`: the smallest single note that does, else
 * the two largest. Returns null when two notes are not enough (merging needed) and throws when the total is short. */
export function selectNotes(notes: Note[], kind: number, asset: bigint, sub: number, amount: bigint): Note[] | null {
  const pool = notes
    .filter((n) => n.status === 'unspent' && n.kind === kind && n.asset === asset && n.sub === sub)
    .sort((a, b) => (a.amount < b.amount ? 1 : a.amount > b.amount ? -1 : 0));
  const total = pool.reduce((s, n) => s + n.amount, 0n);
  if (total < amount) throw new PrivateBalanceError('Not enough private balance for this action.', total, amount);
  const single = [...pool].reverse().find((n) => n.amount >= amount);
  if (single) return [single];
  if (pool.length >= 2 && pool[0].amount + pool[1].amount >= amount) return [pool[0], pool[1]];
  return null;
}

export interface PrivateActionRequest {
  kind: number;
  asset: bigint | number;
  sub: number;
  /** Value leaving the spent notes (ext_data-bound `out_amount`). */
  amount: bigint;
  action: Record<string, unknown>;
  /** Spend exactly these notes instead of selecting. */
  notes?: Note[];
  onStep?: (step: PrivateStep) => void;
}

export interface PrivateActionResult {
  txHash: string;
  result: TransactResult;
  minted: Note | null;
  change: Note | null;
}

async function spendOnce(keys: NoteKeys, req: PrivateActionRequest, inputs: Note[]): Promise<PrivateActionResult> {
  const asset = BigInt(req.asset);
  const tree = treeOf(keys.accountId);
  const sum = inputs.reduce((s, n) => s + n.amount, 0n);
  if (sum < req.amount) throw new PrivateBalanceError('Not enough private balance for this action.', sum, req.amount);
  const changeAmount = sum - req.amount;
  const changeBlinding = randomField();
  const newBlinding = randomField();
  // A buy's share note keeps what it cost in its memo (only this key opens it; out_amount is public anyway), so the
  // position's cost can be shown from the chain alone, in another browser too.
  const cost = req.action.type === 'buy' ? req.amount : null;
  const ext = JSON.stringify({
    action: req.action,
    new_owner_blind: ownerBlindOf(keys.sk, newBlinding).toString(),
    new_memo: await sealMemo(keys.memoKey, { b: newBlinding.toString(), ...(cost !== null ? { c: cost.toString() } : {}) }),
    change_memo:
      changeAmount > 0n
        ? await sealMemo(keys.memoKey, {
            k: req.kind, a: asset.toString(), s: req.sub, m: changeAmount.toString(), b: changeBlinding.toString(),
          })
        : '',
    fee: '0',
  });

  const padded = inputs.length === 2 ? inputs : [inputs[0], null];
  const inAmount: string[] = [];
  const inBlinding: string[] = [];
  const pathElements: string[][] = [];
  const pathIndices: number[][] = [];
  const nullifiers: bigint[] = [];
  for (const n of padded) {
    if (n) {
      const p = tree.path(n.index);
      inAmount.push(n.amount.toString());
      inBlinding.push(n.blinding.toString());
      pathElements.push(p.pathElements.map(String));
      pathIndices.push(p.pathIndices);
      nullifiers.push(n.nullifier);
    } else {
      const b = randomField();
      inAmount.push('0');
      inBlinding.push(b.toString());
      pathElements.push(EMPTY_PATH.pathElements.map(String));
      pathIndices.push(EMPTY_PATH.pathIndices);
      nullifiers.push(nullifierOf(keys.sk, commitmentOf(req.kind, asset, req.sub, 0n, ownerBlindOf(keys.sk, b))));
    }
  }
  const changeCommitment = commitmentOf(req.kind, asset, req.sub, changeAmount, ownerBlindOf(keys.sk, changeBlinding));
  const input = {
    root: tree.root().toString(),
    nullifier1: nullifiers[0].toString(),
    nullifier2: nullifiers[1].toString(),
    changeCommitment: changeCommitment.toString(),
    kind: String(req.kind),
    asset: asset.toString(),
    sub: String(req.sub),
    outAmount: req.amount.toString(),
    extDataHash: (await extDataHash(ext)).toString(),
    sk: keys.sk.toString(),
    inAmount,
    inBlinding,
    pathElements,
    pathIndices,
    changeBlinding: changeBlinding.toString(),
  };

  req.onStep?.('proving');
  const { proof, publicSignals } = await prove(input);
  const [root, nullifier1, nullifier2, change_commitment, kind, assetS, sub, out_amount, ext_data_hash] = publicSignals;

  req.onStep?.('relaying');
  setStatus(keys.accountId, inputs, 'pending');
  let relayed: { txHash: string; result: TransactResult };
  try {
    relayed = await relay({
      proof: {
        a: [proof.pi_a[0], proof.pi_a[1]],
        b: [[proof.pi_b[0][0], proof.pi_b[0][1]], [proof.pi_b[1][0], proof.pi_b[1][1]]],
        c: [proof.pi_c[0], proof.pi_c[1]],
      },
      public: { root, nullifier1, nullifier2, change_commitment, kind, asset: assetS, sub, out_amount, ext_data_hash },
      ext_data: ext,
    });
  } catch (err) {
    setStatus(keys.accountId, inputs, 'unspent');
    throw err;
  }
  setStatus(keys.accountId, inputs, 'spent');

  const r = relayed.result;
  const now = Date.now();
  let change: Note | null = null;
  if (changeAmount > 0n) {
    change = {
      kind: req.kind, asset, sub: req.sub, amount: changeAmount, blinding: changeBlinding,
      index: Number(r.change_index), commitment: changeCommitment,
      nullifier: nullifierOf(keys.sk, changeCommitment), status: 'unspent', createdAt: now,
    };
    upsertNote(keys.accountId, change);
  }
  let minted: Note | null = null;
  if (r.new_kind !== 0 && BigInt(r.new_amount) > 0n) {
    const c = BigInt(r.new_commitment);
    minted = {
      kind: r.new_kind, asset: BigInt(r.new_asset), sub: r.new_sub, amount: BigInt(r.new_amount), blinding: newBlinding,
      index: Number(r.new_index), commitment: c, nullifier: nullifierOf(keys.sk, c), status: 'unspent', createdAt: now,
      ...(cost !== null ? { cost } : {}),
    };
    upsertNote(keys.accountId, minted);
  }
  // Leaves the relay added, so the next proof's tree is current without a round trip.
  tree.push(changeCommitment, r.new_kind !== 0 ? BigInt(r.new_commitment) : 0n);
  return { txHash: relayed.txHash, result: r, minted, change };
}

/** Runs one private action (with merges first when more than two notes are needed). */
export function privateAction(req: PrivateActionRequest): Promise<PrivateActionResult> {
  return exclusive(async () => {
    req.onStep?.('unlocking');
    const keys = await noteKeys();
    req.onStep?.('syncing');
    await syncNotes(keys);
    const asset = BigInt(req.asset);
    let inputs = req.notes ?? null;
    if (!inputs) {
      for (;;) {
        inputs = selectNotes(unspent(keys.accountId), req.kind, asset, req.sub, req.amount);
        if (inputs) break;
        // Too fragmented: merge the two largest notes into one and try again.
        req.onStep?.('merging');
        const pool = unspent(keys.accountId)
          .filter((n) => n.kind === req.kind && n.asset === asset && n.sub === req.sub)
          .sort((a, b) => (a.amount < b.amount ? 1 : -1));
        await spendOnce(keys, { ...req, amount: 0n, action: mergeAction(req.kind) }, [pool[0], pool[1]]);
      }
    }
    const out = await spendOnce(keys, req, inputs);
    req.onStep?.('done');
    return out;
  });
}

/** A zero-value spend that only merges notes. Balance notes use a 0 withdraw (recipient unused); other kinds cannot. */
function mergeAction(kind: number): Record<string, unknown> {
  if (kind !== KIND.BALANCE) throw new Error('Too many small positions to spend at once; spend them one by one.');
  return { type: 'withdraw', recipient: VEILED_CONTRACT };
}

// ---------------------------------------------------------------- public deposits (shielding)

async function depositMemo(keys: NoteKeys) {
  const blinding = randomField();
  return {
    blinding,
    owner_blind: ownerBlindOf(keys.sk, blinding).toString(),
    memo: await sealMemo(keys.memoKey, { b: blinding.toString() }),
  };
}

/** Moves `micro` units of a token from the wallet into the private balance. The deposit itself is public. */
export async function deposit(token: number, micro: bigint): Promise<{ txHash: string }> {
  const keys = await noteKeys();
  const d = await depositMemo(keys);
  let txHash: string;
  if (token === TOKEN.NEAR) {
    const r = await callContract({
      method: 'deposit_near',
      args: { owner_blind: d.owner_blind, memo: d.memo },
      deposit: micro * YOCTO_PER_MICRO,
    });
    txHash = r.txHash;
  } else {
    const ft = tokenAccount(token);
    if (!ft) throw new Error(`unknown token ${token}`);
    const r = await callContract({
      contractId: ft,
      method: 'ft_transfer_call',
      args: {
        receiver_id: VEILED_CONTRACT,
        amount: micro.toString(),
        msg: JSON.stringify({ deposit: { owner_blind: d.owner_blind, memo: d.memo } }),
      },
      deposit: 1n,
      gas: 200_000_000_000_000n,
    });
    txHash = r.txHash;
  }
  await syncNotes(keys);
  return { txHash };
}

/** Private balance of a token in micro units (0 until the keys are unlocked). */
export async function privateBalance(token: number): Promise<bigint> {
  const accountId = await currentAccountId();
  if (!accountId || !(await cachedNoteKeys(accountId))) return 0n;
  return balanceOf(accountId, KIND.BALANCE, token, 0);
}

/** The wallet store's private balance fields, each read from its token's own slot ('usdcxPrivate' is Circle USDC). */
export async function privateBalances(): Promise<{ private: bigint; usdcxPrivate: bigint; usadPrivate: bigint }> {
  const [near, usdc, usad] = await Promise.all([
    privateBalance(TOKEN.NEAR),
    privateBalance(TOKEN.USDCX),
    privateBalance(TOKEN.USAD),
  ]);
  return { private: near, usdcxPrivate: usdc, usadPrivate: usad };
}

/** Tops the private balance up from the wallet when it is short of `micro` (one public deposit). */
export async function ensurePrivateBalance(token: number, micro: bigint): Promise<void> {
  const keys = await noteKeys();
  await syncNotes(keys);
  const have = balanceOf(keys.accountId, KIND.BALANCE, token, 0);
  if (have >= micro) return;
  await deposit(token, micro - have);
}

/** Private withdrawal to any account (yours or another). */
export function withdraw(token: number, micro: bigint, recipient: string, onStep?: (s: PrivateStep) => void) {
  return privateAction({
    kind: KIND.BALANCE, asset: token, sub: 0, amount: micro,
    action: { type: 'withdraw', recipient }, onStep,
  });
}
