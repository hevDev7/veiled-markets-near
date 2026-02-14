// ============================================================================
// ALEO PROVER WEB WORKER
// ============================================================================
// Uses @provablehq/sdk ProgramManager to execute transactions in a Web Worker
// with multi-threaded WASM proving. This bypasses browser wallet prover limits.
// ============================================================================

// Message types
interface ExecuteRequest {
  type: 'execute';
  id: string;
  privateKey: string;
  programName: string;
  functionName: string;
  inputs: string[];
  fee: number;
  endpoint: string;
}

interface InitRequest {
  type: 'init';
  id: string;
}

type WorkerRequest = ExecuteRequest | InitRequest;

interface WorkerResponse {
  id: string;
  type: 'success' | 'error' | 'progress' | 'ready';
  data?: string;
  error?: string;
  message?: string;
}

let isInitialized = false;
let sdk: any = null;

function respond(response: WorkerResponse) {
  self.postMessage(response);
}

async function loadSdk() {
  if (!sdk) {
    sdk = await import('@provablehq/sdk');
  }
  return sdk;
}

async function initialize(id: string) {
  if (isInitialized) {
    respond({ id, type: 'ready', message: 'WASM already initialized' });
    return;
  }

  try {
    respond({ id, type: 'progress', message: 'Initializing WASM...' });
    const { initializeWasm } = await loadSdk();
    await initializeWasm();
    isInitialized = true;
    respond({ id, type: 'ready', message: 'WASM initialized successfully' });
  } catch (err: any) {
    respond({ id, type: 'error', error: `WASM init failed: ${err?.message || err}` });
  }
}

async function executeTransaction(request: ExecuteRequest) {
  const { id, privateKey, programName, functionName, inputs, fee, endpoint } = request;

  try {
    const {
      Account,
      ProgramManager,
      AleoKeyProvider,
      AleoNetworkClient,
      NetworkRecordProvider,
      initializeWasm,
      PrivateKey,
    } = await loadSdk();

    if (!isInitialized) {
      respond({ id, type: 'progress', message: 'Initializing WASM...' });
      await initializeWasm();
      isInitialized = true;
    }

    respond({ id, type: 'progress', message: 'Setting up account...' });

    // Create account from private key
    const account = new Account({ privateKey });

    // Set up providers
    const networkClient = new AleoNetworkClient(endpoint);
    const keyProvider = new AleoKeyProvider();
    keyProvider.useCache = true;
    const recordProvider = new NetworkRecordProvider(account, networkClient);

    // Create ProgramManager
    const programManager = new ProgramManager(endpoint, keyProvider, recordProvider);
    programManager.setAccount(account);

    respond({ id, type: 'progress', message: 'Generating ZK proof (this may take 2-5 minutes)...' });

    // Execute the transaction
    const result = await programManager.execute({
      programName,
      functionName,
      fee,
      privateFee: false,
      inputs,
      privateKey: PrivateKey.from_string(privateKey),
    });

    if (result instanceof Error) {
      throw result;
    }

    respond({ id, type: 'success', data: result as string });
  } catch (err: any) {
    const errorMsg = err?.message || String(err);
    respond({ id, type: 'error', error: errorMsg });
  }
}

// Handle incoming messages
self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;

  switch (request.type) {
    case 'init':
      await initialize(request.id);
      break;
    case 'execute':
      await executeTransaction(request);
      break;
    default:
      respond({ id: (request as any).id || '0', type: 'error', error: 'Unknown request type' });
  }
};
