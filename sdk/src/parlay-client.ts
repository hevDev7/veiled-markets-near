// ============================================================================
// VEILED MARKETS SDK - Parlay Client
// ============================================================================
// Transaction builders and RPC helpers for veiled_parlay_v3.aleo
// ============================================================================

import { TokenType, NETWORK_CONFIG, type NetworkType } from './types';
import {
  type ParlayLeg,
  type ParlayData,
  ParlayStatus,
  PARLAY_ODDS_PRECISION,
  PROGRAM_ALEO,
  PROGRAM_USDCX,
  PROGRAM_USAD,
} from './parlay';

export const PARLAY_PROGRAM_ID = 'veiled_parlay_v3.aleo';

export interface ParlayClientConfig {
  network?: NetworkType;
  programId?: string;
  rpcUrl?: string;
}

export interface ParlayTransactionInputs {
  programId: string;
  functionName: string;
  inputs: string[];
}

// Format a leg as an Aleo struct literal string (contract expects ParlayLeg structs, not individual fields)
function formatLegStruct(leg: ParlayLeg | null): string {
  if (!leg) {
    return '{ market_id: 0field, market_program: 0u8, outcome: 0u8, odds_bps: 0u128 }';
  }
  const marketId = leg.marketId.endsWith('field') ? leg.marketId : `${leg.marketId}field`;
  return `{ market_id: ${marketId}, market_program: ${leg.marketProgram}u8, outcome: ${leg.outcome}u8, odds_bps: ${leg.oddsBps}u128 }`;
}

export class ParlayClient {
  readonly network: NetworkType;
  readonly programId: string;
  readonly rpcUrl: string;

  constructor(config: ParlayClientConfig = {}) {
    this.network = config.network ?? 'testnet';
    this.programId = config.programId ?? PARLAY_PROGRAM_ID;
    this.rpcUrl = config.rpcUrl ?? NETWORK_CONFIG[this.network].rpcUrl;
  }

  // ==========================================================================
  // Transaction Builders
  // ==========================================================================

  /**
   * Build inputs for create_parlay_aleo transition.
   */
  buildCreateParlayAleoInputs(
    legs: ParlayLeg[],
    stake: bigint,
    ticketNonce: string,
    creditsRecord: string,
  ): ParlayTransactionInputs {
    const paddedLegs = this.padLegs(legs);

    return {
      programId: this.programId,
      functionName: 'create_parlay_aleo',
      inputs: [
        creditsRecord,
        ticketNonce.endsWith('field') ? ticketNonce : `${ticketNonce}field`,
        `${legs.length}u8`,
        `${stake}u128`,
        formatLegStruct(paddedLegs[0]),
        formatLegStruct(paddedLegs[1]),
        formatLegStruct(paddedLegs[2]),
        formatLegStruct(paddedLegs[3]),
      ],
    };
  }

  /**
   * Build inputs for create_parlay_usdcx transition.
   */
  buildCreateParlayUsdcxInputs(
    legs: ParlayLeg[],
    stake: bigint,
    ticketNonce: string,
    tokenRecord: string,
    merkleProofs: string,
  ): ParlayTransactionInputs {
    const paddedLegs = this.padLegs(legs);

    return {
      programId: this.programId,
      functionName: 'create_parlay_usdcx',
      inputs: [
        tokenRecord,
        merkleProofs,
        ticketNonce.endsWith('field') ? ticketNonce : `${ticketNonce}field`,
        `${legs.length}u8`,
        `${stake}u128`,
        formatLegStruct(paddedLegs[0]),
        formatLegStruct(paddedLegs[1]),
        formatLegStruct(paddedLegs[2]),
        formatLegStruct(paddedLegs[3]),
      ],
    };
  }

  /**
   * Build inputs for create_parlay_usad transition.
   */
  buildCreateParlayUsadInputs(
    legs: ParlayLeg[],
    stake: bigint,
    ticketNonce: string,
    tokenRecord: string,
    merkleProofs: string,
  ): ParlayTransactionInputs {
    const paddedLegs = this.padLegs(legs);

    return {
      programId: this.programId,
      functionName: 'create_parlay_usad',
      inputs: [
        tokenRecord,
        merkleProofs,
        ticketNonce.endsWith('field') ? ticketNonce : `${ticketNonce}field`,
        `${legs.length}u8`,
        `${stake}u128`,
        formatLegStruct(paddedLegs[0]),
        formatLegStruct(paddedLegs[1]),
        formatLegStruct(paddedLegs[2]),
        formatLegStruct(paddedLegs[3]),
      ],
    };
  }

