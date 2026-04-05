// ============================================================================
// VEILED GOVERNANCE — Blockchain Client
// ============================================================================
// Client for interacting with the veiled_governance_v4.aleo program (pure ALEO)
// ============================================================================

import { config } from './config';
import { devLog, devWarn } from './logger';
import {
  VEIL_DECIMALS,
  PROPOSAL_TYPE_LABELS,
  type GovernanceProposal,
  type ProposalType,
  type ProposalStatus,
  type ResolverProfile,
  type RewardEpoch,
  type CommitteeDecision,
} from './governance-types';

// ============================================================================
// Configuration
// ============================================================================

const API_BASE_URL = config.rpcUrl || 'https://api.explorer.provable.com/v1/testnet';
const GOV_PROGRAM_ID = config.governanceProgramId || 'veiled_governance_v4.aleo';
// v2: No separate token program — governance uses native ALEO credits
const TOKEN_PROGRAM_ID = 'credits.aleo';
const FETCH_TIMEOUT_MS = 15_000;

// ============================================================================
// Low-level RPC Helpers
// ============================================================================

async function fetchWithTimeout(url: string, timeoutMs: number = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

async function fetchWithRetry(url: string, maxRetries: number = 2): Promise<Response> {
  for (let i = 0; i <= maxRetries; i++) {
    try {
      const response = await fetchWithTimeout(url);
      if (response.ok || response.status === 404) return response;
      if (i < maxRetries) await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    } catch (err) {
      if (i === maxRetries) throw err;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw new Error(`Failed to fetch after ${maxRetries} retries: ${url}`);
}

/**
 * Fetch a mapping value from the governance program
 */
export async function getGovernanceMappingValue<T>(
  mappingName: string,
  key: string
): Promise<T | null> {
  try {
    const url = `${API_BASE_URL}/program/${GOV_PROGRAM_ID}/mapping/${mappingName}/${key}`;
    devLog('[governance] Fetching mapping:', url);

    const response = await fetchWithRetry(url);
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`Failed to fetch mapping: ${response.status}`);
    }

    const data = await response.text();
    const cleanData = JSON.parse(data);
    if (cleanData === null || cleanData === undefined) return null;

    if (typeof cleanData === 'string' && cleanData.trim().startsWith('{')) {
      return parseAleoStruct(cleanData) as T;
    }
    return parseAleoValue(cleanData) as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      devWarn(`Timeout fetching governance mapping ${mappingName}[${key}]`);
      return null;
    }
    devWarn(`Failed to fetch governance mapping ${mappingName}[${key}]:`, error);
    return null;
  }
}

/**
 * Parse Aleo struct string into JS object
 */
function parseAleoStruct(structStr: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const clean = structStr.replace(/^\{|\}$/g, '').trim();
  const parts = clean.split(',');
  for (const part of parts) {
    const [key, value] = part.split(':').map(s => s.trim());
    if (key && value) {
      result[key] = parseAleoValue(value);
    }
  }
  return result;
}

/**
 * Parse individual Aleo value
 */
function parseAleoValue(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const str = value.trim();

  // Boolean
  if (str === 'true') return true;
  if (str === 'false') return false;

  // Integer types (u8, u16, u32, u64, u128, i8, etc.)
  const intMatch = str.match(/^(-?\d+)[ui]\d+$/);
  if (intMatch) return str; // Keep as string for BigInt compatibility

  // Field
  if (str.endsWith('field')) return str;

  // Address
  if (str.startsWith('aleo1')) return str;

  return str;
}

// ============================================================================
// ALEO Amount Utilities (v2: pure ALEO, no custom token)
// ============================================================================

/**
 * Format ALEO amount (6 decimals / microcredits) for display
 */
export function formatVeil(amount: bigint, decimals: number = 2): string {
  const whole = amount / BigInt(10 ** VEIL_DECIMALS);
  const fraction = amount % BigInt(10 ** VEIL_DECIMALS);
  const fractionStr = fraction.toString().padStart(VEIL_DECIMALS, '0').slice(0, decimals);
  return `${whole.toLocaleString()}.${fractionStr}`;
}

/**
 * Format VEIL amount in compact notation (e.g. 100M, 1.5K)
 */
export function formatVeilCompact(amount: bigint): string {
  const whole = Number(amount / BigInt(10 ** VEIL_DECIMALS));
  if (whole >= 1_000_000_000) return `${(whole / 1_000_000_000).toFixed(1)}B`;
  if (whole >= 1_000_000) return `${(whole / 1_000_000).toFixed(whole % 1_000_000 === 0 ? 0 : 1)}M`;
  if (whole >= 1_000) return `${(whole / 1_000).toFixed(whole % 1_000 === 0 ? 0 : 1)}K`;
  return whole.toLocaleString();
}

