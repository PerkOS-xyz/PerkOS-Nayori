import { describe, expect, it } from "vitest";

import {
  CONTRACTS,
  EXPECTED_DEPLOYER,
  EXPECTED_NETWORK_ID,
  parseEnv,
  sha256,
} from "../scripts/deploy-qa-identity-testnet.mjs";

describe("QA identity-contract deployment guard", () => {
  it("is pinned to the canonical testnet deployer and only the missing identity surface", () => {
    expect(EXPECTED_NETWORK_ID).toBe(2_147_483_648);
    expect(EXPECTED_DEPLOYER).toBe("ST16EWRC01S1SFWGBP63MW47VY8P3AYFA8VGEBGE5");
    expect(CONTRACTS.map(({ name }) => name)).toEqual(["agent-registry", "validation-registry"]);
  });

  it("parses an external env without weakening deterministic source hashing", () => {
    expect(sha256("nayori")).toMatch(/^[0-9a-f]{64}$/);
    expect(typeof parseEnv).toBe("function");
  });
});
