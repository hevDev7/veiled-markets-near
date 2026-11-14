// Answers the Aleo explorer REST API from the Veiled contract on NEAR.
//
// The Aleo-era readers across the UI (aleo-client, turbo-client, wallet, governance, dashboard widgets) fetch
// `…/latest/height` and `…/program/<program>/mapping/<name>/<key>` and parse Leo literals out of the answer.
// installAleoRestShim() routes those GETs to NEAR views and renders the result in the same Leo text, so the readers
// keep working unchanged. Program ids keep their Aleo meaning: one market program per token, the turbo program,
// the two stablecoin programs and credits.aleo. Programs with no NEAR counterpart (governance, parlay) read as
// empty mappings. Nothing is ever sent to the Aleo API.
import { config } from '../config';
import { TOKEN, YOCTO_PER_MICRO, tokenAccount } from './config';
import { getGovernanceValues, getNearHeight, getNearMarket, getNearTurbo, type NearMarket, type NearTurbo } from './chain';
import { balanceProgramToken, isTurboProgram, marketProgramToken } from './programs';
import { cachedView, ftBalance, nearBalanceYocto } from './rpc';

// ------------------------------------------------------------------ Leo literals

const u8 = (v: number | string) => `${v}u8`;
const u64 = (v: number | string | bigint) => `${v}u64`;
const u128 = (v: number | string | bigint) => `${v}u128`;
const fieldOf = (id: string) => (/^\d+$/.test(id) ? `${id}field` : id);
const struct = (entries: Array<[string, string]>) => `{\n${entries.map(([k, v]) => `  ${k}: ${v}`).join(',\n')}\n}`;

/** "12field" → 12n; null for keys that are not plain ids (Aleo hashes, addresses). */
function idOf(key: string): string | null {
  const s = key.replace(/field$/, '');
  if (!/^\d{1,19}$/.test(s)) return null;
  return BigInt(s) <= 18446744073709551615n ? BigInt(s).toString() : null;
}

function marketStruct(m: NearMarket): string {
  return struct([
    ['id', fieldOf(m.id)],
    ['creator', m.creator],
    ['resolver', m.resolver],
    ['question_hash', fieldOf(m.question_hash)],
    ['category', u8(m.category)],
    ['num_outcomes', u8(m.num_outcomes)],
    ['deadline', u64(m.deadline)],
    ['resolution_deadline', u64(m.resolution_deadline)],
    ['status', u8(m.status)],
    ['created_at', u64(m.created_at)],
    ['token_type', u8(m.token_type)],
    // Not an Aleo field: the owner approved this market as a parlay leg (set_parlay_leg).
    ['parlay_leg', String(m.parlay_leg === true)],
  ]);
}

function poolStruct(m: NearMarket): string {
  const r = (i: number) => u128(m.reserves[i] ?? '0');
  return struct([
    ['market_id', fieldOf(m.id)],
    ['reserve_1', r(0)],
    ['reserve_2', r(1)],
    ['reserve_3', r(2)],
    ['reserve_4', r(3)],
    ['total_liquidity', u128(m.total_liquidity)],
    ['total_lp_shares', u128(m.total_lp_shares)],
    ['total_volume', u128(m.total_volume)],
    // Not an Aleo field: the NEAR contract counts every buy and sell of a market.
    ['total_trades', u64(m.trades)],
  ]);
}

function tallyStruct(m: NearMarket): string | null {
  const t = m.tally;
  if (!t) return null;
  const b = (i: number) => u128(t.outcome_bonds[i] ?? '0');
  return struct([
    ['market_id', fieldOf(m.id)],
    ['outcome_1_bonds', b(0)],
    ['outcome_2_bonds', b(1)],
    ['outcome_3_bonds', b(2)],
    ['outcome_4_bonds', b(3)],
    ['total_voters', u8(t.total_voters)],
    ['total_bonded', u128(t.total_bonded)],
    ['voting_deadline', u64(t.voting_deadline)],
    ['dispute_deadline', u64(t.dispute_deadline)],
    ['finalized', String(t.finalized)],
    ['winning_outcome', u8(t.winning_outcome)],
  ]);
}

