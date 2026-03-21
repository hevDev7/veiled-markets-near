// ============================================================================
// VEILED MARKETS — Record Scanner Integration
// ============================================================================
// Uses ProvableHQ Record Scanner SDK to discover and fetch records
// across all programs (credits, USDCX, USAD, governance).
// Fallback: wallet adapter methods if scanner unavailable.
// ============================================================================

import { config } from './config';
import { devLog, devWarn } from './logger';

// Scanner URL for testnet/mainnet
const SCANNER_URL = config.network === 'mainnet'
  ? 'https://api.provable.com/scanner/mainnet'
  : 'https://api.provable.com/scanner/testnet';

// Cache scanner instance + UUID per session
let scannerInstance: any = null;
let scannerUuid: string | null = null;
let scannerInitPromise: Promise<void> | null = null;

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize the record scanner with the user's view key.
 * Caches the scanner and UUID for the session.
 */
async function initScanner(): Promise<{ scanner: any; uuid: string } | null> {
  // Already initialized
  if (scannerInstance && scannerUuid) {
    return { scanner: scannerInstance, uuid: scannerUuid };
  }

  // Prevent concurrent initialization
  if (scannerInitPromise) {
    await scannerInitPromise;
    if (scannerInstance && scannerUuid) {
      return { scanner: scannerInstance, uuid: scannerUuid };
    }
    return null;
  }

  scannerInitPromise = (async () => {
    try {
      // Dynamic import to avoid loading WASM at startup
      const sdk = await import('@provablehq/sdk');
      const { RecordScanner, Account } = sdk;

      // Get view key — prefer env dev key, fallback to wallet
      let viewKey: any = null;

      // Method 1: Dev view key from env
      const devPrivateKey = config.devPrivateKey;
      if (devPrivateKey) {
        try {
          const account = new Account({ privateKey: devPrivateKey });
          viewKey = account.viewKey();
          devLog('[RecordScanner] Using dev account view key');
        } catch {
          devWarn('[RecordScanner] Failed to create account from dev private key');
        }
      }

      // Method 2: Shield wallet view key via window.shield
      if (!viewKey) {
        const shieldApi = (window as any).shield;
        if (shieldApi?.getViewKey) {
          try {
            const vk = await shieldApi.getViewKey();
            if (vk) {
              viewKey = vk;
              devLog('[RecordScanner] Using Shield wallet view key');
            }
          } catch {
            devWarn('[RecordScanner] Shield getViewKey failed');
          }
        }
      }

      if (!viewKey) {
        devWarn('[RecordScanner] No view key available — scanner disabled');
        return;
      }

      // Create scanner
      const scanner = new RecordScanner({ url: SCANNER_URL });

      // Register view key (start from block 0 to scan all history)
      const result = await scanner.register(viewKey, 0);
      const uuid = result?.uuid || result?.data?.uuid;

      if (!uuid) {
        devWarn('[RecordScanner] Registration failed — no UUID returned');
        return;
      }

      scannerInstance = scanner;
      scannerUuid = uuid;
      devLog('[RecordScanner] Initialized successfully, UUID:', uuid);
    } catch (err) {
      devWarn('[RecordScanner] Init failed:', err);
    }
  })();

  await scannerInitPromise;
  scannerInitPromise = null;

  if (scannerInstance && scannerUuid) {
    return { scanner: scannerInstance, uuid: scannerUuid };
  }
  return null;
}

/**
 * Reset scanner (call on wallet disconnect)
 */
export function resetScanner(): void {
  scannerInstance = null;
  scannerUuid = null;
  scannerInitPromise = null;
  devLog('[RecordScanner] Reset');
}

// ============================================================================
// Record Fetching
// ============================================================================

export interface ScannedRecord {
  plaintext: string;
  ciphertext?: string;
  programName?: string;
  recordName?: string;
  commitment?: string;
  spent?: boolean;
  blockHeight?: number;
  transactionId?: string;
}

/**
 * Find unspent records for a specific program and record type.
 */
export async function findRecords(
  programId: string,
  recordName?: string,
): Promise<ScannedRecord[]> {
  const ctx = await initScanner();
  if (!ctx) return [];

  try {
    const filter: any = {
      uuid: ctx.uuid,
      unspent: true,
      decrypt: true,
      filter: {
        program: programId,
        ...(recordName ? { record: recordName } : {}),
      },
    };

    devLog(`[RecordScanner] Finding records: ${programId}/${recordName || '*'}`);
    const records = await ctx.scanner.findRecords(filter);

    if (!Array.isArray(records) || records.length === 0) {
      devLog(`[RecordScanner] No records found for ${programId}`);
      return [];
    }

    devLog(`[RecordScanner] Found ${records.length} records for ${programId}`);

    return records.map((r: any) => ({
      plaintext: r.record_plaintext || '',
      ciphertext: r.record_ciphertext || '',
      programName: r.program_name || programId,
      recordName: r.record_name || recordName,
      commitment: r.commitment,
      spent: r.spent,
      blockHeight: r.block_height,
      transactionId: r.transaction_id,
    }));
  } catch (err) {
    devWarn(`[RecordScanner] findRecords failed for ${programId}:`, err);
    return [];
  }
}

/**
 * Find a credits record with at least the specified amount.
 */
