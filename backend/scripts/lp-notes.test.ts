// Run with: npx tsx --test scripts/lp-notes.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { confirmLpNote, loadLpNotes, recordPendingLpNote } from './lp-notes';

const fresh = () => path.join(mkdtempSync(path.join(tmpdir(), 'lp-notes-')), 'notes.json');
const note = (questionHash: string) => ({ questionHash, question: `Q ${questionHash}`, token: 1, sk: '11', blinding: '22', liquidity: '50000' });

test('the secrets are on disk before the market exists', () => {
  const file = fresh();
  recordPendingLpNote(file, note('h1'));
  // What a crash between the transaction and the next write would leave behind.
  const [saved] = JSON.parse(readFileSync(file, 'utf8'));
  assert.deepEqual(
    { sk: saved.sk, blinding: saved.blinding, questionHash: saved.questionHash, pending: saved.pending, marketId: saved.marketId },
    { sk: '11', blinding: '22', questionHash: 'h1', pending: true, marketId: undefined },
  );
  assert.equal(statSync(file).mode & 0o777, 0o600);
});

test('confirming fills in the market id of that note only', () => {
  const file = fresh();
  recordPendingLpNote(file, note('h1'));
  recordPendingLpNote(file, note('h2'));
  confirmLpNote(file, 'h2', '77');
  const notes = loadLpNotes(file);
  assert.deepEqual(notes.map((n) => [n.questionHash, n.marketId, n.pending]), [['h1', undefined, true], ['h2', '77', undefined]]);
});

test('notes saved before this file had pending entries load unchanged', () => {
  const file = fresh();
  recordPendingLpNote(file, note('h1'));
  confirmLpNote(file, 'h1', '5');
  recordPendingLpNote(file, note('h3'));
  assert.equal(loadLpNotes(file).length, 2);
  assert.equal(loadLpNotes(path.join(path.dirname(file), 'missing.json')).length, 0);
});