function disputeStateStruct(m: NearMarket): string | null {
  const d = m.dispute;
  if (!d) return null;
  return struct([
    ['market_id', fieldOf(m.id)],
    ['disputer', d.disputer],
    ['original_outcome', u8(d.original_outcome)],
    ['proposed_outcome', u8(d.proposed_outcome)],
    ['dispute_bond', u128(d.dispute_bond)],
    ['disputed_at', u64(d.disputed_at)],
    ['escalated_tier', u8(d.escalated_tier)],
    ['final_outcome', u8(d.final_outcome)],
    ['resolved_by', d.resolved_by || m.resolver],
  ]);
}

/** The pre-v36 `market_disputes` shape some readers still ask for. */
function legacyDisputeStruct(m: NearMarket): string | null {
  const d = m.dispute;
  if (!d) return null;
  return struct([
    ['market_id', fieldOf(m.id)],
    ['disputer', d.disputer],
    ['proposed_outcome', u8(d.proposed_outcome)],
    ['bond_amount', u128(d.dispute_bond)],
    ['disputed_at', u64(d.disputed_at)],
  ]);
}

function turboStruct(t: NearTurbo): string {
  return struct([
    ['id', fieldOf(t.id)],
    ['creator', t.creator],
    ['symbol_id', u8(t.symbol_id)],
    ['baseline_price', u128(t.baseline_price)],
    ['baseline_block', u64(t.baseline_block)],
    ['deadline', u64(t.deadline)],
    ['resolution_deadline', u64(t.resolution_deadline)],
    ['closing_price', u128(t.closing_price)],
    ['winning_outcome', u8(t.winning_outcome)],
    ['status', u8(t.status)],
    ['created_at', u64(t.created_at)],
  ]);
}

function turboPoolStruct(t: NearTurbo): string {
  return struct([
    ['market_id', fieldOf(t.id)],
    ['total_up_amount', u128(t.total_up_amount)],
    ['total_down_amount', u128(t.total_down_amount)],
    ['total_up_claim_units', u128(t.total_up_claim_units)],
    ['total_down_claim_units', u128(t.total_down_claim_units)],
    ['total_volume', u128(t.total_volume)],
  ]);
}

// ------------------------------------------------------------------ mappings

/** A market of this program's token, or null (Aleo kept each token's markets in its own program). */
async function marketOf(token: number, key: string): Promise<NearMarket | null> {
  const id = idOf(key);
  if (id === null) return null;
  const m = await getNearMarket(id);
  return m && m.token_type === token ? m : null;
}

async function governanceValue(key: string): Promise<string | null> {
  const g = await getGovernanceValues();
  switch (key) {
    case '1field': return u128(g.protocol_fee_bps);
    case '2field': return u128(g.creator_fee_bps);
    case '3field': return u128(g.lp_fee_bps);
    case '4field': return u128(g.min_trade_amount);
    case '5field': return u128(g.min_liquidity);
    case '6field': return u128(g.paused ? 1 : 0);
    default: return null;
  }
}

async function tokenSlot(method: 'get_treasury' | 'get_program_credits', token: number, key: string): Promise<string | null> {
  if (key !== '0u8') return null;
  const v = await cachedView<string[]>(method, {}, 10_000);
  return u128(v[token] ?? '0');
}

async function marketMapping(token: number, name: string, key: string): Promise<string | null> {
  switch (name) {
    case 'governance_values': return governanceValue(key);
    case 'protocol_treasury': return tokenSlot('get_treasury', token, key);
    case 'program_credits': return tokenSlot('get_program_credits', token, key);
  }
  const m = await marketOf(token, key);
  if (!m) return null;
  switch (name) {
    case 'markets': return marketStruct(m);
    case 'amm_pools': return poolStruct(m);
    case 'market_fees':
      return struct([['market_id', fieldOf(m.id)], ['protocol_fees', u128(m.protocol_fees)], ['creator_fees', u128(m.creator_fees)]]);
    case 'market_credits': return u128(m.market_credits);
    case 'outstanding_shares': return u128(m.outstanding_shares);
    case 'trader_collateral': return u128(m.trader_collateral);
    case 'creator_fees_claimed': return String(m.creator_fees_claimed);
    case 'vote_tallies': return tallyStruct(m);
    case 'market_dispute_state': return disputeStateStruct(m);
    case 'market_disputes': return legacyDisputeStruct(m);
    case 'dispute_bonds': return m.dispute ? u128(m.dispute.dispute_bond) : null;
    default: return null;
  }
}

