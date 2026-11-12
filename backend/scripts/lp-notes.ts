// The LP notes of markets opened by the scripts (seed-markets.ts, quick-market.ts). Those notes carry no memo, so
// their secret key and blinding exist only in backend/.seed-lp-notes.json: without that file the liquidity cannot be
// withdrawn. The secrets are therefore written BEFORE the transaction that mints the note is sent, as a pending
// entry found again by its question hash, and completed with the market id afterwards.
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';

export interface LpNote {
  marketId?: string;
  /** Set while the creating transaction has not been confirmed. */
  pending?: boolean;
  questionHash?: string;
  question: string;
  token?: number;
  sk: string;
  blinding: string;
  liquidity: string;
  [extra: string]: unknown;
}

export function loadLpNotes(file: string): LpNote[] {
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
}

/** Replaces the file in one step (write to a temp file, then rename), readable by the owner only. */
export function saveLpNotes(file: string, notes: LpNote[]): void {
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(notes, null, 2) + '\n', { mode: 0o600 });
  renameSync(tmp, file);
}

/** Call before sending the transaction that creates the market. */
export function recordPendingLpNote(file: string, note: LpNote & { questionHash: string }): void {
  saveLpNotes(file, [...loadLpNotes(file), { ...note, pending: true }]);
}

/** Call once the market exists: the pending note for `questionHash` gets its market id. */
export function confirmLpNote(file: string, questionHash: string, marketId: string): void {
  const notes = loadLpNotes(file);
  const note = notes.find((n) => n.pending && n.questionHash === questionHash);
  if (!note) throw new Error(`no pending LP note for question hash ${questionHash}`);
  note.marketId = marketId;
  delete note.pending;
  saveLpNotes(file, notes);
}
