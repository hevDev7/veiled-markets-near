// The connected account's private notes, rendered as the Aleo records the pages used to get from the wallet:
// OutcomeShare and LPToken records per market program, TurboShare records for the turbo program, and one spendable
// balance record per token. Notes are found and decrypted in this browser (see ./notes); nothing here is public.
import { KIND, TOKEN, YOCTO_PER_MICRO, tokenAccount } from './config';
import { getNearMarket } from './chain';
import { currentAccountId } from './near-wallet';
import { refreshNotes } from './private';
import { balanceProgramToken, isTurboProgram, marketProgramToken } from './programs';
import { balanceRecord, noteRecord, turboRecord } from './records';
import { ftBalance, nearBalanceYocto } from './rpc';
import type { Note } from './notes/store';

/** NEAR kept in the wallet for gas when its public balance tops the private one up. */
export const GAS_RESERVE_MICRO = 250_000n; // 0.25 NEAR

async function unspentNotes(): Promise<{ accountId: string; notes: Note[] } | null> {
  const accountId = await currentAccountId();
  if (!accountId) return null;
  const notes = (await refreshNotes(false)).filter((n) => n.status === 'unspent');
  return { accountId, notes };
}

/** Record plaintexts the wallet would hold for `program`. */
export async function recordsForProgram(program: string): Promise<string[]> {
  const balanceToken = balanceProgramToken(program);
  if (balanceToken !== null) {
    const r = await spendableRecord(balanceToken, 1n);
    return r ? [r] : [];
  }
  const mine = await unspentNotes();
  if (!mine) return [];
  const { accountId, notes } = mine;
  if (isTurboProgram(program)) {
    return notes.filter((n) => n.kind === KIND.TURBO).map((n) => turboRecord(n, accountId));
  }
  const token = marketProgramToken(program);
  if (token === null) return [];
  const out: string[] = [];
  for (const n of notes) {
    if (n.kind !== KIND.SHARE && n.kind !== KIND.LP) continue;
    const market = await getNearMarket(n.asset).catch(() => null);
    if (!market || market.token_type !== token) continue;
    const text = noteRecord(n, accountId, token);
    if (text) out.push(text);
  }
  return out;
}

/**
 * One balance record covering what the account can spend privately on `token`: its private notes plus what the
 * wallet can deposit (the executor shields the shortfall in the same flow). Null when that is less than `min`.
 */
export async function spendableRecord(token: number, min: bigint): Promise<string | null> {
  const mine = await unspentNotes();
  if (!mine) return null;
  const { accountId, notes } = mine;
  const privateMicro = notes
    .filter((n) => n.kind === KIND.BALANCE && n.asset === BigInt(token))
    .reduce((s, n) => s + n.amount, 0n);
  let walletMicro = 0n;
  try {
    if (token === TOKEN.NEAR) {
      const micro = (await nearBalanceYocto(accountId)) / YOCTO_PER_MICRO;
      walletMicro = micro > GAS_RESERVE_MICRO ? micro - GAS_RESERVE_MICRO : 0n;
    } else {
      const ft = tokenAccount(token);
      walletMicro = ft ? await ftBalance(ft, accountId) : 0n;
    }
  } catch {
    walletMicro = 0n;
  }
  const total = privateMicro + walletMicro;
  return total >= min && total > 0n ? balanceRecord(token, total, accountId) : null;
}

/** What requestRecords() answers: record objects in the shape the Aleo wallet adapters returned. */
export async function walletRecordObjects(program: string) {
  const texts = await recordsForProgram(program);
  return texts.map((plaintext) => ({ plaintext, programName: program, spent: false, recordName: recordName(plaintext) }));
}

const recordName = (text: string) =>
  text.includes('lp_shares:') ? 'LPToken'
  : text.includes('side:') ? 'TurboShare'
  : text.includes('outcome:') ? 'OutcomeShare'
  : text.includes('microcredits:') ? 'credits'
  : 'Token';
