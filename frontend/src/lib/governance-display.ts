import {
  PROPOSAL_TYPES,
  type GovernanceProposal,
} from './governance-types'

function formatMicrocredits(amount: bigint): string {
  return `${(Number(amount) / 1_000_000).toLocaleString(undefined, {
    minimumFractionDigits: Number(amount) % 1_000_000 === 0 ? 0 : 2,
    maximumFractionDigits: 6,
  })} ALEO`
}

function formatBps(value: bigint): string {
  return `${(Number(value) / 100).toFixed(2)}%`
}

function shortAddress(address: string): string {
  return address.length > 18 ? `${address.slice(0, 8)}...${address.slice(-6)}` : address
}

export function getGovernanceTargetLabel(target: string): string {
  switch (target) {
    case '1field': return 'Protocol Fee'
    case '2field': return 'Creator Fee'
    case '3field': return 'LP Fee'
    case '4field': return 'Minimum Trade Amount'
    case '5field': return 'Minimum Liquidity'
    case '6field': return 'Pause State'
    default: return target
  }
}

export function describeProposalIntent(proposal: Pick<GovernanceProposal, 'proposalType' | 'target' | 'payload1' | 'payload2'>): string {
  switch (proposal.proposalType) {
    case PROPOSAL_TYPES.FEE_CHANGE:
      return `${getGovernanceTargetLabel(proposal.target)} -> ${formatBps(proposal.payload1)}`
    case PROPOSAL_TYPES.PARAMETER:
      if (proposal.target === '4field' || proposal.target === '5field') {
        return `${getGovernanceTargetLabel(proposal.target)} -> ${formatMicrocredits(proposal.payload1)}`
      }
      return `${getGovernanceTargetLabel(proposal.target)} -> ${proposal.payload1.toString()}`
    case PROPOSAL_TYPES.EMERGENCY_PAUSE:
      return proposal.payload1 > 0n ? 'Pause all market operations' : 'Resume market operations'
    case PROPOSAL_TYPES.RESOLVE_DISPUTE:
      return `Resolve disputed market ${proposal.target} with outcome ${proposal.payload1.toString()}`
    case PROPOSAL_TYPES.RESOLVER_ELECTION:
      return `${proposal.payload1 > 0n ? 'Approve' : 'Revoke'} resolver ${proposal.payload2}`
    case PROPOSAL_TYPES.TREASURY:
      return `Transfer ${formatMicrocredits(proposal.payload1)} from treasury to recipient hash ${shortAddress(proposal.payload2)}`
    default:
      return `${proposal.payload1.toString()} / ${proposal.payload2}`
  }
}
