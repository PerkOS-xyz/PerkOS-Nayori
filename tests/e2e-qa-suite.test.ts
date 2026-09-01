import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const manifest = JSON.parse(readFileSync(resolve(process.cwd(), "tests/e2e/qa-suite.json"), "utf8"));

describe("Nayori QA full-system manifest", () => {
  it("defines exactly 20 unique, testnet-only cases", () => {
    expect(manifest.network).toBe("testnet");
    expect(manifest.chainId).toBe(2_147_483_648);
    expect(manifest.cases).toHaveLength(20);
    expect(new Set(manifest.cases.map((item: { id: string }) => item.id)).size).toBe(20);
    expect(Object.values(manifest.origins).every((origin) => {
      const hostname = new URL(origin as string).hostname;
      return hostname === "qa.nayori.ai" || hostname.endsWith(".qa.nayori.ai");
    })).toBe(true);
    expect(Object.values(manifest.contracts).every(
      (contract) => (contract as string).startsWith("ST16EWRC01S1SFWGBP63MW47VY8P3AYFA8VGEBGE5.")
    )).toBe(true);
  });

  it("keeps the approved 12/4/4 coverage split", () => {
    expect(manifest.cases.filter((item: { group: string }) => item.group === "contract")).toHaveLength(12);
    expect(manifest.cases.filter((item: { group: string }) => ["identity", "sdk"].includes(item.group))).toHaveLength(4);
    expect(manifest.cases.filter((item: { group: string }) => item.group === "payment")).toHaveLength(4);
  });
});
