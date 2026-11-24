import { describe, expect, it } from "vitest";
import { resolveNextConfig } from "../../constants/nayori-next";
import {
  NEXT_ALLOWANCE_TARGETS,
  allowanceState,
  allowanceSummary,
  allowanceTargetContract,
  allowanceTargetLabel,
  isAllowanceTarget,
  isNextContractPrincipal,
  parseExpiryBlock,
} from "./permissions";

const DEPLOYER = "ST3MRPNX0VNWYRSJ07PNTASE5BZ9K5XE57ARZ39DY";
const MAINNET = "SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH";
const config = resolveNextConfig({}, "testnet");

describe("next permission targets", () => {
  it("offers the four Nayori contracts that accept an allowed helper", () => {
    expect(NEXT_ALLOWANCE_TARGETS.map((target) => target.key)).toEqual(["escrowSbtc", "escrowStx", "applications", "agents"]);
    expect(allowanceTargetContract("escrowStx", config)).toBe(`${DEPLOYER}.nayori-escrow-stx`);
    expect(allowanceTargetLabel("agents")).toBe("Agent registry");
    expect(isAllowanceTarget("roles")).toBe(false);
    expect(() => allowanceTargetContract("roles" as never, config)).toThrow(/Nayori contract/);
  });

  it("accepts only contract principals of the configured network", () => {
    expect(isNextContractPrincipal(`${DEPLOYER}.helper-v1`, "testnet")).toBe(true);
    expect(isNextContractPrincipal(`${MAINNET}.helper`, "mainnet")).toBe(true);
    expect(isNextContractPrincipal(`${MAINNET}.helper`, "testnet")).toBe(false);
    expect(isNextContractPrincipal(DEPLOYER, "testnet")).toBe(false);
    expect(isNextContractPrincipal(`${DEPLOYER}.1bad`, "testnet")).toBe(false);
    expect(isNextContractPrincipal(`${DEPLOYER}.a.b`, "testnet")).toBe(false);
  });
});

describe("next allowance expiry", () => {
  it("treats empty as no expiry and requires a block after the current one", () => {
    expect(parseExpiryBlock("  ", 900_000)).toBeUndefined();
    expect(parseExpiryBlock("900001", 900_000)).toBe(900_001);
    expect(() => parseExpiryBlock("900000", 900_000)).toThrow(/after the current Bitcoin block/);
    expect(() => parseExpiryBlock("12.5", 900_000)).toThrow(/block number/);
    expect(() => parseExpiryBlock("-3", 900_000)).toThrow(/block number/);
    expect(parseExpiryBlock("5", 0)).toBe(5); // height unknown: the wallet still shows the value
    expect(() => parseExpiryBlock("0", 0)).toThrow(/after the current/);
  });

  it("mirrors is-allowed: active below the expiry block, expired from it on", () => {
    expect(allowanceState(null, 900_000)).toBe("not-allowed");
    expect(allowanceState({}, 900_000)).toBe("active");
    expect(allowanceState({ until: 900_001 }, 900_000)).toBe("active");
    expect(allowanceState({ until: 900_000 }, 900_000)).toBe("expired");
    expect(allowanceSummary(null, 1)).toMatch(/^Not allowed/);
    expect(allowanceSummary({}, 1)).toMatch(/no expiry/);
    expect(allowanceSummary({ until: 900_001 }, 900_000)).toBe("Allowed until Bitcoin block 900,001.");
    expect(allowanceSummary({ until: 900_000 }, 900_000)).toMatch(/^Expired at Bitcoin block 900,000/);
  });
});
