import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

describe("GET /api/health", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reports the isolated testnet runtime accurately", async () => {
    vi.stubEnv("NEXT_PUBLIC_STACKS_NETWORK", "testnet");
    vi.stubEnv("NAYORI_RELEASE_SHA", "qa-release-sha");

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "ok",
      service: "nayori-web",
      network: "testnet",
      release: "qa-release-sha",
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("defaults safely to mainnet when no testnet runtime is declared", async () => {
    vi.stubEnv("NEXT_PUBLIC_STACKS_NETWORK", "mainnet");

    const response = await GET();

    expect(await response.json()).toMatchObject({ network: "mainnet" });
  });
});
