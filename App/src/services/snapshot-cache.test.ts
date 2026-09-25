import { describe, expect, it } from "vitest";
import { createTtlCache } from "./snapshot-cache";

describe("ttl cache with stale fallback", () => {
  it("loads once per ttl, shares in-flight reads and serves the last good value when a read fails", async () => {
    let clock = 1_000_000;
    let calls = 0;
    let fail = false;
    const cache = createTtlCache<number>({
      ttlMs: 60_000,
      staleMs: 30 * 60_000,
      now: () => clock,
      load: async () => {
        calls += 1;
        if (fail) throw new Error("429");
        return calls;
      },
    });
    const [a, b] = await Promise.all([cache.get(), cache.get()]);
    expect(calls).toBe(1);
    expect(a.status).toBe("fresh");
    expect(b.value).toBe(1);
    clock += 30_000;
    expect((await cache.get()).status).toBe("cached");
    expect(calls).toBe(1);
    clock += 31_000;
    fail = true;
    const stale = await cache.get();
    expect(calls).toBe(2);
    expect(stale.status).toBe("stale");
    expect(stale.value).toBe(1);
    expect(stale.readAt.getTime()).toBe(1_000_000);
    clock += 31 * 60_000;
    await expect(cache.get()).rejects.toThrow("429");
    fail = false;
    expect((await cache.get()).value).toBe(4);
  });
});
