import { supabase, isSupabaseAvailable } from './supabase'
import { devWarn } from './logger'
import type { ProposalType, UserReward } from './governance-types'

const GOVERNANCE_PROPOSAL_CACHE_KEY = 'veiled-governance-proposals'

export interface GovernanceProposalMetadata {
  proposalId: string
  proposer: string
  proposalType: ProposalType
  proposalTypeName?: string
  title?: string
  description?: string
  target?: string
  payload1?: string
  payload2?: string
  transactionId?: string | null
  executedTxId?: string | null
  recipientAddress?: string | null
  createdAtTs?: string | null
  votingDeadline?: string | null
  timelockUntil?: string | null
  status?: string | number | null
  source?: 'local' | 'supabase'
}

interface GovernanceVoteReceipt {
  proposalId: string
  voter: string
  direction: 'for' | 'against'
  amount: bigint
  transactionId?: string | null
}

interface GovernanceRewardClaim {
  userAddress: string
  epochId: number
  rewardType: 'lp' | 'trading'
  claimTxId?: string | null
}

function isBrowser(): boolean {
  return typeof window !== 'undefined'
}

function loadLocalProposalCache(): GovernanceProposalMetadata[] {
  if (!isBrowser()) return []

  try {
    const raw = window.localStorage.getItem(GOVERNANCE_PROPOSAL_CACHE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed as GovernanceProposalMetadata[] : []
  } catch {
    return []
  }
}

function saveLocalProposalCache(entries: GovernanceProposalMetadata[]): void {
  if (!isBrowser()) return

  try {
    window.localStorage.setItem(GOVERNANCE_PROPOSAL_CACHE_KEY, JSON.stringify(entries))
  } catch {
    // Ignore storage quota failures.
  }
}

function mergeMetadata(
  current: GovernanceProposalMetadata | undefined,
  incoming: GovernanceProposalMetadata,
): GovernanceProposalMetadata {
  return {
    ...current,
    ...Object.fromEntries(
      Object.entries(incoming).filter(([, value]) => value !== undefined),
    ),
  } as GovernanceProposalMetadata
}

export function upsertCachedGovernanceProposalMetadata(
  metadata: GovernanceProposalMetadata,
): GovernanceProposalMetadata[] {
  const existing = loadLocalProposalCache()
  const next = new Map<string, GovernanceProposalMetadata>()

  for (const entry of existing) {
    if (!entry?.proposalId) continue
    next.set(entry.proposalId, entry)
  }

  next.set(metadata.proposalId, mergeMetadata(next.get(metadata.proposalId), {
    ...metadata,
    source: 'local',
  }))

  const values = Array.from(next.values()).sort((a, b) =>
    String(b.createdAtTs || '').localeCompare(String(a.createdAtTs || '')),
  )
  saveLocalProposalCache(values)
  return values
}

export async function saveGovernanceProposalMetadata(
  metadata: GovernanceProposalMetadata,
): Promise<void> {
  upsertCachedGovernanceProposalMetadata(metadata)

  if (!isSupabaseAvailable() || !supabase) return

  try {
    await supabase.from('governance_proposals').upsert(
      {
        proposal_id: metadata.proposalId,
        proposer: metadata.proposer,
        proposal_type: metadata.proposalType,
        proposal_type_name: metadata.proposalTypeName ?? 'Unknown',
        title: metadata.title ?? '',
        description: metadata.description ?? '',
        target: metadata.target ?? '0field',
        payload_1: metadata.payload1 ?? '0',
        payload_2: metadata.payload2 ?? '0field',
        status: metadata.status ?? PROPOSAL_STATUS_FALLBACK,
        created_at_ts: metadata.createdAtTs ?? new Date().toISOString(),
        voting_deadline: metadata.votingDeadline ?? '0',
        timelock_until: metadata.timelockUntil ?? '0',
        transaction_id: metadata.transactionId ?? null,
        executed_tx_id: metadata.executedTxId ?? null,
        recipient_address: metadata.recipientAddress ?? null,
      },
      { onConflict: 'proposal_id' },
    )
  } catch (error) {
    devWarn('[Governance] Failed to persist proposal metadata:', error)
  }
}

export async function listGovernanceProposalMetadata(
  voterAddress?: string,
): Promise<GovernanceProposalMetadata[]> {
  const merged = new Map<string, GovernanceProposalMetadata>()

  for (const entry of loadLocalProposalCache()) {
    if (!entry?.proposalId) continue
    merged.set(entry.proposalId, { ...entry, source: 'local' })
  }

  if (isSupabaseAvailable() && supabase) {
    try {
      const { data: proposals } = await supabase
        .from('governance_proposals')
        .select('*')
        .order('created_at_ts', { ascending: false })
        .limit(100)

      for (const proposal of proposals || []) {
        const entry: GovernanceProposalMetadata = {
          proposalId: String(proposal.proposal_id),
          proposer: String(proposal.proposer),
          proposalType: Number(proposal.proposal_type) as ProposalType,
          proposalTypeName: String(proposal.proposal_type_name || ''),
          title: String(proposal.title || ''),
          description: String(proposal.description || ''),
          target: String(proposal.target || '0field'),
          payload1: String(proposal.payload_1 || '0'),
          payload2: String(proposal.payload_2 || '0field'),
          transactionId: proposal.transaction_id ? String(proposal.transaction_id) : null,
          executedTxId: proposal.executed_tx_id ? String(proposal.executed_tx_id) : null,
          recipientAddress: proposal.recipient_address ? String(proposal.recipient_address) : null,
          createdAtTs: proposal.created_at_ts ? String(proposal.created_at_ts) : null,
          votingDeadline: proposal.voting_deadline ? String(proposal.voting_deadline) : null,
          timelockUntil: proposal.timelock_until ? String(proposal.timelock_until) : null,
          status: proposal.status ?? null,
          source: 'supabase',
        }
        merged.set(entry.proposalId, mergeMetadata(merged.get(entry.proposalId), entry))
      }
    } catch (error) {
      devWarn('[Governance] Failed to read governance_proposals metadata:', error)
    }

    if (voterAddress) {
      try {
        const { data: votes } = await supabase
          .from('governance_votes')
          .select('proposal_id')
          .eq('voter', voterAddress)
          .limit(100)

        for (const vote of votes || []) {
          const proposalId = String(vote.proposal_id || '')
          if (!proposalId) continue
          if (!merged.has(proposalId)) {
            merged.set(proposalId, {
              proposalId,
              proposer: '',
              proposalType: 1 as ProposalType,
              source: 'supabase',
            })
          }
        }
      } catch (error) {
        devWarn('[Governance] Failed to read governance_votes metadata:', error)
      }
    }
  }

  return Array.from(merged.values()).sort((a, b) =>
    String(b.createdAtTs || '').localeCompare(String(a.createdAtTs || '')),
  )
}

export async function saveGovernanceVoteReceipt(receipt: GovernanceVoteReceipt): Promise<void> {
  if (!isSupabaseAvailable() || !supabase) return

  try {
    await supabase.from('governance_votes').upsert(
      {
        proposal_id: receipt.proposalId,
        voter: receipt.voter,
        direction: receipt.direction,
        amount: receipt.amount.toString(),
        transaction_id: receipt.transactionId ?? null,
      },
      { onConflict: 'proposal_id,voter' },
    )
  } catch (error) {
    devWarn('[Governance] Failed to persist governance vote:', error)
  }
}

function mapRewardRow(row: Record<string, unknown>): UserReward {
  return {
    userAddress: String(row.user_address),
    epochId: Number(row.epoch_id),
    rewardType: String(row.reward_type) as 'lp' | 'trading',
    amount: BigInt(String(row.amount || '0')),
    claimed: Boolean(row.claimed),
  }
}

export async function fetchGovernanceRewards(address: string): Promise<UserReward[]> {
  if (!isSupabaseAvailable() || !supabase || !address) return []

  try {
    const { data, error } = await supabase
      .from('veil_rewards')
      .select('*')
      .eq('user_address', address)
      .eq('claimed', false)
      .order('epoch_id', { ascending: false })

    if (error) throw error
    return (data || []).map((row) => mapRewardRow(row as Record<string, unknown>))
  } catch (error) {
    devWarn('[Governance] Failed to read veil_rewards, returning empty set:', error)
    return []
  }
}

export async function markGovernanceRewardClaimed(claim: GovernanceRewardClaim): Promise<void> {
  if (!isSupabaseAvailable() || !supabase) return

  try {
    await supabase
      .from('veil_rewards')
      .update({
        claimed: true,
        claim_tx_id: claim.claimTxId ?? null,
      })
      .eq('user_address', claim.userAddress)
      .eq('epoch_id', claim.epochId)
      .eq('reward_type', claim.rewardType)
  } catch (error) {
    devWarn('[Governance] Failed to mark reward as claimed:', error)
  }
}

const PROPOSAL_STATUS_FALLBACK = 0
