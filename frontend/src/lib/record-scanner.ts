// ============================================================================
// VEILED MARKETS — Record Scanner Integration
// ============================================================================
// Uses ProvableHQ Record Scanner SDK to discover and fetch records
// across all programs (credits, USDCX, USAD, governance).
// Fallback: wallet adapter methods if scanner unavailable.
// ============================================================================

import { config } from './config';
import { walletManager } from './wallet';
import { getCurrentBlockHeight } from './aleo-client';
import { devLog, devWarn } from './logger';

// Scanner URL for testnet/mainnet
const SCANNER_URL = config.network === 'mainnet'
  ? 'https://api.provable.com/scanner/mainnet'
  : 'https://api.provable.com/scanner/testnet';

const SCANNER_STATUS_TTL_MS = 15_000;
const SCANNER_CACHE_VERSION = 2;
const SCANNER_STORAGE_PREFIX = `veiled-markets:record-scanner:v${SCANNER_CACHE_VERSION}`;
const VEILED_PROGRAM_QUERY_START_BLOCK = config.network === 'mainnet' ? 0 : 14_367_415;

const OWNED_RECORD_RESPONSE_FILTER = {
  commitment: true,
  owner: true,
  tag: true,
  sender: true,
  spent: true,
  record_ciphertext: true,
  block_height: true,
  block_timestamp: true,
  output_index: true,
  record_name: true,
  function_name: true,
  program_name: true,
  transition_id: true,
  transaction_id: true,
  transaction_index: true,
  transition_index: true,
} as const;

const PROGRAM_QUERY_START_HINTS = new Set<string>([
  config.programId,
  config.usdcxMarketProgramId,
  config.usadProgramId,
  config.governanceProgramId,
  config.usdcxProgramId,
  'test_usad_stablecoin.aleo',
]);

interface PersistedScannerState {
  uuid: string;
  ownerKey: string;
  network: string;
  startBlock: number;
  updatedAt: number;
  lastReadyAt: number | null;
}

interface ScannerStatusSnapshot {
  ready: boolean;
  progress: number;
  raw: unknown;
}

interface ScannerContext {
  scanner: any;
  uuid: string;
  ownerKey: string;
  status: ScannerStatusSnapshot | null;
}

// Cache scanner instance + UUID per session
let scannerInstance: any = null;
let scannerUuid: string | null = null;
let scannerOwnerKey: string | null = null;
let scannerInitPromise: Promise<void> | null = null;
let scannerStatusCache: { uuid: string; status: ScannerStatusSnapshot; timestamp: number } | null = null;

function getScannerStorageKey(ownerKey: string): string {
  return `${SCANNER_STORAGE_PREFIX}:${ownerKey}`;
}

function getCurrentScannerOwnerKey(): string {
  const account = walletManager.getAccount();
  const walletType = walletManager.getWalletType() || 'unknown';
  const address = account?.address?.toLowerCase() || config.devAddress?.toLowerCase() || 'anonymous';
  return `${config.network}:${walletType}:${address}`;
}

function loadPersistedScannerState(ownerKey: string): PersistedScannerState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(getScannerStorageKey(ownerKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedScannerState;
    if (!parsed?.uuid || parsed.ownerKey !== ownerKey || parsed.network !== config.network) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function persistScannerState(state: PersistedScannerState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(getScannerStorageKey(state.ownerKey), JSON.stringify(state));
  } catch {
    // Ignore storage quota / private mode errors.
  }
}

function clearPersistedScannerState(ownerKey: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(getScannerStorageKey(ownerKey));
  } catch {
    // Ignore storage cleanup failures.
  }
}

function normalizeScannerStatus(raw: any): ScannerStatusSnapshot {
  const progressValue = [raw?.percentage, raw?.progress]
    .find((value) => typeof value === 'number' && Number.isFinite(value));
  const progress = typeof progressValue === 'number' ? progressValue : 0;
  const ready = raw?.synced === true
    || raw?.ready === true
    || raw?.status === 'complete'
    || progress >= 100;

  return {
    ready,
    progress,
    raw,
  };
}

function getRecordQueryStart(programId?: string): number | undefined {
  if (!programId || programId === 'credits.aleo') return undefined;
  if (PROGRAM_QUERY_START_HINTS.has(programId)) return VEILED_PROGRAM_QUERY_START_BLOCK;
  return undefined;
}

async function fetchScannerStatus(scanner: any, uuid: string, force = false): Promise<ScannerStatusSnapshot | null> {
  if (!uuid) return null;
  if (
    !force
    && scannerStatusCache
    && scannerStatusCache.uuid === uuid
    && Date.now() - scannerStatusCache.timestamp < SCANNER_STATUS_TTL_MS
  ) {
    return scannerStatusCache.status;
  }

  try {
    const status = normalizeScannerStatus(await scanner.checkStatus());
    scannerStatusCache = {
      uuid,
      status,
      timestamp: Date.now(),
    };
    return status;
  } catch (error) {
    devWarn('[RecordScanner] checkStatus failed:', error);
    return null;
  }
}

