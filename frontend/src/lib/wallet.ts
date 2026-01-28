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
 * Note: Puzzle SDK works via browser extension messaging, not window object
 */
export function isPuzzleWalletInstalled(): boolean {
  // Puzzle SDK connects via extension messaging, always return true to allow attempt
  return true;
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
      // Use the Puzzle SDK connect function
      const response = await puzzleConnect({
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

      if (response && response.connection && response.connection.address) {
        this.connected = true;
        const networkStr = response.connection.network || 'AleoTestnet';
        this.account = {
          address: response.connection.address,
          network: networkStr.includes('Mainnet') ? 'mainnet' : 'testnet',
        };
        return this.account;
      }

      throw new Error('Connection rejected or no account returned');
    } catch (error: any) {
      console.error('Puzzle Wallet connection error:', error);

      const errorMessage = error?.message || String(error);

      // Check for specific error types and provide user-friendly messages
      if (errorMessage.includes('Extension not found') ||
        errorMessage.includes('not installed') ||
        errorMessage.includes('not detected')) {
        throw new Error('Puzzle Wallet not installed. Please install from https://puzzle.online/wallet');
      }

      // TRPC Internal server error usually means extension not responding
      if (errorMessage.includes('Internal server error') ||
        errorMessage.includes('TRPCClientError')) {
        throw new Error('Puzzle Wallet not responding. Please ensure the extension is installed and unlocked.');
      }

      // Timeout errors
      if (errorMessage.includes('timeout') || errorMessage.includes('5 seconds')) {
        throw new Error('Connection timed out. Please ensure Puzzle Wallet extension is installed and active.');
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
      const balance = await puzzleGetBalance({});
      // Balance response has balances array with public and private amounts
      let publicBalance = 0n;
      let privateBalance = 0n;

      if (balance && (balance as any).balances) {
        for (const b of (balance as any).balances) {
          if ((b as any).public) publicBalance += BigInt((b as any).public);
          if ((b as any).private) privateBalance += BigInt((b as any).private);
        }
      }

      return { public: publicBalance, private: privateBalance };
    } catch (error) {
      console.error('Failed to get balance:', error);
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
      const response = await requestCreateEvent({
        type: 'Execute' as EventType,
        programId: request.programId,
        functionId: request.functionName,
        fee: request.fee,
        inputs: request.inputs.map(input => ({ type: 'raw' as const, value: input })) as any,
      });

      if (response && response.eventId) {
        return response.eventId;
      }

      throw new Error('Transaction rejected');
    } catch (error: any) {
      console.error('Transaction error:', error);
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
      console.log('Fetching balance for address:', address);

      // Correct API format: /program/{id}/mapping/{name}/{key}
      // For credits.aleo, the mapping is "account" and key is the address
      const baseUrl = 'https://api.explorer.provable.com/v1/testnet';
      const url = `${baseUrl}/program/credits.aleo/mapping/account/${address}`;

      console.log('Fetching public balance from:', url);

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
        // - just a number
        // - JSON with value field
        try {
          // Try parsing as JSON first
          const jsonData = JSON.parse(data);
          if (typeof jsonData === 'number') {
            publicBalance = BigInt(jsonData);
          } else if (jsonData.value) {
            const match = String(jsonData.value).match(/(\d+)/);
            if (match) publicBalance = BigInt(match[1]);
          }
        } catch {
          // Not JSON, try parsing as string
          const cleanData = data.replace(/"/g, '').trim();
          const match = cleanData.match(/(\d+)/);
          if (match) {
            publicBalance = BigInt(match[1]);
          }
        }

        console.log('Parsed public balance:', publicBalance.toString());
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

        if (records && Array.isArray(records)) {
          console.log('Number of records:', records.length);
          for (let i = 0; i < records.length; i++) {
            const record = records[i];
            console.log(`Record ${i}:`, JSON.stringify(record, null, 2));

            // Try multiple possible field names and structures
            let amount = 0n;

            // Direct microcredits field
            if (record.microcredits) {
              const cleanAmount = String(record.microcredits)
                .replace('u64.private', '')
                .replace('u64', '')
                .replace(/[^\d]/g, '');
              if (cleanAmount) amount = BigInt(cleanAmount);
              console.log(`Record ${i} microcredits:`, amount.toString());
            }
            // Nested in data object
            else if (record.data?.microcredits) {
              const cleanAmount = String(record.data.microcredits)
                .replace('u64.private', '')
                .replace('u64', '')
                .replace(/[^\d]/g, '');
              if (cleanAmount) amount = BigInt(cleanAmount);
              console.log(`Record ${i} data.microcredits:`, amount.toString());
            }
            // Plaintext field (some wallets return this format)
            else if (record.plaintext) {
              const match = String(record.plaintext).match(/microcredits:\s*(\d+)u64/);
              if (match) {
                amount = BigInt(match[1]);
                console.log(`Record ${i} from plaintext:`, amount.toString());
              }
            }
            // Amount field (alternative naming)
            else if (record.amount) {
              const cleanAmount = String(record.amount).replace(/[^\d]/g, '');
              if (cleanAmount) amount = BigInt(cleanAmount);
              console.log(`Record ${i} amount:`, amount.toString());
            }

            privateBalance += amount;
          }
        } else if (records && typeof records === 'object') {
          // Maybe it's not an array but a single record or object with records
          console.log('Records is object, keys:', Object.keys(records));
        }
      } catch (err) {
        console.log('Could not fetch private records:', err);
        console.log('Error details:', JSON.stringify(err, null, 2));
        // Private records might require decrypt permission - this is expected
        // if user didn't grant AutoDecrypt permission
      }

      console.log('Leo Wallet balance:', { public: publicBalance, private: privateBalance });
      return { public: publicBalance, private: privateBalance };
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
      const result = await this.adapter.requestExecution({
        program: request.programId,
        functionName: request.functionName,
        inputs: request.inputs,
        fee: request.fee,
      } as any);

      return (result as any)?.transactionId || '';
    } catch (error: any) {
      throw new Error(error.message || 'Transaction failed');
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
