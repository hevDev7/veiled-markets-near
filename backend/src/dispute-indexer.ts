// ============================================================================
// VEILED MARKETS — Dispute State Indexer (v6 post-audit hardening flow)
// ============================================================================
// Periodically scans the latest blocks for dispute_resolution and
// apply_governance_resolution transitions across the 3 market programs and
// upserts into Supabase `market_disputes` for fast frontend reads.
//
// v6 changes from initial v6 indexer:
// - Default program IDs bumped to v37/v7/v14 (post-audit redeploy 2026-04-08)
// - Legacy v36/v6/v13 programs still scanned (env override) for backward compat
// - apply_governance_resolution now has 3 inputs (market_id, winning_outcome,
//   escalated_tier) — tier is captured into the escalated_tier column so the
//   frontend can show "committee" vs "community" resolution paths.
//
// Run via:
//   pnpm --filter veiled-markets-backend dispute-indexer
// or one-shot:
//   tsx src/dispute-indexer.ts
// ============================================================================

import * as fs from 'fs';
import * as path from 'path';
import { config } from './config.js';

const CHECKPOINT_PATH = path.join(process.cwd(), 'public', 'dispute-indexer-checkpoint.json');
const POLL_INTERVAL_MS = Number(process.env.DISPUTE_POLL_INTERVAL_MS || 60_000);
const MAX_BLOCKS_PER_RUN = Number(process.env.DISPUTE_BLOCKS_PER_RUN || 200);
const REQUEST_RETRIES = 3;
const REQUEST_RETRY_DELAY_MS = 750;

// v6 post-audit: only the active v37/v7/v14 contracts are scanned. Legacy
// programs were removed during testnet cleanup — markets created on older
// versions are no longer indexed.
const MARKET_PROGRAMS: Array<{ id: string; tokenType: number }> = [
  { id: process.env.VITE_PROGRAM_ID || 'veiled_markets_v37.aleo', tokenType: 1 },
  { id: process.env.VITE_USDCX_MARKET_PROGRAM_ID || 'veiled_markets_usdcx_v7.aleo', tokenType: 2 },
  { id: process.env.VITE_USAD_PROGRAM_ID || 'veiled_markets_usad_v14.aleo', tokenType: 3 },
];

const TARGET_FUNCTIONS = new Set([
  'dispute_resolution',
  'apply_governance_resolution',
]);

interface BlockTransition {
  program?: string;
  function?: string;
  inputs?: Array<{ type?: string; value?: string }>;
  outputs?: Array<{ type?: string; value?: string }>;
}

interface BlockTransaction {
  transaction?: {
    id?: string;
    type?: string;
    execution?: { transitions?: BlockTransition[] };
  };
}

interface ExplorerBlock {
  header?: { metadata?: { height?: number; timestamp?: number } };
  transactions?: BlockTransaction[];
}

interface DisputeRow {
  market_id: string;
  program_id: string;
  token_type: number;
  disputer: string;
  original_outcome: number;
  proposed_outcome: number;
  dispute_bond: string;
  disputed_at_block: number;
  escalated_tier: number;
  final_outcome: number;
  resolved_by: string | null;
  resolved_at_block: number | null;
  status: string;
  dispute_tx_id: string | null;
  resolution_tx_id: string | null;
}

// ---- HTTP helpers ----------------------------------------------------------

async function fetchJson<T = unknown>(url: string): Promise<T | null> {
  for (let attempt = 0; attempt < REQUEST_RETRIES; attempt++) {
    try {
      const response = await fetch(url, { headers: { Accept: 'application/json' } });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return (await response.json()) as T;
    } catch (error) {
      if (attempt === REQUEST_RETRIES - 1) {
        console.warn(`[DisputeIndexer] fetch failed for ${url}:`, error);
        return null;
      }
      await new Promise(r => setTimeout(r, REQUEST_RETRY_DELAY_MS * (attempt + 1)));
    }
  }
  return null;
}

async function getLatestBlockHeight(): Promise<number> {
  const value = await fetchJson<number | string>(`${config.rpcUrl}/block/height/latest`);
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return parseInt(value, 10) || 0;
  return 0;
}