/**
 * Parse VEIL amount from display string to raw microVEIL
 */
export function parseVeilInput(input: string): bigint {
  const parts = input.split('.');
  const whole = BigInt(parts[0] || '0') * BigInt(10 ** VEIL_DECIMALS);
  if (parts.length === 1) return whole;
  const fractionStr = (parts[1] || '0').padEnd(VEIL_DECIMALS, '0').slice(0, VEIL_DECIMALS);
  return whole + BigInt(fractionStr);
}

// ============================================================================
// Governance Data Fetching
// ============================================================================

/**
 * Fetch total ALEO held by the governance program
 * v2: Reads program_credits[0u8] from governance contract
 */
export async function getVeilTotalSupply(): Promise<bigint> {
  const raw = await getGovernanceMappingValue<string>('program_credits', '0u8');
  if (!raw) return 0n;
  return BigInt(String(raw).replace(/u\d+$/, ''));
}

/**
 * Fetch a mapping value from the VEIL token program
 */
export async function getTokenMappingValue<T>(
  mappingName: string,
  key: string
): Promise<T | null> {
  try {
    const url = `${API_BASE_URL}/program/${TOKEN_PROGRAM_ID}/mapping/${mappingName}/${key}`;
    devLog('[veil-token] Fetching mapping:', url);

    const response = await fetchWithRetry(url);
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`Failed to fetch mapping: ${response.status}`);
    }

    const data = await response.text();
    const cleanData = JSON.parse(data);
    if (cleanData === null || cleanData === undefined) return null;

    if (typeof cleanData === 'string' && cleanData.trim().startsWith('{')) {
      return parseAleoStruct(cleanData) as T;
    }
    return parseAleoValue(cleanData) as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return null;
    devWarn(`Failed to fetch token mapping ${mappingName}[${key}]:`, error);
    return null;
  }
}

/**
 * Fetch ALEO public balance for an address (from credits.aleo)
 * v2: User's governance "balance" is their ALEO credits balance
 */
