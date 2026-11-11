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
  constructor(message: string, readonly code: string, readonly txHash?: string) {
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
  ERR_MARKET_CREDITS: 'The market does not hold enough collateral for this payout.',
  ERR_AMOUNT: 'Nothing to claim for this position.',
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

export async function relayerHealth(): Promise<{ ok: boolean; relayer?: string; balanceNear?: number }> {
  try {
    const r = await fetch(`${RELAYER_URL}/health`);
    return await r.json();
  } catch {
    return { ok: false };
  }
}
