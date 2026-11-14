// Fixed-window limits for the public market endpoints: a per-client window, and an optional cap per UTC day across
// all clients (the AI budget).
export type LimitResult = { ok: true } | { ok: false; scope: 'client' | 'global'; retryAfterSec: number };

export interface RateLimiterOptions {
  perClient: number;
  clientWindowMs: number;
  globalPerUtcDay?: number;
  now?: () => number;
}

const PRUNE_ABOVE = 10_000;

export class RateLimiter {
  private readonly clients = new Map<string, { start: number; count: number }>();
  private day = '';
  private dayCount = 0;

  constructor(private readonly opts: RateLimiterOptions) {}

  take(client: string): LimitResult {
    const now = this.opts.now ? this.opts.now() : Date.now();
    const today = new Date(now).toISOString().slice(0, 10);
    if (today !== this.day) {
      this.day = today;
      this.dayCount = 0;
    }
    if (this.opts.globalPerUtcDay !== undefined && this.dayCount >= this.opts.globalPerUtcDay) {
      const nextDay = Date.parse(`${today}T00:00:00Z`) + 86_400_000;
      return { ok: false, scope: 'global', retryAfterSec: Math.ceil((nextDay - now) / 1000) };
    }
    const window = this.opts.clientWindowMs;
    let entry = this.clients.get(client);
    if (!entry || now - entry.start >= window) {
      entry = { start: now, count: 0 };
      this.clients.set(client, entry);
    }
    if (entry.count >= this.opts.perClient) {
      return { ok: false, scope: 'client', retryAfterSec: Math.ceil((entry.start + window - now) / 1000) };
    }
    entry.count++;
    this.dayCount++;
    if (this.clients.size > PRUNE_ABOVE) {
      for (const [key, e] of this.clients) if (now - e.start >= window) this.clients.delete(key);
    }
    return { ok: true };
  }
}