export async function getVeilPublicBalance(address: string): Promise<bigint> {
  try {
    const url = `${API_BASE_URL}/program/credits.aleo/mapping/account/${address}`;
    const response = await fetchWithRetry(url);
    if (!response.ok) return 0n;
    const data = await response.text();
    const clean = data.replace(/"/g, '').trim();
    const match = clean.match(/(\d+)/);
    return match ? BigInt(match[1]) : 0n;
  } catch {
    return 0n;
  }
}

/**
 * Fetch a governance proposal by ID
 */
export async function getGovernanceProposal(proposalId: string): Promise<GovernanceProposal | null> {
  const raw = await getGovernanceMappingValue<Record<string, unknown>>('governance_proposals', proposalId);
  if (!raw) return null;
  return parseProposal(raw);
}

/**
 * Check if an address has already voted on a proposal
 */
export async function hasVotedOnProposal(proposalId: string, voter: string): Promise<boolean> {
  // VoteKey hash — computed the same way as in the Leo contract
  // For now we use a simplified check via the mapping
  // In production, compute BHP256::hash_to_field of VoteKey struct
  const voteKeyHash = `${proposalId}_${voter}`; // Placeholder — real implementation needs BHP256
  const result = await getGovernanceMappingValue<boolean>('proposal_votes', voteKeyHash);
  return result === true;
}

/**
 * Fetch a resolver profile
 */
export async function getResolverProfile(address: string): Promise<ResolverProfile | null> {
  const raw = await getGovernanceMappingValue<Record<string, unknown>>('resolver_registry', address);
  if (!raw) return null;
  return {
    address: String(raw.resolver || address),
    stakeAmount: BigInt(String(raw.stake_amount || '0').replace(/u\d+$/, '')),
    tier: Number(String(raw.tier || '1').replace(/u\d+$/, '')) as ResolverProfile['tier'],
    marketsResolved: Number(String(raw.markets_resolved || '0').replace(/u\d+$/, '')),
    disputesReceived: Number(String(raw.disputes_received || '0').replace(/u\d+$/, '')),
    disputesLost: Number(String(raw.disputes_lost || '0').replace(/u\d+$/, '')),
    strikes: Number(String(raw.strikes || '0').replace(/u\d+$/, '')),
    reputationScore: Number(String(raw.reputation_score || '10000').replace(/u\d+$/, '')) / 100,
    registeredAt: BigInt(String(raw.registered_at || '0').replace(/u\d+$/, '')),
    lastActiveAt: BigInt(String(raw.last_active_at || '0').replace(/u\d+$/, '')),
    isActive: raw.is_active === true || raw.is_active === 'true',
  };
}

/**
 * Fetch guardian config
 */
export async function getGuardianConfig() {
  return getGovernanceMappingValue<Record<string, unknown>>('guardian_config', '0u8');
}

/**
 * Fetch reward epoch info
 */
export async function getRewardEpoch(epochId: number): Promise<RewardEpoch | null> {
  const raw = await getGovernanceMappingValue<Record<string, unknown>>('reward_epochs', `${epochId}u64`);
  if (!raw) return null;
  return {
    epochId: Number(String(raw.epoch_id || '0').replace(/u\d+$/, '')),
    totalLpReward: BigInt(String(raw.total_lp_reward || '0').replace(/u\d+$/, '')),
    totalTraderReward: BigInt(String(raw.total_trader_reward || '0').replace(/u\d+$/, '')),
    totalLpContributions: BigInt(String(raw.total_lp_contributions || '0').replace(/u\d+$/, '')),
    totalTradeVolume: BigInt(String(raw.total_trade_volume || '0').replace(/u\d+$/, '')),
    startedAt: BigInt(String(raw.started_at || '0').replace(/u\d+$/, '')),
    distributed: raw.distributed === true || raw.distributed === 'true',
  };
}

/**
 * Fetch committee decision for a market
 */
export async function getCommitteeDecision(marketId: string): Promise<CommitteeDecision | null> {
  const raw = await getGovernanceMappingValue<Record<string, unknown>>('committee_decisions', marketId);
  if (!raw) return null;
  return {
    marketId: String(raw.market_id || marketId),
    outcome: Number(String(raw.outcome || '0').replace(/u\d+$/, '')),
    votesCount: Number(String(raw.votes_count || '0').replace(/u\d+$/, '')),
    decidedAt: BigInt(String(raw.decided_at || '0').replace(/u\d+$/, '')),
    finalized: raw.finalized === true || raw.finalized === 'true',
  };
}

export interface GovernanceLiveConfig {
  pauseState: boolean;
  protocolFeeBps: bigint;
  creatorFeeBps: bigint;
  lpFeeBps: bigint;
  minTradeAmount: bigint;
  minLiquidity: bigint;
  guardianThreshold: number;
  guardianAddresses: string[];
}

export async function getGovernanceLiveConfig(): Promise<GovernanceLiveConfig> {
  const [
    pauseValue,
    protocolFee,
    creatorFee,
    lpFee,
    minTrade,
    minLiquidity,
    guardianConfig,
  ] = await Promise.all([
    getGovernanceMappingValue<boolean>('governance_paused', '0u8'),
    getGovernanceMappingValue<string>('governance_params', '1field'),
    getGovernanceMappingValue<string>('governance_params', '2field'),
    getGovernanceMappingValue<string>('governance_params', '3field'),
    getGovernanceMappingValue<string>('governance_params', '4field'),
    getGovernanceMappingValue<string>('governance_params', '5field'),
    getGuardianConfig(),
  ]);

  const parseBig = (value: unknown, fallback: bigint): bigint => {
    if (value === null || value === undefined || value === '') return fallback;
    return BigInt(String(value).replace(/u\d+$/, ''));
  };

  return {
    pauseState: Boolean(pauseValue),
    protocolFeeBps: parseBig(protocolFee, 50n),
    creatorFeeBps: parseBig(creatorFee, 50n),
    lpFeeBps: parseBig(lpFee, 100n),
    minTradeAmount: parseBig(minTrade, 1_000n),
    minLiquidity: parseBig(minLiquidity, 10_000n),
    guardianThreshold: Number(String(guardianConfig?.threshold || '0').replace(/u\d+$/, '')),
    guardianAddresses: [
      String(guardianConfig?.guardian_1 || ''),
      String(guardianConfig?.guardian_2 || ''),
      String(guardianConfig?.guardian_3 || ''),
    ].filter(Boolean),
  };
}

// ============================================================================
// Transaction Builders
// ============================================================================

/**
 * Build inputs for creating a governance proposal (v2: stake ALEO credits)
 * create_proposal(credits_in, proposal_type, target, payload_1, payload_2, nonce)
 */
export function buildCreateProposalInputs(
  creditsRecord: string,
  proposalType: number,
  target: string,
  payload1: bigint,
  payload2: string,
  nonce: bigint
): string[] {
  return [
    creditsRecord,
    `${proposalType}u8`,
    normalizeFieldInput(target),
    `${payload1}u128`,
    normalizeFieldInput(payload2),
    `${nonce}u64`,
  ];
}

/**
 * Build inputs for voting on a proposal (v2: lock ALEO credits)
 * vote_for/vote_against(credits_in, proposal_id, amount)
 */
export function buildVoteInputs(
  creditsRecord: string,
  proposalId: string,
  amount: bigint
): string[] {
  return [
    creditsRecord,
    normalizeFieldInput(proposalId),
    `${amount}u64`,
  ];
}

/**
 * Build inputs for delegating votes (v2: lock ALEO credits)
 * delegate_votes(credits_in, delegate_to, amount)
 */
export function buildDelegateInputs(
  creditsRecord: string,
  delegateAddress: string,
  amount: bigint
): string[] {
  return [
    creditsRecord,
    delegateAddress,
    `${amount}u64`,
  ];
}

/**
 * Build inputs for registering as a resolver (v2: stake ALEO credits)
 * register_resolver(credits_in)
 */
export function buildRegisterResolverInputs(
  creditsRecord: string
): string[] {
  return [creditsRecord];
}

export function buildFinalizeVoteInputs(proposalId: string): string[] {
  return [normalizeFieldInput(proposalId)];
}

export function buildExecuteGovernanceInputs(proposal: GovernanceProposal): string[] {
  return [
    normalizeFieldInput(proposal.proposalId),
    `${proposal.proposalType}u8`,
    normalizeFieldInput(proposal.target),
    `${proposal.payload1}u128`,
    normalizeFieldInput(proposal.payload2),
  ];
}

export function buildVetoProposalInputs(proposalId: string): string[] {
  return [normalizeFieldInput(proposalId)];
}

export function buildUpgradeResolverTierInputs(resolver: string): string[] {
  return [resolver];
}

export function buildUnstakeResolverInputs(
  receiptRecord: string,
  withdrawAmount: bigint,
): string[] {
  return [receiptRecord, `${withdrawAmount}u64`];
}

// ============================================================================
// Helpers
// ============================================================================

function parseProposal(raw: Record<string, unknown>): GovernanceProposal {
  const proposalType = Number(String(raw.proposal_type || '0').replace(/u\d+$/, '')) as ProposalType;
  const votesFor = BigInt(String(raw.votes_for || '0').replace(/u\d+$/, ''));
  const votesAgainst = BigInt(String(raw.votes_against || '0').replace(/u\d+$/, ''));
  const quorumRequired = BigInt(String(raw.quorum_required || '0').replace(/u\d+$/, ''));
  const totalVotes = votesFor + votesAgainst;
  const totalVotesNum = Number(totalVotes);
  const quorumReqNum = Number(quorumRequired);

  return {
    proposalId: String(raw.proposal_id || ''),
    proposer: String(raw.proposer || ''),
    proposalType,
    proposalTypeName: PROPOSAL_TYPE_LABELS[proposalType] || 'Unknown',
    target: String(raw.target || '0field'),
    payload1: BigInt(String(raw.payload_1 || '0').replace(/u\d+$/, '')),
    payload2: String(raw.payload_2 || '0field'),
    votesFor,
    votesAgainst,
    quorumRequired,
    createdAt: BigInt(String(raw.created_at || '0').replace(/u\d+$/, '')),
    votingDeadline: BigInt(String(raw.voting_deadline || '0').replace(/u\d+$/, '')),
    timelockUntil: BigInt(String(raw.timelock_until || '0').replace(/u\d+$/, '')),
    status: Number(String(raw.status || '0').replace(/u\d+$/, '')) as ProposalStatus,
    totalVotes,
    quorumPercent: quorumReqNum > 0 ? Math.min(100, (totalVotesNum / quorumReqNum) * 100) : 0,
    forPercent: totalVotesNum > 0 ? (Number(votesFor) / totalVotesNum) * 100 : 50,
    againstPercent: totalVotesNum > 0 ? (Number(votesAgainst) / totalVotesNum) * 100 : 50,
    isQuorumMet: totalVotes >= quorumRequired,
  };
}

/**
 * Get the current block height
 */
export async function getBlockHeight(): Promise<bigint> {
  try {
    const response = await fetchWithRetry(`${API_BASE_URL}/latest/height`);
    if (!response.ok) throw new Error(`Failed to fetch block height: ${response.status}`);
    const height = await response.json();
    return BigInt(height);
  } catch {
    devWarn('Failed to fetch block height');
    return 0n;
  }
}

/**
 * Estimate block timestamp (based on current height and block time)
 */
export function estimateBlockTime(targetBlock: bigint, currentBlock: bigint): number {
  const blocksAway = Number(targetBlock - currentBlock);
  const secondsPerBlock = config.secondsPerBlock;
  return Date.now() + (blocksAway * secondsPerBlock * 1000);
}

/**
 * Format remaining time from blocks
 */
export function formatBlocksRemaining(blocks: bigint, secondsPerBlock: number = 15): string {
  const totalSeconds = Number(blocks) * secondsPerBlock;
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function normalizeFieldInput(value: string): string {
  return value.endsWith('field') ? value : `${value}field`;
}
