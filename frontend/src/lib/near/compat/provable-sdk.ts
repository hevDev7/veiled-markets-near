// Stands in for @provablehq/sdk. The Aleo SDK (proving, record decryption, BHP hashing) has no role on NEAR: private
// actions are proven with the Groth16 note circuit in ../notes. Any leftover call fails loudly instead of silently.
/* eslint-disable @typescript-eslint/no-explicit-any */
function unavailable(name: string): any {
  const fail = () => {
    throw new Error(`${name} belongs to the Aleo SDK and is not used on NEAR.`);
  };
  return new Proxy(fail, {
    get: (_t, prop) => (prop === 'then' ? undefined : unavailable(`${name}.${String(prop)}`)),
    apply: fail,
    construct: fail,
  });
}

export const Account: any = unavailable('Account');
export const Address: any = unavailable('Address');
export const AleoKeyProvider: any = unavailable('AleoKeyProvider');
export const AleoNetworkClient: any = unavailable('AleoNetworkClient');
export const BHP256: any = unavailable('BHP256');
export const CREDITS_PROGRAM_KEYS: any = unavailable('CREDITS_PROGRAM_KEYS');
export const Field: any = unavailable('Field');
export const NetworkRecordProvider: any = unavailable('NetworkRecordProvider');
export const Plaintext: any = unavailable('Plaintext');
export const PrivateKey: any = unavailable('PrivateKey');
export const ProgramManager: any = unavailable('ProgramManager');
export const ProvingKey: any = unavailable('ProvingKey');
export const RecordCiphertext: any = unavailable('RecordCiphertext');
export const RecordScanner: any = unavailable('RecordScanner');
export const SealanceMerkleTree: any = unavailable('SealanceMerkleTree');
export const ViewKey: any = unavailable('ViewKey');
export const initThreadPool: any = unavailable('initThreadPool');
