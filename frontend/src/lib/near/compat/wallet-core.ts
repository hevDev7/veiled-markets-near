// Stands in for @provablehq/aleo-wallet-adaptor-core (only the enum the app imports).
export enum DecryptPermission {
  NoDecrypt = 'NO_DECRYPT',
  UponRequest = 'UPON_REQUEST',
  AutoDecrypt = 'AUTO_DECRYPT',
  OnChainHistory = 'ON_CHAIN_HISTORY',
}
