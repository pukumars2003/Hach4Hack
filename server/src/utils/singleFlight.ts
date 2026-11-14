export interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  /** Cache version this entry was computed under; a mismatch means it is stale. */
  version: number;
}

/**
 * Serialized board payload plus the reusable wire pieces. Keeping a prebuilt
 * Buffer and header blocks means the hot HTTP path never re-encodes the JSON
 * string or re-measures its byte length per request.
 */
export interface SerializedEntry extends CacheEntry<string> {
  buffer: Buffer;
  headersHit: Record<string, string | number>;
  headersStale: Record<string, string | number>;
}

export class SingleFlightCache {
  private inFlight: Map<string, Promise<any>> = new Map();
  private cache: Map<string, CacheEntry<any>> = new Map();
  private serialized: Map<string, SerializedEntry> = new Map();
  private ttlMs: number;
  private serializedTtlMs: number;
  private serializedStaleMs: number;
  private readonly maxEntries: number;
  private version = 0;

  constructor(
    ttlMs: number = 1000,
    maxEntries: number = 500,
    serializedTtlMs: number = ttlMs,
    serializedStaleMs: number = 30000
  ) {
    this.ttlMs = ttlMs;
    this.serializedTtlMs = serializedTtlMs;
    this.serializedStaleMs = serializedStaleMs;
    this.maxEntries = maxEntries;
  }

  /**
   * Returns a pre-serialized entry, including entries that are expired but
   * still inside the stale window. The HTTP layer uses this to serve stale
   * content immediately while a background refresh runs.
   */
  public getSerializedEntry(key: string): SerializedEntry | undefined {
    const entry = this.serialized.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt + this.serializedStaleMs <= Date.now()) {
      this.serialized.delete(key);
      return undefined;
    }
    return entry;
  }

  /**
   * Synchronous read of a fresh pre-serialized response body. This is the hot
   * path for the board endpoint: it avoids the async single-flight machinery and
   * repeated JSON.stringify work for every request in the TTL window.
   */
  public getSerialized(key: string): string | undefined {
    const entry = this.getSerializedEntry(key);
    return entry && entry.expiresAt > Date.now() ? entry.data : undefined;
  }

  public setSerialized(
    key: string,
    body: string,
    version?: number,
    baseHeaders: Record<string, string | number> = {}
  ): void {
    // A write that lands while a query is in flight must not let the older
    // result repopulate the cache after invalidation.
    if (version !== undefined && version !== this.version) return;
    if (this.serialized.size >= this.maxEntries) this.prune(this.serialized);

    const buffer = Buffer.from(body, 'utf8');
    const headers: Record<string, string | number> = {
      ...baseHeaders,
      'content-length': buffer.length,
    };
    this.serialized.set(key, {
      data: body,
      buffer,
      expiresAt: Date.now() + this.serializedTtlMs,
      version: version ?? this.version,
      headersHit: { ...headers, 'x-cache': 'HIT' },
      headersStale: { ...headers, 'x-cache': 'STALE' },
    });
  }

  /** Monotonic cache version, bumped on every invalidation. */
  public getVersion(): number {
    return this.version;
  }

  private prune(map: Map<string, CacheEntry<any>>): void {
    const now = Date.now();
    for (const [key, value] of map) {
      if (value.expiresAt <= now || map.size >= this.maxEntries) {
        map.delete(key);
      }
    }
  }

  /**
   * Coalesces concurrent identical calls to a single execution,
   * and serves cached responses within the TTL window.
   *
   * Entries are tagged with the version they were computed under, so an
   * invalidation that lands while a query is in flight cannot be overwritten by
   * the older result when that query finally resolves. In-flight work is keyed by
   * `key@version` for the same reason: a caller that arrives after a write must
   * not join a query that started before it, or it would be handed the pre-write
   * board even though that result is never stored in the cache.
   */
  public async do<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const version = this.version;

    // 1. Check TTL cache
    const existing = this.cache.get(key);
    if (existing && existing.version === version && existing.expiresAt > now) {
      return existing.data as T;
    }

    // 2. Check if an identical query is in flight under the current version.
    const flightKey = `${key}@${version}`;
    const flight = this.inFlight.get(flightKey);
    if (flight) {
      return flight as Promise<T>;
    }

    // 3. Initiate single-flight execution
    const promise = (async () => {
      try {
        const result = await fn();
        // A write that landed during the query wins: do not repopulate.
        if (version === this.version) {
          if (this.cache.size >= this.maxEntries) this.prune(this.cache);
          this.cache.set(key, {
            data: result,
            expiresAt: Date.now() + this.ttlMs,
            version,
          });
        }
        return result;
      } finally {
        this.inFlight.delete(flightKey);
      }
    })();

    this.inFlight.set(flightKey, promise);
    return promise;
  }

  /**
   * Clears cached board reads. Always takes effect.
   *
   * An earlier revision coalesced these wipes to one per 500 ms, which silently
   * dropped invalidations that arrived inside the window: a write could commit
   * and then leave the cache serving the pre-write board for the rest of its TTL.
   * Clearing two bounded maps is cheap, so correctness wins over the micro saving.
   *
   * The SSE/LISTEN path calls this before it broadcasts, so a client that
   * refetches in response to an event cannot be served the pre-change copy.
   */
  public invalidate(prefix?: string) {
    this.version++;

    if (!prefix) {
      this.cache.clear();
      this.serialized.clear();
      return;
    }
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
    for (const key of this.serialized.keys()) {
      if (key.startsWith(prefix)) {
        this.serialized.delete(key);
      }
    }
  }

  /** Kept for call-site symmetry with the LISTEN handler. */
  public invalidateNow(prefix?: string) {
    this.invalidate(prefix);
  }
}

export const boardCache = new SingleFlightCache(1000, 500, 5000, 30000); // 1s DB cache, 5s fresh HTTP cache, 30s stale window

