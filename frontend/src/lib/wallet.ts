// ============================================================================
// VEILED MARKETS - Wallet Integration
// ============================================================================
// Real wallet integration using Puzzle SDK and Leo Wallet adapter
// ============================================================================

import {
  connect as puzzleConnect,
  disconnect as puzzleDisconnect,
  getBalance as puzzleGetBalance,
  requestCreateEvent,
  getAccount,
  type EventType,
} from '@puzzlehq/sdk';

import { LeoWalletAdapter as OfficialLeoWalletAdapter } from '@demox-labs/aleo-wallet-adapter-leo';
import { WalletAdapterNetwork, DecryptPermission } from '@demox-labs/aleo-wallet-adapter-base';

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
  network?: string; // Add network parameter
}

export interface WalletEvents {
  onConnect: (account: WalletAccount) => void;
  onDisconnect: () => void;
  onAccountChange: (account: WalletAccount | null) => void;
  onNetworkChange: (network: NetworkType) => void;
}

// ============================================================================
// PUZZLE WALLET ADAPTER
// ============================================================================

/**
 * Check if Puzzle Wallet extension is installed
 * Puzzle SDK uses Chrome extension messaging, but we can check for some indicators
 */
export function isPuzzleWalletInstalled(): boolean {
  if (typeof window === 'undefined') return false;

  // Check for potential Puzzle Wallet indicators
  // The extension may inject objects or listen for specific events
  const hasPuzzle = !!(window as any).puzzle || !!(window as any).puzzleWallet;

  // Also check if Chrome extension messaging is available (general indicator)
  const chromeObj = (window as any).chrome;
  const hasExtensionSupport = chromeObj?.runtime?.sendMessage !== undefined;

  // Return true if we find puzzle, or if extensions are supported (we'll try to connect)
  return hasPuzzle || hasExtensionSupport;
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
 * Check if Leo Wallet extension is installed
 */
export function isLeoWalletInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as any).leo || !!(window as any).leoWallet;
}

/**
 * Get available wallet adapters
 */
export function getAvailableWallets(): string[] {
  const wallets: string[] = ['puzzle']; // Puzzle always available to attempt
  if (isLeoWalletInstalled()) wallets.push('leo');
  return wallets;
}

/**
 * Puzzle Wallet Adapter - Using @puzzlehq/sdk
 */
export class PuzzleWalletAdapter {
  private connected: boolean = false;
  private account: WalletAccount | null = null;

  get isInstalled(): boolean {
    return true; // SDK handles extension detection
  }

  get isConnected(): boolean {
    return this.connected && !!this.account;
  }

  get currentAccount(): WalletAccount | null {
    return this.account;
  }