async function turboMapping(name: string, key: string): Promise<string | null> {
  if (name === 'total_exposure' || name === 'vault_balance') {
    return key === '0u8' ? u128(await cachedView<string>('get_turbo_exposure', {}, 5000)) : null;
  }
  const id = idOf(key);
  if (id === null) return null;
  const t = await getNearTurbo(id);
  if (!t) return null;
  switch (name) {
    case 'turbo_markets': return turboStruct(t);
    case 'turbo_pools': return turboPoolStruct(t);
    case 'market_payouts': return t.status === 2 ? u128(t.payout_pool) : null;
    case 'protocol_treasury': return u128(t.fees);
    default: return null;
  }
}

/** NEAR account ids only: Aleo addresses and hashes have no NEAR balance. */
const isAccountId = (s: string) => /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/.test(s) && s.length >= 2 && s.length <= 64;

/** The Leo literal a mapping holds on NEAR, or null when the key is absent. */
export async function aleoMappingValue(program: string, name: string, key: string): Promise<string | null> {
  const balanceToken = balanceProgramToken(program);
  if (balanceToken === TOKEN.NEAR) {
    if (name !== 'account' || !isAccountId(key)) return null;
    return u64((await nearBalanceYocto(key)) / YOCTO_PER_MICRO);
  }
  if (balanceToken !== null) {
    const ft = tokenAccount(balanceToken);
    return ft && name === 'balances' && isAccountId(key) ? u128(await ftBalance(ft, key)) : null;
  }
  if (isTurboProgram(program)) return turboMapping(name, key);
  const token = marketProgramToken(program);
  if (token !== null) return marketMapping(token, name, key);
  return null; // governance, parlay and anything else not deployed on NEAR
}

// ------------------------------------------------------------------ fetch shim

const ALEO_HOSTS = new Set([
  'api.explorer.provable.com',
  'api.provable.com',
  'api.explorer.aleo.org',
  'explorer.provable.com',
  'testnet.explorer.provable.com',
]);

/** The API path of an Aleo REST URL (without /v1/testnet), or null for every other request. */
function aleoPath(url: URL): string | null {
  const configured = (() => {
    try {
      return new URL(config.rpcUrl).host;
    } catch {
      return '';
    }
  })();
  if (!ALEO_HOSTS.has(url.host) && url.host !== configured) return null;
  const path = url.pathname.replace(/^\/v\d+/, '').replace(/^\/(testnet|mainnet|canary)(?=\/)/, '');
  if (url.host === configured && !/^\/(program|latest|transaction|find|block|scanner)\//.test(path)) return null;
  return path;
}

const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });

async function answer(path: string): Promise<Response> {
  try {
    if (/^\/latest\/height\/?$/.test(path)) return json(Number(await getNearHeight()));
    const m = path.match(/^\/program\/([^/]+)\/mapping\/([^/]+)\/([^/?#]+)\/?$/);
    if (m) {
      const [program, name, key] = m.slice(1).map(decodeURIComponent);
      return json(await aleoMappingValue(program, name, key));
    }
    // Transactions, blocks and the record scanner have no Aleo-shaped NEAR counterpart: "not found".
    return json(null, 404);
  } catch (e) {
    return json(String((e as Error)?.message ?? e), 503);
  }
}

/** Routes Aleo explorer GETs to NEAR. Idempotent. */
export function installAleoRestShim(): void {
  if (typeof window === 'undefined') return;
  const w = window as unknown as { __veiledAleoRest?: boolean };
  if (w.__veiledAleoRest) return;
  w.__veiledAleoRest = true;
  const original = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (method === 'GET') {
      const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      let url: URL | null = null;
      try {
        url = new URL(href, window.location.href);
      } catch {
        url = null;
      }
      const path = url && aleoPath(url);
      if (path) return answer(path);
    }
    return original(input, init);
  };
}