  /**
   * Build create parlay inputs for any token type.
   */
  buildCreateParlayInputs(
    legs: ParlayLeg[],
    stake: bigint,
    ticketNonce: string,
    tokenType: TokenType,
    tokenRecordOrCredits: string,
    merkleProofs?: string,
  ): ParlayTransactionInputs {
    switch (tokenType) {
      case TokenType.ALEO:
        return this.buildCreateParlayAleoInputs(legs, stake, ticketNonce, tokenRecordOrCredits);
      case TokenType.USDCX:
        return this.buildCreateParlayUsdcxInputs(legs, stake, ticketNonce, tokenRecordOrCredits, merkleProofs ?? '');
      case TokenType.USAD:
        return this.buildCreateParlayUsadInputs(legs, stake, ticketNonce, tokenRecordOrCredits, merkleProofs ?? '');
      default:
        return this.buildCreateParlayAleoInputs(legs, stake, ticketNonce, tokenRecordOrCredits);
    }
  }

  /**
   * Build inputs for submit_resolution transition.
   */
  buildSubmitResolutionInputs(
    parlayId: string,
    winningOutcomes: [number, number, number, number],
  ): ParlayTransactionInputs {
    return {
      programId: this.programId,
      functionName: 'submit_resolution',
      inputs: [
        parlayId.endsWith('field') ? parlayId : `${parlayId}field`,
        `${winningOutcomes[0]}u8`,
        `${winningOutcomes[1]}u8`,
        `${winningOutcomes[2]}u8`,
        `${winningOutcomes[3]}u8`,
      ],
    };
  }

  /**
   * Build inputs for finalize_parlay transition.
   */
  buildFinalizeParlayInputs(parlayId: string): ParlayTransactionInputs {
    return {
      programId: this.programId,
      functionName: 'finalize_parlay',
      inputs: [parlayId.endsWith('field') ? parlayId : `${parlayId}field`],
    };
  }

  /**
   * Build inputs for redeem_parlay (auto-selects token variant).
   */
  buildRedeemParlayInputs(ticketRecord: string, tokenType: TokenType): ParlayTransactionInputs {
    const functionName =
      tokenType === TokenType.USDCX ? 'redeem_parlay_usdcx'
        : tokenType === TokenType.USAD ? 'redeem_parlay_usad'
          : 'redeem_parlay_aleo';
    return {
      programId: this.programId,
      functionName,
      inputs: [ticketRecord],
    };
  }

  /**
   * Build inputs for cancel_parlay (auto-selects token variant).
   */
  buildCancelParlayInputs(ticketRecord: string, tokenType: TokenType): ParlayTransactionInputs {
    const functionName =
      tokenType === TokenType.USDCX ? 'cancel_parlay_usdcx'
        : tokenType === TokenType.USAD ? 'cancel_parlay_usad'
          : 'cancel_parlay_aleo';
    return {
      programId: this.programId,
      functionName,
      inputs: [ticketRecord],
    };
  }

  /**
   * Build inputs for dispute_parlay_resolution.
   */
  buildDisputeInputs(parlayId: string, creditsRecord: string): ParlayTransactionInputs {
    return {
      programId: this.programId,
      functionName: 'dispute_parlay_resolution',
      inputs: [
        creditsRecord,
        parlayId.endsWith('field') ? parlayId : `${parlayId}field`,
      ],
    };
  }

  /**
   * Build inputs for fund_pool (auto-selects token variant).
   */
  buildFundPoolInputs(
    amount: bigint,
    tokenType: TokenType,
    tokenRecordOrCredits: string,
    merkleProofs?: string,
  ): ParlayTransactionInputs {
    const amountStr = `${amount}u128`;
    switch (tokenType) {
      case TokenType.USDCX:
        return {
          programId: this.programId,
          functionName: 'fund_pool_usdcx',
          inputs: [tokenRecordOrCredits, merkleProofs ?? '', amountStr],
        };
      case TokenType.USAD:
        return {
          programId: this.programId,
          functionName: 'fund_pool_usad',
          inputs: [tokenRecordOrCredits, merkleProofs ?? '', amountStr],
        };
      default:
        return {
          programId: this.programId,
          functionName: 'fund_pool_aleo',
          inputs: [tokenRecordOrCredits, amountStr],
        };
    }
  }

  /**
   * Build inputs for claim_dispute_bond.
   */
  buildClaimDisputeBondInputs(parlayId: string): ParlayTransactionInputs {
    return {
      programId: this.programId,
      functionName: 'claim_dispute_bond',
      inputs: [parlayId.endsWith('field') ? parlayId : `${parlayId}field`],
    };
  }

  /**
   * Build inputs for submit_cancel_proof.
   */
  buildSubmitCancelProofInputs(parlayId: string, cancelledMarketId: string): ParlayTransactionInputs {
    return {
      programId: this.programId,
      functionName: 'submit_cancel_proof',
      inputs: [
        parlayId.endsWith('field') ? parlayId : `${parlayId}field`,
        cancelledMarketId.endsWith('field') ? cancelledMarketId : `${cancelledMarketId}field`,
      ],
    };
  }