  /**
   * Connect to Puzzle Wallet using @puzzlehq/sdk
   */
  async connect(): Promise<WalletAccount> {
    try {
      console.log('Puzzle Wallet: Attempting to connect...');
      console.log('Puzzle Wallet: Extension detected:', isPuzzleWalletInstalled());

      // Create the connect promise
      const connectPromise = puzzleConnect({
        dAppInfo: {
          name: 'Veiled Markets',
          description: 'Privacy-Preserving Prediction Markets on Aleo',
          iconUrl: typeof window !== 'undefined' ? window.location.origin + '/favicon.svg' : '',
        },
        permissions: {
          programIds: {
            'AleoTestnet': ['veiled_markets.aleo', 'credits.aleo'],
            'AleoMainnet': ['veiled_markets.aleo', 'credits.aleo'],
          }
        }
      });

      // Use timeout wrapper - 10 seconds should be enough for extension communication
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
        console.log('Puzzle Wallet: Address:', this.account.address);
        console.log('Puzzle Wallet: Network:', networkStr);

        return this.account;
      }

      throw new Error('Connection rejected or no account returned');
    } catch (error: any) {
      console.error('Puzzle Wallet connection error:', error);
      console.error('Error details:', {
        message: error?.message,
        name: error?.name,
        code: error?.code,
        stack: error?.stack?.substring(0, 500)
      });

      const errorMessage = error?.message || String(error);

      // Timeout from our wrapper
      if (errorMessage.includes('timed out') || errorMessage.includes('timeout')) {
        throw new Error(
          'Puzzle Wallet is not responding. Please check:\n' +
          '1. Extension is installed from puzzle.online/wallet\n' +
          '2. Extension is enabled in your browser\n' +
          '3. Wallet is unlocked'
        );
      }

      // Check for specific error types and provide user-friendly messages
      if (errorMessage.includes('Extension not found') ||
        errorMessage.includes('not installed') ||
        errorMessage.includes('not detected')) {
        throw new Error('Puzzle Wallet not installed. Please install from https://puzzle.online/wallet');
      }

      // TRPC Internal server error usually means extension not responding
      if (errorMessage.includes('Internal server error') ||
        errorMessage.includes('TRPCClientError')) {
        throw new Error(
          'Puzzle Wallet is not responding. Please check:\n' +
          '1. Extension is installed from puzzle.online/wallet\n' +
          '2. Extension is enabled in your browser\n' +
          '3. Wallet is unlocked'
        );
      }

      // User rejected
      if (errorMessage.includes('rejected') || errorMessage.includes('denied') || errorMessage.includes('cancelled')) {
        throw new Error('Connection request was rejected by user.');
      }

      throw new Error(errorMessage || 'Failed to connect to Puzzle Wallet');
    }
  }

  /**
   * Disconnect from wallet
   */
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

  /**
   * Get account balance
   */
  async getBalance(): Promise<WalletBalance> {
    if (!this.connected || !this.account) {
      throw new Error('Wallet not connected');
    }

    try {
      console.log('Puzzle Wallet: Fetching balance...');
      const balance = await puzzleGetBalance({});
      console.log('Puzzle Wallet balance response:', JSON.stringify(balance, null, 2));

      // Balance response has balances array with public and private amounts
      let publicBalance = 0n;
      let privateBalance = 0n;

      if (balance && (balance as any).balances) {
        for (const b of (balance as any).balances) {
          console.log('Balance entry:', JSON.stringify(b, null, 2));
          // Handle different possible formats
          if ((b as any).public !== undefined) {
            const pubVal = String((b as any).public).replace(/[^\d]/g, '');
            if (pubVal) publicBalance += BigInt(pubVal);
          }
          if ((b as any).private !== undefined) {
            const privVal = String((b as any).private).replace(/[^\d]/g, '');
            if (privVal) privateBalance += BigInt(privVal);
          }
          // Some versions might use 'amount' field
          if ((b as any).amount !== undefined) {
            const amtVal = String((b as any).amount).replace(/[^\d]/g, '');
            if (amtVal) {
              // Assume private if not specified
              privateBalance += BigInt(amtVal);
            }
          }
        }
      }

      // Fallback: Also try to fetch from blockchain API if SDK returns 0
      if (publicBalance === 0n && this.account?.address) {
        try {
          const apiUrl = `https://api.explorer.provable.com/v1/testnet/program/credits.aleo/mapping/account/${this.account.address}`;
          console.log('Puzzle Wallet: Fetching public balance from API:', apiUrl);
          const response = await fetch(apiUrl);
          if (response.ok) {
            const data = await response.text();
            console.log('Puzzle Wallet API response:', data);
            const cleanData = data.replace(/"/g, '').trim();
            const match = cleanData.match(/(\d+)/);
            if (match) {
              publicBalance = BigInt(match[1]);
              console.log('Puzzle Wallet: Parsed public balance from API:', publicBalance.toString());
            }
          }
        } catch (apiErr) {
          console.log('Puzzle Wallet: API fallback failed:', apiErr);
        }
      }

      console.log('Puzzle Wallet final balance:', { public: publicBalance.toString(), private: privateBalance.toString() });
      return { public: publicBalance, private: privateBalance };
    } catch (error) {
      console.error('Failed to get Puzzle Wallet balance:', error);

      // Fallback to API only
      if (this.account?.address) {
        try {
          const apiUrl = `https://api.explorer.provable.com/v1/testnet/program/credits.aleo/mapping/account/${this.account.address}`;
          const response = await fetch(apiUrl);
          if (response.ok) {
            const data = await response.text();
            const cleanData = data.replace(/"/g, '').trim();
            const match = cleanData.match(/(\d+)/);
            if (match) {
              return { public: BigInt(match[1]), private: 0n };
            }
          }
        } catch {
          // Ignore
        }
      }

      return { public: 0n, private: 0n };
    }
  }

  /**
   * Request transaction execution
   */
  async requestTransaction(request: TransactionRequest): Promise<string> {
    if (!this.connected) {
      throw new Error('Wallet not connected');
    }

    try {
      console.log('Puzzle Wallet: Requesting transaction with:', {
        type: 'Execute',
        programId: request.programId,
        functionId: request.functionName,
        fee: request.fee,
        inputs: request.inputs,
      });

      // Puzzle SDK requestCreateEvent format
      // Note: network parameter might not be supported
      const eventParams: any = {
        type: 'Execute' as EventType,
        programId: request.programId,
        functionId: request.functionName,
        fee: request.fee,
        inputs: request.inputs.map(input => ({ type: 'raw' as const, value: input })),
      };

      console.log('Puzzle Wallet: Event params:', JSON.stringify(eventParams, null, 2));

      const response = await requestCreateEvent(eventParams);

      console.log('Puzzle Wallet: Transaction response:', response);

      if (response && response.eventId) {
        return response.eventId;
      }

      throw new Error('Transaction rejected');
    } catch (error: any) {
      console.error('Puzzle Wallet: Transaction error details:', error);
      console.error('Puzzle Wallet: Error message:', error.message);
      console.error('Puzzle Wallet: Error code:', error.code);
      console.error('Puzzle Wallet: Error data:', error.data);
      throw new Error(error.message || 'Transaction failed');
    }
  }

  /**
   * Get user's records for a program
   */
  async getRecords(_programId: string): Promise<any[]> {
    if (!this.connected) {
      throw new Error('Wallet not connected');
    }

    try {
      // Records are managed by the wallet extension
      // For now return empty - would need to use getRecords from SDK
      return [];
    } catch (error) {
      console.error('Failed to get records:', error);
      return [];
    }
  }

  /**
   * Sign a message
   */
  async signMessage(_message: string): Promise<string> {
    if (!this.connected) {
      throw new Error('Wallet not connected');
    }

    // Puzzle SDK doesn't have direct signMessage - return placeholder
    return `puzzle_sig_${Date.now()}`;
  }

  /**
   * Decrypt a record
   */
  async decryptRecord(_ciphertext: string): Promise<any> {
    if (!this.connected) {
      throw new Error('Wallet not connected');
    }

    // Would need SDK support for decryption
    throw new Error('Decryption not supported');
  }

  /**
   * Subscribe to account changes
   */
  onAccountChange(callback: (account: WalletAccount | null) => void): () => void {
    // Check account periodically as SDK may not have event subscription
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

  /**
   * Subscribe to network changes
   */
  onNetworkChange(callback: (network: NetworkType) => void): () => void {
    // Check network periodically
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
// LEO WALLET ADAPTER (Using Official Adapter)
// ============================================================================

export class LeoWalletAdapter {
  private adapter: OfficialLeoWalletAdapter;
  private account: WalletAccount | null = null;

  constructor() {
    // Initialize the official Leo Wallet adapter with proper configuration
    this.adapter = new OfficialLeoWalletAdapter({
      appName: 'Veiled Markets',
    });
  }

  get isInstalled(): boolean {
    // Check if the adapter is ready (wallet extension is present)
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
      console.log('Leo Wallet adapter readyState:', this.adapter.readyState);
      console.log('Leo Wallet adapter publicKey:', this.adapter.publicKey);

      // Try connecting with different network configurations
      // Leo Wallet might be on Testnet (testnet3) instead of TestnetBeta
      let lastError: Error | null = null;

      // Try different combinations of network and permissions
      // IMPORTANT: Use AutoDecrypt first to be able to read private records/balance
      const attempts = [
        { network: WalletAdapterNetwork.TestnetBeta, permission: DecryptPermission.AutoDecrypt },
        { network: WalletAdapterNetwork.Testnet, permission: DecryptPermission.AutoDecrypt },
        { network: WalletAdapterNetwork.TestnetBeta, permission: DecryptPermission.NoDecrypt },
        { network: WalletAdapterNetwork.Testnet, permission: DecryptPermission.NoDecrypt },
      ];

      for (const attempt of attempts) {
        try {
          console.log(`Trying to connect with network: ${attempt.network}, permission: ${attempt.permission}`);
          await this.adapter.connect(
            attempt.permission,
            attempt.network
          );

          if (this.adapter.publicKey) {
            console.log('Successfully connected to Leo Wallet');
            break;
          }
        } catch (err) {
          console.log(`Failed with ${attempt.network}/${attempt.permission}:`, err);
          lastError = err as Error;
          // Try disconnecting before next attempt
          try {
            await this.adapter.disconnect();
          } catch {
            // ignore
          }
        }
      }

      // If still not connected after all attempts, throw the last error
      if (!this.adapter.publicKey && lastError) {
        throw lastError;
      }

      console.log('Leo Wallet connected, publicKey:', this.adapter.publicKey);

      if (this.adapter.publicKey) {
        this.account = {
          address: this.adapter.publicKey,
          network: 'testnet',
        };
        return this.account;
      }

      throw new Error('Connection successful but no account returned');
    } catch (error: unknown) {
      console.error('Leo Wallet connection error:', error);
      console.error('Error type:', typeof error);
      console.error('Error name:', (error as any)?.name);
      console.error('Error message:', (error as any)?.message);

      // Extract error message
      let errorMessage = 'Failed to connect to Leo Wallet';

      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else if (error && typeof error === 'object') {
        const errObj = error as Record<string, unknown>;
        if (typeof errObj.message === 'string') {
          errorMessage = errObj.message;
        }
      }

      const lowerMessage = errorMessage.toLowerCase();

      // Handle specific error cases
      if (lowerMessage.includes('user reject') || lowerMessage.includes('rejected') || lowerMessage.includes('denied')) {
        throw new Error('Connection request was rejected by user.');
      }

      if (lowerMessage.includes('not installed') || lowerMessage.includes('not found') || this.adapter.readyState === 'NotDetected') {
        throw new Error('Leo Wallet not installed. Please install from https://leo.app');
      }

      if (lowerMessage.includes('timeout')) {
        throw new Error('Leo Wallet connection timed out. Please try again.');
      }

      // If error is the generic "unknown error", provide more context
      if (lowerMessage.includes('unknown error')) {
        throw new Error('Leo Wallet encountered an error. Try: 1) Refresh the page 2) Disable other wallet extensions 3) Update Leo Wallet');
      }

      throw new Error(errorMessage);
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
    if (!this.adapter.connected || !this.adapter.publicKey) {
      return { public: 0n, private: 0n };
    }

    try {
      // Fetch public balance from Aleo network API
      const address = this.adapter.publicKey;
      console.log('\n=== FETCHING PUBLIC BALANCE ===');
      console.log('Leo Wallet: Address:', address);
      console.log('Leo Wallet: Adapter connected:', this.adapter.connected);

      // Use config RPC URL or fallback to default
      // Correct API format: /program/{id}/mapping/{name}/{key}
      // For credits.aleo, the mapping is "account" and key is the address
      const baseUrl = config.rpcUrl || 'https://api.explorer.provable.com/v1/testnet';
      const url = `${baseUrl}/program/credits.aleo/mapping/account/${address}`;

      console.log('Leo Wallet: Fetching public balance from:', url);
      console.log('Leo Wallet: Base URL:', baseUrl);

      let publicBalanceResponse: Response | null = null;

      try {
        publicBalanceResponse = await fetch(url);
        console.log('API response status:', publicBalanceResponse.status);
      } catch (err) {
        console.error('Failed to fetch public balance:', err);
      }

      let publicBalance = 0n;
      if (publicBalanceResponse && publicBalanceResponse.ok) {
        const data = await publicBalanceResponse.text();
        console.log('Public balance API response:', data);

        // Parse the response - format could be:
        // - "123456u64" 
        // - "123456"
        // - just a number
        // - JSON with value field
        try {
          // Remove quotes and whitespace
          const cleanData = data.replace(/"/g, '').trim();
          console.log('Cleaned public balance data:', cleanData);

          // Try to extract number from various formats
          // Format 1: "5691241u64"
          // Format 2: "5691241"
          // Format 3: {"value": "5691241u64"}

          // Try parsing as JSON first
          try {
            const jsonData = JSON.parse(data);
            console.log('Parsed as JSON:', jsonData);

            if (typeof jsonData === 'number') {
              publicBalance = BigInt(jsonData);
            } else if (typeof jsonData === 'string') {
              const match = jsonData.match(/(\d+)/);
              if (match) publicBalance = BigInt(match[1]);
            } else if (jsonData.value) {
              const match = String(jsonData.value).match(/(\d+)/);
              if (match) publicBalance = BigInt(match[1]);
            }
          } catch {
            // Not JSON, parse as plain text
            const match = cleanData.match(/(\d+)/);
            if (match) {
              publicBalance = BigInt(match[1]);
              console.log('Extracted public balance from text:', publicBalance.toString());
            }
          }
        } catch (parseError) {
          console.error('Failed to parse public balance:', parseError);
        }

        console.log('Parsed public balance:', publicBalance.toString(), 'microcredits');
        console.log('Public balance in ALEO:', Number(publicBalance) / 1_000_000);
      } else if (publicBalanceResponse) {
        // API returned but not OK - might be 404 (no public balance) or other error
        const errorText = await publicBalanceResponse.text().catch(() => 'Unknown error');
        console.log('Public balance API error:', publicBalanceResponse.status, errorText);

        // 404 means the account has no public balance (only private credits)
        // This is normal for accounts that only have private records
        if (publicBalanceResponse.status === 404) {
          console.log('No public balance found - this is normal if you only have private credits');
        }
      } else {
        console.log('Failed to fetch public balance - network error');
      }

      // For private balance, we need to request records from the wallet
      let privateBalance = 0n;
      try {
        console.log('Requesting private records from credits.aleo...');
        const records = await this.adapter.requestRecords('credits.aleo');
        console.log('Private records response:', records);
        console.log('Records type:', typeof records);
        console.log('Records is array:', Array.isArray(records));

        if (records && Array.isArray(records)) {
          console.log('Number of records:', records.length);
          for (let i = 0; i < records.length; i++) {
            const record = records[i];
            console.log(`\n=== Record ${i} ===`);
            console.log('Full record:', JSON.stringify(record, null, 2));
            console.log('Record keys:', Object.keys(record));

            // Try multiple possible field names and structures
            let amount = 0n;

            // Try different possible structures
            const possiblePaths = [
              () => record.microcredits,
              () => record.data?.microcredits,
              () => record.amount,
              () => record.data?.amount,
              () => {
                const match = String(record.plaintext || '').match(/microcredits:\s*(\d+)u64/);
                return match ? match[1] : null;
              },
              () => {
                const match = String(record).match(/microcredits:\s*(\d+)u64/);
                return match ? match[1] : null;
              },
            ];

            for (const pathFn of possiblePaths) {
              try {
                const value = pathFn();
                if (value !== null && value !== undefined) {
                  const cleanAmount = String(value)
                    .replace('u64.private', '')
                    .replace('u64.public', '')
                    .replace('u64', '')
                    .replace(/[^\d]/g, '');

                  if (cleanAmount && cleanAmount !== '0') {
                    amount = BigInt(cleanAmount);
                    console.log(`Record ${i} found amount:`, amount.toString(), 'microcredits');
                    break;
                  }
                }
              } catch (e) {
                // Continue to next path
              }
            }

            if (amount > 0n) {
              privateBalance += amount;
              console.log(`Record ${i} added ${amount} microcredits. Total private: ${privateBalance}`);
            } else {
              console.log(`Record ${i} has no valid amount`);
            }
          }
        } else if (records && typeof records === 'object') {
          // Maybe it's not an array but a single record or object with records
          console.log('Records is object, keys:', Object.keys(records));

          // Try to extract from object format
          if ((records as any).records && Array.isArray((records as any).records)) {
            console.log('Found nested records array');
            const nestedRecords = (records as any).records;
            // Process nested records (recursive call to same logic above)
            for (let i = 0; i < nestedRecords.length; i++) {
              const record = nestedRecords[i];
              console.log(`Nested record ${i}:`, record);
              // Add similar parsing logic here if needed
            }
          }
        }

        console.log('Final private balance:', privateBalance.toString(), 'microcredits');
        console.log('Final private balance in credits:', Number(privateBalance) / 1_000_000);
      } catch (err) {
        console.log('Could not fetch private records:', err);
        console.log('Error details:', JSON.stringify(err, null, 2));
        // Private records might require decrypt permission - this is expected
        // if user didn't grant AutoDecrypt permission
      }

      const finalBalance = {
        public: publicBalance,
        private: privateBalance
      };

      console.log('\n=== FINAL BALANCE ===');
      console.log('Public:', publicBalance.toString(), 'microcredits =', Number(publicBalance) / 1_000_000, 'ALEO');
      console.log('Private:', privateBalance.toString(), 'microcredits =', Number(privateBalance) / 1_000_000, 'ALEO');
      console.log('Total:', (publicBalance + privateBalance).toString(), 'microcredits =', Number(publicBalance + privateBalance) / 1_000_000, 'ALEO');

      return finalBalance;
    } catch (error) {
      console.error('Failed to fetch Leo Wallet balance:', error);
      return { public: 0n, private: 0n };
    }
  }

  async requestTransaction(request: TransactionRequest): Promise<string> {
    if (!this.adapter.connected) {
      throw new Error('Wallet not connected');
    }

    try {
      console.log('Leo Wallet: Starting transaction');
      console.log('Leo Wallet: Connected:', this.adapter.connected);
      console.log('Leo Wallet: Public key:', this.adapter.publicKey);

      // Try direct window.leoWallet API if available
      const leoWallet = (window as any).leoWallet || (window as any).leo;

      if (leoWallet && typeof leoWallet.requestTransaction === 'function') {
        console.log('Leo Wallet: Using window.leoWallet.requestTransaction');

        const result = await leoWallet.requestTransaction({
          program: request.programId,
          functionName: request.functionName,
          inputs: request.inputs,
          fee: request.fee,
          privateFee: false,
        });

        console.log('Leo Wallet: Direct API result:', result);

        const txId = result?.transactionId || result?.txId || result;
        if (txId) return txId;
      }

      // Use requestExecution which is the standard method for Leo Wallet
      console.log('Leo Wallet: Using adapter.requestExecution');
      const result = await this.adapter.requestExecution({
        program: request.programId,
        functionName: request.functionName,
        inputs: request.inputs,
        fee: request.fee,
      } as any);

      console.log('Leo Wallet: Transaction result:', result);

      // Extract transaction ID from result
      let transactionId = '';

      if (typeof result === 'string') {
        transactionId = result;
      } else if (result && typeof result === 'object') {
        transactionId = (result as any).transactionId
          || (result as any).txId
          || (result as any).id
          || '';
      }

      console.log('Leo Wallet: Transaction ID:', transactionId);

      if (!transactionId) {
        throw new Error('No transaction ID returned from wallet');
      }

      return transactionId;
    } catch (error: any) {
      console.error('Leo Wallet: Transaction failed');
      console.error('Leo Wallet: Error type:', error?.constructor?.name);
      console.error('Leo Wallet: Error message:', error?.message);
      console.error('Leo Wallet: Full error:', error);

      // Check for specific error types
      if (error?.message?.includes('User rejected') || error?.message?.includes('denied')) {
        throw new Error('Transaction rejected by user');
      }

      if (error?.message?.includes('Insufficient')) {
        throw new Error('Insufficient balance for transaction');
      }

      if (error?.message?.includes('not found') || error?.message?.includes('does not exist')) {
        throw new Error('Program not found. Please ensure veiled_markets.aleo is deployed on testnet.');
      }

      // Generic error with more context
      const errorMsg = error?.message || 'Transaction failed';
      throw new Error(`${errorMsg}. Please check: 1) Wallet is unlocked, 2) Connected to Testnet Beta, 3) Sufficient balance`);
    }
  }

  async getRecords(programId: string): Promise<any[]> {
    if (!this.adapter.connected) return [];

    try {
      const records = await this.adapter.requestRecords(programId);
      return records || [];
    } catch (error) {
      console.error('Failed to get records:', error);
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
    // Official adapter doesn't have direct event subscription
    // Instead, we can listen to the 'disconnect' event
    const disconnectHandler = () => {
      this.account = null;
      callback(null);
    };

    this.adapter.on('disconnect', disconnectHandler);

    return () => {
      this.adapter.off('disconnect', disconnectHandler);
    };
  }

  onNetworkChange(_callback: (network: NetworkType) => void): () => void {
    // Official adapter doesn't expose network change events directly
    // Network is set during connection
    return () => { };
  }
}

// ============================================================================
// UNIFIED WALLET MANAGER
// ============================================================================

export type WalletType = 'puzzle' | 'leo' | 'demo';

export class WalletManager {
  private adapter: PuzzleWalletAdapter | LeoWalletAdapter | null = null;
  private walletType: WalletType | null = null;
  private demoMode: boolean = false;
  private demoAccount: WalletAccount | null = null;

  /**
   * Get available wallets
   */
  getAvailableWallets(): { type: WalletType; name: string; installed: boolean; icon: string }[] {
    return [
      {
        type: 'puzzle',
        name: 'Puzzle Wallet',
        installed: isPuzzleWalletInstalled(),
        icon: '🧩',
      },
      {
        type: 'leo',
        name: 'Leo Wallet',
        installed: isLeoWalletInstalled(),
        icon: '🦁',
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
    } else {
      throw new Error('Unknown wallet type');
    }

    // Let the connect() function handle detection and throw appropriate errors
    // This allows for better error messages and handles late-injecting extensions
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
  puzzle: {
    name: 'Puzzle Wallet',
    description: 'Recommended wallet for Aleo dApps',
    downloadUrl: 'https://puzzle.online/wallet',
    icon: '🧩',
  },
  leo: {
    name: 'Leo Wallet',
    description: 'Official Leo language wallet',
    downloadUrl: 'https://leo.app',
    icon: '🦁',
  },
} as const;
