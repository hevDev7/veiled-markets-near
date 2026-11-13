// The user's notes: found on chain through their encrypted memos, kept in localStorage per account, checked
// against the contract's nullifier set. Also keeps the full leaf list, which every proof needs for its Merkle path.
import { view } from '../rpc';
import { commitmentOf, nullifierOf, ownerBlindOf } from './crypto';
import type { NoteKeys } from './keys';
import { openMemo } from './memo';
import { MerkleTree } from './tree';

export type NoteStatus = 'unspent' | 'pending' | 'spent';

export interface Note {
  kind: number;
  asset: bigint;
  sub: number;
  amount: bigint;
  blinding: bigint;
  index: number;
  commitment: bigint;
  nullifier: bigint;
  status: NoteStatus;
  createdAt: number;
  /** What a buy spent for this share note (micro units), from the buyer's memo; absent on older notes. */
  cost?: bigint;
}

interface LeafView {
  index: string;
  commitment: string;
  note: { kind: number; asset: string; sub: number; amount: string; owner_blind: string } | null;
  memo: string;
}

interface Ledger {
  accountId: string;
  notes: Note[];
  scanned: number;
  tree: MerkleTree;
}

const storageKey = (accountId: string) => `veiled:near:notes:v1:${accountId}`;
const ledgers = new Map<string, Ledger>();
const listeners = new Set<() => void>();

export function onNotesChanged(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
const emit = () => listeners.forEach((cb) => cb());

function serialize(l: Ledger) {
  return JSON.stringify({
    scanned: l.scanned,
    notes: l.notes.map((n) => ({
      ...n,
      asset: n.asset.toString(),
      amount: n.amount.toString(),
      blinding: n.blinding.toString(),
      commitment: n.commitment.toString(),
      nullifier: n.nullifier.toString(),
      cost: n.cost?.toString(),
    })),
  });
}

function load(accountId: string): Ledger {
  const hit = ledgers.get(accountId);
  if (hit) return hit;
  const ledger: Ledger = { accountId, notes: [], scanned: 0, tree: new MerkleTree() };
  try {
    const raw = localStorage.getItem(storageKey(accountId));
    if (raw) {
      const d = JSON.parse(raw);
      ledger.scanned = d.scanned ?? 0;
      ledger.notes = (d.notes ?? []).map((n: Record<string, string | number>) => ({
        ...n,
        asset: BigInt(n.asset),
        amount: BigInt(n.amount),
        blinding: BigInt(n.blinding),
        commitment: BigInt(n.commitment),
        nullifier: BigInt(n.nullifier),
        cost: n.cost === undefined ? undefined : BigInt(n.cost),
      }));
    }
  } catch {
    /* start fresh */
  }
  ledgers.set(accountId, ledger);
  return ledger;
}

function save(l: Ledger) {
  try {
    localStorage.setItem(storageKey(l.accountId), serialize(l));
  } catch {
    /* quota or privacy mode */
  }
  emit();
}

export function notesOf(accountId: string): Note[] {
  return load(accountId).notes;
}

export function treeOf(accountId: string): MerkleTree {
  return load(accountId).tree;
}

/** Adds or replaces a note (by leaf index). */
export function upsertNote(accountId: string, note: Note) {
  const l = load(accountId);
  const i = l.notes.findIndex((n) => n.index === note.index);
  if (i >= 0) l.notes[i] = { ...note, status: l.notes[i].status === 'spent' ? 'spent' : note.status };
  else l.notes.push(note);
  save(l);
}

export function setStatus(accountId: string, notes: Note[], status: NoteStatus) {
  const l = load(accountId);
  for (const n of notes) {
    const own = l.notes.find((x) => x.index === n.index);
    if (own) own.status = status;
  }
  save(l);
}

async function ownLeaf(keys: NoteKeys, leaf: LeafView): Promise<Note | null> {
  if (!leaf.memo) return null;
  const payload = await openMemo(keys.memoKey, leaf.memo);
  if (!payload || payload.b === undefined) return null;
  const blinding = BigInt(payload.b);
  const commitment = BigInt(leaf.commitment);
  let kind: number, asset: bigint, sub: number, amount: bigint;
  if (leaf.note) {
    if (ownerBlindOf(keys.sk, blinding).toString() !== leaf.note.owner_blind) return null;
    ({ kind, sub } = leaf.note);
    asset = BigInt(leaf.note.asset);
    amount = BigInt(leaf.note.amount);
  } else {
    kind = Number(payload.k);
    asset = BigInt(payload.a);
    sub = Number(payload.s);
    amount = BigInt(payload.m);
    if (commitmentOf(kind, asset, sub, amount, ownerBlindOf(keys.sk, blinding)) !== commitment) return null;
  }
  if (amount === 0n) return null;
  return {
    kind, asset, sub, amount, blinding, commitment,
    index: Number(leaf.index),
    nullifier: nullifierOf(keys.sk, commitment),
    status: 'unspent',
    createdAt: Date.now(),
    ...(payload.c !== undefined ? { cost: BigInt(payload.c) } : {}),
  };
}

let syncing: Promise<Note[]> | null = null;

/** Brings the leaf list and the user's notes up to date with the contract. */
export function syncNotes(keys: NoteKeys): Promise<Note[]> {
  if (syncing) return syncing;
  syncing = (async () => {
    const l = load(keys.accountId);
    const info = await view<{ next_index: string }>('get_tree_info');
    const next = Number(info.next_index);
    while (l.tree.leaves.length < next) {
      const page = await view<LeafView[]>('get_leaves', { from: String(l.tree.leaves.length), limit: 500 });
      if (!page.length) break;
      l.tree.push(...page.map((x) => BigInt(x.commitment)));
      for (const leaf of page) {
        if (Number(leaf.index) < l.scanned) continue;
        const note = await ownLeaf(keys, leaf);
        if (note && !l.notes.some((n) => n.index === note.index)) l.notes.push(note);
      }
    }
    l.scanned = Math.max(l.scanned, l.tree.leaves.length);
    // Spent checks for everything not known to be spent (pending ones settle here after a reload).
    await Promise.all(
      l.notes
        .filter((n) => n.status !== 'spent')
        .map(async (n) => {
          const spent = await view<boolean>('is_spent', { nullifier: n.nullifier.toString() });
          if (spent) n.status = 'spent';
          else if (n.status === 'pending' && Date.now() - n.createdAt > 120_000) n.status = 'unspent';
        }),
    );
    save(l);
    return l.notes;
  })().finally(() => {
    syncing = null;
  });
  return syncing;
}

export const unspent = (accountId: string) => notesOf(accountId).filter((n) => n.status === 'unspent');

/** Sum of unspent notes of one (kind, asset, sub). */
export function balanceOf(accountId: string, kind: number, asset: bigint | number, sub = 0): bigint {
  return unspent(accountId)
    .filter((n) => n.kind === kind && n.asset === BigInt(asset) && n.sub === sub)
    .reduce((s, n) => s + n.amount, 0n);
}

export function forgetNotes(accountId: string) {
  ledgers.delete(accountId);
  try {
    localStorage.removeItem(storageKey(accountId));
  } catch {
    /* ignore */
  }
  emit();
}
