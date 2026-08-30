import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("canonical sBTC network mapping", () => {
  it("uses the unchanged canonical mainnet token", async () => {
    vi.stubEnv("NEXT_PUBLIC_STACKS_NETWORK", "mainnet");

    const { SBTC_TOKEN } = await import("./sbtc");

    expect(SBTC_TOKEN).toBe(
      "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token"
    );
  });

  it("uses the official PoX-5 token on testnet", async () => {
    vi.stubEnv("NEXT_PUBLIC_STACKS_NETWORK", "testnet");

    const { SBTC_TOKEN } = await import("./sbtc");

    expect(SBTC_TOKEN).toBe(
      "SN3VMHXEN64ZZF71JQ5VESXDWTR301XTTXGF4J8F1.sbtc-token"
    );
  });
});
