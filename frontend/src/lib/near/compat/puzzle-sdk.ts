// Stands in for @puzzlehq/sdk (an Aleo wallet SDK). Nothing here connects on NEAR.
/* eslint-disable @typescript-eslint/no-explicit-any */
export type EventType = string;
const unavailable = async (..._args: unknown[]): Promise<any> => {
  throw new Error('Puzzle Wallet is an Aleo wallet and is not available on NEAR.');
};
export const connect = unavailable;
export const disconnect = async (): Promise<void> => undefined;
export const getBalance = unavailable;
export const getRecords = async (..._args: unknown[]): Promise<any> => ({ records: [] });
export const requestCreateEvent = unavailable;
export const getAccount = async (): Promise<any> => ({});