export async function findCreditsRecord(minMicrocredits: number): Promise<string | null> {
  const ctx = await initScanner();
  if (!ctx) return null;

  try {
    devLog(`[RecordScanner] Finding credits record >= ${minMicrocredits / 1_000000} ALEO`);
    const record = await ctx.scanner.findCreditsRecord(minMicrocredits, {
      uuid: ctx.uuid,
      unspent: true,
      decrypt: true,
    });

    if (record?.record_plaintext) {
      devLog(`[RecordScanner] Found credits record`);
      return record.record_plaintext;
    }
    return null;
  } catch (err) {
    devWarn('[RecordScanner] findCreditsRecord failed:', err);
    return null;
  }
}

// ============================================================================
// Token Balance Helpers
// ============================================================================

/**
 * Parse token amount from a record plaintext string.
 * Works for credits (microcredits field) and stablecoin Token (amount field).
 */
function parseAmountFromPlaintext(plaintext: string): bigint {
  const patterns = [
    /microcredits:\s*(\d+)u64/,
    /amount:\s*(\d+)u128/,
    /amount:\s*(\d+)u64/,
    /amount:\s*(\d+)/,
  ];
  for (const pattern of patterns) {
    const match = plaintext.match(pattern);
    if (match) return BigInt(match[1]);
  }
  return 0n;
}

/**
 * Get total private balance for a token program by scanning records.
 */
export async function getPrivateBalance(
  programId: string,
  recordName: string = 'Token',
): Promise<bigint> {
  const records = await findRecords(programId, recordName);
  let total = 0n;
  for (const r of records) {
    if (r.plaintext && !r.spent) {
      total += parseAmountFromPlaintext(r.plaintext);
    }
  }
  return total;
}

/**
 * Get all token balances using record scanner.
 * Returns private balances for ALEO, USDCX, and USAD.
 */
export async function getAllPrivateBalances(): Promise<{
  aleoPrivate: bigint;
  usdcxPrivate: bigint;
  usadPrivate: bigint;
}> {
  const [aleoRecords, usdcxRecords, usadRecords] = await Promise.all([
    findRecords('credits.aleo', 'credits'),
    findRecords(config.usdcxProgramId, 'Token'),
    findRecords('test_usad_stablecoin.aleo', 'Token'),
  ]);

  const sum = (records: ScannedRecord[]) =>
    records.reduce((acc, r) => acc + (r.spent ? 0n : parseAmountFromPlaintext(r.plaintext)), 0n);

  return {
    aleoPrivate: sum(aleoRecords),
    usdcxPrivate: sum(usdcxRecords),
    usadPrivate: sum(usadRecords),
  };
}

// ============================================================================
// Governance Record Discovery
// ============================================================================

/**
 * Find VoteLock records for the current user.
 */
export async function findVoteLocks(): Promise<ScannedRecord[]> {
  return findRecords(config.governanceProgramId, 'VoteLock');
}

/**
 * Find ResolverStakeReceipt record for unstaking.
 */
export async function findResolverStakeReceipt(): Promise<string | null> {
  const records = await findRecords(config.governanceProgramId, 'ResolverStakeReceipt');
  if (records.length === 0) return null;
  // Return the first unspent receipt
  const unspent = records.find(r => !r.spent && r.plaintext);
  return unspent?.plaintext || null;
}

// ============================================================================
// Stablecoin Token Record Discovery
// ============================================================================

/**
 * Find a USDCX Token record with at least the specified amount.
 */
export async function findUsdcxTokenRecord(minAmount: bigint): Promise<string | null> {
  const records = await findRecords(config.usdcxProgramId, 'Token');
  for (const r of records) {
    if (!r.spent && r.plaintext) {
      const amount = parseAmountFromPlaintext(r.plaintext);
      if (amount >= minAmount) return r.plaintext;
    }
  }
  return null;
}

/**
 * Find a USAD Token record with at least the specified amount.
 */
export async function findUsadTokenRecord(minAmount: bigint): Promise<string | null> {
  const records = await findRecords('test_usad_stablecoin.aleo', 'Token');
  for (const r of records) {
    if (!r.spent && r.plaintext) {
      const amount = parseAmountFromPlaintext(r.plaintext);
      if (amount >= minAmount) return r.plaintext;
    }
  }
  return null;
}

/**
 * Find OutcomeShare records for a specific market program.
 */
export async function findOutcomeShares(programId?: string): Promise<ScannedRecord[]> {
  const pid = programId || config.programId;
  return findRecords(pid, 'OutcomeShare');
}

/**
 * Find LPToken records for a specific market program.
 */
export async function findLPTokens(programId?: string): Promise<ScannedRecord[]> {
  const pid = programId || config.programId;
  return findRecords(pid, 'LPToken');
}

// ============================================================================
// Scanner Status
// ============================================================================

/**
 * Check if the record scanner is available and initialized.
 */
export function isScannerReady(): boolean {
  return scannerInstance !== null && scannerUuid !== null;
}

/**
 * Check scanner indexing status.
 */
export async function getScannerStatus(): Promise<{ ready: boolean; progress?: number } | null> {
  const ctx = await initScanner();
  if (!ctx) return null;

  try {
    const status = await ctx.scanner.checkStatus();
    return {
      ready: status?.status === 'complete' || status?.status === 'ready',
      progress: status?.progress,
    };
  } catch {
    return null;
  }
}
