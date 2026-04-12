// ============================================================================
// VEILED MARKETS SDK - Transaction Executor
// ============================================================================
// Full transaction submission flow for Node.js backends (bots, schedulers,
// indexers, operator services). Wraps `snarkos developer execute` as a
// child process and returns the resulting Aleo tx id.
//
// Browser apps should use a WalletAdapter (Shield/Puzzle/Leo) instead —
// wallet extensions handle proof generation in-browser without needing
// a local snarkos binary or the operator's private key.
//
// This executor is the SAME pattern the operator backend uses in
// `veiled-markets/backend/src/pyth-oracle.ts`. It's battle-tested against
// testnet and handles the flaky-Cloudflare retry loop out of the box.
// ============================================================================

import { spawn, type ChildProcess } from 'node:child_process';

export interface NodeExecutorConfig {
  /** Aleo private key for the signer (APrivateKey1zkp...). Required. */
  privateKey: string;
  /** Query endpoint (mapping reads, state root). Default: Provable testnet. */
  queryEndpoint?: string;
  /** Full broadcast URL (not just base — include /testnet/transaction/broadcast). */
  broadcastUrl?: string;
  /** Priority fee in microcredits. Default: 1_000_000 (1 ALEO). */
  priorityFee?: string | number;
  /** '0' for mainnet, '1' for testnet. Default: '1' (testnet). */
  networkId?: '0' | '1';
  /** Max retry attempts for transient failures. Default: 5. */
  maxRetries?: number;
  /** Base retry delay in ms (exponential backoff applied). Default: 4000. */
  retryBaseMs?: number;
  /** If true, just log the inputs without broadcasting. Default: false. */
  dryRun?: boolean;
}

export interface NodeExecResult {
  /** Aleo transaction id (at1...) from the broadcast response. */
  txId: string;
  /** First `...field` output from the transition, if any (e.g. market_id). */
  firstFieldOutput?: string;
  /** Full stdout from snarkos — useful for debugging. */
  raw: string;
}

/**
 * NodeExecutor — spawns `snarkos developer execute` to broadcast a
 * transaction from a Node.js backend. Handles retry on transient
 * Cloudflare/network errors with exponential backoff.
 *
 * Usage:
 *   const executor = new NodeExecutor({
 *     privateKey: process.env.OPERATOR_PRIVATE_KEY!,
 *   });
 *
 *   const turbo = createTurboClient();
 *   const call = turbo.buildBuyUpDownInputs({ ... });
 *   const result = await executor.execute(call);
 *   console.log(`Broadcast tx ${result.txId}`);
 *
 * Requires `snarkos` CLI in $PATH. Install per Aleo docs.
 */
export class NodeExecutor {
  private readonly config: Required<NodeExecutorConfig>;

  constructor(config: NodeExecutorConfig) {
    if (!config.privateKey) {
      throw new Error('NodeExecutor requires privateKey');
    }
    this.config = {
      privateKey: config.privateKey,
      queryEndpoint: config.queryEndpoint ?? 'https://api.explorer.provable.com/v1',
      broadcastUrl: config.broadcastUrl ?? 'https://api.explorer.provable.com/v1/testnet/transaction/broadcast',
      priorityFee: String(config.priorityFee ?? '1000000'),
      networkId: config.networkId ?? '1',
      maxRetries: config.maxRetries ?? 5,
      retryBaseMs: config.retryBaseMs ?? 4000,
      dryRun: config.dryRun ?? false,
    };
  }

  /**
   * Execute a transaction call built by one of the SDK clients
   * (VeiledMarketsClient.buildBuySharesInputs, TurboClient.buildBuyUpDownInputs,
   * etc). Returns the Aleo tx id on success, throws on final failure.
   */
  async execute(call: {
    programId: string;
    functionName: string;
    inputs: string[];
  }): Promise<NodeExecResult> {
    if (this.config.dryRun) {
      console.log(`[executor] DRY_RUN ${call.programId}/${call.functionName}`, call.inputs);
      return { txId: `dryrun_${Date.now()}`, raw: 'dry-run' };
    }

    const { maxRetries, retryBaseMs } = this.config;
    let lastErr: unknown = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.executeOnce(call);
      } catch (err: unknown) {
        lastErr = err;
        const msg = (err as { message?: string })?.message ?? String(err);
        if (!isRetryable(msg) || attempt === maxRetries) {
          throw err;
        }
        const delayMs = Math.min(retryBaseMs * 2 ** (attempt - 1), 60_000);
        const jitter = Math.floor(Math.random() * 1000);
        console.warn(
          `[executor] attempt ${attempt}/${maxRetries} failed, retrying in ${((delayMs + jitter) / 1000).toFixed(1)}s:\n${msg.slice(0, 400)}`,
        );
        await new Promise((r) => setTimeout(r, delayMs + jitter));
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }

  /** Single snarkos invocation, no retry logic. */
  private executeOnce(call: {
    programId: string;
    functionName: string;
    inputs: string[];
  }): Promise<NodeExecResult> {
    const args = [
      'developer', 'execute',
      '--endpoint', this.config.queryEndpoint,
      '--broadcast', this.config.broadcastUrl,
      '--private-key', this.config.privateKey,
      '--priority-fee', String(this.config.priorityFee),
      '--network', this.config.networkId,
      call.programId,
      call.functionName,
      ...call.inputs,
    ];

    return new Promise((resolve, reject) => {
      let child: ChildProcess;
      try {
        child = spawn('snarkos', args, { stdio: ['ignore', 'pipe', 'pipe'] });
      } catch (err: unknown) {
        const msg = (err as { message?: string })?.message ?? String(err);
        reject(new Error(
          `Failed to spawn 'snarkos'. Is it installed and in $PATH? ${msg}`,
        ));
        return;
      }

      let stdout = '';
      let stderr = '';
      child.stdout?.on('data', (b: Buffer) => { stdout += b.toString(); });
      child.stderr?.on('data', (b: Buffer) => { stderr += b.toString(); });

      child.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`snarkos exit ${code}: ${stderr.trim()}`));
          return;
        }
        // Parse tx id from stdout (format: "at1<62 chars>")
        const txMatch = stdout.match(/at1[a-z0-9]{50,}/);
        if (!txMatch) {
          reject(new Error(`no tx id in stdout: ${stdout.trim()}`));
          return;
        }
        // Optional: parse first "...field" output as firstFieldOutput
        const fieldMatch = stdout.match(/(\d+field)/);
        resolve({
          txId: txMatch[0],
          firstFieldOutput: fieldMatch?.[1],
          raw: stdout,
        });
      });

      child.on('error', (err) => {
        reject(new Error(`snarkos spawn error: ${err.message}`));
      });
    });
  }
}

export function createNodeExecutor(config: NodeExecutorConfig): NodeExecutor {
  return new NodeExecutor(config);
}

function isRetryable(msg: string): boolean {
  return (
    msg.includes('522') ||
    msg.includes('502') ||
    msg.includes('503') ||
    msg.includes('504') ||
    msg.includes('524') ||
    msg.includes('429') ||
    msg.includes('HTTP POST request') ||
    msg.includes('cloudflare') ||
    msg.includes('<!DOCTYPE html>') ||
    msg.includes('timeout') ||
    msg.includes('ECONNRESET') ||
    msg.includes('ETIMEDOUT') ||
    msg.includes('Failed to fetch') ||
    msg.includes('VM failed to execute') ||
    msg.includes('Failed to broadcast')
  );
}
