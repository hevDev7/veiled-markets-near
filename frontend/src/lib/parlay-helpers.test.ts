// Parlay ticket records carry the on-chain token slot; slot 3 is Circle USDC (key 'USDCX'), slot 2 the retired mock.
import { describe, expect, it } from 'vitest';
import { parseParlayTicketRecord } from './parlay-helpers';

const ticket = (slot: number) =>
  `{ owner: alice.testnet, parlay_id: 7field, stake: 1000000u128, ` +
  `potential_payout: 3000000u128, token_type: ${slot}u8, ticket_nonce: 9field }`;

describe('parseParlayTicketRecord', () => {
  it('reads each token slot as its token', () => {
    expect(parseParlayTicketRecord(ticket(1))?.tokenType).toBe('NEAR');
    expect(parseParlayTicketRecord(ticket(3))?.tokenType).toBe('USDCX');
    expect(parseParlayTicketRecord(ticket(2))?.tokenType).toBe('USAD');
  });
});
