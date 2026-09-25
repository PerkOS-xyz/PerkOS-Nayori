/**
 * Small time-based cache for an expensive async read: one loader call per TTL for every caller,
 * concurrent callers share the in-flight promise, and when a fresh read fails the last good
 * value is served (marked stale) for up to `staleMs`. Used for the transparency snapshot so
 * /evidence, /participants and the JSON endpoints stop hammering Hiro's public API.
 */
export interface CachedValue<T> {
  value: T;
  /** When the value was actually read from its source. */
  readAt: Date;
  /** `fresh`: read now; `cached`: within the TTL; `stale`: a fresh read failed, served the last good value. */
  status: "fresh" | "cached" | "stale";
}

export interface TtlCacheOptions<T> {
  ttlMs: number;
  staleMs: number;
  load: () => Promise<T>;
  now?: () => number;
}

export function createTtlCache<T>({ ttlMs, staleMs, load, now = Date.now }: TtlCacheOptions<T>) {
  let last: { value: T; at: number } | null = null;
  let inflight: Promise<{ value: T; at: number }> | null = null;

  async function get(): Promise<CachedValue<T>> {
    const t = now();
    if (last && t - last.at < ttlMs) return { value: last.value, readAt: new Date(last.at), status: "cached" };
    if (!inflight) {
      inflight = load()
        .then((value) => {
          last = { value, at: now() };
          return last;
        })
        .finally(() => {
          inflight = null;
        });
    }
    try {
      const read = await inflight;
      return { value: read.value, readAt: new Date(read.at), status: "fresh" };
    } catch (error) {
      if (last && t - last.at < staleMs) return { value: last.value, readAt: new Date(last.at), status: "stale" };
      throw error;
    }
  }

  return { get, clear: () => { last = null; } };
}
