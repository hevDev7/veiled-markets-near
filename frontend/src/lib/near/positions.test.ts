// The portfolio listed only the bets this browser recorded in localStorage, so a position bought in another browser
// (or before the storage was cleared) was missing although its share note is on chain and the account can open it.
import { describe, expect, it } from 'vitest';
import { KIND, TOKEN } from './config';
import type { Note } from './notes/store';
import type { Bet } from '../store';
import { chainPositions, tokenKey } from './positions';

let index = 0;
const note = (o: Partial<Note>): Note => ({
  kind: KIND.SHARE, asset: 933n, sub: 1, amount: 0n, blinding: 1n, index: index++, commitment: BigInt(index),
  nullifier: BigInt(index), status: 'unspent', createdAt: 1_000, ...o,
});
const NEAR = () => 'NEAR' as const;

describe('chainPositions', () => {
  it('lists the open share notes of a market and outcome as one position', () => {
    const bets = chainPositions(
      [note({ amount: 195_277n, cost: 100_000n, createdAt: 2_000 }), note({ amount: 50_000n, cost: 30_000n, createdAt: 1_500 })],
      [],
      NEAR,
    );
    expect(bets).toHaveLength(1);
    expect(bets[0]).toMatchObject({
      marketId: '933field', outcome: 'yes', sharesReceived: 245_277n, amount: 130_000n, placedAt: 1_500,
      status: 'active', type: 'buy', tokenType: 'NEAR', recovered: true,
    });
    expect(bets[0].costUnknown).toBeFalsy();
  });

  it('marks the cost unknown when a note does not carry it', () => {
    const [bet] = chainPositions([note({ amount: 10n, cost: 5n }), note({ amount: 20n })], [], NEAR);
    expect(bet).toMatchObject({ sharesReceived: 30n, amount: 0n, costUnknown: true });
  });

  it('skips a market and outcome this browser already has a bet record for', () => {
    const local = { id: 'tx1', marketId: '933field', outcome: 'yes', amount: 100_000n, placedAt: 1, status: 'active' } as Bet;
    const bets = chainPositions([note({ amount: 10n, cost: 5n }), note({ sub: 2, amount: 7n, cost: 3n })], [local], NEAR);
    expect(bets.map((b) => b.outcome)).toEqual(['no']);
  });

  it('ignores spent notes, other kinds, and records of sold or claimed bets', () => {
    const sold = { id: 's', marketId: '933field', outcome: 'yes', amount: 1n, placedAt: 1, status: 'active', type: 'sell' } as Bet;
    const claimed = { id: 'c', marketId: '933field', outcome: 'yes', amount: 1n, placedAt: 1, status: 'won', claimed: true } as Bet;
    const bets = chainPositions(
      [note({ amount: 10n, cost: 5n }), note({ amount: 99n, status: 'spent' }), note({ kind: KIND.BALANCE, asset: 1n, sub: 0, amount: 5n })],
      [sold, claimed],
      NEAR,
    );
    expect(bets).toHaveLength(1);
    expect(bets[0].sharesReceived).toBe(10n);
  });

  it('keeps the result a status sync gave a recovered position while its shares are unchanged', () => {
    const [first] = chainPositions([note({ amount: 10n, cost: 5n })], [], NEAR);
    const synced = { ...first, status: 'won' as const, payoutAmount: 10n, winningOutcome: 'yes' };
    const [again] = chainPositions([note({ amount: 10n, cost: 5n })], [synced], NEAR);
    expect(again).toMatchObject({ id: first.id, status: 'won', payoutAmount: 10n, winningOutcome: 'yes' });
  });

  it('names the outcome the way the bet records do, and takes the token from the market', () => {
    const bets = chainPositions([note({ asset: 7n, sub: 3, amount: 1n, cost: 1n })], [], () => 'USDCX');
    expect(bets[0]).toMatchObject({ marketId: '7field', outcome: 'outcome_3', tokenType: 'USDCX' });
  });

  it('maps a market token slot to the token key the bet records use', () => {
    expect([tokenKey(TOKEN.NEAR), tokenKey(TOKEN.USDCX), tokenKey(TOKEN.USAD), tokenKey(9)]).toEqual(['NEAR', 'USDCX', 'USAD', undefined]);
  });
});
