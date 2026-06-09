import { setTimeout as sleepMs } from "node:timers/promises";

/** Hosts we never throttle (local development) unless explicitly asked. */
function isLocalHost(host: string): boolean {
  const h = host.toLowerCase().replace(/:\d+$/, "");
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "::1" ||
    h === "[::1]" ||
    h.endsWith(".localhost") ||
    h.endsWith(".local")
  );
}

export interface HostThrottleOptions {
  minIntervalMs: number;
  /** Throttle local hosts too (default false). */
  throttleLocalhost?: boolean;
  /** Injectable clock (ms) for tests. */
  now?: () => number;
  /** Injectable sleep for tests. */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Spaces requests to the same host by at least `minIntervalMs`. Calls for a host
 * serialize through a per-host promise chain, so concurrent callers each wait
 * their turn rather than all firing at once. Local hosts are exempt by default.
 */
export class HostThrottle {
  private readonly minIntervalMs: number;
  private readonly throttleLocalhost: boolean;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  /** Per-host tail of the serialization chain. */
  private readonly chains = new Map<string, Promise<void>>();
  /** Per-host timestamp (ms) of the last released slot. */
  private readonly lastAt = new Map<string, number>();

  constructor(options: HostThrottleOptions) {
    this.minIntervalMs = options.minIntervalMs;
    this.throttleLocalhost = options.throttleLocalhost ?? false;
    this.now = options.now ?? (() => Date.now());
    this.sleep = options.sleep ?? ((ms) => sleepMs(ms));
  }

  /** Wait until it is polite to hit `host`. */
  acquire(host: string): Promise<void> {
    if (this.minIntervalMs <= 0 || host === "") return Promise.resolve();
    if (!this.throttleLocalhost && isLocalHost(host)) return Promise.resolve();

    const prev = this.chains.get(host) ?? Promise.resolve();
    const next = prev.then(async () => {
      const last = this.lastAt.get(host);
      const wait = last === undefined ? 0 : this.minIntervalMs - (this.now() - last);
      if (wait > 0) await this.sleep(wait);
      this.lastAt.set(host, this.now());
    });
    // Keep the chain alive even if a waiter rejects upstream.
    this.chains.set(host, next.catch(() => undefined));
    return next;
  }
}
