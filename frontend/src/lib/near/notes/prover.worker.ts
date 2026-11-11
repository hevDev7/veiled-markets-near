// Groth16 prover for spend.circom, off the main thread. Loads /zk/spend.wasm and /zk/spend_final.zkey once.
import { groth16 } from 'snarkjs';

self.onmessage = async (e: MessageEvent<{ id: number; input: Record<string, unknown>; wasm: string; zkey: string }>) => {
  const { id, input, wasm, zkey } = e.data;
  try {
    const { proof, publicSignals } = await groth16.fullProve(input, wasm, zkey);
    (self as unknown as Worker).postMessage({ id, proof, publicSignals });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