async function getScannerViewKey(sdk: any): Promise<any | null> {
  const { Account } = sdk;

  if (config.devPrivateKey) {
    try {
      const account = new Account({ privateKey: config.devPrivateKey });
      const viewKey = account.viewKey();
      devLog('[RecordScanner] Using dev account view key');
      return viewKey;
    } catch {
      devWarn('[RecordScanner] Failed to create account from dev private key');
    }
  }

  const shieldApi = (window as any).shield;
  if (shieldApi?.getViewKey) {
    try {
      const viewKey = await shieldApi.getViewKey();
      if (viewKey) {
        devLog('[RecordScanner] Using Shield wallet view key');
        return viewKey;
      }
    } catch {
      devWarn('[RecordScanner] Shield getViewKey failed');
    }
  }

  return null;
}

async function computeRegistrationStartBlock(): Promise<number> {
  try {
    const latest = Number(await getCurrentBlockHeight());
    if (Number.isFinite(latest) && latest > 0) {
      return 0;
    }
  } catch {
    // Fall back to genesis scan if block height lookup fails.
  }
  return 0;
}

async function initScanner(): Promise<ScannerContext | null> {
  const ownerKey = getCurrentScannerOwnerKey();

  if (scannerInstance && scannerUuid && scannerOwnerKey === ownerKey) {
    return {
      scanner: scannerInstance,
      uuid: scannerUuid,
      ownerKey,
      status: await fetchScannerStatus(scannerInstance, scannerUuid),
    };
  }

  if (scannerInitPromise) {
    await scannerInitPromise;
    if (scannerInstance && scannerUuid && scannerOwnerKey === ownerKey) {
      return {
        scanner: scannerInstance,
        uuid: scannerUuid,
        ownerKey,
        status: await fetchScannerStatus(scannerInstance, scannerUuid),
      };
    }
    return null;
  }

  scannerInitPromise = (async () => {
    try {
      const sdk = await import('@provablehq/sdk');
      const { RecordScanner } = sdk;

      const scanner = new RecordScanner({ url: SCANNER_URL }) as any;
      const persisted = loadPersistedScannerState(ownerKey);

      if (persisted?.uuid) {
        try {
          await scanner.setUuid(persisted.uuid);
          const persistedStatus = await fetchScannerStatus(scanner, persisted.uuid, true);
          if (persistedStatus) {
            scannerInstance = scanner;
            scannerUuid = persisted.uuid;
            scannerOwnerKey = ownerKey;
            devLog('[RecordScanner] Reused persisted scanner UUID');
            if (persistedStatus.ready) {
              persistScannerState({
                ...persisted,
                updatedAt: Date.now(),
                lastReadyAt: Date.now(),
              });
            }
            return;
          }
        } catch (error) {
          devWarn('[RecordScanner] Failed to reuse persisted UUID, will try view-key path:', error);
        }
      }

      const viewKey = await getScannerViewKey(sdk);
      if (!viewKey) {
        devWarn('[RecordScanner] No view key available — scanner disabled');
        return;
      }

      try {
        await scanner.setUuid(viewKey);
        const derivedUuid = String(scanner.uuid?.toString?.() ?? scanner.uuid ?? '');
        const existingStatus = derivedUuid
          ? await fetchScannerStatus(scanner, derivedUuid, true)
          : null;

        if (derivedUuid && existingStatus) {
          scannerInstance = scanner;
          scannerUuid = derivedUuid;
          scannerOwnerKey = ownerKey;
          persistScannerState({
            uuid: derivedUuid,
            ownerKey,
            network: config.network,
            startBlock: 0,
            updatedAt: Date.now(),
            lastReadyAt: existingStatus.ready ? Date.now() : null,
          });
          devLog('[RecordScanner] Reused view-key derived UUID from existing scanner job');
          return;
        }
      } catch (error) {
        devWarn('[RecordScanner] setUuid(viewKey) probe failed:', error);
      }

      const startBlock = await computeRegistrationStartBlock();
      const registration = await scanner.register(viewKey, startBlock);
      const uuid = String(registration?.uuid || scanner.uuid?.toString?.() || scanner.uuid || '');

      if (!uuid) {
        devWarn('[RecordScanner] Registration failed — no UUID returned');
        return;
      }

      scannerInstance = scanner;
      scannerUuid = uuid;
      scannerOwnerKey = ownerKey;
      persistScannerState({
        uuid,
        ownerKey,
        network: config.network,
        startBlock,
        updatedAt: Date.now(),
        lastReadyAt: null,
      });
      devLog('[RecordScanner] Registered scanner UUID:', uuid);
    } catch (err) {
      devWarn('[RecordScanner] Init failed:', err);
    }
  })();

  await scannerInitPromise;
  scannerInitPromise = null;

  if (scannerInstance && scannerUuid && scannerOwnerKey === ownerKey) {
    return {
      scanner: scannerInstance,
      uuid: scannerUuid,
      ownerKey,
      status: await fetchScannerStatus(scannerInstance, scannerUuid),
    };
  }
  return null;
}

