// ============================================================================
// VEILED MARKETS SDK - Governance Client
// ============================================================================
// Client for veiled_governance_v6.aleo (post-audit hardening, 2026-04-08).
//
// v6 changes:
//  - initiate_escalation split into 3 token-specific transitions
//    (initiate_escalation_aleo / _usdcx / _usad), each cross-program calls
//    assert_disputed in the matching market contract.
//  - governance_resolve_aleo/_usdcx/_usad now take a `tier: u8` parameter
//    that propagates to apply_governance_resolution (committee=2 vs
//    community=3).  Market contract cross-checks tier against
//    market_escalation_tier[market_id].
//  - blacklist_resolver and update_resolver_stats removed (auto-blacklist
//    happens inside slash_resolver after MAX_STRIKES).
// ============================================================================

import {
  PROGRAM_IDS,
  NETWORK_CONFIG,
  TokenType,
  type NetworkType,
  type VeiledMarketsConfig,
} from './types';

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

export interface CommitteeDecision {
  marketId: string;
  outcome: number;
  votesCount: number;
  decidedAt: bigint;
  finalized: boolean;
}

export interface MarketDisputeState {
  marketId: string;
  disputer: string;
  originalOutcome: number;
  proposedOutcome: number;
  disputeBond: bigint;
  disputedAt: bigint;
  escalatedTier: number;
  finalOutcome: number;
  resolvedBy: string;
}

export interface ResolverProfile {
  address: string;
  stakeAmount: bigint;
  tier: number;
  marketsResolved: number;
  disputesReceived: number;
  disputesLost: number;
  strikes: number;
  reputationScore: number;
  registeredAt: bigint;
  lastActiveAt: bigint;
  isActive: boolean;
}

export const ESCALATION_TIER_NONE = 0;
export const ESCALATION_TIER_COMMITTEE = 2;
export const ESCALATION_TIER_COMMUNITY = 3;

// ----------------------------------------------------------------------------
// Client
// ----------------------------------------------------------------------------

const DEFAULT_CONFIG: VeiledMarketsConfig = {
  network: 'testnet',
  programId: PROGRAM_IDS.GOVERNANCE,
};

export class VeiledGovernanceClient {
  private config: VeiledMarketsConfig;