async function getBlockByHeight(height: number): Promise<ExplorerBlock | null> {
  return fetchJson<ExplorerBlock>(`${config.rpcUrl}/block/${height}`);
}

// ---- Checkpoint helpers ----------------------------------------------------

interface Checkpoint {
  lastIndexedBlock: number;
  updatedAt: string;
}

function loadCheckpoint(): Checkpoint {
  try {
    if (fs.existsSync(CHECKPOINT_PATH)) {
      const data = JSON.parse(fs.readFileSync(CHECKPOINT_PATH, 'utf-8'));
      if (typeof data.lastIndexedBlock === 'number') return data;
    }
  } catch (error) {
    console.warn('[DisputeIndexer] Failed to load checkpoint:', error);
  }
  const fallback = Number(process.env.DISPUTE_INDEXER_START_BLOCK || 0);
  return { lastIndexedBlock: fallback, updatedAt: new Date().toISOString() };
}

function saveCheckpoint(height: number): void {
  const dir = path.dirname(CHECKPOINT_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    CHECKPOINT_PATH,
    JSON.stringify({ lastIndexedBlock: height, updatedAt: new Date().toISOString() }, null, 2),
  );
}

// ---- Transition parsing ----------------------------------------------------

function stripTypeSuffix(value: string): string {
  return value.replace(/[._]?(field|u8|u64|u128|address|public|private|constant)$/g, '').trim();
}

function extractValue(raw?: string): string {
  return raw ? stripTypeSuffix(raw.trim()) : '';
}

interface ParsedDispute {
  programId: string;
  tokenType: number;
  marketId: string;
  proposedOutcome: number;
  disputeBond: string;
  escalatedTier: number;       // v6: parsed from apply_governance_resolution input #3
  txId: string;
  blockHeight: number;
  isResolution: boolean;       // true for apply_governance_resolution
}

function parseDisputeTransition(
  transition: BlockTransition,
  txId: string,
  blockHeight: number,
): ParsedDispute | null {
  const program = transition.program || '';
  const programInfo = MARKET_PROGRAMS.find(p => p.id === program);
  if (!programInfo) return null;
  if (!transition.function || !TARGET_FUNCTIONS.has(transition.function)) return null;

  const inputs = transition.inputs || [];
  const isResolution = transition.function === 'apply_governance_resolution';

  // dispute_resolution(market_id, proposed_outcome, dispute_nonce, credits_in, dispute_bond)
  // apply_governance_resolution(market_id, winning_outcome, escalated_tier)  // v37+
  const marketId = extractValue(inputs[0]?.value);
  if (!marketId) return null;

  const proposedOutcome = parseInt(extractValue(inputs[1]?.value) || '0', 10) || 0;
  const disputeBond = isResolution ? '0' : extractValue(inputs[4]?.value) || '0';
  // v6: capture the tier (committee=2 vs community=3) propagated by governance.
  // For dispute_resolution, tier is 0 (not yet escalated).
  const escalatedTier = isResolution
    ? parseInt(extractValue(inputs[2]?.value) || '0', 10) || 0
    : 0;

  return {
    programId: program,
    tokenType: programInfo.tokenType,
    marketId: `${marketId}field`,
    proposedOutcome,
    disputeBond,
    escalatedTier,
    txId,
    blockHeight,
    isResolution,
  };
}

// ---- Supabase upsert -------------------------------------------------------

async function upsertDispute(row: Partial<DisputeRow> & { market_id: string }): Promise<void> {
  const url = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return;

  try {
    const response = await fetch(`${url}/rest/v1/market_disputes?on_conflict=market_id`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
        // For RLS check — service role bypasses, anon needs admin header
        'x-aleo-address': 'aleo10tm5ektsr5v7kdc5phs8pha42vrkhe2rlxfl2v979wunhzx07vpqnqplv8',
      },
      body: JSON.stringify([row]),
    });
    if (!response.ok) {
      console.warn(
        `[DisputeIndexer] Supabase upsert failed (${response.status}):`,
        await response.text().catch(() => '<no body>'),
      );
    }
  } catch (error) {
    console.warn('[DisputeIndexer] Supabase upsert exception:', error);
  }
}

