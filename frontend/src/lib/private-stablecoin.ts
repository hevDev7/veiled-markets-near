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
import { devLog, devWarn } from './logger';

function isTokenRecordPlaintext(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed.startsWith('{')) return false;
  if (trimmed.startsWith('{"')) return false;
  if (!trimmed.includes('owner')) return false;
  if (!trimmed.includes('amount')) return false;
  if (trimmed.includes('microcredits')) return false;
  return true;
}

function extractTokenPlaintext(record: unknown): string | null {
  if (typeof record === 'string') {
    return isTokenRecordPlaintext(record) ? record.trim() : null;
  }

  if (!record || typeof record !== 'object') return null;

  const candidateKeys = [
    'plaintext',
    'recordPlaintext',
    'record_plaintext',
    'data',
    'content',
  ];

  for (const key of candidateKeys) {
    const value = (record as Record<string, unknown>)[key];
    if (value == null) continue;
    const text = String(value);
    if (isTokenRecordPlaintext(text)) return text.trim();
  }

  for (const value of Object.values(record as Record<string, unknown>)) {
    if (value == null) continue;
    const text = String(value);
    if (isTokenRecordPlaintext(text)) return text.trim();
  }

  return null;
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
 * Find a Token record for USDCX or USAD with sufficient balance.
 * Tries multiple strategies: wallet adapter, direct wallet API, record scanner.
 */
export async function findTokenRecord(
  tokenType: 'USDCX' | 'USAD',
  minAmount: bigint,
): Promise<string | null> {
  const programId = getStablecoinProgramId(tokenType);
  const label = tokenType;

  devLog(`[PrivateStablecoin] Finding ${label} Token record >= ${Number(minAmount) / 1_000000}`);

  // Strategy 1: Wallet adapter requestRecordPlaintexts
  const requestPlaintexts = (window as any).__aleoRequestRecordPlaintexts;
  if (typeof requestPlaintexts === 'function') {
    try {
      devLog(`[PrivateStablecoin] Strategy 1: adapter requestRecordPlaintexts(${programId})`);
      const records = await requestPlaintexts(programId);
      const arr = Array.isArray(records) ? records : (records?.records || []);

      for (const r of arr) {
        if ((r as any)?.spent === true) continue;
        const plaintext = extractTokenPlaintext(r);
        if (!plaintext) continue;

        const match = plaintext.match(/amount\s*:\s*(\d+)u128/);
        if (!match) continue;

        const amt = BigInt(match[1]);
        if (amt >= minAmount) {
          devLog(`[PrivateStablecoin] Found ${label} Token via plaintext API: ${Number(amt) / 1_000000}`);
          return plaintext;
        }
      }
    } catch (err) {
      devWarn(`[PrivateStablecoin] Strategy 1 failed:`, err);
    }
  }

  // Strategy 2: Wallet adapter requestRecords
  const requestRecords = (window as any).__aleoRequestRecords;
  if (typeof requestRecords === 'function') {
    try {
      devLog(`[PrivateStablecoin] Strategy 2: adapter requestRecords(${programId})`);
      const records = await requestRecords(programId, true);
      const arr = Array.isArray(records) ? records : (records?.records || []);

      for (const r of arr) {
        // Skip spent records
        if ((r as any)?.spent === true) continue;

        const plaintext = extractTokenPlaintext(r);
        if (!plaintext) continue;

        // Parse amount
        const match = plaintext.match(/amount\s*:\s*(\d+)u128/);
        if (match) {
          const amt = BigInt(match[1]);
          if (amt >= minAmount) {
            devLog(`[PrivateStablecoin] Found ${label} Token: ${Number(amt) / 1_000000}`);
            return plaintext;
          }
        }
      }
    } catch (err) {
      devWarn(`[PrivateStablecoin] Strategy 2 failed:`, err);
    }
  }

  // Strategy 3: Direct wallet object (Shield/Leo/Fox)
  const walletObjs: Array<{ name: string; obj: any }> = [];
  const shieldObj = (window as any).shield || (window as any).shieldWallet;
  if (shieldObj) walletObjs.push({ name: 'Shield', obj: shieldObj });

  for (const { name, obj } of walletObjs) {
    if (typeof obj.requestRecordPlaintexts === 'function') {
      try {
        devLog(`[PrivateStablecoin] Strategy 3a: ${name} requestRecordPlaintexts(${programId})`);
        const result = await obj.requestRecordPlaintexts(programId);
        const arr = Array.isArray(result) ? result : (result?.records || []);

        for (const r of arr) {
          if ((r as any)?.spent === true) continue;
          const plaintext = extractTokenPlaintext(r);
          if (!plaintext) continue;

          const match = plaintext.match(/amount\s*:\s*(\d+)u128/);
          if (match && BigInt(match[1]) >= minAmount) {
            devLog(`[PrivateStablecoin] Found via ${name} plaintext API: ${Number(BigInt(match[1])) / 1_000000} ${label}`);
            return plaintext;
          }
        }
      } catch (err) {
        devWarn(`[PrivateStablecoin] Strategy 3a ${name} failed:`, err);
      }
    }

    if (typeof obj.requestRecords === 'function') {
      try {
        devLog(`[PrivateStablecoin] Strategy 3b: ${name} requestRecords(${programId})`);
        const result = await obj.requestRecords(programId, true);
        const arr = Array.isArray(result) ? result : (result?.records || []);

        for (const r of arr) {
          if ((r as any)?.spent === true) continue;
          const plaintext = extractTokenPlaintext(r);
          if (!plaintext) continue;

          const match = plaintext.match(/amount\s*:\s*(\d+)u128/);
          if (match && BigInt(match[1]) >= minAmount) {
            devLog(`[PrivateStablecoin] Found via ${name}: ${Number(BigInt(match[1])) / 1_000000} ${label}`);
            return plaintext;
          }
        }
      } catch (err) {
        devWarn(`[PrivateStablecoin] Strategy 3b ${name} failed:`, err);
      }
    }
  }

  // Strategy 4: Record Scanner SDK
  try {
    const { findUsdcxTokenRecord, findUsadTokenRecord } = await import('./record-scanner');
    const record = tokenType === 'USAD'
      ? await findUsadTokenRecord(minAmount)
      : await findUsdcxTokenRecord(minAmount);
    if (record) {
      devLog(`[PrivateStablecoin] Found via scanner: ${label}`);
      return record;
    }
  } catch {
    devLog(`[PrivateStablecoin] Scanner fallback unavailable`);
  }

  devWarn(`[PrivateStablecoin] No ${label} Token record found >= ${Number(minAmount) / 1_000000}`);
  return null;
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
