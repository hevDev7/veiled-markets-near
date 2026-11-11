// Main-thread side of the prover worker.
import { ZK_WASM_URL, ZK_ZKEY_URL } from '../config';

export interface Groth16Proof {
  pi_a: string[];
  pi_b: string[][];
  pi_c: string[];
}

let worker: Worker | null = null;
let seq = 0;
const waiting = new Map<number, { resolve: (v: { proof: Groth16Proof; publicSignals: string[] }) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./prover.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const { id, proof, publicSignals, error } = e.data;
      const w = waiting.get(id);
      if (!w) return;
      waiting.delete(id);
      if (error) w.reject(new Error(`proof failed: ${error}`));
      else w.resolve({ proof, publicSignals });
    };
    worker.onerror = (e) => {
      for (const w of waiting.values()) w.reject(new Error(`prover crashed: ${e.message}`));
      waiting.clear();
      worker = null;
    };
  }
  return worker;
}

const abs = (u: string) => new URL(u, window.location.origin).toString();

export function prove(input: Record<string, unknown>): Promise<{ proof: Groth16Proof; publicSignals: string[] }> {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    getWorker().postMessage({ id, input, wasm: abs(ZK_WASM_URL), zkey: abs(ZK_ZKEY_URL) });
  });
}

/** Starts fetching the proving key early (it is 12 MB) so the first bet does not wait for it. */
export function warmUpProver() {
  for (const u of [ZK_WASM_URL, ZK_ZKEY_URL]) fetch(u, { cache: 'force-cache' }).catch(() => undefined);
}