// ---- Main loop -------------------------------------------------------------

async function indexBlockRange(startHeight: number, endHeight: number): Promise<number> {
  console.log(`[DisputeIndexer] Scanning blocks ${startHeight} → ${endHeight}`);
  let lastSuccessfulHeight = startHeight - 1;
  let foundCount = 0;

  for (let height = startHeight; height <= endHeight; height++) {
    const block = await getBlockByHeight(height);
    if (!block) continue;

    const txs = block.transactions || [];
    for (const tx of txs) {
      const txId = tx.transaction?.id || '';
      const transitions = tx.transaction?.execution?.transitions || [];

      for (const transition of transitions) {
        const parsed = parseDisputeTransition(transition, txId, height);
        if (!parsed) continue;

        foundCount += 1;
        console.log(
          `   ${parsed.isResolution ? '✓ resolve' : '⚠ dispute'} ${parsed.marketId.slice(0, 16)}... ` +
          `outcome=${parsed.proposedOutcome} block=${height}`,
        );

        const baseRow: Partial<DisputeRow> = {
          market_id: parsed.marketId,
          program_id: parsed.programId,
          token_type: parsed.tokenType,
        };

        if (parsed.isResolution) {
          // apply_governance_resolution flips final_outcome + sets resolved_*
          // v6: also captures the actual tier (committee=2 vs community=3)
          // so the audit trail is correct.
          await upsertDispute({
            ...baseRow,
            market_id: parsed.marketId,
            final_outcome: parsed.proposedOutcome,
            escalated_tier: parsed.escalatedTier,
            status: 'resolved',
            resolved_at_block: parsed.blockHeight,
            resolution_tx_id: parsed.txId,
          });
        } else {
          // dispute_resolution adds new dispute entry
          await upsertDispute({
            ...baseRow,
            market_id: parsed.marketId,
            disputer: 'unknown',  // private input — explorer doesn't expose it
            original_outcome: 0,  // would need separate vote_tally read to fill
            proposed_outcome: parsed.proposedOutcome,
            dispute_bond: parsed.disputeBond,
            disputed_at_block: parsed.blockHeight,
            escalated_tier: 0,
            final_outcome: 0,
            status: 'pending',
            dispute_tx_id: parsed.txId,
          });
        }
      }
    }
    lastSuccessfulHeight = height;
  }

  console.log(`[DisputeIndexer] Indexed ${foundCount} dispute events in range`);
  return lastSuccessfulHeight;
}

async function runOnce(): Promise<void> {
  const checkpoint = loadCheckpoint();
  const latest = await getLatestBlockHeight();
  if (latest === 0) {
    console.warn('[DisputeIndexer] Could not fetch latest block height — skipping run');
    return;
  }

  const startHeight = checkpoint.lastIndexedBlock > 0
    ? checkpoint.lastIndexedBlock + 1
    : Math.max(1, latest - MAX_BLOCKS_PER_RUN);
  const endHeight = Math.min(latest, startHeight + MAX_BLOCKS_PER_RUN - 1);

  if (startHeight > endHeight) {
    console.log(`[DisputeIndexer] No new blocks to scan (latest=${latest})`);
    return;
  }

  const lastSuccessfulHeight = await indexBlockRange(startHeight, endHeight);
  saveCheckpoint(lastSuccessfulHeight);
}

async function main(): Promise<void> {
  console.log('🛡️  Veiled Markets — Dispute Indexer');
  console.log(`   RPC: ${config.rpcUrl}`);
  console.log(`   Programs: ${MARKET_PROGRAMS.map(p => p.id).join(', ')}`);
  console.log(`   Poll interval: ${POLL_INTERVAL_MS}ms`);

  await runOnce();

  if (process.env.DISPUTE_INDEXER_MODE !== 'one-shot') {
    setInterval(() => {
      runOnce().catch(error => console.error('[DisputeIndexer] Run failed:', error));
    }, POLL_INTERVAL_MS);
  }
}

main().catch(error => {
  console.error('[DisputeIndexer] Fatal:', error);
  process.exit(1);
});