async function ensureScannerReady(ctx: ScannerContext): Promise<ScannerStatusSnapshot | null> {
  const status = await fetchScannerStatus(ctx.scanner, ctx.uuid, true);
  if (!status) {
    devWarn('[RecordScanner] Scanner status unavailable — skipping scanner results');
    return null;
  }

  if (!status.ready) {
    devLog(`[RecordScanner] Scanner still indexing (${status.progress}% complete)`);
    return status;
  }

  const persisted = loadPersistedScannerState(ctx.ownerKey);
  if (persisted) {
    persistScannerState({
      ...persisted,
      updatedAt: Date.now(),
      lastReadyAt: Date.now(),
    });
  }

  return status;
}

async function validateOwnedRecords(scanner: any, records: any[]): Promise<ScannedRecord[]> {
  if (!Array.isArray(records) || records.length === 0) return [];

  const serialNumbers = records
    .map((record) => record?.serial_number ?? record?.serialNumber)
    .filter((value): value is string => typeof value === 'string' && value.length > 0);
  const tags = records
    .map((record) => record?.tag)
    .filter((value): value is string => typeof value === 'string' && value.length > 0);

  let serialNumberState: Record<string, boolean> = {};
  let tagState: Record<string, boolean> = {};

  if (serialNumbers.length > 0 && typeof scanner.checkSerialNumbers === 'function') {
    try {
      serialNumberState = await scanner.checkSerialNumbers(serialNumbers);
    } catch (error) {
      devWarn('[RecordScanner] checkSerialNumbers failed:', error);
    }
  }

  if (tags.length > 0 && typeof scanner.checkTags === 'function') {
    try {
      tagState = await scanner.checkTags(tags);
    } catch (error) {
      devWarn('[RecordScanner] checkTags failed:', error);
    }
  }

  return records.map((record: any) => {
    const serialNumber = record?.serial_number ?? record?.serialNumber;
    const tag = record?.tag;
    const spent = record?.spent === true
      || (typeof serialNumber === 'string' && serialNumberState[serialNumber] === true)
      || (typeof tag === 'string' && tagState[tag] === true);

    return {
      plaintext: record?.record_plaintext || '',
      ciphertext: record?.record_ciphertext || '',
      programName: record?.program_name,
      recordName: record?.record_name,
      commitment: record?.commitment,
      spent,
      blockHeight: record?.block_height,
      transactionId: record?.transaction_id,
      owner: record?.owner,
      tag: record?.tag,
      serialNumber,
    };
  });
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
  owner?: string;
  tag?: string;
  serialNumber?: string;
}

/**
 * Reset scanner (call on wallet disconnect or wallet change)
 */
export function resetScanner(clearPersisted: boolean = false): void {
  const ownerKey = scannerOwnerKey || getCurrentScannerOwnerKey();
  scannerInstance = null;
  scannerUuid = null;
  scannerOwnerKey = null;
  scannerInitPromise = null;
  scannerStatusCache = null;
  if (clearPersisted) {
    clearPersistedScannerState(ownerKey);
  }
  devLog('[RecordScanner] Reset');
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

  const status = await ensureScannerReady(ctx);
  if (!status?.ready) return [];

  try {
    const startHint = getRecordQueryStart(programId);
    const filter: any = {
      uuid: ctx.uuid,
      unspent: true,
      decrypt: true,
      responseFilter: OWNED_RECORD_RESPONSE_FILTER,
      filter: {
        program: programId,
        ...(recordName ? { record: recordName } : {}),
        ...(typeof startHint === 'number' ? { start: startHint } : {}),
      },
    };

    devLog(
      `[RecordScanner] Finding records: ${programId}/${recordName || '*'}`
      + (typeof startHint === 'number' ? ` from block ${startHint}` : ''),
    );
    const records = await ctx.scanner.findRecords(filter);

    if (!Array.isArray(records) || records.length === 0) {
      devLog(`[RecordScanner] No records found for ${programId}`);
      return [];
    }

    const validated = await validateOwnedRecords(ctx.scanner, records);
    devLog(`[RecordScanner] Found ${validated.length} validated records for ${programId}`);
    return validated;
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

  const status = await ensureScannerReady(ctx);
  if (!status?.ready) return null;

  try {
    devLog(`[RecordScanner] Finding credits record >= ${minMicrocredits / 1_000000} ALEO`);
    const record = await ctx.scanner.findCreditsRecord(minMicrocredits, {
      uuid: ctx.uuid,
      unspent: true,
      decrypt: true,
      responseFilter: OWNED_RECORD_RESPONSE_FILTER,
      filter: {
        start: 0,
        program: 'credits.aleo',
        record: 'credits',
      },
    });

    const [validated] = await validateOwnedRecords(ctx.scanner, record ? [record] : []);
    if (validated?.plaintext && !validated.spent) {
      devLog('[RecordScanner] Found validated credits record');
      return validated.plaintext;
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

  const status = await fetchScannerStatus(ctx.scanner, ctx.uuid, true);
  if (!status) return null;

  return {
    ready: status.ready,
    progress: status.progress,
  };
}
