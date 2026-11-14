interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

export class SingleFlightCache {
  private inFlight: Map<string, Promise<any>> = new Map();
  private cache: Map<string, CacheEntry<any>> = new Map();
  private ttlMs: number;

  constructor(ttlMs: number = 1000) {
    this.ttlMs = ttlMs;
  }

  /**
   * Coalesces concurrent identical calls to a single execution,
   * and serves cached responses within the TTL window.
   */
  public async do<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const now = Date.now();

    // 1. Check TTL cache
    const existing = this.cache.get(key);
    if (existing && existing.expiresAt > now) {
      return existing.data as T;
    }

    // 2. Check if identical query is currently in-flight
    const flight = this.inFlight.get(key);
    if (flight) {
      return flight as Promise<T>;
    }

    // 3. Initiate single-flight execution
    const promise = (async () => {
      try {
        const result = await fn();
        this.cache.set(key, {
          data: result,
          expiresAt: Date.now() + this.ttlMs,
        });
        return result;
      } finally {
        this.inFlight.delete(key);
      }
    })();

    this.inFlight.set(key, promise);
    return promise;
  }

  private lastInvalidate = 0;

  public invalidate(prefix?: string) {
    const now = Date.now();
    // Throttle complete cache wipes to at most once per 500ms under extreme write bursts
    if (now - this.lastInvalidate < 500) {
      return;
    }
    this.lastInvalidate = now;

    if (!prefix) {
      this.cache.clear();
      return;
    }
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }
}

export const boardCache = new SingleFlightCache(1000); // 1-second cache

