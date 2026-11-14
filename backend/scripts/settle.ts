// Reading back what a transaction just wrote. The RPC sits behind a load balancer, so the node answering the read
// can still be a block behind the node that ran the transaction, and the owner scripts would show the old value.

export interface SettleOptions {
  /** Reads in all, the first included (default 10). */
  tries?: number;
  /** Pause between reads (default 1000 ms). */
  delayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

/** Reads until `done` holds or the tries run out, and returns the last value read. */
export async function settled<T>(read: () => Promise<T>, done: (value: T) => boolean, opts: SettleOptions = {}): Promise<T> {
  const tries = opts.tries ?? 10;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let value = await read();
  for (let i = 1; i < tries && !done(value); i++) {
    await sleep(opts.delayMs ?? 1000);
    value = await read();
  }
  return value;
}
