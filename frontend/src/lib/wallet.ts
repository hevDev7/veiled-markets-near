// ============================================================================
// VEILED MARKETS - Wallet Integration
// ============================================================================
// Wallet integration using ProvableHQ adapters for Leo, Fox, Soter, and Puzzle
// ============================================================================

import {
  connect as puzzleConnect,
  disconnect as puzzleDisconnect,
  getBalance as puzzleGetBalance,
  getRecords as puzzleGetRecords,
  requestCreateEvent,
  getAccount,
  type EventType,
} from '@puzzlehq/sdk';

import { LeoWalletAdapter as ProvableLeoWalletAdapter } from '@provablehq/aleo-wallet-adaptor-leo';
import { FoxWalletAdapter as ProvableFoxWalletAdapter } from '@provablehq/aleo-wallet-adaptor-fox';
import { SoterWalletAdapter as ProvableSoterWalletAdapter } from '@provablehq/aleo-wallet-adaptor-soter';
import { DecryptPermission } from '@provablehq/aleo-wallet-adaptor-core';
import { Network } from '@provablehq/aleo-types';

// Import config for API URLs
import { config } from './config';

export type NetworkType = 'mainnet' | 'testnet';

export interface WalletAccount {
  address: string;
  network: NetworkType;
}

export interface WalletBalance {
  public: bigint;
  private: bigint;
}

export interface TransactionRequest {
  programId: string;
  functionName: string;
  inputs: string[];
  fee: number;
  network?: string;
}

export interface WalletEvents {
  onConnect: (account: WalletAccount) => void;
  onDisconnect: () => void;
  onAccountChange: (account: WalletAccount | null) => void;
  onNetworkChange: (network: NetworkType) => void;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if Puzzle Wallet extension is installed
 */
export function isPuzzleWalletInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  const hasPuzzle = !!(window as any).puzzle || !!(window as any).puzzleWallet;
  const chromeObj = (window as any).chrome;
  const hasExtensionSupport = chromeObj?.runtime?.sendMessage !== undefined;
  return hasPuzzle || hasExtensionSupport;
}

/**
 * Check if Leo Wallet extension is installed
 */
export function isLeoWalletInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as any).leo || !!(window as any).leoWallet;
}

/**
 * Check if Fox Wallet extension is installed
 */
export function isFoxWalletInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as any).foxwallet?.aleo;
}

/**
 * Check if Soter Wallet extension is installed
 */
export function isSoterWalletInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as any).soterWallet || !!(window as any).soter;
}

/**
 * Helper: Create a timeout promise
 */
function createTimeoutPromise<T>(ms: number, message: string): Promise<T> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
}

/**
 * Helper: Race a promise against a timeout
 */
async function withTimeout<T>(promise: Promise<T>, ms: number, timeoutMessage: string): Promise<T> {
  return Promise.race([
    promise,
    createTimeoutPromise<T>(ms, timeoutMessage)
  ]);
}

/**
 * Get available wallet adapters
 */
export function getAvailableWallets(): string[] {
  const wallets: string[] = ['puzzle'];
  if (isLeoWalletInstalled()) wallets.push('leo');
  if (isFoxWalletInstalled()) wallets.push('fox');
  if (isSoterWalletInstalled()) wallets.push('soter');
  return wallets;
}


/**
 * Fetch public balance from API
 */
