// Client for backend/src/near-relayer.ts. The relayer signs and pays for `transact`; the proof binds the action.
import { RELAYER_URL } from './config';

export interface TransactResult {
  change_index: string;
  new_index: string;
  new_commitment: string;
  new_kind: number;
  new_asset: string;
  new_sub: number;
  new_amount: string;
}

export class RelayError extends Error {
  /** `status`: the relayer's HTTP status; none when it could not be reached. */
  constructor(message: string, readonly code: string, readonly txHash?: string, readonly status?: number) {
    super(message);
    this.name = 'RelayError';
  }
}

/** Plain sentences for the contract's error codes users can actually hit. */
export const ERROR_TEXT: Record<string, string> = {
  ERR_SLIPPAGE: 'The price moved past your slippage limit. Nothing was spent; try again.',
  ERR_DEADLINE: 'Trading on this market has closed.',
  ERR_STATUS: 'The market is not in the right state for this action.',
  ERR_MIN_TRADE: 'The amount is below the minimum trade.',
  ERR_MIN_LIQUIDITY: 'The amount is below the minimum liquidity.',
  ERR_NOT_WINNER: 'These shares are not on the winning outcome.',
  ERR_PRIORITY_WINDOW: 'Liquidity can be withdrawn after the winner-claim window ends.',
  ERR_UNKNOWN_ROOT: 'Your view of the private pool is out of date. Refresh and try again.',
  ERR_NULLIFIER_SPENT: 'One of these private notes was already spent. Refresh your balance.',
  ERR_INVALID_PROOF: 'The proof did not verify. Refresh and try again.',
  ERR_NOTE_KIND: 'That private balance cannot be used for this market.',
  ERR_PAUSED: 'The protocol is paused.',
  ERR_POOL_UNDERFLOW: 'The pool cannot pay that much; try a smaller amount.',
  ERR_POOL_DEPLETED: 'This trade would empty one side of the pool; try a smaller amount.',
  ERR_BETTING_CLOSED: 'Betting on this round has closed. The last fifth of a round takes no new bets.',
  ERR_LEG_NOT_ELIGIBLE: 'One of these markets is not open for parlays.',
  ERR_LEG_LIQUIDITY: 'This parlay would pay more than its smallest market can back. Lower the stake.',
  ERR_RESOLUTION_DEADLINE: 'The resolution deadline is too close to the trading deadline to fit the vote and dispute windows.',
  ERR_MARKET_CREDITS: 'The market does not hold enough collateral for this payout.',
  ERR_AMOUNT: 'Nothing to claim for this position.',
  ERR_LEG_COUNT: 'A parlay needs 2 to 4 legs.',
  ERR_DUPLICATE_LEG: 'Each parlay leg must be on a different market.',
  ERR_LEG_CLOSED: 'One of the legs is on a market that is no longer open for trading.',
  ERR_LEG_ODDS: 'One leg is outside the 1×–100× odds range.',
  ERR_COMBINED_ODDS: 'The combined odds exceed the 1000× limit.',
  ERR_MIN_STAKE: 'The stake is below the parlay minimum.',
  ERR_MAX_PAYOUT: 'The potential payout exceeds the maximum for one parlay.',
  ERR_POOL_CAPACITY: 'The parlay pool cannot back this payout right now. Try a smaller stake.',
  ERR_PARLAY_NOT_READY: 'This parlay is not settled yet: some legs are still open.',
  ERR_PARLAY_LOST: 'This parlay lost; there is nothing to claim.',
  ERR_PARLAY_SETTLED: 'This parlay is already settled.',
  ERR_CLAIMED: 'This parlay was already claimed.',
  ERR_NO_PARLAY: 'This parlay does not exist.',
  ERR_MIN_DEPOSIT: 'The amount is below the minimum deposit. Nothing was taken.',
};

export const explain = (code: string) => ERROR_TEXT[code] ?? code;

export async function relay(body: { proof: unknown; public: unknown; ext_data: string }): Promise<{ txHash: string; result: TransactResult }> {
  let res: Response;
  try {
    res = await fetch(`${RELAYER_URL}/relay`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new RelayError(`The relayer at ${RELAYER_URL} is not reachable.`, 'RELAYER_DOWN');
  }
  const out = await res.json().catch(() => ({ ok: false, error: `relayer answered ${res.status}` }));
  if (!out.ok) {
    const code = String(out.error ?? 'RELAY_FAILED');
    throw new RelayError(explain(code), code, out.txHash);
  }
  return { txHash: out.txHash, result: out.result };
}

/**
 * Sends a stablecoin deposit the user signed as a NEP-366 delegate action (near-wallet.ts `signDelegate`). The relayer
 * checks it, submits it and pays its gas and its 1 yocto.
 */
export async function relayMeta(signedDelegate: string): Promise<{ txHash: string }> {
  let res: Response;
  try {
    res = await fetch(`${RELAYER_URL}/meta`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ signed_delegate: signedDelegate }),
    });
  } catch {
    throw new RelayError(`The relayer at ${RELAYER_URL} is not reachable.`, 'RELAYER_DOWN');
  }
  const out = await res.json().catch(() => ({ ok: false, error: `relayer answered ${res.status}` }));
  if (!out.ok) {
    const code = String(out.error ?? 'RELAY_FAILED');
    throw new RelayError(explain(code), code, out.txHash, res.status);
  }
  return { txHash: out.txHash };
}

/** `meta`: the relayer submits gasless stablecoin deposits (`relayMeta`). */
export async function relayerHealth(): Promise<{ ok: boolean; relayer?: string; balanceNear?: number; meta?: boolean }> {
  try {
    const r = await fetch(`${RELAYER_URL}/health`);
    return await r.json();
  } catch {
    return { ok: false };
  }
}
