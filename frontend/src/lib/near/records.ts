// Private notes rendered as the Aleo record plaintexts the pages already parse (OutcomeShare, LPToken, TurboShare,
// credits/Token balance), and parsed back to the note they stand for. `_nonce` carries the note commitment.
import { KIND, TOKEN } from './config';
import { aleoId } from './ids';
import type { Note } from './notes/store';

const field = (v: bigint | number | string) => `${v}field.private`;

export function shareRecord(note: Note, owner: string, tokenType: number): string {
  return [
    '{',
    `  owner: ${owner}.private,`,
    `  market_id: ${aleoId(note.asset)}.private,`,
    `  outcome: ${note.sub}u8.private,`,
    `  quantity: ${note.amount}u128.private,`,
    `  share_nonce: ${field(note.commitment)},`,
    `  token_type: ${tokenType}u8.private,`,
    `  _nonce: ${note.commitment}group.public`,
    '}',
  ].join('\n');
}

export function lpRecord(note: Note, owner: string, tokenType: number): string {
  return [
    '{',
    `  owner: ${owner}.private,`,
    `  market_id: ${aleoId(note.asset)}.private,`,
    `  lp_shares: ${note.amount}u128.private,`,
    `  lp_nonce: ${field(note.commitment)},`,
    `  token_type: ${tokenType}u8.private,`,
    `  _nonce: ${note.commitment}group.public`,
    '}',
  ].join('\n');
}

/** Claim units are 2 × stake, as in the Aleo TurboShare. */
export function turboRecord(note: Note, owner: string): string {
  return [
    '{',
    `  owner: ${owner}.private,`,
    `  market_id: ${aleoId(note.asset)}.private,`,
    `  side: ${note.sub}u8.private,`,
    `  claim_units: ${note.amount * 2n}u128.private,`,
    `  refund_amount: ${note.amount}u128.private,`,
    `  share_nonce: ${field(note.commitment)},`,
    `  _nonce: ${note.commitment}group.public`,
    '}',
  ].join('\n');
}

/** The private balance of a token shown as one spendable record (the executor picks the actual notes). */
export function balanceRecord(token: number, amount: bigint, owner: string): string {
  const value = token === TOKEN.NEAR ? `  microcredits: ${amount}u64.private,` : `  amount: ${amount}u128.private,`;
  return ['{', `  owner: ${owner}.private,`, value, `  _nonce: 0group.public,`, `  _near_balance: ${token}u8.public`, '}'].join('\n');
}

export function noteRecord(note: Note, owner: string, tokenType: number): string | null {
  if (note.kind === KIND.SHARE) return shareRecord(note, owner, tokenType);
  if (note.kind === KIND.LP) return lpRecord(note, owner, tokenType);
  if (note.kind === KIND.TURBO) return turboRecord(note, owner);
  return null;
}

/** The note commitment a record stands for, or null for balance records and foreign text. */
export function commitmentOf(record: unknown): bigint | null {
  const text = typeof record === 'string' ? record : JSON.stringify(record ?? '');
  const m = text.match(/_nonce:\s*(\d+)group/);
  if (!m || m[1] === '0') return null;
  return BigInt(m[1]);
}

export function marketIdOf(record: unknown): string | null {
  const text = typeof record === 'string' ? record : JSON.stringify(record ?? '');
  const m = text.match(/market_id:\s*(\d+)field/);
  return m ? m[1] : null;
}