async function fetchPublicBalance(address: string): Promise<bigint> {
  try {
    const baseUrl = config.rpcUrl || 'https://api.explorer.provable.com/v1/testnet';
    const url = `${baseUrl}/program/credits.aleo/mapping/account/${address}`;
    const response = await fetch(url);

    if (!response.ok) {
      if (response.status === 404) {
        return 0n; // No public balance
      }
      return 0n;
    }

    const data = await response.text();
    const cleanData = data.replace(/"/g, '').trim();
    const match = cleanData.match(/(\d+)/);
    if (match) {
      return BigInt(match[1]);
    }
    return 0n;
  } catch {
    return 0n;
  }
}

// ============================================================================
// PUZZLE WALLET ADAPTER
// ============================================================================

export class PuzzleWalletAdapter {
  private connected: boolean = false;
  private account: WalletAccount | null = null;

  get isInstalled(): boolean {
    return true;
  }

  get isConnected(): boolean {
    return this.connected && !!this.account;
  }

  get currentAccount(): WalletAccount | null {
    return this.account;
  }

  async connect(): Promise<WalletAccount> {
    try {
      console.log('Puzzle Wallet: Attempting to connect...');

      const connectPromise = puzzleConnect({
        dAppInfo: {
          name: 'Veiled Markets',
          description: 'Privacy-Preserving Prediction Markets on Aleo',
          iconUrl: typeof window !== 'undefined' ? window.location.origin + '/favicon.svg' : '',
        },
        permissions: {
          programIds: {
            'AleoTestnet': ['veiled_markets_v9.aleo', 'credits.aleo'],
            'AleoMainnet': ['veiled_markets_v9.aleo', 'credits.aleo'],
          }
        }
      });

      const response = await withTimeout(
        connectPromise,
        10000,
        'Connection timed out. Puzzle Wallet extension may not be installed or is not responding.'
      );

      console.log('Puzzle Wallet: Connect response:', response);

      if (response && response.connection && response.connection.address) {
        this.connected = true;
        const networkStr = response.connection.network || 'AleoTestnet';
        this.account = {
          address: response.connection.address,
          network: networkStr.includes('Mainnet') ? 'mainnet' : 'testnet',
        };

        console.log('Puzzle Wallet: Connected successfully');
        return this.account;
      }

      throw new Error('Connection rejected or no account returned');
    } catch (error: any) {
      console.error('Puzzle Wallet connection error:', error);
      const errorMessage = error?.message || String(error);

      if (errorMessage.includes('timed out') || errorMessage.includes('timeout')) {
        throw new Error(
          'Puzzle Wallet is not responding. Please check:\n' +
          '1. Extension is installed from puzzle.online/wallet\n' +
          '2. Extension is enabled in your browser\n' +
          '3. Wallet is unlocked'
        );
      }

      if (errorMessage.includes('rejected') || errorMessage.includes('denied') || errorMessage.includes('cancelled')) {
        throw new Error('Connection request was rejected by user.');
      }

      throw new Error(errorMessage || 'Failed to connect to Puzzle Wallet');
    }
  }

  async disconnect(): Promise<void> {
    if (this.connected) {
      try {
        await puzzleDisconnect();
      } catch (error) {
        console.error('Disconnect error:', error);
      }
    }
    this.connected = false;
    this.account = null;
  }

  async getBalance(): Promise<WalletBalance> {
    if (!this.connected || !this.account) {
      throw new Error('Wallet not connected');
    }

    try {
      const balance = await puzzleGetBalance({});
      let publicBalance = 0n;
      let privateBalance = 0n;

      console.log('Puzzle Wallet: getBalance response:', JSON.stringify(balance));

      if (balance && (balance as any).balances) {
        for (const b of (balance as any).balances) {
          // Puzzle SDK Balance type: { values: { public: number, private: number }, ... }
          const values = (b as any).values || b;

          if (values.public !== undefined) {
            const pubVal = String(values.public).replace(/[^\d]/g, '');
            if (pubVal) publicBalance += BigInt(pubVal);
          }
          if (values.private !== undefined) {
            const privVal = String(values.private).replace(/[^\d]/g, '');
            if (privVal) privateBalance += BigInt(privVal);
          }
        }
      }

      console.log('Puzzle Wallet: Parsed balance - public:', publicBalance.toString(), 'private:', privateBalance.toString());

      // Try getRecords as fallback for private balance
      if (privateBalance === 0n) {
        try {
          const recordsResponse = await puzzleGetRecords({
            filter: { programIds: ['credits.aleo'], status: 'Unspent' as any },
          });
          console.log('Puzzle Wallet: getRecords response:', JSON.stringify(recordsResponse));

          if (recordsResponse && recordsResponse.records) {
            for (const record of recordsResponse.records) {
              const plaintext = (record as any).plaintext || (record as any).data || JSON.stringify(record);
              const match = String(plaintext).match(/microcredits:\s*(\d+)u64/);
              if (match) {
                privateBalance += BigInt(match[1]);
                console.log('Puzzle Wallet: Found private record:', match[1]);
              }
            }
          }
        } catch (err) {
          console.log('Puzzle Wallet: getRecords fallback failed:', err);
        }
      }

      // Fallback to API for public balance
      if (publicBalance === 0n && this.account?.address) {
        publicBalance = await fetchPublicBalance(this.account.address);
      }

      return { public: publicBalance, private: privateBalance };
    } catch (err) {
      console.warn('Puzzle Wallet: getBalance failed:', err);
      if (this.account?.address) {
        const publicBalance = await fetchPublicBalance(this.account.address);
        return { public: publicBalance, private: 0n };
      }
      return { public: 0n, private: 0n };
    }
  }

  async requestTransaction(request: TransactionRequest): Promise<string> {
    if (!this.connected) {
      throw new Error('Wallet not connected');
    }

    try {
      console.log('Puzzle Wallet: requestTransaction called with:', {
        programId: request.programId,
        functionName: request.functionName,
        fee: request.fee,
        inputs: request.inputs,
      });

      // Validate inputs
      if (!request.inputs || !Array.isArray(request.inputs)) {
        throw new Error('Invalid inputs: must be an array');
      }

      if (request.inputs.length === 0) {
        throw new Error('Invalid inputs: array is empty');
      }

      // Check each input is a string
      for (let i = 0; i < request.inputs.length; i++) {
        if (typeof request.inputs[i] !== 'string') {
          throw new Error(`Invalid input at index ${i}: must be a string, got ${typeof request.inputs[i]}`);
        }
        if (!request.inputs[i]) {
          throw new Error(`Invalid input at index ${i}: empty string`);
        }
      }

      // Puzzle SDK might expect inputs as plain strings array, not objects
      // Let's try the simplest format first
      const eventParams = {
        type: 'Execute' as EventType,
        programId: request.programId,
        functionId: request.functionName,
        fee: request.fee,
        inputs: request.inputs, // Try plain array first
      };

      console.log('Puzzle Wallet: Attempt 1 - Plain array format');
      console.log('Puzzle Wallet: Event params:', JSON.stringify(eventParams, null, 2));

      try {
        const response = await requestCreateEvent(eventParams);
        console.log('Puzzle Wallet: Response:', response);

        if (response && response.eventId) {
          return response.eventId;
        }
      } catch (err: any) {
        console.log('Puzzle Wallet: Plain array format failed, trying object format');

        // If plain array fails, log the error and throw
        console.error('Puzzle Wallet: Plain array format failed:', err);
        throw err;
      }

      throw new Error('Transaction rejected or no event ID returned');
    } catch (error: any) {
      console.error('Puzzle Wallet: requestTransaction error:', error);
      console.error('Puzzle Wallet: Error details:', {
        message: error?.message,
        name: error?.name,
        stack: error?.stack?.substring(0, 500),
      });

      // Check if it's a Zod validation error from Puzzle SDK
      const errorMsg = error?.message || '';
      if (errorMsg.includes('invalid_type') || errorMsg.includes('params') || errorMsg.includes('inputs')) {
        throw new Error(
          'Puzzle Wallet SDK has a known issue with transaction inputs. ' +
          'Please try using Leo Wallet instead. ' +
          'Install from: https://leo.app'
        );
      }

      throw new Error(error.message || 'Transaction failed');
    }
  }

  async getRecords(_programId: string): Promise<any[]> {
    return [];
  }

  async signMessage(_message: string): Promise<string> {
    if (!this.connected) {
      throw new Error('Wallet not connected');
    }
    return `puzzle_sig_${Date.now()}`;
  }

  onAccountChange(callback: (account: WalletAccount | null) => void): () => void {
    const interval = setInterval(async () => {
      try {
        const account = await getAccount() as any;
        if (account && account.address) {
          const newAccount: WalletAccount = {
            address: account.address,
            network: (account.network || 'AleoTestnet').includes('Mainnet') ? 'mainnet' : 'testnet',
          };
          if (this.account?.address !== newAccount.address) {
            this.account = newAccount;
            callback(newAccount);
          }
        }
      } catch {
        // Ignore polling errors
      }
    }, 5000);

    return () => clearInterval(interval);
  }

  onNetworkChange(callback: (network: NetworkType) => void): () => void {
    const interval = setInterval(async () => {
      try {
        const account = await getAccount() as any;
        if (account && account.network) {
          const network: NetworkType = account.network.includes('Mainnet') ? 'mainnet' : 'testnet';
          if (this.account && this.account.network !== network) {
            this.account.network = network;
            callback(network);
          }
        }
      } catch {
        // Ignore polling errors
      }
    }, 5000);

    return () => clearInterval(interval);
  }
}

// ============================================================================
// LEO WALLET ADAPTER (Using ProvableHQ Adapter)
// ============================================================================

export class LeoWalletAdapter {
  private adapter: ProvableLeoWalletAdapter;
  private account: WalletAccount | null = null;

  constructor() {
    this.adapter = new ProvableLeoWalletAdapter({
      appName: 'Veiled Markets',
    });
  }

  get isInstalled(): boolean {
    return this.adapter.readyState === 'Installed' || this.adapter.readyState === 'Loadable';
  }

  get isConnected(): boolean {
    // Check if adapter is connected
    if (!this.adapter.connected) {
      return false;
    }

    // If adapter is connected but account is null, try to restore account
    if (!this.account && this.adapter.account) {
      console.log('Leo Wallet: Restoring account from adapter');
      this.account = {
        address: this.adapter.account.address,
        network: 'testnet',
      };
    }

    return this.adapter.connected;
  }

  get currentAccount(): WalletAccount | null {
    // Try to restore account if null but adapter has account
    if (!this.account && this.adapter.connected && this.adapter.account) {
      this.account = {
        address: this.adapter.account.address,
        network: 'testnet',
      };
    }
    return this.account;
  }

  async connect(): Promise<WalletAccount> {
    try {
      console.log('Leo Wallet: Attempting to connect...');
      console.log('Leo Wallet: readyState:', this.adapter.readyState);

      // Try testnet first (the ProvableHQ adapter uses Network.TESTNET)
      try {
        console.log('Leo Wallet: Trying network testnet...');
        await this.adapter.connect(Network.TESTNET, DecryptPermission.AutoDecrypt, ['veiled_markets_v9.aleo', 'credits.aleo']);

        if (this.adapter.account) {
          console.log('Leo Wallet: Connected successfully');
          this.account = {
            address: this.adapter.account.address,
            network: 'testnet',
          };
          return this.account;
        }
      } catch (err) {
        console.log('Leo Wallet: Failed with network testnet:', err);
        throw err;
      }

      throw new Error('Connection successful but no account returned');
    } catch (error: any) {
      console.error('Leo Wallet connection error:', error);
      const errorMessage = error?.message?.toLowerCase() || '';

      if (errorMessage.includes('user reject') || errorMessage.includes('rejected') || errorMessage.includes('denied')) {
        throw new Error('Connection request was rejected by user.');
      }

      if (errorMessage.includes('not installed') || errorMessage.includes('not found')) {
        throw new Error('Leo Wallet not installed. Please install from https://leo.app');
      }

      throw new Error(error?.message || 'Failed to connect to Leo Wallet');
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.adapter.disconnect();
    } catch (error) {
      console.error('Disconnect error:', error);
    }
    this.account = null;
  }

  async getBalance(): Promise<WalletBalance> {
    if (!this.adapter.connected || !this.account) {
      return { public: 0n, private: 0n };
    }

    let publicBalance = 0n;
    let privateBalance = 0n;

    // Fetch public balance from API
    try {
      publicBalance = await fetchPublicBalance(this.account.address);
      console.log('Leo Wallet: Public balance from API:', publicBalance.toString(), `(${Number(publicBalance) / 1_000_000} ALEO)`);
    } catch (error) {
      console.error('Leo Wallet: Failed to fetch public balance:', error);
    }

    // Try to get balance directly from Leo Wallet window object FIRST
    try {
      console.log('Leo Wallet: Attempting to access window.leoWallet...');
      const leoWallet = (window as any).leoWallet || (window as any).leo;

      if (leoWallet) {
        console.log('Leo Wallet: Found window.leoWallet object');
        console.log('Leo Wallet: Available methods:', Object.keys(leoWallet));

        // Try to get balance from wallet
        if (typeof leoWallet.getBalance === 'function') {
          console.log('Leo Wallet: Calling leoWallet.getBalance()...');
          const walletBalance = await leoWallet.getBalance();
          console.log('Leo Wallet: Wallet balance response:', walletBalance);

          if (walletBalance) {
            // Try to parse the balance - handle number, bigint, or string
            const privVal = walletBalance.private ?? walletBalance.privateBalance;
            if (privVal !== undefined && privVal !== null) {
              const cleaned = String(privVal).replace(/[ui]\d+\.?\w*$/i, '').trim();
              const parsed = BigInt(cleaned.replace(/[^\d]/g, '') || '0');
              if (parsed > 0n) {
                privateBalance = parsed;
                console.log('Leo Wallet: Got private balance from wallet:', privateBalance.toString());
              }
            }
          }
        }

        // Try alternative method - getAccount
        if (privateBalance === 0n && typeof leoWallet.getAccount === 'function') {
          console.log('Leo Wallet: Trying leoWallet.getAccount()...');
          const account = await leoWallet.getAccount();
          console.log('Leo Wallet: Account response:', account);

          if (account && account.balance) {
            if (typeof account.balance.private === 'number' || typeof account.balance.private === 'bigint') {
              privateBalance = BigInt(account.balance.private);
              console.log('Leo Wallet: ✅ Got private balance from account:', privateBalance.toString());
            }
          }
        }
      } else {
        console.log('Leo Wallet: window.leoWallet not found');
      }
    } catch (error) {
      console.warn('Leo Wallet: Failed to access window.leoWallet:', error);
    }

    // Fetch private balance from wallet records
    // Helper to check if a record is spent
    const isRecordSpent = (record: any): boolean => {
      if (!record || typeof record !== 'object') return false;
      // Check common spent indicators
      if (record.spent === true) return true;
      if (record.isSpent === true) return true;
      if (record.status === 'spent' || record.status === 'Spent') return true;
      if (record.recordStatus === 'spent' || record.recordStatus === 'Spent') return true;
      return false;
    };

    // Helper to parse Aleo value - strips type suffixes like u64, u128 before parsing
    const parseAleoU64 = (val: any): bigint => {
      if (typeof val === 'bigint') return val;
      if (typeof val === 'number') return BigInt(val);
      // Strip Leo type suffix (u8, u16, u32, u64, u128, i8, etc.) BEFORE extracting digits
      const str = String(val).replace(/[ui]\d+\.?\w*$/i, '').trim();
      const digits = str.replace(/[^\d]/g, '');
      return digits ? BigInt(digits) : 0n;
    };

    // Helper to extract microcredits from any record format
    const extractMicrocredits = (record: any): bigint => {
      // Direct property (JSON object)
      if (record && typeof record === 'object') {
        const mc = record.microcredits ?? record.data?.microcredits;
        if (mc !== undefined) {
          const val = parseAleoU64(mc);
          if (val > 0n) return val;
        }
      }
      // Plaintext string parsing
      let text = '';
      if (typeof record === 'string') {
        text = record;
      } else if (record && typeof record === 'object') {
        text = record.plaintext || record.data || record.record || record.content || JSON.stringify(record);
      }
      const match = String(text).match(/microcredits["\s:]*(\d+)/);
      return match ? BigInt(match[1]) : 0n;
    };

    // Helper to sum microcredits from records array or { records: [...] } response
    const sumRecords = (response: any): bigint => {
      const records = Array.isArray(response) ? response : (response?.records || []);
      let sum = 0n;
      let totalCount = 0;
      let spentCount = 0;
      for (const r of records) {
        totalCount++;
        // Log the first few records to debug format
        if (totalCount <= 3) {
          console.log(`Leo Wallet: Record ${totalCount} keys:`, r && typeof r === 'object' ? Object.keys(r) : typeof r);
          console.log(`Leo Wallet: Record ${totalCount} spent?:`, r?.spent, r?.isSpent, r?.status, r?.recordStatus);
        }
        // Skip spent records
        if (isRecordSpent(r)) {
          spentCount++;
          continue;
        }
        const amount = extractMicrocredits(r);
        if (amount > 0n) {
          sum += amount;
          console.log('Leo Wallet: Unspent record:', (Number(amount) / 1_000_000).toFixed(2), 'ALEO');
        }
      }
      console.log(`Leo Wallet: Total records: ${totalCount}, spent: ${spentCount}, unspent with value: ${totalCount - spentCount}`);
      return sum;
    };

    // Method 1: Direct window.leoWallet.requestRecordPlaintexts (most reliable)
    if (privateBalance === 0n) {
      try {
        const leoWallet = (window as any).leoWallet || (window as any).leo;
        if (leoWallet && typeof leoWallet.requestRecordPlaintexts === 'function') {
          console.log('Leo Wallet: Method 1 - window.leoWallet.requestRecordPlaintexts...');
          const result = await leoWallet.requestRecordPlaintexts('credits.aleo');
          console.log('Leo Wallet: Method 1 response:', result);
          privateBalance = sumRecords(result);
        }
      } catch (err) {
        console.log('Leo Wallet: Method 1 failed:', err);
      }
    }

    // Method 2: Direct window.leoWallet.requestRecords
    if (privateBalance === 0n) {
      try {
        const leoWallet = (window as any).leoWallet || (window as any).leo;
        if (leoWallet && typeof leoWallet.requestRecords === 'function') {
          console.log('Leo Wallet: Method 2 - window.leoWallet.requestRecords...');
          const result = await leoWallet.requestRecords('credits.aleo');
          console.log('Leo Wallet: Method 2 response:', result);
          privateBalance = sumRecords(result);
        }
      } catch (err) {
        console.log('Leo Wallet: Method 2 failed:', err);
      }
    }

    // Method 3: Adapter requestRecords(program, true) - calls requestRecordPlaintexts internally
    if (privateBalance === 0n) {
      try {
        console.log('Leo Wallet: Method 3 - adapter.requestRecords(credits.aleo, true)...');
        const records = await this.adapter.requestRecords('credits.aleo', true);
        console.log('Leo Wallet: Method 3 response:', records);
        privateBalance = sumRecords(records);
      } catch (err) {
        console.log('Leo Wallet: Method 3 failed:', err);
      }
    }

    // Method 4: Adapter requestRecords(program, false)
    if (privateBalance === 0n) {
      try {
        console.log('Leo Wallet: Method 4 - adapter.requestRecords(credits.aleo, false)...');
        const records = await this.adapter.requestRecords('credits.aleo', false);
        console.log('Leo Wallet: Method 4 response:', records);
        privateBalance = sumRecords(records);
      } catch (err) {
        console.log('Leo Wallet: Method 4 failed:', err);
      }
    }

    const totalBalance = publicBalance + privateBalance;
    console.log('Leo Wallet: ========== FINAL BALANCE SUMMARY ==========');
    console.log('Leo Wallet: Public:', publicBalance.toString(), `(${Number(publicBalance) / 1_000_000} ALEO)`);
    console.log('Leo Wallet: Private:', privateBalance.toString(), `(${Number(privateBalance) / 1_000_000} ALEO)`);
    console.log('Leo Wallet: Total:', totalBalance.toString(), `(${Number(totalBalance) / 1_000_000} ALEO)`);
    console.log('Leo Wallet: ==========================================');

    if (privateBalance === 0n) {
      console.warn('Leo Wallet: ⚠️ Private balance is 0 - this may not be accurate!');
      console.warn('Leo Wallet: ⚠️ Leo Wallet extension may show different balance');
      console.warn('Leo Wallet: ⚠️ Private records are encrypted and may not be accessible via SDK');
    }

    return { public: publicBalance, private: privateBalance };
  }

  async requestTransaction(request: TransactionRequest): Promise<string> {
    if (!this.adapter.connected || !this.account) {
      throw new Error('Wallet not connected');
    }

    try {
      console.log('Leo Wallet: Executing transaction...');
      console.log('Leo Wallet: Request:', {
        program: request.programId,
        function: request.functionName,
        inputs: request.inputs,
        fee: request.fee,
      });

      // Validate inputs
      if (!request.inputs || !Array.isArray(request.inputs)) {
        throw new Error('Invalid inputs: must be an array');
      }

      for (let i = 0; i < request.inputs.length; i++) {
        if (typeof request.inputs[i] !== 'string') {
          throw new Error(`Input ${i} must be a string, got ${typeof request.inputs[i]}`);
        }
        if (!request.inputs[i]) {
          throw new Error(`Input ${i} is empty`);
        }
      }

      console.log('Leo Wallet: Inputs validated:', request.inputs);

      const result = await this.adapter.executeTransaction({
        program: request.programId,
        function: request.functionName,
        inputs: request.inputs,
        fee: request.fee,
        privateFee: false,
      });

      console.log('Leo Wallet: Transaction result:', result);
      console.log('Leo Wallet: Result type:', typeof result);
      console.log('Leo Wallet: Result keys:', result ? Object.keys(result) : 'null');

      // Try different possible response formats
      let transactionId = null;

      if (typeof result === 'string') {
        transactionId = result;
      } else if (result && typeof result === 'object') {
        // Try to get the actual Aleo transaction ID (at1...)
        transactionId = (result as any).transactionId
          || (result as any).txId
          || (result as any).id
          || (result as any).transaction_id
          || (result as any).aleoTransactionId;
      }

      if (transactionId) {
        console.log('Leo Wallet: Transaction ID:', transactionId);
        console.log('Leo Wallet: Transaction ID format:', transactionId.startsWith('at1') ? 'Aleo format (at1...)' : 'UUID/Event ID format');

        // If it's a UUID (event ID), try to get the actual transaction ID from wallet
        if (!transactionId.startsWith('at1') && transactionId.includes('-')) {
          console.log('Leo Wallet: Got UUID, attempting to get real transaction ID...');

          // Store the event ID
          (window as any).__lastLeoEventId = transactionId;

          // Try to get transaction ID from wallet extension directly
          const realTxId = await this.pollForTransactionId(transactionId);
          if (realTxId) {
            console.log('Leo Wallet: ✅ Got real transaction ID:', realTxId);
            return realTxId;
          }

          console.warn('⚠️ Could not get real transaction ID, returning UUID');
          console.warn('⚠️ User can get correct transaction ID from Leo Wallet extension');
        }

        return transactionId;
      }

      console.error('Leo Wallet: No transaction ID in result:', result);
      throw new Error('No transaction ID returned from wallet');
    } catch (error: any) {
      console.error('Leo Wallet: Transaction failed:', error);
      console.error('Leo Wallet: Error type:', typeof error);
      console.error('Leo Wallet: Error message:', error?.message);
      console.error('Leo Wallet: Error stack:', error?.stack?.substring(0, 500));

      if (error?.message?.includes('User rejected') || error?.message?.includes('denied') || error?.message?.includes('rejected')) {
        throw new Error('Transaction rejected by user');
      }

      if (error?.message?.includes('Insufficient') || error?.message?.includes('balance')) {
        throw new Error('Insufficient balance for transaction');
      }

      if (error?.message?.includes('not found') || error?.message?.includes('does not exist')) {
        throw new Error('Program or function not found on blockchain');
      }

      throw new Error(`Transaction failed: ${error?.message || 'Unknown error'}. Please check: 1) Wallet is unlocked, 2) Connected to Testnet, 3) Sufficient balance`);
    }
  }

  /**
   * Poll the wallet adapter for the real transaction ID using transactionStatus()
   * According to Leo Wallet docs, requestTransaction returns an ID that is NOT the on-chain tx ID
   * We need to use transactionStatus() to get the actual on-chain transaction ID
   */
  private async pollForTransactionId(eventId: string, maxAttempts: number = 15): Promise<string | null> {
    console.log('Leo Wallet: Polling for on-chain transaction ID...');
    console.log('Leo Wallet: Event/Request ID:', eventId);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        // Method 1: Use adapter's transactionStatus (official method from docs)
        if (typeof (this.adapter as any).transactionStatus === 'function') {
          console.log(`Leo Wallet: Attempt ${attempt + 1} - calling transactionStatus(${eventId})`);
          const status = await (this.adapter as any).transactionStatus(eventId);
          console.log(`Leo Wallet: transactionStatus response:`, status);

          // Check various possible response formats
          if (status) {
            // The on-chain transaction ID might be in different fields
            const onChainId = status.transactionId || status.transaction_id || status.txId || status.id;
            if (onChainId && typeof onChainId === 'string' && onChainId.startsWith('at1')) {
              console.log('Leo Wallet: ✅ Found on-chain transaction ID:', onChainId);
              return onChainId;
            }

            // Check if status indicates completion
            if (status.status === 'Finalized' || status.status === 'Completed' || status.finalized) {
              console.log('Leo Wallet: Transaction finalized, checking for ID...');
              if (status.transaction?.id?.startsWith('at1')) {
                return status.transaction.id;
              }
            }
          }
        }

        // Method 2: Try requestTransactionHistory to find recent transaction
        if (typeof (this.adapter as any).requestTransactionHistory === 'function') {
          console.log(`Leo Wallet: Attempt ${attempt + 1} - calling requestTransactionHistory`);
          const history = await (this.adapter as any).requestTransactionHistory('veiled_markets_v9.aleo');
          console.log('Leo Wallet: Transaction history:', history);

          if (Array.isArray(history) && history.length > 0) {
            // Get the most recent transaction
            const recentTx = history[0];
            const txId = recentTx?.transactionId || recentTx?.transaction_id || recentTx?.id;
            if (txId && typeof txId === 'string' && txId.startsWith('at1')) {
              console.log('Leo Wallet: ✅ Found recent transaction ID:', txId);
              return txId;
            }
          }
        }

        // Method 3: Try window.leoWallet direct access
        const leoWallet = (window as any).leoWallet || (window as any).leo;
        if (leoWallet) {
          // Try transactionStatus on window object
          if (typeof leoWallet.transactionStatus === 'function') {
            const status = await leoWallet.transactionStatus(eventId);
            console.log(`Leo Wallet: window.leoWallet.transactionStatus:`, status);
            const txId = status?.transactionId || status?.transaction_id || status?.id;
            if (txId && typeof txId === 'string' && txId.startsWith('at1')) {
              return txId;
            }
          }

          // Try getTransactionStatus
          if (typeof leoWallet.getTransactionStatus === 'function') {
            const status = await leoWallet.getTransactionStatus(eventId);
            console.log(`Leo Wallet: window.leoWallet.getTransactionStatus:`, status);
            const txId = status?.transactionId || status?.transaction_id || status?.id;
            if (txId && typeof txId === 'string' && txId.startsWith('at1')) {
              return txId;
            }
          }
        }

        // Wait before next attempt (increasing delay)
        const delay = Math.min(1000 + attempt * 500, 3000);
        console.log(`Leo Wallet: Attempt ${attempt + 1} - no on-chain ID yet, waiting ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } catch (err) {
        console.log(`Leo Wallet: Attempt ${attempt + 1} error:`, err);
        // Continue polling even on error
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log('Leo Wallet: Could not get on-chain transaction ID after', maxAttempts, 'attempts');
    return null;
  }

  async getRecords(programId: string): Promise<any[]> {
    if (!this.adapter.connected) return [];

    const leoWallet = (window as any).leoWallet || (window as any).leo;

    // Log available methods for debugging
    if (leoWallet) {
      try {
        const proto = Object.getPrototypeOf(leoWallet) || {};
        const methods = [...new Set([
          ...Object.getOwnPropertyNames(proto),
          ...Object.keys(leoWallet),
        ])].filter(k => typeof leoWallet[k] === 'function');
        console.log('Leo Wallet getRecords: Available wallet methods:', methods.join(', '));
      } catch { /* ignore */ }
    }

    // Method 1: window.leoWallet.requestRecordPlaintexts (returns decrypted records)
    try {
      if (leoWallet && typeof leoWallet.requestRecordPlaintexts === 'function') {
        console.log('Leo Wallet getRecords: Method 1 - requestRecordPlaintexts("' + programId + '")...');
        const result = await leoWallet.requestRecordPlaintexts(programId);
        console.log('Leo Wallet getRecords: Method 1 raw type:', typeof result);
        try { console.log('Leo Wallet getRecords: Method 1 raw:', JSON.stringify(result).slice(0, 1000)); } catch {}
        const records = Array.isArray(result) ? result : (result?.records || []);
        if (records.length > 0) {
          console.log('Leo Wallet getRecords: Method 1 got', records.length, 'records');
          for (let i = 0; i < Math.min(records.length, 2); i++) {
            console.log(`Leo Wallet getRecords: Record[${i}] type:`, typeof records[i]);
            if (typeof records[i] === 'object' && records[i]) {
              console.log(`Leo Wallet getRecords: Record[${i}] keys:`, Object.keys(records[i]));
            }
            try { console.log(`Leo Wallet getRecords: Record[${i}]:`, JSON.stringify(records[i]).slice(0, 500)); } catch {}
          }
          return records;
        }
        console.log('Leo Wallet getRecords: Method 1 returned 0 records');
      }
    } catch (err) {
      console.log('Leo Wallet getRecords: Method 1 failed:', err);
    }

    // Method 2: window.leoWallet.requestRecords
    try {
      if (leoWallet && typeof leoWallet.requestRecords === 'function') {
        console.log('Leo Wallet getRecords: Method 2 - requestRecords("' + programId + '")...');
        const result = await leoWallet.requestRecords(programId);
        console.log('Leo Wallet getRecords: Method 2 raw type:', typeof result);
        try { console.log('Leo Wallet getRecords: Method 2 raw:', JSON.stringify(result).slice(0, 1000)); } catch {}
        const records = Array.isArray(result) ? result : (result?.records || []);
        if (records.length > 0) {
          console.log('Leo Wallet getRecords: Method 2 got', records.length, 'records');
          return records;
        }
        console.log('Leo Wallet getRecords: Method 2 returned 0 records');
      }
    } catch (err) {
      console.log('Leo Wallet getRecords: Method 2 failed:', err);
    }

    // Method 3: Adapter requestRecords with plaintext
    try {
      console.log('Leo Wallet getRecords: Method 3 - adapter.requestRecords(programId, true)...');
      const records = await this.adapter.requestRecords(programId, true);
      console.log('Leo Wallet getRecords: Method 3 result count:', records?.length || 0);
      try { console.log('Leo Wallet getRecords: Method 3 raw:', JSON.stringify(records).slice(0, 1000)); } catch {}
      if (records && records.length > 0) {
        return records;
      }
    } catch (err) {
      console.log('Leo Wallet getRecords: Method 3 failed:', err);
    }

    // Method 4: Adapter requestRecords without plaintext
    try {
      console.log('Leo Wallet getRecords: Method 4 - adapter.requestRecords(programId, false)...');
      const records = await this.adapter.requestRecords(programId, false);
      console.log('Leo Wallet getRecords: Method 4 result count:', records?.length || 0);
      try { console.log('Leo Wallet getRecords: Method 4 raw:', JSON.stringify(records).slice(0, 1000)); } catch {}
      if (records && records.length > 0) {
        return records;
      }
    } catch (err) {
      console.log('Leo Wallet getRecords: Method 4 failed:', err);
    }

    console.warn('Leo Wallet getRecords: ⚠️ All 4 methods returned empty for', programId);
    return [];
  }

  async signMessage(message: string): Promise<string> {
    if (!this.adapter.connected) {
      throw new Error('Wallet not connected');
    }

    try {
      const encoder = new TextEncoder();
      const messageBytes = encoder.encode(message);
      const signature = await this.adapter.signMessage(messageBytes);
      return signature ? new TextDecoder().decode(signature) : '';
    } catch (error: any) {
      throw new Error(error.message || 'Failed to sign message');
    }
  }

  onAccountChange(callback: (account: WalletAccount | null) => void): () => void {
    const handler = () => {
      this.account = null;
      callback(null);
    };

    this.adapter.on('disconnect', handler);
    return () => {
      this.adapter.off('disconnect', handler);
    };
  }

  onNetworkChange(_callback: (network: NetworkType) => void): () => void {
    return () => { };
  }
}

// ============================================================================
// FOX WALLET ADAPTER (Using ProvableHQ Adapter)
// ============================================================================

export class FoxWalletAdapter {
  private adapter: ProvableFoxWalletAdapter;
  private account: WalletAccount | null = null;

  constructor() {
    this.adapter = new ProvableFoxWalletAdapter({
      appName: 'Veiled Markets',
    });
  }

  get isInstalled(): boolean {
    return this.adapter.readyState === 'Installed' || this.adapter.readyState === 'Loadable';
  }

  get isConnected(): boolean {
    return this.adapter.connected && !!this.account;
  }

  get currentAccount(): WalletAccount | null {
    return this.account;
  }

  async connect(): Promise<WalletAccount> {
    try {
      console.log('Fox Wallet: Attempting to connect...');
      console.log('Fox Wallet: readyState:', this.adapter.readyState);

      try {
        console.log('Fox Wallet: Trying network testnet...');
        await this.adapter.connect(Network.TESTNET, DecryptPermission.AutoDecrypt, ['veiled_markets_v9.aleo', 'credits.aleo']);

        if (this.adapter.account) {
          console.log('Fox Wallet: Connected successfully');
          this.account = {
            address: this.adapter.account.address,
            network: 'testnet',
          };
          return this.account;
        }
      } catch (err) {
        console.log('Fox Wallet: Failed with network testnet:', err);
        throw err;
      }

      throw new Error('Connection successful but no account returned');
    } catch (error: any) {
      console.error('Fox Wallet connection error:', error);
      const errorMessage = error?.message?.toLowerCase() || '';

      if (errorMessage.includes('user reject') || errorMessage.includes('rejected') || errorMessage.includes('denied')) {
        throw new Error('Connection request was rejected by user.');
      }

      if (errorMessage.includes('not installed') || errorMessage.includes('not found')) {
        throw new Error('Fox Wallet not installed. Please install from https://foxwallet.com');
      }

      throw new Error(error?.message || 'Failed to connect to Fox Wallet');
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.adapter.disconnect();
    } catch (error) {
      console.error('Disconnect error:', error);
    }
    this.account = null;
  }

  async getBalance(): Promise<WalletBalance> {
    if (!this.adapter.connected || !this.account) {
      return { public: 0n, private: 0n };
    }

    let publicBalance = 0n;
    let privateBalance = 0n;

    publicBalance = await fetchPublicBalance(this.account.address);

    try {
      const records = await this.adapter.requestRecords('credits.aleo', true);
      if (Array.isArray(records)) {
        for (const record of records) {
          const plaintext = String((record as any).plaintext || record);
          const match = plaintext.match(/microcredits:\s*(\d+)u64/);
          if (match) {
            privateBalance += BigInt(match[1]);
          }
        }
      }
    } catch {
      // Private records might require decrypt permission
    }

    return { public: publicBalance, private: privateBalance };
  }

  async requestTransaction(request: TransactionRequest): Promise<string> {
    if (!this.adapter.connected || !this.account) {
      throw new Error('Wallet not connected');
    }

    try {
      console.log('Fox Wallet: Executing transaction...');

      const result = await this.adapter.executeTransaction({
        program: request.programId,
        function: request.functionName,
        inputs: request.inputs,
        fee: request.fee,
        privateFee: false,
      });

      console.log('Fox Wallet: Transaction result:', result);

      if (result && result.transactionId) {
        return result.transactionId;
      }

      throw new Error('No transaction ID returned from wallet');
    } catch (error: any) {
      console.error('Fox Wallet: Transaction failed:', error);

      if (error?.message?.includes('User rejected') || error?.message?.includes('denied')) {
        throw new Error('Transaction rejected by user');
      }

      if (error?.message?.includes('Insufficient')) {
        throw new Error('Insufficient balance for transaction');
      }

      throw new Error(`${error?.message || 'Transaction failed'}. Please check: 1) Wallet is unlocked, 2) Connected to Testnet, 3) Sufficient balance`);
    }
  }

  async getRecords(programId: string): Promise<any[]> {
    if (!this.adapter.connected) return [];

    try {
      const records = await this.adapter.requestRecords(programId, true);
      return records || [];
    } catch {
      return [];
    }
  }

  async signMessage(message: string): Promise<string> {
    if (!this.adapter.connected) {
      throw new Error('Wallet not connected');
    }

    try {
      const encoder = new TextEncoder();
      const messageBytes = encoder.encode(message);
      const signature = await this.adapter.signMessage(messageBytes);
      return signature ? new TextDecoder().decode(signature) : '';
    } catch (error: any) {
      throw new Error(error.message || 'Failed to sign message');
    }
  }

  onAccountChange(callback: (account: WalletAccount | null) => void): () => void {
    const handler = () => {
      this.account = null;
      callback(null);
    };

    this.adapter.on('disconnect', handler);
    return () => {
      this.adapter.off('disconnect', handler);
    };
  }

  onNetworkChange(_callback: (network: NetworkType) => void): () => void {
    return () => { };
  }
}

// ============================================================================
// SOTER WALLET ADAPTER (Using ProvableHQ Adapter)
// ============================================================================

export class SoterWalletAdapter {
  private adapter: ProvableSoterWalletAdapter;
  private account: WalletAccount | null = null;

  constructor() {
    this.adapter = new ProvableSoterWalletAdapter({
      appName: 'Veiled Markets',
    });
  }

  get isInstalled(): boolean {
    return this.adapter.readyState === 'Installed' || this.adapter.readyState === 'Loadable';
  }

  get isConnected(): boolean {
    return this.adapter.connected && !!this.account;
  }

  get currentAccount(): WalletAccount | null {
    return this.account;
  }

  async connect(): Promise<WalletAccount> {
    try {
      console.log('Soter Wallet: Attempting to connect...');
      console.log('Soter Wallet: readyState:', this.adapter.readyState);

      try {
        console.log('Soter Wallet: Trying network testnet...');
        await this.adapter.connect(Network.TESTNET, DecryptPermission.AutoDecrypt, ['veiled_markets_v9.aleo', 'credits.aleo']);

        if (this.adapter.account) {
          console.log('Soter Wallet: Connected successfully');
          this.account = {
            address: this.adapter.account.address,
            network: 'testnet',
          };
          return this.account;
        }
      } catch (err) {
        console.log('Soter Wallet: Failed with network testnet:', err);
        throw err;
      }

      throw new Error('Connection successful but no account returned');
    } catch (error: any) {
      console.error('Soter Wallet connection error:', error);
      const errorMessage = error?.message?.toLowerCase() || '';

      if (errorMessage.includes('user reject') || errorMessage.includes('rejected') || errorMessage.includes('denied')) {
        throw new Error('Connection request was rejected by user.');
      }

      if (errorMessage.includes('not installed') || errorMessage.includes('not found')) {
        throw new Error('Soter Wallet not installed. Please install from Chrome Web Store');
      }

      throw new Error(error?.message || 'Failed to connect to Soter Wallet');
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.adapter.disconnect();
    } catch (error) {
      console.error('Disconnect error:', error);
    }
    this.account = null;
  }

  async getBalance(): Promise<WalletBalance> {
    if (!this.adapter.connected || !this.account) {
      return { public: 0n, private: 0n };
    }

    let publicBalance = 0n;
    let privateBalance = 0n;

    publicBalance = await fetchPublicBalance(this.account.address);

    try {
      const records = await this.adapter.requestRecords('credits.aleo', true);
      if (Array.isArray(records)) {
        for (const record of records) {
          const plaintext = String((record as any).plaintext || record);
          const match = plaintext.match(/microcredits:\s*(\d+)u64/);
          if (match) {
            privateBalance += BigInt(match[1]);
          }
        }
      }
    } catch {
      // Private records might require decrypt permission
    }

    return { public: publicBalance, private: privateBalance };
  }

  async requestTransaction(request: TransactionRequest): Promise<string> {
    if (!this.adapter.connected || !this.account) {
      throw new Error('Wallet not connected');
    }

    try {
      console.log('Soter Wallet: Executing transaction...');

      const result = await this.adapter.executeTransaction({
        program: request.programId,
        function: request.functionName,
        inputs: request.inputs,
        fee: request.fee,
        privateFee: false,
      });

      console.log('Soter Wallet: Transaction result:', result);

      if (result && result.transactionId) {
        return result.transactionId;
      }

      throw new Error('No transaction ID returned from wallet');
    } catch (error: any) {
      console.error('Soter Wallet: Transaction failed:', error);

      if (error?.message?.includes('User rejected') || error?.message?.includes('denied')) {
        throw new Error('Transaction rejected by user');
      }

      if (error?.message?.includes('Insufficient')) {
        throw new Error('Insufficient balance for transaction');
      }

      throw new Error(`${error?.message || 'Transaction failed'}. Please check: 1) Wallet is unlocked, 2) Connected to Testnet, 3) Sufficient balance`);
    }
  }

  async getRecords(programId: string): Promise<any[]> {
    if (!this.adapter.connected) return [];

    try {
      const records = await this.adapter.requestRecords(programId, true);
      return records || [];
    } catch {
      return [];
    }
  }

  async signMessage(message: string): Promise<string> {
    if (!this.adapter.connected) {
      throw new Error('Wallet not connected');
    }

    try {
      const encoder = new TextEncoder();
      const messageBytes = encoder.encode(message);
      const signature = await this.adapter.signMessage(messageBytes);
      return signature ? new TextDecoder().decode(signature) : '';
    } catch (error: any) {
      throw new Error(error.message || 'Failed to sign message');
    }
  }

  onAccountChange(callback: (account: WalletAccount | null) => void): () => void {
    const handler = () => {
      this.account = null;
      callback(null);
    };

    this.adapter.on('disconnect', handler);
    return () => {
      this.adapter.off('disconnect', handler);
    };
  }

  onNetworkChange(_callback: (network: NetworkType) => void): () => void {
    return () => { };
  }
}

// ============================================================================
// UNIFIED WALLET MANAGER
// ============================================================================

export type WalletType = 'puzzle' | 'leo' | 'fox' | 'soter' | 'demo';

export class WalletManager {
  private adapter: PuzzleWalletAdapter | LeoWalletAdapter | FoxWalletAdapter | SoterWalletAdapter | null = null;
  private walletType: WalletType | null = null;
  private demoMode: boolean = false;
  private demoAccount: WalletAccount | null = null;

  /**
   * Get available wallets
   */
  getAvailableWallets(): { type: WalletType; name: string; installed: boolean; icon: string }[] {
    return [
      {
        type: 'leo',
        name: 'Leo Wallet',
        installed: isLeoWalletInstalled(),
        icon: '🦁',
      },
      {
        type: 'fox',
        name: 'Fox Wallet',
        installed: isFoxWalletInstalled(),
        icon: '🦊',
      },
      {
        type: 'soter',
        name: 'Soter Wallet',
        installed: isSoterWalletInstalled(),
        icon: '🛡️',
      },
      {
        type: 'puzzle',
        name: 'Puzzle Wallet',
        installed: isPuzzleWalletInstalled(),
        icon: '🧩',
      },
      {
        type: 'demo',
        name: 'Demo Mode',
        installed: true,
        icon: '🎮',
      },
    ];
  }

  /**
   * Connect to a wallet
   */
  async connect(type: WalletType): Promise<WalletAccount> {
    // Demo mode for development/testing
    if (type === 'demo') {
      this.demoMode = true;
      this.walletType = 'demo';
      this.demoAccount = {
        address: 'aleo1rhgdu77hgyqd3xjj8ucu3jj9r2krwz6mnzyd80gncr5fxcwlh5rsvzp9px',
        network: 'testnet',
      };
      return this.demoAccount;
    }

    // Real wallet connection
    if (type === 'puzzle') {
      this.adapter = new PuzzleWalletAdapter();
    } else if (type === 'leo') {
      this.adapter = new LeoWalletAdapter();
    } else if (type === 'fox') {
      this.adapter = new FoxWalletAdapter();
    } else if (type === 'soter') {
      this.adapter = new SoterWalletAdapter();
    } else {
      throw new Error('Unknown wallet type');
    }

    const account = await this.adapter.connect();
    this.walletType = type;
    this.demoMode = false;
    return account;
  }

  /**
   * Disconnect wallet
   */
  async disconnect(): Promise<void> {
    if (this.demoMode) {
      this.demoMode = false;
      this.demoAccount = null;
      this.walletType = null;
      return;
    }

    if (this.adapter) {
      await this.adapter.disconnect();
      this.adapter = null;
    }
    this.walletType = null;
  }

  /**
   * Get current account
   */
  getAccount(): WalletAccount | null {
    if (this.demoMode) {
      return this.demoAccount;
    }
    return this.adapter?.currentAccount || null;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    if (this.demoMode) {
      return !!this.demoAccount;
    }
    return this.adapter?.isConnected || false;
  }

  /**
   * Get current wallet type
   */
  getWalletType(): WalletType | null {
    return this.walletType;
  }

  /**
   * Is demo mode
   */
  isDemoMode(): boolean {
    return this.demoMode;
  }

  /**
   * Get balance
   */
  async getBalance(): Promise<WalletBalance> {
    if (this.demoMode) {
      return {
        public: 10000000000n, // 10,000 credits
        private: 5000000000n,  // 5,000 credits
      };
    }

    if (!this.adapter?.isConnected) {
      throw new Error('Wallet not connected');
    }

    return await this.adapter.getBalance();
  }

  /**
   * Request transaction
   */
  async requestTransaction(request: TransactionRequest): Promise<string> {
    if (this.demoMode) {
      // Simulate transaction in demo mode
      await new Promise(resolve => setTimeout(resolve, 2000));
      return `demo_tx_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    }

    if (!this.adapter?.isConnected) {
      throw new Error('Wallet not connected');
    }

    return await this.adapter.requestTransaction(request);
  }

  /**
   * Get records
   */
  async getRecords(programId: string): Promise<any[]> {
    if (this.demoMode) {
      return [];
    }

    if (!this.adapter?.isConnected) {
      throw new Error('Wallet not connected');
    }

    return await this.adapter.getRecords(programId);
  }

  /**
   * Shield credits: convert public balance to private record
   * Calls credits.aleo/transfer_public_to_private
   */
  async shieldCredits(amount: bigint): Promise<string> {
    if (this.demoMode) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      return `demo_shield_${Date.now()}`;
    }

    if (!this.adapter?.isConnected) {
      throw new Error('Wallet not connected');
    }

    const account = this.adapter.currentAccount;
    if (!account) {
      throw new Error('No account connected');
    }

    return await this.adapter.requestTransaction({
      programId: 'credits.aleo',
      functionName: 'transfer_public_to_private',
      inputs: [account.address, `${amount}u64`],
      fee: 0.3, // 0.3 ALEO (Leo Wallet expects fee in ALEO, not microcredits)
    });
  }

  /**
   * Sign message
   */
  async signMessage(message: string): Promise<string> {
    if (this.demoMode) {
      return `demo_sig_${btoa(message).substring(0, 32)}`;
    }

    if (!this.adapter?.isConnected) {
      throw new Error('Wallet not connected');
    }

    return await this.adapter.signMessage(message);
  }

  /**
   * Subscribe to events
   */
  onAccountChange(callback: (account: WalletAccount | null) => void): () => void {
    if (!this.adapter) return () => { };
    return this.adapter.onAccountChange(callback);
  }

  onNetworkChange(callback: (network: NetworkType) => void): () => void {
    if (!this.adapter) return () => { };
    return this.adapter.onNetworkChange(callback);
  }
}

// Singleton instance
export const walletManager = new WalletManager();

// Export wallet info for UI
export const WALLET_INFO = {
  leo: {
    name: 'Leo Wallet',
    description: 'Official Leo language wallet',
    downloadUrl: 'https://leo.app',
    icon: '🦁',
  },
  fox: {
    name: 'Fox Wallet',
    description: 'Multi-chain wallet with Aleo support',
    downloadUrl: 'https://foxwallet.com',
    icon: '🦊',
  },
  soter: {
    name: 'Soter Wallet',
    description: 'Secure Aleo wallet extension',
    downloadUrl: 'https://chrome.google.com/webstore/detail/soter-aleo-wallet/gkodhkbmiflnmkipcmlhhgadebbeijhh',
    icon: '🛡️',
  },
  puzzle: {
    name: 'Puzzle Wallet',
    description: 'Recommended wallet for Aleo dApps',
    downloadUrl: 'https://puzzle.online/wallet',
    icon: '🧩',
  },
} as const;
