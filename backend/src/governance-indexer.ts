#!/usr/bin/env node
// ============================================================================
// VEILED GOVERNANCE — Governance Indexer
// ============================================================================
// Indexes governance proposals, votes, rewards, and resolver data from
// the veiled_governance_v1.aleo program into Supabase.
//
// Usage: npx tsx backend/src/governance-indexer.ts
// ============================================================================

import { GOVERNANCE_CONFIG } from './governance-config';

const { apiBaseUrl, programId, supabaseUrl, supabaseKey, pollIntervalMs } = GOVERNANCE_CONFIG;

// ============================================================================
// Supabase Client
// ============================================================================

async function supabaseRequest(path: string, method: string = 'GET', body?: unknown) {
  if (!supabaseUrl || !supabaseKey) {
    console.warn('[governance-indexer] Supabase not configured, skipping DB write');
    return null;
  }

  const response = await fetch(`${supabaseUrl}/rest/v1${path}`, {
    method,
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      'Prefer': method === 'POST' ? 'resolution=merge-duplicates' : '',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`[supabase] ${method} ${path} failed: ${response.status} — ${text}`);
    return null;
  }

  if (method === 'GET') return response.json();
  return true;
}

// ============================================================================
// Aleo RPC Helpers
// ============================================================================

async function fetchMapping(mappingName: string, key: string): Promise<string | null> {
  try {
    const url = `${apiBaseUrl}/program/${programId}/mapping/${mappingName}/${key}`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const text = await response.text();
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function fetchLatestHeight(): Promise<number> {
  try {
    const response = await fetch(`${apiBaseUrl}/latest/height`);
    if (!response.ok) return 0;
    return Number(await response.json());
  } catch {
    return 0;
  }
}

function parseAleoValue(value: string): string {
  // Remove type suffix (u8, u64, u128, field, etc.)
  return String(value).replace(/[ui]\d+$/, '').replace(/field$/, '').trim();
}

function parseAleoStruct(structStr: string): Record<string, string> {
  const result: Record<string, string> = {};
  const clean = String(structStr).replace(/^\{|\}$/g, '').trim();
  const parts = clean.split(',');
  for (const part of parts) {
    const colonIdx = part.indexOf(':');
    if (colonIdx > 0) {
      const key = part.slice(0, colonIdx).trim();
      const value = part.slice(colonIdx + 1).trim();
      result[key] = value;
    }
  }
  return result;
}

// ============================================================================
// Proposal Indexer
// ============================================================================

const PROPOSAL_TYPE_NAMES: Record<string, string> = {
  '1': 'Dispute Resolution',
  '2': 'Fee Structure Change',
  '3': 'Treasury Withdrawal',
  '4': 'Parameter Update',
  '5': 'Emergency Pause',
  '6': 'Resolver Election',
};

const STATUS_MAP: Record<string, string> = {
  '0': 'active',
  '1': 'passed',
  '2': 'rejected',
  '3': 'executed',
  '4': 'vetoed',
  '5': 'expired',
};

// Track known proposal IDs (in production, persisted in DB)
const knownProposalIds = new Set<string>();

async function indexProposal(proposalId: string): Promise<boolean> {
  const raw = await fetchMapping('governance_proposals', proposalId);
  if (!raw || raw === 'null') return false;

  const parsed = parseAleoStruct(raw);
  const proposalType = parseAleoValue(parsed.proposal_type || '0');

  const proposal = {
    proposal_id: proposalId,
    proposer: parsed.proposer || '',
    proposal_type: Number(proposalType),
    proposal_type_name: PROPOSAL_TYPE_NAMES[proposalType] || 'Unknown',
    title: `${PROPOSAL_TYPE_NAMES[proposalType] || 'Proposal'} #${proposalId.slice(0, 8)}`,
    votes_for: parseAleoValue(parsed.votes_for || '0'),
    votes_against: parseAleoValue(parsed.votes_against || '0'),
    quorum_required: parseAleoValue(parsed.quorum_required || '0'),
    status: STATUS_MAP[parseAleoValue(parsed.status || '0')] || 'active',
    created_at: parseAleoValue(parsed.created_at || '0'),
    voting_deadline: parseAleoValue(parsed.voting_deadline || '0'),
    timelock_until: parseAleoValue(parsed.timelock_until || '0'),
    target: parsed.target || '',
    payload_1: parseAleoValue(parsed.payload_1 || '0'),
    payload_2: parsed.payload_2 || '',
  };

  await supabaseRequest('/governance_proposals', 'POST', proposal);
  knownProposalIds.add(proposalId);
  console.log(`  ✅ Indexed proposal: ${proposalId.slice(0, 16)}... (${proposal.proposal_type_name})`);
  return true;
}

// ============================================================================
// Supply & Stats Indexer
// ============================================================================

async function indexSupplyStats(): Promise<void> {
  const supplyRaw = await fetchMapping('veil_total_supply', '0u8');
  if (supplyRaw) {
    const supply = parseAleoValue(supplyRaw);
    await supabaseRequest('/governance_stats?stat_key=eq.circulating_supply', 'PATCH', {
      stat_value: supply,
      updated_at: new Date().toISOString(),
    });
  }
}

// ============================================================================
// Resolver Indexer
// ============================================================================

async function indexResolver(address: string): Promise<void> {
  const raw = await fetchMapping('resolver_registry', address);
  if (!raw || raw === 'null') return;

  const parsed = parseAleoStruct(raw);
  const resolver = {
    resolver_address: address,
    tier: Number(parseAleoValue(parsed.tier || '1')),
    stake_amount: parseAleoValue(parsed.stake_amount || '0'),
    markets_resolved: Number(parseAleoValue(parsed.markets_resolved || '0')),
    disputes_received: Number(parseAleoValue(parsed.disputes_received || '0')),
    disputes_upheld: Number(parseAleoValue(parsed.disputes_lost || '0')),
    strikes: Number(parseAleoValue(parsed.strikes || '0')),
    reputation_score: Number(parseAleoValue(parsed.reputation_score || '10000')) / 100,
    updated_at: new Date().toISOString(),
  };

  await supabaseRequest('/resolver_reputation', 'POST', resolver);
  console.log(`  ✅ Indexed resolver: ${address.slice(0, 20)}... (tier ${resolver.tier})`);
}

// ============================================================================
// Main Indexer Loop
// ============================================================================

async function runIndexerCycle(): Promise<void> {
  const height = await fetchLatestHeight();
  if (height === 0) {
    console.warn('[governance-indexer] Could not fetch block height');
    return;
  }
  console.log(`\n📦 Block height: ${height}`);

  // 1. Index supply stats
  await indexSupplyStats();

  // 2. Re-check known proposals for status updates
  for (const pid of knownProposalIds) {
    await indexProposal(pid);
  }

  // NOTE: In production, we would scan recent blocks for new governance
  // transactions and discover new proposal IDs. For now, new proposals
  // are registered via the frontend (Supabase insert on TX success).
}

async function main() {
  console.log('🏛️  Veiled Governance — Indexer');
  console.log('================================');
  console.log(`Program: ${programId}`);
  console.log(`API: ${apiBaseUrl}`);
  console.log(`Poll interval: ${pollIntervalMs / 1000}s\n`);

  // Initial run
  await runIndexerCycle();

  // Continuous polling
  setInterval(async () => {
    try {
      await runIndexerCycle();
    } catch (err) {
      console.error('[governance-indexer] Cycle error:', err);
    }
  }, pollIntervalMs);
}

main().catch(console.error);
