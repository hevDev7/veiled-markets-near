// Positions held on chain. A share note is the position itself (market, outcome, shares) and the account's key finds
// it from the chain alone. The browser that placed a bet also keeps a record of it, with its cost; any other browser,
// or this one after its storage is cleared, has only the notes. The open share notes of a (market, outcome) that no
// bet record here accounts for become one recovered position. They are rebuilt from the notes on every load, never
// stored.
import { KIND, TOKEN } from './config';
import { aleoId } from './ids';
import type { Note } from './notes/store';
import type { Bet } from '../store';

export type PositionToken = NonNullable<Bet['tokenType']>;

const TOKEN_KEYS: Record<number, PositionToken> = { [TOKEN.NEAR]: 'NEAR', [TOKEN.USDCX]: 'USDCX', [TOKEN.USAD]: 'USAD' };
/** The bet records' token key for a market's on-chain token slot. */
export const tokenKey = (tokenType: number): PositionToken | undefined => TOKEN_KEYS[tokenType];

/** Same keys as outcomeToString in ../store: 1 → 'yes', 2 → 'no', n → 'outcome_n'. */
const outcomeKey = (sub: number) => (sub === 1 ? 'yes' : sub === 2 ? 'no' : `outcome_${sub}`);

/**
 * The notes of one (market, outcome) that none of this browser's bet records there accounts for. Each buy record
 * (pending ones too; not sells, not claimed) takes one note: the one carrying its cost, or, for a record from before
 * costs were stored, the smallest cost-less note with at least the shares it recorded (the record keeps the minimum
 * the buy accepted, the note what it got). Where this browser has sold, cost-less notes may be a sell's change, which
 * the records already show, so they are not listed again.
 */
function unaccounted(group: Note[], records: Bet[], sold: boolean): Note[] {
  const left = [...group];
  const take = (i: number) => (i >= 0 ? left.splice(i, 1) : []);
  const legacy: Bet[] = [];
  for (const r of records) {
    if (!take(left.findIndex((n) => n.cost !== undefined && n.cost === r.amount)).length) legacy.push(r);
  }
  for (const r of legacy) {
    const fits = left
      .map((n, i) => ({ n, i }))
      .filter(({ n }) => n.cost === undefined && r.sharesReceived !== undefined && n.amount >= r.sharesReceived)
      .sort((a, b) => (a.n.amount < b.n.amount ? -1 : a.n.amount > b.n.amount ? 1 : 0));
    if (fits.length) take(fits[0].i);
  }
  return sold ? left.filter((n) => n.cost !== undefined) : left;
}

/**
 * Recovered positions for the unspent share notes that no bet record in `bets` accounts for (see `unaccounted`).
 * The cost is known when every such note carries one. A recovered position keeps the status a sync gave it while its
 * shares stay the same.
 */
export function chainPositions(notes: Note[], bets: Bet[], tokenOf: (asset: bigint) => PositionToken | undefined): Bet[] {
  const groups = new Map<string, Note[]>();
  for (const n of notes) {
    if (n.kind !== KIND.SHARE || n.status !== 'unspent' || n.amount === 0n) continue;
    const key = `${n.asset}:${n.sub}`;
    groups.set(key, [...(groups.get(key) ?? []), n]);
  }
  const local = bets.filter((b) => !b.recovered);
  const previous = new Map(bets.filter((b) => b.recovered).map((b) => [b.id, b]));

  const out: Bet[] = [];
  for (const all of groups.values()) {
    const { asset, sub } = all[0];
    const marketId = aleoId(asset);
    const outcome = outcomeKey(sub);
    const here = local.filter((b) => b.marketId === marketId && b.outcome === outcome);
    const group = unaccounted(
      all,
      here.filter((b) => b.type !== 'sell' && !b.claimed),
      here.some((b) => b.type === 'sell'),
    );
    if (!group.length) continue;
    const shares = group.reduce((s, n) => s + n.amount, 0n);
    const costKnown = group.every((n) => n.cost !== undefined);
    const id = `chain:${asset}:${sub}`;
    const bet: Bet = {
      id,
      marketId,
      outcome,
      amount: costKnown ? group.reduce((s, n) => s + (n.cost ?? 0n), 0n) : 0n,
      sharesReceived: shares,
      placedAt: Math.min(...group.map((n) => n.createdAt)),
      status: 'active',
      type: 'buy',
      tokenType: tokenOf(asset),
      recovered: true,
      ...(costKnown ? {} : { costUnknown: true }),
    };
    const prev = previous.get(id);
    if (prev && prev.sharesReceived === shares) {
      bet.status = prev.status;
      bet.payoutAmount = prev.payoutAmount;
      bet.winningOutcome = prev.winningOutcome;
    }
    out.push(bet);
  }
  return out.sort((a, b) => a.placedAt - b.placedAt);
}
