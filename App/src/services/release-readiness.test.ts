import { describe, expect, it } from "vitest";
import { resolveNetworkName } from "../constants/network";
import {
  isStxAddressForNetwork,
  selectStxAddressForNetwork,
} from "./wallet";
import {
  canOfferRating,
  CommerceJob,
  jobPermissions,
  RatingAvailability,
} from "./commerce";

const MAINNET = "SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH";
const TESTNET = "ST2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPJG0N53H";

describe("network configuration", () => {
  it("defaults to mainnet only when no value is configured", () => {
    expect(resolveNetworkName()).toBe("mainnet");
    expect(resolveNetworkName("mainnet")).toBe("mainnet");
    expect(resolveNetworkName("testnet")).toBe("testnet");
  });

  it("rejects misspelled or unsupported networks", () => {
    expect(() => resolveNetworkName("test")).toThrow(
      'must be "mainnet" or "testnet"'
    );
  });
});

describe("wallet address selection", () => {
  const addresses = [{ address: MAINNET }, { address: TESTNET }];

  it("recognizes the address prefixes for each Stacks network", () => {
    expect(isStxAddressForNetwork(MAINNET, "mainnet")).toBe(true);
    expect(isStxAddressForNetwork(TESTNET, "testnet")).toBe(true);
    expect(isStxAddressForNetwork(MAINNET, "testnet")).toBe(false);
    expect(isStxAddressForNetwork(TESTNET, "mainnet")).toBe(false);
  });

  it("selects the address matching the configured network", () => {
    expect(selectStxAddressForNetwork(addresses, "mainnet")).toBe(MAINNET);
    expect(selectStxAddressForNetwork(addresses, "testnet")).toBe(TESTNET);
  });

  it("returns no address when the wallet only exposes another network", () => {
    expect(
      selectStxAddressForNetwork([{ address: MAINNET }], "testnet")
    ).toBe("");
  });
});

describe("consumed rating actions", () => {
  const completedJob: CommerceJob = {
    id: 1,
    client: MAINNET,
    provider: "SP000000000000000000002Q6VF78",
    evaluator: "SP000000000000000000002Q6VF79",
    description: "Release-readiness test",
    budget: 1_000_000,
    expiredAt: 1_000,
    status: 3,
    currency: "stx",
  };

  it("grants rating permission only to a completed job's client or evaluator", () => {
    expect(jobPermissions(completedJob, MAINNET).canRate).toBe(true);
    expect(
      jobPermissions(completedJob, "SP000000000000000000002Q6VF70").canRate
    ).toBe(false);
  });

  it.each<RatingAvailability>([
    "checking",
    "rated",
    "unavailable",
  ])("does not offer rating while its state is %s", (state) => {
    expect(canOfferRating(true, state)).toBe(false);
  });

  it("offers rating only after the on-chain check reports it available", () => {
    expect(canOfferRating(true, "available")).toBe(true);
    expect(canOfferRating(false, "available")).toBe(false);
  });
});