  constructor(config: Partial<VeiledMarketsConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  get programId(): string {
    return this.config.programId;
  }

  get network(): NetworkType {
    return this.config.network;
  }

  get rpcUrl(): string {
    return this.config.rpcUrl || NETWORK_CONFIG[this.config.network].rpcUrl;
  }

  // --------------------------------------------------------------------------
  // Low-level mapping fetchers
  // --------------------------------------------------------------------------

  async getMappingValue<T = unknown>(
    mappingName: string,
    key: string,
    programId: string = this.programId,
  ): Promise<T | null> {
    try {
      const url = `${this.rpcUrl}/program/${programId}/mapping/${mappingName}/${key}`;
      const response = await fetch(url);
      if (!response.ok) return null;
      const raw = await response.text();
      const data = JSON.parse(raw);
      if (data === null || data === undefined) return null;
      if (typeof data === 'string' && data.trim().startsWith('{')) {
        return parseAleoStruct(data) as T;
      }
      return data as T;
    } catch {
      return null;
    }
  }

  // --------------------------------------------------------------------------
  // Reads — escalation/dispute state
  // --------------------------------------------------------------------------

  /** Read committee decision for a market. */
  async getCommitteeDecision(marketId: string): Promise<CommitteeDecision | null> {
    const raw = await this.getMappingValue<Record<string, unknown>>(
      'committee_decisions',
      marketId,
    );
    if (!raw) return null;
    return {
      marketId: String(raw.market_id ?? marketId),
      outcome: parseU(raw.outcome),
      votesCount: parseU(raw.votes_count),
      decidedAt: parseBig(raw.decided_at),
      finalized: raw.finalized === true || raw.finalized === 'true',
    };
  }

  /**
   * Persistent dispute state lives in each MARKET contract (not governance).
   * Pass the matching token type so the right program is queried.
   */
  async getMarketDisputeState(
    marketId: string,
    tokenType: TokenType,
  ): Promise<MarketDisputeState | null> {
    const marketProgramId = marketProgramIdFor(tokenType);
    const raw = await this.getMappingValue<Record<string, unknown>>(
      'market_dispute_state',
      marketId,
      marketProgramId,
    );
    if (!raw) return null;
    return {
      marketId: String(raw.market_id ?? marketId),
      disputer: String(raw.disputer ?? ''),
      originalOutcome: parseU(raw.original_outcome),
      proposedOutcome: parseU(raw.proposed_outcome),
      disputeBond: parseBig(raw.dispute_bond),
      disputedAt: parseBig(raw.disputed_at),
      escalatedTier: parseU(raw.escalated_tier),
      finalOutcome: parseU(raw.final_outcome),
      resolvedBy: String(raw.resolved_by ?? ''),
    };
  }

  /** market_escalation_tier[market_id] — 0 if none. */
  async getMarketEscalationTier(marketId: string): Promise<number> {
    const raw = await this.getMappingValue<string | number>('market_escalation_tier', marketId);
    return raw == null ? 0 : parseU(raw);
  }

  /** committee_vote_count[market_id] — number of committee votes cast so far. */
  async getCommitteeVoteCount(marketId: string): Promise<number> {
    const raw = await this.getMappingValue<string | number>('committee_vote_count', marketId);
    return raw == null ? 0 : parseU(raw);
  }

  /** Read all 5 committee member slots. Empty slots are filtered out. */
  async getCommitteeMembers(): Promise<string[]> {
    const slots = await Promise.all(
      [1, 2, 3, 4, 5].map((slot) =>
        this.getMappingValue<string>('committee_members', `${slot}u8`).catch(() => null),
      ),
    );
    return slots.filter((addr): addr is string => typeof addr === 'string' && addr.length > 0);
  }

  /** Resolver profile from resolver_registry mapping. */
  async getResolverProfile(address: string): Promise<ResolverProfile | null> {
    const raw = await this.getMappingValue<Record<string, unknown>>(
      'resolver_registry',
      address,
    );
    if (!raw) return null;
    return {
      address: String(raw.resolver ?? address),
      stakeAmount: parseBig(raw.stake_amount),
      tier: parseU(raw.tier ?? '1'),
      marketsResolved: parseU(raw.markets_resolved),
      disputesReceived: parseU(raw.disputes_received),
      disputesLost: parseU(raw.disputes_lost),
      strikes: parseU(raw.strikes),
      reputationScore: parseU(raw.reputation_score ?? '10000') / 100,
      registeredAt: parseBig(raw.registered_at),
      lastActiveAt: parseBig(raw.last_active_at),
      isActive: raw.is_active === true || raw.is_active === 'true',
    };
  }

  // --------------------------------------------------------------------------
  // Transaction builders — escalation flow (v6)
  // --------------------------------------------------------------------------

  /**
   * Build inputs for `initiate_escalation_*` for the given token's market.
   * Tier 0 → Tier 2 (committee). Each variant cross-program calls
   * assert_disputed on the matching market contract.
   */
  buildInitiateEscalationInputs(
    marketId: string,
    tokenType: TokenType,
  ): { functionName: string; inputs: string[] } {
    return {
      functionName: initiateEscalationFn(tokenType),
      inputs: [normalizeField(marketId)],
    };
  }

  /** committee_vote_resolve(market_id, outcome) — committee member vote. */
  buildCommitteeVoteResolveInputs(marketId: string, outcome: number): string[] {
    return [normalizeField(marketId), `${outcome}u8`];
  }

  /** finalize_committee_vote(market_id) — anyone can trigger after quorum. */
  buildFinalizeCommitteeVoteInputs(marketId: string): string[] {
    return [normalizeField(marketId)];
  }

  /** escalate_to_community(market_id, proposed_outcome, nonce) — Tier 2 → 3. */
  buildEscalateToCommunityInputs(
    marketId: string,
    proposedOutcome: number,
    nonce: bigint,
  ): string[] {
    return [normalizeField(marketId), `${proposedOutcome}u8`, `${nonce}u64`];
  }

  /**
   * governance_resolve_*(market_id, winning_outcome, tier) — token-aware.
   * Pass tier=2 for committee resolution, tier=3 for community resolution.
   * Market contract verifies tier matches market_escalation_tier[market_id].
   */
  buildGovernanceResolveInputs(
    marketId: string,
    winningOutcome: number,
    tier: number,
    tokenType: TokenType,
  ): { functionName: string; inputs: string[] } {
    if (tier !== ESCALATION_TIER_COMMITTEE && tier !== ESCALATION_TIER_COMMUNITY) {
      throw new Error(
        `Invalid tier ${tier}: must be 2 (committee) or 3 (community)`,
      );
    }
    return {
      functionName: governanceResolveFn(tokenType),
      inputs: [normalizeField(marketId), `${winningOutcome}u8`, `${tier}u8`],
    };
  }

  /** assign_resolver_panel(market_id, m1..m5) — admin only. */
  buildAssignResolverPanelInputs(
    marketId: string,
    panelMembers: [string, string, string, string, string],
  ): string[] {
    return [normalizeField(marketId), ...panelMembers];
  }

  /** slash_resolver(resolver, market_id) — DEPLOYER only; auto-blacklists at MAX_STRIKES. */
  buildSlashResolverInputs(resolver: string, marketId: string): string[] {
    return [resolver, normalizeField(marketId)];
  }
}

export function createGovernanceClient(
  config?: Partial<VeiledMarketsConfig>,
): VeiledGovernanceClient {
  return new VeiledGovernanceClient(config);
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function marketProgramIdFor(tokenType: TokenType): string {
  switch (tokenType) {
    case TokenType.ALEO: return PROGRAM_IDS.ALEO_MARKET;
    case TokenType.USDCX: return PROGRAM_IDS.USDCX_MARKET;
    case TokenType.USAD: return PROGRAM_IDS.USAD_MARKET;
    default:
      throw new Error(`Unknown TokenType: ${tokenType}`);
  }
}

function initiateEscalationFn(tokenType: TokenType): string {
  switch (tokenType) {
    case TokenType.ALEO: return 'initiate_escalation_aleo';
    case TokenType.USDCX: return 'initiate_escalation_usdcx';
    case TokenType.USAD: return 'initiate_escalation_usad';
    default:
      throw new Error(`Unknown TokenType: ${tokenType}`);
  }
}

function governanceResolveFn(tokenType: TokenType): string {
  switch (tokenType) {
    case TokenType.ALEO: return 'governance_resolve_aleo';
    case TokenType.USDCX: return 'governance_resolve_usdcx';
    case TokenType.USAD: return 'governance_resolve_usad';
    default:
      throw new Error(`Unknown TokenType: ${tokenType}`);
  }
}

function normalizeField(value: string): string {
  const trimmed = String(value).trim();
  if (!trimmed) return '0field';
  return trimmed.endsWith('field') ? trimmed : `${trimmed}field`;
}

function parseU(value: unknown): number {
  if (value == null) return 0;
  return Number(String(value).replace(/[ui]\d+$/, '')) || 0;
}

function parseBig(value: unknown): bigint {
  if (value == null) return 0n;
  try {
    return BigInt(String(value).replace(/[ui]\d+$/, ''));
  } catch {
    return 0n;
  }
}

function parseAleoStruct(structStr: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const clean = structStr.replace(/^\{|\}$/g, '').trim();
  for (const part of clean.split(',')) {
    const [key, value] = part.split(':').map((s) => s.trim());
    if (key && value) result[key] = value;
  }
  return result;
}