  /**
   * Build inputs for withdraw_pool (admin, auto-selects token variant).
   */
  buildWithdrawPoolInputs(amount: bigint, tokenType: TokenType): ParlayTransactionInputs {
    const functionName =
      tokenType === TokenType.USDCX ? 'withdraw_pool_usdcx'
        : tokenType === TokenType.USAD ? 'withdraw_pool_usad'
          : 'withdraw_pool_aleo';
    return {
      programId: this.programId,
      functionName,
      inputs: [`${amount}u128`],
    };
  }

  /**
   * Build inputs for withdraw_treasury (admin, auto-selects token variant).
   */
  buildWithdrawTreasuryInputs(amount: bigint, tokenType: TokenType): ParlayTransactionInputs {
    const functionName =
      tokenType === TokenType.USDCX ? 'withdraw_treasury_usdcx'
        : tokenType === TokenType.USAD ? 'withdraw_treasury_usad'
          : 'withdraw_treasury_aleo';
    return {
      programId: this.programId,
      functionName,
      inputs: [`${amount}u128`],
    };
  }

  // ==========================================================================
  // RPC Helpers
  // ==========================================================================

  /**
   * Fetch a mapping value from the parlay program.
   */
  async getMappingValue(mapping: string, key: string): Promise<string | null> {
    try {
      const response = await fetch(
        `${this.rpcUrl}/program/${this.programId}/mapping/${mapping}/${key}`,
      );
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  /**
   * Fetch parlay pool balance for a token type.
   */
  async getPoolBalance(tokenType: TokenType): Promise<bigint> {
    const value = await this.getMappingValue('parlay_pool', `${tokenType}u8`);
    if (!value) return 0n;
    return BigInt(value.replace('u128', ''));
  }

  /**
   * Fetch total exposure for a token type.
   */
  async getTotalExposure(tokenType: TokenType): Promise<bigint> {
    const value = await this.getMappingValue('total_exposure', `${tokenType}u8`);
    if (!value) return 0n;
    return BigInt(value.replace('u128', ''));
  }

  /**
   * Fetch parlay data by ID.
   */
  async getParlay(parlayId: string): Promise<ParlayData | null> {
    const key = parlayId.endsWith('field') ? parlayId : `${parlayId}field`;
    const raw = await this.getMappingValue('parlays', key);
    if (!raw) return null;
    return this.parseParlayData(raw, parlayId);
  }

  /**
   * Fetch pool stats for a token type.
   */
  async getPoolStats(tokenType: TokenType): Promise<{
    pool: bigint;
    exposure: bigint;
    available: bigint;
  }> {
    const [pool, exposure] = await Promise.all([
      this.getPoolBalance(tokenType),
      this.getTotalExposure(tokenType),
    ]);
    return {
      pool,
      exposure,
      available: pool > exposure ? pool - exposure : 0n,
    };
  }

  // ==========================================================================
  // Parsers
  // ==========================================================================

  /**
   * Parse ParlayTicket record from wallet.
   */
  parseParlayTicketRecord(record: Record<string, string>): {
    parlayId: string;
    stake: bigint;
    potentialPayout: bigint;
    tokenType: TokenType;
    ticketNonce: string;
  } {
    return {
      parlayId: record.parlay_id ?? '',
      stake: BigInt(record.stake?.replace('u128', '') ?? '0'),
      potentialPayout: BigInt(record.potential_payout?.replace('u128', '') ?? '0'),
      tokenType: parseInt(record.token_type?.replace('u8', '') ?? '1') as TokenType,
      ticketNonce: record.ticket_nonce ?? '',
    };
  }

  // ==========================================================================
  // Internal Helpers
  // ==========================================================================

  private padLegs(legs: ParlayLeg[]): (ParlayLeg | null)[] {
    const padded: (ParlayLeg | null)[] = [...legs];
    while (padded.length < 4) padded.push(null);
    return padded;
  }

  private parseParlayData(raw: string, parlayId: string): ParlayData | null {
    try {
      const getString = (field: string): string => {
        const match = raw.match(new RegExp(`${field}:\\s*([^,}]+)`));
        return match?.[1]?.trim() ?? '';
      };
      const getNumber = (field: string): number => {
        const str = getString(field).replace(/u\d+$/, '');
        return parseInt(str) || 0;
      };
      const getBigInt = (field: string): bigint => {
        const str = getString(field).replace(/u\d+$/, '');
        return BigInt(str || '0');
      };

      return {
        parlayId: getString('parlay_id') || parlayId,
        owner: getString('owner'),
        numLegs: getNumber('num_legs'),
        stake: getBigInt('stake'),
        potentialPayout: getBigInt('potential_payout'),
        tokenType: getNumber('token_type') as TokenType,
        status: getNumber('status') as ParlayStatus,
        createdAt: getBigInt('created_at'),
        resolutionSubmittedAt: getBigInt('resolution_submitted_at'),
      };
    } catch {
      return null;
    }
  }
}

/**
 * Create a ParlayClient with default config.
 */
export function createParlayClient(config?: ParlayClientConfig): ParlayClient {
  return new ParlayClient(config);
}
