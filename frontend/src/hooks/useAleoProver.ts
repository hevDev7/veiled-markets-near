// ============================================================================
// USE ALEO PROVER HOOK
// ============================================================================
// React hook for in-browser ZK proving using @provablehq/sdk ProgramManager.
// Loads SDK lazily on first use. WASM uses internal threads for parallelism.
// ============================================================================

import { useState, useRef, useCallback } from 'react';

export type ProverStatus = 'idle' | 'initializing' | 'proving' | 'success' | 'error';

interface UseAleoProverReturn {
  status: ProverStatus;
  progress: string;
  txId: string | null;
  error: string | null;
  execute: (params: {
    privateKey: string;
    programName: string;
    functionName: string;
    inputs: string[];
    fee: number;
    endpoint?: string;
  }) => Promise<string>;
  reset: () => void;
}

let sdkModule: any = null;
let wasmInitialized = false;

async function loadSdk() {
  if (!sdkModule) {
    sdkModule = await import('@provablehq/sdk');
  }
  if (!wasmInitialized) {
    await sdkModule.initializeWasm();
    wasmInitialized = true;
  }
  return sdkModule;
}

export function useAleoProver(): UseAleoProverReturn {
  const [status, setStatus] = useState<ProverStatus>('idle');
  const [progress, setProgress] = useState('');
  const [txId, setTxId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(false);

  const execute = useCallback(async (params: {
    privateKey: string;
    programName: string;
    functionName: string;
    inputs: string[];
    fee: number;
    endpoint?: string;
  }): Promise<string> => {
    abortRef.current = false;
    setStatus('initializing');
    setProgress('Loading SDK and initializing WASM...');
    setTxId(null);
    setError(null);

    try {
      const {
        Account,
        ProgramManager,
        AleoKeyProvider,
        AleoNetworkClient,
        NetworkRecordProvider,
        PrivateKey,
      } = await loadSdk();

      if (abortRef.current) throw new Error('Cancelled');

      setStatus('proving');
      setProgress('Setting up account...');

      const endpoint = params.endpoint || 'https://api.explorer.provable.com/v1';

      // Create account from private key
      const account = new Account({ privateKey: params.privateKey });

      // Set up providers
      const networkClient = new AleoNetworkClient(endpoint);
      const keyProvider = new AleoKeyProvider();
      keyProvider.useCache(true);
      const recordProvider = new NetworkRecordProvider(account, networkClient);

      // Create ProgramManager
      const programManager = new ProgramManager(endpoint, keyProvider, recordProvider);
      programManager.setAccount(account);

      setProgress('Generating ZK proof (this may take 2-5 minutes)...');

      // Execute the transaction
      const result = await programManager.execute({
        programName: params.programName,
        functionName: params.functionName,
        priorityFee: params.fee,
        privateFee: false,
        inputs: params.inputs,
        privateKey: PrivateKey.from_string(params.privateKey),
      });

      const txIdResult = result as string;
      setStatus('success');
      setTxId(txIdResult);
      setProgress('Transaction broadcast successfully!');
      return txIdResult;
    } catch (err: any) {
      const errorMsg = err?.message || String(err);
      setStatus('error');
      setError(errorMsg);
      setProgress('');
      throw new Error(errorMsg);
    }
  }, []);

  const reset = useCallback(() => {
    abortRef.current = true;
    setStatus('idle');
    setProgress('');
    setTxId(null);
    setError(null);
  }, []);

  return { status, progress, txId, error, execute, reset };
}
