// Explorer links for a NEAR transaction must use NearBlocks' /txns/<hash> page. Two links still built the Aleo
// explorer's /transaction/<id> path (2026-11-14): the create page's "View on Explorer" (aleo-client's
// getTransactionUrl) and the market page's "Verify On-Chain".
import { describe, expect, it } from 'vitest';
import { getTransactionUrl as aleoClientTxUrl } from './aleo-client';
import { config, getTransactionUrl } from './config';
import { txUrl } from './near/config';

const HASH = 'EZuSbZFMJViAwV7eUDBeYbwoDozY1cBb6teu3nMFC8dh';

describe('transaction explorer links', () => {
  it('every helper links a NEAR transaction to its NearBlocks /txns/ page', () => {
    for (const url of [aleoClientTxUrl(HASH), getTransactionUrl(HASH), txUrl(HASH)]) {
      expect(url).toBe(`${config.explorerUrl}/txns/${HASH}`);
      expect(url).not.toContain('/transaction/');
    }
  });
});
