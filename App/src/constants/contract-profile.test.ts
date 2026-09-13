import { afterEach, describe, expect, it, vi } from "vitest";

const MAINNET = {
  NEXT_PUBLIC_STACKS_NETWORK: "mainnet",
  NEXT_PUBLIC_CONTRACT_ADDRESS: "SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH",
  NEXT_PUBLIC_CONTRACT_PROFILE: "current-v6-v5",
  NEXT_PUBLIC_STX_COMMERCE_CONTRACT: "agentic-commerce-v6",
  NEXT_PUBLIC_SBTC_COMMERCE_CONTRACT: "sbtc-commerce-v5",
  NEXT_PUBLIC_REPUTATION_CONTRACT: "reputation-registry-v3",
  NEXT_PUBLIC_NAYORI_EVALUATOR_ADDRESS: "SP2ENKFX2BGX94HC4KYZCCV7KEN7JXJXZDKC3GPGC",
  NEXT_PUBLIC_NAYORI_MANAGED_EVALUATOR_ENABLED: "false",
  NEXT_PUBLIC_NAYORI_APPEAL_AUTHORITY_ADDRESS: "SP28DBK3Q89F4KRYGPF51QT0RYEZBPXS4BAQ0ETBH",
} as const;

async function load(overrides: Record<string, string> = {}) {
  for (const [name, value] of Object.entries({ ...MAINNET, ...overrides })) {
    vi.stubEnv(name, value);
  }
  vi.resetModules();
  return import("./contract");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("reviewed contract profiles", () => {
  it("defaults mainnet consumers to the exact writable v6/v5 generation", async () => {
    const config = await load();
    expect(config.CONTRACT_PROFILE).toBe("current-v6-v5");
    expect(config.STX_COMMERCE_CONTRACT_NAME).toBe("agentic-commerce-v6");
    expect(config.SBTC_COMMERCE_CONTRACT_NAME).toBe("sbtc-commerce-v5");
    expect(config.COMMERCE_CONTRACTS_READ_ONLY).toBe(false);
    expect(config.NAYORI_MANAGED_EVALUATOR_ENABLED).toBe(false);
    expect(() => config.assertCommerceContractsWritable()).not.toThrow();
  });

  it("enables the exact pinned evaluator only in explicit QA configuration", async () => {
    const config = await load({
      NEXT_PUBLIC_STACKS_NETWORK: "testnet",
      NEXT_PUBLIC_CONTRACT_ADDRESS: "ST16EWRC01S1SFWGBP63MW47VY8P3AYFA8VGEBGE5",
      NEXT_PUBLIC_NAYORI_EVALUATOR_ADDRESS: "STBTXHXFXFGMNPXST7A6XQ1WNGC0V6TB6CDDQZB4",
      NEXT_PUBLIC_NAYORI_APPEAL_AUTHORITY_ADDRESS: "ST256E5DAXM7RDFZ76ECCTPTBYHRXXJQ29H16DN69",
      NEXT_PUBLIC_NAYORI_MANAGED_EVALUATOR_ENABLED: "true",
    });
    expect(config.NAYORI_MANAGED_EVALUATOR_ENABLED).toBe(true);
  });

  it("permits exact historical reads but rejects every commerce write", async () => {
    const config = await load({
      NEXT_PUBLIC_CONTRACT_PROFILE: "legacy-v5-v4-read",
      NEXT_PUBLIC_STX_COMMERCE_CONTRACT: "agentic-commerce-v5",
      NEXT_PUBLIC_SBTC_COMMERCE_CONTRACT: "sbtc-commerce-v4",
      NEXT_PUBLIC_REPUTATION_CONTRACT: "reputation-registry-v3",
    });
    expect(config.COMMERCE_CONTRACTS_READ_ONLY).toBe(true);
    expect(() => config.assertCommerceContractsWritable()).toThrow("historical and read-only");
  });

  it("fails closed on a crossed deployer or mixed generation", async () => {
    await expect(load({ NEXT_PUBLIC_CONTRACT_ADDRESS: "ST16EWRC01S1SFWGBP63MW47VY8P3AYFA8VGEBGE5" }))
      .rejects.toThrow("does not match mainnet");
    await expect(load({ NEXT_PUBLIC_STX_COMMERCE_CONTRACT: "agentic-commerce-v5" }))
      .rejects.toThrow("does not match current-v6-v5");
  });

  it("fails closed on unreviewed evaluator or appeal authority identities", async () => {
    await expect(load({
      NEXT_PUBLIC_NAYORI_EVALUATOR_ADDRESS: "SP000000000000000000002Q6VF78",
    })).rejects.toThrow("not the reviewed mainnet evaluator");
    await expect(load({
      NEXT_PUBLIC_NAYORI_APPEAL_AUTHORITY_ADDRESS: "SP000000000000000000002Q6VF78",
    })).rejects.toThrow("not the reviewed mainnet authority");
  });

  it("rejects an unsupported managed-evaluator activation claim on mainnet", async () => {
    await expect(load({ NEXT_PUBLIC_NAYORI_MANAGED_EVALUATOR_ENABLED: "true" }))
      .rejects.toThrow("cannot be advertised active on mainnet");
  });
});
