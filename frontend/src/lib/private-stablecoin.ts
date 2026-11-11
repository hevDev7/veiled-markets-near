// ============================================================================
// PRIVATE STABLECOIN — Two-Transaction Private Buy Flow
// ============================================================================
// Enables private USDCX/USAD buys via two sequential transactions:
//   TX1: User → stablecoin/transfer_private_to_public (private Token deposit)
//   TX2: User → market/buy_shares_usdcx (from program's public balance)
//
// This bypasses the snarkVM MerkleProof parser bug by calling the stablecoin
// contract directly for the private transfer (TX1), then calling the market
// contract with no token input needed (TX2).
// ============================================================================

import { config } from './config';
import { buildDefaultMerkleProofs } from './aleo-client';
import { devLog } from './logger';

const RESERVED_TOKEN_RECORDS = new Map<string, number>();
const RESERVED_TOKEN_RECORD_TTL_MS = 3 * 60 * 1000;

function cleanupReservedTokenRecords(): void {
  const now = Date.now();
  for (const [key, expiresAt] of RESERVED_TOKEN_RECORDS.entries()) {
    if (expiresAt <= now) RESERVED_TOKEN_RECORDS.delete(key);
  }
}

function makeReservedTokenKey(tokenType: 'USDCX' | 'USAD', record: string): string {
  return `${tokenType}:${record.trim()}`;
}

export function reserveTokenRecord(tokenType: 'USDCX' | 'USAD', record: string, ttlMs: number = RESERVED_TOKEN_RECORD_TTL_MS): void {
  cleanupReservedTokenRecords();
  RESERVED_TOKEN_RECORDS.set(makeReservedTokenKey(tokenType, record), Date.now() + ttlMs);
}

export function releaseTokenRecord(tokenType: 'USDCX' | 'USAD', record: string): void {
  RESERVED_TOKEN_RECORDS.delete(makeReservedTokenKey(tokenType, record));
}








/**
 * Get the stablecoin program ID for a token type.
 */
function getStablecoinProgramId(tokenType: 'USDCX' | 'USAD'): string {
  return tokenType === 'USAD' ? 'test_usad_stablecoin.aleo' : config.usdcxProgramId;
}

/**
 * Get the market program ID for a token type.
 */
function getMarketProgramId(tokenType: 'USDCX' | 'USAD'): string {
  return tokenType === 'USAD' ? config.usadProgramId : config.usdcxMarketProgramId;
}

/**
 * Build inputs for TX1: transfer_private_to_public on the stablecoin contract.
 * This deposits private Token record to the market program's public balance.
 *
 * Stablecoin function signature:
 *   transfer_private_to_public(
 *     recipient: address.public,    // market program address
 *     amount: u128.public,          // amount to deposit
 *     token: Token.record,          // user's private Token record
 *     merkle_proofs: [MerkleProof; 2].private  // freeze-list proofs
 *   )
 */
export function buildPrivateDepositInputs(
  tokenType: 'USDCX' | 'USAD',
  amount: bigint,
  tokenRecord: string,
): { program: string; functionName: string; inputs: string[] } {
  const marketProgramAddress = getMarketProgramId(tokenType);
  const merkleProofs = buildDefaultMerkleProofs();

  return {
    program: getStablecoinProgramId(tokenType),
    functionName: 'transfer_private_to_public',
    inputs: [
      marketProgramAddress,  // recipient = market program
      `${amount}u128`,       // amount
      tokenRecord,           // private Token record
      merkleProofs,          // [MerkleProof; 2]
    ],
  };
}

/**
 * A spendable stablecoin balance record for private betting: the account's private notes of the token plus its
 * NEP-141 wallet balance (the executor shields the shortfall in the same flow).
 */
export async function findTokenRecord(
  tokenType: 'USDCX' | 'USAD',
  minAmount: bigint,
): Promise<string | null> {
  const { spendableRecord } = await import('./near/wallet-records');
  return spendableRecord(tokenType === 'USAD' ? 3 : 2, minAmount);
}

/**
 * Execute two-transaction private stablecoin buy.
 *
 * @param executeTransaction - The wallet's executeTransaction function
 * @param tokenType - 'USDCX' or 'USAD'
 * @param amount - Amount in microcredits (u128)
 * @param buyInputs - Inputs for the buy_shares transaction (TX2)
 * @param buyFunctionName - Function name for TX2 (e.g., 'buy_shares_usdcx')
 * @param onProgress - Progress callback
 *
 * @returns Transaction result from TX2 (the actual buy)
 */
export async function executePrivateStablecoinBuy(
  executeTransaction: (options: any) => Promise<any>,
  tokenType: 'USDCX' | 'USAD',
  amount: bigint,
  buyInputs: string[],
  buyFunctionName: string,
  onProgress?: (step: 'finding_token' | 'depositing' | 'buying' | 'done', message: string) => void,
): Promise<any> {
  const label = tokenType;

  // Step 1: Find Token record
  onProgress?.('finding_token', `Finding private ${label} Token record...`);
  const tokenRecord = await findTokenRecord(tokenType, amount);
  if (!tokenRecord) {
    throw new Error(
      `No private ${label} Token record found with at least ${Number(amount) / 1_000000} ${label}. ` +
      `You need private ${label} balance (Token records). ` +
      `If you only have public ${label}, use the public buy option.`
    );
  }

  // Step 2: TX1 — Deposit private Token to program's public balance
  onProgress?.('depositing', `Depositing ${Number(amount) / 1_000000} ${label} privately (TX 1/2)...`);
  const depositTx = buildPrivateDepositInputs(tokenType, amount, tokenRecord);

  devLog(`[PrivateStablecoin] TX1: ${depositTx.program}/${depositTx.functionName}`);
  devLog(`[PrivateStablecoin] TX1 inputs:`, depositTx.inputs.map((i, idx) =>
    idx === 2 ? `[Token record ${i.length} chars]` : idx === 3 ? `[MerkleProof]` : i
  ));

  const tx1Result = await executeTransaction({
    program: depositTx.program,
    function: depositTx.functionName,
    inputs: depositTx.inputs,
    fee: 1.5,
    recordIndices: [2],
  });

  devLog(`[PrivateStablecoin] TX1 complete:`, tx1Result);

  // Wait for TX1 to be confirmed before TX2
  // The deposit needs to land on-chain so the program has public balance
  onProgress?.('depositing', `Waiting for deposit confirmation...`);
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Step 3: TX2 — Buy shares using program's public balance
  onProgress?.('buying', `Buying shares with ${label} (TX 2/2)...`);
  const marketProgram = getMarketProgramId(tokenType);

  devLog(`[PrivateStablecoin] TX2: ${marketProgram}/${buyFunctionName}`);

  const tx2Result = await executeTransaction({
    program: marketProgram,
    function: buyFunctionName,
    inputs: buyInputs,
    fee: 0.5,
    recordIndices: buyInputs.length > 6 ? [6] : undefined,
  });

  devLog(`[PrivateStablecoin] TX2 complete:`, tx2Result);
  onProgress?.('done', `Private ${label} buy completed!`);

  return tx2Result;
}
