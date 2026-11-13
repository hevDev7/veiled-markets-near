// Positions held on chain. A share note is the position itself (market, outcome, shares) and the account's key finds
// it from the chain alone. The browser that placed a bet also keeps a record of it, with its cost; any other browser,
// or this one after its storage is cleared, has only the notes. Every (market, outcome) with open share notes and no
// bet record here becomes one recovered position. They are rebuilt from the notes on every load, never stored.
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
 * Recovered positions for the unspent share notes that no bet record in `bets` covers. A record covers its market
 * and outcome unless it is a sell or already claimed. The cost is known when every note in the group carries one.
 * A recovered position keeps the status a sync gave it while its shares stay the same.
 */
export function chainPositions(notes: Note[], bets: Bet[], tokenOf: (asset: bigint) => PositionToken | undefined): Bet[] {
  const groups = new Map<string, Note[]>();
  for (const n of notes) {
    if (n.kind !== KIND.SHARE || n.status !== 'unspent' || n.amount === 0n) continue;
    const key = `${n.asset}:${n.sub}`;
    groups.set(key, [...(groups.get(key) ?? []), n]);
  }
  const covered = new Set(
    bets.filter((b) => !b.recovered && b.type !== 'sell' && !b.claimed).map((b) => `${b.marketId}:${b.outcome}`),
  );
  const previous = new Map(bets.filter((b) => b.recovered).map((b) => [b.id, b]));

  const out: Bet[] = [];
  for (const group of groups.values()) {
    const { asset, sub } = group[0];
    const marketId = aleoId(asset);
    const outcome = outcomeKey(sub);
    if (covered.has(`${marketId}:${outcome}`)) continue;
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
