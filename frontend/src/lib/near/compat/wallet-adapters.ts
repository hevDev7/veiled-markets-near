// Stands in for the Aleo wallet adapters (Shield, Leo, Fox, Soter). Veiled Markets on NEAR connects NEAR wallets
// through the Wallet Selector, so these never connect; they only keep the legacy wallet manager compiling.
/* eslint-disable @typescript-eslint/no-explicit-any */
class AleoOnlyAdapter {
  [key: string]: any;
  readonly name: string;
  readyState = 'NotDetected';
  connected = false;
  account: { address: string } | null = null;

  constructor(name: string) {
    this.name = name;
  }
  async connect(..._args: unknown[]): Promise<void> {
    throw new Error(`${this.name} is an Aleo wallet. Veiled Markets on NEAR connects Meteor Wallet.`);
  }
  async disconnect(): Promise<void> {}
  async requestRecords(..._args: unknown[]): Promise<unknown[]> {
    return [];
  }
  async executeTransaction(..._args: unknown[]): Promise<any> {
    throw new Error(`${this.name} is not available on NEAR.`);
  }
  async requestTransaction(..._args: unknown[]): Promise<any> {
    throw new Error(`${this.name} is not available on NEAR.`);
  }
  on(..._args: unknown[]): void {}
  off(..._args: unknown[]): void {}
}

export class ShieldWalletAdapter extends AleoOnlyAdapter {
  constructor(_opts?: unknown) {
    super('Shield Wallet');
  }
}
export class LeoWalletAdapter extends AleoOnlyAdapter {
  constructor(_opts?: unknown) {
    super('Leo Wallet');
  }
}
export class FoxWalletAdapter extends AleoOnlyAdapter {
  constructor(_opts?: unknown) {
    super('Fox Wallet');
  }
}
export class SoterWalletAdapter extends AleoOnlyAdapter {
  constructor(_opts?: unknown) {
    super('Soter Wallet');
  }
}
